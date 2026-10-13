/**
 * @fileoverview 重量だけの面積・体積項目の棚卸し（読み取り専用）
 *
 * Task 100.23: 重量だけの面積・体積項目を抱える既存データが保存不能になった状態の処遇を決める
 *
 * タスク 100.10 は面積・体積の保存前検証の受け入れキーから `weight` を外した（REQ-8 AC7 へ
 * 実体を合わせた）。そのため `calculationParams` が重量だけを持つ面積・体積の数量項目は、
 * それを含む数量表ごと再保存できなくなった。利用者の裁定（2026-09-24）は「(a) 棚卸しのみ」
 * であり、移行も経過措置も置かない。本スクリプトはその棚卸しを再実行できる形で提供する。
 *
 * **判定は本番の保存時検証そのものを呼ぶ。** 分類の述語を複製すると、保存時検証が
 * 変わったときに棚卸しだけが古い条件で数え続ける。保存経路（`QuantityTableService.validateDraft`）
 * と同じく `calculationParams ?? {}` を `QuantityValidationService.validateQuantityItem` へ渡し、
 * `calculationParams` に対する誤りが出るかで「保存不能」を決める。そのうえで重量の有無で
 * 「100.10 で新たに保存不能になった項目（重量だけ）」と「100.10 以前から保存不能な項目
 * （幅・奥行き・高さ・重量のいずれも無い）」を分ける。
 *
 * **読み取り専用である。** 更新系の問い合わせは一つも発行しない。
 *
 * 実行方法:
 *   npm run inventory:area-volume-weight-only
 *   npm run inventory:area-volume-weight-only -- --batch-size=200
 *
 * Requirements:
 * - 8.7: 「面積・体積」モードで幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力を求める
 *
 * @module scripts/inventory-area-volume-weight-only
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  QuantityValidationService,
  type CalculationParamsType,
} from '../src/services/quantity-validation.service.js';
import logger from '../src/utils/logger.js';

// ============================================================================
// 定数・型
// ============================================================================

/** 一度に読み出す数量項目の件数の既定値 */
const DEFAULT_BATCH_SIZE = 500;

/**
 * 面積・体積の数量項目の分類
 *
 * - `saveable`: 保存時検証を通る
 * - `weightOnly`: 重量だけを持ち、100.10 以後に保存不能になった
 * - `noInput`: 重量も含めて計算用の値が無く、100.10 以前から保存不能
 */
export type AreaVolumeClassification = 'saveable' | 'weightOnly' | 'noInput';

/** 保存不能な項目の所在 */
export interface InventoryHit {
  itemId: string;
  quantityTableId: string;
}

/** 棚卸しの結果 */
export interface AreaVolumeInventoryResult {
  /** 面積・体積の数量項目の総数 */
  areaVolumeTotal: number;
  /** 保存時検証を通る項目の数 */
  saveable: number;
  /** 重量だけを持つ項目（100.10 で新たに保存不能になった） */
  weightOnly: InventoryHit[];
  /** 計算用の値が無い項目（100.10 以前から保存不能） */
  noInput: InventoryHit[];
}

export interface AreaVolumeInventoryOptions {
  /** 一度に読み出す件数。既定 500 */
  batchSize?: number;
}

export interface AreaVolumeInventoryDependencies {
  prisma: Pick<PrismaClient, 'quantityItem'>;
}

// ============================================================================
// 分類
// ============================================================================

const validationService = new QuantityValidationService();

/**
 * 面積・体積の計算用パラメータを、本番の保存時検証で分類する
 *
 * 調整係数・丸め設定は有効域の内側の固定値を渡し、計算用パラメータの判定だけを取り出す。
 *
 * @param calculationParams - DBに保存された計算用パラメータ（JSON null を含む）
 */
export function classifyAreaVolumeParams(calculationParams: unknown): AreaVolumeClassification {
  const params = (calculationParams ?? {}) as CalculationParamsType;
  const result = validationService.validateQuantityItem({
    calculationMethod: 'AREA_VOLUME',
    calculationParams: params,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
  });

  const blocked = result.errors.some((error) => error.field === 'calculationParams');
  if (!blocked) {
    return 'saveable';
  }

  return (params as { weight?: unknown }).weight !== undefined ? 'weightOnly' : 'noInput';
}

// ============================================================================
// 棚卸し
// ============================================================================

/**
 * 面積・体積の数量項目を全件読み、分類ごとに数える
 *
 * IDの範囲で前進して `batchSize` 件ずつ読む。発行するのは `findMany` だけである。
 *
 * @param deps - Prisma クライアント
 * @param options - 読み出しの区切り
 */
