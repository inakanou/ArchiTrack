/**
 * @fileoverview 認証ミドルウェアのアクセストークンの世代の照合の単体テスト（user-authentication タスク47.11）
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 管理者による 2FA の再設定より前に発行されたアクセストークンによる以後の要求を拒否する
 *
 * 実際の TokenService（テスト用の鍵）で発行したトークンを渡し、発行時の世代（クレーム `gen`）が利用者の
 * 世代より小さいトークンが、状態の表の照合より前に、署名の不正なトークンと同じ 401 になることを確かめる。
 * `gen` を持たないトークン（世代の導入より前に発行されたもの）は世代 0 として扱う。
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as jose from 'jose';
import type { CryptoKey } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../middleware/authenticate.middleware.js';
import { TokenService } from '../../../services/token.service.js';
import type { AuthenticatedUserState } from '../../../services/authenticated-user-state.service.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from '../../../config/jwt-claims.js';
import { ForbiddenError } from '../../../errors/apiError.js';

const USER = { userId: 'user-gen-1', email: 'gen@example.com', roles: ['user'] };

/** 2FA を登録済みの有効な利用者の状態 */
function enrolledState(accessTokenGeneration: number): AuthenticatedUserState {
  return {
    isActive: true,
    twoFactorEnabled: true,
    mustChangePassword: false,
    accessTokenGeneration,
  };
}

/** 管理者が 2FA を再設定した直後の利用者の状態（2FA 未登録） */
function resetState(accessTokenGeneration: number): AuthenticatedUserState {
  return {
    isActive: true,
    twoFactorEnabled: false,
    mustChangePassword: false,
    accessTokenGeneration,
  };
}

interface CapturedResponse {
  status: number | undefined;
  headers: Record<string, string>;
  body: unknown;
  nextArgs: unknown[] | undefined;
  user: Request['user'];
}

describe('authenticate middleware（アクセストークンの世代）', () => {
  let tokenService: TokenService;
  let privateKey: CryptoKey;

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

  /**
   * ミドルウェアを 1 回呼び、応答・next の引数・req.user を記録する
   */
  async function call(
    token: string,
    state: AuthenticatedUserState,
    route: { method: string; baseUrl: string; path: string }
  ): Promise<CapturedResponse> {
    const captured: CapturedResponse = {
      status: undefined,
      headers: {},
      body: undefined,
      nextArgs: undefined,
      user: undefined,
    };
    const request = {
      headers: { authorization: `Bearer ${token}` },
      ...route,
    } as unknown as Request;
    const response = {
      status: vi.fn((code: number) => {
        captured.status = code;
        return response;
      }),
      json: vi.fn((body: unknown) => {
        captured.body = body;
        return response;
      }),
      setHeader: vi.fn((name: string, value: string) => {
        captured.headers[name] = value;
        return response;
      }),
    } as unknown as Response;
    const next = vi.fn((...args: unknown[]) => {
      captured.nextArgs = args;
    }) as unknown as NextFunction;

    await createAuthMiddleware(tokenService, { getState: async () => state })(
      request,
      response,
      next
    );
    captured.user = request.user;
    return captured;
  }

  /** `gen` を持たない（世代の導入より前の形の）アクセストークンを、同じ鍵とクレームで発行する */
  async function legacyAccessTokenWithoutGen(): Promise<string> {
    return new jose.SignJWT({
      userId: USER.userId,
      email: USER.email,
      roles: USER.roles,
      token_use: 'access',
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
      .setSubject(USER.userId)
      .setIssuer(process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER)
      .setAudience(process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
  }

  /** 署名を壊したアクセストークン（署名の不正の 401 の基準） */
  async function tamperedAccessToken(): Promise<string> {
    const token = await tokenService.generateAccessToken({ ...USER, accessTokenGeneration: 5 });
    const [header, payload, signature] = token.split('.');
    const flipped = signature!.startsWith('A')
      ? `B${signature!.slice(1)}`
      : `A${signature!.slice(1)}`;
    return `${header}.${payload}.${flipped}`;
  }

  const SETUP = { method: 'POST', baseUrl: '/api/v1/auth', path: '/2fa/setup' };
  const ENABLE = { method: 'POST', baseUrl: '/api/v1/auth', path: '/2fa/enable' };
  const OTHER = { method: 'GET', baseUrl: '/api/v1/projects', path: '/' };

  it('世代が利用者の世代より小さいトークンは、署名の不正なトークンと同じ 401 になる（2FA の設定・有効化・他の API）', async () => {
    const tampered = await call(await tamperedAccessToken(), resetState(1), SETUP);
    expect(tampered.status).toBe(401);
    expect(tampered.body).toEqual({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    expect(tampered.headers).toEqual({
      'WWW-Authenticate': 'Bearer realm="ArchiTrack", error="invalid_token"',
    });

    const before = await tokenService.generateAccessToken({ ...USER, accessTokenGeneration: 0 });
    for (const route of [SETUP, ENABLE, OTHER]) {
      const rejected = await call(before, resetState(1), route);
      expect(rejected.status).toBe(tampered.status);
      expect(rejected.body).toEqual(tampered.body);
      expect(rejected.headers).toEqual(tampered.headers);
      expect(rejected.nextArgs).toBeUndefined();
      expect(rejected.user).toBeUndefined();
    }
  });

  it('世代の照合は状態の表より前に行う（無効化された利用者でも ACCOUNT_DISABLED でなく同じ 401）', async () => {
    const before = await tokenService.generateAccessToken({ ...USER, accessTokenGeneration: 2 });

    const rejected = await call(before, { ...enrolledState(3), isActive: false }, OTHER);

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  });

  it('再設定の後に発行された（世代の等しい）トークンは、2FA 未登録として 2FA の設定だけを許す', async () => {
    const after = await tokenService.generateAccessToken({ ...USER, accessTokenGeneration: 1 });

    const setup = await call(after, resetState(1), SETUP);
    expect(setup.status).toBeUndefined();
    expect(setup.nextArgs).toEqual([]);
    expect(setup.user).toEqual({ userId: USER.userId, email: USER.email, roles: USER.roles });

    const other = await call(after, resetState(1), OTHER);
    expect(other.status).toBeUndefined();
    expect(other.nextArgs?.[0]).toBeInstanceOf(ForbiddenError);
    expect((other.nextArgs?.[0] as ForbiddenError).code).toBe('TWO_FACTOR_SETUP_REQUIRED');
  });

  it('世代が利用者の世代より大きいトークンは世代の照合で拒否しない', async () => {
    const token = await tokenService.generateAccessToken({ ...USER, accessTokenGeneration: 4 });

    const passed = await call(token, enrolledState(3), OTHER);

    expect(passed.status).toBeUndefined();
    expect(passed.nextArgs).toEqual([]);
  });

  it('gen を持たない既存のトークンは世代 0 として扱い、世代 0 の利用者で通り、世代 1 の利用者で 401 になる', async () => {
    const legacy = await legacyAccessTokenWithoutGen();

    const passed = await call(legacy, enrolledState(0), OTHER);
    expect(passed.status).toBeUndefined();
    expect(passed.nextArgs).toEqual([]);
    expect(passed.user).toEqual({ userId: USER.userId, email: USER.email, roles: USER.roles });

    const rejected = await call(legacy, resetState(1), SETUP);
    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  });
});
