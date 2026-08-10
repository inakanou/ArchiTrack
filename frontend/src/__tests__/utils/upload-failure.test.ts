/**
 * @fileoverview アップロード失敗の恒久／一時分類ユーティリティのテスト
 *
 * Task 104.2: アップロード失敗の恒久・一時分類を実装する
 *
 * Requirements:
 * - 37.16: サーバーの受入条件（サイズ上限・画像形式）違反を再送不可として区別する
 * - 37.21: ストレージ保存失敗・画像処理失敗は再送可能な未送信画像として保持する
 *
 * テスト対象:
 * - classifyUploadFailure 関数
 * - isUnsupportedFormatMessage 関数
 * - toFailedUpload 関数
 *
 * 期待文言の出所（推測ではなく実装から採取した実文言）:
 * - `backend/src/services/survey-image.service.ts` の InvalidFileTypeError /
 *   InvalidMagicBytesError / UnsupportedImageFormatError
 * - `backend/src/services/image-upload.service.ts` の MaxImagesExceededError と
 *   uploadBatch が failed[] へ詰める文言
 * - `backend/src/services/image-processor.service.ts` の ImageProcessingError
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  classifyUploadFailure,
  isUnsupportedFormatMessage,
  toFailedUpload,
} from '../../utils/upload-failure';

// =============================================================================
// バックエンド実装から採取した実際の失敗文言
// =============================================================================

/** multer の fileFilter が投げる InvalidFileTypeError の文言 */
const INVALID_FILE_TYPE_MESSAGE =
  'サポートされていないファイル形式です: application/pdf。サポートされている形式: JPEG, PNG, WEBP';

/** マジックバイト判定が投げる UnsupportedImageFormatError の文言 */
const UNSUPPORTED_IMAGE_FORMAT_MESSAGE =
  'サポートされていない画像形式です。JPEG、PNG、WEBP形式のファイルをアップロードしてください。';

/** MIMEタイプ不一致（InvalidMagicBytesError）の文言 */
const INVALID_MAGIC_BYTES_MESSAGE =
  'ファイルの内容がMIMEタイプと一致しません。期待されるタイプ: image/jpeg';

/** uploadBatch の枚数上限プリチェックが failed[] へ詰める文言 */
const BATCH_MAX_IMAGES_MESSAGE = '画像数の上限（50枚）に達しました';

/** upload() の MaxImagesExceededError が failed[] へ伝播する文言 */
const MAX_IMAGES_EXCEEDED_MESSAGE = '画像数の上限（50枚）に達しています。現在の画像数: 50枚';

/** ストレージ保存失敗が failed[] へ伝播する文言（例外メッセージそのまま） */
const STORAGE_FAILURE_MESSAGE = 'Failed to upload to storage: ECONNRESET';

/** uploadBatch の非 Error 例外に対するフォールバック文言 */
const GENERIC_UPLOAD_FAILURE_MESSAGE = 'アップロードに失敗しました';

/** 画像処理失敗（ImageProcessingError）の文言 */
const THUMBNAIL_FAILURE_MESSAGE = 'サムネイルの生成に失敗しました。';
const COMPRESSION_FAILURE_MESSAGE = '画像の圧縮に失敗しました。';

/** テスト用の File を生成する */
function createFile(name = 'photo.jpg'): File {
  return new File(['dummy'], name, { type: 'image/jpeg' });
}

// =============================================================================
// isUnsupportedFormatMessage テスト
// =============================================================================

describe('isUnsupportedFormatMessage', () => {
  it('multerのファイル形式エラー文言に真を返すこと', () => {
    expect(isUnsupportedFormatMessage(INVALID_FILE_TYPE_MESSAGE)).toBe(true);
  });

  it('マジックバイト判定の非対応画像形式の文言に真を返すこと', () => {
    expect(isUnsupportedFormatMessage(UNSUPPORTED_IMAGE_FORMAT_MESSAGE)).toBe(true);
  });

  it('MIMEタイプ不一致の文言に真を返すこと', () => {
    expect(isUnsupportedFormatMessage(INVALID_MAGIC_BYTES_MESSAGE)).toBe(true);
  });

  it('枚数上限の文言に偽を返すこと（37.21: 再送で解消しうるため形式エラーではない）', () => {
    expect(isUnsupportedFormatMessage(BATCH_MAX_IMAGES_MESSAGE)).toBe(false);
    expect(isUnsupportedFormatMessage(MAX_IMAGES_EXCEEDED_MESSAGE)).toBe(false);
  });

  it('ストレージ障害・画像処理失敗・汎用文言に偽を返すこと', () => {
    expect(isUnsupportedFormatMessage(STORAGE_FAILURE_MESSAGE)).toBe(false);
    expect(isUnsupportedFormatMessage(THUMBNAIL_FAILURE_MESSAGE)).toBe(false);
    expect(isUnsupportedFormatMessage(COMPRESSION_FAILURE_MESSAGE)).toBe(false);
    expect(isUnsupportedFormatMessage(GENERIC_UPLOAD_FAILURE_MESSAGE)).toBe(false);
  });

  it('空文字列に偽を返すこと', () => {
    expect(isUnsupportedFormatMessage('')).toBe(false);
  });
});

// =============================================================================
// classifyUploadFailure テスト（リクエスト単位の失敗）
// =============================================================================

