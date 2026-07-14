/**
 * @fileoverview 計算エンジンサービス
 *
 * 数量表の計算ロジックを提供する共有サービス。
 * Decimal.jsを使用して高精度な数値計算を実現する。
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
 * - 47.8: 「箇所数」は1〜9999999の整数
 *
 * @module services/calculation-engine
 */

import Decimal from 'decimal.js';

/**
 * 計算方法の列挙型
 */
export enum CalculationMethod {
  /** 標準（直接入力） */
  STANDARD = 'STANDARD',
  /** 面積・体積 */
  AREA_VOLUME = 'AREA_VOLUME',
  /** ピッチ */
  PITCH = 'PITCH',
  /** 箇所数（REQ-47） */
  COUNT = 'COUNT',
}

/** 箇所数の最小値（REQ-47 AC8） */
export const COUNT_MIN = 1;

/** 箇所数の最大値（REQ-47 AC8） */
export const COUNT_MAX = 9999999;

/**
 * 面積・体積計算パラメータ
 */
export interface AreaVolumeParams {
  width?: Decimal;
  depth?: Decimal;
  height?: Decimal;
  weight?: Decimal;
}

/**
 * ピッチ計算パラメータ
 */
export interface PitchParams {
  rangeLength: Decimal;
  endLength1: Decimal;
  endLength2: Decimal;
  pitchLength: Decimal;
  length?: Decimal;
  weight?: Decimal;
}

/**
 * 箇所数計算パラメータ（REQ-47）
 */
export interface CountParams {
  /** 箇所数（必須・1〜9999999の整数） */
  count: Decimal;
  /** 長さ（任意） */
  length?: Decimal;
  /** 重量（任意） */
  weight?: Decimal;
}

/**
 * 計算入力
 */
export interface CalculationInput {
  method: CalculationMethod;
  params: AreaVolumeParams | PitchParams | CountParams | Record<string, never>;
  quantity?: Decimal;
  adjustmentFactor: Decimal;
  roundingUnit: Decimal;
}

/**
 * 計算結果
 */
export interface CalculationResult {
  /** 計算元の値（調整係数・丸め適用前） */
  rawValue: Decimal;
  /** 調整係数適用後の値 */
  adjustedValue: Decimal;
  /** 最終値（丸め適用後） */
  finalValue: Decimal;
  /** 計算式（トレーサビリティ用） */
  formula: string;
}

/**
 * 計算エンジン
 *
 * 数量表の計算ロジックを提供する。
 * Decimal.jsを使用して浮動小数点精度の問題を回避。
 */
