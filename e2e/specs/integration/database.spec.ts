import { test, expect } from '@playwright/test';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

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
  // テストの前にAPIが利用可能になるまで待機
  test.beforeAll(async ({ request }) => {
    let retries = 30;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        const response = await request.get(`${API_BASE_URL}/health`, {
          timeout: getTimeout(5000),
        });
        if (response.ok()) {
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries--;
    }

    throw new Error(`API not available after 30 seconds: ${lastError?.message || 'Unknown error'}`);
  });

  test('Postgresデータベース接続が正常であること', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);
    expect(response.ok()).toBeTruthy();

    const health: HealthCheckResponse = await response.json();
    expect(health).toHaveProperty('services');
    expect(health.services).toHaveProperty('database');
    expect(health.services.database).toBe('connected');
  });

  test('Redis接続が正常であること', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);
    expect(response.ok()).toBeTruthy();

    const health: HealthCheckResponse = await response.json();
    expect(health).toHaveProperty('services');
    expect(health.services).toHaveProperty('redis');
    expect(health.services.redis).toBe('connected');
  });

  test('すべてのサービスが正常に動作していること', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);
    const health: HealthCheckResponse = await response.json();

    // システム全体のステータスがOKであること
    expect(health.status).toBe('ok');

    // すべてのサービスが接続されていること
    expect(health.services.database).toBe('connected');
    expect(health.services.redis).toBe('connected');
  });
});
