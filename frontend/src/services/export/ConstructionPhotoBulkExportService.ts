/**
 * @fileoverview ConstructionPhotoBulkExportService - 工事写真 ZIP一括エクスポートサービス
 *
 * Task 11.3: ZIP一括エクスポートサービス
 *
 * アルバム配下の写真項目（全件または選択済み）を JSZip で束ね、単一 ZIP Blob を
 * 生成する。看板重畳モード（`signboardMode`）別に画像の取得元を切替え、解像度・
 * 形式は canvas 再エンコードで適用する。
 *
 * - `composited`: `getConstructionPhotoPrintImage`（看板重畳済み印字画像。サーバでオンデマンド合成）
 * - `plain` / `original`: `getConstructionPhotoOriginalImage`（非合成の生原本）
 *
 * `resolution`（低/中/高）・`format`（JPEG/PNG）は canvas に描画してから
 * `canvas.toBlob(mimeType, quality)` で再エンコードして適用する。ただし
 * `signboardMode === 'original'` のときは設定を適用せず、取得した原本バイトを
 * そのまま ZIP に格納する（`plain` は看板なし原本に解像度/形式を適用する）。
 *
 * 逐次処理し各件完了ごとに `onProgress` を通知する。`AbortSignal` が abort 済み/
 * 途中で abort された場合は `AbortError`（`DOMException`）を throw して処理を
 * 中断する（site-survey `bulkExportService` の `status: 'cancelled'` resolve 方式とは
 * 異なり、design.md の記述どおり throw 方式を採る）。1件の取得/変換失敗は当該写真の
 * ID を `failed` に積んでループを継続し、成功分のみで ZIP を生成する。
 *
 * 参照実装: site-survey `services/export/bulkExportService.ts`（JSZip・進捗・
 * AbortSignal・部分失敗集約の枠組み）。ただし本サービスは site-survey 側を
 * 一切変更せず、工事写真専用に独立クローンする。
 *
 * @requirement construction-photo/15.1 一括ZIPダウンロード実行
 * @requirement construction-photo/15.2 形式（JPEG/PNG）選択
 * @requirement construction-photo/15.3 解像度（低/中/高）選択
 * @requirement construction-photo/15.4 看板重畳モード（composited/plain/original）選択
 * @requirement construction-photo/15.5 全件エクスポート
 * @requirement construction-photo/15.6 選択エクスポート
 * @requirement construction-photo/15.8 進捗状況表示（完了件数・総件数）
 * @requirement construction-photo/15.9 中断操作
 * @requirement construction-photo/15.10 部分失敗時の継続
 * @see .kiro/specs/construction-photo/design.md
 *   - Data Contracts: ConstructionPhotoExportFormat/Resolution/SignboardExportMode/Settings/Progress
 *   - Frontend Interfaces（追加機能）: ConstructionPhotoBulkExportService.export
 *   - System Flows: ZIP一括エクスポート（クライアント生成・中断可能）
 * @module services/export/ConstructionPhotoBulkExportService
 */

import JSZip from 'jszip';
import {
  getConstructionPhotoPrintImage,
  getConstructionPhotoOriginalImage,
} from '../../api/construction-photo-images';
import { buildConstructionPhotoZipEntryName } from './constructionPhotoZipNaming';
import type { ConstructionPhotoExportFormat } from './constructionPhotoZipNaming';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import { logger } from '../../utils/logger';

// ============================================================================
// 型定義（design.md の Data Contracts に準拠）
// ============================================================================

/** エクスポート形式（`constructionPhotoZipNaming` の同名型と整合する） */
export type { ConstructionPhotoExportFormat };

/** エクスポート解像度（低・中・高） */
export type ConstructionPhotoExportResolution = 'low' | 'medium' | 'high';

/**
 * 看板重畳モード
 * - `composited`: 看板重畳(サーバ print-image)
 * - `plain`: 看板なし加工（原本を解像度/形式変換）
 * - `original`: 原本そのまま（解像度/形式を適用しない）
 */
export type SignboardExportMode = 'composited' | 'plain' | 'original';

/** ZIP一括エクスポート設定 */
export interface ConstructionPhotoExportSettings {
  format: ConstructionPhotoExportFormat;
  resolution: ConstructionPhotoExportResolution;
  signboardMode: SignboardExportMode;
}

/** 進捗情報 */
export interface ConstructionPhotoExportProgress {
  completed: number;
  total: number;
  failed: number;
}

/** `ConstructionPhotoBulkExportService.export` のハンドラ */
export interface ConstructionPhotoBulkExportHandlers {
  onProgress: (progress: ConstructionPhotoExportProgress) => void;
  /** 中断用 AbortSignal。abort 済み/途中 abort で AbortError を throw する */
  signal: AbortSignal;
}

/** `ConstructionPhotoBulkExportService.export` の結果 */
export interface ConstructionPhotoBulkExportResult {
  /** 生成された ZIP Blob（成功分のみを含む。全件失敗時は空 ZIP） */
  blob: Blob;
  /** 取得/加工に失敗した写真項目IDの配列 */
  failed: string[];
}

/** `ConstructionPhotoBulkExportService` インターフェース */
export interface ConstructionPhotoBulkExportService {
  export(
    photos: ConstructionPhotoWithUrls[],
    settings: ConstructionPhotoExportSettings,
    handlers: ConstructionPhotoBulkExportHandlers
  ): Promise<ConstructionPhotoBulkExportResult>;
}

