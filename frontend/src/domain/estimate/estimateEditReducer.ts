/**
 * @fileoverview estimateEditReducer - 見積明細の編集状態を遷移させる純粋関数
 *
 * 行の挿入・削除・複写・上下移動・ドラッグによる並び替え・セル値の更新・
 * 帳票用入力項目の更新を、サーバーへ問い合わせない副作用のない遷移として実装します。
 * UI・サーバーいずれにも依存しないドメイン層のモジュールであり、
 * components / hooks / pages / api / services からは import しません。
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加で新規の3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除で3行1セット全体を削除する
 * - 12.4: 親項目を削除した場合に子項目も含めて削除する（確認の提示はUIの責務）
 * - 12.5: 見積項目の複製で3行1セット全体を複製する
 * - 12.7: 上記すべての操作を編集セッション中にサーバーへ問い合わせずに行う
 * - 43.1: 行操作を保存を伴わずに反映する。新規行は識別子を持たず一時識別子で表現する
 * - 43.5: 行の追加・削除・階層変更で影響を受ける親項目の金額合計を即座に再計算する
 * - 43.6: 親項目を削除した場合にその子孫項目もあわせて取り除く
 * - 54.6 / 54.8: 帳票用入力項目を編集可能とし、変更を未保存の変更として扱う
 * - 41.2 / 41.3: 値引き行のプリセット値と見積金額行のみの構成
 * - 55.1 / 55.3: 注記行は名称のみを持ち、任意の階層の任意の位置に配置できる
 * - 22.3 / 22.9: 金額（数量×単価の自動計算結果）を小数第1位で四捨五入した整数で保持する
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateEditReducer`
 *
 * **純粋性**: すべての遷移は入力 state を変更せず、常に新しい state オブジェクトを返します
 * （design.md Postconditions「戻り値は新しいオブジェクト。入力 state を変更しない」）。
 * 操作が無効だった場合も新しい state オブジェクトを返しますが、`items` は同一参照のまま保ち、
 * `estimateTree` の同一性キャッシュと React の再描画判定を効かせます。
 *
 * **走査**: 階層の深さに上限を設けないため（2.5）、ツリーの再構築はすべて明示スタックの
 * 反復で行い再帰を用いません。
 *
 * @module domain/estimate/estimateEditReducer
 */

import Decimal from 'decimal.js';

import {
  descendantKeys,
  nodeKeyOf,
  recalculateAncestorAmounts,
  wouldCreateCycle,
} from './estimateTree';
import type {
  EditableItem,
  EditableLine,
  EditableLineField,
  EditError,
  EstimateEditAction,
  EstimateEditState,
  EstimateLineType,
  EstimateReportFields,
  NodeKey,
  TempId,
} from './estimateEditReducer.types';

// ============================================================================
// 定数
// ============================================================================

/** 通常項目が持つ3行1セットの行タイプ（12.1） */
const STANDARD_LINE_TYPES: readonly EstimateLineType[] = ['ESTIMATE', 'EXECUTION', 'VENDOR'];

/** 値引き行のプリセット値（41.2）。バックエンドの `DISCOUNT_PRESET` と同一 */
const DISCOUNT_PRESET = {
  name: '値引き',
  specification: '',
  unit: '式',
  quantity: '1',
} as const;

/** 帳票用入力項目の初期値（54.7: 未入力は空欄として扱う） */
export const EMPTY_REPORT_FIELDS: EstimateReportFields = Object.freeze({
  submissionDate: null,
  validityPeriod: null,
  separateWorks: Object.freeze([]) as readonly string[],
});

const EMPTY_ITEMS: readonly EditableItem[] = Object.freeze([]);

// ============================================================================
// 一時識別子の発番（43.1）
// ============================================================================

/** 一時識別子の発番関数 */
export type TempIdGenerator = () => TempId;

/** `estimateEditReducer` の構成 */
export interface EstimateEditReducerOptions {
  /** 一時識別子の発番関数。単体テストは決定的な発番を注入する */
  readonly generateTempId: TempIdGenerator;
}

