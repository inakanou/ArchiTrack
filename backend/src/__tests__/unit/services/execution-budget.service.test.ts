/**
 * @fileoverview ExecutionBudgetService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1-1.7: 実行予算の作成（Task 2.1）
 * - 2.1-2.3: 実行予算の削除（Task 2.2）
 * - 3.1-3.10: 実行予算項目一覧表示（Task 2.2）
 * - 4.1-4.5: 実行予算項目の編集（Task 2.2）
 *
 * Task 2.1: 実行予算の作成サービス実装
 * Task 2.2: 実行予算の取得・削除・編集サービス実装
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionBudgetService,
  type ExecutionBudgetServiceDependencies,
} from '../../../services/execution-budget.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  ExecutionBudgetDeletionBlockedError,
  AmendmentContractNotFoundError,
  AmendmentAlreadyAppliedError,
} from '../../../errors/executionBudgetError.js';

// ========================================
// モック: Prisma Client
// ========================================

/**
 * Prismaトランザクション内モックを作成する
 */
function createMockTx() {
  return {
    executionBudget: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    executionBudgetItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    estimate: {
      findUnique: vi.fn(),
    },
    tradingPartner: {
      findFirst: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
    },
    progressRecordItem: {
      findFirst: vi.fn(),
    },
    amendmentApplyHistory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

function createMockPrisma() {
  const mockTx = createMockTx();

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
      executionBudget: {
        findFirst: mockTx.executionBudget.findFirst,
        findUnique: mockTx.executionBudget.findUnique,
        update: mockTx.executionBudget.update,
      },
      executionBudgetItem: {
        findMany: mockTx.executionBudgetItem.findMany,
        findUnique: mockTx.executionBudgetItem.findUnique,
        update: mockTx.executionBudgetItem.update,
      },
      order: {
        findFirst: mockTx.order.findFirst,
      },
    } as unknown as PrismaClient,
    mockTx,
  };
}

// ========================================
// テスト用サンプルデータ
// ========================================

const projectId = '550e8400-e29b-41d4-a716-446655440000';
const contractId = '550e8400-e29b-41d4-a716-446655440001';
const estimateId = '550e8400-e29b-41d4-a716-446655440002';
const tradingPartnerId1 = '550e8400-e29b-41d4-a716-446655440010';

// 契約書モック
const mockContract = {
  id: contractId,
  projectId,
  estimateId,
  status: 'CONTRACTED',
  deletedAt: null,
};

// 見積項目モック（ルート項目と子項目）
const mockEstimateItems = [
  {
    id: 'item-1',
    estimateId,
    parentId: null,
    displayOrder: 0,
    lines: [
      {
        lineType: 'ESTIMATE',
        name: '建築工事',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: { toString: () => '5000000' },
      },
      {
        lineType: 'EXECUTION',
        name: '建築工事',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: { toString: () => '4500000' },
      },
      {
        lineType: 'VENDOR',
        name: null,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        sourceVendorName: null,
      },
    ],
  },
  {
    id: 'item-2',
    estimateId,
    parentId: 'item-1',
    displayOrder: 1,
    lines: [
      {
        lineType: 'ESTIMATE',
        name: '直接仮設工事',
        specification: '一式',
        unit: '式',
        quantity: { toString: () => '1' },
        unitPrice: { toString: () => '500000' },
        amount: { toString: () => '500000' },
      },
      {
        lineType: 'EXECUTION',
        name: '直接仮設工事',
        specification: '一式',
        unit: '式',
        quantity: { toString: () => '1' },
        unitPrice: { toString: () => '450000' },
        amount: { toString: () => '450000' },
      },
      {
        lineType: 'VENDOR',
        name: '直接仮設工事',
        specification: '一式',
        unit: '式',
        quantity: { toString: () => '1' },
        unitPrice: { toString: () => '400000' },
        amount: { toString: () => '400000' },
        sourceVendorName: '株式会社テスト工務店',
      },
    ],
  },
  {
    id: 'item-3',
    estimateId,
    parentId: 'item-1',
    displayOrder: 2,
    lines: [
      {
        lineType: 'ESTIMATE',
        name: '鉄筋コンクリート工事',
        specification: null,
        unit: 'm3',
        quantity: { toString: () => '10' },
        unitPrice: { toString: () => '50000' },
        amount: { toString: () => '500000' },
      },
      {
        lineType: 'EXECUTION',
        name: '鉄筋コンクリート工事',
        specification: null,
        unit: 'm3',
        quantity: { toString: () => '10' },
        unitPrice: { toString: () => '48000' },
        amount: { toString: () => '480000' },
      },
      {
        lineType: 'VENDOR',
        name: '鉄筋コンクリート工事',
        specification: null,
        unit: 'm3',
        quantity: { toString: () => '10' },
        unitPrice: { toString: () => '45000' },
        amount: { toString: () => '450000' },
        sourceVendorName: '株式会社ABCコンクリート',
      },
    ],
  },
];

// 見積書モック（items付き）
const mockEstimate = {
  id: estimateId,
  projectId,
  items: mockEstimateItems,
};

