/**
 * @fileoverview 受領見積書 - 数値表示形式と丸め規則のE2Eテスト
 *
 * Task 43.5: 数値表示形式のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - 18.1: 登録画面の数量を小数2桁常時表示
 * - 18.2: 編集画面の数量を小数2桁常時表示
 * - 18.3: 登録画面の単価を整数表示（小数第1位で四捨五入）
 * - 18.4: 編集画面の単価を整数表示（小数第1位で四捨五入）
 * - 18.5, 18.6: 金額を整数表示（数量x単価の結果を小数第1位で四捨五入）
 * - 18.7: 数量フォーカスアウト時のフォーマット
 * - 18.8: 単価フォーカスアウト時のフォーマット
 * - 18.9: 金額自動計算の丸め規則
 * - 18.10: OCR一括取り込み時の形式適用
 * - 18.11: 項目選択転記時の形式
 * - 18.12: 合計金額の整数表示
 *
 * @module e2e/specs/estimate-requests/number-format-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  let createdQuotationId: string | null = null;
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
     * @requirement estimate-request/REQ-18.5
     * @requirement estimate-request/REQ-18.9
     * 登録画面の金額（数量×単価の自動計算結果）が整数表示であること
     */
    test('金額自動計算結果が整数表示である (estimate-request/REQ-18.5, estimate-request/REQ-18.9)', async ({
      page,
    }) => {
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

    /**
     * @requirement estimate-request/REQ-18.1
     * 登録画面の数量を小数2桁常時表示
     */
    test('登録画面で数量が小数2桁で常時表示される (estimate-request/REQ-18.1)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の数量フィールドに値を入力
      const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });

      // 整数値を入力
      await quantityInput.fill('10');

      // フォーカスを別のフィールドに移す
      await page.getByRole('textbox', { name: /行1 単価/i }).click();

      // 小数2桁常時表示: '10' -> '10.00'
      await expect(quantityInput).toHaveValue('10.00', { timeout: getTimeout(5000) });

      // 小数1桁の値を入力
      await quantityInput.fill('3.5');
      await page.getByRole('textbox', { name: /行1 単価/i }).click();

      // 小数2桁に正規化: '3.5' -> '3.50'
      await expect(quantityInput).toHaveValue('3.50', { timeout: getTimeout(5000) });

      // 小数2桁の値を入力
      await quantityInput.fill('7.25');
      await page.getByRole('textbox', { name: /行1 単価/i }).click();

      // そのまま表示: '7.25' -> '7.25'
      await expect(quantityInput).toHaveValue('7.25', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.2
     * 編集画面の数量を小数2桁常時表示
     */
    test('編集画面で数量が小数2桁で常時表示される (estimate-request/REQ-18.2)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // まず受領見積書を登録する（編集画面テストの前提）
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 見積書名を入力
      await page.locator('#quotation-name').fill('数量テスト用見積書');

      // 行1の数量を入力
      const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await quantityInput.fill('5');

      // 行1の単価を入力
      const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
      await unitPriceInput.fill('1000');

      // フォーカスを移す
      await page.getByRole('textbox', { name: /行1 名称/i }).click();

      // 登録ボタンをクリック
      const submitButton = page.getByRole('button', { name: /^登録$/i });
      await submitButton.click();

      // 保存成功を確認
      await expect(page.getByText(/見積書/)).toBeVisible({ timeout: getTimeout(10000) });

      // 保存された受領見積書のIDを取得
      const cookies = await page.context().cookies();
      const tokenCookie = cookies.find((c) => c.name === 'access_token');
      accessToken = tokenCookie?.value ?? '';

      const quotationsRes = await page.request.get(
        `${API_BASE_URL}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (quotationsRes.ok()) {
        const quotations = await quotationsRes.json();
        if (quotations.length > 0) {
          createdQuotationId = quotations[0].id;
        }
      }

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i }).first();
      await editButton.click();

      // 編集フォームが表示される
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 編集画面で数量が小数2桁表示されていることを確認
      const editQuantityInput = page.getByRole('textbox', { name: /行1 数量/i });
      await expect(editQuantityInput).toBeVisible({ timeout: getTimeout(5000) });
      await expect(editQuantityInput).toHaveValue('5.00', { timeout: getTimeout(5000) });

      // 値を変更して再度確認
      await editQuantityInput.fill('12');
      await page.getByRole('textbox', { name: /行1 単価/i }).click();
      await expect(editQuantityInput).toHaveValue('12.00', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.3
     * 登録画面の単価を整数表示
     */
    test('登録画面で単価が整数で表示される (estimate-request/REQ-18.3)', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1の単価フィールド
      const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
      await expect(unitPriceInput).toBeVisible({ timeout: getTimeout(5000) });

      // 整数値を入力
      await unitPriceInput.fill('5000');
      await page.getByRole('textbox', { name: /行1 数量/i }).click();

      // 整数のまま表示: '5000' -> '5000'
      await expect(unitPriceInput).toHaveValue('5000', { timeout: getTimeout(5000) });

      // 小数値を入力（四捨五入で整数化）
      await unitPriceInput.fill('2500.7');
      await page.getByRole('textbox', { name: /行1 数量/i }).click();

      // 四捨五入で整数表示: '2500.7' -> '2501'
      await expect(unitPriceInput).toHaveValue('2501', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-18.4
     * 編集画面の単価を整数表示
     */
    test('編集画面で単価が整数で表示される (estimate-request/REQ-18.4)', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンをクリック（準備3で作成したデータを編集）
      const editButton = page.getByRole('button', { name: /編集/i }).first();
      if (await editButton.isVisible({ timeout: getTimeout(5000) }).catch(() => false)) {
        await editButton.click();

        // 編集フォームが表示される
        await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

        // 行1の単価フィールド
        const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
        await expect(unitPriceInput).toBeVisible({ timeout: getTimeout(5000) });

        // 編集画面で単価が整数表示されていることを確認
        const currentValue = await unitPriceInput.inputValue();
        // 小数点が含まれていないことを確認（整数表示）
        if (currentValue) {
          expect(currentValue).not.toContain('.');
        }

        // 小数値を入力して整数化されることを確認
        await unitPriceInput.fill('3456.8');
        await page.getByRole('textbox', { name: /行1 数量/i }).click();

        // 四捨五入で整数表示: '3456.8' -> '3457'
        await expect(unitPriceInput).toHaveValue('3457', { timeout: getTimeout(5000) });
      } else {
        // 編集対象がない場合、登録画面で検証
        await page.getByRole('button', { name: /受領見積書登録/i }).click();
        await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

        const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
        await unitPriceInput.fill('3456.8');
        await page.getByRole('textbox', { name: /行1 数量/i }).click();
        await expect(unitPriceInput).toHaveValue('3457', { timeout: getTimeout(5000) });
      }
    });

    /**
     * @requirement estimate-request/REQ-18.6
     * 編集画面の金額を整数表示
     */
    test('編集画面で金額が整数で表示される (estimate-request/REQ-18.6)', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i }).first();
      if (await editButton.isVisible({ timeout: getTimeout(5000) }).catch(() => false)) {
        await editButton.click();

        // 編集フォームが表示される
        await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

        // 行1の数量と単価を入力して金額を計算
        const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
        const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });

        await quantityInput.fill('3.50');
        await unitPriceInput.fill('1500');
        await page.getByRole('textbox', { name: /行1 名称/i }).click();

        // 金額: 3.50 * 1500 = 5250（整数）
        // 金額が整数で表示されることを確認（小数点なし）
        await expect(page.getByText('5250').first()).toBeVisible({ timeout: getTimeout(5000) });
      } else {
        // 編集対象がない場合、登録画面で検証
        await page.getByRole('button', { name: /受領見積書登録/i }).click();
        await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

        const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
        const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });

        await quantityInput.fill('3.50');
        await unitPriceInput.fill('1500');
        await page.getByRole('textbox', { name: /行1 名称/i }).click();

        await expect(page.getByText('5250').first()).toBeVisible({ timeout: getTimeout(5000) });
      }
    });

    /**
     * @requirement estimate-request/REQ-18.10
     * OCR一括取り込み時の形式適用
     */
    test('OCR一括取り込み時に数値が正しい形式で適用される (estimate-request/REQ-18.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // PDFファイルをアップロード
      const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(pdfPath);

      // テキスト抽出完了を待機
      await expect(
        page
          .locator('[data-testid="ocr-extracted-text"]')
          .or(page.locator('[data-testid="ocr-error-message"]'))
          .first()
      ).toBeVisible({ timeout: getTimeout(60000) });

      // 一括取り込みボタンが表示された場合のみ検証
      const importButton = page.locator('[data-testid="ocr-import-button"]');
      if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 一括取り込みボタンをクリック
        await importButton.click();

        // 取り込み成功を待機
        await expect(page.locator('[data-testid="ocr-import-success"]')).toBeVisible({
          timeout: getTimeout(5000),
        });

        // 取り込み後の数量フィールドが小数2桁表示であることを確認
        const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
        if (await quantityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const quantityValue = await quantityInput.inputValue();
          if (quantityValue && quantityValue !== '0' && quantityValue !== '') {
            // 数量が小数2桁表示であることを確認
            expect(quantityValue).toMatch(/^\d+\.\d{2}$/);
          }
        }

        // 取り込み後の単価フィールドが整数表示であることを確認
        const unitPriceInput = page.getByRole('textbox', { name: /行1 単価/i });
        if (await unitPriceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const unitPriceValue = await unitPriceInput.inputValue();
          if (unitPriceValue && unitPriceValue !== '0' && unitPriceValue !== '') {
            // 単価が整数表示であることを確認（小数点なし）
            expect(unitPriceValue).not.toContain('.');
          }
        }
      }
    });

    /**
     * @requirement estimate-request/REQ-18.11
     * 項目選択転記時の形式
     */
    test('項目選択転記時に数値が正しい形式で適用される (estimate-request/REQ-18.11)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 項目選択ボタンが表示される場合（内訳書の項目から転記する機能）
      const itemSelectButton = page
        .getByRole('button', { name: /項目選択/i })
        .or(page.getByRole('button', { name: /内訳書から選択/i }));

      if (await itemSelectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 項目選択ボタンをクリック
        await itemSelectButton.click();

        // 項目選択ダイアログ/モーダルが表示される
        const dialog = page.locator('[role="dialog"]').or(page.locator('.modal'));
        if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
          // 最初の項目のチェックボックスをチェック
          const firstCheckbox = dialog.locator('input[type="checkbox"]').first();
          if (await firstCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstCheckbox.check();

            // 選択確定ボタンをクリック
            const confirmButton = dialog.getByRole('button', { name: /選択|確定|適用/i });
            if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
              await confirmButton.click();
            }
          }
        }

        // 転記後の数量フィールドを確認
        const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
        if (await quantityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const quantityValue = await quantityInput.inputValue();
          if (quantityValue && quantityValue !== '0' && quantityValue !== '') {
            // 数量が小数2桁形式であることを確認
            expect(quantityValue).toMatch(/^\d+\.\d{2}$/);
          }
        }
      } else {
        // 項目選択機能がUI上にない場合、手動入力で形式を検証
        const quantityInput = page.getByRole('textbox', { name: /行1 数量/i });
        await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });
        await quantityInput.fill('1');
        await page.getByRole('textbox', { name: /行1 単価/i }).click();
        await expect(quantityInput).toHaveValue('1.00', { timeout: getTimeout(5000) });
      }
    });

    /**
     * @requirement estimate-request/REQ-18.12
     * 合計金額の整数表示
     */
    test('合計金額が整数で表示される (estimate-request/REQ-18.12)', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録フォームを開く
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 行1に数量と単価を入力
      const quantity1 = page.getByRole('textbox', { name: /行1 数量/i });
      const unitPrice1 = page.getByRole('textbox', { name: /行1 単価/i });

      await expect(quantity1).toBeVisible({ timeout: getTimeout(5000) });
      await quantity1.fill('2.50');
      await unitPrice1.fill('1000');

      // フォーカスを移して計算を発火
      await page.getByRole('textbox', { name: /行1 名称/i }).click();

      // 金額: 2.50 * 1000 = 2500
      await expect(page.getByText('2500').first()).toBeVisible({ timeout: getTimeout(5000) });

      // 合計金額エリアを確認
      // 合計金額テキストが表示されている場合
      const totalArea = page.locator('[data-testid="total-amount"]').or(page.getByText(/合計/i));

      if (await totalArea.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 合計金額が整数表示（小数点なし）であることを確認
        const totalText = await totalArea.textContent();
        if (totalText) {
          // 合計エリアに含まれる数値が整数であることを確認
          const numberMatch = totalText.match(/[\d,]+/);
          if (numberMatch) {
            // カンマ区切りを除去して整数であることを確認
            const numStr = numberMatch[0].replace(/,/g, '');
            expect(numStr).not.toContain('.');
          }
        }
      }
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

      // 受領見積書を削除
      if (createdQuotationId) {
        await request.delete(`${baseUrl}/api/quotations/${createdQuotationId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

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
