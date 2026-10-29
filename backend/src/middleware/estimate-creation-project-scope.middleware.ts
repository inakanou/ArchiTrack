/**
 * @fileoverview 見積書の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * estimate-creation タスク62.1（Requirement 57.1〜57.6、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の対象（見積書）から案件 ID を引く解決関数だけを持つ。見積項目・諸経費の計算・
 *   編集中の在席は、経路の見積書の案件で判定する
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）
 * - 見積書の不在・案件の不在や論理削除・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を
 *   含めない（57.2・57.3）。範囲外だけが PROJECT_SCOPE_DENIED として記録される（`requireProjectScope` が記録する）
 * - 見積書の論理削除は区別せずに案件 ID を引く。範囲内の利用者には各経路の従来の応答（論理削除の 404 など）が返る
 * - 二重マウント（`/api/projects/:projectId/estimates/:id`）で経路の案件 ID と見積書の案件が食い違うときは、
 *   見積書の不在と同じ 404 にする（経路の案件 ID でなく対象が属する案件で判定する）。
 *   解決関数は上流の `projectMismatch`（見積書の実際の案件 ID）を返し、見積書の案件が範囲外のときだけ
 *   PROJECT_SCOPE_DENIED が記録される（範囲内の案件どうしの食い違いは記録しない。タスク63.1、57.9、
 *   user-authentication の要件39.8）。見積書の不在は従来どおり null で記録しない。論理削除は区別しない
 * - 見積書の作成の要求が指す内訳書の所属の照合（57.4）は、作成のトランザクションの中で内訳書を読む
 *   `EstimateService.create` が行う（内訳書の不在と同じ応答の符号を保つため）
 */

import type { RequestHandler } from 'express';
import getPrismaClient from '../db.js';
import {
  requireProjectScope,
  projectIdFromParam,
  projectMismatch,
  type ProjectIdResolver,
  type ProjectScopeGuardOptions,
} from './project-scope.middleware.js';

/** 文字列の値だけを取り出す（空は null） */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 見積書の ID から案件 ID を引く。見積書が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfEstimate(estimateId: string): Promise<string | null> {
  const estimate = await getPrismaClient().estimate.findUnique({
    where: { id: estimateId },
    select: { projectId: true },
  });
  return estimate?.projectId ?? null;
}

/**
 * 案件の ID を経路のパラメータから読んで範囲を判定する
 * （見積書の作成・一覧・直近の見積書、プロジェクト単位の受領見積書の一覧）
 */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/**
 * 見積書の ID を経路のパラメータから読んで範囲を判定する。
 * 経路に案件 ID（`projectId`）があり、見積書の案件と食い違うときは見積書の不在と同じ 404 にし、
 * 見積書の案件が範囲外なら記録する（57.9）
 */
export function requireEstimateProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const projectId = await findProjectIdOfEstimate(id);
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (projectId !== null && addressedProjectId !== null && addressedProjectId !== projectId) {
      // 食い違い（57.9、user-authentication の要件39.8）: 見積書の実際の案件を返し、
      // 範囲外のときだけ上流の判定部品が記録する
      return projectMismatch(projectId);
    }
    return projectId;
  };
  return requireProjectScope(resolver, options);
}