let tempIdSequence = 0;

/**
 * 既定の一時識別子発番
 *
 * モジュール内の単調増加カウンタを用いる。乱数・時刻に依存しないため
 * 同一セッション内で衝突せず、テストからは発番関数の注入で完全に制御できる。
 */
const nextSequentialTempId: TempIdGenerator = () => {
  tempIdSequence += 1;
  return `tmp-${tempIdSequence}`;
};

// ============================================================================
// 初期状態
// ============================================================================

/**
 * 編集状態の初期値を作る
 *
 * @param items 明細ツリー（省略時は空）
 * @param reportFields 帳票用入力項目（省略時は未入力）
 */
export function createInitialEstimateEditState(
  items: readonly EditableItem[] = EMPTY_ITEMS,
  reportFields: EstimateReportFields = EMPTY_REPORT_FIELDS
): EstimateEditState {
  return { items, reportFields, isDirty: false, lastError: null };
}

// ============================================================================
// ツリー再構築の基本操作（明示スタックによる反復・再帰なし）
// ============================================================================

/**
 * 兄弟配列の変換関数
 *
 * 変化が無い場合は入力配列を同一参照で返すこと（下流のメモ化を効かせるため）。
 *
 * @param siblings 子の再構築が済んだ兄弟配列
 * @param parentKey 兄弟配列の親のキー。ルート直下は null
 */
type SiblingsTransform = (
  siblings: readonly EditableItem[],
  parentKey: NodeKey | null
) => readonly EditableItem[];

interface RebuildFrame {
  /** この枠が組み立てている子配列の持ち主。ルート配列は null */
  readonly owner: EditableItem | null;
  readonly parentKey: NodeKey | null;
  readonly source: readonly EditableItem[];
  readonly output: EditableItem[];
  index: number;
  changed: boolean;
}

/**
 * すべての兄弟配列に変換を適用してツリーを再構築する
 *
 * 後行順（子を先に確定）で走査するため、変換は常に子の再構築後の配列を受け取る。
 * 変化しなかった項目・部分木は同一参照のまま返す。
 *
 * @returns 変化が無い場合は入力ツリーを同一参照で返す
 */
function rebuildTree(
  tree: readonly EditableItem[],
  transform: SiblingsTransform
): readonly EditableItem[] {
  const stack: RebuildFrame[] = [
    { owner: null, parentKey: null, source: tree, output: [], index: 0, changed: false },
  ];
  let result: readonly EditableItem[] = tree;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      break;
    }

    const child = frame.source[frame.index];
    if (child !== undefined) {
      frame.index += 1;
      stack.push({
        owner: child,
        parentKey: nodeKeyOf(child),
        source: child.children,
        output: [],
        index: 0,
        changed: false,
      });
      continue;
    }

    stack.pop();
    const rebuiltChildren = frame.changed ? frame.output : frame.source;
    const nextChildren = transform(rebuiltChildren, frame.parentKey);

    const owner = frame.owner;
    if (owner === null) {
      result = nextChildren;
      continue;
    }

    const nextOwner =
      nextChildren === owner.children ? owner : { ...owner, children: nextChildren };
    const parentFrame = stack[stack.length - 1];
    if (parentFrame !== undefined) {
      parentFrame.output.push(nextOwner);
      if (nextOwner !== owner) {
        parentFrame.changed = true;
      }
    }
  }

  return result;
}

/** ツリー全体を先行順で走査し、条件に合う最初の項目を返す */
function findItem(tree: readonly EditableItem[], key: NodeKey): EditableItem | null {
  const stack: EditableItem[] = tree.slice().reverse();
  let current = stack.pop();
  while (current !== undefined) {
    if (nodeKeyOf(current) === key) {
      return current;
    }
    for (let at = current.children.length - 1; at >= 0; at -= 1) {
      const child = current.children[at];
      if (child !== undefined) {
        stack.push(child);
      }
    }
    current = stack.pop();
  }
  return null;
}

