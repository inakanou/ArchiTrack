/**
 * @fileoverview 数量項目フィールドバリデーションサービス
 *
 * フィールド仕様に基づく入力値検証と表示書式設定を担当します。
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 * - 9.3: 調整係数の入力可能範囲（-9.99〜9.99）
 * - 10.3: 丸め設定の入力可能範囲（-99.99〜99.99）
 * - 15.1: 数量フィールドの入力可能範囲（-999999.99〜9999999.99）
 * - 15.3: 寸法・ピッチ計算フィールドの入力可能範囲（0.01〜9999999.99）
 * - 9.4: 調整係数フィールドの空白時に「1.00」を自動設定
 * - 10.4: 丸め設定フィールドの0または空白時に「0.01」を自動設定
 * - 15.2: 数量フィールドの空白時に「0」を自動設定
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常に表示
 * - 14.3, 14.4: 寸法・ピッチフィールドは数値入力時のみ小数2桁表示
 *
 * Task 11: フィールドバリデーションサービスの拡張
 *
 * @module services/quantity-field-validation
 */

import type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from './quantity-validation.service.js';

/**
 * フィールド仕様定数
 */
export const FIELD_CONSTRAINTS = {
  // テキストフィールド（全角/半角）
  MAJOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MIDDLE_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MINOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  CUSTOM_CATEGORY: { zenkaku: 25, hankaku: 50 },
  WORK_TYPE: { zenkaku: 8, hankaku: 16 },
  NAME: { zenkaku: 25, hankaku: 50 },
  SPECIFICATION: { zenkaku: 25, hankaku: 50 },
  UNIT: { zenkaku: 3, hankaku: 6 },
  CALCULATION_METHOD: { zenkaku: 25, hankaku: 50 },
  REMARKS: { zenkaku: 25, hankaku: 50 },

  // 数値フィールド
  ADJUSTMENT_FACTOR: { min: -9.99, max: 9.99, default: 1.0 },
  ROUNDING_UNIT: { min: -99.99, max: 99.99, default: 0.01 },
  QUANTITY: { min: -999999.99, max: 9999999.99, default: 0 },

  // 寸法・ピッチフィールド
  DIMENSION: { min: 0.01, max: 9999999.99 },
} as const;

/**
 * テキストフィールド検証結果
 */
export interface TextValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * 数量項目フィールドバリデーションサービス
 *
 * フィールド仕様に基づく入力値検証と表示書式設定を提供します。
 */
