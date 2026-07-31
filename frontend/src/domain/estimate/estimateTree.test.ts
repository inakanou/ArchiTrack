/**
 * @fileoverview estimateTree（ツリー導出ユーティリティ）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 2.4: 複数階層のネストをサポートする
 * - 2.5: 階層の深さに上限を設けない
 * - 2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - 29.1: 子項目を持つ項目の単価フィールドを編集不可とする（＝金額は導出値）
 * - 29.2: 子項目の金額合計を親項目の金額として自動計算する
 * - 43.5: 行の追加・削除・階層変更で影響を受ける親項目の金額合計を即座に再計算する
 * - 55.2: 注記行を金額の集計対象から除外する
 * - 41.8: 値引き行の金額（負数を含む）を加算して集計する
 * - 44.7: 自身または子孫を親にする移動を検出する
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateTree`
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTree,
  nodeKeyOf,
  depthOf,
  pathTo,
  descendantKeys,
  wouldCreateCycle,
  childrenOf,
  isAggregatableChild,
  recalculateAncestorAmounts,
  toHierarchyNodes,
  flattenForGrid,
} from './estimateTree';
import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
  NodeKey,
} from './estimateTree';

// ============================================================================
// テスト用ビルダー
// ============================================================================

function line(
  lineType: EstimateLineType,
  amount: string | null,
  name: string | null = null
): EditableLine {
  return {
    id: null,
    lineType,
    name,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount,
    remarks: null,
    sourceVendorName: null,
  };
}

interface ItemOptions {
  itemType?: EstimateEditItemType;
  lines?: EditableLine[];
  children?: EditableItem[];
  name?: string;
}

function item(key: string, options: ItemOptions = {}): EditableItem {
  return {
    id: key,
    tempId: null,
    itemType: options.itemType ?? 'STANDARD',
    lines: options.lines ?? [line('ESTIMATE', null, options.name ?? key)],
    children: options.children ?? [],
  };
}

/** 深さ `depth` の一本鎖ツリーを作る（葉のみ金額を持つ） */
function buildChain(depth: number, leafAmount = '10'): EditableItem[] {
  let node = item(`n-${depth - 1}`, { lines: [line('ESTIMATE', leafAmount)] });
  for (let i = depth - 2; i >= 0; i -= 1) {
    node = item(`n-${i}`, { lines: [line('ESTIMATE', null)], children: [node] });
  }
  return [node];
}

function estimateAmountOf(target: EditableItem): string | null {
  return target.lines.find((l) => l.lineType === 'ESTIMATE')?.amount ?? null;
}

function findByKey(tree: readonly EditableItem[], key: NodeKey): EditableItem {
  const stack: EditableItem[] = [...tree];
  while (stack.length > 0) {
    const current = stack.pop() as EditableItem;
    if (nodeKeyOf(current) === key) return current;
    stack.push(...current.children);
  }
  throw new Error(`not found: ${key}`);
}

/** `noUncheckedIndexedAccess` 下で添字アクセスの結果を非 undefined として扱う */
function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`index out of range: ${index}`);
  }
  return value;
}

// ============================================================================
// 共通のサンプルツリー
// ============================================================================

/**
 * root-a
 *   ├ a-1
 *   │   ├ a-1-1
 *   │   └ a-1-2
 *   └ a-2
 * root-b
 */
function sampleTree(): EditableItem[] {
  return [
    item('root-a', {
      children: [
        item('a-1', {
          children: [item('a-1-1'), item('a-1-2')],
        }),
        item('a-2'),
      ],
    }),
    item('root-b'),
  ];
}

// ============================================================================
// nodeKeyOf
// ============================================================================

