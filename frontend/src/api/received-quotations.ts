/**
 * @fileoverview 受領見積書用APIクライアント
 *
 * Task 17.1: 受領見積書APIクライアントの実装
 *
 * Requirements:
 * - 11.1: 受領見積書登録
 * - 11.2: 受領見積書フォーム
 * - 11.9: 受領見積書更新
 * - 11.14: ファイルプレビュー
 * - 11.15: 受領見積書編集
 * - 11.16: 受領見積書削除
 */

import { apiClient } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * コンテンツタイプ
 */
export type ReceivedQuotationContentType = 'TEXT' | 'FILE';

/**
 * 受領見積書情報
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  contentType: ReceivedQuotationContentType;
  textContent: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 受領見積書作成入力
 */
export interface CreateReceivedQuotationInput {
  name: string;
  submittedAt: Date;
  contentType: ReceivedQuotationContentType;
  textContent?: string;
  file?: File;
}

/**
 * 受領見積書更新入力
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  contentType?: ReceivedQuotationContentType;
  textContent?: string;
  file?: File;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 受領見積書一覧を取得する
 *
 * @param estimateRequestId - 見積依頼ID
 * @returns 受領見積書一覧
 */
export async function getReceivedQuotations(
  estimateRequestId: string
): Promise<ReceivedQuotationInfo[]> {
  const response = await apiClient.get<ReceivedQuotationInfo[]>(
    `/api/estimate-requests/${estimateRequestId}/quotations`
  );
  return response.map((q) => ({
    ...q,
    submittedAt: new Date(q.submittedAt),
    createdAt: new Date(q.createdAt),
    updatedAt: new Date(q.updatedAt),
  }));
}

/**
 * 受領見積書詳細を取得する
 *
 * @param id - 受領見積書ID
 * @returns 受領見積書詳細
 */
export async function getReceivedQuotation(id: string): Promise<ReceivedQuotationInfo> {
  const response = await apiClient.get<ReceivedQuotationInfo>(`/api/quotations/${id}`);
  return {
    ...response,
    submittedAt: new Date(response.submittedAt),
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

/**
 * 受領見積書を作成する
 *
 * @param estimateRequestId - 見積依頼ID
 * @param input - 受領見積書作成入力
 * @returns 作成された受領見積書
 */
export async function createReceivedQuotation(
  estimateRequestId: string,
  input: CreateReceivedQuotationInput
): Promise<ReceivedQuotationInfo> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('submittedAt', input.submittedAt.toISOString());
  formData.append('contentType', input.contentType);

  if (input.contentType === 'TEXT' && input.textContent) {
    formData.append('textContent', input.textContent);
  } else if (input.contentType === 'FILE' && input.file) {
    formData.append('file', input.file);
  }

  const response = await apiClient.post<ReceivedQuotationInfo>(
    `/api/estimate-requests/${estimateRequestId}/quotations`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return {
    ...response,
    submittedAt: new Date(response.submittedAt),
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

/**
 * 受領見積書を更新する
 *
 * @param id - 受領見積書ID
 * @param input - 受領見積書更新入力
 * @param updatedAt - 楽観的排他制御用の更新日時
 * @returns 更新された受領見積書
 */
export async function updateReceivedQuotation(
  id: string,
  input: UpdateReceivedQuotationInput,
  updatedAt: string
): Promise<ReceivedQuotationInfo> {
  const formData = new FormData();
  formData.append('updatedAt', updatedAt);

  if (input.name) {
    formData.append('name', input.name);
  }
  if (input.submittedAt) {
    formData.append('submittedAt', input.submittedAt.toISOString());
  }
  if (input.contentType) {
    formData.append('contentType', input.contentType);
  }
  if (input.contentType === 'TEXT' && input.textContent !== undefined) {
    formData.append('textContent', input.textContent);
  } else if (input.contentType === 'FILE' && input.file) {
    formData.append('file', input.file);
  }

  const response = await apiClient.put<ReceivedQuotationInfo>(`/api/quotations/${id}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return {
    ...response,
    submittedAt: new Date(response.submittedAt),
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

/**
 * 受領見積書を削除する
 *
 * @param id - 受領見積書ID
 * @param updatedAt - 楽観的排他制御用の更新日時
 */
export async function deleteReceivedQuotation(id: string, updatedAt: string): Promise<void> {
  return apiClient.delete<void>(`/api/quotations/${id}`, {
    body: { updatedAt },
  });
}

/**
 * ファイルプレビューURLを取得する
 *
 * @param id - 受領見積書ID
 * @returns 署名付きプレビューURL
 */
export async function getPreviewUrl(id: string): Promise<string> {
  const response = await apiClient.get<{ url: string }>(`/api/quotations/${id}/preview`);
  return response.url;
}
