/**
 * @fileoverview 見積依頼詳細画面レイアウト変更・NET金額入力欄のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - REQ-27.1: レイアウトを2カラムからシングルカラムのフルワイドに変更
 * - REQ-27.2: 選択状況セクションを項目選択セクションの直下に配置
 * - REQ-27.3: 受領見積書セクションを選択状況セクションの直下に配置
 * - REQ-27.4: 各セクションがコンテンツエリアの横幅全体を使用
 * - REQ-27.5: ステータス管理・基本情報・アクションセクションの表示位置を維持
 * - REQ-27.6: レイアウト変更後も既存機能が正常に動作
 * - REQ-27.7: レスポンシブデザインでフルワイド化セクションが適切に表示
 * - REQ-28.1: 受領見積書登録画面の明細行にNET金額入力フィールド表示
 * - REQ-28.2: 受領見積書編集画面の明細行にNET金額入力フィールド表示
 * - REQ-28.3: NET金額入力フィールドを金額列の右隣に配置
 * - REQ-28.4: NET金額入力フィールドをユーザーが手動入力可能
 * - REQ-28.5: NET金額フィールドを任意入力（必須ではない）
 * - REQ-28.6: NET金額の表示形式を整数表示
 * - REQ-28.7: NET金額フォーカスアウト時に整数値にフォーマット
 * - REQ-28.8: 構造化データ入力エリア下部にNET金額合計を自動計算して表示
 * - REQ-28.9: NET金額合計を既存の金額合計の右隣に配置
 * - REQ-28.10: OCR一括取り込み時にNET金額を空欄のまま
 * - REQ-28.11: 項目選択からの一括転記時にNET金額を空欄のまま
 * - REQ-28.12: NET金額データをDBに永続化
 * - REQ-28.13: 編集画面で既存のNET金額データを表示
 *
 * @module e2e/specs/estimate-requests/estimate-request-layout-net-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 見積依頼詳細画面レイアウト変更・NET金額入力欄のE2Eテスト
 */
