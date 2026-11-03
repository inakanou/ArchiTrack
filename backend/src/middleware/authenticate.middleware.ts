/**
 * @fileoverview JWT認証ミドルウェア
 *
 * Requirements (user-authentication):
 * - REQ-5.4: 保護されたAPIエンドポイントにアクセスする際、有効なアクセストークンを検証
 * - REQ-5.5: アクセストークンが改ざんされている場合、リクエストを拒否
 * - REQ-16.1: Authorizationヘッダーからトークンを抽出
 * - REQ-16.2: EdDSA署名を検証
 * - REQ-16.18: 401レスポンスにWWW-Authenticateヘッダーを含める, req.userにユーザー情報を設定
 * - REQ-34.2: 2FA 未登録の利用者の、2FA の設定とログアウト以外の要求を 403 で拒否
 *   （初回のパスワード変更を要する利用者はパスワード変更とログアウトだけを許す。要件37.7）
 * - REQ-34.7: 管理者による 2FA の再設定より前に発行されたアクセストークン（世代 `gen` が利用者の世代より
 *   小さいもの）を、状態の表の照合より前に、署名の不正なトークンと同じ 401 で拒否
 * - REQ-36.1: 無効化された利用者の要求を 401 で拒否
 *
 * 利用者の状態の照合（design.md「利用者の状態の照合」）はアクセストークンの検証の後、権限の判定
 * （requirePermission）より前に行う。状態は AuthenticatedUserStateService（Redis のキャッシュ経由）から読む。
 */

import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.js';
import tokenServiceInstance from '../services/token.service.js';
import {
  getSharedAuthenticatedUserStateService,
  type AuthenticatedUserState,
  type AuthenticatedUserStateService,
} from '../services/authenticated-user-state.service.js';
import { ForbiddenError } from '../errors/apiError.js';

/**
 * 利用者の状態による制限のエラーコード（403。design.md「利用者の状態の照合」）
 */
export const USER_STATE_RESTRICTION_CODES = {
  /** 初回のパスワード変更を要する（要件37.7、34.2 の例外） */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** 2FA 未登録（要件34.2） */
  TWO_FACTOR_SETUP_REQUIRED: 'TWO_FACTOR_SETUP_REQUIRED',
} as const;

/** 無効化された利用者の要求のエラーコード（401。要件36.1） */
export const ACCOUNT_DISABLED_CODE = 'ACCOUNT_DISABLED';

/** ログアウトの経路（どの制限の状態でも許す） */
const LOGOUT_ROUTES: readonly string[] = [
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/logout-all',
];

/** 初回のパスワード変更を要する利用者に許す経路 */
const PASSWORD_CHANGE_REQUIRED_ROUTES: ReadonlySet<string> = new Set([
  'POST /api/v1/auth/password/change',
  ...LOGOUT_ROUTES,
]);

/** 2FA 未登録の利用者に許す経路 */
const TWO_FACTOR_SETUP_REQUIRED_ROUTES: ReadonlySet<string> = new Set([
  'POST /api/v1/auth/2fa/setup',
  'POST /api/v1/auth/2fa/enable',
  ...LOGOUT_ROUTES,
]);

/**
 * 要求の経路を「メソッド 完全なパス」で表す（ルーターのマウント位置を含め、末尾の / を除く）
 */
function routeKeyOf(req: Request): string {
  const fullPath = `${req.baseUrl ?? ''}${req.path ?? ''}`;
  const normalized = fullPath.length > 1 ? fullPath.replace(/\/+$/, '') : fullPath;
  return `${req.method} ${normalized}`;
}

/**
 * 利用者の状態から、要求を拒否する制限を決める（優先順位: 初回のパスワード変更 → 2FA 未登録）
 *
 * 無効化（Deactivated）は呼び出し側で先に 401 にする。
 *
 * @returns 拒否するときはエラーコード、許すときは null
 */
export function resolveUserStateRestriction(
  state: AuthenticatedUserState,
  routeKey: string
): (typeof USER_STATE_RESTRICTION_CODES)[keyof typeof USER_STATE_RESTRICTION_CODES] | null {
  if (state.mustChangePassword) {
    return PASSWORD_CHANGE_REQUIRED_ROUTES.has(routeKey)
      ? null
      : USER_STATE_RESTRICTION_CODES.PASSWORD_CHANGE_REQUIRED;
  }
  if (!state.twoFactorEnabled) {
    return TWO_FACTOR_SETUP_REQUIRED_ROUTES.has(routeKey)
      ? null
      : USER_STATE_RESTRICTION_CODES.TWO_FACTOR_SETUP_REQUIRED;
  }
  return null;
}

/** 状態の制限ごとの 403 の本文の説明 */
const RESTRICTION_MESSAGES: Record<
  (typeof USER_STATE_RESTRICTION_CODES)[keyof typeof USER_STATE_RESTRICTION_CODES],
  string
