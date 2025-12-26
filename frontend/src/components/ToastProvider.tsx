/**
 * @fileoverview トースト通知プロバイダーコンポーネント
 *
 * Task 13.1: トースト通知の統合
 *
 * Requirements:
 * - 18.4: 操作成功時のToastNotification表示を実装
 * - 18.5: 操作失敗時のToastNotification表示を実装
 */

import { useCallback, useState, useMemo, ReactNode } from 'react';
import type { Toast, ToastOptions } from '../types/toast.types';
import { ToastContext, type ToastContextValue } from '../hooks/useToast';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * トーストの最大表示数
 */
const MAX_TOASTS = 5;

// ============================================================================
// 型定義
// ============================================================================

/**
 * ヘルパーメソッドのオプション（typeを除外）
 */
type HelperOptions = Omit<ToastOptions, 'type' | 'message'>;

/**
 * ToastProviderのProps
 */
interface ToastProviderProps {
  children: ReactNode;
}

// ============================================================================
// プロバイダー
// ============================================================================

/**
 * ToastProvider
 *
 * トースト通知の状態管理を提供します。
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * ユニークIDを生成
   */
  const generateId = useCallback(() => {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  /**
   * トーストを追加
   */
  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = generateId();
      const toast: Toast = {
        ...options,
        id,
        createdAt: Date.now(),
      };

      setToasts((prevToasts) => {
        const newToasts = [...prevToasts, toast];
        // 最大数を超えた場合、古いものを削除
        if (newToasts.length > MAX_TOASTS) {
          return newToasts.slice(newToasts.length - MAX_TOASTS);
        }
        return newToasts;
      });

      return id;
    },
    [generateId]
  );

  /**
   * トーストを削除
   */
  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  /**
   * 成功トーストを表示
   */
  const success = useCallback(
    (message: string, options?: HelperOptions): string => {
      return addToast({ type: 'success', message, ...options });
    },
    [addToast]
  );

  /**
   * エラートーストを表示
   */
  const error = useCallback(
    (message: string, options?: HelperOptions): string => {
      return addToast({ type: 'error', message, ...options });
    },
    [addToast]
  );

  /**
   * 警告トーストを表示
   */
  const warning = useCallback(
    (message: string, options?: HelperOptions): string => {
      return addToast({ type: 'warning', message, ...options });
    },
    [addToast]
  );

  /**
   * 情報トーストを表示
   */
  const info = useCallback(
    (message: string, options?: HelperOptions): string => {
      return addToast({ type: 'info', message, ...options });
    },
    [addToast]
  );

  /**
   * プロジェクト作成成功トースト
   */
  const projectCreated = useCallback((): string => {
    return success('プロジェクトを作成しました');
  }, [success]);

  /**
   * プロジェクト更新成功トースト
   */
  const projectUpdated = useCallback((): string => {
    return success('プロジェクトを更新しました');
  }, [success]);

  /**
   * プロジェクト削除成功トースト
   */
  const projectDeleted = useCallback((): string => {
    return success('プロジェクトを削除しました');
  }, [success]);

  /**
   * ステータス変更成功トースト
   */
  const projectStatusChanged = useCallback(
    (statusLabel: string): string => {
      return success(`ステータスを「${statusLabel}」に変更しました`);
    },
    [success]
  );

  /**
   * 操作失敗トースト
   */
  const operationFailed = useCallback(
    (message?: string): string => {
      return error(message || '操作中にエラーが発生しました');
    },
    [error]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      addToast,
      removeToast,
      success,
      error,
      warning,
      info,
      projectCreated,
      projectUpdated,
      projectDeleted,
      projectStatusChanged,
      operationFailed,
    }),
    [
      toasts,
      addToast,
      removeToast,
      success,
      error,
      warning,
      info,
      projectCreated,
      projectUpdated,
      projectDeleted,
      projectStatusChanged,
      operationFailed,
    ]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
