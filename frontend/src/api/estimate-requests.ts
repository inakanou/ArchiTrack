/**
 * @fileoverview 見積依頼用APIクライアント
 *
 * Task 5: フロントエンドコンポーネント実装
 *
 * Requirements:
 * - 2.1: 見積依頼一覧取得（GET /api/projects/:projectId/estimate-requests）
 * - 3.6: 見積依頼作成（POST /api/projects/:projectId/estimate-requests）
 * - 4.1-4.5: 見積依頼詳細取得、項目選択更新
 * - 6.1: 見積依頼文取得
 * - 8.4: 見積依頼削除（DELETE /api/estimate-requests/:id）
 * - 8.5: 楽観的排他制御エラー（409 Conflict）
 */

import { apiClient } from './client';
import type {
  ProjectEstimateRequestSummary,
  PaginatedEstimateRequests,
  EstimateRequestInfo,
  CreateEstimateRequestInput,
  UpdateEstimateRequestInput,
  ItemSelectionInput,
  ItemWithSelectionInfo,
  EstimateRequestText,
} from '../types/estimate-request.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * 見積依頼一覧取得のオプション
 */
export interface GetEstimateRequestsOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20、最大: 100） */
  limit?: number;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 直近N件の見積依頼と総数を取得する
 *
 * プロジェクト詳細画面の見積依頼セクションで使用します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param limit - 取得件数（デフォルト: 2、最大: 10）
 * @returns プロジェクト別見積依頼サマリー（直近N件と総数）
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * @example
 * // デフォルト（直近2件）を取得
 * const summary = await getLatestEstimateRequests('project-id');
 *
 * @example
 * // 直近5件を取得
 * const summary = await getLatestEstimateRequests('project-id', 5);
 */