export class CalculationEngine {
  /**
   * 面積・体積計算
   *
   * 入力された値のみを掛け算（未入力は無視）。
   * 全ての項目が未入力の場合は0を返す。
   *
   * @param params - 面積・体積計算パラメータ
   * @returns 計算結果
   */
  calculateAreaVolume(params: AreaVolumeParams): Decimal {
    const values: Decimal[] = [];

    if (params.width !== undefined) {
      values.push(params.width);
    }
    if (params.depth !== undefined) {
      values.push(params.depth);
    }
    if (params.height !== undefined) {
      values.push(params.height);
    }
    if (params.weight !== undefined) {
      values.push(params.weight);
    }

    if (values.length === 0) {
      return new Decimal(0);
    }

    return values.reduce((acc, val) => acc.mul(val), new Decimal(1));
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
  calculatePitch(params: PitchParams): Decimal {
    if (params.pitchLength.lte(0)) {
      throw new Error('pitchLength must be greater than 0');
    }

    // 有効範囲 = 範囲長 - 端長1 - 端長2
    const effectiveRange = params.rangeLength.sub(params.endLength1).sub(params.endLength2);

    // 本数計算
    let count: Decimal;
    if (effectiveRange.lte(0)) {
      // 有効範囲が0以下の場合、最低1本
      count = new Decimal(1);
    } else {
      // 本数 = floor(有効範囲 / ピッチ長) + 1
      count = effectiveRange.div(params.pitchLength).floor().add(1);
    }

    // 結果 = 本数 * 長さ * 重量
    let result = count;

    if (params.length !== undefined) {
      result = result.mul(params.length);
    }

    if (params.weight !== undefined) {
      result = result.mul(params.weight);
    }

    return result;
  }

  /**
   * 箇所数計算（REQ-47）
   *
   * ピッチ計算（calculatePitch）との唯一の差分は箇所数の求め方のみ。
   * - ピッチ: 箇所数 = floor((範囲長 - 端長1 - 端長2) / ピッチ長) + 1
   * - 箇所数: 箇所数 = params.count（手入力値。自動算出は行わない）
   *
   * 結果 = 箇所数 * 長さ * 重量（任意項目は入力されている場合のみ乗算）
   * 箇所数確定後の調整係数の適用・丸め処理は calculate() の共通経路を通るため、
   * ピッチと完全に同一である（REQ-47 AC7）。
   *
   * @param params - 箇所数計算パラメータ
   * @returns 計算結果
   * @throws Error 箇所数が整数でない場合、または1〜9999999の範囲外の場合
   */
  calculateCount(params: CountParams): Decimal {
    if (!params.count.isInteger()) {
      throw new Error('count must be an integer');
    }

    if (params.count.lt(COUNT_MIN) || params.count.gt(COUNT_MAX)) {
      throw new Error(`count must be between ${COUNT_MIN} and ${COUNT_MAX}`);
    }

    // 結果 = 箇所数 * 長さ * 重量
    let result = params.count;

    if (params.length !== undefined) {
      result = result.mul(params.length);
    }

    if (params.weight !== undefined) {
      result = result.mul(params.weight);
    }

    return result;
  }

  /**
   * 調整係数を適用
   *
   * @param value - 元の値
   * @param factor - 調整係数
   * @returns 調整係数適用後の値
   */
  applyAdjustmentFactor(value: Decimal, factor: Decimal): Decimal {
    return value.mul(factor);
  }

  /**
   * 丸め処理（指定単位で切り上げ）
   *
   * @param value - 元の値
   * @param unit - 丸め単位
   * @returns 丸め処理後の値
   * @throws Error 丸め単位が0以下の場合
   */
  applyRounding(value: Decimal, unit: Decimal): Decimal {
    if (unit.lte(0)) {
      throw new Error('rounding unit must be greater than 0');
    }

    // 単位で割って切り上げ、再度単位を乗算
    const divided = value.div(unit);
    const ceiled = divided.ceil();
    return ceiled.mul(unit);
  }

  /**
   * 完全な計算を実行
   *
   * 計算方法に応じて計算を実行し、調整係数・丸め設定を適用する。
   *
   * @param input - 計算入力
   * @returns 計算結果
   */
  calculate(input: CalculationInput): CalculationResult {
    let rawValue: Decimal;
    let formula: string;

    switch (input.method) {
      case CalculationMethod.STANDARD:
        rawValue = input.quantity ?? new Decimal(0);
        formula = rawValue.toString();
        break;

      case CalculationMethod.AREA_VOLUME:
        rawValue = this.calculateAreaVolume(input.params as AreaVolumeParams);
        formula = this.generateAreaVolumeFormula(input.params as AreaVolumeParams);
        break;

      case CalculationMethod.PITCH:
        rawValue = this.calculatePitch(input.params as PitchParams);
        formula = this.generatePitchFormula(input.params as PitchParams);
        break;

      case CalculationMethod.COUNT:
        // 箇所数（REQ-47）: ピッチとの差分は rawValue の算出方法のみ。
        // 以降の調整係数・丸め処理は下記の共通経路を通るためピッチと同一（REQ-47 AC7）。
        rawValue = this.calculateCount(input.params as CountParams);
        formula = this.generateCountFormula(input.params as CountParams);
        break;

      default:
        rawValue = new Decimal(0);
        formula = '0';
    }

    // 調整係数を適用
    const adjustedValue = this.applyAdjustmentFactor(rawValue, input.adjustmentFactor);

    // 丸め処理を適用
    const finalValue = this.applyRounding(adjustedValue, input.roundingUnit);

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
  generateAreaVolumeFormula(params: AreaVolumeParams): string {
    const parts: string[] = [];

    if (params.width !== undefined) {
      parts.push(params.width.toString());
    }
    if (params.depth !== undefined) {
      parts.push(params.depth.toString());
    }
    if (params.height !== undefined) {
      parts.push(params.height.toString());
    }
    if (params.weight !== undefined) {
      parts.push(params.weight.toString());
    }

    if (parts.length === 0) {
      return '0';
    }

    const result = this.calculateAreaVolume(params);
    return `${parts.join(' x ')} = ${result.toString()}`;
  }

  /**
   * ピッチモードの計算式を生成
   *
   * @param params - ピッチ計算パラメータ
   * @returns 計算式文字列
   */
  generatePitchFormula(params: PitchParams): string {
    const rangeLength = params.rangeLength.toString();
    const endLength1 = params.endLength1.toString();
    const endLength2 = params.endLength2.toString();
    const pitchLength = params.pitchLength.toString();

    // 有効範囲計算
    const effectiveRange = params.rangeLength.sub(params.endLength1).sub(params.endLength2);

    // 本数計算
    let count: Decimal;
    if (effectiveRange.lte(0)) {
      count = new Decimal(1);
    } else {
      count = effectiveRange.div(params.pitchLength).floor().add(1);
    }

    let formula = `floor((${rangeLength} - ${endLength1} - ${endLength2}) / ${pitchLength}) + 1 = ${count.toString()}`;

    if (params.length !== undefined) {
      formula += ` x ${params.length.toString()}`;
    }

    if (params.weight !== undefined) {
      formula += ` x ${params.weight.toString()}`;
    }

    const result = this.calculatePitch(params);
    formula += ` = ${result.toString()}`;

    return formula;
  }

  /**
   * 箇所数モードの計算式を生成（REQ-47）
   *
   * 書式は generatePitchFormula() の箇所数確定後の部分と同一（toFixed は使わず素の値を埋め込む）。
   * 例: 箇所数=5, 長さ=2.5, 重量=1.5 → `5 x 2.5 x 1.5 = 18.75`
   *
   * @param params - 箇所数計算パラメータ
   * @returns 計算式文字列
   * @throws Error 箇所数が整数でない場合、または1〜9999999の範囲外の場合
   */
  generateCountFormula(params: CountParams): string {
    const parts: string[] = [params.count.toString()];

    if (params.length !== undefined) {
      parts.push(params.length.toString());
    }

    if (params.weight !== undefined) {
      parts.push(params.weight.toString());
    }

    const result = this.calculateCount(params);

    return `${parts.join(' x ')} = ${result.toString()}`;
  }
}
