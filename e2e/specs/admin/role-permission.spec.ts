import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';

/**
 * ロールへの権限割り当てのE2Eテスト
 *
 * @REQ-19 ロールへの権限割り当て
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
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
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
   */
  test('管理者はロールに権限を追加できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post('http://localhost:3000/api/v1/roles', {
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
      `http://localhost:3000/api/v1/roles/${role.id}/permissions`,
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
   */
  test('重複する権限の割り当ては無視される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post('http://localhost:3000/api/v1/roles', {
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
    await request.post(`http://localhost:3000/api/v1/roles/${role.id}/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        permissionId: permission!.id,
      },
    });

    const secondResponse = await request.post(
      `http://localhost:3000/api/v1/roles/${role.id}/permissions`,
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
   */
  test('管理者はロールから権限を削除できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post('http://localhost:3000/api/v1/roles', {
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

    await request.post(`http://localhost:3000/api/v1/roles/${role.id}/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        permissionId: permission!.id,
      },
    });

    // 権限を削除
    const deleteResponse = await request.delete(
      `http://localhost:3000/api/v1/roles/${role.id}/permissions/${permission!.id}`,
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
   */
  test('管理者はロールの権限一覧を取得できる', async ({ request }) => {
    const prisma = getPrismaClient();

    // adminロールを取得
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // ロールの権限一覧を取得
    const permissionsResponse = await request.get(
      `http://localhost:3000/api/v1/roles/${adminRole!.id}/permissions`,
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
      `http://localhost:3000/api/v1/roles/${adminRole!.id}/permissions/${wildcardPermission!.id}`,
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
   */
  test('存在しない権限IDでの割り当ては拒否される', async ({ request }) => {
    // テスト用ロールを作成
    const createRoleResponse = await request.post('http://localhost:3000/api/v1/roles', {
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
      `http://localhost:3000/api/v1/roles/${role.id}/permissions`,
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
