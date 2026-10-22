/**
 * @fileoverview 認証ミドルウェアがアクセストークンだけを受け付けることの単体テスト
 *
 * 実際の TokenService（テスト用の鍵）で発行したトークンを Authorization ヘッダーで渡し、
 * 種別・発行者・想定利用者の検証がミドルウェアの判定に届くことを確かめる（要件33.1〜33.3）。
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as jose from 'jose';
import type { CryptoKey } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../middleware/authenticate.middleware.js';
import { TokenService } from '../../../services/token.service.js';

/**
 * 有効で 2FA 登録済みの利用者の状態（状態の照合を通る。照合そのものは authenticate.user-state.test.ts で確かめる）
 */
const activeUserState = {
  getState: async () => ({
    isActive: true,
    twoFactorEnabled: true,
    mustChangePassword: false,
    accessTokenGeneration: 0,
  }),
};

describe('authenticate middleware（トークンの種別）', () => {
  let tokenService: TokenService;
  let privateKey: CryptoKey;
  let request: Partial<Request>;
  let response: Partial<Response>;
  let next: NextFunction;

  const user = { userId: 'user-kind-1', email: 'kind@example.com', roles: ['user'] };

  beforeAll(async () => {
    const keyPair = await jose.generateKeyPair('EdDSA', { extractable: true });
    privateKey = keyPair.privateKey as CryptoKey;
    process.env.JWT_PUBLIC_KEY = Buffer.from(
      JSON.stringify(await jose.exportJWK(keyPair.publicKey))
    ).toString('base64');
    process.env.JWT_PRIVATE_KEY = Buffer.from(
      JSON.stringify(await jose.exportJWK(keyPair.privateKey))
    ).toString('base64');
    tokenService = new TokenService();
  });

  beforeEach(() => {
    request = { headers: {} };
    response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn().mockReturnThis(),
    };
    next = vi.fn() as unknown as NextFunction;
  });

  async function callWithBearer(token: string): Promise<void> {
    request.headers = { authorization: `Bearer ${token}` };
    await createAuthMiddleware(tokenService, activeUserState)(
      request as Request,
      response as Response,
      next
    );
  }

  function expectInvalidToken(): void {
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer realm="ArchiTrack", error="invalid_token"'
    );
    expect(response.json).toHaveBeenCalledWith({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  }

  it('アクセストークンを受け付け、req.user を設定する（対照）', async () => {
    const accessToken = await tokenService.generateAccessToken({
      ...user,
      accessTokenGeneration: 0,
    });

    await callWithBearer(accessToken);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect(request.user).toEqual(user);
  });

  it('リフレッシュトークンを Bearer で送った保護 API は 401 になる', async () => {
    const refreshToken = await tokenService.generateRefreshToken(user.userId, 'family-1');

    await callWithBearer(refreshToken);

    expectInvalidToken();
  });

  it('種別を持たないトークン（種別の導入より前の形）は 401 になる', async () => {
    const legacy = await new jose.SignJWT({ ...user })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    await callWithBearer(legacy);

    expectInvalidToken();
  });

  /**
   * @requirement user-authentication/REQ-33.3: 発行者・想定利用者が本システムでないトークンを保護 API で拒否する
   */
  it.each([
    ['発行者が異なる', 'other-issuer', 'architrack-api'],
    ['想定利用者が異なる', 'architrack', 'other-api'],
  ])('%s アクセストークンは 401 になる', async (_label, issuer, audience) => {
    const foreign = await new jose.SignJWT({ ...user, token_use: 'access' })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    await callWithBearer(foreign);

    expectInvalidToken();
  });
});
