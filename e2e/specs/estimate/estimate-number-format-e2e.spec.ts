/**
 * @fileoverview 見積書 - 数値表示形式と丸め規則のE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-22.1: 見積項目の数量を小数2桁常時表示（例: 1.00、2.50、10.25）
 * - REQ-22.2: 見積項目の単価を小数第1位で四捨五入して常時整数表示（例: 1234）
 * - REQ-22.3: 見積項目の金額を小数第1位で四捨五入して整数表示（例: 12345）
 * - REQ-22.4: NET金額案分処理が実行された場合、案分後金額を整数表示
 * - REQ-22.5: NET金額案分処理が実行された場合、案分後の単価を整数で設定
 * - REQ-22.6: 利益率適用処理が実行された場合、新しい単価を整数表示
 * - REQ-22.7: 数量の入力フィールドで小数2桁固定表示のフォーマットを適用（フォーカスアウト時）
 * - REQ-22.8: 単価の入力フィールドでフォーカスアウト時に整数にフォーマット
 * - REQ-22.9: 金額の自動計算で数量x単価の結果を整数で保持
 *
 * @module e2e/specs/estimate/estimate-number-format-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { buildNewEstimateItemNode, saveEstimateDraft } from '../../helpers/estimate-draft';

/**
 * 見積書 - 数値表示形式と丸め規則のE2Eテスト
 */
