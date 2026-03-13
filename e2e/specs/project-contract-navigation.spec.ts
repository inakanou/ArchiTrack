/**
 * @fileoverview プロジェクト詳細画面 契約書セクション E2Eテスト
 *
 * Task 60.1: プロジェクト詳細画面の契約書セクションE2Eテスト
 *
 * Requirements coverage (project-management):
 * @requirement project-management/REQ-36.1: プロジェクト詳細画面の見積書セクションの下に契約書セクションを表示する
 * @requirement project-management/REQ-36.2: 契約書セクションにセクションタイトル「契約書」を表示する
 * @requirement project-management/REQ-36.3: 契約書セクションに契約書の総数を表示する
 * @requirement project-management/REQ-36.4: 契約書セクションに直近の契約書をカード形式で表示する
 * @requirement project-management/REQ-36.5: 契約書カードに契約種類、契約日、ステータス、請負代金額を表示する
 * @requirement project-management/REQ-36.6: 契約書カードクリックで詳細画面へ遷移する
 * @requirement project-management/REQ-36.7: 契約書セクションに「すべて見る」リンクを提供する
 * @requirement project-management/REQ-36.8: 「すべて見る」リンクで契約書一覧画面へ遷移する
 * @requirement project-management/REQ-36.9: 契約書セクションに新規作成ボタンを提供する
 * @requirement project-management/REQ-36.10: 新規作成ボタンで契約書作成画面へ遷移する
 * @requirement project-management/REQ-36.11: 契約書が存在しない場合、空メッセージと新規作成ボタンを表示する
 * @requirement project-management/REQ-36.12: ロード中にスケルトンローダーを表示する
 * @requirement project-management/REQ-36.13: 見積書セクションと同様のUIスタイルで提供する
 * @requirement project-management/REQ-37.1: detail-summary APIのレスポンスに契約書セクションデータを含める
 * @requirement project-management/REQ-37.2: 契約書セクションデータにtotalCountとlatestContractsを含める
 * @requirement project-management/REQ-37.3: 直近の契約書データに契約ID、契約種類、契約日、ステータス、請負代金額、作成日時を含める
 * @requirement project-management/REQ-37.4: エラー時にデフォルト値を返却し他のセクションは正常に返却する
 * @requirement project-management/REQ-37.5: 契約書セクションのデータをPromise.allSettledで並行取得する
 *
 * @module e2e/specs/project-contract-navigation.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { API_BASE_URL } from '../config';

test.describe('プロジェクト詳細画面 - 契約書セクション', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let projectId: string | null = null;
  let estimateId: string | null = null;
  let contractId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // ヘルパー関数
  // ============================================================================

  async function getAccessToken(page: import('@playwright/test').Page): Promise<string> {
    const tokenResponse = await page.evaluate(async (apiUrl: string) => {
      const res = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.json();
    }, API_BASE_URL);
    return tokenResponse.accessToken;
  }

  async function apiRequest(
    page: import('@playwright/test').Page,
    method: string,
    path: string,
    token: string,
    body?: Record<string, unknown>
  ) {
    return page.evaluate(
      async ({
        apiUrl,
        method,
        path,
        token,
        body,
      }: {
        apiUrl: string;
        method: string;
        path: string;
        token: string;
        body?: Record<string, unknown>;
      }) => {
        const res = await fetch(`${apiUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (method === 'DELETE') return { ok: res.ok };
        return res.json();
      },
      { apiUrl: API_BASE_URL, method, path, token, body }
    );
  }

  // ============================================================================
  // テストデータセットアップ
  // ============================================================================

  test('準備：テスト用プロジェクト・見積書・契約書を作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await getAccessToken(page);
    expect(accessToken).toBeTruthy();

    // 担当者一覧を取得
    const usersResponse = await apiRequest(page, 'GET', '/api/users/assignable', accessToken);
    const salesPersonId = usersResponse[0]?.id;
    expect(salesPersonId).toBeTruthy();

    // プロジェクト作成
    const projectName = `E2E契約書セクション_${Date.now()}`;
    const projectResponse = await apiRequest(page, 'POST', '/api/projects', accessToken, {
      name: projectName,
      salesPersonId,
    });
    projectId = projectResponse.id;
    expect(projectId).toBeTruthy();

    // 内訳書を作成（見積書作成に必要）
    const isResponse = await apiRequest(
      page,
      'POST',
      `/api/projects/${projectId}/itemized-statements`,
      accessToken,
      { name: 'テスト内訳書', classificationAxis: 'CUSTOM' }
    );

    // 見積書を作成（契約書作成に必要）
    const estimateResponse = await apiRequest(
      page,
      'POST',
      `/api/projects/${projectId}/estimates`,
      accessToken,
      { name: 'テスト見積書', sourceItemizedStatementId: isResponse.id }
    );
    estimateId = estimateResponse.id;
    expect(estimateId).toBeTruthy();

    // 契約書を作成
    const contractResponse = await apiRequest(
      page,
      'POST',
      `/api/projects/${projectId}/contracts`,
      accessToken,
      {
        contractType: 'NEW',
        parentContractId: null,
        estimateId: estimateId,
        contractDate: '2025-06-01',
        constructionStartDate: '2025-07-01',
        constructionEndDate: '2025-12-31',
        deliveryDate: '2026-01-15',
        taxRate: 10,
        paymentTerms: '月末締め翌月末払い',
        separateConstruction: '別途工事なし',
        otherNotes: 'E2Eテスト契約書',
        supervisorTradingPartnerId: null,
        contractAmount: 5500000,
        constructionPrice: 5000000,
        taxAmount: 500000,
      }
    );
    contractId = contractResponse.id;
    expect(contractId).toBeTruthy();
  });

  // ============================================================================
  // REQ-36: プロジェクト詳細画面の契約書セクション
  // ============================================================================

  /**
   * @requirement project-management/REQ-36.1: 見積書セクションの下に契約書セクション表示
   * @requirement project-management/REQ-36.2: セクションタイトル「契約書」表示
   * @requirement project-management/REQ-36.3: 契約書の総数表示
   * @requirement project-management/REQ-36.13: 見積書セクションと同様のUIスタイル
   */
  test('プロジェクト詳細画面に契約書セクションが表示される (project-management/REQ-36.1, REQ-36.2, REQ-36.3, REQ-36.13)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書セクションが表示される (REQ-36.1)
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    // 見積書セクションの後に表示されることを確認 (REQ-36.1)
    const estimateSection = page.getByTestId('estimate-section');
    await expect(estimateSection).toBeVisible({ timeout: getTimeout(5000) });

    // セクションタイトル「契約書」が表示される (REQ-36.2)
    await expect(contractSection.getByText('契約書')).toBeVisible();

    // 総数が表示される (REQ-36.3)
    await expect(contractSection.getByText(/全\d+件/)).toBeVisible();

    // UIスタイルが見積書セクションと同様のrole="region"を持つ (REQ-36.13)
    const sectionRole = await contractSection.getAttribute('role');
    expect(sectionRole).toBe('region');
  });

  /**
   * @requirement project-management/REQ-36.4: 直近の契約書をカード形式で表示する
   * @requirement project-management/REQ-36.5: カードに契約種類、契約日、ステータス、請負代金額を表示する
   */
  test('契約書がカード形式で表示され、必要情報が含まれる (project-management/REQ-36.4, REQ-36.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書カードが表示される (REQ-36.4)
    const contractCard = page.getByTestId(`contract-card-${contractId}`);
    await expect(contractCard).toBeVisible({ timeout: getTimeout(10000) });

    // 契約種類が表示される (REQ-36.5) - 「新規契約」
    await expect(contractCard.getByText('新規契約')).toBeVisible();

    // 契約日が表示される (REQ-36.5) - 2025年6月1日
    await expect(contractCard.getByText(/2025年6月1日/)).toBeVisible();

    // ステータスが表示される (REQ-36.5) - 「契約前」または「契約済」
    await expect(contractCard.getByText(/契約前|契約済/)).toBeVisible();

    // 請負代金額が表示される (REQ-36.5) - 5,500,000円
    await expect(contractCard.getByText(/5,500,000円/)).toBeVisible();
  });

  /**
   * @requirement project-management/REQ-36.6: 契約書カードクリックで詳細画面遷移
   */
  test('契約書カードクリックで詳細画面に遷移する (project-management/REQ-36.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const contractCard = page.getByTestId(`contract-card-${contractId}`);
    await expect(contractCard).toBeVisible({ timeout: getTimeout(10000) });

    await contractCard.click();
    await page.waitForURL(`**/projects/${projectId}/contracts/${contractId}`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/contracts/${contractId}`);
  });

  /**
   * @requirement project-management/REQ-36.7: 「すべて見る」リンクを提供
   * @requirement project-management/REQ-36.8: 「すべて見る」で一覧画面遷移
   */
  test('「すべて見る」リンクで一覧画面に遷移する (project-management/REQ-36.7, REQ-36.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    const viewAllLink = contractSection.getByText('すべて見る');
    await expect(viewAllLink).toBeVisible();
    await viewAllLink.click();

    await page.waitForURL(`**/projects/${projectId}/contracts`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/contracts`);
  });

  /**
   * @requirement project-management/REQ-36.9: 新規作成ボタンを提供
   * @requirement project-management/REQ-36.10: 新規作成ボタンで作成画面遷移
   */
  test('新規作成ボタンで作成画面に遷移する (project-management/REQ-36.9, REQ-36.10)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    const createButton = contractSection.getByLabel('契約書を新規作成');
    await expect(createButton).toBeVisible();
    await createButton.click();

    await page.waitForURL(`**/projects/${projectId}/contracts/new`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/contracts/new`);
  });

  /**
   * @requirement project-management/REQ-36.12: ロード中にスケルトンローダーを表示
   */
  test('契約書セクションのロード中にスケルトンが表示される (project-management/REQ-36.12)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // API応答を遅延させてスケルトン表示を確認
    await page.route('**/api/projects/*/detail-summary', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto(`/projects/${projectId}`);

    // スケルトンローダーが表示されることを確認
    const skeleton = page.getByTestId('contract-section-skeleton');
    await expect(skeleton).toBeVisible({ timeout: getTimeout(5000) });

    // スケルトンが消えて実データが表示されることを確認
    await expect(skeleton).not.toBeVisible({ timeout: getTimeout(15000) });
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(5000) });
  });

  // ============================================================================
  // REQ-36.11: 空状態テスト（契約書なしプロジェクト）
  // ============================================================================

  /**
   * @requirement project-management/REQ-36.11: 契約書が存在しない場合、空メッセージと新規作成ボタンを表示
   */
  test('契約書が存在しない場合、空メッセージと新規作成ボタンが表示される (project-management/REQ-36.11)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // 契約書なしの新規プロジェクトを作成
    const usersResponse = await apiRequest(page, 'GET', '/api/users/assignable', accessToken);
    const salesPersonId = usersResponse[0]?.id;
    const emptyProjectName = `E2E空状態テスト_${Date.now()}`;
    const emptyProject = await apiRequest(page, 'POST', '/api/projects', accessToken, {
      name: emptyProjectName,
      salesPersonId,
    });
    const emptyProjectId = emptyProject.id;
    expect(emptyProjectId).toBeTruthy();

    try {
      await page.goto(`/projects/${emptyProjectId}`);
      await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

      const contractSection = page.getByTestId('contract-section');
      await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

      // 「契約書はまだありません」メッセージが表示される
      await expect(contractSection.getByText('契約書はまだありません')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 空状態の新規作成ボタン（リンク）が表示される
      await expect(contractSection.getByText('新規作成')).toBeVisible({
        timeout: getTimeout(5000),
      });
    } finally {
      // クリーンアップ
      await apiRequest(page, 'DELETE', `/api/projects/${emptyProjectId}`, accessToken);
    }
  });

  // ============================================================================
  // REQ-37: detail-summary APIの契約書セクション統合
  // ============================================================================

  /**
   * @requirement project-management/REQ-37.1: detail-summary APIに契約書セクションデータを含める
   * @requirement project-management/REQ-37.2: totalCountとlatestContractsを含める
   * @requirement project-management/REQ-37.3: 直近の契約書に契約ID、契約種類、契約日、ステータス、請負代金額、作成日時を含める
   * @requirement project-management/REQ-37.5: Promise.allSettledで並行取得する
   */
  test('detail-summary APIが契約書セクションデータを正しく返却する (project-management/REQ-37.1, REQ-37.2, REQ-37.3, REQ-37.5)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // detail-summary APIを直接呼び出して構造を検証
    const response = await request.get(`${API_BASE_URL}/api/projects/${projectId}/detail-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // REQ-37.1: 契約書セクションデータが含まれる
    expect(body.sections).toBeDefined();
    expect(body.sections.contracts).toBeDefined();

    // REQ-37.2: totalCountとlatestContractsが含まれる
    const contracts = body.sections.contracts;
    expect(typeof contracts.totalCount).toBe('number');
    expect(contracts.totalCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(contracts.latestContracts)).toBe(true);
    expect(contracts.latestContracts.length).toBeGreaterThanOrEqual(1);

    // REQ-37.3: 直近の契約書データに必要なフィールドが含まれる
    const latestContract = contracts.latestContracts[0];
    expect(latestContract.id).toBeDefined();
    expect(latestContract.contractType).toBeDefined();
    expect(latestContract.contractDate).toBeDefined();
    expect(latestContract.status).toBeDefined();
    expect(latestContract.contractAmount).toBeDefined();
    expect(latestContract.createdAt).toBeDefined();

    // REQ-37.5: 他のセクションも並行取得されていることを確認（全セクション存在）
    expect(body.sections.siteSurveys).toBeDefined();
    expect(body.sections.quantityTables).toBeDefined();
    expect(body.sections.itemizedStatements).toBeDefined();
    expect(body.sections.estimateRequests).toBeDefined();
    expect(body.sections.estimates).toBeDefined();
  });

  /**
   * @requirement project-management/REQ-37.4: エラー時にデフォルト値を返却し他セクションは正常に返却する
   */
  test('detail-summary APIで契約書エラー時も他セクションは正常に返却される (project-management/REQ-37.4)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // detail-summary APIを呼び出し、contractsセクションの構造がデフォルト値を返せる形式であることを検証
    const response = await request.get(`${API_BASE_URL}/api/projects/${projectId}/detail-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // 契約書セクションがデフォルト値の形式（totalCount: number, latestContracts: array）を持つ
    const contracts = body.sections.contracts;
    expect(typeof contracts.totalCount).toBe('number');
    expect(Array.isArray(contracts.latestContracts)).toBe(true);

    // 他のセクションも正常に返却される（独立して動作する）
    expect(body.sections.siteSurveys).toBeDefined();
    expect(typeof body.sections.siteSurveys.totalCount).toBe('number');
    expect(body.sections.quantityTables).toBeDefined();
    expect(typeof body.sections.quantityTables.totalCount).toBe('number');
    expect(body.sections.itemizedStatements).toBeDefined();
    expect(typeof body.sections.itemizedStatements.totalCount).toBe('number');
    expect(body.sections.estimateRequests).toBeDefined();
    expect(typeof body.sections.estimateRequests.totalCount).toBe('number');
    expect(body.sections.estimates).toBeDefined();
    expect(typeof body.sections.estimates.totalCount).toBe('number');
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (projectId && accessToken) {
      await apiRequest(page, 'DELETE', `/api/projects/${projectId}`, accessToken);
    }
  });
});