describe('classifyUploadFailure - リクエスト単位の失敗', () => {
  it('400（入力検証エラー）を permanent に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(400, 'ファイルが指定されていません'))).toBe(
      'permanent'
    );
  });

  it('413（サイズ上限超過）を permanent に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(413, 'ファイルサイズが上限を超えています'))).toBe(
      'permanent'
    );
  });

  it('0（通信エラー）を retriable に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(0, 'ネットワークエラーが発生しました'))).toBe(
      'retriable'
    );
  });

  it.each([401, 403, 404, 500, 502, 503])(
    '%i を retriable に分類すること',
    (statusCode: number) => {
      expect(classifyUploadFailure(new ApiError(statusCode, 'エラー'))).toBe('retriable');
    }
  );

  it('ApiError 以外の例外を retriable に分類すること', () => {
    expect(classifyUploadFailure(new TypeError('Failed to fetch'))).toBe('retriable');
  });

  it('例外でない値（undefined / null / 文字列）を retriable に分類すること', () => {
    expect(classifyUploadFailure(undefined)).toBe('retriable');
    expect(classifyUploadFailure(null)).toBe('retriable');
    expect(classifyUploadFailure('失敗')).toBe('retriable');
  });
});

// =============================================================================
// classifyUploadFailure テスト（207: 1リクエスト内の個別ファイル失敗）
// =============================================================================

describe('classifyUploadFailure - 207 部分失敗', () => {
  it('画像形式の非対応（multer文言）を permanent に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, INVALID_FILE_TYPE_MESSAGE))).toBe('permanent');
  });

  it('画像形式の非対応（マジックバイト文言）を permanent に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, UNSUPPORTED_IMAGE_FORMAT_MESSAGE))).toBe(
      'permanent'
    );
  });

  it('MIMEタイプ不一致を permanent に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, INVALID_MAGIC_BYTES_MESSAGE))).toBe('permanent');
  });

  it('枚数上限（uploadBatch プリチェック文言）を retriable に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, BATCH_MAX_IMAGES_MESSAGE))).toBe('retriable');
  });

  it('枚数上限（MaxImagesExceededError 文言）を retriable に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, MAX_IMAGES_EXCEEDED_MESSAGE))).toBe('retriable');
  });

  /**
   * @requirement site-survey/REQ-37.21: ストレージ保存の失敗は再送可能な未送信画像として保持する
   */
  it('ストレージ障害を retriable に分類すること（37.21）', () => {
    expect(classifyUploadFailure(new ApiError(207, STORAGE_FAILURE_MESSAGE))).toBe('retriable');
  });

  /**
   * @requirement site-survey/REQ-37.21: 画像処理の失敗も再送可能な未送信画像として保持する
   */
  it('画像処理失敗を retriable に分類すること（37.21）', () => {
    expect(classifyUploadFailure(new ApiError(207, THUMBNAIL_FAILURE_MESSAGE))).toBe('retriable');
    expect(classifyUploadFailure(new ApiError(207, COMPRESSION_FAILURE_MESSAGE))).toBe('retriable');
  });

  it('汎用のアップロード失敗文言を retriable に分類すること', () => {
    expect(classifyUploadFailure(new ApiError(207, GENERIC_UPLOAD_FAILURE_MESSAGE))).toBe(
      'retriable'
    );
  });
});

// =============================================================================
// toFailedUpload テスト
// =============================================================================

describe('toFailedUpload', () => {
  it('File と失敗理由と区分を組み立てること', () => {
    const file = createFile('site.jpg');
    const result = toFailedUpload(file, new ApiError(500, 'サーバーエラーが発生しました'));

    expect(result.file).toBe(file);
    expect(result.error).toBe('サーバーエラーが発生しました');
    expect(result.kind).toBe('retriable');
  });

  it('413 を permanent として組み立てること', () => {
    const file = createFile();
    const result = toFailedUpload(file, new ApiError(413, 'ファイルサイズが上限を超えています'));

    expect(result.kind).toBe('permanent');
    expect(result.error).toBe('ファイルサイズが上限を超えています');
  });

  it('207 のストレージ障害を retriable として組み立てること（37.21）', () => {
    const file = createFile();
    const result = toFailedUpload(file, new ApiError(207, STORAGE_FAILURE_MESSAGE));

    expect(result.kind).toBe('retriable');
    expect(result.error).toBe(STORAGE_FAILURE_MESSAGE);
  });

  it('207 の画像形式エラーを permanent として組み立てること（37.16）', () => {
    const file = createFile();
    const result = toFailedUpload(file, new ApiError(207, UNSUPPORTED_IMAGE_FORMAT_MESSAGE));

    expect(result.kind).toBe('permanent');
    expect(result.error).toBe(UNSUPPORTED_IMAGE_FORMAT_MESSAGE);
  });

  it('Error 以外の値には汎用の失敗理由を割り当てること', () => {
    const file = createFile();
    const result = toFailedUpload(file, undefined);

    expect(result.error).toBe(GENERIC_UPLOAD_FAILURE_MESSAGE);
    expect(result.kind).toBe('retriable');
  });

  it('空メッセージの例外には汎用の失敗理由を割り当てること', () => {
    const file = createFile();
    const result = toFailedUpload(file, new Error(''));

    expect(result.error).toBe(GENERIC_UPLOAD_FAILURE_MESSAGE);
    expect(result.kind).toBe('retriable');
  });
});
