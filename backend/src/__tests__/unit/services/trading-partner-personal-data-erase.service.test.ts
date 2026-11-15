/**
 * 論理削除した取引先の個人情報の消去の単体検証（trading-partner-management タスク34.2）
 *
 * Requirements (trading-partner-management):
 * - 5.6: 論理削除から 90 日を過ぎた取引先の個人情報の欄を空にする（行と取引先名などは残す）
 * - 5.7: 空にしたことを ID と日時だけで監査ログに記録する
 *
 * 実データベースでの結果は統合検証（integration/trading-partner-personal-data.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  TRADING_PARTNER_PERSONAL_DATA_ERASE_BATCH_SIZE,
  TRADING_PARTNER_PERSONAL_DATA_RETENTION_DAYS,
  TradingPartnerPersonalDataEraseService,
} from '../../../services/trading-partner-personal-data-erase.service.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const NOW = new Date('2026-11-15T18:45:00.000Z');
const CUTOFF = new Date('2026-08-17T18:45:00.000Z'); // NOW の 90 日前

/** 空にした後の個人情報の欄 */
const ERASED_FIELDS = {
  representativeName: null,
  address: '',
  phoneNumber: null,
  faxNumber: null,
  email: null,
  notes: null,
};

function createMocks(candidates: Array<{ id: string; deletedAt: Date }>, remaining = 0) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = { tradingPartner: { updateMany } };
  const prisma = {
    tradingPartner: {
      findMany: vi.fn().mockResolvedValue(candidates),
      count: vi.fn().mockResolvedValue(remaining),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const auditLogService = { createLog: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
  const service = new TradingPartnerPersonalDataEraseService({
    prisma: prisma as unknown as PrismaClient,
    auditLogService,
  });
  return { prisma, tx, updateMany, auditLogService, service };
}

describe('TradingPartnerPersonalDataEraseService', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('保持は 90 日、1 回の件数は最大 100 件', () => {
    expect(TRADING_PARTNER_PERSONAL_DATA_RETENTION_DAYS).toBe(90);
    expect(TRADING_PARTNER_PERSONAL_DATA_ERASE_BATCH_SIZE).toBe(100);
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('論理削除から 90 日を過ぎ、個人情報の欄が残る取引先を、論理削除の古い順に最大 100 件選ぶ', async () => {
    const { prisma, service } = createMocks([]);

    await service.eraseExpired(NOW);

    expect(prisma.tradingPartner.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: { not: null, lte: CUTOFF },
        OR: [
          { representativeName: { not: null } },
          { address: { not: '' } },
          { phoneNumber: { not: null } },
          { faxNumber: { not: null } },
          { email: { not: null } },
          { notes: { not: null } },
        ],
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, deletedAt: true },
    });
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   * @requirement trading-partner-management/REQ-5.7
   */
  it('1 件ずつトランザクションの中で個人情報の欄を空にし、ID と日時だけを実行者なしで記録する', async () => {
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const { prisma, tx, updateMany, auditLogService, service } = createMocks(
      [
        { id: 'tp-1', deletedAt },
        { id: 'tp-2', deletedAt },
      ],
      3
    );

    const result = await service.eraseExpired(NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'tp-1', deletedAt: { not: null, lte: CUTOFF } },
      data: ERASED_FIELDS,
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'tp-2', deletedAt: { not: null, lte: CUTOFF } },
      data: ERASED_FIELDS,
    });
    expect(auditLogService.createLog).toHaveBeenNthCalledWith(
      1,
      {
        action: 'TRADING_PARTNER_PERSONAL_DATA_ERASED',
        actorId: null,
        targetType: 'TradingPartner',
        targetId: 'tp-1',
        metadata: { deletedAt: deletedAt.toISOString(), erasedAt: NOW.toISOString() },
      },
      tx
    );
    expect(result).toEqual({ erasedCount: 2, failedCount: 0, remainingCount: 3 });
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('選んだ後に状態が変わり更新が 0 件だった取引先は記録せず、数えない', async () => {
    const { updateMany, auditLogService, service } = createMocks([
      { id: 'tp-1', deletedAt: new Date('2026-07-01T00:00:00.000Z') },
    ]);
    updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.eraseExpired(NOW);

    expect(auditLogService.createLog).not.toHaveBeenCalled();
    expect(result).toEqual({ erasedCount: 0, failedCount: 0, remainingCount: 0 });
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('1 件の失敗で止まらず次へ進み、失敗は取引先の ID とエラーの種類だけをログに残す', async () => {
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const { prisma, auditLogService, service } = createMocks([
      { id: 'tp-1', deletedAt },
      { id: 'tp-2', deletedAt },
    ]);
    const original = prisma.$transaction.getMockImplementation();
    prisma.$transaction.mockImplementationOnce(async () => {
      throw new TypeError('connection reset');
    });
    if (original) {
      prisma.$transaction.mockImplementation(original);
    }

    const result = await service.eraseExpired(NOW);

    expect(result).toEqual({ erasedCount: 1, failedCount: 1, remainingCount: 0 });
    expect(auditLogService.createLog).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      { tradingPartnerId: 'tp-1', errorName: 'TypeError' },
      'Failed to erase personal data of soft-deleted trading partner'
    );
  });

  /**
   * @requirement trading-partner-management/REQ-5.7
   */
  it('監査ログの部品を渡さないときは本番の部品を作り、実際の DB の取引先のメソッドだけを使う', async () => {
    const prisma = {
      tradingPartner: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(),
    };
    const service = new TradingPartnerPersonalDataEraseService({
      prisma: prisma as unknown as PrismaClient,
    });

    await expect(service.eraseExpired(NOW)).resolves.toEqual({
      erasedCount: 0,
      failedCount: 0,
      remainingCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /**
   * @requirement trading-partner-management/REQ-5.7
   */
  it('論理削除の日時が読めないときは記録の論理削除の日時を空にする', async () => {
    const { auditLogService, service } = createMocks([
      { id: 'tp-1', deletedAt: null as unknown as Date },
    ]);

    await service.eraseExpired(NOW);

    expect(auditLogService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { deletedAt: null, erasedAt: NOW.toISOString() },
      }),
      expect.anything()
    );
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   */
  it('Error でない値が投げられたときも、取引先の ID と値の種類だけをログに残す', async () => {
    const { prisma, service } = createMocks([
      { id: 'tp-1', deletedAt: new Date('2026-07-01T00:00:00.000Z') },
    ]);
    prisma.$transaction.mockImplementationOnce(async () => {
      throw 'connection reset by peer';
    });

    const result = await service.eraseExpired(NOW);

    expect(result).toEqual({ erasedCount: 0, failedCount: 1, remainingCount: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      { tradingPartnerId: 'tp-1', errorName: 'string' },
      'Failed to erase personal data of soft-deleted trading partner'
    );
  });
});
