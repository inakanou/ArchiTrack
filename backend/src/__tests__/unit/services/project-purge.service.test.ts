/**
 * @fileoverview ProjectPurgeService の単体テスト
 *
 * Task 81.1: 完全削除の対象と、ファイルのキー・種類ごとの件数を集める
 * Task 81.2: ファイル→DB の順で完全に削除し、監査に記録する
 *
 * Requirements (project-management):
 * - 46.1: 論理削除の日時から 90 日間は保持する（89 日は対象外、90 日を過ぎたものは対象）
 * - 46.8: 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 * - 9.6: 関連データを保持期間の後に共に削除する
 * - 46.6: 完全削除を件数と日時で監査に記録する（名前とキーを含まない。D8）
 * - 46.7: 失敗したプロジェクトは消さずに記録し、次のプロジェクトへ進む
 * - 46.9: 監査ログは消さない
 * - 46.10: 失敗したものは記録し、試みていないものと試みた日時の古いものの後に回す（Task 83.2）
 * - 46.13: 対象から外したものは選ばない（Task 83.2）
 * - 46.11: 5 回続けて失敗したものを対象から外し、記録し、全システム管理者へ知らせる（Task 83.3、D12）
 * - 46.12: 対象から外したことの記録と通知に名前・ファイルのキー・エラーの文言を含めない（Task 83.3）
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import logger from '../../../utils/logger.js';
import {
  ProjectPurgeService,
  PROJECT_PURGE_BATCH_SIZE,
  PROJECT_PURGE_MAX_FAILURES,
  PROJECT_PURGE_RETENTION_DAYS,
} from '../../../services/project-purge.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T03:30:00.000Z');

/** now から days 日（と ms ミリ秒）前の日時 */
function daysAgo(days: number, ms = 0): Date {
  return new Date(NOW.getTime() - days * DAY_MS - ms);
}

type PurgeStateRow = { failureCount: number; lastAttemptAt: Date | null; excludedAt: Date | null };
type ProjectRow = { id: string; deletedAt: Date | null; purgeState?: PurgeStateRow | null };

type ProjectWhere = {
  deletedAt?: { lt?: Date; lte?: Date; not?: null } | null;
  OR?: Array<{ purgeState?: { is: { excludedAt: null } | null } }>;
};

/** where の deletedAt の条件で絞る（lt / lte / not: null だけを解す） */
function matchDeletedAt(row: ProjectRow, cond: ProjectWhere['deletedAt']): boolean {
  if (cond === undefined) return true;
  if (cond === null) return row.deletedAt === null;
  if (row.deletedAt === null) return false;
  if (cond.lt && !(row.deletedAt.getTime() < cond.lt.getTime())) return false;
  if (cond.lte && !(row.deletedAt.getTime() <= cond.lte.getTime())) return false;
  return true;
}

/** where の OR の purgeState の条件で絞る（記録が無い / excludedAt が空 だけを解す） */
function matchPurgeStateOr(row: ProjectRow, or: ProjectWhere['OR']): boolean {
  if (or === undefined) return true;
  return or.some((cond) => {
    const is = cond.purgeState?.is;
    if (is === undefined) throw new Error(`unsupported OR condition: ${JSON.stringify(cond)}`);
    if (is === null) return !row.purgeState;
    return !!row.purgeState && row.purgeState.excludedAt === null;
  });
}

type SortDir = 'asc' | 'desc';
type OrderEntry =
  | { deletedAt: SortDir }
  | { id: SortDir }
  | { purgeState: { lastAttemptAt: { sort: SortDir; nulls: 'first' | 'last' } } };

/** 1 つの並びの項目で 2 行を比べる（purgeState は記録の無いものを空として扱う） */
function compareBy(a: ProjectRow, b: ProjectRow, order: OrderEntry): number {
  const [key, spec] = Object.entries(order)[0] as [string, unknown];
  let av: number | string | null;
  let bv: number | string | null;
  let dir: SortDir;
  let nulls: 'first' | 'last' = 'last';
  if (key === 'purgeState') {
    const s = (spec as { lastAttemptAt: { sort: SortDir; nulls: 'first' | 'last' } }).lastAttemptAt;
    dir = s.sort;
    nulls = s.nulls;
    av = a.purgeState?.lastAttemptAt?.getTime() ?? null;
    bv = b.purgeState?.lastAttemptAt?.getTime() ?? null;
  } else if (key === 'deletedAt' || key === 'id') {
    dir = spec as SortDir;
    av = key === 'id' ? a.id : (a.deletedAt?.getTime() ?? null);
    bv = key === 'id' ? b.id : (b.deletedAt?.getTime() ?? null);
  } else {
    throw new Error(`unsupported orderBy: ${key}`);
  }
  if (av === null && bv === null) return 0;
  if (av === null) return nulls === 'first' ? -1 : 1;
  if (bv === null) return nulls === 'first' ? 1 : -1;
  if (av < bv) return dir === 'asc' ? -1 : 1;
  if (av > bv) return dir === 'asc' ? 1 : -1;
  return 0;
}

/** プロジェクトの行を持つ偽の prisma（findMany と count が where・orderBy・take を解す） */
function createProjectTable(rows: ProjectRow[]) {
  const filter = (args: { where?: ProjectWhere } | undefined) =>
    rows.filter(
      (r) => matchDeletedAt(r, args?.where?.deletedAt) && matchPurgeStateOr(r, args?.where?.OR)
    );
  return {
    findMany: vi.fn(async (args: { where?: ProjectWhere; orderBy?: unknown; take?: number }) => {
      const orders = (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]).filter(
        Boolean
      ) as OrderEntry[];
      const sorted = [...filter(args)].sort((a, b) => {
        for (const o of orders) {
          const c = compareBy(a, b, o);
          if (c !== 0) return c;
        }
        return 0;
      });
      const taken = args.take === undefined ? sorted : sorted.slice(0, args.take);
      return taken.map((r) => ({ id: r.id, deletedAt: r.deletedAt }));
    }),
    count: vi.fn(async (args: { where?: ProjectWhere }) => filter(args).length),
  };
}

type PurgeStateUpsertArgs = {
  where: { projectId: string };
  create: { projectId: string; failureCount: number; lastAttemptAt: Date };
  update: { failureCount: { increment: number }; lastAttemptAt: Date };
};

