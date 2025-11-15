import { test, expect } from '@playwright/test';

/**
 * 2要素認証機能のE2Eテスト
 *
 * 要件6: 2FA（TOTP）セットアップと検証
 */
test.describe('2要素認証機能', () => {
  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // 認証済みユーザーとしてログイン
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // localStorage をクリア（ページにアクセスする前に実行できないため、最初のテストで実行）
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('2FAセットアップページが正しく表示される', async ({ page }) => {
    await page.goto('/profile/2fa-setup');

    // QRコードが表示される
    await expect(page.getByRole('img', { name: /QRコード/i })).toBeVisible();

    // 秘密鍵が表示される
    await expect(page.getByText(/秘密鍵/i)).toBeVisible();

    // TOTP入力フィールドが表示される
    await expect(page.getByLabel(/認証コード/i)).toBeVisible();
  });

  test('TOTPコード検証後にバックアップコードが表示される', async ({ page }) => {
    await page.goto('/profile/2fa-setup');

    // TOTPコードを入力（モック値）
    await page.getByLabel(/認証コード/i).fill('123456');
    await page.getByRole('button', { name: /検証/i }).click();

    // バックアップコードが表示される
    await expect(page.getByText(/バックアップコード/i)).toBeVisible();
    await expect(page.getByText(/ABCD-1234/i)).toBeVisible();
  });

  test('バックアップコードのダウンロードができる', async ({ page }) => {
    await page.goto('/profile/2fa-setup');

    // TOTPコード検証を完了
    await page.getByLabel(/認証コード/i).fill('123456');
    await page.getByRole('button', { name: /検証/i }).click();

    // ダウンロードボタンをクリック
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /ダウンロード/i }).click();
    const download = await downloadPromise;

    // ファイル名を確認
    expect(download.suggestedFilename()).toContain('backup-codes');
  });

  test('2FAが有効な状態でログイン時にTOTP検証が要求される', async ({ page, context }) => {
    // 認証なしでログインページへ
    await context.clearCookies();
    await page.goto('/login');

    // 2FA有効なユーザーでログイン
    await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // TOTP検証画面が表示される
    await expect(page.getByText(/2要素認証/i)).toBeVisible();
    await expect(page.getByLabel(/認証コード/i)).toBeVisible();
  });

  test('バックアップコードでログインできる', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login');

    // 2FA有効なユーザーでログイン
    await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バックアップコードモードに切り替え
    await page.getByRole('link', { name: /バックアップコード/i }).click();

    // バックアップコードを入力
    await page.getByLabel(/バックアップコード/i).fill('ABCD-1234');
    await page.getByRole('button', { name: /検証/i }).click();

    // ログイン成功
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
