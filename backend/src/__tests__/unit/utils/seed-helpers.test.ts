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
 *
 * Requirements (contract-management):
 * - 13.1, 13.2, 13.3, 13.4: 契約書管理権限の定義
 *   - contract:create, contract:read, contract:update, contract:delete権限
 *   - 一般ユーザーロールへの契約書基本権限割り当て（削除権限は管理者のみ）
 *
 * Task 11.2: 契約書操作用の権限をシステムに定義する
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
      // project の権限は CRUD の 4 つと、全案件閲覧（read_all。user-authentication 要件39.5）の 5 つ
      const projectPermissions = createManyData.filter((perm) => perm.resource === 'project');

      expect(projectPermissions).toHaveLength(5);
      const actions = projectPermissions.map((perm) => perm.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
      expect(actions).toContain('read_all');
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

/**
 * 契約書権限のテスト（contract-management/REQ-13.1, 13.2, 13.3, 13.4）
 * Task 11.2: 契約書操作用の権限をシステムに定義する
 */
describe('seedPermissions - 契約書管理権限', () => {
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

  describe('契約書権限の定義（contract-management/REQ-13.3）', () => {
    it('contract:create権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const contractCreatePerm = createManyData.find(
        (perm) => perm.resource === 'contract' && perm.action === 'create'
      );

      expect(contractCreatePerm).toBeDefined();
      expect(contractCreatePerm!.description).toBe('契約書の作成');
    });

    it('contract:read権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const contractReadPerm = createManyData.find(
        (perm) => perm.resource === 'contract' && perm.action === 'read'
      );

      expect(contractReadPerm).toBeDefined();
      expect(contractReadPerm!.description).toBe('契約書の閲覧');
    });

    it('contract:update権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const contractUpdatePerm = createManyData.find(
        (perm) => perm.resource === 'contract' && perm.action === 'update'
      );

      expect(contractUpdatePerm).toBeDefined();
      expect(contractUpdatePerm!.description).toBe('契約書の更新');
    });

    it('contract:delete権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const contractDeletePerm = createManyData.find(
        (perm) => perm.resource === 'contract' && perm.action === 'delete'
      );

      expect(contractDeletePerm).toBeDefined();
      expect(contractDeletePerm!.description).toBe('契約書の削除');
    });

    it('全4つの契約書権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const contractPermissions = createManyData.filter((perm) => perm.resource === 'contract');

      expect(contractPermissions).toHaveLength(4);
      const actions = contractPermissions.map((perm) => perm.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions - 契約書管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let rolePermissionData: Array<{ roleId: string; permissionId: string }>;

  beforeEach(() => {
    vi.resetModules();
    rolePermissionData = [];
  });

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

  describe('一般ユーザーロールへの契約書権限割り当て（contract-management/REQ-13.3）', () => {
    it('一般ユーザーにcontract:create権限が割り当てられる', async () => {
      const userRoleId = 'user-role-id';
      const contractCreatePermissionId = 'contract-create-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: contractCreatePermissionId, resource: 'contract', action: 'create' },
        { id: 'contract-read-perm-id', resource: 'contract', action: 'read' },
        { id: 'contract-update-perm-id', resource: 'contract', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
      await seedRolePermissions(mockPrisma as PrismaClient);

      const contractCreateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === contractCreatePermissionId
      );

      expect(contractCreateAssignment).toBeDefined();
    });

    it('一般ユーザーにcontract:read権限が割り当てられる', async () => {
      const userRoleId = 'user-role-id';
      const contractReadPermissionId = 'contract-read-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'contract-create-perm-id', resource: 'contract', action: 'create' },
        { id: contractReadPermissionId, resource: 'contract', action: 'read' },
        { id: 'contract-update-perm-id', resource: 'contract', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
      await seedRolePermissions(mockPrisma as PrismaClient);

      const contractReadAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === contractReadPermissionId
      );

      expect(contractReadAssignment).toBeDefined();
    });

    it('一般ユーザーにcontract:update権限が割り当てられる', async () => {
      const userRoleId = 'user-role-id';
      const contractUpdatePermissionId = 'contract-update-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'contract-create-perm-id', resource: 'contract', action: 'create' },
        { id: 'contract-read-perm-id', resource: 'contract', action: 'read' },
        { id: contractUpdatePermissionId, resource: 'contract', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
      await seedRolePermissions(mockPrisma as PrismaClient);

      const contractUpdateAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === contractUpdatePermissionId
      );

      expect(contractUpdateAssignment).toBeDefined();
    });

    it('一般ユーザーにcontract:delete権限は割り当てられない（管理者のみ）', async () => {
      const userRoleId = 'user-role-id';
      const contractDeletePermissionId = 'contract-delete-perm-id';

      mockPrisma = createMockPrisma(userRoleId, [
        { id: 'contract-create-perm-id', resource: 'contract', action: 'create' },
        { id: 'contract-read-perm-id', resource: 'contract', action: 'read' },
        { id: 'contract-update-perm-id', resource: 'contract', action: 'update' },
        { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
      ]);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
      await seedRolePermissions(mockPrisma as PrismaClient);

      const contractDeleteAssignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === contractDeletePermissionId
      );

      // 一般ユーザーロールにはcontract:delete権限が割り当てられていないことを確認
      expect(contractDeleteAssignment).toBeUndefined();
    });
  });
});

