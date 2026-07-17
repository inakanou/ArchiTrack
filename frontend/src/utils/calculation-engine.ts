/**
 * @fileoverview 計算エンジン（フロントエンド版）
 *
 * 数量表の計算ロジックを提供する共有ユーティリティ。
 * バックエンドの計算エンジンと同等のロジックを提供。
 *
 * Task 6: 計算機能UIの実装
 *
 * Requirements:
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 9.2: 調整係数列に数値を入力する場合、計算結果に調整係数を乗算した値を数量として設定する
 * - 10.2: 丸め設定列に数値を入力する場合、調整係数適用後の値を指定された単位で切り上げた値を最終数量として設定する
 * - 47.3-47.7: 「箇所数」モードで手入力の箇所数を起点に、ピッチと同一の後段処理（長さ・重量の乗算、
 *   調整係数の適用、丸め処理）で最終数量を算出する
 * - 47.8/47.10/47.11: 「箇所数」は1〜9999999の整数
 */

import type {
  CalculationMethod,
  CalculationParams,
  CountParams,
} from '../types/quantity-edit.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 箇所数計算パラメータ
 *
 * 型の単一情報源は `types/quantity-edit.types.ts`。
 * 計算エンジンの利用者が型を1箇所からimportできるよう再エクスポートする。
 */
export type { CountParams };

/**
 * 面積・体積計算パラメータ
 */
export interface AreaVolumeParams {
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
}

/**
 * ピッチ計算パラメータ
 */
export interface PitchParams {
  rangeLength?: number;
  endLength1?: number;
  endLength2?: number;
  pitchLength?: number;
  length?: number;
  weight?: number;
}

/**
 * 計算入力
 */
export interface CalculationInput {
  method: CalculationMethod;
  params: CalculationParams;
  quantity?: number;
  adjustmentFactor: number;
  roundingUnit: number;
}

/**
 * 計算結果
 */
