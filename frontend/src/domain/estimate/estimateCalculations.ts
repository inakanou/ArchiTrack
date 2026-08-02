/**
 * @fileoverview estimateCalculations - 案分・利益率・集計・値の丸めの単一実装
 *
 * NET金額案分・利益率適用・サマリー集計を、クライアント側の唯一の実装として提供します。
 * これまで「現行のプレビュー実装（`utils/estimate-calculation` の `EstimateCalculator`、
 * および NetAllocationDialog / ProfitRateDialog のインライン計算）」と
 * 「サーバー実装（backend `EstimateCalculationService` ＋ `estimates.routes.ts` の
 * `calculate-net` / `apply-profit-rate`）」に分かれていた規則をここへ統合します。
 * 出力の一致は `estimateCalculations.test.ts` が固定値で確認します。
 *
 * UI・サーバーいずれにも依存しないドメイン層のモジュールであり、
 * components / hooks / pages / api からは import しません
 * （design.md `#### Dependency Direction`）。
 *
 * Requirements (estimate-creation):
 * - 5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - 5.5: 案分後の金額を自動計算して実行金額行に表示する
 * - 5.8: 案分計算を編集中の業者金額行の値に基づいて行い、プレビューと反映結果を一致させる
 * - 6.1: 全実行金額行に対して利益率を適用した単価を計算する
 * - 6.8: 利益率適用を編集中の実行金額行の値に基づいて行い、プレビューと反映結果を一致させる
 * - 22.1: 数量は小数2桁
 * - 22.2 / 22.3: 単価・金額は小数第1位で四捨五入した整数
 * - 22.4 / 22.5: 案分後金額・案分後単価は小数第1位で四捨五入した整数
 * - 22.6: 利益率適用後の新しい単価は小数第1位で四捨五入した整数
 * - 22.9: 金額は 数量 × 単価 を小数第1位で四捨五入した整数で保持する
 * - 39.10: サマリー各項目を編集中の内容に基づいて算出する
 * - 41.8: 値引き行の金額（負数を含む）を集計に加算する
 * - 41.9: 値引き行をNET金額案分・利益率適用の対象外とする
 * - 49.6: 転記・計算の対象を編集中の明細の値とする
 * - 55.4: 注記行をNET金額案分・利益率適用の対象外とする
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateCalculations`
 *
 * @module domain/estimate/estimateCalculations
 */

import Decimal from 'decimal.js';

import type {
  EditableItem,
  EstimateEditItemType,
  EstimateLineType,
  NodeKey,
  OverwriteOption,
} from './estimateEditReducer.types';
import { isAggregatableChild } from './estimateTree';

// ============================================================================
// 型定義
// ============================================================================

/** 案分の入力行（編集中の業者金額行から構成する） */
export interface AllocationRow {
  readonly key: NodeKey;
  /** 未指定は `STANDARD` として扱う（サーバー実装の `VendorLineInfo.itemType` と同一規約） */
  readonly itemType?: EstimateEditItemType;
  /** 業者金額行の金額 */
  readonly amount: Decimal | null;
  /** 業者金額行の数量（案分後単価の算出に用いる） */
  readonly quantity: Decimal | null;
}

/** 案分の結果行 */
export interface AllocationResult {
  readonly key: NodeKey;
  /** 対象合計に対する比率（丸めない生の値。百分率化・桁丸めは表示側の責務） */
  readonly ratio: Decimal;
  /** 案分後の金額（小数第1位で四捨五入した整数） */
  readonly allocatedAmount: Decimal;
  /** 案分後の単価（小数第1位で四捨五入した整数） */
  readonly unitPrice: Decimal;
}

/**
 * 利益率適用の上書きオプション（6.2〜6.4）
 *
 * 実体は `estimateEditReducer.types` にある（適用アクション
 * `ProfitRatePayload` と同一の列挙を用いるため、依存の最下層で定義する）。
 * design.md の `EstimateCalculations` 契約が本モジュールでの露出を定めているため
 * ここから再エクスポートする。
 */
export type { OverwriteOption } from './estimateEditReducer.types';

/** 利益率適用の入力行（編集中の実行金額行・見積金額行から構成する） */
export interface ProfitRateRow {
  readonly key: NodeKey;
  /** 未指定は `STANDARD` として扱う（サーバー実装の `ExecutionLineInfo.itemType` と同一規約） */
  readonly itemType?: EstimateEditItemType;
  /** 実行金額行の単価（利益率適用の基準値） */
  readonly executionUnitPrice: Decimal | null;
  /** 実行金額行の数量（`all` / `empty_only` の金額算出に用いる） */
  readonly executionQuantity: Decimal | null;
  /** 編集中の見積金額行の単価（`empty_only` の判定に用いる / 6.7） */
  readonly estimateUnitPrice: Decimal | null;
  /** 編集中の見積金額行の数量（`unit_price_only` の金額算出に用いる） */
  readonly estimateQuantity: Decimal | null;
}

