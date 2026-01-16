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
 * Task 2.2: 数量グループの管理機能を実装する
 *
 * @module __tests__/unit/services/quantity-group.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityGroupService } from '../../../services/quantity-group.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityGroup: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    delete: Mock;
    count: Mock;
  };
  quantityTable: {
    findUnique: Mock;
  };
  surveyImage: {
    findUnique: Mock;
  };
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
        delete: vi.fn(),
        count: vi.fn(),
      },
      quantityTable: {
        findUnique: vi.fn(),
      },
      surveyImage: {
        findUnique: vi.fn(),
      },
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
});
