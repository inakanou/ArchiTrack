/**
 * @fileoverview 数量項目アクションメニューコンポーネント
 *
 * Task 50.1: アクションメニューコンポーネントを実装する
 *
 * 数量項目の行アクション（上へ移動・下へ移動・コピー・削除）を
 * 単一のドロップダウンメニューに統合する。
 *
 * Requirements:
 * - 36.2: アクションメニューボタンクリックでドロップダウン表示
 * - 36.6: 最上位項目で「上へ移動」をdisabled
 * - 36.7: 最下位項目で「下へ移動」をdisabled
 * - 36.9: メニュー外クリックでドロップダウン閉じる
 */

import { useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

export interface QuantityItemActionMenuProps {
  /** メニュー開閉状態 */
  isOpen: boolean;
  /** メニュー開閉トグルコールバック */
  onToggle: () => void;
  /** メニューを閉じるコールバック */
  onClose: () => void;
  /** 上に移動コールバック */
  onMoveUp: () => void;
  /** 下に移動コールバック */
  onMoveDown: () => void;
  /** コピーコールバック */
  onCopy: () => void;
  /** 削除コールバック */
  onDelete: () => void;
  /** 上に移動可能かどうか（falseの場合はdisabled） */
  canMoveUp: boolean;
  /** 下に移動可能かどうか（falseの場合はdisabled） */
  canMoveDown: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  wrapper: {
    position: 'relative' as const,
  } as React.CSSProperties,
  menuButton: {
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
  dropdown: {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 10,
    minWidth: '140px',
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
  menuItemDisabled: {
    color: '#9ca3af',
    cursor: 'default',
  } as React.CSSProperties,
  menuItemDelete: {
    color: '#dc2626',
  } as React.CSSProperties,
  separator: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '4px 0',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

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

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 数量項目アクションメニュー
 *
 * 三点メニューボタンと、クリック時に表示されるドロップダウンメニュー。
 * 「上へ移動」「下へ移動」「コピー」「削除」の操作を提供する。
 */
export default function QuantityItemActionMenu({
  isOpen,
  onToggle,
  onClose,
  onMoveUp,
  onMoveDown,
  onCopy,
  onDelete,
  canMoveUp,
  canMoveDown,
}: QuantityItemActionMenuProps) {
  const handleMoveUp = useCallback(() => {
    if (canMoveUp) {
      onMoveUp();
      onClose();
    }
  }, [canMoveUp, onMoveUp, onClose]);

  const handleMoveDown = useCallback(() => {
    if (canMoveDown) {
      onMoveDown();
      onClose();
    }
  }, [canMoveDown, onMoveDown, onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
  }, [onDelete, onClose]);

  return (
    <div
      style={styles.wrapper}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        style={styles.menuButton}
        onClick={onToggle}
        aria-label="アクション"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreIcon />
      </button>

      {isOpen && (
        <div role="menu" style={styles.dropdown}>
          {/* 上へ移動 */}
          <button
            type="button"
            role="menuitem"
            style={{
              ...styles.menuItem,
              ...(canMoveUp ? {} : styles.menuItemDisabled),
            }}
            onClick={handleMoveUp}
            disabled={!canMoveUp}
          >
            <span style={{ fontSize: '14px' }}>↑</span>
            上へ移動
          </button>

          {/* 下へ移動 */}
          <button
            type="button"
            role="menuitem"
            style={{
              ...styles.menuItem,
              ...(canMoveDown ? {} : styles.menuItemDisabled),
            }}
            onClick={handleMoveDown}
            disabled={!canMoveDown}
          >
            <span style={{ fontSize: '14px' }}>↓</span>
            下へ移動
          </button>

          {/* コピー */}
          <button type="button" role="menuitem" style={styles.menuItem} onClick={handleCopy}>
            <span style={{ fontSize: '14px' }}>📋</span>
            コピー
          </button>

          {/* セパレーター */}
          <div style={styles.separator} />

          {/* 削除（赤文字） */}
          <button
            type="button"
            role="menuitem"
            style={{
              ...styles.menuItem,
              ...styles.menuItemDelete,
            }}
            onClick={handleDelete}
          >
            <span style={{ fontSize: '14px' }}>🗑</span>
            削除
          </button>
        </div>
      )}
    </div>
  );
}
