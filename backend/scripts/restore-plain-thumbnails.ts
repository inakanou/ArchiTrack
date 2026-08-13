/**
 * @fileoverview 注釈が焼き込まれた通常サムネイルの是正
 *
 * Task 115.5: 注釈が焼き込まれた通常サムネイルを素の画像へ戻す手段を用意する
 *
 * Task 115.1 以前、画像編集画面が合成した画像は通常サムネイル自体を上書きしていた。
 * その経路は `surveys/{surveyId}/{timestamp}_thumb_annotated_{fileName}` というキーへ
 * 保存していたため、注釈が焼き込まれた通常サムネイルはキーの命名で機械的に識別できる。
 *
 * 115.1 以降は通常サムネイルを書き換えないため、この状態は放置すると残り続ける。
 * 合成済みサムネイルが得られない画像の表示はクライアント側での合成へ退避するが、
 * その際に注釈が焼き込まれた通常サムネイルの上へさらに注釈を描くため二重描画になる
 * （Requirement 38.6 の代替手段が Requirement 20.2 / 20.3 の表示結果を維持できない）。
 *
 * 本スクリプトは対象を区切った件数ずつ抽出し、原本から素のサムネイルを再生成して
 * 通常サムネイルの項目を差し替える。合成済みサムネイル（annotatedThumbnailPath）には
 * 一切触れない。是正済みの画像は焼き込みの命名に合致しなくなるため、再実行しても
 * 二重に処理しない（Requirement 23.8）。
 *
 * 実行方法:
 *   npm run restore:plain-thumbnails              # 是正を実行
 *   npm run restore:plain-thumbnails -- --dry-run # 対象件数の集計のみ
 *   npm run restore:plain-thumbnails -- --batch-size=25
 *
 * Requirements:
 * - 20.2: 現場調査詳細画面の各画像のサムネイルに保存済みの注釈を反映して表示する
 * - 20.3: 現場調査一覧画面の代表画像のサムネイルに保存済みの注釈を反映して表示する
 * - 23.8: 画像変更を伴わない保存でも冪等に動作し既存サムネイルを破損させない
 * - 38.6: 注釈をレンダリングしたサムネイルが利用できない場合の代替手段を維持する
 *
 * @module scripts/restore-plain-thumbnails
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  ImageProcessorService,
  type SharpStatic,
} from '../src/services/image-processor.service.js';
import { SurveyImageService } from '../src/services/survey-image.service.js';
import { getStorageProvider, isStorageConfigured } from '../src/storage/index.js';
import type { StorageProvider } from '../src/storage/storage-provider.interface.js';
import logger from '../src/utils/logger.js';

// ============================================================================
// 定数
// ============================================================================

/**
 * 注釈が焼き込まれた通常サムネイルを識別する命名
 *
 * Task 115.1 以前の上書き経路が用いていたキーの構成要素。素のサムネイルは
 * `{timestamp}_thumb_{fileName}` であり、この語を含まない。
 */
export const ANNOTATION_BAKED_THUMBNAIL_MARKER = '_thumb_annotated_';

/**
 * 保存キーが注釈の焼き込み済みを示す命名かを判定する
 *
 * データベース側の抽出条件（Prisma の `contains`）は SQL の `LIKE '%..%'` へ写り、
 * この語に含まれる `_` が「任意の1文字」のワイルドカードとして働く（Prisma は
 * `contains` の `_` / `%` をエスケープしない）。そのため抽出結果には、実際には
 * 焼き込まれていないキー（例: `..._plainthumb_annotated_x.jpg`）が混ざる。
 * 抽出条件は「取りこぼしのない緩い絞り込み」と位置づけ、対象の確定はこの厳密な
 * 判定で行う。
 *
 * @param thumbnailPath - 通常サムネイルの保存キー
 */
export function isAnnotationBakedThumbnailKey(thumbnailPath: string): boolean {
  return thumbnailPath.includes(ANNOTATION_BAKED_THUMBNAIL_MARKER);
}

