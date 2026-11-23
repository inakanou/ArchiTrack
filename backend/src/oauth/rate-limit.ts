/**
 * @fileoverview 認可の窓口の送信元 IP ごとの回数制限（user-authentication タスク 73.5）
 *
 * 既存の制限の組み立てと Redis の保存先を使い、認可とトークンを専用の接頭辞で別々に数える。
 * 超過の応答とログには要求の値（`state`・コード・再開の識別子など）を含めない。
 *
 * Design: Requirements 46-51 > OAuthProviderHost > Rate limit
 *
 * @requirement user-authentication/REQ-51.10
 *
 * @module oauth/rate-limit
 */

import type { Request, Response } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { getClientIp } from '../middleware/client-ip.js';
import {
  createLimiterBuilder,
  type RateLimiterDependencies,
} from '../middleware/rateLimit.middleware.js';
import logger from '../utils/logger.js';
import type { ExternalAppOAuthRateLimit } from './client-registry.js';

const RATE_LIMIT_LOG_MESSAGE = 'OAuth rate limit exceeded';

/** 認可の窓口の超過の画面。`redirect_uri` へ戻さず、要求の値を一切含めない */
const AUTHORIZE_RATE_LIMITED_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>しばらくお待ちください</title></head>
<body><h1>しばらくお待ちください</h1><p>要求が多すぎます。時間をおいて、接続を開始したアプリからもう一度お試しください。</p></body>
</html>`;

export interface OAuthRateLimiters {
  readonly authorize: RateLimitRequestHandler;
  readonly token: RateLimitRequestHandler;
}

function logLimited(req: Request, endpoint: keyof OAuthRateLimiters): void {
  // パスは再開の識別子を含むので記録しない
  logger.warn({ ip: getClientIp(req), endpoint }, RATE_LIMIT_LOG_MESSAGE);
}

/**
 * 認可とトークンの回数制限を組み立てる
 *
 * @param limits - 検証済みの上限と集計期間
 * @param deps - 実行環境の判定と Redis の接続
 * @returns 窓口ごとの制限
 */
export function createOAuthRateLimiters(
  limits: ExternalAppOAuthRateLimit,
  deps: RateLimiterDependencies = {}
): OAuthRateLimiters {
  const build = createLimiterBuilder(deps);
  return {
    authorize: build({
      windowMs: limits.windowMs,
      max: limits.authorizeMax,
      prefix: 'rl:oauth-authorize:',
      skippable: true,
      observeLimited: true,
      handler: (req: Request, res: Response) => {
        logLimited(req, 'authorize');
        res
          .status(429)
          .set('Cache-Control', 'no-store')
          .type('html')
          .send(AUTHORIZE_RATE_LIMITED_PAGE);
      },
    }),
    token: build({
      windowMs: limits.windowMs,
      max: limits.tokenMax,
      prefix: 'rl:oauth-token:',
      skippable: true,
      observeLimited: true,
      handler: (req: Request, res: Response) => {
        logLimited(req, 'token');
        res.status(429).set('Cache-Control', 'no-store').json({
          error: 'temporarily_unavailable',
          error_description: 'Too many requests. Retry later.',
        });
      },
    }),
  };
}
