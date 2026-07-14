/**
 * @fileoverview 数量項目アクションメニューコンポーネント
 *
 * Task 50.1: アクションメニューコンポーネントを実装する
 * Task 69.1: ドロップダウンを Portal 描画へ変更しスクロール追従を実装する
 *
 * 数量項目の行アクション（上へ移動・下へ移動・コピー・削除）を
 * 単一のドロップダウンメニューに統合する。
 *
 * Requirements:
 * - 36.2: アクションメニューボタンクリックでドロップダウン表示
 * - 36.6: 最上位項目で「上へ移動」をdisabled
 * - 36.7: 最下位項目で「下へ移動」をdisabled
 * - 36.9: メニュー外クリックでドロップダウン閉じる
 * - 46.1-46.4: メニューを表示領域の境界で切り取らず全項目を表示する
 * - 46.5, 46.6: 水平・垂直スクロール時にメニューをボタン位置へ追従させる
 * - 46.7: 固定ヘッダー等の他要素より前面に表示する
 * - 46.10: メニュー項目の構成・活性制御・各操作の動作（REQ-36）は変更しない
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
// 定数
// ============================================================================

/**
 * ドロップダウンの幅（px）。
 * Portal 描画では祖先の包含ブロックを失い `right: 0` による右揃えが使えないため、
 * ボタン右端からこの幅を引いた位置を left として右揃えを再現する。
 */
const MENU_WIDTH = 140;

/** ボタン下端とドロップダウン上端の間隔（px） */
const MENU_GAP = 2;

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
    width: '22px',
    height: '22px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'background-color 0.2s, color 0.2s',
    padding: 0,
  } as React.CSSProperties,
  dropdown: {
    // Portal で document.body 直下に描画するため fixed 配置とする（REQ-46）。
    // 旧来は absolute（包含ブロックは wrapper）だったが、wrapper は数量項目テーブルの
    // 水平スクロールラッパー（QuantityGroupCard の itemTableWrapper: overflowX: auto /
    // overflowY: hidden = REQ-41 の実装）の内側にあるため、行の下へ開くドロップダウンが
    // そのパディングボックスでクリップされ「クリックしても表示されない」状態になっていた。
    // 祖先に overflow がある限り子孫の absolute 要素は必ずクリップされるため CSS では
    // 解決できず（overflow: visible に戻すと REQ-41 の水平スクロールが壊れる）、
    // 描画ツリーをスクロール領域の外へ出す Portal が唯一の解である。
    // 座標はアクションボタンの getBoundingClientRect から動的に与える。
    // 同一画面の AutocompleteInput.tsx が同じ根本原因を同じパターンで解決済み。
    position: 'fixed' as const,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    // body 直下に出すため、固定表示ヘッダー（QuantityTableEditPage の sticky ヘッダーは
    // zIndex: 50）より前面に来るよう十分高い z-index を設定する（REQ-46.7）。
    zIndex: 1000,
    minWidth: `${MENU_WIDTH}px`,
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Portal 描画するドロップダウンの fixed 配置座標（アクションボタンの位置から算出）
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);

  /**
   * アクションボタンの現在位置から Portal ドロップダウンの fixed 座標を再計算する。
   * ボタン直下（2px ギャップ）に、ボタン右端へ右揃えして配置する。
   */
  const updateDropdownRect = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownRect({ top: rect.bottom + MENU_GAP, left: rect.right - MENU_WIDTH });
  }, []);

  /**
   * メニュー表示中は、祖先要素のスクロール（数量項目テーブルの水平スクロールラッパーを含む）
   * およびウィンドウリサイズに追従して配置を更新する（REQ-46.5, 46.6）。
   * itemTableWrapper のスクロールイベントは window までバブルしないため、
   * capture: true で祖先のスクロールを捕捉することが必須である。
   */
  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    const handleReposition = () => updateDropdownRect();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, updateDropdownRect]);

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
        // Portal 描画によりドロップダウンは DOM ツリー上この wrapper の外側（document.body 直下）
        // にあるため、wrapper だけの内外判定ではメニュー項目へのフォーカス移動を「外側」と
        // 誤判定してしまう。ドロップダウン側の包含判定を併せて行い、REQ-36.9 の閉じ挙動を維持する。
        // NOTE: 閉じ判定そのもの（outside-click + Escape への移行、および
        //       EditableQuantityItemRow 側の二重 onBlur の撤去）は Task 69.2 の担当であり、
        //       本タスク（69.1）では現行の blur 方式を Portal 構成のまま成立させるに留める。
        const nextTarget = e.relatedTarget as Node | null;
        const stayedInside =
          nextTarget !== null &&
          (e.currentTarget.contains(nextTarget) ||
            (dropdownRef.current?.contains(nextTarget) ?? false));
        if (!stayedInside) {
          onClose();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        style={styles.menuButton}
        onClick={onToggle}
        aria-label="アクション"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreIcon />
      </button>

      {/* ドロップダウンメニュー。
          水平スクロールラッパー（itemTableWrapper の overflow）にクリップされないよう、
          Portal で document.body 直下に fixed 配置で描画する（REQ-46.1-46.4）。 */}
      {isOpen &&
        dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            style={{
              ...styles.dropdown,
              top: dropdownRect.top,
              left: dropdownRect.left,
            }}
          >
            {/* 上へ移動 */}
            <button
              type="button"
              role="menuitem"
              style={{
                ...styles.menuItem,
                ...(canMoveUp ? {} : styles.menuItemDisabled),
              }}
              // Portal 先でのクリックでもアクションボタンの blur が先行してメニューが
              // 閉じないよう、mousedown の既定動作（フォーカス移動）を抑止する。
              onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleMoveDown}
              disabled={!canMoveDown}
            >
              <span style={{ fontSize: '14px' }}>↓</span>
              下へ移動
            </button>

            {/* コピー */}
            <button
              type="button"
              role="menuitem"
              style={styles.menuItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopy}
            >
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDelete}
            >
              <span style={{ fontSize: '14px' }}>🗑</span>
              削除
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