/** 一度に抽出する画像の件数の既定値 */
const DEFAULT_BATCH_SIZE = 50;

// ============================================================================
// 型定義
// ============================================================================

/** 是正に失敗した画像 */
export interface PlainThumbnailRestoreFailure {
  imageId: string;
  reason: string;
}

/** 是正の実行結果 */
export interface PlainThumbnailRestoreResult {
  /** 対象として抽出した画像数 */
  targeted: number;
  /** 素のサムネイルへ差し替えられた画像数 */
  restored: number;
  /** 是正に失敗した画像のIDと理由 */
  failures: PlainThumbnailRestoreFailure[];
  /** 実行後に焼き込まれたまま残っている画像数（dryRun では差し替えないため対象件数と一致する） */
  remaining: number;
}

export interface PlainThumbnailRestoreOptions {
  /** 一度に抽出する画像の件数。既定 50 */
  batchSize?: number;
  /** true のとき対象件数の集計のみ行い、再生成を実行しない */
  dryRun?: boolean;
}

/** 抽出した通常サムネイルの是正に必要な項目 */
interface TargetImage {
  id: string;
  surveyId: string;
  fileName: string;
  originalPath: string;
  thumbnailPath: string;
}

export interface PlainThumbnailRestoreDependencies {
  prisma: Pick<PrismaClient, 'surveyImage'>;
  storageProvider: Pick<StorageProvider, 'get' | 'upload' | 'delete'>;
  imageProcessorService: Pick<ImageProcessorService, 'generateThumbnail'>;
  surveyImageService: Pick<SurveyImageService, 'detectMimeTypeByMagicBytes'>;
}

// ============================================================================
// 実装
// ============================================================================

/**
 * 焼き込み済みの候補を区切った件数ずつ読み出す
 *
 * 抽出条件は SQL の `LIKE` へ写るため厳密ではない（`ANNOTATION_BAKED_THUMBNAIL_MARKER`
 * の注記を参照）。取りこぼしのない緩い絞り込みとして用い、厳密な判定は呼び出し側で行う。
 *
 * Prisma の `cursor` + `skip: 1` は用いない。抽出条件（焼き込み済み）は差し替えによって
 * 対象が減る一方、`skip` は SQL の OFFSET へ写るため、是正済みの行が対象から外れた分だけ
 * オフセットが前へ詰まり、1バッチにつき1件を無言で読み飛ばす。IDの範囲で前進すれば、
 * 対象が減る本実行でも減らない `dryRun` でも正しく進む。
 *
 * @param prisma - Prisma クライアント
 * @param lastId - 直前のバッチで到達したID。未到達の場合は null
 * @param batchSize - 1回に読み出す件数
 */
async function findBakedThumbnailCandidates(
  prisma: Pick<PrismaClient, 'surveyImage'>,
  lastId: string | null,
  batchSize: number
): Promise<TargetImage[]> {
  return prisma.surveyImage.findMany({
    where: {
      thumbnailPath: { contains: ANNOTATION_BAKED_THUMBNAIL_MARKER },
      ...(lastId === null ? {} : { id: { gt: lastId } }),
    },
    select: {
      id: true,
      surveyId: true,
      fileName: true,
      originalPath: true,
      thumbnailPath: true,
    },
    orderBy: { id: 'asc' },
    take: batchSize,
  });
}

/**
 * 注釈が焼き込まれたまま残っている画像を数える
 *
 * `count` は使えない。抽出条件が SQL の `LIKE` へ写る以上、厳密には合致しない行まで
 * 数えてしまい、是正が完了していても残件が0にならないためである。緩い絞り込みで
 * 区切って読み出し、厳密な判定に合致した行だけを数える。
 *
 * @param prisma - Prisma クライアント
 * @param batchSize - 1回に読み出す件数
 */
