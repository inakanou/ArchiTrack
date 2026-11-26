/**
 * @fileoverview 認証の経路の DB 障害の応答（要件42.4、42.8）
 *
 * 認証の経路（auth.routes）とセッションの経路（session.routes）で、DB 障害の応答の形と記録を揃える。
 * 全デバイスのログアウトは 2 つの入口（`POST /api/v1/auth/logout-all` と `DELETE /api/v1/auth/sessions`）を
 * 持つので、どちらも同じ応答を返す（user-authentication タスク76.1）。
 *
 * @module routes/auth-database-error
 */

import type { Request, Response } from 'express';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';
import { sentryRequestContext } from '../utils/sentry-request-context.js';

/** 認証の DB 障害の汎用の応答の本文（要件42.8） */
export const AUTH_DATABASE_ERROR_BODY = {
  error: 'Internal server error',
  code: 'INTERNAL_ERROR',
} as const;

/**
 * 認証の処理中の DB 障害を記録し、汎用の本文の 500 を返す（要件42.4、42.8）
 *
 * 障害の文言はエラーログとエラー監視にだけ残す。エラー監視の文脈は経路・メソッド・要求識別子・
 * 利用者 ID に限り、要求本文（パスワード・コード・資格）は付けない。
 */
export function sendAuthDatabaseError(
  req: Request,
  res: Response,
  message: string,
  logMessage: string
): void {
  logger.error({ error: message }, logMessage);
  captureException(new Error(message), {
    ...sentryRequestContext(req),
    errorType: 'auth_database_error',
  });
  res.status(500).json(AUTH_DATABASE_ERROR_BODY);
}
