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
import {
  isCeilingError,
  recordCeilingRejection,
  type PrivilegeCeilingPort,
} from './privilege-ceiling.js';

/** 監査ログの変更前後の値に残すロールの項目 */
type RoleAuditSnapshot = {
  id: string;
  name: string;
  description: string;
  priority: number;
};

/**
 * ロールの削除を途中で打ち切り、トランザクションをロールバックさせるための合図。
 * 業務上のエラー（使用中など）を運ぶ。$transaction の外で Err へ戻す。
 */
class RoleRollback extends Error {
  constructor(
    readonly error: RoleError,
    /** 上限による拒否のときの、監査の記録の対象と付帯情報（タスク58.1） */
    readonly rejected?: { targetId: string; detail: Record<string, string> }
  ) {
    super(`Role change rolled back: ${error.type}`);
    this.name = 'RoleRollback';
  }
}

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
    private readonly auditLogService?: IAuditLogService,
    /**
     * 権限付与の上限（user-authentication タスク51.1・58.1）。システムロールの名前・優先度の変更、
     * 上限を超える優先度のロールの作成と優先度への変更、上限より上のロールの変更と削除を拒否する。
     * API の経路（roles.routes.ts）は必ず渡す
     */
    private readonly privilegeCeiling?: Pick<
      PrivilegeCeilingPort,
      | 'assertCanRenameRole'
      | 'assertCanSetRolePriority'
      | 'assertCanModifyRole'
      | 'assertCanChangeRolePriority'
    >
  ) {}

  /**
   * 上限による拒否を、ロールバックの後に権限チェックの失敗として記録する（タスク58.1）
   */
  private async recordRollbackRejection(rollback: RoleRollback, actorId?: string): Promise<void> {
    if (actorId && rollback.rejected && isCeilingError(rollback.error)) {
      await recordCeilingRejection(this.auditLogService, {
        actorId,
        targetType: 'role',
        targetId: rollback.rejected.targetId,
        error: rollback.error,
        detail: rollback.rejected.detail,
      });
    }
  }

  /**
   * 優先度の変更の上限（タスク58.1）。書き込みと同じトランザクションのクライアントで判定し、拒否は
   * RoleRollback で投げる。優先度が与えられ、かつ現在の値と異なるときだけ判定する（画面は説明だけの
   * 変更でも現在の優先度を送るため）。順は 38.12（システムロール）→ 38.11（現在の優先度）→ 38.6（変更後の優先度）
   */
  private async assertPriorityChange(
    tx: Prisma.TransactionClient,
    roleId: string,
    currentPriority: number,
    requestedPriority: number | undefined,
    actorId?: string
  ): Promise<void> {
    if (
      !this.privilegeCeiling ||
      requestedPriority === undefined ||
      requestedPriority === currentPriority
    ) {
      return;
    }
    const rejected = {
      targetId: roleId,
      detail: {
        currentPriority: String(currentPriority),
        requestedPriority: String(requestedPriority),
      },
    };
    // システムロールの優先度は実行者によらず変えられない（38.12）
    const system = await this.privilegeCeiling.assertCanChangeRolePriority(roleId, tx);
    if (!system.ok) {
      throw new RoleRollback(system.error, rejected);
    }
    if (!actorId) {
      return;
    }
    // 上限より上のロールの優先度は、上げる・下げるを問わず変えられない（38.11）
    const modify = await this.privilegeCeiling.assertCanModifyRole(actorId, roleId, tx);
    if (!modify.ok) {
      throw new RoleRollback(modify.error, rejected);
    }
    // 上限を超える優先度へは変えられない（38.6）
    const set = await this.privilegeCeiling.assertCanSetRolePriority(
      actorId,
      requestedPriority,
      tx
    );
    if (!set.ok) {
      throw new RoleRollback(set.error, rejected);
    }
  }

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
        // 上限を超える優先度のロールの作成の拒否（38.7。タスク58.1）。省略時は既定の 0 で判定する
        if (this.privilegeCeiling && actorId) {
          const requestedPriority = input.priority ?? 0;
          const verdict = await this.privilegeCeiling.assertCanSetRolePriority(
            actorId,
            requestedPriority,
            tx
          );
          if (!verdict.ok) {
            // ロールは作られないため、監査の対象には要求された名前を置く
            throw new RoleRollback(verdict.error, {
              targetId: input.name,
              detail: { requestedName: input.name, requestedPriority: String(requestedPriority) },
            });
          }
        }
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
      if (error instanceof RoleRollback) {
        await this.recordRollbackRejection(error, actorId);
        return Err(error.error);
      }
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

      // システムロールの名前の変更の拒否（タスク51.1）。名前が実際に変わるときだけ判定する
      // （画面は説明だけの変更でも同じ名前を送るため、同じ名前は拒否しない）
      if (this.privilegeCeiling && input.name !== undefined && input.name !== existingRole.name) {
        const verdict = await this.privilegeCeiling.assertCanRenameRole(roleId);
        if (!verdict.ok) {
          if (actorId) {
            await recordCeilingRejection(this.auditLogService, {
              actorId,
              targetType: 'role',
              targetId: roleId,
              error: verdict.error,
              detail: { currentName: existingRole.name, requestedName: input.name },
            });
          }
          return Err({ type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' });
        }
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
          // 優先度の変更の上限（タスク58.1）。読んだ行が古ければ後の条件付きの更新が 0 件になり競合で返る
          if (before) {
            await this.assertPriorityChange(tx, roleId, before.priority, input.priority, actorId);
          }
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
        // 優先度の変更の上限（タスク58.1）。行をロックした後の現在の値で判定する
        if (before) {
          await this.assertPriorityChange(tx, roleId, before.priority, input.priority, actorId);
        }
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
      if (error instanceof RoleRollback) {
        await this.recordRollbackRejection(error, actorId);
        return Err(error.error);
      }
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
      // 使用中の確認と削除を同じトランザクションで行い、並行する割り当てと直列化する（タスク37.1）
      const deletedName = await this.prisma.$transaction(async (tx) => {
        // Check role existence (optimized: only fetch necessary fields)
        const existingRole = await tx.role.findUnique({
          where: { id: roleId },
          select: { id: true, name: true, isSystem: true },
        });

        if (!existingRole) {
          logger.warn({ roleId }, 'Role not found');
          throw new RoleRollback({ type: 'ROLE_NOT_FOUND' });
        }

        // ロールの行を FOR UPDATE でロックしてから判定し、数える。割り当て（user_roles への INSERT）は
        // ロールの行に FOR KEY SHARE を取るため、ロックの後に新しい割り当ては入らず、
        // ロックの前から未コミットの割り当てがあればそのコミット（またはロールバック）まで待つ。
        // 優先度の変更（UPDATE）もロックの後は待つため、上限の判定から削除までの間に優先度は変わらない
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM roles WHERE id = ${roleId} FOR UPDATE`;
        if (locked.length === 0) {
          // 確認とロックの間に他の要求が削除した
          logger.warn({ roleId }, 'Role not found');
          throw new RoleRollback({ type: 'ROLE_NOT_FOUND' });
        }

        // 上限より上のロールの削除の拒否（38.11。タスク58.1）。ロックした行の現在の優先度で、
        // システムロールの保護・使用中より先に判定する
        if (this.privilegeCeiling && actorId) {
          const verdict = await this.privilegeCeiling.assertCanModifyRole(actorId, roleId, tx);
          if (!verdict.ok) {
            throw new RoleRollback(verdict.error, {
              targetId: roleId,
              detail: { roleName: existingRole.name },
            });
          }
        }

        // Protect system roles
        if (existingRole.isSystem) {
          logger.warn({ roleId, name: existingRole.name }, 'Cannot delete system role');
          throw new RoleRollback({ type: 'SYSTEM_ROLE_PROTECTED' });
        }

        // 使用中チェック（ユーザーに割り当てられているか）。待ちが明けた後の文は新しいスナップショットで読む
        const userCount = await tx.userRole.count({
          where: { roleId },
        });

        if (userCount > 0) {
          logger.warn({ roleId, name: existingRole.name, userCount }, 'Cannot delete role in use');
          throw new RoleRollback({ type: 'ROLE_IN_USE', userCount });
        }

        // ロール削除と監査ログを同じトランザクションで記録する
        const deleted = await tx.role.delete({
          where: { id: roleId },
        });
        await this.recordAuditLog(tx, 'ROLE_DELETED', roleId, deleted, null, actorId);
        return existingRole.name;
      }, connectBudgetTransactionOptions());

      logger.info({ roleId, name: deletedName }, 'Role deleted successfully');

      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      if (error instanceof RoleRollback) {
        await this.recordRollbackRejection(error, actorId);
        return Err(error.error);
      }
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
