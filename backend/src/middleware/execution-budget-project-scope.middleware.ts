/**
 * @fileoverview 実行予算・発注・出来高・原価・月次締め・出力の API の案件の閲覧範囲の判定と、
 * 子リソースの所属の照合の部品
 *
 * execution-budget-management タスク17.1（Requirement 20.1〜20.6、user-authentication の要件39）。
 * - 本機能の経路はすべて `/api/projects/:projectId/execution-budget` の配下に載る。範囲の判定そのものは
 *   user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、経路の `projectId` で判定する
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 範囲の判定 → 子リソースの所属の照合 →
 *   本文の検査 → 一括の対象の所属の照合 → 本体の順に置く（権限なしの 403 を範囲外の 404 より先に返す。
 *   user-authentication の tasks.md の Implementation Notes の 52.2 の区分 D）
 * - 案件の不在・論理削除・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を含めない（20.2・20.3）。
 *   範囲外だけが PROJECT_SCOPE_DENIED として記録される（`requireProjectScope` が記録する）
 * - 経路の実行予算項目・発注・出来高記録が経路の案件の実行予算に属さないとき（不在を含む）は、同じ汎用の 404 に
 *   する（20.4）。子が実在し他の案件に属する（食い違い）ときは、応答の前に上流の
 *   `recordProjectMismatchIfOutOfScope` で子の実際の案件を判定し、範囲外のときだけ PROJECT_SCOPE_DENIED を
 *   記録する（範囲内の他の案件・案件の不在や論理削除では記録しない。タスク18.1、20.9、user-authentication の
 *   要件39.8）。子の不在は従来どおり記録しない。子の論理削除は区別しない（範囲外なら記録し、範囲内の利用者には
 *   各経路の従来の応答〔論理削除の 404 など〕が返る）
 * - 複数の実行予算項目を一度に指定する要求（発注のチェック済み項目の更新の `itemIds`、出来高の保存の
 *   `items[].itemId`）は、1 件でも経路の案件の実行予算に属さなければ要求全体を同じ汎用の 404 にして
 *   何も書き込まない（20.5）。属さない項目が実際に属する案件を重複なく引き、範囲外の案件ごとに 1 回記録する
 *   （20.9。存在しない項目は記録しない）
 * - 契約（実行予算の作成・変更契約の項目差分・変更契約の反映）の所属の照合は、契約の不在と同じ応答
 *   （各経路の契約の不在の符号）にするため、契約を読むサービスの中で行う（ExecutionBudgetService）
 */

import type { Request, RequestHandler } from 'express';
import getPrismaClient from '../db.js';
import { NotFoundError } from '../errors/apiError.js';
import {
  requireProjectScope,
  projectIdFromParam,
  recordProjectMismatchIfOutOfScope,
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

/** 実行予算項目の ID から、親の実行予算の案件 ID を引く。項目が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfExecutionBudgetItem(itemId: string): Promise<string | null> {
  const item = await getPrismaClient().executionBudgetItem.findUnique({
    where: { id: itemId },
    select: { executionBudget: { select: { projectId: true } } },
  });
  return item?.executionBudget.projectId ?? null;
}

/** 発注の ID から、所属する実行予算の案件 ID を引く。発注が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfOrder(orderId: string): Promise<string | null> {
  const order = await getPrismaClient().order.findUnique({
    where: { id: orderId },
    select: { executionBudget: { select: { projectId: true } } },
  });
  return order?.executionBudget.projectId ?? null;
}

/** 出来高記録の ID から、所属する実行予算の案件 ID を引く。出来高記録が無ければ null */
export async function findProjectIdOfProgressRecord(
  progressRecordId: string
): Promise<string | null> {
  const record = await getPrismaClient().progressRecord.findUnique({
    where: { id: progressRecordId },
    select: { executionBudget: { select: { projectId: true } } },
  });
  return record?.executionBudget.projectId ?? null;
}

/**
 * 経路の `projectId` で案件の閲覧範囲を判定する（20.1〜20.3・20.6）。
 * 範囲外・不在・論理削除は汎用の 404。範囲外だけが PROJECT_SCOPE_DENIED として記録される
 */
export function requireExecutionBudgetProjectScope(
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam('projectId'), options);
}

/** 子リソースの ID から案件 ID を引く関数 */
type ChildProjectIdFinder = (id: string) => Promise<string | null>;

/**
 * 経路の子リソースが経路の `projectId` の案件に属することを確かめる部品を作る（20.4）。
 * 子が無い、または他の案件に属するときは、どちらも同じ汎用の 404 にする。
 * 他の案件に属するときは、子の実際の案件が範囲外なら応答の前に記録する（20.9）
 */
