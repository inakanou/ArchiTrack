/**
 * @fileoverview 認証ミドルウェアの利用者の状態の照合の単体テスト（user-authentication タスク47.6）
 *
 * design.md「利用者の状態の照合」の表に従い、アクセストークンの検証の後に利用者の状態で要求を拒否する。
 * - 無効化（Deactivated）: 全ての要求を 401 `ACCOUNT_DISABLED`（要件36.1）
 * - 初回のパスワード変更中（PasswordChangeRequired）: パスワード変更・ログアウト以外を 403
 *   `PASSWORD_CHANGE_REQUIRED`（要件37.7、34.2 の例外）
 * - 2FA 未登録（TwoFactorSetupRequired）: 2FA の設定・有効化・ログアウト以外を 403
 *   `TWO_FACTOR_SETUP_REQUIRED`（要件34.2。`GET /api/v1/auth/me` も拒否する）
 * - 利用者の不在: 401（削除の直後のトークンを通さない）
 * - 状態の取得の失敗: 認証の失敗にせずエラーハンドラーへ渡す
 *
 * @requirement user-authentication/REQ-34.2
 * @requirement user-authentication/REQ-36.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  resolveUserStateRestriction,
} from '../../../middleware/authenticate.middleware.js';
import type { TokenService } from '../../../services/token.service.js';
import type { AuthenticatedUserState } from '../../../services/authenticated-user-state.service.js';
import { ForbiddenError } from '../../../errors/apiError.js';
import { Ok } from '../../../types/result.js';

// シングルトンの TokenService（鍵の環境変数を要する）を読み込ませない。トークンの検証はモックを注入する
vi.mock('../../../services/token.service');

const ACTIVE: AuthenticatedUserState = {
  isActive: true,
  twoFactorEnabled: true,
  mustChangePassword: false,
  accessTokenGeneration: 0,
};
const TWO_FACTOR_NOT_ENROLLED: AuthenticatedUserState = { ...ACTIVE, twoFactorEnabled: false };
const PASSWORD_CHANGE_REQUIRED: AuthenticatedUserState = {
  isActive: true,
  twoFactorEnabled: false,
  mustChangePassword: true,
  accessTokenGeneration: 0,
};
const DEACTIVATED: AuthenticatedUserState = { ...ACTIVE, isActive: false };

const payload = { userId: 'user-state-1', email: 'state@example.com', roles: ['user'] };

describe('authenticate middleware（利用者の状態の照合）', () => {
  let tokenService: TokenService;
  let getState: ReturnType<
    typeof vi.fn<(userId: string) => Promise<AuthenticatedUserState | null>>
  >;
  let response: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokenService = {
      verifyToken: vi.fn().mockResolvedValue(Ok(payload)),
    } as unknown as TokenService;
    getState = vi.fn<(userId: string) => Promise<AuthenticatedUserState | null>>();
    response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  /** マウント位置（baseUrl）とパスを持つ要求で、ミドルウェアを通す */
  async function call(
    state: AuthenticatedUserState | null | Error,
    method: string,
    baseUrl: string,
    path: string
  ): Promise<Request> {
    if (state instanceof Error) {
      getState.mockRejectedValue(state);
    } else {
      getState.mockResolvedValue(state);
    }
    const request = {
      headers: { authorization: 'Bearer valid-access-token' },
      method,
      baseUrl,
      path,
    } as unknown as Request;
    await createAuthMiddleware(tokenService, { getState })(
      request,
      response as Response,
      next as unknown as NextFunction
    );
    return request;
  }

  /** next に渡された 403 の状態のエラーのコード（渡されていなければ null） */
  function forbiddenCode(): string | null {
    const arg = next.mock.calls[0]?.[0] as unknown;
    if (!(arg instanceof ForbiddenError)) {
      return null;
    }
    expect(arg.statusCode).toBe(403);
    return arg.code ?? null;
  }

  it('有効で 2FA 登録済みの利用者は全ての要求を通し、req.user を設定する', async () => {
    const request = await call(ACTIVE, 'GET', '/api/projects', '/');

    expect(getState).toHaveBeenCalledWith(payload.userId);
    expect(next).toHaveBeenCalledWith();
    expect(request.user).toEqual(payload);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('無効化された利用者は、ログアウトを含む全ての要求を 401 ACCOUNT_DISABLED で拒否する（要件36.1）', async () => {
    for (const [method, baseUrl, path] of [
      ['GET', '/api/v1/auth', '/me'],
      ['POST', '/api/v1/auth', '/logout'],
      ['POST', '/api/v1/auth', '/password/change'],
      ['GET', '/api/projects', '/'],
    ] as const) {
      vi.mocked(response.status as ReturnType<typeof vi.fn>).mockClear();
      vi.mocked(response.json as ReturnType<typeof vi.fn>).mockClear();
      next.mockClear();

      const request = await call(DEACTIVATED, method, baseUrl, path);

      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith({
        error: 'ACCOUNT_DISABLED',
        code: 'ACCOUNT_DISABLED',
        message: 'Account is disabled',
      });
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer realm="ArchiTrack", error="invalid_token"'
      );
      expect(next).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    }
  });

  it('2FA 未登録の利用者は /me と業務の API を 403 TWO_FACTOR_SETUP_REQUIRED で拒否する（要件34.2）', async () => {
    for (const [method, baseUrl, path] of [
      ['GET', '/api/v1/auth', '/me'],
      ['PATCH', '/api/v1/auth', '/me'],
      ['GET', '/api/projects', '/'],
      ['POST', '/api/v1/auth', '/password/change'],
      ['GET', '/api/v1/auth/sessions', '/'],
      ['POST', '/api/v1/auth', '/2fa/backup-codes/regenerate'],
    ] as const) {
      next.mockClear();

      const request = await call(TWO_FACTOR_NOT_ENROLLED, method, baseUrl, path);

      expect(forbiddenCode()).toBe('TWO_FACTOR_SETUP_REQUIRED');
      expect(request.user).toBeUndefined();
    }
  });

  it('2FA 未登録の利用者に 2FA の設定・有効化とログアウトを許す（要件34.2）', async () => {
    for (const path of ['/2fa/setup', '/2fa/enable', '/logout', '/logout-all', '/logout/']) {
      next.mockClear();

      const request = await call(TWO_FACTOR_NOT_ENROLLED, 'POST', '/api/v1/auth', path);

      expect(next).toHaveBeenCalledWith();
      expect(request.user).toEqual(payload);
    }
  });

  it('初回のパスワード変更を要する利用者はパスワード変更とログアウトだけを許し、2FA の設定も 403 PASSWORD_CHANGE_REQUIRED で拒否する（要件37.7・34.2）', async () => {
    for (const path of ['/password/change', '/logout', '/logout-all']) {
      next.mockClear();
      const request = await call(PASSWORD_CHANGE_REQUIRED, 'POST', '/api/v1/auth', path);
      expect(next).toHaveBeenCalledWith();
      expect(request.user).toEqual(payload);
    }

    for (const [method, path] of [
      ['GET', '/me'],
      ['POST', '/2fa/setup'],
      ['POST', '/2fa/enable'],
    ] as const) {
      next.mockClear();
      const request = await call(PASSWORD_CHANGE_REQUIRED, method, '/api/v1/auth', path);
      expect(forbiddenCode()).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(request.user).toBeUndefined();
    }
  });

  it('許可の経路はメソッドまで一致したときだけ許す（GET の /password/change は拒否する）', async () => {
    await call(PASSWORD_CHANGE_REQUIRED, 'GET', '/api/v1/auth', '/password/change');

    expect(forbiddenCode()).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('利用者が存在しない（削除済み）ときは 401 で拒否する', async () => {
    const request = await call(null, 'GET', '/api/v1/auth', '/me');

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('状態の取得の失敗は認証の失敗にせず、エラーハンドラーへ渡す', async () => {
    const failure = new Error('database is unavailable');

    const request = await call(failure, 'GET', '/api/projects', '/');

    expect(next).toHaveBeenCalledWith(failure);
    expect(response.status).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('アクセストークンの検証に失敗した要求では状態を読まない', async () => {
    vi.mocked(tokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: { type: 'TOKEN_INVALID' },
    });

    await call(ACTIVE, 'GET', '/api/projects', '/');

    expect(getState).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });
});

describe('resolveUserStateRestriction', () => {
  it('初回のパスワード変更の要否を 2FA 未登録より優先する', () => {
    expect(
      resolveUserStateRestriction(PASSWORD_CHANGE_REQUIRED, 'POST /api/v1/auth/2fa/setup')
    ).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(
      resolveUserStateRestriction(TWO_FACTOR_NOT_ENROLLED, 'POST /api/v1/auth/2fa/setup')
    ).toBeNull();
  });

  it('有効で 2FA 登録済みの利用者には制限が無い', () => {
    expect(resolveUserStateRestriction(ACTIVE, 'GET /api/v1/auth/me')).toBeNull();
  });
});
