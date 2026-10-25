import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { initSentry, captureException, captureMessage } from './sentry';

// Sentryのモック
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
  getClient: vi.fn(() => undefined),
}));

/** 直前の Sentry.init に渡した設定 */
function lastInitOptions(): Record<string, unknown> {
  const calls = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls;
  const options = calls[calls.length - 1]?.[0];
  expect(options, 'Sentry.init が呼ばれていること').toBeDefined();
  return options as Record<string, unknown>;
}

/** 直前の replayIntegration に渡した設定 */
function lastReplayOptions(): Record<string, unknown> {
  const calls = (Sentry.replayIntegration as ReturnType<typeof vi.fn>).mock.calls;
  const options = calls[calls.length - 1]?.[0];
  expect(options, 'replayIntegration が呼ばれていること').toBeDefined();
  return options as Record<string, unknown>;
}

type Hook = (value: unknown, hint?: unknown) => unknown;

function requireHook(options: Record<string, unknown>, name: string): Hook {
  const hook = options[name];
  expect(typeof hook, `${name} が設定されていること`).toBe('function');
  return hook as Hook;
}

describe('Sentry Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // console.info, console.debugをモック
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('initSentry', () => {
    it('DSNが設定されている場合、Sentryを初期化すること', () => {
      // DSNを設定
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('MODE', 'production');
      vi.stubEnv('PROD', true);

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example@sentry.io/123',
          environment: 'production',
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
        })
      );

      expect(console.info).toHaveBeenCalledWith('[Sentry] Initialized successfully', {
        environment: 'production',
      });
    });

    it('開発環境では100%のトレースサンプルレートを使用すること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('MODE', 'development');
      vi.stubEnv('PROD', false);
      vi.stubEnv('DEV', true);

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 1.0,
        })
      );
    });

    it('DSNが設定されていない場合、初期化をスキップすること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', '');

      initSentry();

      expect(Sentry.init).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(
        '[Sentry] DSN not configured, skipping initialization'
      );
    });

    it('DSNがundefinedの場合、初期化をスキップすること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', '');

      initSentry();

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('browserTracingIntegrationとreplayIntegrationを含むこと', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      initSentry();

      const initCall = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(initCall.integrations).toHaveLength(2);
      expect(Sentry.browserTracingIntegration).toHaveBeenCalled();
      expect(Sentry.replayIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          maskAllText: true,
          blockAllMedia: true,
        })
      );
    });
  });

  describe('beforeSend callback', () => {
    it('ResizeObserverエラーを除外すること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('DEV', false);

      initSentry();

      const initCall = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      expect(beforeSend).toBeDefined();

      // ResizeObserverエラー
      const resizeObserverEvent = {
        exception: {
          values: [{ value: 'ResizeObserver loop limit exceeded' }],
        },
      };

      const result = beforeSend(resizeObserverEvent, {});
      expect(result).toBeNull();
    });

    it('通常のエラーはそのまま返すこと', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('DEV', false);

      initSentry();

      const initCall = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      const normalEvent = {
        exception: {
          values: [{ value: 'Normal error' }],
        },
      };

      const result = beforeSend(normalEvent, {});
      expect(result).toEqual(normalEvent);
    });

    it('開発環境ではイベントをログ出力すること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('DEV', true);

      initSentry();

      const initCall = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      const event = { message: 'test' };
      const hint = { originalException: new Error('test') };

      beforeSend(event, hint);

      expect(console.debug).toHaveBeenCalledWith('[Sentry] Event captured:', event, hint);
    });
  });

  /**
   * user-authentication 要件37.3, 42.4: エラー監視へ送る URL のトークンを伏せる
   * （backend の url-query-redaction と同じ規則。画面側は断片の #token=… も伏せる）
   */
  describe('URL のトークンの伏せ字', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');
      vi.stubEnv('DEV', false);
    });

    it('画面遷移の breadcrumb の from / to のトークン（#token= / ?token= / &token=）を伏せること', () => {
      initSentry();
      const beforeBreadcrumb = requireHook(lastInitOptions(), 'beforeBreadcrumb');

      const result = beforeBreadcrumb({
        category: 'navigation',
        data: {
          from: '/reset-password#token=reset-secret',
          to: '/invitations/accept?lang=ja&token=invite-secret',
        },
      }) as { data: Record<string, string> };

      expect(result.data.from).toBe('/reset-password#[REDACTED]');
      expect(result.data.to).toBe('/invitations/accept?lang=ja&token=[REDACTED]');
      expect(JSON.stringify(result)).not.toMatch(/reset-secret|invite-secret/);
    });

    it('fetch / xhr の breadcrumb の url のトークンを伏せ、他の値は残すこと', () => {
      initSentry();
      const beforeBreadcrumb = requireHook(lastInitOptions(), 'beforeBreadcrumb');

      const fetchCrumb = beforeBreadcrumb({
        category: 'fetch',
        data: { method: 'GET', url: 'https://api.example.com/api/v1/x?token=fetch-secret&page=2' },
      }) as { data: Record<string, unknown> };
      const xhrCrumb = beforeBreadcrumb({
        category: 'xhr',
        data: { method: 'POST', url: '/api/v1/y?code=123456', status_code: 200 },
      }) as { data: Record<string, unknown> };

      expect(fetchCrumb.data.url).toBe('https://api.example.com/api/v1/x?token=[REDACTED]&page=2');
      expect(fetchCrumb.data.method).toBe('GET');
      expect(xhrCrumb.data.url).toBe('/api/v1/y?code=[REDACTED]');
      expect(xhrCrumb.data.status_code).toBe(200);
    });

    it('URL を持たない breadcrumb はそのまま返すこと', () => {
      initSentry();
      const beforeBreadcrumb = requireHook(lastInitOptions(), 'beforeBreadcrumb');
      const crumb = { category: 'ui.click', message: 'button' };

      expect(beforeBreadcrumb(crumb)).toEqual({ category: 'ui.click', message: 'button' });
    });

    it('事象の request の url・query_string・Referer と、事象が持つ breadcrumb のトークンを伏せること', () => {
      initSentry();
      const beforeSend = requireHook(lastInitOptions(), 'beforeSend');

      const result = beforeSend(
        {
          exception: { values: [{ value: 'Some error' }] },
          request: {
            url: 'https://app.example.com/reset-password#token=reset-secret',
            query_string: 'token=query-secret&page=1',
            headers: { Referer: 'https://app.example.com/register?token=invite-secret' },
          },
          breadcrumbs: [
            { category: 'navigation', data: { from: '/a#token=crumb-secret', to: '/b' } },
          ],
        },
        {}
      ) as {
        request: { url: string; query_string: string; headers: Record<string, string> };
        breadcrumbs: Array<{ data: Record<string, string> }>;
      };

      expect(result.request.url).toBe('https://app.example.com/reset-password#[REDACTED]');
      expect(result.request.query_string).toBe('token=[REDACTED]&page=1');
      expect(result.request.headers.Referer).toBe(
        'https://app.example.com/register?token=[REDACTED]'
      );
      expect(result.breadcrumbs[0]!.data.from).toBe('/a#[REDACTED]');
      expect(JSON.stringify(result)).not.toMatch(/secret/);
    });

    it('トレースの事象の request の url のトークンも伏せること', () => {
      initSentry();
      const beforeSendTransaction = requireHook(lastInitOptions(), 'beforeSendTransaction');

      const result = beforeSendTransaction({
        type: 'transaction',
        request: { url: 'https://app.example.com/register?token=invite-secret' },
      }) as { request: { url: string } };

      expect(result.request.url).toBe('https://app.example.com/register?token=[REDACTED]');
    });

    it('セッションリプレイの記録（ページの href・遷移の span・breadcrumb）のトークンを伏せること', () => {
      initSentry();
      const beforeAddRecordingEvent = requireHook(lastReplayOptions(), 'beforeAddRecordingEvent');

      const meta = beforeAddRecordingEvent({
        type: 4,
        timestamp: 1,
        data: { href: 'https://app.example.com/reset-password#token=reset-secret' },
      });
      const span = beforeAddRecordingEvent({
        type: 5,
        timestamp: 2,
        data: {
          tag: 'performanceSpan',
          payload: {
            op: 'navigation.push',
            description: 'https://app.example.com/register?token=invite-secret',
            data: { previous: '/reset-password#token=reset-secret' },
          },
        },
      });
      const crumb = beforeAddRecordingEvent({
        type: 5,
        timestamp: 3,
        data: {
          tag: 'breadcrumb',
          payload: {
            category: 'navigation',
            data: { from: '/a?token=from-secret', to: '/b#token=to-secret', url: '/c?token=u' },
          },
        },
      });

      expect(JSON.stringify([meta, span, crumb])).not.toMatch(/secret|token=u/);
      expect((meta as { data: { href: string } }).data.href).toBe(
        'https://app.example.com/reset-password#[REDACTED]'
      );
      expect(
        (span as { data: { payload: { description: string } } }).data.payload.description
      ).toBe('https://app.example.com/register?token=[REDACTED]');
    });

    it('セッションリプレイの事象の urls と request の url のトークンを伏せること', () => {
      const on = vi.fn();
      vi.mocked(Sentry.getClient).mockReturnValue({ on } as unknown as ReturnType<
        typeof Sentry.getClient
      >);
      initSentry();

      const registration = on.mock.calls.find(([name]) => name === 'preprocessEvent');
      expect(registration, 'preprocessEvent を購読していること').toBeDefined();
      const preprocess = registration![1] as (event: unknown) => void;

      const replayEvent = {
        type: 'replay_event',
        urls: [
          'https://app.example.com/reset-password#token=reset-secret',
          'https://app.example.com/register?token=invite-secret',
        ],
        request: { url: 'https://app.example.com/reset-password#token=reset-secret' },
      };
      preprocess(replayEvent);

      expect(replayEvent.urls).toEqual([
        'https://app.example.com/reset-password#[REDACTED]',
        'https://app.example.com/register?token=[REDACTED]',
      ]);
      expect(replayEvent.request.url).toBe('https://app.example.com/reset-password#[REDACTED]');
    });
  });

  describe('captureException', () => {
    it('DSNが設定されている場合、エラーをSentryに送信すること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      const error = new Error('Test error');
      const context = { userId: '123', action: 'click' };

      captureException(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: context,
      });
    });

    it('コンテキストなしでエラーを送信できること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      const error = new Error('Test error');

      captureException(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: undefined,
      });
    });

    it('DSNが設定されていない場合、何もしないこと', () => {
      vi.stubEnv('VITE_SENTRY_DSN', '');

      const error = new Error('Test error');

      captureException(error);

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('captureMessage', () => {
    it('DSNが設定されている場合、メッセージをSentryに送信すること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      const message = 'Test message';
      const context = { feature: 'login' };

      captureMessage(message, 'warning', context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, {
        level: 'warning',
        extra: context,
      });
    });

    it('デフォルトのレベルはinfoであること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      const message = 'Test message';

      captureMessage(message);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, {
        level: 'info',
        extra: undefined,
      });
    });

    it('さまざまなログレベルをサポートすること', () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/123');

      const levels: Array<'info' | 'warning' | 'error' | 'fatal'> = [
        'info',
        'warning',
        'error',
        'fatal',
      ];

      levels.forEach((level) => {
        vi.clearAllMocks();
        captureMessage('Test', level);

        expect(Sentry.captureMessage).toHaveBeenCalledWith('Test', {
          level,
          extra: undefined,
        });
      });
    });

    it('DSNが設定されていない場合、何もしないこと', () => {
      vi.stubEnv('VITE_SENTRY_DSN', '');

      captureMessage('Test message');

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });
});
