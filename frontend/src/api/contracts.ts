/**
 * @fileoverview 契約書APIクライアント
 *
 * Task 4.1: 契約書一覧ページコンポーネントを作成する
 *
 * Requirements (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類、契約日、ステータスを一覧に表示する
 *
 * @module api/contracts
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 契約種類
 */
export type ContractType = 'NEW' | 'AMENDMENT';

/**
 * 契約ステータス
 */
export type ContractStatus = 'BEFORE_CONTRACT' | 'CONTRACTED';

/**
 * 契約書一覧アイテム
 */
export interface ContractListItem {
  id: string;
  contractType: ContractType;
  contractDate: string;
  status: ContractStatus;
  contractAmount: number;
  estimateName: string | null;
  parentContractId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 契約書一覧レスポンス
 */
export interface ContractsResponse {
  contracts: ContractListItem[];
  total: number;
}

/**
 * 契約書一覧クエリオプション
 */
export interface ContractListQuery {
  page?: number;
  limit?: number;
  sortBy?: 'contractDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// 契約書API
// ============================================================================

/**
 * プロジェクトの契約書一覧を取得
 * Requirements: REQ-1.1, REQ-1.2
 *
 * @param projectId - プロジェクトID
 * @param options - クエリオプション
 * @returns 契約書一覧
 */
export async function getContracts(
  projectId: string,
  options?: ContractListQuery
): Promise<ContractsResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);

  const queryString = params.toString();
  const url = `/api/projects/${projectId}/contracts${queryString ? `?${queryString}` : ''}`;
  return apiClient.get<ContractsResponse>(url);
}
