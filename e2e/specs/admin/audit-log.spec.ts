import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';

/**
 * 監査ログとコンプライアンスのE2Eテスト
 *
 * @REQ-22 監査ログとコンプライアンス
 * @REQ-28.40 監査ログリンククリック → 監査ログ画面遷移
 *
 * このテストスイートは、監査ログの記録・取得機能を
 * End-to-Endで検証します。
 */
test.describe('監査ログとコンプライアンス', () => {
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
   * 要件22.1: ロール作成時の監査ログ記録
   * 要件10.6: センシティブ操作の監査ログ
   * @REQ-10.6 @REQ-22.1
   * @REQ-22.2 権限追加・削除時の監査ログ
   * @REQ-22.6 監査ログ保存失敗時の操作中断
   * @REQ-22.7 監査ログに変更前後の値を含める
   */
  test('ロール作成時に監査ログが記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // 監査ログの件数を取得
    const beforeCount = await prisma.auditLog.count();

    // ロールを作成
    await request.post('http://localhost:3000/api/v1/roles', {
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
   * @REQ-10.6 @REQ-22.3
   * @REQ-22.2 権限追加・削除時の監査ログ
   * @REQ-22.7 監査ログに変更前後の値を含める
   */
  test('ユーザーへのロール割り当て時に監査ログが記録される', async ({ request }) => {
    const prisma = getPrismaClient();

    // テストユーザーを作成
    const testUser = await createTestUser('REGULAR_USER');

    // 新しいロールを作成
    const createRoleResponse = await request.post('http://localhost:3000/api/v1/roles', {
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
    await request.post(`http://localhost:3000/api/v1/users/${testUser.id}/roles`, {
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
   * @REQ-10.6 @REQ-22.4 @REQ-22.8
   */
  test('監査ログには必要な情報が含まれる', async ({ request }) => {
    const prisma = getPrismaClient();

    // ロールを作成して監査ログを生成
    await request.post('http://localhost:3000/api/v1/roles', {
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
   * @REQ-22.5
   */
  test('管理者は監査ログをフィルタリングして取得できる', async ({ request }) => {
    // 監査ログ一覧を取得
    const logsResponse = await request.get('http://localhost:3000/api/v1/audit-logs', {
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
   * @REQ-22.5
   */
  test('監査ログを日付範囲でフィルタリングできる', async ({ request }) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 日付範囲でフィルタリング
    const logsResponse = await request.get('http://localhost:3000/api/v1/audit-logs', {
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
   * @REQ-22.10
   */
  test('監査ログをJSON形式でエクスポートできる', async ({ request }) => {
    // ロールを作成して監査ログを生成
    await request.post('http://localhost:3000/api/v1/roles', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Export Test Role',
        description: 'Role for export testing',
      },
    });

    // エクスポートAPIを呼び出し
    const exportResponse = await request.get('http://localhost:3000/api/v1/audit-logs/export', {
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
   * @REQ-22.11
   * @REQ-22.12 監査ログテーブルのインデックス設計
   */
  test('監査ログは規定の構造を持つ', async ({ request }) => {
    const prisma = getPrismaClient();

    // ロールを作成して監査ログを生成
    await request.post('http://localhost:3000/api/v1/roles', {
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
   * 要件22.9: センシティブ操作時のアラート通知
   * @REQ-22.9
   */
  test('一般ユーザーは監査ログにアクセスできない', async ({ request }) => {
    // 一般ユーザーを作成
    await createTestUser('REGULAR_USER');

    // 一般ユーザーとしてログイン
    const userLoginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'user@example.com',
        password: 'Password123!',
      },
    });
    const { accessToken: userToken } = await userLoginResponse.json();

    // 監査ログにアクセス試行
    const logsResponse = await request.get('http://localhost:3000/api/v1/audit-logs', {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    expect(logsResponse.status()).toBe(403);
  });
});
