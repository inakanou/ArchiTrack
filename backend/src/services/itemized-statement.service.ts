/**
 * @fileoverview 内訳書サービス
 *
 * 内訳書のCRUD操作を担当します。
 * 数量表をピボット集計して内訳書を作成し、スナップショットとして保存します。
 *
 * Requirements:
 * - 1.1: 内訳書作成機能（数量表を選択し、作成操作を実行）
 * - 1.2: 内訳書名入力
 * - 1.5: 作成日時の自動設定
 * - 1.6: 内訳書をプロジェクトに紐付けて保存
 * - 1.8: 集計元数量表の情報（ID・名称）を参照情報として内訳書に保存
 * - 1.9: 数量表の項目数が0件の場合、エラー
 * - 1.10: 同一プロジェクト内に同名の内訳書が存在する場合、エラー
 * - 3.1: 内訳書一覧取得
 * - 4.1: 内訳書詳細取得
 * - 5.1: 内訳書論理削除
 * - 8.1: スナップショット独立性
 * - 10.1: 楽観的排他制御
 *
 * Task 2.2: 内訳書CRUDサービスの実装
 *
 * @module services/itemized-statement
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { ITEMIZED_STATEMENT_TARGET_TYPE } from '../types/audit-log.types.js';
import type { ItemizedStatementPivotService } from './itemized-statement-pivot.service.js';
import {
  ItemizedStatementNotFoundError,
  EmptyQuantityItemsError,
  DuplicateItemizedStatementNameError,
  ItemizedStatementConflictError,
} from '../errors/itemizedStatementError.js';
import { QuantityTableNotFoundError } from '../errors/quantityTableError.js';

/**
 * 内訳書サービス依存関係
 */
export interface ItemizedStatementServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
  pivotService: ItemizedStatementPivotService;
}

/**
 * 内訳書作成入力
 */
export interface CreateItemizedStatementInput {
  name: string;
  projectId: string;
  sourceQuantityTableId: string;
}

/**
 * 内訳書情報（一覧用）
 */
export interface ItemizedStatementInfo {
  id: string;
  projectId: string;
  name: string;
  sourceQuantityTableId: string;
  sourceQuantityTableName: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 内訳書項目情報
 */
export interface ItemizedStatementItemInfo {
  id: string;
  itemizedStatementId: string;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
  displayOrder: number;
}

/**
 * プロジェクト情報（簡易）
 */
export interface ProjectInfoSummary {
  id: string;
  name: string;
}

/**
 * 内訳書詳細情報
 */
export interface ItemizedStatementDetailInfo extends ItemizedStatementInfo {
  project: ProjectInfoSummary;
  itemCount: number;
  items: ItemizedStatementItemInfo[];
}

/**
 * ページネーション付き内訳書一覧
 */
export interface PaginatedItemizedStatements {
  data: ItemizedStatementInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * プロジェクト内訳書サマリー
 */
export interface ProjectItemizedStatementSummary {
  totalCount: number;
  latestStatements: ItemizedStatementInfo[];
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 内訳書サービス
 *
 * 内訳書のCRUD操作を担当します。
 */
export class ItemizedStatementService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;
  private readonly pivotService: ItemizedStatementPivotService;

  constructor(deps: ItemizedStatementServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
    this.pivotService = deps.pivotService;
  }

  /**
   * 内訳書を作成する
   *
   * トランザクション内で以下を実行:
   * 1. 数量表の存在確認
   * 2. 数量表のピボット集計
   * 3. 集計項目が0件でないことを確認
   * 4. 同名の内訳書が存在しないことを確認
   * 5. 内訳書の作成
   * 6. 集計項目の保存
   * 7. 監査ログの記録
   *
   * Requirements: 1.1, 1.5, 1.6, 1.8, 1.9, 1.10, 8.1
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された内訳書情報
   * @throws QuantityTableNotFoundError 数量表が存在しない場合
   * @throws EmptyQuantityItemsError 数量表に項目がない場合
   * @throws DuplicateItemizedStatementNameError 同名の内訳書が既に存在する場合
   */
  async create(
    input: CreateItemizedStatementInput,
    actorId: string
  ): Promise<ItemizedStatementInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 数量表の存在確認
      const quantityTable = await tx.quantityTable.findUnique({
        where: { id: input.sourceQuantityTableId },
        select: { id: true, name: true, projectId: true, deletedAt: true },
      });

      if (!quantityTable || quantityTable.deletedAt !== null) {
        throw new QuantityTableNotFoundError(input.sourceQuantityTableId);
      }

      // 2. 数量表のピボット集計
      const aggregationResult = await this.pivotService.aggregateByQuantityTable(
        input.sourceQuantityTableId
      );