// ============================================================================
// 解像度ごとの品質パラメータ
// ============================================================================

/**
 * `ConstructionPhotoExportResolution` を canvas 再エンコードの `quality`
 * パラメータにマップする。site-survey `bulkExportService` の
 * `QUALITY_BY_RESOLUTION`（0.6 / 0.9 / 1.0 の3段階）規約に倣う。
 */
const QUALITY_BY_RESOLUTION: Record<ConstructionPhotoExportResolution, number> = {
  low: 0.6,
  medium: 0.9,
  high: 1.0,
};

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * 現在の `AbortSignal` が abort 済みであれば `AbortError`（`DOMException`）を throw する
 */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The export was aborted', 'AbortError');
  }
}

/**
 * 例外オブジェクトから message 文字列を取り出す
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * `signboardMode` に応じて取得元を切替え、画像 Blob を取得する
 *
 * - `composited`: `getConstructionPhotoPrintImage`（看板重畳済み印字画像）
 * - `plain` / `original`: `getConstructionPhotoOriginalImage`（非合成の生原本）
 */
async function fetchSourceBlob(photoId: string, signboardMode: SignboardExportMode): Promise<Blob> {
  if (signboardMode === 'composited') {
    return getConstructionPhotoPrintImage(photoId);
  }
  return getConstructionPhotoOriginalImage(photoId);
}

/**
 * canvas.toBlob を Promise 化する
 */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('canvas エンコードに失敗しました'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * `ConstructionPhotoExportFormat` を canvas 再エンコードの MIME タイプへ変換する
 */
function toMimeType(format: ConstructionPhotoExportFormat): string {
  return format === 'png' ? 'image/png' : 'image/jpeg';
}

/**
 * Blob を canvas に描画し、指定の形式・解像度品質で再エンコードする
 *
 * `createImageBitmap` + `HTMLCanvasElement` によるデコード/再エンコードは
 * 本リポジトリ既存の `utils/image-compression.ts` と同じ規約に倣う。
 */
async function reencodeBlob(
  sourceBlob: Blob,
  format: ConstructionPhotoExportFormat,
  resolution: ConstructionPhotoExportResolution
): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(sourceBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas 2D コンテキストを取得できませんでした');
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, toMimeType(format), QUALITY_BY_RESOLUTION[resolution]);
  } finally {
    bitmap?.close();
  }
}

// ============================================================================
// Service 実装
// ============================================================================

/**
 * `ConstructionPhotoBulkExportService` のデフォルト実装を生成する factory
 *
 * - `photos` を順次処理し、`signboardMode` に応じて取得元を切替える
 * - `signboardMode === 'original'` のときは canvas を通さず原本バイトをそのまま
 *   ZIP に格納する。それ以外（`composited` / `plain`）は canvas 再エンコードで
 *   `resolution`/`format` を適用する
 * - 各件完了ごとに `onProgress({ completed, total, failed })` を通知する
 * - `signal.aborted` を検知した時点で `AbortError` を throw し、途中生成物を
 *   破棄する（ZIP は生成しない）
 * - 個別写真の取得/変換失敗は `failed` に ID を積みループを継続する。成功分の
 *   みで ZIP を生成する（全件失敗時も空 ZIP を返す）
 */
export function createConstructionPhotoBulkExportService(): ConstructionPhotoBulkExportService {
  return {
    async export(
      photos: ConstructionPhotoWithUrls[],
      settings: ConstructionPhotoExportSettings,
      handlers: ConstructionPhotoBulkExportHandlers
    ): Promise<ConstructionPhotoBulkExportResult> {
      const { onProgress, signal } = handlers;
      const total = photos.length;

      // 開始前 abort 済みなら即座に AbortError を throw する
      throwIfAborted(signal);

      const zip = new JSZip();
      const existingNames = new Set<string>();
      const failed: string[] = [];

      for (let index = 0; index < photos.length; index += 1) {
        // 反復先頭での abort 確認
        throwIfAborted(signal);

        const photo = photos[index];
        if (!photo) {
          continue;
        }

        try {
          const sourceBlob = await fetchSourceBlob(photo.id, settings.signboardMode);

          // 取得完了直後の abort 確認
          throwIfAborted(signal);

          const finalBlob =
            settings.signboardMode === 'original'
              ? sourceBlob
              : await reencodeBlob(sourceBlob, settings.format, settings.resolution);

          // 変換完了直後の abort 確認
          throwIfAborted(signal);

          const entryName = buildConstructionPhotoZipEntryName(
            { photo: { id: photo.id, fileName: photo.fileName }, index, format: settings.format },
            existingNames
          );
          zip.file(entryName, finalBlob);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
          }
          failed.push(photo.id);
          logger.warn('工事写真のZIPエクスポートに失敗しました', {
            photoId: photo.id,
            message: extractErrorMessage(error),
          });
        }

        onProgress({ completed: index + 1, total, failed: failed.length });
      }

      // ZIP 生成直前の最終 abort 確認
      throwIfAborted(signal);

      const blob = await zip.generateAsync({ type: 'blob' });

      return { blob, failed };
    },
  };
}

/**
 * デフォルトの `ConstructionPhotoBulkExportService` インスタンス
 */
export const constructionPhotoBulkExportService: ConstructionPhotoBulkExportService =
  createConstructionPhotoBulkExportService();
