/**
 * @fileoverview 工程表サービス
 *
 * 工程表のCRUD操作、数量表連携、バルク保存のビジネスロジックを担当します。
 *
 * Requirements:
 * - 1.1: 工程表一覧表示
 * - 1.3: 工程表保存
 * - 1.4: 工程表詳細表示
 * - 1.5: 工程表削除
 * - 2.2: 数量表なしで空の工程表作成
 * - 2.3: 数量表指定時の項目自動取得
 * - 3.1, 3.2: バルク保存（全項目一括更新）
 * - 5.3, 5.4: 並び順の永続化・復元
 * - 9.2: 出力対象チェックボックスの初期値ON
 * - 9.5: 出力設定の永続化
 * - 10.4, 11.4: ラベル文字・詳細文字の永続化
 *
 * Design Reference: design.md - ScheduleService セクション
 *
 * 案件の閲覧範囲（construction-schedule の Requirement 13.4、タスク22.1）: 工程表の作成の要求が指す数量表が
 * 経路のプロジェクトに属さなければ、数量表の不在と同じ 422 にして工程表を作成しない。数量表の案件が実在し
 * 実行者の閲覧範囲外なら、user-authentication の要件39.7 に従い PROJECT_SCOPE_DENIED を処理の後に記録する。
 *
 * @module services/schedule
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  BulkSaveScheduleItemsInput,
  ScheduleListQuery,
} from '../schemas/schedule.schema.js';
import { MAX_SCHEDULE_ITEMS, SCHEDULE_VALIDATION_MESSAGES } from '../schemas/schedule.schema.js';
import {
  ScheduleNotFoundError,
  ScheduleConflictError,
  ScheduleValidationError,
  ScheduleItemLimitExceededError,
} from '../errors/scheduleError.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { AuditLogService } from './audit-log.service.js';
import { getSharedProjectScopeService, type ProjectScopeService } from './project-scope.service.js';
import {
  withSurveyScopeDenialRecording,
  type ProjectScopeDenialContext,
} from './project-scope-denial.service.js';

/**
 * ScheduleService依存関係
 */
export interface ScheduleServiceDependencies {
  prisma: PrismaClient;
  /**
   * 範囲外の拒否（PROJECT_SCOPE_DENIED）の記録に用いる監査ログ（任意。タスク22.1、Requirement 13.4）。
   * 未指定の場合は `prisma` で組み立てる。
   */
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
  /**
   * 案件の閲覧範囲の判定（任意。タスク22.1、Requirement 13.4）。
   * 作成の要求が指す他のプロジェクトの数量表の案件が範囲外かを判定し、範囲外の拒否を記録するために用いる。
   * 未指定の場合は user-authentication の共有のインスタンス（{@link getSharedProjectScopeService}）で判定する。
   */
  projectScope?: Pick<ProjectScopeService, 'evaluateProjectAccess'>;
}

/**
 * 工程表の作成の要求が指す数量表が見つからない場合の本文。
 * 経路のプロジェクトに属さない数量表も同じ本文にする（Requirement 13.4）
 */
const QUANTITY_TABLE_NOT_FOUND_MESSAGE = '指定された数量表が見つかりません';

/**
 * 工程表一覧アイテム
 */
