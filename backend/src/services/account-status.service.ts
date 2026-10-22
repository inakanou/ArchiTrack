/**
 * @fileoverview 利用者の無効化と再有効化（タスク49.2）
 *
 * Requirements (user-authentication):
 * - REQ-36.1: 無効化で全リフレッシュトークンを失効させ、以後のリフレッシュと API を拒否させる
 * - REQ-36.3: 再有効化で再び利用できるようにする
 * - REQ-36.4: 無効化・再有効化を全システム管理者へ通知し、監査に実行者・対象・理由を記録する
 * - REQ-36.5: 自分自身と最後の有効なシステム管理者の無効化を拒否する
 *
 * 責任と境界:
 * - 状態の記録・全リフレッシュトークンの失効・監査は一つのトランザクションで行う
 * - 状態のキャッシュの無効化と通知はコミットの後に行い、その失敗は結果を変えない
 * - 90 日の自動無効化（deactivateInactiveUsers）はタスク49.4 が足す
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { RequestContext } from '../types/auth.types.js';
import type { AuthenticatedUserStateService } from './authenticated-user-state.service.js';
import type { IAdminNotificationService } from './admin-notification.service.js';
import { Ok, Err, type Result } from '../types/result.js';
import { snapshotAuditActor } from './audit-log.service.js';
import { lockAdminRoleForLastAdminCheck } from './user-role.service.js';
import { revokeAllRefreshTokensForUser } from '../utils/refresh-token-lock.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import logger from '../utils/logger.js';

/** 無効化・再有効化の業務上の失敗 */
export type AccountStatusError =
  | { type: 'SELF_DEACTIVATION_FORBIDDEN' }
  | { type: 'LAST_ACTIVE_ADMIN_PROTECTED' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'ALREADY_IN_STATE' };

export interface AccountStatusServiceDeps {
  prisma: PrismaClient;
  /** コミットの後に対象者の状態のキャッシュを無効化する（タスク47.5） */
  userStateService: Pick<AuthenticatedUserStateService, 'invalidate'>;
  /** コミットの後に全システム管理者へ通知する（タスク49.1） */
  adminNotificationService: Pick<IAdminNotificationService, 'notifyAllAdmins'>;
}

/** システム管理者のロール名 */
const SYSTEM_ADMIN_ROLE_NAME = 'admin';

/** 取引の中で確定した対象者（コミットの後の通知に使う） */
interface ChangedUser {
  email: string;
  displayName: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
}

type Operation = 'deactivate' | 'reactivate';

const OPERATION_LABEL: Record<Operation, string> = {
  deactivate: '無効化',
  reactivate: '再有効化',
};

/**
 * 利用者の無効化と再有効化
 */
export class AccountStatusService {
  private readonly prisma: PrismaClient;
  private readonly userStateService: AccountStatusServiceDeps['userStateService'];
  private readonly adminNotificationService: AccountStatusServiceDeps['adminNotificationService'];

  constructor(deps: AccountStatusServiceDeps) {
    this.prisma = deps.prisma;
    this.userStateService = deps.userStateService;
    this.adminNotificationService = deps.adminNotificationService;
  }

