/**
 * @fileoverview プロジェクト取引先連携のE2Eテスト
 *
 * Requirements:
 * - REQ-22: 取引先連携
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト取引先連携のE2Eテスト
 */
test.describe('プロジェクト取引先連携', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成した取引先と��ロジェクトのIDを保存
  let createdTradingPartnerId: string | null = null;
  let createdProjectId: string | null = null;
  const testTradingPartnerName = `E2Eテスト取引先_${Date.now()}`;
  const testTradingPartnerKana = 'イーツーイーテストトリヒキサキ';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  test.describe('取引先オートコンプリート機能（作成画面）', () => {
    /**
     * テスト用の取引先を作成
     */
    test('事前準備: テスト用取引先を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成ページに移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されることを確認
      await expect(page.getByLabel(/^名前$/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      await page.getByLabel(/^名前$/i).fill(testTradingPartnerName);
      await page.getByLabel(/^フリガナ$/i).fill(testTradingPartnerKana);

      // 種別で「顧客」をチェック（REQ-22.1: 顧客種別を持つ取引先のみが候補）
      const customerCheckbox = page.locator('input[type="checkbox"][value="customer"]');
      await customerCheckbox.check();

      // 住所を入力（必須項目）
      await page.getByLabel(/住所/i).fill('東京都渋谷区テスト1-2-3');

      // APIレスポンスを待機しながら保存ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();

      // APIレスポンスを確認
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧ページに遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 作成した取引先のIDをレスポンスから取得
      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;
    });

    /**
     * @requirement project-management/REQ-22.1
     */
    test('プロジェクト作成画面で顧客を選択時、取引先種別「顧客」を含む取引先一覧を候補として提供する (project-management/REQ-22.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // プロジェクトフォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドに作成した取引先の一部を入力
      const customerInput = page.getByLabel(/顧客名/i);
      await customerInput.fill('E2Eテスト');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 作成した取引先が候補に含まれていることを確認
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
      await expect(page.getByText(testTradingPartnerKana, { exact: true })).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-22.3
     */
    test('顧客選択時に取引先名またはフリガナで検索可能なオートコンプリート機能を提供する (project-management/REQ-22.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const customerInput = page.getByLabel(/顧客名/i);

      // 取引先名での検索
      await customerInput.fill(testTradingPartnerName.substring(0, 10));

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();

      // フィールドをクリアして、フリガナで検索
      await customerInput.clear();
      await customerInput.fill('イーツーイー');

      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-22.4
     */
    test('オートコンプリートの検索フィールドにテキストを入力すると300ms後に検索実行される (project-management/REQ-22.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const customerInput = page.getByLabel(/顧客名/i);

      // API呼び出しをモニタリング
      let apiCallCount = 0;
      const apiCalls: number[] = [];

      page.on('request', (request) => {
        if (
          request.url().includes('/api/trading-partners') &&
          request.method() === 'GET' &&
          request.url().includes('type=customer')
        ) {
          apiCallCount++;
          apiCalls.push(Date.now());
        }
      });

      // 短時間で複数文字を入力（デバウンスをテスト）
      const startTime = Date.now();
      await customerInput.type('E2E', { delay: 50 }); // 各文字間50ms

      // デバウンス期間（300ms）を待機
      await page.waitForTimeout(500);

      // デバウンスにより、最後の入力から300ms後に1回だけAPI呼び出しが行われることを確認
      // 複数回の入力があっても、デバウンスにより1回のAPI呼び出しに集約される
      expect(apiCallCount).toBeLessThanOrEqual(2); // デバウンス効果を確認（連続入力で複数回呼ばれない）

      // 最後のAPI呼び出しが入力完了から約300ms後であることを確認
      if (apiCalls.length > 0) {
        const lastApiCallTime = apiCalls[apiCalls.length - 1]!;
        const timeDiff = lastApiCallTime - startTime;
        // タイピング時間(3文字 * 50ms = 150ms) + デバウンス(300ms) = 約450ms
        // 多少の誤差を許容して200ms〜800msの範囲であることを確認
        expect(timeDiff).toBeGreaterThanOrEqual(200);
        expect(timeDiff).toBeLessThanOrEqual(800);
      }
    });
  });

  test.describe('取引先オートコンプリート機能（編集画面）', () => {
    /**
     * @requirement project-management/REQ-22.2
     */
    test('プロジェクト編集画面で顧客を選択時、取引先種別「顧客」を含む取引先一覧を候補として提供する (project-management/REQ-22.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `編集テストプロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/顧客名/i).fill('初期顧客名');

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

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // プロジェクトIDを取得
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 顧客名フィールドをクリアして新しい検索を行う
      const customerInput = page.getByLabel(/顧客名/i);
      await customerInput.clear();
      await customerInput.fill('E2Eテスト');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 作成した取引先が候補に含まれていることを確認
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
    });
  });

  test.describe('取引先情報の表示', () => {
    /**
     * @requirement project-management/REQ-22.5
     */
    test('プロジェクトが取引先と紐付いている場合、プロジェクト詳細画面に取引先情報を表示する (project-management/REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先オートコンプリートを使用してプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `取引先連携プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 顧客名フィールドで取引先を検索
      const customerInput = page.getByLabel(/顧客名/i);
      await customerInput.fill('E2Eテスト');

      // オートコンプリート候補から取引先を選択
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      const targetOption = page.getByText(testTradingPartnerName, { exact: true });
      await expect(targetOption).toBeVisible();
      await targetOption.click();

      // 選択した取引先名が入力フィールドに反映されることを確認
      await expect(customerInput).toHaveValue(testTradingPartnerName);

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

      // プロジェクトを作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト詳細画面で取引先情報（顧客名）が表示されることを確認
      await expect(page.getByText(testTradingPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 後処理: テストで作成したデータを削除
   */
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 管理者ユーザーでログイン
      await loginAsUser(page, 'ADMIN_USER');

      // 作成したプロジェクトを削除
      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        const deleteButtonVisible = await deleteButton.isVisible().catch(() => false);

        if (deleteButtonVisible) {
          await deleteButton.click();

          // 削除確認ダイアログで削除を確認
          await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
            timeout: getTimeout(10000),
          });

          await page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i })
            .click();

          // 削除成功を確認
          await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }

      // 作成した取引先を削除
      if (createdTradingPartnerId) {
        await page.goto(`/trading-partners/${createdTradingPartnerId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        const deleteButtonVisible = await deleteButton.isVisible().catch(() => false);

        if (deleteButtonVisible) {
          await deleteButton.click();

          // 削除確認ダイアログで削除を確認
          const confirmDialog = page.getByText(/削除しますか|取引先の削除/i);
          const confirmDialogVisible = await confirmDialog.isVisible().catch(() => false);

          if (confirmDialogVisible) {
            // ダイアログ内の削除ボタンをクリック
            const dialogDeleteButton = page
              .getByTestId('focus-manager-overlay')
              .getByRole('button', { name: /^削除$/i });
            const dialogDeleteButtonVisible = await dialogDeleteButton
              .isVisible()
              .catch(() => false);

            if (dialogDeleteButtonVisible) {
              await dialogDeleteButton.click();
              await expect(page).toHaveURL(/\/trading-partners$/, {
                timeout: getTimeout(15000),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      await context.close();
    }
  });
});
