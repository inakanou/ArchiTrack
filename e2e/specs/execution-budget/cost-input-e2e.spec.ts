/**
 * @fileoverview 実行予算管理 - 今月の支出 入力 / 月次締めによる累積・リセット E2Eテスト
 *
 * REQ-13.3: 月次締めで今月の支出を先月までの支出に累積する
 * REQ-13.4: 月次締め後に今月の支出をリセットする
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-13.3: 月次締めで今月の支出を先月までの支出に累積する
 * @requirement execution-budget-management/REQ-13.4: 月次締め後に今月の支出をリセットする
 *
 * @module e2e/specs/execution-budget/cost-input-e2e.spec
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  authHeaders,
  getApiToken,
  createTestProject,
  createTestEstimate,
  createEstimateItem,
  createTestContract,
  createTestExecutionBudget,
  createTestSubcontractor,
  deleteProject,
  deleteTradingPartner,
} from './helpers';

/**
 * 実行予算項目を取得する（先月支出/今月支出を読み出すため）
 */
async function fetchBudgetItems(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<Array<{ id: string; previousMonthExpense: string; currentMonthExpense: string }>> {
  const res = await request.get(`${API_BASE_URL}/api/projects/${projectId}/execution-budget`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    items: Array<{ id: string; previousMonthExpense: string; currentMonthExpense: string }>;
  };
  return body.items;
}

test.describe('実行予算管理 - 今月の支出入力と月次締めの累積/リセット', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  let firstItemId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：APIトークンとデータをセットアップする', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token);
    partnerId = partner.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_原価入力');
    const estimateId = await createTestEstimate(request, token, projectId);

    const item1 = await createEstimateItem(request, token, estimateId, {
      name: 'コスト入力対象項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 500000,
      executionUnitPrice: 400000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    firstItemId = item1.id;

    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 実行予算項目IDを取得（estimateItemId → executionBudgetItem.id へのマッピング）
    const items = await fetchBudgetItems(request, token, projectId);
    const target = items.find(
      (i) => (i as unknown as { estimateItemId: string }).estimateItemId === firstItemId
    );
    expect(target).toBeTruthy();
    firstItemId = target!.id;

    expect(firstItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-13.3 (前段): 今月の支出を入力 → 累計支出に反映
  // 月次締めで先月までの支出に累積するためには、まず今月の支出を入力できる必要がある。
  // ============================================================================

  test('今月の支出を画面入力 → 保存され、累計支出に反映される (execution-budget-management/REQ-13.3 前段)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 今月の支出 入力欄が表示される
    const costInput = page.getByTestId(`current-month-expense-input-${firstItemId}`);
    await expect(costInput).toBeVisible({ timeout: getTimeout(15000) });
    await expect(costInput).toBeEnabled();

    // 入力値: 80,000 円（実行金額 400,000 を超過しない範囲）
    await costInput.click();
    await costInput.fill('80000');

    // PATCH リクエストの完了を待機
    const patchPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/items/${firstItemId}/cost`) &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );
    // blur で保存
    await costInput.blur();
    const patchResp = await patchPromise;
    expect(patchResp.status()).toBe(200);

    // 再描画後の検証: 行内に「80,000」(今月の支出) と「80,000」(累計支出) が出る
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    const targetRow = page.locator('table tr').filter({ hasText: 'コスト入力対象項目' });
    await expect(targetRow).toBeVisible({ timeout: getTimeout(15000) });

    // 行内に 80,000 が少なくとも2セル分存在する（今月支出 + 累計支出）
    const matched = targetRow.locator('td').filter({ hasText: /^80,000$/ });
    await expect
      .poll(async () => matched.count(), { timeout: getTimeout(10000) })
      .toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // REQ-13.3 / REQ-13.4: 月次締め → 今月支出が先月支出に累積、今月支出は0にリセット
  // ============================================================================

  test('月次締め押下 → 確認ダイアログ → 締め処理で今月支出が先月支出に累積され、今月支出は0にリセットされる (execution-budget-management/REQ-13.3, REQ-13.4)', async ({
    page,
    request,
  }) => {
    // 締め前の状態を取得（先のテストで currentMonthExpense=80000）
    const beforeItems = await fetchBudgetItems(request, token, projectId);
    const before = beforeItems.find((i) => i.id === firstItemId);
    expect(before).toBeTruthy();
    // 累積前の先月までの支出
    const previousBefore = parseInt(before!.previousMonthExpense ?? '0', 10);
    const currentBefore = parseInt(before!.currentMonthExpense ?? '0', 10);
    expect(currentBefore).toBeGreaterThan(0);
    const expectedPreviousAfter = previousBefore + currentBefore;

    // 画面操作で月次締めを実行
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 月次締めボタン押下 → 確認ダイアログ表示 (REQ-14.2 前提)
    await page.getByRole('button', { name: '月次締め' }).click();
    const dialog = page.getByRole('dialog', { name: '月次締め' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // 一意な対象月を生成（既存の月次締め履歴と衝突しないようランダム年月）
    const randomYear = 2020 + (Date.now() % 5);
    const randomMonth = ((Date.now() % 12) + 1).toString().padStart(2, '0');
    const targetMonth = `${randomYear}-${randomMonth}`;
    await dialog.locator('input[type="month"]').fill(targetMonth);

    // POST monthly-close の完了を待機
    const closePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/execution-budget/monthly-close`) &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '締め処理を実行' }).click();
    const closeResp = await closePromise;
    expect(closeResp.status()).toBe(201);

    // 締め後のデータを直接 API から検証
    const afterItems = await fetchBudgetItems(request, token, projectId);
    const after = afterItems.find((i) => i.id === firstItemId);
    expect(after).toBeTruthy();

    const previousAfter = parseInt(after!.previousMonthExpense ?? '0', 10);
    const currentAfter = parseInt(after!.currentMonthExpense ?? '0', 10);

    // REQ-13.3: 今月の支出を先月までの支出に累積する
    expect(previousAfter).toBe(expectedPreviousAfter);
    // REQ-13.4: 今月の支出をリセットする
    expect(currentAfter).toBe(0);

    // 画面側にも反映されている（再取得後）
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    const targetRow = page.locator('table tr').filter({ hasText: 'コスト入力対象項目' });
    await expect(targetRow).toBeVisible({ timeout: getTimeout(15000) });

    // 今月の支出 入力欄の値は空文字または "0"（フォーマット結果）
    const costInput = page.getByTestId(`current-month-expense-input-${firstItemId}`);
    await expect(costInput).toBeVisible({ timeout: getTimeout(15000) });
    const inputValue = await costInput.inputValue();
    // formatAmount は 0 を "0" に変換して表示する
    expect(['0', '']).toContain(inputValue);

    // 先月までの支出列に累積後の金額（80,000）が表示される
    await expect(targetRow.getByText(formatAmountForDisplay(expectedPreviousAfter))).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
  });
});

/**
 * 数値を3桁区切りカンマ付きにフォーマットする（テスト内のアサーション用）
 */
function formatAmountForDisplay(value: number): string {
  return value.toLocaleString('ja-JP');
}
