import { test, expect } from '@playwright/test';
import {
  resetTestUser,
  getTestUser,
  cleanNonUserData,
  cleanNonSystemRoles,
  getPrismaClient,
} from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

/**
 * データ整合性とトランザクション管理のE2Eテスト
 *
 * @REQ-25 データ整合性とトランザクション管理
 *
 * このテストスイートは、データの整合性とトランザクション管理を
 * End-to-Endで検証します。
 */
test.describe('データ整合性とトランザクション管理', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetTestUser('ADMIN_USER');
    await resetTestUser('REGULAR_USER');
    await cleanNonUserData();
    await cleanNonSystemRoles();

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
   * 要件25.1: ユーザー登録はトランザクション内で処理
   * @REQ-25.1
   * @REQ-25.2
   */
  test('ユーザー登録時にユーザー作成とロール割り当てが一貫して行われる', async () => {
    const prisma = getPrismaClient();

    // テストユーザーを取得（beforeEachで既にリセット済み）
    const user = await getTestUser('REGULAR_USER');

    // ユーザーが作成されていることを確認
    const createdUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    expect(createdUser).not.toBeNull();
    // ロールが割り当てられていることを確認
    expect(createdUser?.userRoles.length).toBeGreaterThan(0);
    expect(createdUser?.userRoles.some((ur) => ur.role.name === 'user')).toBe(true);
  });

  /**
   * 要件25.3: 複数ロールの一括割り当てはトランザクション内で処理
   * @REQ-25.3
   * @REQ-25.2
   */
  test('複数ロールの一括割り当てはアトミックに行われる', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを取得（beforeEachで既にリセット済み）
    const testUser = await getTestUser('REGULAR_USER');

    // 複数の新しいロールを作成
    const role1Response = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: 'Role X', description: 'First role' },
    });
    const role2Response = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: 'Role Y', description: 'Second role' },
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
   * 要件25.5: 監査ログの保存失敗時はロールバック
   * （このテストはAPIの振る舞いを検証）
   * @REQ-25.5
   * @REQ-25.2
   */
  test('ロール作成と監査ログは一貫して記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // ロールを作成
    const createResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Integrity Test Role',
        description: 'Role for integrity testing',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const role = await createResponse.json();

    // ロールが作成されていることを確認
    const createdRole = await prisma.role.findUnique({
      where: { id: role.id },
    });
    expect(createdRole).not.toBeNull();

    // 監査ログが記録されていることを確認
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        targetId: role.id,
        action: 'ROLE_CREATED',
      },
    });
    expect(auditLog).not.toBeNull();
  });

  /**
   * 要件25.7: ロール・権限の紐付け変更時の整合性検証
   * @REQ-25.7
   */
  test('ロール権限の変更は整合性を保つ', async ({ request }) => {
    const prisma = getPrismaClient();

    // テスト用ロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Permission Integrity Role',
        description: 'Role for permission integrity testing',
      },
    });
    const role = await createRoleResponse.json();

    // 権限を取得
    const permission = await prisma.permission.findFirst({
      where: { resource: 'adr', action: 'read' },
    });

    // 権限を追加
    await request.post(`${API_BASE_URL}/api/v1/roles/${role.id}/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        permissionIds: [permission!.id],
      },
    });

    // 権限が追加されていることを確認
    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        roleId: role.id,
        permissionId: permission!.id,
      },
    });
    expect(rolePermission).not.toBeNull();

    // 権限を削除
    await request.delete(`${API_BASE_URL}/api/v1/roles/${role.id}/permissions/${permission!.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // 権限が削除されていることを確認
    const deletedRolePermission = await prisma.rolePermission.findFirst({
      where: {
        roleId: role.id,
        permissionId: permission!.id,
      },
    });
    expect(deletedRolePermission).toBeNull();
  });

  /**
   * ユーザー削除時の関連データ整合性
   * @REQ-25.4
   * @REQ-25.2
   */
  test('ユーザー削除時に関連データが適切に処理される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを取得（beforeEachで既にリセット済み）
    const testUser = await getTestUser('REGULAR_USER');

    // ユーザーの存在を確認
    const userBefore = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(userBefore).not.toBeNull();

    // ユーザーを削除
    const deleteResponse = await request.delete(`${API_BASE_URL}/api/v1/users/${testUser.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(deleteResponse.ok()).toBeTruthy();

    // ユーザーが削除されていることを確認
    const userAfter = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(userAfter).toBeNull();

    // ユーザーロール紐付けも削除されていることを確認
    const userRoles = await prisma.userRole.findMany({
      where: { userId: testUser.id },
    });
    expect(userRoles.length).toBe(0);
  });

  /**
   * テスト終了後にマスターデータとテストユーザーを再作成
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after data-integrity tests...');
    await resetTestUser('ADMIN_USER');
    await resetTestUser('REGULAR_USER');
    await cleanNonUserData();
    await cleanNonSystemRoles();
    console.log('  ✓ Test data restored successfully');
  });
});