export async function inventoryAreaVolumeWeightOnly(
  deps: AreaVolumeInventoryDependencies,
  options: AreaVolumeInventoryOptions = {}
): Promise<AreaVolumeInventoryResult> {
  const { batchSize = DEFAULT_BATCH_SIZE } = options;
  const result: AreaVolumeInventoryResult = {
    areaVolumeTotal: 0,
    saveable: 0,
    weightOnly: [],
    noInput: [],
  };

  let lastId: string | null = null;

  for (;;) {
    const batch: Array<{
      id: string;
      calculationParams: unknown;
      quantityGroup: { quantityTableId: string };
    }> = await deps.prisma.quantityItem.findMany({
      where: {
        calculationMethod: 'AREA_VOLUME',
        ...(lastId === null ? {} : { id: { gt: lastId } }),
      },
      select: {
        id: true,
        calculationParams: true,
        quantityGroup: { select: { quantityTableId: true } },
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    for (const item of batch) {
      result.areaVolumeTotal += 1;
      const hit = { itemId: item.id, quantityTableId: item.quantityGroup.quantityTableId };
      switch (classifyAreaVolumeParams(item.calculationParams)) {
        case 'saveable':
          result.saveable += 1;
          break;
        case 'weightOnly':
          result.weightOnly.push(hit);
          break;
        case 'noInput':
          result.noInput.push(hit);
          break;
      }
    }

    if (batch.length < batchSize) {
      break;
    }
    lastId = batch[batch.length - 1]!.id;
  }

  return result;
}

// ============================================================================
// 実行入口
// ============================================================================

/**
 * コマンドライン引数を解釈する
 *
 * @param argv - `process.argv.slice(2)` 相当の配列
 */
export function parseArgs(argv: string[]): AreaVolumeInventoryOptions {
  const options: AreaVolumeInventoryOptions = {};
  for (const arg of argv) {
    const batchSize = /^--batch-size=(\d+)$/.exec(arg);
    if (batchSize) {
      const parsed = Number(batchSize[1]);
      if (parsed > 0) {
        options.batchSize = parsed;
      }
    }
  }
  return options;
}

/** 起動処理が必要とする Prisma クライアント */
export type InventoryPrismaClient = Pick<PrismaClient, 'quantityItem' | '$disconnect'>;

/**
 * 起動処理が外部と接する部分（引数・環境変数・DB接続・終了コードの通知）
 */
export interface InventoryCliContext {
  argv: string[];
  env: NodeJS.ProcessEnv;
  loadEnv: () => void;
  createPrismaClient: (connectionString: string) => InventoryPrismaClient;
  setExitCode: (code: number) => void;
}

/**
 * 接続先から Prisma クライアントを組み立てる
 *
 * @param connectionString - データベースの接続先
 */
export function createInventoryPrismaClient(connectionString: string): InventoryPrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * 終了コードをプロセスへ通知する（DB接続の解放を待つため `process.exit` は使わない）
 *
 * @param code - 終了コード
 */
export function setProcessExitCode(code: number): void {
  process.exitCode = code;
}

/**
 * 実プロセス・実DBへ接続する既定の実行文脈を組み立てる
 */
export function createDefaultCliContext(): InventoryCliContext {
  return {
    argv: process.argv.slice(2),
    env: process.env,
    loadEnv: config,
    createPrismaClient: createInventoryPrismaClient,
    setExitCode: setProcessExitCode,
  };
}

/**
 * スクリプトとして実行されたときの入口
 *
 * 棚卸しは計測であり、該当があっても異常終了にはしない（終了コード0）。
 *
 * @param context - 外部と接する部分
 */
export async function runInventoryCli(context: InventoryCliContext): Promise<void> {
  context.loadEnv();

  const connectionString = context.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const options = parseArgs(context.argv);
  const prisma = context.createPrismaClient(connectionString);

  try {
    const result = await inventoryAreaVolumeWeightOnly({ prisma }, options);

    logger.info({
      action: 'inventory_area_volume_weight_only_finished',
      areaVolumeTotal: result.areaVolumeTotal,
      saveable: result.saveable,
      weightOnlyCount: result.weightOnly.length,
      noInputCount: result.noInput.length,
      weightOnly: result.weightOnly,
      noInput: result.noInput,
    });

    context.setExitCode(0);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 起動そのものに失敗した場合に記録して異常終了する
 *
 * @param error - 失敗の内容
 */
export function reportFatalStartupError(error: unknown): void {
  logger.error({
    action: 'inventory_area_volume_weight_only_failed',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

/**
 * このモジュール自身が直接実行されたかを判定する
 *
 * @param scriptPath - `process.argv[1]` 相当の起動対象のパス
 * @param moduleUrl - `import.meta.url` 相当の自身のモジュールURL
 */
export function isDirectExecution(scriptPath: string | undefined, moduleUrl: string): boolean {
  return scriptPath !== undefined && moduleUrl === `file://${scriptPath}`;
}

// 直接実行されたときのみ処理を開始する（テストからの import では起動しない）
if (isDirectExecution(process.argv[1], import.meta.url)) {
  runInventoryCli(createDefaultCliContext()).catch(reportFatalStartupError);
}
