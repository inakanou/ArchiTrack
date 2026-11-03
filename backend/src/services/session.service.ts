/**
 * @fileoverview セッション管理サービス
 *
 * Requirements:
 * - 8.1-8.5: セッション管理（マルチデバイス対応）
 *
 * リフレッシュトークンのハッシュ保存と、系列による失効・再利用の検知（要件33.4〜33.7）も担う。
 *
 * 責任と境界:
 * - 主要責任: リフレッシュトークンの発行・保存（ハッシュ）・ローテーション・失効、セッション一覧
 * - ドメイン境界: セッションドメイン
 * - データ所有権: RefreshToken
 * - トランザクション境界: ローテーション（置き換えの記録と後継の作成、または系列の失効）
 *
 * 依存関係:
 * - インバウンド: AuthService, セッションの API
 * - アウトバウンド: TokenService（リフレッシュトークンの署名）
 * - 外部: Prisma Client
 */

import { createHash, randomUUID } from 'crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { UAParser } from 'ua-parser-js';
import { Result, Ok, Err } from '../types/result.js';
import type {
  CreatedSession,
  ISessionService,
  RefreshTokenClient,
  RotationError,
  RotationResult,
  SessionInfo,
  SessionError,
} from '../types/session.types.js';
import { TokenService } from './token.service.js';
import tokenServiceInstance from './token.service.js';
import logger from '../utils/logger.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import {
  lockUserRefreshTokens,
  revokeAllRefreshTokensForUser,
} from '../utils/refresh-token-lock.js';

