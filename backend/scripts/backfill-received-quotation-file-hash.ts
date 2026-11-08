/**
 * @fileoverview 既存の受領見積書のファイルの原本の指紋の埋め戻し
 *
 * タスク115.1: design の章「Requirements 43-50」の Migration Strategy の 2 と D6
 *
 * 受領見積書の原本の指紋（`received_quotations.file_sha256`）は保存のときにサービスが求めるが、
 * この列を追加する以前に登録された受領見積書は指紋が null のままである。指紋はファイルの内容から
 * 求めるため SQL の migration では埋められない。指紋が null の間、そのファイルは同じ案件の二重登録の
 * 判定の対象にならない。
 *
 * 本スクリプトは指紋が null でファイルを持つ受領見積書だけを対象に、区切った件数ずつストレージから
 * ファイルを読んで sha256 を入れる。埋めた行は抽出条件（指紋が null）に合致しなくなるため、
 * 再実行しても二重に処理しない。二重登録の判定（拒否）は行わない——指紋を埋めた結果、以前から
 * 同じ組（指紋と見積の区別）の受領見積書が同じ案件に並ぶことはありうる（D6 の実装の記録）。
 *
 * 実行方法:
 *   npm run backfill:received-quotation-file-hash              # 埋め戻しを実行
 *   npm run backfill:received-quotation-file-hash -- --dry-run # 書かずに件数を集計する
 *   npm run backfill:received-quotation-file-hash -- --batch-size=50
 *
 * @module scripts/backfill-received-quotation-file-hash
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { computeOriginalFingerprint } from '../src/services/received-quotation.service.js';
import type { StorageProvider } from '../src/storage/storage-provider.interface.js';
import { getStorageProvider, disconnectStorage } from '../src/storage/storage-factory.js';
import logger from '../src/utils/logger.js';

// ============================================================================
// 定数
// ============================================================================

/** 一度に読み出す受領見積書の件数の既定値（行ごとにファイルを一つずつ読むため控えめにする） */
const DEFAULT_BATCH_SIZE = 50;

/** ストレージが実体を返さなかったときの理由 */
const MISSING_FILE_REASON = 'ファイルがストレージに存在しない';

// ============================================================================
// 型定義
// ============================================================================

/** ファイルを読めずに飛ばした受領見積書 */
export interface FileHashBackfillSkip {
  receivedQuotationId: string;
  filePath: string;
  reason: string;
}

/** 指紋の更新に失敗した受領見積書 */
export interface FileHashBackfillFailure {
  receivedQuotationId: string;
  reason: string;
}

/** 埋め戻しの実行結果 */
export interface FileHashBackfillResult {
  /** 指紋を入れた件数（dryRun では入れられる件数） */
  processed: number;
  /** ファイルを読めずに飛ばした受領見積書（致命的としない） */
  skipped: FileHashBackfillSkip[];
  /** 指紋の更新に失敗した受領見積書 */
  failures: FileHashBackfillFailure[];
  /** 実行後に指紋が null でファイルを持つまま残っている件数 */
  remaining: number;
}

export interface FileHashBackfillOptions {
  /** 一度に読み出す受領見積書の件数。既定 50 */
  batchSize?: number;
  /** true のときファイルを読んで集計するだけで、更新しない */
  dryRun?: boolean;
}

export interface FileHashBackfillDependencies {
  prisma: Pick<PrismaClient, 'receivedQuotation'>;
  storageProvider: Pick<StorageProvider, 'get'>;
}

/** 埋め戻しの対象の抽出条件（指紋が null でファイルを持つ） */
const TARGET_WHERE = { fileSha256: null, filePath: { not: null } } as const;

// ============================================================================
// 実装
// ============================================================================

