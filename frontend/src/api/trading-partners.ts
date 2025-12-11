/**
 * @fileoverview 取引先用APIクライアント
 *
 * Task 8.2: フォーム送信とエラーハンドリングの実装
 * Task 18.1: 取引先オートコンプリートAPI連携の実装
 *
 * Requirements:
 * - 2.7: 有効なデータを入力して保存ボタンクリックで新しい取引先レコードを作成
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合のエラー表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー表示
 * - 8.1: ネットワークエラー時の再試行ボタン表示
 * - 8.2: サーバーエラー（5xx）時のメッセージ表示
 * - 8.4: ToastNotificationでエラー通知
 * - 22.1: 顧客種別を持つ取引先をオートコンプリート候補として表示
 * - 22.3: 入力文字列で取引先名・フリガナの部分一致検索
 * - 16.5: 候補は最大10件まで表示
 */

import { apiClient } from './client';
import type {
  TradingPartnerInfo,
  TradingPartnerDetail,
  PaginatedTradingPartners,
  CreateTradingPartnerInput,
  UpdateTradingPartnerInput,
  TradingPartnerFilter,
  TradingPartnerSearchResult,
} from '../types/trading-partner.types';

// ============================================================================
// 型定義（クエリパラメータ用）
// ============================================================================

/**
 * 取引先一覧取得のオプション
 */
export interface GetTradingPartnersOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20） */
  limit?: number;
  /** フィルタ条件 */
  filter?: TradingPartnerFilter;
  /** ソートフィールド */
  sort?: 'id' | 'name' | 'nameKana' | 'createdAt' | 'updatedAt';
  /** ソート順序 */
  order?: 'asc' | 'desc';
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 取引先一覧を取得する
 *
 * @param options - 取得オプション（ページネーション、フィルタ、ソート）
 * @returns ページネーション付き取引先一覧
 * @throws ApiError バリデーションエラー、認証エラー、権限不足
 *
 * @example
 * // 基本的な取得
 * const result = await getTradingPartners();
 *
 * @example
 * // フィルタ付き取得
 * const result = await getTradingPartners({
 *   page: 1,
 *   limit: 20,
 *   filter: { search: 'テスト', type: ['CUSTOMER'] },
 *   sort: 'nameKana',
 *   order: 'asc',
 * });
 */
