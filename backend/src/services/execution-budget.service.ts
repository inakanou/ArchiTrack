/**
 * @fileoverview 実行予算サービス
 *
 * 実行予算のライフサイクル管理（作成・表示・編集・削除・契約変更反映）を担当します。
 *
 * Requirements (execution-budget-management):
 * - 1.1-1.7: 実行予算の作成
 * - 2.1-2.3: 実行予算の削除
 * - 3.1-3.10: 実行予算項目一覧表示
 * - 4.1-4.5: 実行予算項目の編集
 * - 15.1-15.8: 契約変更への対応
 *
 * Task 2.1: 実行予算の作成サービス実装
 * Task 2.2: 実行予算の取得・削除・編集サービス実装
 *
 * @module services/execution-budget
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  ExecutionBudgetDeletionBlockedError,
  AmendmentContractNotFoundError,
  AmendmentAlreadyAppliedError,
} from '../errors/executionBudgetError.js';

/**
 * ExecutionBudgetService依存関係
 */
export interface ExecutionBudgetServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 実行予算作成結果
 */
export interface ExecutionBudgetCreateResult {
  id: string;
  projectId: string;
  contractId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 実行予算項目の更新入力
 */
export interface UpdateExecutionBudgetItemInput {
  executionUnitPrice?: string;
  remarks?: string | null;
  version: number;
}

/**
 * 計算済み実行予算項目（レスポンス用）
 */
export interface ExecutionBudgetItemWithCalculations {
  id: string;
  parentId: string | null;
  displayOrder: number;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  estimateUnitPrice: string | null;
  estimateAmount: string | null;
  executionUnitPrice: string | null;
  executionAmount: string | null;
  amendmentAmount: string;
  previousMonthExpense: string;
  currentMonthExpense: string;
  plannedVendorId: string | null;
  plannedVendor: { id: string; name: string } | null;
  remarks: string | null;
  amendmentStatus: string | null;
  orderAmount: string | null;
  orderStatus: string | null;
  children: ExecutionBudgetItemWithCalculations[];
  // 親項目の場合、子項目の合計値を計算
  calculatedEstimateAmount: string | null;
  calculatedExecutionAmount: string | null;
  calculatedAmendmentAmount: string | null;
  calculatedOrderAmount: string | null;
  calculatedTotalExpense: string | null;
  calculatedProgressAmount: string | null;
}

/**
 * 実行予算合計行データ
 */
export interface ExecutionBudgetTotals {
  estimateAmount: string;
  executionAmount: string;
  amendmentAmount: string;
  orderAmount: string;
  totalExpense: string;
  remainingBudget: string;
  progressAmount: string;
  expectedProfit: string;
}

/**
 * 実行予算（項目一覧含む）レスポンス
 */
export interface ExecutionBudgetWithItemsResult {
  id: string;
  projectId: string;
  contractId: string;
  version: number;
  contractAmount: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: ExecutionBudgetItemWithCalculations[];
  totals: ExecutionBudgetTotals;
  orderProgressRate: number;
}

/**
 * 未反映変更契約情報
 */
export interface UnreflectedAmendment {
  id: string;
  contractType: string;
  status: string;
  estimateId: string | null;
  contractAmount: string | null;
  estimateName: string | null;
}

/**
 * 変更契約の項目差分
 */
export interface AmendmentDiff {
  addedItems: Array<{
    estimateItemId: string;
    name: string | null;
    specification: string | null;
    unit: string | null;
    quantity: string | null;
    executionUnitPrice: string | null;
    executionAmount: string | null;
  }>;
  modifiedItems: Array<{
    budgetItemId: string;
    estimateItemId: string;
    name: string | null;
    oldQuantity: string | null;
    newQuantity: string | null;
    oldExecutionAmount: string | null;
    newExecutionAmount: string | null;
  }>;
  contractAmount: string | null;
}

/**
 * 変更契約反映結果
 */
export interface ApplyAmendmentResult {
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  previousContractAmount: string | null;
  newContractAmount: string | null;
}

/**
 * detail-summary APIレスポンス用の実行予算サマリー型。
 * フロントエンド既存型 ExecutionBudgetSectionInfo と互換性を持つ。
 *
 * Task 67.1
 * Requirements: 41.2, 41.3
 */
export interface ExecutionBudgetSectionItem {
  id: string;
  contractName: string;
  contractAmount: number;
  createdAt: string;
  executionAmountTotal: string;
  profitForecast: string;
  orderProgressRate: string;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積項目行の型（Prismaから取得されるデータ）
 */
interface EstimateItemLineData {
  lineType: string;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: { toString(): string } | null;
  unitPrice: { toString(): string } | null;
  amount: { toString(): string } | null;
  sourceVendorName?: string | null;
}

/**
 * 見積項目の型（Prismaから取得されるデータ）
 */
interface EstimateItemData {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  lines: EstimateItemLineData[];
}

/**
 * 実行予算サービス
 *
 * 実行予算のCRUD操作を担当します。
 */
export class ExecutionBudgetService {
  private readonly prisma: PrismaClient;

