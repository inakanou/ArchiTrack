/**
 * @fileoverview QuantityItemService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 *
 * Task 2.3: 数量項目のCRUD操作を実装する
 *
 * @module __tests__/unit/services/quantity-item.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityItemService } from '../../../services/quantity-item.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import Decimal from 'decimal.js';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityItem: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    delete: Mock;
    count: Mock;
  };
  quantityGroup: {
    findUnique: Mock;
  };
  $transaction: Mock;
};

describe('QuantityItemService', () => {
  let service: QuantityItemService;
  let mockPrisma: MockPrismaClient;
  let mockAuditLogService: { createLog: Mock };

  beforeEach(() => {
    // Mock Prismaクライアント
    mockPrisma = {
      quantityItem: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      quantityGroup: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Mock AuditLogService
    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
    };

    service = new QuantityItemService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService as unknown as IAuditLogService,
    });
  });

  describe('create', () => {
    const quantityGroupId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const input = {
      quantityGroupId,
      majorCategory: '土工事',
      workType: '掘削',
      name: '掘削作業',
      unit: 'm3',
      quantity: 100,
      calculationMethod: 'STANDARD' as const,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      displayOrder: 0,
    };

    it('正常に数量項目を作成できる（Requirements: 5.1, 5.2）', async () => {
      // Arrange
      const createdItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityGroupId,
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: quantityGroupId,
        quantityTable: { deletedAt: null },
      });

      mockPrisma.quantityItem.count.mockResolvedValue(0);
      mockPrisma.quantityItem.create.mockResolvedValue(createdItem);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe(createdItem.id);
      expect(result.majorCategory).toBe('土工事');
      expect(result.workType).toBe('掘削');
      expect(result.name).toBe('掘削作業');
      expect(result.unit).toBe('m3');
      expect(result.quantity).toBe(100);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_ITEM_CREATED',
          actorId,
          targetType: 'QuantityItem',
          targetId: createdItem.id,
        })
      );
    });

    it('全属性を指定して作成できる（Requirements: 5.2）', async () => {
      // Arrange
      const fullInput = {
        ...input,
        middleCategory: '一般土工',
        minorCategory: '床掘り',
        customCategory: 'カスタム分類',
        specification: '仕様詳細',
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
        adjustmentFactor: 1.3,
        roundingUnit: 0.25,
        remarks: '備考テスト',
        displayOrder: 1,
      };

      const createdItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityGroupId,
        majorCategory: '土工事',
        middleCategory: '一般土工',
        minorCategory: '床掘り',
        customCategory: 'カスタム分類',
        workType: '掘削',
        name: '掘削作業',
        specification: '仕様詳細',
        unit: 'm3',
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { width: 10, depth: 5, height: 2 },
        adjustmentFactor: new Decimal('1.3000'),
        roundingUnit: new Decimal('0.2500'),
        quantity: new Decimal('100.0000'),
        remarks: '備考テスト',
        displayOrder: 1,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      };

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: quantityGroupId,
        quantityTable: { deletedAt: null },
      });

      mockPrisma.quantityItem.count.mockResolvedValue(0);
      mockPrisma.quantityItem.create.mockResolvedValue(createdItem);

      // Act
      const result = await service.create(fullInput, actorId);

      // Assert
      expect(result.middleCategory).toBe('一般土工');
      expect(result.minorCategory).toBe('床掘り');
      expect(result.specification).toBe('仕様詳細');
      expect(result.calculationMethod).toBe('AREA_VOLUME');
      expect(result.adjustmentFactor).toBe(1.3);
      expect(result.roundingUnit).toBe(0.25);
    });

    it('数量グループが存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('数量グループが見つかりません');
    });

    it('数量表が論理削除されている場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: quantityGroupId,
        quantityTable: { deletedAt: new Date() },
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('数量グループが見つかりません');
    });
  });

  describe('findById', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';

    it('IDで数量項目を取得できる', async () => {
      // Arrange
      const item = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(item);

      // Act
      const result = await service.findById(itemId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(itemId);
      expect(result!.majorCategory).toBe('土工事');
    });

    it('存在しないIDの場合はnullを返す', async () => {
      // Arrange
      mockPrisma.quantityItem.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.findById(itemId);

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された数量表の項目の場合はnullを返す', async () => {
      // Arrange
      const item = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: new Date() }, // 論理削除済み
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(item);

      // Act
      const result = await service.findById(itemId);

      // Assert
      expect(result).toBeNull();
    });

    it('number型のadjustmentFactor, roundingUnit, quantityを正しく変換できる', async () => {
      // Arrange
      const item = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.5, // number型
        roundingUnit: 0.1, // number型
        quantity: 200, // number型
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(item);

      // Act
      const result = await service.findById(itemId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.adjustmentFactor).toBe(1.5);
      expect(result!.roundingUnit).toBe(0.1);
      expect(result!.quantity).toBe(200);
    });
  });

  describe('findByGroupId', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174000';

    it('グループIDで項目一覧を取得できる', async () => {
      // Arrange
      const items = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業1',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('100.0000'),
          remarks: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業2',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('200.0000'),
          remarks: null,
          displayOrder: 1,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        },
      ];

      mockPrisma.quantityItem.findMany.mockResolvedValue(items);

      // Act
      const result = await service.findByGroupId(groupId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.displayOrder).toBe(0);
      expect(result[1]!.displayOrder).toBe(1);
    });
  });

  describe('update', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('数量項目を更新できる（Requirements: 5.2）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      const updatedItem = {
        ...existingItem,
        name: '更新済み掘削作業',
        quantity: new Decimal('150.0000'),
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityItem.update.mockResolvedValue(updatedItem);

      // Act
      const result = await service.update(
        itemId,
        { name: '更新済み掘削作業', quantity: 150 },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('更新済み掘削作業');
      expect(result.quantity).toBe(150);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_ITEM_UPDATED',
        })
      );
    });

    it('楽観的排他制御でタイムスタンプが一致しない場合はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        workType: '掘削',
        name: '掘削作業',
        unit: 'm3',
        calculationMethod: 'STANDARD',
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T02:00:00.000Z'), // 異なるタイムスタンプ
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);

      // Act & Assert
      await expect(
        service.update(itemId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました');
    });

    it('存在しない項目の更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityItem.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(itemId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量項目が見つかりません');
    });
  });

  describe('delete', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('数量項目を削除できる（Requirements: 5.4）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityItem.delete.mockResolvedValue(existingItem);

      // Act
      await service.delete(itemId, actorId);

      // Assert
      expect(mockPrisma.quantityItem.delete).toHaveBeenCalledWith({
        where: { id: itemId },
      });
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_ITEM_DELETED',
          actorId,
          targetType: 'QuantityItem',
          targetId: itemId,
        })
      );
    });

    it('存在しない項目の削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityItem.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(itemId, actorId)).rejects.toThrow('数量項目が見つかりません');
    });
  });

  describe('updateDisplayOrder', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('表示順序を一括更新できる', async () => {
      // Arrange
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174003', displayOrder: 0 },
      ];

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: groupId,
        quantityTable: { deletedAt: null },
      });

      mockPrisma.quantityItem.findMany.mockResolvedValue([
        { id: '123e4567-e89b-12d3-a456-426614174002', quantityGroupId: groupId },
        { id: '123e4567-e89b-12d3-a456-426614174003', quantityGroupId: groupId },
      ]);

      mockPrisma.quantityItem.update.mockResolvedValue({});

      // Act
      await service.updateDisplayOrder(groupId, orderUpdates, actorId);

      // Assert
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledTimes(2);
    });

    it('異なるグループの項目が含まれる場合はエラーをスローする', async () => {
      // Arrange
      const differentGroupId = '123e4567-e89b-12d3-a456-426614174099';
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174003', displayOrder: 0 },
      ];

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: groupId,
        quantityTable: { deletedAt: null },
      });

      mockPrisma.quantityItem.findMany.mockResolvedValue([
        { id: '123e4567-e89b-12d3-a456-426614174002', quantityGroupId: groupId },
        { id: '123e4567-e89b-12d3-a456-426614174003', quantityGroupId: differentGroupId }, // 異なるグループ
      ]);

      // Act & Assert
      await expect(service.updateDisplayOrder(groupId, orderUpdates, actorId)).rejects.toThrow(
        '異なる数量グループの項目が含まれています'
      );
    });
  });

  describe('copy', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('項目を複製できる（Requirements: 6.1）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      const copiedItem = {
        ...existingItem,
        id: '123e4567-e89b-12d3-a456-426614174003',
        displayOrder: 1,
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityItem.count.mockResolvedValue(1);
      mockPrisma.quantityItem.create.mockResolvedValue(copiedItem);

      // Act
      const result = await service.copy(itemId, actorId);

      // Assert
      expect(result.id).not.toBe(itemId);
      expect(result.majorCategory).toBe('土工事');
      expect(result.displayOrder).toBe(1);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_ITEM_COPIED',
        })
      );
    });

    it('存在しない項目のコピーはエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityItem.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.copy(itemId, actorId)).rejects.toThrow('数量項目が見つかりません');
    });
  });

  describe('move', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const sourceGroupId = '123e4567-e89b-12d3-a456-426614174000';
    const targetGroupId = '123e4567-e89b-12d3-a456-426614174010';

    it('同一グループ内で移動できる（Requirements: 6.2）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: null },
        },
      };

      const movedItem = {
        ...existingItem,
        displayOrder: 2,
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityItem.update.mockResolvedValue(movedItem);

      // Act
      const result = await service.move(itemId, sourceGroupId, 2, actorId);

      // Assert
      expect(result.displayOrder).toBe(2);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_ITEM_MOVED',
        })
      );
    });

    it('別グループへ移動できる（Requirements: 6.3）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: null },
        },
      };

      const movedItem = {
        ...existingItem,
        quantityGroupId: targetGroupId,
        displayOrder: 0,
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174020', // 同一数量表
        quantityTable: { deletedAt: null },
      });
      mockPrisma.quantityItem.count.mockResolvedValue(0);
      mockPrisma.quantityItem.update.mockResolvedValue(movedItem);

      // Act
      const result = await service.move(itemId, targetGroupId, 0, actorId);

      // Assert
      expect(result.quantityGroupId).toBe(targetGroupId);
    });

    it('異なる数量表のグループへの移動はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: 'different-table-id', // 異なる数量表
        quantityTable: { deletedAt: null },
      });

      // Act & Assert
      await expect(service.move(itemId, targetGroupId, 0, actorId)).rejects.toThrow(
        '異なる数量表のグループへは移動できません'
      );
    });

    it('存在しない項目の移動はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityItem.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.move(itemId, targetGroupId, 0, actorId)).rejects.toThrow(
        '数量項目が見つかりません'
      );
    });

    it('論理削除された数量表の項目の移動はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: new Date() }, // 論理削除済み
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);

      // Act & Assert
      await expect(service.move(itemId, targetGroupId, 0, actorId)).rejects.toThrow(
        '数量項目が見つかりません'
      );
    });

    it('存在しない移動先グループの場合はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.move(itemId, targetGroupId, 0, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });

    it('論理削除された移動先グループの場合はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: sourceGroupId,
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: sourceGroupId,
          quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
          quantityTable: { deletedAt: null },
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
        quantityTable: { deletedAt: new Date() }, // 論理削除済み
      });

      // Act & Assert
      await expect(service.move(itemId, targetGroupId, 0, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });
  });

  describe('bulkCopy', () => {
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const groupId = '123e4567-e89b-12d3-a456-426614174000';

    it('複数項目を一括コピーできる（Requirements: 6.4）', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      const existingItems = [
        {
          id: itemIds[0],
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業1',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('100.0000'),
          remarks: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          quantityGroup: {
            id: groupId,
            quantityTable: { deletedAt: null },
          },
        },
        {
          id: itemIds[1],
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業2',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('200.0000'),
          remarks: null,
          displayOrder: 1,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          quantityGroup: {
            id: groupId,
            quantityTable: { deletedAt: null },
          },
        },
      ];

      mockPrisma.quantityItem.findMany.mockResolvedValue(existingItems);
      mockPrisma.quantityItem.count.mockResolvedValue(2);
      mockPrisma.quantityItem.create.mockResolvedValue({
        ...existingItems[0],
        id: 'new-id-1',
        displayOrder: 2,
      });

      // Act
      const result = await service.bulkCopy(itemIds, actorId);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockPrisma.quantityItem.create).toHaveBeenCalledTimes(2);
    });

    it('論理削除された数量表の項目はスキップされる', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      const existingItems = [
        {
          id: itemIds[0],
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業1',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('100.0000'),
          remarks: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          quantityGroup: {
            id: groupId,
            quantityTable: { deletedAt: new Date() }, // 論理削除済み
          },
        },
        {
          id: itemIds[1],
          quantityGroupId: groupId,
          majorCategory: '土工事',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '掘削作業2',
          specification: null,
          unit: 'm3',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: new Decimal('1.0000'),
          roundingUnit: new Decimal('0.0100'),
          quantity: new Decimal('200.0000'),
          remarks: null,
          displayOrder: 1,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          quantityGroup: {
            id: groupId,
            quantityTable: { deletedAt: null },
          },
        },
      ];

      mockPrisma.quantityItem.findMany.mockResolvedValue(existingItems);
      mockPrisma.quantityItem.count.mockResolvedValue(2);
      mockPrisma.quantityItem.create.mockResolvedValue({
        ...existingItems[1],
        id: 'new-id-2',
        displayOrder: 2,
      });

      // Act
      const result = await service.bulkCopy(itemIds, actorId);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockPrisma.quantityItem.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('bulkMove', () => {
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const sourceGroupId = '123e4567-e89b-12d3-a456-426614174000';
    const targetGroupId = '123e4567-e89b-12d3-a456-426614174010';

    it('複数項目を一括移動できる（Requirements: 6.4）', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      const existingItems = [
        {
          id: itemIds[0],
          quantityGroupId: sourceGroupId,
          majorCategory: '土工事',
          displayOrder: 0,
          quantityGroup: {
            id: sourceGroupId,
            quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
            quantityTable: { deletedAt: null },
          },
        },
        {
          id: itemIds[1],
          quantityGroupId: sourceGroupId,
          majorCategory: '土工事',
          displayOrder: 1,
          quantityGroup: {
            id: sourceGroupId,
            quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
            quantityTable: { deletedAt: null },
          },
        },
      ];

      mockPrisma.quantityItem.findMany.mockResolvedValue(existingItems);
      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
        quantityTable: { deletedAt: null },
      });
      mockPrisma.quantityItem.count.mockResolvedValue(0);
      mockPrisma.quantityItem.update.mockResolvedValue({});

      // Act
      await service.bulkMove(itemIds, targetGroupId, actorId);

      // Assert
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledTimes(2);
    });

    it('存在しない移動先グループの場合はエラーをスローする', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      mockPrisma.quantityGroup.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.bulkMove(itemIds, targetGroupId, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });

    it('論理削除された移動先グループの場合はエラーをスローする', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
        quantityTable: { deletedAt: new Date() }, // 論理削除済み
      });

      // Act & Assert
      await expect(service.bulkMove(itemIds, targetGroupId, actorId)).rejects.toThrow(
        '数量グループが見つかりません'
      );
    });

    it('異なる数量表の項目が含まれる場合はエラーをスローする', async () => {
      // Arrange
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174002',
        '123e4567-e89b-12d3-a456-426614174003',
      ];

      const existingItems = [
        {
          id: itemIds[0],
          quantityGroupId: sourceGroupId,
          majorCategory: '土工事',
          displayOrder: 0,
          quantityGroup: {
            id: sourceGroupId,
            quantityTableId: 'different-table-id', // 異なる数量表
            quantityTable: { deletedAt: null },
          },
        },
        {
          id: itemIds[1],
          quantityGroupId: sourceGroupId,
          majorCategory: '土工事',
          displayOrder: 1,
          quantityGroup: {
            id: sourceGroupId,
            quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
            quantityTable: { deletedAt: null },
          },
        },
      ];

      mockPrisma.quantityGroup.findUnique.mockResolvedValue({
        id: targetGroupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174020',
        quantityTable: { deletedAt: null },
      });
      mockPrisma.quantityItem.findMany.mockResolvedValue(existingItems);

      // Act & Assert
      await expect(service.bulkMove(itemIds, targetGroupId, actorId)).rejects.toThrow(
        '異なる数量表のグループへは移動できません'
      );
    });
  });

  describe('update - additional fields', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('全フィールドを更新できる（Requirements: 5.2）', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: null },
        },
      };

      const updatedItem = {
        ...existingItem,
        majorCategory: '新大項目',
        middleCategory: '新中項目',
        minorCategory: '新小項目',
        customCategory: '新カスタム',
        workType: '新工種',
        name: '新名称',
        specification: '新仕様',
        unit: '新単位',
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { width: 10, height: 5 },
        adjustmentFactor: new Decimal('1.5000'),
        roundingUnit: new Decimal('0.1000'),
        quantity: new Decimal('150.0000'),
        remarks: '新備考',
        displayOrder: 5,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.quantityItem.update.mockResolvedValue(updatedItem);

      // Act
      const result = await service.update(
        itemId,
        {
          majorCategory: '新大項目',
          middleCategory: '新中項目',
          minorCategory: '新小項目',
          customCategory: '新カスタム',
          workType: '新工種',
          name: '新名称',
          specification: '新仕様',
          unit: '新単位',
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10, height: 5 },
          adjustmentFactor: 1.5,
          roundingUnit: 0.1,
          quantity: 150,
          remarks: '新備考',
          displayOrder: 5,
        },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.majorCategory).toBe('新大項目');
      expect(result.middleCategory).toBe('新中項目');
      expect(result.minorCategory).toBe('新小項目');
      expect(result.customCategory).toBe('新カスタム');
      expect(result.workType).toBe('新工種');
      expect(result.name).toBe('新名称');
      expect(result.specification).toBe('新仕様');
      expect(result.unit).toBe('新単位');
      expect(result.calculationMethod).toBe('AREA_VOLUME');
      expect(result.remarks).toBe('新備考');
      expect(result.displayOrder).toBe(5);
    });

    it('論理削除された数量表の項目更新はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        workType: '掘削',
        name: '掘削作業',
        unit: 'm3',
        calculationMethod: 'STANDARD',
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: new Date() }, // 論理削除済み
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);

      // Act & Assert
      await expect(
        service.update(itemId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量項目が見つかりません');
    });
  });

  describe('delete - additional cases', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('論理削除された数量表の項目削除はエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: new Date() }, // 論理削除済み
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);

      // Act & Assert
      await expect(service.delete(itemId, actorId)).rejects.toThrow('数量項目が見つかりません');
    });
  });

  describe('copy - additional cases', () => {
    const itemId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('論理削除された数量表の項目コピーはエラーをスローする', async () => {
      // Arrange
      const existingItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '土工事',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '掘削',
        name: '掘削作業',
        specification: null,
        unit: 'm3',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: new Decimal('1.0000'),
        roundingUnit: new Decimal('0.0100'),
        quantity: new Decimal('100.0000'),
        remarks: null,
        displayOrder: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        quantityGroup: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          quantityTable: { deletedAt: new Date() }, // 論理削除済み
        },
      };

      mockPrisma.quantityItem.findUnique.mockResolvedValue(existingItem);

      // Act & Assert
      await expect(service.copy(itemId, actorId)).rejects.toThrow('数量項目が見つかりません');
    });
  });
});
