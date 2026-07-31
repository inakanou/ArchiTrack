/**
 * @fileoverview estimateEditReducer（編集状態の遷移関数）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加で新規の3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除で3行1セット全体を削除する
 * - 12.4: 親項目を削除した場合に子項目も含めて削除する
 * - 12.5: 見積項目の複製で3行1セット全体を複製する
 * - 12.7: すべての操作を編集セッション中にサーバーへ問い合わせずに行う
 * - 43.1: 行操作をサーバーへの保存を伴わずに画面上の明細へ反映する（新規行は一時識別子）
 * - 43.5: 行の追加・削除で影響を受ける親項目の金額合計を即座に再計算する
 * - 43.6: 親項目を削除した場合に子孫項目もあわせて取り除く
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - 41.2 / 41.3: 値引き行のプリセット値と見積金額行のみの構成
 * - 55.1 / 55.2: 注記行は名称のみを持ち金額の集計対象から除外される
 * - 22.3 / 22.9: 金額（数量×単価の自動計算結果）を小数第1位で四捨五入した整数で保持する
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateEditReducer`
 */

import { describe, it, expect } from 'vitest';
import {
  estimateEditReducer,
  createEstimateEditReducer,
  createInitialEstimateEditState,
  EMPTY_REPORT_FIELDS,
} from './estimateEditReducer';
import type {
  EditableItem,
  EditableLine,
  EstimateEditAction,
  EstimateEditItemType,
  EstimateEditState,
  EstimateLineType,
  NodeKey,
  TempId,
} from './estimateEditReducer.types';

// ============================================================================
// テスト用ビルダー
// ============================================================================

function line(lineType: EstimateLineType, overrides: Partial<EditableLine> = {}): EditableLine {
  return {
    id: null,
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    remarks: null,
    sourceVendorName: null,
    ...overrides,
  };
}

/** 3行1セットの通常項目 */
function item(
  id: string,
  overrides: {
    readonly itemType?: EstimateEditItemType;
    readonly children?: readonly EditableItem[];
    readonly amounts?: Partial<Record<EstimateLineType, string>>;
    readonly name?: string;
  } = {}
): EditableItem {
  const amounts = overrides.amounts ?? {};
  return {
    id,
    tempId: null,
    itemType: overrides.itemType ?? 'STANDARD',
    lines: (['ESTIMATE', 'EXECUTION', 'VENDOR'] as const).map((lineType) =>
      line(lineType, { name: overrides.name ?? id, amount: amounts[lineType] ?? null })
    ),
    children: overrides.children ?? [],
  };
}

/** 見積金額行のみを持つ項目（値引き行・注記行） */
function singleLineItem(
  id: string,
  itemType: EstimateEditItemType,
  overrides: Partial<EditableLine> = {}
): EditableItem {
  return {
    id,
    tempId: null,
    itemType,
    lines: [line('ESTIMATE', { name: id, ...overrides })],
    children: [],
  };
}

function stateOf(items: readonly EditableItem[]): EstimateEditState {
  return createInitialEstimateEditState(items);
}

/** 決定的な一時識別子を発番するリデューサ（テスト内で id を厳密に検証するため） */
function deterministicReducer(): (
  state: EstimateEditState,
  action: EstimateEditAction
) => EstimateEditState {
  let sequence = 0;
  return createEstimateEditReducer({
    generateTempId: (): TempId => {
      sequence += 1;
      return `tmp-t${sequence}`;
    },
  });
}

function keysOf(items: readonly EditableItem[]): readonly NodeKey[] {
  return items.map((entry) => entry.id ?? entry.tempId ?? '(none)');
}

function amountOf(target: EditableItem, lineType: EstimateLineType = 'ESTIMATE'): string | null {
  return target.lines.find((entry) => entry.lineType === lineType)?.amount ?? null;
}

function findItem(items: readonly EditableItem[], key: NodeKey): EditableItem {
  const stack: EditableItem[] = [...items];
  let current = stack.pop();
  while (current !== undefined) {
    if ((current.id ?? current.tempId) === key) {
      return current;
    }
    stack.push(...current.children);
    current = stack.pop();
  }
  throw new Error(`テスト用ツリーに ${key} が存在しません`);
}

/**
 * 深い階層（深さ3以上）のツリー
 *
 * A（親）
 *   └ A-1
 *       └ A-1-1
 *           └ A-1-1-1（金額 1000）
 * B（金額 300）
 */
