/**
 * @fileoverview estimateTree - 見積明細ツリーの導出ユーティリティ
 *
 * 隣接リスト由来のツリー（`level` / `path` 列を持たない）に対する導出計算を1箇所に集約します。
 * UI・サーバーいずれにも依存しないドメイン層のモジュールであり、
 * components / hooks / pages / api からは import しません。
 *
 * Requirements (estimate-creation):
 * - 2.4: 複数階層のネスト（建築工事 > 直接仮設工事 > 遣り方）をサポートする
 * - 2.5: 階層の深さに上限を設けない（全走査を明示スタックの反復で行い再帰上限を作らない）
 * - 2.6: 項目の階層レベルをインデント表示で視覚的に区別する（`flattenForGrid` の `depth`）
 * - 29.1: 子項目を持つ項目の単価フィールドを編集不可とする（＝金額は導出値）
 * - 29.2: 子項目の金額合計を親項目の金額として自動計算する
 * - 43.5: 行の追加・削除・階層変更で影響を受ける親項目の金額合計を即座に再計算する
 * - 55.2: 注記行（NOTE）を金額の集計対象から除外する
 * - 41.8: 値引き行（DISCOUNT）の金額（負数を含む）は集計に加算する
 * - 44.7: 自身または子孫を親にする移動を検出する
 * - 46.2 / 46.5: 俯瞰パネル用のツリー構造を導出する
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateTree`
 *
 * 導出結果は入力ツリー（配列オブジェクト）の同一性をキーとして `WeakMap` にキャッシュされ、
 * 同一ツリーに対する走査・集計は繰り返されません。編集状態の遷移関数（53.2 以降）は
 * 変更が生じたときにのみ新しい配列を返すため、この同一性キャッシュがそのまま有効に働きます。
 *
 * @module domain/estimate/estimateTree
 */

import Decimal from 'decimal.js';

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  NodeKey,
} from './estimateEditReducer.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細の構造に関する型は編集状態の型定義モジュールが単一の定義元。
 *
 * 依存方向は `estimateEditReducer.types → estimateTree → estimateEditReducer` であり、
 * ここでの再エクスポートは既存の import 経路を保つためのもの（定義は重複しない）。
 */
export type {
  EstimateItemId,
  TempId,
  NodeKey,
  EstimateLineType,
  EstimateEditItemType,
  EditableLine,
  EditableItem,
} from './estimateEditReducer.types';

/** 俯瞰パネル（46.2）用のツリーノード */
export interface HierarchyNode {
  readonly key: NodeKey;
  readonly name: string | null;
  readonly itemType: EstimateEditItemType;
  /** ルートを 0 とする階層の深さ */
  readonly depth: number;
  readonly children: readonly HierarchyNode[];
}

/**
 * インデント表示（2.6）用に平坦化した1行
 *
 * ドメイン表現（{@link EditableItem}）と表示用ツリーのどちらにも同じ導出規則を
 * 適用できるよう、ノードの型を型引数にとる。
 */
export interface DisplayRow<T> {
  readonly key: NodeKey;
  readonly item: T;
  /** ルートを 0 とする階層の深さ（インデント段数） */
  readonly depth: number;
  readonly parentKey: NodeKey | null;
  readonly hasChildren: boolean;
  /** 子を持ちかつ折りたたまれている場合に true（45.5） */
  readonly isCollapsed: boolean;
}

/** インデント表示（2.6）用に平坦化した明細行 */
export type GridRow = DisplayRow<EditableItem>;

/** ツリー導出ユーティリティの契約 */
export interface EstimateTreeUtil {
  depthOf(tree: readonly EditableItem[], key: NodeKey): number;
  pathTo(tree: readonly EditableItem[], key: NodeKey): readonly EditableItem[];
  descendantKeys(tree: readonly EditableItem[], key: NodeKey): readonly NodeKey[];
  wouldCreateCycle(
    tree: readonly EditableItem[],
    moving: readonly NodeKey[],
    newParent: NodeKey | null
  ): boolean;
  recalculateAncestorAmounts(tree: readonly EditableItem[]): readonly EditableItem[];
  toHierarchyNodes(tree: readonly EditableItem[]): readonly HierarchyNode[];
  childrenOf(tree: readonly EditableItem[], parentKey: NodeKey | null): readonly EditableItem[];
  flattenForGrid(
    tree: readonly EditableItem[],
    collapsedKeys: ReadonlySet<NodeKey>
  ): readonly GridRow[];
}

