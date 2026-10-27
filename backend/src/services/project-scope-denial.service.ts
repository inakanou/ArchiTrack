/**
 * @fileoverview 範囲外のアクセスの記録（PROJECT_SCOPE_DENIED と異常の検知への観測）の部品
 *
 * user-authentication の要件39.7・43.2。ID 指定の要求の判定部品（middleware/project-scope.middleware.ts の
 * `requireProjectScope`）と、判定部品を通らない業務機能のサービスの中の判定（quantity-table-generation
 * タスク104.1 の写真の紐付けの判定。Requirement 50.5）が、同じ形で記録するために共有する。
 * - 要求の識別（{@link ProjectScopeDenialContext}）は経路が要求から切り出して渡す
 *   （切り出しは判定部品の側の `projectScopeDenialContextOf`）。本ファイルは Express の要求に依存しない
 * - 記録の失敗は拒否の応答を変えない（例外を投げない）
 */

import { AuditLogService } from './audit-log.service.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import getPrismaClient from '../db.js';
import logger from '../utils/logger.js';
import { observeSecurityAnomaly } from './security-anomaly-monitor.service.js';

/**
 * 範囲外のアクセスの記録に添える要求の識別（要件39.7）。
 * 判定部品を通らない経路（業務機能のサービスの中の判定）からも同じ形で記録するため、要求から切り出して渡す
 */
export interface ProjectScopeDenialContext {
  requestId: string | null;
  method: string;
  /** 経路（問い合わせの文字列を含めない） */
  path: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * 範囲外のアクセスを監査に記録し、異常の検知へ送る（要件39.7、43.2）。
 * 記録の失敗は拒否の応答を変えない（例外を投げない）
 */
export async function recordProjectScopeDenied(
  context: ProjectScopeDenialContext,
  userId: string,
  projectId: string,
  auditLogService?: Pick<IAuditLogService, 'createLog'>
): Promise<void> {
  const { method, path } = context;
  logger.warn({ userId, projectId, method, path }, 'Project scope denied');
  // 範囲外のアクセスを異常の検知へ送る（要件39.7、43.2。計数を待たない）
  observeSecurityAnomaly({ signal: 'scope_denied', sourceIp: context.ipAddress, userId });
  try {
    const service = auditLogService ?? new AuditLogService({ prisma: getPrismaClient() });
    await service.createLog({
      action: 'PROJECT_SCOPE_DENIED',
      actorId: userId,
      targetType: 'Project',
      targetId: projectId,
      metadata: {
        requestId: context.requestId,
        method,
        path,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId, projectId }, 'Failed to record project scope denial');
  }
}

/** 経路から要求の識別を受け取れなかったときの記録の識別（サービスを経路の外から呼ぶ場合） */
const UNKNOWN_DENIAL_CONTEXT: ProjectScopeDenialContext = {
  requestId: null,
  method: 'UNKNOWN',
  path: '',
  ipAddress: 'unknown',
  userAgent: 'unknown',
};

/**
 * サービスの中の判定（quantity-table-generation の Requirement 50.5 の写真の紐付けの判定）で範囲外とした
 * 案件を集め、処理の後に記録する。
 *
 * `run` には範囲外とした案件 ID を入れる集合を渡す。記録は `run` の終了（成功・失敗のどちらでも）の後に、
 * 案件ごとに 1 回、`requireProjectScope` と同じ形（PROJECT_SCOPE_DENIED と異常の検知への観測）で行う。
 * `run` の中のトランザクションは範囲外の 404 で巻き戻るため、記録はその外で書く。記録の失敗は応答を変えない
 */
export async function withSurveyScopeDenialRecording<T>(
  actorId: string,
  context: ProjectScopeDenialContext | undefined,
  auditLogService: Pick<IAuditLogService, 'createLog'>,
  run: (deniedProjectIds: Set<string>) => Promise<T>
): Promise<T> {
  const deniedProjectIds = new Set<string>();
  try {
    return await run(deniedProjectIds);
  } finally {
    for (const projectId of deniedProjectIds) {
      await recordProjectScopeDenied(
        context ?? UNKNOWN_DENIAL_CONTEXT,
        actorId,
        projectId,
        auditLogService
      );
    }
  }
}
