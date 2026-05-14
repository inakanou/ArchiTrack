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

  /**
   * グループ名切り詰めユーティリティ（Task 52.1）
   *
   * Requirements:
   * - 38.5: 複製先グループ名を「{元名}のコピー」とする
   * - 38.6: 上限（全角25文字/半角50文字、REQ-22 AC4）を超える場合は元名を切り詰めてサフィックスを末尾に付与する
   *
   * 文字幅カウントは既存の QuantityFieldValidationService.calculateStringWidth と同一仕様
   * （全角=2, 半角=1, ASCII/半角カナ=1）。
   */
  describe('truncateNameWithSuffix', () => {
    it('結果が maxWidth 以下なら元名 + suffix をそのまま返す（Requirements: 38.5）', () => {
      // Arrange: 「あ」(width=2) × 5 + 「のコピー」(width=8) = 18 <= 50
      const originalName = 'あああああ';
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result).toBe('あああああのコピー');
    });

    it('半角のみで maxWidth 以下なら素通し（Requirements: 38.5）', () => {
      // Arrange: 半角40文字 + 'のコピー'(width=8) = 48 <= 50
      const originalName = 'a'.repeat(40);
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result).toBe('a'.repeat(40) + 'のコピー');
    });

    it('上限超過時、元名側を切り詰めて suffix を末尾に必ず付与する（Requirements: 38.6）', () => {
      // Arrange: 「あ」(width=2) × 25 = 50, suffix「のコピー」(width=8) を含めると 58 で 50 超過
      // 期待: 元名を width(50 - 8) = 42 以内に切り詰める → 「あ」× 21 (width=42) + 「のコピー」
      const originalName = 'あ'.repeat(25);
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result.endsWith(suffix)).toBe(true);
      expect(service.calculateStringWidth(result)).toBeLessThanOrEqual(maxWidth);
      expect(result).toBe('あ'.repeat(21) + 'のコピー');
    });

    it('全角・半角混在で上限超過時、既存カウントロジックに従って切り詰められる（Requirements: 38.6）', () => {
      // Arrange: 「あa」(width=3) × 16 = width48 + suffix「のコピー」(width=8) = 56 で 50 超過
      // 期待: 元名 width <= 42 まで切り詰め → 「あa」を貪欲消費して width<=42 になる範囲
      // 「あa」14回 = width42, 末尾「のコピー」付与 → width50
      const originalName = 'あa'.repeat(16);
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result.endsWith(suffix)).toBe(true);
      expect(service.calculateStringWidth(result)).toBeLessThanOrEqual(maxWidth);
      expect(result).toBe('あa'.repeat(14) + 'のコピー');
    });

    it('半角カナ（U+FF61〜U+FF9F）は width=1 としてカウントされる', () => {
      // Arrange: 半角カナ「ｶ」(width=1) × 50 + 'のコピー'(width=8) = 58 で 50 超過
      // 期待: 元名を width <= 42 まで切り詰め → 「ｶ」× 42 + 「のコピー」
      const originalName = 'ｶ'.repeat(50);
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result.endsWith(suffix)).toBe(true);
      expect(service.calculateStringWidth(result)).toBeLessThanOrEqual(maxWidth);
      expect(result).toBe('ｶ'.repeat(42) + 'のコピー');
    });

    it('境界値: 元名+suffix がちょうど maxWidth と一致する場合は切り詰めない', () => {
      // Arrange: 「あ」(width=2) × 21 = width42, + 「のコピー」(width=8) = ちょうど 50
      const originalName = 'あ'.repeat(21);
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result).toBe('あ'.repeat(21) + 'のコピー');
      expect(service.calculateStringWidth(result)).toBe(50);
    });

    it('元名が空文字の場合は suffix のみを返す', () => {
      // Arrange
      const originalName = '';
      const suffix = 'のコピー';
      const maxWidth = 50;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result).toBe('のコピー');
    });

    it('suffix の幅が maxWidth と等しい場合は元名を空に切り詰めて suffix のみを返す', () => {
      // Arrange: suffix「のコピー」(width=8) maxWidth=8 → 元名分の余地ゼロ
      const originalName = 'あいうえ';
      const suffix = 'のコピー';
      const maxWidth = 8;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert
      expect(result).toBe('のコピー');
      expect(service.calculateStringWidth(result)).toBeLessThanOrEqual(maxWidth);
    });

    it('suffix だけで maxWidth を超える場合は suffix をそのまま返す（要件外のエッジケース）', () => {
      // Arrange: suffix「のコピー」(width=8) より maxWidth=4 が小さい
      const originalName = 'あいうえお';
      const suffix = 'のコピー';
      const maxWidth = 4;

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, maxWidth);

      // Assert: 元名を完全に削っても上限内に収まらないため suffix のみ返す
      // （Requirements 38.6 はサフィックスを「必ず末尾に付与」と定めているため suffix 落としは不可）
      expect(result).toBe('のコピー');
    });

    it('maxWidth が 0 以下の場合は空文字を返す（防御的エッジケース）', () => {
      // Arrange
      const originalName = 'あいうえお';
      const suffix = 'のコピー';

      // Act
      const result = service.truncateNameWithSuffix(originalName, suffix, 0);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('truncateForCopy', () => {
    it('design.md 準拠の固定上限（全角25/半角50）で truncateNameWithSuffix を呼び出す（Requirements: 38.5, 38.6）', () => {
      // Arrange: width が ちょうど 50 を超えるケース
      const originalName = 'あ'.repeat(25);
      const suffix = 'のコピー';

      // Act
      const result = service.truncateForCopy(originalName, suffix);

      // Assert: 全角25 × width2 = 50, suffix を含めて 58 超過 → 切り詰め
      expect(result.endsWith(suffix)).toBe(true);
      expect(service.calculateStringWidth(result)).toBeLessThanOrEqual(50);
    });

    it('短い名前はそのまま「{元名}のコピー」を返す（Requirements: 38.5）', () => {
      // Arrange
      const originalName = 'グループA';
      const suffix = 'のコピー';

      // Act
      const result = service.truncateForCopy(originalName, suffix);

      // Assert
      expect(result).toBe('グループAのコピー');
    });
  });

  describe('calculateStringWidth', () => {
    it('既存仕様：全角=2, 半角=1, 半角カナ=1', () => {
      expect(service.calculateStringWidth('')).toBe(0);
      expect(service.calculateStringWidth('abc')).toBe(3);
      expect(service.calculateStringWidth('あいう')).toBe(6);
      expect(service.calculateStringWidth('aあ')).toBe(3);
      expect(service.calculateStringWidth('ｶﾅ')).toBe(2);
    });
  });
});
