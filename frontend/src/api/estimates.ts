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

// ============================================================================
// 明細の一括保存API (Task 53.5, REQ-42)
// ============================================================================

/**
 * 一括保存で送出する見積項目の種別
 *
 * 既存の {@link EstimateItemType} は旧APIの返却値に合わせて `NOTE` を持たないため、
 * 保存API専用に定義する（バックエンド `saveItemTypeSchema` と同一集合）。
 *
 * Requirements (estimate-creation):
 * - 41.2, 41.3: 値引き行は 'DISCOUNT'
 * - 55.1: 注記行は 'NOTE'
 */
export type SaveEstimateDraftItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/**
 * 一括保存リクエストの明細行
 *
 * design.md `##### estimate-draft.service` の `SaveEstimateLine`（4313-4323）と同一。
 * 9フィールドはすべて **null 許容だが省略不可** で、空欄も `null` を明示送信する。
 * キーを落としたペイロードはバックエンドで 400 になる。
 */
export interface SaveEstimateDraftLine {
  readonly lineType: EstimateItemLineType;
  readonly name: string | null;
  readonly specification: string | null;
  readonly unit: string | null;
  /** 数量（10進数文字列。数値では送出できない） */
  readonly quantity: string | null;
  /** 単価（10進数文字列） */
  readonly unitPrice: string | null;
  /** 金額（10進数文字列） */
  readonly amount: string | null;
  readonly remarks: string | null;
  readonly sourceVendorName: string | null;
}

/**
 * 一括保存リクエストの見積項目（再帰）
 *
 * design.md `SaveEstimateItemNode`（4305-4311）と同一。
 * 既存項目は `id` ＋ `tempId: null`、新規項目は `id: null` ＋ `tempId` を送る。
 * `children` は省略不可で、子を持たない項目も空配列を明示送信する。
 */
export interface SaveEstimateDraftItemNode {
  readonly id: string | null;
  readonly tempId: string | null;
  readonly itemType: SaveEstimateDraftItemType;
  readonly lines: readonly SaveEstimateDraftLine[];
  readonly children: readonly SaveEstimateDraftItemNode[];
}

/**
 * 帳票用の追加入力項目（REQ-54.1〜54.3）
 *
 * 3フィールドとも省略不可。省略すると保存済みの値を空で上書きすることになる。
 */
export interface SaveEstimateDraftReportFields {
  /** 提出日（`YYYY-MM-DD`） */
  readonly submissionDate: string | null;
  /** 有効期限（最大100文字） */
  readonly validityPeriod: string | null;
  /** 別途工事（最大5件・各最大200文字） */
  readonly separateWorks: readonly string[];
}

/**
 * 明細の一括保存リクエスト
 *
 * design.md `SaveEstimateDraftRequest`（4297-4303）と同一。
 */
export interface SaveEstimateDraftRequest {
  /** 楽観ロックの基準時刻（ISO8601）。直前に取得した見積書の `updatedAt` */
  readonly expectedUpdatedAt: string;
  readonly reportFields: SaveEstimateDraftReportFields;
  readonly items: readonly SaveEstimateDraftItemNode[];
}

/**
 * 保存応答の明細行
 *
 * `GET /api/estimates/:id` の明細行と同形（行単位の `createdAt` / `updatedAt` は持たない）。
 * 数量・単価・金額は他の見積書APIと同じく数値で返るが、本ファイルの既存型
 * （{@link EstimateItemLine}）に合わせて文字列として宣言している。
 * 保存ペイロードを組み立てる側は 10進数文字列へ正規化してから送出すること。
 */
export interface SavedEstimateItemLine {
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
  /** 転記元の受領見積書明細行（保存ペイロードには含まれず、サーバーが既存値を維持する） */
  sourceReceivedQuotationLineItemId: string | null;
  sourceVendorName: string | null;
}

/**
 * 保存応答の見積項目（階層構造）
 *
 * 保存後の最新ツリーであり、クライアントはこれを反映するだけでよい（REQ-42.2）。
 */
export interface SavedEstimateItemHierarchy {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  itemType: SaveEstimateDraftItemType;
  lines: SavedEstimateItemLine[];
  children: SavedEstimateItemHierarchy[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 明細の一括保存レスポンス
 *
 * `GET /api/estimates/:id` の詳細レスポンスの上位集合に `reportFields` を加えた形で、
 * `items` は保存後の最新ツリー。`updatedAt` は次回保存の
 * `expectedUpdatedAt` としてそのまま用いる（REQ-42.5）。
 */
export interface SaveEstimateDraftResponse {
  id: string;
  projectId: string;
  project?: { id: string; name: string };
  name: string;
  sourceItemizedStatementId: string | null;
  sourceItemizedStatementName: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  reportFields: SaveEstimateDraftReportFields;
  items: SavedEstimateItemHierarchy[];
}

/**
 * 編集中の明細ツリーを1回のリクエストでまとめて保存する
 *
 * Requirements (estimate-creation):
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.2: 保存後の最新の明細内容を応答で受け取る（保存後の追加取得を不要にする）
 * - 42.5: `expectedUpdatedAt` により競合を検出する（不一致は 409）
 * - 42.6: 明細の並び順は受領配列の順序で確定する
 * - 54.8: 帳票用入力項目の変更を同じ保存操作で確定する
 *
 * エラー: 400（形式不正）/ 403（権限）/ 404（見積書なし）/ 409（競合）/
 * 422（検証NG）/ 500。いずれも `ApiError` として送出される。
 *
 * @param estimateId - 見積書ID
 * @param input - 明細ツリー・基準時刻・帳票用入力項目
 * @returns 保存後の最新状態（明細ツリーを含む）
 */
export async function saveEstimateDraft(
  estimateId: string,
  input: SaveEstimateDraftRequest
): Promise<SaveEstimateDraftResponse> {
  return apiClient.put<SaveEstimateDraftResponse>(`/api/estimates/${estimateId}/save`, input);
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
