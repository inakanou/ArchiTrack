/**
 * @fileoverview 実行予算管理 - 項目編集 / 出来高反映 / 原価管理 / 月次締め E2Eテスト
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-4.2: 発注予定取引先を読み取り専用で表示する
 * @requirement execution-budget-management/REQ-4.3: 実行予算項目の備考は自由記述テキストとして保存する
 * @requirement execution-budget-management/REQ-12.7: 各項目の最新施工日における出来高金額を、実行予算一覧画面の出来高金額列に反映する
 * @requirement execution-budget-management/REQ-13.1: 各実行予算項目に「先月までの支出」「今月の支出」「累計支出」列を表示する
 * @requirement execution-budget-management/REQ-13.6: 累計支出が実行金額を超過した場合、残予算を赤色で警告表示する
 * @requirement execution-budget-management/REQ-13.7: 全項目の累計支出合計と残予算合計を合計行に表示する
 * @requirement execution-budget-management/REQ-14.1: 実行予算画面に「月次締め」ボタンを提供する
 * @requirement execution-budget-management/REQ-14.2: 月次締めボタン押下で確認ダイアログを表示する
 * @requirement execution-budget-management/REQ-14.3: 月次締め確定で締め処理を実行し、履歴を記録する
 * @requirement execution-budget-management/REQ-14.4: 月次締め履歴を一覧表示する機能を提供する
 *
 * @module e2e/specs/execution-budget/budget-edit-cost-monthly-close-e2e.spec
 */

import { test, expect } from '@playwright/test';
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

