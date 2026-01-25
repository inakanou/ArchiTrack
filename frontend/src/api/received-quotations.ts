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

import { apiClient, ApiError } from './client';

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
// 内部ヘルパー関数
// ============================================================================

/**
 * ベースURLを取得
 */
function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

/**
 * multipart/form-data形式のリクエストを送信する
 *
 * apiClientはJSON.stringifyを使用するためFormDataを直接送信できない。
 * この関数は直接fetchを使用してFormDataを送信する。
 *
 * @param path - APIパス
 * @param method - HTTPメソッド
 * @param formData - 送信するFormData
 * @returns レスポンスデータ
 */
async function sendFormData<T>(
  path: string,
  method: 'POST' | 'PUT',
  formData: FormData
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  // アクセストークンを取得
  const accessToken = apiClient.getAccessToken();

  const headers: HeadersInit = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  // Note: Content-Typeは設定しない（ブラウザが自動でmultipart/form-dataとboundaryを設定）

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: formData,
      credentials: 'include',
    });

    // レスポンスボディを取得
    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // エラーレスポンスの処理
    if (!response.ok) {
      // RFC 7807 Problem Details形式のdetailフィールド、または従来のerrorフィールドを優先的に使用
      const errorMessage =
        (data && typeof data === 'object'
          ? 'detail' in data && typeof data.detail === 'string'
            ? data.detail
            : 'error' in data && typeof data.error === 'string'
              ? data.error
              : null
          : null) || response.statusText;
      throw new ApiError(response.status, errorMessage, data);
    }

    return data as T;
  } catch (error) {
    // ApiErrorはそのままスロー
    if (error instanceof ApiError) {
      throw error;
    }

    // ネットワークエラー等
    throw new ApiError(0, 'Network error', error);
  }
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
 * multipart/form-data形式でファイルアップロードに対応。
 *
 * @param estimateRequestId - 見積依頼ID
 * @param input - 受領見積書作成入力
 * @returns 作成された受領見積書
 *
 * @throws ApiError 見積依頼が見つからない（404）、バリデーションエラー（400）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）、
 *                  コンテンツタイプ整合性エラー（422）
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

  // 直接fetchを使用してFormDataを送信
  const response = await sendFormData<ReceivedQuotationInfo>(
    `/api/estimate-requests/${estimateRequestId}/quotations`,
    'POST',
    formData
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
 * multipart/form-data形式でファイルアップロードに対応。
 * 楽観的排他制御を使用。
 *
 * @param id - 受領見積書ID
 * @param input - 受領見積書更新入力
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 * @returns 更新された受領見積書
 *
 * @throws ApiError 受領見積書が見つからない（404）、競合（409）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）
 */
export async function updateReceivedQuotation(
  id: string,
  input: UpdateReceivedQuotationInput,
  updatedAt: string
): Promise<ReceivedQuotationInfo> {
  const formData = new FormData();
  // バックエンドはexpectedUpdatedAtを期待する
  formData.append('expectedUpdatedAt', updatedAt);

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

  // 直接fetchを使用してFormDataを送信
  const response = await sendFormData<ReceivedQuotationInfo>(
    `/api/quotations/${id}`,
    'PUT',
    formData
  );

  return {
    ...response,
    submittedAt: new Date(response.submittedAt),
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

/**
 * 受領見積書を削除する（論理削除）
 *
 * 楽観的排他制御を使用。ファイルコンテンツの場合は物理削除も行われる。
 *
 * @param id - 受領見積書ID
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 *
 * @throws ApiError 受領見積書が見つからない（404）、競合（409）
 */
export async function deleteReceivedQuotation(id: string, updatedAt: string): Promise<void> {
  return apiClient.delete<void>(`/api/quotations/${id}`, {
    body: { updatedAt },
  });
}

/**
 * ファイルプレビューURLを取得する
 *
 * Cloudflare R2（または同等のストレージ）の署名付きURLを取得する。
 *
 * @param id - 受領見積書ID
 * @returns 署名付きプレビューURL
 *
 * @throws ApiError 受領見積書が見つからない（404）、
 *                  テキストコンテンツの場合ファイルなし（422）
 */
export async function getPreviewUrl(id: string): Promise<string> {
  const response = await apiClient.get<{ url: string }>(`/api/quotations/${id}/preview`);
  return response.url;
}
