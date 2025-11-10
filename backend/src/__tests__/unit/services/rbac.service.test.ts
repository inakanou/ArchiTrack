/**
 * @fileoverview RBACServiceの単体テスト
 *
 * Requirements:
 * - 6.1-6.8: ロールベースアクセス制御（RBAC）
 * - 21.1-21.10: セキュリティ要件（認可・権限管理）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, User } from '@prisma/client';
import { RBACService } from '../../../services/rbac.service';

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
});
