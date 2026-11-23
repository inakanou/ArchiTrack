/**
 * @fileoverview 認可サーバー（oidc-provider）の設定と Express への搭載（user-authentication タスク 73.2）
 *
 * 担当の経路だけをライブラリへ渡す。ライブラリが無効にできない `end_session` の確認の経路なども、
 * この許可の一覧に無いので外から届かない。発行者は設定値に固定し、要求の Host と転送ヘッダーを置き換える。
 *
 * Design: Requirements 46-51 > OAuthProviderHost
 *
 * @requirement user-authentication/REQ-46.1
 * @requirement user-authentication/REQ-46.4
 * @requirement user-authentication/REQ-46.5
 * @requirement user-authentication/REQ-46.6
 * @requirement user-authentication/REQ-47.9
 * @requirement user-authentication/REQ-48.1
 * @requirement user-authentication/REQ-48.4
 * @requirement user-authentication/REQ-48.5
 * @requirement user-authentication/REQ-48.8
 *
 * @module oauth/provider
 */

import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import Provider, {
  errors,
  interactionPolicy,
  type OidcContext,
  type OidcGrant,
} from 'oidc-provider';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getClientIp } from '../middleware/client-ip.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { ExternalAppConnectionService } from '../services/external-app-connection.service.js';
import logger from '../utils/logger.js';
import {
  createExternalAppClientRegistry,
  ExternalAppConfigError,
  parseExternalAppOAuthConfig,
  type ExternalAppOAuthConfig,
} from './client-registry.js';
import { getRequestSource, runWithRequestSource } from './request-context.js';
import { createOAuthStoreAdapterFactory } from './store-adapter.js';

const DAY_SECONDS = 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 600;
const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 30 * DAY_SECONDS;
const GRANT_TTL_SECONDS = 90 * DAY_SECONDS;
/** 同意の手続きと、再開で作られるセッションの有効期間。セッションは次の要求で使わない */
const INTERACTION_TTL_SECONDS = 600;
const SESSION_TTL_SECONDS = 600;

const OFFLINE_ACCESS_SCOPE = 'offline_access';
const RESOURCE_SCOPES = 'read write';
const SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set(['_session', '_session.sig']);

const METADATA_PATH = '/.well-known/oauth-authorization-server';
const AUTHORIZE_PATH = '/oauth/authorize';
const TOKEN_PATH = '/oauth/token';
const JWKS_PATH = '/oauth/jwks';
const RESUME_PATH_PATTERN = /^\/oauth\/authorize\/[A-Za-z0-9_-]+$/;

