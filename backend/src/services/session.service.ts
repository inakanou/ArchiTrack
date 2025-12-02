/**
 * @fileoverview セッション管理サービス
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応、有効期限延長）
 *
 * 責任と境界:
 * - 主要責任: セッション管理（作成、削除、検証、一覧取得、有効期限延長）
 * - ドメイン境界: セッションドメイン
 * - データ所有権: RefreshToken
 * - トランザクション境界: なし
 *
 * 依存関係:
 * - インバウンド: AuthService
 * - アウトバウンド: なし
 * - 外部: Prisma Client
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { UAParser } from 'ua-parser-js';
import { Result, Ok, Err } from '../types/result.js';
import type { ISessionService, SessionInfo, SessionError } from '../types/session.types.js';
import logger from '../utils/logger.js';

export class SessionService implements ISessionService {
  // リフレッシュトークンの有効期限（デフォルト: 7日間）
  private readonly REFRESH_TOKEN_EXPIRY: number;

  constructor(private readonly prisma: PrismaClient) {
    // 環境変数から有効期限を取得（日数で指定、デフォルト: 7日）
    const expiryDays = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);
    this.REFRESH_TOKEN_EXPIRY = expiryDays * 24 * 60 * 60 * 1000; // ミリ秒に変換
  }

  /**
   * User-Agent文字列をパースして読みやすい形式に変換
   *
   * 既にパース済みの文字列（"Browser on OS"形式）の場合はそのまま返します。
   *
   * @param userAgent User-Agent文字列
   * @returns パースされたデバイス情報 (例: "Chrome on Windows")
   */
  private parseUserAgent(userAgent: string): string {
    try {
      // 既にパース済みの形式かチェック（"Browser on OS" または "Test Device"）
      // パース済みの文字列は短く、"on" を含むか "Test" "Unknown" で始まる
      if (
        userAgent.length < 100 && // 生のUser-Agentは通常100文字以上
        (userAgent.includes(' on ') ||
          userAgent.startsWith('Test ') ||
          userAgent.startsWith('Unknown '))
      ) {
        logger.debug({ userAgent }, 'deviceInfo appears to be already parsed, returning as-is');
        return userAgent;
      }

      const parser = new UAParser(userAgent);
      const browser = parser.getBrowser();
      const os = parser.getOS();

      const browserName = browser.name || 'Unknown Browser';
      const osName = os.name || 'Unknown OS';

      return `${browserName} on ${osName}`;
    } catch (error) {
      logger.warn({ error, userAgent }, 'Failed to parse User-Agent');
      return userAgent; // パース失敗時は元の文字列を返す
    }
  }

  /**
   * セッション作成
   *
   * RefreshTokenレコードを作成し、デバイス情報を含むセッションを管理します。
   * 要件8.1: ユーザーがログインするとセッション情報を永続化する
   * 要件8.3: 複数デバイスからログインする場合、各デバイスで独立したセッションを管理する
   *
   * @param userId ユーザーID
   * @param refreshToken リフレッシュトークン
   * @param deviceInfo デバイス情報（User-Agent等）
   */
  async createSession(userId: string, refreshToken: string, deviceInfo?: string): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);

      // User-Agentをパースして読みやすい形式に変換
      const parsedDeviceInfo = deviceInfo ? this.parseUserAgent(deviceInfo) : undefined;

      await this.prisma.refreshToken.create({
        data: {
          userId,
          token: refreshToken,
          deviceInfo: parsedDeviceInfo,
          expiresAt,
        },
      });

      logger.info(
        {
          userId,
          deviceInfo: parsedDeviceInfo,
          expiresAt,
        },
        'Session created successfully'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to create session'
      );
      throw error;
    }
  }

  /**
   * セッション削除（単一デバイス）
   *
   * 指定されたリフレッシュトークンに対応するセッションを削除します。
   * 要件8.4: ユーザーがログアウトすると、対象デバイスのセッションのみを削除する
   *
   * @param refreshToken リフレッシュトークン
   * @returns 成功またはエラー
   */
  async deleteSession(refreshToken: string): Promise<Result<void, SessionError>> {
    try {
      await this.prisma.refreshToken.delete({
        where: { token: refreshToken },
      });

      logger.info({ refreshToken }, 'Session deleted successfully');
      return Ok(undefined);
    } catch (error) {
      // Prisma P2025: Record not found
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        logger.debug({ refreshToken }, 'Session not found');
        return Err({ type: 'SESSION_NOT_FOUND' });
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          refreshToken,
        },
        'Failed to delete session'
      );
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 全セッション削除（全デバイス）
   *
   * 指定されたユーザーの全てのセッションを削除します。
   * 要件8.5: 全デバイスログアウト機能を使用すると、全てのセッションを削除する
   *
   * @param userId ユーザーID
   */
  async deleteAllSessions(userId: string): Promise<void> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      logger.info({ userId, deletedCount: result.count }, 'All sessions deleted successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to delete all sessions'
      );
      throw error;
    }
  }

  /**
   * セッション検証
   *
   * リフレッシュトークンの存在と有効期限をチェックします。
   *
   * @param refreshToken リフレッシュトークン
   * @returns セッション情報またはエラー
   */
  async verifySession(refreshToken: string): Promise<Result<SessionInfo, SessionError>> {
    try {
      const session = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!session) {
        logger.debug({ refreshToken }, 'Session not found');
        return Err({ type: 'SESSION_NOT_FOUND' });
      }

      // 有効期限チェック
      if (session.expiresAt < new Date()) {
        logger.debug({ refreshToken, expiresAt: session.expiresAt }, 'Session expired');
        return Err({ type: 'SESSION_EXPIRED' });
      }

      const sessionInfo: SessionInfo = {
        id: session.id,
        userId: session.userId,
        deviceInfo: session.deviceInfo ?? undefined,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      };

      return Ok(sessionInfo);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          refreshToken,
        },
        'Failed to verify session'
      );
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * セッション一覧取得
   *
   * 指定されたユーザーの全てのアクティブなセッションを取得します。
   * デバイス情報を含むため、ユーザーは各デバイスのセッションを確認できます。
   *
   * @param userId ユーザーID
   * @returns セッション一覧
   */
  async listSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const sessions = await this.prisma.refreshToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        deviceInfo: session.deviceInfo ?? undefined,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      }));
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to list sessions'
      );
      throw error;
    }
  }

  /**
   * セッション有効期限延長
   *
   * アクティブなユーザーのセッション有効期限を延長します。
   * 要件8.2: ユーザーがアクティブである間、セッションの有効期限を延長する
   *
   * @param refreshToken リフレッシュトークン
   * @returns 成功またはエラー
   */
  async extendSession(refreshToken: string): Promise<Result<void, SessionError>> {
    try {
      // まず、セッションが存在し、有効期限内であることを確認
      const session = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!session) {
        logger.debug({ refreshToken }, 'Session not found');
        return Err({ type: 'SESSION_NOT_FOUND' });
      }

      // 有効期限チェック
      if (session.expiresAt < new Date()) {
        logger.debug({ refreshToken, expiresAt: session.expiresAt }, 'Session expired');
        return Err({ type: 'SESSION_EXPIRED' });
      }

      // 有効期限を現在時刻から7日後に延長
      const newExpiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);

      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { expiresAt: newExpiresAt },
      });

      logger.info(
        {
          refreshToken,
          newExpiresAt,
        },
        'Session extended successfully'
      );

      return Ok(undefined);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          refreshToken,
        },
        'Failed to extend session'
      );
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
