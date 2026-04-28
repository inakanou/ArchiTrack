/**
 * @fileoverview 実行予算管理 - 出来高入力 / 出来高履歴 / 月別出来高集計 E2Eテスト
 *
 * Phase 5a 出来高関連 21 件
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-11.1: 出来高入力画面に施工日入力欄と各見積項目の出来高金額入力欄を表示する
 * @requirement execution-budget-management/REQ-11.2: 施工日を入力できる
 * @requirement execution-budget-management/REQ-11.3: 即0%ボタンで出来高金額を0円に設定する
 * @requirement execution-budget-management/REQ-11.4: 即50%ボタンで出来高金額を実行金額の50%に設定する
 * @requirement execution-budget-management/REQ-11.5: 即100%ボタンで出来高金額を実行金額の100%に設定する
 * @requirement execution-budget-management/REQ-11.6: +5%ボタンで出来高金額を実行金額の5%加算する
 * @requirement execution-budget-management/REQ-11.7: -5%ボタンで出来高金額を実行金額の5%減算する
 * @requirement execution-budget-management/REQ-11.8: 出来高金額が0円未満になる操作の場合、0円に制限する
 * @requirement execution-budget-management/REQ-11.9: 出来高金額を直接入力した値をそのまま設定する
 * @requirement execution-budget-management/REQ-11.10: 各項目の出来高率を自動計算して表示する
 * @requirement execution-budget-management/REQ-11.11: 全項目の出来高合計金額と出来高合計率を表示する
 * @requirement execution-budget-management/REQ-12.1: 出来高保存で施工日と各項目の出来高金額を1レコードとして保存する
 * @requirement execution-budget-management/REQ-12.3: 出来高履歴を施工日の降順で一覧表示する
 * @requirement execution-budget-management/REQ-12.4: 過去の出来高レコード選択で当該施工日の出来高入力値を編集画面に読み込む
 * @requirement execution-budget-management/REQ-12.5: 出来高レコードの削除操作で削除確認ダイアログを表示する
 * @requirement execution-budget-management/REQ-12.6: 出来高レコードの削除確定で当該レコードを削除する
 * @requirement execution-budget-management/REQ-16.1: 出来高入力データを月別に集計し、月別出来高一覧画面を提供する
 * @requirement execution-budget-management/REQ-16.2: 月別出来高一覧に対象月・当月出来高金額・累計出来高金額・累計出来高率を表示する
 * @requirement execution-budget-management/REQ-16.3: 特定月選択で当該月の項目別出来高明細を表示する
 * @requirement execution-budget-management/REQ-16.4: 月別出来高データをExcelファイル（.xlsx形式）で出力する機能を提供する
 * @requirement execution-budget-management/REQ-16.5: 月別出来高データをPDFファイルで出力する機能を提供する
 *
 * @module e2e/specs/execution-budget/progress-input-e2e.spec
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
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

// ============================================================================
// 出来高入力ページ専用ヘルパー
// ============================================================================

/**
 * 出来高 API 経由で施工日と項目別金額を保存する
 */
