/**
 * @fileoverview E2E のアクセストークンの取得とログイン API の呼び出しの補助
 *
 * E2E の spec と補助が API で前提データを作るときの Bearer のアクセストークンは、すべて
 * この補助から得る（user-authentication タスク44.11、design.md「E2E の認証基盤の移行」）。
 * 補助の外で画面のセッションのトークンを読んだり、ログイン API を直接呼んだりしない
 * （ログインそのものを検証するテストを除く）。
 *
 * 認証の方式が変わるときは、この補助の中身だけを差し替える。
 *
 * - `getAccessToken`: 画面のセッションと別の Cookie の入れ物（Playwright の独立した要求のコンテキスト）で
 *   ログイン API を呼び、応答のアクセストークンを返す（45.4）。画面の Cookie によるリフレッシュを
 *   共有しないので、Web Locks で直列化されない二重のリフレッシュによる再利用の検知を起こさない
 * - `loginViaApi`: ログイン API を呼び、応答本文を返す。2FA の検証（46.2・47.4）と応答本文の
 *   リフレッシュトークンの撤去（45.5）は、この関数の中で受け止める
 * - `completeApiLogin`: ログイン API を呼び、2FA の検証を求められたら資格と TOTP のコードで
 *   検証して、ログインが完了した応答（ログインまたは 2FA の検証の応答）を返す（47.4）。
 *   コードを計算する前に利用者の最後に使った時間ステップを戻すので、同じ利用者の同じ 30 秒の中の
 *   続けてのログインも再使用として拒否されない
 * - `fetchSessionUser`・`waitForAuthenticatedSession`: 画面の状態の観測。アクセストークンは画面の
 *   メモリだけにあり永続ストレージに無いため（要件33.10）、画面のセッションで認証済みの API
 *   （`GET /api/v1/auth/me`）を呼べるかで観測する
 *
 * @module e2e/helpers/auth-api
 */

import { expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { API_BASE_URL, FRONTEND_BASE_URL, SAME_ORIGIN_API_BASE_URL } from '../config';
import { TEST_USERS, type TestUser } from './test-users';
import { E2E_TOTP_SECRET, prepareTotpCode } from './two-factor-totp';

/**
 * 認証する利用者の指定
 *
 * 共有の役割のキー（'REGULAR_USER'・'ADMIN_USER' など）か、テストの中で作った利用者
 * （`createSessionUser` の戻り値など、メールアドレスとパスワードを持つもの）。
 */
export type AuthUserRef =
  | keyof typeof TEST_USERS
  | (Pick<TestUser, 'email' | 'password'> &
      Partial<Pick<TestUser, 'totpSecret' | 'twoFactorEnabled'>>);

/** ログイン API の応答本文の利用者 */
export interface ApiLoginUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  [key: string]: unknown;
}

/** ログイン API の応答本文（ログインが完了したとき。リフレッシュトークンは本文に含まれず Cookie だけで渡る） */
export interface ApiLoginResult {
  accessToken: string;
  expiresIn?: number;
  user: ApiLoginUser;
  [key: string]: unknown;
}

/** `loginViaApi` の指定 */
export interface ApiLoginOptions {
  /** ログイン API のベースURL（省略時は `API_BASE_URL`） */
  baseUrl?: string;
}

function resolveUser(
  user: AuthUserRef
): Pick<TestUser, 'email' | 'password' | 'totpSecret' | 'twoFactorEnabled'> {
  return typeof user === 'string' ? TEST_USERS[user] : user;
}

/**
 * ログイン API を呼び、2FA の検証を求められたら資格と TOTP のコードで検証して、
 * ログインが完了した応答を返す
 *
 * - ログインの応答が 200 でないとき、2FA の検証の応答が 200 でないときは失敗する
 * - 2FA 登録済み（`twoFactorEnabled` が false でない。既定）の利用者は、ログインの応答が 2FA の
 *   検証を求めることを前提とし（求めなければ失敗する）、`prepareTotpCode` で最後に使った
 *   時間ステップを戻してから既知の秘密鍵（`totpSecret`、省略時は E2E_TOTP_SECRET）でコードを計算し、
 *   `POST /api/v1/auth/verify-2fa` に `{ challengeToken, code }` を送る
 * - 2FA 未登録（`twoFactorEnabled: false`）の利用者は、ログインの応答が 2FA の検証を求めないことを
 *   前提とし、ログインの応答をそのまま返す
 *
 * リフレッシュトークンの Cookie は `request` の入れ物に入る（応答の Set-Cookie も返す応答で読める）。
 *
 * @param request - 要求のコンテキスト（Cookie の入れ物）
 * @param user - ログインする利用者
 * @param baseUrl - ログイン・2FA の検証の API のベースURL
 * @returns ログインが完了した応答（2FA 未登録はログインの応答、登録済みは 2FA の検証の応答）
 */
