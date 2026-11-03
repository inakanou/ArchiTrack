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
 * - 契約書の行が無いときだけ解決関数が null を返し、判定せず記録しない。論理的に取り除かれた契約書は、
 *   経路の形を問わず契約書の実際の案件を上流の `projectMismatch` で返し、その案件が範囲外のときだけ記録され、
 *   範囲の内外を問わず本体へ進めず汎用の 404 になる（タスク22.1、14.9・14.10、user-authentication の
 *   要件39.8 の 2026-10-30 の改訂。design.md の「2026-10-30 の追加」の「決定」）
 * - 二重マウント（`/api/projects/:projectId/contracts/:id`）で経路の案件 ID と契約書の案件が
 *   食い違うときは、契約書の不在と同じ 404 にする（経路の案件 ID でなく契約書が属する案件で判定する。14.4）。
 *   解決関数は上流の `projectMismatch`（契約書の実際の案件 ID）を返し、契約書の案件が範囲外のときだけ
 *   PROJECT_SCOPE_DENIED が記録される（範囲内の案件どうしの食い違いは記録しない。タスク20.2、14.9、
 *   user-authentication の要件39.8）。契約書の不在は従来どおり null で記録しない
 * - 作成・更新の要求が指す見積書と、変更契約の作成の要求が指す基となる契約書の所属の照合（14.5・14.6）は、
 *   それらを読む `ContractService` が行う（不在と同じ応答を保つため）
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

/** 契約書が属する案件と、契約書が論理的に取り除かれているかどうか */
export interface ContractProjectRef {
  projectId: string;
  deleted: boolean;
}

/**
 * 契約書の ID から案件 ID を引く。契約書の行が無いときだけ null を返す。
 * 論理的に取り除かれた契約書も行が実在する限り案件 ID を返し、取り除きの印を添える
 * （user-authentication の要件39.8 の 2026-10-30 の改訂。14.9・14.10）
 */
export async function findProjectIdOfContract(
  contractId: string
): Promise<ContractProjectRef | null> {
  const contract = await getPrismaClient().contract.findUnique({
    where: { id: contractId },
    select: { projectId: true, deletedAt: true },
  });
  if (!contract) {
    return null;
  }
  return { projectId: contract.projectId, deleted: contract.deletedAt !== null };
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
 * 経路に案件 ID（`projectId`）があり、契約書の案件と食い違うときは契約書の不在と同じ 404 にし、
 * 契約書の案件が範囲外なら記録する（14.4・14.9）。
 *
 * 論理的に取り除かれた契約書は、経路の形（`/api/contracts/:id`、同じ案件の配下の経路、食い違いの経路）を
 * 問わず `projectMismatch(契約書の案件 ID)` を返す（14.9・14.10）。素の案件 ID を返すと範囲内の利用者の
 * 要求が本体へ進み、本体の不在の応答（`CONTRACT_NOT_FOUND`）になって存在しない契約書の汎用の 404 と
 * 本文が分かれるためである。上流の判定部品は `projectMismatch` を「実際の案件を判定し、範囲外のときだけ
 * 記録し、結果に関わらず本体へ進めず汎用の 404」と扱う。本機能ではその名の「食い違い」を、
 * 「経路から本体へ進められない対象の実際の案件」の意で使う（design.md の「2026-10-30 の追加」の「決定」）
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
    const contract = await findProjectIdOfContract(id);
    if (contract === null) {
      // 契約書の不在: 判定せず、記録しない
      return null;
    }
    if (contract.deleted) {
      // 論理的に取り除かれた契約書: 本体へ進めず、契約書の案件が範囲外のときだけ記録する（14.9・14.10）
      return projectMismatch(contract.projectId);
    }
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (addressedProjectId !== null && addressedProjectId !== contract.projectId) {
      // 食い違い（要件39.8）: 契約書の実際の案件を返し、範囲外のときだけ上流の判定部品が記録する（14.9）
      return projectMismatch(contract.projectId);
    }
    return contract.projectId;
  };
  return requireProjectScope(resolver, options);
}
