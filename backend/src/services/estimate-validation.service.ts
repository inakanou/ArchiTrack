/**
 * @fileoverview 見積計算バリデーションサービス
 *
 * 見積書の計算結果バリデーション、オーバーフロー検出、精度検証を担当します。
 * Decimal.jsを使用して高精度な10進数計算の検証を実現します。
 *
 * Requirements (estimate-creation):
 * - REQ-13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 * - REQ-13.6: 高精度な10進数計算により丸め誤差を最小化する
 *
 * Task 5.2: 計算結果バリデーションの実装
 *
 * @module services/estimate-validation
 */

import Decimal from 'decimal.js';

/**
 * バリデーション結果
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  error?: string;
}

/**
 * 見積計算バリデーションサービス
 *
 * 見積書の計算結果バリデーション、オーバーフロー検出、精度検証を担当します。
 */
export class EstimateValidationService {
  /**
   * Decimal(15, 2)の最大値（金額オーバーフロー検出用）
   * 13桁の整数部 + 2桁の小数部 = 9999999999999.99
   */
  private readonly MAX_AMOUNT = new Decimal('9999999999999.99');

  /**
   * Decimal(15, 4)の最大精度（数量フィールド用）
   * 小数点以下4桁
   */
  private readonly QUANTITY_DECIMAL_PLACES = 4;

  /**
   * Decimal(15, 2)の最大精度（金額・単価フィールド用）
   * 小数点以下2桁
   */
  private readonly AMOUNT_DECIMAL_PLACES = 2;

  /**
   * 利益率の最小値
   */
  private readonly MIN_PROFIT_RATE = new Decimal(0);

  /**
   * 利益率の最大値
   */
  private readonly MAX_PROFIT_RATE = new Decimal(500);

  /**
   * 計算結果をバリデートする
   *
   * Requirements: REQ-13.5
   *
   * @param amount - 計算結果の金額（Decimal または null）
   * @returns バリデーション結果
   */
  validateCalculationResult(amount: Decimal | null): ValidationResult {
    const warnings: string[] = [];

    if (amount === null) {
      return {
        isValid: true,
        warnings: [],
      };
    }

    // オーバーフローチェック
    if (amount.abs().gt(this.MAX_AMOUNT)) {
      warnings.push(
        `金額オーバーフロー: ${amount.toString()} は最大許容値（${this.MAX_AMOUNT.toString()}）を超えています`
      );
      return {
        isValid: false,
        warnings,
      };
    }

    return {
      isValid: true,
      warnings,
    };
  }

  /**
   * Decimal精度をバリデートする
   *
   * Requirements: REQ-13.6
   *
   * @param value - 検証する値
   * @returns バリデーション結果
   */
  validateDecimalPrecision(value: Decimal): ValidationResult {
    const warnings: string[] = [];

    // 小数点以下2桁を超える場合は警告
    const decimalPlaces = this.getDecimalPlaces(value);
    if (decimalPlaces > this.AMOUNT_DECIMAL_PLACES) {
      warnings.push(
        `小数点以下${this.AMOUNT_DECIMAL_PLACES}桁を超える精度（${decimalPlaces}桁）の値です。丸め処理が適用されます。`
      );
    }

    return {
      isValid: true,
      warnings,
    };
  }

  /**
   * 複数の計算結果を一括バリデートする
   *
   * @param amounts - 計算結果の金額配列
   * @returns バリデーション結果
   */
  validateBatchCalculation(amounts: (Decimal | null)[]): ValidationResult {
    const allWarnings: string[] = [];
    let isAllValid = true;

    for (const amount of amounts) {
      const result = this.validateCalculationResult(amount);
      if (!result.isValid) {
        isAllValid = false;
      }
      allWarnings.push(...result.warnings);
    }

    return {
      isValid: isAllValid,
      warnings: allWarnings,
    };
  }

  /**
   * 数量値をバリデートする
   *
   * Requirements: REQ-13.1
   *
   * @param value - 数量値（文字列）
   * @returns バリデーション結果
   */
  validateQuantityValue(value: string): ValidationResult {
    const warnings: string[] = [];

    // 空文字チェック
    if (value === '') {
      return {
        isValid: false,
        warnings,
        error: '数量は必須です',
      };
    }

    // 数値変換チェック
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      return {
        isValid: false,
        warnings,
        error: '数量は数値を入力してください',
      };
    }

