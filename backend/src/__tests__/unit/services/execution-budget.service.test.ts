/**
 * @fileoverview ExecutionBudgetService 実行予算作成 ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1: プロジェクトに紐づく実行予算の存在有無を表示する
 * - 1.2: 契約書選択ダイアログを表示する
 * - 1.3: 選択した契約書に紐づく見積書のすべての見積項目を取得し、実行予算項目として初期化する
 * - 1.4: 各項目の発注予定取引先に見積書の業者金額行に設定されている取引先を自動的に適用する
 * - 1.5: プロジェクトに対して実行予算を1つだけ作成可能とする
 * - 1.6: 既に実行予算が存在するプロジェクトで新規作成を試行した場合エラー
 * - 1.7: 実行予算に紐づく契約書名、契約金額、作成日時を表示する
 *
 * Task 2.1: 実行予算の作成サービス実装
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
      create: vi.fn(),
    },
    executionBudgetItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
    },
    estimate: {
      findUnique: vi.fn(),
    },
    tradingPartner: {
      findFirst: vi.fn(),
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
});
