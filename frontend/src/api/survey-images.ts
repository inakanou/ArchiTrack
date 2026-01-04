/**
 * @fileoverview 画像管理用APIクライアント
 *
 * Task 7.2: 画像管理APIクライアントの実装
 * Task 27.3: 画像メタデータAPIクライアントの実装
 *
 * Requirements:
 * - 4.1: POST /api/site-surveys/:id/images 画像アップロード（FormData対応）
 * - 4.2: バッチアップロード対応
 * - 4.7: DELETE /api/site-surveys/images/:imageId 画像削除
 * - 4.10: PUT /api/site-surveys/:id/images/order 画像順序変更
 * - 10.4: PATCH /api/site-surveys/images/:imageId 画像メタデータ更新（コメント・報告書出力フラグ）
 * - 10.8: 報告書出力フラグの永続化
 */

import { ApiError, apiClient } from './client';
import type {
  SurveyImageInfo,
  UploadImageOptions,
  BatchUploadProgress,
  BatchUploadOptions,
  BatchUploadError,
  ImageOrderItem,
  UpdateImageMetadataInput,
  UpdateImageMetadataResponse,
  BatchUpdateImageMetadataInput,
} from '../types/site-survey.types';

// ============================================================================
// 型定義の再エクスポート（テスト用）
// ============================================================================

export type { BatchUploadProgress, BatchUploadOptions, BatchUploadError };

// ============================================================================
// 定数
// ============================================================================

/** デフォルトバッチサイズ */
const DEFAULT_BATCH_SIZE = 5;

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/**
 * FormDataを使用したHTTPリクエストを送信
 *
 * APIクライアントの基本機能（Content-Type: application/json）では
 * FormDataを正しく送信できないため、専用の実装を提供
 *
 * @param url - リクエストURL
 * @param formData - 送信するFormData
 * @param method - HTTPメソッド
 * @returns レスポンスデータ
 */
