import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';

/**
 * セッション管理機能のE2Eテスト
 *
 * @REQ-8 セッション管理
 */
test.describe('セッション管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageとsessionStorageもクリア
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 認証済みユーザーとしてログイン（グローバルセットアップで作成済み）
    await loginAsUser(page, 'REGULAR_USER');

    // セッション管理ページに移動
    await page.goto('/sessions');
  });

  test('セッション一覧が正しく表示される', async ({ page }) => {
    // セッション一覧のヘッダー
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible();

    // 現在のデバイスが表示される
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible();

    // デバイス情報が表示される（複数セッションがある場合は.first()を使用）
    await expect(
      page.getByText(/Chrome on Windows|Safari on iOS|Firefox on Linux/).first()
    ).toBeVisible();
  });

  test('個別デバイスログアウトボタンが表示される', async ({ page }) => {
    // ログアウトボタンが表示される（現在のデバイス以外）
    const logoutButtons = page.getByRole('button', { name: /ログアウト/i });
    await expect(logoutButtons.first()).toBeVisible();
  });

  test('個別デバイスログアウトができる', async ({ page }) => {
    // 個別デバイスのログアウトボタンをクリック（現在のデバイス以外の最初のセッション）
    await page
      .getByRole('button', { name: /^ログアウト$/i })
      .first()
      .click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/このデバイスをログアウトしますか/i)).toBeVisible();

    // 確認ボタンをクリック（aria-label="はい"のボタン）
    await page.getByRole('button', { name: /^はい$/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/ログアウトしました|デバイスをログアウトしました/i)).toBeVisible();
  });

  test('全デバイスログアウトボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /全デバイスからログアウト/i })).toBeVisible();
  });

  test('全デバイスログアウトができる', async ({ page }) => {
    // 全デバイスログアウトボタンをクリック
    await page.getByRole('button', { name: /全デバイスからログアウト/i }).click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/全てのデバイスからログアウトします/i)).toBeVisible();

    // 確認ボタンをクリック（aria-label="はい、全デバイスからログアウト"のボタン）
    await page.getByRole('button', { name: /はい、全デバイスからログアウト/i }).click();

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/);
  });

  test('セッション作成日時と有効期限が表示される', async ({ page }) => {
    // 作成日時が表示される
    await expect(page.getByText(/作成日時:/)).toBeVisible();

    // 有効期限が表示される
    await expect(page.getByText(/有効期限:/)).toBeVisible();
  });
});
