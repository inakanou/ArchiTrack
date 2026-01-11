/**
 * @fileoverview 数量表用APIクライアント
 *
 * Task 4.1: 数量表APIクライアントの実装
 *
 * Requirements:
 * - 1.2: GET /api/projects/:projectId/quantity-tables/summary 直近N件と総数取得
 * - 2.3: GET /api/projects/:projectId/quantity-tables 数量表一覧取得
 */

import { apiClient } from './client';
import type {
  PaginatedQuantityTables,
  ProjectQuantityTableSummary,
  QuantityTableInfo,
  QuantityTableDetail,
  QuantityGroupDetail,
  QuantityItemDetail,
  CreateQuantityTableInput,
  UpdateQuantityTableInput,
  QuantityTableFilter,
  QuantityTableSortableField,
  QuantityTableSortOrder,
  CalculationParams,
  CalculationMethod,
} from '../types/quantity-table.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * 数量表一覧取得のオプション
 */
export interface GetQuantityTablesOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20、最大: 100） */
  limit?: number;
  /** フィルタ条件 */
  filter?: QuantityTableFilter;
  /** ソートフィールド（createdAt, updatedAt, name） */
  sort?: QuantityTableSortableField;
  /** ソート順序 */
  order?: QuantityTableSortOrder;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 直近N件の数量表と総数を取得する
 *
 * プロジェクト詳細画面の数量表セクションで使用します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param limit - 取得件数（デフォルト: 2、最大: 10）
 * @returns プロジェクト別数量表サマリー（直近N件と総数）
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * Requirements: 1.2
 *
 * @example
 * // デフォルト（直近2件）を取得
 * const summary = await getLatestQuantityTables('project-id');
 *
 * @example
 * // 直近5件を取得
 * const summary = await getLatestQuantityTables('project-id', 5);
 */
