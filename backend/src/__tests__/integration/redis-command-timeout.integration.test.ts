/**
 * キャッシュ基盤（Redis）が接続を保ったまま応答しなくなったときの統合テスト
 *
 * user-authentication タスク80.2（要件35.8）。design.md「Requirements 35.8・40.13・42.10」の
 * キャッシュ基盤のコマンドの期限。
 *
 * 実際の Redis との間に止められる TCP の中継を置き、本番の初期化（`initRedis`）で中継へ接続してから
 * 中継を止める（接続は保ったまま、要求を Redis へ渡さない）。その状態で、本番の部品が応答を待ち続けず、
 * 用途ごとの失敗時の扱いに乗ることを確かめる:
 * - コマンドが期限内に失敗する
 * - 試行回数の制限はインスタンスのメモリの記録で数える
 * - 原本の無い一時的な手続き（2FA の検証の途中）は汎用のエラーで拒否する
 * - 利用者の状態と権限のキャッシュは原本（データベース）を読む
 * - 原本の無い一時的な手続き（外部アプリの接続の同意の途中）は汎用のエラー（SERVICE_UNAVAILABLE）で拒否する
 *
 * 事前に test compose の redis を起動しておくこと（REDIS_URL）。
 */

import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Options } from 'express-rate-limit';
import type { PrismaClient } from '../../generated/prisma/client.js';
import redis, { initRedis } from '../../redis.js';
import { RedisRateLimitStore } from '../../middleware/RedisRateLimitStore.js';
import { TwoFactorChallengeService } from '../../services/two-factor-challenge.service.js';
import { AuthenticatedUserStateService } from '../../services/authenticated-user-state.service.js';
import { RBACService } from '../../services/rbac.service.js';
import {
  ConsentInteractionService,
  type ConsentInteractionServiceDependencies,
  type InteractionContext,
} from '../../services/oauth-consent.service.js';

/** 試験の期限（短くして待ち時間を抑える） */
const COMMAND_TIMEOUT_MS = 300;
/** 期限の効いた失敗とみなす上限（期限に加え、スケジューリングの揺れを見込む） */
const BOUNDED_MS = 2000;
/** 期限が無ければ戻らないことを、試験の期限切れで赤として示す */
const TEST_TIMEOUT_MS = 5000;

/** 止められる TCP の中継 */
interface FreezableProxy {
  url: string;
  freeze(): void;
  close(): Promise<void>;
}

async function startFreezableProxy(target: URL): Promise<FreezableProxy> {
  let frozen = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port || 6379), target.hostname);
    sockets.add(client);
    sockets.add(upstream);
    // 止めた後の要求は Redis へ渡さず捨てる（接続は保つ）
    client.on('data', (chunk) => {
      if (!frozen) upstream.write(chunk);
    });
    upstream.on('data', (chunk) => client.write(chunk));
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', closeBoth);
    upstream.on('error', closeBoth);
    client.on('close', closeBoth);
    upstream.on('close', closeBoth);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  const proxied = new URL(target.toString());
  proxied.hostname = '127.0.0.1';
  proxied.port = String(port);
  return {
    url: proxied.toString(),
    freeze: () => {
      frozen = true;
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** 呼び出しを待ち、結果と要した時間を返す */
async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, elapsedMs: Date.now() - started };
}