/**
 * 工事写真・工事看板権限のテスト（construction-photo/REQ-13.1, 13.3）
 * Task 1.2: 工事写真・工事看板操作用の権限をシステムに定義し、既存ロールへ割り当てる
 *   - construction_photo:{create,read,update,delete}
 *   - construction_signboard:{create,read,update,delete}
 * 権限モデルは現場調査（site_survey）と同等: 一般ユーザーは create/read/update、delete は管理者のみ。
 */
describe('seedPermissions - 工事写真・工事看板管理権限', () => {
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

  describe('工事写真権限の定義（construction-photo/REQ-13.3）', () => {
    it.each([
      ['create', '工事写真の作成'],
      ['read', '工事写真の閲覧'],
      ['update', '工事写真の更新'],
      ['delete', '工事写真の削除'],
    ])('construction_photo:%s権限が定義されている', async (action, description) => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const perm = createManyData.find(
        (p) => p.resource === 'construction_photo' && p.action === action
      );

      expect(perm).toBeDefined();
      expect(perm!.description).toBe(description);
    });

    it('全4つの工事写真権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const perms = createManyData.filter((p) => p.resource === 'construction_photo');
      expect(perms).toHaveLength(4);
      const actions = perms.map((p) => p.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });

  describe('工事看板権限の定義（construction-photo/REQ-13.3）', () => {
    it.each([
      ['create', '工事看板の作成'],
      ['read', '工事看板の閲覧'],
      ['update', '工事看板の更新'],
      ['delete', '工事看板の削除'],
    ])('construction_signboard:%s権限が定義されている', async (action, description) => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const perm = createManyData.find(
        (p) => p.resource === 'construction_signboard' && p.action === action
      );

      expect(perm).toBeDefined();
      expect(perm!.description).toBe(description);
    });

    it('全4つの工事看板権限が定義されている', async () => {
      const { seedPermissions } = await import('../../../utils/seed-helpers.js');
      await seedPermissions(mockPrisma as PrismaClient);

      const perms = createManyData.filter((p) => p.resource === 'construction_signboard');
      expect(perms).toHaveLength(4);
      const actions = perms.map((p) => p.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
    });
  });
});

describe('seedRolePermissions - 工事写真・工事看板管理権限', () => {
  let mockPrisma: Partial<PrismaClient>;
  let rolePermissionData: Array<{ roleId: string; permissionId: string }>;

  beforeEach(() => {
    vi.resetModules();
    rolePermissionData = [];
  });

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

  // 現場調査と同等の権限モデル: user は create/read/update を保有、delete は管理者のみ
  const userGrantedPermissions = [
    { id: 'construction_photo-create-perm-id', resource: 'construction_photo', action: 'create' },
    { id: 'construction_photo-read-perm-id', resource: 'construction_photo', action: 'read' },
    { id: 'construction_photo-update-perm-id', resource: 'construction_photo', action: 'update' },
    {
      id: 'construction_signboard-create-perm-id',
      resource: 'construction_signboard',
      action: 'create',
    },
    {
      id: 'construction_signboard-read-perm-id',
      resource: 'construction_signboard',
      action: 'read',
    },
    {
      id: 'construction_signboard-update-perm-id',
      resource: 'construction_signboard',
      action: 'update',
    },
    { id: 'adr-read-perm-id', resource: 'adr', action: 'read' },
  ];

  describe('一般ユーザーロールへの工事写真・工事看板権限割り当て（construction-photo/REQ-13.1, 13.3）', () => {
    it.each([
      ['construction_photo', 'create', 'construction_photo-create-perm-id'],
      ['construction_photo', 'read', 'construction_photo-read-perm-id'],
      ['construction_photo', 'update', 'construction_photo-update-perm-id'],
      ['construction_signboard', 'create', 'construction_signboard-create-perm-id'],
      ['construction_signboard', 'read', 'construction_signboard-read-perm-id'],
      ['construction_signboard', 'update', 'construction_signboard-update-perm-id'],
    ])('一般ユーザーに%s:%s権限が割り当てられる', async (_resource, _action, permissionId) => {
      const userRoleId = 'user-role-id';
      mockPrisma = createMockPrisma(userRoleId, userGrantedPermissions);

      const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
      await seedRolePermissions(mockPrisma as PrismaClient);

      const assignment = rolePermissionData.find(
        (item) => item.roleId === userRoleId && item.permissionId === permissionId
      );

      expect(assignment).toBeDefined();
    });

    it.each([
      ['construction_photo', 'construction_photo-delete-perm-id'],
      ['construction_signboard', 'construction_signboard-delete-perm-id'],
    ])(
      '一般ユーザーに%s:delete権限は割り当てられない（管理者のみ）',
      async (_resource, permissionId) => {
        const userRoleId = 'user-role-id';
        // findMany は delete 権限を返さない（seedRolePermissions が要求しないため）
        mockPrisma = createMockPrisma(userRoleId, userGrantedPermissions);

        const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
        await seedRolePermissions(mockPrisma as PrismaClient);

        const assignment = rolePermissionData.find(
          (item) => item.roleId === userRoleId && item.permissionId === permissionId
        );

        expect(assignment).toBeUndefined();
      }
    );
  });
});

/**
 * 既定の権限の改め（user-authentication タスク44.4）
 *
 * - 要件38.4: 一般ユーザーロールの既定権限にユーザー一覧の閲覧（user:read）を含めない
 * - 要件39.5: システム管理者ロールの既定権限に全案件閲覧（project:read_all）を含める。
 *   システム管理者は *:* で全てを持つため、project:read_all と ops:manage は一般ユーザーへ割り当てない
 */
describe('既定の権限（user-authentication/38.4・39.5）', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('全案件閲覧（project:read_all）と運用設定の管理（ops:manage）の権限が定義されている', async () => {
    let createManyData: Array<{ resource: string; action: string; description: string }> = [];
    const mockPrisma = {
      permission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createManyData = data;
          return { count: data.length };
        }),
      },
    } as unknown as PrismaClient;

    const { seedPermissions } = await import('../../../utils/seed-helpers.js');
    await seedPermissions(mockPrisma);

    const keys = createManyData.map((p) => `${p.resource}:${p.action}`);
    expect(keys).toContain('project:read_all');
    expect(keys).toContain('ops:manage');
    // ユーザー一覧の閲覧の権限そのものは残す（管理者が使う。外すのは一般ユーザーへの割り当て）
    expect(keys).toContain('user:read');
  });

  it('一般ユーザーロールへ割り当てる権限に user:read・project:read_all・ops:manage を含めず、システム管理者ロールへ *:* を割り当てる', async () => {
    const assignments: Array<{ roleId: string; permissionId: string }> = [];
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'adr-read-perm-id', resource: 'adr', action: 'read' }]);
    const mockPrisma = {
      role: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
          if (where.name === 'user') return { id: 'user-role-id', name: 'user' };
          return null;
        }),
      },
      permission: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where.resource === '*' && where.action === '*') {
            return { id: 'all-perm-id', resource: '*', action: '*' };
          }
          return null;
        }),
        findMany,
      },
      rolePermission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          assignments.push(...data);
          return { count: data.length };
        }),
      },
    } as unknown as PrismaClient;

    const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
    await seedRolePermissions(mockPrisma);

    // 一般ユーザーロールへ割り当てる権限の問い合わせ（findMany の OR）が要求する集合
    expect(findMany).toHaveBeenCalledTimes(1);
    const requested = (
      findMany.mock.calls[0]![0] as { where: { OR: Array<{ resource: string; action: string }> } }
    ).where.OR.map((p) => `${p.resource}:${p.action}`);
    expect(requested).not.toContain('user:read');
    expect(requested).not.toContain('project:read_all');
    expect(requested).not.toContain('ops:manage');
    expect(requested).toContain('project:read');

    expect(assignments).toContainEqual({ roleId: 'admin-role-id', permissionId: 'all-perm-id' });
  });
});

