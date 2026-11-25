/**
 * @fileoverview 外部アプリ用トークンの交換・種別・更新・再同意の E2E テスト
 *
 * user-authentication タスク79.4。design.md「Requirements 46-51」の OAuthProviderHost（認可コードの交換と
 * リフレッシュトークンの置き換え）・ExternalAppTokenVerifier（想定利用者の確認）・ExternalAppConnectionService
 * （再同意の置き換え・再利用の検知・30 秒の猶予）の節。試験の compose の実際の nginx（画面の配信元）・backend・DB
 * を通す。接続はタスク79.2 と同じ同意の画面の流れ（ログイン・次の TOTP の 2FA・同意）で作る。
 *
 * Requirements coverage (user-authentication):
 * - REQ-33.1: 外部アプリ用のアクセストークンを Bearer にした画面用の保護 API の要求は 401
 * - REQ-33.3: 想定利用者の違うトークンを拒む（外部アプリ用トークンは画面用の API で、画面用のトークンは外部アプリ用の
 *   窓口で、それぞれ 401）
 * - REQ-47.9: 認可コードは PKCE の検証値が一致しないと交換できず、交換は 1 回だけ（発行から 10 分の期限と発行先の
 *   アプリの照合は統合テスト oauth-provider・oauth-authorization-flow が確かめる）
 * - REQ-47.10: 使用済みの認可コードの再提示は拒まれ、そのコードから発行したトークンが使えなくなる
 * - REQ-47.8: 同じ利用者とアプリの組の再同意は接続を置き換え、置き換え前のトークンを直ちに使えなくする
 * - REQ-48.1: 外部アプリ用のアクセストークンの有効期限は 15 分（交換と更新の応答の `expires_in` が 900）
 * - REQ-48.4: リフレッシュトークンの更新は同意からの 90 日の期限を延ばさない
 * - REQ-48.5: 外部アプリ用のリフレッシュトークンの更新で新しいリフレッシュトークンへ置き換わる
 * - REQ-48.6: 後継が使われた後に置き換え済みのリフレッシュトークンが再提示されると接続が失効する
 * - REQ-48.7: 保存データの行は、発行したトークンの値をそのまま持たない
 * - REQ-48.11: 置き換えの直後（30 秒以内・後継が未使用）の再提示は接続を失効させずに新しいトークンを出す
 * - REQ-51.3: 外部アプリ用の窓口へ画面用のアクセストークンを提示すると 401
 *
 * 観測の方針:
 * - ArchiTrack の応答は差し替えない。外部アプリの戻り先は試験の工程の中の loopback の受け口で受ける
 * - 接続は同意の画面の流れでだけ作る。DB は読むだけで書かない（後始末を除く）
 * - 利用者はテストの中で作り（`createSessionUser`）、後で接続・保存データ・Redis の鍵とともに消す
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  OAUTH_TEST_CLIENT,
  buildAuthorizationRequest,
  cleanupOAuthArtifacts,
  connectViaConsent,
  exchangeAuthorizationCode,
  findConnectionEventAudits,
  findConnectionsWithTimes,
  newExternalAppRequestContext,
  openAuthorizationAndLogin,
  passConsentSecondFactor,
  refreshExternalAppToken,
  startOAuthCallbackServer,
  waitForOAuthCallback,
  whoamiStatus,
  type OAuthCallbackServer,
  type OAuthTokenResponse,
} from '../../helpers/oauth-consent-flow';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';

/** 外部アプリ用のアクセストークンの有効期限（秒。要件48.1） */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SCREEN_API_PATH = '/api/v1/auth/me';

const createdUserIds: string[] = [];
const consentUids: string[] = [];
const openedContexts: BrowserContext[] = [];

async function createUser() {
  const user: SessionUser = await createSessionUser('ADMIN_USER');
  createdUserIds.push(user.id);
  return user;
}

function recordUid(uid: string): void {
  consentUids.push(uid);
}

/** 別のブラウザのコンテキスト（未ログイン）を開く（後始末で閉じる） */
async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  openedContexts.push(context);
  return context.newPage();
}

/** 利用者のただ一つの接続を DB から読む（無ければ失敗する） */
async function onlyConnectionOf(userId: string) {
  const connections = await findConnectionsWithTimes(userId);
  expect(connections, '利用者の接続は 1 件').toHaveLength(1);
  return connections[0]!;
}

/** リフレッシュトークンを更新し、成功した応答のトークンを返す */
async function refreshOk(refreshToken: string): Promise<OAuthTokenResponse> {
  const api = await newExternalAppRequestContext();
  try {
    const refreshed = await refreshExternalAppToken(api, refreshToken);
    expect(refreshed.status, 'リフレッシュトークンを更新できる').toBe(200);
    return refreshed.body as OAuthTokenResponse;
  } finally {
    await api.dispose();
  }
}

