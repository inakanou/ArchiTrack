/**
 * @fileoverview estimateEditReducer（編集状態の遷移関数）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加で新規の3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除で3行1セット全体を削除する
 * - 12.4: 親項目を削除した場合に子項目も含めて削除する
 * - 12.5: 見積項目の複製で3行1セット全体を複製する
 * - 12.6: 見積項目の親項目を変更（移動）可能とする
 * - 12.7: すべての操作を編集セッション中にサーバーへ問い合わせずに行う
 * - 23.9: 選択中の項目を現在の親の兄弟レベルに移動する（上の階層へ移動）
 * - 23.10: 選択中の項目を Requirement 44 のネスト化ルールに従って階層を1段下げる
 * - 44.3: 削除・複写・階層の上げ下げを選択範囲全体に対して適用する
 * - 44.4: 選択範囲の先頭行を親とし、先頭行を除く選択行をその子項目として配置する
 * - 44.5: 選択行を現在の親項目の兄弟レベルへ移動する
 * - 44.6: ルートレベルでの「上の階層へ移動」は実行せず、上げられないことを示す
 * - 44.7: 自身または自身の子孫の子になる移動は実行せずエラーを返す
 * - 43.1: 行操作をサーバーへの保存を伴わずに画面上の明細へ反映する（新規行は一時識別子）
 * - 43.5: 行の追加・削除・階層変更で影響を受ける親項目の金額合計を即座に再計算する
 * - 43.6: 親項目を削除した場合に子孫項目もあわせて取り除く
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - 41.2 / 41.3: 値引き行のプリセット値と見積金額行のみの構成
 * - 55.1 / 55.2: 注記行は名称のみを持ち金額の集計対象から除外される
 * - 55.3: 注記行を任意の階層の任意の位置に配置可能とする
 * - 22.3 / 22.9: 金額（数量×単価の自動計算結果）を小数第1位で四捨五入した整数で保持する
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateEditReducer`
 */

