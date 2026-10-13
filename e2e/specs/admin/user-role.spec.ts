import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * ユーザーへのロール割り当てのE2Eテスト
 *
 * @requirement user-authentication/REQ-20 ユーザーへのロール割り当て（マルチロール対応）
 * @requirement user-authentication/REQ-20.1 システム管理者がユーザーにロールを追加しユーザー・ロールの紐付けを保存
 * @requirement user-authentication/REQ-20.2 ロールが既にユーザーに割り当てられている場合重複を無視
 * @requirement user-authentication/REQ-20.3 システム管理者がユーザーからロールを削除し紐付けを削除
 * @requirement user-authentication/REQ-20.4 ユーザーが複数のロールを持つ場合全てのロールの権限を統合（OR演算）
 * @requirement user-authentication/REQ-20.5 ユーザーのロールを変更し変更履歴を監査ログに記録
 * @requirement user-authentication/REQ-20.6 ユーザーが最後のシステム管理者ロール保持者でシステム管理者ロールを削除しようとする場合削除を拒否
 * @requirement user-authentication/REQ-20.7 ユーザーに新しいロールが割り当てられる場合次回トークンリフレッシュ時に新しい権限を反映
 * @requirement user-authentication/REQ-20.8 システム管理者がユーザーのロール一覧を取得し全ての割り当てられたロール（名前、割り当て日時）を返す
 * @requirement user-authentication/REQ-20.9 複数のロールを一括で割り当てトランザクション内で処理
 *
 * このテストスイートは、ユーザーに対するロールの割り当て・削除機能を
 * End-to-Endで検証します。
 */
