/**
 * @fileoverview 受領見積書転記ダイアログ表示改善のE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-35.1: 受領見積書選択ドロップダウンに金額だけでなく協力業者の名前も表示する
 * - REQ-35.2: ドロップダウンの表示形式を「業者名 - 金額」とする
 * - REQ-35.3: 転記ダイアログを開いた際、「転記する明細行を選択」のチェックボックスをデフォルトですべてチェック済み状態にする
 *
 * @module e2e/specs/estimate/transfer-quotation-dialog-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 受領見積書転記ダイアログ表示改善のE2Eテスト
 */
test.describe('受領見積書転記ダイアログ表示改善 (REQ-35)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let tradingPartnerName: string = '';
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E転記ダイアログテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

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

    test('準備2：テスト用協力業者を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      tradingPartnerName = `E2E転記業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('テンキダイアログテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('test-transfer-dialog@example.com');

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

    test('準備3：APIトークン取得・数量表・内訳書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: { email: 'user@example.com', password: 'Password123!' },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      const quantityTableResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `転記ダイアログ用数量表_${Date.now()}` },
        }
      );
      expect(quantityTableResponse.status()).toBe(201);
      const quantityTableBody = await quantityTableResponse.json();
      const quantityTableId = quantityTableBody.id;

      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'テストグループ', displayOrder: 0 },
        }
      );
      expect(groupResponse.status()).toBe(201);
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;

      for (let i = 0; i < 2; i++) {
        await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `テスト項目${i + 1}`,
            workType: '工種A',
            specification: '規格A',
            unit: '式',
            quantity: 10.0,
            displayOrder: i,
          },
        });
      }

      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `転記ダイアログ用内訳書_${Date.now()}`, quantityTableId },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;
      expect(createdItemizedStatementId).toBeTruthy();
    });

    test('準備4：見積依頼と受領見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `転記ダイアログ用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();

      const lineItems = JSON.stringify([
        {
          name: '転記明細A',
          sortOrder: 0,
          specification: '規格A',
          unit: '式',
          quantity: 1,
          unitPrice: 200000,
          amount: 200000,
        },
        {
          name: '転記明細B',
          sortOrder: 1,
          specification: '規格B',
          unit: '式',
          quantity: 2,
          unitPrice: 30000,
          amount: 60000,
        },
      ]);

      const receivedQuotationResponse = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `受領見積書_転記ダイアログ_${Date.now()}`,
            submittedAt: new Date().toISOString(),
            lineItems,
          },
        }
      );
      expect(receivedQuotationResponse.status()).toBe(201);
      const receivedQuotationBody = await receivedQuotationResponse.json();
      createdReceivedQuotationId = receivedQuotationBody.id;
      expect(createdReceivedQuotationId).toBeTruthy();
    });

    test('準備5：見積書を作成する（内訳書参照）', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimates/new`);
      await page.waitForLoadState('networkidle');

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書を選択"]');
      await expect(itemizedStatementSelect).toBeVisible({ timeout: getTimeout(15000) });
      await itemizedStatementSelect.selectOption({ value: createdItemizedStatementId! });

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('/estimates') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseBody = await response.json();
      createdEstimateId = responseBody.id;
      expect(createdEstimateId).toBeTruthy();

      await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);
    });
  });

  // ============================================================================
  // REQ-35: 受領見積書転記ダイアログの表示改善
  // ============================================================================

  test.describe('REQ-35: 受領見積書転記ダイアログの表示改善', () => {
    /**
     * @requirement estimate-creation/REQ-35.1: 受領見積書選択ドロップダウンに業者名と金額を表示
     */
    test('受領見積書選択ドロップダウンに協力業者の名前が表示される (estimate-creation/REQ-35.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(tradingPartnerName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 転記ダイアログを開く
      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 受領見積書選択ドロップダウンを取得
      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 全optionテキストを取得
      const optionTexts = await quotationSelect.locator('option').allTextContents();

      // 業者名を含むoptionが少なくとも1つ存在することを確認
      const hasVendorOption = optionTexts.some((text) => text.includes(tradingPartnerName));
      expect(hasVendorOption).toBeTruthy();

      // 金額（円）を含むoptionが存在することを確認
      const hasAmountOption = optionTexts.some((text) => text.includes('円'));
      expect(hasAmountOption).toBeTruthy();

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-35.2: ドロップダウンの表示形式を「業者名 - 金額」とする
     */
    test('ドロップダウンの表示形式が「業者名 - 金額」となっている (estimate-creation/REQ-35.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(tradingPartnerName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 転記ダイアログを開く
      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 業者名を含むoptionを取得（「選択してください」のような空optionは除外）
      const vendorOption = quotationSelect
        .locator('option')
        .filter({ hasText: tradingPartnerName });
      await expect(vendorOption).toHaveCount(1);

      const vendorOptionText = await vendorOption.textContent();
      expect(vendorOptionText).toBeTruthy();

      // 表示形式「業者名 - 金額」に従い、業者名・"-"・金額（円）が含まれることを確認
      expect(vendorOptionText).toContain(tradingPartnerName);
      expect(vendorOptionText).toContain(' - ');
      expect(vendorOptionText).toMatch(/[0-9,]+円/);

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-35.3: 転記する明細行のチェックボックスをデフォルトですべてチェック済み
     */
    test('転記ダイアログを開くと「転記する明細行を選択」のチェックボックスがデフォルトですべてチェック済み (estimate-creation/REQ-35.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 転記ダイアログを開く
      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 受領見積書を選択する
      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 業者名を含むoptionを選択
      const optionValues = await quotationSelect
        .locator('option')
        .evaluateAll(
          (options, vendorName) =>
            options
              .filter(
                (opt): opt is HTMLOptionElement =>
                  opt instanceof HTMLOptionElement &&
                  opt.value !== '' &&
                  opt.textContent !== null &&
                  opt.textContent.includes(vendorName as string)
              )
              .map((opt) => opt.value),
          tradingPartnerName
        );
      expect(optionValues.length).toBeGreaterThan(0);

      await quotationSelect.selectOption({ value: optionValues[0]! });

      // 「転記する明細行を選択」セクションが表示されることを確認
      const lineItemsSection = page.getByText('転記する明細行を選択');
      await expect(lineItemsSection).toBeVisible({ timeout: getTimeout(5000) });

      // 明細行のチェックボックスを取得
      const lineCheckboxes = page.locator('input[data-testid^="line-checkbox-"]');
      const checkboxCount = await lineCheckboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);

      // すべてのチェックボックスがチェック済みであることを確認
      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = lineCheckboxes.nth(i);
        await expect(checkbox).toBeChecked();
      }

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: { email: 'user@example.com', password: 'Password123!' },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      if (createdEstimateId) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateId = null;
      createdEstimateRequestId = null;
      createdReceivedQuotationId = null;
    });
  });
});
