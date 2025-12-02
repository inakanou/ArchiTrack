/**
 * 招待管理関連の型定義
 */

/**
 * 招待エラー型
 */
export type InvitationError =
  | { type: 'INVALID_TOKEN' }
  | { type: 'EXPIRED_TOKEN' }
  | { type: 'USED_TOKEN' }
  | { type: 'REVOKED_TOKEN' }
  | { type: 'EMAIL_ALREADY_REGISTERED' }
  | { type: 'INVITATION_NOT_FOUND' }
  | { type: 'UNAUTHORIZED' };

/**
 * 招待ステータス
 */
export enum InvitationStatus {
  PENDING = 'pending',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * Result型（型安全なエラーハンドリング）
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Result型のヘルパー関数
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
