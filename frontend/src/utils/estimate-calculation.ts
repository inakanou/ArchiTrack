/**
 * @fileoverview EstimateCalculator - クライアントサイド見積金額計算モジュール
 *
 * 見積書編集画面でのリアルタイム金額計算を担当します。
 * API呼び出しを最小化するため、プレビュー計算はクライアントサイドで実行します。
 * Decimal.jsを使用して高精度な10進数計算を実現し、バックエンドと同一精度を保証します。
 *
 * Requirements (estimate-creation):
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 7.1: EstimateCalculator（クライアントサイド計算モジュール）の実装
 *
 * @module utils/estimate-calculation
 */

import Decimal from 'decimal.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 見積項目行の行タイプ
 */
export type EstimateItemLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 見積項目行情報
 */
export interface EstimateItemLine {
  lineType: EstimateItemLineType;
  amount: string | null;
}

/**
 * 見積項目（行情報付き）
 */
export interface EstimateItemWithLines {
  id: string;
  lines: EstimateItemLine[];
}

/**
 * 見積項目の階層構造
 */
export interface EstimateItemHierarchy {
  id: string;
  lines: EstimateItemLine[];
  children: EstimateItemHierarchy[];
}

/**
 * 業者金額行情報（案分計算用）
 */
export interface VendorLineInfo {
  id: string;
  amount: string | null;
}

/**
 * 実行金額行情報（利益率適用用）
 */
export interface ExecutionLineInfo {
  lineId: string;
  unitPrice: string | null;
}

/**
 * 案分プレビュー結果
 */
export interface AllocationPreview {
  lineId: string;
  originalAmount: string | null;
  allocatedAmount: string;
  ratio: string;
}

/**
 * 利益率プレビュー結果
 */
export interface ProfitRatePreview {
  lineId: string;
  originalUnitPrice: string | null;
  newUnitPrice: string | null;
}

// ============================================================================
// EstimateCalculator クラス
// ============================================================================

/**
 * 見積計算クラス（静的メソッドのみ）
 *
 * クライアントサイドでの高精度金額計算を提供し、API呼び出しを最小化します。
 * バックエンドのEstimateCalculationServiceと同一のロジックを実装しています。
 */
