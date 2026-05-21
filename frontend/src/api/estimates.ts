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
 * 見積項目種別
 *
 * - STANDARD: 通常の見積項目（見積・実行・業者の3行構成）
 * - DISCOUNT: 値引き行（見積金額行のみ・マイナス単価許容）
 *
 * Requirements (estimate-creation):
 * - REQ-41.2, REQ-41.3: 値引きプリセット行
 */
export type EstimateItemType = 'STANDARD' | 'DISCOUNT';

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
  /**
   * 見積項目種別（バックエンドが返却。既定は 'STANDARD'、未指定時も 'STANDARD' とみなす）
   *
   * Requirements (estimate-creation):
   * - REQ-41.2, REQ-41.3: 値引き行は 'DISCOUNT'
   */
  itemType?: EstimateItemType;
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
  /** 見積金額行の合計金額（一覧表示用、オプション） */
  totalAmount?: string | null;
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
  const url = `/api/projects/${projectId}/estimates${queryString ? `?${queryString}` : ''}`;

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
  return apiClient.get<EstimateSummary>(
    `/api/projects/${projectId}/estimates/latest?limit=${limit}`
  );
}

/**
 * 見積書詳細を取得
 * Requirements: REQ-11.2
 *
 * @param id - 見積書ID
 * @returns 見積書詳細
 */
export async function getEstimateDetail(id: string): Promise<EstimateDetail> {
  return apiClient.get<EstimateDetail>(`/api/estimates/${id}`);
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
  return apiClient.post<EstimateInfo>(`/api/projects/${projectId}/estimates`, input);
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
  return apiClient.put<EstimateInfo>(`/api/estimates/${id}`, { ...input, updatedAt });
}

/**
 * 見積書を削除
 * Requirements: REQ-11.4
 *
 * @param id - 見積書ID
 * @param updatedAt - 楽観的排他制御用更新日時
 */
export async function deleteEstimate(id: string, updatedAt: string): Promise<void> {
  await apiClient.delete(`/api/estimates/${id}?updatedAt=${encodeURIComponent(updatedAt)}`);
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
    `/api/estimates/${estimateId}/transfer-quotation`,
    input
  );
}

// ============================================================================
// 見積書出力API
// ============================================================================

/**
 * 見積書を出力（PDF/Excel）
 * Requirements: REQ-10.1-10.8, REQ-32.4
 *
 * Task 42.3: lineTypeパラメータをlineTypes（配列）に変更
 *
 * @param id - 見積書ID
 * @param format - 出力形式
 * @param lineTypes - 出力対象行タイプの配列（デフォルト: ['ESTIMATE']）
 * @returns Blobデータ
 */
