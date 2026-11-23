/**
 * @fileoverview 外部アプリの認可の値がログへ出ないことの検証（user-authentication タスク71.4）
 *
 * Requirements (user-authentication):
 * - REQ-48.8: 外部アプリ用トークンの値をアプリケーションログに出力しない
 *
 * 共通の設定（vitest.setup.ts）はロガーをモックに置き換えるため、本物の伏せ字の設定と
 * シリアライザーを読み、メモリへ書く pino で実際の出力を確かめる。
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import pino from 'pino';
import request from 'supertest';
import { redactSensitiveText, redactUrlQuery } from '../../../utils/url-query-redaction.js';

const VALUE = 'oauth-sensitive-value-7f3a';

/** 値を必ず伏せるキー（名前だけで機密と分かる） */
const CREDENTIAL_KEYS = ['code_verifier', 'refresh_token', 'access_token', 'client_secret'];
/** 一般的な名前のため、要求の入れ物の中でだけ伏せるキー */
const CONTEXTUAL_KEYS = ['code', 'state'];
const ALL_KEYS = [...CREDENTIAL_KEYS, ...CONTEXTUAL_KEYS];

describe('redactUrlQuery の外部アプリの認可の値', () => {
  it.each(ALL_KEYS)('クエリの %s の値を伏せる', (key) => {
    expect(redactUrlQuery(`/oauth/auth?${key}=${VALUE}&client_id=claude`)).toBe(
      `/oauth/auth?${key}=[REDACTED]&client_id=claude`
    );
  });

  it.each(ALL_KEYS)('%s は大文字とパーセントエンコードの綴りでも伏せる', (key) => {
    const encoded = key.replace('_', '%5F').toUpperCase();
    expect(redactUrlQuery(`/oauth/token?${encoded}=${VALUE}`)).not.toContain(VALUE);
  });

  it('認可の値でないキーは残す', () => {
    const url = '/oauth/auth?client_id=claude&scope=read&response_type=code&page=2';
    expect(redactUrlQuery(url)).toBe(url);
  });
});

describe('redactSensitiveText', () => {
  it.each(CREDENTIAL_KEYS)('文の中の %s=値 を伏せる', (key) => {
    const text = redactSensitiveText(`failed: grant_type=x&${key}=${VALUE}&scope=read`);
    expect(text).toBe(`failed: grant_type=x&${key}=[REDACTED]&scope=read`);
  });

  it.each(CREDENTIAL_KEYS)('文の中の JSON の %s の値を伏せる', (key) => {
    expect(redactSensitiveText(`body {"${key}":"${VALUE}","a":1}`)).toBe(
      `body {"${key}":"[REDACTED]","a":1}`
    );
    expect(redactSensitiveText(`body {\\"${key}\\": \\"${VALUE}\\"}`)).not.toContain(VALUE);
  });

  it.each(CREDENTIAL_KEYS)('キーの _ がパーセントエンコードされた %s も伏せる', (key) => {
    expect(redactSensitiveText(`x&${key.replace('_', '%5F')}=${VALUE}`)).not.toContain(VALUE);
  });

  it.each(CONTEXTUAL_KEYS)('URL とフォームの形の %s を伏せる', (key) => {
    expect(redactSensitiveText(`GET https://a.example/cb?${key}=${VALUE}&x=1`)).toBe(
      `GET https://a.example/cb?${key}=[REDACTED]&x=1`
    );
    expect(redactSensitiveText(`a=1&${key}=${VALUE}`)).toBe(`a=1&${key}=[REDACTED]`);
    expect(redactSensitiveText(`${key}=${VALUE}&a=1`)).toBe(`${key}=[REDACTED]&a=1`);
  });

  it('エラーの文の code=・state= は URL やフォームの形でなければ残す', () => {
    const text = 'connect failed code=ECONNREFUSED state=CLOSED';
    expect(redactSensitiveText(text)).toBe(text);
  });
});

