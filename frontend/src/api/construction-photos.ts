/**
 * @fileoverview 工事写真アルバムAPIクライアント
 *
 * Task 5.1: フロントAPIクライアントと型（アルバムCRUD・一覧）
 *
 * 既存の現場調査APIクライアント（site-surveys.ts）の薄い fetch ラッパ規約に倣う。
 * 二重マウント規約に合わせ、プロジェクト配下の操作（作成/一覧）は nested パス、
 * ID指定の操作（取得/更新/削除）は flat パスを用いる。
 *
 * Requirements:
 * - 1.1: POST /api/projects/:projectId/construction-photos アルバム作成
 * - 1.2: GET /api/construction-photos/:id アルバム詳細取得
 * - 1.3, 1.5: PATCH /api/construction-photos/:id アルバム更新（楽観的排他制御）
 * - 1.4: DELETE /api/construction-photos/:id アルバム削除
 * - 3.1, 3.3, 3.4: GET /api/projects/:projectId/construction-photos 一覧（ページング・検索・ソート）
 *
 * @module api/construction-photos
 */

import { apiClient } from './client';
import type {
  ConstructionPhotoAlbum,
  PaginatedConstructionPhotoAlbums,
  CreateConstructionPhotoAlbumInput,
  UpdateConstructionPhotoAlbumInput,
  GetConstructionPhotoAlbumsOptions,
} from '../types/construction-photo.types';

/**
 * 工事写真アルバム一覧を取得する
 *
 * ページネーション、アルバム名の部分一致検索、作成日/更新日ソートに対応する。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param options - 取得オプション（ページング、検索、ソート）
 * @returns ページネーション付きアルバム一覧
 * @throws ApiError 認証エラー（401）、権限不足（403）、バリデーションエラー（400）
 *
 * Requirements: 3.1, 3.3, 3.4, 11.1
 */
export async function getConstructionPhotoAlbums(
  projectId: string,
  options: GetConstructionPhotoAlbumsOptions = {}
): Promise<PaginatedConstructionPhotoAlbums> {
  const { page, limit, search, sort, order } = options;

  const params = new URLSearchParams();
  if (page !== undefined) {
    params.append('page', String(page));
  }
  if (limit !== undefined) {
    params.append('limit', String(limit));
  }
  if (search) {
    params.append('search', search);
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (order) {
    params.append('order', order);
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/construction-photos?${queryString}`
    : `/api/projects/${projectId}/construction-photos`;

  return apiClient.get<PaginatedConstructionPhotoAlbums>(path);
}

/**
 * 工事写真アルバム詳細を取得する
 *
 * @param id - アルバムID（UUID）
 * @returns アルバムDTO
 * @throws ApiError 認証エラー（401）、権限不足（403）、アルバムが見つからない（404）
 *
 * Requirements: 1.2
 */
export async function getConstructionPhotoAlbum(id: string): Promise<ConstructionPhotoAlbum> {
  return apiClient.get<ConstructionPhotoAlbum>(`/api/construction-photos/${id}`);
}

/**
 * 工事写真アルバムを作成する
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - アルバム作成データ
 * @returns 作成されたアルバムDTO
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   プロジェクトが見つからない（404）
 *
 * Requirements: 1.1, 1.6
 */
export async function createConstructionPhotoAlbum(
  projectId: string,
  input: CreateConstructionPhotoAlbumInput
): Promise<ConstructionPhotoAlbum> {
  return apiClient.post<ConstructionPhotoAlbum>(
    `/api/projects/${projectId}/construction-photos`,
    input
  );
}

/**
 * 工事写真アルバムを更新する（楽観的排他制御）
 *
 * expectedUpdatedAt を body の `updatedAt` として送信する。サーバの updatedAt と
 * 一致しない場合は 409 が返る（`isConstructionPhotoAlbumConflictErrorResponse` で識別可能）。
 *
 * @param id - アルバムID（UUID）
 * @param input - 更新データ（name / memo）
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新されたアルバムDTO
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   アルバムが見つからない（404）、競合（409）
 *
 * Requirements: 1.3, 1.5
 */
export async function updateConstructionPhotoAlbum(
  id: string,
  input: UpdateConstructionPhotoAlbumInput,
  expectedUpdatedAt: string
): Promise<ConstructionPhotoAlbum> {
  return apiClient.patch<ConstructionPhotoAlbum>(`/api/construction-photos/${id}`, {
    ...input,
    updatedAt: expectedUpdatedAt,
  });
}

/**
 * 工事写真アルバムを削除する（論理削除）
 *
 * @param id - アルバムID（UUID）
 * @throws ApiError 認証エラー（401）、権限不足（403）、アルバムが見つからない（404）
 *
 * Requirements: 1.4
 */
export async function deleteConstructionPhotoAlbum(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/construction-photos/${id}`);
}