import { describe, it, expect } from 'vitest';
import { summarize } from './estimateCalculations';
import {
  estimateEditReducer,
  createEstimateEditReducer,
  createInitialEstimateEditState,
  EMPTY_REPORT_FIELDS,
} from './estimateEditReducer';
import type {
  EditableItem,
  EditableLine,
  EditError,
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
    { type: 'indentRange', keys: ['A-1-1', 'B'] },
    { type: 'outdentRange', keys: ['A-1-1'] },
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

  /**
   * 拒否経路（design.md State Management の `EditError` 4種）は明細を差し替える経路を通らない
   * 別実装のため、成功経路とは独立に「入力 state を一切変更しない」を確認する。
   * あわせて 4 種すべてが実際に到達可能であることを固定する。
   */
  interface RejectionCase {
    readonly kind: EditError['kind'];
    readonly build: () => EstimateEditState;
    readonly action: EstimateEditAction;
  }

  const rejections: readonly RejectionCase[] = [
    {
      kind: 'NO_PRECEDING_SIBLING',
      build: () => stateOf([item('A'), item('B')]),
      action: { type: 'indentRange', keys: ['A'] },
    },
    {
      kind: 'CANNOT_OUTDENT_ROOT',
      build: () => stateOf([item('A'), item('B')]),
      action: { type: 'outdentRange', keys: ['B'] },
    },
    {
      kind: 'INVALID_PARENT_TYPE',
      build: () => stateOf([singleLineItem('N', 'NOTE'), item('B')]),
      action: { type: 'indentRange', keys: ['N', 'B'] },
    },
    {
      kind: 'CYCLIC_MOVE',
      build: () => stateOf(deepTree()),
      action: { type: 'indentRange', keys: ['A-1', 'A'] },
    },
  ];

  it.each(rejections.map((entry) => [entry.kind, entry] as const))(
    '%s で拒否された操作は入力 state を一切変更しない',
    (kind, entry) => {
      const before = entry.build();
      const snapshot = structuredClone(before);

      const after = estimateEditReducer(before, entry.action);

      expect(before).toEqual(snapshot);
      expect(after).not.toBe(before);
      expect(after.items).toBe(before.items);
      expect(after.isDirty).toBe(false);
      expect(after.lastError?.kind).toBe(kind);
    }
  );

  const noopActions: readonly EstimateEditAction[] = [
    { type: 'deleteRows', keys: [] },
    { type: 'deleteRows', keys: ['MISSING'] },
    { type: 'duplicateRows', keys: [] },
    { type: 'moveRow', key: 'A', direction: 'up' },
    { type: 'moveRow', key: 'MISSING', direction: 'down' },
    { type: 'reorderByDnd', sourceKey: 'B', targetKey: 'B', position: 'after' },
    { type: 'indentRange', keys: [] },
    { type: 'indentRange', keys: ['MISSING'] },
    { type: 'outdentRange', keys: [] },
    { type: 'outdentRange', keys: ['MISSING'] },
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
// indentRange（12.6, 23.10, 44.3, 44.4, 44.7, 41.3, 55.3）
// ============================================================================

describe('estimateEditReducer / indentRange', () => {
  it('選択範囲の先頭行を親へ昇格させ、残りをその子として配置する（44.4）', () => {
    const before = stateOf([item('A'), item('B'), item('C')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A', 'B', 'C'] });

    expect(keysOf(after.items)).toEqual(['A']);
    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['B', 'C']);
    expect(after.isDirty).toBe(true);
    expect(after.lastError).toBeNull();
  });

  it('先頭行の既存の子は保持され、選択行はその後ろへ並ぶ（44.4）', () => {
    const before = stateOf([item('P', { children: [item('X')] }), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['P', 'B'] });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['X', 'B']);
  });

  it('選択範囲より後ろの行は階層を変えない（44.4）', () => {
    const before = stateOf([item('A'), item('B'), item('C'), item('D')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A', 'B'] });

    expect(keysOf(after.items)).toEqual(['A', 'C', 'D']);
    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['B']);
  });

  it('異なる親をまたぐ選択でも先頭行の子へ集約する（44.3, 44.4）', () => {
    const before = stateOf([
      item('P', { children: [item('C1')] }),
      item('Q', { children: [item('C2')] }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['C1', 'C2'] });

    expect(keysOf(findItem(after.items, 'C1').children)).toEqual(['C2']);
    expect(findItem(after.items, 'Q').children).toEqual([]);
  });

  it('選択に祖先と子孫が混在する場合、子孫は部分木として一緒に移動する（44.3）', () => {
    const before = stateOf([item('H'), item('B', { children: [item('B1')] })]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['H', 'B', 'B1'] });

    expect(keysOf(after.items)).toEqual(['H']);
    expect(keysOf(findItem(after.items, 'H').children)).toEqual(['B']);
    expect(keysOf(findItem(after.items, 'B').children)).toEqual(['B1']);
  });

  it('選択が先頭行とその子孫のみの場合は既に配下にあるため明細を変更しない（44.4）', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, {
      type: 'indentRange',
      keys: ['A', 'A-1', 'A-1-1'],
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toBeNull();
  });

  it('先頭行は新しいノードを作らずに再利用され、名称などの入力値を保持したまま親になる（44.4）', () => {
    const before = stateOf([
      item('A', { name: '直接仮設工事', amounts: { ESTIMATE: '1000' } }),
      item('B', { amounts: { ESTIMATE: '300' } }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A', 'B'] });

    const promoted = findItem(after.items, 'A');
    expect(promoted.id).toBe('A');
    expect(promoted.tempId).toBeNull();
    expect(promoted.itemType).toBe('STANDARD');
    expect(promoted.lines.map((entry) => entry.name)).toEqual([
      '直接仮設工事',
      '直接仮設工事',
      '直接仮設工事',
    ]);
  });

  it('keys は表示順で渡す契約であり、並べ替えずに先頭要素を親とする（44.4）', () => {
    const before = stateOf([item('A'), item('B')]);

    // 表示順は A → B だが、逆順で渡された場合は B が先頭行（＝親）として扱われる
    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['B', 'A'] });

    expect(keysOf(after.items)).toEqual(['B']);
    expect(keysOf(findItem(after.items, 'B').children)).toEqual(['A']);
  });

  it('明細に存在しないキーは取り除かれ、残った先頭行が親になる（44.4）', () => {
    const before = stateOf([item('A'), item('B'), item('C')]);

    const after = estimateEditReducer(before, {
      type: 'indentRange',
      keys: ['MISSING', 'A', 'B'],
    });

    expect(keysOf(after.items)).toEqual(['A', 'C']);
    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['B']);
    expect(after.lastError).toBeNull();
  });

  it('重複して指定されたキーは1度だけ子に配置する（44.4）', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A', 'B', 'B'] });

    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['B']);
  });

  it('単一行の選択では直前の兄弟の子になる（12.6, 23.10）', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['B'] });

    expect(keysOf(after.items)).toEqual(['A']);
    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['B']);
  });

  it('単一行の選択では部分木ごと直前の兄弟の子になる（12.6, 23.10）', () => {
    const before = stateOf([
      item('P', { children: [item('C1'), item('C2', { children: [item('C2-1')] })] }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['C2'] });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1']);
    expect(keysOf(findItem(after.items, 'C1').children)).toEqual(['C2']);
    expect(keysOf(findItem(after.items, 'C2').children)).toEqual(['C2-1']);
  });

  it('直前の兄弟が無い行は状態を変更せずエラー情報を返す（23.10）', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'NO_PRECEDING_SIBLING', key: 'A' });
  });

  it('先頭行が値引き行の場合は状態を変更せず操作を無効化する（41.3）', () => {
    const before = stateOf([singleLineItem('D', 'DISCOUNT'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['D', 'B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({
      kind: 'INVALID_PARENT_TYPE',
      key: 'D',
      itemType: 'DISCOUNT',
    });
  });

  it('先頭行が注記行の場合は状態を変更せず操作を無効化する（55.1）', () => {
    const before = stateOf([singleLineItem('N', 'NOTE'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['N', 'B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'INVALID_PARENT_TYPE', key: 'N', itemType: 'NOTE' });
  });

  it('単一行の選択でも直前の兄弟が注記行なら状態を変更せず無効化する（55.1）', () => {
    const before = stateOf([singleLineItem('N', 'NOTE'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'INVALID_PARENT_TYPE', key: 'N', itemType: 'NOTE' });
  });

  it('単一行の選択でも直前の兄弟が値引き行なら状態を変更せず無効化する（41.3）', () => {
    const before = stateOf([singleLineItem('D', 'DISCOUNT'), item('B')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({
      kind: 'INVALID_PARENT_TYPE',
      key: 'D',
      itemType: 'DISCOUNT',
    });
  });

  it('注記行自身は直前の兄弟の配下へ階層移動できる（55.3）', () => {
    const before = stateOf([item('A'), singleLineItem('N', 'NOTE')]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['N'] });

    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['N']);
    expect(after.lastError).toBeNull();
  });

  /**
   * @requirement estimate-creation/REQ-44.7 階層の上げ下げによって項目が自身または自身の子孫の子になる場合は操作を行わない
   */
  it('先頭行の祖先を先頭行の子にする指定は状態を変更せずエラー情報を返す（44.7）', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A-1', 'A'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'CYCLIC_MOVE', key: 'A' });
  });

  it('階層を下げた後に祖先の集計金額を再計算する（43.5）', () => {
    const before = stateOf([
      item('A', { amounts: { ESTIMATE: '1000' } }),
      item('B', { amounts: { ESTIMATE: '300' } }),
      item('C', { amounts: { ESTIMATE: '200' } }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['A', 'B', 'C'] });

    expect(amountOf(findItem(after.items, 'A'))).toBe('500');
  });

  it('注記行を配下へ移しても再計算後の親の集計金額に加算しない（43.5, 55.2）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1000' },
        children: [item('C1', { amounts: { ESTIMATE: '1000' } })],
      }),
      singleLineItem('N', 'NOTE', { amount: '9999' }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['P', 'N'] });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1', 'N']);
    expect(amountOf(findItem(after.items, 'P'))).toBe('1000');
  });

  it('子が注記行だけになる項目は再計算後も自身の金額を保持する（43.5, 55.2）', () => {
    const before = stateOf([
      item('P', { amounts: { ESTIMATE: '1500' } }),
      singleLineItem('N', 'NOTE', { amount: '9999' }),
    ]);

    const after = estimateEditReducer(before, { type: 'indentRange', keys: ['P', 'N'] });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['N']);
    expect(amountOf(findItem(after.items, 'P'))).toBe('1500');
  });
});

