/**
 * @fileoverview データベース接続を確立できないときの 503 の統合検証（タスク35.8）
 *
 * モックを使わず、本物の PrismaClient・@prisma/adapter-pg・RetryingPool（db.ts）・エラーハンドラーを通す。
 * 接続先は、TCP 接続は受け付けるが一切応答しないローカルのサーバーとし、
 * 接続の確立が connectionTimeoutMillis 内に終わらない状況を決定的に作る。
 * 再試行（1 秒・2 秒・4 秒）を使い切った後の失敗が HTTP の 503 と Problem Details になることを確かめる。
 *
 * 範囲: errorHandler の接続タイムアウトの対応づけ（要件24.1 の前提。実エンドポイントへの到達はタスク35.11）。
 * ルートは検証専用で、実際の認証系エンドポイントではない（それらはサービス層で DB 例外を捕まえるため、
 * 現状ここへ届かない）。そのため被覆印は付けない。
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { RetryingPool } from '../../db.js';
import { errorHandler } from '../../middleware/errorHandler.middleware.js';

/** 接続の確立を待つ時間（ミリ秒）。再試行の間隔（計 7000ms）に比べ十分に短くする */
const CONNECTION_TIMEOUT_MS = 200;

describe('データベース接続を確立できないときの 503（統合）', () => {
  let server: net.Server;
  const sockets = new Set<net.Socket>();
  let prisma: PrismaClient;

  beforeAll(async () => {
    // TCP 接続は受け付けるが、PostgreSQL の起動メッセージに一切応答しない
    server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const pool = new RetryingPool({
      connectionString: `postgresql://user:password@127.0.0.1:${port}/unreachable`,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /**
   * データベース接続がタイムアウト以内に確立できない（再試行を使い切った）とき、本物の Prisma を通したルートへの要求が 503 Service Unavailable の Problem Details を返す
   */
  it('接続の確立がタイムアウトし再試行を使い切ると、ルートへの要求が503とProblem Detailsを返す', async () => {
    const app = express();
    app.get('/__test__/db-timeout', async (_req, res, next) => {
      try {
        const user = await prisma.user.findFirst();
        res.json({ user });
      } catch (error) {
        next(error);
      }
    });
    app.use(errorHandler);

    const startedAt = performance.now();
    const response = await request(app).get('/__test__/db-timeout');
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      type: 'https://api.architrack.com/errors/internal-server-error',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Database connection error',
      instance: '/__test__/db-timeout',
    });
    // 1 秒・2 秒・4 秒の再試行を経てから失敗している（再試行を使い切った後の失敗である）
    expect(elapsedMs).toBeGreaterThanOrEqual(7000);
  }, 30000);
});
