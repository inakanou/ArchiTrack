/**
 * @fileoverview AdminNotificationService の単体テスト
 *
 * Requirements (user-authentication):
 * - REQ-36.4: 無効化・再有効化を全てのシステム管理者へ通知する
 * - REQ-36.9: 自動無効化を全てのシステム管理者へ通知する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { EmailService } from '../../../services/email.service.js';
import {
  AdminNotificationService,
  type AdminNotification,
} from '../../../services/admin-notification.service.js';
import { captureException, captureMessage } from '../../../utils/sentry.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

/** 利用者の行（ロール名と有効の状態だけを持つ） */
interface FakeUser {
  email: string;
  isActive: boolean;
  roles: string[];
}

interface FindManyArgs {
  where: { isActive?: boolean; userRoles?: { some: { role: { name: string } } } };
  select: { email: true };
}

/**
 * where の条件（isActive とロール名）を利用者の一覧へ当てる findMany の代役
 */
function fakeFindMany(users: FakeUser[]) {
  return vi.fn(async ({ where }: FindManyArgs) =>
    users
      .filter((user) => where.isActive === undefined || user.isActive === where.isActive)
      .filter((user) => {
        const roleName = where.userRoles?.some.role.name;
        return roleName === undefined || user.roles.includes(roleName);
      })
      .map((user) => ({ email: user.email }))
  );
}

const notification: AdminNotification = {
  kind: 'USER_DEACTIVATED',
  subject: '利用者が無効化されました: 対象 太郎',
  lines: ['対象: 対象 太郎 (target@example.com)', '理由: 退職'],
};

