/**
 * @fileoverview 認証系の実エンドポイントが DB 接続のタイムアウトで 503 を返すことの統合検証（タスク35.11）
 *
 * モックを使わず、本物のアプリ（app.ts の認証ルート・AuthService・SessionService）と、
 * db.ts の getPrismaClient が組み立てる本物の PrismaClient・@prisma/adapter-pg・RetryingPool、エラーハンドラーを通す。
 * 接続先は、TCP 接続は受け付けるが一切応答しないローカルのサーバーとし、
 * 接続の確立が connectionTimeoutMillis 内に終わらない状況を決定的に作る。
 *
 * 再試行を使い切った後の失敗が 503 になること（1 秒・2 秒・4 秒の再試行を経ること）は
 * db-connection-timeout-503.integration.test.ts が確かめている。ここでは各要求を速く終えるため、
 * 環境変数 DATABASE_RETRY_COUNT を 0（再試行なし）、DATABASE_CONNECTION_TIMEOUT を 200ms とする。
 *
 * 範囲: 対話型トランザクションを開始する前に DB へ問い合わせるエンドポイント（ログイン・現在のユーザーの取得・
 * トークンの更新・ログアウト・全デバイスからのログアウト・登録）。トランザクションの開始が打ち切られる経路
 * （P2028）はタスク35.12 の範囲で、ここでは主張しない。
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

describe('認証系のエンドポイントの DB 接続タイムアウト時の 503（統合）', () => {
  let server: net.Server;
  const sockets = new Set<net.Socket>();
  const savedEnv: Partial<Record<(typeof OVERRIDDEN_ENV)[number], string | undefined>> = {};
  let app: Express;
  let disconnectPrisma: () => Promise<void>;
  let accessToken: string;
  let refreshToken: string;

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

    const payload = { userId: 'ua3511-user', email: 'ua3511@example.com', roles: ['user'] };
    accessToken = await tokenService.generateAccessToken(payload);
    refreshToken = await tokenService.generateRefreshToken(payload);
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
   * @requirement user-authentication/REQ-24.1
   */
  it('ログイン（POST /api/v1/auth/login）は 503 と Problem Details を返す', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ua3511@example.com', password: 'Password123!' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/login' });
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('現在のユーザーの取得（GET /api/v1/auth/me）は 503 と Problem Details を返す', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/me' });
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('トークンの更新（POST /api/v1/auth/refresh）は 503 と Problem Details を返す', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/refresh' });
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('ログアウト（POST /api/v1/auth/logout）は 503 と Problem Details を返す', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/logout' });
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('全デバイスからのログアウト（POST /api/v1/auth/logout-all）は 503 と Problem Details を返す', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/logout-all' });
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('登録（POST /api/v1/auth/register）は 503 と Problem Details を返す', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      invitationToken: 'ua3511-invitation-token',
      displayName: 'UA 35.11',
      password: 'Password123!Strong',
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/register' });
  }, 30000);
});
