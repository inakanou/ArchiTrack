/**
 * @fileoverview 現場調査画像回転機能のE2Eテスト
 *
 * Task 59.4: E2Eテストで画像回転機能の動作を検証する
 *
 * Requirements coverage (site-survey):
 * - REQ-22.1: 注釈エディタ（編集モード）で回転ボタンを押すと背景画像を90度単位で回転する
 * - REQ-22.2: 描画済みの注釈オブジェクトを回転に追従させず、現在の位置・サイズを維持する
 * - REQ-22.3: 回転後の画像サイズに合わせてキャンバスのサイズを調整する
 * - REQ-22.4: 回転操作後に保存ボタンを押すと回転状態を含む画像データを永続化する
 * - REQ-22.5: 回転済み画像を再度開くと保存された回転状態を復元して表示する
 * - REQ-22.6: 回転操作をUndo/Redo履歴に記録する
 * - REQ-22.7: 注釈エディタの回転ボタンを既存のツールバーに配置する
 * - REQ-22.8: 累積回転角度（0度/90度/180度/270度）を正しく管理する
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査画像回転機能', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;

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

      const projectName = `画像回転テスト用プロジェクト_${Date.now()}`;
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

      const surveyName = `画像回転テスト用現場調査_${Date.now()}`;
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
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
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

    // キャンバスサイズが10px以上になるまで最大10秒待機
    for (let i = 0; i < 20; i++) {
      box = await upperCanvas.boundingBox();
      if (box && box.width > 10 && box.height > 10) {
        break;
      }
      await page.waitForTimeout(500);
    }

    // それでも見つからない場合はcanvas要素を試す
    if (!box || box.width <= 10 || box.height <= 10) {
      const canvas = page.locator('[data-testid="annotation-editor-container"] canvas').first();
      box = await canvas.boundingBox();
    }

    // それでも見つからない場合はコンテナを使用
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
   * キャンバスのサイズを取得するヘルパー関数
   */
  async function getCanvasSize(
    page: import('@playwright/test').Page
  ): Promise<{ width: number; height: number }> {
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
      throw new Error('キャンバスのサイズを取得できません');
    }

    return { width: box.width, height: box.height };
  }

  /**
   * @requirement site-survey/REQ-22.1
   * @requirement site-survey/REQ-22.7
   */
  test('回転ボタンクリックにより画像が90度回転すること (REQ-22.1, REQ-22.7)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 回転ボタンがツールバーに存在することを確認 (REQ-22.7)
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(5000) });

    // 回転前のキャンバスサイズを取得
    const sizeBefore = await getCanvasSize(page);

    // 回転ボタンをクリック (REQ-22.1)
    await rotateButton.click();

    // 回転が適用されるまで少し待機
    await page.waitForTimeout(300);

    // 回転後のキャンバスサイズを取得
    const sizeAfter = await getCanvasSize(page);

    // 90度回転すると幅と高さが入れ替わるはず (REQ-22.3)
    // テスト画像が正方形でなければ、幅と高さが変化する
    // 少なくともキャンバスが有効なサイズであることを確認
    expect(sizeAfter.width).toBeGreaterThan(0);
    expect(sizeAfter.height).toBeGreaterThan(0);

    // 正方形でない画像の場合、幅と高さが入れ替わることを確認
    if (Math.abs(sizeBefore.width - sizeBefore.height) > 5) {
      // 幅と高さが入れ替わったことを確認（許容誤差5px）
      expect(Math.abs(sizeAfter.width - sizeBefore.height)).toBeLessThan(5);
      expect(Math.abs(sizeAfter.height - sizeBefore.width)).toBeLessThan(5);
    }
  });

  /**
   * @requirement site-survey/REQ-22.2
   */
  test('回転後に既存の注釈が同じ位置に表示されること (REQ-22.2)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // まず注釈（矢印）を描画する
    const arrowTool = page.getByRole('button', { name: /矢印/i });
    await expect(arrowTool).toBeVisible({ timeout: 5000 });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    // キャンバス上で描画
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 40, center.y - 20);
    await page.mouse.click(center.x + 40, center.y + 20);

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await page.waitForTimeout(200);

    // 注釈オブジェクトの位置情報を取得（Fabric.jsのキャンバスオブジェクトから）
    const objectsBefore = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) return [];
      return (
        canvas
          .getObjects()
          .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj: any) => obj !== canvas.backgroundImage
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((obj: any) => ({
            left: obj.left,
            top: obj.top,
            width: obj.width,
            height: obj.height,
          }))
      );
    });

    // 回転ボタンをクリック
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await rotateButton.click();
    await page.waitForTimeout(300);

    // 回転後の注釈オブジェクトの位置情報を取得
    const objectsAfter = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) return [];
      return (
        canvas
          .getObjects()
          .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj: any) => obj !== canvas.backgroundImage
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((obj: any) => ({
            left: obj.left,
            top: obj.top,
            width: obj.width,
            height: obj.height,
          }))
      );
    });

    // 注釈オブジェクトの数が同じであること
    expect(objectsAfter.length).toBe(objectsBefore.length);

    // 注釈オブジェクトの位置・サイズが維持されていること (REQ-22.2: 追従しない)
    if (objectsBefore.length > 0 && objectsAfter.length > 0) {
      expect(objectsAfter[0]!.left).toBeCloseTo(objectsBefore[0]!.left, 0);
      expect(objectsAfter[0]!.top).toBeCloseTo(objectsBefore[0]!.top, 0);
      expect(objectsAfter[0]!.width).toBeCloseTo(objectsBefore[0]!.width, 0);
      expect(objectsAfter[0]!.height).toBeCloseTo(objectsBefore[0]!.height, 0);
    }
  });

  /**
   * @requirement site-survey/REQ-22.4
   * @requirement site-survey/REQ-22.5
   */
  test('回転して保存後に再表示で回転状態が復元されること (REQ-22.4, REQ-22.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

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

    // 回転後のキャンバスサイズを記録
    const sizeAfterRotation = await getCanvasSize(page);

    // 保存ボタンをクリック (REQ-22.4)
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });

    // 保存APIレスポンスを待機
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

    // 現場調査詳細ページに戻る
    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // 再度注釈エディタに遷移 (REQ-22.5)
    const imageElement = page.getByRole('button', { name: /画像を拡大表示/i }).first();
    await expect(imageElement).toBeVisible({ timeout: getTimeout(5000) });
    await imageElement.click();

    await page.waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });
    await page.waitForLoadState('networkidle');

    // 編集モードに入る
    await page.waitForTimeout(100);
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
    await editModeButton.click();

    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);

    // 回転状態が復元されていることを確認
    const sizeAfterReload = await getCanvasSize(page);

    // キャンバスサイズが保存前の回転状態と一致すること（許容誤差5px）
    expect(Math.abs(sizeAfterReload.width - sizeAfterRotation.width)).toBeLessThan(5);
    expect(Math.abs(sizeAfterReload.height - sizeAfterRotation.height)).toBeLessThan(5);
  });

  /**
   * @requirement site-survey/REQ-22.6
   */
  test('回転操作のUndo/Redoが正しく動作すること (REQ-22.6)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 回転前のキャンバスサイズを記録
    const sizeOriginal = await getCanvasSize(page);

    // 回転ボタンをクリック（90度回転）
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(5000) });
    await rotateButton.click();
    await page.waitForTimeout(300);

    // 回転後のキャンバスサイズを記録
    const sizeAfterRotation = await getCanvasSize(page);

    // 正方形でない画像の場合のみサイズの変化を検証
    if (Math.abs(sizeOriginal.width - sizeOriginal.height) > 5) {
      expect(Math.abs(sizeAfterRotation.width - sizeOriginal.width)).toBeGreaterThan(3);
    }

    // Undo操作（元に戻す）
    const undoButton = page.getByRole('button', { name: /元に戻す/i });
    await expect(undoButton).toBeVisible({ timeout: getTimeout(5000) });
    await expect(undoButton).toBeEnabled();
    await undoButton.click();
    await page.waitForTimeout(300);

    // Undo後、キャンバスサイズが元に戻っていることを確認
    const sizeAfterUndo = await getCanvasSize(page);
    expect(Math.abs(sizeAfterUndo.width - sizeOriginal.width)).toBeLessThan(5);
    expect(Math.abs(sizeAfterUndo.height - sizeOriginal.height)).toBeLessThan(5);

    // Redo操作（やり直し）
    const redoButton = page.getByRole('button', { name: /やり直し/i });
    await expect(redoButton).toBeVisible({ timeout: getTimeout(5000) });
    await expect(redoButton).toBeEnabled();
    await redoButton.click();
    await page.waitForTimeout(300);

    // Redo後、回転状態に戻っていることを確認
    const sizeAfterRedo = await getCanvasSize(page);
    expect(Math.abs(sizeAfterRedo.width - sizeAfterRotation.width)).toBeLessThan(5);
    expect(Math.abs(sizeAfterRedo.height - sizeAfterRotation.height)).toBeLessThan(5);
  });

  /**
   * @requirement site-survey/REQ-22.8
   */
  test('4回回転で元に戻ること (REQ-22.8)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 回転前のキャンバスサイズを記録
    const sizeOriginal = await getCanvasSize(page);

    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(5000) });

    // 4回回転（0→90→180→270→0）
    for (let i = 0; i < 4; i++) {
      await rotateButton.click();
      await page.waitForTimeout(300);
    }

    // 4回回転後、キャンバスサイズが元と同じに戻っていることを確認
    const sizeAfter4Rotations = await getCanvasSize(page);
    expect(Math.abs(sizeAfter4Rotations.width - sizeOriginal.width)).toBeLessThan(5);
    expect(Math.abs(sizeAfter4Rotations.height - sizeOriginal.height)).toBeLessThan(5);
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