export async function getLatestQuantityTables(
  projectId: string,
  limit: number = 2
): Promise<ProjectQuantityTableSummary> {
  const params = new URLSearchParams();
  if (limit !== 2) {
    params.append('limit', String(limit));
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/quantity-tables/summary?${queryString}`
    : `/api/projects/${projectId}/quantity-tables/summary`;

  return apiClient.get<ProjectQuantityTableSummary>(path);
}

/**
 * 数量表一覧を取得する
 *
 * 指定されたプロジェクトに紐付く数量表の一覧を取得します。
 * ページネーション、検索、ソートに対応しています。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param options - 取得オプション（ページネーション、フィルタ、ソート）
 * @returns ページネーション付き数量表一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * Requirements: 2.3
 *
 * @example
 * // 基本的な取得
 * const result = await getQuantityTables('project-id');
 *
 * @example
 * // フィルタ付き取得
 * const result = await getQuantityTables('project-id', {
 *   page: 1,
 *   limit: 20,
 *   filter: { search: '見積' },
 *   sort: 'createdAt',
 *   order: 'desc',
 * });
 */
export async function getQuantityTables(
  projectId: string,
  options: GetQuantityTablesOptions = {}
): Promise<PaginatedQuantityTables> {
  const { page, limit, filter, sort, order } = options;

  // クエリパラメータを構築
  const params = new URLSearchParams();

  if (page !== undefined) {
    params.append('page', String(page));
  }
  if (limit !== undefined) {
    params.append('limit', String(limit));
  }
  if (filter?.search) {
    params.append('search', filter.search);
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (order) {
    params.append('order', order);
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/quantity-tables?${queryString}`
    : `/api/projects/${projectId}/quantity-tables`;

  return apiClient.get<PaginatedQuantityTables>(path);
}

/**
 * 数量表詳細を取得する（簡易版）
 *
 * 数量表の基本情報を取得します。
 *
 * @param id - 数量表ID（UUID）
 * @returns 数量表情報
 * @throws ApiError 数量表が見つからない（404）、認証エラー（401）、権限不足（403）
 */
export async function getQuantityTable(id: string): Promise<QuantityTableInfo> {
  return apiClient.get<QuantityTableInfo>(`/api/quantity-tables/${id}`);
}

/**
 * 数量表詳細を取得する（グループ・項目を含む）
 *
 * 数量表の詳細情報（グループ一覧と各グループ内の項目を含む）を取得します。
 * 編集画面で使用します。
 *
 * Task 5.1: 数量表編集画面用
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 *
 * @param id - 数量表ID（UUID）
 * @returns 数量表詳細（グループ・項目を含む）
 * @throws ApiError 数量表が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const detail = await getQuantityTableDetail('qt-123');
 * console.log(detail.groups); // グループ一覧
 * console.log(detail.groups[0].items); // 項目一覧
 */
export async function getQuantityTableDetail(id: string): Promise<QuantityTableDetail> {
  return apiClient.get<QuantityTableDetail>(`/api/quantity-tables/${id}`);
}

/**
 * 数量表を作成する
 *
 * 指定されたプロジェクトに紐付く新しい数量表を作成します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - 数量表作成データ
 * @returns 作成された数量表情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、プロジェクトが見つからない（404）
 *
 * @example
 * const table = await createQuantityTable('project-id', {
 *   name: '第1回見積数量表',
 * });
 */
export async function createQuantityTable(
  projectId: string,
  input: CreateQuantityTableInput
): Promise<QuantityTableInfo> {
  return apiClient.post<QuantityTableInfo>(`/api/projects/${projectId}/quantity-tables`, input);
}

/**
 * 数量表を更新する
 *
 * 楽観的排他制御を使用して数量表を更新します。
 *
 * @param id - 数量表ID（UUID）
 * @param input - 数量表更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新された数量表情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、数量表が見つからない（404）、競合（409）
 *
 * @example
 * const table = await updateQuantityTable(
 *   'table-id',
 *   { name: '更新された数量表名' },
 *   '2025-01-02T00:00:00.000Z'
 * );
 */
export async function updateQuantityTable(
  id: string,
  input: UpdateQuantityTableInput,
  expectedUpdatedAt: string
): Promise<QuantityTableInfo> {
  return apiClient.put<QuantityTableInfo>(`/api/quantity-tables/${id}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * 数量表を削除する（論理削除）
 *
 * 数量表と関連するグループ・項目を論理削除します。
 *
 * @param id - 数量表ID（UUID）
 * @throws ApiError 数量表が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * await deleteQuantityTable('table-id');
 */
export async function deleteQuantityTable(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/quantity-tables/${id}`);
}

// ============================================================================
// 数量グループAPI
// ============================================================================

/**
 * 数量グループ作成入力
 */
export interface CreateQuantityGroupInput {
  /** グループ名（任意、最大200文字） */
  name?: string | null;
  /** 現場調査画像ID（任意） */
  surveyImageId?: string | null;
  /** 表示順序 */
  displayOrder: number;
}

/**
 * 数量グループを作成する
 *
 * 指定された数量表に新しいグループを追加します。
 *
 * Requirements: 4.1
 *
 * @param quantityTableId - 数量表ID（UUID）
 * @param input - グループ作成データ
 * @returns 作成されたグループ情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、数量表が見つからない（404）
 *
 * @example
 * const group = await createQuantityGroup('table-id', {
 *   name: '新規グループ',
 *   displayOrder: 0,
 * });
 */
export async function createQuantityGroup(
  quantityTableId: string,
  input: CreateQuantityGroupInput
): Promise<QuantityGroupDetail> {
  return apiClient.post<QuantityGroupDetail>(
    `/api/quantity-tables/${quantityTableId}/groups`,
    input
  );
}

/**
 * 数量グループ更新入力
 */
export interface UpdateQuantityGroupInput {
  /** グループ名（任意、最大200文字） */
  name?: string | null;
  /** 現場調査画像ID（任意） */
  surveyImageId?: string | null;
  /** 表示順序 */
  displayOrder?: number;
}

/**
 * 数量グループ更新レスポンス（簡易）
 */
export interface UpdateQuantityGroupResponse {
  id: string;
  quantityTableId: string;
  name: string | null;
  surveyImageId: string | null;
  displayOrder: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 数量グループを更新する
 *
 * グループの名前や紐付け画像を更新します。
 *
 * Requirements: 4.3
 *
 * @param id - グループID（UUID）
 * @param input - グループ更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新されたグループ情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、グループが見つからない（404）、競合（409）
 *
 * @example
 * const group = await updateQuantityGroup(
 *   'group-id',
 *   { surveyImageId: 'image-id' },
 *   '2025-01-02T00:00:00.000Z'
 * );
 */
export async function updateQuantityGroup(
  id: string,
  input: UpdateQuantityGroupInput,
  expectedUpdatedAt: string
): Promise<UpdateQuantityGroupResponse> {
  return apiClient.put<UpdateQuantityGroupResponse>(`/api/quantity-groups/${id}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * 数量グループを削除する
 *
 * グループと配下の項目を削除します。
 *
 * Requirements: 4.5
 *
 * @param id - グループID（UUID）
 * @throws ApiError グループが見つからない（404）、認証エラー（401）、権限不足（403）
 */
export async function deleteQuantityGroup(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/quantity-groups/${id}`);
}

// ============================================================================
// 数量項目API
// ============================================================================

/**
 * 数量項目作成用入力型
 */
export interface CreateQuantityItemInput {
  majorCategory: string;
  middleCategory?: string | null;
  minorCategory?: string | null;
  customCategory?: string | null;
  workType: string;
  name: string;
  specification?: string | null;
  unit: string;
  calculationMethod?: 'STANDARD' | 'AREA_VOLUME' | 'PITCH';
  calculationParams?: Record<string, number> | null;
  adjustmentFactor?: number;
  roundingUnit?: number;
  quantity: number;
  remarks?: string | null;
  displayOrder?: number;
}

/**
 * 数量項目を作成する
 *
 * Requirements: 5.1
 *
 * @param groupId - グループID（UUID）
 * @param input - 項目データ
 * @returns 作成された項目
 */
export async function createQuantityItem(
  groupId: string,
  input: CreateQuantityItemInput
): Promise<QuantityItemDetail> {
  return apiClient.post<QuantityItemDetail>(`/api/quantity-groups/${groupId}/items`, input);
}

/**
 * 数量項目更新用入力型
 */
export interface UpdateQuantityItemInput {
  majorCategory?: string;
  middleCategory?: string | null;
  minorCategory?: string | null;
  customCategory?: string | null;
  workType?: string;
  name?: string;
  specification?: string | null;
  unit?: string;
  calculationMethod?: CalculationMethod;
  calculationParams?: CalculationParams | null;
  adjustmentFactor?: number;
  roundingUnit?: number;
  quantity?: number;
  remarks?: string | null;
  displayOrder?: number;
}

/**
 * 数量項目を更新する
 *
 * Requirements: 5.2
 *
 * @param itemId - 項目ID（UUID）
 * @param input - 更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新された項目
 */
export async function updateQuantityItem(
  itemId: string,
  input: UpdateQuantityItemInput,
  expectedUpdatedAt: string
): Promise<QuantityItemDetail> {
  return apiClient.put<QuantityItemDetail>(`/api/quantity-items/${itemId}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * 数量項目を削除する
 *
 * Requirements: 5.3
 *
 * @param itemId - 項目ID（UUID）
 */
export async function deleteQuantityItem(itemId: string): Promise<void> {
  return apiClient.delete<void>(`/api/quantity-items/${itemId}`);
}

/**
 * 数量項目をコピーする
 *
 * Requirements: 5.4
 *
 * @param itemId - コピー元項目ID（UUID）
 * @returns コピーされた項目
 */
export async function copyQuantityItem(itemId: string): Promise<QuantityItemDetail> {
  return apiClient.post<QuantityItemDetail>(`/api/quantity-items/${itemId}/copy`, {});
}