async function requestWithFormData<T>(
  url: string,
  formData: FormData,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const fullUrl = `${baseUrl}${url}`;

  // 認証トークンを取得
  const accessToken = apiClient.getAccessToken();

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  // Content-Typeはブラウザが自動設定（multipart/form-data with boundary）

  const response = await fetch(fullUrl, {
    method,
    headers,
    body: formData,
    credentials: 'include', // HTTPOnly Cookieを送受信
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
    // RFC 7807 Problem Details形式のdetailフィールドを優先的に使用
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
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 単一の画像をアップロードする
 *
 * 画像ファイルをFormDataとしてアップロードします。
 * サーバー側で自動的に圧縮・サムネイル生成が行われます。
 *
 * @param surveyId - 現場調査ID（UUID）
 * @param file - アップロードするファイル
 * @param options - アップロードオプション
 * @returns アップロードされた画像情報
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 現場調査が見つからない（404）
 *   - サポートされていないファイル形式（415）- `isUnsupportedFileTypeErrorResponse(error.response)`で識別可能
 *
 * Requirements: 4.1, 4.5, 4.8
 *
 * @example
 * // 基本的な使用法
 * const imageInfo = await uploadSurveyImage('survey-id', file);
 *
 * @example
 * // 表示順序を指定してアップロード
 * const imageInfo = await uploadSurveyImage('survey-id', file, { displayOrder: 3 });
 */
export async function uploadSurveyImage(
  surveyId: string,
  file: File,
  options: UploadImageOptions = {}
): Promise<SurveyImageInfo> {
  const formData = new FormData();
  // バックエンドは 'images' フィールドを期待している
  formData.append('images', file);

  if (options.displayOrder !== undefined) {
    formData.append('displayOrder', String(options.displayOrder));
  }

  return requestWithFormData<SurveyImageInfo>(
    `/api/site-surveys/${surveyId}/images`,
    formData,
    'POST'
  );
}

/**
 * 複数の画像をバッチアップロードする
 *
 * 5件を超える場合は5件ずつキュー処理して順次アップロードします。
 * 一部のアップロードが失敗しても、残りのファイルは継続してアップロードされます。
 *
 * @param surveyId - 現場調査ID（UUID）
 * @param files - アップロードするファイルの配列
 * @param options - バッチアップロードオプション
 * @returns 成功した画像情報の配列（失敗したファイルは含まれない）
 *
 * Requirements: 4.2, 4.3
 *
 * @example
 * // 基本的な使用法
 * const images = await uploadSurveyImages('survey-id', files);
 *
 * @example
 * // 進捗コールバック付き
 * const images = await uploadSurveyImages('survey-id', files, {
 *   onProgress: (progress) => {
 *     console.log(`${progress.completed}/${progress.total} 完了`);
 *   },
 * });
 *
 * @example
 * // カスタムバッチサイズ
 * const images = await uploadSurveyImages('survey-id', files, {
 *   batchSize: 3,
 *   startDisplayOrder: 10,
 * });
 */
export async function uploadSurveyImages(
  surveyId: string,
  files: File[],
  options: BatchUploadOptions = {}
): Promise<SurveyImageInfo[]> {
  const { onProgress, batchSize = DEFAULT_BATCH_SIZE, startDisplayOrder } = options;

  const results: SurveyImageInfo[] = [];
  const errors: BatchUploadError[] = [];

  // バッチ処理用のキュー
  const fileQueue = [...files];
  const total = files.length;
  let completed = 0;

  // 進捗を通知
  const notifyProgress = (current: number) => {
    if (onProgress) {
      const progress: BatchUploadProgress = {
        total,
        completed,
        current,
        results: [...results],
        errors: [...errors],
      };
      onProgress(progress);
    }
  };

  // バッチ単位で処理
  while (fileQueue.length > 0) {
    // バッチサイズ分だけ取り出し
    const batch = fileQueue.splice(0, batchSize);

    // バッチ内のファイルを並列処理
    const batchPromises = batch.map(async (file, batchIndex) => {
      const globalIndex = total - fileQueue.length - batch.length + batchIndex;
      const displayOrder =
        startDisplayOrder !== undefined ? startDisplayOrder + globalIndex : undefined;

      try {
        // 進捗通知（処理開始）
        notifyProgress(globalIndex);

        const imageInfo = await uploadSurveyImage(surveyId, file, { displayOrder });
        results.push(imageInfo);
        completed++;
        return { success: true as const, imageInfo };
      } catch (error) {
        const errorMessage =
          error instanceof ApiError ? error.message : 'アップロードに失敗しました。';
        errors.push({
          index: globalIndex,
          fileName: file.name,
          error: errorMessage,
        });
        completed++;
        return { success: false as const, error: errorMessage };
      }
    });

    // バッチ内の全ファイルを並列処理
    await Promise.all(batchPromises);

    // バッチ完了後に進捗通知
    notifyProgress(total - fileQueue.length - 1);
  }

  // 最終進捗通知
  notifyProgress(total - 1);

  return results;
}

/**
 * 現場調査の画像一覧を取得する
 *
 * @param surveyId - 現場調査ID（UUID）
 * @returns 画像情報の配列（表示順序でソート済み）
 * @throws ApiError
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 現場調査が見つからない（404）
 *
 * @example
 * const images = await getSurveyImages('survey-id');
 */
export async function getSurveyImages(surveyId: string): Promise<SurveyImageInfo[]> {
  return apiClient.get<SurveyImageInfo[]>(`/api/site-surveys/${surveyId}/images`);
}

/**
 * 画像を削除する
 *
 * 画像と関連する注釈データを削除します。
 *
 * @param imageId - 画像ID（UUID）
 * @throws ApiError
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）- `isImageNotFoundErrorResponse(error.response)`で識別可能
 *
 * Requirements: 4.7
 *
 * @example
 * await deleteSurveyImage('image-id');
 */
export async function deleteSurveyImage(imageId: string): Promise<void> {
  return apiClient.delete<void>(`/api/site-surveys/images/${imageId}`);
}

/**
 * 画像の表示順序を更新する
 *
 * ドラッグアンドドロップなどで画像の順序を変更した際に使用します。
 *
 * @param surveyId - 現場調査ID（UUID）
 * @param imageOrders - 画像IDと新しい表示順序のマッピング
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 現場調査が見つからない（404）
 *
 * Requirements: 4.9, 4.10
 *
 * @example
 * await updateSurveyImageOrder('survey-id', [
 *   { id: 'image-1', order: 2 },
 *   { id: 'image-2', order: 1 },
 *   { id: 'image-3', order: 3 },
 * ]);
 */
export async function updateSurveyImageOrder(
  surveyId: string,
  imageOrders: ImageOrderItem[]
): Promise<void> {
  return apiClient.put<void>(`/api/site-surveys/${surveyId}/images/order`, { orders: imageOrders });
}

// ============================================================================
// 画像メタデータ更新API（Task 27.3）
// ============================================================================

/**
 * 画像メタデータを更新する
 *
 * 写真のコメントや報告書出力フラグを更新します。
 *
 * @param imageId - 画像ID（UUID）
 * @param input - 更新するメタデータ
 * @returns 更新された画像メタデータ
 * @throws ApiError
 *   - バリデーションエラー（400）- コメントが2000文字を超えた場合
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）- `isImageNotFoundErrorResponse(error.response)`で識別可能
 *
 * Requirements: 10.4, 10.8
 *
 * @example
 * // コメントのみ更新
 * const updated = await updateImageMetadata('image-id', { comment: '施工箇所A' });
 *
 * @example
 * // 報告書出力フラグをON
 * const updated = await updateImageMetadata('image-id', { includeInReport: true });
 *
 * @example
 * // 両方を同時に更新
 * const updated = await updateImageMetadata('image-id', {
 *   comment: '施工箇所A',
 *   includeInReport: true,
 * });
 *
 * @example
 * // コメントをクリア
 * const updated = await updateImageMetadata('image-id', { comment: null });
 */
export async function updateImageMetadata(
  imageId: string,
  input: UpdateImageMetadataInput
): Promise<UpdateImageMetadataResponse> {
  return apiClient.patch<UpdateImageMetadataResponse>(`/api/site-surveys/images/${imageId}`, input);
}

/**
 * 複数の画像メタデータを一括で更新する
 *
 * Task 33.1: 手動保存方式対応
 *
 * 保存ボタンクリック時に、変更のあったすべての画像メタデータを
 * 一括でサーバーに送信します。
 *
 * @param updates - 更新する画像メタデータの配列
 * @returns 更新された画像メタデータの配列
 * @throws ApiError
 *   - バリデーションエラー（400）- コメントが2000文字を超えた場合
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）
 *
 * Requirements: 10.8
 *
 * @example
 * // 複数の画像を一括更新
 * const updated = await updateImageMetadataBatch([
 *   { id: 'image-1', comment: '施工箇所A' },
 *   { id: 'image-2', includeInReport: true },
 *   { id: 'image-3', comment: '確認済み', includeInReport: true },
 * ]);
 */
export async function updateImageMetadataBatch(
  updates: BatchUpdateImageMetadataInput[]
): Promise<UpdateImageMetadataResponse[]> {
  return apiClient.patch<UpdateImageMetadataResponse[]>('/api/site-surveys/images/batch', {
    updates,
  });
}
