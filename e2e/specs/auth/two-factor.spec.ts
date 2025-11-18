import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';

/**
 * 2要素認証機能のE2Eテスト
 *
 * 要件6: 2FA（TOTP）セットアップと検証
 */
test.describe('2要素認証機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // 2FAセットアップ関連のテスト（認証が必要）
  /**
   * Note: バックエンドAPIエンドポイント（/api/v1/auth/2fa/setup, /api/v1/auth/2fa/enable等）が
   *       未実装のため、基本的な表示テスト以外はスキップしています。
   */
  test.describe('2FAセットアップ', () => {
    test.beforeEach(async ({ page, context }) => {
      // テスト間の状態をクリア
      await context.clearCookies();

      // テストデータをクリーンアップして、テストユーザーを作成
      await cleanDatabase();
      await createTestUser('REGULAR_USER');

      // 認証済みユーザーとしてログイン
      await loginAsUser(page, 'REGULAR_USER');
    });

    test('2FAセットアップページが正しく表示される', async ({ page }) => {
      await page.goto('/profile/2fa-setup');

      // ネットワークリクエスト（APIコール）が完了するまで待機
      await page.waitForLoadState('networkidle');

      // QRコードが表示される
      await expect(page.getByRole('img', { name: /QRコード/i })).toBeVisible();

      // 秘密鍵が表示される
      await expect(page.getByText(/秘密鍵/i)).toBeVisible();

      // TOTP入力フィールドが表示される
      await expect(page.getByRole('group', { name: /認証コード/i })).toBeVisible();
    });

    test.skip('TOTPコード検証後にバックアップコードが表示される', async ({ page }) => {
      await page.goto('/profile/2fa-setup');

      // TOTPコードを入力（モック値） - 6桁を個別に入力
      const digits = '123456'.split('');
      for (let i = 0; i < digits.length; i++) {
        await page.getByLabel(`認証コード ${i + 1}桁目`).fill(digits[i]!);
      }
      await page.getByRole('button', { name: /検証/i }).click();

      // バックアップコードが表示される
      await expect(page.getByText(/バックアップコード/i)).toBeVisible();
      await expect(page.getByText(/ABCD-1234/i)).toBeVisible();
    });

    test.skip('バックアップコードのダウンロードができる', async ({ page }) => {
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
  });

  // 2FAログイン関連のテスト（認証不要、ゼロから開始）
  test.describe('2FAログイン', () => {
    test.beforeEach(async ({ context }) => {
      // テスト間の状態をクリア
      await context.clearCookies();

      // テストデータをクリーンアップして、2FA有効ユーザーを作成
      await cleanDatabase();
      await createTestUser('TWO_FA_USER');
    });

    test.skip('2FAが有効な状態でログイン時にTOTP検証が要求される', async ({ page }) => {
      await page.goto('/login');

      // 2FA有効なユーザーでログイン
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // TOTP検証画面が表示される
      await expect(page.getByText(/2要素認証/i)).toBeVisible();
      await expect(page.getByLabel(/認証コード/i)).toBeVisible();
    });

    test.skip('バックアップコードでログインできる', async ({ page }) => {
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
});
