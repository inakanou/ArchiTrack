/**
 * @fileoverview 汎用自動保存フック
 *
 * Task 8.1: 自動保存機能を実装する
 *
 * Requirements:
 * - 11.5: 自動保存が有効な状態で、一定間隔で数量表を自動保存する
 *
 * Features:
 * - デバウンス付き自動保存
 * - ローカルストレージへのドラフト保存
 * - 保存ステータス管理
 * - リトライ機能
 * - コールバック対応
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

/**
 * 保存ステータス
 */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * useAutoSaveフックのオプション
 */
export interface UseAutoSaveOptions<T> {
  /**
   * 保存対象のデータ
   */
  data: T;

  /**
   * 保存関数
   */
  saveFn: (data: T) => Promise<void>;

  /**
   * デバウンス時間（ミリ秒）
   * @default 1500
   */
  debounceMs?: number;

  /**
   * 自動保存を有効にするか
   * @default false
   */
  enabled?: boolean;

  /**
   * 最大リトライ回数
   * @default 3
   */
  maxRetries?: number;

  /**
   * ローカルストレージのドラフトキー
   * 指定するとローカルストレージにドラフトを保存
   */
  draftKey?: string;

  /**
   * 保存成功時のコールバック
   */
  onSaveSuccess?: () => void;

  /**
   * 保存失敗時のコールバック
   */
  onSaveError?: (error: Error) => void;
}

/**
 * useAutoSaveフックの戻り値
 */
export interface UseAutoSaveResult<T> {
  /**
   * 現在の保存ステータス
   */
  status: AutoSaveStatus;

  /**
   * 保存中かどうか
   */
  isSaving: boolean;

  /**
   * 最後に保存した日時
   */
  lastSavedAt: Date | null;

  /**
   * エラーメッセージ
   */
  errorMessage: string | null;

  /**
   * 未保存の変更があるか
   */
  hasUnsavedChanges: boolean;

  /**
   * ドラフトが存在するか
   */
  hasDraft: boolean;

  /**
   * 保存をトリガー（デバウンス付き）
   */
  triggerSave: () => void;

  /**
   * 即座に保存（デバウンスなし）
   */
  saveNow: () => Promise<void>;

  /**
   * リトライ
   */
  retry: () => Promise<void>;

  /**
   * ドラフトを読み込む
   */
  loadDraft: () => T | null;

  /**
   * ドラフトをクリアする
   */
  clearDraft: () => void;
}

/**
 * 汎用自動保存フック
 *
 * @example
 * ```tsx
 * const { triggerSave, status, lastSavedAt } = useAutoSave({
 *   data: formData,
 *   saveFn: async (data) => {
 *     await api.save(data);
 *   },
 *   debounceMs: 1500,
 *   enabled: true,
 *   draftKey: 'my-form-draft',
 * });
 *
 * // 変更時にトリガー
 * const handleChange = (newData) => {
 *   setFormData(newData);
 *   triggerSave();
 * };
 * ```
 */
export function useAutoSave<T>(options: UseAutoSaveOptions<T>): UseAutoSaveResult<T> {
  const {
    data,
    saveFn,
    debounceMs = 1500,
    enabled = false,
    maxRetries = 3,
    draftKey,
    onSaveSuccess,
    onSaveError,
  } = options;

  // 状態
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs
  const dataRef = useRef(data);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // データの参照を更新
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /**
   * ドラフトが存在するかチェック
   */
  const hasDraft = useMemo(() => {
    if (!draftKey) return false;
    try {
      const draft = localStorage.getItem(draftKey);
      return draft !== null;
    } catch {
      return false;
    }
  }, [draftKey]);

  /**
   * ドラフトを保存
   */
  const saveDraft = useCallback(
    (saveData: T) => {
      if (!draftKey) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify(saveData));
      } catch (error) {
        console.error('Failed to save draft:', error);
      }
    },
    [draftKey]
  );

  /**
   * ドラフトをクリア
   */
  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [draftKey]);

  /**
   * ドラフトを読み込む
   */
  const loadDraft = useCallback((): T | null => {
    if (!draftKey) return null;
    try {
      const draft = localStorage.getItem(draftKey);
      if (!draft) return null;
      return JSON.parse(draft) as T;
    } catch {
      return null;
    }
  }, [draftKey]);

  /**
   * 実際の保存処理
   */
  const performSave = useCallback(async () => {
    const currentData = dataRef.current;
    setStatus('saving');
    setErrorMessage(null);

    try {
      await saveFn(currentData);
      setStatus('saved');
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      retryCountRef.current = 0;
      clearDraft();
      onSaveSuccess?.();
    } catch (error) {
      setStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(errorMsg);
      onSaveError?.(error instanceof Error ? error : new Error(errorMsg));
    }
  }, [saveFn, clearDraft, onSaveSuccess, onSaveError]);

  /**
   * 保存をトリガー（デバウンス付き）
   */
  const triggerSave = useCallback(() => {
    if (!enabled) return;

    setHasUnsavedChanges(true);

    // ドラフトを保存
    saveDraft(dataRef.current);

    // 既存のタイムアウトをクリア
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // デバウンス後に保存
    debounceTimeoutRef.current = setTimeout(() => {
      performSave();
    }, debounceMs);
  }, [enabled, debounceMs, performSave, saveDraft]);

  /**
   * 即座に保存（デバウンスなし）
   */
  const saveNow = useCallback(async () => {
    // 既存のタイムアウトをクリア
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    await performSave();
  }, [performSave]);

  /**
   * リトライ
   */
  const retry = useCallback(async () => {
    if (retryCountRef.current >= maxRetries) {
      setErrorMessage(`Maximum retries (${maxRetries}) exceeded`);
      return;
    }

    retryCountRef.current += 1;
    await performSave();
  }, [maxRetries, performSave]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    isSaving: status === 'saving',
    lastSavedAt,
    errorMessage,
    hasUnsavedChanges,
    hasDraft,
    triggerSave,
    saveNow,
    retry,
    loadDraft,
    clearDraft,
  };
}

export default useAutoSave;
