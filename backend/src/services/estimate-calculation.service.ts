/**
 * @fileoverview 見積計算サービス
 *
 * 見積書の金額計算、NET金額案分、利益率適用を担当します。
 * Decimal.jsを使用して高精度な10進数計算を実現します。
 *
 * **本サービスは Task 55.7 以降、HTTP経路からは呼ばれない（意図的な維持）。**
 * 案分・利益率適用は `POST /:id/calculate-net` / `POST /:id/apply-profit-rate` の撤去に伴い
 * クライアントの `frontend/src/domain/estimate/estimateCalculations.ts` へ一本化された
 * （REQ-49.3）。それでも本サービスを残すのは、design.md の撤去段階表（`Modified Files`）が
 * 撤去対象として挙げるのはエンドポイントだけであり、かつ REQ-5.8 / 6.8 が求める
 * 「クライアント計算がサーバー実装と一致する」ことの**照合先**が本実装だからである。
 * `estimateCalculations.test.ts` の固定値は本サービスを実行して採取されており
 * （Task 55.1）、本サービスを消すと一致の再導出ができなくなる。
 * 撤去する場合は照合先の移設とセットで行うこと。
 *
 * Requirements (estimate-creation):
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-5.1: 業者と対象の業者金額行を指定し、案分対象として選択状態にする
 * - REQ-5.2: 案分から除外する諸経費行を指定した場合、案分対象から除外する
 * - REQ-5.3: NET金額を入力した場合、除外された諸経費行以外を実行金額行に転記する
 * - REQ-5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - REQ-5.5: 案分計算が実行された場合、案分後の金額を自動計算して表示する
 * - REQ-6.1: 利益率を指定した場合、全実行金額行に対して利益率を適用した単価を計算する
 * - REQ-6.2: 「すべて上書き」オプションを選択した場合、名称・規格・単位・数量・単価を上書きする
 * - REQ-6.3: 「空の場合のみ上書き」オプションを選択した場合、空の項目のみ上書きする
 * - REQ-6.4: 「単価のみ上書き」オプションを選択した場合、単価のみを上書きする
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 3.1: EstimateCalculationServiceの実装（金額計算基盤）
 * Task 3.2: NET金額計算と案分機能の実装
 * Task 3.3: 利益率適用機能の実装
 *
 * @module services/estimate-calculation
 */

import Decimal from 'decimal.js';

/**
 * 業者金額行情報（案分計算用）
 */
export interface VendorLineInfo {
  id: string;
  amount: Decimal | null;
  /**
   * 見積項目の種別（任意）。
   * REQ-41.9: 値引き行（DISCOUNT）はNET案分の対象外。
   * 値引き行は構造上VENDOR行を持たないため通常は混入しないが、防御的に除外する。
   * 未指定は STANDARD として従来通り扱う。
   */
  itemType?: 'STANDARD' | 'DISCOUNT';
}

/**
 * 実行金額行情報（利益率適用用）
 */
export interface ExecutionLineInfo {
  lineId: string;
  unitPrice: Decimal | null;
  /**
   * 見積項目の種別（任意）。
   * REQ-41.9: 値引き行（DISCOUNT）は利益率適用の対象外。
   * 値引き行は構造上EXECUTION行を持たないため通常は混入しないが、防御的に除外する。
   * 未指定は STANDARD として従来通り扱う。
   */
  itemType?: 'STANDARD' | 'DISCOUNT';
}

/**
 * 案分プレビュー結果
 */
export interface AllocationPreview {
  lineId: string;
  originalAmount: Decimal | null;
  allocatedAmount: Decimal;
  ratio: Decimal;
}

/**
 * 利益率プレビュー結果
 */
export interface ProfitRatePreview {
  lineId: string;
  originalUnitPrice: Decimal | null;
  newUnitPrice: Decimal | null;
}

/**
 * オーバーフローチェック結果
 */
export interface OverflowCheckResult {
  isOverflow: boolean;
  warning?: string;
}

/**
 * 階層金額計算用の項目
 */
export interface HierarchyItem {
  id: string;
  lines: Array<{
    lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
    amount: Decimal | null;
  }>;
  children: HierarchyItem[];
}

/**
 * 見積計算サービス
 *
 * 見積書の金額計算、NET金額案分、利益率適用を担当します。
 * Decimal.jsを使用して高精度な10進数計算を実現します。
 */
export class EstimateCalculationService {
  /**
   * Decimal(15, 2)の最大値（金額オーバーフロー検出用）
   */
  private readonly MAX_AMOUNT = new Decimal('9999999999999.99');