function deepTree(): readonly EditableItem[] {
  return [
    item('A', {
      amounts: { ESTIMATE: '1000' },
      children: [
        item('A-1', {
          amounts: { ESTIMATE: '1000' },
          children: [
            item('A-1-1', {
              amounts: { ESTIMATE: '1000' },
              children: [item('A-1-1-1', { amounts: { ESTIMATE: '1000' } })],
            }),
          ],
        }),
      ],
    }),
    item('B', { amounts: { ESTIMATE: '300' } }),
  ];
}

// ============================================================================
// 純粋性（遷移関数が入力状態を変更せず、常に新しい状態を返す）
// ============================================================================

describe('estimateEditReducer / 純粋性', () => {
  const allActions: readonly EstimateEditAction[] = [
    { type: 'setItems', items: [item('X')] },
    { type: 'insertRow', afterKey: 'A-1-1-1', parentKey: 'A-1-1' },
    { type: 'insertNoteRow', afterKey: null, parentKey: 'A' },
    { type: 'insertDiscountRow' },
    { type: 'deleteRows', keys: ['A-1'] },
    { type: 'duplicateRows', keys: ['A-1'] },
    { type: 'moveRow', key: 'B', direction: 'up' },
    { type: 'reorderByDnd', sourceKey: 'B', targetKey: 'A-1-1', position: 'after' },
    {
      type: 'updateLineField',
      key: 'A-1-1-1',
      lineType: 'ESTIMATE',
      field: 'quantity',
      value: '3',
    },
    {
      type: 'updateReportFields',
      fields: { submissionDate: '2026-07-31', validityPeriod: '1ヶ月', separateWorks: ['解体'] },
    },
  ];

  it.each(allActions.map((action) => [action.type, action] as const))(
    '%s は入力 state を一切変更しない',
    (_label, action) => {
      const before = stateOf(deepTree());
      const snapshot = structuredClone(before);

      estimateEditReducer(before, action);

      expect(before).toEqual(snapshot);
    }
  );

  it.each(allActions.map((action) => [action.type, action] as const))(
    '%s は新しい state オブジェクトを返す',
    (_label, action) => {
      const before = stateOf(deepTree());

      const after = estimateEditReducer(before, action);

      expect(after).not.toBe(before);
    }
  );

  it('無効化された操作（循環する移動）でも新しい state オブジェクトを返す', () => {
    const before = stateOf(deepTree());
    const snapshot = structuredClone(before);

    const after = estimateEditReducer(before, {
      type: 'reorderByDnd',
      sourceKey: 'A',
      targetKey: 'A-1-1',
      position: 'after',
    });

    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);
    expect(after.items).toBe(before.items);
  });

  const noopActions: readonly EstimateEditAction[] = [
    { type: 'deleteRows', keys: [] },
    { type: 'deleteRows', keys: ['MISSING'] },
    { type: 'duplicateRows', keys: [] },
    { type: 'moveRow', key: 'A', direction: 'up' },
    { type: 'moveRow', key: 'MISSING', direction: 'down' },
    { type: 'reorderByDnd', sourceKey: 'B', targetKey: 'B', position: 'after' },
    { type: 'insertRow', afterKey: null, parentKey: 'MISSING' },
    { type: 'updateLineField', key: 'MISSING', lineType: 'ESTIMATE', field: 'name', value: 'x' },
    { type: 'updateReportFields', fields: EMPTY_REPORT_FIELDS },
  ];

  it.each(noopActions.map((action) => [action.type, action] as const))(
    '明細が変化しない %s でも新しい state オブジェクトを返す',
    (_label, action) => {
      const before = stateOf(deepTree());

      const after = estimateEditReducer(before, action);

      expect(after).not.toBe(before);
      expect(after.items).toBe(before.items);
      expect(after.isDirty).toBe(false);
    }
  );

  it('変化しなかった部分木は同一参照のまま保たれる（estimateTree のキャッシュを効かせるため）', () => {
    const before = stateOf(deepTree());
    const untouched = before.items[1];

    const after = estimateEditReducer(before, {
      type: 'insertRow',
      afterKey: 'A-1-1-1',
      parentKey: 'A-1-1',
    });

    expect(after.items[1]).toBe(untouched);
  });
});

// ============================================================================
// setItems
// ============================================================================

