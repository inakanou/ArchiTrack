/**
 * @fileoverview フィールドバリデーションユーティリティのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 *
 * Task 12.1: テキストフィールド入力制御コンポーネントを実装する
 *
 * @module utils/field-validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStringWidth,
  validateTextLength,
  getRemainingWidth,
  FIELD_CONSTRAINTS,
} from './field-validation';

describe('field-validation', () => {
  describe('FIELD_CONSTRAINTS', () => {
    it('大項目の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.majorCategory).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('中項目の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.middleCategory).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('小項目の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.minorCategory).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('任意分類の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.customCategory).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('工種の制限が全角8/半角16文字', () => {
      expect(FIELD_CONSTRAINTS.workType).toEqual({ zenkaku: 8, hankaku: 16 });
    });

    it('名称の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.name).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('規格の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.specification).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('単位の制限が全角3/半角6文字', () => {
      expect(FIELD_CONSTRAINTS.unit).toEqual({ zenkaku: 3, hankaku: 6 });
    });

    it('計算方法の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.calculationMethod).toEqual({ zenkaku: 25, hankaku: 50 });
    });

    it('備考の制限が全角25/半角50文字', () => {
      expect(FIELD_CONSTRAINTS.remarks).toEqual({ zenkaku: 25, hankaku: 50 });
    });
  });

  describe('calculateStringWidth', () => {
    describe('半角文字（幅1）', () => {
      it('ASCII英数字は幅1', () => {
        expect(calculateStringWidth('a')).toBe(1);
        expect(calculateStringWidth('Z')).toBe(1);
        expect(calculateStringWidth('5')).toBe(1);
      });

      it('ASCII記号は幅1', () => {
        expect(calculateStringWidth('!')).toBe(1);
        expect(calculateStringWidth('@')).toBe(1);
        expect(calculateStringWidth(' ')).toBe(1);
      });

      it('半角カタカナは幅1', () => {
        expect(calculateStringWidth('ｱ')).toBe(1);
        expect(calculateStringWidth('ｲ')).toBe(1);
        expect(calculateStringWidth('ｳ')).toBe(1);
      });
    });

    describe('全角文字（幅2）', () => {
      it('日本語ひらがなは幅2', () => {
        expect(calculateStringWidth('あ')).toBe(2);
        expect(calculateStringWidth('い')).toBe(2);
      });

      it('日本語カタカナは幅2', () => {
        expect(calculateStringWidth('ア')).toBe(2);
        expect(calculateStringWidth('イ')).toBe(2);
      });

      it('日本語漢字は幅2', () => {
        expect(calculateStringWidth('漢')).toBe(2);
        expect(calculateStringWidth('字')).toBe(2);
      });

      it('全角英数字は幅2', () => {
        expect(calculateStringWidth('Ａ')).toBe(2);
        expect(calculateStringWidth('１')).toBe(2);
      });
    });

    describe('混在文字列', () => {
      it('半角のみの文字列', () => {
        expect(calculateStringWidth('abc123')).toBe(6);
      });

      it('全角のみの文字列', () => {
        expect(calculateStringWidth('あいう')).toBe(6);
      });

      it('混在文字列（共通仮設）', () => {
        // '共' = 2, '通' = 2, '仮' = 2, '設' = 2
        expect(calculateStringWidth('共通仮設')).toBe(8);
      });

      it('混在文字列（半角数字 + 全角漢字）', () => {
        // '足' = 2, '場' = 2, '1' = 1, '0' = 1, '0' = 1
        expect(calculateStringWidth('足場100')).toBe(7);
      });

      it('空文字列', () => {
        expect(calculateStringWidth('')).toBe(0);
      });
    });
  });

  describe('validateTextLength', () => {
    describe('大項目（全角25/半角50）', () => {
      it('全角25文字はOK', () => {
        const text = 'あ'.repeat(25); // 幅50
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(true);
      });

      it('半角50文字はOK', () => {
        const text = 'a'.repeat(50); // 幅50
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(true);
      });

      it('全角26文字はNG', () => {
        const text = 'あ'.repeat(26); // 幅52
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('大項目');
        expect(result.error).toContain('全角25文字');
        expect(result.error).toContain('半角50文字');
      });

      it('半角51文字はNG', () => {
        const text = 'a'.repeat(51); // 幅51
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(false);
      });
    });

    describe('工種（全角8/半角16）', () => {
      it('全角8文字はOK', () => {
        const text = '仮設工事工種'; // 6文字 = 幅12 < 16
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(true);
      });

      it('半角16文字はOK', () => {
        const text = 'a'.repeat(16); // 幅16
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(true);
      });

      it('全角9文字はNG', () => {
        const text = 'あ'.repeat(9); // 幅18
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('工種');
      });
    });

    describe('単位（全角3/半角6）', () => {
      it('m2はOK', () => {
        const result = validateTextLength('m2', 'unit');
        expect(result.isValid).toBe(true);
      });

      it('全角3文字はOK', () => {
        const text = '平米台'; // 幅6
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(true);
      });

      it('半角6文字はOK', () => {
        const text = 'pieces'; // 幅6
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(true);
      });

      it('全角4文字はNG', () => {
        const text = 'あいうえ'; // 幅8
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('単位');
      });
    });

    describe('空文字列', () => {
      it('空文字列はOK', () => {
        const result = validateTextLength('', 'majorCategory');
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('getRemainingWidth', () => {
    describe('大項目（最大幅50）', () => {
      it('空文字列の場合は50', () => {
        expect(getRemainingWidth('', 'majorCategory')).toBe(50);
      });

      it('半角10文字の場合は40', () => {
        expect(getRemainingWidth('a'.repeat(10), 'majorCategory')).toBe(40);
      });

      it('全角10文字の場合は30', () => {
        expect(getRemainingWidth('あ'.repeat(10), 'majorCategory')).toBe(30);
      });

      it('最大幅を超えた場合は0以下を返す', () => {
        expect(getRemainingWidth('あ'.repeat(26), 'majorCategory')).toBe(-2);
      });
    });

    describe('単位（最大幅6）', () => {
      it('空文字列の場合は6', () => {
        expect(getRemainingWidth('', 'unit')).toBe(6);
      });

      it('m2の場合は4', () => {
        expect(getRemainingWidth('m2', 'unit')).toBe(4);
      });
    });
  });
});
