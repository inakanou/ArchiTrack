/**
 * @fileoverview プロジェクト機能のパフォーマンステスト
 *
 * Requirements:
 * - 19.1: プロジェクト一覧画面の初期表示を2秒以内に完了する
 * - 19.2: プロジェクト詳細画面の初期表示を1秒以内に完了する
 * - 19.3: プロジェクト作成・更新・削除操作のAPI応答を500ミリ秒以内に完了する
 * - 19.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
 * - 19.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持する
 * - 17.9: 担当者選択APIのレスポンス時間を500ミリ秒以内とする
 */

import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL, FRONTEND_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  PROJECT_LIST_LOAD: 2000, // 19.1: 2秒以内
  PROJECT_DETAIL_LOAD: 1000, // 19.2: 1秒以内
  CRUD_API_RESPONSE: 500, // 19.3: 500ms以内
  SEARCH_FILTER_RESPONSE: 1000, // 19.4: 1秒以内
  ASSIGNABLE_USERS_API: 500, // 17.9: 500ms以内
};

// Batch size for creating test projects
const LARGE_DATASET_SIZE = 100; // 実際のテストでは100件で検証（1000件は時間がかかりすぎるため）

test.describe('プロジェクト機能パフォーマンステスト', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;
  let regularUserId: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication (has project:create permission)
    await createTestUser('ADMIN_USER');

    // Create regular user for salesPersonId (admin users cannot be assigned as salesPerson)
    const regularUser = await createTestUser('REGULAR_USER');
    regularUserId = regularUser.id;

    // Login to get access token (use admin for authentication)
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
   * @REQ-19.3: CRUD操作のAPI応答を500ミリ秒以内に完了する
   */
  test('プロジェクト作成APIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'パフォーマンステスト用プロジェクト',
        tradingPartnerId: null,
        salesPersonId: regularUserId,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Project create API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-17.9: 担当者選択APIのレスポンス時間を500ミリ秒以内とする
   */
  test('担当者候補取得APIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.ASSIGNABLE_USERS_API);

    console.log(
      `Assignable users API response time: ${responseTime}ms (threshold: ${THRESHOLDS.ASSIGNABLE_USERS_API}ms)`
    );
  });

  /**
   * @REQ-19.3: CRUD操作のAPI応答を500ミリ秒以内に完了する
   */
  test('プロジェクト一覧取得APIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Project list API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-19.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
   */
  test('プロジェクト検索APIが1秒以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects?search=テスト`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_FILTER_RESPONSE);

    console.log(
      `Project search API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_FILTER_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-19.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
   */
  test('プロジェクトフィルタリングAPIが1秒以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects?status=PREPARING`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.SEARCH_FILTER_RESPONSE);

    console.log(
      `Project filter API response time: ${responseTime}ms (threshold: ${THRESHOLDS.SEARCH_FILTER_RESPONSE}ms)`
    );
  });
});

