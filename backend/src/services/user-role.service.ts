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

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IUserRoleService, UserRoleInfo, UserRoleError } from '../types/user-role.types.js';
import type { IRBACService } from '../types/rbac.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type { EmailService } from './email.service.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import { captureMessage } from '../utils/sentry.js';

/**
 * 紐付けの変更を途中で打ち切り、トランザクションをロールバックさせるための合図。
 * 業務上のエラー（ロール不在など）を運ぶ。$transaction の外で Err へ戻す。
 */
class UserRoleRollback extends Error {
  constructor(readonly error: UserRoleError) {
    super(`User role change rolled back: ${error.type}`);
    this.name = 'UserRoleRollback';
  }
}

/** トランザクション内で確定した紐付けの変更（コミット後の通知に使う） */
interface UserRoleChange {
  changed: boolean;
  user: { id: string; email: string; displayName: string };
  role: { id: string; name: string };
}

type PerformedBy = { email: string; displayName: string };

/**
 * ユーザー・ロール紐付け管理サービスの実装
 *
 * 紐付けの書き込みと監査ログの記録は同じトランザクションで行う。
 * 一括操作は全件を一つのトランザクションで行い、1件でも失敗すれば全件をロールバックする。
 * 外部への通知（アラートメール・Sentry）と権限キャッシュの無効化はコミット後に行う。
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
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    return this.addRoles(userId, [roleId], actorId, performedBy);
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
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    return this.removeRoles(userId, [roleId], performedBy);
  }

  /**
   * ユーザーのロール一覧を取得
   *
   * @param userId - ユーザーID
   * @returns ロール情報の配列またはエラー
   */
  async getUserRoles(userId: string): Promise<Result<UserRoleInfo[], UserRoleError>> {
    try {
      // ユーザーの存在チェック (optimized: only check existence)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        logger.warn({ userId }, 'User not found');
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // ロール一覧を取得 (optimized: use select instead of include)
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        select: {
          assignedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              priority: true,
              isSystem: true,
            },
          },
        },
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
   * 全ロールの割り当てと監査ログを一つのトランザクションで行う。途中で1件でも失敗
   * （ユーザー・ロールの不在、書き込みや監査ログの失敗）すれば全件をロールバックする。
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @param performedBy - 実行者情報（アラート用、オプション）
   * @returns 成功またはエラー
   */
  async addRolesToUser(
    userId: string,
    roleIds: string[],
    actorId?: string,
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    const result = await this.addRoles(userId, roleIds, actorId, performedBy);
    if (result.ok) {
      logger.info({ userId, count: roleIds.length }, 'Roles added to user in bulk');
    }
    return result;
  }

  /**
   * 複数のロールを一括でユーザーから削除（トランザクション）
   *
   * 全ロールの削除を一つのトランザクションで行う。途中で1件でも失敗すれば全件をロールバックする。
   * 最後の管理者の保護はトランザクション内の件数で判定するため、一括削除の途中の削除も数に入る。
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @param performedBy - 実行者情報（アラート用、オプション）
   * @returns 成功またはエラー
   */
  async removeRolesFromUser(
    userId: string,
    roleIds: string[],
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    const result = await this.removeRoles(userId, roleIds, performedBy);
    if (result.ok) {
      logger.info({ userId, count: roleIds.length }, 'Roles removed from user in bulk');
    }
    return result;
  }

  /**
   * ロールの割り当て（1件・一括の共通処理）。全件を一つのトランザクションで行う
   */
  private async addRoles(
    userId: string,
    roleIds: string[],
    actorId?: string,
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    try {
      const changes = await this.prisma.$transaction(async (tx) => {
        const results: UserRoleChange[] = [];
        for (const roleId of roleIds) {
          results.push(await this.assignRoleInTransaction(tx, userId, roleId, actorId));
        }
        return results;
      });

      await this.afterCommit(userId, changes, 'assigned', performedBy);
      return Ok(undefined);
    } catch (error) {
      if (error instanceof UserRoleRollback) {
        return Err(error.error);
      }
      logger.error({ error, userId, roleIds }, 'Failed to add role to user');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ロールの削除（1件・一括の共通処理）。全件を一つのトランザクションで行う
   */
  private async removeRoles(
    userId: string,
    roleIds: string[],
    performedBy?: PerformedBy
  ): Promise<Result<void, UserRoleError>> {
    try {
      const changes = await this.prisma.$transaction(async (tx) => {
        const results: UserRoleChange[] = [];
        for (const roleId of roleIds) {
          results.push(await this.removeRoleInTransaction(tx, userId, roleId));
        }
        return results;
      });

      await this.afterCommit(userId, changes, 'revoked', performedBy);
      return Ok(undefined);
    } catch (error) {
      if (error instanceof UserRoleRollback) {
        return Err(error.error);
      }
      logger.error({ error, userId, roleIds }, 'Failed to remove role from user');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * トランザクション内でロールを1件割り当て、監査ログを同じトランザクションで記録する
   */
  private async assignRoleInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string,
    actorId?: string
  ): Promise<UserRoleChange> {
    // ユーザーの存在チェック (optimized: only fetch necessary fields)
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      logger.warn({ userId }, 'User not found');
      throw new UserRoleRollback({ type: 'USER_NOT_FOUND' });
    }

    // ロールの存在チェック (optimized: only fetch necessary fields)
    const role = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      logger.warn({ roleId }, 'Role not found');
      throw new UserRoleRollback({ type: 'ROLE_NOT_FOUND' });
    }

    // 重複チェック (optimized: only check existence)
    const existing = await tx.userRole.findFirst({
      where: { userId, roleId },
      select: { id: true },
    });
    if (existing) {
      // 重複は無視（エラーにしない）
      logger.debug({ userId, roleId }, 'Role already assigned, skipping');
      return { changed: false, user, role };
    }

    // 紐付け作成
    await tx.userRole.create({
      data: {
        userId,
        roleId,
      },
    });

    // 監査ログ記録（同じトランザクション。失敗すれば紐付けもロールバックされる）
    if (this.auditLogService && actorId) {
      await this.auditLogService.createLog(
        {
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
        },
        tx
      );
    }

    logger.info(
      { userId, roleId, userEmail: user.email, roleName: role.name },
      'Role added to user successfully'
    );
    return { changed: true, user, role };
  }

  /**
   * トランザクション内でロールを1件削除する
   */
  private async removeRoleInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string
  ): Promise<UserRoleChange> {
    // ユーザーの存在チェック (optimized: only fetch necessary fields)
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      logger.warn({ userId }, 'User not found');
      throw new UserRoleRollback({ type: 'USER_NOT_FOUND' });
    }

    // ロールの存在チェック (optimized: only fetch necessary fields)
    const role = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      logger.warn({ roleId }, 'Role not found');
      throw new UserRoleRollback({ type: 'ROLE_NOT_FOUND' });
    }

    // 紐付けの存在チェック (optimized: only fetch id for deletion)
    const userRole = await tx.userRole.findFirst({
      where: { userId, roleId },
      select: { id: true },
    });
    if (!userRole) {
      logger.warn({ userId, roleId }, 'Role assignment not found');
      throw new UserRoleRollback({ type: 'ASSIGNMENT_NOT_FOUND' });
    }

    // 最後の管理者保護（adminロールの場合のみ）
    if (role.name === 'admin') {
      const adminRoleCount = await tx.userRole.count({
        where: { roleId },
      });
      if (adminRoleCount <= 1) {
        logger.warn(
          { userId, roleId, userEmail: user.email },
          'Cannot remove admin role from last admin user'
        );
        throw new UserRoleRollback({ type: 'LAST_ADMIN_PROTECTED' });
      }
    }

    // 紐付け削除
    await tx.userRole.delete({
      where: { id: userRole.id },
    });

    logger.info(
      { userId, roleId, userEmail: user.email, roleName: role.name },
      'Role removed from user successfully'
    );
    return { changed: true, user, role };
  }

  /**
   * コミット後の処理: システム管理者ロールの変更アラートと権限キャッシュの無効化
   */
  private async afterCommit(
    userId: string,
    changes: UserRoleChange[],
    action: 'assigned' | 'revoked',
    performedBy?: PerformedBy
  ): Promise<void> {
    const changed = changes.filter((c) => c.changed);
    if (changed.length === 0) {
      return;
    }

    // システム管理者ロール変更時のアラート通知（テスト環境では抑制）
    for (const { user, role } of changed) {
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
          action,
          'System Administrator',
          performedBy
        );

        // Sentryにアラート通知を送信
        captureMessage(
          action === 'assigned'
            ? 'Critical: System Administrator role assigned'
            : 'Critical: System Administrator role removed',
          'warning',
          {
            userId,
            userEmail: user.email,
            roleId: role.id,
            roleName: role.name,
            performedBy: performedBy.email,
          }
        );
      }
    }

    // ユーザーの権限キャッシュを無効化
    if (this.rbacService) {
      await this.rbacService.invalidateUserPermissionsCache(userId);
    }
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
      select: { id: true },
    });

    return userRole !== null;
  }
}
