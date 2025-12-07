/**
 * @fileoverview useKeyboardNavigation カスタムフック
 *
 * Task 12.1: キーボードナビゲーションの実装
 *
 * キーボードナビゲーションを管理するためのカスタムフック。
 * リスト、メニュー、グリッドなどのコンポーネントで使用可能。
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示
 */

import { useCallback, type RefObject, type KeyboardEvent } from 'react';
import {
  getFocusableElements,
  isActivationKey,
  isNavigationKey,
  focusFirst,
  focusLast,
  focusNext,
  focusPrevious,
} from '../utils/keyboard-navigation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useKeyboardNavigation フックのオプション
 */
export interface UseKeyboardNavigationOptions {
  /** コンテナ要素のRef */
  containerRef: RefObject<HTMLElement | null>;
  /** 循環ナビゲーションを有効にするか */
  circular?: boolean;
  /** 水平方向のナビゲーションを有効にするか */
  horizontal?: boolean;
  /** キーイベントが発生したときのコールバック */
  onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * アイテムのプロパティオプション
 */
export interface ItemPropsOptions {
  /** アクティベーション時のコールバック */
  onActivate?: () => void;
  /** カスタムonKeyDownハンドラ */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  /** カスタムonClickハンドラ */
  onClick?: () => void;
}

/**
 * useKeyboardNavigation フックの戻り値
 */
export interface UseKeyboardNavigationReturn {
  /** アイテム要素のプロパティを取得する関数 */
  getItemProps: (
    index: number,
    options?: ItemPropsOptions
  ) => {
    tabIndex: number;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onClick?: () => void;
  };
  /** 最初の要素にフォーカスを移動 */
  focusFirstItem: () => void;
  /** 最後の要素にフォーカスを移動 */
  focusLastItem: () => void;
  /** 次の要素にフォーカスを移動 */
  focusNextItem: () => void;
  /** 前の要素にフォーカスを移動 */
  focusPreviousItem: () => void;
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * キーボードナビゲーションを管理するカスタムフック
 *
 * @param options - フックオプション
 * @returns キーボードナビゲーション用のプロパティとメソッド
 *
 * @example
 * ```tsx
 * function MyList() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { getItemProps } = useKeyboardNavigation({
 *     containerRef,
 *     circular: true,
 *   });
 *
 *   return (
 *     <div ref={containerRef} role="listbox">
 *       {items.map((item, index) => (
 *         <div
 *           key={item.id}
 *           {...getItemProps(index, {
 *             onActivate: () => handleSelect(item),
 *           })}
 *         >
 *           {item.name}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKeyboardNavigation(
  options: UseKeyboardNavigationOptions
): UseKeyboardNavigationReturn {
  const {
    containerRef,
    circular = false,
    horizontal = false,
    onKeyDown: externalOnKeyDown,
  } = options;

  /**
   * 最初の要素にフォーカスを移動
   */
  const focusFirstItem = useCallback(() => {
    focusFirst(containerRef.current);
  }, [containerRef]);

  /**
   * 最後の要素にフォーカスを移動
   */
  const focusLastItem = useCallback(() => {
    focusLast(containerRef.current);
  }, [containerRef]);

  /**
   * 次の要素にフォーカスを移動
   */
  const focusNextItem = useCallback(() => {
    focusNext(containerRef.current, { circular });
  }, [containerRef, circular]);

  /**
   * 前の要素にフォーカスを移動
   */
  const focusPreviousItem = useCallback(() => {
    focusPrevious(containerRef.current, { circular });
  }, [containerRef, circular]);

  /**
   * キーボードイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, itemOnActivate?: () => void) => {
      // 外部ハンドラを先に呼び出す
      externalOnKeyDown?.(event);

      // アクティベーションキー（Enter/Space）の処理
      if (isActivationKey(event.key) && itemOnActivate) {
        event.preventDefault();
        itemOnActivate();
        return;
      }

      // ナビゲーションキーの処理
      if (isNavigationKey(event.key)) {
        const container = containerRef.current;
        if (!container) return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const currentIndex = focusable.findIndex((el) => el === document.activeElement);
        if (currentIndex === -1) return;

        // 垂直ナビゲーション
        const downKey = horizontal ? 'ArrowRight' : 'ArrowDown';
        const upKey = horizontal ? 'ArrowLeft' : 'ArrowUp';

        switch (event.key) {
          case downKey:
          case 'ArrowDown':
          case 'ArrowRight':
            if (
              event.key === downKey ||
              (!horizontal && event.key === 'ArrowDown') ||
              (horizontal && event.key === 'ArrowRight')
            ) {
              event.preventDefault();
              if (currentIndex < focusable.length - 1) {
                focusable[currentIndex + 1]?.focus();
              } else if (circular) {
                focusable[0]?.focus();
              }
            }
            break;
          case upKey:
          case 'ArrowUp':
          case 'ArrowLeft':
            if (
              event.key === upKey ||
              (!horizontal && event.key === 'ArrowUp') ||
              (horizontal && event.key === 'ArrowLeft')
            ) {
              event.preventDefault();
              if (currentIndex > 0) {
                focusable[currentIndex - 1]?.focus();
              } else if (circular) {
                focusable[focusable.length - 1]?.focus();
              }
            }
            break;
          case 'Home':
            event.preventDefault();
            focusable[0]?.focus();
            break;
          case 'End':
            event.preventDefault();
            focusable[focusable.length - 1]?.focus();
            break;
        }
      }
    },
    [containerRef, circular, horizontal, externalOnKeyDown]
  );

  /**
   * アイテム要素のプロパティを取得
   */
  const getItemProps = useCallback(
    (
      _index: number,
      itemOptions: ItemPropsOptions = {}
    ): {
      tabIndex: number;
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
      onClick?: () => void;
    } => {
      const { onActivate, onKeyDown: itemOnKeyDown, onClick } = itemOptions;

      return {
        tabIndex: 0,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          itemOnKeyDown?.(event);
          if (!event.defaultPrevented) {
            handleKeyDown(event, onActivate);
          }
        },
        onClick: onClick || onActivate,
      };
    },
    [handleKeyDown]
  );

  return {
    getItemProps,
    focusFirstItem,
    focusLastItem,
    focusNextItem,
    focusPreviousItem,
  };
}
