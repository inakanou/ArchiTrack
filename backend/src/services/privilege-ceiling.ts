/**
 * @fileoverview 権限付与の上限（PrivilegeCeilingPolicy）
 *
 * 権限を管理できる利用者でも、自分を超える権限を作り出せないようにする（user-authentication タスク51.1）。
 * - 実行者の上限は保有ロールの priority の最大値。割り当てるロールの priority がそれを超えると拒否する
 * - 全権限（`*:*`）の追加と `admin` ロールの割り当ては、実行者が `admin` ロールを持つときだけ許す
 * - システムロール（isSystem）の名前の変更を拒否する
 *
 * 2026-10-26 の要件38 の拡張（タスク58.1）:
 * - 上限を超える優先度のロールの作成と、上限を超える優先度への変更を拒否する（38.6、38.7）
 * - システム管理者でない実行者による、保有しない権限（ワイルドカードの照合で包含しない権限）の追加を拒否する（38.8）
 * - 上限を超えるロールの割り当ての、他の利用者からの解除を拒否する（38.9）
 * - 現在の優先度が上限を超えるロールの変更（優先度の変更、権限の追加・削除）と削除を拒否する（38.11）
 * - システムロールの優先度の変更を、実行者によらず拒否する（38.12）
 *
 * 2026-10-26 の要件38.13 の追加（タスク62.1）:
 * - 保有ロールの優先度の最大値が実行者の上限を超える他の利用者の削除・無効化・再有効化・2FA の再設定を拒否する
 *
 * 上限と同じ優先度は上限を超えない。システム管理者ロールの優先度（SYSTEM_ADMIN_ROLE_PRIORITY）を超える
 * 優先度の指定は入力の検証（zod の max）が 400 で拒否する（38.10。権限チェックの失敗として記録しない）
 *
 * 判定は割り当て・権限の追加の共通処理（1件・一括の両方）から、そのトランザクションのクライアントで呼ぶ。
 * 拒否は権限チェックの失敗（PERMISSION_CHECK_FAILED）として、ロールバックされるトランザクションの外で記録する。
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import { lockUserRefreshTokens } from '../utils/refresh-token-lock.js';

/** 上限による拒否の種別（応答の code にそのまま載せる） */
export type CeilingError =
  | { type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' } // 38.1、38.6、38.7、38.9、38.11
  | { type: 'SYSTEM_ADMIN_REQUIRED' } // 38.2
  | { type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' } // 38.3
  | { type: 'PERMISSION_NOT_HELD_BY_ACTOR' } // 38.8
  | { type: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN' } // 38.12
  // 38.13。targetPriority は対象の利用者の保有ロールの優先度の最大値（監査の metadata に使う）
  | { type: 'TARGET_USER_EXCEEDS_ACTOR'; targetPriority: number };

export type CeilingErrorType = CeilingError['type'];

/** 他のユーザーの管理の上限による拒否（38.13） */
export type TargetUserExceedsActorError = Extract<
  CeilingError,
  { type: 'TARGET_USER_EXCEEDS_ACTOR' }
>;

/** 上限を判定する他のユーザーの管理の操作（監査の metadata.operation） */
export type ManageUserOperation = 'delete' | 'deactivate' | 'reactivate' | 'two_factor_reset';

const CEILING_ERROR_TYPES: ReadonlySet<string> = new Set<CeilingErrorType>([
  'ROLE_PRIORITY_EXCEEDS_ACTOR',
  'SYSTEM_ADMIN_REQUIRED',
  'SYSTEM_ROLE_RENAME_FORBIDDEN',
  'PERMISSION_NOT_HELD_BY_ACTOR',
  'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN',
  'TARGET_USER_EXCEEDS_ACTOR',
]);

/** 業務上のエラーが上限による拒否か */
export function isCeilingError(error: { type: string }): error is CeilingError {
  return CEILING_ERROR_TYPES.has(error.type);
}

/** システム管理者ロールの名前 */
const ADMIN_ROLE_NAME = 'admin';

/**
 * システム管理者ロールの優先度（seed の値。38.12 によりシステムロールの優先度は変わらない）。
 * ロールの作成・変更で指定できる優先度の上限（38.10）
 */
export const SYSTEM_ADMIN_ROLE_PRIORITY = 100;

/**
 * 保有する権限が追加する権限を包含するか（要件21 の権限チェックと同じワイルドカードの照合）
 *
 * `*:*` は全て、`*:action` は任意のリソースの同じアクション、`resource:*` は同じリソースの任意の
 * アクション、それ以外は完全一致で包含する。追加する権限がワイルドカード（例: `project:*`）のときも
 * 同じ照合で判定し、`project:*` か `*:*` を保有するときだけ包含する。
 */
export function permissionCovers(
  held: { resource: string; action: string },
  requested: { resource: string; action: string }
): boolean {
  if (held.resource === '*' && held.action === '*') {
    return true;
  }
  if (held.resource === '*' && held.action === requested.action) {
    return true;
  }
  if (held.resource === requested.resource && held.action === '*') {
    return true;
  }
  return held.resource === requested.resource && held.action === requested.action;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

/** 上限の判定（サービスへ注入する口） */
export interface PrivilegeCeilingPort {
  assertCanAssignRole(
    actorId: string,
    roleId: string,
    db?: DbClient
  ): Promise<Result<void, CeilingError>>;
  assertCanGrantPermission(
    actorId: string,
    permission: { resource: string; action: string },
    db?: DbClient
  ): Promise<Result<void, CeilingError>>;
  assertCanRenameRole(roleId: string, db?: DbClient): Promise<Result<void, CeilingError>>;
  /** 作成する・変更後のロールの優先度の上限（38.6、38.7） */
  assertCanSetRolePriority(
    actorId: string,
    priority: number,
    db?: DbClient
  ): Promise<Result<void, CeilingError>>;
  /** 対象のロールの現在の優先度の上限（38.11） */
  assertCanModifyRole(
    actorId: string,
    roleId: string,
    db?: DbClient
  ): Promise<Result<void, CeilingError>>;
  /** システムロールの優先度の変更の拒否（38.12）。呼び出し側は優先度が実際に変わるときだけ呼ぶ */
  assertCanChangeRolePriority(roleId: string, db?: DbClient): Promise<Result<void, CeilingError>>;
  /** 割り当ての解除の上限（38.9） */
  assertCanRevokeRole(
    actorId: string,
    targetUserId: string,
    roleId: string,
    db?: DbClient
  ): Promise<Result<void, CeilingError>>;
  /**
   * 他のユーザーの管理の上限（38.13）。対象の利用者の行をロックしてから、対象の保有ロールの優先度の
   * 最大値を判定する（削除・無効化・再有効化・2FA の再設定の前）
   */
  assertCanManageUser(
    actorId: string,
    targetUserId: string,
    db?: DbClient
  ): Promise<Result<void, TargetUserExceedsActorError>>;
}

export class PrivilegeCeilingPolicy implements PrivilegeCeilingPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * ロールの割り当ての上限（38.1、38.2）
   *
   * 対象のロールが無いときは判定せず、不在の判定（ROLE_NOT_FOUND）を呼び出し側に委ねる。
   */
  async assertCanAssignRole(
    actorId: string,
    roleId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { name: true, priority: true },
    });
    if (!role) {
      return Ok(undefined);
    }

    const held = await this.actorRoles(db, actorId);
    if (role.name === ADMIN_ROLE_NAME && !held.some((r) => r.name === ADMIN_ROLE_NAME)) {
      return Err({ type: 'SYSTEM_ADMIN_REQUIRED' });
    }

    // ロールを持たない実行者の上限は無い（-Infinity）ため、どのロールも割り当てられない
    if (role.priority > ceilingOf(held)) {
      return Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * 権限の追加の上限（38.2、38.8）
   *
   * 全権限（`*:*`）は admin ロールを持つ実行者だけが追加できる（38.2）。それ以外の権限は、admin ロールを
   * 持たない実行者について、保有ロールの権限のいずれかがワイルドカードの照合で包含するときだけ追加できる（38.8）。
   * 保有する権限は渡されたクライアントで DB から読む（権限のキャッシュは使わない）。
   */
  async assertCanGrantPermission(
    actorId: string,
    permission: { resource: string; action: string },
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const isWildcard = permission.resource === '*' && permission.action === '*';
    const held = await this.actorRoles(db, actorId);
    if (held.some((r) => r.name === ADMIN_ROLE_NAME)) {
      return Ok(undefined);
    }
    if (isWildcard) {
      return Err({ type: 'SYSTEM_ADMIN_REQUIRED' });
    }
    const heldPermissions = await this.actorPermissions(db, actorId);
    if (!heldPermissions.some((h) => permissionCovers(h, permission))) {
      return Err({ type: 'PERMISSION_NOT_HELD_BY_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * ロールの名前の変更の上限（38.3）。システムロールの名前は変えられない
   *
   * 呼び出し側は名前が実際に変わるときだけ呼ぶ。対象のロールが無いときは不在の判定を呼び出し側に委ねる。
   */
  async assertCanRenameRole(
    roleId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { isSystem: true },
    });
    if (role?.isSystem) {
      return Err({ type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' });
    }
    return Ok(undefined);
  }

  /**
   * 作成する・変更後のロールの優先度の上限（38.6、38.7）。上限と等しい値は許す
   *
   * 呼び出し側は、作成では指定の優先度（省略時は 0）を、変更では優先度が実際に変わるときだけ新しい値を渡す。
   */
  async assertCanSetRolePriority(
    actorId: string,
    priority: number,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const held = await this.actorRoles(db, actorId);
    if (priority > ceilingOf(held)) {
      return Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * 上限より上のロールの変更・削除の拒否（38.11）。対象のロールの現在の優先度を判定する
   *
   * 優先度の変更、権限の追加・削除、ロールの削除の前に呼ぶ（名前と説明だけの変更は対象外）。
   * 対象のロールが無いときは不在の判定を呼び出し側に委ねる。
   */
  async assertCanModifyRole(
    actorId: string,
    roleId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { priority: true },
    });
    if (!role) {
      return Ok(undefined);
    }
    const held = await this.actorRoles(db, actorId);
    if (role.priority > ceilingOf(held)) {
      return Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * システムロールの優先度の変更の拒否（38.12）。実行者によらず拒否する
   *
   * 呼び出し側は優先度が実際に変わるときだけ呼ぶ。対象のロールが無いときは不在の判定を呼び出し側に委ねる。
   */
  async assertCanChangeRolePriority(
    roleId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { isSystem: true },
    });
    if (role?.isSystem) {
      return Err({ type: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN' });
    }
    return Ok(undefined);
  }

  /**
   * 割り当ての解除の上限（38.9）。上限を超えるロールを他の利用者から外せない
   *
   * 対象の利用者が実行者自身のときは判定しない（自分の保有するロールは上限を超えない）。
   * 対象のロールが無いときは不在の判定を呼び出し側に委ねる。
   */
  async assertCanRevokeRole(
    actorId: string,
    targetUserId: string,
    roleId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    if (actorId === targetUserId) {
      return Ok(undefined);
    }
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { priority: true },
    });
    if (!role) {
      return Ok(undefined);
    }
    const held = await this.actorRoles(db, actorId);
    if (role.priority > ceilingOf(held)) {
      return Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * 他のユーザーの管理の上限（38.13）。上限を超えるロールを持つ他の利用者を消す・止める・戻す、
   * またはその 2FA を再設定することを拒否する
   *
   * 対象の上限は保有ロールの priority の最大値（ロールを持たない利用者は -Infinity）で、実行者の上限より
   * 大きいときだけ拒否する（上限と等しいときは許す）。対象が実行者自身のときは判定しない（自己の操作は
   * 各操作の既存の拒否が先に止める）。対象の利用者が無いときは不在の判定を呼び出し側に委ねる。
   *
   * 判定の前に対象の users の行を FOR UPDATE でロックしてから対象の保有ロールを読む。並行するロールの
   * 割り当て（user_roles への INSERT）は外部キーの検査で同じ行の FOR KEY SHARE を取って待つため、
   * 判定から書き込みまでの間に対象へ上位のロールが割り当てられない。行のロックの前に、対象の利用者の
   * リフレッシュトークンの取引ロックを取る。ローテーションとログインは取引ロックを取ってからリフレッシュ
   * トークンを挿入し（外部キーの検査で users の行を待つ）、各操作も行のロックの後に同じ取引ロックを取る
   * （失効・削除）ため、逆の順で取るとデッドロックになる。呼び出し側は admin ロールの行のロック
   * （lockAdminRoleForLastAdminCheck）がある経路では、そのロックの後に呼ぶ。
   */
  async assertCanManageUser(
    actorId: string,
    targetUserId: string,
    db: DbClient = this.prisma
  ): Promise<Result<void, TargetUserExceedsActorError>> {
    if (actorId === targetUserId) {
      return Ok(undefined);
    }
    await lockUserRefreshTokens(db, targetUserId);
    await db.$queryRaw`SELECT id FROM users WHERE id = ${targetUserId} FOR UPDATE`;

    const targetPriority = ceilingOf(await this.actorRoles(db, targetUserId));
    const actorCeiling = ceilingOf(await this.actorRoles(db, actorId));
    if (targetPriority > actorCeiling) {
      return Err({ type: 'TARGET_USER_EXCEEDS_ACTOR', targetPriority });
    }
    return Ok(undefined);
  }

  /** 実行者の保有ロールの権限（同じクライアントで user_roles → role_permissions → permissions を読む） */
  private async actorPermissions(
    db: DbClient,
    actorId: string
  ): Promise<Array<{ resource: string; action: string }>> {
    const rows = await db.rolePermission.findMany({
      where: { role: { userRoles: { some: { userId: actorId } } } },
      select: { permission: { select: { resource: true, action: true } } },
    });
    return rows.map((row) => row.permission);
  }

  /** 利用者（実行者または管理の対象）の保有ロール */
  private async actorRoles(
    db: DbClient,
    userId: string
  ): Promise<Array<{ name: string; priority: number }>> {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true, priority: true } } },
    });
    return rows.map((row) => row.role);
  }
}

/**
 * 実行者の上限（保有ロールの priority の最大値）。ロールを持たない実行者は -Infinity
 */
function ceilingOf(held: ReadonlyArray<{ priority: number }>): number {
  return Math.max(-Infinity, ...held.map((r) => r.priority));
}

/**
 * 他のユーザーの管理の上限による拒否（38.13）を、権限チェックの失敗として記録する
 *
 * 監査の形は targetType `user`、targetId は対象の利用者の ID、metadata `{ reason, operation, targetPriority }`。
 * 拒否された操作のトランザクションの外（ロールバック・コミットの後）で呼ぶ。
 */
export async function recordManageUserRejection(
  auditLogService: Pick<IAuditLogService, 'createLog'> | undefined,
  input: {
    actorId: string;
    targetUserId: string;
    operation: ManageUserOperation;
    error: TargetUserExceedsActorError;
  }
): Promise<void> {
  await recordCeilingRejection(auditLogService, {
    actorId: input.actorId,
    targetType: 'user',
    targetId: input.targetUserId,
    error: input.error,
    detail: { operation: input.operation, targetPriority: String(input.error.targetPriority) },
  });
}

/**
 * 上限による拒否を権限チェックの失敗（PERMISSION_CHECK_FAILED）として記録する
 *
 * 拒否された変更のトランザクションはロールバックされるため、その外で記録する。記録の失敗は拒否の結果を
 * 変えず、エラーログに留める（権限の確認の失敗の記録と同じ扱い）。
 */
export async function recordCeilingRejection(
  auditLogService: Pick<IAuditLogService, 'createLog'> | undefined,
  input: {
    actorId: string;
    targetType: string;
    targetId: string;
    error: CeilingError;
    detail: Record<string, string>;
  }
): Promise<void> {
  logger.warn(
    { actorId: input.actorId, targetId: input.targetId, reason: input.error.type, ...input.detail },
    'Privilege ceiling rejected the change'
  );
  if (!auditLogService) {
    return;
  }
  try {
    await auditLogService.createLog({
      action: 'PERMISSION_CHECK_FAILED',
      actorId: input.actorId,
      targetType: input.targetType,
      targetId: input.targetId,
      before: null,
      after: null,
      metadata: { reason: input.error.type, ...input.detail },
    });
  } catch (error) {
    logger.error(
      { err: error, actorId: input.actorId, reason: input.error.type },
      'Failed to record privilege ceiling rejection'
    );
  }
}
