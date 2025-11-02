import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import logger from './logger.js';

/**
 * Sentryの初期化
 * SENTRY_DSNが設定されている場合のみ有効化
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',

    // パフォーマンストレーシング
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 本番10%, 開発100%

    // プロファイリング（オプション）
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [nodeProfilingIntegration()],

    // エラーフィルタリング
    beforeSend(event, hint) {
      // 開発環境では詳細ログを出力
      if (process.env.NODE_ENV === 'development') {
        logger.debug({ event, hint }, 'Sentry event captured');
      }

      // 特定のエラーを除外（例: 404エラーなど）
      if (event.exception?.values?.[0]?.value?.includes('Not found')) {
        return null; // 送信しない
      }

      return event;
    },
  });

  logger.info({ environment: process.env.NODE_ENV }, 'Sentry initialized successfully');
}

/**
 * エラーをSentryに送信
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) {
    return; // Sentryが設定されていない場合は何もしない
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * メッセージをSentryに送信（警告レベル）
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): void {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

export default Sentry;
