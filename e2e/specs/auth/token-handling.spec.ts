/**
 * @fileoverview トークンの取り扱い（種別の区別・失効・ブラウザでの保持）の E2E テスト
 *
 * user-authentication タスク45.6。画面と API の観測で、トークンの受け渡しと失効を確かめる。
 *
 * Requirements coverage (user-authentication):
 * - 33.1: リフレッシュトークンを Bearer にした保護 API の要求が 401 になる
 * - 33.4: ログアウトの後、ログアウトで提示した Cookie によるリフレッシュが 401 になる
 * - 33.5: 全デバイスのログアウト・パスワードの変更の後、それまでの全てのセッションのリフレッシュが 401 になる
 * - 33.6: 置き換え済みの Cookie によるリフレッシュが 401 になり、そこから派生した Cookie も失効して
 *   画面がログイン画面へ戻る
 * - 33.8: リフレッシュトークンの Cookie が HttpOnly で、スクリプトから読める場所に無い
 * - 33.9: ログイン・リフレッシュの応答本文にリフレッシュトークンが無い
 * - 33.10: アクセストークンがブラウザの永続ストレージに無い
 * - 33.11: ログイン後に再読み込みしてもログイン画面へ戻らない
 * - 33.12: CSRF のヘッダーの無い（一致しない・送信元の違う）リフレッシュとログアウトが 403 になる
 *
 * 33.2・33.3・33.7 は backend の単体・統合テストが担う（design.md「Testing Strategy」）。
 * 33.5 のうちパスワードのリセットは本 spec で扱わない。
 *
 * ログアウト・全デバイスのログアウト・パスワードの変更・再利用の検知は系列を失効させるため、
 * 全てテストの中で作る利用者（`createSessionUser`）のセッションで行い、共有の役割の Cookie には触れない。
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page, Response } from '@playwright/test';
import { API_BASE_URL, FRONTEND_BASE_URL, SAME_ORIGIN_API_BASE_URL } from '../../config';
import { loginAsUser } from '../../helpers/auth-actions';
import {
  fetchSessionUser,
  getCsrfToken,
  loginViaApi,
  refreshWithCookie,
  waitForAuthenticatedSession,
} from '../../helpers/auth-api';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_PATH = '/api/v1/auth/refresh';

/** JWT の形（header.payload.signature）の文字列 */
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

/** 独立した要求のコンテキストでログインしたセッション */
interface ApiSession {
  context: APIRequestContext;
  accessToken: string;
}

/** 開いた要求のコンテキスト（テストの終わりに閉じる） */
const openedRequestContexts: APIRequestContext[] = [];

async function newRequestContext(
  options?: Parameters<typeof playwrightRequest.newContext>[0]
): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext(options);
  openedRequestContexts.push(context);
  return context;
}

/**
 * 画面と別の Cookie の入れ物でログインする（画面と同じオリジンを通し、Cookie を入れ物に受け取る）
 */
async function loginInIsolatedContext(user: SessionUser): Promise<ApiSession> {
  const context = await newRequestContext();
  const { accessToken } = await loginViaApi(context, user, { baseUrl: SAME_ORIGIN_API_BASE_URL });
  assertPrepared(accessToken, 'ログイン API の応答のアクセストークン');
  return { context, accessToken };
}

/** 要求のコンテキストの入れ物にあるリフレッシュトークンの Cookie の値 */
async function refreshCookieOfRequestContext(context: APIRequestContext): Promise<string> {
  const { cookies } = await context.storageState();
  const cookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
  assertPrepared(cookie?.value, 'ログインで受け取ったリフレッシュトークンの Cookie');
  return cookie.value;
}

/** ブラウザのコンテキストにあるリフレッシュトークンの Cookie */
async function refreshCookieOfBrowser(context: BrowserContext) {
  const cookie = (await context.cookies()).find((c) => c.name === REFRESH_COOKIE_NAME);
  assertPrepared(cookie, 'ブラウザのリフレッシュトークンの Cookie');
  return cookie;
}

/**
 * 指定のリフレッシュトークンの Cookie だけを持つ要求のコンテキスト（保持した Cookie の再提示に使う）
 */
async function contextHoldingRefreshCookie(value: string): Promise<APIRequestContext> {
  return newRequestContext({
    storageState: {
      cookies: [
        {
          name: REFRESH_COOKIE_NAME,
          value,
          domain: new URL(FRONTEND_BASE_URL).hostname,
          path: REFRESH_COOKIE_PATH,
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Strict',
        },
      ],
      origins: [],
    },
  });
}

/** 応答した要求に載っていたリフレッシュトークンの Cookie の値 */
async function presentedRefreshCookie(response: Response): Promise<string | null> {
  const cookieHeader = (await response.request().headerValue('cookie')) ?? '';
  const match = /(?:^|;\s*)refreshToken=([^;]*)/.exec(cookieHeader);
  return match?.[1] ? match[1] : null;
}

