/**
 * @fileoverview estimateCalculations（案分・利益率・集計・丸め）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 5.4 / 5.5: NET金額を業者金額行の比率で案分し、案分後金額を実行金額行に設定する
 * - 5.8: 案分を編集中の値に基づいて行い、プレビューと反映結果を一致させる
 * - 6.1 / 6.8: 実行金額行の単価に利益率を適用し、プレビューと反映結果を一致させる
 * - 22.1〜22.6 / 22.9: 数量は小数2桁、単価・金額は小数第1位で四捨五入した整数
 * - 39.10: サマリー各項目を編集中の内容に基づいて算出する
 * - 41.8: 値引き行の金額（負数を含む）を集計に加算する
 * - 41.9: 値引き行をNET金額案分・利益率適用の対象外とする
 * - 49.6: 転記・計算の対象を編集中の明細の値とする
 * - 55.4: 注記行をNET金額案分・利益率適用の対象外とする
 *
 * 本テストは「現行のプレビュー実装（`utils/estimate-calculation` の `EstimateCalculator`
 * および NetAllocationDialog / ProfitRateDialog のインライン計算）」と
 * 「サーバー実装（backend `EstimateCalculationService` ＋ `estimates.routes.ts` の
 * `calculate-net` / `apply-profit-rate`）」の出力に一致することを固定値で確認する。
 * 固定値は backend の `EstimateCalculationService` を同一入力で実行して採取したもの。
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateCalculations`
 */

import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';

import { EstimateCalculator } from '../../utils/estimate-calculation';

import {
  estimateCalculations,
  allocateNet,
  applyProfitRate,
  summarize,
  roundMoney,
  roundQuantity,
} from './estimateCalculations';
import type { AllocationRow, AllocationResult, ProfitRateRow } from './estimateCalculations';
import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from './estimateEditReducer.types';

// ============================================================================
// テスト用ヘルパー
// ============================================================================

/** 要素が存在しない場合はテストを失敗させる（前提条件で検証を無効化しない） */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`index ${index} の要素が存在しない（要素数 ${list.length}）`);
  }
  return value;
}

/** キーで結果行を取得する（見つからない場合は失敗させる） */
function byKey<T extends { readonly key: string }>(list: readonly T[], key: string): T {
  const found = list.find((row) => row.key === key);
  if (found === undefined) {
    throw new Error(`key=${key} の結果行が存在しない`);
  }
  return found;
}

function line(lineType: EstimateLineType, amount: string | null): EditableLine {
  return {
    id: null,
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount,
    remarks: null,
    sourceVendorName: null,
  };
}

function item(
  id: string,
  itemType: EstimateEditItemType,
  lines: readonly EditableLine[],
  children: readonly EditableItem[] = []
): EditableItem {
  return { id, tempId: null, itemType, lines, children };
}

function dec(value: string | null): Decimal | null {
  return value === null ? null : new Decimal(value);
}

/** 案分の代表フィクスチャ（除外行・値引き行・注記行・数量未設定を含む） */
function allocationFixture(): AllocationRow[] {
  return [
    { key: 'item-1', itemType: 'STANDARD', amount: dec('1000'), quantity: dec('2') },
    { key: 'item-2', itemType: 'STANDARD', amount: dec('3000'), quantity: dec('3') },
    { key: 'item-3', itemType: 'STANDARD', amount: dec('500'), quantity: null },
    { key: 'item-4', itemType: 'STANDARD', amount: dec('2500'), quantity: dec('1') },
    { key: 'item-5', itemType: 'DISCOUNT', amount: dec('-1000'), quantity: dec('1') },
    { key: 'item-6', itemType: 'NOTE', amount: null, quantity: null },
  ];
}

// ============================================================================
// 丸め規則（22.2, 22.3, 22.9, 41.6, design.md:3504）
// ============================================================================

