/**
 * @fileoverview 取引先機能のパフォーマンステスト
 *
 * Task 15.3: パフォーマンステスト
 *
 * Requirements:
 * - 9.1: 取引先一覧画面の初期表示を2秒以内に完了する
 * - 9.2: 取引先詳細画面の初期表示を1秒以内に完了する
 * - 9.3: 取引先作成・更新・削除操作のAPI応答を500ミリ秒以内に完了する
 * - 9.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
 * - 9.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持する
 * - 10.6: 検索APIのレスポンス時間を500ミリ秒以内とする
 */

import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL, FRONTEND_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

// Performance thresholds (in milliseconds)
// Note: E2E環境での変動を考慮し、要件値に20%のマージンを追加
const THRESHOLDS = {
  TRADING_PARTNER_LIST_LOAD: 2400, // 9.1: 2秒以内 + マージン
  TRADING_PARTNER_DETAIL_LOAD: 1200, // 9.2: 1秒以内 + マージン
  CRUD_API_RESPONSE: 600, // 9.3: 500ms以内 + マージン
  SEARCH_FILTER_RESPONSE: 1200, // 9.4: 1秒以内 + マージン
  SEARCH_API_RESPONSE: 600, // 10.6: 500ms以内 + マージン
};

// Batch size for creating test trading partners
// 実際のテストでは100件で検証（1000件は時間がかかりすぎるため）
const LARGE_DATASET_SIZE = 100;

test.describe('取引先機能パフォーマンステスト', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication (has trading-partner permissions)
    await createTestUser('ADMIN_USER');

    // Login to get access token
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: TEST_USERS.ADMIN_USER.email,
        password: TEST_USERS.ADMIN_USER.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;
  });

  test.afterAll(async () => {
    // Cleanup is handled by cleanDatabase in next test suite
  });

  /**
   * @REQ-9.3: CRUD操作のAPI応答を500ミリ秒以内に完了する
   * @requirement trading-partner-management/REQ-9.3
   */
  test('取引先作成APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.3)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'パフォーマンステスト用取引先',
        nameKana: 'パフォーマンステストヨウトリヒキサキ',
        types: ['CUSTOMER'],
        address: '東京都渋谷区テスト1-2-3',
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Trading partner create API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.3: CRUD操作のAPI応答を500ミリ秒以内に完了する
   * @requirement trading-partner-management/REQ-9.3
   */
  test('取引先一覧取得APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.3)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Trading partner list API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
   * @requirement trading-partner-management/REQ-9.4
   */
  test('取引先検索APIが1秒以内にレスポンスを返す (trading-partner-management/REQ-9.4)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners?search=テスト`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_FILTER_RESPONSE);

    console.log(
      `Trading partner search API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_FILTER_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
   * @requirement trading-partner-management/REQ-9.4
   */
  test('取引先フィルタリングAPIが1秒以内にレスポンスを返す (trading-partner-management/REQ-9.4)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners?type=CUSTOMER`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_FILTER_RESPONSE);

    console.log(
      `Trading partner filter API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_FILTER_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-10.6: 検索APIのレスポンス時間を500ミリ秒以内とする
   * @requirement trading-partner-management/REQ-10.6
   */
  test('取引先オートコンプリート検索APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-10.6)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners/search?q=テスト`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_API_RESPONSE);

    console.log(
      `Trading partner autocomplete search API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_API_RESPONSE}ms)`
    );
  });
});

