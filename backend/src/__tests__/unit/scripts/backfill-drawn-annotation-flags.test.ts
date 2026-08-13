/**
 * @fileoverview 描画された注釈の有無のバックフィルのテスト
 *
 * Task 115.13: 描画された注釈の有無を示す項目を設ける
 *
 * Requirements:
 * - 20.2: 現場調査詳細画面の各画像に保存済みの注釈の状態を反映して表示する
 *
 * @module tests/unit/scripts/backfill-drawn-annotation-flags
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backfillDrawnAnnotationFlags,
  resolveBackfillExitCode,
} from '../../../../scripts/backfill-drawn-annotation-flags.js';

// ============================================================================
// モック
// ============================================================================

const mockPrisma = {
  imageAnnotation: {
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
};

/**
 * 未算出の注釈レコード（id と data のみ読み出す想定）を組み立てる
 *
 * @param entries - [注釈ID, 描画オブジェクト数] の組
 */
function records(...entries: Array<[string, number]>) {
  return entries.map(([id, objectCount]) => ({
    id,
    data: {
      version: '1.0',
      objects: Array.from({ length: objectCount }, () => ({ type: 'rect' })),
    },
  }));
}

function run(options?: { batchSize?: number; dryRun?: boolean }) {
  return backfillDrawnAnnotationFlags({ prisma: mockPrisma as never }, options);
}

// ============================================================================
// インメモリの疑似データストア
//
// 応答をキューで返す模擬では「抽出条件と更新の相互作用」を再現できず、
// 更新済みレコードが抽出条件から外れることで生じる取りこぼしを検出できない。
// 実DBと同じ振る舞いを持つ配列を保持し、抽出は条件で絞り、更新は配列を書き換える。
// ============================================================================

interface FakeAnnotationRow {
  id: string;
  data: { version: string; objects: Array<{ type: string }> };
  hasDrawnAnnotations: boolean | null;
}

interface FakeFindManyArgs {
  where?: { hasDrawnAnnotations?: boolean | null; id?: { gt?: string; gte?: string } };
  select?: Record<string, boolean>;
  orderBy?: { id: 'asc' | 'desc' };
  take?: number;
  cursor?: { id: string };
  skip?: number;
}

/**
 * 未算出のレコードを持つ疑似ストアを作る
 *
 * @param entries - [注釈ID, 描画オブジェクト数] の組
 */
function createFakeStore(entries: Array<[string, number]>) {
  const rows: FakeAnnotationRow[] = records(...entries).map((record) => ({
    ...record,
    hasDrawnAnnotations: null,
  }));

  const findMany = vi.fn((args: FakeFindManyArgs = {}) => {
    let candidates = rows
      .filter((row) => row.hasDrawnAnnotations === null)
      .sort((a, b) => a.id.localeCompare(b.id));

    const gt = args.where?.id?.gt;
    if (gt !== undefined) {
      candidates = candidates.filter((row) => row.id > gt);
    }
    const gte = args.where?.id?.gte;
    if (gte !== undefined) {
      candidates = candidates.filter((row) => row.id >= gte);
    }

    // Prisma のカーソルは「抽出条件を満たす行のうちカーソルのID以上」を対象に
    // OFFSET を適用する。更新で対象から外れた行があってもオフセットは詰められるため、
    // カーソル方式では実DBと同じ取りこぼしが再現される。
    if (args.cursor !== undefined) {
      const cursorId = args.cursor.id;
      candidates = candidates.filter((row) => row.id >= cursorId);
    }
    if (args.skip !== undefined) {
      candidates = candidates.slice(args.skip);
    }

    const take = args.take ?? candidates.length;
    return Promise.resolve(
      candidates.slice(0, take).map((row) => ({ id: row.id, data: row.data }))
    );
  });

  const update = vi.fn(
    ({ where, data }: { where: { id: string }; data: { hasDrawnAnnotations: boolean } }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (row === undefined) {
        return Promise.reject(new Error(`record not found: ${where.id}`));
      }
      row.hasDrawnAnnotations = data.hasDrawnAnnotations;
      return Promise.resolve({ id: row.id });
    }
  );

  const count = vi.fn((args: { where?: { hasDrawnAnnotations?: boolean | null } } = {}) => {
    const target = args.where?.hasDrawnAnnotations;
    return Promise.resolve(
      rows.filter((row) =>
        target === undefined ? true : row.hasDrawnAnnotations === (target ?? null)
      ).length
    );
  });

  return {
    rows,
    findMany,
    update,
    count,
    prisma: { imageAnnotation: { findMany, update, count } },
    /** 未算出のまま残っているID */
    unresolvedIds: () =>
      rows.filter((row) => row.hasDrawnAnnotations === null).map((row) => row.id),
    /** 疑似ストアに対してバックフィルを実行する */
    run: (options?: { batchSize?: number; dryRun?: boolean }) =>
      backfillDrawnAnnotationFlags(
        { prisma: { imageAnnotation: { findMany, update, count } } as never },
        options
      ),
  };
}

