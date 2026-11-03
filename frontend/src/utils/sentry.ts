import * as Sentry from '@sentry/react';
import { redactUrl, redactUrlQuery } from './url-query-redaction';

/**
 * エラー監視へ送る URL のトークンを伏せる（user-authentication 要件37.3, 42.4）
 *
 * 招待・パスワードリセットのリンクのトークン（`#token=…`・`?token=…`・`&token=…`）が、画面遷移の
 * breadcrumb・fetch / xhr の URL・事象の request・セッションリプレイの記録に載って送られないようにする。
 * 規則は backend の url-query-redaction と同じ（`./url-query-redaction` の写し）。
 */

type UnknownRecord = Record<string, unknown>;

/** 伏せ字の表記（`./url-query-redaction` と同じ） */
const REDACTED_TEXT = '[REDACTED]';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/** breadcrumb・リプレイの data のうち URL を持つ欄 */
const URL_DATA_FIELDS = ['url', 'from', 'to', 'previous'] as const;

/** 記録の data の URL の欄のトークンを伏せる（その場で書き換える） */
function scrubUrlFields(data: unknown): void {
  if (!isRecord(data)) return;
  for (const field of URL_DATA_FIELDS) {
    const value = data[field];
    if (typeof value === 'string') {
      data[field] = redactUrl(value);
    }
  }
}

/** クエリの文字列（先頭の `?` なし）を同じ規則で伏せる */
function redactQueryString(query: string): string {
  return (redactUrlQuery(`?${query}`) ?? '').slice(1);
}

/** 事象の request の URL・クエリ・Referer のトークンを伏せる（その場で書き換える） */
function scrubRequest(request: unknown): void {
  if (!isRecord(request)) return;
  if (typeof request.url === 'string') {
    request.url = redactUrl(request.url);
  }
  if (typeof request.query_string === 'string') {
    request.query_string = redactQueryString(request.query_string);
  } else if (request.query_string !== undefined) {
    // 文字列でない形（キーと値の組）は規則を当てずに送らない（backend と同じ）
    delete request.query_string;
  }
  const headers = request.headers;
  if (isRecord(headers)) {
    for (const name of Object.keys(headers)) {
      const value = headers[name];
      if (name.toLowerCase() === 'referer' && typeof value === 'string') {
        headers[name] = redactUrl(value);
      }
    }
  }
}

/** span の属性のうちクエリの文字列を持つ欄（Sentry の browser tracing / fetch が付ける） */
const SPAN_QUERY_ATTRIBUTES: ReadonlySet<string> = new Set(['url.query', 'http.query']);

/** span の属性のうち断片を持つ欄（Sentry の browser tracing / fetch が付ける） */
const SPAN_FRAGMENT_ATTRIBUTES: ReadonlySet<string> = new Set(['url.fragment', 'http.fragment']);

/**
 * span の属性のうち URL を持つ欄（`url.full`・`http.url`・`url` など、キーの末尾が url / href のもの）
 *
 * `url.path`（パスだけ）・`server.address`（ホスト名だけ）はトークンを含まないため対象にしない。
 */
function isUrlAttributeKey(key: string): boolean {
  return key === 'url.full' || /(^|[._])(url|href)$/i.test(key);
}

/** span の属性（トレースの data・子 span の data）の URL・クエリ・断片のトークンを伏せる（その場で書き換える） */
function scrubSpanAttributes(data: unknown): void {
  if (!isRecord(data)) return;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (typeof value !== 'string' || value === '') continue;
    if (SPAN_QUERY_ATTRIBUTES.has(key)) {
      data[key] = value.startsWith('?') ? (redactUrlQuery(value) ?? '') : redactQueryString(value);
    } else if (SPAN_FRAGMENT_ATTRIBUTES.has(key)) {
      // 断片は招待・リセットのトークンを運ぶため、中身を残さない（要件37.3）
      data[key] = value.startsWith('#') ? `#${REDACTED_TEXT}` : REDACTED_TEXT;
    } else if (isUrlAttributeKey(key)) {
      data[key] = redactUrl(value) ?? value;
    }
  }
}

