/**
 * @fileoverview 2FA を伴うログインの完全性の E2E テスト
 *
 * user-authentication タスク46.3。2FA の検証がパスワードの検証の成功に結び付いた資格を要求し、
 * メールアドレスやトークンを資格として受け付けないことを、画面と API の観測で確かめる。
 *
 * Requirements coverage (user-authentication):
 * - 32.1: パスワードの検証の成功で 2FA 待ちの資格が発行され、画面がその資格とコードで検証して
 *   ダッシュボードへ進む
 * - 32.2: 資格を伴わない（メールアドレスとコードだけの）検証の要求が 401 になる
 * - 32.4: 一度成功した資格による以後の検証が 401 になる
 * - 32.5: アクセストークン・リフレッシュトークンを資格として送った検証が 401 になる
 * - 32.6: バックアップコードの検証も同じ資格を要求する
 * - 32.7: 同じ TOTP コードの二度目の検証が拒否される
 * - 42.7: ログインの応答（2FA 待ち・失敗）の本文に利用者の ID が無い
 * - 33.9: 2FA の検証・バックアップコードの検証の応答本文にリフレッシュトークンが無い
 *
 * 32.3（資格の期限）は backend の単体・統合テストが担う（design.md「Testing Strategy」）。
 *
 * 2FA の検証は TOTP の時間ステップの記録・バックアップコードの消費・セッションの発行を伴うため、
 * 全てテストの中で作り 2FA を登録した利用者（`createSessionUser` の既定の、既知の秘密鍵で登録した状態）で行い、
 * 共有の役割の利用者と 2FA の試験用の利用者（TWO_FA_USER）には触れない。
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, APIResponse, Response } from '@playwright/test';
import { SAME_ORIGIN_API_BASE_URL } from '../../config';
import { loginWithCredentials } from '../../helpers/auth-actions';
import { fetchSessionUser, waitForAuthenticatedSession } from '../../helpers/auth-api';
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import { fillTotpCode, prepareTotpCode } from '../../helpers/two-factor-totp';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  createTwoFactorBackupCodes,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';

const LOGIN_PATH = '/api/v1/auth/login';
const VERIFY_TOTP_PATH = '/api/v1/auth/verify-2fa';
const VERIFY_BACKUP_PATH = '/api/v1/auth/verify-2fa/backup';
const REFRESH_COOKIE_NAME = 'refreshToken';

/** 開いた要求のコンテキスト（テストの終わりに閉じる） */
const openedRequestContexts: APIRequestContext[] = [];

async function newRequestContext(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext();
  openedRequestContexts.push(context);
  return context;
}

/**
 * テストの中で作り、既知の秘密鍵で 2FA を登録した利用者（共通の補助の既定の状態）
 *
 * 後始末は `deleteSessionUsers` で行う（バックアップコードは利用者の削除に連なって消える）。
 */
async function createTwoFactorSessionUser(): Promise<SessionUser> {
  return createSessionUser('REGULAR_USER', { twoFactor: true });
}

/** 応答本文のエラーのコード（どの段で拒否されたかを完全一致で主張するため） */
async function errorCodeOf(response: APIResponse): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

/** ログイン API を呼ぶ（画面と同じオリジン。2FA の検証の成功で Cookie が同じ入れ物に入る） */
function postLogin(context: APIRequestContext, email: string, password: string) {
  return context.post(`${SAME_ORIGIN_API_BASE_URL}${LOGIN_PATH}`, { data: { email, password } });
}

/** パスワードの検証を通し、ログインの応答の 2FA 待ちの資格を返す */
async function issueChallenge(context: APIRequestContext, user: SessionUser): Promise<string> {
  const response = await postLogin(context, user.email, user.password);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { requires2FA?: unknown; challengeToken?: unknown };
  expect(body.requires2FA).toBe(true);
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : null;
  assertPrepared(challengeToken, 'ログインの応答の 2FA 待ちの資格');
  return challengeToken;
}

function verifyTotp(context: APIRequestContext, data: Record<string, unknown>) {
  return context.post(`${SAME_ORIGIN_API_BASE_URL}${VERIFY_TOTP_PATH}`, { data });
}

