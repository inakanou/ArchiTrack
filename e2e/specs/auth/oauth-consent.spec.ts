/**
 * @fileoverview 外部アプリの接続の同意の流れの E2E テスト
 *
 * user-authentication タスク79.2。design.md「Requirements 46-51」の System Flows（接続の同意）と
 * ConsentPage・ConsentRoutes の節。試験の compose の実際の nginx（画面の配信元）・backend・DB を通し、
 * 試験用のアプリ（docker-compose.test.yml の `architrack-test-client`）の認可の要求をブラウザで開く。
 *
 * Requirements coverage (user-authentication):
 * - REQ-46.2: 権限「外部アプリの接続」を持つ利用者の同意で接続が作られ、交換したトークンが使える
 * - REQ-46.3: 権限を持たない利用者には権限が無いことを示し、接続を作らず拒否でアプリへ戻せる
 * - REQ-46.7: パスワードの変更または 2FA の登録を求められている利用者には案内だけを示し、同意の API も拒み、
 *   接続を作らない
 * - REQ-47.1: 未ログインの申し込みはログインを求め、ログインの後に同じ申し込みの同意の画面へ戻る
 * - REQ-47.2: ログイン中でも申し込みごとに 2FA を求め、同じブラウザの 2 回目の申し込みも 2FA へ戻る
 * - REQ-47.4: 同意の画面にアプリの名称・戻り先のホスト名・利用者・範囲・期限を示す
 * - REQ-47.5: 「読み取り」は外せず、「書き込み」は既定で未選択（そのまま同意すると読み取りだけの接続）
 * - REQ-47.6: 同意で選んだ範囲の接続が作られ、戻り先へ認可コードが返り、交換できる
 * - REQ-47.7: 拒否（2FA の段階・同意の段階）で戻り先へ `access_denied` が返り、接続もトークンも作られない
 * - REQ-47.11: 同意の送信は CSRF のトークンが無いと拒まれ、同意の画面は他のサイトの枠内に表示されない
 *   （応答の CSP `frame-ancestors 'none'` と `X-Frame-Options: DENY`）
 *
 * 観測の方針:
 * - ArchiTrack の応答は差し替えない。外部アプリの戻り先は試験の工程の中の loopback の受け口で受ける
 * - 同意の画面の 2FA は、ログインで使った時間ステップの次の時間ステップを実際に待つ（人と同じ操作）。
 *   未ログインからの一連の人の操作（ログイン・次のコードの待ち・同意）が、申し込みの手続きの有効期間
 *   （600 秒）に収まることも測る（タスク79.1 の申し送り）
 * - 利用者はテストの中で作り（`createSessionUser`）、後で接続・保存データ・Redis の鍵とともに消す
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import {
  OAUTH_APP_ORIGIN,
  OAUTH_TEST_CLIENT,
  buildAuthorizationRequest,
  cleanupOAuthArtifacts,
  consentUidOf,
  exchangeAuthorizationCode,
  findConnections,
  findIssuedOAuthRecords,
  newExternalAppRequestContext,
  openAuthorizationAndLogin as openAuthorizationAndLoginFlow,
  passConsentSecondFactor,
  startOAuthCallbackServer,
  waitForOAuthCallback,
  type OAuthCallbackServer,
  type OAuthTokenResponse,
} from '../../helpers/oauth-consent-flow';
import { headerValues, parseCsp } from '../../helpers/frontend-security-headers';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
  type TestUserState,
} from '../../fixtures/auth.fixtures';

/** 申し込みの手続き（Interaction）の有効期間（design.md の OAuthProviderHost） */
const INTERACTION_TTL_MS = 600_000;

const NEXT_CODE_NOTICE = 'ログインで使ったコードは使えません。次のコードをお待ちください';
const PERMISSION_MESSAGE = '外部アプリを接続する権限がありません。管理者に依頼してください。';

