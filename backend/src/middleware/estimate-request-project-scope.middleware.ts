/**
 * @fileoverview 見積依頼・受領見積書・内訳書の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * estimate-request タスク103.1（Requirement 42.1〜42.7、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の子リソース（見積依頼・受領見積書と、見積依頼の作成の要求が指す内訳書）から
 *   案件 ID を引く解決関数だけを持つ。受領見積書は親の見積依頼の案件で判定する
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）
 * - 対象の不在・案件の不在や論理削除・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を
 *   含めない（42.2・42.3）。範囲外だけが PROJECT_SCOPE_DENIED として記録される（`requireProjectScope` が記録する）
 * - 見積依頼・受領見積書・内訳書の論理削除は区別せずに案件 ID を引く。範囲内の利用者には各経路の従来の応答
 *   （論理削除の 404 など）が返る
 * - 二重マウント（`/api/projects/:projectId/estimate-requests/:id`）で経路の案件 ID と見積依頼の案件が
 *   食い違うときは、見積依頼の不在と同じ 404 にする（経路の案件 ID でなく対象が属する案件で判定する）
 * - 項目の選択の保存（42.5）は、対象の見積依頼の案件を判定して範囲外なら要求全体を 404 にする。項目は
 *   見積依頼の ID で絞って更新するため、範囲内の見積依頼の要求で他の見積依頼の項目は変わらない
 */

import type { Request, RequestHandler } from 'express';
import getPrismaClient from '../db.js';
import {
  requireProjectScope,
  projectIdFromParam,
  type ProjectIdResolver,
  type ProjectScopeGuardOptions,
} from './project-scope.middleware.js';

/** 文字列の値だけを取り出す（空は null） */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 検査済みの本文（無ければ生の本文）を読む */
function bodyOf(req: Request): Record<string, unknown> {
  const body = (req.validatedBody ?? req.body) as unknown;
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

/** 見積依頼の ID から案件 ID を引く。見積依頼が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfEstimateRequest(
  estimateRequestId: string
): Promise<string | null> {
  const estimateRequest = await getPrismaClient().estimateRequest.findUnique({
    where: { id: estimateRequestId },
    select: { projectId: true },
  });
  return estimateRequest?.projectId ?? null;
}

/** 受領見積書の ID から、親の見積依頼の案件 ID を引く。受領見積書が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfReceivedQuotation(
  quotationId: string
): Promise<string | null> {
  const quotation = await getPrismaClient().receivedQuotation.findUnique({
    where: { id: quotationId },
    select: { estimateRequest: { select: { projectId: true } } },
  });
  return quotation?.estimateRequest.projectId ?? null;
}

/** 内訳書の ID から案件 ID を引く。内訳書が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfItemizedStatement(
  itemizedStatementId: string
): Promise<string | null> {
  const statement = await getPrismaClient().itemizedStatement.findUnique({
    where: { id: itemizedStatementId },
    select: { projectId: true },
  });
  return statement?.projectId ?? null;
}

/** 案件の ID を経路のパラメータから読んで範囲を判定する（見積依頼の作成・一覧・直近の見積依頼） */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/**
 * 見積依頼の ID を経路のパラメータから読んで範囲を判定する。
 * 経路に案件 ID（`projectId`）があり、見積依頼の案件と食い違うときは見積依頼の不在と同じ 404 にする
 */
export function requireEstimateRequestProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const projectId = await findProjectIdOfEstimateRequest(id);
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (projectId !== null && addressedProjectId !== null && addressedProjectId !== projectId) {
      return null;
    }
    return projectId;
  };
  return requireProjectScope(resolver, options);
}

/** 受領見積書の ID を経路のパラメータから読んで、親の見積依頼の案件の範囲を判定する */
export function requireReceivedQuotationProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    return id === null ? null : findProjectIdOfReceivedQuotation(id);
  }, options);
}

/**
 * 見積依頼の作成の要求が指す内訳書の案件の範囲を判定する（42.4）。本文の検査の後に置く。
 * 内訳書を指さない要求（内訳書なしの作成）は判定せずに通す。内訳書の不在と範囲外は同じ汎用の 404
 */
export function requireBodyItemizedStatementProjectScope(
  fieldName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const guard = requireProjectScope(async (req) => {
    const id = nonEmptyString(bodyOf(req)[fieldName]);
    return id === null ? null : findProjectIdOfItemizedStatement(id);
  }, options);
  return (req, res, next) => {
    if (nonEmptyString(bodyOf(req)[fieldName]) === null) {
      next();
      return;
    }
    return guard(req, res, next);
  };
}
