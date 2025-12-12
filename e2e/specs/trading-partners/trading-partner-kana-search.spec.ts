/**
 * @fileoverview かな変換検索のE2Eテスト
 *
 * Task 20.3: かな変換検索のE2Eテスト
 *
 * 取引先一覧画面でひらがな入力での検索テストと、
 * ひらがな・カタカナ両方で同一結果が表示されることをテストします。
 *
 * Requirements:
 * - 1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
 * - 1.3.1: フリガナで検索するとき、ひらがな入力とカタカナ入力の両方を許容し、同一の検索結果を返却
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * かな変換検索のE2Eテスト
 */
test.describe('かな変換検索', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テスト用取引先のID（テスト間で共有）
  let testPartnerId: string | null = null;
  const testPartnerName = `かな検索テスト株式会社_${Date.now()}`;
  const testPartnerNameKana = 'カナケンサクテストカブシキガイシャ';

  test.beforeAll(async ({ browser }) => {
    // テスト用取引先を作成
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/trading-partners/new');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('取引先名').fill(testPartnerName);
    await page.getByLabel('フリガナ', { exact: true }).fill(testPartnerNameKana);
    await page.getByLabel('住所').fill('東京都渋谷区かな検索テスト1-2-3');
    await page.getByRole('checkbox', { name: /顧客/i }).check();

    const createPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/trading-partners') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    const createResponse = await createPromise;
    const responseData = await createResponse.json();
    testPartnerId = responseData.id;

    await page.waitForURL(/\/trading-partners$/);
    await context.close();
  });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * ひらがな入力検索のテスト
   *
   * REQ-1.3.1: フリガナで検索するとき、ひらがな入力を許容
   */
  test.describe('ひらがな入力検索', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('ひらがなで検索すると対応するカタカナのフリガナを持つ取引先がヒットする (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなで検索（「かなけんさく」で「カナケンサク」を持つ取引先を検索）
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('かなけんさく');
      await searchInput.press('Enter');

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用取引先が検索結果に表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('ひらがなの部分一致で検索できる (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなの一部で検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('かぶしき');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 「カブシキ」をフリガナに含む取引先がヒットすることを確認
      // テスト用取引先のフリガナには「カブシキガイシャ」が含まれる
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * カタカナ入力検索のテスト
   *
   * REQ-1.3.1: フリガナで検索するとき、カタカナ入力を許容
   */
  test.describe('カタカナ入力検索', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('カタカナで検索すると対応するフリガナを持つ取引先がヒットする (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // カタカナで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('カナケンサク');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用取引先が検索結果に表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * ひらがな・カタカナ両方で同一結果が返されることのテスト
   *
   * REQ-1.3.1: ひらがな入力とカタカナ入力の両方を許容し、同一の検索結果を返却
   */
  test.describe('ひらがな・カタカナ同一結果', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('ひらがなとカタカナで同一の検索結果が表示される (trading-partner-management/REQ-1.3, REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // Step 1: ひらがなで検索
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('かなけんさく');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがな検索の結果を取得
      const hiraganaResults: string[] = [];
      const rows = page.locator('[data-testid^="partner-row-"]');
      const rowCount = await rows.count();

      for (let i = 0; i < rowCount; i++) {
        const testId = await rows.nth(i).getAttribute('data-testid');
        if (testId) {
          hiraganaResults.push(testId);
        }
      }

      // Step 2: カタカナで検索（同じキーワード）
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      const searchInput2 = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput2.fill('カナケンサク');
      await searchInput2.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // カタカナ検索の結果を取得
      const katakanaResults: string[] = [];
      const rows2 = page.locator('[data-testid^="partner-row-"]');
      const rowCount2 = await rows2.count();

      for (let i = 0; i < rowCount2; i++) {
        const testId = await rows2.nth(i).getAttribute('data-testid');
        if (testId) {
          katakanaResults.push(testId);
        }
      }

      // 検索結果が同一であることを確認
      expect(hiraganaResults.length).toBe(katakanaResults.length);
      expect(hiraganaResults.sort()).toEqual(katakanaResults.sort());

      // テスト用取引先が両方の検索結果に含まれることを確認
      expect(hiraganaResults).toContain(`partner-row-${testPartnerId}`);
      expect(katakanaResults).toContain(`partner-row-${testPartnerId}`);
    });

    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('混合入力（ひらがな＋カタカナ）でも検索できる (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなとカタカナを混合した検索（「カナけんさく」）
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('カナけんさく');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用取引先が検索結果に表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('検索ボタンクリックでもひらがな検索が実行される (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなで入力し、検索ボタンをクリック
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('かなけんさく');

      await page.getByRole('button', { name: /^検索$/i }).click();

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用取引先が検索結果に表示されることを確認
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 検索結果なしの場合のテスト
   */
  test.describe('検索結果なし', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('存在しないひらがなキーワードで検索すると結果が0件になる (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 存在しないひらがなキーワードで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('そんざいしないとりひきさき');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索結果なしメッセージまたは空のテーブルが表示されることを確認
      const emptyMessage = page.getByText(/取引先が登録されていません/i);
      const table = page.getByRole('table', { name: /取引先一覧/i });

      // どちらかが表示されることを確認
      await expect(emptyMessage.or(table)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // テスト用取引先が表示されないことを確認
      await expect(page.getByText(testPartnerName)).not.toBeVisible();
    });
  });

  /**
   * フィルタとの組み合わせテスト
   */
  test.describe('フィルタとの組み合わせ', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3.1
     */
    test('ひらがな検索と種別フィルタを組み合わせて検索できる (trading-partner-management/REQ-1.3.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなで入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('かなけんさく');

      // 種別フィルタを選択（顧客）
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await customerCheckbox.check();

      // 検索実行
      await page.getByRole('button', { name: /^検索$/i }).click();

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/type=/);
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用取引先が検索結果に表示されることを確認（顧客として登録したため）
      await expect(page.getByText(testPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
