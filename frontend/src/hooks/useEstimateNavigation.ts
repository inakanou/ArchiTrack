/**
 * @fileoverview useEstimateNavigation フック - 見積明細の表示状態管理
 *
 * Task 54.1: 表示状態の管理
 *
 * 階層表示モード・現在階層・選択範囲・展開状態・カーソル位置という
 * **保存対象外**の状態のみを保持します。編集状態（保存対象）は
 * `useEstimateEditor` / `estimateEditReducer` が単独で所有し、本モジュールは
 * 明細ツリーを**読み取るだけ**で一切書き換えません。
 * この分離が取り消し・やり直しと表示モード切替の同時成立を可能にします
 * （design.md `Domain boundaries`）。
 *
 * 依存方向（design.md `#### Dependency Direction`）:
 * `types → estimateTree → hooks(本モジュール) → components → pages`
 * 本モジュールは編集状態の reducer を import しません。
 *
 * Requirements (estimate-creation):
 * - 44.1: 連続する複数の明細行を範囲として選択可能とする
 * - 44.2: 範囲選択を解除した場合、選択状態を単一項目の選択なしの状態へ戻す
 * - 44.8: 複数行が選択されている場合の選択中の行数を供給する（表示は 54.10）
 * - 45.2: 階層表示モードの既定を「ツリー表示」とする
 * - 45.3: ツリー表示では全階層を一覧の対象とする
 * - 45.5: 折りたたんだ項目の子孫を表示対象から外す
 * - 45.6: ドリルダウン表示では現在の階層に属する項目のみを表示対象とする
 * - 45.10: 表示状態の変更は編集状態に触れず、未保存の編集内容を保持する
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`,
 * `**表示状態**: 階層表示モード・現在階層・選択範囲・展開状態・カーソル位置。
 * いずれも保存ペイロードに含めない`
 *
 * 後続タスクへの申し送り:
 * - 45.11「選択したモードを次回の画面表示時にも引き継ぐ」（端末単位の永続化）は
 *   tasks.md 54.4 の担当。本モジュールは受け口として `initialViewMode` のみを持ち、
 *   `localStorage` 等の永続化装置には触れない
 * - ドリルダウンの階層下げ／階層上げ／経路表示（45.7〜45.9）は 54.3、
 *   キー割当は 54.6 が担当する
 * - 展開・折りたたみのUI（45.4）は 54.2 で `EstimateItemTable` へ接続済み。
 *   折りたたみ状態の所有者は本フックのみで、`useEstimateEditor` の暫定保持は撤去済み
 *
 * @module hooks/useEstimateNavigation
 */

import { useCallback, useMemo, useState } from 'react';
import { childrenOf, flattenForGrid, nodeKeyOf } from '../domain/estimate/estimateTree';
import type {
  EditableItem,
  EditableLineField,
  EstimateLineType,
  NodeKey,
} from '../domain/estimate/estimateEditReducer.types';

// ============================================================================
// 型定義
// ============================================================================

/** 明細の階層表示モード（45.1） */
export type EstimateViewMode = 'tree' | 'drilldown';

/**
 * カーソル位置（47.2 のセル間移動の起点）
 *
 * 行の識別子は編集状態と同一の {@link NodeKey} を用い、独自の識別概念を持たない。
 */
export interface EstimateCursorPosition {
  readonly key: NodeKey;
  readonly lineType: EstimateLineType;
  readonly field: EditableLineField;
}

/**
 * 表示状態（design.md `NavigationState`）
 *
 * いずれも保存ペイロードに含めない。
 */
export interface EstimateNavigationState {
  /** 階層表示モード（既定はツリー表示 / 45.2） */
  readonly viewMode: EstimateViewMode;
  /** ドリルダウン表示の現在階層。null はルート階層（45.6） */
  readonly currentLevelKey: NodeKey | null;
  /** 折りたたみ中の項目（45.5） */
  readonly collapsedKeys: ReadonlySet<NodeKey>;
  /** 選択範囲（表示順で連続する / 44.1）。未選択は空配列 */
  readonly selectedKeys: readonly NodeKey[];
  /** カーソル位置。未設定は null */
  readonly cursor: EstimateCursorPosition | null;
}

