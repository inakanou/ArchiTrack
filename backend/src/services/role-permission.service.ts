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

import type { PrismaClient } from '@prisma/client';
import type {
  IRolePermissionService,
  RolePermissionInfo,
  RolePermissionError,
} from '../types/role-permission.types.js';
import type { IRBACService } from '../types/rbac.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';

/**
 * ロール・権限紐付け管理サービスの実装
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
    try {
      // ロールの存在チェック
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 権限の存在チェック
      const permission = await this.prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!permission) {
        logger.warn({ permissionId }, 'Permission not found');
        return Err({ type: 'PERMISSION_NOT_FOUND' });
      }

      // 重複チェック
      const existing = await this.prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId,
        },
      });

      if (existing) {
        // 重複は無視（エラーにしない）
        logger.debug({ roleId, permissionId }, 'Permission already assigned, skipping');
        return Ok(undefined);
      }

      // 紐付け作成
      await this.prisma.rolePermission.create({
        data: {
          roleId,
          permissionId,
        },
      });

      logger.info(
        {
          roleId,
          permissionId,
          roleName: role.name,
          permission: `${permission.resource}:${permission.action}`,
        },
        'Permission added to role successfully'
      );

      // 監査ログ記録
      if (this.auditLogService && actorId) {
        await this.auditLogService.createLog({
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
        });
      }

      // ロールを持つ全ユーザーのキャッシュを無効化
      if (this.rbacService) {
        await this.rbacService.invalidateUserPermissionsCacheForRole(roleId);
      }

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, roleId, permissionId }, 'Failed to add permission to role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
    try {
      // ロールの存在チェック
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 権限の存在チェック
      const permission = await this.prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!permission) {
        logger.warn({ permissionId }, 'Permission not found');
        return Err({ type: 'PERMISSION_NOT_FOUND' });
      }

      // システム管理者ロールの *:* 権限削除保護
      if (role.name === 'admin' && permission.resource === '*' && permission.action === '*') {
        logger.warn(
          { roleId, permissionId, roleName: role.name },
          'Cannot remove *:* permission from admin role'
        );
        return Err({ type: 'ADMIN_WILDCARD_PROTECTED' });
      }

      // 紐付けの存在チェック
      const rolePermission = await this.prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId,
        },
      });

      if (!rolePermission) {
        logger.warn({ roleId, permissionId }, 'Permission assignment not found');
        return Err({ type: 'ASSIGNMENT_NOT_FOUND' });
      }

      // 紐付け削除
      await this.prisma.rolePermission.delete({
        where: { id: rolePermission.id },
      });

      logger.info(
        {
          roleId,
          permissionId,
          roleName: role.name,
          permission: `${permission.resource}:${permission.action}`,
        },
        'Permission removed from role successfully'
      );

      // 監査ログ記録
      if (this.auditLogService && actorId) {
        await this.auditLogService.createLog({
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
        });
      }

      // ロールを持つ全ユーザーのキャッシュを無効化
      if (this.rbacService) {
        await this.rbacService.invalidateUserPermissionsCacheForRole(roleId);
      }

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, roleId, permissionId }, 'Failed to remove permission from role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
      // ロールの存在チェック
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // 権限一覧を取得
      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true },
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
      logger.error({ error, roleId }, 'Failed to get role permissions');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 複数の権限を一括でロールに追加（トランザクション）
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @returns 成功またはエラー
   */
  async addPermissionsToRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<Result<void, RolePermissionError>> {
    // 各権限を個別に追加（重複チェック含む）
    for (const permissionId of permissionIds) {
      const result = await this.addPermissionToRole(roleId, permissionId);
      if (!result.ok && result.error.type !== 'DATABASE_ERROR') {
        // DATABASE_ERROR以外のエラー（ROLE_NOT_FOUND, PERMISSION_NOT_FOUND）は即座に返す
        return result;
      }
    }

    logger.info({ roleId, count: permissionIds.length }, 'Permissions added to role in bulk');
    return Ok(undefined);
  }

  /**
   * 複数の権限を一括でロールから削除（トランザクション）
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @returns 成功またはエラー
   */
  async removePermissionsFromRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<Result<void, RolePermissionError>> {
    // 各権限を個別に削除
    for (const permissionId of permissionIds) {
      const result = await this.removePermissionFromRole(roleId, permissionId);
      if (!result.ok && result.error.type !== 'DATABASE_ERROR') {
        // DATABASE_ERROR以外のエラーは即座に返す
        return result;
      }
    }

    logger.info({ roleId, count: permissionIds.length }, 'Permissions removed from role in bulk');
    return Ok(undefined);
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
    });

    return rolePermission !== null;
  }
}