function requireChildInProject(
  paramName: string,
  find: ChildProjectIdFinder,
  options: ProjectScopeGuardOptions
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const childId = nonEmptyString(req.params[paramName]);
      const addressedProjectId = nonEmptyString(req.params.projectId);
      if (childId === null || addressedProjectId === null) {
        next(new NotFoundError());
        return;
      }
      const ownerProjectId = await find(childId);
      if (ownerProjectId === null) {
        next(new NotFoundError());
        return;
      }
      if (ownerProjectId !== addressedProjectId) {
        // 食い違い（要件39.8）: 子の実際の案件を判定し、範囲外のときだけ上流が記録する（20.9）
        await recordProjectMismatchIfOutOfScope(req, ownerProjectId, options);
        next(new NotFoundError());
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** 経路の実行予算項目（`itemId`）が経路の案件の実行予算に属することを確かめる（20.4） */
export function requireExecutionBudgetItemInProject(
  paramName = 'itemId',
  options: ProjectScopeGuardOptions = {}
): RequestHandler {
  return requireChildInProject(paramName, findProjectIdOfExecutionBudgetItem, options);
}

/** 経路の発注（`orderId`）が経路の案件の実行予算に属することを確かめる（20.4） */
export function requireOrderInProject(
  paramName = 'orderId',
  options: ProjectScopeGuardOptions = {}
): RequestHandler {
  return requireChildInProject(paramName, findProjectIdOfOrder, options);
}

/** 経路の出来高記録（`progressRecordId`）が経路の案件の実行予算に属することを確かめる（20.4） */
export function requireProgressRecordInProject(
  paramName = 'progressRecordId',
  options: ProjectScopeGuardOptions = {}
): RequestHandler {
  return requireChildInProject(paramName, findProjectIdOfProgressRecord, options);
}

/** 本文から一括の対象の実行予算項目の ID を取り出す関数 */
type BodyItemIdsExtractor = (body: Record<string, unknown>) => string[];

/** 発注のチェック済み項目の更新の本文（`itemIds`）から実行予算項目の ID を取り出す */
export const orderItemIdsOf: BodyItemIdsExtractor = (body) =>
  Array.isArray(body.itemIds)
    ? body.itemIds.filter((id): id is string => typeof id === 'string')
    : [];

/** 出来高の保存の本文（`items[].itemId`）から実行予算項目の ID を取り出す */
export const progressItemIdsOf: BodyItemIdsExtractor = (body) =>
  Array.isArray(body.items)
    ? body.items
        .map((item: unknown) =>
          item !== null && typeof item === 'object'
            ? (item as Record<string, unknown>).itemId
            : undefined
        )
        .filter((id): id is string => typeof id === 'string')
    : [];

/**
 * 一括の要求の全件の実行予算項目が経路の案件の実行予算に属することを確かめる部品を作る（20.5）。
 * 本文の検査の後に置く。1 件でも属さない（不在、または他の案件の実行予算の項目）なら要求全体を汎用の 404 にし、
 * 本体へ進めない（どの発注項目・出来高記録にも書き込まない）。対象が 0 件なら判定せずに通す。
 * 属さない項目が実際に属する案件のうち範囲外のものを、案件ごとに 1 回だけ応答の前に記録する（20.9）
 */
export function requireBodyExecutionBudgetItemsInProject(
  extract: BodyItemIdsExtractor,
  options: ProjectScopeGuardOptions = {}
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const addressedProjectId = nonEmptyString(req.params.projectId);
      if (addressedProjectId === null) {
        next(new NotFoundError());
        return;
      }
      const itemIds = [...new Set(extract(bodyOf(req)))];
      if (itemIds.length === 0) {
        next();
        return;
      }
      const owned = await getPrismaClient().executionBudgetItem.count({
        where: { id: { in: itemIds }, executionBudget: { projectId: addressedProjectId } },
      });
      if (owned !== itemIds.length) {
        // 食い違い（要件39.8）: 属さない項目の実際の案件を重複なく引き、案件ごとに一度ずつ判定と記録を
        // 上流に任せる（20.9）。存在しない項目は案件を持たないため引かれず、記録しない
        const foreign = await getPrismaClient().executionBudgetItem.findMany({
          where: {
            id: { in: itemIds },
            executionBudget: { projectId: { not: addressedProjectId } },
          },
          select: { executionBudget: { select: { projectId: true } } },
        });
        const ownerProjectIds = [...new Set(foreign.map((item) => item.executionBudget.projectId))];
        for (const ownerProjectId of ownerProjectIds) {
          await recordProjectMismatchIfOutOfScope(req, ownerProjectId, options);
        }
        next(new NotFoundError());
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
