/**
 * @fileoverview 外部アプリの接続の同意の API（user-authentication タスク 74.3）
 *
 * - `GET /oauth/interaction/:uid` は認証なしで、形を検証した `uid` だけから画面の相対パスへ転送する
 * - その下の API は画面用のアクセストークンと手続きの Cookie を要する。Cookie の Path は同意の URL なので
 *   この経路の下にだけ届く
 * - 本文は認証と CSRF の検証の後に、この経路の小さな上限で解析する（全体の `express.json` より前に載せる）
 * - 再開の URL は認可サーバーが発行者の値で作ったものを返す。要求の Host と転送ヘッダーを使わない
 * - 応答とログに 2FA のコードや要求の値を含めない（要件48.8）
 * - 外部アプリ用の窓口の確認用の経路（`/oauth/resource/whoami` と `/write-access`。タスク75.2）は
 *   範囲とアプリ名だけを返し、業務データを返さない。claude-connector の窓口が載るまで、本番の入口からの到達と
 *   統合テストに使う
 * - 接続の一覧と取り消し（タスク77.1）は本人用と管理者用の経路を持ち、画面用のアクセストークンで認証する。
 *   管理者用はロール `admin` を確かめ、取り消しは CSRF を検証する。応答に Grant の ID とトークンを含めない
 *
 * Design: Requirements 46-51 > ExternalAppRoutes
 *
 * @requirement user-authentication/REQ-46.2
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-46.7
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.3
 * @requirement user-authentication/REQ-47.11
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.4
 * @requirement user-authentication/REQ-49.5
 * @requirement user-authentication/REQ-49.6
 * @requirement user-authentication/REQ-49.8
 * @requirement user-authentication/REQ-49.9
 * @requirement user-authentication/REQ-51.2
 *
 * @module routes/external-app
 */

import cookieParser from 'cookie-parser';
import express, {
  Router,
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { z } from 'zod';
import { SECURITY_CONFIG } from '../config/security.constants.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import { csrfProtection } from '../middleware/csrf.middleware.js';
import {
  getExternalAppPrincipal,
  type ExternalAppAuth,
} from '../middleware/external-app-auth.middleware.js';
import { rateLimiters } from '../middleware/rateLimit.middleware.js';
import { requireSystemAdmin } from '../middleware/require-system-admin.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { NotFoundError } from '../errors/apiError.js';
import type { ExternalAppClientRegistry } from '../oauth/client-registry.js';
import { OAUTH_ERROR_PAGE, type MountedExternalAppOAuth } from '../oauth/provider.js';
import redis from '../redis.js';
import {
  CONNECTION_LIST_MAX_LIMIT,
  CONNECTION_LIST_MAX_OFFSET,
  type ExternalAppConnectionService,
} from '../services/external-app-connection.service.js';
import {
  ConsentInteractionService,
  type ConsentError,
  type InteractionContext,
} from '../services/oauth-consent.service.js';
import { SecondFactorVerifier } from '../services/second-factor-verifier.service.js';
import { TwoFactorService } from '../services/two-factor.service.js';

/** 認可サーバーの申し込みの ID の形（nanoid の既定の 43 文字） */
const INTERACTION_UID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONSENT_SCREEN_PATH = '/connect/consent';
/** 同意の API の本文は 2FA のコードか範囲の一覧だけ */
const CONSENT_BODY_LIMIT = '1kb';

const TOTP_CODE_PATTERN = new RegExp(`^\\d{${SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH}}$`);
/** バックアップコードは 8 文字の英数字。ログインと同じく区切りと小文字を受ける */
const BACKUP_CODE_PATTERN = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;

const secondFactorSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('totp'), code: z.string().regex(TOTP_CODE_PATTERN) }),
  z.strictObject({ type: z.literal('backup'), code: z.string().regex(BACKUP_CODE_PATTERN) }),
]);

const approveSchema = z.strictObject({
  scopes: z
    .array(z.enum(['read', 'write']))
    .min(1)
    .max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length),
});

