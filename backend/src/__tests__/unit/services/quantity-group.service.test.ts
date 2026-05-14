/**
 * @fileoverview QuantityGroupService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 数量グループが追加される場合、同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.4: 数量グループに写真が紐づけられている状態で、注釈付き写真と数量項目の関連性を視覚的に表示する
 * - 4.5: 数量グループの削除操作を行う
 * - 3.2: プロジェクト詳細画面に数量表情報として現場調査画像サムネイルを表示する
 * - 3.3: 数量グループと現場調査画像の紐付けを管理する
 *
 * @requirement quantity-table-generation/REQ-38.8 複製先を元グループとは独立したデータとして管理（新規 groupId / displayOrder で create、配下 item は new groupId で createMany）
 * @requirement quantity-table-generation/REQ-38.10 コピー処理中エラー時のロールバック（createMany throw 時にエラー伝搬し監査ログ未記録）
 *
 * Task 2.2: 数量グループの管理機能を実装する
 *
 * @module __tests__/unit/services/quantity-group.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityGroupService } from '../../../services/quantity-group.service.js';
import {
  QuantityGroupNotFoundError,
  OptimisticLockError,
} from '../../../errors/quantityTableError.js';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityGroup: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    updateMany: Mock;
    delete: Mock;
    count: Mock;
  };
  quantityItem: {
    createMany: Mock;
  };
  quantityTable: {
    findUnique: Mock;
  };
  surveyImage: {
    findUnique: Mock;
  };
  $queryRaw: Mock;
  $transaction: Mock;
};

describe('QuantityGroupService', () => {
  let service: QuantityGroupService;
  let mockPrisma: MockPrismaClient;
  let mockAuditLogService: { createLog: Mock };

  beforeEach(() => {
    // Mock Prismaクライアント
    mockPrisma = {
      quantityGroup: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      quantityItem: {
        createMany: vi.fn(),
      },
      quantityTable: {
        findUnique: vi.fn(),
      },
      surveyImage: {
        findUnique: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked-table' }]),
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Mock AuditLogService
    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
    };

    service = new QuantityGroupService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService as unknown as IAuditLogService,
    });
  });

  describe('create', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const input = {
      quantityTableId,
      name: 'テストグループ',
      displayOrder: 0,
    };

    it('正常に数量グループを作成できる（Requirements: 4.1）', async () => {
      // Arrange
      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityTableId,
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.quantityGroup.count.mockResolvedValue(0);
      mockPrisma.quantityGroup.create.mockResolvedValue(createdGroup);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe(createdGroup.id);
      expect(result.name).toBe('テストグループ');
      expect(result.quantityTableId).toBe(quantityTableId);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_CREATED',
          actorId,
          targetType: 'QuantityGroup',
          targetId: createdGroup.id,
        })
      );
    });

    it('現場調査画像を紐付けて作成できる（Requirements: 4.2）', async () => {
      // Arrange
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174004';
      const inputWithImage = {
        ...input,
        surveyImageId,
      };

      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityTableId,
        name: 'テストグループ',
        surveyImageId,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: surveyImageId,
        survey: { projectId: '123e4567-e89b-12d3-a456-426614174003' },
      });

      mockPrisma.quantityGroup.count.mockResolvedValue(0);
      mockPrisma.quantityGroup.create.mockResolvedValue(createdGroup);

      // Act
      const result = await service.create(inputWithImage, actorId);

      // Assert
      expect(result.surveyImageId).toBe(surveyImageId);
    });

    it('数量表が存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('数量表が見つかりません');
    });

    it('存在しない現場調査画像を指定した場合はエラーをスローする', async () => {
      // Arrange
      const inputWithInvalidImage = {
        ...input,
        surveyImageId: '123e4567-e89b-12d3-a456-426614174999',
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(inputWithInvalidImage, actorId)).rejects.toThrow(
        'Survey image not found'
      );
    });

    it('異なるプロジェクトの現場調査画像を指定した場合はエラーをスローする', async () => {
      // Arrange
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174004';
      const inputWithImage = {
        ...input,
        surveyImageId,
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: surveyImageId,
        survey: { projectId: 'different-project-id' }, // 異なるプロジェクト
      });

      // Act & Assert
      await expect(service.create(inputWithImage, actorId)).rejects.toThrow(
        '異なるプロジェクトの現場調査画像は紐付けできません'
      );
    });
  });

  describe('findById', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174002';

    it('IDでグループ詳細を取得できる（Requirements: 4.4）', async () => {
      // Arrange
      const group = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: '123e4567-e89b-12d3-a456-426614174004',
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: '123e4567-e89b-12d3-a456-426614174000', deletedAt: null },
        surveyImage: {
          id: '123e4567-e89b-12d3-a456-426614174004',
          thumbnailPath: '/thumbnails/image1.jpg',
          originalPath: '/originals/image1.jpg',
          fileName: 'image1.jpg',
        },
        items: [],
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(group);

      // Act
      const result = await service.findById(groupId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(groupId);
      expect(result!.surveyImage).not.toBeNull();
      expect(result!.surveyImage?.thumbnailPath).toBe('/thumbnails/image1.jpg');
    });

    it('存在しないIDの場合はnullを返す', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.findById(groupId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByQuantityTableId', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';

    it('数量表IDでグループ一覧を取得できる', async () => {
      // Arrange
      const groups = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          quantityTableId,
          name: 'グループ1',
          surveyImageId: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          surveyImage: null,
          _count: { items: 3 },
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          quantityTableId,
          name: 'グループ2',
          surveyImageId: '123e4567-e89b-12d3-a456-426614174004',
          displayOrder: 1,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          surveyImage: {
            id: '123e4567-e89b-12d3-a456-426614174004',
            thumbnailPath: '/thumbnails/image1.jpg',
          },
          _count: { items: 2 },
        },
      ];

      mockPrisma.quantityGroup.findMany.mockResolvedValue(groups);

      // Act
      const result = await service.findByQuantityTableId(quantityTableId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.displayOrder).toBe(0);
      expect(result[1]!.displayOrder).toBe(1);
    });
  });

  describe('update', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('現場調査画像を紐付け・解除できる（Requirements: 4.3）', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: null,
          projectId: '123e4567-e89b-12d3-a456-426614174003',
        },
      };

      const surveyImageId = '123e4567-e89b-12d3-a456-426614174004';

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: surveyImageId,
        survey: { projectId: '123e4567-e89b-12d3-a456-426614174003' },
      });

      const updatedGroup = {
        ...existingGroup,
        surveyImageId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.update.mockResolvedValue(updatedGroup);

      // Act
      const result = await service.update(groupId, { surveyImageId }, actorId, expectedUpdatedAt);

      // Assert
      expect(result.surveyImageId).toBe(surveyImageId);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_UPDATED',
        })
      );
    });

    it('楽観的排他制御でタイムスタンプが一致しない場合はエラーをスローする', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T02:00:00.000Z'), // 異なるタイムスタンプ
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: null,
          projectId: '123e4567-e89b-12d3-a456-426614174003',
        },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);

      // Act & Assert
      await expect(
        service.update(groupId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました');
    });
  });

  describe('updateDisplayOrder', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('表示順序を一括更新できる', async () => {
      // Arrange
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174003', displayOrder: 0 },
      ];

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
      });

      mockPrisma.quantityGroup.findMany.mockResolvedValue([
        { id: '123e4567-e89b-12d3-a456-426614174002', quantityTableId },
        { id: '123e4567-e89b-12d3-a456-426614174003', quantityTableId },
      ]);

      mockPrisma.quantityGroup.update.mockResolvedValue({});

      // Act
      await service.updateDisplayOrder(quantityTableId, orderUpdates, actorId);

      // Assert
      expect(mockPrisma.quantityGroup.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('グループと配下の項目をカスケード削除できる（Requirements: 4.5）', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: '123e4567-e89b-12d3-a456-426614174000', deletedAt: null },
        _count: { items: 3 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);
      mockPrisma.quantityGroup.delete.mockResolvedValue(existingGroup);

      // Act
      await service.delete(groupId, actorId);

      // Assert
      expect(mockPrisma.quantityGroup.delete).toHaveBeenCalledWith({
        where: { id: groupId },
      });
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_DELETED',
          actorId,
          targetType: 'QuantityGroup',
          targetId: groupId,
        })
      );
    });

    it('存在しないグループの削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(groupId, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });

    it('数量表が論理削除されている場合はエラーをスローする', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: new Date(), // 論理削除済み
        },
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);

      // Act & Assert
      await expect(service.delete(groupId, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });
  });

  describe('findById - additional cases', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174002';

    it('論理削除された数量表のグループはnullを返す', async () => {
      // Arrange
      const group = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: '123e4567-e89b-12d3-a456-426614174000', deletedAt: new Date() },
        surveyImage: null,
        items: [],
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(group);

      // Act
      const result = await service.findById(groupId);

      // Assert
      expect(result).toBeNull();
    });

    it('項目を持つグループを取得できる（Decimal型のquantity）', async () => {
      // Arrange
      const group = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: '123e4567-e89b-12d3-a456-426614174000', deletedAt: null },
        surveyImage: null,
        items: [
          {
            id: 'item-1',
            name: '項目1',
            unit: 'm3',
            quantity: { toString: () => '100.5' },
            displayOrder: 0,
          },
          { id: 'item-2', name: '項目2', unit: 'm2', quantity: 50, displayOrder: 1 },
        ],
        _count: { items: 2 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(group);

      // Act
      const result = await service.findById(groupId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(2);
      expect(result!.items[0]!.quantity).toBe(100.5);
      expect(result!.items[1]!.quantity).toBe(50);
    });
  });

  describe('update - additional cases', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('存在しないグループの更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(groupId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量グループが見つかりません');
    });

    it('論理削除された数量表のグループ更新はエラーをスローする', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: new Date(), // 論理削除済み
          projectId: '123e4567-e89b-12d3-a456-426614174003',
        },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);

      // Act & Assert
      await expect(
        service.update(groupId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量グループが見つかりません');
    });

    it('名前と表示順序を更新できる', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: null,
          projectId: '123e4567-e89b-12d3-a456-426614174003',
        },
      };

      const updatedGroup = {
        ...existingGroup,
        name: '新しい名称',
        displayOrder: 5,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);
      mockPrisma.quantityGroup.update.mockResolvedValue(updatedGroup);

      // Act
      const result = await service.update(
        groupId,
        { name: '新しい名称', displayOrder: 5 },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新しい名称');
      expect(result.displayOrder).toBe(5);
    });

    it('名前をnullに設定できる', async () => {
      // Arrange
      const existingGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityTable: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          deletedAt: null,
          projectId: '123e4567-e89b-12d3-a456-426614174003',
        },
      };

      const updatedGroup = {
        ...existingGroup,
        name: null,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(existingGroup);
      mockPrisma.quantityGroup.update.mockResolvedValue(updatedGroup);

      // Act
      const result = await service.update(groupId, { name: null }, actorId, expectedUpdatedAt);

      // Assert
      expect(result.name).toBeNull();
    });
  });

  describe('updateDisplayOrder - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('異なる数量表のグループが含まれる場合はエラーをスローする', async () => {
      // Arrange
      const differentTableId = '123e4567-e89b-12d3-a456-426614174099';
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174003', displayOrder: 0 },
      ];

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.quantityGroup.findMany.mockResolvedValue([
        { id: '123e4567-e89b-12d3-a456-426614174002', quantityTableId },
        { id: '123e4567-e89b-12d3-a456-426614174003', quantityTableId: differentTableId }, // 異なる数量表
      ]);

      // Act & Assert
      await expect(
        service.updateDisplayOrder(quantityTableId, orderUpdates, actorId)
      ).rejects.toThrow('異なる数量表のグループが含まれています');
    });
  });

  describe('create - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('数量表が論理削除されている場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: new Date(), // 論理削除済み
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      // Act & Assert
      await expect(
        service.create({ quantityTableId, name: 'テスト', displayOrder: 0 }, actorId)
      ).rejects.toThrow('数量表が見つかりません');
    });

    it('指定したdisplayOrderで作成される', async () => {
      // Arrange
      const input = {
        quantityTableId,
        name: 'テストグループ',
        displayOrder: 3,
      };

      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityTableId,
        name: 'テストグループ',
        surveyImageId: null,
        displayOrder: 3,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.quantityGroup.create.mockResolvedValue(createdGroup);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.displayOrder).toBe(3);
    });

    it('名前がnullの場合でも作成できる', async () => {
      // Arrange
      const input = {
        quantityTableId,
        displayOrder: 0,
      };

      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityTableId,
        name: null,
        surveyImageId: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        _count: { items: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: null,
        projectId: '123e4567-e89b-12d3-a456-426614174003',
      });

      mockPrisma.quantityGroup.create.mockResolvedValue(createdGroup);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.name).toBeNull();
    });
  });

  describe('copy', () => {
    const sourceGroupId = '123e4567-e89b-12d3-a456-426614174010';
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174011';
    const actorId = '123e4567-e89b-12d3-a456-426614174012';
    const copiedGroupId = '123e4567-e89b-12d3-a456-426614174020';

    /**
     * 元グループとその配下項目を含む findUnique のモック結果を組み立てる
     */
    function buildSourceGroup(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: sourceGroupId,
        quantityTableId,
        name: '元グループ',
        surveyImageId: 'survey-image-1',
        displayOrder: 2,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: quantityTableId, deletedAt: null },
        items: [
          {
            id: 'item-1',
            quantityGroupId: sourceGroupId,
            majorCategory: '大項目',
            middleCategory: '中項目',
            minorCategory: '小項目',
            customCategory: null,
            workType: '工種A',
            name: '名称A',
            specification: '規格A',
            unit: 'm',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: '1.0000',
            roundingUnit: '0.0100',
            quantity: '10.5000',
            remarks: '備考',
            displayOrder: 0,
          },
        ],
        ...overrides,
      };
    }

    /**
     * 複製先グループの create 結果（_count 込み）
     */
    function buildCopiedGroup() {
      return {
        id: copiedGroupId,
        quantityTableId,
        name: '元グループのコピー',
        surveyImageId: 'survey-image-1',
        displayOrder: 3,
        createdAt: new Date('2026-01-06T01:00:00.000Z'),
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { items: 1 },
      };
    }

    it('正常系: グループと配下項目が複製され、複製先 QuantityGroupInfo が返却される', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(buildSourceGroup());
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue(buildCopiedGroup());
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert
      expect(result.id).toBe(copiedGroupId);
      expect(result.quantityTableId).toBe(quantityTableId);
      expect(result.surveyImageId).toBe('survey-image-1');
      expect(result.displayOrder).toBe(3);
      expect(result.name).toBe('元グループのコピー');
      // SELECT FOR UPDATE が呼び出されている
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      // 後続グループの displayOrder シフト
      expect(mockPrisma.quantityGroup.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quantityTableId,
            displayOrder: { gt: 2 },
          }),
          data: { displayOrder: { increment: 1 } },
        })
      );
      // QuantityItem.createMany により配下項目を複製
      expect(mockPrisma.quantityItem.createMany).toHaveBeenCalled();
      // 監査ログに QUANTITY_GROUP_COPIED が記録される
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_COPIED',
          actorId,
        })
      );
    });

    it('元グループが存在しない場合は QuantityGroupNotFoundError', async () => {
      // Arrange
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'locked-table' }]);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.copy(sourceGroupId, actorId)).rejects.toThrow(
        QuantityGroupNotFoundError
      );
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
    });

    it('SELECT FOR UPDATE が対象数量表を検出できない場合は OptimisticLockError', async () => {
      // Arrange: 親 QuantityTable のロック取得時に行が見つからない（削除済みなど）
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // ロック取得前に元グループから quantityTableId を取得するため findUnique は1度呼ばれる
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: sourceGroupId,
        quantityTableId,
        deletedAt: null,
      });

      // Act & Assert
      await expect(service.copy(sourceGroupId, actorId)).rejects.toThrow(OptimisticLockError);
    });

    // ========================================================================
    // Task 52.4 追加テスト群
    // Requirements:
    // - 38.3 全項目複製（カテゴリ・計算・調整係数・丸め・数量・備考・並び順）
    // - 38.4 surveyImageId の維持
    // - 38.5 名前付与（{元名}のコピー）
    // - 38.6 名前切り詰め（GROUP_NAME_MAX_WIDTH = 50）
    // - 38.7 displayOrder = 元 + 1 / 後続シフト
    // - 38.10 部分的データのロールバック保証
    // ========================================================================

    /**
     * 複数項目を持つ元グループを構築する補助関数
     *
     * displayOrder 0/1/2 の3項目を持ち、calculationParams は null / object / null の組み合わせとする。
     * 全項目複製の深掘り検証で使用する。
     */
    function buildSourceGroupWithMultipleItems() {
      return {
        id: sourceGroupId,
        quantityTableId,
        name: '元グループ',
        surveyImageId: 'survey-image-1',
        displayOrder: 2,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityTable: { id: quantityTableId, deletedAt: null },
        items: [
          {
            id: 'item-1',
            quantityGroupId: sourceGroupId,
            majorCategory: '土工',
            middleCategory: '掘削',
            minorCategory: '機械掘削',
            customCategory: null,
            workType: '工種A',
            name: '掘削工',
            specification: '規格A',
            unit: 'm3',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: '1.0000',
            roundingUnit: '0.0100',
            quantity: '10.5000',
            remarks: '備考A',
            displayOrder: 0,
          },
          {
            id: 'item-2',
            quantityGroupId: sourceGroupId,
            majorCategory: '土工',
            middleCategory: '盛土',
            minorCategory: '締固め',
            customCategory: 'カスタム1',
            workType: '工種B',
            name: '盛土工',
            specification: '規格B',
            unit: 'm3',
            calculationMethod: 'TRAPEZOID',
            calculationParams: { upper: 1, lower: 2, height: 3 },
            adjustmentFactor: '0.9500',
            roundingUnit: '0.1000',
            quantity: '20.0000',
            remarks: '備考B',
            displayOrder: 1,
          },
          {
            id: 'item-3',
            quantityGroupId: sourceGroupId,
            majorCategory: '舗装',
            middleCategory: 'アスファルト',
            minorCategory: '表層',
            customCategory: null,
            workType: '工種C',
            name: '舗装工',
            specification: '規格C',
            unit: 'm2',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: '1.0500',
            roundingUnit: '0.0010',
            quantity: '30.1234',
            remarks: null,
            displayOrder: 2,
          },
        ],
      };
    }

    it('38.3: 配下全項目の全フィールド値・displayOrder が複製先 groupId で createMany に渡される', async () => {
      // Arrange
      const sourceGroup = buildSourceGroupWithMultipleItems();
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        _count: { items: 3 },
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 3 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert: createMany が3項目分のデータを複製先 groupId で渡されている
      expect(mockPrisma.quantityItem.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.quantityItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              quantityGroupId: copiedGroupId,
              majorCategory: '土工',
              middleCategory: '掘削',
              minorCategory: '機械掘削',
              customCategory: null,
              workType: '工種A',
              name: '掘削工',
              specification: '規格A',
              unit: 'm3',
              calculationMethod: 'STANDARD',
              calculationParams: Prisma.JsonNull,
              adjustmentFactor: '1.0000',
              roundingUnit: '0.0100',
              quantity: '10.5000',
              remarks: '備考A',
              displayOrder: 0,
            }),
            expect.objectContaining({
              quantityGroupId: copiedGroupId,
              majorCategory: '土工',
              middleCategory: '盛土',
              minorCategory: '締固め',
              customCategory: 'カスタム1',
              workType: '工種B',
              name: '盛土工',
              specification: '規格B',
              unit: 'm3',
              calculationMethod: 'TRAPEZOID',
              // object 型の calculationParams はそのまま保持される
              calculationParams: { upper: 1, lower: 2, height: 3 },
              adjustmentFactor: '0.9500',
              roundingUnit: '0.1000',
              quantity: '20.0000',
              remarks: '備考B',
              displayOrder: 1,
            }),
            expect.objectContaining({
              quantityGroupId: copiedGroupId,
              majorCategory: '舗装',
              middleCategory: 'アスファルト',
              minorCategory: '表層',
              customCategory: null,
              workType: '工種C',
              name: '舗装工',
              specification: '規格C',
              unit: 'm2',
              calculationMethod: 'STANDARD',
              calculationParams: Prisma.JsonNull,
              adjustmentFactor: '1.0500',
              roundingUnit: '0.0010',
              quantity: '30.1234',
              remarks: null,
              displayOrder: 2,
            }),
          ]),
        })
      );

      // Arg の data 配列長は元項目数と一致
      const callArg = mockPrisma.quantityItem.createMany.mock.calls[0]![0] as {
        data: unknown[];
      };
      expect(callArg.data).toHaveLength(3);

      // 複製先項目は元の quantityGroupId を引き継がない（必ず copiedGroupId）
      for (const itemArg of callArg.data as Array<{ quantityGroupId: string }>) {
        expect(itemArg.quantityGroupId).toBe(copiedGroupId);
        expect(itemArg.quantityGroupId).not.toBe(sourceGroupId);
      }
    });

    it('38.4: 元グループの surveyImageId（非 null）が複製先で維持される', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ surveyImageId: 'survey-image-xyz' });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        surveyImageId: 'survey-image-xyz',
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert
      expect(result.surveyImageId).toBe('survey-image-xyz');
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            surveyImageId: 'survey-image-xyz',
          }),
        })
      );
    });

    it('38.4: 元グループの surveyImageId が null の場合、複製先も null として作成される', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ surveyImageId: null });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        surveyImageId: null,
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert
      expect(result.surveyImageId).toBeNull();
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            surveyImageId: null,
          }),
        })
      );
    });

    it('38.7: 複製先 displayOrder は 元.displayOrder + 1 で挿入され、後続グループは +1 シフトされる', async () => {
      // Arrange: 元グループの displayOrder = 5 を明示的に検証
      const sourceGroup = buildSourceGroup({ displayOrder: 5 });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        displayOrder: 6,
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert: 後続シフトの where 条件と increment data
      expect(mockPrisma.quantityGroup.updateMany).toHaveBeenCalledWith({
        where: {
          quantityTableId,
          displayOrder: { gt: 5 },
        },
        data: { displayOrder: { increment: 1 } },
      });
      // create の displayOrder は元 + 1
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayOrder: 6,
            quantityTableId,
          }),
        })
      );
      expect(result.displayOrder).toBe(6);
    });

    it('38.7: 後続グループが 0 件（updateMany count=0）でも正常に複製先が作成される', async () => {
      // Arrange: 末尾グループのコピーシナリオ
      const sourceGroup = buildSourceGroup({ displayOrder: 99 });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        displayOrder: 100,
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert: 後続が 0 件でも create と監査ログは実行される
      expect(mockPrisma.quantityGroup.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledTimes(1);
      expect(result.displayOrder).toBe(100);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'QUANTITY_GROUP_COPIED' })
      );
    });

    it('38.5: 短い元名 "元グループ" のコピー名は "元グループのコピー" になる', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ name: '元グループ' });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        name: '元グループのコピー',
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '元グループのコピー' }),
        })
      );
    });

    it('38.5: 元名が null の場合、コピー名は "のコピー" のみになる', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ name: null });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        name: 'のコピー',
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert: null は空文字として扱われ、サフィックスのみが付与される
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'のコピー' }),
        })
      );
    });

    it('38.5: 元名が空文字 "" の場合、コピー名は "のコピー" のみになる', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ name: '' });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        name: 'のコピー',
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'のコピー' }),
        })
      );
    });

    it('38.6: 元名が最大文字幅を超える場合、元名側を切り詰めて末尾に "のコピー" を付与する', async () => {
      // Arrange: 全角25文字 = 半角50幅 の元名（'あ' × 25 = 幅 50）
      // suffix 'のコピー' は全角4文字 = 幅 8。
      // 期待値: 元名側を (50 - 8 = 42) 幅以内、つまり全角21文字までに切り詰め、
      //         末尾に 'のコピー' を付与する → 'あ' × 21 + 'のコピー' = 幅 42 + 8 = 50
      const originalName = 'あ'.repeat(25);
      const expectedCopiedName = 'あ'.repeat(21) + 'のコピー';
      const sourceGroup = buildSourceGroup({ name: originalName });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        name: expectedCopiedName,
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert: 切り詰め後の名前が data.name に渡される
      const createArg = mockPrisma.quantityGroup.create.mock.calls[0]![0] as {
        data: { name: string };
      };
      expect(createArg.data.name).toBe(expectedCopiedName);
      // 末尾には必ず 'のコピー' が付与されている
      expect(createArg.data.name.endsWith('のコピー')).toBe(true);
      // 文字幅（全角=2/半角=1）が 50 を超えていないこと
      let width = 0;
      for (const ch of createArg.data.name) {
        const cp = ch.codePointAt(0) ?? 0;
        const isHalfWidth = (cp >= 0x0000 && cp <= 0x007f) || (cp >= 0xff61 && cp <= 0xff9f);
        width += isHalfWidth ? 1 : 2;
      }
      expect(width).toBeLessThanOrEqual(50);
    });

    it('38.10: createMany が throw した場合、エラーが伝搬し監査ログは記録されない', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup();
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue(buildCopiedGroup());
      const createManyError = new Error('createMany failed');
      mockPrisma.quantityItem.createMany.mockRejectedValue(createManyError);

      // Act & Assert: 生のエラーがそのまま伝搬する
      await expect(service.copy(sourceGroupId, actorId)).rejects.toThrow('createMany failed');

      // 監査ログは createMany 失敗後の手順で呼ばれるため、記録されていない
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('38.3: 元グループに項目が 0 件の場合、createMany は呼ばれず複製は成功する', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ items: [] });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        _count: { items: 0 },
      });

      // Act
      const result = await service.copy(sourceGroupId, actorId);

      // Assert
      expect(mockPrisma.quantityItem.createMany).not.toHaveBeenCalled();
      expect(result.id).toBe(copiedGroupId);
      expect(result.itemCount).toBe(0);
      // 監査ログの after.itemCount = 0
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_COPIED',
          after: expect.objectContaining({ itemCount: 0 }),
        })
      );
    });

    it('監査ログの actorId / targetType / targetId / before / after が正しく記録される', async () => {
      // Arrange
      const sourceGroup = buildSourceGroup({ displayOrder: 7, name: '元グループ' });
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(sourceGroup);
      mockPrisma.quantityGroup.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.quantityGroup.create.mockResolvedValue({
        ...buildCopiedGroup(),
        displayOrder: 8,
        name: '元グループのコピー',
      });
      mockPrisma.quantityItem.createMany.mockResolvedValue({ count: 1 });

      // Act
      await service.copy(sourceGroupId, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_GROUP_COPIED',
          actorId,
          targetType: 'QuantityGroup',
          targetId: copiedGroupId,
          before: expect.objectContaining({
            sourceGroupId,
            sourceName: '元グループ',
            sourceDisplayOrder: 7,
          }),
          after: expect.objectContaining({
            quantityTableId,
            name: '元グループのコピー',
            surveyImageId: 'survey-image-1',
            displayOrder: 8,
            itemCount: 1,
          }),
        })
      );
    });

    it('ロック取得後の findUnique で親数量表が論理削除済みの場合は QuantityGroupNotFoundError', async () => {
      // Arrange: SELECT FOR UPDATE は行を返すが、ロック後 findUnique で deletedAt が立っている
      mockPrisma.$queryRaw.mockResolvedValue([{ id: quantityTableId }]);
      mockPrisma.quantityGroup.findUnique
        // 1回目: pre-lock 取得（quantityTableId だけを select）
        .mockResolvedValueOnce({ id: sourceGroupId, quantityTableId })
        // 2回目: ロック取得後の本取得 → quantityTable.deletedAt が非 null
        .mockResolvedValueOnce({
          id: sourceGroupId,
          quantityTableId,
          name: '元グループ',
          surveyImageId: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          quantityTable: {
            id: quantityTableId,
            deletedAt: new Date('2026-01-06T02:00:00.000Z'),
          },
          items: [],
        });

      // Act & Assert
      await expect(service.copy(sourceGroupId, actorId)).rejects.toThrow(
        QuantityGroupNotFoundError
      );
      // 複製は実行されない
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.createMany).not.toHaveBeenCalled();
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });
  });
});
