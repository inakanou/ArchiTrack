import { test, expect } from '@playwright/test';

/**
 * ホームページUIテスト
 */
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('フロントエンドが正常に起動すること', async ({ page }) => {
    // ページタイトルが存在することを確認
    await expect(page).toHaveTitle(/ArchiTrack|Vite/);

    // スクリーンショットを撮影（デバッグ用）
    await page.screenshot({
      path: 'playwright-report/screenshots/homepage.png',
    });
  });

  test('ページ要素が正しく表示されること', async ({ page }) => {
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // 基本的なDOM要素の存在確認
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // スクリーンショット撮影
    await page.screenshot({
      path: 'playwright-report/screenshots/page-elements.png',
      fullPage: true,
    });
  });
});