/** 応答の状態コードと文言。設計に状態コードが無い種別はタスク74.3 で定めた */
const CONSENT_ERROR_RESPONSES: Record<ConsentError['type'], { status: number; message: string }> = {
  INTERACTION_NOT_FOUND: {
    status: 404,
    message: '接続の申し込みが見つかりません。アプリから接続し直してください',
  },
  PERMISSION_REQUIRED: {
    status: 403,
    message: '外部アプリを接続する権限がありません。管理者に依頼してください',
  },
  ACCOUNT_RESTRICTED: {
    status: 403,
    message: 'パスワードの変更または 2FA の設定を済ませてください',
  },
  SECOND_FACTOR_REQUIRED: { status: 403, message: '2FA の検証が必要です' },
  SECOND_FACTOR_FAILED: { status: 400, message: '認証コードが正しくありません' },
  SECOND_FACTOR_LOCKED: {
    status: 403,
    message: '2FA が一時的にロックされました。時間をおいて再試行してください',
  },
  READ_SCOPE_REQUIRED: { status: 400, message: '読み取りの範囲は必須です' },
  SCOPE_NOT_REQUESTED: { status: 400, message: '申し込みに無い範囲は選べません' },
  RECONNECT_REQUIRED: { status: 404, message: 'アプリから接続し直してください' },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: '現在処理できません。時間をおいて再試行してください',
  },
};

export type ConsentRouteService = Pick<
  ConsentInteractionService,
  'getInteraction' | 'verifySecondFactor' | 'approve' | 'deny'
>;

export interface ExternalAppRoutesDeps {
  readonly consent: ConsentRouteService;
  /** 2FA の試行制限（省略時はログインの 2FA と同じ枠） */
  readonly twoFactorLimiter?: RequestHandler;
}

function sendInvalidRequest(res: Response): void {
  res.status(400).json({ error: '要求の形式が正しくありません', code: 'INVALID_REQUEST' });
}

function sendConsentError(res: Response, error: ConsentError): void {
  const { status, message } = CONSENT_ERROR_RESPONSES[error.type];
  if (error.type === 'ACCOUNT_RESTRICTED') {
    // 画面の既存の制限の処理が受けるコードにそろえる
    res.status(status).json({ error: message, code: error.restriction });
    return;
  }
  if (error.type === 'SECOND_FACTOR_LOCKED') {
    res
      .status(status)
      .json({ error: message, code: error.type, unlockAt: error.unlockAt.toISOString() });
    return;
  }
  res.status(status).json({ error: message, code: error.type });
}

function uidOf(req: Request): string {
  return String(req.params.uid);
}

const requireValidUid: RequestHandler = (req, res, next) => {
  if (!INTERACTION_UID_PATTERN.test(uidOf(req))) {
    sendInvalidRequest(res);
    return;
  }
  next();
};

function interactionContext(req: Request, res: Response): InteractionContext {
  return {
    req,
    res,
    uid: uidOf(req),
    source: { ipAddress: getClientIp(req), userAgent: req.get('user-agent') },
  };
}

function authenticatedUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('authenticate must run before consent handlers');
  }
  return userId;
}

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/** 本文の解析の失敗と URL の復号の失敗を、値を返さない固定の応答にする */
const handleMalformedRequest: ErrorRequestHandler = (error: unknown, req, res, next) => {
  const parserError = error as { type?: unknown; status?: unknown };
  const isBodyError =
    typeof parserError.type === 'string' &&
    typeof parserError.status === 'number' &&
    parserError.status >= 400 &&
    parserError.status < 500;
  if (!(error instanceof URIError) && !isBodyError) {
    next(error);
    return;
  }
  const isBrowserNavigation = req.method === 'GET' && !req.path.slice(1).includes('/');
  if (isBrowserNavigation) {
    res.status(400).type('html').send(OAUTH_ERROR_PAGE);
    return;
  }
  sendInvalidRequest(res);
};

/**
 * 同意の経路のルーターを作る。`/oauth/interaction` に載せる
 *
 * @param deps - 同意の手続きと 2FA の試行制限
 * @returns ルーター
 */
