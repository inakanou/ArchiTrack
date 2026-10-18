/**
 * @fileoverview E2E のアクセストークンの取得とログイン API の呼び出しの補助
 *
 * E2E の spec と補助が API で前提データを作るときの Bearer のアクセストークンは、すべて
 * この補助から得る（user-authentication タスク44.11、design.md「E2E の認証基盤の移行」）。
 * 補助の外で localStorage の `accessToken` を読んだり、ログイン API を直接呼んだりしない
 * （ログインそのものを検証するテストを除く）。
 *
 * 認証の方式が変わるときは、この補助の中身だけを差し替える。
 *
 * - `getAccessToken`: 現時点では画面のセッションの localStorage を読む。45.4 で、画面の
 *   セッションと別の Cookie の入れ物（Playwright の独立した要求のコンテキスト）でログイン API を
 *   呼び、応答のアクセストークンを返す方式へ差し替える。呼び出し側が利用者を渡すのはそのため
 * - `loginViaApi`: ログイン API を呼び、応答本文を返す。2FA の検証（46.2・47.4）と応答本文の
 *   リフレッシュトークンの撤去（45.5）は、この関数の中で受け止める
 * - `readStoredAccessToken`・`waitForStoredSessionTokens`: localStorage のトークンで画面の
 *   状態を観測している箇所のための読み出し。45.4 で、画面の表示と認証済みの API の成否の
 *   観測へ置き換える
 *
 * @module e2e/helpers/auth-api
 */

import type { APIRequestContext, Page } from '@playwright/test';
import { API_BASE_URL } from '../config';
import { TEST_USERS, type TestUser } from './test-users';

/**
 * 認証する利用者の指定
 *
 * 共有の役割のキー（'REGULAR_USER'・'ADMIN_USER' など）か、テストの中で作った利用者
 * （`createSessionUser` の戻り値など、メールアドレスとパスワードを持つもの）。
 */
export type AuthUserRef = keyof typeof TEST_USERS | Pick<TestUser, 'email' | 'password'>;

/** ログイン API の応答本文の利用者 */
export interface ApiLoginUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  [key: string]: unknown;
}

/** ログイン API の応答本文（ログインが完了したとき） */
export interface ApiLoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: ApiLoginUser;
  [key: string]: unknown;
}

/** `loginViaApi` の指定 */
export interface ApiLoginOptions {
  /** ログイン API のベースURL（省略時は `API_BASE_URL`） */
  baseUrl?: string;
}

function resolveUser(user: AuthUserRef): Pick<TestUser, 'email' | 'password'> {
  return typeof user === 'string' ? TEST_USERS[user] : user;
}

/** JWT のペイロードのメールアドレス（読めなければ null） */
function emailInToken(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown;
    };
    return typeof decoded.email === 'string' ? decoded.email : null;
  } catch {
    return null;
  }
}

/**
 * 利用者のアクセストークンを返す
 *
 * 現時点では、`user` でログイン済みの画面のセッション（`page`）の localStorage を読む。
 * トークンが無いとき、トークンの利用者が `user` と異なるときは失敗する（45.4 で `user` で
 * ログインし直す方式へ差し替えたときに、呼び出し側の指定の誤りで別の利用者の権限に
 * ならないよう、指定と画面のセッションの一致をここで確かめる）。
 *
 * @param page - `user` でログイン済みのページ
 * @param user - トークンを得る利用者
 * @returns Bearer に使うアクセストークン
 *
 * @example
 * ```typescript
 * await loginAsUser(page, 'REGULAR_USER');
 * const accessToken = await getAccessToken(page, 'REGULAR_USER');
 * ```
 */
export async function getAccessToken(page: Page, user: AuthUserRef): Promise<string> {
  const { email } = resolveUser(user);
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  if (!token) {
    throw new Error(
      `アクセストークンが取得できない: 画面のセッションに accessToken が無い（${email} でログイン済みであること）`
    );
  }
  const tokenEmail = emailInToken(token);
  if (tokenEmail?.toLowerCase() !== email.toLowerCase()) {
    throw new Error(
      `アクセストークンの利用者（${tokenEmail ?? '不明'}）が指定の利用者（${email}）と異なる`
    );
  }
  return token;
}

/**
 * ログイン API を呼び、応答本文を返す
 *
 * 応答が 200 でないとき、2FA の検証を要するとき（2FA 登録済みの利用者）は失敗する。
 * ログインそのもの（拒否・回数制限・Cookie の属性・応答時間など）を検証するテストは
 * この補助を使わず、ログイン API を直接呼ぶ。
 *
 * @param request - 要求のコンテキスト
 * @param user - ログインする利用者
 * @param options - ベースURL
 * @returns ログイン API の応答本文（アクセストークン・リフレッシュトークン・利用者）
 *
 * @example
 * ```typescript
 * const { accessToken } = await loginViaApi(request, 'ADMIN_USER');
 * ```
 */
export async function loginViaApi(
  request: APIRequestContext,
  user: AuthUserRef,
  options?: ApiLoginOptions
): Promise<ApiLoginResult> {
  const { email, password } = resolveUser(user);
  const baseUrl = options?.baseUrl ?? API_BASE_URL;
  const response = await request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (response.status() !== 200) {
    const body = await response.text().catch(() => '');
    throw new Error(`ログイン API が失敗した（${email}）: status ${response.status()} ${body}`);
  }
  const body = (await response.json()) as Partial<ApiLoginResult> & { requires2FA?: boolean };
  if (body.requires2FA) {
    // 2FA 登録済みの利用者の API のログインは、2FA の検証の補助（46.2・47.4）を設けるまで扱わない
    throw new Error(
      `ログイン API が 2FA の検証を求めた（${email}）: この補助は 2FA の検証に未対応`
    );
  }
  return body as ApiLoginResult;
}

/**
 * 画面のセッションの localStorage のアクセストークンを読む（画面の状態の観測用）
 *
 * Bearer に使うトークンは `getAccessToken` で得る。この関数は、localStorage のトークンの
 * 有無・変化で画面の状態を観測している箇所に限って使う。
 *
 * @param page - ページ
 * @returns localStorage の `accessToken`（無ければ null）
 */
export async function readStoredAccessToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('accessToken'));
}

/**
 * 画面のセッションの localStorage にリフレッシュトークンとアクセストークンが揃うまで待つ
 * （画面の状態の観測用）
 *
 * @param page - ページ
 * @param options - `page.waitForFunction` の待機の上限と間隔
 */
export async function waitForStoredSessionTokens(
  page: Page,
  options: { timeout: number; polling: number }
): Promise<void> {
  await page.waitForFunction(
    () =>
      localStorage.getItem('refreshToken') !== null && localStorage.getItem('accessToken') !== null,
    options
  );
}