describe('本物のロガーの設定', () => {
  let loggerRedaction: pino.LoggerOptions['redact'];
  let loggerSerializers: pino.LoggerOptions['serializers'];
  let lines: string[];
  let log: pino.Logger;

  const output = (): string => lines.join('');
  const entry = (): Record<string, unknown> =>
    JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('../../../utils/logger.js')>(
      '../../../utils/logger.js'
    );
    loggerRedaction = actual.loggerRedaction;
    loggerSerializers = actual.loggerSerializers;
  });

  beforeEach(() => {
    lines = [];
    log = pino(
      { redact: loggerRedaction, serializers: loggerSerializers },
      { write: (chunk: string) => lines.push(chunk) }
    );
  });

  it.each([...CREDENTIAL_KEYS, 'clientSecret', 'codeVerifier'])(
    '%s を最上位と一段下で伏せる',
    (key) => {
      log.info({ [key]: VALUE, nested: { [key]: VALUE } }, 'x');
      expect(output()).not.toContain(VALUE);
    }
  );

  describe.each(['body', 'query', 'params', 'req.body', 'req.query', 'req.params'])(
    '要求の入れ物 %s',
    (container) => {
      const wrap = (value: Record<string, unknown>): Record<string, unknown> =>
        container.startsWith('req.')
          ? { req: { [container.slice(4)]: value } }
          : { [container]: value };

      it.each(ALL_KEYS)('%s の値を伏せる', (key) => {
        // req は本物のシリアライザーを通さず、入れ物の形だけを渡す
        const plain = pino(
          { redact: loggerRedaction },
          { write: (chunk: string) => lines.push(chunk) }
        );
        plain.info(wrap({ [key]: VALUE, grant_type: 'refresh_token' }), 'x');
        expect(output()).not.toContain(VALUE);
        expect(output()).toContain('refresh_token');
      });
    }
  );

  it('最上位の code・state とエラーの code は診断のために残す', () => {
    const err = Object.assign(new Error('boom'), { code: 'P2002' });
    log.warn({ err, code: 'P2002', state: 'active' }, 'x');
    const logged = entry();
    expect(logged.code).toBe('P2002');
    expect(logged.state).toBe('active');
    expect((logged.err as { code: string }).code).toBe('P2002');
  });

  it('要求のシリアライザーは URL のクエリと Cookie を伏せる', () => {
    const req = {
      method: 'GET',
      url: `/oauth/auth?state=${VALUE}&client_id=claude`,
      headers: { cookie: `_session=${VALUE}`, authorization: `Bearer ${VALUE}` },
      socket: {},
    };
    log.info({ req }, 'x');
    expect(output()).not.toContain(VALUE);
    expect(output()).toContain('client_id=claude');
  });

  it('応答の Location ヘッダーの認可コードと state を出さない', () => {
    const res = {
      statusCode: 303,
      getHeaders: () => ({ location: `https://claude.ai/cb?code=${VALUE}&state=${VALUE}` }),
    };
    log.info({ res }, 'x');
    expect(output()).not.toContain(VALUE);
  });

  it('エラーの文・スタック・文字列の項目の機密を伏せ、本文の項目を出さない', () => {
    const err = Object.assign(new Error(`token failed: refresh_token=${VALUE}`), {
      url: `https://a.example/oauth/token?client_secret=${VALUE}`,
      body: `grant_type=refresh_token&refresh_token=${VALUE}`,
    });
    log.error({ err }, 'x');
    expect(output()).not.toContain(VALUE);
    expect((entry().err as { message: string }).message).toContain('token failed');
  });

  it('error のキーで記録したエラーの本文の項目も出さない', () => {
    const error = Object.assign(new Error('parse'), { body: `client_secret=${VALUE}` });
    log.error({ error }, 'x');
    expect(output()).not.toContain(VALUE);
  });

  it('独自の raw を持つ Error もエラーとして記録し、文の機密を伏せる', () => {
    const err = Object.assign(new Error(`failed refresh_token=${VALUE}`), { raw: 'upstream' });
    log.error({ err }, 'x');
    expect(output()).not.toContain(VALUE);
    expect((entry().err as { message: string }).message).toBe('failed refresh_token=[REDACTED]');
  });

  it('エラーでない err はそのまま記録する', () => {
    log.warn({ err: 'plain failure' }, 'x');
    expect(entry().err).toBe('plain failure');
  });

  it.each([
    ['フォームの形', `refresh_token=${VALUE}`],
    ['壊れた JSON', `{"client_secret":"${VALUE}"`],
    ['短い値', VALUE],
  ])('本物の JSON パーサーの失敗（%s）で本文の断片を出さない', async (_name, payload) => {
    const app = express();
    app.use(express.json());
    app.post('/oauth/token', (_req, res) => {
      res.sendStatus(200);
    });
    let captured: unknown;
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      captured = err;
      res.sendStatus(400);
    });

    await request(app).post('/oauth/token').set('Content-Type', 'application/json').send(payload);

    expect((captured as { type?: string }).type).toBe('entity.parse.failed');
    log.error({ err: captured }, 'Internal server error');
    expect(output()).not.toContain(VALUE);
    expect(output()).not.toContain(VALUE.slice(0, 8));
    expect((entry().err as { type: string }).type).toBe('SyntaxError');
  });
});
