/**
 * @fileoverview 外部アプリ用の窓口に掛ける認証・範囲の確認・回数制限（user-authentication タスク 75.2）
 *
 * claude-connector の窓口と、本章の確認用の窓口（`/oauth/resource/whoami`）が使う。
 *
 * - トークンは `Authorization: Bearer` の 1 つだけから読む（方式の名前は大文字小文字を区別しない）。
 *   問い合わせや本文の `access_token` と、Authorization の重複は 400 `invalid_request` で拒否する
 *   （RFC 6750 の 2.1・3.1）。画面用の JWT を含む全ての不成立は検証（タスク75.1）が `INVALID_TOKEN` にし、
 *   401 `invalid_token` で返す（51.3）
 * - 401 の挑戦は `Bearer resource_metadata="<RFC 9728 の 3.1 のメタデータの URL>", scope="read write"`。
 *   資格の無い要求には `error` を付けない（RFC 6750 の 3.1）。403 は
 *   `Bearer error="insufficient_scope", scope="read write"`。挑戦にも応答にも要求の値を含めない
 * - 検証の基盤の失敗（`ExternalAppTokenVerificationError`）は 401 にせず 503 にする。401 にすると外部アプリが
 *   正常な接続を捨てて再度の同意へ進むため（75.1 の申し送り）
 * - 回数制限は認証の成立の後に、利用者の ID だけを鍵として全ての接続を合算して数える（51.4）。認証に
 *   失敗した要求は利用者の枠を消費しない。無効化の判定は既存の `isRateLimitBypassAllowed` だけで、
 *   本番・未設定・未知の実行環境では無効化の設定を読まない（51.6）
 * - 主体は要求の外の WeakMap に置き、`getExternalAppPrincipal` でだけ読む。画面用の `req.user` を設定も
 *   参照もしないので、画面用の経路は外部アプリの主体を、外部アプリの経路は画面用の主体を受け付けない。
 *   範囲の確認（`requireExternalScope`）を通していない要求で主体を読むと例外にして、範囲の宣言の漏れを通さない
 * - トークンの値をログ・応答・例外の文に含めない（要件48.8）
 *
 * Design: Requirements 46-51 > ExternalAppAuthMiddleware
 *
 * @requirement user-authentication/REQ-33.3
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.2
 * @requirement user-authentication/REQ-51.3
 * @requirement user-authentication/REQ-51.4
 * @requirement user-authentication/REQ-51.5
 * @requirement user-authentication/REQ-51.6
 *
 * @module middleware/external-app-auth
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ExternalAppResourceRateLimit } from '../oauth/client-registry.js';
import type { ExternalAppPrincipal, ExternalAppScope } from '../oauth/oauth.types.js';
import {
  ExternalAppTokenVerificationError,
  type ExternalAppTokenVerifier,
} from '../services/external-app-token-verifier.service.js';
import logger from '../utils/logger.js';
import { getClientIp } from './client-ip.js';
import { createLimiterBuilder, type RateLimiterDependencies } from './rateLimit.middleware.js';

/** 窓口が受け付ける範囲（挑戦の `scope` にも使う） */
const KNOWN_SCOPES: readonly ExternalAppScope[] = ['read', 'write'];
const CHALLENGE_SCOPE = KNOWN_SCOPES.join(' ');
const METADATA_WELL_KNOWN = '/.well-known/oauth-protected-resource';
/** `Bearer <token>`。区切りは空白 1 つで、トークンは空白を含まない */
const BEARER_PATTERN = /^Bearer (\S+)$/i;
const BEARER_SCHEME_PATTERN = /^Bearer(?: |$)/i;
const RATE_LIMIT_PREFIX = 'rl:external-app:';

/** 認証済みの要求の状態。要求の外に置き、画面用の `req.user` と混ざらないようにする */
interface ExternalAppRequestState {
  readonly principal: ExternalAppPrincipal;
  scopeChecked: boolean;
}

