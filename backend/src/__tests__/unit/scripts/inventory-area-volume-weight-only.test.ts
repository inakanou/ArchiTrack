/**
 * @fileoverview 重量だけの面積・体積項目の棚卸しのテスト
 *
 * Task 100.23: 重量だけの面積・体積項目を抱える既存データが保存不能になった状態の処遇を決める
 *   （利用者の裁定 2026-09-24: (a) 棚卸しのみ。移行も経過措置も置かない）
 *
 * Requirements:
 * - 8.7: 「面積・体積」モードで幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力を求める
 *
 * @module tests/unit/scripts/inventory-area-volume-weight-only
 */

import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../../../utils/logger.js';
import {
  classifyAreaVolumeParams,
  inventoryAreaVolumeWeightOnly,
  parseArgs,
  runInventoryCli,
  createInventoryPrismaClient,
  createDefaultCliContext,
  setProcessExitCode,
  reportFatalStartupError,
  isDirectExecution,
  type InventoryCliContext,
} from '../../../../scripts/inventory-area-volume-weight-only.js';

// ============================================================================
// 疑似データストア
//
// 抽出条件（計算方法が面積・体積・IDの範囲）を実DBと同じ意味で評価する。
// 更新系のメソッドは持たせない——棚卸しが読み取り専用であることを、
// 更新を呼べば TypeError で落ちる形で固定する。
// ============================================================================

interface FakeItem {
  id: string;
  calculationMethod: 'STANDARD' | 'AREA_VOLUME' | 'PITCH' | 'COUNT';
  calculationParams: unknown;
  quantityTableId: string;
}

function createFakeStore(items: FakeItem[]) {
  const findMany = vi.fn(
    (args: {
      where: { calculationMethod: string; id?: { gt: string } };
      take: number;
      orderBy: { id: 'asc' };
    }) => {
      const matched = items
        .filter((item) => item.calculationMethod === args.where.calculationMethod)
        .filter((item) => (args.where.id ? item.id > args.where.id.gt : true))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, args.take)
        .map((item) => ({
          id: item.id,
          calculationParams: item.calculationParams,
          quantityGroup: { quantityTableId: item.quantityTableId },
        }));
      return Promise.resolve(matched);
    }
  );
  return { quantityItem: { findMany } };
}

function areaVolume(id: string, calculationParams: unknown, quantityTableId = 'table-1'): FakeItem {
  return { id, calculationMethod: 'AREA_VOLUME', calculationParams, quantityTableId };
}

// ============================================================================
// 分類（本番の保存時検証と同じ述語で判定すること）
// ============================================================================

describe('classifyAreaVolumeParams (Task 100.23, Requirements: 8.7)', () => {
  it('重量だけを持つ項目は 100.10 で新たに保存不能になった項目として分類する', () => {
    expect(classifyAreaVolumeParams({ weight: 3 })).toBe('weightOnly');
  });

  it('幅・奥行き・高さのいずれか1つがあれば保存できる項目として分類する', () => {
    expect(classifyAreaVolumeParams({ width: 2 })).toBe('saveable');
    expect(classifyAreaVolumeParams({ depth: 2, weight: 3 })).toBe('saveable');
    expect(classifyAreaVolumeParams({ height: 0, weight: 3 })).toBe('saveable');
  });

  it('計算用パラメータが JSON null・空・重量も無い場合は 100.10 以前から保存不能な項目として分類する', () => {
    expect(classifyAreaVolumeParams(null)).toBe('noInput');
    expect(classifyAreaVolumeParams(undefined)).toBe('noInput');
    expect(classifyAreaVolumeParams({})).toBe('noInput');
  });
});

// ============================================================================
// 棚卸し
// ============================================================================

describe('inventoryAreaVolumeWeightOnly (Task 100.23, Requirements: 8.7)', () => {
  it('面積・体積の項目だけを数え、分類ごとの件数と重量だけの項目の所在を返す', async () => {
    const prisma = createFakeStore([
      areaVolume('a1', { weight: 3 }, 'table-1'),
      areaVolume('a2', { width: 1, weight: 3 }, 'table-1'),
      areaVolume('a3', null, 'table-2'),
      areaVolume('a4', { weight: 5 }, 'table-3'),
      {
        id: 's1',
        calculationMethod: 'STANDARD',
        calculationParams: { weight: 3 },
        quantityTableId: 't',
      },
      {
        id: 'p1',
        calculationMethod: 'PITCH',
        calculationParams: { weight: 3 },
        quantityTableId: 't',
      },
    ]);

    const result = await inventoryAreaVolumeWeightOnly({ prisma: prisma as never });

    expect(result).toEqual({
      areaVolumeTotal: 4,
      saveable: 1,
      weightOnly: [
        { itemId: 'a1', quantityTableId: 'table-1' },
        { itemId: 'a4', quantityTableId: 'table-3' },
      ],
      noInput: [{ itemId: 'a3', quantityTableId: 'table-2' }],
    });
  });

  it('区切り件数を超えても取りこぼさず全件を数える', async () => {
    const items = Array.from({ length: 7 }, (_, i) => areaVolume(`a${i}`, { weight: i + 1 }));
    const prisma = createFakeStore(items);

    const result = await inventoryAreaVolumeWeightOnly(
      { prisma: prisma as never },
      { batchSize: 3 }
    );

    expect(result.areaVolumeTotal).toBe(7);
    expect(result.weightOnly).toHaveLength(7);
    expect(prisma.quantityItem.findMany).toHaveBeenCalledTimes(3);
    for (const [args] of prisma.quantityItem.findMany.mock.calls) {
      expect(args.take).toBe(3);
    }
  });

  it('対象が0件なら0件を返す', async () => {
    const prisma = createFakeStore([]);

    const result = await inventoryAreaVolumeWeightOnly({ prisma: prisma as never });

    expect(result).toEqual({ areaVolumeTotal: 0, saveable: 0, weightOnly: [], noInput: [] });
  });
});

