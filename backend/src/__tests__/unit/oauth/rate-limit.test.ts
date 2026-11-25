/**
 * @fileoverview 認可の窓口の送信元 IP ごとの回数制限の単体テスト（user-authentication タスク 73.5）
 *
 * 実際の express-rate-limit とメモリの記録（Redis なし）で組み立てた制限を、認可とトークンの窓口に掛けて確かめる。
 * 送信元は信頼する中継 1 段の X-Forwarded-For で与える。
 */

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeMode } from '../../../config/runtime-mode.js';
import { configureTrustProxy } from '../../../middleware/client-ip.js';
import { createOAuthRateLimiters } from '../../../oauth/rate-limit.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

const observeSecurityAnomaly = vi.fn();
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: (...args: unknown[]) => observeSecurityAnomaly(...args),
}));

const PRODUCTION_MODE = createRuntimeMode({ NODE_ENV: 'production' });
const LIMITS = { authorizeMax: 2, tokenMax: 3, windowMs: 60_000 };

function createApp(options: { bypass?: boolean } = {}): Express {
  const limiters = createOAuthRateLimiters(LIMITS, {
    runtimeMode: options.bypass ? { isRateLimitBypassAllowed: () => true } : PRODUCTION_MODE,
    getRedisClient: () => null,
  });
  const app = express();
  configureTrustProxy(app, 1);
  app.get('/oauth/auth', limiters.authorize, (_req, res) => {
    res.status(200).send('authorize');
  });
  app.get('/oauth/auth/:uid', limiters.authorize, (_req, res) => {
    res.status(200).send('interaction');
  });
  app.post('/oauth/token', limiters.token, (_req, res) => {
    res.status(200).json({ access_token: 'issued' });
  });
  return app;
}

describe('createOAuthRateLimiters', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    observeSecurityAnomaly.mockReset();
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('認可の窓口は上限までは通し、超えると 429 の画面を要求の値を含めずに返す', async () => {
    const app = createApp();
    const authorize = () =>
      request(app)
        .get('/oauth/auth?state=secret-state&redirect_uri=https%3A%2F%2Fapp.example%2Fcb')
        .set('X-Forwarded-For', '198.51.100.1');

    expect((await authorize()).status).toBe(200);
    expect((await authorize()).status).toBe(200);
    const limited = await authorize();

    expect(limited.status).toBe(429);
    expect(limited.headers['content-type']).toMatch(/^text\/html/);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['location']).toBeUndefined();
    expect(limited.text).toContain('しばらくお待ちください');
    expect(limited.text).not.toContain('secret-state');
    expect(limited.text).not.toContain('app.example');
    expect(limited.headers['ratelimit-limit']).toBe('2');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { ip: '198.51.100.1', endpoint: 'authorize' },
      'OAuth rate limit exceeded'
    );
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'rate_limited',
      sourceIp: '198.51.100.1',
      userId: null,
    });
  });

  it('認可の窓口は再開の識別子を含むパスも同じ送信元として数え、ログにパスを残さない', async () => {
    const app = createApp();
    const ip = '198.51.100.2';

    expect((await request(app).get('/oauth/auth').set('X-Forwarded-For', ip)).status).toBe(200);
    expect(
      (await request(app).get('/oauth/auth/interaction-uid-1').set('X-Forwarded-For', ip)).status
    ).toBe(200);
    const limited = await request(app)
      .get('/oauth/auth/interaction-uid-2')
      .set('X-Forwarded-For', ip);

    expect(limited.status).toBe(429);
    expect(limited.text).not.toContain('interaction-uid-2');
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toEqual({ ip, endpoint: 'authorize' });
  });

  it('トークンの窓口は上限までは通し、超えると 429 の JSON を返す', async () => {
    const app = createApp();
    const token = () =>
      request(app)
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'authorization_code', code: 'secret-code' })
        .set('X-Forwarded-For', '198.51.100.3');

    for (let i = 0; i < LIMITS.tokenMax; i++) {
      expect((await token()).status).toBe(200);
    }
    const limited = await token();

    expect(limited.status).toBe(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.body).toEqual({
      error: 'temporarily_unavailable',
      error_description: 'Too many requests. Retry later.',
    });
    expect(limited.text).not.toContain('secret-code');
    expect(limited.headers['ratelimit-limit']).toBe('3');
    expect(warn).toHaveBeenCalledWith(
      { ip: '198.51.100.3', endpoint: 'token' },
      'OAuth rate limit exceeded'
    );
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'rate_limited',
      sourceIp: '198.51.100.3',
      userId: null,
    });
  });

  it('認可とトークンは別々に数え、送信元 IP ごとに数える', async () => {
    const app = createApp();
    const ip = '198.51.100.4';

    for (let i = 0; i < LIMITS.authorizeMax; i++) {
      await request(app).get('/oauth/auth').set('X-Forwarded-For', ip);
    }
    expect((await request(app).get('/oauth/auth').set('X-Forwarded-For', ip)).status).toBe(429);

    // 認可の超過はトークンの窓口の計数に影響しない
    expect((await request(app).post('/oauth/token').set('X-Forwarded-For', ip)).status).toBe(200);
    // 別の送信元は認可の窓口でも通る
    expect(
      (await request(app).get('/oauth/auth').set('X-Forwarded-For', '198.51.100.5')).status
    ).toBe(200);
  });

  it('実行環境の判定が無効化を認めるときは上限を超えても通す', async () => {
    const app = createApp({ bypass: true });
    const ip = '198.51.100.6';

    for (let i = 0; i < LIMITS.tokenMax + 2; i++) {
      expect((await request(app).post('/oauth/token').set('X-Forwarded-For', ip)).status).toBe(200);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();
  });
});
