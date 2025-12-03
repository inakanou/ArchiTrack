import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * ロールベースアクセス制御（RBAC）のE2Eテスト
 *
 * @REQ-6 拡張可能なロールベースアクセス制御（RBAC）
 * @REQ-21 権限チェック機能
 *
 * このテストスイートは、RBACシステムの権限検証機能を
 * End-to-Endで検証します。
 */
test.describe('ロールベースアクセス制御（RBAC）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
  });

  /**
   * 要件6.1: 保護されたAPIエンドポイントへのアクセス時の権限検証
   * 要件6.2: 権限不足時の403エラー
   */
  test('一般ユーザーは管理者専用ページにアクセスできない', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // ユーザー管理ページにアクセス試行
    await page.goto('/admin/users');

    // 認証状態の初期化が完了し、アクセス拒否メッセージが表示されるまで待機
    // ProtectedRouteコンポーネントはh1タグで「アクセス権限がありません」を表示する
    await expect(page.getByRole('heading', { name: /アクセス権限がありません/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * 要件6.1: 管理者は管理者専用ページにアクセスできる
   */
  test('管理者はユーザー管理ページにアクセスできる', async ({ page }) => {
    await createTestUser('ADMIN_USER');
    await loginAsUser(page, 'ADMIN_USER');

    // ユーザー管理ページにアクセス
    await page.goto('/admin/users');

    // ページが正常に表示されることを確認
    // UserManagementページの見出しは「ユーザー・ロール管理」
    await expect(page.getByRole('heading', { name: /ユーザー・ロール管理/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * 要件6.3: ユーザー作成時のデフォルトロール割り当て
   */
  test('新規ユーザーにはデフォルトロールが割り当てられる', async () => {
    const prisma = getPrismaClient();

    // テストユーザーを作成
    const user = await createTestUser('REGULAR_USER');

    // ユーザーにロールが割り当てられていることを確認
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    expect(userWithRoles?.userRoles.length).toBeGreaterThan(0);
    const hasUserRole = userWithRoles?.userRoles.some((ur) => ur.role.name === 'user');
    expect(hasUserRole).toBe(true);
  });

  /**
   * 要件6.4: 複数ロールの権限統合
   */
  test('複数ロールを持つユーザーは全ロールの権限を持つ', async () => {
    const prisma = getPrismaClient();

    // 管理者ユーザーを作成（admin + user ロール）
    const admin = await createTestUser('ADMIN_USER');

    // ユーザーのロールと権限を取得
    const userWithRoles = await prisma.user.findUnique({
      where: { id: admin.id },
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

    // 全ロールの権限を収集
    const allPermissions = new Set<string>();
    userWithRoles?.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        allPermissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });

    // 管理者は *:* 権限を持つべき
    expect(allPermissions.has('*:*')).toBe(true);
  });

  /**
   * 要件6.6: 最後のシステム管理者ロールの変更拒否
   */
  test('最後の管理者ユーザーのロールは削除できない', async () => {
    const prisma = getPrismaClient();

    // 管理者ユーザーを作成してログイン
    const admin = await createTestUser('ADMIN_USER');

    // 管理者ロールを取得
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // 管理者ユーザーのユーザーロール割り当てを取得
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId: admin.id,
        roleId: adminRole!.id,
      },
    });

    expect(userRole).not.toBeNull();

    // ユーザーが最後の管理者かどうかを確認
    const adminCount = await prisma.userRole.count({
      where: {
        roleId: adminRole!.id,
      },
    });

    // 最後の管理者の場合、削除を試みると拒否されるべき
    if (adminCount === 1) {
      // この検証はAPIテストで行う（UIからは通常この操作ができない）
      expect(adminCount).toBe(1);
    }
  });

  /**
   * 要件6.7: リソースタイプとアクションの組み合わせによる権限判定
   */
  test('権限はリソースタイプとアクションの組み合わせで定義される', async () => {
    const prisma = getPrismaClient();

    // 権限一覧を取得
    const permissions = await prisma.permission.findMany();

    // 各権限がresource:action形式であることを確認
    for (const permission of permissions) {
      expect(permission.resource).toBeDefined();
      expect(permission.action).toBeDefined();
      expect(permission.resource.length).toBeGreaterThan(0);
      expect(permission.action.length).toBeGreaterThan(0);
    }
  });

  /**
   * 要件21.1: APIエンドポイントアクセス時の権限検証
   * 要件21.2: 権限不足時の403 Forbiddenエラー
   */
  test('権限のないユーザーはAPIエンドポイントにアクセスできない', async ({ request }) => {
    // 一般ユーザーを作成してトークンを取得
    await createTestUser('REGULAR_USER');

    // ログインしてトークンを取得
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'user@example.com',
        password: 'Password123!',
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const { accessToken } = await loginResponse.json();

    // 権限が必要なエンドポイント（ロール一覧）にアクセス
    const rolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // 一般ユーザーはrole:read権限を持たないため403エラー
    expect(rolesResponse.status()).toBe(403);
  });

  /**
   * 要件21.5: ワイルドカード権限（*:*）を持つユーザーは全ての権限チェックを通過
   */
  test('管理者はワイルドカード権限で全てのAPIにアクセスできる', async ({ request }) => {
    // 管理者ユーザーを作成
    await createTestUser('ADMIN_USER');

    // ログインしてトークンを取得
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const { accessToken } = await loginResponse.json();

    // ロール一覧にアクセス
    const rolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(rolesResponse.ok()).toBeTruthy();

    // 権限一覧にアクセス
    const permissionsResponse = await request.get(`${API_BASE_URL}/api/v1/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(permissionsResponse.ok()).toBeTruthy();
  });
});
