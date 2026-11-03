/**
 * @fileoverview 数量表の画面の 404 の分類
 *
 * Task 106.1: 数量表の画面が 404 を受けたときの不在の表示
 *
 * Requirements (quantity-table-generation):
 * - 51.1: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 51.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、呼び出し元は再試行の釦を出さない。
 * 応答の本文（`detail`）は表示しない（汎用の 404 では英語の文言であり、本体の 404 では ID を含むため）。
 *
 * @module utils/quantityTableNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * - quantityTable: 編集の画面の詳細の読み込み・保存、一覧の画面の名称の変更・コピー・削除
 * - project: 一覧の画面と新規作成の画面の読み込み、数量表の作成（汎用の 404 は経路のプロジェクトの
 *   不在〔範囲外を含む〕）
 */
export type QuantityTableNotFoundTarget = 'quantityTable' | 'project';

// ============================================================================
// 定数
// ============================================================================

/** 数量表が見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const QUANTITY_TABLE_NOT_FOUND_MESSAGE =
  '数量表が見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<QuantityTableNotFoundTarget, string> = {
  quantityTable: QUANTITY_TABLE_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
};

/**
 * 数量表・プロジェクトの不在ではない 404 の符号
 *
 * 保存や数量グループの作成が紐付けた写真（現調画像・現場調査）の不在〔閲覧範囲外を含む〕で受ける 404
 * であり、数量表が見つからない旨にしない。呼び出し元の既存の書き分け
 * （`describeSurveyImageLinkSaveFailure`）や従来の文言に委ねる。
 */
const NON_TARGET_NOT_FOUND_CODES: readonly string[] = [
  'SURVEY_IMAGE_NOT_FOUND',
  'SITE_SURVEY_NOT_FOUND',
];

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが数量表・プロジェクトの 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く本体の 404（論理削除された数量表の
 * `QUANTITY_TABLE_NOT_FOUND`、プロジェクトの `PROJECT_NOT_FOUND` など）を含む。紐付けた写真の不在の
 * 404 は含まない。
 */
export function isQuantityTableNotFoundError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.statusCode !== 404) {
    return false;
  }
  const code = getApiErrorCode(error);
  return code === null || !NON_TARGET_NOT_FOUND_CODES.includes(code);
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 数量表・プロジェクトの 404 でなければ null（呼び出し元は従来の文言を表示する）
 * - 数量表・プロジェクトの 404 は、応答の本文によらず呼び出し元が渡す対象の固定の文言
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。数量表・プロジェクトの 404 でなければ null
 */
export function getQuantityTableNotFoundMessage(
  error: unknown,
  target: QuantityTableNotFoundTarget
): string | null {
  if (!isQuantityTableNotFoundError(error)) {
    return null;
  }
  return NOT_FOUND_MESSAGES[target];
}
