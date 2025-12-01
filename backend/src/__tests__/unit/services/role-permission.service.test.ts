/**
 * @fileoverview RolePermissionServiceの単体テスト
 *
 * Requirements:
 * - 19.1-19.8: ロールへの権限割り当て
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  PrismaClient,
  Role,
  Permission,
  RolePermission,
} from '../../../generated/prisma/client.js';
import { RolePermissionService } from '../../../services/role-permission.service.js';
import { Err, Ok } from '../../../types/result.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// モックデータ
const mockRoleId = 'role-123';
const mockAdminRoleId = 'role-admin';
const mockPermissionId = 'perm-123';
const mockWildcardPermissionId = 'perm-wildcard';

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

const mockPermission: Permission = {
  id: mockPermissionId,
  resource: 'adr',
  action: 'read',
  description: 'ADRの閲覧',
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

const mockWildcardPermission: Permission = {
  id: mockWildcardPermissionId,
  resource: '*',
  action: '*',
  description: '全ての権限',
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

const mockRolePermission: RolePermission = {
  id: 'rp-123',
  roleId: mockRoleId,
  permissionId: mockPermissionId,
  assignedAt: new Date('2025-01-01T00:00:00Z'),
};

describe('RolePermissionService', () => {
  let rolePermissionService: RolePermissionService;
  let prismaMock: PrismaClient;
  let auditLogServiceMock: IAuditLogService;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      role: {
        findUnique: vi.fn(),
      },
      permission: {
        findUnique: vi.fn(),
      },
      rolePermission: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(prismaMock)),
    } as unknown as PrismaClient;

    // AuditLogServiceモックの作成
    auditLogServiceMock = {
      createLog: vi.fn().mockResolvedValue({
        id: 'audit-log-123',
        action: 'PERMISSION_ASSIGNED',
        actorId: 'actor-123',
        targetType: 'role-permission',
        targetId: mockRoleId,
        before: null,
        after: null,
        metadata: null,
        createdAt: new Date(),
      }),
      getLogs: vi.fn(),
      exportLogs: vi.fn(),
    };

    rolePermissionService = new RolePermissionService(prismaMock, undefined, auditLogServiceMock);
  });

  describe('addPermissionToRole()', () => {
    it('ロールに権限を追加できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null); // 重複なし
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.create).toHaveBeenCalledWith({
        data: {
          roleId: mockRoleId,
          permissionId: mockPermissionId,
        },
      });
    });

    it('権限追加時に監査ログを記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);

      // Act
      await rolePermissionService.addPermissionToRole(mockRoleId, mockPermissionId, actorId);

      // Assert
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith({
        action: 'PERMISSION_ASSIGNED',
        actorId,
        targetType: 'role-permission',
        targetId: mockRoleId,
        before: null,
        after: {
          roleId: mockRoleId,
          roleName: mockRole.name,
          permissionId: mockPermissionId,
          permission: `${mockPermission.resource}:${mockPermission.action}`,
        },
        metadata: null,
      });
    });

    it('既に権限が割り当てられている場合はスキップする（重複を無視）', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission); // 既に存在

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Ok(undefined)); // エラーにならずスキップ
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
    });

    it('ロールが存在しない場合はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
    });

    it('権限が存在しない場合はPERMISSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_FOUND' }));
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database connection failed',
        })
      );
    });

    it('auditLogServiceがnullの場合でも権限を追加できる', async () => {
      // Arrange
      const serviceWithoutAudit = new RolePermissionService(prismaMock, undefined, undefined);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);

      // Act
      const result = await serviceWithoutAudit.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.create).toHaveBeenCalled();
    });

    it('actorIdがundefinedの場合でも権限を追加できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.addPermissionToRole(
        mockRoleId,
        mockPermissionId,
        undefined
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.create).toHaveBeenCalled();
    });
  });

  describe('removePermissionFromRole()', () => {
    it('ロールから権限を削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.delete).toHaveBeenCalledWith({
        where: { id: mockRolePermission.id },
      });
    });

    it('権限削除時に監査ログを記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockResolvedValue(mockRolePermission);

      // Act
      await rolePermissionService.removePermissionFromRole(mockRoleId, mockPermissionId, actorId);

      // Assert
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith({
        action: 'PERMISSION_REVOKED',
        actorId,
        targetType: 'role-permission',
        targetId: mockRoleId,
        before: {
          roleId: mockRoleId,
          roleName: mockRole.name,
          permissionId: mockPermissionId,
          permission: `${mockPermission.resource}:${mockPermission.action}`,
        },
        after: null,
        metadata: null,
      });
    });

    it('システム管理者ロールから*:*権限を削除しようとするとADMIN_WILDCARD_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockWildcardPermission);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockAdminRoleId,
        mockWildcardPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Err({ type: 'ADMIN_WILDCARD_PROTECTED' }));
      expect(prismaMock.rolePermission.delete).not.toHaveBeenCalled();
    });

    it('紐付けが存在しない場合はASSIGNMENT_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Err({ type: 'ASSIGNMENT_NOT_FOUND' }));
      expect(prismaMock.rolePermission.delete).not.toHaveBeenCalled();
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockRejectedValue(
        new Error('Database write failed')
      );

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database write failed',
        })
      );
    });

    it('auditLogServiceがnullの場合でも権限を削除できる', async () => {
      // Arrange
      const serviceWithoutAudit = new RolePermissionService(prismaMock, undefined, undefined);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockResolvedValue(mockRolePermission);

      // Act
      const result = await serviceWithoutAudit.removePermissionFromRole(
        mockRoleId,
        mockPermissionId,
        'actor-123'
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.delete).toHaveBeenCalled();
    });

    it('actorIdがundefinedの場合でも権限を削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId,
        undefined
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.delete).toHaveBeenCalled();
    });
  });

  describe('getRolePermissions()', () => {
    it('ロールの権限一覧を取得できる', async () => {
      // Arrange
      const rolePermissionsWithPermission = [
        {
          ...mockRolePermission,
          permission: mockPermission,
        },
      ];

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findMany).mockResolvedValue(
        rolePermissionsWithPermission as unknown as RolePermission[]
      );

      // Act
      const result = await rolePermissionService.getRolePermissions(mockRoleId);

      // Assert
      expect(result).toEqual(
        Ok([
          expect.objectContaining({
            permissionId: mockPermissionId,
            resource: 'adr',
            action: 'read',
            description: 'ADRの閲覧',
          }),
        ])
      );
    });

    it('ロールが存在しない場合はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.getRolePermissions(mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });

    it('権限が割り当てられていない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findMany).mockResolvedValue([]);

      // Act
      const result = await rolePermissionService.getRolePermissions(mockRoleId);

      // Assert
      expect(result).toEqual(Ok([]));
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findMany).mockRejectedValue(
        new Error('Database query failed')
      );

      // Act
      const result = await rolePermissionService.getRolePermissions(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database query failed',
        })
      );
    });
  });

  describe('addPermissionsToRole()', () => {
    it('複数の権限を一括でロールに追加できる', async () => {
      // Arrange
      const permissionIds = [mockPermissionId, 'perm-456', 'perm-789'];

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.addPermissionsToRole(mockRoleId, permissionIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('removePermissionsFromRole()', () => {
    it('複数の権限を一括でロールから削除できる', async () => {
      // Arrange
      const permissionIds = [mockPermissionId, 'perm-456'];

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.removePermissionsFromRole(
        mockRoleId,
        permissionIds
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
    });
  });

  describe('hasRolePermission()', () => {
    it('ロールが権限を持っている場合trueを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);

      // Act
      const result = await rolePermissionService.hasRolePermission(mockRoleId, mockPermissionId);

      // Assert
      expect(result).toBe(true);
    });

    it('ロールが権限を持っていない場合falseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.hasRolePermission(mockRoleId, mockPermissionId);

      // Assert
      expect(result).toBe(false);
    });
  });
});