const states = new WeakMap<Request, ExternalAppRequestState>();

/** 窓口の依存 */
export interface ExternalAppAuthDeps {
  readonly verifier: Pick<ExternalAppTokenVerifier, 'verify'>;
  /** `OAUTH_RESOURCE_URL`。挑戦の `resource_metadata` を導く */
  readonly resourceUrl: string;
  /** 利用者ごとの上限と集計期間（`EXTERNAL_APP_RATE_LIMIT_*`） */
  readonly rateLimit: ExternalAppResourceRateLimit;
  /** 実行環境の判定と Redis の接続（省略時は process.env と共有の Redis） */
  readonly rateLimitDeps?: RateLimiterDependencies;
  /** 判定の時刻（省略時は現在の時刻） */
  readonly now?: () => Date;
}

/** 窓口に掛ける部品の一式 */
export interface ExternalAppAuth {
  /** 認証と利用者ごとの回数制限 */
  authenticateExternalApp(): RequestHandler;
  /** 範囲の確認。`authenticateExternalApp` の後に掛ける */
  requireExternalScope(scope: ExternalAppScope): RequestHandler;
  /** 経路に掛ける一式（認証・回数制限・範囲の確認）。範囲は経路ごとに必ず明示する */
  protect(scope: ExternalAppScope): RequestHandler[];
}

/**
 * 保護されたリソースのメタデータの URL（RFC 9728 の 3.1）。オリジンとパスの間に既知の接尾辞を挟む
 *
 * @param resourceUrl - リソースの識別子（`OAUTH_RESOURCE_URL`）
 * @returns メタデータの URL
 */