/** useEstimateNavigation フックの引数 */
export interface UseEstimateNavigationOptions {
  /**
   * 編集中の明細ツリー（読み取り専用）
   *
   * 表示順の導出にのみ用いる。本フックはこの配列を書き換えない。
   */
  items: readonly EditableItem[];
  /**
   * 初期の階層表示モード
   *
   * 既定は `'tree'`（45.2）。端末単位で永続化した値の引き継ぎ（45.11）は
   * 54.4 がこの引数を通じて注入する。
   */
  initialViewMode?: EstimateViewMode;
}

/** useEstimateNavigation フックの戻り値 */
export interface UseEstimateNavigationResult extends EstimateNavigationState {
  /**
   * 現在の表示モード・現在階層・折りたたみ状態から導かれる表示対象の行キー（表示順）
   *
   * 選択範囲の連続性判定もこの並びを基準とする。
   */
  readonly visibleKeys: readonly NodeKey[];
  /** 選択中の行数（44.8） */
  readonly selectedCount: number;
  /** 指定行が選択範囲に含まれるか */
  isSelected: (key: NodeKey) => boolean;
  /** 指定行が折りたたまれているか（45.5） */
  isCollapsed: (key: NodeKey) => boolean;
  /** 階層表示モードを設定する（45.1） */
  setViewMode: (mode: EstimateViewMode) => void;
  /** ドリルダウン表示の現在階層を設定する。null はルート階層（45.6） */
  setCurrentLevelKey: (key: NodeKey | null) => void;
  /** 展開／折りたたみを切り替える（45.4, 45.5） */
  toggleCollapsed: (key: NodeKey) => void;
  /** 単一の行を選択する（範囲選択中の場合は1行へ縮める / 44.2） */
  selectSingle: (key: NodeKey) => void;
  /** 選択範囲を指定行まで広げる（44.1） */
  extendSelectionTo: (key: NodeKey) => void;
  /** 範囲選択を解除し選択なしの状態へ戻す（44.2） */
  clearSelection: () => void;
  /** カーソル位置を設定する */
  setCursor: (cursor: EstimateCursorPosition | null) => void;
}

// ============================================================================
// 定数・内部型
// ============================================================================

/** 階層表示モードの既定値（45.2） */
const DEFAULT_VIEW_MODE: EstimateViewMode = 'tree';

/**
 * カーソルのセル位置の既定値
 *
 * 行選択のみが行われてカーソルのセルが未確定の場合に用いる。
 */
const DEFAULT_CURSOR_LINE_TYPE: EstimateLineType = 'ESTIMATE';
const DEFAULT_CURSOR_FIELD: EditableLineField = 'name';

/**
 * 折りたたみなしを表す共有インスタンス
 *
 * `flattenForGrid` が集合オブジェクトの同一性でキャッシュするため、
 * 既定値は毎回新しい `Set` を作らず共有する。
 */
const NO_COLLAPSED_KEYS: ReadonlySet<NodeKey> = new Set<NodeKey>();

const EMPTY_KEYS: readonly NodeKey[] = Object.freeze([]);

/**
 * 選択範囲の内部表現
 *
 * 端点（起点と終点）のみを保持し、実際の選択行は表示順から都度導出する。
 * これにより編集で削除された行や折りたたみで非表示になった行が
 * 選択範囲に残り続けない。
 */
interface SelectionRange {
  readonly anchorKey: NodeKey;
  readonly focusKey: NodeKey;
}

// ============================================================================
// フック
// ============================================================================

/**
 * 見積明細の表示状態を管理する
 *
 * 編集状態（保存対象）とは独立した React state として、階層表示モード・
 * 現在階層・選択範囲・展開状態・カーソル位置を保持する。本フックの操作は
 * いずれも編集状態を書き換えないため、未保存の編集内容は表示状態の変更を
 * またいで保持される（45.10）。
 *
 * @example
 * ```tsx
 * const editor = useEstimateEditor({ estimateId, initialItems });
 * const nav = useEstimateNavigation({ items: editor.editState.items });
 * ```
 */
