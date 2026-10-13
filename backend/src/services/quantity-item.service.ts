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
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考の文字数上限（全角25文字/半角50文字）
 * - 13.2: 工種の文字数上限（全角8文字/半角16文字）
 * - 13.3: 単位の文字数上限（全角3文字/半角6文字）
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
import { QUANTITY_TABLE_VALIDATION_MESSAGES } from '../schemas/quantity-table.schema.js';
import {
  QuantityGroupNotFoundError,
  QuantityItemNotFoundError,
  QuantityItemConflictError,
  QuantityTableValidationError,
} from '../errors/quantityTableError.js';
import { QUANTITY_ITEM_TARGET_TYPE } from '../types/audit-log.types.js';
import { QuantityFieldValidationService } from './quantity-field-validation.service.js';
import Decimal from 'decimal.js';

/**
 * QuantityItemService依存関係
 */
export interface QuantityItemServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
  /**
   * フィールド仕様（文字数上限）検証サービス
   *
   * 省略時は既定のインスタンスを用いる。保存経路（QuantityTableService）と同一の実装である。
   */
  quantityFieldValidationService?: QuantityFieldValidationService;
}

/**
 * 数量項目情報
 */
export interface QuantityItemInfo {
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
  private readonly quantityFieldValidationService: QuantityFieldValidationService;

