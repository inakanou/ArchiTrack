/**
 * @fileoverview アップロード失敗時の撮影画像の保持と再送のE2Eテスト
 *
 * site-survey 機能 Requirement 37（アップロード失敗時の撮影画像の保持と再送）を
 * 実ブラウザで検証する。単体テストは保持ロジック・表示・分類を個別に担保するが、
 * 「失敗した画像が画面に残り、その場で再送できる」という要件の本質は、
 * 実際の送信経路（apiClient → survey-images API → ImageUploader → PendingUploadPanel）が
 * 結線された状態でしか証明できないため、本ファイルを完了条件とする。
 *
 * 検証手段:
 * - アップロード POST の応答は `page.route` + `route.fulfill` で差し替える。
 *   解除は `page.unroute` で行う（既存 site-survey-upload-validation-e2e.spec.ts 踏襲）。
 * - 通信断は `route.abort('failed')` で再現する。localhost では `context.setOffline` が
 *   機能しないため用いない（既存 site-survey-annotation-tools.spec.ts 踏襲）。
 * - 固定時間待機（`page.waitForTimeout`）は用いず、明示的な条件待ちのみで構成する。
 *
 * Requirements coverage (site-survey):
 * - REQ-37.1:  アップロードで失敗した画像を未送信画像として画面に保持する
 * - REQ-37.2:  未送信画像の件数と、サムネイル・ファイル名・失敗理由を表示する
 * - REQ-37.3:  再送可能な画像をまとめて再送する操作手段を提供する
 * - REQ-37.5:  再送で成功した画像を未送信画像から取り除く
 * - REQ-37.6:  再送で全て成功した場合に未送信画像の表示を解消する
 * - REQ-37.7:  保持中の画像を破棄する操作手段を提供する
 * - REQ-37.8:  破棄は確認が承諾された場合にのみ実行する
 * - REQ-37.13: サーバー処理到達前の通信障害では自動的に再試行する
 * - REQ-37.16: 受入条件違反（サイズ上限）を再送不可として区別し理由を提示する
 * - REQ-37.18: 保持中の画像が全て再送不可なら再送手段を実行不可の状態で提示する
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
 */
function fixtureUpload(fileName: string) {
  return {
    name: fileName,
    mimeType: 'image/jpeg',
    buffer: fs.readFileSync(FIXTURE_IMAGE_PATH),
  };
}

/**
 * 画像アップロードエンドポイントの URL 判定。
 *
 * `page.route` / `page.unroute` は同一の matcher 参照でのみ対応付くため、
 * モジュールスコープの定数として共有する（インライン関数で unroute すると解除されない）。
 * オリジンではなくパスで判定するのは、CI とローカルで API のオリジンが異なるためである。
 */
const UPLOAD_URL_MATCHER = (url: URL): boolean =>
  /\/api\/site-surveys\/[^/]+\/images$/.test(url.pathname);

/**
 * アップロード POST の応答を差し替える。
 *
 * GET（画像一覧取得）は同一パスへ来るため `route.fallback()` で素通しする。
 *
 * @param page - Playwright のページオブジェクト
 * @param handler - POST に対する振る舞い（fulfill / abort）
 * @returns 差し替えを解除する関数
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

/**
 * 現場調査詳細画面のファイル入力を取得する。
 */
async function getFileInput(page: Page) {
  const input = page.getByTestId('file-input');
  await expect(input).toBeAttached({ timeout: getTimeout(10000) });
  return input;
}

/**
 * 一覧に表示されている写真の件数を取得する。
 */
async function getPhotoCount(page: Page): Promise<number> {
  return page.getByTestId('photo-panel-item').count();
}

/**
 * 未送信パネルが表示されるまで待機し、パネルの Locator を返す。
 */
async function waitForPendingPanel(page: Page, timeoutMs: number) {
  const panel = page.getByTestId('pending-upload-panel');
  await expect(panel).toBeVisible({ timeout: timeoutMs });
  return panel;
}

