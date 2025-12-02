import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Railway環境では常にJSON出力
  // 開発環境ではpino-prettyで見やすく
  transport:
    !isRailway && !isProduction
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

  // 機密情報のマスキング（要件26.11: ログマスキング処理）
  // パスワード、トークン、秘密鍵などをログに記録する際に自動的にマスキング
  redact: {
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
      // HTTPヘッダー（認証情報）
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },

  // エラー時のスタックトレース
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Railway環境ではフォーマット済みエラーを出力
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
});

export default logger;