// ============================================================================
// ノードキー
// ============================================================================

const EMPTY_ITEMS: readonly EditableItem[] = Object.freeze([]);
const EMPTY_KEYS: readonly NodeKey[] = Object.freeze([]);
const EMPTY_NODES: readonly HierarchyNode[] = Object.freeze([]);

/**
 * 項目のノードキーを取得する
 *
 * @throws 不変条件違反（`id` と `tempId` がいずれも null）の場合
 */
export function nodeKeyOf(item: EditableItem): NodeKey {
  const key = item.id ?? item.tempId;
  if (key === null) {
    throw new Error('estimateTree: 見積項目は id または tempId のいずれかを持つ必要があります');
  }
  return key;
}

// ============================================================================
// インデックス（同一ツリーに対して1度だけ構築される）
// ============================================================================

interface PreorderEntry {
  readonly item: EditableItem;
  readonly key: NodeKey;
  readonly parentKey: NodeKey | null;
  readonly depth: number;
}

/** 明示スタックによる深さ優先走査の作業単位 */
interface DfsFrame {
  readonly item: EditableItem;
  readonly parentKey: NodeKey | null;
  readonly depth: number;
}

/** 逆順のコピーを返す（`for...of` で添字アクセスを避けるため） */
function reversedCopy<T>(items: readonly T[]): T[] {
  return items.slice().reverse();
}

interface TreeIndex {
  readonly byKey: Map<NodeKey, EditableItem>;
  readonly parentByKey: Map<NodeKey, NodeKey | null>;
  readonly depthByKey: Map<NodeKey, number>;
  /** 先行順（深さ優先・兄弟は表示順）に並べたノード一覧 */
  readonly preorder: readonly PreorderEntry[];
  /** 先行順の位置。部分木は preorder 上で連続するため子孫列挙に用いる */
  readonly orderByKey: Map<NodeKey, number>;
  /** 遅延構築される導出結果 */
  hierarchyNodes: readonly HierarchyNode[] | null;
  recalculated: readonly EditableItem[] | null;
  readonly descendantKeysByKey: Map<NodeKey, readonly NodeKey[]>;
  readonly gridRowsByCollapsed: WeakMap<ReadonlySet<NodeKey>, readonly GridRow[]>;
}

const indexCache = new WeakMap<object, TreeIndex>();

/**
 * ツリーを1度だけ走査してインデックスを構築する
 *
 * 明示スタックによる反復で行い、階層の深さに上限を設けない（2.5）。
 */
function buildIndex(tree: readonly EditableItem[]): TreeIndex {
  const byKey = new Map<NodeKey, EditableItem>();
  const parentByKey = new Map<NodeKey, NodeKey | null>();
  const depthByKey = new Map<NodeKey, number>();
  const orderByKey = new Map<NodeKey, number>();
  const preorder: PreorderEntry[] = [];

  const stack: DfsFrame[] = [];
  for (const root of reversedCopy(tree)) {
    stack.push({ item: root, parentKey: null, depth: 0 });
  }

  let frame = stack.pop();
  while (frame !== undefined) {
    const key = nodeKeyOf(frame.item);

    byKey.set(key, frame.item);
    parentByKey.set(key, frame.parentKey);
    depthByKey.set(key, frame.depth);
    orderByKey.set(key, preorder.length);
    preorder.push({ item: frame.item, key, parentKey: frame.parentKey, depth: frame.depth });

    const childDepth = frame.depth + 1;
    for (const child of reversedCopy(frame.item.children)) {
      stack.push({ item: child, parentKey: key, depth: childDepth });
    }
    frame = stack.pop();
  }

  return {
    byKey,
    parentByKey,
    depthByKey,
    preorder,
    orderByKey,
    hierarchyNodes: null,
    recalculated: null,
    descendantKeysByKey: new Map(),
    gridRowsByCollapsed: new WeakMap(),
  };
}

function getIndex(tree: readonly EditableItem[]): TreeIndex {
  const cached = indexCache.get(tree);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildIndex(tree);
  indexCache.set(tree, built);
  return built;
}

// ============================================================================
// 導出関数
// ============================================================================

/**
 * 階層の深さを返す（ルート = 0）
 *
 * Requirements: 2.5, 2.6
 *
 * @returns 深さ。ツリーに存在しないキーの場合は -1
 */
export function depthOf(tree: readonly EditableItem[], key: NodeKey): number {
  return getIndex(tree).depthByKey.get(key) ?? -1;
}

