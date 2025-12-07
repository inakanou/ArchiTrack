/**
 * @fileoverview キーボードナビゲーション ユーティリティ
 *
 * Task 12.1: キーボードナビゲーションの実装
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * フォーカス可能な要素のセレクタ
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

/**
 * フォーカス状態の視覚的スタイル（WCAG 2.1 準拠）
 * Requirement 20.4: フォーカス状態を視覚的に明確に表示
 */
export const FOCUS_VISIBLE_STYLES: React.CSSProperties = {
  outline: '2px solid #2563eb',
  outlineOffset: '2px',
};

/**
 * 高コントラストモード用のフォーカススタイル
 */
export const FOCUS_VISIBLE_HIGH_CONTRAST_STYLES: React.CSSProperties = {
  outline: '3px solid #000000',
  outlineOffset: '2px',
};

// ============================================================================
// キー判定関数
// ============================================================================

/**
 * アクティベーションキー（Enter/Space）かどうかを判定
 * Requirement 20.1: Enter/Spaceキーによる操作実行を実装
 *
 * @param key - キーボードイベントのキー
 * @returns アクティベーションキーの場合 true
 */
export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

/**
 * キャンセルキー（Escape）かどうかを判定
 *
 * @param key - キーボードイベントのキー
 * @returns キャンセルキーの場合 true
 */
export function isCancelKey(key: string): boolean {
  return key === 'Escape';
}

/**
 * ナビゲーションキー（矢印キー、Home/End）かどうかを判定
 *
 * @param key - キーボードイベントのキー
 * @returns ナビゲーションキーの場合 true
 */
export function isNavigationKey(key: string): boolean {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key);
}

// ============================================================================
// フォーカス操作関数
// ============================================================================

/**
 * コンテナ内のフォーカス可能な要素を取得
 *
 * @param container - コンテナ要素
 * @returns フォーカス可能な要素の配列
 */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * コンテナ内の最初のフォーカス可能な要素にフォーカスを当てる
 *
 * @param container - コンテナ要素
 */
export function focusFirst(container: HTMLElement | null): void {
  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[0]?.focus();
  }
}

/**
 * コンテナ内の最後のフォーカス可能な要素にフォーカスを当てる
 *
 * @param container - コンテナ要素
 */
export function focusLast(container: HTMLElement | null): void {
  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[focusable.length - 1]?.focus();
  }
}

/**
 * ナビゲーションオプション
 */
export interface NavigationOptions {
  /** 循環するかどうか（デフォルト: false） */
  circular?: boolean;
}

/**
 * コンテナ内の次のフォーカス可能な要素にフォーカスを当てる
 *
 * @param container - コンテナ要素
 * @param options - ナビゲーションオプション
 */
export function focusNext(container: HTMLElement | null, options: NavigationOptions = {}): void {
  const { circular = false } = options;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const currentIndex = focusable.findIndex((el) => el === document.activeElement);

  if (currentIndex === -1) {
    focusable[0]?.focus();
    return;
  }

  if (currentIndex < focusable.length - 1) {
    focusable[currentIndex + 1]?.focus();
  } else if (circular) {
    focusable[0]?.focus();
  }
}

/**
 * コンテナ内の前のフォーカス可能な要素にフォーカスを当てる
 *
 * @param container - コンテナ要素
 * @param options - ナビゲーションオプション
 */
export function focusPrevious(
  container: HTMLElement | null,
  options: NavigationOptions = {}
): void {
  const { circular = false } = options;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const currentIndex = focusable.findIndex((el) => el === document.activeElement);

  if (currentIndex === -1) {
    focusable[focusable.length - 1]?.focus();
    return;
  }

  if (currentIndex > 0) {
    focusable[currentIndex - 1]?.focus();
  } else if (circular) {
    focusable[focusable.length - 1]?.focus();
  }
}

// ============================================================================
// キーボードイベントハンドラ
// ============================================================================

/**
 * キーボードアクティベーションを処理
 * Requirement 20.1: Enter/Spaceキーによる操作実行を実装
 *
 * @param event - キーボードイベント
 * @param handler - アクティベーション時に呼び出すハンドラ
 *
 * @example
 * ```tsx
 * <div
 *   tabIndex={0}
 *   onKeyDown={(e) => handleKeyboardActivation(e, () => onClick())}
 * >
 *   Click me
 * </div>
 * ```
 */
export function handleKeyboardActivation(event: KeyboardEvent, handler: () => void): void {
  if (isActivationKey(event.key)) {
    event.preventDefault();
    handler();
  }
}

/**
 * 矢印キーナビゲーションを処理
 * Requirement 20.1: Tabキーによるフォーカス移動を実装
 *
 * @param event - キーボードイベント
 * @param container - コンテナ要素
 * @param options - ナビゲーションオプション
 *
 * @example
 * ```tsx
 * <div
 *   onKeyDown={(e) => handleArrowNavigation(e, containerRef.current)}
 * >
 *   <button>Button 1</button>
 *   <button>Button 2</button>
 * </div>
 * ```
 */
export function handleArrowNavigation(
  event: KeyboardEvent,
  container: HTMLElement | null,
  options: NavigationOptions = {}
): void {
  if (!isNavigationKey(event.key)) return;

  const { circular = false } = options;

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      focusNext(container, { circular });
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      focusPrevious(container, { circular });
      break;
    case 'Home':
      event.preventDefault();
      focusFirst(container);
      break;
    case 'End':
      event.preventDefault();
      focusLast(container);
      break;
  }
}

// ============================================================================
// React フック用ユーティリティ
// ============================================================================

/**
 * キーボードナビゲーション用のイベントハンドラを生成
 *
 * @param options - ナビゲーションオプション
 * @returns キーダウンイベントハンドラを返す関数
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * return (
 *   <div
 *     ref={containerRef}
 *     onKeyDown={(e) => createKeyboardNavigationHandler({ circular: true })(e, containerRef.current)}
 *   >
 *     ...
 *   </div>
 * );
 * ```
 */
export function createKeyboardNavigationHandler(options: NavigationOptions = {}) {
  return (event: KeyboardEvent, container: HTMLElement | null): void => {
    handleArrowNavigation(event, container, options);
  };
}

/**
 * キーボードアクティベーション用のイベントハンドラを生成
 *
 * @param handler - アクティベーション時に呼び出すハンドラ
 * @returns キーダウンイベントハンドラ
 *
 * @example
 * ```tsx
 * <div
 *   tabIndex={0}
 *   onKeyDown={createActivationHandler(() => onClick())}
 * >
 *   Click me
 * </div>
 * ```
 */
export function createActivationHandler(handler: () => void) {
  return (event: React.KeyboardEvent): void => {
    handleKeyboardActivation(event.nativeEvent, handler);
  };
}