describe('nodeKeyOf', () => {
  it('id を持つ項目は id をキーとする', () => {
    expect(nodeKeyOf(item('x'))).toBe('x');
  });

  it('新規項目は tempId をキーとする', () => {
    const added: EditableItem = {
      id: null,
      tempId: 'tmp-1',
      itemType: 'STANDARD',
      lines: [line('ESTIMATE', null)],
      children: [],
    };
    expect(nodeKeyOf(added)).toBe('tmp-1');
  });

  it('id と tempId がいずれも null の場合は不変条件違反として例外を投げる', () => {
    const broken: EditableItem = {
      id: null,
      tempId: null,
      itemType: 'STANDARD',
      lines: [],
      children: [],
    };
    expect(() => nodeKeyOf(broken)).toThrow();
  });
});

// ============================================================================
// depthOf / pathTo / descendantKeys / childrenOf（2.4, 2.5, 2.6）
// ============================================================================

describe('depthOf', () => {
  it('ルート項目の深さを 0 とし、子孫の深さを段階的に返す（2.6）', () => {
    const tree = sampleTree();
    expect(depthOf(tree, 'root-a')).toBe(0);
    expect(depthOf(tree, 'a-1')).toBe(1);
    expect(depthOf(tree, 'a-1-1')).toBe(2);
    expect(depthOf(tree, 'root-b')).toBe(0);
  });

  it('存在しないキーには -1 を返す', () => {
    expect(depthOf(sampleTree(), 'missing')).toBe(-1);
  });

  it('階層の深さに上限を設けない（2.5）', () => {
    const deep = buildChain(2000);
    expect(depthOf(deep, 'n-1999')).toBe(1999);
  });
});

describe('pathTo', () => {
  it('ルートから対象項目までの経路を対象を含めて返す', () => {
    const tree = sampleTree();
    expect(pathTo(tree, 'a-1-2').map(nodeKeyOf)).toEqual(['root-a', 'a-1', 'a-1-2']);
  });

  it('ルート項目の経路は自身のみとなる', () => {
    const tree = sampleTree();
    expect(pathTo(tree, 'root-b').map(nodeKeyOf)).toEqual(['root-b']);
  });

  it('存在しないキーには空配列を返す', () => {
    expect(pathTo(sampleTree(), 'missing')).toEqual([]);
  });

  it('深い階層でも経路を再帰なしで導出できる（2.5）', () => {
    const deep = buildChain(2000);
    expect(pathTo(deep, 'n-1999')).toHaveLength(2000);
  });
});

describe('descendantKeys', () => {
  it('自身を含まず子孫を先行順で列挙する', () => {
    const tree = sampleTree();
    expect(descendantKeys(tree, 'root-a')).toEqual(['a-1', 'a-1-1', 'a-1-2', 'a-2']);
  });

  it('子を持たない項目には空配列を返す', () => {
    expect(descendantKeys(sampleTree(), 'a-1-1')).toEqual([]);
  });

  it('存在しないキーには空配列を返す', () => {
    expect(descendantKeys(sampleTree(), 'missing')).toEqual([]);
  });

  it('深い階層でも全子孫を列挙できる（2.5）', () => {
    const deep = buildChain(2000);
    expect(descendantKeys(deep, 'n-0')).toHaveLength(1999);
  });
});

describe('childrenOf', () => {
  it('親キーが null の場合はルート項目を返す', () => {
    const tree = sampleTree();
    expect(childrenOf(tree, null).map(nodeKeyOf)).toEqual(['root-a', 'root-b']);
  });

  it('指定した親の直下の子のみを返す', () => {
    const tree = sampleTree();
    expect(childrenOf(tree, 'a-1').map(nodeKeyOf)).toEqual(['a-1-1', 'a-1-2']);
  });

  it('存在しないキーには空配列を返す', () => {
    expect(childrenOf(sampleTree(), 'missing')).toEqual([]);
  });
});

// ============================================================================
// wouldCreateCycle（44.7）
// ============================================================================