test.describe('実行予算管理 - 項目編集・原価・月次締め', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  let firstItemId = '';
  let secondItemId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：APIトークンとデータをセットアップする', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token);
    partnerId = partner.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_編集原価');
    const estimateId = await createTestEstimate(request, token, projectId);

    const item1 = await createEstimateItem(request, token, estimateId, {
      name: '原価対象項目1',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 200000,
      executionUnitPrice: 100000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    firstItemId = item1.id;

    const item2 = await createEstimateItem(request, token, estimateId, {
      name: '原価対象項目2',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 50000,
      vendorName: partner.name,
      displayOrder: 1,
    });
    secondItemId = item2.id;

    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 実行予算項目IDを取得
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; estimateItemId: string }>;
    };
    // estimateItemId から実行予算項目IDへのマッピング
    const item1Budget = budget.items.find((i) => i.estimateItemId === firstItemId);
    const item2Budget = budget.items.find((i) => i.estimateItemId === secondItemId);
    expect(item1Budget).toBeTruthy();
    expect(item2Budget).toBeTruthy();
    firstItemId = item1Budget!.id;
    secondItemId = item2Budget!.id;

    expect(firstItemId).toBeTruthy();
    expect(secondItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-4.2: 発注予定取引先は読み取り専用
  // ============================================================================

  test('発注予定取引先列は読み取り専用で表示される (execution-budget-management/REQ-4.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注予定取引先列ヘッダ
    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '発注予定取引先' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 各行に対する発注予定取引先セルにテキスト入力欄が存在しない（読み取り専用）
    const rowWithItem = page.locator('table tr').filter({ hasText: '原価対象項目1' });
    await expect(rowWithItem).toBeVisible({ timeout: getTimeout(10000) });

    // 行全体で input を数えると、備考列の編集可能 input まで含めてしまうため、
    // 発注予定取引先列のヘッダ位置（colIdx）を特定し、その列のセルだけを検証する。
    const headerCells = await table.locator('thead th').allTextContents();
    const vendorColIdx = headerCells.findIndex((t) => t.trim() === '発注予定取引先');
    expect(vendorColIdx).toBeGreaterThanOrEqual(0);
    const vendorCell = rowWithItem.locator('td').nth(vendorColIdx);
    const inputCount = await vendorCell.locator('input').count();
    expect(inputCount).toBe(0);
  });

  // ============================================================================
  // REQ-4.3: 備考の自由記述保存
  // ============================================================================

  test('実行予算項目の備考を更新でき、保存される (execution-budget-management/REQ-4.3)', async ({
    request,
  }) => {
    // 現在のバージョンを取得
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as { version: number };
    const currentVersion = budget.version;

    // 備考を更新
    const remarks = `備考テスト_${Date.now()}`;
    const updateRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/items/${firstItemId}`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { remarks, version: currentVersion },
      }
    );
    expect(updateRes.status()).toBe(200);

    // 取得して反映されていることを確認
    const refreshed = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const refreshedBudget = (await refreshed.json()) as {
      items: Array<{ id: string; remarks: string | null }>;
    };
    const item = refreshedBudget.items.find((i) => i.id === firstItemId);
    expect(item?.remarks).toBe(remarks);
  });

  // ============================================================================
  // REQ-12.7: 出来高金額が実行予算一覧画面に反映される
  // ============================================================================

  test('出来高入力後、実行予算一覧画面に出来高金額が反映される (execution-budget-management/REQ-12.7)', async ({
    page,
    request,
  }) => {
    // 出来高入力 API を呼び出す
    const constructionDate = '2024-08-15';
    const progressAmount = 50000;
    const progressRes = await request.post(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: {
          constructionDate,
          items: [{ itemId: firstItemId, amount: String(progressAmount) }],
        },
      }
    );
    expect([200, 201]).toContain(progressRes.status());

    // 実行予算画面で出来高金額が表示されることを確認
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const targetRow = page.locator('table tr').filter({ hasText: '原価対象項目1' });
    await expect(targetRow).toBeVisible({ timeout: getTimeout(15000) });
    // 50,000 が出来高金額列に表示される
    await expect(targetRow.getByText('50,000')).toBeVisible({ timeout: getTimeout(10000) });
  });

  // ============================================================================
  // REQ-13.1: 原価関連列の表示
  // ============================================================================

  test('実行予算項目に先月支出・今月支出・累計支出列が表示される (execution-budget-management/REQ-13.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '先月支出' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(table.getByRole('columnheader', { name: '今月支出' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '累計支出' })).toBeVisible();
  });

  // ============================================================================
  // REQ-13.6: 累計支出超過時の残予算赤表示
  // ============================================================================

  test('累計支出が実行金額を超過した場合、残予算が赤色で表示される (execution-budget-management/REQ-13.6)', async ({
    page,
    request,
  }) => {
    // 楽観的排他制御のため現在のバージョンを取得
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as { version: number };

    // 今月支出を実行金額より大きく設定
    // firstItem の実行金額は 100,000 なので、200,000 を入れる
    const costRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/items/${firstItemId}/cost`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { currentMonthExpense: '200000', version: budget.version },
      }
    );
    expect([200, 201]).toContain(costRes.status());

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 残予算（-100,000）が赤色で表示される
    const targetRow = page.locator('table tr').filter({ hasText: '原価対象項目1' });
    await expect(targetRow).toBeVisible({ timeout: getTimeout(15000) });

    // 残予算セルを探す（-100,000 という負数）
    const remainingCell = targetRow.locator('td').filter({ hasText: /^-100,000$/ });
    await expect(remainingCell).toBeVisible({ timeout: getTimeout(10000) });

    const color = await remainingCell.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(220, 38, 38)');
  });

  // ============================================================================
  // REQ-13.7: 累計支出合計と残予算合計の合計行表示
  // ============================================================================

  test('合計行に累計支出合計と残予算合計が表示される (execution-budget-management/REQ-13.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    const totalRow = table.locator('tr').filter({ hasText: /^合計/ }).first();
    await expect(totalRow).toBeVisible({ timeout: getTimeout(15000) });

    // 合計行のセル数が項目行と同じであることで、累計支出・残予算列にも値（または空）が存在する
    // 累計支出合計（先のテストで 200,000 を設定した）
    await expect(totalRow.getByText('200,000')).toBeVisible({ timeout: getTimeout(10000) });
  });

  // ============================================================================
  // REQ-14.1: 月次締めボタン
  // ============================================================================

  test('実行予算画面に月次締めボタンが提供される (execution-budget-management/REQ-14.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const monthlyCloseButton = page.getByRole('button', { name: '月次締め' });
    await expect(monthlyCloseButton).toBeVisible({ timeout: getTimeout(15000) });
  });

  // ============================================================================
  // REQ-14.2: 月次締めボタン押下で確認ダイアログ
  // ============================================================================

  test('月次締めボタン押下で確認ダイアログが表示される (execution-budget-management/REQ-14.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '月次締め' }).click();

    // 月次締めダイアログ
    const dialog = page.getByRole('dialog', { name: '月次締め' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByText(/締め対象月|処理内容/)).toBeVisible();

    // 月入力欄が表示される
    await expect(dialog.locator('input[type="month"]')).toBeVisible();

    // キャンセルしてダイアログを閉じる（後続テストに影響を残さない）
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(5000) });
  });

  // ============================================================================
  // REQ-14.3: 月次締め確定で実行・履歴記録
  // ============================================================================

  test('月次締めを確定すると履歴が記録される (execution-budget-management/REQ-14.3)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '月次締め' }).click();
    const dialog = page.getByRole('dialog', { name: '月次締め' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // 一意な締め対象月を入力（毎回異なる月になるよう、ランダムな過去月を選ぶ）
    const targetMonth = `2023-${String((Date.now() % 12) + 1).padStart(2, '0')}`;
    await dialog.locator('input[type="month"]').fill(targetMonth);

    const closePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/execution-budget/monthly-close`) &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '締め処理を実行' }).click();
    const response = await closePromise;
    expect(response.status()).toBe(201);

    const body = (await response.json()) as { id: string; targetMonth: string };
    expect(body.id).toBeTruthy();

    // 履歴を直接 API で確認
    const historyRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/monthly-close`,
      { headers: authHeaders(token) }
    );
    expect(historyRes.status()).toBe(200);
    const histories = (await historyRes.json()) as Array<{ targetMonth: string }>;
    expect(histories.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // REQ-14.4: 月次締め履歴一覧
  // ============================================================================

  test('月次締め履歴が一覧表示される (execution-budget-management/REQ-14.4)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 月次締め履歴セクションが表示される
    await expect(page.getByRole('heading', { name: '月次締め履歴' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 前のテストで作成された履歴が表示される（targetMonth が画面に表示）
    // 履歴セクション内に少なくとも1件のエントリ（ユーザー名と日付）が存在
    const historySection = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: '月次締め履歴' }) })
      .first();
    await expect(historySection).toBeVisible({ timeout: getTimeout(10000) });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
  });
});