describe('estimateEditReducer / setItems', () => {
  it('明細を差し替え、未保存状態を解消する', () => {
    const before: EstimateEditState = {
      ...stateOf([item('OLD')]),
      isDirty: true,
      lastError: { kind: 'CANNOT_OUTDENT_ROOT' },
    };

    const after = estimateEditReducer(before, { type: 'setItems', items: [item('NEW')] });

    expect(keysOf(after.items)).toEqual(['NEW']);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toBeNull();
  });

  it('差し替え時に親項目の集計金額を整合させる（29.2 はクライアントの責務）', () => {
    const before = stateOf([]);

    const after = estimateEditReducer(before, {
      type: 'setItems',
      items: [
        item('P', {
          amounts: { ESTIMATE: '0' },
          children: [
            item('C1', { amounts: { ESTIMATE: '1000' } }),
            item('C2', { amounts: { ESTIMATE: '500' } }),
          ],
        }),
      ],
    });

    expect(amountOf(findItem(after.items, 'P'))).toBe('1500');
  });

  it('帳票用入力項目もあわせて差し替えられる', () => {
    const before = stateOf([]);

    const after = estimateEditReducer(before, {
      type: 'setItems',
      items: [],
      reportFields: {
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事'],
      },
    });

    expect(after.reportFields.submissionDate).toBe('2026-07-31');
    expect(after.isDirty).toBe(false);
  });
});

// ============================================================================
// insertRow（12.1, 43.1, 43.5）
// ============================================================================

describe('estimateEditReducer / insertRow', () => {
  it('新規の3行1セット（見積・実行・業者金額行）を作成する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A')]), {
      type: 'insertRow',
      afterKey: 'A',
      parentKey: null,
    });

    const inserted = findItem(after.items, 'tmp-t1');
    expect(inserted.itemType).toBe('STANDARD');
    expect(inserted.lines.map((entry) => entry.lineType)).toEqual([
      'ESTIMATE',
      'EXECUTION',
      'VENDOR',
    ]);
    expect(inserted.children).toEqual([]);
  });

  it('新規行は識別子を持たず一時識別子で表現される（43.1）', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A')]), {
      type: 'insertRow',
      afterKey: null,
      parentKey: null,
    });

    const inserted = findItem(after.items, 'tmp-t1');
    expect(inserted.id).toBeNull();
    expect(inserted.tempId).toBe('tmp-t1');
    expect(inserted.lines.every((entry) => entry.id === null)).toBe(true);
  });

  it('afterKey の直後に挿入する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A'), item('B'), item('C')]), {
      type: 'insertRow',
      afterKey: 'A',
      parentKey: null,
    });

    expect(keysOf(after.items)).toEqual(['A', 'tmp-t1', 'B', 'C']);
  });

  it('afterKey が null の場合は同一階層の末尾へ追加する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A'), item('B')]), {
      type: 'insertRow',
      afterKey: null,
      parentKey: null,
    });

    expect(keysOf(after.items)).toEqual(['A', 'B', 'tmp-t1']);
  });

  it('afterKey が指定階層に存在しない場合は同一階層の末尾へ追加する', () => {
    const reducer = deterministicReducer();

    // 'C' は 'P' の子ではなくルート直下にあるため、'P' の階層では基準行として解決できない
    const after = reducer(stateOf([item('P', { children: [item('C1'), item('C2')] }), item('C')]), {
      type: 'insertRow',
      afterKey: 'C',
      parentKey: 'P',
    });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1', 'C2', 'tmp-t1']);
    expect(keysOf(after.items)).toEqual(['P', 'C']);
  });

  it('parentKey で指定した項目の子として挿入する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('P', { children: [item('C')] })]), {
      type: 'insertRow',
      afterKey: null,
      parentKey: 'P',
    });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C', 'tmp-t1']);
  });

  it('子を持てない値引き行を親に指定した場合は状態を変更せずエラー情報を返す', () => {
    const before = stateOf([singleLineItem('D', 'DISCOUNT')]);

    const after = estimateEditReducer(before, {
      type: 'insertRow',
      afterKey: null,
      parentKey: 'D',
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({
      kind: 'INVALID_PARENT_TYPE',
      key: 'D',
      itemType: 'DISCOUNT',
    });
  });

  it('子を持てない注記行を親に指定した場合も状態を変更しない', () => {
    const before = stateOf([singleLineItem('N', 'NOTE')]);

    const after = estimateEditReducer(before, {
      type: 'insertRow',
      afterKey: null,
      parentKey: 'N',
    });

    expect(after.items).toBe(before.items);
    expect(after.lastError).toEqual({ kind: 'INVALID_PARENT_TYPE', key: 'N', itemType: 'NOTE' });
  });

  it('存在しない親を指定した場合は状態を変更しない', () => {
    const before = stateOf([item('A')]);

    const after = estimateEditReducer(before, {
      type: 'insertRow',
      afterKey: null,
      parentKey: 'MISSING',
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('行の追加後に影響する祖先の集計金額を再計算する（43.5）', () => {
    const reducer = deterministicReducer();
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1000' },
        children: [item('C', { amounts: { ESTIMATE: '1000' } })],
      }),
    ]);

    const inserted = reducer(before, { type: 'insertRow', afterKey: 'C', parentKey: 'P' });
    const after = reducer(inserted, {
      type: 'updateLineField',
      key: 'tmp-t1',
      lineType: 'ESTIMATE',
      field: 'amount',
      value: '500',
    });

    expect(amountOf(findItem(after.items, 'P'))).toBe('1500');
  });

  it('未保存の変更として扱う', () => {
    const after = estimateEditReducer(stateOf([item('A')]), {
      type: 'insertRow',
      afterKey: null,
      parentKey: null,
    });

    expect(after.isDirty).toBe(true);
  });
});

