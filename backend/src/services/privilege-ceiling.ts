/**
 * @fileoverview 権限付与の上限（PrivilegeCeilingPolicy）
 *
 * 権限を管理できる利用者でも、自分を超える権限を作り出せないようにする（user-authentication タスク51.1）。
 * - 実行者の上限は保有ロールの priority の最大値。割り当てるロールの priority がそれを超えると拒否する
 * - 全権限（`*:*`）の追加と `admin` ロールの割り当ては、実行者が `admin` ロールを持つときだけ許す
 * - システムロール（isSystem）の名前の変更を拒否する
 *
 * 判定は割り当て・権限の追加の共通処理（1件・一括の両方）から、そのトランザクションのクライアントで呼ぶ。
 * 拒否は権限チェックの失敗（PERMISSION_CHECK_FAILED）として、ロールバックされるトランザクションの外で記録する。
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';

/** 上限による拒否の種別（応答の code にそのまま載せる） */
export type CeilingError =
  | { type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }
  | { type: 'SYSTEM_ADMIN_REQUIRED' }
  | { type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' };

export type CeilingErrorType = CeilingError['type'];

const CEILING_ERROR_TYPES: ReadonlySet<string> = new Set<CeilingErrorType>([
  'ROLE_PRIORITY_EXCEEDS_ACTOR',
  'SYSTEM_ADMIN_REQUIRED',
  'SYSTEM_ROLE_RENAME_FORBIDDEN',
]);

/** 業務上のエラーが上限による拒否か */
export function isCeilingError(error: { type: string }): error is CeilingError {
  return CEILING_ERROR_TYPES.has(error.type);
}

/** システム管理者ロールの名前 */
const ADMIN_ROLE_NAME = 'admin';

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
    const ceiling = Math.max(-Infinity, ...held.map((r) => r.priority));
    if (role.priority > ceiling) {
      return Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' });
    }
    return Ok(undefined);
  }

  /**
   * 権限の追加の上限（38.2）。全権限（`*:*`）は admin ロールを持つ実行者だけが追加できる
   */
  async assertCanGrantPermission(
    actorId: string,
    permission: { resource: string; action: string },
    db: DbClient = this.prisma
  ): Promise<Result<void, CeilingError>> {
    if (permission.resource !== '*' || permission.action !== '*') {
      return Ok(undefined);
    }
    const held = await this.actorRoles(db, actorId);
    if (!held.some((r) => r.name === ADMIN_ROLE_NAME)) {
      return Err({ type: 'SYSTEM_ADMIN_REQUIRED' });
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

  private async actorRoles(
    db: DbClient,
    actorId: string
  ): Promise<Array<{ name: string; priority: number }>> {
    const rows = await db.userRole.findMany({
      where: { userId: actorId },
      select: { role: { select: { name: true, priority: true } } },
    });
    return rows.map((row) => row.role);
  }
}

/**
 * 上限による拒否を権限チェックの失敗（PERMISSION_CHECK_FAILED）として記録する
 *
 * 拒否された変更のトランザクションはロールバックされるため、その外で記録する。記録の失敗は拒否の結果を
 * 変えず、エラーログに留める（権限の確認の失敗の記録と同じ扱い）。
 */
export async function recordCeilingRejection(
  auditLogService: IAuditLogService | undefined,
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
