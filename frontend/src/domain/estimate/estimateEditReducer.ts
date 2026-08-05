/**
 * @fileoverview estimateEditReducer - 見積明細の編集状態を遷移させる純粋関数
 *
 * 行の挿入・削除・複写・上下移動・ドラッグによる並び替え・セル値の更新・
 * 帳票用入力項目の更新に加え、受領見積書転記・NET金額案分・利益率適用・諸経費行追加の
 * 適用を、サーバーへ問い合わせない副作用のない遷移として実装します。
 * UI・サーバーいずれにも依存しないドメイン層のモジュールであり、
 * components / hooks / pages / api / services からは import しません。
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加で新規の3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除で3行1セット全体を削除する
 * - 12.4: 親項目を削除した場合に子項目も含めて削除する（確認の提示はUIの責務）
 * - 12.5: 見積項目の複製で3行1セット全体を複製する
 * - 12.6: 見積項目の親項目を変更（移動）可能とする
 * - 12.7: 上記すべての操作を編集セッション中にサーバーへ問い合わせずに行う
 * - 23.9 / 23.10: 選択中の項目を親の兄弟レベルへ移動する／階層を1段下げる
 * - 44.3: 削除・複写・階層の上げ下げを選択範囲全体に対して適用する
 * - 44.4: 選択範囲の先頭行を親とし、先頭行を除く選択行をその子項目として配置する
 * - 44.5: 選択行を現在の親項目の兄弟レベルへ移動する
 * - 44.6: ルートレベルでの階層上げは実行せず、上げられないことを示す
 * - 44.7: 自身または自身の子孫の子になる移動は実行せずエラーを返す
 * - 43.1: 行操作を保存を伴わずに反映する。新規行は識別子を持たず一時識別子で表現する
 * - 43.5: 行の追加・削除・階層変更で影響を受ける親項目の金額合計を即座に再計算する
 * - 43.6: 親項目を削除した場合にその子孫項目もあわせて取り除く
 * - 54.6 / 54.8: 帳票用入力項目を編集可能とし、変更を未保存の変更として扱う
 * - 41.2 / 41.3: 値引き行のプリセット値と見積金額行のみの構成
 * - 55.1 / 55.3: 注記行は名称のみを持ち、任意の階層の任意の位置に配置できる
 * - 22.3 / 22.9: 金額（数量×単価の自動計算結果）を小数第1位で四捨五入した整数で保持する
 * - 4.1 / 4.2 / 4.3 / 4.6: 受領見積書の内容を業者金額行へ転記し未保存の変更として扱う
 * - 5.3 / 5.4 / 5.5: NET金額の案分結果を実行金額行の単価・金額へ反映する
 * - 6.1〜6.4 / 6.7: 利益率の適用結果を上書きオプションに従って見積金額行へ反映する
 * - 7.1 / 7.7 / 8.1 / 8.7 / 9.1 / 9.7: 諸経費行をプリセット値で追加し未保存の変更として扱う
 * - 41.11: 値引き行の追加を未保存の変更として扱う（`insertDiscountRow`）
 * - 49.1〜49.4: 転記・計算結果を未保存の変更として反映し、再取得も書き込みも行わない
 * - 49.6 / 49.7: 計算対象を編集中の明細の値とし、未保存の新規項目も含める
 * - 49.8: これらの変更を取り消し可能とする（純粋な遷移のためスナップショットで復元できる）
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
  allocateNet,
  applyProfitRate as calculateProfitRate,
  roundMoney,
} from './estimateCalculations';
import type { AllocationRow, ProfitRateRow } from './estimateCalculations';
import {
  childrenOf,
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
  NetAllocationPayload,
  NodeKey,
  OverheadCostType,
  OverheadItemPayload,
  ProfitRatePayload,
  QuotationTransferLine,
  QuotationTransferPayload,
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

/**
 * 諸経費行のプリセット値（7.1, 8.1, 9.1）
 *
 * 本定義がプリセット値の唯一の権威。かつてバックエンド
 * `OverheadCostService.getPresetValues` に同内容の複製があったが、諸経費行の生成が
 * `POST /:id/overhead-items` の撤去（Task 55.7, REQ-49.3）でクライアントへ移り、
 * 複製は呼び出し元を失ったため撤去した。
 */
