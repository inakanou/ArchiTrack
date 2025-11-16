import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';

/**
 * プロフィール管理機能のE2Eテスト
 *
 * 要件14: プロフィール画面のUI/UX
 */
test.describe('プロフィール管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // テストデータをクリーンアップして、テストユーザーを作成
    await cleanDatabase();
    await createTestUser('REGULAR_USER');

    // 認証済みユーザーとしてログイン
    await loginAsUser(page, 'REGULAR_USER');

    // プロフィールページに移動
    await page.goto('/profile');
  });

  test('プロフィール画面が正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible();
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByText(/ロール/i)).toBeVisible();
  });

  test('表示名を変更できる', async ({ page }) => {
    // 表示名を変更
    const displayNameInput = page.getByLabel(/表示名/i);
    await displayNameInput.clear();
    await displayNameInput.fill('Updated Name');

    // 保存ボタンをクリック
    await page.getByRole('button', { name: /保存/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/更新しました/i)).toBeVisible();
  });

  test('パスワード変更フォームが表示される', async ({ page }) => {
    await expect(page.locator('input#currentPassword')).toBeVisible();
    await expect(page.locator('input#newPassword')).toBeVisible();
    await expect(page.locator('input#confirmPassword')).toBeVisible();
  });

  test('パスワードを変更できる', async ({ page }) => {
    // パスワードフィールドに入力
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('SecureTest123!@#');
    await page.locator('input#confirmPassword').fill('SecureTest123!@#');

    // パスワード変更ボタンをクリック
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/全デバイスからログアウトされます/i)).toBeVisible();

    // 確認ボタンをクリック
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/パスワードを変更しました/i)).toBeVisible();

    // ログインページにリダイレクトされる（2秒後）
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip('管理者ユーザーには「ユーザー管理」リンクが表示される', async ({ page }) => {
    // 管理者ユーザーを作成
    await cleanDatabase();
    await createTestUser('ADMIN_USER');

    // 管理者ユーザーでログインしてプロフィールページに移動
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/profile');

    // プロフィールページが表示されるまで待機
    await expect(page.locator('h1')).toContainText('プロフィール');

    // ユーザー管理リンクが表示される
    await expect(page.getByRole('link', { name: /ユーザー管理/i })).toBeVisible();
  });
});
