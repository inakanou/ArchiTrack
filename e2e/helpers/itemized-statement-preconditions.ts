/**
 * @fileoverview 内訳書のE2Eテストが用いる前提条件の補助
 *
 * 内訳書詳細画面のフィルタ入力欄は `ItemizedStatementDetailPage` が
 * 内訳項目を 1 件以上持つときに必ず描画する（`FilterArea`）。
 * したがって「表示されていれば操作する」という関門は不要であり、
 * 前提そのものを無条件に主張してから操作すればよい。
 *
 * @module e2e/helpers/itemized-statement-preconditions
 */

import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { getTimeout } from './wait-helpers';
import { SAME_ORIGIN_API_BASE_URL } from '../config';

/** 内訳書詳細画面がフィルタを提供するカラム (itemized-statement-generation/REQ-6.2) */
export type ItemizedStatementFilterColumn =
  'customCategory' | 'workType' | 'name' | 'specification' | 'unit';

/**
 * 内訳書詳細画面のフィルタ入力欄を、描画されていることを主張したうえで返す。
 *
 * 前提が崩れている場合は、後段の操作や主張ではなくこの時点で失敗する。
 *
 * @param page - Playwrightのページ
 * @param column - フィルタ対象のカラム
 * @returns フィルタ入力欄のロケーター
 */
export async function requireItemizedStatementFilterInput(
  page: Page,
  column: ItemizedStatementFilterColumn
): Promise<Locator> {
  const filterInput = page.locator(`input[id="filter-${column}"]`);
  await expect(
    filterInput,
    `内訳書詳細のフィルタ入力欄が表示されていない: filter-${column}`
  ).toBeVisible({ timeout: getTimeout(10000) });
  return filterInput;
}

/**
 * 内訳書詳細画面のフィルタクリアボタンを、描画されていることを主張したうえで返す。
 *
 * クリアボタンは `FilterArea` の見出しに常に置かれており
 * （`ItemizedStatementDetailPage.tsx` の `FilterArea`）、
 * フィルタ入力欄と同じ条件（内訳項目が1件以上）で必ず描画される。
 * したがって「表示されていればクリックする」という関門は不要である。
 *
 * `aria-label="フィルタをクリア"` を完全一致で指すため、
 * 画面内の他の「クリア」を含むボタンと取り違えることがない。
 *
 * @param page - Playwrightのページ
 * @returns フィルタクリアボタンのロケーター
 */
export async function requireItemizedStatementFilterClearButton(page: Page): Promise<Locator> {
  const clearButton = page.getByRole('button', { name: 'フィルタをクリア' });
  await expect(clearButton, '内訳書詳細のフィルタクリアボタンが表示されていない').toBeVisible({
    timeout: getTimeout(10000),
  });
  return clearButton;
}

/**
 * 内訳書を API で論理削除する（後始末用）
 *
 * `DELETE /api/itemized-statements/:id` は楽観的排他制御の基準時刻（updatedAt）を**本文**で求める
 * （画面の deleteItemizedStatement と同じ。見積依頼・受領見積書のクエリとは異なる）。現在の
 * updatedAt を読み直して送り、204 以外は例外にして後始末の失敗を見逃さない（2026-11-01 の是正まで、
 * 見積依頼の E2E の後始末は基準時刻を送らずに 400 を受け、状態コードを見ていなかったため
 * 内訳書がテスト DB に残っていた。claude-vision-e2e のファイル内の補助をここへ移した）。
 *
 * @param request - 要求のコンテキスト（`request` の fixture・`page.request`・`request.newContext()`）
 * @param token - アクセストークン
 * @param itemizedStatementId - 取り除く内訳書のID
 */
export async function deleteItemizedStatementViaApi(
  request: APIRequestContext,
  token: string,
  itemizedStatementId: string
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const current = await request.get(
    `${SAME_ORIGIN_API_BASE_URL}/api/itemized-statements/${itemizedStatementId}`,
    { headers }
  );
  if (current.status() !== 200) {
    throw new Error(
      `itemized statement read before delete failed: ${current.status()} ${await current.text()}`
    );
  }
  const { updatedAt } = (await current.json()) as { updatedAt: string };
  const res = await request.delete(
    `${SAME_ORIGIN_API_BASE_URL}/api/itemized-statements/${itemizedStatementId}`,
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { updatedAt },
    }
  );
  if (res.status() !== 204) {
    throw new Error(`itemized statement delete failed: ${res.status()} ${await res.text()}`);
  }
}