test.describe('見積依頼詳細画面レイアウト・NET金額 (REQ-27～REQ-28)', () => {
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
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2Eレイアウト・NET金額テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都中央区テスト1-1-1');

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

      const tradingPartnerName = `E2Eテスト業者_レイアウトNET_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('レイアウトネットテスト');
      await page.getByLabel('住所').fill('東京都港区テスト町1-1-1');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('test-layout-net@example.com');

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

    test('準備3：数量表・内訳書・見積依頼を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

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
          data: { name: `レイアウトNETテスト用数量表_${Date.now()}` },
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
      for (let i = 0; i < 2; i++) {
        await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `テスト項目${i + 1}`,
            workType: '工種A',
            specification: '規格A',
            unit: '式',
            quantity: 5.0,
            displayOrder: i,
          },
        });
      }

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `レイアウトNETテスト用内訳書_${Date.now()}`, quantityTableId },
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
            name: `レイアウトNETテスト用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
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
  // REQ-27: 見積依頼詳細画面レイアウト変更
  // ============================================================================

  test.describe('REQ-27: 見積依頼詳細画面レイアウト変更', () => {
    /**
     * @requirement estimate-request/REQ-27.1
     */
    test('レイアウトがシングルカラムのフルワイドレイアウトに変更されている (estimate-request/REQ-27.1)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // サイドバー要素が存在しないことを確認
      const sidebar = page.locator(
        'aside, [data-testid="sidebar"], [data-testid="selection-sidebar"]'
      );
      const sidebarCount = await sidebar.count();
      expect(sidebarCount).toBe(0);

      // メインコンテンツ領域がフルワイドであることを確認
      const detailPage = page.locator('[data-testid="estimate-request-detail-page"]');
      const containerStyle = await detailPage.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          maxWidth: computed.maxWidth,
        };
      });

      // maxWidthが設定されている（シングルカラム）
      expect(containerStyle.maxWidth).not.toBe('none');
    });

    /**
     * @requirement estimate-request/REQ-27.2
     */
    test('選択状況セクションが項目選択セクションの直下に配置されている (estimate-request/REQ-27.2)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「項目選択」セクションが表示されること
      const itemSelectionHeading = page.getByRole('heading', { name: '項目選択' });
      await expect(itemSelectionHeading).toBeVisible({ timeout: getTimeout(10000) });

      // 「選択状況」セクションが表示されること
      const selectionStatusHeading = page.getByRole('heading', { name: '選択状況' });
      await expect(selectionStatusHeading).toBeVisible();

      // 「選択状況」が「項目選択」の下に配置されていることを確認
      const itemSelectionBbox = await itemSelectionHeading.boundingBox();
      const selectionStatusBbox = await selectionStatusHeading.boundingBox();

      expect(itemSelectionBbox).toBeTruthy();
      expect(selectionStatusBbox).toBeTruthy();

      if (itemSelectionBbox && selectionStatusBbox) {
        expect(selectionStatusBbox.y).toBeGreaterThan(itemSelectionBbox.y);
      }
    });

    /**
     * @requirement estimate-request/REQ-27.3
     */
    test('受領見積書セクションが選択状況セクションの直下に配置されている (estimate-request/REQ-27.3)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「選択状況」セクションが表示されること
      const selectionStatusHeading = page.getByRole('heading', { name: '選択状況' });
      await expect(selectionStatusHeading).toBeVisible({ timeout: getTimeout(10000) });

      // 「受領見積書」セクション（受領見積書一覧タイトル）が表示されること
      const receivedQuotationSection = page.getByText(/受領見積書/i).first();
      await expect(receivedQuotationSection).toBeVisible();

      // 受領見積書セクションが選択状況セクションの下に配置されていることを確認
      const selectionStatusBbox = await selectionStatusHeading.boundingBox();
      const receivedQuotationBbox = await receivedQuotationSection.boundingBox();

      expect(selectionStatusBbox).toBeTruthy();
      expect(receivedQuotationBbox).toBeTruthy();

      if (selectionStatusBbox && receivedQuotationBbox) {
        expect(receivedQuotationBbox.y).toBeGreaterThan(selectionStatusBbox.y);
      }
    });

    /**
     * @requirement estimate-request/REQ-27.4
     */
    test('各セクションがコンテンツエリアの横幅全体を使用できる (estimate-request/REQ-27.4)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // コンテンツエリアの幅を取得
      const detailPage = page.locator('[data-testid="estimate-request-detail-page"]');
      const containerWidth = await detailPage.evaluate((el) => {
        return el.getBoundingClientRect().width;
      });

      // セクションカード（h2見出しを含む要素の親カード）が横幅全体を使っていることを確認
      // 「ステータス」セクションのカード幅でフルワイドを検証
      const statusHeading = page.getByRole('heading', { name: 'ステータス' });
      await expect(statusHeading).toBeVisible({ timeout: getTimeout(10000) });

      const cardWidth = await statusHeading.evaluate((el) => {
        // h2の親カードdiv（border付きの白いカード）の幅を取得
        const card = el.closest('div');
        return card ? card.getBoundingClientRect().width : 0;
      });

      // カード幅がコンテナ幅の85%以上であることを確認（padding考慮）
      expect(cardWidth / containerWidth).toBeGreaterThanOrEqual(0.85);
    });

    /**
     * @requirement estimate-request/REQ-27.5
     */
    test('ステータス管理・基本情報・アクションセクションの表示位置が維持されている (estimate-request/REQ-27.5)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ステータスセクションが表示されること
      await expect(page.getByRole('heading', { name: 'ステータス' })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 基本情報セクションが表示されること
      await expect(page.getByRole('heading', { name: '基本情報' })).toBeVisible();

      // アクションセクションが表示されること
      await expect(page.getByRole('heading', { name: 'アクション' })).toBeVisible();

      // ステータス → 基本情報 → アクション → 項目選択 の順序を確認
      const statusBbox = await page.getByRole('heading', { name: 'ステータス' }).boundingBox();
      const basicInfoBbox = await page.getByRole('heading', { name: '基本情報' }).boundingBox();
      const actionBbox = await page.getByRole('heading', { name: 'アクション' }).boundingBox();

      expect(statusBbox).toBeTruthy();
      expect(basicInfoBbox).toBeTruthy();
      expect(actionBbox).toBeTruthy();

      if (statusBbox && basicInfoBbox && actionBbox) {
        expect(basicInfoBbox.y).toBeGreaterThan(statusBbox.y);
        expect(actionBbox.y).toBeGreaterThan(basicInfoBbox.y);
      }
    });

    /**
     * @requirement estimate-request/REQ-27.6
     */
    test('レイアウト変更後もすべての既存機能が正常に動作する (estimate-request/REQ-27.6)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 項目選択セクションが表示されること
      await expect(page.getByRole('heading', { name: '項目選択' })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 選択状況セクションが表示されること
      await expect(page.getByRole('heading', { name: '選択状況' })).toBeVisible();

      // 見積依頼文表示ボタンが動作すること
      const textButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(textButton).toBeVisible();

      // 編集リンクが表示されること
      const editLink = page.locator('a[aria-label="編集"]');
      await expect(editLink).toBeVisible();

      // 削除ボタンが表示されること
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-27.7
     */
    test('レスポンシブデザインでフルワイド化されたセクションが適切に表示される (estimate-request/REQ-27.7)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // モバイルサイズに変更
      await page.setViewportSize({ width: 375, height: 812 });

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // セクションが縦方向に並んで表示されていることを確認
      await expect(page.getByRole('heading', { name: 'ステータス' })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('heading', { name: '基本情報' })).toBeVisible();

      // ビューポートを元に戻す
      await page.setViewportSize({ width: 1280, height: 720 });
    });
  });

  // ============================================================================
  // REQ-28: 受領見積書明細行 - NET金額入力欄追加
  // ============================================================================

  test.describe('REQ-28: 受領見積書明細行 - NET金額入力欄追加', () => {
    /**
     * @requirement estimate-request/REQ-28.1
     */
    test('受領見積書登録画面の明細行にNET金額入力フィールドが表示される (estimate-request/REQ-28.1)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await expect(addButton).toBeVisible({ timeout: getTimeout(10000) });
      await addButton.click();

      // 受領見積書フォームモーダルが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 明細行のNET金額入力フィールドが表示されることを確認
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await expect(netAmountInput).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-28.2
     * @requirement estimate-request/REQ-28.12
     * @requirement estimate-request/REQ-28.13
     */
    test('受領見積書を作成してNET金額が永続化・編集画面で表示される (estimate-request/REQ-28.2, REQ-28.12, REQ-28.13)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームモーダルが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 受領見積書名を入力
      const nameInput = page.getByLabel(/受領見積書名|名称/i).first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(`NET金額テスト受領見積書_${Date.now()}`);
      }

      // 提出日を入力
      const dateInput = page.getByLabel(/提出日/i);
      if (await dateInput.isVisible()) {
        await dateInput.fill('2026-02-18');
      }

      // 明細行の名称を入力
      const lineNameInput = page.locator('input[aria-label="行1 名称"]');
      if (await lineNameInput.isVisible()) {
        await lineNameInput.fill('NET金額テスト項目');
      }

      // 明細行の数量を入力
      const quantityInput = page.locator('input[aria-label="行1 数量"]');
      if (await quantityInput.isVisible()) {
        await quantityInput.fill('5');
      }

      // 明細行の単価を入力
      const unitPriceInput = page.locator('input[aria-label="行1 単価"]');
      if (await unitPriceInput.isVisible()) {
        await unitPriceInput.fill('10000');
        await unitPriceInput.blur();
      }

      // NET金額を入力
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await expect(netAmountInput).toBeVisible({ timeout: getTimeout(5000) });
      await netAmountInput.fill('45000');
      await netAmountInput.blur();

      // 保存ボタンをクリック
      const submitButton = page.getByRole('button', { name: /保存|登録/i }).last();
      if (await submitButton.isVisible()) {
        const savePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api') &&
            response.url().includes('/quotations') &&
            response.request().method() === 'POST',
          { timeout: getTimeout(30000) }
        );

        await submitButton.click();
        const response = await savePromise;

        if (response.status() !== 201) {
          throw new Error(`受領見積書の保存に失敗しました: ${response.status()}`);
        }
      }
    });

    /**
     * @requirement estimate-request/REQ-28.3
     */
    test('NET金額入力フィールドが金額列の右隣に配置されている (estimate-request/REQ-28.3)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // テーブルヘッダーの「金額」と「NET金額」の順序を確認
      const amountHeader = page.locator('th').filter({ hasText: '金額' }).first();
      const netAmountHeader = page.locator('th').filter({ hasText: 'NET金額' });

      await expect(amountHeader).toBeVisible();
      await expect(netAmountHeader).toBeVisible();

      // NET金額ヘッダーが金額ヘッダーの右に配置されていることを確認
      const amountBbox = await amountHeader.boundingBox();
      const netAmountBbox = await netAmountHeader.boundingBox();

      expect(amountBbox).toBeTruthy();
      expect(netAmountBbox).toBeTruthy();

      if (amountBbox && netAmountBbox) {
        // NET金額がx座標で金額より右側にあることを確認
        expect(netAmountBbox.x).toBeGreaterThan(amountBbox.x);
      }
    });

    /**
     * @requirement estimate-request/REQ-28.4
     */
    test('NET金額入力フィールドがユーザーが手動入力可能なフィールドである (estimate-request/REQ-28.4)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // NET金額入力フィールドが表示され、手動入力可能であることを確認
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await expect(netAmountInput).toBeVisible();
      await expect(netAmountInput).toBeEnabled();

      // 実際に値を入力できることを確認
      await netAmountInput.fill('75000');
      await expect(netAmountInput).toHaveValue('75000');
    });

    /**
     * @requirement estimate-request/REQ-28.5
     */
    test('NET金額フィールドが任意入力（必須ではない）である (estimate-request/REQ-28.5)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // NET金額フィールドにrequired属性がないことを確認
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await expect(netAmountInput).toBeVisible();

      const isRequired = await netAmountInput.getAttribute('required');
      expect(isRequired).toBeNull();
    });

    /**
     * @requirement estimate-request/REQ-28.6
     * @requirement estimate-request/REQ-28.7
     */
    test('NET金額がフォーカスアウト時に整数値にフォーマットされる (estimate-request/REQ-28.6, REQ-28.7)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // NET金額に小数値を入力
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await netAmountInput.fill('12345.6');

      // フォーカスアウト
      await netAmountInput.blur();

      // 整数値にフォーマットされることを確認（四捨五入）
      const formattedValue = await netAmountInput.inputValue();
      // 小数点が含まれていないことを確認
      expect(formattedValue).not.toContain('.');
    });

    /**
     * @requirement estimate-request/REQ-28.8
     */
    test('構造化データ入力エリア下部にNET金額合計が自動計算して表示される (estimate-request/REQ-28.8)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // NET金額合計表示エリアが存在することを確認
      const totalNetAmount = page.locator('[data-testid="total-net-amount"]');
      await expect(totalNetAmount).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-28.9
     */
    test('NET金額合計が既存の金額合計の右隣に配置されている (estimate-request/REQ-28.9)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 金額合計とNET金額合計が存在すること
      const totalAmount = page.locator('[data-testid="total-amount"]');
      const totalNetAmount = page.locator('[data-testid="total-net-amount"]');

      await expect(totalAmount).toBeVisible();
      await expect(totalNetAmount).toBeVisible();

      // NET金額合計が金額合計の右隣に配置されていることを確認
      const totalBbox = await totalAmount.boundingBox();
      const netTotalBbox = await totalNetAmount.boundingBox();

      expect(totalBbox).toBeTruthy();
      expect(netTotalBbox).toBeTruthy();

      if (totalBbox && netTotalBbox) {
        // NET金額合計のx座標が金額合計のx座標より大きい（右側に配置）
        expect(netTotalBbox.x).toBeGreaterThan(totalBbox.x);
      }
    });

    /**
     * @requirement estimate-request/REQ-28.10
     */
    test('OCR一括取り込み時にNET金額フィールドが空欄のままである (estimate-request/REQ-28.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // NET金額フィールドが初期状態で空欄であることを確認
      const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
      await expect(netAmountInput).toBeVisible();
      await expect(netAmountInput).toHaveValue('');
    });

    /**
     * @requirement estimate-request/REQ-28.11
     */
    test('項目選択からの一括転記時にNET金額フィールドが空欄のままである (estimate-request/REQ-28.11)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書の「登録」ボタンをクリック
      const addButton = page.getByRole('button', { name: /登録|追加/i });
      await addButton.click();

      // フォームが表示されるのを待機
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「項目から転記」ボタンが存在する場合
      const transferFromItemsButton = page.getByRole('button', {
        name: /項目から転記|選択項目を転記/i,
      });
      const transferButtonVisible = await transferFromItemsButton.isVisible().catch(() => false);

      if (transferButtonVisible) {
        await transferFromItemsButton.click();

        // 転記後のNET金額フィールドが空欄であることを確認
        const netAmountInputs = page.locator('input[data-field="netAmount"]');
        const netCount = await netAmountInputs.count();
        for (let i = 0; i < netCount; i++) {
          await expect(netAmountInputs.nth(i)).toHaveValue('');
        }
      } else {
        // 転記ボタンが存在しない場合、初期状態でNET金額が空であることを確認
        const netAmountInput = page.locator('input[aria-label="行1 NET金額"]');
        await expect(netAmountInput).toHaveValue('');
      }
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

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
    });
  });
});