async function saveProgressViaApi(
  request: APIRequestContext,
  token: string,
  projectId: string,
  constructionDate: string,
  items: Array<{ itemId: string; amount: number }>
): Promise<{ id: string }> {
  const res = await request.post(
    `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
    {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: {
        constructionDate,
        items: items.map((i) => ({ itemId: i.itemId, amount: String(i.amount) })),
      },
    }
  );
  if (!res.ok()) {
    throw new Error(`saveProgress failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { id: string };
}

/**
 * 出来高履歴を取得し、特定の施工日に対応するレコードIDを返す
 */
async function getProgressRecordIdByDate(
  request: APIRequestContext,
  token: string,
  projectId: string,
  constructionDate: string
): Promise<string | null> {
  const res = await request.get(
    `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
    { headers: authHeaders(token) }
  );
  if (!res.ok()) return null;
  const list = (await res.json()) as Array<{ id: string; constructionDate: string }>;
  const found = list.find((r) => r.constructionDate.startsWith(constructionDate));
  return found?.id ?? null;
}

/**
 * 出来高履歴を全削除する
 */
async function clearProgressHistory(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<void> {
  const res = await request.get(
    `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
    { headers: authHeaders(token) }
  );
  if (!res.ok()) return;
  const list = (await res.json()) as Array<{ id: string }>;
  for (const r of list) {
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress/${r.id}`,
      { headers: authHeaders(token) }
    );
  }
}

/**
 * 出来高入力ページに遷移して読み込み完了まで待機する
 */
async function gotoProgressInputPage(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/execution-budget/progress`);
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
  // タイトル「出来高入力」が表示されるまで待つ
  await expect(page.getByRole('heading', { name: '出来高入力', exact: true })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

// ============================================================================
// テスト本体
// ============================================================================

test.describe('実行予算管理 - 出来高入力・履歴・月別集計', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  // 実行予算項目ID（leaf 2件分）
  let firstBudgetItemId = '';
  let secondBudgetItemId = '';
  // それぞれの実行金額（円）
  const firstExecutionAmount = 100000; // quantity 1 × 100,000
  const secondExecutionAmount = 200000; // quantity 1 × 200,000
  const totalExecutionAmount = firstExecutionAmount + secondExecutionAmount;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // セットアップ
  // ============================================================================

  test('準備：APIトークンとテストデータを作成する', async ({ request }) => {
    token = await getApiToken(request);
    expect(token).toBeTruthy();

    const partner = await createTestSubcontractor(request, token);
    partnerId = partner.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_出来高');
    const estimateId = await createTestEstimate(request, token, projectId);

    // leaf項目1
    const item1 = await createEstimateItem(request, token, estimateId, {
      name: '出来高項目A',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 150000,
      executionUnitPrice: firstExecutionAmount,
      vendorName: partner.name,
      displayOrder: 0,
    });
    // leaf項目2
    const item2 = await createEstimateItem(request, token, estimateId, {
      name: '出来高項目B',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 250000,
      executionUnitPrice: secondExecutionAmount,
      vendorName: partner.name,
      displayOrder: 1,
    });

    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 実行予算項目IDを取得（estimateItemId → execution-budget-item-id の対応）
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; estimateItemId: string }>;
    };
    const b1 = budget.items.find((i) => i.estimateItemId === item1.id);
    const b2 = budget.items.find((i) => i.estimateItemId === item2.id);
    expect(b1).toBeTruthy();
    expect(b2).toBeTruthy();
    firstBudgetItemId = b1!.id;
    secondBudgetItemId = b2!.id;

    expect(firstBudgetItemId).toBeTruthy();
    expect(secondBudgetItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-11: 出来高入力機能
  // ============================================================================

  test('施工日入力欄と項目別の出来高金額入力欄が表示される (execution-budget-management/REQ-11.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 施工日入力欄
    const dateInput = page.locator('input#construction-date');
    await expect(dateInput).toBeVisible({ timeout: getTimeout(15000) });
    await expect(dateInput).toHaveAttribute('type', 'date');

    // 各項目の出来高金額入力欄（leaf 2件分の数値入力欄が存在する）
    const amountInputs = page.locator('input[type="number"][min="0"]');
    const count = await amountInputs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // 項目名が表示される
    await expect(page.getByText('出来高項目A')).toBeVisible();
    await expect(page.getByText('出来高項目B')).toBeVisible();
  });

  test('施工日を変更できる (execution-budget-management/REQ-11.2)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const dateInput = page.locator('input#construction-date');
    await expect(dateInput).toBeVisible({ timeout: getTimeout(15000) });

    await dateInput.fill('2024-09-15');
    await expect(dateInput).toHaveValue('2024-09-15');
  });

  test('即0%ボタンで出来高金額が0円に設定される (execution-budget-management/REQ-11.3)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // まず項目Aの行を取得
    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    // 直接入力してから 0% を押す
    await amountInput.fill('50000');
    await rowA.getByRole('button', { name: '0%', exact: true }).click();
    await expect(amountInput).toHaveValue('0');
  });

  test('即50%ボタンで出来高金額が実行金額の50%に設定される (execution-budget-management/REQ-11.4)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    await rowA.getByRole('button', { name: '50%', exact: true }).click();
    await expect(amountInput).toHaveValue(String(Math.round(firstExecutionAmount * 0.5)));
  });

  test('即100%ボタンで出来高金額が実行金額の100%に設定される (execution-budget-management/REQ-11.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    await rowA.getByRole('button', { name: '100%', exact: true }).click();
    await expect(amountInput).toHaveValue(String(firstExecutionAmount));
  });

  test('+5%ボタンで実行金額の5%加算される (execution-budget-management/REQ-11.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    // 初期化: 50%
    await rowA.getByRole('button', { name: '50%', exact: true }).click();
    const fiftyValue = Math.round(firstExecutionAmount * 0.5);
    const fivePercent = Math.round(firstExecutionAmount * 0.05);

    await rowA.getByRole('button', { name: '+5%', exact: true }).click();
    await expect(amountInput).toHaveValue(String(fiftyValue + fivePercent));
  });

  test('-5%ボタンで実行金額の5%減算される (execution-budget-management/REQ-11.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    // 初期化: 50%
    await rowA.getByRole('button', { name: '50%', exact: true }).click();
    const fiftyValue = Math.round(firstExecutionAmount * 0.5);
    const fivePercent = Math.round(firstExecutionAmount * 0.05);

    await rowA.getByRole('button', { name: '-5%', exact: true }).click();
    await expect(amountInput).toHaveValue(String(fiftyValue - fivePercent));
  });

  test('出来高金額が0円未満になる操作で0円に制限される (execution-budget-management/REQ-11.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    // 0% にしてから -5% を押す（負数になる操作）
    await rowA.getByRole('button', { name: '0%', exact: true }).click();
    await expect(amountInput).toHaveValue('0');
    await rowA.getByRole('button', { name: '-5%', exact: true }).click();
    // 0 にクランプされる
    await expect(amountInput).toHaveValue('0');
  });

  test('出来高金額の直接入力値がそのまま設定される (execution-budget-management/REQ-11.9)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    await amountInput.fill('33333');
    await expect(amountInput).toHaveValue('33333');
  });

  test('各項目の出来高率が自動計算されて表示される (execution-budget-management/REQ-11.10)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const amountInput = rowA.locator('input[type="number"]');

    // 50% に設定 → 出来高率 50.0% が表示される
    await rowA.getByRole('button', { name: '50%', exact: true }).click();
    await expect(amountInput).toHaveValue(String(Math.round(firstExecutionAmount * 0.5)));
    // 行内に 50.0% が表示される
    await expect(rowA.getByText('50.0%')).toBeVisible({ timeout: getTimeout(5000) });
  });

  test('全項目の出来高合計金額と出来高合計率が表示される (execution-budget-management/REQ-11.11)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 項目Aを 100%、項目Bを 50% に設定
    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const rowB = page.locator('tr').filter({ hasText: '出来高項目B' }).first();
    await rowA.getByRole('button', { name: '100%', exact: true }).click();
    await rowB.getByRole('button', { name: '50%', exact: true }).click();

    const expectedTotal = firstExecutionAmount + Math.round(secondExecutionAmount * 0.5);
    const expectedRate = ((expectedTotal / totalExecutionAmount) * 100).toFixed(1);

    await expect(page.getByTestId('total-amount')).toHaveText(
      expectedTotal.toLocaleString('ja-JP'),
      { timeout: getTimeout(5000) }
    );
    await expect(page.getByTestId('total-rate')).toHaveText(`${expectedRate}%`, {
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // REQ-12: 出来高の履歴管理
  // ============================================================================

  test('出来高保存で施工日と各項目の出来高金額が1レコードとして保存される (execution-budget-management/REQ-12.1)', async ({
    page,
    request,
  }) => {
    // 既存履歴をクリーンアップしてから保存検証
    await clearProgressHistory(request, token, projectId);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 施工日と金額を入力
    const dateInput = page.locator('input#construction-date');
    await dateInput.fill('2024-10-01');

    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const rowB = page.locator('tr').filter({ hasText: '出来高項目B' }).first();
    await rowA.locator('input[type="number"]').fill('40000');
    await rowB.locator('input[type="number"]').fill('80000');

    // 保存
    const savePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/projects/${projectId}/execution-budget/progress`) &&
        res.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存' }).click();
    const saveRes = await savePromise;
    expect([200, 201]).toContain(saveRes.status());

    // API 経由で保存されたレコードを検証
    const listRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
      { headers: authHeaders(token) }
    );
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as Array<{
      id: string;
      constructionDate: string;
      totalAmount: string;
    }>;
    const saved = list.find((r) => r.constructionDate.startsWith('2024-10-01'));
    expect(saved).toBeTruthy();
    expect(parseInt(saved!.totalAmount, 10)).toBe(120000);
  });

  test('出来高履歴が施工日の降順で一覧表示される (execution-budget-management/REQ-12.3)', async ({
    page,
    request,
  }) => {
    // 既存履歴をクリーンアップしてから複数日分作成
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-07-01', [
      { itemId: firstBudgetItemId, amount: 10000 },
      { itemId: secondBudgetItemId, amount: 20000 },
    ]);
    await saveProgressViaApi(request, token, projectId, '2024-08-01', [
      { itemId: firstBudgetItemId, amount: 30000 },
      { itemId: secondBudgetItemId, amount: 40000 },
    ]);
    await saveProgressViaApi(request, token, projectId, '2024-09-01', [
      { itemId: firstBudgetItemId, amount: 50000 },
      { itemId: secondBudgetItemId, amount: 60000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 履歴セクションが表示される
    await expect(page.getByRole('heading', { name: '出来高履歴' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 履歴行（history-row-{id}）を施工日テキストでスキャンし、降順を検証
    const historyRows = page.locator('[data-testid^="history-row-"]');
    const rowCount = await historyRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);

    const dates: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const text = await historyRows.nth(i).locator('td').first().innerText();
      // 表示形式は constructionDate そのまま（YYYY-MM-DD or ISO）→ 先頭10文字を取り出す
      dates.push(text.trim().slice(0, 10));
    }
    // 我々が作成した3つの日付がリストに含まれ、登場順で降順になっている
    const targetDates = ['2024-09-01', '2024-08-01', '2024-07-01'];
    const filtered = dates.filter((d) => targetDates.includes(d));
    expect(filtered).toEqual(targetDates);
  });

  test('過去の出来高レコード選択で当該施工日の出来高入力値が編集画面に読み込まれる (execution-budget-management/REQ-12.4)', async ({
    page,
    request,
  }) => {
    // 既知の値で履歴を整える
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-06-15', [
      { itemId: firstBudgetItemId, amount: 70000 },
      { itemId: secondBudgetItemId, amount: 90000 },
    ]);
    const recordId = await getProgressRecordIdByDate(request, token, projectId, '2024-06-15');
    expect(recordId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 履歴行をクリック
    const historyRow = page.getByTestId(`history-row-${recordId}`);
    await expect(historyRow).toBeVisible({ timeout: getTimeout(15000) });

    // 読み込み API のレスポンスを待ち合わせる
    const loadPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/projects/${projectId}/execution-budget/progress/2024-06-15`) &&
        res.request().method() === 'GET',
      { timeout: getTimeout(15000) }
    );
    await historyRow.click();
    const loadRes = await loadPromise;
    expect(loadRes.ok()).toBeTruthy();

    // 施工日が反映される
    await expect(page.locator('input#construction-date')).toHaveValue('2024-06-15');

    // 各項目の入力欄に保存値が読み込まれる
    const rowA = page.locator('tr').filter({ hasText: '出来高項目A' }).first();
    const rowB = page.locator('tr').filter({ hasText: '出来高項目B' }).first();
    await expect(rowA.locator('input[type="number"]')).toHaveValue('70000');
    await expect(rowB.locator('input[type="number"]')).toHaveValue('90000');
  });

  test('出来高レコードの削除操作で削除確認ダイアログが表示される (execution-budget-management/REQ-12.5)', async ({
    page,
    request,
  }) => {
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-05-10', [
      { itemId: firstBudgetItemId, amount: 11000 },
      { itemId: secondBudgetItemId, amount: 22000 },
    ]);
    const recordId = await getProgressRecordIdByDate(request, token, projectId, '2024-05-10');
    expect(recordId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const historyRow = page.getByTestId(`history-row-${recordId}`);
    await expect(historyRow).toBeVisible({ timeout: getTimeout(15000) });

    // 行内の削除ボタンを押下
    await historyRow.getByRole('button', { name: '削除' }).click();

    // 削除確認ダイアログが表示される
    await expect(page.getByText('出来高レコードを削除しますか？')).toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(page.getByRole('button', { name: '削除する' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'キャンセル' })).toBeVisible();

    // キャンセルでダイアログを閉じてもレコードは残る
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByText('出来高レコードを削除しますか？')).toBeHidden();
    await expect(historyRow).toBeVisible();
  });

  test('出来高レコードの削除確定で当該レコードが削除される (execution-budget-management/REQ-12.6)', async ({
    page,
    request,
  }) => {
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-04-20', [
      { itemId: firstBudgetItemId, amount: 12000 },
      { itemId: secondBudgetItemId, amount: 24000 },
    ]);
    const recordId = await getProgressRecordIdByDate(request, token, projectId, '2024-04-20');
    expect(recordId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const historyRow = page.getByTestId(`history-row-${recordId}`);
    await expect(historyRow).toBeVisible({ timeout: getTimeout(15000) });

    // 削除を確定
    await historyRow.getByRole('button', { name: '削除' }).click();
    const deletePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/projects/${projectId}/execution-budget/progress/${recordId}`) &&
        res.request().method() === 'DELETE',
      { timeout: getTimeout(15000) }
    );
    await page.getByRole('button', { name: '削除する' }).click();
    const deleteRes = await deletePromise;
    expect([200, 204]).toContain(deleteRes.status());

    // UI から行が消える
    await expect(historyRow).toBeHidden({ timeout: getTimeout(10000) });

    // API 上もレコードが消える
    const listRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/progress`,
      { headers: authHeaders(token) }
    );
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.find((r) => r.id === recordId)).toBeUndefined();
  });

  // ============================================================================
  // REQ-16: 月別出来高集計
  // ============================================================================

  test('月別出来高一覧画面が提供される (execution-budget-management/REQ-16.1)', async ({
    page,
    request,
  }) => {
    // 月別出来高が表示できるよう、複数月のデータを用意
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-03-15', [
      { itemId: firstBudgetItemId, amount: 10000 },
      { itemId: secondBudgetItemId, amount: 20000 },
    ]);
    await saveProgressViaApi(request, token, projectId, '2024-04-15', [
      { itemId: firstBudgetItemId, amount: 30000 },
      { itemId: secondBudgetItemId, amount: 40000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    await expect(page.getByRole('heading', { name: '月別出来高集計' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 月別行が1件以上存在
    const monthlyRows = page.locator('[data-testid^="monthly-row-"]');
    expect(await monthlyRows.count()).toBeGreaterThanOrEqual(2);
  });

  test('月別出来高一覧に対象月・当月出来高金額・累計出来高金額・累計出来高率が表示される (execution-budget-management/REQ-16.2)', async ({
    page,
    request,
  }) => {
    // データを用意（既に存在する場合は再利用）
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-02-15', [
      { itemId: firstBudgetItemId, amount: 50000 },
      { itemId: secondBudgetItemId, amount: 50000 },
    ]);
    await saveProgressViaApi(request, token, projectId, '2024-03-15', [
      { itemId: firstBudgetItemId, amount: 80000 },
      { itemId: secondBudgetItemId, amount: 80000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    // 月別出来高集計セクションの見出しを基点にテーブルを特定
    await expect(page.getByRole('heading', { name: '月別出来高集計' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 月別行（2024-02）が表示される
    const feb = page.getByTestId('monthly-row-2024-02');
    await expect(feb).toBeVisible({ timeout: getTimeout(15000) });

    // 月別行を含むテーブルを取得し、列ヘッダを検証
    const monthlyTable = feb.locator('xpath=ancestor::table[1]');
    await expect(monthlyTable.getByRole('columnheader', { name: '対象月' })).toBeVisible();
    await expect(monthlyTable.getByRole('columnheader', { name: '当月出来高金額' })).toBeVisible();
    await expect(monthlyTable.getByRole('columnheader', { name: '累計出来高金額' })).toBeVisible();
    await expect(monthlyTable.getByRole('columnheader', { name: '累計出来高率' })).toBeVisible();

    // 当月: 100,000円が行内に表示される
    await expect(feb.getByText('100,000').first()).toBeVisible();
  });

  test('特定月選択で当該月の項目別出来高明細が表示される (execution-budget-management/REQ-16.3)', async ({
    page,
    request,
  }) => {
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-01-15', [
      { itemId: firstBudgetItemId, amount: 25000 },
      { itemId: secondBudgetItemId, amount: 35000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const janRow = page.getByTestId('monthly-row-2024-01');
    await expect(janRow).toBeVisible({ timeout: getTimeout(15000) });

    const detailPromise = page.waitForResponse(
      (res) =>
        res
          .url()
          .includes(`/api/projects/${projectId}/execution-budget/progress/monthly/2024-01`) &&
        res.request().method() === 'GET',
      { timeout: getTimeout(15000) }
    );
    await janRow.click();
    const detailRes = await detailPromise;
    expect(detailRes.ok()).toBeTruthy();

    // 明細セクション見出し（{月} 項目別出来高明細）
    const detailHeading = page.getByText('2024-01 項目別出来高明細');
    await expect(detailHeading).toBeVisible({ timeout: getTimeout(10000) });

    // 明細セクションのテーブル（h3 の直後）に項目名が表示される
    const detailTable = detailHeading.locator('xpath=following-sibling::table[1]');
    await expect(detailTable).toBeVisible();
    await expect(detailTable.getByText('出来高項目A')).toBeVisible();
    await expect(detailTable.getByText('出来高項目B')).toBeVisible();
  });

  test('月別出来高データをExcelファイルで出力できる (execution-budget-management/REQ-16.4)', async ({
    page,
    request,
  }) => {
    // データを最低1件用意
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-02-20', [
      { itemId: firstBudgetItemId, amount: 10000 },
      { itemId: secondBudgetItemId, amount: 20000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const exportPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/projects/${projectId}/execution-budget/progress/monthly/export`) &&
        res.url().includes('format=xlsx'),
      { timeout: getTimeout(20000) }
    );
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const exportRes = await exportPromise;
    expect(exportRes.ok()).toBeTruthy();
    const contentType = exportRes.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/spreadsheet|xlsx|octet-stream/i);
  });

  test('月別出来高データをPDFファイルで出力できる (execution-budget-management/REQ-16.5)', async ({
    page,
    request,
  }) => {
    await clearProgressHistory(request, token, projectId);
    await saveProgressViaApi(request, token, projectId, '2024-02-25', [
      { itemId: firstBudgetItemId, amount: 10000 },
      { itemId: secondBudgetItemId, amount: 20000 },
    ]);

    await loginAsUser(page, 'REGULAR_USER');
    await gotoProgressInputPage(page, projectId);

    const exportPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/projects/${projectId}/execution-budget/progress/monthly/export`) &&
        res.url().includes('format=pdf'),
      { timeout: getTimeout(20000) }
    );
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    const exportRes = await exportPromise;
    expect(exportRes.ok()).toBeTruthy();
    const contentType = exportRes.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/pdf|octet-stream/i);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
  });
});
