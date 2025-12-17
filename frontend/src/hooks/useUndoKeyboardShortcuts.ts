/**
 * @fileoverview Undo/Redo キーボードショートカットフック
 *
 * Task 17.3: キーボードショートカットを実装する
 * - Ctrl/Cmd+Z（Undo）
 * - Ctrl/Cmd+Shift+Z（Redo）
 * - Ctrl+Y（代替Redo、Windows向け）
 *
 * Requirements:
 * - 11.3: キーボードショートカット（Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z）でUndo/Redoを実行する
 *
 * @see design.md - UndoManager State Management
 */

import { useEffect, useCallback } from 'react';
import type { IUndoManager } from '../services/UndoManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useUndoKeyboardShortcuts フックの引数
 */
export interface UseUndoKeyboardShortcutsOptions {
  /** UndoManager インスタンス */
  undoManager: IUndoManager;
  /** ショートカットを有効にするかどうか */
  enabled: boolean;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 対象の要素がテキスト入力可能な要素かどうかを判定
 *
 * input, textarea, contenteditable要素ではブラウザ標準の
 * Undo/Redoを使用するため、カスタムショートカットを無効化する。
 *
 * @param element 判定対象の要素
 * @returns テキスト入力可能な要素の場合true
 */
function isTextInputElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  // input要素
  if (element instanceof HTMLInputElement) {
    // type="button", type="submit" などは除外
    const textInputTypes = [
      'text',
      'password',
      'email',
      'number',
      'search',
      'tel',
      'url',
      'date',
      'datetime-local',
      'month',
      'time',
      'week',
    ];
    return textInputTypes.includes(element.type);
  }

  // textarea要素
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  // contenteditable要素
  // isContentEditableプロパティに加え、属性もチェック（jsdom互換性）
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}

// ============================================================================
// フック
// ============================================================================

/**
 * Undo/Redo キーボードショートカットを提供するフック
 *
 * Ctrl/Cmd+Z で Undo、Ctrl/Cmd+Shift+Z (または Ctrl+Y) で Redo を実行します。
 * テキスト入力要素にフォーカスがある場合は、ブラウザ標準の動作を優先します。
 *
 * @example
 * ```tsx
 * const undoManager = new UndoManager();
 *
 * useUndoKeyboardShortcuts({
 *   undoManager,
 *   enabled: true,
 * });
 * ```
 */
export function useUndoKeyboardShortcuts({
  undoManager,
  enabled,
}: UseUndoKeyboardShortcutsOptions): void {
  /**
   * キーダウンイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // テキスト入力要素にフォーカスがある場合はブラウザ標準の動作を優先
      if (isTextInputElement(event.target)) {
        return;
      }

      // 修飾キーのチェック（Ctrl または Cmd）
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) {
        return;
      }

      // キーの正規化（大文字小文字を区別しない）
      const key = event.key.toLowerCase();

      // Ctrl/Cmd+Shift+Z または Ctrl+Y → Redo
      if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey)) {
        if (undoManager.canRedo()) {
          event.preventDefault();
          undoManager.redo();
        }
        return;
      }

      // Ctrl/Cmd+Z → Undo
      if (key === 'z' && !event.shiftKey) {
        if (undoManager.canUndo()) {
          event.preventDefault();
          undoManager.undo();
        }
        return;
      }
    },
    [undoManager]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    document.addEventListener('keydown', handleKeyDown);

    // クリーンアップ
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
