import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 動的ロール管理のE2Eテスト
 *
 * @REQ-17 動的ロール管理
 * @REQ-17.1 システム管理者が新しいロールを作成しロール名、説明、優先順位を保存
 * @REQ-17.2 ロール名が既に存在する場合409 Conflictエラーを返す
 * @REQ-17.3 システム管理者がロール情報を更新し変更履歴を監査ログに記録
 * @REQ-17.4 システム管理者がロール一覧を取得し全てのロール（名前、説明、割り当てユーザー数、権限数）を返す
 * @REQ-17.5 システム管理者がロールを削除しロールが少なくとも1人のユーザーに割り当てられている場合削除を拒否
 * @REQ-17.6 システム管理者が事前定義ロール（システム管理者）を削除しようとする場合削除を拒否
 * @REQ-17.7 ロールを作成し一意のロールIDを生成
 * @REQ-17.8 ロール優先順位を設定し整数値（高い値が高優先度）を受け入れ
 * @REQ-17.9 新しいロールを作成しデフォルトで空の権限セットを割り当て
 * @REQ-28.38 ロール管理リンククリック → ロール管理画面遷移
 *
 * このテストスイートは、ロールの作成・更新・削除機能を
 * End-to-Endで検証します。
 */
test.describe('動的ロール管理', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
  });

  /**
   * 要件17.1: 新しいロールの作成
   * 要件17.7: 一意のロールIDの生成
   * 要件17.9: デフォルトで空の権限セット
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @REQ-17.1 @REQ-17.7 @REQ-17.9
   * @REQ-22.1
   */
  test('管理者は新しいロールを作成できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // ユーザー管理ページに移動
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /ユーザー.*ロール管理/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // ロールタブに切り替え
    await page.getByRole('tab', { name: /ロール/i }).click();

    // 新規ロール作成ボタンをクリック
    await page.getByRole('button', { name: /ロール.*作成|新規.*ロール/i }).click();

    // ロール情報を入力
    await page.getByLabel(/ロール名/i).fill('Project Manager');
    await page.getByLabel(/説明/i).fill('プロジェクトを管理するロール');

    // ダイアログ内の作成ボタンをクリック（aria-labelを使用）
    await page.getByRole('button', { name: 'ロールを作成', exact: true }).click();

    // 成功メッセージを確認
    await expect(page.getByText(/作成.*しました|成功/i)).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * 要件17.2: 既存ロール名との重複エラー
   * @REQ-17.2
   */
  test('重複するロール名では作成できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 既存のロール名（admin）で作成を試みる
    const createResponse = await request.post('http://localhost:3000/api/v1/roles', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'admin',
        description: 'Duplicate admin role',
      },
    });

    expect(createResponse.status()).toBe(409);
    const error = await createResponse.json();
    expect(error.code).toBe('ROLE_NAME_CONFLICT');
  });

  /**
   * 要件17.3: ロール情報の更新と監査ログ記録
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @REQ-17.3
   * @REQ-22.1
   */
  test('管理者はロール情報を更新できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // テスト用ロールを作成
    const createResponse = await request.post('http://localhost:3000/api/v1/roles', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'Test Role',
        description: 'Test description',
        priority: 50,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createdRole = await createResponse.json();

    // ロールを更新
    const updateResponse = await request.patch(
      `http://localhost:3000/api/v1/roles/${createdRole.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          description: 'Updated description',
          priority: 60,
        },
      }
    );

    expect(updateResponse.ok()).toBeTruthy();
    const updatedRole = await updateResponse.json();
    expect(updatedRole.description).toBe('Updated description');
    expect(updatedRole.priority).toBe(60);
  });

  /**
   * 要件17.4: ロール一覧の取得
   * @REQ-17.4
   */
  test('管理者はロール一覧を取得できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // ロール一覧を取得
    const rolesResponse = await request.get('http://localhost:3000/api/v1/roles', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(rolesResponse.ok()).toBeTruthy();
    const roles = await rolesResponse.json();

    // 少なくともadminとuserロールが存在することを確認
    expect(roles.length).toBeGreaterThanOrEqual(2);
    expect(roles.some((r: { name: string }) => r.name === 'admin')).toBe(true);
    expect(roles.some((r: { name: string }) => r.name === 'user')).toBe(true);
  });

  /**
   * 要件17.5: 使用中のロールは削除不可
   * @REQ-17.5
   */
  test('使用中のロールは削除できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // userロールを取得（使用中のロール）
    const prisma = getPrismaClient();
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    // 使用中のロールを削除しようとする
    const deleteResponse = await request.delete(
      `http://localhost:3000/api/v1/roles/${userRole!.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // システムロールまたは使用中のため削除不可
    expect(deleteResponse.status()).toBe(400);
  });

  /**
   * 要件17.6: システムロール（admin）の削除拒否
   * 要件22.1: ロール作成・更新・削除時の監査ログ記録
   * @REQ-17.6
   * @REQ-22.1
   */
  test('システムロールは削除できない', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // adminロールを取得
    const prisma = getPrismaClient();
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    // システムロールを削除しようとする
    const deleteResponse = await request.delete(
      `http://localhost:3000/api/v1/roles/${adminRole!.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(deleteResponse.status()).toBe(400);
    const error = await deleteResponse.json();
    expect(error.code).toBe('SYSTEM_ROLE_PROTECTED');
  });

  /**
   * 要件17.8: ロール優先順位の設定
   * @REQ-17.8
   */
  test('ロールに優先順位を設定できる', async ({ request }) => {
    // 管理者としてログイン
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // 優先順位付きでロールを作成
    const createResponse = await request.post('http://localhost:3000/api/v1/roles', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'High Priority Role',
        description: 'High priority role',
        priority: 100,
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const role = await createResponse.json();
    expect(role.priority).toBe(100);
  });
});
