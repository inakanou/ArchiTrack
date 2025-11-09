/**
 * パスワード管理関連の型定義
 */

/**
 * パスワードエラー型
 */
export type PasswordError =
  | { type: 'WEAK_PASSWORD'; violations: PasswordViolation[] }
  | { type: 'RESET_TOKEN_INVALID' }
  | { type: 'RESET_TOKEN_EXPIRED' }
  | { type: 'PASSWORD_REUSED' };

/**
 * パスワード違反の種類
 */
export enum PasswordViolation {
  TOO_SHORT = 'TOO_SHORT',
  NO_UPPERCASE = 'NO_UPPERCASE',
  NO_LOWERCASE = 'NO_LOWERCASE',
  NO_DIGIT = 'NO_DIGIT',
  NO_SPECIAL_CHAR = 'NO_SPECIAL_CHAR',
  WEAK_SCORE = 'WEAK_SCORE',
  COMMON_PASSWORD = 'COMMON_PASSWORD',
  REUSED_PASSWORD = 'REUSED_PASSWORD',
  CONTAINS_USER_INFO = 'CONTAINS_USER_INFO',
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
