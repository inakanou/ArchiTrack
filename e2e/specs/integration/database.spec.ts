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
 * データベース統合テスト
 * PostgreSQLとRedisの接続状態を確認
 */
test.describe('Database Integration', () => {
  const API_BASE = 'http://localhost:3000';

  test('Postgresデータベース接続が正常であること', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();

    const health: HealthCheckResponse = await response.json();
    expect(health).toHaveProperty('services');
    expect(health.services).toHaveProperty('database');
    expect(health.services.database).toBe('connected');
  });

  test('Redis接続が正常であること', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();

    const health: HealthCheckResponse = await response.json();
    expect(health).toHaveProperty('services');
    expect(health.services).toHaveProperty('redis');
    expect(health.services.redis).toBe('connected');
  });

  test('すべてのサービスが正常に動作していること', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    const health: HealthCheckResponse = await response.json();

    // システム全体のステータスがOKであること
    expect(health.status).toBe('ok');

    // すべてのサービスが接続されていること
    expect(health.services.database).toBe('connected');
    expect(health.services.redis).toBe('connected');
  });
});
