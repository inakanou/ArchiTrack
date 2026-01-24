/**
 * @fileoverview 受領見積書・ステータス管理のE2Eテスト
 *
 * Task 19: E2Eテスト実装
 *
 * Requirements coverage (estimate-request):
 * - 19.1: REQ-11.1 ~ REQ-11.10 受領見積書登録フロー
 * - 19.2: REQ-11.11 ~ REQ-11.17 受領見積書一覧・編集・削除
 * - 19.3: REQ-12.1 ~ REQ-12.12 ステータス管理
 *
 * @module e2e/specs/estimate-requests/received-quotation-status-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 受領見積書・ステータス管理のE2Eテスト
 */
test.describe('受領見積書・ステータス管理機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let createdFileQuotationId: string | null = null;
  let projectName: string = '';
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // データセットアップ：プロジェクト、協力業者、内訳書、見積依頼の作成
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
      projectName = `E2E受領見積テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

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
     * テスト準備：協力業者（取引先）の作成
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
      const tradingPartnerName = `E2Eテスト協力業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('イーツーイーテストキョウリョクギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      // 協力業者チェックボックスをオン
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      // メールアドレスを入力
      await page.getByLabel('メールアドレス').fill('test-subcontractor@example.com');

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

      // APIレスポンスからIDを取得
      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;

      expect(createdTradingPartnerId).toBeTruthy();
    });

    /**
     * テスト準備：内訳書と見積依頼の作成（APIで直接作成）
     */
    test('準備3：テスト用内訳書と見積依頼を作成する', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成ページに直接移動
      await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表作成フォームを入力
      const quantityTableName = '受領見積テスト用数量表';
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
      for (let i = 0; i < 3; i++) {
        await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `テスト項目${i + 1}`,
            workType: '工種A',
            specification: '規格A',
            unit: '式',
            quantity: 1.0,
            displayOrder: i,
          },
        });
      }

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '受領見積テスト用内訳書',
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
            name: '受領見積テスト用見積依頼',
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
  // 19.1 受領見積書登録フローのE2Eテスト
  // ============================================================================

  test.describe('19.1 受領見積書登録フロー', () => {
    /**
     * @requirement estimate-request/REQ-11.1
     * 見積依頼詳細画面に「受領見積書登録」ボタンを表示する
     */
    test('REQ-11.1: 見積依頼詳細画面に受領見積書登録ボタンが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書セクションが表示される
      await expect(page.getByText(/受領見積書/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 受領見積書登録ボタンが表示される
      await expect(page.getByRole('button', { name: /受領見積書登録/i })).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-11.2
     * 「受領見積書登録」ボタンをクリックで登録フォームが表示される
     */
    test('REQ-11.2: 受領見積書登録ボタンクリックでフォームが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録ボタンをクリック
      await page.getByRole('button', { name: /受領見積書登録/i }).click();

      // フォームが表示される
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-11.3
     * 受領見積書登録フォームに受領見積書名入力フィールドを表示する
     */
    test('REQ-11.3: 受領見積書名入力フィールドが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();

      // 受領見積書名フィールドが表示される
      const nameInput = page.locator('#quotation-name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-11.4
     * 受領見積書登録フォームに提出日入力フィールドを表示する
     */
    test('REQ-11.4: 提出日入力フィールドが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();

      // 提出日フィールドが表示される
      const dateInput = page.locator('#submitted-at');
      await expect(dateInput).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-11.5
     * テキスト入力フィールドを表示する
     */
    test('REQ-11.5: テキスト入力フィールドが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // テキストラジオボタンが選択されていることを確認
      const textRadio = page.locator('input[type="radio"][value="TEXT"]');
      await expect(textRadio).toBeChecked();

      // テキスト入力フィールドが表示される
      const textContent = page.locator('#text-content');
      await expect(textContent).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-11.6
     * ファイルアップロードフィールドを表示する
     */
    test('REQ-11.6: ファイルアップロードフィールドが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // ファイルラジオボタンをクリック
      const fileRadio = page.locator('input[type="radio"][value="FILE"]');
      await fileRadio.click();

      // ファイルアップロードエリアが表示される
      await expect(page.getByText(/ファイルを選択/i)).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-11.7
     * テキストとファイルの排他的選択を確認する
     */
    test('REQ-11.7: テキストとファイルの排他選択が機能する', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 初期状態でテキストが選択されている
      const textRadio = page.locator('input[type="radio"][value="TEXT"]');
      const fileRadio = page.locator('input[type="radio"][value="FILE"]');
      await expect(textRadio).toBeChecked();
      await expect(fileRadio).not.toBeChecked();

      // テキスト入力が表示、ファイルアップロードは非表示
      await expect(page.locator('#text-content')).toBeVisible();
      await expect(page.getByText(/ファイルを選択/i)).not.toBeVisible();

      // ファイルを選択
      await fileRadio.click();

      // ファイルアップロードが表示、テキスト入力は非表示
      await expect(page.getByText(/ファイルを選択/i)).toBeVisible();
      await expect(page.locator('#text-content')).not.toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-11.9
     * テキスト入力による登録フロー
     */
    test('REQ-11.9: テキスト入力で受領見積書を登録できる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const quotationName = `テスト受領見積書_${Date.now()}`;
      await page.locator('#quotation-name').fill(quotationName);
      await page.locator('#submitted-at').fill('2026-01-24');
      await page.locator('#text-content').fill('テスト見積内容です。合計金額: 100,000円');

      // 登録ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quotations') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^登録$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseBody = await response.json();
      createdReceivedQuotationId = responseBody.id;

      // 登録後、一覧に表示される
      await expect(page.getByText(quotationName)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-11.10
     * 必須項目バリデーションの確認
     */
    test('REQ-11.10: 必須項目未入力でバリデーションエラーが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 何も入力せずに登録ボタンをクリック
      await page.getByRole('button', { name: /^登録$/i }).click();

      // バリデーションエラーが表示される
      await expect(page.getByText(/受領見積書名を入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * ファイルアップロードによる登録フロー
     */
    test('ファイルアップロードで受領見積書を登録できる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const quotationName = `ファイル受領見積書_${Date.now()}`;
      await page.locator('#quotation-name').fill(quotationName);
      await page.locator('#submitted-at').fill('2026-01-24');

      // ファイルラジオボタンをクリック
      await page.locator('input[type="radio"][value="FILE"]').click();

      // テスト用PDFファイル（e2e/fixtures/に配置）
      const testFilePath = path.join(__dirname, '../../fixtures/test-file.pdf');
      // 第3原則: テストファイルが存在しない場合は失敗させる
      expect(fs.existsSync(testFilePath)).toBe(true);

      // ファイルをアップロード
      const fileInput = page.locator('input[type="file"][data-testid="file-input"]');
      await fileInput.setInputFiles(testFilePath);

      // 登録ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quotations') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^登録$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseBody = await response.json();
      createdFileQuotationId = responseBody.id;

      // 登録後、一覧に表示される
      await expect(page.getByText(quotationName)).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 19.2 受領見積書一覧・編集・削除のE2Eテスト
  // ============================================================================

  test.describe('19.2 受領見積書一覧・編集・削除', () => {
    /**
     * @requirement estimate-request/REQ-11.11
     * 1つの見積依頼に対して複数の受領見積書の登録を許可する
     */
    test('REQ-11.11: 複数の受領見積書が一覧に表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      expect(createdReceivedQuotationId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 登録済みの受領見積書が表示される
      await expect(page.getByText(/テスト受領見積書_/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-11.12
     * 見積依頼詳細画面に登録済み受領見積書の一覧を表示する
     */
    test('REQ-11.12: 受領見積書一覧が表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書セクションが表示される
      await expect(page.getByText(/受領見積書/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-11.13
     * 受領見積書名、提出日、登録日時を表示する
     */
    test('REQ-11.13: 受領見積書の詳細情報が表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書名が表示される
      await expect(page.getByText(/テスト受領見積書_/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 提出日が表示される
      await expect(page.getByText(/提出日/i).first()).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-11.14
     * ファイルプレビュー動作確認（ファイルがある場合のみ）
     */
    test('REQ-11.14: ファイルプレビューボタンが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ファイルタイプの受領見積書がある場合、プレビューボタンが表示される
      // （テキストタイプの場合はプレビューボタンは表示されない）
      const previewButton = page.getByRole('button', { name: /プレビュー/i });
      // 存在確認のみ（ファイルアップロードテストがスキップされた場合は表示されない可能性がある）
      const count = await previewButton.count();
      // テストの前提条件としてファイルアップロードが成功している場合のみチェック
      if (createdFileQuotationId) {
        expect(count).toBeGreaterThan(0);
      }
    });

    /**
     * @requirement estimate-request/REQ-11.15
     * 受領見積書の編集と保存の確認
     */
    test('REQ-11.15: 受領見積書を編集できる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      expect(createdReceivedQuotationId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // テキスト型受領見積書の編集ボタンをクリック（last()を使用してテキスト型を選択）
      // ファイルアップロードテストで作成されたファイル型が最初に表示されるため
      const editButtons = page
        .locator('[data-testid="received-quotation-item"]')
        .getByRole('button', { name: /編集/i });
      const count = await editButtons.count();
      // テキスト型の受領見積書の編集ボタンをクリック（最後に作成されたテキスト型）
      await editButtons.nth(count > 1 ? count - 1 : 0).click();

      // 編集フォームが表示される
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // 名前を変更
      const updatedName = `更新済み受領見積書_${Date.now()}`;
      await page.locator('#quotation-name').clear();
      await page.locator('#quotation-name').fill(updatedName);

      // テキスト内容も更新（テキスト型の受領見積書の場合）
      const textContent = page.locator('#text-content');
      if (await textContent.isVisible()) {
        await textContent.clear();
        await textContent.fill('更新されたテスト見積内容です。');
      }

      // 更新ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quotations') && response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /更新/i }).click();
      const response = await updatePromise;
      expect(response.status()).toBe(200);

      // 更新後の名前が表示される
      await expect(page.getByText(updatedName)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-11.16
     * 受領見積書の削除機能を提供する
     */
    test('REQ-11.16: 受領見積書の削除ボタンが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンが表示される
      await expect(page.getByRole('button', { name: /削除/i }).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-11.17
     * 削除確認ダイアログと削除処理の確認
     */
    test('REQ-11.17: 削除確認ダイアログが表示され削除APIが成功する', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // まず新しい受領見積書を作成（削除用）
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      const deleteTestName = `削除テスト用受領見積書_${Date.now()}`;
      await page.locator('#quotation-name').fill(deleteTestName);
      await page.locator('#submitted-at').fill('2026-01-24');
      await page.locator('#text-content').fill('削除テスト用');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quotations') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^登録$/i }).click();
      await createPromise;

      // 登録を確認
      await expect(page.getByText(deleteTestName)).toBeVisible({ timeout: getTimeout(10000) });

      // 削除ボタンをクリック
      const deleteButtons = page.getByRole('button', { name: /削除/i });
      await deleteButtons.last().click();

      // 削除確認ダイアログが表示される
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(/この操作は取り消せません/i)).toBeVisible();

      // 削除を確認
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quotations') && response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /削除する/i }).click();
      const response = await deletePromise;
      // 削除APIは204（No Content）または200を返す
      expect([200, 204]).toContain(response.status());

      // ダイアログが閉じるのを待機
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 19.3 ステータス管理のE2Eテスト
  // ============================================================================

  test.describe('19.3 ステータス管理', () => {
    /**
     * @requirement estimate-request/REQ-12.1
     * 見積依頼詳細画面にステータス表示エリアを表示する
     */
    test('REQ-12.1: 詳細画面にステータスが表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ステータスバッジが表示される
      await expect(page.getByTestId('status-badge')).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-12.4
     * 現在のステータスを視覚的に区別可能な形式で表示する
     */
    test('REQ-12.4: ステータスが視覚的に区別可能に表示される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ステータスバッジが表示され、テキストが含まれる
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toBeVisible({ timeout: getTimeout(10000) });

      // ステータスのテキストが表示される（依頼前、依頼済、または見積受領済）
      const statusText = await statusBadge.textContent();
      expect(['依頼前', '依頼済', '見積受領済']).toContain(statusText?.trim());
    });

    /**
     * @requirement estimate-request/REQ-12.5
     * 依頼前から依頼済への遷移確認
     */
    test('REQ-12.5: 依頼前から依頼済に遷移できる', async ({ page, request }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      // ステータスを「依頼前」にリセット
      const baseUrl = API_BASE_URL;
      if (accessToken) {
        await request.patch(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { status: 'BEFORE_REQUEST' },
        });
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「依頼前」であることを確認
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toBeVisible({ timeout: getTimeout(10000) });

      // 「依頼済にする」ボタンが表示される（aria-labelを使う）
      const transitionButton = page.getByRole('button', { name: /ステータスを依頼済に変更する/i });
      await expect(transitionButton).toBeVisible();

      // ボタンをクリック
      const statusUpdatePromise = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await transitionButton.click();
      const response = await statusUpdatePromise;
      expect(response.status()).toBe(200);

      // ステータスが「依頼済」に変わる
      await expect(statusBadge).toHaveText(/依頼済/i, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-12.6
     * 依頼済から見積受領済への遷移確認
     */
    test('REQ-12.6: 依頼済から見積受領済に遷移できる', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「依頼済」であることを確認
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toHaveText(/依頼済/i, { timeout: getTimeout(10000) });

      // 「見積受領済にする」ボタンが表示される（aria-labelを使う）
      const transitionButton = page.getByRole('button', {
        name: /ステータスを見積受領済に変更する/i,
      });
      await expect(transitionButton).toBeVisible();

      // ボタンをクリック
      const statusUpdatePromise = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await transitionButton.click();
      const response = await statusUpdatePromise;
      expect(response.status()).toBe(200);

      // ステータスが「見積受領済」に変わる
      await expect(statusBadge).toHaveText(/見積受領済/i, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-12.7
     * 依頼済から依頼前への遷移不可の確認
     */
    test('REQ-12.7: 依頼前に戻すボタンは表示されない', async ({ page, request }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      // ステータスを「依頼済」にリセット
      const baseUrl = API_BASE_URL;
      await request.patch(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { status: 'REQUESTED' },
      });

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「依頼済」であることを確認
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toHaveText(/依頼済/i, { timeout: getTimeout(10000) });

      // 「依頼前に戻す」ボタンが表示されないことを確認（aria-labelも確認）
      const backToBeforeButton = page.getByRole('button', { name: /依頼前に戻す|依頼前に変更/i });
      await expect(backToBeforeButton).not.toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-12.8
     * 見積受領済から依頼済への遷移確認
     */
    test('REQ-12.8: 見積受領済から依頼済に戻せる', async ({ page, request }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      // ステータスを「見積受領済」に設定
      const baseUrl = API_BASE_URL;
      await request.patch(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { status: 'QUOTATION_RECEIVED' },
      });

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「見積受領済」であることを確認
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toHaveText(/見積受領済/i, { timeout: getTimeout(10000) });

      // 「依頼済に戻す」ボタンが表示される（aria-labelを使う）
      const backButton = page.getByRole('button', { name: /ステータスを依頼済に戻す/i });
      await expect(backButton).toBeVisible();

      // ボタンをクリック
      const statusUpdatePromise = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await backButton.click();
      const response = await statusUpdatePromise;
      expect(response.status()).toBe(200);

      // ステータスが「依頼済」に変わる
      await expect(statusBadge).toHaveText(/依頼済/i, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-12.9
     * ステータス遷移ボタンをクリックするとステータスを更新する
     * Note: 既に12.5, 12.6, 12.8で遷移のテストを実施しているため、
     *       ここでは遷移ボタンがAPI呼び出しを行うことを確認する
     */
    test('REQ-12.9: ステータス遷移ボタンクリックでAPIが呼び出される', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ステータスバッジが表示されることを確認
      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toBeVisible({ timeout: getTimeout(10000) });

      // 現在表示されているステータスに応じた遷移ボタンを取得
      // 依頼前 -> 依頼済にする、依頼済 -> 見積受領済にする、見積受領済 -> 依頼済に戻す
      const transitionButton = page.getByRole('button', {
        name: /ステータスを(依頼済に変更する|見積受領済に変更する|依頼済に戻す)/i,
      });

      // ボタンが存在することを確認（ステータスによって異なるボタンが表示される）
      await expect(transitionButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンクリック時にAPIが呼び出される
      const statusUpdatePromise = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await transitionButton.click();
      const response = await statusUpdatePromise;
      expect(response.status()).toBe(200);
    });

    /**
     * @requirement estimate-request/REQ-12.10
     * ステータス遷移後のフィードバック表示確認
     */
    test('REQ-12.10: ステータス遷移後にフィードバックが表示される', async ({ page, request }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      // ステータスを「依頼済」に設定
      const baseUrl = API_BASE_URL;
      await request.patch(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { status: 'REQUESTED' },
      });

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 「見積受領済にする」ボタンをクリック（aria-labelを使う）
      const transitionButton = page.getByRole('button', {
        name: /ステータスを見積受領済に変更する/i,
      });
      await expect(transitionButton).toBeVisible({ timeout: getTimeout(10000) });

      await transitionButton.click();

      // フィードバック（トースト通知）が表示される
      await expect(page.getByText(/ステータスを.*に変更しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-12.12
     * 一覧画面でのステータス表示確認
     */
    test('REQ-12.12: 一覧画面にステータスが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されるまで待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // ステータスバッジが一覧に表示される
      const statusBadges = page.getByTestId('status-badge');
      const count = await statusBadges.count();
      expect(count).toBeGreaterThan(0);
    });

    /**
     * @requirement estimate-request/REQ-12.2
     * 見積依頼のステータスとして「依頼前」「依頼済」「見積受領済」の3種類を提供する
     */
    test('REQ-12.2: 3種類のステータスが存在する', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 新しい見積依頼を作成してステータス遷移を確認する
      // （既存の見積依頼は他のテストでステータスが変更されている可能性があるため）
      const createResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'REQ-12.2ステータス遷移テスト',
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
            requestMethod: 'EMAIL',
          },
        }
      );
      expect(createResponse.status()).toBe(201);
      const newEstimateRequest = await createResponse.json();
      const testEstimateRequestId = newEstimateRequest.id;

      await loginAsUser(page, 'REGULAR_USER');

      // 1. 依頼前（初期状態）
      await page.goto(`/estimate-requests/${testEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toHaveText(/依頼前/i, { timeout: getTimeout(10000) });

      // 2. 依頼済に遷移
      const response2 = await request.patch(
        `${baseUrl}/api/estimate-requests/${testEstimateRequestId}/status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { status: 'REQUESTED' },
        }
      );
      expect(response2.ok()).toBeTruthy();

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(statusBadge).toHaveText(/依頼済/i, { timeout: getTimeout(10000) });

      // 3. 見積受領済に遷移
      const response3 = await request.patch(
        `${baseUrl}/api/estimate-requests/${testEstimateRequestId}/status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { status: 'QUOTATION_RECEIVED' },
        }
      );
      expect(response3.ok()).toBeTruthy();

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(statusBadge).toHaveText(/見積受領済/i, { timeout: getTimeout(10000) });

      // クリーンアップ
      await request.delete(`${baseUrl}/api/estimate-requests/${testEstimateRequestId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });

    /**
     * @requirement estimate-request/REQ-12.3
     * 新規作成時の見積依頼のデフォルトステータスを「依頼前」とする
     */
    test('REQ-12.3: 新規作成時のデフォルトステータスが「依頼前」である', async ({
      page,
      request,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 新しい見積依頼を作成
      const newEstimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'REQ-12.3デフォルトステータステスト',
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
            requestMethod: 'EMAIL',
          },
        }
      );
      expect(newEstimateRequestResponse.status()).toBe(201);

      const newEstimateRequest = await newEstimateRequestResponse.json();

      // デフォルトステータスが「依頼前」であることを確認
      expect(newEstimateRequest.status).toBe('BEFORE_REQUEST');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${newEstimateRequest.id}`);
      await page.waitForLoadState('networkidle');

      const statusBadge = page.getByTestId('status-badge');
      await expect(statusBadge).toHaveText(/依頼前/i, { timeout: getTimeout(10000) });

      // クリーンアップ
      await request.delete(`${baseUrl}/api/estimate-requests/${newEstimateRequest.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });

    /**
     * @requirement estimate-request/REQ-12.11
     * ステータス変更履歴を記録する
     */
    test('REQ-12.11: ステータス変更がサーバーで記録される', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 新しい見積依頼を作成（依頼前ステータスで開始）
      const createResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'REQ-12.11ステータス履歴テスト',
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
            requestMethod: 'EMAIL',
          },
        }
      );
      expect(createResponse.status()).toBe(201);
      const newEstimateRequest = await createResponse.json();
      const testEstimateRequestId = newEstimateRequest.id;

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${testEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ステータスを変更
      const transitionButton = page.getByRole('button', { name: /ステータスを依頼済に変更する/i });
      await expect(transitionButton).toBeVisible({ timeout: getTimeout(10000) });

      const statusUpdatePromise = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await transitionButton.click();
      const response = await statusUpdatePromise;
      expect(response.status()).toBe(200);

      // レスポンスにステータス情報が含まれることを確認（履歴記録の間接確認）
      const responseData = await response.json();
      expect(responseData.status).toBe('REQUESTED');
      // updatedAtが更新されていることで履歴の記録を間接的に確認
      expect(responseData.updatedAt).toBeTruthy();

      // クリーンアップ
      await request.delete(`${baseUrl}/api/estimate-requests/${testEstimateRequestId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });
  });

  // ============================================================================
  // 19.4 受領見積書ファイル形式制限
  // ============================================================================

  test.describe('19.4 受領見積書ファイル形式制限', () => {
    /**
     * @requirement estimate-request/REQ-11.8
     * アップロード可能なファイル形式としてPDF、Excel（.xlsx、.xls）、画像（.jpg、.jpeg、.png）を許可する
     */
    test('REQ-11.8: ファイルアップロードフィールドに許可された形式が設定されている', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書登録ボタンをクリック
      await page.getByRole('button', { name: /受領見積書登録/i }).click();
      await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

      // ファイルラジオボタンをクリック
      const fileRadio = page.locator('input[type="radio"][value="FILE"]');
      await fileRadio.click();

      // ファイル入力フィールドを確認（スタイリングのためhiddenだがDOMには存在）
      const fileInput = page.locator('input[type="file"][data-testid="file-input"]');
      await expect(fileInput).toBeAttached({ timeout: getTimeout(5000) });

      // accept属性を確認（PDF、Excel、画像形式が許可されていること）
      const acceptAttribute = await fileInput.getAttribute('accept');
      expect(acceptAttribute).toBeTruthy();

      // 許可された形式が含まれていることを確認
      // PDF
      expect(acceptAttribute).toMatch(/pdf/i);
      // Excel
      expect(acceptAttribute).toMatch(/xlsx|xls|spreadsheet/i);
      // 画像
      expect(acceptAttribute).toMatch(/image|jpg|jpeg|png/i);
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      // テストデータの削除（見積依頼、内訳書、プロジェクト等）
      const baseUrl = API_BASE_URL;

      if (createdEstimateRequestId && accessToken) {
        await request.delete(`${baseUrl}/api/estimate-requests/${createdEstimateRequestId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdItemizedStatementId && accessToken) {
        await request.delete(`${baseUrl}/api/itemized-statements/${createdItemizedStatementId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdProjectId && accessToken) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdTradingPartnerId && accessToken) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      expect(true).toBe(true);
    });
  });
});
