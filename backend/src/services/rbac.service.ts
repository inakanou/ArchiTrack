/**
 * @fileoverview RBAC（Role-Based Access Control）サービス
 *
 * Requirements:
 * - 6.1-6.8: ロールベースアクセス制御（RBAC）
 * - 21.1-21.10: セキュリティ要件（認可・権限管理）
 *
 * Design Patterns:
 * - Cache-Aside Pattern: Redisキャッシュを使用した権限情報のキャッシング（15分TTL）
 * - Graceful Degradation: Redisが利用できない場合はDBフォールバック
 * - N+1 Prevention: Prisma includeを使用した効率的なクエリ
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type Redis from 'ioredis';
import type { IRBACService, PermissionInfo } from '../types/rbac.types.js';
import logger from '../utils/logger.js';

/**
 * RBACサービスの実装
 */
export class RBACService implements IRBACService {
  /** 権限キャッシュのTTL（秒） */
  private readonly PERMISSION_CACHE_TTL = 15 * 60; // 15分

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis
  ) {}

  /**
   * ユーザーが持つ全ての権限を取得
   *
   * N+1問題を回避するため、Prisma includeで一度に全てのデータを取得。
   * Redisキャッシュを使用してパフォーマンスを最適化（Cache-Aside Pattern）。
   *
   * @param userId - ユーザーID
   * @returns ユーザーが持つ権限情報の配列
   */
  async getUserPermissions(userId: string): Promise<PermissionInfo[]> {
    // キャッシュキー
    const cacheKey = `rbac:permissions:${userId}`;

    // Redisキャッシュをチェック（Cache-Aside Pattern）
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          logger.debug({ userId }, 'Permission cache hit');
          return JSON.parse(cached) as PermissionInfo[];
        }
      } catch (error) {
        // Graceful Degradation: Redisエラー時はログを出してDBフォールバック
        logger.warn({ error, userId }, 'Failed to get permissions from Redis cache');
      }
    }

    // DBから取得（N+1防止のため selectで一度に必要なデータのみ取得、optimized）
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: {
          select: {
            role: {
              select: {
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        id: true,
                        resource: true,
                        action: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // ユーザーが存在しない場合は空配列
    if (!user) {
      return [];
    }

    // 全ロールの権限を集約（重複を除外）
    const permissionMap = new Map<string, PermissionInfo>();

    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        const permission = rolePermission.permission;
        const key = `${permission.resource}:${permission.action}`;

        // 重複を除外（既にMapに存在する場合はスキップ）
        if (!permissionMap.has(key)) {
          permissionMap.set(key, {
            id: permission.id,
            resource: permission.resource,
            action: permission.action,
            description: permission.description,
          });
        }
      }
    }

    const permissions = Array.from(permissionMap.values());

    // Redisにキャッシュ（Cache-Aside Pattern）
    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, this.PERMISSION_CACHE_TTL, JSON.stringify(permissions));
        logger.debug({ userId, count: permissions.length }, 'Permissions cached to Redis');
      } catch (error) {
        // Graceful Degradation: キャッシュ失敗してもエラーにしない
        logger.warn({ error, userId }, 'Failed to cache permissions to Redis');
      }
    }

    return permissions;
  }

  /**
   * ユーザーが指定された権限を持っているかチェック
   *
   * ワイルドカードマッチングをサポート:
   * - *:* → 全てのリソース・アクション
   * - *:action → 全てのリソースの特定アクション（例: *:read）
   * - resource:* → 特定リソースの全てのアクション（例: adr:*）
   *
   * @param userId - ユーザーID
   * @param permission - 権限文字列（例: "adr:read", "user:create"）
   * @returns 権限を持っている場合true、持っていない場合false
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    // 権限形式のバリデーション（resource:action形式）
    if (!this.isValidPermissionFormat(permission)) {
      logger.warn({ userId, permission }, 'Invalid permission format');
      return false;
    }

    // ユーザーの全権限を取得
    const userPermissions = await this.getUserPermissions(userId);

    // 権限が存在しない場合はfalse
    if (userPermissions.length === 0) {
      return false;
    }

    // 要求された権限を分解
    const [requiredResource, requiredAction] = permission.split(':');

    // ユーザーの権限とマッチングチェック（ワイルドカード対応）
    return userPermissions.some((userPermission) => {
      return this.matchPermission(
        userPermission.resource,
        userPermission.action,
        requiredResource!,
        requiredAction!
      );
    });
  }

  /**
   * 権限形式のバリデーション
   *
   * @param permission - 権限文字列
   * @returns resource:action形式の場合true、それ以外はfalse
   */
  private isValidPermissionFormat(permission: string): boolean {
    const parts = permission.split(':');
    return parts.length === 2;
  }

  /**
   * ワイルドカードを考慮した権限マッチング
   *
   * マッチングルール:
   * - *:* → 全ての権限にマッチ
   * - *:action → 任意のリソースの特定アクションにマッチ
   * - resource:* → 特定リソースの任意のアクションにマッチ
   * - resource:action → 完全一致
   *
   * @param userResource - ユーザーが持つリソース
   * @param userAction - ユーザーが持つアクション
   * @param requiredResource - 要求されたリソース
   * @param requiredAction - 要求されたアクション
   * @returns マッチする場合true
   */
  private matchPermission(
    userResource: string,
    userAction: string,
    requiredResource: string,
    requiredAction: string
  ): boolean {
    // ケース1: *:* → 全てにマッチ
    if (userResource === '*' && userAction === '*') {
      return true;
    }

    // ケース2: *:action → 任意のリソースの特定アクション
    if (userResource === '*' && userAction === requiredAction) {
      return true;
    }

    // ケース3: resource:* → 特定リソースの任意のアクション
    if (userResource === requiredResource && userAction === '*') {
      return true;
    }

    // ケース4: resource:action → 完全一致
    if (userResource === requiredResource && userAction === requiredAction) {
      return true;
    }

    // マッチしない
    return false;
  }

  /**
   * 指定されたユーザーの権限キャッシュを無効化
   *
   * ロールや権限が変更された場合に呼び出して、古いキャッシュを削除します。
   * Redisが利用できない場合は、エラーをログに記録してGraceful Degradation。
   *
   * @param userId - ユーザーID
   */
  async invalidateUserPermissionsCache(userId: string): Promise<void> {
    if (!this.redis) {
      // Redisが注入されていない場合は何もしない
      return;
    }

    const cacheKey = `rbac:permissions:${userId}`;

    try {
      await this.redis.del(cacheKey);
      logger.debug({ userId }, 'Permission cache invalidated');
    } catch (error) {
      // Graceful Degradation: キャッシュ無効化失敗してもエラーにしない
      logger.warn({ error, userId }, 'Failed to invalidate permission cache');
    }
  }

  /**
   * 指定されたロールを持つ全ユーザーの権限キャッシュを無効化
   *
   * ロールに権限が追加・削除された場合に呼び出して、そのロールを持つ
   * 全ユーザーのキャッシュを無効化します。
   *
   * @param roleId - ロールID
   */
  async invalidateUserPermissionsCacheForRole(roleId: string): Promise<void> {
    if (!this.redis) {
      // Redisが注入されていない場合は何もしない
      return;
    }

    try {
      // ロールを持つ全ユーザーを取得
      const userRoles = await this.prisma.userRole.findMany({
        where: { roleId },
        select: { userId: true },
      });

      if (userRoles.length === 0) {
        // ロールを持つユーザーがいない場合は何もしない
        return;
      }

      // 全ユーザーのキャッシュキーを生成
      const cacheKeys = userRoles.map((ur) => `rbac:permissions:${ur.userId}`);

      // 一括削除
      await this.redis.del(...cacheKeys);

      logger.debug(
        { roleId, userCount: userRoles.length },
        'Permission cache invalidated for role'
      );
    } catch (error) {
      // Graceful Degradation: キャッシュ無効化失敗してもエラーにしない
      logger.warn({ error, roleId }, 'Failed to invalidate permission cache for role');
    }
  }
}