describe('roundMoney', () => {
  it('小数第1位を四捨五入して整数にする', () => {
    expect(roundMoney(new Decimal('1234.4')).toString()).toBe('1234');
    expect(roundMoney(new Decimal('1234.5')).toString()).toBe('1235');
    expect(roundMoney(new Decimal('566.5')).toString()).toBe('567');
  });

  it('負数は絶対値で四捨五入して符号を保持する（Math.round と異なる）', () => {
    expect(roundMoney(new Decimal('-566.5')).toString()).toBe('-567');
    expect(roundMoney(new Decimal('-0.5')).toString()).toBe('-1');
    expect(roundMoney(new Decimal('-2.5')).toString()).toBe('-3');
    expect(roundMoney(new Decimal('-2.4')).toString()).toBe('-2');

    // Math.round は -566.5 を -566（正の無限大方向）に丸めるため一致しない
    expect(Math.round(-566.5)).toBe(-566);
    expect(roundMoney(new Decimal('-566.5')).toNumber()).not.toBe(Math.round(-566.5));
  });
});

describe('roundQuantity', () => {
  // 検証はすべて丸めを行わないフォーマッタ（`toString` / `dp`）で行う。
  // `Decimal.prototype.toFixed(2)` は自身が既定 ROUND_HALF_UP で2桁に丸めるため、
  // `toFixed(2)` だけで比較すると `roundQuantity` が恒等関数でもテストが通ってしまう。
  it('数量は小数2桁で四捨五入する（22.1）', () => {
    expect(roundQuantity(new Decimal('1')).toString()).toBe('1');
    expect(roundQuantity(new Decimal('2.505')).toString()).toBe('2.51');
    expect(roundQuantity(new Decimal('10.254')).toString()).toBe('10.25');
  });

  it('丸め桁数は小数2桁である（3桁以上を残さない）', () => {
    // 2.5049 ではなく 2.5149 を用いる: 前者は2桁丸めの結果が 2.50 となり
    // decimal.js が末尾ゼロを保持しないため dp() が 1 になり、桁数の固定にならない。
    expect(roundQuantity(new Decimal('2.5149')).dp()).toBe(2);
    expect(roundQuantity(new Decimal('2.5149')).toString()).toBe('2.51');
  });

  it('負数は絶対値で四捨五入して符号を保持する', () => {
    expect(roundQuantity(new Decimal('-2.505')).toString()).toBe('-2.51');
  });

  it('小数2桁常時表示の形式に適合する（22.1 の表示形式）', () => {
    // 表示形式の確認であり、丸めの根拠は上の toString / dp のケースが担う
    expect(roundQuantity(new Decimal('1')).toFixed(2)).toBe('1.00');
    expect(roundQuantity(new Decimal('2.505')).toFixed(2)).toBe('2.51');
  });
});

// ============================================================================
// 案分（5.4, 5.5, 22.4, 22.5, 41.9, 55.4）
// ============================================================================

