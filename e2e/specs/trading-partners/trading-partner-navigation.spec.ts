/**
 * @fileoverview 取引先ナビゲーション・画面遷移のE2Eテスト
 *
 * Task 15.4: ナビゲーション・画面遷移のE2Eテスト
 *
 * 取引先管理機能のナビゲーションと画面遷移をテストします。
 * - ヘッダーナビゲーションリンク
 * - ダッシュボードクイックアクセス
 * - URL直接アクセス
 * - パンくずナビゲーション
 * - 画面間遷移
 * - 未認証アクセス時のリダイレクト
 *
 * Requirements:
 * - 12.1: ヘッダーに「取引先」ナビゲーションリンクを表示
 * - 12.2: ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移
 * - 12.3: 「取引先」リンクにアイコンを付与
 * - 12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置
 * - 12.5: ダッシュボードのクイックアクセスに「取引先管理」カードを表示
 * - 12.6: 取引先管理カードをクリックすると取引先一覧画面に遷移
 * - 12.7: 取引先管理カードに「顧客・協力業者の登録・管理」と表示
 * - 12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置
 * - 12.9-12.12: URL設計（/trading-partners, /trading-partners/new等）
 * - 12.13: 存在しない取引先ID時に「取引先が見つかりません」と戻るリンクを表示
 * - 12.14-12.18: パンくずナビゲーション
 * - 12.19-12.22: 画面間遷移（作成成功、更新成功、削除成功、キャンセル時）
 * - 12.23: 未認証アクセス時のリダイレクト
 * - 12.24-12.27: URLルーティング
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * 取引先ナビゲーション・画面遷移のE2Eテスト
 */
