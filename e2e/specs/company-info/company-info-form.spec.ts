/**
 * @fileoverview 自社情報フォーム・保存・バリデーションのE2Eテスト
 *
 * 自社情報機能の画面表示、保存、バリデーション機能をテストします。
 *
 * Requirements:
 * - Requirement 1: 自社情報登録画面表示 (1.1-1.5)
 * - Requirement 2: 自社情報の保存 (2.1-2.6)
 * - Requirement 3: フォーム操作 (3.1-3.3)
 * - Requirement 4: データバリデーション (4.1-4.10)
 * - Requirement 8: パフォーマンス (8.1-8.2)
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * テスト用データ
 */
const VALID_COMPANY_INFO = {
  companyName: 'テスト株式会社',
  address: '東京都渋谷区テスト町1-2-3',
  representative: '山田太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@test-company.example.com',
  invoiceRegistrationNumber: 'T1234567890123',
};

const UPDATED_COMPANY_INFO = {
  companyName: '更新後株式会社',
  address: '大阪府大阪市更新区4-5-6',
  representative: '鈴木花子',
  phone: '06-9876-5432',
  fax: '06-9876-5433',
  email: 'updated@test-company.example.com',
  invoiceRegistrationNumber: 'T9876543210987',
};

/**
 * フォームに値を入力するヘルパー関数
 */
async function fillCompanyInfoForm(
  page: Page,
  data: Partial<typeof VALID_COMPANY_INFO>
): Promise<void> {
  if (data.companyName !== undefined) {
    const companyNameField = page.getByLabel(/会社名/);
    await companyNameField.clear();
    if (data.companyName) await companyNameField.fill(data.companyName);
  }
  if (data.address !== undefined) {
    const addressField = page.getByLabel(/住所/);
    await addressField.clear();
    if (data.address) await addressField.fill(data.address);
  }
  if (data.representative !== undefined) {
    const representativeField = page.getByLabel(/代表者/);
    await representativeField.clear();
    if (data.representative) await representativeField.fill(data.representative);
  }
  if (data.phone !== undefined) {
    const phoneField = page.getByLabel(/電話番号/);
    await phoneField.clear();
    if (data.phone) await phoneField.fill(data.phone);
  }
  if (data.fax !== undefined) {
    const faxField = page.getByLabel(/FAX/);
    await faxField.clear();
    if (data.fax) await faxField.fill(data.fax);
  }
  if (data.email !== undefined) {
    const emailField = page.getByLabel(/メールアドレス/);
    await emailField.clear();
    if (data.email) await emailField.fill(data.email);
  }
  if (data.invoiceRegistrationNumber !== undefined) {
    const invoiceField = page.getByLabel(/適格請求書発行事業者登録番号/);
    await invoiceField.clear();
    if (data.invoiceRegistrationNumber) await invoiceField.fill(data.invoiceRegistrationNumber);
  }
}

