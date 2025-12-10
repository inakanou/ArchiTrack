/**
 * @fileoverview seed-helpersのユニットテスト
 *
 * Requirements (project-management):
 * - REQ-12.5: プロジェクト権限の定義
 *   - project:create, project:read, project:update, project:delete権限
 *   - 一般ユーザーロールへのプロジェクト基本権限割り当て
 *
 * Requirements (trading-partner-management):
 * - REQ-7.5: 取引先管理権限の定義
 *   - trading-partner:create, trading-partner:read, trading-partner:update, trading-partner:delete権限
 *   - 一般ユーザーロールへの取引先基本権限割り当て（削除権限は管理者のみ）
 *
 * Task 2.1: 取引先管理権限のシード登録テスト
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

  describe('プロジェクト権限の定義（project-management/REQ-12.5）', () => {
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

describe('seedPermissions - 取引先管理権限', () => {
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

  describe('取引先権限の定義（trading-partner-management/REQ-7.5）', () => {
    it('trading-partner:create権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const tradingPartnerCreateCall = upsertCalls.find(
        (call) =>
          call[0].create.resource === 'trading-partner' && call[0].create.action === 'create'
      );

      expect(tradingPartnerCreateCall).toBeDefined();
      expect(tradingPartnerCreateCall![0].create.description).toBe('取引先の作成');
    });

    it('trading-partner:read権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const tradingPartnerReadCall = upsertCalls.find(
        (call) => call[0].create.resource === 'trading-partner' && call[0].create.action === 'read'
      );

      expect(tradingPartnerReadCall).toBeDefined();
      expect(tradingPartnerReadCall![0].create.description).toBe('取引先の閲覧');
    });

    it('trading-partner:update権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const tradingPartnerUpdateCall = upsertCalls.find(
        (call) =>
          call[0].create.resource === 'trading-partner' && call[0].create.action === 'update'
      );

      expect(tradingPartnerUpdateCall).toBeDefined();
      expect(tradingPartnerUpdateCall![0].create.description).toBe('取引先の更新');
    });

    it('trading-partner:delete権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const tradingPartnerDeleteCall = upsertCalls.find(
        (call) =>
          call[0].create.resource === 'trading-partner' && call[0].create.action === 'delete'
      );

      expect(tradingPartnerDeleteCall).toBeDefined();
      expect(tradingPartnerDeleteCall![0].create.description).toBe('取引先の削除');
    });

    it('全4つの取引先権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const upsertCalls = vi.mocked(mockPrisma.permission!.upsert).mock.calls;
      const tradingPartnerPermissions = upsertCalls.filter(
        (call) => call[0].create.resource === 'trading-partner'
      );

      expect(tradingPartnerPermissions).toHaveLength(4);
      const actions = tradingPartnerPermissions.map((call) => call[0].create.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions - 取引先管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    vi.resetModules();
  });

  describe('一般ユーザーロールへの取引先権限割り当て（trading-partner-management/REQ-7.5）', () => {
    it('一般ユーザーにtrading-partner:create権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerCreatePermissionId = 'trading-partner-create-perm-id';

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
            if (where.resource === 'trading-partner' && where.action === 'create') {
              return {
                id: tradingPartnerCreatePermissionId,
                resource: 'trading-partner',
                action: 'create',
              };
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
      const tradingPartnerCreateAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === tradingPartnerCreatePermissionId
      );

      expect(tradingPartnerCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:read権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerReadPermissionId = 'trading-partner-read-perm-id';

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
            if (where.resource === 'trading-partner' && where.action === 'read') {
              return {
                id: tradingPartnerReadPermissionId,
                resource: 'trading-partner',
                action: 'read',
              };
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
      const tradingPartnerReadAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === tradingPartnerReadPermissionId
      );

      expect(tradingPartnerReadAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:update権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerUpdatePermissionId = 'trading-partner-update-perm-id';

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
            if (where.resource === 'trading-partner' && where.action === 'update') {
              return {
                id: tradingPartnerUpdatePermissionId,
                resource: 'trading-partner',
                action: 'update',
              };
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
      const tradingPartnerUpdateAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === tradingPartnerUpdatePermissionId
      );

      expect(tradingPartnerUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:delete権限は割り当てられない（管理者のみ）', async () => {
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
            if (where.resource === 'trading-partner' && where.action === 'delete') {
              return {
                id: 'trading-partner-delete-perm-id',
                resource: 'trading-partner',
                action: 'delete',
              };
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
      const tradingPartnerDeleteAssignment = upsertCalls.find(
        (call) =>
          call[0].create.roleId === userRoleId &&
          call[0].create.permissionId === 'trading-partner-delete-perm-id'
      );

      // 一般ユーザーロールにはtrading-partner:delete権限が割り当てられていないことを確認
      expect(tradingPartnerDeleteAssignment).toBeUndefined();
    });
  });
});

describe('seedRolePermissions', () => {
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    vi.resetModules();
  });

  describe('一般ユーザーロールへのプロジェクト権限割り当て（project-management/REQ-12.5）', () => {
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
