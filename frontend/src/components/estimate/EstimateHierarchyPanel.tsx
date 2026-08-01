/**
 * @fileoverview EstimateHierarchyPanel - 階層構造の俯瞰パネル
 *
 * Task 54.5: 階層構造の俯瞰パネル
 *
 * 見積書画面の明細の傍らに置き、見積項目の階層構造だけをツリー形式で俯瞰します。
 * 行数の多い見積書でも現在位置を見失わず、目的の項目へ移動するための入口です。
 *
 * **状態を一切持ちません**。折りたたみ状態も選択状態も所有者は
 * `useEstimateNavigation` であり、ここへは `collapsedKeys` / `selectedKey` として
 * 受け渡されます（design.md 「状態には保存対象のみを保持する。表示状態
 * （モード・選択・展開・カーソル）は保持しない」）。折りたたみ状態を明細テーブルと
 * 共有するため、パネルと明細の展開状態が食い違うことがありません。
 *
 * 構造の導出は `estimateTree` が唯一の実装です。
 * `toHierarchyNodes`（46.2 用のツリー）→ `flattenTreeForDisplay`（表示順・深さ・
 * 折りたたみ判定）の順に通し、パネル側でツリーを走査し直しません。
 *
 * Requirements (estimate-creation):
 * - 46.2: 見積項目の階層構造をツリー形式で表示する
 * - 46.3: 各項目の展開/折りたたみ操作を提供する
 * - 46.4: すべて展開・すべて折りたたむ操作を提供する
 * - 46.5: 項目を選択した場合、明細の表示を当該項目へ移動し選択状態にする
 *   （移動の実体は `useEstimateNavigation.revealAndSelect` が担い、
 *   本コンポーネントは選択された項目のキーを通知するだけ）
 * - 46.6: 明細の階層構造が編集で変化した場合、変化後の構造を反映する
 *   （`items` は編集状態のツリーそのもので、変化のたびに新しい参照が渡る）
 *
 * パネルの表示/非表示（46.7）は本コンポーネントの外（`EstimateDetailPage`）が持つ。
 * 自身の表示可否を自身で持つと非表示のときに再表示する操作が消えるため。
 *
 * Design: design.md `#### File Structure Plan`
 * `EstimateHierarchyPanel.tsx  # 新規: 階層構造の俯瞰パネル`、
 * Components and Interfaces「EstimateHierarchyPanel | Frontend UI |
 * 階層構造の俯瞰とジャンプ | 46 | estimateTree (P0), useEstimateNavigation (P0)」
 *
 * @module components/estimate/EstimateHierarchyPanel
 */

import { useCallback, useMemo } from 'react';
import { flattenTreeForDisplay, toHierarchyNodes } from '../../domain/estimate/estimateTree';
// キー操作の文脈判定（`hierarchyPanel`）に使う目印（54.6 / `estimateKeymap`）
import { ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE } from '../../domain/estimate/estimateKeymap';
import type {
  DisplayRow,
  EditableItem,
  HierarchyNode,
  NodeKey,
} from '../../domain/estimate/estimateTree';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateHierarchyPanel コンポーネントの Props
 *
 * すべて必須。省略できる形にすると画面側の結線漏れが型検査もテストも
 * すり抜ける（53.14 の `onDragStart` / `onDrop` が死んでいた経緯）。
 */
export interface EstimateHierarchyPanelProps {
  /**
   * 編集中の明細ツリー（読み取り専用 / 46.6）
   *
   * 編集状態のツリーそのものを受け取る。構造が変わるたびに新しい参照が渡るため、
   * 追加・削除・階層変更がそのまま表示へ反映される。
   */
  items: readonly EditableItem[];
  /**
   * 折りたたみ中の項目キー（46.3）
   *
   * 所有者は `useEstimateNavigation`。明細テーブルと同一の集合を共有する。
   */
  collapsedKeys: ReadonlySet<NodeKey>;
  /** 選択中の項目キー（46.5）。未選択は null */
  selectedKey: NodeKey | null;
  /** 展開/折りたたみの切り替え要求（46.3） */
  onToggleCollapsed: (key: NodeKey) => void;
  /** すべて展開の要求（46.4） */
  onExpandAll: () => void;
  /** すべて折りたたむの要求（46.4） */
  onCollapseAll: () => void;
  /** 項目の選択要求（46.5） */
  onSelect: (key: NodeKey) => void;
}

// ============================================================================
// 定数・スタイル定義
// ============================================================================

/** パネルのアクセシブル名（画面側の見出しと一致させる） */
export const ESTIMATE_HIERARCHY_PANEL_LABEL = '階層構造';

/** 名称が未入力の項目の表記（ドリルダウンの経路表示と同じ表記に揃える） */
const UNNAMED_ITEM_LABEL = '（名称未設定）';

/** 1階層あたりのインデント幅（px） */
const INDENT_WIDTH_PX = 12;

