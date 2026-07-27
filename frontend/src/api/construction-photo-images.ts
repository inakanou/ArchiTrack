/**
 * @fileoverview 工事写真 画像管理APIクライアント
 *
 * Task 5.1: フロントAPIクライアントと型（アップロード/現調コピー/一覧/メタ更新/並び替え/削除/印字画像）
 *
 * 既存の画像管理APIクライアント（survey-images.ts）の規約に倣う。JSONボディの操作は
 * `apiClient` を用い、multipart アップロードと Blob 取得（印字画像）は fetch を直接使う。
 * 二重マウント規約に合わせ、アルバム配下の操作（一覧/アップロード/現調コピー/並び替え）は
 * nested パス、画像ID指定の操作（メタ一括更新/削除/印字画像）は flat パスを用いる。
 *
 * Requirements:
 * - 4.1, 12.5: multipart アップロード（複数ファイル・最大10件、部分失敗 {successful, failed}）
 * - 6.1, 12.5: 現調写真コピー（{successful, failed}）
 * - 7.8, 11.2, 11.3: 一覧（署名付きサムネURL同梱、displayOrder 昇順）
 * - 7.1, 7.5, 7.6, 9.1, 9.5, 11.4: メタデータ一括更新
 * - 7.3, 7.4, 11.4: 表示順序更新
 * - 10.x: 印字画像（image/jpeg Blob、看板ありはオンデマンド合成・なしは原本）
 *
 * @module api/construction-photo-images
 */

import { ApiError, apiClient } from './client';
import type {
  ConstructionPhotoWithUrls,
  ConstructionPhotoUploadResult,
  ConstructionPhotoCopyResult,
  BatchUpdatePhotoMetadataItem,
  PhotoOrderItem,
} from '../types/construction-photo.types';

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * ベースURLを取得する（apiClient と同一規約）
 */
function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

/**
 * 認証ヘッダを組み立てる（アクセストークンがある場合のみ Authorization を付与）
 */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const accessToken = apiClient.getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * エラーレスポンスから RFC 7807 の detail / 従来 error / statusText の順でメッセージを解決する
 */