describe('allocateNet', () => {
  it('固定値で案分金額・比率・単価を算出する（サーバー実装と同一の値）', () => {
    const results = allocateNet(
      allocationFixture(),
      new Decimal('4000'),
      new Set<string>(['item-4'])
    );

    expect(results.map((r) => r.key)).toEqual(['item-1', 'item-2', 'item-3']);

    // 対象合計 = 1000 + 3000 + 500 = 4500
    expect(at(results, 0).allocatedAmount.toString()).toBe('889'); // 4000 * 1000/4500 = 888.888…
    expect(at(results, 1).allocatedAmount.toString()).toBe('2667'); // 4000 * 3000/4500 = 2666.666…
    expect(at(results, 2).allocatedAmount.toString()).toBe('444'); // 4000 *  500/4500 = 444.444…

    // 単価 = 案分金額 ÷ 数量（数量が未設定またはゼロの場合は案分金額そのもの）
    expect(at(results, 0).unitPrice.toString()).toBe('445'); // 889 / 2 = 444.5 → 445
    expect(at(results, 1).unitPrice.toString()).toBe('889'); // 2667 / 3 = 889
    expect(at(results, 2).unitPrice.toString()).toBe('444'); // 数量未設定

    // 比率は丸めない生の値（サーバー実装の応答と同一）
    expect(at(results, 0).ratio.toString()).toBe('0.22222222222222222222');
    expect(at(results, 1).ratio.mul(100).toDecimalPlaces(2).toString()).toBe('66.67');
  });

  it('除外指定・値引き行・注記行を対象から外し、合計にも算入しない（41.9, 55.4）', () => {
    const results = allocateNet(
      allocationFixture(),
      new Decimal('4000'),
      new Set<string>(['item-4'])
    );

    expect(results.some((r) => r.key === 'item-4')).toBe(false);
    expect(results.some((r) => r.key === 'item-5')).toBe(false);
    expect(results.some((r) => r.key === 'item-6')).toBe(false);

    // 値引き行(-1000)が合計に算入されていれば案分金額の総和は 4000 にならない
    const totalOfResults = results.reduce(
      (sum: Decimal, r: AllocationResult) => sum.add(r.allocatedAmount),
      new Decimal(0)
    );
    expect(totalOfResults.toString()).toBe('4000');
  });

  it('対象合計がゼロの場合は比率・案分金額・単価をゼロとする', () => {
    const rows: AllocationRow[] = [
      { key: 'a', itemType: 'STANDARD', amount: dec('0'), quantity: dec('2') },
      { key: 'b', itemType: 'STANDARD', amount: null, quantity: null },
    ];

    const results = allocateNet(rows, new Decimal('1000'), new Set<string>());

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ratio.toString()).toBe('0');
      expect(r.allocatedAmount.toString()).toBe('0');
      expect(r.unitPrice.toString()).toBe('0');
    }
  });

  it('数量がゼロの場合は案分金額をそのまま単価とする', () => {
    const rows: AllocationRow[] = [
      { key: 'a', itemType: 'STANDARD', amount: dec('1000'), quantity: dec('0') },
    ];

    const results = allocateNet(rows, new Decimal('777'), new Set<string>());

    expect(at(results, 0).allocatedAmount.toString()).toBe('777');
    expect(at(results, 0).unitPrice.toString()).toBe('777');
  });

  it('負のNET金額でも絶対値で四捨五入して符号を保持する', () => {
    const rows: AllocationRow[] = [
      { key: 'a', itemType: 'STANDARD', amount: dec('1'), quantity: dec('2') },
      { key: 'b', itemType: 'STANDARD', amount: dec('1'), quantity: dec('2') },
    ];

    const results = allocateNet(rows, new Decimal('-1001'), new Set<string>());

    expect(at(results, 0).allocatedAmount.toString()).toBe('-501'); // -500.5 → -501
    expect(at(results, 0).unitPrice.toString()).toBe('-251'); // -250.5 → -251
  });

  it('現行のプレビュー実装（EstimateCalculator.previewNetAllocation）と一致する', () => {
    const rows = allocationFixture().filter(
      (r) => r.itemType !== 'DISCOUNT' && r.itemType !== 'NOTE'
    );
    const excludeKeys = new Set<string>(['item-4']);

    const actual = allocateNet(rows, new Decimal('4000'), excludeKeys);
    const legacy = EstimateCalculator.previewNetAllocation(
      rows.map((r) => ({
        id: String(r.key),
        amount: r.amount === null ? null : r.amount.toString(),
      })),
      Array.from(excludeKeys),
      '4000'
    );

    expect(actual).toHaveLength(legacy.length);
    actual.forEach((r, i) => {
      const expected = at(legacy, i);
      expect(r.key).toBe(expected.lineId);
      expect(r.allocatedAmount.toString()).toBe(expected.allocatedAmount);
      // 現行プレビューは比率を百分率・小数2桁の文字列で保持する
      expect(`${r.ratio.mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()}%`).toBe(
        expected.ratio
      );
    });
  });

  it('現行のダイアログのインライン計算（NetAllocationDialog）と一致する', () => {
    // NetAllocationDialog.tsx のプレビュー計算をそのまま写した参照実装
    const reference = (
      rows: readonly AllocationRow[],
      netAmount: string,
      excludeIds: readonly string[]
    ): { lineId: string; ratio: string; allocatedAmount: string }[] => {
      const net = new Decimal(netAmount);
      const activeLines = rows.filter((l) => !excludeIds.includes(String(l.key)));
      const totalAmount = activeLines.reduce(
        (sum: Decimal, l) => sum.add(new Decimal(l.amount?.toString() || 0)),
        new Decimal(0)
      );
      return activeLines.map((l) => {
        const ratio = totalAmount.isZero()
          ? new Decimal(0)
          : new Decimal(l.amount?.toString() || 0).div(totalAmount);
        const allocated = net.mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        return {
          lineId: String(l.key),
          ratio: ratio.mul(100).toDecimalPlaces(2).toString(),
          allocatedAmount: allocated.toString(),
        };
      });
    };

    const rows = allocationFixture().filter(
      (r) => r.itemType !== 'DISCOUNT' && r.itemType !== 'NOTE'
    );
    const actual = allocateNet(rows, new Decimal('4000'), new Set<string>(['item-4']));
    const expected = reference(rows, '4000', ['item-4']);

    expect(actual).toHaveLength(expected.length);
    actual.forEach((r, i) => {
      const e = at(expected, i);
      expect(r.key).toBe(e.lineId);
      expect(r.allocatedAmount.toString()).toBe(e.allocatedAmount);
      expect(r.ratio.mul(100).toDecimalPlaces(2).toString()).toBe(e.ratio);
    });
  });
});

