/**
 * @fileoverview EstimateItemService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-1.1: タイトル行に名称・規格・単位・数量・単価・金額・備考のラベルを表示する
 * - REQ-1.2: 見積項目行を「見積金額行」「実行金額行」「業者金額行」の3行1セットで構成する
 * - REQ-1.6: 各見積項目行に名称・規格・単位・数量・単価・備考の入力フィールドを提供する
 * - REQ-2.1: 見積項目に親子関係を設定可能とする
 * - REQ-2.2: その項目を親項目の子として階層表示する
 * - REQ-2.3: 親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-2.4: 複数階層のネスト（例：建築工事 > 直接仮設工事 > 遣り方）をサポートする
 * - REQ-4.1: 指定した見積項目行を指定して受領見積書の行を選択した場合、指定した見積項目行の業者金額行に受領見積書の内容を転記する
 * - REQ-4.2: 見積項目行を指定せずに受領見積書の行を選択した場合、新規見積項目行を作成しその業者金額行に転記する
 * - REQ-4.3: 受領見積書から名称・規格・単位・数量・単価を転記対象とする
 * - REQ-12.1: 新規の3行1セット（見積・実行・業者金額行）を作成する
 * - REQ-12.2: ドラッグ&ドロップで順序を変更可能とする
 * - REQ-12.3: 3行1セット全体を削除する
 * - REQ-12.4: 親項目を削除した場合、子項目も含めて削除するか確認する
 * - REQ-12.5: 3行1セット全体を複製する
 * - REQ-12.6: 見積項目の親項目を変更（移動）可能とする
 *
 * Task 2.2: EstimateItemServiceの実装
 * Task 2.3: 受領見積書転記機能の実装
 *
 * @module tests/unit/services/estimate-item.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EstimateItemService } from '../../../services/estimate-item.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  EstimateNotFoundError,
  EstimateItemHasChildrenError,
  EstimateItemCircularReferenceError,
} from '../../../errors/estimateError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimate: {
      findUnique: vi.fn(),
    },
    estimateItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    estimateItemLine: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    receivedQuotationLineItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    receivedQuotation: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        estimate: { findUnique: vi.fn() },
        estimateItem: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          delete: vi.fn(),
          count: vi.fn(),
        },
        estimateItemLine: {
          create: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          deleteMany: vi.fn(),
        },
        receivedQuotationLineItem: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
        },
        receivedQuotation: { findUnique: vi.fn() },
      })
    ),
  } as unknown as PrismaClient;
};

describe('EstimateItemService', () => {
  let service: EstimateItemService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new EstimateItemService({
      prisma: mockPrisma,
    });
  });

  describe('createItem', () => {
    it('3行1セットの見積項目を作成する（Requirements: REQ-1.2, REQ-12.1）', async () => {
      // Arrange
      const estimateId = 'est-001';
      const input = {
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            lineType: 'ESTIMATE' as const,
            name: '項目名',
            specification: '規格',
            unit: 'm',
            quantity: 10,
            unitPrice: 1000,
            remarks: '備考',
          },
        ],
      };

      const mockEstimate = {
        id: 'est-001',
        deletedAt: null,
      };

      const mockCreatedItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'eil-001',
            estimateItemId: 'ei-001',
            lineType: 'ESTIMATE',
            name: '項目名',
            specification: '規格',
            unit: 'm',
            quantity: { toString: () => '10' },
            unitPrice: { toString: () => '1000' },
            amount: { toString: () => '10000' },
            remarks: '備考',
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
          },
          {
            id: 'eil-003',
            estimateItemId: 'ei-001',
            lineType: 'VENDOR',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
          estimateItem: {
            create: vi.fn().mockResolvedValue(mockCreatedItem),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.createItem(estimateId, input);

      // Assert
      expect(result.id).toBe('ei-001');
      expect(result.lines).toHaveLength(3);
      expect(result.lines.some((l) => l.lineType === 'ESTIMATE')).toBe(true);
      expect(result.lines.some((l) => l.lineType === 'EXECUTION')).toBe(true);
      expect(result.lines.some((l) => l.lineType === 'VENDOR')).toBe(true);
    });

    it('見積書が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const estimateId = 'est-nonexistent';
      const input = {
        parentId: null,
        displayOrder: 0,
        lines: [],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.createItem(estimateId, input)).rejects.toThrow(EstimateNotFoundError);
    });

    it('親項目を指定して子項目として作成する（Requirements: REQ-2.1, REQ-2.4）', async () => {
      // Arrange
      const estimateId = 'est-001';
      const input = {
        parentId: 'ei-parent',
        displayOrder: 0,
        lines: [],
      };

      const mockEstimate = {
        id: 'est-001',
        deletedAt: null,
      };

      const mockParentItem = {
        id: 'ei-parent',
        estimateId: 'est-001',
      };

      const mockCreatedItem = {
        id: 'ei-child',
        estimateId: 'est-001',
        parentId: 'ei-parent',
        displayOrder: 0,
        lines: [],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
          estimateItem: {
            findUnique: vi.fn().mockResolvedValue(mockParentItem),
            create: vi.fn().mockResolvedValue(mockCreatedItem),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.createItem(estimateId, input);

      // Assert
      expect(result.parentId).toBe('ei-parent');
    });
  });

  describe('getHierarchy', () => {
    it('階層構造で見積項目を取得する（Requirements: REQ-2.2, REQ-2.4）', async () => {
      // Arrange
      const estimateId = 'est-001';

      const mockItems = [
        {
          id: 'ei-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          lines: [],
        },
        {
          id: 'ei-002',
          estimateId: 'est-001',
          parentId: 'ei-001',
          displayOrder: 0,
          lines: [],
        },
        {
          id: 'ei-003',
          estimateId: 'est-001',
          parentId: 'ei-002',
          displayOrder: 0,
          lines: [],
        },
      ];

      vi.mocked(mockPrisma.estimateItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.getHierarchy(estimateId);

      // Assert
      expect(result).toHaveLength(1); // ルート項目は1つ
      expect(result[0]!.id).toBe('ei-001');
      expect(result[0]!.children).toHaveLength(1);
      expect(result[0]!.children[0]!.id).toBe('ei-002');
      expect(result[0]!.children[0]!.children).toHaveLength(1);
      expect(result[0]!.children[0]!.children[0]!.id).toBe('ei-003');
    });
  });

  describe('deleteItem', () => {
    it('子項目がない見積項目を削除する（Requirements: REQ-12.3）', async () => {
      // Arrange
      const itemId = 'ei-001';

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        _count: { children: 0 },
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockResolvedValue(mockItem),
            delete: vi.fn().mockResolvedValue(mockItem),
          },
          estimateItemLine: {
            deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.deleteItem(itemId)).resolves.not.toThrow();
    });

    it('子項目がある場合、強制削除フラグなしでエラーを発生させる（Requirements: REQ-12.4）', async () => {
      // Arrange
      const itemId = 'ei-001';

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        _count: { children: 3 },
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockResolvedValue(mockItem),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.deleteItem(itemId)).rejects.toThrow(EstimateItemHasChildrenError);
    });

    it('子項目がある場合でも、強制削除フラグありで削除する', async () => {
      // Arrange
      const itemId = 'ei-001';

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        _count: { children: 3 },
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockResolvedValue(mockItem),
            delete: vi.fn().mockResolvedValue(mockItem),
          },
          estimateItemLine: {
            deleteMany: vi.fn().mockResolvedValue({ count: 12 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.deleteItem(itemId, true)).resolves.not.toThrow();
    });
  });

  describe('duplicateItem', () => {
    it('見積項目を複製する（Requirements: REQ-12.5）', async () => {
      // Arrange
      const itemId = 'ei-001';

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'eil-001',
            lineType: 'ESTIMATE',
            name: '項目名',
            specification: '規格',
            unit: 'm',
            quantity: { toString: () => '10' },
            unitPrice: { toString: () => '1000' },
            amount: { toString: () => '10000' },
            remarks: '備考',
          },
        ],
      };

      const mockDuplicatedItem = {
        id: 'ei-002',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 1,
        lines: mockItem.lines,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockResolvedValue(mockItem),
            create: vi.fn().mockResolvedValue(mockDuplicatedItem),
            count: vi.fn().mockResolvedValue(1),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.duplicateItem(itemId);

      // Assert
      expect(result.id).toBe('ei-002');
      expect(result.id).not.toBe(itemId);
    });
  });

  describe('moveItem', () => {
    it('見積項目の親を変更する（Requirements: REQ-12.6）', async () => {
      // Arrange
      const itemId = 'ei-001';
      const newParentId = 'ei-002';

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
      };

      const mockNewParent = {
        id: 'ei-002',
        estimateId: 'est-001',
        parentId: null,
      };

      const mockUpdatedItem = {
        ...mockItem,
        parentId: 'ei-002',
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.id === itemId) return Promise.resolve(mockItem);
              if (where.id === newParentId) return Promise.resolve(mockNewParent);
              return Promise.resolve(null);
            }),
            findMany: vi.fn().mockResolvedValue([]), // 子孫にnewParentがいないこと確認用
            update: vi.fn().mockResolvedValue(mockUpdatedItem),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.moveItem(itemId, newParentId);

      // Assert - エラーが発生しないことを確認
    });

    it('循環参照が発生する場合、エラーを発生させる', async () => {
      // Arrange
      const itemId = 'ei-001';
      const newParentId = 'ei-002'; // ei-002はei-001の子孫

      const mockItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
      };

      const mockNewParent = {
        id: 'ei-002',
        estimateId: 'est-001',
        parentId: 'ei-001', // ei-001の子
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        // getDescendantIdsは itemId='ei-001' の子孫を取得する
        // 最初の呼び出し(parentId='ei-001')で子孫[ei-002]を返し、
        // 次の呼び出し(parentId='ei-002')では空配列を返してループを終了させる
        let findManyCallCount = 0;
        const txClient = {
          estimateItem: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.id === itemId) return Promise.resolve(mockItem);
              if (where.id === newParentId) return Promise.resolve(mockNewParent);
              return Promise.resolve(null);
            }),
            findMany: vi.fn().mockImplementation(() => {
              findManyCallCount++;
              // 最初の呼び出しのみ子孫を返し、以降は空配列を返す
              if (findManyCallCount === 1) {
                return Promise.resolve([{ id: newParentId }]);
              }
              return Promise.resolve([]);
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.moveItem(itemId, newParentId)).rejects.toThrow(
        EstimateItemCircularReferenceError
      );
    });
  });

  describe('reorderItems', () => {
    it('見積項目の表示順序を変更する（Requirements: REQ-12.2）', async () => {
      // Arrange
      const estimateId = 'est-001';
      const itemOrders = [
        { id: 'ei-002', displayOrder: 0 },
        { id: 'ei-001', displayOrder: 1 },
        { id: 'ei-003', displayOrder: 2 },
      ];

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue({ id: 'est-001', deletedAt: null }),
          },
          estimateItem: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.reorderItems(estimateId, itemOrders)).resolves.not.toThrow();
    });
  });

  describe('transferFromQuotation', () => {
    it('指定した見積項目に受領見積書を転記する（Requirements: REQ-4.1, REQ-4.3）', async () => {
      // Arrange
      const params = {
        estimateId: 'est-001',
        receivedQuotationId: 'rq-001',
        lineItemIds: ['rqli-001', 'rqli-002'],
        targetEstimateItemId: 'ei-001',
      };

      const mockEstimate = {
        id: 'est-001',
        deletedAt: null,
      };

      const mockTargetItem = {
        id: 'ei-001',
        estimateId: 'est-001',
      };

      // 転記後に取得される更新済み見積項目（linesを含む）
      const mockUpdatedItem = {
        id: 'ei-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'eil-001',
            estimateItemId: 'ei-001',
            lineType: 'ESTIMATE',
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
            name: '材料A',
            specification: '規格A',
            unit: 'm',
            quantity: 10,
            unitPrice: 1000,
            amount: 10000,
            remarks: null,
            sourceReceivedQuotationLineItemId: 'rqli-001',
            sourceVendorName: '業者A',
          },
        ],
      };

      const mockReceivedQuotation = {
        id: 'rq-001',
        name: '業者A見積',
        deletedAt: null,
        estimateRequest: {
          tradingPartner: {
            name: '業者A',
          },
        },
      };

      const mockLineItems = [
        {
          id: 'rqli-001',
          receivedQuotationId: 'rq-001',
          name: '材料A',
          specification: '規格A',
          unit: 'm',
          quantity: { toString: () => '10' },
          unitPrice: { toString: () => '1000' },
          amount: { toString: () => '10000' },
          remarks: null,
        },
        {
          id: 'rqli-002',
          receivedQuotationId: 'rq-001',
          name: '材料B',
          specification: '規格B',
          unit: '式',
          quantity: { toString: () => '1' },
          unitPrice: { toString: () => '5000' },
          amount: { toString: () => '5000' },
          remarks: null,
        },
      ];

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        // estimateItem.findUniqueは2回呼ばれる:
        // 1回目: 転記先の存在確認（mockTargetItem）
        // 2回目: 更新後の見積項目取得（mockUpdatedItem）
        let findUniqueCallCount = 0;
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
          estimateItem: {
            findUnique: vi.fn().mockImplementation(() => {
              findUniqueCallCount++;
              if (findUniqueCallCount === 1) {
                return Promise.resolve(mockTargetItem);
              }
              return Promise.resolve(mockUpdatedItem);
            }),
          },
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockReceivedQuotation),
          },
          receivedQuotationLineItem: {
            findMany: vi.fn().mockResolvedValue(mockLineItems),
          },
          estimateItemLine: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.transferFromQuotation(params);

      // Assert
      expect(result).toHaveLength(1); // 既存項目への転記なので1件
      expect(result[0]!.lines).toHaveLength(3);
      expect(result[0]!.lines.find((l) => l.lineType === 'VENDOR')?.name).toBe('材料A');
    });

    it('見積項目未指定時は新規項目を作成して転記する（Requirements: REQ-4.2）', async () => {
      // Arrange
      const params = {
        estimateId: 'est-001',
        receivedQuotationId: 'rq-001',
        lineItemIds: ['rqli-001', 'rqli-002'],
        // targetEstimateItemIdを指定しない
      };

      const mockEstimate = {
        id: 'est-001',
        deletedAt: null,
      };

      const mockReceivedQuotation = {
        id: 'rq-001',
        name: '業者A見積',
        deletedAt: null,
        estimateRequest: {
          tradingPartner: {
            name: '業者A',
          },
        },
      };

      const mockLineItems = [
        {
          id: 'rqli-001',
          receivedQuotationId: 'rq-001',
          name: '材料A',
          specification: '規格A',
          unit: 'm',
          quantity: { toString: () => '10' },
          unitPrice: { toString: () => '1000' },
          amount: { toString: () => '10000' },
          remarks: null,
        },
      ];

      const mockCreatedItem = {
        id: 'ei-new',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          { lineType: 'ESTIMATE', name: null },
          { lineType: 'EXECUTION', name: null },
          { lineType: 'VENDOR', name: '材料A' },
        ],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimate: {
            findUnique: vi.fn().mockResolvedValue(mockEstimate),
          },
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockReceivedQuotation),
          },
          receivedQuotationLineItem: {
            findMany: vi.fn().mockResolvedValue(mockLineItems),
          },
          estimateItem: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreatedItem),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.transferFromQuotation(params);

      // Assert
      expect(result).toHaveLength(1); // 新規作成された項目
    });
  });
});
