import { Logger } from 'pino';

/**
 * Express Request型の拡張
 * pino-httpによって追加されるlogプロパティの型定義
 */
declare global {
  namespace Express {
    interface Request {
      log: Logger;
    }
  }
}

export {};
