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
 *
 * 2FA有効ユーザーの場合は 2FA_REQUIRED と、パスワードの成功に結び付いた 2FA 待ちの資格を返す
 * （要件32.1）。利用者 ID は含めない（要件42.7）
 */
export type LoginResponse =
  | {
      type: 'SUCCESS';
      accessToken: string;
      refreshToken: string;
      user: UserProfile;
    }
  | {
      type: '2FA_REQUIRED';
      /** 2FA 待ちの資格（不透明な文字列。5 分・一回限り） */
      challengeToken: string;
      /** 資格の有効期間（秒） */
      expiresIn: number;
    };

/**
 * 2FA の検証で提示する第二要素
 */
export type TwoFactorProof =
  { kind: 'totp'; code: string } | { kind: 'backup'; backupCode: string };

/**
 * ユーザープロフィール情報
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions?: string[];
  createdAt: Date;
  /** 更新日時。プロフィールの更新で楽観的ロックの版（expectedUpdatedAt）として送り返す */
  updatedAt?: Date;
  twoFactorEnabled: boolean;
  /** 初回のパスワード変更を要するか（要件34・37.7。画面が利用者の状態を知るために返す） */
  mustChangePassword: boolean;
}

/**
 * 画面へ返す利用者と状態（design.md「利用者の状態の照合」の AuthUserView）
 *
 * ログイン・リフレッシュ・2FA の検証と有効化・パスワード変更の応答に載せる（タスク47.5）
 */
export type AuthUserView = Pick<
  UserProfile,
  'id' | 'email' | 'displayName' | 'roles' | 'twoFactorEnabled' | 'mustChangePassword'
>;

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
  | { type: 'CHALLENGE_INVALID' }
  | { type: 'SERVICE_UNAVAILABLE' }
  | { type: 'INVALID_2FA_CODE' }
  | { type: 'INVALID_BACKUP_CODE' }
  | { type: 'INVALID_REFRESH_TOKEN' }
  | { type: 'REFRESH_TOKEN_EXPIRED' }
  | { type: 'TOKEN_REUSE_DETECTED' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'PROFILE_CONFLICT'; expectedUpdatedAt: Date; actualUpdatedAt: Date }
  | { type: 'DATABASE_ERROR'; message: string };

/**
 * 要求の送信元の情報（監査の記録に使う）
 */
export interface RequestContext {
  /** 送信元 IP（getClientIp で得たもの） */
  ipAddress?: string;
  /** User-Agent */
  userAgent?: string;
}

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
   * @param deviceInfo デバイス情報（User-Agent）
   * @returns ログインレスポンスまたはエラー
   */
  login(
    email: string,
    password: string,
    deviceInfo?: string
  ): Promise<Result<LoginResponse, AuthError>>;

  /**
   * 2FA の検証を完了する（ログイン時）
   *
   * ログインで発行した 2FA 待ちの資格に結び付いた利用者の第二要素を検証し、成功で資格を消費してから
   * トークンを発行する（要件32.1〜32.6）
   *
   * @param challengeToken ログインの応答の 2FA 待ちの資格
   * @param proof TOTP コードまたはバックアップコード
   * @param deviceInfo デバイス情報（User-Agent）
   * @returns 認証レスポンスまたはエラー
   */
  completeTwoFactorLogin(
    challengeToken: string,
    proof: TwoFactorProof,
    deviceInfo?: string
  ): Promise<Result<AuthResponse, AuthError>>;

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
   * 画面へ返す利用者と状態を取得する（状態は AuthenticatedUserStateService を経由する）
   *
   * @param userId ユーザーID
   * @returns 利用者と状態、またはエラー（利用者の不在は USER_NOT_FOUND）
   */
  getAuthUserView(userId: string): Promise<Result<AuthUserView, AuthError>>;

  /**
   * 楽観的ロック付きのプロフィール更新
   *
   * ユーザーの updatedAt が expectedUpdatedAt と一致する場合に限り更新する（条件付きの更新）。
   *
   * @param userId ユーザーID
   * @param data 更新内容（表示名）
   * @param expectedUpdatedAt 取得時の updatedAt
   * @returns 成功、USER_NOT_FOUND（ユーザーが無い）、PROFILE_CONFLICT（版が古い）のいずれか
   */
  updateProfileIfUnchanged(
    userId: string,
    data: { displayName?: string },
    expectedUpdatedAt: Date
  ): Promise<Result<void, AuthError>>;

  /**
   * トークンリフレッシュ
   *
   * @param refreshToken リフレッシュトークン
   * @returns 新しいトークンペアまたはエラー
   */
  refreshToken(
    refreshToken: string,
    ctx?: RequestContext
  ): Promise<Result<AuthResponse, AuthError>>;
}