export async function exportEstimate(
  id: string,
  format: ExportFormat,
  lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'> = ['ESTIMATE']
): Promise<Blob> {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const lineTypesParam = lineTypes.join(',');
  const response = await fetch(
    `${baseUrl}/api/estimates/${id}/export?format=${format}&lineTypes=${lineTypesParam}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('見積書の出力に失敗しました');
  }

  return response.blob();
}

// ============================================================================
// 見積項目 個別作成・削除 API (Task 40.1, REQ-34)
// ============================================================================

/**
 * 見積項目の行データ（作成時入力用）
 */
export interface CreateEstimateItemLineInput {
  lineType: EstimateItemLineType;
  name?: string | null;
  specification?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  remarks?: string | null;
}

/**
 * 見積項目を個別作成
 * Requirements: REQ-34.1, REQ-34.4
 *
 * @param estimateId - 見積書ID
 * @param input - 作成入力（parentId, displayOrder, lines）
 * @returns 作成された見積項目
 */
export async function createEstimateItem(
  estimateId: string,
  input: {
    parentId?: string | null;
    displayOrder?: number;
    lines: CreateEstimateItemLineInput[];
  }
): Promise<EstimateItemHierarchy> {
  return apiClient.post<EstimateItemHierarchy>(`/api/estimates/${estimateId}/items`, input);
}

/**
 * 見積項目を個別削除
 * Requirements: REQ-34.2, REQ-34.4
 *
 * バックエンドはreq.bodyからforceDeleteを読み取る
 *
 * @param estimateId - 見積書ID
 * @param itemId - 見積項目ID
 * @param forceDelete - 子項目も含めて強制削除するか
 */
export async function deleteEstimateItem(
  estimateId: string,
  itemId: string,
  forceDelete: boolean = true
): Promise<void> {
  await apiClient.delete(`/api/estimates/${estimateId}/items/${itemId}`, {
    body: { forceDelete },
  });
}

// ============================================================================
// 階層移動API (Task 27.2, REQ-24)
// ============================================================================

/**
 * 見積項目を階層移動
 * Requirements: REQ-24.1-24.5
 *
 * @param estimateId - 見積書ID
 * @param itemId - 移動する見積項目ID
 * @param newParentId - 新しい親項目ID（nullでルートレベルに移動）
 */
export async function moveEstimateItem(
  estimateId: string,
  itemId: string,
  newParentId: string | null
): Promise<void> {
  await apiClient.patch(`/api/estimates/${estimateId}/items/${itemId}/move`, {
    newParentId,
  });
}

/**
 * 見積項目の表示順序を変更
 *
 * Requirements (estimate-creation):
 * - REQ-12.2: 見積項目の表示順序を変更可能とする
 *
 * 兄弟グループ内で↑/↓ボタンによる並び替えを行う際に使用する。
 * 指定した項目のdisplayOrderを即時にDBへ反映する。
 *
 * @param estimateId - 見積書ID
 * @param itemOrders - 表示順序の配列（id と displayOrder のペア）
 */
export async function reorderEstimateItems(
  estimateId: string,
  itemOrders: Array<{ id: string; displayOrder: number }>
): Promise<void> {
  await apiClient.put(`/api/estimates/${estimateId}/items/reorder`, { itemOrders });
}

/**
 * 諸経費計算パラメータ
 */
export interface CalculateOverheadInput {
  costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
  /** 直接工事費（千円単位、文字列） */
  directCost: string;
  /** 工期（月、共通仮設費で使用） */
  constructionPeriod?: number;
  /** 純工事費（千円単位、現場管理費で使用） */
  pureConstructionCost?: string;
  /** 工事原価（千円単位、一般管理費で使用） */
  constructionCost?: string;
  /** 改修工事フラグ（true: 建築改修 / false: 建築新営） */
  isRenovation: boolean;
}

/**
 * 諸経費計算結果
 */
export interface CalculateOverheadResult {
  costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
  /** 算定率（%） */
  rate: string;
  /** 計算金額（千円単位） */
  amount: string;
  /** 計算式（トレーサビリティ用） */
  formula: string;
}

/**
 * 諸経費（共通仮設費・現場管理費・一般管理費）を自動計算
 *
 * Requirements (estimate-creation):
 * - REQ-7.3, REQ-8.3, REQ-9.3: 国土交通省の公共建築工事共通費積算基準に準じて単価を自動計算する
 *
 * @param estimateId - 見積書ID
 * @param input - 計算パラメータ
 * @returns 計算結果（率・金額・計算式）
 */
export async function calculateOverhead(
  estimateId: string,
  input: CalculateOverheadInput
): Promise<CalculateOverheadResult> {
  return apiClient.post<CalculateOverheadResult>(
    `/api/estimates/${estimateId}/calculate-overhead`,
    input
  );
}

/**
 * 諸経費行を見積項目として追加
 *
 * Requirements (estimate-creation):
 * - REQ-7.1, REQ-8.1, REQ-9.1: プリセット値を使用して諸経費行を追加する
 *
 * バックエンドがプリセット値（名称・規格・単位・数量）を設定し、unitPrice のみ受け取る。
 *
 * @param estimateId - 見積書ID
 * @param input - 諸経費種別と単価
 * @returns 追加された見積項目
 */
export async function addOverheadItem(
  estimateId: string,
  input: {
    costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
    unitPrice?: number;
  }
): Promise<EstimateItemHierarchy> {
  return apiClient.post<EstimateItemHierarchy>(
    `/api/estimates/${estimateId}/overhead-items`,
    input
  );
}

/**
 * 値引き行を見積項目として追加
 *
 * Requirements (estimate-creation):
 * - REQ-41.2: 名称：値引き、規格：空白、単位：式、数量：1をプリセット値とする値引き行をルートレベルに追加する
 * - REQ-41.5: 単価にマイナス値（負数）の入力を許容する
 *
 * バックエンドがプリセット値（名称・規格・単位・数量）を設定し、unitPrice のみ受け取る。
 * 作成される項目は itemType='DISCOUNT'・見積金額行（ESTIMATE）1行のみで構成される。
 * unitPrice 省略時は null を送信する（手入力前提）。
 *
 * エンドポイント: POST /api/estimates/:id/discount-items
 *
 * @param estimateId - 見積書ID
 * @param unitPrice - 単価（任意・負数許容・null許容）。省略時は null
 * @returns 追加された値引き項目（itemType='DISCOUNT'）
 */
export async function addDiscountItem(
  estimateId: string,
  unitPrice?: number | null
): Promise<EstimateItemHierarchy> {
  return apiClient.post<EstimateItemHierarchy>(`/api/estimates/${estimateId}/discount-items`, {
    unitPrice: unitPrice ?? null,
  });
}

/**
 * 見積項目を一括更新
 *
 * Requirements (estimate-creation):
 * - REQ-27.3: 保存ボタンでDB一括反映
 *
 * @param estimateId - 見積書ID
 * @param items - 更新対象の項目配列
 */
export async function batchUpdateEstimateItems(
  estimateId: string,
  items: Array<{
    id: string;
    lines: Array<{
      id: string;
      lineType: string;
      name?: string | null;
      specification?: string | null;
      unit?: string | null;
      quantity?: number | null;
      unitPrice?: number | null;
      remarks?: string | null;
    }>;
  }>,
  updatedAt: string
): Promise<void> {
  await apiClient.put(`/api/estimates/${estimateId}/items/batch`, { items, updatedAt });
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