/** 指定項目の親のキーを返す（ルート直下は null）。存在しない場合は undefined */
function parentKeyOf(tree: readonly EditableItem[], key: NodeKey): NodeKey | null | undefined {
  interface Frame {
    readonly item: EditableItem;
    readonly parentKey: NodeKey | null;
  }
  const stack: Frame[] = tree
    .slice()
    .reverse()
    .map((item) => ({ item, parentKey: null }));

  let frame = stack.pop();
  while (frame !== undefined) {
    const currentKey = nodeKeyOf(frame.item);
    if (currentKey === key) {
      return frame.parentKey;
    }
    for (let at = frame.item.children.length - 1; at >= 0; at -= 1) {
      const child = frame.item.children[at];
      if (child !== undefined) {
        stack.push({ item: child, parentKey: currentKey });
      }
    }
    frame = stack.pop();
  }
  return undefined;
}

// ============================================================================
// 新規項目の生成（43.1）
// ============================================================================

function emptyLine(lineType: EstimateLineType): EditableLine {
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
  };
}

/** 3行1セットの通常項目を作る（12.1） */
function createStandardItem(tempId: TempId): EditableItem {
  return {
    id: null,
    tempId,
    itemType: 'STANDARD',
    lines: STANDARD_LINE_TYPES.map(emptyLine),
    children: [],
  };
}

/** 名称のみを持つ注記行を作る（55.1） */
function createNoteItem(tempId: TempId): EditableItem {
  return {
    id: null,
    tempId,
    itemType: 'NOTE',
    lines: [emptyLine('ESTIMATE')],
    children: [],
  };
}

/** プリセット値の値引き行を作る（41.2, 41.3） */
function createDiscountItem(tempId: TempId): EditableItem {
  return {
    id: null,
    tempId,
    itemType: 'DISCOUNT',
    lines: [
      {
        ...emptyLine('ESTIMATE'),
        name: DISCOUNT_PRESET.name,
        specification: DISCOUNT_PRESET.specification,
        unit: DISCOUNT_PRESET.unit,
        quantity: DISCOUNT_PRESET.quantity,
      },
    ],
    children: [],
  };
}

/**
 * 部分木を複写する（12.5）
 *
 * 複写後の項目はすべて識別子を持たず一時識別子のみを持つ（43.1）。
 * 一時識別子は先行順に発番する。
 */
function cloneSubtree(root: EditableItem, generateTempId: TempIdGenerator): EditableItem {
  interface CloneFrame {
    readonly source: EditableItem;
    readonly tempId: TempId;
    readonly output: EditableItem[];
    index: number;
  }

  const stack: CloneFrame[] = [{ source: root, tempId: generateTempId(), output: [], index: 0 }];
  let cloned: EditableItem | null = null;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      break;
    }

    const child = frame.source.children[frame.index];
    if (child !== undefined) {
      frame.index += 1;
      stack.push({ source: child, tempId: generateTempId(), output: [], index: 0 });
      continue;
    }

    stack.pop();
    const node: EditableItem = {
      id: null,
      tempId: frame.tempId,
      itemType: frame.source.itemType,
      lines: frame.source.lines.map((entry) => ({ ...entry, id: null })),
      children: frame.output,
    };

    const parentFrame = stack[stack.length - 1];
    if (parentFrame === undefined) {
      cloned = node;
    } else {
      parentFrame.output.push(node);
    }
  }

  if (cloned === null) {
    throw new Error('estimateEditReducer: 部分木の複写に失敗しました');
  }
  return cloned;
}

// ============================================================================
// 金額の自動計算（22.3, 22.9）
// ============================================================================

/**
 * 金額を単価×数量として求める（小数第1位で四捨五入した整数）
 *
 * 数量・単価のいずれかが未入力または数値でない場合は null を返す。
 * 既存の `EstimateCalculator.calculateAmount` と同一規則。
 * 段階3で `estimateCalculations.roundMoney` に集約される想定。
 */