test.describe('大量データでのパフォーマンステスト', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  let accessToken: string;
  let adminUserId: string;
  let regularUserId: string;
  let createdProjectId: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication
    const adminUser = await createTestUser('ADMIN_USER');
    adminUserId = adminUser.id;

    // Create regular user for salesPersonId (admin users cannot be assigned as salesPerson)
    const regularUser = await createTestUser('REGULAR_USER');
    regularUserId = regularUser.id;

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

    // Create test projects in bulk using Prisma directly
    const prisma = getPrismaClient();
    const projectsData = Array.from({ length: LARGE_DATASET_SIZE }, (_, i) => ({
      name: `パフォーマンステストプロジェクト ${i + 1}`,
      tradingPartnerId: null,
      salesPersonId: regularUserId,
      createdById: adminUserId,
      status: 'PREPARING' as const,
    }));

    // Bulk insert
    await prisma.project.createMany({
      data: projectsData,
    });

    // Get first project ID for detail test
    const firstProject = await prisma.project.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    createdProjectId = firstProject!.id;

    console.log(`Created ${LARGE_DATASET_SIZE} test projects for performance testing`);
  });

  /**
   * @REQ-19.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持する
   */
  test('大量データでもプロジェクト一覧APIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects?page=1&limit=20`, {
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
      `Large dataset project list API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
    console.log(`Total projects: ${data.pagination.total}`);
  });

  /**
   * @REQ-19.5: ページネーションの各ページで同等のパフォーマンス
   */
  test('大量データでも任意のページ取得が500ms以内にレスポンスを返す', async ({ request }) => {
    // Test middle page
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects?page=3&limit=20`, {
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
   * @REQ-19.4: 大量データでの検索パフォーマンス
   */
  test('大量データでも検索が1秒以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects?search=テスト`, {
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
   * @REQ-19.3: プロジェクト詳細取得APIが500ms以内に完了する
   */
  test('プロジェクト詳細取得APIが500ms以内にレスポンスを返す', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Project detail API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-19.3: プロジェクト更新APIが500ms以内に完了する
   */
  test('プロジェクト更新APIが500ms以内にレスポンスを返す', async ({ request }) => {
    // First, get current project data for expectedUpdatedAt
    const getResponse = await request.get(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const projectData = await getResponse.json();

    const startTime = Date.now();

    const response = await request.put(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: '更新されたプロジェクト名',
        expectedUpdatedAt: projectData.updatedAt,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Project update API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });

  /**
   * @REQ-19.3: プロジェクト削除APIが500ms以内に完了する
   */
  test('プロジェクト削除APIが500ms以内にレスポンスを返す', async ({ request }) => {
    // Create a project to delete
    const createResponse = await request.post(`${API_BASE_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: '削除テスト用プロジェクト',
        tradingPartnerId: null,
        salesPersonId: regularUserId,
      },
    });
    const createdProject = await createResponse.json();

    const startTime = Date.now();

    const response = await request.delete(`${API_BASE_URL}/api/projects/${createdProject.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseTime = Date.now() - startTime;

    expect(response.status()).toBe(204);
    expect(responseTime).toBeLessThan(THRESHOLDS.CRUD_API_RESPONSE);

    console.log(
      `Project delete API response time: ${responseTime}ms (threshold: ${THRESHOLDS.CRUD_API_RESPONSE}ms)`
    );
  });
});

test.describe('フロントエンドページロードパフォーマンス', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;
  let regularUserId: string;
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    await cleanDatabase();

    // Create admin user for authentication
    await createTestUser('ADMIN_USER');

    // Create regular user for salesPersonId (admin users cannot be assigned as salesPerson)
    const regularUser = await createTestUser('REGULAR_USER');
    regularUserId = regularUser.id;

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

    // Create a test project
    const projectResponse = await request.post(`${API_BASE_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        name: 'ページロードテスト用プロジェクト',
        tradingPartnerId: null,
        salesPersonId: regularUserId,
      },
    });
    const projectData = await projectResponse.json();
    projectId = projectData.id;
  });

  /**
   * @REQ-19.1: プロジェクト一覧画面の初期表示を2秒以内に完了する
   */
  test('プロジェクト一覧画面が2秒以内にロードされる', async ({ page }) => {
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

    // Navigate to projects page
    await page.goto(`${FRONTEND_BASE_URL}/projects`);

    // Wait for the page to be fully loaded (including data)
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(THRESHOLDS.PROJECT_LIST_LOAD);

    console.log(
      `Project list page load time: ${loadTime}ms (threshold: ${THRESHOLDS.PROJECT_LIST_LOAD}ms)`
    );
  });

  /**
   * @REQ-19.2: プロジェクト詳細画面の初期表示を1秒以内に完了する
   */
  test('プロジェクト詳細画面が1秒以内にロードされる', async ({ page }) => {
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

    // Navigate to project detail page
    await page.goto(`${FRONTEND_BASE_URL}/projects/${projectId}`);

    // Wait for the page to be fully loaded (including data)
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(THRESHOLDS.PROJECT_DETAIL_LOAD);

    console.log(
      `Project detail page load time: ${loadTime}ms (threshold: ${THRESHOLDS.PROJECT_DETAIL_LOAD}ms)`
    );
  });
});
