/**
 * @fileoverview 見積書の画面の 404 の分類
 *
 * Task 64.1: 見積書の画面が 404 を受けたときの不在の表示
 *
 * estimate-creation の Requirement 58.1（画面の読み込みの 404 で見つからない旨を表示する）と
 * Requirement 58.2（作成・保存・削除・諸経費の計算の操作と、受領見積書の転記のダイアログの
 * 受領見積書の一覧の読み込みの 404 で、見つからない旨の日本語のメッセージを表示する）の分類の部品。
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、呼び出し元は再試行の釦を出さない。
 *
 * @module utils/estimateNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * - estimate: 見積書の読み込み・保存・削除・諸経費の計算
 * - project: 一覧の画面と新規作成の画面の読み込み、見積書の作成（汎用の 404 は経路のプロジェクトの
 *   不在〔範囲外を含む〕）、受領見積書の転記のダイアログの受領見積書の一覧の読み込み
 * - itemizedStatement: 見積書の作成の要求が指す内訳書（符号 `ITEMIZED_STATEMENT_NOT_FOUND`）
 */
export type EstimateNotFoundTarget = 'estimate' | 'project' | 'itemizedStatement';

// ============================================================================
// 定数
// ============================================================================

/**
 * 見積書が見つからない（404）ときのメッセージ
 *
 * 保存の 404 の既存の文言（Requirement 42.3 の実装）であり、他の操作の文言はこれにそろえる。
 */
export const ESTIMATE_NOT_FOUND_MESSAGE =
  '見積書が見つかりません。すでに削除された可能性があります。';

/** プロジェクトが見つからない（404）ときのメッセージ */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。すでに削除された可能性があります。';

/** 内訳書が見つからない（404）ときのメッセージ */
export const ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE =
  '内訳書が見つかりません。すでに削除された可能性があります。';

const NOT_FOUND_MESSAGES: Record<EstimateNotFoundTarget, string> = {
  estimate: ESTIMATE_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
  itemizedStatement: ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
};

/**
 * 本体の固有の 404 の符号と、その符号が指す対象
 *
 * 本体の不在の本文は対象の ID を含み、閲覧範囲外の汎用の 404 と文言が異なるため、本文を出さずに
 * 符号で対象を選んで固定の文言にそろえる（範囲外と不在を区別しない表示）。
 */
const CODE_TARGETS: ReadonlyMap<string, EstimateNotFoundTarget> = new Map<
  string,
  EstimateNotFoundTarget
>([
  ['ESTIMATE_NOT_FOUND', 'estimate'],
  ['ITEMIZED_STATEMENT_NOT_FOUND', 'itemizedStatement'],
]);

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く本体の 404 の両方を含む。
 * 保存の失敗の文言の変換（見積書詳細画面の `toSaveErrorMessage`）と同じく状態コードで判定する。
 */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 404 以外は null（呼び出し元は従来の文言を表示する）
 * - 本体の固有の符号（`ESTIMATE_NOT_FOUND`・`ITEMIZED_STATEMENT_NOT_FOUND`）は、符号が指す対象の文言
 * - 汎用の `NOT_FOUND` とその他の 404 は、呼び出し元が渡す対象の文言
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 汎用の 404 のときに見つからない対象
 * @returns 見つからない旨のメッセージ。404 でなければ null
 */
export function getEstimateNotFoundMessage(
  error: unknown,
  target: EstimateNotFoundTarget
): string | null {
  if (!isNotFoundError(error)) {
    return null;
  }
  const code = getApiErrorCode(error);
  const codeTarget = code !== null ? CODE_TARGETS.get(code) : undefined;
  return NOT_FOUND_MESSAGES[codeTarget ?? target];
}
