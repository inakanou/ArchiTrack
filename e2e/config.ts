/**
 * @fileoverview E2Eテスト用設定
 *
 * テスト環境の各種URLを一元管理します。
 * 環境変数でオーバーライド可能です。
 *
 * ポート設計:
 *   開発環境（打鍵用）: Backend 3000, Frontend 5173
 *   テスト環境（自動E2E）: Backend 3100, Frontend 5174
 *
 * @example
 * ```typescript
 * import { API_BASE_URL } from '../../config';
 *
 * const response = await request.get(`${API_BASE_URL}/health`);
 * ```
 */

/**
 * バックエンドAPIのベースURL
 *
 * テスト環境のデフォルトはポート3100（開発環境3000とは分離）
 * 環境変数 API_BASE_URL でオーバーライド可能
 */
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3100';

/**
 * フロントエンドのベースURL
 *
 * テスト環境のデフォルトはポート5174（開発環境5173とは分離）
 * 環境変数 BASE_URL でオーバーライド可能
 *
 * Note: Playwright設定でも同じ値がbaseURLとして設定されています
 */
export const FRONTEND_BASE_URL = process.env.BASE_URL || 'http://localhost:5174';
