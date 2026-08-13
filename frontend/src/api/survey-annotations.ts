/**
 * @fileoverview 注釈管理用APIクライアント
 *
 * Task 7.3: 注釈管理APIクライアントの実装
 *
 * Requirements:
 * - 9.1: PUT /api/site-surveys/images/:imageId/annotations 注釈データ保存
 * - 9.2: GET /api/site-surveys/images/:imageId/annotations 注釈データ取得
 * - 9.6: GET /api/site-surveys/images/:imageId/annotations/export JSONエクスポート
 */

import { apiClient } from './client';
import type {
  AnnotationInfo,
  SaveAnnotationInput,
  GetAnnotationResponse,
} from '../types/site-survey.types';
import { isNoAnnotationResponse } from '../types/site-survey.types';

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 画像の注釈データを取得する
 *
 * 画像に関連付けられた注釈データを取得します。
 * 注釈が存在しない場合はnullを返します。
 *
 * @param imageId - 画像ID（UUID）
 * @returns 注釈情報（存在しない場合はnull）
 * @throws ApiError
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）- `isAnnotationImageNotFoundErrorResponse(error.response)`で識別可能
 *
 * Requirements: 9.2
 *
 * @example
 * // 基本的な使用法
 * const annotation = await getAnnotation('image-id');
 * if (annotation) {
 *   console.log('注釈オブジェクト数:', annotation.data.objects.length);
 * } else {
 *   console.log('注釈データなし');
 * }
 */
export async function getAnnotation(imageId: string): Promise<AnnotationInfo | null> {
  const response = await apiClient.get<GetAnnotationResponse>(
    `/api/site-surveys/images/${imageId}/annotations`
  );

  // 注釈が存在しない場合は { data: null } が返される
  if (isNoAnnotationResponse(response)) {
    return null;
  }

  return response;
}

/**
 * 画像に注釈データを保存する
 *
 * 画像に注釈データを保存します（新規作成または更新）。
 * 楽観的排他制御を使用する場合は、expectedUpdatedAtを指定します。
 *
 * @param imageId - 画像ID（UUID）
 * @param input - 注釈保存入力（data, expectedUpdatedAt）
 * @returns 保存された注釈情報
 * @throws ApiError
 *   - バリデーションエラー（400）- `isInvalidAnnotationDataErrorResponse(error.response)`で識別可能
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）- `isAnnotationImageNotFoundErrorResponse(error.response)`で識別可能
 *   - 競合（409）- 楽観的排他制御エラー、`isAnnotationConflictErrorResponse(error.response)`で識別可能
 *
 * Requirements: 9.1, 9.4
 *
 * @example
 * // 基本的な使用法（楽観的排他制御なし）
 * const annotation = await saveAnnotation('image-id', {
 *   data: {
 *     version: '1.0',
 *     objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
 *   },
 * });
 *
 * @example
 * // 楽観的排他制御あり
 * const annotation = await saveAnnotation('image-id', {
 *   data: annotationData,
 *   expectedUpdatedAt: '2025-01-15T10:00:00.000Z',
 * });
 *
 * @example
 * // 楽観的排他制御エラーのハンドリング
 * try {
 *   await saveAnnotation(imageId, input);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isAnnotationConflictErrorResponse(error.response)) {
 *       // 競合エラー - データを再読み込みしてリトライ
 *       console.log('データが更新されています。再読み込みしてください。');
 *     }
 *   }
 * }
 */
export async function saveAnnotation(
  imageId: string,
  input: SaveAnnotationInput
): Promise<AnnotationInfo> {
  const body: { data: SaveAnnotationInput['data']; expectedUpdatedAt?: string } = {
    data: input.data,
  };

  if (input.expectedUpdatedAt) {
    body.expectedUpdatedAt = input.expectedUpdatedAt;
  }

  return apiClient.put<AnnotationInfo>(`/api/site-surveys/images/${imageId}/annotations`, body);
}

