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
  OptimisticLockError,
} from '../errors/quantityTableError.js';
import { SurveyImageNotFoundError, SiteSurveyNotFoundError } from '../errors/siteSurveyError.js';
import { ForbiddenError } from '../errors/apiError.js';
import { QUANTITY_GROUP_TARGET_TYPE } from '../types/audit-log.types.js';
import { QuantityValidationService } from './quantity-validation.service.js';

/**
 * 数量グループのコピー時に元名へ付与するサフィックス（Requirements: 38.5）
 */
const GROUP_COPY_SUFFIX = 'のコピー';

/**
 * QuantityGroupService依存関係
 */
export interface QuantityGroupServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
  /**
   * 数量項目バリデーションサービス（任意）。
   * グループ名切り詰めユーティリティ `truncateForCopy` を利用するため使用する。
   * 未指定の場合は内部で {@link QuantityValidationService} を生成する。
   */
  quantityValidationService?: QuantityValidationService;
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
 * 現場調査からの数量グループ一括生成結果（Requirements: 40.3, 40.13）
 */
export interface CreateGroupsFromSurveyResult {
  /** 生成された数量グループ数（写真0枚時は 0） */
  created: number;
  /** 生成された数量グループ情報（末尾追加・写真順） */
  groups: QuantityGroupInfo[];
}

/**
 * 現場調査画像情報（簡易）
 */
export interface SurveyImageInfoSimple {
  id: string;
  thumbnailPath: string;
  originalPath: string;
  annotatedThumbnailPath: string | null;
  fileName: string;
  comment: string | null;
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
  private readonly quantityValidationService: QuantityValidationService;