// ============================================================================
// insertNoteRow（55.1, 55.2）
// ============================================================================

describe('estimateEditReducer / insertNoteRow', () => {
  it('名称のみを持つ見積金額行1行の注記行を追加する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A')]), {
      type: 'insertNoteRow',
      afterKey: 'A',
      parentKey: null,
    });

    const note = findItem(after.items, 'tmp-t1');
    expect(note.itemType).toBe('NOTE');
    expect(note.lines).toHaveLength(1);
    expect(note.lines[0]?.lineType).toBe('ESTIMATE');
    expect(note.lines[0]?.specification).toBeNull();
    expect(note.lines[0]?.unit).toBeNull();
    expect(note.lines[0]?.quantity).toBeNull();
    expect(note.lines[0]?.unitPrice).toBeNull();
    expect(note.lines[0]?.amount).toBeNull();
  });

  it('注記行は任意の階層に配置でき、親の集計金額に影響しない（55.2, 55.3）', () => {
    const reducer = deterministicReducer();
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1000' },
        children: [item('C', { amounts: { ESTIMATE: '1000' } })],
      }),
    ]);

    const after = reducer(before, { type: 'insertNoteRow', afterKey: 'C', parentKey: 'P' });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C', 'tmp-t1']);
    expect(amountOf(findItem(after.items, 'P'))).toBe('1000');
  });
});

// ============================================================================
// insertDiscountRow（41.2, 41.3）
// ============================================================================

describe('estimateEditReducer / insertDiscountRow', () => {
  it('プリセット値の値引き行をルートレベルの末尾に追加する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('P', { children: [item('C')] })]), {
      type: 'insertDiscountRow',
    });

    expect(keysOf(after.items)).toEqual(['P', 'tmp-t1']);
    const discount = findItem(after.items, 'tmp-t1');
    expect(discount.itemType).toBe('DISCOUNT');
    expect(discount.lines).toHaveLength(1);
    expect(discount.lines[0]).toMatchObject({
      lineType: 'ESTIMATE',
      name: '値引き',
      specification: '',
      unit: '式',
      quantity: '1',
      unitPrice: null,
      amount: null,
    });
  });
});

// ============================================================================
// deleteRows（12.3, 12.4, 43.6）
// ============================================================================

