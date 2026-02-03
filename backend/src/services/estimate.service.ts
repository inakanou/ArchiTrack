/**
 * @fileoverview 見積書サービス
 *
 * 見積書のCRUD操作を担当します。
 * 内訳書を参照して見積書を作成し、プロジェクトに紐付けて保存します。
 *
 * Requirements (estimate-creation):
 * - REQ-3.1: 新規作成を選択した場合、プロジェクトに紐付く内訳書の選択画面を表示する
 * - REQ-3.2: 選択した内訳書の項目を見積金額行の初期値として設定する
 * - REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - REQ-3.4: 見積書をプロジェクトに紐付けて保存する
 * - REQ-3.5: 内訳書が選択された場合、内訳書の名称・規格・単位・数量を見積金額行に転記する
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 *
 * Task 2.1: EstimateServiceの実装
 *
 * @module services/estimate
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import {
  EstimateNotFoundError,
  EstimateConflictError,
  DuplicateEstimateNameError,
  ItemizedStatementNotFoundForEstimateError,
} from '../errors/estimateError.js';
import { ProjectNotFoundError } from '../errors/projectError.js';

/**
 * 見積書サービス依存関係
 */
export interface EstimateServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 見積書作成入力
 */
export interface CreateEstimateInput {
  projectId: string;
  name: string;
  sourceItemizedStatementId?: string;
}

/**
 * 見積書更新入力
 */
export interface UpdateEstimateInput {
  name?: string;
}

/**
 * 見積書情報（一覧用）
 */
export interface EstimateInfo {
  id: string;
  projectId: string;
  name: string;
  sourceItemizedStatementId: string | null;
  sourceItemizedStatementName: string | null;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * プロジェクト情報（簡易）
 */
export interface ProjectInfoSummary {
  id: string;
  name: string;
}

/**
 * 見積項目行情報
 */
export interface EstimateItemLineInfo {
  id: string;
  estimateItemId: string;
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId: string | null;
  sourceVendorName: string | null;
}

/**
 * 見積項目情報
 */
export interface EstimateItemInfo {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  lines: EstimateItemLineInfo[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 見積書詳細情報
 */
export interface EstimateDetailInfo extends EstimateInfo {
  project: ProjectInfoSummary;
  items: EstimateItemInfo[];
}

/**
 * ページネーション付き見積書一覧
 */
export interface PaginatedEstimates {
  data: EstimateInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積書サービス
 *
 * 見積書のCRUD操作を担当します。
 */
export class EstimateService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: EstimateServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 見積書を作成する
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクトの存在確認
   * 2. 内訳書の存在確認（指定された場合）
   * 3. 同名の見積書が存在しないことを確認
   * 4. 見積書の作成
   * 5. 内訳書から見積項目を初期作成（指定された場合）
   * 6. 監査ログの記録
   *
   * Requirements: REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4, REQ-3.5
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された見積書情報
   * @throws ProjectNotFoundError プロジェクトが存在しない場合
   * @throws ItemizedStatementNotFoundForEstimateError 内訳書が存在しない場合
   * @throws DuplicateEstimateNameError 同名の見積書が既に存在する場合
   */
  async create(input: CreateEstimateInput, actorId: string): Promise<EstimateInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. プロジェクトの存在確認
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, deletedAt: true },
      });

      if (!project || project.deletedAt !== null) {
        throw new ProjectNotFoundError(input.projectId);
      }

      // 2. 内訳書の存在確認（指定された場合）
      let itemizedStatement: {
        id: string;
        name: string;
        items: Array<{
          id: string;
          customCategory: string | null;
          workType: string | null;
          name: string | null;
          specification: string | null;
          unit: string | null;
          quantity: { toString(): string } | number;
          displayOrder: number;
        }>;
      } | null = null;

