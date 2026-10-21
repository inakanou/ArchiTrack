/**
 * @fileoverview AuthenticatedUserStateService の単体テスト（user-authentication タスク47.5）
 *
 * 利用者の状態（有効・2FA の登録・初回のパスワード変更の要否）のキャッシュ経由の取得と、
 * 「消して世代を進める」無効化を確かめる。Redis は eval の Lua を解釈する最小の擬似で代える。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Redis from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  AuthenticatedUserStateService,
  getSharedAuthenticatedUserStateService,
} from '../../../services/authenticated-user-state.service.js';
import {
  AUTH_USER_STATE_CACHE_TTL_SECONDS,
  INVALIDATE_AUTH_USER_STATE,
  WRITE_AUTH_USER_STATE_IF_GENERATION_UNCHANGED,
  authUserStateCacheKey,
  authUserStateGenerationKey,
  authUserStateInvalidationKeys,
} from '../../../services/authenticated-user-state-cache.js';
import getPrismaClient from '../../../db.js';
import redisConnection from '../../../redis.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

const USER_ID = 'user-1';

/** 二つの Lua の手順を、同じ意味の操作で解釈する擬似の Redis */
function createFakeRedis(status = 'ready') {
  const store = new Map<string, string>();
  const ttl = new Map<string, number>();
  const client = {
    status,
    store,
    ttl,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    eval: vi.fn(async (script: string, numKeys: number, ...rest: Array<string | number>) => {
      const keys = rest.slice(0, numKeys).map(String);
      const args = rest.slice(numKeys).map(String);
      if (script === WRITE_AUTH_USER_STATE_IF_GENERATION_UNCHANGED) {
        if ((store.get(keys[1]!) ?? '') !== args[0]) {
          return 0;
        }
        store.set(keys[0]!, args[2]!);
        ttl.set(keys[0]!, Number(args[1]));
        return 1;
      }
      if (script === INVALIDATE_AUTH_USER_STATE) {
        for (let i = 0; i < keys.length; i += 2) {
          store.delete(keys[i]!);
          store.set(keys[i + 1]!, String(Number(store.get(keys[i + 1]!) ?? '0') + 1));
          ttl.set(keys[i + 1]!, Number(args[0]));
        }
        return keys.length / 2;
      }
      throw new Error('unexpected script');
    }),
  };
  return client;
}

type FakeRedis = ReturnType<typeof createFakeRedis>;

function asRedis(fake: FakeRedis): Redis {
  return fake as unknown as Redis;
}

