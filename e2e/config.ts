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

/**
 * 画面と同じオリジンを通す API のベースURL
 *
 * 画面を配信する nginx が `/api/` と `/csrf-token` を backend へ中継する
 * （user-authentication design.md「画面配信」）。認証の Cookie を伴う API の呼び出し
 * （ブラウザのコンテキストの Cookie を載せる `page.request` など）はこちらを使う。
 * `API_BASE_URL`（backend へ直接）は、認証の Cookie を要しない確認に限る。
 * CI では `API_BASE_URL` が `127.0.0.1` で画面が `localhost` のため、ブラウザは
 * 画面のオリジンで受け取った Cookie を `API_BASE_URL` へ送らない
 * （design.md「E2E の認証基盤の移行」）。
 */
export const SAME_ORIGIN_API_BASE_URL = FRONTEND_BASE_URL;
