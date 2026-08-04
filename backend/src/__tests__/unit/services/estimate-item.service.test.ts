/**
 * @fileoverview EstimateItemService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-2.2: その項目を親項目の子として階層表示する
 * - REQ-2.4: 複数階層のネスト（例：建築工事 > 直接仮設工事 > 遣り方）をサポートする
 *
 * 削除・複写・並び替え・階層移動は一括保存（`PUT /api/estimates/:id/save`）へ統合し、
 * 本サービスから撤去したため対応するテストも撤去した（Task 53.12、REQ-42.1）。
 * 一括保存側の検証は `estimate-draft.service` のテストが担当する。
 *
 * `createItem` と `transferFromQuotation` は Task 55.7（REQ-49.3）で撤去したため、
 * 対応するテストも撤去した。移行先は次のとおり:
 * - 3行1セットの生成（REQ-1.2, REQ-12.1）→ `estimateEditReducer.test.ts` の
 *   `estimateEditReducer / insertRow`、永続化は `estimate-draft.service.test.ts` の
 *   `saveDraft: 新規項目と親子関係の解決（34.1, 42.1）`
 * - 値引き行の単一行生成（REQ-41.2, REQ-41.3）→ `estimateEditReducer.test.ts` の
 *   「プリセット値の値引き行をルートレベルの末尾に追加する」
 * - 見積書不在・論理削除・他見積書の項目ID → `estimate-draft.service.test.ts` の
 *   `saveDraft: 保存前検証（42.4）`
 * - 既存項目を親に指定した子の生成（REQ-2.1, REQ-2.4）→ `estimate-draft.service.test.ts` の
 *   「新規項目を既存項目の子として作成する場合は既存IDを親に用いる」
 * - 受領見積書転記（REQ-4.1〜4.3, REQ-30.1〜30.4）→ `estimateEditReducer.test.ts` の
 *   `estimateEditReducer / applyQuotationTransfer`
 *
 * Task 2.2: EstimateItemServiceの実装
 * Task 53.12: 明細操作系の撤去
 * Task 55.7: 転記・個別作成の撤去
 *
 * @module tests/unit/services/estimate-item.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EstimateItemService } from '../../../services/estimate-item.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimateItem: {
      findMany: vi.fn(),
    },
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

    it('見積金額行の数値項目と転記元情報を変換する（Requirements: REQ-2.2）', async () => {
      // Arrange: Prisma の Decimal 相当値と NULL 混在の行を返す
      const mockItems = [
        {
          id: 'ei-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          itemType: 'STANDARD',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
          lines: [
            {
              id: 'eil-001',
              estimateItemId: 'ei-001',
              lineType: 'ESTIMATE',
              name: '直接仮設工事',
              specification: '一式',
              unit: '式',
              quantity: '2.5',
              unitPrice: '1000',
              amount: '2500',
              remarks: '備考',
              sourceReceivedQuotationLineItemId: 'rqli-001',
              sourceVendorName: '株式会社サンプル',
            },
            {
              id: 'eil-002',
              estimateItemId: 'ei-001',
              lineType: 'VENDOR',
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
          ],
        },
      ];

      vi.mocked(mockPrisma.estimateItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.getHierarchy('est-001');

      // Assert: 数値は Number 変換され、NULL は NULL のまま保持される
      const [estimateLine, vendorLine] = result[0]!.lines;
      expect(estimateLine).toMatchObject({
        lineType: 'ESTIMATE',
        quantity: 2.5,
        unitPrice: 1000,
        amount: 2500,
        sourceReceivedQuotationLineItemId: 'rqli-001',
        sourceVendorName: '株式会社サンプル',
      });
      expect(vendorLine).toMatchObject({
        lineType: 'VENDOR',
        quantity: null,
        unitPrice: null,
        amount: null,
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
      });
    });

    it('転記元カラムが未定義の行はNULLへ正規化する（Requirements: REQ-2.2）', async () => {
      // Arrange: 転記元カラムをプロパティごと持たない行
      const mockItems = [
        {
          id: 'ei-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [
            {
              id: 'eil-001',
              estimateItemId: 'ei-001',
              lineType: 'EXECUTION',
              name: '遣り方',
              specification: null,
              unit: null,
              quantity: null,
              unitPrice: null,
              amount: null,
              remarks: null,
            },
          ],
        },
      ];

      vi.mocked(mockPrisma.estimateItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.getHierarchy('est-001');

      // Assert
      expect(result[0]!.lines[0]).toMatchObject({
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
      });
    });

    it('項目種別を保持し未設定はSTANDARDへ既定する（Requirements: REQ-41.3, REQ-55.1）', async () => {
      // Arrange: DISCOUNT / NOTE / itemType 未設定を混在させる
      const mockItems = [
        {
          id: 'ei-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          itemType: 'DISCOUNT',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [],
        },
        {
          id: 'ei-002',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 1,
          itemType: 'NOTE',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [],
        },
        {
          id: 'ei-003',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 2,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [],
        },
      ];

      vi.mocked(mockPrisma.estimateItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.getHierarchy('est-001');

      // Assert
      expect(result.map((item) => item.itemType)).toEqual(['DISCOUNT', 'NOTE', 'STANDARD']);
    });

    it('親が存在しない項目はルートにも子にも現れない（Requirements: REQ-2.4）', async () => {
      // Arrange: 参照先が結果集合に存在しない parentId を持つ項目
      const mockItems = [
        {
          id: 'ei-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [],
        },
        {
          id: 'ei-999',
          estimateId: 'est-001',
          parentId: 'ei-missing',
          displayOrder: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          lines: [],
        },
      ];

      vi.mocked(mockPrisma.estimateItem.findMany).mockResolvedValue(mockItems as never);

      // Act
      const result = await service.getHierarchy('est-001');

      // Assert: 例外を投げず、親不在の項目は木から除外される
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('ei-001');
      expect(result[0]!.children).toHaveLength(0);
    });
  });
});
