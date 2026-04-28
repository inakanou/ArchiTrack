/**
 * @fileoverview 実行予算管理 - 実行予算の削除 E2Eテスト
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-2.1: 実行予算の削除操作で削除確認ダイアログを表示する
 * @requirement execution-budget-management/REQ-2.3: 発注済みの発注が存在する場合、削除を阻止しエラーメッセージを表示する
 *
 * Note: REQ-2.2 (論理削除) は C 区分対象外。
 *
 * @module e2e/specs/execution-budget/execution-budget-deletion-e2e.spec
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

test.describe('実行予算管理 - 実行予算の削除', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let projectWithOrderedId = '';
  let tradingPartnerId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：APIトークンと削除テスト用データを作成する', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token);
    tradingPartnerId = partner.id;

    // 削除確認ダイアログテスト用：実行予算ありの単純なプロジェクト
    projectId = await createTestProject(request, token, 'E2E実行予算_削除');
    const estimateId = await createTestEstimate(request, token, projectId);
    await createEstimateItem(request, token, estimateId, {
      name: '削除テスト項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 50000,
      executionUnitPrice: 40000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 発注済み存在テスト用プロジェクト
    projectWithOrderedId = await createTestProject(request, token, 'E2E実行予算_発注済削除');
    const estimateId2 = await createTestEstimate(request, token, projectWithOrderedId);
    await createEstimateItem(request, token, estimateId2, {
      name: '発注テスト項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 80000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    const contractId2 = await createTestContract(request, token, projectWithOrderedId, estimateId2);
    await createTestExecutionBudget(request, token, projectWithOrderedId, contractId2);

    // 発注を作成し、項目をチェックして発注済みにする
    const order = await createTestOrder(request, token, projectWithOrderedId, partner.id);

    // 実行予算項目IDを取得
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectWithOrderedId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as { items: Array<{ id: string }> };
    expect(budget.items.length).toBeGreaterThan(0);

    // 項目をチェック
    const itemId = budget.items[0]?.id as string;
    await updateOrderItems(request, token, projectWithOrderedId, order.id, [itemId]);

    // ステータスを発注済へ
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectWithOrderedId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '80000' },
      }
    );
    expect(statusRes.status()).toBe(200);
  });

  // ============================================================================
  // REQ-2.1: 削除確認ダイアログ
  // ============================================================================

  test('削除操作で削除確認ダイアログが表示される (execution-budget-management/REQ-2.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 削除ボタンをクリック
    const deleteButton = page.getByRole('button', { name: '削除', exact: true });
    await expect(deleteButton).toBeVisible({ timeout: getTimeout(15000) });
    await deleteButton.click();

    // 削除確認ダイアログが表示される
    const dialog = page.getByRole('dialog', { name: '削除確認' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByText(/実行予算の削除|削除してもよろしいですか/)).toBeVisible();

    // ダイアログ内に「キャンセル」「削除する」ボタンが存在
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '削除する' })).toBeVisible();

    // キャンセルでダイアログを閉じる（テストデータを残す）
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(5000) });
  });

  // ============================================================================
  // REQ-2.3: 発注済みがある場合は削除を阻止
  // ============================================================================

  test('発注済みの発注がある実行予算は削除を阻止する (execution-budget-management/REQ-2.3)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectWithOrderedId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 削除ボタンをクリック → ダイアログを開く → 削除実行
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '削除確認' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${projectWithOrderedId}/execution-budget`) &&
        response.request().method() === 'DELETE',
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '削除する' }).click();
    const response = await deleteResponse;

    // 422 で削除が阻止される
    expect(response.status()).toBe(422);

    // エラーメッセージが表示される
    await expect(dialog.getByText(/発注済|削除できません|削除できない/)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // API レベルでも 422 が返ることを直接確認
    const apiRes = await request.delete(
      `${API_BASE_URL}/api/projects/${projectWithOrderedId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    expect(apiRes.status()).toBe(422);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (projectWithOrderedId) await deleteProject(request, token, projectWithOrderedId);
    if (tradingPartnerId) await deleteTradingPartner(request, token, tradingPartnerId);
  });
});
