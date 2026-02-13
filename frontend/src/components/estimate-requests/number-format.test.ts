/**
 * @fileoverview 数値フォーマットユーティリティ関数のユニットテスト
 *
 * Task 43.1: 数値フォーマットユーティリティ関数のユニットテスト
 *
 * Requirements:
 * - 18.1: 数量を小数2桁常時表示
 * - 18.3: 単価を整数表示（小数第1位で四捨五入）
 * - 18.5: 金額を整数表示
 * - 18.9: 金額自動計算の丸め規則
 * - 18.12: 合計金額の整数表示
 */

import { describe, it, expect } from 'vitest';
import {
  formatQuantity,
  formatUnitPrice,
  calculateFormattedAmount,
  calculateFormattedTotalAmount,
} from './number-format';

// ============================================================================
// formatQuantity のテスト
// ============================================================================

describe('formatQuantity', () => {
  it('整数入力を小数2桁固定にフォーマットする', () => {
    expect(formatQuantity('1')).toBe('1.00');
    expect(formatQuantity('10')).toBe('10.00');
    expect(formatQuantity('0')).toBe('0.00');
    expect(formatQuantity('100')).toBe('100.00');
  });

  it('小数1桁入力を小数2桁固定にフォーマットする', () => {
    expect(formatQuantity('2.5')).toBe('2.50');
    expect(formatQuantity('0.1')).toBe('0.10');
  });

  it('小数2桁入力はそのまま返す', () => {
    expect(formatQuantity('10.25')).toBe('10.25');
    expect(formatQuantity('3.14')).toBe('3.14');
  });

  it('小数3桁以上入力は小数2桁に丸める', () => {
    expect(formatQuantity('1.234')).toBe('1.23');
    expect(formatQuantity('1.235')).toBe('1.24'); // 四捨五入
    expect(formatQuantity('1.999')).toBe('2.00');
  });

  it('空文字の場合は元の値をそのまま返す', () => {
    expect(formatQuantity('')).toBe('');
  });

  it('非数値の場合は元の値をそのまま返す', () => {
    expect(formatQuantity('abc')).toBe('abc');
    expect(formatQuantity('--')).toBe('--');
  });

  it('parseFloatで部分的にパース可能な値は数値として処理される', () => {
    // parseFloat('1.2.3') は 1.2 を返すため、フォーマットされる
    expect(formatQuantity('1.2.3')).toBe('1.20');
  });

  it('負の数値もフォーマットする', () => {
    expect(formatQuantity('-1')).toBe('-1.00');
    expect(formatQuantity('-2.5')).toBe('-2.50');
  });
});

// ============================================================================
// formatUnitPrice のテスト
// ============================================================================

describe('formatUnitPrice', () => {
  it('整数入力はそのまま返す', () => {
    expect(formatUnitPrice('1000')).toBe('1000');
    expect(formatUnitPrice('0')).toBe('0');
    expect(formatUnitPrice('1234')).toBe('1234');
  });

  it('小数入力を四捨五入して整数にする', () => {
    expect(formatUnitPrice('1234.6')).toBe('1235');
    expect(formatUnitPrice('999.4')).toBe('999');
    expect(formatUnitPrice('999.5')).toBe('1000');
    expect(formatUnitPrice('0.5')).toBe('1');
    expect(formatUnitPrice('0.4')).toBe('0');
  });

  it('境界値: .5は切り上げ', () => {
    expect(formatUnitPrice('100.5')).toBe('101');
    expect(formatUnitPrice('200.5')).toBe('201');
  });

  it('空文字の場合は元の値をそのまま返す', () => {
    expect(formatUnitPrice('')).toBe('');
  });

  it('非数値の場合は元の値をそのまま返す', () => {
    expect(formatUnitPrice('abc')).toBe('abc');
    expect(formatUnitPrice('--')).toBe('--');
  });

  it('負の数値もフォーマットする', () => {
    expect(formatUnitPrice('-1234.6')).toBe('-1235');
    expect(formatUnitPrice('-999.4')).toBe('-999');
  });
});

// ============================================================================
// calculateFormattedAmount のテスト
// ============================================================================

describe('calculateFormattedAmount', () => {
  it('数量と単価から金額を計算し整数で返す', () => {
    expect(calculateFormattedAmount('10', '1000')).toBe(10000);
    expect(calculateFormattedAmount('5', '200')).toBe(1000);
    expect(calculateFormattedAmount('1', '1')).toBe(1);
  });

  it('小数を含む計算結果を四捨五入して整数で返す', () => {
    // 2.50 * 333 = 832.5 -> 833
    expect(calculateFormattedAmount('2.50', '333')).toBe(833);
    // 1.00 * 999 = 999 -> 999
    expect(calculateFormattedAmount('1.00', '999')).toBe(999);
    // 3.33 * 100 = 333 -> 333
    expect(calculateFormattedAmount('3.33', '100')).toBe(333);
  });

  it('片方がnull/空文字の場合はnullを返す', () => {
    expect(calculateFormattedAmount('', '1000')).toBeNull();
    expect(calculateFormattedAmount('10', '')).toBeNull();
    expect(calculateFormattedAmount('', '')).toBeNull();
  });

  it('非数値の場合はnullを返す', () => {
    expect(calculateFormattedAmount('abc', '1000')).toBeNull();
    expect(calculateFormattedAmount('10', 'xyz')).toBeNull();
  });

  it('ゼロを含む計算', () => {
    expect(calculateFormattedAmount('0', '1000')).toBe(0);
    expect(calculateFormattedAmount('10', '0')).toBe(0);
  });
});

// ============================================================================
// calculateFormattedTotalAmount のテスト
// ============================================================================

describe('calculateFormattedTotalAmount', () => {
  it('複数行の金額を合計する', () => {
    const items = [{ amount: 1000 }, { amount: 2000 }, { amount: 3000 }];
    expect(calculateFormattedTotalAmount(items.map((i) => i.amount))).toBe(6000);
  });

  it('nullを含む場合はnullをスキップして合計する', () => {
    const amounts = [1000, null, 3000];
    expect(calculateFormattedTotalAmount(amounts)).toBe(4000);
  });

  it('すべてnullの場合は0を返す', () => {
    expect(calculateFormattedTotalAmount([null, null, null])).toBe(0);
  });

  it('空配列の場合は0を返す', () => {
    expect(calculateFormattedTotalAmount([])).toBe(0);
  });

  it('1件のみの場合はその金額を返す', () => {
    expect(calculateFormattedTotalAmount([5000])).toBe(5000);
  });
});
