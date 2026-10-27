/**
 * @fileoverview ID 指定の要求の案件の閲覧範囲の判定部品（requireProjectScope）
 *
 * user-authentication タスク52.1（要件39）。
 * - `authenticate`・`requirePermission` の後に置き、解決関数で得た案件 ID を ProjectScopeService で判定する
 * - 解決関数が null（対象の不在）を返す、案件が不在・論理削除、または範囲外のとき、いずれも
 *   NotFoundError と同じ汎用の 404（Problem Details）をエラーハンドラーで返し、存在の有無を推測させない
 * - 案件が実在し範囲外のときだけ、監査 PROJECT_SCOPE_DENIED（利用者・対象・要求の識別）を記録する。
 *   記録の失敗は応答を変えない
 * - 範囲外のアクセスは SecurityAnomalyMonitor へ観測を送る（タスク55.4。応答は計数を待たない）
 * - 記録と観測の部品（`recordProjectScopeDenied`）は services/project-scope-denial.service.ts に置き、
 *   業務機能のサービスの中の判定と共有する（quantity-table-generation タスク104.1）
 * - 子リソースから案件 ID を引く解決関数は各業務機能が持つ。案件の API への適用はタスク52.3 で行う
 */

import type { Request, RequestHandler } from 'express';
import { NotFoundError, UnauthorizedError } from '../errors/apiError.js';
import {
  getSharedProjectScopeService,
  type ProjectScopeService,
} from '../services/project-scope.service.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { getClientIp } from './client-ip.js';
// 記録の部品は下流のサービスの中の判定と共有するため services 側に置く（quantity-table-generation タスク104.1）
import {
  recordProjectScopeDenied,
  type ProjectScopeDenialContext,
} from '../services/project-scope-denial.service.js';

/** 要求から案件 ID を得る。null は対象の不在 */
export type ProjectIdResolver = (req: Request) => Promise<string | null>;

/** 案件 ID を経路のパラメータから読む既定の解決関数 */
export const projectIdFromParam =
  (paramName: string): ProjectIdResolver =>
  async (req) => {
    const value = req.params[paramName];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

export interface ProjectScopeGuardOptions {
  /** 判定のサービス（省略時は共有のインスタンス） */
  scopeService?: Pick<ProjectScopeService, 'evaluateProjectAccess'>;
  /** 監査ログのサービス（省略時は共有の PrismaClient で組み立てる） */
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
}

/** 範囲外と不在で共通の 404。本文に案件や ID を含めない */
function notVisibleError(): NotFoundError {
  return new NotFoundError();
}

/** 要求の識別子（pino-http が付ける req.id） */
function requestIdOf(req: Request): string | null {
  const id = (req as Request & { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/**
 * ID 指定の要求の閲覧範囲の判定部品を作る
 *
 * @param resolveProjectId - 要求から案件 ID を得る関数
 * @param options - 判定と監査のサービス（単体の検証で差し替える）
 */
export function requireProjectScope(
  resolveProjectId: ProjectIdResolver,
  options: ProjectScopeGuardOptions = {}
): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }
      const { userId } = req.user;

      const projectId = await resolveProjectId(req);
      if (projectId === null) {
        next(notVisibleError());
        return;
      }

      // 判定は要求のたびに案件を読む（結果をキャッシュしない）
      const scopeService = options.scopeService ?? getSharedProjectScopeService();
      const decision = await scopeService.evaluateProjectAccess(userId, projectId);

      if (decision === 'allowed') {
        next();
        return;
      }

      if (decision === 'out_of_scope') {
        await recordScopeDenied(req, userId, projectId, options.auditLogService);
      }
      next(notVisibleError());
    } catch (error) {
      // DB 接続のタイムアウトなどはエラーハンドラーへ渡す（404 にしない）
      next(error);
    }
  };
}

/** 要求から範囲外のアクセスの記録に添える識別を切り出す */
export function projectScopeDenialContextOf(req: Request): ProjectScopeDenialContext {
  return {
    requestId: requestIdOf(req),
    method: req.method,
    // 経路は問い合わせの文字列を含めない（トークンなどを記録に残さない）
    path: `${req.baseUrl}${req.path}`,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent') || 'unknown',
  };
}

/** 範囲外のアクセスを監査に記録する。記録の失敗は拒否の応答を変えない */
async function recordScopeDenied(
  req: Request,
  userId: string,
  projectId: string,
  auditLogService: Pick<IAuditLogService, 'createLog'> | undefined
): Promise<void> {
  await recordProjectScopeDenied(
    projectScopeDenialContextOf(req),
    userId,
    projectId,
    auditLogService
  );
}
