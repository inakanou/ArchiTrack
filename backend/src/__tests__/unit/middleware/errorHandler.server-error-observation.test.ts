/**
 * @fileoverview 5xx の応答の異常の検知への観測（user-authentication タスク55.4）
 *
 * Requirements (user-authentication):
 * - REQ-43.3: サーバーエラー（5xx）の応答を異常の検知へ送る
 *
 * エラーハンドラーを経た 5xx と、経路が直接返す 5xx の両方を、応答の完了で数えることを確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import {
  errorHandler,
  observeServerErrorResponses,
} from '../../../middleware/errorHandler.middleware.js';
import { configureTrustProxy } from '../../../middleware/client-ip.js';

const observeSecurityAnomaly = vi.fn();
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: (...args: unknown[]) => observeSecurityAnomaly(...args),
}));

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

function createApp(): Express {
  const app = express();
  configureTrustProxy(app, 1);
  app.use(observeServerErrorResponses);
  // authenticate の後に経路が失敗する場面を模す（利用者 ID は完了時に読む）
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const userId = req.get('x-test-user');
    if (userId) {
      req.user = { userId, email: `${userId}@example.com`, roles: ['user'] };
    }
    next();
  });
  app.get('/thrown', () => {
    throw new Error('boom');
  });
  app.get('/direct-503', (_req, res) => {
    res.status(503).json({ error: 'unavailable' });
  });
  app.get('/not-found', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('observeServerErrorResponses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * @requirement user-authentication/REQ-43.3
   */
  it('エラーハンドラーが返す 500 を送信元と利用者とともに送る', async () => {
    const response = await request(createApp())
      .get('/thrown')
      .set('X-Forwarded-For', '192.0.2.70')
      .set('x-test-user', 'user-e');
    expect(response.status).toBe(500);
    await vi.waitFor(() => expect(observeSecurityAnomaly).toHaveBeenCalledTimes(1));
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'server_error',
      sourceIp: '192.0.2.70',
      userId: 'user-e',
    });
  });

  /**
   * @requirement user-authentication/REQ-43.3
   */
  it('経路が直接返す 5xx も送り、4xx と 2xx は送らない', async () => {
    const app = createApp();
    expect((await request(app).get('/ok')).status).toBe(200);
    expect((await request(app).get('/not-found')).status).toBe(404);
    expect(
      (await request(app).get('/direct-503').set('X-Forwarded-For', '192.0.2.71')).status
    ).toBe(503);
    await vi.waitFor(() => expect(observeSecurityAnomaly).toHaveBeenCalledTimes(1));
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'server_error',
      sourceIp: '192.0.2.71',
      userId: null,
    });
  });
});
