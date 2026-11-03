/**
 * @fileoverview 利用者の無効化・再有効化と 90 日の自動無効化（タスク49.2、49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.1: 無効化で全リフレッシュトークンを失効させ、以後のリフレッシュと API を拒否させる
 * - REQ-36.3: 再有効化で再び利用できるようにする
 * - REQ-36.4: 無効化・再有効化を全システム管理者へ通知し、監査に実行者・対象・理由を記録する
 * - REQ-36.5: 自分自身と最後の有効なシステム管理者の無効化を拒否する
 * - REQ-36.8: 最終ログイン・作成・最後の再有効化のうち最も新しい日時から 90 日を過ぎた有効な利用者を自動で無効化する
 * - REQ-36.9: 自動無効化を全システム管理者へ通知し、監査に自動無効化であることを記録する
 * - REQ-38.13: 保有ロールの優先度の最大値が実行者の上限を超える他の利用者の無効化・再有効化を拒否する
 *
 * 責任と境界:
 * - 状態の記録・全リフレッシュトークンの失効・監査は一つのトランザクションで行う
 * - 状態のキャッシュの無効化と通知はコミットの後に行い、その失敗は結果を変えない
 * - 再有効化（管理者の操作と復旧のスクリプト）は最後の再有効化の日時を書き、最終ログイン日時は変えない
 * - 自動無効化は利用者ごとの取引で行い、対象の一覧を一通の通知にまとめる。最後の有効なシステム管理者も
 *   対象とする（復旧は reactivate-user スクリプト）
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { RequestContext } from '../types/auth.types.js';
import type { AuthenticatedUserStateService } from './authenticated-user-state.service.js';
import type { IAdminNotificationService } from './admin-notification.service.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import {
  recordManageUserRejection,
  type PrivilegeCeilingPort,
  type TargetUserExceedsActorError,
} from './privilege-ceiling.js';
import { Ok, Err, type Result } from '../types/result.js';
import { snapshotAuditActor } from './audit-log.service.js';
import { lockAdminRoleForLastAdminCheck } from './user-role.service.js';
import {
  lockUserRefreshTokens,
  revokeAllRefreshTokensForUser,
} from '../utils/refresh-token-lock.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';

/** 無効化・再有効化の業務上の失敗 */
export type AccountStatusError =
  | { type: 'SELF_DEACTIVATION_FORBIDDEN' }
  | { type: 'LAST_ACTIVE_ADMIN_PROTECTED' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'ALREADY_IN_STATE' }
  | TargetUserExceedsActorError; // 要件38.13

export interface AccountStatusServiceDeps {
  prisma: PrismaClient;
  /** コミットの後に対象者の状態のキャッシュを無効化する（タスク47.5） */
  userStateService: Pick<AuthenticatedUserStateService, 'invalidate'>;
  /** コミットの後に全システム管理者へ通知する（タスク49.1） */
  adminNotificationService: Pick<IAdminNotificationService, 'notifyAllAdmins'>;
  /**
   * 他のユーザーの管理の上限（要件38.13。タスク62.1）。実行者のある無効化・再有効化に、保有ロールの
   * 優先度の最大値が実行者の上限を超える利用者への操作を拒否する。API の経路（user-inventory.routes.ts）は必ず渡す
   */
  privilegeCeiling?: PrivilegeCeilingPort;
  /** 上限による拒否を権限チェックの失敗（PERMISSION_CHECK_FAILED）として記録する（要件38.13） */
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
}

/** システム管理者のロール名 */
const SYSTEM_ADMIN_ROLE_NAME = 'admin';

/** 自動無効化までの無活動の日数（要件36.8） */
export const INACTIVITY_DEACTIVATION_DAYS = 90;

/** 自動無効化で一度に読む対象者の件数 */
export const INACTIVE_USER_BATCH_SIZE = 100;

/** 自動無効化の理由（deactivation_reason と監査の理由） */
export const AUTO_DEACTIVATION_REASON = `${INACTIVITY_DEACTIVATION_DAYS} 日間利用が無いための自動無効化`;

