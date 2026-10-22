import { createHash } from 'crypto';
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { IRouter, NextFunction, Request, Response } from 'express';
import type { default as RedisType } from 'ioredis';
import redis from '../redis.js';
import { runtimeMode as processRuntimeMode, type RuntimeMode } from '../config/runtime-mode.js';
import { RedisRateLimitStore } from './RedisRateLimitStore.js';
import { getClientIp } from './client-ip.js';
import { PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE } from '../config/security.constants.js';

/**
 * 試行回数の制限（RateLimitPolicy）
 *
 * 制限の組み立て（createRateLimiters）は実行環境の判定とキャッシュ基盤の接続を引数で受け取る。
 * 試験の実行環境の統合テストから本番の判定で組み立てられるようにするため（user-authentication タスク48.1）。
 * 制限を外すのは OPTIONS と、実行環境の判定が無効化を認めるとき（試験の明示・開発での明示）に限る。
 */

/**
 * 認証系の専用の制限の時間窓と上限（design.md の RateLimitPolicy）
 */
export const AUTH_RATE_LIMITS = {
  /** 2FA の検証（TOTP・バックアップコード）: 5 分で 10 回 */
  TWO_FACTOR_VERIFY: { windowMs: 5 * 60 * 1000, limit: 10 },
  /** パスワードリセットの要求: 1 時間で 5 回（送信元・メールアドレスのそれぞれで数える） */
  PASSWORD_RESET_REQUEST: { windowMs: 60 * 60 * 1000, limit: 5 },
  /** パスワードリセットの実行と検証: 15 分で 10 回 */
  PASSWORD_RESET: { windowMs: 15 * 60 * 1000, limit: 10 },
  /** 招待経由の登録と招待の検証: 15 分で 10 回 */
  REGISTRATION: { windowMs: 15 * 60 * 1000, limit: 10 },
} as const;

/**
 * 制限の組み立てに与える依存
 */
export interface RateLimiterDependencies {
  /** 実行環境の判定（省略時は process.env を読む判定） */
  runtimeMode?: Pick<RuntimeMode, 'isRateLimitBypassAllowed'>;
  /** キャッシュ基盤の接続（省略時は共有の Redis。null ならメモリの記録で数える） */
  getRedisClient?: () => RedisType | null;
}

/**
 * 組み立てた制限の一式
 */
export interface RateLimiters {
  api: RateLimitRequestHandler;
  login: RateLimitRequestHandler;
  refresh: RateLimitRequestHandler;
  invitation: RateLimitRequestHandler;
  healthCheck: RateLimitRequestHandler;
  twoFactorVerify: RateLimitRequestHandler;
  passwordReset: RateLimitRequestHandler;
  registration: RateLimitRequestHandler;
  /** リセットの要求の送信元ごとの制限（超過は 429） */
  passwordResetRequestByIp: RateLimitRequestHandler;
  /** リセットの要求のメールアドレスごとの制限（超過は通常の受理と同じ 200 を返し送信しない） */
  passwordResetRequestByEmail: RateLimitRequestHandler;
}

type AuthenticatedRequest = Request & { user?: { id: string } };

/** 送信元 IP による識別（信頼する中継の段数に基づく req.ip。IPv6 は正規化する） */
const ipKey = (req: Request): string => ipKeyGenerator(getClientIp(req));

/** 要求の本文のメールアドレス（文字列でなければ undefined。形式の誤りは後ろの検証が 400 を返す） */
const bodyEmail = (req: Request): string | undefined => {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : undefined;
};

/** メールアドレスによる識別（大文字小文字と前後の空白を揃えた SHA-256。原文は記録に残さない） */
const emailKey = (req: Request): string =>
  createHash('sha256')
    .update((bodyEmail(req) ?? '').trim().toLowerCase())
    .digest('hex');

interface LimiterSpec {
  windowMs: number;
  max: number;
  prefix: string;
  /** 超過時の応答の error（省略時は既定の応答） */
  error?: string;
  /** 超過時のログの文言 */
  logMessage?: string;
  /** 無効化の判定に従うか（ヘルスチェックは従わない） */
  skippable: boolean;
  keyGenerator?: (req: Request) => string;
  /** 超過時のログに利用者 ID を含めるか */
  logUserId?: boolean;
  /** 制限の対象外とする追加の条件 */
  skipAlso?: (req: Request) => boolean;
  /** 超過時の応答（省略時は error の 429） */
  handler?: (req: Request, res: Response, next: NextFunction) => void;
  /** RateLimit-* ヘッダーを返すか（既定 true） */
  standardHeaders?: boolean;
}

