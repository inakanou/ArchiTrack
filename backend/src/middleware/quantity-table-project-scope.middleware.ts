/**
 * @fileoverview 数量表・数量グループ・数量項目の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * quantity-table-generation タスク104.1（Requirement 50.1〜50.7、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の子リソース（数量表・数量グループ・数量項目）から案件 ID を引く解決関数と、
 *   複数の対象を一度に扱う要求の全件の判定だけを持つ。数量グループは親の数量表の案件、数量項目は
 *   親の数量グループの数量表の案件で判定する
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）
 * - 対象の不在・案件の不在や論理削除・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を
 *   含めない（50.2・50.3）。範囲外だけが PROJECT_SCOPE_DENIED として記録される（`requireProjectScope` が記録する）
 * - 数量表の論理削除は区別せずに案件 ID を引く。範囲内の利用者には各経路の従来の応答（論理削除の 404 など）が返る
 * - 二重マウント（`/api/projects/:projectId/quantity-tables/:id`、`/api/quantity-tables/:quantityTableId/groups/:id`、
 *   `/api/quantity-groups/:groupId/items/:id`）で経路の親の ID と対象の親が食い違うときは、対象の不在と
 *   同じ 404 にする（経路の親の ID でなく対象が属する案件で判定する）。解決関数は上流の `projectMismatch`
 *   （対象の実際の案件 ID。数量表はその案件、数量グループは実際の親の数量表の案件、数量項目は実際の親の
 *   数量グループの数量表の案件）を返し、その案件が範囲外のときだけ PROJECT_SCOPE_DENIED が記録される
 *   （経路の親の案件は判定しない。範囲内の案件どうしの食い違いは記録しない。数量表の論理削除は区別しない。
 *   タスク105.1、50.10、user-authentication の要件39.8）。対象の不在は従来どおり null で記録しない
 * - 複数の対象を一度に扱う要求（数量項目の一括コピー・一括移動、数量グループ・数量項目の表示順の更新）と
 *   移動の移し先は、対象と移し先の全件の案件を判定し、1 件でも不在または範囲外なら要求全体を 404 にして
 *   何も書き込まない（50.4。決定の根拠は design.md の Requirement 50 の章）
 * - 写真の紐付けが指す現場調査・画像の判定（50.5）は、既存の同一プロジェクトの検証と同じ位置で
 *   判定するためサービス（`QuantityGroupService`・`QuantityTableService`）に置く。その判定で範囲外とした
 *   案件は、services/project-scope-denial.service.ts の `withSurveyScopeDenialRecording` が
 *   トランザクションの外で `requireProjectScope` と同じ形で記録する（user-authentication の要件39.7）
 */

import type { Request, RequestHandler } from 'express';
import getPrismaClient from '../db.js';
import { NotFoundError } from '../errors/apiError.js';
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

/** 検査済みの本文（無ければ生の本文）を読む */
function bodyOf(req: Request): Record<string, unknown> {
  const body = (req.validatedBody ?? req.body) as unknown;
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

/** 数量表の ID から案件 ID を引く。数量表が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfQuantityTable(
  quantityTableId: string
): Promise<string | null> {
  const quantityTable = await getPrismaClient().quantityTable.findUnique({
    where: { id: quantityTableId },
    select: { projectId: true },
  });
  return quantityTable?.projectId ?? null;
}

/** 数量グループの所属（親の数量表と案件）を引く。数量グループが無ければ null */
async function findOwnerOfQuantityGroup(
  quantityGroupId: string
): Promise<{ quantityTableId: string; projectId: string } | null> {
  const group = await getPrismaClient().quantityGroup.findUnique({
    where: { id: quantityGroupId },
    select: { quantityTableId: true, quantityTable: { select: { projectId: true } } },
  });
  return group === null
    ? null
    : { quantityTableId: group.quantityTableId, projectId: group.quantityTable.projectId };
}

/** 数量項目の所属（親の数量グループと案件）を引く。数量項目が無ければ null */
async function findOwnerOfQuantityItem(
  quantityItemId: string
): Promise<{ quantityGroupId: string; projectId: string } | null> {
  const item = await getPrismaClient().quantityItem.findUnique({
    where: { id: quantityItemId },
    select: {
      quantityGroupId: true,
      quantityGroup: { select: { quantityTable: { select: { projectId: true } } } },
    },
  });
  return item === null
    ? null
    : {
        quantityGroupId: item.quantityGroupId,
        projectId: item.quantityGroup.quantityTable.projectId,
      };
}

/** 数量グループの ID から、親の数量表の案件 ID を引く。数量グループが無ければ null */
export async function findProjectIdOfQuantityGroup(
  quantityGroupId: string
): Promise<string | null> {
  return (await findOwnerOfQuantityGroup(quantityGroupId))?.projectId ?? null;
}

/** 数量項目の ID から、親の数量グループの数量表の案件 ID を引く。数量項目が無ければ null */
export async function findProjectIdOfQuantityItem(quantityItemId: string): Promise<string | null> {
  return (await findOwnerOfQuantityItem(quantityItemId))?.projectId ?? null;
}

/**
 * 案件の ID を経路のパラメータから読んで範囲を判定する
 * （数量表の作成・一覧・直近の数量表、オートコンプリート候補）
 */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/**
 * 数量表の ID を経路のパラメータから読んで範囲を判定する。
 * 経路に案件 ID（`projectId`）があり、数量表の案件と食い違うときは数量表の不在と同じ 404 にし、
 * 数量表の案件が範囲外なら記録する（50.10）
 */
export function requireQuantityTableProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const projectId = await findProjectIdOfQuantityTable(id);
    const addressedProjectId = nonEmptyString(req.params.projectId);
    if (projectId !== null && addressedProjectId !== null && addressedProjectId !== projectId) {
      // 食い違い（要件39.8）: 数量表の実際の案件を返し、範囲外のときだけ上流の判定部品が記録する（50.10）
      return projectMismatch(projectId);
    }
    return projectId;
  };
  return requireProjectScope(resolver, options);
}

