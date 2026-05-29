/**
 * @fileoverview ZIP 内ファイル名規則および ZIP ファイル名生成ユーティリティ
 *
 * 現場調査画像の一括エクスポート機能において、ZIP アーカイブ内に格納する
 * 各画像エントリのファイル名、および ZIP ファイル自体のファイル名を
 * 決定論的に生成する純粋関数群を提供する。
 *
 * - ZIP 内エントリ名: `{index 3桁ゼロパディング}_{画像表示名サニタイズ}.{拡張子}`
 * - 重複検出時は `_2`, `_3` のような連番サフィックスを付与
 * - ZIP ファイル名: `{現場調査名サニタイズ}_{YYYYMMDD_HHmmss}.zip`
 * - サニタイズ規則: パス区切り文字・コロン・Windows 予約文字を `_` に置換し 80 文字制限
 *
 * 既存個別エクスポート命名（`AnnotationEditor` 経由の `ExportService.exportImage`）
 * と整合する命名規則に基づく。
 *
 * @requirement site-survey/REQ-31.8 ZIP 内画像ファイル名規則の統一
 * @requirement site-survey/REQ-31.9 ZIP ファイル名の生成
 * @see .kiro/specs/site-survey/design.md zip-naming Service Interface
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * エクスポート形式
 *
 * `ImageExportDialog` で定義される個別エクスポートの `ExportFormat`
 * （'jpeg' | 'png'）と整合する。
 */
export type ExportFormat = 'jpeg' | 'png';

/**
 * ZIP 命名で参照する画像メタデータの最小プロパティ
 *
 * `SurveyImageInfo` 等の上位型から必要な情報のみを切り出した
 * Structural Type。呼び出し側は `SurveyImageInfo` をそのまま渡せる。
 */
export interface SurveyImageMetadata {
  /** 画像ID（一意キー、フォールバック名生成にも利用） */
  id: string;
  /** アップロード時のファイル名（拡張子含む可） */
  fileName: string;
}

/**
 * `buildEntryName` に渡す入力
 */
export interface ZipNamingInput {
  /** 現場調査名（ZIP エントリ名には直接利用しないが、将来拡張のため受け取る） */
  surveyName: string;
  /** エクスポート実行日時（同上、将来拡張用） */
  exportedAt: Date;
  /** 画像メタデータ */
  image: SurveyImageMetadata;
  /** 表示順インデックス（0 始まり、3桁ゼロパディングされる） */
  index: number;
  /** 出力形式 */
  format: ExportFormat;
}

/**
 * ZIP 命名ストラテジ
 */
export interface ZipNamingStrategy {
  /**
   * ZIP 内エントリ名（パス含まないファイル名）を生成する
   *
   * @param input  画像個別の命名入力
   * @param existingNames 既に確定済のエントリ名集合（重複検出に使用、副作用で追加される）
   * @returns 確定したエントリ名（`existingNames` には追加済）
   */
  buildEntryName(input: ZipNamingInput, existingNames: Set<string>): string;

  /**
   * ZIP ファイル名を生成する
   *
   * @param surveyName 現場調査名
   * @param exportedAt 一括エクスポート実行日時
   * @returns `{現場調査名サニタイズ}_{YYYYMMDD_HHmmss}.zip`
   */
  buildZipFileName(surveyName: string, exportedAt: Date): string;
}

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * サニタイズ後の最大文字数
 *
 * パス区切り文字・コロン・Windows 予約文字を置換した上で、
 * この長さで切り詰める。
 */
const MAX_SANITIZED_LENGTH = 80;

/**
 * サニタイズ対象文字パターン
 *
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
 *
 * @param name サニタイズ対象文字列
 * @param maxLength 最大文字数（デフォルト 80）
 * @returns サニタイズ済文字列
 */
export function sanitizeName(name: string, maxLength: number = MAX_SANITIZED_LENGTH): string {
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
 * 日時を `YYYYMMDD_HHmmss` 形式の文字列に変換する
 *
 * ローカルタイムゾーンで生成する（現場調査担当者の手元時刻と
 * 一致するファイル名にするため）。
 *
 * @param date 対象日時
 * @returns `YYYYMMDD_HHmmss` 形式の文字列
 */
export function formatYmdHms(date: Date): string {
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
 * `ExportFormat` を ZIP 内エントリで利用する拡張子（ドット無し）に変換する
 *
 * - `jpeg` → `jpg`（既存個別エクスポートの慣習に合わせる）
 * - `png` → `png`
 */
function getExtensionForFormat(format: ExportFormat): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    default: {
      // 万が一未対応形式が来ても安全なフォールバック
      const fallback: string = format;
      return fallback;
    }
  }
}

/**
 * ファイル名から拡張子を取り除いたベース名を取得する
 */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

// ============================================================================
// 公開関数: buildEntryName / buildZipFileName
// ============================================================================

/**
 * ZIP 内エントリ名を生成する
 *
 * 命名規則: `{index 3桁ゼロパディング}_{画像表示名サニタイズ}.{拡張子}`
 *
 * 重複検出時は `_2`, `_3` … のサフィックスを `拡張子の直前` に付与する。
 * 確定した名前は副作用で `existingNames` に追加される（呼び出し側は同じ
 * Set を次のエントリ生成に渡すことで一意性が保証される）。
 *
 * @param input ZIP 命名入力
 * @param existingNames 既存エントリ名集合（重複検出用、副作用で追加）
 * @returns 確定したエントリ名
 */
export function buildEntryName(input: ZipNamingInput, existingNames: Set<string>): string {
  const indexPrefix = String(input.index).padStart(3, '0');

  // 画像の表示名: fileName から拡張子を除いた部分を使い、サニタイズして長さ制限
  // ベース名 + index プレフィックスを合わせて MAX_SANITIZED_LENGTH 内に収める
  const rawDisplayName = stripExtension(input.image.fileName) || input.image.id || 'image';
  // index prefix (`NNN_`) は 4 文字。拡張子と `_NN` サフィックスを将来付与する余地も考えて
  // 表示名側は 80 - 4 = 76 文字で切る（安全マージン）
  const sanitizedDisplayName = sanitizeName(rawDisplayName, MAX_SANITIZED_LENGTH - 4);

  const ext = getExtensionForFormat(input.format);
  const baseEntryName = `${indexPrefix}_${sanitizedDisplayName}.${ext}`;

  // 重複検出時はサフィックス付与
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
 * 命名規則: `{現場調査名サニタイズ}_{YYYYMMDD_HHmmss}.zip`
 *
 * @param surveyName 現場調査名
 * @param exportedAt 一括エクスポート実行日時
 * @returns ZIP ファイル名
 */
export function buildZipFileName(surveyName: string, exportedAt: Date): string {
  const sanitizedSurveyName = sanitizeName(surveyName);
  const timestamp = formatYmdHms(exportedAt);
  return `${sanitizedSurveyName}_${timestamp}.zip`;
}

// ============================================================================
// デフォルトストラテジ
// ============================================================================

/**
 * デフォルトの ZIP 命名ストラテジ
 *
 * 上記の純粋関数をまとめた `ZipNamingStrategy` 実装。
 * 依存性注入が必要な場合はこのオブジェクトを差し替える。
 */
export const defaultZipNaming: ZipNamingStrategy = {
  buildEntryName,
  buildZipFileName,
};