export class QuantityFieldValidationService {
  /**
   * 文字幅を計算する
   *
   * 全角文字は2、半角文字は1としてカウントします。
   * 判定基準:
   * - U+0000〜U+007F（ASCII）: 半角
   * - U+FF61〜U+FF9F（半角カタカナ）: 半角
   * - その他: 全角
   *
   * @param value - 検証対象の文字列
   * @returns 文字幅
   */
  calculateStringWidth(value: string): number {
    let width = 0;
    for (const char of value) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (
        // ASCII文字（半角英数字・記号）
        (codePoint >= 0x0000 && codePoint <= 0x007f) ||
        // 半角カタカナ
        (codePoint >= 0xff61 && codePoint <= 0xff9f)
      ) {
        width += 1;
      } else {
        // 全角文字
        width += 2;
      }
    }
    return width;
  }

  /**
   * テキストフィールドの文字数検証
   *
   * @param value - 検証対象の文字列
   * @param maxZenkaku - 全角最大文字数
   * @param maxHankaku - 半角最大文字数
   * @returns 検証結果（trueで有効）
   */
  validateTextLength(value: string, _maxZenkaku: number, maxHankaku: number): boolean {
    const width = this.calculateStringWidth(value);
    // 全角文字は2、半角文字は1として計算されるため、
    // 最大幅は半角の最大文字数（= 全角最大 * 2）
    return width <= maxHankaku;
  }

  /**
   * 大項目フィールドの検証
   */
  validateMajorCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MAJOR_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MAJOR_CATEGORY.hankaku,
      '大項目'
    );
  }

  /**
   * 中項目フィールドの検証
   */
  validateMiddleCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MIDDLE_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MIDDLE_CATEGORY.hankaku,
      '中項目'
    );
  }

  /**
   * 小項目フィールドの検証
   */
  validateMinorCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MINOR_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MINOR_CATEGORY.hankaku,
      '小項目'
    );
  }

  /**
   * 任意分類フィールドの検証
   */
  validateCustomCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.CUSTOM_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.CUSTOM_CATEGORY.hankaku,
      '任意分類'
    );
  }

  /**
   * 工種フィールドの検証
   */
  validateWorkType(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.WORK_TYPE.zenkaku,
      FIELD_CONSTRAINTS.WORK_TYPE.hankaku,
      '工種'
    );
  }

  /**
   * 名称フィールドの検証
   */
  validateName(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.NAME.zenkaku,
      FIELD_CONSTRAINTS.NAME.hankaku,
      '名称'
    );
  }

  /**
   * 規格フィールドの検証
   */
  validateSpecification(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.SPECIFICATION.zenkaku,
      FIELD_CONSTRAINTS.SPECIFICATION.hankaku,
      '規格'
    );
  }

  /**
   * 単位フィールドの検証
   */
  validateUnit(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.UNIT.zenkaku,
      FIELD_CONSTRAINTS.UNIT.hankaku,
      '単位'
    );
  }

  /**
   * 計算方法テキストフィールドの検証
   */
  validateCalculationMethodText(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.CALCULATION_METHOD.zenkaku,
      FIELD_CONSTRAINTS.CALCULATION_METHOD.hankaku,
      '計算方法'
    );
  }

  /**
   * 備考フィールドの検証
   */
  validateRemarks(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.REMARKS.zenkaku,
      FIELD_CONSTRAINTS.REMARKS.hankaku,
      '備考'
    );
  }

  /**
   * テキストフィールドの汎用検証
   */
  private validateTextField(
    value: string,
    maxZenkaku: number,
    maxHankaku: number,
    fieldName: string
  ): TextValidationResult {
    if (this.validateTextLength(value, maxZenkaku, maxHankaku)) {
      return { isValid: true };
    }
    return {
      isValid: false,
      error: `${fieldName}は全角${maxZenkaku}文字/半角${maxHankaku}文字以内で入力してください`,
    };
  }

  /**
   * 数値フィールドの範囲検証
   *
   * @param value - 検証対象の数値
   * @param min - 最小値
   * @param max - 最大値
   * @returns 検証結果
   */
  validateNumericRange(value: number, min: number, max: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'value',
        message: `${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 調整係数の検証
   *
   * @param value - 調整係数値（-9.99〜9.99）
   * @returns 検証結果
   */
  validateAdjustmentFactor(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'adjustmentFactor',
        message: `調整係数は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 丸め設定の検証
   *
   * @param value - 丸め設定値（-99.99〜99.99）
   * @returns 検証結果
   */
  validateRoundingUnit(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.ROUNDING_UNIT;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'roundingUnit',
        message: `丸め設定は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 数量の検証
   *
   * @param value - 数量値（-999999.99〜9999999.99）
   * @returns 検証結果
   */
  validateQuantity(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.QUANTITY;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'quantity',
        message: `数量は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 寸法・ピッチ計算フィールドの検証
   *
   * @param value - 寸法値（0.01〜9999999.99または空白）
   * @returns 検証結果
   */
  validateDimensionField(value: number | null): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.DIMENSION;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // nullは空白を許可
    if (value === null) {
      return {
        isValid: true,
        errors,
        warnings,
      };
    }

    if (value < min || value > max) {
      errors.push({
        field: 'dimension',
        message: `寸法は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 調整係数のデフォルト値適用
   *
   * 空白の場合は1.00を返す
   *
   * @param value - 調整係数値（nullまたはundefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyAdjustmentFactorDefault(value: number | null | undefined): number {
    if (value === null || value === undefined) {
      return FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR.default;
    }
    return value;
  }

  /**
   * 丸め設定のデフォルト値適用
   *
   * 0または空白の場合は0.01を返す
   *
   * @param value - 丸め設定値（0, null, undefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyRoundingUnitDefault(value: number | null | undefined): number {
    if (value === null || value === undefined || value === 0) {
      return FIELD_CONSTRAINTS.ROUNDING_UNIT.default;
    }
    return value;
  }

  /**
   * 数量のデフォルト値適用
   *
   * 空白の場合は0を返す
   *
   * @param value - 数量値（nullまたはundefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyQuantityDefault(value: number | null | undefined): number {
    if (value === null || value === undefined) {
      return FIELD_CONSTRAINTS.QUANTITY.default;
    }
    return value;
  }

  /**
   * 数値を小数2桁表示用に書式設定
   *
   * @param value - 数値
   * @returns 書式設定された文字列（例: 1 → "1.00"）
   */
  formatDecimal2(value: number): string {
    return value.toFixed(2);
  }

  /**
   * 空白または数値を条件付き書式設定
   *
   * @param value - 数値またはnull/undefined
   * @returns 空白時は空文字、数値時は小数2桁
   */
  formatConditionalDecimal2(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    return this.formatDecimal2(value);
  }

  // ============================================================================
  // Task 14.2: 保存時バリデーション
  // ============================================================================

  /**
   * フィールド仕様エラー型
   */

  /**
   * 数量項目の全フィールドをフィールド仕様に基づいて検証する
   *
   * Task 14.2: 保存時バリデーションにフィールド仕様チェックを追加する
   *
   * Requirements:
   * - 11.2: 保存前にすべてのフィールドの文字数・範囲をサーバーサイドで再検証する
   * - 11.3: バリデーションエラー時にエラー箇所を特定する
   * - 11.4: フィールド仕様違反の詳細なエラーメッセージを返却する
   *
   * @param item - 検証対象の数量項目
   * @returns バリデーション結果
   */
  validateItemFieldSpecs(item: {
    majorCategory: string;
    middleCategory: string | null;
    minorCategory: string | null;
    customCategory: string | null;
    workType: string;
    name: string;
    specification: string | null;
    unit: string;
    remarks: string | null;
    adjustmentFactor: number;
    roundingUnit: number;
    quantity: number;
  }): FieldSpecValidationResult {
    const errors: FieldSpecError[] = [];

    // テキストフィールドの文字数検証
    const textFieldsToValidate = [
      { field: 'majorCategory', value: item.majorCategory, validator: () => this.validateMajorCategory(item.majorCategory) },
      { field: 'middleCategory', value: item.middleCategory, validator: () => item.middleCategory ? this.validateMiddleCategory(item.middleCategory) : { isValid: true } },
      { field: 'minorCategory', value: item.minorCategory, validator: () => item.minorCategory ? this.validateMinorCategory(item.minorCategory) : { isValid: true } },
      { field: 'customCategory', value: item.customCategory, validator: () => item.customCategory ? this.validateCustomCategory(item.customCategory) : { isValid: true } },
      { field: 'workType', value: item.workType, validator: () => this.validateWorkType(item.workType) },
      { field: 'name', value: item.name, validator: () => this.validateName(item.name) },
      { field: 'specification', value: item.specification, validator: () => item.specification ? this.validateSpecification(item.specification) : { isValid: true } },
      { field: 'unit', value: item.unit, validator: () => this.validateUnit(item.unit) },
      { field: 'remarks', value: item.remarks, validator: () => item.remarks ? this.validateRemarks(item.remarks) : { isValid: true } },
    ] as const;

    for (const { field, value, validator } of textFieldsToValidate) {
      const result = validator();
      if (!result.isValid && result.error) {
        errors.push({
          field,
          message: result.error,
          value: value ?? undefined,
        });
      }
    }

    // 数値フィールドの範囲検証
    const adjustmentFactorResult = this.validateAdjustmentFactor(item.adjustmentFactor);
    if (!adjustmentFactorResult.isValid) {
      errors.push({
        field: 'adjustmentFactor',
        message: '調整係数は-9.99から9.99の範囲で入力してください',
        value: item.adjustmentFactor,
      });
    }

    // 丸め設定の範囲検証（フィールド仕様: 0.01〜999.99）
    const roundingUnitMin = 0.01;
    const roundingUnitMax = 999.99;
    if (item.roundingUnit < roundingUnitMin || item.roundingUnit > roundingUnitMax) {
      errors.push({
        field: 'roundingUnit',
        message: `丸め設定は${roundingUnitMin}から${roundingUnitMax}の範囲で入力してください`,
        value: item.roundingUnit,
      });
    }

    const quantityResult = this.validateQuantity(item.quantity);
    if (!quantityResult.isValid) {
      errors.push({
        field: 'quantity',
        message: '数量は-999999.99から9999999.99の範囲で入力してください',
        value: item.quantity,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * フィールド仕様違反のエラーレスポンスを生成する
   *
   * Task 14.2: フィールド仕様違反の詳細なエラーメッセージを返却する
   *
   * @param errors - フィールドエラー配列
   * @returns RFC 7807準拠のエラーレスポンス
   */
  createValidationErrorResponse(errors: FieldSpecError[]): FieldValidationErrorResponse {
    const errorMessages = errors.map(e => e.message).join('; ');

    return {
      type: 'https://architrack.example.com/problems/field-validation-error',
      title: 'Field Validation Error',
      status: 400,
      detail: `フィールド仕様違反: ${errorMessages}`,
      code: 'FIELD_VALIDATION_ERROR',
      fieldErrors: errors,
    };
  }
}

/**
 * フィールド仕様エラー型
 */
export interface FieldSpecError {
  /** フィールド名 */
  field: string;
  /** エラーメッセージ */
  message: string;
  /** 問題のある値 */
  value?: string | number;
}

/**
 * フィールド仕様バリデーション結果型
 */
export interface FieldSpecValidationResult {
  /** バリデーション成否 */
  isValid: boolean;
  /** エラー配列 */
  errors: FieldSpecError[];
}

/**
 * フィールドバリデーションエラーレスポンス型
 */
export interface FieldValidationErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: string;
  /** フィールドごとのエラー */
  fieldErrors: FieldSpecError[];
}
