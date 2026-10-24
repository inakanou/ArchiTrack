/**
 * @fileoverview 招待の回数制限の利用者ごとの識別と、429 の異常の検知への観測（user-authentication タスク55.4）
 *
 * Requirements (user-authentication):
 * - REQ-26.12: 招待の回数制限は利用者 ID ごとに数える
 * - REQ-43.3: 回数制限による拒否（429）を異常の検知へ送る
 *
 * 実際の express-rate-limit とメモリの記録（Redis なし）で組み立てた招待の制限を、本番と同じく
 * 認証（ここでは req.user を設定する試験用の部品）の後に掛けて確かめる。
 * 送信元は信頼する中継 1 段の X-Forwarded-For で与える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createRuntimeMode } from '../../../config/runtime-mode.js';
import { createRateLimiters } from '../../../middleware/rateLimit.middleware.js';
import { configureTrustProxy } from '../../../middleware/client-ip.js';

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

const observeSecurityAnomaly = vi.fn();
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: (...args: unknown[]) => observeSecurityAnomaly(...args),
}));

/** 招待の制限の上限（1 分 5 回） */
const INVITATION_LIMIT = 5;

const warn = vi.fn();

function createApp(): Express {
  const limiters = createRateLimiters({
    runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
    getRedisClient: () => null,
  });
  const app = express();
  configureTrustProxy(app, 1);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: { warn: typeof warn } }).log = { warn };
    next();
  });
  // authenticate と同じ形の req.user（userId）を設定する
  const authenticateAs = (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.get('x-test-user');
    if (userId) {
      req.user = { userId, email: `${userId}@example.com`, roles: ['user'] };
    }
    next();
  };
  app.post('/api/v1/invitations', authenticateAs, limiters.invitation, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  return app;
}

function invite(app: Express, userId: string, ip: string) {
  return request(app)
    .post('/api/v1/invitations')
    .set('x-test-user', userId)
    .set('X-Forwarded-For', ip);
}

describe('招待の回数制限の利用者ごとの識別', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * @requirement user-authentication/REQ-26.12
   */
  it('同じ送信元でも別の利用者は別々に数える', async () => {
    const app = createApp();
    for (let i = 0; i < INVITATION_LIMIT; i++) {
      expect((await invite(app, 'user-a', '192.0.2.1')).status).toBe(201);
    }
    expect((await invite(app, 'user-a', '192.0.2.1')).status).toBe(429);

    // 同じ送信元の別の利用者は利用者 A の超過に巻き込まれない
    expect((await invite(app, 'user-b', '192.0.2.1')).status).toBe(201);
  });

  /**
   * @requirement user-authentication/REQ-26.12
   */
  it('同じ利用者は送信元を変えても一つの上限を共有する', async () => {
    const app = createApp();
    for (let i = 0; i < INVITATION_LIMIT; i++) {
      expect((await invite(app, 'user-c', `192.0.2.${10 + i}`)).status).toBe(201);
    }
    expect((await invite(app, 'user-c', '192.0.2.99')).status).toBe(429);
  });

  /**
   * @requirement user-authentication/REQ-26.12
   * @requirement user-authentication/REQ-43.3
   */
  it('超過の記録に利用者 ID を含め、429 を利用者と送信元とともに異常の検知へ送る', async () => {
    const app = createApp();
    for (let i = 0; i < INVITATION_LIMIT; i++) {
      await invite(app, 'user-d', '192.0.2.50');
    }
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();

    expect((await invite(app, 'user-d', '192.0.2.50')).status).toBe(429);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-d', ip: '192.0.2.50' }),
      'Invitation rate limit exceeded'
    );
    expect(observeSecurityAnomaly).toHaveBeenCalledTimes(1);
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'rate_limited',
      sourceIp: '192.0.2.50',
      userId: 'user-d',
    });
  });

  /**
   * @requirement user-authentication/REQ-43.3
   */
  it('既定の応答の制限（ヘルスチェック）の 429 も異常の検知へ送る', async () => {
    const limiters = createRateLimiters({
      runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
      getRedisClient: () => null,
    });
    const app = express();
    configureTrustProxy(app, 1);
    app.get('/health', limiters.healthCheck, (_req, res) => {
      res.json({ status: 'ok' });
    });
    for (let i = 0; i < 60; i++) {
      await request(app).get('/health').set('X-Forwarded-For', '192.0.2.60');
    }
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();
    const response = await request(app).get('/health').set('X-Forwarded-For', '192.0.2.60');
    expect(response.status).toBe(429);
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'rate_limited',
      sourceIp: '192.0.2.60',
      userId: null,
    });
  });
});
