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
 * 案件の閲覧範囲（Requirement 18.4、タスク27.1）: 内訳書の作成の要求が指す数量表が経路のプロジェクトに
 * 属さなければ、数量表の不在と同じ 404 にして内訳書を作成しない。数量表の案件が実在し実行者の閲覧範囲外なら、
 * user-authentication の要件39.7 に従い PROJECT_SCOPE_DENIED をトランザクションの外で記録する。
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
  ItemNotBelongToStatementError,
} from '../errors/itemizedStatementError.js';
import { QuantityTableNotFoundError } from '../errors/quantityTableError.js';
import { ItemizedStatementHasEstimateRequestsError } from '../errors/estimateRequestError.js';
import { getSharedProjectScopeService, type ProjectScopeService } from './project-scope.service.js';
import {
  withSurveyScopeDenialRecording,
  type ProjectScopeDenialContext,
} from './project-scope-denial.service.js';

/**
 * 内訳書サービス依存関係
 */
export interface ItemizedStatementServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
  pivotService: ItemizedStatementPivotService;
  /**
   * 案件の閲覧範囲の判定（任意。タスク27.1、Requirement 18.4）。
   * 作成の要求が指す他のプロジェクトの数量表の案件が範囲外かを判定し、範囲外の拒否を記録するために用いる。
   * 未指定の場合は user-authentication の共有のインスタンス（{@link getSharedProjectScopeService}）で判定する。
   */
  projectScope?: Pick<ProjectScopeService, 'evaluateProjectAccess'>;
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
 * 並び順更新入力
 *
 * Requirements: 17.8
 */
export interface UpdateItemOrderInput {
  itemizedStatementId: string;
  items: Array<{ id: string; displayOrder: number }>;
  expectedUpdatedAt: Date;
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
  private readonly projectScope: Pick<ProjectScopeService, 'evaluateProjectAccess'>;

  constructor(deps: ItemizedStatementServiceDependencies) {
    // 共有のインスタンスは判定の時に引く（構築時に読まない）
    this.projectScope = deps.projectScope ?? {
      evaluateProjectAccess: (userId, projectId) =>
        getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
    };
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
   * @param scopeDenialContext - 範囲外の拒否の記録に添える要求の識別（経路が要求から切り出して渡す）
   * @returns 作成された内訳書情報
   * @throws QuantityTableNotFoundError 数量表が存在しない・論理削除済み・作成先のプロジェクトに属さない場合
   *   （Requirement 18.4）。作成先のプロジェクトに属さない数量表は、論理削除済みかどうかに関わらず
   *   数量表の案件を判定し、範囲外のときだけ範囲外の拒否として記録する（Requirement 18.12）
   * @throws EmptyQuantityItemsError 数量表に項目がない場合
   * @throws DuplicateItemizedStatementNameError 同名の内訳書が既に存在する場合
   */
  async create(
    input: CreateItemizedStatementInput,
    actorId: string,
    scopeDenialContext?: ProjectScopeDenialContext
  ): Promise<ItemizedStatementInfo> {
    // 数量表の所属の照合（18.4）で範囲外とした案件は、処理の後（トランザクションの外）で
    // PROJECT_SCOPE_DENIED として記録する（user-authentication の要件39.7）
    return withSurveyScopeDenialRecording(
      actorId,
      scopeDenialContext,
      this.auditLogService,
      (deniedProjectIds) => this.createWithin(input, actorId, deniedProjectIds)
    );
  }

  /** {@link create} の本体。数量表の案件を範囲外と判定したら `deniedProjectIds` へ入れる */
  private async createWithin(
    input: CreateItemizedStatementInput,
    actorId: string,
    deniedProjectIds: Set<string>
  ): Promise<ItemizedStatementInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 数量表の存在確認
      const quantityTable = await tx.quantityTable.findUnique({
        where: { id: input.sourceQuantityTableId },
        select: { id: true, name: true, projectId: true, deletedAt: true },
      });

      // 数量表の照合の順（design.md の「2026-10-30 の追加」章の「決定」の「数量表の照合の順」）。3 通りとも
      // 18.4 と同じ 404（数量表の不在）で拒み、集計を呼ばず内訳書も内訳項目も作成しない。
      // (1) 行が無い: 記録しない
      if (!quantityTable) {
        throw new QuantityTableNotFoundError(input.sourceQuantityTableId);
      }

      // (2) 作成先のプロジェクトに属さない: 論理削除済みかどうかに関わらず数量表の案件を判定する（18.4・
      // 18.12）。範囲の内外で応答を変えると範囲外の数量表の実在を推測させるため、範囲の内外を問わず
      // 不在と同じ応答にする。範囲外（案件は実在する）のときだけ、範囲外の拒否として記録する
      // （user-authentication の要件39.7・39.8）
      if (quantityTable.projectId !== input.projectId) {
        const decision = await this.projectScope.evaluateProjectAccess(
          actorId,
          quantityTable.projectId
        );
        if (decision === 'out_of_scope') {
          deniedProjectIds.add(quantityTable.projectId);
        }
        throw new QuantityTableNotFoundError(input.sourceQuantityTableId);
      }

      // (3) 作成先のプロジェクトに属し論理削除済み: 記録しない（18.4・18.12）
      if (quantityTable.deletedAt !== null) {
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
   * Task 2.4: 見積依頼で使用されている場合は削除を拒否
   *
   * @param id - 内訳書ID
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @throws ItemizedStatementNotFoundError 内訳書が存在しないか既に削除済みの場合
   * @throws ItemizedStatementConflictError 楽観的排他制御エラー
   * @throws ItemizedStatementHasEstimateRequestsError 見積依頼で使用されている場合
   */
  async delete(id: string, actorId: string, expectedUpdatedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 内訳書の存在確認（見積依頼数も取得）
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
          _count: {
            select: {
              estimateRequests: {
                where: { deletedAt: null }, // 論理削除されていない見積依頼のみカウント
              },
            },
          },
        },
      });