export async function getLatestEstimateRequests(
  projectId: string,
  limit: number = 2
): Promise<ProjectEstimateRequestSummary> {
  const params = new URLSearchParams();
  if (limit !== 2) {
    params.append('limit', String(limit));
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/estimate-requests/latest?${queryString}`
    : `/api/projects/${projectId}/estimate-requests/latest`;

  return apiClient.get<ProjectEstimateRequestSummary>(path);
}

/**
 * 見積依頼一覧を取得する
 *
 * 指定されたプロジェクトに紐付く見積依頼の一覧を取得します。
 * ページネーションに対応しています。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param options - 取得オプション（ページネーション）
 * @returns ページネーション付き見積依頼一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * Requirements: 2.1
 *
 * @example
 * // 基本的な取得
 * const result = await getEstimateRequests('project-id');
 *
 * @example
 * // ページネーション付き取得
 * const result = await getEstimateRequests('project-id', { page: 2, limit: 10 });
 */
export async function getEstimateRequests(
  projectId: string,
  options: GetEstimateRequestsOptions = {}
): Promise<PaginatedEstimateRequests> {
  const { page, limit } = options;

  // クエリパラメータを構築
  const params = new URLSearchParams();

  if (page !== undefined) {
    params.append('page', String(page));
  }
  if (limit !== undefined) {
    params.append('limit', String(limit));
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/estimate-requests?${queryString}`
    : `/api/projects/${projectId}/estimate-requests`;

  return apiClient.get<PaginatedEstimateRequests>(path);
}

/**
 * 見積依頼詳細を取得する
 *
 * 見積依頼の詳細情報を取得します。
 *
 * @param id - 見積依頼ID（UUID）
 * @returns 見積依頼詳細情報
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const detail = await getEstimateRequestDetail('er-123');
 */
export async function getEstimateRequestDetail(id: string): Promise<EstimateRequestInfo> {
  return apiClient.get<EstimateRequestInfo>(`/api/estimate-requests/${id}`);
}

/**
 * 見積依頼の項目一覧（選択状態含む）を取得する
 *
 * 他の見積依頼での選択状態も含めて取得します。
 *
 * @param id - 見積依頼ID（UUID）
 * @returns 選択状態を含む項目一覧
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * Requirements: 4.2, 4.10-4.12
 *
 * @example
 * const items = await getEstimateRequestItems('er-123');
 */
export async function getEstimateRequestItems(id: string): Promise<ItemWithSelectionInfo[]> {
  return apiClient.get<ItemWithSelectionInfo[]>(`/api/estimate-requests/${id}/items`);
}

/**
 * 見積依頼を作成する
 *
 * 指定されたプロジェクトに紐付く新しい見積依頼を作成します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - 見積依頼作成データ
 * @returns 作成された見積依頼情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *                  取引先・内訳書が見つからない（404）、取引先が協力業者でない（400）
 *
 * Requirements: 3.6
 *
 * @example
 * const request = await createEstimateRequest('project-id', {
 *   name: '見積依頼#1',
 *   tradingPartnerId: 'tp-123',
 *   itemizedStatementId: 'is-123',
 *   method: 'EMAIL',
 * });
 */
export async function createEstimateRequest(
  projectId: string,
  input: CreateEstimateRequestInput
): Promise<EstimateRequestInfo> {
  return apiClient.post<EstimateRequestInfo>(`/api/projects/${projectId}/estimate-requests`, input);
}

/**
 * 見積依頼を更新する（楽観的排他制御付き）
 *
 * @param id - 見積依頼ID（UUID）
 * @param input - 見積依頼更新データ
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 * @returns 更新された見積依頼情報
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、
 *                  権限不足（403）、競合（409）
 *
 * Requirements: 8.5, 9.6
 *
 * @example
 * const updated = await updateEstimateRequest('er-123', {
 *   name: '更新した見積依頼名',
 * }, '2025-01-02T00:00:00.000Z');
 */
export async function updateEstimateRequest(
  id: string,
  input: UpdateEstimateRequestInput,
  updatedAt: string
): Promise<EstimateRequestInfo> {
  return apiClient.patch<EstimateRequestInfo>(`/api/estimate-requests/${id}`, {
    ...input,
    expectedUpdatedAt: updatedAt,
  });
}

/**
 * 項目の選択状態を更新する
 *
 * @param estimateRequestId - 見積依頼ID（UUID）
 * @param items - 項目選択情報の配列
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * Requirements: 4.4, 4.5
 *
 * @example
 * await updateItemSelection('er-123', [
 *   { itemId: 'item-1', selected: true },
 *   { itemId: 'item-2', selected: false },
 * ]);
 */
export async function updateItemSelection(
  estimateRequestId: string,
  items: ItemSelectionInput[]
): Promise<void> {
  return apiClient.patch<void>(`/api/estimate-requests/${estimateRequestId}/items`, { items });
}

/**
 * 見積依頼文を取得する
 *
 * @param id - 見積依頼ID（UUID）
 * @returns 見積依頼文（宛先、表題、本文）
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、
 *                  権限不足（403）、連絡先未登録（422）
 *
 * Requirements: 6.1-6.10
 *
 * @example
 * const text = await getEstimateRequestText('er-123');
 * console.log(text.body); // 本文
 */
export async function getEstimateRequestText(id: string): Promise<EstimateRequestText> {
  return apiClient.get<EstimateRequestText>(`/api/estimate-requests/${id}/text`);
}

/**
 * 見積依頼を削除する（論理削除）
 *
 * 楽観的排他制御を使用して見積依頼を論理削除します。
 *
 * @param id - 見積依頼ID（UUID）
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 * @throws ApiError 見積依頼が見つからない（404）、認証エラー（401）、
 *                  権限不足（403）、競合（409）
 *
 * Requirements: 8.4, 8.5
 *
 * @example
 * await deleteEstimateRequest('er-123', '2025-01-02T00:00:00.000Z');
 */
export async function deleteEstimateRequest(id: string, updatedAt: string): Promise<void> {
  return apiClient.delete<void>(`/api/estimate-requests/${id}`, {
    body: { updatedAt },
  });
}
