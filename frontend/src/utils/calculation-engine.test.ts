/**
 * @fileoverview 計算エンジンのテスト
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
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAreaVolume,
  calculatePitch,
  applyAdjustmentFactor,
  applyRounding,
  calculate,
  generateAreaVolumeFormula,
  generatePitchFormula,
  isValidNumber,
  validateStandardQuantity,
  validateAdjustmentFactor,
  validateRoundingUnit,
  validateAreaVolumeParams,
  validatePitchParams,
  DEFAULT_ADJUSTMENT_FACTOR,
  DEFAULT_ROUNDING_UNIT,
  DEFAULT_CALCULATION_METHOD,
  type AreaVolumeParams,
  type PitchParams,
  type CalculationInput,
} from './calculation-engine';

// ============================================================================
// 定数のテスト
// ============================================================================

describe('デフォルト値定数', () => {
  it('DEFAULT_ADJUSTMENT_FACTORは1.0', () => {
    expect(DEFAULT_ADJUSTMENT_FACTOR).toBe(1.0);
  });

  it('DEFAULT_ROUNDING_UNITは0.01', () => {
    expect(DEFAULT_ROUNDING_UNIT).toBe(0.01);
  });

  it('DEFAULT_CALCULATION_METHODはSTANDARD', () => {
    expect(DEFAULT_CALCULATION_METHOD).toBe('STANDARD');
  });
});

// ============================================================================
// calculateAreaVolume のテスト
// ============================================================================

describe('calculateAreaVolume', () => {
  describe('REQ-8.6: 入力された項目のみを掛け算する', () => {
    it('全ての値が指定されている場合、全てを掛け算する', () => {
      const params: AreaVolumeParams = {
        width: 2,
        depth: 3,
        height: 4,
        weight: 5,
      };
      expect(calculateAreaVolume(params)).toBe(2 * 3 * 4 * 5); // 120
    });

    it('幅のみ指定されている場合、幅のみ返す', () => {
      const params: AreaVolumeParams = { width: 10 };
      expect(calculateAreaVolume(params)).toBe(10);
    });

    it('幅と奥行きが指定されている場合、面積を返す', () => {
      const params: AreaVolumeParams = { width: 10, depth: 5 };
      expect(calculateAreaVolume(params)).toBe(50);
    });

    it('幅・奥行き・高さが指定されている場合、体積を返す', () => {
      const params: AreaVolumeParams = { width: 10, depth: 5, height: 2 };
      expect(calculateAreaVolume(params)).toBe(100);
    });

    it('重量のみ指定されている場合、重量を返す', () => {
      const params: AreaVolumeParams = { weight: 25.5 };
      expect(calculateAreaVolume(params)).toBe(25.5);
    });

    it('全ての値が未指定の場合、0を返す', () => {
      const params: AreaVolumeParams = {};
      expect(calculateAreaVolume(params)).toBe(0);
    });

    it('undefined値は無視される', () => {
      const params: AreaVolumeParams = {
        width: 10,
        depth: undefined,
        height: 5,
      };
      expect(calculateAreaVolume(params)).toBe(50);
    });

    it('null値は無視される', () => {
      const params: AreaVolumeParams = {
        width: 10,
        depth: null as unknown as number,
        height: 5,
      };
      expect(calculateAreaVolume(params)).toBe(50);
    });

    it('NaN値は無視される', () => {
      const params: AreaVolumeParams = {
        width: 10,
        depth: NaN,
        height: 5,
      };
      expect(calculateAreaVolume(params)).toBe(50);
    });
  });

  describe('小数点計算', () => {
    it('小数点の値を正しく計算する', () => {
      const params: AreaVolumeParams = {
        width: 1.5,
        depth: 2.5,
      };
      expect(calculateAreaVolume(params)).toBe(3.75);
    });
  });
});

// ============================================================================
// calculatePitch のテスト
// ============================================================================

describe('calculatePitch', () => {
  describe('REQ-8.9: ピッチ計算式に基づいて本数を算出する', () => {
    it('基本的なピッチ計算: floor((範囲長-端長1-端長2)/ピッチ長)+1', () => {
      // 10m範囲、両端1mずつ、1mピッチ → (10-1-1)/1+1 = 9本
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
      };
      expect(calculatePitch(params)).toBe(9);
    });

    it('長さと重量を含む場合、本数×長さ×重量を返す', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        length: 2,
        weight: 3,
      };
      // 9本 × 2m × 3kg = 54
      expect(calculatePitch(params)).toBe(54);
    });

    it('長さのみ指定された場合、本数×長さを返す', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        length: 2,
      };
      expect(calculatePitch(params)).toBe(18); // 9 × 2
    });

    it('重量のみ指定された場合、本数×重量を返す', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        weight: 1.5,
      };
      expect(calculatePitch(params)).toBe(13.5); // 9 × 1.5
    });

    it('未指定のパラメータは0として扱う', () => {
      const params: PitchParams = {
        rangeLength: 10,
        pitchLength: 2,
      };
      // (10-0-0)/2+1 = 6本
      expect(calculatePitch(params)).toBe(6);
    });

    it('有効範囲が0以下の場合、最低1本を返す', () => {
      const params: PitchParams = {
        rangeLength: 5,
        endLength1: 3,
        endLength2: 3,
        pitchLength: 1,
      };
      // 有効範囲: 5-3-3 = -1 → 最低1本
      expect(calculatePitch(params)).toBe(1);
    });

    it('ピッチ長が0の場合、エラーをスローする', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 0,
      };
      expect(() => calculatePitch(params)).toThrow('ピッチ長は0より大きい値を入力してください');
    });

    it('ピッチ長が負の場合、エラーをスローする', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: -1,
      };
      expect(() => calculatePitch(params)).toThrow('ピッチ長は0より大きい値を入力してください');
    });
  });

  describe('端数処理', () => {
    it('本数は切り捨てで計算される', () => {
      // (10-1-1)/3+1 = 2.666... → floor(2.666) + 1 = 3本
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 3,
      };
      expect(calculatePitch(params)).toBe(3);
    });
  });

  describe('NaN/null/undefined handling', () => {
    it('長さがNaNの場合、無視される', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        length: NaN,
      };
      expect(calculatePitch(params)).toBe(9);
    });

    it('重量がnullの場合、無視される', () => {
      const params: PitchParams = {
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        weight: null as unknown as number,
      };
      expect(calculatePitch(params)).toBe(9);
    });
  });
});

// ============================================================================
// applyAdjustmentFactor のテスト
// ============================================================================

describe('applyAdjustmentFactor', () => {
  describe('REQ-9.2: 計算結果に調整係数を乗算', () => {
    it('正の調整係数を乗算する', () => {
      expect(applyAdjustmentFactor(100, 1.1)).toBeCloseTo(110);
    });

    it('調整係数1.0は元の値を返す', () => {
      expect(applyAdjustmentFactor(100, 1.0)).toBe(100);
    });

    it('調整係数が1未満の場合、値が減少する', () => {
      expect(applyAdjustmentFactor(100, 0.9)).toBeCloseTo(90);
    });

    it('調整係数0は0を返す', () => {
      expect(applyAdjustmentFactor(100, 0)).toBe(0);
    });

    it('負の調整係数も計算できる', () => {
      expect(applyAdjustmentFactor(100, -1)).toBe(-100);
    });
  });
});

// ============================================================================
// applyRounding のテスト
// ============================================================================

describe('applyRounding', () => {
  describe('REQ-10.2: 指定された単位で切り上げる', () => {
    it('0.01単位で切り上げる', () => {
      expect(applyRounding(10.001, 0.01)).toBe(10.01);
      expect(applyRounding(10.009, 0.01)).toBe(10.01);
    });

    it('0.1単位で切り上げる', () => {
      expect(applyRounding(10.01, 0.1)).toBe(10.1);
      expect(applyRounding(10.05, 0.1)).toBe(10.1);
    });

    it('1単位で切り上げる', () => {
      expect(applyRounding(10.1, 1)).toBe(11);
      expect(applyRounding(10.9, 1)).toBe(11);
    });

    it('10単位で切り上げる', () => {
      expect(applyRounding(11, 10)).toBe(20);
      expect(applyRounding(19, 10)).toBe(20);
    });

    it('ちょうど割り切れる場合はそのままの値', () => {
      expect(applyRounding(10.0, 0.1)).toBe(10.0);
      expect(applyRounding(20, 10)).toBe(20);
    });

    it('丸め単位が0以下の場合、エラーをスローする', () => {
      expect(() => applyRounding(100, 0)).toThrow('丸め単位は0より大きい値を入力してください');
      expect(() => applyRounding(100, -0.1)).toThrow('丸め単位は0より大きい値を入力してください');
    });
  });
});

// ============================================================================
// calculate のテスト
// ============================================================================

describe('calculate', () => {
  describe('標準モード', () => {
    it('標準モードでは数量をそのまま使用する', () => {
      const input: CalculationInput = {
        method: 'STANDARD',
        params: {},
        quantity: 100,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(100);
      expect(result.adjustedValue).toBe(100);
      expect(result.finalValue).toBe(100);
      expect(result.formula).toBe('100');
    });

    it('標準モードで数量が未指定の場合は0', () => {
      const input: CalculationInput = {
        method: 'STANDARD',
        params: {},
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(0);
    });

    it('標準モードで調整係数を適用する', () => {
      const input: CalculationInput = {
        method: 'STANDARD',
        params: {},
        quantity: 100,
        adjustmentFactor: 1.1,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(100);
      expect(result.adjustedValue).toBeCloseTo(110);
    });

    it('標準モードで丸め処理を適用する', () => {
      const input: CalculationInput = {
        method: 'STANDARD',
        params: {},
        quantity: 100,
        adjustmentFactor: 1.005,
        roundingUnit: 0.1,
      };
      const result = calculate(input);
      expect(result.adjustedValue).toBeCloseTo(100.5);
      expect(result.finalValue).toBeCloseTo(100.5);
    });
  });

  describe('面積・体積モード', () => {
    it('面積・体積モードで計算する', () => {
      const input: CalculationInput = {
        method: 'AREA_VOLUME',
        params: { width: 10, depth: 5, height: 2 },
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(100);
      expect(result.formula).toContain('10 x 5 x 2');
    });

    it('面積・体積モードで調整係数を適用する', () => {
      const input: CalculationInput = {
        method: 'AREA_VOLUME',
        params: { width: 10, depth: 5 },
        adjustmentFactor: 1.2,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(50);
      expect(result.adjustedValue).toBe(60);
    });
  });

  describe('ピッチモード', () => {
    it('ピッチモードで計算する', () => {
      const input: CalculationInput = {
        method: 'PITCH',
        params: {
          rangeLength: 10,
          endLength1: 1,
          endLength2: 1,
          pitchLength: 2,
        },
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(5); // floor((10-1-1)/2)+1 = 5
    });

    it('ピッチモードで調整係数を適用する', () => {
      const input: CalculationInput = {
        method: 'PITCH',
        params: {
          rangeLength: 10,
          endLength1: 1,
          endLength2: 1,
          pitchLength: 2,
        },
        adjustmentFactor: 1.5,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(5);
      expect(result.adjustedValue).toBe(7.5);
    });
  });

  describe('未知の計算方法', () => {
    it('未知の計算方法の場合は0を返す', () => {
      const input: CalculationInput = {
        method: 'UNKNOWN' as 'STANDARD',
        params: {},
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
      };
      const result = calculate(input);
      expect(result.rawValue).toBe(0);
      expect(result.formula).toBe('0');
    });
  });
});

// ============================================================================
// generateAreaVolumeFormula のテスト
// ============================================================================

describe('generateAreaVolumeFormula', () => {
  it('全てのパラメータが指定されている場合', () => {
    const params: AreaVolumeParams = {
      width: 10,
      depth: 5,
      height: 2,
      weight: 1.5,
    };
    const formula = generateAreaVolumeFormula(params);
    expect(formula).toContain('10 x 5 x 2 x 1.5');
    expect(formula).toContain('= 150');
  });

  it('一部のパラメータのみ指定されている場合', () => {
    const params: AreaVolumeParams = { width: 10, depth: 5 };
    const formula = generateAreaVolumeFormula(params);
    expect(formula).toBe('10 x 5 = 50');
  });

  it('パラメータが1つのみの場合', () => {
    const params: AreaVolumeParams = { width: 10 };
    const formula = generateAreaVolumeFormula(params);
    expect(formula).toBe('10 = 10');
  });

  it('パラメータが空の場合', () => {
    const params: AreaVolumeParams = {};
    const formula = generateAreaVolumeFormula(params);
    expect(formula).toBe('0');
  });

  it('NaN/null/undefinedは無視される', () => {
    const params: AreaVolumeParams = {
      width: 10,
      depth: NaN,
      height: null as unknown as number,
      weight: undefined,
    };
    const formula = generateAreaVolumeFormula(params);
    expect(formula).toBe('10 = 10');
  });
});

// ============================================================================
// generatePitchFormula のテスト
// ============================================================================

describe('generatePitchFormula', () => {
  it('基本的なピッチ計算式を生成する', () => {
    const params: PitchParams = {
      rangeLength: 10,
      endLength1: 1,
      endLength2: 1,
      pitchLength: 2,
    };
    const formula = generatePitchFormula(params);
    expect(formula).toContain('floor((10 - 1 - 1) / 2) + 1 = 5');
    expect(formula).toContain('= 5');
  });

  it('長さと重量を含む場合', () => {
    const params: PitchParams = {
      rangeLength: 10,
      endLength1: 1,
      endLength2: 1,
      pitchLength: 2,
      length: 3,
      weight: 2,
    };
    const formula = generatePitchFormula(params);
    expect(formula).toContain('x 3');
    expect(formula).toContain('x 2');
    expect(formula).toContain('= 30'); // 5 × 3 × 2 = 30
  });

  it('ピッチ長が0以下の場合、本数1として計算式を生成', () => {
    const params: PitchParams = {
      rangeLength: 10,
      endLength1: 1,
      endLength2: 1,
      pitchLength: 0,
    };
    const formula = generatePitchFormula(params);
    expect(formula).toContain('= 1');
    expect(formula).toContain('= 0'); // 計算エラーで0
  });

  it('未指定のパラメータは0として表示される', () => {
    const params: PitchParams = {
      rangeLength: 10,
      pitchLength: 2,
    };
    const formula = generatePitchFormula(params);
    expect(formula).toContain('10 - 0 - 0');
  });
});

// ============================================================================
// isValidNumber のテスト
// ============================================================================

describe('isValidNumber', () => {
  it('正の数は有効', () => {
    expect(isValidNumber(10)).toBe(true);
    expect(isValidNumber(0.5)).toBe(true);
  });

  it('0は有効', () => {
    expect(isValidNumber(0)).toBe(true);
  });

  it('負の数は有効', () => {
    expect(isValidNumber(-10)).toBe(true);
  });

  it('NaNは無効', () => {
    expect(isValidNumber(NaN)).toBe(false);
  });

  it('Infinityは無効', () => {
    expect(isValidNumber(Infinity)).toBe(false);
    expect(isValidNumber(-Infinity)).toBe(false);
  });

  it('文字列は無効', () => {
    expect(isValidNumber('10')).toBe(false);
    expect(isValidNumber('')).toBe(false);
  });

  it('nullは無効', () => {
    expect(isValidNumber(null)).toBe(false);
  });

  it('undefinedは無効', () => {
    expect(isValidNumber(undefined)).toBe(false);
  });

  it('オブジェクトは無効', () => {
    expect(isValidNumber({})).toBe(false);
  });
});

// ============================================================================
// validateStandardQuantity のテスト
// ============================================================================

describe('validateStandardQuantity', () => {
  describe('REQ-8.3: 負の値の警告', () => {
    it('負の値の場合、警告を返す', () => {
      const result = validateStandardQuantity(-10);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('負の数量が入力されています。続行しますか？');
    });
  });

  describe('REQ-8.4: 数値以外の文字でエラー', () => {
    it('文字列の場合、エラーを返す', () => {
      const result = validateStandardQuantity('abc');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('数量は数値で入力してください');
    });

    it('数値文字列はパースされて有効', () => {
      const result = validateStandardQuantity('10.5');
      expect(result.isValid).toBe(true);
    });
  });

  describe('必須チェック', () => {
    it('undefinedの場合、エラーを返す', () => {
      const result = validateStandardQuantity(undefined);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('数量を入力してください');
    });

    it('nullの場合、エラーを返す', () => {
      const result = validateStandardQuantity(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('数量を入力してください');
    });

    it('空文字の場合、エラーを返す', () => {
      const result = validateStandardQuantity('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('数量を入力してください');
    });
  });

  describe('正常値', () => {
    it('正の数は有効', () => {
      const result = validateStandardQuantity(100);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('0は有効', () => {
      const result = validateStandardQuantity(0);
      expect(result.isValid).toBe(true);
    });
  });
});

// ============================================================================
// validateAdjustmentFactor のテスト
// ============================================================================

describe('validateAdjustmentFactor', () => {
  describe('REQ-9.3: 0以下の値の警告', () => {
    it('0の場合、警告を返す', () => {
      const result = validateAdjustmentFactor(0);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('調整係数が0以下です。続行しますか？');
    });

    it('負の値の場合、警告を返す', () => {
      const result = validateAdjustmentFactor(-0.5);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('調整係数が0以下です。続行しますか？');
    });
  });

  describe('REQ-9.4: 数値以外でエラー', () => {
    it('文字列の場合、エラーを返す', () => {
      const result = validateAdjustmentFactor('abc');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('調整係数は数値で入力してください');
    });
  });

  describe('必須チェック', () => {
    it('undefinedの場合、エラーを返す', () => {
      const result = validateAdjustmentFactor(undefined);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('調整係数を入力してください');
    });

    it('nullの場合、エラーを返す', () => {
      const result = validateAdjustmentFactor(null);
      expect(result.isValid).toBe(false);
    });

    it('空文字の場合、エラーを返す', () => {
      const result = validateAdjustmentFactor('');
      expect(result.isValid).toBe(false);
    });
  });

  describe('正常値', () => {
    it('正の数は有効', () => {
      const result = validateAdjustmentFactor(1.5);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

// ============================================================================
// validateRoundingUnit のテスト
// ============================================================================

describe('validateRoundingUnit', () => {
  describe('REQ-10.3: 0以下の値でエラー', () => {
    it('0の場合、エラーを返す', () => {
      const result = validateRoundingUnit(0);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('丸め設定は正の値を入力してください');
    });

    it('負の値の場合、エラーを返す', () => {
      const result = validateRoundingUnit(-0.1);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('丸め設定は正の値を入力してください');
    });
  });

  describe('REQ-10.4: 数値以外でエラー', () => {
    it('文字列の場合、エラーを返す', () => {
      const result = validateRoundingUnit('abc');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('丸め設定は数値で入力してください');
    });
  });

  describe('必須チェック', () => {
    it('undefinedの場合、エラーを返す', () => {
      const result = validateRoundingUnit(undefined);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('丸め設定を入力してください');
    });

    it('nullの場合、エラーを返す', () => {
      const result = validateRoundingUnit(null);
      expect(result.isValid).toBe(false);
    });

    it('空文字の場合、エラーを返す', () => {
      const result = validateRoundingUnit('');
      expect(result.isValid).toBe(false);
    });
  });

  describe('正常値', () => {
    it('正の数は有効', () => {
      const result = validateRoundingUnit(0.01);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

// ============================================================================
// validateAreaVolumeParams のテスト
// ============================================================================

describe('validateAreaVolumeParams', () => {
  describe('REQ-8.7: 値が1つも入力されていない場合のエラー', () => {
    it('全て未指定の場合、エラーを返す', () => {
      const result = validateAreaVolumeParams({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('面積・体積モードでは最低1項目を入力してください');
    });

    it('全てundefinedの場合、エラーを返す', () => {
      const result = validateAreaVolumeParams({
        width: undefined,
        depth: undefined,
        height: undefined,
        weight: undefined,
      });
      expect(result.isValid).toBe(false);
    });

    it('全てNaNの場合、エラーを返す', () => {
      const result = validateAreaVolumeParams({
        width: NaN,
        depth: NaN,
        height: NaN,
        weight: NaN,
      });
      expect(result.isValid).toBe(false);
    });
  });

  describe('正常値', () => {
    it('1つでも値があれば有効', () => {
      const result = validateAreaVolumeParams({ width: 10 });
      expect(result.isValid).toBe(true);
    });

    it('複数の値があっても有効', () => {
      const result = validateAreaVolumeParams({
        width: 10,
        depth: 5,
        height: 2,
      });
      expect(result.isValid).toBe(true);
    });

    it('0は有効な値として扱われる', () => {
      const result = validateAreaVolumeParams({ width: 0 });
      expect(result.isValid).toBe(true);
    });
  });
});

// ============================================================================
// validatePitchParams のテスト
// ============================================================================

describe('validatePitchParams', () => {
  describe('REQ-8.10: 必須項目未入力時のエラー', () => {
    it('範囲長が未指定の場合、エラーを返す', () => {
      const result = validatePitchParams({
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('範囲長を入力してください');
    });

    it('端長1が未指定の場合、エラーを返す', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength2: 1,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('端長1を入力してください');
    });

    it('端長2が未指定の場合、エラーを返す', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 1,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('端長2を入力してください');
    });

    it('ピッチ長が未指定の場合、エラーを返す', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ピッチ長を入力してください');
    });

    it('全て未指定の場合、全てのエラーを返す', () => {
      const result = validatePitchParams({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
    });

    it('ピッチ長が0以下の場合、エラーを返す', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 0,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ピッチ長は0より大きい値を入力してください');
    });

    it('NaN値は未入力扱い', () => {
      const result = validatePitchParams({
        rangeLength: NaN,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('範囲長を入力してください');
    });
  });

  describe('正常値', () => {
    it('必須項目が全て指定されている場合、有効', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('任意項目（長さ・重量）は未指定でも有効', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 1,
        endLength2: 1,
        pitchLength: 1,
        length: undefined,
        weight: undefined,
      });
      expect(result.isValid).toBe(true);
    });

    it('0は有効な値として扱われる（端長など）', () => {
      const result = validatePitchParams({
        rangeLength: 10,
        endLength1: 0,
        endLength2: 0,
        pitchLength: 1,
      });
      expect(result.isValid).toBe(true);
    });
  });
});
