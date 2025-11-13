import autocannon from 'autocannon';

/**
 * トークンリフレッシュAPIエンドポイントのパフォーマンステスト
 *
 * 目標（要件23.6）:
 * - 95パーセンタイルレスポンスタイム: < 300ms
 * - スループット: > 200 req/sec（想定）
 * - エラー率: < 1%
 *
 * 前提条件:
 * - 管理者ユーザーがシードされていること（npm run prisma:seed）
 * - バックエンドサーバーが起動していること（http://localhost:3000）
 * - データベース接続が確立されていること
 * - 有効なリフレッシュトークンが取得されていること
 *
 * 注意:
 * - このテストは実際のリフレッシュトークンを使用するため、
 *   事前にログインしてトークンを取得する必要があります
 */

/**
 * ログインして有効なリフレッシュトークンを取得
 */
async function getRefreshToken(): Promise<string> {
  const response = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.INITIAL_ADMIN_PASSWORD || 'AdminTest123!@#',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to login: ${response.statusText}`);
  }

  const data = (await response.json()) as { refreshToken: string };
  return data.refreshToken;
}

async function runTokenRefreshTest() {
  console.log('\n=== Starting Token Refresh API Performance Test ===\n');

  // 事前にリフレッシュトークンを取得
  console.log('Getting refresh token...');
  const refreshToken = await getRefreshToken();
  console.log('Refresh token obtained ✓\n');

  const result = await autocannon({
    url: 'http://localhost:3000/api/v1/auth/refresh',
    method: 'POST',
    connections: 10,
    pipelining: 1,
    duration: 10,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refreshToken,
    }),
  });

  console.log('\n=== Token Refresh API Performance Test Results ===');
  console.log(`Requests: ${result.requests.total}`);
  console.log(`Duration: ${result.duration}s`);
  console.log(`Throughput: ${result.requests.average} req/sec`);
  console.log(`Latency (avg): ${result.latency.mean}ms`);
  console.log(`Latency (p50): ${result.latency.p50}ms`);
  console.log(`Latency (p95): ${result.latency.p95}ms`);
  console.log(`Latency (p99): ${result.latency.p99}ms`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Timeouts: ${result.timeouts}`);
  console.log(`Non-2xx responses: ${result.non2xx}`);

  // パフォーマンス基準のチェック（要件23.6）
  const p95Target = 300; // ms
  const throughputTarget = 200; // req/sec
  const errorRateTarget = 0.01; // 1%

  const errorRate = result.errors / result.requests.total;
  const p95Pass = result.latency.p95 < p95Target;
  const throughputPass = result.requests.average > throughputTarget;
  const errorRatePass = errorRate < errorRateTarget;

  console.log('\n=== Performance Criteria Check ===');
  console.log(`✓ P95 Latency: ${result.latency.p95}ms ${p95Pass ? '< 300ms ✅' : '>= 300ms ❌'}`);
  console.log(
    `✓ Throughput: ${result.requests.average} req/sec ${throughputPass ? '> 200 req/sec ✅' : '<= 200 req/sec ❌'}`
  );
  console.log(
    `✓ Error Rate: ${(errorRate * 100).toFixed(2)}% ${errorRatePass ? '< 1% ✅' : '>= 1% ❌'}`
  );

  const passed = p95Pass && throughputPass && errorRatePass;

  if (passed) {
    console.log('\n✅ Performance test PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Performance test FAILED');
    if (!p95Pass) {
      console.log(`  - P95 latency (${result.latency.p95}ms) exceeds 300ms`);
    }
    if (!throughputPass) {
      console.log(`  - Throughput (${result.requests.average} req/sec) below 200 req/sec`);
    }
    if (!errorRatePass) {
      console.log(`  - Error rate (${(errorRate * 100).toFixed(2)}%) exceeds 1%`);
    }
    process.exit(1);
  }
}

// エラーハンドリング
runTokenRefreshTest().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
