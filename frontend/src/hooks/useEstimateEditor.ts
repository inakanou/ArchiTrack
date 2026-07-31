/**
 * @fileoverview useEstimateEditorフック - 見積書編集状態管理（遷移関数への委譲）
 *
 * Task 53.4: 編集フックの遷移関数への置き換え
 *
 * 差分記録方式（`pendingChanges: Map`）を廃止し、編集状態の遷移を純粋 reducer
 * `estimateEditReducer`（`domain/estimate`）へ全面的に委譲します。
 * セルの編集・行操作・帳票用入力項目の編集はすべて同一の state に集約され、
 * 未保存判定（`isDirty`）は reducer の state から直接得られます。
 *
 * 依存方向（design.md `#### Dependency Direction`）:
 * `types → estimateTree → estimateEditReducer → hooks(本モジュール) → components → pages`
 * ドメイン層は本モジュールを参照しません。
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加は3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除は3行1セット全体を削除する
 * - 12.5: 見積項目の複製は3行1セット全体を複製する
 * - 12.7: 上記すべての操作を編集セッション中にサーバーへ問い合わせずに行う
 *   （Requirement 43 に従う。本モジュールは API モジュールを一切 import しない）
 * - 27.1: 名称・規格・単位・数量・単価・備考をクライアントサイドで即座に編集可能とする
 *   （編集モード切替を持たず `updateLine` が常時有効）
 * - 27.2: 見積項目セクションの保存ボタン（`EstimateDetailPage`）が押下時に呼ぶ操作
 *   （`save`）を提供する。ボタン自体の描画・配置は `EstimateDetailPage` の責務
 * - 27.4: 未保存の変更がない場合に保存ボタンを無効表示するための判定（`isDirty`）を供給する
 * - 42.7: 保存操作が成功した場合に未保存の変更がない状態へ戻す
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集する経路（`updateReportFields`）を提供する
 * - 54.8: 帳票用入力項目の変更を未保存の変更として扱う
 * - 1.5: 合計行に全見積項目の金額合計を自動計算して表示する（`getTotalAmount`）
 * - 2.3: 子項目を持つ場合、親項目の金額を子項目の金額合計とする（reducer が毎遷移で再計算）
 * - 41.2, 41.3: 値引き行はプリセット値・見積金額行のみでルートレベルへ追加する
 *
 * 後続タスクへの申し送り:
 * - 範囲操作（`indentRange` / `outdentRange`）は本フックが公開していない。
 *   これらを公開する 54.10 は、reducer が `keys` を並べ替えない（design.md
 *   `##### estimateEditReducer` > Preconditions）ため、**表示順（先行順）**の
 *   キー列を渡す責務を負う。順序は `estimateTree.flattenForGrid(items, collapsedKeys)`
 *   の並びから導出すること（本モジュールの `reorderByItemIds` と同じ導出）。
 * - 保存経路（`saveEstimateDraft` の1回呼び出し・応答反映・競合検出）は 53.5 が接続する。
 *   `onSave` 未指定の間、`save()` は編集内容を保持したまま何もしない。
 *
 * @module hooks/useEstimateEditor
 */

import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  EMPTY_REPORT_FIELDS,
  createInitialEstimateEditState,
  estimateEditReducer,
} from '../domain/estimate/estimateEditReducer';
import type {
  EditableItem,
  EditableLine,
  EditableLineField,
  EditError,
  EstimateEditAction,
  EstimateEditState,
  EstimateReportFields,
  NodeKey,
  TempId,
} from '../domain/estimate/estimateEditReducer.types';
import {
  flattenForGrid,
  nodeKeyOf,
  recalculateAncestorAmounts,
} from '../domain/estimate/estimateTree';

// ============================================================================
// 型定義（画面が参照する編集用ビューモデル）
// ============================================================================

/**
 * 見積項目行タイプ
 */
