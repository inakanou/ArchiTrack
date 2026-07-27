/**
 * @fileoverview プロジェクト用APIクライアント
 *
 * Task 5.2: プロジェクト用APIクライアントの実装
 * Task 22.4: プロジェクトAPIクライアントに409エラーハンドリング追加
 *
 * Requirements:
 * - 14.1: GET /api/projects プロジェクト一覧取得（ページネーション、検索、フィルタ、ソート対応）
 * - 14.2: GET /api/projects/:id プロジェクト詳細取得
 * - 14.3: POST /api/projects プロジェクト作成
 * - 14.4: PUT /api/projects/:id プロジェクト更新（楽観的排他制御）
 * - 14.5: DELETE /api/projects/:id プロジェクト削除
 * - 17.12: GET /api/users/assignable 担当者候補取得
 * - 18.1, 18.2, 18.3: エラーハンドリング（ネットワークエラー、サーバーエラー）
 * - 1.15, 1.16, 8.7, 8.8: プロジェクト名重複エラー（409）ハンドリング
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
  StatusCountsResponse,
} from '../types/project.types';
import type { ProjectSurveySummary } from '../types/site-survey.types';
import type { ProjectQuantityTableSummary } from '../types/quantity-table.types';
import type { ProjectItemizedStatementSummary } from '../types/itemized-statement.types';
import type { ProjectEstimateRequestSummary } from '../types/estimate-request.types';
import type { EstimateSummary } from './estimates';
import type { ContractType, ContractStatus } from './contracts';
import type { ExecutionBudgetSectionInfo } from '../components/projects/ExecutionBudgetSectionCard';

// ============================================================================
// 契約書セクションサマリー型（detail-summary API用）
// ============================================================================

/**
 * 契約書セクションサマリーアイテム
 *
 * Task 59.2: detail-summary API契約書セクション統合
 * Requirements: 37.2, 37.3
 */
export interface ContractSectionSummaryItem {
  id: string;
  contractType: ContractType;
  contractDate: string;
  status: ContractStatus;
  contractAmount: number;
  createdAt: string;
}

/**
 * 契約書セクションサマリー
 *
 * Task 59.2: detail-summary API契約書セクション統合
 * Requirements: 37.1, 37.2
 */
export interface ContractSectionSummary {
  totalCount: number;
  latestContracts: ContractSectionSummaryItem[];
}

// ============================================================================
// 工程表セクションサマリー型（detail-summary API用）
// ============================================================================

/**
 * 工程表セクションサマリーアイテム
 *
 * Task 62.2: detail-summary API工程表セクション統合
 * Requirements: 39.2, 39.3
 */
export interface ScheduleSectionSummaryItem {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
}

/**
 * 工程表セクションサマリー
 *
 * Task 62.2: detail-summary API工程表セクション統合
 * Requirements: 39.1, 39.2
 */
export interface ScheduleSectionSummary {
  totalCount: number;
  latestSchedules: ScheduleSectionSummaryItem[];
}

// ============================================================================
// 工事写真セクションサマリー型（detail-summary API用）
// ============================================================================

/**
 * 工事写真セクションサマリーアイテム（1アルバム分）
 *
 * Task 7.2 (construction-photo): detail-summary API工事写真セクション統合
 * バックエンド `ConstructionPhotoAlbumSummaryInfo` と同型（日時はJSON上文字列）。
 *
 * Requirements (construction-photo): 2.3
 */
export interface ConstructionPhotoSectionSummaryItem {
  id: string;
  projectId: string;
  name: string;
  memo: string | null;
  /** 代表写真のサムネイル署名付きURL（未生成・ストレージ未設定・署名失敗時は null） */
  thumbnailUrl: string | null;
  /** 代表写真のID（写真がなければ null） */
  representativeImageId: string | null;
  /** アルバム配下の写真項目数 */
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工事写真セクションサマリー
 *
 * プロジェクト詳細画面の工事写真パネルで表示する直近のアルバム一覧と総数を含む。
 * 既存セクション（`ScheduleSectionSummary` 等）と同型。
 *
 * Task 7.2 (construction-photo)
 * Requirements (construction-photo): 2.3
 */
export interface ProjectConstructionPhotoSummary {
  totalCount: number;
  latestAlbums: ConstructionPhotoSectionSummaryItem[];
}

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * プロジェクト一覧取得のオプション
 *
 * Task 22.1: SortField型の更新に伴うsortフィールドの変更
 * - 'id'を削除
 * - 'salesPersonName', 'constructionPersonName'を追加
 *
 * Requirements: 6.5
 */
export interface GetProjectsOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20） */
  limit?: number;
  /** フィルタ条件 */
  filter?: ProjectFilter;
  /** ソートフィールド */
  sort?:
    | 'name'
    | 'customerName'
    | 'salesPersonName'
    | 'constructionPersonName'
    | 'status'
    | 'createdAt'
    | 'updatedAt';
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
  if (filter?.tradingPartnerId) {
    params.append('tradingPartnerId', filter.tradingPartnerId);
  }
  // Requirements: 2.7, 2.8 - 終端ステータス除外フラグ
  if (filter?.excludeTerminalStatuses) {
    params.append('excludeTerminalStatuses', 'true');
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
 * Task 22.4: プロジェクトAPIクライアントに409エラーハンドリング追加
 * Requirements: 1.15, 1.16
 *
 * @param input - プロジェクト作成データ
 * @returns 作成されたプロジェクト情報
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - プロジェクト名重複（409）- `isDuplicateProjectNameErrorResponse(error.response)`で識別可能
 *
 * @example
 * // 基本的な使用法
 * const project = await createProject({
 *   name: '新規プロジェクト',
 *   tradingPartnerId: 'partner-id',
 *   salesPersonId: 'user-id',
 * });
 *
 * @example
 * // プロジェクト名重複エラーの処理
 * try {
 *   await createProject(input);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isDuplicateProjectNameErrorResponse(error.response)) {
 *       // プロジェクト名重複エラー
 *       console.log(`重複: ${error.response.projectName}`);
 *     }
 *   }
 * }
 */
