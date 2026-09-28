import { test, expect, type Page, type Request } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 動的ロール管理のE2Eテスト
 *
 * @requirement user-authentication/REQ-17 動的ロール管理
 * @requirement user-authentication/REQ-17.1 システム管理者が新しいロールを作成しロール名、説明、優先順位を保存
 * @requirement user-authentication/REQ-17.2 ロール名が既に存在する場合409 Conflictエラーを返す
 * @requirement user-authentication/REQ-17.3 システム管理者がロール情報を更新し変更履歴を監査ログに記録
 * @requirement user-authentication/REQ-17.4 システム管理者がロール一覧を取得し全てのロール（名前、説明、割り当てユーザー数、権限数）を返す
 * @requirement user-authentication/REQ-17.5 システム管理者がロールを削除しロールが少なくとも1人のユーザーに割り当てられている場合削除を拒否
 * @requirement user-authentication/REQ-17.6 システム管理者が事前定義ロール（システム管理者）を削除しようとする場合削除を拒否
 * @requirement user-authentication/REQ-17.7 ロールを作成し一意のロールIDを生成
 * @requirement user-authentication/REQ-17.8 ロール優先順位を設定し整数値（高い値が高優先度）を受け入れ
 * @requirement user-authentication/REQ-17.9 新しいロールを作成しデフォルトで空の権限セットを割り当て
 * @requirement user-authentication/REQ-28.38 ロール管理リンククリック → ロール管理画面遷移
 * @requirement user-authentication/REQ-25.8 楽観的ロック競合が発生する場合エラーレスポンスを返す（ロールの編集画面の競合の表示）
 *
 * このテストスイートは、ロールの作成・更新・削除機能を
 * End-to-Endで検証します。
 */
