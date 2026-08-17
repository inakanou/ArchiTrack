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
  CopyQuantityTableInput,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityTableConflictError,
  QuantityTableValidationError,
  ProjectNotFoundForQuantityTableError,
} from '../errors/quantityTableError.js';
import { QUANTITY_TABLE_TARGET_TYPE } from '../types/audit-log.types.js';
import {
  QuantityValidationService,
  type CalculationMethodType,
  type CalculationParamsType,
} from './quantity-validation.service.js';
import { QuantityFieldValidationService } from './quantity-field-validation.service.js';
import Decimal from 'decimal.js';

/**
 * QuantityTableService依存関係
 *
 * 検証系サービスは副作用のない純粋ロジックのため、未指定時は既定インスタンスを生成する。
 */
export interface QuantityTableServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
  /** 計算整合性・数値範囲検証サービス（REQ-11.2, 11.3） */
  quantityValidationService?: QuantityValidationService;
  /** 文字数・数値範囲（フィールド仕様）検証サービス（REQ-11.2, 11.4） */
  quantityFieldValidationService?: QuantityFieldValidationService;
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
 *
 * Requirements: 3.3, 4.2, 21.1
 */
export interface SurveyImageSummary {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName: string;
  /**
   * 注釈データの有無。
   * 数量表詳細取得時に注釈リレーションの存在のみを判定して返す。
   * フロントは false の場合に注釈取得APIの呼び出しを省略できる（画面オープン時のN+1抑止）。
   */
  hasAnnotations: boolean;
  /** 描画された注釈の有無（Requirement 20.2、Task 115.13） */
  hasDrawnAnnotations: boolean;
  /** 注釈付きサムネイルURL（REQ-3.3, 4.2, 19.2, 20.2） */
  annotatedThumbnailUrl: string | null;
  /** 写真コメント（REQ-21.1, 21.2） */
  comment: string | null;
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
  calculationMethod?: CalculationMethodType;
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
 * フル状態同期保存（saveDraft）用の項目入力
 *
 * Field Specifications 準拠の全フィールド（大項目〜備考、計算用フィールド、
 * 調整係数、丸め設定）と表示順を保持する。
 *
 * Requirements: 42.5, 11.1
 */
export interface SaveDraftItemInput {
  /** 既存=UUID / 新規=null */
  id: string | null;
  /** 新規項目のクライアント仮ID（任意・トレース用） */
  tempId?: string;
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  calculationMethod: CalculationMethodType;
  calculationParams: Record<string, number> | null;
  adjustmentFactor: number;
  roundingUnit: number;
  quantity: number;
  remarks: string | null;
  /** 表示順（配列順を正とするが、明示値も保持する） */
  displayOrder: number;
}

/**
 * フル状態同期保存（saveDraft）用のグループ入力
 *
 * Requirements: 42.5, 11.1
 */
export interface SaveDraftGroupInput {
  /** 既存=UUID / 新規=null */
  id: string | null;
  /** 新規グループのクライアント仮ID（任意・トレース用） */
  tempId?: string;
  name: string;
  /** 写真紐づけ（参照のみ） */
  surveyImageId: string | null;
  displayOrder: number;
  /** 当該グループの全項目最終状態（表示順） */
  items: SaveDraftItemInput[];
}

/**
 * フル状態同期保存（saveDraft）入力
 *
 * 数量表の全グループ・全項目の最終状態（表示順）を表す。
 *
 * Requirements: 42.5, 42.8, 11.1
 */
export interface SaveQuantityTableDraftInput {
  /** ISO8601。楽観ロック */
  expectedUpdatedAt: string;
  /** 数量表名（編集画面での変更を含む） */
  name: string;
  /** 数量表の全グループ最終状態（表示順） */
  groups: SaveDraftGroupInput[];
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
  private readonly quantityValidationService: QuantityValidationService;
  private readonly quantityFieldValidationService: QuantityFieldValidationService;

