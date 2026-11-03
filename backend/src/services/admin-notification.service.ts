/**
 * @fileoverview 全システム管理者への通知
 *
 * Requirements (user-authentication):
 * - REQ-36.4: 無効化・再有効化を全てのシステム管理者へ通知する
 * - REQ-36.9: 自動無効化を全てのシステム管理者へ通知する
 *
 * 責任と境界:
 * - 主要責任: 有効なシステム管理者の全員へのメール（キュー投入）とエラー監視への通知
 * - トランザクション境界: なし（呼び出し元のコミットの後に呼ぶ）
 *
 * 依存関係:
 * - アウトバウンド: EmailService（メールキュー）、Sentry
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { EmailService } from './email.service.js';
import logger from '../utils/logger.js';
import { captureException, captureMessage } from '../utils/sentry.js';

/** 通知の種別 */
export type AdminNotificationKind =
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'USERS_AUTO_DEACTIVATED'
  | 'AUDIT_ARCHIVE_FAILED'
  | 'SECURITY_ANOMALY'
  | 'ADMIN_ROLE_CHANGED';

/** 通知の内容 */
export interface AdminNotification {
  kind: AdminNotificationKind;
  subject: string;
  /** 本文の各行。トークン・パスワードを含めない */
  lines: string[];
}

export interface IAdminNotificationService {
  /** 失敗はログと Sentry へ送り、呼び出し元を失敗にしない */
  notifyAllAdmins(notification: AdminNotification): Promise<void>;
}

/** システム管理者のロール名 */
const SYSTEM_ADMIN_ROLE_NAME = 'admin';

/**
 * 全システム管理者への通知の実装
 *
 * 宛先は admin ロールを持つ有効な（is_active=true）利用者。メールは宛先ごとに 1 ジョブで
 * キューへ投入し（再送が他の宛先へ重複しない）、同時に Sentry へ captureMessage を送る。
 * 宛先が居ない場合も Sentry には届く。
 */
export class AdminNotificationService implements IAdminNotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: Pick<EmailService, 'sendAdminNotificationEmail'>
  ) {}

  async notifyAllAdmins(notification: AdminNotification): Promise<void> {
    const { kind, subject, lines } = notification;

    // エラー監視への通知はメールの成否に左右されない
    this.safely(kind, 'Failed to send admin notification to error monitoring', () =>
      captureMessage(`Admin notification: ${kind}`, 'warning', { kind, subject, lines })
    );

    let recipients: string[];
    try {
      recipients = await this.findActiveAdminEmails();
    } catch (error) {
      this.reportFailure(kind, error, 'Failed to look up system administrators for notification');
      return;
    }

    if (recipients.length === 0) {
      logger.warn({ kind }, 'No active system administrators to notify');
      return;
    }

    const results = await Promise.allSettled(
      recipients.map((to) => this.emailService.sendAdminNotificationEmail(to, subject, lines))
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failures.length > 0) {
      this.reportFailure(kind, failures[0]!.reason, 'Failed to queue admin notification email', {
        failedCount: failures.length,
        recipientCount: recipients.length,
      });
      return;
    }

    logger.info({ kind, recipientCount: recipients.length }, 'Admin notification queued');
  }

  /**
   * 有効なシステム管理者のメールアドレス
   */
  private async findActiveAdminEmails(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: SYSTEM_ADMIN_ROLE_NAME } } },
      },
      select: { email: true },
    });
    return admins.map((admin) => admin.email);
  }

  /**
   * 失敗を警告ログと Sentry へ送る（送信自体の失敗も漏らさない）
   */
  private reportFailure(
    kind: AdminNotificationKind,
    error: unknown,
    message: string,
    extra: Record<string, unknown> = {}
  ): void {
    logger.warn({ err: error, kind, ...extra }, message);
    this.safely(kind, 'Failed to report admin notification failure', () =>
      captureException(error instanceof Error ? error : new Error(String(error)), {
        kind,
        ...extra,
      })
    );
  }

  /**
   * 例外を警告ログに留めて実行する
   */
  private safely(kind: AdminNotificationKind, message: string, action: () => void): void {
    try {
      action();
    } catch (error) {
      logger.warn({ err: error, kind }, message);
    }
  }
}
