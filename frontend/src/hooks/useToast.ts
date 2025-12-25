/**
 * @fileoverview トースト通知管理フック
 *
 * Task 13.1: トースト通知の統合
 *
 * Requirements:
 * - 18.4: 操作成功時のToastNotification表示を実装
 * - 18.5: 操作失敗時のToastNotification表示を実装
 */

import { createContext, useContext } from 'react';
import type { Toast, ToastOptions } from '../types/toast.types';

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
export interface ToastContextValue {
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
export const ToastContext = createContext<ToastContextValue | null>(null);

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
