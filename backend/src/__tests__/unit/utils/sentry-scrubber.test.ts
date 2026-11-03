/**
 * @fileoverview エラー監視へ送る事象の伏せ字の検証（user-authentication タスク55.3）
 *
 * Requirements (user-authentication):
 * - REQ-42.4: 想定外のエラーをエラー監視サービスへ送信するとき、要求本文、Cookie、認証ヘッダーの機密値を送信しない
 *
 * initSentry が Sentry.init へ渡す beforeSend・beforeSendTransaction・beforeBreadcrumb を取り出し、
 * SDK が組み立てる形の事象を通して、送られる内容を確かめる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry } from '../../../utils/sentry.js';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => 'mocked-profiling-integration'),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type TransactionEvent = Parameters<NonNullable<InitOptions['beforeSendTransaction']>>[0];

/** 要求本文・Cookie・認証ヘッダー・機密のクエリを持つ、SDK が組み立てる形の要求 */
function sensitiveRequest(): NonNullable<Sentry.Event['request']> {
  return {
    url: 'https://api.example.com/api/v1/auth/login?token=abc123&page=2',
    method: 'POST',
    data: '{"email":"user@example.com","password":"Secret-Pass-1"}',
    cookies: { refreshToken: 'refresh-cookie-value' },
    headers: {
      Authorization: 'Bearer access-token-value',
      Cookie: 'refreshToken=refresh-cookie-value',
      'X-CSRF-Token': 'csrf-token-value',
      'user-agent': 'vitest-agent',
    },
    query_string: 'token=abc123&page=2',
  };
}

function initOptions(): InitOptions {
  process.env.SENTRY_DSN = 'https://test@sentry.io/123';
  initSentry();
  const options = vi.mocked(Sentry.init).mock.calls[0]?.[0];
  if (!options) throw new Error('Sentry.init が呼ばれていない');
  return options;
}

const SECRETS = [
  'Secret-Pass-1',
  'refresh-cookie-value',
  'access-token-value',
  'csrf-token-value',
  'abc123',
];

