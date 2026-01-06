/**
 * @fileoverview 数量項目行コンポーネント
 *
 * Task 5.3: 数量項目行コンポーネントを実装する
 *
 * Requirements:
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 6.1: 選択した数量項目をコピーする
 */

import { useState, useCallback } from 'react';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * QuantityItemRowコンポーネントのProps
 */
export interface QuantityItemRowProps {
  /** 項目データ */
  item: QuantityItemDetail;
  /** 選択状態 */
  isSelected?: boolean;
  /** 項目更新コールバック */
  onUpdate?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDelete?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopy?: (itemId: string) => void;
  /** 選択状態変更コールバック */
  onSelectionChange?: (itemId: string, selected: boolean) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr 1fr 100px 100px 80px 80px 100px 120px',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  rowSelected: {
    backgroundColor: '#eff6ff',
  } as React.CSSProperties,
  checkboxCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#2563eb',
  } as React.CSSProperties,
  cell: {
    fontSize: '13px',
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  primaryCell: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  quantityCell: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1f2937',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  unitCell: {
    fontSize: '13px',
    color: '#6b7280',
  } as React.CSSProperties,
  remarksCell: {
    fontSize: '12px',
    color: '#6b7280',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  actionsCell: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'background-color 0.2s, color 0.2s',
  } as React.CSSProperties,
  deleteButton: {
    color: '#dc2626',
  } as React.CSSProperties,
  menuWrapper: {
    position: 'relative' as const,
  } as React.CSSProperties,
  menu: {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 10,
    minWidth: '120px',
    padding: '4px 0',
  } as React.CSSProperties,
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#374151',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left' as const,
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 削除アイコン
 */
function TrashIcon() {
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
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * 三点メニューアイコン
 */
function MoreIcon() {
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
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

/**
 * コピーアイコン
 */
function CopyIcon() {
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
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量項目行
 *
 * 項目のデータをテーブル行形式で表示し、選択・編集・削除・コピー機能を提供する。
 */
export default function QuantityItemRow({
  item,
  isSelected = false,
  onUpdate: _onUpdate,
  onDelete,
  onCopy,
  onSelectionChange,
}: QuantityItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /**
   * 選択状態を切り替え
   */
  const handleSelectionChange = useCallback(() => {
    onSelectionChange?.(item.id, !isSelected);
  }, [item.id, isSelected, onSelectionChange]);

  /**
   * 削除ハンドラ
   */
  const handleDelete = useCallback(() => {
    onDelete?.(item.id);
  }, [item.id, onDelete]);

  /**
   * コピーハンドラ
   */
  const handleCopy = useCallback(() => {
    onCopy?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onCopy]);

  /**
   * メニュー開閉を切り替え
   */
  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  /**
   * メニューを閉じる
   */
  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  return (
    <div
      style={{ ...styles.row, ...(isSelected ? styles.rowSelected : {}) }}
      role="row"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          handleCloseMenu();
        }
      }}
    >
      {/* 選択チェックボックス */}
      <div style={styles.checkboxCell} role="cell">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleSelectionChange}
          style={styles.checkbox}
          aria-label="選択"
        />
      </div>

      {/* 大項目 */}
      <div style={styles.cell} role="cell" title={item.majorCategory}>
        {item.majorCategory}
        {item.middleCategory && <span> / {item.middleCategory}</span>}
      </div>

      {/* 工種 */}
      <div style={styles.cell} role="cell" title={item.workType}>
        {item.workType}
      </div>

      {/* 名称 */}
      <div style={styles.primaryCell} role="cell" title={item.name}>
        {item.name}
      </div>

      {/* 規格 */}
      <div style={styles.cell} role="cell" title={item.specification || undefined}>
        {item.specification || '-'}
      </div>

      {/* 数量 */}
      <div style={styles.quantityCell} role="cell">
        {item.quantity}
      </div>

      {/* 単位 */}
      <div style={styles.unitCell} role="cell">
        {item.unit}
      </div>

      {/* 備考 */}
      <div style={styles.remarksCell} role="cell" title={item.remarks || undefined}>
        {item.remarks || ''}
      </div>

      {/* アクション */}
      <div style={styles.actionsCell} role="cell">
        {/* 削除ボタン */}
        <button
          type="button"
          style={{ ...styles.actionButton, ...styles.deleteButton }}
          onClick={handleDelete}
          aria-label="削除"
          title="削除"
        >
          <TrashIcon />
        </button>

        {/* アクションメニュー */}
        <div style={styles.menuWrapper}>
          <button
            type="button"
            style={styles.actionButton}
            onClick={handleToggleMenu}
            aria-label="アクション"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          >
            <MoreIcon />
          </button>

          {isMenuOpen && (
            <div style={styles.menu} role="menu">
              <button type="button" style={styles.menuItem} onClick={handleCopy} role="menuitem">
                <CopyIcon />
                コピー
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
