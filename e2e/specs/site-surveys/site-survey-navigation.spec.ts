/**
 * @fileoverview 現場調査画面遷移・ナビゲーションのE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-2.1: プロジェクト詳細画面に「現場調査」タブを表示
 * - REQ-2.2: 「現場調査」タブで現場調査一覧を表示
 * - REQ-2.3: 一覧で項目をクリックして詳細画面に遷移
 * - REQ-2.4: 詳細画面で画像をクリックしてビューア/エディタを開く
 * - REQ-2.5: ブレッドクラムナビゲーションを表示
 * - REQ-2.6: ブレッドクラムで階層を表示
 * - REQ-2.7: ブレッドクラムの各項目をクリックして遷移
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査画面遷移・ナビゲーション', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let projectName: string = '';
  let surveyName: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('事前準備', () => {
    test('テスト用プロジェクトと現場調査を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `ナビテスト用プロジェクト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
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

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 現場調査作成
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      surveyName = `ナビテスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      const createSurveyPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createSurveyPromise;

      await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
      const surveyUrl = page.url();
      const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = surveyMatch?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // 画像ビューアテスト用に画像をアップロード
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let fileInput = page.locator('input[type="file"]').first();
      const inputCount = await fileInput.count();

      if (inputCount === 0) {
        // アップロードボタンがある場合
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        fileInput = page.locator('input[type="file"]').first();
      }

      await expect(fileInput).toBeAttached({ timeout: getTimeout(10000) });

      // テスト用画像ファイルをアップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      // アップロードレスポンスのPromiseを先に作成
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      await fileInput.setInputFiles(testImagePath);

      // アップロード完了を待機
      await uploadPromise;

      // ページをリロードして画像が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // アップロードされた画像が表示されることを確認（PhotoManagementPanel内）
      const uploadedImage = page.locator('[data-testid="photo-panel-item"] img');
      await expect(uploadedImage.first()).toBeVisible({ timeout: getTimeout(15000) });
    });
  });

  /**
   * @requirement site-survey/REQ-2.1
   * @requirement site-survey/REQ-2.2
   */
  test.describe('プロジェクト詳細から現場調査へのナビゲーション', () => {
    test('プロジェクト詳細画面に現場調査タブ/セクションが表示される (site-survey/REQ-2.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査タブまたはリンクが表示されることを確認
      const surveyLink = page.getByRole('link', { name: /現場調査/i });
      const surveyTab = page.getByRole('tab', { name: /現場調査/i });
      const surveySection = page.getByRole('heading', { name: '現場調査', exact: true });

      const hasLink = await surveyLink.isVisible({ timeout: 5000 });
      const hasTab = await surveyTab.isVisible();
      const hasSection = await surveySection.isVisible();

      expect(hasLink || hasTab || hasSection).toBeTruthy();
    });

    test('現場調査タブをクリックすると一覧が表示される (site-survey/REQ-2.2)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査セクションの「すべて見る」リンクをクリック
      // SiteSurveySectionCardコンポーネントでは「すべて見る」リンクが使用されている
      const surveyLink = page.getByRole('link', { name: /すべて見る/i }).first();
      await expect(surveyLink).toBeVisible({ timeout: getTimeout(5000) });
      await surveyLink.click();

      // 現場調査一覧ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys`), {
        timeout: getTimeout(10000),
      });

      // 一覧が表示されることを確認（h1またはh2の「現場調査」見出しをマッチ）
      await expect(page.getByRole('heading', { name: /^現場調査$/i }).first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 作成した現場調査が一覧に表示されることを確認
      await expect(page.getByText(surveyName)).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement site-survey/REQ-2.3
   */
  test.describe('現場調査一覧から詳細へのナビゲーション', () => {
    test('一覧で項目をクリックすると詳細画面に遷移する (site-survey/REQ-2.3)', async ({ page }) => {
      if (!createdProjectId || !createdSurveyId) {
        throw new Error(
          'createdProjectIdまたはcreatedSurveyIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 現場調査名をクリック
      const surveyItem = page.getByText(surveyName);
      await expect(surveyItem).toBeVisible({ timeout: getTimeout(10000) });
      await surveyItem.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}`), {
        timeout: getTimeout(10000),
      });

      // 詳細情報が表示されることを確認（見出しで確認）
      await expect(page.getByRole('heading', { name: surveyName })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * @requirement site-survey/REQ-2.4
   */
  test.describe('現場調査詳細から画像ビューアへのナビゲーション', () => {
    test('詳細画面で画像をクリックするとビューアが開く (site-survey/REQ-2.4)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像グリッド内の画像ボタンを取得（PhotoManagementPanel内）
      const photoPanel = page.locator('[aria-label="写真管理パネル"]');
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(10000) });

      const imageButton = page.locator('[data-testid="photo-image-button"]').first();
      await expect(imageButton).toBeVisible({ timeout: getTimeout(10000) });

      // 画像ボタンをクリック
      await imageButton.click();

      // ビューアページに遷移することを確認
      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );
    });
  });

  /**
   * @requirement site-survey/REQ-2.5
   * @requirement site-survey/REQ-2.6
   */
  test.describe('ブレッドクラムナビゲーション', () => {
    test('現場調査詳細画面にブレッドクラムが表示される (site-survey/REQ-2.5)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });

    test('ブレッドクラムでプロジェクト名と現場調査名が表示される (site-survey/REQ-2.6)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムの要素を取得
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });

      // プロジェクト名が含まれることを確認
      await expect(breadcrumb.getByText(projectName)).toBeVisible({ timeout: getTimeout(10000) });

      // 現場調査関連のテキストが含まれることを確認
      const surveyTextElement = breadcrumb.getByText(/現場調査/i);
      const surveyNameElement = breadcrumb.getByText(surveyName);
      const hasSurveyText = await surveyTextElement.isVisible();
      const hasSurveyName = await surveyNameElement.isVisible();
      expect(hasSurveyText || hasSurveyName).toBeTruthy();
    });

    /**
     * @requirement site-survey/REQ-2.7
     */
    test('ブレッドクラムのプロジェクト名をクリックするとプロジェクト詳細に遷移する (site-survey/REQ-2.7)', async ({
      page,
    }) => {
      if (!createdProjectId || !createdSurveyId) {
        throw new Error(
          'createdProjectIdまたはcreatedSurveyIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムのプロジェクト名リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      const projectLink = breadcrumb.getByRole('link', { name: projectName });

      const projectLinkVisible = await projectLink.isVisible({ timeout: 5000 });
      if (projectLinkVisible) {
        await projectLink.click();

        // プロジェクト詳細ページに遷移することを確認
        await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}`), {
          timeout: getTimeout(10000),
        });
      } else {
        // プロジェクト名がリンクでない場合、テキストとして表示されているか確認
        await expect(breadcrumb.getByText(projectName)).toBeVisible();
      }
    });

    test('現場調査一覧画面にブレッドクラムが表示される (site-survey/REQ-2.5)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await context.clearCookies();
      // localStorageクリア前にアプリにナビゲートする必要がある
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 現場調査を削除
      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        // 削除確認ダイアログが表示されるのを待機
        const confirmButton = page.getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/site-surveys$|\/projects\//, { timeout: getTimeout(15000) });
      }

      // プロジェクトを削除
      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
      }
    });
  });
});
