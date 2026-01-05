/**
 * @fileoverview 数量グループサービス
 *
 * 数量グループの管理機能を担当します。
 *
 * Requirements:
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 数量グループが追加される場合、同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.4: 数量グループに写真が紐づけられている状態で、注釈付き写真と数量項目の関連性を視覚的に表示する
 * - 4.5: 数量グループの削除操作を行う
 * - 3.2: プロジェクト詳細画面に数量表情報として現場調査画像サムネイルを表示する
 * - 3.3: 数量グループと現場調査画像の紐付けを管理する
 *
 * @module services/quantity-group
 */

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateQuantityGroupInput,
  UpdateQuantityGroupInput,
} from '../schemas/quantity-table.schema.js';
import {
  QuantityTableNotFoundError,
  QuantityGroupNotFoundError,
  QuantityGroupConflictError,
  QuantityTableValidationError,
} from '../errors/quantityTableError.js';
import { SurveyImageNotFoundError } from '../errors/siteSurveyError.js';
import { QUANTITY_GROUP_TARGET_TYPE } from '../types/audit-log.types.js';

/**
 * QuantityGroupService依存関係
 */
export interface QuantityGroupServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 数量グループ情報
 */
export interface QuantityGroupInfo {
  id: string;
  quantityTableId: string;
  name: string | null;
  surveyImageId: string | null;
  displayOrder: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 現場調査画像情報（簡易）
 */
export interface SurveyImageInfoSimple {
  id: string;
  thumbnailPath: string;
  originalPath: string;
  fileName: string;
}

/**
 * 数量項目情報（簡易）
 */
export interface QuantityItemInfoSimple {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  displayOrder: number;
}

/**
 * 数量グループ詳細情報
 */
export interface QuantityGroupDetail extends QuantityGroupInfo {
  surveyImage: SurveyImageInfoSimple | null;
  items: QuantityItemInfoSimple[];
}

/**
 * 表示順序更新入力
 */
export interface DisplayOrderUpdate {
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
 * 数量グループサービス
 *
 * 数量グループの管理機能を担当します。
 */
export class QuantityGroupService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: QuantityGroupServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 数量グループ作成
   *
   * トランザクション内で以下を実行:
   * 1. 数量表存在確認
   * 2. 現場調査画像の検証（指定されている場合）
   * 3. 数量グループ作成 (Requirements: 4.1)
   * 4. 監査ログの記録
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された数量グループ情報
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   * @throws SurveyImageNotFoundError 現場調査画像が存在しない場合
   * @throws QuantityTableValidationError 異なるプロジェクトの画像を指定した場合
   */
  async create(input: CreateQuantityGroupInput, actorId: string): Promise<QuantityGroupInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量表存在確認
      const quantityTable = await this.validateQuantityTableExists(tx, input.quantityTableId);

      // 2. 現場調査画像の検証（指定されている場合）
      if (input.surveyImageId) {
        await this.validateSurveyImage(tx, input.surveyImageId, quantityTable.projectId);
      }

      // 3. 次の表示順序を取得
      const maxDisplayOrder = await tx.quantityGroup.count({
        where: { quantityTableId: input.quantityTableId },
      });

      // 4. 数量グループ作成
      const quantityGroup = await tx.quantityGroup.create({
        data: {
          quantityTableId: input.quantityTableId,
          name: input.name?.trim() ?? null,
          surveyImageId: input.surveyImageId ?? null,
          displayOrder: input.displayOrder ?? maxDisplayOrder,
        },
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      // 5. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUP_CREATED',
        actorId,
        targetType: QUANTITY_GROUP_TARGET_TYPE,
        targetId: quantityGroup.id,
        before: null,
        after: {
          quantityTableId: quantityGroup.quantityTableId,
          name: quantityGroup.name,
          surveyImageId: quantityGroup.surveyImageId,
          displayOrder: quantityGroup.displayOrder,
        },
      });

