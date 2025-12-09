/**
 * @fileoverview プロジェクトCRUD APIのパフォーマンステスト
 *
 * 目標（Requirements 19.3, 17.9）:
 * - プロジェクト作成・更新・削除: P95レスポンスタイム < 500ms
 * - プロジェクト一覧取得: P95レスポンスタイム < 500ms
 * - 担当者候補取得: P95レスポンスタイム < 500ms
 * - スループット: > 50 req/sec（想定）
 * - エラー率: < 1%
 *
 * 前提条件:
 * - 管理者ユーザーがシードされていること
 * - バックエンドサーバーが起動していること（http://localhost:3000）
 * - データベース接続が確立されていること
 */

import autocannon from 'autocannon';

// API base URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test credentials (from seed data)
const TEST_EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'AdminTest123!@#';

// Performance targets
const TARGETS = {
  P95_LATENCY: 500, // ms
  MIN_THROUGHPUT: 50, // req/sec
  MAX_ERROR_RATE: 0.01, // 1%
};

interface TestResult {
  name: string;
  passed: boolean;
  latency: {
    mean: number;
    p95: number;
    p99: number;
  };
  throughput: number;
  errorRate: number;
  details: string[];
}

/**
 * Login and get access token
 */
async function getAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
}

/**
 * Get admin user ID from API
 */
async function getAdminUserId(accessToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Run autocannon test with given options
 */
async function runAutocannonTest(
  name: string,
  options: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers: Record<string, string>;
    body?: string;
    connections?: number;
    duration?: number;
  }
): Promise<TestResult> {
  console.log(`\n--- Running: ${name} ---`);

  const result = await autocannon({
    url: options.url,
    method: options.method || 'GET',
    connections: options.connections || 10,
    pipelining: 1,
    duration: options.duration || 10,
    headers: options.headers,
    body: options.body,
  });

  const errorRate = result.errors / result.requests.total;
  const p95Pass = result.latency.p95 < TARGETS.P95_LATENCY;
  const throughputPass = result.requests.average > TARGETS.MIN_THROUGHPUT;
  const errorRatePass = errorRate < TARGETS.MAX_ERROR_RATE;
  const passed = p95Pass && throughputPass && errorRatePass;

  const details: string[] = [];
  if (!p95Pass) {
    details.push(`P95 latency (${result.latency.p95}ms) exceeds ${TARGETS.P95_LATENCY}ms`);
  }
  if (!throughputPass) {
    details.push(
      `Throughput (${result.requests.average} req/sec) below ${TARGETS.MIN_THROUGHPUT} req/sec`
    );
  }
  if (!errorRatePass) {
    details.push(
      `Error rate (${(errorRate * 100).toFixed(2)}%) exceeds ${TARGETS.MAX_ERROR_RATE * 100}%`
    );
  }

  console.log(`  Requests: ${result.requests.total}`);
  console.log(`  Throughput: ${result.requests.average} req/sec`);
  console.log(`  Latency (avg): ${result.latency.mean}ms`);
  console.log(`  Latency (P95): ${result.latency.p95}ms`);
  console.log(`  Latency (P99): ${result.latency.p99}ms`);
  console.log(`  Errors: ${result.errors}`);
  console.log(`  Non-2xx: ${result.non2xx}`);
  console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);

  return {
    name,
    passed,
    latency: {
      mean: result.latency.mean,
      p95: result.latency.p95,
      p99: result.latency.p99,
    },
    throughput: result.requests.average,
    errorRate,
    details,
  };
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log('\n=== Project CRUD API Performance Test ===');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(
    `Targets: P95 < ${TARGETS.P95_LATENCY}ms, Throughput > ${TARGETS.MIN_THROUGHPUT} req/sec, Error Rate < ${TARGETS.MAX_ERROR_RATE * 100}%\n`
  );

  // Get access token
  console.log('Authenticating...');
  const accessToken = await getAccessToken();
  const adminUserId = await getAdminUserId(accessToken);
  console.log(`Authenticated as user: ${adminUserId}`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const results: TestResult[] = [];

  // Test 1: Project List (GET /api/projects)
  results.push(
    await runAutocannonTest('Project List API', {
      url: `${API_BASE_URL}/api/projects`,
      method: 'GET',
      headers: authHeaders,
    })
  );

  // Test 2: Project Create (POST /api/projects)
  // Note: This test creates many projects, so we use shorter duration
  results.push(
    await runAutocannonTest('Project Create API', {
      url: `${API_BASE_URL}/api/projects`,
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `パフォーマンステストプロジェクト ${Date.now()}`,
        customerName: 'テスト顧客',
        salesPersonId: adminUserId,
      }),
      duration: 5, // Shorter duration to avoid creating too many projects
    })
  );

  // Test 3: Assignable Users (GET /api/users/assignable)
  results.push(
    await runAutocannonTest('Assignable Users API', {
      url: `${API_BASE_URL}/api/users/assignable`,
      method: 'GET',
      headers: authHeaders,
    })
  );

  // Test 4: Project Search (GET /api/projects?search=テスト)
  results.push(
    await runAutocannonTest('Project Search API', {
      url: `${API_BASE_URL}/api/projects?search=テスト`,
      method: 'GET',
      headers: authHeaders,
    })
  );

  // Test 5: Project Filter (GET /api/projects?status=PREPARING)
  results.push(
    await runAutocannonTest('Project Filter API', {
      url: `${API_BASE_URL}/api/projects?status=PREPARING`,
      method: 'GET',
      headers: authHeaders,
    })
  );

  // Print summary
  console.log('\n=== Performance Test Summary ===');
  console.log('');

  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(
      `${status} ${result.name}: P95=${result.latency.p95}ms, Throughput=${result.throughput.toFixed(1)} req/sec`
    );
    if (!result.passed) {
      allPassed = false;
      for (const detail of result.details) {
        console.log(`   ⚠️  ${detail}`);
      }
    }
  }

  console.log('');
  if (allPassed) {
    console.log('✅ All performance tests PASSED');
    process.exit(0);
  } else {
    console.log('❌ Some performance tests FAILED');
    process.exit(1);
  }
}

// Error handling
runAllTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
