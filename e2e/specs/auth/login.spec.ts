import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';

/**
 * ログイン機能のE2Eテスト
 *
 * 要件13: ログイン画面のUI/UX
 */
test.describe('ログイン機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア（認証状態の干渉を防ぐ）
    await context.clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    // テストデータをクリーンアップして、テストユーザーを作成
    await cleanDatabase();
    await createTestUser('REGULAR_USER');
  });

  test('ログインフォームが正しく表示される', async ({ page }) => {
    // メールアドレス入力フィールド
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();

    // パスワード入力フィールド（パスワード表示ボタンと区別するため、inputに限定）
    await expect(page.locator('input#password')).toBeVisible();

    // ログインボタン
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    // パスワードリセットリンク
    await expect(page.getByRole('link', { name: /パスワードを忘れた/i })).toBeVisible();
  });

  test('有効な認証情報でログインできる', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ホームページ（ダッシュボード）にリダイレクトされる
    await expect(page).toHaveURL('http://localhost:5173/');
  });

  test('無効な認証情報でログインできない', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('invalid@example.com');
    await page.locator('input#password').fill('wrongpassword');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeVisible();
  });

  test('メールアドレス未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/メールアドレスは必須/i)).toBeVisible();
  });

  test('パスワード未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/パスワードは必須/i)).toBeVisible();
  });

  test('パスワードリセットリンクが正しく機能する', async ({ page }) => {
    await page.getByRole('link', { name: /パスワードを忘れた/i }).click();

    // パスワードリセットページにリダイレクトされる
    await expect(page).toHaveURL(/\/password-reset/);
  });

  // Note: 新規登録リンクは招待制のため、ログインページには表示されません
  // 新規登録は招待URLを通じてのみアクセス可能です
});
