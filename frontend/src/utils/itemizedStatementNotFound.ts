/**
 * @fileoverview 内訳書の画面の 404 の分類
 *
 * Task 29.1: 内訳書の画面が 404 を受けたときの不在の表示
 *
 * Requirements (itemized-statement-generation):
 * - 19.1: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 19.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、呼び出し元は再試行の釦を出さない。
 *
 * @module utils/itemizedStatementNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象（REQ-19.1, REQ-19.2）
 *
 * - itemizedStatement: 内訳書の取得・削除・並び順の保存
 * - project: 一覧の画面と新規作成の画面のプロジェクトの読み込み、内訳書の作成（汎用の 404 は
 *   経路のプロジェクトの不在〔範囲外を含む〕）
 */
export type ItemizedStatementNotFoundTarget = 'itemizedStatement' | 'project';

// ============================================================================
// 定数
// ============================================================================

/** 内訳書が見つからない（404）ときのメッセージ（REQ-19.2） */
export const ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE =
  '内訳書が見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ（REQ-19.2） */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<ItemizedStatementNotFoundTarget, string> = {
  itemizedStatement: ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
};

/**
 * 内訳書の画面が扱う対象（内訳書）の不在の符号
 *
 * この本文は内訳書の ID を含み、閲覧範囲外の汎用の 404 と文言が異なるため、本文を出さずに
 * 固定の文言にそろえる（範囲外と不在を区別しない表示）。
 */
const TARGET_NOT_FOUND_CODES: readonly string[] = ['ITEMIZED_STATEMENT_NOT_FOUND'];

/** 日本語の文字（ひらがな・カタカナ・漢字）を含むか */
const JAPANESE_TEXT = /[぀-ヿ一-鿿]/;

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く本体の 404 の両方を含む。
 */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す（REQ-19.1, REQ-19.2）
 *
 * - 404 以外は null（呼び出し元は従来の文言を表示する）
 * - 内訳書の不在の符号と汎用の 404 は、対象ごとの固定の文言
 * - 本体の固有の 404（作成の数量表の不在 `QUANTITY_TABLE_NOT_FOUND` など）で本文が日本語のものは、その本文
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。404 でなければ null
 */
export function getItemizedStatementNotFoundMessage(
  error: unknown,
  target: ItemizedStatementNotFoundTarget
): string | null {
  if (!isNotFoundError(error)) {
    return null;
  }
  const code = getApiErrorCode(error);
  const isTargetCode = code !== null && TARGET_NOT_FOUND_CODES.includes(code);
  if (!isTargetCode && error.message && JAPANESE_TEXT.test(error.message)) {
    return error.message;
  }
  return NOT_FOUND_MESSAGES[target];
}
