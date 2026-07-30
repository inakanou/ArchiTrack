/**
 * @fileoverview EstimateDraftService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - 34.1: 追加された項目をデータベースに登録する
 * - 34.2: 削除された項目をデータベースから削除する
 * - 34.3: 編集された最新の内容をデータベースに反映する
 * - 34.4: 追加・削除・更新の全ての変更タイプを正しく処理する
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.3: 一部に失敗した場合は変更をすべて破棄して保存前の状態を保つ
 * - 42.4: 入力内容に不備がある場合は保存を開始しない
 * - 42.9: 既存の見積項目と実行予算項目からの参照関係を維持する
 *
 * Task 52.4: 明細の差分適用と親子関係の解決
 *
 * @module __tests__/unit/services/estimate-draft.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { EstimateDraftService } from '../../../services/estimate-draft.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  EstimateNotFoundError,
  EstimateDraftValidationError,
} from '../../../errors/estimateError.js';
import type {
  SaveEstimateDraftInput,
  SaveEstimateItemNodeInput,
  SaveEstimateLineInput,
} from '../../../schemas/estimate.schema.js';

/** 書き込み系モック（トランザクションクライアント側） */
type MockTxClient = {
  estimateItem: {
    create: Mock;
    update: Mock;
    updateMany: Mock;
    deleteMany: Mock;
  };
  estimateItemLine: {
    upsert: Mock;
    deleteMany: Mock;
  };
};

/** 読み取り系＋トランザクション起点のモック */
type MockPrismaClient = MockTxClient & {
  estimate: { findUnique: Mock };
  estimateItem: MockTxClient['estimateItem'] & { findMany: Mock };
  $transaction: Mock;
};

const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FOREIGN_ITEM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** 明細行ペイロードを組み立てる（全キー必須のワイヤ契約に合わせる） */
function buildLine(overrides: Partial<SaveEstimateLineInput> = {}): SaveEstimateLineInput {
  return {
    lineType: 'ESTIMATE',
    name: '基礎工事',
    specification: 'RC造',
    unit: '式',
    quantity: '1.0000',
    unitPrice: '100000.00',
    amount: '100000.00',
    remarks: '備考',
    sourceVendorName: null,
    ...overrides,
  };
}

/** 見積項目ノードペイロードを組み立てる */
function buildNode(overrides: Partial<SaveEstimateItemNodeInput> = {}): SaveEstimateItemNodeInput {
  return {
    id: null,
    tempId: null,
    itemType: 'STANDARD',
    lines: [buildLine()],
    children: [],
    ...overrides,
  };
}

/** 一括保存入力を組み立てる */
function buildInput(items: SaveEstimateItemNodeInput[]): SaveEstimateDraftInput {
  return {
    expectedUpdatedAt: '2026-07-31T00:00:00.000Z',
    reportFields: {
      submissionDate: null,
      validityPeriod: null,
      separateWorks: [],
    },
    items,
  };
}

