/**
 * @fileoverview 実行予算の画面の 404 の分類と、実行予算の未作成と案件の不在の見分け
 *
 * Task 19.1: 実行予算・変更契約の反映・発注詳細・出来高入力の画面が 404 を受けたときの不在の表示
 *
 * Requirements (execution-budget-management):
 * - 21.1: 画面の読み込みの 404 を見つからない種別に分類し、実行予算の取得の 404 のあとに案件を確かめて、
 *   案件の不在（閲覧範囲外を含む）と実行予算の未作成を見分ける
 * - 21.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。応答の本文（`detail`）は表示しない（汎用の 404 では英語の文言であるため）。
 *
 * @module utils/executionBudgetNotFound
 */

import { ApiError, getApiErrorCode } from '../api/client';
import { getProject } from '../api/projects';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * 呼び出し元は、汎用の 404（`NOT_FOUND`）が指す対象として経路が指す対象を渡す（発注詳細の画面の発注の
 * 取得と、既存の発注を指す操作では order、それ以外では project）。本体の 404 の符号はその符号の対象になる。
 */
export type ExecutionBudgetNotFoundTarget =
  | 'project'
  | 'executionBudget'
  | 'contract'
  | 'amendment'
  | 'order'
  | 'progressRecord';

/**
 * 実行予算の取得が 404（null）だったときの見分けの結果
 *
 * - budgetNotCreated: 案件が取得できた（従来の実行予算の未作成の表示）
 * - projectNotFound: 案件の取得も 404（閲覧範囲外と不在を区別しない不在の表示）
 * - projectLoadFailed: 案件の取得が 404 以外で失敗した（作成の釦を出さず読み込みの失敗を表示する）
 */
export type MissingExecutionBudgetResolution =
  | 'budgetNotCreated'
  | 'projectNotFound'
  | 'projectLoadFailed';

// ============================================================================
// 定数
// ============================================================================

/** プロジェクトが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

/** 実行予算が見つからない（404）ときのメッセージ */
export const EXECUTION_BUDGET_NOT_FOUND_MESSAGE =
  '実行予算が見つかりません。存在しないか、削除されています。';

/** 契約書が見つからない（404）ときのメッセージ（実行予算の作成で選んだ契約書） */
export const CONTRACT_NOT_FOUND_MESSAGE =
  '契約書が見つかりません。存在しないか、削除されています。';

/** 変更契約が見つからない（404）ときのメッセージ */
export const AMENDMENT_NOT_FOUND_MESSAGE =
  '変更契約が見つかりません。存在しないか、削除されています。';

/** 発注が見つからない（404）ときのメッセージ */
export const ORDER_NOT_FOUND_MESSAGE = '発注が見つかりません。存在しないか、削除されています。';

/** 出来高記録が見つからない（404）ときのメッセージ */
export const PROGRESS_RECORD_NOT_FOUND_MESSAGE =
  '出来高記録が見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<ExecutionBudgetNotFoundTarget, string> = {
  project: PROJECT_NOT_FOUND_MESSAGE,
  executionBudget: EXECUTION_BUDGET_NOT_FOUND_MESSAGE,
  contract: CONTRACT_NOT_FOUND_MESSAGE,
  amendment: AMENDMENT_NOT_FOUND_MESSAGE,
  order: ORDER_NOT_FOUND_MESSAGE,
  progressRecord: PROGRESS_RECORD_NOT_FOUND_MESSAGE,
};

/** 汎用の 404 の符号（閲覧範囲外と不在に共通。経路が指す対象の文言にする） */
const GENERIC_NOT_FOUND_CODE = 'NOT_FOUND';

/** 範囲内の利用者に届く本体の 404 の符号と、その対象 */
const BODY_NOT_FOUND_TARGETS: Readonly<Record<string, ExecutionBudgetNotFoundTarget>> = {
  EXECUTION_BUDGET_NOT_FOUND: 'executionBudget',
  EXECUTION_BUDGET_NOT_FOUND_FOR_ORDER: 'executionBudget',
  EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS: 'executionBudget',
  CONTRACT_NOT_FOUND_FOR_BUDGET: 'contract',
  AMENDMENT_CONTRACT_NOT_FOUND: 'amendment',
  ORDER_NOT_FOUND: 'order',
  PROGRESS_RECORD_NOT_FOUND: 'progressRecord',
};

// ============================================================================
// メイン関数
// ============================================================================

/** エラーが見つからない種別（ApiError の 404）かどうか */
export function isExecutionBudgetNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 404 でなければ null（呼び出し元は従来の文言を表示する）
 * - 汎用の 404（`NOT_FOUND`）は呼び出し元が渡す経路の対象の文言
 * - 本体の 404 の符号はその符号の対象の文言
 * - 符号の無い 404 は実行予算の文言（この関数を通す操作の経路が符号を付けずに手で組み立てる
 *   404 の本文は、いずれも実行予算の不在である。発注の取得の符号の無い 404 は発注詳細の画面の
 *   読み込みだけが受け、この関数を通さず発注の不在の表示にする）
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param routeTarget - 汎用の 404 のときに見つからない対象（経路が指す対象）
 * @returns 見つからない旨のメッセージ。404 でなければ null
 */
export function getExecutionBudgetNotFoundMessage(
  error: unknown,
  routeTarget: ExecutionBudgetNotFoundTarget
): string | null {
  if (!isExecutionBudgetNotFoundError(error)) {
    return null;
  }
  const code = getApiErrorCode(error);
  if (code === GENERIC_NOT_FOUND_CODE) {
    return NOT_FOUND_MESSAGES[routeTarget];
  }
  if (code === null) {
    return EXECUTION_BUDGET_NOT_FOUND_MESSAGE;
  }
  return NOT_FOUND_MESSAGES[BODY_NOT_FOUND_TARGETS[code] ?? routeTarget];
}

/**
 * 実行予算の取得が 404（`getExecutionBudget` が null）だったときに案件を取得し、実行予算の未作成と
 * 案件の不在を見分ける
 *
 * 実行予算の取得の 404 は、案件が範囲内で実行予算が未作成のときと、案件の不在・範囲外のときの両方で返る。
 * 案件の取得の 404 は範囲外と不在が同じ応答であり、見分けの結果も区別しない。実行予算・変更契約の反映・
 * 出来高入力の画面がこの一か所の処理を使う。
 *
 * @param projectId - 経路のプロジェクト ID
 */
export async function resolveMissingExecutionBudget(
  projectId: string
): Promise<MissingExecutionBudgetResolution> {
  try {
    await getProject(projectId);
    return 'budgetNotCreated';
  } catch (error) {
    return isExecutionBudgetNotFoundError(error) ? 'projectNotFound' : 'projectLoadFailed';
  }
}