export type EstimateItemLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 見積項目種別
 *
 * - STANDARD: 通常の見積項目（見積・実行・業者の3行構成）。未指定時もSTANDARD扱い
 * - DISCOUNT: 値引き行（見積金額行のみ・マイナス単価許容）
 * - NOTE: 注記行（名称のみ・金額の集計対象外）
 *
 * Requirements (estimate-creation):
 * - 41.2, 41.3: 値引きプリセット行
 * - 55.1, 55.2: 注記行
 */
export type EstimateItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/**
 * 見積項目行（編集用）
 */
export interface EstimateItemLineEdit {
  id: string;
  estimateItemId: string;
  lineType: EstimateItemLineType;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId?: string | null;
  sourceVendorName?: string | null;
}

/**
 * 見積項目（階層構造、編集用）
 */
export interface EstimateItemHierarchyEdit {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  /**
   * 見積項目種別（任意。未指定はSTANDARD扱い）
   *
   * Requirements (estimate-creation):
   * - 41.2, 41.3: 値引き行は 'DISCOUNT'
   */
  itemType?: EstimateItemType;
  lines: EstimateItemLineEdit[];
  children: EstimateItemHierarchyEdit[];
  isExpanded: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 保存へ渡す編集内容
 *
 * 差分ではなく編集中のツリー全体と帳票用入力項目を渡す。
 * 保存経路（`saveEstimateDraft` の呼び出し）の接続は 53.5 が担当する。
 */
export interface EstimateEditorSavePayload {
  readonly items: readonly EditableItem[];
  readonly reportFields: EstimateReportFields;
}

/**
 * useEstimateEditorフックのオプション
 */
export interface UseEstimateEditorOptions {
  /**
   * 見積書ID
   */
  estimateId: string;

  /**
   * 初期の見積項目データ
   */
  initialItems: EstimateItemHierarchyEdit[];

  /**
   * 帳票用入力項目の初期値（54.1〜54.3）
   */
  initialReportFields?: EstimateReportFields;

  /**
   * 保存処理（編集中のツリー全体を受け取って保存）
   *
   * 未指定の場合 `save()` は何も行わず、未保存状態を維持する（53.5 で接続）。
   */
  onSave?: (payload: EstimateEditorSavePayload) => Promise<void>;

  /**
   * 保存成功時のコールバック
   */
  onSaveSuccess?: () => void;

  /**
   * 保存エラー時のコールバック
   */
  onSaveError?: (error: Error) => void;
}

/**
 * useEstimateEditorフックの戻り値
 */
export interface UseEstimateEditorResult {
  /**
   * 見積項目一覧（reducer state から導出した表示用ツリー）
   */
  items: EstimateItemHierarchyEdit[];

  /**
   * 帳票用入力項目（54.1〜54.3）
   */
  reportFields: EstimateReportFields;

  /**
   * 編集状態そのもの（保存・取り消しが参照する）
   */
  editState: EstimateEditState;

  /**
   * 未保存の変更があるか（27.4 の保存ボタン無効表示の判定に用いる）
   */
  isDirty: boolean;

  /**
   * 保存中かどうか
   */
  isSaving: boolean;

  /**
   * 直近の操作が無効だった理由（44.6, 44.7, 41.3, 55.1）
   *
   * 次に**変更が成立した操作**または `dismissError()` まで保持される。
   */
  lastError: EditError | null;

  /**
   * 表示済みのエラーを消す
   */
  dismissError: () => void;

  /**
   * 行のフィールドを更新（ローカル操作）
   */
  updateLine: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;

  /**
   * 帳票用入力項目を更新（54.6, 54.8）
   */
  updateReportFields: (fields: EstimateReportFields) => void;

  /**
   * 項目を並び替え（ローカル操作）
   */
  reorderItems: (sourceId: string, targetId: string) => void;

  /**
   * 項目を追加（ローカル操作）
   */
  addItem: (parentId?: string) => void;