/**
 * 注釈データをJSON文字列としてエクスポートする
 *
 * 画像の注釈データをJSON形式でエクスポートします。
 * エクスポートされたデータはダウンロード用のJSON文字列として返されます。
 *
 * @param imageId - 画像ID（UUID）
 * @returns 注釈データのJSON文字列
 * @throws ApiError
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）- `isAnnotationImageNotFoundErrorResponse(error.response)`で識別可能
 *   - 注釈が見つからない（404）- `isAnnotationNotFoundErrorResponse(error.response)`で識別可能
 *
 * Requirements: 9.6
 *
 * @example
 * // 基本的な使用法
 * const jsonString = await exportAnnotationJson('image-id');
 * const blob = new Blob([jsonString], { type: 'application/json' });
 *
 * @example
 * // ダウンロードトリガー
 * const jsonString = await exportAnnotationJson('image-id');
 * const blob = new Blob([jsonString], { type: 'application/json' });
 * const url = URL.createObjectURL(blob);
 * const a = document.createElement('a');
 * a.href = url;
 * a.download = `annotation_${imageId}.json`;
 * a.click();
 * URL.revokeObjectURL(url);
 */
export async function exportAnnotationJson(imageId: string): Promise<string> {
  return apiClient.get<string>(`/api/site-surveys/images/${imageId}/annotations/export`);
}

// ============================================================================
// バッチ注釈取得（要件18対応）
// ============================================================================

/**
 * バッチ注釈取得レスポンス
 *
 * Requirements: 18.1, 18.8
 */
interface BatchAnnotationResponse {
  annotations: Record<string, AnnotationInfo | null>;
}

/**
 * 複数画像の注釈データを一括取得する
 *
 * PDF報告書出力時に使用し、個別取得（N回リクエスト）の代わりに
 * バッチAPI（1回リクエスト）で全画像の注釈データを取得する。
 *
 * @param surveyId - 現場調査ID（権限検証用）
 * @param imageIds - 取得対象の画像IDリスト
 * @returns 画像IDをキーとする注釈データのRecord（注釈なしの画像はnull）
 * @throws ApiError
 *   - 400: imageIdsが空配列または不正
 *   - 403: 権限不足
 *
 * Requirements: 18.1, 18.2
 */
export async function getBatchAnnotations(
  surveyId: string,
  imageIds: string[]
): Promise<Record<string, AnnotationInfo | null>> {
  const response = await apiClient.post<BatchAnnotationResponse>(
    '/api/site-surveys/annotations/batch',
    { surveyId, imageIds }
  );
  return response.annotations;
}

/**
 * 合成済みサムネイル更新レスポンス
 */
export interface UpdateAnnotatedThumbnailResponse {
  success: boolean;
  /** 保存された注釈付きサムネイルのストレージキー */
  annotatedThumbnailPath: string;
  /** 注釈付きサムネイルの署名付きURL（生成できなかった場合は null） */
  annotatedThumbnailUrl: string | null;
}

/**
 * 画像編集画面で合成した画像を注釈付きサムネイルとして保存する
 *
 * キャンバスからエクスポートした合成済み画像を送信し、注釈付きサムネイル
 * （annotatedThumbnailPath）を更新します。通常サムネイル（thumbnailPath）は
 * アップロード時の素の画像として不変であり、この操作では書き換わりません。
 *
 * @param imageId - 画像ID（UUID）
 * @param imageData - Base64エンコードされた画像データ（data:image/...形式）
 * @returns 合成済みサムネイル更新結果（更新後の表示元を含む）
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 画像が見つからない（404）
 *
 * @example
 * // キャンバスから合成済みサムネイルを更新
 * const canvas = fabricCanvas;
 * const imageData = canvas.toDataURL({ format: 'jpeg', quality: 0.9 });
 * const { annotatedThumbnailUrl } = await updateAnnotatedThumbnail('image-id', imageData);
 */
export async function updateAnnotatedThumbnail(
  imageId: string,
  imageData: string
): Promise<UpdateAnnotatedThumbnailResponse> {
  return apiClient.patch<UpdateAnnotatedThumbnailResponse>(
    `/api/site-surveys/images/${imageId}/annotated-thumbnail`,
    { imageData }
  );
}
