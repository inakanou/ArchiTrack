/**
 * @fileoverview ZIP 内エントリ名 / ZIP ファイル名生成ユーティリティ（工事写真専用）
 *
 * Task 11.3: ZIP一括エクスポートサービスの命名ユーティリティ。
 *
 * 現場調査（site-survey）の `services/export/zip-naming.ts` と同じ命名規則
 * （通し番号3桁ゼロパディング + サニタイズ済みファイル名、重複時は連番サフィックス、
 * ZIPファイル名は `{アルバム名}_{YYYYMMDD_HHmmss}.zip`）を踏襲するが、
 * site-survey 側は改変せず、工事写真専用に独立クローンする。
 *
 * @requirement construction-photo/15.1 ZIP一括エクスポート
 * @see .kiro/specs/construction-photo/design.md
 *   - Components: `services/export/constructionPhotoZipNaming.ts` — ZIPエントリ命名（`zip-naming` 相当のクローン）(R15)
 * @module services/export/constructionPhotoZipNaming
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * エクスポート形式（`ConstructionPhotoBulkExportService` の同名型と整合する）
 */
export type ConstructionPhotoExportFormat = 'jpeg' | 'png';

/**
 * ZIP 命名で参照する写真項目メタデータの最小プロパティ
 *
 * `ConstructionPhotoWithUrls` から必要な情報のみを切り出した Structural Type。
 * 呼び出し側は `ConstructionPhotoWithUrls` をそのまま渡せる。
 */
export interface ConstructionPhotoZipNamingMetadata {
  /** 写真項目ID（一意キー、フォールバック名生成にも利用） */
  id: string;
  /** アップロード時のファイル名（拡張子含む可） */
  fileName: string;
}

/**
 * `buildConstructionPhotoZipEntryName` に渡す入力
 */
export interface ConstructionPhotoZipEntryNameInput {
  /** 写真項目メタデータ */
  photo: ConstructionPhotoZipNamingMetadata;
  /** 表示順インデックス（0 始まり、3桁ゼロパディングされる） */
  index: number;
  /** 出力形式 */
  format: ConstructionPhotoExportFormat;
}

/**
 * ZIP 命名ストラテジ
 */
export interface ConstructionPhotoZipNamingStrategy {
  /**
   * ZIP 内エントリ名（パス含まないファイル名）を生成する
   *
   * @param input 写真項目個別の命名入力
   * @param existingNames 既に確定済のエントリ名集合（重複検出に使用、副作用で追加される）
   * @returns 確定したエントリ名（`existingNames` には追加済）
   */
  buildEntryName(input: ConstructionPhotoZipEntryNameInput, existingNames: Set<string>): string;

  /**
   * ZIP ファイル名を生成する
   *
   * @param albumName アルバム名
   * @param exportedAt 一括エクスポート実行日時
   * @returns `{アルバム名サニタイズ}_{YYYYMMDD_HHmmss}.zip`
   */
  buildZipFileName(albumName: string, exportedAt: Date): string;
}

// ============================================================================
// 内部ヘルパー
// ============================================================================

/** サニタイズ後の最大文字数 */
const MAX_SANITIZED_LENGTH = 80;

/**
 * サニタイズ対象文字パターン
 * - パス区切り: `/`, `\`
 * - コロン: `:`
 * - Windows 予約文字: `?`, `*`, `"`, `<`, `>`, `|`
 * - 制御文字: `\x00-\x1F`
 */
const UNSAFE_NAME_PATTERN = /[/\\:?*"<>|\x00-\x1F]/g;

/**
 * 文字列をファイル名として安全な形にサニタイズする
 *
 * - パス区切り文字・コロン・Windows 予約文字・制御文字を `_` に置換
 * - 先頭/末尾の空白とピリオドを除去
 * - 指定長以内に切り詰め
 * - 結果が空文字になる場合は `unnamed` を返す
 */
export function sanitizeConstructionPhotoName(
  name: string,
  maxLength: number = MAX_SANITIZED_LENGTH
): string {
  if (!name) {
    return 'unnamed';
  }

  const replaced = name.replace(UNSAFE_NAME_PATTERN, '_');
  const trimmed = replaced.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');

  if (trimmed.length === 0) {
    return 'unnamed';
  }

  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

/**
 * 日時を `YYYYMMDD_HHmmss` 形式の文字列に変換する（ローカルタイムゾーン）
 */
export function formatConstructionPhotoYmdHms(date: Date): string {
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * `ConstructionPhotoExportFormat` を ZIP 内エントリで利用する拡張子（ドット無し）に変換する
 * - `jpeg` → `jpg`
 * - `png` → `png`
 */
function getExtensionForFormat(format: ConstructionPhotoExportFormat): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    default: {
      const fallback: string = format;
      return fallback;
    }
  }
}

/** ファイル名から拡張子を取り除いたベース名を取得する */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

// ============================================================================
// 公開関数
// ============================================================================

/**
 * ZIP 内エントリ名を生成する
 *
 * 命名規則: `{index 3桁ゼロパディング}_{画像表示名サニタイズ}.{拡張子}`
 *
 * 重複検出時は `_2`, `_3` … のサフィックスを拡張子の直前に付与する。
 * 確定した名前は副作用で `existingNames` に追加される。
 */
export function buildConstructionPhotoZipEntryName(
  input: ConstructionPhotoZipEntryNameInput,
  existingNames: Set<string>
): string {
  const indexPrefix = String(input.index).padStart(3, '0');

  const rawDisplayName = stripExtension(input.photo.fileName) || input.photo.id || 'photo';
  // index prefix（`NNN_`）は 4 文字。重複サフィックスの余地も見込み 80-4 文字で切る
  const sanitizedDisplayName = sanitizeConstructionPhotoName(
    rawDisplayName,
    MAX_SANITIZED_LENGTH - 4
  );

  const ext = getExtensionForFormat(input.format);
  const baseEntryName = `${indexPrefix}_${sanitizedDisplayName}.${ext}`;

  let candidate = baseEntryName;
  let suffix = 2;
  while (existingNames.has(candidate)) {
    candidate = `${indexPrefix}_${sanitizedDisplayName}_${suffix}.${ext}`;
    suffix += 1;
  }

  existingNames.add(candidate);
  return candidate;
}

/**
 * ZIP ファイル名を生成する
 *
 * 命名規則: `{アルバム名サニタイズ}_{YYYYMMDD_HHmmss}.zip`
 */
export function buildConstructionPhotoZipFileName(albumName: string, exportedAt: Date): string {
  const sanitizedAlbumName = sanitizeConstructionPhotoName(albumName);
  const timestamp = formatConstructionPhotoYmdHms(exportedAt);
  return `${sanitizedAlbumName}_${timestamp}.zip`;
}

// ============================================================================
// デフォルトストラテジ
// ============================================================================

/**
 * デフォルトの ZIP 命名ストラテジ
 */
export const defaultConstructionPhotoZipNaming: ConstructionPhotoZipNamingStrategy = {
  buildEntryName: buildConstructionPhotoZipEntryName,
  buildZipFileName: buildConstructionPhotoZipFileName,
};
