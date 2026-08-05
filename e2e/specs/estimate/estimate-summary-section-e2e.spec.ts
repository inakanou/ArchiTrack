/**
 * @fileoverview サマリーセクション表示項目と順序のE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-39.1: サマリーセクションは指定順序で項目を表示する
 *   （業者金額合計、実行金額合計、値引額、値引率、見積金額合計、利益額、利益率）
 * - REQ-39.2: 業者金額合計として全業者金額行の金額合計を表示する
 * - REQ-39.3: 実行金額合計として全実行金額行の金額合計を表示する
 * - REQ-39.4: 値引額を「実行金額合計 - 業者金額合計」として計算・表示する
 * - REQ-39.5: 値引率を「値引額 ÷ 業者金額合計」として百分率で計算・表示する
 * - REQ-39.6: 見積金額合計として全見積金額行の金額合計を表示する
 * - REQ-39.7: 利益額を「見積金額合計 - 実行金額合計」として計算・表示する
 * - REQ-39.8: 利益率を「利益額 ÷ 見積金額合計」として百分率で計算・表示する
 * - REQ-39.9: REQ-20のサマリーパネル表示を本要件の表示項目・順序で置き換える
 *
 * @module e2e/specs/estimate/estimate-summary-section-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { appendEstimateItem, buildNewEstimateItemNode } from '../../helpers/estimate-draft';

// ============================================================================
// テストデータの金額設定
// ============================================================================
// テストでの想定値:
//   業者金額合計 = 80,000 + 60,000 = 140,000
//   実行金額合計 = 100,000 + 80,000 = 180,000
//   見積金額合計 = 150,000 + 120,000 = 270,000
//   値引額 = 180,000 - 140,000 = 40,000
//   値引率 = 40,000 / 140,000 ≈ 28.57%
//   利益額 = 270,000 - 180,000 = 90,000
//   利益率 = 90,000 / 270,000 ≈ 33.33%

const VENDOR_AMOUNT_1 = 80000;
const VENDOR_AMOUNT_2 = 60000;
const EXECUTION_AMOUNT_1 = 100000;
const EXECUTION_AMOUNT_2 = 80000;
const ESTIMATE_AMOUNT_1 = 150000;
const ESTIMATE_AMOUNT_2 = 120000;

const VENDOR_TOTAL = VENDOR_AMOUNT_1 + VENDOR_AMOUNT_2; // 140000
const EXECUTION_TOTAL = EXECUTION_AMOUNT_1 + EXECUTION_AMOUNT_2; // 180000
const ESTIMATE_TOTAL = ESTIMATE_AMOUNT_1 + ESTIMATE_AMOUNT_2; // 270000
const DISCOUNT_AMOUNT = EXECUTION_TOTAL - VENDOR_TOTAL; // 40000
const PROFIT_AMOUNT = ESTIMATE_TOTAL - EXECUTION_TOTAL; // 90000

/**
 * 見積項目（3行1セット）を金額付きで作成するヘルパー。
 *
 * 各行の金額は単価×数量で算出されるため、quantityを1.00、unitPriceを目標金額とする。
 * 撤去済みの `POST /:id/items` ではなく一括保存（`PUT /:id/save`）で作成する（REQ-42.1、Task 53.13）。
 */
async function createItemWithAmounts(
  request: APIRequestContext,
  accessToken: string,
  estimateId: string,
  displayOrder: number,
  amounts: { estimate: number; execution: number; vendor: number }
): Promise<string> {
  const label = displayOrder + 1;
  const node = buildNewEstimateItemNode({
    name: `見積項目${label}`,
    specification: null,
    unit: '式',
    quantity: 1,
    estimateUnitPrice: amounts.estimate,
    executionUnitPrice: amounts.execution,
    vendorUnitPrice: amounts.vendor,
  });
  // 行タイプごとに名称を分ける（旧 `POST /:id/items` と同じテストデータ）
  for (const line of node.lines) {
    if (line.lineType === 'EXECUTION') line.name = `実行項目${label}`;
    if (line.lineType === 'VENDOR') line.name = `業者項目${label}`;
  }

  return await appendEstimateItem(request, accessToken, estimateId, node, { displayOrder });
}

/**
 * サマリー表示項目（label）から数値（円）を抽出する。
 * "140,000円" → 140000
 */
function parseAmountText(text: string | null): number {
  if (!text) return NaN;
  const m = text.match(/([\d,]+)/);
  if (!m) return NaN;
  return Number(m[1]!.replace(/,/g, ''));
}

/**
 * 百分率テキストから数値を抽出する。"28.57%" → 28.57
 */
function parsePercentText(text: string | null): number {
  if (!text) return NaN;
  const m = text.match(/([-]?[\d.]+)%/);
  if (!m) return NaN;
  return Number(m[1]);
}

/**
 * サマリーセクション表示項目と順序のE2Eテスト
 */
