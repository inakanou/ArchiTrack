import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import {
  waitForSessionDataLoaded,
  waitForLoadingComplete,
  getTimeout,
} from '../../helpers/wait-helpers';

/**
 * セッション管理機能のE2Eテスト
 *
 * @REQ-8 セッション管理
 *
 * CI環境での安定性を向上させるため、以下の対策を実装:
 * - リトライ付きの待機関数を使用
 * - 固定時間待機（waitForTimeout）を廃止
 * - 適切なタイムアウト設定
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

    // セッション管理ページに移動（リトライ付き）
    const maxNavigationRetries = 3;
    for (let navRetry = 0; navRetry < maxNavigationRetries; navRetry++) {
      await page.goto('/sessions');

      // CI環境での安定性向上のため、ページロード完了を待機
      await page.waitForLoadState('networkidle', { timeout: getTimeout(30000) });

      // セッション管理ページが表示されるまで明示的に待機
      try {
        await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
          timeout: getTimeout(15000),
        });
        break;
      } catch {
        if (navRetry < maxNavigationRetries - 1) {
          // リトライ前にページをリロード
          await page.reload({ waitUntil: 'networkidle' });
        }
      }
    }

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

    // セッションデータの読み込み完了を待機（リトライ付き、CI用に増加）
    const sessionDataLoaded = await waitForSessionDataLoaded(page, {
      timeout: getTimeout(30000),
      maxRetries: 7,
    });

    if (!sessionDataLoaded) {
      // フォールバック：最終確認（タイムアウト延長）
      await Promise.race([
        expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(15000) }),
        expect(page.getByText(/全デバイスからログアウト/i)).toBeVisible({
          timeout: getTimeout(15000),
        }),
        expect(page.getByText(/アクティブなセッションがありません/i)).toBeVisible({
          timeout: getTimeout(15000),
        }),
      ]);
    }
  });

  test('セッション一覧が正しく表示される', async ({ page }) => {
    // セッション一覧のヘッダー（タイムアウト追加）
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 現在のデバイスが表示される（APIレスポンス待機のためタイムアウト追加）
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(15000) });

    // デバイス情報が表示される（複数セッションがある場合は.first()を使用）
    await expect(
      page.getByText(/Chrome on Windows|Safari on iOS|Firefox on Linux/).first()
    ).toBeVisible({ timeout: getTimeout(10000) });
  });

  test('個別デバイスログアウトボタンが表示される', async ({ page }) => {
    // セッション情報がAPIから読み込まれるまで待機
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(15000) });

    // ログアウトボタンが表示される（現在のデバイス以外）
    const logoutButtons = page.getByRole('button', { name: /ログアウト/i });
    await expect(logoutButtons.first()).toBeVisible({ timeout: getTimeout(10000) });
  });

  test('個別デバイスログアウトができる', async ({ page }) => {
    // セッション情報がAPIから読み込まれるまで待機（リトライロジック付き）
    let sessionLoaded = false;
    const maxRetries = 5;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        await expect(page.getByText(/現在のデバイス/i)).toBeVisible({
          timeout: getTimeout(15000),
        });
        sessionLoaded = true;
        break;
      } catch {
        if (retry < maxRetries - 1) {
          // ページをリロードして再試行
          await page.reload({ waitUntil: 'networkidle' });
          await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
            timeout: getTimeout(15000),
          });
          // ローディング完了を待機
          await waitForLoadingComplete(page, { timeout: getTimeout(30000) });
        }
      }
    }
    expect(sessionLoaded).toBe(true);

    // 個別デバイスのログアウトボタンが表示されるまで待機
    const logoutButton = page.getByRole('button', { name: /^ログアウト$/i }).first();
    await expect(logoutButton).toBeVisible({ timeout: getTimeout(10000) });

    // 個別デバイスのログアウトボタンをクリック（現在のデバイス以外の最初のセッション）
    await logoutButton.click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/このデバイスをログアウトしますか/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 確認ボタンをクリック（aria-label="はい"のボタン）
    await page.getByRole('button', { name: /^はい$/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/ログアウトしました|デバイスをログアウトしました/i)).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('全デバイスログアウトボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /全デバイスからログアウト/i })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  test('全デバイスログアウトができる', async ({ page }) => {
    // セッション管理ページに再度移動（beforeEachの状態をリフレッシュ）
    await page.goto('/sessions', { waitUntil: 'networkidle' });

    // セッション管理ページが表示されるまで待機
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

    // セッションデータの読み込み完了を待機
    await waitForSessionDataLoaded(page, {
      timeout: getTimeout(30000),
      maxRetries: 7,
    });

    // 全デバイスログアウトボタンが表示されるのをリトライ付きで待機
    const logoutAllButton = page.getByRole('button', { name: /全デバイスからログアウト/i });
    let buttonVisible = false;
    const maxRetries = 7;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        await expect(logoutAllButton).toBeVisible({ timeout: getTimeout(15000) });
        buttonVisible = true;
        break;
      } catch {
        if (retry < maxRetries - 1) {
          // ページをリロードして再試行
          await page.reload({ waitUntil: 'networkidle' });
          await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
            timeout: getTimeout(15000),
          });
          // ローディング完了を待機
          await waitForLoadingComplete(page, { timeout: getTimeout(30000) });
          // セッションデータ再読み込み
          await waitForSessionDataLoaded(page, {
            timeout: getTimeout(30000),
            maxRetries: 3,
          });
        }
      }
    }
    expect(buttonVisible).toBe(true);

    await logoutAllButton.click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/全てのデバイスからログアウトします/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 確認ボタンをクリック（aria-label="はい、全デバイスからログアウト"のボタン）
    await page.getByRole('button', { name: /はい、全デバイスからログアウト/i }).click();

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });
  });

  test('セッション作成日時と有効期限が表示される', async ({ page }) => {
    // 作成日時が表示される
    await expect(page.getByText(/作成日時:/)).toBeVisible({ timeout: getTimeout(10000) });

    // 有効期限が表示される
    await expect(page.getByText(/有効期限:/)).toBeVisible({ timeout: getTimeout(10000) });
  });
});