  /**
   * 金額を計算する（数量 x 単価）
   *
   * Requirements: REQ-1.3, REQ-13.6
   *
   * @param quantity - 数量（文字列またはnull）
   * @param unitPrice - 単価（文字列またはnull）
   * @returns 金額（Decimal）。数量または単価がnullの場合はnull。小数点以下2桁で四捨五入。
   */
  calculateAmount(quantity: string | null, unitPrice: string | null): Decimal | null {
    if (quantity === null || unitPrice === null) {
      return null;
    }

    const q = new Decimal(quantity);
    const p = new Decimal(unitPrice);
    return q.mul(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  /**
   * 金額の合計を計算する
   *
   * Requirements: REQ-1.5
   *
   * @param amounts - 金額の配列
   * @returns 合計金額
   */
  calculateSubtotal(amounts: Decimal[]): Decimal {
    if (amounts.length === 0) {
      return new Decimal(0);
    }

    return amounts.reduce((acc, amount) => acc.add(amount), new Decimal(0));
  }

  /**
   * 階層構造の金額を計算する
   *
   * 子項目を持つ場合、親項目の金額は子項目の金額合計として計算される。
   * 再帰的に処理し、下位の階層から計算を行う。
   *
   * Requirements: REQ-2.3
   *
   * @param hierarchy - 階層構造の見積項目一覧
   * @returns 金額が計算された階層構造
   */
  calculateHierarchyAmounts(hierarchy: HierarchyItem[]): HierarchyItem[] {
    return hierarchy.map((item) => this.calculateItemAmount(item));
  }

  /**
   * 単一項目の金額を計算する（再帰）
   */
  private calculateItemAmount(item: HierarchyItem): HierarchyItem {
    // まず子項目を再帰的に処理
    const processedChildren = item.children.map((child) => this.calculateItemAmount(child));

    // 子項目がある場合、子項目の金額合計を親の金額とする
    if (processedChildren.length > 0) {
      const childAmounts = processedChildren
        .map((child) => {
          const estimateLine = child.lines.find((l) => l.lineType === 'ESTIMATE');
          return estimateLine?.amount ?? null;
        })
        .filter((amount): amount is Decimal => amount !== null);

      const totalAmount = this.calculateSubtotal(childAmounts);

      // 親の見積金額行を更新
      const updatedLines = item.lines.map((line) => {
        if (line.lineType === 'ESTIMATE') {
          return { ...line, amount: totalAmount };
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
   * 業者金額行の金額比率に基づいてNET金額を案分する。
   * 除外IDに指定された行は案分対象から除外される。
   *
   * Requirements: REQ-5.1, REQ-5.2, REQ-5.4
   *
   * @param vendorLines - 業者金額行情報の配列
   * @param excludeIds - 除外する行のID配列
   * @param netAmount - NET金額（文字列）
   * @returns 案分プレビュー結果の配列
   */
  previewNetAllocation(
    vendorLines: VendorLineInfo[],
    excludeIds: string[],
    netAmount: string
  ): AllocationPreview[] {
    const net = new Decimal(netAmount);

    // 除外行および値引き行（REQ-41.9: itemType=DISCOUNT）を除いた対象行を抽出
    // 値引き行は構造上VENDOR行を持たないため通常は混入しないが、防御的に除外する。
    // 除外後の合計・案分率にDISCOUNT行の金額が一切影響しない。
    const targetLines = vendorLines.filter(
      (line) => !excludeIds.includes(line.id) && line.itemType !== 'DISCOUNT'
    );

    // 対象行の金額合計を計算
    const totalAmount = targetLines.reduce((sum, line) => {
      const amount = line.amount ?? new Decimal(0);
      return sum.add(amount);
    }, new Decimal(0));

    // 合計が0の場合は全て0で返す
    if (totalAmount.isZero()) {
      return targetLines.map((line) => ({
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount: new Decimal(0),
        ratio: new Decimal(0),
      }));
    }

    // 各行の案分を計算
    return targetLines.map((line) => {
      const amount = line.amount ?? new Decimal(0);
      const ratio = amount.div(totalAmount);
      const allocatedAmount = net.mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

      return {
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount,
        ratio,
      };
    });
  }

  /**
   * 利益率適用のプレビュー計算
   *
   * 実行金額行の単価に利益率を適用した新しい単価を計算する。
   *
   * Requirements: REQ-6.1
   *
   * @param executionLines - 実行金額行情報の配列
   * @param profitRate - 利益率（%、文字列）
   * @returns 利益率プレビュー結果の配列
   */
  previewProfitRate(executionLines: ExecutionLineInfo[], profitRate: string): ProfitRatePreview[] {
    const rate = new Decimal(profitRate).div(100).add(1); // 例: 10% → 1.10

    // 値引き行（REQ-41.9: itemType=DISCOUNT）を対象から除外する。
    // 値引き行は構造上EXECUTION行を持たないため通常は混入しないが、防御的に除外する。
    // 結果配列にDISCOUNT行を含めない（＝単価が変化しない＝対象外）。
    const targetLines = executionLines.filter((line) => line.itemType !== 'DISCOUNT');

    return targetLines.map((line) => {
      if (line.unitPrice === null) {
        return {
          lineId: line.lineId,
          originalUnitPrice: null,
          newUnitPrice: null,
        };
      }

      const newUnitPrice = line.unitPrice.mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

      return {
        lineId: line.lineId,
        originalUnitPrice: line.unitPrice,
        newUnitPrice,
      };
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
  validateProfitRate(profitRate: string): boolean {
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

  /**
   * 金額のオーバーフローをチェックする
   *
   * Requirements: REQ-13.5
   *
   * @param amount - チェックする金額
   * @returns オーバーフローチェック結果
   */
  checkOverflow(amount: Decimal): OverflowCheckResult {
    if (amount.abs().gt(this.MAX_AMOUNT)) {
      return {
        isOverflow: true,
        warning: `金額が最大値（${this.MAX_AMOUNT.toString()}）を超えています`,
      };
    }

    return {
      isOverflow: false,
    };
  }
}
