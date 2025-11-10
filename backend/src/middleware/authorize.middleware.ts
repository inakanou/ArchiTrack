/**
 * @fileoverview 権限チェックミドルウェア
 *
 * Requirements:
 * - 21.1: APIエンドポイントにアクセスする際、必要な権限を検証
 * - 21.2: ユーザーが必要な権限を持たない場合、403 Forbiddenエラーを返す
 * - 21.7: 権限チェックに失敗した場合、監査ログに記録
 *
 * Design Patterns:
 * - Higher-Order Function: ミドルウェアファクトリーパターン
 * - Dependency Injection: RBACServiceとPrismaClientを注入可能
 */

import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { RBACService } from '../services/rbac.service';
import getPrismaClient from '../db';
import logger from '../utils/logger';

/**
 * 権限チェックミドルウェアファクトリー
 *
 * 指定された権限を持っているかチェックするミドルウェアを生成します。
 *
 * @param permission - 必要な権限（例: "adr:read", "user:create"）
 * @param rbacService - RBACServiceインスタンス（テスト用オプション）
 * @param prismaClient - PrismaClientインスタンス（テスト用オプション）
 * @returns Expressミドルウェア関数
 *
 * @example
 * ```typescript
 * app.get('/api/adr/:id',
 *   authenticate,
 *   requirePermission('adr:read'),
 *   getADRHandler
 * );
 * ```
 */
export function requirePermission(
  permission: string,
  rbacService?: RBACService,
  prismaClient?: PrismaClient
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 認証チェック（req.userが存在するか）
      if (!req.user) {
        logger.warn({ permission }, 'Permission check failed: user not authenticated');
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      const { userId } = req.user;

      // RBACServiceとPrismaClientインスタンスを取得（テスト時は注入されたものを使用）
      const client = prismaClient || getPrismaClient();
      const service = rbacService || new RBACService(client);

      // 権限チェック
      const hasPermission = await service.hasPermission(userId, permission);

      if (!hasPermission) {
        logger.warn(
          { userId, email: req.user.email, permission },
          'Permission check failed: insufficient permissions'
        );

        // 監査ログに記録
        await recordPermissionCheckFailure(
          userId,
          permission,
          req.ip || 'unknown',
          req.get('user-agent') || 'unknown',
          client
        );

        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Insufficient permissions',
          required: permission,
        });
        return;
      }

      // 権限チェック成功
      logger.debug({ userId, permission }, 'Permission check passed');
      next();
    } catch (error) {
      logger.error({ error, permission, userId: req.user?.userId }, 'Permission check error');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to check permissions',
      });
    }
  };
}

/**
 * 権限チェック失敗を監査ログに記録
 *
 * @param actorId - アクターID（ユーザーID）
 * @param requiredPermission - 必要な権限
 * @param ip - IPアドレス
 * @param userAgent - User-Agent
 * @param prismaClient - PrismaClientインスタンス
 */
async function recordPermissionCheckFailure(
  actorId: string,
  requiredPermission: string,
  ip: string,
  userAgent: string,
  prismaClient: PrismaClient
): Promise<void> {
  try {
    await prismaClient.auditLog.create({
      data: {
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'Permission',
        targetId: requiredPermission,
        metadata: {
          required: requiredPermission,
          ip,
          userAgent,
        },
      },
    });
  } catch (error) {
    // 監査ログ記録失敗はエラーをスローせずログに記録
    logger.error({ error, actorId, requiredPermission }, 'Failed to record audit log');
  }
}
