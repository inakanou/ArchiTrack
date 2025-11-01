import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import logger from '../utils/logger.js';

export const httpLogger = pinoHttp({
  logger,

  // Railway環境でのリクエストID追跡
  genReqId: (req: IncomingMessage) => {
    return (
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-railway-request-id'] as string) ||
      randomUUID()
    );
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
    return `${req.method} ${req.url}`;
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
    req: (req: IncomingMessage & { id?: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // Railway特有のヘッダーを記録
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'x-forwarded-for': req.headers?.['x-forwarded-for'],
        'x-railway-request-id': req.headers?.['x-railway-request-id'],
      },
      remoteAddress: (req as unknown as { remoteAddress?: string }).remoteAddress,
      remotePort: (req as unknown as { remotePort?: number }).remotePort,
    }),
    res: (res: ServerResponse & { statusCode: number }) => ({
      statusCode: res.statusCode,
    }),
  },
});
