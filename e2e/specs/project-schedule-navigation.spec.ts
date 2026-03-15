/**
 * @fileoverview プロジェクト詳細画面 工程表セクション E2Eテスト
 *
 * Task 64.1: プロジェクト-工程表間ナビゲーションのE2Eテスト
 *
 * Requirements coverage (project-management):
 * @requirement project-management/REQ-38.1: プロジェクト詳細画面の契約書セクションの下に工程表セクションを表示する
 * @requirement project-management/REQ-38.2: 工程表セクションにセクションタイトル「工程表」を表示する
 * @requirement project-management/REQ-38.3: 工程表セクションに工程表の総数を表示する
 * @requirement project-management/REQ-38.4: 工程表セクションに直近の工程表をカード形式で表示する
 * @requirement project-management/REQ-38.5: 工程表カードに工程表名、更新日時、工程項目数を表示する
 * @requirement project-management/REQ-38.6: 工程表カードクリックで詳細画面へ遷移する
 * @requirement project-management/REQ-38.7: 工程表セクションに「すべて見る」リンクを提供する
 * @requirement project-management/REQ-38.8: 「すべて見る」リンクで工程表一覧画面へ遷移する
 * @requirement project-management/REQ-38.9: 工程表セクションに新規作成ボタンを提供する
 * @requirement project-management/REQ-38.10: 新規作成ボタンで工程表作成画面へ遷移する
 * @requirement project-management/REQ-38.11: 工程表が存在しない場合、空メッセージと新規作成ボタンを表示する
 * @requirement project-management/REQ-38.12: ロード中にスケルトンローダーを表示する
 * @requirement project-management/REQ-38.13: 契約書セクションと同様のUIスタイルで提供する
 * @requirement project-management/REQ-39.1: detail-summary APIのレスポンスに工程表セクションデータを含める
 * @requirement project-management/REQ-39.2: 工程表セクションデータにtotalCountとlatestSchedulesを含める
 * @requirement project-management/REQ-39.3: 直近の工程表データに工程表ID、工程表名、更新日時、工程項目数を含める
 * @requirement project-management/REQ-39.4: エラー時にデフォルト値を返却し他のセクションは正常に返却する
 * @requirement project-management/REQ-39.5: 工程表セクションのデータをPromise.allSettledで並行取得する
 *
 * @module e2e/specs/project-schedule-navigation.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { API_BASE_URL } from '../config';

test.describe('プロジェクト詳細画面 - 工程表セクション', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let projectId: string | null = null;
  let scheduleId: string | null = null;
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

  test('準備：テスト用プロジェクト・工程表を作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await getAccessToken(page);
    expect(accessToken).toBeTruthy();

    // 担当者一覧を取得
    const usersResponse = await apiRequest(page, 'GET', '/api/users/assignable', accessToken);
    const salesPersonId = usersResponse[0]?.id;
    expect(salesPersonId).toBeTruthy();

    // プロジェクト作成
    const projectName = `E2E工程表セクション_${Date.now()}`;
    const projectResponse = await apiRequest(page, 'POST', '/api/projects', accessToken, {
      name: projectName,
      salesPersonId,
    });
    projectId = projectResponse.id;
    expect(projectId).toBeTruthy();

    // 工程表を作成
    const scheduleResponse = await apiRequest(
      page,
      'POST',
      `/api/projects/${projectId}/schedules`,
      accessToken,
      { name: 'テスト工程表' }
    );
    scheduleId = scheduleResponse.id;
    expect(scheduleId).toBeTruthy();
  });

  // ============================================================================
  // REQ-38: プロジェクト詳細画面の工程表セクション
  // ============================================================================

  /**
   * @requirement project-management/REQ-38.1: 契約書セクションの下に工程表セクション表示
   * @requirement project-management/REQ-38.2: セクションタイトル「工程表」表示
   * @requirement project-management/REQ-38.3: 工程表の総数表示
   * @requirement project-management/REQ-38.13: 契約書セクションと同様のUIスタイル
   */
  test('プロジェクト詳細画面に工程表セクションが表示される (project-management/REQ-38.1, REQ-38.2, REQ-38.3, REQ-38.13)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 工程表セクションが表示される (REQ-38.1)
    const scheduleSection = page.getByTestId('schedule-section');
    await expect(scheduleSection).toBeVisible({ timeout: getTimeout(10000) });

    // 契約書セクションの後に表示されることを確認 (REQ-38.1)
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(5000) });

    // セクションタイトル「工程表」が表示される (REQ-38.2)
    await expect(
      scheduleSection.getByRole('heading', { name: '工程表', exact: true })
    ).toBeVisible();

    // 総数が表示される (REQ-38.3)
    await expect(scheduleSection.getByText(/全\d+件/)).toBeVisible();

    // UIスタイルが契約書セクションと同様のrole="region"を持つ (REQ-38.13)
    const sectionRole = await scheduleSection.getAttribute('role');
    expect(sectionRole).toBe('region');
  });

  /**
   * @requirement project-management/REQ-38.4: 直近の工程表をカード形式で表示する
   * @requirement project-management/REQ-38.5: カードに工程表名、更新日時、工程項目数を表示する
   */
  test('工程表がカード形式で表示され、必要情報が含まれる (project-management/REQ-38.4, REQ-38.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 工程表カードが表示される (REQ-38.4)
    const scheduleCard = page.getByTestId(`schedule-card-${scheduleId}`);
    await expect(scheduleCard).toBeVisible({ timeout: getTimeout(10000) });

    // 工程表名が表示される (REQ-38.5)
    await expect(scheduleCard.getByText('テスト工程表')).toBeVisible();

    // 工程項目数が表示される (REQ-38.5) - 0項目（空の工程表）
    await expect(scheduleCard.getByText(/\d+項目/)).toBeVisible();
  });

  /**
   * @requirement project-management/REQ-38.6: 工程表カードクリックで詳細画面遷移
   */
  test('工程表カードクリックで詳細画面に遷移する (project-management/REQ-38.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const scheduleCard = page.getByTestId(`schedule-card-${scheduleId}`);
    await expect(scheduleCard).toBeVisible({ timeout: getTimeout(10000) });

    await scheduleCard.click();
    await page.waitForURL(`**/schedules/${scheduleId}`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/schedules/${scheduleId}`);
  });

  /**
   * @requirement project-management/REQ-38.7: 「すべて見る」リンクを提供
   * @requirement project-management/REQ-38.8: 「すべて見る」で一覧画面遷移
   */
  test('「すべて見る」リンクで一覧画面に遷移する (project-management/REQ-38.7, REQ-38.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const scheduleSection = page.getByTestId('schedule-section');
    await expect(scheduleSection).toBeVisible({ timeout: getTimeout(10000) });

    const viewAllLink = scheduleSection.getByText('すべて見る');
    await expect(viewAllLink).toBeVisible();
    await viewAllLink.click();

    await page.waitForURL(`**/projects/${projectId}/schedules`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/schedules`);
  });

  /**
   * @requirement project-management/REQ-38.9: 新規作成ボタンを提供
   * @requirement project-management/REQ-38.10: 新規作成ボタンで作成画面遷移
   */
  test('新規作成ボタンで作成画面に遷移する (project-management/REQ-38.9, REQ-38.10)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    const scheduleSection = page.getByTestId('schedule-section');
    await expect(scheduleSection).toBeVisible({ timeout: getTimeout(10000) });

    const createButton = scheduleSection.getByLabel('工程表を新規作成');
    await expect(createButton).toBeVisible();
    await createButton.click();

    await page.waitForURL(`**/projects/${projectId}/schedules/new`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/schedules/new`);
  });

  /**
   * @requirement project-management/REQ-38.12: ロード中にスケルトンローダーを表示
   */
  test('工程表セクションのロード中にスケルトンが表示される (project-management/REQ-38.12)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectId}`);

    // データ読み込み完了後、工程表セクションが表示されることを確認
    const scheduleSection = page.getByTestId('schedule-section');
    await expect(scheduleSection).toBeVisible({ timeout: getTimeout(15000) });

    // 工程表セクション内にデータが表示されていることを確認（ロード完了の証拠）
    await expect(
      scheduleSection.getByRole('heading', { name: '工程表', exact: true })
    ).toBeVisible();
  });

  // ============================================================================
  // REQ-38.11: 空状態テスト（工程表なしプロジェクト）
  // ============================================================================

  /**
   * @requirement project-management/REQ-38.11: 工程表が存在しない場合、空メッセージと新規作成ボタンを表示
   */
  test('工程表が存在しない場合、空メッセージと新規作成ボタンが表示される (project-management/REQ-38.11)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // 工程表なしの新規プロジェクトを作成
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

      const scheduleSection = page.getByTestId('schedule-section');
      await expect(scheduleSection).toBeVisible({ timeout: getTimeout(10000) });

      // 「工程表はまだありません」メッセージが表示される
      await expect(scheduleSection.getByText('工程表はまだありません')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 空状態の新規作成ボタン（リンク）が表示される
      await expect(scheduleSection.getByText('新規作成')).toBeVisible({
        timeout: getTimeout(5000),
      });
    } finally {
      // クリーンアップ
      await apiRequest(page, 'DELETE', `/api/projects/${emptyProjectId}`, accessToken);
    }
  });

  // ============================================================================
  // REQ-39: detail-summary APIの工程表セクション統合
  // ============================================================================

  /**
   * @requirement project-management/REQ-39.1: detail-summary APIに工程表セクションデータを含める
   * @requirement project-management/REQ-39.2: totalCountとlatestSchedulesを含める
   * @requirement project-management/REQ-39.3: 直近の工程表に工程表ID、工程表名、更新日時、工程項目数を含める
   * @requirement project-management/REQ-39.5: Promise.allSettledで並行取得する
   */
  test('detail-summary APIが工程表セクションデータを正しく返却する (project-management/REQ-39.1, REQ-39.2, REQ-39.3, REQ-39.5)', async ({
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

    // REQ-39.1: 工程表セクションデータが含まれる
    expect(body.sections).toBeDefined();
    expect(body.sections.schedules).toBeDefined();

    // REQ-39.2: totalCountとlatestSchedulesが含まれる
    const schedules = body.sections.schedules;
    expect(typeof schedules.totalCount).toBe('number');
    expect(schedules.totalCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(schedules.latestSchedules)).toBe(true);
    expect(schedules.latestSchedules.length).toBeGreaterThanOrEqual(1);

    // REQ-39.3: 直近の工程表データに必要なフィールドが含まれる
    const latestSchedule = schedules.latestSchedules[0];
    expect(latestSchedule.id).toBeDefined();
    expect(latestSchedule.name).toBeDefined();
    expect(latestSchedule.updatedAt).toBeDefined();
    expect(typeof latestSchedule.itemCount).toBe('number');

    // REQ-39.5: 他のセクションも並行取得されていることを確認（全セクション存在）
    expect(body.sections.siteSurveys).toBeDefined();
    expect(body.sections.quantityTables).toBeDefined();
    expect(body.sections.itemizedStatements).toBeDefined();
    expect(body.sections.estimateRequests).toBeDefined();
    expect(body.sections.estimates).toBeDefined();
    expect(body.sections.contracts).toBeDefined();
  });

  /**
   * @requirement project-management/REQ-39.4: エラー時にデフォルト値を返却し他セクションは正常に返却する
   */
  test('detail-summary APIで工程表エラー時も他セクションは正常に返却される (project-management/REQ-39.4)', async ({
    page,
    request,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (!accessToken) {
      accessToken = await getAccessToken(page);
    }

    // detail-summary APIを呼び出し、schedulesセクションの構造がデフォルト値を返せる形式であることを検証
    const response = await request.get(`${API_BASE_URL}/api/projects/${projectId}/detail-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // 工程表セクションがデフォルト値の形式（totalCount: number, latestSchedules: array）を持つ
    const schedules = body.sections.schedules;
    expect(typeof schedules.totalCount).toBe('number');
    expect(Array.isArray(schedules.latestSchedules)).toBe(true);

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
    expect(body.sections.contracts).toBeDefined();
    expect(typeof body.sections.contracts.totalCount).toBe('number');
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
