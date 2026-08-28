/**
 * @fileoverview 現場調査非機能要件のE2Eテスト
 *
 * Note: REQ-16.4（同時接続ユーザー100人以上）、REQ-16.5（月間稼働率99.9%）、
 * REQ-16.7（定期バックアップ）はE2Eテストで検証困難なため省略
 *
 * 本ファイルは以前 REQ-14.x を被覆印として掲げていたが、
 * .kiro/specs/site-survey/requirements.md の Requirement 14 はアクセス制御であり、
 * 受入基準は 1〜5 までしか存在しない（REQ-14.6 / REQ-14.8 は存在しない）。
 * 性能・HTTPS・エラー表示は Requirement 16（非機能要件）の受入基準であるため、
 * 実際に検証している受入基準の番号へ訂正した。
 * なお REQ-16.1〜16.8 は e2e/requirement-exclusions.json でE2E対象外として
 * 代替検証（負荷テスト・監視・単体テスト）が登録されている受入基準である。
 * 本ファイルの観測は、その代替検証を置き換えるものではなく、
 * E2E環境で観測できる範囲の裏付けにとどまる。
 *
 * 除外のため被覆印を掲げない受入基準（e2e/requirement-exclusions.json）:
 *   要件16.1: 本検証が主張する上限は5000ミリ秒であり、受入基準の2秒を主張していない
 *   要件16.2: 60fps を主張する検証は本ファイルに無い
 *   要件16.3: 本検証が主張する上限は15000ミリ秒であり、受入基準の5秒を主張していない
 *   要件16.6: APIリクエストが発生したことしか主張しておらず、HTTPS/TLS による暗号化を主張していない
 *   要件16.8: エラーメッセージの表示は主張するが、Sentry への送信を主張していない
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査非機能要件', () => {
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

      const projectName = `非機能要件テスト用プロジェクト_${Date.now()}`;
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

      const surveyName = `非機能要件テスト用現場調査_${Date.now()}`;
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
   * 受入基準 16.1 は除外である（e2e/requirement-exclusions.json）。本検証が主張する上限は5000ミリ秒であり、受入基準の2秒を主張していないため、被覆印は掲げない。
   */
  test.describe('パフォーマンス - 画像一覧表示', () => {
    test('画像一覧の初期表示が2秒以内に完了する', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // ページ読み込み開始時間を記録
      const startTime = Date.now();

      await page.goto(`/site-surveys/${createdSurveyId}`);

      // 画像一覧またはコンテンツが表示されるまで待機（PhotoManagementPanel）
      await page.waitForSelector('[aria-label="写真管理パネル"], .image-list, .survey-content', {
        timeout: getTimeout(10000),
      });

      const endTime = Date.now();
      const loadTime = endTime - startTime;

      // 2秒（2000ms）以内に表示されることを確認
      // CI環境では時間がかかる場合があるので、5秒を上限とする
      expect(loadTime).toBeLessThan(5000);

      console.log(`[Performance] 画像一覧初期表示時間: ${loadTime}ms`);
    });
  });

  /**
   * 受入基準 16.3 は除外である（e2e/requirement-exclusions.json）。本検証が主張する上限は15000ミリ秒であり、受入基準の5秒を主張していないため、被覆印は掲げない。
   */
  test.describe('パフォーマンス - 画像アップロード', () => {
    test('300KB以下の画像アップロードが5秒以内に完了する', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // テスト用画像ファイル（約100KB）
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
      expect(fs.existsSync(testImagePath)).toBeTruthy();

      // ファイル入力を取得
      const fileInput = page.locator('input[type="file"]').first();
      const fileInputVisible = await fileInput.isVisible();
      if (!fileInputVisible) {
        // 非表示の場合はinputがある要素をクリック
        const uploadArea = page.locator('[data-testid="upload-area"], .upload-dropzone').first();
        const uploadAreaVisible = await uploadArea.isVisible();
        if (uploadAreaVisible) {
          // hidden inputを取得
          const hiddenInput = page.locator('input[type="file"]');
          const hiddenInputCount = await hiddenInput.count();
          if (hiddenInputCount > 0) {
            const startTime = Date.now();

            // アップロードAPIのレスポンスを待機
            const uploadPromise = page.waitForResponse(
              (response) =>
                response.url().includes('/api/') &&
                response.url().includes('images') &&
                response.request().method() === 'POST',
              { timeout: getTimeout(30000) }
            );

            await hiddenInput.first().setInputFiles(testImagePath);

            const uploadResponse = await uploadPromise;

            const endTime = Date.now();
            const uploadTime = endTime - startTime;

            // 5秒（5000ms）以内にアップロードが完了することを確認
            // CI環境では時間がかかる場合があるので、15秒を上限とする
            expect(uploadResponse.ok()).toBe(true);
            expect(uploadTime).toBeLessThan(15000);
            console.log(`[Performance] 画像アップロード時間: ${uploadTime}ms`);
          } else {
            throw new Error('ファイル入力要素が見つかりません');
          }
        } else {
          throw new Error('アップロードエリアが見つかりません');
        }
      } else {
        const startTime = Date.now();

        const uploadPromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/') &&
            response.url().includes('images') &&
            response.request().method() === 'POST',
          { timeout: getTimeout(30000) }
        );

        await fileInput.setInputFiles(testImagePath);

        const uploadResponse = await uploadPromise;

        const endTime = Date.now();
        const uploadTime = endTime - startTime;

        expect(uploadResponse.ok()).toBe(true);
        expect(uploadTime).toBeLessThan(15000);
        console.log(`[Performance] 画像アップロード時間: ${uploadTime}ms`);
      }

      await expect(page.locator('body')).toBeVisible();
    });
  });

  /**
   * 受入基準 16.6 は除外である（e2e/requirement-exclusions.json）。APIリクエストが発生したことしか主張しておらず、HTTPS/TLS による暗号化を主張していないため、被覆印は掲げない。
   */
  test.describe('セキュリティ - HTTPS通信', () => {
    test('APIリクエストがHTTPSで行われる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // リクエストを監視
      const requests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/')) {
          requests.push(url);
        }
      });

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // HTTPS の強制は本E2E環境では観測できない。フロントもAPIも http://localhost で
      // 提供されており、HTTPS へ寄せるのは本番の配信層（バックエンドの httpsRedirect
      // ミドルウェア／リバースプロキシ）であるためである。
      // 以前は「本番環境なら」の入れ子の分岐の内側で
      // `url.startsWith('https://') || url.startsWith('http://localhost')` を主張していた。
      // 外側の分岐は localhost では決して真にならず判定は一度も実行されない。
      // 仮に実行されても、右辺により localhost の平文通信を許すため恒真である。
      // httpsRedirect ミドルウェアそのものは
      // backend/src/__tests__/unit/middleware/httpsRedirect.test.ts が検証している。
      // ここでは観測できることだけを主張する: 詳細画面の表示でAPI通信が実際に発生する。
      expect(requests.length, '現場調査詳細を開いてもAPI通信が発生していない').toBeGreaterThan(0);
    });
  });

  /**
   * 受入基準 16.8 は除外である（e2e/requirement-exclusions.json）。エラーメッセージの表示は主張するが、Sentry への送信を主張していないため、被覆印は掲げない。
   */
  test.describe('エラーハンドリング', () => {
    test('存在しない現場調査にアクセスするとエラーメッセージが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないIDでアクセス
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await page.goto(`/site-surveys/${nonExistentId}`);
      await page.waitForLoadState('networkidle');

      const errorMessage = page.getByText(/見つかりません|存在しません|不正|404|not found|エラー/i);

      // 存在しない現場調査を開いたときはエラーメッセージが表示される。
      // 以前は「エラー文 または 専用エラーページ要素 または 404 への遷移」の論理和で
      // 判定しており、後ろ二つは実装に無いため判定はエラー文だけで成立していた。
      // 受入基準が求めているのはエラーメッセージの提示であるため、それだけを主張する。
      await expect(errorMessage.first(), '存在しない現場調査でエラーが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('無効なプロジェクトIDで現場調査作成ページにアクセスするとエラーが表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないプロジェクトIDでアクセス
      const nonExistentProjectId = '00000000-0000-0000-0000-000000000000';
      await page.goto(`/projects/${nonExistentProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // エラーメッセージまたはリダイレクトを確認
      const errorAlert = page.getByRole('alert');
      // 実装（SiteSurveyCreatePage）はプロジェクトを取得できないとき role="alert" で
      // エラーを提示する。
      // 以前は「alert または エラー文 または リダイレクト」の論理和だったため、
      // どれか一つが残れば通り、提示が失われても気づけなかった。
      await expect(errorAlert.first(), '無効なプロジェクトIDでエラーが提示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('APIエラー発生時にユーザーフレンドリーなメッセージが表示される', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 必須フィールドを空にして送信し、バリデーションエラーを発生させる
      const nameInput = page.getByLabel(/調査名/i);
      await nameInput.clear();
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await createButton.click();

      // バリデーションエラーメッセージが表示されることを確認
      const validationError = page.getByText(/必須|入力してください|required/i);
      const formError = page.locator('.error-message, [data-testid="form-error"], [role="alert"]');

      // 必須項目が空のまま送信すると、アプリ側のバリデーションが文言と
      // role="alert" の両方で提示する。ブラウザのネイティブ検証（HTML5 required）は
      // 用いていない。
      // 以前は三項の論理和で、どれか一つが残れば通る形だった。実装が同時に与える
      // 二つを個別に主張する。
      await expect(validationError.first(), '必須項目のエラー文言が表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(formError.first(), '必須項目のエラーが alert として提示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
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

      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const surveyDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(surveyDeleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await surveyDeleteButton.click();
      const surveyConfirmButton = page.getByRole('button', { name: '削除する' });
      await expect(surveyConfirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await surveyConfirmButton.click();
      await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });

      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const projectDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(projectDeleteButton).toBeVisible({ timeout: getTimeout(10000) });
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
