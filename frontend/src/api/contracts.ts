/**
 * @fileoverview 契約書APIクライアント
 *
 * Task 4.1: 契約書一覧ページコンポーネントを作成する
 * Task 5.1-5.4: 契約書フォームコンポーネントの実装
 *
 * Requirements (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類、契約日、ステータスを一覧に表示する
 * - REQ-2.1: 契約種類選択UI
 * - REQ-3.1: 新規契約入力フィールド
 * - REQ-4.1-4.7: 自動表示項目
 * - REQ-5.1-5.3: 変更契約
 * - REQ-6.1-6.2: 変更前後比較表示
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

/**
 * 契約書詳細
 * Requirements: REQ-5.2, REQ-6.1
 */
export interface ContractDetail {
  id: string;
  projectId: string;
  contractType: ContractType;
  status: ContractStatus;
  parentContractId: string | null;
  estimateId: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: number;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string | null;
  contractAmount: number;
  constructionPrice: number;
  taxAmount: number;
  estimate: { id: string; name: string } | null;
  parentContract: { id: string; contractType: ContractType; contractDate: string } | null;
  supervisorTradingPartner: { id: string; name: string } | null;
  project: {
    id: string;
    name: string;
    siteAddress: string | null;
    tradingPartner: { id: string; name: string } | null;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 契約書作成入力
 * Requirements: REQ-3.1, REQ-7.1
 */
export interface CreateContractInput {
  contractType: ContractType;
  parentContractId: string | null;
  estimateId: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: number;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string | null;
  contractAmount: number;
  constructionPrice: number;
  taxAmount: number;
}

/**
 * 契約書更新入力
 * Requirements: REQ-9.2
 */
export interface UpdateContractInput {
  estimateId: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: number;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string | null;
  contractAmount: number;
  constructionPrice: number;
  taxAmount: number;
  version: number;
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

/**
 * 契約書詳細を取得
 * Requirements: REQ-5.2, REQ-8.1
 *
 * @param id - 契約書ID
 * @returns 契約書詳細
 */
export async function getContractDetail(id: string): Promise<ContractDetail> {
  return apiClient.get<ContractDetail>(`/api/contracts/${id}`);
}

/**
 * 契約書を作成
 * Requirements: REQ-7.1
 *
 * @param projectId - プロジェクトID
 * @param input - 契約書作成入力
 * @returns 作成された契約書詳細
 */
export async function createContract(
  projectId: string,
  input: CreateContractInput
): Promise<ContractDetail> {
  return apiClient.post<ContractDetail>(`/api/projects/${projectId}/contracts`, input);
}

/**
 * 契約書を更新
 * Requirements: REQ-9.2
 *
 * @param id - 契約書ID
 * @param input - 契約書更新入力
 * @returns 更新された契約書詳細
 */
export async function updateContract(
  id: string,
  input: UpdateContractInput
): Promise<ContractDetail> {
  return apiClient.put<ContractDetail>(`/api/contracts/${id}`, input);
}

/**
 * 契約書のステータスを更新
 * Requirements: REQ-8.2, REQ-8.3
 *
 * @param id - 契約書ID
 * @param status - 新しいステータス
 * @returns 更新された契約書詳細
 */
export async function updateContractStatus(
  id: string,
  status: ContractStatus
): Promise<ContractDetail> {
  return apiClient.patch<ContractDetail>(`/api/contracts/${id}/status`, { status });
}

/**
 * 契約書を削除（論理削除）
 * Requirements: REQ-8.11, REQ-12.1, REQ-12.2
 *
 * @param id - 契約書ID
 * @throws ApiError 422 - 子契約が存在する場合、または契約済ステータスの場合
 */
export async function deleteContract(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/contracts/${id}`);
}