// ============================================================================
// 利益率適用（6.1〜6.4, 6.7, 22.6, 41.9, 55.4）
// ============================================================================

function profitFixture(): ProfitRateRow[] {
  return [
    {
      key: 'p1',
      itemType: 'STANDARD',
      executionUnitPrice: dec('1000'),
      executionQuantity: dec('2'),
      estimateUnitPrice: null,
      estimateQuantity: dec('5'),
    },
    {
      key: 'p2',
      itemType: 'STANDARD',
      executionUnitPrice: dec('1234.5'),
      executionQuantity: null,
      estimateUnitPrice: dec('800'),
      estimateQuantity: dec('3'),
    },
    {
      key: 'p3',
      itemType: 'STANDARD',
      executionUnitPrice: null,
      executionQuantity: dec('1'),
      estimateUnitPrice: null,
      estimateQuantity: dec('1'),
    },
    {
      key: 'p4',
      itemType: 'DISCOUNT',
      executionUnitPrice: dec('-1000'),
      executionQuantity: dec('1'),
      estimateUnitPrice: null,
      estimateQuantity: dec('1'),
    },
    {
      key: 'p5',
      itemType: 'NOTE',
      executionUnitPrice: null,
      executionQuantity: null,
      estimateUnitPrice: null,
      estimateQuantity: null,
    },
  ];
}

