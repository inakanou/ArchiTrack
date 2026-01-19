/**
 * @fileoverview ItemizedStatementService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1: 内訳書作成機能（数量表を選択し、作成操作を実行）
 * - 1.2: 内訳書名入力（モーダルダイアログで名称を入力）
 * - 1.5: 作成日時の自動設定
 * - 1.6: 内訳書をプロジェクトに紐付けて保存
 * - 1.7: 保存成功時に内訳書一覧画面に遷移
 * - 1.8: 集計元数量表の情報（ID・名称）を参照情報として内訳書に保存
 * - 1.9: 数量表の項目数が0件の場合、エラー
 * - 1.10: 同一プロジェクト内に同名の内訳書が存在する場合、エラー
 * - 3.1: 内訳書一覧取得
 * - 4.1: 内訳書詳細取得
 * - 5.1: 内訳書論理削除
 * - 8.1: スナップショット独立性
 * - 10.1: 楽観的排他制御
 *
 * Task 2.2: 内訳書CRUDサービスの実装
 *
 * @module tests/unit/services/itemized-statement.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { ItemizedStatementService } from '../../../services/itemized-statement.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import type { ItemizedStatementPivotService } from '../../../services/itemized-statement-pivot.service.js';
import {
  ItemizedStatementNotFoundError,
  EmptyQuantityItemsError,
  DuplicateItemizedStatementNameError,
  ItemizedStatementConflictError,
} from '../../../errors/itemizedStatementError.js';
import { QuantityTableNotFoundError } from '../../../errors/quantityTableError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    itemizedStatement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    itemizedStatementItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    quantityTable: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        itemizedStatement: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        itemizedStatementItem: {
          createMany: vi.fn(),
          findMany: vi.fn(),
        },
        quantityTable: {
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

// PivotServiceモック
const createMockPivotService = (): ItemizedStatementPivotService =>
  ({
    aggregateByQuantityTable: vi.fn(),
    generateGroupKey: vi.fn(),
  }) as unknown as ItemizedStatementPivotService;

describe('ItemizedStatementService', () => {
  let service: ItemizedStatementService;
  let mockPrisma: PrismaClient;
  let mockAuditLogService: IAuditLogService;
  let mockPivotService: ItemizedStatementPivotService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    mockPivotService = createMockPivotService();
    service = new ItemizedStatementService({
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
      pivotService: mockPivotService,
    });
  });

  describe('create', () => {
    it('内訳書を作成し、集計項目を保存する（Requirements: 1.1, 1.5, 1.6, 1.8）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト内訳書',
        projectId: 'proj-001',
        sourceQuantityTableId: 'qt-001',
      };

      const mockQuantityTable = {
        id: 'qt-001',
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      };

      const mockAggregatedItems = [
        {
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: 30.75,
        },
      ];

      const mockCreatedStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date('2026-01-19T00:00:00Z'),
        updatedAt: new Date('2026-01-19T00:00:00Z'),
        deletedAt: null,
      };

      // トランザクションモックをセットアップ
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          quantityTable: {
            findUnique: vi.fn().mockResolvedValue(mockQuantityTable),
          },
          itemizedStatement: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreatedStatement),
          },
          itemizedStatementItem: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      vi.mocked(mockPivotService.aggregateByQuantityTable).mockResolvedValue({
        items: mockAggregatedItems,
        sourceItemCount: 3,
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe('is-001');
      expect(result.name).toBe('テスト内訳書');
      expect(result.sourceQuantityTableName).toBe('テスト数量表');
      expect(mockPivotService.aggregateByQuantityTable).toHaveBeenCalledWith('qt-001');
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('数量表が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト内訳書',
        projectId: 'proj-001',
        sourceQuantityTableId: 'qt-nonexistent',
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          quantityTable: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(QuantityTableNotFoundError);
    });

    it('数量表に項目がない場合、エラーを発生させる（Requirements: 1.9）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト内訳書',
        projectId: 'proj-001',
        sourceQuantityTableId: 'qt-001',
      };

      const mockQuantityTable = {
        id: 'qt-001',
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          quantityTable: {
            findUnique: vi.fn().mockResolvedValue(mockQuantityTable),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      vi.mocked(mockPivotService.aggregateByQuantityTable).mockResolvedValue({
        items: [],
        sourceItemCount: 0,
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(EmptyQuantityItemsError);
    });

    it('同一プロジェクト内に同名の内訳書が存在する場合、エラーを発生させる（Requirements: 1.10）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: '既存の内訳書',
        projectId: 'proj-001',
        sourceQuantityTableId: 'qt-001',
      };

      const mockQuantityTable = {
        id: 'qt-001',
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          quantityTable: {
            findUnique: vi.fn().mockResolvedValue(mockQuantityTable),
          },
          itemizedStatement: {
            count: vi.fn().mockResolvedValue(1), // 同名の内訳書が存在
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      vi.mocked(mockPivotService.aggregateByQuantityTable).mockResolvedValue({
        items: [
          {
            customCategory: null,
            workType: '工種',
            name: '名称',
            specification: null,
            unit: 'm',
            quantity: 10,
          },
        ],
        sourceItemCount: 1,
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(
        DuplicateItemizedStatementNameError
      );
    });

    it('スナップショットとして数量表名を保存する（Requirements: 8.1）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト内訳書',
        projectId: 'proj-001',
        sourceQuantityTableId: 'qt-001',
      };

      const mockQuantityTable = {
        id: 'qt-001',
        name: '元の数量表名',
        projectId: 'proj-001',
        deletedAt: null,
      };

      const mockCreatedStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: '元の数量表名',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          quantityTable: {
            findUnique: vi.fn().mockResolvedValue(mockQuantityTable),
          },
          itemizedStatement: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreatedStatement),
          },
          itemizedStatementItem: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      vi.mocked(mockPivotService.aggregateByQuantityTable).mockResolvedValue({
        items: [
          {
            customCategory: null,
            workType: '工種',
            name: '名称',
            specification: null,
            unit: 'm',
            quantity: 10,
          },
        ],
        sourceItemCount: 1,
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.sourceQuantityTableName).toBe('元の数量表名');
    });
  });

  describe('findById', () => {
    it('内訳書詳細を取得する（Requirements: 4.1）', async () => {
      // Arrange
      const statementId = 'is-001';
      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date('2026-01-19T00:00:00Z'),
        updatedAt: new Date('2026-01-19T00:00:00Z'),
        deletedAt: null,
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
        items: [
          {
            id: 'item-001',
            itemizedStatementId: 'is-001',
            customCategory: '分類A',
            workType: '工種1',
            name: '名称1',
            specification: '規格1',
            unit: 'm',
            quantity: new Decimal('30.75'),
            displayOrder: 0,
          },
        ],
      };

      vi.mocked(mockPrisma.itemizedStatement.findUnique).mockResolvedValue(mockStatement as never);

      // Act
      const result = await service.findById(statementId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe('is-001');
      expect(result!.name).toBe('テスト内訳書');
      expect(result!.project.name).toBe('テストプロジェクト');
      expect(result!.items).toHaveLength(1);
    });

    it('存在しない内訳書の場合、nullを返す', async () => {
      // Arrange
      vi.mocked(mockPrisma.itemizedStatement.findUnique).mockResolvedValue(null);

      // Act
      const result = await service.findById('is-nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された内訳書の場合、nullを返す', async () => {
      // Arrange
      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // 論理削除済み
        items: [],
      };

      vi.mocked(mockPrisma.itemizedStatement.findUnique).mockResolvedValue(mockStatement as never);

      // Act
      const result = await service.findById('is-001');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByProjectId', () => {
    it('プロジェクトに紐付く内訳書一覧を取得する（Requirements: 3.1）', async () => {
      // Arrange
      const projectId = 'proj-001';
      const mockStatements = [
        {
          id: 'is-001',
          projectId: 'proj-001',
          name: '内訳書1',
          sourceQuantityTableId: 'qt-001',
          sourceQuantityTableName: '数量表1',
          createdAt: new Date('2026-01-19T00:00:00Z'),
          updatedAt: new Date('2026-01-19T00:00:00Z'),
          deletedAt: null,
        },
        {
          id: 'is-002',
          projectId: 'proj-001',
          name: '内訳書2',
          sourceQuantityTableId: 'qt-002',
          sourceQuantityTableName: '数量表2',
          createdAt: new Date('2026-01-18T00:00:00Z'),
          updatedAt: new Date('2026-01-18T00:00:00Z'),
          deletedAt: null,
        },
      ];

      vi.mocked(mockPrisma.itemizedStatement.findMany).mockResolvedValue(mockStatements as never);
      vi.mocked(mockPrisma.itemizedStatement.count).mockResolvedValue(2 as never);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 1, limit: 20 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.name).toBe('内訳書1');
      expect(result.pagination.total).toBe(2);
    });

    it('論理削除された内訳書は除外する', async () => {
      // Arrange
      vi.mocked(mockPrisma.itemizedStatement.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.itemizedStatement.count).mockResolvedValue(0 as never);

      // Act
      const result = await service.findByProjectId(
        'proj-001',
        {},
        { page: 1, limit: 20 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(0);
      expect(mockPrisma.itemizedStatement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });

  describe('delete', () => {
    it('内訳書を論理削除する（Requirements: 5.1, 10.2, 10.3）', async () => {
      // Arrange
      const statementId = 'is-001';
      const actorId = 'user-001';
      const updatedAt = new Date('2026-01-19T00:00:00Z');
      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
            update: vi.fn().mockResolvedValue({ ...mockStatement, deletedAt: new Date() }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(statementId, actorId, updatedAt);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('存在しない内訳書の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('is-nonexistent', 'user-001', new Date())).rejects.toThrow(
        ItemizedStatementNotFoundError
      );
    });

    it('既に論理削除済みの場合、エラーを発生させる', async () => {
      // Arrange
      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // 既に削除済み
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('is-001', 'user-001', new Date())).rejects.toThrow(
        ItemizedStatementNotFoundError
      );
    });

    it('楽観的排他制御エラー時はItemizedStatementConflictErrorを発生させる', async () => {
      // Arrange
      const actualUpdatedAt = new Date('2026-01-19T00:00:00Z');
      const expectedUpdatedAt = new Date('2026-01-18T00:00:00Z'); // 異なる日時
      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: actualUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('is-001', 'user-001', expectedUpdatedAt)).rejects.toThrow(
        ItemizedStatementConflictError
      );
    });
  });

  describe('updateName', () => {
    it('内訳書名を更新する（Requirements: 10.1）', async () => {
      // Arrange
      const statementId = 'is-001';
      const newName = '更新後の内訳書名';
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date('2026-01-19T00:00:00Z');

      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: '元の内訳書名',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date('2026-01-18T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedStatement = {
        ...mockStatement,
        name: newName,
        updatedAt: new Date('2026-01-19T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn().mockResolvedValue(mockUpdatedStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.updateName(statementId, newName, actorId, expectedUpdatedAt);

      // Assert
      expect(result.name).toBe(newName);
    });

    it('楽観的排他制御エラー（updatedAtが一致しない場合）（Requirements: 10.1, 10.3）', async () => {
      // Arrange
      const statementId = 'is-001';
      const expectedUpdatedAt = new Date('2026-01-19T00:00:00Z');
      const actualUpdatedAt = new Date('2026-01-19T01:00:00Z'); // 異なる日時

      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: '元の内訳書名',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: actualUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.updateName(statementId, '新しい名前', 'user-001', expectedUpdatedAt)
      ).rejects.toThrow(ItemizedStatementConflictError);
    });

    it('同名の内訳書が既に存在する場合、エラーを発生させる', async () => {
      // Arrange
      const statementId = 'is-001';
      const newName = '重複する名前';
      const expectedUpdatedAt = new Date('2026-01-19T00:00:00Z');

      const mockStatement = {
        id: 'is-001',
        projectId: 'proj-001',
        name: '元の内訳書名',
        sourceQuantityTableId: 'qt-001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockStatement),
            count: vi.fn().mockResolvedValue(1), // 同名が存在
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.updateName(statementId, newName, 'user-001', expectedUpdatedAt)
      ).rejects.toThrow(DuplicateItemizedStatementNameError);
    });
  });
});
