import * as Sentry from '@sentry/react';

/**
 * Sentryの初期化
 * VITE_SENTRY_DSNが設定されている場合のみ有効化
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.info('[Sentry] DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'development',

    // パフォーマンストレーシング
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // セッションリプレイ（オプション）
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // パフォーマンス監視
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 本番10%, 開発100%

    // セッションリプレイ
    replaysSessionSampleRate: 0.1, // 10%のセッションを記録
    replaysOnErrorSampleRate: 1.0, // エラー時は100%記録

    // エラーフィルタリング
    beforeSend(event, hint) {
      // 開発環境では詳細ログを出力
      if (import.meta.env.DEV) {
        console.debug('[Sentry] Event captured:', event, hint);
      }

      // 特定のエラーを除外
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
        return null; // ResizeObserverエラーは送信しない（よくある無害なエラー）
      }

      return event;
    },
  });

  console.info('[Sentry] Initialized successfully', {
    environment: import.meta.env.MODE,
  });
}

/**
 * エラーをSentryに送信
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * メッセージをSentryに送信
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): void {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

export default Sentry;
