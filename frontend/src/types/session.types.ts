/**
 * セッション管理関連の型定義
 */

/**
 * セッション情報
 */
export interface Session {
  id: string;
  deviceInfo: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt?: string;
  isCurrent: boolean;
}

/**
 * セッション一覧取得結果
 */
export interface SessionListResult {
  sessions: Session[];
  total: number;
}

/**
 * セッション削除結果
 */
export interface DeleteSessionResult {
  success: boolean;
  message: string;
}

/**
 * 全セッション削除結果
 */
export interface DeleteAllSessionsResult {
  success: boolean;
  message: string;
  deletedCount: number;
}

/**
 * セッション削除確認ダイアログのプロパティ
 */
export interface SessionDeleteConfirmationProps {
  isOpen: boolean;
  sessionId?: string;
  deviceInfo?: string;
  isAllSessions?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