function calculateLineAmount(quantity: string | null, unitPrice: string | null): string | null {
  if (quantity === null || quantity === '' || unitPrice === null || unitPrice === '') {
    return null;
  }
  try {
    return new Decimal(quantity)
      .mul(new Decimal(unitPrice))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toString();
  } catch {
    return null;
  }
}

// ============================================================================
// 遷移のヘルパ
// ============================================================================

/** 明細を変更せずエラー情報のみを更新した新しい state を返す */
function rejected(state: EstimateEditState, error: EditError): EstimateEditState {
  return { ...state, lastError: error };
}

/** 明細を変更しない（無効な指定・変化なし）新しい state を返す */
function unchanged(state: EstimateEditState): EstimateEditState {
  return { ...state, lastError: null };
}

/**
 * 明細を差し替えた新しい state を返す
 *
 * 祖先の集計金額を再計算し（43.5）、実際に変化した場合のみ未保存とする。
 */
function withItems(state: EstimateEditState, items: readonly EditableItem[]): EstimateEditState {
  if (items === state.items) {
    return unchanged(state);
  }
  const recalculated = recalculateAncestorAmounts(items);
  return { ...state, items: recalculated, isDirty: true, lastError: null };
}

/** 挿入位置を解決して兄弟配列へ差し込む変換を作る */
function insertTransform(
  parentKey: NodeKey | null,
  afterKey: NodeKey | null,
  newItem: EditableItem
): SiblingsTransform {
  return (siblings, currentParentKey) => {
    if (currentParentKey !== parentKey) {
      return siblings;
    }
    if (afterKey === null) {
      return [...siblings, newItem];
    }
    const at = siblings.findIndex((entry) => nodeKeyOf(entry) === afterKey);
    if (at < 0) {
      // 指定された基準行が同一階層に無い場合は末尾へ追加する
      return [...siblings, newItem];
    }
    return [...siblings.slice(0, at + 1), newItem, ...siblings.slice(at + 1)];
  };
}

/**
 * 挿入先の親を検証する
 *
 * 値引き行・注記行は子を持てない（41.3, 55.1）ため親に指定できない。
 *
 * @returns 検証に通れば null、通らなければ理由
 */
function validateInsertParent(
  state: EstimateEditState,
  parentKey: NodeKey | null
): { readonly rejection: EstimateEditState } | null {
  if (parentKey === null) {
    return null;
  }
  const parent = findItem(state.items, parentKey);
  if (parent === null) {
    return { rejection: unchanged(state) };
  }
  if (parent.itemType === 'DISCOUNT' || parent.itemType === 'NOTE') {
    return {
      rejection: rejected(state, {
        kind: 'INVALID_PARENT_TYPE',
        key: parentKey,
        itemType: parent.itemType,
      }),
    };
  }
  return null;
}

/** 項目を挿入する共通処理 */
function insertItem(
  state: EstimateEditState,
  parentKey: NodeKey | null,
  afterKey: NodeKey | null,
  newItem: EditableItem
): EstimateEditState {
  const invalid = validateInsertParent(state, parentKey);
  if (invalid !== null) {
    return invalid.rejection;
  }
  return withItems(state, rebuildTree(state.items, insertTransform(parentKey, afterKey, newItem)));
}

/**
 * 複写対象を、選択に含まれる祖先を持たないものだけに絞り込む
 *
 * 親と子孫が同時に選択された場合、子孫は親の複写に含まれるため二重に複写しない。
 */
function outermostKeys(
  tree: readonly EditableItem[],
  keys: readonly NodeKey[]
): readonly NodeKey[] {
  const selected = new Set<NodeKey>(keys);
  const covered = new Set<NodeKey>();
  for (const key of selected) {
    for (const descendant of descendantKeys(tree, key)) {
      if (selected.has(descendant)) {
        covered.add(descendant);
      }
    }
  }
  return keys.filter((key) => !covered.has(key));
}

// ============================================================================
// 各アクションの遷移
// ============================================================================

