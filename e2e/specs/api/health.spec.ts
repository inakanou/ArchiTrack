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