/**
 * 指紋が null でファイルを持つ受領見積書へ原本の指紋を埋め戻す
 *
 * 抽出は「対象であり、かつ ID が直前の到達点より大きい」条件で区切る。読めずに飛ばした行は指紋が
 * null のまま対象に残るため、OFFSET では同じ行を読み続けるか読み飛ばす。ID の範囲で前進すれば、
 * 対象が減る本実行でも減らない `dryRun` でも正しく進む。
 *
 * 指紋はサービスの保存と同じ `computeOriginalFingerprint` で求める。更新は「ID が同じ・指紋が
 * まだ null・ファイルの格納先が読んだときと同じ」の条件つきで行い、読んでから書くまでの間に利用者が
 * ファイルを差し替えたり外したりした行へ古いファイルの指紋を書かない。更新日時（`updatedAt`）は
 * 読んだときの値のまま保つ。指紋の埋め戻しは利用者の編集ではなく、開いている編集画面の楽観的排他を
 * 崩さないためである。
 *
 * ファイルを読めない行（実体が無い・ストレージの誤り）は飛ばして `skipped` へ集め、処理を続ける。
 * 更新の失敗は `failures` へ集める。最後に対象の残りを数え直して `remaining` へ返す。
 *
 * @param deps - Prisma クライアントとストレージ
 * @param options - 読み出しの区切りと集計だけの実行
 */
