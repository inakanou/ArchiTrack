import { test, expect } from '@playwright/test';
import { cleanDatabase, cleanDatabaseAndRestoreTestData } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL } from '../../config';

/**
 * ページロードパフォーマンステスト
 *
 * 要件: ページロード時間が2秒以内であること
 *
 * ## 被覆の主張を持たない理由（Task 115.177）
 *
 * 従前は本ファイル全体に要件23、各検証に受入基準23.1などを掲げていた。
 * 機能名を欠く形なので被覆の検査には一度も届いていなかったが、届く形へ直すのではなく
 * 記載のほうを落とした。掲げていた受入基準の規範を、ここの主張は確かめていないためである。
 *
 * - REQ-23.1（ログインAPIは**95パーセンタイル**で500ms以内）・REQ-23.6（同・300ms以内）:
 *   ここで測るのは一回きりの標本である。分位が閾値を超えても単発の計測は閾値内に収まりうるため、
 *   規範が崩れても赤にならない
 * - REQ-23.2（権限チェックAPIは99パーセンタイルで**100ms**以内）:
 *   権限APIの検証が用いる閾値は500msであり、要件の閾値を判定していない
 * - REQ-23.8（適切なインデックスを使用してクエリ時間を最小限に維持する）:
 *   索引の使用は応答時間からは言えない
 *
 * これらは e2e/requirement-exclusions.json でE2E対象外（負荷試験・EXPLAIN ANALYZE）として
 * 扱われている。ここの計測は退行の早期検知に有用だが、被覆の主張ではない。
 */
test.describe('ページロードパフォーマンス', () => {
  /**
   * ログイン画面の表示時間。被覆の主張は持たない（冒頭の理由を参照）。
   */
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

  /**
   * ダッシュボードの表示時間。被覆の主張は持たない（冒頭の理由を参照）。
   */
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

  /**
   * プロフィール画面の表示時間。被覆の主張は持たない（冒頭の理由を参照）。
   */
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
 * 被覆の主張は持たない（冒頭の理由を参照）。
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
   * ログインAPIの応答時間を一回だけ測る。要件が言う95パーセンタイルではないため、
   * 被覆の主張は持たない（冒頭の理由を参照）。
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
   * リフレッシュAPIの応答時間を一回だけ測る。要件が言う95パーセンタイルではないため、
   * 被覆の主張は持たない（冒頭の理由を参照）。
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
   * 権限APIの応答時間を一回だけ測る。閾値は500msであり要件の100msではないため、
   * 被覆の主張は持たない（冒頭の理由を参照）。
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
   * ヘルスチェックAPIの応答時間。権限チェックAPIではないため、
   * 被覆の主張は持たない（冒頭の理由を参照）。
   */
  test('ヘルスチェックAPIが100ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/health`);

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(100);
    console.log(`Health check API response time: ${responseTime}ms`);
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after page-load performance tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
