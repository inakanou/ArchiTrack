/**
 * @fileoverview セッション管理サービスの型定義
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応）
 *
 * リフレッシュトークンのハッシュ保存と、系列による失効・再利用の検知（要件33.4〜33.7）の型も置く。
 */

import type { Prisma } from '../generated/prisma/client.js';
import type { Result } from './result.js';

/**
 * セッション情報（系列ごとの現行のリフレッシュトークンの行。トークンのハッシュは含めない）
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
  { type: 'SESSION_NOT_FOUND' } | { type: 'DATABASE_ERROR'; message: string };

/**
 * ローテーションのエラー型
 *
 * - NOT_FOUND: 保存の無いトークン（失効済み・偽造など）
 * - EXPIRED: 有効期限の切れたトークン
 * - REUSE_DETECTED: 置き換え済みのトークンの再提示。系列の全てを失効させた（要件33.6）
 */
export type RotationError =
  | { type: 'NOT_FOUND' }
  | { type: 'EXPIRED' }
  | { type: 'REUSE_DETECTED'; userId: string; familyId: string };

/** ローテーションの結果（後継のリフレッシュトークンの原文） */
export interface RotationResult {
  userId: string;
  familyId: string;
  refreshToken: string;
}

/** 新しいセッションの結果（リフレッシュトークンの原文と系列 ID） */
export interface CreatedSession {
  refreshToken: string;
  familyId: string;
}

/** リフレッシュトークンの表と取引ロックを操作できるトランザクションのクライアント */
export type RefreshTokenClient = Pick<Prisma.TransactionClient, 'refreshToken' | '$executeRaw'>;

/**
 * SessionService インターフェース
 *
 * リフレッシュトークンをハッシュで保存し、系列で再利用を検知する
 */
export interface ISessionService {
  /** 新しい系列でリフレッシュトークンを発行し、ハッシュを保存する */
  createSession(userId: string, deviceInfo?: string | null): Promise<CreatedSession>;

  /** 提示されたトークンを置き換え、同じ系列の後継を発行する */
  rotate(presentedToken: string): Promise<Result<RotationResult, RotationError>>;

  /** 提示されたトークンの系列の全てを失効させる（ログアウト。要件33.4） */
  revokeByToken(presentedToken: string, userId?: string): Promise<number>;

  /** 利用者の全てのリフレッシュトークンを失効させる（要件33.5） */
  revokeAllForUser(userId: string, tx?: RefreshTokenClient): Promise<number>;

  /** 自分のセッション（行の ID）の系列を失効させる */
  revokeSessionById(userId: string, sessionId: string): Promise<Result<void, SessionError>>;

  /** 利用者のセッション一覧（系列ごとの現行の行） */
  listSessions(userId: string): Promise<SessionInfo[]>;
}
