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
 * - 15.4: 箇所数は1〜9999999の範囲で入力可能とする（Requirement 47）
 * - 15.5: 箇所数に小数を含む値が入力された場合は入力を拒否する（Requirement 47）
 * - 47.8: 箇所数フィールドを必須項目とし、入力可能範囲を1〜9999999の整数とする
 * - 47.10: 箇所数フィールドに小数を含む値が入力された場合は入力を拒否する
 * - 47.11: 箇所数フィールドに範囲外の値が入力された場合はエラーメッセージを表示する
 *
 * Task 12.4: 数値フィールドの入力制御と範囲チェックを実装する
 * Task 66.1: 数値範囲バリデーションに整数制約を追加する
 *
 * @module utils/numeric-range-validation
 */

import { COUNT_MIN, COUNT_MAX } from './calculation-engine';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 数値範囲チェック対象のフィールドタイプ
 */
export type NumericRangeFieldType =
  | 'adjustmentFactor'
  | 'roundingUnit'
  | 'quantity'
  | 'dimension'
  | 'count';

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
  /**
   * 整数のみを許容するか（REQ-47 AC8/AC10）
   *
   * 未指定または false の場合は小数を許容する（既存フィールドの挙動を維持）。
   */
  integer?: boolean;
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
  count: {
    // 範囲の二重定義を避けるため calculation-engine の定数を参照する（REQ-47 AC8）
    min: COUNT_MIN,
    max: COUNT_MAX,
    label: '箇所数',
    integer: true,
  },
};

// ============================================================================
// バリデーション関数
// ============================================================================

/**
 * 数値範囲の検証を行う
 *
 * `integer` 制約を持つフィールド（箇所数）では範囲チェックに加えて整数チェックを行う。
 * `integer` が未指定のフィールドでは従来どおり整数チェックを行わない（小数を許容する）。
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

  // 整数制約（REQ-47 AC10 / REQ-15 AC5）: 範囲エラーと区別できる文言を返す
  if (config.integer === true && !Number.isInteger(value)) {
    return {
      isValid: false,
      error: `${config.label}は整数で入力してください`,
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
