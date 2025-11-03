import autocannon from 'autocannon';

/**
 * ヘルスチェックエンドポイントのパフォーマンステスト
 *
 * 目標:
 * - 平均レスポンスタイム: < 100ms
 * - スループット: > 1000 req/sec
 * - エラー率: < 1%
 */
async function runHealthCheckTest() {
  const result = await autocannon({
    url: 'http://localhost:3000/health',
    connections: 10,
    pipelining: 1,
    duration: 10,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  console.log('\n=== Health Check Performance Test Results ===');
  console.log(`Requests: ${result.requests.total}`);
  console.log(`Duration: ${result.duration}s`);
  console.log(`Throughput: ${result.requests.average} req/sec`);
  console.log(`Latency (avg): ${result.latency.mean}ms`);
  console.log(`Latency (p99): ${result.latency.p99}ms`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Timeouts: ${result.timeouts}`);

  // パフォーマンス基準のチェック
  const passed = result.latency.mean < 100 && result.requests.average > 1000 && result.errors === 0;

  if (passed) {
    console.log('\n✅ Performance test PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Performance test FAILED');
    if (result.latency.mean >= 100) {
      console.log(`  - Average latency (${result.latency.mean}ms) exceeds 100ms`);
    }
    if (result.requests.average <= 1000) {
      console.log(`  - Throughput (${result.requests.average} req/sec) below 1000 req/sec`);
    }
    if (result.errors > 0) {
      console.log(`  - ${result.errors} errors occurred`);
    }
    process.exit(1);
  }
}

runHealthCheckTest().catch((error) => {
  console.error('Performance test failed:', error);
  process.exit(1);
});