/** span（トレースの文脈・子 span）の data と description のトークンを伏せる（その場で書き換える） */
function scrubSpan(span: unknown): void {
  if (!isRecord(span)) return;
  scrubSpanAttributes(span.data);
  // fetch / xhr の span は「GET <URL>」、resource の span は URL を description に持つ
  if (typeof span.description === 'string') {
    span.description = redactUrl(span.description);
  }
}

/**
 * breadcrumb（画面遷移の from / to・fetch / xhr の url）のトークンを伏せる
 */
export function scrubSentryBreadcrumb<T extends Sentry.Breadcrumb>(breadcrumb: T): T {
  scrubUrlFields(breadcrumb.data);
  return breadcrumb;
}

/**
 * 事象（エラー・トレース・リプレイ）の request・urls・breadcrumb・トレースの文脈・子 span・事象名のトークンを伏せる
 *
 * browserTracingIntegration は pageload の span に `url.full`（断片を含むページの href）を付け、
 * Sentry の初期化は画面の描画（useUrlToken の replaceState）より前に走るため、招待・リセットの
 * `#token=…` がトレースの文脈（`contexts.trace.data`）に載る。fetch / xhr / resource の子 span も
 * data と description に URL を持つため、送る直前のこの関数で全て伏せる（要件42.4）。
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  const record = event as UnknownRecord;
  scrubRequest(record.request);
  if (typeof record.transaction === 'string') {
    // 親の無い http.client の span は「GET <URL>」が事象名になる
    record.transaction = redactUrl(record.transaction);
  }
  if (isRecord(record.contexts)) {
    scrubSpan(record.contexts.trace);
  }
  if (Array.isArray(record.spans)) {
    for (const span of record.spans) scrubSpan(span);
  }
  if (Array.isArray(record.urls)) {
    record.urls = record.urls.map((url: unknown) =>
      typeof url === 'string' ? redactUrl(url) : url
    );
  }
  if (Array.isArray(record.breadcrumbs)) {
    for (const breadcrumb of record.breadcrumbs) {
      if (isRecord(breadcrumb)) scrubUrlFields(breadcrumb.data);
    }
  }
  return event;
}

/**
 * セッションリプレイの記録（ページの href・遷移や要求の span・breadcrumb）のトークンを伏せる
 */
export function scrubReplayRecordingEvent<T>(recordingEvent: T): T {
  if (!isRecord(recordingEvent)) return recordingEvent;
  const data = recordingEvent.data;
  if (!isRecord(data)) return recordingEvent;
  // rrweb の Meta（ページの href）
  if (typeof data.href === 'string') {
    data.href = redactUrl(data.href);
  }
  // Sentry の独自の記録（performanceSpan / breadcrumb）
  const payload = data.payload;
  if (isRecord(payload)) {
    if (typeof payload.description === 'string') {
      payload.description = redactUrl(payload.description);
    }
    scrubUrlFields(payload.data);
  }
  return recordingEvent;
}

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
        // 記録に載る URL のトークンを伏せる（要件37.3, 42.4）
        beforeAddRecordingEvent: scrubReplayRecordingEvent,
      }),
    ],

    // パフォーマンス監視
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 本番10%, 開発100%

    // セッションリプレイ
    replaysSessionSampleRate: 0.1, // 10%のセッションを記録
    replaysOnErrorSampleRate: 1.0, // エラー時は100%記録

    // 画面遷移・fetch / xhr の breadcrumb の URL のトークンを伏せる（要件37.3, 42.4）
    beforeBreadcrumb(breadcrumb) {
      return scrubSentryBreadcrumb(breadcrumb);
    },

    // トレースの事象も request の URL を持つため、同じ規則で伏せる（要件42.4）
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
    },

    // エラーフィルタリング
    beforeSend(rawEvent, hint) {
      // URL のトークンを伏せてから記録・送信する（要件37.3, 42.4）
      const event = scrubSentryEvent(rawEvent);

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

  // セッションリプレイの事象（urls・request）は beforeSend を通らないため、送る前の加工で伏せる（要件42.4）
  Sentry.getClient()?.on('preprocessEvent', (event) => {
    if (event.type === 'replay_event') {
      scrubSentryEvent(event);
    }
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