test.describe('動的ロール管理', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
  });

  /**
   * 要件17.1: 新しいロールの作成
   * 要件17.7: 一意のロールIDの生成
   * 要件17.9: デフォルトで空の権限セット
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @requirement user-authentication/REQ-17.1 @requirement user-authentication/REQ-17.9
   *
   * タスク 115.188 の是正: 従前は REQ-17.7 も名乗っていたが、本区間の表題・本文が述べる内容に対応するのは、
   * 同じ区間が既に名乗っている受入基準17.1 である。重複する名乗りを取り下げた（REQ-17.7 は本区間の主張と別の事柄を述べている）。
   * @requirement user-authentication/REQ-22.1
   */
  test('管理者は新しいロールを作成できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // ユーザー管理ページに移動
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /ユーザー.*ロール管理/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // ロールタブに切り替え
    await page.getByRole('tab', { name: /ロール/i }).click();

    // 新規ロール作成ボタンをクリック
    await page.getByRole('button', { name: /ロール.*作成|新規.*ロール/i }).click();

    // ロール情報を入力
    await page.getByLabel(/ロール名/i).fill('Project Manager');
    await page.getByLabel(/説明/i).fill('プロジェクトを管理するロール');

    // ダイアログ内の作成ボタンをクリック（aria-labelを使用）
    await page.getByRole('button', { name: 'ロールを作成', exact: true }).click();

    // 成功メッセージを確認
    await expect(page.getByText(/作成.*しました|成功/i)).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * 要件17.2: 既存ロール名との重複エラー
   * @requirement user-authentication/REQ-17.2
   */
  test('重複するロール名では作成できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 既存のロール名（admin）で作成を試みる
    const createResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'admin',
        description: 'Duplicate admin role',
      },
    });

    expect(createResponse.status()).toBe(409);
    const error = await createResponse.json();
    expect(error.code).toBe('ROLE_NAME_CONFLICT');
  });

  /**
   * 要件17.3: ロール情報の更新と監査ログ記録
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @requirement user-authentication/REQ-17.3
   *
   * タスク 115.188 の是正: 従前は REQ-22.1 を名乗っていたが、受入基準22.1 の原文は「WHEN ロールが作成・更新・削除される
   * THEN Authentication Serviceは監査ログに記録しなければならない」
   * である。本区間の表題・本文が述べる内容に対応するのは受入基準17.3（「WHEN システム管理者がロール情報を更新する THEN
   * Authentication Serviceは変更履歴を監査ログに記録しなければならない」
   * ）である。
   */
  test('管理者はロール情報を更新できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // テスト用ロールを作成
    const createResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Test Role',
        description: 'Test description',
        priority: 50,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createdRole = await createResponse.json();

    // ロールを更新
    const updateResponse = await request.patch(`${API_BASE_URL}/api/v1/roles/${createdRole.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        description: 'Updated description',
        priority: 60,
      },
    });

    expect(updateResponse.ok()).toBeTruthy();
    const updatedRole = await updateResponse.json();
    expect(updatedRole.description).toBe('Updated description');
    expect(updatedRole.priority).toBe(60);
  });

  /**
   * 要件17.4: ロール一覧の取得
   * @requirement user-authentication/REQ-17.4
   */
  test('管理者はロール一覧を取得できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // ロール一覧を取得
    const rolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(rolesResponse.ok()).toBeTruthy();
    const roles = await rolesResponse.json();

    // 少なくともadminとuserロールが存在することを確認
    expect(roles.length).toBeGreaterThanOrEqual(2);
    expect(roles.some((r: { name: string }) => r.name === 'admin')).toBe(true);
    expect(roles.some((r: { name: string }) => r.name === 'user')).toBe(true);
  });

  /**
   * 要件17.5: 使用中のロールは削除不可
   * @requirement user-authentication/REQ-17.5
   */
  test('使用中のロールは削除できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // userロールを取得（使用中のロール）
    const prisma = getPrismaClient();
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    // 使用中のロールを削除しようとする
    const deleteResponse = await request.delete(`${API_BASE_URL}/api/v1/roles/${userRole!.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // システムロールまたは使用中のため削除不可
    expect(deleteResponse.status()).toBe(400);
  });

  /**
   * 要件17.6: システムロール（admin）の削除拒否
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @requirement user-authentication/REQ-17.6
   *
   * タスク 115.188 の是正: 従前は REQ-22.1 を名乗っていたが、受入基準22.1 の原文は「WHEN ロールが作成・更新・削除される
   * THEN Authentication Serviceは監査ログに記録しなければならない」
   * である。本区間の表題・本文が述べる内容に対応するのは受入基準17.6（「IF システム管理者が事前定義ロール（システム管理者）
   * を削除しようとする THEN Authentication Serviceは削除を拒否しなければならない」
   * ）である。
   */
  test('システムロールは削除できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // adminロールを取得
    const prisma = getPrismaClient();
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // システムロールを削除しようとする
    const deleteResponse = await request.delete(`${API_BASE_URL}/api/v1/roles/${adminRole!.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(deleteResponse.status()).toBe(400);
    const error = await deleteResponse.json();
    expect(error.code).toBe('SYSTEM_ROLE_PROTECTED');
  });

  /**
   * 要件17.8: ロール優先順位の設定
   * @requirement user-authentication/REQ-17.8
   */
  test('ロールに優先順位を設定できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 優先順位付きでロールを作成
    const createResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'High Priority Role',
        description: 'High priority role',
        priority: 100,
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const role = await createResponse.json();
    expect(role.priority).toBe(100);
  });
});

// ===== ロール編集の楽観的ロック（要件25.8） =====
/**
 * 楽観的ロックの競合をロールの編集画面から検証する。
 *
 * ロールの一覧（GET /api/v1/roles）の updatedAt（版）を保持し、編集の保存時に
 * expectedUpdatedAt として送る。同じ版からの2つ目の保存は 409 ROLE_CONFLICT となり、
 * 編集ダイアログは競合を表示して最新の内容の再読み込みを促す。
 *
 * @requirement user-authentication/REQ-25.8
 */
test.describe('ロール編集の楽観的ロック（要件25.8）', () => {
  test.describe.configure({ mode: 'serial' });

  const LOCK_ROLE_NAME = 'Optimistic Lock Role';
  const ORIGINAL_DESCRIPTION = '楽観的ロックの検証用ロール';

  /** PATCH /api/v1/roles/:id の要求をパスで捉える（オリジンに依存しない） */
  const isRolePatch = (request: Request): boolean =>
    request.method() === 'PATCH' &&
    /^\/api\/v1\/roles\/[^/]+$/.test(new URL(request.url()).pathname);

  let lockRoleId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
    const role = await getPrismaClient().role.create({
      data: {
        name: LOCK_ROLE_NAME,
        description: ORIGINAL_DESCRIPTION,
        priority: 40,
        isSystem: false,
      },
    });
    lockRoleId = role.id;
  });

  /** ユーザー管理画面のロールタブを開き、検証用ロールの行が出るまで待つ */
  async function openRolesTab(page: Page): Promise<void> {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /ユーザー.*ロール管理/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await page.getByRole('tab', { name: /ロール/i }).click();
    await expect(page.getByRole('button', { name: `${LOCK_ROLE_NAME}を編集` })).toBeVisible({
      timeout: getTimeout(10000),
    });
  }

  /** 検証用ロールの編集ダイアログを開き、説明を書き換えて保存し、PATCH の要求と応答を返す */
  async function editDescription(page: Page, value: string) {
    await page.getByRole('button', { name: `${LOCK_ROLE_NAME}を編集` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('ロール編集')).toBeVisible({ timeout: getTimeout(5000) });
    await dialog.getByLabel('説明').fill(value);
    const [request, response] = await Promise.all([
      page.waitForRequest(isRolePatch, { timeout: getTimeout(15000) }),
      page.waitForResponse((res) => isRolePatch(res.request()), {
        timeout: getTimeout(15000),
      }),
      dialog.getByRole('button', { name: 'ロールを更新', exact: true }).click(),
    ]);
    return { request, response, dialog };
  }

  async function storedDescription(): Promise<string | undefined> {
    const role = await getPrismaClient().role.findUnique({
      where: { id: lockRoleId },
      select: { description: true },
    });
    return role?.description;
  }

  /**
   * 2つの画面が同じ版でロールを開き、順に保存すると、後の方が競合の表示になり、保存値は先の方になる。
   * 最新の内容を読み込むと、最新の内容と版を取り直し、保存できる。
   * @requirement user-authentication/REQ-25.8
   */
  test('同じ版から2つの画面で順にロールを編集すると、後の方に競合を表示し先の保存値が残る', async ({
    page,
    browser,
  }) => {
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      await loginAsUser(otherPage, 'ADMIN_USER');
      // 両方の画面が、どちらの保存よりも前に一覧（同じ版）を取得する
      await openRolesTab(page);
      await openRolesTab(otherPage);

      // 先の画面の保存は成功する
      const first = await editDescription(page, '先の画面の編集');
      expect(first.response.status()).toBe(200);
      await expect(page.getByText('ロールを更新しました')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 後の画面（同じ版を保持）の保存は競合になる
      const second = await editDescription(otherPage, '後の画面の編集');
      const conflict = second.dialog.getByTestId('role-conflict');
      await expect(conflict, '後の保存で競合の表示が出ない').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(conflict).toContainText('ロールを保存できませんでした');
      await expect(conflict).toContainText('最新の内容を読み込んでから、もう一度保存してください');
      await expect(otherPage.getByText('ロールを更新しました')).toHaveCount(0);
      // ダイアログは開いたままで、入力は失われない
      await expect(second.dialog.getByLabel('説明')).toHaveValue('後の画面の編集');

      expect(second.response.status()).toBe(409);
      const problem = (await second.response.json()) as { code?: string };
      expect(problem.code).toBe('ROLE_CONFLICT');

      // 両方の要求が同じ版（一覧を取得した時点の updatedAt）を送っている
      const firstBody = first.request.postDataJSON() as { expectedUpdatedAt?: string };
      const secondBody = second.request.postDataJSON() as { expectedUpdatedAt?: string };
      expect(firstBody.expectedUpdatedAt, '先の保存が版を送っていない').toEqual(expect.any(String));
      expect(secondBody.expectedUpdatedAt).toBe(firstBody.expectedUpdatedAt);

      // 保存値は先の方
      expect(await storedDescription()).toBe('先の画面の編集');

      // 最新の内容を読み込むと、先の保存値と新しい版を取り直し、もう一度保存できる
      await conflict.getByRole('button', { name: '最新の内容を読み込む' }).click();
      await expect(second.dialog.getByLabel('説明')).toHaveValue('先の画面の編集', {
        timeout: getTimeout(10000),
      });
      await expect(conflict).toHaveCount(0);

      await second.dialog.getByLabel('説明').fill('後の画面の再編集');
      const [retriedRequest, retriedResponse] = await Promise.all([
        otherPage.waitForRequest(isRolePatch, { timeout: getTimeout(15000) }),
        otherPage.waitForResponse((res) => isRolePatch(res.request()), {
          timeout: getTimeout(15000),
        }),
        second.dialog.getByRole('button', { name: 'ロールを更新', exact: true }).click(),
      ]);
      expect(retriedResponse.status()).toBe(200);
      const retriedBody = retriedRequest.postDataJSON() as { expectedUpdatedAt?: string };
      const firstResult = (await first.response.json()) as { updatedAt?: string };
      expect(retriedBody.expectedUpdatedAt).toBe(firstResult.updatedAt);
      await expect(otherPage.getByText('ロールを更新しました')).toBeVisible({
        timeout: getTimeout(10000),
      });
      expect(await storedDescription()).toBe('後の画面の再編集');
    } finally {
      await otherContext.close();
    }
  });

  /**
   * 保存に成功したら新しい版を採用するため、同じ画面で続けて編集しても競合にならない。
   * @requirement user-authentication/REQ-25.8
   */
  test('同じ画面で続けて2回ロールを編集すると、どちらも成功する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');
    await openRolesTab(page);

    const first = await editDescription(page, '1回目の編集');
    expect(first.response.status()).toBe(200);
    await expect(page.getByText('ロールを更新しました')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(first.dialog).toHaveCount(0);

    const second = await editDescription(page, '2回目の編集');
    expect(second.response.status(), '2回目の保存が競合になった').toBe(200);
    await expect(page.getByTestId('role-conflict')).toHaveCount(0);

    // 2回目は1回目の保存後の新しい版を送っている
    const firstBody = first.request.postDataJSON() as { expectedUpdatedAt?: string };
    const firstResult = (await first.response.json()) as { updatedAt?: string };
    const secondBody = second.request.postDataJSON() as { expectedUpdatedAt?: string };
    expect(firstBody.expectedUpdatedAt, '1回目の保存が版を送っていない').toEqual(
      expect.any(String)
    );
    expect(firstResult.updatedAt).toEqual(expect.any(String));
    expect(secondBody.expectedUpdatedAt).toBe(firstResult.updatedAt);

    expect(await storedDescription()).toBe('2回目の編集');
  });
});

// ===== ロールの保存・削除の失敗の表示（タスク 37.3） =====
/**
 * ロールの保存・削除が API に拒否されたとき、管理画面が応答の本文（`{ error, code, details? }`）の
 * `code` を読み、拒否の理由を表示することを検証する。
 *
 * - 要件17.2: 既存の名前でロールを作成・更新すると 409 ROLE_NAME_CONFLICT となり、ロール名の重複を表示する
 * - 要件17.5: 使用中のロールの削除は 400 ROLE_IN_USE となり、使用中であることと割り当てのユーザー数を表示する
 * - 要件17.6: 画面はシステムロールの行に削除のボタンを出さない（画面から削除を送る経路が無い）。
 *   SYSTEM_ROLE_PROTECTED の応答から表示への対応づけは単体テスト
 *   （frontend/src/__tests__/pages/UserManagement.role-errors.test.tsx）で検証する
 *
 * @requirement user-authentication/REQ-17.2
 * @requirement user-authentication/REQ-17.5
 * @requirement user-authentication/REQ-17.6
 */
test.describe('ロールの保存・削除の失敗の表示', () => {
  test.describe.configure({ mode: 'serial' });

  const TARGET_ROLE_NAME = 'Failure Display Role';

  /** POST /api/v1/roles の応答をパスで捉える（オリジンに依存しない） */
  const isRoleCreate = (request: Request): boolean =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/roles';
  /** PATCH / DELETE /api/v1/roles/:id の応答をパスで捉える */
  const isRoleItem =
    (method: 'PATCH' | 'DELETE') =>
    (request: Request): boolean =>
      request.method() === method &&
      /^\/api\/v1\/roles\/[^/]+$/.test(new URL(request.url()).pathname);

  let targetRoleId = '';

  const SAVE_NAME_CONFLICT = 'ロールの保存に失敗しました。同じ名前のロールが既に存在します';

  /**
   * 要件17.2: 保存の失敗をダイアログの中に、前面で読める形で出していることを確かめる。
   * toBeVisible は他の要素に覆われていても通るため、表示の中心で最前面の要素が
   * 表示そのもの（またはその子孫）であること、クリックの試行が遮られないことを確かめる
   */
  async function expectSaveFailureInDialog(page: Page): Promise<void> {
    const dialog = page.getByRole('dialog');
    const failure = dialog.getByText(SAVE_NAME_CONFLICT, { exact: true });
    await expect(failure, 'ロール名の重複の理由がダイアログの中に表示されない').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(failure).toHaveAttribute('role', 'alert');
    // ページ上部の通知に重ねて出さない
    await expect(page.getByText(SAVE_NAME_CONFLICT, { exact: true })).toHaveCount(1);

    await failure.scrollIntoViewIfNeeded();
    const topmostIsFailure = await failure.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && element.contains(hit);
    });
    expect(topmostIsFailure, 'ロール名の重複の理由が他の要素に覆われている').toBe(true);
    await failure.click({ trial: true, timeout: getTimeout(5000) });
  }

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
    const role = await getPrismaClient().role.create({
      data: {
        name: TARGET_ROLE_NAME,
        description: '失敗の表示の検証用ロール',
        priority: 30,
        isSystem: false,
      },
    });
    targetRoleId = role.id;
  });

  /** ユーザー管理画面のロールタブを開き、検証用ロールの行が出るまで待つ */
  async function openRolesTab(page: Page): Promise<void> {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /ユーザー.*ロール管理/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await page.getByRole('tab', { name: /ロール/i }).click();
    await expect(page.getByRole('button', { name: `${TARGET_ROLE_NAME}を編集` })).toBeVisible({
      timeout: getTimeout(10000),
    });
  }

  /**
   * 要件17.2: 既存の名前（システムロール admin）でロールを作成すると、ロール名の重複を表示する
   * @requirement user-authentication/REQ-17.2
   */
  async function createWithExistingName(page: Page): Promise<void> {
    await loginAsUser(page, 'ADMIN_USER');
    await openRolesTab(page);

    await page.getByRole('button', { name: '新しいロールを作成' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('ロール作成')).toBeVisible({ timeout: getTimeout(5000) });
    await dialog.getByLabel('ロール名 *').fill('admin');

    const [response] = await Promise.all([
      page.waitForResponse((res) => isRoleCreate(res.request()), {
        timeout: getTimeout(15000),
      }),
      dialog.getByRole('button', { name: 'ロールを作成', exact: true }).click(),
    ]);
    expect(response.status()).toBe(409);
    expect(((await response.json()) as { code?: string }).code).toBe('ROLE_NAME_CONFLICT');

    await expectSaveFailureInDialog(page);
    // ダイアログは開いたままで、入力は失われない。版の競合としては表示しない
    await expect(dialog.getByLabel('ロール名 *')).toHaveValue('admin');
    await expect(page.getByTestId('role-conflict')).toHaveCount(0);
    // 同名のロールは増えていない
    expect(await getPrismaClient().role.count({ where: { name: 'admin' } })).toBe(1);
  }

  /**
   * 要件17.2: 既存の名前でロールを作成すると、ロール名の重複をダイアログの前面に表示する
   * @requirement user-authentication/REQ-17.2
   */
  test('既存の名前でロールを作成すると、ロール名の重複を表示する', async ({ page }) => {
    await createWithExistingName(page);
  });

  /**
   * 要件17.2: スマートフォンの幅（375×667）でも、ロール名の重複の理由がダイアログの前面で読める
   * @requirement user-authentication/REQ-17.2
   */
  test('スマートフォンの幅でも、ロールの作成の失敗の理由をダイアログの前面に表示する', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await createWithExistingName(page);
  });

  /**
   * 要件17.2: 既存のロールの名前を既存の名前（admin）へ変えて更新すると、ロール名の重複を表示する
   * @requirement user-authentication/REQ-17.2
   */
  test('ロールの名前を既存の名前へ変えて更新すると、ロール名の重複を表示する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');
    await openRolesTab(page);

    await page.getByRole('button', { name: `${TARGET_ROLE_NAME}を編集` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('ロール編集')).toBeVisible({ timeout: getTimeout(5000) });
    await dialog.getByLabel('ロール名 *').fill('admin');

    const [response] = await Promise.all([
      page.waitForResponse((res) => isRoleItem('PATCH')(res.request()), {
        timeout: getTimeout(15000),
      }),
      dialog.getByRole('button', { name: 'ロールを更新', exact: true }).click(),
    ]);
    expect(response.status()).toBe(409);
    expect(((await response.json()) as { code?: string }).code).toBe('ROLE_NAME_CONFLICT');

    await expectSaveFailureInDialog(page);
    await expect(page.getByTestId('role-conflict')).toHaveCount(0);
    await expect(page.getByText('ロールを更新しました')).toHaveCount(0);
    // 名前は変わっていない
    const stored = await getPrismaClient().role.findUnique({
      where: { id: targetRoleId },
      select: { name: true },
    });
    expect(stored?.name).toBe(TARGET_ROLE_NAME);
  });

  /**
   * 要件17.5: ユーザーに割り当てられているロールを削除すると、使用中であることと割り当てのユーザー数を表示する
   * @requirement user-authentication/REQ-17.5
   */
  test('使用中のロールを削除すると、使用中であることと割り当てのユーザー数を表示する', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: targetRoleId } });

    await loginAsUser(page, 'ADMIN_USER');
    await openRolesTab(page);

    // 削除の確認（window.confirm）を受け入れる
    page.once('dialog', (confirmDialog) => void confirmDialog.accept());
    const [response] = await Promise.all([
      page.waitForResponse((res) => isRoleItem('DELETE')(res.request()), {
        timeout: getTimeout(15000),
      }),
      page.getByRole('button', { name: `${TARGET_ROLE_NAME}を削除` }).click(),
    ]);
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { code?: string; details?: { userCount?: number } };
    expect(body.code).toBe('ROLE_IN_USE');
    expect(body.details?.userCount).toBe(1);

    await expect(
      page.getByText(
        'ロール削除に失敗しました。このロールはユーザーに割り当てられているため削除できません（割り当て中のユーザー: 1人）',
        { exact: true }
      ),
      '使用中の理由が表示されない'
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.getByText('ロールを削除しました')).toHaveCount(0);
    // ロールは残っている
    expect(await prisma.role.count({ where: { id: targetRoleId } })).toBe(1);
  });

  /**
   * 要件17.6: システムロール（admin）の行には削除のボタンが無く、画面から削除を送れない。
   * 対照として、同じ一覧のシステムロールでない行には削除のボタンがある
   * @requirement user-authentication/REQ-17.6
   */
  test('システムロールの行には削除のボタンを出さない', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');
    await openRolesTab(page);

    const adminEdit = page.getByRole('button', { name: 'adminを編集' });
    await expect(adminEdit).toBeVisible({ timeout: getTimeout(10000) });
    const adminRow = page.getByRole('row').filter({ has: adminEdit });
    await expect(adminRow).toHaveCount(1);
    await expect(adminRow).toContainText('システム');
    // 行の操作は編集だけ
    await expect(adminRow.getByRole('button')).toHaveCount(1);

    const targetRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: `${TARGET_ROLE_NAME}を編集` }) });
    await expect(
      targetRow.getByRole('button', { name: `${TARGET_ROLE_NAME}を削除` })
    ).toBeVisible();
    await expect(targetRow.getByRole('button')).toHaveCount(2);
  });
});
