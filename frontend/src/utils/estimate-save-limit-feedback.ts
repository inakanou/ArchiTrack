/**
 * @fileoverview 見積明細の一括保存が上限を超えて拒まれたことを利用者へ伝える文言の組み立て
 *
 * Task 68.1（estimate-creation の Requirement 42.13）
 *
 * 一括保存（`PUT /api/estimates/:id/save`）の本文が次の上限を超えると、要求全体が拒まれる。
 * - 見積項目の総数の上限（Requirement 42.10）と階層の深さの上限（Requirement 42.12）: 422
 *   （`ESTIMATE_DRAFT_VALIDATION_ERROR`、`details.issues` の問題の `path` が `items`）
 * - 見積項目行の備考の文字数の上限（Requirement 42.11）: 本文の検証の 400
 *   （`VALIDATION_ERROR`、`details` の問題の `path` が `items.<i>(.children.<j>)*.lines.<k>.remarks`、
 *   `code` が `too_big`）
 *
 * 件数・深さ・備考を減らさない限り何度保存しても成功しないため、見積書詳細画面
 * （`pages/EstimateDetailPage.tsx` の `toSaveErrorMessage`）は 422 の要約の文言や再操作を促す
 * 汎用の文言でなく、超えた上限のメッセージを表示する。
 *
 * 判定は応答の本文の `code` と問題の `path`（備考は Zod の問題の種別 `code` も）の組で行い、
 * メッセージの文字列では判定しない（件数と深さの区別も文字列でしない）。上限の値は画面に持たず、
 * 応答の `message` をそのまま使う。`path` は完全一致で見る。前方一致にすると、属さない ID の
 * `items.<uuid>`、仮 ID の解決の失敗の `items.<tempId>`、構造の検証の `items.<i>...` を
 * 上限の超過と取り違える。
 */

import { ApiError } from '../api/client';

/** 件数・深さの上限の 422 の応答の本文のコード */
const DRAFT_VALIDATION_ERROR_CODE = 'ESTIMATE_DRAFT_VALIDATION_ERROR';

/** 本文の検証の 400 の応答の本文のコード */
const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/** 件数・深さの上限の問題箇所（完全一致） */
const ITEM_TREE_LIMIT_PATH = 'items';

/** 備考の文字数の上限の問題箇所（子孫の節点を含む。完全一致） */
const REMARKS_PATH_PATTERN = /^items\.\d+(\.children\.\d+)*\.lines\.\d+\.remarks$/;

/** 応答の本文をオブジェクトとして読む（配列・null・プリミティブは null） */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** 422 の本文から、件数・深さの上限の問題のメッセージを応答の順に取り出す */
function itemTreeLimitMessages(body: Record<string, unknown>): string[] {
  if (body.code !== DRAFT_VALIDATION_ERROR_CODE) {
    return [];
  }
  const issues = asRecord(body.details)?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }
  const messages: string[] = [];
  for (const entry of issues) {
    const issue = asRecord(entry);
    if (issue?.path === ITEM_TREE_LIMIT_PATH && typeof issue.message === 'string') {
      messages.push(issue.message);
    }
  }
  return messages;
}

/** 400 の本文から、備考の文字数の上限の問題のメッセージを応答の順に取り出す */
function remarksLimitMessages(body: Record<string, unknown>): string[] {
  if (body.code !== VALIDATION_ERROR_CODE || !Array.isArray(body.details)) {
    return [];
  }
  const messages: string[] = [];
  for (const entry of body.details) {
    const issue = asRecord(entry);
    if (
      issue !== null &&
      typeof issue.path === 'string' &&
      REMARKS_PATH_PATTERN.test(issue.path) &&
      issue.code === 'too_big' &&
      typeof issue.message === 'string'
    ) {
      messages.push(issue.message);
    }
  }
  return messages;
}

/**
 * 保存の失敗のうち、上限（Requirement 42.10〜42.12）の超過による 422 と 400 を上限のメッセージへ書き分ける
 *
 * @param error - 一括保存（`saveEstimateDraft`）が投げた例外
 * @returns 「保存できません: 」に当たった問題のメッセージを重複なく応答の順に「、」で続けた文言。
 *   上限の超過でなければ null（呼び出し側の従来の書き分けと汎用の文言へ委ねる）
 */
export function describeEstimateSaveLimitFailure(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const body = asRecord(error.response);
  if (body === null) {
    return null;
  }

  let found: string[];
  if (error.statusCode === 422) {
    found = itemTreeLimitMessages(body);
  } else if (error.statusCode === 400) {
    found = remarksLimitMessages(body);
  } else {
    return null;
  }

  const messages = [...new Set(found)];
  if (messages.length === 0) {
    return null;
  }
  return `保存できません: ${messages.join('、')}`;
}
