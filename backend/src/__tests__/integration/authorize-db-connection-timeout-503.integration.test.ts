/**
 * @fileoverview 権限の確認（requirePermission）を通る実エンドポイントが、DB 接続のタイムアウトで
 * 503 を返すことの統合検証（タスク35.13）
 *
 * モックを使わず、本物のアプリ（app.ts のルート・authenticate・requirePermission・RBACService）と、
 * db.ts の getPrismaClient が組み立てる本物の PrismaClient・@prisma/adapter-pg・RetryingPool、エラーハンドラーを通す。
 * 接続先は、TCP 接続は受け付けるが一切応答しないローカルのサーバーとする。
 *
 * requirePermission は Redis を持たない RBACService を都度生成するため、権限のキャッシュに当たらず、
 * 判定は必ず DB を引く。ここでは RBACService を差し替えず、その判定の DB 接続のタイムアウトが
 * authorize.middleware.ts からエラーハンドラーへ渡り 503 になることを確かめる。
 *
 * 対象は、ルートのハンドラーより先に権限の判定で DB へ到達する読み出しのエンドポイント
 * （roles / permissions / user-roles）。各要求を速く終えるため、DATABASE_RETRY_COUNT を 0（再試行なし）、
 * DATABASE_CONNECTION_TIMEOUT を 200ms とする（auth-db-connection-timeout-503.integration.test.ts と同じ）。
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

/** 接続の確立を待つ時間（ミリ秒） */
const CONNECTION_TIMEOUT_MS = 200;

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

describe('権限の確認を通るエンドポイントの DB 接続タイムアウト時の 503（統合）', () => {
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
    process.env.DATABASE_RETRY_COUNT = '0';

    // 環境変数を書き換えた後に読み込み、db.ts のシングルトンを応答しないサーバーへ向けて組み立てさせる
    const { validateEnv } = await import('../../config/env.js');
    validateEnv();
    app = (await import('../../app.js')).default;
    const db = await import('../../db.js');
    disconnectPrisma = db.disconnectPrisma;
    const tokenService = (await import('../../services/token.service.js')).default;

    accessToken = await tokenService.generateAccessToken({
      userId: 'ua3513-actor',
      email: 'ua3513@example.com',
      roles: ['admin'],
    });
  }, BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
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
   * GET を送り、503 と Problem Details を返すことを確かめる
   */
  async function expectServiceUnavailable(path: string): Promise<void> {
    const response = await request(app).get(path).set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: path });
  }

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('ロールの一覧（GET /api/v1/roles）は 503 と Problem Details を返す', async () => {
    await expectServiceUnavailable('/api/v1/roles');
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('ロールの権限の一覧（GET /api/v1/roles/:id/permissions）は 503 と Problem Details を返す', async () => {
    await expectServiceUnavailable('/api/v1/roles/ua3513-role/permissions');
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('権限の一覧（GET /api/v1/permissions）は 503 と Problem Details を返す', async () => {
    await expectServiceUnavailable('/api/v1/permissions');
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('ユーザーの一覧（GET /api/v1/users）は 503 と Problem Details を返す', async () => {
    await expectServiceUnavailable('/api/v1/users');
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('ユーザーのロールの一覧（GET /api/v1/users/:id/roles）は 503 と Problem Details を返す', async () => {
    await expectServiceUnavailable('/api/v1/users/ua3513-user/roles');
  }, 30000);
});