const OVERHEAD_PRESETS: Readonly<
  Record<
    OverheadCostType,
    {
      readonly name: string;
      readonly specification: string;
      readonly unit: string;
      readonly quantity: string;
    }
  >
> = {
  COMMON_TEMPORARY: { name: '共通仮設費', specification: '', unit: '式', quantity: '1' },
  SITE_MANAGEMENT: { name: '現場管理費', specification: '', unit: '式', quantity: '1' },
  GENERAL_ADMIN: { name: '一般管理費', specification: '', unit: '式', quantity: '1' },
};

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
 * 10進数文字列を `Decimal` に変換する（未入力・数値でない場合は null）
 */
function toDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 金額を単価×数量として求める（小数第1位で四捨五入した整数）
 *
 * 数量・単価のいずれかが未入力または数値でない場合は null を返す。
 * 丸めは `estimateCalculations.roundMoney` に委ねる（22.3, 22.9 の単一実装）。
 */
function calculateLineAmount(quantity: string | null, unitPrice: string | null): string | null {
  const quantityValue = toDecimal(quantity);
  const unitPriceValue = toDecimal(unitPrice);
  if (quantityValue === null || unitPriceValue === null) {
    return null;
  }
  return roundMoney(quantityValue.mul(unitPriceValue)).toString();
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

/**
 * 範囲操作の対象キーを正規化する
 *
 * 表示順（先行順）で受け取った並びを保ったまま、重複とツリーに存在しないキーを取り除く。
 * 先頭要素が「選択範囲の先頭行」（44.4）となるため並び替えは行わない。
 */
function normalizeRangeKeys(
  tree: readonly EditableItem[],
  keys: readonly NodeKey[]
): readonly NodeKey[] {
  const seen = new Set<NodeKey>();
  const normalized: NodeKey[] = [];
  for (const key of keys) {
    if (seen.has(key) || findItem(tree, key) === null) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

/**
 * 単一行の階層を1段下げる（23.10）
 *
 * 選択が1行のときは 44.4 の「先頭行を親へ昇格させる」規則が適用できない（子に移す行が無い）ため、
 * 直前の兄弟の子として部分木ごと移す。直前の兄弟が無い行はこれ以上下げられない。
 */
function indentSingleRow(state: EstimateEditState, key: NodeKey): EstimateEditState {
  const parentKey = parentKeyOf(state.items, key);
  if (parentKey === undefined) {
    return unchanged(state);
  }

  const siblings = childrenOf(state.items, parentKey);
  const at = siblings.findIndex((entry) => nodeKeyOf(entry) === key);
  const moving = at < 0 ? undefined : siblings[at];
  if (moving === undefined) {
    return unchanged(state);
  }

  const newParent = at === 0 ? undefined : siblings[at - 1];
  if (newParent === undefined) {
    // 同一階層の先頭行は受け入れ先の兄弟が無いため階層を下げられない
    return rejected(state, { kind: 'NO_PRECEDING_SIBLING', key });
  }
  if (newParent.itemType !== 'STANDARD') {
    // 値引き行・注記行は子を持てないため親にできない（41.3, 55.1）
    return rejected(state, {
      kind: 'INVALID_PARENT_TYPE',
      key: nodeKeyOf(newParent),
      itemType: newParent.itemType,
    });
  }

  const newParentKey = nodeKeyOf(newParent);
  const nextItems = rebuildTree(state.items, (siblingsToRebuild, currentParentKey) => {
    if (currentParentKey === newParentKey) {
      return [...siblingsToRebuild, moving];
    }
    if (currentParentKey !== parentKey) {
      return siblingsToRebuild;
    }
    return siblingsToRebuild.filter((entry) => nodeKeyOf(entry) !== key);
  });

  return withItems(state, nextItems);
}

/**
 * 選択範囲の階層を1段下げる（44.3, 44.4）
 *
 * 2行以上の選択では先頭行を親へ昇格させ、先頭行を除く選択行をその子として末尾に並べる。
 * 先頭行の既存の子はそのまま保持する。選択範囲より後ろの行は階層を変えない。
 * 先頭行の子孫として既に配下にある選択行は、部分木の形を保つため移動しない。
 */
function applyIndentRange(state: EstimateEditState, keys: readonly NodeKey[]): EstimateEditState {
  const targets = normalizeRangeKeys(state.items, keys);
  const headKey = targets[0];
  if (headKey === undefined) {
    return unchanged(state);
  }
  const head = findItem(state.items, headKey);
  if (head === null) {
    return unchanged(state);
  }

  if (targets.length === 1) {
    return indentSingleRow(state, headKey);
  }

  if (head.itemType !== 'STANDARD') {
    // 先頭行が親になるため、子を持てない値引き行・注記行では実行しない（41.3, 55.1）
    return rejected(state, {
      kind: 'INVALID_PARENT_TYPE',
      key: headKey,
      itemType: head.itemType,
    });
  }

  const headDescendants = new Set<NodeKey>(descendantKeys(state.items, headKey));
  // 既に先頭行の配下にある行は移動しない。入れ子の選択行は祖先の部分木として一緒に動く
  const movingKeys = outermostKeys(
    state.items,
    targets.slice(1).filter((key) => !headDescendants.has(key))
  );

  // 先頭行の祖先を先頭行の子にする指定は循環を生むため実行しない（44.7）
  const cyclic = movingKeys.find((key) => wouldCreateCycle(state.items, [key], headKey));
  if (cyclic !== undefined) {
    return rejected(state, { kind: 'CYCLIC_MOVE', key: cyclic });
  }

  const movingSet = new Set<NodeKey>(movingKeys);
  const movingNodes: EditableItem[] = [];
  for (const key of movingKeys) {
    const node = findItem(state.items, key);
    if (node !== null) {
      movingNodes.push(node);
    }
  }
  if (movingNodes.length === 0) {
    return unchanged(state);
  }

  const nextItems = rebuildTree(state.items, (siblings, currentParentKey) => {
    const remaining = siblings.some((entry) => movingSet.has(nodeKeyOf(entry)))
      ? siblings.filter((entry) => !movingSet.has(nodeKeyOf(entry)))
      : siblings;
    if (currentParentKey !== headKey) {
      return remaining;
    }
    return [...remaining, ...movingNodes];
  });

  return withItems(state, nextItems);
}

/**
 * 選択範囲の階層を1段上げる（44.3, 44.5, 44.6）
 *
 * 各選択行を自身の親項目の直後（＝親の兄弟レベル）へ移す。
 * 選択にルートレベルの行が含まれる場合はこれ以上上げられないため操作全体を実行しない（44.6）。
 * 入れ子の選択行は祖先の部分木として一緒に移動するため個別には移動しない。
 */
function applyOutdentRange(state: EstimateEditState, keys: readonly NodeKey[]): EstimateEditState {
  const targets = outermostKeys(state.items, normalizeRangeKeys(state.items, keys));
  if (targets.length === 0) {
    return unchanged(state);
  }

  const targetSet = new Set<NodeKey>(targets);
  const movingByParent = new Map<NodeKey, EditableItem[]>();
  for (const key of targets) {
    const parentKey = parentKeyOf(state.items, key);
    const node = findItem(state.items, key);
    if (parentKey === undefined || node === null) {
      return unchanged(state);
    }
    if (parentKey === null) {
      // ルートレベルの行はこれ以上階層を上げられない（44.6）
      return rejected(state, { kind: 'CANNOT_OUTDENT_ROOT' });
    }
    const bucket = movingByParent.get(parentKey);
    if (bucket === undefined) {
      movingByParent.set(parentKey, [node]);
    } else {
      bucket.push(node);
    }
  }

  const nextItems = rebuildTree(state.items, (siblings, currentParentKey) => {
    // 旧親の子配列からは選択行を取り除く
    const isSource = currentParentKey !== null && movingByParent.has(currentParentKey);
    const remaining = isSource
      ? siblings.filter((entry) => !targetSet.has(nodeKeyOf(entry)))
      : siblings;

    // 旧親を含む配列（＝祖父の子配列）では、旧親の直後へ選択行を並べる（44.5）
    if (!remaining.some((entry) => movingByParent.has(nodeKeyOf(entry)))) {
      return remaining;
    }
    const next: EditableItem[] = [];
    for (const entry of remaining) {
      next.push(entry);
      const promoted = movingByParent.get(nodeKeyOf(entry));
      if (promoted !== undefined) {
        next.push(...promoted);
      }
    }
    return next;
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
// 転記・計算結果の適用（49.1〜49.4, 49.8）
//
// いずれの遷移もサーバーへ問い合わせず（49.3）、結果を未保存の変更として
// 編集中の明細へ反映する（49.1）。明細の再取得を行わないため、それまでの
// 未保存の編集内容はそのまま残る（49.2）。計算は `estimateCalculations` の
// 単一実装に委ね、ここでは反映先の行の組み立てだけを行う（5.8, 6.8）。
// ============================================================================

/** ツリー全体を先行順で列挙する（明示スタックの反復・再帰なし） */
function collectItems(tree: readonly EditableItem[]): readonly EditableItem[] {
  const collected: EditableItem[] = [];
  const stack: EditableItem[] = tree.slice().reverse();
  let current = stack.pop();
  while (current !== undefined) {
    collected.push(current);
    for (let at = current.children.length - 1; at >= 0; at -= 1) {
      const child = current.children[at];
      if (child !== undefined) {
        stack.push(child);
      }
    }
    current = stack.pop();
  }
  return collected;
}

/**
 * 項目単位の差し替えをツリー全体へ適用する
 *
 * @param update 差し替え後の項目。変更しない場合は null を返すこと
 * @returns 変化が無い場合は入力ツリーを同一参照で返す
 */
function mapItems(
  tree: readonly EditableItem[],
  update: (item: EditableItem) => EditableItem | null
): readonly EditableItem[] {
  return rebuildTree(tree, (siblings) => {
    let changed = false;
    const next = siblings.map((entry) => {
      const updated = update(entry);
      if (updated === null || updated === entry) {
        return entry;
      }
      changed = true;
      return updated;
    });
    return changed ? next : siblings;
  });
}

/** 指定した行タイプの明細行を返す（持たない場合は undefined） */
function lineOfType(target: EditableItem, lineType: EstimateLineType): EditableLine | undefined {
  return target.lines.find((entry) => entry.lineType === lineType);
}

/** 項目の指定行タイプだけを差し替える */
function withLine(
  target: EditableItem,
  lineType: EstimateLineType,
  build: (line: EditableLine) => EditableLine
): EditableItem {
  return {
    ...target,
    lines: target.lines.map((entry) => (entry.lineType === lineType ? build(entry) : entry)),
  };
}

/**
 * 受領見積書の1明細行から見積項目を作る（4.2, 4.3, 30.3）
 *
 * 転記対象は名称・規格・単位・数量・単価（4.3）と業者名。金額は転記元の値を
 * 持ち込まず 数量 × 単価 として導出する（22.9）。備考は 4.3 の転記対象に
 * 含まれないため空のままとする。業者金額行以外は空の3行1セットで作る。
 */
function createTransferredItem(
  tempId: TempId,
  transfer: QuotationTransferLine,
  vendorName: string | null
): EditableItem {
  return {
    id: null,
    tempId,
    itemType: 'STANDARD',
    lines: STANDARD_LINE_TYPES.map((lineType) =>
      lineType === 'VENDOR'
        ? {
            ...emptyLine('VENDOR'),
            name: transfer.name,
            specification: transfer.specification,
            unit: transfer.unit,
            quantity: transfer.quantity,
            unitPrice: transfer.unitPrice,
            amount: calculateLineAmount(transfer.quantity, transfer.unitPrice),
            sourceVendorName: vendorName,
          }
        : emptyLine(lineType)
    ),
    children: [],
  };
}

/** 指定した親の子の末尾へ複数の項目をまとめて追加する変換を作る */
function appendChildrenTransform(
  parentKey: NodeKey | null,
  newItems: readonly EditableItem[]
): SiblingsTransform {
  return (siblings, currentParentKey) =>
    currentParentKey === parentKey ? [...siblings, ...newItems] : siblings;
}

/**
 * 受領見積書の転記結果を反映する（4.1, 4.2, 4.4, 4.6, 30.1, 30.3）
 *
 * 転記ダイアログの転記先は「新規項目として作成」（`parentKey === null`）と
 * 「＜既存項目名＞の子項目として作成」（`parentKey` に当該項目のキー）の2種で、
 * 既存の業者金額行を上書きする選択肢は無い（30.1, 30.2）。したがって選択した
 * 明細行はすべて新しい見積項目になり（4.4）、指定した親の子として追加される
 * （30.3 / design.md :2337-2339「当該項目のparentIdに選択した既存項目IDを設定
 * して転記」）。撤去対象の `POST /:id/transfer-quotation` は転記先指定時に先頭
 * 以外の明細行を破棄していたが、選択した行を無言で捨てない。
 *
 * 値引き行・注記行は子を持てない（41.3）ため、行挿入と同じ `validateInsertParent`
 * で親を検証する。
 */
function applyQuotationTransferAction(
  state: EstimateEditState,
  payload: QuotationTransferPayload,
  generateTempId: TempIdGenerator
): EstimateEditState {
  if (payload.lines.length === 0) {
    return unchanged(state);
  }

  const invalid = validateInsertParent(state, payload.parentKey);
  if (invalid !== null) {
    return invalid.rejection;
  }

  const appended = payload.lines.map((transfer) =>
    createTransferredItem(generateTempId(), transfer, payload.vendorName)
  );

  return withItems(
    state,
    rebuildTree(state.items, appendChildrenTransform(payload.parentKey, appended))
  );
}

/**
 * NET金額の案分結果を実行金額行へ反映する（5.3, 5.4, 5.5）
 *
 * 案分は編集中の業者金額行の値に対して行う（5.8, 49.6）。除外指定・値引き行・
 * 注記行の扱いは `estimateCalculations.allocateNet` が担う（5.2, 41.9, 55.4）。
 */
function applyNetAllocationAction(
  state: EstimateEditState,
  payload: NetAllocationPayload
): EstimateEditState {
  const netAmount = toDecimal(payload.netAmount);
  if (netAmount === null) {
    return unchanged(state);
  }

  const vendorByKey = new Map<NodeKey, EditableLine>();
  const rows: AllocationRow[] = [];
  for (const key of payload.targetKeys) {
    if (vendorByKey.has(key)) {
      continue;
    }
    const target = findItem(state.items, key);
    if (target === null || lineOfType(target, 'VENDOR') === undefined) {
      continue;
    }
    const vendor = lineOfType(target, 'VENDOR');
    if (vendor === undefined || lineOfType(target, 'EXECUTION') === undefined) {
      continue;
    }
    vendorByKey.set(key, vendor);
    rows.push({
      key,
      itemType: target.itemType,
      amount: toDecimal(vendor.amount),
      quantity: toDecimal(vendor.quantity),
    });
  }

  const results = allocateNet(rows, netAmount, new Set<NodeKey>(payload.excludeKeys ?? []));
  if (results.length === 0) {
    return unchanged(state);
  }

  const resultByKey = new Map(results.map((entry) => [entry.key, entry]));
  const nextItems = mapItems(state.items, (entry) => {
    const key = nodeKeyOf(entry);
    const result = resultByKey.get(key);
    const vendor = vendorByKey.get(key);
    if (result === undefined || vendor === undefined) {
      return null;
    }
    // 実行金額行は業者金額行の名称・規格・単位・数量を引き継ぐ（5.3）
    return withLine(entry, 'EXECUTION', (execution) => ({
      ...execution,
      name: vendor.name,
      specification: vendor.specification,
      unit: vendor.unit,
      quantity: vendor.quantity,
      unitPrice: result.unitPrice.toString(),
      amount: result.allocatedAmount.toString(),
    }));
  });

  return withItems(state, nextItems);
}

/**
 * 利益率の適用結果を見積金額行へ反映する（6.1〜6.4, 6.7）
 *
 * 上書きオプションの判定と新しい単価・金額の算出は
 * `estimateCalculations.applyProfitRate` が担い、ここでは `applied` が真の行だけを
 * 反映する（6.8: プレビューと反映結果を一致させる）。
 */
function applyProfitRateAction(
  state: EstimateEditState,
  payload: ProfitRatePayload
): EstimateEditState {
  const rate = toDecimal(payload.rate);
  if (rate === null) {
    return unchanged(state);
  }

  const targetKeys = payload.targetKeys;
  const targets: EditableItem[] = [];
  if (targetKeys === undefined) {
    // 対象未指定は全実行金額行（6.1）
    targets.push(...collectItems(state.items));
  } else {
    const seen = new Set<NodeKey>();
    for (const key of targetKeys) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const found = findItem(state.items, key);
      if (found !== null) {
        targets.push(found);
      }
    }
  }

  const executionByKey = new Map<NodeKey, EditableLine>();
  const rows: ProfitRateRow[] = [];
  for (const target of targets) {
    const execution = lineOfType(target, 'EXECUTION');
    const estimate = lineOfType(target, 'ESTIMATE');
    if (execution === undefined || estimate === undefined) {
      continue;
    }
    const key = nodeKeyOf(target);
    executionByKey.set(key, execution);
    rows.push({
      key,
      itemType: target.itemType,
      executionUnitPrice: toDecimal(execution.unitPrice),
      executionQuantity: toDecimal(execution.quantity),
      estimateUnitPrice: toDecimal(estimate.unitPrice),
      estimateQuantity: toDecimal(estimate.quantity),
    });
  }

  const results = calculateProfitRate(rows, rate, payload.overwriteOption).filter(
    (entry) => entry.applied && entry.newUnitPrice !== null
  );
  if (results.length === 0) {
    return unchanged(state);
  }

  const resultByKey = new Map(results.map((entry) => [entry.key, entry]));
  const nextItems = mapItems(state.items, (entry) => {
    const key = nodeKeyOf(entry);
    const result = resultByKey.get(key);
    const execution = executionByKey.get(key);
    if (result === undefined || execution === undefined || result.newUnitPrice === null) {
      return null;
    }
    const unitPrice = result.newUnitPrice.toString();
    const amount = result.newAmount === null ? null : result.newAmount.toString();

    return withLine(entry, 'ESTIMATE', (estimate) =>
      result.copyLineFields
        ? {
            // 「すべて上書き」「空の場合のみ上書き」は実行金額行の内容を複写する（6.2, 6.3）
            ...estimate,
            name: execution.name,
            specification: execution.specification,
            unit: execution.unit,
            quantity: execution.quantity,
            unitPrice,
            amount,
          }
        : // 「単価のみ上書き」は単価と金額だけを更新する（6.4）
          { ...estimate, unitPrice, amount }
    );
  });

  return withItems(state, nextItems);
}

/** 諸経費行を作る（7.1, 8.1, 9.1）。単価は自動計算・手入力のいずれでもよい */
function createOverheadItem(tempId: TempId, payload: OverheadItemPayload): EditableItem {
  const preset = OVERHEAD_PRESETS[payload.costType];
  const unitPrice = payload.unitPrice ?? null;

  return {
    id: null,
    tempId,
    itemType: 'STANDARD',
    lines: STANDARD_LINE_TYPES.map((lineType) =>
      lineType === 'ESTIMATE'
        ? {
            ...emptyLine('ESTIMATE'),
            name: preset.name,
            specification: preset.specification,
            unit: preset.unit,
            quantity: preset.quantity,
            unitPrice,
            amount: calculateLineAmount(preset.quantity, unitPrice),
          }
        : emptyLine(lineType)
    ),
    children: [],
  };
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

      case 'indentRange':
        return applyIndentRange(state, action.keys);

      case 'outdentRange':
        return applyOutdentRange(state, action.keys);

      case 'updateLineField':
        return applyUpdateLineField(state, action.key, action.lineType, action.field, action.value);

      case 'updateReportFields':
        return applyUpdateReportFields(state, action.fields);

      case 'applyQuotationTransfer':
        return applyQuotationTransferAction(state, action.payload, generateTempId);

      case 'applyNetAllocation':
        return applyNetAllocationAction(state, action.payload);

      case 'applyProfitRate':
        return applyProfitRateAction(state, action.payload);

      case 'addOverheadItem':
        // 諸経費行はルートレベルの末尾に追加する（7.1, 8.1, 9.1）
        return insertItem(state, null, null, createOverheadItem(generateTempId(), action.payload));
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
