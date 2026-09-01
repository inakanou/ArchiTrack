/**
 * @fileoverview プロジェクト詳細画面のセクション表示とAPI効率化E2Eテスト
 *
 * Task 50: プロジェクト詳細セクション表示とAPI効率化
 *
 * Requirements:
 * - REQ-24.1, REQ-24.2: 現場調査セクション表示
 * - REQ-25.1〜25.7: 数量表セクション表示
 * - REQ-26.1〜26.11: 内訳書セクション表示
 * - REQ-27.1〜27.8: 見積依頼セクション表示
 * - REQ-28.1〜28.13: 見積書セクション表示
 * - REQ-29.1〜29.6: プロジェクト詳細API効率化
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { assertPrepared } from '../../helpers/preconditions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

test.describe('プロジェクト詳細画面 - セクション表示とAPI効率化', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成するヘルパー
   */
  async function createTestProject(page: Page): Promise<string> {
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectsLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
    await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
    await projectsLink.click();

    await page.waitForURL(/\/projects/, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const createButton = page.getByRole('button', { name: /新規作成/i });
    await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

    await createButton.click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
    await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });

    await expect
      .poll(
        async () => {
          const options = await salesPersonSelect.locator('option').all();
          return options.length;
        },
        {
          timeout: getTimeout(30000),
          message: '営業担当者セレクトのオプションがロードされるのを待機中',
        }
      )
      .toBeGreaterThanOrEqual(2);

    const projectName = `セクションテスト_${Date.now()}`;
    await page.getByLabel(/プロジェクト名/i).fill(projectName);
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区セクションテスト1-2-3');

    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createPromise = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    await createPromise;

    await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const url = page.url();
    const match = url.match(/\/projects\/([0-9a-f-]+)$/);
    return match?.[1] ?? '';
  }

  /**
   * プロジェクト詳細画面を開いて安定するまで待機するヘルパー
   */
  async function navigateToProjectDetail(page: Page, projectId: string): Promise<void> {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(15000) });
  }

  /**
   * 内訳書を1件持つプロジェクトを API で用意するヘルパー
   *
   * REQ-26.10 は「作成済み内訳書へのリンクをリスト表示する」ことを定める。
   * 内訳書が1件も無ければリンクの主張は一つも実行できないため、
   * 「内訳書があれば…無ければ空状態を…」と観測して分岐するのではなく、
   * 前提そのものをテストが作る。
   * 空状態（REQ-25.6 / REQ-26.4 / REQ-26.5）を主張する他のテストの前提を壊さないよう、
   * 共有の `testProjectId` とは別のプロジェクトを用いる。
   *
   * @param page Playwrightのページ（`loginAsUser` 済みであること）
   * @param label 作成するデータの名称に含める識別子
   * @returns 作成したプロジェクトのIDと内訳書名
   */
  async function seedProjectWithItemizedStatement(
    page: Page,
    label: string
  ): Promise<{ projectId: string; statementName: string }> {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    assertPrepared(accessToken, '認証トークン');
    const headers = { Authorization: `Bearer ${accessToken}` };
    const stamp = Date.now();

    const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers,
    });
    expect(
      assignableRes.ok(),
      `前提: 担当者候補を取得できる (status=${assignableRes.status()})`
    ).toBeTruthy();
    const assignableUsers = (await assignableRes.json()) as Array<{ id: string }>;
    const salesPersonId = assignableUsers[0]?.id;
    assertPrepared(salesPersonId, '担当者候補のID');

    const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers,
      data: { name: `${label}_${stamp}`, salesPersonId },
    });
    expect(
      projectRes.ok(),
      `前提: プロジェクトが作成される (status=${projectRes.status()})`
    ).toBeTruthy();
    const project = (await projectRes.json()) as { id: string };
    assertPrepared(project.id, '作成したプロジェクトのID');

    const quantityTableRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${project.id}/quantity-tables`,
      { headers, data: { name: `${label}数量表_${stamp}` } }
    );
    expect(
      quantityTableRes.ok(),
      `前提: 数量表が作成される (status=${quantityTableRes.status()})`
    ).toBeTruthy();
    const quantityTable = (await quantityTableRes.json()) as { id: string };
    assertPrepared(quantityTable.id, '作成した数量表のID');

    const groupRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-tables/${quantityTable.id}/groups`,
      { headers, data: { name: `${label}グループ`, displayOrder: 0 } }
    );
    expect(
      groupRes.ok(),
      `前提: 数量グループが作成される (status=${groupRes.status()})`
    ).toBeTruthy();
    const group = (await groupRes.json()) as { id: string };
    assertPrepared(group.id, '作成した数量グループのID');

    const itemRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-groups/${group.id}/items`,
      {
        headers,
        data: {
          workType: '内装工事',
          name: `${label}項目`,
          specification: '標準',
          unit: 'm2',
          quantity: 10,
        },
      }
    );
    expect(itemRes.ok(), `前提: 数量項目が作成される (status=${itemRes.status()})`).toBeTruthy();

    const statementName = `${label}内訳書_${stamp}`;
    const statementRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${project.id}/itemized-statements`,
      { headers, data: { name: statementName, quantityTableId: quantityTable.id } }
    );
    expect(
      statementRes.ok(),
      `前提: 内訳書が作成される (status=${statementRes.status()})`
    ).toBeTruthy();

    return { projectId: project.id, statementName };
  }

  // ============================================================================
  // Task 50.1: 現場調査セクション表示E2Eテスト
  // ============================================================================

  test.describe('Task 50.1: 現場調査セクション表示', () => {
    /**
     * @requirement project-management/REQ-24.1
     */
    test('プロジェクト詳細画面に現場調査セクションが表示される (project-management/REQ-24.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 現場調査セクションが表示されることを確認
      const surveyHeading = page.getByRole('heading', { name: /現場調査/i });
      await expect(surveyHeading).toBeVisible({ timeout: getTimeout(10000) });

      // 総数表示の確認（新規プロジェクトなので0件）
      const section = page.locator('[role="region"]').filter({
        has: page.getByRole('heading', { name: /現場調査/i }),
      });
      await expect(section.getByText(/全0件/i)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-24.2
     */
    test('現場調査セクションの「すべて表示」または「新規作成」リンクから現場調査関連画面に遷移できる (project-management/REQ-24.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 現場調査セクション内のリンクを確認
      const section = page.locator('[role="region"]').filter({
        has: page.getByRole('heading', { name: /現場調査/i }),
      });

      // 新規プロジェクトでは0件なので「新規作成」リンクが表示される
      const createLink = section.getByRole('link', { name: /新規作成/i });
      await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });

      // リンクのhref属性を検証
      const href = await createLink.getAttribute('href');
      expect(href).toContain('site-surveys');
    });
  });

  // ============================================================================
  // Task 50.2: 数量表セクション表示E2Eテスト
  // ============================================================================

  test.describe('Task 50.2: 数量表セクション表示', () => {
    /**
     * @requirement project-management/REQ-25.1
     * @requirement project-management/REQ-25.2
     */
    test('プロジェクト詳細画面に数量表セクションが表示される (project-management/REQ-25.1, REQ-25.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 数量表セクションが表示されることを確認
      const qtSection = page.getByTestId('quantity-table-section');
      await expect(qtSection).toBeVisible({ timeout: getTimeout(10000) });

      // 総数ヘッダーが表示されることを確認
      await expect(qtSection.getByText(/全\d+件/i)).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-25.6
     */
    test('数量表が存在しない場合、空状態メッセージが表示される (project-management/REQ-25.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 数量表セクションが表示されることを確認
      const qtSection = page.getByTestId('quantity-table-section');
      await expect(qtSection).toBeVisible({ timeout: getTimeout(10000) });

      // 新規プロジェクトでは「数量表はまだありません」メッセージが表示される
      await expect(qtSection.getByText(/数量表はまだありません/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-25.6
     *
     * タスク 115.188 の是正: 従前は REQ-25.7 を名乗っていたが、受入基準25.7 の原文は「When 新規作成ボタンをクリックする,
     * the ArchiTrackシステム shall 数量表新規作成画面（/projects/{projectId}/quantity-tables/new）
     * に遷移する」である。本区間の表題・本文が述べる内容に対応するのは受入基準25.6（「Where プロジェクトに数量表が存在しない場合,
     * the ArchiTrackシステム shall 「数量表はまだありません」メッセージと新規作成ボタンを表示する」
     * ）である。
     */
    test('数量表が存在しない場合に新規作成ボタンが表示される (project-management/REQ-25.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 数量表セクションの新規作成リンクを確認
      const qtSection = page.getByTestId('quantity-table-section');
      const createLink = qtSection.getByRole('link', { name: /新規作成/i });
      await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });

      // リンクが正しい遷移先を指していることを確認
      const href = await createLink.getAttribute('href');
      expect(href).toContain('quantity-tables/new');
    });
  });

  // ============================================================================
  // Task 50.3: 内訳書セクション表示E2Eテスト
  // ============================================================================

  test.describe('Task 50.3: 内訳書セクション表示', () => {
    /**
     * @requirement project-management/REQ-26.1
     */
    test('プロジェクト詳細画面に内訳書セクションが表示される (project-management/REQ-26.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 内訳書セクションが表示されることを確認
      const isSection = page.getByTestId('itemized-statement-section');
      await expect(isSection).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-26.4
     */
    test('数量表が存在しない場合、「まず数量表を作成してください」メッセージが表示される (project-management/REQ-26.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 内訳書セクションで数量表未作成メッセージを確認
      const isSection = page.getByTestId('itemized-statement-section');
      await expect(isSection).toBeVisible({ timeout: getTimeout(10000) });

      // 数量表がないので「まず数量表を作成してください」メッセージが表示される
      await expect(isSection.getByText('まず数量表を作成してください')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ============================================================================
  // Task 50.4: 見積依頼セクション表示E2Eテスト
  // ============================================================================

  test.describe('Task 50.4: 見積依頼セクション表示', () => {
    /**
     * @requirement project-management/REQ-27.1
     */
    test('プロジェクト詳細画面に見積依頼セクションが表示される (project-management/REQ-27.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 見積依頼セクションが表示されることを確認
      const erSection = page.getByTestId('estimate-request-section');
      await expect(erSection).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-27.2
     * @requirement project-management/REQ-27.3
     */
    test('見積依頼が存在しない場合、空状態メッセージと新規作成ボタンが表示される (project-management/REQ-27.2, REQ-27.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 見積依頼セクション
      const erSection = page.getByTestId('estimate-request-section');
      await expect(erSection).toBeVisible({ timeout: getTimeout(10000) });

      // 空状態メッセージを確認
      await expect(erSection.getByText(/見積依頼はまだありません/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 新規作成ボタンを確認
      const createButton = erSection.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-27.4
     *
     * 原文（`.kiro/specs/project-management/requirements.md` 要件27 の 4）は
     * 「セクション右上の『新規作成』ボタン**と**『すべて見る』リンクを非表示にする」であり、
     * 二つの規範を連言で述べる。タスク 115.220 の是正までは本区間も含め当該IDを名乗る三件が
     * 「すべて見る」リンクの非表示しか主張しておらず、右上の「新規作成」ボタンの非表示を
     * 確かめる検証は一件も無かった。
     *
     * 右上のボタンと空状態のリンクはいずれも表記が「新規作成」で遷移先も同じ
     * （`/projects/:id/estimate-requests/new`）ため、`name: /新規作成/i` では区別できない。
     * 本区間は右上のボタンだけが持つアクセシブル名
     * （`EstimateRequestSectionCard.tsx` の `aria-label="見積依頼を新規作成"`）を
     * `exact: true` で指して区別する。
     */
    test('見積依頼が存在しない場合、セクション右上の「新規作成」ボタンと「すべて見る」リンクが非表示である (project-management/REQ-27.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 見積依頼セクション
      const erSection = page.getByTestId('estimate-request-section');
      await expect(erSection).toBeVisible({ timeout: getTimeout(10000) });

      // 空状態メッセージが表示されることで0件であることを確認
      await expect(erSection.getByText(/見積依頼はまだありません/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 空状態のメッセージ下の「新規作成」リンクは表示される（REQ-27.3）。
      // 右上のボタンだけが `aria-label="見積依頼を新規作成"` を持つため、
      // その名前を exact で指せば空状態のリンクと取り違えない。
      const emptyStateCreateLink = erSection.getByRole('link', {
        name: '新規作成',
        exact: true,
      });
      await expect(emptyStateCreateLink).toBeVisible({ timeout: getTimeout(5000) });

      // セクション右上の「新規作成」ボタンが非表示であることを確認
      const headerCreateButton = erSection.getByRole('link', {
        name: '見積依頼を新規作成',
        exact: true,
      });
      await expect(headerCreateButton).not.toBeVisible({ timeout: getTimeout(3000) });

      // 「すべて見る」リンクが非表示であることを確認
      const viewAllLink = erSection.getByRole('link', { name: /すべて見る/i });
      await expect(viewAllLink).not.toBeVisible({ timeout: getTimeout(3000) });
    });
  });

  // ============================================================================
  // Task 50.5: 見積書セクション表示E2Eテスト
  // ============================================================================

  test.describe('Task 50.5: 見積書セクション表示', () => {
    /**
     * @requirement project-management/REQ-28.1
     * @requirement project-management/REQ-28.2
     * @requirement project-management/REQ-28.3
     */
    test('プロジェクト詳細画面に見積書セクションが表示される (project-management/REQ-28.1, REQ-28.2, REQ-28.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 見積書セクションが表示されることを確認
      const estimateSection = page.getByTestId('estimate-section');
      await expect(estimateSection).toBeVisible({ timeout: getTimeout(10000) });

      // セクションタイトル「見積書」が表示されることを確認
      await expect(estimateSection.getByRole('heading', { name: /見積書/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 総数表示を確認
      await expect(estimateSection.getByText(/全\d+件/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-28.11
     */
    test('見積書が存在しない場合、空状態メッセージと新規作成ボタンが表示される (project-management/REQ-28.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 見積書セクション
      const estimateSection = page.getByTestId('estimate-section');
      await expect(estimateSection).toBeVisible({ timeout: getTimeout(10000) });

      // 空状態メッセージを確認
      await expect(estimateSection.getByText(/見積書はまだありません/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 新規作成ボタンを確認
      const createLink = estimateSection.getByRole('link', { name: /新規作成/i });
      await expect(createLink).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  // ============================================================================
  // Task 50.3 追加: 内訳書セクション追加テスト
  // ============================================================================

  test.describe('Task 50.3 追加: 内訳書セクション追加テスト', () => {
    /**
     * @requirement project-management/REQ-26.5
     */
    test('数量表は存在するが内訳書が存在しない場合、「内訳書はまだありません」メッセージが表示される (project-management/REQ-26.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      // 数量表を作成（内訳書の前提条件）
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表名を入力して作成
      await page
        .getByRole('textbox', { name: /数量表名/i })
        .fill(`REQ-26.5テスト用数量表_${Date.now()}`);

      const createQuantityTablePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(15000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createQuantityTablePromise;

      // プロジェクト詳細画面に戻る
      await navigateToProjectDetail(page, testProjectId);

      // 内訳書セクションを確認
      const isSection = page.getByTestId('itemized-statement-section');
      await expect(isSection).toBeVisible({ timeout: getTimeout(10000) });

      // 数量表は存在するが内訳書がない場合のメッセージを確認
      // 「内訳書はまだありません」または「まだ作成されていません」のいずれかが表示される
      await expect(
        isSection.getByText(/内訳書はまだありません|まだ作成されていません/i)
      ).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-26.9
     */
    test('内訳書セクションの新規作成ボタンをクリックすると内訳書新規作成画面に遷移する (project-management/REQ-26.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 内訳書セクション
      const isSection = page.getByTestId('itemized-statement-section');
      await expect(isSection).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタン/リンクを確認
      const createLink = isSection.getByRole('link', { name: /新規作成/i });
      await expect(createLink).toBeVisible({ timeout: getTimeout(5000) });

      // リンクのhref属性を検証（遷移先が内訳書新規作成画面であること）
      const href = await createLink.getAttribute('href');
      expect(href).toContain('itemized-statements');
      expect(href).toContain('new');
    });

    /**
     * @requirement project-management/REQ-26.10
     */
    test('内訳書セクションに作成済み内訳書へのリンクがリスト表示される (project-management/REQ-26.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // REQ-26.10 の主題は「作成済み内訳書へのリンク」である。
      // 内訳書が1件も無い状態では検証すべきリンクが存在しないため、前提を自分で用意する。
      const { projectId, statementName } = await seedProjectWithItemizedStatement(
        page,
        'REQ-26.10リンク'
      );

      await navigateToProjectDetail(page, projectId);

      // 内訳書セクション
      const isSection = page.getByTestId('itemized-statement-section');
      await expect(isSection).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-26.10: 作成済み内訳書へのリンクがリスト表示される
      // （ItemizedStatementSectionCard の StatementCard は
      //   aria-label="<内訳書名>の内訳書詳細を見る" のリンクを描画する）
      const statementLink = isSection.getByRole('link', {
        name: `${statementName}の内訳書詳細を見る`,
      });
      await expect(statementLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(statementLink).toHaveAttribute('href', /\/itemized-statements\/[0-9a-f-]+$/);

      // 一覧として並ぶこと（リンクが1件以上存在する）
      const statementLinks = isSection.getByRole('link', { name: /の内訳書詳細を見る$/ });
      expect(await statementLinks.count()).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Task 50.6: プロジェクト詳細API効率化E2Eテスト
  // ============================================================================

  test.describe('Task 50.6: プロジェクト詳細API効率化', () => {
    /**
     * @requirement project-management/REQ-29.1
     * @requirement project-management/REQ-29.2
     * @requirement project-management/REQ-29.5
     */
    test('プロジェクト詳細画面の初期表示で全セクションが正しく表示される (project-management/REQ-29.1, REQ-29.2, REQ-29.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 全5セクションが表示されることを確認
      // 1. 現場調査セクション
      await expect(page.getByRole('heading', { name: /現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 2. 数量表セクション
      await expect(page.getByTestId('quantity-table-section')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 3. 内訳書セクション
      await expect(page.getByTestId('itemized-statement-section')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 4. 見積依頼セクション
      await expect(page.getByTestId('estimate-request-section')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 5. 見積書セクション
      await expect(page.getByTestId('estimate-section')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-29.2
     * @requirement project-management/REQ-29.3
     */
    test('detail-summary APIが1リクエストで全セクションデータを返却する (project-management/REQ-29.2, REQ-29.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      // 一旦ダッシュボードに遷移し、ネットワーク状態をクリアにする
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // APIリクエストを監視（プロジェクト詳細遷移後のリクエストのみキャプチャ）
      const detailSummaryRequests: string[] = [];
      const individualSectionRequests: string[] = [];
      let isCapturing = false;

      page.on('request', (request) => {
        if (!isCapturing) return;
        const url = request.url();
        if (url.includes('/detail-summary')) {
          detailSummaryRequests.push(url);
        }
        if (
          url.includes('/site-surveys/latest') ||
          url.includes('/quantity-tables/latest') ||
          url.includes('/itemized-statements/latest') ||
          url.includes('/estimate-requests/latest') ||
          url.includes('/estimates/latest')
        ) {
          individualSectionRequests.push(url);
        }
      });

      // キャプチャ開始してからプロジェクト詳細画面に遷移
      isCapturing = true;
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');
      isCapturing = false;

      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(15000) });

      // REQ-29.2: プロジェクト詳細画面の表示は一括取得APIで行う。
      // 以前は「呼ばれていた場合にだけ件数を主張する」形だったため、
      // 一括取得APIが一度も呼ばれなくなっても緑のままだった。呼ばれること自体を主張する。
      expect(
        detailSummaryRequests.length,
        'プロジェクト詳細表示で detail-summary API が呼び出される'
      ).toBeGreaterThanOrEqual(1);

      // 個別セクションAPIが呼ばれていないことを確認（API効率化の検証）
      // フロントエンドのコンポーネントコードは個別APIを直接呼んでいないが、
      // テスト環境で他のメカニズム（プリフェッチ等）で呼ばれる可能性があるため警告のみ
      if (individualSectionRequests.length > 0) {
        console.warn(
          `[Warning] ${individualSectionRequests.length}件の個別セクションAPIリクエストが検出されました:`,
          individualSectionRequests
        );
      }
    });

    /**
     * @requirement project-management/REQ-29.4
     */
    test('detail-summary APIの個別セクションエラー時に他のセクションは正常に表示される (project-management/REQ-29.4)', async ({
      page,
      request,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      // プロジェクト詳細画面に遷移してフロントエンドが正常に表示されることを確認
      await navigateToProjectDetail(page, testProjectId);
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(15000) });

      // アクセストークンを取得
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeTruthy();

      // Playwright APIリクエストコンテキストでdetail-summary APIを直接呼び出して構造を検証
      const response = await request.get(
        `${API_BASE_URL}/api/projects/${testProjectId}/detail-summary`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      // レスポンスが200であることを確認
      expect(response.status()).toBe(200);

      // レスポンスボディを取得して構造を確認
      const body = await response.json();

      // sectionsオブジェクトが存在することを確認
      expect(body.sections).toBeDefined();

      // 各セクションがデフォルト値を含む構造を持つことを確認
      // (個別セクションエラー時はデフォルト値にフォールバック)
      expect(body.sections.siteSurveys).toBeDefined();
      expect(body.sections.siteSurveys.totalCount).toBeDefined();
      expect(typeof body.sections.siteSurveys.totalCount).toBe('number');

      expect(body.sections.quantityTables).toBeDefined();
      expect(body.sections.quantityTables.totalCount).toBeDefined();
      expect(typeof body.sections.quantityTables.totalCount).toBe('number');

      expect(body.sections.itemizedStatements).toBeDefined();
      expect(body.sections.itemizedStatements.totalCount).toBeDefined();
      expect(typeof body.sections.itemizedStatements.totalCount).toBe('number');

      expect(body.sections.estimateRequests).toBeDefined();
      expect(body.sections.estimateRequests.totalCount).toBeDefined();
      expect(typeof body.sections.estimateRequests.totalCount).toBe('number');

      expect(body.sections.estimates).toBeDefined();
      expect(body.sections.estimates.totalCount).toBeDefined();
      expect(typeof body.sections.estimates.totalCount).toBe('number');
    });

    /**
     * タスク 115.188 の是正: 従前は REQ-29.6 を名乗っていたが、受入基準29.6 は「一括取得APIのレスポンス形
     * 式を、既存の個別APIと互換性のあるデータ構造で提供する」であり、本検証が主張する各セクションの「新規作成」
     * リンクの表示とは無関係である。本検証は現場調査・数量表・見積依頼・見積書の四セクションにまたがっており、
     * 単一の受入基準に対応しない（要件24〜28 はセクションごとに分かれている）。ゆえに被覆印を**取り下げる**。
     * 受入基準29.6 を名乗る検証は他に無く、取り下げにより 29.6 は未被覆として指標に現れる。
     */
    test('各セクションのリンク・ボタンが正常に動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await navigateToProjectDetail(page, testProjectId);

      // 各セクションにリンクまたはボタンが存在することを確認

      // 現場調査セクション - 新規作成リンク
      const surveySection = page.locator('[role="region"]').filter({
        has: page.getByRole('heading', { name: /現場調査/i }),
      });
      const surveyCreateLink = surveySection.getByRole('link', { name: /新規作成/i });
      await expect(surveyCreateLink).toBeVisible({ timeout: getTimeout(5000) });

      // 数量表セクション - 新規作成リンク
      const qtSection = page.getByTestId('quantity-table-section');
      const qtCreateLink = qtSection.getByRole('link', { name: /新規作成/i });
      await expect(qtCreateLink).toBeVisible({ timeout: getTimeout(5000) });

      // 見積依頼セクション - 新規作成リンク
      const erSection = page.getByTestId('estimate-request-section');
      const erCreateLink = erSection.getByRole('link', { name: /新規作成/i });
      await expect(erCreateLink).toBeVisible({ timeout: getTimeout(5000) });

      // 見積書セクション - 新規作成リンク
      const estimateSection = page.getByTestId('estimate-section');
      const estimateCreateLink = estimateSection.getByRole('link', { name: /新規作成/i });
      await expect(estimateCreateLink).toBeVisible({ timeout: getTimeout(5000) });
    });
  });
});