/** 利益率適用の結果行 */
export interface ProfitRateResult {
  readonly key: NodeKey;
  /** 適用前の実行金額行の単価 */
  readonly originalUnitPrice: Decimal | null;
  /** 利益率適用後の単価（小数第1位で四捨五入した整数）。基準単価が無い場合は null */
  readonly newUnitPrice: Decimal | null;
  /** 新しい単価に対応する見積金額行の金額。数量が未設定の場合は null */
  readonly newAmount: Decimal | null;
  /**
   * 見積金額行へ実際に反映するか（6.3: `empty_only` で単価が入っている行は反映しない）
   *
   * プレビューは `applied` が false の行を「反映されない」と示すことで
   * 「プレビューに表示した新しい単価と実際に反映される単価を一致させる」（6.8）を満たす。
   */
  readonly applied: boolean;
  /** 名称・規格・単位・数量を実行金額行から複写するか（6.2 / 6.3 は true、6.4 は false） */
  readonly copyLineFields: boolean;
}

/** サマリーの算出結果（39.1〜39.8） */
export interface EstimateSummary {
  /** 業者金額合計（39.2） */
  readonly vendorTotal: Decimal;
  /** 実行金額合計（39.3） */
  readonly executionTotal: Decimal;
  /** 見積金額合計（39.6） */
  readonly estimateTotal: Decimal;
  /** 値引額 = 実行金額合計 - 業者金額合計（39.4） */
  readonly discountAmount: Decimal;
  /** 値引率（百分率・小数2桁）。業者金額合計がゼロの場合は null（39.5） */
  readonly discountRatePercent: Decimal | null;
  /** 利益額 = 見積金額合計 - 実行金額合計（39.7） */
  readonly profitAmount: Decimal;
  /** 利益率（百分率・小数2桁）。見積金額合計がゼロの場合は null（39.8） */
  readonly profitRatePercent: Decimal | null;
}

/** design.md の `EstimateCalculations` 契約 */
export interface EstimateCalculations {
  allocateNet(
    rows: readonly AllocationRow[],
    netAmount: Decimal,
    excludeKeys: ReadonlySet<NodeKey>
  ): readonly AllocationResult[];
  applyProfitRate(
    rows: readonly ProfitRateRow[],
    rate: Decimal,
    option: OverwriteOption
  ): readonly ProfitRateResult[];
  summarize(tree: readonly EditableItem[]): EstimateSummary;
  roundMoney(value: Decimal): Decimal;
  roundQuantity(value: Decimal): Decimal;
}

// ============================================================================
// 丸め
// ============================================================================

/**
 * 金額・単価の丸め（小数第1位で四捨五入して整数にする）
 *
 * 負数は絶対値で四捨五入し符号を保持する（例: -566.5 → -567）。
 * `Decimal.ROUND_HALF_UP` は「等距離ならゼロから離れる方向」であり、
 * 正の無限大方向へ丸める `Math.round` とは負数で異なる（design.md:3504）。
 *
 * Requirements: 22.2, 22.3, 22.4, 22.5, 22.6, 22.9, 41.6
 */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * 数量の丸め（小数2桁）
 *
 * Requirements: 22.1
 */
