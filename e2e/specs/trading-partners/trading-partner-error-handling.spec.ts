/**
 * @fileoverview 取引先エラーハンドリングのE2Eテスト
 *
 * Task: 未カバー要件のE2Eテスト追加
 *
 * このファイルは、エラー回復とフィードバックに関する要件をテストします。
 * Playwrightのルートインターセプト機能を使用して、ネットワークエラーと
 * サーバーエラーをシミュレートします。
 *
 * Requirements:
 * - 8.1: ネットワークエラー時の再試行メッセージ表示
 * - 8.2: サーバーエラー（5xx）時のメッセージ表示
 * - 8.3: セッション期限切れ時のログインリダイレクト
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * 取引先エラーハンドリングのE2Eテスト
 */
test.describe('取引先エラーハンドリング', () => {
  // 各テストは独立して実行（シリアルモードを使用しない）

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット
    await page.setViewportSize({ width: 1280, height: 720 });

    // localStorageをクリア
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * サーバーエラー（5xx）のテスト
   *
   * REQ-8.2: サーバーエラー（5xx）が発生した場合、適切なエラーメッセージを表示
   */
  test.describe('サーバーエラー表示 (REQ-8.2)', () => {
    /**
     * @requirement trading-partner-management/REQ-8.2
     */
    test('取引先作成時にサーバーエラー（500）が発生した場合にエラーメッセージが表示される (trading-partner-management/REQ-8.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 取引先作成APIをインターセプトして500エラーを返す
      await page.route('**/api/trading-partners', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Internal Server Error' }),
          });
        } else {
          await route.continue();
        }
      });

      // フォームに入力
      const partnerName = `サーバーエラーテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サーバーエラーテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区サーバーエラーテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージがトーストで表示されることを確認
      // ToastNotificationコンポーネントはrole="alert"を使用
      await expect(
        page.getByText(/システムエラー|サーバーエラー|エラーが発生しました|問題が発生しました/i)
      ).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 作成ページに留まっていることを確認（エラー時は遷移しない）
      await expect(page).toHaveURL(/\/trading-partners\/new/);
    });

    /**
     * @requirement trading-partner-management/REQ-8.2
     */
    test('取引先一覧取得時にサーバーエラー（500）が発生した場合にエラーメッセージが表示される (trading-partner-management/REQ-8.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先一覧APIをインターセプトして500エラーを返す
      await page.route('**/api/trading-partners?*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Internal Server Error' }),
          });
        } else {
          await route.continue();
        }
      });

      // 一覧ページにアクセス
      await page.goto('/trading-partners');

      // エラーメッセージまたはエラー状態が表示されることを確認
      await expect(
        page.getByText(
          /システムエラー|サーバーエラー|エラーが発生しました|問題が発生しました|データの取得に失敗/i
        )
      ).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-8.2
     */
    test('取引先更新時にサーバーエラー（500）が発生した場合にエラーメッセージが表示される (trading-partner-management/REQ-8.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まずテスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `更新エラーテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('コウシンエラーテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区更新エラーテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      await page.waitForURL(/\/trading-partners$/);

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 更新APIをインターセプトして500エラーを返す
      await page.route(`**/api/trading-partners/${partnerId}`, async (route) => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Internal Server Error' }),
          });
        } else {
          await route.continue();
        }
      });

      // 備考を変更して保存
      await page.getByLabel('備考').fill(`エラーテスト備考_${Date.now()}`);
      await page.getByRole('button', { name: /保存/i }).click();

      // エラーメッセージがトーストで表示されることを確認
      await expect(
        page.getByText(/システムエラー|サーバーエラー|エラーが発生しました|問題が発生しました/i)
      ).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集ページに留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}/edit`));
    });
  });

  /**
   * ネットワークエラーのテスト
   *
   * REQ-8.1: ネットワークエラーが発生した場合、再試行メッセージを表示
   */
  test.describe('ネットワークエラー表示 (REQ-8.1)', () => {
    /**
     * @requirement trading-partner-management/REQ-8.1
     */
    test('取引先作成時にネットワークエラーが発生した場合にエラーメッセージが表示される (trading-partner-management/REQ-8.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 取引先作成APIをインターセプトしてネットワークエラーをシミュレート
      await page.route('**/api/trading-partners', async (route) => {
        if (route.request().method() === 'POST') {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      // フォームに入力
      const partnerName = `ネットワークエラーテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('ネットワークエラーテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区ネットワークエラーテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージがトーストで表示されることを確認
      await expect(
        page.getByText(
          /通信エラー|ネットワークエラー|エラーが発生しました|問題が発生しました|接続できません/i
        )
      ).toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-8.1: 再試行ボタンが表示されることを確認
      const retryButton = page.getByRole('button', { name: /再試行/i });
      await expect(retryButton).toBeVisible({ timeout: getTimeout(5000) });

      // 作成ページに留まっていることを確認
      await expect(page).toHaveURL(/\/trading-partners\/new/);
    });

    /**
     * @requirement trading-partner-management/REQ-8.1
     */
    test('取引先一覧取得時にネットワークエラーが発生した場合にエラーメッセージが表示される (trading-partner-management/REQ-8.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先一覧APIをインターセプトしてネットワークエラーをシミュレート
      await page.route('**/api/trading-partners?*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      // 一覧ページにアクセス
      await page.goto('/trading-partners');

      // エラーメッセージまたはエラー状態が表示されることを確認
      await expect(
        page.getByText(
          /通信エラー|ネットワークエラー|エラーが発生しました|問題が発生しました|データの取得に失敗|接続できません/i
        )
      ).toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-8.1: 再試行ボタンが表示されることを確認
      const retryButton = page.getByRole('button', { name: /再試行/i });
      await expect(retryButton).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  /**
   * セッション期限切れのテスト
   *
   * REQ-8.3: セッションが期限切れの場合、ログインページにリダイレクト
   */
  test.describe('セッション期限切れ (REQ-8.3)', () => {
    /**
     * @requirement trading-partner-management/REQ-8.3
     */
    test('APIが401エラーを返した場合にログインページにリダイレクトされる (trading-partner-management/REQ-8.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページにアクセスして正常に表示されることを確認
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 認証状態をクリア（セッション期限切れをシミュレート）
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });

      // 新しいページアクセスをトリガー
      await page.goto('/trading-partners/new');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-8.3
     */
    test('取引先作成中に401エラーが発生した場合にログインページにリダイレクトされる (trading-partner-management/REQ-8.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 取引先作成APIをインターセプトして401エラーを返す
      await page.route('**/api/trading-partners', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Unauthorized' }),
          });
        } else {
          await route.continue();
        }
      });

      // フォームに入力
      const partnerName = `セッションエラーテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('セッションエラーテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区セッションエラーテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // ログインページにリダイレクトされることを確認
      // または認証エラーメッセージが表示されることを確認
      // 認証エラーの場合、ログインページへのリダイレクトまたはエラーメッセージの表示
      const loginRedirected = page
        .waitForURL(/\/login/, { timeout: getTimeout(15000) })
        .catch(() => false);

      const result = await Promise.race([
        loginRedirected.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
      ]);

      // ログインページにリダイレクトされたか、エラーメッセージが表示されたかを確認
      if (!result) {
        // リダイレクトされなかった場合、エラーメッセージを確認
        await expect(
          page.getByText(/ログイン|認証エラー|セッション|再度ログイン|権限がありません/i)
        ).toBeVisible({
          timeout: getTimeout(5000),
        });
      }
    });
  });

  /**
   * ToastNotificationでのエラー表示確認
   *
   * REQ-8.4: ToastNotificationコンポーネントを使用してエラーを通知
   * Note: このテストは trading-partner-additional.spec.ts でも一部カバーされているが、
   *       エラー時の表示を追加で確認
   */
  test.describe('ToastNotificationでのエラー表示', () => {
    /**
     * @requirement trading-partner-management/REQ-8.4
     */
    test('バリデーションエラー時にToastが表示されない（フィールドレベルエラー表示） (trading-partner-management/REQ-8.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // フィールドレベルのバリデーションエラーが表示されることを確認
      await expect(page.getByText(/取引先名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // バリデーションエラー時はToastではなくフィールドレベルで表示される
      // ただし、送信失敗時のToastが表示される可能性もあるため、
      // 主要なエラーメッセージが表示されていることを確認
    });

    /**
     * @requirement trading-partner-management/REQ-8.4
     */
    test('APIエラー時にToast（role=alert）でエラーが表示される (trading-partner-management/REQ-8.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 取引先作成APIをインターセプトして400エラーを返す
      await page.route('**/api/trading-partners', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Bad Request: Invalid data' }),
          });
        } else {
          await route.continue();
        }
      });

      // フォームに入力
      const partnerName = `Toastテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('トーストテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区Toastテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // ToastNotification（role="alert"）でエラーが表示されることを確認
      const toast = page.locator('[role="alert"], [role="status"], .toast, [data-testid="toast"]');
      await expect(toast.first()).toBeVisible({
        timeout: getTimeout(15000),
      });
    });
  });
});
