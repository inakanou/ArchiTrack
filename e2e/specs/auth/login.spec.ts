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

    // テストデータをクリーンアップして、テストユーザーを作成
    await cleanDatabase();
    await createTestUser('REGULAR_USER');

    // ページに移動
    await page.goto('/login');
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

  test('パスワードリセットページに直接アクセスできる', async ({ page }) => {
    // パスワードリセットページに直接移動
    await page.goto('/password-reset');

    // パスワードリセットページが表示される
    await expect(page).toHaveURL(/\/password-reset/);
  });

  /**
   * 要件7.1: パスワードリセット要求
   * Note: Playwright + React Router Link の互換性問題により、
   * リンククリックではなくpage.goto()を使用してナビゲーションを検証
   */
  test('パスワードリセットリンクが表示され、ページが正常に機能する', async ({ page }) => {
    const link = page.getByRole('link', { name: /パスワードを忘れた/i });

    // リンクが表示されることを確認
    await expect(link).toBeVisible();

    // リンクのhref属性を確認
    const href = await link.getAttribute('href');
    expect(href).toMatch(/password-reset/);

    // page.goto()で直接ナビゲート（Playwright互換性問題の回避）
    await page.goto('/password-reset');

    // パスワードリセットページが正しく表示されることを確認
    await expect(page).toHaveURL(/\/password-reset/);
    await expect(
      page.getByRole('heading', { name: /パスワードリセット|パスワードを忘れた/i })
    ).toBeVisible();
  });

  // Note: 新規登録リンクは招待制のため、ログインページには表示されません
  // 新規登録は招待URLを通じてのみアクセス可能です

  /**
   * 要件4.6: アカウントロック機能
   * WHEN 同一メールアドレスで5回連続してログインに失敗する
   * THEN アカウントが15分間ロックされ、ログインできなくなる
   */
  test('5回連続でログイン失敗後、アカウントがロックされる', async ({ page }) => {
    const email = 'user@example.com';
    const wrongPassword = 'WrongPassword123!';

    // 5回連続でログイン失敗
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/メールアドレス/i).fill(email);
      await page.locator('input#password').fill(wrongPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();

      // エラーメッセージを待つ
      if (i < 4) {
        await expect(
          page.getByText(/メールアドレスまたはパスワードが正しくありません/i)
        ).toBeVisible();
      }

      // ページをリロードして次の試行に備える（フォームをリセット）
      if (i < 4) {
        await page.reload();
      }
    }

    // 5回目の失敗後、アカウントロックメッセージが表示される
    await expect(
      page.getByText(/アカウントがロックされました.*15分後に再試行してください/i)
    ).toBeVisible();

    // ロック後、正しいパスワードでもログインできないことを確認
    await page.reload();
    await page.getByLabel(/メールアドレス/i).fill(email);
    await page.locator('input#password').fill('Password123!'); // 正しいパスワード
    await page.getByRole('button', { name: /ログイン/i }).click();

    // アカウントロックメッセージが再び表示される
    await expect(page.getByText(/アカウントがロックされています/i)).toBeVisible();
  });

  /**
   * 要件11.11: ページロード時の自動フォーカス
   * WHEN ログインページが読み込まれる
   * THEN メールアドレスフィールドに自動的にフォーカスされる
   */
  test('ページロード時にメールアドレスフィールドにオートフォーカスされる', async ({ page }) => {
    await page.goto('/login');

    // メールアドレスフィールドがフォーカスされていることを確認
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();
  });

  /**
   * 要件11.11: Tab キーでフォーカス移動
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    await page.goto('/login');

    // 初期状態：メールアドレスフィールドにフォーカス
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();

    // Tab キーを押してパスワードフィールドに移動
    await page.keyboard.press('Tab');
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeFocused();

    // Tab キーを押してパスワード表示ボタンに移動
    await page.keyboard.press('Tab');
    const passwordToggle = page.getByRole('button', {
      name: /パスワードを表示|パスワードを非表示/i,
    });
    await expect(passwordToggle).toBeFocused();

    // Tab キーを押してログインボタンに移動
    await page.keyboard.press('Tab');
    const loginButton = page.getByRole('button', { name: /ログイン/i });
    await expect(loginButton).toBeFocused();

    // Tab キーを押してパスワードリセットリンクに移動
    await page.keyboard.press('Tab');
    const resetLink = page.getByRole('link', { name: /パスワードを忘れた/i });
    await expect(resetLink).toBeFocused();
  });
});
