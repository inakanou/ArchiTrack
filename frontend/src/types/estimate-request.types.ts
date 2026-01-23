/**
 * @fileoverview 見積依頼機能 型定義ファイル
 *
 * フロントエンド用の見積依頼管理に関する型定義を提供します。
 *
 * Task 5: フロントエンドコンポーネント実装
 *
 * Requirements:
 * - 2.4: 一覧に見積依頼の名前、宛先（取引先名）、見積依頼方法（メール/FAX）、参照内訳書名、作成日時を表示
 * - 3.1-3.9: 見積依頼新規作成
 * - 4.1-4.13: 見積依頼詳細画面 - 項目選択
 * - 6.1-6.10: 見積依頼文表示
 * - 8.5: 楽観的排他制御
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 見積依頼方法
 */
export const ESTIMATE_REQUEST_METHODS = ['EMAIL', 'FAX'] as const;

/**
 * 見積依頼方法型
 */
export type EstimateRequestMethod = (typeof ESTIMATE_REQUEST_METHODS)[number];

// ============================================================================
// 基本型定義
// ============================================================================

/**
 * 見積依頼情報（一覧表示用）
 *
 * Requirements: 2.4
 */
export interface EstimateRequestInfo {
  /** 見積依頼ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 取引先ID */
  tradingPartnerId: string;
  /** 取引先名 */
  tradingPartnerName: string;
  /** 内訳書ID */
  itemizedStatementId: string;
  /** 内訳書名 */
  itemizedStatementName: string;
  /** 見積依頼名 */
  name: string;
  /** 見積依頼方法（メール/FAX） */
  method: EstimateRequestMethod;
  /** 内訳書を本文に含める */
  includeBreakdownInBody: boolean;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 他の見積依頼での選択状態情報
 *
 * Requirements: 4.10-4.12
 */
export interface OtherRequestInfo {
  /** 見積依頼ID */
  estimateRequestId: string;
  /** 見積依頼名 */
  estimateRequestName: string;
  /** 取引先名 */
  tradingPartnerName: string;
}

/**
 * 選択状態を含む内訳書項目情報
 *
 * Requirements: 4.2, 4.3, 4.10-4.12
 */
export interface ItemWithSelectionInfo {
  /** 内訳書項目ID */
  id: string;
  /** 見積依頼項目ID */
  estimateRequestItemId: string;
  /** カスタムカテゴリ */
  customCategory: string | null;
  /** 工種 */
  workType: string | null;
  /** 名称 */
  name: string | null;
  /** 規格 */
  specification: string | null;
  /** 単位 */
  unit: string | null;
  /** 数量 */
  quantity: number;
  /** 表示順序 */
  displayOrder: number;
  /** 選択状態 */
  selected: boolean;
  /** 他の見積依頼での選択状態 */
  otherRequests: OtherRequestInfo[];
}

/**
 * 見積依頼文
 *
 * Requirements: 6.1-6.10
 */
export interface EstimateRequestText {
  /** 宛先（メールアドレスまたはFAX番号） */
  recipient: string;
  /** 表題 */
  subject: string;
  /** 本文 */
  body: string;
  /** 宛先エラー（メールアドレス/FAX番号未登録時） */
  recipientError?: string;
}

/**
 * プロジェクト別見積依頼サマリー
 *
 * プロジェクト詳細画面の見積依頼セクションで表示する
 * 直近の見積依頼一覧と総数を含む。
 *
 * Requirements: 1.1-1.5
 */
export interface ProjectEstimateRequestSummary {
  /** 見積依頼の総数 */
  totalCount: number;
  /** 直近N件の見積依頼 */
  latestRequests: EstimateRequestInfo[];
}

// ============================================================================
// ページネーション型定義
// ============================================================================

/**
 * ページネーション情報
 */
export interface EstimateRequestPaginationInfo {
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
 * ページネーション付き見積依頼一覧レスポンス
 */
export interface PaginatedEstimateRequests {
  /** 見積依頼一覧 */
  data: EstimateRequestInfo[];
  /** ページネーション情報 */
  pagination: EstimateRequestPaginationInfo;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 見積依頼作成入力
 *
 * Requirements: 3.1-3.6
 */
export interface CreateEstimateRequestInput {
  /** 見積依頼名（1-200文字、必須） */
  name: string;
  /** 取引先ID（UUID、必須） */
  tradingPartnerId: string;
  /** 内訳書ID（UUID、必須） */
  itemizedStatementId: string;
  /** 見積依頼方法（デフォルト: EMAIL） */
  method?: EstimateRequestMethod;
  /** 内訳書を本文に含める（デフォルト: false） */
  includeBreakdownInBody?: boolean;
}

/**
 * 見積依頼更新入力
 *
 * Requirements: 9.3, 9.6
 */
export interface UpdateEstimateRequestInput {
  /** 見積依頼名（1-200文字） */
  name?: string;
  /** 見積依頼方法 */
  method?: EstimateRequestMethod;
  /** 内訳書を本文に含める */
  includeBreakdownInBody?: boolean;
}

/**
 * 項目選択更新入力
 *
 * Requirements: 4.4, 4.5
 */
export interface ItemSelectionInput {
  /** 見積依頼項目ID */
  itemId: string;
  /** 選択状態 */
  selected: boolean;
}

// ============================================================================
// エラーレスポンス型定義
// ============================================================================

/**
 * 見積依頼未発見エラーレスポンス
 */
export interface EstimateRequestNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ESTIMATE_REQUEST_NOT_FOUND';
  /** 見積依頼ID（任意） */
  estimateRequestId?: string;
}

/**
 * 見積依頼競合エラーレスポンス（楽観的排他制御エラー）
 *
 * Requirements: 8.5
 */
export interface EstimateRequestConflictErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ESTIMATE_REQUEST_CONFLICT';
  /** 期待されていた更新日時（ISO8601形式、任意） */
  expectedUpdatedAt?: string;
  /** 実際の更新日時（ISO8601形式、任意） */
  actualUpdatedAt?: string;
}

/**
 * 取引先が協力業者ではないエラーレスポンス
 *
 * Requirements: 3.4
 */
export interface TradingPartnerNotSubcontractorErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（400） */
  status: 400;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'TRADING_PARTNER_NOT_SUBCONTRACTOR';
  /** 取引先ID */
  tradingPartnerId: string;
}

