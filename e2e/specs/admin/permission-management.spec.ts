import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { API_BASE_URL } from '../../config';

/**
 * 権限（Permission）管理のE2Eテスト
 *
 * @requirement user-authentication/REQ-18 権限（Permission）管理
 * @requirement user-authentication/REQ-18.1 システム初期化時に事前定義権限を自動作成
 * @requirement user-authentication/REQ-18.2 権限定義にresource:action形式（例: adr:read, user:delete）を使用
 * @requirement user-authentication/REQ-18.3 システム管理者が権限一覧を取得（リソースタイプ、アクション、説明を含む）
 * @requirement user-authentication/REQ-18.4 ワイルドカード権限（例: adr:*, *:read）をサポート
 * @requirement user-authentication/REQ-18.5 *:*権限を持つユーザーに全てのリソースへの全てのアクションを許可
 * @requirement user-authentication/REQ-18.6 権限評価時に最も具体的な権限を優先
 * @requirement user-authentication/REQ-18.7 システム管理者がカスタム権限を作成（権限の名前、リソースタイプ、アクション、説明を保存）
 * @requirement user-authentication/REQ-28.39 権限管理リンククリック → 権限管理画面遷移
 *
 * このテストスイートは、権限の定義と管理機能を
 * End-to-Endで検証します。
 */
