/**
 * @fileoverview プロジェクト用APIクライアント
 *
 * Task 5.2: プロジェクト用APIクライアントの実装
 *
 * Requirements:
 * - 14.1: GET /api/projects プロジェクト一覧取得（ページネーション、検索、フィルタ、ソート対応）
 * - 14.2: GET /api/projects/:id プロジェクト詳細取得
 * - 14.3: POST /api/projects プロジェクト作成
 * - 14.4: PUT /api/projects/:id プロジェクト更新（楽観的排他制御）
 * - 14.5: DELETE /api/projects/:id プロジェクト削除
 * - 17.12: GET /api/users/assignable 担当者候補取得
 * - 18.1, 18.2, 18.3: エラーハンドリング（ネットワークエラー、サーバーエラー）
 */

import { apiClient } from './client';
import type {
  PaginatedProjects,
  ProjectDetail,
  ProjectInfo,
  StatusHistoryResponse,
  AssignableUser,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilter,
  StatusChangeInput,
} from '../types/project.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * プロジェクト一覧取得のオプション
 */
export interface GetProjectsOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20） */
  limit?: number;
  /** フィルタ条件 */
  filter?: ProjectFilter;
  /** ソートフィールド */
  sort?: 'id' | 'name' | 'customerName' | 'status' | 'createdAt' | 'updatedAt';
  /** ソート順序 */
  order?: 'asc' | 'desc';
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * プロジェクト一覧を取得する
 *
 * @param options - 取得オプション（ページネーション、フィルタ、ソート）
 * @returns ページネーション付きプロジェクト一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * @example
 * // 基本的な取得
 * const result = await getProjects();
 *
 * @example
 * // フィルタ付き取得
 * const result = await getProjects({
 *   page: 1,
 *   limit: 20,
 *   filter: { search: 'テスト', status: ['PREPARING'] },
 *   sort: 'updatedAt',
 *   order: 'desc',
 * });
 */
export async function getProjects(options: GetProjectsOptions = {}): Promise<PaginatedProjects> {
  const { page, limit, filter, sort, order } = options;

  // クエリパラメータを構築
  const params = new URLSearchParams();

  if (page !== undefined) {
    params.append('page', String(page));
  }
  if (limit !== undefined) {
    params.append('limit', String(limit));
  }
  if (filter?.search) {
    params.append('search', filter.search);
  }
  if (filter?.status && filter.status.length > 0) {
    params.append('status', filter.status.join(','));
  }
  if (filter?.createdFrom) {
    params.append('createdFrom', filter.createdFrom);
  }
  if (filter?.createdTo) {
    params.append('createdTo', filter.createdTo);
  }
  if (filter?.tradingPartnerId) {
    params.append('tradingPartnerId', filter.tradingPartnerId);
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (order) {
    params.append('order', order);
  }

  const queryString = params.toString();
  const path = queryString ? `/api/projects?${queryString}` : '/api/projects';

  return apiClient.get<PaginatedProjects>(path, { headers: undefined });
}

/**
 * プロジェクト詳細を取得する
 *
 * @param id - プロジェクトID（UUID）
 * @returns プロジェクト詳細情報
 * @throws ApiError プロジェクトが見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const project = await getProject('550e8400-e29b-41d4-a716-446655440000');
 */
export async function getProject(id: string): Promise<ProjectDetail> {
  return apiClient.get<ProjectDetail>(`/api/projects/${id}`);
}

/**
 * プロジェクトを作成する
 *
 * @param input - プロジェクト作成データ
 * @returns 作成されたプロジェクト情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const project = await createProject({
 *   name: '新規プロジェクト',
 *   customerName: '顧客名',
 *   salesPersonId: 'user-id',
 * });
 */
export async function createProject(input: CreateProjectInput): Promise<ProjectInfo> {
  return apiClient.post<ProjectInfo>('/api/projects', input);
}

/**
 * プロジェクトを更新する
 *
 * @param id - プロジェクトID（UUID）
 * @param input - プロジェクト更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新されたプロジェクト情報
 * @throws ApiError プロジェクトが見つからない（404）、バリデーションエラー（400）、競合（409）
 *
 * @example
 * const project = await updateProject(
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   { name: '更新された名前' },
 *   '2025-01-01T00:00:00.000Z'
 * );
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  expectedUpdatedAt: string
): Promise<ProjectInfo> {
  return apiClient.put<ProjectInfo>(`/api/projects/${id}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * プロジェクトを削除する（論理削除）
 *
 * @param id - プロジェクトID（UUID）
 * @throws ApiError プロジェクトが見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * await deleteProject('550e8400-e29b-41d4-a716-446655440000');
 */
export async function deleteProject(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/projects/${id}`);
}

/**
 * プロジェクトのステータスを変更する
 *
 * @param id - プロジェクトID（UUID）
 * @param input - ステータス変更データ
 * @returns 更新されたプロジェクト情報
 * @throws ApiError
 *   - プロジェクトが見つからない（404）
 *   - 無効なステータス遷移（422）
 *   - 差し戻し理由未入力（422）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *
 * @example
 * // 順方向遷移
 * const project = await transitionStatus('project-id', { status: 'SURVEYING' });
 *
 * @example
 * // 差し戻し遷移（理由必須）
 * const project = await transitionStatus('project-id', {
 *   status: 'PREPARING',
 *   reason: '調査内容に問題があったため',
 * });
 */
export async function transitionStatus(id: string, input: StatusChangeInput): Promise<ProjectInfo> {
  return apiClient.patch<ProjectInfo>(`/api/projects/${id}/status`, input);
}

/**
 * プロジェクトのステータス変更履歴を取得する
 *
 * @param id - プロジェクトID（UUID）
 * @returns ステータス変更履歴の配列
 * @throws ApiError プロジェクトが見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const histories = await getStatusHistory('550e8400-e29b-41d4-a716-446655440000');
 */
export async function getStatusHistory(id: string): Promise<StatusHistoryResponse[]> {
  return apiClient.get<StatusHistoryResponse[]>(`/api/projects/${id}/status-history`);
}

/**
 * 担当者候補一覧を取得する
 *
 * admin以外の有効なユーザー一覧を取得します。
 * 営業担当者・工事担当者の選択に使用します。
 *
 * @returns 担当者候補の配列
 * @throws ApiError 認証エラー（401）、権限不足（403）
 *
 * @example
 * const users = await getAssignableUsers();
 */
export async function getAssignableUsers(): Promise<AssignableUser[]> {
  return apiClient.get<AssignableUser[]>('/api/users/assignable');
}
