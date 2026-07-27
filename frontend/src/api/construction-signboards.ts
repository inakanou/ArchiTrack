/**
 * @fileoverview 工事看板マスタAPIクライアント
 *
 * Task 5.1: フロントAPIクライアントと型（看板CRUD・一覧）
 *
 * 既存の工事写真アルバムAPIクライアント（construction-photos.ts）の規約に倣う。
 * 二重マウント規約に合わせ、プロジェクト配下の操作（作成/一覧）は nested パス、
 * ID指定の操作（更新/削除）は flat パスを用いる。
 *
 * Requirements:
 * - 8.1: POST /api/projects/:projectId/construction-signboards 看板作成
 * - 8.6: PATCH /api/construction-signboards/:id 看板更新（楽観的排他制御）
 * - 8.7, 8.8: DELETE /api/construction-signboards/:id 看板削除（使用件数 inUseCount を返す）
 * - 8.10: GET /api/projects/:projectId/construction-signboards 看板一覧
 *
 * @module api/construction-signboards
 */

import { apiClient } from './client';
import type {
  ConstructionSignboard,
  CreateConstructionSignboardInput,
  UpdateConstructionSignboardInput,
  DeleteSignboardResult,
} from '../types/construction-photo.types';

/**
 * プロジェクトに登録済みの工事看板一覧を取得する
 *
 * @param projectId - プロジェクトID（UUID）
 * @returns 看板DTO配列（作成日降順）
 * @throws ApiError 認証エラー（401）、権限不足（403）
 *
 * Requirements: 8.9, 8.10
 */
export async function getConstructionSignboards(
  projectId: string
): Promise<ConstructionSignboard[]> {
  return apiClient.get<ConstructionSignboard[]>(
    `/api/projects/${projectId}/construction-signboards`
  );
}

/**
 * 工事看板を作成する
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - 看板作成データ（freeItems 省略時はサーバ側で [] が既定される）
 * @returns 作成された看板DTO
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   プロジェクトが見つからない（404）
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export async function createConstructionSignboard(
  projectId: string,
  input: CreateConstructionSignboardInput
): Promise<ConstructionSignboard> {
  return apiClient.post<ConstructionSignboard>(
    `/api/projects/${projectId}/construction-signboards`,
    input
  );
}

/**
 * 工事看板を更新する（楽観的排他制御）
 *
 * expectedUpdatedAt を body の `updatedAt` として送信する。サーバの updatedAt と
 * 一致しない場合は 409 が返る（`isConstructionSignboardConflictErrorResponse` で識別可能）。
 *
 * @param id - 看板ID（UUID）
 * @param input - 更新データ（workName / workLocation / freeItems / footerText）
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新された看板DTO
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *   看板が見つからない（404）、競合（409）
 *
 * Requirements: 8.6
 */
export async function updateConstructionSignboard(
  id: string,
  input: UpdateConstructionSignboardInput,
  expectedUpdatedAt: string
): Promise<ConstructionSignboard> {
  return apiClient.patch<ConstructionSignboard>(`/api/construction-signboards/${id}`, {
    ...input,
    updatedAt: expectedUpdatedAt,
  });
}

/**
 * 工事看板を削除する（論理削除）
 *
 * 当該看板を参照している写真項目の件数（inUseCount）を返す。呼び出し側は
 * inUseCount>0 のとき使用中である旨を確認する。
 *
 * @param id - 看板ID（UUID）
 * @returns 使用件数（inUseCount）
 * @throws ApiError 認証エラー（401）、権限不足（403）、看板が見つからない（404）
 *
 * Requirements: 8.7, 8.8
 */
export async function deleteConstructionSignboard(id: string): Promise<DeleteSignboardResult> {
  return apiClient.delete<DeleteSignboardResult>(`/api/construction-signboards/${id}`);
}
