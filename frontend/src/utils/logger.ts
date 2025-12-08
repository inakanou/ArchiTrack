/**
 * @fileoverview フロントエンド用ロガーユーティリティ
 *
 * 環境に応じたログ出力を提供します：
 * - 開発環境: コンソールに出力
 * - 本番環境: エラーのみSentryに送信、console出力は抑制
 *
 * @requirement user-authentication/REQ-26.11: ログマスキング処理
 */

import { captureException, captureMessage } from './sentry';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

/**
 * 機密情報をマスキング
 */
function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  const sensitiveKeys = [
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'twoFactorSecret',
    'backupCodes',
    'authorization',
  ];

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      masked[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * ログを出力
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  const isDev = import.meta.env.DEV;
  const maskedContext = context ? maskSensitiveData(context) : undefined;

  // 開発環境ではコンソールに出力
  if (isDev) {
    const logFn = console[level] || console.log;
    if (maskedContext) {
      logFn(`[${level.toUpperCase()}] ${message}`, maskedContext);
    } else {
      logFn(`[${level.toUpperCase()}] ${message}`);
    }
  }

  // 本番環境ではエラー・警告のみSentryに送信
  if (!isDev) {
    if (level === 'error') {
      captureMessage(message, 'error', maskedContext as Record<string, unknown>);
    } else if (level === 'warn') {
      captureMessage(message, 'warning', maskedContext as Record<string, unknown>);
    }
    // info, debug は本番では無視（Sentryのノイズを減らす）
  }
}

/**
 * フロントエンド用ロガー
 *
 * @example
 * ```typescript
 * import { logger } from '../utils/logger';
 *
 * logger.debug('Fetching users...');
 * logger.info('User logged in', { userId: '123' });
 * logger.warn('Rate limit approaching', { remaining: 10 });
 * logger.error('Authentication failed', { reason: 'Invalid token' });
 * ```
 */
export const logger = {
  /**
   * デバッグログ（開発環境のみ出力）
   */
  debug(message: string, context?: LogContext): void {
    log('debug', message, context);
  },

  /**
   * 情報ログ（開発環境のみ出力）
   */
  info(message: string, context?: LogContext): void {
    log('info', message, context);
  },

  /**
   * 警告ログ（開発環境はコンソール、本番はSentry）
   */
  warn(message: string, context?: LogContext): void {
    log('warn', message, context);
  },

  /**
   * エラーログ（開発環境はコンソール、本番はSentry）
   */
  error(message: string, context?: LogContext): void {
    log('error', message, context);
  },

  /**
   * 例外をログに記録（Sentryにも送信）
   */
  exception(error: Error, context?: LogContext): void {
    const maskedContext = context ? maskSensitiveData(context) : undefined;

    if (import.meta.env.DEV) {
      console.error('[EXCEPTION]', error, maskedContext);
    }

    captureException(error, maskedContext as Record<string, unknown>);
  },
};

export default logger;