/**
 * 実行環境の判定とキャッシュ基盤の接続を受け取り、制限の一式を組み立てる
 */
export function createRateLimiters(deps: RateLimiterDependencies = {}): RateLimiters {
  const mode = deps.runtimeMode ?? processRuntimeMode;
  const getRedisClient = deps.getRedisClient ?? (() => redis.getClient());

  // OPTIONS（CORS preflight）と、実行環境の判定が無効化を認めるときだけ外す
  const skip = (req: Request): boolean =>
    req.method === 'OPTIONS' || mode.isRateLimitBypassAllowed();

  const build = (spec: LimiterSpec): RateLimitRequestHandler =>
    rateLimit({
      windowMs: spec.windowMs,
      max: spec.max,
      ...(spec.error !== undefined && { message: { error: spec.error } }),
      standardHeaders: spec.standardHeaders ?? true, // RateLimit-* ヘッダーを返す
      legacyHeaders: false, // X-RateLimit-* ヘッダーを無効化
      ...(spec.skippable && {
        skip: (req: Request): boolean => skip(req) || (spec.skipAlso?.(req) ?? false),
      }),
      // カスタムRedisストアを使用（遅延初期化。Redis が使えないときはメモリの記録へ退避）
      store: new RedisRateLimitStore(getRedisClient, spec.prefix),
      keyGenerator: spec.keyGenerator ?? ipKey,
      ...(spec.handler !== undefined && { handler: spec.handler }),
      ...(spec.handler === undefined &&
        spec.error !== undefined && {
          handler: (req: Request, res: Response) => {
            req.log.warn(
              {
                ...(spec.logUserId && { userId: (req as AuthenticatedRequest).user?.id }),
                ip: getClientIp(req),
                path: req.path,
              },
              spec.logMessage
            );
            res.status(429).json({
              error: spec.error,
              retryAfter: res.getHeader('Retry-After'),
            });
          },
        }),
    });

  return {
    // 一般的なAPIエンドポイント用: 15分間で100リクエストまで
    api: build({
      windowMs: 15 * 60 * 1000,
      max: 100,
      prefix: 'rl:api:',
      error: 'Too many requests from this IP, please try again later.',
      logMessage: 'Rate limit exceeded',
      skippable: true,
    }),
    // @requirement user-authentication/REQ-26.12: 1分間で10リクエストまで
    login: build({
      windowMs: 1 * 60 * 1000,
      max: 10,
      prefix: 'rl:login:',
      error: 'Too many login attempts, please try again later.',
      logMessage: 'Login rate limit exceeded',
      skippable: true,
    }),
    // @requirement user-authentication/REQ-26.12: 1分間で20リクエストまで
    refresh: build({
      windowMs: 1 * 60 * 1000,
      max: 20,
      prefix: 'rl:refresh:',
      error: 'Too many token refresh attempts, please try again later.',
      logMessage: 'Token refresh rate limit exceeded',
      skippable: true,
    }),
    // @requirement user-authentication/REQ-26.12: 1分間で5リクエストまで（ユーザーIDベース）
    invitation: build({
      windowMs: 1 * 60 * 1000,
      max: 5,
      prefix: 'rl:invitation:',
      error: 'Too many invitation requests, please try again later.',
      logMessage: 'Invitation rate limit exceeded',
      skippable: true,
      logUserId: true,
      keyGenerator: (req: Request): string => {
        // 認証済みユーザーのIDを使用
        const userId = (req as AuthenticatedRequest).user?.id;
        if (userId) {
          return `user:${userId}`;
        }
        // 送信元 IP を使用（IPv6対応）
        return `ip:${ipKey(req)}`;
      },
    }),
    // ヘルスチェック用の緩いレート制限: 1分間で60リクエストまで（無効化の判定に従わない）
    healthCheck: build({
      windowMs: 1 * 60 * 1000,
      max: 60,
      prefix: 'rl:health:',
      skippable: false,
    }),
    // 2FA の検証（TOTP・バックアップコード）
    twoFactorVerify: build({
      windowMs: AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.windowMs,
      max: AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit,
      prefix: 'rl:2fa-verify:',
      error: 'Too many two-factor verification attempts, please try again later.',
      logMessage: 'Two-factor verification rate limit exceeded',
      skippable: true,
    }),
    // パスワードリセットの実行とトークンの検証
    passwordReset: build({
      windowMs: AUTH_RATE_LIMITS.PASSWORD_RESET.windowMs,
      max: AUTH_RATE_LIMITS.PASSWORD_RESET.limit,
      prefix: 'rl:password-reset:',
      error: 'Too many password reset attempts, please try again later.',
      logMessage: 'Password reset rate limit exceeded',
      skippable: true,
    }),
    // 招待経由の登録と招待の検証
    registration: build({
      windowMs: AUTH_RATE_LIMITS.REGISTRATION.windowMs,
      max: AUTH_RATE_LIMITS.REGISTRATION.limit,
      prefix: 'rl:registration:',
      error: 'Too many registration attempts, please try again later.',
      logMessage: 'Registration rate limit exceeded',
      skippable: true,
    }),
    // パスワードリセットの要求（送信元ごと）
    passwordResetRequestByIp: build({
      windowMs: AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.windowMs,
      max: AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit,
      prefix: 'rl:password-reset-request-ip:',
      error: 'Too many password reset requests, please try again later.',
      logMessage: 'Password reset request rate limit exceeded',
      skippable: true,
    }),
    // パスワードリセットの要求（メールアドレスごと）。超過は通常の受理と同じ応答を返し、
    // 要求を処理しない（メールを送らない）。応答から登録の有無も制限の有無も推測させないため、
    // メールアドレスごとの残り回数のヘッダーも返さない（要件35.4、35.7）
    passwordResetRequestByEmail: build({
      windowMs: AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.windowMs,
      max: AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit,
      prefix: 'rl:password-reset-request-email:',
      skippable: true,
      standardHeaders: false,
      keyGenerator: emailKey,
      skipAlso: (req: Request): boolean => bodyEmail(req) === undefined,
      handler: (req: Request, res: Response) => {
        req.log.warn(
          { ip: getClientIp(req), path: req.path },
          'Password reset request rate limit exceeded for email; request ignored'
        );
        res.status(200).json(PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE);
      },
    }),
  };
}

