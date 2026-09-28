/**
 * @fileoverview RBACServiceの単体テスト
 *
 * Requirements:
 * - 6.1-6.8: ロールベースアクセス制御（RBAC）
 * - 21.1-21.10: セキュリティ要件（認可・権限管理）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, User } from '../../../generated/prisma/client.js';
import type Redis from 'ioredis';
import { RBACService, getSharedRBACService } from '../../../services/rbac.service.js';
import getPrismaClient from '../../../db.js';
import redisConnection from '../../../redis.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

// モックデータ
const mockUserId = 'user-123';
const mockAdminUserId = 'admin-456';

const mockAdminPermission = {
  id: 'perm-1',
  resource: '*',
  action: '*',
  description: '全てのリソースへの全てのアクション',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAdrReadPermission = {
  id: 'perm-2',
  resource: 'adr',
  action: 'read',
  description: 'ADRの閲覧',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAdrCreatePermission = {
  id: 'perm-3',
  resource: 'adr',
  action: 'create',
  description: 'ADRの作成',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserReadPermission = {
  id: 'perm-4',
  resource: 'user',
  action: 'read',
  description: 'ユーザー情報の閲覧',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserWithMultipleRoles = {
  id: mockUserId,
  email: 'user@example.com',
  displayName: 'Test User',
  passwordHash: 'hash',
  userRoles: [
    {
      role: {
        id: 'role-1',
        name: 'user',
        rolePermissions: [
          { permission: mockAdrReadPermission },
          { permission: mockAdrCreatePermission },
          { permission: mockUserReadPermission },
        ],
      },
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockAdminUser = {
  id: mockAdminUserId,
  email: 'admin@example.com',
  displayName: 'Admin User',
  passwordHash: 'hash',
  userRoles: [
    {
      role: {
        id: 'role-2',
        name: 'admin',
        rolePermissions: [{ permission: mockAdminPermission }],
      },
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('RBACService', () => {
  let rbacService: RBACService;
  let prismaMock: PrismaClient;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      user: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    rbacService = new RBACService(prismaMock);
  });

  describe('getUserPermissions()', () => {
    it('ユーザーが持つ全ての権限を取得できる', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const permissions = await rbacService.getUserPermissions(mockUserId);

      // Assert
      expect(permissions).toHaveLength(3);
      expect(permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: mockAdrReadPermission.id,
            resource: 'adr',
            action: 'read',
          }),
          expect.objectContaining({
            id: mockAdrCreatePermission.id,
            resource: 'adr',
            action: 'create',
          }),
          expect.objectContaining({
            id: mockUserReadPermission.id,
            resource: 'user',
            action: 'read',
          }),
        ])
      );
    });

    it('複数のロールを持つユーザーの権限を重複なく取得できる', async () => {
      // Arrange: 2つのロールが同じ権限を持つケース
      const userWithDuplicatePermissions = {
        ...mockUserWithMultipleRoles,
        userRoles: [
          {
            role: {
              id: 'role-1',
              name: 'user',
              rolePermissions: [{ permission: mockAdrReadPermission }],
            },
          },
          {
            role: {
              id: 'role-3',
              name: 'contributor',
              rolePermissions: [
                { permission: mockAdrReadPermission }, // 重複
                { permission: mockAdrCreatePermission },
              ],
            },
          },
        ],
      };

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        userWithDuplicatePermissions as unknown as User
      );

      // Act
      const permissions = await rbacService.getUserPermissions(mockUserId);

      // Assert: 重複が除外されている
      expect(permissions).toHaveLength(2);
      const permissionIds = permissions.map((p) => p.id);
      expect(permissionIds).toContain(mockAdrReadPermission.id);
      expect(permissionIds).toContain(mockAdrCreatePermission.id);
    });

    it('ユーザーが存在しない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const permissions = await rbacService.getUserPermissions('non-existent-user');

      // Assert
      expect(permissions).toEqual([]);
    });

    it('ロールを持たないユーザーは空配列を返す', async () => {
      // Arrange
      const userWithoutRoles = {
        ...mockUserWithMultipleRoles,
        userRoles: [],
      };
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(userWithoutRoles as unknown as User);

      // Act
      const permissions = await rbacService.getUserPermissions(mockUserId);

      // Assert
      expect(permissions).toEqual([]);
    });
  });

  describe('getUserPermissions() の権限キャッシュ障害時', () => {
    let redisMock: Redis;
    let rbacServiceWithRedis: RBACService;

    beforeEach(() => {
      vi.mocked(logger.warn).mockClear();
      vi.mocked(logger.debug).mockClear();
      redisMock = {
        status: 'ready',
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue('OK'),
      } as unknown as Redis;
      rbacServiceWithRedis = new RBACService(prismaMock, redisMock);
    });

    /**
     * @requirement user-authentication/REQ-24.7: キャッシュ障害で DB から取るフォールバックが実行されたとき警告ログを記録する
     */
    it('権限キャッシュの読み出しが失敗するとWARNレベルのログを1回だけ記録し、DBから取得した権限を返す', async () => {
      // Arrange: キャッシュ（Redis）の読み出しが接続障害で失敗する
      const cacheError = new Error('Redis connection failed');
      vi.mocked(redisMock.get).mockRejectedValue(cacheError);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const permissions = await rbacServiceWithRedis.getUserPermissions(mockUserId);

      // Assert: 警告ログが WARN レベルで 1 回だけ、対象ユーザーと障害を添えて記録される
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: cacheError, userId: mockUserId },
        'Failed to get permissions from Redis cache'
      );
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.anything(),
        'Failed to get permissions from Redis cache'
      );

      // Assert: フォールバックとして DB から取得した権限が返る
      expect(redisMock.get).toHaveBeenCalledWith(`rbac:permissions:${mockUserId}`);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockUserId } })
      );
      expect(permissions.map((p) => p.id).sort()).toEqual(
        [mockAdrReadPermission.id, mockAdrCreatePermission.id, mockUserReadPermission.id].sort()
      );
    });

    /**
     * @requirement user-authentication/REQ-24.7: キャッシュ障害が無くフォールバックが実行されないときは警告ログを記録しない
     */
    it('権限キャッシュが正常に読めるときは警告ログを記録せずDBにも問い合わせない', async () => {
      // Arrange
      const cached = [
        { id: mockAdrReadPermission.id, resource: 'adr', action: 'read', description: 'ADRの閲覧' },
      ];
      vi.mocked(redisMock.get).mockResolvedValue(JSON.stringify(cached));

      // Act
      const permissions = await rbacServiceWithRedis.getUserPermissions(mockUserId);

      // Assert
      expect(permissions).toEqual(cached);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-24.7: 接続が使えない状態でフォールバックしたとき警告ログを記録する
     */
    it('Redis の接続が使える状態でないときはコマンドを送らず、警告ログを残して DB から取得する', async () => {
      // Arrange: 再接続中のクライアント（コマンドを送るとオフラインキューで再接続を待つ）
      const reconnecting = {
        status: 'reconnecting',
        get: vi.fn(),
        setex: vi.fn(),
      } as unknown as Redis;
      const service = new RBACService(prismaMock, reconnecting);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const permissions = await service.getUserPermissions(mockUserId);

      // Assert: コマンドは送らない
      expect(reconnecting.get).not.toHaveBeenCalled();
      expect(reconnecting.setex).not.toHaveBeenCalled();
      // Assert: 警告ログを err キーで 1 回だけ残す
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: expect.any(Error), userId: mockUserId },
        'Failed to get permissions from Redis cache'
      );
      const [fields] = vi.mocked(logger.warn).mock.calls[0]!;
      expect((fields as { err: Error }).err.message).toContain('reconnecting');
      // Assert: DB から取得した権限を返す
      expect(permissions).toHaveLength(3);
    });

    it('読み出しが失敗したときはキャッシュへ書き込まない', async () => {
      vi.mocked(redisMock.get).mockRejectedValue(new Error('Redis connection failed'));
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      await rbacServiceWithRedis.getUserPermissions(mockUserId);

      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it('キャッシュに無いときは DB から取得した権限を 15 分の TTL で保存する', async () => {
      vi.mocked(redisMock.get).mockResolvedValue(null);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      const permissions = await rbacServiceWithRedis.getUserPermissions(mockUserId);

      expect(redisMock.setex).toHaveBeenCalledWith(
        `rbac:permissions:${mockUserId}`,
        15 * 60,
        JSON.stringify(permissions)
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('キャッシュへの書き込みが失敗したときは err キーで警告ログを残し、DB の権限を返す', async () => {
      const writeError = new Error('Redis write failed');
      vi.mocked(redisMock.get).mockResolvedValue(null);
      vi.mocked(redisMock.setex).mockRejectedValue(writeError);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      const permissions = await rbacServiceWithRedis.getUserPermissions(mockUserId);

      expect(logger.warn).toHaveBeenCalledWith(
        { err: writeError, userId: mockUserId },
        'Failed to cache permissions to Redis'
      );
      expect(permissions).toHaveLength(3);
    });
  });

  describe('Redis クライアントの解決', () => {
    it('関数で渡した Redis クライアントは呼び出しの時点で解決する', async () => {
      let current: Redis | null = null;
      const lateRedis = {
        status: 'ready',
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
      } as unknown as Redis;
      const service = new RBACService(prismaMock, () => current);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // 生成の時点では未初期化（null）: キャッシュを使わない
      await service.getUserPermissions(mockUserId);
      await service.invalidateUserPermissionsCache(mockUserId);
      expect(lateRedis.get).not.toHaveBeenCalled();
      expect(lateRedis.del).not.toHaveBeenCalled();

      // 後から初期化されたクライアントを使う
      current = lateRedis;
      await service.getUserPermissions(mockUserId);
      await service.invalidateUserPermissionsCache(mockUserId);
      expect(lateRedis.get).toHaveBeenCalledWith(`rbac:permissions:${mockUserId}`);
      expect(lateRedis.setex).toHaveBeenCalledTimes(1);
      expect(lateRedis.del).toHaveBeenCalledWith(`rbac:permissions:${mockUserId}`);
    });
  });

  describe('getSharedRBACService()', () => {
    it('同じ PrismaClient の間は同じインスタンスを返し、redis.ts のクライアントを呼び出しの時点で使う', async () => {
      const prismaA = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;
      vi.mocked(getPrismaClient).mockReturnValue(prismaA);
      const sharedRedis = {
        status: 'ready',
        get: vi.fn().mockResolvedValue(JSON.stringify([])),
      } as unknown as Redis;

      const first = getSharedRBACService();
      const second = getSharedRBACService();
      expect(second).toBe(first);

      // 生成の後に初期化された Redis を使う
      vi.mocked(redisConnection.getClient).mockReturnValue(sharedRedis);
      await first.getUserPermissions(mockUserId);
      expect(sharedRedis.get).toHaveBeenCalledWith(`rbac:permissions:${mockUserId}`);
      expect(prismaA.user.findUnique).not.toHaveBeenCalled();
    });

    it('PrismaClient が作り直されたときは新しいクライアントで作り直す', () => {
      const prismaA = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;
      const prismaB = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;
      vi.mocked(getPrismaClient).mockReturnValue(prismaA);
      const first = getSharedRBACService();
      vi.mocked(getPrismaClient).mockReturnValue(prismaB);
      const second = getSharedRBACService();
      expect(second).not.toBe(first);
      expect(getSharedRBACService()).toBe(second);
    });
  });

  describe('hasPermission()', () => {
    it('完全一致する権限を持つ場合はtrueを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const hasAdrRead = await rbacService.hasPermission(mockUserId, 'adr:read');
      const hasAdrCreate = await rbacService.hasPermission(mockUserId, 'adr:create');
      const hasUserRead = await rbacService.hasPermission(mockUserId, 'user:read');

      // Assert
      expect(hasAdrRead).toBe(true);
      expect(hasAdrCreate).toBe(true);
      expect(hasUserRead).toBe(true);
    });

    it('権限を持たない場合はfalseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const hasAdrDelete = await rbacService.hasPermission(mockUserId, 'adr:delete');
      const hasUserCreate = await rbacService.hasPermission(mockUserId, 'user:create');

      // Assert
      expect(hasAdrDelete).toBe(false);
      expect(hasUserCreate).toBe(false);
    });

    it('ワイルドカード *:* 権限を持つユーザーは全ての権限を持つ', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockAdminUser as unknown as User);

      // Act
      const hasAdrRead = await rbacService.hasPermission(mockAdminUserId, 'adr:read');
      const hasAdrDelete = await rbacService.hasPermission(mockAdminUserId, 'adr:delete');
      const hasUserCreate = await rbacService.hasPermission(mockAdminUserId, 'user:create');
      const hasRoleManage = await rbacService.hasPermission(mockAdminUserId, 'role:manage');

      // Assert
      expect(hasAdrRead).toBe(true);
      expect(hasAdrDelete).toBe(true);
      expect(hasUserCreate).toBe(true);
      expect(hasRoleManage).toBe(true);
    });

    it('ワイルドカード *:read 権限を持つユーザーは全てのreadアクションを持つ', async () => {
      // Arrange
      const userWithWildcardAction = {
        ...mockUserWithMultipleRoles,
        userRoles: [
          {
            role: {
              id: 'role-4',
              name: 'reader',
              rolePermissions: [
                {
                  permission: {
                    id: 'perm-5',
                    resource: '*',
                    action: 'read',
                    description: '全てのリソースの閲覧',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          },
        ],
      };
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        userWithWildcardAction as unknown as User
      );

      // Act
      const hasAdrRead = await rbacService.hasPermission(mockUserId, 'adr:read');
      const hasUserRead = await rbacService.hasPermission(mockUserId, 'user:read');
      const hasRoleRead = await rbacService.hasPermission(mockUserId, 'role:read');
      const hasAdrCreate = await rbacService.hasPermission(mockUserId, 'adr:create');

      // Assert
      expect(hasAdrRead).toBe(true);
      expect(hasUserRead).toBe(true);
      expect(hasRoleRead).toBe(true);
      expect(hasAdrCreate).toBe(false); // createは持たない
    });

    it('ワイルドカード adr:* 権限を持つユーザーはADRの全アクションを持つ', async () => {
      // Arrange
      const userWithWildcardResource = {
        ...mockUserWithMultipleRoles,
        userRoles: [
          {
            role: {
              id: 'role-5',
              name: 'adr-manager',
              rolePermissions: [
                {
                  permission: {
                    id: 'perm-6',
                    resource: 'adr',
                    action: '*',
                    description: 'ADRの完全管理',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          },
        ],
      };
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        userWithWildcardResource as unknown as User
      );

      // Act
      const hasAdrRead = await rbacService.hasPermission(mockUserId, 'adr:read');
      const hasAdrCreate = await rbacService.hasPermission(mockUserId, 'adr:create');
      const hasAdrUpdate = await rbacService.hasPermission(mockUserId, 'adr:update');
      const hasAdrDelete = await rbacService.hasPermission(mockUserId, 'adr:delete');
      const hasUserRead = await rbacService.hasPermission(mockUserId, 'user:read');

      // Assert
      expect(hasAdrRead).toBe(true);
      expect(hasAdrCreate).toBe(true);
      expect(hasAdrUpdate).toBe(true);
      expect(hasAdrDelete).toBe(true);
      expect(hasUserRead).toBe(false); // userリソースは持たない
    });

    it('ユーザーが存在しない場合はfalseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const hasPermission = await rbacService.hasPermission('non-existent-user', 'adr:read');

      // Assert
      expect(hasPermission).toBe(false);
    });

    it('不正な権限形式の場合はfalseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(
        mockUserWithMultipleRoles as unknown as User
      );

      // Act
      const invalidFormat1 = await rbacService.hasPermission(mockUserId, 'invalid');
      const invalidFormat2 = await rbacService.hasPermission(mockUserId, 'adr:read:extra');

      // Assert
      expect(invalidFormat1).toBe(false);
      expect(invalidFormat2).toBe(false);
    });
  });

  describe('invalidateUserPermissionsCache()', () => {
    let redisMock: Redis;
    let rbacServiceWithRedis: RBACService;

    beforeEach(() => {
      // Redisモックの作成
      redisMock = {
        del: vi.fn(),
      } as unknown as Redis;

      rbacServiceWithRedis = new RBACService(prismaMock, redisMock);
    });

    it('Redisが利用可能な場合、指定されたユーザーのキャッシュを削除する', async () => {
      // Arrange
      vi.mocked(redisMock.del).mockResolvedValue(1);

      // Act
      await rbacServiceWithRedis.invalidateUserPermissionsCache(mockUserId);

      // Assert
      expect(redisMock.del).toHaveBeenCalledWith(`rbac:permissions:${mockUserId}`);
    });

    it('Redisが利用できない場合、エラーをログに記録して続行する', async () => {
      // Arrange
      vi.mocked(redisMock.del).mockRejectedValue(new Error('Redis connection failed'));

      // Act & Assert - エラーをスローしないこと
      await expect(
        rbacServiceWithRedis.invalidateUserPermissionsCache(mockUserId)
      ).resolves.toBeUndefined();
    });

    it('Redisが注入されていない場合、何も実行しない', async () => {
      // Arrange
      const rbacServiceWithoutRedis = new RBACService(prismaMock);

      // Act & Assert - エラーをスローしないこと
      await expect(
        rbacServiceWithoutRedis.invalidateUserPermissionsCache(mockUserId)
      ).resolves.toBeUndefined();
    });
  });

  describe('invalidateUserPermissionsCacheForRole()', () => {
    let redisMock: Redis;
    let rbacServiceWithRedis: RBACService;

    beforeEach(() => {
      // Redisモックの作成
      redisMock = {
        del: vi.fn(),
      } as unknown as Redis;

      // Prismaモックを再作成（userRoleを含む）
      prismaMock = {
        user: {
          findUnique: vi.fn(),
        },
        userRole: {
          findMany: vi.fn(),
        },
      } as unknown as PrismaClient;

      rbacServiceWithRedis = new RBACService(prismaMock, redisMock);
    });

    it('ロールを持つ全ユーザーのキャッシュを無効化する', async () => {
      // Arrange
      const roleId = 'role-123';
      const mockUserRoles = [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }];

      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue(mockUserRoles as unknown as never);
      vi.mocked(redisMock.del).mockResolvedValue(3);

      // Act
      await rbacServiceWithRedis.invalidateUserPermissionsCacheForRole(roleId);

      // Assert
      expect(prismaMock.userRole.findMany).toHaveBeenCalledWith({
        where: { roleId },
        select: { userId: true },
      });
      expect(redisMock.del).toHaveBeenCalledWith(
        'rbac:permissions:user-1',
        'rbac:permissions:user-2',
        'rbac:permissions:user-3'
      );
    });

    it('ロールを持つユーザーが存在しない場合、Redis削除を実行しない', async () => {
      // Arrange
      const roleId = 'role-empty';
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue([] as unknown as never);

      // Act
      await rbacServiceWithRedis.invalidateUserPermissionsCacheForRole(roleId);

      // Assert
      expect(prismaMock.userRole.findMany).toHaveBeenCalled();
      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('Redisが利用できない場合、エラーをログに記録して続行する', async () => {
      // Arrange
      const roleId = 'role-123';
      const mockUserRoles = [{ userId: 'user-1' }];
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue(mockUserRoles as unknown as never);
      vi.mocked(redisMock.del).mockRejectedValue(new Error('Redis connection failed'));

      // Act & Assert - エラーをスローしないこと
      await expect(
        rbacServiceWithRedis.invalidateUserPermissionsCacheForRole(roleId)
      ).resolves.toBeUndefined();
    });

    it('Redisが注入されていない場合、何も実行しない', async () => {
      // Arrange
      const rbacServiceWithoutRedis = new RBACService(prismaMock);
      const roleId = 'role-123';

      // Act & Assert - エラーをスローしないこと
      await expect(
        rbacServiceWithoutRedis.invalidateUserPermissionsCacheForRole(roleId)
      ).resolves.toBeUndefined();
    });
  });
});
