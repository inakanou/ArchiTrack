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
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { getFabricObjectCount, waitForFabricCanvas } from '../../helpers/fabric-canvas';

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
    // Task 115.165: ここにあった固定待機は、直後の toBeVisible が同じ条件を待つため撤去した
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
    await editModeButton.click();

    // 注釈ツールバーが表示されるのを待つ
    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(10000) });

    // 注釈エディタの初期化を待つ
    // Task 115.165: 「この時間で初期化されたはず」と見込む固定待機ではなく、
    // 本番が描画面を window へ載せた事実そのものを待つ。
    // Task 115.184: 件数の観測（getFabricObjectCount）は描画面が不在なら投げる。
    // 待ち合わせは観測の内側へ隠さず、観測できる状態をここで確立しておく。
    await waitForFabricCanvas(page);

    return true;
  }

  /**
   * 次の描画フレームが二度描かれるまで待つヘルパー
   *
   * Task 115.165: レイアウトが落ち着いたかどうかを見込みの時間で計るのではなく、
   * ブラウザが実際に描画を終えた合図（requestAnimationFrame）で刻む。
   * 一度目の rAF はレイアウト確定前に走りうるため二度取る。
   */
  async function waitForNextFrames(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
  }

  /**
   * キャンバスの中心座標を取得するヘルパー関数
   *
   * 注:
   * - Fabric.jsキャンバスは画像読み込み完了時に setDimensions で最終サイズに変更されるため、
   *   upper-canvas の bounding box が Fabric キャンバスの getWidth/getHeight と一致し、
   *   かつ背景画像が設定済みになるまで待機する。
   * - さらに、ツールボタンの aria-pressed 切替などでツールバー領域の高さが変わると、
   *   その下に配置されるキャンバスの screen Y 座標が数十px ずれる場合がある。
   *   そのため、複数回連続して同じ座標が観測されるまで待機して座標を安定化させる。
   */
  async function getCanvasCenter(
    page: import('@playwright/test').Page
  ): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    let box: { x: number; y: number; width: number; height: number } | null = null;
    let stableCount = 0;
    let lastBox: { x: number; y: number; width: number; height: number } | null = null;

    // boundingBox が Fabric キャンバスの実サイズに一致し、かつ位置が安定するまで最大10秒待機
    // Task 115.165: 刻みは固定時間ではなく描画フレームで取る。回数ではなく期限で区切るため、
    // 待てる総量は従来（20回 × 200ms）と同じ 10 秒に保ちつつ、落ち着いた時点で即座に抜ける。
    const deadline = Date.now() + getTimeout(10000);
    while (Date.now() < deadline) {
      box = await upperCanvas.boundingBox();
      const fabricSize = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvas = (window as any).__fabricCanvas;
        if (!canvas) return null;
        return {
          width: canvas.getWidth(),
          height: canvas.getHeight(),
          hasBackground: canvas.backgroundImage !== null && canvas.backgroundImage !== undefined,
        };
      });
      const sizeMatches =
        box &&
        box.width > 10 &&
        box.height > 10 &&
        fabricSize &&
        fabricSize.hasBackground &&
        Math.abs(fabricSize.width - box.width) < 1 &&
        Math.abs(fabricSize.height - box.height) < 1;
      const positionStable =
        box && lastBox && Math.abs(box.x - lastBox.x) < 1 && Math.abs(box.y - lastBox.y) < 1;
      if (sizeMatches && positionStable) {
        stableCount += 1;
        if (stableCount >= 2) {
          break;
        }
      } else {
        stableCount = 0;
      }
      lastBox = box;
      await waitForNextFrames(page);
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
   * Fabric.jsキャンバスのアクティブ（選択中）オブジェクトを取得するヘルパー関数
   * 選択中のオブジェクトがない場合は null を返す
   *
   * 注（Task 115.140）: 描画面（`window.__fabricCanvas`）が取得できない場合は null を返さず、
   * その場で失敗させる。null を返すと「選択されていないこと」の主張が、描画面が不在でも
   * 成立してしまい、何も主張しない検証になるためである。空値を返す経路が
   * 「対象が不在」と「そもそも観測できなかった」の二つに分かれている限り、
   * 不在の主張はそのどちらで成立したのかを区別できない。
   */
  async function getActiveObject(
    page: import('@playwright/test').Page
  ): Promise<{ type: string } | null> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) {
        throw new Error(
          'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
            '選択状態を観測できないため、ここで失敗させる'
        );
      }
      const active = canvas.getActiveObject();
      if (!active) {
        return null;
      }
      return { type: active.type ?? 'unknown' };
    });
  }

  /**
   * 描画面の「選択の受け付け」状態を観測するヘルパー
   *
   * Task 115.165: 要件17.6 の無効化そのもの（Fabric キャンバスの `selection` と、
   * 各オブジェクトの `selectable` / `evented`）を読む。道具帯の `aria-pressed` は
   * React の状態を映すだけで、描画面へ適用済みであることまでは述べていない。
   * 不在の主張の手前に置かれていた固定待機は、この適用を確かめずに時間で見込んでいた。
   *
   * 描画面が取得できない場合は getActiveObject と同じ理由でその場で失敗させる。
   */
  async function getSelectionCapability(page: import('@playwright/test').Page): Promise<{
    canvasSelection: boolean;
    selectableObjectCount: number;
    eventedObjectCount: number;
  }> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) {
        throw new Error(
          'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
            '選択の受け付け状態を観測できないため、ここで失敗させる'
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objects: any[] = canvas.getObjects();
      return {
        canvasSelection: canvas.selection === true,
        selectableObjectCount: objects.filter((o) => o.selectable === true).length,
        eventedObjectCount: objects.filter((o) => o.evented === true).length,
      };
    });
  }

  /**
   * テキスト注釈が編集モードへ入っているかを観測するヘルパー
   *
   * Task 115.165: 本番（AnnotationEditor）はテキストツールのクリックで
   * `enterEditing()` を呼ぶ。キー入力を送る前に必要なのは「300ms 経ったこと」ではなく
   * 「編集モードへ入ったこと」であるため、その事実を待つ。
   */
  async function isEditingText(page: import('@playwright/test').Page): Promise<boolean> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (window as any).__fabricCanvas;
      if (!canvas) {
        throw new Error(
          'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
            'テキストの編集状態を観測できないため、ここで失敗させる'
        );
      }
      const active = canvas.getActiveObject();
      return Boolean(active && active.isEditing === true);
    });
  }

  /**
   * 初期オブジェクト（四角形）を描画して、描画ツールテストの前提条件を整えるヘルパー
   * 描画後にオブジェクト数が増えたことを検証し、キャンバス中心座標を返す
   *
   * 注: ツールボタンの aria-pressed 切替でツールバー高さが変わりキャンバス位置が
   * シフトすることがあるため、getCanvasCenter はツール選択後（レイアウト安定後）に呼び出す。
   */
  async function drawInitialRectangle(
    page: import('@playwright/test').Page
  ): Promise<{ center: { x: number; y: number }; objectCountAfter: number }> {
    const objectCountBefore = await getFabricObjectCount(page);

    // 四角形ツールを選択（このタイミングで toolbar の layout が変わりうる）
    const rectTool = page.getByRole('button', { name: /四角形/i });
    await expect(rectTool).toBeVisible({ timeout: getTimeout(5000) });
    await rectTool.click();
    await expect(rectTool).toHaveAttribute('aria-pressed', 'true');

    // ツール選択後の安定したキャンバス座標を取得
    const center = await getCanvasCenter(page);

    // キャンバス中央付近に四角形を描画
    await performDrag(page, center.x - 40, center.y - 30, center.x + 40, center.y + 30);

    // Task 115.165: 「500ms あれば作られたはず」と見込む固定待機ではなく、
    // 図形が一つ増えた事実そのものを待つ。ここが待ち合わせと主張を兼ねる。
    await expect
      .poll(() => getFabricObjectCount(page), {
        message: '四角形ツールのドラッグで描画面の図形が一つ増えること',
        timeout: getTimeout(5000),
      })
      .toBe(objectCountBefore + 1);
    const objectCountAfter = objectCountBefore + 1;

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

    // 選択ツールでクリックした結果、オブジェクトが選択状態になることを確認
    // Task 115.165: 固定待機を撤去し、選択が成立したことを条件として待つ
    await expect
      .poll(() => getActiveObject(page), {
        message: '選択ツールのクリックでキャンバス中央のオブジェクトが選択されること',
        timeout: getTimeout(5000),
      })
      .not.toBeNull();
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

    // 選択ツールに切り替え
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

    // 前提: キャンバス中央には「選択されうる既存オブジェクト」が実在する（Task 115.140）。
    // これを確かめずに後段の「選択されない」を主張すると、対象が不在でも主張が成立する。
    await page.mouse.click(center.x, center.y);
    await expect
      .poll(() => getActiveObject(page), {
        message:
          '選択ツールならキャンバス中央のオブジェクトが選択される（後段の不在の主張の対象が実在すること）',
        timeout: getTimeout(5000),
      })
      .not.toBeNull();

    // キャンバスの端をクリックして選択解除
    const upperCanvas = page.locator('.upper-canvas');
    const box = await upperCanvas.boundingBox();
    assertPresent(box, '注釈キャンバス（.upper-canvas）の境界ボックス');
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect
      .poll(() => getActiveObject(page), {
        message:
          '端をクリックすれば選択が解除される（後段の不在の主張の起点を固定待機で仮定せずに確かめる）',
        timeout: getTimeout(5000),
      })
      .toBeNull();

    // 円ツールに切り替え（描画ツール）
    const circleTool = page.getByRole('button', { name: /円/i });
    await circleTool.click();
    await expect(circleTool).toHaveAttribute('aria-pressed', 'true');

    // 既存オブジェクト（四角形）の上でマウスダウンし、そのままドラッグへ入る
    const countBeforeDown = await getFabricObjectCount(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 30, center.y + 20, { steps: 5 });

    // Task 115.165: 不在の主張の手前にあった固定待機（200ms）を条件待ちへ改める。
    // 要件17.1 は「選択せず**描画操作を開始**する」ことを述べている。描画操作が始まれば
    // 本番はプレビュー図形を描画面へ載せるため、その出現を待つことで
    // 「マウスダウンが処理され、かつ描画として扱われた」ことを確かめたうえで
    // 「選択されていないこと」を主張できる。時間で落ち着きを見込む必要はない。
    await expect
      .poll(() => getFabricObjectCount(page), {
        message:
          '既存オブジェクト上のマウスダウンが描画操作として扱われ、プレビュー図形が描画面へ現れること',
        timeout: getTimeout(5000),
      })
      .toBe(countBeforeDown + 1);

    // 描画ツール使用中はオブジェクトが選択されないことを確認
    const activeObj = await getActiveObject(page);
    expect(activeObj).toBeNull();

    // マウスアップして描画操作を終える
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

    // 前提: キャンバス中央には「選択されうる既存オブジェクト」が実在する（Task 115.140）。
    // これを確かめずに後段の「選択されない」を主張すると、対象が不在でも主張が成立する。
    const selectTool = page.getByRole('button', { name: /選択/i });
    await selectTool.click();
    await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(center.x, center.y);
    await expect
      .poll(() => getActiveObject(page), {
        message:
          '選択ツールならキャンバス中央のオブジェクトが選択される（後段の不在の主張の対象が実在すること）',
        timeout: getTimeout(5000),
      })
      .not.toBeNull();

    // 選択を解除してから描画ツールの検証に入る
    const upperCanvas = page.locator('.upper-canvas');
    const box = await upperCanvas.boundingBox();
    assertPresent(box, '注釈キャンバス（.upper-canvas）の境界ボックス');
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect
      .poll(() => getActiveObject(page), {
        message:
          '端をクリックすれば選択が解除される（後段の不在の主張の起点を固定待機で仮定せずに確かめる）',
        timeout: getTimeout(5000),
      })
      .toBeNull();

    // 複数の描画ツールで選択が無効化されていることを確認
    const drawingToolNames = [/矢印/i, /円/i, /四角形/i, /フリーハンド/i];

    for (const toolNamePattern of drawingToolNames) {
      const tool = page.getByRole('button', { name: toolNamePattern });
      await tool.click();
      await expect(tool).toHaveAttribute('aria-pressed', 'true');

      // Task 115.165: 不在の主張の手前にあった固定待機（200ms）を条件待ちへ改める。
      // 道具帯の押下表示（aria-pressed）は React の状態を映すだけで、
      // 描画面へ選択の無効化が適用されたことまでは述べていない。
      // 要件17.6 が述べる無効化そのもの（キャンバスの selection と
      // 各オブジェクトの selectable / evented）が適用された事実を待ってからクリックする。
      await expect
        .poll(() => getSelectionCapability(page), {
          message:
            '描画ツールの選択が描画面へ適用され、既存オブジェクトが選択の対象から外れること（要件17.6）',
          timeout: getTimeout(5000),
        })
        .toEqual({ canvasSelection: false, selectableObjectCount: 0, eventedObjectCount: 0 });

      // 既存オブジェクト上をクリック
      await page.mouse.click(center.x, center.y);

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
    const { objectCountAfter: countAfterFirst } = await drawInitialRectangle(page);

    // 円ツールに切り替え
    const circleTool = page.getByRole('button', { name: /円/i });
    await circleTool.click();
    await expect(circleTool).toHaveAttribute('aria-pressed', 'true');

    // ツール切替後にレイアウトが安定したキャンバス座標を再取得
    const center = await getCanvasCenter(page);

    // 既存オブジェクトの外側から描画開始し、既存オブジェクト上でマウスアップ
    // 開始点: 既存オブジェクトの左上外側（キャンバス内に収まる座標）
    // 終了点: 既存オブジェクトの中心（既存オブジェクト上）
    // 注: テスト画像が100x100pxのため、キャンバスサイズを超えないよう座標を調整
    await performDrag(page, center.x - 45, center.y - 40, center.x, center.y);

    // 新しい図形が正常に作成されたことを確認（オブジェクト数が1つ増加）
    // Task 115.165: 固定待機を撤去し、作成された事実そのものを待つ
    await expect
      .poll(() => getFabricObjectCount(page), {
        message: '既存オブジェクト上でマウスアップしても新しい図形が一つ作成されること',
        timeout: getTimeout(5000),
      })
      .toBe(countAfterFirst + 1);
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
    // Task 115.165: 頂点の間にあった固定待機（200ms）は、何を待つものか特定できなかった。
    // 頂点の登録は主張の対象ではなく、主張は最後の「図形が一つ増えたこと」だけが担う。
    // 撤去したうえで通ることを実測（連続5回、および CPU を6倍遅くした状態）で確かめた。
    // 頂点1: 既存オブジェクトの上（オブジェクト上）
    await page.mouse.click(center.x, center.y - 10);
    // 頂点2: 既存オブジェクトの右下外側
    await page.mouse.click(center.x + 80, center.y + 60);
    // 頂点3: 既存オブジェクトの左下外側
    await page.mouse.click(center.x - 80, center.y + 60);
    // ダブルクリックで多角形を閉じる（最初の頂点付近、既存オブジェクト上）
    await page.mouse.dblclick(center.x, center.y - 10);

    // 多角形が正常に作成されたことを確認
    // Task 115.165: 固定待機を撤去し、作成された事実そのものを待つ
    await expect
      .poll(() => getFabricObjectCount(page), {
        message: '多角形が一つ作成されること（プレビューは確定時に取り除かれる）',
        timeout: getTimeout(5000),
      })
      .toBe(countAfterFirst + 1);
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
    // 注: テスト画像が100x100pxのため、キャンバスサイズを超えないよう座標を調整
    // Task 115.165: 多角形と同じ理由で、点の間の固定待機（200ms）は撤去し、実測で確かめた
    // 点1: 既存オブジェクトの左外側（キャンバス内）
    await page.mouse.click(center.x - 45, center.y);
    // 点2: 既存オブジェクトの中心（オブジェクト上）
    await page.mouse.click(center.x, center.y);
    // 点3: 既存オブジェクトの右外側（キャンバス内）
    await page.mouse.click(center.x + 45, center.y);
    // ダブルクリックで折れ線を終了
    await page.mouse.dblclick(center.x + 45, center.y);

    // 折れ線が正常に作成されたことを確認
    // Task 115.165: 固定待機を撤去し、作成された事実そのものを待つ
    await expect
      .poll(() => getFabricObjectCount(page), {
        message: '折れ線が一つ作成されること（プレビューは確定時に取り除かれる）',
        timeout: getTimeout(5000),
      })
      .toBe(countAfterFirst + 1);
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

    // Task 115.165: キー入力の手前で必要なのは「300ms 経ったこと」ではなく
    // 「本番がテキストを編集モードへ入れたこと」である。その事実を待つ。
    await expect
      .poll(() => isEditingText(page), {
        message: 'テキストツールのクリックでテキスト注釈が編集モードへ入ること',
        timeout: getTimeout(5000),
      })
      .toBe(true);

    // テキストを入力
    await page.keyboard.type('テスト注釈');
    await page.keyboard.press('Escape');

    // テキスト注釈が作成されたことを確認（オブジェクト数が1つ増加）
    // Task 115.165: 固定待機を撤去し、作成された事実そのものを待つ
    await expect
      .poll(() => getFabricObjectCount(page), {
        message: 'テキスト注釈が一つ作成されること',
        timeout: getTimeout(5000),
      })
      .toBe(countAfterFirst + 1);
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
