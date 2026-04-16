/**
 * @fileoverview 現場調査ブレッドクラム・タイトル・戻るリンクのE2Eテスト
 *
 * Task 52.3: E2Eテストでブレッドクラム・タイトル・戻るリンクの動作を検証する
 *
 * Requirements coverage (site-survey):
 * - REQ-2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - REQ-2.6: 一覧画面ブレッドクラム: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧
 * - REQ-2.7: 詳細画面ブレッドクラム: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査
 * - REQ-2.8: 画像プレビュー画面（閲覧モード）ブレッドクラム: ... > 現場調査 > 画像
 * - REQ-2.9: 画像プレビュー画面（編集モード）ブレッドクラム: ... > 現場調査 > 画像
 * - REQ-2.10: ブレッドクラム各項目クリックで対応画面へ遷移
 * - REQ-2.11: 現場調査一覧画面のタイトルが「現場調査一覧」であること
 * - REQ-2.12: 画像プレビュー画面に「← 現場調査に戻る」リンクが表示されないこと
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査ブレッドクラム・タイトル・戻るリンク', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let uploadedImageId: string | null = null;
  let projectName: string = '';
  let surveyName: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // 事前準備
  // ==========================================================================

  test.describe('事前準備', () => {
    test('テスト用プロジェクト・現場調査・画像を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `BC検証用PJ_${Date.now()}`;
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

      surveyName = `BC検証用現場調査_${Date.now()}`;
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

      // 画像アップロード
      await page.waitForLoadState('networkidle');

      let fileInput = page.locator('input[type="file"]').first();
      const inputCount = await fileInput.count();

      if (inputCount === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        fileInput = page.locator('input[type="file"]').first();
      }

      await expect(fileInput).toBeAttached({ timeout: getTimeout(10000) });

      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      await fileInput.setInputFiles(testImagePath);
      await uploadPromise;

      // ページリロードして画像IDを取得
      await page.reload();
      await page.waitForLoadState('networkidle');

      // アップロードされた画像が表示されることを確認
      const uploadedImage = page.locator('[data-testid="photo-panel-item"] img');
      await expect(uploadedImage.first()).toBeVisible({ timeout: getTimeout(15000) });

      // 画像ボタンをクリックしてビューアに遷移し、画像IDを取得
      const imageButton = page.locator('[data-testid="photo-image-button"]').first();
      await expect(imageButton).toBeVisible({ timeout: getTimeout(10000) });
      await imageButton.click();

      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );

      const imageUrl = page.url();
      const imageMatch = imageUrl.match(/\/images\/([0-9a-f-]+)/);
      uploadedImageId = imageMatch?.[1] ?? null;
      expect(uploadedImageId).toBeTruthy();
    });
  });

  // ==========================================================================
  // REQ-2.6: 一覧画面ブレッドクラム
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.5
   * @requirement site-survey/REQ-2.6
   */
  test.describe('現場調査一覧画面のブレッドクラム (REQ-2.5, REQ-2.6)', () => {
    test('ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧」が表示される', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 各ブレッドクラム項目を検証
      await expect(breadcrumb.getByText('ダッシュボード')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText(projectName)).toBeVisible({
        timeout: getTimeout(5000),
      });
      // 最後の項目「現場調査一覧」（現在のページ）
      await expect(breadcrumb.getByText('現場調査一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ==========================================================================
  // REQ-2.7: 詳細画面ブレッドクラム
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.5
   * @requirement site-survey/REQ-2.7
   */
  test.describe('現場調査詳細画面のブレッドクラム (REQ-2.5, REQ-2.7)', () => {
    test('ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査」が表示される', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 各ブレッドクラム項目を検証
      await expect(breadcrumb.getByText('ダッシュボード')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText(projectName)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText('現場調査一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
      // 最後の項目：現場調査名（現在のページ）
      await expect(breadcrumb.getByText(surveyName)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ==========================================================================
  // REQ-2.8, REQ-2.9: 画像プレビュー画面ブレッドクラム
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.5
   * @requirement site-survey/REQ-2.8
   * @requirement site-survey/REQ-2.9
   */
  test.describe('画像プレビュー画面のブレッドクラム (REQ-2.5, REQ-2.8, REQ-2.9)', () => {
    test('ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」が表示される', async ({
      page,
    }) => {
      if (!createdSurveyId || !uploadedImageId) {
        throw new Error(
          'createdSurveyIdまたはuploadedImageIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}/images/${uploadedImageId}`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 各ブレッドクラム項目を検証
      await expect(breadcrumb.getByText('ダッシュボード')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText(projectName)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText('現場調査一覧')).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(breadcrumb.getByText(surveyName)).toBeVisible({
        timeout: getTimeout(5000),
      });
      // 最後の項目：画像ファイル名（現在のページ）
      // 画像ファイル名は動的なので、ブレッドクラムの項目数が6つであることを確認
      const breadcrumbItems = breadcrumb.locator('li');
      await expect(breadcrumbItems).toHaveCount(6, { timeout: getTimeout(5000) });
    });
  });

  // ==========================================================================
  // REQ-2.10: ブレッドクラムのクリック遷移
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.10
   */
  test.describe('ブレッドクラムのクリック遷移 (REQ-2.10)', () => {
    test('詳細画面のブレッドクラム「ダッシュボード」クリックでダッシュボードに遷移する', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const dashboardLink = breadcrumb.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toBeVisible({ timeout: getTimeout(5000) });
      await dashboardLink.click();

      // ダッシュボードに遷移（ルートパス）
      await expect(page).toHaveURL(/^\/$|\/dashboard/, { timeout: getTimeout(10000) });
    });

    test('詳細画面のブレッドクラム「プロジェクト一覧」クリックでプロジェクト一覧に遷移する', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const projectListLink = breadcrumb.getByRole('link', { name: 'プロジェクト一覧' });
      await expect(projectListLink).toBeVisible({ timeout: getTimeout(5000) });
      await projectListLink.click();

      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
    });

    test('詳細画面のブレッドクラム「プロジェクト名」クリックでプロジェクト詳細に遷移する', async ({
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

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const projectLink = breadcrumb.getByRole('link', { name: projectName });
      await expect(projectLink).toBeVisible({ timeout: getTimeout(5000) });
      await projectLink.click();

      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}$`), {
        timeout: getTimeout(10000),
      });
    });

    test('詳細画面のブレッドクラム「現場調査一覧」クリックで一覧画面に遷移する', async ({
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

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const surveyListLink = breadcrumb.getByRole('link', { name: '現場調査一覧' });
      await expect(surveyListLink).toBeVisible({ timeout: getTimeout(5000) });
      await surveyListLink.click();

      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys$`), {
        timeout: getTimeout(10000),
      });
    });

    test('画像プレビュー画面のブレッドクラム「現場調査名」クリックで詳細画面に遷移する', async ({
      page,
    }) => {
      if (!createdSurveyId || !uploadedImageId) {
        throw new Error(
          'createdSurveyIdまたはuploadedImageIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}/images/${uploadedImageId}`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      const surveyLink = breadcrumb.getByRole('link', { name: surveyName });
      await expect(surveyLink).toBeVisible({ timeout: getTimeout(5000) });
      await surveyLink.click();

      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`), {
        timeout: getTimeout(10000),
      });
    });
  });

  // ==========================================================================
  // REQ-2.11: 一覧画面タイトル
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.11
   */
  test.describe('一覧画面タイトル (REQ-2.11)', () => {
    test('現場調査一覧画面のタイトルが「現場調査一覧」である', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // h1の「現場調査一覧」見出しが表示されることを確認
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ==========================================================================
  // REQ-2.12: 画像プレビュー画面の「← 現場調査に戻る」リンク非表示
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.12
   */
  test.describe('画像プレビュー画面の戻るリンク非表示 (REQ-2.12)', () => {
    test('画像プレビュー画面に「← 現場調査に戻る」リンクが表示されない', async ({ page }) => {
      if (!createdSurveyId || !uploadedImageId) {
        throw new Error(
          'createdSurveyIdまたはuploadedImageIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}/images/${uploadedImageId}`);
      await page.waitForLoadState('networkidle');

      // ページが読み込まれたことを確認（ブレッドクラムが表示されている）
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「← 現場調査に戻る」リンクが表示されないことを確認
      const backLink = page.getByRole('link', { name: /現場調査に戻る/ });
      await expect(backLink).not.toBeVisible({ timeout: getTimeout(3000) });

      // テキスト検索でも念のため確認
      const backText = page.getByText(/← 現場調査に戻る/);
      await expect(backText).not.toBeVisible({ timeout: getTimeout(3000) });
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await context.clearCookies();
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