/** 要件34 の制限中の利用者の 2 つの状態（OAuthConsentPage の restrictedMessage と restrictedPathFor） */
const RESTRICTED_CASES = [
  {
    label: 'パスワードの変更を求められている',
    state: { twoFactor: true, mustChangePassword: true },
    message:
      'パスワードの変更が済んでいないため、外部アプリを接続できません。設定を済ませてからアプリで接続し直してください。',
    setupPath: '/setup/password',
    code: 'PASSWORD_CHANGE_REQUIRED',
  },
  {
    label: '2FA の登録を求められている',
    state: { twoFactor: false },
    message:
      '二要素認証の設定が済んでいないため、外部アプリを接続できません。設定を済ませてからアプリで接続し直してください。',
    setupPath: '/profile/2fa-setup',
    code: 'TWO_FACTOR_SETUP_REQUIRED',
  },
] as const satisfies readonly {
  label: string;
  state: TestUserState;
  message: string;
  setupPath: string;
  code: string;
}[];

const CONSENT_API_PATH =
  /^\/oauth\/interaction\/[A-Za-z0-9_-]{43}\/(details|second-factor|approve|deny)$/;

const createdUserIds: string[] = [];
const consentUids: string[] = [];

async function createUser(role: 'REGULAR_USER' | 'ADMIN_USER', state: TestUserState = {}) {
  const user: SessionUser = await createSessionUser(role, state);
  createdUserIds.push(user.id);
  return user;
}

function isConsentApi(request: Request, action: string, method: 'GET' | 'POST'): boolean {
  const match = CONSENT_API_PATH.exec(new URL(request.url()).pathname);
  return match?.[1] === action && request.method() === method;
}

/**
 * 認可の要求を開き、未ログインならログイン画面へ送られたことを確かめてからログインする（47.1）。
 * 主張が失敗しても後始末できるよう、uid は主張より先に記録する
 */
async function openAuthorizationAndLogin(page: Page, user: SessionUser, url: string) {
  return openAuthorizationAndLoginFlow(page, user, url, (uid) => consentUids.push(uid));
}