describe('applyProfitRate', () => {
  it('固定値で新しい単価と金額を算出する（すべて上書き）', () => {
    const results = applyProfitRate(profitFixture(), new Decimal('12.27'), 'all');

    expect(results.map((r) => r.key)).toEqual(['p1', 'p2', 'p3']);

    // 1000 * 1.1227 = 1122.7 → 1123
    const p1 = byKey(results, 'p1');
    expect(p1.newUnitPrice?.toString()).toBe('1123');
    expect(p1.applied).toBe(true);
    // 実行金額行の数量を引き継ぐため 2 * 1123 = 2246
    expect(p1.newAmount?.toString()).toBe('2246');
    expect(p1.copyLineFields).toBe(true);

    // 1234.5 * 1.1227 = 1385.97315 → 1386
    const p2 = byKey(results, 'p2');
    expect(p2.newUnitPrice?.toString()).toBe('1386');
    // 実行金額行の数量が未設定のため金額は null
    expect(p2.newAmount).toBeNull();

    // 実行金額行の単価が未設定の行は適用対象外
    const p3 = byKey(results, 'p3');
    expect(p3.newUnitPrice).toBeNull();
    expect(p3.applied).toBe(false);
  });

  it('値引き行と注記行を対象から除外する（41.9, 55.4）', () => {
    const results = applyProfitRate(profitFixture(), new Decimal('12.27'), 'all');

    expect(results.some((r) => r.key === 'p4')).toBe(false);
    expect(results.some((r) => r.key === 'p5')).toBe(false);
  });

  it('「空の場合のみ上書き」は編集中の見積金額行の単価で判定する（6.3, 6.7）', () => {
    const results = applyProfitRate(profitFixture(), new Decimal('12.27'), 'empty_only');

    const p1 = byKey(results, 'p1');
    const p2 = byKey(results, 'p2');

    expect(p1.applied).toBe(true);
    expect(p1.newUnitPrice?.toString()).toBe('1123');
    // 見積金額行の単価が入っているため上書きしない
    expect(p2.applied).toBe(false);
    expect(p2.newUnitPrice?.toString()).toBe('1386');
  });

  it('「単価のみ上書き」は見積金額行の数量で金額を再計算し他の欄を変えない（6.4）', () => {
    const results = applyProfitRate(profitFixture(), new Decimal('12.27'), 'unit_price_only');

    const p1 = byKey(results, 'p1');
    const p2 = byKey(results, 'p2');

    expect(p1.copyLineFields).toBe(false);
    expect(p1.newAmount?.toString()).toBe('5615'); // 見積側の数量 5 * 1123
    expect(p2.newAmount?.toString()).toBe('4158'); // 見積側の数量 3 * 1386
  });

  it('負の単価も絶対値で四捨五入して符号を保持する', () => {
    const rows: ProfitRateRow[] = [
      {
        key: 'plus',
        itemType: 'STANDARD',
        executionUnitPrice: dec('1000'),
        executionQuantity: dec('1'),
        estimateUnitPrice: null,
        estimateQuantity: dec('1'),
      },
      {
        key: 'minus',
        itemType: 'STANDARD',
        executionUnitPrice: dec('-1000'),
        executionQuantity: dec('1'),
        estimateUnitPrice: null,
        estimateQuantity: dec('1'),
      },
    ];

    const results = applyProfitRate(rows, new Decimal('12.35'), 'all');

    expect(at(results, 0).newUnitPrice?.toString()).toBe('1124'); // 1123.5 → 1124
    expect(at(results, 1).newUnitPrice?.toString()).toBe('-1124'); // -1123.5 → -1124
  });

  it('現行のプレビュー実装（EstimateCalculator.previewProfitRate）と一致する', () => {
    const rows = profitFixture().filter((r) => r.itemType === 'STANDARD');

    const actual = applyProfitRate(rows, new Decimal('12.27'), 'all');
    const legacy = EstimateCalculator.previewProfitRate(
      rows.map((r) => ({
        lineId: String(r.key),
        unitPrice: r.executionUnitPrice === null ? null : r.executionUnitPrice.toString(),
      })),
      '12.27'
    );

    expect(actual).toHaveLength(legacy.length);
    actual.forEach((r, i) => {
      const expected = at(legacy, i);
      expect(r.key).toBe(expected.lineId);
      expect(r.newUnitPrice?.toString() ?? null).toBe(expected.newUnitPrice);
    });
  });
});

// ============================================================================
// サマリー（39.1〜39.8, 39.10, 41.8, 55.2）
// ============================================================================

function summaryTree(): EditableItem[] {
  return [
    item('a', 'STANDARD', [
      line('ESTIMATE', '10000'),
      line('EXECUTION', '8000'),
      line('VENDOR', '7000'),
    ]),
    item('b', 'DISCOUNT', [line('ESTIMATE', '-1500')]),
    item('c', 'NOTE', [line('ESTIMATE', '9999')]),
    item(
      'd',
      'STANDARD',
      [line('ESTIMATE', '5000'), line('EXECUTION', '4000'), line('VENDOR', '3500')],
      [
        item('d1', 'STANDARD', [
          line('ESTIMATE', '5000'),
          line('EXECUTION', '4000'),
          line('VENDOR', '3500'),
        ]),
      ]
    ),
  ];
}

