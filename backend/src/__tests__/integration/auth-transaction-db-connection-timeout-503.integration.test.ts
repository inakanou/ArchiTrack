/**
 * @fileoverview 対話型トランザクションで書き込む認証系のエンドポイント（ユーザーのロール・ユーザーの削除・
 * ロールの権限）が、DB 接続のタイムアウトで 503 を返すことの統合検証（タスク35.12・35.13）
 *
 * モックを使わず、本物のアプリ（app.ts のルート・requirePermission・RBACService・UserRoleService・
 * RolePermissionService）と、db.ts の getPrismaClient が組み立てる本物の PrismaClient・@prisma/adapter-pg・
 * RetryingPool、エラーハンドラーを通す。
 * 接続先は、TCP 接続は受け付けるが一切応答しないローカルのサーバーとする。
 *
 * 再試行の予算（DATABASE_RETRY_COUNT=1・DATABASE_CONNECTION_TIMEOUT=1000 で 1000 + 1000 + 1000 = 3000ms）を
 * Prisma の maxWait の既定 2000ms より長くし、応答が予算を使い切った後であることを確かめる。
 *
 * 権限の確認（requirePermission）について: 対象のエンドポイントはすべて requirePermission を通り、
 * requirePermission は Redis の権限キャッシュを持つ共有の RBACService を使う（タスク36.2）。
 * 本ファイルは実 Redis（redis.ts の initRedis）を初期化し、RBACService を差し替えずに次の両方を確かめる。
 * - 権限のキャッシュに当たらない場合（各検証の前にキーを消す）: 最初の DB への到達は権限の判定となり、
 *   その接続のタイムアウトが authorize.middleware.ts からエラーハンドラーへ渡って 503 になる（タスク35.13）
 * - 権限のキャッシュに当たる場合（全権限のキャッシュを置く）: 権限の判定は DB を引かずに通り、最初の DB への
 *   到達はトランザクションの開始となる。その maxWait が予算を覆うこと（タスク35.12）で 503 になる。
 *   maxWait が予算を覆わなければ、約 2 秒の P2028 で 500 となり赤くなる
 * タスク36.2 より前は requirePermission が Redis を持たない RBACService を都度生成しており、後者の経路は
 * RBACService.prototype.hasPermission を差し替えて作っていた。キャッシュが本番の経路で働くようになったため、
 * 差し替えをやめ、実運用でキャッシュが残っている間の経路としてキャッシュを置いて確かめる。
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Redis from 'ioredis';

/** 1 回の試行の接続タイムアウト（ミリ秒） */
const CONNECTION_TIMEOUT_MS = 1000;

/** 再試行回数（1 回目の再試行は 1000ms 後） */
const RETRY_COUNT = 1;

/** 接続の取得が失敗を返すまでの時間（ミリ秒）。2 回の試行 × 1000ms + 間隔 1000ms */
const CONNECT_BUDGET_MS = 3000;

/** 計時の誤差の許容（ミリ秒） */
const TIMING_TOLERANCE_MS = 200;

/**
 * beforeAll の上限（ミリ秒）。app.js の動的 import は起動直後のコンテナでは変換に 10 秒前後かかり、
 * 既定の hookTimeout（20000ms）に近づくため、余裕を持たせる
 */
const BEFORE_ALL_TIMEOUT_MS = 60000;

/** 本ファイルが書き換える環境変数（afterAll で元へ戻す） */
const OVERRIDDEN_ENV = [
  'DATABASE_URL',
  'DATABASE_CONNECTION_TIMEOUT',
  'DATABASE_RETRY_COUNT',
] as const;

/** 本ファイルのアクセストークンの利用者（DB には存在しない） */
const ACTOR_ID = 'ua3512-actor';

/** RBACService の権限キャッシュのキー */
const ACTOR_CACHE_KEY = `rbac:permissions:${ACTOR_ID}`;

