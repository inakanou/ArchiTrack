/**
 * @fileoverview 見積書APIクライアント
 *
 * 見積書のCRUD操作、見積項目管理、計算・転記・出力機能のAPIクライアントを提供します。
 *
 * Task 11: フロントエンドページの実装（API Client）
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-3.1-3.5: 見積書新規作成と内訳書連携
 * - REQ-4.1-4.5: 受領見積書転記
 * - REQ-10.1-10.8: 見積書出力
 *
 * @module api/estimates
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 見積項目行タイプ
 */
export type EstimateItemLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 見積項目行情報
 */
export interface EstimateItemLine {
  id: string;
  estimateItemId: string;
  lineType: EstimateItemLineType;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId: string | null;
  sourceVendorName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 見積項目（階層構造）
 */
export interface EstimateItemHierarchy {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  lines: EstimateItemLine[];
  children: EstimateItemHierarchy[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 見積書基本情報
 */
export interface EstimateInfo {
  id: string;
  projectId: string;
  name: string;
  sourceItemizedStatementId: string | null;
  sourceItemizedStatementName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 見積書詳細（見積項目含む）
 */
export interface EstimateDetail extends EstimateInfo {
  items: EstimateItemHierarchy[];
  totalAmount: string | null;
}

/**
 * 見積書一覧レスポンス
 */
export interface EstimatesResponse {
  data: EstimateInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 見積書サマリー（プロジェクト詳細画面用）
 */
export interface EstimateSummary {
  totalCount: number;
  latestEstimates: EstimateInfo[];
}

/**
 * 見積書作成入力
 */
export interface CreateEstimateInput {
  name: string;
  sourceItemizedStatementId?: string;
}

/**
 * 見積書更新入力
 */
export interface UpdateEstimateInput {
  name: string;
}

/**
 * 受領見積書転記入力
 */
export interface TransferQuotationInput {
  receivedQuotationId: string;
  lineItemIds: string[];
  targetEstimateItemId?: string;
}

/**
 * 出力形式
 */
export type ExportFormat = 'pdf' | 'xlsx';

// ============================================================================
// 見積書CRUD API
// ============================================================================

/**
 * プロジェクトの見積書一覧を取得
 * Requirements: REQ-11.1
 *
 * @param projectId - プロジェクトID
 * @param options - ページネーションオプション
 * @returns 見積書一覧
 */
export async function getEstimates(
  projectId: string,
  options?: { page?: number; limit?: number; search?: string }
): Promise<EstimatesResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);

  const queryString = params.toString();
  const url = `/projects/${projectId}/estimates${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<EstimatesResponse>(url);
}

/**
 * プロジェクトの見積書サマリーを取得（プロジェクト詳細画面用）
 *
 * @param projectId - プロジェクトID
 * @param limit - 取得件数（デフォルト: 3）
 * @returns 見積書サマリー
 */
export async function getEstimatesSummary(
  projectId: string,
  limit: number = 3
): Promise<EstimateSummary> {
  return apiClient.get<EstimateSummary>(`/projects/${projectId}/estimates/latest?limit=${limit}`);
}

/**
 * 見積書詳細を取得
 * Requirements: REQ-11.2
 *
 * @param id - 見積書ID
 * @returns 見積書詳細
 */
export async function getEstimateDetail(id: string): Promise<EstimateDetail> {
  return apiClient.get<EstimateDetail>(`/estimates/${id}`);
}

/**
 * 見積書を作成
 * Requirements: REQ-3.1-3.5
 *
 * @param projectId - プロジェクトID
 * @param input - 見積書作成入力
 * @returns 作成された見積書
 */
export async function createEstimate(
  projectId: string,
  input: CreateEstimateInput
): Promise<EstimateInfo> {
  return apiClient.post<EstimateInfo>(`/projects/${projectId}/estimates`, input);
}

/**
 * 見積書を更新
 * Requirements: REQ-11.3
 *
 * @param id - 見積書ID
 * @param input - 見積書更新入力
 * @param updatedAt - 楽観的排他制御用更新日時
 * @returns 更新された見積書
 */
export async function updateEstimate(
  id: string,
  input: UpdateEstimateInput,
  updatedAt: string
): Promise<EstimateInfo> {
  return apiClient.put<EstimateInfo>(`/estimates/${id}`, { ...input, updatedAt });
}

/**
 * 見積書を削除
 * Requirements: REQ-11.4
 *
 * @param id - 見積書ID
 * @param updatedAt - 楽観的排他制御用更新日時
 */
export async function deleteEstimate(id: string, updatedAt: string): Promise<void> {
  await apiClient.delete(`/estimates/${id}?updatedAt=${encodeURIComponent(updatedAt)}`);
}

// ============================================================================
// 受領見積書転記API
// ============================================================================

/**
 * 受領見積書から見積書に転記
 * Requirements: REQ-4.1-4.5
 *
 * @param estimateId - 見積書ID
 * @param input - 転記入力
 * @returns 転記後の見積項目
 */
export async function transferFromQuotation(
  estimateId: string,
  input: TransferQuotationInput
): Promise<EstimateItemHierarchy[]> {
  return apiClient.post<EstimateItemHierarchy[]>(
    `/estimates/${estimateId}/transfer-quotation`,
    input
  );
}

// ============================================================================
// 見積書出力API
// ============================================================================

/**
 * 見積書を出力（PDF/Excel）
 * Requirements: REQ-10.1-10.8
 *
 * @param id - 見積書ID
 * @param format - 出力形式
 * @returns Blobデータ
 */
export async function exportEstimate(id: string, format: ExportFormat): Promise<Blob> {
  const response = await fetch(`/api/estimates/${id}/export?format=${format}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });

  if (!response.ok) {
    throw new Error('見積書の出力に失敗しました');
  }

  return response.blob();
}

/**
 * 見積書出力ファイルをダウンロード
 *
 * @param id - 見積書ID
 * @param format - 出力形式
 * @param filename - ファイル名
 */
export async function downloadEstimate(
  id: string,
  format: ExportFormat,
  filename: string
): Promise<void> {
  const blob = await exportEstimate(id, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
