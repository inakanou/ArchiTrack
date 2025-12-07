/**
 * @fileoverview トースト通知管理フック
 *
 * Task 13.1: トースト通知の統合
 *
 * Requirements:
 * - 18.4: 操作成功時のToastNotification表示を実装（作成完了、更新完了、削除完了、ステータス変更完了）
 * - 18.5: 操作失敗時のToastNotification表示を実装
 */

import { createContext, useContext, useCallback, useState, useMemo, ReactNode } from 'react';
import type { Toast, ToastOptions } from '../types/toast.types';

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
 * ToastContextの値
 */
interface ToastContextValue {
  /** 表示中のトーストリスト */
  toasts: Toast[];
  /** トーストを追加 */
  addToast: (options: ToastOptions) => string;
  /** トーストを削除 */
  removeToast: (id: string) => void;
  /** 成功トーストを表示 */
  success: (message: string, options?: HelperOptions) => string;
  /** エラートーストを表示 */
  error: (message: string, options?: HelperOptions) => string;
  /** 警告トーストを表示 */
  warning: (message: string, options?: HelperOptions) => string;
  /** 情報トーストを表示 */
  info: (message: string, options?: HelperOptions) => string;
  /** プロジェクト作成成功トースト */
  projectCreated: () => string;
  /** プロジェクト更新成功トースト */
  projectUpdated: () => string;
  /** プロジェクト削除成功トースト */
  projectDeleted: () => string;
  /** ステータス変更成功トースト */
  projectStatusChanged: (statusLabel: string) => string;
  /** 操作失敗トースト */
  operationFailed: (message?: string) => string;
}

// ============================================================================
// コンテキスト
// ============================================================================

/**
 * ToastContext
 */
const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================================================
// プロバイダー
// ============================================================================

/**
 * ToastProviderのProps
 */
interface ToastProviderProps {
  children: ReactNode;
}

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

// ============================================================================
// フック
// ============================================================================

/**
 * useToast
 *
 * トースト通知の管理機能を提供するフックです。
 * ToastProvider内でのみ使用可能です。
 *
 * @throws ToastProvider外で使用された場合
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}

export { ToastContext };