const styles = {
  panel: {
    flex: '0 0 260px',
    alignSelf: 'flex-start',
    maxHeight: '640px',
    display: 'flex',
    flexDirection: 'column' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  } as React.CSSProperties,
  actionButton: {
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  tree: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '1px 8px',
  } as React.CSSProperties,
  rowSelected: {
    backgroundColor: '#eff6ff',
  } as React.CSSProperties,
  toggleButton: {
    flex: '0 0 auto',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    borderRadius: '4px',
  } as React.CSSProperties,
  togglePlaceholder: {
    flex: '0 0 auto',
    width: '20px',
    height: '20px',
  } as React.CSSProperties,
  labelButton: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left' as const,
    padding: '3px 4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#111827',
    fontSize: '13px',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  labelButtonSelected: {
    fontWeight: 600,
    color: '#1d4ed8',
  } as React.CSSProperties,
  empty: {
    margin: 0,
    padding: '24px 12px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '13px',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/** 展開/折りたたみアイコン */
function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
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

/** 項目の見出し名（俯瞰用ツリーが持つ名称） */
function labelOf(node: HierarchyNode): string {
  return node.name !== null && node.name !== '' ? node.name : UNNAMED_ITEM_LABEL;
}

interface HierarchyRowProps {
  row: DisplayRow<HierarchyNode>;
  isSelected: boolean;
  onToggleCollapsed: (key: NodeKey) => void;
  onSelect: (key: NodeKey) => void;
}

/**
 * 俯瞰パネルの1行
 *
 * 表示順・深さ・折りたたみ判定は `flattenTreeForDisplay` が決定済みのため、
 * ここでは階層をたどらない。
 */
function HierarchyRow({ row, isSelected, onToggleCollapsed, onSelect }: HierarchyRowProps) {
  const { item: node, key, depth, hasChildren, isCollapsed } = row;
  const label = labelOf(node);

  const handleToggle = useCallback(() => {
    onToggleCollapsed(key);
  }, [key, onToggleCollapsed]);

  const handleSelect = useCallback(() => {
    onSelect(key);
  }, [key, onSelect]);

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      data-testid={`hierarchy-node-${key}`}
      data-node-key={key}
      data-item-type={node.itemType}
      style={{
        ...styles.row,
        ...(isSelected ? styles.rowSelected : {}),
        paddingLeft: `${8 + depth * INDENT_WIDTH_PX}px`,
      }}
    >
      {hasChildren ? (
        <button
          type="button"
          style={styles.toggleButton}
          onClick={handleToggle}
          aria-label={`${label} を${isCollapsed ? '展開する' : '折りたたむ'}`}
        >
          <ChevronIcon isExpanded={!isCollapsed} />
        </button>
      ) : (
        <span style={styles.togglePlaceholder} aria-hidden="true" />
      )}

      <button
        type="button"
        style={{ ...styles.labelButton, ...(isSelected ? styles.labelButtonSelected : {}) }}
        onClick={handleSelect}
        title={label}
      >
        {label}
      </button>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 階層構造の俯瞰パネル（46.1〜46.6）
 *
 * @example
 * ```tsx
 * const navigation = useEstimateNavigation({ items: editor.editState.items });
 *
 * <EstimateHierarchyPanel
 *   items={editor.editState.items}
 *   collapsedKeys={navigation.collapsedKeys}
 *   selectedKey={selectedItemId}
 *   onToggleCollapsed={navigation.toggleCollapsed}
 *   onExpandAll={navigation.expandAll}
 *   onCollapseAll={navigation.collapseAll}
 *   onSelect={handleHierarchySelect}
 * />
 * ```
 */
export function EstimateHierarchyPanel({
  items,
  collapsedKeys,
  selectedKey,
  onToggleCollapsed,
  onExpandAll,
  onCollapseAll,
  onSelect,
}: EstimateHierarchyPanelProps) {
  // 俯瞰用ツリー（46.2）。同一の明細ツリーに対しては構築済みの結果が返る
  const nodes = useMemo(() => toHierarchyNodes(items), [items]);

  // 表示順・深さ・折りたたみ判定はドメイン層の単一実装から導く（明細と同じ規則）
  const rows = useMemo(
    () => flattenTreeForDisplay(nodes, (node) => node.key, collapsedKeys),
    [nodes, collapsedKeys]
  );

  return (
    <section
      aria-label={ESTIMATE_HIERARCHY_PANEL_LABEL}
      data-testid="estimate-hierarchy-panel"
      {...{ [ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE]: 'true' }}
      style={styles.panel}
    >
      <div style={styles.header}>
        <h3 style={styles.title}>{ESTIMATE_HIERARCHY_PANEL_LABEL}</h3>
        {/* すべて展開・すべて折りたたむ（46.4） */}
        <div style={styles.actions}>
          <button type="button" style={styles.actionButton} onClick={onExpandAll}>
            すべて展開
          </button>
          <button type="button" style={styles.actionButton} onClick={onCollapseAll}>
            すべて折りたたむ
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={styles.empty}>見積項目がありません</p>
      ) : (
        <div role="tree" aria-label="見積項目の階層構造" style={styles.tree}>
          {rows.map((row) => (
            <HierarchyRow
              key={row.key}
              row={row}
              isSelected={selectedKey === row.key}
              onToggleCollapsed={onToggleCollapsed}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default EstimateHierarchyPanel;
