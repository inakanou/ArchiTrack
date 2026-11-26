/**
 * @fileoverview 外部アプリの接続（OAuth 2.1 の認可コードフロー）を E2E で通す補助
 *
 * user-authentication タスク79.2。design.md「Requirements 46-51」の System Flows（接続の同意）。
 * 試験の compose（docker-compose.test.yml・docker-compose.ci.yml）が載せる試験用のアプリで、画面の配信元
 * （frontend の nginx）を経て認可・同意・交換を行う。
 *
 * - 認可の要求は PKCE（S256）で組み立て、ブラウザで開く
 * - 戻り先（`http://127.0.0.1:4999/oauth/callback`）は、試験の工程の中で loopback に立てる最小の HTTP の
 *   受け口で受ける（戻り先の URL の観測だけが目的で、ArchiTrack の応答は差し替えない）。Playwright の経路の
 *   差し替えは、認可サーバーの 303 の転送の先の要求に効かず `net::ERR_ABORTED` になるため使わない
 * - 同意の画面の 2FA は、ログインで使った時間ステップの次の時間ステップを実際に待ってからコードを
 *   計算する（同意の画面の「次のコードをお待ちください」の案内どおりの人の操作。最後に使った時間ステップを
 *   DB で戻すことはしない）
 * - 交換は外部アプリ（Claude）と同じく、ブラウザの Cookie を持たない要求で `/oauth/token` へ送る
 */

import { createHash, randomBytes } from 'crypto';
import { createServer } from 'node:http';
import Redis from 'ioredis';
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { FRONTEND_BASE_URL } from '../config';
import { getPrismaClient } from '../fixtures/database';
import { submitLoginForm, type LoginCredentials } from './auth-actions';
import { E2E_TOTP_SECRET, fillTotpCode, generateTotpCode } from './two-factor-totp';
import { resolveE2eRedisUrl } from './user-state-cache';
import { getTimeout } from './wait-helpers';

/** 画面の配信元（認可サーバーの発行者と同じ公開オリジン） */
export const OAUTH_APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

/** docker-compose.test.yml・docker-compose.ci.yml の試験用のアプリ（試験専用の値で秘密ではない） */
export const OAUTH_TEST_CLIENT = {
  clientId: 'architrack-test-client',
  clientSecret: 'test-only-oauth-client-secret-not-for-production',
  displayName: 'Test App',
  redirectUri: 'http://127.0.0.1:4999/oauth/callback',
} as const;

/** 想定利用者（compose の `OAUTH_RESOURCE_URL`） */
export const OAUTH_RESOURCE_URL = `${OAUTH_APP_ORIGIN}/mcp`;

/** 同意の画面の経路 */
export const CONSENT_PATH_PATTERN = /^\/connect\/consent\/([A-Za-z0-9_-]{43})$/;

/** TOTP の時間ステップの長さ（ミリ秒） */
const TOTP_STEP_MS = 30_000;

/** 認可の要求（ブラウザで開く URL と、交換に要る検証値） */
export interface AuthorizationRequest {
  readonly url: string;
  readonly state: string;
  readonly verifier: string;
}

/**
 * PKCE（S256）の認可の要求を組み立てる
 *
 * @param scope - 申し込む範囲（既定は Claude と同じ `offline_access read write`）
 */
