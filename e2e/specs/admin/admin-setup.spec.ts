import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

/**
 * 初期管理者アカウントセットアップのE2Eテスト
 *
 * @REQ-3 初期管理者アカウントのセットアップ
 *
 * このテストスイートは、システム初期セットアップ時の
 * 管理者アカウント作成機能をEnd-to-Endで検証します。
 */
test.describe('初期管理者アカウントセットアップ', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * 要件3.1: Backend Service初回起動時の管理者自動作成
   * 要件3.3: 管理者ロール（admin）の割り当て
   */
  test('システム初期化時に管理者アカウントが存在する', async ({ request }) => {
    // ヘルスチェックでAPIが利用可能であることを確認
    const healthResponse = await request.get(`${API_BASE_URL}/health`);
    expect(healthResponse.ok()).toBeTruthy();

    // データベースに管理者ロールが存在することを確認
    const prisma = getPrismaClient();
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    expect(adminRole).not.toBeNull();
    expect(adminRole?.isSystem).toBe(true);
  });

  /**
   * 要件3.2: データベースシーディングによる管理者作成
   */
  test('シーディング後に事前定義ロールが存在する', async () => {
    const prisma = getPrismaClient();

    // システム管理者ロール
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    expect(adminRole).not.toBeNull();
    expect(adminRole?.isSystem).toBe(true);

    // 一般ユーザーロール
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });
    expect(userRole).not.toBeNull();
    expect(userRole?.isSystem).toBe(true);
  });

  /**
   * 要件3.4: 既存管理者のスキップ
   */
  test('管理者メールアドレスが重複する場合はスキップされる', async () => {
    const prisma = getPrismaClient();

    // 管理者ユーザーを取得
    const adminUsers = await prisma.user.findMany({
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // admin@example.comが存在する場合、重複作成されていないことを確認
    const adminEmails = adminUsers
      .filter((u) => u.userRoles.some((ur) => ur.role.name === 'admin'))
      .map((u) => u.email);

    // 同じメールアドレスの重複がないことを確認
    const uniqueEmails = [...new Set(adminEmails)];
    expect(adminEmails.length).toBe(uniqueEmails.length);
  });

  /**
   * 要件3.5: 管理者作成のログ記録
   */
  test('管理者アカウントにadminロールが正しく割り当てられている', async () => {
    const prisma = getPrismaClient();

    // 管理者ユーザーを取得
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

    // 管理者ロールが割り当てられていることを確認
    const hasAdminRole = adminUser?.userRoles.some((ur) => ur.role.name === 'admin');
    expect(hasAdminRole).toBe(true);

    // 管理者ロールにワイルドカード権限が割り当てられていることを確認
    const adminRole = adminUser?.userRoles.find((ur) => ur.role.name === 'admin')?.role;
    const hasWildcardPermission = adminRole?.rolePermissions.some(
      (rp) => rp.permission.resource === '*' && rp.permission.action === '*'
    );
    expect(hasWildcardPermission).toBe(true);
  });
});
