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
 * - 主要責任: メール送信（招待、パスワードリセット、2FA設定完了通知、システム管理者への通知）
 * - ドメイン境界: メールドメイン
 * - データ所有権: なし
 * - トランザクション境界: なし
 *
 * 依存関係:
 * - インバウンド: InvitationService, PasswordService, TwoFactorService, AdminNotificationService
 * - アウトバウンド: なし
 * - 外部: nodemailer, bull, handlebars, Sentry
 */

import nodemailer, { type Transporter } from 'nodemailer';
import Bull, {
  type Queue,
  type Job,
  type JobOptions,
  type QueueOptions,
  type AdvancedSettings,
} from 'bull';
import Handlebars from 'handlebars';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';
import { runtimeMode } from '../config/runtime-mode.js';
import { SESSION_CONFIG } from '../config/security.constants.js';
import { buildInvitationUrl } from '../utils/invitation-token.js';
import { buildPasswordResetUrl } from '../utils/password-reset-token.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// __dirnameをESモジュールで取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * メールキューの名前（Redis のキーは `bull:email-queue:*`）
 */
const EMAIL_QUEUE_NAME = 'email-queue';

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
 * メールキューを作る（要件45.1、45.2）
 *
 * キャッシュ基盤（redis.ts）と同じ REDIS_URL で接続し、認証情報と論理 DB もそこから読む。
 * 完了したジョブは宛先とトークンを含むため、既定で消す。
 * 再送間隔（要件24.3）はキュー生成時に登録するカスタム backoff 戦略で与える。
 *
 * @param redisUrl - 接続先（既定は REDIS_URL。本番では起動前の検査で必須）
 * @param settingsOverrides - 検証からだけ渡すキューの設定（ロックの期間や停止の検査の間隔）。本番は渡さない
 */
export function createEmailQueue(
  redisUrl: string | undefined = process.env.REDIS_URL,
  settingsOverrides: Omit<AdvancedSettings, 'backoffStrategies'> = {}
): Queue {
  const options: QueueOptions = {
    settings: {
      ...settingsOverrides,
      backoffStrategies: { [EMAIL_RETRY_BACKOFF_TYPE]: emailRetryBackoff },
    },
    defaultJobOptions: { removeOnComplete: true },
  };

  if (!redisUrl) {
    logger.warn('REDIS_URL not configured, email queue will connect to the default local Redis');
    return new Bull(EMAIL_QUEUE_NAME, options);
  }

  // Bull は URL のスキームを読まないため、TLS の接続先（rediss）は明示する
  if (redisUrl.startsWith('rediss://')) {
    options.redis = { tls: {} };
  }
  return new Bull(EMAIL_QUEUE_NAME, redisUrl, options);
}

/**
 * メールジョブの再送オプション（要件24.3）
 *
 * 試行は初回 + リトライ 5 回、間隔はキューに登録した EMAIL_RETRY_BACKOFF_TYPE 戦略が返す。
 */
function emailRetryJobOptions(): JobOptions {
  return {
    attempts: EMAIL_JOB_ATTEMPTS,
    backoff: { type: EMAIL_RETRY_BACKOFF_TYPE },
  };
}

/**
 * システム管理者への通知のメールをキューへ入れる（送信の処理は登録しない）
 *
 * EmailService の送信と同じジョブ名・再送オプションで投入する。送信の処理を持たない短命のプロセス
 * （復旧の reactivate-user スクリプト、user-authentication タスク49.4）も通知を出せるように切り出している。
 *
 * @param queue - メールキュー（createEmailQueue）
 * @param to - 送信先（システム管理者 1 名）
 * @param subject - 件名
 * @param lines - 本文の各行（トークン・パスワードを含めない）
 */
export async function enqueueAdminNotificationEmail(
  queue: Pick<Queue, 'add'>,
  to: string,
  subject: string,
  lines: string[]
): Promise<void> {
  await queue.add(
    'admin-notification-email',
    { to, subject, lines } satisfies AdminNotificationEmailData,
    emailRetryJobOptions()
  );

  logger.info({ to }, 'Admin notification email queued');
}