  constructor(deps: QuantityGroupServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
    this.quantityValidationService =
      deps.quantityValidationService ?? new QuantityValidationService();
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
            annotatedThumbnailPath: true,
            fileName: true,
            comment: true,
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
          select: {
            id: true,
            thumbnailPath: true,
            annotatedThumbnailPath: true,
            comment: true,
          },
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
   * 数量グループを同一数量表内に複製する
   *
   * トランザクション内で以下を実行:
   * 1. 元グループから親数量表IDを取得（未取得時は QuantityGroupNotFoundError）
   * 2. 親 QuantityTable 行へ `SELECT ... FOR UPDATE` で行ロックを取得
   *    （並行 displayOrder 操作を serialize / 不在検出時は OptimisticLockError）
   * 3. ロック取得後、元グループと配下の全数量項目を再取得
   *    （未取得時は OptimisticLockError、論理削除済み数量表は QuantityGroupNotFoundError）
   * 4. 元グループの displayOrder より大きい後続グループの displayOrder を +1 シフト
   * 5. 複製グループを displayOrder = 元 + 1、surveyImageId 同値、
   *    name = `truncateForCopy('{元名}', 'のコピー')` で挿入
   * 6. 配下の全数量項目を全フィールド値・displayOrder を保持して複製
   * 7. 監査ログに QUANTITY_GROUP_COPIED アクションを記録
   *
   * Requirements:
   * - 38.2: 数量グループのコピーボタンクリックで同一数量表内に複製する
   * - 38.3: 配下の全数量項目（各フィールド・並び順）を複製する
   * - 38.4: 元の写真紐づけ（surveyImageId）を複製先でも維持する
   * - 38.5: 複製先のグループ名は「{元のグループ名}のコピー」
   * - 38.6: 上限超過時は元名を切り詰めてサフィックスを末尾に付与
   * - 38.7: 元グループの直下（displayOrder = 元 + 1）に挿入する
   * - 38.8: 複製先を元グループとは独立したデータとして管理する
   * - 38.10: エラー時は ROLLBACK し不完全なコピーデータを残さない
   *
   * @param groupId - 複製元の数量グループID
   * @param actorId - 操作ユーザーID（監査ログ用）
   * @returns 複製先グループの情報
   * @throws QuantityGroupNotFoundError 元グループが存在しない／論理削除済み数量表に属する場合
   * @throws OptimisticLockError 親数量表ロック取得失敗、ロック後の元グループ削除検出時
   */
  async copy(groupId: string, actorId: string): Promise<QuantityGroupInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 元グループから親数量表IDを取得（ロック取得対象の確定）
      const sourceGroupPreLock = await tx.quantityGroup.findUnique({
        where: { id: groupId },
        select: {
          id: true,
          quantityTableId: true,
        },
      });

      if (!sourceGroupPreLock) {
        throw new QuantityGroupNotFoundError(groupId);
      }

      const quantityTableId = sourceGroupPreLock.quantityTableId;

      // 2. 親 QuantityTable 行に SELECT FOR UPDATE で排他ロックを取得
      //    同一数量表内の並行 displayOrder 操作を serialize する
      const lockedTables = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM "quantity_tables"
          WHERE id = ${quantityTableId} AND "deletedAt" IS NULL
          FOR UPDATE
        `
      );

      if (!Array.isArray(lockedTables) || lockedTables.length === 0) {
        throw new OptimisticLockError('並行操作との競合が発生しました。再試行してください。', {
          quantityTableId,
        });
      }

      // 3. ロック取得後、元グループと配下の全数量項目を再取得
      const sourceGroup = await tx.quantityGroup.findUnique({
        where: { id: groupId },
        include: {
          quantityTable: {
            select: { id: true, deletedAt: true },
          },
          items: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      // ロック取得後に元グループが消失している場合は並行操作との競合
      if (!sourceGroup) {
        throw new OptimisticLockError(
          'コピー処理中に元グループが削除されたため、処理を中止しました。',
          { groupId }
        );
      }

      // 親数量表が論理削除済みの場合は存在しない扱い
      if (sourceGroup.quantityTable.deletedAt !== null) {
        throw new QuantityGroupNotFoundError(groupId);
      }

      // 4. 後続グループの displayOrder を +1 シフト
      await tx.quantityGroup.updateMany({
        where: {
          quantityTableId,
          displayOrder: { gt: sourceGroup.displayOrder },
        },
        data: { displayOrder: { increment: 1 } },
      });

      // 5. 複製グループの名前を生成（上限超過時は元名を切り詰めてサフィックスを末尾に付与）
      const baseName = sourceGroup.name ?? '';
      const copiedName = this.quantityValidationService.truncateForCopy(
        baseName,
        GROUP_COPY_SUFFIX
      );

      // 6. 複製グループの挿入
      const copiedGroup = await tx.quantityGroup.create({
        data: {
          quantityTableId,
          name: copiedName,
          surveyImageId: sourceGroup.surveyImageId,
          displayOrder: sourceGroup.displayOrder + 1,
        },
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      // 7. 配下の全数量項目を複製（全フィールド値・displayOrder を保持）
      if (sourceGroup.items.length > 0) {
        const itemsData: Prisma.QuantityItemCreateManyInput[] = sourceGroup.items.map((item) => ({
          quantityGroupId: copiedGroup.id,
          majorCategory: item.majorCategory,
          middleCategory: item.middleCategory,
          minorCategory: item.minorCategory,
          customCategory: item.customCategory,
          workType: item.workType,
          name: item.name,
          specification: item.specification,
          unit: item.unit,
          calculationMethod: item.calculationMethod,
          calculationParams:
            item.calculationParams === null
              ? Prisma.JsonNull
              : (item.calculationParams as Prisma.InputJsonValue),
          adjustmentFactor: item.adjustmentFactor,
          roundingUnit: item.roundingUnit,
          quantity: item.quantity,
          remarks: item.remarks,
          displayOrder: item.displayOrder,
        }));

        await tx.quantityItem.createMany({
          data: itemsData,
        });
      }

      // 8. 監査ログに QUANTITY_GROUP_COPIED を記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUP_COPIED',
        actorId,
        targetType: QUANTITY_GROUP_TARGET_TYPE,
        targetId: copiedGroup.id,
        before: {
          sourceGroupId: sourceGroup.id,
          sourceName: sourceGroup.name,
          sourceDisplayOrder: sourceGroup.displayOrder,
        },
        after: {
          quantityTableId,
          name: copiedGroup.name,
          surveyImageId: copiedGroup.surveyImageId,
          displayOrder: copiedGroup.displayOrder,
          itemCount: sourceGroup.items.length,
        },
      });

      return this.toQuantityGroupInfo({
        ...copiedGroup,
        _count: { items: sourceGroup.items.length },
      });
    });
  }

  /**
   * 現場調査の全写真（注釈有無問わず）の枚数分の数量グループを既存グループ末尾に
   * 連番命名で一括生成し、各グループに写真を写真順（displayOrder）で1枚ずつ紐づける。
   *
   * トランザクション内で以下を実行する（REQ-38 `copy()` と同一の並行制御方針）:
   * 1. 数量表の存在確認（論理削除済みは存在しない扱い、QuantityTableNotFoundError）
   * 2. 対象現場調査の存在確認（SiteSurveyNotFoundError）と、当該数量表のプロジェクト
   *    所属検証（不一致時は SurveyImageAccessDeniedError = ForbiddenError）
   * 3. 当該数量表の数量グループ群を `SELECT ... FOR UPDATE` で行ロックし、同一数量表への
   *    並行 displayOrder 操作（add/copy/reorder/一括生成）を直列化する。ロック対象が
   *    検出できない場合は OptimisticLockError を送出する（API 層で 409 にマップ）
   * 4. 現場調査の全写真を写真順（displayOrder）で取得する。写真0枚なら ROLLBACK 不要で
   *    `{ created: 0, groups: [] }` を返す（グループ生成・監査ログ記録は行わない）
   * 5. 既存グループの `max(displayOrder)+1` を起点に、写真枚数分のグループを末尾へ連番命名
   *    （`buildGroupNameFromSurvey(surveyName, 1..N)`）で createManyAndReturn により一括生成。
   *    各グループは数量項目0件の初期状態（数量項目の自動生成は行わない）
   * 6. 監査ログに QUANTITY_GROUPS_CREATED_FROM_SURVEY を記録する
   *
   * エラー時は $transaction により ROLLBACK され、部分生成データは残らない。
   *
   * Requirements:
   * - 40.3: 当該現場調査の全写真（注釈有無問わず）の枚数と同数の数量グループを生成
   * - 40.4: 各数量グループに写真を写真順に1枚ずつ紐づける
   * - 40.5: グループ名を「{現場調査名} {連番}」（連番1始まり）とする
   * - 40.6: 最大文字数超過時は現場調査名部分を切り詰めて連番を付与（命名ヘルパーに委譲）
   * - 40.7: 生成グループを既存グループの末尾に写真順で追加する
   * - 40.9: 各グループを数量項目0件の初期状態で作成する
   * - 40.10: 写真0枚時はグループを生成せず生成0件を返す
   * - 40.12: エラー時は ROLLBACK し不完全な生成データを残さない
   *
   * @param quantityTableId - 対象数量表ID
   * @param siteSurveyId - 対象現場調査ID
   * @param actorId - 操作ユーザーID（監査ログ用）
   * @returns 生成件数と生成グループ情報
   * @throws QuantityTableNotFoundError 数量表が存在しない／論理削除済みの場合
   * @throws SiteSurveyNotFoundError 現場調査が存在しない／論理削除済みの場合
   * @throws ForbiddenError 現場調査が当該数量表のプロジェクトに属さない場合
   * @throws OptimisticLockError 親数量表ロック取得失敗（並行操作との競合）時
   */
  async createGroupsFromSurvey(
    quantityTableId: string,
    siteSurveyId: string,
    actorId: string
  ): Promise<CreateGroupsFromSurveyResult> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 数量表存在確認（論理削除済みは存在しない扱い）
      const quantityTable = await this.validateQuantityTableExists(tx, quantityTableId);

      // 2. 当該数量表の数量グループ群を SELECT FOR UPDATE で行ロック（並行制御）
      //    トランザクション開始直後に取得し、同一数量表への並行 displayOrder 操作を直列化する
      const lockedTables = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM "quantity_tables"
          WHERE id = ${quantityTableId} AND "deletedAt" IS NULL
          FOR UPDATE
        `
      );

