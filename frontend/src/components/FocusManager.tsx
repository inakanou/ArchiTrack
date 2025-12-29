import { useEffect, useRef } from 'react';
import type { FocusManagerProps } from '../types/focus-manager.types';

/**
 * フォーカス可能な要素のセレクタ
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 要素内のフォーカス可能な要素を取得
 */
function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * フォーカス管理コンポーネント
 *
 * モーダル表示時のフォーカストラップとフォーカス復帰を管理します。
 */
function FocusManager({
  children,
  isOpen,
  onClose,
  closeOnEscape = true,
  closeOnOutsideClick = false,
  initialFocusRef,
  returnFocusRef,
  ariaLabel,
  ariaLabelledBy,
}: FocusManagerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // モーダルが開いたとき、元のフォーカス要素を保存して初期フォーカスを設定
  useEffect(() => {
    if (!isOpen) return;

    // 元のフォーカス要素を保存
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // 初期フォーカスを設定
    const focusableElements = getFocusableElements(dialogRef.current);
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (focusableElements.length > 0) {
      focusableElements[0]?.focus();
    }
  }, [isOpen, initialFocusRef]);

  // モーダルが閉じたとき、元のフォーカス位置に戻る
  useEffect(() => {
    // モーダルが開いている状態から閉じる状態に変わったとき
    if (!isOpen && previousActiveElementRef.current) {
      // 少し遅延させてフォーカスを戻す（DOM更新後）
      setTimeout(() => {
        if (returnFocusRef?.current) {
          returnFocusRef.current.focus();
        } else if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      }, 0);
    }
  }, [isOpen, returnFocusRef]);

  // キーボードイベントハンドラ
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escapeキーでモーダルを閉じる
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
        return;
      }

      // Tab/Shift+Tabキーでフォーカストラップ
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements(dialogRef.current);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const currentElement = document.activeElement as HTMLElement;

        if (e.shiftKey) {
          // Shift+Tab: 前の要素へ
          if (currentElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: 次の要素へ
          if (currentElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // モーダルが開いていない場合、何も表示しない
  if (!isOpen) {
    return null;
  }

  // オーバーレイクリックハンドラ
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      data-testid="focus-manager-overlay"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={0}
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '20px',
          maxWidth: '90%',
          maxHeight: '90%',
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default FocusManager;
