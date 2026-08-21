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
 * ## 期待するステータスを引数で受けない理由（Task 115.127 段6）
 *
 * 以前は `options.expectedStatus` を受け、200 のときだけ REQ-42.8 の完了表示を主張していた。
 * 呼び出し側は 30 箇所すべてが既定（200）であり、200 以外の経路は一度も実行されていない。
 * 「引数によっては何も主張しない補助」は、成功を主張しない保存を静かに許す入口になるため、
 * 成功する保存だけを扱う補助に絞り、完了表示は無条件に主張する。
 * 保存の失敗を検証する場合は、当該テストが応答と画面表示を直接主張すること。
 *
 * @param page - Playwright のページオブジェクト
 */
export async function saveQuantityTableDraft(page: Page): Promise<void> {
  const saveButton = page.getByRole('button', { name: '保存' });
  await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });

  // 保存 API（PUT /api/quantity-tables/:id/save）の完了を待機する。
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/quantity-tables\/[^/]+\/save$/.test(response.url()) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
    { timeout: getTimeout(30000) }
  );

  await saveButton.click();
  await saveResponsePromise;

  // REQ-42.8: 保存完了インジケーターが表示される（「保存中...」→「保存しました」）
  await expect(page.getByText(/保存しました/).first()).toBeVisible({
    timeout: getTimeout(10000),
  });
}
