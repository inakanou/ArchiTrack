/**
 * 90 日の自動無効化の定期処理の単体検証（user-authentication タスク49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.8: 日次の定期処理で 90 日の自動無効化を現在の時刻で実行する
 *
 * 処理の部品は最初の実行のときに一度だけ作り、実行のたびに現在の時刻で AccountStatusService を呼ぶことを
 * 確かめる。実データベースでの結果は統合検証（integration/inactive-user-deactivation.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  INACTIVE_USER_DEACTIVATION_CRON,
  INACTIVE_USER_DEACTIVATION_JOB_NAME,
  createAccountStatusServiceForJob,
  createInactiveUserDeactivationRun,
} from '../../../jobs/inactive-user-deactivation.job.js';
import { AccountStatusService } from '../../../services/account-status.service.js';

vi.mock('../../../services/email.service.js', () => ({
  EmailService: function EmailService() {
    return { sendAdminNotificationEmail: vi.fn() };
  },
}));

describe('inactive-user-deactivation', () => {
  it('ジョブ名と毎日 03:00 の周期を持つ', () => {
    expect(INACTIVE_USER_DEACTIVATION_JOB_NAME).toBe('inactive-user-deactivation');
    expect(INACTIVE_USER_DEACTIVATION_CRON).toBe('0 3 * * *');
  });

  /**
   * @requirement user-authentication/REQ-36.8
   */
  it('部品を最初の実行のときに一度だけ作り、実行のたびに現在の時刻で自動無効化を呼ぶ', async () => {
    const prisma = {} as PrismaClient;
    const deactivateInactiveUsers = vi
      .fn()
      .mockResolvedValueOnce({ deactivatedUserIds: ['u1'] })
      .mockResolvedValueOnce({ deactivatedUserIds: [] });
    const createService = vi.fn(() => ({ deactivateInactiveUsers }));
    const times = [new Date('2026-10-22T18:00:00.000Z'), new Date('2026-10-23T18:00:00.000Z')];
    const clock = vi.fn(() => times.shift() as Date);

    const run = createInactiveUserDeactivationRun(prisma, createService, clock);
    expect(createService).not.toHaveBeenCalled();

    await expect(run()).resolves.toEqual({ deactivatedUserIds: ['u1'] });
    await expect(run()).resolves.toEqual({ deactivatedUserIds: [] });

    expect(createService).toHaveBeenCalledTimes(1);
    expect(createService).toHaveBeenCalledWith(prisma);
    expect(deactivateInactiveUsers.mock.calls).toEqual([
      [new Date('2026-10-22T18:00:00.000Z')],
      [new Date('2026-10-23T18:00:00.000Z')],
    ]);
  });

  it('既定の部品は本番の組み立ての AccountStatusService で、既定の時刻は現在', async () => {
    expect(createAccountStatusServiceForJob({} as PrismaClient)).toBeInstanceOf(
      AccountStatusService
    );

    const deactivateInactiveUsers = vi.fn().mockResolvedValue({ deactivatedUserIds: [] });
    const before = Date.now();
    await createInactiveUserDeactivationRun({} as PrismaClient, () => ({
      deactivateInactiveUsers,
    }))();
    const now = deactivateInactiveUsers.mock.calls[0]?.[0] as Date;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