/**
 * ジョブの内容のうち、失敗の記録から伏せる値（トークンと宛先）
 */
const SECRET_JOB_FIELDS = ['invitationToken', 'resetToken'] as const;

/**
 * ジョブの宛先（招待・パスワードリセット・2FA は to、管理者への通知は adminEmails）
 */
function recipientsOf(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const record = data as { to?: unknown; adminEmails?: unknown };
  const candidates = [record.to, ...(Array.isArray(record.adminEmails) ? record.adminEmails : [])];
  return candidates.filter((value): value is string => typeof value === 'string');
}

/**
 * 宛先のドメイン（重複を除く）
 */
function recipientDomainsOf(recipients: readonly string[]): string[] {
  const domains = recipients
    .map((address) => address.slice(address.lastIndexOf('@') + 1).toLowerCase())
    .filter((domain) => domain !== '');
  return [...new Set(domains)];
}

/**
 * 正規表現の特殊文字をエスケープする
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 失敗の理由から、ジョブのトークン・宛先と、URL のトークンの値を伏せる（要件45.3）
 */
function redactFailureReason(reason: string, data: unknown, recipients: readonly string[]): string {
  const secrets: string[] = [...recipients];
  if (typeof data === 'object' && data !== null) {
    for (const field of SECRET_JOB_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value === 'string' && value !== '') {
        secrets.push(value);
      }
    }
  }

  let redacted = reason;
  for (const secret of secrets) {
    // 宛先は大文字・小文字を区別しないため、値を文字どおりに（特殊文字をエスケープして）大小を無視して伏せる
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'gi'), '[REDACTED]');
  }
  // クエリの形と、リンクのフラグメントの形（要件37.3）の両方のトークンの値を伏せる
  return redacted.replace(/([?&#]token=)[^&\s]+/gi, '$1[REDACTED]');
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
 * メールジョブデータ（システム管理者への通知。宛先ごとに 1 ジョブ）
 */
interface AdminNotificationEmailData {
  to: string;
  subject: string;
  lines: string[];
}

/**
 * メールジョブデータ（システム管理者ロール変更アラート。切り替え前に投入済みのジョブの処理だけに使う）
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
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // 注入されなかった依存だけを本番の設定で作る（テストは送信やキューを差し替える）
    this.transporter = transporter ?? EmailService.createSmtpTransporter();
    this.emailQueue = queue ?? createEmailQueue();

    this.registerProcessors();
    this.registerQueueEventHandlers();
  }

  /**
   * SMTP の transporter を環境変数から作る
   */
  private static createSmtpTransporter(): Transporter {
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
    return nodemailer.createTransport(smtpConfig);
  }

  /**
   * キューのイベントの受け手を登録（要件45.3、45.4）
   */
  private registerQueueEventHandlers(): void {
    this.emailQueue.on('failed', (job: Job, error: Error) => this.handleFailedJob(job, error));
    this.emailQueue.on('error', (error: Error) => this.handleQueueError(error));
  }

  /**
   * ジョブの失敗の処理（要件45.3）
   *
   * 最終の失敗（ジョブが失敗の集合にある）では、種別・宛先のドメイン・トークンを伏せた失敗の
   * 理由だけをエラーログと Sentry へ送り、宛先とトークンを含むジョブを消す。再試行の待ち
   * （遅延の集合）にある途中の失敗では何もしない。最終かどうかを試行の回数で決めないのは、
   * 止まったジョブ（stalled）の上限超過・backoff の -1・discard では回数が上限に届かないまま
   * 失敗の集合へ移るためである。止まったジョブの通知ではジョブを読めない（null）ことがある。
   * 受け手の例外は漏らさない（unhandled rejection にしない）。
   */
  private async handleFailedJob(job: Job | null, error: Error | undefined): Promise<void> {
    if (!job) {
      return;
    }

    const recipients = recipientsOf(job.data);
    try {
      if (!(await job.isFailed())) {
        return;
      }

      const record = {
        jobType: job.name,
        recipientDomains: recipientDomainsOf(recipients),
        attemptsMade: job.attemptsMade,
        reason: redactFailureReason(error?.message ?? 'Unknown reason', job.data, recipients),
      };
      logger.error(record, 'Email job failed after the final attempt');
      captureException(new Error('Email job failed after the final attempt'), record);
    } catch (handlingError) {
      logger.error(
        { jobType: job.name, reason: this.redactedMessageOf(handlingError, job, recipients) },
        'Failed to handle the failed email job'
      );
      return;
    }

    try {
      await job.remove();
    } catch (removeError) {
      logger.error(
        { jobType: job.name, reason: this.redactedMessageOf(removeError, job, recipients) },
        'Failed to remove the failed email job'
      );
    }
  }

  /**
   * 例外の文言を、ジョブのトークンと宛先を伏せて取り出す
   */
  private redactedMessageOf(thrown: unknown, job: Job, recipients: readonly string[]): string {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return redactFailureReason(message, job.data, recipients);
  }

  /**
   * キューのエラーの処理（要件45.4）
   *
   * 本番ではキャッシュ基盤への接続の失敗などをエラー監視へ送る。
   */
  private handleQueueError(error: Error): void {
    logger.error({ queue: EMAIL_QUEUE_NAME, err: error }, 'Email queue error');
    if (runtimeMode.kind() === 'production') {
      captureException(error, { queue: EMAIL_QUEUE_NAME });
    }
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

    // システム管理者への通知の処理
    this.emailQueue.process(
      'admin-notification-email',
      async (job: Job<AdminNotificationEmailData>) => {
        await this.processAdminNotificationEmail(job.data);
      }
    );

    // システム管理者ロール変更アラート処理。投入は全システム管理者への通知（admin-notification-email）へ
    // 置き換えた（タスク49.1）。切り替え前にキューへ積まれ再送を待つジョブを処理するために残す
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
    return emailRetryJobOptions();
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
   * システム管理者への通知メールを送信（非同期キュー。要件36.4、36.9）
   *
   * @param to - 送信先（システム管理者 1 名）
   * @param subject - 件名
   * @param lines - 本文の各行（トークン・パスワードを含めない）
   */
  async sendAdminNotificationEmail(to: string, subject: string, lines: string[]): Promise<void> {
    await enqueueAdminNotificationEmail(this.emailQueue, to, subject, lines);
  }

  /**
   * 招待メール処理（実際の送信）
   */
  private async processInvitationEmail(data: InvitationEmailData): Promise<void> {
    const { to, invitationToken } = data;
    // 作成・再送信の直後の応答の招待 URL と同じ組み立てを使う（要件37.2・13.3）
    const invitationUrl = buildInvitationUrl(invitationToken, this.frontendUrl);

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

    // 招待と同じく、トークンを URL のフラグメントに置く（要件37.3）
    const resetUrl = buildPasswordResetUrl(resetToken, this.frontendUrl);

    // Handlebarsテンプレート読み込み
    const templatePath = join(__dirname, '../templates/password-reset-email.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const html = template({
      resetUrl,
      frontendUrl: this.frontendUrl,
      // 有効期限の表記は判定と同じ定義から作る（要件7.3）
      expiryHours: SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS / (60 * 60 * 1000),
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
   * システム管理者への通知メール処理（実際の送信）
   */
  private async processAdminNotificationEmail(data: AdminNotificationEmailData): Promise<void> {
    const { to, subject, lines } = data;

    const templatePath = join(__dirname, '../templates/admin-notification-email.hbs');
    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const html = template({ subject, lines, frontendUrl: this.frontendUrl });

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@architrack.com',
      to,
      subject,
      html,
    });

    logger.info({ to }, 'Admin notification email sent successfully');
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
