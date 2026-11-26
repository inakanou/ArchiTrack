/**
 * @fileoverview 実際の pino-http とエラーハンドラーを通した OAuth の値の伏せ字（user-authentication タスク71.4）
 *
 * Requirements (user-authentication):
 * - REQ-48.8: 外部アプリ用トークンの値をアプリケーションログに出力しない
 *
 * pino-http は自身のシリアライザーで err を上書きするため、ロガーの設定だけの検証では
 * 要求の経路の漏えいを見逃す。本物の設定を持つ pino へ書き、出力された行を確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const captured = vi.hoisted(() => ({ lines: [] as string[] }));

vi.unmock('../../../middleware/logger.middleware.js');

vi.mock('../../../utils/logger.js', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/logger.js')>(
    '../../../utils/logger.js'
  );
  const { default: pino } = await import('pino');
  return {
    ...actual,
    default: pino(
      {
        level: 'info',
        redact: actual.loggerRedaction,
        serializers: actual.loggerSerializers,
        hooks: actual.loggerHooks as import('pino').LoggerOptions['hooks'],
      },
      {
        write: (line: string) => {
          captured.lines.push(line);
        },
      }
    ),
  };
});

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const { httpLogger } = await import('../../../middleware/logger.middleware.js');
const { errorHandler } = await import('../../../middleware/errorHandler.middleware.js');

const VALUE = 'oauth-sensitive-value-7f3a';

function createApp(): express.Express {
  const app = express();
  app.use(httpLogger);
  app.use(express.json());
  app.all('/oauth/token', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/oauth/fail', () => {
    throw Object.assign(new Error(`token failed: refresh_token=${VALUE}`), {
      body: `client_secret=${VALUE}`,
    });
  });
  app.use(errorHandler);
  return app;
}

describe('要求の経路のログの OAuth の値', () => {
  beforeEach(() => {
    captured.lines.length = 0;
  });

  it('アクセスログの URL に認可の値を出さない', async () => {
    const query = ['code', 'state', 'code_verifier', 'refresh_token', 'access_token']
      .concat('client_secret')
      .map((key) => `${key}=${VALUE}`)
      .join('&');

    await request(createApp()).get(`/oauth/token?${query}&client_id=claude`).expect(200);

    const output = captured.lines.join('');
    expect(output).toContain('client_id=claude');
    expect(output).not.toContain(VALUE);
  });

  it.each([
    ['フォームの形', `refresh_token=${VALUE}`],
    ['壊れた JSON', `{"client_secret":"${VALUE}"`],
    ['短い値', VALUE],
  ])('本文の解析の失敗（%s）で本文の断片を記録しない', async (_name, payload) => {
    await request(createApp())
      .post('/oauth/token')
      .set('Content-Type', 'application/json')
      .send(payload);

    const output = captured.lines.join('');
    expect(output).toContain('Internal server error');
    expect(output).not.toContain(VALUE);
    expect(output).not.toContain(VALUE.slice(0, 8));
  });

  it('9MB を超える壊れた本文でも、ハンドラーのログとエラー監視への送信が残る', async () => {
    const { captureException } = await import('../../../utils/sentry.js');
    vi.mocked(captureException).mockClear();
    const app = express();
    app.use(httpLogger);
    app.use(express.json({ limit: '20mb' }));
    app.post('/oauth/token', (_req, res) => {
      res.sendStatus(200);
    });
    app.use(errorHandler);
    const payload = `{"client_secret":"${VALUE}${'a'.repeat(9_500_000)}`;

    await request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(500);

    const output = captured.lines.join('');
    expect(output).toContain('Internal server error');
    expect(output).not.toContain(VALUE);
    expect(output.length).toBeLessThan(100_000);
    expect(captureException).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('要求の中で投げられたエラーの文と本文の項目を記録しない', async () => {
    await request(createApp()).get('/oauth/fail').expect(500);

    const output = captured.lines.join('');
    expect(output).toContain('token failed');
    expect(output).not.toContain(VALUE);
  });
});
