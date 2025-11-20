/**
 * @fileoverview 権限チェックミドルウェアの単体テスト
 *
 * Requirements:
 * - 21.1, 21.2, 21.7: 権限チェック機能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { RBACService } from '../../../services/rbac.service.js';

describe('requirePermission middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockRBACService: RBACService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    // リクエストモック
    mockRequest = {
      user: {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['developer'],
      },
      ip: '127.0.0.1',
      get: vi.fn((header: string) => {
        if (header === 'user-agent') return 'test-agent';
        return undefined;
      }) as Request['get'],
    };

    // レスポンスモック
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // next関数モック
    mockNext = vi.fn();

    // Prismaモック
    mockPrisma = {
      auditLog: {
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    // RBACServiceモック
    mockRBACService = {
      hasPermission: vi.fn(),
    } as unknown as RBACService;
  });

  describe('権限チェック成功', () => {
    it('ユーザーが必要な権限を持っている場合は次のミドルウェアに進む', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(true);
      const middleware = requirePermission('adr:read', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'adr:read');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('ユーザーが*:*権限を持っている場合は全ての権限チェックを通過する', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(true);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'adr:delete');
      expect(mockNext).toHaveBeenCalled();
    });

    it('ユーザーがワイルドカード権限(*:read)を持っている場合は該当権限を通過する', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(true);
      const middleware = requirePermission('user:read', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'user:read');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('権限チェック失敗', () => {
    it('ユーザーが必要な権限を持っていない場合は403エラーを返す', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'adr:delete');
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        required: 'adr:delete',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('権限チェック失敗時に監査ログを記録する', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'PERMISSION_CHECK_FAILED',
          actorId: 'user-123',
          targetType: 'Permission',
          targetId: 'adr:delete',
          metadata: {
            required: 'adr:delete',
            ip: '127.0.0.1',
            userAgent: 'test-agent',
          },
        },
      });
    });

    it('req.userが存在しない場合は401エラーを返す', async () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = requirePermission('adr:read', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRBACService.hasPermission).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('RBACServiceがエラーをスローした場合は500エラーを返す', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockRejectedValue(new Error('Database error'));
      const middleware = requirePermission('adr:read', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_ERROR',
        message: 'Failed to check permissions',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('監査ログ記録が失敗してもエラーレスポンスは返される', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      vi.mocked(mockPrisma.auditLog.create).mockRejectedValue(new Error('DB error'));
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        required: 'adr:delete',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('複数の権限パターン', () => {
    it('リソース固有の権限チェックが動作する（adr:create）', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(true);
      const middleware = requirePermission('adr:create', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'adr:create');
      expect(mockNext).toHaveBeenCalled();
    });

    it('管理系の権限チェックが動作する（user:update）', async () => {
      // Arrange
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('user:update', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'user:update');
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('メタデータ記録', () => {
    it('IPアドレスとUser-Agentが監査ログに記録される', async () => {
      // Arrange
      mockRequest = {
        ...mockRequest,
        ip: '192.168.1.100',
        get: vi.fn((header: string) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          return undefined;
        }) as Request['get'],
      };
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'PERMISSION_CHECK_FAILED',
          actorId: 'user-123',
          targetType: 'Permission',
          targetId: 'adr:delete',
          metadata: {
            required: 'adr:delete',
            ip: '192.168.1.100',
            userAgent: 'Mozilla/5.0',
          },
        },
      });
    });

    it('IPアドレスが未定義の場合は"unknown"が記録される', async () => {
      // Arrange
      mockRequest = {
        ...mockRequest,
        ip: undefined,
      };
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              ip: 'unknown',
            }),
          }),
        })
      );
    });

    it('User-Agentが取得できない場合は"unknown"が記録される', async () => {
      // Arrange
      mockRequest = {
        ...mockRequest,
        get: vi.fn(() => undefined) as Request['get'],
      };
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      const middleware = requirePermission('adr:delete', mockRBACService, mockPrisma);

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              userAgent: 'unknown',
            }),
          }),
        })
      );
    });
  });
});