export async function completeApiLogin(
  request: APIRequestContext,
  user: AuthUserRef,
  baseUrl: string
): Promise<APIResponse> {
  const { email, password, totpSecret, twoFactorEnabled } = resolveUser(user);
  const response = await request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (response.status() !== 200) {
    const body = await response.text().catch(() => '');
    throw new Error(`ログイン API が失敗した（${email}）: status ${response.status()} ${body}`);
  }
  const body = (await response.json()) as { requires2FA?: unknown; challengeToken?: unknown };
  // 2FA 登録済み（既定）の利用者はログインの応答が 2FA の検証を求めることを、未登録の利用者は
  // 求めないことを前提とし、食い違えば失敗する（観測で黙って経路を切り替えない）
  const expectsTwoFactor = twoFactorEnabled !== false;
  if ((body.requires2FA === true) !== expectsTwoFactor) {
    throw new Error(
      `ログイン API の 2FA の要求（requires2FA: ${String(body.requires2FA)}）が` +
        `利用者 ${email} の 2FA の登録の状態（${expectsTwoFactor ? '登録済み' : '未登録'}）と食い違う`
    );
  }
  if (!expectsTwoFactor) {
    return response;
  }
  if (typeof body.challengeToken !== 'string' || body.challengeToken === '') {
    throw new Error(`ログイン API の 2FA の要求に資格が無い（${email}）`);
  }
  const code = await prepareTotpCode(email, totpSecret ?? E2E_TOTP_SECRET);
  const verified = await request.post(`${baseUrl}/api/v1/auth/verify-2fa`, {
    data: { challengeToken: body.challengeToken, code },
  });
  if (verified.status() !== 200) {
    const verifiedBody = await verified.text().catch(() => '');
    throw new Error(
      `2FA の検証 API が失敗した（${email}）: status ${verified.status()} ${verifiedBody}`
    );
  }
  return verified;
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
 * 画面のセッションと別の Cookie の入れ物（独立した要求のコンテキスト）で `user` としてログイン API を
 * 呼び、応答のアクセストークンを返す。画面のセッション（`page`）の Cookie・メモリには触れない。
 * トークンの利用者が `user` と異なるときは失敗する。
 *
 * @param _page - 呼び出し側の画面（互換のための引数。トークンは画面のセッションから読まない）
 * @param user - トークンを得る利用者
 * @returns Bearer に使うアクセストークン
 *
 * @example
 * ```typescript
 * await loginAsUser(page, 'REGULAR_USER');
 * const accessToken = await getAccessToken(page, 'REGULAR_USER');
 * ```
 */
export async function getAccessToken(_page: Page, user: AuthUserRef): Promise<string> {
  const { email } = resolveUser(user);
  const isolated = await playwrightRequest.newContext();
  try {
    const { accessToken } = await loginViaApi(isolated, user);
    if (!accessToken) {
      throw new Error(
        `アクセストークンが取得できない: ログイン API の応答に accessToken が無い（${email}）`
      );
    }
    const tokenEmail = emailInToken(accessToken);
    if (tokenEmail?.toLowerCase() !== email.toLowerCase()) {
      throw new Error(
        `アクセストークンの利用者（${tokenEmail ?? '不明'}）が指定の利用者（${email}）と異なる`
      );
    }
    return accessToken;
  } finally {
    await isolated.dispose();
  }
}

/**
 * ログイン API を呼び、ログインが完了した応答本文を返す
 *
 * 2FA 登録済みの利用者は、2FA の検証まで行い、その応答本文を返す（`completeApiLogin`）。
 * 応答が 200 でないときは失敗する。ログインそのもの（拒否・回数制限・Cookie の属性・応答時間・
 * 2FA の要求の本文など）を検証するテストはこの補助を使わず、ログイン API を直接呼ぶ。
 *
 * @param request - 要求のコンテキスト
 * @param user - ログインする利用者
 * @param options - ベースURL
 * @returns ログインが完了した応答本文（アクセストークン・利用者）
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
  const response = await completeApiLogin(request, user, options?.baseUrl ?? API_BASE_URL);
  return (await response.json()) as ApiLoginResult;
}

/** 画面のセッションで認証済みの API が返した利用者 */
export interface SessionUserObservation {
  status: number;
  email: string | null;
}

/**
 * 画面のセッション（メモリのアクセストークン）で `GET /api/v1/auth/me` を呼び、結果を返す
 * （画面の状態の観測用）
 *
 * 画面の API クライアント（`window.__apiClient`）を通すので、期限切れのときは画面と同じく
 * Cookie によるリフレッシュを経て呼ぶ。認証されていなければ status が 401 になる。
 *
 * @param page - ページ
 */
export async function fetchSessionUser(page: Page): Promise<SessionUserObservation> {
  return page.evaluate(async () => {
    const client = (window as unknown as { __apiClient?: { get: (p: string) => Promise<unknown> } })
      .__apiClient;
    if (!client) {
      return { status: 0, email: null };
    }
    try {
      const user = (await client.get('/api/v1/auth/me')) as { email?: unknown };
      return { status: 200, email: typeof user.email === 'string' ? user.email : null };
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number((error as { statusCode: unknown }).statusCode)
          : 0;
      return { status, email: null };
    }
  });
}

/**
 * 画面のセッションが認証済みか（認証済みの API が成功するか）を一度だけ確かめる
 *
 * 2FA 未登録・初回のパスワード変更中の利用者は `/api/v1/auth/me` も状態の照合で 403
 * （`TWO_FACTOR_SETUP_REQUIRED`・`PASSWORD_CHANGE_REQUIRED`）になる（user-authentication 要件34.2・37.7、
 * タスク47.6）。そのコードはアクセストークンの検証を通った後にだけ返るため、認証済みとして扱う。
 *
 * @param page - ページ
 */
async function isSessionAuthenticated(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const client = (window as unknown as { __apiClient?: { get: (p: string) => Promise<unknown> } })
      .__apiClient;
    if (!client || window.location.pathname.startsWith('/login')) {
      return false;
    }
    try {
      await client.get('/api/v1/auth/me');
      return true;
    } catch (error) {
      const response =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { code?: unknown } }).response
          : undefined;
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number((error as { statusCode: unknown }).statusCode)
          : 0;
      return (
        status === 403 &&
        (response?.code === 'TWO_FACTOR_SETUP_REQUIRED' ||
          response?.code === 'PASSWORD_CHANGE_REQUIRED')
      );
    }
  });
}

