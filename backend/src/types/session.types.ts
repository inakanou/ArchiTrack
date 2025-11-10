/**
 * @fileoverview セッション管理サービスの型定義
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応、有効期限延長）
 */

import type { Result } from './result';

/**
 * セッション情報
 */
export interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo?: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * セッション関連のエラー型
 */
export type SessionError =
  | { type: 'SESSION_NOT_FOUND' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'DATABASE_ERROR'; message: string };

/**
 * SessionService インターフェース
 *
 * セッション管理（作成、削除、検証、一覧取得、有効期限延長）を提供
 */
export interface ISessionService {
  /**
   * セッション作成
   *
   * @param userId ユーザーID
   * @param refreshToken リフレッシュトークン
   * @param deviceInfo デバイス情報（User-Agent等）
   * @returns 成功またはエラー
   */
  createSession(userId: string, refreshToken: string, deviceInfo?: string): Promise<void>;

  /**
   * セッション削除（単一デバイス）
   *
   * @param refreshToken リフレッシュトークン
   * @returns 成功またはエラー
   */
  deleteSession(refreshToken: string): Promise<Result<void, SessionError>>;

  /**
   * 全セッション削除（全デバイス）
   *
   * @param userId ユーザーID
   * @returns 成功
   */
  deleteAllSessions(userId: string): Promise<void>;

  /**
   * セッション検証
   *
   * @param refreshToken リフレッシュトークン
   * @returns セッション情報またはエラー
   */
  verifySession(refreshToken: string): Promise<Result<SessionInfo, SessionError>>;

  /**
   * セッション一覧取得
   *
   * @param userId ユーザーID
   * @returns セッション一覧
   */
  listSessions(userId: string): Promise<SessionInfo[]>;

  /**
   * セッション有効期限延長
   *
   * @param refreshToken リフレッシュトークン
   * @returns 成功またはエラー
   */
  extendSession(refreshToken: string): Promise<Result<void, SessionError>>;
}