export function useEstimateNavigation(
  options: UseEstimateNavigationOptions
): UseEstimateNavigationResult {
  const { items, initialViewMode = DEFAULT_VIEW_MODE } = options;

  const [viewMode, setViewMode] = useState<EstimateViewMode>(initialViewMode);
  const [currentLevelKey, setCurrentLevelKey] = useState<NodeKey | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<NodeKey>>(NO_COLLAPSED_KEYS);
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
  const [cursor, setCursor] = useState<EstimateCursorPosition | null>(null);

  /**
   * 表示対象の行キー（表示順）
   *
   * - ツリー表示: 全階層を先行順で平坦化し、折りたたみ中の子孫を除く（45.3, 45.5）
   * - ドリルダウン表示: 現在階層の直下の項目のみ（45.6）
   */
  const visibleKeys = useMemo<readonly NodeKey[]>(() => {
    if (viewMode === 'drilldown') {
      return childrenOf(items, currentLevelKey).map(nodeKeyOf);
    }
    return flattenForGrid(items, collapsedKeys).map((row) => row.key);
  }, [items, viewMode, currentLevelKey, collapsedKeys]);

  /**
   * 選択範囲（44.1）
   *
   * 端点のいずれかが表示対象に存在しない場合は選択なしとして扱う。
   */
  const selectedKeys = useMemo<readonly NodeKey[]>(() => {
    if (selectionRange === null) {
      return EMPTY_KEYS;
    }
    const anchorIndex = visibleKeys.indexOf(selectionRange.anchorKey);
    const focusIndex = visibleKeys.indexOf(selectionRange.focusKey);
    if (anchorIndex === -1 || focusIndex === -1) {
      return EMPTY_KEYS;
    }
    const start = Math.min(anchorIndex, focusIndex);
    const end = Math.max(anchorIndex, focusIndex);
    return visibleKeys.slice(start, end + 1);
  }, [visibleKeys, selectionRange]);

  const selectedKeySet = useMemo(() => new Set<NodeKey>(selectedKeys), [selectedKeys]);

  const isSelected = useCallback(
    (key: NodeKey): boolean => selectedKeySet.has(key),
    [selectedKeySet]
  );

  const isCollapsed = useCallback(
    (key: NodeKey): boolean => collapsedKeys.has(key),
    [collapsedKeys]
  );

  const toggleCollapsed = useCallback((key: NodeKey): void => {
    setCollapsedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /** カーソルを指定行へ移す（セル位置は維持する） */
  const moveCursorToRow = useCallback((key: NodeKey): void => {
    setCursor((previous) => ({
      key,
      lineType: previous?.lineType ?? DEFAULT_CURSOR_LINE_TYPE,
      field: previous?.field ?? DEFAULT_CURSOR_FIELD,
    }));
  }, []);

  const selectSingle = useCallback(
    (key: NodeKey): void => {
      setSelectionRange({ anchorKey: key, focusKey: key });
      moveCursorToRow(key);
    },
    [moveCursorToRow]
  );

  const extendSelectionTo = useCallback(
    (key: NodeKey): void => {
      setSelectionRange((previous) =>
        previous === null ? { anchorKey: key, focusKey: key } : { ...previous, focusKey: key }
      );
      moveCursorToRow(key);
    },
    [moveCursorToRow]
  );

  const clearSelection = useCallback((): void => {
    setSelectionRange(null);
  }, []);

  return {
    viewMode,
    currentLevelKey,
    collapsedKeys,
    selectedKeys,
    cursor,
    visibleKeys,
    selectedCount: selectedKeys.length,
    isSelected,
    isCollapsed,
    setViewMode,
    setCurrentLevelKey,
    toggleCollapsed,
    selectSingle,
    extendSelectionTo,
    clearSelection,
    setCursor,
  };
}
