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
}));

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
      expect(Sentry.replayIntegration).toHaveBeenCalledWith({
        maskAllText: true,
        blockAllMedia: true,
      });
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