describe('wouldCreateCycle', () => {
  it('自身を親にする移動を検出する', () => {
    expect(wouldCreateCycle(sampleTree(), ['a-1'], 'a-1')).toBe(true);
  });

  it('直下の子を親にする移動を検出する', () => {
    expect(wouldCreateCycle(sampleTree(), ['a-1'], 'a-1-1')).toBe(true);
  });

  it('深い子孫を親にする移動を検出する', () => {
    expect(wouldCreateCycle(sampleTree(), ['root-a'], 'a-1-2')).toBe(true);
  });

  it('移動対象が複数の場合、いずれか1つでも循環を生むなら検出する', () => {
    expect(wouldCreateCycle(sampleTree(), ['root-b', 'a-1'], 'a-1-1')).toBe(true);
  });

  it('子孫関係にない項目を親にする移動は循環にならない', () => {
    expect(wouldCreateCycle(sampleTree(), ['a-1'], 'root-b')).toBe(false);
  });

  it('ルートレベルへの移動（親 null）は循環にならない', () => {
    expect(wouldCreateCycle(sampleTree(), ['a-1'], null)).toBe(false);
  });

  it('深い階層の子孫への移動も検出する（2.5）', () => {
    const deep = buildChain(2000);
    expect(wouldCreateCycle(deep, ['n-0'], 'n-1999')).toBe(true);
  });
});

// ============================================================================
// isAggregatableChild（55.2, 41.8）
// ============================================================================

describe('isAggregatableChild', () => {
  it('注記行を集計対象から除外する（55.2）', () => {
    expect(isAggregatableChild({ itemType: 'NOTE' })).toBe(false);
  });

  it('見積項目と値引き行を集計対象に含める（41.8, 55.2）', () => {
    expect(isAggregatableChild({ itemType: 'STANDARD' })).toBe(true);
    expect(isAggregatableChild({ itemType: 'DISCOUNT' })).toBe(true);
  });

  /**
   * 集計規則は単一定義であり、`recalculateAncestorAmounts` の集計と
   * 明細表（`EstimateItemTable` の単価編集ロック判定）が同じ判定を共有する。
   * 片方だけを変えると「集計は葉扱いなのに単価だけ編集不可」というどの要件も
   * 記述していない状態に分岐しうるため、両者の一致を固定する。
   */
  const itemTypes: readonly EstimateEditItemType[] = ['STANDARD', 'DISCOUNT', 'NOTE'];

  it.each(itemTypes)(
    '%s の子の金額が親に加算されるかは isAggregatableChild の判定と一致する（55.2）',
    (itemType) => {
      const tree = [
        item('parent', {
          lines: [line('ESTIMATE', null)],
          children: [item('child', { itemType, lines: [line('ESTIMATE', '700')] })],
        }),
      ];

      const aggregated = estimateAmountOf(at(recalculateAncestorAmounts(tree), 0)) === '700';

      expect(aggregated).toBe(isAggregatableChild({ itemType }));
    }
  );
});

// ============================================================================
// recalculateAncestorAmounts（2.3, 29.2, 43.5, 55.2, 41.8）
// ============================================================================

