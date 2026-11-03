/**
 * @fileoverview 現場調査の画面の 404 の分類
 *
 * Task 120.1: 現場調査の画面が 404 を受けたときの不在の表示
 *
 * Requirements (site-survey):
 * - 40.1: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 40.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、読み込みの画面は再試行の釦を出さない。
 * 応答の本文（`detail`）は表示しない（汎用の 404 では英語の文言であり、本体の 404 では ID を含むため）。
 *
 * @module utils/siteSurveyNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * - siteSurvey: 詳細の画面の読み込み・現場調査の削除・画像のアップロード、編集の画面の更新、
 *   調査報告書の PDF の出力
 * - project: 一覧の画面と新規作成の画面の読み込み、現場調査の作成（汎用の 404 は経路のプロジェクトの
 *   不在〔範囲外を含む〕）
 * - image: 画像の削除、注釈の保存、注釈の JSON の出力
 * - siteSurveyOrImage: 詳細の画面の画像の情報と並び順の保存（応答からどちらの不在かを区別しない）
 */
export type SiteSurveyNotFoundTarget = 'siteSurvey' | 'project' | 'image' | 'siteSurveyOrImage';

// ============================================================================
// 定数
// ============================================================================

/** 現場調査が見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const SITE_SURVEY_NOT_FOUND_MESSAGE =
  '現場調査が見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

/** 画像が見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const SURVEY_IMAGE_NOT_FOUND_MESSAGE =
  '画像が見つかりません。存在しないか、削除されています。';

/** 現場調査または画像が見つからない（404）ときのメッセージ。画像の情報と並び順の保存で使う */
export const SITE_SURVEY_OR_IMAGE_NOT_FOUND_MESSAGE =
  '現場調査または画像が見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<SiteSurveyNotFoundTarget, string> = {
  siteSurvey: SITE_SURVEY_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
  image: SURVEY_IMAGE_NOT_FOUND_MESSAGE,
  siteSurveyOrImage: SITE_SURVEY_OR_IMAGE_NOT_FOUND_MESSAGE,
};

/**
 * 現場調査・プロジェクト・画像の不在ではない 404 の符号
 *
 * 注釈が未保存である（画像はある）ときの注釈の JSON の出力の 404 であり、見つからない旨にしない。
 * 呼び出し元の従来の文言（保存された注釈データが無い旨）に委ねる。
 */
const NON_TARGET_NOT_FOUND_CODES: readonly string[] = ['ANNOTATION_NOT_FOUND'];

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが現場調査・プロジェクト・画像の 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く本体の 404（現場調査の
 * `SITE_SURVEY_NOT_FOUND`、プロジェクトの `PROJECT_NOT_FOUND` など）を含む。注釈が未保存である
 * 404（`ANNOTATION_NOT_FOUND`）は含まない。
 */
export function isSiteSurveyNotFoundError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.statusCode !== 404) {
    return false;
  }
  const code = getApiErrorCode(error);
  return code === null || !NON_TARGET_NOT_FOUND_CODES.includes(code);
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 現場調査・プロジェクト・画像の 404 でなければ null（呼び出し元は従来の文言を表示する）
 * - 現場調査・プロジェクト・画像の 404 は、応答の本文によらず呼び出し元が渡す対象の固定の文言
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。現場調査・プロジェクト・画像の 404 でなければ null
 */
export function getSiteSurveyNotFoundMessage(
  error: unknown,
  target: SiteSurveyNotFoundTarget
): string | null {
  if (!isSiteSurveyNotFoundError(error)) {
    return null;
  }
  return NOT_FOUND_MESSAGES[target];
}
