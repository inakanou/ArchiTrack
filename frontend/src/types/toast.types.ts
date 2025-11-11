/**
 * トースト通知の種類
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * トースト通知のオプション
 */
export interface ToastOptions {
  /** トーストの種類 */
  type: ToastType;
  /** 表示するメッセージ */
  message: string;
  /** 自動非表示までの時間（ミリ秒）。デフォルト: 5000 */
  duration?: number;
  /** 手動で閉じることを許可するか。デフォルト: true */
  dismissible?: boolean;
}

/**
 * トースト通知データ
 */
export interface Toast extends ToastOptions {
  /** 一意のID */
  id: string;
  /** 作成日時 */
  createdAt: number;
}

/**
 * ToastNotificationコンポーネントのProps
 */
export interface ToastNotificationProps {
  /** 表示するトーストのリスト */
  toasts: Toast[];
  /** トーストを削除する関数 */
  onDismiss: (id: string) => void;
  /** トーストの最大表示位置（画面上部からの距離、px）。デフォルト: top-right */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}
