/**
 * @fileoverview 工事写真の画面の 404 の分類
 *
 * Task 31.1: 工事写真の画面が 404 を受けたときの不在の表示
 *
 * Requirements (construction-photo):
 * - 22.1: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 22.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、読み込みの画面は再試行の釦を出さない。
 * 応答の本文（`detail`）は表示しない（汎用の 404 では英語の文言であり、本体の 404 ではアルバム・
 * 写真項目・工事看板・現場調査写真の ID を含むため）。
 *
 * site-survey の `siteSurveyNotFound.ts` と同じ形にするが、対象（工事写真アルバム・写真項目・
 * 工事看板など）が異なるため共用にせず本機能の層に置く（site-survey の文言を変えない）。
 *
 * @module utils/constructionPhotoNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * - album: 詳細・編集の画面の読み込み、アルバムの削除と更新、写真のアップロードの失敗した画像の理由
 * - project: 一覧・新規作成・工事看板の一覧の画面の読み込み、アルバムの作成、工事看板の登録、
 *   コピー元の現場調査の一覧の取得（汎用の 404 は経路のプロジェクトの不在〔範囲外を含む〕）
 * - photoItem: 写真項目の削除、工事写真台帳の PDF と一括 ZIP の出力
 * - albumOrPhotoItem: 写真項目のメタデータと表示順序の保存（応答からどちらの不在かを区別しない）
 * - albumOrSurveyImage: 現場調査写真のコピー（応答からどちらの不在かを区別しない）
 * - siteSurvey: コピー元の現場調査の詳細の取得
 * - signboard: 工事看板の更新と削除
 */
export type ConstructionPhotoNotFoundTarget =
  | 'album'
  | 'project'
  | 'photoItem'
  | 'albumOrPhotoItem'
  | 'albumOrSurveyImage'
  | 'siteSurvey'
  | 'signboard';

// ============================================================================
// 定数
// ============================================================================

/** 工事写真アルバムが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND_MESSAGE =
  '工事写真アルバムが見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const CONSTRUCTION_PHOTO_PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

/** 写真項目が見つからない（404）ときのメッセージ */
export const CONSTRUCTION_PHOTO_ITEM_NOT_FOUND_MESSAGE =
  '写真項目が見つかりません。存在しないか、削除されています。';

/** 工事写真アルバムまたは写真項目が見つからない（404）ときのメッセージ。保存で使う */
export const CONSTRUCTION_PHOTO_ALBUM_OR_ITEM_NOT_FOUND_MESSAGE =
  '工事写真アルバムまたは写真項目が見つかりません。存在しないか、削除されています。';

/** 工事写真アルバムまたは現場調査写真が見つからない（404）ときのメッセージ。現場調査写真のコピーで使う */
export const CONSTRUCTION_PHOTO_ALBUM_OR_SURVEY_IMAGE_NOT_FOUND_MESSAGE =
  '工事写真アルバムまたは現場調査写真が見つかりません。存在しないか、削除されています。';

/** 現場調査が見つからない（404）ときのメッセージ。コピー元の選択の読み込みで使う */
export const CONSTRUCTION_PHOTO_SITE_SURVEY_NOT_FOUND_MESSAGE =
  '現場調査が見つかりません。存在しないか、削除されています。';

/** 工事看板が見つからない（404）ときのメッセージ */
export const CONSTRUCTION_SIGNBOARD_NOT_FOUND_MESSAGE =
  '工事看板が見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<ConstructionPhotoNotFoundTarget, string> = {
  album: CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND_MESSAGE,
  project: CONSTRUCTION_PHOTO_PROJECT_NOT_FOUND_MESSAGE,
  photoItem: CONSTRUCTION_PHOTO_ITEM_NOT_FOUND_MESSAGE,
  albumOrPhotoItem: CONSTRUCTION_PHOTO_ALBUM_OR_ITEM_NOT_FOUND_MESSAGE,
  albumOrSurveyImage: CONSTRUCTION_PHOTO_ALBUM_OR_SURVEY_IMAGE_NOT_FOUND_MESSAGE,
  siteSurvey: CONSTRUCTION_PHOTO_SITE_SURVEY_NOT_FOUND_MESSAGE,
  signboard: CONSTRUCTION_SIGNBOARD_NOT_FOUND_MESSAGE,
};

/**
 * 対象の不在ではない 404 の符号
 *
 * 取り除かれた工事看板を指定した保存の 404（`SIGNBOARD_NOT_ALLOWED`）は、呼び出し元の従来の文言
 * （看板が取り除かれた旨。タスク 24.2）に委ね、見つからない旨にしない。
 */
const NON_TARGET_NOT_FOUND_CODES: readonly string[] = ['SIGNBOARD_NOT_ALLOWED'];

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが工事写真の画面の対象の 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く本体の 404（アルバムの
 * `CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND`、写真項目の `CONSTRUCTION_PHOTO_NOT_FOUND`、現場調査写真の
 * `SURVEY_IMAGE_NOT_ALLOWED` など）を含む。取り除かれた看板の 404（`SIGNBOARD_NOT_ALLOWED`）は含まない。
 */
export function isConstructionPhotoNotFoundError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.statusCode !== 404) {
    return false;
  }
  const code = getApiErrorCode(error);
  return code === null || !NON_TARGET_NOT_FOUND_CODES.includes(code);
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 対象の 404 でなければ null（呼び出し元は従来の文言を表示する）
 * - 対象の 404 は、応答の本文によらず呼び出し元が渡す対象の固定の文言
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。対象の 404 でなければ null
 */
export function getConstructionPhotoNotFoundMessage(
  error: unknown,
  target: ConstructionPhotoNotFoundTarget
): string | null {
  if (!isConstructionPhotoNotFoundError(error)) {
    return null;
  }
  return NOT_FOUND_MESSAGES[target];
}
