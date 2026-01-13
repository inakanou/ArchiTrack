/**
 * @fileoverview フィールドバリデーションユーティリティ
 *
 * フィールド仕様に基づく入力値検証と文字幅計算を担当します。
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 *
 * Task 12.1: テキストフィールド入力制御コンポーネントを実装する
 *
 * @module utils/field-validation
 */

/**
 * テキストフィールド名の型
 */
export type TextFieldName =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'unit'
  | 'calculationMethod'
  | 'remarks';

/**
 * フィールド制約の型
 */
export interface FieldConstraint {
  /** 全角最大文字数 */
  zenkaku: number;
  /** 半角最大文字数（=最大幅） */
  hankaku: number;
}

/**
 * テキストフィールドの検証結果
 */
export interface TextValidationResult {
  /** 検証結果 */
  isValid: boolean;
  /** エラーメッセージ */
  error?: string;
}

/**
 * フィールド仕様定数
 *
 * 各フィールドの最大文字数を定義。
 * 全角文字は幅2、半角文字は幅1としてカウントされるため、
 * 最大幅は半角の最大文字数（= 全角最大 * 2）と等しい。
 */
export const FIELD_CONSTRAINTS: Record<TextFieldName, FieldConstraint> = {
  // 全角25文字/半角50文字
  majorCategory: { zenkaku: 25, hankaku: 50 },
  middleCategory: { zenkaku: 25, hankaku: 50 },
  minorCategory: { zenkaku: 25, hankaku: 50 },
  customCategory: { zenkaku: 25, hankaku: 50 },
  name: { zenkaku: 25, hankaku: 50 },
  specification: { zenkaku: 25, hankaku: 50 },
  calculationMethod: { zenkaku: 25, hankaku: 50 },
  remarks: { zenkaku: 25, hankaku: 50 },

  // 全角8文字/半角16文字
  workType: { zenkaku: 8, hankaku: 16 },

  // 全角3文字/半角6文字
  unit: { zenkaku: 3, hankaku: 6 },
};

/**
 * フィールド名の日本語ラベル
 */
const FIELD_LABELS: Record<TextFieldName, string> = {
  majorCategory: '大項目',
  middleCategory: '中項目',
  minorCategory: '小項目',
  customCategory: '任意分類',
  workType: '工種',
  name: '名称',
  specification: '規格',
  unit: '単位',
  calculationMethod: '計算方法',
  remarks: '備考',
};

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
export function calculateStringWidth(value: string): number {
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
 * @param fieldName - フィールド名
 * @returns 検証結果
 */
export function validateTextLength(value: string, fieldName: TextFieldName): TextValidationResult {
  const constraint = FIELD_CONSTRAINTS[fieldName];
  const width = calculateStringWidth(value);

  if (width <= constraint.hankaku) {
    return { isValid: true };
  }

  const label = FIELD_LABELS[fieldName];
  return {
    isValid: false,
    error: `${label}は全角${constraint.zenkaku}文字/半角${constraint.hankaku}文字以内で入力してください`,
  };
}

/**
 * 残り入力可能幅を取得する
 *
 * @param value - 現在の入力値
 * @param fieldName - フィールド名
 * @returns 残り幅（負の値は超過を意味）
 */
export function getRemainingWidth(value: string, fieldName: TextFieldName): number {
  const constraint = FIELD_CONSTRAINTS[fieldName];
  const currentWidth = calculateStringWidth(value);
  return constraint.hankaku - currentWidth;
}

// ============================================================================
// 数値フォーマット
// ============================================================================

/**
 * 数値を小数2桁の文字列に変換する
 *
 * 調整係数・丸め設定・数量フィールドの表示に使用。
 * 整数値でも常に小数2桁で表示する（例: 1 → "1.00"）。
 *
 * Requirements:
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常時表示する
 *
 * @param value - 変換対象の数値
 * @returns 小数2桁の文字列（例: 1 → "1.00", 1.5 → "1.50"）
 */
export function formatDecimal2(value: number): string {
  return value.toFixed(2);
}

// ============================================================================
// 数値フィールド範囲検証
// Task 14.1: 数値フィールドに範囲チェックを適用する
// ============================================================================

/**
 * 数値フィールドの範囲定義
 *
 * Requirements:
 * - 14.3: 調整係数の範囲（-9.99〜9.99）
 * - 14.4: 丸め設定の範囲（0.01〜999.99）
 * - 15.1: 数量の範囲（-999999.99〜9999999.99）
 */
export const NUMERIC_FIELD_RANGES = {
  adjustmentFactor: { min: -9.99, max: 9.99 },
  roundingUnit: { min: 0.01, max: 999.99 },
  quantity: { min: -999999.99, max: 9999999.99 },
} as const;

/**
 * 数値フィールド名の型
 */
export type NumericFieldName = keyof typeof NUMERIC_FIELD_RANGES;

/**
 * 数値フィールドの日本語ラベル
 */
const NUMERIC_FIELD_LABELS: Record<NumericFieldName, string> = {
  adjustmentFactor: '調整係数',
  roundingUnit: '丸め設定',
  quantity: '数量',
};

/**
 * 数値フィールドの範囲検証
 *
 * @param value - 検証対象の数値
 * @param fieldName - フィールド名
 * @returns 検証結果
 */
export function validateNumericRange(
  value: number,
  fieldName: NumericFieldName
): TextValidationResult {
  const range = NUMERIC_FIELD_RANGES[fieldName];
  const label = NUMERIC_FIELD_LABELS[fieldName];

  if (value >= range.min && value <= range.max) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: `${label}は${range.min}から${range.max}の範囲で入力してください`,
  };
}

