/**
 * @fileoverview 外部アプリの接続の同意の API（user-authentication タスク 74.3）
 *
 * - `GET /oauth/interaction/:uid` は認証なしで、形を検証した `uid` だけから画面の相対パスへ転送する
 * - その下の API は画面用のアクセストークンと手続きの Cookie を要する。Cookie の Path は同意の URL なので
 *   この経路の下にだけ届く
 * - 本文は認証と CSRF の検証の後に、この経路の小さな上限で解析する（全体の `express.json` より前に載せる）
 * - 再開の URL は認可サーバーが発行者の値で作ったものを返す。要求の Host と転送ヘッダーを使わない
 * - 応答とログに 2FA のコードや要求の値を含めない（要件48.8）
 *
 * Design: Requirements 46-51 > ExternalAppRoutes
 *
 * @requirement user-authentication/REQ-46.2
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-46.7
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.3
 * @requirement user-authentication/REQ-47.11
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
import { rateLimiters } from '../middleware/rateLimit.middleware.js';
import { OAUTH_ERROR_PAGE, type MountedExternalAppOAuth } from '../oauth/provider.js';
import redis from '../redis.js';
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