describe('AdminNotificationService', () => {
  let findMany: ReturnType<typeof fakeFindMany>;
  let sendAdminNotificationEmail: ReturnType<typeof vi.fn>;
  let service: AdminNotificationService;

  function createService(users: FakeUser[]): AdminNotificationService {
    findMany = fakeFindMany(users);
    const prisma = { user: { findMany } } as unknown as PrismaClient;
    return new AdminNotificationService(prisma, {
      sendAdminNotificationEmail,
    } as unknown as Pick<EmailService, 'sendAdminNotificationEmail'>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'warn');
    vi.spyOn(logger, 'info');
    sendAdminNotificationEmail = vi.fn().mockResolvedValue(undefined);
    service = createService([
      { email: 'admin1@example.com', isActive: true, roles: ['admin'] },
      { email: 'disabled-admin@example.com', isActive: false, roles: ['admin'] },
      { email: 'admin2@example.com', isActive: true, roles: ['user', 'admin'] },
      { email: 'member@example.com', isActive: true, roles: ['user'] },
    ]);
  });

  /**
   * @requirement user-authentication/REQ-36.4: 無効化・再有効化の通知を有効なシステム管理者の全員へメールで送る
   */
  it('有効なシステム管理者の全員へ宛先ごとにメールを投入し、無効化されたシステム管理者と一般の利用者へは送らない', async () => {
    await service.notifyAllAdmins(notification);

    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true, userRoles: { some: { role: { name: 'admin' } } } },
      select: { email: true },
    });
    expect(sendAdminNotificationEmail.mock.calls).toEqual([
      ['admin1@example.com', notification.subject, notification.lines],
      ['admin2@example.com', notification.subject, notification.lines],
    ]);
    const recipients = sendAdminNotificationEmail.mock.calls.map(([to]) => to);
    expect(recipients).not.toContain('disabled-admin@example.com');
    expect(recipients).not.toContain('member@example.com');
    expect(logger.info).toHaveBeenCalledWith(
      { kind: 'USER_DEACTIVATED', recipientCount: 2 },
      'Admin notification queued'
    );
  });

  /**
   * @requirement user-authentication/REQ-36.9: 自動無効化の通知もエラー監視へ送る
   */
  it('エラー監視へ種別・件名・本文の行を警告として送る', async () => {
    const autoDeactivated: AdminNotification = {
      kind: 'USERS_AUTO_DEACTIVATED',
      subject: '90 日間ログインの無い利用者を無効化しました（2 名）',
      lines: ['a@example.com', 'b@example.com'],
    };

    await service.notifyAllAdmins(autoDeactivated);

    expect(captureMessage).toHaveBeenCalledWith(
      'Admin notification: USERS_AUTO_DEACTIVATED',
      'warning',
      {
        kind: 'USERS_AUTO_DEACTIVATED',
        subject: autoDeactivated.subject,
        lines: autoDeactivated.lines,
      }
    );
    // 対象の一覧は一通にまとめて送る（宛先ごとに 1 通）
    expect(sendAdminNotificationEmail).toHaveBeenCalledTimes(2);
  });

  /**
   * @requirement user-authentication/REQ-36.4: 有効なシステム管理者が居なくてもエラー監視には届く
   */
  it('有効なシステム管理者が居ないときはメールを送らず、エラー監視へは送り、警告を残す', async () => {
    service = createService([
      { email: 'disabled-admin@example.com', isActive: false, roles: ['admin'] },
    ]);

    await expect(service.notifyAllAdmins(notification)).resolves.toBeUndefined();

    expect(sendAdminNotificationEmail).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { kind: 'USER_DEACTIVATED' },
      'No active system administrators to notify'
    );
  });

  /**
   * @requirement user-authentication/REQ-36.4: 通知の失敗は呼び出し元を失敗にしない
   */
  it('メールの投入が失敗しても呼び出し元へ伝えず、他の宛先へは送り、警告ログとエラー監視へ送る', async () => {
    const failure = new Error('queue unavailable');
    sendAdminNotificationEmail.mockImplementation(async (to: string) => {
      if (to === 'admin1@example.com') {
        throw failure;
      }
    });

    await expect(service.notifyAllAdmins(notification)).resolves.toBeUndefined();

    expect(sendAdminNotificationEmail).toHaveBeenCalledWith(
      'admin2@example.com',
      notification.subject,
      notification.lines
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, kind: 'USER_DEACTIVATED', failedCount: 1, recipientCount: 2 },
      'Failed to queue admin notification email'
    );
    expect(captureException).toHaveBeenCalledWith(failure, {
      kind: 'USER_DEACTIVATED',
      failedCount: 1,
      recipientCount: 2,
    });
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Admin notification queued');
  });

  /**
   * @requirement user-authentication/REQ-36.4: 通知の失敗は呼び出し元を失敗にしない
   */
  it('宛先の取得が失敗しても呼び出し元へ伝えず、警告ログとエラー監視へ送る', async () => {
    const failure = new Error('Connection terminated');
    findMany.mockRejectedValue(failure);

    await expect(service.notifyAllAdmins(notification)).resolves.toBeUndefined();

    expect(sendAdminNotificationEmail).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, kind: 'USER_DEACTIVATED' },
      'Failed to look up system administrators for notification'
    );
    expect(captureException).toHaveBeenCalledWith(failure, { kind: 'USER_DEACTIVATED' });
  });

  /**
   * @requirement user-authentication/REQ-36.4: 通知の失敗は呼び出し元を失敗にしない
   */
  it('エラー監視への送信が投げてもメールを送り、呼び出し元へ伝えない', async () => {
    const failure = new Error('sentry transport failed');
    vi.mocked(captureMessage).mockImplementationOnce(() => {
      throw failure;
    });

    await expect(service.notifyAllAdmins(notification)).resolves.toBeUndefined();

    expect(sendAdminNotificationEmail).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, kind: 'USER_DEACTIVATED' },
      'Failed to send admin notification to error monitoring'
    );
  });

  /**
   * @requirement user-authentication/REQ-36.4: 通知の失敗は呼び出し元を失敗にしない
   */
  it('失敗の報告そのもの（エラー監視）が投げても、Error でない失敗の理由でも呼び出し元へ伝えない', async () => {
    findMany.mockRejectedValue('not an error object');
    vi.mocked(captureException).mockImplementationOnce(() => {
      throw new Error('sentry down');
    });

    await expect(service.notifyAllAdmins(notification)).resolves.toBeUndefined();

    expect(vi.mocked(captureException).mock.calls[0]![0]).toEqual(new Error('not an error object'));
    expect(logger.warn).toHaveBeenCalledWith(
      { err: new Error('sentry down'), kind: 'USER_DEACTIVATED' },
      'Failed to report admin notification failure'
    );
  });
});
