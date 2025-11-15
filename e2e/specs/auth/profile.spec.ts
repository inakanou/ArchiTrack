import { test, expect } from '@playwright/test';

/**
 * プロフィール管理機能のE2Eテスト
 *
 * 要件14: プロフィール画面のUI/UX
 */
test.describe('プロフィール管理機能', () => {
  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // 認証済みユーザーとしてログイン
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.goto('/profile');
    await page.evaluate(() => localStorage.clear());
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
    await page.locator('input#currentPassword').fill('CurrentPassword123!');
    await page.locator('input#newPassword').fill('NewPassword123!@');
    await page.locator('input#confirmPassword').fill('NewPassword123!@');

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

  test('管理者ユーザーには「ユーザー管理」リンクが表示される', async ({ page, context }) => {
    // 管理者ユーザーでログイン
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'admin-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.reload();

    // ユーザー管理リンクが表示される
    await expect(page.getByRole('link', { name: /ユーザー管理/i })).toBeVisible();
  });
});
