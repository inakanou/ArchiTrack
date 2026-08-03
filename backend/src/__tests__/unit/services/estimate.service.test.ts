/**
 * @fileoverview EstimateService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-3.1: 新規作成を選択した場合、プロジェクトに紐付く内訳書の選択画面を表示する
 * - REQ-3.2: 選択した内訳書の項目を見積金額行の初期値として設定する
 * - REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - REQ-3.4: 見積書をプロジェクトに紐付けて保存する
 * - REQ-3.5: 内訳書が選択された場合、内訳書の名称・規格・単位・数量を見積金額行に転記する
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-11.7: 編集中であることを警告表示する
 *
 * Task 2.1: EstimateServiceの実装
 *
 * @module tests/unit/services/estimate.service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EstimateService } from '../../../services/estimate.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  EstimateNotFoundError,
  EstimateConflictError,
  DuplicateEstimateNameError,
  ItemizedStatementNotFoundForEstimateError,
} from '../../../errors/estimateError.js';
import { ProjectNotFoundError } from '../../../errors/projectError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimate: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    estimateItem: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    estimateItemLine: {
      createMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    itemizedStatement: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        estimate: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        estimateItem: {
          create: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn(),
        },
        estimateItemLine: {
          createMany: vi.fn(),
        },
        project: {
          findUnique: vi.fn(),
        },
        itemizedStatement: {
          findUnique: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
};

// AuditLogServiceモック
const createMockAuditLogService = (): IAuditLogService => ({
  createLog: vi.fn().mockResolvedValue(undefined),
  getLogs: vi.fn(),
  exportLogs: vi.fn(),
});

describe('EstimateService', () => {
  let service: EstimateService;
  let mockPrisma: PrismaClient;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    service = new EstimateService({
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    });
  });

  describe('create', () => {
    it('内訳書を参照せずに空の見積書を作成する（Requirements: REQ-3.3, REQ-3.4）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: 'テスト見積書',
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      const mockCreatedEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-02-03T00:00:00Z'),
        updatedAt: new Date('2026-02-03T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          estimate: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreatedEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe('est-001');
      expect(result.name).toBe('テスト見積書');
      expect(result.sourceItemizedStatementId).toBeNull();
      expect(result.sourceItemizedStatementName).toBeNull();
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('内訳書を参照して見積書を作成する（Requirements: REQ-3.2, REQ-3.5）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: 'is-001',
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      const mockItemizedStatement = {
        id: 'is-001',
        name: 'テスト内訳書',
        projectId: 'proj-001',
        deletedAt: null,
        items: [
          {
            id: 'isi-001',
            customCategory: '分類A',
            workType: '工種1',
            name: '項目1',
            specification: '規格1',
            unit: 'm',
            quantity: 10.5,
            displayOrder: 0,
          },
          {
            id: 'isi-002',
            customCategory: '分類A',
            workType: '工種2',
            name: '項目2',
            specification: '規格2',
            unit: '式',
            quantity: 1,
            displayOrder: 1,
          },
        ],
      };

      const mockCreatedEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: 'is-001',
        sourceItemizedStatementName: 'テスト内訳書',
        createdAt: new Date('2026-02-03T00:00:00Z'),
        updatedAt: new Date('2026-02-03T00:00:00Z'),
        deletedAt: null,
      };

      let createdItemsData: unknown[] = [];

      // createMany後にfindManyで取得される見積項目のモック
      const mockCreatedItems = [
        { id: 'ei-001', estimateId: 'est-001', displayOrder: 0 },
        { id: 'ei-002', estimateId: 'est-001', displayOrder: 1 },
      ];

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockItemizedStatement),
          },
          estimate: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreatedEstimate),
          },
          estimateItem: {
            createMany: vi.fn().mockImplementation(({ data }) => {
              createdItemsData = data;
              return { count: data.length };
            }),
            findMany: vi.fn().mockResolvedValue(mockCreatedItems),
          },
          estimateItemLine: {
            createMany: vi.fn().mockResolvedValue({ count: 6 }), // 2項目 x 3行
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe('est-001');
      expect(result.sourceItemizedStatementId).toBe('is-001');
      expect(result.sourceItemizedStatementName).toBe('テスト内訳書');
      expect(createdItemsData).toHaveLength(2);
    });

    it('プロジェクトが存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-nonexistent',
        name: 'テスト見積書',
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(ProjectNotFoundError);
    });

    it('内訳書が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: 'is-nonexistent',
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(
        ItemizedStatementNotFoundForEstimateError
      );
    });

    it('同名の見積書が既に存在する場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: '既存見積書',
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          estimate: {
            count: vi.fn().mockResolvedValue(1), // 同名が存在
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(DuplicateEstimateNameError);
    });
  });

  describe('findById', () => {
    it('見積書詳細を取得する（Requirements: REQ-11.2）', async () => {
      // Arrange
      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-02-03T00:00:00Z'),
        updatedAt: new Date('2026-02-03T00:00:00Z'),
        deletedAt: null,
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
        items: [],
      };

      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue(mockEstimate as never);

      // Act
      const result = await service.findById('est-001');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe('est-001');
      expect(result?.name).toBe('テスト見積書');
    });

    it('存在しない見積書の場合、nullを返す', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue(null);

      // Act
      const result = await service.findById('est-nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された見積書の場合、nullを返す', async () => {
      // Arrange
      const mockEstimate = {
        id: 'est-001',
        deletedAt: new Date(),
      };

      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue(mockEstimate as never);

      // Act
      const result = await service.findById('est-001');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByProjectId', () => {
    it('プロジェクトに紐付く見積書一覧を取得する（Requirements: REQ-11.1）', async () => {
      // Arrange
      const mockEstimates = [
        {
          id: 'est-001',
          projectId: 'proj-001',
          name: '見積書1',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: new Date('2026-02-03T00:00:00Z'),
          updatedAt: new Date('2026-02-03T00:00:00Z'),
          deletedAt: null,
          _count: { items: 5 },
        },
        {
          id: 'est-002',
          projectId: 'proj-001',
          name: '見積書2',
          sourceItemizedStatementId: 'is-001',
          sourceItemizedStatementName: '内訳書1',
          createdAt: new Date('2026-02-02T00:00:00Z'),
          updatedAt: new Date('2026-02-02T00:00:00Z'),
          deletedAt: null,
          _count: { items: 3 },
        },
      ];

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue(mockEstimates as never);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(2);

      // Act
      const result = await service.findByProjectId(
        'proj-001',
        {},
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('検索条件で絞り込む', async () => {
      // Arrange
      const mockEstimates = [
        {
          id: 'est-001',
          name: '建築工事見積書',
          _count: { items: 5 },
        },
      ];

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue(mockEstimates as never);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(1);

      // Act
      const result = await service.findByProjectId(
        'proj-001',
        { search: '建築' },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('見積書名を更新する（Requirements: REQ-11.3, REQ-11.5）', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: '旧見積書名',
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedEstimate = {
        ...mockEstimate,
        name: '新見積書名',
        updatedAt: new Date('2026-02-03T01:00:00Z'),
        _count: { items: 5 },
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn().mockResolvedValue(mockUpdatedEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(
        estimateId,
        { name: '新見積書名' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新見積書名');
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('楽観的排他制御エラーを発生させる（Requirements: REQ-11.6）', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        name: '見積書',
        updatedAt: new Date('2026-02-03T01:00:00Z'), // 異なる日時
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update(estimateId, { name: '新見積書名' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow(EstimateConflictError);
    });

    it('見積書が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date();

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update('est-nonexistent', { name: '新名前' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow(EstimateNotFoundError);
    });
  });

  describe('delete', () => {
    it('見積書を論理削除する（Requirements: REQ-11.4）', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: '見積書',
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
            update: vi.fn().mockResolvedValue({ ...mockEstimate, deletedAt: new Date() }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(estimateId, actorId, expectedUpdatedAt);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('楽観的排他制御エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        name: '見積書',
        updatedAt: new Date('2026-02-03T01:00:00Z'), // 異なる日時
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete(estimateId, actorId, expectedUpdatedAt)).rejects.toThrow(
        EstimateConflictError
      );
    });

    it('見積書が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date();

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('est-nonexistent', actorId, expectedUpdatedAt)).rejects.toThrow(
        EstimateNotFoundError
      );
    });

    it('論理削除済みの見積書を削除しようとした場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date();

      const mockEstimate = {
        id: 'est-001',
        name: '見積書',
        updatedAt: expectedUpdatedAt,
        deletedAt: new Date(), // 既に削除済み
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('est-001', actorId, expectedUpdatedAt)).rejects.toThrow(
        EstimateNotFoundError
      );
    });
  });

  describe('create - エッジケース', () => {
    it('削除済みプロジェクトへの見積書作成時、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-deleted',
        name: 'テスト見積書',
      };

      const mockDeletedProject = {
        id: 'proj-deleted',
        name: 'テストプロジェクト',
        deletedAt: new Date(), // 削除済み
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockDeletedProject),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(ProjectNotFoundError);
    });

    it('削除済み内訳書を参照した見積書作成時、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: 'is-deleted',
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      const mockDeletedItemizedStatement = {
        id: 'is-deleted',
        name: 'テスト内訳書',
        deletedAt: new Date(), // 削除済み
        items: [],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockDeletedItemizedStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(
        ItemizedStatementNotFoundForEstimateError
      );
    });

    it('見積書名の前後の空白をトリミングして作成する', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        projectId: 'proj-001',
        name: '  テスト見積書  ', // 前後に空白
      };

      const mockProject = {
        id: 'proj-001',
        name: 'テストプロジェクト',
        deletedAt: null,
      };

      let createdName = '';
      const mockCreatedEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-02-03T00:00:00Z'),
        updatedAt: new Date('2026-02-03T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          estimate: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockImplementation(({ data }) => {
              createdName = data.name;
              return mockCreatedEstimate;
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.name).toBe('テスト見積書');
      expect(createdName).toBe('テスト見積書');
    });
  });

  describe('update - エッジケース', () => {
    it('更新時に同名の見積書が既に存在する場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: '元の見積書名',
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
            count: vi.fn().mockResolvedValue(1), // 同名が存在
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update(estimateId, { name: '既存の見積書名' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow(DuplicateEstimateNameError);
    });

    it('論理削除済みの見積書を更新しようとした場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date();

      const mockEstimate = {
        id: 'est-001',
        name: '見積書',
        updatedAt: expectedUpdatedAt,
        deletedAt: new Date(), // 削除済み
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update('est-001', { name: '新名前' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow(EstimateNotFoundError);
    });

    it('見積書名の前後の空白をトリミングして更新する', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: '旧見積書名',
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      let updatedName = '';
      const mockUpdatedEstimate = {
        ...mockEstimate,
        name: '新見積書名',
        updatedAt: new Date('2026-02-03T01:00:00Z'),
        _count: { items: 5 },
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn().mockImplementation(({ data }) => {
              updatedName = data.name;
              return mockUpdatedEstimate;
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(
        estimateId,
        { name: '  新見積書名  ' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新見積書名');
      expect(updatedName).toBe('新見積書名');
    });

    it('名前が変わらない場合は重複チェックをスキップする', async () => {
      // Arrange
      const actorId = 'user-001';
      const estimateId = 'est-001';
      const expectedUpdatedAt = new Date('2026-02-03T00:00:00Z');

      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: '見積書名',
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedEstimate = {
        ...mockEstimate,
        updatedAt: new Date('2026-02-03T01:00:00Z'),
        _count: { items: 5 },
      };

      let countCalled = false;

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
            count: vi.fn().mockImplementation(() => {
              countCalled = true;
              return 0;
            }),
            update: vi.fn().mockResolvedValue(mockUpdatedEstimate),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.update(
        estimateId,
        { name: '見積書名' }, // 同じ名前
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(countCalled).toBe(false); // 重複チェックは呼ばれない
    });
  });

  describe('findById - エッジケース', () => {
    it('見積書詳細に見積項目と3行1セット（見積/実行/業者）が含まれる', async () => {
      // Arrange
      const mockEstimate = {
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-02-03T00:00:00Z'),
        updatedAt: new Date('2026-02-03T00:00:00Z'),
        deletedAt: null,
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
        items: [
          {
            id: 'ei-001',
            estimateId: 'est-001',
            parentId: null,
            displayOrder: 0,
            createdAt: new Date('2026-02-03T00:00:00Z'),
            updatedAt: new Date('2026-02-03T00:00:00Z'),
            lines: [
              {
                id: 'eil-001',
                estimateItemId: 'ei-001',
                lineType: 'ESTIMATE',
                name: '項目1',
                specification: '規格1',
                unit: 'm',
                quantity: 10.5,
                unitPrice: 1000,
                amount: 10500,
                remarks: null,
                sourceReceivedQuotationLineItemId: null,
                sourceVendorName: null,
              },
              {
                id: 'eil-002',
                estimateItemId: 'ei-001',
                lineType: 'EXECUTION',
                name: null,
                specification: null,
                unit: null,
                quantity: null,
                unitPrice: null,
                amount: null,
                remarks: null,
                sourceReceivedQuotationLineItemId: null,
                sourceVendorName: null,
              },
              {
                id: 'eil-003',
                estimateItemId: 'ei-001',
                lineType: 'VENDOR',
                name: '業者項目1',
                specification: '業者規格1',
                unit: 'm',
                quantity: 10.5,
                unitPrice: 800,
                amount: 8400,
                remarks: '業者A',
                sourceReceivedQuotationLineItemId: 'rqli-001',
                sourceVendorName: '業者A',
              },
            ],
          },
        ],
      };

      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue(mockEstimate as never);

      // Act
      const result = await service.findById('est-001');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0]?.lines).toHaveLength(3);

      // ESTIMATE行
      const estimateLine = result?.items[0]?.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(estimateLine?.name).toBe('項目1');
      expect(estimateLine?.amount).toBe(10500);

      // EXECUTION行
      const executionLine = result?.items[0]?.lines.find((l) => l.lineType === 'EXECUTION');
      expect(executionLine?.name).toBeNull();

      // VENDOR行
      const vendorLine = result?.items[0]?.lines.find((l) => l.lineType === 'VENDOR');
      expect(vendorLine?.name).toBe('業者項目1');
      expect(vendorLine?.sourceVendorName).toBe('業者A');
    });
  });

  describe('findByProjectId - エッジケース', () => {
    it('ページネーションが正しく機能する', async () => {
      // Arrange
      const mockEstimates = [
        {
          id: 'est-011',
          projectId: 'proj-001',
          name: '見積書11',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: new Date('2026-02-03T00:00:00Z'),
          updatedAt: new Date('2026-02-03T00:00:00Z'),
          deletedAt: null,
          _count: { items: 5 },
        },
      ];

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue(mockEstimates as never);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(25); // 総数25件

      // Act
      const result = await service.findByProjectId(
        'proj-001',
        {},
        { page: 2, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);

      // skip値の確認
      expect(mockPrisma.estimate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit = (2 - 1) * 10
          take: 10,
        })
      );
    });

    it('ソート順を変更できる', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(0);

      // Act
      await service.findByProjectId(
        'proj-001',
        {},
        { page: 1, limit: 10 },
        { sort: 'name', order: 'asc' }
      );

      // Assert
      expect(mockPrisma.estimate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });
  });

  describe('findLatestByProjectId', () => {
    it('プロジェクトに紐付く直近の見積書と総数を取得する（Requirements: REQ-16.3, REQ-16.4）', async () => {
      // Arrange
      const projectId = 'proj-001';
      const mockEstimates = [
        {
          id: 'est-002',
          projectId: 'proj-001',
          name: '見積書2',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: new Date('2026-02-04T00:00:00Z'),
          updatedAt: new Date('2026-02-04T00:00:00Z'),
          deletedAt: null,
          _count: { items: 3 },
        },
        {
          id: 'est-001',
          projectId: 'proj-001',
          name: '見積書1',
          sourceItemizedStatementId: 'is-001',
          sourceItemizedStatementName: '内訳書1',
          createdAt: new Date('2026-02-03T00:00:00Z'),
          updatedAt: new Date('2026-02-03T00:00:00Z'),
          deletedAt: null,
          _count: { items: 5 },
        },
      ];

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue(mockEstimates as never);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(5); // 総数は5件

      // Act
      const result = await service.findLatestByProjectId(projectId, 2);

      // Assert
      expect(result.estimates).toHaveLength(2);
      expect(result.totalCount).toBe(5);
      expect(result.estimates[0]!.id).toBe('est-002');
      expect(result.estimates[1]!.id).toBe('est-001');
    });

    it('デフォルトで2件取得する', async () => {
      // Arrange
      const projectId = 'proj-001';
      const mockEstimates = [
        {
          id: 'est-002',
          projectId: 'proj-001',
          name: '見積書2',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: new Date('2026-02-04T00:00:00Z'),
          updatedAt: new Date('2026-02-04T00:00:00Z'),
          deletedAt: null,
          _count: { items: 3 },
        },
        {
          id: 'est-001',
          projectId: 'proj-001',
          name: '見積書1',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: new Date('2026-02-03T00:00:00Z'),
          updatedAt: new Date('2026-02-03T00:00:00Z'),
          deletedAt: null,
          _count: { items: 5 },
        },
      ];

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue(mockEstimates as never);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(10);

      // Act
      const result = await service.findLatestByProjectId(projectId);

      // Assert
      expect(result.estimates).toHaveLength(2);
      expect(result.totalCount).toBe(10);
      expect(mockPrisma.estimate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('見積書がない場合は空配列と総数0を返す', async () => {
      // Arrange
      const projectId = 'proj-001';

      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(0);

      // Act
      const result = await service.findLatestByProjectId(projectId, 2);

      // Assert
      expect(result.estimates).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('論理削除された見積書は除外する', async () => {
      // Arrange
      const projectId = 'proj-001';

      // findManyとcountはdeletedAt: nullの条件でフィルタリングされている
      vi.mocked(mockPrisma.estimate.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.estimate.count).mockResolvedValue(0);

      // Act
      await service.findLatestByProjectId(projectId, 2);

      // Assert
      expect(mockPrisma.estimate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
          }),
        })
      );
      expect(mockPrisma.estimate.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
          }),
        })
      );
    });
  });

  // ==========================================================================
  // 帳票用の追加入力項目（Requirements: REQ-54.4, REQ-54.5, REQ-54.6, REQ-54.7）
  //
  // Task 56.8。提出日・有効期限・別途工事は見積書画面から編集して保存するが、
  // 新規作成時の既定値（54.4 / 54.5）は作成経路が与える。読み取り経路
  // （`findById` → `GET /api/estimates/:id`）が3項目を返さない限り、
  // 画面は保存済みの値を復元できない（54.6 の「編集可能」が再読み込みで壊れる）。
  // ==========================================================================
  describe('帳票用入力項目', () => {
    /** 作成経路のトランザクションを組み立て、`estimate.create` のモックを返す */
    const stubCreateTransaction = () => {
      const create = vi.fn().mockResolvedValue({
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-08-03T23:30:00Z'),
        updatedAt: new Date('2026-08-03T23:30:00Z'),
        deletedAt: null,
      });

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          project: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: 'proj-001', name: 'テストプロジェクト', deletedAt: null }),
          },
          estimate: {
            count: vi.fn().mockResolvedValue(0),
            create,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      return create;
    };

    /** `create` に渡された `data` を取り出す */
    const createdData = (create: ReturnType<typeof vi.fn>): Record<string, unknown> =>
      (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    afterEach(() => {
      vi.useRealTimers();
    });

    it('新規作成時に提出日を当日（日本時間）とする（Requirements: REQ-54.4）', async () => {
      // Arrange
      // 2026-08-03T23:30Z は日本時間では 2026-08-04 08:30。UTC の暦日（08-03）を
      // そのまま使うと提出日が前日にずれるため、境界をまたぐ時刻を固定する。
      const service54 = new EstimateService({
        prisma: mockPrisma,
        auditLogService: mockAuditLogService,
        now: () => new Date('2026-08-03T23:30:00Z'),
      });
      const create = stubCreateTransaction();

      // Act
      await service54.create({ projectId: 'proj-001', name: 'テスト見積書' }, 'user-001');

      // Assert
      expect(createdData(create).submissionDate).toEqual(new Date('2026-08-04T00:00:00.000Z'));
    });

    it('新規作成時に有効期限を既定文言とする（Requirements: REQ-54.5）', async () => {
      // Arrange
      const service54 = new EstimateService({
        prisma: mockPrisma,
        auditLogService: mockAuditLogService,
        now: () => new Date('2026-08-03T23:30:00Z'),
      });
      const create = stubCreateTransaction();

      // Act
      await service54.create({ projectId: 'proj-001', name: 'テスト見積書' }, 'user-001');

      // Assert
      expect(createdData(create).validityPeriod).toBe('提出日より1ヶ月間');
    });

    it('時計を注入しない本番構成でも当日を用いる（Requirements: REQ-54.4）', async () => {
      // Arrange
      // 既定の時計（`new Date()`）が使われることを、注入なしの構成で固定する。
      // これが無いと本番経路の時刻取得は一度も実行されない。
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31T20:00:00Z')); // JST では 2027-01-01 05:00
      const create = stubCreateTransaction();

      // Act
      await service.create({ projectId: 'proj-001', name: 'テスト見積書' }, 'user-001');

      // Assert
      expect(createdData(create).submissionDate).toEqual(new Date('2027-01-01T00:00:00.000Z'));
    });

    it('保存済みの帳票用入力項目を見積書詳細で返す（Requirements: REQ-54.6）', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue({
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-08-03T00:00:00Z'),
        updatedAt: new Date('2026-08-03T00:00:00Z'),
        deletedAt: null,
        submissionDate: new Date('2026-08-04T00:00:00.000Z'),
        validityPeriod: '提出日より3ヶ月間',
        separateWorks: ['電気設備工事', '空調設備工事'],
        project: { id: 'proj-001', name: 'テストプロジェクト' },
        items: [],
      } as never);

      // Act
      const result = await service.findById('est-001');

      // Assert
      expect(result?.reportFields).toEqual({
        submissionDate: '2026-08-04',
        validityPeriod: '提出日より3ヶ月間',
        separateWorks: ['電気設備工事', '空調設備工事'],
      });
    });

    it('未入力の帳票用入力項目を空のまま返す（Requirements: REQ-54.7）', async () => {
      // Arrange
      // 52.2 で追加した3列は既存の見積書では未入力（NULL / 空配列）のまま。
      // ここを既定値で埋めてしまうと、画面が開いた瞬間に未保存の変更になる。
      vi.mocked(mockPrisma.estimate.findUnique).mockResolvedValue({
        id: 'est-001',
        projectId: 'proj-001',
        name: 'テスト見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: new Date('2026-08-03T00:00:00Z'),
        updatedAt: new Date('2026-08-03T00:00:00Z'),
        deletedAt: null,
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
        project: { id: 'proj-001', name: 'テストプロジェクト' },
        items: [],
      } as never);

      // Act
      const result = await service.findById('est-001');

      // Assert
      expect(result?.reportFields).toEqual({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });
    });
  });
});
