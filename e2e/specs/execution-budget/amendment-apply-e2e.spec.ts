/**
 * @fileoverview 実行予算管理 - 変更契約反映 E2E テスト
 *
 * 変更契約の反映フロー全体（一覧表示 → 差分確認 → 反映実行）を検証する。
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-15.1: 実行予算画面で「変更契約の反映」ボタンを押下すると、未反映の変更契約一覧を表示する
 * @requirement execution-budget-management/REQ-15.2: 変更契約を選択して反映操作を行うと、見積書の項目差分（追加・変更）を表示する
 * @requirement execution-budget-management/REQ-15.3: 変更内容を確認して適用すると、実行予算項目に新規項目の追加および既存項目の数量・金額更新を反映する
 * @requirement execution-budget-management/REQ-15.6: 変更前の契約金額と変更後の契約金額を並べて表示する
 * @requirement execution-budget-management/REQ-15.7: 実行予算一覧画面の「変更金額」列に、変更契約による金額差分を表示する
 *
 * @module e2e/specs/execution-budget/amendment-apply-e2e.spec
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
  setContractContracted,
  deleteProject,
  deleteTradingPartner,
} from './helpers';

test.describe('実行予算管理 - 変更契約の反映', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let token = '';
  let projectId = '';
  let partnerId = '';
  let baseContractId = '';
  let baseEstimateId = '';
  let amendmentEstimateId = '';
  let amendmentContractId = '';
  let originalItemId = ''; // 既存項目ID（実行予算の view 側）
  // 基契約金額: 200000 + 100000 = 300000、税込 1.1 → 後で構築
  const baseConstructionPrice = 300000;
  // 変更契約金額: 既存項目の数量を 1 → 2 に増やし、新規項目 50000 を加える想定
  // 既存項目: 200000 (estimate) → 200000 のまま（数量だけ変える簡略化）
  // 新規項目: 50000
  // 合計の構築は createEstimateItem 経由

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備：基契約 + 変更契約 + 実行予算をセットアップする', async ({ request }) => {
    token = await getApiToken(request);

    const partner = await createTestSubcontractor(request, token);
    partnerId = partner.id;

    projectId = await createTestProject(request, token, 'E2E実行予算_変更契約反映');

    // 基となる見積書と項目（数量1）を作成
    baseEstimateId = await createTestEstimate(request, token, projectId, '基見積書');
    await createEstimateItem(request, token, baseEstimateId, {
      name: '既存項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 200000,
      executionUnitPrice: 100000,
      vendorName: partner.name,
      displayOrder: 0,
    });

    // 基契約書を作成（contractAmount: 330,000）
    baseContractId = await createTestContract(request, token, projectId, baseEstimateId, {
      constructionPrice: baseConstructionPrice,
      taxAmount: Math.floor(baseConstructionPrice * 0.1),
      contractAmount: baseConstructionPrice + Math.floor(baseConstructionPrice * 0.1),
    });

    // 実行予算を作成
    await createTestExecutionBudget(request, token, projectId, baseContractId);

    // 実行予算項目IDを取得（既存項目の budget item id）
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; name: string | null; amendmentAmount: string }>;
    };
    const original = budget.items.find((i) => i.name === '既存項目');
    expect(original, '既存項目の実行予算項目が取得できる').toBeTruthy();
    originalItemId = original!.id;

    // 反映前: 「変更金額」列は 0
    expect(original!.amendmentAmount).toBe('0');

    // 変更契約の見積書を作成（既存項目に対応する見積項目 + 新規項目）
    amendmentEstimateId = await createTestEstimate(request, token, projectId, '変更見積書');
    // 既存項目（同じ名前で再作成、数量2に変更）
    await createEstimateItem(request, token, amendmentEstimateId, {
      name: '既存項目',
      unit: '式',
      quantity: 2,
      estimateUnitPrice: 200000,
      executionUnitPrice: 100000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    // 新規追加項目
    await createEstimateItem(request, token, amendmentEstimateId, {
      name: '追加項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 50000,
      executionUnitPrice: 30000,
      vendorName: partner.name,
      displayOrder: 1,
    });

    // 変更契約書を作成（contractType: AMENDMENT, parentContractId: baseContractId）
    // contractAmount: 既存項目数量2 (200000*2) + 追加 50000 = 450000、税込 495000
    const amendmentConstructionPrice = 200000 * 2 + 50000;
    const amendmentTax = Math.floor(amendmentConstructionPrice * 0.1);
    amendmentContractId = await createTestContract(request, token, projectId, amendmentEstimateId, {
      contractType: 'AMENDMENT',
      parentContractId: baseContractId,
      constructionPrice: amendmentConstructionPrice,
      taxAmount: amendmentTax,
      contractAmount: amendmentConstructionPrice + amendmentTax,
    });

    // 変更契約のステータスを CONTRACTED へ
    await setContractContracted(request, token, amendmentContractId);

    expect(baseContractId).toBeTruthy();
    expect(amendmentContractId).toBeTruthy();
    expect(originalItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-15.1: 「変更契約の反映」ボタン
  // ============================================================================

  test('未反映の変更契約が存在するときのみ「変更契約の反映」ボタンが表示される (execution-budget-management/REQ-15.1)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // ケース1: 未反映 1件以上 → ボタン表示
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const button = page.getByTestId('apply-amendment-button');
    await expect(button).toBeVisible({ timeout: getTimeout(15000) });
    await expect(button).toHaveText(/変更契約の反映/);

    // ケース2: 未反映が空のプロジェクト → ボタン非表示
    // 比較用に、変更契約のない別プロジェクトを作成して検証
    const emptyProjectId = await createTestProject(
      request,
      token,
      'E2E実行予算_変更契約反映_未反映なし'
    );
    const eId = await createTestEstimate(request, token, emptyProjectId, '基見積書');
    await createEstimateItem(request, token, eId, {
      name: '単独項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 80000,
      vendorName: null,
      displayOrder: 0,
    });
    const cId = await createTestContract(request, token, emptyProjectId, eId);
    await createTestExecutionBudget(request, token, emptyProjectId, cId);

    await page.goto(`/projects/${emptyProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    await expect(page.getByTestId('apply-amendment-button')).toHaveCount(0);

    // クリーンアップ（独自に作成した emptyProject）
    await deleteProject(request, token, emptyProjectId);
  });

  // ============================================================================
  // REQ-15.2: 未反映変更契約一覧表示
  // ============================================================================

  test('「変更契約の反映」ボタンから遷移したページに未反映の変更契約一覧が表示される (execution-budget-management/REQ-15.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 「変更契約の反映」ボタンを押下
    await page.getByTestId('apply-amendment-button').click();

    // 一覧ページに遷移
    await page.waitForURL(`**/projects/${projectId}/execution-budget/amendments`, {
      timeout: getTimeout(15000),
    });

    // 一覧テーブル
    const table = page.getByTestId('unreflected-amendment-table');
    await expect(table).toBeVisible({ timeout: getTimeout(15000) });

    // 該当変更契約の行が存在する
    const row = page.getByTestId(`amendment-row-${amendmentContractId}`);
    await expect(row).toBeVisible({ timeout: getTimeout(10000) });
    // 変更見積書名が表示される
    await expect(row.getByText('変更見積書')).toBeVisible();
    // 変更契約金額（495,000）が表示される
    await expect(row.getByText('495,000円')).toBeVisible();
  });

  // ============================================================================
  // REQ-15.6: 変更前後の契約金額比較表示
  // ============================================================================

  test('反映確認ダイアログで変更前後の契約金額が並べて表示される (execution-budget-management/REQ-15.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/amendments`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 反映ボタンを押下して詳細ダイアログを開く
    await page.getByTestId(`open-detail-${amendmentContractId}`).click();

    // 比較表示が表示される
    const comparison = page.getByTestId('contract-amount-comparison');
    await expect(comparison).toBeVisible({ timeout: getTimeout(15000) });

    // 変更前 = 330,000円（基契約金額: 300,000 + 30,000税）
    await expect(page.getByTestId('before-contract-amount')).toHaveText('330,000円');
    // 変更後 = 495,000円
    await expect(page.getByTestId('after-contract-amount')).toHaveText('495,000円');
    // 差分 = +165,000円
    await expect(page.getByTestId('contract-amount-diff')).toHaveText('+165,000円');
  });

  // ============================================================================
  // REQ-15.3: 変更内容を実行予算に反映する操作
  // ============================================================================

  test('「実行予算に反映」ボタンで変更契約が実行予算に適用される (execution-budget-management/REQ-15.3)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget/amendments`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 反映ボタンを押下して詳細ダイアログを開く
    await page.getByTestId(`open-detail-${amendmentContractId}`).click();
    // 差分が読み込まれるのを待つ
    await expect(page.getByTestId('contract-amount-comparison')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 反映実行
    const applyPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/execution-budget/apply-amendment') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('apply-amendment-confirm').click();
    const applyResponse = await applyPromise;
    expect(applyResponse.status()).toBe(200);

    // 反映済みの変更契約は一覧から消える（ダイアログクローズ + 再フェッチ後）
    await expect(page.getByTestId(`amendment-row-${amendmentContractId}`)).toHaveCount(0, {
      timeout: getTimeout(15000),
    });

    // API で実行予算を確認: 追加項目が増えていることを検証
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; name: string | null; amendmentAmount: string }>;
    };
    const addedItem = budget.items.find((i) => i.name === '追加項目');
    expect(addedItem, '追加項目が実行予算項目として反映される').toBeTruthy();
  });

  // ============================================================================
  // REQ-15.7: 「変更金額」列に変更契約による金額差分を表示
  // ============================================================================

  test('反映後、実行予算一覧の「変更金額」列に金額差分が表示される (execution-budget-management/REQ-15.7)', async ({
    page,
    request,
  }) => {
    // この時点で前のテストで反映済みであることが前提（serial mode）
    // 変更金額が 0 でない値であることを API レベルで確認
    const budgetRes = await request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    const budget = (await budgetRes.json()) as {
      items: Array<{ id: string; name: string | null; amendmentAmount: string }>;
    };

    // 「追加項目」の amendmentAmount が 0 ではない（変更により発生した金額が記録される）
    const addedItem = budget.items.find((i) => i.name === '追加項目');
    expect(addedItem).toBeTruthy();
    const addedAmendment = parseInt(addedItem!.amendmentAmount, 10);
    expect(addedAmendment, '追加項目の変更金額が 0 より大きい').toBeGreaterThan(0);

    // 画面表示でも変更金額列にその値が表示されることを確認
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 「変更金額」列ヘッダ（REQ-15.7）
    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '変更金額' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 追加項目行の変更金額セルに数値が表示される
    const cell = page.getByTestId(`amendment-amount-${addedItem!.id}`);
    await expect(cell).toBeVisible({ timeout: getTimeout(15000) });
    await expect(cell).toHaveText(addedAmendment.toLocaleString('ja-JP'));
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (projectId) await deleteProject(request, token, projectId);
    if (partnerId) await deleteTradingPartner(request, token, partnerId);
  });
});
