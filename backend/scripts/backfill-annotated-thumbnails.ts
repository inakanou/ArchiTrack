/**
 * @fileoverview 注釈付きサムネイルのバックフィル（封鎖中）
 *
 * Task 113.3: 合成済みサムネイルを持たない既存注釈を解消する手段を用意する
 * Task 115.6: サーバー側の注釈描画による生成手段の位置づけを確定する
 *
 * 本バックフィルは、合成済みサムネイルを持たない注釈付き画像を抽出し、サーバー側の
 * 注釈描画器（`AnnotatedThumbnailService`）で再生成することを意図した手段である。
 *
 * **現在この手段は起動できない。** 用いる描画器には、実際に保存される注釈（矢印・寸法線・
 * 多角形・折れ線・フリーハンド・テキスト）を一切描画しないという欠陥があり、実行すれば
 * 「注釈が写っていないサムネイル」を既存データへ書き戻してしまう。これは Requirement 20.2 /
 * 20.3 の表示結果を破壊するため、design.md「Requirement 20 / アーキテクチャ方針 /
 * 改訂後の採用方針」で「注釈が欠落した画像を生成しないことが保証されない限り実行しては
 * ならない」と定めた。
 *
 * 抽出条件（`annotatedThumbnailPath` が null かつ注釈レコードが存在する画像）と冪等性の
 * 設計は design.md に記録している。再開するときは、まず描画器側の欠陥
 * （{@link SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON}）を解消し、生成結果に注釈が
 * 含まれることを検証できる手段を用意すること。欠陥の全文は
 * `annotated-thumbnail.service.ts` の `SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON` にある。
 *
 * なお、合成済みサムネイルの欠落は表示側のクライアント合成への退避で表示自体が成立する
 * （Requirement 38.6）ため、本手段が起動できないことによる要件上の未充足は生じない。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 *
 * @module scripts/backfill-annotated-thumbnails
 */

import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  ServerSideAnnotatedThumbnailDisabledError,
  type AnnotatedThumbnailService,
} from '../src/services/annotated-thumbnail.service.js';

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
 * 合成済みサムネイルを持たない注釈付き画像のサムネイルを再生成する（封鎖中）
 *
 * **常に {@link ServerSideAnnotatedThumbnailDisabledError} で失敗する。**
 * 呼び出し側が同期例外と非同期の拒否を取り違えないよう、拒否は Promise の reject で返す。
 * 対象の抽出も注釈データの読み込みも生成も行わないため、既存データへ一切影響しない。
 * 集計のみの実行（`dryRun`）も同様に拒否する。抽出を許すと「実行できる手段である」という
 * 誤解を残すためである。
 *
 * @param _deps - Prisma クライアントと注釈付きサムネイル生成サービス
 * @param _options - 実行件数の区切りと集計のみの実行
 * @throws {ServerSideAnnotatedThumbnailDisabledError} 常に送出する
 */
export async function backfillAnnotatedThumbnails(
  _deps: BackfillDependencies,
  _options: BackfillOptions = {}
): Promise<BackfillResult> {
  throw new ServerSideAnnotatedThumbnailDisabledError();
}
