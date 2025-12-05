import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';

/**
 * 管理者としてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'ADMIN_USER');
}

/**
 * 一般ユーザーとしてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsRegularUser(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'REGULAR_USER');
}

/**
 * AppHeader ナビゲーションのE2Eテスト
 *
 * 共通ヘッダーナビゲーション（AppHeader）の機能を検証します。
 *
 * @REQ-28 画面遷移とナビゲーション
 * @REQ-28.21 共通ヘッダーナビゲーション表示
 * @REQ-28.22 ダッシュボード/プロフィール/ログアウトリンク表示
 * @REQ-28.23 ユーザー表示名表示
 * @REQ-28.24 管理者用「管理メニュー」ドロップダウン表示
 * @REQ-28.25 管理メニュー内のリンク表示
 */
test.describe('AppHeader ナビゲーション', () => {
  /**
   * テスト開始前にデータベースをクリーンアップし、テストユーザーを再作成
   * 前のテスト（例: profile.spec.tsのパスワード変更テスト）による
   * パスワード変更の影響を防止
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await createAllTestUsers(prisma);
  });

  /**
   * @REQ-28.21 共通ヘッダーナビゲーション表示
   * WHEN 認証済みユーザーが保護された画面にアクセスする
   * THEN Frontend UIは共通ヘッダーナビゲーションを表示する
   */
  test('認証済みユーザーにはヘッダーナビゲーションが表示される', async ({ page }) => {
    await loginAsRegularUser(page);

    // ダッシュボードに移動
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ヘッダーが表示されていることを確認
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();

    // ナビゲーションが表示されていることを確認
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
  });

  /**
   * @REQ-28.22 ダッシュボード/プロフィール/ログアウトリンク表示
   * WHEN 共通ヘッダーナビゲーションが表示される
   * THEN Frontend UIはダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
   */
  test('ヘッダーにダッシュボード/プロフィール/ログアウトリンクが表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ダッシュボードリンクが表示されていることを確認
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();

    // ユーザーメニューを開く
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();

    // プロフィールリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-profile')).toBeVisible();

    // ログアウトリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
  });

  /**
   * @REQ-28.23 ユーザー表示名表示
   * WHEN 共通ヘッダーナビゲーションが表示される
   * THEN Frontend UIはログイン中のユーザー表示名を表示する
   */
  test('ヘッダーにユーザー表示名が表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューボタンにユーザー名が表示されていることを確認
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await expect(userMenuButton).toBeVisible();
    // ボタンにユーザー名が含まれていることを確認（空でないこと）
    await expect(userMenuButton).not.toHaveText('');
  });

  /**
   * @REQ-28.24 管理者用「管理メニュー」ドロップダウン表示
   * WHEN 管理者ユーザーがナビゲーションを表示する
   * THEN Frontend UIは「管理メニュー」ドロップダウンを追加表示する
   */
  test('管理者には管理メニューが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていることを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).toBeVisible();
  });

  /**
   * @REQ-28.24 一般ユーザーには管理メニューが表示されない
   */
  test('一般ユーザーには管理メニューが表示されない', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていないことを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).not.toBeVisible();
  });

  /**
   * @REQ-28.25 管理メニュー内のリンク表示
   * WHEN 管理メニューが展開される
   * THEN Frontend UIはユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンクを表示する
   */
  test('管理メニューにはユーザー管理/招待管理/ロール管理/権限管理/監査ログリンクが表示される', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開く
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await adminMenuButton.click();

    // 各リンクが表示されていることを確認
    await expect(page.getByTestId('admin-menu-users')).toBeVisible();
    await expect(page.getByTestId('admin-menu-invitations')).toBeVisible();
    await expect(page.getByTestId('admin-menu-roles')).toBeVisible();
    await expect(page.getByTestId('admin-menu-permissions')).toBeVisible();
    await expect(page.getByTestId('admin-menu-audit-logs')).toBeVisible();
  });

  /**
   * @REQ-28.36 招待管理リンククリック → 招待管理画面遷移
   */
  test('管理メニューから招待管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて招待管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-invitations').click();

    // 招待管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/invitations/);
  });

  /**
   * @REQ-28.37 ユーザー管理リンククリック → ユーザー管理画面遷移
   */
  test('管理メニューからユーザー管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてユーザー管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-users').click();

    // ユーザー管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  /**
   * @REQ-28.38 ロール管理リンククリック → ロール管理画面遷移
   */
  test('管理メニューからロール管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてロール管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-roles').click();

    // ロール管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/roles/);
  });

  /**
   * @REQ-28.39 権限管理リンククリック → 権限管理画面遷移
   */
  test('管理メニューから権限管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて権限管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-permissions').click();

    // 権限管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/permissions/);
  });

  /**
   * @REQ-28.40 監査ログリンククリック → 監査ログ画面遷移
   */
  test('管理メニューから監査ログ画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて監査ログをクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-audit-logs').click();

    // 監査ログ画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
  });

  /**
   * @REQ-28.41 ログアウトボタンクリック → ログアウト処理、ログイン画面遷移
   */
  test('ユーザーメニューからログアウトできる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてログアウトをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-logout').click();

    // ログイン画面に遷移することを確認
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * @REQ-28.27 プロフィールリンククリック → プロフィール画面遷移
   */
  test('ユーザーメニューからプロフィール画面に遷移できる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてプロフィールをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-profile').click();

    // プロフィール画面に遷移することを確認
    await expect(page).toHaveURL(/\/profile/);
  });

  /**
   * @REQ-28.26 ダッシュボード画面にクイックアクセスリンク表示
   */
  test('ダッシュボード画面にクイックアクセスリンクが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // クイックアクセスリンクが表示されていることを確認
    await expect(page.getByTestId('quick-link-profile')).toBeVisible();
    await expect(page.getByTestId('quick-link-sessions')).toBeVisible();
    await expect(page.getByTestId('quick-link-2fa')).toBeVisible();

    // 管理者には管理機能リンクも表示される
    await expect(page.getByTestId('quick-link-admin-users')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-invitations')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-audit')).toBeVisible();
  });
});