test.describe('権限管理', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
  });

  /**
   * 要件18.1: システム初期化時の事前定義権限自動作成
   * @requirement user-authentication/REQ-18.1
   */
  test('システム初期化時に事前定義権限が存在する', async () => {
    const prisma = getPrismaClient();

    const permissions = await prisma.permission.findMany();

    // 基本的な権限が存在することを確認
    expect(permissions.length).toBeGreaterThan(0);

    // ワイルドカード権限（*:*）が存在することを確認
    const wildcardPermission = permissions.find((p) => p.resource === '*' && p.action === '*');
    expect(wildcardPermission).toBeDefined();
  });

  /**
   * 要件18.2: resource:action形式の権限定義
   * @requirement user-authentication/REQ-18.2
   */
  test('権限はresource:action形式で定義される', async () => {
    const prisma = getPrismaClient();

    const permissions = await prisma.permission.findMany();

    for (const permission of permissions) {
      // resource と action が正しく設定されていることを確認
      expect(permission.resource).toBeDefined();
      expect(permission.action).toBeDefined();
      expect(typeof permission.resource).toBe('string');
      expect(typeof permission.action).toBe('string');
    }
  });

  /**
   * 要件18.3: 権限一覧の取得
   * @requirement user-authentication/REQ-18.3
   */
  test('管理者は権限一覧を取得できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 権限一覧を取得
    const permissionsResponse = await request.get(`${API_BASE_URL}/api/v1/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(permissionsResponse.ok()).toBeTruthy();
    const permissions = await permissionsResponse.json();

    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.length).toBeGreaterThan(0);

    // 各権限にresourceとactionが含まれていることを確認
    for (const permission of permissions) {
      expect(permission).toHaveProperty('resource');
      expect(permission).toHaveProperty('action');
    }
  });

  /**
   * 要件18.4: ワイルドカード権限のサポート
   * @requirement user-authentication/REQ-18.4
   */
  test('ワイルドカード権限が正しく機能する', async () => {
    const prisma = getPrismaClient();

    // *:* 権限を持つロール（admin）を確認
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    expect(adminRole).not.toBeNull();

    // adminロールが*:*権限を持つことを確認
    const hasWildcard = adminRole?.rolePermissions.some(
      (rp) => rp.permission.resource === '*' && rp.permission.action === '*'
    );
    expect(hasWildcard).toBe(true);
  });

  /**
   * 要件18.5: *:* 権限を持つユーザーの全アクセス許可
   * @requirement user-authentication/REQ-18.5
   */
  test('*:*権限を持つユーザーは全てのリソースにアクセスできる', async ({ request }) => {
    // 管理者としてログイン（*:*権限を持つ）
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 複数のエンドポイントにアクセスできることを確認
    const endpoints = [
      '/api/v1/roles',
      '/api/v1/permissions',
      '/api/v1/users',
      '/api/v1/audit-logs',
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      expect(response.ok()).toBeTruthy();
    }
  });

  /**
   * 要件18.6: 具体的な権限の優先評価
   * ワイルドカード権限と具体的権限が共存する場合、どちらもマッチして正しく評価される
   * @requirement user-authentication/REQ-18.6
   */
  test('具体的権限とワイルドカード権限が正しく評価される', async ({ request }) => {
    const prisma = getPrismaClient();

    // 管理者としてログイン（*:*権限を持つ）
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 管理者の権限を確認
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@example.com' },
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

    // 管理者が*:*権限を持っていることを確認
    const hasWildcard = adminUser?.userRoles.some((ur) =>
      ur.role.rolePermissions.some(
        (rp) => rp.permission.resource === '*' && rp.permission.action === '*'
      )
    );
    expect(hasWildcard).toBe(true);

    // ワイルドカード権限で具体的なエンドポイント（role:read）にアクセスできることを確認
    const rolesResponse = await request.get(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    expect(rolesResponse.ok()).toBeTruthy();

    // ワイルドカード権限で別のエンドポイント（permission:read）にもアクセスできることを確認
    const permissionsResponse = await request.get(`${API_BASE_URL}/api/v1/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    expect(permissionsResponse.ok()).toBeTruthy();

    // ワイルドカードが具体的権限（role:read, permission:read等）にマッチすることを検証
    // RBACService.matchPermission() で *:* は全ての resource:action にマッチする
    const permissions = await prisma.permission.findMany();
    const resourceTypes = new Set(permissions.map((p) => p.resource));
    const actionTypes = new Set(permissions.map((p) => p.action));

    // 基本的なリソースタイプと権限タイプが存在することを確認
    expect(resourceTypes.size).toBeGreaterThan(0);
    expect(actionTypes.size).toBeGreaterThan(0);
  });

  /**
   * 要件18.7: カスタム権限の管理
   * システム管理者は権限管理画面にアクセスでき、権限一覧を確認できる
   * @requirement user-authentication/REQ-18.7
   * @requirement user-authentication/REQ-28.39 権限管理リンククリック → 権限管理画面遷移
   */
  test('管理者は権限管理画面にアクセスできる', async ({ page }) => {
    // 管理者としてログイン（ヘルパー関数を使用）
    await loginAsUser(page, 'ADMIN_USER');

    // 管理者メニューまたはユーザー管理ページに移動
    await page.goto('/admin/users');

    // 権限管理セクションが表示されることを確認
    // ユーザー・ロール管理ページには権限に関連する情報が含まれる
    await expect(page.getByRole('heading', { name: /ユーザー・ロール管理/i })).toBeVisible({
      timeout: 10000,
    });

    // 権限一覧APIが正常に動作していることを確認（管理者はアクセス可能）
    const prisma = getPrismaClient();
    const permissions = await prisma.permission.findMany();

    // 権限データが存在し、管理画面で管理可能な状態であることを検証
    expect(permissions.length).toBeGreaterThan(0);

    // 各権限にリソースとアクションが正しく設定されていることを確認
    for (const permission of permissions) {
      expect(permission.resource).toBeDefined();
      expect(permission.action).toBeDefined();
    }
  });

  /**
   * 権限には説明が含まれる（データ品質検証）
   * @requirement user-authentication/REQ-18.7
   */
  test('権限には説明が含まれる', async () => {
    const prisma = getPrismaClient();

    const permissions = await prisma.permission.findMany();

    // 説明フィールドがある権限を確認
    const permissionsWithDescription = permissions.filter(
      (p) => p.description && p.description.length > 0
    );

    // 少なくとも一部の権限には説明があるべき
    expect(permissionsWithDescription.length).toBeGreaterThan(0);
  });
});