export interface ScheduleListItem {
  id: string;
  name: string;
  quantityTableName: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工程表項目詳細
 */
export interface ScheduleItemDetail {
  id: string;
  sourceType: string;
  sourceQuantityItemId: string | null;
  itemName: string;
  labelText: string;
  detailText: string;
  startDate: string | null;
  duration: number | null;
  displayOrder: number;
  isExportTarget: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工程表詳細
 */
export interface ScheduleDetail {
  id: string;
  projectId: string;
  name: string;
  quantityTableId: string | null;
  quantityTableName: string | null;
  items: ScheduleItemDetail[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * リレーション展開のinclude定義（詳細取得時）
 */
const DETAIL_INCLUDE = {
  items: {
    orderBy: { displayOrder: 'asc' as const },
  },
  quantityTable: {
    select: { name: true },
  },
} as const;

/**
 * 日時のISO文字列変換ヘルパー
 */
function toISOString(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  return String(val);
}

/**
 * 日付のYYYY-MM-DD形式変換ヘルパー
 */
function toDateString(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]!;
  }
  return String(val);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScheduleItemDetail(record: any): ScheduleItemDetail {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceQuantityItemId: record.sourceQuantityItemId,
    itemName: record.itemName,
    labelText: record.labelText,
    detailText: record.detailText,
    startDate: toDateString(record.startDate),
    duration: record.duration,
    displayOrder: record.displayOrder,
    isExportTarget: record.isExportTarget,
    createdAt: toISOString(record.createdAt),
    updatedAt: toISOString(record.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScheduleDetail(record: any): ScheduleDetail {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    quantityTableId: record.quantityTableId,
    quantityTableName: record.quantityTable?.name ?? null,
    items: (record.items || []).map(toScheduleItemDetail),
    version: record.version,
    createdAt: toISOString(record.createdAt),
    updatedAt: toISOString(record.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScheduleListItem(record: any): ScheduleListItem {
  return {
    id: record.id,
    name: record.name,
    quantityTableName: record.quantityTable?.name ?? null,
    itemCount: record._count?.items ?? 0,
    createdAt: toISOString(record.createdAt),
    updatedAt: toISOString(record.updatedAt),
  };
}

/**
 * 工程表サービス
 *
 * 工程表のCRUD操作、数量表連携、バルク保存を担当します。
 */
export class ScheduleService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: Pick<IAuditLogService, 'createLog'>;
  private readonly projectScope: Pick<ProjectScopeService, 'evaluateProjectAccess'>;

  constructor(deps: ScheduleServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService ?? new AuditLogService({ prisma: deps.prisma });
    // 共有のインスタンスは判定の時に引く（構築時に読まない）
    this.projectScope = deps.projectScope ?? {
      evaluateProjectAccess: (userId, projectId) =>
        getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
    };
  }

  /**
   * プロジェクトスコープの工程表一覧取得
   *
   * Requirements:
   * - 1.1: 工程表一覧表示（ページネーション、ソート対応、論理削除除外）
   */
  async findByProject(
    projectId: string,
    query: ScheduleListQuery
  ): Promise<{ schedules: ScheduleListItem[]; total: number }> {
    const { page, limit, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      deletedAt: null,
    };

    const [schedules, total] = await Promise.all([
      this.prisma.constructionSchedule.findMany({
        where,
        include: {
          quantityTable: {
            select: { name: true },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.constructionSchedule.count({ where }),
    ]);

    return {
      schedules: schedules.map(toScheduleListItem),
      total,
    };
  }

  /**
   * 工程表詳細取得
   *
   * Requirements:
   * - 1.4: 工程表詳細表示（項目一覧をdisplayOrder順で含む）
   * - 5.4: 並び順の復元
   */
  async findById(id: string): Promise<ScheduleDetail | null> {
    const record = await this.prisma.constructionSchedule.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!record || record.deletedAt) {
      return null;
    }

    return toScheduleDetail(record);
  }

  /**
   * 工程表作成
   *
   * Requirements:
   * - 1.3: 工程表保存
   * - 2.2: 数量表なしで空の工程表作成
   * - 2.3: 数量表指定時の項目自動取得（スナップショットコピー）
   * - 9.2: 出力対象チェックボックスの初期値ON
   *
   * 数量表の項目が {@link MAX_SCHEDULE_ITEMS} 件を超える場合は、何も書き込まずに
   * {@link ScheduleItemLimitExceededError}（400）で拒む（Req 12.1）。
   *
   * 数量表が存在しない・論理削除済み・作成先のプロジェクトに属さない場合は、いずれも同じ本文の
   * {@link ScheduleValidationError}（422）で拒み、工程表も工程項目も作成しない（Requirement 13.4）。
   * 作成先のプロジェクトに属さない数量表は、論理削除済みかどうかに関わらず数量表の案件を判定し、範囲外の
   * ときだけ範囲外の拒否として記録する（Requirement 13.10）。
   *
   * @param actorId - 実行者ID（作成先のプロジェクトに属さない数量表の案件が範囲外かの判定に用いる）
   * @param scopeDenialContext - 範囲外の拒否の記録に添える要求の識別（経路が要求から切り出して渡す）
   */
  async create(
    projectId: string,
    data: CreateScheduleInput,
    actorId?: string,
    scopeDenialContext?: ProjectScopeDenialContext
  ): Promise<ScheduleDetail> {
    if (actorId === undefined) {
      return this.createWithin(projectId, data, undefined, new Set<string>());
    }
    // 数量表の所属の照合（13.4）で範囲外とした案件は、処理の後に PROJECT_SCOPE_DENIED として記録する
    // （user-authentication の要件39.7）
    return withSurveyScopeDenialRecording(
      actorId,
      scopeDenialContext,
      this.auditLogService,
      (deniedProjectIds) => this.createWithin(projectId, data, actorId, deniedProjectIds)
    );
  }

  /** {@link create} の本体。数量表の案件を範囲外と判定したら `deniedProjectIds` へ入れる */
  private async createWithin(
    projectId: string,
    data: CreateScheduleInput,
    actorId: string | undefined,
    deniedProjectIds: Set<string>
  ): Promise<ScheduleDetail> {
    // 数量表指定時: 数量表を検証し、写す項目を工程表の作成より前に取得する
    let quantityItems: Array<{ id: string; name: string }> = [];
    if (data.quantityTableId) {
      const quantityTable = await this.prisma.quantityTable.findUnique({
        where: { id: data.quantityTableId },
      });

      // 数量表の照合の順（design.md の「2026-10-30 の追加」章の「決定」の「数量表の照合の順」）。3 通りとも
      // 13.4 と同じ 422 と同じ本文で拒み、数量項目を読まず工程表も工程項目も作成しない。
      // (1) 行が無い: 記録しない
      if (!quantityTable) {
        throw new ScheduleValidationError(QUANTITY_TABLE_NOT_FOUND_MESSAGE);
      }

      // (2) 作成先のプロジェクトに属さない: 論理削除済みかどうかに関わらず数量表の案件を判定する（13.4・
      // 13.10）。範囲の内外で応答を変えると他のプロジェクトの数量表の実在を推測させるため、範囲の内外を
      // 問わず不在と同じ応答にする。範囲外（案件は実在する）のときだけ、範囲外の拒否として記録する
      // （user-authentication の要件39.7・39.8）
      if (quantityTable.projectId !== projectId) {
        if (actorId !== undefined) {
          const decision = await this.projectScope.evaluateProjectAccess(
            actorId,
            quantityTable.projectId
          );
          if (decision === 'out_of_scope') {
            deniedProjectIds.add(quantityTable.projectId);
          }
        }
        throw new ScheduleValidationError(QUANTITY_TABLE_NOT_FOUND_MESSAGE);
      }

      // (3) 作成先のプロジェクトに属し論理削除済み: 記録しない（13.4・13.10）
      if (quantityTable.deletedAt) {
        throw new ScheduleValidationError(QUANTITY_TABLE_NOT_FOUND_MESSAGE);
      }

      quantityItems = await this.prisma.quantityItem.findMany({
        where: {
          quantityGroup: {
            quantityTableId: data.quantityTableId,
          },
        },
        include: {
          quantityGroup: {
            select: { displayOrder: true },
          },
        },
        orderBy: [{ quantityGroup: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
      });

      // 1つの工程表あたりの上限を超える数量表からは作成しない（Req 12.1）。
      // 書き込みより前に拒むため、工程表も項目も作られない
      if (quantityItems.length > MAX_SCHEDULE_ITEMS) {
        throw new ScheduleItemLimitExceededError(
          `${SCHEDULE_VALIDATION_MESSAGES.QUANTITY_TABLE_ITEMS_MAX_COUNT}（${quantityItems.length}件）`,
          { itemCount: quantityItems.length, maxItemCount: MAX_SCHEDULE_ITEMS }
        );
      }
    }

    // 工程表作成
    const schedule = await this.prisma.constructionSchedule.create({
      data: {
        projectId,
        name: data.name,
        quantityTableId: data.quantityTableId ?? null,
        version: 0,
      },
    });

    // 数量表指定時: QuantityItemからScheduleItemを生成
    if (quantityItems.length > 0) {
      await this.prisma.scheduleItem.createMany({
        data: quantityItems.map((qi, index) => ({
          scheduleId: schedule.id,
          sourceType: 'QUANTITY_TABLE',
          sourceQuantityItemId: qi.id,
          itemName: qi.name,
          labelText: '',
          detailText: '',
          startDate: null,
          duration: null,
          displayOrder: index,
          isExportTarget: true,
        })),
      });
    }

    // 作成後の詳細を取得して返却
    const created = await this.prisma.constructionSchedule.findUnique({
      where: { id: schedule.id },
      include: DETAIL_INCLUDE,
    });

    return toScheduleDetail(created);
  }

  /**
   * 工程表更新
   *
   * Requirements:
   * - 1.3: 工程表保存（名称変更）
   * - 楽観的排他制御（versionフィールド）
   */
  async update(id: string, data: UpdateScheduleInput): Promise<ScheduleDetail> {
    const existing = await this.prisma.constructionSchedule.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ScheduleNotFoundError();
    }

    if (existing.version !== data.version) {
      throw new ScheduleConflictError();
    }

    const record = await this.prisma.constructionSchedule.update({
      where: { id },
      data: {
        name: data.name,
        version: { increment: 1 },
      },
      include: DETAIL_INCLUDE,
    });

    return toScheduleDetail(record);
  }

  /**
   * バルク保存（全項目一括更新）
   *
   * Requirements:
   * - 3.1, 3.2: 着工日・日数の保存
   * - 4.1, 4.2, 4.3, 4.4: 任意項目の管理
   * - 5.3: 並び順の永続化
   * - 9.5: 出力設定の永続化
   * - 10.4: ラベル文字の永続化
   * - 11.4: 詳細文字の永続化
   *
   * 動作仕様:
   * - id=null の項目はサーバー側で新規IDを採番して作成
   * - 既存IDの項目は更新
   * - リクエストに含まれない既存項目は削除（差分削除方式）
   * - トランザクション内でバッチ処理
   */
  async bulkSaveItems(
    id: string,
    data: BulkSaveScheduleItemsInput
  ): Promise<{ updatedItemCount: number; updatedAt: string }> {
    // 既存レコードの取得と検証
    const existing = await this.prisma.constructionSchedule.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing || existing.deletedAt) {
      throw new ScheduleNotFoundError();
    }

    // 楽観的排他制御: version検証
    if (existing.version !== data.version) {
      throw new ScheduleConflictError();
    }

    // トランザクション内でバッチ処理
    const result = await this.prisma.$transaction(async (tx) => {
      // 全既存項目を削除（差分削除方式: 全削除→再作成）
      await tx.scheduleItem.deleteMany({
        where: { scheduleId: id },
      });

      // 新しい項目を作成
      for (const item of data.items) {
        await tx.scheduleItem.create({
          data: {
            scheduleId: id,
            itemName: item.itemName,
            labelText: item.labelText,
            detailText: item.detailText,
            startDate: item.startDate ? new Date(item.startDate) : null,
            duration: item.duration,
            displayOrder: item.displayOrder,
            isExportTarget: item.isExportTarget,
          },
        });
      }

      // バージョンをインクリメント
      const updated = await tx.constructionSchedule.update({
        where: { id },
        data: {
          version: { increment: 1 },
        },
      });

      return {
        updatedItemCount: data.items.length,
        updatedAt: toISOString(updated.updatedAt),
      };
    });

    return result;
  }

  /**
   * 工程表論理削除
   *
   * Requirements:
   * - 1.5: 工程表削除
   */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.constructionSchedule.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ScheduleNotFoundError();
    }

    await this.prisma.constructionSchedule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * プロジェクトの直近の工程表と総数を取得する
   *
   * detail-summary APIでの一括取得用メソッド。
   * ContractService.findLatestByProjectId と同じパターンを使用。
   *
   * Requirements (project-management):
   * - 39.1: detail-summary APIのレスポンスに工程表セクションデータ（schedules）を含める
   * - 39.2: 工程表セクションデータに総数（totalCount）と直近の工程表（latestSchedules）を含める
   * - 39.3: 直近の工程表データに工程表ID、工程表名、更新日時、工程項目数を含める
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト: 3）
   * @returns 工程表サマリー（totalCount, latestSchedules）
   */
  async findLatestByProjectId(
    projectId: string,
    limit: number = 3
  ): Promise<{
    totalCount: number;
    latestSchedules: Array<{
      id: string;
      name: string;
      updatedAt: string;
      itemCount: number;
    }>;
  }> {
    const where = {
      projectId,
      deletedAt: null,
    };

    const [schedules, totalCount] = await Promise.all([
      this.prisma.constructionSchedule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          updatedAt: true,
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.constructionSchedule.count({ where }),
    ]);

    return {
      totalCount,
      latestSchedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt.toISOString(),
        itemCount: s._count.items,
      })),
    };
  }
}
