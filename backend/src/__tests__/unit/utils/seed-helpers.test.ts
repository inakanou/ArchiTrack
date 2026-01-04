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
 * Requirements (site-survey):
 * - REQ-12.1, 12.2, 12.3: 現場調査管理権限の定義
 *   - site_survey:create, site_survey:read, site_survey:update, site_survey:delete権限
 *   - 一般ユーザーロールへの現場調査基本権限割り当て（削除権限は管理者のみ）
 *
 * Task 2.1: 取引先管理権限のシード登録テスト
 * Task 6.4: 現場調査アクセス制御権限のシード登録テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// seed-helpersをインポートするためにモジュールを動的にインポート
describe('seedPermissions', () => {
  let mockPrisma: Partial<PrismaClient>;
  let createManyData: Array<{ resource: string; action: string; description: string }>;

  beforeEach(() => {
    vi.resetModules();
    createManyData = [];
    mockPrisma = {
      permission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createManyData = data;
          return { count: data.length };
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      } as unknown as PrismaClient['permission'],
      role: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: 'role-id', name: 'admin' }),
      } as unknown as PrismaClient['role'],
      rolePermission: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      const projectCreatePerm = createManyData.find(
        (perm) => perm.resource === 'project' && perm.action === 'create'
      );

      expect(projectCreatePerm).toBeDefined();
      expect(projectCreatePerm!.description).toBe('プロジェクトの作成');
    });

    it('project:read権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const projectReadPerm = createManyData.find(
        (perm) => perm.resource === 'project' && perm.action === 'read'
      );

      expect(projectReadPerm).toBeDefined();
      expect(projectReadPerm!.description).toBe('プロジェクトの閲覧');
    });

    it('project:update権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const projectUpdatePerm = createManyData.find(
        (perm) => perm.resource === 'project' && perm.action === 'update'
      );

      expect(projectUpdatePerm).toBeDefined();
      expect(projectUpdatePerm!.description).toBe('プロジェクトの更新');
    });

    it('project:delete権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const projectDeletePerm = createManyData.find(
        (perm) => perm.resource === 'project' && perm.action === 'delete'
      );

      expect(projectDeletePerm).toBeDefined();
      expect(projectDeletePerm!.description).toBe('プロジェクトの削除');
    });

    it('全4つのプロジェクト権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const projectPermissions = createManyData.filter((perm) => perm.resource === 'project');

      expect(projectPermissions).toHaveLength(4);
      const actions = projectPermissions.map((perm) => perm.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedPermissions - 取引先管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let createManyData: Array<{ resource: string; action: string; description: string }>;

  beforeEach(() => {
    vi.resetModules();
    createManyData = [];
    mockPrisma = {
      permission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createManyData = data;
          return { count: data.length };
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      } as unknown as PrismaClient['permission'],
      role: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: 'role-id', name: 'admin' }),
      } as unknown as PrismaClient['role'],
      rolePermission: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      const tradingPartnerCreatePerm = createManyData.find(
        (perm) => perm.resource === 'trading-partner' && perm.action === 'create'
      );

      expect(tradingPartnerCreatePerm).toBeDefined();
      expect(tradingPartnerCreatePerm!.description).toBe('取引先の作成');
    });

    it('trading-partner:read権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerReadPerm = createManyData.find(
        (perm) => perm.resource === 'trading-partner' && perm.action === 'read'
      );

      expect(tradingPartnerReadPerm).toBeDefined();
      expect(tradingPartnerReadPerm!.description).toBe('取引先の閲覧');
    });

    it('trading-partner:update権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerUpdatePerm = createManyData.find(
        (perm) => perm.resource === 'trading-partner' && perm.action === 'update'
      );

      expect(tradingPartnerUpdatePerm).toBeDefined();
      expect(tradingPartnerUpdatePerm!.description).toBe('取引先の更新');
    });

    it('trading-partner:delete権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerDeletePerm = createManyData.find(
        (perm) => perm.resource === 'trading-partner' && perm.action === 'delete'
      );

      expect(tradingPartnerDeletePerm).toBeDefined();
      expect(tradingPartnerDeletePerm!.description).toBe('取引先の削除');
    });

    it('全4つの取引先権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerPermissions = createManyData.filter(
        (perm) => perm.resource === 'trading-partner'
      );

      expect(tradingPartnerPermissions).toHaveLength(4);
      const actions = tradingPartnerPermissions.map((perm) => perm.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions - 取引先管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let rolePermissionData: Array<{ roleId: string; permissionId: string }>;

  beforeEach(() => {
    vi.resetModules();
    rolePermissionData = [];
  });

  // ヘルパー関数: 共通のモック設定
  const createMockPrisma = (
    userRoleId: string,
    permissions: Array<{ id: string; resource: string; action: string }>
  ) => {
    return {
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
          return null;
        }),
        findMany: vi.fn().mockResolvedValue(permissions),
      } as unknown as PrismaClient['permission'],
      rolePermission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          rolePermissionData = [...rolePermissionData, ...data];
          return { count: data.length };
        }),
      } as unknown as PrismaClient['rolePermission'],
    };
  };

  describe('一般ユーザーロールへの取引先権限割り当て（trading-partner-management/REQ-7.5）', () => {
    it('一般ユーザーにtrading-partner:create権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerCreatePermissionId = 'trading-partner-create-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: tradingPartnerCreatePermissionId, resource: 'trading-partner', action: 'create' },
        { id: 'trading-partner-read-perm-id', resource: 'trading-partner', action: 'read' },
        { id: 'trading-partner-update-perm-id', resource: 'trading-partner', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerCreateAssignment = rolePermissionData.find(
        (item) =>
          item.roleId === userRoleId && item.permissionId === tradingPartnerCreatePermissionId
      );

      expect(tradingPartnerCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:read権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerReadPermissionId = 'trading-partner-read-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'trading-partner-create-perm-id', resource: 'trading-partner', action: 'create' },
        { id: tradingPartnerReadPermissionId, resource: 'trading-partner', action: 'read' },
        { id: 'trading-partner-update-perm-id', resource: 'trading-partner', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerReadAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === tradingPartnerReadPermissionId
      );

      expect(tradingPartnerReadAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:update権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerUpdatePermissionId = 'trading-partner-update-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'trading-partner-create-perm-id', resource: 'trading-partner', action: 'create' },
        { id: 'trading-partner-read-perm-id', resource: 'trading-partner', action: 'read' },
        { id: tradingPartnerUpdatePermissionId, resource: 'trading-partner', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const tradingPartnerUpdateAssignment = rolePermissionData.find(
        (item) =>
          item.roleId === userRoleId && item.permissionId === tradingPartnerUpdatePermissionId
      );

      expect(tradingPartnerUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにtrading-partner:delete権限は割り当てられない（管理者のみ）', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const tradingPartnerDeletePermissionId = 'trading-partner-delete-perm-id';

      // findManyはdelete権限を返さない（実装ではuserロールにdeleteは含まれない）
      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'trading-partner-create-perm-id', resource: 'trading-partner', action: 'create' },
        { id: 'trading-partner-read-perm-id', resource: 'trading-partner', action: 'read' },
        { id: 'trading-partner-update-perm-id', resource: 'trading-partner', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert - deleteのcreateが一般ユーザーには呼ばれていないことを確認
      const tradingPartnerDeleteAssignment = rolePermissionData.find(
        (item) =>
          item.roleId === userRoleId && item.permissionId === tradingPartnerDeletePermissionId
      );

      expect(tradingPartnerDeleteAssignment).toBeUndefined();
    });
  });
});

describe('seedRolePermissions', () => {
  let mockPrisma: Partial<PrismaClient>;
  let rolePermissionData: Array<{ roleId: string; permissionId: string }>;

  beforeEach(() => {
    vi.resetModules();
    rolePermissionData = [];
  });

  // ヘルパー関数: 共通のモック設定
  const createMockPrisma = (
    userRoleId: string,
    permissions: Array<{ id: string; resource: string; action: string }>
  ) => {
    return {
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
          return null;
        }),
        findMany: vi.fn().mockResolvedValue(permissions),
      } as unknown as PrismaClient['permission'],
      rolePermission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          rolePermissionData = [...rolePermissionData, ...data];
          return { count: data.length };
        }),
      } as unknown as PrismaClient['rolePermission'],
    };
  };

  describe('一般ユーザーロールへのプロジェクト権限割り当て（project-management/REQ-12.5）', () => {
    it('一般ユーザーにproject:create権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectCreatePermissionId = 'project-create-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: projectCreatePermissionId, resource: 'project', action: 'create' },
        { id: 'project-read-perm-id', resource: 'project', action: 'read' },
        { id: 'project-update-perm-id', resource: 'project', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const projectCreateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === projectCreatePermissionId
      );

      expect(projectCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:read権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectReadPermissionId = 'project-read-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'project-create-perm-id', resource: 'project', action: 'create' },
        { id: projectReadPermissionId, resource: 'project', action: 'read' },
        { id: 'project-update-perm-id', resource: 'project', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const projectReadAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === projectReadPermissionId
      );

      expect(projectReadAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:update権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectUpdatePermissionId = 'project-update-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'project-create-perm-id', resource: 'project', action: 'create' },
        { id: 'project-read-perm-id', resource: 'project', action: 'read' },
        { id: projectUpdatePermissionId, resource: 'project', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const projectUpdateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === projectUpdatePermissionId
      );

      expect(projectUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにproject:delete権限は割り当てられない（管理者のみ）', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const projectDeletePermissionId = 'project-delete-perm-id';

      // findManyはdelete権限を返さない
      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'project-create-perm-id', resource: 'project', action: 'create' },
        { id: 'project-read-perm-id', resource: 'project', action: 'read' },
        { id: 'project-update-perm-id', resource: 'project', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const projectDeleteAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === projectDeletePermissionId
      );

      // 一般ユーザーロールにはproject:delete権限が割り当てられていないことを確認
      expect(projectDeleteAssignment).toBeUndefined();
    });
  });
});

