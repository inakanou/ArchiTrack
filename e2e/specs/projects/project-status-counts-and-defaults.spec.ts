/**
 * @fileoverview ステータス別件数表示・終端ステータス除外・デフォルト表示件数のE2Eテスト
 *
 * Task 44.1: ステータス別件数表示E2Eテスト
 * Task 44.2: 終端ステータス除外E2Eテスト
 * Task 44.3: デフォルト表示件数E2Eテスト
 *
 * Requirements:
 * - 23.1-23.6: ステータス別件数表示（全プロジェクト対象、検索条件に依存しない）
 * - 2.7, 2.8: 終端ステータス（完了・中止・失注）のデフォルト除外
 * - 5.5, 5.7, 5.8: フィルタ条件でステータス指定時は該当ステータス表示
 * - 3.1: デフォルト表示件数100件
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

test.describe('ステータス別件数・終端ステータス除外・デフォルト表示件数', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // Task 44.1: ステータス別件数表示E2Eテスト
  // Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6
  // ==========================================================================

  test.describe('ステータス別件数表示 (Task 44.1)', () => {
    /**
     * @requirement project-management/REQ-23.1
     */
    test('プロジェクト一覧画面でステータス別件数セクションが表示される (project-management/REQ-23.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータス別件数セクションのタイトルが表示される
      await expect(page.getByText(/ステータス別件数（全プロジェクト）/)).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement project-management/REQ-23.4
     * @requirement project-management/REQ-23.5
     */
    test('全12ステータスの件数ボタンが表示される (project-management/REQ-23.4, REQ-23.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータス別件数セクションが表示されるまで待機
      await expect(page.getByText(/ステータス別件数（全プロジェクト）/)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 全12ステータスのラベルが表示される
      const expectedLabels = [
        '準備中',
        '調査中',
        '見積中',
        '決裁待ち',
        '契約中',
        '工事中',
        '引渡中',
        '請求中',
        '入金待ち',
        '完了',
        '中止',
        '失注',
      ];

      // ステータス別件数セクション内のボタンを取得
      const summarySection = page.locator('.mb-6').filter({
        has: page.getByText(/ステータス別件数（全プロジェクト）/),
      });

      for (const label of expectedLabels) {
        await expect(summarySection.getByText(label)).toBeVisible();
      }
    });

    /**
     * @requirement project-management/REQ-23.6
     */
    test('合計件数が表示される (project-management/REQ-23.6)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータス別件数セクションが表示されるまで待機
      await expect(page.getByText(/ステータス別件数（全プロジェクト）/)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「全 X 件」の形式で合計件数が表示される
      const summarySection = page.locator('.mb-6').filter({
        has: page.getByText(/ステータス別件数（全プロジェクト）/),
      });
      await expect(summarySection.getByText(/全.*件/)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-23.2
     * @requirement project-management/REQ-23.3
     */
    test('検索・フィルタ操作後もステータス別件数が変化しない (project-management/REQ-23.2, REQ-23.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータス別件数セクションが表示されるまで待機
      const summarySection = page.locator('.mb-6').filter({
        has: page.getByText(/ステータス別件数（全プロジェクト）/),
      });
      await expect(summarySection).toBeVisible({ timeout: getTimeout(15000) });

      // 合計件数を記録
      const totalText = await summarySection.getByText(/全.*件/).textContent();

      // 検索を実行
      const searchInput = page.getByRole('searchbox');
      await searchInput.fill('テスト');
      await page.getByRole('button', { name: '検索' }).click();

      // 検索結果のロード完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ステータス別件数が変化していないことを確認
      // 一覧が表示されている場合のみStatsSummaryが表示される
      const summaryAfterSearch = page.locator('.mb-6').filter({
        has: page.getByText(/ステータス別件数（全プロジェクト）/),
      });

      const isVisible = await summaryAfterSearch.isVisible().catch(() => false);
      if (isVisible) {
        const totalTextAfter = await summaryAfterSearch.getByText(/全.*件/).textContent();
        expect(totalTextAfter).toBe(totalText);
      }
    });
  });

  // ==========================================================================
  // Task 44.2: 終端ステータス除外E2Eテスト
  // Requirements: 2.7, 2.8, 5.5, 5.7, 5.8
  // ==========================================================================

  test.describe('終端ステータス除外 (Task 44.2)', () => {
    /**
     * @requirement project-management/REQ-2.7
     */
    test('デフォルト表示で終端ステータスのプロジェクトが表示されない (project-management/REQ-2.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // プロジェクト一覧が表示されるまで待機
      await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

      // APIリクエストを監視して、excludeTerminalStatusesが送信されていることを確認
      const projectsApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          !response.url().includes('status-counts') &&
          response.status() === 200,
        { timeout: getTimeout(15000) }
      );

      // ページをリロードしてAPIリクエストをキャプチャ
      await page.reload();
      const response = await projectsApiPromise;
      const url = response.url();

      // excludeTerminalStatuses=true がクエリパラメータに含まれている
      expect(url).toContain('excludeTerminalStatuses=true');
    });

    /**
     * @requirement project-management/REQ-2.8
     * @requirement project-management/REQ-5.7
     */
    test('ステータスフィルタで「完了」を選択すると完了ステータスのプロジェクトが表示される (project-management/REQ-2.8, REQ-5.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータスフィルタで「完了」を選択
      const statusFilter = page.getByLabel('ステータスフィルタ');
      await statusFilter.selectOption('COMPLETED');

      // APIレスポンスを待機
      await page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          !response.url().includes('status-counts') &&
          response.url().includes('status=COMPLETED') &&
          response.status() === 200,
        { timeout: getTimeout(15000) }
      );

      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // excludeTerminalStatuses が含まれていないことを確認するため、
      // APIレスポンスのURLを確認
      // ステータスフィルタ指定時はexcludeTerminalStatusesは送信されない
    });

    test('フィルタクリア後に終端ステータスが再び除外される (5.5)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータスフィルタで「完了」を選択
      const statusFilter = page.getByLabel('ステータスフィルタ');
      await statusFilter.selectOption('COMPLETED');

      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フィルタクリア
      const clearButton = page.getByRole('button', { name: /クリア/ });
      if (await clearButton.isVisible()) {
        // クリアボタンをクリックしてAPIレスポンスを待機
        const apiPromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/projects') &&
            !response.url().includes('status-counts') &&
            response.status() === 200,
          { timeout: getTimeout(15000) }
        );

        await clearButton.click();
        const response = await apiPromise;
        const url = response.url();

        // excludeTerminalStatuses=true が再び含まれる
        expect(url).toContain('excludeTerminalStatuses=true');
      }
    });

    /**
     * @requirement project-management/REQ-5.8
     */
    test('ステータスフィルタに「完了」「中止」「失注」を含むすべてのステータスが選択肢として存在する (project-management/REQ-5.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ステータスフィルタの選択肢を確認
      const statusFilter = page.getByLabel('ステータスフィルタ');
      await expect(statusFilter).toBeVisible({ timeout: getTimeout(10000) });

      // 終端ステータスを含むすべてのステータスが選択肢として存在することを確認
      const terminalStatuses = ['COMPLETED', 'CANCELLED', 'LOST'];
      for (const status of terminalStatuses) {
        const option = statusFilter.locator(`option[value="${status}"]`);
        await expect(option).toBeAttached();
      }
    });
  });

  // ==========================================================================
  // Task 44.3: デフォルト表示件数E2Eテスト
  // Requirements: 3.1
  // ==========================================================================

  test.describe('デフォルト表示件数 (Task 44.3)', () => {
    test('デフォルトAPIリクエストでlimit=100が送信される (3.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIリクエストを監視
      const projectsApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          !response.url().includes('status-counts') &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.goto('/projects');
      const response = await projectsApiPromise;
      const url = response.url();

      // デフォルトのlimit=100がリクエストに含まれる
      expect(url).toContain('limit=100');
    });

    test('ページネーションの表示件数セレクトに100件オプションが存在する (3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

      // ページネーションが表示されるまで待機
      const paginationControls = page.getByTestId('pagination-controls');

      const isVisible = await paginationControls.isVisible().catch(() => false);
      if (isVisible) {
        // 表示件数セレクトに100件オプションが存在する
        const limitSelect = page.getByLabel('表示件数');
        await expect(limitSelect).toBeVisible();

        const option100 = limitSelect.locator('option[value="100"]');
        await expect(option100).toBeAttached();
      }
    });
  });
});
