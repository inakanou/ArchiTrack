/**
 * @fileoverview 論理削除された現場調査の画像への到達を遮断する共通機構
 *
 * Task 115.124: 論理削除された現場調査の画像へ到達できる五経路を遮断する
 *
 * 現場調査の論理削除（SiteSurvey.deletedAt）は画像の行（SurveyImage）に
 * 削除の印を付けない。保存基盤に論理削除の共通機構は無く、画像の行に削除の印を
 * 持つ列も無いため、遮断は画像を読み書きする各経路が明示的に行うほかない。
 *
 * 既存の順序更新経路（PUT /api/site-surveys/:id/images/order）は
 * ImageOrderError('SURVEY_DELETED') を 410 へ写して拒否する。本モジュールは
 * その扱いを他の経路へも同じ形（同じ状態コード・同じ code・同じ本文形状）で
 * 揃えるための共通部品を提供する。
 *
 * Requirements:
 * - 1.5: ユーザーが現場調査を削除すると、現場調査と関連する画像データを論理削除する
 *
 * @module utils/survey-deleted-guard
 */

import type { Response } from 'express';

/**
 * 論理削除済み現場調査を表すエラーコード
 *
 * ImageOrderService が投げる ImageOrderError の code と同一の文字列であり、
 * 応答本文の `code` および problem type の導出元となる。
 */
export const SURVEY_DELETED_CODE = 'SURVEY_DELETED';

/**
 * 論理削除された現場調査の画像を操作しようとしたエラー
 *
 * 順序更新経路の ImageOrderError('SURVEY_DELETED') と同じ扱い（410 Gone）へ
 * 写されることを前提とする。
 */
export class SurveyDeletedError extends Error {
  readonly code = SURVEY_DELETED_CODE;
  readonly surveyId: string;
  /**
   * 問題箇所の名指し（Task 90.2）
   *
   * `groups[i].surveyImageId` をキーとする。位置の名指しを持てる経路（数量表の
   * フル状態同期保存）だけが与え、URL で1つの資源を指す経路は与えない。
   * 与えない限り応答本文は従来と一字も変わらない。
   */
  readonly validationErrors: Record<string, string> | undefined;

  constructor(surveyId: string, message?: string, validationErrors?: Record<string, string>) {
    super(message ?? `削除された現場調査の画像は操作できません: ${surveyId}`);
    this.name = 'SurveyDeletedError';
    this.surveyId = surveyId;
    this.validationErrors = validationErrors;
  }
}

/**
 * 親の現場調査が論理削除されていないことを表明する
 *
 * 画像の行と同じ問い合わせで取得した親の削除状態を受け取り、削除済みなら
 * SurveyDeletedError を投げる。親が取得できていない場合（画像が存在しない等）は
 * 何もしない。存在しないことの扱いは各経路の 404 判定に委ねる。
 *
 * Requirements: 1.5
 *
 * @param survey - 画像に紐付く現場調査の削除状態（未取得なら null/undefined）
 * @param surveyId - 現場調査ID（応答の詳細文に用いる）
 * @param message - 経路ごとの詳細文（省略時は既定文）
 * @param describeValidationErrors - 問題箇所の名指しの組み立て（Task 90.2）。
 *   拒むときにだけ呼ぶ。値ではなく組み立てを受け取るのは、生存する画像に対して
 *   名指しの走査を無駄に走らせないためである。省略した経路の応答本文は従来と変わらない
 * @throws {SurveyDeletedError} 現場調査が論理削除済みの場合
 */
export function assertSurveyNotDeleted(
  survey: { deletedAt: Date | null } | null | undefined,
  surveyId: string,
  message?: string,
  describeValidationErrors?: () => Record<string, string>
): void {
  if (survey && survey.deletedAt !== null && survey.deletedAt !== undefined) {
    throw new SurveyDeletedError(surveyId, message, describeValidationErrors?.());
  }
}

/**
 * 論理削除済みを表す 410 応答を返す
 *
 * 本文の形は順序更新経路（survey-images.routes.ts の PUT /order）が
 * ImageOrderError を写すときと同一である。
 *
 * @param res - Express の応答オブジェクト
 * @param error - 投げられた SurveyDeletedError
 */
export function sendSurveyDeletedProblem(res: Response, error: SurveyDeletedError): void {
  res.status(410).json({
    type: `https://architrack.example.com/problems/${SURVEY_DELETED_CODE.toLowerCase().replace(/_/g, '-')}`,
    title: SURVEY_DELETED_CODE.replace(/_/g, ' '),
    status: 410,
    detail: error.message,
    code: SURVEY_DELETED_CODE,
    surveyId: error.surveyId,
    // 問題箇所の名指しは本文の直下へ展開する（所属違反の 400 と同じ形。Task 90.2）。
    // 名指しを持たない経路では空の展開になり、本文は従来と一字も変わらない
    ...(error.validationErrors ?? {}),
  });
}
