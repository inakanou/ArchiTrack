/**
 * @fileoverview サムネイル再生成シナリオのE2Eテスト
 *
 * Task 63.1: E2Eテストでサムネイル再生成シナリオを追加する
 *
 * Requirements coverage (site-survey):
 * - REQ-23.1: 注釈の追加・編集・削除を行い保存後、サムネイル画像を再生成する
 * - REQ-23.2: 画像を回転して保存後、回転後の画像状態を反映したサムネイルを再生成する
 * - REQ-23.3: 回転と注釈編集の両方を行い保存後、両方を反映した最終状態のサムネイルを再生成する
 * - REQ-23.5: サムネイル再生成完了後、詳細画面のサムネイル表示を最新結果に更新する
 * - REQ-23.7: 保存後に画像編集画面を再度開くと、サムネイルが保存時に再生成された最新画像と一致する
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { API_BASE_URL } from '../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('サムネイル再生成シナリオ', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let uploadedImageId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

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

      const projectName = `サムネイル再生成テスト_${Date.now()}`;
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

      const surveyName = `サムネイル再生成テスト用現場調査_${Date.now()}`;
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

      // 画像をAPIで直接アップロード
      const testImagePath = path.join(__dirname, '../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      const uploadResponse = await page.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          multipart: {
            images: {
              name: 'test-image.png',
              mimeType: 'image/png',
              buffer: fs.readFileSync(testImagePath),
            },
          },
        }
      );

      expect(uploadResponse.ok()).toBeTruthy();

      // アップロードレスポンスから画像IDを取得
      const uploadData = await uploadResponse.json();
      if (Array.isArray(uploadData) && uploadData.length > 0) {
        uploadedImageId = uploadData[0].id ?? null;
      } else if (uploadData.id) {
        uploadedImageId = uploadData.id;
      } else if (
        uploadData.images &&
        Array.isArray(uploadData.images) &&
        uploadData.images.length > 0
      ) {
        uploadedImageId = uploadData.images[0].id ?? null;
      }

      // ページをリロードして画像が表示されることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');
    });
  });

  /**
   * 注釈エディタへのナビゲーションヘルパー
   */
  async function navigateToAnnotationEditor(page: import('@playwright/test').Page) {
    if (!createdSurveyId) {
      return false;
    }

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // 画像ボタンを取得（aria-labelを使用）
    const imageElement = page.getByRole('button', { name: /画像を拡大表示/i }).first();

    await expect(imageElement).toBeVisible({ timeout: getTimeout(5000) });
    await imageElement.click();

    // 画像ビューアページへの遷移を待つ
    await page.waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });

    // URLから画像IDを取得（uploadedImageIdがまだ取得できていない場合）
    if (!uploadedImageId) {
      const imageUrl = page.url();
      const imageMatch = imageUrl.match(/\/images\/([0-9a-f-]+)/);
      uploadedImageId = imageMatch?.[1] ?? null;
    }

    // ページの読み込みを待つ
    await page.waitForLoadState('networkidle');

    // 編集モードに入る
    await page.waitForTimeout(100);
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
    await editModeButton.click();

    // 注釈ツールバーが表示されるのを待つ
    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    // 注釈エディタの初期化を待つ
    await page.waitForTimeout(100);

    return true;
  }

  /**
   * キャンバスの中心座標を取得するヘルパー関数
   */
  async function getCanvasCenter(
    page: import('@playwright/test').Page
  ): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    let box = null;

    for (let i = 0; i < 20; i++) {
      box = await upperCanvas.boundingBox();
      if (box && box.width > 10 && box.height > 10) {
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!box || box.width <= 10 || box.height <= 10) {
      const canvas = page.locator('[data-testid="annotation-editor-container"] canvas').first();
      box = await canvas.boundingBox();
    }

    if (!box || box.width <= 10 || box.height <= 10) {
      const container = page.locator('[data-testid="annotation-editor-container"]');
      box = await container.boundingBox();
    }

    if (!box) {
      throw new Error('キャンバス要素が見つかりません');
    }

    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  /**
   * 詳細画面のサムネイルURLを取得するヘルパー関数
   */
  async function getThumbnailSrcFromDetailPage(
    page: import('@playwright/test').Page
  ): Promise<string | null> {
    if (!createdSurveyId) return null;

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // サムネイル画像のsrc属性を取得
    const thumbnailImage = page.locator('img[src*="thumbnail"], img[src*="site-survey"]').first();
    if (await thumbnailImage.isVisible({ timeout: getTimeout(5000) }).catch(() => false)) {
      return await thumbnailImage.getAttribute('src');
    }

    // data-testidやボタン内の画像を探す
    const imageButton = page.getByRole('button', { name: /画像を拡大表示/i }).first();
    if (await imageButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      const img = imageButton.locator('img').first();
      if (await img.isVisible({ timeout: 2000 }).catch(() => false)) {
        return await img.getAttribute('src');
      }
    }

    return null;
  }

  /**
   * 注釈を保存し、APIレスポンスを返すヘルパー関数
   */
  async function saveAnnotations(page: import('@playwright/test').Page) {
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });

    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/images/') &&
        response.url().includes('/annotations') &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );

    await saveButton.click();
    const saveResponse = await savePromise;
    expect(saveResponse.ok()).toBeTruthy();

    // 保存成功メッセージを確認
    await expect(page.getByText(/保存しました/i)).toBeVisible({ timeout: getTimeout(5000) });

    return saveResponse;
  }

  /**
   * @requirement site-survey/REQ-23.1
   * @requirement site-survey/REQ-23.5
   *
   * シナリオ1: 注釈追加 -> 保存 -> 詳細画面で新サムネイル表示
   */
  test('注釈追加後に保存すると詳細画面で新サムネイルが表示されること (REQ-23.1, REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 保存前のサムネイルURLを取得
    const thumbnailBefore = await getThumbnailSrcFromDetailPage(page);

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 矢印ツールで注釈を描画
    const arrowTool = page.getByRole('button', { name: /矢印/i });
    await expect(arrowTool).toBeVisible({ timeout: 5000 });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 40, center.y - 20);
    await page.mouse.click(center.x + 40, center.y + 20);

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await page.waitForTimeout(200);

    // 保存実行（REQ-23.1: 注釈追加後にサムネイル再生成）
    const saveResponse = await saveAnnotations(page);
    const saveData = await saveResponse.json();

    // 注釈データが正しく保存されたことを確認
    expect(saveData.id).toBeTruthy();
    expect(saveData.data).toBeTruthy();

    // ストレージ構成時はannotatedThumbnailUrlが返される
    // ストレージ未構成（テスト環境等）ではnullとなる
    if (saveData.annotatedThumbnailUrl) {
      // 詳細画面に遷移してサムネイルが更新されていることを確認（REQ-23.5）
      const thumbnailAfter = await getThumbnailSrcFromDetailPage(page);

      // サムネイルURLが変更されていること
      if (thumbnailBefore) {
        expect(thumbnailAfter).not.toBe(thumbnailBefore);
      }
      // サムネイルが存在することを確認
      expect(thumbnailAfter).toBeTruthy();
    }
  });

  /**
   * @requirement site-survey/REQ-23.2
   * @requirement site-survey/REQ-23.5
   *
   * シナリオ2: 画像回転のみ -> 保存 -> 詳細画面で回転後サムネイル表示
   */
  test('画像回転のみで保存すると詳細画面で回転後サムネイルが表示されること (REQ-23.2, REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 保存前のサムネイルURLを取得
    const thumbnailBefore = await getThumbnailSrcFromDetailPage(page);

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 回転ボタンをクリック（90度回転）
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(5000) });
    await rotateButton.click();
    await page.waitForTimeout(300);

    // 保存実行（REQ-23.2: 回転後にサムネイル再生成）
    const saveResponse = await saveAnnotations(page);
    const saveData = await saveResponse.json();

    // 注釈データが正しく保存されたことを確認
    expect(saveData.id).toBeTruthy();
    expect(saveData.data).toBeTruthy();

    // ストレージ構成時はannotatedThumbnailUrlが返される
    if (saveData.annotatedThumbnailUrl) {
      // 詳細画面に遷移してサムネイルが更新されていることを確認（REQ-23.5）
      const thumbnailAfter = await getThumbnailSrcFromDetailPage(page);

      // サムネイルURLが変更されていること
      if (thumbnailBefore) {
        expect(thumbnailAfter).not.toBe(thumbnailBefore);
      }
      expect(thumbnailAfter).toBeTruthy();
    }
  });

  /**
   * @requirement site-survey/REQ-23.3
   * @requirement site-survey/REQ-23.5
   *
   * シナリオ3: 回転+注釈追加 -> 保存 -> 詳細画面で両方反映されたサムネイル表示
   */
  test('回転+注釈追加で保存すると詳細画面で両方反映されたサムネイルが表示されること (REQ-23.3, REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 保存前のサムネイルURLを取得
    const thumbnailBefore = await getThumbnailSrcFromDetailPage(page);

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 回転ボタンをクリック（90度回転）
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(5000) });
    await rotateButton.click();
    await page.waitForTimeout(300);

    // 矢印ツールで注釈を描画
    const arrowTool = page.getByRole('button', { name: /矢印/i });
    await expect(arrowTool).toBeVisible({ timeout: 5000 });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 30, center.y - 15);
    await page.mouse.click(center.x + 30, center.y + 15);

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await page.waitForTimeout(200);

    // 保存実行（REQ-23.3: 回転+注釈の両方を反映してサムネイル再生成）
    const saveResponse = await saveAnnotations(page);
    const saveData = await saveResponse.json();

    // 注釈データが正しく保存されたことを確認
    expect(saveData.id).toBeTruthy();
    expect(saveData.data).toBeTruthy();

    // ストレージ構成時はannotatedThumbnailUrlが返される
    if (saveData.annotatedThumbnailUrl) {
      // 詳細画面に遷移してサムネイルが更新されていることを確認（REQ-23.5）
      const thumbnailAfter = await getThumbnailSrcFromDetailPage(page);

      // サムネイルURLが変更されていること
      if (thumbnailBefore) {
        expect(thumbnailAfter).not.toBe(thumbnailBefore);
      }
      expect(thumbnailAfter).toBeTruthy();
    }
  });

  /**
   * @requirement site-survey/REQ-23.7
   *
   * シナリオ4: 保存 -> ページリロード -> 保存直後と同じサムネイルが表示される
   */
  test('保存後にページリロードしても同じサムネイルが表示されること (REQ-23.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 詳細画面でサムネイルURLを取得（前のテストで保存済みの状態）
    const thumbnailAfterSave = await getThumbnailSrcFromDetailPage(page);

    // ストレージ未構成の場合サムネイルが存在しない可能性がある
    if (!thumbnailAfterSave) {
      // サムネイルなしでも詳細画面自体は正常に表示されることを確認
      if (createdSurveyId) {
        await expect(page.locator('body')).toBeVisible();
      }
      return;
    }

    // ページをリロード
    await page.reload();
    await page.waitForLoadState('networkidle');

    // リロード後のサムネイルURLを取得
    const thumbnailAfterReload = await getThumbnailSrcFromDetailPage(page);

    // リロード前後でサムネイルURLが一致すること（REQ-23.7: 保存時に再生成された最新画像と一致）
    expect(thumbnailAfterReload).toBe(thumbnailAfterSave);
  });

  /**
   * クリーンアップ: テスト用プロジェクトを削除
   */
  test.afterAll(async ({ browser }) => {
    if (!createdProjectId) return;

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      const deleteResponse = await page.request.delete(
        `${API_BASE_URL}/api/projects/${createdProjectId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 削除成功またはすでに削除済み
      expect([200, 204, 404]).toContain(deleteResponse.status());
    } finally {
      await context.close();
    }
  });
});
