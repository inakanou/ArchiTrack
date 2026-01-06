/**
 * @fileoverview 計算結果メモ化用Hook
 *
 * Task 10.2: パフォーマンス最適化 - 計算結果のメモ化
 *
 * Requirements:
 * - 13.3: 計算結果をキャッシュして再計算を削減
 * - 13.4: 依存値が変更された場合のみ再計算
 *
 * 数量項目の計算結果を効率的にメモ化し、
 * 不必要な再計算を防止します。
 */

import { useMemo } from 'react';
import type { QuantityItemDetail, CalculationMethod, CalculationParams } from '../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useMemoizedCalculationの戻り値
 */
export interface MemoizedCalculationResult {
  /** 計算結果値 */
  calculatedValue: number;
  /** 計算式の文字列表現 */
  formula: string;
  /** 計算が有効かどうか */
  isValid: boolean;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 数値を切り上げて丸める
 *
 * @param value - 丸める値
 * @param unit - 丸め単位
 * @returns 丸められた値
 */
function roundUp(value: number, unit: number): number {
  if (unit <= 0) return value;
  return Math.ceil(value / unit) * unit;
}

/**
 * 計算方式に基づいて基本値を計算
 *
 * @param method - 計算方式
 * @param quantity - 数量（STANDARD計算用）
 * @param params - 計算パラメータ（AREA_VOLUME, PITCH計算用）
 * @returns 計算結果と計算式
 */
function calculateBaseValue(
  method: CalculationMethod,
  quantity: number,
  params: CalculationParams | null
): { value: number; formula: string; isValid: boolean } {
  switch (method) {
    case 'STANDARD': {
      // 標準計算（数量直接入力）
      const value = quantity ?? 0;
      return {
        value,
        formula: String(value),
        isValid: value > 0,
      };
    }

    case 'AREA_VOLUME': {
      // 面積・体積計算
      if (!params) {
        return { value: 0, formula: '', isValid: false };
      }
      const { width, depth, height } = params;
      if (width == null || depth == null) {
        return { value: 0, formula: '', isValid: false };
      }
      if (height != null) {
        // 体積計算
        const value = width * depth * height;
        return {
          value,
          formula: `${width} x ${depth} x ${height} = ${value}`,
          isValid: true,
        };
      } else {
        // 面積計算
        const value = width * depth;
        return {
          value,
          formula: `${width} x ${depth} = ${value}`,
          isValid: true,
        };
      }
    }

    case 'PITCH': {
      // ピッチ計算
      if (!params) {
        return { value: 0, formula: '', isValid: false };
      }
      const { rangeLength, pitchLength } = params;
      if (rangeLength == null || pitchLength == null || pitchLength === 0) {
        return { value: 0, formula: '', isValid: false };
      }
      const value = rangeLength / pitchLength;
      return {
        value,
        formula: `${rangeLength} / ${pitchLength} = ${value}`,
        isValid: true,
      };
    }

    default: {
      return { value: 0, formula: '', isValid: false };
    }
  }
}

/**
 * 調整係数と丸め単位を適用した最終値を計算
 *
 * @param baseValue - 基本計算値
 * @param adjustmentFactor - 調整係数
 * @param roundingUnit - 丸め単位
 * @returns 最終計算値
 */
function applyAdjustments(
  baseValue: number,
  adjustmentFactor: number,
  roundingUnit: number
): number {
  // 調整係数を適用
  let result = baseValue * adjustmentFactor;

  // 丸め単位を適用（切り上げ）
  if (roundingUnit > 1) {
    result = roundUp(result, roundingUnit);
  }

  return result;
}

/**
 * 調整後の計算式を生成
 *
 * @param baseFormula - 基本計算式
 * @param adjustmentFactor - 調整係数
 * @param finalValue - 最終値
 * @returns 調整後の計算式文字列
 */
function buildFinalFormula(
  baseFormula: string,
  adjustmentFactor: number,
  finalValue: number
): string {
  if (adjustmentFactor !== 1) {
    return `(${baseFormula}) x ${adjustmentFactor} = ${finalValue}`;
  }
  return baseFormula;
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * 計算結果メモ化Hook
 *
 * 数量項目の計算結果をメモ化し、依存値が変更された場合のみ
 * 再計算を行います。
 *
 * @param item - 数量項目データ
 * @returns メモ化された計算結果
 *
 * @example
 * ```tsx
 * const { calculatedValue, formula, isValid } = useMemoizedCalculation(item);
 *
 * return (
 *   <div>
 *     <span title={formula}>{calculatedValue}</span>
 *     {!isValid && <span className="error">計算不可</span>}
 *   </div>
 * );
 * ```
 */
export function useMemoizedCalculation(item: QuantityItemDetail): MemoizedCalculationResult {
  return useMemo(() => {
    // 基本値を計算
    const { value: baseValue, formula: baseFormula, isValid } = calculateBaseValue(
      item.calculationMethod,
      item.quantity,
      item.calculationParams
    );

    if (!isValid || baseValue === 0) {
      return {
        calculatedValue: 0,
        formula: baseFormula,
        isValid,
      };
    }

    // 調整係数と丸め単位を取得（デフォルト値）
    const adjustmentFactor = item.adjustmentFactor ?? 1;
    const roundingUnit = item.roundingUnit ?? 1;

    // 調整を適用
    const calculatedValue = applyAdjustments(baseValue, adjustmentFactor, roundingUnit);

    // 最終計算式を生成
    const formula = buildFinalFormula(baseFormula, adjustmentFactor, calculatedValue);

    return {
      calculatedValue,
      formula,
      isValid: true,
    };
  }, [
    item.calculationMethod,
    item.quantity,
    item.calculationParams,
    item.adjustmentFactor,
    item.roundingUnit,
  ]);
}

export default useMemoizedCalculation;