function verifyBackup(context: APIRequestContext, data: Record<string, unknown>) {
  return context.post(`${SAME_ORIGIN_API_BASE_URL}${VERIFY_BACKUP_PATH}`, { data });
}

/** 要求のコンテキストの入れ物にあるリフレッシュトークンの Cookie の値 */
async function refreshCookieOf(context: APIRequestContext): Promise<string> {
  const { cookies } = await context.storageState();
  const cookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
  assertPrepared(cookie?.value, '2FA の検証の成功で受け取ったリフレッシュトークンの Cookie');
  return cookie.value;
}

/**
 * 2FA の検証の成功の応答を主張し、本文のアクセストークンを返す
 *
 * 要件33.9: 本文にリフレッシュトークンが無く、Set-Cookie で渡った値が本文のどこにも現れない。
 */
async function expectVerifiedWithoutRefreshTokenInBody(
  context: APIRequestContext,
  response: APIResponse
): Promise<string> {
  expect(response.status()).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  expect(body).not.toHaveProperty('refreshToken');
  expect(JSON.stringify(body)).not.toContain(await refreshCookieOf(context));
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null;
  assertPrepared(accessToken, '2FA の検証の応答のアクセストークン');
  return accessToken;
}

function isPost(response: Response, pathname: string): boolean {
  return new URL(response.url()).pathname === pathname && response.request().method() === 'POST';
}

