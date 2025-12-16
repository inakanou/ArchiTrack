/**
 * @fileoverview 現場調査用APIクライアント
 *
 * Task 7.1: 現場調査APIクライアントの実装
 *
 * Requirements:
 * - 1.1: POST /api/projects/:projectId/site-surveys 現場調査作成
 * - 1.2: GET /api/site-surveys/:id 現場調査詳細取得
 * - 1.3: PUT /api/site-surveys/:id 現場調査更新（楽観的排他制御）
 * - 1.4: DELETE /api/site-surveys/:id 現場調査削除
 * - 3.1: GET /api/projects/:projectId/site-surveys 現場調査一覧取得
 */

import { apiClient } from './client';
import type {
  PaginatedSiteSurveys,
  SiteSurveyDetail,
  SiteSurveyInfo,
  CreateSiteSurveyInput,
  UpdateSiteSurveyInput,
  SiteSurveyFilter,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../types/site-survey.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * 現場調査一覧取得のオプション
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export interface GetSiteSurveysOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20、最大: 100） */
  limit?: number;
  /** フィルタ条件 */
  filter?: SiteSurveyFilter;
  /** ソートフィールド（surveyDate, createdAt, updatedAt） */
  sort?: SiteSurveySortableField;
  /** ソート順序 */
  order?: SiteSurveySortOrder;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 現場調査一覧を取得する
 *
 * 指定されたプロジェクトに紐付く現場調査の一覧を取得します。
 * ページネーション、検索、日付フィルタ、ソートに対応しています。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param options - 取得オプション（ページネーション、フィルタ、ソート）
 * @returns ページネーション付き現場調査一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 *
 * @example
 * // 基本的な取得
 * const result = await getSiteSurveys('project-id');
 *
 * @example
 * // フィルタ付き取得
 * const result = await getSiteSurveys('project-id', {
 *   page: 1,
 *   limit: 20,
 *   filter: { search: '調査', surveyDateFrom: '2025-01-01' },
 *   sort: 'surveyDate',
 *   order: 'desc',
 * });
 */
export async function getSiteSurveys(
  projectId: string,
  options: GetSiteSurveysOptions = {}
): Promise<PaginatedSiteSurveys> {
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
  if (filter?.surveyDateFrom) {
    params.append('surveyDateFrom', filter.surveyDateFrom);
  }
  if (filter?.surveyDateTo) {
    params.append('surveyDateTo', filter.surveyDateTo);
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (order) {
    params.append('order', order);
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/site-surveys?${queryString}`
    : `/api/projects/${projectId}/site-surveys`;

  return apiClient.get<PaginatedSiteSurveys>(path);
}

/**
 * 現場調査詳細を取得する
 *
 * 現場調査の基本情報、プロジェクト情報、画像一覧を取得します。
 *
 * @param id - 現場調査ID（UUID）
 * @returns 現場調査詳細情報
 * @throws ApiError 現場調査が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * Requirements: 1.2
 *
 * @example
 * const survey = await getSiteSurvey('survey-id');
 */
export async function getSiteSurvey(id: string): Promise<SiteSurveyDetail> {
  return apiClient.get<SiteSurveyDetail>(`/api/site-surveys/${id}`);
}

/**
 * 現場調査を作成する
 *
 * 指定されたプロジェクトに紐付く新しい現場調査を作成します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - 現場調査作成データ
 * @returns 作成された現場調査情報
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - プロジェクトが見つからない（404）- `isProjectNotFoundForSurveyErrorResponse(error.response)`で識別可能
 *
 * Requirements: 1.1, 1.6
 *
 * @example
 * // 基本的な使用法
 * const survey = await createSiteSurvey('project-id', {
 *   name: '現場調査1',
 *   surveyDate: '2025-01-15',
 * });
 *
 * @example
 * // メモ付きの現場調査作成
 * const survey = await createSiteSurvey('project-id', {
 *   name: '現場調査1',
 *   surveyDate: '2025-01-15',
 *   memo: '初回現地確認',
 * });
 */
export async function createSiteSurvey(
  projectId: string,
  input: CreateSiteSurveyInput
): Promise<SiteSurveyInfo> {
  return apiClient.post<SiteSurveyInfo>(`/api/projects/${projectId}/site-surveys`, input);
}

/**
 * 現場調査を更新する
 *
 * 楽観的排他制御を使用して現場調査を更新します。
 * expectedUpdatedAtと実際の更新日時が一致しない場合、409エラーが発生します。
 *
 * @param id - 現場調査ID（UUID）
 * @param input - 現場調査更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新された現場調査情報
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - 現場調査が見つからない（404）
 *   - 競合（409）- 楽観的排他制御エラー、`isSiteSurveyConflictErrorResponse(error.response)`で識別可能
 *
 * Requirements: 1.3, 1.5
 *
 * @example
 * // 基本的な使用法
 * const survey = await updateSiteSurvey(
 *   'survey-id',
 *   { name: '更新された調査名' },
 *   '2025-01-02T00:00:00.000Z'
 * );
 *
 * @example
 * // 楽観的排他制御エラーのハンドリング
 * try {
 *   await updateSiteSurvey(id, input, expectedUpdatedAt);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isSiteSurveyConflictErrorResponse(error.response)) {
 *       // 競合エラー - データを再読み込みしてリトライ
 *       console.log('データが更新されています。再読み込みしてください。');
 *     }
 *   }
 * }
 */
export async function updateSiteSurvey(
  id: string,
  input: UpdateSiteSurveyInput,
  expectedUpdatedAt: string
): Promise<SiteSurveyInfo> {
  return apiClient.put<SiteSurveyInfo>(`/api/site-surveys/${id}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * 現場調査を削除する（論理削除）
 *
 * 現場調査と関連する画像データを論理削除します。
 *
 * @param id - 現場調査ID（UUID）
 * @throws ApiError 現場調査が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * Requirements: 1.4
 *
 * @example
 * await deleteSiteSurvey('survey-id');
 */
export async function deleteSiteSurvey(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/site-surveys/${id}`);
}