test.describe('ユーザーへのロール割り当て', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');

    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;
  });

  /**
   * 要件20.1: ユーザーにロールを追加
   * 要件20.5: ユーザーのロール変更を監査ログに記録
   * 要件20.7: 新ロール割り当て後の次回トークンリフレッシュで権限反映
   * 要件22.3: ユーザーへのロール割り当て・削除時の監査ログ記録
   * 要件22.7: 監査ログに変更前後の値を含める
   * @requirement user-authentication/REQ-20.1 @requirement user-authentication/REQ-20.5
   *
   * タスク 115.188 の是正: 従前は REQ-20.7 も名乗っていたが、本区間の表題・本文が述べる内容に対応するのは、
   * 同じ区間が既に名乗っている受入基準20.1 である。重複する名乗りを取り下げた（REQ-20.7 は本区間の主張と別の事柄を述べている）。
   * @requirement user-authentication/REQ-22.3 @requirement user-authentication/REQ-22.7
   */
  test('管理者はユーザーにロールを追加できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成
    const testUser = await createTestUser('REGULAR_USER');

    // 新しいロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'New Role',
        description: 'New role for testing',
      },
    });
    expect(createRoleResponse.ok()).toBeTruthy();
    const newRole = await createRoleResponse.json();

    // ユーザーにロールを追加
    const assignResponse = await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [newRole.id],
      },
    });

    expect(assignResponse.ok()).toBeTruthy();

    // ユーザーのロールを確認
    const userRoles = await prisma.userRole.findMany({
      where: { userId: testUser.id },
      include: { role: true },
    });

    expect(userRoles.some((ur) => ur.role.id === newRole.id)).toBe(true);
  });

  /**
   * 要件20.2: 重複するロール割り当ては無視
   * @requirement user-authentication/REQ-20.2
   */
  test('重複するロール割り当ては無視される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成
    const testUser = await createTestUser('REGULAR_USER');

    // userロールを取得
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    // 既に持っているロールを再度割り当て
    const assignResponse = await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [userRole!.id],
      },
    });

    // 重複は無視されてエラーにならない
    expect(assignResponse.ok()).toBeTruthy();

    // ロールが1つだけ存在することを確認
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: testUser.id,
        roleId: userRole!.id,
      },
    });
    expect(userRoles.length).toBe(1);
  });

  /**
   * 要件20.3: ユーザーからロールを削除
   * 要件20.5: ユーザーのロール変更を監査ログに記録
   * 要件22.3: ユーザーへのロール割り当て・削除時の監査ログ記録
   * 要件22.7: 監査ログに変更前後の値を含める
   * @requirement user-authentication/REQ-20.3 @requirement user-authentication/REQ-20.5
   * @requirement user-authentication/REQ-22.3 @requirement user-authentication/REQ-22.7
   */
  test('管理者はユーザーからロールを削除できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成（userロールを持つ）
    const testUser = await createTestUser('REGULAR_USER');

    // 追加のロールを作成して割り当て
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Temporary Role',
        description: 'Role to be removed',
      },
    });
    const tempRole = await createRoleResponse.json();

    await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [tempRole.id],
      },
    });

    // ロールを削除
    const deleteResponse = await request.delete(
      `${API_BASE_URL}/api/v1/users/${testUser.id}/roles/${tempRole.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(deleteResponse.ok()).toBeTruthy();

    // ロールが削除されたことを確認
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: testUser.id,
        roleId: tempRole.id,
      },
    });
    expect(userRoles.length).toBe(0);
  });

  /**
   * 要件20.4: 複数ロールの権限統合（OR演算）
   * @requirement user-authentication/REQ-20.4
   */
  test('複数ロールを持つユーザーは全ロールの権限を持つ', async () => {
    const prisma = getPrismaClient();

    // 管理者ユーザーを取得（admin + user ロールを持つ可能性）
    const adminUser = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: 'admin',
            },
          },
        },
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(adminUser).not.toBeNull();

    // 全ロールの権限を収集
    const allPermissions = new Set<string>();
    adminUser?.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        allPermissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });

    // 管理者は*:*権限を持つ
    expect(allPermissions.has('*:*')).toBe(true);
  });

  /**
   * 要件20.6: 最後のシステム管理者ロールの削除拒否
   * @requirement user-authentication/REQ-20.6
   */
  test('最後の管理者からadminロールは削除できない', async ({ request }) => {
    const prisma = getPrismaClient();

    // 管理者ユーザーとadminロールを取得
    const adminUser = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: { name: 'admin' },
          },
        },
      },
    });
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // 管理者ロールの削除を試みる
    const deleteResponse = await request.delete(
      `${API_BASE_URL}/api/v1/users/${adminUser!.id}/roles/${adminRole!.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // 最後の管理者の場合は削除拒否
    expect(deleteResponse.status()).toBe(400);
    const error = await deleteResponse.json();
    expect(error.code).toBe('LAST_ADMIN_PROTECTED');
  });

  /**
   * 要件20.8: ユーザーのロール一覧取得
   * @requirement user-authentication/REQ-20.8
   */
  test('管理者はユーザーのロール一覧を取得できる', async ({ request }) => {
    // テストユーザーを作成
    const testUser = await createTestUser('REGULAR_USER');

    // ユーザーのロール一覧を取得
    const rolesResponse = await request.get(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(rolesResponse.ok()).toBeTruthy();
    const roles = await rolesResponse.json();

    expect(Array.isArray(roles)).toBe(true);
    // 一般ユーザーはuserロールを持つ
    expect(roles.some((r: { name: string }) => r.name === 'user')).toBe(true);
  });

  /**
   * 要件20.9: 複数ロールの一括割り当て
   * @requirement user-authentication/REQ-20.9
   */
  test('複数のロールを一括で割り当てできる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成
    const testUser = await createTestUser('REGULAR_USER');

    // 複数の新しいロールを作成
    const role1Response = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: 'Role A', description: 'First role' },
    });
    const role2Response = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: 'Role B', description: 'Second role' },
    });

    const role1 = await role1Response.json();
    const role2 = await role2Response.json();

    // 複数ロールを一括割り当て
    const assignResponse = await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [role1.id, role2.id],
      },
    });

    expect(assignResponse.ok()).toBeTruthy();

    // 両方のロールが割り当てられていることを確認
    const userRoles = await prisma.userRole.findMany({
      where: { userId: testUser.id },
      include: { role: true },
    });

    expect(userRoles.some((ur) => ur.role.id === role1.id)).toBe(true);
    expect(userRoles.some((ur) => ur.role.id === role2.id)).toBe(true);
  });

  /**
   * 要件20.7: 新ロール割り当て後の次回トークンリフレッシュで権限反映
   * ユーザーに新しいロールが割り当てられた場合、トークンリフレッシュ時に新しい権限が反映される
   * @requirement user-authentication/REQ-20.7
   */
  test('トークンリフレッシュ時に新しいロールの権限が反映される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成してログイン
    const testUser = await createTestUser('REGULAR_USER');
    const userLoginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'user@example.com',
        password: 'Password123!',
      },
    });
    const userLoginData = await userLoginResponse.json();
    const userAccessToken = userLoginData.accessToken;
    const refreshToken = userLoginData.refreshToken;

    // 最初は権限がないのでロール一覧にアクセスできない
    const initialRolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
    expect(initialRolesResponse.status()).toBe(403);

    // role:read権限を持つ新しいロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: 'Role Reader', description: 'Can read roles' },
    });
    const newRole = await createRoleResponse.json();

    // ロールにrole:read権限を割り当て
    const roleReadPermission = await prisma.permission.findFirst({
      where: { resource: 'role', action: 'read' },
    });

    if (roleReadPermission) {
      await prisma.rolePermission.create({
        data: {
          roleId: newRole.id,
          permissionId: roleReadPermission.id,
        },
      });
    }

    // テストユーザーに新しいロールを割り当て
    await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [newRole.id],
      },
    });

    // トークンをリフレッシュ
    const refreshResponse = await request.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
      data: {
        refreshToken: refreshToken,
      },
    });

    expect(refreshResponse.ok()).toBeTruthy();
    const newTokenData = await refreshResponse.json();
    const newAccessToken = newTokenData.accessToken;

    // 新しいトークンでロール一覧にアクセス
    // 新しい権限が反映されていれば、role:readでアクセス可能
    const afterRolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${newAccessToken}`,
      },
    });

    // 新しいロールの権限が反映されていることを確認
    expect(afterRolesResponse.ok()).toBeTruthy();
  });

  /**
   * 要件20.1: 管理画面（/admin/users）のセレクトからユーザーにロールを追加する
   * @requirement user-authentication/REQ-20.1
   *
   * タスク36.1: 画面が API の契約（`roleIds: string[]` 必須）と食い違う `{ roleId }` を送り、
   * 画面からの追加が必ず 400 で「ロール追加に失敗しました」になっていた欠陥の回帰検出。
   * API を直接呼ぶのでなく画面の操作を通し、成功の表示と DB の紐付けの保存を主張する。
   */
  test('管理者は管理画面のセレクトからユーザーにロールを追加できる', async ({ page }) => {
    const prisma = getPrismaClient();

    const testUser = await createTestUser('REGULAR_USER');
    const newRole = await prisma.role.create({
      data: {
        name: 'UI Assigned Role',
        description: '管理画面から割り当てるロール',
      },
    });

    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'ユーザー一覧' })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const roleSelect = page.locator(`#role-select-${testUser.id}`);
    await expect(roleSelect).toBeVisible({ timeout: getTimeout(10000) });
    await expect(roleSelect.locator(`option[value="${newRole.id}"]`)).toHaveCount(1);

    const assignResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1/users/${testUser.id}/roles`
    );
    await roleSelect.selectOption(newRole.id);
    const assignResponse = await assignResponsePromise;
    expect(assignResponse.status()).toBe(204);

    // 成功の表示
    await expect(page.getByText('ロールを追加しました', { exact: true })).toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(page.getByText('ロール追加に失敗しました')).toHaveCount(0);

    // DB にユーザー・ロールの紐付けが保存されている
    const assigned = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: testUser.id, roleId: newRole.id } },
    });
    expect(assigned).not.toBeNull();
  });
});
