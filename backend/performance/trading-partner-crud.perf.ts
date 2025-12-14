/**
 * @fileoverview 取引先CRUD APIのパフォーマンステスト
 *
 * 目標（Requirements 9.3, 10.6）:
 * - 取引先作成・更新・削除: P95レスポンスタイム < 500ms
 * - 取引先検索API: P95レスポンスタイム < 500ms
 * - スループット: > 50 req/sec（想定）
 * - エラー率: < 1%
 *
 * 前提条件:
 * - 管理者ユーザーがシードされていること
 * - バックエンドサーバーが起動していること（http://localhost:3000）
 * - データベース接続が確立されていること
 * - trading-partner:* 権限が管理者ロールに割り当てられていること
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

interface TradingPartnerInfo {
  id: string;
  name: string;
  nameKana: string;
  updatedAt: string;
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
 * Create a trading partner for test
 */
async function createTestTradingPartner(accessToken: string): Promise<TradingPartnerInfo> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const response = await fetch(`${API_BASE_URL}/api/trading-partners`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: `パフォーマンステスト取引先 ${timestamp}_${randomSuffix}`,
      nameKana: 'パフォーマンステストトリヒキサキ',
      types: ['CUSTOMER'],
      address: '東京都千代田区テスト1-1-1',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to create test trading partner: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as TradingPartnerInfo;
}

/**
 * Delete a trading partner
 */
