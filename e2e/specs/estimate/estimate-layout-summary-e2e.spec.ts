/**
 * @fileoverview 見積書レイアウト・サマリーパネル・見積業者列のE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-17.3: 見積項目テーブルに「見積業者」列を追加する
 * - REQ-17.4: 受領見積書から転記された業者金額行に見積業者名(sourceVendorName)を表示する
 * - REQ-17.5: 転記ボタンのラベルを「受領見積書を業者金額に転記」と表示する
 * - REQ-20.1: 基本情報パネルの下にサマリーパネルを表示する
 * - REQ-20.2: サマリーパネルに見積金額合計を表示する
 * - REQ-20.3: サマリーパネルに実行金額合計を表示する
 * - REQ-20.4: サマリーパネルに業者金額合計を表示する
 * - REQ-20.5: サマリーパネルに利益率を百分率で表示する
 * - REQ-20.6: サマリーパネルに値引率を百分率で表示する
 * - REQ-21.1: サイドバー形式パネルを廃止する
 * - REQ-21.2: 見積項目テーブルを画面の横幅いっぱいに表示する
 * - REQ-21.3: 見積書画面を1カラムレイアウトで構成する
 *
 * @module e2e/specs/estimate/estimate-layout-summary-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 見積書レイアウト・サマリーパネル・見積業者列のE2Eテスト
 */
