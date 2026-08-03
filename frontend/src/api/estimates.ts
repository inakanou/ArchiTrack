/**
 * @fileoverview 見積書APIクライアント
 *
 * 見積書のCRUD操作、見積項目の参照、書き込みを伴わない計算、出力機能の
 * APIクライアントを提供します。
 *
 * 明細の追加・削除・複写・一括更新・並び替え・階層移動を個別に書き込む関数
 * （`createEstimateItem` / `deleteEstimateItem` / `moveEstimateItem` /
 * `reorderEstimateItems` / `batchUpdateEstimateItems`）は
 * {@link saveEstimateDraft}（`PUT /api/estimates/:id/save`）へ統合したため撤去済み。
 * 画面の行操作はローカル状態に閉じ、保存操作1回でまとめて確定する（REQ-42.1、Task 53.12）。
 *
 * 転記・諸経費行追加・値引き行追加を書き込む関数
 * （`transferFromQuotation` / `addOverheadItem` / `addDiscountItem`）も
 * Task 55.7 で撤去済み。これらは `estimateEditReducer` の遷移として編集状態に反映され、
 * {@link saveEstimateDraft} で確定する（REQ-49.3, REQ-49.5）。
 * 書き込みを伴わない {@link calculateOverhead} は維持対象。
 *
 * Task 11: フロントエンドページの実装（API Client）
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-3.1-3.5: 見積書新規作成と内訳書連携
 * - REQ-10.1-10.8: 見積書出力
 * - REQ-49.3: 転記・案分・利益率・諸経費行追加・値引き行追加はデータベースへ書き込まない
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
 * 見積項目種別（サーバーが返却する永続化済みの値）
 *
 * - STANDARD: 通常の見積項目（見積・実行・業者の3行構成）
 * - DISCOUNT: 値引き行（見積金額行のみ・マイナス単価許容）
 * - NOTE: 注記行（名称のみ・金額集計の対象外）
 *
 * NOTE 行は一括保存（{@link saveEstimateDraft}）から生成されるため、
 * `GET /api/estimates/:id` / `GET /api/estimates/:id/items` の返却値にも現れる。
 *
 * Requirements (estimate-creation):
 * - REQ-41.2, REQ-41.3: 値引きプリセット行
 * - REQ-55.1, REQ-55.2: 注記行
 */
export type EstimateItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

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
  /**
   * 帳票用の追加入力項目（REQ-54.6）
   *
   * 画面はこの値を編集の起点にする。保存応答（{@link SaveEstimateDraftResponse}）と
   * 同じ形。読み取り経路が返さないと、保存済みの提出日・有効期限・別途工事が
   * 再読み込みで失われ、次の保存で空の値に上書きされる。
   */
  reportFields: SaveEstimateDraftReportFields;
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
 * 見積明細を階層構造で取得
 *
 * `GET /api/estimates/:id` が返す {@link EstimateDetail.items} は
 * バックエンド（`estimate.service.ts` の `toEstimateDetailInfo`）の実装上
 * **平坦な配列**であり、`parentId` は持つが `children` も `itemType` も持たない。
 * 明細の親子関係が必要な場合はこちらを使う。`GET /api/estimates/:id/items` は
 * `EstimateItemService.getHierarchy` によって親子関係を組んだツリーを返す。
 *
 * Requirements (estimate-creation):
 * - REQ-2.2: 親項目を持つ見積項目を親項目の子として階層表示する
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-34.5: 階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
 * - REQ-45.3: ツリー表示では全階層をインデント付きで一覧表示する
 *
 * @param id - 見積書ID
 * @returns 階層構造の見積明細（ルート項目の配列）
 */
export async function getEstimateItems(id: string): Promise<EstimateItemHierarchy[]> {
  return apiClient.get<EstimateItemHierarchy[]>(`/api/estimates/${id}/items`);
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

// ============================================================================
// 明細の一括保存API (Task 53.5, REQ-42)
// ============================================================================

/**
 * 一括保存で送出する見積項目の種別
 *
 * バックエンド `saveItemTypeSchema` と同一集合。返却側の {@link EstimateItemType} と
 * 同じ集合になるが、リクエストの契約は保存APIのスキーマに従うため別名で保持する。
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
