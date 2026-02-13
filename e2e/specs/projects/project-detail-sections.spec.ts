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

    const salesPersonValue = await salesPersonSelect.inputValue();
    if (!salesPersonValue) {
      const options = await salesPersonSelect.locator('option').all();
      if (options.length > 1 && options[1]) {
        const firstUserOption = await options[1].getAttribute('value');
        if (firstUserOption) {
          await salesPersonSelect.selectOption(firstUserOption);
        }
      }
    }

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
     * @requirement project-management/REQ-25.7
     */
    test('数量表が存在しない場合に新規作成ボタンが表示される (project-management/REQ-25.7)', async ({
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
      await expect(isSection.getByText(/まず数量表を作成してください|数量表を作成/i)).toBeVisible({
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

      // APIリクエストを監視するための準備
      const detailSummaryRequests: string[] = [];
      const individualSectionRequests: string[] = [];

      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/detail-summary')) {
          detailSummaryRequests.push(url);
        }
        // 個別セクションAPI（旧パターン）のリクエスト検出
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

      // プロジェクト詳細画面に遷移
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(15000) });

      // detail-summary APIが呼ばれたことを確認
      expect(detailSummaryRequests.length).toBeGreaterThanOrEqual(1);

      // 個別セクションAPIが呼ばれていないことを確認（API効率化の検証）
      expect(individualSectionRequests.length).toBe(0);
    });

    /**
     * @requirement project-management/REQ-29.6
     */
    test('各セクションのリンク・ボタンが正常に動作する (project-management/REQ-29.6)', async ({
      page,
    }) => {
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