describe('recalculateAncestorAmounts', () => {
  it('親項目の金額を子の合計で上書きする（29.2）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', '999')],
        children: [
          item('c1', { lines: [line('ESTIMATE', '100')] }),
          item('c2', { lines: [line('ESTIMATE', '250')] }),
        ],
      }),
    ];

    const result = recalculateAncestorAmounts(tree);
    expect(estimateAmountOf(at(result, 0))).toBe('350');
  });

  it('行タイプごとに同じ行タイプの子の金額を集計する（29.1, 29.2）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null), line('EXECUTION', null), line('VENDOR', null)],
        children: [
          item('c1', {
            lines: [line('ESTIMATE', '100'), line('EXECUTION', '80'), line('VENDOR', '70')],
          }),
          item('c2', {
            lines: [line('ESTIMATE', '200'), line('EXECUTION', '150'), line('VENDOR', '120')],
          }),
        ],
      }),
    ];

    const parent = at(recalculateAncestorAmounts(tree), 0);
    expect(parent.lines.map((l) => [l.lineType, l.amount])).toEqual([
      ['ESTIMATE', '300'],
      ['EXECUTION', '230'],
      ['VENDOR', '190'],
    ]);
  });

  it('多階層を下位から順に再計算する（2.4, 43.5）', () => {
    const tree = [
      item('root', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('mid', {
            lines: [line('ESTIMATE', null)],
            children: [
              item('leaf-1', { lines: [line('ESTIMATE', '10')] }),
              item('leaf-2', { lines: [line('ESTIMATE', '20')] }),
            ],
          }),
          item('sibling', { lines: [line('ESTIMATE', '5')] }),
        ],
      }),
    ];

    const result = recalculateAncestorAmounts(tree);
    expect(estimateAmountOf(findByKey(result, 'mid'))).toBe('30');
    expect(estimateAmountOf(at(result, 0))).toBe('35');
  });

  it('注記行を集計対象から除外する（55.2）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('c1', { lines: [line('ESTIMATE', '100')] }),
          item('note', { itemType: 'NOTE', lines: [line('ESTIMATE', '9999', '数量は実測による')] }),
          item('c2', { lines: [line('ESTIMATE', '200')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('300');
  });

  it('子が注記行のみの項目は集計対象が無いため自身の金額を保持する（55.2）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', '1500')],
        children: [
          item('note', { itemType: 'NOTE', lines: [line('ESTIMATE', null, '支給材あり')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('1500');
  });

  it('値引き行の負数を集計に含める（41.8）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('c1', { lines: [line('ESTIMATE', '1000')] }),
          item('discount', { itemType: 'DISCOUNT', lines: [line('ESTIMATE', '-300')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('700');
  });

  it('金額が未入力の子は 0 として扱う', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('c1', { lines: [line('ESTIMATE', null)] }),
          item('c2', { lines: [line('ESTIMATE', '40')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('40');
  });

  it('数値として解釈できない金額の子は 0 として扱う', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('c1', { lines: [line('ESTIMATE', '未定')] }),
          item('c2', { lines: [line('ESTIMATE', '40')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('40');
  });

  it('該当する行タイプを持つ子が無い場合、その行タイプの金額は 0 になる', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', '900'), line('EXECUTION', '800')],
        children: [item('discount', { itemType: 'DISCOUNT', lines: [line('ESTIMATE', '-300')] })],
      }),
    ];

    const parent = at(recalculateAncestorAmounts(tree), 0);
    expect(parent.lines.map((l) => [l.lineType, l.amount])).toEqual([
      ['ESTIMATE', '-300'],
      ['EXECUTION', '0'],
    ]);
  });

  it('集計結果を小数第1位で四捨五入した整数にする（22.3）', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [
          item('c1', { lines: [line('ESTIMATE', '100.4')] }),
          item('c2', { lines: [line('ESTIMATE', '100.2')] }),
        ],
      }),
    ];

    expect(estimateAmountOf(at(recalculateAncestorAmounts(tree), 0))).toBe('201');
  });

  it('入力ツリーを変更しない', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', '0')],
        children: [item('c1', { lines: [line('ESTIMATE', '100')] })],
      }),
    ];
    const snapshot = structuredClone(tree);

    recalculateAncestorAmounts(tree);

    expect(tree).toEqual(snapshot);
  });

  it('集計済みで変化が無いツリーは同一参照をそのまま返す', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', '100')],
        children: [item('c1', { lines: [line('ESTIMATE', '100')] })],
      }),
    ];

    expect(recalculateAncestorAmounts(tree)).toBe(tree);
  });

  it('変化しない部分木の参照を維持する', () => {
    const untouched = item('root-b', { lines: [line('ESTIMATE', '5')] });
    const tree = [
      item('root-a', {
        lines: [line('ESTIMATE', null)],
        children: [item('c1', { lines: [line('ESTIMATE', '100')] })],
      }),
      untouched,
    ];

    const result = recalculateAncestorAmounts(tree);
    expect(result).not.toBe(tree);
    expect(at(result, 1)).toBe(untouched);
  });

  it('深い階層でもスタックを溢れさせずに集計できる（2.5）', () => {
    const deep = buildChain(2000, '7');
    const result = recalculateAncestorAmounts(deep);
    expect(estimateAmountOf(at(result, 0))).toBe('7');
    expect(estimateAmountOf(findByKey(result, 'n-1000'))).toBe('7');
  });
});

