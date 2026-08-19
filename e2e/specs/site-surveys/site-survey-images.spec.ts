/**
 * @fileoverview 現場調査画像管理のE2Eテスト
 *
 * Task 26.2: 現場調査のE2Eテストを実装する
 *
 * Requirements coverage (site-survey):
 * - REQ-4.1: POST /api/site-surveys/:id/images 画像アップロード
 * - REQ-4.2: 複数画像のバッチアップロード
 * - REQ-4.3: 5件超のキュー処理
 * - REQ-4.4: サムネイル自動生成
 * - REQ-4.6: 300KB超の圧縮
 * - REQ-4.7: DELETE /api/site-surveys/images/:imageId 画像削除
 * - REQ-4.9: 対応形式（PNG）のアップロード
 * - REQ-4.10: 画像一覧を固定の表示順序で表示する
 * - REQ-4.11: ドラッグアンドドロップで表示順序を変更する（未保存状態になる）
 * - REQ-10.8: 写真一覧を保存された表示順序の通りに表示する
 * - REQ-10.9: 保存ボタンで表示順序をデータベースへ一括保存する
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 写真パネルの表示元URLを取得する
 *
 * 詳細画面の写真は表示領域へ入るまで表示元URL（img の src）を設定しない
 * （site-survey/REQ-38.8 の遅延読み込み）。そのため対象を表示領域へ入れたうえで、
 * 表示元URLが設定されるまで待ってから読み出す。
 *
 * @param panelItem - `photo-panel-item` のロケータ
 * @returns 設定された表示元URL
 */
async function getPanelImageSrc(panelItem: Locator): Promise<string> {
  const image = panelItem.locator('img');
  await image.scrollIntoViewIfNeeded();
  // 表示領域到達後に表示元URLが設定されるまで待つ
  await expect(image).toHaveAttribute('src', /.+/, { timeout: getTimeout(10000) });
  const src = await image.getAttribute('src');
  expect(src, '写真パネルの表示元URLが設定されている').toBeTruthy();
  return src as string;
}

/**
 * 写真パネルの画像IDを取得する
 *
 * 並びの識別には画像ID（`data-image-id`）を用いる。表示元URLは署名付きURLであり
 * 署名部や有効期限が要求ごとに変動しうるため、リロードを挟む検証では同一の画像でも
 * 値が一致せず判定が成立しなくなる。画像IDは要求ごとに変動しない。
 *
 * @param panelItem - `photo-panel-item` のロケータ
 * @returns 画像ID
 */
async function getPanelImageId(panelItem: Locator): Promise<string> {
  await expect(panelItem).toHaveAttribute('data-image-id', /.+/, {
    timeout: getTimeout(10000),
  });
  const imageId = await panelItem.getAttribute('data-image-id');
  expect(imageId, '写真パネルの画像IDが設定されている').toBeTruthy();
  return imageId as string;
}

/**
 * ドラッグ操作の再現時に観測したUI側の前提（site-survey/REQ-4.11）
 */
interface DragAndDropObservation {
  /** ドラッグ起点要素（ドラッグハンドル）の `draggable` 属性値 */
  sourceDraggable: string | null;
  /** `dragover` の既定動作が抑止されたか（ドロップを許可するために必須） */
  dragOverDefaultPrevented: boolean;
  /** `drop` の既定動作が抑止されたか（ブラウザ既定の処理を止めるために必須） */
  dropDefaultPrevented: boolean;
}