/**
 * 認証系の専用の制限を対象の経路へ掛ける（認証・招待のルーターより前に呼ぶ）
 *
 * 経路は app の絶対パスで書く。統合テストは本番の判定で組み立てた制限を渡して同じ掛け方を使う。
 */
export function mountAuthRateLimitPolicy(
  app: IRouter,
  limiters: Pick<
    RateLimiters,
    | 'twoFactorVerify'
    | 'passwordReset'
    | 'registration'
    | 'passwordResetRequestByIp'
    | 'passwordResetRequestByEmail'
  >
): void {
  app.post(['/api/v1/auth/verify-2fa', '/api/v1/auth/verify-2fa/backup'], limiters.twoFactorVerify);
  // 送信元の超過（429）を先に判定し、通ったものをメールアドレスごとに数える
  app.post('/api/v1/auth/password/reset-request', [
    limiters.passwordResetRequestByIp,
    limiters.passwordResetRequestByEmail,
  ]);
  app.post('/api/v1/auth/password/reset', limiters.passwordReset);
  app.get('/api/v1/auth/password/verify-reset', limiters.passwordReset);
  app.post('/api/v1/auth/register', limiters.registration);
  app.get('/api/v1/invitations/verify', limiters.registration);
}

/**
 * process.env の実行環境の判定と共有の Redis で組み立てた既定の制限
 */
export const rateLimiters: RateLimiters = createRateLimiters();

export const apiLimiter = rateLimiters.api;
export const loginLimiter = rateLimiters.login;
export const refreshLimiter = rateLimiters.refresh;
export const invitationLimiter = rateLimiters.invitation;
export const healthCheckLimiter = rateLimiters.healthCheck;
