/**
 * @fileoverview EstimateItemTableコンポーネント - 見積項目テーブル
 *
 * Task 9.1: EstimateItemTableコンポーネントの実装
 *
 * 見積項目を階層ツリー形式で表示するテーブルコンポーネントです。
 * 展開/折りたたみ、項目選択、ドラッグ&ドロップ、自動金額計算表示などの機能を提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-1.1: タイトル行に名称・規格・単位・数量・単価・金額・備考のラベルを表示する
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.5: 合計行に全見積項目の金額合計を自動計算して表示する
 * - REQ-2.1: 見積項目に親子関係を設定可能とする
 * - REQ-2.2: 親項目を持つ見積項目を作成した場合、その項目を親項目の子として階層表示する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-2.4: 複数階層のネストをサポートする
 * - REQ-2.5: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-12.2: 見積項目の表示順序を変更した場合、ドラッグ&ドロップで順序を変更可能とする
 *
 * @module components/estimate/EstimateItemTable
 */

import { useCallback } from 'react';
import { EstimateItemRow } from './EstimateItemRow';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateItemTableコンポーネントのProps
 */
export interface EstimateItemTableProps {
  /** 見積項目の階層データ */
  items: EstimateItemHierarchyEdit[];
  /** 選択中の項目ID */
  selectedItemId?: string | null;
  /** ドラッグ可能かどうか */
  draggable?: boolean;
  /** 項目選択コールバック */
  onItemSelect?: (itemId: string) => void;
  /** 展開/折りたたみコールバック */
  onToggleExpand?: (itemId: string) => void;
  /** 行フィールド変更コールバック */
  onLineChange?: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;
  /** ドラッグ開始コールバック */
  onDragStart?: (itemId: string) => void;
  /** ドロップコールバック */
  onDrop?: (sourceId: string, targetId: string) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  table: {
    width: '100%',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr 120px 80px 100px 100px 120px 1fr',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    fontSize: '13px',
    color: '#374151',
  } as React.CSSProperties,
  headerCell: {
    textAlign: 'center' as const,
  },
  headerCellType: {
    textAlign: 'center' as const,
    fontSize: '12px',
    color: '#6b7280',
  },
  body: {
    maxHeight: '600px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  itemWrapper: {
    position: 'relative' as const,
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  itemWrapperSelected: {
    backgroundColor: '#eff6ff',
  },
  expandButton: {
    position: 'absolute' as const,
    left: '4px',
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
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    color: '#6b7280',
    fontSize: '14px',
  } as React.CSSProperties,
  emptyIcon: {
    width: '48px',
    height: '48px',
    marginBottom: '16px',
    color: '#d1d5db',
  },
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

/**
 * 空状態アイコン
 */
function EmptyIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={styles.emptyIcon}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/**
 * 階層項目レンダリングのProps
 */
interface ItemRendererProps {
  item: EstimateItemHierarchyEdit;
  level: number;
  selectedItemId?: string | null;
  draggable?: boolean;
  onItemSelect?: (itemId: string) => void;
  onToggleExpand?: (itemId: string) => void;
  onLineChange?: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;
}

/**
 * 階層項目レンダラー
 */
function ItemRenderer({
  item,
  level,
  selectedItemId,
  draggable = false,
  onItemSelect,
  onToggleExpand,
  onLineChange,
}: ItemRendererProps) {
  const hasChildren = item.children.length > 0;
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

  const handleToggleExpand = useCallback(() => {
    onToggleExpand?.(item.id);
  }, [item.id, onToggleExpand]);

  const wrapperStyle: React.CSSProperties = {
    ...styles.itemWrapper,
    ...(isSelected ? styles.itemWrapperSelected : {}),
    paddingLeft: `${level * 16}px`,
  };

  return (
    <>
      <div
        style={wrapperStyle}
        data-testid={`estimate-item-${item.id}`}
        data-selected={isSelected.toString()}
        onClick={handleClick}
        draggable={draggable}
      >
        {/* 展開/折りたたみボタン */}
        {hasChildren && (
          <button
            type="button"
            style={{
              ...styles.expandButton,
              left: `${level * 16 + 4}px`,
            }}
            onClick={handleToggleExpand}
            aria-label={item.isExpanded ? '折りたたむ' : '展開する'}
            data-expand-button
          >
            <ChevronIcon isExpanded={item.isExpanded} />
          </button>
        )}

        {/* 項目行（3行1セット） */}
        <EstimateItemRow
          itemId={item.id}
          lines={item.lines}
          indentLevel={hasChildren ? 1 : 0} // 展開ボタン分のスペース
          isSelected={isSelected}
          onLineChange={onLineChange}
        />
      </div>

      {/* 子項目（展開時のみ） */}
      {item.isExpanded &&
        item.children.map((child) => (
          <ItemRenderer
            key={child.id}
            item={child}
            level={level + 1}
            selectedItemId={selectedItemId}
            draggable={draggable}
            onItemSelect={onItemSelect}
            onToggleExpand={onToggleExpand}
            onLineChange={onLineChange}
          />
        ))}
    </>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積項目テーブル
 *
 * 見積項目を階層ツリー形式で表示します。
 * 展開/折りたたみ、項目選択、インデント表示などの機能を提供します。
 *
 * @example
 * ```tsx
 * const { items, updateLine, toggleExpanded } = useEstimateEditor({ ... });
 *
 * <EstimateItemTable
 *   items={items}
 *   selectedItemId={selectedId}
 *   onItemSelect={setSelectedId}
 *   onToggleExpand={toggleExpanded}
 *   onLineChange={updateLine}
 * />
 * ```
 */
export function EstimateItemTable({
  items,
  selectedItemId,
  draggable = false,
  onItemSelect,
  onToggleExpand,
  onLineChange,
}: EstimateItemTableProps) {
  return (
    <div style={styles.table} aria-label="見積項目テーブル">
      {/* ヘッダー行 */}
      <div aria-hidden="true">
        <div style={styles.headerRow}>
          <div style={styles.headerCellType}>種別</div>
          <div style={styles.headerCell}>名称</div>
          <div style={styles.headerCell}>規格</div>
          <div style={styles.headerCell}>単位</div>
          <div style={styles.headerCell}>数量</div>
          <div style={styles.headerCell}>単価</div>
          <div style={styles.headerCell}>金額</div>
          <div style={styles.headerCell}>備考</div>
        </div>
      </div>

      {/* ボディ */}
      <div style={styles.body}>
        {items.length === 0 ? (
          <div style={styles.emptyState}>
            <EmptyIcon />
            <span>見積項目がありません</span>
          </div>
        ) : (
          items.map((item) => (
            <ItemRenderer
              key={item.id}
              item={item}
              level={0}
              selectedItemId={selectedItemId}
              draggable={draggable}
              onItemSelect={onItemSelect}
              onToggleExpand={onToggleExpand}
              onLineChange={onLineChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default EstimateItemTable;