export async function getTradingPartners(
  options: GetTradingPartnersOptions = {}
): Promise<PaginatedTradingPartners> {
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
  if (filter?.type && filter.type.length > 0) {
    params.append('type', filter.type.join(','));
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (order) {
    params.append('order', order);
  }

  const queryString = params.toString();
  const path = queryString ? `/api/trading-partners?${queryString}` : '/api/trading-partners';

  return apiClient.get<PaginatedTradingPartners>(path);
}

/**
 * 取引先詳細を取得する
 *
 * @param id - 取引先ID（UUID）
 * @returns 取引先詳細情報
 * @throws ApiError 取引先が見つからない（404）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const partner = await getTradingPartner('550e8400-e29b-41d4-a716-446655440000');
 */
export async function getTradingPartner(id: string): Promise<TradingPartnerDetail> {
  return apiClient.get<TradingPartnerDetail>(`/api/trading-partners/${id}`);
}

/**
 * 取引先を作成する
 *
 * @param input - 取引先作成データ
 * @returns 作成された取引先情報
 * @throws ApiError バリデーションエラー（400）、重複エラー（409）、認証エラー（401）、権限不足（403）
 *
 * @example
 * const partner = await createTradingPartner({
 *   name: '新規取引先',
 *   nameKana: 'シンキトリヒキサキ',
 *   types: ['CUSTOMER'],
 *   address: '東京都渋谷区1-1-1',
 * });
 */
export async function createTradingPartner(
  input: CreateTradingPartnerInput
): Promise<TradingPartnerInfo> {
  return apiClient.post<TradingPartnerInfo>('/api/trading-partners', input);
}

/**
 * 取引先を更新する
 *
 * @param id - 取引先ID（UUID）
 * @param input - 取引先更新データ
 * @param expectedUpdatedAt - 楽観的排他制御用の期待される更新日時（ISO8601形式）
 * @returns 更新された取引先情報
 * @throws ApiError 取引先が見つからない（404）、バリデーションエラー（400）、重複エラー（409）、競合（409）
 *
 * @example
 * const partner = await updateTradingPartner(
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   { name: '更新された名前' },
 *   '2025-01-01T00:00:00.000Z'
 * );
 */
export async function updateTradingPartner(
  id: string,
  input: Omit<UpdateTradingPartnerInput, 'expectedUpdatedAt'>,
  expectedUpdatedAt: string
): Promise<TradingPartnerInfo> {
  return apiClient.put<TradingPartnerInfo>(`/api/trading-partners/${id}`, {
    ...input,
    expectedUpdatedAt,
  });
}

/**
 * 取引先を削除する（論理削除）
 *
 * @param id - 取引先ID（UUID）
 * @throws ApiError 取引先が見つからない（404）、使用中エラー（409）、認証エラー（401）、権限不足（403）
 *
 * @example
 * await deleteTradingPartner('550e8400-e29b-41d4-a716-446655440000');
 */
export async function deleteTradingPartner(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/trading-partners/${id}`);
}

/**
 * 取引先を検索する（オートコンプリート用）
 *
 * @param query - 検索キーワード（取引先名・フリガナの部分一致）
 * @param type - 取引先種別でフィルタ（任意）
 * @param limit - 取得件数（デフォルト: 10）
 * @returns 検索結果の配列
 * @throws ApiError 認証エラー（401）、権限不足（403）
 *
 * @example
 * const results = await searchTradingPartners('テスト', ['CUSTOMER'], 5);
 */
export async function searchTradingPartners(
  query: string,
  type?: string[],
  limit: number = 10
): Promise<TradingPartnerSearchResult[]> {
  const params = new URLSearchParams();
  params.append('q', query);
  if (type && type.length > 0) {
    params.append('type', type.join(','));
  }
  params.append('limit', String(limit));

  return apiClient.get<TradingPartnerSearchResult[]>(
    `/api/trading-partners/search?${params.toString()}`
  );
}

/**
 * プロジェクト顧客選択用の取引先オートコンプリート検索
 *
 * Task 18.1: 取引先オートコンプリートAPI連携の実装
 *
 * - GET /api/trading-partners/search エンドポイントへ接続
 * - 取引先種別に「顧客」を含む取引先をフィルタリング
 * - 取引先名またはフリガナでの部分一致検索
 *
 * Requirements:
 * - 22.1: 顧客種別を持つ取引先をオートコンプリート候補として表示
 * - 22.3: 入力文字列で取引先名・フリガナの部分一致検索
 * - 16.5: 候補は最大10件まで表示
 *
 * @param query - 検索キーワード（取引先名・フリガナの部分一致）
 * @param limit - 取得件数（デフォルト: 10）
 * @returns 検索結果の配列（顧客種別を含む取引先のみ）
 * @throws ApiError
 *   - ネットワークエラー（0）: 通信失敗時
 *   - 認証エラー（401）: ログイン必要時
 *   - 権限不足（403）: 閲覧権限がない場合
 *   - 機能未実装（404）: 取引先管理機能が未実装の場合
 *   - サーバーエラー（500）: サーバー内部エラー時
 *
 * @example
 * // 基本的な使用
 * const results = await searchTradingPartnersForAutocomplete('テスト');
 *
 * @example
 * // 取得件数を指定
 * const results = await searchTradingPartnersForAutocomplete('テスト', 5);
 */
export async function searchTradingPartnersForAutocomplete(
  query: string,
  limit: number = 10
): Promise<TradingPartnerSearchResult[]> {
  // 顧客種別（CUSTOMER）を含む取引先のみをフィルタリング
  return searchTradingPartners(query, ['CUSTOMER'], limit);
}