// ============================================================================
// outdentRange（12.6, 23.9, 44.3, 44.5, 44.6, 55.3）
// ============================================================================

describe('estimateEditReducer / outdentRange', () => {
  it('選択行を現在の親項目の兄弟レベルへ移動する（23.9, 44.5）', () => {
    const before = stateOf([item('P', { children: [item('C1'), item('C2')] })]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C2'] });

    expect(keysOf(after.items)).toEqual(['P', 'C2']);
    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1']);
    expect(after.isDirty).toBe(true);
    expect(after.lastError).toBeNull();
  });

  it('複数行をまとめて親項目の直後へ順に配置する（44.3, 44.5）', () => {
    const before = stateOf([item('P', { children: [item('C1'), item('C2'), item('C3')] })]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C1', 'C2'] });

    expect(keysOf(after.items)).toEqual(['P', 'C1', 'C2']);
    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C3']);
  });

  it('深い階層では祖父項目の子として親項目の直後へ配置する（12.6, 44.5）', () => {
    const before = stateOf(deepTree());

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['A-1-1'] });

    expect(keysOf(findItem(after.items, 'A').children)).toEqual(['A-1', 'A-1-1']);
    expect(findItem(after.items, 'A-1').children).toEqual([]);
    expect(keysOf(findItem(after.items, 'A-1-1').children)).toEqual(['A-1-1-1']);
  });

  it('異なる親をまたぐ選択ではそれぞれの親項目の直後へ移動する（44.3, 44.5）', () => {
    const before = stateOf([
      item('R', {
        children: [item('P', { children: [item('C1')] }), item('Q', { children: [item('C2')] })],
      }),
    ]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C1', 'C2'] });

    expect(keysOf(findItem(after.items, 'R').children)).toEqual(['P', 'C1', 'Q', 'C2']);
  });

  it('選択に祖先と子孫が混在する場合、子孫は部分木として一緒に移動する（44.3）', () => {
    const before = stateOf([
      item('R', { children: [item('P', { children: [item('B', { children: [item('B1')] })] })] }),
    ]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['B', 'B1'] });

    expect(keysOf(findItem(after.items, 'R').children)).toEqual(['P', 'B']);
    expect(findItem(after.items, 'P').children).toEqual([]);
    expect(keysOf(findItem(after.items, 'B').children)).toEqual(['B1']);
  });

  it('ルートレベルの行は状態を変更せず操作を無効化する（44.6）', () => {
    const before = stateOf([item('A'), item('B')]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'CANNOT_OUTDENT_ROOT' });
  });

  it('選択にルートレベルの行が混ざる場合は操作全体を実行しない（44.6）', () => {
    const before = stateOf([item('P', { children: [item('C')] }), item('B')]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C', 'B'] });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
    expect(after.lastError).toEqual({ kind: 'CANNOT_OUTDENT_ROOT' });
  });

  it('明細に存在しないキーは取り除かれ、残った行だけを移動する（44.5）', () => {
    const before = stateOf([item('P', { children: [item('C1'), item('C2')] })]);

    const after = estimateEditReducer(before, {
      type: 'outdentRange',
      keys: ['MISSING', 'C2'],
    });

    expect(keysOf(after.items)).toEqual(['P', 'C2']);
    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1']);
    expect(after.lastError).toBeNull();
  });

  it('重複して指定されたキーでも1度だけ移動する（44.5）', () => {
    const before = stateOf([item('P', { children: [item('C1'), item('C2')] })]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C2', 'C2'] });

    expect(keysOf(after.items)).toEqual(['P', 'C2']);
  });

  it('注記行も階層移動の対象とする（55.3）', () => {
    const before = stateOf([item('P', { children: [item('C'), singleLineItem('N', 'NOTE')] })]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['N'] });

    expect(keysOf(after.items)).toEqual(['P', 'N']);
    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C']);
  });

  it('階層を上げた後に祖先の集計金額を再計算する（43.5）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1500' },
        children: [
          item('Q', {
            amounts: { ESTIMATE: '1500' },
            children: [
              item('C1', { amounts: { ESTIMATE: '1000' } }),
              item('C2', { amounts: { ESTIMATE: '500' } }),
            ],
          }),
        ],
      }),
    ]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C2'] });

    expect(amountOf(findItem(after.items, 'Q'))).toBe('1000');
    expect(amountOf(findItem(after.items, 'P'))).toBe('1500');
  });

  it('親に残った注記行を再計算後の集計金額に加算しない（43.5, 55.2）', () => {
    const before = stateOf([
      item('P', {
        amounts: { ESTIMATE: '1500' },
        children: [
          item('C1', { amounts: { ESTIMATE: '1000' } }),
          item('C2', { amounts: { ESTIMATE: '500' } }),
          singleLineItem('N', 'NOTE', { amount: '9999' }),
        ],
      }),
    ]);

    const after = estimateEditReducer(before, { type: 'outdentRange', keys: ['C2'] });

    expect(keysOf(findItem(after.items, 'P').children)).toEqual(['C1', 'N']);
    expect(amountOf(findItem(after.items, 'P'))).toBe('1000');
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

// ============================================================================
// 転記・計算結果の適用（55.2）
//
// Requirements (estimate-creation):
// - 4.6: 転記結果を未保存の変更として編集中の内容に反映する
// - 7.7 / 8.7 / 9.7: 諸経費行の追加を未保存の変更として扱う
// - 41.11: 値引き行の追加を未保存の変更として扱う
// - 49.1: 5操作の結果を未保存の変更として編集中の明細に反映する
// - 49.2: 明細の再取得を行わず、それまでの未保存の編集内容を保持する
// - 49.3: 実行の時点でデータベースへの書き込みを行わない（純粋関数）
// - 49.4: 反映結果を1回の保存操作で確定する
// - 49.8: これらの変更を取り消し可能とする
// ============================================================================

/** 行タイプごとに値を指定できる3行1セットの項目 */
function detailedItem(
  id: string,
  lines: Partial<Record<EstimateLineType, Partial<EditableLine>>>,
  overrides: {
    readonly itemType?: EstimateEditItemType;
    readonly children?: readonly EditableItem[];
    readonly temporary?: boolean;
  } = {}
): EditableItem {
  const temporary = overrides.temporary ?? false;
  return {
    id: temporary ? null : id,
    tempId: temporary ? (id as TempId) : null,
    itemType: overrides.itemType ?? 'STANDARD',
    lines: (['ESTIMATE', 'EXECUTION', 'VENDOR'] as const).map((lineType) =>
      line(lineType, lines[lineType] ?? {})
    ),
    children: overrides.children ?? [],
  };
}

function lineOf(target: EditableItem, lineType: EstimateLineType): EditableLine {
  const found = target.lines.find((entry) => entry.lineType === lineType);
  if (found === undefined) {
    throw new Error(`テスト用項目に ${lineType} 行が存在しません`);
  }
  return found;
}

// ----------------------------------------------------------------------------
// applyQuotationTransfer（4.1, 4.2, 4.3, 4.4, 4.6, 30.1, 30.3）
//
// 55.5 の裁定: 転記ダイアログの転記先は「新規項目として作成」(30.1) と
// 「＜既存項目名＞の子項目として作成」(30.2) の2種のみで、既存の業者金額行を
// 上書きする選択肢は存在しない。したがって `parentKey` は**転記項目を作る親**を
// 指し（30.3 / design.md :2337-2339「当該項目のparentIdに選択した既存項目IDを
// 設定して転記」）、選択した明細行はすべて新規の見積項目になる（4.4）。
// ----------------------------------------------------------------------------

describe('estimateEditReducer / applyQuotationTransfer', () => {
  /** 数量 2.5 × 単価 333 = 832.5 → 小数第1位で四捨五入して 833（22.3, 22.9） */
  const TRANSFER_LINE = {
    name: '鉄筋工事',
    specification: 'SD295',
    unit: 'm2',
    quantity: '2.5',
    unitPrice: '333',
  } as const;

  const SECOND_LINE = {
    name: '型枠工事',
    specification: null,
    unit: '式',
    quantity: '1',
    unitPrice: '5000',
  } as const;

  it('転記先を指定しない場合は明細行ごとにルートレベルの新規項目を作りその業者金額行へ反映する (4.2, 4.3, 4.4, 30.1)', () => {
    const reducer = deterministicReducer();
    const before = stateOf([detailedItem('A', {})]);

    const after = reducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: null, vendorName: 'V社', lines: [TRANSFER_LINE, SECOND_LINE] },
    });

    expect(keysOf(after.items)).toEqual(['A', 'tmp-t1', 'tmp-t2']);

    const created = findItem(after.items, 'tmp-t1');
    expect(created.id).toBeNull();
    expect(created.itemType).toBe('STANDARD');
    expect(created.lines.map((entry) => entry.lineType)).toEqual([
      'ESTIMATE',
      'EXECUTION',
      'VENDOR',
    ]);
    const vendor = lineOf(created, 'VENDOR');
    expect(vendor.name).toBe('鉄筋工事');
    expect(vendor.specification).toBe('SD295');
    expect(vendor.unit).toBe('m2');
    expect(vendor.quantity).toBe('2.5');
    expect(vendor.unitPrice).toBe('333');
    expect(vendor.amount).toBe('833');
    expect(vendor.sourceVendorName).toBe('V社');
    // 4.3 は名称・規格・単位・数量・単価のみを転記対象とする（備考は対象外）
    expect(vendor.remarks).toBeNull();
    // 見積金額行・実行金額行は空のまま（転記対象は業者金額行のみ）
    expect(lineOf(created, 'ESTIMATE').name).toBeNull();
    expect(lineOf(created, 'EXECUTION').unitPrice).toBeNull();

    const second = findItem(after.items, 'tmp-t2');
    expect(lineOf(second, 'VENDOR').name).toBe('型枠工事');
    expect(lineOf(second, 'VENDOR').amount).toBe('5000');
    expect(after.isDirty).toBe(true);
  });

  it('転記先を指定すると選択した明細行がすべてその項目の子項目になる (30.3, 4.4)', () => {
    const reducer = deterministicReducer();
    const before = stateOf([detailedItem('A', {}), detailedItem('B', {})]);

    const after = reducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'B', vendorName: 'V社', lines: [TRANSFER_LINE, SECOND_LINE] },
    });

    // ルートは増えず、選択した2行はいずれも B の子になる
    expect(keysOf(after.items)).toEqual(['A', 'B']);
    expect(keysOf(findItem(after.items, 'B').children)).toEqual(['tmp-t1', 'tmp-t2']);
    expect(lineOf(findItem(after.items, 'tmp-t1'), 'VENDOR').name).toBe('鉄筋工事');
    expect(lineOf(findItem(after.items, 'tmp-t2'), 'VENDOR').name).toBe('型枠工事');
  });

  it('転記先の既存の見積金額行・実行金額行・業者金額行の入力値を上書きしない (30.3)', () => {
    const before = stateOf([
      detailedItem('B', {
        ESTIMATE: { name: '既存の見積', unitPrice: '9999', amount: '9999' },
        EXECUTION: { name: '既存の実行', unitPrice: '8888', amount: '8888' },
        VENDOR: { name: '既存の業者', remarks: '手入力の備考' },
      }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'B', vendorName: 'V', lines: [TRANSFER_LINE] },
    });

    const target = findItem(after.items, 'B');
    expect(lineOf(target, 'ESTIMATE').name).toBe('既存の見積');
    expect(lineOf(target, 'EXECUTION').name).toBe('既存の実行');
    expect(lineOf(target, 'VENDOR').name).toBe('既存の業者');
    expect(lineOf(target, 'VENDOR').remarks).toBe('手入力の備考');
  });

  it('ネストした転記先を指定した場合もルート直下ではなくその子として追加する (30.3)', () => {
    const reducer = deterministicReducer();
    const before = stateOf([
      detailedItem('P', {}, { children: [detailedItem('C', {})] }),
      detailedItem('Q', {}),
    ]);

    const after = reducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'C', vendorName: 'V', lines: [TRANSFER_LINE, SECOND_LINE] },
    });

    expect(keysOf(after.items)).toEqual(['P', 'Q']);
    expect(keysOf(findItem(after.items, 'C').children)).toEqual(['tmp-t1', 'tmp-t2']);
  });

  it('転記先の子として追加した金額が先祖の業者金額行へ集計される (2.3, 43.5)', () => {
    const before = stateOf([detailedItem('P', { VENDOR: { amount: '0' } })]);

    const after = estimateEditReducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'P', vendorName: 'V', lines: [TRANSFER_LINE, SECOND_LINE] },
    });

    expect(lineOf(findItem(after.items, 'P'), 'VENDOR').amount).toBe('5833');
  });

  it('未保存の新規項目を転記先に指定できる (30.4, 49.7)', () => {
    const reducer = deterministicReducer();
    const before = stateOf([detailedItem('tmp-new', {}, { temporary: true })]);

    const after = reducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'tmp-new', vendorName: 'V', lines: [TRANSFER_LINE] },
    });

    expect(keysOf(findItem(after.items, 'tmp-new').children)).toEqual(['tmp-t1']);
    expect(lineOf(findItem(after.items, 'tmp-t1'), 'VENDOR').name).toBe('鉄筋工事');
  });

  it('存在しない転記先を指定した場合は明細を変更しない', () => {
    const before = stateOf([detailedItem('A', {})]);

    const after = estimateEditReducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'missing', vendorName: 'V', lines: [TRANSFER_LINE] },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it.each(['DISCOUNT', 'NOTE'] as const)(
    '子を持てない%s行を転記先に指定した場合は転記せず拒否する (41.3)',
    (itemType) => {
      const before = stateOf([singleLineItem('X', itemType)]);

      const after = estimateEditReducer(before, {
        type: 'applyQuotationTransfer',
        payload: { parentKey: 'X', vendorName: 'V', lines: [TRANSFER_LINE] },
      });

      expect(after.items).toBe(before.items);
      expect(after.isDirty).toBe(false);
      expect(after.lastError).toEqual({ kind: 'INVALID_PARENT_TYPE', key: 'X', itemType });
    }
  );

  it('転記元の明細行が空の場合は明細を変更しない', () => {
    const before = stateOf([detailedItem('A', {})]);

    const after = estimateEditReducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: null, vendorName: 'V', lines: [] },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('入力の state を変更しない（49.3: 書き込みを伴わない純粋な遷移）', () => {
    const before = stateOf([detailedItem('A', {})]);
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;

    estimateEditReducer(before, {
      type: 'applyQuotationTransfer',
      payload: { parentKey: 'A', vendorName: 'V', lines: [TRANSFER_LINE] },
    });

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });
});

