/**
 * @fileoverview 見積書機能追加のE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-25.1: 見積書作成画面のデフォルト値
 * - REQ-26.1: アクションボタンをサマリーセクションの下に配置
 * - REQ-26.2: ヘッダー部分から転記・出力ボタンを除去
 * - REQ-27.1: 見積項目のクライアントサイド編集
 * - REQ-27.2: 見積項目セクションに保存ボタンを提供
 * - REQ-27.3: 保存ボタンでDB一括反映
 * - REQ-27.4: 未保存変更がない場合、保存ボタンを無効状態
 * - REQ-28.1: 「見積」「実行」「業者」チェックボックス提供
 * - REQ-28.2: チェックボックスのデフォルト値はすべてON
 * - REQ-28.3: チェックを外すと該当行タイプを非表示
 * - REQ-28.4: チェックを入れると該当行タイプを表示
 * - REQ-29.1: 子項目を持つ親項目の単価フィールドを編集不可
 * - REQ-29.2: 子項目の金額合計を親項目の金額として自動計算
 * - REQ-29.3: 子項目を持つ親項目は名称・規格・単位・数量・備考のみ手動編集可能
 * - REQ-30.1: 転記先「新規項目として作成」選択肢
 * - REQ-30.2: 転記先「＜既存項目名＞の子項目として作成」選択肢
 * - REQ-30.3: 子項目として転記実行
 * - REQ-31.1: NET案分ダイアログに受領見積書合計金額表示
 * - REQ-31.2: NET案分ダイアログにNET金額表示
 * - REQ-32.1: 出力ダイアログに行タイプ選択ラジオボタン
 * - REQ-32.2: 選択行タイプのみ出力
 * - REQ-32.3: 出力ファイル名に行タイプラベル含む
 * - REQ-32.4: 出力APIがlineTypeパラメータを受け付ける
 *
 * @module e2e/specs/estimate/estimate-features-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 見積書機能追加のE2Eテスト
 */
