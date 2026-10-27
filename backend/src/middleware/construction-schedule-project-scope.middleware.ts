/**
 * @fileoverview 工程表の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * construction-schedule タスク22.1（Requirement 13.1〜13.5、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の対象（工程表）から案件 ID を引く解決関数だけを持つ。工程項目は親の工程表の案件で判定する
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）
 * - 工程表の不在・論理的な取り除き、案件の不在や論理削除、範囲外はどれも汎用の 404（`NOT_FOUND`）になり、
 *   本文に案件 ID を含めない（13.2・13.3）。範囲外だけが PROJECT_SCOPE_DENIED として記録される
 *   （`requireProjectScope` が記録する）
 * - 論理的に取り除かれた工程表は解決関数が null を返す（design.md の「案件IDの解決関数」の定め）
 * - 二重マウント（`/api/projects/:projectId/schedules/:id`）で経路の案件 ID と工程表の案件が
 *   食い違うときは、工程表の不在と同じ 404 にする（経路の案件 ID でなく対象が属する案件で判定する）
 * - 工程表の作成の要求が指す数量表の所属の照合（13.4）は、数量表を読む `ScheduleService.create` が行う
 *   （数量表の不在と同じ 422 の応答を保つため）
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

/** 工程表の ID から案件 ID を引く。工程表が無いか論理的に取り除かれていれば null */
export async function findProjectIdOfSchedule(scheduleId: string): Promise<string | null> {
  const schedule = await getPrismaClient().constructionSchedule.findUnique({
    where: { id: scheduleId },
    select: { projectId: true, deletedAt: true },
  });
  if (!schedule || schedule.deletedAt) {
    return null;
  }
  return schedule.projectId;
}

/**
 * 案件の ID を経路のパラメータから読んで範囲を判定する
 * （工程表の一覧・作成）
 */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/**
 * 工程表の ID を経路のパラメータから読んで範囲を判定する（詳細・更新・一括保存・論理的な取り除き・出力）。
 * 経路に案件 ID（`projectId`）があり、工程表の案件と食い違うときは工程表の不在と同じ 404 にする
 */
export function requireScheduleProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const projectId = await findProjectIdOfSchedule(id);
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (projectId !== null && addressedProjectId !== null && addressedProjectId !== projectId) {
      return null;
    }
    return projectId;
  };
  return requireProjectScope(resolver, options);
}
