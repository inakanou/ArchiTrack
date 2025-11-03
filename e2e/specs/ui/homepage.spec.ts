import { test, expect } from '@playwright/test';
import { takeScreenshot, takeScreenshotOnFailure } from '../../helpers/screenshot.js';

/**
 * ホームページUIテスト
 */
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // 失敗時に自動的にスクリーンショットを撮影
  test.afterEach(async ({ page }, testInfo) => {
    await takeScreenshotOnFailure(page, testInfo);
  });

  test('フロントエンドが正常に起動すること', async ({ page }, testInfo) => {
    // ページタイトルが存在することを確認
    await expect(page).toHaveTitle(/ArchiTrack|Vite/);

    // スクリーンショットを撮影（タイムスタンプ付きフォルダに保存）
    await takeScreenshot(page, testInfo, 'homepage-loaded');
  });

  test('ページ要素が正しく表示されること', async ({ page }, testInfo) => {
    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // 基本的なDOM要素の存在確認
    // #root要素が存在し、子要素を持つことを確認（ReactがマウントされたことをLet's確認）
    const root = page.locator('#root');
    await expect(root).toBeAttached();

    // Reactコンテンツがレンダリングされるまで待機
    await expect(root.locator('*').first()).toBeVisible({ timeout: 10000 });

    // スクリーンショット撮影（タイムスタンプ付きフォルダに保存）
    await takeScreenshot(page, testInfo, 'page-elements', { fullPage: true });
  });
});
