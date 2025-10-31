import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

export const httpLogger = pinoHttp({
  logger,

  // Railway環境でのリクエストID追跡
  genReqId: (req) => {
    return req.headers['x-request-id'] ||
           req.headers['x-railway-request-id'] ||
           randomUUID();
  },

  // カスタムログレベル
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'info';
  },

  // ヘルスチェックは簡略化（debugレベルに）
  customSuccessMessage: (req, res) => {
    if (req.url === '/health') {
      return 'health check';
    }
    return `${req.method} ${req.url}`;
  },

  // ヘルスチェックはdebugレベルでログ
  autoLogging: {
    ignore: (req) => {
      // ヘルスチェックとfaviconはdebugレベルのみ
      if (req.url === '/health' || req.url === '/favicon.ico') {
        return logger.level !== 'debug';
      }
      return false;
    }
  },

  // レスポンスタイムも記録
  customAttributeKeys: {
    req: 'req',
    res: 'res',
    err: 'err',
    responseTime: 'responseTime'
  },

  // リクエスト/レスポンスの詳細をカスタマイズ
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // Railway特有のヘッダーを記録
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'x-forwarded-for': req.headers?.['x-forwarded-for'],
        'x-railway-request-id': req.headers?.['x-railway-request-id']
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
});
