/**
 * @fileoverview 現場調査・画像の ID から案件 ID を引き、案件の閲覧範囲を判定する部品
 *
 * site-survey タスク119.1（Requirement 39.1〜39.4、user-authentication の要件39）。
 * - 判定そのものは user-authentication の `requireProjectScope`（ProjectScopeService）に任せ、
 *   本ファイルは本機能の子リソース（現場調査・画像）から案件 ID を引く解決関数だけを持つ
 * - 経路では `authenticate` → `requirePermission` → ID の形式の検査 → 本ファイルの判定部品の順に置く
 *   （権限なしの 403 を範囲外の 404 より先に返す。user-authentication の tasks.md の Implementation Notes の 52.2 の区分 D）
 * - 対象の不在・案件の不在・範囲外はどれも汎用の 404（`NOT_FOUND`）になり、本文に案件 ID を含めない（39.2・39.3）
 * - 現場調査・プロジェクトの論理削除の扱いは変えない。論理削除された現場調査も案件 ID を引き、
 *   範囲内の利用者には従来どおりの応答（410 など）を各経路が返す
 * - 一括の経路（画像の一括更新）は対象の全件の案件を判定し、1 件でも不在または範囲外なら
 *   要求全体を 404 にして何も変えない（39.4。決定の根拠は site-survey の design.md の Requirement 39 の章）
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

/** 現場調査の ID から案件 ID を引く。現場調査が無ければ null（論理削除は区別しない） */
export async function findProjectIdOfSurvey(surveyId: string): Promise<string | null> {
  const survey = await getPrismaClient().siteSurvey.findUnique({
    where: { id: surveyId },
    select: { projectId: true },
  });
  return survey?.projectId ?? null;
}

/** 画像の ID から案件 ID を引く。画像が無ければ null（現場調査の論理削除は区別しない） */
export async function findProjectIdOfImage(imageId: string): Promise<string | null> {
  const image = await getPrismaClient().surveyImage.findUnique({
    where: { id: imageId },
    select: { survey: { select: { projectId: true } } },
  });
  return image?.survey.projectId ?? null;
}

/** 経路のパラメータの現場調査 ID から案件 ID を引く解決関数 */
export const surveyProjectFromParam =
  (paramName: string): ProjectIdResolver =>
  async (req) => {
    const surveyId = nonEmptyString(req.params[paramName]);
    return surveyId === null ? null : findProjectIdOfSurvey(surveyId);
  };

/** 経路のパラメータの画像 ID から案件 ID を引く解決関数 */
export const imageProjectFromParam =
  (paramName: string): ProjectIdResolver =>
  async (req) => {
    const imageId = nonEmptyString(req.params[paramName]);
    return imageId === null ? null : findProjectIdOfImage(imageId);
  };

/** 本文の現場調査 ID から案件 ID を引く解決関数（本文の検査の後に置く） */
export const surveyProjectFromBody =
  (fieldName: string): ProjectIdResolver =>
  async (req) => {
    const surveyId = nonEmptyString(bodyOf(req)[fieldName]);
    return surveyId === null ? null : findProjectIdOfSurvey(surveyId);
  };

/** 案件の ID を経路のパラメータから読んで範囲を判定する */
export function requireProjectParamScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(projectIdFromParam(paramName), options);
}

/** 現場調査の ID を経路のパラメータから読んで範囲を判定する */
export function requireSurveyProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(surveyProjectFromParam(paramName), options);
}

/** 画像の ID を経路のパラメータから読んで範囲を判定する */
export function requireImageProjectScope(
  paramName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(imageProjectFromParam(paramName), options);
}

/** 現場調査の ID を本文から読んで範囲を判定する（本文の検査の後に置く） */
export function requireBodySurveyProjectScope(
  fieldName: string,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return requireProjectScope(surveyProjectFromBody(fieldName), options);
}

/** 要求から一括の対象の画像 ID を得る */
export type ImageIdsResolver = (req: Request) => string[];

/**
 * 一括の対象の全件の案件を判定する（39.4）
 *
 * 対象の画像を 1 回の問い合わせで引き、1 件でも不在なら汎用の 404 にする（範囲外と区別しない）。
 * 引けた画像の案件ごとに `requireProjectScope` の判定を順に通し、1 件でも範囲外なら
 * その 404 を返して後続（書き込み）へ進めない。範囲外の記録（PROJECT_SCOPE_DENIED）は
 * `requireProjectScope` が案件ごとに行う。本文の検査の後に置く。
 */
export function requireImagesProjectScope(
  resolveImageIds: ImageIdsResolver,
  options?: ProjectScopeGuardOptions
): RequestHandler {
  return async (req, res, next) => {
    try {
      const imageIds = [...new Set(resolveImageIds(req))];
      if (imageIds.length === 0) {
        next(new NotFoundError());
        return;
      }

      const images = await getPrismaClient().surveyImage.findMany({
        where: { id: { in: imageIds } },
        select: { id: true, survey: { select: { projectId: true } } },
      });
      if (images.length !== imageIds.length) {
        next(new NotFoundError());
        return;
      }

      const projectIds = [...new Set(images.map((image) => image.survey.projectId))];
      for (const projectId of projectIds) {
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

/** 本文の配列の各要素の `id` を一括の対象の画像 ID として読む */
export const imageIdsFromBodyArray =
  (fieldName: string): ImageIdsResolver =>
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
