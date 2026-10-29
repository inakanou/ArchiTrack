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
 * - 経路の案件と対象の実際の案件の食い違い（要件39.8、タスク63.1）は、解決関数が `projectMismatch` で返す。
 *   実際の案件を判定し、範囲外のときだけ 39.7 と同じ形で記録し、判定の結果に関わらず不在と同じ 404 を返す。
 *   解決関数を通らない下流の独自の判定は `recordProjectMismatchIfOutOfScope` で同じ判定と記録を行う
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

/** 経路の案件（または親）と対象が実際に属する案件の食い違い（要件39.8）。応答は不在と同じ 404 */
export interface ProjectMismatch {
  readonly kind: 'project_mismatch';
  /** 対象のデータが実際に属する案件 */
  readonly ownerProjectId: string;
}

/** 案件 ID、対象の不在（null）、または食い違い */
export type ProjectIdResolution = string | null | ProjectMismatch;

/** 要求から案件 ID を得る。null は対象の不在、ProjectMismatch は経路と対象の案件の食い違い */
export type ProjectIdResolver = (req: Request) => Promise<ProjectIdResolution>;

/** 解決関数が食い違いを返すための作り手（要件39.8） */
export function projectMismatch(ownerProjectId: string): ProjectMismatch {
  return { kind: 'project_mismatch', ownerProjectId };
}

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

      const resolution = await resolveProjectId(req);
      if (resolution === null) {
        next(notVisibleError());
        return;
      }
      if (typeof resolution !== 'string') {
        // 食い違い（要件39.8）: 実際の案件が範囲外なら記録し、結果に関わらず不在と同じ 404
        await recordMismatchIfOutOfScope(req, userId, resolution.ownerProjectId, options);
        next(notVisibleError());
        return;
      }
      const projectId = resolution;

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

/**
 * 経路の案件と対象の実際の案件の食い違い（要件39.8）の判定と記録の実体。
 * 実際の案件を判定し、範囲外のときだけ 39.7 と同じ形で記録する（範囲内・不在・論理削除では記録しない）。
 * 経路で指定した案件は判定しない。判定の失敗は例外のまま呼び出し側へ返す（404 にしない）
 */
async function recordMismatchIfOutOfScope(
  req: Request,
  userId: string,
  ownerProjectId: string,
  options: ProjectScopeGuardOptions
): Promise<void> {
  const scopeService = options.scopeService ?? getSharedProjectScopeService();
  const decision = await scopeService.evaluateProjectAccess(userId, ownerProjectId);
  if (decision === 'out_of_scope') {
    await recordScopeDenied(req, userId, ownerProjectId, options.auditLogService);
  }
}

/**
 * 解決関数を通らない下流の独自の判定（例: execution-budget-management の requireChildInProject）が、
 * 経路の案件と対象の実際の案件の食い違いを見つけたときに呼ぶ（要件39.8）。
 * 実際の案件を判定し、範囲外のときだけ 39.7 と同じ形で記録する。応答（汎用の 404）は呼び出し側が返す。
 * 判定の失敗は例外として投げる（呼び出し側がエラーハンドラーへ渡す）。記録の失敗は投げない
 *
 * @param req - 認証済みの要求（req.user が無いときは UnauthorizedError を投げる）
 * @param ownerProjectId - 対象のデータが実際に属する案件の ID
 * @param options - 判定と監査のサービス（単体の検証で差し替える）
 */
export async function recordProjectMismatchIfOutOfScope(
  req: Request,
  ownerProjectId: string,
  options: ProjectScopeGuardOptions = {}
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  await recordMismatchIfOutOfScope(req, req.user.userId, ownerProjectId, options);
}