/**
 * 数量グループの ID を経路のパラメータから読んで、親の数量表の案件の範囲を判定する。
 * 経路に数量表の ID（`quantityTableId`）があり、数量グループの数量表と食い違うときは
 * 数量グループの不在と同じ 404 にし、実際の親の数量表の案件が範囲外なら記録する（50.10）
 */
export function requireQuantityGroupProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const owner = await findOwnerOfQuantityGroup(id);
    if (owner === null) {
      return null;
    }
    const addressedTableId = nonEmptyString(req.params.quantityTableId);
    if (addressedTableId !== null && addressedTableId !== owner.quantityTableId) {
      // 食い違い（要件39.8）: 数量グループの実際の親の数量表の案件を返す。経路の数量表の案件は引かない（50.10）
      return projectMismatch(owner.projectId);
    }
    return owner.projectId;
  };
  return requireProjectScope(resolver, options);
}

/**
 * 数量項目の ID を経路のパラメータから読んで、親の数量グループの数量表の案件の範囲を判定する。
 * 経路に数量グループの ID（`groupId`）があり、数量項目の数量グループと食い違うときは
 * 数量項目の不在と同じ 404 にし、実際の親の数量グループの数量表の案件が範囲外なら記録する（50.10）
 */
export function requireQuantityItemProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const resolver: ProjectIdResolver = async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    if (id === null) {
      return null;
    }
    const owner = await findOwnerOfQuantityItem(id);
    if (owner === null) {
      return null;
    }
    const addressedGroupId = nonEmptyString(req.params.groupId);
    if (addressedGroupId !== null && addressedGroupId !== owner.quantityGroupId) {
      // 食い違い（要件39.8）: 数量項目の実際の親の数量グループの数量表の案件を返す。経路の数量グループの
      // 案件は引かない（50.10）
      return projectMismatch(owner.projectId);
    }
    return owner.projectId;
  };
  return requireProjectScope(resolver, options);
}

/**
 * 要求から全件の対象の案件 ID を得る。対象が 1 件でも引けなければ null（不在）。
 * 対象が 0 件なら空の配列（判定せずに通す）
 */
type TargetProjectIdsResolver = (req: Request) => Promise<string[] | null>;

/**
 * 全件の対象の案件を判定する部品を作る（50.4）
 *
 * 1 件でも不在なら汎用の 404 にする（範囲外と区別しない）。引けた対象の案件ごとに
 * `requireProjectScope` の判定を順に通し、1 件でも範囲外ならその 404 を返して後続（書き込み）へ
 * 進めない。範囲外の記録（PROJECT_SCOPE_DENIED）は `requireProjectScope` が案件ごとに行う。
 * 本文の検査の後に置く。
 */