describe('AuthenticatedUserStateService', () => {
  const findUnique = vi.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaClient;
  let redis: FakeRedis;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createFakeRedis();
    findUnique.mockResolvedValue({
      isActive: true,
      twoFactorEnabled: false,
      mustChangePassword: true,
    });
  });

  describe('鍵', () => {
    it('状態のキャッシュの鍵は auth:user-state:<userId> で、無効化は鍵と世代の鍵の組を渡す', () => {
      expect(authUserStateCacheKey('abc')).toBe('auth:user-state:abc');
      expect(authUserStateGenerationKey('abc')).toBe('auth:user-state-generation:abc');
      expect(authUserStateInvalidationKeys(['a', 'b'])).toEqual([
        'auth:user-state:a',
        'auth:user-state-generation:a',
        'auth:user-state:b',
        'auth:user-state-generation:b',
      ]);
      expect(AUTH_USER_STATE_CACHE_TTL_SECONDS).toBe(60);
    });
  });

  describe('getState', () => {
    it('キャッシュが無ければ DB から状態の 3 項目だけを読み、TTL 60 秒でキャッシュへ書く', async () => {
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { isActive: true, twoFactorEnabled: true, mustChangePassword: true },
      });
      expect(JSON.parse(redis.store.get(authUserStateCacheKey(USER_ID))!)).toEqual(state);
      expect(redis.ttl.get(authUserStateCacheKey(USER_ID))).toBe(60);
    });

    it('キャッシュがあれば DB を読まずにキャッシュの状態を返す', async () => {
      redis.store.set(
        authUserStateCacheKey(USER_ID),
        JSON.stringify({ isActive: false, twoFactorEnabled: true, mustChangePassword: false })
      );
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: false, twoFactorEnabled: true, mustChangePassword: false });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('形の違うキャッシュは使わず、DB から読み直して書き直す', async () => {
      redis.store.set(authUserStateCacheKey(USER_ID), JSON.stringify({ isActive: 'yes' }));
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalled();
      expect(JSON.parse(redis.store.get(authUserStateCacheKey(USER_ID))!)).toEqual(state);
    });

    it('利用者が存在しなければ null を返し、キャッシュしない', async () => {
      findUnique.mockResolvedValue(null);
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      expect(await service.getState(USER_ID)).toBeNull();
      expect(redis.store.has(authUserStateCacheKey(USER_ID))).toBe(false);
    });

    it('DB の読み出しの間に無効化が割り込むと、読んだ古い状態をキャッシュへ書き戻さない', async () => {
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));
      findUnique.mockImplementationOnce(async () => {
        const stale = { isActive: true, twoFactorEnabled: false, mustChangePassword: true };
        // 読み出しの後・書き込みの前に、別の操作のコミットと無効化が走る
        await service.invalidate(USER_ID);
        return stale;
      });

      const first = await service.getState(USER_ID);

      expect(first).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(redis.store.has(authUserStateCacheKey(USER_ID))).toBe(false);

      findUnique.mockResolvedValueOnce({
        isActive: true,
        twoFactorEnabled: true,
        mustChangePassword: false,
      });
      expect(await service.getState(USER_ID)).toEqual({
        isActive: true,
        twoFactorEnabled: true,
        mustChangePassword: false,
      });
    });

    it('Redis が ready でなければコマンドを送らず DB から読む', async () => {
      const notReady = createFakeRedis('reconnecting');
      const service = new AuthenticatedUserStateService(prisma, asRedis(notReady));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(notReady.get).not.toHaveBeenCalled();
      expect(notReady.eval).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), userId: USER_ID }),
        'Failed to get user state from Redis cache'
      );
    });

    it('Redis の読み出しが失敗すれば DB から読み、キャッシュへ書かない', async () => {
      redis.get.mockRejectedValueOnce(new Error('boom'));
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it('キャッシュへの書き込みが失敗しても DB の状態を返す', async () => {
      redis.eval.mockRejectedValueOnce(new Error('boom'));
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      const state = await service.getState(USER_ID);

      expect(state).toEqual({ isActive: true, twoFactorEnabled: false, mustChangePassword: true });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        'Failed to cache user state to Redis'
      );
    });

    it('Redis が無ければ DB から読む', async () => {
      const service = new AuthenticatedUserStateService(prisma);

      expect(await service.getState(USER_ID)).toEqual({
        isActive: true,
        twoFactorEnabled: false,
        mustChangePassword: true,
      });
    });

    it('DB の失敗は呼び出し元へ伝える', async () => {
      findUnique.mockRejectedValueOnce(new Error('db down'));
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      await expect(service.getState(USER_ID)).rejects.toThrow('db down');
    });
  });

  describe('invalidate', () => {
    it('キャッシュを消して世代を進め、世代の鍵に TTL を付ける', async () => {
      redis.store.set(authUserStateCacheKey(USER_ID), '{}');
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      await service.invalidate(USER_ID);
      await service.invalidate(USER_ID);

      expect(redis.store.has(authUserStateCacheKey(USER_ID))).toBe(false);
      expect(redis.store.get(authUserStateGenerationKey(USER_ID))).toBe('2');
      expect(redis.ttl.get(authUserStateGenerationKey(USER_ID))).toBe(60);
    });

    it('無効化の直後の取得は DB の新しい値を返す', async () => {
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));
      await service.getState(USER_ID);
      findUnique.mockResolvedValue({
        isActive: false,
        twoFactorEnabled: true,
        mustChangePassword: false,
      });

      expect((await service.getState(USER_ID))?.isActive).toBe(true);
      await service.invalidate(USER_ID);
      expect(await service.getState(USER_ID)).toEqual({
        isActive: false,
        twoFactorEnabled: true,
        mustChangePassword: false,
      });
    });

    it('Redis が無ければ何もしない', async () => {
      const service = new AuthenticatedUserStateService(prisma, () => null);

      await expect(service.invalidate(USER_ID)).resolves.toBeUndefined();
    });

    it('Redis が ready でなければコマンドを送らず警告を残す', async () => {
      const notReady = createFakeRedis('connecting');
      const service = new AuthenticatedUserStateService(prisma, asRedis(notReady));

      await service.invalidate(USER_ID);

      expect(notReady.eval).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), userId: USER_ID }),
        'Failed to invalidate user state cache'
      );
    });

    it('無効化の失敗は呼び出し元へ伝えず警告を残す', async () => {
      redis.eval.mockRejectedValueOnce(new Error('boom'));
      const service = new AuthenticatedUserStateService(prisma, asRedis(redis));

      await expect(service.invalidate(USER_ID)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        'Failed to invalidate user state cache'
      );
    });
  });

  describe('getSharedAuthenticatedUserStateService', () => {
    it('同じ PrismaClient の間は同じインスタンスを返し、Redis を呼び出しの時点で redis.ts から解決する', async () => {
      const sharedPrisma = { user: { findUnique } } as unknown as PrismaClient;
      vi.mocked(getPrismaClient).mockReturnValue(sharedPrisma);
      vi.mocked(redisConnection.getClient).mockReturnValue(asRedis(redis));

      const a = getSharedAuthenticatedUserStateService();
      const b = getSharedAuthenticatedUserStateService();
      expect(a).toBe(b);

      await a.getState(USER_ID);
      expect(redis.store.has(authUserStateCacheKey(USER_ID))).toBe(true);

      const otherPrisma = { user: { findUnique } } as unknown as PrismaClient;
      vi.mocked(getPrismaClient).mockReturnValue(otherPrisma);
      expect(getSharedAuthenticatedUserStateService()).not.toBe(a);
    });
  });
});
