/**
 * @fileoverview 工事写真 アップロード失敗時の保持・再送・破棄のE2Eテスト
 *
 * Task 15.4: 失敗から保持・再送・破棄までをE2Eで検証
 *
 * construction-photo Requirement 20（アップロード失敗時の撮影画像の保持と再送）を
 * 実ブラウザで検証する。単体テストは分類・保持・表示を個別に担保するが、
 * 「失敗した画像が画面に残り、その場で再送できる」という要件の本質は、
 * 実際の送信経路（apiClient.sendFormData → construction-photo-images API →
 * uploadFilesInWaves → PhotoUploader → ImageUploader → PendingUploadPanel）が
 * 結線された状態でしか証明できないため、本ファイルを完了条件とする。
 *
 * 検証手段（design.md「Testing Strategy > E2E/UI Tests」の「E2E の前提と観測方針」）:
 * - アップロード POST の応答は `page.route` + `route.fulfill` で差し替える。
 *   解除は登録時と同一のハンドラ参照を渡す `page.unroute` で行う
 *   （無名関数を再度渡しても解除されないため、matcher・handler ともに参照を保持する）。
 * - 応答差し替えの一致判定は**オリジンではなくパス**で行う。CI とローカルで API の
 *   オリジンが食い違い（CI は VITE_API_URL=localhost:3000 / API_BASE_URL=127.0.0.1:3000）、
 *   オリジン依存の判定は全件素通りして「常に成功する無意味なテスト」になるためである。
 * - 一時的な通信障害は `503` 応答で再現する。localhost では `context.setOffline` が
 *   機能しないため用いない（design.md 同節）。
 * - 固定時間待機（`page.waitForTimeout`）は用いず、明示的な条件待ちのみで構成する。
 *
 * Requirements coverage (construction-photo):
 * - REQ-20.1:  アップロードで失敗した画像を未送信画像として画面に保持する
 * - REQ-20.2:  未送信画像の件数と、サムネイル・ファイル名・失敗理由を表示する
 * - REQ-20.3:  再送可能な画像をまとめて再送する操作手段を提供する
 * - REQ-20.5:  再送で一部が成功した場合、成功分を取り除き失敗分のみ保持し続ける
 * - REQ-20.6:  再送で全て成功した場合に未送信画像の表示を解消する
 * - REQ-20.7:  保持中の画像を破棄する操作手段を提供する
 * - REQ-20.8:  破棄は確認が承諾された場合にのみ実行する
 * - REQ-20.13: サーバー処理到達前の失敗（503）では待機間隔を延ばしながら自動再試行する
 *              （design.md「E2E/UI Tests」の但し書きに従い、差し替え中の同一パスへの
 *              リクエストが2回以上発生したことを実測して主張する）
 * - REQ-20.16: 受入条件違反（サイズ上限）を再送不可として区別し、解消しない旨と理由を提示する
 * - REQ-20.17: 再送不可の画像は再送対象に含めず、破棄の操作手段のみを提供する
 * - REQ-20.18: 保持中の画像が全て再送不可なら再送手段を実行不可の状態で提示する
 *
 * 本ファイルが主張しない受入基準（design.md「R20 の検証責務の切り分け」）:
 * - 20.4 / 20.9 / 20.10 は `PhotoUploader` 単体テスト、
 *   20.11 / 20.12 / 20.14 / 20.15 / 20.19 / 20.20 は共有クライアント（`api/client.ts`）の
 *   単体テストの責務であり、画面から区別できないためラベルを付けない。
 */