export async function createProject(input: CreateProjectInput): Promise<ProjectInfo> {
  return apiClient.post<ProjectInfo>('/api/projects', input);
}

/**
 * プロジェクトを更新する
 *
 * Task 22.4: プロジェクトAPIクライアントに409エラーハンドリング追加
 * Requirements: 8.7, 8.8
 *
 * @param id - プロジェクトID（UUID）
 * @param input - プロジェクト更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新されたプロジェクト情報
 * @throws ApiError
 *   - バリデーションエラー（400）
 *   - 認証エラー（401）
 *   - 権限不足（403）
 *   - プロジェクトが見つからない（404）
 *   - 競合（409）- 楽観的排他制御エラーまたはプロジェクト名重複
 *     - プロジェクト名重複は`isDuplicateProjectNameErrorResponse(error.response)`で識別可能
 *
 * @example
 * // 基本的な使用法
 * const project = await updateProject(
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   { name: '更新された名前' },
 *   '2025-01-01T00:00:00.000Z'
 * );
 *
 * @example
 * // 409エラーの種類を判別する
 * try {
 *   await updateProject(id, input, expectedUpdatedAt);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isDuplicateProjectNameErrorResponse(error.response)) {
 *       // プロジェクト名重複エラー
 *       console.log(`重複: ${error.response.projectName}`);
 *     } else {
 *       // 楽観的排他制御エラー（他のユーザーが更新済み）
 *       console.log('データを再読み込みしてください');
 *     }
 *   }
 * }
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

/**
 * ステータス別プロジェクト件数を取得する
 *
 * Requirements: 23.1-23.6
 * 全プロジェクト（論理削除を除く）のステータス別件数と合計件数を取得する。
 * 検索条件・フィルタ条件は適用しない。
 *
 * @returns ステータス別件数と合計件数
 *
 * @example
 * const statusCounts = await getProjectStatusCounts();
 * console.log(statusCounts.counts.PREPARING); // 5
 * console.log(statusCounts.total); // 22
 */
export async function getProjectStatusCounts(): Promise<StatusCountsResponse> {
  return apiClient.get<StatusCountsResponse>('/api/projects/status-counts');
}

// ============================================================================
// プロジェクト詳細一括取得 (Requirement 29)
// ============================================================================

/**
 * プロジェクト詳細サマリー型
 *
 * Task 47.1: ProjectDetailSummary型の定義
 * Requirements: 29.2, 29.6
 */
export interface ProjectDetailSummary {
  /** プロジェクト基本情報 */
  project: ProjectDetail;
  /** ステータス変更履歴 */
  statusHistory: StatusHistoryResponse[];
  /** 各セクションサマリー */
  sections: {
    siteSurveys: ProjectSurveySummary;
    quantityTables: ProjectQuantityTableSummary;
    itemizedStatements: ProjectItemizedStatementSummary;
    estimateRequests: ProjectEstimateRequestSummary;
    estimates: EstimateSummary;
    contracts: ContractSectionSummary;
    schedules: ScheduleSectionSummary;
    executionBudget: ExecutionBudgetSectionInfo | null;
    /** 工事写真セクションサマリー（Task 7.2, construction-photo, Requirements 2.3） */
    constructionPhotos: ProjectConstructionPhotoSummary;
  };
}

/**
 * プロジェクト詳細サマリーを一括取得する
 *
 * Task 47.1: getProjectDetailSummary API関数の追加
 * Requirements: 29.2, 29.6
 *
 * プロジェクト基本情報、ステータス変更履歴、5つのセクションサマリーを
 * 1リクエストで取得する。従来の7リクエスト（2並列+5逐次）を置換。
 *
 * @param id - プロジェクトID（UUID）
 * @returns プロジェクト詳細サマリー
 * @throws ApiError プロジェクトが見つからない（404）、認証エラー（401）、権限不足（403）
 */
export async function getProjectDetailSummary(id: string): Promise<ProjectDetailSummary> {
  return apiClient.get<ProjectDetailSummary>(`/api/projects/${id}/detail-summary`);
}
