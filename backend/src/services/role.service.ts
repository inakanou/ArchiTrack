/**
 * @fileoverview ロール管理サービス
 *
 * Requirements:
 * - 17.1-17.9: 動的ロール管理
 *
 * Design Patterns:
 * - Transaction Management: ロールの書き込みと監査ログを同じトランザクションで記録（要件22.1・25.5、タスク36.4）
 * - Validation: ビジネスルール検証（システムロール保護、使用中チェック）
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { AuditLogAction, IAuditLogService } from '../types/audit-log.types.js';
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
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';

/** 監査ログの変更前後の値に残すロールの項目 */
type RoleAuditSnapshot = {
  id: string;
  name: string;
  description: string;
  priority: number;
};

/**
 * ロール管理サービスの実装
 *
 * ロールの作成・更新・削除は、書き込みと監査ログ（ROLE_CREATED / ROLE_UPDATED / ROLE_DELETED）を
 * 同じトランザクションで記録する。監査ログの保存に失敗すれば書き込みもロールバックされる（要件25.5）。
 * 監査ログは監査ログサービスと実行者の両方が与えられたときに記録する。
 */
export class RoleService implements IRoleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogService?: IAuditLogService
  ) {}

  private toAuditSnapshot(role: RoleAuditSnapshot): RoleAuditSnapshot {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
    };
  }

  /**
   * ロールの監査ログを呼び出し元のトランザクションで記録する（失敗すれば書き込みごとロールバックされる）
   */
  private async recordAuditLog(
    tx: Prisma.TransactionClient,
    action: Extract<AuditLogAction, 'ROLE_CREATED' | 'ROLE_UPDATED' | 'ROLE_DELETED'>,
    roleId: string,
    before: RoleAuditSnapshot | null,
    after: RoleAuditSnapshot | null,
    actorId?: string
  ): Promise<void> {
    if (!this.auditLogService || !actorId) {
      return;
    }
    await this.auditLogService.createLog(
      {
        action,
        actorId,
        targetType: 'role',
        targetId: roleId,
        before: before ? this.toAuditSnapshot(before) : null,
        after: after ? this.toAuditSnapshot(after) : null,
        metadata: null,
      },
      tx
    );
  }

  private toRoleInfo(role: {
    id: string;
    name: string;
    description: string;
    priority: number;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): RoleInfo {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

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
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 作成されたロール情報またはエラー
   */
  async createRole(input: CreateRoleInput, actorId?: string): Promise<Result<RoleInfo, RoleError>> {
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

      // ロール作成と監査ログを同じトランザクションで記録する
      const role = await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            name: input.name,
            description: input.description,
            priority: input.priority ?? 0, // デフォルト: 0
            isSystem: false, // 新規ロールは常にfalse
          },
        });
        await this.recordAuditLog(tx, 'ROLE_CREATED', created.id, null, created, actorId);
        return created;
      }, connectBudgetTransactionOptions());

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
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, input }, 'Failed to create role');
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
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 更新されたロール情報またはエラー
   */
  async updateRole(
    roleId: string,
    input: UpdateRoleInput,
    actorId?: string
  ): Promise<Result<RoleInfo, RoleError>> {
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

      const data = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priority !== undefined && { priority: input.priority }),
      };

      // 楽観的ロック: 版が与えられたときだけ、updatedAt が一致する行に限って更新する
      if (input.expectedUpdatedAt !== undefined) {
        const expectedUpdatedAt = input.expectedUpdatedAt;
        const outcome = await this.prisma.$transaction(async (tx) => {
          // 監査ログの変更前の値。後の条件付きの更新が 1 件に当たったなら、版（updatedAt）は
          // この読み出しから変わっていない（並行する更新があれば updatedAt が進み 0 件になる）ため、
          // 読んだ行が更新の直前の値である
          const before = await tx.role.findUnique({ where: { id: roleId } });
          // 条件付きの更新。読んでから比べると、READ COMMITTED では同じ版から並行する2件が
          // どちらも比較を通りうる。条件を UPDATE の WHERE に置けば、後続は先行のコミットを待って
          // 条件を最新の行で評価し直し、0 件になる
          const { count } = await tx.role.updateMany({
            where: { id: roleId, updatedAt: expectedUpdatedAt },
            data,
          });
          if (count === 0) {
            // 0 件の理由（行が無いか、版が古いか）を読み直して区別する
            const current = await tx.role.findUnique({
              where: { id: roleId },
              select: { updatedAt: true },
            });
            return current
              ? ({ kind: 'conflict', actualUpdatedAt: current.updatedAt } as const)
              : ({ kind: 'not_found' } as const);
          }
          // 同じトランザクションの中で読むため、自身が書いた行（行ロックを保持中）が返る
          const role = await tx.role.findUniqueOrThrow({ where: { id: roleId } });
          await this.recordAuditLog(tx, 'ROLE_UPDATED', roleId, before ?? role, role, actorId);
          return { kind: 'updated', role } as const;
        }, connectBudgetTransactionOptions());

        if (outcome.kind === 'not_found') {
          logger.warn({ roleId }, 'Role not found');
          return Err({ type: 'ROLE_NOT_FOUND' });
        }
        if (outcome.kind === 'conflict') {
          logger.warn(
            { roleId, expectedUpdatedAt, actualUpdatedAt: outcome.actualUpdatedAt },
            'Role update conflict (optimistic lock)'
          );
          return Err({
            type: 'ROLE_CONFLICT',
            expectedUpdatedAt,
            actualUpdatedAt: outcome.actualUpdatedAt,
          });
        }

        logger.info({ roleId, changes: data }, 'Role updated successfully');
        return Ok(this.toRoleInfo(outcome.role));
      }

      // ロール更新と監査ログを同じトランザクションで記録する
      const updatedRole = await this.prisma.$transaction(async (tx) => {
        // 監査ログの変更前の値。更新と同じトランザクションで行をロックして読み、
        // 読み出しから更新までの間に並行する更新が割り込まないようにする。ロックは UPDATE 自身が
        // 取るものと同じ FOR NO KEY UPDATE とし、外部キーの検査（割り当ての INSERT）を待たせない
        const [before] = await tx.$queryRaw<RoleAuditSnapshot[]>`
          SELECT id, name, description, priority FROM roles WHERE id = ${roleId} FOR NO KEY UPDATE`;
        const updated = await tx.role.update({
          where: { id: roleId },
          data,
        });
        await this.recordAuditLog(tx, 'ROLE_UPDATED', roleId, before ?? updated, updated, actorId);
        return updated;
      }, connectBudgetTransactionOptions());

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
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, roleId, input }, 'Failed to update role');
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
   * @param actorId - 実行者ユーザーID（監査ログ用、オプション）
   * @returns 成功またはエラー
   */
  async deleteRole(roleId: string, actorId?: string): Promise<Result<void, RoleError>> {
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

      // ロール削除と監査ログを同じトランザクションで記録する
      await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.role.delete({
          where: { id: roleId },
        });
        await this.recordAuditLog(tx, 'ROLE_DELETED', roleId, deleted, null, actorId);
      }, connectBudgetTransactionOptions());

      logger.info({ roleId, name: existingRole.name }, 'Role deleted successfully');

      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, roleId }, 'Failed to delete role');
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
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, roleId }, 'Failed to get role');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
