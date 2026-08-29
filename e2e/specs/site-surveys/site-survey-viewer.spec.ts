/**
 * @fileoverview 現場調査画像ビューアのE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-4.2: 複数画像の同時選択（バッチアップロード）
 * - REQ-4.5: 許可されない形式のエラー表示
 * - REQ-4.9: JPEG、PNG、WEBP形式をサポート
 * - REQ-4.10: 画像一覧を固定の表示順序で表示
 * - REQ-4.11: ドラッグアンドドロップで表示順序を変更
 * - REQ-5.1: 画像をクリックして専用画面のビューアを開く
 * - REQ-5.2: ズームイン/ズームアウト操作
 * - REQ-5.3: 画像の回転
 * - REQ-5.4: パン操作（表示領域移動）
 * - REQ-5.5: ピンチ操作（タッチデバイス）でのズーム
 * - REQ-5.6: 表示状態を注釈編集モードと共有
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 画像が存在しない場合にアップロードするヘルパー関数
 */
async function ensureImageExists(
  page: import('@playwright/test').Page,
  _surveyId: string
): Promise<boolean> {
  const imageGrid = page.locator('[aria-label="写真管理パネル"]');
  await expect(imageGrid).toBeVisible({ timeout: getTimeout(5000) });

  // 画像が存在するか確認
  const imageButtons = imageGrid.locator('button:has(img)');
  const imageCount = await imageButtons.count();

  if (imageCount > 0) {
    return true;
  }

  // 画像がない場合はアップロード
  const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
  const input = page.locator('input[type="file"]').first();

  if ((await input.count()) === 0) {
    const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
    const uploadVisible = await uploadButton.isVisible();
    if (uploadVisible) {
      await uploadButton.click();
    }
  }

  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles(testImagePath);
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('images') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    return true;
  }
  return false;
}

