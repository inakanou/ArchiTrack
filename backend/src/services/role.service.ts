/**
 * @fileoverview ロール管理サービス
 *
 * Requirements:
 * - 17.1-17.9: 動的ロール管理
 *
 * Design Patterns:
 * - Transaction Management: ロール作成・更新でのデータ整合性保証
 * - Validation: ビジネスルール検証（システムロール保護、使用中チェック）
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IRoleService,
  CreateRoleInput,
  UpdateRoleInput,
  RoleInfo,
  RoleWithStats,
  RoleError,
} from '../types/role.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';

/**
 * ロール管理サービスの実装
 */
export class RoleService implements IRoleService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 新しいロールを作成
   *
   * ビジネスルール:
   * - ロール名は一意である必要がある
   * - 優先順位のデフォルト値は0
   * - isSystemはfalse（システムロールは手動で作成しない）
   * - 新規ロールはデフォルトで空の権限セットを持つ
   *
   * @param input - ロール作成入力
   * @returns 作成されたロール情報またはエラー
   */
  async createRole(input: CreateRoleInput): Promise<Result<RoleInfo, RoleError>> {
    try {
      // Check role name duplication (optimized: only check existence)
      const existingRole = await this.prisma.role.findUnique({
        where: { name: input.name },
        select: { id: true },
      });

      if (existingRole) {
        logger.warn({ name: input.name }, 'Role name already exists');
        return Err({ type: 'ROLE_NAME_CONFLICT', name: input.name });
      }

      // ロール作成
      const role = await this.prisma.role.create({
        data: {
          name: input.name,
          description: input.description,
          priority: input.priority ?? 0, // デフォルト: 0
          isSystem: false, // 新規ロールは常にfalse
        },
      });

      logger.info({ roleId: role.id, name: role.name }, 'Role created successfully');

      return Ok({
        id: role.id,
        name: role.name,
        description: role.description,
        priority: role.priority,
        isSystem: role.isSystem,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      });
    } catch (error) {
      logger.error({ error, input }, 'Failed to create role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ロール情報を更新
   *
   * ビジネスルール:
   * - ロールが存在する必要がある
   * - 名前を変更する場合、重複チェックが必要
   *
   * @param roleId - ロールID
   * @param input - ロール更新入力
   * @returns 更新されたロール情報またはエラー
   */
  async updateRole(roleId: string, input: UpdateRoleInput): Promise<Result<RoleInfo, RoleError>> {
    try {
      // Check role existence (optimized: only fetch id and name)
      const existingRole = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true },
      });

      if (!existingRole) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // Check name duplication when changing name (optimized: only check existence)
      if (input.name && input.name !== existingRole.name) {
        const duplicateRole = await this.prisma.role.findUnique({
          where: { name: input.name },
          select: { id: true },
        });

        if (duplicateRole) {
          logger.warn({ name: input.name }, 'Role name already exists');
          return Err({ type: 'ROLE_NAME_CONFLICT', name: input.name });
        }
      }

      // ロール更新
      const updatedRole = await this.prisma.role.update({
        where: { id: roleId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.priority !== undefined && { priority: input.priority }),
        },
      });

      logger.info({ roleId, changes: input }, 'Role updated successfully');

      return Ok({
        id: updatedRole.id,
        name: updatedRole.name,
        description: updatedRole.description,
        priority: updatedRole.priority,
        isSystem: updatedRole.isSystem,
        createdAt: updatedRole.createdAt,
        updatedAt: updatedRole.updatedAt,
      });
    } catch (error) {
      logger.error({ error, roleId, input }, 'Failed to update role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ロールを削除
   *
   * ビジネスルール:
   * - ロールが存在する必要がある
   * - システムロール（isSystem=true）は削除不可
   * - 少なくとも1人のユーザーに割り当てられている場合は削除不可
   *
   * @param roleId - ロールID
   * @returns 成功またはエラー
   */
  async deleteRole(roleId: string): Promise<Result<void, RoleError>> {
    try {
      // Check role existence (optimized: only fetch necessary fields)
      const existingRole = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true, isSystem: true },
      });

      if (!existingRole) {
        logger.warn({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      // Protect system roles
      if (existingRole.isSystem) {
        logger.warn({ roleId, name: existingRole.name }, 'Cannot delete system role');
        return Err({ type: 'SYSTEM_ROLE_PROTECTED' });
      }

      // 使用中チェック（ユーザーに割り当てられているか）
      const userCount = await this.prisma.userRole.count({
        where: { roleId },
      });

      if (userCount > 0) {
        logger.warn({ roleId, name: existingRole.name, userCount }, 'Cannot delete role in use');
        return Err({ type: 'ROLE_IN_USE', userCount });
      }

      // ロール削除
      await this.prisma.role.delete({
        where: { id: roleId },
      });

      logger.info({ roleId, name: existingRole.name }, 'Role deleted successfully');

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to delete role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 全ロール一覧を取得（統計情報付き）
   *
   * 統計情報:
   * - userCount: 割り当てユーザー数
   * - permissionCount: 権限数
   *
   * @returns ロール一覧（ユーザー数、権限数含む）
   */
  async listRoles(): Promise<RoleWithStats[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' }, // 優先順位が高い順
        { name: 'asc' }, // 同優先順位の場合は名前順
      ],
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      permissionCount: role._count.rolePermissions,
    }));
  }

  /**
   * ロールIDでロールを取得
   *
   * @param roleId - ロールID
   * @returns ロール情報またはエラー
   */
  async getRoleById(roleId: string): Promise<Result<RoleInfo, RoleError>> {
    try {
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        logger.debug({ roleId }, 'Role not found');
        return Err({ type: 'ROLE_NOT_FOUND' });
      }

      return Ok({
        id: role.id,
        name: role.name,
        description: role.description,
        priority: role.priority,
        isSystem: role.isSystem,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      });
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to get role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
