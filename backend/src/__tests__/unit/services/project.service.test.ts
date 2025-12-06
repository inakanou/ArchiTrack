/**
 * @fileoverview ProjectService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.7, 1.8, 1.14, 1.15: プロジェクト作成（初期ステータス履歴含む）
 * - 2.1, 2.2, 2.6: プロジェクト一覧表示
 * - 3.1, 3.2, 3.3, 3.4, 3.5: ページネーション
 * - 4.1: 検索
 * - 5.1, 5.2, 5.3, 5.4: フィルタリング
 * - 6.1, 6.2, 6.5: ソート
 * - 7.1: プロジェクト詳細取得
 * - 8.2, 8.3, 8.6: プロジェクト更新（楽観的排他制御）
 * - 9.2, 9.6: プロジェクト論理削除
 * - 11.5, 11.6: 関連データ件数取得（機能フラグ対応）
 * - 12.4, 12.6: 監査ログ連携
 * - 13.4, 13.6: 担当者IDバリデーション
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProjectService,
  type ProjectServiceDependencies,
} from '../../../services/project.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import type { CreateProjectInput, UpdateProjectInput } from '../../../schemas/project.schema.js';
import {
  ProjectNotFoundError,
  ProjectConflictError,
  ProjectValidationError,
} from '../../../errors/projectError.js';

// テスト用モック
function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    projectStatusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: {
          findUnique: vi.fn(),
        },
        project: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        projectStatusHistory: {
          create: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

function createMockAuditLogService(): IAuditLogService {
  return {
    createLog: vi.fn().mockResolvedValue({ id: 'audit-log-id' }),
    getLogs: vi.fn().mockResolvedValue([]),
    exportLogs: vi.fn().mockResolvedValue('[]'),
  };
}

// テスト用サンプルデータ
const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
  displayName: 'テストユーザー',
  passwordHash: 'hash',
  twoFactorEnabled: false,
  isLocked: false,
  loginFailures: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockAdminUser = {
  ...mockUser,
  id: 'admin-id',
  email: 'admin@example.com',
  userRoles: [{ role: { name: 'admin' } }],
};

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  customerName: 'テスト顧客',
  salesPersonId: 'user-123',
  constructionPersonId: null,
  siteAddress: '東京都渋谷区1-1-1',
  description: 'テスト概要',
  status: 'PREPARING',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  deletedAt: null,
  createdById: 'user-123',
  salesPerson: mockUser,
  constructionPerson: null,
  createdBy: mockUser,
};

describe('ProjectService', () => {
  let service: ProjectService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();

    const deps: ProjectServiceDependencies = {
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    };

    service = new ProjectService(deps);
  });

  describe('createProject', () => {
    const validInput: CreateProjectInput = {
      name: 'テストプロジェクト',
      customerName: 'テスト顧客',
      salesPersonId: 'user-123',
      constructionPersonId: 'user-456',
      siteAddress: '東京都渋谷区1-1-1',
      description: 'テスト概要',
    };

    it('正常にプロジェクトを作成し、初期ステータス履歴を記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdProject = {
        ...mockProject,
        salesPerson: mockUser,
        constructionPerson: { ...mockUser, id: 'user-456', displayName: '工事担当者' },
        createdBy: { ...mockUser, id: actorId },
      };

      // トランザクション内のモック設定
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce({ ...mockUser, userRoles: [] }) // salesPerson
              .mockResolvedValueOnce({ ...mockUser, id: 'user-456', userRoles: [] }), // constructionPerson
          },
          project: {
            create: vi.fn().mockResolvedValue(createdProject),
          },
          projectStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'history-1' }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createProject(validInput, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('テストプロジェクト');
      expect(result.status).toBe('PREPARING');
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_CREATED',
          actorId,
          targetType: 'Project',
        })
      );
    });

    it('営業担当者がadminの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithAdmin: CreateProjectInput = {
        ...validInput,
        salesPersonId: 'admin-id',
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockAdminUser,
              userRoles: [{ role: { name: 'admin' } }],
            }),
          },
          project: { create: vi.fn() },
          projectStatusHistory: { create: vi.fn() },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createProject(inputWithAdmin, actorId)).rejects.toThrow(
        ProjectValidationError
      );
    });

    it('営業担当者が存在しない場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
          project: { create: vi.fn() },
          projectStatusHistory: { create: vi.fn() },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createProject(validInput, actorId)).rejects.toThrow(
        ProjectValidationError
      );
    });

    it('工事担当者がadminの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithAdminConstruction: CreateProjectInput = {
        ...validInput,
        constructionPersonId: 'admin-id',
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce({ ...mockUser, userRoles: [] }) // salesPerson
              .mockResolvedValueOnce({
                ...mockAdminUser,
                userRoles: [{ role: { name: 'admin' } }],
              }), // constructionPerson is admin
          },
          project: { create: vi.fn() },
          projectStatusHistory: { create: vi.fn() },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createProject(inputWithAdminConstruction, actorId)).rejects.toThrow(
        ProjectValidationError
      );
    });

    it('工事担当者が存在しない場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithInvalidConstruction: CreateProjectInput = {
        ...validInput,
        constructionPersonId: 'invalid-user-id',
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce({ ...mockUser, userRoles: [] }) // salesPerson exists
              .mockResolvedValueOnce(null), // constructionPerson does not exist
          },
          project: { create: vi.fn() },
          projectStatusHistory: { create: vi.fn() },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createProject(inputWithInvalidConstruction, actorId)).rejects.toThrow(
        ProjectValidationError
      );
    });

    it('工事担当者がnullの場合は正常に作成される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithoutConstruction: CreateProjectInput = {
        ...validInput,
        constructionPersonId: undefined,
      };
      const createdProject = {
        ...mockProject,
        constructionPersonId: null,
        constructionPerson: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            create: vi.fn().mockResolvedValue(createdProject),
          },
          projectStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'history-1' }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createProject(inputWithoutConstruction, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.constructionPerson).toBeUndefined();
    });
  });

  describe('getProjects', () => {
    it('ページネーション付きでプロジェクト一覧を取得する', async () => {
      // Arrange
      const projects = [mockProject];
      mockPrisma.project.findMany = vi.fn().mockResolvedValue(projects);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.getProjects(
        {},
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('検索キーワードでフィルタリングする', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.getProjects(
        { search: 'テスト' },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.arrayContaining([
              { name: { contains: 'テスト', mode: 'insensitive' } },
              { customerName: { contains: 'テスト', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('ステータスでフィルタリングする', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.getProjects(
        { status: ['PREPARING', 'SURVEYING'] },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PREPARING', 'SURVEYING'] },
          }),
        })
      );
    });

    it('作成日範囲でフィルタリングする', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.getProjects(
        { createdFrom: '2024-01-01', createdTo: '2024-12-31' },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('ソート順序を適用する', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      await service.getProjects({}, { page: 1, limit: 20 }, { sort: 'name', order: 'asc' });

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });

    it('論理削除されたプロジェクトを除外する', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(0);

      // Act
      await service.getProjects({}, { page: 1, limit: 20 }, { sort: 'updatedAt', order: 'desc' });

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });

    it('ページ2を正しく取得する', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(30);

      // Act
      const result = await service.getProjects(
        {},
        { page: 2, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20,
        })
      );
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('getProject', () => {
    it('プロジェクト詳細を取得する', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(mockProject);

      // Act
      const result = await service.getProject('project-123');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('project-123');
      expect(result.name).toBe('テストプロジェクト');
    });

    it('存在しないプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getProject('non-existent-id')).rejects.toThrow(ProjectNotFoundError);
    });

    it('論理削除されたプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue({
        ...mockProject,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.getProject('project-123')).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('updateProject', () => {
    const updateInput: UpdateProjectInput = {
      name: '更新後プロジェクト名',
      customerName: '更新後顧客名',
    };
    const expectedUpdatedAt = new Date('2024-01-02');

    it('正常にプロジェクトを更新する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updatedProject = {
        ...mockProject,
        ...updateInput,
        updatedAt: new Date('2024-01-03'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            update: vi.fn().mockResolvedValue(updatedProject),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateProject(
        'project-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('更新後プロジェクト名');
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_UPDATED',
          actorId,
          targetType: 'Project',
          targetId: 'project-123',
        })
      );
    });

    it('楽観的排他制御エラーの場合は競合エラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const olderUpdatedAt = new Date('2024-01-01');
      const projectWithNewerUpdate = {
        ...mockProject,
        updatedAt: new Date('2024-01-03'), // より新しい更新日時
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(projectWithNewerUpdate),
            update: vi.fn(),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(
        service.updateProject('project-123', updateInput, actorId, olderUpdatedAt)
      ).rejects.toThrow(ProjectConflictError);
    });

    it('存在しないプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(
        service.updateProject('non-existent-id', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('論理削除されたプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockProject,
              deletedAt: new Date(),
            }),
            update: vi.fn(),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(
        service.updateProject('project-123', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('営業担当者を更新する場合、admin以外であることを検証する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithSalesPerson: UpdateProjectInput = {
        salesPersonId: 'new-sales-person-id',
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            update: vi.fn(),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockAdminUser,
              userRoles: [{ role: { name: 'admin' } }],
            }),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(
        service.updateProject('project-123', inputWithSalesPerson, actorId, expectedUpdatedAt)
      ).rejects.toThrow(ProjectValidationError);
    });
  });

  describe('deleteProject', () => {
    it('正常にプロジェクトを論理削除する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const deletedProject = {
        ...mockProject,
        deletedAt: new Date(),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            update: vi.fn().mockResolvedValue(deletedProject),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteProject('project-123', actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_DELETED',
          actorId,
          targetType: 'Project',
          targetId: 'project-123',
        })
      );
    });

    it('存在しないプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.deleteProject('non-existent-id', actorId)).rejects.toThrow(
        ProjectNotFoundError
      );
    });

    it('既に論理削除されたプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockProject,
              deletedAt: new Date(),
            }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.deleteProject('project-123', actorId)).rejects.toThrow(
        ProjectNotFoundError
      );
    });
  });

  describe('getRelatedCounts', () => {
    it('関連データ件数を取得する（機能無効時は0を返す）', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(mockProject);

      // Act
      const result = await service.getRelatedCounts('project-123');

      // Assert
      expect(result).toBeDefined();
      expect(result.surveyCount).toBe(0);
      expect(result.estimateCount).toBe(0);
    });

    it('存在しないプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getRelatedCounts('non-existent-id')).rejects.toThrow(
        ProjectNotFoundError
      );
    });
  });

  describe('validateAssignableUser', () => {
    it('admin以外の有効なユーザーは検証を通過する', async () => {
      // 内部メソッドのテストはcreateProjectのテストで間接的に実施
      // Arrange
      const actorId = 'actor-123';
      const createdProject = {
        ...mockProject,
        salesPerson: mockUser,
        constructionPerson: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockUser,
              userRoles: [{ role: { name: 'user' } }],
            }),
          },
          project: {
            create: vi.fn().mockResolvedValue(createdProject),
          },
          projectStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'history-1' }),
          },
        };
        return fn(tx);
      });

      const input: CreateProjectInput = {
        name: 'テストプロジェクト',
        customerName: 'テスト顧客',
        salesPersonId: 'user-123',
      };

      // Act
      const result = await service.createProject(input, actorId);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
