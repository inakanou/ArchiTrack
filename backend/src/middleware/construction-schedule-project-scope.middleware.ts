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
 * - 工程表の行が無いときだけ解決関数が null を返し、判定せず記録しない。論理的に取り除かれた工程表は、
 *   経路の形を問わず工程表の実際の案件を上流の `projectMismatch` で返し、その案件が範囲外のときだけ記録され、
 *   範囲の内外を問わず本体へ進めず汎用の 404 になる（タスク25.1、13.8・13.9、user-authentication の
 *   要件39.8 の 2026-10-30 の改訂。design.md の「2026-10-30 の追加」の「決定」）
 * - 二重マウント（`/api/projects/:projectId/schedules/:id`）で経路の案件 ID と工程表の案件が
 *   食い違うときは、工程表の不在と同じ 404 にする（経路の案件 ID でなく対象が属する案件で判定する）。
 *   解決関数は上流の `projectMismatch`（工程表の実際の案件 ID）を返し、工程表の案件が範囲外のときだけ
 *   PROJECT_SCOPE_DENIED が記録される（範囲内の案件どうしの食い違いは記録しない。タスク23.1、13.8、
 *   user-authentication の要件39.8）。出力の経路も判定部品の 404 で終わり、出力の記録もファイルの生成も
 *   行わない。工程表の不在は従来どおり null で記録しない
 * - 工程表の作成の要求が指す数量表の所属の照合（13.4）は、数量表を読む `ScheduleService.create` が行う
 *   （数量表の不在と同じ 422 の応答を保つため）
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

/** 工程表が属する案件と、工程表が論理的に取り除かれているかどうか */
export interface ScheduleProjectRef {
  projectId: string;
  deleted: boolean;
}

/**
 * 工程表の ID から案件 ID を引く。工程表の行が無いときだけ null を返す。
 * 論理的に取り除かれた工程表も行が実在する限り案件 ID を返し、取り除きの印を添える
 * （user-authentication の要件39.8 の 2026-10-30 の改訂。13.8・13.9）
 */
export async function findProjectIdOfSchedule(
  scheduleId: string
): Promise<ScheduleProjectRef | null> {
  const schedule = await getPrismaClient().constructionSchedule.findUnique({
    where: { id: scheduleId },
    select: { projectId: true, deletedAt: true },
  });
  if (!schedule) {
    return null;
  }
  return { projectId: schedule.projectId, deleted: schedule.deletedAt !== null };
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
 * 経路に案件 ID（`projectId`）があり、工程表の案件と食い違うときは工程表の不在と同じ 404 にし、
 * 工程表の案件が範囲外なら記録する（13.8）。
 *
 * 論理的に取り除かれた工程表は、経路の形（`/api/schedules/:id`、同じ案件の配下の経路、食い違いの経路）を
 * 問わず `projectMismatch(工程表の案件 ID)` を返す（13.8・13.9）。素の案件 ID を返すと範囲内の利用者の
 * 要求が本体へ進み、本体の不在の応答（`SCHEDULE_NOT_FOUND`）になって存在しない工程表の汎用の 404 と
 * 本文が分かれるためである。上流の判定部品は `projectMismatch` を「実際の案件を判定し、範囲外のときだけ
 * 記録し、結果に関わらず本体へ進めず汎用の 404」と扱う。本機能ではその名の「食い違い」を、
 * 「経路から本体へ進められない対象の実際の案件」の意で使う（design.md の「2026-10-30 の追加」の「決定」）
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
    const schedule = await findProjectIdOfSchedule(id);
    if (schedule === null) {
      // 工程表の不在: 判定せず、記録しない
      return null;
    }
    if (schedule.deleted) {
      // 論理的に取り除かれた工程表: 本体へ進めず、工程表の案件が範囲外のときだけ記録する（13.8・13.9）
      return projectMismatch(schedule.projectId);
    }
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (addressedProjectId !== null && addressedProjectId !== schedule.projectId) {
      // 食い違い（要件39.8）: 工程表の実際の案件を返し、範囲外のときだけ上流の判定部品が記録する（13.8）
      return projectMismatch(schedule.projectId);
    }
    return schedule.projectId;
  };
  return requireProjectScope(resolver, options);
}