describe('estimateEditReducer / deleteRows', () => {
  it('3行1セット全体を削除する（12.3）', () => {
    const after = estimateEditReducer(stateOf([item('A'), item('B')]), {
      type: 'deleteRows',
      keys: ['A'],
    });

    expect(keysOf(after.items)).toEqual(['B']);
  });

  it('親項目の削除で深さ3以上の子孫もあわせて取り除く（12.4, 43.6）', () => {
    const after = estimateEditReducer(stateOf(deepTree()), { type: 'deleteRows', keys: ['A-1'] });

    expect(keysOf(after.items)).toEqual(['A', 'B']);
    expect(findItem(after.items, 'A').children).toEqual([]);
    expect(() => findItem(after.items, 'A-1-1')).toThrow();
    expect(() => findItem(after.items, 'A-1-1-1')).toThrow();
  });

  it('複数キーをまとめて削除できる', () => {
    const after = estimateEditReducer(stateOf(deepTree()), {
      type: 'deleteRows',
      keys: ['A-1-1-1', 'B'],
    });

    expect(keysOf(after.items)).toEqual(['A']);
    expect(findItem(after.items, 'A-1-1').children).toEqual([]);
  });

  it('削除後に影響する祖先の集計金額を再計算する（43.5）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1500' },
        children: [
          item('C1', { amounts: { ESTIMATE: '1000' } }),
          item('C2', { amounts: { ESTIMATE: '500' } }),
        ],
      }),
    ]);

    const after = estimateEditReducer(before, { type: 'deleteRows', keys: ['C2'] });

    expect(amountOf(findItem(after.items, 'P'))).toBe('1000');
  });

  it('存在しないキーのみを指定した場合は明細を変更しない', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, { type: 'deleteRows', keys: ['MISSING'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });
});

// ============================================================================
// duplicateRows（12.5）
// ============================================================================

describe('estimateEditReducer / duplicateRows', () => {
  it('3行1セット全体を複製し、直後に配置する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([item('A'), item('B')]), {
      type: 'duplicateRows',
      keys: ['A'],
    });

    expect(keysOf(after.items)).toEqual(['A', 'tmp-t1', 'B']);
    const copy = findItem(after.items, 'tmp-t1');
    expect(copy.lines.map((entry) => entry.lineType)).toEqual(['ESTIMATE', 'EXECUTION', 'VENDOR']);
    expect(copy.lines.map((entry) => entry.name)).toEqual(['A', 'A', 'A']);
  });

  it('複製は識別子を持たず一時識別子のみを持つ（43.1）', () => {
    const reducer = deterministicReducer();
    const persisted: EditableItem = {
      id: 'A',
      tempId: null,
      itemType: 'STANDARD',
      lines: [
        line('ESTIMATE', { id: 'line-est' }),
        line('EXECUTION', { id: 'line-exe' }),
        line('VENDOR', { id: 'line-ven' }),
      ],
      children: [
        {
          id: 'A-1',
          tempId: null,
          itemType: 'STANDARD',
          lines: [line('ESTIMATE', { id: 'line-child' })],
          children: [],
        },
      ],
    };

    const after = reducer(stateOf([persisted]), { type: 'duplicateRows', keys: ['A'] });

    const copy = findItem(after.items, 'tmp-t1');
    expect(copy.id).toBeNull();
    expect(copy.tempId).toBe('tmp-t1');
    expect(copy.lines.map((entry) => entry.id)).toEqual([null, null, null]);
    const copiedChild = copy.children[0];
    expect(copiedChild?.id).toBeNull();
    expect(copiedChild?.lines.map((entry) => entry.id)).toEqual([null]);
  });

  it('子孫を含む部分木ごと複製する', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf(deepTree()), { type: 'duplicateRows', keys: ['A-1'] });

    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['A-1', 'tmp-t1']);
    const copy = findItem(after.items, 'tmp-t1');
    expect(keysOf(copy.children)).toEqual(['tmp-t2']);
    expect(keysOf(copy.children[0]?.children ?? [])).toEqual(['tmp-t3']);
  });

  it('選択に親と子孫が混在する場合、子孫は二重に複製しない', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf(deepTree()), {
      type: 'duplicateRows',
      keys: ['A-1', 'A-1-1'],
    });

    expect(keysOf(findItem(after.items, 'A-1-1').children)).toEqual(['A-1-1-1']);
    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['A-1', 'tmp-t1']);
  });

  it('複製後に祖先の集計金額を再計算する（43.5）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1000' },
        children: [item('C', { amounts: { ESTIMATE: '1000' } })],
      }),
    ]);

    const after = estimateEditReducer(before, { type: 'duplicateRows', keys: ['C'] });

    expect(amountOf(findItem(after.items, 'P'))).toBe('2000');
  });
});

// ============================================================================
// moveRow
// ============================================================================

