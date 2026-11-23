import pino from 'pino';
import {
  redactLogMessage,
  sanitizeLogContainer,
  sanitizeLogHeaders,
  serializeLogError,
} from './log-error-serializer.js';
import { redactSensitiveText, redactUrlQuery } from './url-query-redaction.js';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;
const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;

const CENSOR = '[REDACTED]';

/** 名前だけで機密と分かる外部アプリの認可の値（要件48.8） */
const OAUTH_CREDENTIAL_FIELDS = [
  'code_verifier',
  'codeVerifier',
  'refresh_token',
  'access_token',
  'client_secret',
  'clientSecret',
];

/**
 * 要求の入れ物の中でだけ伏せるキー（要件48.8）
 *
 * `code`・`state` は Prisma のエラーコードや処理の状態にも使う語のため、全体や `*.code` では伏せない。
 */
const OAUTH_REQUEST_FIELDS = [...OAUTH_CREDENTIAL_FIELDS, 'code', 'state'];
const REQUEST_CONTAINERS = ['body', 'query', 'params', 'req.body', 'req.query', 'req.params'];

/** ログの伏せ字の設定 */
export const loggerRedaction = {
  paths: [
    // パスワード関連
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    '*.password',
    '*.passwordHash',
    '*.currentPassword',
    '*.newPassword',
    // トークン関連
    'token',
    'accessToken',
    'refreshToken',
    'invitationToken',
    'resetToken',
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.invitationToken',
    '*.resetToken',
    // 秘密鍵・2FA関連
    'secret',
    'twoFactorSecret',
    'backupCodes',
    '*.secret',
    '*.twoFactorSecret',
    '*.backupCodes',
    // 外部アプリの認可の値（要件48.8）
    ...OAUTH_CREDENTIAL_FIELDS,
    ...OAUTH_CREDENTIAL_FIELDS.map((field) => `*.${field}`),
    ...REQUEST_CONTAINERS.flatMap((container) =>
      OAUTH_REQUEST_FIELDS.map((field) => `${container}.${field}`)
    ),
    // body-parser の例外は要求本文の全体を body に持つ
    'err.body',
    'error.body',
    // HTTPヘッダー（認証情報。Location は認可コードと state を含む）
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-csrf-token"]',
    'res.headers["set-cookie"]',
    'res.headers.location',
  ],
  censor: CENSOR,
};

/** 要求の URL のクエリを伏せる（HTTP ログ以外の経路で要求を記録したとき。要件48.8） */
function serializeRequest(
  req: Parameters<typeof pino.stdSerializers.req>[0]
): ReturnType<typeof pino.stdSerializers.req> {
  const serialized = pino.stdSerializers.req(req);
  serialized.url = redactUrlQuery(serialized.url) ?? serialized.url;
  const fields = serialized as unknown as Record<string, unknown>;
  for (const key of ['query', 'params', 'body']) {
    if (fields[key] !== undefined) fields[key] = sanitizeLogContainer(fields[key]);
  }
  if (fields.headers !== undefined) fields.headers = sanitizeLogHeaders(fields.headers);
  return serialized;
}

/** ログのシリアライザー */
export const loggerSerializers = {
  err: serializeLogError,
  req: serializeRequest,
  res: pino.stdSerializers.res,
  // 要求の入れ物は深さと綴りを問わず伏せる（pino の redact の経路は固定の深さのため。要件48.8）
  body: sanitizeLogContainer,
  query: sanitizeLogContainer,
  params: sanitizeLogContainer,
  headers: sanitizeLogHeaders,
};

/** メッセージの文の機密を伏せる（`logger.error(err)` は err.message がそのまま msg になる。要件48.8） */
export const loggerHooks = {
  logMethod(this: pino.Logger, args: unknown[], method: (...values: unknown[]) => void): void {
    const [first, second] = args;
    if (first instanceof Error && typeof second !== 'string') {
      method.apply(this, [first, redactLogMessage(first)]);
      return;
    }
    const messageAt = typeof first === 'string' ? 0 : typeof second === 'string' ? 1 : -1;
    if (messageAt === -1) {
      method.apply(this, args);
      return;
    }
    const safe = [...args];
    safe[messageAt] = redactSensitiveText(args[messageAt] as string);
    method.apply(this, safe);
  },
};

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Railway環境・本番環境・テスト環境では常にJSON出力
  // 開発環境のみpino-prettyで見やすく
  // 注意: pino-prettyはpino-httpとの互換性問題があるため、
  // pino-httpを使用する環境（テスト含む）ではtransportを無効にする必要がある
  transport:
    !isRailway && !isProduction && !isTest
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,

  // Railway用のメタデータ
  base: {
    env: process.env.NODE_ENV || 'development',
    railway: isRailway,
    service: process.env.RAILWAY_SERVICE_NAME || 'backend',
  },

  // タイムスタンプ形式（ISO 8601）
  timestamp: pino.stdTimeFunctions.isoTime,

  // 機密情報のマスキング
  // @requirement user-authentication/REQ-26.11: ログマスキング処理
  // パスワード、トークン、秘密鍵などをログに記録する際に自動的にマスキング
  redact: loggerRedaction,

  // エラー時のスタックトレース
  serializers: loggerSerializers,

  hooks: loggerHooks as pino.LoggerOptions['hooks'],

  // Railway環境ではフォーマット済みエラーを出力
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
});

export default logger;
