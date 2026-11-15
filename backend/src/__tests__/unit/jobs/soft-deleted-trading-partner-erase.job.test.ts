/**
 * 論理削除した取引先の個人情報の消去の定期処理の単体検証（trading-partner-management タスク34.2）
 *
 * 部品は最初の実行のときに一度だけ作り、実行のたびに現在の時刻で消去を呼ぶことを確かめる。
 * 実データベースでの結果は統合検証（integration/trading-partner-personal-data.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  SOFT_DELETED_TRADING_PARTNER_ERASE_CRON,
  SOFT_DELETED_TRADING_PARTNER_ERASE_JOB_NAME,
  createSoftDeletedTradingPartnerEraseRun,
} from '../../../jobs/soft-deleted-trading-partner-erase.job.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('soft-deleted-trading-partner-erase', () => {
  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('ジョブ名と毎日 03:45 の周期を持つ', () => {
    expect(SOFT_DELETED_TRADING_PARTNER_ERASE_JOB_NAME).toBe('soft-deleted-trading-partner-erase');
    expect(SOFT_DELETED_TRADING_PARTNER_ERASE_CRON).toBe('45 3 * * *');
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('部品を最初の実行のときに一度だけ作り、実行のたびに現在の時刻で消去を呼ぶ', async () => {
    const prisma = {} as PrismaClient;
    const eraseExpired = vi
      .fn()
      .mockResolvedValueOnce({ erasedCount: 1, failedCount: 0, remainingCount: 4 })
      .mockResolvedValueOnce({ erasedCount: 0, failedCount: 0, remainingCount: 0 });
    const createService = vi.fn(() => ({ eraseExpired }));
    const times = [new Date('2026-11-15T18:45:00.000Z'), new Date('2026-11-16T18:45:00.000Z')];
    const clock = vi.fn(() => times.shift() as Date);

    const run = createSoftDeletedTradingPartnerEraseRun(prisma, createService, clock);
    expect(createService).not.toHaveBeenCalled();

    await expect(run()).resolves.toEqual({ erasedCount: 1, failedCount: 0, remainingCount: 4 });
    await expect(run()).resolves.toEqual({ erasedCount: 0, failedCount: 0, remainingCount: 0 });

    expect(createService).toHaveBeenCalledTimes(1);
    expect(createService).toHaveBeenCalledWith(prisma);
    expect(eraseExpired).toHaveBeenNthCalledWith(1, new Date('2026-11-15T18:45:00.000Z'));
    expect(eraseExpired).toHaveBeenNthCalledWith(2, new Date('2026-11-16T18:45:00.000Z'));
  });
});
