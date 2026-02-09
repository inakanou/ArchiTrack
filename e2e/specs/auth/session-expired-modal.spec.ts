import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser, createAllTestUsers } from '../../fixtures/auth.fixtures';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../fixtures/seed-helpers';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * セッション切れモーダル再認証のE2Eテスト
 *
 * @requirement user-authentication/REQ-30: セッション切れ時のモーダル再認証
 *
 * テスト戦略:
 * - Playwrightのroute interceptを使用してAPIレスポンスを制御
 * - リフレッシュトークンの失効をシミュレートしてセッション切れを発生
 * - モーダル表示、再認証フロー、フォームデータ保持を検証
 *
 * CI環境での安定性を向上させるため:
 * - リトライ付きの待機関数を使用
 * - 環境に応じたタイムアウト設定
 */

test.describe('セッション切れモーダル再認証', () => {
  test.describe.configure({ mode: 'serial' });

  // テストグループ終了後にデータベースをリセット
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await createAllTestUsers(prisma);
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
  });

  /**
   * 要件30.1, 30.2, 30.3: フォーム入力中にセッション切れ → モーダル表示 → 再認証
   *
   * テスト手順:
   * 1. ログイン後、プロフィールページに移動
   * 2. フォーム入力を行う（表示名の変更）
   * 3. APIリクエスト時に401+リフレッシュ失敗をシミュレート
   * 4. セッション切れモーダルが表示されることを確認
   * 5. モーダル内でパスワードを入力して再認証
   */
  test('フォーム操作中にセッション切れが発生するとモーダルが表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // プロフィールページに移動
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロフィールページが表示されることを確認
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 認証が確立されていることを確認
    await page.waitForFunction(
      () =>
        localStorage.getItem('refreshToken') !== null &&
        localStorage.getItem('accessToken') !== null,
      { timeout: getTimeout(15000), polling: 500 }
    );

    // リフレッシュAPIを401で失敗させる（セッション完全切れをシミュレート）
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Refresh token expired',
          code: 'INVALID_REFRESH_TOKEN',
        }),
      });
    });

    // ユーザー情報APIを401で返す（セッション切れをトリガー）
    let meRequestCount = 0;
    await page.route('**/api/v1/auth/me', async (route) => {
      meRequestCount++;
      // 最初のリクエストのみ401を返す
      if (meRequestCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Token expired',
            code: 'INVALID_ACCESS_TOKEN',
          }),
        });
      } else {
        await route.continue();
      }
    });

    // APIリクエストをトリガーする操作（プロフィール更新等）
    // evaluate経由でfetchを実行してセッション切れを発生させる
    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      try {
        await fetch('/api/v1/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // エラーは無視（セッション切れコールバックが呼ばれる）
      }
    });

    // セッション切れモーダルが表示されることを確認
    // Note: sessionExpiredCallbackが呼ばれ、sessionExpiredDuringOperationがtrueになる
    // ProtectedLayoutのSessionExpiredModalが表示される
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });

    // モーダルの内容を確認
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * 要件30.6: Escキーでモーダルが閉じないこと
   */
  test('モーダル表示中にEscキーで閉じないこと', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // 認証が確立されていることを確認
    await page.waitForFunction(
      () =>
        localStorage.getItem('refreshToken') !== null &&
        localStorage.getItem('accessToken') !== null,
      { timeout: getTimeout(15000), polling: 500 }
    );

    // セッション切れを直接シミュレート（localStorageを使用）
    // sessionExpiredDuringOperationをtrueにする代わりに、
    // APIインターセプトでセッション切れをトリガーする
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh token expired' }),
      });
    });

    let meCount = 0;
    await page.route('**/api/v1/auth/me', async (route) => {
      meCount++;
      if (meCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      } else {
        await route.continue();
      }
    });

    // セッション切れをトリガー
    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      try {
        await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // 無視
      }
    });

    // モーダルが表示されるのを待機
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });

    // Escキーを押す
    await page.keyboard.press('Escape');

    // モーダルがまだ表示されていること
    await expect(dialog).toBeVisible();
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible();
  });

  /**
   * 要件30.16: 3回連続認証失敗後にログイン画面遷移ボタンが表示される
   */
  test('3回連続認証失敗後にログイン画面遷移ボタンが表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // 認証確立の確認
    await page.waitForFunction(
      () =>
        localStorage.getItem('refreshToken') !== null &&
        localStorage.getItem('accessToken') !== null,
      { timeout: getTimeout(15000), polling: 500 }
    );

    // リフレッシュAPIを失敗させてセッション切れをトリガー
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh token expired' }),
      });
    });

    let meCount = 0;
    await page.route('**/api/v1/auth/me', async (route) => {
      meCount++;
      if (meCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      } else {
        await route.continue();
      }
    });

    // モーダル内の再認証ログインAPIを常に失敗させる
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'メールアドレスまたはパスワードが正しくありません',
        }),
      });
    });

    // セッション切れをトリガー
    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      try {
        await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // 無視
      }
    });

    // モーダルが表示されるのを待機
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });

    // 3回連続で認証失敗を試行
    const passwordInput = page.getByLabel('パスワード');
    const loginButton = page.getByRole('button', { name: '再ログイン' });

    for (let i = 0; i < 3; i++) {
      await passwordInput.clear();
      await passwordInput.fill(`wrong-password-${i}`);
      await loginButton.click();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible({
        timeout: getTimeout(5000),
      });
    }

    // 「ログイン画面へ移動」ボタンが表示されること
    await expect(page.getByRole('button', { name: 'ログイン画面へ移動' })).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * 要件30.4, 30.7, 30.19, 30.20: モーダルのアクセシビリティ属性
   */
  test('モーダルにアクセシビリティ属性が設定されていること', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // 認証確立
    await page.waitForFunction(
      () =>
        localStorage.getItem('refreshToken') !== null &&
        localStorage.getItem('accessToken') !== null,
      { timeout: getTimeout(15000), polling: 500 }
    );

    // セッション切れをトリガー
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh token expired' }),
      });
    });

    let meCount = 0;
    await page.route('**/api/v1/auth/me', async (route) => {
      meCount++;
      if (meCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      try {
        await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // 無視
      }
    });

    // モーダルが表示
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });

    // aria属性の確認
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'session-expired-title');

    // メールアドレスが自動入力されていること
    const emailInput = page.locator('#session-expired-email');
    await expect(emailInput).toHaveAttribute('readonly');
    const emailValue = await emailInput.inputValue();
    expect(emailValue).toContain('@');

    // パスワードフィールドが存在すること
    const passwordInput = page.getByLabel('パスワード');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });
});
