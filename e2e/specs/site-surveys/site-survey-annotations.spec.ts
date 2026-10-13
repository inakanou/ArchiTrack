/**
 * @fileoverview 現場調査注釈エディタのE2Eテスト
 *
 * Task 26.2: 現場調査のE2Eテストを実装する
 *
 * Requirements:
 * - 9.1: PUT /api/site-surveys/images/:imageId/annotations 注釈データ保存
 * - 10.6: PDF報告書のクライアントサイド生成
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 現場調査注釈エディタのE2Eテスト
 *
 * Playwrightベストプラクティスに従い、beforeAll/afterAllでセットアップ・クリーンアップを行う
 */
test.describe('現場調査注釈エディタ', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;
  // テストで作成した現場調査のIDを保存
  let createdSurveyId: string | null = null;
  // 共有ページ
  let sharedPage: Page;
  // 共有コンテキスト
  let sharedContext: BrowserContext;

  /**
   * 事前準備: プロジェクト、現場調査を作成
   */
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');

    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `注釈テスト用プロジェクト_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createProjectPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createProjectPromise;

    await sharedPage.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const projectUrl = sharedPage.url();
    const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
    createdProjectId = projectMatch?.[1] ?? null;

    if (!createdProjectId) {
      throw new Error('プロジェクトの作成に失敗しました');
    }

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');

    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `注釈テスト用現場調査_${Date.now()}`;
    await sharedPage.getByLabel(/調査名/i).fill(surveyName);
    await sharedPage.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);
    await sharedPage.getByLabel(/メモ/i).fill('注釈エディタテスト用のメモです。');

    const createSurveyPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('site-surveys') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );

    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createSurveyPromise;

    await sharedPage.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
    const surveyUrl = sharedPage.url();
    const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
    createdSurveyId = surveyMatch?.[1] ?? null;

    if (!createdSurveyId) {
      throw new Error('現場調査の作成に失敗しました');
    }

    // 画像を1枚登録する（Task 115.127 段6）。
    // 本ファイルの検証対象（注釈エディタのUI・注釈ツールの選択・調査報告書PDFの出力）は
    // いずれも「画像が登録されていること」を前提とする。前提を用意しないまま
    // 「画像があれば検証する」と書くと、画像が無い限り主張が一つも実行されずに緑になる。
    // 前提はテスト自身が作り、以降の主張は無条件に置く。
    const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
    expect(fs.existsSync(testImagePath), 'テスト用画像ファイルが存在しない').toBeTruthy();

    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    assertPrepared(accessToken, 'API直接呼び出し用のアクセストークン');

    const uploadResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
          images: {
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: fs.readFileSync(testImagePath),
          },
        },
      }
    );
    expect(uploadResponse.ok(), '事前準備の画像アップロードが失敗した').toBeTruthy();

    // 報告書出力フラグを ON にして保存する。
    // `includeInReport` の既定値は false（backend/prisma/schema.prisma）であり、
    // ON にしないと調査報告書出力は「報告書出力対象の写真がありません」で終わる（REQ-11.2）。
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    const panelItem = sharedPage.locator('[data-testid="photo-panel-item"]').first();
    await expect(panelItem).toBeVisible({ timeout: getTimeout(15000) });

    const reportCheckbox = panelItem.getByLabel('報告書に含める');
    await expect(reportCheckbox).toBeVisible({ timeout: getTimeout(10000) });
    await reportCheckbox.check();

    const savePromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/site-surveys/images/batch') &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: /^保存$/ }).click();
    const saveResponse = await savePromise;
    expect([200, 204], '報告書出力フラグの保存が失敗した').toContain(saveResponse.status());

    await sharedPage.close();
    await sharedContext.close();
  });

  /**
   * クリーンアップ: 作成したデータを削除
   */
  test.afterAll(async ({ browser }) => {
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();

    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');

      // 現場調査を削除
      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      await cleanupPage.goto(`/site-surveys/${createdSurveyId}`);
      await cleanupPage.waitForLoadState('networkidle');

      const surveyDeleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
      await expect(surveyDeleteButton).toBeVisible({ timeout: 5000 });
      await surveyDeleteButton.click();
      // ダイアログ内の確認ボタンを選択（focus-manager-overlayまたはダイアログ要素内）
      const dialog = cleanupPage
        .getByTestId('focus-manager-overlay')
        .or(cleanupPage.getByRole('dialog'));
      const surveyConfirmButton = dialog.getByRole('button', { name: /^削除する$/i });
      await expect(surveyConfirmButton).toBeVisible({ timeout: 5000 });
      await surveyConfirmButton.click();
      await cleanupPage.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });

      // プロジェクトを削除
      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      await cleanupPage.goto(`/projects/${createdProjectId}`);
      await cleanupPage.waitForLoadState('networkidle');

      const projectDeleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
      await expect(projectDeleteButton).toBeVisible({ timeout: 5000 });
      await projectDeleteButton.click();
      const projectConfirmButton = cleanupPage
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i });
      await expect(projectConfirmButton).toBeVisible({ timeout: 5000 });
      await projectConfirmButton.click();
      await cleanupPage.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 注釈エディタ機能のテスト
   *
   * @requirement site-survey/REQ-2.4
   *
   * タスク 115.188 の是正: 従前は REQ-9.1 を名乗っていたが、受入基準9.1 の原文は「When ユーザーが注釈編集画面で保存ボタンを押す,
   * the Site Survey Service shall 全ての注釈データをデータベースに保存する」
   * である。本区間の表題・本文が述べる内容に対応するのは受入基準2.4（「When ユーザーが現場調査詳細画面で画像をクリックする,
   * the Site Survey Service shall 画像ビューア/注釈エディタを開く」
   * ）である。
   */
  test('注釈エディタのUIが表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // 段5 の時点では本ファイルの事前準備が画像を登録しておらず、注釈エディタへ進む経路に
    // 決して入らなかったため「画像の無い詳細画面」を主張する形に留めていた。
    // 段6 で事前準備が画像を登録するようになったので、本来の主題である
    // 「注釈エディタのUIが表示される」ことを無条件に主張する。
    const imageButton = page.getByTestId('photo-image-button').first();
    await expect(imageButton, '事前準備で登録した画像が写真管理パネルに現れない').toBeVisible({
      timeout: getTimeout(15000),
    });

    await imageButton.click();
    await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });

    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
    await editModeButton.click();

    // 注釈エディタのツールバーと描画キャンバスが表示される
    await expect(
      page.getByTestId('annotation-toolbar'),
      '注釈ツールバーが表示されない'
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(
      page.locator('[data-testid="annotation-editor-container"] canvas').first(),
      '注釈エディタの描画キャンバスが表示されない'
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement site-survey/REQ-29.1
   *
   * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
   * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
   */
  test('注釈ツールを選択できる (site-survey/REQ-29.1)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    const imageButton = page.getByTestId('photo-image-button').first();
    await expect(imageButton, '事前準備で登録した画像が写真管理パネルに現れない').toBeVisible({
      timeout: getTimeout(15000),
    });
    await imageButton.click();

    await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`), {
      timeout: getTimeout(10000),
    });

    // 編集モードに入る
    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
    await editModeButton.click();

    const toolbar = page.getByTestId('annotation-toolbar');
    await expect(toolbar).toBeVisible({ timeout: getTimeout(15000) });

    // ツールバーは TOOL_ORDER の全項目を常に描画する
    // （frontend/src/components/site-surveys/annotation-toolbar.constants.ts）。
    // 「表示されていれば検証する」ではなく、全項目が並ぶことを無条件に主張する。
    const toolLabels = [
      '選択',
      '寸法線',
      '矢印',
      '円',
      '四角形',
      '多角形',
      '折れ線',
      'フリーハンド',
      'テキスト',
    ];

    for (const label of toolLabels) {
      const button = toolbar.getByRole('button', { name: label, exact: true });
      await expect(button, `注釈ツール「${label}」がツールバーに無い`).toBeVisible();

      await button.click();

      // 選択中のツールがハイライトされる（aria-pressed で表現される）
      await expect(
        button,
        `注釈ツール「${label}」を選択しても選択中として示されない`
      ).toHaveAttribute('aria-pressed', 'true');
    }
  });

  /**
   * PDF報告書出力のテスト
   *
   * @requirement site-survey/REQ-11.1
   *
   * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
   * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
   */
  test('PDF出力ボタンが表示される (site-survey/REQ-11.1)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 詳細ページに移動
    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // PDF出力ボタンを探す
    // 一括エクスポート機能の追加により同一正規表現が複数ボタンに一致するため、
    // strict mode violation を避けて先頭要素（調査報告書出力ボタン）を対象とする
    const pdfButton = page.getByRole('button', { name: /PDF|報告書|エクスポート/i }).first();

    // REQ-10.6: 調査報告書の出力はボタンで提供される（リンクの実装は無い）。
    // 以前は「ボタン または リンク」の論理和で、ボタンが失われても
    // リンクさえあれば通る形だったが、リンクは決して現れない。
    // 実装が提供する導線そのものを主張する。
    await expect(pdfButton, '調査報告書の出力ボタンが表示されない').toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement site-survey/REQ-11.1
   * @requirement site-survey/REQ-11.8
   *
   * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
   * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
   */
  test('PDF出力をクリックするとダウンロードが開始される (site-survey/REQ-11.1, site-survey/REQ-11.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    // PDF出力ボタンを取得
    const pdfButton = page.getByRole('button', { name: /PDF|報告書|エクスポート/i }).first();

    // PDF出力ボタンが必須
    await expect(pdfButton).toBeVisible({ timeout: getTimeout(5000) });

    // ダウンロードの購読はクリックより先に置く（クリック後では取りこぼす）
    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });

    await pdfButton.click();

    // 事前準備で報告書出力フラグを ON にしているため、出力対象なしのエラーは現れない。
    // 以前はこのエラーを「出たら主張して return」する形で包んでおり、
    // 出力対象が無いまま緑になり、以降のダウンロード検証が一度も実行されていなかった。
    await expect(
      page.getByText(/報告書出力対象の写真がありません/i),
      '報告書出力対象の写真が無いと判定された（事前準備の出力フラグが効いていない）'
    ).toHaveCount(0);

    // ダウンロードが開始され、PDF ファイルが得られる
    const download = await downloadPromise;
    expect(download.suggestedFilename(), 'ダウンロードされたファイルが PDF ではない').toMatch(
      /\.pdf$/i
    );
  });

  /**
   * タスク 115.188 の是正: 従前は REQ-10.6 を名乗っていたが、受入基準10.6 は写真一覧の「上へ移動」
   * ボタンについての条文であり、調査報告書PDFの出力とは無関係である。報告書PDF生成中の進捗表示を述べる受入基準は要件11 にも
   * 要件16 にも存在しないため、被覆印は掲げない。
   */
  test('PDF出力中にプログレス表示がされる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    const pdfButton = page.getByRole('button', { name: /PDF|報告書|エクスポート/i }).first();

    // PDF出力ボタンが必須
    await expect(pdfButton).toBeVisible({ timeout: getTimeout(5000) });

    // 進捗表示は生成の完了とともに消えるため、クリック後に「見えているか」を観測すると
    // 取りこぼしうる。出現そのものをクリック前から購読して、出現を無条件に主張する。
    // 実装の進捗表示は data-testid="pdf-export-progress"
    // （frontend/src/components/site-surveys/SiteSurveyDetailInfo.tsx）。
    // 従来観測していた [data-testid="pdf-progress"] / .progress-indicator / [role="progressbar"] は
    // この画面には存在せず、論理和の相方（「生成中」の文言）と併せて
    // 「どちらも出なければ何も主張しない」形になっていた。
    await page.evaluate(() => {
      const state = window as unknown as { __pdfProgressSeen?: boolean };
      state.__pdfProgressSeen = !!document.querySelector('[data-testid="pdf-export-progress"]');
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="pdf-export-progress"]')) {
          state.__pdfProgressSeen = true;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });

    await pdfButton.click();

    await expect(
      page.getByText(/報告書出力対象の写真がありません/i),
      '報告書出力対象の写真が無いと判定された（事前準備の出力フラグが効いていない）'
    ).toHaveCount(0);

    await downloadPromise;

    const progressSeen = await page.evaluate(
      () => (window as unknown as { __pdfProgressSeen?: boolean }).__pdfProgressSeen === true
    );
    expect(progressSeen, 'PDF生成中に進捗表示が現れなかった').toBe(true);

    // 生成完了後は進捗表示が残らない
    await expect(page.getByTestId('pdf-export-progress')).toBeHidden({
      timeout: getTimeout(60000),
    });
  });
});