describe('SentryScrubber（initSentry の送信前の処理）', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('送信されるエラーの事象に要求本文・Cookie・認証ヘッダー・機密のクエリの値が無い', () => {
    const options = initOptions();
    const event: Sentry.ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'boom' }] },
      request: sensitiveRequest(),
    };

    const sent = options.beforeSend?.(event, {}) as Sentry.ErrorEvent | null;

    expect(sent).not.toBeNull();
    const request = sent?.request;
    expect(request?.data).toBeUndefined();
    expect(request?.cookies).toBeUndefined();
    expect(request?.headers).toEqual({
      Authorization: '[Filtered]',
      Cookie: '[Filtered]',
      'X-CSRF-Token': '[Filtered]',
      'user-agent': 'vitest-agent',
    });
    expect(request?.url).toBe('https://api.example.com/api/v1/auth/login?token=[REDACTED]&page=2');
    expect(request?.query_string).toBe('token=[REDACTED]&page=2');
    const serialized = JSON.stringify(sent);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('ヘッダー名の大文字小文字に関わらず認証ヘッダーを伏せ、文字列でないクエリは送らない', () => {
    const options = initOptions();
    const event: Sentry.ErrorEvent = {
      type: undefined,
      request: {
        headers: { authorization: 'Bearer lower-token', COOKIE: 'a=b', 'x-csrf-token': 'c' },
        query_string: [['password', 'pw-value']],
      },
    };

    const sent = options.beforeSend?.(event, {}) as Sentry.ErrorEvent | null;

    expect(sent?.request?.headers).toEqual({
      authorization: '[Filtered]',
      COOKIE: '[Filtered]',
      'x-csrf-token': '[Filtered]',
    });
    expect(sent?.request?.query_string).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain('pw-value');
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('トレースの事象からも要求本文・Cookie・認証ヘッダーを除く', () => {
    const options = initOptions();
    const event: TransactionEvent = {
      type: 'transaction',
      request: sensitiveRequest(),
    };

    const sent = options.beforeSendTransaction?.(event, {}) as TransactionEvent | null;

    expect(sent?.request?.data).toBeUndefined();
    expect(sent?.request?.cookies).toBeUndefined();
    expect(sent?.request?.headers?.Authorization).toBe('[Filtered]');
    const serialized = JSON.stringify(sent);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('HTTP の記録（breadcrumb）の URL・クエリ・断片の機密の値を伏せる', () => {
    const options = initOptions();
    const breadcrumb: Sentry.Breadcrumb = {
      category: 'http',
      data: {
        url: 'https://r2.example.com/bucket/a.jpg?X-Amz-Signature=sig-value&w=100',
        'http.query': '?X-Amz-Credential=cred-value&w=100',
        'http.fragment': '#token=frag-value',
        method: 'GET',
      },
    };

    const kept = options.beforeBreadcrumb?.(breadcrumb, {});

    expect(kept?.data).toEqual({
      url: 'https://r2.example.com/bucket/a.jpg?X-Amz-Signature=[REDACTED]&w=100',
      'http.query': '?X-Amz-Credential=[REDACTED]&w=100',
      'http.fragment': '#[REDACTED]',
      method: 'GET',
    });
  });

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it('個人情報を既定で付けない設定（sendDefaultPii: false）で初期化する', () => {
    const options = initOptions();

    expect(options.sendDefaultPii).toBe(false);
  });
});

describe('SentryScrubber の形の分岐（要求・ヘッダー・記録の欠けた事象）', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('要求を持たない事象はそのまま送る', () => {
    const options = initOptions();
    const event: Sentry.ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    };

    expect(options.beforeSend?.(event, {})).toEqual({
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    });
  });

  it('ヘッダーとクエリの無い要求は本文と Cookie だけを除き、URL のクエリを伏せる', () => {
    const options = initOptions();
    const event: Sentry.ErrorEvent = {
      type: undefined,
      request: {
        url: '/api/v1/auth/password/verify-reset?token=reset-token-value',
        data: 'body-value',
        cookies: { a: 'cookie-value' },
      },
    };

    const sent = options.beforeSend?.(event, {}) as Sentry.ErrorEvent | null;

    expect(sent?.request).toEqual({
      url: '/api/v1/auth/password/verify-reset?token=[REDACTED]',
    });
  });

  it('記録（breadcrumb）の data が無ければそのまま返す', () => {
    const options = initOptions();
    const breadcrumb: Sentry.Breadcrumb = { category: 'console', message: 'hello' };

    expect(options.beforeBreadcrumb?.(breadcrumb, {})).toEqual({
      category: 'console',
      message: 'hello',
    });
  });

  it('記録の data に URL・クエリが無く断片が空なら、他の値を変えない', () => {
    const options = initOptions();
    const breadcrumb: Sentry.Breadcrumb = {
      category: 'http',
      data: { method: 'GET', status_code: 200, 'http.fragment': '' },
    };

    expect(options.beforeBreadcrumb?.(breadcrumb, {})?.data).toEqual({
      method: 'GET',
      status_code: 200,
      'http.fragment': '',
    });
  });

  it('開発の実行環境でも伏せた後の事象を送り、Not found の事象は送らない', () => {
    process.env.NODE_ENV = 'development';
    const options = initOptions();
    const event: Sentry.ErrorEvent = {
      type: undefined,
      request: { headers: { Authorization: 'Bearer dev-token' } },
    };
    const notFound: Sentry.ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'Not found: project' }] },
    };

    const sent = options.beforeSend?.(event, {}) as Sentry.ErrorEvent | null;

    expect(sent?.request?.headers).toEqual({ Authorization: '[Filtered]' });
    expect(options.beforeSend?.(notFound, {})).toBeNull();
  });
});