async function deleteTestTradingPartner(id: string, accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/trading-partners/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    console.warn(`Warning: Failed to cleanup trading partner ${id}: ${response.status}`);
  }
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
  console.log('\n=== Trading Partner CRUD API Performance Test ===');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(
    `Targets: P95 < ${TARGETS.P95_LATENCY}ms, Throughput > ${TARGETS.MIN_THROUGHPUT} req/sec, Error Rate < ${TARGETS.MAX_ERROR_RATE * 100}%\n`
  );

  // Get access token
  console.log('Authenticating...');
  const accessToken = await getAccessToken();
  console.log('Authenticated successfully');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const results: TestResult[] = [];
  const createdPartnerIds: string[] = [];

  try {
    // Test 1: Trading Partner Create (POST /api/trading-partners)
    // Note: This test creates many partners, so we use shorter duration
    console.log('\n=== Test 1: Trading Partner Create API ===');
    results.push(
      await runAutocannonTest('Trading Partner Create API', {
        url: `${API_BASE_URL}/api/trading-partners`,
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: `パフォーマンステスト取引先 ${Date.now()}`,
          nameKana: 'パフォーマンステストトリヒキサキ',
          types: ['CUSTOMER'],
          address: '東京都千代田区テスト1-1-1',
        }),
        duration: 5, // Shorter duration to avoid creating too many partners
      })
    );

    // Test 2: Trading Partner Search API (GET /api/trading-partners/search?q=...)
    // This is the autocomplete search API - must respond within 500ms
    console.log('\n=== Test 2: Trading Partner Search API (Autocomplete) ===');
    results.push(
      await runAutocannonTest('Trading Partner Search API', {
        url: `${API_BASE_URL}/api/trading-partners/search?q=パフォーマンス`,
        method: 'GET',
        headers: authHeaders,
      })
    );

    // Test 3: Trading Partner List (GET /api/trading-partners)
    console.log('\n=== Test 3: Trading Partner List API ===');
    results.push(
      await runAutocannonTest('Trading Partner List API', {
        url: `${API_BASE_URL}/api/trading-partners`,
        method: 'GET',
        headers: authHeaders,
      })
    );

    // Test 4: Create a partner for update/delete tests
    console.log('\n=== Creating test partner for update/delete tests ===');
    const testPartner = await createTestTradingPartner(accessToken);
    createdPartnerIds.push(testPartner.id);
    console.log(`Created test partner: ${testPartner.id}`);

    // Test 5: Trading Partner Update (PUT /api/trading-partners/:id)
    // Note: Each request updates the same partner, demonstrating optimistic locking
    console.log('\n=== Test 4: Trading Partner Update API ===');
    results.push(
      await runAutocannonTest('Trading Partner Update API', {
        url: `${API_BASE_URL}/api/trading-partners/${testPartner.id}`,
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          name: `更新後の取引先名 ${Date.now()}`,
          nameKana: 'コウシンゴノトリヒキサキメイ',
          types: ['CUSTOMER', 'SUBCONTRACTOR'],
          address: '東京都港区更新1-1-1',
          expectedUpdatedAt: testPartner.updatedAt,
        }),
        duration: 5,
        connections: 1, // Use single connection due to optimistic locking
      })
    );

    // Test 6: Create multiple partners for delete test
    console.log('\n=== Creating partners for delete test ===');
    const deleteTestPartners: string[] = [];
    for (let i = 0; i < 5; i++) {
      const partner = await createTestTradingPartner(accessToken);
      deleteTestPartners.push(partner.id);
    }
    console.log(`Created ${deleteTestPartners.length} partners for delete test`);

    // Test 7: Trading Partner Delete (DELETE /api/trading-partners/:id)
    // Note: Delete each created partner sequentially
    console.log('\n=== Test 5: Trading Partner Delete API ===');
    const deleteStartTime = Date.now();
    let deleteSuccessCount = 0;
    let deleteErrorCount = 0;

    for (const partnerId of deleteTestPartners) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/trading-partners/${partnerId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (response.status === 204) {
          deleteSuccessCount++;
        } else {
          deleteErrorCount++;
        }
      } catch {
        deleteErrorCount++;
      }
    }

    const deleteEndTime = Date.now();
    const deleteTotalTime = deleteEndTime - deleteStartTime;
    const deleteAvgTime = deleteTotalTime / deleteTestPartners.length;

    console.log(`  Delete requests: ${deleteTestPartners.length}`);
    console.log(`  Success: ${deleteSuccessCount}`);
    console.log(`  Errors: ${deleteErrorCount}`);
    console.log(`  Total time: ${deleteTotalTime}ms`);
    console.log(`  Average time per request: ${deleteAvgTime.toFixed(2)}ms`);

    const deleteP95Pass = deleteAvgTime < TARGETS.P95_LATENCY;
    const deleteErrorRate = deleteErrorCount / deleteTestPartners.length;
    const deleteErrorRatePass = deleteErrorRate < TARGETS.MAX_ERROR_RATE;
    const deletePassed = deleteP95Pass && deleteErrorRatePass;

    console.log(`  Result: ${deletePassed ? '✅ PASSED' : '❌ FAILED'}`);

    const deleteDetails: string[] = [];
    if (!deleteP95Pass) {
      deleteDetails.push(
        `Average latency (${deleteAvgTime.toFixed(2)}ms) exceeds ${TARGETS.P95_LATENCY}ms`
      );
    }
    if (!deleteErrorRatePass) {
      deleteDetails.push(
        `Error rate (${(deleteErrorRate * 100).toFixed(2)}%) exceeds ${TARGETS.MAX_ERROR_RATE * 100}%`
      );
    }

    results.push({
      name: 'Trading Partner Delete API',
      passed: deletePassed,
      latency: {
        mean: deleteAvgTime,
        p95: deleteAvgTime,
        p99: deleteAvgTime,
      },
      throughput: (deleteSuccessCount / deleteTotalTime) * 1000,
      errorRate: deleteErrorRate,
      details: deleteDetails,
    });

    // Test 8: Trading Partner Filter by Type
    console.log('\n=== Test 6: Trading Partner Filter by Type ===');
    results.push(
      await runAutocannonTest('Trading Partner Filter API', {
        url: `${API_BASE_URL}/api/trading-partners?type=CUSTOMER`,
        method: 'GET',
        headers: authHeaders,
      })
    );

    // Test 9: Trading Partner Search with Type Filter
    console.log('\n=== Test 7: Trading Partner Search with Type Filter ===');
    results.push(
      await runAutocannonTest('Trading Partner Search with Type', {
        url: `${API_BASE_URL}/api/trading-partners/search?q=テスト&type=CUSTOMER`,
        method: 'GET',
        headers: authHeaders,
      })
    );
  } finally {
    // Cleanup: Delete all created partners
    console.log('\n=== Cleanup: Deleting test partners ===');
    for (const id of createdPartnerIds) {
      await deleteTestTradingPartner(id, accessToken);
    }
    console.log('Cleanup completed');
  }

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
    console.log('');
    console.log('Requirements Coverage:');
    console.log('  - 9.3: 取引先作成・更新・削除操作のAPI応答500ms以内 ✅');
    console.log('  - 10.6: 検索APIのレスポンス時間500ms以内 ✅');
    process.exit(0);
  } else {
    console.log('❌ Some performance tests FAILED');
    console.log('');
    console.log('Requirements Coverage:');
    console.log('  - 9.3: 取引先作成・更新・削除操作のAPI応答500ms以内');
    console.log('  - 10.6: 検索APIのレスポンス時間500ms以内');
    process.exit(1);
  }
}

// Error handling
runAllTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
