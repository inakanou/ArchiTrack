/**
 * @fileoverview アカウントの無効化・棚卸し・管理者による 2FA の再設定の E2E テスト
 *
 * user-authentication タスク49.8。design.md の AccountStatusService・UserInventoryService の節と
 * UserInventoryPage の要約。管理者は棚卸し画面（`/admin/user-inventory`、49.6）から操作し、対象者は別の
 * ブラウザのコンテキストのセッションで観測する。
 *
 * Requirements coverage (user-authentication):
 * - 34.7: 棚卸し画面の 2FA の再設定で秘密鍵・バックアップコード・リフレッシュトークンが消え、再設定より前の
 *   アクセストークンによる 2FA の設定の要求が 401 になる（47.11 の世代の照合）
 * - 34.8: 再設定された対象者は次のログインで 2FA 設定の画面へ進む
 * - 34.9: 自分自身の行の 2FA の再設定は画面で押せず、API も 403 で拒否する
 * - 34.10: 再設定の記録（実行者・対象）が監査ログ画面に出る
 * - 36.1: 棚卸し画面の無効化で対象者の API とリフレッシュが 401 になる
 * - 36.2: 無効化された対象者のログインは正しいパスワードでもパスワード誤りと同じ応答になる
 * - 36.3: 棚卸し画面の再有効化で対象者が再びログインでき、API が通る
 * - 36.5: 自分自身の行の無効化は画面で押せず、API も 409 で拒否する（最後の有効なシステム管理者の拒否は
 *   共有の管理者の状態を壊すため E2E で扱わず、49.2 の統合テストが確かめる）
 * - 36.6: 無効化された担当者の表示名が案件の詳細と編集の画面に残る
 * - 36.7: ログインの成功で記録された最終ログイン日時
 * - 36.10: 棚卸し画面の各項目（最終ログイン日時を含む）
 * - 36.11: 状態と最終ログインからの経過日数による絞り込み
 * - 36.12: 一般ユーザーは棚卸し画面を開けず、棚卸しの API は 403
 * - 38.5: 担当者候補の API は有効な利用者の ID と表示名だけを返す
 *
 * 状態を変える対象には 47.4 の専用の利用者（`STATE_CHANGE_USER`）を使い、各テストの開始時に初期化の補助で
 * 戻す。通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 */

import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
  type Response,
} from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createTestUser, resetDedicatedUser, type CreatedUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getAccessToken, loginViaApi, waitForAuthenticatedSession } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

const INVENTORY_PATH = '/api/v1/users/inventory';
/** 棚卸し画面の 1 ページの件数（UserInventoryPage の PAGE_SIZE） */
const INVENTORY_PAGE_SIZE = 20;
const TWO_FACTOR_SETUP_URL = /\/profile\/2fa-setup$/;

/** 棚卸しの API の 1 件 */
interface InventoryItem {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: { id: string; displayName: string } | null;
}

/** 棚卸しの絞り込み（画面と API で同じ条件） */
interface InventoryQuery {
  status?: 'active' | 'inactive';
  inactiveDaysAtLeast?: number;
}

/** 応答が指定のパスへの要求か（オリジンは問わない） */
function isPath(response: Response, method: string, path: string): boolean {
  return response.request().method() === method && new URL(response.url()).pathname === path;
}

/** 棚卸しの一覧の応答か（指定があればページと絞り込みも照合する） */
function isInventoryResponse(response: Response, page?: number, query?: InventoryQuery): boolean {
  if (!isPath(response, 'GET', INVENTORY_PATH)) {
    return false;
  }
  const params = new URL(response.url()).searchParams;
  if (page !== undefined && params.get('page') !== String(page)) {
    return false;
  }
  if (query?.status !== undefined && params.get('status') !== query.status) {
    return false;
  }
  if (
    query?.inactiveDaysAtLeast !== undefined &&
    params.get('inactiveDaysAtLeast') !== String(query.inactiveDaysAtLeast)
  ) {
    return false;
  }
  return true;
}

