import { test, expect } from '@playwright/test';

interface HealthCheckResponse {
  status: string;
  timestamp: string;
  services: {
    database: string;
    redis: string;
  };
}

/**
 * ヘルスチェックAPIテスト
 */
test.describe('Health Check API', () => {
  const API_BASE = 'http://localhost:3000';

  // テストの前にAPIが利用可能になるまで待機
  test.beforeAll(async ({ request }) => {
    // 最大30秒間、1秒ごとにヘルスチェックを試行
    let retries = 30;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        const response = await request.get(`${API_BASE}/health`, {
          timeout: 5000,
        });
        if (response.ok()) {
          return; // 成功したら抜ける
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries--;
    }

    throw new Error(`API not available after 30 seconds: ${lastError?.message || 'Unknown error'}`);
  });

  test('APIヘルスチェックが成功すること', async ({ request }) => {
    // バックエンドAPIのヘルスチェック
    const response = await request.get(`${API_BASE}/health`);

    // ステータスコードが200であることを確認
    expect(response.status()).toBe(200);

    // レスポンスボディを確認
    const body: HealthCheckResponse = await response.json();
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });

  test('レスポンスに必要なフィールドが含まれること', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    const body: HealthCheckResponse = await response.json();

    // 必須フィールドの確認
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('services');
  });
});