function applySetItems(
  state: EstimateEditState,
  items: readonly EditableItem[],
  reportFields: EstimateReportFields | undefined
): EstimateEditState {
  return {
    items: recalculateAncestorAmounts(items),
    reportFields: reportFields ?? state.reportFields,
    isDirty: false,
    lastError: null,
  };
}

function applyDeleteRows(state: EstimateEditState, keys: readonly NodeKey[]): EstimateEditState {
  if (keys.length === 0) {
    return unchanged(state);
  }
  const targets = new Set<NodeKey>(keys);

  // 部分木ごと取り除くため、子孫を個別に列挙する必要はない（43.6）
  const nextItems = rebuildTree(state.items, (siblings) => {
    if (!siblings.some((entry) => targets.has(nodeKeyOf(entry)))) {
      return siblings;
    }
    return siblings.filter((entry) => !targets.has(nodeKeyOf(entry)));
  });

  return withItems(state, nextItems);
}

function applyDuplicateRows(
  state: EstimateEditState,
  keys: readonly NodeKey[],
  generateTempId: TempIdGenerator
): EstimateEditState {
  if (keys.length === 0) {
    return unchanged(state);
  }
  const targets = new Set<NodeKey>(outermostKeys(state.items, keys));
  if (targets.size === 0) {
    return unchanged(state);
  }

  const nextItems = rebuildTree(state.items, (siblings) => {
    if (!siblings.some((entry) => targets.has(nodeKeyOf(entry)))) {
      return siblings;
    }
    const next: EditableItem[] = [];
    for (const entry of siblings) {
      next.push(entry);
      if (targets.has(nodeKeyOf(entry))) {
        next.push(cloneSubtree(entry, generateTempId));
      }
    }
    return next;
  });

  return withItems(state, nextItems);
}

function applyMoveRow(
  state: EstimateEditState,
  key: NodeKey,
  direction: 'up' | 'down'
): EstimateEditState {
  const nextItems = rebuildTree(state.items, (siblings) => {
    const at = siblings.findIndex((entry) => nodeKeyOf(entry) === key);
    if (at < 0) {
      return siblings;
    }
    const swapWith = direction === 'up' ? at - 1 : at + 1;
    const moving = siblings[at];
    const neighbour = siblings[swapWith];
    if (moving === undefined || neighbour === undefined) {
      // 先頭行の上移動・末尾行の下移動は何もしない
      return siblings;
    }
    const next = siblings.slice();
    next[at] = neighbour;
    next[swapWith] = moving;
    return next;
  });

  return withItems(state, nextItems);
}

function applyReorderByDnd(
  state: EstimateEditState,
  sourceKey: NodeKey,
  targetKey: NodeKey,
  position: 'before' | 'after'
): EstimateEditState {
  if (sourceKey === targetKey) {
    return unchanged(state);
  }

  const source = findItem(state.items, sourceKey);
  const newParentKey = parentKeyOf(state.items, targetKey);
  if (source === null || newParentKey === undefined) {
    return unchanged(state);
  }

  // 自身または子孫を親にする移動は認めない（44.7）
  if (wouldCreateCycle(state.items, [sourceKey], newParentKey)) {
    return rejected(state, { kind: 'CYCLIC_MOVE', key: sourceKey });
  }

  const nextItems = rebuildTree(state.items, (siblings, currentParentKey) => {
    const hasSource = siblings.some((entry) => nodeKeyOf(entry) === sourceKey);
    const isDestination = currentParentKey === newParentKey;
    if (!hasSource && !isDestination) {
      return siblings;
    }

    const without = hasSource
      ? siblings.filter((entry) => nodeKeyOf(entry) !== sourceKey)
      : siblings;
    if (!isDestination) {
      return without;
    }

    const at = without.findIndex((entry) => nodeKeyOf(entry) === targetKey);
    if (at < 0) {
      return without;
    }
    const insertAt = position === 'before' ? at : at + 1;
    return [...without.slice(0, insertAt), source, ...without.slice(insertAt)];
  });

  return withItems(state, nextItems);
}