    // 精度チェック（Decimal(15, 4)を超える場合は警告）
    const decimalPlaces = this.getDecimalPlaces(decimal);
    if (decimalPlaces > this.QUANTITY_DECIMAL_PLACES) {
      warnings.push(
        `数量の小数点以下${this.QUANTITY_DECIMAL_PLACES}桁を超える精度（${decimalPlaces}桁）の値です。丸め処理が適用されます。`
      );
    }

    return {
      isValid: true,
      warnings,
    };
  }

  /**
   * 単価値をバリデートする
   *
   * Requirements: REQ-13.2
   *
   * @param value - 単価値（文字列）
   * @returns バリデーション結果
   */
  validateUnitPriceValue(value: string): ValidationResult {
    const warnings: string[] = [];

    // 空文字チェック
    if (value === '') {
      return {
        isValid: false,
        warnings,
        error: '単価は必須です',
      };
    }

    // 数値変換チェック
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      return {
        isValid: false,
        warnings,
        error: '単価は数値を入力してください',
      };
    }

    // 精度チェック（Decimal(15, 2)を超える場合は警告）
    const decimalPlaces = this.getDecimalPlaces(decimal);
    if (decimalPlaces > this.AMOUNT_DECIMAL_PLACES) {
      warnings.push(
        `単価の小数点以下${this.AMOUNT_DECIMAL_PLACES}桁を超える精度（${decimalPlaces}桁）の値です。丸め処理が適用されます。`
      );
    }

    return {
      isValid: true,
      warnings,
    };
  }

  /**
   * 利益率値をバリデートする
   *
   * Requirements: REQ-13.3
   *
   * @param value - 利益率値（文字列）
   * @returns バリデーション結果
   */
  validateProfitRateValue(value: string): ValidationResult {
    // 空文字チェック
    if (value === '') {
      return {
        isValid: false,
        warnings: [],
        error: '利益率は必須です',
      };
    }

    // 数値変換チェック
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      return {
        isValid: false,
        warnings: [],
        error: '利益率は数値を入力してください',
      };
    }

    // 範囲チェック（0.00〜500.00）
    if (decimal.lt(this.MIN_PROFIT_RATE) || decimal.gt(this.MAX_PROFIT_RATE)) {
      return {
        isValid: false,
        warnings: [],
        error: `利益率は${this.MIN_PROFIT_RATE.toString()}〜${this.MAX_PROFIT_RATE.toString()}の範囲で入力してください`,
      };
    }

    return {
      isValid: true,
      warnings: [],
    };
  }

  /**
   * NET金額値をバリデートする
   *
   * @param value - NET金額値（文字列）
   * @returns バリデーション結果
   */
  validateNetAmountValue(value: string): ValidationResult {
    // 空文字チェック
    if (value === '') {
      return {
        isValid: false,
        warnings: [],
        error: 'NET金額は必須です',
      };
    }

    // 数値変換チェック
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      return {
        isValid: false,
        warnings: [],
        error: 'NET金額は数値を入力してください',
      };
    }

    // 負の値チェック
    if (decimal.lt(0)) {
      return {
        isValid: false,
        warnings: [],
        error: 'NET金額は0以上の数値を入力してください',
      };
    }

    // オーバーフローチェック
    if (decimal.gt(this.MAX_AMOUNT)) {
      return {
        isValid: false,
        warnings: [],
        error: `NET金額オーバーフロー: ${decimal.toString()} は最大許容値（${this.MAX_AMOUNT.toString()}）を超えています`,
      };
    }

    return {
      isValid: true,
      warnings: [],
    };
  }

  /**
   * 小数点以下の桁数を取得する
   *
   * @param value - Decimal値
   * @returns 小数点以下の桁数
   */
  private getDecimalPlaces(value: Decimal): number {
    const str = value.toString();
    const dotIndex = str.indexOf('.');
    if (dotIndex === -1) {
      return 0;
    }
    return str.length - dotIndex - 1;
  }
}
