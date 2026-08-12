/**
 * @fileoverview 注釈付きサムネイルのバックフィル
 *
 * Task 113.3: 合成済みサムネイルを持たない既存注釈を解消する手段を用意する
 *
 * 注釈は保存時にサーバー側でサムネイルを同期生成するが、次の経路で欠落が残る。
 *
 * 1. 注釈付きサムネイルの導入（マイグレーション 20260223100000）以前に保存された注釈
 * 2. 注釈の永続化後、トランザクション外のサムネイル生成が失敗した場合
 *
 * 欠落した画像は表示時にクライアントサイド合成へ退避するため表示自体は成立する
 * （Requirement 38.6）。本バックフィルはその退避の発生を減らすデータ品質改善であり、
 * 要件の充足条件ではない。取得の上限は表示領域による限定（Requirement 38.8）が担う。
 *
 * Requirements:
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 *
 * @module scripts/backfill-annotated-thumbnails
 */

import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { AnnotatedThumbnailService } from '../src/services/annotated-thumbnail.service.js';
import type { AnnotationData } from '../src/services/annotation.service.js';

// ============================================================================
// 定数
// ============================================================================

/** 一度に注釈データを読み込む件数の既定値 */
const DEFAULT_BATCH_SIZE = 50;

// ============================================================================
// 型定義
// ============================================================================

/** 生成に失敗した画像 */
export interface BackfillFailure {
  imageId: string;
  reason: string;
}

/** バックフィルの実行結果 */
export interface BackfillResult {
  /** 対象となった画像数 */
  targeted: number;
  /** サムネイルを生成できた画像数 */
  regenerated: number;
  /** 注釈が空でサムネイル生成対象外だった画像数 */
  skippedEmpty: number;
  /** 生成に失敗した画像のIDと理由 */
  failures: BackfillFailure[];
}

export interface BackfillOptions {
  /** 一度に注釈データを読み込む件数。既定 50 */
  batchSize?: number;
  /** true のとき対象件数の集計のみ行い、生成を実行しない */
  dryRun?: boolean;
}

export interface BackfillDependencies {
  prisma: PrismaClient;
  annotatedThumbnailService: Pick<AnnotatedThumbnailService, 'generateAnnotatedThumbnail'>;
}

// ============================================================================
// 実装
// ============================================================================

/**
 * 配列を指定サイズごとに分割する
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 合成済みサムネイルを持たない注釈付き画像のサムネイルを再生成する
 *
 * 生成に成功した画像は `annotatedThumbnailPath` が埋まるため、次回実行時の抽出条件
 * （同項が null）に合致しなくなる。したがって再実行しても二重に処理しない。
 *
 * 個別の画像で失敗しても処理を継続し、失敗は `failures` へ集約する。全体を中断すると
 * 解消済みの画像まで再処理することになるためである。
 *
 * @param deps - Prisma クライアントと注釈付きサムネイル生成サービス
 * @param options - 実行件数の区切りと集計のみの実行
 */
export async function backfillAnnotatedThumbnails(
  deps: BackfillDependencies,
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = options;
  const { prisma, annotatedThumbnailService } = deps;

  const result: BackfillResult = {
    targeted: 0,
    regenerated: 0,
    skippedEmpty: 0,
    failures: [],
  };

  // 対象は「注釈レコードが存在し、かつ合成済みサムネイルを持たない画像」。
  // ID のみを先に取得し、重い注釈データは処理する分だけ後から読み込む。
  const targets = await prisma.surveyImage.findMany({
    where: {
      annotatedThumbnailPath: null,
      annotation: { isNot: null },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  result.targeted = targets.length;

  if (dryRun || targets.length === 0) {
    return result;
  }

  for (const idChunk of chunk(
    targets.map((t) => t.id),
    batchSize
  )) {
    const annotations = await prisma.imageAnnotation.findMany({
      where: { imageId: { in: idChunk } },
      select: { imageId: true, data: true },
    });
    const dataByImageId = new Map(annotations.map((a) => [a.imageId, a.data]));

    // 画像処理は負荷が高いため、区切った範囲の中でも逐次に実行する
    for (const imageId of idChunk) {
      const data = dataByImageId.get(imageId);
      if (data === undefined) {
        // 抽出時には存在した注釈が読み込み時に失われている（並行削除など）
        result.failures.push({ imageId, reason: '注釈データを取得できませんでした' });
        continue;
      }

      try {
        const path = await annotatedThumbnailService.generateAnnotatedThumbnail(
          imageId,
          data as unknown as AnnotationData
        );
        if (path === null) {
          // 空の注釈・原画像の欠損など、生成対象にならなかった場合
          result.skippedEmpty += 1;
        } else {
          result.regenerated += 1;
        }
      } catch (error) {
        result.failures.push({
          imageId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}
