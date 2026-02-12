/**
 * @fileoverview 現場調査 描画ツール使用中の選択防止機能のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-17.1: 描画ツール使用中に既存オブジェクト上でマウスダウンしても選択せず描画操作を開始
 * - REQ-17.2: 選択ツールで既存オブジェクトをクリックすると選択状態にして編集可能
 * - REQ-17.3: 描画ツールで描画中にマウスアップ位置が既存オブジェクト上にある場合、描画した図形を正常に作成・確定
 * - REQ-17.4: 多角形・折れ線ツールで既存オブジェクト上の位置に頂点を追加する場合、頂点の追加を正常に実行
 * - REQ-17.5: テキストツールで既存オブジェクト上をクリックする場合、テキスト注釈を配置
 * - REQ-17.6: 描画ツール使用中はFabric.jsのオブジェクト選択機能を完全に無効化し、描画操作のみを受け付ける
 *
 * @module e2e/specs/site-surveys/site-survey-drawing-selection-prevention.spec
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

test.describe('現場調査 描画ツール使用中の選択防止（要件17）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // 事前準備
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクト・現場調査を作成し画像をアップロードする', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `描画選択防止テスト用PJ_${Date.now()}`;
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

      const surveyName = `描画選択防止テスト用調査_${Date.now()}`;
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

  // ==========================================================================
  // ヘルパー関数
  // ==========================================================================

  /**
   * 注釈エディタへのナビゲーションヘルパー
   */
  async function navigateToAnnotationEditor(page: import('@playwright/test').Page) {
    if (!createdSurveyId) {
      return false;
    }

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // 画像ボタンを取得
    const imageElement = page.getByRole('button', { name: /画像を拡大表示/i }).first();
    await expect(imageElement).toBeVisible({ timeout: getTimeout(5000) });
    await imageElement.click();

    // 画像ビューアページへの遷移を待つ
    await page.waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });

    await page.waitForLoadState('networkidle');

    // 編集モードに入る
    await page.waitForTimeout(100);
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
    await editModeButton.click();

    // 注釈ツールバーが表示されるのを待つ
    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(10000) });

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
   * ドラッグ操作を実行するヘルパー関数
   */
  async function performDrag(
    page: import('@playwright/test').Page,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
  }

  /**
   * Fabric.jsキャンバスのオブジェクト数を取得するヘルパー関数
   */
  async function getCanvasObjectCount(page: import('@playwright/test').Page): Promise<number> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) {
        return -1;
      }
      return canvas.getObjects().length;
    });
  }

  /**
   * Fabric.jsキャンバスのアクティブ（選択中）オブジェクトを取得するヘルパー関数
   * 選択中のオブジェクトがない場合は null を返す
   */
  async function getActiveObject(
    page: import('@playwright/test').Page
  ): Promise<{ type: string } | null> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) {
        return null;
      }
      const active = canvas.getActiveObject();
      if (!active) {
        return null;
      }
      return { type: active.type ?? 'unknown' };
    });
  }

  /**
   * 初期オブジェクト（四角形）を描画して、描画ツールテストの前提条件を整えるヘルパー
   * 描画後にオブジェクト数が増えたことを検証し、キャンバス中心座標を返す
   */
  async function drawInitialRectangle(
    page: import('@playwright/test').Page
  ): Promise<{ center: { x: number; y: number }; objectCountAfter: number }> {
    const center = await getCanvasCenter(page);
    const objectCountBefore = await getCanvasObjectCount(page);

    // 四角形ツールを選択して描画
    const rectTool = page.getByRole('button', { name: /四角形/i });
    await expect(rectTool).toBeVisible({ timeout: getTimeout(5000) });
    await rectTool.click();
    await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

    // キャンバス中央付近に四角形を描画
    await performDrag(page, center.x - 40, center.y - 30, center.x + 40, center.y + 30);
    await page.waitForTimeout(500);

    const objectCountAfter = await getCanvasObjectCount(page);
    expect(objectCountAfter).toBe(objectCountBefore + 1);

    return { center, objectCountAfter };
  }

  // ==========================================================================
  // REQ-17.2: 選択ツールでの既存オブジェクト選択
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-17.2
   */
  test('選択ツールで既存オブジェクトをクリックするとオブジェクトが選択される (site-survey/REQ-17.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクトを描画
    const { center } = await drawInitialRectangle(page);

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

    // 描画した四角形の位置（キャンバス中央）をクリック
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(300);

    // 選択ツールでクリックした結果、オブジェクトが選択状態になることを確認
    const activeObj = await getActiveObject(page);
    expect(activeObj).not.toBeNull();
  });

  // ==========================================================================
  // REQ-17.1, REQ-17.6: 描画ツール使用中の選択防止
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-17.1
   * @requirement site-survey/REQ-17.6
   */
  test('描画ツール使用中に既存オブジェクト上でマウスダウンしても選択されない (site-survey/REQ-17.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクト（四角形）を描画
    const { center } = await drawInitialRectangle(page);

    // 選択ツールに切り替え→オブジェクトの選択を解除
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    // キャンバスの端をクリックして選択解除
    const upperCanvas = page.locator('.upper-canvas');
    const box = await upperCanvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 5, box.y + 5);
    }
    await page.waitForTimeout(200);

    // 円ツールに切り替え（描画ツール）
    const circleTool = page.getByRole('button', { name: /円/i });
    await circleTool.click();
    await expect(circleTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクト（四角形）の上でマウスダウン
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.waitForTimeout(200);

    // 描画ツール使用中はオブジェクトが選択されないことを確認
    const activeObj = await getActiveObject(page);
    expect(activeObj).toBeNull();

    // マウスアップして描画操作をキャンセル
    await page.mouse.up();
  });

  /**
   * @requirement site-survey/REQ-17.6
   */
  test('描画ツール使用中はFabric.jsのオブジェクト選択機能が無効化される (site-survey/REQ-17.6)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクトを描画
    const { center } = await drawInitialRectangle(page);

    // 複数の描画ツールで選択が無効化されていることを確認
    const drawingToolNames = [/矢印/i, /円/i, /四角形/i, /フリーハンド/i];

    for (const toolNamePattern of drawingToolNames) {
      const tool = page.getByRole('button', { name: toolNamePattern });
      await tool.click();
      await expect(tool).toHaveAttribute('aria-pressed', 'true');

      // 既存オブジェクト上をクリック
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(200);

      // オブジェクトが選択されていないことを確認
      const activeObj = await getActiveObject(page);
      expect(activeObj).toBeNull();
    }
  });

  // ==========================================================================
  // REQ-17.3: 描画ツールで既存オブジェクト上にマウスアップしても描画が正常に完了
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-17.3
   */
  test('描画ツールで既存オブジェクト上にマウスアップしても描画が正常に完了する (site-survey/REQ-17.3)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクト（四角形）を描画
    const { center, objectCountAfter: countAfterFirst } = await drawInitialRectangle(page);

    // 円ツールに切り替え
    const circleTool = page.getByRole('button', { name: /円/i });
    await circleTool.click();
    await expect(circleTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクトの外側から描画開始し、既存オブジェクト上でマウスアップ
    // 開始点: 既存オブジェクトの左上外側
    // 終了点: 既存オブジェクトの中心（既存オブジェクト上）
    await performDrag(page, center.x - 100, center.y - 80, center.x, center.y);
    await page.waitForTimeout(500);

    // 新しい図形が正常に作成されたことを確認（オブジェクト数が1つ増加）
    const countAfterSecond = await getCanvasObjectCount(page);
    expect(countAfterSecond).toBe(countAfterFirst + 1);
  });

  // ==========================================================================
  // REQ-17.4: 多角形・折れ線ツールで既存オブジェクト上に頂点を追加
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-17.4
   */
  test('多角形ツールで既存オブジェクト上の位置に頂点を追加できる (site-survey/REQ-17.4)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクト（四角形）を描画
    const { center, objectCountAfter: countAfterFirst } = await drawInitialRectangle(page);

    // 多角形ツールに切り替え
    const polygonTool = page.getByRole('button', { name: /多角形/i });
    await polygonTool.click();
    await expect(polygonTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクト上を含む位置に頂点を配置して多角形を描画
    // 頂点1: 既存オブジェクトの上（オブジェクト上）
    await page.mouse.click(center.x, center.y - 10);
    await page.waitForTimeout(200);
    // 頂点2: 既存オブジェクトの右下外側
    await page.mouse.click(center.x + 80, center.y + 60);
    await page.waitForTimeout(200);
    // 頂点3: 既存オブジェクトの左下外側
    await page.mouse.click(center.x - 80, center.y + 60);
    await page.waitForTimeout(200);
    // ダブルクリックで多角形を閉じる（最初の頂点付近、既存オブジェクト上）
    await page.mouse.dblclick(center.x, center.y - 10);
    await page.waitForTimeout(500);

    // 多角形が正常に作成されたことを確認
    const countAfterPolygon = await getCanvasObjectCount(page);
    expect(countAfterPolygon).toBe(countAfterFirst + 1);
  });

  /**
   * @requirement site-survey/REQ-17.4
   */
  test('折れ線ツールで既存オブジェクト上の位置に頂点を追加できる (site-survey/REQ-17.4)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクト（四角形）を描画
    const { center, objectCountAfter: countAfterFirst } = await drawInitialRectangle(page);

    // 折れ線ツールに切り替え
    const polylineTool = page.getByRole('button', { name: /折れ線/i });
    await polylineTool.click();
    await expect(polylineTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクト上を含む位置に点を配置して折れ線を描画
    // 点1: 既存オブジェクトの左外側
    await page.mouse.click(center.x - 100, center.y);
    await page.waitForTimeout(200);
    // 点2: 既存オブジェクトの中心（オブジェクト上）
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);
    // 点3: 既存オブジェクトの右外側
    await page.mouse.click(center.x + 100, center.y);
    await page.waitForTimeout(200);
    // ダブルクリックで折れ線を終了
    await page.mouse.dblclick(center.x + 100, center.y);
    await page.waitForTimeout(500);

    // 折れ線が正常に作成されたことを確認
    const countAfterPolyline = await getCanvasObjectCount(page);
    expect(countAfterPolyline).toBe(countAfterFirst + 1);
  });

  // ==========================================================================
  // REQ-17.5: テキストツールで既存オブジェクト上にテキスト注釈を配置
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-17.5
   */
  test('テキストツールで既存オブジェクト上をクリックするとテキスト注釈を配置できる (site-survey/REQ-17.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const success = await navigateToAnnotationEditor(page);
    if (!success) {
      throw new Error(
        '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
      );
    }

    // 初期オブジェクト（四角形）を描画
    const { center, objectCountAfter: countAfterFirst } = await drawInitialRectangle(page);

    // テキストツールに切り替え
    const textTool = page.getByRole('button', { name: /テキスト/i });
    await textTool.click();
    await expect(textTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクト上（四角形の中心）をクリック
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(300);

    // テキストを入力
    await page.keyboard.type('テスト注釈');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // テキスト注釈が作成されたことを確認（オブジェクト数が1つ増加）
    const countAfterText = await getCanvasObjectCount(page);
    expect(countAfterText).toBe(countAfterFirst + 1);
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================
  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(5000) });
        await deleteButton.click();

        const confirmButton = page.getByRole('dialog').getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();

        await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
      }

      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(5000) });
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
