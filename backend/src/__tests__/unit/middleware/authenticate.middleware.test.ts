/**
 * @fileoverview 認証ミドルウェアの単体テスト
 *
 * Requirements:
 * - 5.4: 保護されたAPIエンドポイントにアクセスする際、有効なアクセストークンを検証
 * - 5.5: アクセストークンが改ざんされている場合、リクエストを拒否
 * - 16.1: Authorizationヘッダーからトークンを抽出
 * - 16.2: EdDSA署名を検証
 * - 16.18: req.userにユーザー情報を設定
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../middleware/authenticate.middleware.js';
import { TokenService } from '../../../services/token.service.js';
import { Ok, Err } from '../../../types/result.js';

// TokenServiceのモック
vi.mock('../../../services/token.service');

describe('authenticate middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockTokenService: TokenService;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn() as unknown as NextFunction;

    // TokenServiceのモックインスタンス
    mockTokenService = {
      verifyToken: vi.fn(),
    } as unknown as TokenService;

    vi.clearAllMocks();
  });

  describe('トークン抽出', () => {
    it('Authorizationヘッダーからトークンを抽出する', async () => {
      const token = 'valid-token-123';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(mockPayload));

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockTokenService.verifyToken).toHaveBeenCalledWith(token, 'access');
      expect(mockRequest.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('Bearer prefixなしのトークンを拒否する', async () => {
      mockRequest.headers = {
        authorization: 'invalid-format-token',
      };

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Authorizationヘッダーがない場合はエラーを返す', async () => {
      mockRequest.headers = {};

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('空のトークンを拒否する', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('スペースのみのトークンを拒否する', async () => {
      mockRequest.headers = {
        authorization: 'Bearer    ',
      };

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('トークン検証', () => {
    it('有効なトークンでreq.userを設定する', async () => {
      const token = 'valid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user', 'admin'],
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(mockPayload));

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual(mockPayload);
      expect(mockRequest.user?.userId).toBe('user-123');
      expect(mockRequest.user?.email).toBe('test@example.com');
      expect(mockRequest.user?.roles).toEqual(['user', 'admin']);
      expect(mockNext).toHaveBeenCalled();
    });

    it('無効なトークンでエラーを返す', async () => {
      const token = 'invalid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'TOKEN_INVALID' })
      );

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('期限切れトークンでエラーを返す', async () => {
      const token = 'expired-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'TOKEN_EXPIRED' })
      );

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('改ざんされたトークンでエラーを返す', async () => {
      const token = 'tampered-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'TOKEN_INVALID' })
      );

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('予期しないエラーを適切にハンドリングする', async () => {
      const token = 'some-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      (mockTokenService.verifyToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Unexpected error')
      );

      const middleware = createAuthMiddleware(mockTokenService);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    });
  });
});
