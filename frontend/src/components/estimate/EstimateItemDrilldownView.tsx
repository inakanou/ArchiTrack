/**
 * @fileoverview EstimateItemDrilldownView - 明細のドリルダウン表示モード
 *
 * Task 54.3: ドリルダウン表示と現在階層の経路表示
 *
 * `EstimateItemTable` の**ドリルダウン表示モード専用**のサブコンポーネントです
 * （ツリー表示は {@link EstimateItemTreeView} が担当）。現在の階層に属する項目だけを
 * 一覧表示し、ルートからの経路と階層下げ・階層上げの操作を提供します。
 *
 * 現在階層（`currentLevelKey`）は**表示状態**であり、本コンポーネントも
 * `EstimateItemTable` も保持しません。単一の所有者は `useEstimateNavigation` で、
 * ここへは `currentLevelKey` / `onCurrentLevelChange` として受け渡されます
 * （design.md 「状態には保存対象のみを保持する。表示状態（モード・選択・展開・
 * カーソル）は保持しない」）。階層移動は編集内容に一切触れません（45.10）。
 *
 * 表示順・親子関係・経路は `estimateTree` の `flattenTreeForDisplay` /
 * `pathToDisplayRow` が唯一の導出元で、`useEstimateNavigation.visibleKeys` が
 * ドリルダウン時に用いる `childrenOf` と同じ「現在階層の直下」を表示します。
 *
 * **操作名について**: 44.4 / 44.5 の「下の階層へ移動」「上の階層へ移動」は
 * 明細そのものをネストさせる**編集操作**です。本コンポーネントの階層下げ・階層上げは
 * 表示を切り替えるだけの**移動操作**なので、取り違えないよう
 * 「〜 の子階層を表示」「一つ上の階層へ戻る」という表記を用います。
 *
 * Requirements (estimate-creation):
 * - 45.6: ドリルダウン表示では現在の階層に属する項目のみを一覧表示する
 * - 45.7: 現在の階層の位置をルートからの経路として表示し、経路上の各階層へ戻る操作を提供する
 * - 45.8: 子項目を持つ項目に対する階層下げでその項目の子項目の一覧へ切り替える
 * - 45.9: 階層上げで親項目が属する階層の一覧へ切り替える
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする（53.16 / {@link useEstimateRowDrag}）
 * - 29.1: 子項目を持つ項目の単価フィールドを編集不可とする（＝金額は導出値）
 * - 55.2: 注記行を金額の集計対象から除外する（子が注記行だけの項目は葉として扱う）
 *
 * @module components/estimate/EstimateItemDrilldownView
 */

import { useCallback, useMemo } from 'react';
import { EstimateItemRow } from './EstimateItemRow';
import { EstimateBreadcrumbPath, ESTIMATE_ROOT_LEVEL_LABEL } from './EstimateBreadcrumbPath';
import type { EstimateBreadcrumbSegment } from './EstimateBreadcrumbPath';
import { useEstimateRowDrag } from './useEstimateRowDrag';
import type { EstimateRowDragProps } from './useEstimateRowDrag';
import {
  flattenTreeForDisplay,
  isAggregatableChild,
  pathToDisplayRow,
  resolveLevelKey,
} from '../../domain/estimate/estimateTree';
import type { DisplayRow, NodeKey } from '../../domain/estimate/estimateTree';
import { ESTIMATE_ROW_KEY_ATTRIBUTE } from '../../domain/estimate/estimateKeymap';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import type { EstimateLineChangeHandler, EstimateVisibleLineTypes } from './EstimateItemTreeView';

// ============================================================================
// 型定義
// ============================================================================

/** EstimateItemDrilldownView コンポーネントのProps */
export interface EstimateItemDrilldownViewProps {
  /** 見積項目の階層データ（表示用ツリー） */
  items: EstimateItemHierarchyEdit[];
  /**
   * 現在の階層（45.6）
   *
   * 所有者は `useEstimateNavigation`。`null` / 未指定はルート階層。
   */
  currentLevelKey?: NodeKey | null;
  /** 現在の階層の変更要求（45.7, 45.8, 45.9） */
  onCurrentLevelChange?: (key: NodeKey | null) => void;
  /**
   * 選択中の行キー（44.1, 23.7）
   *
   * 所有者は `useEstimateNavigation` ただ1つ。単一選択は要素1件、範囲選択は
   * 表示順に並んだ複数件で表す。54.10 で画面ローカルの選択との二重所有を解消し、
   * クリックによる選択（23.7）もキーボードの範囲選択（47.6）も同じ配列から
   * ハイライトを導く。
   */
  selectedKeys?: readonly NodeKey[];
  /** ドラッグ可能かどうか */
  draggable?: boolean;
  /** 項目選択コールバック */
  onItemSelect?: (itemId: string) => void;
  /** ドラッグ開始コールバック（12.2） */
  onDragStart?: (itemId: string) => void;
  /** ドロップコールバック（12.2 / ドラッグ元と対象の識別子） */
  onDrop?: (sourceId: string, targetId: string) => void;
  /** 行フィールド変更コールバック */
  onLineChange?: EstimateLineChangeHandler;
  /** 表示する行タイプのフィルター */
  visibleLineTypes?: EstimateVisibleLineTypes;
}

