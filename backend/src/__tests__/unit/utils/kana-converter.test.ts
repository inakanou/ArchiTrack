import { describe, it, expect } from 'vitest';
import {
  toKatakana,
  toHiragana,
  containsHiragana,
  containsKatakana,
} from '../../../utils/kana-converter.js';

describe('kana-converter utils', () => {
  describe('toKatakana', () => {
    it('ひらがなをカタカナに変換すること', () => {
      expect(toKatakana('やまだたろう')).toBe('ヤマダタロウ');
    });

    it('小文字ひらがなを小文字カタカナに変換すること', () => {
      expect(toKatakana('ぁぃぅぇぉ')).toBe('ァィゥェォ');
      expect(toKatakana('ゃゅょ')).toBe('ャュョ');
      expect(toKatakana('っ')).toBe('ッ');
    });

    it('カタカナはそのまま返却すること', () => {
      expect(toKatakana('ヤマダタロウ')).toBe('ヤマダタロウ');
    });

    it('混合文字列（漢字+ひらがな）の変換で、ひらがな部分のみカタカナに変換すること', () => {
      expect(toKatakana('山田たろう')).toBe('山田タロウ');
    });

    it('漢字はそのまま返却すること', () => {
      expect(toKatakana('山田太郎')).toBe('山田太郎');
    });

    it('数字はそのまま返却すること', () => {
      expect(toKatakana('あいう123')).toBe('アイウ123');
    });

    it('英字はそのまま返却すること', () => {
      expect(toKatakana('あいうABC')).toBe('アイウABC');
    });

    it('記号はそのまま返却すること', () => {
      expect(toKatakana('あいう！？')).toBe('アイウ！？');
    });

    it('空文字列を処理すること', () => {
      expect(toKatakana('')).toBe('');
    });

    it('ひらがな「を」を変換すること', () => {
      expect(toKatakana('を')).toBe('ヲ');
    });

    it('ひらがな「ん」を変換すること', () => {
      expect(toKatakana('ん')).toBe('ン');
    });

    it('濁音・半濁音を変換すること', () => {
      expect(toKatakana('がぎぐげご')).toBe('ガギグゲゴ');
      expect(toKatakana('ぱぴぷぺぽ')).toBe('パピプペポ');
    });

    it('ひらがな「ゔ」を変換すること', () => {
      expect(toKatakana('ゔ')).toBe('ヴ');
    });
  });

  describe('toHiragana', () => {
    it('カタカナをひらがなに変換すること', () => {
      expect(toHiragana('ヤマダタロウ')).toBe('やまだたろう');
    });

    it('小文字カタカナを小文字ひらがなに変換すること', () => {
      expect(toHiragana('ァィゥェォ')).toBe('ぁぃぅぇぉ');
      expect(toHiragana('ャュョ')).toBe('ゃゅょ');
      expect(toHiragana('ッ')).toBe('っ');
    });

    it('ひらがなはそのまま返却すること', () => {
      expect(toHiragana('やまだたろう')).toBe('やまだたろう');
    });

    it('混合文字列（漢字+カタカナ）の変換で、カタカナ部分のみひらがなに変換すること', () => {
      expect(toHiragana('山田タロウ')).toBe('山田たろう');
    });

    it('漢字はそのまま返却すること', () => {
      expect(toHiragana('山田太郎')).toBe('山田太郎');
    });

    it('空文字列を処理すること', () => {
      expect(toHiragana('')).toBe('');
    });

    it('カタカナ「ヲ」を変換すること', () => {
      expect(toHiragana('ヲ')).toBe('を');
    });

    it('カタカナ「ン」を変換すること', () => {
      expect(toHiragana('ン')).toBe('ん');
    });

    it('濁音・半濁音を変換すること', () => {
      expect(toHiragana('ガギグゲゴ')).toBe('がぎぐげご');
      expect(toHiragana('パピプペポ')).toBe('ぱぴぷぺぽ');
    });

    it('カタカナ「ヴ」を変換すること', () => {
      expect(toHiragana('ヴ')).toBe('ゔ');
    });
  });

  describe('containsHiragana', () => {
    it('ひらがなを含む文字列でtrueを返すこと', () => {
      expect(containsHiragana('あいう')).toBe(true);
      expect(containsHiragana('山田たろう')).toBe(true);
      expect(containsHiragana('ABCあXYZ')).toBe(true);
    });

    it('ひらがなを含まない文字列でfalseを返すこと', () => {
      expect(containsHiragana('ヤマダタロウ')).toBe(false);
      expect(containsHiragana('山田太郎')).toBe(false);
      expect(containsHiragana('ABCXYZ')).toBe(false);
      expect(containsHiragana('12345')).toBe(false);
    });

    it('空文字列でfalseを返すこと', () => {
      expect(containsHiragana('')).toBe(false);
    });

    it('小文字ひらがなを検出すること', () => {
      expect(containsHiragana('ぁぃぅぇぉ')).toBe(true);
    });
  });

  describe('containsKatakana', () => {
    it('カタカナを含む文字列でtrueを返すこと', () => {
      expect(containsKatakana('アイウ')).toBe(true);
      expect(containsKatakana('山田タロウ')).toBe(true);
      expect(containsKatakana('ABCアXYZ')).toBe(true);
    });

    it('カタカナを含まない文字列でfalseを返すこと', () => {
      expect(containsKatakana('やまだたろう')).toBe(false);
      expect(containsKatakana('山田太郎')).toBe(false);
      expect(containsKatakana('ABCXYZ')).toBe(false);
      expect(containsKatakana('12345')).toBe(false);
    });

    it('空文字列でfalseを返すこと', () => {
      expect(containsKatakana('')).toBe(false);
    });

    it('小文字カタカナを検出すること', () => {
      expect(containsKatakana('ァィゥェォ')).toBe(true);
    });
  });

  describe('Unicode境界テスト', () => {
    it('ひらがな範囲の最初の文字（ぁ U+3041）を正しく変換すること', () => {
      expect(toKatakana('\u3041')).toBe('\u30A1'); // ぁ → ァ
    });

    it('ひらがな範囲の最後の文字（ゖ U+3096）を正しく変換すること', () => {
      expect(toKatakana('\u3096')).toBe('\u30F6'); // ゖ → ヶ
    });

    it('カタカナ範囲の最初の文字（ァ U+30A1）を正しく変換すること', () => {
      expect(toHiragana('\u30A1')).toBe('\u3041'); // ァ → ぁ
    });

    it('カタカナ範囲の最後の文字（ヶ U+30F6）を正しく変換すること', () => {
      expect(toHiragana('\u30F6')).toBe('\u3096'); // ヶ → ゖ
    });
  });

  describe('実用的な検索シナリオ', () => {
    it('フリガナ検索: ひらがな入力をカタカナに正規化して検索に使用できること', () => {
      const userInput = 'やまだ';
      const normalizedQuery = toKatakana(userInput);
      const dbFurigana = 'ヤマダタロウ';

      expect(dbFurigana.includes(normalizedQuery)).toBe(true);
    });

    it('フリガナ検索: カタカナ入力はそのまま検索に使用できること', () => {
      const userInput = 'ヤマダ';
      const normalizedQuery = toKatakana(userInput);
      const dbFurigana = 'ヤマダタロウ';

      expect(dbFurigana.includes(normalizedQuery)).toBe(true);
    });

    it('フリガナ検索: 漢字入力は変換されないがエラーにならないこと', () => {
      const userInput = '山田';
      const normalizedQuery = toKatakana(userInput);

      expect(normalizedQuery).toBe('山田');
    });
  });
});
