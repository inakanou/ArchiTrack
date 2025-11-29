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

    // CI環境での安定性向上のため、ページロード完了を待機
    await page.waitForLoadState('networkidle');

    // セッション管理ページが表示されるまで明示的に待機
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: 15000,
    });

    // セッションデータのローディングが完了するまで待機
    // ローディングテキストが非表示になるまで待機（存在する場合）
    const loadingIndicator = page.getByText(/読み込み中/i);
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {
      // ローディングが既に完了している場合は無視
    });

    // セッションデータまたは空状態メッセージが表示されるまで待機
    await Promise.race([
      page.getByText(/現在のデバイス/i).waitFor({ state: 'visible', timeout: 20000 }),
      page.getByText(/全デバイスからログアウト/i).waitFor({ state: 'visible', timeout: 20000 }),
      page
        .getByText(/アクティブなセッションがありません/i)
        .waitFor({ state: 'visible', timeout: 20000 }),
    ]).catch(() => {
      // いずれかが表示されればOK、失敗は個別テストでキャッチ
    });

    // 追加の安定性のため、短い待機を追加
    await page.waitForTimeout(500);
  });

  test('セッション一覧が正しく表示される', async ({ page }) => {
    // セッション一覧のヘッダー（タイムアウト追加）
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: 15000,
    });

    // 現在のデバイスが表示される（APIレスポンス待機のためタイムアウト追加）
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: 15000 });

    // デバイス情報が表示される（複数セッションがある場合は.first()を使用）
    await expect(
      page.getByText(/Chrome on Windows|Safari on iOS|Firefox on Linux/).first()
    ).toBeVisible();
  });

  test('個別デバイスログアウトボタンが表示される', async ({ page }) => {
    // セッション情報がAPIから読み込まれるまで待機
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: 15000 });

    // ログアウトボタンが表示される（現在のデバイス以外）
    const logoutButtons = page.getByRole('button', { name: /ログアウト/i });
    await expect(logoutButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('個別デバイスログアウトができる', async ({ page }) => {
    // セッション情報がAPIから読み込まれるまで待機
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: 15000 });

    // 個別デバイスのログアウトボタンが表示されるまで待機
    const logoutButton = page.getByRole('button', { name: /^ログアウト$/i }).first();
    await expect(logoutButton).toBeVisible({ timeout: 10000 });

    // 個別デバイスのログアウトボタンをクリック（現在のデバイス以外の最初のセッション）
    await logoutButton.click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/このデバイスをログアウトしますか/i)).toBeVisible({
      timeout: 10000,
    });

    // 確認ボタンをクリック（aria-label="はい"のボタン）
    await page.getByRole('button', { name: /^はい$/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/ログアウトしました|デバイスをログアウトしました/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('全デバイスログアウトボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /全デバイスからログアウト/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('全デバイスログアウトができる', async ({ page }) => {
    // セッション管理ページに再度移動（beforeEachの状態をリフレッシュ）
    await page.goto('/sessions', { waitUntil: 'networkidle' });

    // セッション管理ページが表示されるまで待機
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: 15000,
    });

    // セッションデータのローディングが完了するまで待機
    const loadingIndicator = page.getByText(/読み込み中/i);
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {
      // ローディングが既に完了している場合は無視
    });

    // 全デバイスログアウトボタンが表示されるのをリトライ付きで待機
    const logoutAllButton = page.getByRole('button', { name: /全デバイスからログアウト/i });
    let buttonVisible = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await expect(logoutAllButton).toBeVisible({ timeout: 10000 });
        buttonVisible = true;
        break;
      } catch {
        if (retry < 2) {
          // ページをリロードして再試行
          await page.reload({ waitUntil: 'networkidle' });
          await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
            timeout: 15000,
          });
          // ローディング完了を待機
          await loadingIndicator.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
        }
      }
    }
    expect(buttonVisible).toBe(true);

    await logoutAllButton.click();

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
