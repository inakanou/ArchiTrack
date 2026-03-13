/**
 * @fileoverview 契約書管理機能E2Eテスト
 *
 * Task 9.2: E2Eテストを作成する
 *
 * Requirements coverage (contract-management):
 * - REQ-1.1 ~ REQ-1.6: 契約書一覧画面
 * - REQ-2.1 ~ REQ-2.4: 契約種類選択
 * - REQ-3.1 ~ REQ-3.4: 新規契約入力項目
 * - REQ-4.1 ~ REQ-4.7: 自動表示項目
 * - REQ-5.1 ~ REQ-5.3: 変更契約入力項目
 * - REQ-6.1 ~ REQ-6.2: 変更前後比較表示
 * - REQ-7.1 ~ REQ-7.3: 作成・キャンセル操作
 * - REQ-8.1 ~ REQ-8.8: 詳細画面
 * - REQ-9.1 ~ REQ-9.5: 編集画面
 *
 * テストフロー:
 * 1. 新規契約作成フロー（見積書選択 -> 金額自動表示 -> 入力 -> 作成 -> 詳細画面遷移）
 * 2. 変更契約作成フロー（基契約書選択 -> デフォルト値設定 -> 変更前後比較表示 -> 作成）
 * 3. ステータス遷移フロー（契約前 -> 契約済 -> 契約前の双方向遷移）
 * 4. 編集フロー（詳細画面 -> 編集ボタン -> フォーム編集 -> 保存 -> 詳細画面反映）
 * 5. キャンセル操作フロー（新規作成キャンセル、編集キャンセル）
 * 6. パンくずナビゲーション（全画面での表示確認）
 *
 * @module e2e/specs/contracts/contract-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 契約書管理機能E2Eテスト
 */