/**
 * 保存するリフレッシュトークンの値（原文の SHA-256 の 16 進）
 *
 * 原文は保存しない。照合は提示された原文のハッシュで一意索引を引く（要件33.7）。
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class SessionService implements ISessionService {
  // リフレッシュトークンの有効期限（デフォルト: 7日間）
  private readonly REFRESH_TOKEN_EXPIRY: number;
  private readonly tokenService: TokenService;

  constructor(
    private readonly prisma: PrismaClient,
    tokenService?: TokenService
  ) {
    this.tokenService = tokenService || tokenServiceInstance;
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
      logger.warn({ err: error, userAgent }, 'Failed to parse User-Agent');
      return userAgent; // パース失敗時は元の文字列を返す
    }
  }

  /**
   * セッション作成
   *
   * 新しい系列でリフレッシュトークンを発行し、原文でなくハッシュを保存する（要件33.7）。
   * @requirement user-authentication/REQ-8.1: ユーザーがログインするとセッション情報を永続化する
   * @requirement user-authentication/REQ-8.3: 複数デバイスからログインする場合、各デバイスで独立したセッションを管理する
   *
   * @param userId ユーザーID
   * @param deviceInfo デバイス情報（User-Agent等）
   * @returns リフレッシュトークンの原文と系列 ID
   */
  async createSession(userId: string, deviceInfo?: string | null): Promise<CreatedSession> {
    try {
      const familyId = randomUUID();
      const refreshToken = await this.tokenService.generateRefreshToken(userId, familyId);
      const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);

      // User-Agentをパースして読みやすい形式に変換
      const parsedDeviceInfo = deviceInfo ? this.parseUserAgent(deviceInfo) : undefined;

      await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash: hashRefreshToken(refreshToken),
          familyId,
          deviceInfo: parsedDeviceInfo,
          expiresAt,
        },
      });

      logger.info(
        {
          userId,
          familyId,
          deviceInfo: parsedDeviceInfo,
          expiresAt,
        },
        'Session created successfully'
      );

      return { refreshToken, familyId };
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
   * リフレッシュトークンのローテーション
   *
   * 一つのトランザクションで、提示されたトークンの行に置き換えの日時を記録し、同じ系列の後継を作る。
   * 置き換え済みの行が再び提示されたら、系列の全行を消して REUSE_DETECTED を返す（要件33.6）。
   * 利用者単位の取引ロック（lockUserRefreshTokens）を取ってから行を読み直して判定するため、
   * 同じトークンの同時の提示は一方だけが置き換えに成功し、もう一方は置き換え済みの行を読んで
   * 系列の全行を消す（先に成功した側の後継も含む。猶予は設けない。タブ間のリフレッシュの直列化は
   * 画面の側で行う）。系列や利用者単位の失効と並行しても、後継が失効を逃れて残らない。
   *
   * @param presentedToken 提示されたリフレッシュトークンの原文
   * @returns 後継のリフレッシュトークンの原文、または NOT_FOUND・EXPIRED・REUSE_DETECTED
   */
  async rotate(presentedToken: string): Promise<Result<RotationResult, RotationError>> {
    const tokenHash = hashRefreshToken(presentedToken);

    return this.prisma.$transaction(async (tx) => {
      const found = await tx.refreshToken.findUnique({ where: { tokenHash } });

      if (!found) {
        return Err({ type: 'NOT_FOUND' as const });
      }

      // 同じ利用者の他のローテーション・失効と直列化し、ロックを待つ間の変更を読み直す
      await lockUserRefreshTokens(tx, found.userId);
      const current = await tx.refreshToken.findUnique({ where: { tokenHash } });

      if (!current) {
        return Err({ type: 'NOT_FOUND' as const });
      }

      const revokeFamily = async (): Promise<Result<RotationResult, RotationError>> => {
        const { count } = await tx.refreshToken.deleteMany({
          where: { familyId: current.familyId },
        });
        logger.warn(
          { userId: current.userId, familyId: current.familyId, revokedCount: count },
          'Refresh token reuse detected; revoked the whole family'
        );
        return Err({
          type: 'REUSE_DETECTED' as const,
          userId: current.userId,
          familyId: current.familyId,
        });
      };

      if (current.replacedAt) {
        return revokeFamily();
      }

      const now = new Date();
      if (current.expiresAt < now) {
        return Err({ type: 'EXPIRED' as const });
      }

      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, replacedAt: null },
        data: { replacedAt: now },
      });
      if (count === 0) {
        // ロックの下では起きない（読み直した行は置き換えられていない）。防御として再利用と同じに扱う
        return revokeFamily();
      }

      const refreshToken = await this.tokenService.generateRefreshToken(
        current.userId,
        current.familyId
      );
      await tx.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: hashRefreshToken(refreshToken),
          familyId: current.familyId,
          deviceInfo: current.deviceInfo,
          expiresAt: new Date(now.getTime() + this.REFRESH_TOKEN_EXPIRY),
        },
      });

      return Ok({ userId: current.userId, familyId: current.familyId, refreshToken });
    }, connectBudgetTransactionOptions());
  }

  /**
   * 提示されたトークンの系列の全てを失効させる（ログアウト）
   *
   * @requirement user-authentication/REQ-8.4: ユーザーがログアウトすると、対象デバイスのセッションのみを削除する
   *
   * @param presentedToken 提示されたリフレッシュトークンの原文
   * @param userId 指定すると、その利用者のトークンに限る
   * @returns 消した行の数
   */
  async revokeByToken(presentedToken: string, userId?: string): Promise<number> {
    const tokenHash = hashRefreshToken(presentedToken);
    const revoked = await this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!current || (userId !== undefined && current.userId !== userId)) {
        return null;
      }
      // 並行するローテーションの後継も消すよう、ローテーションと直列化してから系列を消す
      await lockUserRefreshTokens(tx, current.userId);
      const { count } = await tx.refreshToken.deleteMany({
        where: { familyId: current.familyId, userId: current.userId },
      });
      return { current, count };
    }, connectBudgetTransactionOptions());

    if (!revoked) {
      logger.debug({ userId }, 'Session not found for logout');
      return 0;
    }
    const { current, count } = revoked;
    logger.info(
      { userId: current.userId, familyId: current.familyId, revokedCount: count },
      'Session family revoked'
    );
    return count;
  }

  /**
   * 利用者の全てのリフレッシュトークンを失効させる（全デバイスのログアウト、パスワードの変更・リセット）
   *
   * @requirement user-authentication/REQ-8.5: 全デバイスログアウト機能を使用すると、全てのセッションを削除する
   *
   * @param userId ユーザーID
   * @param tx 呼び出し元のトランザクション（省略時は単独で消す）
   * @returns 消した行の数
   */
  async revokeAllForUser(userId: string, tx?: RefreshTokenClient): Promise<number> {
    try {
      const count = tx
        ? await revokeAllRefreshTokensForUser(tx, userId)
        : await this.prisma.$transaction(
            (client) => revokeAllRefreshTokensForUser(client, userId),
            connectBudgetTransactionOptions()
          );

      logger.info({ userId, deletedCount: count }, 'All sessions deleted successfully');
      return count;
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
   * 自分のセッション（セッション一覧の行の ID）の系列を失効させる
   *
   * @param userId ユーザーID（自分のセッションに限る）
   * @param sessionId セッション一覧の行の ID
   * @returns 成功、SESSION_NOT_FOUND、DATABASE_ERROR のいずれか
   */
  async revokeSessionById(userId: string, sessionId: string): Promise<Result<void, SessionError>> {
    try {
      const found = await this.prisma.$transaction(async (tx) => {
        const session = await tx.refreshToken.findFirst({
          where: { id: sessionId, userId },
        });
        if (!session) {
          return false;
        }
        // 並行するローテーションの後継も消すよう、ローテーションと直列化してから系列を消す
        await lockUserRefreshTokens(tx, userId);
        await tx.refreshToken.deleteMany({
          where: { familyId: session.familyId, userId },
        });
        return true;
      }, connectBudgetTransactionOptions());

      if (!found) {
        logger.debug({ userId, sessionId }, 'Session not found');
        return Err({ type: 'SESSION_NOT_FOUND' });
      }

      logger.info({ userId, sessionId }, 'Session deleted successfully');
      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
          sessionId,
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
   * セッション一覧取得
   *
   * 指定されたユーザーのセッション（系列ごとの現行の行。置き換え済みの行は除く）を取得します。
   * デバイス情報を含むため、ユーザーは各デバイスのセッションを確認できます。
   *
   * @param userId ユーザーID
   * @returns セッション一覧
   */
  async listSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const sessions = await this.prisma.refreshToken.findMany({
        where: { userId, replacedAt: null },
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
}