      if (!Array.isArray(lockedTables) || lockedTables.length === 0) {
        throw new OptimisticLockError('並行操作との競合が発生しました。再試行してください。', {
          quantityTableId,
        });
      }

      // 3. 対象現場調査の存在確認とプロジェクト所属検証
      const siteSurvey = await tx.siteSurvey.findUnique({
        where: { id: siteSurveyId },
        select: { id: true, name: true, deletedAt: true, projectId: true },
      });

      if (!siteSurvey || siteSurvey.deletedAt !== null) {
        throw new SiteSurveyNotFoundError(siteSurveyId);
      }

      if (siteSurvey.projectId !== quantityTable.projectId) {
        throw new ForbiddenError(
          '対象の現場調査が当該数量表のプロジェクトに属していません。',
          'SITE_SURVEY_PROJECT_MISMATCH'
        );
      }

      // 4. 現場調査の全写真（注釈有無問わず）を写真順（displayOrder）で取得
      const surveyImages = await tx.surveyImage.findMany({
        where: { surveyId: siteSurveyId },
        orderBy: { displayOrder: 'asc' },
        select: { id: true },
      });

      // 写真0枚なら生成せず created:0 を返す（監査ログも記録しない）
      if (surveyImages.length === 0) {
        return { created: 0, groups: [] };
      }