function applyUpdateLineField(
  state: EstimateEditState,
  key: NodeKey,
  lineType: EstimateLineType,
  field: EditableLineField,
  value: string | null
): EstimateEditState {
  const nextItems = rebuildTree(state.items, (siblings) => {
    const at = siblings.findIndex((entry) => nodeKeyOf(entry) === key);
    const target = at < 0 ? undefined : siblings[at];
    if (target === undefined) {
      return siblings;
    }

    let lineChanged = false;
    const nextLines = target.lines.map((entry) => {
      if (entry.lineType !== lineType || entry[field] === value) {
        return entry;
      }
      lineChanged = true;
      const updated: EditableLine = { ...entry, [field]: value };
      if (field !== 'quantity' && field !== 'unitPrice') {
        return updated;
      }
      // 数量・単価の入力時は金額を自動計算する（22.9）
      return { ...updated, amount: calculateLineAmount(updated.quantity, updated.unitPrice) };
    });

    if (!lineChanged) {
      return siblings;
    }
    const next = siblings.slice();
    next[at] = { ...target, lines: nextLines };
    return next;
  });

  return withItems(state, nextItems);
}

function isSameReportFields(left: EstimateReportFields, right: EstimateReportFields): boolean {
  return (
    left.submissionDate === right.submissionDate &&
    left.validityPeriod === right.validityPeriod &&
    left.separateWorks.length === right.separateWorks.length &&
    left.separateWorks.every((entry, at) => entry === right.separateWorks[at])
  );
}

function applyUpdateReportFields(
  state: EstimateEditState,
  fields: EstimateReportFields
): EstimateEditState {
  if (isSameReportFields(state.reportFields, fields)) {
    return unchanged(state);
  }
  return { ...state, reportFields: fields, isDirty: true, lastError: null };
}

// ============================================================================
// リデューサ
// ============================================================================

/**
 * 編集状態の遷移関数を作る
 *
 * 一時識別子の発番を注入できるため、単体テストは識別子を決定的に検証できる。
 */
export function createEstimateEditReducer(
  options: EstimateEditReducerOptions
): (state: EstimateEditState, action: EstimateEditAction) => EstimateEditState {
  const { generateTempId } = options;

  return function reduce(state: EstimateEditState, action: EstimateEditAction): EstimateEditState {
    switch (action.type) {
      case 'setItems':
        return applySetItems(state, action.items, action.reportFields);

      case 'insertRow':
        return insertItem(
          state,
          action.parentKey,
          action.afterKey,
          createStandardItem(generateTempId())
        );

      case 'insertNoteRow':
        return insertItem(
          state,
          action.parentKey,
          action.afterKey,
          createNoteItem(generateTempId())
        );

      case 'insertDiscountRow':
        // 値引き行はルートレベルの末尾に追加する（41.2）
        return insertItem(state, null, null, createDiscountItem(generateTempId()));

      case 'deleteRows':
        return applyDeleteRows(state, action.keys);

      case 'duplicateRows':
        return applyDuplicateRows(state, action.keys, generateTempId);

      case 'moveRow':
        return applyMoveRow(state, action.key, action.direction);

      case 'reorderByDnd':
        return applyReorderByDnd(state, action.sourceKey, action.targetKey, action.position);

      case 'updateLineField':
        return applyUpdateLineField(state, action.key, action.lineType, action.field, action.value);

      case 'updateReportFields':
        return applyUpdateReportFields(state, action.fields);
    }
  };
}

const defaultReducer = createEstimateEditReducer({ generateTempId: nextSequentialTempId });

/**
 * 見積明細の編集状態を遷移させる（design.md の既定シグネチャ）
 *
 * 一時識別子はモジュール内の連番で発番される。
 */
export function estimateEditReducer(
  state: EstimateEditState,
  action: EstimateEditAction
): EstimateEditState {
  return defaultReducer(state, action);
}