export function roundQuantity(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// ============================================================================
// 対象選定
// ============================================================================

/**
 * 案分・利益率の対象になる行かを判定する
 *
 * 値引き行（41.9）と注記行（55.4）は対象外。
 * これらは構造上 VENDOR / EXECUTION 行を持たないため通常は混入しないが、
 * サーバー実装（`EstimateCalculationService`）と同様に明示ガードを置く。
 */
function isCalculationTarget(itemType: EstimateEditItemType | undefined): boolean {
  return itemType !== 'DISCOUNT' && itemType !== 'NOTE';
}

function amountOrZero(value: Decimal | null): Decimal {
  return value ?? new Decimal(0);
}

// ============================================================================
// NET金額案分（5.4, 5.5, 22.4, 22.5）
// ============================================================================

/**
 * NET金額を業者金額行の比率で案分する
 *
 * - 除外指定・値引き行・注記行は対象から外し、対象合計にも算入しない
 * - 対象合計がゼロの場合は比率・案分金額・単価をすべてゼロとする
 * - 案分後単価は 案分金額 ÷ 数量。数量が未設定またはゼロの場合は案分金額をそのまま単価とする
 *   （サーバー実装 `estimates.routes.ts` の `calculate-net` と同一規則）
 *
 * Requirements: 5.4, 5.5, 5.8, 22.4, 22.5, 41.9, 49.6, 55.4
 */
export function allocateNet(
  rows: readonly AllocationRow[],
  netAmount: Decimal,
  excludeKeys: ReadonlySet<NodeKey>
): readonly AllocationResult[] {
  const targets = rows.filter(
    (row) => !excludeKeys.has(row.key) && isCalculationTarget(row.itemType)
  );

  const totalAmount = targets.reduce(
    (sum, row) => sum.add(amountOrZero(row.amount)),
    new Decimal(0)
  );

  const zero = new Decimal(0);

  return targets.map((row) => {
    const ratio = totalAmount.isZero() ? zero : amountOrZero(row.amount).div(totalAmount);
    const allocatedAmount = totalAmount.isZero() ? zero : roundMoney(netAmount.mul(ratio));
    const unitPrice =
      row.quantity !== null && !row.quantity.isZero()
        ? roundMoney(allocatedAmount.div(row.quantity))
        : allocatedAmount;

    return { key: row.key, ratio, allocatedAmount, unitPrice };
  });
}

// ============================================================================
// 利益率適用（6.1〜6.4, 6.7, 22.6）
// ============================================================================

/**
 * 実行金額行の単価に利益率を適用した見積金額行の値を求める
 *
 * `rate` は百分率（例: 12.27）で受け取り、`rate / 100 + 1` を乗率とする
 * （サーバー実装 `EstimateCalculationService.previewProfitRate` と同一）。
 *
 * 上書きオプションの3分岐（6.2〜6.4）は結果行のフラグとして返す。
 * - `all`: 名称・規格・単位・数量・単価を複写し、金額は 実行金額行の数量 × 新しい単価
 * - `empty_only`: 編集中の見積金額行の単価が空の行のみ反映する（6.7）。複写範囲は `all` と同じ
 * - `unit_price_only`: 単価のみ反映し、金額は 見積金額行の数量 × 新しい単価
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 22.6, 41.9, 49.6, 55.4
 */
export function applyProfitRate(
  rows: readonly ProfitRateRow[],
  rate: Decimal,
  option: OverwriteOption
): readonly ProfitRateResult[] {
  const multiplier = rate.div(100).add(1);
  const copyLineFields = option !== 'unit_price_only';

  return rows
    .filter((row) => isCalculationTarget(row.itemType))
    .map((row) => {
      if (row.executionUnitPrice === null) {
        return {
          key: row.key,
          originalUnitPrice: null,
          newUnitPrice: null,
          newAmount: null,
          applied: false,
          copyLineFields,
        };
      }

      const newUnitPrice = roundMoney(row.executionUnitPrice.mul(multiplier));
      const quantity = copyLineFields ? row.executionQuantity : row.estimateQuantity;
      const newAmount = quantity === null ? null : roundMoney(quantity.mul(newUnitPrice));

      // 6.3 / 6.7: 「空の場合のみ上書き」は編集中の見積金額行の単価で判定する
      const applied = option === 'empty_only' ? row.estimateUnitPrice === null : true;

      return {
        key: row.key,
        originalUnitPrice: row.executionUnitPrice,
        newUnitPrice,
        newAmount,
        applied,
        copyLineFields,
      };
    });
}

// ============================================================================
// サマリー（39.1〜39.8, 39.10）
// ============================================================================

function totalByLineType(tree: readonly EditableItem[], lineType: EstimateLineType): Decimal {
  // 子項目の金額は親項目へ集計済み（`estimateTree.recalculateAncestorAmounts`）のため、
  // ルート階層のみを合計する。注記行は金額の集計対象から除外する（55.2）。
  return tree.reduce((total, item) => {
    if (!isAggregatableChild(item)) {
      return total;
    }
    const amount = item.lines.find((candidate) => candidate.lineType === lineType)?.amount;
    if (amount === null || amount === undefined || amount === '') {
      return total;
    }
    try {
      return total.add(new Decimal(amount));
    } catch {
      return total;
    }
  }, new Decimal(0));
}

function ratePercent(numerator: Decimal, denominator: Decimal): Decimal | null {
  if (denominator.isZero()) {
    return null;
  }
  return numerator.div(denominator).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * 編集中の明細からサマリー各項目を算出する
 *
 * 値引き行の金額（負数を含む）は見積金額合計に加算し（41.8）、
 * 注記行は集計対象から除外する（55.2）。
 *
 * 前提: 親項目の金額は `estimateTree.recalculateAncestorAmounts` により
 * 子の合計へ確定済みであること（再集計の責務は編集状態の遷移側が持ち、
 * ここでは二重に行わない）。
 *
 * Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.10, 41.8, 55.2
 */
export function summarize(tree: readonly EditableItem[]): EstimateSummary {
  const vendorTotal = totalByLineType(tree, 'VENDOR');
  const executionTotal = totalByLineType(tree, 'EXECUTION');
  const estimateTotal = totalByLineType(tree, 'ESTIMATE');

  const discountAmount = executionTotal.sub(vendorTotal);
  const profitAmount = estimateTotal.sub(executionTotal);

  return {
    vendorTotal,
    executionTotal,
    estimateTotal,
    discountAmount,
    discountRatePercent: ratePercent(discountAmount, vendorTotal),
    profitAmount,
    profitRatePercent: ratePercent(profitAmount, estimateTotal),
  };
}

// ============================================================================
// 名前空間オブジェクト
// ============================================================================

/** design.md の `EstimateCalculations` 契約に対応する名前空間オブジェクト */
export const estimateCalculations: EstimateCalculations = {
  allocateNet,
  applyProfitRate,
  summarize,
  roundMoney,
  roundQuantity,
};