describe('estimateEditReducer / moveRow', () => {
  it('同一階層の1つ上へ移動する', () => {
    const after = estimateEditReducer(stateOf([item('A'), item('B'), item('C')]), {
      type: 'moveRow',
      key: 'C',
      direction: 'up',
    });

    expect(keysOf(after.items)).toEqual(['A', 'C', 'B']);
  });

  it('同一階層の1つ下へ移動する', () => {
    const after = estimateEditReducer(stateOf([item('A'), item('B'), item('C')]), {
      type: 'moveRow',
      key: 'A',
      direction: 'down',
    });

    expect(keysOf(after.items)).toEqual(['B', 'A', 'C']);
  });

  it('子階層でも同一の親の中で並び替える', () => {
    const before = stateOf([item('P', { children: [item('C1'), item('C2')] })]);

    const after = estimateEditReducer(before, { type: 'moveRow', key: 'C2', direction: 'up' });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C2', 'C1']);
  });

  it('先頭行の上移動は明細を変更しない', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'moveRow', key: 'A', direction: 'up' });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('末尾行の下移動は明細を変更しない', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'moveRow', key: 'B', direction: 'down' });

    expect(after.items).toBe(before.items);
  });
});

// ============================================================================
// reorderByDnd（12.2）
// ============================================================================

describe('estimateEditReducer / reorderByDnd', () => {
  it('対象行の前へ移動する', () => {
    const after = estimateEditReducer(stateOf([item('A'), item('B'), item('C')]), {
      type: 'reorderByDnd',
      sourceKey: 'C',
      targetKey: 'A',
      position: 'before',
    });

    expect(keysOf(after.items)).toEqual(['C', 'A', 'B']);
  });

  it('対象行の後ろへ移動する', () => {
    const after = estimateEditReducer(stateOf([item('A'), item('B'), item('C')]), {
      type: 'reorderByDnd',
      sourceKey: 'A',
      targetKey: 'C',
      position: 'after',
    });

    expect(keysOf(after.items)).toEqual(['B', 'C', 'A']);
  });

  it('別の親配下へ部分木ごと移動する', () => {
    const after = estimateEditReducer(stateOf(deepTree()), {
      type: 'reorderByDnd',
      sourceKey: 'B',
      targetKey: 'A-1-1-1',
      position: 'after',
    });

    expect(keysOf(after.items)).toEqual(['A']);
    expect(keysOf(findItem(after.items, 'A-1-1').children)).toEqual(['A-1-1-1', 'B']);
  });

  it('移動後に移動元・移動先双方の祖先の集計金額を再計算する（43.5）', () => {
    const after = estimateEditReducer(stateOf(deepTree()), {
      type: 'reorderByDnd',
      sourceKey: 'B',
      targetKey: 'A-1-1-1',
      position: 'after',
    });

    expect(amountOf(findItem(after.items, 'A-1-1'))).toBe('1300');
    expect(amountOf(findItem(after.items, 'A'))).toBe('1300');
  });

  it('自身の子孫を移動先にした場合は状態を変更せずエラー情報を返す', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, {
      type: 'reorderByDnd',
      sourceKey: 'A',
      targetKey: 'A-1-1',
      position: 'before',
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'CYCLIC_MOVE', key: 'A' });
  });

  it('移動元と移動先が同一の場合は明細を変更しない', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, {
      type: 'reorderByDnd',
      sourceKey: 'B',
      targetKey: 'B',
      position: 'after',
    });

    expect(after.items).toBe(before.items);
  });

  it('存在しないキーを指定した場合は明細を変更しない', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, {
      type: 'reorderByDnd',
      sourceKey: 'MISSING',
      targetKey: 'B',
      position: 'after',
    });

    expect(after.items).toBe(before.items);
  });
});

// ============================================================================
// updateLineField
// ============================================================================

