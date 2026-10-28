/**
 * @fileoverview 契約書の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * contract-management タスク19.1（Requirement 13.1・13.2・13.4、14.1〜14.4・14.7、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の対象（契約書）から案件 ID を引く解決関数だけを持つ
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）
 * - 契約書の不在・論理的な取り除き、案件の不在や論理削除、範囲外はどれも汎用の 404（`NOT_FOUND`）になり、
 *   本文に案件 ID を含めない（14.2・14.3）。範囲外だけが PROJECT_SCOPE_DENIED として記録される
 *   （`requireProjectScope` が記録する）
 * - 論理的に取り除かれた契約書は解決関数が null を返す（design.md の「案件IDの解決関数」の定め）
 * - 二重マウント（`/api/projects/:projectId/contracts/:id`）で経路の案件 ID と契約書の案件が
 *   食い違うときは、契約書の不在と同じ 404 にする（経路の案件 ID でなく契約書が属する案件で判定する。14.4）
 * - 作成・更新の要求が指す見積書と、変更契約の作成の要求が指す基となる契約書の所属の照合（14.5・14.6）は、
 *   それらを読む `ContractService` が行う（不在と同じ応答を保つため）
 */

import type { RequestHandler } from 'express';
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

/** 契約書の ID から案件 ID を引く。契約書が無いか論理的に取り除かれていれば null */
export async function findProjectIdOfContract(contractId: string): Promise<string | null> {
  const contract = await getPrismaClient().contract.findUnique({
    where: { id: contractId },
    select: { projectId: true, deletedAt: true },
  });
  if (!contract || contract.deletedAt) {
    return null;
  }
  return contract.projectId;
}

/**
 * 案件の ID を経路のパラメータから読んで範囲を判定する
 * （契約書の一覧・作成。14.2・14.7）
 */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/**
 * 契約書の ID を経路のパラメータから読んで範囲を判定する（詳細・更新・ステータスの変更・論理的な取り除き）。
 * 経路に案件 ID（`projectId`）があり、契約書の案件と食い違うときは契約書の不在と同じ 404 にする（14.4）
 */
export function requireContractProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const projectId = await findProjectIdOfContract(id);
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (projectId !== null && addressedProjectId !== null && addressedProjectId !== projectId) {
      return null;
    }
    return projectId;
  };
  return requireProjectScope(resolver, options);
}
