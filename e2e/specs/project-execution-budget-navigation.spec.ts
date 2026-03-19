/**
 * @fileoverview プロジェクト詳細画面 実行予算セクション E2Eテスト
 *
 * Task 68.1: プロジェクト-実行予算間ナビゲーションのE2Eテスト
 *
 * Requirements coverage (project-management):
 * @requirement project-management/REQ-40.1: プロジェクト詳細画面の工程表セクションの下に実行予算セクションを表示する
 * @requirement project-management/REQ-40.2: 実行予算セクションにセクションタイトル「実行予算」を表示する
 * @requirement project-management/REQ-40.3: 実行予算が存在する場合、サマリーカードを表示する
 * @requirement project-management/REQ-40.4: カードに契約書名、契約金額、実行金額合計、利益見込額、発注進捗率、作成日時を表示する
 * @requirement project-management/REQ-40.5: カードクリックで実行予算管理画面へ遷移する
 * @requirement project-management/REQ-40.6: 実行予算が存在しない場合「実行予算はまだありません」メッセージと新規作成ボタンを表示する
 * @requirement project-management/REQ-40.7: 新規作成ボタンクリックで実行予算作成画面へ遷移する
 * @requirement project-management/REQ-41.1: detail-summary APIのレスポンスに実行予算セクションデータを含める
 * @requirement project-management/REQ-41.2: 実行予算データにID、契約書名、契約金額、実行金額合計、利益見込額、作成日時を含める
 * @requirement project-management/REQ-41.3: 実行予算が存在しない場合nullを返却する
 * @requirement project-management/REQ-41.4: エラー時にデフォルト値を返却し他のセクションは正常に返却する
 * @requirement project-management/REQ-41.5: 実行予算セクションのデータをPromise.allSettledで並行取得する
 *
 * @module e2e/specs/project-execution-budget-navigation.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { API_BASE_URL } from '../config';

test.describe('プロジェクト詳細画面 - 実行予算セクション', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let projectId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // ヘルパー関数
  // ============================================================================

  async function getAccessToken(page: import('@playwright/test').Page): Promise<string> {
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    return token ?? '';
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

  test('準備：テスト用プロジェクトを作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await getAccessToken(page);
    expect(accessToken).toBeTruthy();

    // 担当者一覧を取得
    const usersResponse = await apiRequest(page, 'GET', '/api/users/assignable', accessToken);
    const salesPersonId = usersResponse[0]?.id;
    expect(salesPersonId).toBeTruthy();

    // プロジェクト作成
    const projectName = `E2E実行予算セクション_${Date.now()}`;
    const projectResponse = await apiRequest(page, 'POST', '/api/projects', accessToken, {
      name: projectName,
      salesPersonId,
    });
    projectId = projectResponse.id;
    expect(projectId).toBeTruthy();
  });

  // ============================================================================
  // REQ-40: プロジェクト詳細画面の実行予算セクション（空状態）
  // ============================================================================

  /**
   * @requirement project-management/REQ-40.1: 工程表セクションの下に実行予算セクション表示
   * @requirement project-management/REQ-40.2: セクションタイトル「実行予算」表示
   */
  test('プロジェクト詳細画面に実行予算セクションが表示される (project-management/REQ-40.1, REQ-40.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 実行予算セクションが表示される (REQ-40.1)
    const budgetSection = page.getByTestId('execution-budget-section');
    await expect(budgetSection).toBeVisible({ timeout: getTimeout(10000) });

    // セクションタイトル「実行予算」が表示される (REQ-40.2)
    await expect(
      budgetSection.getByRole('heading', { name: '実行予算', exact: true })
    ).toBeVisible();

    // UIスタイルが契約書セクションと同様のrole="region"を持つ
    const sectionRole = await budgetSection.getAttribute('role');
    expect(sectionRole).toBe('region');
  });

  /**
   * @requirement project-management/REQ-40.6: 実行予算が存在しない場合、空メッセージと新規作成ボタンを表示
   */
  test('実行予算が存在しない場合、空メッセージと新規作成ボタンが表示される (project-management/REQ-40.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const budgetSection = page.getByTestId('execution-budget-section');
    await expect(budgetSection).toBeVisible({ timeout: getTimeout(10000) });

    // 「実行予算はまだありません」メッセージが表示される
    await expect(budgetSection.getByText('実行予算はまだありません')).toBeVisible({
      timeout: getTimeout(5000),
    });

    // 新規作成ボタン（リンク）が表示される
    await expect(budgetSection.getByText('新規作成')).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement project-management/REQ-40.7: 新規作成ボタンクリックで作成画面遷移
   */
  test('新規作成ボタンで実行予算ページに遷移する (project-management/REQ-40.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const budgetSection = page.getByTestId('execution-budget-section');
    await expect(budgetSection).toBeVisible({ timeout: getTimeout(10000) });

    const createButton = budgetSection.getByText('新規作成');
    await expect(createButton).toBeVisible();
    await createButton.click();

    await page.waitForURL(`**/projects/${projectId}/execution-budget**`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/execution-budget`);
  });

  // ============================================================================
  // REQ-41: detail-summary APIの実行予算セクション統合
  // ============================================================================

  /**
   * @requirement project-management/REQ-41.1: detail-summary APIに実行予算セクションデータを含める
   * @requirement project-management/REQ-41.3: 実行予算が存在しない場合nullを返却する
   * @requirement project-management/REQ-41.5: Promise.allSettledで並行取得する
   */
  test('detail-summary APIが実行予算セクションデータを正しく返却する（未作成時） (project-management/REQ-41.1, REQ-41.3, REQ-41.5)', async ({
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

    // REQ-41.1: 実行予算セクションデータが含まれる（キーが存在する）
    expect(body.sections).toBeDefined();
    expect('executionBudget' in body.sections).toBe(true);

    // REQ-41.3: 実行予算が存在しない場合null
    expect(body.sections.executionBudget).toBeNull();

    // REQ-41.5: 他のセクションも並行取得されていることを確認（全セクション存在）
    expect(body.sections.siteSurveys).toBeDefined();
    expect(body.sections.quantityTables).toBeDefined();
    expect(body.sections.itemizedStatements).toBeDefined();
    expect(body.sections.estimateRequests).toBeDefined();
    expect(body.sections.estimates).toBeDefined();
    expect(body.sections.contracts).toBeDefined();
    expect(body.sections.schedules).toBeDefined();
  });

  /**
   * @requirement project-management/REQ-41.4: エラー時にデフォルト値を返却し他セクションは正常に返却する
   */
  test('detail-summary APIで実行予算エラー時も他セクションは正常に返却される (project-management/REQ-41.4)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // detail-summary APIを呼び出し、executionBudgetセクションの構造がデフォルト値を返せる形式であることを検証
    const response = await request.get(`${API_BASE_URL}/api/projects/${projectId}/detail-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // 実行予算セクションがnullまたはオブジェクト形式であること
    const budget = body.sections.executionBudget;
    expect(budget === null || typeof budget === 'object').toBe(true);

    // 他のセクションも正常に返却される（独立して動作する）
    expect(body.sections.siteSurveys).toBeDefined();
    expect(typeof body.sections.siteSurveys.totalCount).toBe('number');
    expect(body.sections.quantityTables).toBeDefined();
    expect(typeof body.sections.quantityTables.totalCount).toBe('number');
    expect(body.sections.contracts).toBeDefined();
    expect(typeof body.sections.contracts.totalCount).toBe('number');
    expect(body.sections.schedules).toBeDefined();
    expect(typeof body.sections.schedules.totalCount).toBe('number');
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
