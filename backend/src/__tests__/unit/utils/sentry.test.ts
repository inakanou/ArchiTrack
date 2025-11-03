import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry, captureException, captureMessage } from '../../../utils/sentry.js';

// Sentryのモック
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => 'mocked-profiling-integration'),
}));

// loggerのモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('sentry utils', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数を保存
    originalEnv = { ...process.env };
    // モックのリセット
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('initSentry', () => {
    it('SENTRY_DSNが設定されていない場合、Sentryを初期化しないこと', () => {
      delete process.env.SENTRY_DSN;

      initSentry();

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('SENTRY_DSNが設定されている場合、Sentryを初期化すること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'production',
          tracesSampleRate: 0.1,
          profilesSampleRate: 0.1,
        })
      );
    });

    it('開発環境ではサンプルレートが100%であること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'development';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 1.0,
          profilesSampleRate: 1.0,
        })
      );
    });

    it('beforeSendでNot foundエラーを除外すること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      initSentry();

      const initCall = vi.mocked(Sentry.init).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      expect(beforeSend).toBeDefined();

      // Not foundエラーは除外される
      const notFoundEvent = {
        exception: {
          values: [
            {
              value: 'Not found error',
            },
          ],
        },
      };

      const result = beforeSend?.(notFoundEvent as Sentry.ErrorEvent, {});
      expect(result).toBeNull();
    });

    it('beforeSendで通常のエラーは送信すること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      initSentry();

      const initCall = vi.mocked(Sentry.init).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      const normalEvent = {
        exception: {
          values: [
            {
              value: 'Some other error',
            },
          ],
        },
      };

      const result = beforeSend?.(normalEvent as Sentry.ErrorEvent, {});
      expect(result).toEqual(normalEvent);
    });

    it('beforeSendでexceptionがない場合でもイベントを送信すること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      initSentry();

      const initCall = vi.mocked(Sentry.init).mock.calls[0]?.[0];
      const beforeSend = initCall?.beforeSend;

      const event = {
        message: 'Test message',
      };

      const result = beforeSend?.(event as Sentry.ErrorEvent, {});
      expect(result).toEqual(event);
    });
  });

  describe('captureException', () => {
    it('SENTRY_DSNが設定されていない場合、何もしないこと', () => {
      delete process.env.SENTRY_DSN;

      const error = new Error('Test error');
      captureException(error);

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('SENTRY_DSNが設定されている場合、エラーをキャプチャすること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const error = new Error('Test error');
      captureException(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: undefined,
      });
    });

    it('コンテキストと共にエラーをキャプチャすること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };
      captureException(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: context,
      });
    });
  });

  describe('captureMessage', () => {
    it('SENTRY_DSNが設定されていない場合、何もしないこと', () => {
      delete process.env.SENTRY_DSN;

      captureMessage('Test message');

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('SENTRY_DSNが設定されている場合、メッセージをキャプチャすること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      captureMessage('Test message');

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
        level: 'info',
        extra: undefined,
      });
    });

    it('カスタムレベルでメッセージをキャプチャすること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      captureMessage('Test warning', 'warning');

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test warning', {
        level: 'warning',
        extra: undefined,
      });
    });

    it('コンテキストと共にメッセージをキャプチャすること', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const context = { userId: '123', action: 'test' };
      captureMessage('Test message', 'error', context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
        level: 'error',
        extra: context,
      });
    });
  });
});
