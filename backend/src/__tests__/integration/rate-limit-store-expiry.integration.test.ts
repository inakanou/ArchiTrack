/**
 * @fileoverview 回数制限の保存先の期限の統合検証（user-authentication タスク 73.5 の差し戻し）
 *
 * 実 Redis で、期限の無いキーが残らないこと、残っていても回復すること、
 * 窓・回数・減算・消去の意味が変わらないことを確かめる。
 *
 * @requirement user-authentication/REQ-51.10
 */

import { randomUUID } from 'crypto';
import express from 'express';
import type { Options } from 'express-rate-limit';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRuntimeMode } from '../../config/runtime-mode.js';
import { RedisRateLimitStore } from '../../middleware/RedisRateLimitStore.js';
import { createLimiterBuilder } from '../../middleware/rateLimit.middleware.js';

const WINDOW_MS = 1500;
const AFTER_WINDOW_MS = WINDOW_MS + 300;
const CLIENT_IP = '203.0.113.77';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('回数制限の保存先の期限（実 Redis）', () => {
  let client: Redis;
  const prefixes: string[] = [];

  function freshPrefix(): string {
    const prefix = `rl:test-expiry-${randomUUID()}:`;
    prefixes.push(prefix);
    return prefix;
  }

  function freshStore(prefix = freshPrefix()): RedisRateLimitStore {
    const store = new RedisRateLimitStore(() => client, prefix);
    store.init({ windowMs: WINDOW_MS } as Options);
    return store;
  }

  /** 最初の PEXPIRE の呼び出しだけを失敗させる接続 */
  function failFirstExpire(): Redis {
    let failNext = true;
    return new Proxy(client, {
      get(target, property, receiver) {
        if (property === 'pexpire' && failNext) {
          failNext = false;
          return () => Promise.reject(new Error('Connection is closed.'));
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  beforeAll(async () => {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL が必要です');
    }
    client = new Redis(url);
    await client.ping();
  });

  afterEach(async () => {
    const keys = prefixes.flatMap((prefix) => [`${prefix}k`, `${prefix}${CLIENT_IP}`]);
    prefixes.length = 0;
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  afterAll(async () => {
    await client.quit();
  });

  it('期限の設定に 1 回失敗しても、集計期間の後に同じ送信元が再び通り、キーに期限が付く', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prefix = freshPrefix();
    const flaky = failFirstExpire();
    const limiter = createLimiterBuilder({
      runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
      getRedisClient: () => flaky,
    })({
      windowMs: WINDOW_MS,
      max: 2,
      prefix,
      skippable: true,
      handler: (_req, res) => {
        res.status(429).json({ error: 'limited' });
      },
    });
    const app = express();
    app.set('trust proxy', 1);
    app.post('/x', limiter, (_req, res) => {
      res.json({ ok: true });
    });
    const hit = () => request(app).post('/x').set('X-Forwarded-For', CLIENT_IP);

    try {
      expect((await hit()).status).toBe(200);
      expect((await hit()).status).toBe(200);
      expect((await hit()).status).toBe(429);
      const ttl = await client.pttl(`${prefix}${CLIENT_IP}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(WINDOW_MS);

      await wait(AFTER_WINDOW_MS);

      expect((await hit()).status).toBe(200);
      expect(await client.pttl(`${prefix}${CLIENT_IP}`)).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('既に期限なしで残っているキーは、次の加算で期限が付き、集計期間の後に数え直す', async () => {
    const prefix = freshPrefix();
    const store = freshStore(prefix);
    await client.set(`${prefix}k`, '50');
    expect(await client.pttl(`${prefix}k`)).toBe(-1);

    const stuck = await store.increment('k');
    expect(stuck.totalHits).toBe(51);
    expect(stuck.resetTime).toBeInstanceOf(Date);
    const ttl = await client.pttl(`${prefix}k`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WINDOW_MS);

    await wait(AFTER_WINDOW_MS);

    expect((await store.increment('k')).totalHits).toBe(1);
  });

  it('期限切れの後の減算で残った期限なしのキーも回復する', async () => {
    const prefix = freshPrefix();
    const store = freshStore(prefix);
    await store.decrement('k');
    expect(await client.pttl(`${prefix}k`)).toBe(-1);

    await store.increment('k');

    expect(await client.pttl(`${prefix}k`)).toBeGreaterThan(0);
  });

  it('窓は最初の加算で決まり、後の加算で延びない', async () => {
    const prefix = freshPrefix();
    const store = freshStore(prefix);
    const first = await store.increment('k');
    expect(first.totalHits).toBe(1);
    await wait(400);

    const second = await store.increment('k');

    expect(second.totalHits).toBe(2);
    expect(await client.pttl(`${prefix}k`)).toBeLessThanOrEqual(WINDOW_MS - 300);
    expect(Math.abs(second.resetTime!.getTime() - first.resetTime!.getTime())).toBeLessThan(100);
  });

  it('減算と消去の動作は変わらない', async () => {
    const store = freshStore();
    await store.increment('k');
    await store.increment('k');

    await store.decrement('k');
    expect((await store.increment('k')).totalHits).toBe(2);

    await store.resetKey('k');
    expect((await store.increment('k')).totalHits).toBe(1);
  });
});
