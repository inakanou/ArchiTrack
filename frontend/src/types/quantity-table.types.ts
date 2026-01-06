/**
 * @fileoverview 数量表機能 型定義ファイル
 *
 * フロントエンド用の数量表管理に関する型定義を提供します。
 *
 * Task 4.1: 数量表セクションカードの型定義
 *
 * Requirements:
 * - 1.1: プロジェクト詳細画面に数量表セクションを表示する
 * - 1.2: 数量表の総数とヘッダーを表示する
 * - 1.3: 直近の数量表カードを一覧表示する
 * - 1.4: 数量表一覧画面への遷移リンク
 * - 1.5: 数量表詳細/編集画面への遷移リンク
 * - 1.6: 空状態表示（数量表がない場合）
 * - 1.7: 新規作成ボタン
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 数量表ソート可能フィールド
 */
export const QUANTITY_TABLE_SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name'] as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * ソート可能フィールド型
 */
export type QuantityTableSortableField = (typeof QUANTITY_TABLE_SORTABLE_FIELDS)[number];

/**
 * ソート順序型
 */
export type QuantityTableSortOrder = 'asc' | 'desc';

/**
 * 数量表情報（一覧表示用）
 *
 * Requirements: 1.3
 */
export interface QuantityTableInfo {
  /** 数量表ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 数量表名 */
  name: string;
  /** グループ数 */
  groupCount: number;
  /** 項目数 */
  itemCount: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * プロジェクト別数量表サマリー
 *
 * Requirements: 1.2, 1.3
 *
 * プロジェクト詳細画面の数量表セクションで表示する
 * 直近の数量表一覧と総数を含む。
 */
export interface ProjectQuantityTableSummary {
  /** 数量表の総数 */
  totalCount: number;
  /** 直近N件の数量表 */
  latestTables: QuantityTableInfo[];
}

/**
 * ページネーション情報
 */
export interface QuantityTablePaginationInfo {
  /** 現在のページ番号（1始まり） */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
  /** 総件数 */
  total: number;
  /** 総ページ数 */
  totalPages: number;
}

/**
 * ページネーション付き数量表一覧レスポンス
 */
export interface PaginatedQuantityTables {
  /** 数量表一覧 */
  data: QuantityTableInfo[];
  /** ページネーション情報 */
  pagination: QuantityTablePaginationInfo;
}

/**
 * 数量表フィルタ
 */
export interface QuantityTableFilter {
  /** 検索キーワード（名前の部分一致） */
  search?: string;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 数量表作成入力
 */
export interface CreateQuantityTableInput {
  /** 数量表名（1-200文字、必須） */
  name: string;
}

/**
 * 数量表更新入力
 */
export interface UpdateQuantityTableInput {
  /** 数量表名（1-200文字） */
  name?: string;
}

// ============================================================================
// エラーレスポンス型定義
// ============================================================================

/**
 * 数量表未発見エラーレスポンス
 */
export interface QuantityTableNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'QUANTITY_TABLE_NOT_FOUND';
  /** 数量表ID（任意） */
  quantityTableId?: string;
}

/**
 * 数量表競合エラーレスポンス（楽観的排他制御エラー）
 */
export interface QuantityTableConflictErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'QUANTITY_TABLE_CONFLICT';
  /** 期待されていた更新日時（ISO8601形式） */
  expectedUpdatedAt?: string;
  /** 実際の更新日時（ISO8601形式） */
  actualUpdatedAt?: string;
}

/**
 * プロジェクト未発見エラーレスポンス
 */
export interface ProjectNotFoundForQuantityTableErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'PROJECT_NOT_FOUND';
  /** 存在しないプロジェクトID */
  projectId: string;
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がQuantityTableNotFoundErrorResponseかどうかを判定するタイプガード
 */
export function isQuantityTableNotFoundErrorResponse(
  value: unknown
): value is QuantityTableNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'QUANTITY_TABLE_NOT_FOUND'
  );
}

/**
 * 値がQuantityTableConflictErrorResponseかどうかを判定するタイプガード
 */
export function isQuantityTableConflictErrorResponse(
  value: unknown
): value is QuantityTableConflictErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'QUANTITY_TABLE_CONFLICT'
  );
}

/**
 * 値がProjectNotFoundForQuantityTableErrorResponseかどうかを判定するタイプガード
 */
export function isProjectNotFoundForQuantityTableErrorResponse(
  value: unknown
): value is ProjectNotFoundForQuantityTableErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'PROJECT_NOT_FOUND' &&
    typeof obj.projectId === 'string'
  );
}

/**
 * 値がQuantityTableSortableFieldかどうかを判定するタイプガード
 */
export function isQuantityTableSortableField(value: unknown): value is QuantityTableSortableField {
  return (
    typeof value === 'string' &&
    (QUANTITY_TABLE_SORTABLE_FIELDS as readonly string[]).includes(value as string)
  );
}

// ============================================================================
// 数量表詳細（グループ・項目を含む）
// Task 5.1: 数量表編集画面用の型定義
// ============================================================================

/**
 * 計算方法
 */
export type CalculationMethod = 'STANDARD' | 'AREA_VOLUME' | 'PITCH';

/**
 * 計算パラメータ
 */
export interface CalculationParams {
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
  rangeLength?: number;
  endLength1?: number;
  endLength2?: number;
  pitchLength?: number;
  length?: number;
}

/**
 * 現場調査画像情報（簡易）
 */
export interface SurveyImageSummary {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName: string;
}

/**
 * 数量項目情報（詳細取得用）
 */
export interface QuantityItemDetail {
  id: string;
  quantityGroupId: string;
  majorCategory: string;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  calculationMethod: CalculationMethod;
  calculationParams: CalculationParams | null;
  adjustmentFactor: number;
  roundingUnit: number;
  quantity: number;
  remarks: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 数量グループ情報（詳細取得用）
 */
export interface QuantityGroupDetail {
  id: string;
  quantityTableId: string;
  name: string | null;
  surveyImageId: string | null;
  surveyImage: SurveyImageSummary | null;
  displayOrder: number;
  itemCount: number;
  items: QuantityItemDetail[];
  createdAt: string;
  updatedAt: string;
}

/**
 * プロジェクト情報（簡易）
 */
export interface ProjectInfoSummary {
  id: string;
  name: string;
}

/**
 * 数量表詳細（グループ・項目を含む）
 *
 * Requirements: 3.1
 */
export interface QuantityTableDetail {
  id: string;
  projectId: string;
  project: ProjectInfoSummary;
  name: string;
  groupCount: number;
  itemCount: number;
  groups: QuantityGroupDetail[];
  createdAt: string;
  updatedAt: string;
}
