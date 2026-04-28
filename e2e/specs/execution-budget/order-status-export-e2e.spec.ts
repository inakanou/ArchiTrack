/**
 * @fileoverview 実行予算管理 - 発注ステータスの実行予算反映 / 発注エクスポート E2Eテスト
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-9.1: 発注済み項目の発注ステータス列に「発注済」アイコンを表示する
 * @requirement execution-budget-management/REQ-9.2: 発注済み項目の発注金額列に案分された発注金額を表示する
 * @requirement execution-budget-management/REQ-9.3: 未発注項目の発注金額列を空欄として表示する
 * @requirement execution-budget-management/REQ-10.1: Excel出力でチェック済み項目一覧と合計金額を出力する
 * @requirement execution-budget-management/REQ-10.2: PDF出力でチェック済み項目一覧と合計金額を出力する
 *
 * @module e2e/specs/execution-budget/order-status-export-e2e.spec
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
  createTestOrder,
  updateOrderItems,
  deleteProject,
  deleteTradingPartner,
} from './helpers';

test.describe('実行予算管理 - 発注ステータス反映 / エクスポート', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  let orderedItemId = '';
  let unorderedItemId = '';
  let orderId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：APIトークンとデータをセットアップする', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token);
    partnerId = partner.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_発注反映');
    const estimateId = await createTestEstimate(request, token, projectId);

    // 発注対象項目
    const orderedItem = await createEstimateItem(request, token, estimateId, {
      name: '発注済み対象項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 200000,
      executionUnitPrice: 180000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    orderedItemId = orderedItem.id;

    // 未発注項目
    const unorderedItem = await createEstimateItem(request, token, estimateId, {
      name: '未発注項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 80000,
      displayOrder: 1,
    });
    unorderedItemId = unorderedItem.id;

    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 実行予算項目IDへ置き換え
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; estimateItemId: string | null }>;
    };
    const orderedBudgetItem = budget.items.find((i) => i.estimateItemId === orderedItem.id);
    const unorderedBudgetItem = budget.items.find((i) => i.estimateItemId === unorderedItem.id);
    expect(orderedBudgetItem).toBeTruthy();
    expect(unorderedBudgetItem).toBeTruthy();
    orderedItemId = orderedBudgetItem!.id;
    unorderedItemId = unorderedBudgetItem!.id;

    // 発注作成・項目チェック・発注済へ
    const order = await createTestOrder(request, token, projectId, partnerId);
    orderId = order.id;
    await updateOrderItems(request, token, projectId, orderId, [orderedItemId]);
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${orderId}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '180000' },
      }
    );
    expect(statusRes.status()).toBe(200);

    expect(orderedItemId).toBeTruthy();
    expect(unorderedItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-9.1: 発注済みアイコン表示
  // ============================================================================

  test('実行予算画面で発注済み項目に「発注済」表示がされる (execution-budget-management/REQ-9.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注済み項目の行に「発注済」のステータスバッジが表示される
    const orderedRow = page.locator('table tr').filter({ hasText: '発注済み対象項目' });
    await expect(orderedRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(orderedRow.getByText('発注済')).toBeVisible();
  });

  // ============================================================================
  // REQ-9.2: 発注金額列に案分された金額を表示
  // ============================================================================

  test('発注済み項目の発注金額列に案分された金額が表示される (execution-budget-management/REQ-9.2)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注済み項目の行に発注金額が表示される
    const orderedRow = page.locator('table tr').filter({ hasText: '発注済み対象項目' });
    await expect(orderedRow).toBeVisible({ timeout: getTimeout(15000) });

    // 確定発注金額 180,000 がそのまま発注金額として案分される
    await expect(orderedRow.getByText('180,000')).toBeVisible({ timeout: getTimeout(10000) });

    // API でも item.orderAmount が設定されていることを確認
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; orderAmount: string | null }>;
    };
    const orderedItem = budget.items.find((i) => i.id === orderedItemId);
    expect(orderedItem).toBeTruthy();
    expect(orderedItem?.orderAmount).not.toBeNull();
  });

  // ============================================================================
  // REQ-9.3: 未発注項目の発注金額列は空欄
  // ============================================================================

  test('未発注項目の発注金額列が空欄として表示される (execution-budget-management/REQ-9.3)', async ({
    request,
  }) => {
    // API で取得して未発注項目の orderAmount が null であることを確認
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    expect(budgetRes.status()).toBe(200);
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; orderAmount: string | null; orderStatus: string | null }>;
    };

    const unorderedItem = budget.items.find((i) => i.id === unorderedItemId);
    expect(unorderedItem).toBeTruthy();
    expect(unorderedItem?.orderAmount).toBeNull();
    expect(unorderedItem?.orderStatus).toBeNull();
  });

  // ============================================================================
  // REQ-10.1: Excel出力
  // ============================================================================

  test('発注のExcel出力でファイルがダウンロードされる (execution-budget-management/REQ-10.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${orderId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const exportButton = page.getByRole('button', { name: 'Excel出力' });
    await expect(exportButton).toBeVisible({ timeout: getTimeout(15000) });

    // Excel エクスポート API のレスポンスを待機
    const exportPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/orders/${orderId}/export`) &&
        response.url().includes('format=xlsx'),
      { timeout: getTimeout(30000) }
    );
    await exportButton.click();
    const response = await exportPromise;
    expect(response.ok()).toBeTruthy();

    // Content-Type に xlsx もしくは spreadsheet が含まれること
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toMatch(/spreadsheet|xlsx|excel|application\/octet-stream/i);
  });

  // ============================================================================
  // REQ-10.2: PDF出力
  // ============================================================================

  test('発注のPDF出力でファイルがダウンロードされる (execution-budget-management/REQ-10.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${orderId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const exportButton = page.getByRole('button', { name: 'PDF出力' });
    await expect(exportButton).toBeVisible({ timeout: getTimeout(15000) });

    const exportPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/orders/${orderId}/export`) &&
        response.url().includes('format=pdf'),
      { timeout: getTimeout(30000) }
    );
    await exportButton.click();
    const response = await exportPromise;
    expect(response.ok()).toBeTruthy();

    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toMatch(/pdf|application\/octet-stream/i);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) {
      // 発注済みなので、まず取消にしてから実行予算削除
      if (orderId) {
        await request.patch(
          `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${orderId}/status`,
          {
            headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
            data: { status: 'CANCELLED' },
          }
        );
      }
      await deleteProject(request, token, projectId);
    }
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
  });
});
