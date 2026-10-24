import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import logger from './logger.js';
import { redactUrlQuery } from './url-query-redaction.js';

/** 伏せた値の表記（Sentry の既定の伏せ字と同じ） */
const FILTERED = '[Filtered]';

/** 値を伏せる要求ヘッダー（小文字で比べる。要件42.4） */
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set(['authorization', 'cookie', 'x-csrf-token']);

/** クエリの文字列（先頭の `?` なし）を HttpLogger と同じ規則で伏せる */
function redactQueryString(query: string): string {
  return (redactUrlQuery(`?${query}`) ?? '').slice(1);
}

/**
 * エラー監視へ送る事象から機密を除く（要件42.4）
 *
 * 要求本文・Cookie を消し、認証ヘッダー・Cookie ヘッダー・CSRF トークンを伏せ、
 * URL とクエリの機密の値を HttpLogger と同じ規則で伏せる。
 */
export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  const request = event.request;
  if (!request) return event;

  delete request.data;
  delete request.cookies;

  if (request.headers) {
    for (const name of Object.keys(request.headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
        request.headers[name] = FILTERED;
      }
    }
  }

  if (typeof request.url === 'string') {
    request.url = redactUrlQuery(request.url);
  }

  if (typeof request.query_string === 'string') {
    request.query_string = redactQueryString(request.query_string);
  } else if (request.query_string !== undefined) {
    // 文字列でない形（キーと値の組）は規則を当てずに送らない
    delete request.query_string;
  }

  return event;
}

/**
 * 出ていく HTTP の記録（breadcrumb）の URL とクエリの機密の値を伏せる（要件42.4）
 */
export function scrubSentryBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  if (typeof data.url === 'string') {
    data.url = redactUrlQuery(data.url);
  }
  if (typeof data['http.query'] === 'string') {
    const query = data['http.query'].replace(/^\?/, '');
    data['http.query'] = `?${redactQueryString(query)}`;
  }
  if (typeof data['http.fragment'] === 'string' && data['http.fragment'] !== '') {
    data['http.fragment'] = '#[REDACTED]';
  }
  return breadcrumb;
}

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

    // 利用者の IP・Cookie などの個人情報を既定で付けない（要件42.4）
    sendDefaultPii: false,

    beforeBreadcrumb(breadcrumb) {
      return scrubSentryBreadcrumb(breadcrumb);
    },

    // エラーフィルタリング
    beforeSend(rawEvent, hint) {
      // 機密を除いてから記録・送信する（要件42.4）
      const event = scrubSentryEvent(rawEvent);

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

    // トレースの事象も要求の情報を持つため、同じ規則で除く（要件42.4）
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
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
