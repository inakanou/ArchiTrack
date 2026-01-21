/**
 * @fileoverview 数量表サービス
 *
 * 数量表のCRUD操作とビジネスロジックを担当します。
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
 * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
 *
 * @module services/quantity-table
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateQuantityTableInput,
  UpdateQuantityTableInput,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityTableConflictError,
  ProjectNotFoundForQuantityTableError,
} from '../errors/quantityTableError.js';
import { QUANTITY_TABLE_TARGET_TYPE } from '../types/audit-log.types.js';
import Decimal from 'decimal.js';

/**
 * QuantityTableService依存関係
 */
export interface QuantityTableServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 数量表情報
 */
export interface QuantityTableInfo {
  id: string;
  projectId: string;
  name: string;
  groupCount: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 数量表詳細情報
 */
export interface QuantityTableDetail extends QuantityTableInfo {
  project: { id: string; name: string };
  groups: QuantityGroupInfo[];
}

/**
 * 数量グループ情報（簡易）
 */
export interface QuantityGroupInfo {
  id: string;
  name: string | null;
  surveyImageId: string | null;
  displayOrder: number;
  itemCount: number;
}

/**
 * 現場調査画像サマリー
 */
export interface SurveyImageSummary {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName: string;
}

/**
 * 数量項目詳細
 */
export interface QuantityItemDetailInfo {
  id: string;
  quantityGroupId: string;
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  calculationMethod: string;
  calculationParams: Record<string, number> | null;
  adjustmentFactor: number;
  roundingUnit: number;
  quantity: number;
  remarks: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 数量グループ詳細情報
 */
export interface QuantityGroupDetailInfo {
  id: string;
  quantityTableId: string;
  name: string | null;
  surveyImageId: string | null;
  surveyImage: SurveyImageSummary | null;
  displayOrder: number;
  itemCount: number;
  items: QuantityItemDetailInfo[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 数量表詳細情報（項目を含む）
 */
export interface QuantityTableDetailWithItems extends QuantityTableInfo {
  project: { id: string; name: string };
  groups: QuantityGroupDetailInfo[];
}

/**
 * フィルター条件
 */
export interface QuantityTableFilter {
  search?: string;
}

/**
 * ページネーション入力
 */
export interface QuantityTablePaginationInput {
  page: number;
  limit: number;
}

/**
 * ソート可能フィールド
 */
export type QuantityTableSortableField = 'createdAt' | 'updatedAt' | 'name';

/**
 * ソート順序
 */
export type QuantityTableSortOrder = 'asc' | 'desc';

/**
 * ソート入力
 */
export interface QuantityTableSortInput {
  sort: QuantityTableSortableField;
  order: QuantityTableSortOrder;
}

/**
 * ページネーション情報
 */
export interface QuantityTablePaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付き数量表一覧
 */
export interface PaginatedQuantityTables {
  data: QuantityTableInfo[];
  pagination: QuantityTablePaginationInfo;
}

/**
 * プロジェクト別数量表サマリー（Requirements: 1.2, 1.3）
 *
 * プロジェクト詳細画面の数量表セクションで表示する
 * 直近の数量表一覧と総数を含む。
 */
export interface ProjectQuantityTableSummary {
  /** 数量表の総数 */
  totalCount: number;
  /** 直近N件の数量表 */
  latestTables: QuantityTableInfo[];
}

/**
 * バルク保存用の項目更新データ
 */
export interface BulkSaveItemInput {
  id: string;
  majorCategory?: string | null;
  middleCategory?: string | null;
  minorCategory?: string | null;
  customCategory?: string | null;
  workType?: string;
  name?: string;
  specification?: string | null;
  unit?: string;
  calculationMethod?: 'STANDARD' | 'AREA_VOLUME' | 'PITCH';
  calculationParams?: Record<string, number> | null;
  adjustmentFactor?: number;
  roundingUnit?: number;
  quantity?: number;
  remarks?: string | null;
  displayOrder?: number;
}

/**
 * バルク保存用のグループ更新データ
 */
export interface BulkSaveGroupInput {
  id: string;
  items: BulkSaveItemInput[];
}

/**
 * バルク保存入力
 */
export interface BulkSaveInput {
  groups: BulkSaveGroupInput[];
}

/**
 * バルク保存結果
 */
export interface BulkSaveResult {
  updatedItemCount: number;
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
 * 数量表サービス
 *
 * 数量表のCRUD操作とビジネスロジックを担当します。
 */
export class QuantityTableService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: QuantityTableServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 数量表作成
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクト存在確認
   * 2. 数量表作成 (Requirements: 2.1, 2.2)
   * 3. 監査ログの記録
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された数量表情報
   * @throws ProjectNotFoundForQuantityTableError プロジェクトが存在しない、または論理削除済みの場合
   */
  async create(input: CreateQuantityTableInput, actorId: string): Promise<QuantityTableInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクト存在確認
      await this.validateProjectExists(tx, input.projectId);

      // 2. 数量表作成
      const quantityTable = await tx.quantityTable.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
        },
        include: {
          _count: {
            select: { groups: true },
          },
        },
      });

