import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

// DB/Redisモジュールをモック
vi.mock('../../db.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    end: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../redis.js', () => ({
  default: {
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
  },
}));

// logger middlewareをモック（pino-httpの複雑な依存を回避）
vi.mock('../../middleware/logger.middleware.js', () => ({
  httpLogger: vi.fn((req, res, next) => {
    req.log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  }),
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ArchiTrack Backend API', () => {
  describe('GET /api', () => {
    it('APIバージョン情報を返す', async () => {
      const response = await request(app).get('/api');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'ArchiTrack API',
        version: '1.0.0',
      });
    });
  });

  describe('GET /health', () => {
    it('ヘルスチェックが成功する', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');
    });

    it('timestampがISO 8601形式である', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      const timestamp = response.body.timestamp;
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('GET /favicon.ico', () => {
    it('204 No Contentを返す', async () => {
      const response = await request(app).get('/favicon.ico');

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
    });
  });

  describe('404 Handler', () => {
    it('存在しないエンドポイントで404を返す', async () => {
      const response = await request(app).get('/non-existent-endpoint');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Not found',
      });
    });
  });

  describe('CORS Headers', () => {
    it('CORSヘッダーが設定されている', async () => {
      const response = await request(app).get('/api').set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
