/**
 * @fileoverview 数量項目サービス
 *
 * 数量項目のCRUD操作を担当します。
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 *
 * @module services/quantity-item
 */

import {
  Prisma,
  type PrismaClient,
  type CalculationMethod as PrismaCalculationMethod,
} from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateQuantityItemInput,
  UpdateQuantityItemInput,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityGroupNotFoundError,
  QuantityItemNotFoundError,
  QuantityItemConflictError,
  QuantityTableValidationError,
} from '../errors/quantityTableError.js';
import { QUANTITY_ITEM_TARGET_TYPE } from '../types/audit-log.types.js';
import Decimal from 'decimal.js';

/**
 * QuantityItemService依存関係
 */
export interface QuantityItemServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 数量項目情報
 */
export interface QuantityItemInfo {
  id: string;
  quantityGroupId: string;
  majorCategory: string;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  calculationMethod: string;
  calculationParams: Record<string, unknown> | null;
  adjustmentFactor: number;
  roundingUnit: number;
  quantity: number;
  remarks: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 表示順序更新入力
 */
export interface ItemDisplayOrderUpdate {
  id: string;
  displayOrder: number;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 数量項目サービス
 *
 * 数量項目のCRUD操作を担当します。
 */
export class QuantityItemService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: QuantityItemServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 数量項目作成
   *
   * トランザクション内で以下を実行:
   * 1. 数量グループ存在確認
   * 2. 数量項目作成 (Requirements: 5.1, 5.2)
   * 3. 監査ログの記録
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された数量項目情報
   * @throws QuantityGroupNotFoundError 数量グループが存在しない、または論理削除済みの場合
   */
  async create(input: CreateQuantityItemInput, actorId: string): Promise<QuantityItemInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量グループ存在確認
      await this.validateQuantityGroupExists(tx, input.quantityGroupId);

      // 2. 次の表示順序を取得
      const maxDisplayOrder = await tx.quantityItem.count({
        where: { quantityGroupId: input.quantityGroupId },
      });

      // 3. 数量項目作成
      const quantityItem = await tx.quantityItem.create({
        data: {
          quantityGroupId: input.quantityGroupId,
          majorCategory: input.majorCategory.trim(),
          middleCategory: input.middleCategory?.trim() ?? null,
          minorCategory: input.minorCategory?.trim() ?? null,
          customCategory: input.customCategory?.trim() ?? null,
          workType: input.workType.trim(),
          name: input.name.trim(),
          specification: input.specification?.trim() ?? null,
          unit: input.unit.trim(),
          calculationMethod: (input.calculationMethod ?? 'STANDARD') as PrismaCalculationMethod,
          calculationParams: input.calculationParams ?? Prisma.JsonNull,
          adjustmentFactor: new Decimal(input.adjustmentFactor ?? 1.0),
          roundingUnit: new Decimal(input.roundingUnit ?? 0.01),
          quantity: new Decimal(input.quantity),
          remarks: input.remarks ?? null,
          displayOrder: input.displayOrder ?? maxDisplayOrder,
        },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_CREATED',
        actorId,
        targetType: QUANTITY_ITEM_TARGET_TYPE,
        targetId: quantityItem.id,
        before: null,
        after: {
          quantityGroupId: quantityItem.quantityGroupId,
          majorCategory: quantityItem.majorCategory,
          workType: quantityItem.workType,
          name: quantityItem.name,
          unit: quantityItem.unit,
          quantity: quantityItem.quantity.toString(),
        },
      });