type PurgeStateUpdateManyArgs = {
  where: { projectId: string; excludedAt: null; failureCount: { gte: number } };
  data: { excludedAt: Date };
};

/** 失敗の記録の偽の表（upsert・updateMany でプロジェクトの行の purgeState を書き換える） */
function createPurgeStateTable(rows: ProjectRow[]) {
  return {
    updateMany: vi.fn(async (args: PurgeStateUpdateManyArgs) => {
      const row = rows.find((r) => r.id === args.where.projectId);
      const state = row?.purgeState;
      if (!row || !state || state.excludedAt !== null) return { count: 0 };
      if (state.failureCount < args.where.failureCount.gte) return { count: 0 };
      row.purgeState = { ...state, excludedAt: args.data.excludedAt };
      return { count: 1 };
    }),
    upsert: vi.fn(async (args: PurgeStateUpsertArgs) => {
      const row = rows.find((r) => r.id === args.where.projectId);
      if (!row) throw new Error(`no project: ${args.where.projectId}`);
      if (row.purgeState) {
        row.purgeState = {
          ...row.purgeState,
          failureCount: row.purgeState.failureCount + args.update.failureCount.increment,
          lastAttemptAt: args.update.lastAttemptAt,
        };
      } else {
        row.purgeState = {
          failureCount: args.create.failureCount,
          lastAttemptAt: args.create.lastAttemptAt,
          excludedAt: null,
        };
      }
      return { projectId: row.id, ...row.purgeState };
    }),
  };
}