export interface CalculationResult {
  /** 計算元の値（調整係数・丸め適用前） */
  rawValue: number;
  /** 調整係数適用後の値 */
  adjustedValue: number;
  /** 最終値（丸め適用後） */
  finalValue: number;
  /** 計算式（トレーサビリティ用） */
  formula: string;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// デフォルト値
// ============================================================================

/** デフォルト調整係数 */
export const DEFAULT_ADJUSTMENT_FACTOR = 1.0;

/** デフォルト丸め単位 */
export const DEFAULT_ROUNDING_UNIT = 0.01;

/** デフォルト計算方法 */
export const DEFAULT_CALCULATION_METHOD: CalculationMethod = 'STANDARD';

/** 箇所数の最小値（REQ-47 AC8） */
export const COUNT_MIN = 1;

/** 箇所数の最大値（REQ-47 AC8） */
export const COUNT_MAX = 9999999;

// ============================================================================
// 計算関数
// ============================================================================

/**
 * 面積・体積計算
 *
 * 入力された値のみを掛け算（未入力は無視）。
 * 全ての項目が未入力の場合は0を返す。
 *
 * @param params - 面積・体積計算パラメータ
 * @returns 計算結果
 */
export function calculateAreaVolume(params: AreaVolumeParams): number {
  const values: number[] = [];

  if (params.width !== undefined && params.width !== null && !isNaN(params.width)) {
    values.push(params.width);
  }
  if (params.depth !== undefined && params.depth !== null && !isNaN(params.depth)) {
    values.push(params.depth);
  }
  if (params.height !== undefined && params.height !== null && !isNaN(params.height)) {
    values.push(params.height);
  }
  if (params.weight !== undefined && params.weight !== null && !isNaN(params.weight)) {
    values.push(params.weight);
  }

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((acc, val) => acc * val, 1);
}

/**
 * ピッチ計算
 *
 * 本数 = floor((範囲長 - 端長1 - 端長2) / ピッチ長) + 1
 * 結果 = 本数 * 長さ * 重量（任意項目は1として扱う）
 *
 * @param params - ピッチ計算パラメータ
 * @returns 計算結果
 * @throws Error ピッチ長が0以下の場合
 */
export function calculatePitch(params: PitchParams): number {
  const rangeLength = params.rangeLength ?? 0;
  const endLength1 = params.endLength1 ?? 0;
  const endLength2 = params.endLength2 ?? 0;
  const pitchLength = params.pitchLength ?? 0;

  if (pitchLength <= 0) {
    throw new Error('ピッチ長は0より大きい値を入力してください');
  }

  // 有効範囲 = 範囲長 - 端長1 - 端長2
  const effectiveRange = rangeLength - endLength1 - endLength2;

  // 本数計算
  let count: number;
  if (effectiveRange <= 0) {
    // 有効範囲が0以下の場合、最低1本
    count = 1;
  } else {
    // 本数 = floor(有効範囲 / ピッチ長) + 1
    count = Math.floor(effectiveRange / pitchLength) + 1;
  }

  // 結果 = 本数 * 長さ * 重量
  let result = count;

  if (params.length !== undefined && params.length !== null && !isNaN(params.length)) {
    result = result * params.length;
  }

  if (params.weight !== undefined && params.weight !== null && !isNaN(params.weight)) {
    result = result * params.weight;
  }

  return result;
}

/**
 * 任意項目（長さ・重量）が有効な数値として入力されているか
 *
 * 既存の計算関数（calculateAreaVolume / calculatePitch）と同一の判定条件。
 */
function isProvidedNumber(value: number | undefined | null): value is number {
  return value !== undefined && value !== null && !isNaN(value);
}

/**
 * 箇所数の計算結果（調整係数・丸め適用前）を算出する
 *
 * 結果 = 箇所数 * 長さ * 重量（任意項目は入力されている場合のみ乗算）
 */
function computeCountRawValue(params: CountParams): number {
  let result = isProvidedNumber(params.count) ? params.count : 0;

  if (isProvidedNumber(params.length)) {
    result = result * params.length;
  }

  if (isProvidedNumber(params.weight)) {
    result = result * params.weight;
  }

  return result;
}

/**
 * 箇所数計算（REQ-47）
 *
 * ピッチ計算（calculatePitch）との差分は箇所数の求め方のみ。
 * - ピッチ: 箇所数 = floor((範囲長 - 端長1 - 端長2) / ピッチ長) + 1
 * - 箇所数: 箇所数 = params.count（手入力値。自動算出は行わない）
 *
 * 箇所数確定後の処理（長さ・重量の乗算、調整係数の適用、丸め処理）は
 * calculate() の共通経路を通るためピッチと完全に同一である（REQ-47 AC7）。
 *
 * Requirements:
 * - 47.3: 入力された値をそのまま箇所数として用い、自動算出を行わない
 * - 47.4: 入力されている任意項目（長さ・重量）のみを乗算する
 * - 47.5: 任意項目がいずれも未入力の場合、箇所数そのものを計算結果とする
 * - 47.8/47.10/47.11: 箇所数は1〜9999999の整数
 *
 * @param params - 箇所数計算パラメータ
 * @returns 計算元の値と計算式
 * @throws Error 箇所数が整数でない場合、または1〜9999999の範囲外の場合
 */
export function calculateCount(params: CountParams): { rawValue: number; formula: string } {
  if (!Number.isInteger(params.count)) {
    throw new Error('箇所数は整数で入力してください');
  }

  if (params.count < COUNT_MIN || params.count > COUNT_MAX) {
    throw new Error(`箇所数は${COUNT_MIN}〜${COUNT_MAX}の範囲で入力してください`);
  }

  return {
    rawValue: computeCountRawValue(params),
    formula: generateCountFormula(params),
  };
}

/**
 * 調整係数を適用
 *
 * @param value - 元の値
 * @param factor - 調整係数
 * @returns 調整係数適用後の値
 */
export function applyAdjustmentFactor(value: number, factor: number): number {
  return value * factor;
}

/**
 * 丸め処理（指定単位で切り上げ）
 *
 * @param value - 元の値
 * @param unit - 丸め単位
 * @returns 丸め処理後の値
 * @throws Error 丸め単位が0以下の場合
 */
export function applyRounding(value: number, unit: number): number {
  if (unit <= 0) {
    throw new Error('丸め単位は0より大きい値を入力してください');
  }

  // 単位で割って切り上げ、再度単位を乗算
  const divided = value / unit;
  const ceiled = Math.ceil(divided);
  // 浮動小数点精度のため、適切な小数点以下桁数で丸める
  const precision = unit.toString().split('.')[1]?.length ?? 0;
  const result = ceiled * unit;
  return Number(result.toFixed(precision + 2));
}

/**
 * 完全な計算を実行
 *
 * 計算方法に応じて計算を実行し、調整係数・丸め設定を適用する。
 *
 * @param input - 計算入力
 * @returns 計算結果
 */
export function calculate(input: CalculationInput): CalculationResult {
  let rawValue: number;
  let formula: string;

  switch (input.method) {
    case 'STANDARD':
      rawValue = input.quantity ?? 0;
      formula = rawValue.toString();
      break;

    case 'AREA_VOLUME':
      rawValue = calculateAreaVolume(input.params as AreaVolumeParams);
      formula = generateAreaVolumeFormula(input.params as AreaVolumeParams);
      break;

    case 'PITCH':
      rawValue = calculatePitch(input.params as PitchParams);
      formula = generatePitchFormula(input.params as PitchParams);
      break;

    case 'COUNT': {
      // 箇所数（REQ-47）: 差分は rawValue の算出方法のみ。
      // 以降の調整係数・丸め処理は下記の共通経路を通るためピッチと同一（REQ-47 AC7）。
      const countResult = calculateCount(input.params as CountParams);
      rawValue = countResult.rawValue;
      formula = countResult.formula;
      break;
    }

    default:
      rawValue = 0;
      formula = '0';
  }

  // 調整係数を適用
  const adjustedValue = applyAdjustmentFactor(rawValue, input.adjustmentFactor);

  // 丸め処理を適用
  const finalValue = applyRounding(adjustedValue, input.roundingUnit);

  return {
    rawValue,
    adjustedValue,
    finalValue,
    formula,
  };
}

/**
 * 面積・体積モードの計算式を生成
 *
 * @param params - 面積・体積計算パラメータ
 * @returns 計算式文字列
 */
export function generateAreaVolumeFormula(params: AreaVolumeParams): string {
  const parts: string[] = [];

  if (params.width !== undefined && params.width !== null && !isNaN(params.width)) {
    parts.push(params.width.toString());
  }
  if (params.depth !== undefined && params.depth !== null && !isNaN(params.depth)) {
    parts.push(params.depth.toString());
  }
  if (params.height !== undefined && params.height !== null && !isNaN(params.height)) {
    parts.push(params.height.toString());
  }
  if (params.weight !== undefined && params.weight !== null && !isNaN(params.weight)) {
    parts.push(params.weight.toString());
  }

  if (parts.length === 0) {
    return '0';
  }

  const result = calculateAreaVolume(params);
  return `${parts.join(' x ')} = ${result}`;
}

/**
 * ピッチモードの計算式を生成
 *
 * @param params - ピッチ計算パラメータ
 * @returns 計算式文字列
 */
export function generatePitchFormula(params: PitchParams): string {
  const rangeLength = params.rangeLength?.toString() ?? '0';
  const endLength1 = params.endLength1?.toString() ?? '0';
  const endLength2 = params.endLength2?.toString() ?? '0';
  const pitchLength = params.pitchLength?.toString() ?? '0';

  // 有効範囲計算
  const effectiveRange =
    (params.rangeLength ?? 0) - (params.endLength1 ?? 0) - (params.endLength2 ?? 0);

  // 本数計算
  let count: number;
  if (effectiveRange <= 0 || (params.pitchLength ?? 0) <= 0) {
    count = 1;
  } else {
    count = Math.floor(effectiveRange / (params.pitchLength ?? 1)) + 1;
  }

  let formula = `floor((${rangeLength} - ${endLength1} - ${endLength2}) / ${pitchLength}) + 1 = ${count}`;

  if (params.length !== undefined && params.length !== null && !isNaN(params.length)) {
    formula += ` x ${params.length}`;
  }

  if (params.weight !== undefined && params.weight !== null && !isNaN(params.weight)) {
    formula += ` x ${params.weight}`;
  }

  try {
    const result = calculatePitch(params);
    formula += ` = ${result}`;
  } catch {
    formula += ' = 0';
  }

  return formula;
}

/**
 * 箇所数モードの計算式を生成（REQ-47）
 *
 * 書式は generatePitchFormula() の箇所数確定後の部分と同一。
 * 例: 箇所数=5, 長さ=2.5, 重量=1.5 → `5 x 2.5 x 1.5 = 18.75`
 *
 * @param params - 箇所数計算パラメータ
 * @returns 計算式文字列
 */
export function generateCountFormula(params: CountParams): string {
  const parts: string[] = [(isProvidedNumber(params.count) ? params.count : 0).toString()];

  if (isProvidedNumber(params.length)) {
    parts.push(params.length.toString());
  }

  if (isProvidedNumber(params.weight)) {
    parts.push(params.weight.toString());
  }

  const result = computeCountRawValue(params);

  return `${parts.join(' x ')} = ${result}`;
}

// ============================================================================
// バリデーション関数
// ============================================================================

/**
 * 数値入力のバリデーション
 *
 * @param value - 入力値
 * @returns 数値かどうか
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * 標準モードの数量をバリデーション
 *
 * Requirements:
 * - 8.3: 数量フィールドに負の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 8.4: 数量フィールドに数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 *
 * @param value - 入力値
 * @returns バリデーション結果
 */
export function validateStandardQuantity(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null || value === '') {
    errors.push('数量を入力してください');
    return { isValid: false, errors, warnings };
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (!isValidNumber(numValue)) {
    errors.push('数量は数値で入力してください');
    return { isValid: false, errors, warnings };
  }

  if (numValue < 0) {
    warnings.push('負の数量が入力されています。続行しますか？');
  }

  return { isValid: true, errors, warnings };
}

/**
 * 調整係数をバリデーション
 *
 * Requirements:
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 *
 * @param value - 入力値
 * @returns バリデーション結果
 */
export function validateAdjustmentFactor(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null || value === '') {
    errors.push('調整係数を入力してください');
    return { isValid: false, errors, warnings };
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (!isValidNumber(numValue)) {
    errors.push('調整係数は数値で入力してください');
    return { isValid: false, errors, warnings };
  }

  if (numValue <= 0) {
    warnings.push('調整係数が0以下です。続行しますか？');
  }

  return { isValid: true, errors, warnings };
}

/**
 * 丸め設定をバリデーション
 *
 * Requirements:
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 *
 * @param value - 入力値
 * @returns バリデーション結果
 */
export function validateRoundingUnit(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null || value === '') {
    errors.push('丸め設定を入力してください');
    return { isValid: false, errors, warnings };
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (!isValidNumber(numValue)) {
    errors.push('丸め設定は数値で入力してください');
    return { isValid: false, errors, warnings };
  }

  if (numValue <= 0) {
    errors.push('丸め設定は正の値を入力してください');
    return { isValid: false, errors, warnings };
  }

  return { isValid: true, errors, warnings };
}

/**
 * 面積・体積モードのバリデーション
 *
 * Requirements:
 * - 8.7: 「面積・体積」モードで計算用列に値が1つも入力されていない状態で保存を試行する場合、エラーメッセージを表示し、最低1項目の入力を求める
 *
 * @param params - 計算パラメータ
 * @returns バリデーション結果
 */
export function validateAreaVolumeParams(params: AreaVolumeParams): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasAnyValue = [params.width, params.depth, params.height, params.weight].some(
    (v) => v !== undefined && v !== null && !isNaN(v)
  );

  if (!hasAnyValue) {
    errors.push('面積・体積モードでは最低1項目を入力してください');
    return { isValid: false, errors, warnings };
  }

  return { isValid: true, errors, warnings };
}

/**
 * ピッチモードのバリデーション
 *
 * Requirements:
 * - 8.10: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）のいずれかが未入力で保存を試行する場合、エラーメッセージを表示し、必須項目の入力を求める
 *
 * @param params - 計算パラメータ
 * @returns バリデーション結果
 */
export function validatePitchParams(params: PitchParams): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredFields = [
    { name: '範囲長', value: params.rangeLength },
    { name: '端長1', value: params.endLength1 },
    { name: '端長2', value: params.endLength2 },
    { name: 'ピッチ長', value: params.pitchLength },
  ];

  for (const field of requiredFields) {
    if (field.value === undefined || field.value === null || isNaN(field.value)) {
      errors.push(`${field.name}を入力してください`);
    }
  }

  if (errors.length === 0 && (params.pitchLength ?? 0) <= 0) {
    errors.push('ピッチ長は0より大きい値を入力してください');
  }

  return { isValid: errors.length === 0, errors, warnings };
}
