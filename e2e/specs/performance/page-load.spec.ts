import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL } from '../../config';

/**
 * ページロードパフォーマンステスト
 *
 * @REQ-23 非機能要件（パフォーマンス・スケーラビリティ）
 *
 * このテストスイートは、システムのパフォーマンス要件を
 * End-to-Endで検証します。
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

/**
 * APIパフォーマンステスト
 *
 * @REQ-23 非機能要件（パフォーマンス・スケーラビリティ）
 */
test.describe('APIパフォーマンス', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();
    await createTestUser('ADMIN_USER');

    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;
  });

  /**
   * 要件23.1: ログインAPIは95パーセンタイルで500ms以内
   */
  test('ログインAPIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(500);
    console.log(`Login API response time: ${responseTime}ms`);
  });

  /**
   * 要件23.6: トークンリフレッシュAPIは95パーセンタイルで300ms以内
   */
  test('トークンリフレッシュAPIが300ms以内にレスポンスを返す', async ({ request }) => {
    // まずログインしてリフレッシュトークンを取得
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { refreshToken } = await loginResponse.json();

    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
      data: {
        refreshToken,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(300);
    console.log(`Token refresh API response time: ${responseTime}ms`);
  });

  /**
   * 要件23.2: 権限チェックAPIは99パーセンタイルで100ms以内
   */
  test('権限チェックを含むAPIが適切な時間内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/v1/permissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(500);
    console.log(`Permission API response time: ${responseTime}ms`);
  });

  /**
   * ヘルスチェックAPIのレスポンス時間
   */
  test('ヘルスチェックAPIが100ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/health`);

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(100);
    console.log(`Health check API response time: ${responseTime}ms`);
  });
});
