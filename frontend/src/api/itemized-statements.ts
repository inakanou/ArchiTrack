/**
 * @fileoverview 内訳書用APIクライアント
 *
 * Task 4.1: 内訳書APIクライアントの実装
 *
 * Requirements:
 * - 1.3: 内訳書作成（POST /api/projects/:projectId/itemized-statements）
 * - 3.4: 内訳書一覧取得（GET /api/projects/:projectId/itemized-statements）
 * - 4.1: 内訳書詳細取得（GET /api/itemized-statements/:id）
 * - 7.3: 内訳書削除（DELETE /api/itemized-statements/:id）
 * - 10.4: 楽観的排他制御エラー（409 Conflict）
 */

import { apiClient } from './client';
import type {
  ProjectItemizedStatementSummary,
  PaginatedItemizedStatements,
  ItemizedStatementDetail,
  ItemizedStatementInfo,
  CreateItemizedStatementInput,
  ItemizedStatementSortableField,
  ItemizedStatementSortOrder,
} from '../types/itemized-statement.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * 内訳書一覧取得のオプション
 */
export interface GetItemizedStatementsOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20、最大: 100） */
  limit?: number;
  /** 検索キーワード（名前の部分一致） */
  search?: string;
  /** ソートフィールド（createdAt, name） */
  sort?: ItemizedStatementSortableField;
  /** ソート順序 */
  order?: ItemizedStatementSortOrder;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 直近N件の内訳書と総数を取得する
 *
 * プロジェクト詳細画面の内訳書セクションで使用します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param limit - 取得件数（デフォルト: 2、最大: 10）
 * @returns プロジェクト別内訳書サマリー（直近N件と総数）
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * @example
 * // デフォルト（直近2件）を取得
 * const summary = await getLatestItemizedStatements('project-id');
 *
 * @example
 * // 直近5件を取得
 * const summary = await getLatestItemizedStatements('project-id', 5);
 */
export async function getLatestItemizedStatements(
  projectId: string,
  limit: number = 2
): Promise<ProjectItemizedStatementSummary> {
  const params = new URLSearchParams();
  if (limit !== 2) {
    params.append('limit', String(limit));
  }

  const queryString = params.toString();
  const path = queryString
    ? `/api/projects/${projectId}/itemized-statements/latest?${queryString}`
    : `/api/projects/${projectId}/itemized-statements/latest`;

  return apiClient.get<ProjectItemizedStatementSummary>(path);
}

/**
 * 内訳書一覧を取得する
 *
 * 指定されたプロジェクトに紐付く内訳書の一覧を取得します。
 * ページネーション、検索、ソートに対応しています。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param options - 取得オプション（ページネーション、検索、ソート）
 * @returns ページネーション付き内訳書一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * Requirements: 3.4
 *
 * @example
 * // 基本的な取得
 * const result = await getItemizedStatements('project-id');
 *
 * @example
 * // フィルタ付き取得
 * const result = await getItemizedStatements('project-id', {
 *   page: 1,
 *   limit: 20,
 *   search: '内訳',
 *   sort: 'createdAt',
 *   order: 'desc',
 * });
 */
export async function getItemizedStatements(
  projectId: string,
  options: GetItemizedStatementsOptions = {}
): Promise<PaginatedItemizedStatements> {
  const { page, limit, search, sort, order } = options;

  // クエリパラメータを構築
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
    ? `/api/projects/${projectId}/itemized-statements?${queryString}`
    : `/api/projects/${projectId}/itemized-statements`;

  return apiClient.get<PaginatedItemizedStatements>(path);
}

/**
 * 内訳書詳細を取得する
 *
 * 内訳書の詳細情報（項目一覧を含む）を取得します。
 *
 * @param id - 内訳書ID（UUID）
 * @returns 内訳書詳細情報
 * @throws ApiError 内訳書が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * Requirements: 4.1
 *
 * @example
 * const detail = await getItemizedStatementDetail('is-123');
 * console.log(detail.items); // 項目一覧
 */
export async function getItemizedStatementDetail(id: string): Promise<ItemizedStatementDetail> {
  return apiClient.get<ItemizedStatementDetail>(`/api/itemized-statements/${id}`);
}

/**
 * 内訳書を作成する
 *
 * 指定されたプロジェクトに紐付く新しい内訳書を作成します。
 * 数量表をピボット集計して内訳書を生成します。
 *
 * @param projectId - プロジェクトID（UUID）
 * @param input - 内訳書作成データ
 * @returns 作成された内訳書情報
 * @throws ApiError バリデーションエラー（400）、認証エラー（401）、権限不足（403）、
 *                  数量表が見つからない（404）、同名重複（409）、オーバーフロー（422）
 *
 * Requirements: 1.3
 *
 * @example
 * const statement = await createItemizedStatement('project-id', {
 *   name: '第1回内訳書',
 *   quantityTableId: 'qt-123',
 * });
 */
export async function createItemizedStatement(
  projectId: string,
  input: CreateItemizedStatementInput
): Promise<ItemizedStatementInfo> {
  return apiClient.post<ItemizedStatementInfo>(
    `/api/projects/${projectId}/itemized-statements`,
    input
  );
}

/**
 * 内訳書を削除する（論理削除）
 *
 * 楽観的排他制御を使用して内訳書を論理削除します。
 *
 * @param id - 内訳書ID（UUID）
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 * @throws ApiError 内訳書が見つからない（404）、認証エラー（401）、
 *                  権限不足（403）、競合（409）
 *
 * Requirements: 7.3, 10.4
 *
 * @example
 * await deleteItemizedStatement('is-123', '2025-01-02T00:00:00.000Z');
 */
export async function deleteItemizedStatement(id: string, updatedAt: string): Promise<void> {
  return apiClient.delete<void>(`/api/itemized-statements/${id}`, {
    body: { updatedAt },
  });
}