  constructor(deps: QuantityTableServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
    // 検証系は副作用のない純粋ロジックのため、未指定時は既定インスタンスを生成する
    this.quantityValidationService =
      deps.quantityValidationService ?? new QuantityValidationService();
    this.quantityFieldValidationService =
      deps.quantityFieldValidationService ?? new QuantityFieldValidationService();
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
                annotatedThumbnailPath: true,
                fileName: true,
                comment: true,
                // 注釈の有無のみ判定する（重いdataは取得しない）。
                // 注釈なしの画像でフロントが注釈APIを叩かないようにするためのフラグ供給。
                // hasDrawnAnnotations は描画された注釈の有無の派生値で、これも data を
                // 読まずに判定するためレコード側から取得する（Requirement 20.2、Task 115.13）。
                annotation: {
                  select: { id: true, hasDrawnAnnotations: true },
                },
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
   * 数量表のフル状態同期保存（saveDraft）
   *
   * 編集画面のクライアントサイド編集状態（数量表名・全グループ・全項目の最終状態）を
   * 受領し、DB現状と差分比較して単一トランザクションで同期保存する。REQ-42 適用後は
   * 本メソッドが編集画面の唯一の書き込み手段となり、既存 bulkSave（項目更新のみ）の
   * 役割を包含・置換する。
   *
   * トランザクション開始前に全フィールドの整合性検証（文字数・数値範囲・計算整合）を行い、
   * 違反があれば DB へ一切アクセスせず保存を中断する。
   *
   * トランザクション内で以下を実行:
   * 1. 数量表の存在確認・楽観的排他制御（expectedUpdatedAt 不一致は 409）
   * 2. ID検証（いずれも書き込み前に保存を中断, 400）:
   *    - 重複検証: payload 内で同じ既存ID（グループ・項目）が複数回現れないことを確認
   *    - 所属検証: payload の既存ID（グループ・項目）が当該数量表に属することを確認
   * 3. DB現状と payload の差分適用:
   *    - グループ・項目とも payload の配列順に「更新（id一致）/ 作成（id=null）」を先に適用する
   *    - 削除はその後段でまとめて行う。判定はグループ単位ではなく数量表全体のID集合の差分で
   *      行い、payload のどこにも現れない既存グループ・既存項目を削除する
   *      （グループ間移動した項目を移動元からの消失と誤認しないため。REQ-6.4）
   *    - displayOrder は payload の配列順を正とする
   *    - グループ名・写真紐づけ（surveyImageId）・数量表名を反映
   * 4. 数量表の updatedAt 更新・監査ログ記録
   * 5. 最新の数量表詳細（項目を含む）を返却（画面・編集状態の同期用）
   *
   * 失敗時は $transaction により ROLLBACK され、部分反映を残さない。
   *
   * Requirements:
   * - 42.5: 保存操作時に全変更を一括永続化する
   * - 42.8: 保存正常完了時に最新データを返却し画面・編集状態を同期する
   * - 42.9: 整合性/サーバーエラー時はエラーを返し未保存状態を保持可能とする（保存中断）
   * - 11.1: 全グループ・全項目を一括でDBに保存する
   * - 11.2: 整合性チェックエラー時は保存を中断する
   * - 11.3: 計算方法と入力値の不整合検出時は保存を中断する
   * - 11.4: 不整合がある場合は問題箇所を明示する
   *
   * @param id - 数量表ID
   * @param input - フル状態同期保存入力
   * @param actorId - 実行者ID
   * @returns 最新の数量表詳細（項目を含む）
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   * @throws QuantityTableConflictError 楽観的排他制御エラー（他ユーザーによる更新との競合, 409）
   * @throws QuantityTableValidationError 整合性検証エラー（文字数・数値範囲・計算整合）、
   *         同一のグループ・項目IDが複数回含まれる場合、または当該数量表に属さない
   *         グループ・項目IDが含まれる場合（400）
   */
  async saveDraft(
    id: string,
    input: SaveQuantityTableDraftInput,
    actorId: string
  ): Promise<QuantityTableDetailWithItems> {
    // トランザクション開始前に全フィールドを検証し、不整合があれば保存を中断する
    // （REQ-11.2/11.3/11.4, 42.9）。書き込みは一切行わない。
    this.validateDraft(input);

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);

    await this.prisma.$transaction(async (tx) => {
      // 1. 数量表の存在確認・現状取得（差分元となるグループ/項目IDを含む）
      const current = await tx.quantityTable.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          updatedAt: true,
          deletedAt: true,
          groups: {
            select: {
              id: true,
              items: { select: { id: true } },
            },
          },
        },
      });

