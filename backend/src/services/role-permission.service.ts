/**
 * @fileoverview ロール・権限紐付け管理サービス
 *
 * Requirements:
 * - 19.1-19.8: ロールへの権限割り当て
 *
 * Design Patterns:
 * - Transaction Management: 一括操作でのデータ整合性保証
 * - Business Rule Enforcement: システム管理者ロールの*:*権限保護
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type {
  IRolePermissionService,
  RolePermissionInfo,
  RolePermissionError,
} from '../types/role-permission.types.js';
import type { IRBACService } from '../types/rbac.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';

/**
 * 紐付けの変更を途中で打ち切り、トランザクションをロールバックさせるための合図。
 * 業務上のエラー（ロール・権限の不在など）を運ぶ。$transaction の外で Err へ戻す。
 */
class RolePermissionRollback extends Error {
  constructor(readonly error: RolePermissionError) {
    super(`Role permission change rolled back: ${error.type}`);
    this.name = 'RolePermissionRollback';
  }
}

/**
 * ロール・権限紐付け管理サービスの実装
 *
 * 変更前の検証（ロール・権限の存在、重複、紐付けの存在、システム管理者ロールの保護）、
 * 紐付けの書き込み、監査ログの記録を一つのトランザクションで行う。一括操作は全件を
 * 一つのトランザクションで行い、1件でも失敗すればロールの権限は変更前の状態に戻る。
 * 権限キャッシュの無効化はコミット後に行う。
 */