describe('summarize', () => {
  it('固定値でサマリー各項目を算出する（39.1〜39.8）', () => {
    const summary = summarize(summaryTree());

    expect(summary.vendorTotal.toString()).toBe('10500'); // 7000 + 3500
    expect(summary.executionTotal.toString()).toBe('12000'); // 8000 + 4000
    expect(summary.estimateTotal.toString()).toBe('13500'); // 10000 - 1500 + 5000
    expect(summary.discountAmount.toString()).toBe('1500'); // 実行 - 業者
    expect(summary.discountRatePercent?.toString()).toBe('14.29'); // 1500 / 10500
    expect(summary.profitAmount.toString()).toBe('1500'); // 見積 - 実行
    expect(summary.profitRatePercent?.toString()).toBe('11.11'); // 1500 / 13500
  });

  it('値引き行を加算し注記行を除外する（41.8, 55.2）', () => {
    const withoutDiscountAndNote = summaryTree().filter((i) => i.itemType === 'STANDARD');
    const summary = summarize(withoutDiscountAndNote);

    // 値引き行 -1500 が抜けた分だけ見積金額合計が増える（注記行 9999 は元から非集計）
    expect(summary.estimateTotal.toString()).toBe('15000');
  });

  it('分母がゼロの場合は率を null とする（39.5, 39.8）', () => {
    const summary = summarize([
      item('z', 'STANDARD', [line('ESTIMATE', '0'), line('VENDOR', '0')]),
    ]);

    expect(summary.discountRatePercent).toBeNull();
    expect(summary.profitRatePercent).toBeNull();
  });

  it('子項目は親に集計済みのためルート階層のみを合計する', () => {
    const summary = summarize(summaryTree());

    // 'd' とその子 'd1' の二重計上が起きていないこと
    expect(summary.estimateTotal.toString()).toBe('13500');
  });

  it('現行のサマリー実装（EstimateDetailPage の calculateTotalByLineType）と一致する', () => {
    // EstimateDetailPage.tsx の集計・率計算をそのまま写した参照実装
    const referenceTotal = (
      items: readonly EditableItem[],
      lineType: EstimateLineType
    ): Decimal => {
      let total = new Decimal(0);
      for (const it of items) {
        if (it.itemType === 'NOTE') continue;
        const l = it.lines.find((candidate) => candidate.lineType === lineType);
        if (l?.amount) {
          try {
            total = total.add(new Decimal(l.amount));
          } catch {
            // skip
          }
        }
      }
      return total;
    };

    const tree = summaryTree();
    const summary = summarize(tree);

    const estimateTotal = referenceTotal(tree, 'ESTIMATE');
    const executionTotal = referenceTotal(tree, 'EXECUTION');
    const vendorTotal = referenceTotal(tree, 'VENDOR');
    const discountAmount = executionTotal.sub(vendorTotal);
    const profitAmount = estimateTotal.sub(executionTotal);

    expect(summary.estimateTotal.toString()).toBe(estimateTotal.toString());
    expect(summary.executionTotal.toString()).toBe(executionTotal.toString());
    expect(summary.vendorTotal.toString()).toBe(vendorTotal.toString());
    expect(summary.discountAmount.toString()).toBe(discountAmount.toString());
    expect(summary.profitAmount.toString()).toBe(profitAmount.toString());
    expect(summary.discountRatePercent?.toString()).toBe(
      discountAmount.div(vendorTotal).mul(100).toDecimalPlaces(2).toString()
    );
    expect(summary.profitRatePercent?.toString()).toBe(
      profitAmount.div(estimateTotal).mul(100).toDecimalPlaces(2).toString()
    );
  });
});

// ============================================================================
// 名前空間オブジェクト（design.md の EstimateCalculations 契約）
// ============================================================================

describe('estimateCalculations', () => {
  it('設計の契約どおりの関数を公開する', () => {
    expect(typeof estimateCalculations.allocateNet).toBe('function');
    expect(typeof estimateCalculations.applyProfitRate).toBe('function');
    expect(typeof estimateCalculations.summarize).toBe('function');
    expect(typeof estimateCalculations.roundMoney).toBe('function');
    expect(typeof estimateCalculations.roundQuantity).toBe('function');
  });
});
