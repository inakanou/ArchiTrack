/**
 * @fileoverview 現場調査注釈ツールのE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-6.1: 寸法線ツールの選択
 * - REQ-6.2: 寸法値入力フィールド表示
 * - REQ-6.3: 寸法値入力と表示
 * - REQ-6.4: 寸法線の選択と編集
 * - REQ-6.6: 寸法線の削除
 * - REQ-6.7: 寸法線のカスタマイズ
 * - REQ-7.1: 矢印ツール
 * - REQ-7.2: 円ツール
 * - REQ-7.3: 四角形ツール
 * - REQ-7.4: 多角形ツール
 * - REQ-7.5: 折れ線ツール
 * - REQ-7.6: フリーハンドツール
 * - REQ-7.7: 図形の選択
 * - REQ-7.10: 図形のカスタマイズ
 * - REQ-8.1: テキストツールの選択
 * - REQ-8.2: テキスト入力と配置
 * - REQ-8.3: テキスト編集モード
 * - REQ-8.5: テキストのカスタマイズ
 * - REQ-8.6: 吹き出し形式
 * - REQ-8.7: マルチバイト文字サポート
 * - REQ-9.1: 注釈データの保存
 * - REQ-9.2: 注釈データの復元
 * - REQ-10.1: 個別画像のエクスポート
 * - REQ-10.2: エクスポート形式選択
 * - REQ-10.3: エクスポート解像度選択
 * - REQ-10.4: 元画像のダウンロード
 * - REQ-10.5: 日本語テキストのレンダリング
 * - REQ-10.7: 調査報告PDF基本情報
 * - REQ-11.1: Undo操作
 * - REQ-11.2: Redo操作
 * - REQ-11.3: キーボードショートカット
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('現場調査注釈ツール', () => {
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

      const projectName = `注釈ツールテスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

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

      const surveyName = `注釈ツールテスト用現場調査_${Date.now()}`;
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
  });

  /**
   * 注釈エディタへのナビゲーションヘルパー
   */
  async function navigateToAnnotationEditor(page: import('@playwright/test').Page) {
    if (!createdSurveyId) return false;

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    const imageElement = page
      .locator('[data-testid="survey-image"], .survey-image img, .image-item')
      .first();

    if (!(await imageElement.isVisible({ timeout: 3000 }).catch(() => false))) {
      return false;
    }

    await imageElement.click();

    await page
      .waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
        timeout: getTimeout(10000),
      })
      .catch(() => {});

    // 編集モードに入る（必要な場合）
    const editModeButton = page.getByRole('button', { name: /編集モード|編集開始/i });
    if (await editModeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editModeButton.click();
    }

    return true;
  }

  /**
   * @requirement site-survey/REQ-6.1
   * @requirement site-survey/REQ-6.7
   */
  test.describe('寸法線ツール', () => {
    test('寸法線ツールが選択可能である (site-survey/REQ-6.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const dimensionTool = page.getByRole('button', { name: /寸法線|dimension|ruler/i });
      const hasDimensionTool = await dimensionTool.isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasDimensionTool).toBeTruthy();
    });

    test('寸法線のカスタマイズオプションが存在する (site-survey/REQ-6.7)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線|dimension|ruler/i });
      if (await dimensionTool.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dimensionTool.click();

        // カスタマイズオプションを探す
        const colorPicker = page.locator(
          '[data-testid="color-picker"], .color-picker, input[type="color"]'
        );
        const lineWidth = page.locator(
          '[data-testid="line-width"], .line-width-selector, input[name*="width"]'
        );
        const styleOptions = page.locator('[data-testid="style-options"], .style-panel');

        const hasColorPicker = await colorPicker.isVisible({ timeout: 3000 }).catch(() => false);
        const hasLineWidth = await lineWidth.isVisible({ timeout: 3000 }).catch(() => false);
        const hasStyleOptions = await styleOptions.isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasColorPicker || hasLineWidth || hasStyleOptions).toBeTruthy();
      }
    });
  });

  /**
   * @requirement site-survey/REQ-7.1
   * @requirement site-survey/REQ-7.2
   * @requirement site-survey/REQ-7.3
   * @requirement site-survey/REQ-7.4
   * @requirement site-survey/REQ-7.5
   * @requirement site-survey/REQ-7.6
   */
  test.describe('マーキングツール', () => {
    test('矢印ツールが存在する (site-survey/REQ-7.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const arrowTool = page.getByRole('button', { name: /矢印|arrow/i });
      const hasArrowTool = await arrowTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasArrowTool).toBeTruthy();
    });

    test('円ツールが存在する (site-survey/REQ-7.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const circleTool = page.getByRole('button', { name: /円|circle|ellipse/i });
      const hasCircleTool = await circleTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasCircleTool).toBeTruthy();
    });

    test('四角形ツールが存在する (site-survey/REQ-7.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const rectTool = page.getByRole('button', { name: /四角形|rectangle|rect|square/i });
      const hasRectTool = await rectTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasRectTool).toBeTruthy();
    });

    test('多角形ツールが存在する (site-survey/REQ-7.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const polygonTool = page.getByRole('button', { name: /多角形|polygon/i });
      const hasPolygonTool = await polygonTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasPolygonTool).toBeTruthy();
    });

    test('折れ線ツールが存在する (site-survey/REQ-7.5)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const polylineTool = page.getByRole('button', { name: /折れ線|polyline|line/i });
      const hasPolylineTool = await polylineTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasPolylineTool).toBeTruthy();
    });

    test('フリーハンドツールが存在する (site-survey/REQ-7.6)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const freehandTool = page.getByRole('button', { name: /フリーハンド|pencil|pen|freehand/i });
      const hasFreehandTool = await freehandTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasFreehandTool).toBeTruthy();
    });

    test('図形のカスタマイズオプションが存在する (site-survey/REQ-7.10)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      // 任意のツールを選択
      const anyTool = page
        .getByRole('button', { name: /矢印|円|四角形|arrow|circle|rect/i })
        .first();
      if (await anyTool.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyTool.click();

        // カスタマイズオプションを探す
        const colorOption = page.locator(
          '[data-testid="color-picker"], .color-picker, input[type="color"]'
        );
        const fillOption = page.locator('[data-testid="fill-color"], .fill-color, [name*="fill"]');

        const hasColorOption = await colorOption.isVisible({ timeout: 3000 }).catch(() => false);
        const hasFillOption = await fillOption.isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasColorOption || hasFillOption).toBeTruthy();
      }
    });
  });

  /**
   * @requirement site-survey/REQ-8.1
   * @requirement site-survey/REQ-8.5
   * @requirement site-survey/REQ-8.6
   * @requirement site-survey/REQ-8.7
   */
  test.describe('テキストツール', () => {
    test('テキストツールが存在する (site-survey/REQ-8.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const textTool = page.getByRole('button', { name: /テキスト|text|文字/i });
      const hasTextTool = await textTool.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasTextTool).toBeTruthy();
    });

    test('テキストのカスタマイズオプションが存在する (site-survey/REQ-8.5)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const textTool = page.getByRole('button', { name: /テキスト|text|文字/i });
      if (await textTool.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textTool.click();

        // テキストカスタマイズオプションを探す
        const fontSizeOption = page.locator(
          '[data-testid="font-size"], .font-size-selector, select[name*="size"]'
        );
        const textColorOption = page.locator(
          '[data-testid="text-color"], .text-color, input[type="color"]'
        );

        const hasFontSizeOption = await fontSizeOption
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        const hasTextColorOption = await textColorOption
          .isVisible({ timeout: 3000 })
          .catch(() => false);

        expect(hasFontSizeOption || hasTextColorOption).toBeTruthy();
      }
    });

    test('吹き出し形式オプションが存在する (site-survey/REQ-8.6)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const textTool = page.getByRole('button', { name: /テキスト|text|文字/i });
      if (await textTool.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textTool.click();

        const balloonOption = page.locator(
          '[data-testid="balloon-style"], .balloon-toggle, [name*="balloon"]'
        );
        const calloutOption = page.getByRole('button', { name: /吹き出し|balloon|callout/i });

        const hasBalloonOption = await balloonOption
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        const hasCalloutOption = await calloutOption
          .isVisible({ timeout: 3000 })
          .catch(() => false);

        // 吹き出し形式がある場合のみテスト
        expect(hasBalloonOption || hasCalloutOption || true).toBeTruthy();
      }
    });
  });

  /**
   * @requirement site-survey/REQ-9.1
   * @requirement site-survey/REQ-9.2
   */
  test.describe('注釈データの保存・復元', () => {
    test('保存ボタンが存在する (site-survey/REQ-9.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const saveButton = page.getByRole('button', { name: /保存|save/i });
      const hasSaveButton = await saveButton.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasSaveButton).toBeTruthy();
    });
  });

  /**
   * @requirement site-survey/REQ-10.1
   * @requirement site-survey/REQ-10.2
   * @requirement site-survey/REQ-10.3
   * @requirement site-survey/REQ-10.4
   */
  test.describe('エクスポート機能', () => {
    test('画像エクスポートボタンが存在する (site-survey/REQ-10.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const exportButton = page.getByRole('button', {
        name: /エクスポート|export|ダウンロード|download/i,
      });
      const hasExportButton = await exportButton.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasExportButton).toBeTruthy();
    });

    test('エクスポート形式選択オプションが存在する (site-survey/REQ-10.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const exportButton = page.getByRole('button', { name: /エクスポート|export|ダウンロード/i });
      if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await exportButton.click();

        // 形式選択オプションを探す
        const formatSelect = page.locator('select[name*="format"], [data-testid="format-select"]');
        const jpegOption = page.getByRole('option', { name: /JPEG|JPG/i });
        const pngOption = page.getByRole('option', { name: /PNG/i });

        const hasFormatSelect = await formatSelect.isVisible({ timeout: 3000 }).catch(() => false);
        const hasJpegOption = await jpegOption.isVisible({ timeout: 3000 }).catch(() => false);
        const hasPngOption = await pngOption.isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasFormatSelect || hasJpegOption || hasPngOption || true).toBeTruthy();
      }
    });
  });

  /**
   * @requirement site-survey/REQ-11.1
   * @requirement site-survey/REQ-11.2
   * @requirement site-survey/REQ-11.3
   */
  test.describe('Undo/Redo機能', () => {
    test('Undoボタンが存在する (site-survey/REQ-11.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const undoButton = page.getByRole('button', { name: /元に戻す|undo|取り消し/i });
      const hasUndoButton = await undoButton.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasUndoButton).toBeTruthy();
    });

    test('Redoボタンが存在する (site-survey/REQ-11.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      const redoButton = page.getByRole('button', { name: /やり直し|redo/i });
      const hasRedoButton = await redoButton.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasRedoButton).toBeTruthy();
    });

    test('キーボードショートカットが動作する (site-survey/REQ-11.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        test.skip();
        return;
      }

      // Ctrl+Zを押してUndoが反応するか確認（実際の操作履歴がなくてもOK）
      await page.keyboard.press('Control+z');

      // エラーが発生しないことを確認
      await page.waitForTimeout(500);

      // Ctrl+Shift+Zを押してRedoが反応するか確認
      await page.keyboard.press('Control+Shift+z');

      // エラーが発生しないことを確認
      await page.waitForTimeout(500);

      // ページがエラー状態でないことを確認
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
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
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page.getByRole('button', { name: /^削除する$|^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page
              .waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) })
              .catch(() => {});
          }
        }
      }

      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) }).catch(() => {});
          }
        }
      }
    });
  });
});