      // 5. 既存グループの max(displayOrder)+1 を起点に末尾追加
      const maxAggregate = await tx.quantityGroup.aggregate({
        where: { quantityTableId },
        _max: { displayOrder: true },
      });
      const startDisplayOrder = (maxAggregate._max.displayOrder ?? -1) + 1;

      // 6. 写真枚数分のグループを連番命名・写真順で一括生成（各グループ数量項目0件）
      const groupsData: Prisma.QuantityGroupCreateManyInput[] = surveyImages.map(
        (image, index) => ({
          quantityTableId,
          name: this.quantityValidationService.buildGroupNameFromSurvey(siteSurvey.name, index + 1),
          surveyImageId: image.id,
          displayOrder: startDisplayOrder + index,
        })
      );

      const createdGroups = await tx.quantityGroup.createManyAndReturn({
        data: groupsData,
      });

      // 写真順（displayOrder 昇順）を保証して返却
      const sortedGroups = [...createdGroups].sort((a, b) => a.displayOrder - b.displayOrder);
      const groups = sortedGroups.map((group) =>
        this.toQuantityGroupInfo({ ...group, _count: { items: 0 } })
      );

      // 7. 監査ログに一括生成アクションを記録
      await this.auditLogService.createLog({
        action: 'QUANTITY_GROUPS_CREATED_FROM_SURVEY',
        actorId,
        targetType: QUANTITY_GROUP_TARGET_TYPE,
        targetId: quantityTableId,
        before: null,
        after: {
          quantityTableId,
          siteSurveyId,
          siteSurveyName: siteSurvey.name,
          created: groups.length,
          groupIds: groups.map((g) => g.id),
        },
      });

      return { created: groups.length, groups };
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
      annotatedThumbnailPath: string | null;
      fileName: string;
      comment: string | null;
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
            annotatedThumbnailPath: quantityGroup.surveyImage.annotatedThumbnailPath,
            fileName: quantityGroup.surveyImage.fileName,
            comment: quantityGroup.surveyImage.comment,
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
