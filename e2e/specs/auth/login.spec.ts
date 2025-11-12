import { test, expect } from '@playwright/test';

/**
 * ログイン機能のE2Eテスト
 *
 * 要件13: ログイン画面のUI/UX
 */
test.describe('ログイン機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('ログインフォームが正しく表示される', async ({ page }) => {
    // メールアドレス入力フィールド
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();

    // パスワード入力フィールド
    await expect(page.getByLabel(/パスワード/i)).toBeVisible();

    // ログインボタン
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    // パスワードリセットリンク
    await expect(page.getByRole('link', { name: /パスワードを忘れた/i })).toBeVisible();

    // 新規登録リンク
    await expect(page.getByRole('link', { name: /新規登録/i })).toBeVisible();
  });

  test('有効な認証情報でログインできる', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByLabel(/パスワード/i).fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ダッシュボードにリダイレクトされる
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('無効な認証情報でログインできない', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('invalid@example.com');
    await page.getByLabel(/パスワード/i).fill('wrongpassword');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeVisible();
  });

  test('メールアドレス未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.getByLabel(/パスワード/i).fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/メールアドレスを入力してください/i)).toBeVisible();
  });

  test('パスワード未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/パスワードを入力してください/i)).toBeVisible();
  });

  test('パスワードリセットリンクが正しく機能する', async ({ page }) => {
    await page.getByRole('link', { name: /パスワードを忘れた/i }).click();

    // パスワードリセットページにリダイレクトされる
    await expect(page).toHaveURL(/\/password-reset/);
  });

  test('新規登録リンクが正しく機能する', async ({ page }) => {
    await page.getByRole('link', { name: /新規登録/i }).click();

    // 新規登録ページにリダイレクトされる
    await expect(page).toHaveURL(/\/register/);
  });
});