export class RolePermissionService implements IRolePermissionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rbacService?: IRBACService,
    private readonly auditLogService?: IAuditLogService
  ) {}

  /**
   * ロールに権限を追加
   *
   * ビジネスルール:
   * - ロールと権限が存在する必要がある
   * - 既に割り当て済みの場合は重複を無視（エラーにしない）
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 成功またはエラー
   */
  async addPermissionToRole(
    roleId: string,
    permissionId: string,
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    return this.addPermissions(roleId, [permissionId], actorId);
  }

  /**
   * ロールから権限を削除
   *
   * ビジネスルール:
   * - ロールと権限が存在する必要がある
   * - 紐付けが存在する必要がある
   * - システム管理者ロール（name='admin'）から *:* 権限を削除することは禁止
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 成功またはエラー
   */
  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    return this.removePermissions(roleId, [permissionId], actorId);
  }

  /**
   * ロールの権限一覧を取得
   *
   * @param roleId - ロールID
   * @returns 権限情報の配列またはエラー
   */
  async getRolePermissions(
    roleId: string
  ): Promise<Result<RolePermissionInfo[], RolePermissionError>> {
    try {
      // ロールの存在チェック (optimized: only check existence)
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 権限一覧を取得 (optimized: use select instead of include)
      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { roleId },
        select: {
          assignedAt: true,
          permission: {
            select: {
              id: true,
              resource: true,
              action: true,
              description: true,
            },
          },
        },
        orderBy: [{ permission: { resource: 'asc' } }, { permission: { action: 'asc' } }],
      });

      const permissions: RolePermissionInfo[] = rolePermissions.map((rp) => ({
        permissionId: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
        assignedAt: rp.assignedAt,
      }));

      return Ok(permissions);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, roleId }, 'Failed to get role permissions');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 複数の権限を一括でロールに追加（トランザクション）
   *
   * 全権限の割り当てと監査ログを一つのトランザクションで行う。途中で1件でも失敗
   * （ロール・権限の不在、書き込みや監査ログの失敗）すれば全件をロールバックする。
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 成功またはエラー
   */
  async addPermissionsToRole(
    roleId: string,
    permissionIds: string[],
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    const result = await this.addPermissions(roleId, permissionIds, actorId);
    if (result.ok) {
      logger.info({ roleId, count: permissionIds.length }, 'Permissions added to role in bulk');
    }
    return result;
  }

  /**
   * 複数の権限を一括でロールから削除（トランザクション）
   *
   * 全権限の削除と監査ログを一つのトランザクションで行う。途中で1件でも失敗すれば全件をロールバックする。
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 成功またはエラー
   */
  async removePermissionsFromRole(
    roleId: string,
    permissionIds: string[],
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    const result = await this.removePermissions(roleId, permissionIds, actorId);
    if (result.ok) {
      logger.info({ roleId, count: permissionIds.length }, 'Permissions removed from role in bulk');
    }
    return result;
  }

  /**
   * 権限の割り当て（1件・一括の共通処理）。全件を一つのトランザクションで行う
   */
  private async addPermissions(
    roleId: string,
    permissionIds: string[],
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    try {
      const changed = await this.prisma.$transaction(async (tx) => {
        let count = 0;
        for (const permissionId of permissionIds) {
          if (await this.assignPermissionInTransaction(tx, roleId, permissionId, actorId)) {
            count++;
          }
        }
        return count;
      }, connectBudgetTransactionOptions());

      await this.afterCommit(roleId, changed);
      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      if (error instanceof RolePermissionRollback) {
        return Err(error.error);
      }
      logger.error({ err: error, roleId, permissionIds }, 'Failed to add permission to role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 権限の削除（1件・一括の共通処理）。全件を一つのトランザクションで行う
   */
  private async removePermissions(
    roleId: string,
    permissionIds: string[],
    actorId?: string
  ): Promise<Result<void, RolePermissionError>> {
    try {
      const changed = await this.prisma.$transaction(async (tx) => {
        for (const permissionId of permissionIds) {
          await this.removePermissionInTransaction(tx, roleId, permissionId, actorId);
        }
        return permissionIds.length;
      }, connectBudgetTransactionOptions());

      await this.afterCommit(roleId, changed);
      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      if (error instanceof RolePermissionRollback) {
        return Err(error.error);
      }
      logger.error({ err: error, roleId, permissionIds }, 'Failed to remove permission from role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * トランザクション内で権限を1件割り当て、監査ログを同じトランザクションで記録する
   *
   * @returns 新たに割り当てた場合 true（既に割り当て済みで何もしなかった場合 false）
   */
  private async assignPermissionInTransaction(
    tx: Prisma.TransactionClient,
    roleId: string,
    permissionId: string,
    actorId?: string
  ): Promise<boolean> {
    // ロールの存在チェック (optimized: only fetch necessary fields)
    const role = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      logger.warn({ roleId }, 'Role not found');
      throw new RolePermissionRollback({ type: 'ROLE_NOT_FOUND' });
    }

    // 権限の存在チェック (optimized: only fetch necessary fields)
    const permission = await tx.permission.findUnique({
      where: { id: permissionId },
      select: { id: true, resource: true, action: true },
    });
    if (!permission) {
      logger.warn({ permissionId }, 'Permission not found');
      throw new RolePermissionRollback({ type: 'PERMISSION_NOT_FOUND' });
    }

    // 重複チェック (optimized: only check existence)
    const existing = await tx.rolePermission.findFirst({
      where: { roleId, permissionId },
      select: { id: true },
    });
    if (existing) {
      // 重複は無視（エラーにしない）
      logger.debug({ roleId, permissionId }, 'Permission already assigned, skipping');
      return false;
    }

    // 紐付け作成
    await tx.rolePermission.create({
      data: {
        roleId,
        permissionId,
      },
    });

    // 監査ログ記録（同じトランザクション。失敗すれば紐付けもロールバックされる）
    if (this.auditLogService && actorId) {
      await this.auditLogService.createLog(
        {
          action: 'PERMISSION_ASSIGNED',
          actorId,
          targetType: 'role-permission',
          targetId: roleId,
          before: null,
          after: {
            roleId,
            roleName: role.name,
            permissionId,
            permission: `${permission.resource}:${permission.action}`,
          },
          metadata: null,
        },
        tx
      );
    }

    logger.info(
      {
        roleId,
        permissionId,
        roleName: role.name,
        permission: `${permission.resource}:${permission.action}`,
      },
      'Permission added to role successfully'
    );
    return true;
  }

  /**
   * トランザクション内で権限を1件削除し、監査ログを同じトランザクションで記録する
   */
  private async removePermissionInTransaction(
    tx: Prisma.TransactionClient,
    roleId: string,
    permissionId: string,
    actorId?: string
  ): Promise<void> {
    // ロールの存在チェック (optimized: only fetch necessary fields)
    const role = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      logger.warn({ roleId }, 'Role not found');
      throw new RolePermissionRollback({ type: 'ROLE_NOT_FOUND' });
    }

    // 権限の存在チェック (optimized: only fetch necessary fields)
    const permission = await tx.permission.findUnique({
      where: { id: permissionId },
      select: { id: true, resource: true, action: true },
    });
    if (!permission) {
      logger.warn({ permissionId }, 'Permission not found');
      throw new RolePermissionRollback({ type: 'PERMISSION_NOT_FOUND' });
    }

    // システム管理者ロールの *:* 権限削除保護
    if (role.name === 'admin' && permission.resource === '*' && permission.action === '*') {
      logger.warn(
        { roleId, permissionId, roleName: role.name },
        'Cannot remove *:* permission from admin role'
      );
      throw new RolePermissionRollback({ type: 'ADMIN_WILDCARD_PROTECTED' });
    }

    // 紐付けの存在チェック (optimized: only fetch id for deletion)
    const rolePermission = await tx.rolePermission.findFirst({
      where: { roleId, permissionId },
      select: { id: true },
    });
    if (!rolePermission) {
      logger.warn({ roleId, permissionId }, 'Permission assignment not found');
      throw new RolePermissionRollback({ type: 'ASSIGNMENT_NOT_FOUND' });
    }

    // 紐付け削除
    await tx.rolePermission.delete({
      where: { id: rolePermission.id },
    });

    // 監査ログ記録（同じトランザクション。失敗すれば削除も取り消される）
    if (this.auditLogService && actorId) {
      await this.auditLogService.createLog(
        {
          action: 'PERMISSION_REVOKED',
          actorId,
          targetType: 'role-permission',
          targetId: roleId,
          before: {
            roleId,
            roleName: role.name,
            permissionId,
            permission: `${permission.resource}:${permission.action}`,
          },
          after: null,
          metadata: null,
        },
        tx
      );
    }

    logger.info(
      {
        roleId,
        permissionId,
        roleName: role.name,
        permission: `${permission.resource}:${permission.action}`,
      },
      'Permission removed from role successfully'
    );
  }

  /**
   * コミット後の処理: ロールを持つ全ユーザーの権限キャッシュを無効化
   */
  private async afterCommit(roleId: string, changedCount: number): Promise<void> {
    if (changedCount > 0 && this.rbacService) {
      await this.rbacService.invalidateUserPermissionsCacheForRole(roleId);
    }
  }

  /**
   * ロールが特定の権限を持っているか確認
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @returns 持っている場合true
   */
  async hasRolePermission(roleId: string, permissionId: string): Promise<boolean> {
    const rolePermission = await this.prisma.rolePermission.findFirst({
      where: {
        roleId,
        permissionId,
      },
      select: { id: true },
    });

    return rolePermission !== null;
  }
}
