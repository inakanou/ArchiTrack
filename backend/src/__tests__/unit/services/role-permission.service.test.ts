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
import { PrivilegeCeilingPolicy } from '../../../services/privilege-ceiling.js';
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
      // 上限の判定の前のロールの行のロック（タスク58.1）
      $queryRaw: vi.fn().mockResolvedValue([{ id: mockRoleId }]),
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

      // Assert（監査ログは紐付けと同じトランザクションのクライアントで記録する）
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
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
        },
        prismaMock
      );
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

      // Assert（監査ログは紐付けと同じトランザクションのクライアントで記録する）
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
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
        },
        prismaMock
      );
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

  describe('RBACService integration', () => {
    it('addPermissionToRoleでキャッシュを無効化する', async () => {
      // Arrange
      const rbacServiceMock = {
        invalidateUserPermissionsCacheForRole: vi.fn().mockResolvedValue(undefined),
      };
      const serviceWithRbac = new RolePermissionService(
        prismaMock,
        rbacServiceMock as unknown as ConstructorParameters<typeof RolePermissionService>[1],
        auditLogServiceMock
      );
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);

      // Act
      await serviceWithRbac.addPermissionToRole(mockRoleId, mockPermissionId, 'actor-123');

      // Assert
      expect(rbacServiceMock.invalidateUserPermissionsCacheForRole).toHaveBeenCalledWith(
        mockRoleId
      );
    });

    it('removePermissionFromRoleでキャッシュを無効化する', async () => {
      // Arrange
      const rbacServiceMock = {
        invalidateUserPermissionsCacheForRole: vi.fn().mockResolvedValue(undefined),
      };
      const serviceWithRbac = new RolePermissionService(
        prismaMock,
        rbacServiceMock as unknown as ConstructorParameters<typeof RolePermissionService>[1],
        auditLogServiceMock
      );
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockResolvedValue(mockRolePermission);

      // Act
      await serviceWithRbac.removePermissionFromRole(mockRoleId, mockPermissionId, 'actor-123');

      // Assert
      expect(rbacServiceMock.invalidateUserPermissionsCacheForRole).toHaveBeenCalledWith(
        mockRoleId
      );
    });
  });

  describe('Error handling edge cases', () => {
    it('addPermissionToRoleで非Errorオブジェクトの場合Unknown errorを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockRejectedValue('string error');

      // Act
      const result = await rolePermissionService.addPermissionToRole(mockRoleId, mockPermissionId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Unknown error',
        })
      );
    });

    it('removePermissionFromRoleで非Errorオブジェクトの場合Unknown errorを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      vi.mocked(prismaMock.rolePermission.delete).mockRejectedValue({ code: 'P2002' });

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId
      );

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Unknown error',
        })
      );
    });

    it('getRolePermissionsで非Errorオブジェクトの場合Unknown errorを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findMany).mockRejectedValue('string error');

      // Act
      const result = await rolePermissionService.getRolePermissions(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Unknown error',
        })
      );
    });

    it('removePermissionFromRoleでロールが存在しない場合ROLE_NOT_FOUNDを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId
      );

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });

    it('removePermissionFromRoleで権限が存在しない場合PERMISSION_NOT_FOUNDを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(null);

      // Act
      const result = await rolePermissionService.removePermissionFromRole(
        mockRoleId,
        mockPermissionId
      );

      // Assert
      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_FOUND' }));
    });

    it('addPermissionsToRoleでエラーが発生した場合中断する', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null); // ROLE_NOT_FOUND

      // Act
      const result = await rolePermissionService.addPermissionsToRole(mockRoleId, [
        mockPermissionId,
      ]);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });

    it('removePermissionsFromRoleでエラーが発生した場合中断する', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null); // ROLE_NOT_FOUND

      // Act
      const result = await rolePermissionService.removePermissionsFromRole(mockRoleId, [
        mockPermissionId,
      ]);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });
  });

  describe('権限付与の上限（user-authentication タスク51.1）', () => {
    const actorId = 'actor-123';
    let service: RolePermissionService;
    let actorRolesMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // 上限の判定が読む実行者の保有ロール
      actorRolesMock = vi.fn().mockResolvedValue([]);
      (prismaMock as unknown as { userRole: unknown }).userRole = { findMany: actorRolesMock };
      // 上限の判定が読む実行者の保有ロールの権限（タスク58.1 の 38.8）。全権限でない権限（adr:read）は保有する
      vi.mocked(prismaMock.rolePermission.findMany).mockResolvedValue([
        { permission: { resource: 'adr', action: 'read' } },
      ] as never);
      service = new RolePermissionService(
        prismaMock,
        undefined,
        auditLogServiceMock,
        new PrivilegeCeilingPolicy(prismaMock)
      );
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);
    });

    it('admin ロールを持たない実行者による全権限（*:*）の追加を拒否し、トランザクションの外で監査に記録する', async () => {
      actorRolesMock.mockResolvedValue([{ role: { name: 'deputy', priority: 100 } }]);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockWildcardPermission);

      const result = await service.addPermissionToRole(
        mockRoleId,
        mockWildcardPermissionId,
        actorId
      );

      expect(result).toEqual(Err({ type: 'SYSTEM_ADMIN_REQUIRED' }));
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
      expect(auditLogServiceMock.createLog).toHaveBeenCalledTimes(1);
      const [input, tx] = vi.mocked(auditLogServiceMock.createLog).mock.calls[0]!;
      expect(input).toEqual({
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'role-permission',
        targetId: mockRoleId,
        before: null,
        after: null,
        metadata: {
          reason: 'SYSTEM_ADMIN_REQUIRED',
          permissionId: mockWildcardPermissionId,
          permission: '*:*',
        },
      });
      expect(tx).toBeUndefined();
    });

    it('一括の追加に全権限を含めば、admin ロールを持たない実行者の要求全体を拒否する', async () => {
      actorRolesMock.mockResolvedValue([{ role: { name: 'deputy', priority: 100 } }]);
      vi.mocked(prismaMock.permission.findUnique).mockImplementation(((args: {
        where: { id: string };
      }) =>
        Promise.resolve(
          args.where.id === mockWildcardPermissionId ? mockWildcardPermission : mockPermission
        )) as unknown as typeof prismaMock.permission.findUnique);

      const result = await service.addPermissionsToRole(
        mockRoleId,
        [mockPermissionId, mockWildcardPermissionId],
        actorId
      );

      expect(result).toEqual(Err({ type: 'SYSTEM_ADMIN_REQUIRED' }));
      expect(auditLogServiceMock.createLog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'PERMISSION_CHECK_FAILED',
          metadata: expect.objectContaining({ permissionId: mockWildcardPermissionId }),
        })
      );
    });

    it('admin ロールを持つ実行者は全権限（*:*）を追加できる', async () => {
      actorRolesMock.mockResolvedValue([{ role: { name: 'admin', priority: 100 } }]);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockWildcardPermission);

      const result = await service.addPermissionToRole(
        mockRoleId,
        mockWildcardPermissionId,
        actorId
      );

      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.create).toHaveBeenCalled();
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERMISSION_ASSIGNED' }),
        prismaMock
      );
    });

    it('全権限でない権限は admin ロールを持たない実行者でも、保有していれば追加できる', async () => {
      actorRolesMock.mockResolvedValue([{ role: { name: 'deputy', priority: 100 } }]);
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);

      const result = await service.addPermissionToRole(mockRoleId, mockPermissionId, actorId);

      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.create).toHaveBeenCalled();
    });
  });

  describe('保有しない権限の追加と上限より上のロールの変更の拒否（user-authentication タスク58.1）', () => {
    const actorId = 'actor-58';
    let service: RolePermissionService;
    let actorRolesMock: ReturnType<typeof vi.fn>;

    const role80: Role = { ...mockRole, id: 'role-80', name: 'director', priority: 80 };
    const projectUpdate: Permission = {
      ...mockPermission,
      id: 'perm-project-update',
      resource: 'project',
      action: 'update',
    };

    function permissionsById(...permissions: Permission[]): void {
      vi.mocked(prismaMock.permission.findUnique).mockImplementation(((args: {
        where: { id: string };
      }) =>
        Promise.resolve(
          permissions.find((p) => p.id === args.where.id) ?? null
        )) as unknown as typeof prismaMock.permission.findUnique);
    }

    function ceilingRecords() {
      return vi
        .mocked(auditLogServiceMock.createLog)
        .mock.calls.filter(([input]) => input.action === 'PERMISSION_CHECK_FAILED');
    }

    beforeEach(() => {
      actorRolesMock = vi.fn().mockResolvedValue([{ role: { name: 'manager', priority: 50 } }]);
      (prismaMock as unknown as { userRole: unknown }).userRole = { findMany: actorRolesMock };
      // 実行者は adr:read だけを保有する
      vi.mocked(prismaMock.rolePermission.findMany).mockResolvedValue([
        { permission: { resource: 'adr', action: 'read' } },
      ] as never);
      service = new RolePermissionService(
        prismaMock,
        undefined,
        auditLogServiceMock,
        new PrivilegeCeilingPolicy(prismaMock)
      );
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.rolePermission.create).mockResolvedValue(mockRolePermission);
    });

    it('保有しない権限の追加を拒否し、トランザクションの外で権限チェックの失敗として記録する', async () => {
      permissionsById(projectUpdate);

      const result = await service.addPermissionToRole(mockRoleId, projectUpdate.id, actorId);

      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
      const records = ceilingRecords();
      expect(records).toHaveLength(1);
      expect(records[0]![0]).toEqual({
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'role-permission',
        targetId: mockRoleId,
        before: null,
        after: null,
        metadata: {
          reason: 'PERMISSION_NOT_HELD_BY_ACTOR',
          permissionId: projectUpdate.id,
          permission: 'project:update',
        },
      });
      expect(records[0]![1]).toBeUndefined();
    });

    it('一括の追加に保有しない権限が 1 件でも含まれれば、要求全体を拒否する', async () => {
      permissionsById(mockPermission, projectUpdate);

      const result = await service.addPermissionsToRole(
        mockRoleId,
        [mockPermissionId, projectUpdate.id],
        actorId
      );

      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' }));
      const records = ceilingRecords();
      expect(records).toHaveLength(1);
      expect(records[0]![0].metadata).toMatchObject({ permissionId: projectUpdate.id });
    });

    it('現在の優先度が上限より高いロールへの権限の追加を、全権限・保有の判定より先に拒否する', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(role80);
      permissionsById(mockPermission);

      const result = await service.addPermissionToRole(role80.id, mockPermissionId, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.rolePermission.create).not.toHaveBeenCalled();
      expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
      const records = ceilingRecords();
      expect(records).toHaveLength(1);
      expect(records[0]![0]).toMatchObject({
        targetType: 'role-permission',
        targetId: role80.id,
        metadata: {
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          permissionId: mockPermissionId,
          permission: 'adr:read',
        },
      });
    });

    it('権限の追加・削除の上限の判定は、ロールの行を FOR SHARE でロックした後に行う', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(role80);
      permissionsById(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);
      const policy = new PrivilegeCeilingPolicy(prismaMock);
      const judge = vi.spyOn(policy, 'assertCanModifyRole');
      const lockedService = new RolePermissionService(
        prismaMock,
        undefined,
        auditLogServiceMock,
        policy
      );
      const lockSql = (index: number) =>
        (vi.mocked(prismaMock.$queryRaw).mock.calls[index]![0] as unknown as string[]).join('');

      for (const run of [
        () => lockedService.addPermissionToRole(role80.id, mockPermissionId, actorId),
        () => lockedService.removePermissionFromRole(role80.id, mockPermissionId, actorId),
      ]) {
        vi.mocked(prismaMock.$queryRaw).mockClear();
        judge.mockClear();

        expect(await run()).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
        expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
        expect(lockSql(0)).toContain('FOR SHARE');
        expect(judge).toHaveBeenCalledTimes(1);
        expect(vi.mocked(prismaMock.$queryRaw).mock.invocationCallOrder[0]!).toBeLessThan(
          judge.mock.invocationCallOrder[0]!
        );
      }
    });

    it('現在の優先度が上限より高いロールからの権限の削除を拒否し、記録する', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(role80);
      permissionsById(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValue(mockRolePermission);

      const result = await service.removePermissionFromRole(role80.id, mockPermissionId, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.rolePermission.delete).not.toHaveBeenCalled();
      const records = ceilingRecords();
      expect(records).toHaveLength(1);
      expect(records[0]![0]).toMatchObject({
        actorId,
        targetType: 'role-permission',
        targetId: role80.id,
        metadata: { reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR', permissionId: mockPermissionId },
      });
      expect(records[0]![1]).toBeUndefined();
    });

    it('上限ちょうどのロールからの権限の削除と、保有する権限の追加は受け付ける', async () => {
      permissionsById(mockPermission);
      vi.mocked(prismaMock.rolePermission.findFirst).mockResolvedValueOnce(mockRolePermission);

      const removed = await service.removePermissionFromRole(mockRoleId, mockPermissionId, actorId);
      const added = await service.addPermissionToRole(mockRoleId, mockPermissionId, actorId);

      expect(removed).toEqual(Ok(undefined));
      expect(added).toEqual(Ok(undefined));
      expect(prismaMock.rolePermission.delete).toHaveBeenCalled();
      expect(prismaMock.rolePermission.create).toHaveBeenCalled();
      expect(ceilingRecords()).toHaveLength(0);
    });
  });
});
