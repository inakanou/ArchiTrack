import { test, expect, Page } from '@playwright/test';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { TEST_USERS } from '../../helpers/test-users';
import { getPrismaClient } from '../../fixtures/database';

/**
 * E2Eテスト: 要件16A - 認証状態初期化時のUIチラつき防止
 *
 * このテストスイートは、ページロード時のUIチラつき防止機能をEnd-to-Endで検証します。
 * 業界標準パターン（Auth0、Firebase、NextAuth.js）との整合性を確認します。
 */

/**
 * ヘルパー関数: ログイン画面の存在をチェック
 * 可視性もチェックすることで、一時的なDOM更新を除外
 */
async function isOnLoginPage(page: Page): Promise<boolean> {
  const loginForm = page.locator('form:has(input[type="email"], input[type="password"])');
  const count = await loginForm.count();
  if (count === 0) return false;

  // フォームが存在する場合、実際に表示されているかチェック
  try {
    await loginForm.first().waitFor({ state: 'visible', timeout: 100 });
    return true;
  } catch {
    // タイムアウトした場合、フォームは表示されていない
    return false;
  }
}

/**
 * ヘルパー関数: 保護されたページの存在をチェック
 */
async function isOnProtectedPage(page: Page): Promise<boolean> {
  // ダッシュボードまたは保護されたコンテンツの存在を確認
  const protectedContent = page.locator(
    '[data-testid="dashboard"], [data-testid="protected-content"]'
  );
  return (await protectedContent.count()) > 0;
}

