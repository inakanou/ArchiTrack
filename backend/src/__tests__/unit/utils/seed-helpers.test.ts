/**
 * @fileoverview seed-helpersのユニットテスト
 *
 * Requirements:
 * - 12.5: プロジェクト権限の定義
 *   - project:create, project:read, project:update, project:delete権限
 *   - 一般ユーザーロールへのプロジェクト基本権限割り当て
 *
 * Task 2.1: プロジェクト権限の追加テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// seed-helpersをインポートするためにモジュールを動的にインポート
describe('seedPermissions', () => {
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    vi.resetModules();
    mockPrisma = {
      permission: {
        upsert: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      } as unknown as PrismaClient['permission'],
      role: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: 'role-id', name: 'admin' }),
      } as unknown as PrismaClient['role'],
      rolePermission: {
        upsert: vi.fn().mockResolvedValue({}),
      } as unknown as PrismaClient['rolePermission'],
    };
  });

  describe('プロジェクト権限の定義（Requirements 12.5）', () => {
    it('project:create権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const projectCreateCall = upsertCalls.find(
        (call) => call[0].create.resource === 'project' && call[0].create.action === 'create'
      );

      expect(projectCreateCall).toBeDefined();
      expect(projectCreateCall![0].create.description).toBe('プロジェクトの作成');
    });

    it('project:read権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const projectReadCall = upsertCalls.find(
        (call) => call[0].create.resource === 'project' && call[0].create.action === 'read'
      );

      expect(projectReadCall).toBeDefined();
      expect(projectReadCall![0].create.description).toBe('プロジェクトの閲覧');
    });

    it('project:update権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const projectUpdateCall = upsertCalls.find(
        (call) => call[0].create.resource === 'project' && call[0].create.action === 'update'
      );

      expect(projectUpdateCall).toBeDefined();
      expect(projectUpdateCall![0].create.description).toBe('プロジェクトの更新');
    });

    it('project:delete権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const projectDeleteCall = upsertCalls.find(
        (call) => call[0].create.resource === 'project' && call[0].create.action === 'delete'
      );

      expect(projectDeleteCall).toBeDefined();
      expect(projectDeleteCall![0].create.description).toBe('プロジェクトの削除');
    });

    it('全4つのプロジェクト権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const projectPermissions = upsertCalls.filter(
        (call) => call[0].create.resource === 'project'
      );

      expect(projectPermissions).toHaveLength(4);
      const actions = projectPermissions.map((call) => call[0].create.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions', () => {
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    vi.resetModules();
  });

  describe('一般ユーザーロールへのプロジェクト権限割り当て（Requirements 12.5）', () => {
    it('一般ユーザーにproject:create権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectCreatePermissionId = 'project-create-perm-id';

      mockPrisma = {
        role: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
            if (where.name === 'user') return { id: userRoleId, name: 'user' };
            return null;
          }),
        } as unknown as PrismaClient['role'],
        permission: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.resource === '*' && where.action === '*') {
              return { id: 'all-perm-id', resource: '*', action: '*' };
            }
            if (where.resource === 'project' && where.action === 'create') {
              return { id: projectCreatePermissionId, resource: 'project', action: 'create' };
            }
            if (where.resource === 'project' && where.action === 'read') {
              return { id: 'project-read-perm-id', resource: 'project', action: 'read' };
            }
            if (where.resource === 'project' && where.action === 'update') {
              return { id: 'project-update-perm-id', resource: 'project', action: 'update' };
            }
            // その他の権限
            return {
              id: `${where.resource}-${where.action}-perm-id`,
              resource: where.resource,
              action: where.action,
            };
          }),
        } as unknown as PrismaClient['permission'],
        rolePermission: {
          upsert: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['rolePermission'],
      };

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.rolePermission!.upsert).mock.calls;
      const projectCreateAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === projectCreatePermissionId
      );

      expect(projectCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:read権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectReadPermissionId = 'project-read-perm-id';

      mockPrisma = {
        role: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
            if (where.name === 'user') return { id: userRoleId, name: 'user' };
            return null;
          }),
        } as unknown as PrismaClient['role'],
        permission: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.resource === '*' && where.action === '*') {
              return { id: 'all-perm-id', resource: '*', action: '*' };
            }
            if (where.resource === 'project' && where.action === 'read') {
              return { id: projectReadPermissionId, resource: 'project', action: 'read' };
            }
            // その他の権限
            return {
              id: `${where.resource}-${where.action}-perm-id`,
              resource: where.resource,
              action: where.action,
            };
          }),
        } as unknown as PrismaClient['permission'],
        rolePermission: {
          upsert: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['rolePermission'],
      };

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.rolePermission!.upsert).mock.calls;
      const projectReadAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === projectReadPermissionId
      );

      expect(projectReadAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:update権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectUpdatePermissionId = 'project-update-perm-id';

      mockPrisma = {
        role: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
            if (where.name === 'user') return { id: userRoleId, name: 'user' };
            return null;
          }),
        } as unknown as PrismaClient['role'],
        permission: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.resource === '*' && where.action === '*') {
              return { id: 'all-perm-id', resource: '*', action: '*' };
            }
            if (where.resource === 'project' && where.action === 'update') {
              return { id: projectUpdatePermissionId, resource: 'project', action: 'update' };
            }
            // その他の権限
            return {
              id: `${where.resource}-${where.action}-perm-id`,
              resource: where.resource,
              action: where.action,
            };
          }),
        } as unknown as PrismaClient['permission'],
        rolePermission: {
          upsert: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['rolePermission'],
      };

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.rolePermission!.upsert).mock.calls;
      const projectUpdateAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === projectUpdatePermissionId
      );

      expect(projectUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:delete権限は割り当てられない（管理者のみ）', async () => {
      // Arrange
      const userRoleId = 'user-role-id';

      mockPrisma = {
        role: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
            if (where.name === 'user') return { id: userRoleId, name: 'user' };
            return null;
          }),
        } as unknown as PrismaClient['role'],
        permission: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.resource === '*' && where.action === '*') {
              return { id: 'all-perm-id', resource: '*', action: '*' };
            }
            if (where.resource === 'project' && where.action === 'delete') {
              return { id: 'project-delete-perm-id', resource: 'project', action: 'delete' };
            }
            // その他の権限
            return {
              id: `${where.resource}-${where.action}-perm-id`,
              resource: where.resource,
              action: where.action,
            };
          }),
        } as unknown as PrismaClient['permission'],
        rolePermission: {
          upsert: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['rolePermission'],
      };

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.rolePermission!.upsert).mock.calls;
      const projectDeleteAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === 'project-delete-perm-id'
      );

      // 一般ユーザーロールにはproject:delete権限が割り当てられていないことを確認
      expect(projectDeleteAssignment).toBeUndefined();
    });
  });
});
