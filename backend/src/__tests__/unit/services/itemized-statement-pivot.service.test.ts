/**
 * @fileoverview ItemizedStatementPivotService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: 「任意分類」「工種」「名称」「規格」「単位」の5項目の組み合わせをキーとしてグループ化する
 * - 2.2: 同一キーの項目が複数存在する場合、該当項目の「数量」フィールドの値を合計する
 * - 2.3: null または空文字の値を同一グループとして扱う
 * - 2.4: 合計数量は小数点以下2桁の精度で計算する
 * - 2.5: 数量の合計結果が -999999.99 未満または 9999999.99 を超える場合、オーバーフローエラーを発生させる
 *
 * Task 2.1: ピボット集計サービスの実装
 *
 * @module tests/unit/services/itemized-statement-pivot.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { ItemizedStatementPivotService } from '../../../services/itemized-statement-pivot.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { QuantityOverflowError } from '../../../errors/itemizedStatementError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    quantityItem: {
      findMany: vi.fn(),
    },
    quantityTable: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('ItemizedStatementPivotService', () => {
  let service: ItemizedStatementPivotService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new ItemizedStatementPivotService({ prisma: mockPrisma });
  });

  describe('aggregateByQuantityTable', () => {
    it('5項目（任意分類・工種・名称・規格・単位）でグループ化する（Requirements: 2.1）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('10.50'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類B',
          workType: '工種2',
          name: '名称2',
          specification: '規格2',
          unit: 'm2',
          quantity: new Decimal('20.00'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      expect(result.items).toHaveLength(2);
      expect(result.sourceItemCount).toBe(2);
      expect(result.items[0]!.customCategory).toBe('分類A');
      expect(result.items[1]!.customCategory).toBe('分類B');
    });

    it('同一キーの項目が複数存在する場合、数量を合計する（Requirements: 2.2）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('10.00'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('15.50'),
        },
        {
          id: 'item-003',
          quantityGroupId: 'group-002',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('5.25'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.quantity).toBe(30.75); // 10.00 + 15.50 + 5.25 = 30.75
    });

    it('null値と空文字を同一グループとして扱う（Requirements: 2.3）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: null,
          workType: '工種1',
          name: '名称1',
          specification: '',
          unit: 'm',
          quantity: new Decimal('10.00'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '',
          workType: '工種1',
          name: '名称1',
          specification: null,
          unit: 'm',
          quantity: new Decimal('20.00'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.quantity).toBe(30.0); // null/空文字は同一キーとして扱う
    });

    it('合計数量は小数点以下2桁の精度で計算する（Requirements: 2.4）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('10.111'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('20.222'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      // 10.111 + 20.222 = 30.333 → 小数点以下2桁に丸めて30.33
      expect(result.items[0]!.quantity).toBe(30.33);
    });

    it('合計が9999999.99を超える場合、オーバーフローエラーを発生させる（Requirements: 2.5）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('9999999.00'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('1.00'), // 合計で10000000.00 > 9999999.99
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act & Assert
      await expect(service.aggregateByQuantityTable(quantityTableId)).rejects.toThrow(
        QuantityOverflowError
      );
    });

    it('合計が-999999.99未満の場合、オーバーフローエラーを発生させる（Requirements: 2.5）', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('-999999.00'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('-1.00'), // 合計で-1000000.00 < -999999.99
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act & Assert
      await expect(service.aggregateByQuantityTable(quantityTableId)).rejects.toThrow(
        QuantityOverflowError
      );
    });

    it('数量表が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const quantityTableId = 'qt-nonexistent';

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.aggregateByQuantityTable(quantityTableId)).rejects.toThrow();
    });

    it('項目が存在しない場合、空の配列を返す', async () => {
      // Arrange
      const quantityTableId = 'qt-001';

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue([]);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      expect(result.items).toHaveLength(0);
      expect(result.sourceItemCount).toBe(0);
    });

    it('浮動小数点誤差を回避して正確に計算する', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      // 0.1 + 0.2 の浮動小数点問題を検証
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('0.1'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('0.2'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      // JavaScript: 0.1 + 0.2 = 0.30000000000000004
      // Decimal.js: 0.1 + 0.2 = 0.3
      expect(result.items[0]!.quantity).toBe(0.3);
    });

    it('複数の異なるグループに正しく分類する', async () => {
      // Arrange
      const quantityTableId = 'qt-001';
      const mockItems = [
        {
          id: 'item-001',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: new Decimal('10.00'),
        },
        {
          id: 'item-002',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格2', // 規格が異なる
          unit: 'm',
          quantity: new Decimal('20.00'),
        },
        {
          id: 'item-003',
          quantityGroupId: 'group-001',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm2', // 単位が異なる
          quantity: new Decimal('30.00'),
        },
      ];

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: null,
      } as never);

      vi.mocked(mockPrisma.quantityItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.aggregateByQuantityTable(quantityTableId);

      // Assert
      expect(result.items).toHaveLength(3);
      expect(result.sourceItemCount).toBe(3);
    });

    it('論理削除された数量表の場合、エラーを発生させる', async () => {
      // Arrange
      const quantityTableId = 'qt-001';

      vi.mocked(mockPrisma.quantityTable.findUnique).mockResolvedValue({
        id: quantityTableId,
        name: 'テスト数量表',
        projectId: 'proj-001',
        deletedAt: new Date(),
      } as never);

      // Act & Assert
      await expect(service.aggregateByQuantityTable(quantityTableId)).rejects.toThrow();
    });
  });

  describe('generateGroupKey', () => {
    it('5項目からグループキーを正しく生成する', () => {
      // Arrange
      const item = {
        customCategory: '分類A',
        workType: '工種1',
        name: '名称1',
        specification: '規格1',
        unit: 'm',
      };

      // Act
      const key = service.generateGroupKey(item);

      // Assert
      expect(key).toBe('分類A|工種1|名称1|規格1|m');
    });

    it('null値を空文字として扱う', () => {
      // Arrange
      const item = {
        customCategory: null,
        workType: '工種1',
        name: '名称1',
        specification: null,
        unit: 'm',
      };

      // Act
      const key = service.generateGroupKey(item);

      // Assert
      expect(key).toBe('|工種1|名称1||m');
    });

    it('空文字と null は同一キーを生成する', () => {
      // Arrange
      const itemWithNull = {
        customCategory: null,
        workType: '工種1',
        name: '名称1',
        specification: null,
        unit: 'm',
      };
      const itemWithEmpty = {
        customCategory: '',
        workType: '工種1',
        name: '名称1',
        specification: '',
        unit: 'm',
      };

      // Act
      const keyWithNull = service.generateGroupKey(itemWithNull);
      const keyWithEmpty = service.generateGroupKey(itemWithEmpty);

      // Assert
      expect(keyWithNull).toBe(keyWithEmpty);
    });
  });
});