      // 3. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_CREATED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: quantityTable.id,
        before: null,
        after: {
          name: quantityTable.name,
          projectId: quantityTable.projectId,
        },
      });

      return this.toQuantityTableInfo(quantityTable);
    });
  }

  /**
   * プロジェクト存在確認
   *
   * 指定されたプロジェクトが存在し、論理削除されていないことを確認する。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param projectId - プロジェクトID
   * @throws ProjectNotFoundForQuantityTableError プロジェクトが存在しない、または論理削除済みの場合
   */
  private async validateProjectExists(
    tx: PrismaTransactionClient,
    projectId: string
  ): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundForQuantityTableError(projectId);
    }
  }

  /**
   * 数量表詳細取得
   *
   * 数量表の基本情報、プロジェクト情報、グループ一覧（項目を含む）を取得する。
   * 論理削除されたレコードは除外される。
   *
   * @param id - 数量表ID
   * @returns 数量表詳細情報、存在しない場合はnull
   */
  async findById(id: string): Promise<QuantityTableDetailWithItems | null> {
    const quantityTable = await this.prisma.quantityTable.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        groups: {
          orderBy: {
            displayOrder: 'asc',
          },
          include: {
            surveyImage: {
              select: {
                id: true,
                thumbnailPath: true,
                originalPath: true,
                fileName: true,
              },
            },
            items: {
              orderBy: {
                displayOrder: 'asc',
              },
            },
            _count: {
              select: { items: true },
            },
          },
        },
        _count: {
          select: { groups: true },
        },
      },
    });

    if (!quantityTable) {
      return null;
    }

    return this.toQuantityTableDetailWithItems(quantityTable);
  }

  /**
   * プロジェクトIDによる数量表一覧取得
   *
   * 指定されたプロジェクトに属する数量表の一覧を、
   * ページネーション、検索、ソートに対応して取得する。
   *
   * Requirements:
   * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
   *
   * @param projectId - プロジェクトID
   * @param filter - フィルタ条件
   * @param pagination - ページネーション入力
   * @param sort - ソート入力
   * @returns ページネーション付き数量表一覧
   */
  async findByProjectId(
    projectId: string,
    filter: QuantityTableFilter,
    pagination: QuantityTablePaginationInput,
    sort: QuantityTableSortInput
  ): Promise<PaginatedQuantityTables> {
    // WHERE条件の構築
    const where: Prisma.QuantityTableWhereInput = {
      projectId,
      deletedAt: null,
    };

    // キーワード検索
    if (filter.search && filter.search.trim() !== '') {
      where.name = { contains: filter.search, mode: 'insensitive' };
    }

    // ソート条件の構築
    const orderBy: Prisma.QuantityTableOrderByWithRelationInput = {
      [sort.sort]: sort.order,
    };

    // ページネーション計算
    const skip = (pagination.page - 1) * pagination.limit;
    const take = pagination.limit;

    // データ取得と件数カウントを並行実行
    const [quantityTables, total] = await Promise.all([
      this.prisma.quantityTable.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          _count: {
            select: { groups: true },
          },
          groups: {
            select: {
              _count: {
                select: { items: true },
              },
            },
          },
        },
      }),
      this.prisma.quantityTable.count({ where }),
    ]);

    // 結果の変換
    const data: QuantityTableInfo[] = quantityTables.map((qt) => {
      const itemCount = qt.groups.reduce((sum, g) => sum + g._count.items, 0);
      return {
        id: qt.id,
        projectId: qt.projectId,
        name: qt.name,
        groupCount: qt._count.groups,
        itemCount,
        createdAt: qt.createdAt,
        updatedAt: qt.updatedAt,
      };
    });

    // ページネーション情報の計算
    const totalPages = total > 0 ? Math.ceil(total / pagination.limit) : 0;

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * プロジェクト別の直近N件と総数を取得
   *
   * プロジェクト詳細画面の数量表セクションで使用する。
   * 直近N件の数量表と、数量表の総数を返却する。
   *
   * Requirements:
   * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
   * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト: 2）
   * @returns プロジェクト別数量表サマリー
   */
  async findLatestByProjectId(
    projectId: string,
    limit: number = 2
  ): Promise<ProjectQuantityTableSummary> {
    // WHERE条件
    const where = {
      projectId,
      deletedAt: null,
    };

    // データ取得と件数カウントを並行実行
    const [quantityTables, totalCount] = await Promise.all([
      this.prisma.quantityTable.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          _count: {
            select: { groups: true },
          },
          groups: {
            select: {
              _count: {
                select: { items: true },
              },
            },
          },
        },
      }),
      this.prisma.quantityTable.count({ where }),
    ]);

    // 結果の変換
    const latestTables: QuantityTableInfo[] = quantityTables.map((qt) => {
      const itemCount = qt.groups.reduce((sum, g) => sum + g._count.items, 0);
      return {
        id: qt.id,
        projectId: qt.projectId,
        name: qt.name,
        groupCount: qt._count.groups,
        itemCount,
        createdAt: qt.createdAt,
        updatedAt: qt.updatedAt,
      };
    });

    return {
      totalCount,
      latestTables,
    };
  }

  /**
   * 数量表更新
   *
   * 楽観的排他制御を実装。expectedUpdatedAtと実際のupdatedAtが一致しない場合は
   * QuantityTableConflictErrorをスロー。
   *
   * トランザクション内で以下を実行:
   * 1. 数量表の存在確認・楽観的排他制御
   * 2. 数量表更新
   * 3. 監査ログの記録
   *
   * Requirements:
   * - 2.5: 数量表名を編集する
   *
   * @param id - 数量表ID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された数量表情報
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   * @throws QuantityTableConflictError 楽観的排他制御エラー（他のユーザーによる更新との競合）
   */
  async update(
    id: string,
    input: UpdateQuantityTableInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<QuantityTableInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量表の存在確認
      const quantityTable = await tx.quantityTable.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!quantityTable || quantityTable.deletedAt !== null) {
        throw new QuantityTableNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較
      if (quantityTable.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new QuantityTableConflictError(
          '数量表は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: quantityTable.updatedAt.toISOString(),
          }
        );
      }

      // 2. 更新データの構築
      const updateData: { name?: string } = {};

      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }

      // 3. 数量表更新
      const updatedQuantityTable = await tx.quantityTable.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: { groups: true },
          },
          groups: {
            select: {
              _count: {
                select: { items: true },
              },
            },
          },
        },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_UPDATED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: id,
        before: {
          name: quantityTable.name,
        },
        after: {
          name: updatedQuantityTable.name,
        },
      });

      const itemCount = updatedQuantityTable.groups.reduce((sum, g) => sum + g._count.items, 0);

      return {
        id: updatedQuantityTable.id,
        projectId: updatedQuantityTable.projectId,
        name: updatedQuantityTable.name,
        groupCount: updatedQuantityTable._count.groups,
        itemCount,
        createdAt: updatedQuantityTable.createdAt,
        updatedAt: updatedQuantityTable.updatedAt,
      };
    });
  }

  /**
   * 数量表のバルク保存
   *
   * 数量表内の全項目を1つのトランザクションで一括更新する。
   * これにより、複数のAPIリクエストを1回にまとめ、
   * 楽観的排他制御を数量表レベルで行うことができる。
   *
   * トランザクション内で以下を実行:
   * 1. 数量表の存在確認・楽観的排他制御
   * 2. 各項目の更新
   * 3. 数量表のupdatedAtを更新
   * 4. 監査ログの記録
   *
   * @param id - 数量表ID
   * @param input - バルク保存入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns バルク保存結果
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   * @throws QuantityTableConflictError 楽観的排他制御エラー（他のユーザーによる更新との競合）
   */
  async bulkSave(
    id: string,
    input: BulkSaveInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<BulkSaveResult> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量表の存在確認と楽観的排他制御
      const quantityTable = await tx.quantityTable.findUnique({
        where: { id },
        select: {
          id: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!quantityTable || quantityTable.deletedAt !== null) {
        throw new QuantityTableNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較
      if (quantityTable.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new QuantityTableConflictError(
          '数量表は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: quantityTable.updatedAt.toISOString(),
          }
        );
      }

      // 2. 各項目を順番に更新（トランザクション内で一括処理）
      let updatedItemCount = 0;

      for (const group of input.groups) {
        for (const item of group.items) {
          // 更新データの構築
          const updateData: Record<string, unknown> = {};

          if (item.majorCategory !== undefined) {
            updateData.majorCategory = item.majorCategory?.trim() ?? null;
          }
          if (item.middleCategory !== undefined) {
            updateData.middleCategory = item.middleCategory?.trim() ?? null;
          }
          if (item.minorCategory !== undefined) {
            updateData.minorCategory = item.minorCategory?.trim() ?? null;
          }
          if (item.customCategory !== undefined) {
            updateData.customCategory = item.customCategory?.trim() ?? null;
          }
          if (item.workType !== undefined) {
            updateData.workType = item.workType.trim();
          }
          if (item.name !== undefined) {
            updateData.name = item.name.trim();
          }
          if (item.specification !== undefined) {
            updateData.specification = item.specification?.trim() ?? null;
          }
          if (item.unit !== undefined) {
            updateData.unit = item.unit.trim();
          }
          if (item.calculationMethod !== undefined) {
            updateData.calculationMethod = item.calculationMethod;
          }
          if (item.calculationParams !== undefined) {
            updateData.calculationParams = item.calculationParams;
          }
          if (item.adjustmentFactor !== undefined) {
            updateData.adjustmentFactor = new Decimal(item.adjustmentFactor);
          }
          if (item.roundingUnit !== undefined) {
            updateData.roundingUnit = new Decimal(item.roundingUnit);
          }
          if (item.quantity !== undefined) {
            updateData.quantity = new Decimal(item.quantity);
          }
          if (item.remarks !== undefined) {
            updateData.remarks = item.remarks;
          }
          if (item.displayOrder !== undefined) {
            updateData.displayOrder = item.displayOrder;
          }

          // 項目の更新
          await tx.quantityItem.update({
            where: { id: item.id },
            data: updateData,
          });

          updatedItemCount++;
        }
      }

      // 3. 数量表のupdatedAtを更新（バルク保存のタイムスタンプとして）
      const updatedQuantityTable = await tx.quantityTable.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_BULK_SAVED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: id,
        before: null,
        after: {
          updatedItemCount,
          groupCount: input.groups.length,
        },
      });

      return {
        updatedItemCount,
        updatedAt: updatedQuantityTable.updatedAt,
      };
    });
  }

  /**
   * 数量表削除
   *
   * 論理削除を実行。関連するグループと項目も自動的にアクセス不可となる。
   *
   * トランザクション内で以下を実行:
   * 1. 数量表の存在確認
   * 2. 数量表の論理削除
   * 3. 監査ログの記録
   *
   * Requirements:
   * - 2.4: 数量表を選択して削除操作を行う
   *
   * @param id - 数量表ID
   * @param actorId - 実行者ID
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   */
  async delete(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 数量表の存在確認（グループ情報も含めて取得）
      const quantityTable = await tx.quantityTable.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          groups: {
            select: {
              id: true,
              _count: {
                select: { items: true },
              },
            },
          },
          _count: {
            select: { groups: true },
          },
        },
      });

      if (!quantityTable || quantityTable.deletedAt !== null) {
        throw new QuantityTableNotFoundError(id);
      }

      const deletedAt = new Date();
      const groupCount = quantityTable._count.groups;
      const itemCount = quantityTable.groups.reduce((sum, g) => sum + g._count.items, 0);

      // 2. 数量表の論理削除
      await tx.quantityTable.update({
        where: { id },
        data: { deletedAt },
      });

      // 3. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_DELETED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: id,
        before: {
          name: quantityTable.name,
          projectId: quantityTable.projectId,
          groupCount,
          itemCount,
        },
        after: null,
      });
    });
  }

  /**
   * データベースの結果をQuantityTableInfoに変換
   */
  private toQuantityTableInfo(quantityTable: {
    id: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { groups: number };
    groups?: Array<{ _count: { items: number } }>;
  }): QuantityTableInfo {
    const itemCount = quantityTable.groups?.reduce((sum, g) => sum + g._count.items, 0) ?? 0;
    return {
      id: quantityTable.id,
      projectId: quantityTable.projectId,
      name: quantityTable.name,
      groupCount: quantityTable._count.groups,
      itemCount,
      createdAt: quantityTable.createdAt,
      updatedAt: quantityTable.updatedAt,
    };
  }

  /**
   * データベースの結果をQuantityTableDetailWithItemsに変換
   */
  private toQuantityTableDetailWithItems(quantityTable: {
    id: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    project: { id: string; name: string };
    groups: Array<{
      id: string;
      quantityTableId: string;
      name: string | null;
      surveyImageId: string | null;
      displayOrder: number;
      createdAt: Date;
      updatedAt: Date;
      surveyImage: {
        id: string;
        thumbnailPath: string;
        originalPath: string;
        fileName: string;
      } | null;
      items: Array<{
        id: string;
        quantityGroupId: string;
        majorCategory: string | null;
        middleCategory: string | null;
        minorCategory: string | null;
        customCategory: string | null;
        workType: string;
        name: string;
        specification: string | null;
        unit: string;
        calculationMethod: string;
        calculationParams: Prisma.JsonValue | null;
        adjustmentFactor: Prisma.Decimal;
        roundingUnit: Prisma.Decimal;
        quantity: Prisma.Decimal;
        remarks: string | null;
        displayOrder: number;
        createdAt: Date;
        updatedAt: Date;
      }>;
      _count: { items: number };
    }>;
    _count: { groups: number };
  }): QuantityTableDetailWithItems {
    const groups: QuantityGroupDetailInfo[] = quantityTable.groups.map((g) => ({
      id: g.id,
      quantityTableId: g.quantityTableId,
      name: g.name,
      surveyImageId: g.surveyImageId,
      surveyImage: g.surveyImage
        ? {
            id: g.surveyImage.id,
            thumbnailUrl: `/api/storage/${g.surveyImage.thumbnailPath}`,
            originalUrl: `/api/storage/${g.surveyImage.originalPath}`,
            fileName: g.surveyImage.fileName,
          }
        : null,
      displayOrder: g.displayOrder,
      itemCount: g._count.items,
      items: g.items.map((item) => ({
        id: item.id,
        quantityGroupId: item.quantityGroupId,
        majorCategory: item.majorCategory,
        middleCategory: item.middleCategory,
        minorCategory: item.minorCategory,
        customCategory: item.customCategory,
        workType: item.workType,
        name: item.name,
        specification: item.specification,
        unit: item.unit,
        calculationMethod: item.calculationMethod,
        calculationParams: item.calculationParams as Record<string, number> | null,
        adjustmentFactor: Number(item.adjustmentFactor),
        roundingUnit: Number(item.roundingUnit),
        quantity: Number(item.quantity),
        remarks: item.remarks,
        displayOrder: item.displayOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));

    const itemCount = groups.reduce((sum, g) => sum + g.itemCount, 0);

    return {
      id: quantityTable.id,
      projectId: quantityTable.projectId,
      name: quantityTable.name,
      groupCount: quantityTable._count.groups,
      itemCount,
      createdAt: quantityTable.createdAt,
      updatedAt: quantityTable.updatedAt,
      project: quantityTable.project,
      groups,
    };
  }
}