export function createExternalAppRoutes(deps: ExternalAppRoutesDeps): Router {
  const { consent } = deps;
  const twoFactorLimiter = deps.twoFactorLimiter ?? rateLimiters.twoFactorVerify;
  const parseJson = express.json({ limit: CONSENT_BODY_LIMIT, strict: true });
  const stateChanging: RequestHandler[] = [
    requireValidUid,
    authenticate,
    cookieParser(),
    csrfProtection,
  ];

  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/:uid', (req, res) => {
    const uid = uidOf(req);
    if (!INTERACTION_UID_PATTERN.test(uid)) {
      res.status(400).type('html').send(OAUTH_ERROR_PAGE);
      return;
    }
    res.redirect(302, `${CONSENT_SCREEN_PATH}/${uid}`);
  });

  router.get(
    '/:uid/details',
    requireValidUid,
    authenticate,
    asyncHandler(async (req, res) => {
      const result = await consent.getInteraction(
        interactionContext(req, res),
        authenticatedUserId(req)
      );
      if (!result.ok) {
        sendConsentError(res, result.error);
        return;
      }
      res.json(result.value);
    })
  );

  router.post(
    '/:uid/second-factor',
    ...stateChanging,
    twoFactorLimiter,
    parseJson,
    asyncHandler(async (req, res) => {
      const parsed = secondFactorSchema.safeParse(req.body);
      if (!parsed.success) {
        sendInvalidRequest(res);
        return;
      }
      const result = await consent.verifySecondFactor(
        interactionContext(req, res),
        authenticatedUserId(req),
        parsed.data
      );
      if (!result.ok) {
        sendConsentError(res, result.error);
        return;
      }
      res.status(204).end();
    })
  );

  router.post(
    '/:uid/approve',
    ...stateChanging,
    parseJson,
    asyncHandler(async (req, res) => {
      const parsed = approveSchema.safeParse(req.body);
      if (!parsed.success) {
        sendInvalidRequest(res);
        return;
      }
      const result = await consent.approve(
        interactionContext(req, res),
        authenticatedUserId(req),
        parsed.data.scopes
      );
      if (!result.ok) {
        sendConsentError(res, result.error);
        return;
      }
      res.json({ redirectTo: result.value.redirectTo });
    })
  );

  router.post(
    '/:uid/deny',
    ...stateChanging,
    asyncHandler(async (req, res) => {
      const result = await consent.deny(interactionContext(req, res), authenticatedUserId(req));
      if (!result.ok) {
        sendConsentError(res, result.error);
        return;
      }
      res.json({ redirectTo: result.value.redirectTo });
    })
  );

  router.use(handleMalformedRequest);
  return router;
}

/**
 * 認可サーバーが載っている環境でだけ、同意の経路を載せる（全体の本文の解析より前に呼ぶ）
 *
 * @param app - Express のアプリ
 * @param mounted - 載せた認可サーバー
 * @param prisma - Prisma クライアント
 */
export function mountExternalAppConsentRoutes(
  app: Express,
  mounted: MountedExternalAppOAuth,
  prisma: PrismaClient
): void {
  const consent = new ConsentInteractionService({
    prisma,
    provider: mounted.provider,
    connectionService: mounted.connectionService,
    secondFactorVerifier: new SecondFactorVerifier(prisma, new TwoFactorService()),
    clientRegistry: mounted.clientRegistry,
    resourceUrl: mounted.resourceUrl,
    getRedis: () => redis.getClient(),
  });
  app.use('/oauth/interaction', createExternalAppRoutes({ consent }));
}

/**
 * 外部アプリ用の窓口の確認用の経路を作る。`/oauth/resource` に載せる
 *
 * - `GET /whoami`（read）: 範囲とアプリ名だけを返す
 * - `GET /whoami/write-access`（write）: 204。読み取りだけの接続は 403
 *
 * @param auth - 窓口の認証・範囲の確認・回数制限
 * @param clientRegistry - 許可するアプリ（表示名を引く）
 * @returns ルーター
 */
