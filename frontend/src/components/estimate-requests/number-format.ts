/**
 * @fileoverview 受領見積書 - 数値表示形式と丸め規則ユーティリティ
 *
 * Task 42.1: 数値フォーマットユーティリティ関数の実装
 *
 * Requirements:
 * - 18.1, 18.2: 数量を小数2桁常時表示
 * - 18.3, 18.4: 単価を整数表示（小数第1位で四捨五入）
 * - 18.5, 18.6: 金額を整数表示（数量x単価の結果を小数第1位で四捨五入）
 * - 18.9: 金額自動計算の丸め規則
 * - 18.12: 合計金額の整数表示
 *
 * Design:
 * - Math.round()使用（Decimal.js不要）
 * - 数量: toFixed(2)
 * - 単価: Math.round()
 * - 金額: Math.round(quantity * unitPrice)
 */

/**
 * 数量を小数2桁固定でフォーマットする（18.1, 18.2, 18.7）
 *
 * フォーカスアウト時に適用する。
 * 無効な入力値（空文字、非数値）の場合は元の値をそのまま返す。
 *
 * @param value - 入力文字列
 * @returns フォーマットされた文字列
 *
 * @example
 * formatQuantity('1')     // '1.00'
 * formatQuantity('2.5')   // '2.50'
 * formatQuantity('10.25') // '10.25'
 * formatQuantity('')      // ''
 * formatQuantity('abc')   // 'abc'
 */
export function formatQuantity(value: string): string {
  if (value === '') return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toFixed(2);
}

/**
 * 単価を小数第1位で四捨五入して整数にフォーマットする（18.3, 18.4, 18.8）
 *
 * フォーカスアウト時に適用する。
 * 無効な入力値（空文字、非数値）の場合は元の値をそのまま返す。
 *
 * @param value - 入力文字列
 * @returns フォーマットされた文字列
 *
 * @example
 * formatUnitPrice('1234.6') // '1235'
 * formatUnitPrice('999.4')  // '999'
 * formatUnitPrice('')       // ''
 * formatUnitPrice('abc')    // 'abc'
 */
export function formatUnitPrice(value: string): string {
  if (value === '') return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return String(Math.round(num));
}

/**
 * 金額を計算する（18.5, 18.6, 18.9）
 *
 * 数量（小数2桁精度）x 単価（整数）の計算結果を
 * 小数第1位で四捨五入して整数で保持する。
 *
 * @param quantity - 数量（文字列）
 * @param unitPrice - 単価（文字列）
 * @returns 金額（整数）またはnull
 *
 * @example
 * calculateFormattedAmount('2.50', '333') // 833
 * calculateFormattedAmount('10', '1000')  // 10000
 * calculateFormattedAmount('', '1000')    // null
 */
export function calculateFormattedAmount(quantity: string, unitPrice: string): number | null {
  if (quantity === '' || unitPrice === '') return null;
  const q = parseFloat(quantity);
  const p = parseFloat(unitPrice);
  if (isNaN(q) || isNaN(p)) return null;
  return Math.round(q * p);
}

/**
 * 合計金額を計算する（18.12: 整数表示）
 *
 * 各行の金額（整数）の合計を算出する。
 * nullの行はスキップする。
 *
 * @param amounts - 金額の配列（nullを含む可能性あり）
 * @returns 合計金額（整数）
 */
export function calculateFormattedTotalAmount(amounts: (number | null)[]): number {
  return amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}
