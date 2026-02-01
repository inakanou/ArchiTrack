/**
 * @fileoverview 自社情報API・権限・監査ログのE2Eテスト
 *
 * Requirements (アクセス制御):
 * - REQ-6.7: 自社情報の閲覧に「company_info:read」権限を要求
 * - REQ-6.8: 自社情報の保存に「company_info:update」権限を要求
 * - REQ-6.10: 自社情報の保存操作を監査ログに記録
 *
 * Requirements (API設計):
 * - REQ-9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
 * - REQ-9.2: 自社情報が登録されている場合、自社情報オブジェクトを返却
 * - REQ-9.3: 自社情報が未登録の場合、空オブジェクト {} とHTTPステータス200 OKを返却
 * - REQ-9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
 *
 * Note: REQ-6.9, REQ-9.5〜9.10はAPI直接呼び出しテストのため統合テストで検証
 * @see e2e/requirement-exclusions.json
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';

/**
 * テスト用データ
 */
const VALID_COMPANY_INFO = {
  companyName: 'APIテスト株式会社',
  address: '東京都渋谷区APIテスト町1-2-3',
  representative: 'API太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'api@test-company.example.com',
  invoiceRegistrationNumber: 'T1234567890123',
};

test.describe('自社情報API・権限・監査ログ', () => {
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
   * REQ-6: アクセス制御（権限関連）
   */
  test.describe('REQ-6: アクセス制御（権限関連）', () => {
    /**
     * @requirement company-info/REQ-6.7
     */
    test('REQ-6.7: 自社情報の閲覧にcompany_info:read権限を要求する（認証済みユーザーはアクセス可能）', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIリクエストを監視
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/company-info') && response.request().method() === 'GET'
      );

      await page.goto('/company-info');

      const response = await responsePromise;

      // 権限があるユーザーは200または304（キャッシュ）を受け取る
      expect(response.ok() || response.status() === 304).toBe(true);
    });

    /**
     * @requirement company-info/REQ-6.8
     */
    test('REQ-6.8: 自社情報の保存にcompany_info:update権限を要求する（認証済みユーザーは保存可能）', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに入力
      const companyNameField = page.getByLabel(/会社名/);
      const addressField = page.getByLabel(/住所/);
      const representativeField = page.getByLabel(/代表者/);

      await companyNameField.clear();
      await companyNameField.fill('権限テスト株式会社');
      await addressField.clear();
      await addressField.fill('東京都渋谷区1-1-1');
      await representativeField.clear();
      await representativeField.fill('テスト代表者');

      // APIリクエストを監視
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/company-info') && response.request().method() === 'PUT'
      );

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      const response = await responsePromise;

      // 権限があるユーザーは200を受け取る
      expect(response.ok()).toBe(true);
    });

    /**
     * @requirement company-info/REQ-6.10
     */
    test('REQ-6.10: 自社情報の保存操作を監査ログに記録する', async ({ page }) => {
      const prisma = getPrismaClient();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // 保存前の監査ログ数を取得
      const beforeCount = await prisma.auditLog.count({
        where: {
          targetType: 'CompanyInfo',
        },
      });

      // フォームに入力して保存
      const companyNameField = page.getByLabel(/会社名/);
      const addressField = page.getByLabel(/住所/);
      const representativeField = page.getByLabel(/代表者/);

      await companyNameField.clear();
      await companyNameField.fill('監査ログテスト株式会社');
      await addressField.clear();
      await addressField.fill('東京都渋谷区監査ログ町1-1-1');
      await representativeField.clear();
      await representativeField.fill('監査ログ代表者');

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // 保存成功を確認
      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 監査ログが増えていることを確認
      const afterCount = await prisma.auditLog.count({
        where: {
          targetType: 'CompanyInfo',
        },
      });

      expect(afterCount).toBeGreaterThan(beforeCount);
    });
  });

  /**
   * REQ-9: API設計
   */
  test.describe('REQ-9: API設計', () => {
    /**
     * @requirement company-info/REQ-9.1
     */
    test('REQ-9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIリクエストを監視
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/company-info') && response.request().method() === 'GET'
      );

      await page.goto('/company-info');

      const response = await responsePromise;

      // GETリクエストが成功することを確認
      expect(response.ok() || response.status() === 304).toBe(true);
    });

    /**
     * @requirement company-info/REQ-9.2
     */
    test('REQ-9.2: 自社情報が登録されている場合、自社情報オブジェクトを返却する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まず自社情報を登録
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      const companyNameField = page.getByLabel(/会社名/);
      const addressField = page.getByLabel(/住所/);
      const representativeField = page.getByLabel(/代表者/);

      await companyNameField.clear();
      await companyNameField.fill(VALID_COMPANY_INFO.companyName);
      await addressField.clear();
      await addressField.fill(VALID_COMPANY_INFO.address);
      await representativeField.clear();
      await representativeField.fill(VALID_COMPANY_INFO.representative);

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ページをリロードして、APIから取得したデータがフォームに表示されることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/会社名/)).toHaveValue(VALID_COMPANY_INFO.companyName, {
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel(/住所/)).toHaveValue(VALID_COMPANY_INFO.address);
      await expect(page.getByLabel(/代表者/)).toHaveValue(VALID_COMPANY_INFO.representative);
    });

    /**
     * @requirement company-info/REQ-9.3
     */
    test('REQ-9.3: 自社情報が未登録の場合、空オブジェクト {} とHTTPステータス200 OKを返却する', async ({
      page,
    }) => {
      const prisma = getPrismaClient();

      await loginAsUser(page, 'REGULAR_USER');

      // CI並列実行時に他テストがcompany_infoを作成する場合があるため
      // ログイン完了直後（ページ遷移直前）にクリアして競合を最小化
      await prisma.companyInfo.deleteMany();

      // 自社情報ページに遷移してAPIレスポンスを監視
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/company-info') && response.request().method() === 'GET'
      );

      await page.goto('/company-info');

      const response = await responsePromise;

      // ステータスは200または304（キャッシュ）
      expect(response.ok() || response.status() === 304).toBe(true);

      // CI並列実行時に他テストがdeleteMany〜goto間にcompany_infoを再作成した場合の対応
      const currentValue = await page.getByLabel(/会社名/).inputValue();
      if (currentValue !== '') {
        await prisma.companyInfo.deleteMany();
        await page.reload({ waitUntil: 'networkidle' });
      }

      // UIで空フォームが表示されることを確認
      await expect(page.getByLabel(/会社名/)).toHaveValue('', { timeout: getTimeout(10000) });
      await expect(page.getByLabel(/住所/)).toHaveValue('');
      await expect(page.getByLabel(/代表者/)).toHaveValue('');
    });

    /**
     * @requirement company-info/REQ-9.4
     */
    test('REQ-9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに入力して保存（PUT APIを経由）
      const companyNameField = page.getByLabel(/会社名/);
      const addressField = page.getByLabel(/住所/);
      const representativeField = page.getByLabel(/代表者/);

      await companyNameField.clear();
      await companyNameField.fill('PUTテスト株式会社');
      await addressField.clear();
      await addressField.fill('東京都渋谷区PUTテスト町1-1-1');
      await representativeField.clear();
      await representativeField.fill('PUTテスト代表者');

      // PUTリクエストを監視
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/company-info') && response.request().method() === 'PUT'
      );

      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      const response = await responsePromise;

      expect(response.ok()).toBe(true);

      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