function isPost(response: Response, pathname: string): boolean {
  return new URL(response.url()).pathname === pathname && response.request().method() === 'POST';
}

/** 画面のリフレッシュの応答（指定の Cookie を提示したもの）を待つ */
function waitForRefreshPresenting(page: Page, cookieValue: string): Promise<Response> {
  return page.waitForResponse(
    async (response) =>
      isPost(response, REFRESH_PATH) && (await presentedRefreshCookie(response)) === cookieValue,
    { timeout: getTimeout(20000) }
  );
}

/** スクリプトから読める保存場所（localStorage・sessionStorage・document.cookie）の中身 */
async function scriptReadableStorage(page: Page): Promise<{ values: string[]; cookie: string }> {
  return page.evaluate(() => {
    const values: string[] = [];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) {
          values.push(`${key}=${storage.getItem(key) ?? ''}`);
        }
      }
    }
    return { values, cookie: document.cookie };
  });
}

/** スクリプトから読める場所に、アクセストークン・リフレッシュトークンが無いことを主張する */
async function expectNoTokenInScriptReadableStorage(
  page: Page,
  tokens: { accessToken: string; refreshToken: string }
): Promise<void> {
  const { values, cookie } = await scriptReadableStorage(page);
  for (const entry of values) {
    expect(entry, 'ブラウザのストレージにアクセストークンがある（要件33.10）').not.toContain(
      tokens.accessToken
    );
    expect(entry, 'ブラウザのストレージにリフレッシュトークンがある（要件33.8）').not.toContain(
      tokens.refreshToken
    );
    expect(entry, 'ブラウザのストレージに JWT の形の値がある（要件33.8, 33.10）').not.toMatch(
      JWT_PATTERN
    );
  }
  expect(cookie, 'document.cookie からリフレッシュトークンが読める（要件33.8）').not.toContain(
    `${REFRESH_COOKIE_NAME}=`
  );
  expect(cookie).not.toContain(tokens.refreshToken);
}