import { test, expect, type Dialog, type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** アップロード用フィクスチャ画像 */
const FIXTURE_IMAGE_PATH = path.join(__dirname, '../../fixtures/test-image.jpg');

/**
 * フィクスチャ画像を任意のファイル名で送信するための入力値を組み立てる。
 *
 * テストごとにファイル名を変えることで、未送信一覧に表示される名前が
 * 当該テストで送信した画像のものであることを一意に確認できる。
 * 拡張子を `.jpg` に揃えるのは、送信前の圧縮（`compressImagesForUpload`）が
 * JPEG へ再エンコードする際にファイル名の拡張子を `.jpg` へ寄せるためである。
 */
function fixtureUpload(fileName: string) {
  return {
    name: fileName,
    mimeType: 'image/jpeg',
    buffer: fs.readFileSync(FIXTURE_IMAGE_PATH),
  };
}

/**
 * 工事写真の画像アップロードエンドポイントの URL 判定。
 *
 * `page.route` / `page.unroute` は同一の matcher 参照でのみ対応付くため、
 * モジュールスコープの定数として共有する（インライン関数で unroute すると解除されない）。
 * オリジンではなくパスで判定するのは、CI とローカルで API のオリジンが異なるためである。
 */
const UPLOAD_URL_MATCHER = (url: URL): boolean =>
  /\/api\/construction-photos\/[^/]+\/images$/.test(url.pathname);

/**
 * アップロード POST の応答を差し替える。
 *
 * POST 以外（一覧取得など）が同一パスへ来た場合は `route.fallback()` で素通しする。
 *
 * @param page - Playwright のページオブジェクト
 * @param handler - POST に対する振る舞い（fulfill / fallback）
 * @returns 差し替えを解除する関数（登録時と同一のハンドラ参照で unroute する）
 */
async function interceptUpload(
  page: Page,
  handler: (route: Route) => Promise<void>
): Promise<() => Promise<void>> {
  const routeHandler = async (route: Route): Promise<void> => {
    if (route.request().method() === 'POST') {
      await handler(route);
      return;
    }
    await route.fallback();
  };

  await page.route(UPLOAD_URL_MATCHER, routeHandler);

  return async () => {
    await page.unroute(UPLOAD_URL_MATCHER, routeHandler);
  };
}

/**
 * RFC 7807 形式のエラー応答を返すハンドラを生成する。
 *
 * 画面の失敗理由表示は応答本文の `detail` を採用する（`api/client.ts` の
 * `resolveErrorMessage`）ため、提示される文言をテストから指定できる。
 */
function fulfillWithProblem(status: number, title: string, detail: string, code: string) {
  return async (route: Route): Promise<void> => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        type: `https://architrack.example.com/problems/${code.toLowerCase().replace(/_/g, '-')}`,
        title,
        status,
        detail,
        code,
      }),
    });
  };
}

/** サーバー処理中の失敗（自動再試行の対象外・再送可）を表す応答 */
const SERVER_ERROR_DETAIL = 'サーバー内部エラーが発生しました';
const fulfillServerError = fulfillWithProblem(
  500,
  'Internal Server Error',
  SERVER_ERROR_DETAIL,
  'INTERNAL_SERVER_ERROR'
);

/** 一時的な通信障害（サーバー処理到達前・自動再試行の対象）を表す応答 */
const SERVICE_UNAVAILABLE_DETAIL = '一時的にサービスを利用できません';
const fulfillServiceUnavailable = fulfillWithProblem(
  503,
  'Service Unavailable',
  SERVICE_UNAVAILABLE_DETAIL,
  'SERVICE_UNAVAILABLE'
);

/** サイズ上限超過（確定的な拒否・再送不可）を表す応答 */
const PAYLOAD_TOO_LARGE_DETAIL = 'ファイルサイズが上限（10MB）を超えています';
const fulfillPayloadTooLarge = fulfillWithProblem(
  413,
  'Payload Too Large',
  PAYLOAD_TOO_LARGE_DETAIL,
  'PAYLOAD_TOO_LARGE'
);

/**
 * multipart リクエストの先頭から `Content-Disposition` のファイル名部分を取り出す。
 *
 * `uploadFilesInWaves` は1ファイル1リクエストで送信するため、送信対象のファイル名は
 * ボディ先頭のパートヘッダに現れる。ASCII 名のみを扱うため latin1 で復号する。
 *
 * @returns ファイル名を含むヘッダ断片。ボディを取得できない場合は null
 */
function readMultipartHead(route: Route): string | null {
  const buffer = route.request().postDataBuffer();
  if (!buffer) {
    return null;
  }
  return buffer.subarray(0, 4096).toString('latin1');
}