export function protectedResourceMetadataUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}${METADATA_WELL_KNOWN}${path}`;
}

/**
 * 範囲の確認を通した要求の外部アプリの主体を返す
 *
 * @param req - 要求
 * @returns 主体
 * @throws {Error} 認証していない、または範囲の確認を通していない要求（経路の組み立ての誤り）
 */
export function getExternalAppPrincipal(req: Request): ExternalAppPrincipal {
  const state = states.get(req);
  if (!state) {
    throw new Error('authenticateExternalApp must run before reading the external app principal');
  }
  if (!state.scopeChecked) {
    throw new Error('requireExternalScope must run before reading the external app principal');
  }
  return state.principal;
}

function assertKnownScope(scope: unknown): asserts scope is ExternalAppScope {
  if (!KNOWN_SCOPES.includes(scope as ExternalAppScope)) {
    throw new Error('external app route must declare the read or write scope');
  }
}

function hasMultipleAuthorizationHeaders(req: Request): boolean {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === 'authorization') {
      count += 1;
    }
  }
  return count > 1;
}

function hasOwn(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key);
}

/** トークンを Authorization 以外で渡しているか（RFC 6750 の 2.2・2.3 の方法は受け付けない） */
function hasTokenOutsideHeader(req: Request): boolean {
  return hasOwn(req.query, 'access_token') || hasOwn(req.body, 'access_token');
}

type BearerReading =
  | { readonly kind: 'token'; readonly token: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'invalid_request' };

function readBearer(req: Request): BearerReading {
  if (hasMultipleAuthorizationHeaders(req) || hasTokenOutsideHeader(req)) {
    return { kind: 'invalid_request' };
  }
  const header = req.headers.authorization;
  if (header === undefined || !BEARER_SCHEME_PATTERN.test(header)) {
    // Bearer の資格が無い要求（RFC 6750 の 3.1。error を付けない）
    return { kind: 'absent' };
  }
  const matched = BEARER_PATTERN.exec(header);
  return matched?.[1] ? { kind: 'token', token: matched[1] } : { kind: 'malformed' };
}

/**
 * 窓口に掛ける部品を組み立てる
 *
 * @param deps - 検証・リソースの識別子・回数制限の設定
 * @returns 認証・範囲の確認・経路の一式
 */
export function createExternalAppAuth(deps: ExternalAppAuthDeps): ExternalAppAuth {
  const metadataUrl = protectedResourceMetadataUrl(deps.resourceUrl);
  const now = deps.now ?? (() => new Date());
  const unauthorizedChallenge = (error?: 'invalid_token' | 'invalid_request'): string =>
    `Bearer ${error ? `error="${error}", ` : ''}resource_metadata="${metadataUrl}", scope="${CHALLENGE_SCOPE}"`;

  const sendUnauthorized = (res: Response, error?: 'invalid_token'): void => {
    res
      .status(401)
      .set('WWW-Authenticate', unauthorizedChallenge(error))
      .json({ error: 'invalid_token' });
  };

  const limiter = createLimiterBuilder(deps.rateLimitDeps)({
    windowMs: deps.rateLimit.windowMs,
    max: deps.rateLimit.max,
    prefix: RATE_LIMIT_PREFIX,
    skippable: true,
    observeLimited: true,
    // 認証の後にだけ呼ぶので主体が必ずある。利用者の ID だけで数え、送信元 IP を鍵にしない
    keyGenerator: (req: Request): string => `user:${states.get(req)?.principal.userId ?? ''}`,
    handler: (req: Request, res: Response) => {
      const retryAfterSeconds = Number(res.getHeader('Retry-After'));
      logger.warn(
        { userId: states.get(req)?.principal.userId, ip: getClientIp(req) },
        'External app rate limit exceeded'
      );
      res.status(429).json({ error: 'rate_limited', retryAfterSeconds });
    },
  });

  const authenticateExternalApp = (): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
      res.set('Cache-Control', 'no-store');
      const reading = readBearer(req);
      if (reading.kind === 'invalid_request') {
        res
          .status(400)
          .set('WWW-Authenticate', unauthorizedChallenge('invalid_request'))
          .json({ error: 'invalid_request' });
        return;
      }
      if (reading.kind === 'absent') {
        sendUnauthorized(res);
        return;
      }
      if (reading.kind === 'malformed') {
        sendUnauthorized(res, 'invalid_token');
        return;
      }
      const source = { ipAddress: getClientIp(req), userAgent: req.get('user-agent') };
      const verifyAndLimit = async (): Promise<void> => {
        let result: Awaited<ReturnType<ExternalAppAuthDeps['verifier']['verify']>>;
        try {
          result = await deps.verifier.verify(reading.token, now(), source);
        } catch (error) {
          if (!(error instanceof ExternalAppTokenVerificationError)) {
            throw error;
          }
          logger.error(
            { errorName: error.name, errorCode: error.code },
            'External app token verification failed'
          );
          res.status(503).json({ error: 'temporarily_unavailable' });
          return;
        }
        if (!result.ok) {
          sendUnauthorized(res, 'invalid_token');
          return;
        }
        states.set(req, { principal: result.value, scopeChecked: false });
        await limiter(req, res, next);
      };
      verifyAndLimit().catch(next);
    };
  };

  const requireExternalScope = (scope: ExternalAppScope): RequestHandler => {
    assertKnownScope(scope);
    return (req: Request, res: Response, next: NextFunction): void => {
      const state = states.get(req);
      if (!state) {
        next(new Error('authenticateExternalApp must run before requireExternalScope'));
        return;
      }
      if (!state.principal.scopes.includes(scope)) {
        res
          .status(403)
          .set('Cache-Control', 'no-store')
          .set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${CHALLENGE_SCOPE}"`)
          .json({ error: 'insufficient_scope' });
        return;
      }
      state.scopeChecked = true;
      next();
    };
  };

  return {
    authenticateExternalApp,
    requireExternalScope,
    protect: (scope: ExternalAppScope): RequestHandler[] => {
      assertKnownScope(scope);
      return [authenticateExternalApp(), requireExternalScope(scope)];
    },
  };
}