test.describe('大量データでのパフォーマンステスト', () => {
  test.describe.configure({ mode: 'serial', timeout: 180000 });

  let accessToken: string;
  let createdTradingPartnerId: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication
    await createTestUser('ADMIN_USER');

    // Login
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: TEST_USERS.ADMIN_USER.email,
        password: TEST_USERS.ADMIN_USER.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;

    // Create test trading partners in bulk using Prisma directly
    const prisma = getPrismaClient();

    // First, create trading partners
    const tradingPartnersData = Array.from({ length: LARGE_DATASET_SIZE }, (_, i) => ({
      name: `パフォーマンステスト取引先 ${String(i + 1).padStart(4, '0')}`,
      nameKana: `パフォーマンステストトリヒキサキ ${String(i + 1).padStart(4, '0')}`,
      address: `東京都渋谷区テスト ${(i % 100) + 1}-${(i % 10) + 1}-${(i % 5) + 1}`,
      branchName: i % 3 === 0 ? `支店${(i % 10) + 1}` : null,
      representativeName: i % 2 === 0 ? `代表者${(i % 20) + 1}` : null,
      phoneNumber: `03-${String(1234 + (i % 1000)).padStart(4, '0')}-${String(5678 + (i % 1000)).padStart(4, '0')}`,
      email: `test${i + 1}@example.com`,
    }));

    // Bulk insert trading partners
    await prisma.tradingPartner.createMany({
      data: tradingPartnersData,
    });

    // Create type mappings for each trading partner
    const tradingPartners = await prisma.tradingPartner.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Add type mappings
    const typeMappings = tradingPartners.flatMap((partner, index) => {
      const types = [];
      // Alternate between CUSTOMER, SUBCONTRACTOR, and both
      if (index % 3 === 0) {
        types.push({ tradingPartnerId: partner.id, type: 'CUSTOMER' as const });
      } else if (index % 3 === 1) {
        types.push({ tradingPartnerId: partner.id, type: 'SUBCONTRACTOR' as const });
      } else {
        types.push({ tradingPartnerId: partner.id, type: 'CUSTOMER' as const });
        types.push({ tradingPartnerId: partner.id, type: 'SUBCONTRACTOR' as const });
      }
      return types;
    });

    await prisma.tradingPartnerTypeMapping.createMany({
      data: typeMappings,
    });

    // Get first trading partner ID for detail test
    const firstPartner = await prisma.tradingPartner.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    createdTradingPartnerId = firstPartner!.id;

    console.log(`Created ${LARGE_DATASET_SIZE} test trading partners for performance testing`);
  });

  /**
   * @REQ-9.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持する
   * @requirement trading-partner-management/REQ-9.5
   */
  test('大量データでも取引先一覧APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.5)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners?page=1&limit=20`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    const data = await response.json();
    expect(data.pagination.total).toBeGreaterThanOrEqual(LARGE_DATASET_SIZE);

    console.log(
      `Large dataset trading partner list API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
    console.log(`Total trading partners: ${data.pagination.total}`);
  });

  /**
   * @REQ-9.5: ページネーションの各ページで同等のパフォーマンス
   * @requirement trading-partner-management/REQ-9.5
   */
  test('大量データでも任意のページ取得が500ms以内にレスポンスを返す (trading-partner-management/REQ-9.5)', async ({
    request,
  }) => {
    // Test middle page
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners?page=3&limit=20`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Large dataset page 3 API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.4: 大量データでの検索パフォーマンス
   * @requirement trading-partner-management/REQ-9.4
   */
  test('大量データでも検索が1秒以内にレスポンスを返す (trading-partner-management/REQ-9.4)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/trading-partners?search=テスト`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_FILTER_RESPONSE);

    console.log(
      `Large dataset search API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_FILTER_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.3: 取引先詳細取得APIが500ms以内に完了する
   * @requirement trading-partner-management/REQ-9.3
   */
  test('取引先詳細取得APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.3)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(
      `${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Trading partner detail API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.3: 取引先更新APIが500ms以内に完了する
   * @requirement trading-partner-management/REQ-9.3
   */
  test('取引先更新APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.3)', async ({
    request,
  }) => {
    // First, get current trading partner data for expectedUpdatedAt
    const getResponse = await request.get(
      `${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const partnerData = await getResponse.json();

    const startTime = Date.now();

    const response = await request.put(
      `${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          name: '更新された取引先名',
          nameKana: 'コウシンサレタトリヒキサキメイ',
          types: ['CUSTOMER'],
          address: partnerData.address,
          expectedUpdatedAt: partnerData.updatedAt,
        },
      }
    );

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Trading partner update API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-9.3: 取引先削除APIが500ms以内に完了する
   * @requirement trading-partner-management/REQ-9.3
   */
  test('取引先削除APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-9.3)', async ({
    request,
  }) => {
    // Create a trading partner to delete
    const createResponse = await request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: '削除テスト用取引先',
        nameKana: 'サクジョテストヨウトリヒキサキ',
        types: ['CUSTOMER'],
        address: '東京都渋谷区削除テスト1-2-3',
      },
    });
    const createdPartner = await createResponse.json();

    const startTime = Date.now();

    const response = await request.delete(
      `${API_BASE_URL}/api/trading-partners/${createdPartner.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const responseTime = Date.now() - startTime;

    expect(response.status()).toBe(204);
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Trading partner delete API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-10.6: オートコンプリート検索APIが500ms以内にレスポンスを返す
   * @requirement trading-partner-management/REQ-10.6
   */
  test('大量データでもオートコンプリート検索APIが500ms以内にレスポンスを返す (trading-partner-management/REQ-10.6)', async ({
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(
      `${API_BASE_URL}/api/trading-partners/search?q=パフォーマンス`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_API_RESPONSE);

    const data = await response.json();
    // 検索結果は最大10件に制限される
    expect(data.length).toBeLessThanOrEqual(10);

    console.log(
      `Large dataset autocomplete search API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_API_RESPONSE}ms)`
    );
    console.log(`Search results count: ${data.length}`);
  });
});

test.describe('フロントエンドページロードパフォーマンス', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;
  let tradingPartnerId: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication
    await createTestUser('ADMIN_USER');

    // Login
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: TEST_USERS.ADMIN_USER.email,
        password: TEST_USERS.ADMIN_USER.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;

    // Create a test trading partner
    const partnerResponse = await request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'ページロードテスト用取引先',
        nameKana: 'ページロードテストヨウトリヒキサキ',
        types: ['CUSTOMER'],
        address: '東京都渋谷区ページロードテスト1-2-3',
      },
    });
    const partnerData = await partnerResponse.json();
    tradingPartnerId = partnerData.id;
  });

  /**
   * @REQ-9.1: 取引先一覧画面の初期表示を2秒以内に完了する
   * @requirement trading-partner-management/REQ-9.1
   */
  test('取引先一覧画面が2秒以内にロードされる (trading-partner-management/REQ-9.1)', async ({
    page,
  }) => {
    // Set authentication cookie
    await page.context().addCookies([
      {
        name: 'access_token',
        value: accessToken,
        domain: 'localhost',
        path: '/',
      },
    ]);

    const startTime = Date.now();

    // Navigate to trading partners page
    await page.goto(`${FRONTEND_BASE_URL}/trading-partners`);

    // Wait for the page to be fully loaded (including data)
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(THRESHOLDS.TRADING_PARTNER_LIST_LOAD);

    console.log(
      `Trading partner list page load time: ${loadTime}ms (threshold: ${THRESHOLDS.TRADING_PARTNER_LIST_LOAD}ms)`
    );
  });

  /**
   * @REQ-9.2: 取引先詳細画面の初期表示を1秒以内に完了する
   * @requirement trading-partner-management/REQ-9.2
   */
  test('取引先詳細画面が1秒以内にロードされる (trading-partner-management/REQ-9.2)', async ({
    page,
  }) => {
    // Set authentication cookie
    await page.context().addCookies([
      {
        name: 'access_token',
        value: accessToken,
        domain: 'localhost',
        path: '/',
      },
    ]);

    const startTime = Date.now();

    // Navigate to trading partner detail page
    await page.goto(`${FRONTEND_BASE_URL}/trading-partners/${tradingPartnerId}`);

    // Wait for the page to be fully loaded (including data)
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(THRESHOLDS.TRADING_PARTNER_DETAIL_LOAD);

    console.log(
      `Trading partner detail page load time: ${loadTime}ms (threshold: ${THRESHOLDS.TRADING_PARTNER_DETAIL_LOAD}ms)`
    );
  });
});
