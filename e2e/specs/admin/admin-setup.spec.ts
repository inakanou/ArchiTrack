import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

/**
 * 初期管理者アカウントセットアップのE2Eテスト
 *
 * @requirement user-authentication/REQ-3 初期管理者アカウントのセットアップ
 * @requirement user-authentication/REQ-17.4 システム管理者がロール一覧を取得
 * @requirement user-authentication/REQ-18.5 *:*権限を持つユーザーに全てのリソースへの全てのアクションを許可
 * @requirement user-authentication/REQ-28.37 ユーザー管理リンククリック → ユーザー管理画面遷移
 *
 * このテストスイートは、システム初期セットアップ時の
 * 管理者アカウント作成機能をEnd-to-Endで検証します。
 */
test.describe('初期管理者アカウントセットアップ', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * 要件3.1: Backend Service初回起動時の管理者自動作成
   * 要件3.3: 管理者ロール（admin）の割り当て
   * @requirement user-authentication/REQ-3.1 @requirement user-authentication/REQ-3.3
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
   * @requirement user-authentication/REQ-3.2
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
   * @requirement user-authentication/REQ-3.4
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
   * 要件3.3: 管理者ロール（admin）の割り当て
   * @requirement user-authentication/REQ-3.3
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

  /**
   * 要件3.5: 管理者作成のログ記録
   * WHEN 初期管理者が作成される THEN Authentication Serviceはログに記録しなければならない
   * @requirement user-authentication/REQ-3.5
   */
  test('初期管理者作成が監査ログに記録されている', async () => {
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
    });

    expect(adminUser).not.toBeNull();

    // 初期管理者作成の監査ログが存在することを確認
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'USER_CREATED',
        targetType: 'User',
        targetId: adminUser!.id,
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.action).toBe('USER_CREATED');
    expect(auditLog?.targetType).toBe('User');
    expect(auditLog?.targetId).toBe(adminUser!.id);

    // メタデータに初期管理者フラグが含まれていることを確認
    const metadata = auditLog?.metadata as { source?: string; isInitialAdmin?: boolean } | null;
    expect(metadata?.source).toBe('seed');
    expect(metadata?.isInitialAdmin).toBe(true);
  });
});