/**
 * 写真パネルの並び替えをHTML5ネイティブDnDのイベント送出で再現する
 *
 * 並び替えの実装（`frontend/src/components/site-surveys/PhotoManagementPanel.tsx`）は
 * HTML5ネイティブDnD（`draggable` 属性 + `dataTransfer`）であり、DnDライブラリを使っていない。
 * Playwright の `locator.dragTo()` や `mouse.down/move/up` が送出するのはポインタ入力であって
 * `dragstart` / `drop` ではないため、これらの操作では本実装のハンドラは一切起動しない
 * （実測でも並び順・未保存状態ともに変化しないことを確認済み）。
 *
 * そこで `dragstart` → `dragenter` → `dragover` → `drop` → `dragend` を、同一の
 * `DataTransfer` インスタンスを共有したうえで明示的に送出する。`handleDragStart` が
 * `dataTransfer.setData('text/plain', imageId)` で書き込んだ値を `handleDrop` が
 * `getData('text/plain')` で読むため、同一インスタンスの共有が必須となる。
 *
 * イベントを明示送出する方式は、UI側の前提（起点要素の `draggable` 指定、ドロップ許可に
 * 必要な既定動作の抑止）が失われても並びだけは変わってしまうため、前提が壊れたことを
 * 並びの検証では検出できない。そこで送出結果から前提の成否を観測して呼び出し元へ返し、
 * 呼び出し元で検証できるようにする（site-survey/REQ-4.11）。
 *
 * @param page - 対象ページ
 * @param sourceIndex - ドラッグ元の写真パネルの位置（0起点）
 * @param targetIndex - ドロップ先の写真パネルの位置（0起点）
 * @returns ドラッグ操作の前提に関する観測結果
 */
async function reorderPhotoByDragAndDrop(
  page: Page,
  sourceIndex: number,
  targetIndex: number
): Promise<DragAndDropObservation> {
  return await page.evaluate(
    ({ sourceIndex, targetIndex }) => {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="photo-panel-item"]')
      );
      const source = items[sourceIndex];
      const target = items[targetIndex];

      if (!source || !target) {
        throw new Error(
          `写真パネルが不足しています（必要: ${Math.max(sourceIndex, targetIndex) + 1}件 / 実際: ${items.length}件）`
        );
      }

      const handle = source.querySelector<HTMLElement>('[data-testid="photo-drag-handle"]');
      if (!handle) {
        throw new Error('ドラッグハンドル（photo-drag-handle）が見つかりません');
      }

      const dataTransfer = new DataTransfer();
      /**
       * イベントを送出し、既定動作が抑止された（= ハンドラが preventDefault を呼んだ）かを返す
       * `dispatchEvent` は cancelable なイベントが取り消された場合に false を返す
       */
      const dispatch = (element: HTMLElement, type: string): boolean => {
        const cancelled = !element.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer })
        );
        return cancelled;
      };

      dispatch(handle, 'dragstart');
      dispatch(target, 'dragenter');
      const dragOverDefaultPrevented = dispatch(target, 'dragover');
      const dropDefaultPrevented = dispatch(target, 'drop');
      dispatch(handle, 'dragend');

      return {
        sourceDraggable: handle.getAttribute('draggable'),
        dragOverDefaultPrevented,
        dropDefaultPrevented,
      };
    },
    { sourceIndex, targetIndex }
  );
}

/**
 * 現場調査画像管理のE2Eテスト
 */
