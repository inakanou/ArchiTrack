/**
 * @fileoverview 出来高APIクライアント
 *
 * Task 10.1: 出来高入力UI実装
 * Task 10.2: 出来高履歴管理UI実装
 * Task 10.3: 月別出来高集計UI実装
 *
 * Requirements:
 * - REQ-11.1-11.11: 出来高入力機能
 * - REQ-12.3-12.6: 出来高の履歴管理
 * - REQ-16.1-16.5: 月別出来高集計
 *
 * @module api/progress
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 出来高レコード項目
 */
export interface ProgressRecordItem {
  id: string;
  progressRecordId: string;
  executionBudgetItemId: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 出来高レコードサマリー（履歴一覧用）
 */
export interface ProgressRecordSummary {
  id: string;
  executionBudgetId: string;
  constructionDate: string;
  totalAmount: string;
  totalRate: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 出来高レコード（項目付き）
 */
export interface ProgressRecordWithItems {
  id: string;
  executionBudgetId: string;
  constructionDate: string;
  createdAt: string;
  updatedAt: string;
  items: ProgressRecordItem[];
  totalAmount: string;
  totalRate: string;
}

/**
 * 出来高保存入力（項目）
 */
export interface SaveProgressItemInput {
  itemId: string;
  amount: string;
}

/**
 * 出来高保存入力
 */
export interface SaveProgressInput {
  constructionDate: string;
  items: SaveProgressItemInput[];
}

/**
 * 月別出来高サマリー
 */
export interface MonthlyProgressSummary {
  yearMonth: string;
  monthlyAmount: string;
  cumulativeAmount: string;
  cumulativeRate: string;
}

/**
 * 月別出来高明細項目
 */
export interface MonthlyProgressDetailItem {
  executionBudgetItemId: string;
  itemName: string | null;
  executionAmount: string | null;
  progressAmount: string;
  progressRate: string;
}

/**
 * エクスポート形式
 */
export type ExportFormat = 'xlsx' | 'pdf';

// ============================================================================
// 出来高API
// ============================================================================

/**
 * 出来高を保存（新規作成または上書き更新）
 * REQ-11.1, 11.9, 12.1, 12.2
 */
export async function saveProgress(
  projectId: string,
  input: SaveProgressInput
): Promise<ProgressRecordWithItems> {
  return apiClient.post<ProgressRecordWithItems>(
    `/api/projects/${projectId}/execution-budget/progress`,
    input
  );
}

/**
 * 出来高履歴一覧を取得（施工日の降順）
 * REQ-12.3
 */
export async function getProgressHistory(projectId: string): Promise<ProgressRecordSummary[]> {
  return apiClient.get<ProgressRecordSummary[]>(
    `/api/projects/${projectId}/execution-budget/progress`
  );
}

/**
 * 施工日指定で出来高レコードを取得
 * REQ-12.4
 */
export async function getProgressByDate(
  projectId: string,
  date: string
): Promise<ProgressRecordWithItems> {
  return apiClient.get<ProgressRecordWithItems>(
    `/api/projects/${projectId}/execution-budget/progress/${date}`
  );
}

/**
 * 出来高レコードを削除
 * REQ-12.5, 12.6
 */
export async function deleteProgress(projectId: string, progressRecordId: string): Promise<void> {
  await apiClient.delete(
    `/api/projects/${projectId}/execution-budget/progress/${progressRecordId}`
  );
}

/**
 * 月別出来高集計を取得
 * REQ-16.1, 16.2
 */
export async function getMonthlyProgress(projectId: string): Promise<MonthlyProgressSummary[]> {
  return apiClient.get<MonthlyProgressSummary[]>(
    `/api/projects/${projectId}/execution-budget/progress/monthly`
  );
}

/**
 * 月別出来高明細を取得
 * REQ-16.3
 */
export async function getMonthlyProgressDetail(
  projectId: string,
  yearMonth: string
): Promise<MonthlyProgressDetailItem[]> {
  return apiClient.get<MonthlyProgressDetailItem[]>(
    `/api/projects/${projectId}/execution-budget/progress/monthly/${yearMonth}`
  );
}

/**
 * 月別出来高をエクスポート
 * REQ-16.4, 16.5
 */
export async function exportMonthlyProgress(
  projectId: string,
  format: ExportFormat
): Promise<Blob> {
  return apiClient.get<Blob>(
    `/api/projects/${projectId}/execution-budget/progress/monthly/export?format=${format}`
  );
}