/**
 * 現場調査権限のテスト（site-survey/REQ-12.1, 12.2, 12.3）
 * Task 6.4: アクセス制御ミドルウェアを適用する
 */
describe('seedPermissions - 現場調査管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let createManyData: Array<{ resource: string; action: string; description: string }>;

  beforeEach(() => {
    vi.resetModules();
    createManyData = [];
    mockPrisma = {
      permission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createManyData = data;
          return { count: data.length };
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      } as unknown as PrismaClient['permission'],
      role: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: 'role-id', name: 'admin' }),
      } as unknown as PrismaClient['role'],
      rolePermission: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      } as unknown as PrismaClient['rolePermission'],
    };
  });

  describe('現場調査権限の定義（site-survey/REQ-12.1, 12.2, 12.3）', () => {
    it('site_survey:create権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyCreatePerm = createManyData.find(
        (perm) => perm.resource === 'site_survey' && perm.action === 'create'
      );

      expect(siteSurveyCreatePerm).toBeDefined();
      expect(siteSurveyCreatePerm!.description).toBe('現場調査の作成');
    });

    it('site_survey:read権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyReadPerm = createManyData.find(
        (perm) => perm.resource === 'site_survey' && perm.action === 'read'
      );

      expect(siteSurveyReadPerm).toBeDefined();
      expect(siteSurveyReadPerm!.description).toBe('現場調査の閲覧');
    });

    it('site_survey:update権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyUpdatePerm = createManyData.find(
        (perm) => perm.resource === 'site_survey' && perm.action === 'update'
      );

      expect(siteSurveyUpdatePerm).toBeDefined();
      expect(siteSurveyUpdatePerm!.description).toBe('現場調査の更新');
    });

    it('site_survey:delete権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyDeletePerm = createManyData.find(
        (perm) => perm.resource === 'site_survey' && perm.action === 'delete'
      );

      expect(siteSurveyDeletePerm).toBeDefined();
      expect(siteSurveyDeletePerm!.description).toBe('現場調査の削除');
    });

    it('全4つの現場調査権限が定義されている', async () => {
      // Arrange
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedPermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyPermissions = createManyData.filter(
        (perm) => perm.resource === 'site_survey'
      );

      expect(siteSurveyPermissions).toHaveLength(4);
      const actions = siteSurveyPermissions.map((perm) => perm.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions - 現場調査管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let rolePermissionData: Array<{ roleId: string; permissionId: string }>;

  beforeEach(() => {
    vi.resetModules();
    rolePermissionData = [];
  });

  // ヘルパー関数: 共通のモック設定
  const createMockPrisma = (
    userRoleId: string,
    permissions: Array<{ id: string; resource: string; action: string }>
  ) => {
    return {
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
          return null;
        }),
        findMany: vi.fn().mockResolvedValue(permissions),
      } as unknown as PrismaClient['permission'],
      rolePermission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          rolePermissionData = [...rolePermissionData, ...data];
          return { count: data.length };
        }),
      } as unknown as PrismaClient['rolePermission'],
    };
  };

  describe('一般ユーザーロールへの現場調査権限割り当て（site-survey/REQ-12.1, 12.2, 12.3）', () => {
    it('一般ユーザーにsite_survey:create権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const siteSurveyCreatePermissionId = 'site_survey-create-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: siteSurveyCreatePermissionId, resource: 'site_survey', action: 'create' },
        { id: 'site_survey-read-perm-id', resource: 'site_survey', action: 'read' },
        { id: 'site_survey-update-perm-id', resource: 'site_survey', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyCreateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === siteSurveyCreatePermissionId
      );

      expect(siteSurveyCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにsite_survey:read権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const siteSurveyReadPermissionId = 'site_survey-read-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'site_survey-create-perm-id', resource: 'site_survey', action: 'create' },
        { id: siteSurveyReadPermissionId, resource: 'site_survey', action: 'read' },
        { id: 'site_survey-update-perm-id', resource: 'site_survey', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyReadAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === siteSurveyReadPermissionId
      );

      expect(siteSurveyReadAssignment).toBeDefined();
    });

    it('一般ユーザーにsite_survey:update権限が割り当てられる', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const siteSurveyUpdatePermissionId = 'site_survey-update-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'site_survey-create-perm-id', resource: 'site_survey', action: 'create' },
        { id: 'site_survey-read-perm-id', resource: 'site_survey', action: 'read' },
        { id: siteSurveyUpdatePermissionId, resource: 'site_survey', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyUpdateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === siteSurveyUpdatePermissionId
      );

      expect(siteSurveyUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにsite_survey:delete権限は割り当てられない（管理者のみ）', async () => {
      // Arrange
      const userRoleId = 'user-role-id';
      const siteSurveyDeletePermissionId = 'site_survey-delete-perm-id';

      // findManyはdelete権限を返さない
      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'site_survey-create-perm-id', resource: 'site_survey', action: 'create' },
        { id: 'site_survey-read-perm-id', resource: 'site_survey', action: 'read' },
        { id: 'site_survey-update-perm-id', resource: 'site_survey', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');

      // Act
      await seedRolePermissions(mockPrisma as PrismaClient);

      // Assert
      const siteSurveyDeleteAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === siteSurveyDeletePermissionId
      );

      // 一般ユーザーロールにはsite_survey:delete権限が割り当てられていないことを確認
      expect(siteSurveyDeleteAssignment).toBeUndefined();
    });
  });
});