/**
 * ルートから対象項目までの経路を返す（対象項目を含む）
 *
 * ドリルダウン表示の現在階層表示（45.7）と俯瞰パネルの現在位置（46.5）で用いる。
 *
 * @returns ルート→対象の順の項目配列。存在しないキーの場合は空配列
 */
export function pathTo(tree: readonly EditableItem[], key: NodeKey): readonly EditableItem[] {
  const index = getIndex(tree);
  if (!index.byKey.has(key)) {
    return EMPTY_ITEMS;
  }

  const reversed: EditableItem[] = [];
  let current: NodeKey | null = key;
  while (current !== null) {
    const item = index.byKey.get(current);
    if (item === undefined) {
      break;
    }
    reversed.push(item);
    current = index.parentByKey.get(current) ?? null;
  }
  return reversed.reverse();
}

/**
 * 指定項目の子孫キーを先行順で列挙する（自身は含まない）
 *
 * 部分木は先行順インデックス上で連続するため、構築済みインデックスの範囲切り出しで導出する。
 * 結果はキーごとにキャッシュし、同一ツリーに対して再走査しない。
 *
 * Requirements: 43.6（親の削除で子孫も取り除く）, 44.7
 */
export function descendantKeys(tree: readonly EditableItem[], key: NodeKey): readonly NodeKey[] {
  const index = getIndex(tree);
  const cached = index.descendantKeysByKey.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const start = index.orderByKey.get(key);
  const baseEntry = start === undefined ? undefined : index.preorder[start];
  if (start === undefined || baseEntry === undefined) {
    return EMPTY_KEYS;
  }

  const baseDepth = baseEntry.depth;
  const keys: NodeKey[] = [];
  for (const entry of index.preorder.slice(start + 1)) {
    if (entry.depth <= baseDepth) {
      break;
    }
    keys.push(entry.key);
  }

  const result = keys.length === 0 ? EMPTY_KEYS : keys;
  index.descendantKeysByKey.set(key, result);
  return result;
}

/**
 * 指定した親の直下の子を返す
 *
 * @param parentKey null の場合はルート項目を返す
 */
export function childrenOf(
  tree: readonly EditableItem[],
  parentKey: NodeKey | null
): readonly EditableItem[] {
  if (parentKey === null) {
    return tree;
  }
  return getIndex(tree).byKey.get(parentKey)?.children ?? EMPTY_ITEMS;
}

/**
 * 移動が自身または子孫を親にするかを判定する
 *
 * Requirements: 44.7
 *
 * @param moving 移動対象のノードキー
 * @param newParent 移動先の親（null はルートレベル）
 */
export function wouldCreateCycle(
  tree: readonly EditableItem[],
  moving: readonly NodeKey[],
  newParent: NodeKey | null
): boolean {
  if (newParent === null || moving.length === 0) {
    return false;
  }

  const movingKeys = new Set<NodeKey>(moving);
  if (movingKeys.has(newParent)) {
    return true;
  }

  // 移動先の祖先をたどり、移動対象が含まれていれば子孫への移動＝循環
  const index = getIndex(tree);
  let current = index.parentByKey.get(newParent) ?? null;
  while (current !== null) {
    if (movingKeys.has(current)) {
      return true;
    }
    current = index.parentByKey.get(current) ?? null;
  }
  return false;
}

// ----------------------------------------------------------------------------
// 親項目の集計（29.2, 43.5, 55.2, 41.8）
// ----------------------------------------------------------------------------

/**
 * 子が親の金額の集計対象になるかを判定する
 *
 * 注記行（NOTE）は金額の集計対象から除外する（55.2）。
 * 値引き行（DISCOUNT）は負数のまま集計に加算する（41.8）。
 *
 * 「集計対象の子を持つか」は 29.1 の単価編集ロックの判定でもあるため、
 * 明細を描画する側（`EstimateItemTable`）もこの判定を再利用する。
 * 規則を2箇所に書くと、集計は葉扱いなのに単価だけ編集不可という
 * どの要件も記述していない状態に分岐しうる。
 */
export function isAggregatableChild(item: { readonly itemType?: EstimateEditItemType }): boolean {
  return item.itemType !== 'NOTE';
}

/**
 * 集計対象となる子を抽出する
 */
function aggregatableChildren(children: readonly EditableItem[]): readonly EditableItem[] {
  if (children.every(isAggregatableChild)) {
    return children;
  }
  return children.filter(isAggregatableChild);
}

