/**
 * @fileoverview 発注管理機能 E2Eテスト
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-6.1: 発注の新規作成操作で発注取引先を指定する画面を表示する
 * @requirement execution-budget-management/REQ-6.2: 取引先マスタから協力業者を検索・選択するコンボボックスを提供する
 * @requirement execution-budget-management/REQ-6.3: 発注画面で発注予定取引先と一致する見積項目にチェック付き状態で表示する
 * @requirement execution-budget-management/REQ-6.4: 見積項目のチェックの追加・削除を可能とする
 * @requirement execution-budget-management/REQ-6.5: チェック済み項目の合計実行金額を自動計算して表示する
 * @requirement execution-budget-management/REQ-6.6: 確定発注金額の入力欄を提供する
 * @requirement execution-budget-management/REQ-6.7: ステータスとして「発注前」「発注金額検討中」「発注済」「発注取消」の4種類を持つ
 * @requirement execution-budget-management/REQ-7.1: 発注前/検討中の場合、発注取引先の変更を可能とする
 * @requirement execution-budget-management/REQ-7.2: 発注前/検討中の場合、チェック済み項目および確定発注金額の変更を可能とする
 * @requirement execution-budget-management/REQ-7.3: 発注の削除操作で削除確認ダイアログを表示する
 * @requirement execution-budget-management/REQ-7.4: 発注前/検討中の場合、発注の削除を可能とする
 * @requirement execution-budget-management/REQ-7.5: 発注済の状態で削除を試行した場合、削除を阻止する
 * @requirement execution-budget-management/REQ-8.1: 発注済へ変更時、確定発注金額の入力を検証する
 * @requirement execution-budget-management/REQ-8.2: 確定発注金額未入力時のステータス変更を阻止する
 * @requirement execution-budget-management/REQ-8.5: 発注済へ変更後、各項目の発注金額を確定値として保存する
 * @requirement execution-budget-management/REQ-8.6: 発注済の場合、チェック済み項目の変更を不可とする
 * @requirement execution-budget-management/REQ-8.7: 発注済の場合、確定発注金額の変更を不可とする
 * @requirement execution-budget-management/REQ-8.8: 発注済の発注取消操作で取消確認ダイアログを表示する
 *
 * @module e2e/specs/execution-budget/order-management-e2e.spec
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

test.describe('実行予算管理 - 発注管理', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  let partner2Id = '';
  let firstItemId = '';
  let secondItemId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：APIトークンとテストデータを作成する', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token, {
      name: `E2E業者A_発注_${Date.now()}`,
      nameKana: 'イーツーイーギョウシャエー',
    });
    partnerId = partner.id;

    const partner2 = await createTestSubcontractor(request, token, {
      name: `E2E業者B_発注_${Date.now()}`,
      nameKana: 'イーツーイーギョウシャビー',
    });
    partner2Id = partner2.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_発注');
    const estimateId = await createTestEstimate(request, token, projectId);

    // 業者A向けの項目（VENDOR行で業者Aを指定）
    const item1 = await createEstimateItem(request, token, estimateId, {
      name: '発注項目A1',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 200000,
      executionUnitPrice: 180000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    firstItemId = item1.id;

    // 業者A向けの2つ目の項目
    const item2 = await createEstimateItem(request, token, estimateId, {
      name: '発注項目A2',
      unit: '個',
      quantity: 5,
      estimateUnitPrice: 50000,
      executionUnitPrice: 40000,
      vendorName: partner.name,
      displayOrder: 1,
    });
    secondItemId = item2.id;

    // 業者B向けの項目
    await createEstimateItem(request, token, estimateId, {
      name: '発注項目B1',
      unit: '式',
      quantity: 2,
      estimateUnitPrice: 100000,
      executionUnitPrice: 90000,
      vendorName: partner2.name,
      displayOrder: 2,
    });

    const contractId = await createTestContract(request, token, projectId, estimateId);
    await createTestExecutionBudget(request, token, projectId, contractId);

    // 実行予算項目IDへ置き換え（updateOrderItems / OrderItem は ExecutionBudgetItem.id を期待する）
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; estimateItemId: string | null }>;
    };
    const item1Budget = budget.items.find((i) => i.estimateItemId === item1.id);
    const item2Budget = budget.items.find((i) => i.estimateItemId === item2.id);
    expect(item1Budget).toBeTruthy();
    expect(item2Budget).toBeTruthy();
    firstItemId = item1Budget!.id;
    secondItemId = item2Budget!.id;

    expect(firstItemId).toBeTruthy();
    expect(secondItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-6.1, REQ-6.2: 発注作成画面と取引先コンボボックス
  // ============================================================================

  test('発注の新規作成画面で取引先指定UIが表示される (execution-budget-management/REQ-6.1, REQ-6.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/new`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注作成画面のタイトルが表示される
    await expect(page.getByRole('heading', { name: '発注作成' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 取引先のコンボボックスが表示される（REQ-6.2）
    const combobox = page.getByRole('combobox', { name: /取引先/ });
    await expect(combobox).toBeVisible({ timeout: getTimeout(10000) });

    // 入力可能な状態
    await expect(combobox).toBeEnabled();
  });

  // ============================================================================
  // REQ-6.3: 発注画面で発注予定取引先一致項目にチェック
  // ============================================================================

  test('発注作成後、発注予定取引先と一致する見積項目にチェックが付く (execution-budget-management/REQ-6.3)', async ({
    page,
    request,
  }) => {
    // 業者A の発注を作成
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注詳細画面が表示される
    await expect(page.getByRole('heading', { name: '発注詳細' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 発注項目一覧の業者A向け項目（A1, A2）にチェックが付いている
    const checkboxA1 = page.getByRole('checkbox', { name: '発注項目A1を選択' });
    const checkboxA2 = page.getByRole('checkbox', { name: '発注項目A2を選択' });
    const checkboxB1 = page.getByRole('checkbox', { name: '発注項目B1を選択' });

    await expect(checkboxA1).toBeChecked({ timeout: getTimeout(10000) });
    await expect(checkboxA2).toBeChecked();
    await expect(checkboxB1).not.toBeChecked();

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-6.4, REQ-6.5: チェック追加削除と合計実行金額計算
  // ============================================================================

  test('チェック状態を変更でき、合計実行金額が表示される (execution-budget-management/REQ-6.4, REQ-6.5)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 業者A向け項目（A1, A2）が初期チェック済み
    const checkboxA1 = page.getByRole('checkbox', { name: '発注項目A1を選択' });
    await expect(checkboxA1).toBeChecked({ timeout: getTimeout(10000) });

    // チェックを外す（REQ-6.4）
    await checkboxA1.uncheck();
    await expect(checkboxA1).not.toBeChecked();

    // チェックを再度付ける
    await checkboxA1.check();
    await expect(checkboxA1).toBeChecked();

    // 合計実行金額が表示される (REQ-6.5)
    // A1=180,000 + A2=200,000 (40000*5) = 380,000円
    await expect(page.getByText('合計実行金額', { exact: false })).toBeVisible({
      timeout: getTimeout(10000),
    });

    await expect(page.getByText('380,000円').first()).toBeVisible({
      timeout: getTimeout(10000),
    });

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-6.6: 確定発注金額入力欄
  // ============================================================================

  test('確定発注金額の入力欄が提供される (execution-budget-management/REQ-6.6)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const amountInput = page.getByLabel('確定発注金額');
    await expect(amountInput).toBeVisible({ timeout: getTimeout(15000) });
    await expect(amountInput).toBeEnabled();

    // 値を入力できる
    await amountInput.fill('350000');
    await expect(amountInput).toHaveValue('350000');

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-6.7: 4つのステータス
  // ============================================================================

  test('発注のステータスは4種類（発注前/検討中/発注済/取消）を持つ (execution-budget-management/REQ-6.7)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 初期ステータスは「発注前」
    await expect(page.getByText('発注前').first()).toBeVisible({ timeout: getTimeout(15000) });

    // ステータス遷移のための「検討中」「発注済」ボタンが提供される
    await expect(page.getByRole('button', { name: '発注金額検討中にする' })).toBeVisible();
    await expect(page.getByRole('button', { name: '発注済にする' })).toBeVisible();

    // 検討中に遷移
    await page.getByRole('button', { name: '発注金額検討中にする' }).click();
    await expect(page.getByText('検討中').first()).toBeVisible({ timeout: getTimeout(15000) });

    // 確定発注金額を入力して発注済に遷移
    // ページには「チェック状態を保存」ボタンも存在するため完全一致で「保存」ボタンを掴む
    await page.getByLabel('確定発注金額').fill('300000');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '発注済にする' }).click();
    const dialog = page.getByRole('dialog', { name: '発注確定確認' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: '確定する' }).click();
    await expect(page.getByText('発注済').first()).toBeVisible({ timeout: getTimeout(15000) });

    // 発注取消ボタンが提供される（4つ目のステータスへの遷移）
    await expect(page.getByRole('button', { name: '発注取消' })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-7.1: 発注前/検討中で取引先変更可能
  // ============================================================================

  test('発注前ステータスで発注取引先を変更できる (execution-budget-management/REQ-7.1)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 「取引先変更」セクションが表示される（発注前/検討中時のみ）
    await expect(page.getByRole('heading', { name: '取引先変更' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 取引先変更コンボボックスが提供される
    const allComboboxes = page.getByRole('combobox', { name: /取引先/ });
    expect(await allComboboxes.count()).toBeGreaterThanOrEqual(1);
    const enabledCombobox = allComboboxes.first();
    await expect(enabledCombobox).toBeEnabled();

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-7.2: 発注前/検討中でチェック・確定発注金額変更可能
  // ============================================================================

  test('発注前ステータスでチェック済み項目および確定発注金額を変更できる (execution-budget-management/REQ-7.2)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // チェックボックスが有効
    const checkbox = page.getByRole('checkbox', { name: '発注項目B1を選択' });
    await expect(checkbox).toBeEnabled({ timeout: getTimeout(15000) });

    // 確定発注金額が編集可能
    const amountInput = page.getByLabel('確定発注金額');
    await expect(amountInput).toBeEnabled();

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-7.3, REQ-7.4: 削除確認ダイアログと削除可能
  // ============================================================================

  test('発注前ステータスの発注は削除確認ダイアログを介して削除できる (execution-budget-management/REQ-7.3, REQ-7.4)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 削除ボタンをクリック
    await page.getByRole('button', { name: '削除', exact: true }).click();

    // 削除確認ダイアログが表示される (REQ-7.3)
    const dialog = page.getByRole('dialog', { name: '削除確認' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    // ダイアログ内に h3「発注の削除」と p「削除してもよろしいですか」の両方が存在するため
    // .first() で先頭マッチに限定して strict mode 違反を回避する
    await expect(dialog.getByText(/発注の削除|削除してもよろしいですか/).first()).toBeVisible();

    // 削除を確定 (REQ-7.4)
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/orders/${order.id}`) && response.request().method() === 'DELETE',
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '削除する' }).click();
    const response = await deleteResponse;
    expect(response.status()).toBe(204);

    // 実行予算画面へ遷移
    await page.waitForURL(`**/projects/${projectId}/execution-budget`, {
      timeout: getTimeout(15000),
    });
  });

  // ============================================================================
  // REQ-7.5: 発注済は削除不可
  // ============================================================================

  test('発注済ステータスの発注は削除を阻止する (execution-budget-management/REQ-7.5)', async ({
    request,
  }) => {
    // 発注作成 → チェック → UNDER_REVIEW → 発注済へ
    // VALID_STATUS_TRANSITIONS: BEFORE_ORDER→UNDER_REVIEW→ORDERED の経路
    const order = await createTestOrder(request, token, projectId, partnerId);
    await updateOrderItems(request, token, projectId, order.id, [firstItemId]);
    const reviewRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'UNDER_REVIEW' },
      }
    );
    expect(reviewRes.status()).toBe(200);
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '180000' },
      }
    );
    expect(statusRes.status()).toBe(200);

    // 発注済の発注に対して DELETE を試行
    const deleteRes = await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
    expect(deleteRes.status()).toBe(422);

    // 取消にしてからクリーンアップ
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'CANCELLED' },
      }
    );
  });

  // ============================================================================
  // REQ-8.1, REQ-8.2: 発注済への変更時、確定発注金額を検証
  // ============================================================================

  test('確定発注金額未入力時のステータス変更を阻止する (execution-budget-management/REQ-8.1, REQ-8.2)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 確定発注金額を未入力のまま「発注済にする」をクリック
    const amountInput = page.getByLabel('確定発注金額');
    await amountInput.fill('');

    await page.getByRole('button', { name: '発注済にする' }).click();

    // エラーメッセージが表示される（REQ-8.2）
    await expect(page.getByText(/確定発注金額を入力してください/)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 発注確定ダイアログは表示されない
    const dialog = page.getByRole('dialog', { name: '発注確定確認' });
    await expect(dialog).not.toBeVisible();

    // クリーンアップ
    await request.delete(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
  });

  // ============================================================================
  // REQ-8.5: 発注済へ変更後、各項目の発注金額を確定値として保存
  // ============================================================================

  test('発注済への変更後、各項目の発注金額が保存される (execution-budget-management/REQ-8.5)', async ({
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);
    await updateOrderItems(request, token, projectId, order.id, [firstItemId, secondItemId]);

    // BEFORE_ORDER → UNDER_REVIEW → ORDERED の 2 段階遷移を経由する
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'UNDER_REVIEW' },
      }
    );
    // 確定発注金額を 380000 (= 実行金額合計) として発注済へ
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '380000' },
      }
    );
    expect(statusRes.status()).toBe(200);

    // 発注詳細を取得し、各項目に orderAmount が保存されていることを確認
    const detailRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}`,
      { headers: authHeaders(token) }
    );
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as {
      status: string;
      items: Array<{ checked: boolean; orderAmount: string | null }>;
    };
    expect(detail.status).toBe('ORDERED');

    const checkedItems = detail.items.filter((i) => i.checked);
    expect(checkedItems.length).toBe(2);
    for (const item of checkedItems) {
      expect(item.orderAmount).not.toBeNull();
      expect(parseInt(item.orderAmount as string, 10)).toBeGreaterThan(0);
    }

    // クリーンアップ
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'CANCELLED' },
      }
    );
  });

  // ============================================================================
  // REQ-8.6, REQ-8.7: 発注済の編集不可
  // ============================================================================

  test('発注済ステータスではチェック済み項目および確定発注金額を変更不可とする (execution-budget-management/REQ-8.6, REQ-8.7)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);
    await updateOrderItems(request, token, projectId, order.id, [firstItemId]);
    // BEFORE_ORDER → UNDER_REVIEW → ORDERED の 2 段階遷移
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'UNDER_REVIEW' },
      }
    );
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '180000' },
      }
    );
    expect(statusRes.status()).toBe(200);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // ステータスが「発注済」
    await expect(page.getByText('発注済').first()).toBeVisible({ timeout: getTimeout(15000) });

    // チェックボックスが無効化される (REQ-8.6)
    const checkbox = page.getByRole('checkbox', { name: '発注項目A1を選択' });
    await expect(checkbox).toBeDisabled({ timeout: getTimeout(10000) });

    // 確定発注金額入力が無効化される (REQ-8.7)
    const amountInput = page.getByLabel('確定発注金額');
    await expect(amountInput).toBeDisabled();

    // クリーンアップ
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'CANCELLED' },
      }
    );
  });

  // ============================================================================
  // REQ-8.8: 発注済からの取消確認ダイアログ
  // ============================================================================

  test('発注済の発注取消で取消確認ダイアログが表示される (execution-budget-management/REQ-8.8)', async ({
    page,
    request,
  }) => {
    const order = await createTestOrder(request, token, projectId, partnerId);
    await updateOrderItems(request, token, projectId, order.id, [firstItemId]);
    // BEFORE_ORDER → UNDER_REVIEW → ORDERED の 2 段階遷移
    await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'UNDER_REVIEW' },
      }
    );
    const statusRes = await request.patch(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${order.id}/status`,
      {
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        data: { status: 'ORDERED', confirmedAmount: '180000' },
      }
    );
    expect(statusRes.status()).toBe(200);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/orders/${order.id}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注取消ボタンをクリック
    const cancelButton = page.getByRole('button', { name: '発注取消' });
    await expect(cancelButton).toBeVisible({ timeout: getTimeout(15000) });
    await cancelButton.click();

    // 取消確認ダイアログが表示される
    const dialog = page.getByRole('dialog', { name: '発注取消確認' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    // ダイアログ内に h3 タイトルと p 本文の両方が同正規表現にマッチするため
    // .first() で先頭マッチに限定して strict mode 違反を回避する
    await expect(dialog.getByText(/取消しますか|案分済み/).first()).toBeVisible();

    // 取消ボタン・キャンセルボタンが提供される
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消する' })).toBeVisible();

    // 取消を実行
    await dialog.getByRole('button', { name: '取消する' }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

    // ステータスが取消に変わる
    await expect(page.getByText('取消').first()).toBeVisible({ timeout: getTimeout(15000) });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
    if (partner2Id) await deleteTradingPartner(request, token, partner2Id);
  });
});