  constructor(deps: ExecutionBudgetServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 実行予算を作成する
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクトに対する既存実行予算の存在チェック（ユニーク制約）
   * 2. 契約書の存在確認・見積書IDの取得
   * 3. 見積書のEstimateItem + EstimateItemLineを取得
   * 4. EXECUTION行のデータから実行予算項目を初期化
   * 5. VENDOR行のsourceVendorNameから取引先マスタを検索し、plannedVendorIdを設定
   * 6. ExecutionBudget + ExecutionBudgetItemsを一括作成
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
   *
   * @param projectId - プロジェクトID
   * @param contractId - 契約書ID
   * @returns 作成された実行予算
   * @throws ExecutionBudgetAlreadyExistsError 既に実行予算が存在する場合
   * @throws ContractNotFoundForBudgetError 契約書が存在しない場合
   */
  async create(projectId: string, contractId: string): Promise<ExecutionBudgetCreateResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 既存実行予算の存在チェック
      const existing = await tx.executionBudget.findFirst({
        where: { projectId, deletedAt: null },
      });

      if (existing) {
        throw new ExecutionBudgetAlreadyExistsError(projectId);
      }

      // 2. 契約書の存在確認・見積書IDの取得
      const contract = await tx.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          projectId: true,
          estimateId: true,
          deletedAt: true,
        },
      });

      if (!contract || contract.deletedAt !== null || !contract.estimateId) {
        throw new ContractNotFoundForBudgetError(contractId);
      }

