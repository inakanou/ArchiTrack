/**
 * @fileoverview 画像アップローダーの定数定義
 *
 * react-refresh/only-export-components 対応のため分離
 */

/** 許可されるファイル拡張子 */
export const ALLOWED_FILE_TYPES = ['.jpg', '.jpeg', '.png', '.webp'];

/** 許可されるMIMEタイプ */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 最大ファイルサイズ（MB） */
export const MAX_FILE_SIZE_MB = 50;

/** 最大ファイルサイズ（バイト） */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
