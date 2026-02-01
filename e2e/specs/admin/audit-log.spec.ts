import { test, expect } from '@playwright/test';
import {
  resetTestUser,
  cleanNonSystemRoles,
  getPrismaClient,
  getTestUser,
} from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

/**
 * 監査ログとコンプライアンスのE2Eテスト
 *
 * @requirement user-authentication/REQ-22 監査ログとコンプライアンス
 * @requirement user-authentication/REQ-28.40 監査ログリンククリック → 監査ログ画面遷移
 *
 * このテストスイートは、監査ログの記録・取得機能を
 * End-to-Endで検証します。
 */
test.describe('監査ログとコンプライアンス', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetTestUser('ADMIN_USER');
    // テストで作成されたカスタムロールをクリーンアップ
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
   * 要件22.1: ロール作成時の監査ログ記録
   * 要件10.6: センシティブ操作の監査ログ
   * @requirement user-authentication/REQ-10.6 @requirement user-authentication/REQ-22.1
   * @requirement user-authentication/REQ-22.2 権限追加・削除時の監査ログ
   * @requirement user-authentication/REQ-22.6 監査ログ保存失敗時の操作中断
   * @requirement user-authentication/REQ-22.7 監査ログに変更前後の値を含める
   */
  test('ロール作成時に監査ログが記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // 監査ログの件数を取得
    const beforeCount = await prisma.auditLog.count();

    // ロールを作成
    await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Audit Test Role',
        description: 'Role for audit log testing',
      },
    });

    // 監査ログが増えたことを確認
    const afterCount = await prisma.auditLog.count();
    expect(afterCount).toBeGreaterThan(beforeCount);

    // ROLE_CREATEDアクションの監査ログが存在することを確認
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'ROLE_CREATED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(auditLog).not.toBeNull();
  });

  /**
   * 要件22.3: ユーザーへのロール割り当て時の監査ログ記録
   * 要件10.6: センシティブ操作の監査ログ
   * @requirement user-authentication/REQ-10.6 @requirement user-authentication/REQ-22.3
   * @requirement user-authentication/REQ-22.2 権限追加・削除時の監査ログ
   * @requirement user-authentication/REQ-22.7 監査ログに変更前後の値を含める
   */
  test('ユーザーへのロール割り当て時に監査ログが記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを取得
    const testUser = await getTestUser('REGULAR_USER');

    // 新しいロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Assignment Test Role',
        description: 'Role for assignment testing',
      },
    });
    const newRole = await createRoleResponse.json();

    // 監査ログの件数を取得
    const beforeCount = await prisma.auditLog.count();

    // ユーザーにロールを割り当て
    await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [newRole.id],
      },
    });

    // 監査ログが増えたことを確認
    const afterCount = await prisma.auditLog.count();
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  /**
   * 要件22.4: 監査ログには実行者、対象、アクション、タイムスタンプが含まれる
   * 要件22.8: 権限チェック失敗をセキュリティログに記録
   * 要件10.6: センシティブ操作の監査ログ
   * @requirement user-authentication/REQ-10.6 @requirement user-authentication/REQ-22.4 @requirement user-authentication/REQ-22.8
   */
  test('監査ログには必要な情報が含まれる', async ({ request }) => {
    const prisma = getPrismaClient();

    // ロールを作成して監査ログを生成
    await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Info Test Role',
        description: 'Role for info testing',
      },
    });

    // 最新の監査ログを取得
    const auditLog = await prisma.auditLog.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBeDefined();
    expect(auditLog?.targetType).toBeDefined();
    expect(auditLog?.action).toBeDefined();
    expect(auditLog?.createdAt).toBeDefined();
  });

  /**
   * 要件22.5: 監査ログのフィルタリング（API経由）
   * @requirement user-authentication/REQ-22.5
   */
  test('管理者は監査ログをフィルタリングして取得できる', async ({ request }) => {
    // 監査ログ一覧を取得
    const logsResponse = await request.get(`${API_BASE_URL}/api/v1/audit-logs`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(logsResponse.ok()).toBeTruthy();
    const logsData = await logsResponse.json();

    // レスポンス形式を確認（配列が返される）
    expect(Array.isArray(logsData)).toBe(true);
  });

  /**
   * 要件22.5: 日付範囲でフィルタリング
   * @requirement user-authentication/REQ-22.5
   */
  test('監査ログを日付範囲でフィルタリングできる', async ({ request }) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 日付範囲でフィルタリング
    const logsResponse = await request.get(`${API_BASE_URL}/api/v1/audit-logs`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        startDate: yesterday.toISOString(),
        endDate: today.toISOString(),
      },
    });

    expect(logsResponse.ok()).toBeTruthy();
  });

  /**
   * 要件22.10: 監査ログのJSON形式エクスポート
   * @requirement user-authentication/REQ-22.10
   */
  test('監査ログをJSON形式でエクスポートできる', async ({ request }) => {
    // ロールを作成して監査ログを生成
    await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Export Test Role',
        description: 'Role for export testing',
      },
    });

    // エクスポートAPIを呼び出し
    const exportResponse = await request.get(`${API_BASE_URL}/api/v1/audit-logs/export`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(exportResponse.ok()).toBeTruthy();
    const exportData = await exportResponse.json();
    expect(Array.isArray(exportData)).toBe(true);
  });

  /**
   * 要件22.11: 監査ログの構造検証
   * @requirement user-authentication/REQ-22.11
   * @requirement user-authentication/REQ-22.12 監査ログテーブルのインデックス設計
   */
  test('監査ログは規定の構造を持つ', async ({ request }) => {
    const prisma = getPrismaClient();

    // ロールを作成して監査ログを生成
    await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Structure Test Role',
        description: 'Role for structure testing',
      },
    });

    // 最新の監査ログを取得
    const auditLog = await prisma.auditLog.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(auditLog).not.toBeNull();

    // 必須フィールドの存在確認
    expect(auditLog?.id).toBeDefined(); // 一意のID
    expect(auditLog?.createdAt).toBeDefined(); // 操作実行日時
    expect(auditLog?.actorId).toBeDefined(); // 実行者ID
    expect(auditLog?.action).toBeDefined(); // アクション種別
    expect(auditLog?.targetType).toBeDefined(); // 対象リソースタイプ
    expect(auditLog?.targetId).toBeDefined(); // 対象リソースID
  });

  /**
   * 一般ユーザーは監査ログにアクセスできない
   * @requirement user-authentication/REQ-22.9
   */
  test('一般ユーザーは監査ログにアクセスできない', async ({ request }) => {
    // 一般ユーザーとしてログイン
    const userLoginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'user@example.com',
        password: 'Password123!',
      },
    });
    const { accessToken: userToken } = await userLoginResponse.json();

    // 監査ログにアクセス試行
    const logsResponse = await request.get(`${API_BASE_URL}/api/v1/audit-logs`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    expect(logsResponse.status()).toBe(403);
  });

  /**
   * 要件22.7: 監査ログに変更前後の値（before/after）を含める
   * ロール変更操作時に変更前と変更後の値が監査ログに記録される
   * @requirement user-authentication/REQ-22.7
   */
  test('監査ログに変更前後の値（before/after）が記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを取得
    const testUser = await getTestUser('REGULAR_USER');

    // 新しいロールを作成
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Before After Test Role',
        description: 'Role for testing before/after values',
      },
    });
    const newRole = await createRoleResponse.json();

    // ユーザーにロールを割り当て
    await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [newRole.id],
      },
    });

    // USER_ROLE_ASSIGNED アクションの監査ログを取得
    // user-role.service.ts で action: 'USER_ROLE_ASSIGNED', targetType: 'user-role' で記録される
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'USER_ROLE_ASSIGNED',
        targetType: 'user-role',
        targetId: testUser.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(auditLog).not.toBeNull();

    // afterには新しく割り当てられたロール情報が含まれる
    // user-role.service.ts: after: { userId, userEmail, roleId, roleName }
    expect(auditLog?.after).not.toBeNull();
    const afterValue = auditLog?.after as {
      userId?: string;
      userEmail?: string;
      roleId?: string;
      roleName?: string;
    } | null;
    expect(afterValue?.roleId).toBe(newRole.id);
    expect(afterValue?.roleName).toBe('Before After Test Role');
  });

  /**
   * 要件22.6: 監査ログ保存失敗時の操作中断
   * 監査ログが正常に保存されないと操作は完了しない
   * （E2Eテストでは正常系のみ検証 - DB障害シミュレーションは困難）
   * @requirement user-authentication/REQ-22.6
   */
  test('監査ログは操作と同時に保存される', async ({ request }) => {
    const prisma = getPrismaClient();

    // 監査ログ作成前のカウント
    const beforeCount = await prisma.auditLog.count();

    // ロールを作成（この操作で監査ログが作成される）
    const createRoleResponse = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Audit Log Transaction Test Role',
        description: 'Role for transaction testing',
      },
    });

    expect(createRoleResponse.ok()).toBeTruthy();
    const createdRole = await createRoleResponse.json();

    // 操作が成功した場合、監査ログも必ず作成されている
    const afterCount = await prisma.auditLog.count();
    expect(afterCount).toBeGreaterThan(beforeCount);

    // 作成されたロールに対応する監査ログが存在することを確認
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'ROLE_CREATED',
        targetId: createdRole.id,
      },
    });

    expect(auditLog).not.toBeNull();
    // 監査ログと操作が同一トランザクション内で処理されていることを確認
    // （監査ログが存在 = 操作とログが共に成功）
    expect(auditLog?.targetType).toBe('role');
  });

  /**
   * 要件22.9: センシティブ操作時のアラート通知
   * 管理者ロール変更などのセンシティブな操作が監査ログに記録される
   * @requirement user-authentication/REQ-22.9
   */
  test('センシティブ操作は監査ログに記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを取得
    const testUser = await getTestUser('REGULAR_USER');

    // 管理者ロールを取得
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    expect(adminRole).not.toBeNull();

    // 監査ログ作成前のカウント（USER_ROLE_ASSIGNEDアクション）
    const beforeCount = await prisma.auditLog.count({
      where: { action: 'USER_ROLE_ASSIGNED' },
    });

    // センシティブ操作: ユーザーに管理者ロールを割り当て
    await request.post(`${API_BASE_URL}/api/v1/users/${testUser.id}/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        roleIds: [adminRole!.id],
      },
    });

    // センシティブ操作が監査ログに記録されていることを確認
    const afterCount = await prisma.auditLog.count({
      where: { action: 'USER_ROLE_ASSIGNED' },
    });

    expect(afterCount).toBeGreaterThan(beforeCount);

    // 最新の監査ログを取得
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'USER_ROLE_ASSIGNED',
        targetType: 'user-role',
        targetId: testUser.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBeDefined();
    expect(auditLog?.createdAt).toBeDefined();

    // センシティブ操作の詳細情報がafter値に含まれていることを確認
    const afterValue = auditLog?.after as {
      userId?: string;
      userEmail?: string;
      roleId?: string;
      roleName?: string;
    } | null;
    // 管理者ロールの割り当てが記録されている
    expect(afterValue?.roleId).toBe(adminRole!.id);
    expect(afterValue?.roleName).toBe('admin');
  });
});