      // 3. 見積書のEstimateItem + EstimateItemLineを取得
      const estimate = await tx.estimate.findUnique({
        where: { id: contract.estimateId },
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
      const executionBudget = await tx.executionBudget.create({
        data: {
          projectId,
          contractId,
        },
      });

      // 5. 見積項目がある場合のみ、実行予算項目を作成
      if (estimate && estimate.items.length > 0) {
        const items = estimate.items as unknown as EstimateItemData[];
        await this.createBudgetItems(tx, executionBudget.id, items);
      }

      return {
        id: executionBudget.id,
        projectId: executionBudget.projectId,
        contractId: executionBudget.contractId,
        version: executionBudget.version,
        createdAt: executionBudget.createdAt,
        updatedAt: executionBudget.updatedAt,
      };
    });
  }

  /**
   * 見積項目から実行予算項目を2段階で作成する
   *
   * Phase 1: parentId=nullで全項目をcreateManyで一括作成
   * Phase 2: estimateItemId→executionBudgetItemIdのマッピングを構築し、parentIdを更新
   *
   * 各見積項目について:
   * - ESTIMATE行から: 見積単価・見積金額・数量を取得
   * - EXECUTION行から: 実行単価・実行金額・名称・規格・単位を取得
   * - VENDOR行から: sourceVendorNameで取引先マスタを検索し、plannedVendorIdを設定
   *
   * @param tx - Prismaトランザクションクライアント
   * @param executionBudgetId - 実行予算ID
   * @param estimateItems - 見積項目一覧
   */
  private async createBudgetItems(
    tx: PrismaTransactionClient,
    executionBudgetId: string,
    estimateItems: EstimateItemData[]
  ): Promise<void> {
    // Phase 1: parentId=nullで全項目を一括作成
    const budgetItemsData = [];

    for (const item of estimateItems) {
      const estimateLine = item.lines.find((l) => l.lineType === 'ESTIMATE');
      const executionLine = item.lines.find((l) => l.lineType === 'EXECUTION');
      const vendorLine = item.lines.find((l) => l.lineType === 'VENDOR');

      // VENDOR行のsourceVendorNameから取引先マスタを検索
      let plannedVendorId: string | null = null;
      if (vendorLine?.sourceVendorName) {
        const tradingPartner = await tx.tradingPartner.findFirst({
          where: { name: vendorLine.sourceVendorName, deletedAt: null },
          select: { id: true },
        });
        plannedVendorId = tradingPartner?.id ?? null;
      }

      // EXECUTION行が存在しない場合でもESTIMATE行からデータを取得
      const primaryLine = executionLine || estimateLine;

      budgetItemsData.push({
        executionBudgetId,
        estimateItemId: item.id,
        parentId: null as string | null, // Phase 1ではnull、Phase 2で更新
        displayOrder: item.displayOrder,
        // 名称・規格・単位はEXECUTION行（またはESTIMATE行）から
        name: primaryLine?.name ?? null,
        specification: primaryLine?.specification ?? null,
        unit: primaryLine?.unit ?? null,
        // 数量はESTIMATE行から（共通データ）
        quantity: estimateLine?.quantity ? estimateLine.quantity.toString() : null,
        // 見積単価・見積金額はESTIMATE行から
        estimateUnitPrice: estimateLine?.unitPrice ? estimateLine.unitPrice.toString() : null,
        estimateAmount: estimateLine?.amount ? estimateLine.amount.toString() : null,
        // 実行単価・実行金額はEXECUTION行から
        executionUnitPrice: executionLine?.unitPrice ? executionLine.unitPrice.toString() : null,
        executionAmount: executionLine?.amount ? executionLine.amount.toString() : null,
        // 発注予定取引先
        plannedVendorId,
      });
    }

    await tx.executionBudgetItem.createMany({
      data: budgetItemsData,
    });

    // Phase 2: 親子関係が存在する場合のみ、parentIdを更新
    const hasChildren = estimateItems.some((item) => item.parentId !== null);
    if (!hasChildren) {
      return;
    }

    // 作成された実行予算項目を取得し、estimateItemId → executionBudgetItemIdのマッピングを構築
    const createdItems = await tx.executionBudgetItem.findMany({
      where: { executionBudgetId },
      select: { id: true, estimateItemId: true },
    });

    const estimateTobudgetMap = new Map<string, string>();
    for (const created of createdItems) {
      if (created.estimateItemId) {
        estimateTobudgetMap.set(created.estimateItemId, created.id);
      }
    }

    // 親子関係を持つ項目のparentIdを更新
    for (const item of estimateItems) {
      if (item.parentId) {
        const budgetParentId = estimateTobudgetMap.get(item.parentId);
        const budgetItemId = estimateTobudgetMap.get(item.id);
        if (budgetParentId && budgetItemId) {
          await tx.executionBudgetItem.update({
            where: { id: budgetItemId },
            data: { parentId: budgetParentId },
          });
        }
      }
    }
  }

  /**
   * プロジェクトIDから実行予算を取得する（軽量版）
   *
   * 項目一覧を含まず、実行予算の基本情報のみを返却する。
   * 発注ルーター等で実行予算IDを取得する際に使用する。
   *
   * @param projectId - プロジェクトID
   * @returns 実行予算の基本情報、存在しない場合はnull
   */
  async findByProjectId(
    projectId: string
  ): Promise<{ id: string; projectId: string; contractId: string } | null> {
    const budget = await this.prisma.executionBudget.findFirst({
      where: { projectId, deletedAt: null },
      select: { id: true, projectId: true, contractId: true },
    });
    return budget;
  }

  /**
   * プロジェクトに紐づく実行予算のサマリーを取得する（detail-summary API用の軽量メソッド）。
   * 実行予算はプロジェクトに対して1つのみ存在する（1:1関係）。
   *
   * 既存の findByProjectId（基本情報のみ返却）とは別に、
   * サマリー表示に必要な集計データを含むメソッドとして新規追加する。
   *
   * Task 67.1: ExecutionBudgetServiceにgetSummaryByProjectIdメソッドを追加
   * Requirements: 41.2, 41.3
   *
   * @param projectId - プロジェクトID
   * @returns 実行予算サマリーまたはnull（未作成時）
   */
  async getSummaryByProjectId(projectId: string): Promise<ExecutionBudgetSectionItem | null> {
    const budget = await this.prisma.executionBudget.findFirst({
      where: { projectId, deletedAt: null },
      include: {
        contract: {
          select: {
            id: true,
            contractAmount: true,
            estimate: {
              select: { name: true },
            },
          },
        },
        items: {
          where: { parentId: null, deletedAt: null },
          select: {
            id: true,
            executionAmount: true,
            orderItems: {
              include: {
                order: {
                  select: { status: true, deletedAt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!budget) {
      return null;
    }

    // 契約書名
    const contractName =
      (budget.contract as unknown as { estimate?: { name: string } | null })?.estimate?.name ??
      '見積書なし';

    // 契約金額
    const contractAmountRaw = (
      budget.contract as unknown as { contractAmount?: { toString(): string } | null }
    )?.contractAmount;
    const contractAmount = contractAmountRaw ? Number(contractAmountRaw.toString()) : 0;

    // 実行金額合計（ルート項目の実行金額を合計）
    type RawItem = {
      id: string;
      executionAmount: { toString(): string } | null;
      orderItems: Array<{
        checked: boolean;
        orderAmount: { toString(): string } | null;
        order: { status: string; deletedAt: Date | null } | null;
      }>;
    };
    const items = budget.items as unknown as RawItem[];
    let executionTotal = new Decimal(0);
    const totalItems = items.length;
    let orderedItems = 0;

    for (const item of items) {
      if (item.executionAmount) {
        executionTotal = executionTotal.add(new Decimal(item.executionAmount.toString()));
      }
      // 発注済みかチェック
      const hasOrdered = item.orderItems?.some(
        (oi) => oi.checked && oi.order && oi.order.status === 'ORDERED' && !oi.order.deletedAt
      );
      if (hasOrdered) {
        orderedItems++;
      }
    }

    const executionAmountTotal = executionTotal.toFixed(0);
    const profitForecast = new Decimal(contractAmount).sub(executionTotal).toFixed(0);
    const orderProgressRate =
      totalItems > 0 ? Math.round((orderedItems / totalItems) * 100).toString() : '0';

    return {
      id: budget.id,
      contractName,
      contractAmount,
      createdAt: budget.createdAt.toISOString(),
      executionAmountTotal,
      profitForecast,
      orderProgressRate,
    };
  }

  /**
   * 実行予算を項目一覧とともに取得する
   *
   * 階層構造を保持したデータを返却し、以下を計算する:
   * - 親項目の各金額列の合計値
   * - 合計行データ（全金額列の合計）
   * - 利益見込額（契約金額 - 実行金額合計）
   * - 発注進捗率（発注済み項目数 / 全リーフ項目数）
   *
   * Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
   *
   * @param projectId - プロジェクトID
   * @returns 実行予算（項目一覧・合計・進捗率含む）、存在しない場合はnull
   */
  async getWithItems(projectId: string): Promise<ExecutionBudgetWithItemsResult | null> {
    const budget = await this.prisma.executionBudget.findFirst({
      where: { projectId, deletedAt: null },
      include: {
        contract: {
          select: {
            id: true,
            contractAmount: true,
          },
        },
        items: {
          orderBy: [{ displayOrder: 'asc' }],
          include: {
            plannedVendor: {
              select: { id: true, name: true },
            },
            children: {
              orderBy: [{ displayOrder: 'asc' }],
              include: {
                plannedVendor: {
                  select: { id: true, name: true },
                },
                children: {
                  orderBy: [{ displayOrder: 'asc' }],
                  include: {
                    plannedVendor: {
                      select: { id: true, name: true },
                    },
                    orderItems: {
                      include: {
                        order: {
                          select: { status: true, deletedAt: true },
                        },
                      },
                    },
                  },
                },
                orderItems: {
                  include: {
                    order: {
                      select: { status: true, deletedAt: true },
                    },
                  },
                },
              },
            },
            orderItems: {
              include: {
                order: {
                  select: { status: true, deletedAt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!budget) {
      return null;
    }

    // ルート項目のみをフィルタ（parentId === null）
    const rootItems = (budget.items as unknown[]).filter(
      (item: unknown) => (item as { parentId: string | null }).parentId === null
    );

    // 階層構造を構築し、金額を計算
    const processedItems = rootItems.map((item: unknown) =>
      this.processItemWithChildren(item as RawBudgetItem)
    );

    // リーフ項目を収集して合計を計算
    const leafItems: ExecutionBudgetItemWithCalculations[] = [];
    this.collectLeafItems(processedItems, leafItems);

    // 合計行の計算
    const totals = this.calculateTotals(
      leafItems,
      budget.contract?.contractAmount?.toString() ?? null
    );

    // 発注進捗率
    const orderProgressRate = this.calculateOrderProgressRate(leafItems);

    return {
      id: budget.id,
      projectId: budget.projectId,
      contractId: budget.contractId,
      version: budget.version,
      contractAmount: budget.contract?.contractAmount?.toString() ?? null,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
      items: processedItems,
      totals,
      orderProgressRate,
    };
  }

  /**
   * 実行予算項目を更新する
   *
   * 実行単価の更新時に実行金額（数量 x 実行単価）を自動計算し、
   * 楽観的排他制御を適用する。
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   *
   * @param itemId - 実行予算項目ID
   * @param data - 更新データ（実行単価、備考、バージョン）
   * @returns 更新された項目
   * @throws ExecutionBudgetNotFoundError 項目が存在しない場合
   * @throws ExecutionBudgetConflictError バージョン不一致の場合
   */
  async updateItem(
    itemId: string,
    data: UpdateExecutionBudgetItemInput
  ): Promise<{ id: string; version: number }> {
    // 1. 項目の存在チェックと実行予算の取得
    const existing = await this.prisma.executionBudgetItem.findUnique({
      where: { id: itemId },
      include: {
        executionBudget: {
          select: { id: true, version: true, deletedAt: true },
        },
      },
    });

    if (!existing || existing.executionBudget.deletedAt !== null) {
      throw new ExecutionBudgetNotFoundError();
    }

    // 2. 楽観的排他制御: バージョンチェック
    if (existing.executionBudget.version !== data.version) {
      throw new ExecutionBudgetConflictError(undefined, {
        expectedVersion: data.version,
        actualVersion: existing.executionBudget.version,
      });
    }

    // 3. 更新データの構築
    const updateData: Record<string, unknown> = {};

    if (data.executionUnitPrice !== undefined) {
      updateData.executionUnitPrice = data.executionUnitPrice;

      // 実行金額の自動計算: 数量 x 実行単価
      const quantity = existing.quantity?.toString();
      if (quantity) {
        const executionAmount = new Decimal(quantity)
          .mul(new Decimal(data.executionUnitPrice))
          .toFixed(0);
        updateData.executionAmount = executionAmount;
      } else {
        updateData.executionAmount = null;
      }
    }

    if (data.remarks !== undefined) {
      updateData.remarks = data.remarks;
    }

    // 4. 項目の更新
    const updated = await this.prisma.executionBudgetItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // 5. ExecutionBudgetのバージョンをインクリメント
    const updatedBudget = await this.prisma.executionBudget.update({
      where: { id: existing.executionBudget.id },
      data: { version: { increment: 1 } },
    });

    return {
      id: updated.id,
      version: updatedBudget.version,
    };
  }

  /**
   * 実行予算を論理削除する
   *
   * 発注済みの発注が存在する場合は削除を阻止する。
   *
   * Requirements: 2.1, 2.2, 2.3
   *
   * @param projectId - プロジェクトID
   * @throws ExecutionBudgetNotFoundError 実行予算が存在しない場合
   * @throws ExecutionBudgetDeletionBlockedError 発注済みの発注が存在する場合
   */
  async delete(projectId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { projectId, deletedAt: null },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundError();
      }

      // 2. 発注済みの発注が存在するかチェック
      const orderedOrder = await tx.order.findFirst({
        where: {
          executionBudgetId: budget.id,
          status: 'ORDERED',
          deletedAt: null,
        },
      });

      if (orderedOrder) {
        throw new ExecutionBudgetDeletionBlockedError();
      }

      // 3. 論理削除（deletedAtフィールドを設定）
      await tx.executionBudget.update({
        where: { id: budget.id },
        data: { deletedAt: new Date() },
      });
    });
  }

  /**
   * 同一プロジェクト内の未反映変更契約一覧を取得する
   *
   * Requirements: 15.1
   *
   * @param projectId - プロジェクトID
   * @returns 未反映の変更契約一覧
   * @throws ExecutionBudgetNotFoundError 実行予算が存在しない場合
   */
  async getUnreflectedAmendments(projectId: string): Promise<UnreflectedAmendment[]> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { projectId, deletedAt: null },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundError();
      }

      // 2. 同一プロジェクト内の変更契約（AMENDMENT型、契約済）を取得
      const amendmentContracts = await (
        tx as unknown as {
          contract: { findMany: (args: unknown) => Promise<AmendmentContractData[]> };
        }
      ).contract.findMany({
        where: {
          projectId,
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          deletedAt: null,
        },
        include: {
          estimate: {
            select: { name: true },
          },
        },
      });

      // 3. 既に反映済みの変更契約を除外
      const unreflected: UnreflectedAmendment[] = [];
      for (const contract of amendmentContracts) {
        const alreadyApplied = await tx.amendmentApplyHistory.findFirst({
          where: {
            executionBudgetId: budget.id,
            contractId: contract.id,
          },
        });

        if (!alreadyApplied) {
          unreflected.push({
            id: contract.id,
            contractType: contract.contractType,
            status: contract.status,
            estimateId: contract.estimateId ?? null,
            contractAmount: contract.contractAmount?.toString() ?? null,
            estimateName: contract.estimate?.name ?? null,
          });
        }
      }

      return unreflected;
    });
  }

  /**
   * 変更契約に紐づく見積書の項目差分を算出し表示データを返却する
   *
   * Requirements: 15.2
   *
   * @param projectId - プロジェクトID
   * @param contractId - 変更契約ID
   * @returns 項目差分データ
   */
  async getAmendmentDiff(projectId: string, contractId: string): Promise<AmendmentDiff> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { projectId, deletedAt: null },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundError();
      }

      // 2. 変更契約の取得
      const contract = await (
        tx as unknown as {
          contract: { findUnique: (args: unknown) => Promise<AmendmentContractDetailData | null> };
        }
      ).contract.findUnique({
        where: { id: contractId },
      });

      if (!contract || contract.deletedAt !== null || contract.contractType !== 'AMENDMENT') {
        throw new AmendmentContractNotFoundError(contractId);
      }

      // 3. 変更契約に紐づく見積書の項目を取得
      const estimate = await tx.estimate.findUnique({
        where: { id: contract.estimateId! },
        include: {
          items: {
            orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
            include: { lines: true },
          },
        },
      });

      // 4. 既存の実行予算項目を取得
      const existingItems = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId: budget.id },
      });

      // estimateItemIdでマッピング
      const existingByEstimateItemId = new Map<string, ExistingBudgetItemData>();
      for (const item of existingItems as unknown as ExistingBudgetItemData[]) {
        if (item.estimateItemId) {
          existingByEstimateItemId.set(item.estimateItemId, item);
        }
      }

      // 5. 差分を算出
      const addedItems: AmendmentDiff['addedItems'] = [];
      const modifiedItems: AmendmentDiff['modifiedItems'] = [];

      if (estimate?.items) {
        for (const amendItem of estimate.items as unknown as EstimateItemData[]) {
          const executionLine = amendItem.lines.find((l) => l.lineType === 'EXECUTION');
          const existing = existingByEstimateItemId.get(amendItem.id);

          if (!existing) {
            // 新規項目
            addedItems.push({
              estimateItemId: amendItem.id,
              name: executionLine?.name ?? null,
              specification: executionLine?.specification ?? null,
              unit: executionLine?.unit ?? null,
              quantity: executionLine?.quantity?.toString() ?? null,
              executionUnitPrice: executionLine?.unitPrice?.toString() ?? null,
              executionAmount: executionLine?.amount?.toString() ?? null,
            });
          } else {
            // 既存項目の変更チェック
            const newAmount = executionLine?.amount?.toString() ?? null;
            const oldAmount = existing.executionAmount?.toString() ?? null;
            const newQty = executionLine?.quantity?.toString() ?? null;
            const oldQty = existing.quantity?.toString() ?? null;

            if (newAmount !== oldAmount || newQty !== oldQty) {
              modifiedItems.push({
                budgetItemId: existing.id,
                estimateItemId: amendItem.id,
                name: executionLine?.name ?? null,
                oldQuantity: oldQty,
                newQuantity: newQty,
                oldExecutionAmount: oldAmount,
                newExecutionAmount: newAmount,
              });
            }
          }
        }
      }

      return {
        addedItems,
        modifiedItems,
        contractAmount: contract.contractAmount?.toString() ?? null,
      };
    });
  }

  /**
   * 変更契約を実行予算に反映する
   *
   * トランザクション内で以下を実行:
   * 1. 実行予算の存在チェック
   * 2. 変更契約の存在・反映済みチェック
   * 3. 変更契約に紐づく見積書の項目を取得
   * 4. 新規項目の追加・既存項目の更新・削除対象の処理
   * 5. 変更反映履歴の記録
   *
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
   *
   * @param projectId - プロジェクトID
   * @param contractId - 変更契約ID
   * @returns 反映結果
   * @throws ExecutionBudgetNotFoundError 実行予算が存在しない場合
   * @throws AmendmentContractNotFoundError 変更契約が存在しない場合
   * @throws AmendmentAlreadyAppliedError 変更契約が既に反映済みの場合
   */
  async applyAmendment(projectId: string, contractId: string): Promise<ApplyAmendmentResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { projectId, deletedAt: null },
        include: {
          contract: {
            select: { contractAmount: true },
          },
        },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundError();
      }

      // 2. 変更契約の取得と検証
      const amendmentContract = await (
        tx as unknown as {
          contract: {
            findUnique: (args: unknown) => Promise<AmendmentContractWithEstimateData | null>;
          };
        }
      ).contract.findUnique({
        where: { id: contractId },
        include: {
          estimate: {
            select: { name: true },
          },
        },
      });

      if (
        !amendmentContract ||
        amendmentContract.deletedAt !== null ||
        amendmentContract.contractType !== 'AMENDMENT'
      ) {
        throw new AmendmentContractNotFoundError(contractId);
      }

      // 3. 反映済みチェック
      const alreadyApplied = await tx.amendmentApplyHistory.findFirst({
        where: {
          executionBudgetId: budget.id,
          contractId,
        },
      });

      if (alreadyApplied) {
        throw new AmendmentAlreadyAppliedError(contractId);
      }

      // 4. 変更契約の見積書の項目を取得
      const estimate = amendmentContract.estimateId
        ? await tx.estimate.findUnique({
            where: { id: amendmentContract.estimateId },
            include: {
              items: {
                orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
                include: { lines: true },
              },
            },
          })
        : null;

      // 5. 既存の実行予算項目を取得（発注・出来高情報含む）
      const existingItems = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId: budget.id },
        include: {
          orderItems: {
            include: {
              order: { select: { status: true, deletedAt: true } },
            },
          },
          progressRecordItems: true,
        },
      });

      const existingByEstimateItemId = new Map<string, RawExistingItemWithRelations>();
      for (const item of existingItems as unknown as RawExistingItemWithRelations[]) {
        if (item.estimateItemId) {
          existingByEstimateItemId.set(item.estimateItemId, item);
        }
      }

      // 6. 変更契約の見積項目IDのセット
      const amendmentEstimateItemIds = new Set<string>();
      const amendmentItems = (estimate?.items as unknown as EstimateItemData[]) ?? [];
      for (const item of amendmentItems) {
        amendmentEstimateItemIds.add(item.id);
      }

      let addedCount = 0;
      let modifiedCount = 0;
      let deletedCount = 0;

      // 7. 新規項目の追加と既存項目の更新
      const newItemsData = [];
      for (const amendItem of amendmentItems) {
        const executionLine = amendItem.lines.find((l) => l.lineType === 'EXECUTION');
        const estimateLine = amendItem.lines.find((l) => l.lineType === 'ESTIMATE');
        const existing = existingByEstimateItemId.get(amendItem.id);

        if (!existing) {
          // 新規項目の追加
          const primaryLine = executionLine || estimateLine;
          newItemsData.push({
            executionBudgetId: budget.id,
            estimateItemId: amendItem.id,
            parentId: null as string | null,
            displayOrder: amendItem.displayOrder,
            name: primaryLine?.name ?? null,
            specification: primaryLine?.specification ?? null,
            unit: primaryLine?.unit ?? null,
            quantity: estimateLine?.quantity ? estimateLine.quantity.toString() : null,
            estimateUnitPrice: estimateLine?.unitPrice ? estimateLine.unitPrice.toString() : null,
            estimateAmount: estimateLine?.amount ? estimateLine.amount.toString() : null,
            executionUnitPrice: executionLine?.unitPrice
              ? executionLine.unitPrice.toString()
              : null,
            executionAmount: executionLine?.amount ? executionLine.amount.toString() : null,
            amendmentAmount: executionLine?.amount ? executionLine.amount.toString() : '0',
          });
          addedCount++;
        } else {
          // 既存項目の数量・金額更新
          const newAmount = executionLine?.amount?.toString() ?? null;
          const newQty = executionLine?.quantity?.toString() ?? null;
          const newUnitPrice = executionLine?.unitPrice?.toString() ?? null;
          const oldAmount = existing.executionAmount?.toString() ?? '0';

          // 変更金額 = 新実行金額 - 旧実行金額
          const amendmentAmount = newAmount
            ? new Decimal(newAmount).sub(new Decimal(oldAmount)).toFixed(0)
            : '0';

          await tx.executionBudgetItem.update({
            where: { id: existing.id },
            data: {
              quantity: newQty,
              executionUnitPrice: newUnitPrice,
              executionAmount: newAmount,
              amendmentAmount,
            },
          });
          modifiedCount++;
        }
      }

      // 新規項目の一括作成
      if (newItemsData.length > 0) {
        await tx.executionBudgetItem.createMany({
          data: newItemsData,
        });
      }

      // 8. 変更契約の見積項目に含まれない既存項目の処理（削除対象）
      for (const [estimateItemId, existingItem] of existingByEstimateItemId) {
        if (!amendmentEstimateItemIds.has(estimateItemId) && !existingItem.deletedAt) {
          const hasOrderedItems = existingItem.orderItems?.some(
            (oi: { checked: boolean; order: { status: string; deletedAt: Date | null } | null }) =>
              oi.checked && oi.order?.status === 'ORDERED' && !oi.order.deletedAt
          );
          const hasProgressItems =
            existingItem.progressRecordItems && existingItem.progressRecordItems.length > 0;

          if (hasOrderedItems || hasProgressItems) {
            // 発注済みまたは出来高入力済み → AMENDMENT_DELETEDステータスを付与
            await tx.executionBudgetItem.update({
              where: { id: existingItem.id },
              data: { amendmentStatus: 'AMENDMENT_DELETED' },
            });
          } else {
            // 未発注かつ出来高未入力 → 論理削除
            await tx.executionBudgetItem.update({
              where: { id: existingItem.id },
              data: { deletedAt: new Date() },
            });
          }
          deletedCount++;
        }
      }

      // 9. 変更反映履歴の記録 (Req 15.8)
      const contractName = amendmentContract.estimate?.name ?? `変更契約 ${contractId}`;
      await tx.amendmentApplyHistory.create({
        data: {
          executionBudgetId: budget.id,
          contractId,
          contractName,
        },
      });

      // 10. バージョンインクリメント
      await tx.executionBudget.update({
        where: { id: budget.id },
        data: { version: { increment: 1 } },
      });

      // 変更前後の契約金額 (Req 15.6)
      const budgetWithContract = budget as unknown as {
        contract?: { contractAmount?: { toString(): string } };
      };
      const previousContractAmount =
        budgetWithContract.contract?.contractAmount?.toString() ?? null;
      const newContractAmount = amendmentContract.contractAmount?.toString() ?? null;

      return {
        addedCount,
        modifiedCount,
        deletedCount,
        previousContractAmount,
        newContractAmount,
      };
    });
  }

  /**
   * 項目とその子項目を再帰的に処理し、金額を計算する
   * @private
   */
  private processItemWithChildren(item: RawBudgetItem): ExecutionBudgetItemWithCalculations {
    const children = (item.children || []).map((child: RawBudgetItem) =>
      this.processItemWithChildren(child)
    );

    // 発注情報の取得（発注済みのORDERED発注のorderAmountを合計）
    const orderInfo = this.getOrderInfo(item);

    // 基本的な項目データ
    const processed: ExecutionBudgetItemWithCalculations = {
      id: item.id,
      parentId: item.parentId,
      displayOrder: item.displayOrder,
      name: item.name ?? null,
      specification: item.specification ?? null,
      unit: item.unit ?? null,
      quantity: item.quantity?.toString() ?? null,
      estimateUnitPrice: item.estimateUnitPrice?.toString() ?? null,
      estimateAmount: item.estimateAmount?.toString() ?? null,
      executionUnitPrice: item.executionUnitPrice?.toString() ?? null,
      executionAmount: item.executionAmount?.toString() ?? null,
      amendmentAmount: item.amendmentAmount?.toString() ?? '0',
      previousMonthExpense: item.previousMonthExpense?.toString() ?? '0',
      currentMonthExpense: item.currentMonthExpense?.toString() ?? '0',
      plannedVendorId: item.plannedVendorId ?? null,
      plannedVendor: item.plannedVendor ?? null,
      remarks: item.remarks ?? null,
      amendmentStatus: item.amendmentStatus ?? null,
      orderAmount: orderInfo.orderAmount,
      orderStatus: orderInfo.orderStatus,
      children,
      calculatedEstimateAmount: null,
      calculatedExecutionAmount: null,
      calculatedAmendmentAmount: null,
      calculatedOrderAmount: null,
      calculatedTotalExpense: null,
      calculatedProgressAmount: null,
    };

    // 子項目がある場合（親項目）の合計値を計算
    if (children.length > 0) {
      const leafItems: ExecutionBudgetItemWithCalculations[] = [];
      this.collectLeafItems(children, leafItems);

      processed.calculatedEstimateAmount = this.sumField(leafItems, 'estimateAmount');
      processed.calculatedExecutionAmount = this.sumField(leafItems, 'executionAmount');
      processed.calculatedAmendmentAmount = this.sumField(leafItems, 'amendmentAmount');
      processed.calculatedOrderAmount = this.sumOrderAmount(leafItems);
      processed.calculatedTotalExpense = this.sumTotalExpense(leafItems);
      processed.calculatedProgressAmount = null; // 出来高は別途計算
    }

    return processed;
  }

  /**
   * 発注情報を取得する
   * @private
   */
  private getOrderInfo(item: RawBudgetItem): {
    orderAmount: string | null;
    orderStatus: string | null;
  } {
    if (!item.orderItems || item.orderItems.length === 0) {
      return { orderAmount: null, orderStatus: null };
    }

    // 発注済みでチェック済みのorderItemからorderAmountを取得
    let totalOrderAmount = new Decimal(0);
    let hasOrderedItem = false;

    for (const oi of item.orderItems) {
      if (
        oi.checked &&
        oi.order &&
        oi.order.status === 'ORDERED' &&
        !oi.order.deletedAt &&
        oi.orderAmount
      ) {
        totalOrderAmount = totalOrderAmount.add(new Decimal(oi.orderAmount.toString()));
        hasOrderedItem = true;
      }
    }

    return {
      orderAmount: hasOrderedItem ? totalOrderAmount.toFixed(0) : null,
      orderStatus: hasOrderedItem ? 'ORDERED' : null,
    };
  }

  /**
   * リーフ項目を収集する（子項目を持たない項目）
   * @private
   */
  private collectLeafItems(
    items: ExecutionBudgetItemWithCalculations[],
    result: ExecutionBudgetItemWithCalculations[]
  ): void {
    for (const item of items) {
      if (item.children.length === 0) {
        result.push(item);
      } else {
        this.collectLeafItems(item.children, result);
      }
    }
  }

  /**
   * 指定フィールドの合計値を計算する
   * @private
   */
  private sumField(
    items: ExecutionBudgetItemWithCalculations[],
    field: keyof ExecutionBudgetItemWithCalculations
  ): string {
    let total = new Decimal(0);
    for (const item of items) {
      const value = item[field];
      if (value && typeof value === 'string') {
        total = total.add(new Decimal(value));
      }
    }
    return total.toFixed(0);
  }

  /**
   * 発注金額の合計を計算する
   * @private
   */
  private sumOrderAmount(items: ExecutionBudgetItemWithCalculations[]): string {
    let total = new Decimal(0);
    for (const item of items) {
      if (item.orderAmount) {
        total = total.add(new Decimal(item.orderAmount));
      }
    }
    return total.toFixed(0);
  }

  /**
   * 累計支出の合計を計算する（先月までの支出 + 今月の支出）
   * @private
   */
  private sumTotalExpense(items: ExecutionBudgetItemWithCalculations[]): string {
    let total = new Decimal(0);
    for (const item of items) {
      const prev = new Decimal(item.previousMonthExpense || '0');
      const curr = new Decimal(item.currentMonthExpense || '0');
      total = total.add(prev).add(curr);
    }
    return total.toFixed(0);
  }

  /**
   * 合計行データを計算する
   * @private
   */
  private calculateTotals(
    leafItems: ExecutionBudgetItemWithCalculations[],
    contractAmount: string | null
  ): ExecutionBudgetTotals {
    const estimateAmount = this.sumField(leafItems, 'estimateAmount');
    const executionAmount = this.sumField(leafItems, 'executionAmount');
    const amendmentAmount = this.sumField(leafItems, 'amendmentAmount');
    const orderAmount = this.sumOrderAmount(leafItems);
    const totalExpense = this.sumTotalExpense(leafItems);
    const remainingBudget = new Decimal(executionAmount).sub(new Decimal(totalExpense)).toFixed(0);
    const progressAmount = '0'; // 出来高は別途計算

    // 利益見込額 = 契約金額 - 実行金額合計
    const expectedProfit = contractAmount
      ? new Decimal(contractAmount).sub(new Decimal(executionAmount)).toFixed(0)
      : '0';

    return {
      estimateAmount,
      executionAmount,
      amendmentAmount,
      orderAmount,
      totalExpense,
      remainingBudget,
      progressAmount,
      expectedProfit,
    };
  }

  /**
   * 発注進捗率を計算する（発注済み項目数 / 全リーフ項目数）
   * @private
   */
  private calculateOrderProgressRate(leafItems: ExecutionBudgetItemWithCalculations[]): number {
    if (leafItems.length === 0) return 0;

    const orderedCount = leafItems.filter((item) => item.orderStatus === 'ORDERED').length;
    return orderedCount / leafItems.length;
  }
}

