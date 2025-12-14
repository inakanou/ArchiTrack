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

  describe('三種混合文字列（漢字+ひらがな+カタカナ）のテスト', () => {
    describe('toKatakana - 三種混合', () => {
      it('漢字+ひらがな+カタカナの混合文字列で、ひらがな部分のみカタカナに変換すること', () => {
        expect(toKatakana('山田たろうタロウ')).toBe('山田タロウタロウ');
      });

      it('複雑な混合文字列を正しく変換すること', () => {
        expect(toKatakana('東京とうきょうトウキョウ')).toBe('東京トウキョウトウキョウ');
      });

      it('会社名のような混合パターンを正しく変換すること', () => {
        expect(toKatakana('株式会社やまだ工業ヤマダ')).toBe('株式会社ヤマダ工業ヤマダ');
      });
    });

    describe('toHiragana - 三種混合', () => {
      it('漢字+ひらがな+カタカナの混合文字列で、カタカナ部分のみひらがなに変換すること', () => {
        expect(toHiragana('山田たろうタロウ')).toBe('山田たろうたろう');
      });

      it('複雑な混合文字列を正しく変換すること', () => {
        expect(toHiragana('東京とうきょうトウキョウ')).toBe('東京とうきょうとうきょう');
      });

      it('会社名のような混合パターンを正しく変換すること', () => {
        expect(toHiragana('株式会社やまだ工業ヤマダ')).toBe('株式会社やまだ工業やまだ');
      });
    });

    describe('containsHiragana - 三種混合', () => {
      it('漢字+ひらがな+カタカナの混合文字列でtrueを返すこと', () => {
        expect(containsHiragana('山田たろうタロウ')).toBe(true);
      });
    });

    describe('containsKatakana - 三種混合', () => {
      it('漢字+ひらがな+カタカナの混合文字列でtrueを返すこと', () => {
        expect(containsKatakana('山田たろうタロウ')).toBe(true);
      });
    });
  });

  describe('null/undefined境界値テスト（ランタイム安全性確認）', () => {
    // TypeScriptの型システムではnull/undefinedは許可されないが、
    // JavaScriptランタイムでの呼び出しを想定したテスト
    describe('toKatakana - null/undefined', () => {
      it('空文字列を空文字列として返すこと（再確認）', () => {
        expect(toKatakana('')).toBe('');
      });

      it('ランタイムでnullが渡された場合、エラーが発生すること', () => {
        // TypeScript型チェックを回避してnullをテスト
        expect(() => toKatakana(null as unknown as string)).toThrow();
      });

      it('ランタイムでundefinedが渡された場合、エラーが発生すること', () => {
        // TypeScript型チェックを回避してundefinedをテスト
        expect(() => toKatakana(undefined as unknown as string)).toThrow();
      });
    });

    describe('toHiragana - null/undefined', () => {
      it('空文字列を空文字列として返すこと（再確認）', () => {
        expect(toHiragana('')).toBe('');
      });

      it('ランタイムでnullが渡された場合、エラーが発生すること', () => {
        expect(() => toHiragana(null as unknown as string)).toThrow();
      });

      it('ランタイムでundefinedが渡された場合、エラーが発生すること', () => {
        expect(() => toHiragana(undefined as unknown as string)).toThrow();
      });
    });

    describe('containsHiragana - null/undefined', () => {
      it('空文字列でfalseを返すこと（再確認）', () => {
        expect(containsHiragana('')).toBe(false);
      });

      it('ランタイムでnullが渡された場合、エラーが発生すること', () => {
        expect(() => containsHiragana(null as unknown as string)).toThrow();
      });

      it('ランタイムでundefinedが渡された場合、エラーが発生すること', () => {
        expect(() => containsHiragana(undefined as unknown as string)).toThrow();
      });
    });

    describe('containsKatakana - null/undefined', () => {
      it('空文字列でfalseを返すこと（再確認）', () => {
        expect(containsKatakana('')).toBe(false);
      });

      it('ランタイムでnullが渡された場合、エラーが発生すること', () => {
        expect(() => containsKatakana(null as unknown as string)).toThrow();
      });

      it('ランタイムでundefinedが渡された場合、エラーが発生すること', () => {
        expect(() => containsKatakana(undefined as unknown as string)).toThrow();
      });
    });
  });

  describe('エッジケーステスト', () => {
    describe('特殊文字・空白', () => {
      it('空白文字のみの文字列をそのまま返すこと', () => {
        expect(toKatakana('   ')).toBe('   ');
        expect(toHiragana('   ')).toBe('   ');
      });

      it('タブ文字を含む文字列を正しく処理すること', () => {
        expect(toKatakana('あ\tい')).toBe('ア\tイ');
        expect(toHiragana('ア\tイ')).toBe('あ\tい');
      });

      it('改行文字を含む文字列を正しく処理すること', () => {
        expect(toKatakana('あ\nい')).toBe('ア\nイ');
        expect(toHiragana('ア\nイ')).toBe('あ\nい');
      });

      it('全角スペースを含む文字列を正しく処理すること', () => {
        expect(toKatakana('あ　い')).toBe('ア　イ');
        expect(toHiragana('ア　イ')).toBe('あ　い');
      });
    });

    describe('長い文字列', () => {
      it('非常に長いひらがな文字列を正しく変換すること', () => {
        const longHiragana = 'あいうえお'.repeat(100);
        const expectedKatakana = 'アイウエオ'.repeat(100);
        expect(toKatakana(longHiragana)).toBe(expectedKatakana);
      });

      it('非常に長いカタカナ文字列を正しく変換すること', () => {
        const longKatakana = 'アイウエオ'.repeat(100);
        const expectedHiragana = 'あいうえお'.repeat(100);
        expect(toHiragana(longKatakana)).toBe(expectedHiragana);
      });
    });

    describe('containsHiragana/containsKatakana - 特殊文字', () => {
      it('空白文字のみでfalseを返すこと', () => {
        expect(containsHiragana('   ')).toBe(false);
        expect(containsKatakana('   ')).toBe(false);
      });

      it('改行のみでfalseを返すこと', () => {
        expect(containsHiragana('\n')).toBe(false);
        expect(containsKatakana('\n')).toBe(false);
      });
    });

    describe('絵文字・サロゲートペア', () => {
      it('絵文字を含む文字列で、絵文字はそのまま保持すること', () => {
        // 絵文字はBMP外の文字だがtoKatakanaはBMP内のかな文字のみ変換
        expect(toKatakana('あいう😀')).toBe('アイウ😀');
        expect(toHiragana('アイウ😀')).toBe('あいう😀');
      });

      it('絵文字のみの文字列をそのまま返すこと', () => {
        expect(toKatakana('😀😁😂')).toBe('😀😁😂');
        expect(toHiragana('😀😁😂')).toBe('😀😁😂');
      });

      it('絵文字を含む文字列でcontainsHiragana/containsKatakanaが正しく判定すること', () => {
        expect(containsHiragana('あ😀')).toBe(true);
        expect(containsHiragana('😀')).toBe(false);
        expect(containsKatakana('ア😀')).toBe(true);
        expect(containsKatakana('😀')).toBe(false);
      });
    });
  });
});