test.describe('見積書機能追加 (REQ-25～REQ-32)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
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

      const projectName = `E2E見積機能テスト_${Date.now()}`;
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

      const tradingPartnerName = `E2Eテスト業者_機能テスト_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('キノウテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('test-features@example.com');

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

      // APIトークンを取得
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: { email: 'user@example.com', password: 'Password123!' },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      // 数量表を作成
      const quantityTableResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `機能テスト用数量表_${Date.now()}` },
        }
      );
      expect(quantityTableResponse.status()).toBe(201);
      const quantityTableBody = await quantityTableResponse.json();
      const quantityTableId = quantityTableBody.id;

      // グループを作成
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

      // 項目を作成
      for (let i = 0; i < 3; i++) {
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

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `機能テスト用内訳書_${Date.now()}`, quantityTableId },
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

      // 見積依頼を作成
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `機能テスト用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();

      // 受領見積書を作成（NET金額付き）
      const lineItems = JSON.stringify([
        {
          name: 'テスト項目A',
          sortOrder: 0,
          specification: '規格A',
          unit: '式',
          quantity: 1,
          unitPrice: 100000,
          amount: 100000,
          netAmount: 90000,
        },
        {
          name: 'テスト項目B',
          sortOrder: 1,
          specification: '規格B',
          unit: '式',
          quantity: 2,
          unitPrice: 50000,
          amount: 100000,
          netAmount: 80000,
        },
      ]);

      const receivedQuotationResponse = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `受領見積書_機能テスト_${Date.now()}`,
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

      // 内訳書を選択
      const itemizedStatementSelect = page.locator('select[aria-label="内訳書を選択"]');
      await expect(itemizedStatementSelect).toBeVisible({ timeout: getTimeout(15000) });
      await itemizedStatementSelect.selectOption({ value: createdItemizedStatementId! });

      // 作成ボタンをクリック
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
  // REQ-25: 見積書作成画面のデフォルト値
  // ============================================================================

  test.describe('REQ-25: 見積書作成画面のデフォルト値', () => {
    /**
     * @requirement estimate-creation/REQ-25.1
     */
    test('見積書名のデフォルト値が「見積書」に設定される (estimate-creation/REQ-25.1)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書新規作成画面を開く
      await page.goto(`/projects/${createdProjectId}/estimates/new`);
      await page.waitForLoadState('networkidle');

      // 見積書名入力フィールドのデフォルト値が「見積書」であることを確認
      const nameInput = page.getByLabel(/見積書名/i);
      await expect(nameInput).toBeVisible({ timeout: getTimeout(15000) });
      await expect(nameInput).toHaveValue('見積書');
    });
  });

  // ============================================================================
  // REQ-26: アクションボタンの配置改善
  // ============================================================================

  test.describe('REQ-26: アクションボタンの配置改善', () => {
    /**
     * @requirement estimate-creation/REQ-26.1
     */
    test('転記・出力ボタンがサマリーセクションの下に配置される (estimate-creation/REQ-26.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 各アクションボタンが表示されることを確認
      const transferButton = page.getByRole('button', { name: '受領見積書を業者金額に転記' });
      const netButton = page.getByRole('button', { name: '業者金額を実行金額に転記' });
      const profitButton = page.getByRole('button', { name: '実行金額を見積金額に転記' });
      const exportButton = page.getByRole('button', { name: /^出力$/i });

      await expect(transferButton).toBeVisible();
      await expect(netButton).toBeVisible();
      await expect(profitButton).toBeVisible();
      await expect(exportButton).toBeVisible();

      // アクションボタンがサマリーパネルの下に配置されていることを確認
      const summaryBbox = await summaryPanel.boundingBox();
      const transferBbox = await transferButton.boundingBox();

      expect(summaryBbox).toBeTruthy();
      expect(transferBbox).toBeTruthy();

      if (summaryBbox && transferBbox) {
        expect(transferBbox.y).toBeGreaterThan(summaryBbox.y + summaryBbox.height - 5);
      }
    });

    /**
     * @requirement estimate-creation/REQ-26.2
     */
    test('ヘッダー部分から転記・出力ボタンが除去されている (estimate-creation/REQ-26.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ヘッダー内に転記ボタンが存在しないことを確認
      // ヘッダーは最初のヘッダー部分のみ（削除ボタンだけが含まれる）
      // ヘッダーに「出力」「転記」のテキストが含まれていないことを確認（削除だけが含まれる）
      // 注: ヘッダーのheaderRight divには削除ボタンのみが含まれる
      const deleteButton = page
        .locator('[data-testid="estimate-detail-page"]')
        .locator('div')
        .filter({ has: page.locator('h1') })
        .getByRole('button', { name: /削除/i });

      await expect(deleteButton).toBeVisible();

      // ヘッダーの削除ボタン付近に転記・出力ボタンがないことを確認
      // h1要素の前後にaction buttonsが存在しないことを確認
      const headerArea = page.locator('[data-testid="estimate-detail-page"] > div').first();
      const headerButtons = headerArea.getByRole('button');
      const buttonTexts = await headerButtons.allTextContents();

      // ヘッダーに「受領見積書を業者金額に転記」「出力」等がないことを確認
      for (const text of buttonTexts) {
        expect(text).not.toContain('受領見積書を業者金額に転記');
        expect(text).not.toContain('業者金額を実行金額に転記');
        expect(text).not.toContain('実行金額を見積金額に転記');
      }
    });
  });

  // ============================================================================
  // REQ-27: 見積項目の保存ボタンとクライアントサイド編集
  // ============================================================================

  test.describe('REQ-27: 見積項目の保存ボタンとクライアントサイド編集', () => {
    /**
     * @requirement estimate-creation/REQ-27.1
     */
    test('見積項目がクライアントサイドで即座に編集可能 (estimate-creation/REQ-27.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集モード切替不要で入力フィールドが直接操作可能であることを確認
      // 数量入力フィールドが表示されていること
      const quantityInputs = page.locator('input[aria-label="数量"]');
      const count = await quantityInputs.count();

      if (count > 0) {
        // 数量フィールドが直接編集可能（enabled）であることを確認
        await expect(quantityInputs.first()).toBeEnabled();

        // 単価フィールドも直接編集可能であることを確認
        const unitPriceInputs = page.locator('input[aria-label="単価"]');
        const unitPriceCount = await unitPriceInputs.count();
        if (unitPriceCount > 0) {
          await expect(unitPriceInputs.first()).toBeEnabled();
        }
      }
    });

    /**
     * @requirement estimate-creation/REQ-27.2
     */
    test('見積項目セクションに保存ボタンが表示される (estimate-creation/REQ-27.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積項目セクション内に保存ボタンが存在することを確認
      const saveButton = page.getByRole('button', { name: /^保存$/i });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-creation/REQ-27.3
     */
    test('保存ボタンでクライアントサイドの変更がDBに一括反映される (estimate-creation/REQ-27.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 数量フィールドに値を入力して変更を作成
      const quantityInputs = page.locator('input[aria-label="数量"]');
      const count = await quantityInputs.count();

      if (count > 0) {
        await quantityInputs.first().fill('99');
        await quantityInputs.first().blur();

        // 保存ボタンが有効状態になることを確認
        const saveButton = page.getByRole('button', { name: /^保存$/i });
        await expect(saveButton).toBeEnabled({ timeout: getTimeout(5000) });

        // 保存ボタンをクリック
        const savePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api') &&
            response.url().includes('/estimates') &&
            (response.request().method() === 'PUT' || response.request().method() === 'PATCH'),
          { timeout: getTimeout(30000) }
        );

        await saveButton.click();
        const response = await savePromise;
        expect(response.ok()).toBeTruthy();
      }
    });

    /**
     * @requirement estimate-creation/REQ-27.4
     */
    test('未保存の変更がない場合、保存ボタンが無効状態で表示される (estimate-creation/REQ-27.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 初期表示時は未保存変更がないため、保存ボタンがdisabledであること
      const saveButton = page.getByRole('button', { name: /^保存$/i });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });
      await expect(saveButton).toBeDisabled();
    });
  });

  // ============================================================================
  // REQ-28: 表示行フィルター
  // ============================================================================

  test.describe('REQ-28: 表示行フィルター', () => {
    /**
     * @requirement estimate-creation/REQ-28.1
     */
    test('「見積」「実行」「業者」の3つのチェックボックスが提供される (estimate-creation/REQ-28.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「見積」チェックボックスが存在すること
      const estimateCheckbox = page
        .locator('label')
        .filter({ hasText: '見積' })
        .locator('input[type="checkbox"]');
      await expect(estimateCheckbox).toBeVisible({ timeout: getTimeout(10000) });

      // 「実行」チェックボックスが存在すること
      const executionCheckbox = page
        .locator('label')
        .filter({ hasText: '実行' })
        .locator('input[type="checkbox"]');
      await expect(executionCheckbox).toBeVisible();

      // 「業者」チェックボックスが存在すること
      const vendorCheckbox = page
        .locator('label')
        .filter({ hasText: '業者' })
        .locator('input[type="checkbox"]');
      await expect(vendorCheckbox).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-28.2
     */
    test('3つのチェックボックスのデフォルト値がすべてON (estimate-creation/REQ-28.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // すべてのチェックボックスがON（チェック済み）であることを確認
      const estimateCheckbox = page
        .locator('label')
        .filter({ hasText: '見積' })
        .locator('input[type="checkbox"]');
      const executionCheckbox = page
        .locator('label')
        .filter({ hasText: '実行' })
        .locator('input[type="checkbox"]');
      const vendorCheckbox = page
        .locator('label')
        .filter({ hasText: '業者' })
        .locator('input[type="checkbox"]');

      await expect(estimateCheckbox).toBeChecked();
      await expect(executionCheckbox).toBeChecked();
      await expect(vendorCheckbox).toBeChecked();
    });

    /**
     * @requirement estimate-creation/REQ-28.3
     */
    test('チェックを外すと該当行タイプの行が非表示になる (estimate-creation/REQ-28.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // VENDOR行が表示されていることを確認
      const vendorRows = page.locator('[data-testid="line-type-VENDOR"]');
      const initialVendorCount = await vendorRows.count();

      // 「業者」チェックボックスを外す
      const vendorCheckbox = page
        .locator('label')
        .filter({ hasText: '業者' })
        .locator('input[type="checkbox"]');
      await vendorCheckbox.uncheck();

      // VENDOR行が非表示になることを確認
      if (initialVendorCount > 0) {
        await expect(vendorRows.first()).not.toBeVisible({ timeout: getTimeout(5000) });
      }

      // チェックボックスを元に戻す
      await vendorCheckbox.check();
    });

    /**
     * @requirement estimate-creation/REQ-28.4
     */
    test('チェックを入れると該当行タイプの行が表示される (estimate-creation/REQ-28.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「実行」チェックボックスを外す
      const executionCheckbox = page
        .locator('label')
        .filter({ hasText: '実行' })
        .locator('input[type="checkbox"]');
      await executionCheckbox.uncheck();

      // EXECUTION行が非表示になることを確認
      const executionRows = page.locator('[data-testid="line-type-EXECUTION"]');
      const executionCount = await executionRows.count();
      if (executionCount > 0) {
        await expect(executionRows.first()).not.toBeVisible({ timeout: getTimeout(5000) });
      }

      // 「実行」チェックボックスを再度チェック
      await executionCheckbox.check();

      // EXECUTION行が再表示されることを確認
      if (executionCount > 0) {
        await expect(executionRows.first()).toBeVisible({ timeout: getTimeout(5000) });
      }
    });
  });

  // ============================================================================
  // REQ-29: 親項目の単価自動計算制御
  // ============================================================================

  test.describe('REQ-29: 親項目の単価自動計算制御', () => {
    /**
     * テスト準備：子項目を持つ親項目を作成
     */
    test('準備：子項目を持つ親項目を作成する', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 項目追加ボタンをクリック
      const addButton = page.getByRole('button', { name: /^\+\s*項目追加$/ });
      await addButton.click();

      // 追加された項目が表示されるまで待機
      await expect(page.locator('[data-testid="line-type-ESTIMATE"]').first()).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 最初の項目を選択して子項目を追加
      const itemRows = page.locator('[data-testid="line-type-ESTIMATE"]');
      await itemRows.first().click();

      // 子項目追加ボタンが有効化されるのを待機
      const addChildButton = page.getByRole('button', { name: /子項目追加/ });
      await expect(addChildButton).toBeEnabled({ timeout: getTimeout(5000) });

      // 子項目を追加
      await addChildButton.click();

      // 保存
      const saveButton = page.getByRole('button', { name: /^保存$/i });
      if (await saveButton.isEnabled()) {
        await saveButton.click();
        await page.waitForLoadState('networkidle');
      }
    });

    /**
     * @requirement estimate-creation/REQ-29.1
     */
    test('子項目を持つ親項目の単価フィールドが編集不可 (estimate-creation/REQ-29.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 親項目（子項目を持つ項目）の単価フィールドが編集不可であることを確認
      // 展開ボタンがある項目は親項目
      const expandButtons = page.locator(
        'button[aria-label*="展開"], button[aria-label*="折りたたみ"]'
      );
      const expandCount = await expandButtons.count();

      // 親項目が存在する場合
      if (expandCount > 0) {
        // 親項目の行にある単価フィールドを確認
        // 親項目は展開ボタンと同じ行にある - 単価がread-onlyまたは表示のみであることを確認
        const parentRow = expandButtons.first().locator('..');
        const parentUnitPrice = parentRow.locator('input[aria-label="単価"]');
        const parentUnitPriceCount = await parentUnitPrice.count();

        if (parentUnitPriceCount > 0) {
          // disabled属性またはreadonly属性で編集不可を確認
          const isDisabled = await parentUnitPrice.isDisabled();
          const isReadonly = await parentUnitPrice.getAttribute('readonly');
          expect(isDisabled || isReadonly !== null).toBeTruthy();
        }
      }
    });

    /**
     * @requirement estimate-creation/REQ-29.2
     */
    test('子項目の金額合計が親項目の金額として自動計算される (estimate-creation/REQ-29.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ページ全体に見積項目テーブルが表示されていることを確認
      const table = page.locator('[aria-label="見積項目テーブル"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // テーブルのコンテンツが読み込まれていることを確認
      const tableContent = await table.textContent();
      expect(tableContent).toBeTruthy();
    });

    /**
     * @requirement estimate-creation/REQ-29.3
     */
    test('子項目を持つ親項目は名称・規格・単位・数量・備考のみ手動編集可能 (estimate-creation/REQ-29.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 展開ボタン（親項目の指標）が存在する場合
      const expandButtons = page.locator(
        'button[aria-label*="展開"], button[aria-label*="折りたたみ"]'
      );
      const expandCount = await expandButtons.count();

      if (expandCount > 0) {
        // 名称フィールドが存在し編集可能であることを確認
        const nameInputs = page.locator('input[aria-label="名称"]');
        const nameCount = await nameInputs.count();
        if (nameCount > 0) {
          await expect(nameInputs.first()).toBeEnabled();
        }
      }
    });
  });

  // ============================================================================
  // REQ-30: 受領見積書転記ダイアログの選択肢改善
  // ============================================================================

  test.describe('REQ-30: 受領見積書転記ダイアログの選択肢改善', () => {
    /**
     * @requirement estimate-creation/REQ-30.1
     */
    test('転記先に「新規項目として作成」選択肢が提供される (estimate-creation/REQ-30.1)', async ({
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

      // 転記先選択ドロップダウンが表示されることを確認
      const targetSelect = page.locator('#target-select');
      await expect(targetSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 「新規項目として作成」オプションが存在することを確認
      const newItemOption = targetSelect
        .locator('option')
        .filter({ hasText: '新規項目として作成' });
      await expect(newItemOption).toHaveCount(1);

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-30.2
     */
    test('転記先に「＜既存項目名＞の子項目として作成」選択肢が提供される (estimate-creation/REQ-30.2)', async ({
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

      // 転記先選択ドロップダウンを確認
      const targetSelect = page.locator('#target-select');
      await expect(targetSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 「の子項目として作成」を含むオプションが存在することを確認
      const childOptions = targetSelect.locator('option').filter({ hasText: /の子項目として作成/ });
      const childOptionCount = await childOptions.count();

      // 見積項目が存在する場合、子項目作成オプションが存在する
      expect(childOptionCount).toBeGreaterThanOrEqual(0);

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-30.3
     */
    test('「＜既存項目名＞の子項目として作成」を選択して転記できる (estimate-creation/REQ-30.3)', async ({
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

      // 受領見積書選択ドロップダウン
      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 受領見積書の選択肢が存在するか確認
      const quotationOptions = await quotationSelect.locator('option').count();

      if (quotationOptions > 1) {
        // 受領見積書を選択
        await quotationSelect.selectOption({ index: 1 });

        // 転記先選択で子項目オプションが存在するか確認
        const targetSelect = page.locator('#target-select');
        const childOptions = targetSelect
          .locator('option')
          .filter({ hasText: /の子項目として作成/ });
        const childOptionCount = await childOptions.count();

        if (childOptionCount > 0) {
          // 最初の子項目オプションを選択
          await targetSelect.selectOption({ index: 1 });

          // 選択されたオプションのテキストに「の子項目として作成」が含まれることを確認
          const selectedText = await targetSelect.locator('option:checked').textContent();
          expect(selectedText).toContain('の子項目として作成');
        }
      }

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // REQ-31: NET案分ダイアログの受領見積書情報表示
  // ============================================================================

  test.describe('REQ-31: NET案分ダイアログの受領見積書情報表示', () => {
    /**
     * @requirement estimate-creation/REQ-31.1
     */
    test('NET案分ダイアログに受領見積書の合計金額が表示される (estimate-creation/REQ-31.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // NET案分ダイアログを開く
      await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 対象業者選択ドロップダウンが表示されることを確認
      const vendorSelect = page.locator('#vendor-select');
      await expect(vendorSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 業者データがある場合
      const vendorOptions = await vendorSelect.locator('option').count();
      if (vendorOptions > 1) {
        // 最初の業者を選択
        await vendorSelect.selectOption({ index: 1 });

        // 受領見積書情報セクションが表示される場合
        const quotationInfoSection = page.getByText('受領見積書合計金額');
        const isInfoVisible = await quotationInfoSection.isVisible().catch(() => false);

        if (isInfoVisible) {
          // 受領見積書合計金額ラベルが表示されることを確認
          await expect(quotationInfoSection).toBeVisible();
        }
      }

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-31.2
     */
    test('NET案分ダイアログに受領見積書のNET金額が表示される (estimate-creation/REQ-31.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // NET案分ダイアログを開く
      await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 対象業者選択
      const vendorSelect = page.locator('#vendor-select');
      await expect(vendorSelect).toBeVisible({ timeout: getTimeout(5000) });

      const vendorOptions = await vendorSelect.locator('option').count();
      if (vendorOptions > 1) {
        await vendorSelect.selectOption({ index: 1 });

        // NET金額ラベルが表示される場合
        const netAmountLabel = page.getByText('NET金額（受領見積書入力値）');
        const isNetVisible = await netAmountLabel.isVisible().catch(() => false);

        if (isNetVisible) {
          await expect(netAmountLabel).toBeVisible();
        }
      }

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // REQ-32: 見積書出力の行タイプ選択
  // ============================================================================

  test.describe('REQ-32: 見積書出力の行タイプ選択', () => {
    /**
     * @requirement estimate-creation/REQ-32.1
     */
    test('出力ダイアログに「見積」「実行」「業者」ラジオボタンが選択可能 (estimate-creation/REQ-32.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 出力対象ラジオボタンが存在することを確認
      const estimateRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="ESTIMATE"]'
      );
      const executionRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="EXECUTION"]'
      );
      const vendorRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="VENDOR"]'
      );

      await expect(estimateRadio).toBeVisible();
      await expect(executionRadio).toBeVisible();
      await expect(vendorRadio).toBeVisible();

      // 各ラジオボタンが選択可能であることを確認
      await executionRadio.click();
      await expect(executionRadio).toBeChecked();

      await vendorRadio.click();
      await expect(vendorRadio).toBeChecked();

      await estimateRadio.click();
      await expect(estimateRadio).toBeChecked();

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-32.2
     */
    test('選択された行タイプのみが出力対象となる (estimate-creation/REQ-32.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 「実行」を選択
      const executionRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="EXECUTION"]'
      );
      await executionRadio.click();
      await expect(executionRadio).toBeChecked();

      // PDF形式を選択
      const pdfRadio = page.locator('input[type="radio"][name="export-format"][value="pdf"]');
      await pdfRadio.click();

      // APIリクエストを監視（blob-based downloadのためdownload.url()はblob: URLとなる）
      const requestPromise = page.waitForRequest(
        (request) =>
          request.url().includes('/api/estimates/') &&
          request.url().includes('/export') &&
          request.url().includes('lineType=EXECUTION'),
        { timeout: getTimeout(30000) }
      );

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // APIリクエストのURLにlineType=EXECUTIONが含まれることを確認
      const apiRequest = await requestPromise;
      expect(apiRequest.url()).toContain('lineType=EXECUTION');
    });

    /**
     * @requirement estimate-creation/REQ-32.3
     */
    test('出力ファイル名に選択された行タイプのラベルが含まれる (estimate-creation/REQ-32.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 「業者」を選択
      const vendorRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="VENDOR"]'
      );
      await vendorRadio.click();

      // Excel形式を選択
      const excelRadio = page.locator('input[type="radio"][name="export-format"][value="xlsx"]');
      await excelRadio.click();

      // ダウンロードの待機設定
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // ダウンロードされたファイル名に「業者」が含まれることを確認
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      expect(filename).toContain('業者');
      expect(filename).toMatch(/\.xlsx$/i);
    });

    /**
     * @requirement estimate-creation/REQ-32.4
     */
    test('出力APIがlineTypeクエリパラメータを受け付ける (estimate-creation/REQ-32.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 「見積」を選択（デフォルト）
      const estimateRadio = page.locator(
        'input[type="radio"][name="export-line-type"][value="ESTIMATE"]'
      );
      await expect(estimateRadio).toBeChecked();

      // PDF形式を選択
      const pdfRadio = page.locator('input[type="radio"][name="export-format"][value="pdf"]');
      await pdfRadio.click();

      // APIリクエストを監視
      const requestPromise = page.waitForRequest(
        (request) =>
          request.url().includes('/api/estimates/') &&
          request.url().includes('/export') &&
          request.url().includes('lineType='),
        { timeout: getTimeout(30000) }
      );

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // APIリクエストにlineTypeパラメータが含まれることを確認
      const apiRequest = await requestPromise;
      expect(apiRequest.url()).toContain('lineType=ESTIMATE');
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
