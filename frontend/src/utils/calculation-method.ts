/**
 * @fileoverview 計算方法レジストリ（単一情報源）
 *
 * 計算方法の表示順・表示ラベル・選択肢・有効な計算パラメータキーを1箇所に集約する。
 * セレクトボックス（CalculationMethodSelect）・PDF出力（QuantityTableEditPage のラベル変換）・
 * 計算方法切替時のリセット処理（EditableQuantityItemRow）は、すべて本モジュールを参照する。
 *
 * ラベルとパラメータキーは `Record<CalculationMethod, ...>` で定義しているため、
 * `CalculationMethod` に値を追加すると定義漏れがコンパイルエラーになる。
 *
 * Requirements:
 * - 47.1: 計算方法の選択肢に「箇所数」を含める
 * - 47.17: 計算方法「箇所数」の数量項目をPDF出力する（ラベルの単一情報源）
 * - 48.1: 計算方法の変更時、変更前の計算方法に固有の計算用パラメータを破棄する
 * - 48.2: 変更前後で共通する計算用フィールド（「長さ」「重量」等）の入力値は引き継ぐ
 */

import type { CalculationMethod, CalculationParams } from '../types/quantity-edit.types';

/** セレクトボックスの表示順（標準 → 面積・体積 → ピッチ → 箇所数） */
export const CALCULATION_METHOD_ORDER: readonly CalculationMethod[] = [
  'STANDARD',
  'AREA_VOLUME',
  'PITCH',
  'COUNT',
] as const;

/** 計算方法の表示ラベル（セレクトボックスとPDF出力の共通情報源） */
export const CALCULATION_METHOD_LABELS: Record<CalculationMethod, string> = {
  STANDARD: '標準',
  AREA_VOLUME: '面積・体積',
  PITCH: 'ピッチ',
  COUNT: '箇所数',
};

/** セレクトボックスの選択肢 */
export interface CalculationMethodOption {
  readonly value: CalculationMethod;
  readonly label: string;
}

/** 表示順どおりに生成された計算方法の選択肢 */
export const CALCULATION_METHOD_OPTIONS: readonly CalculationMethodOption[] =
  CALCULATION_METHOD_ORDER.map((value) => ({
    value,
    label: CALCULATION_METHOD_LABELS[value],
  }));

/**
 * 計算方法ごとの有効なパラメータキー
 *
 * CalculationFields の FIELDS_BY_METHOD と対応する。永続化・表示・計算に使用しない
 * キーを切替時に破棄するための唯一の基準とする。
 */
export const PARAM_KEYS_BY_METHOD: Record<CalculationMethod, readonly string[]> = {
  STANDARD: [],
  AREA_VOLUME: ['width', 'depth', 'height', 'weight'],
  PITCH: ['rangeLength', 'endLength1', 'endLength2', 'pitchLength', 'length', 'weight'],
  COUNT: ['count', 'length', 'weight'],
};

/**
 * 切替後の計算方法で使用するキーのみを残した新しいパラメータを返す
 *
 * 共通キー（「長さ」「重量」等）に入力済みの値は引き継がれる（REQ-48 AC2）。
 * 「標準」は計算用パラメータを持たないため null を返す。
 * 入力オブジェクトは変更しない。
 *
 * @param params 切替前の計算用パラメータ
 * @param method 切替後の計算方法
 * @returns 切替後の計算方法で有効なキーのみを持つパラメータ（「標準」の場合は null）
 */
export function resetParamsForMethod(
  params: CalculationParams | null,
  method: CalculationMethod
): CalculationParams | null {
  if (method === 'STANDARD' || !params) return null;

  const allowed = PARAM_KEYS_BY_METHOD[method];

  return Object.fromEntries(
    Object.entries(params).filter(([key]) => allowed.includes(key))
  ) as CalculationParams;
}