/**
 * 一覧に表示されている写真項目の件数を取得する。
 */
async function getPhotoCount(page: Page): Promise<number> {
  return page.getByTestId('construction-photo-item').count();
}

/**
 * 未送信パネルが表示されるまで待機し、パネルの Locator を返す。
 */
async function waitForPendingPanel(page: Page, timeoutMs: number) {
  const panel = page.getByTestId('pending-upload-panel');
  await expect(panel).toBeVisible({ timeout: timeoutMs });
  return panel;
}

test.describe('工事写真 アップロード失敗時の保持と再送 (REQ-20.1〜20.18)', () => {
  // 共有プロジェクト・アルバムを使うため serial 実行
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;
  let albumId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // 事前準備
  // ==========================================================================

  test('事前準備: テスト用プロジェクトと工事写真アルバムを作成する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // プロジェクト作成（既存 construction-photo E2E の規約踏襲）
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /新規作成/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `工事写真再送E2E_${Date.now()}`;
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

    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
    projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
    expect(projectId).toBeTruthy();

    // アルバム作成
    await page.goto(`/projects/${projectId}/construction-photos/new`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('アルバム名').fill(`再送検証アルバム_${Date.now()}`);

    const createAlbumPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/projects\/[0-9a-f-]+\/construction-photos$/.test(response.url()) &&
        (response.status() === 201 || response.status() === 200),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '作成' }).click();
    const albumResponse = await createAlbumPromise;
    const albumBody = (await albumResponse.json()) as { id: string };
    albumId = albumBody.id;
    expect(albumId).toBeTruthy();
  });

  /**
   * 工事写真アルバム詳細画面を開き、アップローダが操作可能になるまで待つ。
   */
  async function openAlbumDetail(page: Page): Promise<void> {
    if (!albumId) {
      throw new Error('albumIdが未設定です。事前準備テストが正しく実行されていません。');
    }
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('photo-uploader')).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByTestId('file-input')).toBeAttached({ timeout: getTimeout(10000) });
  }

  // ==========================================================================
  // シナリオ1: 失敗 → 保持（REQ-20.1, REQ-20.2）
  // ==========================================================================

  /**
   * @requirement construction-photo/REQ-20.1
   * @requirement construction-photo/REQ-20.2
   */
  test('REQ-20.1, REQ-20.2: アップロードがサーバーエラーで失敗すると、未送信件数・サムネイル・ファイル名・失敗理由が表示される', async ({
    page,
  }) => {
    await openAlbumDetail(page);

    const restore = await interceptUpload(page, fulfillServerError);

    try {
      const failedResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 500,
        { timeout: getTimeout(60000) }
      );

      await page.getByTestId('file-input').setInputFiles(fixtureUpload('cp-server-error.jpg'));
      await failedResponse;

      // 失敗した画像が未送信画像として保持される（20.1）
      const panel = await waitForPendingPanel(page, getTimeout(20000));

      // 未送信件数の表示（20.2）
      await expect(page.getByTestId('pending-upload-count')).toHaveText(/未送信の画像\s*1\s*件/);

      const items = page.getByTestId('pending-upload-item');
      await expect(items).toHaveCount(1);
      // サーバー処理中の失敗は再送可として区別される（20.16 の裏返し）
      await expect(items.first()).toHaveAttribute('data-kind', 'retriable');

      // サムネイルの表示（20.2）。blob URL であるだけでなく、実際に画像として
      // デコードされていること（naturalWidth > 0）まで確認する。
      const thumbnail = panel.getByTestId('pending-upload-thumbnail').first();
      await expect(thumbnail).toBeVisible();
      await expect(thumbnail).toHaveAttribute('src', /^blob:/);
      await expect
        .poll(
          async () =>
            thumbnail.evaluate(
              (element) => (element as HTMLImageElement).naturalWidth
            ) as Promise<number>,
          { timeout: getTimeout(10000) }
        )
        .toBeGreaterThan(0);

      // ファイル名の表示（20.2）
      await expect(panel.getByTestId('pending-upload-filename').first()).toHaveText(
        'cp-server-error.jpg'
      );

      // 失敗理由の表示（20.2）。サーバーが返した理由がそのまま提示される。
      await expect(panel.getByTestId('pending-upload-reason').first()).toContainText(
        SERVER_ERROR_DETAIL
      );

      // 再送可能な画像があるため、再送・破棄の操作手段はいずれも有効（20.3, 20.7）
      await expect(panel.getByTestId('pending-upload-retry-button')).toBeEnabled();
      await expect(panel.getByTestId('pending-upload-discard-button')).toBeEnabled();
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ2: 再送（REQ-20.3, REQ-20.5, REQ-20.6）
  // ==========================================================================

  /**
   * 2件を失敗させたうえで、
   *   (a) 1件だけ失敗し続ける状態で再送 → 成功分のみ保持から外れる（20.5）
   *   (b) 差し替えを完全に解除して再送 → 未送信の表示が解消する（20.6）
   * の順に検証する。(a) を挟むのは、20.5 が要求する「一部成功」を単一画像の
   * 全件成功で代替すると観測できないためである。
   *
   * @requirement construction-photo/REQ-20.3
   * @requirement construction-photo/REQ-20.5
   * @requirement construction-photo/REQ-20.6
   */
  test('REQ-20.3, REQ-20.5, REQ-20.6: 再送で成功した画像だけが保持から外れ、全て成功すると未送信表示が解消する', async ({
    page,
  }) => {
    // 3回の送信（初回2件・部分再送2件・再送1件）を含むため既定の60秒では足りない
    test.setTimeout(getTimeout(120000));

    await openAlbumDetail(page);

    const photoCountBefore = await getPhotoCount(page);

    const FIRST_FILE = 'cp-retry-first.jpg';
    const SECOND_FILE = 'cp-retry-second.jpg';

    // 差し替え対象のファイル名集合。テストの進行に応じて縮小させる。
    const failingFileNames = new Set<string>([FIRST_FILE, SECOND_FILE]);
    // ボディを読めなかった場合を握り潰さず、テスト末尾で検出できるよう記録する。
    const routeErrors: string[] = [];

    const restore = await interceptUpload(page, async (route) => {
      const head = readMultipartHead(route);
      if (head === null) {
        routeErrors.push('multipart ボディを取得できませんでした');
        await fulfillServerError(route);
        return;
      }
      const shouldFail = [...failingFileNames].some((name) => head.includes(name));
      if (shouldFail) {
        await fulfillServerError(route);
        return;
      }
      await route.fallback();
    });

    try {
      // --- 初回送信: 2件とも失敗させる（20.1） ---
      await page
        .getByTestId('file-input')
        .setInputFiles([fixtureUpload(FIRST_FILE), fixtureUpload(SECOND_FILE)]);

      const panel = await waitForPendingPanel(page, getTimeout(30000));
      await expect(panel.getByTestId('pending-upload-item')).toHaveCount(2, {
        timeout: getTimeout(20000),
      });
      await expect(page.getByTestId('pending-upload-count')).toHaveText(/未送信の画像\s*2\s*件/);

      // --- 部分再送: 1件目のみ実サーバーへ通し、2件目は失敗させ続ける（20.3, 20.5） ---
      failingFileNames.delete(FIRST_FILE);

      const partialRetrySuccess = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: getTimeout(60000) }
      );

      await panel.getByTestId('pending-upload-retry-button').click();
      await partialRetrySuccess;

      // 成功した画像だけが保持から取り除かれ、失敗した画像は保持され続ける（20.5）
      await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1, {
        timeout: getTimeout(30000),
      });
      await expect(page.getByTestId('pending-upload-count')).toHaveText(/未送信の画像\s*1\s*件/);
      await expect(panel.getByTestId('pending-upload-filename').first()).toHaveText(SECOND_FILE);

      // 成功分は写真項目として一覧へ追加されている
      await expect
        .poll(async () => getPhotoCount(page), { timeout: getTimeout(30000) })
        .toBe(photoCountBefore + 1);

      // --- 再送: 差し替えを解除して全件成功させる（20.6） ---
      failingFileNames.delete(SECOND_FILE);

      const finalRetrySuccess = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: getTimeout(60000) }
      );

      await panel.getByTestId('pending-upload-retry-button').click();
      await finalRetrySuccess;

      // 未送信画像の表示が解消する（20.6）
      await expect(page.getByTestId('pending-upload-panel')).toHaveCount(0, {
        timeout: getTimeout(30000),
      });

      // 2件とも写真項目として一覧へ追加されている
      await expect
        .poll(async () => getPhotoCount(page), { timeout: getTimeout(30000) })
        .toBe(photoCountBefore + 2);

      expect(routeErrors).toEqual([]);
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ3: 再送不可の区別（REQ-20.16, REQ-20.17, REQ-20.18）
  // ==========================================================================

  /**
   * @requirement construction-photo/REQ-20.16
   * @requirement construction-photo/REQ-20.17
   * @requirement construction-photo/REQ-20.18
   */
  test('REQ-20.16, REQ-20.17, REQ-20.18: サイズ上限超過は再送不可として区別され、再送手段が実行不可で理由が提示される', async ({
    page,
  }) => {
    await openAlbumDetail(page);

    const restore = await interceptUpload(page, fulfillPayloadTooLarge);

    try {
      const failedResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 413,
        { timeout: getTimeout(60000) }
      );

      await page.getByTestId('file-input').setInputFiles(fixtureUpload('cp-too-large.jpg'));
      await failedResponse;

      const panel = await waitForPendingPanel(page, getTimeout(20000));

      // 再送不可として区別されること（20.16）
      const items = page.getByTestId('pending-upload-item');
      await expect(items).toHaveCount(1);
      await expect(items.first()).toHaveAttribute('data-kind', 'permanent');

      // 再送しても解消しない旨とその理由が提示されること（20.16）
      const permanentNote = panel.getByTestId('pending-upload-permanent-note');
      await expect(permanentNote).toBeVisible();
      await expect(permanentNote).toContainText('再送しても解消しません');
      await expect(permanentNote).toContainText(PAYLOAD_TOO_LARGE_DETAIL);

      // 再送の対象に含めず、再送の操作手段が実行不可であること（20.17, 20.18）
      const retryButton = panel.getByTestId('pending-upload-retry-button');
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toBeDisabled();

      // 実行不可である理由が提示されること（20.18）
      await expect(panel.getByTestId('pending-upload-retry-unavailable')).toContainText(
        '再送できる画像がありません'
      );

      // 破棄の操作手段のみが提供されること（20.17）
      await expect(panel.getByTestId('pending-upload-discard-button')).toBeEnabled();
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ4: 破棄（REQ-20.7, REQ-20.8）
  // ==========================================================================

  /**
   * @requirement construction-photo/REQ-20.7
   * @requirement construction-photo/REQ-20.8
   */
  test('REQ-20.7, REQ-20.8: 破棄の確認を承諾すると未送信の表示が消える（拒否した場合は保持され続ける）', async ({
    page,
  }) => {
    await openAlbumDetail(page);

    const restore = await interceptUpload(page, fulfillServerError);

    try {
      const failedResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 500,
        { timeout: getTimeout(60000) }
      );

      await page.getByTestId('file-input').setInputFiles(fixtureUpload('cp-to-be-discarded.jpg'));
      await failedResponse;

      const panel = await waitForPendingPanel(page, getTimeout(20000));
      await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1);

      // 破棄の操作手段が提供されること（20.7）
      const discardButton = panel.getByTestId('pending-upload-discard-button');
      await expect(discardButton).toBeEnabled();

      // 確認を拒否した場合は解放されないこと（20.8）
      const dismissedMessages: string[] = [];
      const dismissHandler = async (dialog: Dialog) => {
        dismissedMessages.push(dialog.message());
        await dialog.dismiss();
      };
      page.once('dialog', dismissHandler);
      await discardButton.click();

      await expect
        .poll(() => dismissedMessages.length, { timeout: getTimeout(10000) })
        .toBeGreaterThan(0);
      expect(dismissedMessages[0]).toContain('未送信の画像をすべて破棄します');
      await expect(page.getByTestId('pending-upload-panel')).toBeVisible();
      await expect(page.getByTestId('pending-upload-item')).toHaveCount(1);

      // 確認を承諾した場合にのみ解放されること（20.7, 20.8）
      const acceptedMessages: string[] = [];
      page.once('dialog', async (dialog) => {
        acceptedMessages.push(dialog.message());
        await dialog.accept();
      });
      await discardButton.click();

      await expect
        .poll(() => acceptedMessages.length, { timeout: getTimeout(10000) })
        .toBeGreaterThan(0);
      await expect(page.getByTestId('pending-upload-panel')).toHaveCount(0, {
        timeout: getTimeout(20000),
      });
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ5: 一時的な通信障害からの復旧（REQ-20.13, REQ-20.1, REQ-20.3, REQ-20.6）
  // ==========================================================================

  /**
   * `503`（サーバー処理到達前の応答不能）は `api/client.ts` の
   * `UPLOAD_RETRYABLE_STATUS_CODES` に含まれ、multipart 送信でも自動再試行の対象となる。
   * 差し替え中の同一パスへのリクエスト回数を実測し、送信が1回で終わっていないことを
   * 確認したうえで REQ-20.13 を主張する（design.md「E2E/UI Tests」の但し書き）。
   *
   * オフライン切替（`context.setOffline`）はローカル環境で機能しないため用いない。
   *
   * @requirement construction-photo/REQ-20.13
   * @requirement construction-photo/REQ-20.1
   * @requirement construction-photo/REQ-20.3
   * @requirement construction-photo/REQ-20.6
   */
  test('REQ-20.13, REQ-20.1, REQ-20.6: 一時的な通信障害では自動再試行し、復旧後の再送が成功する', async ({
    page,
  }) => {
    // 自動再試行の待機（おおよそ 1s → 2s → 4s）が実時間で発生するため猶予を広げる
    test.setTimeout(getTimeout(150000));

    await openAlbumDetail(page);

    const photoCountBefore = await getPhotoCount(page);

    // 差し替え中に同一パスへ届いたアップロード要求の回数を実測する（20.13）
    let unavailableAttempts = 0;
    const restore = await interceptUpload(page, async (route) => {
      unavailableAttempts += 1;
      await fulfillServiceUnavailable(route);
    });

    await page.getByTestId('file-input').setInputFiles(fixtureUpload('cp-service-unavailable.jpg'));

    // 自動再試行が尽きたのち、未送信画像として保持される（20.1）
    const panel = await waitForPendingPanel(page, getTimeout(90000));
    await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1);
    await expect(panel.getByTestId('pending-upload-item').first()).toHaveAttribute(
      'data-kind',
      'retriable'
    );
    await expect(panel.getByTestId('pending-upload-reason').first()).toContainText(
      SERVICE_UNAVAILABLE_DETAIL
    );

    // 送信は1回で終わっておらず、段階的な自動再試行が行われている（20.13）
    expect(unavailableAttempts).toBeGreaterThan(1);

    // 通信障害を復旧させる（登録時と同一のハンドラ参照で解除する）
    await restore();

    const retrySuccess = page.waitForResponse(
      (response) =>
        UPLOAD_URL_MATCHER(new URL(response.url())) &&
        response.request().method() === 'POST' &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: getTimeout(60000) }
    );

    // 再送の操作手段を実行する（20.3）
    await panel.getByTestId('pending-upload-retry-button').click();
    await retrySuccess;

    // 再送が成功し、未送信の表示が解消する（20.6）
    await expect(page.getByTestId('pending-upload-panel')).toHaveCount(0, {
      timeout: getTimeout(30000),
    });
    await expect
      .poll(async () => getPhotoCount(page), { timeout: getTimeout(30000) })
      .toBe(photoCountBefore + 1);
  });
});
