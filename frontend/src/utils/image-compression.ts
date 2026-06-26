/**
 * @fileoverview アップロード前の画像事前圧縮ユーティリティ
 *
 * スマートフォンのカメラで撮影した数MB〜十数MBの画像を、アップロード前に
 * ブラウザ側で縮小・再エンコードする。これにより以下を改善する。
 * - アップロードの通信時間短縮（特にモバイル回線）
 * - サーバ側 sharp 処理の負荷軽減（巨大画像のデコードを回避）
 * - multer のファイルサイズ上限（10MB）超過によるアップロード失敗の回避
 *
 * 設計方針:
 * - ブラウザAPI（createImageBitmap / canvas.toBlob）が利用できない環境
 *   （SSR・jsdom等）では何もせず元ファイルを返す（グレースフルデグレード）。
 * - 圧縮に失敗した場合や、圧縮後サイズが元より大きい場合も元ファイルを返す。
 * - EXIF の回転情報は createImageBitmap の imageOrientation で反映する。
 */

import { logger } from './logger';

/** 長辺の最大ピクセル数。これを超える画像は縮小する。 */
const MAX_DIMENSION = 2048;

/** JPEG 再エンコード品質（0〜1）。 */
const JPEG_QUALITY = 0.85;

/**
 * このサイズ以下、かつ長辺が MAX_DIMENSION 以下の画像は圧縮をスキップする。
 * 小さい画像を再エンコードしても効果が薄く、CPU を浪費するだけのため。
 */
const SKIP_COMPRESSION_THRESHOLD_BYTES = 1024 * 1024; // 1MB

/** Canvas でデコード・再エンコード可能な画像 MIME タイプ。 */
const COMPRESSIBLE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * ブラウザの画像圧縮APIが利用可能かを判定する。
 * jsdom や SSR 環境では false を返す。
 */
function isCompressionSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof createImageBitmap === 'function' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.toBlob === 'function'
  );
}

/**
 * 元のファイル名の拡張子を .jpg に置き換える。
 * JPEG へ再エンコードした際にファイル名と実体を整合させる。
 */
function toJpegFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.jpg`;
}

/**
 * canvas.toBlob を Promise 化する。
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * 単一の画像ファイルをアップロード用に事前圧縮する。
 *
 * 圧縮できない・する必要がない場合は元のファイルをそのまま返すため、
 * 呼び出し側は戻り値をそのままアップロードすればよい。
 *
 * @param file - 圧縮対象のファイル
 * @returns 圧縮後のファイル（または元ファイル）
 */
export async function compressImageForUpload(file: File): Promise<File> {
  // 圧縮対象外（非対応MIME・API非対応環境）は元ファイルを返す
  if (!COMPRESSIBLE_MIME_TYPES.has(file.type) || !isCompressionSupported()) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    // EXIF の回転を反映してデコード
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);

    // 十分に小さい画像は再エンコードせず元ファイルを返す
    if (file.size <= SKIP_COMPRESSION_THRESHOLD_BYTES && longEdge <= MAX_DIMENSION) {
      return file;
    }

    // 長辺が MAX_DIMENSION に収まるよう縮小率を計算
    const scale = longEdge > MAX_DIMENSION ? MAX_DIMENSION / longEdge : 1;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, JPEG_QUALITY);

    // 圧縮失敗、または圧縮で逆にサイズが増える場合は元ファイルを使用
    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], toJpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (error) {
    // デコード不可（例: HEIC）などは元ファイルにフォールバック
    logger.warn('画像の事前圧縮に失敗したため元ファイルを使用します', {
      fileName: file.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return file;
  } finally {
    bitmap?.close();
  }
}

/**
 * 複数の画像ファイルをまとめて事前圧縮する。
 *
 * @param files - 圧縮対象のファイル配列
 * @returns 圧縮後のファイル配列（順序は維持）
 */
export async function compressImagesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => compressImageForUpload(file)));
}
