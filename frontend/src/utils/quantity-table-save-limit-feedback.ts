/**
 * @fileoverview 数量表の保存が件数の上限を超えて拒まれたことを利用者へ伝える文言の組み立て
 *
 * Task 109.1（quantity-table-generation の Requirement 42.12）
 *
 * 保存（`PUT /api/quantity-tables/:id/save`）の本文が件数の上限（Requirement 42.11。数量グループの数、
 * 一つの数量グループの数量項目の数、数量項目の総数）を超えると、経路の本文の検証の 400 になる。
 * 件数を減らさない限り何度保存しても成功しないため、数量表編集画面（`pages/QuantityTableEditPage.tsx`）は
 * 再操作を促す汎用の文言でなく、超えた上限のメッセージを表示する。
 *
 * 判定は応答の本文の `code` と `details` の `path`・`code`（Zod の問題の種別）の組で行い、
 * メッセージの文字列では判定しない（文言を変えたときに判定が外れるため）。上限の値は画面に持たず、
 * 応答の `message` をそのまま使う。`path` は完全一致で見る。前方一致にすると、42.13 の
 * `groups.<i>.items.<j>.tempId` の `too_big` を件数の上限と取り違える。
 */

import { ApiError } from '../api/client';

/** 一つの数量グループの数量項目の数の上限の問題箇所（`groups.<数字>.items` と完全一致） */
const GROUP_ITEMS_PATH_PATTERN = /^groups\.\d+\.items$/;

/** 本文の検証の問題（`validate` の `details` の要素）が件数の上限の超過かどうか */
function isSaveLimitIssue(path: unknown, code: unknown): boolean {
  if (path === 'groups') {
    // 数量グループの数（too_big）と数量項目の総数（superRefine の custom）
    return code === 'too_big' || code === 'custom';
  }
  return typeof path === 'string' && GROUP_ITEMS_PATH_PATTERN.test(path) && code === 'too_big';
}

/**
 * 保存の失敗のうち、件数の上限（Requirement 42.11）の超過による 400 を上限のメッセージへ書き分ける
 *
 * @param error - 保存（`saveQuantityTableDraft`）が投げた例外
 * @returns 「保存できません: 」に当たった問題のメッセージを重複なく `details` の順に「、」で続けた文言。
 *   件数の上限の超過でなければ null（呼び出し側の従来の書き分けと汎用の文言へ委ねる）
 */
export function describeQuantityTableSaveLimitFailure(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.statusCode !== 400) {
    return null;
  }
  const body = error.response;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const { code, details } = body as Record<string, unknown>;
  if (code !== 'VALIDATION_ERROR' || !Array.isArray(details)) {
    return null;
  }

  const messages: string[] = [];
  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) {
      continue;
    }
    const issue = detail as Record<string, unknown>;
    if (!isSaveLimitIssue(issue.path, issue.code) || typeof issue.message !== 'string') {
      continue;
    }
    if (!messages.includes(issue.message)) {
      messages.push(issue.message);
    }
  }
  if (messages.length === 0) {
    return null;
  }
  return `保存できません: ${messages.join('、')}`;
}
