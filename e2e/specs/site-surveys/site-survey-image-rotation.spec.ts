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

import zlib from 'zlib';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

/**
 * PNG のチャンク CRC32 を計算する
 */
function crc32(buffer: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * PNG のチャンクを組み立てる
 */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * 指定サイズの PNG 画像を生成する（Task 115.127 段6）
 *
 * 既存の fixture `test-image.png` は 100x100 の**正方形**である。
 * 90 度回転で幅と高さが入れ替わることを検証する REQ-22.3 は、正方形の画像では
 * 何も観測できないため、従来は `if (|幅 - 高さ| > 5)` という決して成立しない関門の
 * 内側に主張が置かれ、一度も実行されていなかった。
 * 前提（正方形でない画像）はテスト自身が用意する。
 *
 * @param width - 画像幅（ピクセル）
 * @param height - 画像高さ（ピクセル）
 * @returns PNG バイナリ
 */
function buildPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: トゥルーカラー（RGB）
  ihdr[10] = 0; // 圧縮方式
  ihdr[11] = 0; // フィルター方式
  ihdr[12] = 0; // インターレース無し

  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // フィルタータイプ: None
    for (let x = 0; x < width; x++) {
      const pixel = rowStart + 1 + x * 3;
      raw[pixel] = Math.floor((x * 255) / width);
      raw[pixel + 1] = Math.floor((y * 255) / height);
      raw[pixel + 2] = 128;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 検証用の横長テスト画像（正方形でないことが REQ-22.3 の前提）
 *
 * デスクトップ幅の注釈エディタは `computeFitScale({ allowUpscale: false })`
 * （frontend/src/components/site-surveys/AnnotationEditor.tsx:1088）により
 * 原寸で頭打ちになるため、キャンバスの実寸はこの画素数そのものになる。
 * キャンバス上でドラッグして図形を描く検証があるので、
 * 中心から十分に離れた座標を取れる大きさにしておく。
 */
const LANDSCAPE_IMAGE_WIDTH = 640;
const LANDSCAPE_IMAGE_HEIGHT = 360;

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

      // 画像をAPIで直接アップロード（正方形でない画像を用意する）
      const landscapeImage = buildPng(LANDSCAPE_IMAGE_WIDTH, LANDSCAPE_IMAGE_HEIGHT);

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      const uploadResponse = await page.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          multipart: {
            images: {
              name: 'test-image-landscape.png',
              mimeType: 'image/png',
              buffer: landscapeImage,
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
   * 背景画像を除く注釈オブジェクトの位置・サイズを読み出すヘルパー関数
   *
   * 回転の前後で同じ読み出しを行うため、複製せず一つに畳む。
   */
  async function readAnnotationObjects(
    page: import('@playwright/test').Page
  ): Promise<{ left: number; top: number; width: number; height: number }[]> {
    return await page.evaluate(() => {
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
  }

  /**
   * 背景画像を除く注釈オブジェクトの件数を返す
   */
  async function countAnnotationObjects(page: import('@playwright/test').Page): Promise<number> {
    return (await readAnnotationObjects(page)).length;
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
    expect(sizeAfter.width).toBeGreaterThan(0);
    expect(sizeAfter.height).toBeGreaterThan(0);

    // 前提（テスト画像が正方形でないこと）そのものを無条件に主張する。
    // 従来は同じ条件で主張を包んでおり、事前準備が正方形の画像を使っていたため
    // 幅と高さの入れ替わりは一度も検証されていなかった。
    expect(
      Math.abs(sizeBefore.width - sizeBefore.height),
      '回転前のキャンバスが正方形であり、幅と高さの入れ替わりを観測できない'
    ).toBeGreaterThan(5);

    // 幅と高さが入れ替わったことを確認（許容誤差5px）
    expect(Math.abs(sizeAfter.width - sizeBefore.height)).toBeLessThan(5);
    expect(Math.abs(sizeAfter.height - sizeBefore.width)).toBeLessThan(5);
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

    // キャンバス上で描画する。
    // REQ-7.1 が定める矢印の作図は「ツールを選択してドラッグする」であり、
    // 従来の二度のクリックでは矢印が一本も生成されていなかった
    // （site-survey-annotation-tools.spec.ts の performDrag が正しい操作）。
    // 生成されないまま `expect(objectsAfter.length).toBe(objectsBefore.length)` が
    // 0 === 0 で成立していたため、REQ-22.2 の位置・サイズの比較は一度も実行されていない。
    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x - 60, center.y - 40);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 40, { steps: 10 });
    await page.mouse.up();

    // 描画がキャンバスへ反映されるまで待つ（固定時間ではなく件数の条件で待つ）
    await expect
      .poll(async () => await countAnnotationObjects(page), {
        message: '矢印の描画がキャンバスへ反映されない',
        timeout: getTimeout(5000),
      })
      .toBeGreaterThan(0);

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await page.waitForTimeout(200);

    // 注釈オブジェクトの位置情報を取得（Fabric.jsのキャンバスオブジェクトから）
    const objectsBefore = await readAnnotationObjects(page);

    // 回転ボタンをクリック
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await rotateButton.click();
    await page.waitForTimeout(300);

    // 回転後の注釈オブジェクトの位置情報を取得
    const objectsAfter = await readAnnotationObjects(page);

    // 直前に矢印を1本描いているため、回転前に注釈オブジェクトが存在する。
    // 前提そのものを主張してから位置・サイズを比べる（描画に失敗していた場合、
    // 従来は主張が一つも実行されないまま緑になっていた）。
    expect(objectsBefore.length, '回転前に注釈オブジェクトが描画されていない').toBeGreaterThan(0);

    // 注釈オブジェクトの数が同じであること
    expect(objectsAfter.length).toBe(objectsBefore.length);

    // 注釈オブジェクトの位置・サイズが維持されていること (REQ-22.2: 追従しない)
    expect(objectsAfter[0]!.left).toBeCloseTo(objectsBefore[0]!.left, 0);
    expect(objectsAfter[0]!.top).toBeCloseTo(objectsBefore[0]!.top, 0);
    expect(objectsAfter[0]!.width).toBeCloseTo(objectsBefore[0]!.width, 0);
    expect(objectsAfter[0]!.height).toBeCloseTo(objectsBefore[0]!.height, 0);
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

    // 前提（テスト画像が正方形でないこと）を無条件に主張したうえで、
    // 回転によってキャンバス幅が変化することを検証する
    expect(
      Math.abs(sizeOriginal.width - sizeOriginal.height),
      '回転前のキャンバスが正方形であり、回転によるサイズ変化を観測できない'
    ).toBeGreaterThan(5);
    expect(Math.abs(sizeAfterRotation.width - sizeOriginal.width)).toBeGreaterThan(3);

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
    // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると「後片付けした」ことになり、
    // 前提の生成が壊れたことが記録に残らない。前提が崩れた地点で失敗させる。
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');

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