  /**
   * 管理者による無効化
   *
   * admin ロールの行のロックで最後の有効なシステム管理者の判定を直列化し、状態の記録・全リフレッシュ
   * トークンの失効・監査 `USER_DEACTIVATED` を一つのトランザクションで行う。
   * @requirement user-authentication/REQ-36.1
   * @requirement user-authentication/REQ-36.4
   * @requirement user-authentication/REQ-36.5
   */
  async deactivate(
    actorId: string,
    targetUserId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<Result<void, AccountStatusError>> {
    // 自分自身の無効化は拒否する（要件36.5）
    if (actorId === targetUserId) {
      return Err({ type: 'SELF_DEACTIVATION_FORBIDDEN' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 並行する無効化・admin ロールの削除・利用者の削除と判定を直列化する
      const adminRole = await tx.role.findUnique({
        where: { name: SYSTEM_ADMIN_ROLE_NAME },
        select: { id: true },
      });
      if (adminRole) {
        await lockAdminRoleForLastAdminCheck(tx, adminRole.id);
      }

      const target = await findTarget(tx, targetUserId);
      if (!target) {
        return Err({ type: 'USER_NOT_FOUND' as const });
      }
      if (!target.isActive) {
        return Err({ type: 'ALREADY_IN_STATE' as const });
      }

      // 最後の有効なシステム管理者は無効化しない（要件36.5）
      if (adminRole && target.userRoles.some((ur) => ur.roleId === adminRole.id)) {
        const otherActiveAdmins = await tx.user.count({
          where: {
            id: { not: targetUserId },
            isActive: true,
            userRoles: { some: { roleId: adminRole.id } },
          },
        });
        if (otherActiveAdmins === 0) {
          return Err({ type: 'LAST_ACTIVE_ADMIN_PROTECTED' as const });
        }
      }

      // 条件付きの更新で、並行する変更に先を越された場合は何も書かない
      const updated = await tx.user.updateMany({
        where: { id: targetUserId, isActive: true },
        data: { isActive: false, deactivatedAt: new Date(), deactivationReason: reason },
      });
      if (updated.count === 0) {
        return Err({ type: 'ALREADY_IN_STATE' as const });
      }

      // ローテーションと直列化して全リフレッシュトークンを失効させる（要件36.1）
      const revokedRefreshTokens = await revokeAllRefreshTokensForUser(tx, targetUserId);

      const actor = await snapshotAuditActor(tx, actorId);
      await tx.auditLog.create({
        data: {
          action: 'USER_DEACTIVATED',
          actorId,
          ...actor,
          targetType: 'User',
          targetId: targetUserId,
          before: { isActive: true },
          after: { isActive: false },
          metadata: {
            reason,
            targetEmail: target.email,
            revokedRefreshTokens,
            ...contextMetadata(ctx),
          },
        },
      });
      return Ok<ChangedUser>({ email: target.email, displayName: target.displayName, ...actor });
    }, connectBudgetTransactionOptions());

    return this.afterCommit('deactivate', actorId, targetUserId, reason, result);
  }

  /**
   * 管理者による再有効化
   *
   * 状態の記録と監査 `USER_REACTIVATED` を一つのトランザクションで行う。
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.4
   */
  async reactivate(
    actorId: string,
    targetUserId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<Result<void, AccountStatusError>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const target = await findTarget(tx, targetUserId);
      if (!target) {
        return Err({ type: 'USER_NOT_FOUND' as const });
      }
      if (target.isActive) {
        return Err({ type: 'ALREADY_IN_STATE' as const });
      }

      const updated = await tx.user.updateMany({
        where: { id: targetUserId, isActive: false },
        data: { isActive: true, deactivatedAt: null, deactivationReason: null },
      });
      if (updated.count === 0) {
        return Err({ type: 'ALREADY_IN_STATE' as const });
      }

      const actor = await snapshotAuditActor(tx, actorId);
      await tx.auditLog.create({
        data: {
          action: 'USER_REACTIVATED',
          actorId,
          ...actor,
          targetType: 'User',
          targetId: targetUserId,
          before: { isActive: false },
          after: { isActive: true },
          metadata: { reason, targetEmail: target.email, ...contextMetadata(ctx) },
        },
      });
      return Ok<ChangedUser>({ email: target.email, displayName: target.displayName, ...actor });
    }, connectBudgetTransactionOptions());

    return this.afterCommit('reactivate', actorId, targetUserId, reason, result);
  }

  /**
   * コミットの後の処理: 状態のキャッシュの無効化と全システム管理者への通知
   *
   * 変更はコミット済みのため、ここでの失敗は結果を変えず警告ログに留める。無効化を先に行う
   * （通知の遅延に左右されずに次の要求から状態を反映する）。
   */
  private async afterCommit(
    operation: Operation,
    actorId: string,
    targetUserId: string,
    reason: string,
    result: Result<ChangedUser, AccountStatusError>
  ): Promise<Result<void, AccountStatusError>> {
    if (!result.ok) {
      return result;
    }

    try {
      await this.userStateService.invalidate(targetUserId);
    } catch (error) {
      logger.warn(
        { err: error, userId: targetUserId, operation },
        'Failed to invalidate user state after account status change'
      );
    }

    const target = result.value;
    const label = OPERATION_LABEL[operation];
    try {
      await this.adminNotificationService.notifyAllAdmins({
        kind: operation === 'deactivate' ? 'USER_DEACTIVATED' : 'USER_REACTIVATED',
        subject: `【重要】利用者の${label}: ${target.displayName}`,
        lines: [
          `操作: 利用者の${label}`,
          `対象: ${target.displayName} (${target.email})`,
          `実行者: ${target.actorDisplayName ?? '不明'} (${target.actorEmail ?? actorId})`,
          `理由: ${reason}`,
        ],
      });
    } catch (error) {
      logger.warn(
        { err: error, userId: targetUserId, operation },
        'Failed to notify admins of account status change'
      );
    }

    logger.info({ actorId, targetUserId, operation }, 'Account status changed by admin');
    return Ok(undefined);
  }
}

/** 対象者の状態とロール */
async function findTarget(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      displayName: true,
      isActive: true,
      userRoles: { select: { roleId: true } },
    },
  });
}

/** 監査の metadata に載せる送信元の情報 */
function contextMetadata(ctx: RequestContext): Record<string, string> {
  return {
    ...(ctx.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
    ...(ctx.userAgent !== undefined && { userAgent: ctx.userAgent }),
  };
}
