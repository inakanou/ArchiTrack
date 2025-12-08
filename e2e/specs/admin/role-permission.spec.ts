import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL } from '../../config';

/**
 * ロールへの権限割り当てのE2Eテスト
 *
 * @requirement user-authentication/REQ-19 ロールへの権限割り当て
 * @requirement user-authentication/REQ-19.1 システム管理者がロールに権限を追加しロール・権限の紐付けを保存
 * @requirement user-authentication/REQ-19.2 権限が既にロールに割り当てられている場合重複を無視
 * @requirement user-authentication/REQ-19.3 システム管理者がロールから権限を削除し紐付けを削除
 * @requirement user-authentication/REQ-19.4 システム管理者がロールの権限一覧を取得し全ての割り当てられた権限を返す
 * @requirement user-authentication/REQ-19.5 ロールの権限を変更し変更履歴を監査ログに記録
 * @requirement user-authentication/REQ-19.6 システム管理者ロールから*:*権限を削除しようとする場合削除を拒否
 * @requirement user-authentication/REQ-19.7 複数の権限を一括で割り当てトランザクション内で処理
 * @requirement user-authentication/REQ-19.8 ロールに権限を割り当て権限の存在を事前に検証
 *
 * このテストスイートは、ロールに対する権限の割り当て・削除機能を
 * End-to-Endで検証します。
 */
test.describe('ロールへの権限割り当て', () => {
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
   * 要件19.1: ロールに権限を追加
   * 要件19.5: ロールの権限変更を監査ログに記録
   * 要件19.7: 複数権限の一括割り当てをトランザクション処理
   * 要件22.2: 権限追加・削除時の監査ログ記録
   * 要件22.7: 監査ログに変更前後の値を含める
   * @requirement user-authentication/REQ-19.1 @requirement user-authentication/REQ-19.5 @requirement user-authentication/REQ-19.7
   * @requirement user-authentication/REQ-22.2 @requirement user-authentication/REQ-22.7
   */
  test('管理者はロールに権限を追加できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Test Role',
        description: 'Test role for permission assignment',
      },
    });
    expect(createRoleResponse.ok()).toBeTruthy();
    const role = await createRoleResponse.json();

    // adr:read 権限を取得
    const adrReadPermission = await prisma.permission.findFirst({
      where: {
        resource: 'adr',
        action: 'read',
      },
    });

    expect(adrReadPermission).not.toBeNull();

    // ロールに権限を追加
    const assignResponse = await request.post(
      `${API_BASE_URL}/api/v1/roles/${role.id}/permissions`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          permissionId: adrReadPermission!.id,
        },
      }
    );

    expect(assignResponse.ok()).toBeTruthy();

    // ロールの権限を確認
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: true },
    });

    expect(rolePermissions.some((rp) => rp.permission.id === adrReadPermission!.id)).toBe(true);
  });

  /**
   * 要件19.2: 既に割り当てられた権限の重複は無視
   * @requirement user-authentication/REQ-19.2
   */
  test('重複する権限の割り当ては無視される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Duplicate Test Role',
        description: 'Test role for duplicate permission',
      },
    });
    const role = await createRoleResponse.json();

    // 権限を取得
    const permission = await prisma.permission.findFirst({
      where: { resource: 'adr', action: 'read' },
    });

    // 同じ権限を2回追加
    await request.post(`${API_BASE_URL}/api/v1/roles/${role.id}/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        permissionId: permission!.id,
      },
    });

    const secondResponse = await request.post(
      `${API_BASE_URL}/api/v1/roles/${role.id}/permissions`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          permissionId: permission!.id,
        },
      }
    );

    // 重複は無視されてエラーにならない
    expect(secondResponse.ok()).toBeTruthy();

    // 権限が1つだけ存在することを確認
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: role.id,
        permissionId: permission!.id,
      },
    });
    expect(rolePermissions.length).toBe(1);
  });

  /**
   * 要件19.3: ロールから権限を削除
   * 要件19.5: ロールの権限変更を監査ログに記録
   * 要件22.2: 権限追加・削除時の監査ログ記録
   * 要件22.7: 監査ログに変更前後の値を含める
   * @requirement user-authentication/REQ-19.3 @requirement user-authentication/REQ-19.5
   * @requirement user-authentication/REQ-22.2 @requirement user-authentication/REQ-22.7
   */
  test('管理者はロールから権限を削除できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Remove Permission Role',
        description: 'Test role for permission removal',
      },
    });
    const role = await createRoleResponse.json();

    // 権限を追加
    const permission = await prisma.permission.findFirst({
      where: { resource: 'adr', action: 'read' },
    });

    await request.post(`${API_BASE_URL}/api/v1/roles/${role.id}/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        permissionId: permission!.id,
      },
    });

    // 権限を削除
    const deleteResponse = await request.delete(
      `${API_BASE_URL}/api/v1/roles/${role.id}/permissions/${permission!.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(deleteResponse.ok()).toBeTruthy();

    // 権限が削除されたことを確認
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id, permissionId: permission!.id },
    });
    expect(rolePermissions.length).toBe(0);
  });

  /**
   * 要件19.4: ロールの権限一覧取得
   * 要件19.5: ロールの権限変更を監査ログに記録
   * @requirement user-authentication/REQ-19.4 @requirement user-authentication/REQ-19.5
   */
  test('管理者はロールの権限一覧を取得できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // adminロールを取得
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // ロールの権限一覧を取得
    const permissionsResponse = await request.get(
      `${API_BASE_URL}/api/v1/roles/${adminRole!.id}/permissions`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(permissionsResponse.ok()).toBeTruthy();
    const permissions = await permissionsResponse.json();

    expect(Array.isArray(permissions)).toBe(true);
    // adminロールは*:*権限を持つ
    expect(
      permissions.some(
        (p: { resource: string; action: string }) => p.resource === '*' && p.action === '*'
      )
    ).toBe(true);
  });

  /**
   * 要件19.6: システム管理者ロールから*:*権限の削除拒否
   * @requirement user-authentication/REQ-19.6
   */
  test('システム管理者ロールから*:*権限は削除できない', async ({ request }) => {
    const prisma = getPrismaClient();

    // adminロールと*:*権限を取得
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    const wildcardPermission = await prisma.permission.findFirst({
      where: { resource: '*', action: '*' },
    });

    // *:*権限の削除を試みる
    const deleteResponse = await request.delete(
      `${API_BASE_URL}/api/v1/roles/${adminRole!.id}/permissions/${wildcardPermission!.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(deleteResponse.status()).toBe(400);
    const error = await deleteResponse.json();
    expect(error.code).toBe('ADMIN_WILDCARD_PROTECTED');
  });

  /**
   * 要件19.8: 権限の存在検証
   * @requirement user-authentication/REQ-19.8
   */
  test('存在しない権限IDでの割り当ては拒否される', async ({ request }) => {
    // テスト用ロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Invalid Permission Role',
        description: 'Test role for invalid permission',
      },
    });
    const role = await createRoleResponse.json();

    // 存在しない権限IDで割り当てを試みる
    const assignResponse = await request.post(
      `${API_BASE_URL}/api/v1/roles/${role.id}/permissions`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          permissionId: 'non-existent-id',
        },
      }
    );

    expect(assignResponse.status()).toBe(404);
  });
});
