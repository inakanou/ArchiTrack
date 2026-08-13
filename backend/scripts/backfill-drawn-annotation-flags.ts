/**
 * @fileoverview 描画された注釈の有無のバックフィル
 *
 * Task 115.13: 描画された注釈の有無を示す項目を設ける
 *
 * `image_annotations.hasDrawnAnnotations` は注釈の保存時に維持されるが、この項目を
 * 追加する以前に保存された注釈レコードは未算出（null）のままである。未算出の間は
 * 従来どおり「注釈レコードが存在すれば注釈あり」として扱われるため表示は破綻しないが、
 * 回転のみを保存した既存の写真では注釈の目印が出続ける。
 *
 * 本スクリプトは未算出のレコードだけを対象に、重い注釈データ（data）を区切った件数ずつ
 * 読み出して項目を埋め戻す。算出済みのレコードは抽出条件（hasDrawnAnnotations が null）に
 * 合致しなくなるため、再実行しても二重に処理しない。
 *
 * 実行方法:
 *   npm run backfill:drawn-annotations              # 埋め戻しを実行
 *   npm run backfill:drawn-annotations -- --dry-run # 対象件数の集計のみ
 *   npm run backfill:drawn-annotations -- --batch-size=200
 *
 * Requirements:
 * - 20.2: 現場調査詳細画面の各画像に保存済みの注釈の状態を反映して表示する
 *
 * @module scripts/backfill-drawn-annotation-flags
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hasDrawnObjects } from '../src/services/annotation.service.js';
import logger from '../src/utils/logger.js';

// ============================================================================
// 定数
// ============================================================================

/** 一度に注釈データを読み込む件数の既定値 */
const DEFAULT_BATCH_SIZE = 100;

// ============================================================================
// 型定義
// ============================================================================

/** 更新に失敗した注釈レコード */
export interface DrawnAnnotationBackfillFailure {
  annotationId: string;
  reason: string;
}

/** バックフィルの実行結果 */
export interface DrawnAnnotationBackfillResult {
  /** 算出できた注釈レコード数（dryRun では対象件数） */
  processed: number;
  /** 描画された注釈ありとして記録した件数 */
  markedTrue: number;
  /** 描画された注釈なしとして記録した件数 */
  markedFalse: number;
  /** 更新に失敗した注釈レコードのIDと理由 */
  failures: DrawnAnnotationBackfillFailure[];
  /** 実行後に未算出のまま残っている注釈レコード数（dryRun では更新しないため対象件数と一致する） */
  remaining: number;
}

export interface DrawnAnnotationBackfillOptions {
  /** 一度に注釈データを読み込む件数。既定 100 */
  batchSize?: number;
  /** true のとき算出のみ行い、更新を実行しない */
  dryRun?: boolean;
}

export interface DrawnAnnotationBackfillDependencies {
  prisma: Pick<PrismaClient, 'imageAnnotation'>;
}

// ============================================================================
// 実装
// ============================================================================

/**
 * 未算出の注釈レコードへ描画された注釈の有無を埋め戻す
 *
 * 抽出は「未算出であり、かつIDが直前の到達点より大きい」条件で区切り、1回に読み込む
 * 注釈データを `batchSize` 件へ制限する。全件を一度にメモリへ載せると重い `data` の
 * 総量で破綻するためである。
 *
 * Prisma の `cursor` + `skip: 1` は用いない。抽出条件（未算出）は更新によって
 * 対象が減る一方、`skip` は SQL の OFFSET へ写るため、更新済みの行が対象から
 * 外れた分だけオフセットが前へ詰まり、1バッチにつき1件を無言で読み飛ばす。
 * IDの範囲で前進すれば、対象が減る本実行でも減らない `dryRun` でも正しく進む。
 *
 * 個別のレコードで更新に失敗しても処理を継続し、失敗は `failures` へ集約する。
 * 全体を中断すると解消済みのレコードまで再実行の対象になるためである。
 *
 * 最後に未算出のまま残っている件数を数え直して `remaining` へ返す。失敗0でも
 * 取りこぼしがあり得る以上、完了の判断を件数の観測に基づかせるためである。
 *
 * @param deps - Prisma クライアント
 * @param options - 実行件数の区切りと集計のみの実行
 */