/** リフレッシュトークンの更新が `invalid_grant` で拒まれることを主張する */
async function expectRefreshRejected(refreshToken: string, message: string) {
  const api = await newExternalAppRequestContext();
  try {
    const refreshed = await refreshExternalAppToken(api, refreshToken);
    expect(refreshed.status, message).toBe(400);
    expect(refreshed.body).toMatchObject({ error: 'invalid_grant' });
  } finally {
    await api.dispose();
  }
}

test.describe('外部アプリ用トークンの交換・種別・更新・再同意（user-authentication 79.4）', () => {
  let callbackServer: OAuthCallbackServer;

  test.beforeEach(async () => {
    callbackServer = await startOAuthCallbackServer();
  });

  test.afterEach(async () => {
    await Promise.all(openedContexts.map((context) => context.close()));
    openedContexts.length = 0;
    await callbackServer.close();
    await cleanupOAuthArtifacts(createdUserIds, consentUids);
    await deleteSessionUsers();
    createdUserIds.length = 0;
    consentUids.length = 0;
  });

  /**
   * @requirement user-authentication/REQ-33.1
   * @requirement user-authentication/REQ-33.3
   * @requirement user-authentication/REQ-47.9
   * @requirement user-authentication/REQ-47.10
   * @requirement user-authentication/REQ-48.1
   * @requirement user-authentication/REQ-48.7
   * @requirement user-authentication/REQ-51.3
   */
  test('認可コードは検証値が一致するときに 1 回だけ交換でき、外部アプリ用トークンと画面用のトークンは互いの窓口で拒まれる', async ({
    page,
  }) => {
    // 次の TOTP の時間ステップを 1 回実際に待つ（最大 30 秒）
    test.setTimeout(getTimeout(180_000));
    const user = await createUser();
    const authorization = buildAuthorizationRequest();
    const detailsRequest = page.waitForRequest(
      (request) =>
        /^\/oauth\/interaction\/[A-Za-z0-9_-]{43}\/details$/.test(new URL(request.url()).pathname),
      { timeout: getTimeout(60000) }
    );
    await openAuthorizationAndLogin(page, user, authorization.url, recordUid);
    const screenAuthorization = await (await detailsRequest).headerValue('authorization');
    expect(screenAuthorization, '同意の API に画面用のアクセストークンが付く').toMatch(/^Bearer /);
    await passConsentSecondFactor(page, user);
    await page.getByRole('button', { name: '許可する' }).click();
    const code = (await waitForOAuthCallback(page, authorization)).searchParams.get('code');
    expect(code, '戻り先へ認可コードが返る').toBeTruthy();

    const api = await newExternalAppRequestContext();
    try {
      // 47.9: 申し込みの検証値と一致しない検証値では交換できない（コードは使用済みにならない）
      const mismatched = await exchangeAuthorizationCode(
        api,
        code!,
        buildAuthorizationRequest().verifier
      );
      expect(mismatched.status).toBe(400);
      expect(mismatched.body).toMatchObject({ error: 'invalid_grant' });

      // 47.9・48.1: 一致する検証値で交換でき、アクセストークンの有効期限は 15 分
      const exchanged = await exchangeAuthorizationCode(api, code!, authorization.verifier);
      expect(exchanged.status).toBe(200);
      const tokens = exchanged.body as OAuthTokenResponse;
      expect(tokens.expires_in).toBe(ACCESS_TOKEN_TTL_SECONDS);
      expect(await whoamiStatus(tokens.access_token)).toBe(200);

      // 48.7: 保存データの行（ID と内容）は発行したトークンの値をそのまま持たない
      const stored = await getPrismaClient().oAuthStoreRecord.findMany({
        where: { payload: { path: ['accountId'], equals: user.id } },
        select: { id: true, kind: true, payload: true },
      });
      expect(stored.map((record) => record.kind)).toEqual(
        expect.arrayContaining(['Grant', 'AuthorizationCode', 'AccessToken', 'RefreshToken'])
      );
      const storedText = JSON.stringify(stored);
      for (const value of [code!, tokens.access_token, tokens.refresh_token!]) {
        expect(storedText.includes(value), '保存データにトークンの値が無い').toBe(false);
      }

      // 33.1・33.3: 外部アプリ用のアクセストークンは画面用の保護 API で 401
      const screenWithExternal = await api.get(SCREEN_API_PATH, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      expect(screenWithExternal.status()).toBe(401);
      // 対照: 同じ API は画面用のアクセストークンなら通る
      const screenWithScreen = await api.get(SCREEN_API_PATH, {
        headers: { Authorization: screenAuthorization! },
      });
      expect(screenWithScreen.status()).toBe(200);

      // 51.3・33.3: 画面用のアクセストークンは外部アプリ用の窓口で 401
      const externalWithScreen = await api.get('/oauth/resource/whoami', {
        headers: { Authorization: screenAuthorization! },
      });
      expect(externalWithScreen.status()).toBe(401);
      expect(externalWithScreen.headers()['www-authenticate']).toMatch(
        /^Bearer error="invalid_token"/
      );

      // 47.9・47.10: 使用済みのコードの再提示は拒まれ、そのコードから発行したトークンが使えなくなる
      const replayed = await exchangeAuthorizationCode(api, code!, authorization.verifier);
      expect(replayed.status).toBe(400);
      expect(replayed.body).toMatchObject({ error: 'invalid_grant' });
      await expect
        .poll(() => whoamiStatus(tokens.access_token), { timeout: getTimeout(10000) })
        .toBe(401);
      await expectRefreshRejected(
        tokens.refresh_token!,
        '再提示されたコードから発行したリフレッシュトークンは使えない'
      );
    } finally {
      await api.dispose();
    }
  });

  /**
   * @requirement user-authentication/REQ-47.8
   * @requirement user-authentication/REQ-48.1
   * @requirement user-authentication/REQ-48.4
   * @requirement user-authentication/REQ-48.5
   * @requirement user-authentication/REQ-48.6
   * @requirement user-authentication/REQ-48.11
   */
  test('更新でリフレッシュトークンが置き換わり、直後の再提示は猶予され、再同意と後継の使用後の再提示で前のトークンが使えなくなる', async ({
    page,
    browser,
  }) => {
    // 次の TOTP の時間ステップを 2 回実際に待つ（各最大 30 秒）
    test.setTimeout(getTimeout(300_000));
    const startedAt = new Date(Date.now() - 5000);
    const user = await createUser();
    const first = await connectViaConsent(page, user, { grantWrite: true, recordUid });
    const firstConnection = await onlyConnectionOf(user.id);

    // 48.5・48.1: 更新で新しいリフレッシュトークンと 15 分のアクセストークンが出る
    const rotated = await refreshOk(first.refresh_token!);
    expect(rotated.refresh_token).toBeTruthy();
    expect(rotated.refresh_token).not.toBe(first.refresh_token);
    expect(rotated.expires_in).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(await whoamiStatus(rotated.access_token)).toBe(200);
    // 48.4: 更新は同意からの 90 日の期限を延ばさない
    const afterRotation = await onlyConnectionOf(user.id);
    expect(afterRotation.id).toBe(firstConnection.id);
    expect(afterRotation.expiresAt).toEqual(firstConnection.expiresAt);

    // 48.11: 置き換えの直後（後継は未使用）の再提示は、接続を失効させずに新しいトークンを出す
    const graced = await refreshOk(first.refresh_token!);
    expect(graced.refresh_token).toBeTruthy();
    expect(graced.refresh_token).not.toBe(rotated.refresh_token);
    expect(await whoamiStatus(graced.access_token)).toBe(200);
    expect((await onlyConnectionOf(user.id)).id).toBe(firstConnection.id);
    expect(await findConnectionEventAudits(user.id, startedAt, 'TOKEN_REUSE_DETECTED')).toEqual([]);
    const continued = await refreshOk(graced.refresh_token!);
    expect(await whoamiStatus(continued.access_token)).toBe(200);

    // 47.8: 同じ利用者とアプリの組の再同意は接続を置き換え、置き換え前のトークンを直ちに使えなくする
    const second = await connectViaConsent(await openPage(browser), user, { recordUid });
    const secondConnection = await onlyConnectionOf(user.id);
    expect(secondConnection.id).not.toBe(firstConnection.id);
    expect(secondConnection.scopes).toEqual(['read']);
    expect(await whoamiStatus(continued.access_token)).toBe(401);
    await expectRefreshRejected(
      continued.refresh_token!,
      '置き換え前の接続のリフレッシュトークンは使えない'
    );
    expect(await whoamiStatus(second.access_token)).toBe(200);
    expect(await findConnectionEventAudits(user.id, startedAt, 'CONNECTION_REPLACED')).toHaveLength(
      1
    );

    // 48.6: 後継が使われた後に置き換え済みのリフレッシュトークンが再提示されると、接続が失効する
    const successor = await refreshOk(second.refresh_token!);
    const latest = await refreshOk(successor.refresh_token!);
    expect(await whoamiStatus(latest.access_token)).toBe(200);
    await expectRefreshRejected(
      second.refresh_token!,
      '後継が使われた置き換え済みのリフレッシュトークンは使えない'
    );
    await expect
      .poll(async () => (await findConnectionsWithTimes(user.id)).length, {
        timeout: getTimeout(10000),
      })
      .toBe(0);
    expect(await whoamiStatus(latest.access_token)).toBe(401);
    await expectRefreshRejected(
      latest.refresh_token!,
      '失効した接続のリフレッシュトークンは使えない'
    );
    expect(await findConnectionEventAudits(user.id, startedAt, 'TOKEN_REUSE_DETECTED')).toEqual([
      {
        actorId: null,
        targetId: user.id,
        metadata: expect.objectContaining({
          clientId: OAUTH_TEST_CLIENT.clientId,
          scopes: ['read'],
          reason: 'TOKEN_REUSE',
        }),
      },
    ]);
  });
});
