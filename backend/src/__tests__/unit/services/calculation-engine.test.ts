/**
 * @fileoverview CalculationEngine ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 9.2: 調整係数列に数値を入力する場合、計算結果に調整係数を乗算した値を数量として設定する
 * - 10.2: 丸め設定列に数値を入力する場合、調整係数適用後の値を指定された単位で切り上げた値を最終数量として設定する
 * - 47.3: 「箇所数」モードで入力された値をそのまま箇所数として用い、自動算出を行わない
 * - 47.4: 「箇所数」モードで入力されている任意項目（長さ・重量）のみを乗算した値を計算結果とする
 * - 47.5: 「箇所数」モードで任意項目がいずれも未入力の場合、箇所数そのものを計算結果とする
 * - 47.6: 計算結果に調整係数を乗算し、丸め設定の単位で切り上げた値を最終数量とする
 * - 47.7: 「箇所数」モードの乗算・調整係数・丸め処理の挙動を「ピッチ」モードと同一にする
 *
 * Task 1.2: 計算エンジンの共有ロジックを実装する
 * Task 65.2: バックエンドの計算エンジンに箇所数計算を追加する
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  CalculationEngine,
  type AreaVolumeParams,
  type PitchParams,
  type CountParams,
  type CalculationInput,
  CalculationMethod,
} from '../../../services/calculation-engine.js';

describe('CalculationEngine', () => {
  let engine: CalculationEngine;

  beforeEach(() => {
    engine = new CalculationEngine();
  });

  describe('calculateAreaVolume', () => {
    it('幅のみ入力された場合、幅をそのまま返す（Requirements: 8.6）', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal(10),
      };

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('10');
    });

    it('幅と奥行きが入力された場合、面積を計算する（Requirements: 8.6）', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal(10),
        depth: new Decimal(5),
      };

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('50');
    });

    it('幅・奥行き・高さが入力された場合、体積を計算する（Requirements: 8.6）', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal(10),
        depth: new Decimal(5),
        height: new Decimal(3),
      };

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('150');
    });

    it('全ての項目（幅・奥行き・高さ・重量）が入力された場合、全てを乗算する（Requirements: 8.6）', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal(10),
        depth: new Decimal(5),
        height: new Decimal(3),
        weight: new Decimal(2),
      };

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('300');
    });

    it('小数値を正確に計算する（浮動小数点精度）', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal('0.1'),
        depth: new Decimal('0.2'),
      };

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('0.02'); // 0.1 * 0.2 = 0.02（浮動小数点誤差なし）
    });

    it('項目が全て未入力の場合、0を返す', () => {
      // Arrange
      const params: AreaVolumeParams = {};

      // Act
      const result = engine.calculateAreaVolume(params);

      // Assert
      expect(result.toString()).toBe('0');
    });
  });

  describe('calculatePitch', () => {
    it('ピッチ計算の基本ケース: 本数を正しく算出する（Requirements: 8.9）', () => {
      // Arrange
      // 範囲長10m、端長1=1m、端長2=1m、ピッチ長=2m
      // 本数 = floor((10 - 1 - 1) / 2) + 1 = floor(8 / 2) + 1 = 4 + 1 = 5
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
      };

      // Act
      const result = engine.calculatePitch(params);

      // Assert
      expect(result.toString()).toBe('5');
    });

    it('ピッチ計算で長さが指定された場合、本数に長さを乗算する（Requirements: 8.9）', () => {
      // Arrange
      // 本数 = 5, 長さ = 1.5m
      // 結果 = 5 * 1.5 = 7.5
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        length: new Decimal('1.5'),
      };

      // Act
      const result = engine.calculatePitch(params);

      // Assert
      expect(result.toString()).toBe('7.5');
    });

    it('ピッチ計算で長さと重量が指定された場合、全てを乗算する（Requirements: 8.9）', () => {
      // Arrange
      // 本数 = 5, 長さ = 1.5m, 重量 = 2kg/m
      // 結果 = 5 * 1.5 * 2 = 15
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        length: new Decimal('1.5'),
        weight: new Decimal(2),
      };

      // Act
      const result = engine.calculatePitch(params);

      // Assert
      expect(result.toString()).toBe('15');
    });

    it('ピッチ長がゼロの場合、エラーをスローする', () => {
      // Arrange
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(0),
      };

      // Act & Assert
      expect(() => engine.calculatePitch(params)).toThrow('pitchLength must be greater than 0');
    });

    it('範囲長が端長の合計より小さい場合、本数は1を返す', () => {
      // Arrange
      // 範囲長5m、端長1=3m、端長2=3m → 有効範囲 = 5 - 3 - 3 = -1 (負)
      // この場合、最低1本は設置されるものとする
      const params: PitchParams = {
        rangeLength: new Decimal(5),
        endLength1: new Decimal(3),
        endLength2: new Decimal(3),
        pitchLength: new Decimal(2),
      };

      // Act
      const result = engine.calculatePitch(params);

      // Assert
      expect(result.toString()).toBe('1');
    });
  });

  describe('calculateCount', () => {
    it('長さ・重量が未入力の場合、箇所数をそのまま返す（Requirements: 47.3, 47.5）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(5),
      };

      // Act
      const result = engine.calculateCount(params);

      // Assert
      expect(result.toString()).toBe('5');
    });

    it('長さが指定された場合、箇所数に長さを乗算する（Requirements: 47.4）', () => {
      // Arrange
      // 箇所数 = 5, 長さ = 1.5m → 5 * 1.5 = 7.5
      const params: CountParams = {
        count: new Decimal(5),
        length: new Decimal('1.5'),
      };

      // Act
      const result = engine.calculateCount(params);

      // Assert
      expect(result.toString()).toBe('7.5');
    });

    it('重量のみが指定された場合（長さなし）、箇所数に重量を乗算する（Requirements: 47.4）', () => {
      // Arrange
      // 箇所数 = 5, 重量 = 2.5kg → 5 * 2.5 = 12.5
      const params: CountParams = {
        count: new Decimal(5),
        weight: new Decimal('2.5'),
      };

      // Act
      const result = engine.calculateCount(params);

      // Assert
      expect(result.toString()).toBe('12.5');
    });

    it('長さと重量が指定された場合、全てを乗算する（Requirements: 47.4）', () => {
      // Arrange
      // 箇所数 = 5, 長さ = 1.5m, 重量 = 2kg/m → 5 * 1.5 * 2 = 15
      const params: CountParams = {
        count: new Decimal(5),
        length: new Decimal('1.5'),
        weight: new Decimal(2),
      };

      // Act
      const result = engine.calculateCount(params);

      // Assert
      expect(result.toString()).toBe('15');
    });

    it('箇所数が同一のとき、ピッチ計算と同一の計算結果になる（Requirements: 47.7）', () => {
      // Arrange
      // ピッチ: floor((10 - 1 - 1) / 2) + 1 = 5 本
      const pitchParams: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        length: new Decimal('1.5'),
        weight: new Decimal('2.5'),
      };
      const countParams: CountParams = {
        count: new Decimal(5),
        length: new Decimal('1.5'),
        weight: new Decimal('2.5'),
      };

      // Act
      const pitchResult = engine.calculatePitch(pitchParams);
      const countResult = engine.calculateCount(countParams);

      // Assert
      expect(countResult.toString()).toBe(pitchResult.toString());
    });

    it('箇所数が整数でない場合、エラーをスローする（Requirements: 47.8）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal('2.5'),
      };

      // Act & Assert
      expect(() => engine.calculateCount(params)).toThrow('count must be an integer');
    });

    it('箇所数が最小値（1）未満の場合、エラーをスローする（Requirements: 47.8）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(0),
      };

      // Act & Assert
      expect(() => engine.calculateCount(params)).toThrow('count must be between 1 and 9999999');
    });

    it('箇所数が最大値（9999999）を超える場合、エラーをスローする（Requirements: 47.8）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(10000000),
      };

      // Act & Assert
      expect(() => engine.calculateCount(params)).toThrow('count must be between 1 and 9999999');
    });

    it('箇所数が境界値（1・9999999）の場合、エラーをスローしない（Requirements: 47.8）', () => {
      // Act & Assert
      expect(engine.calculateCount({ count: new Decimal(1) }).toString()).toBe('1');
      expect(engine.calculateCount({ count: new Decimal(9999999) }).toString()).toBe('9999999');
    });
  });

  describe('applyAdjustmentFactor', () => {
    it('調整係数を適用する（Requirements: 9.2）', () => {
      // Arrange
      const value = new Decimal(100);
      const factor = new Decimal('1.2');

      // Act
      const result = engine.applyAdjustmentFactor(value, factor);

      // Assert
      expect(result.toString()).toBe('120');
    });

    it('ほぐし係数（1.3）を適用する', () => {
      // Arrange
      const value = new Decimal(100);
      const factor = new Decimal('1.3'); // 残土処分のほぐし係数

      // Act
      const result = engine.applyAdjustmentFactor(value, factor);

      // Assert
      expect(result.toString()).toBe('130');
    });

    it('小数点を含む調整係数を正確に適用する', () => {
      // Arrange
      const value = new Decimal('123.456');
      const factor = new Decimal('1.05');

      // Act
      const result = engine.applyAdjustmentFactor(value, factor);

      // Assert
      expect(result.toString()).toBe('129.6288'); // 123.456 * 1.05
    });
  });

  describe('applyRounding', () => {
    it('指定された単位で切り上げる（Requirements: 10.2）', () => {
      // Arrange
      const value = new Decimal('10.23');
      const unit = new Decimal('0.01');

      // Act
      const result = engine.applyRounding(value, unit);

      // Assert
      expect(result.toString()).toBe('10.23');
    });

    it('コンクリートの0.25m3単位で切り上げる', () => {
      // Arrange
      const value = new Decimal('10.15');
      const unit = new Decimal('0.25');

      // Act
      const result = engine.applyRounding(value, unit);

      // Assert
      expect(result.toString()).toBe('10.25'); // 10.15を0.25単位で切り上げ = 10.25
    });

    it('整数単位で切り上げる', () => {
      // Arrange
      const value = new Decimal('10.01');
      const unit = new Decimal(1);

      // Act
      const result = engine.applyRounding(value, unit);

      // Assert
      expect(result.toString()).toBe('11');
    });

    it('ちょうど割り切れる場合はそのまま返す', () => {
      // Arrange
      const value = new Decimal('10.5');
      const unit = new Decimal('0.25');

      // Act
      const result = engine.applyRounding(value, unit);

      // Assert
      expect(result.toString()).toBe('10.5');
    });

    it('丸め単位が0以下の場合、エラーをスローする', () => {
      // Arrange
      const value = new Decimal(10);
      const unit = new Decimal(0);

      // Act & Assert
      expect(() => engine.applyRounding(value, unit)).toThrow(
        'rounding unit must be greater than 0'
      );
    });
  });

  describe('calculate', () => {
    it('標準モード: 直接入力された数量をそのまま返す（Requirements: 8.1, 8.2）', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.STANDARD,
        params: {},
        quantity: new Decimal(100),
        adjustmentFactor: new Decimal(1),
        roundingUnit: new Decimal('0.01'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.finalValue.toString()).toBe('100');
      expect(result.formula).toBe('100');
    });

    it('面積・体積モード: 計算、調整係数、丸めを適用する', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.AREA_VOLUME,
        params: {
          width: new Decimal(10),
          depth: new Decimal(5),
          height: new Decimal(3),
        },
        adjustmentFactor: new Decimal('1.2'),
        roundingUnit: new Decimal('0.25'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      // 10 * 5 * 3 = 150
      // 150 * 1.2 = 180
      // 180 / 0.25 = 720 (割り切れるのでそのまま)
      expect(result.rawValue.toString()).toBe('150');
      expect(result.adjustedValue.toString()).toBe('180');
      expect(result.finalValue.toString()).toBe('180');
      expect(result.formula).toContain('10');
      expect(result.formula).toContain('5');
      expect(result.formula).toContain('3');
    });

    it('ピッチモード: 本数計算、調整係数、丸めを適用する', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.PITCH,
        params: {
          rangeLength: new Decimal(10),
          endLength1: new Decimal(1),
          endLength2: new Decimal(1),
          pitchLength: new Decimal(2),
          length: new Decimal('1.5'),
        },
        adjustmentFactor: new Decimal('1.1'),
        roundingUnit: new Decimal(1),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      // 本数 = floor((10 - 1 - 1) / 2) + 1 = 5
      // 5 * 1.5 = 7.5
      // 7.5 * 1.1 = 8.25
      // 8.25を1単位で切り上げ = 9
      expect(result.rawValue.toString()).toBe('7.5');
      expect(result.adjustedValue.toString()).toBe('8.25');
      expect(result.finalValue.toString()).toBe('9');
    });

    it('箇所数モード: 箇所数計算、調整係数、丸めを適用する（Requirements: 47.6）', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.COUNT,
        params: {
          count: new Decimal(5),
          length: new Decimal('1.5'),
        },
        adjustmentFactor: new Decimal('1.1'),
        roundingUnit: new Decimal(1),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      // 箇所数 = 5（手入力値をそのまま使用）
      // 5 * 1.5 = 7.5
      // 7.5 * 1.1 = 8.25
      // 8.25を1単位で切り上げ = 9
      expect(result.rawValue.toString()).toBe('7.5');
      expect(result.adjustedValue.toString()).toBe('8.25');
      expect(result.finalValue.toString()).toBe('9');
      expect(result.formula).toBe('5 x 1.5 = 7.5');
    });

    it('箇所数モード: 長さ・重量が未入力の場合、箇所数がそのまま最終数量になる（Requirements: 47.5）', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.COUNT,
        params: {
          count: new Decimal(5),
        },
        adjustmentFactor: new Decimal(1),
        roundingUnit: new Decimal('0.01'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.rawValue.toString()).toBe('5');
      expect(result.adjustedValue.toString()).toBe('5');
      expect(result.finalValue.toString()).toBe('5');
      expect(result.formula).toBe('5 = 5');
    });

    it('箇所数モード: 箇所数が同一のピッチモードと最終数量・調整後の値が一致する（Requirements: 47.7）', () => {
      // Arrange
      const adjustmentFactor = new Decimal('1.1');
      const roundingUnit = new Decimal('0.25');

      const pitchInput: CalculationInput = {
        method: CalculationMethod.PITCH,
        params: {
          rangeLength: new Decimal(10),
          endLength1: new Decimal(1),
          endLength2: new Decimal(1),
          pitchLength: new Decimal(2), // → 本数 5
          length: new Decimal('1.5'),
          weight: new Decimal('2.5'),
        },
        adjustmentFactor,
        roundingUnit,
      };
      const countInput: CalculationInput = {
        method: CalculationMethod.COUNT,
        params: {
          count: new Decimal(5),
          length: new Decimal('1.5'),
          weight: new Decimal('2.5'),
        },
        adjustmentFactor,
        roundingUnit,
      };

      // Act
      const pitchResult = engine.calculate(pitchInput);
      const countResult = engine.calculate(countInput);

      // Assert
      expect(countResult.rawValue.toString()).toBe(pitchResult.rawValue.toString());
      expect(countResult.adjustedValue.toString()).toBe(pitchResult.adjustedValue.toString());
      expect(countResult.finalValue.toString()).toBe(pitchResult.finalValue.toString());
    });

    it('箇所数モード: default分岐（0）にフォールバックしない（Requirements: 47.3）', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.COUNT,
        params: {
          count: new Decimal(3),
        },
        adjustmentFactor: new Decimal(1),
        roundingUnit: new Decimal('0.01'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.rawValue.toString()).not.toBe('0');
      expect(result.formula).not.toBe('0');
    });

    it('調整係数・丸め設定のデフォルト値を使用する', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.AREA_VOLUME,
        params: {
          width: new Decimal(10),
          depth: new Decimal(5),
        },
        adjustmentFactor: new Decimal(1), // デフォルト: 1.00
        roundingUnit: new Decimal('0.01'), // デフォルト: 0.01
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.rawValue.toString()).toBe('50');
      expect(result.adjustedValue.toString()).toBe('50');
      expect(result.finalValue.toString()).toBe('50');
    });
  });

  describe('generateFormula', () => {
    it('面積・体積モードの計算式を生成する', () => {
      // Arrange
      const params: AreaVolumeParams = {
        width: new Decimal(10),
        depth: new Decimal(5),
        height: new Decimal(3),
      };

      // Act
      const formula = engine.generateAreaVolumeFormula(params);

      // Assert
      expect(formula).toBe('10 x 5 x 3 = 150');
    });

    it('面積・体積モードで重量のみの計算式を生成する', () => {
      // Arrange
      const params: AreaVolumeParams = {
        weight: new Decimal(25),
      };

      // Act
      const formula = engine.generateAreaVolumeFormula(params);

      // Assert
      expect(formula).toBe('25 = 25');
    });

    it('面積・体積モードで全項目未入力の場合、0を返す', () => {
      // Arrange
      const params: AreaVolumeParams = {};

      // Act
      const formula = engine.generateAreaVolumeFormula(params);

      // Assert
      expect(formula).toBe('0');
    });

    it('ピッチモードの計算式を生成する', () => {
      // Arrange
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        length: new Decimal('1.5'),
      };

      // Act
      const formula = engine.generatePitchFormula(params);

      // Assert
      expect(formula).toContain('floor((10 - 1 - 1) / 2) + 1');
      expect(formula).toContain('= 5');
      expect(formula).toContain('x 1.5');
    });

    it('ピッチモードで重量も指定された場合の計算式を生成する', () => {
      // Arrange
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        length: new Decimal('1.5'),
        weight: new Decimal('2.5'),
      };

      // Act
      const formula = engine.generatePitchFormula(params);

      // Assert
      expect(formula).toContain('floor((10 - 1 - 1) / 2) + 1');
      expect(formula).toContain('= 5');
      expect(formula).toContain('x 1.5');
      expect(formula).toContain('x 2.5');
    });

    it('ピッチモードで有効範囲が0以下の場合の計算式を生成する', () => {
      // Arrange
      const params: PitchParams = {
        rangeLength: new Decimal(5),
        endLength1: new Decimal(3),
        endLength2: new Decimal(3),
        pitchLength: new Decimal(2),
      };

      // Act
      const formula = engine.generatePitchFormula(params);

      // Assert
      expect(formula).toContain('= 1'); // 本数は最低1
    });

    it('箇所数モードの計算式を生成する（Requirements: 47.4）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(5),
        length: new Decimal('2.5'),
        weight: new Decimal('1.5'),
      };

      // Act
      const formula = engine.generateCountFormula(params);

      // Assert
      expect(formula).toBe('5 x 2.5 x 1.5 = 18.75');
    });

    it('箇所数モードで長さ・重量が未入力の場合の計算式を生成する（Requirements: 47.5）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(5),
      };

      // Act
      const formula = engine.generateCountFormula(params);

      // Assert
      expect(formula).toBe('5 = 5');
    });

    it('箇所数モードで重量のみ指定された場合の計算式を生成する（Requirements: 47.4）', () => {
      // Arrange
      const params: CountParams = {
        count: new Decimal(4),
        weight: new Decimal('2.5'),
      };

      // Act
      const formula = engine.generateCountFormula(params);

      // Assert
      expect(formula).toBe('4 x 2.5 = 10');
    });
  });

  describe('calculate - additional cases', () => {
    it('標準モードでquantityが未定義の場合、0を返す', () => {
      // Arrange
      const input: CalculationInput = {
        method: CalculationMethod.STANDARD,
        params: {},
        quantity: undefined,
        adjustmentFactor: new Decimal(1),
        roundingUnit: new Decimal('0.01'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.rawValue.toString()).toBe('0');
      expect(result.finalValue.toString()).toBe('0');
      expect(result.formula).toBe('0');
    });

    it('未知の計算方法の場合、デフォルトで0を返す', () => {
      // Arrange
      const input: CalculationInput = {
        method: 'UNKNOWN' as CalculationMethod,
        params: {},
        adjustmentFactor: new Decimal(1),
        roundingUnit: new Decimal('0.01'),
      };

      // Act
      const result = engine.calculate(input);

      // Assert
      expect(result.rawValue.toString()).toBe('0');
      expect(result.finalValue.toString()).toBe('0');
      expect(result.formula).toBe('0');
    });
  });

  describe('calculatePitch - additional cases', () => {
    it('ピッチ計算で重量のみが指定された場合（長さなし）、本数に重量を乗算する', () => {
      // Arrange
      // 本数 = 5, 重量 = 2.5kg
      // 結果 = 5 * 2.5 = 12.5
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(2),
        weight: new Decimal('2.5'),
      };

      // Act
      const result = engine.calculatePitch(params);

      // Assert
      expect(result.toString()).toBe('12.5');
    });

    it('ピッチ長が負の場合、エラーをスローする', () => {
      // Arrange
      const params: PitchParams = {
        rangeLength: new Decimal(10),
        endLength1: new Decimal(1),
        endLength2: new Decimal(1),
        pitchLength: new Decimal(-1),
      };

      // Act & Assert
      expect(() => engine.calculatePitch(params)).toThrow('pitchLength must be greater than 0');
    });
  });

  describe('applyRounding - additional cases', () => {
    it('負の丸め単位の場合、エラーをスローする', () => {
      // Arrange
      const value = new Decimal(10);
      const unit = new Decimal(-0.1);

      // Act & Assert
      expect(() => engine.applyRounding(value, unit)).toThrow(
        'rounding unit must be greater than 0'
      );
    });
  });
});
