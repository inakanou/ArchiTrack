/**
 * @fileoverview アップロード失敗の恒久／一時分類ユーティリティ
 *
 * アップロードに失敗した画像を「再送で解消しうるもの（retriable）」と
 * 「再送しても解消しない確定的な拒否（permanent）」に分類する。
 *
 * Requirements:
 * - 37.16: サーバーの受入条件（サイズ上限・画像形式）違反による確定的な拒否を
 *   再送不可として区別する
 * - 37.21: ストレージ保存失敗・画像処理失敗による個別画像の登録失敗は
 *   再送可能な未送信画像として保持する
 *
 * 設計方針:
 * - リクエスト単位の失敗は HTTP ステータスで分類する。400（入力検証）と
 *   413（サイズ上限超過）のみ permanent とし、それ以外（0・401・403・404・5xx、
 *   および ApiError でない例外）は retriable とする。
 * - 207（Multi-Status）は1リクエスト内の個別ファイル失敗を表す。バックエンドの
 *   `failed[]` は `image-upload.service.ts` の `upload()` が投げた**あらゆる例外**
 *   （ストレージ障害・画像処理失敗・DBエラー・枚数上限）を捕捉したものであり、
 *   形式エラーとは限らない。したがって失敗理由の文言で分岐し、画像形式の非対応の
 *   場合のみ permanent とする。一律に permanent とすると、一時的な障害で失敗した
 *   写真をユーザーが破棄するしかなくなり 37.21 に反する。
 * - 判定に迷う場合は retriable に倒す。permanent の誤判定は撮影画像の喪失に
 *   直結するのに対し、retriable の誤判定は無駄な再送に留まるためである。
 *
 * 依存方向:
 * - 本モジュールは `types` 層のみに依存する。`ApiError`（`api/client.ts`）は
 *   utils より上位の層にあるため import せず、`statusCode` を持つ例外という
 *   構造で判定する。
 *
 * 既知の脆さ:
 * - 207 の分類はサーバーのメッセージ文言に依存する。バックエンドが per-file 失敗へ
 *   エラーコードを付与できるようになった時点でコード判定へ移行する。
 */

import type { UploadFailureKind, FailedUpload } from '../types/upload.types';

/**
 * 画像形式の非対応を示すバックエンドのメッセージ断片。
 *
 * 出所（`backend/src/services/survey-image.service.ts`）:
 * - InvalidFileTypeError: `サポートされていないファイル形式です: {mimeType}。...`
 * - UnsupportedImageFormatError: `サポートされていない画像形式です。JPEG、PNG、...`
 * - InvalidMagicBytesError: `ファイルの内容がMIMEタイプと一致しません。...`
 */
const UNSUPPORTED_FORMAT_MESSAGE_FRAGMENTS = [
  'サポートされていないファイル形式',
  'サポートされていない画像形式',
  'MIMEタイプと一致しません',
] as const;

/** 個別ファイル失敗（Multi-Status）を表す HTTP ステータス */
const MULTI_STATUS = 207;

/** 再送しても解消しないリクエスト単位の HTTP ステータス */
const PERMANENT_STATUS_CODES: readonly number[] = [
  400, // 入力検証エラー（ファイル未指定・件数超過など）
  413, // サイズ上限超過
];

/** 失敗理由が判別できない場合にユーザーへ提示する文言 */
const GENERIC_FAILURE_MESSAGE = 'アップロードに失敗しました';

/** `statusCode` を持つ API 例外の構造 */
interface StatusCodeCarrier {
  readonly statusCode: number;
  readonly message?: unknown;
}

/**
 * HTTP ステータスを伴う API 例外かどうかを判定する。
 *
 * `ApiError` クラスを import せず構造で判定することで、utils 層が api 層へ
 * 依存しないという境界を保つ。
 */
function hasStatusCode(error: unknown): error is StatusCodeCarrier {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

/**
 * 例外からユーザーへ提示する失敗理由を取り出す。
 * 文言が得られない場合は汎用文言へフォールバックする。
 */
function resolveFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (hasStatusCode(error) && typeof error.message === 'string' && error.message) {
    return error.message;
  }

  return GENERIC_FAILURE_MESSAGE;
}

/**
 * 画像形式の非対応を示すサーバーメッセージかどうかを判定する。
 *
 * Requirement 19.14 の失敗通知の文言分岐と、本モジュールの 207 分類の
 * 唯一の情報源とする（判定の二重定義を作らないため）。
 *
 * @param message - サーバーが返した失敗理由
 * @returns 画像形式の非対応を示す場合 true
 */
export function isUnsupportedFormatMessage(message: string): boolean {
  if (!message) {
    return false;
  }

  return UNSUPPORTED_FORMAT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * アップロードの失敗を恒久（再送不可）／一時（再送可）に分類する。
 *
 * - リクエスト単位: 400 / 413 は `'permanent'`、それ以外は `'retriable'`
 * - 207（部分失敗）: 失敗理由が画像形式の非対応であれば `'permanent'`、
 *   枚数上限・ストレージ障害・画像処理失敗は `'retriable'`
 *
 * @param error - アップロードで発生した例外
 * @returns 再送可否の区分
 */
export function classifyUploadFailure(error: unknown): UploadFailureKind {
  if (!hasStatusCode(error)) {
    // 通信エラーや想定外の例外は再送で解消しうる
    return 'retriable';
  }

  if (error.statusCode === MULTI_STATUS) {
    return isUnsupportedFormatMessage(resolveFailureMessage(error)) ? 'permanent' : 'retriable';
  }

  return PERMANENT_STATUS_CODES.includes(error.statusCode) ? 'permanent' : 'retriable';
}

/**
 * File と発生した例外から保持用の失敗情報を組み立てる。
 *
 * @param file - 失敗した画像の実体（再圧縮せず再送するため File のまま保持する）
 * @param error - アップロードで発生した例外
 * @returns 未送信画像として保持する失敗情報
 */
export function toFailedUpload(file: File, error: unknown): FailedUpload {
  return {
    file,
    error: resolveFailureMessage(error),
    kind: classifyUploadFailure(error),
  };
}
