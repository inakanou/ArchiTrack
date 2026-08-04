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
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * サマリーパネルの指定ラベルの値セルを返す。
 *
 * サマリーパネルは「ラベル + 値」を1つの `div` に並べた構造なので、
 * ラベルを含む最も内側の `div` がその項目の行にあたる。
 */
function summaryRow(page: Page, label: string): Locator {
  return page
    .locator('[data-testid="summary-panel"] div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();
}

/**
 * 金額テキストから数値（円）を取り出す。"140,000円" → 140000
 */
function parseAmountText(text: string | null): number {
  if (!text) return NaN;
  const matched = text.match(/(-?[\d,]+)/);
  if (!matched) return NaN;
  return Number(matched[1]!.replace(/,/g, ''));
}

/**
 * 見積項目の1行タイプ（見積/実行/業者）に数量と単価を入力する。
 *
 * サマリーパネルは未保存の編集内容から再計算されるため（REQ-27.1）、
 * 保存せずに合計値の検証条件を作り出せる。
 */
async function fillLineAmount(
  page: Page,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  quantity: number,
  unitPrice: number
): Promise<void> {
  const line = page.locator(`[data-testid="line-type-${lineType}"]`).first();
  await expect(line).toBeVisible({ timeout: getTimeout(10000) });
  await line.locator('input[aria-label="数量"]').fill(String(quantity));
  await line.locator('input[aria-label="単価"]').fill(String(unitPrice));
  await line.locator('input[aria-label="単価"]').blur();
}

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

      // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

      // 項目追加ボタンをクリック（「子項目追加」ボタンと区別するためexact指定）
      const addButton = page.getByRole('button', { name: '+ 項目追加' });
      await expect(addButton).toBeVisible({ timeout: getTimeout(10000) });
      await addButton.click();

      // 数量と単価を入力して見積金額を設定
      const quantityInputs = page.locator('input[aria-label="数量"]');
      const unitPriceInputs = page.locator('input[aria-label="単価"]');

      // かつては `if (quantityCount > 0)` と `if (await saveButton.isEnabled())` の
      // 二重ガードで、項目追加が効かなくても「何も入力せず・何も保存せず」に緑だった
      // （実測では 3 件 / true ＝どちらも常に真でガードは不要）。
      // 準備が成立しなければ後続の金額検証がすべて無意味になるので無条件に確定させる
      await expect(quantityInputs.first()).toBeVisible({ timeout: getTimeout(10000) });
      await expect(unitPriceInputs.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 最初の見積行（ESTIMATE）の数量と単価を入力
      await quantityInputs.first().fill('10');
      await unitPriceInputs.first().fill('5000');
      await unitPriceInputs.first().blur();

      // 保存（未保存の変更が実在するので保存ボタンは必ず有効）
      const saveButton = page.getByRole('button', { name: /保存/i });
      await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });

      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await saveButton.click();
      expect((await savePromise).status()).toBe(200);
      await expect(saveButton).toBeDisabled({ timeout: getTimeout(10000) });
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

      // かつてこのテストのセレクタは
      // `select[aria-label*="受領見積書"], [data-testid="quotation-select"]` で、
      // 実DOMの `#quotation-select`（`<label for>` で紐づく）と一致せず
      // **常に不可視**だった（同じ時点で `#quotation-select` は 1 件存在する）。
      // その結果、転記を伴う本体（4重のガードの内側にあり、最内は
      // `expect(tableContent).toBeTruthy()` という恒真に近い主張）は一度も実行されず、
      // 実際には `else` 側の「見積業者列の存在」＝REQ-17.3 の確認だけが走っていた。
      // 17.4 は「転記された業者金額行に受領見積書の業者名を表示する」ことなので、
      // 転記を無条件に実行して業者名の表示そのものを主張する。
      const dialog = page.getByRole('dialog');
      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 準備で作成した受領見積書（選択肢のラベルは `取引先名 - 合計金額`）を選ぶ
      expect(tradingPartnerName).toBeTruthy();
      await expect(quotationSelect.locator('option', { hasText: tradingPartnerName })).toHaveCount(
        1,
        { timeout: getTimeout(10000) }
      );
      await quotationSelect.selectOption({ index: 1 });

      // 明細行は選択時点で全選択される（REQ-35.3）
      const lineCheckboxes = dialog.locator('input[type="checkbox"]');
      await expect(lineCheckboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      const lineCount = await lineCheckboxes.count();
      expect(lineCount).toBeGreaterThan(0);

      // 転記実行
      await dialog.getByRole('button', { name: '転記', exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

      // 転記された業者金額行の「見積業者」列に受領見積書の業者名が表示される（17.4）。
      // 見積業者セルは VENDOR 行で唯一のテキスト（他の列は input の値なので
      // テキストとして現れない）なので、行のテキスト一致で名指しできる
      const vendorRowsWithName = page
        .locator('[data-testid="line-type-VENDOR"]')
        .filter({ hasText: tradingPartnerName });
      await expect(vendorRowsWithName).toHaveCount(lineCount, { timeout: getTimeout(10000) });

      // 転記していない既存の業者金額行には業者名が出ない（列が全行に同じ値を
      // 描いているだけ、という取り違えを排除する）
      const vendorRowsWithoutName = page
        .locator('[data-testid="line-type-VENDOR"]')
        .filter({ hasNotText: tradingPartnerName });
      expect(await vendorRowsWithoutName.count()).toBeGreaterThan(0);
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

      // サマリーパネルのtop座標が基本情報のtop座標より下にあることを確認。
      // 直前の2件で null でないことを確定させているので条件分岐は置かない
      expect(summaryBbox!.y).toBeGreaterThan(basicInfoBbox!.y);
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

      // かつてここは `expect(summaryText).toBeTruthy()` と
      // `expect(summaryText).toContain('見積金額合計')` だけで、前者はパネルが
      // 見えている以上つねに真、後者は直前の `getByText('見積金額合計')` と
      // 同じことを言い直しているにすぎず、**金額そのものは一度も見ていなかった**。
      // 合計が 0 円でも、桁が壊れていても緑になる。
      //
      // 準備4で 数量10 × 単価5,000 の見積金額行を1件だけ保存しているので、
      // 見積金額合計は 50,000 円でなければならない（REQ-20.2）
      await expect(
        page.locator('[aria-label="見積項目テーブル"] [data-testid="line-type-ESTIMATE"]')
      ).toHaveCount(1);
      expect(parseAmountText(await summaryRow(page, '見積金額合計').textContent())).toBe(50000);
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

      // かつてここは「パネル全体のテキストが `%` か `-` を含む」ことしか見ておらず、
      // 恒真だった。パネルには「値引率」もあるので `%` はそちらだけでも成立し、
      // `-` に至っては負数・区切り・ハイフンを含むあらゆる文字列で真になる。
      // 利益率の値が丸ごと欠けても、百分率でなく小数で出ていても緑だった。
      //
      // 百分率表示（REQ-20.5）を実際に主張するため、比率が確定する入力を作る。
      // 見積 10 × 5,000 = 50,000 / 実行 10 × 4,000 = 40,000 なので
      // 利益額 10,000、利益率 10,000 ÷ 50,000 = 20%
      await fillLineAmount(page, 'ESTIMATE', 10, 5000);
      await fillLineAmount(page, 'EXECUTION', 10, 4000);

      await expect(summaryRow(page, '見積金額合計')).toHaveText('見積金額合計50,000円');
      await expect(summaryRow(page, '実行金額合計')).toHaveText('実行金額合計40,000円');
      await expect(summaryRow(page, '利益率')).toHaveText('利益率20%');
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

      // 利益率側と同じく、かつては「パネル全体が `%` か `-` を含む」だけの
      // 恒真判定だった。準備4の時点では業者金額合計が 0 円なので値引率は
      // 「-」表示になり、**百分率表示は一度も検証されていなかった**。
      //
      // 実行 10 × 5,000 = 50,000 / 業者 10 × 4,000 = 40,000 とすると
      // 値引額 10,000、値引率 10,000 ÷ 40,000 = 25%（REQ-20.6）
      await fillLineAmount(page, 'EXECUTION', 10, 5000);
      await fillLineAmount(page, 'VENDOR', 10, 4000);

      await expect(summaryRow(page, '実行金額合計')).toHaveText('実行金額合計50,000円');
      await expect(summaryRow(page, '業者金額合計')).toHaveText('業者金額合計40,000円');
      await expect(summaryRow(page, '値引率')).toHaveText('値引率25%');
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

      // サイドパネルとしての「合計金額パネル」「NET金額計算パネル」「利益率設定パネル」が
      // メインコンテンツの横に配置されていないことを確認する。
      //
      // かつてここは「grid かつ 2カラムなら…」という二重の `if` の内側が
      // **コメントだけ**（アサーション0件）のループで、2カラムのサイドバーが
      // 復活しても何ひとつ検出できなかった。横に何かが居るかどうかは
      // 「見積項目テーブルがコンテナの幅をほぼ使い切っているか」で直接測れる。
      // サイドバーが復活すれば、その幅（数百px）だけテーブルが痩せる。
      // 判定は「主コンテナの直下の子が上から下へ積まれているか」で行う。
      // サイドバーが1枚でも復活すれば、その要素は本文と**縦方向に重なりつつ
      // 横に並ぶ**ため、この並びが崩れる。
      const detailPage = page.locator('[data-testid="estimate-detail-page"]');
      const bands = await detailPage.evaluate((el) =>
        Array.from(el.children)
          .map((child) => {
            const rect = child.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          })
          // 非表示・面積ゼロの要素は積み重ねの判定対象にならない
          .filter((rect) => rect.width > 0 && rect.height > 0)
      );

      expect(bands.length, '主コンテナの直下に表示中の子要素が無い').toBeGreaterThan(1);
      for (let i = 1; i < bands.length; i++) {
        // 直前の帯の下端より下から始まっていること（1px の丸め誤差は許容）
        expect(
          bands[i]!.top,
          `主コンテナの直下 ${i} 番目の要素が直前の要素と横に並んでいる（サイドバー配置）`
        ).toBeGreaterThanOrEqual(bands[i - 1]!.bottom - 1);
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
