/**
 * @fileoverview 工事写真アルバム・写真項目・工事看板の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * construction-photo タスク30.1・30.2（Requirement 21.1〜21.7、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の子リソース（アルバム・写真項目・工事看板と、現調コピーのコピー元の
 *   現場調査写真）から案件 ID を引く解決関数と、一括の要求の全件の判定だけを持つ
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品 → 本体の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の
 *   52.2 の区分 D）。本体はタスク 23.1 の所属の判定（`construction-photo-availability`。プロジェクトの配下として
 *   指したときの不一致、アルバム・写真項目・看板の論理削除）を従来どおり行う
 * - 対象の不在・案件の不在や論理削除・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を
 *   含めない（21.2・21.3）
 * - アルバム・看板の論理削除は区別せずに案件 ID を引く。範囲内の利用者には各経路の従来の応答が返る
 * - 一括の経路（メタデータの一括更新・表示順序の更新）と現調コピーのコピー元は、対象の全件の案件を判定し、
 *   1 件でも不在または範囲外なら要求全体を 404 にして何も変えない（21.4・21.5。決定の根拠は
 *   construction-photo の design.md の Requirement 21 の章）
 */

import type { Request, RequestHandler } from 'express';
import getPrismaClient from '../db.js';
import { NotFoundError } from '../errors/apiError.js';
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

/** アルバムの ID から案件 ID を引く。アルバムが無ければ null（論理削除は区別しない） */
export async function findProjectIdOfAlbum(albumId: string): Promise<string | null> {
  const album = await getPrismaClient().constructionPhotoAlbum.findUnique({
    where: { id: albumId },
    select: { projectId: true },
  });
  return album?.projectId ?? null;
}

/** 写真項目の ID から案件 ID を引く。写真項目が無ければ null（アルバムの論理削除は区別しない） */
export async function findProjectIdOfPhoto(photoId: string): Promise<string | null> {
  const photo = await getPrismaClient().constructionPhoto.findUnique({
    where: { id: photoId },
    select: { album: { select: { projectId: true } } },
  });
  return photo?.album.projectId ?? null;
}

/** 工事看板の ID から案件 ID を引く。看板が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfSignboard(signboardId: string): Promise<string | null> {
  const signboard = await getPrismaClient().constructionSignboard.findUnique({
    where: { id: signboardId },
    select: { projectId: true },
  });
  return signboard?.projectId ?? null;
}

/** 経路のパラメータの ID から、指定の引き方で案件 ID を引く解決関数を作る */
const fromParam =
  (paramName: string, find: (id: string) => Promise<string | null>): ProjectIdResolver =>
  async (req) => {
    const id = nonEmptyString(req.params[paramName]);
    return id === null ? null : find(id);
  };

/** 案件の ID を経路のパラメータから読んで範囲を判定する（アルバム・看板の作成と一覧） */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/** アルバムの ID を経路のパラメータから読んで範囲を判定する */
export function requireAlbumProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(fromParam(paramName, findProjectIdOfAlbum), options);
}

/**
 * アルバムの配下として指したとき（`/api/construction-photos/:id/images/...`）だけ、そのアルバムの範囲を判定する。
 * flat に指したとき（`/api/construction-photos/images/...`）はパラメータが無く、判定せずに通す
 * （写真項目の範囲は {@link requirePhotosProjectScope} が判定する）
 */
export function requireAddressedAlbumProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  const guard = requireAlbumProjectScope(paramName, options);
  return (req, res, next) => {
    if (nonEmptyString(req.params[paramName]) === null) {
      next();
      return;
    }
    return guard(req, res, next);
  };
}

/** 写真項目の ID を経路のパラメータから読んで範囲を判定する */
export function requirePhotoProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(fromParam(paramName, findProjectIdOfPhoto), options);
}

/** 工事看板の ID を経路のパラメータから読んで範囲を判定する */
export function requireSignboardProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(fromParam(paramName, findProjectIdOfSignboard), options);
}

/** 要求から一括の対象の ID を得る */
export type TargetIdsResolver = (req: Request) => string[];

/** ID の集合から、引けた対象ごとの案件 ID を得る（引けなかった対象は含めない） */
type ProjectIdsLookup = (ids: string[]) => Promise<string[]>;

/**
 * 一括の対象の全件の案件を判定する部品を作る（21.4・21.5）
 *
 * 対象を 1 回の問い合わせで引き、1 件でも不在なら汎用の 404 にする（範囲外と区別しない）。
 * 引けた対象の案件ごとに `requireProjectScope` の判定を順に通し、1 件でも範囲外なら
 * その 404 を返して後続（書き込み）へ進めない。範囲外の記録（PROJECT_SCOPE_DENIED）は
 * `requireProjectScope` が案件ごとに行う。本文の検査の後に置く。
 */
function requireAllTargetsProjectScope(
  resolveIds: TargetIdsResolver,
  lookup: ProjectIdsLookup,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return async (req, res, next) => {
    try {
      const ids = [...new Set(resolveIds(req))];
      if (ids.length === 0) {
        next(new NotFoundError());
        return;
      }

      const projectIdsOfTargets = await lookup(ids);
      if (projectIdsOfTargets.length !== ids.length) {
        next(new NotFoundError());
        return;
      }

      for (const projectId of new Set(projectIdsOfTargets)) {
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

/** 写真項目の一括の要求（メタデータの一括更新・表示順序の更新）の全件の案件を判定する（21.4） */
export function requirePhotosProjectScope(
  resolvePhotoIds: TargetIdsResolver,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireAllTargetsProjectScope(
    resolvePhotoIds,
    async (ids) => {
      const photos = await getPrismaClient().constructionPhoto.findMany({
        where: { id: { in: ids } },
        select: { album: { select: { projectId: true } } },
      });
      return photos.map((photo) => photo.album.projectId);
    },
    options
  );
}

/** 現調コピーのコピー元の現場調査写真の全件の案件を判定する（21.5） */
export function requireSurveyImagesProjectScope(
  resolveSurveyImageIds: TargetIdsResolver,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireAllTargetsProjectScope(
    resolveSurveyImageIds,
    async (ids) => {
      const images = await getPrismaClient().surveyImage.findMany({
        where: { id: { in: ids } },
        select: { survey: { select: { projectId: true } } },
      });
      return images.map((image) => image.survey.projectId);
    },
    options
  );
}

/** 本文の配列の各要素の `id` を一括の対象の ID として読む（`items`・`orders`） */
export const idsFromBodyObjectArray =
  (fieldName: string): TargetIdsResolver =>
  (req) => {
    const items = bodyOf(req)[fieldName];
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) =>
        item !== null && typeof item === 'object' ? (item as { id?: unknown }).id : undefined
      )
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  };

/** 本文の文字列の配列を一括の対象の ID として読む（`surveyImageIds`） */
export const idsFromBodyStringArray =
  (fieldName: string): TargetIdsResolver =>
  (req) => {
    const ids = bodyOf(req)[fieldName];
    if (!Array.isArray(ids)) {
      return [];
    }
    return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  };