/** 利用者へ見せるエラー画面。要求の値を一切含めない（要件46.5） */
const ERROR_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>接続できませんでした</title></head>
<body><h1>接続できませんでした</h1><p>接続を開始したアプリに戻り、もう一度お試しください。</p></body>
</html>`;

export interface OAuthProviderHostDeps {
  readonly prisma: PrismaClient;
  readonly connectionService: Pick<
    ExternalAppConnectionService,
    'handleReuse' | 'recordRefreshGrace'
  >;
}

export interface OAuthProviderHost {
  readonly provider: Provider;
  readonly middleware: RequestHandler;
}

/**
 * 認可サーバーの担当の経路か
 *
 * @param method - HTTP メソッド
 * @param path - クエリを除いたパス
 * @returns 担当の経路なら true
 */
export function isOAuthProviderRoute(method: string, path: string): boolean {
  switch (path) {
    case AUTHORIZE_PATH:
      return method === 'GET';
    case TOKEN_PATH:
      return method === 'POST' || method === 'OPTIONS';
    case JWKS_PATH:
    case METADATA_PATH:
      return method === 'GET' || method === 'OPTIONS';
    default:
      return method === 'GET' && RESUME_PATH_PATTERN.test(path);
  }
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Grant の残りを超えない有効期間。Grant は更新で延びないので、ここが 90 日の上限になる（要件48.4） */
function capToGrant(ctx: OidcContext | undefined, limitSeconds: number): number {
  const exp = ctx?.oidc.entities.Grant?.exp;
  if (typeof exp !== 'number') {
    throw new errors.InvalidGrant('grant not found');
  }
  const remaining = exp - epochSeconds();
  if (remaining <= 0) {
    throw new errors.InvalidGrant('grant is expired');
  }
  return Math.min(limitSeconds, remaining);
}

/**
 * 既存のセッションと Grant があっても、この申し込みの同意の結果が無ければ同意へ戻す。
 * 同意の後は範囲の照合で戻さない（読み取りだけの同意や `offline_access` で戻り続けるのを防ぐ）
 */
function buildInteractionPolicy() {
  const { base, Check } = interactionPolicy;
  const policy = base();
  const consent = policy.get('consent');
  if (!consent) {
    throw new Error('consent prompt is missing');
  }
  consent.checks.clear();
  consent.checks.add(
    new Check('consent_result_required', 'consent result is required', (ctx) => {
      if (typeof ctx.oidc.result?.consent?.grantId !== 'string') {
        return Check.REQUEST_PROMPT;
      }
      // 同意の後に無効になった利用者へ認可コードを返さない
      if (!ctx.oidc.account) {
        throw new errors.AccessDenied(undefined, 'account is not available');
      }
      return Check.NO_NEED_TO_PROMPT;
    })
  );
  return policy;
}

/**
 * 同意の結果の `grantId` だけから Grant を読む（セッションの Grant を使わない）。
 * `offline_access` は利用者の選択肢に出さず、要求されていれば Grant へ付与する
 */
async function loadConsentGrant(ctx: OidcContext): Promise<OidcGrant | undefined> {
  const grantId = ctx.oidc.result?.consent?.grantId;
  if (typeof grantId !== 'string' || grantId === '') {
    return undefined;
  }
  const grant = await ctx.oidc.provider.Grant.find(grantId);
  if (!grant) {
    return undefined;
  }
  const ownedByRequest =
    grant.accountId === ctx.oidc.account?.accountId && grant.clientId === ctx.oidc.client?.clientId;
  if (
    ownedByRequest &&
    ctx.oidc.requestParamScopes.has(OFFLINE_ACCESS_SCOPE) &&
    !grant.getOIDCScope().split(' ').includes(OFFLINE_ACCESS_SCOPE)
  ) {
    grant.addOIDCScope(OFFLINE_ACCESS_SCOPE);
    await grant.save();
  }
  return grant;
}

/**
 * トークンの要求の `resource` が設定の値だけであることを確かめる。
 * ライブラリの検証は認可コードの消費の後なので、誤りの後の正しい再試行が再利用にならないよう先に拒否する
 */
function assertRequestedResource(ctx: OidcContext, resourceUrl: string): void {
  const requested = ctx.oidc.params?.resource;
  const values = Array.isArray(requested) ? requested : requested === undefined ? [] : [requested];
  if (values.some((value) => value !== resourceUrl)) {
    throw new errors.InvalidTarget();
  }
}

function buildConfiguration(
  config: ExternalAppOAuthConfig,
  deps: OAuthProviderHostDeps
): Record<string, unknown> {
  const { resourceUrl } = config;
  return {
    adapter: createOAuthStoreAdapterFactory({
      prisma: deps.prisma,
      tokenHmacKey: config.tokenHmacKey,
      onGrantRevoked: (event) => deps.connectionService.handleReuse(event),
      onRefreshGraceApplied: (event) => deps.connectionService.recordRefreshGrace(event),
      getRequestSource,
      assertCodeExchangeRequest: (ctx) => assertRequestedResource(ctx, resourceUrl),
    }),
    clients: config.clients.map((client) => ({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      client_name: client.displayName,
      redirect_uris: [...client.redirectUris],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      response_modes: ['query'],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: `${OFFLINE_ACCESS_SCOPE} ${RESOURCE_SCOPES}`,
    })),
    clientAuthMethods: ['client_secret_post'],
    responseTypes: ['code'],
    scopes: [OFFLINE_ACCESS_SCOPE, ...RESOURCE_SCOPES.split(' ')],
    jwks: { keys: config.jwks.keys.map((key) => ({ ...key })) },
    cookies: { keys: [...config.cookieKeys] },
    routes: { authorization: AUTHORIZE_PATH, token: TOKEN_PATH, jwks: JWKS_PATH },
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      dPoP: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      userinfo: { enabled: false },
      introspection: { enabled: false },
      revocation: { enabled: false },
      registration: { enabled: false },
      deviceFlow: { enabled: false },
      clientIdMetadataDocument: { enabled: false },
      resourceIndicators: {
        enabled: true,
        // Claude は認可・トークン・更新の全要求に resource を付ける（タスク70.2）ので、省いた認可要求は拒否する。
        // トークンの要求で省かれたときは、コードと更新トークンに結び付いた値（設定の 1 つだけ）を使う
        defaultResource: async (_ctx: unknown, _client: unknown, oneOf?: string[]) => {
          if (oneOf?.every((value) => value === resourceUrl)) {
            return resourceUrl;
          }
          throw new errors.InvalidTarget();
        },
        getResourceServerInfo: async (_ctx: unknown, identifier: string) => {
          if (identifier !== resourceUrl) {
            throw new errors.InvalidTarget();
          }
          return {
            scope: RESOURCE_SCOPES,
            audience: resourceUrl,
            accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
            accessTokenFormat: 'opaque',
          };
        },
      },
    },
    ttl: {
      AccessToken: (ctx: OidcContext) => capToGrant(ctx, ACCESS_TOKEN_TTL_SECONDS),
      AuthorizationCode: AUTHORIZATION_CODE_TTL_SECONDS,
      RefreshToken: (ctx: OidcContext) => capToGrant(ctx, REFRESH_TOKEN_TTL_SECONDS),
      Grant: GRANT_TTL_SECONDS,
      Interaction: INTERACTION_TTL_SECONDS,
      Session: SESSION_TTL_SECONDS,
    },
    rotateRefreshToken: true,
    issueRefreshToken: async (
      _ctx: unknown,
      client: { grantTypeAllowed(grantType: string): boolean }
    ) => client.grantTypeAllowed('refresh_token'),
    expiresWithSession: async () => false,
    loadExistingGrant: loadConsentGrant,
    interactions: {
      policy: buildInteractionPolicy(),
      url: (_ctx: unknown, interaction: { uid: string }) => `/oauth/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx: unknown, id: string) => {
      const user = await deps.prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });
      if (!user?.isActive) {
        return undefined;
      }
      return { accountId: user.id, claims: async () => ({ sub: user.id }) };
    },
    renderError: async (ctx: OidcContext) => {
      ctx.type = 'html';
      ctx.body = ERROR_PAGE;
    },
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/** ライブラリの事象を記録する。要求の値と例外の文はトークンを含みうるので、名前と経路だけにする（要件48.8） */
function observeProviderErrors(provider: Provider): void {
  provider.on('server_error', (ctx: OidcContext | undefined, error: unknown) => {
    logger.error(
      { errorName: errorName(error), route: ctx?.oidc?.route },
      'OAuth provider server error'
    );
  });
  // 既定のリスナーは例外の全文を標準エラーへ出すので置き換える
  provider.on('error', (error: unknown, ctx: OidcContext | undefined) => {
    logger.error(
      { errorName: errorName(error), route: ctx?.oidc?.route },
      'OAuth provider unhandled error'
    );
  });
}