/** 画面の API クライアントで要求を送り、状態コードとエラーコードを返す */
async function requestFromPage(
  page: Page,
  path: string
): Promise<{ status: number; code: string | null }> {
  return page.evaluate(async (target) => {
    const client = (window as unknown as { __apiClient?: { get: (p: string) => Promise<unknown> } })
      .__apiClient;
    if (!client) {
      return { status: -1, code: null };
    }
    try {
      await client.get(target);
      return { status: 200, code: null };
    } catch (error) {
      const failure = error as { statusCode?: number; response?: { code?: unknown } };
      return {
        status: Number(failure.statusCode ?? 0),
        code: typeof failure.response?.code === 'string' ? failure.response.code : null,
      };
    }
  }, path);
}

/**
 * 共有の管理者を用意し、そのアクセストークンを返す
 *
 * 共有の管理者が他の spec の DB の初期化で消えていれば作り直す（実行の順序に依らないため）
 */
async function adminAccessToken(page: Page): Promise<string> {
  const exists = await getPrismaClient().user.findUnique({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  if (!exists) {
    await createTestUser('ADMIN_USER');
  }
  return getAccessToken(page, 'ADMIN_USER');
}

/** 共有の管理者の ID */
async function adminUserId(): Promise<string> {
  const admin = await getPrismaClient().user.findUniqueOrThrow({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  return admin.id;
}

/** 棚卸しの API から条件に合う全件を、画面と同じ並びで読む */
async function fetchInventory(
  request: APIRequestContext,
  token: string,
  query: InventoryQuery = {}
): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ page: String(page), limit: String(INVENTORY_PAGE_SIZE) });
    if (query.status) params.set('status', query.status);
    if (query.inactiveDaysAtLeast !== undefined) {
      params.set('inactiveDaysAtLeast', String(query.inactiveDaysAtLeast));
    }
    const response = await request.get(`${API_BASE_URL}${INVENTORY_PATH}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status(), '棚卸しの API').toBe(200);
    const body = (await response.json()) as {
      data: InventoryItem[];
      pagination: { totalPages: number };
    };
    items.push(...body.data);
    if (page >= body.pagination.totalPages) {
      return items;
    }
  }
}

/** 棚卸し画面の対象者の行 */
function inventoryRow(page: Page, userId: string) {
  return page.getByTestId(`user-inventory-row-${userId}`);
}

/** 棚卸し画面を開き、最初の一覧の読み込みを待つ */
async function openInventory(page: Page): Promise<void> {
  const firstLoad = page.waitForResponse((r) => isInventoryResponse(r, 1, {}));
  await page.goto('/admin/user-inventory');
  expect((await firstLoad).status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'ユーザー棚卸し' })).toBeVisible();
}

/** 棚卸し画面で状態の絞り込みを選び、その一覧の応答を返す */
async function filterInventoryByStatus(
  page: Page,
  status: 'active' | 'inactive'
): Promise<Response> {
  const filtered = page.waitForResponse((r) => isInventoryResponse(r, 1, { status }));
  await page
    .getByLabel('状態', { exact: true })
    .selectOption(status === 'active' ? '有効' : '無効');
  const response = await filtered;
  expect(response.status()).toBe(200);
  return response;
}

/** 棚卸し画面で経過日数の絞り込みを実行し、その一覧の応答を返す */
async function filterInventoryByDays(page: Page, days: number): Promise<Response> {
  const filtered = page.waitForResponse((r) =>
    isInventoryResponse(r, 1, { inactiveDaysAtLeast: days })
  );
  await page.getByLabel('最終ログインからの経過日数（以上）').fill(String(days));
  await page.getByRole('button', { name: '絞り込む' }).click();
  const response = await filtered;
  expect(response.status()).toBe(200);
  return response;
}

/**
 * 棚卸し画面で、適用中の条件（`query`。画面で適用済みであること）の一覧を対象者の行が載るページまで進める
 *
 * 対象者が何ページ目に載るかは画面と同じ条件・並びの API で求め、その回数だけ「次へ」を押す
 * （他の spec が作った利用者の数で行の位置が変わるため）。対象者が条件に合わなければ失敗する。
 */
async function moveToInventoryRowOf(
  page: Page,
  request: APIRequestContext,
  token: string,
  userId: string,
  query: InventoryQuery = {}
): Promise<void> {
  const items = await fetchInventory(request, token, query);
  const index = items.findIndex((item) => item.id === userId);
  expect(index, '対象者が棚卸しの条件に合う').toBeGreaterThanOrEqual(0);
  const targetPage = Math.floor(index / INVENTORY_PAGE_SIZE) + 1;
  for (let next = 2; next <= targetPage; next++) {
    const moved = page.waitForResponse((r) => isInventoryResponse(r, next, query));
    await page
      .getByRole('navigation', { name: 'ページ送り' })
      .getByRole('button', { name: '次へ' })
      .click();
    expect((await moved).status()).toBe(200);
  }
  await expect(inventoryRow(page, userId)).toBeVisible({ timeout: getTimeout(15000) });
}

/** 対象者のセッションを別のブラウザのコンテキストで開き、認証済みになるまで待つ */
async function openUserSession(browser: Browser, user: CreatedUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsUser(page, user);
  // ログインの直後の画面のまま待つ（再読み込みはセッションの復元のリフレッシュと観測の要求が競合しうる）
  await waitForAuthenticatedSession(page, { timeout: getTimeout(15000), polling: 200 });
  return page;
}

/** ログイン API の応答の状態コードと本文 */
async function loginAttempt(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ status: number; body: unknown }> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  return { status: response.status(), body: await response.json() };
}

/**
 * 担当者候補の API の応答（全件が ID と表示名だけであることを確かめて返す）
 *
 * 他の spec の DB の初期化の後は対象者のほかに候補がいないことがあるため、件数は呼び出し側で主張する
 */
async function fetchAssignableUsers(
  request: APIRequestContext,
  token: string
): Promise<Array<{ id: string; displayName: string }>> {
  const response = await request.get(`${API_BASE_URL}/api/users/assignable`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as Array<Record<string, unknown>>;
  for (const candidate of body) {
    // 要件38.5: ID と表示名だけを返し、メールアドレスとロールを含めない
    expect(Object.keys(candidate).sort()).toEqual(['displayName', 'id']);
  }
  return body as Array<{ id: string; displayName: string }>;
}

/** 棚卸し画面の行の操作の確認ダイアログで確定し、操作の API の応答を返す */
async function confirmRowOperation(
  page: Page,
  options: { buttonName: string; confirmName: string; apiPath: string; reason?: string }
): Promise<Response> {
  await page.getByRole('button', { name: options.buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (options.reason !== undefined) {
    await dialog.getByLabel('理由（必須）').fill(options.reason);
  }
  const responsePromise = page.waitForResponse((r) => isPath(r, 'POST', options.apiPath));
  await dialog.getByRole('button', { name: options.confirmName, exact: true }).click();
  const response = await responsePromise;
  await expect(dialog).toBeHidden();
  return response;
}

test.describe('アカウントの無効化・棚卸し・管理者による 2FA の再設定', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * @requirement user-authentication/REQ-36.7
   * @requirement user-authentication/REQ-36.10
   * @requirement user-authentication/REQ-36.11
   */
  test('棚卸し画面は管理メニューから開け、全項目と最終ログイン日時を表示し、状態と経過日数で絞り込める', async ({
    page,
    request,
  }) => {
    const target = await resetDedicatedUser('STATE_CHANGE_USER');
    const prisma = getPrismaClient();

    // 要件36.7: ログインの成功で最終ログイン日時を記録する
    const loginStartedAt = Date.now();
    await loginViaApi(request, target);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: { lastLoginAt: true, createdAt: true },
    });
    expect(stored.lastLoginAt, '最終ログイン日時').not.toBeNull();
    const lastLoginAt = stored.lastLoginAt as Date;
    expect(lastLoginAt.getTime()).toBeGreaterThanOrEqual(loginStartedAt - 1000);

    const token = await adminAccessToken(page);
    await loginAsUser(page, 'ADMIN_USER');

    // 管理メニューから棚卸し画面を開く
    await page.goto('/dashboard');
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'ユーザー棚卸し' }).click();
    await expect(page).toHaveURL(/\/admin\/user-inventory$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ユーザー棚卸し' })).toBeVisible();

    // 要件36.10: 全ユーザーの各項目の列を持ち、対象者の行に値が出る
    await moveToInventoryRowOf(page, request, token, target.id);
    const headers = page.getByRole('table').getByRole('columnheader');
    await expect(headers).toHaveText([
      '表示名',
      'メールアドレス',
      'ロール',
      '状態',
      '2FA登録',
      '最終ログイン日時',
      '作成日時',
      '招待者',
      '操作',
    ]);
    const row = inventoryRow(page, target.id);
    const [expectedLastLogin, expectedCreatedAt] = await page.evaluate(
      ([login, created]) => [
        new Date(login).toLocaleString('ja-JP'),
        new Date(created).toLocaleString('ja-JP'),
      ],
      [lastLoginAt.toISOString(), stored.createdAt.toISOString()] as const
    );
    await expect(row.getByRole('rowheader')).toHaveText(target.displayName);
    await expect(row.getByRole('cell')).toHaveText([
      target.email,
      'user',
      '有効',
      '登録済み',
      expectedLastLogin,
      expectedCreatedAt,
      '—',
      /無効化\s*2FAを再設定/,
    ]);

    // 375px の幅でも文書が横にはみ出さない（49.6 の申し送り。表は枠の中で横に送る）
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(row).toBeAttached();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });

    // 要件36.11（状態）: 「無効」で絞り込むと無効な利用者だけになり、有効な対象者は出ない
    const inactiveBody = (await (await filterInventoryByStatus(page, 'inactive')).json()) as {
      data: InventoryItem[];
    };
    expect(inactiveBody.data.every((item) => item.status === 'inactive')).toBe(true);
    expect(inactiveBody.data.map((item) => item.id)).not.toContain(target.id);
    const tbodyRows = page.getByRole('table').locator('tbody tr');
    await expect(tbodyRows).toHaveCount(inactiveBody.data.length);
    for (const status of await tbodyRows.locator('td:nth-of-type(3)').allTextContents()) {
      expect(status).toBe('無効');
    }

    // 要件36.11（経過日数）: 最終ログインを 30 日と 1 時間前にすると、30 日以上には載り 31 日以上には載らない
    const cleared = page.waitForResponse(
      (r) => isInventoryResponse(r, 1, {}) && !new URL(r.url()).searchParams.has('status')
    );
    await page.getByRole('button', { name: '条件をクリア' }).click();
    expect((await cleared).status()).toBe(200);
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 + 1) * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: target.id }, data: { lastLoginAt: thirtyDaysAgo } });
    const atLeast30 = await fetchInventory(request, token, { inactiveDaysAtLeast: 30 });
    await filterInventoryByDays(page, 30);
    await moveToInventoryRowOf(page, request, token, target.id, { inactiveDaysAtLeast: 30 });

    const notYetBody = (await (await filterInventoryByDays(page, 31)).json()) as {
      data: InventoryItem[];
      pagination: { total: number };
    };
    const atLeast31 = await fetchInventory(request, token, { inactiveDaysAtLeast: 31 });
    // 31 日以上は 30 日以上から対象者だけを除いた集まり（E2E の利用者は全体の準備で作り直すため、
    // 対象者のほかに最終ログイン（無ければ作成日時）が 30〜31 日前の利用者はいない）
    expect(atLeast31.map((item) => item.id)).toEqual(
      atLeast30.map((item) => item.id).filter((id) => id !== target.id)
    );
    expect(notYetBody.pagination.total).toBe(atLeast31.length);
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(
      Math.min(INVENTORY_PAGE_SIZE, atLeast31.length)
    );
    await expect(inventoryRow(page, target.id)).toHaveCount(0);
  });

  /**
   * @requirement user-authentication/REQ-36.1
   * @requirement user-authentication/REQ-36.2
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.6
   * @requirement user-authentication/REQ-38.5
   */
  test('棚卸し画面で無効化すると対象者の操作とログインが拒否され担当者候補から外れ、案件には名前が残り、再有効化で戻る', async ({
    page,
    request,
    browser,
  }) => {
    const target = await resetDedicatedUser('STATE_CHANGE_USER');
    const token = await adminAccessToken(page);

    // 対象者を営業担当者とする案件（担当者候補の API で有効な候補であることを確かめてから作る）
    const candidatesBefore = await fetchAssignableUsers(request, token);
    expect(candidatesBefore).toContainEqual({ id: target.id, displayName: target.displayName });
    const created = await request.post(`${API_BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E無効化された担当者_${Date.now()}`, salesPersonId: target.id },
    });
    expect(created.status()).toBe(201);
    const projectId = ((await created.json()) as { id: string }).id;

    // 対象者のセッション（別のコンテキスト）で API が通る
    const userPage = await openUserSession(browser, target);
    try {
      expect(await requestFromPage(userPage, '/api/projects')).toEqual({ status: 200, code: null });

      // 管理者が棚卸し画面で無効化する
      await loginAsUser(page, 'ADMIN_USER');
      await openInventory(page);
      await moveToInventoryRowOf(page, request, token, target.id);
      const deactivated = await confirmRowOperation(page, {
        buttonName: `${target.displayName}を無効化`,
        confirmName: '無効化する',
        apiPath: `/api/v1/users/${target.id}/deactivate`,
        reason: 'E2E の退職者の想定',
      });
      expect(deactivated.status()).toBe(204);
      await expect(page.getByRole('status').filter({ hasText: '無効化しました' })).toHaveText(
        `${target.displayName}を無効化しました`
      );
      const row = inventoryRow(page, target.id);
      await expect(row.getByRole('cell').nth(2)).toHaveText('無効');
      await expect(
        row.getByRole('button', { name: `${target.displayName}を再有効化`, exact: true })
      ).toBeVisible();

      // 要件36.1: 対象者の API は 401 ACCOUNT_DISABLED、続くリフレッシュも 401
      const apiResponsePromise = userPage.waitForResponse(
        (r) => isPath(r, 'GET', '/api/projects') && r.status() === 401
      );
      const refreshResponsePromise = userPage.waitForResponse((r) =>
        isPath(r, 'POST', '/api/v1/auth/refresh')
      );
      const refused = await requestFromPage(userPage, '/api/projects');
      expect(((await (await apiResponsePromise).json()) as { code?: unknown }).code).toBe(
        'ACCOUNT_DISABLED'
      );
      const refreshResponse = await refreshResponsePromise;
      expect(refreshResponse.status()).toBe(401);
      expect(refused.status).toBe(401);

      // 要件36.2: 正しいパスワードのログインもパスワード誤りと同じ認証エラーになる
      const withCorrect = await loginAttempt(request, target.email, target.password);
      const withWrong = await loginAttempt(request, target.email, `${target.password}x`);
      expect(withCorrect.status).toBe(401);
      expect(withCorrect).toEqual(withWrong);
      expect(withCorrect.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });

      // 要件38.5: 担当者候補から外れ、候補は ID と表示名だけのまま
      const candidatesWhileInactive = await fetchAssignableUsers(request, token);
      expect(candidatesWhileInactive).toEqual(candidatesBefore.filter((c) => c.id !== target.id));
      expect(candidatesWhileInactive.map((c) => c.id)).not.toContain(target.id);

      // 要件36.6: 案件の詳細と編集の画面に無効化された担当者の表示名が残る
      await page.goto(`/projects/${projectId}`);
      const salesField = page.getByText('営業担当者', { exact: true }).locator('..');
      await expect(salesField).toHaveText(`営業担当者${target.displayName}`);
      await page.goto(`/projects/${projectId}/edit`);
      const salesSelect = page.getByRole('combobox', { name: '営業担当者' });
      await expect(salesSelect).toHaveValue(target.id);
      await expect(salesSelect.locator('option:checked')).toHaveText(
        `${target.displayName}（無効）`
      );

      // 要件36.11（状態）と要件36.3: 「無効」で絞り込むと対象者が載り、再有効化できる
      await openInventory(page);
      await filterInventoryByStatus(page, 'inactive');
      await moveToInventoryRowOf(page, request, token, target.id, { status: 'inactive' });
      const reactivated = await confirmRowOperation(page, {
        buttonName: `${target.displayName}を再有効化`,
        confirmName: '再有効化する',
        apiPath: `/api/v1/users/${target.id}/reactivate`,
        reason: 'E2E の復職の想定',
      });
      expect(reactivated.status()).toBe(204);
      await expect(page.getByRole('status').filter({ hasText: '再有効化しました' })).toHaveText(
        `${target.displayName}を再有効化しました`
      );

      // 要件36.3: 対象者は再びログインでき、API が通る。担当者候補にも戻る
      await loginAsUser(userPage, target);
      await waitForAuthenticatedSession(userPage, { timeout: getTimeout(15000), polling: 200 });
      expect(await requestFromPage(userPage, '/api/projects')).toEqual({ status: 200, code: null });
      const candidatesAfter = await fetchAssignableUsers(request, token);
      expect(candidatesAfter).toContainEqual({ id: target.id, displayName: target.displayName });
    } finally {
      await userPage.context().close();
    }
  });

  /**
   * @requirement user-authentication/REQ-36.5
   * @requirement user-authentication/REQ-34.9
   */
  test('自分自身の行の無効化と 2FA の再設定は押せず、API でも拒否される', async ({
    page,
    request,
  }) => {
    const token = await adminAccessToken(page);
    const selfId = await adminUserId();
    await loginAsUser(page, 'ADMIN_USER');
    await openInventory(page);
    await moveToInventoryRowOf(page, request, token, selfId);

    const row = inventoryRow(page, selfId);
    const displayName = TEST_USERS.ADMIN_USER.displayName;
    for (const name of [`${displayName}を無効化`, `${displayName}の2FAを再設定`]) {
      const button = row.getByRole('button', { name, exact: true });
      await expect(button, name).toBeDisabled();
      await expect(button, name).toHaveAccessibleDescription(
        '自分自身のアカウントはこの画面から操作できません'
      );
    }

    // 要件36.5: 自分自身の無効化は 409
    const selfDeactivate = await request.post(`${API_BASE_URL}/api/v1/users/${selfId}/deactivate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: 'E2E の自己無効化の拒否' },
    });
    expect(selfDeactivate.status()).toBe(409);
    expect(((await selfDeactivate.json()) as { code?: unknown }).code).toBe(
      'SELF_DEACTIVATION_FORBIDDEN'
    );
    // 要件34.9: 自分自身の 2FA の再設定は 403
    const selfReset = await request.post(`${API_BASE_URL}/api/v1/users/${selfId}/2fa/reset`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(selfReset.status()).toBe(403);
    expect(((await selfReset.json()) as { code?: unknown }).code).toBe('SELF_RESET_FORBIDDEN');

    const admin = await getPrismaClient().user.findUniqueOrThrow({
      where: { id: selfId },
      select: { isActive: true, twoFactorEnabled: true },
    });
    expect(admin).toEqual({ isActive: true, twoFactorEnabled: true });
  });

  /**
   * @requirement user-authentication/REQ-36.12
   */
  test('一般ユーザーは棚卸し画面を開けず、棚卸しの API は 403 になる', async ({ browser }) => {
    const target = await resetDedicatedUser('STATE_CHANGE_USER');
    const userPage = await openUserSession(browser, target);
    try {
      const inventoryResponses: Response[] = [];
      userPage.on('response', (r) => {
        if (isPath(r, 'GET', INVENTORY_PATH)) inventoryResponses.push(r);
      });
      await userPage.goto('/admin/user-inventory');
      await expect(
        userPage.getByRole('heading', { name: 'アクセス権限がありません' })
      ).toBeVisible();
      await expect(userPage.getByTestId('user-inventory-container')).toHaveCount(0);
      expect(inventoryResponses).toHaveLength(0);

      expect(await requestFromPage(userPage, INVENTORY_PATH)).toMatchObject({ status: 403 });
    } finally {
      await userPage.context().close();
    }
  });

  /**
   * @requirement user-authentication/REQ-34.7
   * @requirement user-authentication/REQ-34.8
   * @requirement user-authentication/REQ-34.10
   */
  test('棚卸し画面で 2FA を再設定すると、再設定より前のトークンの 2FA の設定が拒否され、再ログインで設定の画面へ進み、監査ログ画面に記録が出る', async ({
    page,
    request,
    browser,
  }) => {
    const target = await resetDedicatedUser('STATE_CHANGE_USER');
    const token = await adminAccessToken(page);
    const prisma = getPrismaClient();

    // 対象者のセッション（別のコンテキスト）と、再設定より前に発行されたアクセストークン
    const userPage = await openUserSession(browser, target);
    try {
      const tokenBeforeReset = await getAccessToken(userPage, target);
      const meBefore = await request.get(`${API_BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${tokenBeforeReset}` },
      });
      expect(meBefore.status(), '再設定の前はトークンが通る').toBe(200);

      // 管理者が棚卸し画面で 2FA を再設定する
      await loginAsUser(page, 'ADMIN_USER');
      await openInventory(page);
      await moveToInventoryRowOf(page, request, token, target.id);
      const resetStartedAt = new Date();
      const reset = await confirmRowOperation(page, {
        buttonName: `${target.displayName}の2FAを再設定`,
        confirmName: '2FAを再設定する',
        apiPath: `/api/v1/users/${target.id}/2fa/reset`,
      });
      expect(reset.status()).toBe(204);
      await expect(page.getByRole('status').filter({ hasText: '2FAを再設定しました' })).toHaveText(
        `${target.displayName}の2FAを再設定しました`
      );
      await expect(inventoryRow(page, target.id).getByRole('cell').nth(3)).toHaveText('未登録');

      // 要件34.7: 秘密鍵・バックアップコード・リフレッシュトークンが消える
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
      });
      expect(stored).toEqual({ twoFactorEnabled: false, twoFactorSecret: null });
      expect(await prisma.twoFactorBackupCode.count({ where: { userId: target.id } })).toBe(0);
      expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);

      // 要件34.7: 再設定より前のアクセストークンによる 2FA の設定の要求は 401（署名の不正と同じ応答）
      const setupWithOldToken = await request.post(`${API_BASE_URL}/api/v1/auth/2fa/setup`, {
        headers: { Authorization: `Bearer ${tokenBeforeReset}` },
      });
      expect(setupWithOldToken.status()).toBe(401);
      expect(await setupWithOldToken.json()).toMatchObject({ error: 'INVALID_TOKEN' });
      expect(setupWithOldToken.headers()['www-authenticate']).toContain('invalid_token');
      const stillUnenrolled = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { twoFactorPendingSecret: true, twoFactorSecret: true },
      });
      expect(stillUnenrolled).toEqual({ twoFactorPendingSecret: null, twoFactorSecret: null });

      // 要件34.7: 対象者の画面のセッションも失効し、再読み込みでログイン画面へ戻る
      await userPage.goto('/projects');
      await expect(userPage).toHaveURL(/\/login/, { timeout: getTimeout(15000) });

      // 要件34.8: 再びログインすると 2FA 設定の画面へ進む
      await loginAsUser(userPage, { ...target, twoFactorEnabled: false });
      await expect(userPage).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
      // 設定の開始（秘密鍵の発行と監査の取引）が終わるまで待つ（次の検証の初期化とのデッドロックを避ける）
      await expect(userPage.getByTestId('secret-key')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 要件34.10: 監査ログ画面に実行者と対象の記録が出る
      const record = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'TWO_FACTOR_RESET_BY_ADMIN',
          targetId: target.id,
          createdAt: { gte: new Date(resetStartedAt.getTime() - 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      const auditResponsePromise = page.waitForResponse(
        (r) =>
          isPath(r, 'GET', '/api/v1/audit-logs') &&
          new URL(r.url()).searchParams.get('action') === 'TWO_FACTOR_RESET_BY_ADMIN'
      );
      await page.goto('/admin/audit-logs');
      await page.getByLabel('イベント種別').selectOption('2FA再設定（管理者）');
      expect((await auditResponsePromise).status()).toBe(200);
      const expectedTime = await page.evaluate(
        (iso) => new Date(iso).toLocaleString('ja-JP'),
        record.createdAt.toISOString()
      );
      const firstRow = page.getByRole('table').locator('tbody tr').first();
      await expect(firstRow.getByRole('cell').nth(0)).toHaveText(expectedTime);
      await expect(firstRow.getByRole('cell').nth(1)).toHaveText('2FA再設定（管理者）');
      await expect(firstRow.getByRole('cell').nth(2)).toHaveText(TEST_USERS.ADMIN_USER.email);
      await expect(firstRow.getByRole('cell').nth(3)).toHaveText(target.id);
    } finally {
      await userPage.context().close();
    }
  });
});
