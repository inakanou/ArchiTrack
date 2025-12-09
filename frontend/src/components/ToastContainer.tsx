/**
 * @fileoverview トースト通知コンテナ
 *
 * Task 13.1: トースト通知の統合
 *
 * ToastProviderと連携してトースト通知を表示するコンテナコンポーネントです。
 */

import { useToast } from '../hooks/useToast';
import ToastNotification from './ToastNotification';

/**
 * ToastContainer
 *
 * ToastContextからトーストリストを取得し、ToastNotificationコンポーネントに渡します。
 * ToastProvider配下でのみ使用可能です。
 */
export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return <ToastNotification toasts={toasts} onDismiss={removeToast} />;
}
