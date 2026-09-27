/**
 * @fileoverview 最初の DB への到達が対話型トランザクションの開始である認証系の書き込みが、
 * DB 接続のタイムアウトで 503 を返すことの統合検証（タスク35.12）
 *
 * モックを使わず、本物のアプリ（app.ts のルート・UserRoleService・RolePermissionService）と、
 * db.ts の getPrismaClient が組み立てる本物の PrismaClient・@prisma/adapter-pg・RetryingPool、エラーハンドラーを通す。
 * 接続先は、TCP 接続は受け付けるが一切応答しないローカルのサーバーとする。
 *
 * 再試行の予算（DATABASE_RETRY_COUNT=1・DATABASE_CONNECTION_TIMEOUT=1000 で 1000 + 1000 + 1000 = 3000ms）を
 * Prisma の maxWait の既定 2000ms より長くし、maxWait が予算を覆わなければトランザクションの開始が
 * P2028 で打ち切られ 500 になる状況を作る。
 *
 * 権限の確認（requirePermission）について: 対象のエンドポイントはすべて requirePermission を通る。
 * requirePermission は Redis を持たない RBACService を都度生成するため権限のキャッシュが効かず、
 * 判定は必ず DB を引く。その例外は authorize.middleware.ts が捕まえ自前の 500 を返す（タスク35.13 の範囲）。
 * キャッシュを仕込んで通すことはできないため、ここでは RBACService.prototype.hasPermission だけを
 * 「権限あり」に差し替え、ルート・サービス・トランザクションの開始の経路を本物のまま確かめる。
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

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
    const tokenService = (await import('../../services/token.service.js')).default;

    // 権限の確認だけを「権限あり」にする（上の fileoverview を参照）
    const { RBACService } = await import('../../services/rbac.service.js');
    vi.spyOn(RBACService.prototype, 'hasPermission').mockResolvedValue(true);

    accessToken = await tokenService.generateAccessToken({
      userId: 'ua3512-actor',
      email: 'ua3512@example.com',
      roles: ['admin'],
    });
  }, BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    vi.restoreAllMocks();
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
    // Prisma の maxWait（既定 2000ms）で打ち切られず、接続の再試行を使い切ってから失敗している
    expect(elapsedMs).toBeGreaterThanOrEqual(CONNECT_BUDGET_MS - TIMING_TOLERANCE_MS);
  }

  /**
   * @requirement user-authentication/REQ-24.1
   * （hasPermission を差し替えた前提。タスク35.13 の完了まで実運用では authorize.middleware の 500 が先に返る）
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
   * （hasPermission を差し替えた前提。タスク35.13 の完了まで実運用では authorize.middleware の 500 が先に返る）
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
   * （hasPermission を差し替えた前提。タスク35.13 の完了まで実運用では authorize.middleware の 500 が先に返る）
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
   * （hasPermission を差し替えた前提。タスク35.13 の完了まで実運用では authorize.middleware の 500 が先に返る）
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
   * （hasPermission を差し替えた前提。タスク35.13 の完了まで実運用では authorize.middleware の 500 が先に返る）
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