test.describe('E2E: 要件16A - 認証状態初期化時のUIチラつき防止', () => {
  test.beforeEach(async ({ page, context }) => {
    // 各テスト前にテストユーザーデータをクリア（マスターデータは保持）
    const prisma = getPrismaClient();
    await prisma.user.deleteMany({});

    // 各テスト前にCookieとストレージをクリア（Playwright APIを使用）
    await context.clearCookies();
    await context.clearPermissions();

    // ページに一度アクセスしてからストレージをクリア（SecurityError回避）
    await page.goto('http://localhost:5173');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  /**
   * 要件16A.E2E.1: 新規ユーザー（未認証）がアプリにアクセスした場合、
   * UIチラつきなくログイン画面が表示されること
   *
   * WHEN 新規ユーザーがアプリにアクセスする
   * THEN UIチラつきなくログイン画面が表示されなければならない
   */
  test('should display login page without UI flicker for new users', async ({ page }) => {
    // ページナビゲーション中のUIチラつきを検出するためのフラグ
    let protectedPageAppeared = false;

    // ページの変化を監視
    page.on('framenavigated', async () => {
      if (await isOnProtectedPage(page)) {
        protectedPageAppeared = true;
      }
    });

    // 保護されたページにアクセス（未認証ユーザー）
    await page.goto('http://localhost:5173/dashboard');

    // ログイン画面にリダイレクトされるまで待機
    await page.waitForURL('**/login**', { timeout: 5000 });

    // ログイン画面が表示されていることを確認
    expect(await isOnLoginPage(page)).toBe(true);

    // 保護されたページが一瞬も表示されていないことを確認（チラつき防止）
    expect(protectedPageAppeared).toBe(false);
  });

  /**
   * 要件16A.E2E.2: ログイン済みユーザーがページをリロードした場合、
   * ローディングインジケーター表示後、保護されたページが表示されること
   * （ログイン画面のチラつきがないこと）
   *
   * WHEN ログイン済みユーザーがページをリロードする
   * THEN ローディングインジケーター表示後、保護されたページが表示され、
   * ログイン画面のチラつきがないこと
   */
  test('should restore session without login page flicker on page reload', async ({ page }) => {
    // Step 0: 管理者ユーザーを作成
    await createTestUser('ADMIN_USER');

    // Step 1: ログイン処理
    await page.goto('http://localhost:5173/login');

    // ログインフォームに入力
    await page.fill('input[type="email"]', TEST_USERS.ADMIN_USER.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN_USER.password);
    await page.click('button[type="submit"]');

    // ログインページから離れることを待機（/dashboard または / へのリダイレクト）
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // リフレッシュトークンがlocalStorageに保存されていることを確認
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken).toBeTruthy();

    // Step 2: ページをリロード（ローディングインジケーターを確実に表示するため、最小遅延を追加）
    let loginPageAppeared = false;

    // ローディングインジケーターを確実に表示するため、最小遅延を追加
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300)); // 300ms遅延
      await route.continue();
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms遅延
      await route.continue();
    });

    // UIチラつきを監視
    page.on('framenavigated', async () => {
      if (await isOnLoginPage(page)) {
        loginPageAppeared = true;
      }
    });

    await page.reload();

    // ローディングインジケーターが表示されることを確認
    const loadingIndicator = page.locator('[role="status"][aria-label="認証状態を確認中"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 1000 });

    // ローディングインジケーターが消えるまで待機（セッション復元完了）
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });

    // 最終的にダッシュボード（またはルート）が表示されることを確認
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/', {
      timeout: 10000,
    });
    expect(await isOnProtectedPage(page)).toBe(true);

    // ログイン画面のチラつきがないことを確認
    expect(loginPageAppeared).toBe(false);
  });

  /**
   * 要件16A.E2E.3: セッション復元に500ms以上かかる場合でも、
   * ローディングインジケーターが適切に表示されること
   *
   * WHEN セッション復元に時間がかかる
   * THEN ローディングインジケーターが適切に表示されること
   */
  test('should display loading indicator when session restoration takes time', async ({ page }) => {
    // Step 0: 管理者ユーザーを作成
    await createTestUser('ADMIN_USER');

    // Step 1: ログイン処理
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN_USER.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN_USER.password);
    await page.click('button[type="submit"]');
    // ログインページから離れることを待機（/dashboard または / へのリダイレクト）
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // Step 2: ネットワークを遅延させる（500ms以上）
    await page.route('**/api/v1/auth/refresh', async (route) => {
      // 600msの遅延を追加
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      // 300msの遅延を追加
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });

    // Step 3: ページをリロード
    await page.reload();

    // ローディングインジケーターが表示されることを確認
    const loadingIndicator = page.locator('[role="status"][aria-label="認証状態を確認中"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 1000 });

    // ローディングインジケーターが消えるまで待機（セッション復元完了）
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });

    // 最終的にダッシュボード（またはルート）が表示されることを確認
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/', {
      timeout: 10000,
    });
    expect(await isOnProtectedPage(page)).toBe(true);
  });

  /**
   * 要件16A.E2E.4: セッション復元失敗時、認証情報が破棄されログイン画面にリダイレクトされること
   *
   * WHEN セッション復元が失敗する
   * THEN 認証情報が破棄され、ログイン画面にリダイレクトされること
   */
  test('should redirect to login page when session restoration fails', async ({ page }) => {
    // Step 1: localStorageに無効なリフレッシュトークンを設定
    await page.goto('http://localhost:5173');
    await page.evaluate(() => {
      localStorage.setItem('refreshToken', 'invalid-refresh-token');
    });

    // Step 2: 保護されたページにアクセス
    await page.goto('http://localhost:5173/dashboard');

    // セッション復元が失敗し、ログイン画面にリダイレクトされることを確認
    await page.waitForURL('**/login**', { timeout: 10000 });
    expect(await isOnLoginPage(page)).toBe(true);

    // リフレッシュトークンがlocalStorageから削除されていることを確認
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken).toBeNull();
  });

  /**
   * 要件16A.E2E.5: ローディングインジケーターがアクセシビリティ準拠
   * （スクリーンリーダーで読み上げられること）
   *
   * WHEN ローディングインジケーターが表示される
   * THEN アクセシビリティ属性が適切に設定されていること
   */
  test('should have accessible loading indicator with proper ARIA attributes', async ({ page }) => {
    // Step 0: 管理者ユーザーを作成
    await createTestUser('ADMIN_USER');

    // Step 1: ログイン処理
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN_USER.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN_USER.password);
    await page.click('button[type="submit"]');
    // ログインページから離れることを待機（/dashboard または / へのリダイレクト）
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // Step 2: ネットワークを遅延させてローディングインジケーターを表示
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.reload();

    // ローディングインジケーターのアクセシビリティ属性を検証
    const loadingIndicator = page.locator('[role="status"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 2000 });

    // ARIA属性の検証
    await expect(loadingIndicator).toHaveAttribute('role', 'status');
    await expect(loadingIndicator).toHaveAttribute('aria-label', '認証状態を確認中');
    await expect(loadingIndicator).toHaveAttribute('aria-live', 'polite');

    // 説明テキストが表示されていることを確認
    const loadingText = loadingIndicator.locator('text=認証状態を確認中');
    await expect(loadingText).toBeVisible();
  });
});
