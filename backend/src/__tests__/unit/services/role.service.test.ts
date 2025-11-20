/**
 * @fileoverview RoleServiceの単体テスト
 *
 * Requirements:
 * - 17.1-17.9: 動的ロール管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, Role } from '@prisma/client';
import { RoleService } from '../../../services/role.service.js';
import { Err, Ok } from '../../../types/result.js';

// モックデータ
const mockRoleId = 'role-123';
const mockAdminRoleId = 'role-admin';

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

describe('RoleService', () => {
  let roleService: RoleService;
  let prismaMock: PrismaClient;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      role: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      userRole: {
        count: vi.fn(),
      },
    } as unknown as PrismaClient;

    roleService = new RoleService(prismaMock);
  });

  describe('createRole()', () => {
    it('新しいロールを作成できる', async () => {
      // Arrange
      const input = {
        name: 'developer',
        description: '開発者ロール',
        priority: 50,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null); // 名前重複なし
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockRoleId,
            name: 'developer',
            description: '開発者ロール',
            priority: 50,
            isSystem: false,
          })
        )
      );
      expect(prismaMock.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'developer' },
      });
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: {
          name: 'developer',
          description: '開発者ロール',
          priority: 50,
          isSystem: false,
        },
      });
    });

    it('ロール名が既に存在する場合はROLE_NAME_CONFLICTエラーを返す', async () => {
      // Arrange
      const input = {
        name: 'developer',
        description: '開発者ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole); // 名前重複

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NAME_CONFLICT', name: 'developer' }));
      expect(prismaMock.role.create).not.toHaveBeenCalled();
    });

    it('優先順位を指定しない場合はデフォルト値0が設定される', async () => {
      // Arrange
      const input = {
        name: 'viewer',
        description: '閲覧者ロール',
      };

      const roleWithDefaultPriority = {
        ...mockRole,
        name: 'viewer',
        description: '閲覧者ロール',
        priority: 0,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(roleWithDefaultPriority);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 0 })));
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ priority: 0 }),
      });
    });

    it('優先順位をカスタム値で設定できる', async () => {
      // Arrange
      const input = {
        name: 'manager',
        description: 'マネージャーロール',
        priority: 75,
      };

      const roleWithCustomPriority = {
        ...mockRole,
        name: 'manager',
        priority: 75,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(roleWithCustomPriority);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 75 })));
    });

    it('新しいロールはisSystem=falseで作成される', async () => {
      // Arrange
      const input = {
        name: 'tester',
        description: 'テスターロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ isSystem: false })));
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isSystem: false }),
      });
    });

    it('新しいロールはデフォルトで空の権限セットを持つ', async () => {
      // Arrange
      const input = {
        name: 'contributor',
        description: '貢献者ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result.ok).toBe(true);
      // 権限は別途割り当てるため、作成時は空
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const input = {
        name: 'error-role',
        description: 'エラーテスト用ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockRejectedValue(new Error('Database connection failed'));

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database connection failed',
        })
      );
    });
  });

  describe('updateRole()', () => {
    it('ロール名を更新できる', async () => {
      // Arrange
      const input = { name: 'senior-developer' };
      const updatedRole = { ...mockRole, name: 'senior-developer' };

      vi.mocked(prismaMock.role.findUnique)
        .mockResolvedValueOnce(mockRole) // 存在チェック
        .mockResolvedValueOnce(null); // 名前重複チェック
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ name: 'senior-developer' })));
      expect(prismaMock.role.update).toHaveBeenCalledWith({
        where: { id: mockRoleId },
        data: { name: 'senior-developer' },
      });
    });

    it('ロール説明を更新できる', async () => {
      // Arrange
      const input = { description: '上級開発者ロール' };
      const updatedRole = { ...mockRole, description: '上級開発者ロール' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ description: '上級開発者ロール' })));
    });

    it('ロール優先順位を更新できる', async () => {
      // Arrange
      const input = { priority: 60 };
      const updatedRole = { ...mockRole, priority: 60 };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 60 })));
    });

    it('存在しないロールの更新はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      const input = { name: 'new-name' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.updateRole('non-existent-id', input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
    });

    it('名前を変更しようとして重複する場合はROLE_NAME_CONFLICTエラーを返す', async () => {
      // Arrange
      const input = { name: 'admin' };
      const duplicateRole = { ...mockAdminRole };

      vi.mocked(prismaMock.role.findUnique)
        .mockResolvedValueOnce(mockRole) // 存在チェック
        .mockResolvedValueOnce(duplicateRole); // 名前重複チェック

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NAME_CONFLICT', name: 'admin' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
    });

    it('同じ名前で更新する場合は重複チェックをスキップする', async () => {
      // Arrange
      const input = { name: 'developer', description: '新しい説明' };
      const updatedRole = { ...mockRole, description: '新しい説明' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole); // 存在チェックのみ
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result.ok).toBe(true);
      // findUniqueは1回だけ呼ばれる（重複チェックはスキップされる）
      expect(prismaMock.role.findUnique).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const input = { description: '更新されたロール説明' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockRejectedValue(new Error('Database write failed'));

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database write failed',
        })
      );
    });
  });

  describe('deleteRole()', () => {
    it('ロールを削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0); // 使用中でない
      vi.mocked(prismaMock.role.delete).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.role.delete).toHaveBeenCalledWith({
        where: { id: mockRoleId },
      });
    });

    it('システムロールの削除はSYSTEM_ROLE_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole); // isSystem=true

      // Act
      const result = await roleService.deleteRole(mockAdminRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_PROTECTED' }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('使用中のロールの削除はROLE_IN_USEエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(5); // 5人のユーザーに割り当て済み

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_IN_USE', userCount: 5 }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('存在しないロールの削除はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.deleteRole('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockRejectedValue(new Error('Database delete failed'));

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database delete failed',
        })
      );
    });
  });

  describe('listRoles()', () => {
    it('全ロールを統計情報付きで取得できる', async () => {
      // Arrange
      const rolesWithCount = [
        {
          ...mockRole,
          _count: {
            userRoles: 3,
            rolePermissions: 5,
          },
        },
        {
          ...mockAdminRole,
          _count: {
            userRoles: 1,
            rolePermissions: 1,
          },
        },
      ];

      vi.mocked(prismaMock.role.findMany).mockResolvedValue(rolesWithCount as unknown as Role[]);

      // Act
      const roles = await roleService.listRoles();

      // Assert
      expect(roles).toHaveLength(2);
      expect(roles[0]).toEqual(
        expect.objectContaining({
          id: mockRole.id,
          name: mockRole.name,
          userCount: 3,
          permissionCount: 5,
        })
      );
      expect(roles[1]).toEqual(
        expect.objectContaining({
          id: mockAdminRole.id,
          name: mockAdminRole.name,
          userCount: 1,
          permissionCount: 1,
        })
      );
    });

    it('ロールが存在しない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findMany).mockResolvedValue([]);

      // Act
      const roles = await roleService.listRoles();

      // Assert
      expect(roles).toEqual([]);
    });
  });

  describe('getRoleById()', () => {
    it('ロールIDでロールを取得できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.getRoleById(mockRoleId);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockRoleId,
            name: 'developer',
          })
        )
      );
    });

    it('存在しないロールIDはROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.getRoleById('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockRejectedValue(new Error('Database query failed'));

      // Act
      const result = await roleService.getRoleById(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database query failed',
        })
      );
    });
  });
});