test.describe('外部アプリの接続の同意（user-authentication 79.2）', () => {
  let callbackServer: OAuthCallbackServer;

  test.beforeEach(async () => {
    callbackServer = await startOAuthCallbackServer();
  });

  test.afterEach(async () => {
    await callbackServer.close();
    await cleanupOAuthArtifacts(createdUserIds, consentUids);
    await deleteSessionUsers();
    createdUserIds.length = 0;
    consentUids.length = 0;
  });

  /**
   * @requirement user-authentication/REQ-46.2
   * @requirement user-authentication/REQ-47.1
   * @requirement user-authentication/REQ-47.2
   * @requirement user-authentication/REQ-47.4
   * @requirement user-authentication/REQ-47.5
   * @requirement user-authentication/REQ-47.6
   * @requirement user-authentication/REQ-47.7
   * @requirement user-authentication/REQ-47.11
   */
  test('未ログインからログインと 2FA を通して同意すると読み取りだけの接続ができ、2 回目の申し込みも 2FA と同意へ戻る', async ({
    page,
  }) => {
    // 次の TOTP の時間ステップを 2 回実際に待つ（各最大 30 秒）
    test.setTimeout(getTimeout(240_000));
    const user = await createUser('ADMIN_USER');
    const authorization = buildAuthorizationRequest();
    const startedAt = Date.now();

    const detailsRequest = page.waitForRequest(
      (request) => isConsentApi(request, 'details', 'GET'),
      {
        timeout: getTimeout(60000),
      }
    );
    const detailsResponse = page.waitForResponse(
      (response) => isConsentApi(response.request(), 'details', 'GET'),
      { timeout: getTimeout(60000) }
    );
    const { uid, document } = await openAuthorizationAndLogin(page, user, authorization.url);

    // 47.11: 同意の画面の応答（nginx の配信）は他のサイトの枠内への表示を禁じる
    const documentHeaders = await document.headersArray();
    const csp = headerValues(documentHeaders, 'content-security-policy');
    expect(csp, '同意の画面の応答の CSP が一つある').toHaveLength(1);
    expect(parseCsp(csp[0]!)['frame-ancestors']).toEqual(["'none'"]);
    expect(headerValues(documentHeaders, 'x-frame-options')).toEqual(['DENY']);

    // 同意の API へ手続きの Cookie（_interaction）が画面の配信元を経て届く（タスク79.1 の申し送り）
    const sentDetails = await detailsRequest;
    expect(new URL(sentDetails.url()).origin).toBe(OAUTH_APP_ORIGIN);
    expect((await sentDetails.allHeaders()).cookie ?? '').toMatch(/(?:^|;\s*)_interaction=/);
    const details = await detailsResponse;
    expect(details.status()).toBe(200);
    expect(await details.json()).toMatchObject({ secondFactorVerified: false });
    const screenAuthorization = await sentDetails.headerValue('authorization');
    expect(screenAuthorization, '同意の API に画面用のアクセストークンが付く').toMatch(/^Bearer /);

    // 47.2: ログインの直後でも、同意の内容より先に 2FA を求める
    await expect(page.getByText(NEXT_CODE_NOTICE)).toBeVisible();
    await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);
    const firstWaitMs = await passConsentSecondFactor(page, user);

    // 47.4: アプリの名称・戻り先のホスト名・利用者・範囲・期限
    const details2 = page.getByRole('region', { name: '接続の内容' });
    await expect(details2.getByText(OAUTH_TEST_CLIENT.displayName, { exact: true })).toBeVisible();
    await expect(details2.getByText('127.0.0.1', { exact: true })).toBeVisible();
    await expect(details2.getByText(`${user.displayName}（${user.email}）`)).toBeVisible();
    const expiry = page.getByRole('region', { name: '接続の期限' });
    await expect(expiry.getByText('最後に使われてから 30 日間使われなかったとき')).toBeVisible();
    await expect(
      expiry.getByText('同意から 90 日が過ぎたとき（使っていても延長されません）')
    ).toBeVisible();

    // 47.5: 読み取りは外せず、書き込みは既定で未選択
    const read = page.getByRole('checkbox', { name: '読み取り（必須）' });
    const write = page.getByRole('checkbox', { name: '書き込み（任意）' });
    await expect(read).toBeChecked();
    await expect(read).toBeDisabled();
    await expect(write).not.toBeChecked();
    await expect(write).toBeEnabled();

    // 47.11: CSRF のトークンの無い同意の送信は、画面用のトークンと手続きの Cookie があっても拒まれる
    const forged = await page.request.post(`${OAUTH_APP_ORIGIN}/oauth/interaction/${uid}/approve`, {
      headers: { Authorization: screenAuthorization!, Origin: OAUTH_APP_ORIGIN },
      data: { scopes: ['read', 'write'] },
    });
    expect(forged.status()).toBe(403);
    expect(await forged.json()).toMatchObject({ code: 'CSRF_TOKEN_MISSING' });
    expect(await findConnections(user.id), 'CSRF で拒まれた送信は接続を作らない').toEqual([]);

    // 46.2・47.6: 書き込みを選ばずに同意する
    const approveRequest = page.waitForRequest((request) =>
      isConsentApi(request, 'approve', 'POST')
    );
    await page.getByRole('button', { name: '許可する' }).click();
    const sentApprove = await approveRequest;
    expect(
      await sentApprove.headerValue('x-csrf-token'),
      '同意の送信に CSRF のトークンが付く'
    ).toBeTruthy();
    expect(sentApprove.postDataJSON()).toEqual({ scopes: ['read'] });
    const callback = await waitForOAuthCallback(page, authorization);
    const code = callback.searchParams.get('code');
    expect(callback.searchParams.get('error')).toBeNull();
    expect(code, '戻り先へ認可コードが返る').toBeTruthy();

    // 人の操作（未ログインからのログイン・次のコードの待ち・同意）が申し込みの手続きの有効期間に収まる
    const humanFlowMs = Date.now() - startedAt;
    test.info().annotations.push({
      type: 'oauth-consent-flow-duration',
      description: `未ログインから戻り先まで ${humanFlowMs} ms（次のコードの待ち ${firstWaitMs} ms）`,
    });
    expect(humanFlowMs).toBeLessThan(INTERACTION_TTL_MS);

    const connections = await findConnections(user.id);
    expect(connections).toEqual([
      expect.objectContaining({ clientId: OAUTH_TEST_CLIENT.clientId, scopes: ['read'] }),
    ]);

    // 47.6: 認可コードは外部アプリ（ブラウザの Cookie を持たない）の交換でトークンになり、読み取りだけ使える
    const api = await newExternalAppRequestContext();
    try {
      const exchanged = await exchangeAuthorizationCode(api, code!, authorization.verifier);
      expect(exchanged.status).toBe(200);
      expect(exchanged.cacheControl).toBe('no-store');
      const tokens = exchanged.body as OAuthTokenResponse;
      expect(tokens.scope, '書き込みを選ばなかった同意のトークンは読み取りだけ').toBe('read');
      expect(tokens.refresh_token, 'リフレッシュトークンも発行される').toBeTruthy();
      const bearer = { Authorization: `Bearer ${tokens.access_token}` };
      const whoami = await api.get('/oauth/resource/whoami', { headers: bearer });
      expect(whoami.status()).toBe(200);
      const writeAccess = await api.get('/oauth/resource/whoami/write-access', { headers: bearer });
      expect(writeAccess.status(), '書き込みを選ばなかった接続の書き込みは 403').toBe(403);
    } finally {
      await api.dispose();
    }
    const issued = await findIssuedOAuthRecords(user.id);
    expect(new Set(issued.map((record) => record.kind))).toEqual(
      new Set(['Grant', 'AuthorizationCode', 'AccessToken', 'RefreshToken'])
    );

    // 47.2: 同じブラウザ（ログイン中）の 2 回目の申し込みは、ログインを求めずに再び 2FA へ戻る
    const second = buildAuthorizationRequest();
    const secondDetails = page.waitForResponse(
      (response) => isConsentApi(response.request(), 'details', 'GET'),
      { timeout: getTimeout(30000) }
    );
    const secondDocument = await page.goto(second.url);
    expect(secondDocument).not.toBeNull();
    const secondUid = new URL(secondDocument!.url()).pathname.split('/').pop()!;
    consentUids.push(secondUid);
    expect(secondUid).not.toBe(uid);
    expect((await secondDetails).status()).toBe(200);
    expect(consentUidOf(page)).toBe(secondUid);
    await expect(page.getByLabel(/メールアドレス/)).toHaveCount(0);
    await expect(page.getByText(NEXT_CODE_NOTICE)).toBeVisible();
    await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);
    await passConsentSecondFactor(page, user);

    // 47.5: 2 回目も書き込みは既定で未選択。47.7: 同意の段階の拒否で access_denied が返る
    await expect(page.getByRole('checkbox', { name: '書き込み（任意）' })).not.toBeChecked();
    await page.getByRole('button', { name: '拒否する' }).click();
    const denied = await waitForOAuthCallback(page, second);
    expect(denied.searchParams.get('error')).toBe('access_denied');
    expect(denied.searchParams.get('code')).toBeNull();
    // 拒否は接続もトークンも作らず、前の同意の接続を変えない
    expect(await findConnections(user.id)).toEqual(connections);
    expect(await findIssuedOAuthRecords(user.id)).toEqual(issued);
  });

  /**
   * @requirement user-authentication/REQ-47.2
   * @requirement user-authentication/REQ-47.7
   */
  test('2FA の段階で拒否すると戻り先へ access_denied が返り、接続もトークンも作られない', async ({
    page,
  }) => {
    const user = await createUser('ADMIN_USER');
    const authorization = buildAuthorizationRequest();
    await openAuthorizationAndLogin(page, user, authorization.url);

    await expect(page.getByTestId('totp-digit-0')).toBeVisible();
    await page.getByRole('button', { name: '接続を拒否する' }).click();
    const callback = await waitForOAuthCallback(page, authorization);
    expect(callback.searchParams.get('error')).toBe('access_denied');
    expect(callback.searchParams.get('code')).toBeNull();
    expect(await findConnections(user.id)).toEqual([]);
    expect(await findIssuedOAuthRecords(user.id)).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-46.3
   * @requirement user-authentication/REQ-47.7
   */
  test('権限の無い利用者には権限が無いことを示し、接続を作らず拒否でアプリへ戻せる', async ({
    page,
  }) => {
    const user = await createUser('REGULAR_USER');
    const authorization = buildAuthorizationRequest();
    const detailsResponse = page.waitForResponse(
      (response) => isConsentApi(response.request(), 'details', 'GET'),
      { timeout: getTimeout(60000) }
    );
    await openAuthorizationAndLogin(page, user, authorization.url);

    const details = await detailsResponse;
    expect(details.status()).toBe(403);
    expect(await details.json()).toMatchObject({ code: 'PERMISSION_REQUIRED' });
    await expect(page.getByRole('alert')).toHaveText(PERMISSION_MESSAGE);
    await expect(page.getByTestId('totp-digit-0')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);

    await page.getByRole('button', { name: '接続を拒否してアプリへ戻る' }).click();
    const callback = await waitForOAuthCallback(page, authorization);
    expect(callback.searchParams.get('error')).toBe('access_denied');
    expect(callback.searchParams.get('code')).toBeNull();
    expect(await findConnections(user.id)).toEqual([]);
    expect(await findIssuedOAuthRecords(user.id)).toEqual([]);
  });

  for (const restricted of RESTRICTED_CASES) {
    /** @requirement user-authentication/REQ-46.7 */
    test(`${restricted.label}利用者には案内だけを示し、同意の API も拒んで接続を作らない`, async ({
      page,
    }) => {
      const user = await createUser('ADMIN_USER', restricted.state);
      const authorization = buildAuthorizationRequest();
      const screenRequests: Request[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/v1/')) screenRequests.push(request);
      });
      const { uid } = await openAuthorizationAndLogin(page, user, authorization.url);

      await expect(page.getByRole('alert')).toHaveText(restricted.message);
      await expect(page.getByRole('link', { name: '設定へ進む' })).toHaveAttribute(
        'href',
        restricted.setupPath
      );
      await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /拒否/ })).toHaveCount(0);

      // 画面を経ずに同意の API へ送っても、制限中の利用者は拒まれる
      const authorized = await Promise.all(
        screenRequests.map(async (request) => request.headerValue('authorization'))
      );
      const bearer = authorized.find((value) => value?.startsWith('Bearer '));
      expect(bearer, '画面が画面用のアクセストークンで API を呼んでいる').toBeTruthy();
      const csrf = await page.request.get(`${OAUTH_APP_ORIGIN}/csrf-token`);
      expect(csrf.status()).toBe(200);
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      const detailsResponse = await page.request.get(
        `${OAUTH_APP_ORIGIN}/oauth/interaction/${uid}/details`,
        { headers: { Authorization: bearer! } }
      );
      expect(detailsResponse.status()).toBe(403);
      expect(await detailsResponse.json()).toMatchObject({ code: restricted.code });
      const approveResponse = await page.request.post(
        `${OAUTH_APP_ORIGIN}/oauth/interaction/${uid}/approve`,
        {
          headers: {
            Authorization: bearer!,
            Origin: OAUTH_APP_ORIGIN,
            'X-CSRF-Token': csrfToken,
          },
          data: { scopes: ['read'] },
        }
      );
      expect(approveResponse.status()).toBe(403);
      expect(await approveResponse.json()).toMatchObject({ code: restricted.code });
      expect(await findConnections(user.id)).toEqual([]);
      expect(await findIssuedOAuthRecords(user.id)).toEqual([]);
    });
  }

  /** @requirement user-authentication/REQ-47.11 */
  test('同意の画面は他のサイトの枠内に表示されない', async ({ page }) => {
    const consentUrl = `${OAUTH_APP_ORIGIN}/connect/consent/${'A'.repeat(43)}`;
    const framed = page.waitForResponse((response) => response.url() === consentUrl, {
      timeout: getTimeout(15000),
    });
    await page.goto(callbackServer.framingPageUrl(consentUrl));
    const response = await framed;
    expect(response.status()).toBe(200);
    const headers = await response.headersArray();
    const csp = headerValues(headers, 'content-security-policy');
    expect(csp).toHaveLength(1);
    expect(parseCsp(csp[0]!)['frame-ancestors']).toEqual(["'none'"]);
    expect(headerValues(headers, 'x-frame-options')).toEqual(['DENY']);

    // ブラウザが枠内の表示を拒み、枠はエラーの文書になって同意の画面（SPA の #root）が読み込まれない
    await expect
      .poll(
        () =>
          page
            .frames()
            .find((frame) => frame !== page.mainFrame())
            ?.url(),
        {
          timeout: getTimeout(10000),
        }
      )
      .toBe('chrome-error://chromewebdata/');
    await expect(page.frameLocator('#target').locator('#root')).toHaveCount(0);
  });
});