/**
 * ライブラリは既定の claims から `openid` を範囲へ必ず足すので、メタデータの広告から外す。
 * クライアントの許可の範囲に無いので、`openid` の要求は `invalid_scope` で拒否される
 */
async function hideOpenIdScopeFromMetadata(
  ctx: OidcContext,
  next: () => Promise<void>
): Promise<void> {
  await next();
  if (ctx.oidc?.route !== 'discovery') {
    return;
  }
  const metadata = ctx.body as { scopes_supported?: string[] } | undefined;
  if (metadata?.scopes_supported) {
    ctx.body = {
      ...metadata,
      scopes_supported: metadata.scopes_supported.filter((scope) => scope !== 'openid'),
    };
  }
}

/** 発行者の値で Host と転送ヘッダーを置き換える。送信元 IP は置き換えの前に信頼する段数で確定する */
function pinToIssuer(req: Request, issuer: URL): void {
  Object.defineProperty(req, 'ip', { value: req.ip, configurable: true });
  const headers = req.headers;
  delete headers.forwarded;
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-port'];
  delete headers['x-forwarded-prefix'];
  headers.host = issuer.host;
  headers['x-forwarded-host'] = issuer.host;
  headers['x-forwarded-proto'] = issuer.protocol.slice(0, -1);
}

