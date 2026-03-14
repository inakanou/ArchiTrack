/**
 * @fileoverview 工程表APIクライアント
 *
 * Task 6.1: 工程表API関数を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-1.1: 工程表一覧表示
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存
 * - REQ-1.4: 工程表詳細表示
 * - REQ-1.5: 工程表削除
 * - REQ-7.1: Excelダウンロード
 * - REQ-8.1: PDFダウンロード
 *
 * @module api/schedules
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 工程表項目のソースタイプ
 */
export type ScheduleSourceType = 'QUANTITY_TABLE' | 'MANUAL';

/**
 * 工程表一覧アイテム
 */
export interface ScheduleListItem {
  id: string;
  name: string;
  quantityTableName: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工程表一覧レスポンス
 */
export interface ScheduleListResponse {
  schedules: ScheduleListItem[];
  total: number;
}

/**
 * 工程表一覧クエリオプション
 */
export interface ScheduleListQuery {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 工程表項目詳細
 */
export interface ScheduleItemDetail {
  id: string;
  sourceType: ScheduleSourceType;
  sourceQuantityItemId: string | null;
  itemName: string;
  labelText: string;
  detailText: string;
  startDate: string | null;
  duration: number | null;
  displayOrder: number;
  isExportTarget: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工程表詳細
 */
export interface ScheduleDetail {
  id: string;
  projectId: string;
  name: string;
  quantityTableId: string | null;
  quantityTableName: string | null;
  items: ScheduleItemDetail[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工程表作成入力
 * Requirements: REQ-1.3, REQ-2.1
 */
export interface CreateScheduleInput {
  name: string;
  quantityTableId?: string | null;
}

/**
 * 工程表更新入力
 * Requirements: REQ-1.3
 */
export interface UpdateScheduleInput {
  name: string;
  version: number;
}

/**
 * バルク保存項目
 */
export interface BulkSaveScheduleItem {
  id: string | null;
  itemName: string;
  labelText: string;
  detailText: string;
  startDate: string | null;
  duration: number | null;
  displayOrder: number;
  isExportTarget: boolean;
}

/**
 * バルク保存入力
 * Requirements: REQ-3.1, REQ-4.1
 */
export interface BulkSaveScheduleItemsInput {
  version: number;
  items: BulkSaveScheduleItem[];
}

/**
 * バルク保存レスポンス
 */
export interface BulkSaveResult {
  updatedItemCount: number;
  updatedAt: string;
}

/**
 * エクスポート形式
 */
export type ExportFormat = 'xlsx' | 'pdf';

// ============================================================================
// 工程表API
// ============================================================================

/**
 * プロジェクトの工程表一覧を取得
 * Requirements: REQ-1.1
 *
 * @param projectId - プロジェクトID
 * @param options - クエリオプション
 * @returns 工程表一覧
 */
export async function getSchedules(
  projectId: string,
  options?: ScheduleListQuery
): Promise<ScheduleListResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);

  const queryString = params.toString();
  const url = `/api/projects/${projectId}/schedules${queryString ? `?${queryString}` : ''}`;
  return apiClient.get<ScheduleListResponse>(url);
}

/**
 * 工程表詳細を取得
 * Requirements: REQ-1.4
 *
 * @param id - 工程表ID
 * @returns 工程表詳細
 */
export async function getScheduleDetail(id: string): Promise<ScheduleDetail> {
  return apiClient.get<ScheduleDetail>(`/api/schedules/${id}`);
}

/**
 * 工程表を作成
 * Requirements: REQ-1.2, REQ-1.3, REQ-2.1
 *
 * @param projectId - プロジェクトID
 * @param input - 工程表作成入力
 * @returns 作成された工程表詳細
 */
export async function createSchedule(
  projectId: string,
  input: CreateScheduleInput
): Promise<ScheduleDetail> {
  return apiClient.post<ScheduleDetail>(`/api/projects/${projectId}/schedules`, input);
}

/**
 * 工程表を更新
 * Requirements: REQ-1.3
 *
 * @param id - 工程表ID
 * @param input - 工程表更新入力
 * @returns 更新された工程表詳細
 */
export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<ScheduleDetail> {
  return apiClient.put<ScheduleDetail>(`/api/schedules/${id}`, input);
}

/**
 * 工程表を削除
 * Requirements: REQ-1.5
 *
 * @param id - 工程表ID
 */
export async function deleteSchedule(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/schedules/${id}`);
}

/**
 * 工程表項目のバルク保存
 * Requirements: REQ-3.1, REQ-4.1
 *
 * @param id - 工程表ID
 * @param input - バルク保存入力
 * @returns バルク保存結果
 */
export async function bulkSaveScheduleItems(
  id: string,
  input: BulkSaveScheduleItemsInput
): Promise<BulkSaveResult> {
  return apiClient.put<BulkSaveResult>(`/api/schedules/${id}/bulk-save`, input);
}

/**
 * 工程表をエクスポート
 * Requirements: REQ-7.1, REQ-8.1
 *
 * @param id - 工程表ID
 * @param format - エクスポート形式（xlsx | pdf）
 * @returns ファイルデータ
 */
export async function exportSchedule(id: string, format: ExportFormat): Promise<Blob> {
  return apiClient.get<Blob>(`/api/schedules/${id}/export?format=${format}`);
}
