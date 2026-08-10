/**
 * @fileoverview 画像アップロードの失敗保持・再送 型定義ファイル
 *
 * アップロードに失敗した画像を画面に保持し、その場で再送するために
 * 共有する型を提供します。
 *
 * Requirements:
 * - 37.1: 失敗した画像を未送信画像として画面に保持する
 * - 37.2: 各画像のサムネイル・ファイル名・失敗理由を表示する
 * - 37.16: 確定的な拒否を再送不可として区別する
 */

/**
 * 再送で解消しうるか否か
 *
 * - `retriable`: 通信障害・認証エラー・サーバーエラーなど、再送で解消しうる失敗
 * - `permanent`: サーバーの受入条件（サイズ上限・画像形式）違反による確定的な拒否
 */
export type UploadFailureKind = 'retriable' | 'permanent';

/**
 * アップロードに失敗した1件
 */
export interface FailedUpload {
  /** 失敗した画像の実体。再圧縮せずそのまま再送するため File を保持する */
  readonly file: File;
  /** ユーザーへ提示する失敗理由 */
  readonly error: string;
  /** 再送可否の区分 */
  readonly kind: UploadFailureKind;
}

/**
 * onUpload の戻り値。void を返した場合は全件成功とみなす
 */
export interface UploadOutcome {
  /** 当該試行で失敗した画像。空配列なら全件成功 */
  readonly failed: readonly FailedUpload[];
}

/**
 * 保持中の未送信画像
 */
export interface PendingUpload extends FailedUpload {
  /** 重複排除と React key に用いる安定キー */
  readonly id: string;
  /** プレビュー用 ObjectURL。解放は usePendingUploads が保証する */
  readonly previewUrl: string;
}
