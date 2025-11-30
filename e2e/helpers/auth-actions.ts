/**
 * @fileoverview E2Eテスト用の認証アクション
 *
 * テストで使用するログイン、ログアウトなどの認証アクションを提供します。
 * Playwrightベストプラクティスに従い、実際のUIを通じて認証を行います。
 *
 * CI環境での安定性を向上させるため、リトライロジックと適切な待機を実装しています。
 */

import type { Page } from '@playwright/test';
import { TEST_USERS } from './test-users';
import { getTimeout, waitForAuthState } from './wait-helpers';

/**
 * CI環境かどうかを判定
 */
const isCI = !!process.env.CI;

/**
 * テストユーザーとしてログインする
 *
 * ログインページに移動し、指定されたユーザー情報でログインします。
 * ログイン後、ダッシュボードへのリダイレクトを待機します。
 *
 * CI環境での安定性を向上させるため、以下の対策を実装:
 * - リトライロジックの追加
 * - 適切なタイムアウト設定
 * - 認証状態の確実な確認
 *
 * @param page - Playwrightのページオブジェクト
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @param options - オプション
 *
 * @example
 * ```typescript
 * test('プロフィール画面が表示される', async ({ page }) => {
 *   await loginAsUser(page, 'REGULAR_USER');
 *   await page.goto('/profile');
 *   // ...
 * });
 * ```
 */
export async function loginAsUser(
  page: Page,
  userKey: keyof typeof TEST_USERS,
  options?: {
    /** 最大リトライ回数 */
    maxRetries?: number;
  }
): Promise<void> {
  const user = TEST_USERS[userKey];
  const maxRetries = options?.maxRetries ?? (isCI ? 3 : 1);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await performLogin(page, user);

      // 2FAが有効でない場合は認証状態を確認
      if (!user.twoFactorEnabled) {
        const authEstablished = await waitForAuthState(page, {
          maxRetries: isCI ? 3 : 2,
          timeout: getTimeout(10000),
        });

        if (!authEstablished) {
          throw new Error('Authentication state not established');
        }
      }

      // ログイン成功
      return;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        // ログインページに戻って再試行
        await page.goto('/login', { waitUntil: 'networkidle' });
        await clearAuthState(page);
      } else {
        throw error;
      }
    }
  }
}

/**
 * ログイン処理の実行
 *
 * @param page - Playwrightのページオブジェクト
 * @param user - ユーザー情報
 */
async function performLogin(
  page: Page,
  user: (typeof TEST_USERS)[keyof typeof TEST_USERS]
): Promise<void> {
  // ログインページに移動し、ページ読み込み完了を待機
  await page.goto('/login', { waitUntil: 'networkidle' });

  // 前のテストの認証状態をクリア（シリアル実行テスト対応）
  await clearAuthState(page);

  // フォーム要素が操作可能になるまで待機
  const emailInput = page.getByLabel(/メールアドレス/i);
  const passwordInput = page.locator('input#password');
  const loginButton = page.getByRole('button', { name: /ログイン/i });

  const formTimeout = getTimeout(10000);
  await emailInput.waitFor({ state: 'visible', timeout: formTimeout });
  await passwordInput.waitFor({ state: 'visible', timeout: formTimeout });
  await loginButton.waitFor({ state: 'visible', timeout: formTimeout });

  // メールアドレスとパスワードを入力
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // ログインボタンをクリック
  await loginButton.click();

  // ログイン成功を待機（ログインページから離れたことを確認）
  // 2FAが有効な場合は2FA画面にリダイレクトされる可能性があるため、
  // そのケースは個別に処理する
  if (!user.twoFactorEnabled) {
    // ログインページから離れることを待機（/dashboard または / へのリダイレクト）
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: getTimeout(15000),
    });

    // ネットワークアイドルを待機
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // リフレッシュトークンがlocalStorageに保存されるまで待機
    await page.waitForFunction(
      () => {
        return localStorage.getItem('refreshToken') !== null;
      },
      { timeout: getTimeout(10000), polling: 500 }
    );
  }
}