function requireAllTargetsProjectScope(
  resolveProjectIds: TargetProjectIdsResolver,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return async (req, res, next) => {
    try {
      const projectIds = await resolveProjectIds(req);
      if (projectIds === null) {
        next(new NotFoundError());
        return;
      }

      for (const projectId of new Set(projectIds)) {
        const guard = requireProjectScope(async () => projectId, options);
        const outcome = await new Promise<unknown>((resolve) => {
          void guard(req, res, (error?: unknown) => resolve(error));
        });
        if (outcome !== undefined) {
          next(outcome);
          return;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** 本文の文字列の配列を対象の ID として読む（`itemIds`） */
function idsFromBodyStringArray(req: Request, fieldName: string): string[] {
  const ids = bodyOf(req)[fieldName];
  if (!Array.isArray(ids)) {
    return [];
  }
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

/** 本文の配列の各要素の `id` を対象の ID として読む（`orderUpdates`） */
function idsFromBodyObjectArray(req: Request, fieldName: string): string[] {
  const entries = bodyOf(req)[fieldName];
  if (!Array.isArray(entries)) {
    return [];
  }
  return [
    ...new Set(
      entries
        .map((entry) =>
          entry !== null && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined
        )
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
}

/** 数量グループの ID の集合から案件 ID を引く。1 件でも無ければ null */
async function projectIdsOfQuantityGroups(ids: string[]): Promise<string[] | null> {
  if (ids.length === 0) {
    return [];
  }
  const groups = await getPrismaClient().quantityGroup.findMany({
    where: { id: { in: ids } },
    select: { quantityTable: { select: { projectId: true } } },
  });
  return groups.length === ids.length ? groups.map((g) => g.quantityTable.projectId) : null;
}

/** 数量項目の ID の集合から案件 ID を引く。1 件でも無ければ null */
async function projectIdsOfQuantityItems(ids: string[]): Promise<string[] | null> {
  if (ids.length === 0) {
    return [];
  }
  const items = await getPrismaClient().quantityItem.findMany({
    where: { id: { in: ids } },
    select: { quantityGroup: { select: { quantityTable: { select: { projectId: true } } } } },
  });
  return items.length === ids.length
    ? items.map((item) => item.quantityGroup.quantityTable.projectId)
    : null;
}

/**
 * 数量グループの表示順の更新の対象（本文の `orderUpdates` の各 `id`）の全件の案件を判定する（50.4）。
 * 経路の数量表の判定（{@link requireQuantityTableParamProjectScope}）と併せて置く
 */
export function requireOrderedQuantityGroupsProjectScope(
  fieldName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireAllTargetsProjectScope(
    (req) => projectIdsOfQuantityGroups(idsFromBodyObjectArray(req, fieldName)),
    options
  );
}

/**
 * 数量項目の表示順の更新の対象（本文の `orderUpdates` の各 `id`）の全件の案件を判定する（50.4）。
 * 経路の数量グループの判定と併せて置く
 */
export function requireOrderedQuantityItemsProjectScope(
  fieldName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireAllTargetsProjectScope(
    (req) => projectIdsOfQuantityItems(idsFromBodyObjectArray(req, fieldName)),
    options
  );
}

/**
 * 数量項目の一括コピー・一括移動の対象（本文の項目 ID の配列）と移し先の数量グループ（本文の
 * 数量グループ ID。一括コピーには無い）の全件の案件を判定する（50.4）。項目 ID は複数の数量表に
 * またがり得るため、全件を引いて判定する。移動の移し先（`POST /:id/move` の `targetGroupId`）にも用いる
 */
export function requireBulkQuantityItemsProjectScope(
  fields: { itemIds?: string; targetGroupId?: string },
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireAllTargetsProjectScope(async (req) => {
    const projectIds: string[] = [];
    if (fields.itemIds !== undefined) {
      const ofItems = await projectIdsOfQuantityItems(idsFromBodyStringArray(req, fields.itemIds));
      if (ofItems === null) {
        return null;
      }
      projectIds.push(...ofItems);
    }
    if (fields.targetGroupId !== undefined) {
      const targetGroupId = nonEmptyString(bodyOf(req)[fields.targetGroupId]);
      if (targetGroupId === null) {
        return null;
      }
      const ofTarget = await findProjectIdOfQuantityGroup(targetGroupId);
      if (ofTarget === null) {
        return null;
      }
      projectIds.push(ofTarget);
    }
    return projectIds;
  }, options);
}

/**
 * 数量表の ID を経路のパラメータ（`quantityTableId`）から読んで範囲を判定する
 * （数量グループの作成・一覧・表示順の更新・現場調査からの一括生成）
 */
export function requireQuantityTableParamProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    return id === null ? null : findProjectIdOfQuantityTable(id);
  }, options);
}

/**
 * 数量グループの ID を経路のパラメータ（`groupId`）から読んで範囲を判定する
 * （数量項目の作成・一覧・表示順の更新）
 */
export function requireQuantityGroupParamProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    return id === null ? null : findProjectIdOfQuantityGroup(id);
  }, options);
}
