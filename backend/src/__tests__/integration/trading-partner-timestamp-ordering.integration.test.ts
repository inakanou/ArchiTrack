/**
 * @fileoverview 取引先の作成日時・更新日時の順序に関する統合検証
 *
 * Requirements (trading-partner-management):
 * - REQ-11.12: 各取引先レコードに作成日時と更新日時を自動記録する
 * - REQ-5.2: ユーザーが削除を確認したとき、取引先レコードを論理削除する
 *   （論理削除も `deletedAt` と `updatedAt` を動かす 1 回の更新であり、同じ順序に服する）
 *
 * ## なぜこの検証が要るか（実測に基づく）
 *
 * feature レベルの E2E 全件（2322件）で
 * `e2e/specs/trading-partners/trading-partner-data-integrity.spec.ts` の
 * 「取引先更新時に更新日時が自動記録される」が一度だけ落ち、再試行で回復した。
 * 実測値は `Expected: >= 1787941668496` / `Received: 1787941668052`——
 * 更新日時が作成日時より 444ms 前だった。
 *
 * 追跡の実測（trace.zip の資源から復元）:
 *
 * - 作成応答は `createdAt` = `updatedAt` = `2026-08-28T18:27:48.496Z` を返している。
 *   すなわち作成時点の二つの日時は**同一の値**であり、別々の時計から来てはいない。
 * - 更新応答は `createdAt` = `...48.496Z` / `updatedAt` = `...48.052Z`。
 * - 同じ trace の `startedDateTime` も、作成 POST（18:27:48.479Z）の後に発行された
 *   編集画面の GET が 18:27:47.076Z を名乗っており、**ブラウザ側の壁時計も巻き戻っている**。
 *
 * つまり出所は既に一つ（Prisma クライアントが両方の値を同じプロセスの `Date` から採る。
 * `createdAt` の DDL 既定値 `DEFAULT CURRENT_TIMESTAMP` は INSERT が両列を明示するため
 * 到達しない）であり、壊れているのは**その一つの壁時計が単調でないこと**である。
 * WSL2 では host との時刻同期が壁時計を後ろへ跳ばす。
 *
 * したがって順序は「時計が単調であること」に依存させず、書き込み時に成立させる。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { TradingPartnerType } from '../../generated/prisma/client.js';
import { TradingPartnerService } from '../../services/trading-partner.service.js';
import type { IAuditLogService } from '../../types/audit-log.types.js';
import type { CreateTradingPartnerInput } from '../../schemas/trading-partner.schema.js';

// 環境変数を初期化
validateEnv();

import getPrismaClient from '../../db.js';

const TEST_NAME_PREFIX = 'test-clockskew-';

/**
 * 巻き戻しの幅。
 *
 * 実測された巻き戻しは 1.45 秒（作成 18:27:48.496Z → 1 秒待機後の更新 18:27:48.052Z。
 * 待機分 1.0 秒を差し引かない生の差が 0.444 秒、待機を含めた実際の後退は約 1.45 秒）。
 * 検証はこれを上回る幅を当てて、実環境で起きた事象より厳しい条件を作る。
 */
const CLOCK_ROLLBACK_MS = 3000;

