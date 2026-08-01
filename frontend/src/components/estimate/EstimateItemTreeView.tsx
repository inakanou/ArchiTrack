/**
 * @fileoverview EstimateItemTreeView - 明細のツリー表示モード
 *
 * Task 54.2: ツリー表示の展開と折りたたみ
 *
 * `EstimateItemTable` の**ツリー表示モード専用**のサブコンポーネントです。
 * 全階層をインデント付きで一覧表示し、子項目を持つ項目に展開・折りたたみの
 * 操作を提供します（ドリルダウン表示は 54.3 が別のサブコンポーネントとして追加する）。
 *
 * 折りたたみ状態は**表示状態**であり、本コンポーネントも `EstimateItemTable` も
 * 保持しません。単一の所有者は `useEstimateNavigation` であり、ここへは
 * `collapsedKeys` / `onToggleCollapsed` として受け渡されます
 * （design.md 「状態には保存対象のみを保持する。表示状態（モード・選択・展開・
 * カーソル）は保持しない」）。
 *
 * 表示順・インデント段数・折りたたみ判定は `estimateTree.flattenTreeForDisplay`
 * が唯一の導出元であり、`useEstimateNavigation.visibleKeys` と同じ規則に従います。
 *
 * Requirements (estimate-creation):
 * - 2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - 2.7: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - 29.1: 子項目を持つ項目の単価フィールドを編集不可とする（＝金額は導出値）
 * - 45.3: ツリー表示では全階層をインデント付きで一覧表示する
 * - 45.4: ツリー表示では子項目を持つ項目に展開/折りたたみの操作を提供する
 * - 45.5: 項目を折りたたんだ場合、その子孫項目を非表示にする
 * - 55.2: 注記行を金額の集計対象から除外する（子が注記行だけの項目は葉として扱う）
 *
 * @module components/estimate/EstimateItemTreeView
 */

import { useCallback, useMemo } from 'react';
import { EstimateItemRow } from './EstimateItemRow';
import { flattenTreeForDisplay, isAggregatableChild } from '../../domain/estimate/estimateTree';
import type { DisplayRow, NodeKey } from '../../domain/estimate/estimateTree';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

// ============================================================================
// 型定義
// ============================================================================

/** 表示行タイプのフィルター */
export type EstimateVisibleLineTypes = Set<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>;

/** 行フィールド変更コールバック */
export type EstimateLineChangeHandler = (
  itemId: string,
  lineId: string,
  field: keyof EstimateItemLineEdit,
  value: string | null
) => void;

/**
 * EstimateItemTreeView コンポーネントのProps
 */
export interface EstimateItemTreeViewProps {
  /** 見積項目の階層データ（表示用ツリー） */
  items: EstimateItemHierarchyEdit[];
  /**
   * 折りたたみ中の項目キー（45.5）
   *
   * 所有者は `useEstimateNavigation`。未指定は「折りたたみなし」。
   */
  collapsedKeys?: ReadonlySet<NodeKey>;
  /** 展開/折りたたみの切り替え要求（45.4） */
  onToggleCollapsed?: (key: NodeKey) => void;
  /** 選択中の項目ID */
  selectedItemId?: string | null;
  /** ドラッグ可能かどうか */
  draggable?: boolean;
  /** 項目選択コールバック */
  onItemSelect?: (itemId: string) => void;
  /** 行フィールド変更コールバック */
  onLineChange?: EstimateLineChangeHandler;
  /** 表示する行タイプのフィルター */
  visibleLineTypes?: EstimateVisibleLineTypes;
}

// ============================================================================
// 定数・スタイル定義
// ============================================================================

/** 1階層あたりのインデント幅（px / 2.6） */
const INDENT_WIDTH_PX = 16;

/** 折りたたみなしを表す共有インスタンス（参照の同一性を保つため毎回生成しない） */
const NO_COLLAPSED_KEYS: ReadonlySet<NodeKey> = new Set<NodeKey>();