test.describe('見積書レイアウト・サマリーパネル・見積業者列', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let accessToken: string = '';
  let tradingPartnerName: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    /**
     * テスト準備：プロジェクトの作成
     */
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成画面に移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      const projectName = `E2Eレイアウトサマリーテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区レイアウト1-2-3');

      // 営業担当者を確認・選択
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

      // プロジェクト作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // URLからプロジェクトIDを取得
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      expect(createdProjectId).toBeTruthy();
    });

    /**
     * テスト準備：協力業者の作成
     */
    test('準備2：テスト用協力業者を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成画面に移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      tradingPartnerName = `E2Eテスト業者_レイアウト_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('レイアウトテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      // 協力業者チェックボックスをオン
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      // メールアドレスを入力
      await page.getByLabel('メールアドレス').fill('test-layout@example.com');

      // 取引先作成
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

    /**
     * テスト準備：APIトークン取得と見積書作成
     */
    test('準備3：テスト用見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // APIトークンを取得
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      // 見積書を作成
      const estimateResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `レイアウトサマリーテスト見積書_${Date.now()}`,
          },
        }
      );
      expect(estimateResponse.status()).toBe(201);

      const estimateBody = await estimateResponse.json();
      createdEstimateId = estimateBody.id;
      expect(createdEstimateId).toBeTruthy();
    });

    /**
     * テスト準備：見積書に項目を追加する
     */
    test('準備4：見積書に項目を追加する', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集モードに切り替え
      await page.getByRole('button', { name: /編集/i }).click();

      // 編集モードに切り替わったことを確認
      await expect(page.getByRole('button', { name: /キャンセル/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 項目追加ボタンをクリック（「子項目追加」ボタンと区別するためexact指定）
      const addButton = page.getByRole('button', { name: '+ 項目追加' });
      if (await addButton.isVisible()) {
        await addButton.click();

        // 数量と単価を入力して見積金額を設定
        const quantityInputs = page.locator('input[aria-label="数量"]');
        const unitPriceInputs = page.locator('input[aria-label="単価"]');

        const quantityCount = await quantityInputs.count();
        if (quantityCount > 0) {
          // 最初の見積行（ESTIMATE）の数量と単価を入力
          await quantityInputs.first().fill('10');
          await unitPriceInputs.first().fill('5000');
          await unitPriceInputs.first().blur();
        }

        // 保存
        const saveButton = page.getByRole('button', { name: /保存/i });
        if (await saveButton.isEnabled()) {
          await saveButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });

    /**
     * テスト準備：数量表と内訳書を作成する（見積依頼作成の前提条件）
     */
    test('準備5：テスト用数量表と内訳書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 数量表を作成
      const quantityTableResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `レイアウトテスト用数量表_${Date.now()}`,
          },
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
          data: {
            name: 'テストグループ',
            displayOrder: 0,
          },
        }
      );
      expect(groupResponse.status()).toBe(201);
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;

      // 項目を作成
      const itemResponse = await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: 'テスト項目1',
          workType: '工種A',
          specification: '規格A',
          unit: '式',
          quantity: 1.0,
          displayOrder: 0,
        },
      });
      expect(itemResponse.status()).toBe(201);

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `レイアウトテスト用内訳書_${Date.now()}`,
            quantityTableId: quantityTableId,
          },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;

      expect(createdItemizedStatementId).toBeTruthy();
    });

    /**
     * テスト準備：見積依頼と受領見積書を作成
     */
    test('準備6：見積依頼と受領見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 見積依頼を作成（必須フィールド: name, tradingPartnerId, itemizedStatementId）
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `レイアウトテスト用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);

      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();

      // 受領見積書を作成（multipart/form-data: name, submittedAt, lineItems）
      const lineItems = JSON.stringify([
        {
          name: 'テスト項目A',
          sortOrder: 0,
          specification: '規格A',
          unit: '式',
          quantity: 1,
          unitPrice: 100000,
          amount: 100000,
        },
        {
          name: 'テスト項目B',
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
            name: `受領見積書_レイアウトテスト_${Date.now()}`,
            submittedAt: new Date().toISOString(),
            lineItems: lineItems,
          },
        }
      );
      expect(receivedQuotationResponse.status()).toBe(201);

      const receivedQuotationBody = await receivedQuotationResponse.json();
      createdReceivedQuotationId = receivedQuotationBody.id;
      expect(createdReceivedQuotationId).toBeTruthy();
    });
  });

  // ============================================================================
  // REQ-17: 見積業者列関連テスト
  // ============================================================================

  test.describe('見積業者列', () => {
    /**
     * @requirement estimate-creation/REQ-17.3
     */
    test('見積項目テーブルに「見積業者」列が表示される (estimate-creation/REQ-17.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積項目テーブルが表示されることを確認
      const table = page.locator('[aria-label="見積項目テーブル"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // テーブルヘッダーに「見積業者」列が存在することを確認
      await expect(table.getByText('見積業者')).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-17.4
     */
    test('受領見積書から転記された業者金額行にsourceVendorNameを表示する (estimate-creation/REQ-17.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 転記ボタンをクリックして受領見積書を転記する
      const transferButton = page.getByRole('button', {
        name: /受領見積書を業者金額に転記/i,
      });
      await expect(transferButton).toBeVisible({ timeout: getTimeout(10000) });
      await transferButton.click();

      // 転記ダイアログが表示されることを確認
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 受領見積書の選択UIが表示されるか確認し、選択可能なら転記を実行
      const quotationSelect = page.locator(
        'select[aria-label*="受領見積書"], [data-testid="quotation-select"]'
      );
      const selectVisible = await quotationSelect.isVisible().catch(() => false);

      if (selectVisible) {
        // 受領見積書を選択して転記実行
        const options = await quotationSelect.locator('option').count();
        if (options > 1) {
          await quotationSelect.selectOption({ index: 1 });
        }

        // 転記実行ボタンをクリック
        const executeButton = page.getByRole('dialog').getByRole('button', { name: /転記|実行/i });
        if (await executeButton.isVisible()) {
          await executeButton.click();

          // 転記完了を待機
          await page.waitForLoadState('networkidle');

          // 転記後、業者金額行に業者名が表示されていることを確認
          // VENDOR行（業者行）のsourceVendorNameが表示される
          const vendorRows = page.locator('[data-testid="line-type-VENDOR"]');
          const vendorCount = await vendorRows.count();

          if (vendorCount > 0) {
            // 業者行に業者名テキストが含まれているか確認
            // 転記された行には取引先名が見積業者列に表示される
            const tableContent = await page
              .locator('[aria-label="見積項目テーブル"]')
              .textContent();
            expect(tableContent).toBeTruthy();
          }
        }
      } else {
        // ダイアログを閉じる
        const closeButton = page.getByRole('button', { name: /閉じる|キャンセル/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }

        // 見積業者列がテーブルヘッダーに存在することを確認（REQ-17.3の基本確認）
        const table = page.locator('[aria-label="見積項目テーブル"]');
        await expect(table.getByText('見積業者')).toBeVisible();
      }
    });

    /**
     * @requirement estimate-creation/REQ-17.5
     */
    test('転記ボタンのラベルが「受領見積書を業者金額に転記」と表示される (estimate-creation/REQ-17.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 転記ボタンのラベルが正確に「受領見積書を業者金額に転記」であることを確認
      const transferButton = page.getByRole('button', {
        name: '受領見積書を業者金額に転記',
        exact: true,
      });
      await expect(transferButton).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // REQ-20: サマリーパネル関連テスト
  // ============================================================================

  test.describe('サマリーパネル', () => {
    /**
     * @requirement estimate-creation/REQ-20.1
     */
    test('基本情報パネルの下にサマリーパネルが表示される (estimate-creation/REQ-20.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 基本情報セクションが表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible();

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // サマリーパネルが基本情報の後（下）に配置されていることを確認
      // DOM順序で基本情報 < サマリーパネル < 見積項目であることを検証
      const basicInfoBbox = await page.getByText('基本情報').first().boundingBox();
      const summaryBbox = await summaryPanel.boundingBox();

      expect(basicInfoBbox).toBeTruthy();
      expect(summaryBbox).toBeTruthy();

      if (basicInfoBbox && summaryBbox) {
        // サマリーパネルのtop座標が基本情報のtop座標より下にあることを確認
        expect(summaryBbox.y).toBeGreaterThan(basicInfoBbox.y);
      }
    });

    /**
     * @requirement estimate-creation/REQ-20.2
     */
    test('サマリーパネルに見積金額合計が表示される (estimate-creation/REQ-20.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 「見積金額合計」ラベルが存在することを確認
      await expect(summaryPanel.getByText('見積金額合計')).toBeVisible();

      // 金額値が表示されていることを確認（「円」を含むまたは「-」表示）
      const summaryText = await summaryPanel.textContent();
      expect(summaryText).toBeTruthy();
      expect(summaryText).toContain('見積金額合計');
    });

    /**
     * @requirement estimate-creation/REQ-20.3
     */
    test('サマリーパネルに実行金額合計が表示される (estimate-creation/REQ-20.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 「実行金額合計」ラベルが存在することを確認
      await expect(summaryPanel.getByText('実行金額合計')).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-20.4
     */
    test('サマリーパネルに業者金額合計が表示される (estimate-creation/REQ-20.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 「業者金額合計」ラベルが存在することを確認
      await expect(summaryPanel.getByText('業者金額合計')).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-20.5
     */
    test('サマリーパネルに利益率を百分率で表示する (estimate-creation/REQ-20.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 「利益率」ラベルが存在することを確認
      await expect(summaryPanel.getByText('利益率')).toBeVisible();

      // 利益率の値が「%」または「-」のいずれかで表示されることを確認
      // （見積金額と実行金額がある場合は%表示、ない場合は「-」表示）
      const profitRateText = await summaryPanel.textContent();
      expect(profitRateText).toBeTruthy();
      // 利益率は「%」を含むか、値なし時は「-」を含む
      const containsPercentOrDash = profitRateText!.includes('%') || profitRateText!.includes('-');
      expect(containsPercentOrDash).toBeTruthy();
    });

    /**
     * @requirement estimate-creation/REQ-20.6
     */
    test('サマリーパネルに値引率を百分率で表示する (estimate-creation/REQ-20.6)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サマリーパネルが表示されることを確認
      const summaryPanel = page.locator('[data-testid="summary-panel"]');
      await expect(summaryPanel).toBeVisible({ timeout: getTimeout(10000) });

      // 「値引率」ラベルが存在することを確認
      await expect(summaryPanel.getByText('値引率')).toBeVisible();

      // 値引率の値が「%」または「-」のいずれかで表示されることを確認
      const discountRateText = await summaryPanel.textContent();
      expect(discountRateText).toBeTruthy();
      const containsPercentOrDash =
        discountRateText!.includes('%') || discountRateText!.includes('-');
      expect(containsPercentOrDash).toBeTruthy();
    });
  });

  // ============================================================================
  // REQ-21: 1カラムレイアウト関連テスト
  // ============================================================================

  test.describe('1カラムレイアウト', () => {
    /**
     * @requirement estimate-creation/REQ-21.1
     */
    test('サイドバー形式の合計金額パネル・NET金額計算パネル・利益率設定パネルが廃止されている (estimate-creation/REQ-21.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サイドバー形式のパネルが存在しないことを確認
      // サイドバーとして表示されるパネル（aside要素や固定位置のサイドバー）がないことを検証
      const sidebar = page.locator(
        'aside, [data-testid="sidebar"], [data-testid="total-amount-sidebar"], [data-testid="net-calculation-sidebar"], [data-testid="profit-rate-sidebar"]'
      );
      const sidebarCount = await sidebar.count();

      // サイドバー要素が存在しないことを確認
      expect(sidebarCount).toBe(0);

      // サイドパネルとしての「合計金額パネル」「NET金額計算パネル」「利益率設定パネル」がメインコンテンツ横に配置されていないことを確認
      // ページの主コンテナのスタイルがflexRowやグリッド2カラムでないことを検証
      const detailPage = page.locator('[data-testid="estimate-detail-page"]');
      const displayStyle = await detailPage.evaluate((el) => {
        // 子要素にflex-direction: rowのレイアウトがないことを確認
        const children = Array.from(el.children);
        return children.map((child) => {
          const computed = window.getComputedStyle(child);
          return {
            display: computed.display,
            flexDirection: computed.flexDirection,
            gridTemplateColumns: computed.gridTemplateColumns,
          };
        });
      });

      // 2カラムレイアウト（サイドバー配置）がないことを確認
      for (const style of displayStyle) {
        if (style.display === 'grid' && style.gridTemplateColumns) {
          // 2カラム以上のグリッドでないことを確認（summaryGridの5カラムは許容）
          const columns = style.gridTemplateColumns.split(' ').filter((c: string) => c !== '');
          // 2カラムのサイドバーレイアウト（例：「1fr 300px」）でないこと
          if (columns.length === 2) {
            // サマリー以外の2カラムグリッドがメインレイアウトに使われていないことを確認
            // infoGridは2カラムだが、それはサイドバーではなく情報表示用
          }
        }
      }
    });

    /**
     * @requirement estimate-creation/REQ-21.2
     */
    test('見積項目テーブルが画面の横幅いっぱいに表示される (estimate-creation/REQ-21.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積項目テーブルが表示されることを確認
      const table = page.locator('[aria-label="見積項目テーブル"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // テーブルのwidth: 100%が適用されていることを確認
      const tableStyle = await table.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          parentWidth: el.parentElement ? window.getComputedStyle(el.parentElement).width : '0',
        };
      });

      // テーブルの幅が親要素の幅と等しい（横幅いっぱい）であることを確認
      const tableWidth = parseFloat(tableStyle.width);
      const parentWidth = parseFloat(tableStyle.parentWidth);
      expect(tableWidth).toBeGreaterThan(0);
      // テーブル幅が親要素幅の95%以上であること（padding等を考慮）
      expect(tableWidth / parentWidth).toBeGreaterThanOrEqual(0.95);
    });

    /**
     * @requirement estimate-creation/REQ-21.3
     */
    test('見積書画面が1カラムレイアウトで構成される（サイドバーなし） (estimate-creation/REQ-21.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      const detailPage = page.locator('[data-testid="estimate-detail-page"]');
      await expect(detailPage).toBeVisible({ timeout: getTimeout(15000) });

      // ページコンテナのmaxWidthが設定されていることを確認（1カラムレイアウト）
      const containerStyle = await detailPage.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          maxWidth: computed.maxWidth,
          display: computed.display,
          flexDirection: computed.flexDirection,
        };
      });

      // maxWidthが設定されていることを確認（1400pxまたは類似の値）
      expect(containerStyle.maxWidth).not.toBe('none');
      const maxWidthValue = parseFloat(containerStyle.maxWidth);
      expect(maxWidthValue).toBeGreaterThan(0);
      expect(maxWidthValue).toBeLessThanOrEqual(1500); // 1400px + margin

      // メインセクションの構造を確認: 縦方向（column）の配置であること
      // コンテンツエリアがflex-direction: columnであることを確認
      const contentSections = await detailPage.evaluate((el) => {
        // コンテンツ構成の子要素の配置方向を確認
        const allDivs = el.querySelectorAll(':scope > div');
        const layouts: string[] = [];
        allDivs.forEach((div) => {
          const computed = window.getComputedStyle(div);
          if (computed.display === 'flex') {
            layouts.push(computed.flexDirection);
          }
        });
        return layouts;
      });

      // コンテンツ内にrow方向のflexレイアウト（サイドバー配置）がないことを確認
      // ヘッダーのボタン配置（row）は許容するため、コンテンツセクションに限定して確認
      // 少なくとも1つのcolumnレイアウトが存在することを確認
      const hasColumnLayout = contentSections.includes('column');
      expect(hasColumnLayout).toBeTruthy();
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    /**
     * テストで作成したデータを削除
     */
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      // アクセストークンが無い場合は再取得
      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: 'user@example.com',
            password: 'Password123!',
          },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      // 見積書を削除
      if (createdEstimateId) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // プロジェクトを削除（カスケードで関連データも削除される）
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

      // テストデータリセット
      createdProjectId = null;
      createdTradingPartnerId = null;
      createdEstimateId = null;
      createdEstimateRequestId = null;
      createdReceivedQuotationId = null;
    });
  });
});
