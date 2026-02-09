/**
 * @fileoverview 顧客選択時の住所自動入力E2Eテスト
 *
 * Task 38.1: 顧客選択時の住所自動入力E2Eテスト
 *
 * Requirements:
 * - 1.6: 顧客を選択し、現場住所が空欄 → 取引先の住所を自動入力
 * - 1.7: 現場住所に既に値がある場合 → 上書きしない
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 顧客選択時の住所自動入力のE2Eテスト
 */
test.describe('顧客選択時の住所自動入力', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成した取引先のIDと情報を保存
  let createdTradingPartnerId: string | null = null;
  const testTradingPartnerName = `住所自動入力テスト取引先_${Date.now()}`;
  const testTradingPartnerKana = 'ジュウショジドウニュウリョクテストトリヒキサキ';
  const testTradingPartnerAddress = '東京都新宿区西新宿1-2-3 テストビル5F';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用取引先を作成
   */
  test('事前準備: テスト用取引先を作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 取引先作成ページに移動
    await page.goto('/trading-partners/new');
    await page.waitForLoadState('networkidle');

    // フォームが表示されることを確認
    await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

    // 取引先情報を入力
    await page.getByLabel('取引先名').fill(testTradingPartnerName);
    await page.getByLabel('フリガナ', { exact: true }).fill(testTradingPartnerKana);

    // 種別で「顧客」をチェック
    await page.getByRole('checkbox', { name: /顧客/i }).check();

    // 住所を入力
    await page.getByLabel(/住所/i).fill(testTradingPartnerAddress);

    // APIレスポンスを待機しながら保存ボタンをクリック
    const createPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/trading-partners') && response.request().method() === 'POST',
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

    // 作成した取引先のIDをレスポンスから取得
    const responseData = await response.json();
    createdTradingPartnerId = responseData.id;
    expect(createdTradingPartnerId).toBeTruthy();
  });

  /**
   * @requirement project-management/REQ-1.6
   */
  test('現場住所が空の状態で顧客を選択すると、取引先の住所が現場住所に自動入力される (project-management/REQ-1.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト作成ページに移動
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');

    // フォームが表示されるまで待機
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ローディング完了を待機
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // 現場住所フィールドが空であることを確認
    const siteAddressInput = page.getByLabel(/現場住所/i);
    await expect(siteAddressInput).toHaveValue('');

    // 顧客名フィールドでテスト取引先を検索
    const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
    await tradingPartnerInput.fill(testTradingPartnerName.substring(0, 10));

    // オートコンプリート候補が表示されるのを待つ
    const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
    await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

    // テスト取引先を選択
    await page.getByText(testTradingPartnerName, { exact: true }).click();

    // 現場住所に取引先の住所が自動入力されることを確認
    await expect(siteAddressInput).toHaveValue(testTradingPartnerAddress, {
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement project-management/REQ-1.7
   */
  test('現場住所に値がある状態で顧客を選択すると、既存の住所が上書きされない (project-management/REQ-1.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト作成ページに移動
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');

    // フォームが表示されるまで待機
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ローディング完了を待機
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // 現場住所に値を入力
    const existingAddress = '神奈川県横浜市中区1-2-3';
    const siteAddressInput = page.getByLabel(/現場住所/i);
    await siteAddressInput.fill(existingAddress);
    await expect(siteAddressInput).toHaveValue(existingAddress);

    // 顧客名フィールドでテスト取引先を検索
    const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
    await tradingPartnerInput.fill(testTradingPartnerName.substring(0, 10));

    // オートコンプリート候補が表示されるのを待つ
    const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
    await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

    // テスト取引先を選択
    await page.getByText(testTradingPartnerName, { exact: true }).click();

    // 現場住所は既存値を保持し、上書きされないことを確認
    await expect(siteAddressInput).toHaveValue(existingAddress);
    // 取引先の住所で上書きされていないことも確認
    await expect(siteAddressInput).not.toHaveValue(testTradingPartnerAddress);
  });

  /**
   * @requirement project-management/REQ-1.6
   * 自動入力された住所でプロジェクトが正常に保存されることを確認
   */
  test('自動入力された住所でプロジェクトが正常に保存される (project-management/REQ-1.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト作成ページに移動
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');

    // フォームが表示されるまで待機
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ローディング完了を待機
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // プロジェクト名を入力
    const projectName = `住所自動入力保存テスト_${Date.now()}`;
    await page.getByLabel(/プロジェクト名/i).fill(projectName);

    // 営業担当者の選択を確認
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

    // 現場住所が空であることを確認
    const siteAddressInput = page.getByLabel(/現場住所/i);
    await expect(siteAddressInput).toHaveValue('');

    // 顧客名フィールドでテスト取引先を検索・選択
    const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
    await tradingPartnerInput.fill(testTradingPartnerName.substring(0, 10));

    const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
    await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
    await page.getByText(testTradingPartnerName, { exact: true }).click();

    // 住所が自動入力されたことを確認
    await expect(siteAddressInput).toHaveValue(testTradingPartnerAddress, {
      timeout: getTimeout(5000),
    });

    // APIレスポンスを待機しながら作成ボタンをクリック
    const createPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();

    // APIレスポンスを待機
    const response = await createPromise;
    expect(response.status()).toBe(201);

    // 詳細画面に遷移することを確認
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

    // 成功メッセージが表示されることを確認
    await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 詳細画面で自動入力された住所が保存されていることを確認
    await expect(page.getByText(testTradingPartnerAddress)).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * テスト後のクリーンアップ
   */
  test('クリーンアップ: テスト用取引先を削除する', async ({ page }) => {
    // 取引先が作成されていない場合はスキップ
    if (!createdTradingPartnerId) {
      test.skip();
      return;
    }

    await loginAsUser(page, 'REGULAR_USER');

    // 取引先詳細ページに移動
    await page.goto(`/trading-partners/${createdTradingPartnerId}`);
    await page.waitForLoadState('networkidle');

    // 削除ボタンが存在する場合はクリック
    const deleteButton = page.getByRole('button', { name: /削除/i });
    if (await deleteButton.isVisible({ timeout: getTimeout(5000) }).catch(() => false)) {
      await deleteButton.click();

      // 確認ダイアログで削除を確認
      const confirmButton = page.getByRole('button', { name: /削除する|はい|確認/i });
      if (await confirmButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
        await confirmButton.click();
      }
    }
  });
});
