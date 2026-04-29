/**
 * @fileoverview 受領見積書用APIクライアント
 *
 * Task 17.1: 受領見積書APIクライアントの実装
 * Task 22.1: 受領見積書APIクライアントの明細行対応追加
 *
 * Requirements:
 * - 11.1: 受領見積書登録
 * - 11.2: 受領見積書フォーム
 * - 11.9: 構造化データ入力（明細行管理）
 * - 11.14: ファイルプレビュー
 * - 11.15: 受領見積書編集
 * - 11.16: 受領見積書削除
 * - 11.22: 受領見積書バリデーション（ファイルまたは明細行必須）
 * - 14.2: 明細行データの永続化
 */

import { apiClient, ApiError } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細行情報（レスポンス型）
 *
 * Requirements: 11.9, 14.2
 * Task 61.3: netAmountを削除（受領見積書レベルに移動）
 */
export interface LineItemInfo {
  id: string;
  receivedQuotationId: string;
  sortOrder: number;
  customCategory: string | null;
  workType: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
}

/**
 * 明細行入力（リクエスト型）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを削除（受領見積書レベルに移動）
 */
export interface LineItemInput {
  name: string;
  customCategory?: string;
  workType?: string;
  specification?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  remarks?: string;
  sortOrder: number;
}

/**
 * 受領見積書情報（改訂版：contentType廃止、明細行・合計金額追加、netAmount追加）
 *
 * Requirements: 11.9, 14.2
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  lineItems: LineItemInfo[];
  totalAmount: number | null;
  netAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  /** 協力業者名（プロジェクト単位取得時のみ） */
  tradingPartnerName?: string | null;
}

/**
 * 受領見積書作成入力（改訂版：contentType廃止、lineItems追加、netAmount追加）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface CreateReceivedQuotationInput {
  name: string;
  submittedAt: Date;
  file?: File;
  lineItems?: LineItemInput[];
  netAmount?: number | null;
}

/**
 * 受領見積書更新入力（改訂版：contentType廃止、lineItems追加、removeFile追加、netAmount追加）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  file?: File;
  removeFile?: boolean;
  lineItems?: LineItemInput[];
  netAmount?: number | null;
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
      // Req 38.x: 401 のときは apiClient 経由で SessionExpiredModal をトリガーする。
      // sendFormData は apiClient を bypass して fetch を直接呼ぶため、
      // ここで明示的に sessionExpiredCallback を発火させないとモーダルが出ない。
      if (response.status === 401) {
        apiClient.triggerSessionExpired();
      }
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
 * レスポンスには明細行データと合計金額が含まれる。
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
 * レスポンスには明細行データと合計金額が含まれる。
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
 * lineItemsはJSON文字列としてFormDataに含める。
 *
 * @param estimateRequestId - 見積依頼ID
 * @param input - 受領見積書作成入力
 * @returns 作成された受領見積書
 *
 * @throws ApiError 見積依頼が見つからない（404）、バリデーションエラー（400）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）
 */
export async function createReceivedQuotation(
  estimateRequestId: string,
  input: CreateReceivedQuotationInput
): Promise<ReceivedQuotationInfo> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('submittedAt', input.submittedAt.toISOString());

  // ファイルアップロード
  if (input.file) {
    formData.append('file', input.file);
  }

  // 明細行データをJSON文字列としてFormDataに追加（Requirements: 11.22）
  if (input.lineItems && input.lineItems.length > 0) {
    formData.append('lineItems', JSON.stringify(input.lineItems));
  }

  // NET金額（Task 61.3: 受領見積書レベルで管理）
  if (input.netAmount !== undefined && input.netAmount !== null) {
    formData.append('netAmount', String(input.netAmount));
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
 * lineItemsはJSON文字列としてFormDataに含め、全量置換される。
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

  // ファイルアップロード
  if (input.file) {
    formData.append('file', input.file);
  }

  // 既存ファイル削除フラグ
  if (input.removeFile) {
    formData.append('removeFile', 'true');
  }

  // 明細行全量置換パラメータ（Requirements: 11.22）
  if (input.lineItems) {
    formData.append('lineItems', JSON.stringify(input.lineItems));
  }

  // NET金額（Task 61.3: 受領見積書レベルで管理）
  if (input.netAmount !== undefined) {
    formData.append('netAmount', input.netAmount === null ? 'null' : String(input.netAmount));
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
 * 楽観的排他制御を使用。ファイルが存在する場合は物理削除も行われる。
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
 *                  ファイルがない受領見積書（422）
 */
export async function getPreviewUrl(id: string): Promise<string> {
  const response = await apiClient.get<{ url: string }>(`/api/quotations/${id}/preview`);
  return response.url;
}

/**
 * プロジェクトに紐付く受領見積書一覧を取得する
 *
 * 見積書作成時の転記機能で使用。
 * 見積依頼経由で登録された受領見積書のみを取得。
 *
 * Requirements: REQ-4.5
 *
 * @param projectId - プロジェクトID
 * @returns 受領見積書一覧
 */
export async function getReceivedQuotationsByProject(
  projectId: string
): Promise<ReceivedQuotationInfo[]> {
  const response = await apiClient.get<ReceivedQuotationInfo[]>(
    `/api/projects/${projectId}/quotations`
  );
  return response.map((q) => ({
    ...q,
    submittedAt: new Date(q.submittedAt),
    createdAt: new Date(q.createdAt),
    updatedAt: new Date(q.updatedAt),
  }));
}
