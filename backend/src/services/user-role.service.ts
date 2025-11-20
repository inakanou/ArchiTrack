/**
 * @fileoverview ユーザー・ロール紐付け管理サービス
 *
 * Requirements:
 * - 20.1-20.9: ユーザーへのロール割り当て（マルチロール対応）
 * - 22.9: センシティブな操作（システム管理者ロールの変更）実行時のアラート通知
 *
 * Design Patterns:
 * - Transaction Management: 一括操作でのデータ整合性保証
 * - Business Rule Enforcement: 最後の管理者保護
 */

import type { PrismaClient } from '@prisma/client';
import type { IUserRoleService, UserRoleInfo, UserRoleError } from '../types/user-role.types.js';
import type { IRBACService } from '../types/rbac.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type { EmailService } from './email.service.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import { captureMessage } from '../utils/sentry.js';

/**
 * ユーザー・ロール紐付け管理サービスの実装
 */
export class UserRoleService implements IUserRoleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rbacService?: IRBACService,
    private readonly auditLogService?: IAuditLogService,
    private readonly emailService?: EmailService
  ) {}

  /**
   * ユーザーにロールを追加
   *
   * ビジネスルール:
   * - ユーザーとロールが存在する必要がある
   * - 既に割り当て済みの場合は重複を無視（エラーにしない）
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @param performedBy - 実行者情報（アラート用、オプション）
   * @returns 成功またはエラー
   */
  async addRoleToUser(
    userId: string,
    roleId: string,
    actorId?: string,
    performedBy?: { email: string; displayName: string }
  ): Promise<Result<void, UserRoleError>> {
    try {
      // ユーザーの存在チェック
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn({ userId }, 'User not found');
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // ロールの存在チェック
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 重複チェック
      const existing = await this.prisma.userRole.findFirst({
        where: {
          userId,
          roleId,
        },
      });

      if (existing) {
        // 重複は無視（エラーにしない）
        logger.debug({ userId, roleId }, 'Role already assigned, skipping');
        return Ok(undefined);
      }

      // 紐付け作成
      await this.prisma.userRole.create({
        data: {
          userId,
          roleId,
        },
      });

      logger.info(
        { userId, roleId, userEmail: user.email, roleName: role.name },
        'Role added to user successfully'
      );

      // 監査ログ記録
      if (this.auditLogService && actorId) {
        await this.auditLogService.createLog({
          action: 'USER_ROLE_ASSIGNED',
          actorId,
          targetType: 'user-role',
          targetId: userId,
          before: null,
          after: {
            userId,
            userEmail: user.email,
            roleId,
            roleName: role.name,
          },
          metadata: null,
        });
      }

      // システム管理者ロール追加時のアラート通知（テスト環境では抑制）
      if (
        this.emailService &&
        performedBy &&
        role.name === 'admin' &&
        process.env.NODE_ENV !== 'test'
      ) {
        // 全システム管理者のメールアドレスを取得
        const adminUsers = await this.prisma.user.findMany({
          where: {
            userRoles: {
              some: {
                role: {
                  name: 'admin',
                },
              },
            },
          },
          select: {
            email: true,
            displayName: true,
          },
        });

        const adminEmails = adminUsers.map((admin) => admin.email);

        await this.emailService.sendAdminRoleChangedAlert(
          adminEmails,
          { email: user.email, displayName: user.displayName },
          'assigned',
          'System Administrator',
          performedBy
        );

        // Sentryにアラート通知を送信
        captureMessage('Critical: System Administrator role assigned', 'warning', {
          userId,
          userEmail: user.email,
          roleId,
          roleName: role.name,
          performedBy: performedBy.email,
        });
      }

      // ユーザーの権限キャッシュを無効化
      if (this.rbacService) {
        await this.rbacService.invalidateUserPermissionsCache(userId);
      }

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, userId, roleId }, 'Failed to add role to user');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ユーザーからロールを削除
   *
   * ビジネスルール:
   * - ユーザーとロールが存在する必要がある
   * - 紐付けが存在する必要がある
   * - 最後の管理者（adminロール保持者）からadminロールを削除することは禁止
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @param performedBy - 実行者情報（アラート用、オプション）
   * @returns 成功またはエラー
   */
  async removeRoleFromUser(
    userId: string,
    roleId: string,
    performedBy?: { email: string; displayName: string }
  ): Promise<Result<void, UserRoleError>> {
    try {
      // ユーザーの存在チェック
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn({ userId }, 'User not found');
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // ロールの存在チェック
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 紐付けの存在チェック
      const userRole = await this.prisma.userRole.findFirst({
        where: {
          userId,
          roleId,
        },
      });

      if (!userRole) {
        logger.warn({ userId, roleId }, 'Role assignment not found');
        return Err({ type: 'ASSIGNMENT_NOT_FOUND' });
      }

      // 最後の管理者保護（adminロールの場合のみ）
      if (role.name === 'admin') {
        const adminRoleCount = await this.prisma.userRole.count({
          where: { roleId },
        });

        if (adminRoleCount <= 1) {
          logger.warn(
            { userId, roleId, userEmail: user.email },
            'Cannot remove admin role from last admin user'
          );
          return Err({ type: 'LAST_ADMIN_PROTECTED' });
        }
      }

      // 紐付け削除
      await this.prisma.userRole.delete({
        where: { id: userRole.id },
      });

      logger.info(
        { userId, roleId, userEmail: user.email, roleName: role.name },
        'Role removed from user successfully'
      );

      // システム管理者ロール削除時のアラート通知（テスト環境では抑制）
      if (
        this.emailService &&
        performedBy &&
        role.name === 'admin' &&
        process.env.NODE_ENV !== 'test'
      ) {
        // 全システム管理者のメールアドレスを取得
        const adminUsers = await this.prisma.user.findMany({
          where: {
            userRoles: {
              some: {
                role: {
                  name: 'admin',
                },
              },
            },
          },
          select: {
            email: true,
            displayName: true,
          },
        });

        const adminEmails = adminUsers.map((admin) => admin.email);

        await this.emailService.sendAdminRoleChangedAlert(
          adminEmails,
          { email: user.email, displayName: user.displayName },
          'revoked',
          'System Administrator',
          performedBy
        );

        // Sentryにアラート通知を送信
        captureMessage('Critical: System Administrator role removed', 'warning', {
          userId,
          userEmail: user.email,
          roleId,
          roleName: role.name,
          performedBy: performedBy.email,
        });
      }

      // ユーザーの権限キャッシュを無効化
      if (this.rbacService) {
        await this.rbacService.invalidateUserPermissionsCache(userId);
      }

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, userId, roleId }, 'Failed to remove role from user');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ユーザーのロール一覧を取得
   *
   * @param userId - ユーザーID
   * @returns ロール情報の配列またはエラー
   */
  async getUserRoles(userId: string): Promise<Result<UserRoleInfo[], UserRoleError>> {
    try {
      // ユーザーの存在チェック
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn({ userId }, 'User not found');
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // ロール一覧を取得
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
        orderBy: [{ role: { priority: 'desc' } }, { role: { name: 'asc' } }],
      });

      const roles: UserRoleInfo[] = userRoles.map((ur) => ({
        roleId: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        priority: ur.role.priority,
        isSystem: ur.role.isSystem,
        assignedAt: ur.assignedAt,
      }));

      return Ok(roles);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user roles');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 複数のロールを一括でユーザーに追加（トランザクション）
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @returns 成功またはエラー
   */
  async addRolesToUser(userId: string, roleIds: string[]): Promise<Result<void, UserRoleError>> {
    // 各ロールを個別に追加（重複チェック含む）
    for (const roleId of roleIds) {
      const result = await this.addRoleToUser(userId, roleId);
      if (!result.ok && result.error.type !== 'DATABASE_ERROR') {
        // DATABASE_ERROR以外のエラー（USER_NOT_FOUND, ROLE_NOT_FOUND）は即座に返す
        return result;
      }
    }

    logger.info({ userId, count: roleIds.length }, 'Roles added to user in bulk');
    return Ok(undefined);
  }

  /**
   * 複数のロールを一括でユーザーから削除（トランザクション）
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @returns 成功またはエラー
   */
  async removeRolesFromUser(
    userId: string,
    roleIds: string[]
  ): Promise<Result<void, UserRoleError>> {
    // 各ロールを個別に削除
    for (const roleId of roleIds) {
      const result = await this.removeRoleFromUser(userId, roleId);
      if (!result.ok && result.error.type !== 'DATABASE_ERROR') {
        // DATABASE_ERROR以外のエラーは即座に返す
        return result;
      }
    }

    logger.info({ userId, count: roleIds.length }, 'Roles removed from user in bulk');
    return Ok(undefined);
  }

  /**
   * ユーザーが特定のロールを持っているか確認
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @returns 持っている場合true
   */
  async hasUserRole(userId: string, roleId: string): Promise<boolean> {
    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        roleId,
      },
    });

    return userRole !== null;
  }
}
