/**
 * @fileoverview 利用者の状態の取得とキャッシュ・無効化（user-authentication 要件34.2、タスク47.5）
 *
 * 利用者の状態（有効・2FA の登録・初回のパスワード変更の要否・アクセストークンの世代）を、Redis のキャッシュ
 * （鍵 `auth:user-state:<userId>`、TTL 60 秒）を経由して取得する。認証ミドルウェアの状態の照合
 * （design.md「利用者の状態の照合」）と、画面へ状態を返す応答が使う。
 *
 * - キャッシュは RBACService の権限のキャッシュと同じく世代の照合で書き込む。状態の取得は DB を読む前に
 *   世代を読み、書き込みの時点で世代が変わっていないときだけ書き込む（無効化の後に古い状態を書き戻さない）
 * - Redis の接続が `ready` でないときはコマンドを送らず DB から読む（ioredis のオフラインキューで
 *   要求を待たせない）。Redis の読み書きの失敗も DB からの取得へ倒す
 * - 状態を変える処理（2FA の登録と再設定、無効化・再有効化、初回のパスワード変更の完了）は、コミットの
 *   後に `invalidate(userId)` を呼ぶ。DB を直接書く試験の補助も同じ鍵に同じ処理を行う
 *   （鍵と手順は authenticated-user-state-cache.ts を正とする）
 */

import type Redis from 'ioredis';
import type { PrismaClient } from '../generated/prisma/client.js';
import getPrismaClient from '../db.js';
import redisConnection from '../redis.js';
import logger from '../utils/logger.js';
import {
  AUTH_USER_STATE_CACHE_TTL_SECONDS,
  INVALIDATE_AUTH_USER_STATE,
  WRITE_AUTH_USER_STATE_IF_GENERATION_UNCHANGED,
  authUserStateCacheKey,
  authUserStateGenerationKey,
  authUserStateInvalidationKeys,
} from './authenticated-user-state-cache.js';

/**
 * 利用者の状態
 */
export interface AuthenticatedUserState {
  /** 有効か（無効化されていないか） */
  isActive: boolean;
  /** 2FA を登録済みか */
  twoFactorEnabled: boolean;
  /** 初回のパスワード変更を要するか */
  mustChangePassword: boolean;
  /**
   * アクセストークンの世代（要件34.7、タスク47.11）
   *
   * 管理者の 2FA の再設定で 1 つ進む。発行時の世代（クレーム `gen`）がこれより小さいアクセストークンは
   * 認証ミドルウェアが拒否する。
   */
  accessTokenGeneration: number;
}

/**
 * Redis クライアントを呼び出しの時点で返す関数（未初期化・未設定なら null / undefined）
 */
export type UserStateRedisProvider = () => Redis | null | undefined;

/**
 * キャッシュの値が状態の形をしているか
 *
 * 世代（accessTokenGeneration）を持たない値（世代の導入より前の形で書かれたもの）も形の不一致として扱い、
 * DB から読み直す（世代を 0 と推測して古い値を使わない）。
 */
function isAuthenticatedUserState(value: unknown): value is AuthenticatedUserState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.isActive === 'boolean' &&
    typeof v.twoFactorEnabled === 'boolean' &&
    typeof v.mustChangePassword === 'boolean' &&
    typeof v.accessTokenGeneration === 'number' &&
    Number.isSafeInteger(v.accessTokenGeneration)
  );
}

/**
 * 利用者の状態の取得とキャッシュの無効化
 */
export class AuthenticatedUserStateService {
  /** キャッシュに使う Redis クライアントの取得（呼び出しの時点で解決する） */
  private readonly redisProvider: UserStateRedisProvider;

  /**
   * @param prisma - PrismaClient
   * @param redis - Redis クライアント、またはそれを呼び出しの時点で返す関数。省略時はキャッシュを使わない
   */
  constructor(
    private readonly prisma: PrismaClient,
    redis?: Redis | UserStateRedisProvider
  ) {
    this.redisProvider = typeof redis === 'function' ? redis : () => redis;
  }