  /**
   * 値引き行を追加（ローカル操作）
   *
   * Requirements (estimate-creation):
   * - 41.2: 名称：値引き、規格：空白、単位：式、数量：1のプリセット値でルートレベルに追加
   * - 41.3: 見積金額行（ESTIMATE）のみで構成し、実行・業者金額行を持たない
   */
  addDiscountItem: () => void;

  /**
   * 項目を削除（ローカル操作）
   */
  deleteItem: (itemId: string) => void;

  /**
   * 項目を複製（ローカル操作）
   */
  duplicateItem: (itemId: string) => void;

  /**
   * 変更を保存
   */
  save: () => Promise<void>;

  /**
   * 変更を破棄
   */
  discard: () => void;

  /**
   * 項目を外部から設定
   */
  setItems: (items: EstimateItemHierarchyEdit[], reportFields?: EstimateReportFields) => void;

  /**
   * 展開/折りたたみを切り替え
   */
  toggleExpanded: (itemId: string) => void;

  /**
   * 合計金額を取得
   */
  getTotalAmount: () => string;
}

// ============================================================================
// 定数
// ============================================================================

/** 一時識別子の接頭辞（`estimateEditReducer` の発番と同一） */
const TEMP_ID_PREFIX = 'tmp-';

/** 折りたたみ無しの空集合（`flattenForGrid` のキャッシュキーとして同一参照を使う） */
const NO_COLLAPSED_KEYS: ReadonlySet<NodeKey> = new Set<NodeKey>();

/** ドメイン層の `EditableLine` へ書き戻せるフィールド */
const EDITABLE_LINE_FIELDS: ReadonlySet<string> = new Set<string>([
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'amount',
  'remarks',
  'sourceVendorName',
]);

/** 永続化前の項目が持つ生成日時（サーバー由来の値が無いことを表す） */
const UNKNOWN_TIMESTAMP = '';

// ============================================================================
// 表示用ビューモデルとドメイン表現の相互変換
// ============================================================================

/**
 * ドメイン層が保持しない項目の付随情報
 *
 * `EditableItem` は保存対象のみを持つ（design.md `##### estimateEditReducer`）ため、
 * サーバー由来の日時と転記元行の参照はフック側で保持して表示用ツリーへ戻す。
 */
interface EstimateItemMeta {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly quotationLineIdByLineType: ReadonlyMap<EstimateItemLineType, string | null>;
}

type EstimateItemMetaMap = Map<NodeKey, EstimateItemMeta>;

/**
 * ツリーを葉から順に写像する（明示スタックによる後行順走査）
 *
 * 再帰を用いないため階層の深さに上限を設けない（2.5）。
 */
function mapTreeBottomUp<S, T>(
  roots: readonly S[],
  childrenOf: (node: S) => readonly S[],
  build: (node: S, children: T[]) => T
): T[] {
  interface Frame {
    readonly source: readonly S[];
    readonly output: T[];
    readonly owner: S | null;
    index: number;
  }

  const stack: Frame[] = [{ source: roots, output: [], owner: null, index: 0 }];
  let result: T[] = [];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      break;
    }

    const child = frame.source[frame.index];
    if (child !== undefined) {
      frame.index += 1;
      stack.push({ source: childrenOf(child), output: [], owner: child, index: 0 });
      continue;
    }

    stack.pop();
    const owner = frame.owner;
    if (owner === null) {
      result = frame.output;
      continue;
    }
    const parentFrame = stack[stack.length - 1];
    if (parentFrame !== undefined) {
      parentFrame.output.push(build(owner, frame.output));
    }
  }

  return result;
}

/** 画面が用いる行IDを解決する（未永続の行は項目キーと行タイプから合成する） */
function resolveLineId(itemKey: NodeKey, lineType: EstimateItemLineType, lineId: string | null) {
  return lineId ?? `${itemKey}::${lineType}`;
}