test.describe('サマリーセクション表示項目と順序 (REQ-39)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';
  let createdItemIds: string[] = [];

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

      const projectName = `E2Eサマリーテスト_${Date.now()}`;
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

    test('準備2：APIトークン取得・見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: { email: 'user@example.com', password: 'Password123!' },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      const estimateResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `サマリーテスト用見積書_${Date.now()}` },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      const estimateBody = await estimateResponse.json();
      createdEstimateId = estimateBody.id;
      expect(createdEstimateId).toBeTruthy();
    });

    test('準備3：見積項目を2件、3行1セットの金額付きで作成する', async ({ request }) => {
      expect(createdEstimateId).toBeTruthy();

      const item1Id = await createItemWithAmounts(request, accessToken, createdEstimateId!, 0, {
        estimate: ESTIMATE_AMOUNT_1,
        execution: EXECUTION_AMOUNT_1,
        vendor: VENDOR_AMOUNT_1,
      });
      createdItemIds.push(item1Id);

      const item2Id = await createItemWithAmounts(request, accessToken, createdEstimateId!, 1, {
        estimate: ESTIMATE_AMOUNT_2,
        execution: EXECUTION_AMOUNT_2,
        vendor: VENDOR_AMOUNT_2,
      });
      createdItemIds.push(item2Id);
    });
  });

  // ============================================================================
  // REQ-39: サマリーセクションの表示項目と順序
  // ============================================================================

  test.describe('REQ-39: サマリーセクションの表示項目と順序', () => {
    /**
     * @requirement estimate-creation/REQ-39.1: 表示順序
     * @requirement estimate-creation/REQ-39.9: REQ-20のサマリーパネル表示を置き換える
     */
    test('サマリーセクションが指定順序で表示項目を表示する (estimate-creation/REQ-39.1, REQ-39.9)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // サマリーパネル全体テキストを取得して順序を検証
      const panelText = (await summaryPanel.textContent()) || '';

      const expectedOrder = [
        '業者金額合計',
        '実行金額合計',
        '値引額',
        '値引率',
        '見積金額合計',
        '利益額',
        '利益率',
      ];

      // すべてのラベルが存在し、順序通り出現することを確認（REQ-39.1, REQ-39.9）
      //
      // 以下の `toBeGreaterThanOrEqual(0)` は `count()` に対する恒真判定ではなく、
      // `String.prototype.indexOf` が**見つからなければ -1 を返す**ことを使った
      // 「ラベルが存在する」の主張である（ラベルが1つでも欠ければ失敗する）
      let lastIndex = -1;
      for (const label of expectedOrder) {
        const idx = panelText.indexOf(label);
        expect(idx, `ラベル「${label}」が表示されている`).toBeGreaterThanOrEqual(0);
        expect(
          idx,
          `ラベル「${label}」が「${expectedOrder[expectedOrder.indexOf(label) - 1] ?? '先頭'}」より後に表示されている`
        ).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    });

    /**
     * @requirement estimate-creation/REQ-39.2: 業者金額合計
     */
    test('業者金額合計が全業者金額行の金額合計として表示される (estimate-creation/REQ-39.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      // summary-panel 全体やその内側の grid div も「業者金額合計」を has するため、
      // 最も内側の summaryItem div を取得するために .last() を使う
      const vendorRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('業者金額合計', { exact: true }) })
        .last();
      await expect(vendorRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await vendorRow.textContent();
      expect(parseAmountText(rowText)).toBe(VENDOR_TOTAL);
    });

    /**
     * @requirement estimate-creation/REQ-39.3: 実行金額合計
     */
    test('実行金額合計が全実行金額行の金額合計として表示される (estimate-creation/REQ-39.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const executionRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('実行金額合計', { exact: true }) })
        .last();
      await expect(executionRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await executionRow.textContent();
      expect(parseAmountText(rowText)).toBe(EXECUTION_TOTAL);
    });

    /**
     * @requirement estimate-creation/REQ-39.4: 値引額
     */
    test('値引額が「実行金額合計 - 業者金額合計」として計算・表示される (estimate-creation/REQ-39.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const discountRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('値引額', { exact: true }) })
        .last();
      await expect(discountRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await discountRow.textContent();
      expect(parseAmountText(rowText)).toBe(DISCOUNT_AMOUNT);
    });

    /**
     * @requirement estimate-creation/REQ-39.5: 値引率
     */
    test('値引率が「値引額 ÷ 業者金額合計」として百分率で計算・表示される (estimate-creation/REQ-39.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const discountRateRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('値引率', { exact: true }) })
        .last();
      await expect(discountRateRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await discountRateRow.textContent();
      const expectedRate = (DISCOUNT_AMOUNT / VENDOR_TOTAL) * 100; // ≈28.57
      const actualRate = parsePercentText(rowText);
      // 小数点以下2桁丸め誤差を考慮した一致判定
      expect(actualRate).toBeCloseTo(expectedRate, 1);
    });

    /**
     * @requirement estimate-creation/REQ-39.6: 見積金額合計
     */
    test('見積金額合計が全見積金額行の金額合計として表示される (estimate-creation/REQ-39.6)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const estimateRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('見積金額合計', { exact: true }) })
        .last();
      await expect(estimateRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await estimateRow.textContent();
      expect(parseAmountText(rowText)).toBe(ESTIMATE_TOTAL);
    });

    /**
     * @requirement estimate-creation/REQ-39.7: 利益額
     */
    test('利益額が「見積金額合計 - 実行金額合計」として計算・表示される (estimate-creation/REQ-39.7)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const profitRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('利益額', { exact: true }) })
        .last();
      await expect(profitRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await profitRow.textContent();
      expect(parseAmountText(rowText)).toBe(PROFIT_AMOUNT);
    });

    /**
     * @requirement estimate-creation/REQ-39.8: 利益率
     */
    test('利益率が「利益額 ÷ 見積金額合計」として百分率で計算・表示される (estimate-creation/REQ-39.8)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(15000) });

      const profitRateRow = summaryPanel
        .locator('div')
        .filter({ has: page.getByText('利益率', { exact: true }) })
        .last();
      await expect(profitRateRow).toBeVisible({ timeout: getTimeout(5000) });

      const rowText = await profitRateRow.textContent();
      const expectedRate = (PROFIT_AMOUNT / ESTIMATE_TOTAL) * 100; // ≈33.33
      const actualRate = parsePercentText(rowText);
      expect(actualRate).toBeCloseTo(expectedRate, 1);
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

      createdProjectId = null;
      createdEstimateId = null;
      createdItemIds = [];
    });
  });
});
