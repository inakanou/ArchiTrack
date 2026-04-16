/**
 * @fileoverview 画像アップロードバリデーションのE2Eテスト
 *
 * Task 49: 統合テスト・E2Eテストで回帰防止を確認する
 *
 * Requirements:
 * - 19.2: ICCプロファイル付きJPEG（4バイト目0xE2）を正常に受け付けて保存する
 * - 19.11: バッチアップロード結果にエラーが含まれる場合、エラーメッセージを表示する
 * - 19.14: ファイル形式の不一致による拒否時、どのファイルがどの理由で拒否されたか表示する
 * - 19.16: 全てのファイルが正常にアップロードされる場合、エラーメッセージを表示しない
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 画像アップロードバリデーションのE2Eテスト
 */
test.describe('画像アップロードバリデーション (Task 49)', () => {
  // 並列実行を無効化（共有データを使用するため）
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: プロジェクトと現場調査を作成
   */
  test('事前準備: テスト用プロジェクトと現場調査を作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト作成
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /新規作成/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `アップロードバリデーションテスト_${Date.now()}`;
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

    const surveyName = `バリデーションテスト用現場調査_${Date.now()}`;
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
  });

  /**
   * @requirement site-survey/REQ-19.11, REQ-19.14
   * 不正ファイルアップロード時にエラーメッセージが表示されること
   */
  test('不正マジックバイトのファイルアップロード時にエラーメッセージが表示される', async ({
    page,
  }) => {
    if (!createdSurveyId) {
      throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
    }

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // ファイル入力を取得
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached({ timeout: getTimeout(10000) });

    // 不正マジックバイトのファイル（GIF magic bytes in .jpg file）をアップロード
    const invalidFilePath = path.join(__dirname, '../../fixtures/test-invalid-magic.jpg');

    // アップロードAPIレスポンスを待機（207 Multi-Status or backend error）
    const uploadPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/') &&
        response.url().includes('/images') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(60000) }
    );

    await input.setInputFiles(invalidFilePath);

    // アップロード完了を待機
    await uploadPromise;

    // エラーメッセージが表示されることを確認 (Requirement 19.11, 19.14)
    // SiteSurveyDetailPageのerror表示（role="alert"）またはImageUploaderのupload-error
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: getTimeout(15000) });

    // エラーメッセージに失敗情報が含まれることを確認
    const errorText = await errorAlert.first().textContent();
    expect(errorText).toBeTruthy();
    expect(errorText).toMatch(/失敗|エラー|サポートされていない/);
  });

  /**
   * @requirement site-survey/REQ-19.16
   * 全件成功時にエラーメッセージが表示されないこと
   */
  test('正常な画像ファイルのアップロード時にエラーメッセージが表示されない', async ({ page }) => {
    if (!createdSurveyId) {
      throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
    }

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // ファイル入力を取得
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached({ timeout: getTimeout(10000) });

    // 正常なJPEGファイルをアップロード
    const validImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

    // アップロードAPIレスポンスを待機（201 Created）
    const uploadPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/') &&
        response.url().includes('/images') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(60000) }
    );

    await input.setInputFiles(validImagePath);

    // アップロード完了を待機
    await uploadPromise;

    // ページの状態が安定するまで待機
    await page.waitForLoadState('networkidle');

    // エラーメッセージ（role="alert"内のエラー表示）が表示されていないことを確認
    // Note: fetchData後にsetError(null)が呼ばれるため、エラー表示はクリアされる
    // ただし、画面上に「失敗」「エラー」を含むalertが無いことを確認
    const errorAlerts = page.locator('[role="alert"]');
    const alertCount = await errorAlerts.count();

    // alertが存在する場合、それがアップロードエラーでないことを確認
    for (let i = 0; i < alertCount; i++) {
      const alertText = await errorAlerts.nth(i).textContent();
      // アップロード失敗に関するエラーメッセージが表示されていないこと
      expect(alertText).not.toMatch(/アップロードに失敗/);
      expect(alertText).not.toMatch(/全.*件.*失敗/);
    }

    // アップロードされた画像が表示されていることを確認
    const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
    await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement site-survey/REQ-19.2
   * ICCプロファイル付きJPEG（4バイト目0xE2）のアップロードが成功すること
   */
  test('ICCプロファイル付きJPEGのアップロードが成功する', async ({ page }) => {
    if (!createdSurveyId) {
      throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
    }

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // ファイル入力を取得
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached({ timeout: getTimeout(10000) });

    // ICCプロファイル付きJPEG（4バイト目0xE2）をアップロード
    const iccImagePath = path.join(__dirname, '../../fixtures/test-image-icc.jpg');

    // アップロードAPIレスポンスを待機（201 Created）
    const uploadPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/') &&
        response.url().includes('/images') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(60000) }
    );

    await input.setInputFiles(iccImagePath);

    // アップロード完了を待機 - 201が返ること
    const uploadResponse = await uploadPromise;
    expect(uploadResponse.status()).toBe(201);

    // ページの状態が安定するまで待機
    await page.waitForLoadState('networkidle');

    // エラーメッセージが表示されていないことを確認
    const errorAlerts = page.locator('[role="alert"]');
    const alertCount = await errorAlerts.count();
    for (let i = 0; i < alertCount; i++) {
      const alertText = await errorAlerts.nth(i).textContent();
      expect(alertText).not.toMatch(/アップロードに失敗/);
    }
  });

  /**
   * クリーンアップ
   */
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
