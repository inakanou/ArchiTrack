/**
 * @fileoverview 数量表編集画面のE2E操作ヘルパー
 *
 * REQ-42（明示保存モデル）移行に伴う共通ヘルパー。
 * 編集操作（グループ/項目の追加・削除・コピー・並び替え・名称・写真紐づけ・
 * 一括生成）はクライアントドラフトのみを更新し、永続化は「保存」ボタン押下時の
 * PUT /api/quantity-tables/:id/save でのみ行われる（REQ-42.5/42.6/42.7）。
 *
 * 既存E2Eは「操作即時反映」を前提としていたため、サーバー反映（リロード後の検証）
 * の前に本ヘルパーで明示保存を挟む必要がある。
 *
 * @module e2e/helpers/quantity-table-actions
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/**
 * 数量表編集画面の「保存」ボタンを押下し、保存（PUT /:id/save）の成功を待機する。
 *
 * REQ-42.5: 編集ドラフトの全状態を1回の PUT で確定する。
 * REQ-42.8: 成功時は「保存しました」インジケーターが表示される。
 *
 * @param page - Playwright のページオブジェクト
 * @param options.expectedStatus - 期待する保存 API のステータス（既定 200）
 */
export async function saveQuantityTableDraft(
  page: Page,
  options?: { expectedStatus?: number }
): Promise<void> {
  const expectedStatus = options?.expectedStatus ?? 200;

  const saveButton = page.getByRole('button', { name: '保存' });
  await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });

  // 保存 API（PUT /api/quantity-tables/:id/save）の完了を待機する。
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/quantity-tables\/[^/]+\/save$/.test(response.url()) &&
      response.request().method() === 'PUT' &&
      response.status() === expectedStatus,
    { timeout: getTimeout(30000) }
  );

  await saveButton.click();
  await saveResponsePromise;

  if (expectedStatus === 200) {
    // REQ-42.8: 保存完了インジケーターが表示される（「保存中...」→「保存しました」）
    await expect(page.getByText(/保存しました/).first()).toBeVisible({
      timeout: getTimeout(10000),
    });
  }
}