/**
 * 画面のセッションが認証済み（認証済みの API が成功する）になるまで待つ（画面の状態の観測用）
 *
 * 認証済みの判定は {@link isSessionAuthenticated} を参照。上限までに認証済みにならなければ失敗する。
 *
 * 確かめは非同期（API の応答を待つ）のため、`page.waitForFunction` を使わない。`waitForFunction` は
 * 述語の戻り値の真偽で待ちを終えるので、非同期の述語が返す Promise（常に真）で初回に終わり、
 * 確かめの結果が偽でも待たずに戻る（再読み込みのセッションの復元の途中で API を送ってしまう）。
 * 確かめの途中の画面の遷移（実行の文脈の破棄）も再試行の対象とする。
 *
 * @param page - ページ
 * @param options - 待機の上限と間隔
 */
export async function waitForAuthenticatedSession(
  page: Page,
  options: { timeout: number; polling: number }
): Promise<void> {
  await expect(async () => {
    expect(await isSessionAuthenticated(page), '画面のセッションが認証済みになる').toBe(true);
  }).toPass({ timeout: options.timeout, intervals: [options.polling] });
}

/**
 * CSRF トークンを取得する（画面と同じオリジンの `GET /csrf-token`。Cookie `csrf-token` も同じ入れ物に入る）
 *
 * @param request - 要求のコンテキスト（Cookie の入れ物）
 * @returns 応答本文の CSRF トークン
 */
export async function getCsrfToken(
  request: APIRequestContext,
  options?: { timeout?: number }
): Promise<string> {
  const csrfResponse = await request.get(`${SAME_ORIGIN_API_BASE_URL}/csrf-token`, {
    timeout: options?.timeout,
  });
  if (csrfResponse.status() !== 200) {
    throw new Error(`CSRF トークンが取得できない: status ${csrfResponse.status()}`);
  }
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken?: string };
  if (!csrfToken) {
    throw new Error('CSRF トークンの応答に csrfToken が無い');
  }
  return csrfToken;
}

/**
 * Cookie と CSRF トークンでリフレッシュ API を呼ぶ（画面と同じ契約。要件33.8, 33.12）
 *
 * `request` の Cookie の入れ物のリフレッシュトークンを使う（ブラウザのコンテキストの
 * `page.request` なら画面と同じ Cookie。ローテーション後の Cookie も同じ入れ物に入る）。
 * 画面と同じオリジン（nginx の中継）を通し、`X-CSRF-Token` と、画面のオリジンの `Origin` を付ける。
 * 画面と同じセッションで画面と同時にリフレッシュすると再利用の検知になるため、画面が
 * リフレッシュしない間に限って使う。
 *
 * @param request - 要求のコンテキスト（Cookie の入れ物）
 * @param options - 取得済みの CSRF トークン（省略時は取得する）と待機の上限
 * @returns リフレッシュ API の応答
 */
export async function refreshWithCookie(
  request: APIRequestContext,
  options?: { csrfToken?: string; timeout?: number }
): Promise<APIResponse> {
  const csrfToken = options?.csrfToken ?? (await getCsrfToken(request, options));
  return request.post(`${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/refresh`, {
    headers: { 'X-CSRF-Token': csrfToken, Origin: FRONTEND_BASE_URL },
    timeout: options?.timeout,
  });
}