describe('取引先の作成日時・更新日時の順序 (trading-partner-management/REQ-11.12)', () => {
  let prisma: PrismaClient;
  let service: TradingPartnerService;
  let mockAuditLogService: IAuditLogService;

  const cleanup = async (): Promise<void> => {
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: { tradingPartner: { name: { startsWith: TEST_NAME_PREFIX } } },
    });
    await prisma.tradingPartner.deleteMany({
      where: { name: { startsWith: TEST_NAME_PREFIX } },
    });
  };

  beforeAll(async () => {
    prisma = getPrismaClient();

    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
      getLogs: vi.fn().mockResolvedValue([]),
      exportLogs: vi.fn().mockResolvedValue('[]'),
    };

    service = new TradingPartnerService({
      prisma,
      auditLogService: mockAuditLogService,
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const createPartner = async (suffix: string): Promise<{ id: string; createdAt: Date }> => {
    const input: CreateTradingPartnerInput = {
      name: `${TEST_NAME_PREFIX}${suffix}`,
      nameKana: 'テストトケイマキモドシ',
      address: '東京都渋谷区1-1-1',
      types: [TradingPartnerType.CUSTOMER],
    };
    const created = await service.createPartner(input, 'test-actor-id');
    return { id: created.id, createdAt: created.createdAt };
  };

  it('作成時の作成日時と更新日時が同一の時計から採られる (trading-partner-management/REQ-11.12)', async () => {
    const created = await service.createPartner(
      {
        name: `${TEST_NAME_PREFIX}create`,
        nameKana: 'テストトケイマキモドシ',
        address: '東京都渋谷区1-1-1',
        types: [TradingPartnerType.CUSTOMER],
      },
      'test-actor-id'
    );

    expect(created.updatedAt.getTime()).toBe(created.createdAt.getTime());
  });

  it('壁時計が巻き戻っても更新日時が作成日時より前にならない (trading-partner-management/REQ-11.12)', async () => {
    const created = await createPartner('rollback');

    // 実環境で観測された「壁時計が後ろへ跳ぶ」状況を再現する。
    // Date だけを差し替え、DB ドライバが使うタイマは実物のままにする。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(created.createdAt.getTime() - CLOCK_ROLLBACK_MS));

    expect(Date.now()).toBeLessThan(created.createdAt.getTime());

    const updated = await service.updatePartner(
      created.id,
      { notes: '巻き戻し検証' },
      'test-actor-id',
      created.createdAt
    );

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime());
  });

  it('巻き戻した更新日時が永続化された行にも残らない (trading-partner-management/REQ-11.12)', async () => {
    const created = await createPartner('persisted');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(created.createdAt.getTime() - CLOCK_ROLLBACK_MS));

    await service.updatePartner(
      created.id,
      { notes: '巻き戻し検証（永続化）' },
      'test-actor-id',
      created.createdAt
    );

    vi.useRealTimers();

    const row = await prisma.tradingPartner.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
  });

  it('壁時計が巻き戻っても論理削除の削除日時・更新日時が作成日時より前にならない (trading-partner-management/REQ-11.12)', async () => {
    const created = await createPartner('delete-rollback');

    // 更新と同じ巻き戻しを論理削除にも当てる。論理削除は `deletedAt` と
    // `updatedAt` を同時に動かす 1 回の更新であり、同じ逆転が起こりうる。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(created.createdAt.getTime() - CLOCK_ROLLBACK_MS));

    // 前提（巻き戻しが効いていること）は読み飛ばさず検証する。
    // 効いていなければこの検証は成立しないので、失敗として倒す。
    expect(Date.now()).toBeLessThan(created.createdAt.getTime());

    await service.deletePartner(created.id, 'test-actor-id');

    vi.useRealTimers();

    const row = await prisma.tradingPartner.findUniqueOrThrow({ where: { id: created.id } });

    const persistedDeletedAt = row.deletedAt;
    if (persistedDeletedAt === null) {
      throw new Error('論理削除した行の deletedAt が null である（削除が成立していない）');
    }

    expect(persistedDeletedAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
    // 2 列は同じ瞬間から採る（別々に採ると両者の間で新たな逆転が生まれる）。
    expect(persistedDeletedAt.getTime()).toBe(row.updatedAt.getTime());
  });

  it('時計が正常なときは論理削除の削除日時が実時刻のまま残る (trading-partner-management/REQ-11.12)', async () => {
    const created = await createPartner('delete-forward');

    // 押し上げが過剰に効いていないことを見る側。時計が正常なら実時刻がそのまま残る。
    const forwardNow = new Date(created.createdAt.getTime() + CLOCK_ROLLBACK_MS);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(forwardNow);

    expect(Date.now()).toBeGreaterThan(created.createdAt.getTime());

    await service.deletePartner(created.id, 'test-actor-id');

    vi.useRealTimers();

    const row = await prisma.tradingPartner.findUniqueOrThrow({ where: { id: created.id } });

    const persistedDeletedAt = row.deletedAt;
    if (persistedDeletedAt === null) {
      throw new Error('論理削除した行の deletedAt が null である（削除が成立していない）');
    }

    expect(persistedDeletedAt.getTime()).toBe(forwardNow.getTime());
    expect(row.updatedAt.getTime()).toBe(forwardNow.getTime());
  });

  it('時計が正常に進んでいるときは実時刻がそのまま更新日時になる (trading-partner-management/REQ-11.12)', async () => {
    const created = await createPartner('forward');

    const forwardNow = new Date(created.createdAt.getTime() + CLOCK_ROLLBACK_MS);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(forwardNow);

    const updated = await service.updatePartner(
      created.id,
      { notes: '前進検証' },
      'test-actor-id',
      created.createdAt
    );

    expect(updated.updatedAt.getTime()).toBe(forwardNow.getTime());
  });
});