/**
 * 外部の AI での読み取りの専用の権限（estimate-request の 49.6、design の D7。Task 112.1）
 * claude_vision:use を定義し、一般ユーザーロールへ割り当てる（見積依頼の閲覧と同じ利用者が使える）
 */
describe('seed - 外部の AI での読み取りの専用の権限（claude_vision:use）', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('claude_vision:use の権限が定義されている', async () => {
    let createManyData: Array<{ resource: string; action: string; description: string }> = [];
    const mockPrisma = {
      permission: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createManyData = data;
          return { count: data.length };
        }),
      },
    } as unknown as PrismaClient;

    const { seedPermissions } = await import('../../../utils/seed-helpers.js');
    await seedPermissions(mockPrisma);

    const perm = createManyData.find((p) => p.resource === 'claude_vision' && p.action === 'use');
    expect(perm).toBeDefined();
    expect(perm!.description).toBe('外部のAIでの読み取りの利用');
  });

  it('一般ユーザーロールへ割り当てる権限に claude_vision:use を含める', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const mockPrisma = {
      role: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.name === 'admin') return { id: 'admin-role-id', name: 'admin' };
          if (where.name === 'user') return { id: 'user-role-id', name: 'user' };
          return null;
        }),
      },
      permission: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany,
      },
      rolePermission: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient;

    const { seedRolePermissions } = await import('../../../utils/seed-helpers.js');
    await seedRolePermissions(mockPrisma);

    const requested = (
      findMany.mock.calls[0]![0] as { where: { OR: Array<{ resource: string; action: string }> } }
    ).where.OR.map((p) => `${p.resource}:${p.action}`);
    expect(requested).toContain('claude_vision:use');
    expect(requested).toContain('estimate_request:read');
  });
});
