/**
 * @fileoverview メール送信サービス
 *
 * Requirements:
 * - 1.3: 招待トークンが生成されると招待メールを送信
 * - 1.6: 招待URLをメール本文に含める
 * - 7.1: パスワードリセット要求でメール送信
 * - 24.3: メール送信失敗時に最大5回リトライ（1分、5分、15分、1時間、6時間）
 *
 * 責任と境界:
 * - 主要責任: メール送信（招待、パスワードリセット、2FA設定完了通知）
 * - ドメイン境界: メールドメイン
 * - データ所有権: なし
 * - トランザクション境界: なし
 *
 * 依存関係:
 * - インバウンド: InvitationService, PasswordService, TwoFactorService
 * - アウトバウンド: なし
 * - 外部: nodemailer, bull, handlebars
 */

import nodemailer, { type Transporter } from 'nodemailer';
import Bull, { type Queue, type Job, type JobOptions } from 'bull';
import Handlebars from 'handlebars';
import logger from '../utils/logger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// __dirnameをESモジュールで取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * メール再送の backoff 戦略名（Bull の settings.backoffStrategies に登録する名前）
 */
const EMAIL_RETRY_BACKOFF_TYPE = 'email-retry-schedule';

/**
 * リトライ遅延（ミリ秒）: 1分、5分、15分、1時間、6時間（要件24.3）
 */
const RETRY_DELAYS: readonly [number, ...number[]] = [
  60 * 1000, // 1分
  5 * 60 * 1000, // 5分
  15 * 60 * 1000, // 15分
  60 * 60 * 1000, // 1時間
  6 * 60 * 60 * 1000, // 6時間
];

/**
 * メールジョブの試行回数: 初回 1 回 + リトライ 5 回
 *
 * 要件24.3「最大5回までリトライ（1分、5分、15分、1時間、6時間後）」は間隔を 5 つ挙げるため、
 * リトライ 5 回（初回を含めない）と読む（design.md の EmailService 節、2026-09-26 タスク35.1 の決定）。
 */
const EMAIL_JOB_ATTEMPTS = 1 + RETRY_DELAYS.length;

/**
 * メール再送の backoff 戦略（要件24.3）
 *
 * Bull 4 は失敗のたびに attemptsMade を 1 増やしてから戦略を呼ぶため、
 * n 回目の失敗の後の待ち時間は RETRY_DELAYS[n − 1] となる（n = 1..5）。
 * 試行回数が EMAIL_JOB_ATTEMPTS のとき範囲外では呼ばれないが、念のため両端に丸める。
 *
 * @param attemptsMade - これまでに失敗した試行の回数
 * @returns 次の試行までの待ち時間（ミリ秒）
 */
function emailRetryBackoff(attemptsMade: number): number {
  const index = Math.min(Math.max(attemptsMade, 1), RETRY_DELAYS.length) - 1;
  return RETRY_DELAYS[index] ?? RETRY_DELAYS[0];
}

/**
 * メールジョブデータ（招待メール）
 */
interface InvitationEmailData {
  to: string;
  invitationToken: string;
}

/**
 * メールジョブデータ（パスワードリセットメール）
 */
interface PasswordResetEmailData {
  to: string;
  resetToken: string;
}

/**
 * メールジョブデータ（2FA有効化メール）
 */
interface TwoFactorEnabledEmailData {
  to: string;
}

/**
 * メールジョブデータ（システム管理者ロール変更アラート）
 */
interface AdminRoleChangedAlertData {
  adminEmails: string[];
  targetUser: {
    email: string;
    displayName: string;
  };
  action: 'assigned' | 'revoked';
  roleName: string;
  performedBy: {
    email: string;
    displayName: string;
  };
}

/**
 * メール送信サービス
 *
 * 非同期メール送信をBullキューで管理し、リトライ機能を提供します。
 */
export class EmailService {
  private transporter: Transporter;
  private emailQueue: Queue;
  private readonly frontendUrl: string;

  constructor(transporter?: Transporter, queue?: Queue) {
    // テスト時は注入されたモックを使用
    if (transporter && queue) {
      this.transporter = transporter;
      this.emailQueue = queue;
      this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      this.registerProcessors();
      return;
    }

    // 本番環境ではnodemailerとbullを初期化
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // SMTP設定
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const smtpConfig: any = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      connectionTimeout: 5000, // 5秒タイムアウト
      greetingTimeout: 5000, // 5秒タイムアウト
    };

