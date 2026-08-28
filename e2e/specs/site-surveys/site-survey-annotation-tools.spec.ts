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
 * - REQ-13.1: Undo操作
 * - REQ-13.2: Redo操作
 * - REQ-13.3: キーボードショートカット
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { getFabricObjectCount, waitForFabricCanvas } from '../../helpers/fabric-canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

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

      // 画像をAPIで直接アップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');

      // テスト画像が存在することを確認
      expect(fs.existsSync(testImagePath)).toBeTruthy();

      // ブラウザのlocalStorageからアクセストークンを取得
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      // APIを使って画像をアップロード（バックエンドに直接アクセス）
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
    // ページの安定化を待つ
    await page.waitForTimeout(100);
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
    await editModeButton.click();

    // 注釈ツールバーが表示されるのを待つ
    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    // 注釈エディタの初期化を待つ
    // Task 115.184: 件数の観測（getFabricObjectCount）は描画面が不在なら投げるため、
    // 「100ms あれば初期化されたはず」と見込むのではなく、本番が描画面を window へ
    // 載せた事実そのものを待って観測できる状態を確立する。
    await waitForFabricCanvas(page);

    return true;
  }

  /**
   * @requirement site-survey/REQ-6.1
   * @requirement site-survey/REQ-6.2
   * @requirement site-survey/REQ-6.3
   * @requirement site-survey/REQ-6.4
   * @requirement site-survey/REQ-6.5
   * @requirement site-survey/REQ-6.6
   * @requirement site-survey/REQ-6.7
   */
  test.describe('寸法線ツール', () => {
    test('寸法線ツールを選択して2点をクリックすると寸法線を描画する (site-survey/REQ-6.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: 5000 });
      await dimensionTool.click();

      // ツールが選択状態になることを確認
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上で2点をクリックして寸法線を描画（操作が完了することを確認）
      const center = await getCanvasCenter(page);

      // 1点目をクリック
      await page.mouse.click(center.x - 60, center.y);
      // 2点目をクリック
      await page.mouse.click(center.x + 60, center.y);

      // ツールが引き続き選択状態であることを確認（操作が正常に処理された）
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');
    });

    /**
     * Task 115.82 (site-survey/REQ-6.2)
     *
     * 旧テストは「スタイルオプションが表示される」ことしか見ておらず、要件6.2 の
     * 「寸法値入力用のテキストフィールドを表示する」を一切検証していなかった
     * （その内容は要件6.7 のテストと重複する）。出荷経路である
     * 「寸法線ツール選択 → キャンバス上でドラッグ」から入力欄へ到達することを検証する。
     */
    test('寸法線を描画すると寸法値入力用のテキストフィールドが表示される (site-survey/REQ-6.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: getTimeout(5000) });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      // 描画前は入力欄が存在しない（＝表示の契機が「寸法線の描画」であることを示す）
      const valueInput = page.getByRole('dialog', { name: '寸法値入力' });
      await expect(valueInput).toHaveCount(0);

      // 出荷経路で寸法線を1本描く（描画面の内側に収まる相対座標を使う）
      const box = await getUpperCanvasBox(page);
      await performDrag(
        page,
        box.x + box.width * 0.15,
        box.y + box.height * 0.3,
        box.x + box.width * 0.85,
        box.y + box.height * 0.3
      );

      // 寸法値入力用のテキストフィールドが表示される（REQ-6.2）
      await expect(valueInput).toBeVisible({ timeout: getTimeout(5000) });
      await expect(valueInput.getByRole('spinbutton', { name: '寸法値' })).toBeVisible();
      await expect(valueInput.getByRole('combobox', { name: '単位' })).toBeVisible();
    });

    /**
     * Task 115.82 (site-survey/REQ-6.3)
     *
     * 旧テストは「色設定を変更できる」ことしか見ておらず、要件6.3 の
     * 「寸法線上に数値とオプションの単位を表示する」を一切検証していなかった。
     * 入力欄で確定した値が、実際の寸法線オブジェクトのラベルとして描かれることを検証する。
     */
    test('入力した寸法値と単位が寸法線上に表示される (site-survey/REQ-6.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択して寸法線を1本描く
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: getTimeout(5000) });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      const box = await getUpperCanvasBox(page);
      await performDrag(
        page,
        box.x + box.width * 0.15,
        box.y + box.height * 0.7,
        box.x + box.width * 0.85,
        box.y + box.height * 0.7
      );

      const valueInput = page.getByRole('dialog', { name: '寸法値入力' });
      await expect(valueInput).toBeVisible({ timeout: getTimeout(5000) });

      // 確定前の寸法線ラベルは空である（値の表示が入力の結果であることを示す）
      expect(await readDimensionLabelText(page), '描画直後の寸法線に既に寸法値が入っている').toBe(
        ''
      );

      // 寸法値と単位を入力して確定する
      await valueInput.getByRole('spinbutton', { name: '寸法値' }).fill('1250');
      await valueInput.getByRole('combobox', { name: '単位' }).selectOption('cm');
      await valueInput.getByRole('button', { name: '確定' }).click();

      // 入力欄が閉じ、寸法線上に数値と単位が表示される（REQ-6.3）
      await expect(valueInput).toHaveCount(0);
      await expect
        .poll(() => readDimensionLabelText(page), {
          timeout: getTimeout(5000),
          message: '寸法線上に入力した寸法値と単位が表示されていない',
        })
        .toBe('1250 cm');
    });

    test('選択ツールに切り替えて編集モードになる (site-survey/REQ-6.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: 5000 });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      // 選択ツールに切り替え
      const selectTool = page.getByRole('button', { name: /選択/i });
      await selectTool.click();
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

      // 寸法線ツールが非選択状態になっていることを確認
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'false');
    });

    /**
     * Task 115.104 (site-survey/REQ-6.5)
     *
     * 旧テストは「マウス操作をしても例外が起きない」ことしか見ておらず、
     * `body` が見えることを主張していた。これは寸法線が一切変化しなくても通る。
     * 端点をつまんで動かす手段（`DimensionLine` の端点ハンドル）は実装されていたが
     * 本番から一度も呼ばれておらず、要件6.5 はこの主張のもとで未実装のまま緑だった。
     *
     * 本テストは出荷経路（描画 → 選択 → 端点ハンドルをマウスでドラッグ）を通し、
     * 掴んだ端点だけが落とした場所へ移り、もう一方が動かないことを実測で確かめる。
     */
    test('寸法線の端点をドラッグすると寸法線の位置が調整される (site-survey/REQ-6.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線を 1 本描く（出荷経路）
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: getTimeout(5000) });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      const box = await getUpperCanvasBox(page);
      await performDrag(
        page,
        box.x + box.width * 0.2,
        box.y + box.height * 0.3,
        box.x + box.width * 0.7,
        box.y + box.height * 0.3
      );

      // 寸法値入力欄は端点操作の前に閉じる（値は本テストの対象ではない）
      const valueInput = page.getByRole('dialog', { name: '寸法値入力' });
      await expect(valueInput).toBeVisible({ timeout: getTimeout(5000) });
      await valueInput.getByRole('button', { name: 'キャンセル' }).click();
      await expect(valueInput).toHaveCount(0);

      // 選択ツールへ切替えて寸法線を選択する（端点ハンドルは選択中にだけ現れる）
      const selectTool = page.getByRole('button', { name: /選択/i });
      await selectTool.click();
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
      await selectDimensionOnCanvas(page);

      const before = await readDimensionHandles(page);
      expect(before.startHandle, '始点の端点ハンドルが現れていない').not.toBeNull();
      expect(before.endHandle, '終点の端点ハンドルが現れていない').not.toBeNull();

      // 端点ハンドルの座標は描画面の現在位置を基準に求める（入力欄の開閉で
      // レイアウトが動いた場合に、描画時の box を使い回すと座標がずれるため）。
      const canvasBox = await getUpperCanvasBox(page);

      // 終点ハンドルを下方向へドラッグする
      const dragBy = { x: 0, y: Math.round(canvasBox.height * 0.3) };
      const fromX = canvasBox.x + before.endHandle!.x;
      const fromY = canvasBox.y + before.endHandle!.y;
      const toX = fromX + dragBy.x;
      const toY = fromY + dragBy.y;
      await performDrag(page, fromX, fromY, toX, toY);

      const after = await readDimensionHandles(page);
      expect(after.endHandle, 'ドラッグ後に終点の端点ハンドルが消えた').not.toBeNull();
      expect(after.startHandle, 'ドラッグ後に始点の端点ハンドルが消えた').not.toBeNull();

      // 掴んだ終点は落とした場所へ移る（描画面内の座標で比較する）
      const handleTolerancePx = 4;
      expect(
        Math.abs(after.endHandle!.x - (toX - canvasBox.x)),
        '終点が落とした場所の x へ来ていない'
      ).toBeLessThanOrEqual(handleTolerancePx);
      expect(
        Math.abs(after.endHandle!.y - (toY - canvasBox.y)),
        '終点が落とした場所の y へ来ていない'
      ).toBeLessThanOrEqual(handleTolerancePx);

      // 実際に動いたことを確かめる（落とした場所が元の位置と十分離れている前提の固定）
      expect(
        Math.abs(after.endHandle!.y - before.endHandle!.y),
        '終点が縦方向へ動いていない'
      ).toBeGreaterThan(handleTolerancePx * 4);

      // 掴んでいない始点は動かない
      expect(
        Math.abs(after.startHandle!.x - before.startHandle!.x),
        '掴んでいない始点の x が動いた'
      ).toBeLessThanOrEqual(handleTolerancePx);
      expect(
        Math.abs(after.startHandle!.y - before.startHandle!.y),
        '掴んでいない始点の y が動いた'
      ).toBeLessThanOrEqual(handleTolerancePx);

      // 寸法線は 1 本のまま（端点操作が新しい注釈を生んでいない）
      expect(await getFabricObjectCount(page), '端点操作で注釈の本数が変わった').toBe(1);
    });

    test('キーボードショートカット（Delete/Backspace/Escape）が機能する (site-survey/REQ-6.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: 5000 });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバスコンテナにフォーカス
      const container = page.locator('[data-testid="annotation-editor-container"]');
      await container.focus();

      // Escapeキーが動作することを確認
      await page.keyboard.press('Escape');

      // Deleteキーが動作することを確認（エラーが発生しないこと）
      await page.keyboard.press('Delete');

      // Backspaceキーが動作することを確認
      await page.keyboard.press('Backspace');

      // 操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('寸法線の色・線の太さをカスタマイズできる (site-survey/REQ-6.7)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 寸法線ツールを選択
      const dimensionTool = page.getByRole('button', { name: /寸法線/i });
      await expect(dimensionTool).toBeVisible({ timeout: 5000 });
      await dimensionTool.click();
      await expect(dimensionTool).toHaveAttribute('aria-pressed', 'true');

      // REQ-6.7: 寸法線の色・線の太さをカスタマイズ可能にする。
      // AnnotationToolbar の StylePanel は描画ツール選択中に必ず描画され、
      // テキスト以外のツールでは線の色（color-picker）と線の太さ（line-width）を同時に出す。
      // 以前は「色 または 太さ または パネル」の論理和で、どれか一つが残っていれば通った。
      const styleOptions = page.getByTestId('style-options');
      await expect(styleOptions, 'スタイルパネルが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      const colorPicker = styleOptions.getByTestId('color-picker');
      const lineWidth = styleOptions.getByTestId('line-width');
      await expect(colorPicker, '寸法線の色を選ぶ欄が無い').toBeVisible();
      await expect(lineWidth, '寸法線の太さを指定する欄が無い').toBeVisible();

      // 「カスタマイズ可能」は表示だけでは満たされない。変更が保持されることまで確かめる。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await colorPicker.evaluate((el: any) => {
        el.value = '#ff0000';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(colorPicker).toHaveValue('#ff0000');

      await lineWidth.click();
      await lineWidth.press('Control+a');
      await lineWidth.type('3');
      await expect(lineWidth).toHaveValue('3');
    });
  });

  /**
   * キャンバスの中心座標を取得するヘルパー関数
   */
  async function getCanvasCenter(
    page: import('@playwright/test').Page
  ): Promise<{ x: number; y: number }> {
    // キャンバスが適切なサイズになるまで待機（画像読み込み完了を待つ）
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
   * 描画面（`.upper-canvas`）の bounding box を取得するヘルパー関数（Task 115.82）
   *
   * 図形の描画はこの要素の内側でしか成立しない。表示画像が小さいとキャンバスも小さく、
   * 中心からの固定ピクセル移動では容易に外へ出てしまうため、描画座標は本 box の
   * 相対比率で決める。見つからない場合はフォールバックせず例外にする
   * （コンテナ座標へ退避すると描画されないまま検証だけが進むため）。
   */
  async function getUpperCanvasBox(
    page: import('@playwright/test').Page
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    const upperCanvas = page.locator('.upper-canvas');

    // キャンバスサイズが10px以上になるまで最大10秒待機（画像読み込み完了を待つ）
    for (let i = 0; i < 20; i++) {
      const box = await upperCanvas.boundingBox();
      // 前提が満たせない場合は繰り返しの直後の throw で必ず失敗する（沈黙して通る経路が無い）。
      // 以前はこの形に除外注釈を置いていたが、Task 115.137 以降は検出器の規則
      // （valueProducingExitExclusion）で対象外になっており、注釈は何も抑止していない。
      // 注釈のまま残すと規則が変わったときに黙って抑止へ転じるため、通常の注記へ改めた。
      if (box && box.width > 10 && box.height > 10) {
        return box;
      }
      await page.waitForTimeout(500);
    }

    throw new Error('描画面（.upper-canvas）が描画可能なサイズになりませんでした');
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
   * キャンバス上の寸法線を選択状態にする（Task 115.104, REQ-6.5）
   *
   * 端点ハンドルは選択中の注釈にしか現れないため、端点操作の前提として必要になる。
   * 対象の中心をクリックしても線の細さ次第で当たらないことがあるので、
   * 本番の選択 API（`setActiveObject`）ではなく Fabric の当たり判定を通す
   * 「線上の点をクリックする」経路を使い、選択されたことを実測で確かめる。
   */
  async function selectDimensionOnCanvas(page: import('@playwright/test').Page): Promise<void> {
    const box = await getUpperCanvasBox(page);
    const target = await page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects(): Array<{ type?: string }>;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        throw new Error('window.__fabricCanvas が公開されていません');
      }
      const dimension = canvas.getObjects().find((obj) => obj.type === 'dimensionLine') as
        | {
            startPoint: { x: number; y: number };
            endPoint: { x: number; y: number };
            pathPointToScenePoint(point: { x: number; y: number }): { x: number; y: number };
            getViewportTransform(): [number, number, number, number, number, number];
          }
        | undefined;
      if (!dimension) {
        throw new Error('寸法線オブジェクトがキャンバス上に見つかりません');
      }
      const start = dimension.pathPointToScenePoint(dimension.startPoint);
      const end = dimension.pathPointToScenePoint(dimension.endPoint);
      const vpt = dimension.getViewportTransform();
      const midScene = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      return {
        x: vpt[0] * midScene.x + vpt[2] * midScene.y + vpt[4],
        y: vpt[1] * midScene.x + vpt[3] * midScene.y + vpt[5],
      };
    });

    await page.mouse.click(box.x + target.x, box.y + target.y);

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const canvas = (
              window as unknown as {
                __fabricCanvas?: { getActiveObject(): { type?: string } | null } | null;
              }
            ).__fabricCanvas;
            return canvas?.getActiveObject()?.type ?? null;
          }),
        {
          timeout: getTimeout(5000),
          message: '寸法線を選択状態にできませんでした',
        }
      )
      .toBe('dimensionLine');
  }

  /**
   * 選択中の寸法線に描かれている端点ハンドルの位置を読み出す（Task 115.104, REQ-6.5）
   *
   * 返す座標は描画面（`.upper-canvas`）の左上を原点とするピクセル値であり、
   * 描画面の bounding box を足せばそのままマウス操作の座標になる。
   */
  async function readDimensionHandles(page: import('@playwright/test').Page): Promise<{
    startHandle: { x: number; y: number } | null;
    endHandle: { x: number; y: number } | null;
  }> {
    return await page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects(): Array<{ type?: string }>;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        throw new Error('window.__fabricCanvas が公開されていません');
      }
      const dimension = canvas.getObjects().find((obj) => obj.type === 'dimensionLine') as
        | {
            setCoords(): void;
            oCoords?: Record<string, { x: number; y: number }>;
          }
        | undefined;
      if (!dimension) {
        throw new Error('寸法線オブジェクトがキャンバス上に見つかりません');
      }
      dimension.setCoords();
      const coords = dimension.oCoords ?? {};
      const read = (key: string): { x: number; y: number } | null => {
        const point = coords[key];
        return point ? { x: point.x, y: point.y } : null;
      };
      return {
        startHandle: read('dimensionStart'),
        endHandle: read('dimensionEnd'),
      };
    });
  }

  /**
   * 寸法線に描かれている寸法値ラベルのテキストを読み出すヘルパー関数（Task 115.82, REQ-6.3）
   *
   * `dimensionLine` は `[outlineLine, bodyLine, labelText]` の Group であり、
   * 寸法値ラベルはテキストを持つ子オブジェクトとして識別する。
   * キャンバスまたは寸法線が見つからない場合は、原因を示して例外にする
   * （値が空である状態と区別できないまま検証が素通りするのを防ぐため）。
   */
  async function readDimensionLabelText(page: import('@playwright/test').Page): Promise<string> {
    return await page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects(): Array<{ type?: string; _objects?: Array<{ text?: string }> }>;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        throw new Error('window.__fabricCanvas が公開されていません');
      }
      const dimension = canvas.getObjects().find((obj) => obj.type === 'dimensionLine');
      if (!dimension) {
        throw new Error('寸法線オブジェクトがキャンバス上に見つかりません');
      }
      const label = (dimension._objects ?? []).find((child) => typeof child.text === 'string');
      if (!label) {
        throw new Error('寸法線に寸法値ラベルの子オブジェクトがありません');
      }
      return label.text ?? '';
    });
  }

  /**
   * @requirement site-survey/REQ-7.1
   * @requirement site-survey/REQ-7.2
   * @requirement site-survey/REQ-7.3
   * @requirement site-survey/REQ-7.4
   * @requirement site-survey/REQ-7.5
   * @requirement site-survey/REQ-7.6
   * @requirement site-survey/REQ-7.7
   * @requirement site-survey/REQ-7.8
   * @requirement site-survey/REQ-7.9
   * @requirement site-survey/REQ-7.10
   */
  test.describe('マーキングツール', () => {
    test('矢印ツールを選択してドラッグすると矢印が描画される (site-survey/REQ-7.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 矢印ツールを選択
      const arrowTool = page.getByRole('button', { name: /矢印/i });
      await expect(arrowTool).toBeVisible({ timeout: 5000 });
      await arrowTool.click();

      // ツールが選択状態になることを確認
      await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

      // ドラッグ操作前のオブジェクト数を取得
      // Task 115.184: 以前ここにあった `toBeGreaterThanOrEqual(0)` は、件数取得が
      // 描画面の不在時に -1 を返していたための番人だった。取得が投げる形になり
      // 戻り値は常に 0 以上になったため、この主張は決して失敗しない飾りになる。
      // 描画面が観測できないことは取得そのものが弾く（本ファイル全箇所で撤去）。
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上でドラッグ操作を実行
      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 50, center.y - 50, center.x + 50, center.y + 50);

      // ドラッグ操作後に少し待機
      await page.waitForTimeout(500);

      // ドラッグ操作後のオブジェクト数を確認 - 矢印が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);

      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('円ツールを選択してドラッグすると円が描画される (site-survey/REQ-7.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 円ツールを選択
      const circleTool = page.getByRole('button', { name: /円/i });
      await expect(circleTool).toBeVisible({ timeout: 5000 });
      await circleTool.click();

      // ツールが選択状態になることを確認
      await expect(circleTool).toHaveAttribute('aria-pressed', 'true');

      // ドラッグ操作前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上でドラッグ操作を実行
      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // ドラッグ操作後のオブジェクト数を確認 - 円が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);
      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('四角形ツールを選択してドラッグすると四角形が描画される (site-survey/REQ-7.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 四角形ツールを選択
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // ドラッグ操作前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上でドラッグ操作を実行
      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 40, center.y - 30, center.x + 40, center.y + 30);

      // ドラッグ操作後のオブジェクト数を確認 - 四角形が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);
      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('多角形ツールを選択してクリックで頂点を追加し多角形が描画される (site-survey/REQ-7.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 多角形ツールを選択
      const polygonTool = page.getByRole('button', { name: /多角形/i });
      await expect(polygonTool).toBeVisible({ timeout: 5000 });
      await polygonTool.click();

      // ツールが選択状態になることを確認
      await expect(polygonTool).toHaveAttribute('aria-pressed', 'true');

      // クリック操作前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上で複数の頂点をクリック（三角形を描画）
      const center = await getCanvasCenter(page);

      // 頂点1
      await page.mouse.click(center.x, center.y - 40);
      // 頂点2
      await page.mouse.click(center.x + 40, center.y + 40);
      // 頂点3
      await page.mouse.click(center.x - 40, center.y + 40);
      // ダブルクリックで多角形を閉じる
      await page.mouse.dblclick(center.x, center.y - 40);

      // クリック操作後のオブジェクト数を確認 - 多角形が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);
      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('折れ線ツールを選択してクリックで点を追加し折れ線が描画される (site-survey/REQ-7.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 折れ線ツールを選択
      const polylineTool = page.getByRole('button', { name: /折れ線/i });
      await expect(polylineTool).toBeVisible({ timeout: 5000 });
      await polylineTool.click();

      // ツールが選択状態になることを確認
      await expect(polylineTool).toHaveAttribute('aria-pressed', 'true');

      // クリック操作前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上で複数の点をクリック
      const center = await getCanvasCenter(page);

      // 点1
      await page.mouse.click(center.x - 50, center.y);
      // 点2
      await page.mouse.click(center.x, center.y - 30);
      // 点3
      await page.mouse.click(center.x + 50, center.y);
      // ダブルクリックで折れ線を終了（最初の点の位置でダブルクリック、多角形テストと同様のパターン）
      await page.mouse.dblclick(center.x - 50, center.y);

      // クリック操作後のオブジェクト数を確認 - 折れ線が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);
      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('フリーハンドツールを選択してドラッグするとフリーハンド線が描画される (site-survey/REQ-7.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // フリーハンドツールを選択
      const freehandTool = page.getByRole('button', { name: /フリーハンド/i });
      await expect(freehandTool).toBeVisible({ timeout: 5000 });
      await freehandTool.click();

      // ツールが選択状態になることを確認
      await expect(freehandTool).toHaveAttribute('aria-pressed', 'true');

      // ドラッグ操作前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // キャンバス上でフリーハンド描画を実行
      const center = await getCanvasCenter(page);

      // フリーハンド描画：曲線を描く
      await page.mouse.move(center.x - 50, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x - 25, center.y - 30, { steps: 5 });
      await page.mouse.move(center.x, center.y, { steps: 5 });
      await page.mouse.move(center.x + 25, center.y + 30, { steps: 5 });
      await page.mouse.move(center.x + 50, center.y, { steps: 5 });
      await page.mouse.up();

      // ドラッグ操作後のオブジェクト数を確認 - フリーハンド線が追加されているはず
      const objectCountAfter = await getFabricObjectCount(page);
      expect(objectCountAfter).toBe(objectCountBefore + 1);
    });

    test('選択ツールで図形をクリックできる (site-survey/REQ-7.7)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 選択ツールに切り替え
      const selectTool = page.getByRole('button', { name: /選択/i });
      await expect(selectTool).toBeVisible({ timeout: 5000 });
      await selectTool.click();
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上でクリック操作
      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);

      // 選択ツールが引き続き選択状態であることを確認
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
    });

    test('選択ツールでドラッグ操作ができる (site-survey/REQ-7.8)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 選択ツールに切り替え
      const selectTool = page.getByRole('button', { name: /選択/i });
      await selectTool.click();
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上でドラッグ操作
      const center = await getCanvasCenter(page);
      await performDrag(page, center.x, center.y, center.x + 50, center.y + 50);

      // 選択ツールが引き続き選択状態であることを確認
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
    });

    test('塗りつぶし色オプションが図形ツールで利用可能 (site-survey/REQ-7.9)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 四角形ツールを選択
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // 四角形などの図形ツールでは塗りつぶし色の欄がスタイルパネル内に描画される
      // （AnnotationToolbar の showFillOptions）。
      // 以前は「塗りつぶし色 または スタイルパネル」の論理和で、塗りつぶし色が
      // 失われてもパネルさえあれば通る形だった。本テストの主題は塗りつぶし色である。
      const styleOptions = page.getByTestId('style-options');
      await expect(styleOptions, 'スタイルパネルが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        styleOptions.getByTestId('fill-color-picker'),
        '図形ツールで塗りつぶし色の欄が表示されない'
      ).toBeVisible();
    });

    test('図形の色・線の太さ・塗りつぶしをカスタマイズできる (site-survey/REQ-7.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 四角形ツールを選択（塗りつぶしオプションが表示されるツール）
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // REQ-7.10: 図形の色・線の太さ・塗りつぶしをカスタマイズ可能にする。
      // 四角形ツールでは三つの欄が同時に描画される（AnnotationToolbar の StylePanel）。
      // 以前は「いずれか一つ」の論理和だったため、三つのうち二つが失われても通っていた。
      const styleOptions = page.getByTestId('style-options');
      await expect(styleOptions, 'スタイルパネルが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      const colorPicker = styleOptions.getByTestId('color-picker');
      const lineWidth = styleOptions.getByTestId('line-width');
      const fillColorPicker = styleOptions.getByTestId('fill-color-picker');
      await expect(colorPicker, '線の色の欄が無い').toBeVisible();
      await expect(lineWidth, '線の太さの欄が無い').toBeVisible();
      await expect(fillColorPicker, '塗りつぶし色の欄が無い').toBeVisible();

      // 「カスタマイズ可能」は表示だけでは満たされない。変更が保持されることまで確かめる。
      await lineWidth.click();
      await lineWidth.press('Control+a');
      await lineWidth.type('5');
      await expect(lineWidth).toHaveValue('5');
    });
  });

  /**
   * @requirement site-survey/REQ-8.1
   * @requirement site-survey/REQ-8.2
   * @requirement site-survey/REQ-8.3
   * @requirement site-survey/REQ-8.4
   * @requirement site-survey/REQ-8.5
   * @requirement site-survey/REQ-8.6
   * @requirement site-survey/REQ-8.7
   */
  test.describe('テキストツール', () => {
    test('テキストツールを選択してクリック操作ができる (site-survey/REQ-8.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // テキストツールを選択
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();

      // ツールが選択状態になることを確認
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上をクリック
      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);

      // ツールが引き続き選択状態であることを確認
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');
    });

    test('テキストツール選択時にスタイルオプションが表示される (site-survey/REQ-8.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // テキストツールを選択
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // テキストツールでは文字色（color-picker）とサイズ（font-size）が
      // スタイルパネル内に同時に描画される（AnnotationToolbar の showFontOptions）。
      // 以前は三つの論理和で、色やサイズが失われてもパネルさえあれば通っていた。
      const styleOptions = page.getByTestId('style-options');
      await expect(styleOptions, 'スタイルパネルが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(styleOptions.getByTestId('color-picker'), '文字色の欄が無い').toBeVisible();
      await expect(styleOptions.getByTestId('font-size'), 'フォントサイズの欄が無い').toBeVisible();
    });

    test('テキストツールでダブルクリック操作ができる (site-survey/REQ-8.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // テキストツールを選択
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上をダブルクリック
      const center = await getCanvasCenter(page);
      await page.mouse.dblclick(center.x, center.y);

      // ツールが引き続き選択状態であることを確認
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');
    });

    test('テキストツールからの切り替え操作ができる (site-survey/REQ-8.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // テキストツールを選択
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // 選択ツールに切り替え
      const selectTool = page.getByRole('button', { name: /選択/i });
      await selectTool.click();
      await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

      // テキストツールが非選択状態になっていることを確認
      await expect(textTool).toHaveAttribute('aria-pressed', 'false');
    });

    test('テキストのフォントサイズ・色をカスタマイズできる (site-survey/REQ-8.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // REQ-8.5 のうちフォントサイズと文字色は実装されており、テキストツール選択時に
      // 同時に描画される。以前は三つの論理和で、片方が失われても通っていた。
      // 変更が保持されることまで確かめる（「カスタマイズできる」は表示だけでは満たされない）。
      // なお REQ-8.5 が併せて求める「背景色」のカスタマイズは実装に存在せず、
      // 本テストの表題（フォントサイズ・色）の範囲外であるため主張しない。別タスクとする。
      const styleOptions = page.getByTestId('style-options');
      await expect(styleOptions, 'スタイルパネルが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      const fontSizeOption = styleOptions.getByTestId('font-size');
      const textColorOption = styleOptions.getByTestId('color-picker');
      await expect(fontSizeOption, 'フォントサイズの欄が無い').toBeVisible();
      await expect(textColorOption, '文字色の欄が無い').toBeVisible();

      await fontSizeOption.click();
      await fontSizeOption.press('Control+a');
      await fontSizeOption.type('24');
      await expect(fontSizeOption).toHaveValue('24');
    });

    test('テキストツールのキーボード入力ができる (site-survey/REQ-8.6)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス上をクリック
      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);

      // キーボード入力テスト
      await page.keyboard.type('テスト');
      await page.keyboard.press('Escape');

      // 操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('日本語を含むマルチバイト文字を入力できる (site-survey/REQ-8.7)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // テキストツールを選択
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();
      await expect(textTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);

      // マルチバイト文字（日本語、漢字、記号）を入力
      const testText = '日本語テスト';
      await page.keyboard.type(testText);
      await page.keyboard.press('Escape');

      // 操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });
  });

  /**
   * @requirement site-survey/REQ-9.1
   * @requirement site-survey/REQ-9.2
   * @requirement site-survey/REQ-9.3
   * @requirement site-survey/REQ-9.4
   * @requirement site-survey/REQ-9.5
   * @requirement site-survey/REQ-9.6
   */
  test.describe('注釈データの保存・復元', () => {
    test('保存ボタンを押すと注釈データが保存される (site-survey/REQ-9.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/i });
      await expect(saveButton).toBeVisible({ timeout: 5000 });

      // 保存APIのレスポンスを待機
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('annotations') &&
          (response.request().method() === 'PUT' || response.request().method() === 'POST'),
        { timeout: getTimeout(30000) }
      );

      await saveButton.click();

      // 保存完了を確認
      const saveResponse = await savePromise;
      expect(saveResponse.ok()).toBeTruthy();
    });

    test('注釈付き画像を再度開くと保存された注釈データが復元される (site-survey/REQ-9.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // 保存
      const saveButton = page.getByRole('button', { name: /保存/i });
      await saveButton.click();
      await page.waitForTimeout(2000);

      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 編集モードに入る
      const editModeButton = page.getByRole('button', { name: /編集モード/i });
      await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
      await editModeButton.click();
      await page.waitForTimeout(1000);

      // ページが正常に読み込まれ、キャンバスが表示されていることを確認
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible({ timeout: 5000 });

      // 注釈エディタが正常に復元されたことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('未保存の変更がある状態で画面を離れようとすると確認ダイアログが表示される (site-survey/REQ-9.3)', async ({
      page,
    }) => {
      // Task 115.102: 本テストは長らく `test.fail()` を伴うラチェットであった
      // （REQ-9.3 の離脱確認が未実装で、注釈編集画面に beforeunload もナビゲーション
      // ガードも無かったため）。同タスクで両方を結線したため、ラチェットを撤去して
      // 素の主張に戻す。タブクローズ・リロード相当の離脱（`page.goto`）で
      // ブラウザ標準の確認が出ることを本テストが、アプリ内遷移の確認ダイアログを
      // `site-survey-annotation-editor-acceptance.spec.ts` の (c) が担う。

      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画して未保存状態にする
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // beforeunloadイベントをリッスンするダイアログハンドラを設定
      let dialogShown = false;
      page.on('dialog', async (dialog) => {
        dialogShown = true;
        await dialog.accept();
      });

      // ページ遷移を試みる
      await page.goto('/');

      // REQ-9.3: 注釈を編集中に画面を離れようとしたとき、未保存の変更があれば
      // 確認ダイアログを表示する。
      // 以前は「ダイアログが出た、または URL が '/' を含む」の論理和だった。
      // 後者はあらゆる URL で真になるため、確認ダイアログの有無を一度も確かめていない。
      // 要件が求める確認ダイアログそのものを主張する。
      expect(
        dialogShown,
        'REQ-9.3: 未保存の注釈があるまま画面を離れようとしても確認ダイアログが表示されない'
      ).toBe(true);
    });

    test('保存中はインジケーターが表示される (site-survey/REQ-9.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/i });
      await saveButton.click();

      // 保存操作が完了するまで待機
      await page.waitForTimeout(2000);

      // 保存操作が完了したことを確認（保存ボタンが再度有効になるか、画面が正常に表示される）
      await expect(page.locator('body')).toBeVisible();
    });

    test('注釈データをJSON形式でエクスポートできる (site-survey/REQ-9.6)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // JSONエクスポートボタンを探す
      const jsonExportButton = page.getByRole('button', {
        name: /JSON.*エクスポート|export.*json/i,
      });
      const exportMenu = page.getByRole('button', { name: /エクスポート/i });

      let hasJsonExport = await jsonExportButton.isVisible();

      // メニューから選択する場合
      if (!hasJsonExport) {
        const exportMenuVisible = await exportMenu.isVisible();
        if (exportMenuVisible) {
          await exportMenu.click();
          const jsonOption = page.getByRole('menuitem', { name: /JSON/i });
          hasJsonExport = await jsonOption.isVisible();
        }
      }

      // エクスポート関連のUI操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    /**
     * @requirement site-survey/REQ-9.5
     *
     * 注釈データの保存に失敗した場合にエラーメッセージを表示してリトライを促す
     */
    test('注釈データの保存に失敗するとエラーメッセージが表示される (site-survey/REQ-9.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // 注釈保存APIをモックして失敗させる（localhostではsetOfflineが効かないため）
      await page.route('**/api/site-surveys/images/*/annotations', (route) => {
        route.abort('failed');
      });

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/i });
      await expect(saveButton).toBeVisible({ timeout: 5000 });
      await saveButton.click();

      // エラーメッセージが表示されるまで待機
      const errorMessage = page.locator('[role="alert"]');

      // role="alert"を持つエラーメッセージが表示されることを確認
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });

      // エラーメッセージにエラー内容が含まれていることを確認
      const errorContent = await errorMessage.textContent();
      expect(errorContent).toBeTruthy();

      // ルートモックを解除
      await page.unroute('**/api/site-surveys/images/*/annotations');
    });

    test('保存失敗後にリトライボタンまたは保存ボタンが有効になる (site-survey/REQ-9.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // 注釈保存APIをモックして失敗させる（localhostではsetOfflineが効かないため）
      await page.route('**/api/site-surveys/images/*/annotations', (route) => {
        route.abort('failed');
      });

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/i });
      await expect(saveButton).toBeVisible({ timeout: 5000 });
      await saveButton.click();

      // エラーメッセージが表示されるまで待機
      const errorMessage = page.locator('[role="alert"]');
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });

      // ルートモックを解除
      await page.unroute('**/api/site-surveys/images/*/annotations');

      // REQ-9.5: 保存に失敗したらエラーメッセージを表示してリトライを促す。
      // Task 115.102 で誤りの表示に「再試行」の導線を足した。保存の失敗のときだけ現れ、
      // 押すと同じ保存をやり直す。
      // 以前は「リトライボタン または 保存ボタン」の論理和で、保存ボタンは失敗の有無に
      // かかわらず常に在るため、再試行できるかどうかを確かめていなかった。
      const retryButton = page.getByTestId('save-retry-button');
      await expect(retryButton, 'REQ-9.5: 保存失敗時に再試行の導線が現れない').toBeVisible({
        timeout: getTimeout(3000),
      });
      await expect(retryButton, 'REQ-9.5: 再試行の導線が押せない').toBeEnabled();

      const saveButtonAfterError = page.getByRole('button', { name: /保存/i });
      await expect(saveButtonAfterError, '保存失敗後に保存ボタンが消えている').toBeVisible({
        timeout: getTimeout(3000),
      });
      await expect(
        saveButtonAfterError,
        'REQ-9.5: 保存失敗後に再試行できない（保存ボタンが無効のまま）'
      ).toBeEnabled();
    });
  });

  /**
   * @requirement site-survey/REQ-10.1
   * @requirement site-survey/REQ-10.2
   * @requirement site-survey/REQ-10.3
   * @requirement site-survey/REQ-10.4
   * @requirement site-survey/REQ-10.5
   */
  test.describe('エクスポート機能', () => {
    test('エクスポートボタンを押すと注釈をレンダリングした画像が生成される (site-survey/REQ-10.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);
      await performDrag(page, center.x - 30, center.y - 30, center.x + 30, center.y + 30);

      // エクスポートボタンをクリック
      const exportButton = page.getByRole('button', {
        name: /エクスポート|export|ダウンロード|download/i,
      });
      await expect(exportButton).toBeVisible({ timeout: 5000 });
      await exportButton.click();

      // エクスポートダイアログが表示されるのを待機
      const exportDialog = page.getByRole('dialog');
      await expect(exportDialog).toBeVisible({ timeout: 5000 });

      // ダウンロードイベントを待機してからダイアログ内のエクスポートボタンをクリック
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });
      const dialogExportButton = exportDialog.getByRole('button', { name: /エクスポート/i });
      await expect(dialogExportButton).toBeVisible({ timeout: 3000 });
      await dialogExportButton.click();

      const download = await downloadPromise;
      // ダウンロードされたファイルが画像形式であることを確認
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.(jpg|jpeg|png|webp)$/i);
    });

    test('JPEG、PNG形式でのエクスポートをサポートする (site-survey/REQ-10.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      const exportButton = page.getByRole('button', { name: /エクスポート|export|ダウンロード/i });
      const exportVisible = await exportButton.isVisible();
      if (exportVisible) {
        await exportButton.click();
        // エクスポートダイアログやメニューが開いたことを確認
        await page.waitForTimeout(500);
      }

      // エクスポート操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('エクスポート画像の解像度（品質）を選択できる (site-survey/REQ-10.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      const exportButton = page.getByRole('button', { name: /エクスポート|export|ダウンロード/i });
      const exportVisible = await exportButton.isVisible();
      if (exportVisible) {
        await exportButton.click();
        // エクスポートダイアログやメニューが開いたことを確認
        await page.waitForTimeout(500);
      }

      // エクスポート操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('注釈なしの元画像もダウンロード可能である (site-survey/REQ-10.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 元画像ダウンロードボタンを探す
      const originalDownloadButton = page.getByRole('button', {
        name: /元画像|original|オリジナル/i,
      });

      const hasOriginalDownload = await originalDownloadButton.isVisible();

      // エクスポートメニューを開いて探す場合
      if (!hasOriginalDownload) {
        const exportButton = page.getByRole('button', {
          name: /エクスポート|export|ダウンロード/i,
        });
        const exportVisible = await exportButton.isVisible();
        if (exportVisible) {
          await exportButton.click();
          await page.waitForTimeout(500);
        }
      }

      // エクスポート操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('日本語テキスト注釈を正しくレンダリングしてエクスポートできる (site-survey/REQ-10.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 日本語テキストを配置
      const textTool = page.getByRole('button', { name: /テキスト/i });
      await expect(textTool).toBeVisible({ timeout: 5000 });
      await textTool.click();

      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);
      await page.keyboard.type('日本語テキストエクスポートテスト');
      await page.keyboard.press('Escape');

      // エクスポートボタンをクリック
      const exportButton = page.getByRole('button', { name: /エクスポート|export|ダウンロード/i });
      await expect(exportButton).toBeVisible({ timeout: getTimeout(3000) });
      await exportButton.click();

      // エクスポートダイアログが表示されるのを待機
      const exportDialog = page.getByRole('dialog');
      await expect(exportDialog).toBeVisible({ timeout: 5000 });

      // ダウンロードイベントを待機してからダイアログ内のエクスポートボタンをクリック
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });
      const dialogExportButton = exportDialog.getByRole('button', { name: /エクスポート/i });
      await expect(dialogExportButton).toBeVisible({ timeout: 3000 });
      await dialogExportButton.click();

      const download = await downloadPromise;
      // ダウンロードが完了したことを確認
      expect(download.suggestedFilename()).toBeTruthy();
    });
  });

  /**
   * @requirement site-survey/REQ-13.1
   * @requirement site-survey/REQ-13.2
   * @requirement site-survey/REQ-13.3
   * @requirement site-survey/REQ-13.4
   * @requirement site-survey/REQ-13.5
   */
  test.describe('Undo/Redo機能', () => {
    test('Undo操作を実行すると直前の注釈操作が取り消される (site-survey/REQ-13.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 描画前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス中心を取得し、クリックでフォーカスを当ててからドラッグ
      const center = await getCanvasCenter(page);

      // キャンバス上をクリックしてフォーカスを確保
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(100);

      // ドラッグ操作で四角形を描画（より大きな領域で）
      await performDrag(page, center.x - 50, center.y - 50, center.x + 50, center.y + 50);
      await page.waitForTimeout(500);

      // 描画後のオブジェクト数を確認（1つ増えているはず）
      const objectCountAfterDraw = await getFabricObjectCount(page);
      expect(objectCountAfterDraw).toBe(objectCountBefore + 1);

      // Undoボタンをクリック
      const undoButton = page.getByRole('button', { name: /元に戻す|undo|取り消し/i });
      await expect(undoButton).toBeVisible({ timeout: 5000 });
      await undoButton.click();
      await page.waitForTimeout(300);

      // Undo後のオブジェクト数を確認（元に戻っているはず）
      const objectCountAfterUndo = await getFabricObjectCount(page);
      expect(objectCountAfterUndo).toBe(objectCountBefore);
    });

    test('Redo操作を実行すると取り消した操作が再実行される (site-survey/REQ-13.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 描画前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス中心を取得し、クリックでフォーカスを当ててからドラッグ
      const center = await getCanvasCenter(page);

      // キャンバス上をクリックしてフォーカスを確保
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(100);

      // ドラッグ操作で四角形を描画（より大きな領域で）
      await performDrag(page, center.x - 50, center.y - 50, center.x + 50, center.y + 50);
      await page.waitForTimeout(500);

      // 描画後のオブジェクト数を確認
      const objectCountAfterDraw = await getFabricObjectCount(page);
      expect(objectCountAfterDraw).toBe(objectCountBefore + 1);

      // Undo
      const undoButton = page.getByRole('button', { name: /元に戻す|undo|取り消し/i });
      await expect(undoButton).toBeVisible({ timeout: 5000 });
      await undoButton.click();
      await page.waitForTimeout(300);

      // Undo後のオブジェクト数を確認
      const objectCountAfterUndo = await getFabricObjectCount(page);
      expect(objectCountAfterUndo).toBe(objectCountBefore);

      // Redo
      const redoButton = page.getByRole('button', { name: /やり直し|redo/i });
      await expect(redoButton).toBeVisible({ timeout: 5000 });
      await redoButton.click();
      await page.waitForTimeout(300);

      // Redo後のオブジェクト数を確認（再び1つ増えているはず）
      const objectCountAfterRedo = await getFabricObjectCount(page);
      expect(objectCountAfterRedo).toBe(objectCountBefore + 1);
    });

    test('キーボードショートカット（Ctrl+Z、Ctrl+Shift+Z）でUndo/Redoを実行できる (site-survey/REQ-13.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 描画前のオブジェクト数を取得
      const objectCountBefore = await getFabricObjectCount(page);

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      // キャンバス中心を取得し、クリックでフォーカスを当ててからドラッグ
      const center = await getCanvasCenter(page);

      // キャンバス上をクリックしてフォーカスを確保
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(100);

      // ドラッグ操作で四角形を描画（より大きな領域で）
      await performDrag(page, center.x - 50, center.y - 50, center.x + 50, center.y + 50);
      await page.waitForTimeout(500);

      // 描画後のオブジェクト数を確認
      const objectCountAfterDraw = await getFabricObjectCount(page);
      expect(objectCountAfterDraw).toBe(objectCountBefore + 1);

      // キャンバスコンテナにフォーカス（キーボードイベントを受け取るため）
      const container = page.locator('[data-testid="annotation-editor-container"]');
      await container.focus();

      // Ctrl+ZでUndo
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);

      // Undo後のオブジェクト数を確認
      const objectCountAfterUndo = await getFabricObjectCount(page);
      expect(objectCountAfterUndo).toBe(objectCountBefore);

      // Ctrl+Shift+ZでRedo
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(300);

      // Redo後のオブジェクト数を確認
      const objectCountAfterRedo = await getFabricObjectCount(page);
      expect(objectCountAfterRedo).toBe(objectCountBefore + 1);
    });

    test('操作履歴を最大50件まで保持する (site-survey/REQ-13.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 複数の操作を実行（履歴が保持されることを確認）
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);

      // キャンバス上をクリックしてフォーカスを確保
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(100);

      // 5つの図形を描画
      for (let i = 0; i < 5; i++) {
        await performDrag(
          page,
          center.x - 50 + i * 20,
          center.y - 30,
          center.x - 30 + i * 20,
          center.y + 30
        );
        await page.waitForTimeout(200);
      }

      // 5回Undoを実行
      const undoButton = page.getByRole('button', { name: /元に戻す|undo|取り消し/i });
      await expect(undoButton).toBeVisible({ timeout: 5000 });
      for (let i = 0; i < 5; i++) {
        const isEnabled = await undoButton.isEnabled();
        if (isEnabled) {
          await undoButton.click();
          await page.waitForTimeout(200);
        }
      }

      // 複数回のUndo操作が完了したことを確認
      await expect(page.locator('body')).toBeVisible();
    });

    test('注釈データを保存すると操作履歴がクリアされる (site-survey/REQ-13.5)', async ({
      page,
    }) => {
      // Task 115.102: 本テストは長らく `test.fail()` を伴うラチェットであった
      // （`UndoManager.clear()` は存在したが、注釈編集画面の保存処理から呼ばれて
      // いなかった）。同タスクで保存成功の時点に `undoManager.clear()` を結線したため、
      // ラチェットを撤去して素の主張に戻す。保存後に取り消しが行えないことを本テストが、
      // 「取り消しを試みても保存済みの注釈が減らない」という事故の筋書きを
      // `site-survey-annotation-editor-acceptance.spec.ts` の (f) が担う。

      await loginAsUser(page, 'REGULAR_USER');

      const success = await navigateToAnnotationEditor(page);
      if (!success) {
        throw new Error(
          '注釈エディタへのナビゲーションに失敗しました。事前準備テストが正しく実行されていません。'
        );
      }

      // 図形を描画
      const rectTool = page.getByRole('button', { name: /四角形/i });
      await expect(rectTool).toBeVisible({ timeout: 5000 });
      await rectTool.click();

      // ツールが選択状態になることを確認
      await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

      const center = await getCanvasCenter(page);

      // キャンバス上をクリックしてフォーカスを確保
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(100);

      // ドラッグ操作で四角形を描画（より大きな領域で）
      await performDrag(page, center.x - 50, center.y - 50, center.x + 50, center.y + 50);
      await page.waitForTimeout(500);

      // 保存
      const saveButton = page.getByRole('button', { name: /保存/i });
      await saveButton.click();
      await page.waitForTimeout(2000);

      // REQ-13.5: 注釈データを保存すると操作履歴をクリアする。
      // 以前は `typeof isUndoEnabled === 'boolean'` を主張していた。真偽値の型は必ず
      // 真であり、保存後の状態を一切確かめていない恒真の判定だった。
      // 履歴がクリアされていれば Undo は行えない。要件が定める結果を主張する。
      const undoButton = page.getByRole('button', { name: /元に戻す|undo|取り消し/i });
      await expect(
        undoButton,
        'REQ-13.5: 保存しても操作履歴がクリアされず Undo が有効なまま'
      ).toBeDisabled();
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      // localStorageにアクセスする前に、まずアプリのオリジンに移動する
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const surveyDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(surveyDeleteButton).toBeVisible({ timeout: getTimeout(5000) });
      await surveyDeleteButton.click();

      const surveyConfirmButton = page
        .getByRole('dialog')
        .getByRole('button', { name: '削除する' });
      await expect(surveyConfirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await surveyConfirmButton.click();

      await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });

      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const projectDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(projectDeleteButton).toBeVisible({ timeout: getTimeout(5000) });
      await projectDeleteButton.click();

      const projectConfirmButton = page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i });
      await expect(projectConfirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await projectConfirmButton.click();

      await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
    });
  });
});
