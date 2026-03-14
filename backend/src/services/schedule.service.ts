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
 * @module services/schedule
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  BulkSaveScheduleItemsInput,
  ScheduleListQuery,
} from '../schemas/schedule.schema.js';
import {
  ScheduleNotFoundError,
  ScheduleConflictError,
  ScheduleValidationError,
} from '../errors/scheduleError.js';

/**
 * ScheduleService依存関係
 */
export interface ScheduleServiceDependencies {
  prisma: PrismaClient;
}

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

  constructor(deps: ScheduleServiceDependencies) {
    this.prisma = deps.prisma;
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
   */
  async create(projectId: string, data: CreateScheduleInput): Promise<ScheduleDetail> {
    // 数量表指定時のバリデーション
    if (data.quantityTableId) {
      const quantityTable = await this.prisma.quantityTable.findUnique({
        where: { id: data.quantityTableId },
      });

      if (!quantityTable || quantityTable.deletedAt) {
        throw new ScheduleValidationError('指定された数量表が見つかりません');
      }

      if (quantityTable.projectId !== projectId) {
        throw new ScheduleValidationError('指定された数量表は同一プロジェクトに属していません');
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
    if (data.quantityTableId) {
      const quantityItems = await this.prisma.quantityItem.findMany({
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
}