// ============================================================================
// toHierarchyNodes（46.2）
// ============================================================================

describe('toHierarchyNodes', () => {
  it('俯瞰用のツリー構造をキー・名称・深さ付きで導出する', () => {
    const tree = sampleTree();
    const nodes = toHierarchyNodes(tree);

    expect(nodes.map((n) => n.key)).toEqual(['root-a', 'root-b']);
    expect(at(nodes, 0).depth).toBe(0);
    expect(at(nodes, 0).name).toBe('root-a');
    expect(at(nodes, 0).children.map((n) => n.key)).toEqual(['a-1', 'a-2']);
    expect(at(at(nodes, 0).children, 0).depth).toBe(1);
    expect(at(at(nodes, 0).children, 0).children.map((n) => n.key)).toEqual(['a-1-1', 'a-1-2']);
    expect(at(at(at(nodes, 0).children, 0).children, 0).depth).toBe(2);
  });

  it('項目種別を保持する（注記行・値引き行の区別）', () => {
    const tree = [
      item('note', { itemType: 'NOTE', lines: [line('ESTIMATE', null, '注記')] }),
      item('discount', { itemType: 'DISCOUNT', lines: [line('ESTIMATE', '-100', '値引')] }),
    ];
    const nodes = toHierarchyNodes(tree);
    expect(nodes.map((n) => n.itemType)).toEqual(['NOTE', 'DISCOUNT']);
  });

  it('階層の深さに上限を設けない（2.5）', () => {
    const nodes = toHierarchyNodes(buildChain(2000));
    let current = at(nodes, 0);
    let depth = 0;
    while (current.children.length > 0) {
      current = at(current.children, 0);
      depth += 1;
    }
    expect(depth).toBe(1999);
    expect(current.depth).toBe(1999);
  });
});

// ============================================================================
// flattenForGrid（2.6, 45.3, 45.5）
// ============================================================================

describe('flattenForGrid', () => {
  it('インデント表示用に先行順の平坦化と深さを返す（2.6）', () => {
    const rows = flattenForGrid(sampleTree(), new Set());
    expect(rows.map((r) => [r.key, r.depth])).toEqual([
      ['root-a', 0],
      ['a-1', 1],
      ['a-1-1', 2],
      ['a-1-2', 2],
      ['a-2', 1],
      ['root-b', 0],
    ]);
  });

  it('親キーと子の有無を各行に付与する', () => {
    const rows = flattenForGrid(sampleTree(), new Set());
    const a11 = rows.find((r) => r.key === 'a-1-1');
    expect(a11?.parentKey).toBe('a-1');
    expect(a11?.hasChildren).toBe(false);
    expect(at(rows, 0).parentKey).toBeNull();
    expect(at(rows, 0).hasChildren).toBe(true);
  });

  it('折りたたまれた項目の子孫を除外する（45.5）', () => {
    const rows = flattenForGrid(sampleTree(), new Set<NodeKey>(['a-1']));
    expect(rows.map((r) => r.key)).toEqual(['root-a', 'a-1', 'a-2', 'root-b']);
    expect(rows.find((r) => r.key === 'a-1')?.isCollapsed).toBe(true);
  });

  it('折りたたみが入れ子になっていても先行順を保つ', () => {
    const rows = flattenForGrid(sampleTree(), new Set<NodeKey>(['root-a']));
    expect(rows.map((r) => r.key)).toEqual(['root-a', 'root-b']);
  });

  it('元の項目への参照を各行に保持する', () => {
    const tree = sampleTree();
    const rows = flattenForGrid(tree, new Set());
    expect(at(rows, 0).item).toBe(at(tree, 0));
  });

  it('階層の深さに上限を設けない（2.5）', () => {
    const rows = flattenForGrid(buildChain(2000), new Set());
    expect(rows).toHaveLength(2000);
    expect(at(rows, 1999).depth).toBe(1999);
  });
});

