/**
 * 監査ログの月次のアーカイブの定期処理の単体検証（user-authentication タスク54.1）
 *
 * Requirements (user-authentication):
 * - REQ-41.1: 月次の定期処理で 13 か月以上前の監査ログのアーカイブを現在の時刻で実行する
 * - REQ-41.2: 同じ定期処理で 8 年を過ぎたアーカイブの消去を行う
 *
 * 処理の部品は最初の実行のときに一度だけ作り、実行のたびに現在の時刻で runMonthly を呼ぶことと、
 * 本番の組み立てが ARCHIVE_ENCRYPTION_KEY を読み、無いときに乱数の鍵で書かないことを確かめる。
 * 実データベースでの結果は統合検証（integration/audit-log-archive.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  AUDIT_LOG_ARCHIVE_CRON,
  AUDIT_LOG_ARCHIVE_JOB_NAME,
  createAuditLogArchiveRun,
  createAuditLogArchiveServiceForJob,
} from '../../../jobs/audit-log-archive.job.js';
import { AuditLogArchiveService } from '../../../services/audit-log-archive.service.js';

vi.mock('../../../services/email.service.js', () => ({
  EmailService: function EmailService() {
    return { sendAdminNotificationEmail: vi.fn() };
  },
}));

vi.mock('../../../storage/storage-factory.js', () => ({
  getStorageProvider: vi.fn(() => null),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('audit-log-archive', () => {
  const originalKey = process.env.ARCHIVE_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ARCHIVE_ENCRYPTION_KEY;
    } else {
      process.env.ARCHIVE_ENCRYPTION_KEY = originalKey;
    }
  });

  /**
   * @requirement user-authentication/REQ-41.1
   */
  it('ジョブ名と毎月 1 日 04:00 の周期を持つ', () => {
    expect(AUDIT_LOG_ARCHIVE_JOB_NAME).toBe('audit-log-archive');
    expect(AUDIT_LOG_ARCHIVE_CRON).toBe('0 4 1 * *');
  });

  /**
   * @requirement user-authentication/REQ-41.1
   * @requirement user-authentication/REQ-41.2
   */
  it('部品は最初の実行のときに一度だけ作り、実行のたびに現在の時刻で月次の処理を呼ぶ', async () => {
    const runMonthly = vi
      .fn()
      .mockResolvedValue({ archivedMonths: [], failedMonths: [], deletedArchives: [] });
    const createService = vi.fn(() => ({ runMonthly }));
    const times = [new Date('2026-10-31T19:00:00.000Z'), new Date('2026-11-30T19:00:00.000Z')];
    const clock = vi.fn(() => times.shift()!);
    const prisma = {} as PrismaClient;

    const run = createAuditLogArchiveRun(prisma, createService, clock);
    expect(createService).not.toHaveBeenCalled();
    await run();
    await run();

    expect(createService).toHaveBeenCalledTimes(1);
    expect(createService).toHaveBeenCalledWith(prisma);
    expect(runMonthly.mock.calls).toEqual([
      [new Date('2026-10-31T19:00:00.000Z')],
      [new Date('2026-11-30T19:00:00.000Z')],
    ]);
  });

  /**
   * @requirement user-authentication/REQ-41.6
   */
  it('本番の組み立ては鍵が無いとき乱数の鍵で書かず、月を失敗にして管理者へ通知する', async () => {
    delete process.env.ARCHIVE_ENCRYPTION_KEY;
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      auditLog: { findMany, create: vi.fn().mockResolvedValue({}) },
      user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    } as unknown as PrismaClient;

    const service = createAuditLogArchiveServiceForJob(prisma);
    expect(service).toBeInstanceOf(AuditLogArchiveService);
    const notify = vi.spyOn(
      (
        service as unknown as {
          deps: { adminNotificationService: { notifyAllAdmins: () => Promise<void> } };
        }
      ).deps.adminNotificationService,
      'notifyAllAdmins'
    );

    const result = await service.archiveMonth('2020-01');

    expect(result).toEqual({ ok: false, error: { type: 'KEY_MISSING' } });
    expect(findMany).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'AUDIT_ARCHIVE_FAILED' }));
  });
});