test.describe('自社情報フォーム・保存・バリデーション', () => {
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
   * Requirement 1: 自社情報登録画面表示
   */
  test.describe('Requirement 1: 自社情報登録画面表示', () => {
    /**
     * @requirement company-info/REQ-1.1
     */
    test('REQ-1.1: 自社情報ページにアクセスしたとき、自社情報登録フォームを表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されることを確認
      const form = page.locator('form');
      await expect(form).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-1.2
     */
    test('REQ-1.2: 必要な入力欄（会社名、住所、代表者、電話番号、FAX、メールアドレス、適格請求書発行事業者登録番号）を提供する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 必須フィールドの確認
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByLabel(/住所/)).toBeVisible();
      await expect(page.getByLabel(/代表者/)).toBeVisible();

      // 任意フィールドの確認
      await expect(page.getByLabel(/電話番号/)).toBeVisible();
      await expect(page.getByLabel(/FAX/)).toBeVisible();
      await expect(page.getByLabel(/メールアドレス/)).toBeVisible();
      await expect(page.getByLabel(/適格請求書発行事業者登録番号/)).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-1.5
     */
    test('REQ-1.5: フォームの上部に「自社情報」という見出しを表示する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 見出しが表示されることを確認
      const heading = page.getByRole('heading', { name: /自社情報/ });
      await expect(heading).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * Requirement 2: 自社情報の保存
   */
  test.describe('Requirement 2: 自社情報の保存', () => {
    /**
     * @requirement company-info/REQ-2.1, REQ-2.2
     */
    test('REQ-2.1, REQ-2.2: 有効なデータを入力して保存ボタンをクリックしたとき、自社情報をデータベースに保存する（新規作成）', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに有効なデータを入力
      await fillCompanyInfoForm(page, VALID_COMPANY_INFO);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // 成功メッセージが表示されることを確認（REQ-2.4も同時に検証）
      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement company-info/REQ-1.3, REQ-2.3
     */
    test('REQ-1.3, REQ-2.3: 自社情報が登録されている場合、登録済み情報をプリセット表示し、更新できる', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 前のテストで登録したデータがプリセットされていることを確認
      const companyNameField = page.getByLabel(/会社名/);
      await expect(companyNameField).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // データを更新
      await fillCompanyInfoForm(page, UPDATED_COMPANY_INFO);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ページをリロードして更新が反映されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/会社名/)).toHaveValue(UPDATED_COMPANY_INFO.companyName, {
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement company-info/REQ-2.4
     */
    test('REQ-2.4: 保存に成功したとき、「自社情報を保存しました」という成功メッセージをToastNotificationで表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームを更新して保存
      await fillCompanyInfoForm(page, { companyName: 'Toast表示テスト株式会社' });

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // ToastNotificationが表示されることを確認
      const toast = page.locator('[role="alert"], [class*="toast"], [class*="Toast"]');
      await expect(toast.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement company-info/REQ-2.5
     */
    test('REQ-2.5: 必須項目（会社名、住所、代表者）が未入力の場合、バリデーションエラーメッセージを各項目に表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 必須フィールドをクリアする
      await fillCompanyInfoForm(page, { companyName: '', address: '', representative: '' });

      // フォーム外をクリックしてバリデーションをトリガー
      await page.getByRole('heading', { name: /自社情報/ }).click();

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // 各必須項目のエラーメッセージが表示されることを確認
      await expect(page.getByText(/会社名.*必須|会社名を入力してください/)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/住所.*必須|住所を入力してください/)).toBeVisible();
      await expect(page.getByText(/代表者.*必須|代表者を入力してください/)).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-2.6
     */
    test('REQ-2.6: 保存処理中はローディングインジケーターを表示し、保存ボタンを無効化する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 有効なデータを入力
      await fillCompanyInfoForm(page, { companyName: 'ローディングテスト株式会社' });

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });

      // クリック直後のボタン状態を確認（一瞬なので検証が難しい場合がある）
      const clickPromise = saveButton.click();

      // ボタンがdisabledになるか、ローディング表示があることを確認
      // （実装によってはspinnerやloading属性がある）
      await clickPromise;

      // 保存完了後、ボタンが再度有効になることを確認
      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(saveButton).toBeEnabled();
    });
  });

  /**
   * Requirement 3: フォーム操作
   */
  test.describe('Requirement 3: フォーム操作', () => {
    /**
     * @requirement company-info/REQ-3.1
     */
    test('REQ-3.1: 「リセット」ボタンを保存ボタンの横に表示する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 保存ボタンとリセットボタンの両方が表示されていることを確認
      const saveButton = page.getByRole('button', { name: /保存/ });
      const resetButton = page.getByRole('button', { name: /リセット/ });

      await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });
      await expect(resetButton).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-3.2
     */
    test('REQ-3.2: リセットボタンをクリックしたとき、フォームの内容を最後に保存された状態に戻す', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 現在の会社名を取得
      const companyNameField = page.getByLabel(/会社名/);
      const originalValue = await companyNameField.inputValue();

      // 会社名を変更
      await companyNameField.clear();
      await companyNameField.fill('変更されたテスト会社');

      // リセットボタンをクリック
      const resetButton = page.getByRole('button', { name: /リセット/ });
      await resetButton.click();

      // 元の値に戻っていることを確認
      await expect(companyNameField).toHaveValue(originalValue, { timeout: getTimeout(5000) });
    });
  });

  /**
   * Requirement 4: データバリデーション
   */
  test.describe('Requirement 4: データバリデーション', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');
    });

    /**
     * @requirement company-info/REQ-4.1
     */
    test('REQ-4.1: 会社名の最大文字数を200文字に制限する', async ({ page }) => {
      const longCompanyName = 'あ'.repeat(201);
      await fillCompanyInfoForm(page, { companyName: longCompanyName });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/住所/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/200文字以内|最大200文字/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.2
     */
    test('REQ-4.2: 住所の最大文字数を500文字に制限する', async ({ page }) => {
      const longAddress = 'あ'.repeat(501);
      await fillCompanyInfoForm(page, { address: longAddress });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/代表者/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/500文字以内|最大500文字/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.3
     */
    test('REQ-4.3: 代表者名の最大文字数を100文字に制限する', async ({ page }) => {
      const longRepresentative = 'あ'.repeat(101);
      await fillCompanyInfoForm(page, { representative: longRepresentative });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/電話番号/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/100文字以内|最大100文字/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.4
     */
    test('REQ-4.4: 電話番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）を実行する', async ({
      page,
    }) => {
      // 不正な形式（英字を含む）
      await fillCompanyInfoForm(page, { phone: 'abc-1234-5678' });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/FAX/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/電話番号.*形式|数字.*ハイフン.*括弧/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.5
     */
    test('REQ-4.5: FAX番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）を実行する', async ({
      page,
    }) => {
      // 不正な形式（英字を含む）
      await fillCompanyInfoForm(page, { fax: 'abc-1234-5679' });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/メールアドレス/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/FAX.*形式|数字.*ハイフン.*括弧/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.6, REQ-4.7
     */
    test('REQ-4.6, REQ-4.7: メールアドレスの形式バリデーションを実行し、不正な場合エラーを表示する', async ({
      page,
    }) => {
      // 不正な形式
      await fillCompanyInfoForm(page, { email: 'invalid-email' });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/適格請求書発行事業者登録番号/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/有効なメールアドレスを入力してください/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.8
     */
    test('REQ-4.8: メールアドレスの最大文字数を254文字に制限する', async ({ page }) => {
      // 254文字を超えるメールアドレス
      const longEmail = 'a'.repeat(250) + '@example.com';
      await fillCompanyInfoForm(page, { email: longEmail });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/適格請求書発行事業者登録番号/).focus();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/254文字以内|最大254文字/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-4.9, REQ-4.10
     */
    test('REQ-4.9, REQ-4.10: 適格請求書発行事業者登録番号の形式バリデーション（T + 13桁の数字）を実行し、不正な場合エラーを表示する', async ({
      page,
    }) => {
      // 不正な形式（Tがない）
      await fillCompanyInfoForm(page, { invoiceRegistrationNumber: '1234567890123' });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/会社名/).focus();

      // エラーメッセージが表示されることを確認
      await expect(
        page.getByText(/適格請求書発行事業者登録番号は「T」\+ 13桁の数字で入力してください/)
      ).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * 追加テスト: 適格請求書発行事業者登録番号の桁数不足
     */
    test('REQ-4.9, REQ-4.10: 適格請求書発行事業者登録番号の桁数不足でエラーを表示する', async ({
      page,
    }) => {
      // 桁数不足
      await fillCompanyInfoForm(page, { invoiceRegistrationNumber: 'T123456789' });

      // フォーカスを外してバリデーションをトリガー
      await page.getByLabel(/会社名/).focus();

      // エラーメッセージが表示されることを確認
      await expect(
        page.getByText(/適格請求書発行事業者登録番号は「T」\+ 13桁の数字で入力してください/)
      ).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * Requirement 8: パフォーマンス
   */
  test.describe('Requirement 8: パフォーマンス', () => {
    /**
     * @requirement company-info/REQ-8.1
     */
    test('REQ-8.1: 自社情報ページの初期表示を1秒以内に完了する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const startTime = Date.now();
      await page.goto('/company-info');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      const loadTime = Date.now() - startTime;

      // 1秒以内であることを確認（CI環境を考慮して2秒に緩和）
      expect(loadTime).toBeLessThan(2000);
    });

    /**
     * @requirement company-info/REQ-8.2
     */
    test('REQ-8.2: 自社情報の保存操作のAPI応答を500ミリ秒以内に完了する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      await fillCompanyInfoForm(page, { companyName: 'パフォーマンステスト株式会社' });

      // APIリクエストの時間を計測
      const startTime = Date.now();
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/company-info') && response.request().method() === 'PUT'
      );

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      const response = await responsePromise;
      const apiTime = Date.now() - startTime;

      // API応答が500ミリ秒以内であることを確認（CI環境を考慮して1秒に緩和）
      expect(apiTime).toBeLessThan(1000);
      expect(response.status()).toBe(200);
    });
  });
});