const styles = {
  itemWrapper: {
    position: 'relative' as const,
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  itemWrapperSelected: {
    backgroundColor: '#eff6ff',
  },
  expandButton: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
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
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 展開/折りたたみアイコン
 */
function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
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
      style={{
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s',
      }}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface TreeRowProps {
  row: DisplayRow<EstimateItemHierarchyEdit>;
  selectedItemId?: string | null;
  draggable?: boolean;
  onItemSelect?: (itemId: string) => void;
  onToggleCollapsed?: (key: NodeKey) => void;
  onLineChange?: EstimateLineChangeHandler;
  visibleLineTypes?: EstimateVisibleLineTypes;
}

/**
 * ツリー表示の1行
 *
 * 平坦化済みの行を描画する。子孫の描画有無は `flattenTreeForDisplay` が
 * 決定済みのため、ここでは階層をたどらない。
 */
function TreeRow({
  row,
  selectedItemId,
  draggable = false,
  onItemSelect,
  onToggleCollapsed,
  onLineChange,
  visibleLineTypes,
}: TreeRowProps) {
  const { item, key, depth, hasChildren, isCollapsed } = row;

  // 金額の集計対象になる子の有無（29.1 の単価編集ロックの判定）
  //
  // 注記行は集計対象外（55.2）で、子が注記行だけの項目は
  // `estimateTree.recalculateAncestorAmounts` が葉として自身の金額を保持する。
  // ここを `hasChildren` で判定すると、金額は導出されないのに単価だけ編集不可になる。
  const hasAggregatableChildren = item.children.some(isAggregatableChild);
  const isSelected = selectedItemId === item.id;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 展開ボタンのクリックは項目選択しない
      if ((e.target as HTMLElement).closest('[data-expand-button]')) {
        return;
      }
      onItemSelect?.(item.id);
    },
    [item.id, onItemSelect]
  );

  const handleToggleCollapsed = useCallback(() => {
    onToggleCollapsed?.(key);
  }, [key, onToggleCollapsed]);

  const wrapperStyle: React.CSSProperties = {
    ...styles.itemWrapper,
    ...(isSelected ? styles.itemWrapperSelected : {}),
    paddingLeft: `${depth * INDENT_WIDTH_PX}px`,
  };

  return (
    <div
      style={wrapperStyle}
      data-testid={`estimate-item-${item.id}`}
      data-selected={isSelected.toString()}
      onClick={handleClick}
      draggable={draggable}
    >
      {/* 展開/折りたたみボタン（子を持つ項目のみ / 45.4） */}
      {hasChildren && (
        <button
          type="button"
          style={{
            ...styles.expandButton,
            left: `${depth * INDENT_WIDTH_PX + 4}px`,
          }}
          onClick={handleToggleCollapsed}
          aria-label={isCollapsed ? '展開する' : '折りたたむ'}
          aria-expanded={!isCollapsed}
          data-expand-button
        >
          <ChevronIcon isExpanded={!isCollapsed} />
        </button>
      )}

      {/* 項目行（3行1セット） */}
      <EstimateItemRow
        itemId={item.id}
        lines={item.lines}
        indentLevel={hasChildren ? 1 : 0} // 展開ボタン分のスペース
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
 * 明細のツリー表示（45.3〜45.5）
 *
 * 全階層をインデント付きで一覧表示し、折りたたみ中の項目の子孫を描画しない。
 * 折りたたみは表示状態のため、本コンポーネントは編集内容へ一切影響しない。
 */
export function EstimateItemTreeView({
  items,
  collapsedKeys = NO_COLLAPSED_KEYS,
  onToggleCollapsed,
  selectedItemId,
  draggable = false,
  onItemSelect,
  onLineChange,
  visibleLineTypes,
}: EstimateItemTreeViewProps) {
  // 表示順・深さ・折りたたみ判定はドメイン層の単一実装から導く（2.5, 2.6, 45.3, 45.5）
  const rows = useMemo(
    () => flattenTreeForDisplay(items, (item) => item.id, collapsedKeys),
    [items, collapsedKeys]
  );

  return (
    <>
      {rows.map((row) => (
        <TreeRow
          key={row.key}
          row={row}
          selectedItemId={selectedItemId}
          draggable={draggable}
          onItemSelect={onItemSelect}
          onToggleCollapsed={onToggleCollapsed}
          onLineChange={onLineChange}
          visibleLineTypes={visibleLineTypes}
        />
      ))}
    </>
  );
}

export default EstimateItemTreeView;