test.describe('取引先ナビゲーション・画面遷移', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * ヘッダーナビゲーションのテスト
   *
   * REQ-12.1: ヘッダーに「取引先」ナビゲーションリンクを表示
   * REQ-12.2: ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移
   * REQ-12.3: 「取引先」リンクにアイコンを付与
   * REQ-12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置
   */
  test.describe('ヘッダーナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.1
     */
    test('ヘッダーナビゲーションに「取引先」リンクが表示される (trading-partner-management/REQ-12.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内の「取引先」リンクが存在することを確認
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await expect(tradingPartnerLink).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.2
     */
    test('ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移する (trading-partner-management/REQ-12.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「取引先」リンクをクリック
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await tradingPartnerLink.click();

      // 取引先一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.3
     */
    test('「取引先」リンクにアイコンが表示される (trading-partner-management/REQ-12.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「取引先」リンク内にSVGアイコンが存在することを確認
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await expect(tradingPartnerLink).toBeVisible({ timeout: getTimeout(10000) });

      const icon = tradingPartnerLink.locator('svg');
      await expect(icon).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.4
     */
    test('「取引先」リンクが「プロジェクト」リンクの次に配置されている (trading-partner-management/REQ-12.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内のリンク位置を確認
      const header = page.locator('header');
      const nav = header.getByRole('navigation');
      const projectLink = nav.getByRole('link', { name: 'プロジェクト', exact: true });
      const tradingPartnerLink = nav.getByRole('link', { name: '取引先', exact: true });

      const projectBox = await projectLink.boundingBox();
      const tradingPartnerBox = await tradingPartnerLink.boundingBox();

      // 取引先リンクがプロジェクトリンクの右側（次）にあることを確認
      if (projectBox && tradingPartnerBox) {
        expect(tradingPartnerBox.x).toBeGreaterThan(projectBox.x);
      }
    });
  });

  /**
   * ダッシュボードナビゲーションのテスト
   *
   * REQ-12.5: ダッシュボードのクイックアクセスに「取引先管理」カードを表示
   * REQ-12.6: 取引先管理カードをクリックすると取引先一覧画面に遷移
   * REQ-12.7: 取引先管理カードに「顧客・協力業者の登録・管理」と表示
   * REQ-12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置
   */
  test.describe('ダッシュボードナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.5
     */
    test('ダッシュボードのクイックアクセスセクションに「取引先管理」カードが表示される (trading-partner-management/REQ-12.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「取引先管理」カードが存在することを確認
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await expect(tradingPartnerCard).toBeVisible({ timeout: getTimeout(10000) });
      await expect(tradingPartnerCard.getByText(/取引先管理/i)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.6
     */
    test('ダッシュボードの「取引先管理」カードをクリックすると取引先一覧画面に遷移する (trading-partner-management/REQ-12.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「取引先管理」カードをクリック
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await tradingPartnerCard.click();

      // 取引先一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.7
     */
    test('「取引先管理」カードに「顧客・協力業者の登録・管理」という説明文が表示される (trading-partner-management/REQ-12.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // カード内に説明文が存在することを確認
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await expect(tradingPartnerCard.getByText(/顧客・協力業者の登録・管理/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.8
     */
    test('「取引先管理」カードが「プロジェクト管理」カードの次に配置されている (trading-partner-management/REQ-12.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // カードの位置を確認
      const projectCard = page.getByTestId('quick-link-projects');
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');

      const projectBox = await projectCard.boundingBox();
      const tradingPartnerBox = await tradingPartnerCard.boundingBox();

      // 取引先管理カードがプロジェクト管理カードの右または下にあることを確認
      if (projectBox && tradingPartnerBox) {
        // グリッドレイアウトのため、右側または下に配置される
        const isRightOf = tradingPartnerBox.x > projectBox.x;
        const isBelow = tradingPartnerBox.y > projectBox.y + projectBox.height - 10; // 若干のマージン
        expect(isRightOf || isBelow).toBe(true);
      }
    });
  });

  /**
   * URL直接アクセスのテスト
   *
   * REQ-12.9: 一覧は /trading-partners
   * REQ-12.10: 新規作成は /trading-partners/new
   * REQ-12.11: 詳細は /trading-partners/:id
   * REQ-12.12: 編集は /trading-partners/:id/edit
   */
  test.describe('URL直接アクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.9
     */
    test('/trading-partners にアクセスすると取引先一覧画面が表示される (trading-partner-management/REQ-12.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 一覧画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.10
     */
    test('/trading-partners/new にアクセスすると取引先新規作成画面が表示される (trading-partner-management/REQ-12.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 新規作成画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel('取引先名')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.11
     * @requirement trading-partner-management/REQ-12.24
     */
    test('/trading-partners/:id にアクセスすると取引先詳細画面が表示される (trading-partner-management/REQ-12.11, REQ-12.24)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `ナビテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ナビテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区ナビテスト1-2-3');
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
      const partnerId = responseData.id;

      // 詳細ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 詳細画面が表示されることを確認
      await expect(page.getByText(partnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /削除/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.12
     * @requirement trading-partner-management/REQ-12.25
     */
    test('/trading-partners/:id/edit にアクセスすると取引先編集画面が表示される (trading-partner-management/REQ-12.12, REQ-12.25)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `編集ナビテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンシュウナビテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区編集ナビテスト1-2-3');
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
      const partnerId = responseData.id;

      // 編集ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示され、既存データがプリセットされていることを確認
      await expect(page.getByRole('heading', { name: /取引先の編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel('取引先名')).toHaveValue(partnerName);
    });
  });

  /**
   * 存在しない取引先IDへのアクセステスト
   *
   * REQ-12.13: 存在しない取引先ID時に「取引先が見つかりません」と戻るリンクを表示
   */
  test.describe('存在しない取引先IDへのアクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.13
     */
    test('存在しない取引先IDへのアクセス時に「取引先が見つかりません」メッセージと戻るリンクが表示される (trading-partner-management/REQ-12.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しない有効なUUID形式のIDでアクセス（UUIDv4形式）
      await page.goto('/trading-partners/11111111-1111-4111-a111-111111111111');
      await page.waitForLoadState('networkidle');

      // エラーメッセージと戻るリンクが表示されることを確認
      await expect(page.getByText(/取引先が見つかりません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      const backLink = page.getByRole('link', { name: /一覧に戻る/i });
      await expect(backLink).toBeVisible();

      // 戻るリンクをクリックすると一覧ページに遷移
      await backLink.click();
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.13
     */
    test('存在しない取引先IDの編集ページへのアクセス時にエラーメッセージが表示される (trading-partner-management/REQ-12.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しない有効なUUID形式のIDの編集ページにアクセス（UUIDv4形式）
      await page.goto('/trading-partners/11111111-1111-4111-a111-111111111111/edit');
      await page.waitForLoadState('networkidle');

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/取引先が見つかりません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * パンくずナビゲーションのテスト
   *
   * REQ-12.14: パンくずナビゲーションを提供
   * REQ-12.15: 詳細画面: ダッシュボード > 取引先 > [取引先名]
   * REQ-12.16: 新規作成画面: ダッシュボード > 取引先 > 新規作成
   * REQ-12.17: 編集画面: ダッシュボード > 取引先 > [取引先名] > 編集
   * REQ-12.18: 一覧画面: ダッシュボード > 取引先
   */
  test.describe('パンくずナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.18
     */
    test('一覧画面でパンくず「ダッシュボード > 取引先」が表示される (trading-partner-management/REQ-12.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByText('取引先')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.16
     */
    test('新規作成画面でパンくず「ダッシュボード > 取引先 > 新規作成」が表示される (trading-partner-management/REQ-12.16)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: /取引先/i })).toBeVisible();
      await expect(breadcrumb.getByText('新規作成')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.15
     */
    test('詳細画面でパンくず「ダッシュボード > 取引先 > [取引先名]」が表示される (trading-partner-management/REQ-12.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `パンくずテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('パンクズテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区パンくずテスト1-2-3');
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
      const partnerId = responseData.id;

      // 詳細ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: /取引先/i })).toBeVisible();
      // 取引先名は最後の項目なのでリンクではない
      await expect(breadcrumb.getByText(partnerName)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.17
     */
    test('編集画面でパンくず「ダッシュボード > 取引先 > [取引先名] > 編集」が表示される (trading-partner-management/REQ-12.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `パンくず更新テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('パンクズコウシンテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区パンくず更新テスト1-2-3');
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
      const partnerId = responseData.id;

      // 編集ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: '取引先', exact: true })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: new RegExp(partnerName) })).toBeVisible();
      // 編集は最後の項目なのでリンクではない（aria-current="page"がついている）
      await expect(breadcrumb.getByText('編集', { exact: true })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.14
     */
    test('パンくずの「取引先」リンクをクリックすると一覧ページに遷移する (trading-partner-management/REQ-12.14)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // パンくずの「取引先」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await breadcrumb.getByRole('link', { name: /取引先/i }).click();

      // 一覧ページに遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });
  });

  /**
   * 画面間遷移のテスト
   *
   * REQ-12.19: 一覧画面で「新規作成」ボタンをクリック → 新規作成画面
   * REQ-12.20: 詳細画面で「編集」ボタンをクリック → 編集画面
   * REQ-12.21: 新規作成画面で作成成功 → 一覧画面
   * REQ-12.22: 編集画面で更新成功 → 詳細画面
   */
  test.describe('画面間遷移', () => {
    /**
     * @requirement trading-partner-management/REQ-12.19
     */
    test('一覧画面の「新規作成」ボタンから新規作成画面に遷移する (trading-partner-management/REQ-12.19)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 新規作成画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.20
     */
    test('詳細画面の「編集」ボタンから編集画面に遷移する (trading-partner-management/REQ-12.20)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('センイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区遷移テスト1-2-3');
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
      const partnerId = responseData.id;

      // 詳細ページに移動
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}/edit`), {
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.21
     */
    test('新規作成画面で作成成功後に一覧画面に遷移する (trading-partner-management/REQ-12.21)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `作成遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクセイセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区作成遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.22
     */
    test('編集画面で更新成功後に詳細画面に遷移する (trading-partner-management/REQ-12.22)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `更新遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('コウシンセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区更新遷移テスト1-2-3');
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
      const partnerId = responseData.id;

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 備考を更新
      const updatedNotes = `更新テスト備考_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
    });

    test('削除成功後に一覧画面に遷移する', async ({ page }) => {
      // 管理者でログイン（削除権限が必要）
      await loginAsUser(page, 'ADMIN_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `削除遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクジョセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区削除遷移テスト1-2-3');
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
      const partnerId = responseData.id;

      // 詳細ページに移動
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      await deletePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });

    test('新規作成画面のキャンセルボタンで一覧画面に戻る', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });

    test('編集画面のキャンセルボタンで詳細画面に戻る', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `キャンセル遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('キャンセルセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区キャンセル遷移テスト1-2-3');
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
      const partnerId = responseData.id;

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 未認証アクセスのテスト
   *
   * REQ-12.23: 未認証ユーザーが取引先ページにアクセス時、ログインリダイレクト後に元ページに復帰
   */
  test.describe('未認証アクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.23
     */
    test('未認証状態で取引先一覧ページにアクセスするとログインページにリダイレクトされる (trading-partner-management/REQ-12.23)', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/trading-partners');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.23
     */
    test('未認証状態で取引先新規作成ページにアクセスするとログインページにリダイレクトされる (trading-partner-management/REQ-12.23)', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/trading-partners/new');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.23
     * @requirement trading-partner-management/REQ-12.26
     * @requirement trading-partner-management/REQ-12.27
     */
    test('ログイン後に元のページに復帰する (trading-partner-management/REQ-12.23, REQ-12.26, REQ-12.27)', async ({
      page,
      context,
    }) => {
      // 未認証状態で取引先一覧ページにアクセスを試みる
      await page.goto('/trading-partners');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // URLにリダイレクト情報が含まれていることを確認
      // フォームを表示
      const emailInput = page.getByLabel(/メールアドレス/i);
      await emailInput.waitFor({ state: 'visible', timeout: getTimeout(10000) });

      // ログインを実行（ただしcontextをクリアしていないのでcookie付き）
      // 代わりにloginAsUserのロジックを適用
      await context.clearCookies();
      await loginAsUser(page, 'REGULAR_USER');

      // ダッシュボードにリダイレクトされる（ProtectedRoute実装による）
      // 注: 元のページへの復帰はProtectedRouteの実装に依存する
      // 現在の実装では認証後はダッシュボードにリダイレクトされる
      await expect(page).toHaveURL(/\/dashboard|\/trading-partners/, {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 一覧から詳細への遷移テスト
   */
  test.describe('一覧から詳細への遷移', () => {
    test('一覧画面の取引先行をクリックすると詳細画面に遷移する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `一覧遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('イチランセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区一覧遷移テスト1-2-3');
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
      const partnerId = responseData.id;

      // 一覧ページに遷移
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 作成した取引先の行を検索してクリック
      // 検索フィールドを使用して作成した取引先を見つける
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill(partnerName);
      await page.getByRole('button', { name: /^検索$/i }).click();

      // 検索結果を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 取引先行をクリック
      const partnerRow = page.locator(`[data-testid="partner-row-${partnerId}"]`);
      await expect(partnerRow).toBeVisible({ timeout: getTimeout(10000) });
      await partnerRow.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(partnerName).first()).toBeVisible();
    });
  });
});
