/**
 * @fileoverview 受領見積書 - 数値表示形式と丸め規則のE2Eテスト
 *
 * Task 43.5: 数値表示形式のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - 18.1, 18.2: 数量を小数2桁常時表示
 * - 18.3, 18.4: 単価を整数表示（小数第1位で四捨五入）
 * - 18.5, 18.6: 金額を整数表示（数量x単価の結果を小数第1位で四捨五入）
 * - 18.7: 数量フォーカスアウト時のフォーマット
 * - 18.8: 単価フォーカスアウト時のフォーマット
 * - 18.9: 金額自動計算の丸め規則
 *
 * @module e2e/specs/estimate-requests/number-format-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 受領見積書 - 数値表示形式と丸め規則のE2Eテスト
 */
test.describe('受領見積書 - 数値表示形式と丸め規則', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E数値フォーマットテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: テスト用協力業者を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      const tradingPartnerName = `E2E数値テスト業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('イーツーイースウチテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('number-format-test@example.com');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;
      expect(createdTradingPartnerId).toBeTruthy();
    });

    test('準備3: テスト用内訳書と見積依頼を作成する', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成
      await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      const quantityTableName = '数値フォーマットテスト用数量表';
      await page.getByRole('textbox', { name: /数量表名/i }).fill(quantityTableName);

      const createQuantityTablePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createQuantityTablePromise;
      const createResponseBody = await createResponse.json();

      const quantityTableId = createResponseBody.id;
      expect(quantityTableId).toBeTruthy();

      // APIトークンを取得
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;

      // グループを作成
      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'テストグループ',
            displayOrder: 0,
          },
        }
      );
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;

      // 項目を作成
      await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: 'テスト項目1',
          customCategory: '躯体工事',
          workType: '鉄筋工事',
          specification: 'SD295A',
          unit: 'kg',
          quantity: 1.0,
          displayOrder: 0,
        },
      });

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '数値フォーマットテスト用内訳書',
            quantityTableId: quantityTableId,
          },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);

      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;
      expect(createdItemizedStatementId).toBeTruthy();

      // 見積依頼を作成
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '数値フォーマットテスト用見積依頼',
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
            requestMethod: 'EMAIL',
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);

      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();
    });
  });

  // ============================================================================
  // 43.5 数値表示形式のE2Eテスト
  // ============================================================================

  test.describe('43.5 数値表示形式', () => {
    /**
     * @requirement estimate-request/REQ-18.7
     * 数量入力後のフォーカスアウトで小数2桁表示になる
     */
    test('REQ-18.7: 数量入力後のフォーカスアウトで小数2桁表示になる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の数量フィールドに整数値を入力
      const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });
      await quantityInput.fill('5');

      // フォーカスを別のフィールドに移す（blurをトリガー）
      await page.getByRole('textbox', { name: /行1 単価/i }).click();

      // 数量が小数2桁表示になること: '5' -> '5.00'
      await expect(quantityInput).toHaveValue('5.00', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.7
     * 小数を含む数量入力後のフォーカスアウトで小数2桁に正規化される
     */
    test('REQ-18.7: 小数を含む数量入力後のフォーカスアウトで小数2桁に正規化される', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の数量フィールドに小数値を入力
      const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });
      await quantityInput.fill('2.5');

      // フォーカスを別のフィールドに移す
      await page.getByRole('textbox', { name: /行1 単価/i }).click();

      // 数量が小数2桁表示になること: '2.5' -> '2.50'
      await expect(quantityInput).toHaveValue('2.50', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.8
     * 単価入力後のフォーカスアウトで整数表示になる（小数第1位で四捨五入）
     */
    test('REQ-18.8: 単価入力後のフォーカスアウトで整数表示になる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の単価フィールドに小数値を入力
      const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
      await expect(unitPriceInput).toBeVisible({ timeout: getTimeout(5000) });
      await unitPriceInput.fill('1234.6');

      // フォーカスを別のフィールドに移す
      await page.getByRole('textbox', { name: /行1 数量/i }).click();

      // 単価が整数表示になること: '1234.6' -> '1235'（四捨五入）
      await expect(unitPriceInput).toHaveValue('1235', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.8
     * 単価の四捨五入境界値テスト（.4以下は切り捨て）
     */
    test('REQ-18.8: 単価の四捨五入で.4以下は切り捨てられる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の単価フィールドに小数値を入力
      const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
      await expect(unitPriceInput).toBeVisible({ timeout: getTimeout(5000) });
      await unitPriceInput.fill('999.4');

      // フォーカスを別のフィールドに移す
      await page.getByRole('textbox', { name: /行1 数量/i }).click();

      // 単価が切り捨て整数表示になること: '999.4' -> '999'
      await expect(unitPriceInput).toHaveValue('999', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.5, REQ-18.6, REQ-18.9
     * 金額自動計算結果が整数表示であること
     */
    test('REQ-18.9: 金額自動計算結果が整数表示である', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の数量を入力
      const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });
      await quantityInput.fill('2.50');

      // 行1の単価を入力
      const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
      await unitPriceInput.fill('333');

      // フォーカスを別のフィールドに移してblurをトリガー
      await page.getByRole('textbox', { name: /行1 名称/i }).click();

      // 金額表示を確認: 2.50 * 333 = 832.5 -> Math.round -> 833
      // 金額は計算済み表示なので、テキストとして整数が表示される
      // （小数点を含まない整数値で表示されること）
      await expect(page.getByText('833').first()).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  // ============================================================================
  // テストデータのクリーンアップ
  // ============================================================================

  test.describe('テストデータのクリーンアップ', () => {
    test('テストデータを削除する', async ({ request }) => {
      if (!accessToken) {
        const baseUrl = API_BASE_URL;
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: 'user@example.com',
            password: 'Password123!',
          },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      const baseUrl = API_BASE_URL;

      // 見積依頼を削除（受領見積書もカスケード削除される）
      if (createdEstimateRequestId) {
        await request.delete(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // プロジェクトを削除（内訳書もカスケード削除される）
      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // 取引先を削除
      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    });
  });
});
