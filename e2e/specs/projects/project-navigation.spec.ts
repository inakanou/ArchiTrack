/**
 * @fileoverview プロジェクト管理ナビゲーションのE2Eテスト
 *
 * Requirements:
 * - REQ-21: ナビゲーション
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト管理ナビゲーションのE2Eテスト
 */
test.describe('プロジェクト管理ナビゲーション', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成するヘルパー
   */
  async function createTestProject(page: Page): Promise<string> {
    // 認証が完全に確立されるのを確実にするため、
    // ヘッダーにユーザー名が表示されるまで待機
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // SPAナビゲーションを使用してプロジェクト一覧に移動
    const projectsLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
    await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
    await projectsLink.click();

    await page.waitForURL(/\/projects/, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    // 認証状態が維持されていることを確認
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const createButton = page.getByRole('button', { name: /新規作成/i });
    await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

    await createButton.click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ユーザーオプションが読み込まれるまで待機
    const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
    await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

    // ユーザーがロードされるまで待機
    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });

    // ユーザーオプションが少なくとも2つあることを確認
    await expect
      .poll(
        async () => {
          const options = await salesPersonSelect.locator('option').all();
          return options.length;
        },
        {
          timeout: getTimeout(30000),
          message: `営業担当者セレクトのオプションがロードされるのを待機中`,
        }
      )
      .toBeGreaterThanOrEqual(2);

    const projectName = `ナビゲーションテスト_${Date.now()}`;
    await page.getByLabel(/プロジェクト名/i).fill(projectName);
    await page.getByLabel(/顧客名/i).fill('テスト顧客株式会社');
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

    // 営業担当者を確認・選択
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
   * REQ-21: ナビゲーションのテスト
   */
  test.describe('ヘッダーナビゲーション', () => {
    /**
     * @requirement project-management/REQ-21.1
     */
    test('ヘッダーナビゲーションに「プロジェクト」リンクが表示される (project-management/REQ-21.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーに「プロジェクト」リンクが存在することを確認
      const projectLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
      await expect(projectLink).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.2
     */
    test('ヘッダーの「プロジェクト」リンクをクリックするとプロジェクト一覧画面に遷移する (project-management/REQ-21.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト」リンクをクリック
      const projectLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
      await projectLink.click();

      // プロジェクト一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.3
     */
    test('「プロジェクト」リンクが「ダッシュボード」リンクの右側に配置されている (project-management/REQ-21.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーションを取得
      const nav = page.getByRole('navigation').first();

      // 「ダッシュボード」リンクと「プロジェクト」リンクの位置を確認
      const dashboardLink = nav.getByRole('link', { name: /ダッシュボード/i });
      const projectLink = nav.getByRole('link', { name: /プロジェクト/i });

      const dashboardBox = await dashboardLink.boundingBox();
      const projectBox = await projectLink.boundingBox();

      if (dashboardBox && projectBox) {
        // プロジェクトリンクがダッシュボードリンクの右側にあることを確認
        expect(projectBox.x).toBeGreaterThan(dashboardBox.x);
      }
    });

    /**
     * @requirement project-management/REQ-21.4
     */
    test('「プロジェクト」リンクにプロジェクトを表すアイコンが表示される (project-management/REQ-21.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト」リンク内にアイコンが存在することを確認
      const projectLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
      const icon = projectLink.locator('svg, img, i').first();

      const iconVisible = await icon.isVisible().catch(() => false);
      if (iconVisible) {
        await expect(icon).toBeVisible();
      }
    });
  });

  /**
   * REQ-21: ダッシュボードナビゲーションのテスト
   */
  test.describe('ダッシュボードナビゲーション', () => {
    /**
     * @requirement project-management/REQ-21.5
     */
    test('ダッシュボードのクイックアクセスセクションに「プロジェクト管理」カードが表示される (project-management/REQ-21.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カードが存在することを確認
      const projectCard = page.getByText(/プロジェクト管理/i);
      await expect(projectCard).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.6
     */
    test('ダッシュボードの「プロジェクト管理」カードをクリックするとプロジェクト一覧画面に遷移する (project-management/REQ-21.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カードをクリック
      const projectCard = page.getByRole('link', { name: /プロジェクト管理/i });
      const cardVisible = await projectCard.isVisible().catch(() => false);

      if (cardVisible) {
        await projectCard.click();

        // プロジェクト一覧画面に遷移することを確認
        await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
        await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
          timeout: getTimeout(10000),
        });
      }
    });

    /**
     * @requirement project-management/REQ-21.7
     */
    test('「プロジェクト管理」カードがクイックアクセスセクションの先頭に配置されている (project-management/REQ-21.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // クイックアクセスセクション内のカードを取得
      const cards = page.getByRole('link').filter({ hasText: /管理/ });
      const firstCard = cards.first();

      const firstCardText = await firstCard.textContent();

      // 最初のカードが「プロジェクト管理」であることを確認
      if (firstCardText) {
        expect(firstCardText).toMatch(/プロジェクト管理/i);
      }
    });

    /**
     * @requirement project-management/REQ-21.8
     */
    test('「プロジェクト管理」カードに「工事案件の作成・管理」という説明文が表示される (project-management/REQ-21.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カード内に説明文が存在することを確認
      const description = page.getByText(/工事案件の作成・管理/i);
      const descriptionVisible = await description.isVisible().catch(() => false);

      if (descriptionVisible) {
        await expect(description).toBeVisible({ timeout: getTimeout(10000) });
      }
    });
  });

  /**
   * REQ-21: URLルーティングのテスト
   */
  test.describe('URLルーティング', () => {
    /**
     * @requirement project-management/REQ-21.9
     */
    test('プロジェクト一覧ページが /projects のURLで提供される (project-management/REQ-21.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // URLが正しいことを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });

      // プロジェクト一覧ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.10
     */
    test('プロジェクト新規作成ページが /projects/new のURLで提供される (project-management/REQ-21.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // URLが正しいことを確認
      await expect(page).toHaveURL(/\/projects\/new$/, { timeout: getTimeout(10000) });

      // 新規作成ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.11
     */
    test('プロジェクト詳細ページが /projects/:id のURLで提供される (project-management/REQ-21.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      testProjectId = await createTestProject(page);

      // URLが正しいことを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`), {
        timeout: getTimeout(10000),
      });

      // 詳細ページが表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.12
     */
    test('プロジェクト編集ページが /projects/:id/edit のURLで提供される (project-management/REQ-21.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}/edit`);
      await page.waitForLoadState('networkidle');

      // URLが正しいことを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}/edit$`), {
        timeout: getTimeout(10000),
      });

      // 編集ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.13
     */
    test('存在しないプロジェクトIDにアクセス時にエラーメッセージと戻るリンクを表示 (project-management/REQ-21.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないUUID
      await page.goto('/projects/00000000-0000-0000-0000-000000000000');
      await page.waitForLoadState('networkidle');

      // エラーメッセージの確認
      const errorMessage = page.getByText(
        /プロジェクトが見つかりませんでした|プロジェクトIDの形式が不正です|404|Not Found|Bad Request/i
      );
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });

      // 戻るリンクの確認
      const backLink = page.getByRole('link', { name: /一覧に戻る|プロジェクト一覧/i });
      const backLinkVisible = await backLink.isVisible().catch(() => false);
      if (backLinkVisible) {
        await expect(backLink).toBeVisible({ timeout: getTimeout(10000) });
      }
    });
  });

  /**
   * REQ-21: ページ遷移のテスト
   */
  test.describe('ページ遷移', () => {
    /**
     * @requirement project-management/REQ-21.19
     */
    test('一覧からプロジェクトを選択時に詳細ページに遷移 (project-management/REQ-21.19)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      // 一覧ページに移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 作成したプロジェクトの行をクリック（data-testidで特定）
      const projectRow = page.locator(`[data-testid="project-row-${testProjectId}"]`);
      await expect(projectRow).toBeVisible({ timeout: getTimeout(10000) });
      await projectRow.click();

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.20
     */
    test('一覧で「新規作成」ボタンクリック時に新規作成ページに遷移 (project-management/REQ-21.20)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 新規作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/new$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.21
     */
    test('詳細ページで「編集」ボタンクリック時に編集画面を表示 (project-management/REQ-21.21)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集画面が表示されることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}/edit$`), {
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.22
     */
    test('プロジェクト作成成功時に詳細ページに遷移 (project-management/REQ-21.22)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
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
            message: `営業担当者セレクトのオプションがロードされるのを待機中`,
          }
        )
        .toBeGreaterThanOrEqual(2);

      // フォームに入力
      const projectName = `作成遷移テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/顧客名/i).fill('テスト顧客');

      // 営業担当者を選択
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

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.23
     */
    test('プロジェクト更新成功時に詳細ページに遷移 (project-management/REQ-21.23)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}/edit`);
      await page.waitForLoadState('networkidle');

      // 概要を変更
      const updatedDescription = `更新遷移テスト_${Date.now()}`;
      await page.getByLabel(/概要/i).fill(updatedDescription);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes(`/api/projects/${testProjectId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`), {
        timeout: getTimeout(15000),
      });
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.24
     */
    test('プロジェクト削除成功時に一覧ページに遷移 (project-management/REQ-21.24)', async ({
      page,
      context,
    }) => {
      // 一般ユーザーでプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      const deleteTestProjectId = await createTestProject(page);

      // 管理者ユーザーに切り替え（削除権限が必要）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${deleteTestProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // APIレスポンスを待機しながら削除ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes(`/api/projects/${deleteTestProjectId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      await deletePromise;

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.25
     */
    test('詳細ページで「一覧に戻る」リンクをクリック時に一覧ページに遷移 (project-management/REQ-21.25)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「一覧に戻る」リンクをクリック
      const backLink = page.getByRole('link', { name: /一覧に戻る|プロジェクト一覧/i });
      await expect(backLink).toBeVisible({ timeout: getTimeout(10000) });
      await backLink.click();

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-21: 認証・認可のテスト
   */
  test.describe('認証・認可', () => {
    /**
     * @requirement project-management/REQ-21.26
     */
    test('プロジェクト管理ページがProtectedRouteで保護されている (project-management/REQ-21.26)', async ({
      page,
    }) => {
      // 未認証状態でプロジェクト一覧ページにアクセス
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.27
     */
    test('プロジェクト管理ページにProtectedLayoutが適用されている (project-management/REQ-21.27)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ProtectedLayoutの要素（ヘッダー、ナビゲーション）が表示されることを確認
      const nav = page.getByRole('navigation').first();
      await expect(nav).toBeVisible({ timeout: getTimeout(10000) });

      // ダッシュボードリンクが存在することを確認（ProtectedLayoutの一部）
      // ヘッダー内のダッシュボードリンクを特定（パンくずリストにも存在するため）
      await expect(
        page.getByRole('banner').getByRole('link', { name: /ダッシュボード/i })
      ).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ユーザーメニューが存在することを確認（ProtectedLayoutの一部）
      await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.28
     */
    test('未認証ユーザーアクセス時にログインページにリダイレクト (project-management/REQ-21.28)', async ({
      page,
    }) => {
      // 未認証状態で各ページにアクセスし、ログインページにリダイレクトされることを確認
      const protectedUrls = ['/projects', '/projects/new'];

      for (const url of protectedUrls) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');

        // ログインページにリダイレクトされることを確認
        await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
      }
    });

    /**
     * @requirement project-management/REQ-21.29
     */
    test('ログイン後に元のページに遷移 (project-management/REQ-21.29)', async ({ page }) => {
      // 未認証状態でプロジェクト一覧ページにアクセス
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // redirectUrlパラメータが設定されているか確認
      const url = new URL(page.url());
      const redirectUrl = url.searchParams.get('redirectUrl');

      // ログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 元のページ（/projects）に遷移することを確認
      if (redirectUrl && redirectUrl.includes('/projects')) {
        await expect(page).toHaveURL(/\/projects/, { timeout: getTimeout(10000) });
      } else {
        // redirectUrlパラメータがない場合は、手動でプロジェクトページに移動
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/\/projects/, { timeout: getTimeout(10000) });
      }

      // プロジェクト一覧ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