describe('estimateEditReducer / updateLineField', () => {
  it('指定した行タイプのセル値のみを更新する', () => {
    const before = stateOf([item('A')]);

    const after = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'A',
      lineType: 'EXECUTION',
      field: 'remarks',
      value: '備考',
    });

    const updated = findItem(after.items, 'A');
    expect(updated.lines.find((entry) => entry.lineType === 'EXECUTION')?.remarks).toBe('備考');
    expect(updated.lines.find((entry) => entry.lineType === 'ESTIMATE')?.remarks).toBeNull();
    expect(after.isDirty).toBe(true);
  });

  it('数量の入力で金額を単価×数量として自動計算する（22.3, 22.9）', () => {
    const before = stateOf([item('A')]);

    const withPrice = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'A',
      lineType: 'ESTIMATE',
      field: 'unitPrice',
      value: '1200.5',
    });
    const after = estimateEditReducer(withPrice, {
      type: 'updateLineField',
      key: 'A',
      lineType: 'ESTIMATE',
      field: 'quantity',
      value: '3',
    });

    expect(amountOf(findItem(after.items, 'A'))).toBe('3602');
  });

  it('数量または単価が空の場合は金額を null にする', () => {
    const priced: EditableItem = {
      id: 'A',
      tempId: null,
      itemType: 'STANDARD',
      lines: [line('ESTIMATE', { quantity: '2', unitPrice: '500', amount: '1000' })],
      children: [],
    };
    const before = stateOf([priced]);

    const after = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'A',
      lineType: 'ESTIMATE',
      field: 'quantity',
      value: null,
    });

    expect(amountOf(findItem(after.items, 'A'))).toBeNull();
  });

  it('セル値の更新後に祖先の集計金額を再計算する（29.2）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1000' },
        children: [item('C', { amounts: { ESTIMATE: '1000' } })],
      }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'C',
      lineType: 'ESTIMATE',
      field: 'amount',
      value: '2500',
    });

    expect(amountOf(findItem(after.items, 'P'))).toBe('2500');
  });

  it('存在しないキー・行タイプの場合は明細を変更しない', () => {
    const before = stateOf([singleLineItem('N', 'NOTE')]);

    const missingKey = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'MISSING',
      lineType: 'ESTIMATE',
      field: 'name',
      value: 'x',
    });
    const missingLine = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'N',
      lineType: 'VENDOR',
      field: 'name',
      value: 'x',
    });

    expect(missingKey.items).toBe(before.items);
    expect(missingLine.items).toBe(before.items);
  });

  it('同じ値での更新は明細を変更しない', () => {
    const before = stateOf([item('A')]);

    const after = estimateEditReducer(before, {
      type: 'updateLineField',
      key: 'A',
      lineType: 'ESTIMATE',
      field: 'name',
      value: 'A',
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });
});

// ============================================================================
// updateReportFields（54.6, 54.8）
// ============================================================================

describe('estimateEditReducer / updateReportFields', () => {
  it('提出日・有効期限・別途工事を更新し未保存の変更として扱う', () => {
    const before = stateOf([item('A')]);

    const after = estimateEditReducer(before, {
      type: 'updateReportFields',
      fields: {
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事', '解体工事'],
      },
    });

    expect(after.reportFields).toEqual({
      submissionDate: '2026-07-31',
      validityPeriod: '提出日より1ヶ月間',
      separateWorks: ['外構工事', '解体工事'],
    });
    expect(after.isDirty).toBe(true);
    expect(after.items).toBe(before.items);
  });

  it('同じ内容での更新は未保存の変更として扱わない', () => {
    const before = stateOf([item('A')]);

    const after = estimateEditReducer(before, {
      type: 'updateReportFields',
      fields: EMPTY_REPORT_FIELDS,
    });

    expect(after.isDirty).toBe(false);
  });
});

// ============================================================================
// 一時識別子の発番
// ============================================================================

describe('estimateEditReducer / 一時識別子', () => {
  it('既定の発番は tmp- 接頭辞を持ち、連続する追加で重複しない', () => {
    const first = estimateEditReducer(stateOf([]), {
      type: 'insertRow',
      afterKey: null,
      parentKey: null,
    });
    const second = estimateEditReducer(first, {
      type: 'insertRow',
      afterKey: null,
      parentKey: null,
    });

    const keys = keysOf(second.items);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(/^tmp-\d+$/);
    }
    expect(new Set(keys).size).toBe(2);
  });

  it('発番関数を注入すると一時識別子を決定的に制御できる', () => {
    const reducer = deterministicReducer();

    const after = reducer(stateOf([]), { type: 'insertRow', afterKey: null, parentKey: null });

    expect(keysOf(after.items)).toEqual(['tmp-t1']);
  });
});

// ============================================================================
// 初期状態
// ============================================================================

describe('createInitialEstimateEditState', () => {
  it('未保存の変更がなくエラーもない状態を返す', () => {
    const state = createInitialEstimateEditState();

    expect(state.items).toEqual([]);
    expect(state.reportFields).toEqual(EMPTY_REPORT_FIELDS);
    expect(state.isDirty).toBe(false);
    expect(state.lastError).toBeNull();
  });
});
