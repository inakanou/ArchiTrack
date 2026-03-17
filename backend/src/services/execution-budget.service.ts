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
 *
 * @module services/execution-budget
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
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
}
