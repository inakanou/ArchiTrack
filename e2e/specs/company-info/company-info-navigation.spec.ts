/**
 * @fileoverview 自社情報ナビゲーション・画面遷移のE2Eテスト
 *
 * Task 7.4: 自社情報ナビゲーションのE2Eテスト
 *
 * 自社情報機能のナビゲーションと画面遷移をテストします。
 * - ヘッダーナビゲーションリンク
 * - URL直接アクセス
 * - パンくずナビゲーション
 * - 未認証アクセス時のリダイレクト
 *
 * Requirements:
 * - 5.1: AppHeaderのメインナビゲーションに「自社情報」リンクを表示する
 * - 5.2: 「自社情報」リンクを「取引先」リンクの右側に配置する
 * - 5.3: 認証済みユーザーがAppHeaderの「自社情報」リンクをクリックしたとき、自社情報ページ（/company-info）に遷移する
 * - 5.4: 「自社情報」リンクにアイコン（ビルディングアイコン）を付与して視認性を高める
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 自社情報ナビゲーション・画面遷移のE2Eテスト
 */
test.describe('自社情報ナビゲーション・画面遷移', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット
    await page.setViewportSize({ width: 1280, height: 720 });

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * ヘッダーナビゲーションのテスト
   *
   * REQ-5.1: AppHeaderのメインナビゲーションに「自社情報」リンクを表示する
   * REQ-5.2: 「自社情報」リンクを「取引先」リンクの右側に配置する
   * REQ-5.3: 認証済みユーザーがAppHeaderの「自社情報」リンクをクリックしたとき、自社情報ページ（/company-info）に遷移する
   * REQ-5.4: 「自社情報」リンクにアイコン（ビルディングアイコン）を付与して視認性を高める
   */
  test.describe('ヘッダーナビゲーション', () => {
    /**
     * @requirement company-info/REQ-5.1
     */
    test('ヘッダーナビゲーションに「自社情報」リンクが表示される (company-info/REQ-5.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内の「自社情報」リンクが存在することを確認
      const header = page.locator('header');
      const companyInfoLink = header.getByRole('link', { name: '自社情報', exact: true });
      await expect(companyInfoLink).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-5.3
     */
    test('ヘッダーの「自社情報」リンクをクリックすると自社情報ページに遷移する (company-info/REQ-5.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「自社情報」リンクをクリック
      const header = page.locator('header');
      const companyInfoLink = header.getByRole('link', { name: '自社情報', exact: true });
      await companyInfoLink.click();

      // 自社情報ページに遷移することを確認
      await expect(page).toHaveURL(/\/company-info$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /自社情報/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement company-info/REQ-5.4
     */
    test('「自社情報」リンクにアイコンが表示される (company-info/REQ-5.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「自社情報」リンク内にSVGアイコンが存在することを確認
      const header = page.locator('header');
      const companyInfoLink = header.getByRole('link', { name: '自社情報', exact: true });
      await expect(companyInfoLink).toBeVisible({ timeout: getTimeout(10000) });

      const icon = companyInfoLink.locator('svg');
      await expect(icon).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-5.2
     */
    test('「自社情報」リンクが「取引先」リンクの次に配置されている (company-info/REQ-5.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内のリンク位置を確認
      const header = page.locator('header');
      const nav = header.getByRole('navigation');
      const tradingPartnerLink = nav.getByRole('link', { name: '取引先', exact: true });
      const companyInfoLink = nav.getByRole('link', { name: '自社情報', exact: true });

      const tradingPartnerBox = await tradingPartnerLink.boundingBox();
      const companyInfoBox = await companyInfoLink.boundingBox();

      // 自社情報リンクが取引先リンクの右側（次）にあることを確認
      if (tradingPartnerBox && companyInfoBox) {
        expect(companyInfoBox.x).toBeGreaterThan(tradingPartnerBox.x);
      }
    });

    /**
     * ナビゲーションリンクの順序確認（ダッシュボード → プロジェクト → 取引先 → 自社情報）
     */
    test('ナビゲーションリンクの順序が正しい（ダッシュボード → プロジェクト → 取引先 → 自社情報）', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const header = page.locator('header');
      const nav = header.getByRole('navigation');

      const dashboardLink = nav.getByRole('link', { name: 'ダッシュボード', exact: true });
      const projectLink = nav.getByRole('link', { name: 'プロジェクト', exact: true });
      const tradingPartnerLink = nav.getByRole('link', { name: '取引先', exact: true });
      const companyInfoLink = nav.getByRole('link', { name: '自社情報', exact: true });

      const dashboardBox = await dashboardLink.boundingBox();
      const projectBox = await projectLink.boundingBox();
      const tradingPartnerBox = await tradingPartnerLink.boundingBox();
      const companyInfoBox = await companyInfoLink.boundingBox();

      // 順序を確認（左から右へ）
      if (dashboardBox && projectBox && tradingPartnerBox && companyInfoBox) {
        expect(projectBox.x).toBeGreaterThan(dashboardBox.x);
        expect(tradingPartnerBox.x).toBeGreaterThan(projectBox.x);
        expect(companyInfoBox.x).toBeGreaterThan(tradingPartnerBox.x);
      }
    });
  });

  /**
   * URL直接アクセスのテスト
   *
   * REQ-5.7: 自社情報ページを `/company-info` のURLで提供する
   */
  test.describe('URL直接アクセス', () => {
    /**
     * @requirement company-info/REQ-5.7
     */
    test('REQ-5.7: /company-info にアクセスすると自社情報ページが表示される (company-info/REQ-5.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // URLが /company-info であることを確認
      await expect(page).toHaveURL(/\/company-info$/);

      // 自社情報ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /自社情報/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * パンくずナビゲーションのテスト
   *
   * REQ-5.5: 自社情報ページに「ダッシュボード > 自社情報」のパンくずナビゲーションを表示する
   * REQ-5.6: ユーザーがパンくずナビゲーションの「ダッシュボード」をクリックしたとき、ダッシュボードページに遷移する
   */
  test.describe('パンくずナビゲーション', () => {
    /**
     * @requirement company-info/REQ-5.5
     */
    test('REQ-5.5: 自社情報ページでパンくず「ダッシュボード > 自社情報」が表示される (company-info/REQ-5.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByText('自社情報')).toBeVisible();
    });

    /**
     * @requirement company-info/REQ-5.6
     */
    test('REQ-5.6: パンくずの「ダッシュボード」リンクをクリックするとダッシュボードに遷移する (company-info/REQ-5.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // パンくずの「ダッシュボード」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await breadcrumb.getByRole('link', { name: /ダッシュボード/i }).click();

      // ダッシュボードに遷移することを確認
      await expect(page).toHaveURL(/^\/$/, { timeout: getTimeout(10000) });
    });
  });

  /**
   * 未認証アクセスのテスト
   */
  test.describe('未認証アクセス', () => {
    test('未認証状態で自社情報ページにアクセスするとログインページにリダイレクトされる', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/company-info');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });
  });
});
