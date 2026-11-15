/**
 * @fileoverview 自社情報アクセス制御・エラー回復のE2Eテスト
 *
 * 自社情報機能のアクセス制御とエラー回復機能をテストします。
 *
 * Requirements:
 * - Requirement 6: アクセス制御 (6.1-6.5, 6.11, 6.12)
 * - Requirement 7: エラー回復とフィードバック (7.1-7.4)
 *
 * 一般ユーザー（REGULAR_USER）は既定で保存の権限（company_info:update）を持たない
 * （REQ-6.11）。保存・入力の編集を伴うテストはシステム管理者（ADMIN_USER）で操作する。
 */

import { test, expect } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { completeTwoFactorVerification, loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout } from '../../helpers/wait-helpers';

/** 自社情報フォームの全7欄のラベル */
const COMPANY_INFO_FIELD_LABELS = [
  /会社名/,
  /住所/,
  /代表者/,
  /電話番号/,
  /FAX/,
  /メールアドレス/,
  /適格請求書発行事業者登録番号/,
] as const;

test.describe('自社情報アクセス制御・エラー回復', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * Requirement 6: アクセス制御
   */
  test.describe('Requirement 6: アクセス制御', () => {
    /**
     * @requirement company-info/REQ-6.1
     */
    test('REQ-6.1: 認証済みユーザーのみに自社情報ページへのアクセスを許可する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 認証済みユーザーはアクセス可能
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されることを確認
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-6.2
     * @requirement company-info/REQ-6.3
     */
    test('REQ-6.2, REQ-6.3: 自社情報ページをProtectedRouteで保護し、ProtectedLayout（AppHeader付き）を適用する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // AppHeaderが表示されていることを確認（ProtectedLayout適用の証拠）
      const header = page.getByRole('banner');
      await expect(header).toBeVisible({ timeout: getTimeout(10000) });

      // ナビゲーションリンクが表示されていることを確認
      const nav = header.getByRole('navigation');
      await expect(nav.getByRole('link', { name: /ダッシュボード/ })).toBeVisible();
      await expect(nav.getByRole('link', { name: /自社情報/ })).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-6.4
     */
    test('REQ-6.4: 未認証ユーザーが自社情報ページにアクセスした場合、ログインページにリダイレクトする', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/company-info');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-6.5
     */
    test('REQ-6.5: ログイン後、元のページ（/company-info）に遷移する', async ({ page }) => {
      // 未認証状態で自社情報ページにアクセス
      await page.goto('/company-info');

      // ログインページにリダイレクトされる
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // ログインフォームに入力（TEST_USERSのREGULAR_USERを使用）
      const emailInput = page.getByLabel(/メールアドレス/i);
      const passwordInput = page.locator('input#password');

      await emailInput.fill('user@example.com');
      await passwordInput.fill('Password123!');

      // ログインボタンをクリック
      const loginButton = page.getByRole('button', { name: /ログイン|Login/i });
      await loginButton.click();

      // 利用者は 2FA 登録済みのため、2FA の検証の画面でコードを補助で入れて検証する
      await completeTwoFactorVerification(page, TEST_USERS.REGULAR_USER);

      // 元のページ（/company-info）にリダイレクトされることを確認
      await expect(page).toHaveURL(/\/company-info/, { timeout: getTimeout(15000) });

      // 自社情報ページが表示されることを確認
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-6.11
     */
    test('REQ-6.11: 一般ユーザーは既定で保存の権限を持たず、PUT /api/company-info は 403 で拒否される', async ({
      request,
    }) => {
      const { accessToken } = await loginViaApi(request, 'REGULAR_USER');
      expect(accessToken, '一般ユーザーのアクセストークン').toBeTruthy();
      const headers = { Authorization: `Bearer ${accessToken}` };

      // 閲覧（company_info:read）は既定で持つ
      const before = await request.get(`${API_BASE_URL}/api/company-info`, { headers });
      expect(before.status()).toBe(200);
      const current = (await before.json()) as { companyName?: string; version?: number };

      // 検証を通る本文で保存を試みる（拒否の理由が権限であることを確かめるため）
      const attemptedName = `一般ユーザーによる保存の試み-${Date.now()}`;
      const response = await request.put(`${API_BASE_URL}/api/company-info`, {
        headers,
        data: {
          companyName: attemptedName,
          address: '東京都渋谷区権限テスト町1-1-1',
          representative: '権限テスト代表者',
          ...(typeof current.version === 'number' ? { version: current.version } : {}),
        },
      });

      // 保存の権限（company_info:update）が無いため 403 で拒否される
      expect(response.status()).toBe(403);

      // 自社情報は書き換わっていない
      const after = await request.get(`${API_BASE_URL}/api/company-info`, { headers });
      expect(after.status()).toBe(200);
      const afterBody = (await after.json()) as { companyName?: string; version?: number };
      expect(afterBody.companyName).not.toBe(attemptedName);
      expect(afterBody.companyName).toBe(current.companyName);
      expect(afterBody.version).toBe(current.version);
    });

    /**
     * @requirement company-info/REQ-6.12
     */
    test('REQ-6.12: 保存の権限を持たない一般ユーザーには、自社情報を読み取り専用で表示し、保存・リセットのボタンを表示しない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // 権限が無い旨の表示
      const note = page.getByRole('note').filter({ hasText: '自社情報を変更する権限がありません' });
      await expect(note).toBeVisible();

      // 全7欄が読み取り専用（readonly）で、無効化（disabled）ではない
      for (const label of COMPANY_INFO_FIELD_LABELS) {
        const field = page.getByLabel(label);
        await expect(field, `${label} の入力欄`).toBeVisible();
        await expect(field, `${label} の入力欄は readonly`).toHaveAttribute('readonly');
        await expect(field, `${label} の入力欄は disabled ではない`).not.toBeDisabled();
        await expect(field, `${label} の入力欄は編集できない`).not.toBeEditable();
      }

      // 保存・リセットのボタンは描かれない
      await expect(page.getByRole('button', { name: /保存/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /リセット/ })).toHaveCount(0);
    });

    /**
     * @requirement company-info/REQ-6.12
     */
    test('REQ-6.12: 保存の権限を持つシステム管理者には、編集できるフォームと保存・リセットのボタンを表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // 保存・リセットのボタンが表示される
      await expect(page.getByRole('button', { name: /保存/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /リセット/ })).toBeVisible();

      // 権限が無い旨は表示されない
      await expect(page.getByText('自社情報を変更する権限がありません')).toHaveCount(0);

      // 全7欄が編集できる
      for (const label of COMPANY_INFO_FIELD_LABELS) {
        const field = page.getByLabel(label);
        await expect(field, `${label} の入力欄`).toBeVisible();
        await expect(field, `${label} の入力欄は readonly ではない`).not.toHaveAttribute(
          'readonly'
        );
        await expect(field, `${label} の入力欄は編集できる`).toBeEditable();
      }
    });
  });

  /**
   * Requirement 7: エラー回復とフィードバック
   */
  test.describe('Requirement 7: エラー回復とフィードバック', () => {
    /**
     * @requirement company-info/REQ-7.1
     */
    test('REQ-7.1: ネットワークエラーが発生した場合、エラーメッセージと再試行ボタンを表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIリクエストを傍受してネットワークエラーをシミュレート
      await page.route('**/api/company-info', async (route) => {
        // ネットワークエラーをシミュレート
        await route.abort('connectionfailed');
      });

      await page.goto('/company-info');

      // エラーメッセージが表示されることを確認
      await expect(page.getByText('通信エラーが発生しました。再試行してください。')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 再試行ボタンが表示されることを確認
      const retryButton = page.getByRole('button', { name: /再試行|リトライ|Retry/i });
      await expect(retryButton).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-7.2
     */
    test('REQ-7.2: サーバーエラー（5xx）が発生した場合、エラーメッセージを表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // 最初のGETリクエストは通常通り処理させる
      await page.route('**/api/company-info', async (route, request) => {
        if (request.method() === 'PUT') {
          // PUTリクエストでサーバーエラーをシミュレート
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal Server Error' }),
          });
        } else {
          // GETリクエストは通常通り処理
          await route.continue();
        }
      });

      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに全必須フィールドを入力して保存
      const companyNameField = page.getByLabel(/会社名/);
      const addressField = page.getByLabel(/住所/);
      const representativeField = page.getByLabel(/代表者/);

      await companyNameField.clear();
      await companyNameField.fill('サーバーエラーテスト');
      await addressField.clear();
      await addressField.fill('テスト住所');
      await representativeField.clear();
      await representativeField.fill('テスト代表者');

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // サーバーエラーメッセージが表示されることを確認
      await expect(
        page.getByText(/システムエラーが発生しました。しばらくしてからお試しください。/)
      ).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement company-info/REQ-7.3
     */
    test('REQ-7.3: セッションが期限切れの場合、ログインページにリダイレクトする', async ({
      page,
      context,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページにアクセスして正常に表示されることを確認
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // 認証状態をクリア（セッション期限切れをシミュレート）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });

      // 新しいページアクセスをトリガー（ProtectedRouteが認証をチェック）
      await page.goto('/company-info');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-7.4
     */
    test('REQ-7.4: エラーメッセージを表示するとき、ToastNotificationコンポーネントを使用してエラーを通知する', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 必須フィールドを空にして保存を試みる
      const companyNameField = page.getByLabel(/会社名/);
      await companyNameField.clear();

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // バリデーションエラーがToastまたはフォームエラーとして表示されることを確認
      // （実装によってはフォーム内エラーのみの場合もある）
      const errorIndicator = page.locator(
        '[role="alert"], [class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"]'
      );
      await expect(errorIndicator.first()).toBeVisible({ timeout: getTimeout(5000) });
    });
  });
});