  constructor(deps: QuantityItemServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
    this.quantityFieldValidationService =
      deps.quantityFieldValidationService ?? new QuantityFieldValidationService();
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
   * @throws QuantityTableValidationError テキストフィールドが文字数上限を超える場合（13.1-13.3）
   */
  async create(input: CreateQuantityItemInput, actorId: string): Promise<QuantityItemInfo> {
    // トランザクション開始前に文字数上限を検証し、違反があれば作成を中断する（13.1-13.3）。
    // 書き込みは一切行わない（保存経路 QuantityTableService.saveDraft と同じ順序）。
    this.validateTextFieldWidths(input);

    return await this.prisma.$transaction(async (tx) => {
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。採番・重複検査より前に取る）
      await this.lockQuantityTableRowByGroup(tx, input.quantityGroupId);

      // 1. 数量グループ存在確認
      await this.validateQuantityGroupExists(tx, input.quantityGroupId);

      // 2. 表示順序の決定（明示された値は重なりを拒み、省略時は末尾へ採番する。Task 92.3）
      const displayOrder = await this.resolveCreateDisplayOrder(
        tx,
        input.quantityGroupId,
        input.displayOrder
      );

      // 3. 数量項目作成
      const quantityItem = await tx.quantityItem.create({
        data: {
          quantityGroupId: input.quantityGroupId,
          majorCategory: input.majorCategory?.trim() ?? null,
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
          displayOrder,
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
   * 作成・更新入力のテキストフィールドの文字数上限を検証する
   *
   * Task 77.1: 作成経路・更新経路が保存経路と同じ上限を課さないため、作成・更新はできるが
   * 保存はできない数量項目を作れてしまう状態を解消する。
   *
   * 判定は保存経路（`QuantityTableService.validateDraft`）と同一の
   * `QuantityFieldValidationService.validateItemTextFieldSpecs` に委ねる。上限値・幅計算・
   * メッセージを本ファイルへ書き起こすと、判定の定義が二重になり再び食い違う。
   *
   * 検証対象は受け取った値そのものである（永続化時の `trim()` を先に適用しない）。保存経路も
   * 要求に入っていた値を検証して永続化時に `trim()` するため、前処理を変えると同じ値に対する
   * 判定が再び非対称になる。
   *
   * **部分更新で指定されなかった欄は判定の対象にならない。** 必須3欄（工種・名称・単位）の
   * 未指定には空文字を、任意欄の未指定には null を充てる。正典の判定は幅だけを見るため
   * （`validateTextField` は `validateTextLength` の真偽のみを返す）、幅0の空文字と
   * 判定を飛ばす null はいずれも違反にならず、未指定の欄を誤って拒否することはない。
   *
   * Requirements (quantity-table-generation): 13.1, 13.2, 13.3
   *
   * @param input - 作成入力または更新入力（部分更新可）
   * @throws QuantityTableValidationError 文字数上限を超えるフィールドが1件以上ある場合
   */
  private validateTextFieldWidths(input: {
    majorCategory?: string | null;
    middleCategory?: string | null;
    minorCategory?: string | null;
    customCategory?: string | null;
    workType?: string;
    name?: string;
    specification?: string | null;
    unit?: string;
    remarks?: string | null;
  }): void {
    const result = this.quantityFieldValidationService.validateItemTextFieldSpecs({
      majorCategory: input.majorCategory ?? null,
      middleCategory: input.middleCategory ?? null,
      minorCategory: input.minorCategory ?? null,
      customCategory: input.customCategory ?? null,
      workType: input.workType ?? '',
      name: input.name ?? '',
      specification: input.specification ?? null,
      unit: input.unit ?? '',
      remarks: input.remarks ?? null,
    });

    if (result.isValid) {
      return;
    }

    const validationErrors: Record<string, string> = {};
    for (const error of result.errors) {
      validationErrors[error.field] = error.message;
    }

    throw new QuantityTableValidationError(
      '数量項目に整合性エラーがあります。問題箇所を修正してください。',
      validationErrors
    );
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
   * 作成時の表示順序を決める
   *
   * 明示された値は当該グループの既存項目と重ならないことを確かめる。省略時は末尾
   * （最大値 + 1）へ採番し、項目が1件も無ければ 0 から始める。
   *
   * 採番に「件数」を使ってはならない。削除は後続項目の表示順序を詰めないため、
   * 空き番号のあるグループでは件数が既存の最大値と一致し、末尾と重なる（Task 92.3）。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityGroupId - 数量グループID
   * @param requested - 呼び出し側が明示した表示順序（未指定なら undefined）
   * @returns 実際に書き込む表示順序
   * @throws QuantityTableValidationError 明示された値が既存項目と重なる場合
   */
  private async resolveCreateDisplayOrder(
    tx: PrismaTransactionClient,
    quantityGroupId: string,
    requested: number | undefined
  ): Promise<number> {
    if (requested !== undefined) {
      await this.assertDisplayOrderNotTaken(tx, quantityGroupId, requested);
      return requested;
    }

    return await this.nextDisplayOrder(tx, quantityGroupId);
  }

  /**
   * 当該グループの末尾の表示順序（最大値 + 1）を返す
   *
   * 問い合わせは項目数によらず1回である（Task 92.3）。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityGroupId - 数量グループID
   * @returns 末尾の表示順序。項目が1件も無ければ 0
   */
  private async nextDisplayOrder(
    tx: PrismaTransactionClient,
    quantityGroupId: string
  ): Promise<number> {
    const aggregated = await tx.quantityItem.aggregate({
      where: { quantityGroupId },
      _max: { displayOrder: true },
    });

    return (aggregated._max.displayOrder ?? -1) + 1;
  }

  /**
   * 指定した表示順序が当該グループの他の項目に使われていないことを確かめる
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityGroupId - 数量グループID
   * @param displayOrder - 判定する表示順序
   * @param excludeItemId - 判定から除く項目ID（自分自身の現在値を指す更新・移動を通すため）
   * @throws QuantityTableValidationError 他の項目が同じ表示順序を持つ場合
   */
  private async assertDisplayOrderNotTaken(
    tx: PrismaTransactionClient,
    quantityGroupId: string,
    displayOrder: number,
    excludeItemId?: string
  ): Promise<void> {
    const taken = await tx.quantityItem.count({
      where: {
        quantityGroupId,
        displayOrder,
        ...(excludeItemId !== undefined ? { id: { not: excludeItemId } } : {}),
      },
    });

    if (taken > 0) {
      throw new QuantityTableValidationError(
        QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_DISPLAY_ORDER_DUPLICATED
      );
    }
  }

  /**
   * 当該数量表の行を `SELECT ... FOR UPDATE` で排他ロックする
   *
   * 数量項目の並び順の個別 API が持つのは「数えてから書く」形の検査だけなので、行ロックが
   * 無いと並行する2要求が互いの書き込みを見ないまま同じ検査を通過し、同じ displayOrder を
   * 書きうる（Task 92.4 が実測した）。
   *
   * ロックの対象は数量グループの行ではなく**数量表の行**である。Task 88.1 の
   * `saveDraft` / `copy()` / `createGroupsFromSurvey()` と同一の対象を選ぶことで、本スペックの
   * 書き込み経路が取るロックが1種類に揃う。`move` / `bulkMove` は2つのグループに跨るため、
   * グループ行を対象にすると取得順序を決める必要が生じるが、数量表の行なら1行で足りる。
   *
   * 述語に `AND "deletedAt" IS NULL` を付さない理由は、数量グループ側の同名のヘルパー
   * （`quantity-group.service.ts` の `lockQuantityTableRow`）の註に置いた（Task 92.5）。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityTableId - 数量表ID
   */
  private async lockQuantityTableRow(
    tx: PrismaTransactionClient,
    quantityTableId: string
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM "quantity_tables"
      WHERE id = ${quantityTableId}
      FOR UPDATE
    `;
  }

  /**
   * 数量グループが属する数量表の行を排他ロックする
   *
   * ロック対象を知るための先読みはロックの外で行うが、グループの所属数量表は変わらない
   * （数量表をまたぐ移動を許す経路が無い）ので安全である。グループが無い場合は何もしない
   * ——不在の判定は後続の読み取りに任せる（応答は従来どおり 404）。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param quantityGroupId - 数量グループID
   */
  private async lockQuantityTableRowByGroup(
    tx: PrismaTransactionClient,
    quantityGroupId: string
  ): Promise<void> {
    const group = await tx.quantityGroup.findUnique({
      where: { id: quantityGroupId },
      select: { quantityTableId: true },
    });

    if (group) {
      await this.lockQuantityTableRow(tx, group.quantityTableId);
    }
  }

  /**
   * 数量項目が属する数量表の行を排他ロックする
   *
   * @param tx - Prismaトランザクションクライアント
   * @param itemIds - 数量項目IDの配列
   */
  private async lockQuantityTableRowsByItems(
    tx: PrismaTransactionClient,
    itemIds: string[]
  ): Promise<void> {
    const owners = await tx.quantityItem.findMany({
      where: { id: { in: itemIds } },
      select: { quantityGroup: { select: { quantityTableId: true } } },
    });

    // 複数の数量表に跨りうる経路（bulkCopy）では、取得順序を ID の昇順に固定する。
    // 全経路が同じ順序で取るため、ロック順序の循環＝デッドロックは生じない。
    const tableIds = [...new Set(owners.map((o) => o.quantityGroup.quantityTableId))].sort();
    for (const tableId of tableIds) {
      await this.lockQuantityTableRow(tx, tableId);
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
   * @throws QuantityTableValidationError テキストフィールドが文字数上限を超える場合（13.1-13.3）
   */
  async update(
    id: string,
    input: UpdateQuantityItemInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<QuantityItemInfo> {
    // トランザクション開始前に文字数上限を検証し、違反があれば更新を中断する（13.1-13.3）。
    // 書き込みは一切行わない（作成経路・保存経路と同じ順序・同じ判定）。
    this.validateTextFieldWidths(input);

    return await this.prisma.$transaction(async (tx) => {
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。重複検査と楽観的排他制御の読み取りより前に取る）
      await this.lockQuantityTableRowsByItems(tx, [id]);

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
        updateData.majorCategory = input.majorCategory?.trim() ?? null;
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
        // 他の項目が同じ表示順序を持つ状態を作らせない（自分自身は判定から除く。Task 92.3）
        await this.assertDisplayOrderNotTaken(
          tx,
          quantityItem.quantityGroupId,
          input.displayOrder,
          id
        );
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
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。適用後の重なりの検査より前に取る）
      await this.lockQuantityTableRowByGroup(tx, groupId);

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

      // 3. 適用後の並びに重なりが生じないことを確かめる。
      //    要求の中の重複だけでなく、要求に含めなかった既存項目との重なりも見る
      //    （一部の項目だけを動かす要求でも重なりうるため。Task 92.3）
      const currentItems = await tx.quantityItem.findMany({
        where: { quantityGroupId: groupId },
        select: { id: true, displayOrder: true },
      });

      const resultingOrders = new Map<string, number>(
        currentItems.map((i) => [i.id, i.displayOrder])
      );
      for (const update of orderUpdates) {
        resultingOrders.set(update.id, update.displayOrder);
      }

      const orderValues = [...resultingOrders.values()];
      if (new Set(orderValues).size !== orderValues.length) {
        throw new QuantityTableValidationError(
          QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_DISPLAY_ORDER_DUPLICATED
        );
      }

      // 4. 各項目の表示順序を更新
      for (const update of orderUpdates) {
        await tx.quantityItem.update({
          where: { id: update.id },
          data: { displayOrder: update.displayOrder },
        });
      }

      // 5. 監査ログの記録
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
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。採番より前に取る）
      await this.lockQuantityTableRowsByItems(tx, [itemId]);

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

      // 2. 次の表示順序を取得（件数ではなく最大値 + 1。Task 92.3）
      const displayOrder = await this.nextDisplayOrder(tx, sourceItem.quantityGroupId);

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
          displayOrder,
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
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。移動元・移動先は同一数量表に限られるので1行で足りる）
      await this.lockQuantityTableRowsByItems(tx, [itemId]);

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
        // 他の項目が使っている表示順序へは移さない（自分自身は判定から除く。Task 92.3）
        await this.assertDisplayOrderNotTaken(tx, targetGroupId, displayOrder, itemId);

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

      // 5. 移動先グループで使われている表示順序へは移さない（Task 92.3）
      await this.assertDisplayOrderNotTaken(tx, targetGroupId, displayOrder, itemId);

      // 6. 項目を移動
      const movedItem = await tx.quantityItem.update({
        where: { id: itemId },
        data: {
          quantityGroupId: targetGroupId,
          displayOrder,
        },
      });

      // 7. 監査ログの記録
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
      // 0. 対象項目が属する数量表の行を排他ロックする（Task 92.4）。
      //    本経路だけは複数の数量表に跨りうるため、取得順序を ID の昇順に固定する
      await this.lockQuantityTableRowsByItems(tx, itemIds);

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

        // 次の表示順序を取得（件数ではなく最大値 + 1。Task 92.3）
        const displayOrder = await this.nextDisplayOrder(tx, sourceItem.quantityGroupId);

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
            displayOrder,
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
      // 0. 数量表の行を排他ロックし、同一数量表への並行 displayOrder 操作を直列化する
      //    （Task 92.4。全項目が移動先と同一数量表であることは 3 で検証する）
      await this.lockQuantityTableRowByGroup(tx, targetGroupId);

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

      // 4. 移動先グループの末尾の表示順序を取得（件数ではなく最大値 + 1。Task 92.3）
      let currentDisplayOrder = await this.nextDisplayOrder(tx, targetGroupId);

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
    majorCategory: string | null;
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
