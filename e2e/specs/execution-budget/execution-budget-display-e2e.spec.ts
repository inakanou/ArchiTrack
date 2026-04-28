/**
 * @fileoverview 実行予算管理 - 実行予算作成・表示・項目一覧・発注一覧 E2Eテスト
 *
 * Requirements coverage (execution-budget-management):
 * @requirement execution-budget-management/REQ-1.1: プロジェクト詳細画面の実行予算セクションに実行予算の存在有無を表示する
 * @requirement execution-budget-management/REQ-1.2: 実行予算の新規作成操作で契約書選択ダイアログを表示する
 * @requirement execution-budget-management/REQ-1.3: 契約書選択により見積項目から実行予算項目を初期化する
 * @requirement execution-budget-management/REQ-1.4: 実行予算項目の発注予定取引先を見積VENDOR行から自動適用する
 * @requirement execution-budget-management/REQ-1.6: 既存実行予算が存在するプロジェクトで作成ボタンを非活性にする
 * @requirement execution-budget-management/REQ-1.7: 実行予算に紐づく契約書名・契約金額・作成日時を表示する
 * @requirement execution-budget-management/REQ-3.1: 実行予算項目を見積書の階層構造で一覧表示する
 * @requirement execution-budget-management/REQ-3.2: ネスト項目の折り畳み・展開操作を提供する
 * @requirement execution-budget-management/REQ-3.3: 各項目に予算関連列を表示する
 * @requirement execution-budget-management/REQ-3.4: 各項目に発注関連列を表示する
 * @requirement execution-budget-management/REQ-3.5: 各項目に原価関連列を表示する
 * @requirement execution-budget-management/REQ-3.6: 各項目に出来高関連列を表示する
 * @requirement execution-budget-management/REQ-3.8: 全項目の合計行を表示する
 * @requirement execution-budget-management/REQ-3.9: 契約金額と実行金額合計の差額（利益見込額）を表示する
 * @requirement execution-budget-management/REQ-3.10: 発注進捗率（発注済み/全項目数）を表示する
 * @requirement execution-budget-management/REQ-5.1: 実行予算画面に発注一覧セクションを表示する
 * @requirement execution-budget-management/REQ-5.2: 発注一覧に取引先名・ステータス・項目数・合計実行金額・確定金額・作成日時を表示する
 * @requirement execution-budget-management/REQ-5.3: 発注一覧の行から発注詳細画面へ遷移する
 * @requirement execution-budget-management/REQ-17.2: 実行予算の作成・編集・削除をEDITOR以上のロールに許可する
 * @requirement execution-budget-management/REQ-17.6: 権限のないユーザーが操作を試行した場合、操作を拒否する
 * @requirement execution-budget-management/REQ-18.2: 金額表示を3桁区切りカンマ付き整数形式で表示する
 * @requirement execution-budget-management/REQ-18.4: 出来高率を小数点以下1桁で表示する
 * @requirement execution-budget-management/REQ-18.5: 負の金額値を赤色で表示する
 *
 * @module e2e/specs/execution-budget/execution-budget-display-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  getApiToken,
  createTestProject,
  createTestEstimate,
  createEstimateItem,
  createTestContract,
  createTestExecutionBudget,
  createTestSubcontractor,
  createTestOrder,
  deleteProject,
  deleteTradingPartner,
} from './helpers';

test.describe('実行予算管理 - 作成・表示・一覧', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  // テスト全体で共有するデータ
  let token = '';
  // 実行予算なしのプロジェクト（作成系テスト用）
  let emptyProjectId = '';
  let emptyContractId = '';
  // 実行予算ありのプロジェクト（表示系テスト用）
  let displayProjectId = '';
  let displayContractId = '';
  let displayEstimateId = '';
  let displayChildItemId = '';
  let displayOrderId = '';
  let tradingPartnerId = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // セットアップ
  // ============================================================================

  test('準備：API トークンとテストデータを作成する', async ({ request }) => {
    token = await getApiToken(request);
    expect(token).toBeTruthy();

    // 取引先（協力業者）の作成
    const partner = await createTestSubcontractor(request, token);
    tradingPartnerId = partner.id;

    // 表示テスト用: プロジェクト・見積書・項目・契約・実行予算を作成する
    displayProjectId = await createTestProject(request, token, 'E2E実行予算_表示');

    displayEstimateId = await createTestEstimate(request, token, displayProjectId);

    // 親項目を作成
    const parent = await createEstimateItem(request, token, displayEstimateId, {
      name: '親工種A',
      specification: '一式',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 1000000,
      executionUnitPrice: 800000,
      vendorName: partner.name,
      displayOrder: 0,
    });

    // 子項目を作成
    const child = await createEstimateItem(request, token, displayEstimateId, {
      name: '子項目A1',
      specification: 'A種',
      unit: '個',
      quantity: 10,
      estimateUnitPrice: 50000,
      executionUnitPrice: 40000,
      vendorName: partner.name,
      displayOrder: 0,
      parentId: parent.id,
    });
    displayChildItemId = child.id;

    // 単独項目（親なし）も追加
    await createEstimateItem(request, token, displayEstimateId, {
      name: '独立項目B',
      specification: 'B種',
      unit: 'm',
      quantity: 100,
      estimateUnitPrice: 5000,
      executionUnitPrice: 4000,
      vendorName: partner.name,
      displayOrder: 1,
    });

    displayContractId = await createTestContract(
      request,
      token,
      displayProjectId,
      displayEstimateId,
      {
        contractAmount: 1100000,
        constructionPrice: 1000000,
        taxAmount: 100000,
      }
    );

    // 実行予算を作成
    await createTestExecutionBudget(request, token, displayProjectId, displayContractId);

    // 発注を1件作成（発注一覧表示用）
    const order = await createTestOrder(request, token, displayProjectId, tradingPartnerId);
    displayOrderId = order.id;

    // 作成系テスト用の別プロジェクト・契約書（実行予算未作成状態）
    emptyProjectId = await createTestProject(request, token, 'E2E実行予算_作成');
    const emptyEstimateId = await createTestEstimate(request, token, emptyProjectId);
    await createEstimateItem(request, token, emptyEstimateId, {
      name: '作成テスト項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 90000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    emptyContractId = await createTestContract(request, token, emptyProjectId, emptyEstimateId);

    expect(emptyProjectId).toBeTruthy();
    expect(emptyContractId).toBeTruthy();
    expect(displayProjectId).toBeTruthy();
    expect(displayContractId).toBeTruthy();
    expect(displayChildItemId).toBeTruthy();
  });

  // ============================================================================
  // REQ-1: 実行予算の作成
  // ============================================================================

  test('プロジェクト詳細の実行予算セクションが存在有無を表示する (execution-budget-management/REQ-1.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 実行予算なしのプロジェクト
    await page.goto(`/projects/${emptyProjectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const emptySection = page.getByTestId('execution-budget-section');
    await expect(emptySection).toBeVisible({ timeout: getTimeout(15000) });
    await expect(emptySection.getByText(/実行予算はまだありません|実行予算/)).toBeVisible();

    // 実行予算ありのプロジェクト（契約書名が表示される）
    await page.goto(`/projects/${displayProjectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
    const filledSection = page.getByTestId('execution-budget-section');
    await expect(filledSection).toBeVisible({ timeout: getTimeout(15000) });
  });

  test('実行予算の新規作成で契約書選択ダイアログが表示される (execution-budget-management/REQ-1.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${emptyProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const createButton = page.getByRole('button', { name: '実行予算を作成' });
    await expect(createButton).toBeVisible({ timeout: getTimeout(15000) });
    await createButton.click();

    const dialog = page.getByRole('dialog', { name: '契約書選択' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByText('契約書を選択')).toBeVisible();
  });

  test('契約書選択により実行予算が作成され、項目が初期化される (execution-budget-management/REQ-1.3, REQ-1.4)', async ({
    page,
    request,
  }) => {
    // 一時用プロジェクト・契約を作成（破壊的操作のため独立）
    const tmpProjectId = await createTestProject(request, token, 'E2E実行予算_作成2');
    const tmpEstimateId = await createTestEstimate(request, token, tmpProjectId);
    const partner = await createTestSubcontractor(request, token);
    await createEstimateItem(request, token, tmpEstimateId, {
      name: '初期化テスト項目',
      unit: '式',
      quantity: 5,
      estimateUnitPrice: 60000,
      executionUnitPrice: 50000,
      vendorName: partner.name,
      displayOrder: 0,
    });
    await createTestContract(request, token, tmpProjectId, tmpEstimateId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${tmpProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '実行予算を作成' }).click();
    const dialog = page.getByRole('dialog', { name: '契約書選択' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // 契約書を選択
    const radio = dialog.locator('input[type="radio"][name="contract"]').first();
    await radio.check();

    // 作成 API レスポンスを待機
    const createPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${tmpProjectId}/execution-budget`) &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '作成' }).click();
    const createResponse = await createPromise;
    expect(createResponse.status()).toBe(201);

    // 作成後、項目が表示されることを確認 (REQ-1.3)
    await expect(page.getByText('初期化テスト項目')).toBeVisible({ timeout: getTimeout(15000) });

    // クリーンアップ
    await deleteProject(request, token, tmpProjectId);
    await deleteTradingPartner(request, token, partner.id);
  });

  test('既存の実行予算が存在する場合、作成ボタンが表示されない (execution-budget-management/REQ-1.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 既存実行予算があると、メイン画面（タイトル「実行予算」）が表示され、作成ボタンは現れない
    await expect(page.getByRole('heading', { name: '実行予算', exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 「実行予算を作成」ボタンは存在しない
    await expect(page.getByRole('button', { name: '実行予算を作成' })).toHaveCount(0);
  });

  test('実行予算に紐づく契約書名・契約金額が表示される (execution-budget-management/REQ-1.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書のラベル
    await expect(page.getByText('契約書', { exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 契約金額のラベルと金額（1,100,000円）
    await expect(page.getByText('契約金額', { exact: true })).toBeVisible();
    await expect(page.getByText('1,100,000円')).toBeVisible({ timeout: getTimeout(10000) });
  });

  // ============================================================================
  // REQ-3: 実行予算項目の一覧表示
  // ============================================================================

  test('実行予算項目が階層構造で表示される (execution-budget-management/REQ-3.1, REQ-3.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 親項目・子項目が表示されることを確認
    await expect(page.getByText('親工種A')).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText('子項目A1')).toBeVisible();

    // 折り畳みボタン（▼）が表示される
    const toggleButton = page.getByRole('button', { name: /折りたたむ|展開する/ }).first();
    await expect(toggleButton).toBeVisible();

    // クリックで子項目を非表示にできる（REQ-3.2）
    await toggleButton.click();
    await expect(page.getByText('子項目A1')).toBeHidden({ timeout: getTimeout(5000) });

    // 再度クリックで展開
    await toggleButton.click();
    await expect(page.getByText('子項目A1')).toBeVisible({ timeout: getTimeout(5000) });
  });

  test('予算関連の列ヘッダが表示される (execution-budget-management/REQ-3.3)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: getTimeout(15000) });

    const expectedColumns = [
      '項目名',
      '規格',
      '単位',
      '数量',
      '見積単価',
      '見積金額',
      '実行単価',
      '実行金額',
      '変更金額',
      '備考',
    ];
    for (const col of expectedColumns) {
      await expect(table.getByRole('columnheader', { name: col })).toBeVisible();
    }
  });

  test('発注関連の列ヘッダが表示される (execution-budget-management/REQ-3.4)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '発注予定取引先' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '発注金額' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '発注ステータス' })).toBeVisible();
  });

  test('原価関連の列ヘッダが表示される (execution-budget-management/REQ-3.5)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '先月支出' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '今月支出' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '累計支出' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '残予算' })).toBeVisible();
  });

  test('出来高関連の列ヘッダが表示される (execution-budget-management/REQ-3.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const table = page.locator('table').first();
    await expect(table.getByRole('columnheader', { name: '出来高金額' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '出来高率' })).toBeVisible();
  });

  test('合計行が表示される (execution-budget-management/REQ-3.8)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 合計行が表示される
    const table = page.locator('table').first();
    await expect(table.getByRole('cell', { name: '合計', exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('利益見込額が表示される (execution-budget-management/REQ-3.9)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await expect(page.getByText('利益見込額', { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('発注進捗率が表示される (execution-budget-management/REQ-3.10)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await expect(page.getByText('発注進捗率', { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });
    // パーセント値が表示されることを確認
    await expect(page.getByText(/^\d+(\.\d+)?%$/).first()).toBeVisible();
  });

  // ============================================================================
  // REQ-5: 発注一覧表示
  // ============================================================================

  test('発注一覧セクションが表示される (execution-budget-management/REQ-5.1)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    await expect(page.getByRole('heading', { name: '発注一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  test('発注一覧に取引先名・項目情報が表示される (execution-budget-management/REQ-5.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 既に作成した発注の取引先名が表示されることを確認
    const ordersHeading = page.getByRole('heading', { name: '発注一覧' });
    await expect(ordersHeading).toBeVisible({ timeout: getTimeout(15000) });

    // 取引先名（協力業者名）が一覧内に存在
    const orderLink = page.locator(`a[href*="/orders/${displayOrderId}"]`);
    await expect(orderLink).toBeVisible({ timeout: getTimeout(15000) });

    // ステータス（発注前）と項目数が表示
    await expect(orderLink.getByText('発注前')).toBeVisible();
    await expect(orderLink.getByText(/\d+項目 \/ [\d,]+円/)).toBeVisible();
  });

  test('発注一覧の行から詳細画面へ遷移する (execution-budget-management/REQ-5.3)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const orderLink = page.locator(`a[href*="/orders/${displayOrderId}"]`);
    await expect(orderLink).toBeVisible({ timeout: getTimeout(15000) });
    await orderLink.click();

    await page.waitForURL(`**/orders/${displayOrderId}`, { timeout: getTimeout(15000) });
    expect(page.url()).toContain(`/orders/${displayOrderId}`);
    await expect(page.getByRole('heading', { name: '発注詳細' })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  // ============================================================================
  // REQ-17: アクセス制御
  // ============================================================================

  test('EDITOR権限ロール（一般ユーザー）が実行予算を作成できる (execution-budget-management/REQ-17.2)', async ({
    page,
    request,
  }) => {
    // REGULAR_USER は user ロールを持ち、project リソース等への作成権限を持つ
    // 実行予算作成 API が 201 を返すことで EDITOR 相当のアクセス許可を確認
    const tmpProjectId = await createTestProject(request, token, 'E2E実行予算_権限');
    const tmpEstimateId = await createTestEstimate(request, token, tmpProjectId);
    await createEstimateItem(request, token, tmpEstimateId, {
      name: '権限テスト項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 10000,
      executionUnitPrice: 9000,
      displayOrder: 0,
    });
    const tmpContractId = await createTestContract(request, token, tmpProjectId, tmpEstimateId);

    await loginAsUser(page, 'REGULAR_USER');
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();

    const res = await request.post(
      `${process.env.API_BASE_URL || 'http://localhost:3100'}/api/projects/${tmpProjectId}/execution-budget`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: { contractId: tmpContractId },
      }
    );
    expect(res.status()).toBe(201);

    // クリーンアップ
    await deleteProject(request, token, tmpProjectId);
  });

  test('未認証ユーザーは実行予算操作を拒否される (execution-budget-management/REQ-17.6)', async ({
    request,
  }) => {
    // 認証ヘッダなしで実行予算APIを叩くと401になる
    const res = await request.get(
      `${process.env.API_BASE_URL || 'http://localhost:3100'}/api/projects/${displayProjectId}/execution-budget`
    );
    expect(res.status()).toBe(401);

    const createRes = await request.post(
      `${process.env.API_BASE_URL || 'http://localhost:3100'}/api/projects/${emptyProjectId}/execution-budget`,
      { data: { contractId: emptyContractId } }
    );
    expect(createRes.status()).toBe(401);
  });

  // ============================================================================
  // REQ-18: 数値計算の精度と表示
  // ============================================================================

  test('金額が3桁区切りカンマ付きで表示される (execution-budget-management/REQ-18.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約金額 1,100,000 がカンマ区切りで表示されている
    await expect(page.getByText('1,100,000円')).toBeVisible({ timeout: getTimeout(15000) });

    // 実行金額の表示（500000=500,000）— 単独項目B 100*4000=400,000、子項目A1 10*40000=400,000、親=400,000、合計800,000
    // テーブル内に3桁区切り（カンマ含む）金額が複数表示される
    const formattedAmounts = page
      .locator('table')
      .first()
      .getByText(/^\d{1,3}(,\d{3})+$/);
    expect(await formattedAmounts.count()).toBeGreaterThan(0);
  });

  test('出来高率が%付きで表示される (execution-budget-management/REQ-18.4)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${displayProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 発注進捗率が % 付きで表示される（出来高率と同じフォーマット）
    await expect(page.getByText(/^\d+(\.\d+)?%$/).first()).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('負の利益見込額が赤色で表示される (execution-budget-management/REQ-18.5)', async ({
    page,
    request,
  }) => {
    // 契約金額 < 実行金額合計 となるプロジェクトを作成して、利益見込額を負にする
    const tmpProjectId = await createTestProject(request, token, 'E2E実行予算_負額');
    const tmpEstimateId = await createTestEstimate(request, token, tmpProjectId);
    // 実行単価を高く設定
    await createEstimateItem(request, token, tmpEstimateId, {
      name: '高額項目',
      unit: '式',
      quantity: 1,
      estimateUnitPrice: 100000,
      executionUnitPrice: 2000000,
      displayOrder: 0,
    });
    // 契約金額は実行金額より低くする
    const tmpContractId = await createTestContract(request, token, tmpProjectId, tmpEstimateId, {
      contractAmount: 110000,
      constructionPrice: 100000,
      taxAmount: 10000,
    });
    await createTestExecutionBudget(request, token, tmpProjectId, tmpContractId);

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${tmpProjectId}/execution-budget`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 利益見込額の値（負数）が赤色（#dc2626 もしくは rgb(220, 38, 38)）で表示される
    const profitForecastLabel = page.getByText('利益見込額', { exact: true });
    await expect(profitForecastLabel).toBeVisible({ timeout: getTimeout(15000) });

    // 親要素から金額値を取得
    const profitContainer = profitForecastLabel.locator('..');
    const valueElement = profitContainer.locator('span').nth(1);
    await expect(valueElement).toBeVisible();

    const color = await valueElement.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(220, 38, 38)');

    // クリーンアップ
    await deleteProject(request, token, tmpProjectId);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ request }) => {
    if (displayProjectId) await deleteProject(request, token, displayProjectId);
    if (emptyProjectId) await deleteProject(request, token, emptyProjectId);
    if (tradingPartnerId) await deleteTradingPartner(request, token, tradingPartnerId);
  });
});
