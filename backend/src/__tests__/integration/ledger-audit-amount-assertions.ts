/**
 * @fileoverview 単価台帳の統合試験で、監査ログの中身に金額が入っていないことを確かめる補助
 *
 * 監査ログを JSON 文字列にして金額の部分文字列を探すと、ランダムな UUID（例：`63ba3456-…`）や
 * 実行ごとの接頭辞（`Date.now().toString(36)` など）に同じ数字の並びが偶然現れ、試験が不定に落ちる。
 * ここでは監査ログの値を再帰的にたどり、次のどちらかに当たる値を金額の出現とみなす。
 *
 * - 数値（number・bigint）がいずれかの金額に等しい
 * - 文字列の中の「数字だけでできた語」（3 桁区切りのカンマ・小数点を含む）がいずれかの金額に等しい。
 *   語は英数字・カンマ・小数点の連なりで区切るため、`金額98765円` や `98,765`、`"98765.00"` は
 *   金額の出現になり、UUID と英数字の混ざった接頭辞の中の数字の並びは金額の出現にならない
 *
 * 部分文字列の検索より狭めないよう、文字列で入った金額（Decimal の文字列表現など）も捕まえる。
 */

import { expect } from 'vitest';

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const WORD_SEPARATOR = /[^0-9A-Za-z.,]+/;
const NUMERIC_WORD = /^\d+(?:,\d{3})*(?:\.\d+)?$/;

type AmountHit = { path: string; value: unknown };

const numericWordsOf = (text: string): number[] =>
  text
    .replace(UUID_PATTERN, ' ')
    .split(WORD_SEPARATOR)
    .map((word) => word.replace(/^[.,]+|[.,]+$/g, ''))
    .filter((word) => NUMERIC_WORD.test(word))
    .map((word) => Number(word.replace(/,/g, '')));

const collectAmountHits = (
  value: unknown,
  amounts: ReadonlySet<number>,
  path: string,
  hits: AmountHit[]
): void => {
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (amounts.has(Number(value))) hits.push({ path, value });
    return;
  }
  if (typeof value === 'string') {
    if (numericWordsOf(value).some((n) => amounts.has(n))) hits.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAmountHits(item, amounts, `${path}[${index}]`, hits));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      // 鍵の名前に金額が入ることも出現とみなす
      if (numericWordsOf(key).some((n) => amounts.has(n)))
        hits.push({ path: `${path}.${key}`, value: key });
      collectAmountHits(child, amounts, `${path}.${key}`, hits);
    }
  }
};

/**
 * 監査ログの値（before・after・metadata など）のどこにも、指定した金額が現れないことを確かめる。
 * 現れたときは、その場所と値を失敗の内容に出す。
 */
export const expectNoAmountsInAuditValues = (
  values: Record<string, unknown>,
  amounts: readonly number[]
): void => {
  const amountSet = new Set(amounts);
  const hits: AmountHit[] = [];
  for (const [name, value] of Object.entries(values)) {
    collectAmountHits(value, amountSet, name, hits);
  }
  expect(hits).toEqual([]);
};
