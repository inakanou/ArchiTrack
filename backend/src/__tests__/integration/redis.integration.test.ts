import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import redis, { initRedis } from '../../redis.js';
import type { Redis } from 'ioredis';

/**
 * Redis統合テスト
 * 実際のRedisサーバーに接続してキャッシュ操作を検証
 */
describe('Redis Integration Tests', () => {
  let client: Redis | null;

  beforeAll(async () => {
    // Redisの初期化
    await initRedis();
    client = redis.getClient();

    // Redisが利用可能でない場合はテストをスキップ
    if (!client) {
      console.warn('Redis is not available, skipping Redis integration tests');
    }
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (client) {
      const keys = await client.keys('test-integration:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ
    if (client) {
      const keys = await client.keys('test-integration:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  });

  describe('Redis Connection', () => {
    it('Redisに接続できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const response = await redis.ping();
      expect(response).toBe('PONG');
    });

    it('Redisクライアントが取得できること', () => {
      const redisClient = redis.getClient();
      if (!redisClient) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      expect(redisClient).toBeDefined();
      expect(redisClient.status).toBe('ready');
    });
  });

  describe('Basic Key-Value Operations', () => {
    it('文字列を保存・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:string';
      const value = 'Hello Redis';

      await client.set(key, value);
      const retrieved = await client.get(key);

      expect(retrieved).toBe(value);
    });

    it('数値を保存・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:number';
      const value = 12345;

      await client.set(key, value);
      const retrieved = await client.get(key);

      expect(Number(retrieved)).toBe(value);
    });

    it('JSONオブジェクトを保存・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:json';
      const value = { name: 'Test User', age: 25, active: true };

      await client.set(key, JSON.stringify(value));
      const retrieved = await client.get(key);

      expect(JSON.parse(retrieved as string)).toEqual(value);
    });

    it('キーを削除できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:delete';
      const value = 'To be deleted';

      await client.set(key, value);
      await client.del(key);
      const retrieved = await client.get(key);

      expect(retrieved).toBeNull();
    });

    it('キーの存在確認ができること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:exists';
      const value = 'Exists';

      // 存在しない場合
      const beforeExists = await client.exists(key);
      expect(beforeExists).toBe(0);

      // 保存後
      await client.set(key, value);
      const afterExists = await client.exists(key);
      expect(afterExists).toBe(1);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('TTL付きでキーを保存できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:ttl';
      const value = 'Expires in 10 seconds';
      const ttl = 10; // 10秒

      await client.setex(key, ttl, value);
      const remainingTtl = await client.ttl(key);

      expect(remainingTtl).toBeGreaterThan(0);
      expect(remainingTtl).toBeLessThanOrEqual(ttl);
    });

    it('TTLを設定・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:expire';
      const value = 'Will expire';
      const ttl = 30; // 30秒

      await client.set(key, value);
      await client.expire(key, ttl);
      const remainingTtl = await client.ttl(key);

      expect(remainingTtl).toBeGreaterThan(0);
      expect(remainingTtl).toBeLessThanOrEqual(ttl);
    });

    it('TTLが切れたキーは取得できないこと', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:expired';
      const value = 'Will expire soon';
      const ttl = 1; // 1秒

      // テスト前にキーを削除してクリーンな状態を確保
      await client.del(key);

      await client.setex(key, ttl, value);

      // 5秒待つ（Docker/CI環境でのTTL切れを確実にするため余裕を持たせる）
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Redis TTL expiration後のgetでキーが削除されることを確認
      const retrieved = await client.get(key);
      expect(retrieved).toBeNull();
    }, 15000); // テストタイムアウトを15秒に設定（Docker/CI環境を考慮）
  });

  describe('Hash Operations', () => {
    it('ハッシュを保存・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:hash';
      const hash = {
        name: 'Test User',
        email: 'test@example.com',
        age: '25',
      };

      await client.hset(key, hash);
      const retrieved = await client.hgetall(key);

      expect(retrieved).toEqual(hash);
    });

    it('ハッシュの特定フィールドを取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:hash-field';
      await client.hset(key, 'name', 'Test User');
      await client.hset(key, 'email', 'test@example.com');

      const name = await client.hget(key, 'name');
      const email = await client.hget(key, 'email');

      expect(name).toBe('Test User');
      expect(email).toBe('test@example.com');
    });
  });

  describe('List Operations', () => {
    it('リストに要素を追加・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:list';
      const values = ['item1', 'item2', 'item3'];

      await client.rpush(key, ...values);
      const retrieved = await client.lrange(key, 0, -1);

      expect(retrieved).toEqual(values);
    });

    it('リストの長さを取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:list-length';
      await client.rpush(key, 'item1', 'item2', 'item3');

      const length = await client.llen(key);
      expect(length).toBe(3);
    });
  });

  describe('Set Operations', () => {
    it('セットに要素を追加・取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:set';
      const values = ['member1', 'member2', 'member3'];

      await client.sadd(key, ...values);
      const members = await client.smembers(key);

      expect(members.sort()).toEqual(values.sort());
    });

    it('セットのメンバー数を取得できること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:set-count';
      await client.sadd(key, 'member1', 'member2', 'member3');

      const count = await client.scard(key);
      expect(count).toBe(3);
    });
  });

  describe('Increment/Decrement Operations', () => {
    it('値をインクリメントできること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:counter';

      const value1 = await client.incr(key);
      expect(value1).toBe(1);

      const value2 = await client.incr(key);
      expect(value2).toBe(2);

      const value3 = await client.incrby(key, 5);
      expect(value3).toBe(7);
    });

    it('値をデクリメントできること', async () => {
      if (!client) {
        console.warn('Skipping test: Redis client not initialized');
        return;
      }

      const key = 'test-integration:decrement';
      await client.set(key, 10);

      const value1 = await client.decr(key);
      expect(value1).toBe(9);

      const value2 = await client.decrby(key, 5);
      expect(value2).toBe(4);
    });
  });
});