> = {
  PASSWORD_CHANGE_REQUIRED: 'Password change is required before using other features',
  TWO_FACTOR_SETUP_REQUIRED:
    'Two-factor authentication setup is required before using other features',
};

/** 利用者の状態の取得（テストで差し替えられる） */
type UserStateReader = Pick<AuthenticatedUserStateService, 'getState'>;

/**
 * WWW-Authenticateヘッダー値を生成
 * @requirement user-authentication/REQ-16.18: Bearer realm="ArchiTrack", error="..." 形式
 */
function getWwwAuthenticateHeader(
  error: 'missing_token' | 'invalid_token' | 'expired_token'
): string {
  return `Bearer realm="ArchiTrack", error="${error}"`;
}

/**
 * 不正なトークンの 401（署名の不正・利用者の不在・世代の不一致で同じ応答にする）
 */
function respondInvalidToken(res: Response): void {
  res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
  res.status(401).json({
    error: 'INVALID_TOKEN',
    message: 'Invalid or expired token',
  });
}

/**
 * JWT認証ミドルウェアファクトリー
 *
 * TokenServiceを注入可能な認証ミドルウェアを生成します。
 * テスト時にモックのTokenServiceを使用する場合に便利です。
 *
 * @param tokenService - TokenServiceインスタンス（オプション、デフォルトはシングルトン）
 * @param userStateService - 利用者の状態の取得（オプション、デフォルトは共有のインスタンスを要求の時点で解決）
 * @returns Express ミドルウェア関数
 */
export function createAuthMiddleware(
  tokenService?: TokenService,
  userStateService?: UserStateReader
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Authorizationヘッダーからトークンを抽出
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('missing_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      // "Bearer {token}" 形式のチェック
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      const token = parts[1];

      // 空のトークンチェック
      if (!token || token.trim() === '') {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('missing_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      // TokenServiceインスタンスを取得（テスト時は注入されたものを使用、デフォルトはシングルトン）
      const service = tokenService || tokenServiceInstance;

      // トークンを検証（種別 access だけを受け付け、発行者・想定利用者も確かめる）
      const result = await service.verifyToken(token, 'access');

      // 検証結果をチェック
      if (!result.ok) {
        if (result.error.type === 'TOKEN_EXPIRED') {
          res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('expired_token'));
          res.status(401).json({
            error: 'TOKEN_EXPIRED',
            message: 'Token has expired',
          });
          return;
        }

        respondInvalidToken(res);
        return;
      }

      // 利用者の状態の照合（design.md「利用者の状態の照合」）。状態の取得の失敗（DB の障害など）は
      // 認証の失敗として扱わず、エラーハンドラー（500、接続のタイムアウトは 503）へ渡す
      let state: AuthenticatedUserState | null;
      try {
        state = await (userStateService ?? getSharedAuthenticatedUserStateService()).getState(
          result.value.userId
        );
      } catch (error) {
        next(error);
        return;
      }

      // 利用者の不在（削除済み）: 署名の正しいトークンでも受け付けない
      if (!state) {
        respondInvalidToken(res);
        return;
      }

      // 要件34.7: 管理者による 2FA の再設定より前に発行されたアクセストークンは、状態の表の照合より前に
      // 署名の不正なトークンと同じ 401 で拒否する（2FA の設定の経路も通さない）。世代を持たないトークンは 0
      const tokenGeneration = result.value.accessTokenGeneration ?? 0;
      if (tokenGeneration < state.accessTokenGeneration) {
        respondInvalidToken(res);
        return;
      }

      // 要件36.1: 無効化された利用者は全ての要求を 401 で拒否する
      if (!state.isActive) {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
        res.status(401).json({
          error: ACCOUNT_DISABLED_CODE,
          code: ACCOUNT_DISABLED_CODE,
          message: 'Account is disabled',
        });
        return;
      }

      // 要件34.2・37.7: 初回のパスワード変更中・2FA 未登録は許可の経路の表に無い要求を 403 で拒否する
      const restriction = resolveUserStateRestriction(state, routeKeyOf(req));
      if (restriction) {
        next(new ForbiddenError(RESTRICTION_MESSAGES[restriction], restriction));
        return;
      }

      // req.userにユーザー情報を設定
      req.user = {
        userId: result.value.userId,
        email: result.value.email,
        roles: result.value.roles,
      };

      // 次のミドルウェアへ
      next();
    } catch {
      // 予期しないエラーをハンドリング
      respondInvalidToken(res);
    }
  };
}

/**
 * デフォルトの認証ミドルウェア
 *
 * シングルトンのTokenServiceを使用する標準的な認証ミドルウェアです。
 */
export const authenticate = createAuthMiddleware();