    // 認証情報が設定されている場合のみauth を追加
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      smtpConfig.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      };
    }

    logger.info(
      { smtpHost: process.env.SMTP_HOST, smtpPort: process.env.SMTP_PORT },
      'Initializing SMTP transporter'
    );
    this.transporter = nodemailer.createTransport(smtpConfig);

    // Bullキュー設定
    // 再送間隔（要件24.3）はキュー生成時に登録するカスタム backoff 戦略で与える
    this.emailQueue = new Bull('email-queue', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      settings: {
        backoffStrategies: { [EMAIL_RETRY_BACKOFF_TYPE]: emailRetryBackoff },
      },
    });

    this.registerProcessors();
  }

  /**
   * キュープロセッサーを登録
   */
  private registerProcessors(): void {
    // 招待メール処理
    this.emailQueue.process('invitation-email', async (job: Job<InvitationEmailData>) => {
      await this.processInvitationEmail(job.data);
    });

    // パスワードリセットメール処理
    this.emailQueue.process('password-reset-email', async (job: Job<PasswordResetEmailData>) => {
      await this.processPasswordResetEmail(job.data);
    });

    // 2FA有効化メール処理
    this.emailQueue.process('2fa-enabled-email', async (job: Job<TwoFactorEnabledEmailData>) => {
      await this.process2FAEnabledEmail(job.data);
    });

    // システム管理者ロール変更アラート処理
    this.emailQueue.process(
      'admin-role-changed-alert',
      async (job: Job<AdminRoleChangedAlertData>) => {
        await this.processAdminRoleChangedAlert(job.data);
      }
    );
  }

  /**
   * メールジョブの再送オプション（要件24.3）
   *
   * 試行は初回 + リトライ 5 回、間隔はキューに登録した EMAIL_RETRY_BACKOFF_TYPE 戦略が返す。
   */
  private retryJobOptions(): JobOptions {
    return {
      attempts: EMAIL_JOB_ATTEMPTS,
      backoff: { type: EMAIL_RETRY_BACKOFF_TYPE },
    };
  }

  /**
   * 招待メールを送信（非同期キュー）
   *
   * @param to - 送信先メールアドレス
   * @param invitationToken - 招待トークン
   */
  async sendInvitationEmail(to: string, invitationToken: string): Promise<void> {
    await this.emailQueue.add('invitation-email', { to, invitationToken }, this.retryJobOptions());

    logger.info({ to }, 'Invitation email queued');
  }

  /**
   * パスワードリセットメールを送信（非同期キュー）
   *
   * @param to - 送信先メールアドレス
   * @param resetToken - リセットトークン
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    logger.debug(
      { to, resetToken: resetToken.substring(0, 10) + '...' },
      'Queueing password reset email'
    );
    await this.emailQueue.add('password-reset-email', { to, resetToken }, this.retryJobOptions());

    logger.info({ to }, 'Password reset email queued');
  }

  /**
   * 2FA有効化メールを送信（非同期キュー）
   *
   * @param to - 送信先メールアドレス
   */
  async send2FAEnabledEmail(to: string): Promise<void> {
    await this.emailQueue.add('2fa-enabled-email', { to }, this.retryJobOptions());

    logger.info({ to }, '2FA enabled email queued');
  }

  /**
   * システム管理者ロール変更アラートメールを送信（非同期キュー）
   *
   * @param adminEmails - 送信先管理者メールアドレスリスト
   * @param targetUser - 対象ユーザー情報
   * @param action - アクション種別（assigned | revoked）
   * @param roleName - ロール名
   * @param performedBy - 実行者情報
   */
  async sendAdminRoleChangedAlert(
    adminEmails: string[],
    targetUser: { email: string; displayName: string },
    action: 'assigned' | 'revoked',
    roleName: string,
    performedBy: { email: string; displayName: string }
  ): Promise<void> {
    await this.emailQueue.add(
      'admin-role-changed-alert',
      { adminEmails, targetUser, action, roleName, performedBy },
      this.retryJobOptions()
    );

    logger.info({ adminEmails, targetUser, action }, 'Admin role changed alert queued');
  }

  /**
   * 招待メール処理（実際の送信）
   */
  private async processInvitationEmail(data: InvitationEmailData): Promise<void> {
    const { to, invitationToken } = data;
    const invitationUrl = `${this.frontendUrl}/register?token=${invitationToken}`;

    // Handlebarsテンプレート読み込み
    const templatePath = join(__dirname, '../templates/invitation-email.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const html = template({
      invitationUrl,
      frontendUrl: this.frontendUrl,
    });

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@architrack.com',
      to,
      subject: 'ArchiTrackへの招待',
      html,
    });

    logger.info({ to }, 'Invitation email sent successfully');
  }

  /**
   * パスワードリセットメール処理（実際の送信）
   */
  private async processPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const { to, resetToken } = data;
    logger.debug({ to }, 'Processing password reset email');

    const resetUrl = `${this.frontendUrl}/password-reset?token=${resetToken}`;

    // Handlebarsテンプレート読み込み
    const templatePath = join(__dirname, '../templates/password-reset-email.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const html = template({
      resetUrl,
      frontendUrl: this.frontendUrl,
    });

    logger.debug(
      { to, from: process.env.SMTP_FROM || 'noreply@architrack.com' },
      'Sending email via SMTP'
    );
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@architrack.com',
      to,
      subject: 'パスワードリセットのご案内',
      html,
    });

    logger.info({ to }, 'Password reset email sent successfully');
  }

  /**
   * 2FA有効化メール処理（実際の送信）
   */
  private async process2FAEnabledEmail(data: TwoFactorEnabledEmailData): Promise<void> {
    const { to } = data;

    // Handlebarsテンプレート読み込み
    const templatePath = join(__dirname, '../templates/2fa-enabled-email.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const html = template({
      frontendUrl: this.frontendUrl,
    });

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@architrack.com',
      to,
      subject: '二要素認証が有効化されました',
      html,
    });

    logger.info({ to }, '2FA enabled email sent successfully');
  }

  /**
   * システム管理者ロール変更アラートメール処理（実際の送信）
   */
  private async processAdminRoleChangedAlert(data: AdminRoleChangedAlertData): Promise<void> {
    const { adminEmails, targetUser, action, roleName, performedBy } = data;

    // Handlebarsテンプレート読み込み
    const templatePath = join(__dirname, '../templates/admin-role-changed-alert.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const actionText = action === 'assigned' ? '付与' : '剥奪';

    const html = template({
      targetUser,
      action,
      actionText,
      roleName,
      performedBy,
      frontendUrl: this.frontendUrl,
    });

    // 各管理者にメールを送信
    for (const adminEmail of adminEmails) {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@architrack.com',
        to: adminEmail,
        subject: `【重要】システム管理者ロール変更通知: ${targetUser.displayName}`,
        html,
      });

      logger.info(
        { to: adminEmail, targetUser, action },
        'Admin role changed alert sent successfully'
      );
    }
  }
}
