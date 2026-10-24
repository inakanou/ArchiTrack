/**
 * @fileoverview errorHandler がエラー監視へ付ける要求の文脈の検証（user-authentication タスク55.3）
 *
 * Requirements (user-authentication):
 * - REQ-42.4: 想定外のエラーをエラー監視サービスへ送信するとき、要求本文、Cookie、認証ヘッダーの機密値を送信しない
 *
 * 本物の errorHandler と sentry.ts の captureException を通し、Sentry.captureException へ渡る
 * 文脈（extra）が経路・メソッド・要求識別子・利用者 ID に限られることを確かめる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import * as Sentry from '@sentry/node';
import { Prisma } from '../../../generated/prisma/client.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import { InternalServerError } from '../../../errors/apiError.js';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => 'mocked-profiling-integration'),
}));

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';

/** 要求識別子と利用者を設定してから、指定のエラーを投げるアプリ */
function createApp(error: Error): Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { id: string }).id = REQUEST_ID;
    req.user = { userId: 'user-42', email: 'user@example.com', roles: ['user'] };
    next();
  });
  app.post('/api/v1/things/:secretParam', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

async function sendAndCaptureExtra(error: Error): Promise<Record<string, unknown>> {
  await request(createApp(error))
    .post('/api/v1/things/param-value?token=query-secret&page=2')
    .set('Authorization', 'Bearer header-secret')
    .set('Cookie', 'refreshToken=cookie-secret')
    .send({ password: 'body-secret' });
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  const hint = vi.mocked(Sentry.captureException).mock.calls[0]?.[1] as {
    extra: Record<string, unknown>;
  };
  return hint.extra;
}

const SECRETS = ['body-secret', 'query-secret', 'header-secret', 'cookie-secret'];

describe('errorHandler のエラー監視の文脈', () => {
  let originalDsn: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
  });

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('想定外のエラーでは要求本文・クエリ・パラメータを付けず、経路・メソッド・要求識別子・利用者 ID に限る', async () => {
    const extra = await sendAndCaptureExtra(new Error('unexpected'));

    expect(extra).toEqual({
      route: '/api/v1/things/param-value',
      method: 'POST',
      requestId: REQUEST_ID,
      userId: 'user-42',
    });
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it.each([
    ['5xx の ApiError', () => new InternalServerError('server failed')],
    [
      'DB の接続の障害',
      () => new Prisma.PrismaClientInitializationError('cannot connect', '7.0.0'),
    ],
    [
      'トランザクションの時間切れ',
      () =>
        new Prisma.PrismaClientKnownRequestError('timeout', {
          code: 'P2028',
          clientVersion: '7.0.0',
        }),
    ],
  ])('%s でも文脈に要求本文・クエリの機密を含めない', async (_label, makeError) => {
    const extra = await sendAndCaptureExtra(makeError());

    expect(extra).toMatchObject({
      route: '/api/v1/things/param-value',
      method: 'POST',
      requestId: REQUEST_ID,
      userId: 'user-42',
    });
    expect(extra).not.toHaveProperty('body');
    expect(extra).not.toHaveProperty('query');
    expect(extra).not.toHaveProperty('url');
    expect(extra).not.toHaveProperty('params');
    expect(extra).not.toHaveProperty('ip');
    const serialized = JSON.stringify(extra);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('想定外のエラーの文脈の全体に要求本文・Cookie・認証ヘッダー・クエリの値が現れない', async () => {
    const extra = await sendAndCaptureExtra(new Error('unexpected'));

    const serialized = JSON.stringify(extra);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });
});