/** 復旧のスクリプトによる再有効化の監査の契機（metadata.trigger） */
export const OPERATOR_SCRIPT_TRIGGER = 'operator_script';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 無活動の利用者の条件
 *
 * `is_active = true AND GREATEST(created_at, last_login_at, reactivated_at) < cutoff` と同値。
 * PostgreSQL の GREATEST は NULL を無視するため、空の最終ログイン・再有効化の日時は条件を満たすものとして扱う
 * （作成日時は空にならない）。
 *
 * @param cutoff - これより前の日時だけを持つ利用者が対象
 */
export function inactiveUserWhere(cutoff: Date): Prisma.UserWhereInput {
  return {
    isActive: true,
    createdAt: { lt: cutoff },
    AND: [
      { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
      { OR: [{ reactivatedAt: null }, { reactivatedAt: { lt: cutoff } }] },
    ],
  };
}

/** 取引の中で確定した対象者（コミットの後の通知に使う） */
interface ChangedUser {
  userId: string;
  email: string;
  displayName: string;
  /** 通知の「実行者」の行 */
  actorLabel: string;
}

/** 自動無効化した利用者（通知の一覧に使う） */
interface AutoDeactivatedUser {
  id: string;
  email: string;
  displayName: string;
  /** 最終ログイン・作成・最後の再有効化のうち最も新しい日時 */
  lastActivityAt: Date;
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
  private readonly privilegeCeiling: AccountStatusServiceDeps['privilegeCeiling'];
  private readonly auditLogService: AccountStatusServiceDeps['auditLogService'];

  constructor(deps: AccountStatusServiceDeps) {
    this.prisma = deps.prisma;
    this.userStateService = deps.userStateService;
    this.adminNotificationService = deps.adminNotificationService;
    this.privilegeCeiling = deps.privilegeCeiling;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 管理者による無効化
   *
   * admin ロールの行のロックで最後の有効なシステム管理者の判定を直列化し、状態の記録・全リフレッシュ
   * トークンの失効・監査 `USER_DEACTIVATED` を一つのトランザクションで行う。
   * 存在の確認の後、状態と最後の有効なシステム管理者の判定より前に、他のユーザーの管理の上限（要件38.13）を
   * 判定する。拒否では何も書かず、トランザクションの外で権限チェックの失敗を記録する。
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

      const target = await findTarget(tx, { id: targetUserId });
      if (!target) {
        return Err({ type: 'USER_NOT_FOUND' as const });
      }
      // 他のユーザーの管理の上限（要件38.13）。admin ロールの行のロックの後、対象の行をロックして判定する
      const ceiling = await this.checkManageUserCeiling(tx, actorId, targetUserId);
      if (!ceiling.ok) {
        return ceiling;
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
      return Ok<ChangedUser>({
        userId: targetUserId,
        email: target.email,
        displayName: target.displayName,
        actorLabel: actorLabelOf(actorId, actor),
      });
    }, connectBudgetTransactionOptions());

    await this.recordCeilingRejectionIfAny(actorId, targetUserId, 'deactivate', result);
    const done = await this.afterCommit('deactivate', reason, result);
    if (done.ok) {
      logger.info(
        { actorId, targetUserId, operation: 'deactivate' },
        'Account status changed by admin'
      );
    }
    return done.ok ? Ok(undefined) : done;
  }

  /**
   * 管理者による再有効化
   *
   * 状態の記録と監査 `USER_REACTIVATED` を一つのトランザクションで行う。存在の確認の後、状態の判定より前に
   * 他のユーザーの管理の上限（要件38.13）を判定する。
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.4
   */
  async reactivate(
    actorId: string,
    targetUserId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<Result<void, AccountStatusError>> {
    const result = await this.reactivateInTransaction(
      { id: targetUserId },
      actorId,
      reason,
      contextMetadata(ctx)
    );
    await this.recordCeilingRejectionIfAny(actorId, targetUserId, 'reactivate', result);
    const done = await this.afterCommit('reactivate', reason, result);
    if (done.ok) {
      logger.info(
        { actorId, targetUserId, operation: 'reactivate' },
        'Account status changed by admin'
      );
    }
    return done.ok ? Ok(undefined) : done;
  }

  /**
   * サーバー上の復旧のスクリプトによる再有効化（メールアドレスで対象を引く）
   *
   * 最後の有効なシステム管理者が自動無効化されたときの復旧の手段。実行者の無い監査 `USER_REACTIVATED`
   * （`metadata.trigger='operator_script'`）を記録し、コミットの後に状態のキャッシュを無効化し全システム管理者へ
   * 通知する。
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.4
   * @requirement user-authentication/REQ-36.8
   */
  async reactivateByOperatorScript(
    email: string,
    reason: string
  ): Promise<Result<{ userId: string }, AccountStatusError>> {
    const result = await this.reactivateInTransaction({ email }, null, reason, {
      trigger: OPERATOR_SCRIPT_TRIGGER,
    });
    const done = await this.afterCommit('reactivate', reason, result);
    if (!done.ok) {
      return done;
    }
    logger.info(
      {
        targetUserId: done.value.userId,
        operation: 'reactivate',
        trigger: OPERATOR_SCRIPT_TRIGGER,
      },
      'Account reactivated by the operator script'
    );
    return Ok({ userId: done.value.userId });
  }

  /**
   * 90 日の自動無効化
   *
   * 最終ログイン・作成・最後の再有効化のうち最も新しい日時が `now` の 90 日前より前の有効な利用者を、
   * 利用者ごとの取引で無効化する（状態・全リフレッシュトークンの失効・実行者の無い監査
   * `USER_AUTO_DEACTIVATED`（`metadata.trigger='inactivity'`））。取引の中の条件付きの更新で条件を
   * 再判定するため、並行するログイン・再有効化に先を越された利用者は無効化しない。コミットの後に対象者ごとに
   * 状態のキャッシュを無効化し、対象の一覧を一通の通知で全システム管理者へ送る（対象が無ければ送らない）。
   * 何度実行しても、対象が無効になった後は何もしない（冪等）。最後の有効なシステム管理者も対象とする。
   * @requirement user-authentication/REQ-36.8
   * @requirement user-authentication/REQ-36.9
   *
   * @param now - 判定の基準の時刻
   */
  async deactivateInactiveUsers(now: Date): Promise<{ deactivatedUserIds: string[] }> {
    const cutoff = new Date(now.getTime() - INACTIVITY_DEACTIVATION_DAYS * DAY_MS);
    const deactivated: AutoDeactivatedUser[] = [];

    // 続きの読み出しが失敗しても、コミット済みの対象者は再実行で対象から外れるため、通知してから投げる（36.9）
    try {
      await this.deactivateInactiveUsersInBatches(cutoff, deactivated);
    } finally {
      if (deactivated.length > 0) {
        await this.notifyAutoDeactivation(deactivated);
        logger.info(
          { count: deactivated.length, userIds: deactivated.map((u) => u.id) },
          'Inactive users auto-deactivated'
        );
      }
    }
    return { deactivatedUserIds: deactivated.map((u) => u.id) };
  }

  /**
   * 候補を件数の上限ごとに読み、一人ずつ無効化して `deactivated` へ積む
   */
  private async deactivateInactiveUsersInBatches(
    cutoff: Date,
    deactivated: AutoDeactivatedUser[]
  ): Promise<void> {
    let cursor: string | undefined;

    for (;;) {
      const candidates = await this.prisma.user.findMany({
        where: {
          ...inactiveUserWhere(cutoff),
          ...(cursor !== undefined && { id: { gt: cursor } }),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: INACTIVE_USER_BATCH_SIZE,
      });

      for (const { id } of candidates) {
        let user: AutoDeactivatedUser | null;
        try {
          user = await this.deactivateInactiveUser(id, cutoff);
        } catch (error) {
          // 一人の失敗で他の対象者を止めない。残った対象者は翌日の実行で拾う
          logger.error({ err: error, userId: id }, 'Failed to auto-deactivate an inactive user');
          captureException(error instanceof Error ? error : new Error(String(error)), {
            userId: id,
            operation: 'auto-deactivate',
          });
          continue;
        }
        if (user) {
          deactivated.push(user);
          await this.invalidateStateQuietly(id, 'auto-deactivate');
        }
      }

      const last = candidates.at(-1);
      if (candidates.length < INACTIVE_USER_BATCH_SIZE || !last) {
        break;
      }
      cursor = last.id;
    }
  }

  /**
   * 一人の自動無効化（一つの取引）。条件を満たさなくなっていれば何も書かず null を返す
   */
  private async deactivateInactiveUser(
    userId: string,
    cutoff: Date
  ): Promise<AutoDeactivatedUser | null> {
    return this.prisma.$transaction(async (tx) => {
      // 利用者単位の取引ロックを users の行を変える前に取る。管理者による無効化など（要件38.13 の判定）は
      // 取引ロック → users の行の順で取るため、順を揃えないと同じ利用者で並行したときにデッドロックになる
      await lockUserRefreshTokens(tx, userId);
      const updated = await tx.user.updateMany({
        where: { id: userId, ...inactiveUserWhere(cutoff) },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: AUTO_DEACTIVATION_REASON,
        },
      });
      if (updated.count === 0) {
        return null;
      }

      const target = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          email: true,
          displayName: true,
          createdAt: true,
          lastLoginAt: true,
          reactivatedAt: true,
        },
      });
      const lastActivityAt = latestOf(target.createdAt, target.lastLoginAt, target.reactivatedAt);

      // ローテーションと直列化して全リフレッシュトークンを失効させる（無効な利用者は有効なリフレッシュ
      // トークンを持たない）
      const revokedRefreshTokens = await revokeAllRefreshTokensForUser(tx, userId);

      await tx.auditLog.create({
        data: {
          action: 'USER_AUTO_DEACTIVATED',
          actorId: null,
          actorEmail: null,
          actorDisplayName: null,
          targetType: 'User',
          targetId: userId,
          before: { isActive: true },
          after: { isActive: false },
          metadata: {
            trigger: 'inactivity',
            reason: AUTO_DEACTIVATION_REASON,
            targetEmail: target.email,
            lastActivityAt: lastActivityAt.toISOString(),
            inactivityDays: INACTIVITY_DEACTIVATION_DAYS,
            revokedRefreshTokens,
          },
        },
      });
      return {
        id: userId,
        email: target.email,
        displayName: target.displayName,
        lastActivityAt,
      };
    }, connectBudgetTransactionOptions());
  }

  /**
   * 自動無効化の対象の一覧を一通の通知で全システム管理者へ送る（失敗は結果を変えない）
   */
  private async notifyAutoDeactivation(users: readonly AutoDeactivatedUser[]): Promise<void> {
    try {
      await this.adminNotificationService.notifyAllAdmins({
        kind: 'USERS_AUTO_DEACTIVATED',
        subject: `【重要】利用者の自動無効化: ${users.length} 名`,
        lines: [
          `操作: ${INACTIVITY_DEACTIVATION_DAYS} 日間利用の無い利用者の自動無効化`,
          `対象: ${users.length} 名`,
          ...users.map(
            (u) => `- ${u.displayName} (${u.email}) 最後の利用: ${u.lastActivityAt.toISOString()}`
          ),
          '復旧: 利用者の管理の画面から再有効化するか、全てのシステム管理者が無効になった場合はサーバー上で npm run user:reactivate -- --email <メールアドレス> を実行する',
        ],
      });
    } catch (error) {
      logger.warn(
        { err: error, count: users.length },
        'Failed to notify admins of the auto-deactivation'
      );
    }
  }

  /**
   * 再有効化の取引: 状態の記録（最後の再有効化の日時を書き、最終ログイン日時は変えない）と監査
   * `USER_REACTIVATED`
   *
   * @param where - 対象者（ID またはメールアドレス）
   * @param actorId - 実行者（復旧のスクリプトは null）
   * @param metadata - 監査の metadata に足す値
   */
  private async reactivateInTransaction(
    where: Prisma.UserWhereUniqueInput,
    actorId: string | null,
    reason: string,
    metadata: Record<string, string>
  ): Promise<Result<ChangedUser, AccountStatusError>> {
    return this.prisma.$transaction(async (tx) => {
      const target = await findTarget(tx, where);
      if (!target) {
        return Err({ type: 'USER_NOT_FOUND' as const });
      }
      // 他のユーザーの管理の上限（要件38.13）。実行者の無い復旧のスクリプトは判定しない
      if (actorId !== null) {
        const ceiling = await this.checkManageUserCeiling(tx, actorId, target.id);
        if (!ceiling.ok) {
          return ceiling;
        }
      }
      if (target.isActive) {
        return Err({ type: 'ALREADY_IN_STATE' as const });
      }

      const updated = await tx.user.updateMany({
        where: { id: target.id, isActive: false },
        data: {
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
          reactivatedAt: new Date(),
        },
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
          targetId: target.id,
          before: { isActive: false },
          after: { isActive: true },
          metadata: { reason, targetEmail: target.email, ...metadata },
        },
      });
      return Ok<ChangedUser>({
        userId: target.id,
        email: target.email,
        displayName: target.displayName,
        actorLabel: actorLabelOf(actorId, actor),
      });
    }, connectBudgetTransactionOptions());
  }

  /**
   * 他のユーザーの管理の上限の判定（要件38.13）。上限の口が無いときは判定しない
   */
  private async checkManageUserCeiling(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetUserId: string
  ): Promise<Result<void, TargetUserExceedsActorError>> {
    if (!this.privilegeCeiling) {
      return Ok(undefined);
    }
    return this.privilegeCeiling.assertCanManageUser(actorId, targetUserId, tx);
  }

  /**
   * 上限による拒否を、トランザクションの外で権限チェックの失敗として記録する（要件38.13）
   */
  private async recordCeilingRejectionIfAny(
    actorId: string,
    targetUserId: string,
    operation: Operation,
    result: Result<unknown, AccountStatusError>
  ): Promise<void> {
    if (result.ok || result.error.type !== 'TARGET_USER_EXCEEDS_ACTOR') {
      return;
    }
    await recordManageUserRejection(this.auditLogService, {
      actorId,
      targetUserId,
      operation,
      error: result.error,
    });
  }

  /**
   * コミットの後の処理: 状態のキャッシュの無効化と全システム管理者への通知
   *
   * 変更はコミット済みのため、ここでの失敗は結果を変えず警告ログに留める。無効化を先に行う
   * （通知の遅延に左右されずに次の要求から状態を反映する）。
   */
  private async afterCommit(
    operation: Operation,
    reason: string,
    result: Result<ChangedUser, AccountStatusError>
  ): Promise<Result<ChangedUser, AccountStatusError>> {
    if (!result.ok) {
      return result;
    }

    const target = result.value;
    await this.invalidateStateQuietly(target.userId, operation);

    const label = OPERATION_LABEL[operation];
    try {
      await this.adminNotificationService.notifyAllAdmins({
        kind: operation === 'deactivate' ? 'USER_DEACTIVATED' : 'USER_REACTIVATED',
        subject: `【重要】利用者の${label}: ${target.displayName}`,
        lines: [
          `操作: 利用者の${label}`,
          `対象: ${target.displayName} (${target.email})`,
          `実行者: ${target.actorLabel}`,
          `理由: ${reason}`,
        ],
      });
    } catch (error) {
      logger.warn(
        { err: error, userId: target.userId, operation },
        'Failed to notify admins of account status change'
      );
    }

    return result;
  }

  /**
   * 状態のキャッシュの無効化（変更はコミット済みのため、失敗は警告ログに留める）
   */
  private async invalidateStateQuietly(userId: string, operation: string): Promise<void> {
    try {
      await this.userStateService.invalidate(userId);
    } catch (error) {
      logger.warn(
        { err: error, userId, operation },
        'Failed to invalidate user state after account status change'
      );
    }
  }
}

/** 通知の「実行者」の行（復旧のスクリプトは実行者を持たない） */
function actorLabelOf(
  actorId: string | null,
  actor: { actorEmail: string | null; actorDisplayName: string | null }
): string {
  if (actorId === null) {
    return 'サーバー上の復旧スクリプト';
  }
  return `${actor.actorDisplayName ?? '不明'} (${actor.actorEmail ?? actorId})`;
}

/** 最も新しい日時（空の値は無視する。PostgreSQL の GREATEST と同じ） */
function latestOf(first: Date, ...rest: Array<Date | null>): Date {
  return rest.reduce<Date>(
    (latest, value) => (value !== null && value.getTime() > latest.getTime() ? value : latest),
    first
  );
}

/** 対象者の状態とロール */
async function findTarget(tx: Prisma.TransactionClient, where: Prisma.UserWhereUniqueInput) {
  return tx.user.findUnique({
    where,
    select: {
      id: true,
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
