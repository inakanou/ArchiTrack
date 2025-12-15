/**
 * かな変換ユーティリティ
 *
 * ひらがな⇔カタカナの相互変換を提供し、フリガナ検索でひらがな・カタカナ両方の入力を許容する。
 * バックエンドの同等機能（backend/src/utils/kana-converter.ts）と同一ロジック。
 *
 * @module kana-converter
 * @requirement 16.3 フリガナ検索でひらがな・カタカナ両対応
 */

/**
 * Unicode code point constants
 *
 * ひらがな範囲: U+3041 (ぁ) - U+3096 (ゖ)
 * カタカナ範囲: U+30A1 (ァ) - U+30F6 (ヶ)
 */
export const HIRAGANA_START = 0x3041;
export const HIRAGANA_END = 0x3096;
export const KATAKANA_START = 0x30a1;
export const KATAKANA_END = 0x30f6;

/**
 * 変換差分: カタカナ - ひらがな = 0x60 (96)
 */
export const KANA_OFFSET = 0x60;

/**
 * ひらがなをカタカナに変換する
 *
 * @param str 入力文字列
 * @returns カタカナに変換された文字列
 *
 * @example
 * toKatakana('やまだたろう') // 'ヤマダタロウ'
 * toKatakana('ヤマダタロウ') // 'ヤマダタロウ'（変換不要）
 * toKatakana('山田太郎') // '山田太郎'（変換対象外）
 */
export function toKatakana(str: string): string {
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);

    // ひらがな範囲内の場合、カタカナに変換
    if (codePoint >= HIRAGANA_START && codePoint <= HIRAGANA_END) {
      result += String.fromCharCode(codePoint + KANA_OFFSET);
    } else {
      result += str[i];
    }
  }

  return result;
}

/**
 * カタカナをひらがなに変換する
 *
 * @param str 入力文字列
 * @returns ひらがなに変換された文字列
 *
 * @example
 * toHiragana('ヤマダタロウ') // 'やまだたろう'
 * toHiragana('やまだたろう') // 'やまだたろう'（変換不要）
 */
export function toHiragana(str: string): string {
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);

    // カタカナ範囲内の場合、ひらがなに変換
    if (codePoint >= KATAKANA_START && codePoint <= KATAKANA_END) {
      result += String.fromCharCode(codePoint - KANA_OFFSET);
    } else {
      result += str[i];
    }
  }

  return result;
}

/**
 * 文字列がひらがなを含むかどうかを判定する
 *
 * @param str 入力文字列
 * @returns ひらがなを含む場合はtrue
 */
export function containsHiragana(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint >= HIRAGANA_START && codePoint <= HIRAGANA_END) {
      return true;
    }
  }
  return false;
}

/**
 * 文字列がカタカナを含むかどうかを判定する
 *
 * @param str 入力文字列
 * @returns カタカナを含む場合はtrue
 */
export function containsKatakana(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint >= KATAKANA_START && codePoint <= KATAKANA_END) {
      return true;
    }
  }
  return false;
}
