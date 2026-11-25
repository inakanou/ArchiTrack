/**
 * @fileoverview 外部アプリの接続の一覧と取り消しの E2E テスト
 *
 * user-authentication タスク79.3。design.md「Requirements 46-51」の ExternalAppRoutes（本人用と管理者用の
 * 一覧と DELETE）・ConnectedAppsPage・AdminConnectionsPage・ExternalAppConnectionService（取り消しと理由
 * USER_REVOKED / ADMIN_REVOKED、監査 CONNECTION_ENDED）・ExternalAppTokenVerifier（取り消しの後の 401）の節。
 * 試験の compose の実際の nginx（画面の配信元）・backend・DB を通す。接続は、タスク79.2 と同じ同意の画面の
 * 流れ（ログイン・次の TOTP の 2FA・同意・認可コードの交換）で作る。
 *
 * Requirements coverage (user-authentication):
 * - REQ-49.1: プロフィールの導線から開く連携中のアプリの画面に、同意で作った本人の接続だけが、アプリの名称・
 *   操作の範囲・同意の日時・最後に使われた日時・期限とともに出る
 * - REQ-49.2: 接続が無い利用者と、取り消しの後の本人には、連携中のアプリが無いことを示す
 * - REQ-49.3: 取り消しは確認のダイアログを経る（キャンセルでは取り消さない）
 * - REQ-49.4: 本人の取り消しで接続と全てのトークンの行が消え、監査に理由 USER_REVOKED が残る
 * - REQ-49.5: 管理者でない利用者が本人用の取り消しで他の利用者の接続を指定すると 404 で拒まれ、接続は残る
 * - REQ-49.6: 管理者の接続の管理画面に全利用者の接続が、利用者・アプリ・範囲・日時・期限とともに出る
 * - REQ-49.7: 管理画面で、画面が出す利用者の選択肢とアプリの client ID で絞り込み、ページを切り替える
 * - REQ-49.8: 管理者の取り消しで対象の接続と全てのトークンの行だけが消え、監査に理由 ADMIN_REVOKED が残る
 * - REQ-49.9: 管理者でない利用者には管理画面を出さず、全利用者の一覧と管理者の取り消しの API は 403
 * - REQ-48.9: 取り消した接続のアクセストークンは 401（再度の同意へ進む `WWW-Authenticate: Bearer`）、
 *   リフレッシュトークンは `invalid_grant` になる
 * - REQ-48.10: 外部アプリの利用（最後に使われた日時の記録）は、利用者の最終ログインの日時を変えない
 *
 * 観測の方針:
 * - ArchiTrack の応答は差し替えない。外部アプリの戻り先は試験の工程の中の loopback の受け口で受ける
 * - 接続は同意の画面の流れでだけ作る。例外はページの切り替え（49.7）の 1 か所で、1 ページの最小の件数（10）を
 *   超えるための表示だけの接続の行を DB に足す。49.7 は一覧の表示だけの要件で、同意を 11 回通すと 1 件の試験が
 *   6 分を超えるためである。足した行の利用者はこの spec が作り、後始末で消す
 * - 画面の日時は、DB の値を画面と同じ形（`formatDateTime` の `ja-JP` の年月日時分）にした値と比べる。期限は
 *   最後の利用から 30 日と同意から 90 日の早い方（画面は実際に使えなくなる日時を示す）
 * - 利用者はテストの中で作り（`createSessionUser`）、後で接続・保存データ・Redis の鍵とともに消す
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import {
  OAUTH_APP_ORIGIN,
  OAUTH_TEST_CLIENT,
  cleanupOAuthArtifacts,
  connectViaConsent,
  findConnectionEndedAudits,
  findConnectionsWithTimes,
  findIssuedOAuthRecords,
  newExternalAppRequestContext,
  refreshExternalAppToken,
  startOAuthCallbackServer,
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

const APP_NAME = OAUTH_TEST_CLIENT.displayName;
const OWN_LIST_PATH = '/api/v1/external-app-connections';
const ADMIN_LIST_PATH = '/api/v1/admin/external-app-connections';
const EMPTY_OWN_LIST = '連携中のアプリはありません。';
/** 1 ページの件数の選択肢の最小（PaginationUI の LIMIT_OPTIONS） */
const SMALLEST_PAGE_LIMIT = 10;

