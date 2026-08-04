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
 * - REQ-32.1: 出力ダイアログに行タイプ選択チェックボックス（複数選択可能）
 * - REQ-32.2: チェックされた行タイプごとに独立したファイルを生成する
 * - REQ-32.5: チェックされていない行タイプのファイルを出力しない
 * - REQ-32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 *
 * Task 56.10: 出力エンドポイント `GET /api/estimates/:id/export` を撤去し、
 * 帳票（PDF）と表計算（Excel）はフロントエンドが編集中のツリーから生成するようになった。
 * 旧「出力APIがlineTypesパラメータを受け付ける」はエンドポイントごと消えたため、
 * 「サーバーへ出力を依頼せずに生成が完結する」検証へ移行した。
 *
 * @module e2e/specs/estimate/estimate-features-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { flattenEstimateItems, getEstimateItemTree } from '../../helpers/estimate-draft';

/**
 * 見積書機能追加のE2Eテスト
 */
test.describe('見積書機能追加 (REQ-25～REQ-34)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let accessToken: string = '';
  /** 協力業者名。転記された業者金額行の `sourceVendorName` と受領見積書の照合キーになる */
  let tradingPartnerName: string = '';
  /** 受領見積書に登録するNET金額（REQ-31.2 の表示対象） */
  const RECEIVED_QUOTATION_NET_AMOUNT = 180000;
  /** 受領見積書の合計金額（明細 100000 + 2×50000 / REQ-31.1 の表示対象） */
  const RECEIVED_QUOTATION_TOTAL_AMOUNT = 200000;

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

      tradingPartnerName = `E2Eテスト業者_機能テスト_${Date.now()}`;
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
            // REQ-31.2 が表示対象とする「受領見積書登録画面で入力したNET金額」。
            // これが無いと NET案分ダイアログのNET金額欄そのものが描画されず、
            // 31.2 は前提を欠いたまま何も検証できない
            netAmount: String(RECEIVED_QUOTATION_NET_AMOUNT),
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

      // 直前の2件で null でないことを確定させているので、位置関係の主張は無条件に置く
      // （`if (a && b)` の形だと、型の絞り込みなのか検証の省略なのかが読めない）
      expect(transferBbox!.y).toBeGreaterThan(summaryBbox!.y + summaryBbox!.height - 5);
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

      // 編集モード切替不要で入力フィールドが直接操作可能であることを確認。
      // かつては `if (count > 0)` / `if (unitPriceCount > 0)` の二重ガードで、
      // 欄が1つも無ければ何も検証せずに緑になった（実測ではどちらも常に 9 件＝
      // ガードは常に真で不要だった）ので、条件を外して無条件に主張する
      const quantityInputs = page.locator('input[aria-label="数量"]');
      const unitPriceInputs = page.locator('input[aria-label="単価"]');
      await expect(quantityInputs.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 数量・単価フィールドが直接編集可能（enabled）であることを確認
      await expect(quantityInputs.first()).toBeEnabled();
      await expect(unitPriceInputs.first()).toBeEnabled();

      // 「即座に編集可能」＝実際に打ち込んだ値がその場で入力欄に載る
      await quantityInputs.first().fill('7');
      await expect(quantityInputs.first()).toHaveValue('7');
      await unitPriceInputs.first().fill('1200');
      await expect(unitPriceInputs.first()).toHaveValue('1200');
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

      // 数量フィールドに値を入力して変更を作成。
      // かつては `if (count > 0)` のガードで囲まれ、欄が消えれば保存の検証ごと
      // 素通りした（実測では常に 9 件＝ガードは不要）
      const quantityInputs = page.locator('input[aria-label="数量"]');
      await expect(quantityInputs.first()).toBeVisible({ timeout: getTimeout(10000) });

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
      expect(response.status()).toBe(200);

      // 保存後は未保存の変更が無くなる
      await expect(saveButton).toBeDisabled({ timeout: getTimeout(10000) });

      // クライアントサイドの変更が実際にデータベースへ反映されている（27.3）。
      // 画面の表示ではなくサーバーが返す値で確認するので、ローカル state を
      // 見ているだけという取り違えが起こらない
      const savedTree = await getEstimateItemTree(page.request, accessToken, createdEstimateId!);
      const savedQuantities = flattenEstimateItems(savedTree).flatMap((item) =>
        item.lines.filter((line) => line.lineType === 'ESTIMATE').map((line) => line.quantity)
      );
      expect(savedQuantities).toContain(99);
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

      // VENDOR行が表示されていることを確認。
      // かつては `if (initialVendorCount > 0)` のガードで、行が1件も無ければ
      // 「チェックを外す」だけして何も検証せずに緑になった（実測では常に 3 件）
      const vendorRows = page.locator('[data-testid="line-type-VENDOR"]');
      await expect(vendorRows.first()).toBeVisible({ timeout: getTimeout(10000) });
      const initialVendorCount = await vendorRows.count();
      expect(initialVendorCount).toBeGreaterThan(0);

      // 「業者」チェックボックスを外す
      const vendorCheckbox = page
        .locator('label')
        .filter({ hasText: '業者' })
        .locator('input[type="checkbox"]');
      await vendorCheckbox.uncheck();

      // 該当する行タイプの行が「すべて」非表示になる（28.3）
      await expect(vendorRows).toHaveCount(0, { timeout: getTimeout(5000) });

      // チェックボックスを元に戻すと同じ件数に戻る
      await vendorCheckbox.check();
      await expect(vendorRows).toHaveCount(initialVendorCount, { timeout: getTimeout(5000) });
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

      // かつてこのテストは行数を「チェックを外した後」に数えていた。フィルターは
      // 非表示の行をDOMから取り除くため、実測値は**常に 0** で
      // `if (executionCount > 0)` の内側は一度も実行されず、表示/非表示の切替を
      // 何ひとつ検証しないまま緑になっていた。件数は外す前に確定させる。
      const executionRows = page.locator('[data-testid="line-type-EXECUTION"]');
      await expect(executionRows.first()).toBeVisible({ timeout: getTimeout(10000) });
      const executionCount = await executionRows.count();
      expect(executionCount).toBeGreaterThan(0);

      // 「実行」チェックボックスを外す
      const executionCheckbox = page
        .locator('label')
        .filter({ hasText: '実行' })
        .locator('input[type="checkbox"]');
      await executionCheckbox.uncheck();

      // EXECUTION行がすべて非表示になることを確認
      await expect(executionRows).toHaveCount(0, { timeout: getTimeout(5000) });

      // 「実行」チェックボックスを再度チェックすると、該当行がすべて再表示される（28.4）
      await executionCheckbox.check();
      await expect(executionRows).toHaveCount(executionCount, { timeout: getTimeout(5000) });
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

      // 保存。かつては `if (await saveButton.isEnabled())` で囲まれており、
      // 子項目の追加が効かず未保存の変更が生じなくても黙って素通りしていた
      // （実測では常に true）。REQ-29 の各テストはこの親子構造が保存されている
      // ことを前提にするので、保存できなければここで落とす
      const saveButton = page.getByRole('button', { name: /^保存$/i });
      await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });

      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await saveButton.click();
      expect((await savePromise).status()).toBe(200);

      // 子を持つ親項目が実際に保存されている（29.1 / 29.3 の前提）
      const savedTree = await getEstimateItemTree(page.request, accessToken, createdEstimateId!);
      expect(savedTree.some((item) => item.children.length > 0)).toBe(true);
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

      // 親項目（子項目を持つ項目）の単価フィールドが編集不可であることを確認。
      //
      // かつてのセレクタ `button[aria-label*="展開"], button[aria-label*="折りたたみ"]` は
      // 実DOMの `展開する` / `折りたたむ` と一致せず、実測で**常に0件**だった
      // （同じ時点で実セレクタは 1 件を返す＝親項目は存在する）。内側の
      // `if (parentUnitPriceCount > 0)` も、親項目の単価はそもそも `<input>` で
      // 描かれないため二重に成立しない。実DOMに合わせ、無条件に主張する。
      const parentToggles = page.locator(
        'button[aria-label="折りたたむ"], button[aria-label="展開する"]'
      );
      await expect(parentToggles.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 展開/折りたたみボタンを持つ行＝子項目を持つ親項目
      const parentRow = parentToggles.first().locator('..');
      const parentEstimateLine = parentRow.getByTestId('line-type-ESTIMATE').first();

      // 単価は入力欄として提供されない（＝編集不可 / 29.1）
      await expect(parentEstimateLine.locator('input[aria-label="単価"]')).toHaveCount(0);
      // 単価は表示専用の要素として存在する
      await expect(parentEstimateLine.locator('[aria-label="単価"]')).toHaveCount(1);

      // 対照：子を持たない項目では単価が入力欄として提供される
      // （「どの行でも単価が入力欄でない」という別の理由で緑にならないことを固定する）
      const leafRow = page
        .locator(
          '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])'
        )
        .filter({ hasNot: page.locator('button[aria-label="折りたたむ"]') })
        .filter({ hasNot: page.locator('button[aria-label="展開する"]') })
        .first();
      await expect(
        leafRow.getByTestId('line-type-ESTIMATE').first().locator('input[aria-label="単価"]')
      ).toHaveCount(1);
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

      // かつてここは「テーブルのテキストが空でない」（＝ヘッダー行があるだけで真）
      // という恒真の1行しかなく、29.2 が言う「子項目の金額合計を親項目の金額として
      // 自動計算する」ことは**一度も検証されていなかった**。親の金額が 0 のままでも、
      // 子と無関係な値でも緑になる。
      //
      // 準備で作った「子を持つ親」を API のツリーから名指しし、子の金額を変えると
      // 親の金額がその合計に追随することを確かめる。
      const tree = await getEstimateItemTree(page.request, accessToken, createdEstimateId!);
      const parent = tree.find((item) => item.children.length > 0);
      expect(parent, '準備で作った「子を持つ親項目」がツリーに無い').toBeDefined();
      expect(parent!.children.length).toBeGreaterThan(0);

      const parentAmountField = page
        .getByTestId(`estimate-item-${parent!.id}`)
        .getByTestId('line-type-ESTIMATE')
        .first()
        .getByTestId('amount-field');

      // 子ごとに異なる単価を入れる（全子の合計であって「最初の子だけ」でないことを固定する）
      let expectedTotal = 0;
      for (const [index, child] of parent!.children.entries()) {
        const quantity = 2;
        const unitPrice = 3000 * (index + 1);
        const childEstimateLine = page
          .getByTestId(`estimate-item-${child.id}`)
          .getByTestId('line-type-ESTIMATE')
          .first();
        await expect(childEstimateLine).toBeVisible({ timeout: getTimeout(10000) });
        await childEstimateLine.locator('input[aria-label="数量"]').fill(String(quantity));
        await childEstimateLine.locator('input[aria-label="単価"]').fill(String(unitPrice));
        await childEstimateLine.locator('input[aria-label="単価"]').blur();
        expectedTotal += quantity * unitPrice;
      }

      // 親の金額＝子の金額合計（29.2）
      await expect(parentAmountField).toHaveText(`${expectedTotal.toLocaleString('en-US')}`, {
        timeout: getTimeout(10000),
      });

      // 子を1件だけ変えると親も追随する（初回だけ偶然一致した、を排除する）
      const firstChildEstimateLine = page
        .getByTestId(`estimate-item-${parent!.children[0]!.id}`)
        .getByTestId('line-type-ESTIMATE')
        .first();
      await firstChildEstimateLine.locator('input[aria-label="単価"]').fill('9000');
      await firstChildEstimateLine.locator('input[aria-label="単価"]').blur();
      const updatedTotal = expectedTotal - 2 * 3000 + 2 * 9000;
      await expect(parentAmountField).toHaveText(`${updatedTotal.toLocaleString('en-US')}`, {
        timeout: getTimeout(10000),
      });
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

      // 29.1 と同じ理由（実DOMと一致しないセレクタ）で、かつては
      // `if (expandCount > 0)` の内側が一度も実行されていなかった。しかも内側は
      // 「画面のどこかの名称欄が enabled」を見るだけで、親項目の欄ではなかった。
      // 親項目の行に絞って、単価以外の5項目が編集可能であることを主張する。
      const parentToggles = page.locator(
        'button[aria-label="折りたたむ"], button[aria-label="展開する"]'
      );
      await expect(parentToggles.first()).toBeVisible({ timeout: getTimeout(10000) });

      const parentEstimateLine = parentToggles
        .first()
        .locator('..')
        .getByTestId('line-type-ESTIMATE')
        .first();

      // 名称・規格・単位・数量・備考は手動編集可能（29.3）
      for (const label of ['名称', '規格', '単位', '数量', '備考']) {
        const field = parentEstimateLine.locator(`input[aria-label="${label}"]`);
        await expect(field, `親項目の「${label}」が編集可能でない`).toHaveCount(1);
        await expect(field).toBeEnabled();
      }

      // 実際に打ち込めることまで見る（enabled だが値を受け付けない実装を排除する）
      const parentNameInput = parentEstimateLine.locator('input[aria-label="名称"]');
      await parentNameInput.fill('親項目名称編集確認');
      await expect(parentNameInput).toHaveValue('親項目名称編集確認');

      // 単価だけは手動編集の対象外（29.1 と表裏）
      await expect(parentEstimateLine.locator('input[aria-label="単価"]')).toHaveCount(0);
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

      // 30.2 は「既存項目ごとに」選択肢を出すことを求めるので、先に既存項目を
      // API のツリーから確定させる（画面の折りたたみ状態に左右されないため）
      const tree = await getEstimateItemTree(page.request, accessToken, createdEstimateId!);
      // 値引き行・注記行は転記先になれない（`canHostTransferredItem`）ので除く
      const existingItems = flattenEstimateItems(tree).filter(
        (item) => item.itemType !== 'DISCOUNT' && item.itemType !== 'NOTE'
      );
      expect(existingItems.length, '転記先になれる既存の見積項目が1件も無い').toBeGreaterThan(0);

      // 転記ダイアログを開く
      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 転記先選択ドロップダウンを確認
      const targetSelect = page.locator('#target-select');
      await expect(targetSelect).toBeVisible({ timeout: getTimeout(5000) });

      // かつてここは `expect(childOptionCount).toBeGreaterThanOrEqual(0)` で、
      // `count()` は定義上つねに 0 以上なので**何を数えても緑**だった。
      // 子項目オプションが1件も出なくても、既存項目の一部しか出なくても通る。
      //
      // 既存項目の件数と一致すること（＝「既存項目ごとに」提供されること）を主張する
      const childOptions = targetSelect.locator('option').filter({ hasText: /の子項目として作成/ });
      await expect(childOptions).toHaveCount(existingItems.length, {
        timeout: getTimeout(10000),
      });

      // 選択肢のラベルが「＜既存項目名＞ の子項目として作成」の形になっている
      // （名称が空の項目は画面側で `(名称なし)` に置き換わる）
      for (const item of existingItems) {
        const itemName =
          item.lines.find((line) => line.lineType === 'ESTIMATE')?.name || '(名称なし)';
        await expect(
          targetSelect.locator('option').filter({ hasText: `${itemName} の子項目として作成` }),
          `「${itemName} の子項目として作成」の選択肢が無い`
        ).not.toHaveCount(0);
      }

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

      // かつては `if (quotationOptions > 1)` と `if (childOptionCount > 0)` の
      // 二重ガードだった（実測ではそれぞれ 2 件・5 件で常に真＝条件が不要）。
      // 前提が欠ければ落ちるよう、件数そのものを主張してから操作する
      const quotationOptions = await quotationSelect.locator('option').count();
      expect(quotationOptions).toBeGreaterThan(1);

      // 受領見積書を選択
      await quotationSelect.selectOption({ index: 1 });

      // 転記先選択で子項目オプションが提供される（30.2）
      const targetSelect = page.locator('#target-select');
      const childOptions = targetSelect.locator('option').filter({ hasText: /の子項目として作成/ });
      await expect(childOptions.first()).toBeAttached({ timeout: getTimeout(10000) });

      // 最初の子項目オプションを選択
      await targetSelect.selectOption({ index: 1 });

      // 選択されたオプションのテキストに「の子項目として作成」が含まれることを確認
      const selectedText = await targetSelect.locator('option:checked').textContent();
      expect(selectedText).toContain('の子項目として作成');

      // 実際に「子項目として」転記されることまで見る（30.3）。
      // 明細行は受領見積書を選んだ時点で全選択される（REQ-35.3）ので、
      // 転記される件数はチェック済みの件数と一致する
      const dialog = page.getByRole('dialog');
      const lineCheckboxes = dialog.locator('input[type="checkbox"]');
      await expect(lineCheckboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      const lineCount = await lineCheckboxes.count();
      expect(lineCount).toBeGreaterThan(0);
      for (let i = 0; i < lineCount; i++) {
        await expect(lineCheckboxes.nth(i)).toBeChecked();
      }

      const rows = page.locator(
        '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])'
      );
      const beforeItemCount = await rows.count();

      await dialog.getByRole('button', { name: '転記', exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

      // 選択した明細行の数だけ項目が増える
      await expect(rows).toHaveCount(beforeItemCount + lineCount, { timeout: getTimeout(10000) });

      // 追加された行（未保存なので行キーは `tmp-`）はルートではなく子として置かれる。
      // ツリー表示のインデントは `深さ × 16px` なので、0px ならルート＝
      // 「新規項目として作成」になってしまっており 30.3 を満たさない
      const addedRows = page.locator(
        '[aria-label="見積項目テーブル"] [data-estimate-row-key^="tmp-"]'
      );
      await expect(addedRows).toHaveCount(lineCount, { timeout: getTimeout(10000) });
      for (let i = 0; i < lineCount; i++) {
        const childIndent = await addedRows
          .nth(i)
          .evaluate((el) => (el as HTMLElement).style.paddingLeft);
        expect(Number.parseFloat(childIndent)).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // REQ-31: NET案分ダイアログの受領見積書情報表示
  // ============================================================================

  test.describe('REQ-31: NET案分ダイアログの受領見積書情報表示', () => {
    /**
     * テスト準備：受領見積書を業者金額行へ実際に転記して保存する
     *
     * NET案分ダイアログの受領見積書情報セクションは、業者金額行に残る
     * `sourceVendorName` から受領見積書を引き当てて描画される
     * （`NetAllocationDialog.tsx` の照合キーは「協力業者名 ?? 受領見積書名」）。
     * 転記が一度も行われていない見積書では対象業者の選択肢が「選択してください」
     * だけになり、実測でも `#vendor-select` の option は**常に1件**だった。
     * その状態では 31.1 / 31.2 の内側は永久に実行されないため、前提をここで作る。
     */
    test('準備：受領見積書を業者金額行へ転記して保存する', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(tradingPartnerName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(10000) });
      await quotationSelect.selectOption({ index: 1 });

      // 受領見積書の明細行は選択時点で全選択される（REQ-35.3）
      const lineCheckboxes = dialog.locator('input[type="checkbox"]');
      await expect(lineCheckboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      const lineCount = await lineCheckboxes.count();
      expect(lineCount).toBeGreaterThan(0);
      for (let i = 0; i < lineCount; i++) {
        await expect(lineCheckboxes.nth(i)).toBeChecked();
      }

      await dialog.getByRole('button', { name: '転記', exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

      // 転記結果を保存して確定する
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/i }).click();
      expect((await savePromise).status()).toBe(200);

      // 業者金額行に協力業者名が `sourceVendorName` として載っていることを確認する。
      // ここが空だと NET案分ダイアログの対象業者が作られない
      const savedTree = await getEstimateItemTree(page.request, accessToken, createdEstimateId!);
      const vendorNames = flattenEstimateItems(savedTree)
        .flatMap((item) => item.lines)
        .filter((line) => line.lineType === 'VENDOR')
        .map((line) => line.sourceVendorName);
      expect(vendorNames).toContain(tradingPartnerName);
    });

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

      // かつては `if (vendorOptions > 1)` の内側に
      // `const isInfoVisible = ...; if (isInfoVisible) { await expect(...).toBeVisible(); }`
      // という**恒真アサーション**が置かれていた（真のときだけ入るブロックの中で
      // 同じ条件が真であることを主張しており、何も検証していない）。しかも実測では
      // `vendorOptions` は**常に1件**で内側は一度も実行されていなかった。
      // 前提は上の準備テストが作るので、ここでは無条件に主張する。
      await expect(vendorSelect.locator('option')).toHaveCount(2, { timeout: getTimeout(10000) });
      await vendorSelect.selectOption(tradingPartnerName);

      // 受領見積書情報セクションに「合計金額」が**その値ごと**表示される（31.1）
      const quotationInfoGrid = page.getByTestId('quotation-info-grid');
      await expect(quotationInfoGrid).toBeVisible({ timeout: getTimeout(10000) });
      await expect(quotationInfoGrid.getByText('受領見積書合計金額')).toBeVisible();
      await expect(
        quotationInfoGrid.getByText(`${RECEIVED_QUOTATION_TOTAL_AMOUNT.toLocaleString('ja-JP')}円`)
      ).toBeVisible();

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

      // 31.1 と同型の恒真アサーション（`if (isNetVisible) { expect(...).toBeVisible() }`）を
      // 撤去し、値と並び順まで主張する
      await expect(vendorSelect.locator('option')).toHaveCount(2, { timeout: getTimeout(10000) });
      await vendorSelect.selectOption(tradingPartnerName);

      const quotationInfoGrid = page.getByTestId('quotation-info-grid');
      await expect(quotationInfoGrid).toBeVisible({ timeout: getTimeout(10000) });
      await expect(quotationInfoGrid.getByText('NET金額（受領見積書入力値）')).toBeVisible();
      await expect(
        quotationInfoGrid.getByText(`${RECEIVED_QUOTATION_NET_AMOUNT.toLocaleString('ja-JP')}円`)
      ).toBeVisible();

      // 「受領見積書合計金額の下に」縦並びで表示される（31.2）
      const totalBox = await quotationInfoGrid
        .getByText('受領見積書合計金額')
        .boundingBox({ timeout: getTimeout(5000) });
      const netBox = await quotationInfoGrid
        .getByText('NET金額（受領見積書入力値）')
        .boundingBox({ timeout: getTimeout(5000) });
      expect(totalBox).toBeTruthy();
      expect(netBox).toBeTruthy();
      expect(netBox!.y).toBeGreaterThan(totalBox!.y);

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
    test('出力ダイアログに「見積」「実行」「業者」チェックボックスが選択可能 (estimate-creation/REQ-32.1)', async ({
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

      // 出力対象チェックボックスが存在することを確認
      const estimateCheckbox = page.locator('input[type="checkbox"][value="ESTIMATE"]');
      const executionCheckbox = page.locator('input[type="checkbox"][value="EXECUTION"]');
      const vendorCheckbox = page.locator('input[type="checkbox"][value="VENDOR"]');

      await expect(estimateCheckbox).toBeVisible();
      await expect(executionCheckbox).toBeVisible();
      await expect(vendorCheckbox).toBeVisible();

      // デフォルトで「見積」と「実行」がON（REQ-38.1）
      await expect(estimateCheckbox).toBeChecked();
      await expect(executionCheckbox).toBeChecked();
      await expect(vendorCheckbox).not.toBeChecked();

      // 各チェックボックスが選択可能であることを確認（複数同時選択可能）
      await vendorCheckbox.click();
      await expect(vendorCheckbox).toBeChecked();
      await expect(estimateCheckbox).toBeChecked(); // 見積も引き続きON
      await expect(executionCheckbox).toBeChecked(); // 実行も引き続きON

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-32.2
     * @requirement estimate-creation/REQ-32.5
     *
     * 出力はフロントエンドで生成されるようになった（Task 56.10）。
     * 「どの行タイプが出力対象になったか」はリクエストURLではなく、
     * **実際にダウンロードされたファイル**で確かめる。
     * ファイル名は「{見積名}_{行タイプのラベル}.pdf」（32.6）なので、
     * 見積名に「見積」「実行」の語が含まれていても末尾のラベルで判別できる。
     */
    test('チェックした行タイプのファイルだけがダウンロードされる (estimate-creation/REQ-32.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ダウンロードされたファイル名をすべて記録する
      const downloadedFileNames: string[] = [];
      page.on('download', (download) => {
        downloadedFileNames.push(download.suggestedFilename());
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // デフォルトの「見積」チェックを外す
      const estimateCheckbox = page.locator('input[type="checkbox"][value="ESTIMATE"]');
      await estimateCheckbox.uncheck();

      // 「実行」をチェック
      const executionCheckbox = page.locator('input[type="checkbox"][value="EXECUTION"]');
      await executionCheckbox.check();
      await expect(executionCheckbox).toBeChecked();

      // 「業者」はデフォルトでOFFのまま
      const vendorCheckbox = page.locator('input[type="checkbox"][value="VENDOR"]');
      await expect(vendorCheckbox).not.toBeChecked();

      // PDF形式を選択
      const pdfRadio = page.locator('input[type="radio"][name="export-format"][value="pdf"]');
      await pdfRadio.click();

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // 全ファイルの生成とダウンロードが終わるとダイアログが閉じる
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: getTimeout(60000) });

      // REQ-32.2: チェックした「実行」のファイルが1つ生成される
      expect(downloadedFileNames).toHaveLength(1);
      expect(downloadedFileNames[0]).toMatch(/_実行\.pdf$/);

      // REQ-32.5: チェックしていない行タイプのファイルは出力されない
      expect(downloadedFileNames.some((name) => /_見積\.pdf$/.test(name))).toBe(false);
      expect(downloadedFileNames.some((name) => /_業者\.pdf$/.test(name))).toBe(false);
    });

    /**
     * @requirement estimate-creation/REQ-32.6
     *
     * ファイル名への行タイプラベル付与は現行の requirements.md では 32.6
     * （旧タグの 32.3 は「見積→実行→業者の順に逐次ダウンロードする」に変わった。
     * 32.3 の順序検証は Task 56.12 が担当する）。
     *
     * 旧テストは「最初にダウンロードされた1ファイル」だけを見て「業者」を期待していた。
     * 出力がバックエンド生成だった頃はチェックした行タイプを1ファイルに束ねていたので
     * それで足りたが、現行の 32.2 は**行タイプごとに独立したファイル**を生成するため、
     * 「見積を外して業者を足す」と実行・業者の2ファイルが出て最初の1つは実行になる。
     * 32.6 は「各出力ファイル名に**当該ファイルの**行タイプのラベルを含める」なので、
     * ダウンロードされた全ファイルを集めて1つずつ照合する形へ移行した。
     */
    test('出力ファイル名に当該ファイルの行タイプのラベルが含まれる (estimate-creation/REQ-32.6)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ダウンロードされたファイル名をすべて記録する
      const downloadedFileNames: string[] = [];
      page.on('download', (download) => {
        downloadedFileNames.push(download.suggestedFilename());
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // デフォルトの「見積」チェックを外す
      const estimateCheckbox = page.locator('input[type="checkbox"][value="ESTIMATE"]');
      await estimateCheckbox.uncheck();

      // 「実行」はデフォルトでON、「業者」を足して2つの行タイプを対象にする
      const executionCheckbox = page.locator('input[type="checkbox"][value="EXECUTION"]');
      await expect(executionCheckbox).toBeChecked();
      const vendorCheckbox = page.locator('input[type="checkbox"][value="VENDOR"]');
      await vendorCheckbox.check();

      // Excel形式を選択（デフォルトでExcelが選択済みだが明示的に指定）
      const excelRadio = page.locator('input[type="radio"][name="export-format"][value="xlsx"]');
      await excelRadio.click();

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // 全ファイルの生成とダウンロードが終わるとダイアログが閉じる
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: getTimeout(60000) });

      // チェックした2つの行タイプそれぞれに1ファイル（REQ-32.2）
      expect(downloadedFileNames).toHaveLength(2);

      // REQ-32.6: 各ファイル名が**そのファイルの**行タイプのラベルを持つ
      const executionFiles = downloadedFileNames.filter((name) => /_実行\.xlsx$/i.test(name));
      const vendorFiles = downloadedFileNames.filter((name) => /_業者\.xlsx$/i.test(name));
      expect(executionFiles).toHaveLength(1);
      expect(vendorFiles).toHaveLength(1);

      // チェックしていない「見積」のラベルを持つファイルは無い（REQ-32.5）
      expect(downloadedFileNames.filter((name) => /_見積\.xlsx$/i.test(name))).toEqual([]);
    });

    /**
     * @requirement estimate-creation/REQ-10.1
     *
     * 出力エンドポイント `GET /api/estimates/:id/export` は撤去された（Task 56.10）。
     * 旧テストはこのエンドポイントへのリクエストURLに `lineTypes` が載ることを
     * 検証していたが、エンドポイントごと存在しないため検証対象の振る舞いが消えた。
     * 代わりに「サーバーへ出力を依頼せずに帳票が生成される」ことを固定する。
     *
     * 否定の主張（出力エンドポイントを叩かない）が空振りにならないよう、
     * 出力操作の間に発生したAPIリクエストを実際に記録し、記録が空でないこと
     * （＝記録の仕組みが生きていること）を先に確かめてから、その中に
     * 出力エンドポイントが無いことを主張する。PDF出力は表紙の周辺情報を
     * 読み取り専用APIから取得するため、記録は必ず非空になる。
     */
    test('出力がフロントエンド生成で完結し、サーバーへ出力を依頼しない (estimate-creation/REQ-10.1)', async ({
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

      // 「見積」がデフォルトでチェック済みであることを確認
      const estimateCheckbox = page.locator('input[type="checkbox"][value="ESTIMATE"]');
      await expect(estimateCheckbox).toBeChecked();

      // 「実行」のチェックを外し、「見積」1ファイルだけに絞る
      const executionCheckbox = page.locator('input[type="checkbox"][value="EXECUTION"]');
      await executionCheckbox.uncheck();

      // PDF形式を選択
      const pdfRadio = page.locator('input[type="radio"][name="export-format"][value="pdf"]');
      await pdfRadio.click();

      // ここから先（出力操作中）のAPIリクエストとダウンロードを記録する
      const apiRequestUrls: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiRequestUrls.push(request.url());
        }
      });
      const downloadedFileNames: string[] = [];
      page.on('download', (download) => {
        downloadedFileNames.push(download.suggestedFilename());
      });

      // 出力ボタンをクリック
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^出力$/i })
        .click();

      // 生成とダウンロードが終わるとダイアログが閉じる
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: getTimeout(60000) });

      // REQ-10.1: 帳票（PDF）が生成されてダウンロードされる
      expect(downloadedFileNames).toHaveLength(1);
      expect(downloadedFileNames[0]).toMatch(/_見積\.pdf$/);

      // 記録の仕組みが生きていること（表紙の周辺情報を読み取るリクエストが載る）
      expect(apiRequestUrls.length).toBeGreaterThan(0);

      // そのうえで、出力をサーバーへ依頼したリクエストは1本も無い
      expect(apiRequestUrls.filter((url) => url.includes('/export'))).toEqual([]);
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