      return this.toQuantityItemInfo(quantityItem);
    });
  }

  /**
   * 数量グループ存在確認
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityGroupId - 数量グループID
   * @throws QuantityGroupNotFoundError 数量グループが存在しない、または数量表が論理削除済みの場合
   */
  private async validateQuantityGroupExists(
    tx: PrismaTransactionClient,
    quantityGroupId: string
  ): Promise<void> {
    const quantityGroup = await tx.quantityGroup.findUnique({
      where: { id: quantityGroupId },
      select: {
        id: true,
        quantityTable: {
          select: { deletedAt: true },
        },
      },
    });

    if (!quantityGroup || quantityGroup.quantityTable.deletedAt !== null) {
      throw new QuantityGroupNotFoundError(quantityGroupId);
    }
  }

  /**
   * 数量項目詳細取得
   *
   * @param id - 数量項目ID
   * @returns 数量項目情報、存在しない場合はnull
   */
  async findById(id: string): Promise<QuantityItemInfo | null> {
    const quantityItem = await this.prisma.quantityItem.findUnique({
      where: { id },
      include: {
        quantityGroup: {
          select: {
            id: true,
            quantityTable: {
              select: { deletedAt: true },
            },
          },
        },
      },
    });

    if (!quantityItem || quantityItem.quantityGroup.quantityTable.deletedAt !== null) {
      return null;
    }

    return this.toQuantityItemInfo(quantityItem);
  }

  /**
   * グループIDによる項目一覧取得
   *
   * 指定されたグループに属する項目の一覧を表示順序で取得する。
   *
   * @param groupId - 数量グループID
   * @returns 項目一覧
   */
  async findByGroupId(groupId: string): Promise<QuantityItemInfo[]> {
    const items = await this.prisma.quantityItem.findMany({
      where: {
        quantityGroupId: groupId,
        quantityGroup: {
          quantityTable: { deletedAt: null },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return items.map((item) => this.toQuantityItemInfo(item));
  }

  /**
   * 数量項目更新
   *
   * 楽観的排他制御を実装。
   *
   * @param id - 数量項目ID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された数量項目情報
   * @throws QuantityItemNotFoundError 数量項目が存在しない場合
   * @throws QuantityItemConflictError 楽観的排他制御エラー
   */
  async update(
    id: string,
    input: UpdateQuantityItemInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<QuantityItemInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量項目の存在確認
      const quantityItem = await tx.quantityItem.findUnique({
        where: { id },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      if (!quantityItem || quantityItem.quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityItemNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較
      if (quantityItem.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new QuantityItemConflictError(
          '数量項目は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: quantityItem.updatedAt.toISOString(),
          }
        );
      }

      // 2. 更新データの構築
      const updateData: Record<string, unknown> = {};

      if (input.majorCategory !== undefined) {
        updateData.majorCategory = input.majorCategory.trim();
      }
      if (input.middleCategory !== undefined) {
        updateData.middleCategory = input.middleCategory?.trim() ?? null;
      }
      if (input.minorCategory !== undefined) {
        updateData.minorCategory = input.minorCategory?.trim() ?? null;
      }
      if (input.customCategory !== undefined) {
        updateData.customCategory = input.customCategory?.trim() ?? null;
      }
      if (input.workType !== undefined) {
        updateData.workType = input.workType.trim();
      }
      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }
      if (input.specification !== undefined) {
        updateData.specification = input.specification?.trim() ?? null;
      }
      if (input.unit !== undefined) {
        updateData.unit = input.unit.trim();
      }
      if (input.calculationMethod !== undefined) {
        updateData.calculationMethod = input.calculationMethod as PrismaCalculationMethod;
      }
      if (input.calculationParams !== undefined) {
        updateData.calculationParams = input.calculationParams;
      }
      if (input.adjustmentFactor !== undefined) {
        updateData.adjustmentFactor = new Decimal(input.adjustmentFactor);
      }
      if (input.roundingUnit !== undefined) {
        updateData.roundingUnit = new Decimal(input.roundingUnit);
      }
      if (input.quantity !== undefined) {
        updateData.quantity = new Decimal(input.quantity);
      }
      if (input.remarks !== undefined) {
        updateData.remarks = input.remarks;
      }
      if (input.displayOrder !== undefined) {
        updateData.displayOrder = input.displayOrder;
      }

      // 3. 数量項目更新
      const updatedItem = await tx.quantityItem.update({
        where: { id },
        data: updateData,
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_UPDATED',
        actorId,
        targetType: QUANTITY_ITEM_TARGET_TYPE,
        targetId: id,
        before: {
          majorCategory: quantityItem.majorCategory,
          workType: quantityItem.workType,
          name: quantityItem.name,
          unit: quantityItem.unit,
          quantity: quantityItem.quantity.toString(),
        },
        after: {
          majorCategory: updatedItem.majorCategory,
          workType: updatedItem.workType,
          name: updatedItem.name,
          unit: updatedItem.unit,
          quantity: updatedItem.quantity.toString(),
        },
      });

      return this.toQuantityItemInfo(updatedItem);
    });
  }

  /**
   * 数量項目削除
   *
   * @param id - 数量項目ID
   * @param actorId - 実行者ID
   * @throws QuantityItemNotFoundError 数量項目が存在しない場合
   */
  async delete(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 数量項目の存在確認
      const quantityItem = await tx.quantityItem.findUnique({
        where: { id },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      if (!quantityItem || quantityItem.quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityItemNotFoundError(id);
      }

      // 2. 数量項目削除
      await tx.quantityItem.delete({
        where: { id },
      });

      // 3. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_DELETED',
        actorId,
        targetType: QUANTITY_ITEM_TARGET_TYPE,
        targetId: id,
        before: {
          quantityGroupId: quantityItem.quantityGroupId,
          majorCategory: quantityItem.majorCategory,
          workType: quantityItem.workType,
          name: quantityItem.name,
          unit: quantityItem.unit,
          quantity: quantityItem.quantity.toString(),
        },
        after: null,
      });
    });
  }

  /**
   * 表示順序一括更新
   *
   * @param groupId - 数量グループID
   * @param orderUpdates - 表示順序更新リスト
   * @param actorId - 実行者ID
   */
  async updateDisplayOrder(
    groupId: string,
    orderUpdates: ItemDisplayOrderUpdate[],
    actorId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 数量グループ存在確認
      await this.validateQuantityGroupExists(tx, groupId);

      // 2. 項目が同一グループに属しているか確認
      const itemIds = orderUpdates.map((u) => u.id);
      const items = await tx.quantityItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, quantityGroupId: true },
      });

      const invalidItems = items.filter((i) => i.quantityGroupId !== groupId);
      if (invalidItems.length > 0) {
        throw new QuantityTableValidationError('異なる数量グループの項目が含まれています');
      }

      // 3. 各項目の表示順序を更新
      for (const update of orderUpdates) {
        await tx.quantityItem.update({
          where: { id: update.id },
          data: { displayOrder: update.displayOrder },
        });
      }

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_UPDATED',
        actorId,
        targetType: 'QuantityGroup',
        targetId: groupId,
        before: null,
        after: {
          action: 'REORDER_ITEMS',
          updates: orderUpdates as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * 数量項目のコピー (Requirements: 6.1)
   *
   * 指定された項目を複製し、同一グループの末尾に配置する。
   *
   * @param itemId - コピー元の数量項目ID
   * @param actorId - 実行者ID
   * @returns コピーされた新しい数量項目情報
   * @throws QuantityItemNotFoundError 数量項目が存在しない場合
   */
  async copy(itemId: string, actorId: string): Promise<QuantityItemInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. コピー元の項目を取得
      const sourceItem = await tx.quantityItem.findUnique({
        where: { id: itemId },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      if (!sourceItem || sourceItem.quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityItemNotFoundError(itemId);
      }

      // 2. 次の表示順序を取得
      const maxDisplayOrder = await tx.quantityItem.count({
        where: { quantityGroupId: sourceItem.quantityGroupId },
      });

      // 3. 項目を複製
      const copiedItem = await tx.quantityItem.create({
        data: {
          quantityGroupId: sourceItem.quantityGroupId,
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
          displayOrder: maxDisplayOrder,
        },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_COPIED',
        actorId,
        targetType: QUANTITY_ITEM_TARGET_TYPE,
        targetId: copiedItem.id,
        before: null,
        after: {
          sourceItemId: itemId,
          quantityGroupId: copiedItem.quantityGroupId,
          majorCategory: copiedItem.majorCategory,
          workType: copiedItem.workType,
          name: copiedItem.name,
        },
      });

      return this.toQuantityItemInfo(copiedItem);
    });
  }

  /**
   * 数量項目の移動 (Requirements: 6.2, 6.3)
   *
   * 項目を指定されたグループ・位置に移動する。
   * 異なる数量表のグループへの移動は禁止。
   *
   * @param itemId - 移動対象の数量項目ID
   * @param targetGroupId - 移動先のグループID
   * @param displayOrder - 移動先での表示順序
   * @param actorId - 実行者ID
   * @returns 移動後の数量項目情報
   * @throws QuantityItemNotFoundError 数量項目が存在しない場合
   * @throws QuantityTableValidationError 異なる数量表への移動を試みた場合
   */
  async move(
    itemId: string,
    targetGroupId: string,
    displayOrder: number,
    actorId: string
  ): Promise<QuantityItemInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 移動対象の項目を取得
      const sourceItem = await tx.quantityItem.findUnique({
        where: { id: itemId },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTableId: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      if (!sourceItem || sourceItem.quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityItemNotFoundError(itemId);
      }

      const sourceGroupId = sourceItem.quantityGroupId;
      const sourceTableId = sourceItem.quantityGroup.quantityTableId;

      // 2. 同一グループ内の移動の場合
      if (sourceGroupId === targetGroupId) {
        const movedItem = await tx.quantityItem.update({
          where: { id: itemId },
          data: { displayOrder },
        });

        await this.auditLogService.createLog({
          action: 'QUANTITY_ITEM_MOVED',
          actorId,
          targetType: QUANTITY_ITEM_TARGET_TYPE,
          targetId: itemId,
          before: {
            quantityGroupId: sourceGroupId,
            displayOrder: sourceItem.displayOrder,
          },
          after: {
            quantityGroupId: targetGroupId,
            displayOrder,
          },
        });

        return this.toQuantityItemInfo(movedItem);
      }

      // 3. 別グループへの移動: 移動先グループの検証
      const targetGroup = await tx.quantityGroup.findUnique({
        where: { id: targetGroupId },
        select: {
          id: true,
          quantityTableId: true,
          quantityTable: {
            select: { deletedAt: true },
          },
        },
      });

      if (!targetGroup || targetGroup.quantityTable.deletedAt !== null) {
        throw new QuantityGroupNotFoundError(targetGroupId);
      }

      // 4. 異なる数量表への移動を禁止
      if (targetGroup.quantityTableId !== sourceTableId) {
        throw new QuantityTableValidationError('異なる数量表のグループへは移動できません');
      }

      // 5. 項目を移動
      const movedItem = await tx.quantityItem.update({
        where: { id: itemId },
        data: {
          quantityGroupId: targetGroupId,
          displayOrder,
        },
      });

      // 6. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_ITEM_MOVED',
        actorId,
        targetType: QUANTITY_ITEM_TARGET_TYPE,
        targetId: itemId,
        before: {
          quantityGroupId: sourceGroupId,
          displayOrder: sourceItem.displayOrder,
        },
        after: {
          quantityGroupId: targetGroupId,
          displayOrder,
        },
      });

      return this.toQuantityItemInfo(movedItem);
    });
  }

  /**
   * 複数項目の一括コピー (Requirements: 6.4)
   *
   * 指定された複数項目を一括でコピーする。
   * 各項目はその属するグループ内でコピーされる。
   *
   * @param itemIds - コピー対象の数量項目IDリスト
   * @param actorId - 実行者ID
   * @returns コピーされた数量項目情報のリスト
   */
  async bulkCopy(itemIds: string[], actorId: string): Promise<QuantityItemInfo[]> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. コピー対象の項目を取得
      const sourceItems = await tx.quantityItem.findMany({
        where: { id: { in: itemIds } },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      const copiedItems: QuantityItemInfo[] = [];

      // 2. 各項目をコピー
      for (const sourceItem of sourceItems) {
        if (sourceItem.quantityGroup.quantityTable.deletedAt !== null) {
          continue;
        }

        // 次の表示順序を取得
        const currentCount = await tx.quantityItem.count({
          where: { quantityGroupId: sourceItem.quantityGroupId },
        });

        const copiedItem = await tx.quantityItem.create({
          data: {
            quantityGroupId: sourceItem.quantityGroupId,
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
            displayOrder: currentCount,
          },
        });

        // 監査ログの記録
        await this.auditLogService.createLog({
          action: 'QUANTITY_ITEM_COPIED',
          actorId,
          targetType: QUANTITY_ITEM_TARGET_TYPE,
          targetId: copiedItem.id,
          before: null,
          after: {
            sourceItemId: sourceItem.id,
            quantityGroupId: copiedItem.quantityGroupId,
            majorCategory: copiedItem.majorCategory,
            workType: copiedItem.workType,
            name: copiedItem.name,
          },
        });

        copiedItems.push(this.toQuantityItemInfo(copiedItem));
      }

      return copiedItems;
    });
  }

  /**
   * 複数項目の一括移動 (Requirements: 6.4)
   *
   * 指定された複数項目を一括で指定グループに移動する。
   * すべての項目が同一数量表内であることが必要。
   *
   * @param itemIds - 移動対象の数量項目IDリスト
   * @param targetGroupId - 移動先のグループID
   * @param actorId - 実行者ID
   * @throws QuantityGroupNotFoundError 移動先グループが存在しない場合
   * @throws QuantityTableValidationError 異なる数量表の項目が含まれる場合
   */
  async bulkMove(itemIds: string[], targetGroupId: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 移動先グループの検証
      const targetGroup = await tx.quantityGroup.findUnique({
        where: { id: targetGroupId },
        select: {
          id: true,
          quantityTableId: true,
          quantityTable: {
            select: { deletedAt: true },
          },
        },
      });

      if (!targetGroup || targetGroup.quantityTable.deletedAt !== null) {
        throw new QuantityGroupNotFoundError(targetGroupId);
      }

      // 2. 移動対象の項目を取得
      const sourceItems = await tx.quantityItem.findMany({
        where: { id: { in: itemIds } },
        include: {
          quantityGroup: {
            select: {
              id: true,
              quantityTableId: true,
              quantityTable: {
                select: { deletedAt: true },
              },
            },
          },
        },
      });

      // 3. すべての項目が同一数量表であることを確認
      for (const item of sourceItems) {
        if (item.quantityGroup.quantityTableId !== targetGroup.quantityTableId) {
          throw new QuantityTableValidationError('異なる数量表のグループへは移動できません');
        }
      }

      // 4. 現在の移動先グループの項目数を取得
      let currentDisplayOrder = await tx.quantityItem.count({
        where: { quantityGroupId: targetGroupId },
      });

      // 5. 各項目を移動
      for (const item of sourceItems) {
        await tx.quantityItem.update({
          where: { id: item.id },
          data: {
            quantityGroupId: targetGroupId,
            displayOrder: currentDisplayOrder++,
          },
        });

        // 監査ログの記録
        await this.auditLogService.createLog({
          action: 'QUANTITY_ITEM_MOVED',
          actorId,
          targetType: QUANTITY_ITEM_TARGET_TYPE,
          targetId: item.id,
          before: {
            quantityGroupId: item.quantityGroupId,
            displayOrder: item.displayOrder,
          },
          after: {
            quantityGroupId: targetGroupId,
            displayOrder: currentDisplayOrder - 1,
          },
        });
      }
    });
  }

  /**
   * データベースの結果をQuantityItemInfoに変換
   */
  private toQuantityItemInfo(quantityItem: {
    id: string;
    quantityGroupId: string;
    majorCategory: string;
    middleCategory: string | null;
    minorCategory: string | null;
    customCategory: string | null;
    workType: string;
    name: string;
    specification: string | null;
    unit: string;
    calculationMethod: string;
    calculationParams: unknown;
    adjustmentFactor: { toString(): string } | number;
    roundingUnit: { toString(): string } | number;
    quantity: { toString(): string } | number;
    remarks: string | null;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): QuantityItemInfo {
    return {
      id: quantityItem.id,
      quantityGroupId: quantityItem.quantityGroupId,
      majorCategory: quantityItem.majorCategory,
      middleCategory: quantityItem.middleCategory,
      minorCategory: quantityItem.minorCategory,
      customCategory: quantityItem.customCategory,
      workType: quantityItem.workType,
      name: quantityItem.name,
      specification: quantityItem.specification,
      unit: quantityItem.unit,
      calculationMethod: quantityItem.calculationMethod,
      calculationParams: quantityItem.calculationParams as Record<string, unknown> | null,
      adjustmentFactor:
        typeof quantityItem.adjustmentFactor === 'number'
          ? quantityItem.adjustmentFactor
          : parseFloat(quantityItem.adjustmentFactor.toString()),
      roundingUnit:
        typeof quantityItem.roundingUnit === 'number'
          ? quantityItem.roundingUnit
          : parseFloat(quantityItem.roundingUnit.toString()),
      quantity:
        typeof quantityItem.quantity === 'number'
          ? quantityItem.quantity
          : parseFloat(quantityItem.quantity.toString()),
      remarks: quantityItem.remarks,
      displayOrder: quantityItem.displayOrder,
      createdAt: quantityItem.createdAt,
      updatedAt: quantityItem.updatedAt,
    };
  }
}
