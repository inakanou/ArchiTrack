/**
 * @fileoverview TradingPartnerSelectコンポーネントのひらがな・カタカナ検索E2Eテスト
 *
 * Task 34.1: TradingPartnerSelectのひらがな・カタカナ検索E2Eテスト
 *
 * プロジェクト作成・編集画面の取引先選択フィールドで、
 * ひらがな入力・カタカナ入力による候補フィルタリングが動作することをテストします。
 *
 * Requirements:
 * - 1.4: 顧客名フィールドでフリガナを検索するとき、ひらがな・カタカナどちらの入力でも取引先候補を検索
 * - 8.4: 編集画面の顧客名フィールドでフリガナを検索するとき、ひらがな・カタカナどちらの入力でも取引先候補を検索
 * - 16.3: フリガナで検索するとき、ひらがな入力とカタカナ入力の両方を許容
 * - 22.5: フリガナ検索を行うとき、ひらがな・カタカナどちらの入力でも顧客を検索
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * TradingPartnerSelectコンポーネントのひらがな・カタカナ検索E2Eテスト
 */
test.describe('TradingPartnerSelectのかな検索 (Task 34.1)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成した取引先のID
  let createdTradingPartnerId: string | null = null;
  const testPartnerName = `かな検索セレクトテスト株式会社_${Date.now()}`;
  // カタカナフリガナ
  const testPartnerNameKana = 'カナケンサクセレクトテストカブシキガイシャ';

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  /**
   * 事前準備: テスト用の取引先を作成
   */
  test.describe('事前準備', () => {
    test('テスト用取引先を作成（カタカナフリガナ）', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成ページに移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フォームが表示されることを確認
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      await page.getByLabel('取引先名').fill(testPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill(testPartnerNameKana);

      // 種別で「顧客」をチェック
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 住所を入力
      await page.getByLabel(/住所/i).fill('東京都渋谷区かな検索テスト1-2-3');

      // APIレスポンスを待機しながら保存ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
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

      // IDが取得できたことを確認
      expect(createdTradingPartnerId).toBeTruthy();
    });
  });

  /**
   * プロジェクト作成画面でのひらがな・カタカナ検索テスト
   */
  test.describe('プロジェクト作成画面でのかな検索', () => {
    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがな入力で取引先候補がフィルタリングされる（カタカナフリガナの取引先） (project-management/REQ-1.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクトフォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドにひらがなを入力（「かなけんさく」で「カナケンサク」を持つ取引先を検索）
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // ひらがなで入力
      await tradingPartnerInput.fill('かなけんさく');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // カタカナフリガナを持つ取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('カタカナ入力で取引先候補がフィルタリングされる (project-management/REQ-1.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドにカタカナを入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('カナケンサク');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがな部分一致で取引先候補がフィルタリングされる (project-management/REQ-1.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドにひらがなの一部を入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('せれくと');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 「セレクト」をフリガナに含む取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがなとカタカナを混合入力しても取引先候補がフィルタリングされる (project-management/REQ-1.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドに混合かなを入力（「カナけんさく」）
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('カナけんさく');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-16.3
     */
    test('候補なしの場合に適切なメッセージが表示される (project-management/REQ-16.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 存在しない取引先名をひらがなで入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('そんざいしないとりひきさき');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 「該当する取引先がありません」メッセージが表示されることを確認
      await expect(page.getByText(/該当する取引先がありません/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-22.5
     */
    test('ひらがな検索で取引先を選択してプロジェクトを作成できる (project-management/REQ-1.4, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 担当者一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      const projectName = `かな検索テストプロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 顧客名フィールドにひらがなを入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('かなけんさく');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先を選択
      const targetOption = page.getByText(testPartnerName);
      await expect(targetOption).toBeVisible({ timeout: getTimeout(5000) });
      await targetOption.click();

      // 選択した取引先名が入力フィールドに反映されることを確認
      await expect(tradingPartnerInput).toHaveValue(testPartnerName);

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

      // プロジェクト詳細画面で取引先名が表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * プロジェクト編集画面でのひらがな・カタカナ検索テスト
   */
  test.describe('プロジェクト編集画面でのかな検索', () => {
    let testProjectId: string | null = null;

    /**
     * 事前準備: テスト用プロジェクトを作成
     */
    test('事前準備: テスト用プロジェクトを作成', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 担当者一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `編集テスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

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

      // プロジェクトIDを取得
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = match?.[1] ?? null;

      expect(testProjectId).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-8.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('編集画面でひらがな入力により取引先候補がフィルタリングされる (project-management/REQ-8.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 顧客名フィールドにひらがなを入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.clear();
      await tradingPartnerInput.fill('かなけんさく');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // カタカナフリガナを持つ取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-8.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('編集画面でカタカナ入力により取引先候補がフィルタリングされる (project-management/REQ-8.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 顧客名フィールドにカタカナを入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.clear();
      await tradingPartnerInput.fill('カナケンサク');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先が候補に表示されることを確認
      await expect(page.getByText(testPartnerName)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-8.4
     * @requirement project-management/REQ-22.5
     */
    test('編集画面でひらがな検索した取引先を選択して保存できる (project-management/REQ-8.4, REQ-22.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 顧客名フィールドにひらがなを入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.clear();
      await tradingPartnerInput.fill('かなけんさく');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先を選択
      const targetOption = page.getByText(testPartnerName);
      await expect(targetOption).toBeVisible({ timeout: getTimeout(5000) });
      await targetOption.click();

      // 選択した取引先名が入力フィールドに反映されることを確認
      await expect(tradingPartnerInput).toHaveValue(testPartnerName);

      // 保存
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト詳細画面で取引先名が表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
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