/**
 * Prismaから取得される生データの型
 * @private
 */
interface RawBudgetItem {
  id: string;
  parentId: string | null;
  displayOrder: number;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: { toString(): string } | null;
  estimateUnitPrice: { toString(): string } | null;
  estimateAmount: { toString(): string } | null;
  executionUnitPrice: { toString(): string } | null;
  executionAmount: { toString(): string } | null;
  amendmentAmount: { toString(): string } | null;
  previousMonthExpense: { toString(): string } | null;
  currentMonthExpense: { toString(): string } | null;
  plannedVendorId: string | null;
  plannedVendor: { id: string; name: string } | null;
  remarks: string | null;
  amendmentStatus: string | null;
  children: RawBudgetItem[];
  orderItems?: Array<{
    checked: boolean;
    orderAmount: { toString(): string } | null;
    order: { status: string; deletedAt: Date | null } | null;
  }>;
}

/**
 * 変更契約データ（findMany結果）
 * @private
 */
interface AmendmentContractData {
  id: string;
  projectId: string;
  contractType: string;
  status: string;
  estimateId: string | null;
  contractAmount: { toString(): string } | null;
  deletedAt: Date | null;
  estimate: { name: string } | null;
}

/**
 * 変更契約詳細データ（findUnique結果）
 * @private
 */
