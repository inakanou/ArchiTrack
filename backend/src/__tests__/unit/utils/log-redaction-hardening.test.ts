/**
 * @fileoverview ログの伏せ字の漏れと長い入力の扱いの検証（user-authentication タスク71.4 の差し戻し）
 *
 * Requirements (user-authentication):
 * - REQ-48.8: 外部アプリ用トークンの値をアプリケーションログに出力しない
 *
 * 本物の伏せ字の設定・シリアライザー・フックをメモリへ書く pino に渡し、出力を確かめる。
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import pino from 'pino';
import { redactSensitiveText, redactUrlQuery } from '../../../utils/url-query-redaction.js';
import { serializeLogError } from '../../../utils/log-error-serializer.js';

const SEC = 'S3CRET';

describe('redactSensitiveText の値の形', () => {
  it.each([
    `client_secret="${SEC}"`,
    `client_secret='${SEC} x'`,
    `{"client_secret":"a\\"${SEC}"}`,
    `{ client_secret: '${SEC}' }`,
    `client_secret: ${SEC}`,
    `{"client_secret":["${SEC}"]}`,
    `{"client_secret":{"v":"${SEC}"}}`,
    `clientSecret=${SEC}`,
    `{"clientSecret":"${SEC}"}`,
    `Client-Secret=${SEC}`,
    `%63lient_secret=${SEC}`,
    `client%5Fsecret=${SEC}`,
    `{"state":"${SEC}"}`,
    `{"code":"${SEC}"}`,
    `state=${SEC}`,
    `code=${SEC}`,
    `failed state=${SEC} next`,
    `grant_type=authorization_code&code=${SEC}`,
    `code=${SEC}&grant_type=x`,
    `https://a.example/cb?code=${SEC}&state=${SEC}`,
    `returnTo=%2Foauth%3Fstate%3D${SEC}%26x%3D1`,
    `Authorization: Basic ${SEC}`,
    `failed with Bearer ${SEC}`,
    `Map(1) {'client_secret' => '${SEC}'}`,
    `Map(1) {"refresh_token" => "${SEC}"}`,
    `refresh_token => ${SEC}`,
    `{"state" => "${SEC}"}`,
    `Authorization: DPoP ${SEC}`,
    `Authorization: Token ${SEC}`,
    `authorization=Digest ${SEC}`,
    `Proxy-Authorization: Negotiate abc ${SEC}`,
    `Authorization: "Token" ${SEC}`,
    `code_verifier[]=${SEC}`,
    `code_verifier[0]=${SEC}`,
    `code_verifier%5B%5D=${SEC}`,
    `a=1&state[]=${SEC}`,
  ])('%s の値を伏せる', (text) => {
    expect(redactSensitiveText(text)).not.toContain(SEC);
  });

  it.each([
    'connect failed code=ECONNREFUSED',
    'code=ERR_STREAM_DESTROYED',
    'prisma code=P2002',
    '{"code":"P2002"}',
    'status code: 500',
    'redis state=connecting',
    'circuit state=OPEN',
    'state: closed',
    'grant_type=refresh_token&response_type=code',
    'barcode=123&zip_code=100',
    'Bearer authentication failed',
    'state => closed',
    'code => ECONNRESET',
  ])('診断の文 %s は残す', (text) => {
    expect(redactSensitiveText(text)).toBe(text);
  });

  it('URL とフォームの形の code は、エラーコードの形でも伏せる', () => {
    expect(redactSensitiveText('/cb?code=ECONNREFUSED')).toBe('/cb?code=[REDACTED]');
    expect(redactSensitiveText('a=1&state=closed')).toBe('a=1&state=[REDACTED]');
  });

  it('Authorization の値は行末まで伏せ、次の行は残す', () => {
    expect(redactSensitiveText(`Authorization: Digest a=1, b=${SEC}\nnext line`)).toBe(
      'Authorization: [REDACTED]\nnext line'
    );
  });

  it('6 桁の数字の code は伏せる', () => {
    expect(redactSensitiveText('code=123456')).toBe('code=[REDACTED]');
  });

  it.each([
    ['長い JSON の値', `"client_secret":"${'a'.repeat(20_000_000)}`],
    ['キーの繰り返し', 'client_secret'.repeat(1_000_000)],
    ['エスケープの繰り返し', `"client_secret":"${'\\"'.repeat(2_000_000)}`],
    ['括弧の繰り返し', `client_secret=${'['.repeat(5_000_000)}`],
  ])('%s でも例外を投げず短時間で終わる', (_name, text) => {
    const start = Date.now();
    const result = redactSensitiveText(text);
    expect(result).toBe('[REDACTED]');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('上限の内の病的な入力も線形の時間で終わる', () => {
    const text = `"client_secret":"${'\\"'.repeat(30_000)}`;
    const start = Date.now();
    expect(redactSensitiveText(text)).not.toContain('\\"\\"');
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('redactUrlQuery の入れ子', () => {
  it.each([
    `/a?returnTo=%2Foauth%2Fauthorize%3Fstate%3D${SEC}%26code_challenge%3Dx`,
    `/a?returnTo=%252Foauth%253Fcode%253D${SEC}`,
    `/a?next=https://a.example/cb?token=${SEC}`,
    `/a?a[code]=${SEC}`,
    `/a?a%5Bclient_secret%5D=${SEC}`,
    `/a?x=1;code=${SEC}`,
    `/a?%63ode=${SEC}`,
  ])('%s の値を出さない', (url) => {
    expect(redactUrlQuery(url)).not.toContain(SEC);
  });

  it('入れ子に機密が無い値はそのまま残す', () => {
    const url = '/a?returnTo=%2Fprojects%3Fpage%3D2&sort=name';
    expect(redactUrlQuery(url)).toBe(url);
  });
});

describe('ログの出力', () => {
  let redact: pino.LoggerOptions['redact'];
  let serializers: pino.LoggerOptions['serializers'];
  let hooks: pino.LoggerOptions['hooks'];
  let lines: string[];
  let log: pino.Logger;
  const output = (): string => lines.join('');

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('../../../utils/logger.js')>(
      '../../../utils/logger.js'
    );
    redact = actual.loggerRedaction;
    serializers = actual.loggerSerializers;
    hooks = actual.loggerHooks;
  });

  beforeEach(() => {
    lines = [];
    log = pino({ redact, serializers, hooks }, { write: (chunk: string) => lines.push(chunk) });
  });

  const parseError = (): Error =>
    Object.assign(new SyntaxError(`Unexpected token in JSON: {"code":"${SEC}"`), {
      type: 'entity.parse.failed',
      body: `{"code":"${SEC}"`,
    });

  it.each<[string, () => unknown]>([
    ['文字列の err', () => `client_secret=${SEC}`],
    ['オブジェクトの err', () => ({ message: `client_secret=${SEC}` })],
    ['凍結した err', () => Object.freeze({ message: `client_secret=${SEC}` })],
    ['cause', () => new Error('outer', { cause: new Error(`client_secret=${SEC}`) })],
    ['解析エラーの cause', () => new Error('wrap', { cause: parseError() })],
    [
      'config と response',
      () =>
        Object.assign(new Error('x'), {
          config: {
            data: `client_secret=${SEC}`,
            params: { state: SEC },
            headers: { Authorization: `Basic ${SEC}` },
          },
          response: { data: { refresh_token: SEC }, headers: { 'set-cookie': [SEC] } },
        }),
    ],
    ['配列の details', () => Object.assign(new Error('x'), { details: [`client_secret=${SEC}`] })],
    [
      '入れ子の details',
      () => Object.assign(new Error('x'), { details: [{ field: { client_secret: SEC } }] }),
    ],
  ])('%s の機密を出さない', (_name, build) => {
    log.error({ err: build() }, 'm');
    expect(output()).not.toContain(SEC);
  });

  it('logger.error(err) の msg の機密を伏せる', () => {
    log.error(new Error(`bad client_secret=${SEC}`));
    expect(output()).not.toContain(SEC);
    expect((JSON.parse(lines[0]!) as { msg: string }).msg).toBe('bad client_secret=[REDACTED]');
  });

  it('logger.error(解析エラー) の msg に本文の断片を出さない', () => {
    log.error(parseError());
    expect(output()).not.toContain(SEC);
  });

  it('文字列だけのログの機密を伏せる', () => {
    log.warn(`token failed refresh_token=${SEC}`);
    expect(output()).not.toContain(SEC);
  });

  it('呼び出し元のエラーのオブジェクトを書き換えない', () => {
    const original = { message: `client_secret=${SEC}` };
    log.error({ err: original }, 'm');
    expect(original.message).toContain(SEC);
  });

  it('循環する参照と深い入れ子でも記録する', () => {
    const cyclic: Record<string, unknown> = { client_secret: SEC };
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = { client_secret: SEC };
    for (let i = 0; i < 100; i++) deep = { deep };
    log.error({ err: Object.assign(new Error('x'), { cyclic, deep }) }, 'm');
    expect(lines).toHaveLength(1);
    expect(output()).not.toContain(SEC);
  });

  it('読み出しで例外を投げるエラーでも記録し、例外を投げない', () => {
    const hostile = {
      get message(): string {
        throw new Error('boom');
      },
    };
    expect(() => serializeLogError(hostile as unknown as Error)).not.toThrow();
    log.error({ err: hostile }, 'm');
    expect(lines).toHaveLength(1);
  });

  it('長い文字列の項目は [REDACTED] にしてログを残す', () => {
    const err = Object.assign(new Error('long'), { detail: `${SEC}${'a'.repeat(9_000_000)}` });
    log.error({ err }, 'm');
    expect(output()).not.toContain(SEC);
    expect((JSON.parse(lines[0]!) as { err: { detail: string } }).err.detail).toBe('[REDACTED]');
  });

  it('エラーの code と Zod の issues の code は残す', () => {
    const err = Object.assign(new Error('x'), {
      code: 'P2002',
      issues: [{ code: 'invalid_type', path: ['a'] }],
    });
    log.error({ err }, 'm');
    const logged = JSON.parse(lines[0]!) as {
      err: { code: string; issues: { code: string }[] };
    };
    expect(logged.err.code).toBe('P2002');
    expect(logged.err.issues[0]!.code).toBe('invalid_type');
  });

  it.each<[string, Record<string, unknown>]>([
    ['body のフォームの文字列', { body: `code=${SEC}&client_secret=${SEC}` }],
    ['body.Client_Secret', { body: { Client_Secret: SEC } }],
    ['body.a.client_secret', { body: { a: { client_secret: SEC } } }],
    ['body.a.code', { body: { a: { code: SEC, state: SEC } } }],
    ['query の入れ子', { query: { a: { refresh_token: SEC } } }],
    ['最上位の headers.authorization', { headers: { authorization: `Basic ${SEC}` } }],
    ['最上位の headers.Location', { headers: { Location: `https://c/cb?code=${SEC}` } }],
    [
      'req.headers の proxy-authorization',
      { req: { method: 'GET', url: '/', headers: { 'proxy-authorization': `Basic ${SEC}` } } },
    ],
  ])('%s を伏せる', (_name, fields) => {
    log.info(fields, 'm');
    expect(output()).not.toContain(SEC);
  });
});