export function createExternalAppResourceRoutes(
  auth: ExternalAppAuth,
  clientRegistry: Pick<ExternalAppClientRegistry, 'loadAllowedClients'>
): Router {
  const router = Router();

  router.get('/whoami', ...auth.protect('read'), (req, res) => {
    const principal = getExternalAppPrincipal(req);
    const app = clientRegistry
      .loadAllowedClients()
      .find((client) => client.clientId === principal.clientId);
    res.json({ scopes: principal.scopes, appName: app?.displayName ?? null });
  });

  router.get('/whoami/write-access', ...auth.protect('write'), (_req, res) => {
    res.status(204).end();
  });

  return router;
}

/**
 * 認可サーバーが載っている環境でだけ、外部アプリ用の窓口の確認用の経路を載せる
 *
 * @param app - Express のアプリ
 * @param mounted - 載せた認可サーバー
 */
export function mountExternalAppResourceRoutes(
  app: Express,
  mounted: MountedExternalAppOAuth
): void {
  app.use(
    '/oauth/resource',
    createExternalAppResourceRoutes(mounted.externalAppAuth, mounted.clientRegistry)
  );
}

/** 全利用者の一覧の 1 ページの既定の件数（他の一覧の API と同じ） */
const CONNECTION_LIST_DEFAULT_LIMIT = 20;
/** アプリの client ID の形（表示できる ASCII、255 文字まで。完全一致で絞り込む） */
const CLIENT_ID_FILTER_PATTERN = /^[\x20-\x7e]{1,255}$/;