// ============================================================================
// 引数の解釈
// ============================================================================

describe('parseArgs', () => {
  it('区切り件数を受け付け、0や解釈できない引数は無視する', () => {
    expect(parseArgs(['--batch-size=50'])).toEqual({ batchSize: 50 });
    expect(parseArgs(['--batch-size=0'])).toEqual({});
    expect(parseArgs(['--unknown'])).toEqual({});
  });
});

// ============================================================================
// 実行入口
// ============================================================================

describe('inventory-area-volume-weight-only の実行入口', () => {
  const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));

  it('npm スクリプトとして起動できる', () => {
    const packageJson = JSON.parse(readFileSync(`${backendRoot}package.json`, 'utf-8')) as {
      scripts: Record<string, string>;
    };

    const entry = packageJson.scripts['inventory:area-volume-weight-only'];
    expect(entry).toBeDefined();
    expect(entry).toContain('scripts/inventory-area-volume-weight-only.ts');
  });

  it('スクリプトを直接実行すると起動処理が動きDB接続の準備段階まで到達する', () => {
    const isolatedCwd = mkdtempSync(join(tmpdir(), 'inventory-entry-'));
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;

    const proc = spawnSync(
      `${backendRoot}node_modules/.bin/tsx`,
      [`${backendRoot}scripts/inventory-area-volume-weight-only.ts`],
      { cwd: isolatedCwd, env, encoding: 'utf-8', timeout: 120_000 }
    );

    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
    expect(proc.error).toBeUndefined();
    expect(output).toContain('inventory_area_volume_weight_only_failed');
    expect(output).toContain('DATABASE_URL');
    expect(proc.status).toBe(1);
  }, 150_000);
});

describe('runInventoryCli（起動処理）', () => {
  const CONNECTION_STRING = 'postgresql://user:pass@localhost:5432/architrack';

  function createCliHarness(options: { items?: FakeItem[]; env?: NodeJS.ProcessEnv } = {}) {
    const store = createFakeStore(options.items ?? [areaVolume('a1', { weight: 3 })]);
    const disconnect = vi.fn(() => Promise.resolve());
    const prisma = { quantityItem: store.quantityItem, $disconnect: disconnect };
    const createPrismaClient = vi.fn(() => prisma);
    const setExitCode = vi.fn();
    const loadEnv = vi.fn();

    const context = {
      argv: [],
      env: options.env ?? { DATABASE_URL: CONNECTION_STRING },
      loadEnv,
      createPrismaClient,
      setExitCode,
    } as unknown as InventoryCliContext;

    return { store, disconnect, createPrismaClient, setExitCode, loadEnv, context };
  }

  it('接続先が未設定の場合は起動を中止し接続を試みない', async () => {
    const harness = createCliHarness({ env: {} });

    await expect(runInventoryCli(harness.context)).rejects.toThrow('DATABASE_URL');

    expect(harness.createPrismaClient).not.toHaveBeenCalled();
    expect(harness.setExitCode).not.toHaveBeenCalled();
  });

  it('棚卸しの結果を記録し、該当の有無にかかわらず終了コード0を通知して接続を解放する', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation((() => undefined) as never);
    try {
      const harness = createCliHarness();

      await runInventoryCli(harness.context);

      expect(harness.createPrismaClient).toHaveBeenCalledWith(CONNECTION_STRING);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'inventory_area_volume_weight_only_finished',
          areaVolumeTotal: 1,
          weightOnlyCount: 1,
          noInputCount: 0,
          weightOnly: [{ itemId: 'a1', quantityTableId: 'table-1' }],
        })
      );
      expect(harness.setExitCode).toHaveBeenCalledWith(0);
      expect(harness.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('棚卸しが例外で終わっても接続を解放する', async () => {
    const harness = createCliHarness();
    harness.store.quantityItem.findMany.mockRejectedValueOnce(new Error('connection lost'));

    await expect(runInventoryCli(harness.context)).rejects.toThrow('connection lost');

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('実行時の依存の組み立て', () => {
  it('接続先から Prisma クライアントを組み立てる', async () => {
    const client = createInventoryPrismaClient(
      'postgresql://user:pass@127.0.0.1:65432/architrack_unused'
    );

    expect(typeof client.quantityItem.findMany).toBe('function');

    await client.$disconnect();
  });

  it('既定の実行文脈は実プロセスの引数と環境変数を用いる', () => {
    const context = createDefaultCliContext();

    expect(context.argv).toEqual(process.argv.slice(2));
    expect(context.env).toBe(process.env);
    expect(context.createPrismaClient).toBe(createInventoryPrismaClient);
    expect(context.setExitCode).toBe(setProcessExitCode);
  });

  it('終了コードの通知はプロセスの終了コードへ反映される', () => {
    const original = process.exitCode;
    try {
      setProcessExitCode(0);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = original;
    }
  });

  it('起動時の致命的な失敗を記録して異常終了させる', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
    try {
      reportFatalStartupError('unexpected');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'inventory_area_volume_weight_only_failed',
          error: 'unexpected',
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('直接実行の判定は起動対象のパスと自身のモジュールURLの一致による', () => {
    expect(isDirectExecution('/a/b.ts', 'file:///a/b.ts')).toBe(true);
    expect(isDirectExecution('/a/c.ts', 'file:///a/b.ts')).toBe(false);
    expect(isDirectExecution(undefined, 'file:///a/b.ts')).toBe(false);
  });
});