const createdUserIds: string[] = [];
const consentUids: string[] = [];
const openedContexts: BrowserContext[] = [];

async function createUser(role: 'REGULAR_USER' | 'ADMIN_USER') {
  const user: SessionUser = await createSessionUser(role);
  createdUserIds.push(user.id);
  return user;
}

function recordUid(uid: string): void {
  consentUids.push(uid);
}

/** 別の利用者のためのブラウザのコンテキストを開く（後始末で閉じる） */
async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  openedContexts.push(context);
  return context.newPage();
}

/** 画面の `formatDateTime`（`ja-JP` の年月日時分）と同じ形 */
function shownDateTime(date: Date): string {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 画面の「期限」の期待値: 実際に使えなくなる日時。最後の利用（未使用なら同意）から 30 日（要件48.2）と
 * 同意から 90 日（DB の expiresAt。要件48.3）の早い方
 */
function effectiveExpiry(connection: {
  consentedAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}): Date {
  const idle = (connection.lastUsedAt ?? connection.consentedAt).getTime() + 30 * DAY_MS;
  return new Date(Math.min(idle, connection.expiresAt.getTime()));
}

/** 利用者のただ一つの接続を DB から読む（無ければ失敗する） */
async function onlyConnectionOf(userId: string) {
  const connections = await findConnectionsWithTimes(userId);
  expect(connections, '利用者の接続は 1 件').toHaveLength(1);
  return connections[0]!;
}

/** 利用者の最終ログインの日時を DB から読む */
async function lastLoginAtOf(userId: string): Promise<Date | null> {
  const user = await getPrismaClient().user.findUniqueOrThrow({
    where: { id: userId },
    select: { lastLoginAt: true },
  });
  return user.lastLoginAt;
}

/** 外部アプリのアクセストークンで確認用の窓口を呼び、状態と応答の `WWW-Authenticate` を返す */
async function callWhoami(token: OAuthTokenResponse) {
  const api = await newExternalAppRequestContext();
  try {
    const response = await api.get('/oauth/resource/whoami', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    return { status: response.status(), wwwAuthenticate: response.headers()['www-authenticate'] };
  } finally {
    await api.dispose();
  }
}

/** 取り消した接続のトークンが使えないこと（48.9）を主張する */
async function expectTokensUnusable(token: OAuthTokenResponse) {
  const whoami = await callWhoami(token);
  expect(whoami.status, '取り消した接続のアクセストークンは 401').toBe(401);
  // 外部アプリが再度の同意へ進める Bearer の案内（保護されたリソースの情報の URL を示す）
  expect(whoami.wwwAuthenticate).toBe(
    `Bearer error="invalid_token", resource_metadata="${OAUTH_APP_ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="read write"`
  );
  const api = await newExternalAppRequestContext();
  try {
    const refreshed = await refreshExternalAppToken(api, token.refresh_token!);
    expect(refreshed.status, '取り消した接続のリフレッシュトークンは更新できない').toBe(400);
    expect(refreshed.body).toMatchObject({ error: 'invalid_grant' });
  } finally {
    await api.dispose();
  }
}

/** 使った接続の最後に使われた日時が記録されるまで待ち、接続を返す */
async function useConnection(userId: string, token: OAuthTokenResponse) {
  expect((await callWhoami(token)).status, '取り消す前のアクセストークンは使える').toBe(200);
  await expect
    .poll(async () => (await onlyConnectionOf(userId)).lastUsedAt !== null, {
      timeout: getTimeout(10000),
    })
    .toBe(true);
  return onlyConnectionOf(userId);
}

/**
 * ページの切り替え（49.7）のための表示だけの接続の行を足す（冒頭の観測の方針の例外）。
 * 同意の日時を `olderThan` より古くし、同意の新しい順の一覧で同意の流れの接続の後ろに並べる
 *
 * @returns 一覧に並ぶ順（新しい順）の利用者
 */
async function seedDisplayOnlyConnections(count: number, olderThan: Date) {
  const users: SessionUser[] = [];
  for (let index = 0; index < count; index += 1) {
    const user = await createUser('ADMIN_USER');
    const consentedAt = new Date(olderThan.getTime() - (index + 1) * 1000);
    await getPrismaClient().externalAppConnection.create({
      data: {
        userId: user.id,
        clientId: OAUTH_TEST_CLIENT.clientId,
        grantId: `e2e-display-only-${user.id}`,
        scopes: ['read'],
        consentedAt,
        expiresAt: new Date(consentedAt.getTime() + 90 * DAY_MS),
      },
    });
    users.push(user);
  }
  return users;
}

/** 管理画面の一覧の要求の応答を待つ（条件はクエリで比べる） */
function waitForAdminList(page: Page, expected: Record<string, string>) {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === ADMIN_LIST_PATH &&
        response.request().method() === 'GET' &&
        Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value)
      );
    },
    { timeout: getTimeout(15000) }
  );
}