describe('キャッシュ基盤が接続を保ったまま応答しないとき（要件35.8）', () => {
  const originalEnv = {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_COMMAND_TIMEOUT_MS: process.env.REDIS_COMMAND_TIMEOUT_MS,
  };
  let proxy: FreezableProxy;

  beforeAll(async () => {
    const target = process.env.REDIS_URL;
    expect(target, 'REDIS_URL（test compose の redis）が要る').toBeTruthy();
    proxy = await startFreezableProxy(new URL(target!));
    process.env.REDIS_URL = proxy.url;
    process.env.REDIS_COMMAND_TIMEOUT_MS = String(COMMAND_TIMEOUT_MS);

    await initRedis();
    const client = redis.getClient();
    expect(client?.status).toBe('ready');
    // 止める前は応答する（中継そのものが働いている）
    expect(await client!.ping()).toBe('PONG');
    proxy.freeze();
  });

  afterAll(async () => {
    // 捨てた要求の応答を待つ quit は戻らないため、接続を直ちに閉じる
    redis.getClient()?.disconnect();
    await proxy.close();
    process.env.REDIS_URL = originalEnv.REDIS_URL;
    if (originalEnv.REDIS_COMMAND_TIMEOUT_MS === undefined) {
      delete process.env.REDIS_COMMAND_TIMEOUT_MS;
    } else {
      process.env.REDIS_COMMAND_TIMEOUT_MS = originalEnv.REDIS_COMMAND_TIMEOUT_MS;
    }
  });

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    'コマンドは期限内に失敗し、接続は ready のまま保たれる',
    async () => {
      const client = redis.getClient()!;
      const started = Date.now();
      await expect(client.get('architrack:timeout-probe')).rejects.toThrow(/timed out/i);
      expect(Date.now() - started).toBeLessThan(BOUNDED_MS);
      // 接続が切れたのではなく、接続を保ったまま応答しない状態であることの確認
      expect(client.status).toBe('ready');
    },
    TEST_TIMEOUT_MS
  );

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    '試行回数の制限はインスタンスのメモリの記録で数える',
    async () => {
      const store = new RedisRateLimitStore(() => redis.getClient(), 'rl:timeout-test:');
      store.init({ windowMs: 60_000 } as Options);

      const first = await timed(() => store.increment('203.0.113.1'));
      const second = await timed(() => store.increment('203.0.113.1'));

      expect(first.value.totalHits).toBe(1);
      expect(second.value.totalHits).toBe(2);
      expect(first.elapsedMs).toBeLessThan(BOUNDED_MS);
      expect(second.elapsedMs).toBeLessThan(BOUNDED_MS);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    '原本の無い 2FA の検証の途中の手続きは汎用のエラーで拒否する',
    async () => {
      const service = new TwoFactorChallengeService(() => redis.getClient());

      const issued = await timed(() => service.issue('user-timeout-test'));
      expect(issued.value).toEqual({
        ok: false,
        error: { type: 'CHALLENGE_STORE_UNAVAILABLE' },
      });
      expect(issued.elapsedMs).toBeLessThan(BOUNDED_MS);

      const peeked = await timed(() => service.peek('some-challenge-token'));
      expect(peeked.value).toEqual({
        ok: false,
        error: { type: 'CHALLENGE_STORE_UNAVAILABLE' },
      });
      expect(peeked.elapsedMs).toBeLessThan(BOUNDED_MS);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    '利用者の状態はキャッシュを諦めて原本を読む',
    async () => {
      const stored = {
        isActive: true,
        twoFactorEnabled: true,
        mustChangePassword: false,
        accessTokenGeneration: 3,
      };
      const prisma = {
        user: { findUnique: async () => stored },
      } as unknown as PrismaClient;
      const service = new AuthenticatedUserStateService(prisma, () => redis.getClient());

      const state = await timed(() => service.getState('user-timeout-test'));
      expect(state.value).toEqual(stored);
      // 読み出しとキャッシュへの書き込みの 2 回の期限を見込む
      expect(state.elapsedMs).toBeLessThan(BOUNDED_MS * 2);
    },
    TEST_TIMEOUT_MS * 2
  );

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    '権限はキャッシュを諦めて原本を読む',
    async () => {
      const prisma = {
        user: {
          findUnique: async () => ({
            id: 'user-timeout-test',
            userRoles: [
              {
                role: {
                  rolePermissions: [
                    {
                      permission: {
                        id: 'perm-1',
                        resource: 'project',
                        action: 'read',
                        description: null,
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      } as unknown as PrismaClient;
      const service = new RBACService(prisma, () => redis.getClient());

      const permissions = await timed(() => service.getUserPermissions('user-timeout-test'));
      expect(permissions.value).toEqual([
        { id: 'perm-1', resource: 'project', action: 'read', description: null },
      ]);
      expect(permissions.elapsedMs).toBeLessThan(BOUNDED_MS * 2);
    },
    TEST_TIMEOUT_MS * 2
  );

  /**
   * @requirement user-authentication/REQ-35.8
   */
  it(
    '原本の無い外部アプリの接続の同意の途中の手続きは汎用のエラーで拒否する',
    async () => {
      const uid = 'interaction-timeout-test';
      const userId = 'user-timeout-test';
      const clientId = 'timeout-test-client';
      // 申し込みの手続きの読み出しは認可サーバーの保存先（Redis でない）から行う。ここでは有効な申し込みを返す
      const interaction = {
        uid,
        result: undefined,
        exp: Math.floor(Date.now() / 1000) + 600,
        prompt: { name: 'consent' },
        session: { accountId: userId },
        params: {
          client_id: clientId,
          redirect_uri: 'http://127.0.0.1:4999/oauth/callback',
          scope: 'read',
        },
      };
      const deps = {
        prisma: {
          user: { findUnique: async () => ({ externalAppRevocationGeneration: 0 }) },
        },
        provider: { interactionDetails: async () => interaction },
        connectionService: {},
        secondFactorVerifier: {
          verify: async () => {
            throw new Error('2FA の照合へ進んではならない');
          },
        },
        clientRegistry: {
          loadAllowedClients: () => [
            {
              clientId,
              clientSecret: 'secret',
              displayName: 'Timeout Test App',
              redirectUris: ['http://127.0.0.1:4999/oauth/callback'],
              tokenEndpointAuthMethod: 'client_secret_post',
            },
          ],
        },
        resourceUrl: 'http://localhost/mcp',
        getRedis: () => redis.getClient(),
      } as unknown as ConsentInteractionServiceDependencies;
      const service = new ConsentInteractionService(deps);
      const ctx = { req: {}, res: {}, uid } as unknown as InteractionContext;

      const viewed = await timed(() => service.getInteraction(ctx, userId));
      expect(viewed.value).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(viewed.elapsedMs).toBeLessThan(BOUNDED_MS);

      const verified = await timed(() =>
        service.verifySecondFactor(ctx, userId, { type: 'totp', code: '123456' } as never)
      );
      expect(verified.value).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(verified.elapsedMs).toBeLessThan(BOUNDED_MS);
    },
    TEST_TIMEOUT_MS
  );
});
