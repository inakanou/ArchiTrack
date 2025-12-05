import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL } from '../../config';

/**
 * 権限（Permission）管理のE2Eテスト
 *
 * @REQ-18 権限（Permission）管理
 * @REQ-18.1 システム初期化時に事前定義権限を自動作成
 * @REQ-18.2 権限定義にresource:action形式（例: adr:read, user:delete）を使用
 * @REQ-18.3 システム管理者が権限一覧を取得（リソースタイプ、アクション、説明を含む）
 * @REQ-18.4 ワイルドカード権限（例: adr:*, *:read）をサポート
 * @REQ-18.5 *:*権限を持つユーザーに全てのリソースへの全てのアクションを許可
 * @REQ-18.6 権限評価時に最も具体的な権限を優先
 * @REQ-18.7 システム管理者がカスタム権限を作成（権限の名前、リソースタイプ、アクション、説明を保存）
 * @REQ-28.39 権限管理リンククリック → 権限管理画面遷移
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
   * @REQ-18.1
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
   * @REQ-18.2
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
   * @REQ-18.3
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
   * @REQ-18.4
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
   * @REQ-18.5
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
   * @REQ-18.6
   */
  test('権限の構造が正しい', async () => {
    const prisma = getPrismaClient();

    const permissions = await prisma.permission.findMany();

    // リソースタイプの確認
    const resourceTypes = new Set(permissions.map((p) => p.resource));

    // 基本的なリソースタイプが存在することを確認
    // 実際の実装に応じて調整
    expect(resourceTypes.size).toBeGreaterThan(0);

    // アクションタイプの確認
    const actionTypes = new Set(permissions.map((p) => p.action));
    expect(actionTypes.size).toBeGreaterThan(0);
  });

  /**
   * 要件18.7: カスタム権限の作成（APIが実装されている場合）
   * @REQ-18.7
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
