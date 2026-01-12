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
  formatDecimal2,
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

  describe('formatDecimal2', () => {
    describe('整数値のフォーマット', () => {
      it('1を "1.00" に変換する', () => {
        expect(formatDecimal2(1)).toBe('1.00');
      });

      it('0を "0.00" に変換する', () => {
        expect(formatDecimal2(0)).toBe('0.00');
      });

      it('100を "100.00" に変換する', () => {
        expect(formatDecimal2(100)).toBe('100.00');
      });

      it('-5を "-5.00" に変換する', () => {
        expect(formatDecimal2(-5)).toBe('-5.00');
      });
    });

    describe('小数値のフォーマット', () => {
      it('1.5を "1.50" に変換する（小数1桁→2桁）', () => {
        expect(formatDecimal2(1.5)).toBe('1.50');
      });

      it('1.25を "1.25" に変換する（小数2桁はそのまま）', () => {
        expect(formatDecimal2(1.25)).toBe('1.25');
      });

      it('1.999を "2.00" に変換する（小数3桁は四捨五入）', () => {
        expect(formatDecimal2(1.999)).toBe('2.00');
      });

      it('0.01を "0.01" に変換する', () => {
        expect(formatDecimal2(0.01)).toBe('0.01');
      });

      it('0.1を "0.10" に変換する', () => {
        expect(formatDecimal2(0.1)).toBe('0.10');
      });
    });

    describe('負の小数値のフォーマット', () => {
      it('-1.5を "-1.50" に変換する', () => {
        expect(formatDecimal2(-1.5)).toBe('-1.50');
      });

      it('-0.01を "-0.01" に変換する', () => {
        expect(formatDecimal2(-0.01)).toBe('-0.01');
      });
    });

    describe('典型的なユースケース', () => {
      it('調整係数のデフォルト値 1 を "1.00" に変換する', () => {
        expect(formatDecimal2(1)).toBe('1.00');
      });

      it('丸め設定のデフォルト値 0.01 を "0.01" に変換する', () => {
        expect(formatDecimal2(0.01)).toBe('0.01');
      });

      it('数量の入力値 150.5 を "150.50" に変換する', () => {
        expect(formatDecimal2(150.5)).toBe('150.50');
      });
    });
  });

  // ============================================================================
  // Task 13.1: テキストフィールドバリデーションの単体テスト（拡張）
  // ============================================================================

  describe('Task 13.1: テキストフィールドバリデーションの拡張テスト', () => {
    describe('全角/半角混在文字列の文字幅計算テスト', () => {
      it('全角ひらがな・カタカナ・漢字の混在を正しく計算する', () => {
        // あ(2) + イ(2) + 漢(2) = 6
        expect(calculateStringWidth('あイ漢')).toBe(6);
      });

      it('半角英数字と全角文字の交互配置を正しく計算する', () => {
        // a(1) + あ(2) + b(1) + い(2) + c(1) = 7
        expect(calculateStringWidth('aあbいc')).toBe(7);
      });

      it('全角記号を正しく計算する', () => {
        // ！(2) + ？(2) + ＃(2) = 6
        expect(calculateStringWidth('！？＃')).toBe(6);
      });

      it('半角記号を正しく計算する', () => {
        // !(1) + ?(1) + #(1) = 3
        expect(calculateStringWidth('!?#')).toBe(3);
      });

      it('建設業務で典型的な文字列を正しく計算する', () => {
        // 共(2) + 通(2) + 仮(2) + 設(2) = 8
        expect(calculateStringWidth('共通仮設')).toBe(8);

        // 足(2) + 場(2) + 1(1) + 0(1) + 0(1) = 7
        expect(calculateStringWidth('足場100')).toBe(7);

        // コ(2) + ン(2) + ク(2) + リ(2) + ー(2) + ト(2) = 12
        expect(calculateStringWidth('コンクリート')).toBe(12);
      });
    });

    describe('境界値テスト（フィールド別）', () => {
      it('大項目: 全角25文字ちょうどは有効', () => {
        const text = '漢'.repeat(25); // 幅50
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(true);
      });

      it('大項目: 全角24文字 + 半角2文字（幅50）は有効', () => {
        const text = '漢'.repeat(24) + 'ab'; // 48 + 2 = 50
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(true);
      });

      it('大項目: 全角24文字 + 半角3文字（幅51）は無効', () => {
        const text = '漢'.repeat(24) + 'abc'; // 48 + 3 = 51
        const result = validateTextLength(text, 'majorCategory');
        expect(result.isValid).toBe(false);
      });

      it('工種: 全角8文字ちょうど（幅16）は有効', () => {
        const text = '漢'.repeat(8); // 幅16
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(true);
      });

      it('工種: 全角7文字 + 半角2文字（幅16）は有効', () => {
        const text = '漢'.repeat(7) + 'ab'; // 14 + 2 = 16
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(true);
      });

      it('工種: 半角17文字（幅17）は無効', () => {
        const text = 'a'.repeat(17);
        const result = validateTextLength(text, 'workType');
        expect(result.isValid).toBe(false);
      });

      it('単位: 全角3文字ちょうど（幅6）は有効', () => {
        const text = '平米台'; // 幅6
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(true);
      });

      it('単位: 半角6文字ちょうど（幅6）は有効', () => {
        const text = 'pieces'; // 幅6
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(true);
      });

      it('単位: 全角2文字 + 半角3文字（幅7）は無効', () => {
        const text = '平米abc'; // 4 + 3 = 7
        const result = validateTextLength(text, 'unit');
        expect(result.isValid).toBe(false);
      });
    });

    describe('特殊文字・絵文字・サロゲートペアの取り扱いテスト', () => {
      it('基本絵文字（BMP外）は全角として計算される', () => {
        const emoji = '\u{1F600}'; // 😀
        expect(calculateStringWidth(emoji)).toBe(2);
      });

      it('絵文字を含む文字列の幅を正しく計算する', () => {
        // 漢(2) + 😀(2) + a(1) = 5
        const text = '漢\u{1F600}a';
        expect(calculateStringWidth(text)).toBe(5);
      });

      it('サロゲートペア文字（𠮷など）を正しく計算する', () => {
        const text = '\u{20BB7}'; // 𠮷（つちよし）
        expect(calculateStringWidth(text)).toBe(2);
      });

      it('全角スペースは全角として計算される', () => {
        expect(calculateStringWidth('\u3000')).toBe(2);
      });

      it('半角スペースは半角として計算される', () => {
        expect(calculateStringWidth(' ')).toBe(1);
      });

      it('制御文字を含む文字列を正しく処理する', () => {
        expect(calculateStringWidth('\t')).toBe(1);
        expect(calculateStringWidth('\n')).toBe(1);
      });
    });
  });

  // ============================================================================
  // Task 13.3: 表示書式変換の単体テスト（拡張）
  // ============================================================================

  describe('Task 13.3: 表示書式変換の拡張テスト', () => {
    describe('四捨五入処理テスト', () => {
      it('小数3桁以上は四捨五入で2桁に丸める', () => {
        expect(formatDecimal2(1.234)).toBe('1.23');
        expect(formatDecimal2(1.235)).toBe('1.24'); // 四捨五入
        expect(formatDecimal2(1.999)).toBe('2.00');
      });

      it('負の数も正しく四捨五入する', () => {
        expect(formatDecimal2(-1.234)).toBe('-1.23');
        expect(formatDecimal2(-1.235)).toBe('-1.24');
      });

      it('非常に小さい小数を正しく処理する', () => {
        expect(formatDecimal2(0.001)).toBe('0.00');
        expect(formatDecimal2(0.005)).toBe('0.01');
        expect(formatDecimal2(0.004)).toBe('0.00');
      });
    });

    describe('典型的なフィールド値の書式設定テスト', () => {
      it('調整係数の典型値を書式設定する', () => {
        expect(formatDecimal2(1)).toBe('1.00'); // デフォルト値
        expect(formatDecimal2(1.2)).toBe('1.20');
        expect(formatDecimal2(-0.5)).toBe('-0.50');
      });

      it('丸め設定の典型値を書式設定する', () => {
        expect(formatDecimal2(0.01)).toBe('0.01'); // デフォルト値
        expect(formatDecimal2(0.25)).toBe('0.25');
        expect(formatDecimal2(1)).toBe('1.00');
      });

      it('数量の典型値を書式設定する', () => {
        expect(formatDecimal2(0)).toBe('0.00'); // デフォルト値
        expect(formatDecimal2(150.5)).toBe('150.50');
        expect(formatDecimal2(-50)).toBe('-50.00');
      });
    });

    describe('大きな数値の書式設定テスト', () => {
      it('最大値に近い数量を書式設定する', () => {
        expect(formatDecimal2(9999999.99)).toBe('9999999.99');
        expect(formatDecimal2(-999999.99)).toBe('-999999.99');
      });

      it('大きな整数を書式設定する', () => {
        expect(formatDecimal2(1234567)).toBe('1234567.00');
        expect(formatDecimal2(-1234567)).toBe('-1234567.00');
      });
    });
  });

  // ============================================================================
  // Task 13.2: 数値フィールド残幅計算テスト
  // ============================================================================

  describe('Task 13.2: 残り入力可能幅計算テスト', () => {
    describe('各フィールドの残幅計算', () => {
      it('中項目の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'middleCategory')).toBe(50);
        expect(getRemainingWidth('あ'.repeat(10), 'middleCategory')).toBe(30);
      });

      it('小項目の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'minorCategory')).toBe(50);
        expect(getRemainingWidth('テスト', 'minorCategory')).toBe(44); // 6幅消費
      });

      it('任意分類の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'customCategory')).toBe(50);
        expect(getRemainingWidth('abc123', 'customCategory')).toBe(44); // 6幅消費
      });

      it('名称の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'name')).toBe(50);
        expect(getRemainingWidth('製品名テスト', 'name')).toBe(38); // 12幅消費
      });

      it('規格の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'specification')).toBe(50);
        expect(getRemainingWidth('100x200mm', 'specification')).toBe(41); // 9幅消費
      });

      it('計算方法の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'calculationMethod')).toBe(50);
        expect(getRemainingWidth('標準計算', 'calculationMethod')).toBe(42); // 8幅消費
      });

      it('備考の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'remarks')).toBe(50);
        expect(getRemainingWidth('注意事項', 'remarks')).toBe(42); // 8幅消費
      });

      it('工種の残幅を正しく計算する', () => {
        expect(getRemainingWidth('', 'workType')).toBe(16);
        expect(getRemainingWidth('鉄筋工', 'workType')).toBe(10); // 6幅消費
      });
    });

    describe('超過時の負の残幅', () => {
      it('大項目が超過した場合は負の残幅を返す', () => {
        const text = 'あ'.repeat(26); // 幅52
        expect(getRemainingWidth(text, 'majorCategory')).toBe(-2);
      });

      it('工種が超過した場合は負の残幅を返す', () => {
        const text = 'a'.repeat(17); // 幅17
        expect(getRemainingWidth(text, 'workType')).toBe(-1);
      });

      it('単位が超過した場合は負の残幅を返す', () => {
        const text = 'あいうえ'; // 幅8
        expect(getRemainingWidth(text, 'unit')).toBe(-2);
      });
    });
  });
});
