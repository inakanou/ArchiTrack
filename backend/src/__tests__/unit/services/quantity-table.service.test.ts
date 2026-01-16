/**
 * @fileoverview QuantityTableService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
 * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
 *
 * Task 2.1: 数量表のCRUD操作を実装する
 *
 * @module __tests__/unit/services/quantity-table.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityTableService } from '../../../services/quantity-table.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityTable: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    count: Mock;
  };
  project: {
    findUnique: Mock;
  };
  $transaction: Mock;
};

describe('QuantityTableService', () => {
  let service: QuantityTableService;
  let mockPrisma: MockPrismaClient;
  let mockAuditLogService: { createLog: Mock };

  beforeEach(() => {
    // Mock Prismaクライアント
    mockPrisma = {
      quantityTable: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Mock AuditLogService
    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
    };

    service = new QuantityTableService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService as unknown as IAuditLogService,
    });
  });

  describe('create', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const input = {
      projectId,
      name: 'テスト数量表',
    };

    it('正常に数量表を作成できる（Requirements: 2.1, 2.2）', async () => {
      // Arrange
      const createdQuantityTable = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId,
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        _count: { groups: 0 },
      };

      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
      });

      mockPrisma.quantityTable.create.mockResolvedValue(createdQuantityTable);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe(createdQuantityTable.id);
      expect(result.name).toBe('テスト数量表');
      expect(result.projectId).toBe(projectId);
      expect(result.groupCount).toBe(0);
      expect(result.itemCount).toBe(0);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_CREATED',
          actorId,
          targetType: 'QuantityTable',
          targetId: createdQuantityTable.id,
        })
      );
    });

    it('プロジェクトが存在しない場合はエラーをスローする（Requirements: 1.6準拠）', async () => {
      // Arrange
      mockPrisma.project.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('プロジェクトが見つかりません');
    });

    it('プロジェクトが論理削除されている場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('プロジェクトが見つかりません');
    });
  });

  describe('findById', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';

    it('IDで数量表を取得できる', async () => {
      // Arrange
      const quantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
        groups: [],
        _count: { groups: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(quantityTable);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(quantityTableId);
      expect(result!.project.name).toBe('テストプロジェクト');
    });

    it('存在しないIDの場合はnullを返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された数量表は取得できない', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null); // deletedAt: null フィルターで除外される

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByProjectId', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('プロジェクトIDで数量表一覧を取得できる（Requirements: 2.3）', async () => {
      // Arrange
      const quantityTables = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト数量表1',
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 2 },
          groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          projectId,
          name: 'テスト数量表2',
          createdAt: new Date('2026-01-05T00:00:00.000Z'),
          updatedAt: new Date('2026-01-05T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 1 },
          groups: [{ _count: { items: 1 } }],
        },
      ];

      mockPrisma.quantityTable.findMany.mockResolvedValue(quantityTables);
      mockPrisma.quantityTable.count.mockResolvedValue(2);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('ページネーションが正しく動作する', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          _count: { groups: 0 },
          groups: [],
        },
      ]);
      mockPrisma.quantityTable.count.mockResolvedValue(25);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 2, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.page).toBe(2);
    });

    it('検索フィルターが正しく動作する', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: '検索キーワード',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          _count: { groups: 0 },
          groups: [],
        },
      ]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      await service.findByProjectId(
        projectId,
        { search: '検索キーワード' },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.quantityTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({
              contains: '検索キーワード',
            }),
          }),
        })
      );
    });
  });

  describe('findLatestByProjectId', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('プロジェクト詳細画面向けサマリーを取得できる（Requirements: 1.2, 1.3）', async () => {
      // Arrange
      const quantityTables = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト数量表1',
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 2 },
          groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
        },
      ];

      mockPrisma.quantityTable.findMany.mockResolvedValue(quantityTables);
      mockPrisma.quantityTable.count.mockResolvedValue(5);

      // Act
      const result = await service.findLatestByProjectId(projectId, 2);

      // Assert
      expect(result.totalCount).toBe(5);
      expect(result.latestTables).toHaveLength(1);
    });
  });

  describe('update', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('数量表名を更新できる（Requirements: 2.5）', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const updatedQuantityTable = {
        ...existingQuantityTable,
        name: '新名称',
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { groups: 0 },
        groups: [],
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue(updatedQuantityTable);

      // Act
      const result = await service.update(
        quantityTableId,
        { name: '新名称' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新名称');
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_UPDATED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
        })
      );
    });

    it('楽観的排他制御でタイムスタンプが一致しない場合はエラーをスローする', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T02:00:00.000Z'), // 異なるタイムスタンプ
        deletedAt: null,
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました');
    });

    it('存在しない数量表の更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });
  });

  describe('delete', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('数量表を論理削除できる（Requirements: 2.4）', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        groups: [],
        _count: { groups: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue({
        ...existingQuantityTable,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(quantityTableId, actorId);

      // Assert
      expect(mockPrisma.quantityTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: quantityTableId },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_DELETED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
        })
      );
    });

    it('存在しない数量表の削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(quantityTableId, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('既に論理削除された数量表の削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.delete(quantityTableId, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('グループと項目を持つ数量表を削除できる', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        groups: [
          { id: 'group-1', _count: { items: 3 } },
          { id: 'group-2', _count: { items: 5 } },
        ],
        _count: { groups: 2 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue({
        ...existingQuantityTable,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(quantityTableId, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_DELETED',
          before: expect.objectContaining({
            groupCount: 2,
            itemCount: 8, // 3 + 5
          }),
        })
      );
    });
  });

  describe('findByProjectId - additional cases', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('結果が0件の場合、totalPagesは0を返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('空の検索キーワードは無視される', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      await service.findByProjectId(
        projectId,
        { search: '   ' },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.quantityTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            name: expect.anything(),
          }),
        })
      );
    });
  });

  describe('update - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('論理削除された数量表の更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: new Date(), // 論理削除済み
      });

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });

    it('グループと項目を持つ数量表を更新できる', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const updatedQuantityTable = {
        ...existingQuantityTable,
        name: '新名称',
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { groups: 2 },
        groups: [{ _count: { items: 3 } }, { _count: { items: 5 } }],
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue(updatedQuantityTable);

      // Act
      const result = await service.update(
        quantityTableId,
        { name: '新名称' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.groupCount).toBe(2);
      expect(result.itemCount).toBe(8); // 3 + 5
    });
  });

  describe('findById - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';

    it('グループと項目を持つ数量表を取得できる', async () => {
      // Arrange
      const quantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: quantityTableId,
            name: 'グループ1',
            surveyImageId: null,
            surveyImage: null,
            displayOrder: 0,
            createdAt: new Date('2026-01-06T00:00:00.000Z'),
            updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            items: [
              {
                id: 'item-1',
                quantityGroupId: 'group-1',
                majorCategory: '大分類1',
                middleCategory: '中分類1',
                minorCategory: '小分類1',
                customCategory: null,
                workType: '工種1',
                name: '項目1',
                specification: '規格1',
                unit: 'm',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.01,
                quantity: 10.5,
                remarks: null,
                displayOrder: 0,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-2',
                quantityGroupId: 'group-1',
                majorCategory: '大分類2',
                middleCategory: null,
                minorCategory: null,
                customCategory: 'カスタム',
                workType: '工種2',
                name: '項目2',
                specification: null,
                unit: '㎡',
                calculationMethod: 'FORMULA',
                calculationParams: { width: 5, height: 3 },
                adjustmentFactor: 1.1,
                roundingUnit: 0.1,
                quantity: 15.0,
                remarks: '備考',
                displayOrder: 1,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-3',
                quantityGroupId: 'group-1',
                majorCategory: '大分類3',
                middleCategory: '中分類3',
                minorCategory: '小分類3',
                customCategory: null,
                workType: '工種3',
                name: '項目3',
                specification: '規格3',
                unit: '個',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 5,
                remarks: null,
                displayOrder: 2,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
            ],
            _count: { items: 3 },
          },
          {
            id: 'group-2',
            quantityTableId: quantityTableId,
            name: 'グループ2',
            surveyImageId: 'img-1',
            surveyImage: {
              id: 'img-1',
              thumbnailPath: 'thumbnails/img-1.jpg',
              originalPath: 'originals/img-1.jpg',
              fileName: 'survey.jpg',
            },
            displayOrder: 1,
            createdAt: new Date('2026-01-06T00:00:00.000Z'),
            updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            items: [
              {
                id: 'item-4',
                quantityGroupId: 'group-2',
                majorCategory: '大分類4',
                middleCategory: '中分類4',
                minorCategory: null,
                customCategory: null,
                workType: '工種4',
                name: '項目4',
                specification: '規格4',
                unit: 'm³',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.001,
                quantity: 100.123,
                remarks: null,
                displayOrder: 0,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-5',
                quantityGroupId: 'group-2',
                majorCategory: '大分類5',
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '工種5',
                name: '項目5',
                specification: null,
                unit: '式',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 1,
                remarks: null,
                displayOrder: 1,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-6',
                quantityGroupId: 'group-2',
                majorCategory: '大分類6',
                middleCategory: '中分類6',
                minorCategory: '小分類6',
                customCategory: null,
                workType: '工種6',
                name: '項目6',
                specification: '規格6',
                unit: 'kg',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.1,
                quantity: 50.5,
                remarks: null,
                displayOrder: 2,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-7',
                quantityGroupId: 'group-2',
                majorCategory: '大分類7',
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '工種7',
                name: '項目7',
                specification: null,
                unit: 't',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.01,
                quantity: 2.5,
                remarks: null,
                displayOrder: 3,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-8',
                quantityGroupId: 'group-2',
                majorCategory: '大分類8',
                middleCategory: '中分類8',
                minorCategory: null,
                customCategory: null,
                workType: '工種8',
                name: '項目8',
                specification: '規格8',
                unit: 'L',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 200,
                remarks: '最終項目',
                displayOrder: 4,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
            ],
            _count: { items: 5 },
          },
        ],
        _count: { groups: 2 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(quantityTable);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.groupCount).toBe(2);
      expect(result!.itemCount).toBe(8);
      expect(result!.groups).toHaveLength(2);
      expect(result!.groups[0]!.name).toBe('グループ1');
      expect(result!.groups[1]!.surveyImageId).toBe('img-1');
    });
  });

  describe('create - additional cases', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('グループを持つ数量表作成時にitemCountが計算される', async () => {
      // Arrange
      const createdQuantityTable = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId,
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        _count: { groups: 2 },
        groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
      };

      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
      });

      mockPrisma.quantityTable.create.mockResolvedValue(createdQuantityTable);

      // Act
      const result = await service.create({ projectId, name: 'テスト数量表' }, actorId);

      // Assert
      expect(result.groupCount).toBe(2);
      expect(result.itemCount).toBe(5); // 3 + 2
    });
  });
});