function createMockPrisma(projects: ProjectRow[] = []) {
  return {
    project: createProjectTable(projects),
    projectPurgeState: createPurgeStateTable(projects),
    siteSurvey: { count: vi.fn().mockResolvedValue(0) },
    surveyImage: { findMany: vi.fn().mockResolvedValue([]) },
    quantityTable: { count: vi.fn().mockResolvedValue(0) },
    itemizedStatement: { count: vi.fn().mockResolvedValue(0) },
    estimateRequest: { count: vi.fn().mockResolvedValue(0) },
    receivedQuotation: { findMany: vi.fn().mockResolvedValue([]) },
    estimate: { count: vi.fn().mockResolvedValue(0) },
    contract: { count: vi.fn().mockResolvedValue(0) },
    constructionSchedule: { count: vi.fn().mockResolvedValue(0) },
    executionBudget: { count: vi.fn().mockResolvedValue(0) },
    constructionPhotoAlbum: { count: vi.fn().mockResolvedValue(0) },
    constructionPhoto: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

function createService(prisma: MockPrisma) {
  const storageProvider = { type: 'local', delete: vi.fn() } as unknown as StorageProvider;
  return new ProjectPurgeService({
    prisma: prisma as unknown as PrismaClient,
    storageProvider,
  });
}

describe('ProjectPurgeService', () => {
  describe('定数', () => {
    it('保持期間は 90 日、1 回の件数は 20 件である（46.1、D7）', () => {
      expect(PROJECT_PURGE_RETENTION_DAYS).toBe(90);
      expect(PROJECT_PURGE_BATCH_SIZE).toBe(20);
    });
  });

  describe('selectTargets（完全削除の対象）', () => {
    it('論理削除から 90 日を過ぎたものだけを選び、89 日・ちょうど 90 日・未削除は選ばない（46.1）', async () => {
      const prisma = createMockPrisma([
        { id: 'p-89', deletedAt: daysAgo(89) },
        { id: 'p-89-23h', deletedAt: daysAgo(89, 23 * 60 * 60 * 1000) },
        { id: 'p-90-exact', deletedAt: daysAgo(90) },
        { id: 'p-90-plus-1ms', deletedAt: daysAgo(90, 1) },
        { id: 'p-91', deletedAt: daysAgo(91) },
        { id: 'p-alive', deletedAt: null },
      ]);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets.map((t) => t.id)).toEqual(['p-91', 'p-90-plus-1ms']);
      expect(result.remainingCandidates).toBe(0);
    });

    it('導入の前に論理削除された古いものも同じ条件で選ぶ（46.8）', async () => {
      const prisma = createMockPrisma([
        { id: 'p-old', deletedAt: new Date('2024-01-15T00:00:00.000Z') },
        { id: 'p-recent', deletedAt: daysAgo(10) },
      ]);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets).toEqual([
        { id: 'p-old', deletedAt: new Date('2024-01-15T00:00:00.000Z') },
      ]);
    });

    it('論理削除の古い順に最大 20 件を選び、残りの件数を数える（D7）', async () => {
      // 25 件を古さがばらばらの順で並べる
      const rows: ProjectRow[] = Array.from({ length: 25 }, (_, i) => {
        const order = (i * 7) % 25; // 0..24 の並べ替え
        return { id: `p-${String(order).padStart(2, '0')}`, deletedAt: daysAgo(200 - order) };
      });
      rows.push({ id: 'p-young', deletedAt: daysAgo(30) });
      const prisma = createMockPrisma(rows);
      const service = createService(prisma);

      const result = await service.selectTargets(NOW);

      expect(result.targets).toHaveLength(20);
      expect(result.targets.map((t) => t.id)).toEqual(
        Array.from({ length: 20 }, (_, i) => `p-${String(i).padStart(2, '0')}`)
      );
      expect(result.remainingCandidates).toBe(5);
    });

    it('対象の条件と件数の条件は同じで、締めの日時は now の 90 日前、対象から外したものを除く', async () => {
      const prisma = createMockPrisma([]);
      const service = createService(prisma);

      await service.selectTargets(NOW);

      const cutoff = new Date(NOW.getTime() - 90 * DAY_MS);
      const findArgs = prisma.project.findMany.mock.calls[0]![0];
      const countArgs = prisma.project.count.mock.calls[0]![0];
      expect(findArgs.where).toEqual({
        deletedAt: { not: null, lt: cutoff },
        OR: [{ purgeState: { is: null } }, { purgeState: { is: { excludedAt: null } } }],
      });
      expect(countArgs.where).toEqual(findArgs.where);
      expect(findArgs.take).toBe(20);
    });
  });

  describe('collectProjectAssets（ファイルのキーと種類ごとの件数）', () => {
    let prisma: MockPrisma;

    beforeEach(() => {
      prisma = createMockPrisma();
    });

    it('現場調査の画像・工事写真・受領見積書のキーを重複なく集め、空のキーは除く', async () => {
      prisma.surveyImage.findMany.mockResolvedValue([
        {
          originalPath: 'surveys/a/original.jpg',
          thumbnailPath: 'surveys/a/thumb.jpg',
          annotatedThumbnailPath: 'surveys/a/annotated.jpg',
        },
        {
          originalPath: 'surveys/b/original.jpg',
          thumbnailPath: 'surveys/b/thumb.jpg',
          annotatedThumbnailPath: null,
        },
      ]);
      prisma.constructionPhoto.findMany.mockResolvedValue([
        // 現調からの写しで同じキーを指すことがある
        { originalPath: 'surveys/a/original.jpg', thumbnailPath: 'photos/c/thumb.jpg' },
        { originalPath: 'photos/d/original.jpg', thumbnailPath: 'photos/d/thumb.jpg' },
      ]);
      prisma.receivedQuotation.findMany.mockResolvedValue([
        { filePath: 'quotations/e.pdf' },
        { filePath: null },
        { filePath: 'quotations/e.pdf' },
        { filePath: '' },
      ]);
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.fileKeys).toEqual([
        'surveys/a/original.jpg',
        'surveys/a/thumb.jpg',
        'surveys/a/annotated.jpg',
        'surveys/b/original.jpg',
        'surveys/b/thumb.jpg',
        'photos/c/thumb.jpg',
        'photos/d/original.jpg',
        'photos/d/thumb.jpg',
        'quotations/e.pdf',
      ]);
      expect(result.counts.files).toBe(9);
      expect(result.counts.surveyImages).toBe(2);
      expect(result.counts.constructionPhotos).toBe(2);
      expect(result.counts.receivedQuotations).toBe(4);
    });

    it('個別に論理削除された関連データも含めて集める（deletedAt で絞らない）', async () => {
      const service = createService(prisma);

      await service.collectProjectAssets('project-1');

      expect(prisma.surveyImage.findMany).toHaveBeenCalledWith({
        where: { survey: { projectId: 'project-1' } },
        select: { originalPath: true, thumbnailPath: true, annotatedThumbnailPath: true },
      });
      expect(prisma.constructionPhoto.findMany).toHaveBeenCalledWith({
        where: { album: { projectId: 'project-1' } },
        select: { originalPath: true, thumbnailPath: true },
      });
      // 受領見積書は両方の文脈（案件に直接・見積依頼を通して）
      expect(prisma.receivedQuotation.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ projectId: 'project-1' }, { estimateRequest: { projectId: 'project-1' } }],
        },
        select: { filePath: true },
      });
      const countModels = [
        prisma.siteSurvey,
        prisma.quantityTable,
        prisma.itemizedStatement,
        prisma.estimateRequest,
        prisma.estimate,
        prisma.contract,
        prisma.constructionSchedule,
        prisma.executionBudget,
        prisma.constructionPhotoAlbum,
      ];
      for (const model of countModels) {
        expect(model.count).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
      }
      // どの条件にも deletedAt が無い
      const allArgs = [
        ...prisma.surveyImage.findMany.mock.calls,
        ...prisma.constructionPhoto.findMany.mock.calls,
        ...prisma.receivedQuotation.findMany.mock.calls,
        ...countModels.flatMap((m) => (m.count as Mock).mock.calls),
      ];
      expect(JSON.stringify(allArgs)).not.toContain('deletedAt');
    });

    it('種類ごとの件数を返す', async () => {
      prisma.siteSurvey.count.mockResolvedValue(3);
      prisma.surveyImage.findMany.mockResolvedValue([
        { originalPath: 'o1', thumbnailPath: 't1', annotatedThumbnailPath: null },
      ]);
      prisma.quantityTable.count.mockResolvedValue(4);
      prisma.itemizedStatement.count.mockResolvedValue(5);
      prisma.estimateRequest.count.mockResolvedValue(6);
      prisma.receivedQuotation.findMany.mockResolvedValue([{ filePath: null }, { filePath: null }]);
      prisma.estimate.count.mockResolvedValue(7);
      prisma.contract.count.mockResolvedValue(8);
      prisma.constructionSchedule.count.mockResolvedValue(9);
      prisma.executionBudget.count.mockResolvedValue(1);
      prisma.constructionPhotoAlbum.count.mockResolvedValue(10);
      prisma.constructionPhoto.findMany.mockResolvedValue([
        { originalPath: 'po1', thumbnailPath: 'pt1' },
        { originalPath: 'po2', thumbnailPath: 'pt2' },
        { originalPath: 'po3', thumbnailPath: 'pt3' },
      ]);
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.counts).toEqual({
        siteSurveys: 3,
        surveyImages: 1,
        quantityTables: 4,
        itemizedStatements: 5,
        estimateRequests: 6,
        receivedQuotations: 2,
        estimates: 7,
        contracts: 8,
        schedules: 9,
        executionBudgets: 1,
        constructionPhotoAlbums: 10,
        constructionPhotos: 3,
        files: 8,
      });
    });

    it('関連データが無ければ件数はすべて 0 でキーは空である', async () => {
      const service = createService(prisma);

      const result = await service.collectProjectAssets('project-1');

      expect(result.fileKeys).toEqual([]);
      expect(Object.values(result.counts).every((n) => n === 0)).toBe(true);
      expect(Object.keys(result.counts)).toHaveLength(13);
    });
  });
});