/** 認可サーバーのセッションの Cookie を外す。同じブラウザの別の利用者の同意を妨げない */
function stripSessionCookies(req: Request): void {
  const { cookie } = req.headers;
  if (cookie === undefined) {
    return;
  }
  const kept = cookie.split(';').filter((part) => {
    const name = part.split('=', 1)[0]?.trim() ?? '';
    return !SESSION_COOKIE_NAMES.has(name);
  });
  if (kept.length === 0) {
    delete req.headers.cookie;
  } else {
    req.headers.cookie = kept.join(';').trim();
  }
}

/**
 * 認可サーバーを組み立てる。失敗は同期の例外で呼び出し元へ伝え、窓口なしで動き続けない
 *
 * @param config - 検証済みの設定
 * @param deps - 依存
 * @returns ライブラリの本体と Express のミドルウェア
 * @throws {ExternalAppConfigError} 構築に失敗したとき（鍵の値を文に含めない）
 */
export function createOAuthProviderHost(
  config: ExternalAppOAuthConfig,
  deps: OAuthProviderHostDeps
): OAuthProviderHost {
  const issuer = new URL(config.issuer);
  if (issuer.pathname !== '/') {
    throw new ExternalAppConfigError(['OAUTH_ISSUER: パスの無いオリジンにしてください']);
  }

  let provider: Provider;
  try {
    provider = new Provider(config.issuer, buildConfiguration(config, deps));
  } catch (error) {
    throw new ExternalAppConfigError([`認可サーバーの構築に失敗しました（${errorName(error)}）`]);
  }
  provider.proxy = true;
  observeProviderErrors(provider);
  provider.use(hideOpenIdScopeFromMetadata);

  const handle = provider.callback();
  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!isOAuthProviderRoute(req.method, req.path)) {
      next();
      return;
    }
    // ライブラリは Basic と本文の送信を同じ方式として受け付けるので、登録した方式だけに絞る
    if (req.method === 'POST' && req.path === TOKEN_PATH && req.headers.authorization) {
      res.status(401).set('Cache-Control', 'no-store').json({ error: 'invalid_client' });
      return;
    }
    const source = { ipAddress: getClientIp(req), userAgent: req.get('user-agent') };
    pinToIssuer(req, issuer);
    stripSessionCookies(req);
    runWithRequestSource(source, () => handle(req, res)).catch(next);
  };

  return { provider, middleware };
}

/**
 * 許可するアプリがある環境でだけ、認可サーバーを Express へ載せる
 *
 * @param app - Express のアプリ
 * @param prisma - Prisma クライアント
 * @param source - 環境変数
 * @returns 載せた認可サーバー。許可するアプリが無ければ null（何も載せない）
 * @throws {ExternalAppConfigError} 設定の不正または構築の失敗（起動を止める）
 */
export function mountExternalAppOAuth(
  app: Express,
  prisma: PrismaClient,
  source: NodeJS.ProcessEnv = process.env
): OAuthProviderHost | null {
  const config = parseExternalAppOAuthConfig(source);
  if (config === null) {
    return null;
  }
  const connectionService = new ExternalAppConnectionService({
    prisma,
    auditLogService: new AuditLogService({ prisma }),
    clientRegistry: createExternalAppClientRegistry(config),
  });
  const host = createOAuthProviderHost(config, { prisma, connectionService });
  app.use(host.middleware);
  return host;
}