export async function backfillReceivedQuotationFileHashes(
  deps: FileHashBackfillDependencies,
  options: FileHashBackfillOptions = {}
): Promise<FileHashBackfillResult> {
  const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = options;
  const { prisma, storageProvider } = deps;

  const result: FileHashBackfillResult = {
    processed: 0,
    skipped: [],
    failures: [],
    remaining: 0,
  };

  let lastId: string | null = null;

  for (;;) {
    const batch: Array<{ id: string; filePath: string | null; updatedAt: Date }> =
      await prisma.receivedQuotation.findMany({
        where: {
          ...TARGET_WHERE,
          ...(lastId === null ? {} : { id: { gt: lastId } }),
        },
        select: { id: true, filePath: true, updatedAt: true },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

    if (batch.length === 0) {
      break;
    }

    // ファイルの読み出しと更新は 1 件ずつ逐次に行う。ストレージと DB を同時の要求で圧迫しないため
    for (const record of batch) {
      const filePath = record.filePath as string;

      let content: Buffer | null;
      try {
        content = await storageProvider.get(filePath);
      } catch (error) {
        result.skipped.push({
          receivedQuotationId: record.id,
          filePath,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (content === null) {
        result.skipped.push({
          receivedQuotationId: record.id,
          filePath,
          reason: MISSING_FILE_REASON,
        });
        continue;
      }

      const fileSha256 = computeOriginalFingerprint(content);

      if (!dryRun) {
        try {
          const updated = await prisma.receivedQuotation.updateMany({
            where: { id: record.id, fileSha256: null, filePath },
            data: { fileSha256, updatedAt: record.updatedAt },
          });
          // 読んでから書くまでの間に保存された行（指紋をサービスが入れた・ファイルが変わった）は数えない
          if (updated.count === 0) {
            continue;
          }
        } catch (error) {
          result.failures.push({
            receivedQuotationId: record.id,
            reason: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
      }

      result.processed += 1;
    }

    lastId = batch[batch.length - 1]!.id;

    // 区切りに満たない応答は対象の末尾に達したことを意味する
    if (batch.length < batchSize) {
      break;
    }
  }

  result.remaining = await prisma.receivedQuotation.count({ where: TARGET_WHERE });

  return result;
}

/**
 * 実行結果から終了コードを決める
 *
 * 更新に失敗した行がある場合は異常終了とする。読めずに飛ばした行は致命的としないが、飛ばした行で
 * 説明できない残り（本実行で `remaining` が飛ばした件数を超える）がある場合は完了とみなさない。
 * 集計だけの実行では更新しないため、残りがあることは正常である。
 *
 * @param result - 埋め戻しの実行結果
 * @param options - 実行時の指定
 */
export function resolveBackfillExitCode(
  result: FileHashBackfillResult,
  options: FileHashBackfillOptions
): number {
  if (result.failures.length > 0) {
    return 1;
  }

  if (options.dryRun !== true && result.remaining > result.skipped.length) {
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
export function parseArgs(argv: string[]): FileHashBackfillOptions {
  const options: FileHashBackfillOptions = {};

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

/** 起動処理が必要とする Prisma クライアント */
export type BackfillPrismaClient = Pick<PrismaClient, 'receivedQuotation' | '$disconnect'>;

/**
 * 起動処理が外部と接する部分
 *
 * プロセスの引数・環境変数・DB とストレージの接続・終了コードの通知を差し替え可能にし、起動処理の
 * 中身（引数の解釈から終了コードの決定まで）を検証できるようにする。
 */
export interface BackfillCliContext {
  /** `process.argv.slice(2)` 相当のコマンドライン引数 */
  argv: string[];
  /** 接続先を読み出す環境変数 */
  env: NodeJS.ProcessEnv;
  /** `.env` の読み込み */
  loadEnv: () => void;
  /** 接続先から Prisma クライアントを組み立てる */
  createPrismaClient: (connectionString: string) => BackfillPrismaClient;
  /** 環境変数の設定からストレージを組み立てる（設定が無ければ null） */
  createStorageProvider: () => Pick<StorageProvider, 'get'> | null;
  /** 実行結果の終了コードを通知する */
  setExitCode: (code: number) => void;
}

/**
 * 接続先から Prisma クライアントを組み立てる
 *
 * @param connectionString - データベースの接続先
 */
export function createBackfillPrismaClient(connectionString: string): BackfillPrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * 実プロセス・実 DB・設定のストレージへ接続する既定の実行文脈を組み立てる
 */
export function createDefaultCliContext(): BackfillCliContext {
  return {
    argv: process.argv.slice(2),
    env: process.env,
    loadEnv: config,
    createPrismaClient: createBackfillPrismaClient,
    createStorageProvider: getStorageProvider,
    setExitCode: (code) => {
      // `process.exit` ではなく `exitCode` を用いる。接続の解放を待たずに打ち切らないため
      process.exitCode = code;
    },
  };
}

/**
 * スクリプトとして実行されたときの入口
 *
 * @param context - 外部と接する部分
 */
export async function runBackfillCli(context: BackfillCliContext): Promise<void> {
  context.loadEnv();

  const connectionString = context.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const storageProvider = context.createStorageProvider();
  if (storageProvider === null) {
    throw new Error(
      'ストレージが設定されていません（STORAGE_TYPE・LOCAL_STORAGE_PATH・R2_* を確認）'
    );
  }

  const options = parseArgs(context.argv);
  const prisma = context.createPrismaClient(connectionString);

  try {
    logger.info({ action: 'backfill_received_quotation_file_hash_started', ...options });

    const result = await backfillReceivedQuotationFileHashes({ prisma, storageProvider }, options);
    const exitCode = resolveBackfillExitCode(result, options);

    logger.info({
      action: 'backfill_received_quotation_file_hash_finished',
      dryRun: options.dryRun === true,
      processed: result.processed,
      skippedCount: result.skipped.length,
      skipped: result.skipped,
      failureCount: result.failures.length,
      failures: result.failures,
      remaining: result.remaining,
      complete: exitCode === 0,
    });

    if (result.skipped.length > 0) {
      logger.warn({
        action: 'backfill_received_quotation_file_hash_skipped',
        skippedCount: result.skipped.length,
        message:
          'ファイルを読めない受領見積書を飛ばした。指紋が null のまま残り、二重登録の判定の対象にならない',
      });
    }

    context.setExitCode(exitCode);
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
    action: 'backfill_received_quotation_file_hash_failed',
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
  runBackfillCli(createDefaultCliContext())
    .catch(reportFatalStartupError)
    .finally(() => disconnectStorage());
}