// ============================================================================
// キャッシュ（同一ツリーに対する再計算を繰り返さない）
// ============================================================================

describe('導出結果のキャッシュ', () => {
  it('同一ツリーに対する toHierarchyNodes は同一の結果オブジェクトを返す（再計算されていない証跡）', () => {
    const tree = sampleTree();
    expect(toHierarchyNodes(tree)).toBe(toHierarchyNodes(tree));
  });

  it('同一ツリー・同一の折りたたみ集合に対する flattenForGrid は同一の結果オブジェクトを返す', () => {
    const tree = sampleTree();
    const collapsed = new Set<NodeKey>(['a-1']);
    expect(flattenForGrid(tree, collapsed)).toBe(flattenForGrid(tree, collapsed));
  });

  it('折りたたみ集合が異なる場合は別の結果を返す', () => {
    const tree = sampleTree();
    const first = flattenForGrid(tree, new Set<NodeKey>(['a-1']));
    const second = flattenForGrid(tree, new Set<NodeKey>());
    expect(first).not.toBe(second);
    expect(first.map((r) => r.key)).not.toEqual(second.map((r) => r.key));
  });

  it('同一ツリーに対する recalculateAncestorAmounts は同一の結果オブジェクトを返す', () => {
    const tree = [
      item('parent', {
        lines: [line('ESTIMATE', null)],
        children: [item('c1', { lines: [line('ESTIMATE', '100')] })],
      }),
    ];
    expect(recalculateAncestorAmounts(tree)).toBe(recalculateAncestorAmounts(tree));
  });

  it('別のツリーオブジェクトには新しい結果を返す（キャッシュが取り違えない）', () => {
    const first = sampleTree();
    const second = sampleTree();
    expect(toHierarchyNodes(first)).not.toBe(toHierarchyNodes(second));
    expect(toHierarchyNodes(first)).toEqual(toHierarchyNodes(second));
  });

  it('初回導出後に同一ツリーを破壊的に変更しても結果が変わらない（走査が再実行されていない証跡）', () => {
    const tree = sampleTree();

    // 初回導出でインデックスを構築させる
    expect(depthOf(tree, 'a-1-1')).toBe(2);
    expect(descendantKeys(tree, 'root-a')).toEqual(['a-1', 'a-1-1', 'a-1-2', 'a-2']);

    // 同一のツリー配列オブジェクトを破壊的に変更する
    const mutable = at(tree, 0) as unknown as { children: EditableItem[] };
    mutable.children = [...mutable.children, item('a-3')];

    // 再走査していれば 'a-3' が現れるはずだが、キャッシュにより現れない
    expect(descendantKeys(tree, 'root-a')).toEqual(['a-1', 'a-1-1', 'a-1-2', 'a-2']);
    expect(depthOf(tree, 'a-3')).toBe(-1);

    // 変更後の配列を新しいツリーとして渡せば反映される
    expect(descendantKeys([...tree], 'root-a')).toEqual(['a-1', 'a-1-1', 'a-1-2', 'a-2', 'a-3']);
  });
});

// ============================================================================
// 集約オブジェクト
// ============================================================================

describe('estimateTree', () => {
  it('EstimateTreeUtil の全メソッドを公開する', () => {
    expect(Object.keys(estimateTree).sort()).toEqual([
      'childrenOf',
      'depthOf',
      'descendantKeys',
      'flattenForGrid',
      'pathTo',
      'recalculateAncestorAmounts',
      'toHierarchyNodes',
      'wouldCreateCycle',
    ]);
  });

  it('名前付きエクスポートと同一の実装を参照する', () => {
    expect(estimateTree.recalculateAncestorAmounts).toBe(recalculateAncestorAmounts);
    expect(estimateTree.flattenForGrid).toBe(flattenForGrid);
  });
});
