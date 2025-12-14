/**
 * @fileoverview ProjectService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.7, 1.8, 1.14, 1.15: プロジェクト作成（初期ステータス履歴含む）
 * - 2.1, 2.2, 2.6: プロジェクト一覧表示
 * - 3.1, 3.2, 3.3, 3.4, 3.5: ページネーション
 * - 4.1, 4.1a, 4.1b: 検索（プロジェクト名・顧客名・営業担当者・工事担当者）
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
  DuplicateProjectNameError,
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

const mockTradingPartner = {
  id: 'trading-partner-123',
  name: 'テスト取引先',
  nameKana: 'テストトリヒキサキ',
};

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  tradingPartnerId: 'trading-partner-123',
  tradingPartner: mockTradingPartner,
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
      tradingPartnerId: 'trading-partner-123',
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
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
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
          project: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
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
          project: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
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
          project: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
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
          project: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
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
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
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
    /**
     * 検索対象拡張のテスト（Requirements: 4.1a, 4.1b）
     *
     * 検索対象:
     * - プロジェクト名
     * - 顧客名（取引先名）
     * - 顧客名フリガナ（取引先フリガナ）
     * - 営業担当者の表示名 (4.1a)
     * - 工事担当者の表示名 (4.1b)
     */
    describe('検索対象拡張 (4.1a, 4.1b)', () => {
      it('営業担当者名で検索できる', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          { search: 'テストユーザー' },
          { page: 1, limit: 20 },
          { sort: 'updatedAt', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
              OR: expect.arrayContaining([
                {
                  salesPerson: { displayName: { contains: 'テストユーザー', mode: 'insensitive' } },
                },
              ]),
            }),
          })
        );
      });

      it('工事担当者名で検索できる', async () => {
        // Arrange
        const projectWithConstruction = {
          ...mockProject,
          constructionPersonId: 'user-456',
          constructionPerson: { id: 'user-456', displayName: '工事担当者' },
        };
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([projectWithConstruction]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          { search: '工事担当者' },
          { page: 1, limit: 20 },
          { sort: 'updatedAt', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
              OR: expect.arrayContaining([
                {
                  constructionPerson: {
                    displayName: { contains: '工事担当者', mode: 'insensitive' },
                  },
                },
              ]),
            }),
          })
        );
      });

      it('検索キーワードがプロジェクト名、顧客名、営業担当者、工事担当者のいずれかにマッチする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          { search: '検索キーワード' },
          { page: 1, limit: 20 },
          { sort: 'updatedAt', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
              OR: [
                { name: { contains: '検索キーワード', mode: 'insensitive' } },
                { tradingPartner: { name: { contains: '検索キーワード', mode: 'insensitive' } } },
                {
                  tradingPartner: { nameKana: { contains: '検索キーワード', mode: 'insensitive' } },
                },
                {
                  salesPerson: { displayName: { contains: '検索キーワード', mode: 'insensitive' } },
                },
                {
                  constructionPerson: {
                    displayName: { contains: '検索キーワード', mode: 'insensitive' },
                  },
                },
              ],
            }),
          })
        );
      });
    });

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
              { tradingPartner: { name: { contains: 'テスト', mode: 'insensitive' } } },
              { tradingPartner: { nameKana: { contains: 'テスト', mode: 'insensitive' } } },
              { salesPerson: { displayName: { contains: 'テスト', mode: 'insensitive' } } },
              { constructionPerson: { displayName: { contains: 'テスト', mode: 'insensitive' } } },
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

    /**
     * ソートロジック拡張のテスト（Task 21.5, Requirements: 6.5）
     *
     * リレーションフィールドでのソート対応:
     * - customerName -> tradingPartner.name
     * - salesPersonName -> salesPerson.displayName
     * - constructionPersonName -> constructionPerson.displayName
     */
    describe('ソートロジック拡張 (Task 21.5, 6.5)', () => {
      it('customerNameでソートする場合はtradingPartner.nameでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'customerName', order: 'asc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { tradingPartner: { name: 'asc' } },
          })
        );
      });

      it('customerNameで降順ソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'customerName', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { tradingPartner: { name: 'desc' } },
          })
        );
      });

      it('salesPersonNameでソートする場合はsalesPerson.displayNameでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'salesPersonName', order: 'asc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { salesPerson: { displayName: 'asc' } },
          })
        );
      });

      it('salesPersonNameで降順ソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'salesPersonName', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { salesPerson: { displayName: 'desc' } },
          })
        );
      });

      it('constructionPersonNameでソートする場合はconstructionPerson.displayNameでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'constructionPersonName', order: 'asc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { constructionPerson: { displayName: 'asc' } },
          })
        );
      });

      it('constructionPersonNameで降順ソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects(
          {},
          { page: 1, limit: 20 },
          { sort: 'constructionPersonName', order: 'desc' }
        );

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { constructionPerson: { displayName: 'desc' } },
          })
        );
      });

      it('statusでソートする場合は従来通りstatusフィールドでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects({}, { page: 1, limit: 20 }, { sort: 'status', order: 'asc' });

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { status: 'asc' },
          })
        );
      });

      it('createdAtでソートする場合は従来通りcreatedAtフィールドでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects({}, { page: 1, limit: 20 }, { sort: 'createdAt', order: 'desc' });

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: 'desc' },
          })
        );
      });

      it('updatedAtでソートする場合は従来通りupdatedAtフィールドでソートする', async () => {
        // Arrange
        mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
        mockPrisma.project.count = vi.fn().mockResolvedValue(1);

        // Act
        await service.getProjects({}, { page: 1, limit: 20 }, { sort: 'updatedAt', order: 'asc' });

        // Assert
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { updatedAt: 'asc' },
          })
        );
      });
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
      tradingPartnerId: 'trading-partner-456',
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
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
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
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
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
        tradingPartnerId: 'trading-partner-123',
        salesPersonId: 'user-123',
      };

      // Act
      const result = await service.createProject(input, actorId);

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('createProject - 初期ステータス履歴の詳細検証', () => {
    it('初期ステータス履歴でtransitionType=initialとfromStatus=nullを記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const validInput: CreateProjectInput = {
        name: 'テストプロジェクト',
        tradingPartnerId: 'trading-partner-123',
        salesPersonId: 'user-123',
      };
      const createdProject = {
        ...mockProject,
        salesPerson: mockUser,
        constructionPerson: null,
      };

      let capturedHistoryData: unknown = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
            create: vi.fn().mockResolvedValue(createdProject),
          },
          projectStatusHistory: {
            create: vi.fn().mockImplementation((args) => {
              capturedHistoryData = args.data;
              return Promise.resolve({ id: 'history-1' });
            }),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createProject(validInput, actorId);

      // Assert
      expect(capturedHistoryData).toEqual(
        expect.objectContaining({
          fromStatus: null,
          toStatus: 'PREPARING',
          transitionType: 'initial',
          reason: null,
          changedById: actorId,
        })
      );
    });

    it('監査ログにプロジェクト作成時のafter状態が記録される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const validInput: CreateProjectInput = {
        name: '新規プロジェクト',
        tradingPartnerId: 'trading-partner-new',
        salesPersonId: 'user-123',
        siteAddress: '東京都新宿区',
        description: '詳細説明',
      };
      const createdProject = {
        id: 'new-project-id',
        name: '新規プロジェクト',
        tradingPartnerId: 'trading-partner-new',
        tradingPartner: {
          id: 'trading-partner-new',
          name: '新規取引先',
          nameKana: 'シンキトリヒキサキ',
        },
        salesPersonId: 'user-123',
        constructionPersonId: null,
        siteAddress: '東京都新宿区',
        description: '詳細説明',
        status: 'PREPARING',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: actorId,
        salesPerson: mockUser,
        constructionPerson: null,
        createdBy: mockUser,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
            create: vi.fn().mockResolvedValue(createdProject),
          },
          projectStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'history-1' }),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createProject(validInput, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_CREATED',
          before: null,
          after: expect.objectContaining({
            name: '新規プロジェクト',
            tradingPartnerId: 'trading-partner-new',
            status: 'PREPARING',
          }),
        })
      );
    });
  });

  describe('getProjects - 追加テスト', () => {
    it('プロジェクトが0件の場合は空配列とtotalPages=0を返す', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(0);

      // Act
      const result = await service.getProjects(
        {},
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('createdFromのみ指定した場合は開始日以降でフィルタリングする', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      await service.getProjects(
        { createdFrom: '2024-01-01' },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('createdToのみ指定した場合は終了日以前でフィルタリングする', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      await service.getProjects(
        { createdTo: '2024-12-31' },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('空のステータス配列の場合はステータスフィルタを適用しない', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      await service.getProjects(
        { status: [] },
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            status: expect.anything(),
          }),
        })
      );
    });

    it('複数のフィルタを組み合わせて適用する', async () => {
      // Arrange
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([mockProject]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      await service.getProjects(
        {
          search: 'テスト',
          status: ['PREPARING'],
          createdFrom: '2024-01-01',
          createdTo: '2024-12-31',
        },
        { page: 1, limit: 20 },
        { sort: 'createdAt', order: 'asc' }
      );

      // Assert
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.any(Array),
            status: { in: ['PREPARING'] },
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
          orderBy: { createdAt: 'asc' },
        })
      );
    });

    it('工事担当者がいるプロジェクトの情報を正しく変換する', async () => {
      // Arrange
      const projectWithConstruction = {
        ...mockProject,
        constructionPersonId: 'user-456',
        constructionPerson: { id: 'user-456', displayName: '工事担当者' },
      };
      mockPrisma.project.findMany = vi.fn().mockResolvedValue([projectWithConstruction]);
      mockPrisma.project.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.getProjects(
        {},
        { page: 1, limit: 20 },
        { sort: 'updatedAt', order: 'desc' }
      );

      // Assert
      expect(result.data[0]).toBeDefined();
      expect(result.data[0]!.constructionPerson).toBeDefined();
      expect(result.data[0]!.constructionPerson?.displayName).toBe('工事担当者');
    });
  });

  describe('getProject - 追加テスト', () => {
    it('工事担当者がいるプロジェクトの詳細を正しく取得する', async () => {
      // Arrange
      const projectWithConstruction = {
        ...mockProject,
        constructionPersonId: 'user-456',
        constructionPerson: { id: 'user-456', displayName: '工事担当者' },
      };
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(projectWithConstruction);

      // Act
      const result = await service.getProject('project-123');

      // Assert
      expect(result.constructionPerson).toBeDefined();
      expect(result.constructionPerson?.displayName).toBe('工事担当者');
    });

    it('オプショナルフィールドがnullの場合は結果に含まれない', async () => {
      // Arrange
      const projectWithNulls = {
        ...mockProject,
        siteAddress: null,
        description: null,
        constructionPersonId: null,
        constructionPerson: null,
      };
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(projectWithNulls);

      // Act
      const result = await service.getProject('project-123');

      // Assert
      expect(result.siteAddress).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.constructionPerson).toBeUndefined();
    });

    it('createdByの情報が正しく取得される', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(mockProject);

      // Act
      const result = await service.getProject('project-123');

      // Assert
      expect(result.createdBy).toBeDefined();
      expect(result.createdBy.displayName).toBe('テストユーザー');
    });

    it('ステータスラベルが正しく設定される', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue(mockProject);

      // Act
      const result = await service.getProject('project-123');

      // Assert
      expect(result.status).toBe('PREPARING');
      expect(result.statusLabel).toBe('準備中');
    });
  });

  describe('updateProject - 追加テスト', () => {
    const expectedUpdatedAt = new Date('2024-01-02');

    it('constructionPersonIdをnullに設定して工事担当者を削除する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const projectWithConstruction = {
        ...mockProject,
        constructionPersonId: 'user-456',
        constructionPerson: { id: 'user-456', displayName: '工事担当者' },
      };
      const updatedProject = {
        ...projectWithConstruction,
        constructionPersonId: null,
        constructionPerson: null,
        updatedAt: new Date('2024-01-03'),
      };

      let capturedUpdateData: unknown = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(projectWithConstruction),
            update: vi.fn().mockImplementation((args) => {
              capturedUpdateData = args.data;
              return Promise.resolve(updatedProject);
            }),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateProject(
        'project-123',
        { constructionPersonId: null },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.constructionPerson).toBeUndefined();
      expect(capturedUpdateData).toEqual(
        expect.objectContaining({
          constructionPerson: { disconnect: true },
        })
      );
    });

    it('工事担当者をadminユーザーに更新しようとした場合はエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithAdminConstruction: UpdateProjectInput = {
        constructionPersonId: 'admin-id',
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
        service.updateProject('project-123', inputWithAdminConstruction, actorId, expectedUpdatedAt)
      ).rejects.toThrow(ProjectValidationError);
    });

    it('各フィールドを個別に更新できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updatedProject = {
        ...mockProject,
        siteAddress: '更新後住所',
        updatedAt: new Date('2024-01-03'),
      };

      let capturedUpdateData: unknown = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            update: vi.fn().mockImplementation((args) => {
              capturedUpdateData = args.data;
              return Promise.resolve(updatedProject);
            }),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act
      await service.updateProject(
        'project-123',
        { siteAddress: '更新後住所' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(capturedUpdateData).toEqual({ siteAddress: '更新後住所' });
    });

    it('監査ログにbefore/after状態が正しく記録される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updatedProject = {
        ...mockProject,
        name: '更新後名前',
        updatedAt: new Date('2024-01-03'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            findFirst: vi.fn().mockResolvedValue(null), // プロジェクト名重複なし
            update: vi.fn().mockResolvedValue(updatedProject),
          },
          user: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act
      await service.updateProject(
        'project-123',
        { name: '更新後名前' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_UPDATED',
          before: expect.objectContaining({
            name: 'テストプロジェクト',
          }),
          after: expect.objectContaining({
            name: '更新後名前',
          }),
        })
      );
    });
  });

  describe('deleteProject - 追加テスト', () => {
    it('監査ログにbefore状態が記録されafter状態がnullになる', async () => {
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
          before: expect.objectContaining({
            name: 'テストプロジェクト',
            tradingPartnerId: 'trading-partner-123',
            status: 'PREPARING',
          }),
          after: null,
        })
      );
    });
  });

  describe('getRelatedCounts - 追加テスト', () => {
    it('論理削除されたプロジェクトの場合はエラーを返す', async () => {
      // Arrange
      mockPrisma.project.findUnique = vi.fn().mockResolvedValue({
        ...mockProject,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.getRelatedCounts('project-123')).rejects.toThrow(ProjectNotFoundError);
    });
  });

  /**
   * プロジェクト名一意性チェックのテスト
   *
   * Requirements:
   * - 1.15: プロジェクト作成時にプロジェクト名の重複チェックを実行
   * - 1.16: プロジェクト名の一意性チェックを作成時に実行
   * - 8.7: プロジェクト更新時に重複プロジェクト名でエラー表示
   * - 8.8: プロジェクト名の一意性チェックを更新時に実行（自身を除外）
   */
  describe('createProject - プロジェクト名一意性チェック (1.15, 1.16)', () => {
    const validInput: CreateProjectInput = {
      name: '新規プロジェクト',
      tradingPartnerId: 'trading-partner-123',
      salesPersonId: 'user-123',
    };

    it('同一プロジェクト名が既に存在する場合はDuplicateProjectNameErrorを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const existingProject = {
        id: 'existing-project-id',
        name: '新規プロジェクト',
        deletedAt: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findFirst: vi.fn().mockResolvedValue(existingProject),
            create: vi.fn(),
          },
          projectStatusHistory: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createProject(validInput, actorId)).rejects.toThrow(
        DuplicateProjectNameError
      );
    });

    it('同一プロジェクト名が存在しない場合は正常に作成される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdProject = {
        ...mockProject,
        name: '新規プロジェクト',
        salesPerson: mockUser,
        constructionPerson: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findFirst: vi.fn().mockResolvedValue(null), // 重複なし
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
      expect(result.name).toBe('新規プロジェクト');
    });

    it('論理削除されたプロジェクトと同名の場合は正常に作成される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdProject = {
        ...mockProject,
        name: '新規プロジェクト',
        salesPerson: mockUser,
        constructionPerson: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            // findFirstは論理削除されていないプロジェクトのみ検索するため、nullを返す
            findFirst: vi.fn().mockResolvedValue(null),
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
      expect(result.name).toBe('新規プロジェクト');
    });
  });

  describe('updateProject - プロジェクト名一意性チェック (8.7, 8.8)', () => {
    const expectedUpdatedAt = new Date('2024-01-02');

    it('別のプロジェクトと重複するプロジェクト名に変更しようとした場合はDuplicateProjectNameErrorを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput: UpdateProjectInput = {
        name: '既存のプロジェクト名',
      };
      const existingProject = {
        id: 'another-project-id',
        name: '既存のプロジェクト名',
        deletedAt: null,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject), // 更新対象のプロジェクト
            findFirst: vi.fn().mockResolvedValue(existingProject), // 重複チェック：他のプロジェクトが存在
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(
        service.updateProject('project-123', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(DuplicateProjectNameError);
    });

    it('同名でも自身のプロジェクトの場合はエラーなしで更新される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput: UpdateProjectInput = {
        name: 'テストプロジェクト', // 現在の名前と同じ
      };
      const updatedProject = {
        ...mockProject,
        name: 'テストプロジェクト',
        updatedAt: new Date('2024-01-03'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            // findFirst は呼ばれない（名前が変更されていないため）
            findFirst: vi.fn(),
            update: vi.fn().mockResolvedValue(updatedProject),
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
      expect(result.name).toBe('テストプロジェクト');
    });

    it('プロジェクト名を変更して重複がない場合は正常に更新される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput: UpdateProjectInput = {
        name: '新しいプロジェクト名',
      };
      const updatedProject = {
        ...mockProject,
        name: '新しいプロジェクト名',
        updatedAt: new Date('2024-01-03'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            findFirst: vi.fn().mockResolvedValue(null), // 重複なし
            update: vi.fn().mockResolvedValue(updatedProject),
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
      expect(result.name).toBe('新しいプロジェクト名');
    });

    it('論理削除されたプロジェクトと同名への変更は許可される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput: UpdateProjectInput = {
        name: '削除済みプロジェクト名',
      };
      const updatedProject = {
        ...mockProject,
        name: '削除済みプロジェクト名',
        updatedAt: new Date('2024-01-03'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            // findFirst は deletedAt: null の条件で検索するため、論理削除されたプロジェクトは返さない
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue(updatedProject),
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
      expect(result.name).toBe('削除済みプロジェクト名');
    });

    it('名前以外のフィールドのみ更新する場合は重複チェックをスキップする', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput: UpdateProjectInput = {
        description: '新しい説明文',
      };
      const updatedProject = {
        ...mockProject,
        description: '新しい説明文',
        updatedAt: new Date('2024-01-03'),
      };

      let findFirstCalled = false;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ ...mockUser, userRoles: [] }),
          },
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
            findFirst: vi.fn().mockImplementation(() => {
              findFirstCalled = true;
              return Promise.resolve(null);
            }),
            update: vi.fn().mockResolvedValue(updatedProject),
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
      expect(result.description).toBe('新しい説明文');
      // 名前が変更されていないので findFirst は呼ばれない
      expect(findFirstCalled).toBe(false);
    });
  });
});
