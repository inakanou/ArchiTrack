/**
 * @fileoverview 内訳書機能 型定義ファイル
 *
 * フロントエンド用の内訳書管理に関する型定義を提供します。
 *
 * Task 4.2: 型定義とバリデーションの実装
 *
 * Requirements:
 * - 1.3: 内訳書作成
 * - 3.4: 内訳書一覧表示
 * - 4.1: 内訳書詳細取得
 * - 7.3: 内訳書削除
 * - 10.4: 楽観的排他制御エラー
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 内訳書ソート可能フィールド
 */
export const ITEMIZED_STATEMENT_SORTABLE_FIELDS = ['createdAt', 'name'] as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * ソート可能フィールド型
 */
export type ItemizedStatementSortableField = (typeof ITEMIZED_STATEMENT_SORTABLE_FIELDS)[number];

/**
 * ソート順序型
 */
export type ItemizedStatementSortOrder = 'asc' | 'desc';

/**
 * 内訳書情報（一覧表示用）
 *
 * Requirements: 3.4
 */
export interface ItemizedStatementInfo {
  /** 内訳書ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 内訳書名 */
  name: string;
  /** 集計元数量表ID */
  sourceQuantityTableId: string;
  /** 集計元数量表名（スナップショット） */
  sourceQuantityTableName: string;
  /** 項目数 */
  itemCount: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 内訳書項目情報
 *
 * ピボット集計後の項目データ
 */
export interface ItemizedStatementItemInfo {
  /** 項目ID */
  id: string;
  /** カスタムカテゴリ */
  customCategory: string | null;
  /** 作業種別 */
  workType: string | null;
  /** 名称 */
  name: string | null;
  /** 規格 */
  specification: string | null;
  /** 単位 */
  unit: string | null;
  /** 数量（集計値） */
  quantity: number;
}

/**
 * プロジェクト情報（簡易）
 */
export interface ProjectInfoSummary {
  id: string;
  name: string;
}

/**
 * 内訳書詳細情報
 *
 * Requirements: 4.1
 */
export interface ItemizedStatementDetail {
  /** 内訳書ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** プロジェクト情報 */
  project: ProjectInfoSummary;
  /** 内訳書名 */
  name: string;
  /** 集計元数量表ID */
  sourceQuantityTableId: string;
  /** 集計元数量表名（スナップショット） */
  sourceQuantityTableName: string;
  /** 項目数 */
  itemCount: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
  /** 内訳書項目一覧 */
  items: ItemizedStatementItemInfo[];
}

/**
 * プロジェクト別内訳書サマリー
 *
 * プロジェクト詳細画面の内訳書セクションで表示する
 * 直近の内訳書一覧と総数を含む。
 */
export interface ProjectItemizedStatementSummary {
  /** 内訳書の総数 */
  totalCount: number;
  /** 直近N件の内訳書 */
  latestStatements: ItemizedStatementInfo[];
}

/**
 * ページネーション情報
 */
export interface ItemizedStatementPaginationInfo {
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
 * ページネーション付き内訳書一覧レスポンス
 */
export interface PaginatedItemizedStatements {
  /** 内訳書一覧 */
  data: ItemizedStatementInfo[];
  /** ページネーション情報 */
  pagination: ItemizedStatementPaginationInfo;
}

/**
 * 内訳書フィルタ
 */
export interface ItemizedStatementFilter {
  /** 検索キーワード（名前の部分一致） */
  search?: string;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 内訳書作成入力
 *
 * Requirements: 1.3
 */
export interface CreateItemizedStatementInput {
  /** 内訳書名（1-200文字、必須） */
  name: string;
  /** 集計元数量表ID（UUID、必須） */
  quantityTableId: string;
}

// ============================================================================
// エラーレスポンス型定義
// ============================================================================

/**
 * 内訳書未発見エラーレスポンス
 */
export interface ItemizedStatementNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ITEMIZED_STATEMENT_NOT_FOUND';
  /** 内訳書ID（任意） */
  itemizedStatementId?: string;
}

/**
 * 内訳書競合エラーレスポンス（楽観的排他制御エラー）
 *
 * Requirements: 10.4
 */
export interface ItemizedStatementConflictErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ITEMIZED_STATEMENT_CONFLICT';
  /** 期待されていた更新日時（ISO8601形式、任意） */
  expectedUpdatedAt?: string;
  /** 実際の更新日時（ISO8601形式、任意） */
  actualUpdatedAt?: string;
}

/**
 * 内訳書名重複エラーレスポンス
 *
 * Requirements: 1.10
 */
export interface DuplicateItemizedStatementNameErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME';
  /** 重複した内訳書名 */
  name: string;
  /** プロジェクトID */
  projectId: string;
}

/**
 * 数量表項目空エラーレスポンス
 *
 * Requirements: 1.9
 */
export interface EmptyQuantityItemsErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（400） */
  status: 400;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'EMPTY_QUANTITY_ITEMS';
  /** 数量表ID */
  quantityTableId: string;
}

/**
 * 数量オーバーフローエラーレスポンス
 */
export interface QuantityOverflowErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（422） */
  status: 422;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'QUANTITY_OVERFLOW';
  /** 実際の値（任意） */
  actualValue?: number;
  /** 許容最小値（任意） */
  minAllowed?: number;
  /** 許容最大値（任意） */
  maxAllowed?: number;
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がItemizedStatementSortableFieldかどうかを判定するタイプガード
 */
export function isItemizedStatementSortableField(
  value: unknown
): value is ItemizedStatementSortableField {
  return (
    typeof value === 'string' &&
    (ITEMIZED_STATEMENT_SORTABLE_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * 値がItemizedStatementNotFoundErrorResponseかどうかを判定するタイプガード
 */
export function isItemizedStatementNotFoundErrorResponse(
  value: unknown
): value is ItemizedStatementNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ITEMIZED_STATEMENT_NOT_FOUND'
  );
}

/**
 * 値がItemizedStatementConflictErrorResponseかどうかを判定するタイプガード
 */
export function isItemizedStatementConflictErrorResponse(
  value: unknown
): value is ItemizedStatementConflictErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ITEMIZED_STATEMENT_CONFLICT'
  );
}

/**
 * 値がDuplicateItemizedStatementNameErrorResponseかどうかを判定するタイプガード
 */
export function isDuplicateItemizedStatementNameErrorResponse(
  value: unknown
): value is DuplicateItemizedStatementNameErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'DUPLICATE_ITEMIZED_STATEMENT_NAME' &&
    typeof obj.name === 'string' &&
    typeof obj.projectId === 'string'
  );
}

/**
 * 値がEmptyQuantityItemsErrorResponseかどうかを判定するタイプガード
 */
export function isEmptyQuantityItemsErrorResponse(
  value: unknown
): value is EmptyQuantityItemsErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 400 &&
    typeof obj.detail === 'string' &&
    obj.code === 'EMPTY_QUANTITY_ITEMS' &&
    typeof obj.quantityTableId === 'string'
  );
}

/**
 * 値がQuantityOverflowErrorResponseかどうかを判定するタイプガード
 */
export function isQuantityOverflowErrorResponse(
  value: unknown
): value is QuantityOverflowErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 422 &&
    typeof obj.detail === 'string' &&
    obj.code === 'QUANTITY_OVERFLOW'
  );
}