function toDecimal(amount: string | null): Decimal {
  if (amount === null || amount === '') {
    return new Decimal(0);
  }
  try {
    return new Decimal(amount);
  } catch {
    return new Decimal(0);
  }
}

/**
 * 親項目の各行タイプの金額を、同じ行タイプの子の合計で上書きする
 *
 * 親項目は行タイプごとに金額行を持ち、いずれも子を持つ間は編集不可の導出値となる（29.1, 29.2）。
 * 合計は小数第1位で四捨五入した整数とする（22.3）。
 *
 * @returns 変化が無い場合は元の `lines` を同一参照で返す
 */
function aggregateLines(
  item: EditableItem,
  children: readonly EditableItem[]
): readonly EditableLine[] {
  const targets = aggregatableChildren(children);
  if (targets.length === 0) {
    // 集計対象の子が無い（注記行のみ、または子なし）場合は自身の金額を保持する
    return item.lines;
  }

  let changed = false;
  const nextLines = item.lines.map((line) => {
    let sum = new Decimal(0);
    for (const child of targets) {
      const childLine = child.lines.find((candidate) => candidate.lineType === line.lineType);
      if (childLine !== undefined) {
        sum = sum.add(toDecimal(childLine.amount));
      }
    }
    const amount = sum.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
    if (line.amount === amount) {
      return line;
    }
    changed = true;
    return { ...line, amount };
  });

  return changed ? nextLines : item.lines;
}

/**
 * 親項目の集計金額を子の合計で再計算する
 *
 * 先行順インデックスを逆順に走査することで、子を必ず親より先に確定させる。
 * 明示スタックを使わない反復のため階層の深さに上限を設けない（2.5）。
 * 変化しなかった項目・部分木は同一参照のまま返し、下流のメモ化を効かせる。
 *
 * Requirements: 2.3, 29.2, 43.5, 55.2, 41.8
 *
 * @returns 変化が無い場合は入力ツリーを同一参照で返す
 */
export function recalculateAncestorAmounts(tree: readonly EditableItem[]): readonly EditableItem[] {
  const index = getIndex(tree);
  if (index.recalculated !== null) {
    return index.recalculated;
  }

  // 逆先行順に走査するため、子は親より先に処理される
  const childrenByParent = new Map<NodeKey, EditableItem[]>();
  const rootsReversed: EditableItem[] = [];

  for (const entry of reversedCopy(index.preorder)) {
    const original = entry.item;

    // 逆順に積まれた子を表示順へ戻す
    const accumulated = childrenByParent.get(entry.key);
    let nextChildren = original.children;
    if (accumulated !== undefined) {
      accumulated.reverse();
      const childrenChanged = accumulated.some((child, at) => child !== original.children[at]);
      nextChildren = childrenChanged ? accumulated : original.children;
      childrenByParent.delete(entry.key);
    }

    const nextLines = aggregateLines(original, nextChildren);
    const nextItem =
      nextChildren === original.children && nextLines === original.lines
        ? original
        : { ...original, lines: nextLines, children: nextChildren };

    if (entry.parentKey === null) {
      rootsReversed.push(nextItem);
    } else {
      const bucket = childrenByParent.get(entry.parentKey);
      if (bucket === undefined) {
        childrenByParent.set(entry.parentKey, [nextItem]);
      } else {
        bucket.push(nextItem);
      }
    }
  }

  rootsReversed.reverse();
  const rootsChanged = rootsReversed.some((root, at) => root !== tree[at]);
  const result = rootsChanged ? rootsReversed : tree;

  index.recalculated = result;
  return result;
}

// ----------------------------------------------------------------------------
// 俯瞰用ツリー（46.2）
// ----------------------------------------------------------------------------

function displayNameOf(item: EditableItem): string | null {
  const estimateLine = item.lines.find((line) => line.lineType === 'ESTIMATE');
  return estimateLine?.name ?? item.lines[0]?.name ?? null;
}

/**
 * 俯瞰パネル用のツリー構造を導出する
 *
 * Requirements: 2.4, 2.5, 46.2
 *
 * 同一ツリーに対しては構築済みの結果を返す（再計算しない）。
 */