describe('ProjectPurgeService.purgeExpired（完全削除）', () => {
  /** ストレージの削除とトランザクションの中の呼び出しを一つの並びに記録する */
  let calls: string[];
  let prisma: ReturnType<typeof createPurgePrisma>;
  let storageDelete: Mock;

  /** トランザクションの中で消す順に並べたモデル（deleteMany を持つもの） */
  const TX_DELETE_MANY_MODELS = [
    'progressRecordItem',
    'orderItem',
    'progressRecord',
    'order',
    'monthlyCloseHistory',
    'amendmentApplyHistory',
    'executionBudgetItem',
    'executionBudget',
    'receivedQuotation',
    'estimateRequestItem',
    'estimateRequestStatusHistory',
    'estimateRequest',
  ] as const;

  function createTx() {
    const tx: Record<string, Record<string, Mock>> = {};
    for (const model of TX_DELETE_MANY_MODELS) {
      tx[model] = {
        deleteMany: vi.fn(async (args: unknown) => {
          calls.push(`${model}.deleteMany`);
          void args;
          return { count: 0 };
        }),
      };
    }
    tx.project = {
      delete: vi.fn(async (args: { where: { id: string } }) => {
        calls.push('project.delete');
        return { id: args.where.id };
      }),
    };
    tx.auditLog = {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push('auditLog.create');
        return { id: 'audit-1', createdAt: NOW, ...args.data };
      }),
    };
    tx.user = { findUnique: vi.fn().mockResolvedValue(null) };
    return tx;
  }

  /** プロジェクトごとのキーを返す偽の prisma（トランザクションは tx を渡して呼ぶ） */
  function createPurgePrisma(projects: ProjectRow[], keysByProject: Record<string, string[]>) {
    const base = createMockPrisma(projects);
    base.surveyImage.findMany.mockImplementation(
      async (args: { where: { survey: { projectId: string } } }) =>
        (keysByProject[args.where.survey.projectId] ?? []).map((key) => ({
          originalPath: key,
          thumbnailPath: null,
          annotatedThumbnailPath: null,
        }))
    );
    const txs: ReturnType<typeof createTx>[] = [];
    const $transaction = vi.fn(
      async (fn: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[], _options?: unknown) => {
        // 配列は失敗の記録の書き込み（一つのトランザクションにまとめた書き込み）
        if (Array.isArray(fn)) return Promise.all(fn);
        calls.push('$transaction');
        const tx = createTx();
        txs.push(tx);
        return fn(tx);
      }
    );
    return { ...base, $transaction, txs };
  }

  /** 削除のトランザクション（関数を渡した呼び出し）だけを返す */
  function deletionTransactionCalls() {
    return prisma.$transaction.mock.calls.filter(([arg]) => typeof arg === 'function');
  }

  function createPurgeService() {
    storageDelete = vi.fn(async (key: string) => {
      calls.push(`storage.delete:${key}`);
    });
    const storageProvider = { type: 'local', delete: storageDelete } as unknown as StorageProvider;
    return new ProjectPurgeService({
      prisma: prisma as unknown as PrismaClient,
      storageProvider,
    });
  }

  beforeEach(() => {
    calls = [];
    vi.mocked(logger.error).mockClear();
  });

  it('ファイルを 1 件ずつ消してから、トランザクションで Restrict の行を葉から消し、プロジェクトを消して記録する（D6）', async () => {
    prisma = createPurgePrisma([{ id: 'p-1', deletedAt: daysAgo(100) }], {
      'p-1': ['k-1', 'k-2'],
    });
    const service = createPurgeService();

    await service.purgeExpired(NOW);

    expect(calls).toEqual([
      'storage.delete:k-1',
      'storage.delete:k-2',
      '$transaction',
      // 出来高の項目 → 発注の項目（実行予算の項目を Restrict で参照する）
      'progressRecordItem.deleteMany',
      'orderItem.deleteMany',
      // 出来高・発注・月次の締め・改定の履歴
      'progressRecord.deleteMany',
      'order.deleteMany',
      'monthlyCloseHistory.deleteMany',
      'amendmentApplyHistory.deleteMany',
      // 実行予算の項目 → 実行予算（契約書を Restrict で参照する）
      'executionBudgetItem.deleteMany',
      'executionBudget.deleteMany',
      // 受領見積書（プロジェクトを Restrict で参照する）
      'receivedQuotation.deleteMany',
      // 見積依頼の項目・状態の履歴 → 見積依頼（内訳書・内訳書の項目を Restrict で参照する）
      'estimateRequestItem.deleteMany',
      'estimateRequestStatusHistory.deleteMany',
      'estimateRequest.deleteMany',
      // 残りは連鎖に任せる
      'project.delete',
      'auditLog.create',
    ]);
  });

  it('トランザクションの中の削除はそのプロジェクトの行に絞る', async () => {
    prisma = createPurgePrisma([{ id: 'p-1', deletedAt: daysAgo(100) }], {});
    const service = createPurgeService();

    await service.purgeExpired(NOW);

    const tx = prisma.txs[0]!;
    const byBudget = { executionBudget: { projectId: 'p-1' } };
    const byRequest = { estimateRequest: { projectId: 'p-1' } };
    const expected: Record<string, unknown> = {
      progressRecordItem: { progressRecord: byBudget },
      orderItem: { order: byBudget },
      progressRecord: byBudget,
      order: byBudget,
      monthlyCloseHistory: byBudget,
      amendmentApplyHistory: byBudget,
      executionBudgetItem: byBudget,
      executionBudget: { projectId: 'p-1' },
      receivedQuotation: { OR: [{ projectId: 'p-1' }, byRequest] },
      estimateRequestItem: byRequest,
      estimateRequestStatusHistory: byRequest,
      estimateRequest: { projectId: 'p-1' },
    };
    for (const model of TX_DELETE_MANY_MODELS) {
      expect(tx[model]!.deleteMany).toHaveBeenCalledWith({ where: expected[model] });
    }
    expect(tx.project!.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
  });

  it('監査には件数と日時だけを記録し、プロジェクト名とファイルのキーを含めない（46.6、D8）', async () => {
    const deletedAt = daysAgo(100);
    prisma = createPurgePrisma([{ id: 'p-1', deletedAt }], {
      'p-1': ['surveys/secret-name/original.jpg'],
    });
    prisma.siteSurvey.count.mockResolvedValue(2);
    prisma.executionBudget.count.mockResolvedValue(1);
    const service = createPurgeService();

    await service.purgeExpired(NOW);

    const tx = prisma.txs[0]!;
    expect(tx.auditLog!.create).toHaveBeenCalledTimes(1);
    const data = tx.auditLog!.create!.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      action: 'PROJECT_PURGED',
      actorId: null,
      actorEmail: null,
      actorDisplayName: null,
      targetType: 'Project',
      targetId: 'p-1',
    });
    expect(data.metadata).toEqual({
      deletedAt: deletedAt.toISOString(),
      purgedAt: NOW.toISOString(),
      counts: {
        siteSurveys: 2,
        surveyImages: 1,
        quantityTables: 0,
        itemizedStatements: 0,
        estimateRequests: 0,
        receivedQuotations: 0,
        estimates: 0,
        contracts: 0,
        schedules: 0,
        executionBudgets: 1,
        constructionPhotoAlbums: 0,
        constructionPhotos: 0,
        files: 1,
      },
    });
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('surveys/secret-name/original.jpg');
    expect(serialized).not.toContain('"name"');
    expect(serialized).not.toContain('projectName');
  });

  it('ファイルの削除が一つでも失敗したら、残りのファイルも DB も消さずに記録し、次のプロジェクトへ進む（46.7）', async () => {
    prisma = createPurgePrisma(
      [
        { id: 'p-1', deletedAt: daysAgo(120) },
        { id: 'p-2', deletedAt: daysAgo(110) },
      ],
      { 'p-1': ['k-1', 'k-fail', 'k-3'], 'p-2': ['k-4'] }
    );
    const service = createPurgeService();
    storageDelete.mockImplementation(async (key: string) => {
      calls.push(`storage.delete:${key}`);
      if (key === 'k-fail') throw new Error('storage unavailable: k-fail');
    });

    const result = await service.purgeExpired(NOW);

    // p-1 は失敗した後のキーを消さず、DB も消さない。p-2 へ進む
    expect(calls.slice(0, 4)).toEqual([
      'storage.delete:k-1',
      'storage.delete:k-fail',
      'storage.delete:k-4',
      '$transaction',
    ]);
    // 削除のトランザクションは p-2 の 1 回だけ（失敗の記録の書き込みは数えない）
    expect(prisma.txs).toHaveLength(1);
    expect(prisma.txs[0]!.project!.delete).toHaveBeenCalledWith({ where: { id: 'p-2' } });
    expect(result.failedProjectIds).toEqual(['p-1']);
    expect(result.purgedProjectIds).toEqual(['p-2']);
    // 記録はプロジェクト ID と段階（キーを含めない）
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logged] = vi.mocked(logger.error).mock.calls[0]! as unknown as [Record<string, unknown>];
    expect(logged).toMatchObject({ projectId: 'p-1', stage: 'files' });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('k-fail');
  });

  it('DB の削除が失敗したら記録して次のプロジェクトへ進む（46.7）', async () => {
    prisma = createPurgePrisma(
      [
        { id: 'p-1', deletedAt: daysAgo(120) },
        { id: 'p-2', deletedAt: daysAgo(110) },
      ],
      {}
    );
    // 他のプロジェクトの見積依頼が内訳書を参照しているときの Restrict の失敗を模す
    prisma.$transaction.mockImplementationOnce(async () => {
      calls.push('$transaction');
      throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
    });
    const service = createPurgeService();

    const result = await service.purgeExpired(NOW);

    // 削除のトランザクションは 2 回（失敗の記録の書き込みは数えない）
    expect(deletionTransactionCalls()).toHaveLength(2);
    expect(result.failedProjectIds).toEqual(['p-1']);
    expect(result.purgedProjectIds).toEqual(['p-2']);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logged] = vi.mocked(logger.error).mock.calls[0]! as unknown as [Record<string, unknown>];
    expect(logged).toMatchObject({ projectId: 'p-1', stage: 'database' });
  });

  it('監査ログを消さない（46.9）', async () => {
    prisma = createPurgePrisma([{ id: 'p-1', deletedAt: daysAgo(100) }], {});
    const service = createPurgeService();

    await service.purgeExpired(NOW);

    expect(calls.some((c) => c.startsWith('auditLog.') && c !== 'auditLog.create')).toBe(false);
  });

  it('結果に完全削除したもの・失敗したもの・残りの件数を返す', async () => {
    const rows: ProjectRow[] = Array.from({ length: 23 }, (_, i) => ({
      id: `p-${String(i).padStart(2, '0')}`,
      deletedAt: daysAgo(200 - i),
    }));
    prisma = createPurgePrisma(rows, {});
    const service = createPurgeService();

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({
      purgedProjectIds: Array.from({ length: 20 }, (_, i) => `p-${String(i).padStart(2, '0')}`),
      failedProjectIds: [],
      excludedProjectIds: [],
      remainingCandidates: 3,
    });
  });

  it('対象が無ければ何も消さない', async () => {
    prisma = createPurgePrisma([{ id: 'p-young', deletedAt: daysAgo(89) }], {});
    const service = createPurgeService();

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({
      purgedProjectIds: [],
      failedProjectIds: [],
      excludedProjectIds: [],
      remainingCandidates: 0,
    });
    expect(storageDelete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('失敗の記録と後ろへ回す選び方（46.10・46.13、D10・D11）', () => {
    const LATER = new Date(NOW.getTime() + DAY_MS);

    /** 指定したプロジェクトの DB の削除を毎回失敗させる（Restrict の失敗を模す） */
    function failDatabaseFor(failing: Set<string>) {
      prisma.$transaction.mockImplementation(async (fn) => {
        if (Array.isArray(fn)) return Promise.all(fn);
        calls.push('$transaction');
        const tx = createTx();
        prisma.txs.push(tx);
        const project = tx.project!;
        const originalDelete = project.delete!;
        project.delete = vi.fn(async (args: { where: { id: string } }) => {
          if (failing.has(args.where.id)) {
            throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
          }
          return originalDelete(args);
        });
        return fn(tx);
      });
    }

    it('毎回失敗するものが 20 件あっても、次の回は試みていないものを先に選ぶ（46.10、D10）', async () => {
      const failingRows: ProjectRow[] = Array.from({ length: 20 }, (_, i) => ({
        id: `p-fail-${String(i).padStart(2, '0')}`,
        deletedAt: daysAgo(300 - i),
      }));
      const rows: ProjectRow[] = [...failingRows, { id: 'p-new', deletedAt: daysAgo(95) }];
      prisma = createPurgePrisma(rows, {});
      failDatabaseFor(new Set(failingRows.map((r) => r.id)));
      const service = createPurgeService();

      const first = await service.purgeExpired(NOW);
      expect(first.failedProjectIds).toEqual(failingRows.map((r) => r.id));
      expect(first.purgedProjectIds).toEqual([]);
      expect(first.remainingCandidates).toBe(1);

      const second = await service.purgeExpired(LATER);
      // 試みていない p-new が先で、失敗したものはその後
      expect(second.purgedProjectIds).toEqual(['p-new']);
      expect(second.failedProjectIds).toEqual(failingRows.slice(0, 19).map((r) => r.id));
    });

    it('試みていないもの → 最後に試みた日時の古いもの → 論理削除の古い順に選ぶ（46.10）', async () => {
      prisma = createPurgePrisma(
        [
          {
            id: 'p-tried-recent',
            deletedAt: daysAgo(400),
            purgeState: { failureCount: 1, lastAttemptAt: daysAgo(1), excludedAt: null },
          },
          {
            id: 'p-tried-old',
            deletedAt: daysAgo(100),
            purgeState: { failureCount: 2, lastAttemptAt: daysAgo(3), excludedAt: null },
          },
          { id: 'p-untried-b', deletedAt: daysAgo(150) },
          { id: 'p-untried-a', deletedAt: daysAgo(200) },
          {
            // 記録はあるが試みた日時が空（対象に戻したもの）は試みていないものと同じ扱い
            id: 'p-requeued',
            deletedAt: daysAgo(180),
            purgeState: { failureCount: 0, lastAttemptAt: null, excludedAt: null },
          },
        ],
        {}
      );
      const service = createPurgeService();

      const result = await service.selectTargets(NOW);

      expect(result.targets.map((t) => t.id)).toEqual([
        'p-untried-a',
        'p-requeued',
        'p-untried-b',
        'p-tried-old',
        'p-tried-recent',
      ]);
      const findArgs = prisma.project.findMany.mock.calls[0]![0];
      expect(findArgs.orderBy).toEqual([
        { purgeState: { lastAttemptAt: { sort: 'asc', nulls: 'first' } } },
        { deletedAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('対象から外したものは選ばず、残りの件数にも数えない（46.13）', async () => {
      const rows: ProjectRow[] = Array.from({ length: 22 }, (_, i) => ({
        id: `p-${String(i).padStart(2, '0')}`,
        deletedAt: daysAgo(200 - i),
      }));
      rows.push({
        id: 'p-excluded',
        deletedAt: daysAgo(500),
        purgeState: { failureCount: 5, lastAttemptAt: daysAgo(1), excludedAt: daysAgo(1) },
      });
      prisma = createPurgePrisma(rows, {});
      const service = createPurgeService();

      const selection = await service.selectTargets(NOW);
      expect(selection.targets.map((t) => t.id)).not.toContain('p-excluded');
      expect(selection.targets).toHaveLength(20);
      expect(selection.remainingCandidates).toBe(2);

      const result = await service.purgeExpired(NOW);
      expect(result.purgedProjectIds).not.toContain('p-excluded');
      expect(result.failedProjectIds).not.toContain('p-excluded');
      expect(result.remainingCandidates).toBe(2);
      // 対象から外したものには何もしない
      expect(prisma.projectPurgeState.upsert).not.toHaveBeenCalled();
    });

    it.each([['collect' as const], ['files' as const], ['database' as const]])(
      '%s の段で失敗したら、トランザクションの外で回数を 1 増やし最後に試みた日時を付ける（46.10）',
      async (stage) => {
        prisma = createPurgePrisma([{ id: 'p-1', deletedAt: daysAgo(100) }], { 'p-1': ['k-1'] });
        const service = createPurgeService();
        if (stage === 'collect') {
          prisma.siteSurvey.count.mockRejectedValue(new Error('db down'));
        } else if (stage === 'files') {
          storageDelete.mockRejectedValue(new Error('storage unavailable: k-1'));
        } else {
          failDatabaseFor(new Set(['p-1']));
        }

        const result = await service.purgeExpired(NOW);

        expect(result.failedProjectIds).toEqual(['p-1']);
        expect(prisma.projectPurgeState.upsert).toHaveBeenCalledTimes(1);
        expect(prisma.projectPurgeState.upsert).toHaveBeenCalledWith({
          where: { projectId: 'p-1' },
          create: { projectId: 'p-1', failureCount: 1, lastAttemptAt: NOW },
          update: { failureCount: { increment: 1 }, lastAttemptAt: NOW },
        });
        // 削除のトランザクションの中では書かない（ロールバックで消えないように）
        for (const tx of prisma.txs) {
          expect(tx.projectPurgeState).toBeUndefined();
        }
        const logged = vi.mocked(logger.error).mock.calls[0]![0] as unknown as Record<
          string,
          unknown
        >;
        expect(logged).toMatchObject({ projectId: 'p-1', stage });
      }
    );

    it('続けて失敗すると回数が増え、最後に試みた日時が新しくなる（D11）', async () => {
      const rows: ProjectRow[] = [{ id: 'p-1', deletedAt: daysAgo(100) }];
      prisma = createPurgePrisma(rows, {});
      failDatabaseFor(new Set(['p-1']));
      const service = createPurgeService();

      await service.purgeExpired(NOW);
      expect(rows[0]!.purgeState).toEqual({
        failureCount: 1,
        lastAttemptAt: NOW,
        excludedAt: null,
      });

      await service.purgeExpired(LATER);
      expect(rows[0]!.purgeState).toEqual({
        failureCount: 2,
        lastAttemptAt: LATER,
        excludedAt: null,
      });
    });

    it('成功したものには記録を書かない（記録は Cascade でプロジェクトと共に消える）', async () => {
      prisma = createPurgePrisma([{ id: 'p-1', deletedAt: daysAgo(100) }], {});
      const service = createPurgeService();

      const result = await service.purgeExpired(NOW);

      expect(result.purgedProjectIds).toEqual(['p-1']);
      expect(prisma.projectPurgeState.upsert).not.toHaveBeenCalled();
    });

    it('記録の書き込みが失敗しても記録して、次のプロジェクトへ進む', async () => {
      prisma = createPurgePrisma(
        [
          { id: 'p-1', deletedAt: daysAgo(120) },
          { id: 'p-2', deletedAt: daysAgo(110) },
          { id: 'p-3', deletedAt: daysAgo(105) },
        ],
        {}
      );
      failDatabaseFor(new Set(['p-1', 'p-2']));
      prisma.projectPurgeState.upsert.mockRejectedValueOnce(
        Object.assign(new Error('connection lost: secret-key'), { code: 'P1001' })
      );
      const service = createPurgeService();

      const result = await service.purgeExpired(NOW);

      expect(result.failedProjectIds).toEqual(['p-1', 'p-2']);
      expect(result.purgedProjectIds).toEqual(['p-3']);
      // p-1 の書き込みは失敗、p-2 の書き込みは進む
      expect(prisma.projectPurgeState.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.projectPurgeState.upsert.mock.calls[1]![0].where).toEqual({
        projectId: 'p-2',
      });
      const errorLogs = vi
        .mocked(logger.error)
        .mock.calls.map((c) => c as unknown as [Record<string, unknown>, string]);
      const recordFailure = errorLogs.filter(
        ([, message]) => message === 'Failed to record project purge failure'
      );
      expect(recordFailure).toHaveLength(1);
      expect(recordFailure[0]![0]).toEqual({
        projectId: 'p-1',
        errorName: 'Error',
        errorCode: 'P1001',
      });
      expect(JSON.stringify(errorLogs)).not.toContain('secret-key');
    });
  });

  describe('5 回続けて失敗したものを対象から外し、知らせる（46.11・46.12、D12）', () => {
    const LATER = new Date(NOW.getTime() + DAY_MS);
    const REQUEUE_COMMAND = 'npm run project:purge-requeue -- --project-id <ID>';
    let createLog: Mock;
    let notifyAllAdmins: Mock;

    /** 指定したプロジェクトの DB の削除を毎回失敗させる（エラーの文言にキーを含める） */
    function failDatabase(failing: Set<string>) {
      prisma.$transaction.mockImplementation(async (fn) => {
        if (Array.isArray(fn)) return Promise.all(fn);
        calls.push('$transaction');
        const tx = createTx();
        prisma.txs.push(tx);
        const originalDelete = tx.project!.delete!;
        tx.project!.delete = vi.fn(async (args: { where: { id: string } }) => {
          if (failing.has(args.where.id)) {
            throw Object.assign(new Error('Foreign key constraint violated: secret-message'), {
              code: 'P2003',
            });
          }
          return originalDelete(args);
        });
        return fn(tx);
      });
    }

    /** 監査の記録と通知の部品を差し替えた ProjectPurgeService を作る */
    function createExcludingService(options: { withNotifier?: boolean } = {}) {
      storageDelete = vi.fn(async (key: string) => {
        calls.push(`storage.delete:${key}`);
      });
      const storageProvider = {
        type: 'local',
        delete: storageDelete,
      } as unknown as StorageProvider;
      return new ProjectPurgeService({
        prisma: prisma as unknown as PrismaClient,
        storageProvider,
        auditLogService: { createLog },
        ...(options.withNotifier === false
          ? {}
          : { adminNotificationService: { notifyAllAdmins } }),
      });
    }

    /** 失敗の回数を持つ、対象から外していない記録 */
    function failedBefore(failureCount: number): PurgeStateRow {
      return { failureCount, lastAttemptAt: daysAgo(1), excludedAt: null };
    }

    function excludedLogs() {
      return createLog.mock.calls
        .map((c) => c[0] as Record<string, unknown>)
        .filter((input) => input.action === 'PROJECT_PURGE_EXCLUDED');
    }

    beforeEach(() => {
      createLog = vi.fn(async (input: Record<string, unknown>) => ({ id: 'audit-1', ...input }));
      notifyAllAdmins = vi.fn().mockResolvedValue(undefined);
    });

    it('上限は 5 回である', () => {
      expect(PROJECT_PURGE_MAX_FAILURES).toBe(5);
    });

    it('4 回目の失敗では外さず、5 回目の失敗で同じ書き込みで外して記録し、1 通知らせる（46.11）', async () => {
      const deletedAt = daysAgo(100);
      const rows: ProjectRow[] = [{ id: 'p-1', deletedAt, purgeState: failedBefore(3) }];
      prisma = createPurgePrisma(rows, {});
      failDatabase(new Set(['p-1']));
      const service = createExcludingService();

      // 4 回目: 外さない
      const fourth = await service.purgeExpired(NOW);
      expect(fourth.failedProjectIds).toEqual(['p-1']);
      expect(fourth.excludedProjectIds).toEqual([]);
      expect(rows[0]!.purgeState).toEqual({
        failureCount: 4,
        lastAttemptAt: NOW,
        excludedAt: null,
      });
      expect(excludedLogs()).toHaveLength(0);
      expect(notifyAllAdmins).not.toHaveBeenCalled();

      // 5 回目: 回数を増やす書き込みと対象から外す書き込みを一つのトランザクションで行う
      const fifth = await service.purgeExpired(LATER);
      expect(fifth.failedProjectIds).toEqual(['p-1']);
      expect(fifth.excludedProjectIds).toEqual(['p-1']);
      expect(rows[0]!.purgeState).toEqual({
        failureCount: 5,
        lastAttemptAt: LATER,
        excludedAt: LATER,
      });
      const batches = prisma.$transaction.mock.calls.filter(([arg]) => Array.isArray(arg));
      expect(batches).toHaveLength(2);
      expect(prisma.projectPurgeState.updateMany).toHaveBeenLastCalledWith({
        where: { projectId: 'p-1', excludedAt: null, failureCount: { gte: 5 } },
        data: { excludedAt: LATER },
      });

      // 監査は実行者なし・対象はプロジェクト、回数・日時・最後の失敗の段階だけ
      expect(excludedLogs()).toEqual([
        {
          action: 'PROJECT_PURGE_EXCLUDED',
          actorId: null,
          targetType: 'Project',
          targetId: 'p-1',
          metadata: {
            failureCount: 5,
            deletedAt: deletedAt.toISOString(),
            excludedAt: LATER.toISOString(),
            lastFailureStage: 'database',
          },
        },
      ]);
      // 削除のトランザクションの外で書く
      expect(createLog.mock.calls.find((c) => c[0].action === 'PROJECT_PURGE_EXCLUDED')).toEqual([
        expect.anything(),
      ]);

      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      const notification = notifyAllAdmins.mock.calls[0]![0] as {
        kind: string;
        subject: string;
        lines: string[];
      };
      expect(notification.kind).toBe('PROJECT_PURGE_EXCLUDED');
      expect(notification.subject).toContain('1 件');
      expect(notification.lines.some((l) => l.includes('p-1') && l.includes('5 回'))).toBe(true);
      expect(notification.lines).toContain(REQUEUE_COMMAND);

      // 外したものは次の回で選ばない
      const after = await service.purgeExpired(new Date(LATER.getTime() + DAY_MS));
      expect(after.failedProjectIds).toEqual([]);
      expect(after.excludedProjectIds).toEqual([]);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('記録と通知にプロジェクトの名前・ファイルのキー・エラーの文言を含めない（46.12）', async () => {
      const deletedAt = daysAgo(100);
      prisma = createPurgePrisma([{ id: 'p-1', deletedAt, purgeState: failedBefore(4) }], {
        'p-1': ['surveys/secret-name/original.jpg'],
      });
      const service = createExcludingService();
      storageDelete.mockRejectedValue(
        new Error('storage unavailable: surveys/secret-name/original.jpg secret-message')
      );

      const result = await service.purgeExpired(NOW);

      expect(result.excludedProjectIds).toEqual(['p-1']);
      expect(excludedLogs()).toHaveLength(1);
      expect(excludedLogs()[0]!.metadata).toEqual({
        failureCount: 5,
        deletedAt: deletedAt.toISOString(),
        excludedAt: NOW.toISOString(),
        lastFailureStage: 'files',
      });
      const serialized = JSON.stringify([excludedLogs(), notifyAllAdmins.mock.calls]);
      expect(serialized).not.toContain('secret-name');
      expect(serialized).not.toContain('secret-message');
      expect(serialized).not.toContain('original.jpg');
      expect(serialized).not.toContain('"name"');
      expect(serialized).not.toContain('projectName');
      // 通知の本文はプロジェクト ID・回数・対象に戻す手順のコマンド名だけ
      const { lines } = notifyAllAdmins.mock.calls[0]![0] as { lines: string[] };
      const idLines = lines.filter((l) => l.includes('p-1'));
      expect(idLines).toEqual(['プロジェクト ID: p-1（失敗の回数: 5 回）']);
    });

    it('同じ回で 2 件外しても通知は回の終わりに 1 通で、両方の ID と回数を載せる（D12）', async () => {
      prisma = createPurgePrisma(
        [
          { id: 'p-1', deletedAt: daysAgo(130), purgeState: failedBefore(4) },
          { id: 'p-2', deletedAt: daysAgo(120), purgeState: failedBefore(4) },
          { id: 'p-3', deletedAt: daysAgo(110), purgeState: failedBefore(1) },
          { id: 'p-4', deletedAt: daysAgo(100) },
        ],
        {}
      );
      failDatabase(new Set(['p-1', 'p-2', 'p-3']));
      const service = createExcludingService();
      notifyAllAdmins.mockImplementation(async () => {
        calls.push('notifyAllAdmins');
      });

      const result = await service.purgeExpired(NOW);

      expect(result.failedProjectIds.sort()).toEqual(['p-1', 'p-2', 'p-3']);
      expect(result.purgedProjectIds).toEqual(['p-4']);
      expect(result.excludedProjectIds.sort()).toEqual(['p-1', 'p-2']);
      expect(
        excludedLogs()
          .map((l) => l.targetId)
          .sort()
      ).toEqual(['p-1', 'p-2']);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      // 回の終わり（すべてのプロジェクトの処理の後）に送る
      expect(calls[calls.length - 1]).toBe('notifyAllAdmins');
      const { subject, lines } = notifyAllAdmins.mock.calls[0]![0] as {
        subject: string;
        lines: string[];
      };
      expect(subject).toContain('2 件');
      expect(lines).toContain('プロジェクト ID: p-1（失敗の回数: 5 回）');
      expect(lines).toContain('プロジェクト ID: p-2（失敗の回数: 5 回）');
      expect(lines.some((l) => l.includes('p-3'))).toBe(false);
    });

    it('外したものが無い回は通知しない', async () => {
      prisma = createPurgePrisma(
        [
          { id: 'p-1', deletedAt: daysAgo(120), purgeState: failedBefore(2) },
          { id: 'p-2', deletedAt: daysAgo(110) },
        ],
        {}
      );
      failDatabase(new Set(['p-1']));
      const service = createExcludingService();

      const result = await service.purgeExpired(NOW);

      expect(result.failedProjectIds).toEqual(['p-1']);
      expect(result.excludedProjectIds).toEqual([]);
      expect(excludedLogs()).toHaveLength(0);
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('通知が失敗しても処理は失敗せず、外したプロジェクトを返す', async () => {
      prisma = createPurgePrisma(
        [{ id: 'p-1', deletedAt: daysAgo(120), purgeState: failedBefore(4) }],
        {}
      );
      failDatabase(new Set(['p-1']));
      const service = createExcludingService();
      notifyAllAdmins.mockRejectedValue(new Error('mail queue down'));

      const result = await service.purgeExpired(NOW);

      expect(result.excludedProjectIds).toEqual(['p-1']);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ projectIds: ['p-1'] }),
        'Failed to notify admins of excluded project purges'
      );
    });

    it('通知の部品を渡さないときは通知しないが、対象から外して記録する', async () => {
      const rows: ProjectRow[] = [
        { id: 'p-1', deletedAt: daysAgo(120), purgeState: failedBefore(4) },
      ];
      prisma = createPurgePrisma(rows, {});
      failDatabase(new Set(['p-1']));
      const service = createExcludingService({ withNotifier: false });

      const result = await service.purgeExpired(NOW);

      expect(result.excludedProjectIds).toEqual(['p-1']);
      expect(rows[0]!.purgeState!.excludedAt).toEqual(NOW);
      expect(excludedLogs()).toHaveLength(1);
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('記録の書き込みが失敗したら外さず、記録も通知もしない（次の回でまた数える）', async () => {
      const rows: ProjectRow[] = [
        { id: 'p-1', deletedAt: daysAgo(120), purgeState: failedBefore(4) },
      ];
      prisma = createPurgePrisma(rows, {});
      failDatabase(new Set(['p-1']));
      prisma.projectPurgeState.upsert.mockRejectedValueOnce(new Error('connection lost'));
      const service = createExcludingService();

      const result = await service.purgeExpired(NOW);

      expect(result.failedProjectIds).toEqual(['p-1']);
      expect(result.excludedProjectIds).toEqual([]);
      expect(rows[0]!.purgeState!.excludedAt).toBeNull();
      expect(excludedLogs()).toHaveLength(0);
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('対象から外したことの監査の記録が失敗しても、記録して知らせ、外したプロジェクトを返す', async () => {
      prisma = createPurgePrisma(
        [{ id: 'p-1', deletedAt: daysAgo(120), purgeState: failedBefore(4) }],
        {}
      );
      failDatabase(new Set(['p-1']));
      createLog.mockRejectedValue(new Error('audit down'));
      const service = createExcludingService();

      const result = await service.purgeExpired(NOW);

      expect(result.excludedProjectIds).toEqual(['p-1']);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p-1' }),
        'Failed to record project purge exclusion'
      );
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });
  });
});