// ----------------------------------------------------------------------------
// applyNetAllocation（5.2, 5.3, 5.4, 5.5, 5.9, 41.9, 55.4）
// ----------------------------------------------------------------------------

describe('estimateEditReducer / applyNetAllocation', () => {
  function allocationTree(): readonly EditableItem[] {
    return [
      detailedItem('A', {
        VENDOR: {
          name: '仮設工事',
          specification: '一式',
          unit: '式',
          quantity: '10',
          unitPrice: '30000',
          amount: '300000',
        },
      }),
      detailedItem('B', {
        VENDOR: {
          name: '土工事',
          specification: 'GL-1.5m',
          unit: 'm3',
          quantity: '7',
          unitPrice: '100000',
          amount: '700000',
        },
      }),
    ];
  }

  it('NET金額を業者金額の比率で案分し実行金額行へ単価と金額を反映する (5.3, 5.4, 5.5)', () => {
    const before = stateOf(allocationTree());

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'B'], netAmount: '900000' },
    });

    const a = lineOf(findItem(after.items, 'A'), 'EXECUTION');
    expect(a.unitPrice).toBe('27000');
    expect(a.amount).toBe('270000');
    // 名称・規格・単位・数量は業者金額行から複写する（5.3）
    expect(a.name).toBe('仮設工事');
    expect(a.specification).toBe('一式');
    expect(a.unit).toBe('式');
    expect(a.quantity).toBe('10');

    const b = lineOf(findItem(after.items, 'B'), 'EXECUTION');
    expect(b.unitPrice).toBe('90000');
    expect(b.amount).toBe('630000');
    expect(after.isDirty).toBe(true);
  });

  it('案分金額を小数第1位で四捨五入し、数量ゼロの行は案分金額を単価とする (22.4, 22.5)', () => {
    const before = stateOf([
      detailedItem('A', { VENDOR: { quantity: '3', amount: '1' } }),
      detailedItem('B', { VENDOR: { quantity: '0', amount: '2' } }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'B'], netAmount: '100' },
    });

    // 100 × 1/3 = 33.333… → 33、33 ÷ 3 = 11
    expect(lineOf(findItem(after.items, 'A'), 'EXECUTION').amount).toBe('33');
    expect(lineOf(findItem(after.items, 'A'), 'EXECUTION').unitPrice).toBe('11');
    // 100 × 2/3 = 66.666… → 67、数量ゼロのため案分金額をそのまま単価とする
    expect(lineOf(findItem(after.items, 'B'), 'EXECUTION').amount).toBe('67');
    expect(lineOf(findItem(after.items, 'B'), 'EXECUTION').unitPrice).toBe('67');
  });

  it('除外指定した行は実行金額行を変更せず、案分の母数からも外れる (5.2)', () => {
    const before = stateOf(allocationTree());

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'B'], excludeKeys: ['B'], netAmount: '900000' },
    });

    // Bを除いた母数（300000）に対する比率1.0で全額がAへ案分される
    expect(lineOf(findItem(after.items, 'A'), 'EXECUTION').amount).toBe('900000');
    expect(lineOf(findItem(after.items, 'A'), 'EXECUTION').unitPrice).toBe('90000');
    expect(lineOf(findItem(after.items, 'B'), 'EXECUTION')).toEqual(
      lineOf(findItem(before.items, 'B'), 'EXECUTION')
    );
  });

  /**
   * @requirement estimate-creation/REQ-55.4 注記行をNET金額案分および利益率適用の対象外とする
   */
  it('値引き行・注記行は案分の対象にも母数にも含めない (41.9, 55.4)', () => {
    // 構造上は業者金額行を持たないが、防御的に3行を持つ形で指定しても除外されること
    const before = stateOf([
      detailedItem('A', { VENDOR: { quantity: '1', amount: '300000' } }),
      detailedItem('D', { VENDOR: { quantity: '1', amount: '700000' } }, { itemType: 'DISCOUNT' }),
      detailedItem('N', { VENDOR: { quantity: '1', amount: '700000' } }, { itemType: 'NOTE' }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'D', 'N'], netAmount: '900000' },
    });

    // 母数がAの300000のみなら全額がAへ案分される
    expect(lineOf(findItem(after.items, 'A'), 'EXECUTION').amount).toBe('900000');
    expect(lineOf(findItem(after.items, 'D'), 'EXECUTION').amount).toBeNull();
    expect(lineOf(findItem(after.items, 'N'), 'EXECUTION').amount).toBeNull();
  });

  it('未保存の新規行（一時識別子）も案分対象に含める (5.9, 49.7)', () => {
    const before = stateOf([
      detailedItem('A', { VENDOR: { quantity: '1', amount: '300000' } }),
      detailedItem('tmp-new', { VENDOR: { quantity: '1', amount: '700000' } }, { temporary: true }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'tmp-new'], netAmount: '1000000' },
    });

    expect(lineOf(findItem(after.items, 'tmp-new'), 'EXECUTION').amount).toBe('700000');
    expect(lineOf(findItem(after.items, 'tmp-new'), 'EXECUTION').unitPrice).toBe('700000');
  });

  it('子項目への案分後も親項目の実行金額が子の合計と一致する (43.5, 55.1申し送り)', () => {
    const before = stateOf([
      detailedItem(
        'P',
        {},
        {
          children: [
            detailedItem('C1', { VENDOR: { quantity: '1', amount: '300000' } }),
            detailedItem('C2', { VENDOR: { quantity: '1', amount: '700000' } }),
          ],
        }
      ),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['C1', 'C2'], netAmount: '900000' },
    });

    expect(lineOf(findItem(after.items, 'P'), 'EXECUTION').amount).toBe('900000');
    // ルート階層のみを合計する `summarize` が葉の合計と一致する（55.1 の前提を崩さない）
    expect(summarize(after.items).executionTotal.toString()).toBe('900000');
  });

  it('対象が1件も解決できない場合は明細を変更しない', () => {
    const before = stateOf(allocationTree());

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['missing'], netAmount: '900000' },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('NET金額が数値でない場合は明細を変更しない', () => {
    const before = stateOf(allocationTree());

    const after = estimateEditReducer(before, {
      type: 'applyNetAllocation',
      payload: { targetKeys: ['A', 'B'], netAmount: '' },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// applyProfitRate（6.1, 6.2, 6.3, 6.4, 6.7, 6.9, 41.9, 55.4）
// ----------------------------------------------------------------------------

describe('estimateEditReducer / applyProfitRate', () => {
  /** 実行単価 1000 × (1 + 12.27/100) = 1122.7 → 四捨五入して 1123（22.6） */
  function profitTree(): readonly EditableItem[] {
    return [
      detailedItem('A', {
        ESTIMATE: { name: '見積の名称', quantity: '2', unitPrice: null, amount: null },
        EXECUTION: {
          name: '実行の名称',
          specification: '実行の規格',
          unit: '式',
          quantity: '3',
          unitPrice: '1000',
          amount: '3000',
        },
      }),
    ];
  }

  it('すべて上書きで名称・規格・単位・数量・単価を見積金額行へ反映する (6.2, 22.6)', () => {
    const before = stateOf(profitTree());

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'all' },
    });

    const estimate = lineOf(findItem(after.items, 'A'), 'ESTIMATE');
    expect(estimate.unitPrice).toBe('1123');
    expect(estimate.amount).toBe('3369');
    expect(estimate.name).toBe('実行の名称');
    expect(estimate.specification).toBe('実行の規格');
    expect(estimate.unit).toBe('式');
    expect(estimate.quantity).toBe('3');
    expect(after.isDirty).toBe(true);
  });

  it('単価のみ上書きでは単価と金額だけを更新し名称・数量を残す (6.4)', () => {
    const before = stateOf(profitTree());

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'unit_price_only' },
    });

    const estimate = lineOf(findItem(after.items, 'A'), 'ESTIMATE');
    expect(estimate.unitPrice).toBe('1123');
    // 金額は見積金額行の数量（2）× 新しい単価
    expect(estimate.amount).toBe('2246');
    expect(estimate.name).toBe('見積の名称');
    expect(estimate.quantity).toBe('2');
  });

  it('空の場合のみ上書きは編集中の見積単価が入っている行を変更しない (6.3, 6.7)', () => {
    const before = stateOf([
      detailedItem('FILLED', {
        ESTIMATE: { name: '手入力済み', quantity: '2', unitPrice: '500', amount: '1000' },
        EXECUTION: { name: '実行', quantity: '3', unitPrice: '1000', amount: '3000' },
      }),
      detailedItem('EMPTY', {
        ESTIMATE: { name: null, quantity: null, unitPrice: null, amount: null },
        EXECUTION: { name: '実行', quantity: '3', unitPrice: '1000', amount: '3000' },
      }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'empty_only' },
    });

    expect(lineOf(findItem(after.items, 'FILLED'), 'ESTIMATE')).toEqual(
      lineOf(findItem(before.items, 'FILLED'), 'ESTIMATE')
    );
    expect(lineOf(findItem(after.items, 'EMPTY'), 'ESTIMATE').unitPrice).toBe('1123');
    expect(lineOf(findItem(after.items, 'EMPTY'), 'ESTIMATE').amount).toBe('3369');
  });

  it('実行金額行の単価が未設定の行は見積金額行を変更しない', () => {
    const before = stateOf([
      detailedItem('A', {
        ESTIMATE: { name: '見積', unitPrice: null },
        EXECUTION: { unitPrice: null, quantity: '3' },
      }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'all' },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('対象を指定しない場合は入れ子の項目も含めて全実行金額行へ適用する (6.1)', () => {
    const before = stateOf([
      detailedItem(
        'P',
        { EXECUTION: { quantity: '1', unitPrice: '1000' } },
        {
          children: [
            detailedItem('C', { EXECUTION: { quantity: '2', unitPrice: '1000', amount: '2000' } }),
          ],
        }
      ),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'all' },
    });

    expect(lineOf(findItem(after.items, 'C'), 'ESTIMATE').unitPrice).toBe('1123');
    expect(lineOf(findItem(after.items, 'C'), 'ESTIMATE').amount).toBe('2246');
    // 親項目の金額は子の合計で上書きされる（2.3, 43.5）
    expect(lineOf(findItem(after.items, 'P'), 'ESTIMATE').amount).toBe('2246');
  });

  it('対象を指定した場合は指定外の項目を変更しない (6.9)', () => {
    const before = stateOf([
      detailedItem('A', { EXECUTION: { quantity: '1', unitPrice: '1000' } }),
      detailedItem('B', { EXECUTION: { quantity: '1', unitPrice: '1000' } }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { targetKeys: ['A'], rate: '12.27', overwriteOption: 'all' },
    });

    expect(lineOf(findItem(after.items, 'A'), 'ESTIMATE').unitPrice).toBe('1123');
    expect(lineOf(findItem(after.items, 'B'), 'ESTIMATE').unitPrice).toBeNull();
  });

  it('値引き行・注記行は利益率適用の対象に含めない (41.9, 55.4)', () => {
    const before = stateOf([
      detailedItem(
        'D',
        { EXECUTION: { quantity: '1', unitPrice: '1000' }, ESTIMATE: { unitPrice: '-5000' } },
        { itemType: 'DISCOUNT' }
      ),
      detailedItem('N', { EXECUTION: { quantity: '1', unitPrice: '1000' } }, { itemType: 'NOTE' }),
    ]);

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: '12.27', overwriteOption: 'all' },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });

  it('利益率が数値でない場合は明細を変更しない', () => {
    const before = stateOf(profitTree());

    const after = estimateEditReducer(before, {
      type: 'applyProfitRate',
      payload: { rate: 'abc', overwriteOption: 'all' },
    });

    expect(after.items).toBe(before.items);
    expect(after.isDirty).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// addOverheadItem（7.1, 7.7, 8.1, 8.7, 9.1, 9.7）
// ----------------------------------------------------------------------------

describe('estimateEditReducer / addOverheadItem', () => {
  it.each([
    ['COMMON_TEMPORARY', '共通仮設費'],
    ['SITE_MANAGEMENT', '現場管理費'],
    ['GENERAL_ADMIN', '一般管理費'],
  ] as const)('%s のプリセット値で見積金額行を構成する (7.1, 8.1, 9.1)', (costType, name) => {
    const after = estimateEditReducer(stateOf([]), {
      type: 'addOverheadItem',
      payload: { costType },
    });

    const created = after.items[0]!;
    const estimate = lineOf(created, 'ESTIMATE');
    expect(estimate.name).toBe(name);
    expect(estimate.specification).toBe('');
    expect(estimate.unit).toBe('式');
    expect(estimate.quantity).toBe('1');
    expect(estimate.unitPrice).toBeNull();
    expect(estimate.amount).toBeNull();
  });

  it('ルートレベルの末尾へ3行1セットの未保存項目として追加する (7.7, 43.1)', () => {
    const reducer = deterministicReducer();
    const before = stateOf([detailedItem('A', {})]);

    const after = reducer(before, {
      type: 'addOverheadItem',
      payload: { costType: 'SITE_MANAGEMENT', unitPrice: '1234567' },
    });

    expect(keysOf(after.items)).toEqual(['A', 'tmp-t1']);
    const created = findItem(after.items, 'tmp-t1');
    expect(created.id).toBeNull();
    expect(created.itemType).toBe('STANDARD');
    expect(created.lines.map((entry) => entry.lineType)).toEqual([
      'ESTIMATE',
      'EXECUTION',
      'VENDOR',
    ]);
    expect(after.isDirty).toBe(true);
  });

  it('単価を渡すと数量1との積で金額を自動計算する (8.7, 22.9)', () => {
    const after = estimateEditReducer(stateOf([]), {
      type: 'addOverheadItem',
      payload: { costType: 'GENERAL_ADMIN', unitPrice: '1234567' },
    });

    const estimate = lineOf(after.items[0]!, 'ESTIMATE');
    expect(estimate.unitPrice).toBe('1234567');
    expect(estimate.amount).toBe('1234567');
  });

  it('実行金額行・業者金額行は空のまま追加する (9.1)', () => {
    const after = estimateEditReducer(stateOf([]), {
      type: 'addOverheadItem',
      payload: { costType: 'COMMON_TEMPORARY', unitPrice: '100' },
    });

    expect(lineOf(after.items[0]!, 'EXECUTION').name).toBeNull();
    expect(lineOf(after.items[0]!, 'EXECUTION').amount).toBeNull();
    expect(lineOf(after.items[0]!, 'VENDOR').amount).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// 適用後も未保存の編集内容が保持される（49.2, 49.4）
// ----------------------------------------------------------------------------

describe('estimateEditReducer / 適用と未保存の編集内容の共存', () => {
  it('セル編集の後に転記・案分・利益率・諸経費・値引きを適用しても編集内容が残る (49.2, 49.4)', () => {
    const reducer = deterministicReducer();

    // 未保存のセル編集
    const edited = reducer(stateOf([detailedItem('A', {})]), {
      type: 'updateLineField',
      key: 'A',
      lineType: 'VENDOR',
      field: 'quantity',
      value: '4',
    });
    expect(edited.isDirty).toBe(true);

    const applied = [
      {
        type: 'applyQuotationTransfer',
        payload: {
          parentKey: null,
          vendorName: 'V',
          lines: [
            { name: '転記', specification: null, unit: '式', quantity: '1', unitPrice: '10' },
          ],
        },
      },
      { type: 'applyNetAllocation', payload: { targetKeys: ['A'], netAmount: '500' } },
      {
        type: 'applyProfitRate',
        payload: { targetKeys: ['A'], rate: '10', overwriteOption: 'all' },
      },
      { type: 'addOverheadItem', payload: { costType: 'COMMON_TEMPORARY', unitPrice: '100' } },
      { type: 'insertDiscountRow' },
    ] satisfies readonly EstimateEditAction[];

    const final = applied.reduce((current, action) => reducer(current, action), edited);

    // 未保存のセル編集（数量4）は失われない
    expect(lineOf(findItem(final.items, 'A'), 'VENDOR').quantity).toBe('4');
    // 1回の保存で確定できるよう、未保存フラグは立ったまま
    expect(final.isDirty).toBe(true);
  });
});
