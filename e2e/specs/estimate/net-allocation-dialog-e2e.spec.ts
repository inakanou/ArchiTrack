/**
 * @fileoverview NET金額案分ダイアログの自動設定機能E2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-36.1: 対象業者を選択した場合、NET金額欄に受領見積書で入力されたNET金額を自動設定する
 * - REQ-36.2: 自動設定されたNET金額をユーザーが手動で変更可能とする
 *
 * @module e2e/specs/estimate/net-allocation-dialog-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const QUOTATION_NET_AMOUNT = 170000;

/**
 * NET金額案分ダイアログの自動設定機能E2Eテスト
 */
test.describe('NET金額案分ダイアログの自動設定機能 (REQ-36)', () => {
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

      const projectName = `E2ENET案分テスト_${Date.now()}`;
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

      tradingPartnerName = `E2ENET案分業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ネットアンブンテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('test-net-allocation@example.com');

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
          data: { name: `NET案分用数量表_${Date.now()}` },
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
          data: { name: `NET案分用内訳書_${Date.now()}`, quantityTableId },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;
      expect(createdItemizedStatementId).toBeTruthy();
    });

    test('準備4：見積依頼と受領見積書を作成する（NET金額付き）', async ({ request }) => {
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
            name: `NET案分用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();

      // 受領見積書をNET金額付きで作成
      const lineItems = JSON.stringify([
        {
          name: '案分明細A',
          sortOrder: 0,
          specification: '規格A',
          unit: '式',
          quantity: 1,
          unitPrice: 100000,
          amount: 100000,
        },
        {
          name: '案分明細B',
          sortOrder: 1,
          specification: '規格B',
          unit: '式',
          quantity: 2,
          unitPrice: 50000,
          amount: 100000,
        },
      ]);

      const receivedQuotationResponse = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `受領見積書_NET案分_${Date.now()}`,
            submittedAt: new Date().toISOString(),
            lineItems,
            netAmount: String(QUOTATION_NET_AMOUNT),
          },
        }
      );
      expect(receivedQuotationResponse.status()).toBe(201);
      const receivedQuotationBody = await receivedQuotationResponse.json();
      createdReceivedQuotationId = receivedQuotationBody.id;
      expect(createdReceivedQuotationId).toBeTruthy();
    });

    test('準備5：見積書を作成し、受領見積書から業者金額行を転記する', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();
      expect(createdReceivedQuotationId).toBeTruthy();

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

      // 受領見積書の明細行IDを取得
      const baseUrl = API_BASE_URL;
      const quotationDetail = await request.get(
        `${baseUrl}/api/quotations/${createdReceivedQuotationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(quotationDetail.ok()).toBeTruthy();
      const quotationBody = await quotationDetail.json();
      const lineItemIds: string[] = (quotationBody.lineItems || []).map(
        (li: { id: string }) => li.id
      );
      expect(lineItemIds.length).toBeGreaterThan(0);

      // 受領見積書からの転記APIを呼び出し、業者金額行を生成
      const transferResponse = await request.post(
        `${baseUrl}/api/estimates/${createdEstimateId}/transfer-quotation`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            receivedQuotationId: createdReceivedQuotationId,
            lineItemIds,
          },
        }
      );
      expect(transferResponse.ok()).toBeTruthy();
    });
  });

  // ============================================================================
  // REQ-36: NET金額の自動設定
  // ============================================================================

  test.describe('REQ-36: NET金額の自動設定', () => {
    /**
     * @requirement estimate-creation/REQ-36.1: 対象業者選択時にNET金額を自動設定
     */
    test('対象業者を選択するとNET金額欄に受領見積書のNET金額が自動設定される (estimate-creation/REQ-36.1)', async ({
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

      // NET案分ダイアログを開く
      await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 対象業者選択ドロップダウンを取得
      const vendorSelect = page.locator('#vendor-select');
      await expect(vendorSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 業者選択（テスト準備で作成した業者）
      await vendorSelect.selectOption({ value: tradingPartnerName });

      // NET金額入力欄が表示されること
      const netAmountInput = page.locator('#net-amount');
      await expect(netAmountInput).toBeVisible({ timeout: getTimeout(5000) });

      // NET金額が自動設定されている（受領見積書のNET金額）
      await expect(netAmountInput).toHaveValue(String(QUOTATION_NET_AMOUNT), {
        timeout: getTimeout(5000),
      });

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-36.2: 自動設定されたNET金額を手動で変更可能
     */
    test('自動設定されたNET金額をユーザーが手動で変更できる (estimate-creation/REQ-36.2)', async ({
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

      // NET案分ダイアログを開く
      await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 対象業者を選択
      const vendorSelect = page.locator('#vendor-select');
      await expect(vendorSelect).toBeVisible({ timeout: getTimeout(5000) });
      await vendorSelect.selectOption({ value: tradingPartnerName });

      // NET金額の自動設定を確認
      const netAmountInput = page.locator('#net-amount');
      await expect(netAmountInput).toHaveValue(String(QUOTATION_NET_AMOUNT), {
        timeout: getTimeout(5000),
      });

      // 自動設定値をクリアして手動入力
      const overriddenValue = '123456';
      await netAmountInput.fill(overriddenValue);
      await expect(netAmountInput).toHaveValue(overriddenValue);

      // 入力値が反映されていることを確認（disabled/readonlyではない）
      await expect(netAmountInput).toBeEnabled();

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