/** 全権限（*:*）のキャッシュの値 */
const ALL_PERMISSIONS_CACHE = JSON.stringify([
  { id: 'ua3512-all', resource: '*', action: '*', description: null },
]);

const SERVICE_UNAVAILABLE = {
  type: 'https://api.architrack.com/errors/internal-server-error',
  title: 'Service Unavailable',
  status: 503,
  detail: 'Database connection error',
};

describe('対話型トランザクションから始まる認証系の書き込みの DB 接続タイムアウト時の 503（統合）', () => {
  let server: net.Server;
  const sockets = new Set<net.Socket>();
  const savedEnv: Partial<Record<(typeof OVERRIDDEN_ENV)[number], string | undefined>> = {};
  let app: Express;
  let disconnectPrisma: () => Promise<void>;
  let disconnectRedis: () => Promise<void>;
  let redisClient: Redis;
  let accessToken: string;

  beforeAll(async () => {
    // TCP 接続は受け付けるが、PostgreSQL の起動メッセージに一切応答しない
    server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    for (const key of OVERRIDDEN_ENV) {
      savedEnv[key] = process.env[key];
    }
    process.env.DATABASE_URL = `postgresql://user:password@127.0.0.1:${port}/unreachable`;
    process.env.DATABASE_CONNECTION_TIMEOUT = String(CONNECTION_TIMEOUT_MS);
    process.env.DATABASE_RETRY_COUNT = String(RETRY_COUNT);

    // 環境変数を書き換えた後に読み込み、db.ts のシングルトンを応答しないサーバーへ向けて組み立てさせる
    const { validateEnv } = await import('../../config/env.js');
    validateEnv();
    app = (await import('../../app.js')).default;
    const db = await import('../../db.js');
    disconnectPrisma = db.disconnectPrisma;
    const redisModule = await import('../../redis.js');
    await redisModule.initRedis();
    const client = redisModule.default.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client?.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    disconnectRedis = redisModule.default.disconnect;
    const tokenService = (await import('../../services/token.service.js')).default;

    accessToken = await tokenService.generateAccessToken({
      userId: ACTOR_ID,
      email: 'ua3512@example.com',
      roles: ['admin'],
    });
  }, BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await redisClient?.del(ACTOR_CACHE_KEY);
    await disconnectRedis?.();
    await disconnectPrisma?.();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of OVERRIDDEN_ENV) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  /**
   * 要求を送り、503 と Problem Details を返すこと、応答が再試行の予算を使い切った後であることを確かめる
   */
  async function expectServiceUnavailable(
    send: () => request.Test,
    instance: string
  ): Promise<void> {
    const startedAt = performance.now();
    const response = await send();
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance });
    // 接続の再試行を使い切ってから失敗している
    expect(elapsedMs).toBeGreaterThanOrEqual(CONNECT_BUDGET_MS - TIMING_TOLERANCE_MS);
  }

  describe('権限のキャッシュに当たらない場合（最初の DB への到達は権限の判定）', () => {
    beforeEach(async () => {
      await redisClient.del(ACTOR_CACHE_KEY);
    });

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('ユーザーへのロールの追加（POST /api/v1/users/:id/roles）は 503 と Problem Details を返す', async () => {
      await expectServiceUnavailable(
        () =>
          request(app)
            .post('/api/v1/users/ua3512-user/roles')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ roleIds: ['ua3512-role'] }),
        '/api/v1/users/ua3512-user/roles'
      );
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('ユーザーからのロールの削除（DELETE /api/v1/users/:id/roles/:roleId）は 503 と Problem Details を返す', async () => {
      await expectServiceUnavailable(
        () =>
          request(app)
            .delete('/api/v1/users/ua3512-user/roles/ua3512-role')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/users/ua3512-user/roles/ua3512-role'
      );
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('ユーザーの削除（DELETE /api/v1/users/:id）は 503 と Problem Details を返す', async () => {
      await expectServiceUnavailable(
        () =>
          request(app)
            .delete('/api/v1/users/ua3512-user')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/users/ua3512-user'
      );
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('ロールへの権限の追加（POST /api/v1/roles/:id/permissions）は 503 と Problem Details を返す', async () => {
      await expectServiceUnavailable(
        () =>
          request(app)
            .post('/api/v1/roles/ua3512-role/permissions')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ permissionIds: ['ua3512-permission'] }),
        '/api/v1/roles/ua3512-role/permissions'
      );
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('ロールからの権限の削除（DELETE /api/v1/roles/:id/permissions/:permissionId）は 503 と Problem Details を返す', async () => {
      await expectServiceUnavailable(
        () =>
          request(app)
            .delete('/api/v1/roles/ua3512-role/permissions/ua3512-permission')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/roles/ua3512-role/permissions/ua3512-permission'
      );
    }, 30000);
  });

  /**
   * 権限の判定はキャッシュで通り、最初の DB への到達はトランザクションの開始となる（タスク35.12 の maxWait の経路）。
   * 実運用で権限のキャッシュが残っている間の経路。maxWait が予算を覆わなければ、約 2 秒の P2028 で 500 となり赤くなる
   */
  describe('権限のキャッシュに当たる場合（最初の DB への到達はトランザクションの開始）', () => {
    beforeEach(async () => {
      await redisClient.set(ACTOR_CACHE_KEY, ALL_PERMISSIONS_CACHE, 'EX', 60);
    });

    afterEach(async () => {
      await redisClient.del(ACTOR_CACHE_KEY);
    });

    /**
     * 対照: この構成で権限の判定がキャッシュを読んでいることを確かめる。キャッシュが「権限なし」を示すと、
     * 権限の判定は DB を引かずに拒否し 403 になる（判定が DB を引いていれば接続のタイムアウトで 503 になる）。
     * 拒否の監査ログの記録は DB へ届いて接続のタイムアウトで失敗するが、authorize.middleware.ts はその失敗を
     * ログに残すだけで応答を変えないため、応答は予算の後の 403 となる
     */
    it('対照: キャッシュが権限なしを示すときは権限の判定が DB を引かずに 403 を返す', async () => {
      await redisClient.set(ACTOR_CACHE_KEY, '[]', 'EX', 60);

      const response = await request(app)
        .delete('/api/v1/users/ua3512-user')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
    }, 30000);

    const cases: Array<[string, () => request.Test, string]> = [
      [
        'ユーザーへのロールの追加（POST /api/v1/users/:id/roles）',
        () =>
          request(app)
            .post('/api/v1/users/ua3512-user/roles')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ roleIds: ['ua3512-role'] }),
        '/api/v1/users/ua3512-user/roles',
      ],
      [
        'ユーザーからのロールの削除（DELETE /api/v1/users/:id/roles/:roleId）',
        () =>
          request(app)
            .delete('/api/v1/users/ua3512-user/roles/ua3512-role')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/users/ua3512-user/roles/ua3512-role',
      ],
      [
        'ユーザーの削除（DELETE /api/v1/users/:id）',
        () =>
          request(app)
            .delete('/api/v1/users/ua3512-user')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/users/ua3512-user',
      ],
      [
        'ロールへの権限の追加（POST /api/v1/roles/:id/permissions）',
        () =>
          request(app)
            .post('/api/v1/roles/ua3512-role/permissions')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ permissionIds: ['ua3512-permission'] }),
        '/api/v1/roles/ua3512-role/permissions',
      ],
      [
        'ロールからの権限の削除（DELETE /api/v1/roles/:id/permissions/:permissionId）',
        () =>
          request(app)
            .delete('/api/v1/roles/ua3512-role/permissions/ua3512-permission')
            .set('Authorization', `Bearer ${accessToken}`),
        '/api/v1/roles/ua3512-role/permissions/ua3512-permission',
      ],
    ];

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it.each(cases)(
      '%s はトランザクションの開始で予算を使い切ってから 503 を返す',
      async (_label, send, instance) => {
        await expectServiceUnavailable(send, instance);
      },
      30000
    );
  });
});