/** Bearer で自分の利用者を取得する（backend へ直接。Cookie を要しない） */
function getMe(context: APIRequestContext, token: string) {
  return context.get(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test.describe('トークンの取り扱い（要件33）', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    while (openedRequestContexts.length > 0) {
      await openedRequestContexts.pop()?.dispose();
    }
  });

  test.afterAll(async () => {
    await deleteSessionUsers();
  });

  /**
   * @requirement user-authentication/REQ-33.8
   * @requirement user-authentication/REQ-33.9
   * @requirement user-authentication/REQ-33.10
   * @requirement user-authentication/REQ-33.11
   */
  test('ログイン後の再読み込みでログイン画面へ戻らず、トークンはスクリプトから読める場所に無い', async ({
    page,
    context,
  }) => {
    const user = await createSessionUser('REGULAR_USER');

    // 利用者は 2FA 登録済みのため、トークンはログインの完了（2FA の検証）の応答で発行される
    const loginResponsePromise = page.waitForResponse(
      (response) => isPost(response, '/api/v1/auth/verify-2fa'),
      { timeout: getTimeout(20000) }
    );
    await loginAsUser(page, user);
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    const loginBody = (await loginResponse.json()) as Record<string, unknown>;

    // 要件33.9: 応答本文にリフレッシュトークンが無く、アクセストークンはある
    expect(loginBody).not.toHaveProperty('refreshToken');
    const accessToken = typeof loginBody.accessToken === 'string' ? loginBody.accessToken : null;
    assertPrepared(accessToken, 'ログインの応答本文のアクセストークン');

    // 要件33.8: リフレッシュトークンは HttpOnly の Cookie で、認証の経路だけに送られる
    const loginCookie = await refreshCookieOfBrowser(context);
    expect(loginCookie.httpOnly).toBe(true);
    expect(loginCookie.sameSite).toBe('Strict');
    expect(loginCookie.path).toBe(REFRESH_COOKIE_PATH);

    // 要件33.8・33.10: スクリプトから読める場所にトークンが無い
    await expectNoTokenInScriptReadableStorage(page, {
      accessToken,
      refreshToken: loginCookie.value,
    });

    // 要件33.11: 再読み込みでメモリのトークンが消えても、Cookie のリフレッシュで認証状態を復元する
    const refreshOnReload = waitForRefreshPresenting(page, loginCookie.value);
    await page.reload();
    const refreshResponse = await refreshOnReload;
    expect(refreshResponse.status()).toBe(200);
    const refreshBody = (await refreshResponse.json()) as Record<string, unknown>;

    // 要件33.9: リフレッシュの応答本文にもリフレッシュトークンが無い
    expect(refreshBody).not.toHaveProperty('refreshToken');
    const refreshedAccessToken =
      typeof refreshBody.accessToken === 'string' ? refreshBody.accessToken : null;
    assertPrepared(refreshedAccessToken, 'リフレッシュの応答本文のアクセストークン');

    await waitForAuthenticatedSession(page, { timeout: getTimeout(15000), polling: 500 });
    await expect(page).not.toHaveURL(/\/login/);
    const sessionUser = await fetchSessionUser(page);
    expect(sessionUser).toEqual({ status: 200, email: user.email });

    // 再読み込みの後も、置き換えた Cookie は HttpOnly のままで、トークンはスクリプトから読めない
    const rotatedCookie = await refreshCookieOfBrowser(context);
    expect(rotatedCookie.value).not.toBe(loginCookie.value);
    expect(rotatedCookie.httpOnly).toBe(true);
    await expectNoTokenInScriptReadableStorage(page, {
      accessToken: refreshedAccessToken,
      refreshToken: rotatedCookie.value,
    });
  });

  /**
   * @requirement user-authentication/REQ-33.4
   */
  test('ログアウトの後、ログアウトで提示した Cookie によるリフレッシュが 401 になる', async ({
    page,
  }) => {
    const user = await createSessionUser('REGULAR_USER');
    await loginAsUser(page, user);
    await page.goto('/profile');

    const logoutResponsePromise = page.waitForResponse(
      (response) => isPost(response, '/api/v1/auth/logout'),
      { timeout: getTimeout(20000) }
    );
    await page.getByRole('button', { name: /Test User|user@example\.com/i }).click();
    await page.getByRole('menuitem', { name: /ログアウト/i }).click();
    const logoutResponse = await logoutResponsePromise;
    expect(logoutResponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });

    // ログアウトの要求に載っていた Cookie（このセッションのリフレッシュトークン）を保持しておく
    const presented = await presentedRefreshCookie(logoutResponse);
    assertPrepared(presented, 'ログアウトの要求に載っていたリフレッシュトークンの Cookie');
    await page.goto('about:blank');

    // 要件33.4: 保持した Cookie を画面と同じ契約（Cookie・CSRF・Origin）で提示しても使えない
    const retained = await contextHoldingRefreshCookie(presented);
    const response = await refreshWithCookie(retained);
    expect(response.status()).toBe(401);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_REFRESH_TOKEN');
  });

  /**
   * @requirement user-authentication/REQ-33.6
   */
  test('置き換え済みの Cookie の再提示で、派生した Cookie も失効し画面がログイン画面へ戻る', async ({
    page,
    context,
  }) => {
    const user = await createSessionUser('REGULAR_USER');
    await loginAsUser(page, user);
    const first = (await refreshCookieOfBrowser(context)).value;

    // 再読み込みを二度行い、first → second → third と置き換える（second が使えたことも観測する）
    const firstRotation = waitForRefreshPresenting(page, first);
    await page.reload();
    expect((await firstRotation).status()).toBe(200);
    await waitForAuthenticatedSession(page, { timeout: getTimeout(15000), polling: 500 });
    const second = (await refreshCookieOfBrowser(context)).value;
    expect(second).not.toBe(first);

    const secondRotation = waitForRefreshPresenting(page, second);
    await page.reload();
    expect((await secondRotation).status()).toBe(200);
    await waitForAuthenticatedSession(page, { timeout: getTimeout(15000), polling: 500 });
    const third = (await refreshCookieOfBrowser(context)).value;
    expect(third).not.toBe(second);

    // 画面の活動を止めてから、置き換え済みの first を別の入れ物から再提示する
    await page.goto('about:blank');
    const attacker = await contextHoldingRefreshCookie(first);
    const reuse = await refreshWithCookie(attacker);
    expect(reuse.status()).toBe(401);
    expect(((await reuse.json()) as { code?: string }).code).toBe('INVALID_REFRESH_TOKEN');

    // 要件33.6: 系列の最新の third も失効し、画面は再ログインを求める
    const refreshWithThird = waitForRefreshPresenting(page, third);
    await page.goto('/dashboard');
    expect((await refreshWithThird).status()).toBe(401);
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });
  });

  /**
   * @requirement user-authentication/REQ-33.1
   */
  test('リフレッシュトークンを Bearer にした保護 API の要求が 401 になる', async () => {
    const user = await createSessionUser('REGULAR_USER');
    const session = await loginInIsolatedContext(user);
    const refreshToken = await refreshCookieOfRequestContext(session.context);
    expect(refreshToken).toMatch(JWT_PATTERN);

    const direct = await newRequestContext();

    // 対照: アクセストークンなら同じ API が成功する
    const withAccess = await getMe(direct, session.accessToken);
    expect(withAccess.status()).toBe(200);
    expect(((await withAccess.json()) as { email?: string }).email).toBe(user.email);

    // 要件33.1: リフレッシュトークンはアクセストークンとして受け付けない
    const withRefresh = await getMe(direct, refreshToken);
    expect(withRefresh.status()).toBe(401);

    // 拒否されたのはトークンの種別のためで、同じリフレッシュトークンはリフレッシュには使える
    const refreshed = await refreshWithCookie(session.context);
    expect(refreshed.status()).toBe(200);
  });

  /**
   * @requirement user-authentication/REQ-33.12
   */
  test('CSRF のヘッダーの無い・一致しない・送信元の違うリフレッシュとログアウトが 403 になる', async () => {
    const user = await createSessionUser('REGULAR_USER');
    const session = await loginInIsolatedContext(user);
    const csrfToken = await getCsrfToken(session.context);
    const refreshUrl = `${SAME_ORIGIN_API_BASE_URL}${REFRESH_PATH}`;

    const withoutHeader = await session.context.post(refreshUrl, {
      headers: { Origin: FRONTEND_BASE_URL },
    });
    expect(withoutHeader.status()).toBe(403);
    expect(((await withoutHeader.json()) as { code?: string }).code).toBe('CSRF_TOKEN_MISSING');

    const mismatched = await session.context.post(refreshUrl, {
      headers: { 'X-CSRF-Token': `${csrfToken}x`, Origin: FRONTEND_BASE_URL },
    });
    expect(mismatched.status()).toBe(403);
    expect(((await mismatched.json()) as { code?: string }).code).toBe('CSRF_TOKEN_INVALID');

    const foreignOrigin = await session.context.post(refreshUrl, {
      headers: { 'X-CSRF-Token': csrfToken, Origin: 'https://attacker.example' },
    });
    expect(foreignOrigin.status()).toBe(403);
    expect(((await foreignOrigin.json()) as { code?: string }).code).toBe('CSRF_ORIGIN_MISMATCH');

    const logoutWithoutHeader = await session.context.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/logout`,
      { headers: { Authorization: `Bearer ${session.accessToken}`, Origin: FRONTEND_BASE_URL } }
    );
    expect(logoutWithoutHeader.status()).toBe(403);
    expect(((await logoutWithoutHeader.json()) as { code?: string }).code).toBe(
      'CSRF_TOKEN_MISSING'
    );

    // 拒否した要求は Cookie を消費・失効させていない（同じ Cookie が正しい契約ならまだ使える）
    const accepted = await refreshWithCookie(session.context, { csrfToken });
    expect(accepted.status()).toBe(200);
  });

  /**
   * 全デバイスのログアウト・パスワードの変更の後、それまでの全てのセッションが使えない
   */
  for (const scenario of [
    {
      title: '全デバイスのログアウト',
      revoke: (api: ApiSession) =>
        api.context.post(`${API_BASE_URL}/api/v1/auth/logout-all`, {
          headers: { Authorization: `Bearer ${api.accessToken}` },
        }),
    },
    {
      title: 'パスワードの変更',
      revoke: (api: ApiSession, user: SessionUser) =>
        api.context.post(`${API_BASE_URL}/api/v1/auth/password/change`, {
          headers: { Authorization: `Bearer ${api.accessToken}` },
          data: {
            currentPassword: user.password,
            newPassword: 'TokenRevoke!Pass2026xyz',
            newPasswordConfirm: 'TokenRevoke!Pass2026xyz',
          },
        }),
    },
  ]) {
    /**
     * @requirement user-authentication/REQ-33.5
     */
    test(`${scenario.title}の後、それまでの全てのセッションのリフレッシュが 401 になる`, async ({
      page,
      context,
    }) => {
      const user = await createSessionUser('REGULAR_USER');

      // 画面のセッションと、別の端末に見立てた二つのセッション
      await loginAsUser(page, user);
      const browserCookie = (await refreshCookieOfBrowser(context)).value;
      const actor = await loginInIsolatedContext(user);
      const otherDevice = await loginInIsolatedContext(user);

      // 対照: 失効の前は、別の端末のセッションでリフレッシュできる
      const before = await refreshWithCookie(otherDevice.context);
      expect(before.status()).toBe(200);

      await page.goto('about:blank');
      const revoked = await scenario.revoke(actor, user);
      expect(revoked.status()).toBe(200);

      // 要件33.5: 操作したセッション・別の端末のセッションのどちらもリフレッシュできない
      expect((await refreshWithCookie(actor.context)).status()).toBe(401);
      expect((await refreshWithCookie(otherDevice.context)).status()).toBe(401);

      // 画面のセッションも、再読み込みの後のリフレッシュが拒否されログイン画面へ戻る
      const browserRefresh = waitForRefreshPresenting(page, browserCookie);
      await page.goto('/dashboard');
      expect((await browserRefresh).status()).toBe(401);
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });
    });
  }
});
