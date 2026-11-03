/**
 * @fileoverview 工程表の画面の 404 の分類
 *
 * Task 24.1: 工程表の画面が 404 を受けたときの不在の表示
 *
 * Requirements (construction-schedule):
 * - 14.1: 画面の読み込みの 404 を見つからない種別に分類し、画面は見つからない旨を表示する
 * - 14.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 *
 * 404 は閲覧範囲外と不在で同じ応答（汎用の `NOT_FOUND`）であり、画面も区別しない。
 * 範囲外を示唆する文言は出さない。再試行で解けないため、呼び出し元は再試行の釦を出さない。
 * 応答の本文（`detail`）は表示しない（汎用の 404 では英語の文言であるため）。
 *
 * @module utils/scheduleNotFound
 */

import { ApiError } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 404 を受けたときに見つからない対象
 *
 * - schedule: 工程表の詳細の読み込み・一括保存・削除・出力
 * - project: 一覧の画面と新規作成の画面の読み込み、工程表の作成（汎用の 404 は経路のプロジェクトの
 *   不在〔範囲外を含む〕）
 */
export type ScheduleNotFoundTarget = 'schedule' | 'project';

// ============================================================================
// 定数
// ============================================================================

/** 工程表が見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const SCHEDULE_NOT_FOUND_MESSAGE =
  '工程表が見つかりません。存在しないか、削除されています。';

/** プロジェクトが見つからない（404）ときのメッセージ。共通部品 ResourceNotFound の見出しと説明の文の形 */
export const PROJECT_NOT_FOUND_MESSAGE =
  'プロジェクトが見つかりません。存在しないか、削除されています。';

const NOT_FOUND_MESSAGES: Record<ScheduleNotFoundTarget, string> = {
  schedule: SCHEDULE_NOT_FOUND_MESSAGE,
  project: PROJECT_NOT_FOUND_MESSAGE,
};

// ============================================================================
// メイン関数
// ============================================================================

/**
 * エラーが 404（見つからない）かどうか
 *
 * 汎用の `NOT_FOUND`（閲覧範囲外と不在）と、範囲内の利用者に届く工程表の不在
 * （`SCHEDULE_NOT_FOUND`）の両方を含む。
 */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * 素の fetch の応答が 404（見つからない）かどうか
 *
 * 出力のダイアログは ApiClient を通さず素の fetch で応答を読むため、状態で判定する。
 * 本文を読まずに判定する（本文が JSON でない 404 も見つからない種別とする）。
 */
export function isNotFoundResponse(response: Pick<Response, 'status'>): boolean {
  return response.status === 404;
}

/**
 * 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 *
 * - 404 以外は null（呼び出し元は従来の文言を表示する）
 * - 404 は、応答の本文によらず呼び出し元が渡す対象の固定の文言
 *
 * @param error - キャッチしたエラーオブジェクト
 * @param target - 見つからない対象
 * @returns 見つからない旨のメッセージ。404 でなければ null
 */
export function getScheduleNotFoundMessage(
  error: unknown,
  target: ScheduleNotFoundTarget
): string | null {
  if (!isNotFoundError(error)) {
    return null;
  }
  return NOT_FOUND_MESSAGES[target];
}
