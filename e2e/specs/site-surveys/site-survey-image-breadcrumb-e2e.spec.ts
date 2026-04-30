/**
 * @fileoverview 画像プレビュー画面（閲覧モード／編集モード）ブレッドクラムのE2Eテスト
 *
 * site-survey 機能 A 区分 受入基準カバレッジのうち REQ-2.8 / REQ-2.9 を担当する。
 * 既存 site-survey-breadcrumb.spec.ts は閲覧モードを暗黙的にカバーしているが、
 * 本ファイルでは閲覧モードと編集モードを明示的に区別し、両モードで同じ
 * ブレッドクラム階層（… > 現場調査一覧 > 現場調査 > 画像）が表示されることを検証する。
 *
 * Requirements coverage (site-survey):
 * - REQ-2.8: 画像プレビュー画面（閲覧モード）ブレッドクラムが
 *            「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」を表示する
 * - REQ-2.9: 画像プレビュー画面（編集モード）ブレッドクラムが
 *            「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」を表示する
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('画像プレビュー画面ブレッドクラム (REQ-2.8 / REQ-2.9)', () => {
  // 共有データ（プロジェクト・現場調査・画像）を順次セットアップするため serial 実行
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let uploadedImageId: string | null = null;
  let projectName = '';
  let surveyName = '';

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

      projectName = `画像BC検証PJ_${Date.now()}`;
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
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 現場調査作成
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      surveyName = `画像BC検証現場調査_${Date.now()}`;
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
      const surveyMatch = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = surveyMatch?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // 画像アップロード
      await page.waitForLoadState('networkidle');
      const fileInput = page.locator('input[type="file"]').first();
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

      // ページをリロードして画像IDを取得
      await page.reload();
      await page.waitForLoadState('networkidle');

      const uploadedImage = page.locator('[data-testid="photo-panel-item"] img');
      await expect(uploadedImage.first()).toBeVisible({ timeout: getTimeout(15000) });

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
  // REQ-2.8: 画像プレビュー画面（閲覧モード）ブレッドクラム
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.8: 画像プレビュー画面（閲覧モード）ブレッドクラム表示
   */
  test('REQ-2.8: 画像プレビュー画面（閲覧モード）のブレッドクラムに「… > 現場調査一覧 > 現場調査 > 画像」が表示される', async ({
    page,
  }) => {
    if (!createdSurveyId || !uploadedImageId) {
      throw new Error('事前準備が未完了です。createdSurveyId/uploadedImageId が未設定です。');
    }

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}/images/${uploadedImageId}`);
    await page.waitForLoadState('networkidle');

    // 閲覧モードであること（編集モードボタンのラベルが「編集モード」=未押下）を確認
    const editToggleButton = page.getByRole('button', { name: /編集モード|編集終了/ });
    await expect(editToggleButton).toBeVisible({ timeout: getTimeout(10000) });
    await expect(editToggleButton).toHaveAttribute('aria-pressed', 'false', {
      timeout: getTimeout(5000),
    });

    const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
    await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

    // ブレッドクラム階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像
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

    // 「画像」項目（最終項目）として、ブレッドクラム項目数が 6 つであることを確認
    const breadcrumbItems = breadcrumb.locator('li');
    await expect(breadcrumbItems).toHaveCount(6, { timeout: getTimeout(5000) });
  });

  // ==========================================================================
  // REQ-2.9: 画像プレビュー画面（編集モード）ブレッドクラム
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-2.9: 画像プレビュー画面（編集モード）ブレッドクラム表示
   */
  test('REQ-2.9: 画像プレビュー画面（編集モード）のブレッドクラムに「… > 現場調査一覧 > 現場調査 > 画像」が表示される', async ({
    page,
  }) => {
    if (!createdSurveyId || !uploadedImageId) {
      throw new Error('事前準備が未完了です。createdSurveyId/uploadedImageId が未設定です。');
    }

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}/images/${uploadedImageId}`);
    await page.waitForLoadState('networkidle');

    // 編集モードに切り替え
    const editToggleButton = page.getByRole('button', { name: /編集モード/ });
    await expect(editToggleButton).toBeVisible({ timeout: getTimeout(10000) });
    await editToggleButton.click();

    // 編集モードに遷移したことを確認（aria-pressed=true かつボタンラベルが「編集終了」に変化）
    const editEndButton = page.getByRole('button', { name: /編集終了/ });
    await expect(editEndButton).toBeVisible({ timeout: getTimeout(10000) });
    await expect(editEndButton).toHaveAttribute('aria-pressed', 'true', {
      timeout: getTimeout(5000),
    });

    // ブレッドクラムが編集モードでも保持されていることを確認
    const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
    await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

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

    const breadcrumbItems = breadcrumb.locator('li');
    await expect(breadcrumbItems).toHaveCount(6, { timeout: getTimeout(5000) });
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

      // 現場調査削除
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

      // プロジェクト削除
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
