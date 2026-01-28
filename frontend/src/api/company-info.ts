/**
 * @fileoverview 自社情報用APIクライアント
 *
 * Task 5.1: APIクライアントの実装
 *
 * Requirements:
 * - 9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
 * - 9.2: 登録済みデータを返却
 * - 9.3: 未登録時に空オブジェクトを返却
 * - 9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
 * - 9.5: 未存在時の新規作成
 * - 9.6: 存在時の更新
 * - 9.8: versionによる楽観的排他制御
 * - 9.9: version不一致時の409 Conflict
 * - 7.1: ネットワークエラー時のエラー処理
 * - 7.2: サーバーエラー（5xx）時のエラー処理
 * - 7.3: セッション期限切れ時のリダイレクト
 */

import { apiClient } from './client';
import type {
  CompanyInfo,
  CompanyInfoResponse,
  UpdateCompanyInfoInput,
} from '../types/company-info.types';

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 自社情報を取得する
 *
 * Requirements: 9.1, 9.2, 9.3
 *
 * @returns 自社情報（未登録時は空オブジェクト）
 * @throws ApiError
 *   - ネットワークエラー（0）: 通信失敗時
 *   - 認証エラー（401）: ログイン必要時
 *   - 権限不足（403）: 閲覧権限がない場合
 *   - サーバーエラー（500）: サーバー内部エラー時
 *
 * @example
 * // 基本的な使用
 * const companyInfo = await getCompanyInfo();
 * if (isCompanyInfo(companyInfo)) {
 *   console.log('登録済み:', companyInfo.companyName);
 * } else {
 *   console.log('未登録');
 * }
 */
export async function getCompanyInfo(): Promise<CompanyInfoResponse> {
  return apiClient.get<CompanyInfoResponse>('/api/company-info');
}

/**
 * 自社情報を保存する（作成または更新）
 *
 * 自社情報は1件のみなので、upsert（作成または更新）として動作します。
 * - version未指定: 新規作成
 * - version指定: 更新（楽観的排他制御）
 *
 * Requirements: 9.4, 9.5, 9.6, 9.8, 9.9
 *
 * @param input - 自社情報入力データ
 * @returns 作成/更新された自社情報
 * @throws ApiError
 *   - ネットワークエラー（0）: 通信失敗時
 *   - バリデーションエラー（400）: 入力データが不正な場合
 *   - 認証エラー（401）: ログイン必要時
 *   - 権限不足（403）: 更新権限がない場合
 *   - 競合エラー（409）: 楽観的排他制御で競合が発生した場合
 *   - サーバーエラー（500）: サーバー内部エラー時
 *
 * @example
 * // 新規作成（versionなし）
 * const created = await updateCompanyInfo({
 *   companyName: '株式会社テスト',
 *   address: '東京都渋谷区1-1-1',
 *   representative: '代表 太郎',
 * });
 *
 * @example
 * // 更新（version指定）
 * const updated = await updateCompanyInfo({
 *   companyName: '株式会社テスト更新',
 *   address: '東京都渋谷区2-2-2',
 *   representative: '代表 次郎',
 *   version: 1,
 * });
 */
export async function updateCompanyInfo(input: UpdateCompanyInfoInput): Promise<CompanyInfo> {
  return apiClient.put<CompanyInfo>('/api/company-info', input);
}