  /**
   * 利用者の状態を取得する
   *
   * @param userId - 利用者 ID
   * @returns 状態。利用者が存在しなければ null（キャッシュしない）
   */
  async getState(userId: string): Promise<AuthenticatedUserState | null> {
    const redis = this.redisProvider() ?? undefined;
    const cacheKey = authUserStateCacheKey(userId);
    const generationKey = authUserStateGenerationKey(userId);

    // 接続が使える状態のときだけキャッシュを読み書きする（RBACService と同じ）
    let cacheAvailable = false;
    // DB を読む前の世代（無ければ空文字）。書き込みの時点で変わっていれば書き込まない
    let generation = '';
    if (redis) {
      if (redis.status === 'ready') {
        cacheAvailable = true;
        try {
          const cached = await redis.get(cacheKey);
          if (cached !== null) {
            const parsed: unknown = JSON.parse(cached);
            if (isAuthenticatedUserState(parsed)) {
              return {
                isActive: parsed.isActive,
                twoFactorEnabled: parsed.twoFactorEnabled,
                mustChangePassword: parsed.mustChangePassword,
                accessTokenGeneration: parsed.accessTokenGeneration,
              };
            }
            logger.warn({ userId }, 'Ignored malformed user state cache entry');
          }
          // 世代は DB を読む前に読む（無効化はコミットの後に世代を進めるため、ここで読んだ世代が
          // 書き込みの時点まで変わらなければ、続く DB の読み出しはその無効化の元の変更を反映している）
          generation = (await redis.get(generationKey)) ?? '';
        } catch (error) {
          cacheAvailable = false;
          logger.warn({ err: error, userId }, 'Failed to get user state from Redis cache');
        }
      } else {
        logger.warn(
          {
            err: new Error(`Redis connection is not ready (status: ${redis.status})`),
            userId,
          },
          'Failed to get user state from Redis cache'
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        twoFactorEnabled: true,
        mustChangePassword: true,
        accessTokenGeneration: true,
      },
    });
    if (!user) {
      return null;
    }
    const state: AuthenticatedUserState = {
      isActive: user.isActive,
      twoFactorEnabled: user.twoFactorEnabled,
      mustChangePassword: user.mustChangePassword,
      accessTokenGeneration: user.accessTokenGeneration,
    };

    if (redis && cacheAvailable) {
      try {
        await redis.eval(
          WRITE_AUTH_USER_STATE_IF_GENERATION_UNCHANGED,
          2,
          cacheKey,
          generationKey,
          generation,
          AUTH_USER_STATE_CACHE_TTL_SECONDS,
          JSON.stringify(state)
        );
      } catch (error) {
        logger.warn({ err: error, userId }, 'Failed to cache user state to Redis');
      }
    }

    return state;
  }

  /**
   * 利用者の状態のキャッシュを無効化する（キャッシュを消して世代を進める）
   *
   * 状態を変える処理のコミットの後に呼ぶ。Redis が使えないときはコマンドを送らず警告だけを残す
   * （残ったエントリは TTL で消える）。
   *
   * @param userId - 利用者 ID
   */
  async invalidate(userId: string): Promise<void> {
    const redis = this.redisProvider() ?? undefined;
    if (!redis) {
      return;
    }
    if (redis.status !== 'ready') {
      logger.warn(
        { err: new Error(`Redis connection is not ready (status: ${redis.status})`), userId },
        'Failed to invalidate user state cache'
      );
      return;
    }
    try {
      await redis.eval(
        INVALIDATE_AUTH_USER_STATE,
        2,
        ...authUserStateInvalidationKeys([userId]),
        AUTH_USER_STATE_CACHE_TTL_SECONDS
      );
    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to invalidate user state cache');
    }
  }
}

/** 共有のインスタンス（生成に使った PrismaClient と組で持つ） */
let shared: { prisma: PrismaClient; service: AuthenticatedUserStateService } | null = null;

/**
 * 本番の経路で共有する AuthenticatedUserStateService を返す
 *
 * Redis のクライアントは呼び出しの時点で redis.ts から解決する（未初期化ならキャッシュを使わない）。
 * db.ts の PrismaClient が作り直されたときは、新しいクライアントで作り直す。
 */
export function getSharedAuthenticatedUserStateService(): AuthenticatedUserStateService {
  const prisma = getPrismaClient();
  if (!shared || shared.prisma !== prisma) {
    shared = {
      prisma,
      service: new AuthenticatedUserStateService(prisma, () => redisConnection.getClient()),
    };
  }
  return shared.service;
}