test.describe('外部アプリの接続の一覧と取り消し（user-authentication 79.3）', () => {
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
   * @requirement user-authentication/REQ-49.1
   * @requirement user-authentication/REQ-49.2
   * @requirement user-authentication/REQ-49.3
   * @requirement user-authentication/REQ-49.4
   * @requirement user-authentication/REQ-48.9
   * @requirement user-authentication/REQ-48.10
   */
  test('同意で作った接続が本人の一覧に出て、確認の後に本人が取り消すとトークンが使えなくなる', async ({
    page,
  }) => {
    // 次の TOTP の時間ステップを 1 回実際に待つ（最大 30 秒）
    test.setTimeout(getTimeout(180_000));
    const owner = await createUser('ADMIN_USER');
    const startedAt = new Date(Date.now() - 5000);
    const token = await connectViaConsent(page, owner, { grantWrite: true, recordUid });
    const loggedIn = await lastLoginAtOf(owner.id);
    expect(loggedIn, '同意の前のログインが最終ログインとして記録されている').not.toBeNull();
    const connection = await useConnection(owner.id, token);
    // 48.10: 外部アプリの利用は記録されるが、最終ログインの日時は変わらない
    expect(connection.lastUsedAt!.getTime()).toBeGreaterThan(loggedIn!.getTime());
    expect(await lastLoginAtOf(owner.id)).toEqual(loggedIn);

    // 49.1: プロフィールの導線から開くと、本人の接続が名称・範囲・日時・期限とともに出る
    await page.goto('/profile');
    await page.getByRole('link', { name: '連携中のアプリ', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/connected-apps', {
      timeout: getTimeout(15000),
    });
    const items = page.getByRole('list', { name: '連携中のアプリ' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    const item = items.first();
    await expect(item.getByRole('heading', { name: APP_NAME, exact: true })).toBeVisible();
    await expect(item.getByRole('term')).toHaveText([
      '許可している操作',
      '同意した日時',
      '最後に使われた日時',
      '期限',
    ]);
    await expect(item.getByRole('definition')).toHaveText([
      '読み取り、書き込み',
      shownDateTime(connection.consentedAt),
      shownDateTime(connection.lastUsedAt!),
      shownDateTime(effectiveExpiry(connection)),
    ]);

    // 49.3: 取り消しは確認のダイアログを経て、キャンセルでは取り消さない
    const revokeButton = item.getByRole('button', { name: `「${APP_NAME}」の接続を取り消す` });
    await revokeButton.click();
    const dialog = page.getByRole('dialog', { name: '接続の取り消し' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`「${APP_NAME}」の接続を取り消しますか？`)).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(items).toHaveCount(1);
    expect(await findConnectionsWithTimes(owner.id), 'キャンセルでは接続が残る').toEqual([
      connection,
    ]);

    // 49.4: 確定すると、CSRF の付いた本人用の DELETE で取り消される
    await revokeButton.click();
    const deleteResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${OWN_LIST_PATH}/${connection.id}` &&
        response.request().method() === 'DELETE',
      { timeout: getTimeout(15000) }
    );
    await dialog.getByRole('button', { name: '取り消す', exact: true }).click();
    const deleted = await deleteResponse;
    expect(deleted.status()).toBe(204);
    expect(await deleted.request().headerValue('x-csrf-token')).toBeTruthy();
    await expect(
      page.getByRole('status').filter({ hasText: `「${APP_NAME}」の接続を取り消しました。` })
    ).toBeVisible();
    // 49.2: 取り消しの後は連携中のアプリが無いことを示し、読み込み直しても戻らない
    await expect(page.getByText(EMPTY_OWN_LIST)).toBeVisible();
    await page.reload();
    await expect(page.getByText(EMPTY_OWN_LIST)).toBeVisible();
    await expect(page.getByRole('list', { name: '連携中のアプリ' })).toHaveCount(0);

    // 49.4: 接続と全てのトークンの行が消え、監査に本人の取り消しが残る
    expect(await findConnectionsWithTimes(owner.id)).toEqual([]);
    expect(await findIssuedOAuthRecords(owner.id)).toEqual([]);
    expect(await findConnectionEndedAudits(owner.id, startedAt)).toEqual([
      {
        actorId: owner.id,
        targetId: owner.id,
        metadata: expect.objectContaining({
          clientId: OAUTH_TEST_CLIENT.clientId,
          scopes: ['read', 'write'],
          reason: 'USER_REVOKED',
        }),
      },
    ]);

    // 48.9: 取り消した接続のアクセストークンは 401、リフレッシュトークンは invalid_grant
    await expectTokensUnusable(token);
  });

  /**
   * @requirement user-authentication/REQ-49.6
   * @requirement user-authentication/REQ-49.7
   * @requirement user-authentication/REQ-49.8
   * @requirement user-authentication/REQ-48.9
   */
  test('管理者は全利用者の接続を一覧し、利用者・アプリで絞り込み、ページを切り替え、他の利用者の接続を取り消せる', async ({
    page,
    browser,
  }) => {
    // 次の TOTP の時間ステップを 2 回実際に待つ（各最大 30 秒）
    test.setTimeout(getTimeout(300_000));
    const startedAt = new Date(Date.now() - 5000);
    const firstOwner = await createUser('ADMIN_USER');
    const secondOwner = await createUser('ADMIN_USER');
    const firstToken = await connectViaConsent(await openPage(browser), firstOwner, { recordUid });
    const secondToken = await connectViaConsent(await openPage(browser), secondOwner, {
      grantWrite: true,
      recordUid,
    });
    const firstConnection = await useConnection(firstOwner.id, firstToken);
    const secondConnection = await useConnection(secondOwner.id, secondToken);
    const seededUsers = await seedDisplayOnlyConnections(
      SMALLEST_PAGE_LIMIT,
      firstConnection.consentedAt
    );

    // 49.6: 管理メニューから接続の管理画面を開く
    const admin = await createUser('ADMIN_USER');
    await loginAsUser(page, admin);
    const initialList = waitForAdminList(page, { page: '1', limit: '20' });
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByRole('menuitem', { name: '外部アプリの接続' }).click();
    await page.waitForURL((url) => url.pathname === '/admin/external-app-connections', {
      timeout: getTimeout(15000),
    });
    expect((await initialList).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '外部アプリの接続' })).toBeVisible();
    const table = page.getByRole('table', { name: '外部アプリの接続の一覧' });
    const rowOf = (user: SessionUser) => table.getByRole('row').filter({ hasText: user.email });

    // 49.6: 他の利用者の接続も、利用者・アプリ・範囲・同意の日時・最後に使われた日時・期限とともに出る
    for (const [owner, connection, scopes] of [
      [firstOwner, firstConnection, '読み取り'],
      [secondOwner, secondConnection, '読み取り、書き込み'],
    ] as const) {
      const row = rowOf(owner);
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('rowheader')).toHaveText(`${owner.displayName}${owner.email}`);
      await expect(row.getByRole('cell')).toHaveText([
        `${APP_NAME}client ID: ${OAUTH_TEST_CLIENT.clientId}`,
        scopes,
        shownDateTime(connection.consentedAt),
        shownDateTime(connection.lastUsedAt!),
        shownDateTime(effectiveExpiry(connection)),
        '取り消す',
      ]);
    }

    // 49.7: 利用者の絞り込みは、画面が出す利用者の選択肢から選ぶ
    const userFilter = page.getByLabel('利用者', { exact: true });
    await expect(userFilter).toBeEnabled({ timeout: getTimeout(15000) });
    await userFilter.selectOption({ label: `${firstOwner.displayName}（${firstOwner.email}）` });
    const byUser = waitForAdminList(page, { userId: firstOwner.id, page: '1' });
    await page.getByRole('button', { name: '絞り込む', exact: true }).click();
    const byUserResponse = await byUser;
    expect(byUserResponse.status()).toBe(200);
    expect(new URL(byUserResponse.url()).searchParams.has('clientId')).toBe(false);
    expect((await byUserResponse.json()).pagination).toMatchObject({ total: 1 });
    await expect(rowOf(firstOwner)).toHaveCount(1);
    await expect(rowOf(secondOwner)).toHaveCount(0);

    // 49.7: 利用者とアプリの client ID を合わせて絞り込む
    await userFilter.selectOption({ label: `${secondOwner.displayName}（${secondOwner.email}）` });
    const clientFilter = page.getByLabel('アプリの client ID', { exact: true });
    await clientFilter.fill(OAUTH_TEST_CLIENT.clientId);
    const byUserAndClient = waitForAdminList(page, {
      userId: secondOwner.id,
      clientId: OAUTH_TEST_CLIENT.clientId,
    });
    await page.getByRole('button', { name: '絞り込む', exact: true }).click();
    expect((await (await byUserAndClient).json()).pagination).toMatchObject({ total: 1 });
    await expect(rowOf(secondOwner)).toHaveCount(1);
    await expect(rowOf(firstOwner)).toHaveCount(0);

    // 49.7: 合わない client ID では接続が出ない
    await clientFilter.fill('e2e-unknown-client');
    const byUnknownClient = waitForAdminList(page, { clientId: 'e2e-unknown-client' });
    await page.getByRole('button', { name: '絞り込む', exact: true }).click();
    expect((await (await byUnknownClient).json()).pagination).toMatchObject({ total: 0 });
    await expect(page.getByText('条件に合う接続はありません。')).toBeVisible();
    await expect(table).toHaveCount(0);

    // 49.7: アプリだけで絞り込み、1 ページ 10 件にしてページを切り替える
    await page.getByRole('button', { name: '条件をクリア', exact: true }).click();
    await clientFilter.fill(OAUTH_TEST_CLIENT.clientId);
    const byClient = waitForAdminList(page, { clientId: OAUTH_TEST_CLIENT.clientId });
    await page.getByRole('button', { name: '絞り込む', exact: true }).click();
    expect((await byClient).status()).toBe(200);
    const firstPage = waitForAdminList(page, {
      clientId: OAUTH_TEST_CLIENT.clientId,
      page: '1',
      limit: String(SMALLEST_PAGE_LIMIT),
    });
    await page.getByLabel('表示件数').selectOption(String(SMALLEST_PAGE_LIMIT));
    const firstPageBody = await (await firstPage).json();
    expect(firstPageBody.pagination.total).toBeGreaterThan(SMALLEST_PAGE_LIMIT);
    // 同意の新しい順: 同意の流れの 2 件、表示だけの行の新しい 8 件までが 1 ページ目
    await expect(table.getByRole('row')).toHaveCount(SMALLEST_PAGE_LIMIT + 1);
    await expect(rowOf(secondOwner)).toHaveCount(1);
    await expect(rowOf(firstOwner)).toHaveCount(1);
    await expect(rowOf(seededUsers[7]!)).toHaveCount(1);
    await expect(rowOf(seededUsers[8]!)).toHaveCount(0);
    const secondPage = waitForAdminList(page, {
      clientId: OAUTH_TEST_CLIENT.clientId,
      page: '2',
      limit: String(SMALLEST_PAGE_LIMIT),
    });
    await page.getByRole('button', { name: 'ページ 2', exact: true }).click();
    expect((await secondPage).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'ページ 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(rowOf(seededUsers[8]!)).toHaveCount(1);
    await expect(rowOf(seededUsers[9]!)).toHaveCount(1);
    await expect(rowOf(firstOwner)).toHaveCount(0);
    await expect(rowOf(secondOwner)).toHaveCount(0);
    const backToFirstPage = waitForAdminList(page, { page: '1' });
    await page.getByRole('button', { name: 'ページ 1', exact: true }).click();
    expect((await backToFirstPage).status()).toBe(200);

    // 49.8: 確認のダイアログの後に、管理者が他の利用者の接続を取り消す
    await rowOf(firstOwner)
      .getByRole('button', {
        name: `${firstOwner.displayName}の「${APP_NAME}」の接続を取り消す`,
      })
      .click();
    const dialog = page.getByRole('dialog', { name: '接続の取り消し' });
    await expect(
      dialog.getByText(
        `${firstOwner.displayName}（${firstOwner.email}）の「${APP_NAME}」の接続を取り消しますか？`
      )
    ).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${ADMIN_LIST_PATH}/${firstConnection.id}` &&
        response.request().method() === 'DELETE',
      { timeout: getTimeout(15000) }
    );
    await dialog.getByRole('button', { name: '取り消す', exact: true }).click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(
      page.getByRole('status').filter({
        hasText: `${firstOwner.displayName}の「${APP_NAME}」の接続を取り消しました。`,
      })
    ).toBeVisible();
    await expect(rowOf(firstOwner)).toHaveCount(0);
    await expect(rowOf(secondOwner)).toHaveCount(1);

    // 49.8: 対象の接続と全てのトークンの行が消え、監査に管理者の取り消しが残る
    expect(await findConnectionsWithTimes(firstOwner.id)).toEqual([]);
    expect(await findIssuedOAuthRecords(firstOwner.id)).toEqual([]);
    expect(await findConnectionEndedAudits(firstOwner.id, startedAt)).toEqual([
      {
        actorId: admin.id,
        targetId: firstOwner.id,
        metadata: expect.objectContaining({
          clientId: OAUTH_TEST_CLIENT.clientId,
          scopes: ['read'],
          reason: 'ADMIN_REVOKED',
        }),
      },
    ]);

    // 48.9: 取り消した接続のトークンは使えず、他の利用者の接続とトークンは変わらない
    await expectTokensUnusable(firstToken);
    expect((await callWhoami(secondToken)).status).toBe(200);
    expect(await findConnectionsWithTimes(secondOwner.id)).toHaveLength(1);
    expect(await findConnectionEndedAudits(secondOwner.id, startedAt)).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-49.2
   * @requirement user-authentication/REQ-49.5
   * @requirement user-authentication/REQ-49.9
   */
  test('管理者でない利用者には管理画面を出さず、全利用者の一覧・取り消しの API と他人の接続の取り消しを拒む', async ({
    page,
    browser,
  }) => {
    // 次の TOTP の時間ステップを 1 回実際に待つ（最大 30 秒）
    test.setTimeout(getTimeout(180_000));
    const startedAt = new Date(Date.now() - 5000);
    const owner = await createUser('ADMIN_USER');
    const ownerToken = await connectViaConsent(await openPage(browser), owner, { recordUid });
    const connection = await onlyConnectionOf(owner.id);

    // 49.2: 接続の無い利用者の連携中のアプリの画面は空で、他の利用者の接続を出さない
    const member = await createUser('REGULAR_USER');
    await loginAsUser(page, member);
    const ownListRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === OWN_LIST_PATH && request.method() === 'GET',
      { timeout: getTimeout(15000) }
    );
    await page.goto('/connected-apps');
    const sentOwnList = await ownListRequest;
    expect((await sentOwnList.response())?.status()).toBe(200);
    await expect(page.getByText(EMPTY_OWN_LIST)).toBeVisible();
    await expect(page.getByRole('heading', { name: APP_NAME, exact: true })).toHaveCount(0);
    const bearer = await sentOwnList.headerValue('authorization');
    expect(bearer, '画面が画面用のアクセストークンで API を呼んでいる').toMatch(/^Bearer /);

    // 49.9: 管理者でない利用者には管理メニューも接続の管理画面も出さない
    await expect(page.getByRole('button', { name: '管理メニュー' })).toHaveCount(0);
    await page.goto('/admin/external-app-connections');
    await expect(
      page.getByRole('heading', { level: 1, name: 'アクセス権限がありません' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '外部アプリの接続' })).toHaveCount(0);
    await expect(page.getByRole('table', { name: '外部アプリの接続の一覧' })).toHaveCount(0);

    // 49.9: 全利用者の一覧の API は、絞り込みの有無によらず 403
    for (const query of ['', `?userId=${owner.id}`]) {
      const listed = await page.request.get(`${OAUTH_APP_ORIGIN}${ADMIN_LIST_PATH}${query}`, {
        headers: { Authorization: bearer! },
      });
      expect(listed.status()).toBe(403);
      expect(await listed.json()).toMatchObject({ code: 'SYSTEM_ADMIN_REQUIRED' });
    }

    // 49.9・49.5: CSRF のトークンを揃えても、管理者の取り消しは 403、本人用の取り消しは 404
    const csrf = await page.request.get(`${OAUTH_APP_ORIGIN}/csrf-token`);
    expect(csrf.status()).toBe(200);
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const stateChangingHeaders = {
      Authorization: bearer!,
      Origin: OAUTH_APP_ORIGIN,
      'X-CSRF-Token': csrfToken,
    };
    const adminRevoke = await page.request.delete(
      `${OAUTH_APP_ORIGIN}${ADMIN_LIST_PATH}/${connection.id}`,
      { headers: stateChangingHeaders }
    );
    expect(adminRevoke.status()).toBe(403);
    expect(await adminRevoke.json()).toMatchObject({ code: 'SYSTEM_ADMIN_REQUIRED' });
    const ownRevoke = await page.request.delete(
      `${OAUTH_APP_ORIGIN}${OWN_LIST_PATH}/${connection.id}`,
      { headers: stateChangingHeaders }
    );
    expect(ownRevoke.status()).toBe(404);
    expect(await ownRevoke.json()).toMatchObject({ code: 'CONNECTION_NOT_FOUND' });

    // 拒まれた取り消しは接続もトークンも変えず、監査に接続の終了を残さない
    expect(await findConnectionsWithTimes(owner.id)).toEqual([connection]);
    expect((await callWhoami(ownerToken)).status).toBe(200);
    expect(await findConnectionEndedAudits(owner.id, startedAt)).toEqual([]);
  });
});