export function toHierarchyNodes(tree: readonly EditableItem[]): readonly HierarchyNode[] {
  const index = getIndex(tree);
  if (index.hierarchyNodes !== null) {
    return index.hierarchyNodes;
  }

  const childrenByParent = new Map<NodeKey, HierarchyNode[]>();
  const rootsReversed: HierarchyNode[] = [];

  for (const entry of reversedCopy(index.preorder)) {
    const accumulated = childrenByParent.get(entry.key);
    if (accumulated !== undefined) {
      accumulated.reverse();
      childrenByParent.delete(entry.key);
    }

    const node: HierarchyNode = {
      key: entry.key,
      name: displayNameOf(entry.item),
      itemType: entry.item.itemType,
      depth: entry.depth,
      children: accumulated ?? EMPTY_NODES,
    };

    if (entry.parentKey === null) {
      rootsReversed.push(node);
    } else {
      const bucket = childrenByParent.get(entry.parentKey);
      if (bucket === undefined) {
        childrenByParent.set(entry.parentKey, [node]);
      } else {
        bucket.push(node);
      }
    }
  }

  rootsReversed.reverse();
  index.hierarchyNodes = rootsReversed;
  return rootsReversed;
}

// ----------------------------------------------------------------------------
// インデント表示用の平坦化（2.6, 45.3, 45.5）
// ----------------------------------------------------------------------------

/**
 * インデント表示用にツリーを先行順で平坦化する
 *
 * 折りたたまれた項目の子孫は結果に含めない（45.5）。
 *
 * Requirements: 2.5, 2.6, 45.3, 45.5
 *
 * @param collapsedKeys 折りたたみ中のノードキー集合。集合オブジェクトの同一性でキャッシュされる
 */
export function flattenForGrid(
  tree: readonly EditableItem[],
  collapsedKeys: ReadonlySet<NodeKey>
): readonly GridRow[] {
  const index = getIndex(tree);
  const cached = index.gridRowsByCollapsed.get(collapsedKeys);
  if (cached !== undefined) {
    return cached;
  }

  const rows = flattenTreeForDisplay(tree, nodeKeyOf, collapsedKeys);
  index.gridRowsByCollapsed.set(collapsedKeys, rows);
  return rows;
}

/** 平坦化の対象になるツリーノードの最小構造 */
interface TreeNodeLike<T> {
  readonly children: readonly T[];
}

/**
 * 任意のツリー表現をインデント表示用に先行順で平坦化する
 *
 * 折りたたまれた項目の子孫は結果に含めない（45.5）。走査は明示スタックによる反復で
 * 行い、階層の深さに上限を設けない（2.5）。
 *
 * ドメイン表現（{@link flattenForGrid}）と表示用ツリー（`EstimateItemTable` の
 * ツリー表示）が**同一の導出規則**を共有するための唯一の実装であり、
 * 表示順・インデント段数・折りたたみ判定を画面側で再実装しないための入り口。
 *
 * Requirements: 2.5, 2.6, 45.3, 45.5
 *
 * @param keyOf ノードからノードキーを取り出す関数
 * @param collapsedKeys 折りたたみ中のノードキー集合
 */
export function flattenTreeForDisplay<T extends TreeNodeLike<T>>(
  tree: readonly T[],
  keyOf: (node: T) => NodeKey,
  collapsedKeys: ReadonlySet<NodeKey>
): readonly DisplayRow<T>[] {
  const rows: DisplayRow<T>[] = [];
  const stack: { readonly item: T; readonly parentKey: NodeKey | null; readonly depth: number }[] =
    [];
  for (const root of reversedCopy(tree)) {
    stack.push({ item: root, parentKey: null, depth: 0 });
  }

  let frame = stack.pop();
  while (frame !== undefined) {
    const key = keyOf(frame.item);
    const hasChildren = frame.item.children.length > 0;
    const isCollapsed = hasChildren && collapsedKeys.has(key);

    rows.push({
      key,
      item: frame.item,
      depth: frame.depth,
      parentKey: frame.parentKey,
      hasChildren,
      isCollapsed,
    });

    if (hasChildren && !isCollapsed) {
      const childDepth = frame.depth + 1;
      for (const child of reversedCopy(frame.item.children)) {
        stack.push({ item: child, parentKey: key, depth: childDepth });
      }
    }
    frame = stack.pop();
  }

  return rows;
}

// ============================================================================
// 集約オブジェクト
// ============================================================================

/**
 * ツリー導出ユーティリティ
 *
 * `estimateTree.recalculateAncestorAmounts(...)` の形で参照する。
 */
export const estimateTree: EstimateTreeUtil = {
  depthOf,
  pathTo,
  descendantKeys,
  wouldCreateCycle,
  recalculateAncestorAmounts,
  toHierarchyNodes,
  childrenOf,
  flattenForGrid,
};
