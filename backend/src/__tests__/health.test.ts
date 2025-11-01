import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';
import redis from '../redis.js';

// DB/Redisモジュールをモック
vi.mock('../db.js', () => ({
  default: {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../redis.js', () => ({
  default: {
    ping: vi.fn(),
    disconnect: vi.fn(),
  },
}));

// logger middlewareをモック（pino-httpの複雑な依存を回避）
vi.mock('../middleware/logger.middleware.js', () => ({
  httpLogger: vi.fn((req, res, next) => {
    req.log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  }),
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Health Check Endpoint', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセット
    vi.clearAllMocks();
  });

  describe('GET /health - 正常系', () => {
    it('すべてのサービスが接続可能な場合、connectedを返す', async () => {
      // DB/Redisモックを成功に設定
      (db.query as Mock).mockResolvedValue({ rows: [{ '?column?': 1 }] });
      (redis.ping as Mock).mockResolvedValue('PONG');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: 'connected',
          redis: 'connected',
        },
      });
    });
  });

  describe('GET /health - 異常系', () => {
    it('データベース接続失敗時もステータス200を返す', async () => {
      // DBモックをエラーに設定
      (db.query as Mock).mockRejectedValue(new Error('Connection failed'));
      (redis.ping as Mock).mockResolvedValue('PONG');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: 'disconnected',
          redis: 'connected',
        },
      });
    });

    it('Redis接続失敗時もステータス200を返す', async () => {
      // Redisモックをエラーに設定
      (db.query as Mock).mockResolvedValue({ rows: [{ '?column?': 1 }] });
      (redis.ping as Mock).mockRejectedValue(new Error('Connection failed'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: 'connected',
          redis: 'disconnected',
        },
      });
    });

    it('すべてのサービスが接続失敗してもステータス200を返す', async () => {
      // すべてのモックをエラーに設定
      (db.query as Mock).mockRejectedValue(new Error('DB Connection failed'));
      (redis.ping as Mock).mockRejectedValue(new Error('Redis Connection failed'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        services: {
          database: 'disconnected',
          redis: 'disconnected',
        },
      });
    });
  });

  describe('GET /health - タイムアウト', () => {
    it('データベース接続が2秒以上かかる場合、disconnectedを返す', async () => {
      // 3秒かかるPromiseを返す
      (db.query as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 3000))
      );
      (redis.ping as Mock).mockResolvedValue('PONG');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.services.database).toBe('disconnected');
      expect(response.body.services.redis).toBe('connected');
    }, 10000); // Jestのタイムアウトを10秒に設定
  });
});