      // 3. 集計項目が0件でないことを確認 (Requirements: 1.9)
      if (aggregationResult.items.length === 0) {
        throw new EmptyQuantityItemsError(input.sourceQuantityTableId);
      }

      // 4. 同名の内訳書が存在しないことを確認 (Requirements: 1.10)
      const existingCount = await tx.itemizedStatement.count({
        where: {
          projectId: input.projectId,
          name: input.name,
          deletedAt: null,
        },
      });

      if (existingCount > 0) {
        throw new DuplicateItemizedStatementNameError(input.name, input.projectId);
      }

      // 5. 内訳書の作成 (Requirements: 1.5, 1.6, 1.8, 8.1)
      const itemizedStatement = await tx.itemizedStatement.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
          sourceQuantityTableId: quantityTable.id,
          sourceQuantityTableName: quantityTable.name, // スナップショット
        },
      });

      // 6. 集計項目の保存
      const itemsData = aggregationResult.items.map((item, index) => ({
        itemizedStatementId: itemizedStatement.id,
        customCategory: item.customCategory,
        workType: item.workType,
        name: item.name,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        displayOrder: index,
      }));

      await tx.itemizedStatementItem.createMany({
        data: itemsData,
      });

      // 7. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ITEMIZED_STATEMENT_CREATED',
        actorId,
        targetType: ITEMIZED_STATEMENT_TARGET_TYPE,
        targetId: itemizedStatement.id,
        before: null,
        after: {
          projectId: itemizedStatement.projectId,
          name: itemizedStatement.name,
          sourceQuantityTableId: itemizedStatement.sourceQuantityTableId,
          sourceQuantityTableName: itemizedStatement.sourceQuantityTableName,
          itemCount: aggregationResult.items.length,
          sourceItemCount: aggregationResult.sourceItemCount,
        },
      });

      return this.toItemizedStatementInfo(itemizedStatement, aggregationResult.items.length);
    });
  }

  /**
   * 内訳書詳細を取得する
   *
   * Requirements: 4.1
   *
   * @param id - 内訳書ID
   * @returns 内訳書詳細情報（存在しない場合はnull）
   */
  async findById(id: string): Promise<ItemizedStatementDetailInfo | null> {
    const itemizedStatement = await this.prisma.itemizedStatement.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
      return null;
    }

    return this.toItemizedStatementDetailInfo(itemizedStatement);
  }

  /**
   * プロジェクトに紐付く内訳書一覧を取得する（ページネーション対応）
   *
   * Requirements: 3.1, 3.2
   *
   * @param projectId - プロジェクトID
   * @param filter - 検索フィルター
   * @param pagination - ページネーション設定
   * @param sort - ソート設定
   * @returns ページネーション付き内訳書一覧
   */
  async findByProjectId(
    projectId: string,
    filter: { search?: string },
    pagination: { page: number; limit: number },
    sort: { sort: 'createdAt' | 'name'; order: 'asc' | 'desc' }
  ): Promise<PaginatedItemizedStatements> {
    const where = {
      projectId,
      deletedAt: null,
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { sourceQuantityTableName: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [statements, total] = await Promise.all([
      this.prisma.itemizedStatement.findMany({
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
      this.prisma.itemizedStatement.count({ where }),
    ]);

    return {
      data: statements.map((statement) => this.toItemizedStatementInfo(statement)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * プロジェクトに紐付く直近の内訳書とサマリー情報を取得する
   *
   * Requirements: 3.4
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト2）
   * @returns プロジェクト内訳書サマリー
   */
  async findLatestByProjectId(
    projectId: string,
    limit: number = 2
  ): Promise<ProjectItemizedStatementSummary> {
    const [latestStatements, totalCount] = await Promise.all([
      this.prisma.itemizedStatement.findMany({
        where: {
          projectId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.itemizedStatement.count({
        where: {
          projectId,
          deletedAt: null,
        },
      }),
    ]);

    return {
      totalCount,
      latestStatements: latestStatements.map((statement) =>
        this.toItemizedStatementInfo(statement)
      ),
    };
  }

  /**
   * 内訳書を論理削除する（楽観的排他制御付き）
   *
   * Requirements: 5.1, 10.2, 10.3
   *
   * @param id - 内訳書ID
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @throws ItemizedStatementNotFoundError 内訳書が存在しないか既に削除済みの場合
   * @throws ItemizedStatementConflictError 楽観的排他制御エラー
   */
  async delete(id: string, actorId: string, expectedUpdatedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 内訳書の存在確認
      const itemizedStatement = await tx.itemizedStatement.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          sourceQuantityTableId: true,
          sourceQuantityTableName: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
        throw new ItemizedStatementNotFoundError(id);
      }

      // 2. 楽観的排他制御: updatedAtの比較 (Requirements: 10.2, 10.3)
      if (itemizedStatement.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ItemizedStatementConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: itemizedStatement.updatedAt.toISOString(),
        });
      }

      // 3. 論理削除
      await tx.itemizedStatement.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ITEMIZED_STATEMENT_DELETED',
        actorId,
        targetType: ITEMIZED_STATEMENT_TARGET_TYPE,
        targetId: id,
        before: {
          projectId: itemizedStatement.projectId,
          name: itemizedStatement.name,
          sourceQuantityTableId: itemizedStatement.sourceQuantityTableId,
          sourceQuantityTableName: itemizedStatement.sourceQuantityTableName,
        },
        after: null,
      });
    });
  }

  /**
   * 内訳書名を更新する
   *
   * 楽観的排他制御を実装。
   *
   * Requirements: 10.1, 10.3
   *
   * @param id - 内訳書ID
   * @param newName - 新しい名前
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された内訳書情報
   * @throws ItemizedStatementNotFoundError 内訳書が存在しない場合
   * @throws ItemizedStatementConflictError 楽観的排他制御エラー
   * @throws DuplicateItemizedStatementNameError 同名の内訳書が既に存在する場合
   */
  async updateName(
    id: string,
    newName: string,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<ItemizedStatementInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 内訳書の存在確認
      const itemizedStatement = await tx.itemizedStatement.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          sourceQuantityTableId: true,
          sourceQuantityTableName: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
        throw new ItemizedStatementNotFoundError(id);
      }

      // 2. 楽観的排他制御: updatedAtの比較 (Requirements: 10.1, 10.3)
      if (itemizedStatement.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ItemizedStatementConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: itemizedStatement.updatedAt.toISOString(),
        });
      }

      // 3. 同名の内訳書が存在しないことを確認
      const existingCount = await tx.itemizedStatement.count({
        where: {
          projectId: itemizedStatement.projectId,
          name: newName,
          deletedAt: null,
          id: { not: id }, // 自分自身は除外
        },
      });

      if (existingCount > 0) {
        throw new DuplicateItemizedStatementNameError(newName, itemizedStatement.projectId);
      }

      // 4. 更新
      const oldName = itemizedStatement.name;
      const updatedStatement = await tx.itemizedStatement.update({
        where: { id },
        data: { name: newName.trim() },
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      // 5. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ITEMIZED_STATEMENT_UPDATED',
        actorId,
        targetType: ITEMIZED_STATEMENT_TARGET_TYPE,
        targetId: id,
        before: { name: oldName },
        after: { name: updatedStatement.name },
      });

      return this.toItemizedStatementInfo(updatedStatement);
    });
  }

  /**
   * データベースの結果をItemizedStatementInfoに変換
   */
  private toItemizedStatementInfo(
    statement: {
      id: string;
      projectId: string;
      name: string;
      sourceQuantityTableId: string;
      sourceQuantityTableName: string;
      createdAt: Date;
      updatedAt: Date;
      _count?: { items: number };
    },
    itemCount?: number
  ): ItemizedStatementInfo {
    return {
      id: statement.id,
      projectId: statement.projectId,
      name: statement.name,
      sourceQuantityTableId: statement.sourceQuantityTableId,
      sourceQuantityTableName: statement.sourceQuantityTableName,
      itemCount: itemCount ?? statement._count?.items ?? 0,
      createdAt: statement.createdAt,
      updatedAt: statement.updatedAt,
    };
  }

  /**
   * データベースの結果をItemizedStatementDetailInfoに変換
   */
  private toItemizedStatementDetailInfo(statement: {
    id: string;
    projectId: string;
    name: string;
    sourceQuantityTableId: string;
    sourceQuantityTableName: string;
    createdAt: Date;
    updatedAt: Date;
    project: {
      id: string;
      name: string;
    };
    items: Array<{
      id: string;
      itemizedStatementId: string;
      customCategory: string | null;
      workType: string | null;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: { toString(): string } | number;
      displayOrder: number;
    }>;
  }): ItemizedStatementDetailInfo {
    return {
      id: statement.id,
      projectId: statement.projectId,
      project: {
        id: statement.project.id,
        name: statement.project.name,
      },
      name: statement.name,
      sourceQuantityTableId: statement.sourceQuantityTableId,
      sourceQuantityTableName: statement.sourceQuantityTableName,
      createdAt: statement.createdAt,
      updatedAt: statement.updatedAt,
      itemCount: statement.items.length,
      items: statement.items.map((item) => ({
        id: item.id,
        itemizedStatementId: item.itemizedStatementId,
        customCategory: item.customCategory,
        workType: item.workType,
        name: item.name,
        specification: item.specification,
        unit: item.unit,
        quantity:
          typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity.toString()),
        displayOrder: item.displayOrder,
      })),
    };
  }
}