/** 表示用ツリーの項目をドメイン表現へ変換する */
function toEditableItem(
  item: EstimateItemHierarchyEdit,
  children: EditableItem[],
  meta: EstimateItemMetaMap
): EditableItem {
  const isTemporary = item.id.startsWith(TEMP_ID_PREFIX);
  const key: NodeKey = item.id;

  const quotationLineIdByLineType = new Map<EstimateItemLineType, string | null>();
  for (const line of item.lines) {
    quotationLineIdByLineType.set(line.lineType, line.sourceReceivedQuotationLineItemId ?? null);
  }
  meta.set(key, {
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    quotationLineIdByLineType,
  });

  const lines: EditableLine[] = item.lines.map((line) => ({
    id: line.id.startsWith(TEMP_ID_PREFIX) || line.id.includes('::') ? null : line.id,
    lineType: line.lineType,
    name: line.name,
    specification: line.specification,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.amount,
    remarks: line.remarks,
    sourceVendorName: line.sourceVendorName ?? null,
  }));

  return {
    id: isTemporary ? null : item.id,
    tempId: isTemporary ? (item.id as TempId) : null,
    itemType: item.itemType ?? 'STANDARD',
    lines,
    children,
  };
}

/**
 * 表示用ツリーをドメイン表現へ変換し、付随情報を収集する
 */
function toEditableTree(
  items: readonly EstimateItemHierarchyEdit[],
  meta: EstimateItemMetaMap
): readonly EditableItem[] {
  return mapTreeBottomUp<EstimateItemHierarchyEdit, EditableItem>(
    items,
    (item) => item.children,
    (item, children) => toEditableItem(item, children, meta)
  );
}

/** 折りたたみ中の項目キーを収集する（表示状態は reducer の state に持たない） */
function collectCollapsedKeys(items: readonly EstimateItemHierarchyEdit[]): Set<NodeKey> {
  const collapsed = new Set<NodeKey>();
  const stack: EstimateItemHierarchyEdit[] = items.slice();
  let current = stack.pop();
  while (current !== undefined) {
    if (!current.isExpanded) {
      collapsed.add(current.id);
    }
    for (const child of current.children) {
      stack.push(child);
    }
    current = stack.pop();
  }
  return collapsed;
}

/** ドメイン表現を表示用ツリーへ変換する */
function toViewTree(
  items: readonly EditableItem[],
  estimateId: string,
  collapsedKeys: ReadonlySet<NodeKey>,
  meta: EstimateItemMetaMap
): EstimateItemHierarchyEdit[] {
  const roots = mapTreeBottomUp<EditableItem, EstimateItemHierarchyEdit>(
    items,
    (item) => item.children,
    (item, children) => {
      const key = nodeKeyOf(item);
      const itemMeta = meta.get(key);
      children.forEach((child, index) => {
        child.parentId = key;
        child.displayOrder = index;
      });
      return {
        id: key,
        estimateId,
        parentId: null,
        displayOrder: 0,
        itemType: item.itemType,
        lines: item.lines.map((line) => ({
          id: resolveLineId(key, line.lineType, line.id),
          estimateItemId: key,
          lineType: line.lineType,
          name: line.name,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
          remarks: line.remarks,
          sourceReceivedQuotationLineItemId:
            itemMeta?.quotationLineIdByLineType.get(line.lineType) ?? null,
          sourceVendorName: line.sourceVendorName,
        })),
        children,
        isExpanded: !collapsedKeys.has(key),
        createdAt: itemMeta?.createdAt ?? UNKNOWN_TIMESTAMP,
        updatedAt: itemMeta?.updatedAt ?? UNKNOWN_TIMESTAMP,
      };
    }
  );

  roots.forEach((root, index) => {
    root.parentId = null;
    root.displayOrder = index;
  });
  return roots;
}

// ============================================================================
// フック層のアクション解決とエラー保持方針
// ============================================================================