/** 全利用者の一覧のクエリ（要件49.7）。範囲はサービスの上限（タスク72.2）と同じ */
const adminConnectionListQuerySchema = z
  .object({
    userId: z.uuid({ message: 'userId must be a UUID' }).optional(),
    clientId: z
      .string({ message: 'clientId must be a string' })
      .regex(CLIENT_ID_FILTER_PATTERN, 'clientId must be 1 to 255 printable ASCII characters')
      .optional(),
    page: z.coerce
      .number({ message: 'page must be a number' })
      .int('page must be an integer')
      .min(1, 'page must be at least 1')
      .default(1),
    limit: z.coerce
      .number({ message: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(CONNECTION_LIST_MAX_LIMIT, `limit must be at most ${CONNECTION_LIST_MAX_LIMIT}`)
      .default(CONNECTION_LIST_DEFAULT_LIMIT),
  })
  .refine(({ page, limit }) => (page - 1) * limit <= CONNECTION_LIST_MAX_OFFSET, {
    message: 'page is out of range',
    path: ['page'],
  });

type AdminConnectionListQuery = z.infer<typeof adminConnectionListQuerySchema>;

const connectionIdSchema = z.uuid();

export type ConnectionRouteService = Pick<
  ExternalAppConnectionService,
  'listOwn' | 'listAll' | 'revokeOwn' | 'revokeByAdmin'
>;

export interface ExternalAppConnectionRoutesDeps {
  readonly connections: ConnectionRouteService;
  /** システム管理者の確認（省略時はロール `admin` を DB で確かめる） */
  readonly systemAdminGuard?: RequestHandler;
}

export interface ExternalAppConnectionRouters {
  /** `/api/v1/external-app-connections` に載せる本人用 */
  readonly own: Router;
  /** `/api/v1/admin/external-app-connections` に載せる管理者用 */
  readonly admin: Router;
}

const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

function connectionNotFound(): NotFoundError {
  return new NotFoundError('External app connection not found', 'CONNECTION_NOT_FOUND');
}

/**
 * 取り消しの対象の ID。UUID の形でなければ null（存在しない ID と同じ 404 にし、形の違いで区別させない）
 */
function connectionIdOf(req: Request): string | null {
  const parsed = connectionIdSchema.safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

function requestSource(req: Request) {
  return { ipAddress: getClientIp(req), userAgent: req.get('user-agent') };
}

/**
 * 接続の一覧と取り消しのルーターを作る（タスク77.1）
 *
 * @param deps - 接続の管理とシステム管理者の確認
 * @returns 本人用と管理者用のルーター
 */
export function createExternalAppConnectionRoutes(
  deps: ExternalAppConnectionRoutesDeps
): ExternalAppConnectionRouters {
  const { connections } = deps;
  const systemAdminGuard = deps.systemAdminGuard ?? requireSystemAdmin();

  const own = Router();
  own.use(noStore);

  /**
   * @swagger
   * /api/v1/external-app-connections:
   *   get:
   *     summary: 本人の外部アプリの接続の一覧
   *     description: |
   *       本人の接続ごとに、アプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限を返す（要件49.1）。
   *       期限は実際に使えなくなる時刻（同意から 90 日と、最後の利用（未使用なら同意）から 30 日の早い方）。
   *       許可の一覧から外れたアプリの名称は client ID を返す。並びは同意の新しい順。
   *       画面用のアクセストークンだけを受け付け、外部アプリ用のトークンは 401。Grant の ID とトークンは返さない。
   *       応答は `Cache-Control: no-store`。
   *     tags:
   *       - External App Connections
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: 本人の接続の一覧（無ければ空の配列）
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required: [data]
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/ExternalAppConnection'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         description: パスワードの変更または 2FA の登録が必要（code は PASSWORD_CHANGE_REQUIRED・TWO_FACTOR_SETUP_REQUIRED。要件34.2）
   */
  own.get(
    '/',
    authenticate,
    asyncHandler(async (req, res) => {
      const data = await connections.listOwn(authenticatedUserId(req));
      res.json({ data });
    })
  );

  /**
   * @swagger
   * /api/v1/external-app-connections/{id}:
   *   delete:
   *     summary: 本人の外部アプリの接続の取り消し
   *     description: |
   *       接続と、その接続の全ての外部アプリ用トークンを直ちに使用不能にする（要件49.4）。監査（CONNECTION_ENDED、
   *       理由 USER_REVOKED）に送信元 IP と User-Agent を残す。他の利用者の接続・存在しない ID・UUID でない ID は
   *       同じ 404 で、存在を明かさない（要件49.5）。同時の取り消しでは 1 件だけが 204 で、残りは 404。
   *       CSRF の検証（`X-CSRF-Token` と Cookie `csrf-token` の一致、Origin）を通す。
   *     tags:
   *       - External App Connections
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: 接続の ID
   *       - in: header
   *         name: X-CSRF-Token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: 取り消しの完了
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         description: CSRF の検証の失敗（code は CSRF_TOKEN_MISSING・CSRF_TOKEN_INVALID など）、または利用者の状態による制限（要件34.2）
   *       404:
   *         description: 本人の接続に無い（code は CONNECTION_NOT_FOUND）
   */
  own.delete(
    '/:id',
    authenticate,
    csrfProtection,
    asyncHandler(async (req, res) => {
      const userId = authenticatedUserId(req);
      const connectionId = connectionIdOf(req);
      if (connectionId === null) {
        throw connectionNotFound();
      }
      const result = await connections.revokeOwn(userId, connectionId, {
        userId,
        source: requestSource(req),
      });
      if (!result.ok) {
        throw connectionNotFound();
      }
      res.status(204).end();
    })
  );

  const admin = Router();
  admin.use(noStore);

  /**
   * @swagger
   * /api/v1/admin/external-app-connections:
   *   get:
   *     summary: 全利用者の外部アプリの接続の一覧（システム管理者）
   *     description: |
   *       全利用者の接続を、利用者・アプリの名称と client ID・操作の範囲・同意の日時・最後に使われた日時・期限とともに
   *       返す（要件49.6）。利用者とアプリの完全一致で絞り込み、ページを切り替える（要件49.7）。並びは同意の新しい順。
   *       ロール admin を DB で確かめ、持たない利用者は権限（`*:*` を含む）があっても 403（要件49.9）。
   *       応答は `Cache-Control: no-store`。Grant の ID とトークンは返さない。
   *     tags:
   *       - External App Connections
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: userId
   *         schema:
   *           type: string
   *           format: uuid
   *         description: 利用者の ID（完全一致）
   *       - in: query
   *         name: clientId
   *         schema:
   *           type: string
   *           minLength: 1
   *           maxLength: 255
   *         description: アプリの client ID（完全一致）
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *         description: ページ番号（読み飛ばす行数 (page - 1) × limit は 2147483647 まで）
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: 1 ページの件数
   *     responses:
   *       200:
   *         description: 接続のページ
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               required: [data, pagination]
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     allOf:
   *                       - $ref: '#/components/schemas/ExternalAppConnection'
   *                       - type: object
   *                         required: [clientId, user]
   *                         properties:
   *                           clientId:
   *                             type: string
   *                           user:
   *                             type: object
   *                             required: [id, displayName, email]
   *                             properties:
   *                               id:
   *                                 type: string
   *                               displayName:
   *                                 type: string
   *                               email:
   *                                 type: string
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     page:
   *                       type: integer
   *                     limit:
   *                       type: integer
   *                     total:
   *                       type: integer
   *                     totalPages:
   *                       type: integer
   *       400:
   *         description: クエリの不正（code は VALIDATION_ERROR）
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         description: システム管理者でない（code は SYSTEM_ADMIN_REQUIRED）、または利用者の状態による制限（要件34.2）
   */
  admin.get(
    '/',
    authenticate,
    systemAdminGuard,
    validate(adminConnectionListQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as AdminConnectionListQuery;
      res.json(
        await connections.listAll({
          page: query.page,
          limit: query.limit,
          ...(query.userId !== undefined ? { userId: query.userId } : {}),
          ...(query.clientId !== undefined ? { clientId: query.clientId } : {}),
        })
      );
    })
  );

  /**
   * @swagger
   * /api/v1/admin/external-app-connections/{id}:
   *   delete:
   *     summary: 外部アプリの接続の取り消し（システム管理者）
   *     description: |
   *       接続と、その接続の全ての外部アプリ用トークンを直ちに使用不能にする（要件49.8）。監査（CONNECTION_ENDED、
   *       理由 ADMIN_REVOKED）に実行者の管理者・送信元 IP・User-Agent を残す。ロール admin を持たない利用者は、
   *       接続の有無にかかわらず 403（要件49.9）。存在しない ID と UUID でない ID は 404。
   *       CSRF の検証（`X-CSRF-Token` と Cookie `csrf-token` の一致、Origin）を通す。
   *     tags:
   *       - External App Connections
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: 接続の ID
   *       - in: header
   *         name: X-CSRF-Token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: 取り消しの完了
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         description: システム管理者でない（code は SYSTEM_ADMIN_REQUIRED）、CSRF の検証の失敗、または利用者の状態による制限
   *       404:
   *         description: 接続が無い（code は CONNECTION_NOT_FOUND）
   */
  admin.delete(
    '/:id',
    authenticate,
    systemAdminGuard,
    csrfProtection,
    asyncHandler(async (req, res) => {
      const connectionId = connectionIdOf(req);
      if (connectionId === null) {
        throw connectionNotFound();
      }
      const result = await connections.revokeByAdmin(connectionId, {
        userId: authenticatedUserId(req),
        source: requestSource(req),
      });
      if (!result.ok) {
        throw connectionNotFound();
      }
      res.status(204).end();
    })
  );

  return { own, admin };
}

/**
 * 接続の一覧と取り消しの経路を載せる（タスク77.1）
 *
 * 認可サーバーの有無にかかわらず載せる。既にある接続を利用者と管理者が確かめて止める経路であり、
 * 認可サーバーの設定を要しないためである（設定が無い環境では、表示名は client ID になる）。
 *
 * @param app - Express のアプリ
 * @param connections - 接続の管理
 */
export function mountExternalAppConnectionRoutes(
  app: Express,
  connections: ConnectionRouteService
): void {
  const routers = createExternalAppConnectionRoutes({ connections });
  app.use('/api/v1/external-app-connections', routers.own);
  app.use('/api/v1/admin/external-app-connections', routers.admin);
}