// ============================================================================
// 定数・スタイル定義
// ============================================================================

/**
 * ドリルダウンでは階層を折りたたまない（現在階層のみを出すため折りたたみの概念がない）
 *
 * `flattenTreeForDisplay` が集合オブジェクトの同一性でキャッシュするため共有する。
 */
const NO_COLLAPSED_KEYS: ReadonlySet<NodeKey> = new Set<NodeKey>();

/** 範囲選択なしを表す共有インスタンス */
const NO_SELECTED_KEYS: readonly NodeKey[] = Object.freeze([]);

/** 名称が未入力の項目を経路に出すときの表記 */
const UNNAMED_ITEM_LABEL = '（名称未設定）';

const styles = {
  levelBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    position: 'sticky' as const,
    top: 0,
    zIndex: 20,
  } as React.CSSProperties,
  upButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
  itemWrapper: {
    position: 'relative' as const,
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  itemWrapperSelected: {
    backgroundColor: '#eff6ff',
  },
  drillButton: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    left: '4px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s, color 0.2s',
    zIndex: 10,
  } as React.CSSProperties,
  emptyLevel: {
    padding: '32px 24px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/** 階層下げアイコン（子階層へ入る） */
function DrillDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** 階層上げアイコン（親階層へ戻る） */
function DrillUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/** 項目の見出し名（見積金額行の名称）を取り出す */
function labelOf(item: EstimateItemHierarchyEdit): string {
  const name = item.lines.find((line) => line.lineType === 'ESTIMATE')?.name ?? item.lines[0]?.name;
  return name !== null && name !== undefined && name !== '' ? name : UNNAMED_ITEM_LABEL;
}

interface DrilldownRowProps {
  row: DisplayRow<EstimateItemHierarchyEdit>;
  /** この行が選択されているか（単一選択または範囲選択） */
  isSelected: boolean;
  /** 行に付けるドラッグ関連の props（ドラッグ不可なら `draggable: false` のみ / 12.2） */
  dragProps: EstimateRowDragProps;
  onItemSelect?: (itemId: string) => void;
  onDrillDown?: (key: NodeKey) => void;
  onLineChange?: EstimateLineChangeHandler;
  visibleLineTypes?: EstimateVisibleLineTypes;
}

/**
 * ドリルダウン表示の1行
 *
 * 現在の階層に属する項目は同じ深さのため、インデントは付けない（45.6）。
 * 子項目を持つ項目にだけ階層下げの操作を出す（45.8）。
 */
function DrilldownRow({
  row,
  isSelected,
  dragProps,
  onItemSelect,
  onDrillDown,
  onLineChange,
  visibleLineTypes,
}: DrilldownRowProps) {
  const { item, key, hasChildren } = row;

  // 金額の集計対象になる子の有無（29.1 の単価編集ロックの判定 / 注記行は対象外 55.2）
  const hasAggregatableChildren = item.children.some(isAggregatableChild);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 階層下げのクリックは項目選択しない
      if ((e.target as HTMLElement).closest('[data-drill-down-button]')) {
        return;
      }
      onItemSelect?.(item.id);
    },
    [item.id, onItemSelect]
  );

  const handleDrillDown = useCallback(() => {
    onDrillDown?.(key);
  }, [key, onDrillDown]);

  const wrapperStyle: React.CSSProperties = {
    ...styles.itemWrapper,
    ...(isSelected ? styles.itemWrapperSelected : {}),
    paddingLeft: '0px',
  };

  // キー操作の対象行はフォーカス位置から引く（54.6 / `estimateKeymap`）
  const rowKeyProps = { [ESTIMATE_ROW_KEY_ATTRIBUTE]: key };

  return (
    <div
      style={wrapperStyle}
      data-testid={`estimate-item-${item.id}`}
      data-selected={isSelected.toString()}
      {...rowKeyProps}
      tabIndex={-1}
      onClick={handleClick}
      {...dragProps}
    >
      {/* 階層下げ（子を持つ項目のみ / 45.8） */}
      {hasChildren && (
        <button
          type="button"
          style={styles.drillButton}
          onClick={handleDrillDown}
          aria-label={`${labelOf(item)} の子階層を表示`}
          data-drill-down-button
        >
          <DrillDownIcon />
        </button>
      )}

      {/* 項目行（3行1セット） */}
      <EstimateItemRow
        itemId={item.id}
        lines={item.lines}
        indentLevel={hasChildren ? 1 : 0} // 階層下げボタン分のスペース
        isSelected={isSelected}
        onLineChange={onLineChange}
        hasChildren={hasAggregatableChildren}
        visibleLineTypes={visibleLineTypes}
        itemType={item.itemType}
      />
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 明細のドリルダウン表示（45.6〜45.9）
 *
 * 現在の階層に属する項目のみを一覧表示し、ルートからの経路と階層移動を提供する。
 * 現在階層は表示状態のため、本コンポーネントは編集内容へ一切影響しない。
 */
export function EstimateItemDrilldownView({
  items,
  currentLevelKey = null,
  onCurrentLevelChange,
  selectedKeys = NO_SELECTED_KEYS,
  draggable = false,
  onItemSelect,
  onDragStart,
  onDrop,
  onLineChange,
  visibleLineTypes,
}: EstimateItemDrilldownViewProps) {
  // 親子関係・深さの導出元はツリー表示と同一（ドリルダウンでは折りたたみを使わない）
  const rows = useMemo(
    () => flattenTreeForDisplay(items, (item) => item.id, NO_COLLAPSED_KEYS),
    [items]
  );

  // ルートから現在階層までの経路（45.7）
  const path = useMemo(() => pathToDisplayRow(rows, currentLevelKey), [rows, currentLevelKey]);

  /**
   * 実際に一覧する階層
   *
   * 現在階層のキーがツリーに存在しない（編集で削除された等）場合は
   * 経路が空になるため、ルート階層へ落とす。この規則は
   * `useEstimateNavigation.visibleKeys`（＝キー操作の対象行の導出元）と
   * **同一の関数**を用いる。別実装にすると画面の一覧とキー操作の対象が
   * 食い違う（54.3 のレビュー申し送り / 54.6 で解消）。
   */
  const effectiveLevelKey = resolveLevelKey(path, currentLevelKey);

  // 現在の階層に属する項目のみ（45.6）
  const levelRows = useMemo(
    () => rows.filter((row) => row.parentKey === effectiveLevelKey),
    [rows, effectiveLevelKey]
  );

  const segments = useMemo<EstimateBreadcrumbSegment[]>(
    () => [
      { key: null, label: ESTIMATE_ROOT_LEVEL_LABEL },
      ...path.map((row) => ({ key: row.key, label: labelOf(row.item) })),
    ],
    [path]
  );

  /** 階層上げ（45.9）: 現在階層の項目が属する階層＝経路の1つ手前へ */
  const parentLevelKey = path.length >= 2 ? (path[path.length - 2]?.key ?? null) : null;

  const handleDrillUp = useCallback(() => {
    onCurrentLevelChange?.(parentLevelKey);
  }, [onCurrentLevelChange, parentLevelKey]);

  const handleDrillDown = useCallback(
    (key: NodeKey) => {
      onCurrentLevelChange?.(key);
    },
    [onCurrentLevelChange]
  );

  const selectedKeySet = useMemo(() => new Set<NodeKey>(selectedKeys), [selectedKeys]);

  // ドラッグ&ドロップの配線（12.2）。ツリー表示と同一の実装を用いる。
  const getRowDragProps = useEstimateRowDrag({ draggable, onDragStart, onDrop });

  return (
    <>
      <div style={styles.levelBar}>
        {/* ルート階層はこれ以上上げられないため操作を出さない（45.9） */}
        {effectiveLevelKey !== null && (
          <button type="button" style={styles.upButton} onClick={handleDrillUp}>
            <DrillUpIcon />
            一つ上の階層へ戻る
          </button>
        )}
        <EstimateBreadcrumbPath segments={segments} onNavigate={onCurrentLevelChange} />
      </div>

      {levelRows.length === 0 ? (
        <div style={styles.emptyLevel}>この階層に項目がありません</div>
      ) : (
        levelRows.map((row) => (
          <DrilldownRow
            key={row.key}
            row={row}
            isSelected={selectedKeySet.has(row.key)}
            dragProps={getRowDragProps(row.item.id)}
            onItemSelect={onItemSelect}
            onDrillDown={handleDrillDown}
            onLineChange={onLineChange}
            visibleLineTypes={visibleLineTypes}
          />
        ))
      )}
    </>
  );
}

export default EstimateItemDrilldownView;
