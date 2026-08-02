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
  });
});
