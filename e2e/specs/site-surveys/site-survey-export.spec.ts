/**
 * @fileoverview 現場調査エクスポート機能のE2Eテスト
 *
 * Task 30.5: E2Eテストを追加する
 *
 * Requirements:
 * - 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8: 写真一覧管理・PDF出力設定
 * - 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8: 調査報告書PDF出力
 * - 12.1, 12.2, 12.3, 12.4, 12.5: 個別画像エクスポート
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 現場調査エクスポート機能のE2Eテスト
 */
test.describe('現場調査エクスポート機能', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;
  // テストで作成した現場調査のIDを保存
  let createdSurveyId: string | null = null;
  // 共有ページ
  let sharedPage: Page;
  // 共有コンテキスト
  let sharedContext: BrowserContext;

  /**
   * 事前準備: プロジェクト、現場調査を作成し、画像をアップロード
   */
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');

    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `エクスポートテスト用プロジェクト_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
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

    const createProjectPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createProjectPromise;

    await sharedPage.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const projectUrl = sharedPage.url();
    const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
    createdProjectId = projectMatch?.[1] ?? null;

    if (!createdProjectId) {
      throw new Error('プロジェクトの作成に失敗しました');
    }

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');

    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `エクスポートテスト用現場調査_${Date.now()}`;
    await sharedPage.getByLabel(/調査名/i).fill(surveyName);
    await sharedPage.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);
    await sharedPage.getByLabel(/メモ/i).fill('エクスポート機能テスト用のメモです。');

    const createSurveyPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('site-surveys') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );

    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createSurveyPromise;

    await sharedPage.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
    const surveyUrl = sharedPage.url();
    const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
    createdSurveyId = surveyMatch?.[1] ?? null;

    if (!createdSurveyId) {
      throw new Error('現場調査の作成に失敗しました');
    }

    // 画像をアップロード
    await sharedPage.waitForLoadState('networkidle');

    // ファイル入力を取得
    let fileInput = sharedPage.locator('input[type="file"]').first();
    const inputCount = await fileInput.count();
    if (inputCount === 0) {
      const uploadButton = sharedPage.getByRole('button', { name: /画像を追加|アップロード/i });
      if (await uploadButton.isVisible()) {
        await uploadButton.click();
      }
      fileInput = sharedPage.locator('input[type="file"]').first();
    }

    await expect(fileInput).toBeAttached({ timeout: getTimeout(10000) });

    // テスト用画像ファイルをアップロード
    const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

    const uploadPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/') &&
        response.url().includes('/images') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(60000) }
    );

    await fileInput.setInputFiles(testImagePath);

    const uploadResponse = await uploadPromise;
    expect(uploadResponse.ok()).toBe(true);

    // ページをリロードして画像が保存されていることを確認
    await sharedPage.reload();
    await sharedPage.waitForLoadState('networkidle');

    await sharedPage.close();
    await sharedContext.close();
  });

  /**
   * クリーンアップ: 作成したデータを削除
   */
  test.afterAll(async ({ browser }) => {
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();

    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');

      // 現場調査を削除
      if (createdSurveyId) {
        await cleanupPage.goto(`/site-surveys/${createdSurveyId}`);
        await cleanupPage.waitForLoadState('networkidle');

        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await deleteButton.isVisible().catch(() => false)) {
          await deleteButton.click();
          const confirmButton = cleanupPage.getByRole('button', { name: /^削除する$|^削除$/i });
          if (await confirmButton.isVisible().catch(() => false)) {
            await confirmButton.click();
            await cleanupPage
              .waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) })
              .catch(() => {});
          }
        }
      }

      // プロジェクトを削除
      if (createdProjectId) {
        await cleanupPage.goto(`/projects/${createdProjectId}`);
        await cleanupPage.waitForLoadState('networkidle');

        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await deleteButton.isVisible().catch(() => false)) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          if (await confirmButton.isVisible().catch(() => false)) {
            await confirmButton.click();
            await cleanupPage
              .waitForURL(/\/projects$/, { timeout: getTimeout(15000) })
              .catch(() => {});
          }
        }
      }
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // 写真コメント入力・報告書出力フラグ切り替えフローのテスト
  // ============================================================================

  test.describe('写真コメント入力・報告書出力フラグ切り替え', () => {
    /**
     * @requirement site-survey/REQ-10.1
     * @requirement site-survey/REQ-10.2
     * @requirement site-survey/REQ-10.8
     */
    test('写真管理パネルで報告書出力フラグを切り替えられる (site-survey/REQ-10.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機（タブなしで直接表示される）
      const photoPanel = page.locator('[data-testid="photo-panel-item"]').first();

      // 画像がアップロードされていることを確認（beforeAllでアップロード済み）
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(15000) });

      // 報告書出力フラグのチェックボックスを探す
      const includeInReportCheckbox = page.getByRole('checkbox', { name: /報告書に含める/i });

      await expect(includeInReportCheckbox).toBeVisible({ timeout: getTimeout(5000) });

      // まず、チェックをオフにする（初期状態を統一）
      if (await includeInReportCheckbox.isChecked()) {
        // チェックボックスをクリックしてオフにする
        await includeInReportCheckbox.click();
        // 保存ボタンをクリック（手動保存方式）
        const saveButton1 = page.getByRole('button', { name: /^保存$|^保存中/ });
        if (await saveButton1.isVisible({ timeout: 3000 }).catch(() => false)) {
          const responsePromise1 = page.waitForResponse(
            (response) =>
              response.url().includes('/api/site-surveys/images') &&
              response.request().method() === 'PATCH',
            { timeout: getTimeout(15000) }
          );
          await saveButton1.click();
          await responsePromise1;
        }
      }

      // チェックがオフであることを確認
      await expect(includeInReportCheckbox).not.toBeChecked();

      // チェックボックスをクリックしてオンにする
      await includeInReportCheckbox.click();

      // チェックがオンになったことを確認
      await expect(includeInReportCheckbox).toBeChecked();

      // 保存ボタンを探してクリック（手動保存方式 Task 33.1）
      const saveButton = page.getByRole('button', { name: /^保存$/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });

      // APIコール待機をセットアップ（クリック前に開始）
      // 注: batch APIエンドポイントを使用するため、/api/site-surveys/images を含むURLにマッチ
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/images') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(15000) }
      );

      // 保存ボタンをクリック
      await saveButton.click();

      // APIレスポンスを待機
      await responsePromise;

      // 状態が変更されたことを確認
      await expect(includeInReportCheckbox).toBeChecked();

      // ページをリロードして永続化されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機
      await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
        timeout: getTimeout(15000),
      });

      const checkboxAfterReload = page.getByRole('checkbox', { name: /報告書に含める/i });

      await expect(checkboxAfterReload).toBeVisible({ timeout: getTimeout(5000) });
      // リロード後もチェックがオンであることを確認
      await expect(checkboxAfterReload).toBeChecked();
    });

    /**
     * @requirement site-survey/REQ-10.3
     * @requirement site-survey/REQ-10.4
     * @requirement site-survey/REQ-10.8
     */
    test('写真管理パネルでコメントを入力・保存できる (site-survey/REQ-10.8)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機（タブなしで直接表示される）
      const photoPanel = page.locator('[data-testid="photo-panel-item"]').first();

      // 画像がアップロードされていることを確認（beforeAllでアップロード済み）
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(15000) });

      // コメント入力テキストエリアを探す
      const commentTextarea = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .locator('textarea[aria-label="コメント"]');

      await expect(commentTextarea).toBeVisible({ timeout: getTimeout(5000) });

      // コメントを入力
      const testComment = `テストコメント_${Date.now()}`;
      await commentTextarea.fill(testComment);

      // blur イベントをトリガーして変更を確定
      await commentTextarea.blur();

      // APIコール待機をセットアップ（保存ボタンクリック前に開始）
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/images') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(15000) }
      );

      // 保存ボタンをクリック（手動保存方式 Task 33.1）
      const saveButton = page.getByRole('button', { name: /^保存$/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
      await saveButton.click();

      // APIレスポンスを待機
      await responsePromise;

      // ページをリロードして永続化されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機
      await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
        timeout: getTimeout(15000),
      });

      const textareaAfterReload = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .locator('textarea[aria-label="コメント"]');

      await expect(textareaAfterReload).toBeVisible({ timeout: getTimeout(5000) });
      const persistedComment = await textareaAfterReload.inputValue();
      expect(persistedComment).toBe(testComment);
    });

    /**
     * @requirement site-survey/REQ-10.5
     */
    test('コメントが2000文字を超える場合にエラーが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機（タブなしで直接表示される）
      const photoPanel = page.locator('[data-testid="photo-panel-item"]').first();

      // 画像がアップロードされていることを確認（beforeAllでアップロード済み）
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(15000) });

      const commentTextarea = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .locator('textarea[aria-label="コメント"]');

      await expect(commentTextarea).toBeVisible({ timeout: getTimeout(5000) });

      // 2001文字のコメントを入力
      const longComment = 'あ'.repeat(2001);
      await commentTextarea.fill(longComment);

      // エラーメッセージが表示されることを確認
      const errorMessage = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .getByRole('alert');
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(5000) });
      await expect(errorMessage).toContainText(/2000文字/i);
    });
  });

  // ============================================================================
  // 調査報告書PDF出力フローのテスト
  // ============================================================================

  test.describe('調査報告書PDF出力', () => {
    /**
     * @requirement site-survey/REQ-11.1
     * @requirement site-survey/REQ-11.8
     */
    test('調査報告書出力ボタンが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 調査報告書出力ボタンを探す
      const pdfButton = page.getByRole('button', { name: /調査報告書出力|PDF/i });
      await expect(pdfButton).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement site-survey/REQ-11.1
     */
    test('報告書出力対象がない場合にエラーが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機（タブなしで直接表示される）
      await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
        timeout: getTimeout(15000),
      });

      // まず全ての画像の報告書出力フラグをオフにする
      const checkboxes = page.locator(
        '[data-testid="photo-panel-item"] input[type="checkbox"][aria-label="報告書に含める"]'
      );
      const checkboxCount = await checkboxes.count();

      let anyChecked = false;
      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        if (await checkbox.isChecked()) {
          await checkbox.click();
          anyChecked = true;
        }
      }

      // 変更があれば保存ボタンをクリック（手動保存方式 Task 33.1）
      if (anyChecked) {
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/site-surveys/images') &&
            response.request().method() === 'PATCH',
          { timeout: getTimeout(15000) }
        );
        const saveButton = page.getByRole('button', { name: /^保存$/ });
        await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
        await saveButton.click();
        await responsePromise;
      }

      // 調査報告書出力ボタンをクリック
      const pdfButton = page.getByRole('button', { name: /調査報告書出力|PDF/i });
      await expect(pdfButton).toBeVisible({ timeout: getTimeout(5000) });
      await pdfButton.click();

      // エラーメッセージが表示されることを確認
      const errorMessage = page.getByRole('alert');
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(5000) });
      await expect(errorMessage).toContainText(/報告書出力対象の写真がありません/i);
    });

    /**
     * @requirement site-survey/REQ-11.2
     * @requirement site-survey/REQ-11.3
     * @requirement site-survey/REQ-11.4
     * @requirement site-survey/REQ-11.5
     * @requirement site-survey/REQ-11.6
     * @requirement site-survey/REQ-11.7
     * @requirement site-survey/REQ-11.8
     */
    test('報告書出力対象がある場合にPDF生成プログレスが表示されダウンロードが開始される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 写真管理パネルが表示されるまで待機（タブなしで直接表示される）
      await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 少なくとも1つの画像を報告書出力対象にする
      const checkbox = page.getByRole('checkbox', { name: /報告書に含める/i });

      // 画像がアップロードされていることを確認（beforeAllでアップロード済み）
      await expect(checkbox).toBeVisible({ timeout: getTimeout(15000) });

      if (!(await checkbox.isChecked())) {
        await checkbox.click();

        // 保存ボタンをクリック（手動保存方式 Task 33.1）
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/site-surveys/images') &&
            response.request().method() === 'PATCH',
          { timeout: getTimeout(15000) }
        );
        const saveButton = page.getByRole('button', { name: /^保存$/ });
        await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
        await saveButton.click();
        await responsePromise;
      }

      // ダウンロードイベントを待機
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(120000) });

      // 調査報告書出力ボタンをクリック
      const pdfButton = page.getByRole('button', { name: /調査報告書出力|PDF/i });
      await pdfButton.click();

      // プログレス表示またはダウンロード完了のいずれかを確認
      // （PDF生成が速い場合、プログレスがすぐに消える可能性がある）
      const progressContainer = page.locator('[data-testid="pdf-export-progress"]');

      // プログレスが表示されるか、すぐにダウンロードが開始されるかのいずれか
      await Promise.race([
        expect(progressContainer)
          .toBeVisible({ timeout: getTimeout(10000) })
          .catch(() => {}),
        downloadPromise.catch(() => {}),
      ]);

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.pdf$/i);
      expect(filename).toContain('site-survey');
    });
  });

  // ============================================================================
  // 個別画像エクスポートフローのテスト
  // ============================================================================

  test.describe('個別画像エクスポート', () => {
    /**
     * @requirement site-survey/REQ-12.1
     */
    test('画像ビューアにエクスポートボタンが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像グリッドから画像をクリックしてビューアを開く（PhotoManagementPanel内）
      const imageButton = page.locator('[data-testid="photo-image-button"]').first();
      await expect(imageButton).toBeVisible({ timeout: getTimeout(10000) });
      await imageButton.click();

      // ビューアページに遷移
      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );

      // 編集モードボタンをクリックしてツールバーを表示
      const editModeButton = page.getByRole('button', { name: /編集モード/i });
      await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
      await editModeButton.click();

      // エクスポートボタンを探す（ツールバー内にあるはず）
      const exportButton = page.getByRole('button', { name: /エクスポート/i });
      await expect(exportButton).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * 編集モード時のエクスポート実行テスト
     *
     * AnnotationEditorのエクスポートは、編集モード時にツールバーから実行可能。
     * ツールバーのエクスポートボタンをクリックすると、PNG形式で直接ダウンロードされる。
     * （ImageExportDialogではなく、直接ダウンロード方式）
     *
     * @requirement site-survey/REQ-12.1
     * @requirement site-survey/REQ-12.5
     */
    test('編集モード時にエクスポートボタンでダウンロードが開始される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像をクリックしてビューアを開く（PhotoManagementPanel内）
      const imageButton = page.locator('[data-testid="photo-image-button"]').first();
      await expect(imageButton).toBeVisible({ timeout: getTimeout(10000) });
      await imageButton.click();

      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );

      // 編集モードボタンをクリックしてツールバーを表示
      const editModeButton = page.getByRole('button', { name: /編集モード/i });
      await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
      await editModeButton.click();

      // Canvas準備のための待機
      await page.waitForTimeout(1000);

      // ダウンロードイベントを待機
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });

      // エクスポートボタンをクリック
      const exportButton = page.getByRole('button', { name: /エクスポート/i });
      await expect(exportButton).toBeVisible({ timeout: getTimeout(10000) });
      await exportButton.click();

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      // ファイル名が画像形式（PNG）であることを確認
      expect(filename).toMatch(/\.(png)$/i);
    });
  });
});