describe('backfillDrawnAnnotationFlags (Task 115.13, Requirements: 20.2)', () => {
  beforeEach(() => {
    // mockClear では mockResolvedValueOnce のキューが残り、テスト間で応答が混ざる。
    // 1件ずつの応答を積むテストが多いため、キューごと初期化する。
    vi.resetAllMocks();
    mockPrisma.imageAnnotation.update.mockResolvedValue({});
    mockPrisma.imageAnnotation.count.mockResolvedValue(0);
  });

  describe('対象の抽出', () => {
    it('派生項目が未算出（null）の注釈レコードのみを対象とする', async () => {
      mockPrisma.imageAnnotation.findMany
        .mockResolvedValueOnce(records(['ann-1', 2]))
        .mockResolvedValueOnce([]);

      await run();

      const where = mockPrisma.imageAnnotation.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({ hasDrawnAnnotations: null });
    });

    it('対象が0件の場合は更新を行わない', async () => {
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);

      const result = await run();

      expect(result.processed).toBe(0);
      expect(mockPrisma.imageAnnotation.update).not.toHaveBeenCalled();
    });
  });

  describe('算出', () => {
    it('描画オブジェクトが0件の注釈は false を書き込む', async () => {
      mockPrisma.imageAnnotation.findMany
        .mockResolvedValueOnce(records(['ann-rotation-only', 0]))
        .mockResolvedValueOnce([]);

      const result = await run();

      expect(mockPrisma.imageAnnotation.update).toHaveBeenCalledWith({
        where: { id: 'ann-rotation-only' },
        data: { hasDrawnAnnotations: false },
      });
      expect(result.processed).toBe(1);
      expect(result.markedFalse).toBe(1);
      expect(result.markedTrue).toBe(0);
    });

    it('描画オブジェクトが1件以上の注釈は true を書き込む', async () => {
      mockPrisma.imageAnnotation.findMany
        .mockResolvedValueOnce(records(['ann-annotated', 3]))
        .mockResolvedValueOnce([]);

      const result = await run();

      expect(mockPrisma.imageAnnotation.update).toHaveBeenCalledWith({
        where: { id: 'ann-annotated' },
        data: { hasDrawnAnnotations: true },
      });
      expect(result.markedTrue).toBe(1);
      expect(result.markedFalse).toBe(0);
    });

    it('objects が配列でない壊れたデータは false 扱いとし処理を継続する', async () => {
      mockPrisma.imageAnnotation.findMany
        .mockResolvedValueOnce([
          { id: 'ann-broken', data: { version: '1.0' } },
          ...records(['ann-ok', 1]),
        ])
        .mockResolvedValueOnce([]);

      const result = await run();

      expect(result.processed).toBe(2);
      expect(mockPrisma.imageAnnotation.update).toHaveBeenCalledWith({
        where: { id: 'ann-broken' },
        data: { hasDrawnAnnotations: false },
      });
    });
  });

  describe('実行件数の区切り', () => {
    /** 総件数が区切り件数を超える構成（7件・区切り2件） */
    const sevenRecords: Array<[string, number]> = [
      ['ann-1', 1],
      ['ann-2', 0],
      ['ann-3', 2],
      ['ann-4', 0],
      ['ann-5', 1],
      ['ann-6', 0],
      ['ann-7', 3],
    ];

    it('総件数が区切り件数を超えても1件も取りこぼさず全件を算出済みにする', async () => {
      const store = createFakeStore(sevenRecords);

      const result = await store.run({
        batchSize: 2,
      });

      expect(store.unresolvedIds()).toEqual([]);
      expect(result.processed).toBe(7);
      expect(result.markedTrue).toBe(4);
      expect(result.markedFalse).toBe(3);
      expect(result.failures).toHaveLength(0);
      expect(result.remaining).toBe(0);
    });

    it('dryRun でも対象が減らないまま前進し全件を集計する', async () => {
      const store = createFakeStore(sevenRecords);

      const result = await store.run({
        batchSize: 2,
        dryRun: true,
      });

      expect(result.processed).toBe(7);
      expect(store.update).not.toHaveBeenCalled();
      // 更新しないので対象は減らない。集計のみの実行では全件が未算出のまま残る
      expect(store.unresolvedIds()).toHaveLength(7);
    });

    it('重い注釈データはバッチ単位でのみ読み出す（全件を一度に読まない）', async () => {
      const store = createFakeStore(sevenRecords);

      await backfillDrawnAnnotationFlags({ prisma: store.prisma as never }, { batchSize: 2 });

      expect(store.findMany.mock.calls.length).toBeGreaterThan(0);
      for (const call of store.findMany.mock.calls) {
        expect(call[0]?.take).toBe(2);
      }
    });
  });

  describe('残件の報告', () => {
    it('更新に失敗して未算出が残った場合は残件数を報告する', async () => {
      const store = createFakeStore([
        ['ann-1', 1],
        ['ann-2', 0],
        ['ann-3', 1],
      ]);
      store.update.mockImplementationOnce(() => Promise.reject(new Error('deadlock detected')));

      const result = await store.run({
        batchSize: 2,
      });

      expect(result.failures).toHaveLength(1);
      expect(result.remaining).toBe(1);
      expect(store.unresolvedIds()).toEqual(['ann-1']);
    });

    it('全件を算出できた場合の残件数は0である', async () => {
      const store = createFakeStore([
        ['ann-1', 1],
        ['ann-2', 0],
      ]);

      const result = await store.run({
        batchSize: 1,
      });

      expect(result.remaining).toBe(0);
    });
  });

  describe('終了コードの決定', () => {
    const clean = { processed: 3, markedTrue: 1, markedFalse: 2, failures: [], remaining: 0 };

    it('全件を算出できた場合は0を返す', () => {
      expect(resolveBackfillExitCode(clean, {})).toBe(0);
    });

    it('未算出が残った場合は完了と誤認させないため1を返す', () => {
      expect(resolveBackfillExitCode({ ...clean, remaining: 2 }, {})).toBe(1);
    });

    it('更新に失敗したレコードがある場合は1を返す', () => {
      expect(
        resolveBackfillExitCode(
          { ...clean, failures: [{ annotationId: 'ann-1', reason: 'deadlock detected' }] },
          {}
        )
      ).toBe(1);
    });

    it('集計のみの実行では未算出が残っていても0を返す', () => {
      expect(resolveBackfillExitCode({ ...clean, remaining: 5 }, { dryRun: true })).toBe(0);
    });
  });

  describe('冪等性', () => {
    it('一度算出したレコードは次回の対象に含まれない（再実行で更新0件）', async () => {
      const store = createFakeStore([
        ['ann-1', 1],
        ['ann-2', 0],
      ]);

      const first = await store.run({
        batchSize: 1,
      });
      expect(first.processed).toBe(2);

      const second = await store.run({
        batchSize: 1,
      });

      expect(second.processed).toBe(0);
      expect(store.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('集計のみの実行', () => {
    it('dryRun では対象件数のみを集計し更新を行わない', async () => {
      mockPrisma.imageAnnotation.findMany
        .mockResolvedValueOnce(records(['ann-1', 1], ['ann-2', 0]))
        .mockResolvedValueOnce([]);

      const result = await run({ dryRun: true });

      expect(result.processed).toBe(2);
      expect(result.markedTrue).toBe(1);
      expect(result.markedFalse).toBe(1);
      expect(mockPrisma.imageAnnotation.update).not.toHaveBeenCalled();
    });
  });

  describe('部分失敗', () => {
    it('個別の更新失敗を記録し残りの処理を継続する', async () => {
      const store = createFakeStore([
        ['ann-1', 1],
        ['ann-2', 1],
      ]);
      store.update.mockImplementationOnce(() => Promise.reject(new Error('deadlock detected')));

      const result = await store.run({
        batchSize: 2,
      });

      expect(result.processed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ annotationId: 'ann-1' });
      expect(result.failures[0]?.reason).toContain('deadlock detected');
    });
  });
});

// ============================================================================
// 実行入口
//
// 「関数はあるが起動できない」状態を防ぐため、npm スクリプトとして起動できることと、
// スクリプトを直接実行すると実際に処理が始まることを、実起動で確認する。
// ============================================================================

describe('backfill-drawn-annotation-flags の実行入口', () => {
  const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));

  it('npm スクリプトとして起動できる', () => {
    const packageJson = JSON.parse(readFileSync(`${backendRoot}package.json`, 'utf-8')) as {
      scripts: Record<string, string>;
    };

    const entry = packageJson.scripts['backfill:drawn-annotations'];
    expect(entry).toBeDefined();
    expect(entry).toContain('scripts/backfill-drawn-annotation-flags.ts');
  });

  it('スクリプトを直接実行すると main が起動しDB接続の準備段階まで到達する', () => {
    // 接続先を与えずに起動する。入口が結線されていれば main が動き、接続先の欠落で
    // 失敗して終了コード1になる。入口が壊れていれば何もせず正常終了してしまう。
    const isolatedCwd = mkdtempSync(join(tmpdir(), 'backfill-entry-'));
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;

    const proc = spawnSync(
      `${backendRoot}node_modules/.bin/tsx`,
      [`${backendRoot}scripts/backfill-drawn-annotation-flags.ts`],
      { cwd: isolatedCwd, env, encoding: 'utf-8', timeout: 120_000 }
    );

    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
    expect(proc.error).toBeUndefined();
    expect(output).toContain('backfill_drawn_annotations_failed');
    expect(output).toContain('DATABASE_URL');
    expect(proc.status).toBe(1);
  }, 150_000);
});
