/**
 * @fileoverview 数量表インポート機能 型定義ファイル
 *
 * Task 44-47: 数量表インポート機能
 *
 * Requirements:
 * - 27.1-27.8: ファイルアップロード・処理起動
 * - 28.1-28.7: Excelデータパース
 * - 29.1-29.10: PDF OCR処理
 * - 30.1-30.7: Claude Vision API連携
 * - 31.1-31.9: 一括取り込み
 * - 32.1-32.6: フィールドマッピング調整
 */

// ============================================================================
// 抽出結果
// ============================================================================

/**
 * インポート抽出結果の行データ
 */
export interface ImportExtractedRow {
  /** 元データの列値（抽出されたままの値） */
  columns: string[];
  /** 元データの行インデックス */
  sourceRowIndex: number;
}

/**
 * インポート抽出結果（ヘッダー情報を含む）
 */
export interface ImportExtractionResult {
  /** 抽出されたヘッダー名リスト */
  headers: string[];
  /** 抽出された行データ */
  rows: ImportExtractedRow[];
  /** 処理タイプ */
  extractionType: 'excel-parse' | 'pdf-text' | 'pdf-ocr' | 'pdf-claude-vision';
  /** シート名（Excelの場合） */
  sheetNames?: string[];
}

// ============================================================================
// フィールドマッピング
// ============================================================================

/**
 * マッピング先フィールド
 */
export type ImportTargetField =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'quantity'
  | 'unit'
  | 'remarks'
  | 'skip';

/**
 * フィールドマッピング設定
 */
export interface ImportFieldMappingConfig {
  /** 列インデックスからマッピング先フィールドへのマップ */
  mappings: Record<number, ImportTargetField>;
}

// ============================================================================
// 一括取り込み用データ
// ============================================================================

/**
 * 一括取り込み用の数量項目データ
 */
export interface ImportQuantityItem {
  majorCategory: string;
  middleCategory: string;
  minorCategory: string;
  customCategory: string;
  workType: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  remarks: string;
  calculationMethod: 'STANDARD';
  adjustmentFactor: number;
  roundingUnit: number;
}

// ============================================================================
// Claude Vision API連携
// ============================================================================

/**
 * 数量表用のClaude Vision抽出結果の明細行データ
 */
export interface ClaudeVisionQuantityLineItem {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
}

/**
 * 数量表用のClaude Vision抽出レスポンス
 */
export interface ClaudeVisionQuantityExtractResponse {
  lineItems: ClaudeVisionQuantityLineItem[];
  pageCount: number;
}