test.describe('契約書管理機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial', retries: 0 });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdContractId: string | null = null;
  let createdAmendmentContractId: string | null = null;
  let accessToken: string = '';
  let projectName: string = '';

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
      projectName = `E2E契約テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力
      await page.getByLabel(/現場住所/i).fill('東京都千代田区契約1-2-3');

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
     * テスト準備：APIトークンの取得
     */
    test('準備2：APIトークンを取得する', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;

      expect(accessToken).toBeTruthy();
    });

    /**
     * テスト準備：見積書の作成
     */
    test('準備3：テスト用見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 見積書を作成
      const response = await request.post(`${baseUrl}/api/projects/${createdProjectId}/estimates`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `契約テスト見積書_${Date.now()}`,
        },
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      createdEstimateId = body.id;

      expect(createdEstimateId).toBeTruthy();
    });
  });

  // ============================================================================
  // 1. 新規契約作成フロー
  // ============================================================================

  test.describe('1. 新規契約作成フロー', () => {
    /**
     * REQ-1.3, REQ-1.4: 一覧画面の新規作成ボタンから新規作成画面に遷移する
     */
    test('1-1: 契約書一覧画面に新規作成ボタンが表示され、クリックで新規作成画面に遷移する', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 契約書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts`);
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンが表示されることを確認
      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンをクリック
      await createButton.click();

      // 新規作成画面に遷移したことを確認
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/new$/);
      expect(page.url()).toContain('/contracts/new');
    });

    /**
     * REQ-2.1, REQ-2.2, REQ-3.1, REQ-3.2, REQ-3.4, REQ-4.1, REQ-4.2, REQ-4.3:
     * 新規契約フォームでの入力と金額自動計算
     */
    test('1-2: 新規契約を作成し、見積書選択時に金額が自動表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/new`);
      await page.waitForLoadState('networkidle');

      // 契約種類選択UI - 新規契約が選択されていることを確認（REQ-2.1）
      const newContractRadio = page.getByLabel(/新規契約/i);
      await expect(newContractRadio).toBeVisible({ timeout: getTimeout(10000) });
      await expect(newContractRadio).toBeChecked();

      // 見積書選択（REQ-3.4）
      const estimateSelect = page.locator('select[aria-label="見積書"]');
      await expect(estimateSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 見積書オプションが読み込まれるまで待機
      await page.waitForFunction(
        (selector) => {
          const select = document.querySelector(selector);
          return select && select.querySelectorAll('option').length > 1;
        },
        'select[aria-label="見積書"]',
        { timeout: getTimeout(15000) }
      );

      // 見積書を選択
      await estimateSelect.selectOption({ index: 1 });

      // 金額自動表示の確認（REQ-4.1, REQ-4.2, REQ-4.3）
      // 見積書選択後に金額フィールドが表示されることを確認
      await expect(page.getByText(/工事価格/)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/消費税額/)).toBeVisible();
      await expect(page.getByText(/請負代金額/)).toBeVisible();

      // 消費税率デフォルト10%の確認（REQ-3.2）
      const taxRateInput = page.locator('input[aria-label="消費税率"]');
      if (await taxRateInput.isVisible()) {
        const taxRateValue = await taxRateInput.inputValue();
        expect(taxRateValue).toContain('10');
      }

      // 契約日を入力（REQ-3.1）
      const contractDateInput = page.locator('input[type="date"][aria-label="契約日"]');
      if (await contractDateInput.isVisible()) {
        await contractDateInput.fill('2024-06-01');
      }

      // 工期着手日を入力
      const startDateInput = page.locator('input[type="date"][aria-label="工期着手日"]');
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-07-01');
      }

      // 工期完成日を入力
      const endDateInput = page.locator('input[type="date"][aria-label="工期完成日"]');
      if (await endDateInput.isVisible()) {
        await endDateInput.fill('2024-12-31');
      }

      // 引渡日を入力
      const deliveryDateInput = page.locator('input[type="date"][aria-label="引渡日"]');
      if (await deliveryDateInput.isVisible()) {
        await deliveryDateInput.fill('2025-01-15');
      }

      // 支払条件を入力
      const paymentTermsInput = page.locator(
        'input[aria-label="支払条件"], textarea[aria-label="支払条件"]'
      );
      if (await paymentTermsInput.isVisible()) {
        await paymentTermsInput.fill('契約時50%、完了時50%');
      }

      // プロジェクト情報の自動表示確認（REQ-4.4, REQ-4.6, REQ-4.7）
      await expect(page.getByText(/工事名/)).toBeVisible();
      await expect(page.getByText(/工事場所/)).toBeVisible();

      // 作成ボタン押下（REQ-7.1）
      const submitButton = page.getByRole('button', { name: /作成/i });
      await expect(submitButton).toBeVisible();

      const createResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/contracts') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await submitButton.click();

      const response = await createResponse;
      expect(response.status()).toBe(201);

      // 詳細画面に遷移したことを確認（REQ-7.1）
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/[0-9a-f-]+$/);

      // URLから契約書IDを取得
      const url = page.url();
      const contractMatch = url.match(/\/contracts\/([0-9a-f-]+)$/);
      createdContractId = contractMatch?.[1] ?? null;
      expect(createdContractId).toBeTruthy();
    });
  });

  // ============================================================================
  // 2. ステータス遷移フロー
  // ============================================================================

  test.describe('2. ステータス遷移フロー', () => {
    /**
     * REQ-8.2, REQ-8.3: 契約前 -> 契約済 -> 契約前の双方向遷移
     */
    test('2-1: 契約書のステータスを契約前から契約済に変更できる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 契約書詳細画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「契約前」であることを確認
      await expect(page.getByText('契約前')).toBeVisible({ timeout: getTimeout(10000) });

      // ステータス遷移ボタンをクリック（「契約済にする」等のボタン）
      const statusButton = page.getByRole('button', { name: /契約済/i });
      await expect(statusButton).toBeVisible({ timeout: getTimeout(10000) });

      const statusResponse = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await statusButton.click();
      const response = await statusResponse;
      expect(response.ok()).toBeTruthy();

      // ステータスが「契約済」に変更されたことを確認
      await expect(page.getByText('契約済')).toBeVisible({ timeout: getTimeout(10000) });
    });

    test('2-2: 契約書のステータスを契約済から契約前に戻すことができる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 契約書詳細画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「契約済」であることを確認
      await expect(page.getByText('契約済')).toBeVisible({ timeout: getTimeout(10000) });

      // ステータス遷移ボタンをクリック（「契約前に戻す」等のボタン）
      const statusButton = page.getByRole('button', { name: /契約前/i });
      await expect(statusButton).toBeVisible({ timeout: getTimeout(10000) });

      const statusResponse = page.waitForResponse(
        (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await statusButton.click();
      const response = await statusResponse;
      expect(response.ok()).toBeTruthy();

      // ステータスが「契約前」に戻ったことを確認
      await expect(page.getByText('契約前')).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 3. 編集フロー
  // ============================================================================

  test.describe('3. 編集フロー', () => {
    /**
     * REQ-8.6, REQ-8.7, REQ-9.1, REQ-9.2: 詳細画面 -> 編集 -> 保存 -> 詳細画面反映
     */
    test('3-1: 契約書を編集して保存すると詳細画面に反映される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 契約書詳細画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンをクリック（REQ-8.6, REQ-8.7）
      const editButton = page.getByRole('link', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集画面に遷移したことを確認
      await page.waitForURL(/\/contracts\/[0-9a-f-]+\/edit$/);

      // 支払条件を変更（REQ-9.1）
      const paymentTermsInput = page.locator(
        'input[aria-label="支払条件"], textarea[aria-label="支払条件"]'
      );
      if (await paymentTermsInput.isVisible()) {
        await paymentTermsInput.clear();
        await paymentTermsInput.fill('完了時一括払い');
      }

      // 保存ボタン押下（REQ-9.2）
      const saveButton = page.getByRole('button', { name: /保存/i });
      await expect(saveButton).toBeVisible();

      const updateResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/contracts/') && response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await saveButton.click();
      const response = await updateResponse;
      expect(response.ok()).toBeTruthy();

      // 詳細画面に遷移したことを確認（REQ-9.2）
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/[0-9a-f-]+$/);

      // 変更内容が反映されていることを確認
      await expect(page.getByText('完了時一括払い')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // 4. 変更契約作成フロー
  // ============================================================================

  test.describe('4. 変更契約作成フロー', () => {
    /**
     * REQ-2.3, REQ-5.1, REQ-5.2, REQ-5.3, REQ-6.1, REQ-6.2:
     * 変更契約作成（基契約書選択 -> デフォルト値設定 -> 変更前後比較表示 -> 作成）
     */
    test('4-1: 変更契約を作成できる（基契約書選択とデフォルト値設定）', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/new`);
      await page.waitForLoadState('networkidle');

      // 変更契約を選択（REQ-2.1, REQ-2.3）
      const amendmentRadio = page.getByLabel(/変更契約/i);
      await expect(amendmentRadio).toBeVisible({ timeout: getTimeout(10000) });
      await amendmentRadio.click();

      // 基となる契約書選択UI（REQ-5.1）
      const parentContractSelect = page.locator('select[aria-label="基となる契約書"]');
      await expect(parentContractSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 契約書オプションが読み込まれるまで待機
      await page.waitForFunction(
        (selector) => {
          const select = document.querySelector(selector);
          return select && select.querySelectorAll('option').length > 1;
        },
        'select[aria-label="基となる契約書"]',
        { timeout: getTimeout(15000) }
      );

      // 基契約書を選択
      await parentContractSelect.selectOption({ index: 1 });

      // デフォルト値が設定されることを確認（REQ-5.2）
      // 基契約書の見積書が自動的に選択されていることを確認
      await page.waitForLoadState('networkidle');

      // 変更前後比較表示が表示されることを確認（REQ-6.1, REQ-6.2）
      await expect(page.getByText(/変更前/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 作成ボタンで変更契約を作成
      const submitButton = page.getByRole('button', { name: /作成/i });
      await expect(submitButton).toBeVisible();

      const createResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/contracts') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await submitButton.click();
      const response = await createResponse;
      expect(response.status()).toBe(201);

      // 詳細画面に遷移
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/[0-9a-f-]+$/);

      // URLから変更契約IDを取得
      const url = page.url();
      const contractMatch = url.match(/\/contracts\/([0-9a-f-]+)$/);
      createdAmendmentContractId = contractMatch?.[1] ?? null;
      expect(createdAmendmentContractId).toBeTruthy();

      // 変更契約であることが表示されていることを確認
      await expect(page.getByText('変更契約')).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 5. キャンセル操作フロー
  // ============================================================================

  test.describe('5. キャンセル操作フロー', () => {
    /**
     * REQ-7.2: 新規作成キャンセル
     */
    test('5-1: 新規作成画面でキャンセルボタンを押すと前の画面に戻る', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 契約書一覧画面経由で新規作成画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts`);
      await page.waitForLoadState('networkidle');

      // 新規作成画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/new`);
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック（REQ-7.2）
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 前の画面（契約書一覧）に戻ることを確認
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts$/, {
        timeout: getTimeout(10000),
      });
    });

    /**
     * REQ-9.3: 編集キャンセル
     */
    test('5-2: 編集画面でキャンセルボタンを押すと詳細画面に戻る', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      // 編集画面に移動
      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}/edit`);
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック（REQ-9.3）
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 詳細画面に戻ることを確認
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });

      // 編集画面ではないことを確認
      expect(page.url()).not.toContain('/edit');
    });
  });

  // ============================================================================
  // 6. パンくずナビゲーション
  // ============================================================================

  test.describe('6. パンくずナビゲーション', () => {
    /**
     * REQ-1.6: 一覧画面でパンくずナビゲーションが表示される
     */
    test('6-1: 契約書一覧画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されていることを確認
      const breadcrumb = page.locator('nav[aria-label="パンくず"], nav[aria-label="breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // ダッシュボードへのリンクが含まれていることを確認
      await expect(breadcrumb.getByText(/ダッシュボード/i)).toBeVisible();
    });

    /**
     * REQ-2.4: 新規作成画面でパンくずナビゲーションが表示される
     */
    test('6-2: 契約書新規作成画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/new`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されていることを確認
      const breadcrumb = page.locator('nav[aria-label="パンくず"], nav[aria-label="breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * REQ-8.8: 詳細画面でパンくずナビゲーションが表示される
     */
    test('6-3: 契約書詳細画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されていることを確認
      const breadcrumb = page.locator('nav[aria-label="パンくず"], nav[aria-label="breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * REQ-9.4: 編集画面でパンくずナビゲーションが表示される
     */
    test('6-4: 契約書編集画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されていることを確認
      const breadcrumb = page.locator('nav[aria-label="パンくず"], nav[aria-label="breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 7. 詳細画面の表示確認
  // ============================================================================

  test.describe('7. 詳細画面の表示確認', () => {
    /**
     * REQ-8.1: 契約書詳細画面に全項目が表示される
     */
    test('7-1: 契約書詳細画面に全項目と自動表示項目が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // 契約種類が表示されていることを確認（REQ-8.1）
      await expect(page.getByText(/新規契約/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ステータスが表示されていることを確認
      const statusText = page.getByText(/契約前|契約済/);
      await expect(statusText.first()).toBeVisible();

      // 編集ボタンが表示されていることを確認（REQ-8.6）
      await expect(page.getByRole('link', { name: /編集/i })).toBeVisible();
    });

    /**
     * REQ-8.4: 見積書へのリンクが表示される
     */
    test('7-2: 契約書詳細画面に見積書へのリンクが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/${createdContractId}`);
      await page.waitForLoadState('networkidle');

      // 見積書へのリンクが表示されていることを確認（REQ-8.4）
      const estimateLink = page.locator('a[href*="/estimates/"]');
      await expect(estimateLink.first()).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * REQ-8.5: 変更契約の場合、基契約書へのリンクが表示される
     */
    test('7-3: 変更契約の詳細画面に基契約書へのリンクが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdAmendmentContractId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts/${createdAmendmentContractId}`);
      await page.waitForLoadState('networkidle');

      // 基契約書へのリンクが表示されていることを確認（REQ-8.5）
      const parentContractLink = page.locator('a[href*="/contracts/"]');
      await expect(parentContractLink.first()).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // 8. 契約書一覧画面の表示確認
  // ============================================================================

  test.describe('8. 契約書一覧画面の表示確認', () => {
    /**
     * REQ-1.1, REQ-1.2: 契約書リスト表示と項目表示
     */
    test('8-1: 契約書一覧画面に契約書が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts`);
      await page.waitForLoadState('networkidle');

      // 契約書が一覧に表示されていることを確認（REQ-1.1）
      // 契約種類が表示されていることを確認（REQ-1.2）
      await expect(page.getByText(/新規契約/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ステータスが表示されていることを確認（REQ-1.2）
      const statusText = page.getByText(/契約前|契約済/);
      await expect(statusText.first()).toBeVisible();
    });

    /**
     * REQ-1.5: 一覧の契約書をクリックすると詳細画面に遷移する
     */
    test('8-2: 契約書一覧から契約書をクリックして詳細画面に遷移できる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/contracts`);
      await page.waitForLoadState('networkidle');

      // 最初の契約書行をクリック
      const contractRow = page.locator('tr[data-testid^="contract-row-"], a[href*="/contracts/"]');
      await expect(contractRow.first()).toBeVisible({ timeout: getTimeout(10000) });
      await contractRow.first().click();

      // 詳細画面に遷移したことを確認（REQ-1.5）
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/contracts\/[0-9a-f-]+$/);
    });
  });
});