export function buildAuthorizationRequest(
  scope = 'offline_access read write'
): AuthorizationRequest {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = `e2e-${randomBytes(12).toString('hex')}`;
  const query = new URLSearchParams({
    client_id: OAUTH_TEST_CLIENT.clientId,
    response_type: 'code',
    redirect_uri: OAUTH_TEST_CLIENT.redirectUri,
    resource: OAUTH_RESOURCE_URL,
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { url: `${OAUTH_APP_ORIGIN}/oauth/authorize?${query.toString()}`, state, verifier };
}

/** 戻り先の受け口が返す文書（`framed` の経路は枠内の表示の検証に使う） */
export interface OAuthCallbackServer {
  /** 受け口のオリジン（戻り先と同じ） */
  readonly origin: string;
  /** 枠内に `src` を読み込む文書の URL（他のサイトの枠内の表示の検証） */
  framingPageUrl(src: string): string;
  close(): Promise<void>;
}

/**
 * 戻り先のオリジン（127.0.0.1:4999）で、外部アプリの戻り先を受ける最小の受け口を立てる
 *
 * - `/oauth/callback` は固定の文書を返す（戻り先へ遷移した URL は `page.url()` で観測する）
 * - `/framing?src=<URL>` は `src` を iframe に読み込む文書を返す（ArchiTrack と別のオリジンのサイト）
 */
export async function startOAuthCallbackServer(): Promise<OAuthCallbackServer> {
  const callback = new URL(OAUTH_TEST_CLIENT.redirectUri);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', callback.origin);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url.pathname === callback.pathname) {
      response.end(
        '<!doctype html><title>callback</title><p>外部アプリの戻り先（試験の受け口）</p>'
      );
      return;
    }
    const src = url.searchParams.get('src');
    if (url.pathname === '/framing' && src !== null && src.startsWith(`${OAUTH_APP_ORIGIN}/`)) {
      response.end(
        `<!doctype html><title>framing</title><iframe id="target" src="${encodeURI(src)}"></iframe>`
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(callback.port), callback.hostname, () => resolve());
  });
  return {
    origin: callback.origin,
    framingPageUrl: (src) => `${callback.origin}/framing?src=${encodeURIComponent(src)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * 戻り先への遷移を待ち、返った URL を返す（`state` が申し込みの値と一致することを主張する）
 */
export async function waitForOAuthCallback(
  page: Page,
  authorization: AuthorizationRequest
): Promise<URL> {
  await page.waitForURL((url) => `${url.origin}${url.pathname}` === OAUTH_TEST_CLIENT.redirectUri, {
    timeout: getTimeout(20000),
  });
  const url = new URL(page.url());
  expect(url.searchParams.get('state'), '戻り先へ申し込みの state が返る').toBe(
    authorization.state
  );
  return url;
}

/**
 * 認可の要求を開き、未ログインならログイン画面へ送られたことを確かめてからログインする
 *
 * 認可サーバー → 同意の URL（backend）→ 同意の画面（nginx の SPA）の順に届き、ログインの後に同じ
 * 申し込みの同意の画面へ戻ること（要件47.1）を主張する。
 *
 * @param recordUid - 主張が失敗しても後始末できるよう、主張より先に uid を受け取る
 */
export async function openAuthorizationAndLogin(
  page: Page,
  user: LoginCredentials,
  url: string,
  recordUid: (uid: string) => void
) {
  const document = await page.goto(url);
  expect(document, '認可の要求の遷移の最後の応答がある').not.toBeNull();
  const uid = new URL(document!.url()).pathname.split('/').pop()!;
  recordUid(uid);
  expect(new URL(document!.url()).pathname).toMatch(/^\/connect\/consent\/[A-Za-z0-9_-]{43}$/);
  await page.waitForURL((current) => current.pathname === '/login', {
    timeout: getTimeout(15000),
  });
  await submitLoginForm(page, user);
  await page.waitForURL((current) => current.pathname === `/connect/consent/${uid}`, {
    timeout: getTimeout(15000),
  });
  return { uid, document: document! };
}

/**
 * 未ログインのページで、ログイン・2FA・同意を人と同じ操作で通して接続を作り、認可コードを交換する
 *
 * 接続を作る唯一の経路（同意の画面）を通す。DB へ接続の行を直接書かない。
 *
 * @param options.grantWrite - 同意の画面で「書き込み（任意）」を選ぶか（既定は選ばない）
 * @param options.recordUid - 同意の手続きの uid を後始末のために受け取る
 * @returns 交換したトークン（外部アプリが受け取る値）
 */
export async function connectViaConsent(
  page: Page,
  user: LoginCredentials,
  options: { grantWrite?: boolean; recordUid: (uid: string) => void }
): Promise<OAuthTokenResponse> {
  const authorization = buildAuthorizationRequest();
  await openAuthorizationAndLogin(page, user, authorization.url, options.recordUid);
  await passConsentSecondFactor(page, user);
  if (options.grantWrite === true) {
    await page.getByRole('checkbox', { name: '書き込み（任意）' }).check();
  }
  await page.getByRole('button', { name: '許可する' }).click();
  const returnedTo = await waitForOAuthCallback(page, authorization);
  const code = returnedTo.searchParams.get('code');
  expect(code, '戻り先へ認可コードが返る').toBeTruthy();
  const api = await newExternalAppRequestContext();
  try {
    const exchanged = await exchangeAuthorizationCode(api, code!, authorization.verifier);
    expect(exchanged.status, '認可コードを交換できる').toBe(200);
    const tokens = exchanged.body as OAuthTokenResponse;
    expect(tokens.refresh_token, 'リフレッシュトークンも発行される').toBeTruthy();
    return tokens;
  } finally {
    await api.dispose();
  }
}

/** 同意の画面の uid を URL から読む（同意の画面でなければ失敗する） */
export function consentUidOf(page: Page): string {
  const uid = CONSENT_PATH_PATTERN.exec(new URL(page.url()).pathname)?.[1];
  expect(uid, `同意の画面（/connect/consent/:uid）にいる: ${page.url()}`).toBeTruthy();
  return uid!;
}

/**
 * 利用者が最後に使った TOTP の時間ステップより後の時間ステップになるまで実際に待ち、そのコードを返す
 *
 * ログインで使ったコードと同じ時間ステップのコードは再利用として拒まれ失敗に数えられるため
 * （同意の画面の「次のコードをお待ちください」）、人と同じく次のコードを待つ。
 *
 * @returns 入力するコードと、待った時間（ミリ秒）
 */
export async function waitForNextTotpCode(
  email: string,
  secret: string = E2E_TOTP_SECRET
): Promise<{ code: string; waitedMs: number }> {
  const user = await getPrismaClient().user.findUnique({
    where: { email },
    select: { twoFactorLastUsedStep: true },
  });
  if (!user) {
    throw new Error(`2FA の利用者 ${email} が見つかりません`);
  }
  const lastUsedStep =
    user.twoFactorLastUsedStep === null ? null : Number(user.twoFactorLastUsedStep);
  const started = Date.now();
  if (lastUsedStep !== null) {
    const nextStepStartsAt = (lastUsedStep + 1) * TOTP_STEP_MS;
    // 時間ステップの境目の直後の時計のずれに備えて少しだけ余裕を持つ
    const waitMs = nextStepStartsAt - Date.now() + 500;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return { code: generateTotpCode(secret), waitedMs: Date.now() - started };
}

/**
 * 同意の画面の 2FA の段階で次の TOTP のコードを入れて検証する（応答が 204 であることを主張する）
 *
 * @returns 次のコードを待った時間（ミリ秒）
 */
export async function passConsentSecondFactor(
  page: Page,
  user: { email: string; totpSecret?: string }
): Promise<number> {
  await expect(page.getByTestId('totp-digit-0')).toBeVisible({ timeout: getTimeout(15000) });
  const { code, waitedMs } = await waitForNextTotpCode(
    user.email,
    user.totpSecret ?? E2E_TOTP_SECRET
  );
  await fillTotpCode(page, code);
  const verifyResponse = page.waitForResponse(
    (response) =>
      /^\/oauth\/interaction\/[A-Za-z0-9_-]{43}\/second-factor$/.test(
        new URL(response.url()).pathname
      ) && response.request().method() === 'POST',
    { timeout: getTimeout(20000) }
  );
  await page.getByRole('button', { name: '検証', exact: true }).click();
  expect((await verifyResponse).status(), '同意の 2FA の検証が通る').toBe(204);
  return waitedMs;
}

/** トークンの応答 */
export interface OAuthTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly scope: string;
  readonly token_type: string;
  readonly expires_in: number;
}

/** 外部アプリ（ブラウザの Cookie を持たない）の要求のコンテキストを開く。呼び出し側で dispose する */
export async function newExternalAppRequestContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: OAUTH_APP_ORIGIN });
}

/**
 * 認可コードを画面の配信元の `/oauth/token` で交換する（`client_secret_post`、PKCE の検証値つき）
 */
export async function exchangeAuthorizationCode(
  api: APIRequestContext,
  code: string,
  verifier: string
): Promise<{ status: number; body: unknown; cacheControl: string | undefined }> {
  const response = await api.post('/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: OAUTH_TEST_CLIENT.redirectUri,
      client_id: OAUTH_TEST_CLIENT.clientId,
      client_secret: OAUTH_TEST_CLIENT.clientSecret,
      code_verifier: verifier,
      resource: OAUTH_RESOURCE_URL,
    },
  });
  return {
    status: response.status(),
    body: await response.json(),
    cacheControl: response.headers()['cache-control'],
  };
}

/**
 * リフレッシュトークンを画面の配信元の `/oauth/token` で更新する（`client_secret_post`）
 */
export async function refreshExternalAppToken(
  api: APIRequestContext,
  refreshToken: string
): Promise<{ status: number; body: unknown }> {
  const response = await api.post('/oauth/token', {
    form: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_TEST_CLIENT.clientId,
      client_secret: OAUTH_TEST_CLIENT.clientSecret,
      resource: OAUTH_RESOURCE_URL,
    },
  });
  return { status: response.status(), body: await response.json() };
}

/**
 * 外部アプリのアクセストークンで確認用の窓口（`/oauth/resource/whoami`）を呼び、応答の状態を返す
 */
export async function whoamiStatus(accessToken: string): Promise<number> {
  const api = await newExternalAppRequestContext();
  try {
    const response = await api.get('/oauth/resource/whoami', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.status();
  } finally {
    await api.dispose();
  }
}

/** 画面の API へ状態を変える要求を送るためのヘッダー（画面用のアクセストークン・送信元・CSRF のトークン） */
export interface ScreenApiHeaders {
  readonly Authorization: string;
  readonly Origin: string;
  readonly 'X-CSRF-Token': string;
}

/**
 * ログイン中のページが画面の API に付ける画面用のアクセストークンと、CSRF のトークンを得る
 *
 * 連携中のアプリの画面を開き、画面が送る一覧の要求のヘッダーから読む（トークンを作らない）。
 */
export async function screenApiHeadersOf(page: Page): Promise<ScreenApiHeaders> {
  const listRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/v1/external-app-connections' &&
      request.method() === 'GET',
    { timeout: getTimeout(15000) }
  );
  await page.goto('/connected-apps');
  const bearer = await (await listRequest).headerValue('authorization');
  expect(bearer, '画面が画面用のアクセストークンで API を呼んでいる').toMatch(/^Bearer /);
  const csrf = await page.request.get(`${OAUTH_APP_ORIGIN}/csrf-token`);
  expect(csrf.status()).toBe(200);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  return { Authorization: bearer!, Origin: OAUTH_APP_ORIGIN, 'X-CSRF-Token': csrfToken };
}

/**
 * 利用者の接続を DB から読む（終了した接続は行が消える）
 */
export async function findConnections(userId: string) {
  return getPrismaClient().externalAppConnection.findMany({
    where: { userId },
    select: { id: true, clientId: true, scopes: true },
  });
}

/**
 * 利用者の接続を、画面に示す日時（同意・最後の利用・同意から 90 日の期限）とともに DB から読む
 */
export async function findConnectionsWithTimes(userId: string) {
  return getPrismaClient().externalAppConnection.findMany({
    where: { userId },
    select: {
      id: true,
      clientId: true,
      scopes: true,
      consentedAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });
}

/**
 * 利用者を対象とする接続の終了の監査（CONNECTION_ENDED）を、指定の時刻以後について読む
 */
export async function findConnectionEndedAudits(targetUserId: string, since: Date) {
  return getPrismaClient().auditLog.findMany({
    where: {
      action: 'CONNECTION_ENDED',
      targetType: 'User',
      targetId: targetUserId,
      createdAt: { gte: since },
    },
    select: { actorId: true, targetId: true, metadata: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 利用者を対象とする接続の出来事の監査（`CONNECTION_REPLACED`・`TOKEN_REUSE_DETECTED`・
 * `REFRESH_GRACE_APPLIED` など）を、指定の時刻以後について読む
 */
export async function findConnectionEventAudits(targetUserId: string, since: Date, action: string) {
  return getPrismaClient().auditLog.findMany({
    where: { action, targetType: 'User', targetId: targetUserId, createdAt: { gte: since } },
    select: { actorId: true, targetId: true, metadata: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 利用者に結び付いた認可サーバーの発行物（Grant・認可コード・アクセストークン・リフレッシュトークン）の
 * 保存データの行を読む（ログインの状態の Session は含めない）
 */
export async function findIssuedOAuthRecords(userId: string) {
  return getPrismaClient().oAuthStoreRecord.findMany({
    where: {
      kind: { in: ['Grant', 'AuthorizationCode', 'AccessToken', 'RefreshToken'] },
      payload: { path: ['accountId'], equals: userId },
    },
    select: { id: true, kind: true },
    orderBy: { id: 'asc' },
  });
}

/**
 * E2E で作った認可サーバーの保存データと同意の手続きの Redis の鍵を消す
 *
 * 接続は利用者の削除に連なって消えるので、利用者を消す前でも後でも呼べる。
 *
 * @param userIds - 同意の手続きを行った利用者
 * @param uids - 同意の手続きの uid
 */
export async function cleanupOAuthArtifacts(
  userIds: readonly string[],
  uids: readonly string[]
): Promise<void> {
  const prisma = getPrismaClient();
  if (userIds.length > 0) {
    await prisma.oAuthStoreRecord.deleteMany({
      where: { OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })) },
    });
  }
  if (uids.length > 0) {
    // 申し込みの手続き（Interaction）の行は ID が `Interaction:<uid>` で、uid の列を持たない
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        OR: [{ id: { in: uids.map((uid) => `Interaction:${uid}`) } }, { uid: { in: [...uids] } }],
      },
    });
    const keys = uids.flatMap((uid) => [
      `oauth:consent:finish:${uid}`,
      ...userIds.flatMap((userId) => [
        `oauth:consent:2fa-pass:${uid}:${userId}`,
        `oauth:consent:generation:${uid}:${userId}`,
      ]),
    ]);
    const client = new Redis(resolveE2eRedisUrl(), {
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.del(...keys);
    } finally {
      client.disconnect();
    }
  }
}