test.describe('2FA を伴うログイン（要件32）', () => {
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
   * @requirement user-authentication/REQ-32.1
   * @requirement user-authentication/REQ-42.7
   * @requirement user-authentication/REQ-33.9
   */
  test('パスワード → コード → ダッシュボードの流れで、画面はログインの応答の資格で検証する', async ({
    page,
    context,
  }) => {
    const user = await createTwoFactorSessionUser();

    const loginResponsePromise = page.waitForResponse((response) => isPost(response, LOGIN_PATH), {
      timeout: getTimeout(20000),
    });
    // ログインそのものを検証するため、画面のフォームの送信だけを行い、2FA の検証は以下で画面を操作する
    await loginWithCredentials(page, user.email, user.password, false);
    const loginResponse = await loginResponsePromise;

    // 要件32.1: パスワードの検証の成功で、2FA 待ちの資格だけが返る（トークンは発行しない）
    expect(loginResponse.status()).toBe(200);
    const loginBody = (await loginResponse.json()) as Record<string, unknown>;
    expect(Object.keys(loginBody).sort()).toEqual(['challengeToken', 'expiresIn', 'requires2FA']);
    expect(loginBody.requires2FA).toBe(true);
    const challengeToken =
      typeof loginBody.challengeToken === 'string' ? loginBody.challengeToken : null;
    assertPrepared(challengeToken, 'ログインの応答の 2FA 待ちの資格');

    // 要件42.7: ログインの応答の本文に利用者の ID が無い
    expect(JSON.stringify(loginBody)).not.toContain(user.id);

    // 画面の 2FA の検証の入力欄へ、既知の秘密鍵から計算したコードを入れて検証する
    await expect(page.getByTestId('totp-digit-0')).toBeVisible({ timeout: getTimeout(15000) });
    const code = await prepareTotpCode(user.email);
    await fillTotpCode(page, code);
    const verifyResponsePromise = page.waitForResponse(
      (response) => isPost(response, VERIFY_TOTP_PATH),
      { timeout: getTimeout(20000) }
    );
    await page.getByRole('button', { name: /検証/ }).click();
    const verifyResponse = await verifyResponsePromise;

    // 要件32.1: 検証の要求はログインの応答の資格とコードだけを送り、メールアドレスを送らない
    expect(verifyResponse.request().postDataJSON()).toEqual({ challengeToken, code });
    expect(verifyResponse.status()).toBe(200);
    const verifyBody = (await verifyResponse.json()) as Record<string, unknown>;

    // 要件33.9: 2FA の検証の応答本文にリフレッシュトークンが無い（Cookie の値が本文に現れない）
    expect(verifyBody).not.toHaveProperty('refreshToken');
    const refreshCookie = (await context.cookies()).find((c) => c.name === REFRESH_COOKIE_NAME);
    assertPrepared(
      refreshCookie?.value,
      '2FA の検証の成功で受け取ったリフレッシュトークンの Cookie'
    );
    expect(JSON.stringify(verifyBody)).not.toContain(refreshCookie.value);

    // ダッシュボードへ進み、画面のセッションがこの利用者として認証済みになる
    await expect(page).toHaveURL(/\/dashboard/, { timeout: getTimeout(15000) });
    await waitForAuthenticatedSession(page, { timeout: getTimeout(15000), polling: 500 });
    expect(await fetchSessionUser(page)).toEqual({ status: 200, email: user.email });
  });

  /**
   * @requirement user-authentication/REQ-42.7
   */
  test('パスワードを誤ったログインの応答の本文に利用者の ID が無い', async () => {
    const user = await createTwoFactorSessionUser();
    const api = await newRequestContext();

    const response = await postLogin(api, user.email, `${user.password}x`);

    expect(response.status()).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(body)).not.toContain(user.id);
    expect(body).not.toHaveProperty('challengeToken');
  });

  /**
   * @requirement user-authentication/REQ-32.2
   */
  test('メールアドレスとコードだけで直接検証を要求すると 401 になる', async () => {
    const user = await createTwoFactorSessionUser();
    const attacker = await newRequestContext();
    const code = await prepareTotpCode(user.email);

    // 要件32.2: パスワードの検証を経ない要求は、正しいコードでも資格の段で拒否する
    const withoutChallenge = await verifyTotp(attacker, { email: user.email, code });
    expect(withoutChallenge.status()).toBe(401);
    expect(await errorCodeOf(withoutChallenge)).toBe('INVALID_CHALLENGE');
    expect(
      (await attacker.storageState()).cookies.find((c) => c.name === REFRESH_COOKIE_NAME)
    ).toBeUndefined();

    // 対照: 同じコードは、パスワードの検証で得た資格を伴えば受理される（コードが正しかった）
    const legitimate = await newRequestContext();
    const challengeToken = await issueChallenge(legitimate, user);
    const accepted = await verifyTotp(legitimate, { challengeToken, code });
    await expectVerifiedWithoutRefreshTokenInBody(legitimate, accepted);
  });

  /**
   * @requirement user-authentication/REQ-32.5
   */
  test('アクセストークン・リフレッシュトークンを資格として送った検証が 401 になる', async () => {
    const user = await createTwoFactorSessionUser();

    // 2FA の検証を終えた正規のセッションのトークン
    const session = await newRequestContext();
    const firstChallenge = await issueChallenge(session, user);
    const accessToken = await expectVerifiedWithoutRefreshTokenInBody(
      session,
      await verifyTotp(session, {
        challengeToken: firstChallenge,
        code: await prepareTotpCode(user.email),
      })
    );
    const refreshToken = await refreshCookieOf(session);

    // 次のログインの試行（資格は使わずに残しておく）
    const pending = await newRequestContext();
    const pendingChallenge = await issueChallenge(pending, user);
    const code = await prepareTotpCode(user.email);

    // 要件32.5: トークンを資格の代わりに送っても、正しいコードでも資格の段で拒否する
    for (const [label, token] of [
      ['アクセストークン', accessToken],
      ['リフレッシュトークン', refreshToken],
    ] as const) {
      const attacker = await newRequestContext();
      const rejected = await verifyTotp(attacker, { challengeToken: token, code });
      expect(rejected.status(), `${label}を資格として送った検証`).toBe(401);
      expect(await errorCodeOf(rejected), `${label}を資格として送った検証`).toBe(
        'INVALID_CHALLENGE'
      );
    }

    // 対照: 同じコードは、残しておいた資格を伴えば受理される
    const accepted = await verifyTotp(pending, { challengeToken: pendingChallenge, code });
    await expectVerifiedWithoutRefreshTokenInBody(pending, accepted);
  });

  /**
   * @requirement user-authentication/REQ-32.4
   * @requirement user-authentication/REQ-32.7
   */
  test('同じコードの二度目と、成功した資格の二度目の検証が拒否される', async () => {
    const user = await createTwoFactorSessionUser();

    const first = await newRequestContext();
    const firstChallenge = await issueChallenge(first, user);
    const code = await prepareTotpCode(user.email);
    await expectVerifiedWithoutRefreshTokenInBody(
      first,
      await verifyTotp(first, { challengeToken: firstChallenge, code })
    );

    // 要件32.7: 新たなログインの資格を伴っても、成功に使ったコードの二度目は拒否する
    const second = await newRequestContext();
    const secondChallenge = await issueChallenge(second, user);
    const replayed = await verifyTotp(second, { challengeToken: secondChallenge, code });
    expect(replayed.status()).toBe(401);
    expect(await errorCodeOf(replayed)).toBe('INVALID_2FA_CODE');

    // 最後に使った時間ステップを戻し、同じコードを再び受理できる状態にする
    // （二つ目の資格は失敗で消費されていない）
    const reusableCode = await prepareTotpCode(user.email);

    // 要件32.4: 一度成功した資格は、受理できるコードを伴っても拒否する
    const reusedChallenge = await verifyTotp(first, {
      challengeToken: firstChallenge,
      code: reusableCode,
    });
    expect(reusedChallenge.status()).toBe(401);
    expect(await errorCodeOf(reusedChallenge)).toBe('INVALID_CHALLENGE');

    // 対照: 二度目の拒否は再利用のためで、時間ステップを戻せば同じ資格とコードが受理される
    const accepted = await verifyTotp(second, {
      challengeToken: secondChallenge,
      code: reusableCode,
    });
    await expectVerifiedWithoutRefreshTokenInBody(second, accepted);
  });

  /**
   * @requirement user-authentication/REQ-32.6
   * @requirement user-authentication/REQ-33.9
   */
  test('バックアップコードの検証も、パスワードの検証で得た資格を要求する', async () => {
    const user = await createTwoFactorSessionUser();
    const [created] = await createTwoFactorBackupCodes({ userId: user.id, count: 1 });
    assertPresent(created, 'テストの中で作ったバックアップコード');
    const backupCode = created.code;

    // 正規のセッションのアクセストークン（資格の取り違えの検証に使う）
    const session = await newRequestContext();
    const sessionChallenge = await issueChallenge(session, user);
    const accessToken = await expectVerifiedWithoutRefreshTokenInBody(
      session,
      await verifyTotp(session, {
        challengeToken: sessionChallenge,
        code: await prepareTotpCode(user.email),
      })
    );

    // 要件32.6: メールアドレスだけ、アクセストークンを資格にした要求は、資格の段で拒否する
    const attacker = await newRequestContext();
    for (const [label, data] of [
      ['メールアドレスとバックアップコードだけ', { email: user.email, backupCode }],
      ['アクセストークンを資格にした', { challengeToken: accessToken, backupCode }],
    ] as const) {
      const rejected = await verifyBackup(attacker, data);
      expect(rejected.status(), `${label}要求`).toBe(401);
      expect(await errorCodeOf(rejected), `${label}要求`).toBe('INVALID_CHALLENGE');
    }

    // 拒否した要求はバックアップコードを消費していない
    const stored = await getPrismaClient().twoFactorBackupCode.findUnique({
      where: { id: created.id },
    });
    assertPrepared(stored, 'テストの中で作ったバックアップコードの行');
    expect(stored.usedAt).toBeNull();

    // 対照: 同じバックアップコードは、パスワードの検証で得た資格を伴えば受理され、消費される
    const legitimate = await newRequestContext();
    const challengeToken = await issueChallenge(legitimate, user);
    const accepted = await verifyBackup(legitimate, { challengeToken, backupCode });
    await expectVerifiedWithoutRefreshTokenInBody(legitimate, accepted);
    const consumed = await getPrismaClient().twoFactorBackupCode.findUnique({
      where: { id: created.id },
    });
    expect(consumed?.usedAt).not.toBeNull();
  });
});