/**
 * フック層で最新 state を用いて解決するアクション
 *
 * 画面は行ID・項目IDで操作を指示するため、行タイプや並び替えの向きは
 * **ディスパッチ時点の最新 state** から解決する（描画時の値に依存しない）。
 */
type EstimateEditorAction =
  | EstimateEditAction
  | { type: 'dismissError' }
  | {
      type: 'updateLineByLineId';
      itemKey: NodeKey;
      lineId: string;
      field: EditableLineField;
      value: string | null;
    }
  | { type: 'reorderByItemIds'; sourceKey: NodeKey; targetKey: NodeKey };

/** ツリー全体を先行順で走査して項目を取得する */
function findItemByKey(items: readonly EditableItem[], key: NodeKey): EditableItem | null {
  const stack: EditableItem[] = items.slice();
  let current = stack.pop();
  while (current !== undefined) {
    if (nodeKeyOf(current) === key) {
      return current;
    }
    for (const child of current.children) {
      stack.push(child);
    }
    current = stack.pop();
  }
  return null;
}

/**
 * フック層のアクションをドメイン層のアクションへ解決する
 *
 * @returns 解決できない指定（存在しない項目・行）の場合は null
 */
function resolveEditAction(
  state: EstimateEditState,
  action: Exclude<EstimateEditorAction, { type: 'dismissError' }>
): EstimateEditAction | null {
  if (action.type === 'updateLineByLineId') {
    const item = findItemByKey(state.items, action.itemKey);
    if (item === null) {
      return null;
    }
    const line = item.lines.find(
      (candidate) =>
        resolveLineId(action.itemKey, candidate.lineType, candidate.id) === action.lineId
    );
    if (line === undefined) {
      return null;
    }
    return {
      type: 'updateLineField',
      key: action.itemKey,
      lineType: line.lineType,
      field: action.field,
      value: action.value,
    };
  }

  if (action.type === 'reorderByItemIds') {
    // 表示順（先行順）での前後関係から挿入位置を決める（12.2）
    const rows = flattenForGrid(state.items, NO_COLLAPSED_KEYS);
    const from = rows.findIndex((row) => row.key === action.sourceKey);
    const to = rows.findIndex((row) => row.key === action.targetKey);
    if (from < 0 || to < 0) {
      return null;
    }
    return {
      type: 'reorderByDnd',
      sourceKey: action.sourceKey,
      targetKey: action.targetKey,
      position: from < to ? 'after' : 'before',
    };
  }

  return action;
}

/**
 * 遷移関数のラッパ（エラー保持方針）
 *
 * `estimateEditReducer` は変化の無い操作でも `lastError` を null に戻すため、
 * 44.6・44.7・41.3 の理由表示が「次の無害な操作」で消えてしまう（53.2 申し送り）。
 * 要件・設計に消去方針の規定が無いため、**フック層の方針**として次を採る:
 *
 * 1. 新しいエラーが発生したらそれを表示する
 * 2. 変更が成立した操作（`items` / `reportFields` / `isDirty` が変わる操作）が
 *    エラーを解除する
 * 3. 変化の無い操作は直前のエラーを保持する
 * 4. UI が表示を終えたら `dismissError()` で明示的に解除できる
 *
 * 44.6「それ以上上げられないことを**示す**」は、表示前に消えると充足しないため
 * 2・3 の区別が必要になる。ドメイン層（53.1〜53.3）は変更しない。
 */
function estimateEditorReducer(
  state: EstimateEditState,
  action: EstimateEditorAction
): EstimateEditState {
  if (action.type === 'dismissError') {
    return state.lastError === null ? state : { ...state, lastError: null };
  }

  const resolved = resolveEditAction(state, action);
  if (resolved === null) {
    // 存在しない項目・行への指示は状態も直前のエラーも変えない
    return state;
  }

  const next = estimateEditReducer(state, resolved);
  if (next.lastError !== null || resolved.type === 'setItems') {
    return next;
  }
  if (
    next.items !== state.items ||
    next.reportFields !== state.reportFields ||
    next.isDirty !== state.isDirty
  ) {
    return next;
  }
  return state.lastError === null ? next : { ...next, lastError: state.lastError };
}