test.describe('アップロード失敗時の保持と再送 (REQ-37.1〜37.18)', () => {
  // 共有プロジェクト・現場調査を使うため serial 実行
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

      const projectName = `再送検証PJ_${Date.now()}`;
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
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 現場調査作成
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const surveyName = `再送検証現場調査_${Date.now()}`;
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
      const surveyMatch = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = surveyMatch?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();
    });
  });

  /**
   * 現場調査詳細画面を開く。
   */
  async function openSurveyDetail(page: Page): Promise<void> {
    if (!createdSurveyId) {
      throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
    }
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('image-uploader')).toBeVisible({ timeout: getTimeout(15000) });
  }

  // ==========================================================================
  // シナリオ1: 失敗 → 保持（REQ-37.1, REQ-37.2）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-37.1: 失敗した画像を未送信画像として画面に保持する
   * @requirement site-survey/REQ-37.2: 未送信件数とサムネイル・ファイル名・失敗理由を表示する
   */
  test('REQ-37.1, REQ-37.2: アップロードがサーバーエラーで失敗すると、未送信件数とサムネイルが表示される', async ({
    page,
  }) => {
    await openSurveyDetail(page);

    const restore = await interceptUpload(
      page,
      fulfillWithProblem(
        500,
        'Internal Server Error',
        'サーバー内部エラーが発生しました',
        'INTERNAL_SERVER_ERROR'
      )
    );

    try {
      const uploadResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 500,
        { timeout: getTimeout(60000) }
      );

      const input = await getFileInput(page);
      await input.setInputFiles(fixtureUpload('retry-server-error.jpg'));
      await uploadResponse;

      // 未送信画像が保持されること（37.1）
      const panel = await waitForPendingPanel(page, getTimeout(20000));

      // 件数の表示（37.2）
      await expect(page.getByTestId('pending-upload-count')).toHaveText(/未送信の画像\s*1\s*件/);

      const items = page.getByTestId('pending-upload-item');
      await expect(items).toHaveCount(1);
      // サーバー処理中の失敗は再送可として区別される
      await expect(items.first()).toHaveAttribute('data-kind', 'retriable');

      // サムネイルの表示（37.2）。src が blob URL であるだけでなく、
      // 実際に画像としてデコードされていること（naturalWidth > 0）を確認する。
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

      // ファイル名の表示（37.2）
      await expect(panel.getByTestId('pending-upload-filename').first()).toHaveText(
        'retry-server-error.jpg'
      );

      // 失敗理由の表示（37.2）。サーバーが返した理由がそのまま提示される。
      await expect(panel.getByTestId('pending-upload-reason').first()).toContainText(
        'サーバー内部エラーが発生しました'
      );

      // 再送可能な画像があるため、再送・破棄の操作手段はいずれも有効（37.3, 37.7）
      await expect(panel.getByTestId('pending-upload-retry-button')).toBeEnabled();
      await expect(panel.getByTestId('pending-upload-discard-button')).toBeEnabled();
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ2: 再送成功（REQ-37.3, REQ-37.5, REQ-37.6）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-37.3: 再送可能な画像をまとめて再送する操作手段を提供する
   * @requirement site-survey/REQ-37.5: 再送で成功した画像を未送信画像から取り除く
   * @requirement site-survey/REQ-37.6: 再送で全て成功した場合に未送信画像の表示を解消する
   */
  test('REQ-37.3, REQ-37.5, REQ-37.6: 失敗後に差し替えを解除して再送すると、画像が一覧へ追加され未送信表示が解消する', async ({
    page,
  }) => {
    await openSurveyDetail(page);

    const photoCountBefore = await getPhotoCount(page);

    const restore = await interceptUpload(
      page,
      fulfillWithProblem(
        500,
        'Internal Server Error',
        'サーバー内部エラーが発生しました',
        'INTERNAL_SERVER_ERROR'
      )
    );

    const failedResponse = page.waitForResponse(
      (response) =>
        UPLOAD_URL_MATCHER(new URL(response.url())) &&
        response.request().method() === 'POST' &&
        response.status() === 500,
      { timeout: getTimeout(60000) }
    );

    const input = await getFileInput(page);
    await input.setInputFiles(fixtureUpload('retry-then-success.jpg'));
    await failedResponse;

    const panel = await waitForPendingPanel(page, getTimeout(20000));
    await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1);

    // 差し替えを解除し、実サーバーへ届くようにする
    await restore();

    const retryResponse = page.waitForResponse(
      (response) =>
        UPLOAD_URL_MATCHER(new URL(response.url())) &&
        response.request().method() === 'POST' &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: getTimeout(60000) }
    );

    // 再送の操作手段を実行する（37.3）
    await panel.getByTestId('pending-upload-retry-button').click();
    await retryResponse;

    // 未送信画像の表示が解消すること（37.5, 37.6）
    await expect(page.getByTestId('pending-upload-panel')).toHaveCount(0, {
      timeout: getTimeout(20000),
    });

    // 画像が一覧へ追加されること
    await expect
      .poll(async () => getPhotoCount(page), { timeout: getTimeout(20000) })
      .toBe(photoCountBefore + 1);
  });

  // ==========================================================================
  // シナリオ3: 恒久失敗の区別（REQ-37.16, REQ-37.18）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-37.16: 受入条件違反を再送不可として区別し理由を提示する
   * @requirement site-survey/REQ-37.18: 全て再送不可なら再送手段を実行不可の状態で提示する
   */
  test('REQ-37.16, REQ-37.18: サイズ上限超過で失敗すると、再送が実行不可となり理由が表示される', async ({
    page,
  }) => {
    await openSurveyDetail(page);

    const restore = await interceptUpload(
      page,
      fulfillWithProblem(
        413,
        'Payload Too Large',
        'ファイルサイズが上限（10MB）を超えています',
        'PAYLOAD_TOO_LARGE'
      )
    );

    try {
      const uploadResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 413,
        { timeout: getTimeout(60000) }
      );

      const input = await getFileInput(page);
      await input.setInputFiles(fixtureUpload('too-large.jpg'));
      await uploadResponse;

      const panel = await waitForPendingPanel(page, getTimeout(20000));

      // 再送不可として区別されること（37.16）
      const items = page.getByTestId('pending-upload-item');
      await expect(items).toHaveCount(1);
      await expect(items.first()).toHaveAttribute('data-kind', 'permanent');

      // 再送しても解消しない旨とその理由が提示されること（37.16）
      const permanentNote = panel.getByTestId('pending-upload-permanent-note');
      await expect(permanentNote).toBeVisible();
      await expect(permanentNote).toContainText('再送しても解消しません');
      await expect(permanentNote).toContainText('ファイルサイズが上限（10MB）を超えています');

      // 再送の操作手段が実行不可であること（37.18）
      const retryButton = panel.getByTestId('pending-upload-retry-button');
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toBeDisabled();

      // 実行不可である理由が提示されること（37.18）
      await expect(panel.getByTestId('pending-upload-retry-unavailable')).toContainText(
        '再送できる画像がありません'
      );

      // 破棄の操作手段のみが提供されること（37.17）
      await expect(panel.getByTestId('pending-upload-discard-button')).toBeEnabled();
    } finally {
      await restore();
    }
  });

  // ==========================================================================
  // シナリオ4: 破棄（REQ-37.7, REQ-37.8）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-37.7: 保持中の画像を破棄する操作手段を提供する
   * @requirement site-survey/REQ-37.8: 破棄は確認が承諾された場合にのみ実行する
   */
  test('REQ-37.7, REQ-37.8: 破棄の確認を承諾すると未送信の表示が消える（拒否した場合は保持され続ける）', async ({
    page,
  }) => {
    await openSurveyDetail(page);

    const restore = await interceptUpload(
      page,
      fulfillWithProblem(
        500,
        'Internal Server Error',
        'サーバー内部エラーが発生しました',
        'INTERNAL_SERVER_ERROR'
      )
    );

    try {
      const uploadResponse = page.waitForResponse(
        (response) =>
          UPLOAD_URL_MATCHER(new URL(response.url())) &&
          response.request().method() === 'POST' &&
          response.status() === 500,
        { timeout: getTimeout(60000) }
      );

      const input = await getFileInput(page);
      await input.setInputFiles(fixtureUpload('to-be-discarded.jpg'));
      await uploadResponse;

      const panel = await waitForPendingPanel(page, getTimeout(20000));
      await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1);

      const discardButton = panel.getByTestId('pending-upload-discard-button');

      // 確認を拒否した場合は解放されないこと（37.8）
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
      // 拒否後も保持され続ける
      await expect(page.getByTestId('pending-upload-panel')).toBeVisible();
      await expect(page.getByTestId('pending-upload-item')).toHaveCount(1);

      // 確認を承諾した場合に解放されること（37.7, 37.8）
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
  // シナリオ5: 通信断からの復帰（REQ-37.13）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-37.13: サーバー処理到達前の通信障害では自動再試行する
   * @requirement site-survey/REQ-37.1: 自動再試行後も失敗した画像を保持する
   * @requirement site-survey/REQ-37.6: 再送で全て成功した場合に未送信画像の表示を解消する
   */
  test('REQ-37.13, REQ-37.1, REQ-37.6: 通信を遮断して失敗させたのち解除すると、再送が成功する', async ({
    page,
  }) => {
    await openSurveyDetail(page);

    const photoCountBefore = await getPhotoCount(page);

    // 通信断を再現する。localhost では setOffline が機能しないため route.abort を用いる。
    // 中断された送信は statusCode 0 となり apiClient が指数バックオフで自動再試行する（37.13）。
    let abortedAttempts = 0;
    const restore = await interceptUpload(page, async (route) => {
      abortedAttempts += 1;
      await route.abort('failed');
    });

    const input = await getFileInput(page);
    await input.setInputFiles(fixtureUpload('network-failure.jpg'));

    // 自動再試行を含む全試行が尽きたのち、未送信画像として保持される（37.1, 37.13）
    const panel = await waitForPendingPanel(page, getTimeout(90000));
    await expect(panel.getByTestId('pending-upload-item')).toHaveCount(1);
    await expect(panel.getByTestId('pending-upload-item').first()).toHaveAttribute(
      'data-kind',
      'retriable'
    );

    // 通信障害は自動再試行の対象であるため、送信は1回で終わっていない（37.13）
    expect(abortedAttempts).toBeGreaterThan(1);

    // 通信断を解除する
    await restore();

    const retryResponse = page.waitForResponse(
      (response) =>
        UPLOAD_URL_MATCHER(new URL(response.url())) &&
        response.request().method() === 'POST' &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: getTimeout(60000) }
    );

    await panel.getByTestId('pending-upload-retry-button').click();
    await retryResponse;

    // 再送が成功し、未送信の表示が解消する（37.6）
    await expect(page.getByTestId('pending-upload-panel')).toHaveCount(0, {
      timeout: getTimeout(20000),
    });
    await expect
      .poll(async () => getPhotoCount(page), { timeout: getTimeout(20000) })
      .toBe(photoCountBefore + 1);
  });
});