export class EstimateCalculator {
  /**
   * 金額を計算する（数量 x 単価）
   *
   * Requirements: REQ-1.3, REQ-13.6
   *
   * @param quantity - 数量（文字列またはnull）
   * @param unitPrice - 単価（文字列またはnull）
   * @returns 金額（Decimal）。数量または単価がnull/空文字の場合はnull。小数点以下2桁で四捨五入。
   */
  static calculateAmount(quantity: string | null, unitPrice: string | null): Decimal | null {
    if (quantity === null || quantity === '' || unitPrice === null || unitPrice === '') {
      return null;
    }

    try {
      const q = new Decimal(quantity);
      const p = new Decimal(unitPrice);
      return q.mul(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    } catch {
      return null;
    }
  }

  /**
   * 単価を丸める（小数第1位で四捨五入して整数にする）
   *
   * Requirements: REQ-22.2
   *
   * @param unitPrice - 単価（文字列またはnull）
   * @returns 丸めた単価（文字列）。null/空文字の場合はnull。
   */
  static roundUnitPrice(unitPrice: string | null): string | null {
    if (unitPrice === null || unitPrice === '') {
      return null;
    }

    try {
      return new Decimal(unitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
    } catch {
      return null;
    }
  }

  /**
   * 数量を小数2桁固定でフォーマットする
   *
   * Requirements: REQ-22.1, REQ-22.7
   *
   * @param quantity - 数量（文字列またはnull）
   * @returns フォーマットされた数量（文字列）。null/空文字の場合はnull。
   */
  static formatQuantity(quantity: string | null): string | null {
    if (quantity === null || quantity === '') {
      return null;
    }

    try {
      return new Decimal(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    } catch {
      return null;
    }
  }

  /**
   * 見積項目配列から見積金額行の合計を計算する
   *
   * Requirements: REQ-1.5
   *
   * @param items - 見積項目配列
   * @returns 合計金額（Decimal）
   */
  static calculateSubtotal(items: EstimateItemWithLines[]): Decimal {
    if (items.length === 0) {
      return new Decimal(0);
    }

    return items.reduce((sum, item) => {
      const estimateLine = item.lines.find((l) => l.lineType === 'ESTIMATE');
      if (estimateLine?.amount) {
        try {
          return sum.add(new Decimal(estimateLine.amount));
        } catch {
          return sum;
        }
      }
      return sum;
    }, new Decimal(0));
  }

  /**
   * 階層構造の金額を計算する
   *
   * 子項目を持つ場合、親項目の金額は子項目の金額合計として計算されます。
   * 再帰的に処理し、下位の階層から計算を行います。
   *
   * Requirements: REQ-2.3
   *
   * @param hierarchy - 階層構造の見積項目一覧
   * @returns 金額が計算された階層構造
   */
  static calculateHierarchyAmounts(hierarchy: EstimateItemHierarchy[]): EstimateItemHierarchy[] {
    return hierarchy.map((item) => this.calculateItemAmount(item));
  }

  /**
   * 単一項目の金額を計算する（再帰）
   */
  private static calculateItemAmount(item: EstimateItemHierarchy): EstimateItemHierarchy {
    // まず子項目を再帰的に処理
    const processedChildren = item.children.map((child) => this.calculateItemAmount(child));

    // 子項目がある場合、子項目の金額合計を親の金額とする
    if (processedChildren.length > 0) {
      const childAmounts = processedChildren
        .map((child) => {
          const estimateLine = child.lines.find((l) => l.lineType === 'ESTIMATE');
          if (estimateLine?.amount) {
            try {
              return new Decimal(estimateLine.amount);
            } catch {
              return null;
            }
          }
          return null;
        })
        .filter((amount): amount is Decimal => amount !== null);

      const totalAmount = childAmounts.reduce((sum, amount) => sum.add(amount), new Decimal(0));

      // 親の見積金額行を更新
      const updatedLines = item.lines.map((line) => {
        if (line.lineType === 'ESTIMATE') {
          return { ...line, amount: totalAmount.toString() };
        }
        return line;
      });

      return {
        ...item,
        lines: updatedLines,
        children: processedChildren,
      };
    }

    // 子項目がない場合はそのまま返す
    return {
      ...item,
      children: processedChildren,
    };
  }

  /**
   * NET金額案分のプレビュー計算
   *
   * 業者金額行の金額比率に基づいてNET金額を案分します。
   * 除外IDに指定された行は案分対象から除外されます。
   *
   * Requirements: REQ-5.1, REQ-5.2, REQ-5.4
   *
   * @param vendorLines - 業者金額行情報の配列
   * @param excludeIds - 除外する行のID配列
   * @param netAmount - NET金額（文字列）
   * @returns 案分プレビュー結果の配列
   */
  static previewNetAllocation(
    vendorLines: VendorLineInfo[],
    excludeIds: string[],
    netAmount: string
  ): AllocationPreview[] {
    const net = new Decimal(netAmount);

    // 除外行を除いた対象行を抽出
    const targetLines = vendorLines.filter((line) => !excludeIds.includes(line.id));

    // 対象行の金額合計を計算
    const totalAmount = targetLines.reduce((sum, line) => {
      if (line.amount) {
        try {
          return sum.add(new Decimal(line.amount));
        } catch {
          return sum;
        }
      }
      return sum;
    }, new Decimal(0));

    // 合計が0の場合は全て0で返す
    if (totalAmount.isZero()) {
      return targetLines.map((line) => ({
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount: '0',
        ratio: '0%',
      }));
    }

    // 各行の案分を計算
    return targetLines.map((line) => {
      let amount: Decimal;
      try {
        amount = line.amount ? new Decimal(line.amount) : new Decimal(0);
      } catch {
        amount = new Decimal(0);
      }

      const ratio = amount.div(totalAmount);
      const allocatedAmount = net.mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

      // 比率を%表示用に変換（小数点2桁）
      const ratioPercent = ratio.mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      return {
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount: allocatedAmount.toString(),
        ratio: `${ratioPercent.toString()}%`,
      };
    });
  }

  /**
   * 利益率適用のプレビュー計算
   *
   * 実行金額行の単価に利益率を適用した新しい単価を計算します。
   *
   * Requirements: REQ-6.1
   *
   * @param executionLines - 実行金額行情報の配列
   * @param profitRate - 利益率（%、文字列）
   * @returns 利益率プレビュー結果の配列
   */
  static previewProfitRate(
    executionLines: ExecutionLineInfo[],
    profitRate: string
  ): ProfitRatePreview[] {
    const rate = new Decimal(profitRate).div(100).add(1); // 例: 10% -> 1.10

    return executionLines.map((line) => {
      if (line.unitPrice === null || line.unitPrice === '') {
        return {
          lineId: line.lineId,
          originalUnitPrice: line.unitPrice === '' ? null : line.unitPrice,
          newUnitPrice: null,
        };
      }

      try {
        const originalPrice = new Decimal(line.unitPrice);
        const newUnitPrice = originalPrice.mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

        return {
          lineId: line.lineId,
          originalUnitPrice: line.unitPrice,
          newUnitPrice: newUnitPrice.toString(),
        };
      } catch {
        return {
          lineId: line.lineId,
          originalUnitPrice: line.unitPrice,
          newUnitPrice: null,
        };
      }
    });
  }

  /**
   * 利益率の妥当性を検証する
   *
   * Requirements: REQ-13.3（0.00〜500.00の範囲）
   *
   * @param profitRate - 利益率（文字列）
   * @returns 有効な場合true
   */
  static validateProfitRate(profitRate: string): boolean {
    if (!profitRate || profitRate === '') {
      return false;
    }

    try {
      const rate = new Decimal(profitRate);

      // 範囲チェック: 0.00 〜 500.00
      if (rate.lt(0) || rate.gt(500)) {
        return false;
      }

      return true;
    } catch {
      // 数値変換エラー
      return false;
    }
  }
}