// ============================================================================
// useEstimateEditor フック
// ============================================================================

interface EditorInit {
  readonly initialItems: readonly EstimateItemHierarchyEdit[];
  readonly initialReportFields: EstimateReportFields;
  readonly meta: EstimateItemMetaMap;
}

function initEditorState(init: EditorInit): EstimateEditState {
  const items = recalculateAncestorAmounts(toEditableTree(init.initialItems, init.meta));
  return createInitialEstimateEditState(items, init.initialReportFields);
}

/**
 * 見積書編集状態管理フック
 *
 * @example
 * ```tsx
 * function EstimateEditor() {
 *   const { items, isDirty, updateLine, addItem, deleteItem, save, discard } = useEstimateEditor({
 *     estimateId: 'est-001',
 *     initialItems: [],
 *     onSave: async ({ items, reportFields }) => {
 *       await saveEstimateDraft(estimateId, items, reportFields);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       {items.map((item) => (
 *         <EstimateItemRow key={item.id} item={item} onUpdate={updateLine} />
 *       ))}
 *       <button onClick={() => addItem()}>追加</button>
 *       <button onClick={save} disabled={!isDirty}>保存</button>
 *       <button onClick={discard} disabled={!isDirty}>破棄</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEstimateEditor(options: UseEstimateEditorOptions): UseEstimateEditorResult {
  const { estimateId, initialItems, initialReportFields, onSave, onSaveSuccess, onSaveError } =
    options;

  // ドメイン層が保持しない付随情報（サーバー由来の日時・転記元行の参照）
  const metaRef = useRef<EstimateItemMetaMap>(new Map());

  const [state, dispatch] = useReducer(
    estimateEditorReducer,
    {
      initialItems,
      initialReportFields: initialReportFields ?? EMPTY_REPORT_FIELDS,
      meta: metaRef.current,
    } satisfies EditorInit,
    initEditorState
  );

  // 表示状態（折りたたみ）は保存対象ではないため reducer の state に持たない
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<NodeKey>>(() =>
    collectCollapsedKeys(initialItems)
  );

  const [isSaving, setIsSaving] = useState(false);

  // 破棄（discard）で戻す基準となる保存済み状態
  const baselineRef = useRef<EstimateEditorSavePayload>({
    items: state.items,
    reportFields: state.reportFields,
  });

  const items = useMemo(
    () => toViewTree(state.items, estimateId, collapsedKeys, metaRef.current),
    [state.items, estimateId, collapsedKeys]
  );

  /**
   * 行のフィールドを更新（27.1, 22.9 の金額自動計算は reducer が行う）
   */
  const updateLine = useCallback(
    (
      itemId: string,
      lineId: string,
      field: keyof EstimateItemLineEdit,
      value: string | null
    ): void => {
      if (!EDITABLE_LINE_FIELDS.has(field)) {
        return;
      }
      dispatch({
        type: 'updateLineByLineId',
        itemKey: itemId,
        lineId,
        field: field as EditableLineField,
        value,
      });
    },
    []
  );

  /**
   * 帳票用入力項目を更新（54.6, 54.8）
   */
  const updateReportFields = useCallback((fields: EstimateReportFields): void => {
    dispatch({ type: 'updateReportFields', fields });
  }, []);

  /**
   * 項目を追加（12.1）
   */
  const addItem = useCallback((parentId?: string): void => {
    dispatch({ type: 'insertRow', afterKey: null, parentKey: parentId ?? null });
  }, []);

  /**
   * 値引き行を追加（41.2, 41.3, 41.11）
   */
  const addDiscountItem = useCallback((): void => {
    dispatch({ type: 'insertDiscountRow' });
  }, []);

  /**
   * 項目を削除（12.3, 12.4, 43.6: 子孫もあわせて取り除く）
   */
  const deleteItem = useCallback((itemId: string): void => {
    dispatch({ type: 'deleteRows', keys: [itemId] });
  }, []);

  /**
   * 項目を複製（12.5）
   */
  const duplicateItem = useCallback((itemId: string): void => {
    dispatch({ type: 'duplicateRows', keys: [itemId] });
  }, []);

  /**
   * 項目を並び替え（12.2）
   *
   * 並び替えは他の行操作と同じく state の遷移として記録されるため、
   * 保存対象に含まれる（旧実装のドラッグ操作は差分に本体を持たず永続化されなかった）。
   */
  const reorderItems = useCallback((sourceId: string, targetId: string): void => {
    dispatch({ type: 'reorderByItemIds', sourceKey: sourceId, targetKey: targetId });
  }, []);

  /**
   * 直近のエラー表示を消す
   */
  const dismissError = useCallback((): void => {
    dispatch({ type: 'dismissError' });
  }, []);

  /**
   * 変更を保存
   *
   * 保存経路（一括保存API・応答反映・競合検出）の接続は 53.5 が担当する。
   * `onSave` 未指定の間は保存を行わず、未保存の編集内容を保持する。
   */
  const save = useCallback(async (): Promise<void> => {
    if (!state.isDirty || onSave === undefined) {
      return;
    }

    const payload: EstimateEditorSavePayload = {
      items: state.items,
      reportFields: state.reportFields,
    };

    setIsSaving(true);
    try {
      await onSave(payload);
      baselineRef.current = payload;
      dispatch({ type: 'setItems', items: payload.items, reportFields: payload.reportFields });
      onSaveSuccess?.();
    } catch (error) {
      if (error instanceof Error) {
        onSaveError?.(error);
      }
    } finally {
      setIsSaving(false);
    }
  }, [state, onSave, onSaveSuccess, onSaveError]);

  /**
   * 変更を破棄
   */
  const discard = useCallback((): void => {
    const baseline = baselineRef.current;
    dispatch({ type: 'setItems', items: baseline.items, reportFields: baseline.reportFields });
  }, []);

  /**
   * 外部から項目を設定（読み込み・再取得の反映）
   */
  const setItems = useCallback(
    (newItems: EstimateItemHierarchyEdit[], reportFields?: EstimateReportFields): void => {
      const meta: EstimateItemMetaMap = new Map();
      const converted = toEditableTree(newItems, meta);
      metaRef.current = meta;
      setCollapsedKeys(collectCollapsedKeys(newItems));
      baselineRef.current = {
        items: converted,
        reportFields: reportFields ?? baselineRef.current.reportFields,
      };
      dispatch({ type: 'setItems', items: converted, reportFields });
    },
    []
  );

  /**
   * 展開/折りたたみを切り替え（表示状態のため未保存扱いにしない）
   */
  const toggleExpanded = useCallback((itemId: string): void => {
    setCollapsedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  /**
   * 合計金額を取得（1.5, 41.8: 値引き行の負数も加算する）
   */
  const getTotalAmount = useCallback((): string => {
    const total = state.items.reduce((sum, item) => {
      const estimateLine = item.lines.find((line) => line.lineType === 'ESTIMATE');
      if (estimateLine?.amount) {
        try {
          return sum.add(new Decimal(estimateLine.amount));
        } catch {
          return sum;
        }
      }
      return sum;
    }, new Decimal(0));

    return total.toString();
  }, [state.items]);

  return {
    items,
    reportFields: state.reportFields,
    editState: state,
    isDirty: state.isDirty,
    isSaving,
    lastError: state.lastError,
    dismissError,
    updateLine,
    updateReportFields,
    reorderItems,
    addItem,
    addDiscountItem,
    deleteItem,
    duplicateItem,
    save,
    discard,
    setItems,
    toggleExpanded,
    getTotalAmount,
  };
}

export default useEstimateEditor;