/**
 * 内訳書項目空エラーレスポンス
 *
 * Requirements: 3.9
 */
export interface EmptyItemizedStatementItemsErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（400） */
  status: 400;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'EMPTY_ITEMIZED_STATEMENT_ITEMS';
  /** 内訳書ID */
  itemizedStatementId: string;
}

/**
 * 連絡先未登録エラーレスポンス
 *
 * Requirements: 6.4, 6.5
 */
export interface MissingContactInfoErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（422） */
  status: 422;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'MISSING_CONTACT_INFO';
  /** 見積依頼方法 */
  method: EstimateRequestMethod;
}

/**
 * 項目未選択エラーレスポンス
 *
 * Requirements: 5.3
 */
export interface NoItemsSelectedErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（400） */
  status: 400;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'NO_ITEMS_SELECTED';
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がEstimateRequestMethodかどうかを判定するタイプガード
 */
export function isEstimateRequestMethod(value: unknown): value is EstimateRequestMethod {
  return (
    typeof value === 'string' && (ESTIMATE_REQUEST_METHODS as readonly string[]).includes(value)
  );
}

/**
 * 値がEstimateRequestNotFoundErrorResponseかどうかを判定するタイプガード
 */
export function isEstimateRequestNotFoundErrorResponse(
  value: unknown
): value is EstimateRequestNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ESTIMATE_REQUEST_NOT_FOUND'
  );
}

/**
 * 値がEstimateRequestConflictErrorResponseかどうかを判定するタイプガード
 */
export function isEstimateRequestConflictErrorResponse(
  value: unknown
): value is EstimateRequestConflictErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ESTIMATE_REQUEST_CONFLICT'
  );
}