/**
 * 認証状態をクリア
 *
 * @param page - Playwrightのページオブジェクト
 */
async function clearAuthState(page: Page): Promise<void> {
  const hasExistingToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
  if (hasExistingToken) {
    await page.evaluate(() => {
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');
    });
    await page.reload({ waitUntil: 'networkidle' });
  }
}

/**
 * カスタム認証情報でログインする
 *
 * TEST_USERSに定義されていないカスタム認証情報でログインする場合に使用します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param email - メールアドレス
 * @param password - パスワード
 * @param waitForRedirect - ログイン後のリダイレクトを待機するかどうか（デフォルト: true）
 *
 * @example
 * ```typescript
 * test('無効な認証情報でログインエラー', async ({ page }) => {
 *   await loginWithCredentials(page, 'invalid@example.com', 'wrongpass', false);
 *   await expect(page.getByText(/エラー/)).toBeVisible();
 * });
 * ```
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  waitForRedirect = true
): Promise<void> {
  // ログインページに移動し、ページ読み込み完了を待機
  await page.goto('/login', { waitUntil: 'networkidle' });

  // フォーム要素が操作可能になるまで待機
  const emailInput = page.getByLabel(/メールアドレス/i);
  const passwordInput = page.locator('input#password');
  const loginButton = page.getByRole('button', { name: /ログイン/i });

  const formTimeout = getTimeout(10000);
  await emailInput.waitFor({ state: 'visible', timeout: formTimeout });
  await passwordInput.waitFor({ state: 'visible', timeout: formTimeout });
  await loginButton.waitFor({ state: 'visible', timeout: formTimeout });

  // メールアドレスとパスワードを入力
  await emailInput.fill(email);
  await passwordInput.fill(password);

  // ログインボタンをクリック
  await loginButton.click();

  // リダイレクトを待機（ログインページから離れたことを確認）
  if (waitForRedirect) {
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: getTimeout(15000),
    });

    // ネットワークアイドルを待機
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // リフレッシュトークンがlocalStorageに保存されるまで待機
    await page.waitForFunction(
      () => {
        return localStorage.getItem('refreshToken') !== null;
      },
      { timeout: getTimeout(10000), polling: 500 }
    );
  }
}

/**
 * 2要素認証コードを入力する
 *
 * 2FA有効ユーザーでログイン後、2FAコード入力画面でコードを入力します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param code - 6桁のTOTPコード
 *
 * @example
 * ```typescript
 * test('2FAコードでログイン', async ({ page }) => {
 *   await loginAsUser(page, 'TWO_FA_USER');
 *   await submitTwoFactorCode(page, '123456');
 *   // ...
 * });
 * ```
 */
export async function submitTwoFactorCode(page: Page, code: string): Promise<void> {
  // 2FAコード入力フィールドを探す
  await page.getByLabel(/認証コード/i).fill(code);

  // 確認ボタンをクリック
  await page.getByRole('button', { name: /確認/i }).click();

  // ログイン成功を待機（ログインページから離れたことを確認）
  await page.waitForURL(
    (url) => !url.pathname.includes('/login') && !url.pathname.includes('/2fa'),
    {
      timeout: getTimeout(15000),
    }
  );

  // ネットワークアイドルを待機
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
}

/**
 * ログアウトする
 *
 * ログアウトボタンをクリックしてログアウトし、ログインページへのリダイレクトを待機します。
 *
 * @param page - Playwrightのページオブジェクト
 *
 * @example
 * ```typescript
 * test('ログアウト後はログインページに遷移', async ({ page }) => {
 *   await loginAsUser(page, 'REGULAR_USER');
 *   await logout(page);
 *   await expect(page).toHaveURL(/\/login/);
 * });
 * ```
 */
export async function logout(page: Page): Promise<void> {
  // ログアウトボタンをクリック
  await page.getByRole('button', { name: /ログアウト/i }).click();

  // ログインページへのリダイレクトを待機
  await page.waitForURL(/\/login/, { timeout: getTimeout(15000) });

  // ネットワークアイドルを待機
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
}