// 作成された実行予算モック
const createdBudgetId = '550e8400-e29b-41d4-a716-446655440099';
const mockCreatedBudget = {
  id: createdBudgetId,
  projectId,
  contractId,
  version: 0,
  createdAt: new Date('2026-03-18'),
  updatedAt: new Date('2026-03-18'),
  deletedAt: null,
};

// ========================================
// テスト
// ========================================

describe('ExecutionBudgetService', () => {
  let service: ExecutionBudgetService;
  let mockTx: ReturnType<typeof createMockTx>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    const mocks = createMockPrisma();
    mockPrisma = mocks.prisma;
    mockTx = mocks.mockTx;
    const deps: ExecutionBudgetServiceDependencies = {
      prisma: mockPrisma,
    };
    service = new ExecutionBudgetService(deps);
  });

  describe('create', () => {
    // Phase 2マッピング用のモック生成されたExecutionBudgetItem IDs
    const ebItemId1 = 'eb-item-1';
    const ebItemId2 = 'eb-item-2';
    const ebItemId3 = 'eb-item-3';

    /**
     * 共通のPhase 2 findMany/updateモックをセットアップするヘルパー
     */
    function setupPhase2Mocks() {
      // Phase 2: findManyで作成された項目を返却（estimateItemId → executionBudgetItemIdマッピング用）
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        { id: ebItemId1, estimateItemId: 'item-1' },
        { id: ebItemId2, estimateItemId: 'item-2' },
        { id: ebItemId3, estimateItemId: 'item-3' },
      ]);
      // Phase 2: parentId更新
      mockTx.executionBudgetItem.update.mockResolvedValue({});
    }

    it('契約書に紐づく見積項目から実行予算と実行予算項目を一括作成する', async () => {
      // Arrange
      // 既存実行予算なし
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      // 契約書が存在
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      // 見積書（items付き）を返却
      mockTx.estimate.findUnique.mockResolvedValue(mockEstimate);
      // 取引先検索（名前完全一致）
      mockTx.tradingPartner.findFirst
        .mockResolvedValueOnce({ id: tradingPartnerId1, name: '株式会社テスト工務店' }) // item-2用
        .mockResolvedValueOnce(null); // item-3用（不一致 → null）
      // 実行予算作成
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);
      // Phase 1: 項目一括作成
      mockTx.executionBudgetItem.createMany.mockResolvedValue({ count: 3 });
      // Phase 2: 階層構造の復元
      setupPhase2Mocks();

      // Act
      const result = await service.create(projectId, contractId);

      // Assert
      // 1. 既存チェック
      expect(mockTx.executionBudget.findFirst).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
      });

      // 2. 契約書取得
      expect(mockTx.contract.findUnique).toHaveBeenCalledWith({
        where: { id: contractId },
        select: expect.objectContaining({
          id: true,
          projectId: true,
          estimateId: true,
          deletedAt: true,
        }),
      });

      // 3. 見積書取得（items + lines含む）
      expect(mockTx.estimate.findUnique).toHaveBeenCalledWith({
        where: { id: estimateId },
        include: {
          items: {
            orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
            include: {
              lines: true,
            },
          },
        },
      });

      // 4. ExecutionBudget作成
      expect(mockTx.executionBudget.create).toHaveBeenCalledWith({
        data: {
          projectId,
          contractId,
        },
      });

      // 5. Phase 1: ExecutionBudgetItem一括作成（parentId=nullで作成）
      expect(mockTx.executionBudgetItem.createMany).toHaveBeenCalledTimes(1);
      const createManyCall = mockTx.executionBudgetItem.createMany.mock.calls[0]![0];
      const createdItems = createManyCall.data;

      // 3項目が作成される
      expect(createdItems).toHaveLength(3);

      // item-1: ルート親項目（parentId=null）
      expect(createdItems[0]).toMatchObject({
        executionBudgetId: createdBudgetId,
        estimateItemId: 'item-1',
        parentId: null,
        displayOrder: 0,
        name: '建築工事',
        plannedVendorId: null, // VENDOR行にsourceVendorNameなし
      });

      // item-2: Phase 1ではparentId=nullで作成される
      expect(createdItems[1]).toMatchObject({
        executionBudgetId: createdBudgetId,
        estimateItemId: 'item-2',
        parentId: null, // Phase 1ではnull
        displayOrder: 1,
        name: '直接仮設工事',
        specification: '一式',
        unit: '式',
        plannedVendorId: tradingPartnerId1, // 名前完全一致で取引先が見つかった
      });

      // item-3: Phase 1ではparentId=nullで作成される
      expect(createdItems[2]).toMatchObject({
        executionBudgetId: createdBudgetId,
        estimateItemId: 'item-3',
        parentId: null, // Phase 1ではnull
        displayOrder: 2,
        name: '鉄筋コンクリート工事',
        unit: 'm3',
        plannedVendorId: null, // 名前不一致 → null
      });

      // 6. Phase 2: 階層構造の復元（parentIdの更新）
      // findManyでestimateItemId→executionBudgetItemIdのマッピングを取得
      expect(mockTx.executionBudgetItem.findMany).toHaveBeenCalledWith({
        where: { executionBudgetId: createdBudgetId },
        select: { id: true, estimateItemId: true },
      });

      // item-2のparentIdをebItemId1に更新
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: ebItemId2 },
        data: { parentId: ebItemId1 },
      });

      // item-3のparentIdをebItemId1に更新
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: ebItemId3 },
        data: { parentId: ebItemId1 },
      });

      // item-1はparentId=nullなので更新されない（計2回の更新）
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledTimes(2);

      // 7. 結果の検証
      expect(result).toMatchObject({
        id: createdBudgetId,
        projectId,
        contractId,
      });
    });

    it('EXECUTION行のデータから見積単価・見積金額・実行単価・実行金額を正しく初期化する', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      mockTx.estimate.findUnique.mockResolvedValue(mockEstimate);
      mockTx.tradingPartner.findFirst.mockResolvedValue(null);
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);
      mockTx.executionBudgetItem.createMany.mockResolvedValue({ count: 3 });
      setupPhase2Mocks();

      // Act
      await service.create(projectId, contractId);

      // Assert
      const createManyCall = mockTx.executionBudgetItem.createMany.mock.calls[0]![0];
      const items = createManyCall.data;

      // item-2: ESTIMATE行とEXECUTION行の両方のデータが使われる
      const item2 = items[1];
      // 見積単価・見積金額はESTIMATE行から
      expect(item2.estimateUnitPrice).toBeTruthy();
      expect(item2.estimateAmount).toBeTruthy();
      // 実行単価・実行金額はEXECUTION行から
      expect(item2.executionUnitPrice).toBeTruthy();
      expect(item2.executionAmount).toBeTruthy();
      // 数量はESTIMATE行から（共通）
      expect(item2.quantity).toBeTruthy();
    });

    it('VENDOR行のsourceVendorNameから取引先マスタを名前完全一致で検索する', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      mockTx.estimate.findUnique.mockResolvedValue(mockEstimate);
      mockTx.tradingPartner.findFirst
        .mockResolvedValueOnce({ id: tradingPartnerId1, name: '株式会社テスト工務店' })
        .mockResolvedValueOnce(null);
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);
      mockTx.executionBudgetItem.createMany.mockResolvedValue({ count: 3 });
      setupPhase2Mocks();

      // Act
      await service.create(projectId, contractId);

      // Assert
      // item-2のVENDOR行のsourceVendorNameで検索
      expect(mockTx.tradingPartner.findFirst).toHaveBeenCalledWith({
        where: { name: '株式会社テスト工務店', deletedAt: null },
        select: { id: true },
      });

      // item-3のVENDOR行のsourceVendorNameで検索
      expect(mockTx.tradingPartner.findFirst).toHaveBeenCalledWith({
        where: { name: '株式会社ABCコンクリート', deletedAt: null },
        select: { id: true },
      });

      // item-1はVENDOR行のsourceVendorNameがnullなので検索されない
      expect(mockTx.tradingPartner.findFirst).toHaveBeenCalledTimes(2);
    });

    it('プロジェクトに既に実行予算が存在する場合はExecutionBudgetAlreadyExistsErrorを投げる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue({
        id: 'existing-budget-id',
        projectId,
        deletedAt: null,
      });

      // Act & Assert
      await expect(service.create(projectId, contractId)).rejects.toThrow(
        ExecutionBudgetAlreadyExistsError
      );
    });

    it('指定された契約書が存在しない場合はContractNotFoundForBudgetErrorを投げる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(projectId, contractId)).rejects.toThrow(
        ContractNotFoundForBudgetError
      );
    });

    it('契約書が論理削除済みの場合はContractNotFoundForBudgetErrorを投げる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue({
        ...mockContract,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.create(projectId, contractId)).rejects.toThrow(
        ContractNotFoundForBudgetError
      );
    });

    it('見積書に項目がない場合でも実行予算は作成され、項目は0件となる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      mockTx.estimate.findUnique.mockResolvedValue({
        id: estimateId,
        projectId,
        items: [],
      });
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);

      // Act
      const result = await service.create(projectId, contractId);

      // Assert
      expect(mockTx.executionBudget.create).toHaveBeenCalled();
      // 項目が0件なのでcreateManyは呼ばれない
      expect(mockTx.executionBudgetItem.createMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: createdBudgetId });
    });

    it('見積項目の階層構造（parentId）をコピーしてdisplayOrderを保持する', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      mockTx.estimate.findUnique.mockResolvedValue(mockEstimate);
      mockTx.tradingPartner.findFirst.mockResolvedValue(null);
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);
      mockTx.executionBudgetItem.createMany.mockResolvedValue({ count: 3 });
      setupPhase2Mocks();

      // Act
      await service.create(projectId, contractId);

      // Assert
      const createManyCall = mockTx.executionBudgetItem.createMany.mock.calls[0]![0];
      const items = createManyCall.data;

      // displayOrderが保持されている
      expect(items[0].displayOrder).toBe(0);
      expect(items[1].displayOrder).toBe(1);
      expect(items[2].displayOrder).toBe(2);

      // estimateItemIdの参照が保持されている
      expect(items[0].estimateItemId).toBe('item-1');
      expect(items[1].estimateItemId).toBe('item-2');
      expect(items[2].estimateItemId).toBe('item-3');
    });

    it('トランザクション内でExecutionBudgetとExecutionBudgetItemsが一括作成される', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue(mockContract);
      mockTx.estimate.findUnique.mockResolvedValue(mockEstimate);
      mockTx.tradingPartner.findFirst.mockResolvedValue(null);
      mockTx.executionBudget.create.mockResolvedValue(mockCreatedBudget);
      mockTx.executionBudgetItem.createMany.mockResolvedValue({ count: 3 });
      setupPhase2Mocks();

      // Act
      await service.create(projectId, contractId);

      // Assert: $transactionが呼び出されていることを確認
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('契約書にestimateIdがない場合はContractNotFoundForBudgetErrorを投げる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);
      mockTx.contract.findUnique.mockResolvedValue({
        ...mockContract,
        estimateId: null,
      });

      // Act & Assert
      await expect(service.create(projectId, contractId)).rejects.toThrow(
        ContractNotFoundForBudgetError
      );
    });
  });

  // ========================================
  // Task 2.2: 実行予算の取得・削除・編集サービス実装
  // ========================================

  describe('getWithItems', () => {
    // 実行予算項目のモックデータ（階層構造あり）
    const mockBudgetWithItems = {
      id: createdBudgetId,
      projectId,
      contractId,
      version: 0,
      createdAt: new Date('2026-03-18'),
      updatedAt: new Date('2026-03-18'),
      deletedAt: null,
      contract: {
        id: contractId,
        contractAmount: { toString: () => '10000000' },
      },
      items: [
        {
          id: 'eb-item-1',
          executionBudgetId: createdBudgetId,
          parentId: null,
          displayOrder: 0,
          name: '建築工事',
          specification: null,
          unit: null,
          quantity: null,
          estimateUnitPrice: null,
          estimateAmount: { toString: () => '5000000' },
          executionUnitPrice: null,
          executionAmount: { toString: () => '4500000' },
          amendmentAmount: { toString: () => '0' },
          previousMonthExpense: { toString: () => '0' },
          currentMonthExpense: { toString: () => '0' },
          plannedVendorId: null,
          plannedVendor: null,
          remarks: null,
          amendmentStatus: null,
          children: [
            {
              id: 'eb-item-2',
              executionBudgetId: createdBudgetId,
              parentId: 'eb-item-1',
              displayOrder: 1,
              name: '直接仮設工事',
              specification: '一式',
              unit: '式',
              quantity: { toString: () => '1' },
              estimateUnitPrice: { toString: () => '500000' },
              estimateAmount: { toString: () => '500000' },
              executionUnitPrice: { toString: () => '450000' },
              executionAmount: { toString: () => '450000' },
              amendmentAmount: { toString: () => '0' },
              previousMonthExpense: { toString: () => '100000' },
              currentMonthExpense: { toString: () => '50000' },
              plannedVendorId: tradingPartnerId1,
              plannedVendor: { id: tradingPartnerId1, name: '株式会社テスト工務店' },
              remarks: null,
              amendmentStatus: null,
              children: [],
              orderItems: [
                {
                  checked: true,
                  orderAmount: { toString: () => '440000' },
                  order: { status: 'ORDERED', deletedAt: null },
                },
              ],
            },
            {
              id: 'eb-item-3',
              executionBudgetId: createdBudgetId,
              parentId: 'eb-item-1',
              displayOrder: 2,
              name: '鉄筋コンクリート工事',
              specification: null,
              unit: 'm3',
              quantity: { toString: () => '10' },
              estimateUnitPrice: { toString: () => '50000' },
              estimateAmount: { toString: () => '500000' },
              executionUnitPrice: { toString: () => '48000' },
              executionAmount: { toString: () => '480000' },
              amendmentAmount: { toString: () => '100000' },
              previousMonthExpense: { toString: () => '200000' },
              currentMonthExpense: { toString: () => '30000' },
              plannedVendorId: null,
              plannedVendor: null,
              remarks: 'テスト備考',
              amendmentStatus: null,
              children: [],
              orderItems: [],
            },
          ],
          orderItems: [],
        },
      ],
    };

    it('プロジェクトIDから実行予算と階層構造を保持した項目一覧を取得する', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetWithItems
      );

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe(createdBudgetId);
      expect(result!.items).toBeDefined();
      // ルート項目を検証
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0]!.name).toBe('建築工事');
      // 子項目を検証
      expect(result!.items[0]!.children).toHaveLength(2);
      expect(result!.items[0]!.children[0]!.name).toBe('直接仮設工事');
      expect(result!.items[0]!.children[1]!.name).toBe('鉄筋コンクリート工事');
    });

    it('親項目の各金額列に子項目の合計値を計算する', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetWithItems
      );

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      const parentItem = result!.items[0]!;
      // 親項目の見積金額 = 子項目の合計（500000 + 500000 = 1000000）
      expect(parentItem.calculatedEstimateAmount).toBe('1000000');
      // 親項目の実行金額 = 子項目の合計（450000 + 480000 = 930000）
      expect(parentItem.calculatedExecutionAmount).toBe('930000');
      // 親項目の変更金額 = 子項目の合計（0 + 100000 = 100000）
      expect(parentItem.calculatedAmendmentAmount).toBe('100000');
      // 親項目の発注金額 = 子項目の合計（440000 + 0 = 440000）
      expect(parentItem.calculatedOrderAmount).toBe('440000');
      // 親項目の累計支出 = 子項目の合計（150000 + 230000 = 380000）
      expect(parentItem.calculatedTotalExpense).toBe('380000');
    });

    it('合計行データ（全金額列の合計）と利益見込額を算出する', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetWithItems
      );

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      // 合計行（リーフ項目の合計）
      expect(result!.totals).toBeDefined();
      expect(result!.totals.estimateAmount).toBe('1000000');
      expect(result!.totals.executionAmount).toBe('930000');
      expect(result!.totals.amendmentAmount).toBe('100000');
      expect(result!.totals.orderAmount).toBe('440000');
      expect(result!.totals.totalExpense).toBe('380000');
      // 利益見込額 = 契約金額 - 実行金額合計 = 10000000 - 930000 = 9070000
      expect(result!.totals.expectedProfit).toBe('9070000');
    });

    it('発注進捗率（発注済み項目数 / 全リーフ項目数）を計算する', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetWithItems
      );

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      // リーフ項目: eb-item-2(発注済み), eb-item-3(未発注) → 1/2 = 0.5
      expect(result!.orderProgressRate).toBe(0.5);
    });

    it('実行予算が存在しない場合はnullを返す', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除済みの実行予算は取得しない', async () => {
      // Arrange
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Act
      const result = await service.getWithItems(projectId);

      // Assert
      expect(result).toBeNull();
      expect(mockPrisma.executionBudget.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId, deletedAt: null }),
        })
      );
    });
  });

  describe('updateItem', () => {
    const itemId = 'eb-item-2';
    const mockExistingItem = {
      id: itemId,
      executionBudgetId: createdBudgetId,
      quantity: { toString: () => '10' },
      executionUnitPrice: { toString: () => '48000' },
      executionAmount: { toString: () => '480000' },
      remarks: null,
      executionBudget: {
        id: createdBudgetId,
        version: 0,
        deletedAt: null,
      },
    };

    it('実行単価の更新時に実行金額（数量 x 実行単価）を自動計算する', async () => {
      // Arrange
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockExistingItem
      );
      (mockPrisma.executionBudgetItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockExistingItem,
        executionUnitPrice: { toString: () => '50000' },
        executionAmount: { toString: () => '500000' },
      });
      (mockPrisma.executionBudget.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: createdBudgetId,
        version: 1,
      });

      // Act
      const result = await service.updateItem(itemId, { executionUnitPrice: '50000', version: 0 });

      // Assert: 実行金額 = 数量(10) x 実行単価(50000) = 500000
      expect(mockPrisma.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: itemId },
          data: expect.objectContaining({
            executionUnitPrice: '50000',
            executionAmount: '500000',
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('楽観的排他制御でバージョン不一致の場合はExecutionBudgetConflictErrorを投げる', async () => {
      // Arrange
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockExistingItem,
        executionBudget: {
          id: createdBudgetId,
          version: 5, // DBのバージョンが5
          deletedAt: null,
        },
      });

      // Act & Assert: リクエストのversionは0（不一致）
      await expect(
        service.updateItem(itemId, { executionUnitPrice: '50000', version: 0 })
      ).rejects.toThrow(ExecutionBudgetConflictError);
    });

    it('備考フィールドの更新を実装する', async () => {
      // Arrange
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockExistingItem
      );
      (mockPrisma.executionBudgetItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockExistingItem,
        remarks: '新しい備考',
      });
      (mockPrisma.executionBudget.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: createdBudgetId,
        version: 1,
      });

      // Act
      const result = await service.updateItem(itemId, { remarks: '新しい備考', version: 0 });

      // Assert
      expect(mockPrisma.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: itemId },
          data: expect.objectContaining({
            remarks: '新しい備考',
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('項目が存在しない場合はExecutionBudgetNotFoundErrorを投げる', async () => {
      // Arrange
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      // Act & Assert
      await expect(
        service.updateItem(itemId, { executionUnitPrice: '50000', version: 0 })
      ).rejects.toThrow(ExecutionBudgetNotFoundError);
    });

    it('数量がnullの場合は実行金額をnullに設定する', async () => {
      // Arrange
      const itemWithoutQuantity = {
        ...mockExistingItem,
        quantity: null,
      };
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        itemWithoutQuantity
      );
      (mockPrisma.executionBudgetItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...itemWithoutQuantity,
        executionUnitPrice: { toString: () => '50000' },
        executionAmount: null,
      });
      (mockPrisma.executionBudget.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: createdBudgetId,
        version: 1,
      });

      // Act
      await service.updateItem(itemId, { executionUnitPrice: '50000', version: 0 });

      // Assert
      expect(mockPrisma.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionAmount: null,
          }),
        })
      );
    });

    it('更新後にExecutionBudgetのバージョンをインクリメントする', async () => {
      // Arrange
      (mockPrisma.executionBudgetItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockExistingItem
      );
      (mockPrisma.executionBudgetItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockExistingItem,
        executionUnitPrice: { toString: () => '50000' },
        executionAmount: { toString: () => '500000' },
      });
      (mockPrisma.executionBudget.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: createdBudgetId,
        version: 1,
      });

      // Act
      await service.updateItem(itemId, { executionUnitPrice: '50000', version: 0 });

      // Assert
      expect(mockPrisma.executionBudget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: createdBudgetId },
          data: { version: { increment: 1 } },
        })
      );
    });
  });

  describe('delete', () => {
    it('発注済みの発注が存在しない場合は論理削除する', async () => {
      // Arrange
      const mockBudget = {
        id: createdBudgetId,
        projectId,
        deletedAt: null,
      };
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      // 発注済みの発注なし
      mockTx.order.findFirst.mockResolvedValue(null);
      mockTx.executionBudget.update.mockResolvedValue({
        ...mockBudget,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(projectId);

      // Assert: deletedAtフィールドが設定される（論理削除）
      expect(mockTx.executionBudget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: createdBudgetId },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
    });

    it('発注済みの発注が存在する場合はExecutionBudgetDeletionBlockedErrorを投げる', async () => {
      // Arrange
      const mockBudget = {
        id: createdBudgetId,
        projectId,
        deletedAt: null,
      };
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      // 発注済みの発注が存在
      mockTx.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'ORDERED',
        deletedAt: null,
      });

      // Act & Assert
      await expect(service.delete(projectId)).rejects.toThrow(ExecutionBudgetDeletionBlockedError);
    });

    it('実行予算が存在しない場合はExecutionBudgetNotFoundErrorを投げる', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(projectId)).rejects.toThrow(ExecutionBudgetNotFoundError);
    });

    it('トランザクション内で削除処理を実行する', async () => {
      // Arrange
      const mockBudget = {
        id: createdBudgetId,
        projectId,
        deletedAt: null,
      };
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.order.findFirst.mockResolvedValue(null);
      mockTx.executionBudget.update.mockResolvedValue({
        ...mockBudget,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(projectId);

      // Assert: $transactionが呼び出されていることを確認
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ========================================
  // Task 7.1: 契約変更反映サービス実装
  // Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
  // ========================================

  describe('getUnreflectedAmendments - 未反映変更契約一覧の取得', () => {
    it('同一プロジェクト内の未反映変更契約一覧を返却する（Req 15.1）', async () => {
      // Arrange: 実行予算が存在する
      const mockBudget = {
        id: createdBudgetId,
        projectId,
        contractId,
        deletedAt: null,
      };
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);

      // 変更契約が2件あり、1件は既に反映済み
      const amendmentContract1Id = '550e8400-e29b-41d4-a716-446655440020';
      const amendmentContract2Id = '550e8400-e29b-41d4-a716-446655440021';
      mockTx.contract.findMany = vi.fn().mockResolvedValue([
        {
          id: amendmentContract1Id,
          projectId,
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          estimateId: 'est-1',
          contractAmount: { toString: () => '6000000' },
          deletedAt: null,
          estimate: { name: '変更見積書1' },
        },
        {
          id: amendmentContract2Id,
          projectId,
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          estimateId: 'est-2',
          contractAmount: { toString: () => '7000000' },
          deletedAt: null,
          estimate: { name: '変更見積書2' },
        },
      ]);

      // 1件は既に反映済み
      mockTx.amendmentApplyHistory.findFirst
        .mockResolvedValueOnce({ id: 'history-1' }) // contract1は反映済み
        .mockResolvedValueOnce(null); // contract2は未反映

      // Act
      const result = await service.getUnreflectedAmendments(projectId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(amendmentContract2Id);
    });

    it('実行予算が存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUnreflectedAmendments(projectId)).rejects.toThrow(
        ExecutionBudgetNotFoundError
      );
    });
  });

  describe('getAmendmentDiff - 変更契約の項目差分取得', () => {
    it('変更契約に紐づく見積書の項目差分を算出して返却する（Req 15.2）', async () => {
      // Arrange
      const amendmentContractId = '550e8400-e29b-41d4-a716-446655440020';
      const mockBudget = {
        id: createdBudgetId,
        projectId,
        contractId,
        deletedAt: null,
      };
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);

      // 変更契約を取得
      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
      });

      // 変更契約に紐づく見積書の項目
      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [
          {
            id: 'new-item-1',
            estimateId: 'est-amendment',
            parentId: null,
            displayOrder: 0,
            lines: [
              {
                lineType: 'EXECUTION',
                name: '追加工事',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '1' },
                unitPrice: { toString: () => '200000' },
                amount: { toString: () => '200000' },
              },
            ],
          },
          {
            id: 'item-2', // estimateItemIdが既存項目と一致
            estimateId: 'est-amendment',
            parentId: null,
            displayOrder: 1,
            lines: [
              {
                lineType: 'EXECUTION',
                name: '直接仮設工事',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '2' }, // 数量変更
                unitPrice: { toString: () => '450000' },
                amount: { toString: () => '900000' },
              },
            ],
          },
        ],
      });

      // 既存の実行予算項目
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-2',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-2',
          name: '直接仮設工事',
          quantity: { toString: () => '1' },
          executionAmount: { toString: () => '450000' },
        },
      ]);

      // Act
      const result = await service.getAmendmentDiff(projectId, amendmentContractId);

      // Assert
      expect(result.addedItems.length).toBeGreaterThanOrEqual(1);
      expect(result.modifiedItems.length).toBeGreaterThanOrEqual(1);
      expect(result.contractAmount).toBeDefined();
    });
  });

  describe('applyAmendment - 変更契約の反映', () => {
    const amendmentContractId = '550e8400-e29b-41d4-a716-446655440020';
    const mockBudget = {
      id: createdBudgetId,
      projectId,
      contractId,
      deletedAt: null,
    };

    it('新規項目を実行予算に追加する（Req 15.3）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      // 変更契約
      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      // 変更契約の見積項目: 新規項目のみ
      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [
          {
            id: 'new-est-item-1',
            estimateId: 'est-amendment',
            parentId: null,
            displayOrder: 10,
            lines: [
              {
                lineType: 'EXECUTION',
                name: '追加工事A',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '1' },
                unitPrice: { toString: () => '300000' },
                amount: { toString: () => '300000' },
              },
              {
                lineType: 'ESTIMATE',
                name: '追加工事A',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '1' },
                unitPrice: { toString: () => '350000' },
                amount: { toString: () => '350000' },
              },
            ],
          },
        ],
      });

      // 既存の実行予算項目（マッチなし）
      mockTx.executionBudgetItem.findMany.mockResolvedValue([]);
      mockTx.executionBudgetItem.createMany = vi.fn().mockResolvedValue({ count: 1 });
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      const result = await service.applyAmendment(projectId, amendmentContractId);

      // Assert: 新規項目がcreateManyで追加されている
      expect(mockTx.executionBudgetItem.createMany).toHaveBeenCalled();
      // 変更反映履歴が記録されている（Req 15.8）
      expect(mockTx.amendmentApplyHistory.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('既存項目の数量・金額を更新する（Req 15.3）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      // 変更契約の見積項目: 既存項目の数量変更
      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [
          {
            id: 'item-2', // 既存estimateItemIdに一致
            estimateId: 'est-amendment',
            parentId: null,
            displayOrder: 1,
            lines: [
              {
                lineType: 'EXECUTION',
                name: '直接仮設工事',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '3' },
                unitPrice: { toString: () => '450000' },
                amount: { toString: () => '1350000' },
              },
              {
                lineType: 'ESTIMATE',
                name: '直接仮設工事',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '3' },
                unitPrice: { toString: () => '500000' },
                amount: { toString: () => '1500000' },
              },
            ],
          },
        ],
      });

      // 既存の実行予算項目
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-2',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-2',
          name: '直接仮設工事',
          quantity: { toString: () => '1' },
          executionUnitPrice: { toString: () => '450000' },
          executionAmount: { toString: () => '450000' },
          amendmentAmount: { toString: () => '0' },
        },
      ]);

      mockTx.executionBudgetItem.update.mockResolvedValue({
        id: 'budget-item-2',
        quantity: { toString: () => '3' },
        executionAmount: { toString: () => '1350000' },
        amendmentAmount: { toString: () => '900000' },
      });
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      const result = await service.applyAmendment(projectId, amendmentContractId);

      // Assert: 既存項目が更新されている
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-item-2' },
          data: expect.objectContaining({
            quantity: '3',
            executionAmount: '1350000',
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('変更削除対象項目が発注済みの場合AMENDMENT_DELETEDステータスを付与する（Req 15.4）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '4000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      // 変更契約の見積項目は空（既存項目が変更で削除対象）
      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [],
      });

      // 既存の実行予算項目（2つ、1つは発注済み）
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-ordered',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-2',
          name: '直接仮設工事',
          executionAmount: { toString: () => '450000' },
          amendmentAmount: { toString: () => '0' },
          amendmentStatus: null,
          deletedAt: null,
          orderItems: [
            {
              checked: true,
              order: { status: 'ORDERED', deletedAt: null },
            },
          ],
          progressRecordItems: [],
        },
      ]);

      mockTx.executionBudgetItem.update.mockResolvedValue({});
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      await service.applyAmendment(projectId, amendmentContractId);

      // Assert: AMENDMENT_DELETEDステータスが付与される
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-item-ordered' },
          data: expect.objectContaining({
            amendmentStatus: 'AMENDMENT_DELETED',
          }),
        })
      );
    });

    it('変更削除対象項目が出来高入力済みの場合AMENDMENT_DELETEDステータスを付与する（Req 15.4）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '4000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [],
      });

      // 出来高入力済み
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-progress',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-3',
          name: 'コンクリート工事',
          executionAmount: { toString: () => '600000' },
          amendmentAmount: { toString: () => '0' },
          amendmentStatus: null,
          deletedAt: null,
          orderItems: [],
          progressRecordItems: [{ id: 'pri-1', amount: { toString: () => '100000' } }],
        },
      ]);

      mockTx.executionBudgetItem.update.mockResolvedValue({});
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      await service.applyAmendment(projectId, amendmentContractId);

      // Assert
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-item-progress' },
          data: expect.objectContaining({
            amendmentStatus: 'AMENDMENT_DELETED',
          }),
        })
      );
    });

    it('変更削除対象項目が未発注かつ出来高未入力の場合論理削除する（Req 15.5）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '4000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [],
      });

      // 未発注かつ出来高なし
      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-unused',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-4',
          name: '未使用工事',
          executionAmount: { toString: () => '200000' },
          amendmentAmount: { toString: () => '0' },
          amendmentStatus: null,
          deletedAt: null,
          orderItems: [],
          progressRecordItems: [],
        },
      ]);

      mockTx.executionBudgetItem.update.mockResolvedValue({});
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      await service.applyAmendment(projectId, amendmentContractId);

      // Assert: deletedAtが設定される（論理削除）
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-item-unused' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
    });

    it('変更反映履歴を記録する（Req 15.8）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
        estimate: { name: '第1回変更契約' },
      });

      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [],
      });

      mockTx.executionBudgetItem.findMany.mockResolvedValue([]);
      mockTx.amendmentApplyHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: createdBudgetId,
        contractId: amendmentContractId,
        contractName: '第1回変更契約',
        appliedAt: new Date(),
      });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      await service.applyAmendment(projectId, amendmentContractId);

      // Assert: AmendmentApplyHistory作成が呼ばれる
      expect(mockTx.amendmentApplyHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionBudgetId: createdBudgetId,
            contractId: amendmentContractId,
            contractName: '第1回変更契約',
          }),
        })
      );
    });

    it('変更金額列に金額差分を設定する（Req 15.7）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      // 既存項目の金額が変更
      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [
          {
            id: 'item-2',
            estimateId: 'est-amendment',
            parentId: null,
            displayOrder: 1,
            lines: [
              {
                lineType: 'EXECUTION',
                name: '直接仮設工事',
                specification: '一式',
                unit: '式',
                quantity: { toString: () => '2' },
                unitPrice: { toString: () => '450000' },
                amount: { toString: () => '900000' },
              },
            ],
          },
        ],
      });

      mockTx.executionBudgetItem.findMany.mockResolvedValue([
        {
          id: 'budget-item-2',
          executionBudgetId: createdBudgetId,
          estimateItemId: 'item-2',
          name: '直接仮設工事',
          quantity: { toString: () => '1' },
          executionUnitPrice: { toString: () => '450000' },
          executionAmount: { toString: () => '450000' },
          amendmentAmount: { toString: () => '0' },
          amendmentStatus: null,
          deletedAt: null,
          orderItems: [],
          progressRecordItems: [],
        },
      ]);

      mockTx.executionBudgetItem.update.mockResolvedValue({});
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      await service.applyAmendment(projectId, amendmentContractId);

      // Assert: amendmentAmount = 新実行金額 - 旧実行金額 = 900000 - 450000 = 450000
      expect(mockTx.executionBudgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-item-2' },
          data: expect.objectContaining({
            amendmentAmount: '450000',
          }),
        })
      );
    });

    it('既に反映済みの変更契約を指定した場合はエラーをスローする', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue({ id: 'existing-history' });

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      // Act & Assert
      await expect(service.applyAmendment(projectId, amendmentContractId)).rejects.toThrow(
        AmendmentAlreadyAppliedError
      );
    });

    it('変更契約が存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.contract.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.applyAmendment(projectId, amendmentContractId)).rejects.toThrow(
        AmendmentContractNotFoundError
      );
    });

    it('実行予算が存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.applyAmendment(projectId, amendmentContractId)).rejects.toThrow(
        ExecutionBudgetNotFoundError
      );
    });

    it('変更前後の契約金額データを返却する（Req 15.6）', async () => {
      // Arrange
      mockTx.executionBudget.findFirst.mockResolvedValue({
        ...mockBudget,
        contract: { contractAmount: { toString: () => '5000000' } },
      });
      mockTx.amendmentApplyHistory.findFirst.mockResolvedValue(null);

      mockTx.contract.findUnique = vi.fn().mockResolvedValue({
        id: amendmentContractId,
        projectId,
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'est-amendment',
        contractAmount: { toString: () => '6000000' },
        deletedAt: null,
        estimate: { name: '変更見積書1' },
      });

      mockTx.estimate.findUnique.mockResolvedValue({
        id: 'est-amendment',
        items: [],
      });

      mockTx.executionBudgetItem.findMany.mockResolvedValue([]);
      mockTx.amendmentApplyHistory.create.mockResolvedValue({ id: 'history-1' });
      mockTx.executionBudget.update.mockResolvedValue({ ...mockBudget, version: 1 });

      // Act
      const result = await service.applyAmendment(projectId, amendmentContractId);

      // Assert: 変更前後の契約金額が含まれる
      expect(result.previousContractAmount).toBeDefined();
      expect(result.newContractAmount).toBe('6000000');
    });
  });
});