// ============================================================================
// 統合バリデーション
// Task 14.1: フィールドバリデーターを使用した入力制御を統合する
// ============================================================================

/**
 * フィールドバリデーションエラーの型
 */
export interface FieldValidationErrors {
  majorCategory?: string;
  middleCategory?: string;
  minorCategory?: string;
  customCategory?: string;
  workType?: string;
  name?: string;
  specification?: string;
  unit?: string;
  calculationMethod?: string;
  remarks?: string;
  adjustmentFactor?: string;
  roundingUnit?: string;
  quantity?: string;
}

/**
 * 数量項目のフィールドバリデーション入力型
 */
export interface QuantityItemValidationInput {
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
}

/**
 * 数量項目の全フィールドを検証する
 *
 * Task 14.1: フィールドバリデーターを使用した入力制御を統合する
 *
 * Requirements:
 * - 13.1, 13.2, 13.3: テキストフィールドの文字数制限
 * - 14.3, 14.4, 15.1: 数値フィールドの範囲チェック
 *
 * @param item - 検証対象の数量項目
 * @returns フィールドごとのエラーメッセージ（エラーがない場合はundefined）
 */
export function validateQuantityItemFields(
  item: QuantityItemValidationInput
): FieldValidationErrors {
  const errors: FieldValidationErrors = {};

  // テキストフィールドの文字数検証
  const textFieldsToValidate: Array<{
    fieldName: TextFieldName;
    value: string | null;
  }> = [
    { fieldName: 'majorCategory', value: item.majorCategory },
    { fieldName: 'middleCategory', value: item.middleCategory },
    { fieldName: 'minorCategory', value: item.minorCategory },
    { fieldName: 'customCategory', value: item.customCategory },
    { fieldName: 'workType', value: item.workType },
    { fieldName: 'name', value: item.name },
    { fieldName: 'specification', value: item.specification },
    { fieldName: 'unit', value: item.unit },
    { fieldName: 'remarks', value: item.remarks },
  ];

  for (const { fieldName, value } of textFieldsToValidate) {
    if (value !== null && value !== undefined && value !== '') {
      const result = validateTextLength(value, fieldName);
      if (!result.isValid) {
        errors[fieldName] = result.error;
      }
    }
  }

  // 数値フィールドの範囲検証
  const numericFieldsToValidate: Array<{
    fieldName: NumericFieldName;
    value: number;
  }> = [
    { fieldName: 'adjustmentFactor', value: item.adjustmentFactor },
    { fieldName: 'roundingUnit', value: item.roundingUnit },
    { fieldName: 'quantity', value: item.quantity },
  ];

  for (const { fieldName, value } of numericFieldsToValidate) {
    if (typeof value === 'number' && !isNaN(value)) {
      const result = validateNumericRange(value, fieldName);
      if (!result.isValid) {
        errors[fieldName] = result.error;
      }
    }
  }

  return errors;
}

/**
 * バリデーションエラーが存在するかチェック
 *
 * @param errors - バリデーションエラー
 * @returns エラーが存在する場合true
 */
export function hasValidationErrors(errors: FieldValidationErrors): boolean {
  return Object.values(errors).some((error) => error !== undefined);
}
