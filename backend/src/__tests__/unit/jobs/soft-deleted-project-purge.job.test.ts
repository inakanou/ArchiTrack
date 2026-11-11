/**
 * 論理削除したプロジェクトの完全削除の定期処理の単体検証（project-management タスク81.4）
 *
 * Requirements (project-management):
 * - 46.5: 1 日 1 回の定期処理で、論理削除から 90 日を過ぎたプロジェクトを完全に削除する
 * - 46.11: 対象から外したことを全システム管理者へ知らせる部品を渡す（タスク83.3）
 *
 * 部品は最初の実行のときに一度だけ作り、実行のたびに現在の時刻で ProjectPurgeService を呼ぶこと、
 * 失敗したプロジェクトがあっても処理は成功として結果を返すことを確かめる。
 * 実データベースでの結果は統合検証（integration/project-purge.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import {
  SOFT_DELETED_PROJECT_PURGE_CRON,
  SOFT_DELETED_PROJECT_PURGE_JOB_NAME,
  createProjectPurgeServiceForJob,
  createSoftDeletedProjectPurgeRun,
} from '../../../jobs/soft-deleted-project-purge.job.js';
import { AdminNotificationService } from '../../../services/admin-notification.service.js';
import { ProjectPurgeService } from '../../../services/project-purge.service.js';
import { getStorageProvider } from '../../../storage/storage-factory.js';

vi.mock('../../../storage/storage-factory.js', () => ({
  getStorageProvider: vi.fn(() => null),
}));

vi.mock('../../../services/email.service.js', () => ({
  EmailService: function EmailService() {
    return { sendAdminNotificationEmail: vi.fn() };
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('soft-deleted-project-purge', () => {
  beforeEach(() => {
    vi.mocked(getStorageProvider).mockReset();
    vi.mocked(getStorageProvider).mockReturnValue(null);
  });

  /**
   * @requirement project-management/REQ-46.5
   */
  it('ジョブ名と毎日 03:30 の周期を持つ', () => {
    expect(SOFT_DELETED_PROJECT_PURGE_JOB_NAME).toBe('soft-deleted-project-purge');
    expect(SOFT_DELETED_PROJECT_PURGE_CRON).toBe('30 3 * * *');
  });

  /**
   * @requirement project-management/REQ-46.5
   */
  it('部品を最初の実行のときに一度だけ作り、実行のたびに現在の時刻で完全削除を呼ぶ', async () => {
    const prisma = {} as PrismaClient;
    const purgeExpired = vi
      .fn()
      .mockResolvedValueOnce({
        purgedProjectIds: ['p1'],
        failedProjectIds: [],
        excludedProjectIds: [],
        remainingCandidates: 3,
      })
      .mockResolvedValueOnce({
        purgedProjectIds: [],
        failedProjectIds: [],
        excludedProjectIds: [],
        remainingCandidates: 0,
      });
    const createService = vi.fn(() => ({ purgeExpired }));
    const times = [new Date('2026-11-09T18:30:00.000Z'), new Date('2026-11-10T18:30:00.000Z')];
    const clock = vi.fn(() => times.shift() as Date);

    const run = createSoftDeletedProjectPurgeRun(prisma, createService, clock);
    expect(createService).not.toHaveBeenCalled();

    await expect(run()).resolves.toEqual({
      purgedProjectIds: ['p1'],
      failedProjectIds: [],
      excludedProjectIds: [],
      remainingCandidates: 3,
    });
    await expect(run()).resolves.toEqual({
      purgedProjectIds: [],
      failedProjectIds: [],
      excludedProjectIds: [],
      remainingCandidates: 0,
    });

    expect(createService).toHaveBeenCalledTimes(1);
    expect(createService).toHaveBeenCalledWith(prisma);
    expect(purgeExpired.mock.calls).toEqual([
      [new Date('2026-11-09T18:30:00.000Z')],
      [new Date('2026-11-10T18:30:00.000Z')],
    ]);
  });

  /**
   * @requirement project-management/REQ-46.5
   */
  it('失敗したプロジェクトがあっても処理は成功として結果を返す（次の回でやり直す）', async () => {
    const result = {
      purgedProjectIds: [],
      failedProjectIds: ['p1', 'p2'],
      excludedProjectIds: ['p2'],
      remainingCandidates: 0,
    };
    const purgeExpired = vi.fn().mockResolvedValue(result);

    const run = createSoftDeletedProjectPurgeRun({} as PrismaClient, () => ({ purgeExpired }));

    await expect(run()).resolves.toEqual(result);
  });

  it('既定の部品はストレージつきの ProjectPurgeService で、既定の時刻は現在', async () => {
    const storageProvider = { delete: vi.fn() } as unknown as StorageProvider;
    vi.mocked(getStorageProvider).mockReturnValue(storageProvider);
    expect(createProjectPurgeServiceForJob({} as PrismaClient)).toBeInstanceOf(ProjectPurgeService);

    const purgeExpired = vi.fn().mockResolvedValue({
      purgedProjectIds: [],
      failedProjectIds: [],
      excludedProjectIds: [],
      remainingCandidates: 0,
    });
    const before = Date.now();
    await createSoftDeletedProjectPurgeRun({} as PrismaClient, () => ({ purgeExpired }))();
    const now = purgeExpired.mock.calls[0]?.[0] as Date;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  /**
   * @requirement project-management/REQ-46.11
   */
  it('既定の部品は全システム管理者への通知の部品を明示して渡す（46.11）', () => {
    const storageProvider = { delete: vi.fn() } as unknown as StorageProvider;
    vi.mocked(getStorageProvider).mockReturnValue(storageProvider);
    const prisma = {} as PrismaClient;

    const service = createProjectPurgeServiceForJob(prisma);

    const deps = (service as unknown as { deps: Record<string, unknown> }).deps;
    expect(deps.prisma).toBe(prisma);
    expect(deps.storageProvider).toBe(storageProvider);
    expect(deps.adminNotificationService).toBeInstanceOf(AdminNotificationService);
  });

  /**
   * @requirement project-management/REQ-46.14
   */
  it('通知をしない指定のときは通知の部品を渡さない（対象に戻す運用の手順で使う。タスク83.6）', () => {
    const storageProvider = { delete: vi.fn() } as unknown as StorageProvider;
    vi.mocked(getStorageProvider).mockReturnValue(storageProvider);
    const prisma = {} as PrismaClient;

    const service = createProjectPurgeServiceForJob(prisma, { notify: false });

    const deps = (service as unknown as { deps: Record<string, unknown> }).deps;
    expect(deps.prisma).toBe(prisma);
    expect(deps.storageProvider).toBe(storageProvider);
    expect(deps.adminNotificationService).toBeUndefined();
    expect(
      (
        createProjectPurgeServiceForJob(prisma, { notify: true }) as unknown as {
          deps: Record<string, unknown>;
        }
      ).deps.adminNotificationService
    ).toBeInstanceOf(AdminNotificationService);
  });

  it('ストレージが設定されていないときは処理を失敗にし、DB を消さない', async () => {
    vi.mocked(getStorageProvider).mockReturnValue(null);
    const prisma = {} as PrismaClient;

    expect(() => createProjectPurgeServiceForJob(prisma)).toThrow(/storage/i);

    // 部品を作れなかった実行は失敗になり、次の実行で作り直す
    const run = createSoftDeletedProjectPurgeRun(prisma);
    await expect(run()).rejects.toThrow(/storage/i);
    await expect(run()).rejects.toThrow(/storage/i);
    expect(getStorageProvider).toHaveBeenCalledTimes(3);
  });
});
