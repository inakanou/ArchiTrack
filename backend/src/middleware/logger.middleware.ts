import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Request } from 'express';
import logger from '../utils/logger.js';
import { getClientIp } from './client-ip.js';

/** 応答で要求識別子を返すヘッダー（CORS の exposedHeaders にも載せる） */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** 受信した識別子を記録するときの上限の長さ */
export const RECEIVED_REQUEST_ID_MAX_LENGTH = 128;

/** 記録の URL で値を伏せるクエリのキー（大文字小文字を区別しない。要件37.3、42.3） */
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(
  [
    'token',
    'password',
    'code',
    'backupCode',
    'refreshToken',
    'secret',
    'key',
    'signature',
    'X-Amz-Signature',
    'X-Amz-Credential',
  ].map((key) => key.toLowerCase())
);

const REDACTED = '[REDACTED]';

/** クエリのキーを比較用に正規化する（%エンコード・`+`・`key[]` の添字を外す） */
function normalizeQueryKey(rawKey: string): string {
  let decoded = rawKey.replace(/\+/g, ' ');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // 不正な %エンコードは元の綴りのまま比べる
  }
  const bracket = decoded.indexOf('[');
  const base = bracket === -1 ? decoded : decoded.slice(0, bracket);
  return base.trim().toLowerCase();
}

/**
 * 記録する URL のクエリのうち、機密のキーの値を伏せ字にする（要件37.3、42.3）
 *
 * パスと機密でないキーの値はそのまま残す。
 */
export function redactUrlQuery(url: string | undefined): string | undefined {
  if (typeof url !== 'string') return url;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const hashStart = url.indexOf('#', queryStart);
  const queryEnd = hashStart === -1 ? url.length : hashStart;
  const query = url.slice(queryStart + 1, queryEnd);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      if (!SENSITIVE_QUERY_KEYS.has(normalizeQueryKey(rawKey))) return pair;
      return `${rawKey}=${REDACTED}`;
    })
    .join('&');
  // 断片はサーバーへ届かない前提だが、届いた場合も記録しない
  const fragment = hashStart === -1 ? '' : `#${REDACTED}`;
  return `${url.slice(0, queryStart)}?${redacted}${fragment}`;
}

/** 受信したヘッダーの識別子を、記録用に文字列へ揃えて切り詰める */
function receivedId(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = Array.isArray(value) ? value.join(', ') : value;
  if (text === '') return undefined;
  return text.slice(0, RECEIVED_REQUEST_ID_MAX_LENGTH);
}

/** 認証済みの要求の利用者 ID（authenticate が設定した req.user） */
function authenticatedUserId(req: IncomingMessage): string | undefined {
  const user = (req as IncomingMessage & { user?: { userId?: unknown } }).user;
  return typeof user?.userId === 'string' ? user.userId : undefined;
}

export const httpLogger = pinoHttp({
  logger,

  // 要求識別子は常にサーバーで生成し、応答で返す。受信した識別子は要求識別子にしない（要件42.5）
  genReqId: (_req: IncomingMessage, res: ServerResponse) => {
    const id = randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },

  // 認証済みの要求に利用者 ID を付ける（要件42.6）。authenticate は httpLogger の後に動くため、
  // 応答の完了時（pino-http が customProps を再び呼ぶ時点）の req.user を読む
  customProps: (req: IncomingMessage) => {
    const userId = authenticatedUserId(req);
    return userId === undefined ? {} : { userId };
  },

  // カスタムログレベル
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'info';
  },

  // ヘルスチェックは簡略化（debugレベルに）
  customSuccessMessage: (req: IncomingMessage, _res: ServerResponse) => {
    if (req.url === '/health') {
      return 'health check';
    }
    return `${req.method} ${redactUrlQuery(req.url)}`;
  },

  // ヘルスチェックはdebugレベルでログ
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      // ヘルスチェックとfaviconはdebugレベルのみ
      if (req.url === '/health' || req.url === '/favicon.ico') {
        return logger.level !== 'debug';
      }
      return false;
    },
  },

  // レスポンスタイムも記録
  customAttributeKeys: {
    req: 'req',
    res: 'res',
    err: 'err',
    responseTime: 'responseTime',
  },

  // リクエスト/レスポンスの詳細をカスタマイズ
  serializers: {
    req: (req: IncomingMessage & { id?: string; raw?: Pick<Request, 'ip'> }) => ({
      id: req.id,
      // 利用者・中継が送った識別子は要求識別子と別の項目に記録する（要件42.5）
      clientRequestId: receivedId(req.headers?.['x-request-id']),
      edgeRequestId: receivedId(req.headers?.['x-railway-request-id']),
      method: req.method,
      // クエリの機密の値は伏せ字にする（要件37.3、42.3）
      url: redactUrlQuery(req.url),
      // 送信元は X-Forwarded-For を直接記録せず、信頼する中継の段数で識別した値を記録する（要件35.2）。
      // pino-http はシリアライズ前の要求（Express の req）を raw として渡す
      ip: getClientIp({ ip: req.raw?.ip }),
      headers: {
        'user-agent': req.headers?.['user-agent'],
      },
      remoteAddress: (req as unknown as { remoteAddress?: string }).remoteAddress,
      remotePort: (req as unknown as { remotePort?: number }).remotePort,
    }),
    res: (res: ServerResponse & { statusCode: number }) => ({
      statusCode: res.statusCode,
    }),
  },
});