export async function backfillDrawnAnnotationFlags(
  deps: DrawnAnnotationBackfillDependencies,
  options: DrawnAnnotationBackfillOptions = {}
): Promise<DrawnAnnotationBackfillResult> {
  const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = options;
  const { prisma } = deps;

  const result: DrawnAnnotationBackfillResult = {
    processed: 0,
    markedTrue: 0,
    markedFalse: 0,
    failures: [],
    remaining: 0,
  };

  let lastId: string | null = null;

  for (;;) {
    const batch: Array<{ id: string; data: unknown }> = await prisma.imageAnnotation.findMany({
      where: {
        hasDrawnAnnotations: null,
        ...(lastId === null ? {} : { id: { gt: lastId } }),
      },
      select: { id: true, data: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    if (batch.length === 0) {
      break;
    }

    // 更新は1件ずつ逐次に行う。区切りを超える同時更新でDBを圧迫しないため。
    for (const record of batch) {
      const drawn = hasDrawnObjects((record.data ?? {}) as { objects?: unknown });

      if (!dryRun) {
        try {
          await prisma.imageAnnotation.update({
            where: { id: record.id },
            data: { hasDrawnAnnotations: drawn },
          });
        } catch (error) {
          result.failures.push({
            annotationId: record.id,
            reason: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
      }

      result.processed += 1;
      if (drawn) {
        result.markedTrue += 1;
      } else {
        result.markedFalse += 1;
      }
    }

    lastId = batch[batch.length - 1]!.id;

    // 区切りに満たない応答は対象の末尾に達したことを意味する
    if (batch.length < batchSize) {
      break;
    }
  }

  result.remaining = await prisma.imageAnnotation.count({
    where: { hasDrawnAnnotations: null },
  });

  return result;
}

/**
 * 実行結果から終了コードを決める
 *
 * 更新に失敗したレコードがある場合に加え、未算出が残っている場合も異常終了とする。
 * 「失敗0件」だけを見て完了と誤認されるのを防ぐためである。
 * 集計のみの実行では更新を行わないため、未算出が残ることは正常である。
 *
 * @param result - バックフィルの実行結果
 * @param options - 実行時の指定
 */
export function resolveBackfillExitCode(
  result: DrawnAnnotationBackfillResult,
  options: DrawnAnnotationBackfillOptions
): number {
  if (result.failures.length > 0) {
    return 1;
  }

  if (options.dryRun !== true && result.remaining > 0) {
    return 1;
  }

  return 0;
}

// ============================================================================
// 実行入口
// ============================================================================

/**
 * コマンドライン引数を解釈する
 *
 * @param argv - `process.argv.slice(2)` 相当の配列
 */
export function parseArgs(argv: string[]): DrawnAnnotationBackfillOptions {
  const options: DrawnAnnotationBackfillOptions = {};

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

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

/**
 * スクリプトとして実行されたときの入口
 */
async function main(): Promise<void> {
  config();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    logger.info({ action: 'backfill_drawn_annotations_started', ...options });

    const result = await backfillDrawnAnnotationFlags({ prisma }, options);
    const exitCode = resolveBackfillExitCode(result, options);

    logger.info({
      action: 'backfill_drawn_annotations_finished',
      dryRun: options.dryRun === true,
      processed: result.processed,
      markedTrue: result.markedTrue,
      markedFalse: result.markedFalse,
      failureCount: result.failures.length,
      failures: result.failures,
      remaining: result.remaining,
      complete: exitCode === 0,
    });

    if (options.dryRun !== true && result.remaining > 0) {
      logger.error({
        action: 'backfill_drawn_annotations_incomplete',
        remaining: result.remaining,
        message: '未算出のレコードが残っている。完了とみなさず再実行すること',
      });
    }

    process.exitCode = exitCode;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行されたときのみ処理を開始する（テストからの import では起動しない）
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    logger.error({
      action: 'backfill_drawn_annotations_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
