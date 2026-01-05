/**
 * @fileoverview QuantityValidationService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 8.3: 計算方法が「標準」で数量フィールドに負の値が入力される場合、警告メッセージを表示し確認を求める
 * - 8.4: 計算方法が「標準」で数量フィールドに数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 8.7: 「面積・体積」モードで計算用列に値が1つも入力されていない状態で保存を試行する場合、エラーメッセージを表示する
 * - 8.10: 「ピッチ」モードで必須項目のいずれかが未入力で保存を試行する場合、エラーメッセージを表示する
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 *
 * Task 2.5: 計算検証とバリデーションを実装する
 *
 * @module __tests__/unit/services/quantity-validation.service.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuantityValidationService,
  type QuantityItemValidationInput,
} from '../../../services/quantity-validation.service.js';

describe('QuantityValidationService', () => {
  let service: QuantityValidationService;

  beforeEach(() => {
    service = new QuantityValidationService();
  });

  describe('validateQuantityItem', () => {
    describe('標準モード（STANDARD）', () => {
      it('正常な入力は有効と判定される（Requirements: 8.2）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('数量が負の値の場合は警告を返す（Requirements: 8.3）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: -50,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'quantity',
            message: expect.stringContaining('負の値'),
          })
        );
      });

      it('数量がnullまたはundefinedの場合はエラーを返す', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: undefined as unknown as number,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'quantity',
          })
        );
      });
    });

    describe('面積・体積モード（AREA_VOLUME）', () => {
      it('少なくとも1つの値が入力されていれば有効（Requirements: 8.6）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10 },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('全ての計算パラメータが未入力の場合はエラーを返す（Requirements: 8.7）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'AREA_VOLUME',
          calculationParams: {},
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams',
            message: expect.stringContaining('少なくとも1つ'),
          })
        );
      });

      it('複数の値が入力されていれば有効（Requirements: 8.6）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10, depth: 5, height: 2 },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
      });

      it('計算パラメータに負の値がある場合は警告を返す', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10, depth: -5 },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.depth',
            message: expect.stringContaining('負の値'),
          })
        );
      });
    });

    describe('ピッチモード（PITCH）', () => {
      it('必須項目が全て入力されていれば有効（Requirements: 8.9）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength1: 50,
            endLength2: 50,
            pitchLength: 100,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('範囲長が未入力の場合はエラーを返す（Requirements: 8.10）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            endLength1: 50,
            endLength2: 50,
            pitchLength: 100,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.rangeLength',
            message: expect.stringContaining('必須'),
          })
        );
      });

      it('端長1が未入力の場合はエラーを返す（Requirements: 8.10）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength2: 50,
            pitchLength: 100,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.endLength1',
            message: expect.stringContaining('必須'),
          })
        );
      });

      it('端長2が未入力の場合はエラーを返す（Requirements: 8.10）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength1: 50,
            pitchLength: 100,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.endLength2',
            message: expect.stringContaining('必須'),
          })
        );
      });

      it('ピッチ長が未入力の場合はエラーを返す（Requirements: 8.10）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength1: 50,
            endLength2: 50,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.pitchLength',
            message: expect.stringContaining('必須'),
          })
        );
      });

      it('ピッチ長が0以下の場合はエラーを返す', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength1: 50,
            endLength2: 50,
            pitchLength: 0,
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'calculationParams.pitchLength',
            message: expect.stringContaining('0より大きい'),
          })
        );
      });

      it('任意項目（長さ・重量）は未入力でも有効', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 1000,
            endLength1: 50,
            endLength2: 50,
            pitchLength: 100,
            // length and weight are optional
          },
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
      });
    });

    describe('調整係数（adjustmentFactor）', () => {
      it('0以下の値の場合は警告を返す（Requirements: 9.3）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 0,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'adjustmentFactor',
            message: expect.stringContaining('0以下'),
          })
        );
      });

      it('負の値の場合は警告を返す（Requirements: 9.3）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: -0.5,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'adjustmentFactor',
            message: expect.stringContaining('0以下'),
          })
        );
      });

      it('正の値の場合は警告なし', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.3,
          roundingUnit: 0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.warnings.filter((w) => w.field === 'adjustmentFactor')).toHaveLength(0);
      });
    });

    describe('丸め設定（roundingUnit）', () => {
      it('0以下の値の場合はエラーを返す（Requirements: 10.3）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.0,
          roundingUnit: 0,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'roundingUnit',
            message: expect.stringContaining('0より大きい'),
          })
        );
      });

      it('負の値の場合はエラーを返す（Requirements: 10.3）', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.0,
          roundingUnit: -0.01,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'roundingUnit',
            message: expect.stringContaining('0より大きい'),
          })
        );
      });

      it('正の値の場合はエラーなし', () => {
        // Arrange
        const input: QuantityItemValidationInput = {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.0,
          roundingUnit: 0.25,
        };

        // Act
        const result = service.validateQuantityItem(input);

        // Assert
        expect(result.errors.filter((e) => e.field === 'roundingUnit')).toHaveLength(0);
      });
    });
  });

  describe('validateCalculationParams', () => {
    it('面積・体積モードで必要なパラメータを検証する', () => {
      // Arrange & Act
      const result = service.validateCalculationParams('AREA_VOLUME', {});

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'calculationParams',
        })
      );
    });

    it('ピッチモードで必要なパラメータを検証する', () => {
      // Arrange & Act
      const result = service.validateCalculationParams('PITCH', {
        rangeLength: 1000,
        // 他の必須項目が欠けている
      });

      // Assert
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateNumericInput', () => {
    it('数値型の入力は有効', () => {
      // Act
      const result = service.validateNumericInput(100, 'testField');

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('NaN入力は無効（Requirements: 8.4, 9.4, 10.4）', () => {
      // Act
      const result = service.validateNumericInput(NaN, 'testField');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'testField',
          message: expect.stringContaining('数値'),
        })
      );
    });

    it('Infinity入力は無効', () => {
      // Act
      const result = service.validateNumericInput(Infinity, 'testField');

      // Assert
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateBatch', () => {
    it('複数の項目を一括検証できる', () => {
      // Arrange
      const items: QuantityItemValidationInput[] = [
        {
          calculationMethod: 'STANDARD',
          calculationParams: {},
          quantity: 100,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        },
        {
          calculationMethod: 'AREA_VOLUME',
          calculationParams: {}, // エラー：値が未入力
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        },
      ];

      // Act
      const results = service.validateBatch(items);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]!.isValid).toBe(true);
      expect(results[1]!.isValid).toBe(false);
    });
  });
});
