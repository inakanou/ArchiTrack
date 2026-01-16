/**
 * @fileoverview プロジェクト「顧客名」ラベル表示のE2Eテスト
 *
 * Task 30.1: ラベル変更E2Eテスト
 *
 * Requirements:
 * - 8.4: フォームフィールドのラベル
 * - 16: TradingPartnerSelectコンポーネント
 * - 22: 顧客名表示
 *
 * 変更概要（Task 27）:
 * - TradingPartnerSelect: 「取引先」→「顧客名」
 * - ProjectDetailPage: 詳細表示ラベル「取引先」→「顧客名」
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト「顧客名」ラベル表示のE2Eテスト
 */
test.describe('プロジェクト「顧客名」ラベル表示', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * @requirement project-management/REQ-8.4
   * @requirement project-management/REQ-16
   */
  test.describe('プロジェクト作成画面のラベル確認', () => {
    /**
     * プロジェクト作成画面で「顧客名」ラベルが表示されることを確認
     */
    test('プロジェクト作成画面で「顧客名」ラベルが表示される (project-management/REQ-8.4, REQ-16)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 「顧客名」ラベルが表示されることを確認
      // labelタグのテキストで確認
      const customerNameLabel = page.getByText('顧客名', { exact: true });
      await expect(customerNameLabel).toBeVisible({ timeout: getTimeout(5000) });

      // TradingPartnerSelectのcomboboxにaria-label="顧客名"が設定されていることを確認
      const customerNameInput = page.getByRole('combobox', { name: '顧客名' });
      await expect(customerNameInput).toBeVisible({ timeout: getTimeout(5000) });

      // aria-label属性の値を確認
      await expect(customerNameInput).toHaveAttribute('aria-label', '顧客名');
    });

    /**
     * 「取引先」ラベルが表示されないことを確認（古いラベルがないことを検証）
     */
    test('プロジェクト作成画面で「取引先」ラベルが表示されない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 「取引先」というラベル（完全一致）が存在しないことを確認
      // 注意: 「取引先候補」などの複合語は許容されるため、完全一致で検索
      const oldLabel = page.locator('label', { hasText: /^取引先$/ });
      await expect(oldLabel).toHaveCount(0, { timeout: getTimeout(5000) });
    });
  });

  /**
   * @requirement project-management/REQ-22
   */
  test.describe('プロジェクト詳細画面のラベル確認', () => {
    /**
     * 事前準備: テスト用プロジェクトを作成
     */
    test('事前準備: テスト用プロジェクトを作成', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `顧客名ラベルテスト_${Date.now()}`;
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

      // プロジェクト作成
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
    });

    /**
     * プロジェクト詳細画面で「顧客名」ラベルが表示されることを確認
     */
    test('プロジェクト詳細画面で「顧客名」ラベルが表示される (project-management/REQ-22)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 基本情報セクションが表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 「顧客名」フィールドラベルが表示されることを確認
      // fieldLabelスタイルで大文字変換されるため、text-transform: uppercaseを考慮
      const customerNameField = page.locator('div').filter({ hasText: /^顧客名$/i });
      await expect(customerNameField.first()).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * プロジェクト詳細画面で「取引先」ラベルが表示されないことを確認
     */
    test('プロジェクト詳細画面で「取引先」ラベルが表示されない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 「取引先」というフィールドラベル（完全一致）が存在しないことを確認
      // 注意: 関連テキスト（「取引先候補」など）は許容されるため、フィールドラベルのみ確認
      const oldLabel = page
        .locator('div')
        .filter({ hasText: /^取引先$/i })
        .first();
      await expect(oldLabel).not.toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  /**
   * @requirement project-management/REQ-8.4
   */
  test.describe('プロジェクト編集画面のラベル確認', () => {
    /**
     * プロジェクト編集画面で「顧客名」ラベルが表示されることを確認
     */
    test('プロジェクト編集画面で「顧客名」ラベルが表示される (project-management/REQ-8.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 編集ページに直接遷移
      await page.goto(`/projects/${createdProjectId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「顧客名」ラベルが表示されることを確認
      const customerNameLabel = page.getByText('顧客名', { exact: true });
      await expect(customerNameLabel).toBeVisible({ timeout: getTimeout(5000) });

      // TradingPartnerSelectのcomboboxにaria-label="顧客名"が設定されていることを確認
      const customerNameInput = page.getByRole('combobox', { name: '顧客名' });
      await expect(customerNameInput).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * 編集画面で「取引先」ラベルが表示されないことを確認
     */
    test('プロジェクト編集画面で「取引先」ラベルが表示されない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${createdProjectId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「取引先」というラベル（完全一致）が存在しないことを確認
      const oldLabel = page.locator('label', { hasText: /^取引先$/ });
      await expect(oldLabel).toHaveCount(0, { timeout: getTimeout(5000) });
    });
  });

  /**
   * 後処理: テストで作成したプロジェクトを削除
   */
  test.afterAll(async ({ browser }) => {
    if (!createdProjectId) return;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'ADMIN_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      await context.close();
    }
  });
});