async function countRemainingBakedThumbnails(
  prisma: Pick<PrismaClient, 'surveyImage'>,
  batchSize: number
): Promise<number> {
  let lastId: string | null = null;
  let remaining = 0;

  for (;;) {
    const batch = await findBakedThumbnailCandidates(prisma, lastId, batchSize);
    if (batch.length === 0) {
      break;
    }

    remaining += batch.filter((image) => isAnnotationBakedThumbnailKey(image.thumbnailPath)).length;
    lastId = batch[batch.length - 1]!.id;

    if (batch.length < batchSize) {
      break;
    }
  }

  return remaining;
}

/**
 * 素のサムネイルの保存キーを組み立てる
 *
 * 原則としてアップロード時と同じ命名（`{timestamp}_thumb_{fileName}`）を用いる。
 * ただしファイル名自体が `annotated_` で始まる場合、この命名では識別条件に合致して
 * しまい、是正済みの画像が再実行のたびに対象へ戻る。その場合のみ識別条件に合致しない
 * 命名へ退避し、冪等性を成立させる。
 *
 * @param surveyId - 現場調査ID
 * @param fileName - 保存済みのファイル名（サニタイズ済み）
 * @param timestamp - キーの一意性を確保するための時刻
 */
export function buildPlainThumbnailKey(
  surveyId: string,
  fileName: string,
  timestamp: number
): string {
  const key = `surveys/${surveyId}/${timestamp}_thumb_${fileName}`;
  if (!key.includes(ANNOTATION_BAKED_THUMBNAIL_MARKER)) {
    return key;
  }

  return `surveys/${surveyId}/${timestamp}_plainthumb_${fileName}`;
}

/**
 * 注釈が焼き込まれた通常サムネイルを原本から再生成した素のサムネイルへ差し替える
 *
 * 抽出は「通常サムネイルのキーが焼き込みの命名に合致し、かつIDが直前の到達点より大きい」
 * 条件で区切り、1回に読み込む件数を `batchSize` へ制限する。データベース側の絞り込みは
 * SQL の `LIKE` へ写って厳密ではないため、対象は `isAnnotationBakedThumbnailKey` で確定する。
 *
 * 差し替えは「新しいキーへ保存 → 項目を更新 → 旧い焼き込み済みキーを削除」の順に行う。
 * 表示元が失われる瞬間を作らないためであり、保存に失敗した場合は項目を更新せず
 * 焼き込み済みの表示元を維持する（二重描画は残るが表示自体は破綻しない）。
 *
 * 個別の画像で失敗しても処理を継続し、失敗は `failures` へ集約する。全体を中断すると
 * 是正済みの画像まで再実行の対象になるためである。
 *
 * 最後に焼き込まれたまま残っている件数を数え直して `remaining` へ返す。失敗0でも
 * 取りこぼしがあり得る以上、完了の判断を件数の観測に基づかせるためである。
 *
 * @param deps - Prisma クライアント・ストレージ・画像処理
 * @param options - 実行件数の区切りと集計のみの実行
 */
