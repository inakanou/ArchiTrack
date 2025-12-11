/**
 * @fileoverview プロジェクト管理パンくずナビゲーション表示E2Eテスト
 *
 * Task 20.1: パンくずナビゲーション表示E2Eテスト
 *
 * Requirements:
 * - REQ-21.14: 一覧ページで「ダッシュボード > プロジェクト」の表示
 * - REQ-21.15: 詳細ページで「ダッシュボード > プロジェクト > [プロジェクト名]」の表示
 * - REQ-21.16: 新規作成ページで「ダッシュボード > プロジェクト > 新規作成」の表示
 * - REQ-21.17: 編集ページで「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」の表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト管理パンくずナビゲーション表示E2Eテスト
 */
test.describe('プロジェクト管理パンくずナビゲーション表示', () => {
  test.describe.configure({ mode: 'serial' });

  // テスト用のプロジェクトID（テスト内で作成）
  let testProjectId: string;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成するヘルパー関数
   */
  async function createTestProject(page: import('@playwright/test').Page): Promise<{
    id: string;
    name: string;
  }> {
    // プロジェクト新規作成ページに遷移
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');

    // フォームが表示されるまで待機
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ユニークなプロジェクト名を生成
    const uniqueName = `テスト案件_${Date.now()}`;

    // フォームに入力（正規表現を使用）
    await page.getByLabel(/プロジェクト名/i).fill(uniqueName);
    await page.getByLabel(/顧客名/i).fill('テスト顧客株式会社');

    // 営業担当者はデフォルトでログインユーザーが選択されているはず

    // 作成ボタンをクリック
    const submitButton = page.getByRole('button', { name: '作成' });
    await submitButton.click();

    // 詳細ページに遷移するまで待機（作成ページや新規作成URLを除外）
    await page.waitForURL(
      (url) => {
        const pathname = url.pathname;
        return pathname.match(/\/projects\/[^/]+$/) !== null && !pathname.includes('/new');
      },
      { timeout: getTimeout(15000) }
    );
    await page.waitForLoadState('networkidle');

    // URLからIDを取得
    const url = page.url();
    const match = url.match(/\/projects\/([^/]+)$/);
    const projectId = match && match[1] ? match[1] : '';

    return { id: projectId, name: uniqueName };
  }

  /**
   * REQ-21.14: 一覧ページパンくずナビゲーション表示
   */
  test.describe('プロジェクト一覧ページ', () => {
    /**
     * @requirement project-management/REQ-21.14
     */
    test('一覧ページで「ダッシュボード > プロジェクト」のパンくずが表示される (project-management/REQ-21.14)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧ページに遷移
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが存在することを確認
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「ダッシュボード」リンクが表示されていることを確認
      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dashboardLink).toHaveAttribute('href', '/');

      // 「プロジェクト」テキストが表示されていることを確認（現在ページなのでリンクなし）
      const projectText = breadcrumb.getByText('プロジェクト');
      await expect(projectText).toBeVisible({ timeout: getTimeout(10000) });

      // 現在ページに aria-current="page" が設定されていることを確認
      const currentPage = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toHaveText('プロジェクト');

      // 区切り文字「>」が表示されていることを確認
      await expect(breadcrumb.getByText('>')).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * REQ-21.15: 詳細ページパンくずナビゲーション表示
   */
  test.describe('プロジェクト詳細ページ', () => {
    /**
     * @requirement project-management/REQ-21.15
     */
    test('詳細ページで「ダッシュボード > プロジェクト > [プロジェクト名]」のパンくずが表示される (project-management/REQ-21.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);
      testProjectId = project.id;

      // 詳細ページに遷移（作成後は既に詳細ページにいるので確認）
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが存在することを確認
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「ダッシュボード」リンクが表示されていることを確認
      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dashboardLink).toHaveAttribute('href', '/');

      // 「プロジェクト」リンクが表示されていることを確認
      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(projectsLink).toHaveAttribute('href', '/projects');

      // プロジェクト名テキストが表示されていることを確認（現在ページなのでリンクなし）
      // h1タグに表示されているプロジェクト名と同じ名前がパンくずにも表示される
      const pageTitle = page.locator('h1');
      const actualProjectName = await pageTitle.textContent();

      if (actualProjectName) {
        // パンくずにプロジェクト名が表示されていることを確認
        const projectNameInBreadcrumb = breadcrumb.locator('[aria-current="page"]');
        await expect(projectNameInBreadcrumb).toBeVisible({ timeout: getTimeout(10000) });

        // 現在ページに aria-current="page" が設定されていることを確認
        await expect(projectNameInBreadcrumb).toHaveAttribute('aria-current', 'page');
      }

      // 区切り文字「>」が2つ表示されていることを確認
      const separators = breadcrumb.getByText('>');
      await expect(separators).toHaveCount(2);
    });

    /**
     * @requirement project-management/REQ-21.15
     */
    test('プロジェクト名が動的に反映されることを確認 (project-management/REQ-21.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);

      // 詳細ページに遷移（作成後は既に詳細ページにいる場合もあるが、明示的に遷移）
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずにプロジェクト名が動的に反映されていることを確認
      // 作成時に指定したプロジェクト名がパンくずに表示されているか確認
      const projectNameInBreadcrumb = breadcrumb.locator('[aria-current="page"]');
      const breadcrumbText = await projectNameInBreadcrumb.textContent();

      // パンくずのテキストが作成したプロジェクト名を含むことを確認
      expect(breadcrumbText).toContain('テスト案件');
    });
  });

  /**
   * REQ-21.16: 新規作成ページパンくずナビゲーション表示
   */
  test.describe('プロジェクト新規作成ページ', () => {
    /**
     * @requirement project-management/REQ-21.16
     */
    test('新規作成ページで「ダッシュボード > プロジェクト > 新規作成」のパンくずが表示される (project-management/REQ-21.16)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト新規作成ページに遷移
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが存在することを確認
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「ダッシュボード」リンクが表示されていることを確認
      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dashboardLink).toHaveAttribute('href', '/');

      // 「プロジェクト」リンクが表示されていることを確認
      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(projectsLink).toHaveAttribute('href', '/projects');

      // 「新規作成」テキストが表示されていることを確認（現在ページなのでリンクなし）
      const createText = breadcrumb.getByText('新規作成');
      await expect(createText).toBeVisible({ timeout: getTimeout(10000) });

      // 現在ページに aria-current="page" が設定されていることを確認
      const currentPage = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toHaveText('新規作成');

      // 区切り文字「>」が2つ表示されていることを確認
      const separators = breadcrumb.getByText('>');
      await expect(separators).toHaveCount(2);
    });
  });

  /**
   * REQ-21.17: 編集ページパンくずナビゲーション表示
   */
  test.describe('プロジェクト編集ページ', () => {
    /**
     * @requirement project-management/REQ-21.17
     */
    test('編集ページで「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」のパンくずが表示される (project-management/REQ-21.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);
      testProjectId = project.id;

      // 編集ページに遷移
      await page.goto(`/projects/${testProjectId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが存在することを確認
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「ダッシュボード」リンクが表示されていることを確認
      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dashboardLink).toHaveAttribute('href', '/');

      // 「プロジェクト」リンクが表示されていることを確認
      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
      await expect(projectsLink).toHaveAttribute('href', '/projects');

      // プロジェクト名リンクが /projects/:id へのリンクを持つことを確認
      const allLinks = await breadcrumb.getByRole('link').all();
      let projectNameLinkFound = false;

      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (href && href.match(/\/projects\/[^/]+$/)) {
          projectNameLinkFound = true;
          break;
        }
      }

      expect(projectNameLinkFound).toBe(true);

      // 「編集」テキストが表示されていることを確認（現在ページなのでリンクなし）
      const editText = breadcrumb.getByText('編集');
      await expect(editText).toBeVisible({ timeout: getTimeout(10000) });

      // 現在ページに aria-current="page" が設定されていることを確認
      const currentPage = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toHaveText('編集');

      // 区切り文字「>」が3つ表示されていることを確認
      const separators = breadcrumb.getByText('>');
      await expect(separators).toHaveCount(3);
    });

    /**
     * @requirement project-management/REQ-21.17
     */
    test('編集ページのパンくずでプロジェクト名が動的に反映される (project-management/REQ-21.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);

      // 詳細ページでプロジェクト名を確認
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');

      const pageTitle = page.locator('h1');
      const expectedProjectName = await pageTitle.textContent();

      // 編集ページに遷移
      await page.goto(`/projects/${project.id}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくず内でプロジェクト名と一致するテキストのリンクを探す
      if (expectedProjectName) {
        const projectNameLink = breadcrumb.getByRole('link', { name: expectedProjectName });
        // プロジェクト名がリンクとして表示されていることを確認
        await expect(projectNameLink).toBeVisible({ timeout: getTimeout(10000) });
      }
    });
  });

  /**
   * Task 20.2: パンくずナビゲーション遷移E2Eテスト
   * REQ-21.18: パンくずナビゲーションからの遷移機能
   */
  test.describe('パンくずナビゲーション遷移', () => {
    /**
     * @requirement project-management/REQ-21.18
     */
    test('一覧ページのパンくずからダッシュボードリンクをクリックし、ダッシュボードページへ遷移する (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧ページに遷移
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「ダッシュボード」リンクをクリック
      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(10000) });
      await dashboardLink.click();

      // ダッシュボードページへ遷移したことを確認
      await page.waitForURL('/', { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // ダッシュボードページの特徴的な要素が表示されていることを確認
      const dashboard = page.locator('[data-testid="dashboard"]');
      await expect(dashboard).toBeVisible({ timeout: getTimeout(10000) });

      // 「ようこそ」というウェルカムメッセージが表示されていることを確認
      const welcomeHeading = page.getByRole('heading', { name: /ようこそ/i });
      await expect(welcomeHeading).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.18
     */
    test('新規作成ページのパンくずからプロジェクトリンクをクリックし、プロジェクト一覧ページへ遷移する (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成ページに遷移
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「プロジェクト」リンクをクリック
      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
      await projectsLink.click();

      // プロジェクト一覧ページへ遷移したことを確認
      await page.waitForURL('/projects', { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // プロジェクト一覧ページのパンくずが「ダッシュボード > プロジェクト」になっていることを確認
      const newBreadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(newBreadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 現在ページが「プロジェクト」になっていることを確認
      const currentPage = newBreadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toHaveText('プロジェクト');
    });

    /**
     * @requirement project-management/REQ-21.18
     */
    test('詳細ページのパンくずからプロジェクトリンクをクリックし、プロジェクト一覧ページへ遷移する (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);

      // 詳細ページに遷移
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「プロジェクト」リンクをクリック
      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
      await projectsLink.click();

      // プロジェクト一覧ページへ遷移したことを確認
      await page.waitForURL('/projects', { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // 遷移後も適切なパンくずが表示されることを確認
      const newBreadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      const currentPage = newBreadcrumb.locator('[aria-current="page"]');
      await expect(currentPage).toHaveText('プロジェクト');
    });

    /**
     * @requirement project-management/REQ-21.18
     */
    test('編集ページのパンくずからプロジェクト名リンクをクリックし、詳細ページへ遷移する (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);

      // 詳細ページでプロジェクト名を取得
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');

      const pageTitle = page.locator('h1');
      const expectedProjectName = await pageTitle.textContent();

      // 編集ページに遷移
      await page.goto(`/projects/${project.id}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションを取得
      const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名リンクをクリック
      if (expectedProjectName) {
        const projectNameLink = breadcrumb.getByRole('link', { name: expectedProjectName });
        await expect(projectNameLink).toBeVisible({ timeout: getTimeout(10000) });
        await projectNameLink.click();

        // 詳細ページへ遷移したことを確認（正規表現でIDパターンを検証）
        await page.waitForURL(
          (url) => {
            const pathname = url.pathname;
            return pathname.match(/\/projects\/[^/]+$/) !== null && !pathname.includes('/edit');
          },
          { timeout: getTimeout(15000) }
        );
        await page.waitForLoadState('networkidle');

        // 遷移後も適切なパンくずが表示されることを確認
        const newBreadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
        await expect(newBreadcrumb).toBeVisible({ timeout: getTimeout(10000) });

        // 現在ページがプロジェクト名になっていることを確認
        const currentPage = newBreadcrumb.locator('[aria-current="page"]');
        await expect(currentPage).toContainText('テスト案件');
      }
    });

    /**
     * @requirement project-management/REQ-21.18
     */
    test('現在ページ項目がクリック不可（リンクなし）であることを確認 (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各ページで現在ページ項目がリンクではないことを確認

      // 1. 一覧ページ：「プロジェクト」が現在ページ
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      let breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「プロジェクト」がリンクでないことを確認
      let currentPageElement = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPageElement).toBeVisible({ timeout: getTimeout(10000) });
      // リンク要素ではなくspanであることを確認（親がaタグでない）
      const listCurrentTagName = await currentPageElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      expect(listCurrentTagName).toBe('span');

      // 2. 新規作成ページ：「新規作成」が現在ページ
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      currentPageElement = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPageElement).toHaveText('新規作成');
      const createCurrentTagName = await currentPageElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      expect(createCurrentTagName).toBe('span');

      // 3. 詳細ページ：プロジェクト名が現在ページ
      const project = await createTestProject(page);
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');

      breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      currentPageElement = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPageElement).toContainText('テスト案件');
      const detailCurrentTagName = await currentPageElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      expect(detailCurrentTagName).toBe('span');

      // 4. 編集ページ：「編集」が現在ページ
      await page.goto(`/projects/${project.id}/edit`);
      await page.waitForLoadState('networkidle');

      breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      currentPageElement = breadcrumb.locator('[aria-current="page"]');
      await expect(currentPageElement).toHaveText('編集');
      const editCurrentTagName = await currentPageElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      expect(editCurrentTagName).toBe('span');
    });

    /**
     * @requirement project-management/REQ-21.18
     */
    test('パンくずナビゲーションから複数回の遷移ができる (project-management/REQ-21.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      const project = await createTestProject(page);

      // 編集ページに遷移
      await page.goto(`/projects/${project.id}/edit`);
      await page.waitForLoadState('networkidle');

      // 1. 編集ページ -> プロジェクト詳細ページ（プロジェクト名リンク）
      let breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名リンクを特定して詳細ページへ遷移
      const allLinks = await breadcrumb.getByRole('link').all();
      let projectNameLink: import('@playwright/test').Locator | undefined;
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (href && href.match(/\/projects\/[^/]+$/) && !href.includes('/projects/new')) {
          projectNameLink = link;
          break;
        }
      }
      expect(projectNameLink).toBeDefined();
      if (projectNameLink) {
        await projectNameLink.click();
        await page.waitForURL(/\/projects\/[^/]+$/, { timeout: getTimeout(15000) });
        await page.waitForLoadState('networkidle');
      }

      // 2. プロジェクト詳細ページ -> プロジェクト一覧ページ（プロジェクトリンク）
      breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const projectsLink = breadcrumb.getByRole('link', { name: 'プロジェクト' });
      await projectsLink.click();
      await page.waitForURL('/projects', { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // 3. プロジェクト一覧ページ -> ダッシュボード（ダッシュボードリンク）
      breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await dashboardLink.click();

      // ダッシュボードページに遷移していることを確認（URLよりも要素の表示を優先）
      const dashboard = page.locator('[data-testid="dashboard"]');
      await expect(dashboard).toBeVisible({ timeout: getTimeout(15000) });

      // 「ようこそ」というウェルカムメッセージが表示されていることを確認
      const welcomeHeading = page.getByRole('heading', { name: /ようこそ/i });
      await expect(welcomeHeading).toBeVisible({ timeout: getTimeout(10000) });
    });
  });
});
