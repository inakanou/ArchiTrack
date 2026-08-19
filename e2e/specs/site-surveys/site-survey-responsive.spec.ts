/**
 * @fileoverview 現場調査レスポンシブ対応のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-15.1: デスクトップ・タブレット・スマートフォンの各画面サイズに対応したUI
 * - REQ-15.2: タッチ操作に最適化された注釈ツールを提供
 * - REQ-15.3: モバイル環境でのカメラ連携による直接撮影
 * - REQ-15.4: 一定間隔（30秒）で自動保存を実行
 * - REQ-15.5: ブラウザのlocalStorageから未保存の編集状態を復元
 * - REQ-15.6: ネットワーク接続が切断された場合の警告と保存ブロック
 *   （現場調査の配下に未実装。タスク 115.105 が所管。本ファイルでは test.fail() を付けた
 *   既知失敗として計上しており、被覆済みではない）
 * - REQ-15.7: QuotaExceededError時のLRU戦略による古いキャッシュ削除
 * - REQ-15.8: QuotaExceededErrorリトライ失敗時の警告表示
 * - REQ-15.9: プライベートブラウジングモードでの自動保存無効化
 * - REQ-15.10: クロスブラウザ対応のlocalStorageエラー検出
 */

import { test, expect, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

/**
 * タッチ操作の当たり判定の下限（論理ピクセル）。
 *
 * 本テストが確かめる要件15.2「タッチ操作に最適化された注釈ツールを提供する」自体は
 * 数値基準を持たない。44x44 は要件28.3 が本スペックの基準として定める値で、
 * 要件29.4（選択ハンドル）・要件34.5（ズーム操作手段）・要件35.5（モバイル幅の操作系）が
 * これと整合すると明記している。
 *
 * ただし要件28.3 の適用範囲は「概ね幅768px未満」であり、本テストのビューポートは
 * 768x1024 のためその範囲には入らない。すなわち本判定は要件28.3 が要求するより
 * 厳しい下限をタブレット幅へ適用しており、現時点で実際に満たされている。
 */
const TOUCH_TARGET_MIN_PX = 44;

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査レスポンシブ対応', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  // 注釈編集の検証で使う画像。fixtures/test-image.jpg は 1x1 px でキャンバスが潰れ、
  // 描画操作を行えないため、注釈用には広さのある画像を別途用意する
  let annotationImageId: string | null = null;

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

      const projectName = `レスポンシブテスト用プロジェクト_${Date.now()}`;
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

      const surveyName = `レスポンシブテスト用現場調査_${Date.now()}`;
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

      // 画像をアップロード（REQ-15.2, REQ-15.3のテストで必要）
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let fileInput = page.locator('input[type="file"]').first();
      const inputCount = await fileInput.count();
      if (inputCount === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        fileInput = page.locator('input[type="file"]').first();
      }

      await expect(fileInput).toBeAttached({ timeout: getTimeout(10000) });

      // テスト用画像ファイルをアップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      const uploadPromise = page.waitForResponse(
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
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 注釈編集（REQ-15.4, 15.5, 15.7-15.10）用に、描画できる広さの画像を追加する
      const annotationImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');
      expect(fs.existsSync(annotationImagePath)).toBeTruthy();

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      const annotationUploadResponse = await page.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            images: {
              name: 'test-image-large.jpg',
              mimeType: 'image/jpeg',
              buffer: fs.readFileSync(annotationImagePath),
            },
          },
        }
      );
      expect(annotationUploadResponse.ok()).toBeTruthy();

      const annotationUploadBody = (await annotationUploadResponse.json()) as {
        successful?: Array<{ id?: string }>;
      };
      annotationImageId = annotationUploadBody.successful?.[0]?.id ?? null;
      expect(annotationImageId).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // 自動保存・復元（REQ-15.4, 15.5, 15.7-15.10）用のヘルパー
  //
  // いずれの検証も「本番の描画経路（注釈エディタ）から到達すること」を条件にする。
  // 部品を直接組み立てて確かめる形にすると、結線の欠落を構造的に見逃すためである。
  // ---------------------------------------------------------------------------

  /** 自動保存が使う localStorage キーの接頭辞（AutoSaveManager と同一） */
  const ANNOTATION_DRAFT_PREFIX = 'architrack_annotation_';

  type PlaywrightPage = import('@playwright/test').Page;

  /**
   * 画像ビューア画面で編集モードへ入り、対象画像IDを返す
   */
  async function enterEditMode(page: PlaywrightPage): Promise<string> {
    const editModeButton = page.getByRole('button', { name: '編集モード' });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();

    await expect(page.locator('[data-testid="annotation-toolbar"]')).toBeVisible({
      timeout: getTimeout(15000),
    });

    const match = page.url().match(/\/images\/([0-9a-f-]+)/);
    const imageId = match?.[1];
    if (!imageId) {
      throw new Error(`画像IDをURLから取得できません: ${page.url()}`);
    }
    return imageId;
  }

  /**
   * 現場調査詳細から画像を開き、注釈エディタ（編集モード）まで到達して画像IDを返す
   */
  async function openAnnotationEditor(page: PlaywrightPage): Promise<string> {
    if (!createdSurveyId || !annotationImageId) {
      throw new Error(
        'createdSurveyId / annotationImageId が未設定です。事前準備テストが正しく実行されていません。'
      );
    }

    await page.goto(`/site-surveys/${createdSurveyId}/images/${annotationImageId}`);
    await page.waitForLoadState('networkidle');

    return enterEditMode(page);
  }

  /**
   * 注釈エディタのキャンバス中心座標を返す
   */
  async function getCanvasCenter(page: PlaywrightPage): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(15000) });

    await expect
      .poll(
        async () => {
          const box = await upperCanvas.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        },
        { timeout: getTimeout(15000) }
      )
      .toBeGreaterThan(10);

    const box = await upperCanvas.boundingBox();
    if (!box) {
      throw new Error('キャンバス要素の位置・サイズを取得できません');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * キャンバス上のオブジェクト数（背景画像を含む）を返す
   */
  async function getCanvasObjectCount(page: PlaywrightPage): Promise<number> {
    return page.evaluate(() => {
      const canvas = (
        window as unknown as { __fabricCanvas?: { getObjects: () => unknown[] } | null }
      ).__fabricCanvas;
      return canvas ? canvas.getObjects().length : -1;
    });
  }

  /**
   * 四角形ツールで注釈を1件描く（描画が成立したことを確認してから戻る）
   */
  async function drawRectangleAnnotation(page: PlaywrightPage): Promise<void> {
    const rectangleTool = page.locator('[data-tool="rectangle"]');
    await expect(rectangleTool).toBeVisible({ timeout: getTimeout(15000) });
    await rectangleTool.click();
    await expect(rectangleTool).toHaveAttribute('aria-pressed', 'true');

    const center = await getCanvasCenter(page);
    const before = await getCanvasObjectCount(page);
    expect(before).toBeGreaterThanOrEqual(0);

    // キャンバス内に収まる幅で描く（画像サイズに依存しないよう実寸から求める）
    const box = await page.locator('.upper-canvas').boundingBox();
    if (!box) {
      throw new Error('キャンバス要素の位置・サイズを取得できません');
    }
    const dx = Math.max(10, Math.floor(box.width * 0.2));
    const dy = Math.max(10, Math.floor(box.height * 0.2));

    await page.mouse.move(center.x - dx, center.y - dy);
    await page.mouse.down();
    await page.mouse.move(center.x + dx, center.y + dy, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(() => getCanvasObjectCount(page), { timeout: getTimeout(15000) })
      .toBeGreaterThan(before);
  }

  /**
   * localStorage 上の自動保存下書きキーの一覧を返す
   */
  async function readDraftKeys(page: PlaywrightPage): Promise<string[]> {
    return page.evaluate((prefix) => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    }, ANNOTATION_DRAFT_PREFIX);
  }

  /**
   * 指定キーの下書き本文を返す（未保存なら null）
   */
  async function readDraft(page: PlaywrightPage, key: string): Promise<string | null> {
    return page.evaluate((k) => localStorage.getItem(k), key);
  }

  /**
   * 自動保存下書きを全件削除する（検証の初期状態をそろえる）
   */
  async function clearDrafts(page: PlaywrightPage): Promise<void> {
    await page.evaluate((prefix) => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      keys.forEach((key) => localStorage.removeItem(key));
    }, ANNOTATION_DRAFT_PREFIX);
  }

  /**
   * LRU の削除対象となる古い下書きを積む
   */
  async function seedStaleDrafts(page: PlaywrightPage, count: number): Promise<string[]> {
    return page.evaluate(
      ({ prefix, total }) => {
        const keys: string[] = [];
        for (let i = 0; i < total; i++) {
          const key = `${prefix}stale-${i}`;
          localStorage.setItem(
            key,
            JSON.stringify({
              imageId: `stale-${i}`,
              surveyId: 'stale-survey',
              annotationData: { version: '1.0', objects: [] },
              savedAt: new Date(Date.UTC(2020, 0, i + 1)).toISOString(),
              serverUpdatedAt: null,
            })
          );
          keys.push(key);
        }
        return keys;
      },
      { prefix: ANNOTATION_DRAFT_PREFIX, total: count }
    );
  }

  /**
   * 自動保存の書き込みだけを失敗させる（ブラウザごとに形の異なるストレージ例外を注入する）
   *
   * @param name  例外の name（QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED 等）
   * @param code  例外の code（22 / 1014 等）
   * @param failTimes 失敗させる回数
   */
  async function injectStorageWriteFailure(
    page: PlaywrightPage,
    name: string,
    code: number,
    failTimes: number
  ): Promise<void> {
    await page.evaluate(
      ({ prefix, errorName, errorCode, limit }) => {
        const state = window as unknown as { __injectedStorageFailures?: number };
        state.__injectedStorageFailures = 0;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (key.startsWith(prefix) && (state.__injectedStorageFailures ?? 0) < limit) {
            state.__injectedStorageFailures = (state.__injectedStorageFailures ?? 0) + 1;
            const error = new Error(errorName) as Error & { code: number };
            error.name = errorName;
            error.code = errorCode;
            throw error;
          }
          original.call(this, key, value);
        };
      },
      { prefix: ANNOTATION_DRAFT_PREFIX, errorName: name, errorCode: code, limit: failTimes }
    );
  }

  /**
   * 注入した書き込み失敗の発生回数を返す
   */
  async function readInjectedFailureCount(page: PlaywrightPage): Promise<number> {
    return page.evaluate(
      () =>
        (window as unknown as { __injectedStorageFailures?: number }).__injectedStorageFailures ?? 0
    );
  }

  /**
   * プライベートブラウジングモードの localStorage 制限を再現する（REQ-15.9）
   *
   * 認証トークンまで書けなくすると画面へ到達できないため、自動保存が使うキーと
   * 利用可否の試験キーだけを SecurityError で拒否する。制限の検出と自動保存の
   * 無効化は本番実装（utils/storage-error → AutoSaveManager）が行う。
   */
  async function injectPrivateBrowsingRestriction(page: PlaywrightPage): Promise<void> {
    await page.addInitScript((prefix) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith(prefix) || key === '__storage_test__' || key === '__autosave_test__') {
          const error = new Error('SecurityError') as Error & { code: number };
          error.name = 'SecurityError';
          error.code = 18;
          throw error;
        }
        original.call(this, key, value);
      };
    }, ANNOTATION_DRAFT_PREFIX);
  }

  /**
   * @requirement site-survey/REQ-15.1
   */
  test.describe('画面サイズ対応', () => {
    test('デスクトップサイズで現場調査一覧が正しく表示される (site-survey/REQ-15.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズ（1920x1080）
      await page.setViewportSize({ width: 1920, height: 1080 });

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認（h1の「現場調査一覧」見出しをマッチ）
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // デスクトップでは横幅が広いレイアウトが表示される
      await expect(page.locator('body')).toBeVisible();
    });

    test('タブレットサイズで現場調査一覧が正しく表示される (site-survey/REQ-15.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // タブレットサイズ（768x1024）
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // タブレットでもUIが正しく表示される
      await expect(page.locator('body')).toBeVisible();
    });

    test('スマートフォンサイズで現場調査一覧が正しく表示される (site-survey/REQ-15.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // スマートフォンサイズ（375x667 - iPhone SE）
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // スマートフォンでもUIが正しく表示される
      await expect(page.locator('body')).toBeVisible();
    });

    test('スマートフォンサイズで現場調査詳細が正しく表示される (site-survey/REQ-15.1)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // スマートフォンサイズ
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 詳細が表示されることを確認
      await expect(
        page.getByRole('heading', { name: /レスポンシブテスト用現場調査/i })
      ).toBeVisible({
        timeout: getTimeout(10000),
      });

      // スマートフォンでも詳細情報が表示される
      await expect(page.locator('body')).toBeVisible();
    });
  });

  /**
   * @requirement site-survey/REQ-15.2
   */
  test.describe('タッチ操作対応', () => {
    test('タッチデバイスでは注釈ツールがタッチ操作に最適化される (site-survey/REQ-15.2)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // タブレットサイズに設定
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // タッチデバイスをエミュレート
      await page.evaluate(() => {
        // タッチイベントのサポートを追加
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
      });

      // 画像があればビューアを開く（PhotoManagementPanel内）
      const imageElement = page.locator('[data-testid="photo-image-button"]').first();
      const imageVisible = await imageElement.isVisible({ timeout: 3000 });

      // 画像が存在することを確認（第3原則: 前提条件でテストを除外してはならない）
      if (!imageVisible) {
        throw new Error(
          'REQ-15.2: 画像が見つかりません。タッチ操作テストには画像が必要です。前のテスト（画像アップロード）が正しく実行されていません。'
        );
      }

      await imageElement.click();
      await page.waitForLoadState('networkidle');

      // 編集モードボタン。観測結果で判定を包まず、無条件に到達を主張する。
      const editModeButton = page.getByRole('button', { name: /編集モード/i });
      await expect(editModeButton).toBeVisible({ timeout: getTimeout(5000) });
      await editModeButton.click();

      // 注釈ツールバーが表示されることを確認
      const toolbar = page.locator('[data-testid="annotation-toolbar"]');
      await expect(toolbar).toBeVisible({ timeout: getTimeout(10000) });

      const toolButtons = toolbar.locator('button');
      const buttonCount = await toolButtons.count();
      expect(buttonCount, 'REQ-15.2: 注釈ツールバーに操作ボタンが存在する').toBeGreaterThan(0);

      // 観測した寸法そのものを主張する。
      // 従来は `幅>=32 || 高さ>=32` を条件分岐の中で判定しており、
      // 一辺だけが基準を満たす細長い当たり判定も緑になっていた。
      const box = await toolButtons.first().boundingBox();
      expect(box, 'REQ-15.2: ツールボタンの当たり判定が取得できる').not.toBeNull();
      expect(box!.width, 'REQ-15.2: ツールボタンの幅がタッチ標準を満たす').toBeGreaterThanOrEqual(
        TOUCH_TARGET_MIN_PX
      );
      expect(
        box!.height,
        'REQ-15.2: ツールボタンの高さがタッチ標準を満たす'
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX);

      // ページが正しく表示されていることを確認
      await expect(page.locator('body')).toBeVisible();
    });
  });

  /**
   * @requirement site-survey/REQ-15.3
   */
  test.describe('カメラ連携', () => {
    test('モバイル環境でカメラ撮影ボタンが表示される (site-survey/REQ-15.3)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // スマートフォンサイズに設定
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // カメラ撮影ボタンを探す（複数要素がある場合はdata-testidで特定）
      const cameraButton = page.getByTestId('camera-button');
      const cameraInput = page.locator('input[accept*="image"][capture]');

      const hasCameraButton = await cameraButton.isVisible({ timeout: getTimeout(3000) });
      const cameraInputCount = await cameraInput.count();
      const hasCameraInput = cameraInputCount > 0;

      // 二つの実現手段のいずれかで満たされる要件のため論理和は本質的である。
      // ただし観測は握り潰さず、いずれも無ければ落ちる。
      expect(
        hasCameraButton || hasCameraInput,
        `REQ-15.3: カメラ起動の手段が存在する（ボタン=${hasCameraButton} / capture付き入力=${cameraInputCount}件）`
      ).toBe(true);
    });
  });

  /**
   * @requirement site-survey/REQ-15.4
   */
  test.describe('自動保存', () => {
    test('注釈編集中に一定間隔（30秒）で未保存状態がlocalStorageへ自動保存される (site-survey/REQ-15.4)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;
      await clearDrafts(page);

      await drawRectangleAnnotation(page);

      // 即時保存ではないこと（一定間隔での自動保存であること）
      await page.waitForTimeout(5000);
      expect(await readDraft(page, draftKey)).toBeNull();

      // 30秒間隔の自動保存が発火し、未保存の編集状態が localStorage へ書き出される
      await expect
        .poll(() => readDraft(page, draftKey), { timeout: 60_000, intervals: [2000] })
        .not.toBeNull();

      const stored = await readDraft(page, draftKey);
      const draft = JSON.parse(stored as string) as {
        imageId: string;
        surveyId: string;
        savedAt: string;
        annotationData: { objects: unknown[]; canvasWidth: number; canvasHeight: number };
      };
      expect(draft.imageId).toBe(imageId);
      expect(draft.surveyId).toBe(createdSurveyId);
      expect(draft.annotationData.objects.length).toBeGreaterThan(0);
      expect(draft.annotationData.canvasWidth).toBeGreaterThan(0);
      expect(draft.annotationData.canvasHeight).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(draft.savedAt))).toBe(false);
    });
  });

  /**
   * @requirement site-survey/REQ-15.5
   */
  test.describe('編集状態の復元', () => {
    test('リロード後に未保存の編集状態をlocalStorageから復元できる (site-survey/REQ-15.5)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;
      await clearDrafts(page);

      // サーバーへは保存せず、自動保存だけが走った状態を作る
      await drawRectangleAnnotation(page);
      await expect
        .poll(() => readDraft(page, draftKey), { timeout: 60_000, intervals: [2000] })
        .not.toBeNull();

      const draftedObjectCount = await getCanvasObjectCount(page);

      // リロード（再訪問）する。サーバーには注釈が保存されていないため、
      // 復元しなければキャンバスは描画前の状態に戻る
      await page.reload();
      await page.waitForLoadState('networkidle');
      await enterEditMode(page);

      const afterReloadCount = await getCanvasObjectCount(page);
      expect(afterReloadCount).toBeLessThan(draftedObjectCount);

      // 未保存データの復元確認が本番の描画経路から表示される
      const restoreDialog = page.getByRole('dialog');
      await expect(restoreDialog).toBeVisible({ timeout: getTimeout(20000) });
      await expect(restoreDialog).toContainText('未保存のデータがあります');

      await restoreDialog.getByRole('button', { name: '復元する' }).click();
      await expect(restoreDialog).toBeHidden({ timeout: getTimeout(15000) });

      // 復元により、リロード直後より注釈が増えて自動保存時点の状態へ戻る
      await expect
        .poll(() => getCanvasObjectCount(page), { timeout: getTimeout(20000) })
        .toBe(draftedObjectCount);
    });

    test('復元確認で「破棄する」を選ぶと下書きが消える (site-survey/REQ-15.5)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;
      await clearDrafts(page);

      await drawRectangleAnnotation(page);
      await expect
        .poll(() => readDraft(page, draftKey), { timeout: 60_000, intervals: [2000] })
        .not.toBeNull();

      await page.reload();
      await page.waitForLoadState('networkidle');
      await enterEditMode(page);

      const restoreDialog = page.getByRole('dialog');
      await expect(restoreDialog).toBeVisible({ timeout: getTimeout(20000) });
      await restoreDialog.getByRole('button', { name: '破棄する' }).click();
      await expect(restoreDialog).toBeHidden({ timeout: getTimeout(15000) });

      expect(await readDraft(page, draftKey)).toBeNull();
    });
  });

  /**
   * @requirement site-survey/REQ-15.6
   */
  test.describe('ネットワーク状態', () => {
    test('オフライン時に警告が表示される (site-survey/REQ-15.6)', async ({ page, context }) => {
      // 要件15.6 の通信断の告知は現場調査の配下に未実装である（タスク 115.105 が所管）。
      // 前提条件による自動無効化ではなく、本体は毎回すべて実行される。
      // 115.105 が実装すると本テストは通り、この注釈により「落ちるはずが通った」として
      // 赤くなるため、注釈の撤去を強制するラチェットとして機能する。
      // 直列実行のため、ここで素の失敗を残すと後続の受入検証11件と後片付けが実行されなくなる。
      test.fail();

      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // オフラインモードをシミュレート
      await context.setOffline(true);

      // オフライン警告が表示されるまで待機
      const offlineWarning = page.locator(
        '[data-testid="offline-warning"], .offline-indicator, [role="alert"]'
      );
      const offlineText = page.getByText(/オフライン|接続.*切断|ネットワーク.*エラー|offline/i);

      // 通信断の告知はいずれかの表現で現れれば足りるため論理和は本質的である。
      // 固定時間待機ではなく、いずれかが現れることを条件として待つ。
      const offlineNotice = offlineWarning.or(offlineText).first();
      let noticeError: unknown = null;
      try {
        await expect(offlineNotice).toBeVisible({ timeout: getTimeout(10000) });
      } catch (error) {
        noticeError = error;
      } finally {
        // 主張の成否によらずオンラインへ戻し、後続テストへ状態を持ち越さない
        await context.setOffline(false);
      }

      // 観測した結果そのものを主張する。
      // 従来は `|| true` を論理和しており、告知が皆無でも恒久的に緑だった。
      expect(noticeError, 'REQ-15.6: 通信が切れた際に告知が表示される').toBeNull();
    });

    test('オフライン時に保存操作がブロックされる (site-survey/REQ-15.6)', async ({
      page,
      context,
    }) => {
      // 要件15.6 の保存抑止は現場調査の配下に未実装である（タスク 115.105 が所管）。
      // 上のテストと同じ理由で落ちるはずの検証として明示する。本体は毎回すべて実行される。
      test.fail();

      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // オフラインモードをシミュレート
      await context.setOffline(true);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存|更新/i });
      let blockError: unknown = null;
      try {
        // 保存操作の手段があること自体を無条件に主張する
        await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
        await saveButton.click();

        // 保存が抑止された旨が示されることを条件として待つ
        const errorMessage = page.getByText(/保存.*失敗|エラー|オフライン|接続/i);
        await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });
      } catch (error) {
        blockError = error;
      } finally {
        await context.setOffline(false);
      }

      // 観測した結果そのものを主張する。
      // 従来は `|| true` を論理和し、さらに保存ボタンが無い場合は判定ごと素通りしていた。
      expect(blockError, 'REQ-15.6: 通信が切れた状態では保存が抑止され告知される').toBeNull();

      await expect(page.locator('body')).toBeVisible();
    });
  });

  /**
   * @requirement site-survey/REQ-15.7
   * @requirement site-survey/REQ-15.8
   * @requirement site-survey/REQ-15.10
   */
  test.describe('localStorageエラーハンドリング', () => {
    test('QuotaExceededError発生時はLRUで古いキャッシュを削除してリトライし保存が成立する (site-survey/REQ-15.7)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;
      await clearDrafts(page);

      const staleKeys = await seedStaleDrafts(page, 3);
      expect(staleKeys.length).toBe(3);

      // Chrome / Safari / Edge 形式（code===22, name===QuotaExceededError）を1回だけ注入する
      await injectStorageWriteFailure(page, 'QuotaExceededError', 22, 1);

      await drawRectangleAnnotation(page);

      await expect
        .poll(() => readDraft(page, draftKey), { timeout: 60_000, intervals: [2000] })
        .not.toBeNull();

      // 1回失敗し、LRU で古いキャッシュを削除したうえでリトライして保存できている
      expect(await readInjectedFailureCount(page)).toBe(1);
      const remainingKeys = await readDraftKeys(page);
      for (const staleKey of staleKeys) {
        expect(remainingKeys).not.toContain(staleKey);
      }
      expect(remainingKeys).toContain(draftKey);

      // リトライで保存できたので警告帯は出ない
      await expect(page.locator('[data-warning-type="quota-exceeded"]')).toHaveCount(0);
    });

    test('リトライ後も保存に失敗すると警告を表示し「今すぐ保存」を促す (site-survey/REQ-15.8)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      await openAnnotationEditor(page);
      await clearDrafts(page);

      // 何度リトライしても書き込めない状態にする
      await injectStorageWriteFailure(page, 'QuotaExceededError', 22, 1_000_000);

      await drawRectangleAnnotation(page);

      const warningBanner = page.locator('[data-warning-type="quota-exceeded"]');
      await expect(warningBanner).toBeVisible({ timeout: 60_000 });
      await expect(warningBanner).toContainText('自動保存に失敗しました');

      const saveNowButton = warningBanner.getByRole('button', { name: '今すぐ保存' });
      await expect(saveNowButton).toBeVisible();

      // 「今すぐ保存」からサーバー保存へ到達する
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/annotations') &&
          response.request().method() === 'PUT' &&
          response.ok(),
        { timeout: getTimeout(30000) }
      );
      await saveNowButton.click();
      await savePromise;

      // 手動保存が成立したので警告帯は役目を終える
      await expect(warningBanner).toBeHidden({ timeout: getTimeout(30000) });
    });

    test('Firefox形式のエラー（code===1014 / NS_ERROR_DOM_QUOTA_REACHED）も容量超過として扱う (site-survey/REQ-15.10)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;
      await clearDrafts(page);

      const staleKeys = await seedStaleDrafts(page, 3);
      await injectStorageWriteFailure(page, 'NS_ERROR_DOM_QUOTA_REACHED', 1014, 1);

      await drawRectangleAnnotation(page);

      await expect
        .poll(() => readDraft(page, draftKey), { timeout: 60_000, intervals: [2000] })
        .not.toBeNull();

      // name が QuotaExceededError でなくても容量超過として検出され、LRU リトライへ入る
      expect(await readInjectedFailureCount(page)).toBe(1);
      const remainingKeys = await readDraftKeys(page);
      for (const staleKey of staleKeys) {
        expect(remainingKeys).not.toContain(staleKey);
      }
    });

    test('Firefox形式のエラーでリトライ後も失敗すると警告を表示する (site-survey/REQ-15.10)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      await loginAsUser(page, 'REGULAR_USER');

      await openAnnotationEditor(page);
      await clearDrafts(page);

      await injectStorageWriteFailure(page, 'NS_ERROR_DOM_QUOTA_REACHED', 1014, 1_000_000);

      await drawRectangleAnnotation(page);

      const warningBanner = page.locator('[data-warning-type="quota-exceeded"]');
      await expect(warningBanner).toBeVisible({ timeout: 60_000 });
      await expect(warningBanner).toContainText('自動保存に失敗しました');
    });
  });

  /**
   * @requirement site-survey/REQ-15.9
   */
  test.describe('プライベートブラウジングモード対応', () => {
    test('SecurityErrorを検出すると自動保存を無効化し手動保存のみで動作する (site-survey/REQ-15.9)', async ({
      page,
    }) => {
      test.setTimeout(180_000);

      // 画面到達より前に制限を仕込む（自動保存基盤は生成時に利用可否を判定する）
      await injectPrivateBrowsingRestriction(page);

      await loginAsUser(page, 'REGULAR_USER');

      const imageId = await openAnnotationEditor(page);
      const draftKey = `${ANNOTATION_DRAFT_PREFIX}${imageId}`;

      // 自動保存が無効であることを利用者へ伝える警告帯が本番の描画経路から表示される
      const warningBanner = page.locator('[data-warning-type="private-browsing"]');
      await expect(warningBanner).toBeVisible({ timeout: getTimeout(20000) });
      await expect(warningBanner).toContainText('自動保存が無効です');

      await drawRectangleAnnotation(page);

      // 自動保存の間隔（30秒）を十分に超えても下書きは書き出されない
      await page.waitForTimeout(45_000);
      expect(await readDraft(page, draftKey)).toBeNull();

      // 手動保存は従来どおり利用できる
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/annotations') &&
          response.request().method() === 'PUT' &&
          response.ok(),
        { timeout: getTimeout(30000) }
      );
      await page.locator('[data-testid="annotation-toolbar"]').getByLabel('保存').click();
      await savePromise;
    });
  });

  /**
   * Requirement 35: 現場調査詳細画面のスマートフォン表示最適化
   * （Requirement 10 の写真一覧管理: 未保存状態管理・一括保存・離脱警告の挙動維持を含む）
   * @requirement site-survey/REQ-35.1
   * @requirement site-survey/REQ-35.2
   * @requirement site-survey/REQ-35.3
   * @requirement site-survey/REQ-35.4
   * @requirement site-survey/REQ-35.5
   * @requirement site-survey/REQ-35.6
   * @requirement site-survey/REQ-35.7
   */
  test.describe('現場調査詳細のスマホ表示・機能回帰', () => {
    const MOBILE = { width: 375, height: 667 } as const;
    const DESKTOP = { width: 1920, height: 1080 } as const;

    test('モバイル幅で詳細画面が横あふれせず写真が縦積み・可変幅で表示される (site-survey/REQ-35.1) (site-survey/REQ-35.2) (site-survey/REQ-35.3)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.setViewportSize(MOBILE);

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const panelItem = page.locator('[data-testid="photo-panel-item"]').first();
      await expect(panelItem).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-35.1: 写真アイテムが縦積み（flex-direction: column）で表示される
      const flexDirection = await panelItem.evaluate((el) => getComputedStyle(el).flexDirection);
      expect(flexDirection).toBe('column');

      // REQ-35.3: 写真セクションが固定320px列ではなくコンテナ幅に追従し、画面幅に収まる
      const sizes = await panelItem.evaluate((el) => {
        const imageSection = el.querySelector('[data-testid="photo-image-button"]')
          ?.parentElement as HTMLElement | null;
        const cs = getComputedStyle(el);
        const contentWidth =
          el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return {
          imageWidth: imageSection ? imageSection.getBoundingClientRect().width : 0,
          contentWidth,
        };
      });
      expect(sizes.imageWidth).toBeGreaterThan(0);
      // 画面幅に収まる（見切れ・はみ出し無し）
      expect(sizes.imageWidth).toBeLessThanOrEqual(MOBILE.width);
      // 固定320pxではなくコンテナ幅に追従する（差はごくわずか）
      expect(Math.abs(sizes.imageWidth - sizes.contentWidth)).toBeLessThanOrEqual(12);

      // REQ-35.2: ページ全体で水平スクロール（はみ出し）が発生しない
      const overflow = await page.evaluate(() => {
        const innerWidth = window.innerWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const offenders: { tag: string; testid: string; cls: string; right: number; w: number }[] =
          [];
        document.querySelectorAll('*').forEach((node) => {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          if (rect.right > innerWidth + 1) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              testid: el.getAttribute('data-testid') ?? '',
              cls: (el.className || '').toString().slice(0, 40),
              right: Math.round(rect.right),
              w: Math.round(rect.width),
            });
          }
        });
        offenders.sort((a, b) => b.right - a.right);
        return { innerWidth, scrollWidth, offenders: offenders.slice(0, 8) };
      });
      expect(
        overflow.scrollWidth <= overflow.innerWidth,
        `水平スクロールが発生: scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth} offenders=${JSON.stringify(overflow.offenders)}`
      ).toBe(true);
    });

    test('モバイル幅でコメント入力欄のフォントサイズが16px以上である (site-survey/REQ-35.4)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.setViewportSize(MOBILE);

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const textarea = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .getByPlaceholder('コメントを入力...');
      await expect(textarea).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-35.4: フォーカス時の自動ズームを回避するため computed font-size が16px以上
      const fontSize = await textarea.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
    });

    test('モバイル幅で操作系コントロールのタップ領域が44px以上である (site-survey/REQ-35.5)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 削除ボタンは削除権限（canDelete = isAdmin）を持つユーザーのみに描画されるため、
      // 全ての操作系コントロール（チェックボックス・並び替え・削除）を確実に評価できる
      // ADMIN_USER でログインする（REGULAR_USER では削除ボタンが描画されない）
      await loginAsUser(page, 'ADMIN_USER');
      await page.setViewportSize(MOBILE);

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const panelItem = page.locator('[data-testid="photo-panel-item"]').first();
      await expect(panelItem).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-35.5: 各操作要素のタップ領域が最小44x44論理ピクセル以上
      const assertTapTarget = async (locator: Locator, name: string): Promise<void> => {
        const box = await locator.boundingBox();
        expect(box, `${name}のboundingBoxが取得できること`).not.toBeNull();
        expect(box!.width, `${name}の幅が44px以上であること`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${name}の高さが44px以上であること`).toBeGreaterThanOrEqual(44);
      };

      await assertTapTarget(
        panelItem.getByLabel('報告書に含める'),
        '報告書出力フラグのチェックボックス'
      );
      await assertTapTarget(panelItem.getByRole('button', { name: '上へ移動' }), '上へ移動ボタン');
      await assertTapTarget(panelItem.getByRole('button', { name: '下へ移動' }), '下へ移動ボタン');
      await assertTapTarget(panelItem.getByRole('button', { name: /画像を削除:/ }), '削除ボタン');
    });

    test('モバイル幅でコメント編集→未保存表示→一括保存→永続化と離脱警告が維持される (site-survey/REQ-35.6)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.setViewportSize(MOBILE);

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const panelItem = page.locator('[data-testid="photo-panel-item"]').first();
      await expect(panelItem).toBeVisible({ timeout: getTimeout(10000) });

      // 未保存変更が無い状態では離脱警告（beforeunload の既定動作抑止）が発火しない
      const warnBeforeEdit = await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(warnBeforeEdit).toBe(false);

      // コメント編集（blur で未保存状態を即時確定）
      const uniqueComment = `モバイル回帰コメント_${Date.now()}`;
      const textarea = panelItem.getByPlaceholder('コメントを入力...');
      await textarea.click();
      await textarea.fill(uniqueComment);
      await textarea.blur();

      // REQ-10.4: 入力により未保存状態になり、未保存インジケーターが表示される
      await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(5000) });

      // REQ-10.10: 未保存変更がある間はページ離脱で警告（beforeunload が既定動作を抑止）
      const warnWhileDirty = await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(warnWhileDirty).toBe(true);

      // REQ-10.9: 一括保存（PATCH /api/site-surveys/images/batch）
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/images/batch') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );
      const saveButton = page.getByRole('button', { name: /^保存$/ });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      const saveResponse = await savePromise;
      expect([200, 204]).toContain(saveResponse.status());

      // 保存完了後は未保存インジケーターが消える
      await expect(page.getByTestId('dirty-indicator')).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 保存後は離脱警告が解除される
      const warnAfterSave = await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(warnAfterSave).toBe(false);

      // リロード後も入力値が永続化されている
      await page.reload();
      await page.waitForLoadState('networkidle');
      const reloadedTextarea = page
        .locator('[data-testid="photo-panel-item"]')
        .first()
        .getByPlaceholder('コメントを入力...');
      await expect(reloadedTextarea).toHaveValue(uniqueComment, { timeout: getTimeout(10000) });
    });

    test('デスクトップ幅では詳細画面の横並びレイアウトが維持される (site-survey/REQ-35.7)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.setViewportSize(DESKTOP);

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const panelItem = page.locator('[data-testid="photo-panel-item"]').first();
      await expect(panelItem).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-35.7: デスクトップ幅では従来どおり横並び（flex-direction: row）を維持
      const flexDirection = await panelItem.evaluate((el) => getComputedStyle(el).flexDirection);
      expect(flexDirection).toBe('row');

      // デスクトップ幅でも水平スクロール（はみ出し）は発生しない
      const noHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      expect(noHorizontalOverflow).toBe(true);
    });
  });

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
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        const confirmButton = page.getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
      }

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
});
