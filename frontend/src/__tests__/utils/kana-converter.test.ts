/**
 * kana-converter.ts ユニットテスト
 *
 * フロントエンド用かな変換ユーティリティのテスト
 * バックエンドの同等機能と同一の動作を保証する
 *
 * @requirement 16.3 フリガナ検索でひらがな・カタカナ両対応
 */

import { describe, it, expect } from 'vitest';
import {
  toKatakana,
  toHiragana,
  containsHiragana,
  containsKatakana,
  HIRAGANA_START,
  HIRAGANA_END,
  KATAKANA_START,
  KATAKANA_END,
  KANA_OFFSET,
} from '../../utils/kana-converter';

describe('kana-converter', () => {
  describe('Unicode定数', () => {
    it('ひらがな範囲の開始コードポイントが正しい', () => {
      expect(HIRAGANA_START).toBe(0x3041);
    });

    it('ひらがな範囲の終了コードポイントが正しい', () => {
      expect(HIRAGANA_END).toBe(0x3096);
    });

    it('カタカナ範囲の開始コードポイントが正しい', () => {
      expect(KATAKANA_START).toBe(0x30a1);
    });

    it('カタカナ範囲の終了コードポイントが正しい', () => {
      expect(KATAKANA_END).toBe(0x30f6);
    });

    it('かな変換オフセットが正しい', () => {
      expect(KANA_OFFSET).toBe(0x60);
    });
  });

  describe('toKatakana', () => {
    describe('基本変換', () => {
      it('ひらがなをカタカナに変換する', () => {
        expect(toKatakana('やまだたろう')).toBe('ヤマダタロウ');
      });

      it('すべてのひらがな文字を変換する', () => {
        expect(toKatakana('あいうえお')).toBe('アイウエオ');
        expect(toKatakana('かきくけこ')).toBe('カキクケコ');
        expect(toKatakana('さしすせそ')).toBe('サシスセソ');
        expect(toKatakana('たちつてと')).toBe('タチツテト');
        expect(toKatakana('なにぬねの')).toBe('ナニヌネノ');
        expect(toKatakana('はひふへほ')).toBe('ハヒフヘホ');
        expect(toKatakana('まみむめも')).toBe('マミムメモ');
        expect(toKatakana('やゆよ')).toBe('ヤユヨ');
        expect(toKatakana('らりるれろ')).toBe('ラリルレロ');
        expect(toKatakana('わをん')).toBe('ワヲン');
      });

      it('濁音・半濁音を変換する', () => {
        expect(toKatakana('がぎぐげご')).toBe('ガギグゲゴ');
        expect(toKatakana('ざじずぜぞ')).toBe('ザジズゼゾ');
        expect(toKatakana('だぢづでど')).toBe('ダヂヅデド');
        expect(toKatakana('ばびぶべぼ')).toBe('バビブベボ');
        expect(toKatakana('ぱぴぷぺぽ')).toBe('パピプペポ');
      });

      it('小文字を変換する', () => {
        expect(toKatakana('ぁぃぅぇぉ')).toBe('ァィゥェォ');
        expect(toKatakana('っゃゅょ')).toBe('ッャュョ');
      });
    });

    describe('変換不要のケース', () => {
      it('カタカナはそのまま返す', () => {
        expect(toKatakana('ヤマダタロウ')).toBe('ヤマダタロウ');
      });

      it('漢字はそのまま返す', () => {
        expect(toKatakana('山田太郎')).toBe('山田太郎');
      });

      it('英数字はそのまま返す', () => {
        expect(toKatakana('abc123')).toBe('abc123');
      });

      it('記号はそのまま返す', () => {
        expect(toKatakana('!@#$%')).toBe('!@#$%');
      });
    });

    describe('混合文字列', () => {
      it('ひらがなと漢字の混合を処理する', () => {
        expect(toKatakana('やまだ太郎')).toBe('ヤマダ太郎');
      });

      it('ひらがなとカタカナの混合を処理する', () => {
        expect(toKatakana('やまだタロウ')).toBe('ヤマダタロウ');
      });

      it('ひらがなと英数字の混合を処理する', () => {
        expect(toKatakana('test123やまだ')).toBe('test123ヤマダ');
      });
    });

    describe('エッジケース', () => {
      it('空文字列を処理する', () => {
        expect(toKatakana('')).toBe('');
      });

      it('1文字のひらがなを処理する', () => {
        expect(toKatakana('あ')).toBe('ア');
      });

      it('長い文字列を処理する', () => {
        const longHiragana = 'あいうえお'.repeat(100);
        const longKatakana = 'アイウエオ'.repeat(100);
        expect(toKatakana(longHiragana)).toBe(longKatakana);
      });
    });
  });

  describe('toHiragana', () => {
    describe('基本変換', () => {
      it('カタカナをひらがなに変換する', () => {
        expect(toHiragana('ヤマダタロウ')).toBe('やまだたろう');
      });

      it('すべてのカタカナ文字を変換する', () => {
        expect(toHiragana('アイウエオ')).toBe('あいうえお');
        expect(toHiragana('カキクケコ')).toBe('かきくけこ');
        expect(toHiragana('サシスセソ')).toBe('さしすせそ');
        expect(toHiragana('タチツテト')).toBe('たちつてと');
        expect(toHiragana('ナニヌネノ')).toBe('なにぬねの');
        expect(toHiragana('ハヒフヘホ')).toBe('はひふへほ');
        expect(toHiragana('マミムメモ')).toBe('まみむめも');
        expect(toHiragana('ヤユヨ')).toBe('やゆよ');
        expect(toHiragana('ラリルレロ')).toBe('らりるれろ');
        expect(toHiragana('ワヲン')).toBe('わをん');
      });

      it('濁音・半濁音を変換する', () => {
        expect(toHiragana('ガギグゲゴ')).toBe('がぎぐげご');
        expect(toHiragana('ザジズゼゾ')).toBe('ざじずぜぞ');
        expect(toHiragana('ダヂヅデド')).toBe('だぢづでど');
        expect(toHiragana('バビブベボ')).toBe('ばびぶべぼ');
        expect(toHiragana('パピプペポ')).toBe('ぱぴぷぺぽ');
      });

      it('小文字を変換する', () => {
        expect(toHiragana('ァィゥェォ')).toBe('ぁぃぅぇぉ');
        expect(toHiragana('ッャュョ')).toBe('っゃゅょ');
      });
    });

    describe('変換不要のケース', () => {
      it('ひらがなはそのまま返す', () => {
        expect(toHiragana('やまだたろう')).toBe('やまだたろう');
      });

      it('漢字はそのまま返す', () => {
        expect(toHiragana('山田太郎')).toBe('山田太郎');
      });

      it('英数字はそのまま返す', () => {
        expect(toHiragana('abc123')).toBe('abc123');
      });

      it('記号はそのまま返す', () => {
        expect(toHiragana('!@#$%')).toBe('!@#$%');
      });
    });

    describe('混合文字列', () => {
      it('カタカナと漢字の混合を処理する', () => {
        expect(toHiragana('ヤマダ太郎')).toBe('やまだ太郎');
      });

      it('カタカナとひらがなの混合を処理する', () => {
        expect(toHiragana('ヤマダたろう')).toBe('やまだたろう');
      });

      it('カタカナと英数字の混合を処理する', () => {
        expect(toHiragana('test123ヤマダ')).toBe('test123やまだ');
      });
    });

    describe('エッジケース', () => {
      it('空文字列を処理する', () => {
        expect(toHiragana('')).toBe('');
      });

      it('1文字のカタカナを処理する', () => {
        expect(toHiragana('ア')).toBe('あ');
      });

      it('長い文字列を処理する', () => {
        const longKatakana = 'アイウエオ'.repeat(100);
        const longHiragana = 'あいうえお'.repeat(100);
        expect(toHiragana(longKatakana)).toBe(longHiragana);
      });
    });
  });

  describe('containsHiragana', () => {
    it('ひらがなを含む文字列でtrueを返す', () => {
      expect(containsHiragana('あいうえお')).toBe(true);
    });

    it('ひらがなと漢字の混合でtrueを返す', () => {
      expect(containsHiragana('山田たろう')).toBe(true);
    });

    it('カタカナのみの文字列でfalseを返す', () => {
      expect(containsHiragana('ヤマダタロウ')).toBe(false);
    });

    it('漢字のみの文字列でfalseを返す', () => {
      expect(containsHiragana('山田太郎')).toBe(false);
    });

    it('英数字のみの文字列でfalseを返す', () => {
      expect(containsHiragana('abc123')).toBe(false);
    });

    it('空文字列でfalseを返す', () => {
      expect(containsHiragana('')).toBe(false);
    });
  });

  describe('containsKatakana', () => {
    it('カタカナを含む文字列でtrueを返す', () => {
      expect(containsKatakana('アイウエオ')).toBe(true);
    });

    it('カタカナと漢字の混合でtrueを返す', () => {
      expect(containsKatakana('山田タロウ')).toBe(true);
    });

    it('ひらがなのみの文字列でfalseを返す', () => {
      expect(containsKatakana('やまだたろう')).toBe(false);
    });

    it('漢字のみの文字列でfalseを返す', () => {
      expect(containsKatakana('山田太郎')).toBe(false);
    });

    it('英数字のみの文字列でfalseを返す', () => {
      expect(containsKatakana('abc123')).toBe(false);
    });

    it('空文字列でfalseを返す', () => {
      expect(containsKatakana('')).toBe(false);
    });
  });

  describe('toKatakana + toHiragana 相互変換', () => {
    it('ひらがな→カタカナ→ひらがなで元に戻る', () => {
      const original = 'やまだたろう';
      const converted = toHiragana(toKatakana(original));
      expect(converted).toBe(original);
    });

    it('カタカナ→ひらがな→カタカナで元に戻る', () => {
      const original = 'ヤマダタロウ';
      const converted = toKatakana(toHiragana(original));
      expect(converted).toBe(original);
    });
  });
});
