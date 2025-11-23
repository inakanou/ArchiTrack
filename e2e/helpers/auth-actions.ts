/**
 * @fileoverview E2Eテスト用の認証アクション
 *
 * テストで使用するログイン、ログアウトなどの認証アクションを提供します。
 * Playwrightベストプラクティスに従い、実際のUIを通じて認証を行います。
 */

import type { Page } from '@playwright/test';
import { TEST_USERS } from './test-users';

/**
 * テストユーザーとしてログインする
 *
 * ログインページに移動し、指定されたユーザー情報でログインします。
 * ログイン後、ダッシュボードへのリダイレクトを待機します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
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
export async function loginAsUser(page: Page, userKey: keyof typeof TEST_USERS): Promise<void> {
  const user = TEST_USERS[userKey];

  // ログインページに移動
  await page.goto('/login');

  // メールアドレスとパスワードを入力
  await page.getByLabel(/メールアドレス/i).fill(user.email);
  await page.locator('input#password').fill(user.password);

  // ログインボタンをクリック
  await page.getByRole('button', { name: /ログイン/i }).click();

  // ログイン成功を待機（ログインページから離れたことを確認）
  // 2FAが有効な場合は2FA画面にリダイレクトされる可能性があるため、
  // そのケースは個別に処理する
  if (!user.twoFactorEnabled) {
    // ログインページから離れることを待機（/dashboard または / へのリダイレクト）
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });

    // リフレッシュトークンがlocalStorageに保存されるまで待機
    await page.waitForFunction(
      () => {
        return localStorage.getItem('refreshToken') !== null;
      },
      { timeout: 10000 }
    );
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
  // ログインページに移動
  await page.goto('/login');

  // メールアドレスとパスワードを入力
  await page.getByLabel(/メールアドレス/i).fill(email);
  await page.locator('input#password').fill(password);

  // ログインボタンをクリック
  await page.getByRole('button', { name: /ログイン/i }).click();

  // リダイレクトを待機（ログインページから離れたことを確認）
  if (waitForRedirect) {
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });

    // リフレッシュトークンがlocalStorageに保存されるまで待機
    await page.waitForFunction(
      () => {
        return localStorage.getItem('refreshToken') !== null;
      },
      { timeout: 10000 }
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
      timeout: 10000,
    }
  );
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
  await page.waitForURL(/\/login/);
}
