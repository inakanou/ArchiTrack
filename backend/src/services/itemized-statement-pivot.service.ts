/**
 * @fileoverview 内訳書ピボット集計サービス
 *
 * 数量表の項目を「任意分類」「工種」「名称」「規格」「単位」の5項目でピボット集計し、
 * 内訳書用の集計データを生成する。
 *
 * Requirements:
 * - 2.1: 「任意分類」「工種」「名称」「規格」「単位」の5項目の組み合わせをキーとしてグループ化する
 * - 2.2: 同一キーの項目が複数存在する場合、該当項目の「数量」フィールドの値を合計する
 * - 2.3: null または空文字の値を同一グループとして扱う
 * - 2.4: 合計数量は小数点以下2桁の精度で計算する
 * - 2.5: 数量の合計結果が許容範囲を超える場合、オーバーフローエラーを発生させる
 *
 * Task 2.1: ピボット集計サービスの実装
 *
 * @module services/itemized-statement-pivot
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import Decimal from 'decimal.js';
import {
  QuantityOverflowError,
  QuantityTableNotFoundForItemizedStatementError,
} from '../errors/itemizedStatementError.js';

/**
 * ピボット集計サービス依存関係
 */
export interface ItemizedStatementPivotServiceDependencies {
  prisma: PrismaClient;
}

/**
 * グループキー生成に必要な項目
 */
export interface GroupKeyFields {
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
}

/**
 * 集計済み内訳項目
 */
export interface AggregatedItem {
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
}

/**
 * 集計結果
 */
export interface AggregationResult {
  items: AggregatedItem[];
  sourceItemCount: number;
}

/**
 * 数量の許容範囲
 */
const QUANTITY_MIN = new Decimal('-999999.99');
const QUANTITY_MAX = new Decimal('9999999.99');

/**
 * 内訳書ピボット集計サービス
 *
 * 数量表の項目を5項目（任意分類・工種・名称・規格・単位）でピボット集計し、
 * 内訳書用の集計データを生成する。
 */
export class ItemizedStatementPivotService {
  private readonly prisma: PrismaClient;

  constructor(deps: ItemizedStatementPivotServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 数量表IDから内訳項目を集計する
   *
   * Requirements:
   * - 2.1: 5項目の組み合わせをキーとしてグループ化
   * - 2.2: 同一キーの数量を合計
   * - 2.3: null/空文字は同一グループとして扱う
   * - 2.4: 小数点以下2桁精度で計算
   * - 2.5: オーバーフロー検出
   *
   * @param quantityTableId - 数量表ID
   * @returns 集計結果
   * @throws QuantityTableNotFoundForItemizedStatementError 数量表が存在しないか論理削除済みの場合
   * @throws QuantityOverflowError 合計数量が許容範囲を超えた場合
   */
  async aggregateByQuantityTable(quantityTableId: string): Promise<AggregationResult> {
    // 1. 数量表の存在確認
    const quantityTable = await this.prisma.quantityTable.findUnique({
      where: { id: quantityTableId },
      select: { id: true, deletedAt: true },
    });

    if (!quantityTable || quantityTable.deletedAt !== null) {
      throw new QuantityTableNotFoundForItemizedStatementError(quantityTableId);
    }

    // 2. 数量表に紐づく全ての数量項目を取得
    const quantityItems = await this.prisma.quantityItem.findMany({
      where: {
        quantityGroup: {
          quantityTableId,
          quantityTable: { deletedAt: null },
        },
      },
      select: {
        id: true,
        customCategory: true,
        workType: true,
        name: true,
        specification: true,
        unit: true,
        quantity: true,
      },
    });

    // 3. 項目がない場合は空の結果を返す
    if (quantityItems.length === 0) {
      return {
        items: [],
        sourceItemCount: 0,
      };
    }

    // 4. ピボット集計（グループ化と合計）
    const aggregatedMap = new Map<
      string,
      {
        customCategory: string | null;
        workType: string | null;
        name: string | null;
        specification: string | null;
        unit: string | null;
        quantity: Decimal;
      }
    >();

    for (const item of quantityItems) {
      const key = this.generateGroupKey({
        customCategory: item.customCategory,
        workType: item.workType,
        name: item.name,
        specification: item.specification,
        unit: item.unit,
      });

      const existing = aggregatedMap.get(key);

      if (existing) {
        // 既存のグループに数量を加算
        existing.quantity = existing.quantity.add(new Decimal(item.quantity.toString()));
      } else {
        // 新しいグループを作成
        aggregatedMap.set(key, {
          customCategory: this.normalizeNullOrEmpty(item.customCategory),
          workType: this.normalizeNullOrEmpty(item.workType),
          name: this.normalizeNullOrEmpty(item.name),
          specification: this.normalizeNullOrEmpty(item.specification),
          unit: this.normalizeNullOrEmpty(item.unit),
          quantity: new Decimal(item.quantity.toString()),
        });
      }
    }

    // 5. 結果を配列に変換し、小数点以下2桁に丸める
    const aggregatedItems: AggregatedItem[] = [];

    for (const [, value] of aggregatedMap) {
      // 小数点以下2桁に丸める（切り捨て）
      const roundedQuantity = value.quantity.toDecimalPlaces(2, Decimal.ROUND_DOWN);

      // オーバーフローチェック
      if (roundedQuantity.lt(QUANTITY_MIN) || roundedQuantity.gt(QUANTITY_MAX)) {
        throw new QuantityOverflowError(
          roundedQuantity.toString(),
          QUANTITY_MIN.toString(),
          QUANTITY_MAX.toString()
        );
      }

      aggregatedItems.push({
        customCategory: value.customCategory,
        workType: value.workType,
        name: value.name,
        specification: value.specification,
        unit: value.unit,
        quantity: roundedQuantity.toNumber(),
      });
    }

    return {
      items: aggregatedItems,
      sourceItemCount: quantityItems.length,
    };
  }

  /**
   * グループキーを生成する
   *
   * 5項目（任意分類・工種・名称・規格・単位）を結合してグループキーを生成する。
   * null値と空文字は同一として扱う（Requirements: 2.3）
   *
   * @param fields - グループキー生成に必要な項目
   * @returns グループキー（パイプ区切り）
   */
  generateGroupKey(fields: GroupKeyFields): string {
    const parts = [
      this.normalizeNullOrEmpty(fields.customCategory) ?? '',
      this.normalizeNullOrEmpty(fields.workType) ?? '',
      this.normalizeNullOrEmpty(fields.name) ?? '',
      this.normalizeNullOrEmpty(fields.specification) ?? '',
      this.normalizeNullOrEmpty(fields.unit) ?? '',
    ];

    return parts.join('|');
  }

  /**
   * nullと空文字を正規化する
   *
   * null値と空文字を同一として扱うため、空文字はnullに変換する。
   * (Requirements: 2.3)
   *
   * @param value - 入力値
   * @returns 正規化された値（空文字の場合はnull）
   */
  private normalizeNullOrEmpty(value: string | null): string | null {
    if (value === null || value === '') {
      return null;
    }
    return value;
  }
}