function resolveErrorMessage(data: unknown, statusText: string): string {
  if (data && typeof data === 'object') {
    if ('detail' in data && typeof (data as { detail: unknown }).detail === 'string') {
      return (data as { detail: string }).detail;
    }
    if ('error' in data && typeof (data as { error: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
  }
  return statusText;
}

/**
 * FormData を用いた multipart リクエストを送信する
 *
 * apiClient は Content-Type: application/json 固定のため、multipart は fetch を直接使う。
 * Content-Type はブラウザが boundary 付きで自動設定するため明示しない。
 */
async function requestWithFormData<T>(url: string, formData: FormData): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${url}`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: formData,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type');
  const data: unknown = contentType?.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, resolveErrorMessage(data, response.statusText), data);
  }

  return data as T;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * アルバム配下の写真項目一覧を取得する（署名付きサムネURL同梱、displayOrder 昇順）
 *
 * @param albumId - アルバムID（UUID）
 * @returns 写真項目の配列（署名付きURL同梱）
 * @throws ApiError 認証エラー（401）、権限不足（403）、アルバムが見つからない（404）、
 *   ストレージ未設定（503）
 *
 * Requirements: 7.8, 11.2, 11.3
 */
export async function getConstructionPhotos(
  albumId: string
): Promise<ConstructionPhotoWithUrls[]> {
  return apiClient.get<ConstructionPhotoWithUrls[]>(
    `/api/construction-photos/${albumId}/images`
  );
}

/**
 * 画像を multipart でアップロードして写真項目を追加する（複数ファイル対応、最大10件/10MB）
 *
 * 全ファイルを1リクエストの multipart で送信する（件数・サイズ制限はサーバが検証）。
 * サーバは全件成功で 201、部分失敗で 207 を返し、いずれもボディは {successful, failed}。
 * 部分失敗を許容するため、失敗があってもエラーをスローせず結果をそのまま返す。
 *
 * @param albumId - アルバムID（UUID）
 * @param files - アップロードするファイルの配列
 * @returns 成功分（写真項目）と失敗分（ファイル名・エラー）を含む結果
 * @throws ApiError 認証エラー（401）、権限不足（403）、アルバムが見つからない（404）、
 *   ファイルサイズ超過（413）、件数超過・ファイル未指定（400）、ストレージ未設定（503）
 *
 * Requirements: 4.1, 4.2, 4.3, 12.1, 12.2, 12.5
 */
export async function uploadConstructionPhotos(
  albumId: string,
  files: File[]
): Promise<ConstructionPhotoUploadResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  return requestWithFormData<ConstructionPhotoUploadResult>(
    `/api/construction-photos/${albumId}/images`,
    formData
  );
}

/**
 * 同一プロジェクトの現場調査写真を独立した写真項目として複製する
 *
 * サーバは全件成功で 201、部分失敗で 207 を返し、いずれもボディは {successful, failed}。
 *
 * @param albumId - アルバムID（UUID）
 * @param surveyImageIds - 複製元の現場調査画像ID配列（1〜10件）
 * @returns 成功分（写真項目）と失敗分（現調画像ID・エラー）を含む結果
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   アルバム/現調写真が見つからない（404）、ストレージ未設定（503）
 *
 * Requirements: 6.1, 6.2, 12.5
 */
export async function addConstructionPhotosFromSurveys(
  albumId: string,
  surveyImageIds: string[]
): Promise<ConstructionPhotoCopyResult> {
  return apiClient.post<ConstructionPhotoCopyResult>(
    `/api/construction-photos/${albumId}/images/from-surveys`,
    { surveyImageIds }
  );
}

/**
 * 写真項目メタデータ（コメント/印刷対象/看板ID/看板配置/表示順序）を一括更新する
 *
 * 全項目は同一アルバムに属する必要がある。displayOrder は 1..n に正規化される。
 *
 * @param items - 更新項目の配列
 * @returns 更新後の写真項目（署名付きサムネURL同梱）
 * @throws ApiError バリデーションエラー / 複数アルバムにまたがる指定（400）、認証エラー（401）、
 *   権限不足（403）、写真項目/看板が見つからない（404）、ストレージ未設定（503）
 *
 * Requirements: 7.1, 7.5, 7.6, 9.1, 9.5, 11.4
 */
export async function updateConstructionPhotoMetadataBatch(
  items: BatchUpdatePhotoMetadataItem[]
): Promise<ConstructionPhotoWithUrls[]> {
  return apiClient.patch<ConstructionPhotoWithUrls[]>('/api/construction-photos/images/batch', {
    items,
  });
}

/**
 * アルバム配下の写真項目の表示順序を一括更新する
 *
 * 送信された相対順序は 1..n に正規化される。
 *
 * @param albumId - アルバムID（UUID）
 * @param orders - 写真項目IDと新しい表示順序のマッピング
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   写真項目が見つからない（404）、ストレージ未設定（503）
 *
 * Requirements: 7.3, 7.4, 11.4
 */
export async function updateConstructionPhotoOrder(
  albumId: string,
  orders: PhotoOrderItem[]
): Promise<void> {
  return apiClient.put<void>(`/api/construction-photos/${albumId}/images/order`, { orders });
}

/**
 * 写真項目を削除する（関連ストレージ original/thumbnail も削除される）
 *
 * @param imageId - 写真項目ID（UUID）
 * @throws ApiError 認証エラー（401）、権限不足（403）、写真項目が見つからない（404）、
 *   ストレージ未設定（503）
 *
 * Requirements: 7.x
 */
export async function deleteConstructionPhoto(imageId: string): Promise<void> {
  return apiClient.delete<void>(`/api/construction-photos/images/${imageId}`);
}

/**
 * PDF台帳用の印字画像を Blob（image/jpeg）として取得する
 *
 * 看板が指定されている写真は原本へ電子小黒板をサーバでオンデマンド合成して返し、
 * 看板が未指定・または参照先の看板が削除済みの写真は重畳なしで原本を返す。
 * 常に image/jpeg を返すため、apiClient（JSON/text 前提）ではなく fetch で Blob を取得する。
 *
 * @param imageId - 写真項目ID（UUID）
 * @returns 印字用画像（image/jpeg）の Blob
 * @throws ApiError 認証エラー（401）、権限不足（403）、写真項目が見つからない（404）、
 *   ストレージ未設定（503）
 *
 * Requirements: 10.x
 */
export async function getConstructionPhotoPrintImage(imageId: string): Promise<Blob> {
  const response = await fetch(
    `${getBaseUrl()}/api/construction-photos/images/${imageId}/print-image`,
    {
      method: 'GET',
      headers: buildAuthHeaders(),
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    const data: unknown = contentType?.includes('application/json')
      ? await response.json()
      : await response.text();
    throw new ApiError(response.status, resolveErrorMessage(data, response.statusText), data);
  }

  return response.blob();
}
