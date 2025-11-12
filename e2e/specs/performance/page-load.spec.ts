import { test, expect } from '@playwright/test';

/**
 * ページロードパフォーマンステスト
 *
 * 要件: ページロード時間が2秒以内であること
 */
test.describe('ページロードパフォーマンス', () => {
  test('ログインページが2秒以内にロードされる', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/login');

    // DOMContentLoadedイベントを待つ
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // ページロード時間が2秒以内であることを確認
    expect(loadTime).toBeLessThan(2000);

    // コンソールにロード時間を出力
    console.log(`Login page load time: ${loadTime}ms`);
  });

  test('ダッシュボードページが2秒以内にロードされる', async ({ page, context }) => {
    // 認証済みユーザーとしてログイン
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    const startTime = Date.now();

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(2000);
    console.log(`Dashboard page load time: ${loadTime}ms`);
  });

  test('プロフィールページが2秒以内にロードされる', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'test-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    const startTime = Date.now();

    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(2000);
    console.log(`Profile page load time: ${loadTime}ms`);
  });
});
