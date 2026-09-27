/**
 * @fileoverview 権限チェックミドルウェアの単体テスト
 *
 * Requirements:
 * - 21.1, 21.2, 21.7: 権限チェック機能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { RBACService } from '../../../services/rbac.service.js';
import logger from '../../../utils/logger.js';

/**
 * 本物のロガー（pino の設定を持つ実体）のシリアライザを、ログの第1引数へ当てて JSON にする。
 * テストの共通設定（vitest.setup.ts）はロガーをモックに置き換えるため、実体は importActual で取り出す。
 * pino はシリアライザを Symbol('pino.serializers') に持つので、記号はロガー自身から説明文で引く
 */
async function serializeWithRealLogger(
  logged: Record<string, unknown>
): Promise<Record<string, { message?: string; stack?: string } | unknown>> {
  const { default: realLogger } = await vi.importActual<typeof import('../../../utils/logger.js')>(
    '../../../utils/logger.js'
  );
  const serializersSym = Object.getOwnPropertySymbols(realLogger).find(
    (sym) => sym.description === 'pino.serializers'
  );
  expect(serializersSym).toBeDefined();
  const serializers = (
    realLogger as unknown as Record<symbol, Record<string, (v: unknown) => unknown>>
  )[serializersSym as symbol];
  expect(typeof serializers?.err).toBe('function');
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(logged).map(([key, value]) => [
          key,
          serializers?.[key] ? serializers[key](value) : value,
        ])
      )
    )
  );
}

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

  /**
   * 権限の判定が DB 接続のタイムアウトで失敗した場合（タスク35.13、要件24.1）
   *
   * 接続のタイムアウトは next(error) でエラーハンドラーの 503 へ渡し、
   * それ以外の例外はこれまでどおり自前の 500 を返す
   */
  describe('DB 接続のタイムアウト', () => {
    beforeEach(() => {
      // ロガーのモックは共有されるため、他のテストの呼び出しを持ち越さない
      vi.mocked(logger.error).mockClear();
    });

    const connectionTimeouts: Array<[string, () => Error]> = [
      [
        'pg-pool の接続タイムアウト（Connection terminated due to connection timeout）',
        () => new Error('Connection terminated due to connection timeout'),
      ],
      [
        'pg-pool の接続の取得のタイムアウト（timeout exceeded when trying to connect）',
        () => new Error('timeout exceeded when trying to connect'),
      ],
      ['ETIMEDOUT', () => Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
      [
        'P1008',
        () =>
          new Prisma.PrismaClientKnownRequestError('Operations timed out', {
            code: 'P1008',
            clientVersion: 'test',
          }),
      ],
    ];

    it.each(connectionTimeouts)(
      '%s は next(error) でエラーハンドラーへ渡し、自前の応答を返さない',
      async (_label, makeError) => {
        const timeoutError = makeError();
        vi.mocked(mockRBACService.hasPermission).mockRejectedValue(timeoutError);
        const middleware = requirePermission('role:read', mockRBACService, mockPrisma);

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(timeoutError);
        expect(mockResponse.status).not.toHaveBeenCalled();
        expect(mockResponse.json).not.toHaveBeenCalled();
        expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      }
    );

    const otherErrors: Array<[string, () => Error]> = [
      ['一般の Error', () => new Error('Database connection failed')],
      [
        'P1001（接続拒否）',
        () =>
          new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
            code: 'P1001',
            clientVersion: 'test',
          }),
      ],
      ['部分一致の文言', () => new Error('Connection terminated due to connection timeout (x)')],
    ];

    it.each(otherErrors)(
      '%s はこれまでどおり 500 と同じ本文を返し、next を呼ばない',
      async (_label, makeError) => {
        vi.mocked(mockRBACService.hasPermission).mockRejectedValue(makeError());
        const middleware = requirePermission('role:read', mockRBACService, mockPrisma);

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(500);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: 'INTERNAL_ERROR',
          message: 'Failed to check permissions',
        });
        expect(mockNext).not.toHaveBeenCalled();
      }
    );

    it('タイムアウト以外の例外のログは err キーで渡し、本物のシリアライザで message と stack が残る', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(mockRBACService.hasPermission).mockRejectedValue(dbError);
      const middleware = requirePermission('role:read', mockRBACService, mockPrisma);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { err: dbError, permission: 'role:read', userId: 'user-123' },
        'Permission check error'
      );
      const [logged] = vi
        .mocked(logger.error)
        .mock.calls.find(([, message]) => message === 'Permission check error') as unknown as [
        Record<string, unknown>,
        string,
      ];
      const serialized = (await serializeWithRealLogger(logged)) as {
        err: { message: string; stack: string };
      };
      expect(serialized.err.message).toBe('Database connection failed');
      expect(serialized.err.stack).toContain('Database connection failed');
    });

    it('監査ログの記録の失敗のログも err キーで渡し、本物のシリアライザで message が残る', async () => {
      const auditError = new Error('audit write failed');
      vi.mocked(mockRBACService.hasPermission).mockResolvedValue(false);
      vi.mocked(mockPrisma.auditLog.create).mockRejectedValue(auditError);
      const middleware = requirePermission('role:read', mockRBACService, mockPrisma);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { err: auditError, actorId: 'user-123', requiredPermission: 'role:read' },
        'Failed to record audit log'
      );
      const [logged] = vi
        .mocked(logger.error)
        .mock.calls.find(([, message]) => message === 'Failed to record audit log') as unknown as [
        Record<string, unknown>,
        string,
      ];
      const serialized = (await serializeWithRealLogger(logged)) as {
        err: { message: string };
      };
      expect(serialized.err.message).toBe('audit write failed');
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