test.describe('現場調査画像ビューア', () => {
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

      const projectName = `ビューアテスト用プロジェクト_${Date.now()}`;
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

      const surveyName = `ビューアテスト用現場調査_${Date.now()}`;
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

      // 後続のテスト（REQ-4.10 の表示順序・REQ-4.11 の並び替え）のために画像を2枚アップロードする。
      //
      // 以前は `input[type="file"]` の件数を即時に数え、0 件なら**アップロードごと丸ごと飛ばして**
      // 事前準備が緑になっていた（Task 115.127 段6）。`count()` は待たないため、
      // 画面の描画が遅い状況（全 spec の通し実行など）では 0 件と観測され、
      // 画像の無い現場調査のまま後続へ進む。実際に REQ-4.10 の主張を無条件へ改めた結果、
      // 単体では緑・通し実行では赤という食い違いとして現れた。
      // ファイル入力（ImageUploader が常に描画する隠し入力）が現れるまで待ってから、
      // 2枚のアップロードと一覧への反映を無条件に主張する。
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
      const fileInput = page.getByTestId('file-input').first();
      await fileInput.waitFor({ state: 'attached', timeout: getTimeout(15000) });

      for (let uploaded = 0; uploaded < 2; uploaded++) {
        // アップロード中はファイル入力が disabled になる（ImageUploader.tsx の disabled || isBusy）。
        // 受け付けられる状態になるまで待つ（固定時間の待機は用いない）
        await expect(fileInput).toBeEnabled({ timeout: getTimeout(30000) });

        const uploadResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/') &&
            response.url().includes('images') &&
            response.request().method() === 'POST' &&
            response.status() === 201,
          { timeout: getTimeout(30000) }
        );
        await fileInput.setInputFiles(testImagePath);
        await uploadResponse;
      }

      // ページを再読み込みして画像が表示されることを確認
      await page.reload({ waitUntil: 'networkidle' });

      const imageGrid = page.locator('[aria-label="写真管理パネル"]');
      await expect(imageGrid).toBeVisible({ timeout: getTimeout(10000) });
      const imageItems = imageGrid.locator('[data-testid="photo-image-button"]');
      await expect(imageItems, '事前準備でアップロードした2枚が一覧に並ばない').toHaveCount(2, {
        timeout: getTimeout(15000),
      });
    });
  });

  /**
   * @requirement site-survey/REQ-4.2
   */
  test.describe('複数画像アップロード', () => {
    test('複数の画像を同時に選択してアップロードできる (site-survey/REQ-4.2)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      const fileInput = page.locator('input[type="file"]').first();

      if ((await fileInput.count()) === 0) {
        // アップロードボタンがある場合
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
      }

      // 複数ファイル選択が可能か確認
      const input = page.locator('input[type="file"]').first();
      await expect(input).toHaveCount(1);
      const isMultiple = await input.evaluate(
        (el) => (el as unknown as { multiple: boolean }).multiple
      );

      // REQ-4.2: ファイル入力が複数選択を受け付けること。
      // 観測した multiple の値そのものを主張する（従来は `|| true` で常に真だった）。
      expect(isMultiple).toBe(true);
    });
  });

  /**
   * @requirement site-survey/REQ-4.9
   *
   * タスク 115.188 の是正: 従前は REQ-4.5 を名乗っていたが、受入基準4.5 の原文は「If アップロードされたファイルが許可された形式でない,
   * then the Site Survey Service shall エラーメッセージを表示してアップロードを拒否する」
   * である。本区間の表題・本文が述べる内容に対応するのは受入基準4.9（「The Site Survey Service shall
   * JPEG、PNG、WEBP形式の画像ファイルをサポートする」）である。
   */
  test.describe('ファイル形式バリデーション', () => {
    test('accept属性でサポート形式が制限されている (site-survey/REQ-4.5)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const fileInput = page.locator('input[type="file"]').first();

      if ((await fileInput.count()) === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
      }

      const input = page.locator('input[type="file"]').first();
      await expect(input).toBeAttached();

      // 観測した accept の値そのものを主張する。
      // 従来は入力欄の有無と属性の有無で判定ごと素通りし、accept が未設定でも緑だった。
      const accept = await input.getAttribute('accept');
      expect(accept, 'REQ-4.5: ファイル入力に accept 属性が設定されている').not.toBeNull();
      expect(accept?.toLowerCase() ?? '', 'REQ-4.5: accept が画像形式の受け入れ指定を含む').toMatch(
        /image\/|\.jpe?g|\.png|\.webp/
      );
    });
  });

  /**
   * @requirement site-survey/REQ-4.9
   */
  test.describe('サポートファイル形式', () => {
    test('JPEG、PNG、WEBP形式がサポートされている (site-survey/REQ-4.9)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const fileInput = page.locator('input[type="file"]').first();

      if ((await fileInput.count()) === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
      }

      const input = page.locator('input[type="file"]').first();
      await expect(input).toBeAttached();

      // 観測した accept の値そのものを主張する。
      // 従来は入力欄の有無と属性の有無で判定ごと素通りし、accept が未設定でも緑だった。
      const accept = await input.getAttribute('accept');
      expect(accept, 'REQ-4.9: ファイル入力に accept 属性が設定されている').not.toBeNull();
      expect(accept?.toLowerCase() ?? '', 'REQ-4.9: accept が画像形式の受け入れ指定を含む').toMatch(
        /image\/|jpe?g|png|webp/
      );
    });
  });

  /**
   * @requirement site-survey/REQ-4.10
   */
  test.describe('画像表示順序', () => {
    test('画像一覧が一定の順序で表示される (site-survey/REQ-4.10)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像一覧コンテナを確認
      const imageContainer = page.locator('[aria-label="写真管理パネル"]');

      // 画像コンテナが存在することを必須検証
      await expect(imageContainer).toBeVisible({ timeout: getTimeout(3000) });

      // 画像アイテムを取得（事前準備でアップロード済みであることが前提）
      const imageItems = imageContainer.locator('[data-testid="photo-image-button"]');
      await expect(
        imageItems.first(),
        '事前準備でアップロードした画像が一覧に現れない'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-4.10: 画像一覧は固定の表示順序で表示される。
      // 以前は「画像がある場合のみ先頭が見えることを確認する」形で、
      // 画像が無ければ何も主張せず、順序そのものは一度も検証していなかった。
      // 再読み込みしても並びが変わらないことを主張する。
      const panelItems = imageContainer.locator('[data-testid="photo-panel-item"]');
      const orderBefore = await panelItems.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-image-id'))
      );
      expect(orderBefore.length, '画像一覧に画像が並んでいない').toBeGreaterThan(0);
      expect(orderBefore, '画像一覧の項目に画像IDが振られていない').not.toContain(null);

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(imageContainer).toBeVisible({ timeout: getTimeout(10000) });
      await expect(imageItems.first()).toBeVisible({ timeout: getTimeout(10000) });

      const orderAfter = await panelItems.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-image-id'))
      );
      expect(orderAfter, '再読み込みで画像一覧の表示順序が変わった').toEqual(orderBefore);
    });
  });

  /**
   * @requirement site-survey/REQ-4.11
   */
  test.describe('画像並び替え', () => {
    test('ドラッグアンドドロップUIが存在する (site-survey/REQ-4.11)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像グリッドが存在することを確認
      const imageGrid = page.locator('[aria-label="写真管理パネル"]');
      await expect(imageGrid).toBeVisible({ timeout: getTimeout(10000) });

      // 事前準備で画像を二枚アップロードしているため、画像は無条件に存在する。
      // （従来は画像が無い場合にグリッドの表示という常に真の判定で緑にして戻っていた）
      const imageButtons = imageGrid.locator('[data-testid="photo-image-button"]');
      expect(
        await imageButtons.count(),
        'REQ-4.11: 事前準備でアップロードした画像が一覧に存在する'
      ).toBeGreaterThanOrEqual(1);

      // ドラッグハンドルが存在することを確認
      // ドラッグハンドルはdata-testid="photo-drag-handle"を持ち、draggable属性がある
      const dragHandles = page.locator('[data-testid="photo-drag-handle"]');
      expect(
        await dragHandles.count(),
        'REQ-4.11: 画像ごとにドラッグハンドルが描画される'
      ).toBeGreaterThanOrEqual(1);

      // ドラッグハンドルのdraggable属性を確認
      const firstDragHandle = dragHandles.first();
      await expect(firstDragHandle).toBeVisible();

      const hasDraggableAttr = await firstDragHandle.evaluate((el) => el.hasAttribute('draggable'));
      expect(hasDraggableAttr).toBeTruthy();

      // アクセシビリティ: ドラッグハンドルが適切なaria-labelを持っているか確認
      const ariaLabel = await firstDragHandle.getAttribute('aria-label');
      expect(ariaLabel).toBe('ドラッグして順序を変更');
    });
  });

  /**
   * 画像ビューア（専用画面）を開く。
   *
   * 前提（現場調査・画像）が満たせない場合は throw して失敗させる（第3原則）。
   */
  async function openImageViewer(page: import('@playwright/test').Page): Promise<void> {
    if (!createdSurveyId) {
      throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
    }

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // 前提の成否を主張で受ける（Task 115.141）。
    // `ensureImageExists` は真偽を返す前提の補助であり、検出器はこの補助の内側の
    // 「値を決める分岐」を対象外にしている。その除外の正当性は「真偽を呼び出し側が
    // どう扱うかは依然として関門である」ことに依拠する。戻り値を捨てると、その依拠が
    // 呼び出し側で空洞になり、前提が崩れたときの失敗は前提の地点ではなく後段に現れる。
    const imagePrepared = await ensureImageExists(page, createdSurveyId);
    assertPrepared(imagePrepared, '画像ビューアの前提として用意した現場調査の画像');

    const imageElement = page.locator('[aria-label="写真管理パネル"] button:has(img)').first();
    await expect(imageElement).toBeVisible({ timeout: getTimeout(10000) });
    await imageElement.click();

    await page.waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });
    await page.waitForLoadState('networkidle');

    // 画像ビューアの本体（Fabric キャンバス）が用意されるまで待つ
    await expect(page.locator('[data-testid="annotation-editor-container"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByTestId('zoom-controls')).toBeVisible({ timeout: getTimeout(15000) });
  }

  /**
   * 実装が公開する `window.__fabricCanvas` から表示状態を読み出す。
   * [0]=zoom, [4]=panX, [5]=panY。背景画像の angle が画像の回転角度（Req 22.1/5.3）。
   */
  async function readViewState(page: import('@playwright/test').Page): Promise<{
    zoom: number;
    panX: number;
    panY: number;
    rotation: number;
  }> {
    return await page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getZoom(): number;
            viewportTransform: number[];
            backgroundImage?: { angle?: number } | null;
          };
        }
      ).__fabricCanvas;
      if (!canvas) {
        return { zoom: -1, panX: 0, panY: 0, rotation: -1 };
      }
      const vpt = canvas.viewportTransform;
      return {
        zoom: canvas.getZoom(),
        panX: vpt[4] ?? 0,
        panY: vpt[5] ?? 0,
        rotation: canvas.backgroundImage?.angle ?? -1,
      };
    });
  }

  /**
   * @requirement site-survey/REQ-5.1
   */
  test.describe('画像ビューア起動', () => {
    test('画像をクリックすると専用画面の画像ビューアが開く (site-survey/REQ-5.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      // 専用画面（画像ビューア）のURLへ遷移していること
      expect(page.url()).toMatch(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`));
      // 閲覧のみの状態で開くこと（編集モードへ入る導線が「編集モード」を示す）
      await expect(page.getByRole('button', { name: '編集モード' })).toBeVisible({
        timeout: getTimeout(5000),
      });
      // 画像が実際に描画されていること
      const state = await readViewState(page);
      expect(state.zoom).toBeGreaterThan(0);
    });
  });

  /**
   * @requirement site-survey/REQ-5.2
   */
  test.describe('ズーム機能', () => {
    test('閲覧のみの状態でズーム操作手段が提供される (site-survey/REQ-5.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      const zoomControls = page.getByTestId('zoom-controls');
      await expect(zoomControls.getByRole('button', { name: 'ズームイン' })).toBeVisible();
      await expect(zoomControls.getByRole('button', { name: 'ズームアウト' })).toBeVisible();
      await expect(zoomControls.getByRole('button', { name: '全体表示' })).toBeVisible();
      await expect(page.getByTestId('zoom-badge')).toHaveText('100%');
    });

    test('ズームイン/ズームアウト操作で画像が拡大/縮小される (site-survey/REQ-5.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      const zoomControls = page.getByTestId('zoom-controls');
      const before = await readViewState(page);

      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await expect(page.getByTestId('zoom-badge')).toHaveText('110%');
      const zoomedIn = await readViewState(page);
      expect(zoomedIn.zoom).toBeGreaterThan(before.zoom);

      await zoomControls.getByRole('button', { name: 'ズームアウト' }).click();
      await expect(page.getByTestId('zoom-badge')).toHaveText('100%');
      const zoomedOut = await readViewState(page);
      expect(zoomedOut.zoom).toBeLessThan(zoomedIn.zoom);
    });
  });

  /**
   * @requirement site-survey/REQ-5.3
   */
  test.describe('回転機能', () => {
    test('閲覧のみの状態で回転ボタンが提供される (site-survey/REQ-5.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      await expect(
        page.getByTestId('zoom-controls').getByRole('button', { name: '画像を90度回転' })
      ).toBeVisible();
    });

    test('回転ボタンで画像が90度単位で回転する (site-survey/REQ-5.3)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      const rotateButton = page
        .getByTestId('zoom-controls')
        .getByRole('button', { name: '画像を90度回転' });

      const before = await readViewState(page);
      expect(before.rotation).toBe(0);

      await rotateButton.click();
      await expect
        .poll(async () => (await readViewState(page)).rotation, {
          timeout: getTimeout(5000),
        })
        .toBe(90);

      await rotateButton.click();
      await expect
        .poll(async () => (await readViewState(page)).rotation, {
          timeout: getTimeout(5000),
        })
        .toBe(180);
    });
  });

  /**
   * @requirement site-survey/REQ-5.4
   */
  test.describe('パン操作', () => {
    test('拡大時のドラッグで表示領域が移動する (site-survey/REQ-5.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      // パンは拡大時のみ有効（Req 34.7）。まず拡大する。
      const zoomIn = page.getByTestId('zoom-controls').getByRole('button', { name: 'ズームイン' });
      await zoomIn.click();
      await zoomIn.click();
      await zoomIn.click();
      await expect(page.getByTestId('zoom-badge')).toHaveText('130%');

      const upperCanvas = page.locator('canvas.upper-canvas');
      await expect(upperCanvas).toBeVisible({ timeout: getTimeout(5000) });
      const box = await upperCanvas.boundingBox();
      if (!box) {
        throw new Error('upper-canvas の領域が取得できませんでした');
      }

      const before = await readViewState(page);

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 30, startY - 20, { steps: 5 });
      await page.mouse.move(startX - 60, startY - 40, { steps: 5 });
      await page.mouse.up();

      // 表示領域（viewportTransform の平行移動量）がドラッグ方向へ移動していること
      await expect
        .poll(async () => (await readViewState(page)).panX, { timeout: getTimeout(5000) })
        .toBeLessThan(before.panX);
      const after = await readViewState(page);
      expect(after.panY).toBeLessThan(before.panY);
      // 拡大倍率はパンで変化しない
      expect(after.zoom).toBeCloseTo(before.zoom, 5);
    });

    test('等倍表示ではドラッグしても表示領域が移動しない (site-survey/REQ-5.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);
      await expect(page.getByTestId('zoom-badge')).toHaveText('100%');

      const upperCanvas = page.locator('canvas.upper-canvas');
      await expect(upperCanvas).toBeVisible({ timeout: getTimeout(5000) });
      const box = await upperCanvas.boundingBox();
      if (!box) {
        throw new Error('upper-canvas の領域が取得できませんでした');
      }

      const before = await readViewState(page);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 60, startY - 40, { steps: 5 });
      await page.mouse.up();

      const after = await readViewState(page);
      expect(after.panX).toBe(before.panX);
      expect(after.panY).toBe(before.panY);
    });
  });

  /**
   * @requirement site-survey/REQ-5.5
   *
   * マルチタッチ（2本指ピンチ）は page.touchscreen では模擬できないため、
   * CDP `Input.dispatchTouchEvent`（複数 touchPoints）で送出する
   * （site-survey-annotation-mobile.spec.ts の Task 98.1 と同じ手法）。
   *
   * ピンチはキャンバス要素（upper-canvas）上の2点で成立するため、他テストが使う
   * 1x1 の `test-image.jpg` では2本目の指がキャンバス外になり判定できない。
   * 本テストだけは十分な表示サイズを持つ画像をアップロードして用いる。
   */
  test.describe('ピンチ操作', () => {
    test.use({ hasTouch: true });

    test('タッチデバイスのピンチ操作でズームレベルが変わる (site-survey/REQ-5.5)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ピンチ判定に足る表示サイズの画像を用意する（前提準備）
      const largeImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(largeImagePath);
      await page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('images') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );
      await page.reload({ waitUntil: 'networkidle' });

      // 追加した画像は表示順の末尾に付く
      const uploaded = page.locator('[aria-label="写真管理パネル"] button:has(img)').last();
      await expect(uploaded).toBeVisible({ timeout: getTimeout(10000) });
      await uploaded.click();

      await page.waitForURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
        timeout: getTimeout(10000),
      });
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('zoom-controls')).toBeVisible({ timeout: getTimeout(15000) });

      const upperCanvas = page.locator('canvas.upper-canvas');
      await expect(upperCanvas).toBeVisible({ timeout: getTimeout(5000) });
      const box = await upperCanvas.boundingBox();
      if (!box) {
        throw new Error('upper-canvas の領域が取得できませんでした');
      }
      // 2本指を置ける表示サイズであることを前提として要求する（満たさなければ失敗させる）
      expect(Math.min(box.width, box.height)).toBeGreaterThan(120);

      const cdp = await page.context().newCDPSession(page);
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const half = Math.min(box.width, box.height) / 2;
      const spreadFrom = half * 0.2;
      const spreadTo = half * 0.9;

      const before = await readViewState(page);

      // 2本指を中心から左右へ広げる（ピンチアウト＝拡大）
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: centerX - spreadFrom, y: centerY, id: 0 },
          { x: centerX + spreadFrom, y: centerY, id: 1 },
        ],
      });
      for (let i = 1; i <= 8; i++) {
        const offset = spreadFrom + ((spreadTo - spreadFrom) * i) / 8;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: centerX - offset, y: centerY, id: 0 },
            { x: centerX + offset, y: centerY, id: 1 },
          ],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

      await expect
        .poll(async () => (await readViewState(page)).zoom, { timeout: getTimeout(5000) })
        .toBeGreaterThan(before.zoom);
    });
  });

  /**
   * @requirement site-survey/REQ-5.6
   */
  test.describe('表示状態の共有', () => {
    test('閲覧モードで変えた倍率と回転が編集モードへ引き継がれる (site-survey/REQ-5.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      const zoomControls = page.getByTestId('zoom-controls');
      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await expect(page.getByTestId('zoom-badge')).toHaveText('120%');

      await zoomControls.getByRole('button', { name: '画像を90度回転' }).click();
      await expect
        .poll(async () => (await readViewState(page)).rotation, { timeout: getTimeout(5000) })
        .toBe(90);

      // 編集モードへ切り替える（キャンバスは作り直される）
      await page.getByRole('button', { name: '編集モード' }).click();
      await expect(page.getByRole('toolbar', { name: /注釈ツール/ })).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 倍率・回転が編集モードへ引き継がれていること
      await expect(page.getByTestId('zoom-badge')).toHaveText('120%', {
        timeout: getTimeout(15000),
      });
      await expect
        .poll(async () => (await readViewState(page)).rotation, { timeout: getTimeout(15000) })
        .toBe(90);
    });

    test('編集モードで変えた倍率が閲覧モードへ引き継がれる (site-survey/REQ-5.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await openImageViewer(page);

      await page.getByRole('button', { name: '編集モード' }).click();
      await expect(page.getByRole('toolbar', { name: /注釈ツール/ })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(page.getByTestId('zoom-badge')).toHaveText('100%', {
        timeout: getTimeout(15000),
      });

      const zoomControls = page.getByTestId('zoom-controls');
      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await zoomControls.getByRole('button', { name: 'ズームイン' }).click();
      await expect(page.getByTestId('zoom-badge')).toHaveText('130%');

      // 閲覧モードへ戻す
      await page.getByRole('button', { name: '編集終了' }).click();
      await expect(page.getByRole('toolbar', { name: /注釈ツール/ })).toBeHidden({
        timeout: getTimeout(15000),
      });

      await expect(page.getByTestId('zoom-badge')).toHaveText('130%', {
        timeout: getTimeout(15000),
      });
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      // localStorageにアクセスする前にアプリのオリジンに移動する必要がある
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると
      // 「後片付けした」ことになり、前提の生成が壊れたことが記録に残らない。
      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(5000) });
      await deleteButton.click();

      const confirmButton = page.getByRole('button', { name: '削除する' });
      await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await confirmButton.click();

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
