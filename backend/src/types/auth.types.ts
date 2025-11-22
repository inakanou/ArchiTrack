/**
 * @fileoverview 認証サービスの型定義
 *
 * Requirements:
 * - 2.1-2.12: ユーザー登録機能（招待経由、トランザクション管理）
 * - 4.1-4.7: ログイン機能（連続失敗検知、アカウントロック）
 * - 5.1-5.7: トークン管理（JWT発行）
 * - 8.1-8.5: セッション管理（マルチデバイス対応）
 * - 9.1-9.5: ユーザー情報取得
 */

import type { Result } from './result.js';
import type { PasswordViolation } from './password.types.js';

/**
 * ユーザー登録時の入力データ
 */
export interface RegisterData {
  displayName: string;
  password: string;
}

/**
 * 認証成功時のレスポンス（トークン + ユーザー情報）
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

/**
 * ログイン成功時のレスポンス
 * 2FA有効ユーザーの場合は2FA_REQUIREDを返す
 */
export interface LoginResponse {
  type: 'SUCCESS' | '2FA_REQUIRED';
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  user?: UserProfile;
}

/**
 * ユーザープロフィール情報
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  createdAt: Date;
  twoFactorEnabled: boolean;
}

/**
 * 認証関連のエラー型
 */
export type AuthError =
  | { type: 'INVITATION_INVALID' }
  | { type: 'INVITATION_EXPIRED' }
  | { type: 'INVITATION_ALREADY_USED' }
  | { type: 'EMAIL_ALREADY_REGISTERED' }
  | { type: 'WEAK_PASSWORD'; violations: PasswordViolation[] }
  | { type: 'INVALID_CREDENTIALS' }
  | { type: 'ACCOUNT_LOCKED'; unlockAt: Date }
  | { type: '2FA_REQUIRED'; userId: string }
  | { type: 'INVALID_2FA_CODE' }
  | { type: 'INVALID_REFRESH_TOKEN' }
  | { type: 'REFRESH_TOKEN_EXPIRED' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'DATABASE_ERROR'; message: string };

/**
 * AuthService インターフェース
 *
 * 認証フロー（登録、ログイン、ログアウト）の統合サービス
 */
export interface IAuthService {
  /**
   * ユーザー登録（招待経由）
   *
   * @param invitationToken 招待トークン
   * @param data 登録データ（表示名、パスワード）
   * @returns 認証レスポンスまたはエラー
   */
  register(invitationToken: string, data: RegisterData): Promise<Result<AuthResponse, AuthError>>;

  /**
   * ログイン
   *
   * @param email メールアドレス
   * @param password パスワード
   * @returns ログインレスポンスまたはエラー
   */
  login(email: string, password: string): Promise<Result<LoginResponse, AuthError>>;

  /**
   * 2FA検証（ログイン時）
   *
   * @param userId ユーザーID
   * @param totpCode TOTPコード（6桁）
   * @returns 認証レスポンスまたはエラー
   */
  verify2FA(userId: string, totpCode: string): Promise<Result<AuthResponse, AuthError>>;

  /**
   * ログアウト（単一デバイス）
   *
   * @param userId ユーザーID
   * @param refreshToken リフレッシュトークン
   * @returns 成功またはエラー
   */
  logout(userId: string, refreshToken: string): Promise<Result<void, AuthError>>;

  /**
   * 全デバイスからログアウト
   *
   * @param userId ユーザーID
   * @returns 成功またはエラー
   */
  logoutAll(userId: string): Promise<Result<void, AuthError>>;

  /**
   * 現在のユーザー情報取得
   *
   * @param userId ユーザーID
   * @returns ユーザープロフィールまたはエラー
   */
  getCurrentUser(userId: string): Promise<Result<UserProfile, AuthError>>;

  /**
   * トークンリフレッシュ
   *
   * @param refreshToken リフレッシュトークン
   * @returns 新しいトークンペアまたはエラー
   */
  refreshToken(refreshToken: string): Promise<Result<AuthResponse, AuthError>>;
}
