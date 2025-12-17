/**
 * @fileoverview 未保存変更の検出フック
 *
 * Task 19: 未保存変更の検出を実装する
 *
 * - isDirtyフラグの管理
 * - ページ離脱時の確認ダイアログ（beforeunload）
 *
 * @see requirements.md - 要件9.3
 * @see design.md - AnnotationEditorState
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * デフォルトの確認メッセージ
 */
const DEFAULT_MESSAGE = '保存されていない変更があります。このページを離れますか？';

/**
 * useUnsavedChanges フックのオプション
 */
export interface UseUnsavedChangesOptions {
  /**
   * 初期のisDirty状態
   * @default false
   */
  initialDirty?: boolean;

  /**
   * beforeunloadイベントの有効/無効
   * @default true
   */
  enabled?: boolean;

  /**
   * 確認ダイアログのメッセージ
   * @default '保存されていない変更があります。このページを離れますか？'
   */
  message?: string;

  /**
   * isDirty状態が変更されたときのコールバック
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

/**
 * useUnsavedChanges フックの戻り値
 */
export interface UseUnsavedChangesResult {
  /**
   * 未保存の変更があるかどうか
   */
  isDirty: boolean;

  /**
   * isDirty状態を設定する
   * @param dirty 新しいisDirty状態
   */
  setDirty: (dirty: boolean) => void;

  /**
   * 変更があったとしてマークする（isDirtyをtrueに設定）
   */
  markAsChanged: () => void;

  /**
   * 保存されたとしてマークする（isDirtyをfalseに設定）
   */
  markAsSaved: () => void;

  /**
   * isDirty状態をリセットする（falseに設定）
   */
  reset: () => void;

  /**
   * ナビゲーション前の確認を行う
   * isDirty=falseの場合は常にtrueを返す
   * isDirty=trueの場合はwindow.confirmで確認を求める
   * @returns ナビゲーションを続行してよい場合はtrue
   */
  confirmNavigation: () => boolean;
}

/**
 * 未保存変更の検出フック
 *
 * isDirtyフラグを管理し、ページ離脱時の確認ダイアログ（beforeunload）を提供する。
 *
 * @example
 * ```tsx
 * function AnnotationEditor() {
 *   const { isDirty, markAsChanged, markAsSaved, confirmNavigation } = useUnsavedChanges();
 *
 *   const handleChange = () => {
 *     // 注釈が変更された
 *     markAsChanged();
 *   };
 *
 *   const handleSave = async () => {
 *     await saveToServer();
 *     markAsSaved();
 *   };
 *
 *   const handleNavigate = () => {
 *     if (confirmNavigation()) {
 *       navigate('/other-page');
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {isDirty && <span>未保存の変更があります</span>}
 *       <button onClick={handleSave}>保存</button>
 *       <button onClick={handleNavigate}>戻る</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @param options フックオプション
 * @returns 未保存変更の状態と操作関数
 */
export function useUnsavedChanges(options: UseUnsavedChangesOptions = {}): UseUnsavedChangesResult {
  const {
    initialDirty = false,
    enabled = true,
    message = DEFAULT_MESSAGE,
    onDirtyChange,
  } = options;

  // isDirty状態
  const [isDirty, setIsDirtyState] = useState(initialDirty);

  // 前回のisDirty値（コールバックの重複呼び出し防止用）
  const prevDirtyRef = useRef(initialDirty);

  // 現在のisDirty値（beforeunloadハンドラから参照するため）
  const isDirtyRef = useRef(isDirty);

  // 現在のmessage値（beforeunloadハンドラから参照するため）
  const messageRef = useRef(message);

  // refs を最新の値に更新
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  /**
   * isDirty状態を設定する
   */
  const setDirty = useCallback((dirty: boolean) => {
    setIsDirtyState((prev) => {
      // 同じ値の場合は状態を更新しない
      if (prev === dirty) {
        return prev;
      }
      return dirty;
    });
  }, []);

  /**
   * 変更があったとしてマークする
   */
  const markAsChanged = useCallback(() => {
    setDirty(true);
  }, [setDirty]);

  /**
   * 保存されたとしてマークする
   */
  const markAsSaved = useCallback(() => {
    setDirty(false);
  }, [setDirty]);

  /**
   * isDirty状態をリセットする
   */
  const reset = useCallback(() => {
    setDirty(false);
  }, [setDirty]);

  /**
   * ナビゲーション前の確認を行う
   */
  const confirmNavigation = useCallback((): boolean => {
    if (!isDirtyRef.current) {
      return true;
    }

    const confirmed = window.confirm(messageRef.current);
    if (confirmed) {
      // ユーザーが確認した場合はisDirtyをfalseに
      setIsDirtyState(false);
    }
    return confirmed;
  }, []);

  // onDirtyChangeコールバックの呼び出し
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      if (onDirtyChange) {
        onDirtyChange(isDirty);
      }
    }
  }, [isDirty, onDirtyChange]);

  // beforeunloadイベントハンドラ
  useEffect(() => {
    // 無効化されている場合、またはisDirtyがfalseの場合はリスナーを登録しない
    if (!enabled || !isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) {
        return;
      }

      // 標準的なbeforeunloadの処理
      event.preventDefault();
      // Chrome requires returnValue to be set
      event.returnValue = messageRef.current;
      return messageRef.current;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, isDirty]);

  return {
    isDirty,
    setDirty,
    markAsChanged,
    markAsSaved,
    reset,
    confirmNavigation,
  };
}

export default useUnsavedChanges;