export async function restorePlainThumbnails(
  deps: PlainThumbnailRestoreDependencies,
  options: PlainThumbnailRestoreOptions = {}
): Promise<PlainThumbnailRestoreResult> {
  const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = options;
  const { prisma, storageProvider, imageProcessorService, surveyImageService } = deps;

  const result: PlainThumbnailRestoreResult = {
    targeted: 0,
    restored: 0,
    failures: [],
    remaining: 0,
  };

  let lastId: string | null = null;

  for (;;) {
    const batch = await findBakedThumbnailCandidates(prisma, lastId, batchSize);

    if (batch.length === 0) {
      break;
    }

    // 画像処理は負荷が高いため、区切った範囲の中でも1件ずつ逐次に実行する
    for (const image of batch) {
      // 緩い絞り込みで混ざった、実際には焼き込まれていない画像は対象にしない
      if (!isAnnotationBakedThumbnailKey(image.thumbnailPath)) {
        continue;
      }

      result.targeted += 1;

      if (dryRun) {
        continue;
      }

      try {
        const original = await storageProvider.get(image.originalPath);
        if (original === null) {
          result.failures.push({
            imageId: image.id,
            reason: `原本を取得できませんでした: ${image.originalPath}`,
          });
          continue;
        }

        const thumbnail = await imageProcessorService.generateThumbnail(original);
        // Content-Type は再生成結果の実体から判定する（アップロード時と同じ判定基準）
        const contentType = surveyImageService.detectMimeTypeByMagicBytes(thumbnail);

        // 1. 新しいキーへ保存する。失敗した場合は項目を更新せず旧い表示元を維持する
        const newThumbnailPath = buildPlainThumbnailKey(image.surveyId, image.fileName, Date.now());
        await storageProvider.upload(newThumbnailPath, thumbnail, { contentType });

        // 2. 通常サムネイルの項目のみを差し替える（annotatedThumbnailPath には触れない）
        try {
          await prisma.surveyImage.update({
            where: { id: image.id },
            data: { thumbnailPath: newThumbnailPath },
          });
        } catch (error) {
          // どこからも参照されない実体を残さないよう後始末する（失敗は無視する）
          await storageProvider.delete(newThumbnailPath).catch(() => undefined);
          throw error;
        }

        // 3. 旧い焼き込み済みサムネイルを後始末する（失敗しても是正は成立している）
        if (image.thumbnailPath !== newThumbnailPath) {
          try {
            await storageProvider.delete(image.thumbnailPath);
          } catch (error) {
            logger.warn({
              action: 'restore_plain_thumbnails_stale_key_delete_failed',
              imageId: image.id,
              key: image.thumbnailPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        result.restored += 1;
      } catch (error) {
        result.failures.push({
          imageId: image.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    lastId = batch[batch.length - 1]!.id;

    // 区切りに満たない応答は対象の末尾に達したことを意味する
    if (batch.length < batchSize) {
      break;
    }
  }

  result.remaining = await countRemainingBakedThumbnails(prisma, batchSize);

  return result;
}

/**
 * 実行結果から終了コードを決める
 *
 * 失敗した画像がある場合に加え、焼き込み済みが残っている場合も異常終了とする。
 * 「失敗0件」だけを見て完了と誤認されるのを防ぐためである。
 * 集計のみの実行では差し替えを行わないため、残ることは正常である。
 *
 * @param result - 是正の実行結果
 * @param options - 実行時の指定
 */
export function resolveRestoreExitCode(
  result: PlainThumbnailRestoreResult,
  options: PlainThumbnailRestoreOptions
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
export function parseArgs(argv: string[]): PlainThumbnailRestoreOptions {
  const options: PlainThumbnailRestoreOptions = {};

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
 * 起動処理が外部と接する部分
 *
 * プロセスの引数・環境変数・DB接続・ストレージの設定・終了コードの通知は、いずれも
 * 実行環境そのものに依存する。起動処理の中身（前提条件の確認から終了コードの決定まで）を
 * 実行環境なしで検証できるよう、接点だけをこの文脈へ集約して差し替え可能にしている。
 */
export interface RestoreCliContext {
  /** `process.argv.slice(2)` 相当のコマンドライン引数 */
  argv: string[];
  /** 接続先を読み出す環境変数 */
  env: NodeJS.ProcessEnv;
  /** `.env` の読み込み */
  loadEnv: () => void;
  /** ストレージが設定されているか */
  isStorageConfigured: () => boolean;
  /** ストレージプロバイダーの取得 */
  getStorageProvider: () => StorageProvider | null;
  /** 接続先から Prisma クライアントを組み立てる */
  createPrismaClient: (connectionString: string) => PrismaClient;
  /** 是正に必要な実行時の依存を組み立てる */
  createRestoreDependencies: (
    prisma: PrismaClient,
    storageProvider: StorageProvider
  ) => Promise<PlainThumbnailRestoreDependencies>;
  /** 実行結果の終了コードを通知する */
  setExitCode: (code: number) => void;
}

/**
 * 接続先から Prisma クライアントを組み立てる
 *
 * @param connectionString - データベースの接続先
 */
export function createRestorePrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * 是正に必要な実行時の依存を組み立てる
 *
 * 画像処理は sharp を実行時に読み込んで結線する。起動時点で読み込むと、この手段を
 * 用いない経路にまで sharp の可用性を要求してしまうためである。
 *
 * @param prisma - Prisma クライアント
 * @param storageProvider - ストレージプロバイダー
 */
export async function createRestoreRuntimeDependencies(
  prisma: PrismaClient,
  storageProvider: StorageProvider
): Promise<PlainThumbnailRestoreDependencies> {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const imageProcessorService = new ImageProcessorService(((input: Buffer) =>
    sharp(input)) as SharpStatic);
  const surveyImageService = new SurveyImageService({ prisma, storageProvider });

  return { prisma, storageProvider, imageProcessorService, surveyImageService };
}

/**
 * 実行結果の終了コードをプロセスへ通知する
 *
 * `process.exit` ではなく `exitCode` を用いる。DB接続の解放を待たずに打ち切らないためである。
 *
 * @param code - 終了コード
 */
export function setProcessExitCode(code: number): void {
  process.exitCode = code;
}

/**
 * 実プロセス・実DB・実ストレージへ接続する既定の実行文脈を組み立てる
 */
export function createDefaultRestoreCliContext(): RestoreCliContext {
  return {
    argv: process.argv.slice(2),
    env: process.env,
    loadEnv: config,
    isStorageConfigured,
    getStorageProvider,
    createPrismaClient: createRestorePrismaClient,
    createRestoreDependencies: createRestoreRuntimeDependencies,
    setExitCode: setProcessExitCode,
  };
}

/**
 * スクリプトとして実行されたときの入口
 *
 * @param context - 外部と接する部分
 */
export async function runRestoreCli(context: RestoreCliContext): Promise<void> {
  context.loadEnv();

  const connectionString = context.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  if (!context.isStorageConfigured()) {
    throw new Error('ストレージが設定されていません');
  }

  const storageProvider = context.getStorageProvider();
  if (!storageProvider) {
    throw new Error('ストレージプロバイダーを初期化できませんでした');
  }

  const options = parseArgs(context.argv);
  const prisma = context.createPrismaClient(connectionString);

  try {
    const deps = await context.createRestoreDependencies(prisma, storageProvider);

    logger.info({ action: 'restore_plain_thumbnails_started', ...options });

    const result = await restorePlainThumbnails(deps, options);
    const exitCode = resolveRestoreExitCode(result, options);

    logger.info({
      action: 'restore_plain_thumbnails_finished',
      dryRun: options.dryRun === true,
      targeted: result.targeted,
      restored: result.restored,
      failureCount: result.failures.length,
      failures: result.failures,
      remaining: result.remaining,
      complete: exitCode === 0,
    });

    if (options.dryRun !== true && result.remaining > 0) {
      logger.error({
        action: 'restore_plain_thumbnails_incomplete',
        remaining: result.remaining,
        message: '注釈が焼き込まれたサムネイルが残っている。完了とみなさず再実行すること',
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
    action: 'restore_plain_thumbnails_failed',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

/**
 * このモジュール自身が直接実行されたかを判定する
 *
 * テストからの import では起動しないよう、起動されたスクリプトのパスと自身の
 * モジュールURLが一致する場合のみ真とする。
 *
 * @param scriptPath - `process.argv[1]` 相当の起動対象のパス
 * @param moduleUrl - `import.meta.url` 相当の自身のモジュールURL
 */
export function isDirectExecution(scriptPath: string | undefined, moduleUrl: string): boolean {
  return scriptPath !== undefined && moduleUrl === `file://${scriptPath}`;
}

// 直接実行されたときのみ処理を開始する（テストからの import では起動しない）
if (isDirectExecution(process.argv[1], import.meta.url)) {
  runRestoreCli(createDefaultRestoreCliContext()).catch(reportFatalStartupError);
}