      return this.toQuantityGroupInfo(quantityGroup);
    });
  }

  /**
   * 数量表存在確認
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityTableId - 数量表ID
   * @throws QuantityTableNotFoundError 数量表が存在しない、または論理削除済みの場合
   */
  private async validateQuantityTableExists(
    tx: PrismaTransactionClient,
    quantityTableId: string
  ): Promise<{ id: string; projectId: string }> {
    const quantityTable = await tx.quantityTable.findUnique({
      where: { id: quantityTableId },
      select: { id: true, deletedAt: true, projectId: true },
    });

    if (!quantityTable || quantityTable.deletedAt !== null) {
      throw new QuantityTableNotFoundError(quantityTableId);
    }

    return { id: quantityTable.id, projectId: quantityTable.projectId };
  }

  /**
   * 現場調査画像の検証
   *
   * 画像が存在し、同一プロジェクトに属していることを確認する。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param surveyImageId - 現場調査画像ID
   * @param projectId - プロジェクトID
   * @throws SurveyImageNotFoundError 現場調査画像が存在しない場合
   * @throws QuantityTableValidationError 異なるプロジェクトの画像を指定した場合
   */
  private async validateSurveyImage(
    tx: PrismaTransactionClient,
    surveyImageId: string,
    projectId: string
  ): Promise<void> {
    const surveyImage = await tx.surveyImage.findUnique({
      where: { id: surveyImageId },
      select: {
        id: true,
        survey: {
          select: { projectId: true },
        },
      },
    });

    if (!surveyImage) {
      throw new SurveyImageNotFoundError(surveyImageId);
    }

    if (surveyImage.survey.projectId !== projectId) {
      throw new QuantityTableValidationError('異なるプロジェクトの現場調査画像は紐付けできません');
    }
  }

  /**
   * 数量グループ詳細取得
   *
   * 数量グループの基本情報、現場調査画像情報、項目一覧を取得する。
   *
   * @param id - 数量グループID
   * @returns 数量グループ詳細情報、存在しない場合はnull
   */
  async findById(id: string): Promise<QuantityGroupDetail | null> {
    const quantityGroup = await this.prisma.quantityGroup.findUnique({
      where: { id },
      include: {
        quantityTable: {
          select: { id: true, deletedAt: true },
        },
        surveyImage: {
          select: {
            id: true,
            thumbnailPath: true,
            originalPath: true,
            fileName: true,
          },
        },
        items: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            name: true,
            unit: true,
            quantity: true,
            displayOrder: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    if (!quantityGroup || quantityGroup.quantityTable.deletedAt !== null) {
      return null;
    }

    return this.toQuantityGroupDetail(quantityGroup);
  }

  /**
   * 数量表IDによるグループ一覧取得
   *
   * 指定された数量表に属するグループの一覧を表示順序で取得する。
   *
   * @param quantityTableId - 数量表ID
   * @returns グループ一覧
   */
  async findByQuantityTableId(quantityTableId: string): Promise<QuantityGroupInfo[]> {
    const groups = await this.prisma.quantityGroup.findMany({
      where: {
        quantityTableId,
        quantityTable: { deletedAt: null },
      },
      orderBy: { displayOrder: 'asc' },
      include: {
        surveyImage: {
          select: { id: true, thumbnailPath: true },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    return groups.map((g) => this.toQuantityGroupInfo(g));
  }

  /**
   * 数量グループ更新
   *
   * 楽観的排他制御を実装。
   *
   * @param id - 数量グループID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された数量グループ情報
   * @throws QuantityGroupNotFoundError 数量グループが存在しない場合
   * @throws QuantityGroupConflictError 楽観的排他制御エラー
   */
  async update(
    id: string,
    input: UpdateQuantityGroupInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<QuantityGroupInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量グループの存在確認
      const quantityGroup = await tx.quantityGroup.findUnique({
        where: { id },
        include: {
          quantityTable: {
            select: { id: true, deletedAt: true, projectId: true },
          },
        },
      });

      if (!quantityGroup || quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityGroupNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較
      if (quantityGroup.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new QuantityGroupConflictError(
          '数量グループは他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: quantityGroup.updatedAt.toISOString(),
          }
        );
      }

      // 2. 現場調査画像の検証（指定されている場合）
      if (input.surveyImageId !== undefined && input.surveyImageId !== null) {
        await this.validateSurveyImage(
          tx,
          input.surveyImageId,
          quantityGroup.quantityTable.projectId
        );
      }

      // 3. 更新データの構築
      const updateData: {
        name?: string | null;
        surveyImageId?: string | null;
        displayOrder?: number;
      } = {};

      if (input.name !== undefined) {
        updateData.name = input.name?.trim() ?? null;
      }
      if (input.surveyImageId !== undefined) {
        updateData.surveyImageId = input.surveyImageId;
      }
      if (input.displayOrder !== undefined) {
        updateData.displayOrder = input.displayOrder;
      }

      // 4. 数量グループ更新
      const updatedGroup = await tx.quantityGroup.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      // 5. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUP_UPDATED',
        actorId,
        targetType: QUANTITY_GROUP_TARGET_TYPE,
        targetId: id,
        before: {
          name: quantityGroup.name,
          surveyImageId: quantityGroup.surveyImageId,
          displayOrder: quantityGroup.displayOrder,
        },
        after: {
          name: updatedGroup.name,
          surveyImageId: updatedGroup.surveyImageId,
          displayOrder: updatedGroup.displayOrder,
        },
      });

      return this.toQuantityGroupInfo(updatedGroup);
    });
  }

  /**
   * 表示順序一括更新
   *
   * @param quantityTableId - 数量表ID
   * @param orderUpdates - 表示順序更新リスト
   * @param actorId - 実行者ID
   */
  async updateDisplayOrder(
    quantityTableId: string,
    orderUpdates: DisplayOrderUpdate[],
    actorId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 数量表存在確認
      await this.validateQuantityTableExists(tx, quantityTableId);

      // 2. グループが同一数量表に属しているか確認
      const groupIds = orderUpdates.map((u) => u.id);
      const groups = await tx.quantityGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, quantityTableId: true },
      });

      const invalidGroups = groups.filter((g) => g.quantityTableId !== quantityTableId);
      if (invalidGroups.length > 0) {
        throw new QuantityTableValidationError('異なる数量表のグループが含まれています');
      }

      // 3. 各グループの表示順序を更新
      for (const update of orderUpdates) {
        await tx.quantityGroup.update({
          where: { id: update.id },
          data: { displayOrder: update.displayOrder },
        });
      }

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUP_UPDATED',
        actorId,
        targetType: 'QuantityTable',
        targetId: quantityTableId,
        before: null,
        after: {
          action: 'REORDER_GROUPS',
          updates: orderUpdates as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * 数量グループ削除
   *
   * グループと配下の項目をカスケード削除する。
   *
   * @param id - 数量グループID
   * @param actorId - 実行者ID
   * @throws QuantityGroupNotFoundError 数量グループが存在しない場合
   */
  async delete(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 数量グループの存在確認
      const quantityGroup = await tx.quantityGroup.findUnique({
        where: { id },
        include: {
          quantityTable: {
            select: { id: true, deletedAt: true },
          },
          _count: {
            select: { items: true },
          },
        },
      });

      if (!quantityGroup || quantityGroup.quantityTable.deletedAt !== null) {
        throw new QuantityGroupNotFoundError(id);
      }

      const itemCount = quantityGroup._count.items;

      // 2. 数量グループ削除（カスケードで項目も削除される）
      await tx.quantityGroup.delete({
        where: { id },
      });

      // 3. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUP_DELETED',
        actorId,
        targetType: QUANTITY_GROUP_TARGET_TYPE,
        targetId: id,
        before: {
          quantityTableId: quantityGroup.quantityTableId,
          name: quantityGroup.name,
          surveyImageId: quantityGroup.surveyImageId,
          displayOrder: quantityGroup.displayOrder,
          itemCount,
        },
        after: null,
      });
    });
  }

  /**
   * データベースの結果をQuantityGroupInfoに変換
   */
  private toQuantityGroupInfo(quantityGroup: {
    id: string;
    quantityTableId: string;
    name: string | null;
    surveyImageId: string | null;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
    _count: { items: number };
  }): QuantityGroupInfo {
    return {
      id: quantityGroup.id,
      quantityTableId: quantityGroup.quantityTableId,
      name: quantityGroup.name,
      surveyImageId: quantityGroup.surveyImageId,
      displayOrder: quantityGroup.displayOrder,
      itemCount: quantityGroup._count.items,
      createdAt: quantityGroup.createdAt,
      updatedAt: quantityGroup.updatedAt,
    };
  }

  /**
   * データベースの結果をQuantityGroupDetailに変換
   */
  private toQuantityGroupDetail(quantityGroup: {
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
      name: string;
      unit: string;
      quantity: { toString(): string } | number;
      displayOrder: number;
    }>;
    _count: { items: number };
  }): QuantityGroupDetail {
    return {
      id: quantityGroup.id,
      quantityTableId: quantityGroup.quantityTableId,
      name: quantityGroup.name,
      surveyImageId: quantityGroup.surveyImageId,
      displayOrder: quantityGroup.displayOrder,
      itemCount: quantityGroup._count.items,
      createdAt: quantityGroup.createdAt,
      updatedAt: quantityGroup.updatedAt,
      surveyImage: quantityGroup.surveyImage
        ? {
            id: quantityGroup.surveyImage.id,
            thumbnailPath: quantityGroup.surveyImage.thumbnailPath,
            originalPath: quantityGroup.surveyImage.originalPath,
            fileName: quantityGroup.surveyImage.fileName,
          }
        : null,
      items: quantityGroup.items.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity:
          typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity.toString()),
        displayOrder: item.displayOrder,
      })),
    };
  }
}
