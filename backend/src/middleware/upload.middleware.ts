/**
 * @fileoverview ファイルアップロードミドルウェア
 *
 * Multerを使用したファイルアップロード処理を提供します。
 *
 * Task 4.1: 画像アップロード機能
 * - Multerによるファイル受信（メモリストレージ）
 * - ファイル形式バリデーション（JPEG、PNG、WEBP）
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.5: 許可されない形式の場合エラーメッセージを表示してアップロードを拒否する
 * - 4.6: 10MBを超えるファイルはアップロードを拒否する
 * - 4.8: JPEG、PNG、WEBP形式の画像ファイルをサポートする
 *
 * @module middleware/upload
 */

import multer, { type FileFilterCallback, type Multer } from 'multer';
import type { Request } from 'express';
import { InvalidFileTypeError, SurveyImageService } from '../services/survey-image.service.js';

/**
 * 最大ファイルサイズ（10MB）
 * Requirements: 4.6
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 1回のリクエストでアップロード可能な最大ファイル数
 * Requirements: 4.7
 */
export const MAX_FILES_PER_REQUEST = 10;

/**
 * カスタムファイルサイズエラー
 */
export class FileSizeExceededError extends Error {
  readonly code = 'FILE_SIZE_EXCEEDED';
  readonly maxSize: number;

  constructor(maxSizeBytes: number) {
    const maxSizeMB = maxSizeBytes / (1024 * 1024);
    super(`ファイルサイズが上限を超えています。最大: ${maxSizeMB}MB`);
    this.name = 'FileSizeExceededError';
    this.maxSize = maxSizeBytes;
  }
}

/**
 * ファイル数超過エラー
 */
export class TooManyFilesError extends Error {
  readonly code = 'TOO_MANY_FILES';
  readonly maxFiles: number;

  constructor(maxFiles: number) {
    super(`一度にアップロードできるファイル数の上限は${maxFiles}枚です。`);
    this.name = 'TooManyFilesError';
    this.maxFiles = maxFiles;
  }
}

/**
 * Multerエラーコードの型
 */
type MulterErrorCode =
  | 'LIMIT_PART_COUNT'
  | 'LIMIT_FILE_SIZE'
  | 'LIMIT_FILE_COUNT'
  | 'LIMIT_FIELD_KEY'
  | 'LIMIT_FIELD_VALUE'
  | 'LIMIT_FIELD_COUNT'
  | 'LIMIT_UNEXPECTED_FILE';

/**
 * Multerエラーを適切なカスタムエラーに変換
 */
export function handleMulterError(error: multer.MulterError): Error {
  const code = error.code as MulterErrorCode;

  switch (code) {
    case 'LIMIT_FILE_SIZE':
      return new FileSizeExceededError(MAX_FILE_SIZE);
    case 'LIMIT_FILE_COUNT':
      return new TooManyFilesError(MAX_FILES_PER_REQUEST);
    case 'LIMIT_UNEXPECTED_FILE':
      return new Error(`予期しないフィールド名です: ${error.field}`);
    default:
      return error;
  }
}

/**
 * ファイルフィルター
 *
 * MIMEタイプに基づいてファイルを受け入れるかどうかを判定します。
 * Requirements: 4.5, 4.8
 *
 * @param _req - Expressリクエスト
 * @param file - アップロードされたファイル
 * @param callback - コールバック関数
 */
function fileFilter(_req: Request, file: Express.Multer.File, callback: FileFilterCallback): void {
  // MIMEタイプのチェック
  if (!SurveyImageService.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(new InvalidFileTypeError(file.mimetype));
    return;
  }

  callback(null, true);
}

/**
 * メモリストレージ設定
 *
 * ファイルをメモリに一時保存し、その後S3/R2にアップロードします。
 */
const storage = multer.memoryStorage();

/**
 * 画像アップロード用Multerインスタンス
 *
 * 設定:
 * - ストレージ: メモリ（バッファとして保持）
 * - ファイルサイズ上限: 10MB
 * - MIMEタイプフィルター: JPEG, PNG, WEBP
 */
export const imageUpload: Multer = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_REQUEST,
  },
  fileFilter,
});

/**
 * 単一画像アップロードミドルウェア
 *
 * フィールド名 'image' で1枚の画像を受け付けます。
 */
export const uploadSingleImage = imageUpload.single('image');

/**
 * 複数画像アップロードミドルウェア
 *
 * フィールド名 'images' で最大10枚の画像を受け付けます。
 * Requirements: 4.7
 */
export const uploadMultipleImages = imageUpload.array('images', MAX_FILES_PER_REQUEST);
