/**
 * @fileoverview UserRoleServiceの単体テスト
 *
 * Requirements:
 * - 20.1-20.9: ユーザーへのロール割り当て（マルチロール対応）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, User, Role, UserRole } from '@prisma/client';
import { UserRoleService } from '../../../services/user-role.service';
import { Err, Ok } from '../../../types/result';

// モックデータ
const mockUserId = 'user-123';
const mockRoleId = 'role-123';
const mockAdminRoleId = 'role-admin';

const mockUser: User = {
  id: mockUserId,
  email: 'test@example.com',
  displayName: 'Test User',
  passwordHash: 'hash',
  isLocked: false,
  lockedUntil: null,
  loginFailures: 0,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockRole: Role = {
  id: mockRoleId,
  name: 'developer',
  description: '開発者ロール',
  priority: 50,
  isSystem: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockAdminRole: Role = {
  id: mockAdminRoleId,
  name: 'admin',
  description: 'システム管理者',
  priority: 100,
  isSystem: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockUserRole: UserRole = {
  id: 'ur-123',
  userId: mockUserId,
  roleId: mockRoleId,
  assignedAt: new Date('2025-01-01T00:00:00Z'),
};

describe('UserRoleService', () => {
  let userRoleService: UserRoleService;
  let prismaMock: PrismaClient;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      user: {
        findUnique: vi.fn(),
      },
      role: {
        findUnique: vi.fn(),
      },
      userRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(prismaMock)),
    } as unknown as PrismaClient;

    userRoleService = new UserRoleService(prismaMock);
  });

  describe('addRoleToUser()', () => {
    it('ユーザーにロールを追加できる', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null); // 重複なし
      vi.mocked(prismaMock.userRole.create).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.userRole.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          roleId: mockRoleId,
        },
      });
    });

    it('既にロールが割り当てられている場合はスキップする（重複を無視）', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole); // 既に存在

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined)); // エラーにならずスキップ
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });

    it('ユーザーが存在しない場合はUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });

    it('ロールが存在しない場合はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });
  });

  describe('removeRoleFromUser()', () => {
    it('ユーザーからロールを削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { id: mockUserRole.id },
      });
    });

    it('最後の管理者からadminロールを削除しようとするとLAST_ADMIN_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(1); // このユーザーが最後の管理者

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockAdminRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'LAST_ADMIN_PROTECTED' }));
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it('紐付けが存在しない場合はASSIGNMENT_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ASSIGNMENT_NOT_FOUND' }));
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });
  });

  describe('getUserRoles()', () => {
    it('ユーザーのロール一覧を取得できる', async () => {
      // Arrange
      const userRolesWithRole = [
        {
          ...mockUserRole,
          role: mockRole,
        },
      ];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue(
        userRolesWithRole as unknown as UserRole[]
      );

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(
        Ok([
          expect.objectContaining({
            roleId: mockRoleId,
            name: 'developer',
            description: '開発者ロール',
            priority: 50,
            isSystem: false,
          }),
        ])
      );
    });

    it('ユーザーが存在しない場合はUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
    });

    it('ロールが割り当てられていない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue([]);

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(Ok([]));
    });
  });

  describe('addRolesToUser()', () => {
    it('複数のロールを一括でユーザーに追加できる', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456', 'role-789'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRolesToUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('removeRolesFromUser()', () => {
    it('複数のロールを一括でユーザーから削除できる', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在

      // Act
      const result = await userRoleService.removeRolesFromUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('hasUserRole()', () => {
    it('ユーザーがロールを持っている場合trueを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.hasUserRole(mockUserId, mockRoleId);

      // Assert
      expect(result).toBe(true);
    });

    it('ユーザーがロールを持っていない場合falseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.hasUserRole(mockUserId, mockRoleId);

      // Assert
      expect(result).toBe(false);
    });
  });
});
