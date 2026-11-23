/**
 * ログへ書くエラーと要求の入れ物の伏せ字（要件48.8）
 *
 * 共通のロガーと pino-http の両方が使う。pino-http はシリアライズ済みのエラーを渡すため、
 * 元のエラーは `raw` から読む。どの入力でも例外を投げず、読めない項目は伏せ字にしてログを残す。
 */

import pino from 'pino';
import { hasRequestBodyParseError, redactSensitiveText } from './url-query-redaction.js';

const CENSOR = '[REDACTED]';
const TRUNCATED = '[Truncated]';
const CIRCULAR = '[Circular]';

/** たどる深さと、一つの入れ物から読む項目の数の上限 */
const MAX_DEPTH = 6;
const MAX_ENTRIES = 100;

type SerializedError = ReturnType<typeof pino.stdSerializers.err>;

/** どの位置でも値を伏せるキー（`_`・`-`・大文字小文字を除いた綴り） */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'codeverifier',
  'refreshtoken',
  'accesstoken',
  'clientsecret',
  'idtoken',
  'token',
  'secret',
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'invitationtoken',
  'resettoken',
  'twofactorsecret',
  'backupcodes',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'xcsrftoken',
]);

/** 要求の入れ物の中でだけ伏せるキー（他の位置ではエラーコードや状態を表す） */
const REQUEST_ONLY_KEYS: ReadonlySet<string> = new Set(['code', 'state']);
/** ヘッダーの中でだけ伏せるキー（認可コードと state を含む URL） */
const HEADER_ONLY_KEYS: ReadonlySet<string> = new Set(['referer', 'location']);
/** この下は要求の入れ物として扱うキー */
const REQUEST_CONTAINER_KEYS: ReadonlySet<string> = new Set(['body', 'query', 'params', 'form']);
/** エラーの中で全体を捨てるキー（要求や応答の本文そのもの） */
const ERROR_PAYLOAD_KEYS: ReadonlySet<string> = new Set(['body', 'request']);
/** `data` を本文として捨てる親のキー */
const HTTP_ENVELOPE_KEYS: ReadonlySet<string> = new Set(['config', 'response']);

interface SanitizeContext {
  depth: number;
  seen: Set<object>;
  /** 要求の入れ物の中か */
  request: boolean;
  /** ヘッダーの中か */
  headers: boolean;
  /** エラーの項目か */
  error: boolean;
  /** 親のキー */
  parent: string;
}

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function isCensoredKey(key: string, normalized: string, context: SanitizeContext): boolean {
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (context.request && REQUEST_ONLY_KEYS.has(normalized)) return true;
  if (context.headers && HEADER_ONLY_KEYS.has(normalized)) return true;
  if (!context.error) return false;
  if (ERROR_PAYLOAD_KEYS.has(key)) return true;
  return key === 'data' && HTTP_ENVELOPE_KEYS.has(context.parent);
}

function sanitizeEntries(
  source: object,
  keys: readonly string[],
  context: SanitizeContext
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys.slice(0, MAX_ENTRIES)) {
    const normalized = normalizeKey(key);
    if (isCensoredKey(key, normalized, context)) {
      output[key] = CENSOR;
      continue;
    }
    try {
      output[key] = sanitizeValue((source as Record<string, unknown>)[key], {
        ...context,
        depth: context.depth + 1,
        request: context.request || REQUEST_CONTAINER_KEYS.has(key),
        headers: context.headers || normalized === 'headers',
        parent: key,
      });
    } catch {
      output[key] = CENSOR;
    }
  }
  if (keys.length > MAX_ENTRIES) output[TRUNCATED] = keys.length - MAX_ENTRIES;
  return output;
}

function sanitizeValue(value: unknown, context: SanitizeContext): unknown {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return CENSOR;
  if (context.depth >= MAX_DEPTH) return TRUNCATED;
  if (context.seen.has(value)) return CIRCULAR;
  context.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ENTRIES)
        .map((item) => sanitizeValue(item, { ...context, depth: context.depth + 1 }));
      if (value.length > MAX_ENTRIES) items.push(TRUNCATED);
      return items;
    }
    if (value instanceof Error) {
      const keys = ['message', 'stack', ...Object.keys(value)];
      return {
        type: value.name,
        ...sanitizeEntries(value, [...new Set(keys)], { ...context, error: true }),
      };
    }
    return sanitizeEntries(value, Object.keys(value), context);
  } finally {
    context.seen.delete(value);
  }
}

function rootContext(overrides: Partial<SanitizeContext>): SanitizeContext {
  return {
    depth: 0,
    seen: new Set(),
    request: false,
    headers: false,
    error: false,
    parent: '',
    ...overrides,
  };
}

function safely(action: () => unknown): unknown {
  try {
    return action();
  } catch {
    return CENSOR;
  }
}

/** 要求の入れ物（body・query・params）を伏せる。`code`・`state` も伏せる */
export function sanitizeLogContainer(value: unknown): unknown {
  return safely(() => sanitizeValue(value, rootContext({ request: true })));
}

/** ヘッダーを伏せる */
export function sanitizeLogHeaders(value: unknown): unknown {
  return safely(() => sanitizeValue(value, rootContext({ headers: true })));
}

/** `logger.error(err)` の msg に使う文 */
export function redactLogMessage(err: Error): string {
  try {
    return hasRequestBodyParseError(err) ? CENSOR : redactSensitiveText(err.message);
  } catch {
    return CENSOR;
  }
}

/** 解析エラーのスタックから文を捨て、呼び出しの位置だけを残す */
function frameOnlyStack(stack: unknown): string {
  const text = typeof stack === 'string' ? stack.slice(0, 64 * 1024) : '';
  const frames = text.split('\n').filter((line) => /^\s+at /.test(line));
  return [`SyntaxError: ${CENSOR}`, ...frames].join('\n');
}

/** エラーの文字列・入れ子の項目から機密を除く */
export function serializeLogError(err: unknown): SerializedError {
  try {
    if (typeof err === 'string') {
      return redactSensitiveText(err) as unknown as SerializedError;
    }
    if (typeof err !== 'object' || err === null) return err as SerializedError;

    const raw = (err as { raw?: unknown }).raw;
    // Error の実体が独自の raw を持つ場合と区別する
    const alreadySerialized = !(err instanceof Error) && raw !== undefined;
    const original = alreadySerialized ? raw : err;
    const serialized = (alreadySerialized ? err : pino.stdSerializers.err(err as Error)) as Record<
      string,
      unknown
    >;

    const parseFailed = hasRequestBodyParseError(original);
    const context = rootContext({ error: true, parent: 'err' });
    const keys = Object.keys(serialized);
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      if (parseFailed && (key === 'message' || key === 'stack')) continue;
      if (parseFailed && (key === 'cause' || key === 'aggregateErrors')) {
        output[key] = CENSOR;
        continue;
      }
      Object.assign(
        output,
        safely(() => sanitizeEntries(serialized, [key], context))
      );
    }
    if (parseFailed) {
      output.message = CENSOR;
      output.stack = frameOnlyStack(serialized.stack);
    }
    return output as unknown as SerializedError;
  } catch {
    return { type: 'Error', message: CENSOR, stack: '' } as unknown as SerializedError;
  }
}
