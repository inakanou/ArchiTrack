/**
 * @fileoverview 数値範囲バリデーションユーティリティ
 *
 * フィールド仕様に基づく数値範囲検証を担当します。
 *
 * Requirements:
 * - 15.1: 調整係数は-9.99〜9.99の範囲で入力可能とする
 * - 15.2: 丸め設定は0.01〜99.99の範囲で入力可能とする
 * - 15.3: 数量は-999999.99〜9999999.99の範囲で入力可能とする
 * - 15.1: 寸法・ピッチ計算フィールドは0.01〜9999999.99の範囲で入力可能とする
 *
 * Task 12.4: 数値フィールドの入力制御と範囲チェックを実装する
 *
 * @module utils/numeric-range-validation
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * 数値範囲チェック対象のフィールドタイプ
 */
export type NumericRangeFieldType = 'adjustmentFactor' | 'roundingUnit' | 'quantity' | 'dimension';

/**
 * 範囲設定
 */
export interface RangeConfig {
  /** 最小値 */
  min: number;
  /** 最大値 */
  max: number;
  /** フィールド名（日本語） */
  label: string;
}

/**
 * 数値範囲検証結果
 */
export interface NumericRangeValidationResult {
  /** 検証結果 */
  isValid: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * フィールド別の範囲設定
 */
export const FIELD_RANGE_CONFIG: Record<NumericRangeFieldType, RangeConfig> = {
  adjustmentFactor: {
    min: -9.99,
    max: 9.99,
    label: '調整係数',
  },
  roundingUnit: {
    min: 0.01,
    max: 99.99,
    label: '丸め設定',
  },
  quantity: {
    min: -999999.99,
    max: 9999999.99,
    label: '数量',
  },
  dimension: {
    min: 0.01,
    max: 9999999.99,
    label: '寸法/ピッチ',
  },
};

// ============================================================================
// バリデーション関数
// ============================================================================

/**
 * 数値範囲の検証を行う
 *
 * @param value - 検証対象の数値
 * @param fieldType - フィールドタイプ
 * @returns 検証結果
 */
export function validateNumericRange(
  value: number,
  fieldType: NumericRangeFieldType
): NumericRangeValidationResult {
  const config = FIELD_RANGE_CONFIG[fieldType];

  if (value < config.min || value > config.max) {
    return {
      isValid: false,
      error: `${config.label}は${config.min}〜${config.max}の範囲で入力してください`,
    };
  }

  return { isValid: true };
}

/**
 * フィールドタイプに対応する範囲設定を取得する
 *
 * @param fieldType - フィールドタイプ
 * @returns 範囲設定
 */
export function getFieldRangeConfig(fieldType: NumericRangeFieldType): RangeConfig {
  return FIELD_RANGE_CONFIG[fieldType];
}