      if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
        throw new ItemizedStatementNotFoundError(id);
      }

      // 2. 見積依頼で使用されているかチェック (Task 2.4)
      const estimateRequestCount = itemizedStatement._count.estimateRequests;
      if (estimateRequestCount > 0) {
        throw new ItemizedStatementHasEstimateRequestsError(id, estimateRequestCount);
      }

      // 3. 楽観的排他制御: updatedAtの比較 (Requirements: 10.2, 10.3)
      if (itemizedStatement.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ItemizedStatementConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: itemizedStatement.updatedAt.toISOString(),
        });
      }

      // 4. 論理削除
      await tx.itemizedStatement.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 5. 監査ログの記録
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
   * 内訳書項目の並び順を更新する（楽観的排他制御付き）
   *
   * Requirements: 17.8, 17.10, 17.14
   *
   * @param input - 並び順更新入力
   * @param actorId - 実行者ID
   * @returns 更新後の内訳書詳細情報
   * @throws ItemizedStatementNotFoundError 内訳書が存在しないか既に削除済みの場合
   * @throws ItemizedStatementConflictError 楽観的排他制御エラー
   * @throws ItemNotBelongToStatementError 他の内訳書に属する項目IDが含まれる場合
   */
  async updateItemOrder(
    input: UpdateItemOrderInput,
    actorId: string
  ): Promise<ItemizedStatementDetailInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 内訳書の存在確認（項目も含めて取得）
      const itemizedStatement = await tx.itemizedStatement.findUnique({
        where: { id: input.itemizedStatementId },
        include: {
          items: {
            select: { id: true },
          },
        },
      });

      if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
        throw new ItemizedStatementNotFoundError(input.itemizedStatementId);
      }

      // 2. 楽観的排他制御: updatedAtの比較 (Requirements: 17.14)
      if (itemizedStatement.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new ItemizedStatementConflictError({
          expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
          actualUpdatedAt: itemizedStatement.updatedAt.toISOString(),
        });
      }

      // 3. 全項目IDが対象内訳書に属することを検証 (Requirements: 17.10)
      const existingItemIds = new Set(itemizedStatement.items.map((item) => item.id));
      for (const orderItem of input.items) {
        if (!existingItemIds.has(orderItem.id)) {
          throw new ItemNotBelongToStatementError(orderItem.id, input.itemizedStatementId);
        }
      }

      // 4. トランザクション内で全項目のdisplayOrderを一括更新
      for (const orderItem of input.items) {
        await tx.itemizedStatementItem.update({
          where: { id: orderItem.id },
          data: { displayOrder: orderItem.displayOrder },
        });
      }

      // 5. updatedAtを更新
      await tx.itemizedStatement.update({
        where: { id: input.itemizedStatementId },
        data: { updatedAt: new Date() },
      });

      // 6. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ITEMIZED_STATEMENT_UPDATED',
        actorId,
        targetType: ITEMIZED_STATEMENT_TARGET_TYPE,
        targetId: input.itemizedStatementId,
        before: null,
        after: {
          itemCount: input.items.length,
        },
      });

      // 7. 更新後の内訳書詳細を取得して返却
      const updatedStatement = await tx.itemizedStatement.findUnique({
        where: { id: input.itemizedStatementId },
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

      // updatedStatementがnullの場合は論理的にありえないが安全のため
      if (!updatedStatement) {
        throw new ItemizedStatementNotFoundError(input.itemizedStatementId);
      }

      return this.toItemizedStatementDetailInfo(updatedStatement);
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
