import { test, expect } from '@playwright/test';

/**
 * 新規登録機能のE2Eテスト
 *
 * ユーザー登録フローの検証
 */
test.describe('新規登録機能', () => {
  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア（認証状態の干渉を防ぐ）
    await context.clearCookies();
    await page.goto('/register');
    await page.evaluate(() => localStorage.clear());
  });

  test('登録フォームが正しく表示される', async ({ page }) => {
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/パスワード.*確認/i)).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /登録/i })).toBeVisible();
  });

  test('有効な情報で新規登録できる', async ({ page }) => {
    const timestamp = Date.now();
    await page.getByLabel(/メールアドレス/i).fill(`user${timestamp}@example.com`);
    await page.getByLabel('パスワード', { exact: true }).fill('StrongPass123!');
    await page.getByLabel(/パスワード.*確認/i).fill('StrongPass123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('button', { name: /登録/i }).click();

    // 登録成功後、ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/登録が完了しました/i)).toBeVisible();
  });

  test('パスワード入力時に強度インジケーターが表示される', async ({ page }) => {
    await page.getByLabel('パスワード', { exact: true }).fill('weak');

    // 強度インジケーターが表示される
    await expect(page.getByTestId('password-strength-indicator')).toBeVisible();
  });

  test('パスワードが一致しない場合エラーが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('Password123!');
    await page.getByLabel(/パスワード.*確認/i).fill('DifferentPass123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('button', { name: /登録/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/パスワードが一致しません/i)).toBeVisible();
  });

  test('既に登録済みのメールアドレスではエラーが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('existing@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('Password123!');
    await page.getByLabel(/パスワード.*確認/i).fill('Password123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('button', { name: /登録/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/このメールアドレスは既に登録されています/i)).toBeVisible();
  });
});