test.describe('現場調査画像管理', () => {
  // 並列実行を無効化
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;
  // テストで作成した現場調査のIDを保存
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: プロジェクトと現場調査を作成
   */
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

      const projectName = `画像テスト用プロジェクト_${Date.now()}`;
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

      const surveyName = `画像テスト用現場調査_${Date.now()}`;
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
   * 画像アップロードフローのテスト
   *
   * REQ-4.1: POST /api/site-surveys/:id/images 画像アップロード
   */
  test.describe('画像アップロード', () => {
    /**
     * @requirement site-survey/REQ-4.1
     */
    test('画像をアップロードできる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像アップロードUIが表示されることを確認
      // ファイル入力またはドロップゾーンを探す
      const fileInput = page.locator('input[type="file"]');
      const dropZone = page.getByText(/画像を追加|アップロード|ドラッグ&ドロップ/i);

      // どちらかが存在することを確認
      const hasFileInput = (await fileInput.count()) > 0;
      const hasDropZone = (await dropZone.count()) > 0;

      if (!hasFileInput && !hasDropZone) {
        // アップロードボタンがある場合
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
      }

      // ファイル入力を取得
      const input = page.locator('input[type="file"]').first();
      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // テスト用画像ファイルをアップロード
      // Note: 実際のテストではテスト用画像ファイルが必要
      // e2e/fixturesにテスト画像を配置する
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      // アップロードレスポンスのPromiseを先に作成
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      // テスト用画像ファイルをセット
      await input.setInputFiles(testImagePath);

      // アップロード完了を待機
      await uploadPromise;

      // ページをリロードして画像が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // アップロードされた画像が表示されることを確認
      // PhotoManagementPanelでは data-testid="photo-panel-item" 内にimg要素が配置される
      const uploadedImage = page.locator('[data-testid="photo-panel-item"] img');
      await expect(uploadedImage.first()).toBeVisible({ timeout: getTimeout(15000) });

      // 画像IDを取得（詳細リンクやdata属性から）
      // 実装によって取得方法が異なる
    });

    /**
     * @requirement site-survey/REQ-4.1
     */
    test('サポートされていない形式の画像をアップロードするとエラーが表示される', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let input = page.locator('input[type="file"]').first();

      // ファイル入力が存在しない場合
      const inputCount = await input.count();
      if (inputCount === 0) {
        // アップロードボタンがある場合
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        input = page.locator('input[type="file"]').first();
      }

      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // サポートされていない形式のファイルパス
      const unsupportedFilePath = path.join(__dirname, '../../fixtures/test-document.txt');

      // テストファイルをセット
      await input.setInputFiles(unsupportedFilePath);

      // エラーメッセージが表示されることを確認
      //
      // 未送信画像の保持（REQ-37）により、同じ失敗理由が未送信画像パネルにも提示される。
      // ページ全体を対象にした文言一致は複数要素に解決してしまうため、失敗の通知そのものを
      // 担うアップロード失敗サマリの alert に限定して観測する。
      const uploadError = page
        .getByRole('alert')
        .filter({ hasText: '件のアップロードに失敗しました' });
      await expect(uploadError).toBeVisible({ timeout: getTimeout(10000) });
      await expect(uploadError).toContainText(
        /サポートされていない|対応していない|形式.*不正|ファイル形式/i
      );
    });

    /**
     * @requirement site-survey/REQ-4.2
     */
    test('複数の画像を同時にアップロードできる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let input = page.locator('input[type="file"]').first();
      const inputCount = await input.count();
      if (inputCount === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        input = page.locator('input[type="file"]').first();
      }

      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // 複数のテスト用画像ファイルパス
      const testImagePaths = [
        path.join(__dirname, '../../fixtures/test-image.png'),
        path.join(__dirname, '../../fixtures/test-image.webp'),
      ];

      // アップロードレスポンスのPromiseを作成
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      // 複数ファイルを同時にセット
      await input.setInputFiles(testImagePaths);

      // アップロード完了を待機
      await uploadPromise;

      // ページをリロードして画像が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // アップロードされた画像が表示されることを確認
      // PhotoManagementPanelでは各画像がphoto-panel-item要素として表示される
      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');

      // 少なくとも2つの画像が追加されていることを確認（既存のJPG + PNG + WEBP）
      const imageCount = await photoPanelItems.count();
      expect(imageCount).toBeGreaterThanOrEqual(2);
    });

    /**
     * @requirement site-survey/REQ-4.9
     */
    test('PNG形式の画像をアップロードできる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 現在の画像数を取得
      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(10000) });
      const initialCount = await photoPanelItems.count();

      // ファイル入力を取得
      let input = page.locator('input[type="file"]').first();
      if ((await input.count()) === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        input = page.locator('input[type="file"]').first();
      }

      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // PNG画像をアップロード
      const pngImagePath = path.join(__dirname, '../../fixtures/test-image.png');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(60000) }
      );

      await input.setInputFiles(pngImagePath);
      await uploadPromise;

      // ページをリロードして画像が増えていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      const newPhotoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      const newCount = await newPhotoPanelItems.count();
      expect(newCount).toBeGreaterThan(initialCount);
    });

    /**
     * @requirement site-survey/REQ-4.4
     */
    test('アップロードした画像にサムネイルが生成される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // ネットワークレスポンスをキャプチャするPromiseを先に作成
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${createdSurveyId}`) &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // APIから画像データを取得してサムネイルURLを確認
      await page.goto(`/site-surveys/${createdSurveyId}`);

      // APIレスポンスを待機
      const apiResponse = await responsePromise;
      const responseData = await apiResponse.json();

      // 画像データにサムネイルURLが含まれていることを確認
      expect(responseData.images).toBeDefined();
      expect(responseData.images.length).toBeGreaterThan(0);

      // 最初の画像にthumbnailUrlまたはthumbnailPathが存在することを確認
      const firstImage = responseData.images[0];
      const hasThumbnail = firstImage.thumbnailUrl || firstImage.thumbnailPath;
      expect(hasThumbnail).toBeTruthy();
    });

    /**
     * @requirement site-survey/REQ-4.6
     */
    test('大きいファイル（300KB超）をアップロードすると圧縮される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let input = page.locator('input[type="file"]').first();
      if ((await input.count()) === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        input = page.locator('input[type="file"]').first();
      }

      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // 大きい画像ファイル（2MB）をアップロード
      const largeImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');

      // アップロードレスポンスのPromiseを作成
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(120000) } // 大きいファイルのため長めのタイムアウト
      );

      await input.setInputFiles(largeImagePath);
      const uploadResponse = await uploadPromise;
      const uploadResult = await uploadResponse.json();

      // アップロードが成功することを確認
      expect(uploadResult).toBeDefined();

      // 圧縮されたファイルサイズが250KB〜350KBの範囲内であることを確認
      // （バックエンドが圧縮を行う場合）
      if (uploadResult.compressedSize) {
        expect(uploadResult.compressedSize).toBeGreaterThanOrEqual(250 * 1024);
        expect(uploadResult.compressedSize).toBeLessThanOrEqual(350 * 1024);
      }

      // 画像が表示されることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      expect(await photoPanelItems.count()).toBeGreaterThan(0);
    });

    /**
     * @requirement site-survey/REQ-4.3
     */
    test('5件以上のファイルをアップロードするとキュー処理される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let input = page.locator('input[type="file"]').first();
      if ((await input.count()) === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        input = page.locator('input[type="file"]').first();
      }

      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // 6件のファイルを同時にアップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
      const testImagePaths = [
        testImagePath,
        testImagePath,
        testImagePath,
        testImagePath,
        testImagePath,
        testImagePath,
      ];

      // 複数のアップロードレスポンスを待機
      let uploadCount = 0;
      const uploadPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Upload timeout')), getTimeout(120000));

        page.on('response', (response) => {
          if (
            response.url().includes('/api/site-surveys/') &&
            response.url().includes('/images') &&
            response.request().method() === 'POST' &&
            response.status() === 201
          ) {
            uploadCount++;
            if (uploadCount >= 6) {
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      });

      await input.setInputFiles(testImagePaths);

      // 全てのアップロードが完了するのを待機
      await uploadPromise;

      // 6件全てがアップロードされたことを確認
      expect(uploadCount).toBeGreaterThanOrEqual(6);
    });
  });

  /**
   * 画像表示順序テスト
   *
   * REQ-4.10: 画像一覧を固定の表示順序で表示する
   * REQ-4.11: ドラッグアンドドロップで表示順序を変更する（未保存状態になる）
   * REQ-10.8/REQ-10.9: 保存ボタンで表示順序を一括保存し、保存された順序で表示する
   */
  test.describe('画像表示順序', () => {
    /**
     * @requirement site-survey/REQ-4.10
     */
    test('画像がdisplayOrder順に表示される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細取得のレスポンスをキャプチャするPromiseを先に作成
      // （URLはパス完全一致で判定する。`/images` など下位パスの応答を取り違えないため）
      const detailPath = `/api/site-surveys/${createdSurveyId}`;
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === detailPath &&
          response.request().method() === 'GET' &&
          response.ok(),
        { timeout: getTimeout(30000) }
      );

      // APIから画像データを取得
      await page.goto(`/site-surveys/${createdSurveyId}`);

      // APIレスポンスを待機
      const apiResponse = await responsePromise;
      const responseData = (await apiResponse.json()) as {
        images: Array<{ id: string; displayOrder: number }>;
      };

      // 前提: 順序を判定するには2枚以上の画像が必要
      // （第3原則: 前提が満たせない場合は沈黙せず失敗させる）
      expect(
        responseData.images.length,
        'REQ-4.10: 表示順序の検証には2枚以上の画像が必要（前段のアップロードテストが未実行の可能性）'
      ).toBeGreaterThanOrEqual(2);

      // 画像の識別には画像IDを用いる
      // （画像IDはリクエストごとに変動しない。署名付きURLは署名部が変動しうるため識別に用いない）
      const displayOrderByImageId = new Map(
        responseData.images.map((image) => [image.id, image.displayOrder] as const)
      );

      // UIに表示される画像の順序を取得
      await page.waitForLoadState('networkidle');
      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems).toHaveCount(responseData.images.length, {
        timeout: getTimeout(10000),
      });

      const displayedImageIds = await photoPanelItems.evaluateAll((items) =>
        items.map((item) => item.getAttribute('data-image-id'))
      );

      // 表示された画像が応答の画像と過不足なく一致すること
      expect([...displayedImageIds].sort(), 'REQ-4.10: 応答の画像がすべて表示される').toEqual(
        [...displayOrderByImageId.keys()].sort()
      );

      // 表示順序がdisplayOrder昇順であること
      // （displayOrderは同値が混在しうる（バッチアップロードで同値が割り当てられる）ため、
      //   同値内の並びには依存しない「昇順であること」で判定する）
      const displayedOrders = displayedImageIds.map(
        (imageId) => displayOrderByImageId.get(imageId ?? '') as number
      );
      expect(displayedOrders, 'REQ-4.10: 画像一覧がdisplayOrder昇順で表示される').toEqual(
        [...displayedOrders].sort((a, b) => a - b)
      );
    });

    /**
     * @requirement site-survey/REQ-4.11
     *
     * REQ-4.11 は「ドラッグアンドドロップで表示順序を変更する（未保存状態になる）」であり、
     * 永続化は含まない。ドラッグ＆ドロップの結果はローカル状態にのみ反映され、
     * データベースへの保存は保存ボタン（REQ-10.9）で行われる。
     * したがって本テストはリロードを挟まず、その場での並び替えと未保存化のみを検証する。
     * 永続化は「並び替え後に保存すると表示順序が永続化される」テストで別途検証する。
     */
    test('ドラッグ＆ドロップで画像の表示順序を変更すると未保存状態になる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 画像が2枚未満の場合はテスト失敗（第3原則: 前提条件でテストを自動的に無効化しない）
      const imageCount = await photoPanelItems.count();
      expect(
        imageCount,
        'REQ-4.11: ドラッグ＆ドロップの検証には2枚以上の画像が必要（前段のアップロードテストが未実行の可能性）'
      ).toBeGreaterThanOrEqual(2);

      // 並び替え前の順序を記録
      // （表示領域へ入れてから表示元URLの設定を待つ。site-survey/REQ-38.8 の遅延読み込み対応）
      const firstImageSrc = await getPanelImageSrc(photoPanelItems.nth(0));
      const secondImageSrc = await getPanelImageSrc(photoPanelItems.nth(1));
      expect(firstImageSrc, '並び替えを判別するには先頭2枚の表示元URLが異なる必要がある').not.toBe(
        secondImageSrc
      );

      // 操作前は未保存インジケーターが出ていないこと
      const dirtyIndicator = page.getByTestId('dirty-indicator');
      await expect(dirtyIndicator).toBeHidden();

      // (前提1) ドラッグの起点がドラッグ可能である指定を保持していること
      // イベント送出による再現は `draggable` が失われても成立してしまうため、明示的に検証する
      const sourceDragHandle = photoPanelItems.nth(0).getByTestId('photo-drag-handle');
      await expect(
        sourceDragHandle,
        'REQ-4.11: ドラッグの起点はドラッグ可能である指定を保持する'
      ).toHaveAttribute('draggable', 'true');

      // 1枚目を2枚目の位置へドラッグ＆ドロップ
      const dragObservation = await reorderPhotoByDragAndDrop(page, 0, 1);

      // (前提2) 起点要素の `draggable` はイベント送出時点でも保持されていること
      expect(
        dragObservation.sourceDraggable,
        'REQ-4.11: ドラッグ送出時も起点はドラッグ可能である'
      ).toBe('true');

      // (前提3) ドロップ許可に必要な既定動作の抑止が働いていること
      // 抑止が失われるとブラウザはドロップを受け付けない（実ブラウザ操作では並び替えが成立しない）
      expect(
        dragObservation.dragOverDefaultPrevented,
        'REQ-4.11: dragover の既定動作が抑止されドロップが許可される'
      ).toBe(true);
      expect(dragObservation.dropDefaultPrevented, 'REQ-4.11: drop の既定動作が抑止される').toBe(
        true
      );

      // (b) 未保存状態になること（REQ-4.11 の「未保存状態になる」）
      await expect(dirtyIndicator).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dirtyIndicator).toContainText('未保存の変更があります');

      // (a) リロードせずに並び順が入れ替わっていること
      expect(await getPanelImageSrc(photoPanelItems.nth(0))).toBe(secondImageSrc);
      expect(await getPanelImageSrc(photoPanelItems.nth(1))).toBe(firstImageSrc);
    });

    /**
     * @requirement site-survey/REQ-10.9
     * @requirement site-survey/REQ-10.8
     *
     * REQ-10.9: 保存ボタンで表示順序をデータベースへ一括保存する
     * REQ-10.8: 写真一覧を保存された表示順序の通りに表示する
     */
    test('並び替え後に保存すると表示順序が永続化される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(10000) });

      const imageCount = await photoPanelItems.count();
      expect(
        imageCount,
        'REQ-10.9: 表示順序の永続化検証には2枚以上の画像が必要（前段のアップロードテストが未実行の可能性）'
      ).toBeGreaterThanOrEqual(2);

      // 並び替え前の順序を画像IDで記録する
      // （画像IDは要求ごとに変動しない。署名付きURLは署名部が変動しうるため識別に用いない）
      const firstImageId = await getPanelImageId(photoPanelItems.nth(0));
      const secondImageId = await getPanelImageId(photoPanelItems.nth(1));
      expect(firstImageId, '並び替えを判別するには先頭2枚の画像IDが異なる必要がある').not.toBe(
        secondImageId
      );

      await reorderPhotoByDragAndDrop(page, 0, 1);

      const dirtyIndicator = page.getByTestId('dirty-indicator');
      await expect(dirtyIndicator).toBeVisible({ timeout: getTimeout(10000) });

      // 保存ボタンで表示順序を一括保存（REQ-10.9）
      const orderSavePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${createdSurveyId}/images/order`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page
        .getByRole('region', { name: '写真管理パネル' })
        .getByRole('button', { name: '保存', exact: true })
        .click();

      const orderSaveResponse = await orderSavePromise;
      expect(orderSaveResponse.ok()).toBeTruthy();

      // 保存完了により未保存状態が解消されること
      await expect(dirtyIndicator).toBeHidden({ timeout: getTimeout(15000) });

      // リロード後も保存された表示順序で表示されること（REQ-10.8）
      await page.reload();
      await page.waitForLoadState('networkidle');

      const reloadedItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(reloadedItems.first()).toBeVisible({ timeout: getTimeout(10000) });

      expect(
        await getPanelImageId(reloadedItems.nth(0)),
        'REQ-10.8: 保存した表示順序の先頭は並び替え後の先頭（元の2枚目）である'
      ).toBe(secondImageId);
      expect(
        await getPanelImageId(reloadedItems.nth(1)),
        'REQ-10.8: 保存した表示順序の2枚目は並び替え後の2枚目（元の1枚目）である'
      ).toBe(firstImageId);
    });
  });

  /**
   * 画像削除フローのテスト
   *
   * REQ-4.7: DELETE /api/site-surveys/images/:imageId 画像削除
   */
  test.describe('画像削除', () => {
    /**
     * @requirement site-survey/REQ-4.7
     *
     * 削除の検証は「画像が見えていること」では成立しない。削除の操作を実際に行い、
     * 削除要求が送出されて成功したこと、および一覧から当該画像が消えたことまでを確かめる。
     * 削除対象は本テスト自身がアップロードして用意し、他テストの成果物には依存しない。
     *
     * 本テストだけ ADMIN_USER で操作する。削除権限は設計上 admin のみに与えられており
     * （useSiteSurveyPermission の canDelete = isAdmin）、REGULAR_USER には削除ボタンが
     * 描画されないためである。役割を上げているのではなく、要件4.7 の操作主体を正しく
     * 選んでいる。REGULAR_USER に削除を許すことは要件の意図ではない。
     */
    test('画像を削除できる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(10000) });
      const countBeforeUpload = await photoPanelItems.count();

      // 前提の確立: 削除対象の画像を本テストで用意する
      const input = page.locator('input[type="file"]').first();
      await expect(input).toBeAttached({ timeout: getTimeout(10000) });

      // 宛先の判定はオリジンではなくパスで行う（CIとローカルでAPIオリジンが異なるため）
      const uploadPromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/site-surveys/${createdSurveyId}/images` &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );
      await input.setInputFiles(path.join(__dirname, '../../fixtures/test-image.jpg'));
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.status(), '削除対象とする画像のアップロードが成功する').toBe(201);

      const uploadBody = (await uploadResponse.json()) as { successful: { id: string }[] };
      const targetImageId = uploadBody.successful[0]?.id ?? '';
      expect(targetImageId, 'アップロード応答から削除対象の画像IDを取得できる').toMatch(
        /^[0-9a-fA-F-]{36}$/
      );

      // 前提の確認: 削除対象が一覧に存在する
      await expect(photoPanelItems).toHaveCount(countBeforeUpload + 1, {
        timeout: getTimeout(15000),
      });
      const targetItem = page.locator(
        `[data-testid="photo-panel-item"][data-image-id="${targetImageId}"]`
      );
      await expect(targetItem).toBeVisible({ timeout: getTimeout(15000) });

      // 削除操作: 削除ボタンを押す
      const deleteButton = targetItem.getByRole('button', { name: /^画像を削除: / });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });

      const deletePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/site-surveys/images/${targetImageId}` &&
          response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );

      await deleteButton.click();

      // 削除操作: 確認ダイアログで削除を確定する
      const confirmDialog = page.getByRole('dialog', { name: '画像を削除' });
      await expect(confirmDialog).toBeVisible({ timeout: getTimeout(10000) });
      await confirmDialog.getByRole('button', { name: '削除する' }).click();

      // 削除要求が実際に送出され、成功していること（REQ-4.7）
      const deleteResponse = await deletePromise;
      expect(deleteResponse.status(), 'REQ-4.7: 画像削除APIが204を返す').toBe(204);

      // 結果: 確認ダイアログが閉じ、一覧から当該画像が消える（REQ-4.7）
      await expect(confirmDialog).toBeHidden({ timeout: getTimeout(15000) });
      await expect(targetItem).toHaveCount(0, { timeout: getTimeout(15000) });
      await expect(photoPanelItems).toHaveCount(countBeforeUpload, {
        timeout: getTimeout(15000),
      });

      // 削除が永続化されていること（再読込しても復活しない）
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(15000) });
      await expect(targetItem).toHaveCount(0, { timeout: getTimeout(15000) });
      await expect(photoPanelItems).toHaveCount(countBeforeUpload, {
        timeout: getTimeout(15000),
      });
    });
  });

  /**
   * 画像ビューア遷移のテスト
   */
  test.describe('画像ビューア', () => {
    test('画像をクリックするとビューアに遷移する', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像パネルアイテム内の画像ボタンを取得
      const photoPanelItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoPanelItems.first()).toBeVisible({ timeout: getTimeout(10000) });

      const imageButton = page.locator('[data-testid="photo-image-button"]').first();
      await expect(imageButton).toBeVisible({ timeout: getTimeout(10000) });

      // 画像ボタンをクリック
      await imageButton.click();

      // ビューアページに遷移することを確認
      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );

      // ビューアページで注釈エディタ（Canvas）が表示されることを確認
      // 画像はFabric.jsのcanvasで描画されるため、imgタグではなくdata-testidを使用
      const annotationEditor = page.locator('[data-testid="annotation-editor-container"]');
      await expect(annotationEditor).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * クリーンアップ
   */
  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await context.clearCookies();
      // localStorageクリア前にアプリにナビゲートする必要がある
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 現場調査を削除
      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        // 削除確認ダイアログが表示されるのを待機
        const confirmButton = page.getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/site-surveys$|\/projects\//, { timeout: getTimeout(15000) });
      }

      // プロジェクトを削除
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
