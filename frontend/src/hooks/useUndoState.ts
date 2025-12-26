/**
 * @fileoverview Undo/Redo 状態管理フック
 *
 * Task 17.4: 履歴クリア処理を実装する
 * - 保存時の履歴クリア
 * - canUndo/canRedoの状態更新
 *
 * Requirements:
 * - 11.5: 注釈データを保存するとき、操作履歴をクリアする
 *
 * @see design.md - UndoManager State Management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { IUndoManager, UndoManagerState } from '../services/UndoManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useUndoState フックの引数
 */
export interface UseUndoStateOptions {
  /** UndoManager インスタンス */
  undoManager: IUndoManager;
}

/**
 * useUndoState フックの戻り値
 */
export interface UseUndoStateReturn {
  /** Undo可能かどうか */
  canUndo: boolean;
  /** Redo可能かどうか */
  canRedo: boolean;
  /**
   * 保存時に履歴をクリアする
   *
   * 注釈データをサーバーに保存した後に呼び出します。
   * Undo/Redo スタックをクリアし、canUndo/canRedo を false に更新します。
   */
  clearOnSave: () => void;
}

// ============================================================================
// フック
// ============================================================================

/**
 * Undo/Redo 状態管理フック
 *
 * UndoManager の canUndo/canRedo 状態をReactの状態として管理し、
 * 保存時に履歴をクリアする関数を提供します。
 *
 * @example
 * ```tsx
 * const undoManager = new UndoManager();
 * const { canUndo, canRedo, clearOnSave } = useUndoState({ undoManager });
 *
 * // 保存ボタンのハンドラ
 * const handleSave = async () => {
 *   await saveAnnotations(canvasData);
 *   clearOnSave(); // 履歴をクリア
 * };
 *
 * return (
 *   <div>
 *     <button disabled={!canUndo} onClick={() => undoManager.undo()}>Undo</button>
 *     <button disabled={!canRedo} onClick={() => undoManager.redo()}>Redo</button>
 *     <button onClick={handleSave}>Save</button>
 *   </div>
 * );
 * ```
 */
export function useUndoState({ undoManager }: UseUndoStateOptions): UseUndoStateReturn {
  // Undo/Redo 可否の状態
  const [state, setState] = useState<UndoManagerState>(() => ({
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
  }));

  // undoManagerの参照を保持（初回マウント時の判定用）
  const prevUndoManagerRef = useRef<IUndoManager | null>(null);

  /**
   * UndoManager の状態変更時のコールバック
   */
  const handleChange = useCallback((newState: UndoManagerState) => {
    setState(newState);
  }, []);

  /**
   * 保存時に履歴をクリア
   *
   * - UndoManager の clear() を呼び出し
   * - canUndo/canRedo を false に更新
   */
  const clearOnSave = useCallback(() => {
    undoManager.clear();
    // Note: UndoManager.clear() が内部で notifyChange() を呼ぶため、
    // setState は onChange コールバック経由で呼ばれます
  }, [undoManager]);

  useEffect(() => {
    // undoManagerが変更された場合のみ状態を同期
    // 初回マウント時は useState の初期値が使用されるため不要
    if (prevUndoManagerRef.current !== null && prevUndoManagerRef.current !== undoManager) {
      // undoManagerが変更された場合、新しい状態に同期
      // eslint-disable-next-line react-hooks/set-state-in-effect -- undoManager変更時の同期処理として必要
      setState({
        canUndo: undoManager.canUndo(),
        canRedo: undoManager.canRedo(),
      });
    }
    prevUndoManagerRef.current = undoManager;

    // UndoManager の onChange コールバックを設定
    undoManager.setOnChange(handleChange);

    // クリーンアップ: onChange コールバックを解除
    return () => {
      undoManager.setOnChange(null);
    };
  }, [undoManager, handleChange]);

  return {
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    clearOnSave,
  };
}