describe('EstimateDraftService', () => {
  let service: EstimateDraftService;
  let mockPrisma: MockPrismaClient;
  let mockTx: MockTxClient;
  let createdIdSequence: number;

  beforeEach(() => {
    createdIdSequence = 0;

    mockTx = {
      estimateItem: {
        create: vi.fn(async () => {
          createdIdSequence += 1;
          return { id: `generated-${createdIdSequence}` };
        }),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      estimateItemLine: {
        upsert: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockPrisma = {
      estimate: {
        findUnique: vi.fn().mockResolvedValue({ id: ESTIMATE_ID, deletedAt: null }),
      },
      estimateItem: {
        findMany: vi.fn().mockResolvedValue([]),
        // 書き込みはトランザクションクライアント側で行われる想定。
        // prisma 直下が呼ばれた場合はテストで検出できるようモックを分ける
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      estimateItemLine: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: MockTxClient) => Promise<unknown>) =>
        callback(mockTx)
      ),
    };

    service = new EstimateDraftService({
      prisma: mockPrisma as unknown as PrismaClient,
    });
  });

  /** トランザクション内で書き込みが1件も発生していないことを確認する */
  function expectNoWrites(): void {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
    expect(mockTx.estimateItem.update).not.toHaveBeenCalled();
    expect(mockTx.estimateItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.estimateItemLine.upsert).not.toHaveBeenCalled();
    expect(mockTx.estimateItemLine.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.estimateItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.estimateItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.estimateItem.deleteMany).not.toHaveBeenCalled();
  }

  describe('saveDraft: 保存前検証（42.4）', () => {
    it('見積書が存在しない場合は書き込みを一切行わずに 404 相当のエラーを投げる', async () => {
      mockPrisma.estimate.findUnique.mockResolvedValue(null);

      await expect(service.saveDraft(ESTIMATE_ID, buildInput([buildNode()]))).rejects.toThrow(
        EstimateNotFoundError
      );

      expectNoWrites();
    });

    it('論理削除済みの見積書は存在しないものとして扱う', async () => {
      mockPrisma.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(service.saveDraft(ESTIMATE_ID, buildInput([]))).rejects.toThrow(
        EstimateNotFoundError
      );

      expectNoWrites();
    });

    it('他の見積書の項目IDが含まれる場合はトランザクションを開始せずに検証エラーとする', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([buildNode({ id: ITEM_A }), buildNode({ id: FOREIGN_ITEM })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow(
        EstimateDraftValidationError
      );

      expectNoWrites();
    });

    it('検証エラーには不備のあった項目が含まれる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([]);

      const input = buildInput([buildNode({ id: FOREIGN_ITEM })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toMatchObject({
        statusCode: 422,
        issues: [expect.objectContaining({ path: `items.${FOREIGN_ITEM}` })],
      });
    });
  });

  describe('saveDraft: 削除の差分適用（34.2）', () => {
    it('ペイロードに含まれない既存項目を削除し、子孫は連鎖削除に委ねる', async () => {
      // DB: A(ルート) - B(Aの子) / C(ルート)。ペイロードは C のみ
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
        { id: ITEM_C, parentId: null },
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_C })]));

      // 削除は「削除対象の根」のみ。子孫 B は onDelete: Cascade に委ねる
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_A] } },
      });
      expect(result.deletedItemIds).toEqual(expect.arrayContaining([ITEM_A, ITEM_B]));
    });

    it('削除対象が無い場合は削除を発行しない', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_A })]));

      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
    });

    it('削除される親から別の親へ移動した既存項目は、削除前に切り離して連鎖削除から守る', async () => {
      // DB: A(ルート) - B(Aの子)。ペイロードは B のみ（A は削除、B はルートへ移動）
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
      ]);

      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_B })]));

      expect(mockTx.estimateItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_B] } },
        data: { parentId: null },
      });
      // 切り離しは削除より前に発行される
      const detachOrder = mockTx.estimateItem.updateMany.mock.invocationCallOrder[0]!;
      const deleteOrder = mockTx.estimateItem.deleteMany.mock.invocationCallOrder[0]!;
      expect(detachOrder).toBeLessThan(deleteOrder);
      // B は削除されない
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_A] } },
      });
    });
  });

  describe('saveDraft: 既存項目の更新（34.3, 42.9）', () => {
    it('既存項目はIDを維持して更新し、削除＋再作成を行わない', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          lines: [buildLine({ name: '更新後の名称', unitPrice: '250000.00' })],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ITEM_A } })
      );
      expect(result.updatedItemIds).toEqual([ITEM_A]);
    });

    it('既存項目の明細行は行タイプを鍵に upsert し、内容を反映する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          lines: [buildLine({ name: '更新後の名称', amount: '250000.00' })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItemLine.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estimateItemId_lineType: { estimateItemId: ITEM_A, lineType: 'ESTIMATE' },
          },
          update: expect.objectContaining({ name: '更新後の名称', amount: '250000.00' }),
        })
      );
    });

    it('ペイロードから消えた行タイプの明細行を削除する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({ id: ITEM_A, lines: [buildLine({ lineType: 'ESTIMATE' })] }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItemLine.deleteMany).toHaveBeenCalledWith({
        where: { estimateItemId: ITEM_A, lineType: { notIn: ['ESTIMATE'] } },
      });
    });

    it('既存項目の階層移動は parentId の更新で反映する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: null },
      ]);

      const input = buildInput([buildNode({ id: ITEM_A, children: [buildNode({ id: ITEM_B })] })]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ITEM_B },
          data: expect.objectContaining({ parentId: ITEM_A }),
        })
      );
    });
  });

  describe('saveDraft: 新規項目と親子関係の解決（34.1, 42.1）', () => {
    it('多階層の新規サブツリーを一時IDから生成IDへの対応表で解決する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-root',
          children: [
            buildNode({
              tempId: 'tmp-child',
              children: [buildNode({ tempId: 'tmp-grandchild' })],
            }),
          ],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItem.create).toHaveBeenCalledTimes(3);

      const [rootCall, childCall, grandchildCall] = mockTx.estimateItem.create.mock.calls;
      expect(rootCall![0].data).toMatchObject({ estimateId: ESTIMATE_ID, parentId: null });
      expect(childCall![0].data).toMatchObject({ parentId: 'generated-1' });
      expect(grandchildCall![0].data).toMatchObject({ parentId: 'generated-2' });

      expect(result.tempIdMap).toEqual({
        'tmp-root': 'generated-1',
        'tmp-child': 'generated-2',
        'tmp-grandchild': 'generated-3',
      });
      expect(result.createdItemIds).toEqual(['generated-1', 'generated-2', 'generated-3']);
    });

    it('新規項目を既存項目の子として作成する場合は既存IDを親に用いる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({ id: ITEM_A, children: [buildNode({ tempId: 'tmp-new' })] }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: ITEM_A }),
        })
      );
    });

    it('新規項目は明細行をまとめて作成する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-new',
          lines: [
            buildLine({ lineType: 'ESTIMATE' }),
            buildLine({ lineType: 'EXECUTION', name: '実行' }),
          ],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      const createArg = mockTx.estimateItem.create.mock.calls[0]![0];
      expect(createArg.data.lines.create).toHaveLength(2);
      expect(createArg.data.lines.create[0]).toMatchObject({
        lineType: 'ESTIMATE',
        name: '基礎工事',
      });
      expect(createArg.data.lines.create[1]).toMatchObject({
        lineType: 'EXECUTION',
        name: '実行',
      });
    });
  });

  describe('saveDraft: 注記行の正規化（design.md「NOTE 項目は name 以外は NULL とする」）', () => {
    it('新規の注記行は名称以外を NULL に正規化して作成する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-note',
          itemType: 'NOTE',
          lines: [buildLine({ name: '※別途工事あり' })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      const createArg = mockTx.estimateItem.create.mock.calls[0]![0];
      expect(createArg.data.itemType).toBe('NOTE');
      expect(createArg.data.lines.create[0]).toEqual({
        lineType: 'ESTIMATE',
        name: '※別途工事あり',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
        sourceVendorName: null,
      });
    });

    it('既存項目を注記行へ変更した場合も名称以外を NULL に正規化する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          itemType: 'NOTE',
          lines: [buildLine({ name: '※注記' })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      const upsertArg = mockTx.estimateItemLine.upsert.mock.calls[0]![0];
      expect(upsertArg.update).toEqual({
        lineType: 'ESTIMATE',
        name: '※注記',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
        sourceVendorName: null,
      });
    });

    it('通常項目の明細行は入力値をそのまま保持する', async () => {
      const input = buildInput([buildNode({ tempId: 'tmp-standard' })]);

      await service.saveDraft(ESTIMATE_ID, input);

      const createArg = mockTx.estimateItem.create.mock.calls[0]![0];
      expect(createArg.data.lines.create[0]).toMatchObject({
        specification: 'RC造',
        unit: '式',
        quantity: '1.0000',
        unitPrice: '100000.00',
        amount: '100000.00',
        remarks: '備考',
      });
    });
  });

  describe('saveDraft: 単一トランザクション（42.1, 42.3）', () => {
    it('追加・削除・更新をすべて単一のトランザクションで実行する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_C, parentId: null },
      ]);

      const input = buildInput([
        buildNode({ id: ITEM_A, children: [buildNode({ tempId: 'tmp-new' })] }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // 書き込みはトランザクションクライアント経由のみ
      expect(mockPrisma.estimateItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItemLine.upsert).not.toHaveBeenCalled();

      expect(result.createdItemIds).toHaveLength(1);
      expect(result.updatedItemIds).toEqual([ITEM_A]);
      expect(result.deletedItemIds).toEqual([ITEM_C]);
    });

    it('途中で失敗した場合はエラーを伝播し、以降の書き込みを行わない（全ロールバック）', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);
      const failure = new Error('DB書き込み失敗');
      mockTx.estimateItem.update.mockRejectedValue(failure);

      const input = buildInput([
        buildNode({ id: ITEM_A }),
        buildNode({ tempId: 'tmp-after-failure' }),
      ]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow('DB書き込み失敗');

      // 失敗以降の書き込みは発行されない（ロールバックは $transaction に委ねる）
      expect(mockTx.estimateItemLine.upsert).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
    });
  });
});
