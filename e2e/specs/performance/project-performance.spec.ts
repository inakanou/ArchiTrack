/**
 * @fileoverview プロジェクト機能のパフォーマンステスト
 *
 * ## 被覆の主張について（Task 115.177）
 *
 * 従前のヘッダは受入基準を `- 19.1:` と番号だけで並べ、各検証の直上も `@REQ-19.1:` と
 * 機能名を欠いた形だった。どちらも被覆の検査（`scripts/check-requirement-coverage.ts`）が
 * 読む形ではないため、6件を掲げながら抽出は零件だった。実際に判定しているのに
 * 被覆へ数えられない状態である。掲げた6件を一件ずつ確かめ、判定しているものだけを
 * 各検証の直上に `@requirement` として置き直した。
 *
 * 判定していないため落とした記載:
 * - REQ-19.4（検索・フィルタリング操作の**結果表示**を1秒以内に完了する）:
 *   本ファイルが測るのはAPIの応答時間だけであり、画面への結果表示の完了は測っていない。
 *   描画側が遅くなって規範が崩れても赤にならない
 * - REQ-19.5（**大量データ**でもページネーションにより一覧表示の性能を維持する）:
 *   投入件数は LARGE_DATASET_SIZE = 100 であり（下記の定義に「1000件は時間がかかりすぎる」と
 *   記されている）、要件が言う大量データを代表しない
 */

import { test, expect } from '@playwright/test';
import {
  cleanDatabase,
  cleanDatabaseAndRestoreTestData,
  getPrismaClient,
} from '../../fixtures/database';
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
   * @requirement project-management/REQ-19.3: 作成操作のAPI応答を500ミリ秒以内に完了する
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
   * @requirement project-management/REQ-17.9: 担当者選択が快適に動作するレスポンス時間
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
   * 無タグとする（Task 115.177）。REQ-19.3の規範は
   * 「プロジェクト作成・更新・削除操作のAPI応答を500ミリ秒以内に完了する」であり、
   * 読み取り（一覧取得）は規範の対象外である。閾値定数を共有しているだけで規範は異なるため、
   * 規範の外へ数値を紐付けないよう意図的に主張しない。REQ-19.3は
   * 作成・更新・削除の各検証で独立に判定している。
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
   * 検索APIの応答時間だけを測る。REQ-19.4 の規範は「結果**表示**を1秒以内に完了する」で
   * あり、描画の完了は測っていないため、意図して番号を持たない（Task 115.177）。
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
   * フィルタAPIの応答時間だけを測る。REQ-19.4 の規範は「結果**表示**を1秒以内に完了する」で
   * あり、描画の完了は測っていないため、意図して番号を持たない（Task 115.177）。
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
   * 100件での一覧取得の応答時間を測る。REQ-19.5 が言う大量データを代表しないため、
   * 意図して番号を持たない（Task 115.177）。
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
   * 100件でのページ取得の応答時間を測る。REQ-19.5 が言う大量データを代表しないため、
   * 意図して番号を持たない（Task 115.177）。
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
   * 100件での検索APIの応答時間を測る。REQ-19.4 の「結果表示」も REQ-19.5 の「大量データ」も
   * 代表しないため、意図して番号を持たない（Task 115.177）。
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
   * 無タグとする（Task 115.177）。REQ-19.3の規範は
   * 「プロジェクト作成・更新・削除操作のAPI応答を500ミリ秒以内に完了する」であり、
   * 読み取り（詳細取得）は規範の対象外である。閾値定数を共有しているだけで規範は異なるため、
   * 規範の外へ数値を紐付けないよう意図的に主張しない。REQ-19.3は
   * 作成・更新・削除の各検証で独立に判定している。
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
   * @requirement project-management/REQ-19.3: 更新操作のAPI応答を500ミリ秒以内に完了する
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
   * @requirement project-management/REQ-19.3: 削除操作のAPI応答を500ミリ秒以内に完了する
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
   * @requirement project-management/REQ-19.1: 一覧画面の初期表示を2秒以内に完了する
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
   * @requirement project-management/REQ-19.2: 詳細画面の初期表示を1秒以内に完了する
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

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after performance tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