      if (!current || current.deletedAt !== null) {
        throw new QuantityTableNotFoundError(id);
      }

      // 楽観的排他制御: updatedAt の比較（不一致は 409）
      if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new QuantityTableConflictError(
          '数量表は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: current.updatedAt.toISOString(),
          }
        );
      }

      // 2. グループの差分適用
      const payloadGroupIds = new Set(
        input.groups.map((g) => g.id).filter((gid): gid is string => gid !== null)
      );
      const dbGroupIds = current.groups.map((g) => g.id);

      // 既存項目IDの全集合（数量表全体）
      const dbItemIds = current.groups.flatMap((g) => g.items.map((it) => it.id));

      // payload に残っている既存項目IDの全集合（数量表全体）。
      // 数量項目のグループ間移動（REQ-6.4）では、移動元グループの payload から当該項目が
      // 消える一方で移動先グループの payload に同じ id が現れる。削除判定をグループ単位で
      // 行うと「移動元から消えた」ことだけを見て移動した項目を削除してしまうため、
      // 数量表全体の集合で判定する。
      const payloadItemIds = new Set(
        input.groups
          .flatMap((g) => g.items.map((it) => it.id))
          .filter((iid): iid is string => iid !== null)
      );

      // 2-0-1. 重複検証: payload 内で同じ既存ID（グループ・項目）が複数回現れないことを確認する。
      //      重複を受け入れると同じ行が複数回更新されるうえ、上の payload*Ids 集合には
      //      1件としてしか入らないため削除判定からも外れ、どちらの指定が反映されたのか
      //      定まらない状態が残る（グループの重複では他グループが巻き添えで削除される）。
      //      所属検証と同じく、書き込み前に中断する（REQ-42.9, 11.2, 11.4）。
      this.validateDraftDuplicateIds(input);

      // 2-0-2. 所属検証: payload の既存ID（グループ・項目）が当該数量表に属することを確認する。
      //      属さないIDを受け入れると、他の数量表のグループ・項目が本数量表の配下へ
      //      付け替えられてしまう（既存項目の更新は quantityGroupId を明示するため）。
      //      書き込み前に検証し、違反時は保存を中断する（REQ-42.9, 11.2, 11.4）。
      this.validateDraftOwnership(input, dbGroupIds, dbItemIds);

      // 2-1. グループを payload 配列順に処理（displayOrder は配列順を正とする）
      //      削除（グループ・項目）は本ループの後段でまとめて行う。所属変更（グループ間移動）を
      //      先に確定させないと、移動元グループの Cascade 削除に移動済み項目が巻き込まれる。
      for (const [groupIndex, group] of input.groups.entries()) {
        const groupName = group.name.trim() === '' ? null : group.name.trim();

        let persistedGroupId: string;

        if (group.id === null) {
          // 新規グループ作成
          const created = await tx.quantityGroup.create({
            data: {
              quantityTableId: id,
              name: groupName,
              surveyImageId: group.surveyImageId,
              displayOrder: groupIndex,
            },
          });
          persistedGroupId = created.id;
        } else {
          // 既存グループ更新（名称・写真紐づけ・displayOrder）
          await tx.quantityGroup.update({
            where: { id: group.id },
            data: {
              name: groupName,
              surveyImageId: group.surveyImageId,
              displayOrder: groupIndex,
            },
          });
          persistedGroupId = group.id;
        }

        // 2-2. 項目を payload 配列順に処理（displayOrder は配列順を正とする）
        for (const [itemIndex, item] of group.items.entries()) {
          const itemData = this.buildItemPersistData(item, itemIndex);

          if (item.id === null) {
            await tx.quantityItem.create({
              data: {
                quantityGroupId: persistedGroupId,
                ...itemData,
              },
            });
          } else {
            // 既存項目の更新。quantityGroupId を明示することで、数量項目のグループ間移動
            // （REQ-6.4）が保存時に所属グループの変更として確定する。
            await tx.quantityItem.update({
              where: { id: item.id },
              data: {
                quantityGroupId: persistedGroupId,
                ...itemData,
              },
            });
          }
        }
      }

      // 3-1. 削除: payload に存在しない既存グループ（残存項目は onDelete: Cascade で連鎖削除）
      //      グループ間移動した項目は 2-2 で移動先グループへ付け替え済みのため巻き込まれない。
      const groupIdsToDelete = dbGroupIds.filter((gid) => !payloadGroupIds.has(gid));
      if (groupIdsToDelete.length > 0) {
        await tx.quantityGroup.deleteMany({
          where: { id: { in: groupIdsToDelete } },
        });
      }

      // 3-2. 削除: payload に存在しない既存項目（数量表全体で判定）
      //      グループ削除で Cascade 済みのIDが含まれても deleteMany は無害。
      const itemIdsToDelete = dbItemIds.filter((iid) => !payloadItemIds.has(iid));
      if (itemIdsToDelete.length > 0) {
        await tx.quantityItem.deleteMany({
          where: { id: { in: itemIdsToDelete } },
        });
      }

      // 4. 数量表名・updatedAt を更新
      await tx.quantityTable.update({
        where: { id },
        data: {
          name: input.name.trim(),
          updatedAt: new Date(),
        },
      });

      // 5. 監査ログ記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_BULK_SAVED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: id,
        before: null,
        after: {
          name: input.name.trim(),
          groupCount: input.groups.length,
          itemCount: input.groups.reduce((sum, g) => sum + g.items.length, 0),
        },
      });
    });

    // 6. 最新の数量表詳細（項目を含む）を返却（REQ-42.8 同期用）
    const detail = await this.findById(id);
    if (!detail) {
      // トランザクション直後に消える状況は通常発生しないが、防御的に処理
      throw new QuantityTableNotFoundError(id);
    }
    return detail;
  }

  /**
   * フル状態同期保存（saveDraft）の全フィールド検証
   *
   * 文字数（フィールド仕様）・数値範囲・計算整合を検証し、1件でも違反があれば
   * QuantityTableValidationError をスローして保存を中断する（REQ-11.2/11.3/11.4, 42.9）。
   *
   * @param input - フル状態同期保存入力
   * @throws QuantityTableValidationError 検証違反が1件以上存在する場合
   */
  private validateDraft(input: SaveQuantityTableDraftInput): void {
    const validationErrors: Record<string, string> = {};

    for (const [groupIndex, group] of input.groups.entries()) {
      for (const [itemIndex, item] of group.items.entries()) {
        const prefix = `groups[${groupIndex}].items[${itemIndex}]`;

        // 文字数・数値範囲（フィールド仕様）検証
        const fieldResult = this.quantityFieldValidationService.validateItemFieldSpecs({
          majorCategory: item.majorCategory,
          middleCategory: item.middleCategory,
          minorCategory: item.minorCategory,
          customCategory: item.customCategory,
          workType: item.workType,
          name: item.name,
          specification: item.specification,
          unit: item.unit,
          remarks: item.remarks,
          adjustmentFactor: item.adjustmentFactor,
          roundingUnit: item.roundingUnit,
          quantity: item.quantity,
        });
        for (const err of fieldResult.errors) {
          validationErrors[`${prefix}.${err.field}`] = err.message;
        }

        // 計算整合性検証（計算方法と入力値の不整合, REQ-11.3）
        const calcResult = this.quantityValidationService.validateQuantityItem({
          calculationMethod: item.calculationMethod as CalculationMethodType,
          calculationParams: (item.calculationParams ?? {}) as CalculationParamsType,
          quantity: item.quantity,
          adjustmentFactor: item.adjustmentFactor,
          roundingUnit: item.roundingUnit,
        });
        for (const err of calcResult.errors) {
          // 同一フィールドで重複した場合は計算整合エラーを優先しない（上書きしない）
          const key = `${prefix}.${err.field}`;
          if (validationErrors[key] === undefined) {
            validationErrors[key] = err.message;
          }
        }
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      throw new QuantityTableValidationError(
        '数量項目に整合性エラーがあります。問題箇所を修正してください。',
        validationErrors
      );
    }
  }

  /**
   * フル状態同期保存（saveDraft）の識別子重複検証
   *
   * payload 内で同じ既存ID（グループ・項目）が複数回現れないことを検証する。
   * 重複を受け入れると、同じ行が payload の出現回数だけ更新され（最後の指定が勝つ）、
   * かつ削除判定に用いるID集合には1件としてしか入らないため削除対象からも外れる。
   * グループIDの重複では、重複分の位置に本来置かれるはずだったグループが payload から
   * 消えたものと扱われ、配下項目ごと削除される。いずれも利用者の意図しない状態を生む。
   *
   * 新規のグループ・項目は id を持たない（null）ため対象外である。クライアント仮ID
   * （tempId）は永続化にも応答にも用いないため、重複しても状態には影響しない。
   *
   * 項目IDはグループを跨いで判定するが、グループIDとは別の集合で判定する。両者は
   * 別の表の識別子であり、同じ値であっても重複ではない（Task 115.44 で分離を検証で固定）。
   *
   * Requirements:
   * - 42.9: 整合性エラー時はエラーを返し保存を中断する
   * - 11.2: 整合性チェックエラー時は保存を中断する
   * - 11.4: 不整合がある場合は問題箇所を明示する
   *
   * @param input - フル状態同期保存入力
   * @throws QuantityTableValidationError 同一IDが複数回現れる場合
   */
  private validateDraftDuplicateIds(input: SaveQuantityTableDraftInput): void {
    // グループIDと項目IDは別の表の識別子であるため、集合を分けて判定する。
    // 同じ集合で判定すると、両者が同じ値になった要求を誤って重複として拒否する。
    const seenGroupIds = new Set<string>();
    const seenItemIds = new Set<string>();
    const validationErrors: Record<string, string> = {};

    for (const [groupIndex, group] of input.groups.entries()) {
      if (group.id !== null) {
        if (seenGroupIds.has(group.id)) {
          validationErrors[`groups[${groupIndex}].id`] =
            '同一の数量グループが複数回指定されています';
        }
        seenGroupIds.add(group.id);
      }
      for (const [itemIndex, item] of group.items.entries()) {
        if (item.id !== null) {
          if (seenItemIds.has(item.id)) {
            validationErrors[`groups[${groupIndex}].items[${itemIndex}].id`] =
              '同一の数量項目が複数回指定されています';
          }
          seenItemIds.add(item.id);
        }
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      throw new QuantityTableValidationError(
        '同一のグループまたは項目が重複して含まれています。最新データを再取得してください。',
        validationErrors
      );
    }
  }

  /**
   * フル状態同期保存（saveDraft）の所属検証
   *
   * payload に含まれる既存ID（グループ・項目）が、保存対象の数量表に属することを検証する。
   * 形式（UUID）が正しくても他の数量表のIDであれば、更新時に quantityGroupId を明示する
   * 実装上、他の数量表の項目が本数量表のグループへ付け替えられる。属さないIDは
   * QuantityTableValidationError で拒否し、書き込み前に保存を中断する。
   *
   * Requirements:
   * - 42.9: 整合性エラー時はエラーを返し保存を中断する
   * - 11.2: 整合性チェックエラー時は保存を中断する
   * - 11.4: 不整合がある場合は問題箇所を明示する
   *
   * @param input - フル状態同期保存入力
   * @param dbGroupIds - 保存対象の数量表に属する既存グループIDの全集合
   * @param dbItemIds - 保存対象の数量表に属する既存項目IDの全集合
   * @throws QuantityTableValidationError 属さないIDが1件以上含まれる場合
   */
  private validateDraftOwnership(
    input: SaveQuantityTableDraftInput,
    dbGroupIds: string[],
    dbItemIds: string[]
  ): void {
    const groupIdSet = new Set(dbGroupIds);
    const itemIdSet = new Set(dbItemIds);
    const validationErrors: Record<string, string> = {};

    for (const [groupIndex, group] of input.groups.entries()) {
      if (group.id !== null && !groupIdSet.has(group.id)) {
        validationErrors[`groups[${groupIndex}].id`] =
          'この数量表に属さない数量グループが指定されています';
      }
      for (const [itemIndex, item] of group.items.entries()) {
        if (item.id !== null && !itemIdSet.has(item.id)) {
          validationErrors[`groups[${groupIndex}].items[${itemIndex}].id`] =
            'この数量表に属さない数量項目が指定されています';
        }
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      throw new QuantityTableValidationError(
        'この数量表に属さないグループまたは項目が含まれています。最新データを再取得してください。',
        validationErrors
      );
    }
  }

  /**
   * saveDraft 用の項目永続化データを構築する
   *
   * 文字列フィールドはトリムし、空文字は任意項目では null に正規化する。
   * Decimal フィールドは decimal.js で生成する。displayOrder は配列順を正とする。
   *
   * @param item - 項目入力
   * @param displayOrder - 配列順に基づく表示順
   * @returns Prisma の create/update 双方で利用可能な項目データ
   */
  private buildItemPersistData(
    item: SaveDraftItemInput,
    displayOrder: number
  ): {
    majorCategory: string | null;
    middleCategory: string | null;
    minorCategory: string | null;
    customCategory: string | null;
    workType: string;
    name: string;
    specification: string | null;
    unit: string;
    calculationMethod: CalculationMethodType;
    calculationParams: Record<string, number> | undefined;
    adjustmentFactor: Decimal;
    roundingUnit: Decimal;
    quantity: Decimal;
    remarks: string | null;
    displayOrder: number;
  } {
    const normalizeOptional = (value: string | null): string | null => {
      if (value === null) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    };

    return {
      majorCategory: normalizeOptional(item.majorCategory),
      middleCategory: normalizeOptional(item.middleCategory),
      minorCategory: normalizeOptional(item.minorCategory),
      customCategory: normalizeOptional(item.customCategory),
      workType: item.workType.trim(),
      name: item.name.trim(),
      specification: normalizeOptional(item.specification),
      unit: item.unit.trim(),
      calculationMethod: item.calculationMethod,
      // Prisma の Json? には null を直接渡さず undefined で「未設定」を表現する
      calculationParams: item.calculationParams ?? undefined,
      adjustmentFactor: new Decimal(item.adjustmentFactor),
      roundingUnit: new Decimal(item.roundingUnit),
      quantity: new Decimal(item.quantity),
      remarks: normalizeOptional(item.remarks),
      displayOrder,
    };
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
   * 数量表ディープコピー
   *
   * 単一トランザクション内で元の数量表を全グループ・全項目含めて取得し、
   * 新しい数量表としてディープコピーする。
   *
   * コピー対象:
   * - 数量表: name（inputから指定）, projectId
   * - グループ: name, surveyImageId, displayOrder
   * - 項目: 全フィールド値（majorCategory, middleCategory, minorCategory,
   *   customCategory, workType, name, specification, unit, calculationMethod,
   *   calculationParams, adjustmentFactor, roundingUnit, quantity, remarks, displayOrder）
   *
   * Requirements:
   * - 17.2: コピーダイアログで数量表名を入力して作成を確定する
   * - 17.4: コピーされた数量表は元の数量表とは独立したデータとして管理する
   * - 17.5: コピー中にエラーが発生した場合、不完全なコピーデータが残らないようにする
   * - 17.7: 元の数量表に写真が紐づけられている場合、コピー先でも同じ写真の紐づけを維持する
   *
   * @param id - コピー元の数量表ID
   * @param input - コピー先の名前
   * @param actorId - 実行ユーザーID
   * @returns コピーされた新しい数量表の情報
   * @throws QuantityTableNotFoundError コピー元が存在しない場合
   */
  async copy(
    id: string,
    input: CopyQuantityTableInput,
    actorId: string
  ): Promise<QuantityTableInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 元の数量表を全グループ・全項目含めて取得
      const sourceTable = await tx.quantityTable.findUnique({
        where: {
          id,
          deletedAt: null,
        },
        include: {
          groups: {
            orderBy: { displayOrder: 'asc' },
            include: {
              items: {
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      });

      // コピー元が存在しない場合はエラー
      if (!sourceTable) {
        throw new QuantityTableNotFoundError(id);
      }

      // 2. 新しい数量表を作成（ユーザー指定の名前で）
      const copiedTable = await tx.quantityTable.create({
        data: {
          projectId: sourceTable.projectId,
          name: input.name.trim(),
        },
      });

      // 3. 全グループを複製（displayOrder維持、surveyImageId維持）
      let totalItemCount = 0;

      for (const sourceGroup of sourceTable.groups) {
        const copiedGroup = await tx.quantityGroup.create({
          data: {
            quantityTableId: copiedTable.id,
            name: sourceGroup.name,
            surveyImageId: sourceGroup.surveyImageId,
            displayOrder: sourceGroup.displayOrder,
          },
        });

        // 4. 各グループ内の全項目を複製（全フィールド値・displayOrder維持）
        for (const sourceItem of sourceGroup.items) {
          await tx.quantityItem.create({
            data: {
              quantityGroupId: copiedGroup.id,
              majorCategory: sourceItem.majorCategory,
              middleCategory: sourceItem.middleCategory,
              minorCategory: sourceItem.minorCategory,
              customCategory: sourceItem.customCategory,
              workType: sourceItem.workType,
              name: sourceItem.name,
              specification: sourceItem.specification,
              unit: sourceItem.unit,
              calculationMethod: sourceItem.calculationMethod,
              calculationParams: sourceItem.calculationParams ?? undefined,
              adjustmentFactor: sourceItem.adjustmentFactor,
              roundingUnit: sourceItem.roundingUnit,
              quantity: sourceItem.quantity,
              remarks: sourceItem.remarks,
              displayOrder: sourceItem.displayOrder,
            },
          });
          totalItemCount++;
        }
      }

      // 5. 監査ログに記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_TABLE_COPIED',
        actorId,
        targetType: QUANTITY_TABLE_TARGET_TYPE,
        targetId: copiedTable.id,
        before: {
          sourceTableId: id,
          sourceName: sourceTable.name,
        },
        after: {
          name: copiedTable.name,
          projectId: copiedTable.projectId,
          groupCount: sourceTable.groups.length,
          itemCount: totalItemCount,
        },
      });

      return {
        id: copiedTable.id,
        projectId: copiedTable.projectId,
        name: copiedTable.name,
        groupCount: sourceTable.groups.length,
        itemCount: totalItemCount,
        createdAt: copiedTable.createdAt,
        updatedAt: copiedTable.updatedAt,
      };
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
        annotatedThumbnailPath: string | null;
        fileName: string;
        comment: string | null;
        annotation: { id: string; hasDrawnAnnotations: boolean | null } | null;
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
            hasAnnotations: g.surveyImage.annotation !== null,
            // 描画された注釈の有無（Requirement 20.2、Task 115.13）。
            // 回転のみの保存でも注釈レコードは残るため hasAnnotations とは一致しない。
            // 未算出（バックフィル未実施）のレコードは従来どおり注釈ありとして扱う。
            hasDrawnAnnotations: g.surveyImage.annotation
              ? (g.surveyImage.annotation.hasDrawnAnnotations ?? true)
              : false,
            annotatedThumbnailUrl: g.surveyImage.annotatedThumbnailPath
              ? `/api/storage/${g.surveyImage.annotatedThumbnailPath}`
              : null,
            comment: g.surveyImage.comment ?? null,
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