interface AmendmentContractDetailData {
  id: string;
  projectId: string;
  contractType: string;
  status: string;
  estimateId: string | null;
  contractAmount: { toString(): string } | null;
  deletedAt: Date | null;
}

/**
 * 変更契約（見積書名含む）データ
 * @private
 */
interface AmendmentContractWithEstimateData {
  id: string;
  projectId: string;
  contractType: string;
  status: string;
  estimateId: string | null;
  contractAmount: { toString(): string } | null;
  deletedAt: Date | null;
  estimate: { name: string } | null;
}

/**
 * 既存実行予算項目データ（差分算出用）
 * @private
 */
interface ExistingBudgetItemData {
  id: string;
  executionBudgetId: string;
  estimateItemId: string | null;
  name: string | null;
  quantity: { toString(): string } | null;
  executionUnitPrice: { toString(): string } | null;
  executionAmount: { toString(): string } | null;
  amendmentAmount: { toString(): string } | null;
}

/**
 * 既存実行予算項目データ（発注・出来高リレーション含む）
 * @private
 */
interface RawExistingItemWithRelations {
  id: string;
  executionBudgetId: string;
  estimateItemId: string | null;
  name: string | null;
  executionAmount: { toString(): string } | null;
  amendmentAmount: { toString(): string } | null;
  amendmentStatus: string | null;
  deletedAt: Date | null;
  orderItems: Array<{
    checked: boolean;
    order: { status: string; deletedAt: Date | null } | null;
  }>;
  progressRecordItems: Array<{ id: string }>;
}
