/**
 * Invitation型定義ファイル
 *
 * ユーザー招待機能に関する型定義を提供します。
 */

/**
 * 招待ステータス
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

/**
 * 招待情報
 */
export interface Invitation {
  /** 招待ID */
  id: string;
  /** 招待メールアドレス */
  email: string;
  /** 招待トークン */
  token: string;
  /** 招待ステータス */
  status: InvitationStatus;
  /** 有効期限 */
  expiresAt: string;
  /** 作成日時 */
  createdAt: string;
  /** 招待者ID */
  invitedBy: string;
  /** 招待者メールアドレス */
  inviterEmail?: string;
}

/**
 * 招待作成入力
 */
export interface CreateInvitationInput {
  /** 招待メールアドレス */
  email: string;
}

/**
 * 招待作成結果
 */
export interface CreateInvitationResult {
  /** 成功フラグ */
  success: boolean;
  /** 招待情報 */
  invitation?: Invitation;
  /** 招待URL */
  invitationUrl?: string;
  /** エラーメッセージ */
  error?: string;
}

/**
 * 招待一覧結果
 */
export interface InvitationListResult {
  /** 成功フラグ */
  success: boolean;
  /** 招待リスト */
  invitations: Invitation[];
  /** エラーメッセージ */
  error?: string;
}

/**
 * 招待取り消し結果
 */
export interface CancelInvitationResult {
  /** 成功フラグ */
  success: boolean;
  /** エラーメッセージ */
  error?: string;
}

/**
 * 招待再送信結果
 */
export interface ResendInvitationResult {
  /** 成功フラグ */
  success: boolean;
  /** 新しい招待URL */
  invitationUrl?: string;
  /** エラーメッセージ */
  error?: string;
}

/**
 * APIエラーレスポンス
 */
export interface ApiErrorResponse {
  /** エラーメッセージ */
  message: string;
  /** エラーコード */
  code?: string;
}
