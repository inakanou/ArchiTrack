/**
 * @fileoverview 見積依頼の画面の 404 の分類
 *
 * Task 105.1: 見積依頼の画面が 404 を受けたときの不在の表示
 *
 * Requirements (estimate-request):
 * - 10.5: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 10.6: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、呼び出し元は再試行の釦を出さない。
 *
 * @module utils/estimateRequestNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象（REQ-10.5, REQ-10.6）
 *
 * - estimateRequest: 見積依頼の取得・保存・項目の選択の保存・設定の変更・ステータスの変更・削除・受領見積書の登録
 * - project: 一覧の画面と新規作成の画面のプロジェクトの読み込み
 * - projectOrItemizedStatement: 見積依頼の作成（経路のプロジェクトと要求の内訳書のどちらの不在かを応答から区別できない）
 * - receivedQuotation: 受領見積書の更新・削除
 */
export type EstimateRequestNotFoundTarget =
  | 'estimateRequest'
  | 'project'
  | 'projectOrItemizedStatement'
  | 'receivedQuotation';

// ============================================================================
// 定数
// ============================================================================

/** 見積依頼が見つからない（404）ときのメッセージ（REQ-10.6） */
export const ESTIMATE_REQUEST_NOT_FOUND_MESSAGE =
  '見積依頼が見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ（REQ-10.5） */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

/** 見積依頼の作成が 404 を受けたときのメッセージ（REQ-10.6） */
export const PROJECT_OR_ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE =
  'プロジェクトまたは内訳書が見つかりません。存在しないか、削除されています。';

/** 受領見積書が見つからない（404）ときのメッセージ（REQ-10.6） */
export const RECEIVED_QUOTATION_NOT_FOUND_MESSAGE =
  '受領見積書が見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<EstimateRequestNotFoundTarget, string> = {
  estimateRequest: ESTIMATE_REQUEST_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
  projectOrItemizedStatement: PROJECT_OR_ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
  receivedQuotation: RECEIVED_QUOTATION_NOT_FOUND_MESSAGE,
};

/**
 * 見積依頼の画面が扱う対象（見積依頼・受領見積書・内訳書）の不在の符号
 *
 * これらの本文は対象の ID を含み、閲覧範囲外の汎用の 404 と文言が異なるため、本文を出さずに
 * 対象ごとの固定の文言にそろえる（範囲外と不在を区別しない表示）。
 */
const TARGET_NOT_FOUND_CODES: readonly string[] = [
  'ESTIMATE_REQUEST_NOT_FOUND',
  'ESTIMATE_REQUEST_STATUS_NOT_FOUND',
  'RECEIVED_QUOTATION_NOT_FOUND',
  'ITEMIZED_STATEMENT_NOT_FOUND',
];

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
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す（REQ-10.5, REQ-10.6）
 *
 * - 404 以外は null（呼び出し元は従来の文言を表示する）
 * - 見積依頼の画面が扱う対象の不在と汎用の 404 は、対象ごとの固定の文言
 * - 本体の固有の 404（取引先の不在など）で本文が日本語のものは、その本文
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。404 でなければ null
 */
export function getEstimateRequestNotFoundMessage(
  error: unknown,
  target: EstimateRequestNotFoundTarget
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