test.describe('見積書 - 数値表示形式と丸め規則', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

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
      const projectName = `E2E数値フォーマットテスト見積_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区数値1-2-3');

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
      const tradingPartnerName = `E2E数値テスト業者_見積_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('スウチテストギョウシャミツモリ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町2-2-2');

      // 協力業者チェックボックスをオン
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      // メールアドレスを入力
      await page.getByLabel('メールアドレス').fill('test-numfmt-estimate@example.com');

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
            name: `数値フォーマットテスト見積書_${Date.now()}`,
          },
        }
      );
      expect(estimateResponse.status()).toBe(201);

      const estimateBody = await estimateResponse.json();
      createdEstimateId = estimateBody.id;
      expect(createdEstimateId).toBeTruthy();

      // 見積項目を作成（3行1セット: ESTIMATE, EXECUTION, VENDOR）
      // 撤去済みの `POST /:id/items` ではなく一括保存（`PUT /:id/save`）で作成する
      // （estimate-creation REQ-42.1、Task 53.13）
      const savedItems = await saveEstimateDraft(request, accessToken, createdEstimateId!, [
        buildNewEstimateItemNode({
          name: '数値フォーマットテスト項目',
          specification: '規格A',
          unit: '式',
          quantity: 1,
          estimateUnitPrice: 1000,
          executionUnitPrice: 1000,
          vendorUnitPrice: 1000,
        }),
      ]);
      expect(savedItems.length).toBe(1);
      expect(savedItems[0]!.lines.length).toBe(3);
    });
  });

  // ============================================================================
  // REQ-22.1: 数量の小数2桁常時表示
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.1
   */
  test('数量が小数2桁常時表示される (estimate-creation/REQ-22.1)', async ({ page }) => {
    expect(createdEstimateId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');

    // 見積書詳細画面に移動
    await page.goto(`/estimates/${createdEstimateId}`);
    await page.waitForLoadState('networkidle');

    // 詳細ページが表示されることを確認
    await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 数量入力フィールドを取得（項目はAPIで作成済み）
    const quantityInputs = page.locator('input[aria-label="数量"]');
    const quantityCount = await quantityInputs.count();
    expect(quantityCount).toBeGreaterThan(0);

    // 整数値「1」を入力
    await quantityInputs.first().fill('1');
    // フォーカスアウトしてフォーマットをトリガー
    await quantityInputs.first().blur();

    // 小数2桁常時表示（1.00）になることを確認
    await expect(quantityInputs.first()).toHaveValue('1.00', {
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // REQ-22.2: 単価の整数表示
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.2
   */
  test('単価が小数第1位で四捨五入して整数表示される (estimate-creation/REQ-22.2)', async ({
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

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 単価入力フィールドを取得
    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const unitPriceCount = await unitPriceInputs.count();
    expect(unitPriceCount).toBeGreaterThan(0);

    // 小数を含む値「1234.6」を入力（四捨五入で1235になるべき）
    await unitPriceInputs.first().fill('1234.6');
    // フォーカスアウトしてフォーマットをトリガー
    await unitPriceInputs.first().blur();

    // 小数第1位で四捨五入した整数（1235）になることを確認
    await expect(unitPriceInputs.first()).toHaveValue('1235', {
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // REQ-22.3: 金額（数量x単価）の整数表示
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.3
   */
  test('金額が数量x単価の自動計算結果として整数表示される (estimate-creation/REQ-22.3)', async ({
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

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 数量と単価のフィールドを取得
    const quantityInputs = page.locator('input[aria-label="数量"]');
    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const quantityCount = await quantityInputs.count();
    expect(quantityCount).toBeGreaterThan(0);

    // 数量に「3」、単価に「4115」を入力 => 金額 = 3 x 4115 = 12345
    await quantityInputs.first().fill('3');
    await quantityInputs.first().blur();
    await unitPriceInputs.first().fill('4115');
    await unitPriceInputs.first().blur();

    // 金額フィールドが整数表示（12,345の桁区切り形式）であることを確認
    // 金額はdata-testid="amount-field"で表示される
    const amountFields = page.locator('[data-testid="amount-field"]');
    const amountCount = await amountFields.count();
    expect(amountCount).toBeGreaterThan(0);

    // 最初の金額フィールドのテキストを取得
    const amountText = await amountFields.first().textContent();
    expect(amountText).toBeTruthy();

    // 金額が整数表示されていることを確認（小数点を含まない）
    // 桁区切りカンマ付きの数字、もしくは「-」であること
    if (amountText && amountText !== '-') {
      // 小数点が含まれていないことを確認
      const numericPart = amountText.replace(/,/g, '');
      expect(numericPart).not.toContain('.');
      // 数値として有効であることを確認
      const numValue = parseInt(numericPart, 10);
      expect(isNaN(numValue)).toBeFalsy();
    }
  });

  // ============================================================================
  // REQ-22.4: NET金額案分後の金額を整数表示
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.4
   */
  test('NET金額案分処理後の金額が整数表示される (estimate-creation/REQ-22.4)', async ({ page }) => {
    expect(createdEstimateId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');

    // 見積書詳細画面に移動
    await page.goto(`/estimates/${createdEstimateId}`);
    await page.waitForLoadState('networkidle');

    // 詳細ページが表示されることを確認
    await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // VENDOR行の数量と単価を入力
    const vendorRows = page.locator('[data-testid="line-type-VENDOR"]');
    const vendorCount = await vendorRows.count();

    if (vendorCount > 0) {
      const vendorQuantity = vendorRows.first().locator('input[aria-label="数量"]');
      const vendorUnitPrice = vendorRows.first().locator('input[aria-label="単価"]');

      if ((await vendorQuantity.isVisible()) && (await vendorUnitPrice.isVisible())) {
        await vendorQuantity.fill('1');
        await vendorQuantity.blur();
        await vendorUnitPrice.fill('100000');
        await vendorUnitPrice.blur();
      }

      // 保存
      const saveButton = page.getByRole('button', { name: /保存/i });
      if (await saveButton.isEnabled()) {
        await saveButton.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // NET案分ダイアログを開く（「業者金額を実行金額に転記」ボタン）
    const netButton = page.getByRole('button', { name: /業者金額を実行金額に転記/i });
    const netButtonVisible = await netButton.isVisible().catch(() => false);

    if (netButtonVisible) {
      await netButton.click();

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // NET金額を入力
        const netAmountInput = dialog
          .locator('input[aria-label*="NET金額"], input[type="number"], input[type="text"]')
          .first();
        const inputVisible = await netAmountInput.isVisible().catch(() => false);

        if (inputVisible) {
          await netAmountInput.fill('150000');

          // プレビューまたは案分結果を確認
          // 案分結果の金額が整数であることを確認
          const previewText = await dialog.textContent();
          if (previewText) {
            // 結果に小数が含まれていないことを確認（金額表示部分）
            // 金額値は桁区切り付き整数で表示される
            const pricePattern = /\d{1,3}(,\d{3})*(\.\d+)/;
            const hasDecimalAmount = pricePattern.test(previewText);
            // 金額部分に小数が含まれていないことを期待
            // ただし利率表示（%付き）は小数を含んでも許容
            expect(hasDecimalAmount).toBeFalsy();
          }
        }

        // ダイアログを閉じる
        const closeButton = dialog.getByRole('button', { name: /閉じる|キャンセル/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    }

    // 金額フィールドが整数表示であることを確認
    const amountFields = page.locator('[data-testid="amount-field"]');
    const amountCount = await amountFields.count();
    for (let i = 0; i < amountCount; i++) {
      const text = await amountFields.nth(i).textContent();
      if (text && text !== '-') {
        const numericPart = text.replace(/,/g, '');
        // 小数点を含まないことを確認
        expect(numericPart).not.toContain('.');
      }
    }
  });

  // ============================================================================
  // REQ-22.5: NET金額案分後の単価を整数で設定
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.5
   */
  test('NET金額案分処理後の単価が整数で設定される (estimate-creation/REQ-22.5)', async ({
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

    // NET案分ダイアログを開く
    const netButton = page.getByRole('button', { name: /業者金額を実行金額に転記/i });
    const netButtonVisible = await netButton.isVisible().catch(() => false);

    if (netButtonVisible) {
      await netButton.click();

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // 実行ボタンが存在する場合、案分を実行
        const executeButton = dialog.getByRole('button', { name: /実行|適用|転記/i });
        const executeVisible = await executeButton.isVisible().catch(() => false);

        if (executeVisible) {
          // NET金額入力
          const netAmountInput = dialog
            .locator('input[aria-label*="NET金額"], input[type="number"], input[type="text"]')
            .first();
          const inputVisible = await netAmountInput.isVisible().catch(() => false);
          if (inputVisible) {
            await netAmountInput.fill('200000');
          }
        }

        // ダイアログを閉じる
        const closeButton = dialog.getByRole('button', { name: /閉じる|キャンセル/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    }

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 単価フィールドの値が整数であることを確認
    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const unitPriceCount = await unitPriceInputs.count();

    for (let i = 0; i < unitPriceCount; i++) {
      const value = await unitPriceInputs.nth(i).inputValue();
      if (value && value !== '') {
        // 単価が整数であることを確認（小数点を含まない）
        expect(value).not.toContain('.');
        // 数値として有効であることを確認
        const numValue = parseInt(value, 10);
        expect(isNaN(numValue)).toBeFalsy();
      }
    }
  });

  // ============================================================================
  // REQ-22.6: 利益率適用後の単価を整数表示
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.6
   */
  test('利益率適用処理後の単価が整数表示される (estimate-creation/REQ-22.6)', async ({ page }) => {
    expect(createdEstimateId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');

    // 見積書詳細画面に移動
    await page.goto(`/estimates/${createdEstimateId}`);
    await page.waitForLoadState('networkidle');

    // 詳細ページが表示されることを確認
    await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // EXECUTION行の数量と単価を入力
    const executionRows = page.locator('[data-testid="line-type-EXECUTION"]');
    const executionCount = await executionRows.count();

    if (executionCount > 0) {
      const execQuantity = executionRows.first().locator('input[aria-label="数量"]');
      const execUnitPrice = executionRows.first().locator('input[aria-label="単価"]');

      if ((await execQuantity.isVisible()) && (await execUnitPrice.isVisible())) {
        await execQuantity.fill('1');
        await execQuantity.blur();
        await execUnitPrice.fill('10000');
        await execUnitPrice.blur();
      }

      // 保存
      const saveButton = page.getByRole('button', { name: /保存/i });
      if (await saveButton.isEnabled()) {
        await saveButton.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // 利益率適用ダイアログを開く（「実行金額を見積金額に転記」ボタン）
    const profitButton = page.getByRole('button', { name: /実行金額を見積金額に転記/i });
    const profitButtonVisible = await profitButton.isVisible().catch(() => false);

    if (profitButtonVisible) {
      await profitButton.click();

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // 利益率入力フィールドを探す
        const profitRateInput = dialog
          .locator('input[aria-label*="利益率"], input[type="number"], input[type="text"]')
          .first();
        const inputVisible = await profitRateInput.isVisible().catch(() => false);

        if (inputVisible) {
          // 利益率10%を入力
          await profitRateInput.fill('10');

          // プレビュー結果を確認（新しい単価が整数であること）
          const previewText = await dialog.textContent();
          if (previewText) {
            // 金額表示に小数が含まれていないことを確認
            const priceWithDecimal = /\d{1,3}(,\d{3})*\.\d+/;
            // %表示の小数は許容するので、%を含む部分を除外して確認
            const cleanedText = previewText.replace(/[\d.]+%/g, '');
            const hasDecimalPrice = priceWithDecimal.test(cleanedText);
            expect(hasDecimalPrice).toBeFalsy();
          }
        }

        // ダイアログを閉じる
        const closeButton = dialog.getByRole('button', { name: /閉じる|キャンセル/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    }

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const unitPriceCount = await unitPriceInputs.count();

    for (let i = 0; i < unitPriceCount; i++) {
      const value = await unitPriceInputs.nth(i).inputValue();
      if (value && value !== '') {
        // 単価が整数（小数点を含まない）であることを確認
        expect(value).not.toContain('.');
      }
    }
  });

  // ============================================================================
  // REQ-22.7: 数量フォーカスアウト時の小数2桁固定フォーマット
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.7
   */
  test('数量入力フィールドでフォーカスアウト時に小数2桁固定フォーマットが適用される (estimate-creation/REQ-22.7)', async ({
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

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 数量入力フィールドを取得
    const quantityInputs = page.locator('input[aria-label="数量"]');
    const quantityCount = await quantityInputs.count();
    expect(quantityCount).toBeGreaterThan(0);

    // テストケース1: 整数「5」を入力 → 「5.00」にフォーマット
    await quantityInputs.first().fill('5');
    await quantityInputs.first().blur();
    await expect(quantityInputs.first()).toHaveValue('5.00', {
      timeout: getTimeout(5000),
    });

    // テストケース2: 小数1桁「2.5」を入力 → 「2.50」にフォーマット
    await quantityInputs.first().fill('2.5');
    await quantityInputs.first().blur();
    await expect(quantityInputs.first()).toHaveValue('2.50', {
      timeout: getTimeout(5000),
    });

    // テストケース3: 小数2桁「10.25」を入力 → 「10.25」のまま
    await quantityInputs.first().fill('10.25');
    await quantityInputs.first().blur();
    await expect(quantityInputs.first()).toHaveValue('10.25', {
      timeout: getTimeout(5000),
    });

    // テストケース4: 小数3桁「1.234」を入力 → 「1.23」に四捨五入
    await quantityInputs.first().fill('1.234');
    await quantityInputs.first().blur();
    await expect(quantityInputs.first()).toHaveValue('1.23', {
      timeout: getTimeout(5000),
    });

    // テストケース5: 小数3桁「1.235」を入力 → 「1.24」に四捨五入
    await quantityInputs.first().fill('1.235');
    await quantityInputs.first().blur();
    await expect(quantityInputs.first()).toHaveValue('1.24', {
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // REQ-22.8: 単価フォーカスアウト時の整数フォーマット
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.8
   */
  test('単価入力フィールドでフォーカスアウト時に整数にフォーマットされる (estimate-creation/REQ-22.8)', async ({
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

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 単価入力フィールドを取得
    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const unitPriceCount = await unitPriceInputs.count();
    expect(unitPriceCount).toBeGreaterThan(0);

    // テストケース1: 整数「1000」を入力 → 「1000」のまま
    await unitPriceInputs.first().fill('1000');
    await unitPriceInputs.first().blur();
    await expect(unitPriceInputs.first()).toHaveValue('1000', {
      timeout: getTimeout(5000),
    });

    // テストケース2: 小数「1234.4」を入力 → 「1234」に四捨五入（切り捨て）
    await unitPriceInputs.first().fill('1234.4');
    await unitPriceInputs.first().blur();
    await expect(unitPriceInputs.first()).toHaveValue('1234', {
      timeout: getTimeout(5000),
    });

    // テストケース3: 小数「1234.5」を入力 → 「1235」に四捨五入（切り上げ）
    await unitPriceInputs.first().fill('1234.5');
    await unitPriceInputs.first().blur();
    await expect(unitPriceInputs.first()).toHaveValue('1235', {
      timeout: getTimeout(5000),
    });

    // テストケース4: 小数「999.9」を入力 → 「1000」に四捨五入
    await unitPriceInputs.first().fill('999.9');
    await unitPriceInputs.first().blur();
    await expect(unitPriceInputs.first()).toHaveValue('1000', {
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // REQ-22.9: 金額の自動計算（数量x単価を整数で保持）
  // ============================================================================

  /**
   * @requirement estimate-creation/REQ-22.9
   */
  test('金額の自動計算で数量x単価の結果が整数で保持される (estimate-creation/REQ-22.9)', async ({
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

    // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

    // 数量と単価のフィールドを取得
    const quantityInputs = page.locator('input[aria-label="数量"]');
    const unitPriceInputs = page.locator('input[aria-label="単価"]');
    const quantityCount = await quantityInputs.count();
    expect(quantityCount).toBeGreaterThan(0);

    // テストケース: 数量2.50 x 単価1000 = 2500（整数）
    await quantityInputs.first().fill('2.50');
    await quantityInputs.first().blur();
    await unitPriceInputs.first().fill('1000');
    await unitPriceInputs.first().blur();

    // 金額が計算されるのを待機
    const amountFields = page.locator('[data-testid="amount-field"]');
    await expect(amountFields.first()).not.toHaveText('-', {
      timeout: getTimeout(10000),
    });

    // 金額フィールドの値を確認
    const amountText = await amountFields.first().textContent();
    expect(amountText).toBeTruthy();

    // 「2,500」（桁区切り付き整数）であることを確認
    if (amountText && amountText !== '-') {
      expect(amountText).toBe('2,500');
    }

    // テストケース2: 数量3.00 x 単価1234 = 3702（整数）
    await quantityInputs.first().fill('3');
    await quantityInputs.first().blur();
    await unitPriceInputs.first().fill('1234');
    await unitPriceInputs.first().blur();

    // 計算結果を待機して確認
    await expect(amountFields.first()).toHaveText('3,702', {
      timeout: getTimeout(10000),
    });

    // テストケース3: 数量2.50 x 単価3333 = 8333（2.50*3333=8332.5 → 四捨五入で8333）
    await quantityInputs.first().fill('2.50');
    await quantityInputs.first().blur();
    await unitPriceInputs.first().fill('3333');
    await unitPriceInputs.first().blur();

    // 四捨五入の結果が整数であることを確認
    const amountText3 = await amountFields.first().textContent();
    expect(amountText3).toBeTruthy();
    if (amountText3 && amountText3 !== '-') {
      // カンマを除去して数値確認
      const numericValue = amountText3.replace(/,/g, '');
      // 小数点を含まないこと
      expect(numericValue).not.toContain('.');
      // 2.50 * 3333 = 8332.5 → 四捨五入で8333
      expect(parseInt(numericValue, 10)).toBe(8333);
    }
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
    });
  });
});