      if (input.sourceItemizedStatementId) {
        itemizedStatement = await tx.itemizedStatement.findUnique({
          where: { id: input.sourceItemizedStatementId },
          select: {
            id: true,
            name: true,
            deletedAt: true,
            items: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        });

        if (
          !itemizedStatement ||
          (itemizedStatement as { deletedAt?: Date | null }).deletedAt !== null
        ) {
          throw new ItemizedStatementNotFoundForEstimateError(input.sourceItemizedStatementId);
        }
      }

      // 3. 同名の見積書が存在しないことを確認
      const existingCount = await tx.estimate.count({
        where: {
          projectId: input.projectId,
          name: input.name,
          deletedAt: null,
        },
      });

      if (existingCount > 0) {
        throw new DuplicateEstimateNameError(input.name, input.projectId);
      }

      // 4. 見積書の作成
      const estimate = await tx.estimate.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
          sourceItemizedStatementId: itemizedStatement?.id ?? null,
          sourceItemizedStatementName: itemizedStatement?.name ?? null,
        },
      });

      // 5. 内訳書から見積項目を初期作成（指定された場合）
      if (itemizedStatement && itemizedStatement.items.length > 0) {
        // 見積項目を作成
        const itemsData = itemizedStatement.items.map((_item, index) => ({
          estimateId: estimate.id,
          parentId: null as string | null,
          displayOrder: index,
        }));

        await tx.estimateItem.createMany({
          data: itemsData,
        });

        // 作成された見積項目を取得
        const createdItems = await tx.estimateItem.findMany({
          where: { estimateId: estimate.id },
          orderBy: { displayOrder: 'asc' },
        });

        // 各見積項目に3行（見積/実行/業者）を作成
        const linesData: Array<{
          estimateItemId: string;
          lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
          name: string | null;
          specification: string | null;
          unit: string | null;
          quantity: number | null;
          unitPrice: number | null;
          amount: number | null;
          remarks: string | null;
        }> = [];

        createdItems.forEach((createdItem, index) => {
          const sourceItem = itemizedStatement.items[index]!;
          const quantity =
            typeof sourceItem.quantity === 'number'
              ? sourceItem.quantity
              : parseFloat(sourceItem.quantity.toString());

          // 見積金額行（内訳書から転記）
          linesData.push({
            estimateItemId: createdItem.id,
            lineType: 'ESTIMATE',
            name: sourceItem.name,
            specification: sourceItem.specification,
            unit: sourceItem.unit,
            quantity: quantity,
            unitPrice: null,
            amount: null,
            remarks: null,
          });

          // 実行金額行（空）
          linesData.push({
            estimateItemId: createdItem.id,
            lineType: 'EXECUTION',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          });

          // 業者金額行（空）
          linesData.push({
            estimateItemId: createdItem.id,
            lineType: 'VENDOR',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          });
        });

        await tx.estimateItemLine.createMany({
          data: linesData,
        });
      }

      // 6. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_CREATED',
        actorId,
        targetType: 'Estimate',
        targetId: estimate.id,
        before: null,
        after: {
          projectId: estimate.projectId,
          name: estimate.name,
          sourceItemizedStatementId: estimate.sourceItemizedStatementId,
          sourceItemizedStatementName: estimate.sourceItemizedStatementName,
        },
      });

      return this.toEstimateInfo(estimate, itemizedStatement?.items.length ?? 0);
    });
  }

  /**
   * 見積書詳細を取得する
   *
   * Requirements: REQ-11.2
   *
   * @param id - 見積書ID
   * @returns 見積書詳細情報（存在しない場合はnull）
   */
  async findById(id: string): Promise<EstimateDetailInfo | null> {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
          include: {
            lines: {
              orderBy: { lineType: 'asc' },
            },
          },
        },
      },
    });

    if (!estimate || estimate.deletedAt !== null) {
      return null;
    }

    return this.toEstimateDetailInfo(estimate);
  }

  /**
   * プロジェクトに紐付く見積書一覧を取得する（ページネーション対応）
   *
   * Requirements: REQ-11.1
   *
   * @param projectId - プロジェクトID
   * @param filter - 検索フィルター
   * @param pagination - ページネーション設定
   * @param sort - ソート設定
   * @returns ページネーション付き見積書一覧
   */
  async findByProjectId(
    projectId: string,
    filter: { search?: string },
    pagination: { page: number; limit: number },
    sort: { sort: 'createdAt' | 'name'; order: 'asc' | 'desc' }
  ): Promise<PaginatedEstimates> {
    const where = {
      projectId,
      deletedAt: null,
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          {
            sourceItemizedStatementName: { contains: filter.search, mode: 'insensitive' as const },
          },
        ],
      }),
    };

    const [estimates, total] = await Promise.all([
      this.prisma.estimate.findMany({
        where,
        orderBy: { [sort.sort]: sort.order },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.estimate.count({ where }),
    ]);

    return {
      data: estimates.map((estimate) => this.toEstimateInfo(estimate)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * 見積書を更新する
   *
   * 楽観的排他制御を実装。
   *
   * Requirements: REQ-11.3, REQ-11.5, REQ-11.6
   *
   * @param id - 見積書ID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された見積書情報
   * @throws EstimateNotFoundError 見積書が存在しない場合
   * @throws EstimateConflictError 楽観的排他制御エラー
   * @throws DuplicateEstimateNameError 同名の見積書が既に存在する場合
   */
  async update(
    id: string,
    input: UpdateEstimateInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<EstimateInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積書の存在確認
      const estimate = await tx.estimate.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          sourceItemizedStatementId: true,
          sourceItemizedStatementName: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!estimate || estimate.deletedAt !== null) {
        throw new EstimateNotFoundError(id);
      }

      // 2. 楽観的排他制御: updatedAtの比較
      if (estimate.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new EstimateConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: estimate.updatedAt.toISOString(),
        });
      }

      // 3. 名前変更の場合、同名の見積書が存在しないことを確認
      if (input.name && input.name !== estimate.name) {
        const existingCount = await tx.estimate.count({
          where: {
            projectId: estimate.projectId,
            name: input.name,
            deletedAt: null,
            id: { not: id },
          },
        });

        if (existingCount > 0) {
          throw new DuplicateEstimateNameError(input.name, estimate.projectId);
        }
      }

      // 4. 更新
      const oldName = estimate.name;
      const updatedEstimate = await tx.estimate.update({
        where: { id },
        data: {
          ...(input.name && { name: input.name.trim() }),
        },
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      // 5. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_UPDATED',
        actorId,
        targetType: 'Estimate',
        targetId: id,
        before: { name: oldName },
        after: { name: updatedEstimate.name },
      });

      return this.toEstimateInfo(updatedEstimate);
    });
  }

  /**
   * 見積書を論理削除する（楽観的排他制御付き）
   *
   * Requirements: REQ-11.4, REQ-11.6
   *
   * @param id - 見積書ID
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @throws EstimateNotFoundError 見積書が存在しないか既に削除済みの場合
   * @throws EstimateConflictError 楽観的排他制御エラー
   */
  async delete(id: string, actorId: string, expectedUpdatedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積書の存在確認
      const estimate = await tx.estimate.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          sourceItemizedStatementId: true,
          sourceItemizedStatementName: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!estimate || estimate.deletedAt !== null) {
        throw new EstimateNotFoundError(id);
      }

      // 2. 楽観的排他制御
      if (estimate.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new EstimateConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: estimate.updatedAt.toISOString(),
        });
      }

      // 3. 論理削除
      await tx.estimate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_DELETED',
        actorId,
        targetType: 'Estimate',
        targetId: id,
        before: {
          projectId: estimate.projectId,
          name: estimate.name,
          sourceItemizedStatementId: estimate.sourceItemizedStatementId,
          sourceItemizedStatementName: estimate.sourceItemizedStatementName,
        },
        after: null,
      });
    });
  }

  /**
   * データベースの結果をEstimateInfoに変換
   */
  private toEstimateInfo(
    estimate: {
      id: string;
      projectId: string;
      name: string;
      sourceItemizedStatementId: string | null;
      sourceItemizedStatementName: string | null;
      createdAt: Date;
      updatedAt: Date;
      _count?: { items: number };
    },
    itemCount?: number
  ): EstimateInfo {
    return {
      id: estimate.id,
      projectId: estimate.projectId,
      name: estimate.name,
      sourceItemizedStatementId: estimate.sourceItemizedStatementId,
      sourceItemizedStatementName: estimate.sourceItemizedStatementName,
      itemCount: itemCount ?? estimate._count?.items ?? 0,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
    };
  }

  /**
   * データベースの結果をEstimateDetailInfoに変換
   */
  private toEstimateDetailInfo(estimate: {
    id: string;
    projectId: string;
    name: string;
    sourceItemizedStatementId: string | null;
    sourceItemizedStatementName: string | null;
    createdAt: Date;
    updatedAt: Date;
    project: {
      id: string;
      name: string;
    };
    items: Array<{
      id: string;
      estimateId: string;
      parentId: string | null;
      displayOrder: number;
      createdAt: Date;
      updatedAt: Date;
      lines: Array<{
        id: string;
        estimateItemId: string;
        lineType: string;
        name: string | null;
        specification: string | null;
        unit: string | null;
        quantity: unknown;
        unitPrice: unknown;
        amount: unknown;
        remarks: string | null;
        sourceReceivedQuotationLineItemId: string | null;
        sourceVendorName: string | null;
      }>;
    }>;
  }): EstimateDetailInfo {
    return {
      id: estimate.id,
      projectId: estimate.projectId,
      project: {
        id: estimate.project.id,
        name: estimate.project.name,
      },
      name: estimate.name,
      sourceItemizedStatementId: estimate.sourceItemizedStatementId,
      sourceItemizedStatementName: estimate.sourceItemizedStatementName,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      itemCount: estimate.items.length,
      items: estimate.items.map((item) => ({
        id: item.id,
        estimateId: item.estimateId,
        parentId: item.parentId,
        displayOrder: item.displayOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lines: item.lines.map((line) => ({
          id: line.id,
          estimateItemId: line.estimateItemId,
          lineType: line.lineType as 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
          name: line.name,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity !== null ? Number(line.quantity) : null,
          unitPrice: line.unitPrice !== null ? Number(line.unitPrice) : null,
          amount: line.amount !== null ? Number(line.amount) : null,
          remarks: line.remarks,
          sourceReceivedQuotationLineItemId: line.sourceReceivedQuotationLineItemId,
          sourceVendorName: line.sourceVendorName,
        })),
      })),
    };
  }
}
