/**
 * @fileoverview PDFテキスト抽出ハイブリッドアプローチのE2Eテスト
 *
 * Task 41.3: PDFテキスト抽出のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - 17.1: pdfjs-distのgetTextContent() APIでPDFからテキストを抽出する
 * - 17.2: PDFの全ページを対象にテキスト抽出を行う
 * - 17.3: テキストPDFでそのまま使用（Tesseract OCRを呼ばない）
 * - 17.5: 抽出テキストから構造化データ(明細行)への変換
 * - 17.6: PDFプレビューでページナビゲーション(前へ/次へボタン、ページ表示)
 * - 17.7: 処理中インジケーターの表示
 *
 * Task 115.127 段1: 前提の生成を `seedEstimateRequest`（`estimate-request-preconditions`）へ寄せ、
 * `test.skip(!createdEstimateRequestId, …)` 8 件を `assertPrepared` へ改めた。
 *
 * Task 115.135: 完了を「抽出結果 **または** エラー表示」の選言で受理する形を全廃した。
 * あわせて、現行の `e2e/fixtures` の PDF は 2 件ともテキスト入りでスキャンPDF
 * フォールバック経路へ到達しないため、17.4（スキャンPDFでCanvas→OCR）と
 * 17.8（30秒タイムアウト）を被覆から外し、`e2e/requirement-exclusions.json` へ
 * integration-test 区分で登録した（理由は各検証の注記）。その後タスク **115.157** が
 * 画像のみのPDF fixture を用意し、`e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts`
 * で 17.4 と 17.8 の双方を被覆して当該除外を解消した。
 *
 * Task 115.158: PDFプレビューの成立を「react-pdf の外枠 **または** 読み込み中の骨組み」の
 * 選言で受理する形を全廃した。`.or(...).first()` は「どれかの枝が満たされれば成立」ではなく
 * **DOM順の先頭の要素がひとつ可視か**を問う形であり、この画面では先頭が常に幅0の骨組みで
 * あるため、骨組みの枝も後続の枝も判定に効いていなかった。実際に閉じた穴は
 * (1) `react-pdf` の外枠は読み込み中も失敗時も描画されるため**外枠の可視は成否を何も述べない**
 * こと、(2) 外枠の可視からページの canvas の可視までに窓があり（CPU 8 倍抑制の実測で
 * 0.7〜1.4 秒）、その窓に当たった実行が**描画されていないのに緑**になることの2点である。
 * 実測値と再現手順は `e2e/helpers/pdf-preview.ts` の冒頭に置いた。
 * 判定は同ファイルの `expectPdfPreviewRendered` へ寄せる。
 *
 * @module e2e/specs/estimate-requests/pdf-text-extraction-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { assertPrepared } from '../../helpers/preconditions';
import { seedEstimateRequest } from '../../helpers/estimate-request-preconditions';
import { expectPdfPreviewRendered } from '../../helpers/pdf-preview';
import {
  startOcrProgressIndicatorWatch,
  hasOcrProgressIndicatorAppeared,
} from '../../helpers/ocr-observations';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PDFの抽出経路を pdfjs-dist に固定する。
 *
 * `OcrDataExtractor` は PDF に対してまず Claude Vision を試し、失敗した場合にだけ
 * pdfjs-dist のハイブリッド抽出へ落ちる（REQ-24.2 / REQ-25.1）。
 * Requirement 17 は pdfjs-dist 経路の要件であり、
 * Claude Vision の可用性で結果が揺れると「検出できたら検証する」形になってしまう。
 * Claude Vision を利用不可（503）に固定して、常に pdfjs-dist 経路を通す。
 *
 * @param page Playwright のページ（画面遷移の前に呼ぶこと）
 */
async function forcePdfjsExtractionPath(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/claude-vision/extract', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'テスト用に固定した利用不可',
        errorType: 'service_unavailable',
      }),
    })
  );
}

/**
 * PDFテキスト抽出ハイブリッドアプローチのE2Eテスト
 *
 * テストフロー:
 * 1. テスト用前提データ(プロジェクト、取引先、内訳書、見積依頼)をAPI経由で作成
 * 2. PDFアップロード後のテキスト抽出・処理中インジケーター・結果表示を確認
 * 3. 一括取り込みボタンの動作を確認
 * 4. PDFプレビューのページナビゲーション動作を確認
 * 5. テキストPDFでTesseract OCRが呼ばれないことを確認
 * 6. テキストPDFの抽出が終端し処理中インジケーターが解消されることを確認
 * 7. テストデータをクリーンアップ
 */
test.describe('PDFテキスト抽出ハイブリッドアプローチ (Task 41.3)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  // ============================================================================
  // テストデータセットアップ
  // ============================================================================

  test('テスト前提データを作成する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // Task 115.127 段1: プロジェクト〜見積依頼の前提生成は共通の補助へ寄せる。
    // 3ファイルが同じ約110行を複製していたため、複製したまま個別に直すと再発する。
    // いずれかの作成に失敗した時点で補助の内側で失敗する。
    const seed = await seedEstimateRequest(page, {
      label: 'PDF抽出E2Eテスト',
      siteAddress: '東京都港区テスト1-1-1',
      partnerEmail: 'test-pdf-extract@example.com',
      groupName: '土木工事グループ',
      item: {
        workType: '土木工事',
        name: 'コンクリート打設',
        specification: '普通',
        unit: 'm3',
        quantity: 50,
      },
    });

    accessToken = seed.accessToken;
    createdProjectId = seed.projectId;
    createdTradingPartnerId = seed.tradingPartnerId;
    createdItemizedStatementId = seed.itemizedStatementId;
    createdEstimateRequestId = seed.estimateRequestId;
  });

  // ============================================================================
  // 17.7: PDFアップロード時の処理中インジケーター表示確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.7
   */
  test('PDFアップロード後に処理中インジケーターが表示される (estimate-request/REQ-17.7)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-17.7 の主張の準備。テキスト入り PDF の抽出は瞬時に終わるため、
    // 処理中の一瞬は Playwright の定期的な問い合わせでは取り逃がしうる。
    // 以前はそれを「インジケーター **または** 結果 **または** エラー」の選言で回避しており、
    // 抽出が失敗しても成立し、かつインジケーターを一度も検査していなかった。
    // DOM 変更と同期に出現を記録する形へ改める。
    await startOcrProgressIndicatorWatch(page);

    // テキスト入りPDFファイルをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // 抽出が終端することを確認したうえで、処理中インジケーターの出現を主張する
    await expect(page.locator('[data-testid="ocr-extracted-text"]')).toBeVisible({
      timeout: getTimeout(60000),
    });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    // REQ-17.7: 抽出処理の実行中は処理中インジケーターが表示される
    expect(
      await hasOcrProgressIndicatorAppeared(page),
      'PDFテキスト抽出中の処理中インジケーターが一度も表示されなかった'
    ).toBe(true);
  });

  // ============================================================================
  // 17.1, 17.2: PDFテキスト抽出成功と結果表示確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.1
   * @requirement estimate-request/REQ-17.2
   */
  test('PDFアップロード後にテキスト抽出が成功し結果が表示される (estimate-request/REQ-17.1, estimate-request/REQ-17.2)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // テキスト入りPDFをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // REQ-17.1: テキスト入り PDF からは必ずテキストが抽出され、抽出結果が表示される。
    // Claude Vision が成功した場合も抽出結果は同じ `ocr-extracted-text` に表示されるため
    // （`processClaudeVision` の `setExtractedText`）、経路によらず無条件に主張できる
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(60000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    // 抽出されたテキストが空でないことを確認（REQ-17.1: getTextContent APIでテキスト抽出）
    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // 17.3: テキストPDFでそのまま使用（Tesseract OCR不使用）
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.3
   */
  test('テキストPDFではTesseract OCRが呼ばれずpdfjs-distのテキスト抽出結果がそのまま使用される (estimate-request/REQ-17.3)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // コンソールログを監視してTesseract呼び出しを検出
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    // ネットワークリクエストを監視してTesseract関連のリクエストを検出
    const tesseractRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('tesseract') || url.includes('ocr')) {
        tesseractRequests.push(url);
      }
    });

    // テキスト入りPDFをアップロード（pdfjs-distでテキスト抽出可能なPDF）
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // テキスト抽出結果の検証。以前は「結果またはエラー」の選言で完了を待っていたため、
    // 抽出が常に失敗しても後続へ進んでいた。テキストPDFは抽出が成功する経路であるため
    // 選言を廃し、抽出の成立を無条件に主張する。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(60000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);

    // テキストPDFの場合、Tesseract Workerの初期化リクエストが発生しない
    // （テキスト抽出にOCRは不要）。
    // 以前はワーカーが初期化された場合にのみ
    // `hasPdfjsExtraction || textContent!.length > 0` を判定していたが、右辺は直前で
    // 0 より大きいことを確定させた値であり常に真である。つまりワーカーの初期化有無を
    // 一度も確かめていなかった。初期化されたリクエストが無いことを直接主張する。
    const tesseractWorkerRequests = tesseractRequests.filter(
      (url) => url.includes('tesseract-worker') || url.includes('tesseract-core')
    );
    expect(tesseractWorkerRequests, 'テキストPDFではTesseractワーカーは初期化されない').toEqual([]);
  });

  // ============================================================================
  // テキスト入りPDFの抽出成立の確認
  // （REQ-17.4 のフォールバック経路の被覆ではない。理由は直下の注記）
  // ============================================================================

  /**
   * 注意（site-survey タスク 115.135 の実測）: 入力に用いる `e2e/fixtures/test-file.pdf` は
   * `/Font` と 7 個のテキスト描画演算子を持ち `/Image` を持たない**テキスト入り PDF** である。
   * 抽出される文字数は 97 で `frontend/src/components/estimate-requests/pdf-text-extractor.ts`
   * の閾値 50 を超えるため `isTextPdf=true` が確定し、`extractPdfWithOcrFallback` へ
   * **一度も入らない**。したがって REQ-17.4 が定める Canvas→Tesseract のフォールバック
   * 経路は本検証では検査できない。
   *
   * 115.135 の是正: 到達しない受入基準を被覆済みと数えさせないため `@requirement` タグを
   * 外し、`e2e/requirement-exclusions.json` へ integration-test 区分で登録した。
   * タスク **115.157** が画像のみのPDF fixture（`e2e/fixtures/test-scanned-pdf.pdf`）を
   * 用意し、`e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts` で
   * 当該経路を被覆した。当該除外は解消済みである。
   *
   * 本検証に残る主張は「テキスト入り PDF から抽出結果の表示へ到達し、
   * エラー表示にならないこと」である。
   */
  test('テキスト入りPDFのアップロードで抽出結果の表示へ到達する', async ({ page }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // 抽出が成立したことを主張する。以前は「インジケーター **または** 結果 **または** エラー」と
    // 「結果 **または** エラー」の二段の選言で完了を待っており、どちらも
    // **抽出が失敗しても成立する**判定であった。選言を廃し成功のみを主張する。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');

    await expect(extractedText).toBeVisible({ timeout: getTimeout(90000) });
    await expect(errorMessage).toHaveCount(0);
  });

  // ============================================================================
  // 17.5: 一括取り込みボタンの動作確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.5
   */
  test('抽出結果から一括取り込みボタンが表示され、データが明細行に転記される (estimate-request/REQ-17.5)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // REQ-17.5 は「PDFテキスト抽出の結果」から一括取り込みボタンを提供する要件である。
    // Claude Vision が使える環境では抽出経路がそちらへ逸れ、検出件数が定まらないため
    // 「ボタンが出たら検証する」形になり主張が一度も実行されない回が生じる。
    // REQ-25.1 のフォールバックを固定して pdfjs 経路（REQ-17.1, REQ-17.3）を必ず通す。
    await forcePdfjsExtractionPath(page);

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // テキスト入りPDFをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // テキスト抽出完了を待機（テキスト入りPDFなので抽出は必ず成立する）
    await expect(page.locator('[data-testid="ocr-extracted-text"]')).toBeVisible({
      timeout: getTimeout(60000),
    });

    // REQ-17.5: 抽出結果から一括取り込みボタンが提供される
    const importButton = page.locator('[data-testid="ocr-import-button"]');
    await expect(importButton).toBeVisible({ timeout: getTimeout(10000) });

    // 一括取り込みボタンをクリック
    await importButton.click();

    // 取り込み成功メッセージが表示される
    await expect(page.locator('[data-testid="ocr-import-success"]')).toBeVisible({
      timeout: getTimeout(5000),
    });

    // 確認・修正メッセージが表示される
    await expect(page.getByText(/内容を確認し、必要に応じて修正してください/i)).toBeVisible({
      timeout: getTimeout(5000),
    });

    // REQ-17.5: 明細行テーブルに抽出データが転記されている
    const lineItemTable = page.locator('form table');
    await expect(lineItemTable).toBeVisible({ timeout: getTimeout(5000) });
    await expect(
      page.getByRole('textbox', { name: '行1 名称' }),
      'REQ-17.5: 一括取り込み後も明細行の名称が空のままである'
    ).not.toHaveValue('');
  });

  // ============================================================================
  // 17.6: PDFプレビューページナビゲーション確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.6
   */
  test('PDFプレビューでページナビゲーションが動作する (estimate-request/REQ-17.6)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 複数ページのPDFをアップロード（test-text-pdf.pdfは2ページ）
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // PDFプレビューの描画が成立するまで待機（Task 115.158）
    // 以前は「react-pdf の外枠 **または** 読み込み中の骨組み」の選言で成立としていた。
    // `.or(...).first()` は DOM順の先頭の要素の可視を問う形であり、先頭は常に幅0の骨組みで
    // あるため枝は効いていなかったが、外枠の可視が読み込みの成否を述べないこと自体は残る。
    // 外枠の可視からページの canvas の可視までには窓がある（CPU 8 倍抑制の実測で 0.7〜1.4 秒）。
    // ページの canvas の可視だけを成立とする形へ改める。
    await expectPdfPreviewRendered(page);

    // ページナビゲーションが表示されるまで待機
    // アップロードした `test-text-pdf.pdf` は 2 ページ（/Count 2）であるため、
    // REQ-17.6 のページナビゲーションは必ず表示される。
    // 以前は「表示された場合のみ検証」で包んでいたため、
    // ナビゲーションが出なくなっても REQ-17.6 の主張が一つも実行されなかった。
    const nextButton = page.getByRole('button', { name: '次へ' });
    const prevButton = page.getByRole('button', { name: '前へ' });
    await expect(nextButton).toBeVisible({ timeout: getTimeout(10000) });

    // 「ページ 1 / 2」テキストが表示される
    await expect(page.getByText(/ページ 1 \/ 2/)).toBeVisible({
      timeout: getTimeout(5000),
    });

    // 「前へ」ボタンが非活性（1ページ目）
    await expect(prevButton).toBeDisabled();

    // 「次へ」ボタンが活性
    await expect(nextButton).toBeEnabled();

    // 「次へ」をクリック
    await nextButton.click();

    // ページ表示が更新される
    await expect(page.getByText(/ページ 2 \/ 2/)).toBeVisible({
      timeout: getTimeout(5000),
    });

    // 最終ページなので「次へ」が非活性
    await expect(nextButton).toBeDisabled();

    // 「前へ」ボタンが活性
    await expect(prevButton).toBeEnabled();

    // 「前へ」をクリック
    await prevButton.click();

    // 1ページ目に戻る
    await expect(page.getByText(/ページ 1 \/ 2/)).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  // ============================================================================
  // 単一ページPDFのナビゲーション非表示確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.6
   */
  test('単一ページPDFではナビゲーションが非表示 (estimate-request/REQ-17.6)', async ({ page }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // フォームが開いている場合は閉じる
    const cancelButton = page.getByRole('button', { name: /^キャンセル$/i });
    if (await isVisibleWithin(cancelButton, 1000)) {
      await cancelButton.click();
      await page.waitForTimeout(500);
    }

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 単一ページPDFをアップロード（test-file.pdfは1ページ）
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // PDFプレビューの描画が成立するまで待機（Task 115.158）
    // 以前は外枠の可視で成立としていたため、外枠が出てから canvas が出るまでの窓
    // （CPU 8 倍抑制の実測で 0.7〜1.4 秒）に当たると描画前に先へ進んでしまい、
    // その不確かさを埋めるために固定時間の待機を置いていた。
    // ページの canvas の可視を主張すればページ数が確定するため、固定時間の待機は不要になる。
    await expectPdfPreviewRendered(page);

    // 1ページPDFなのでナビゲーションボタンが非表示であること
    const nextButton = page.getByRole('button', { name: '次へ' });
    await expect(nextButton).not.toBeVisible({ timeout: getTimeout(5000) });
  });

  // ============================================================================
  // 17.7: 処理の終端と処理中インジケーターの解消
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.7
   *
   * 本検証は以前「PDF処理が30秒を超えた場合にタイムアウトが発生する」と称して
   * `@requirement` で REQ-17.8 を付けていたが、実際には処理を 30 秒超に
   * するものが一つも無く、終端の姿を「抽出結果 **または** エラー表示」の選言で受理していた。
   * すなわち REQ-17.8（抽出のタイムアウトを 30 秒とする）を一度も検査せずに被覆済みと
   * 数えさせていた（site-survey タスク 115.135 の実測）。
   *
   * 抽出をタイムアウトさせるには、`extractPdfHybrid` の内側を 30 秒以上滞留させる必要がある。
   * 滞留させられるのは Canvas→Tesseract のフォールバック経路（CDN 上のワーカー資材の取得）だが、
   * **現行の** `e2e/fixtures` の PDF は 2 件ともテキスト入りでこの経路へ到達せず、
   * その手前の `renderPdfPagesToBase64` はタイムアウトの外側にあるため滞留させても
   * REQ-17.8 の判定にならない。したがって現行の fixture のままでは E2E から到達しない。
   * 原理的に到達不能なわけではなく、画像のみの PDF を用意すれば到達しうる。
   * `e2e/requirement-exclusions.json` へ integration-test 区分で登録し、代替検証として
   * `frontend/src/components/estimate-requests/OcrDataExtractor.test.tsx` の
   * 「PDFテキスト抽出のタイムアウト（30秒）が適用される（17.8）」を据えた
   * （2026-08-24 に単体で実行し 30.1 秒で緑になることを実測）。その後タスク **115.157** が
   * 150 ページの画像のみPDF（`e2e/fixtures/test-scanned-pdf-multipage.pdf`）で
   * 30 秒の打ち切りを実測し、`e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts`
   * で被覆した。当該除外は解消済みである。
   *
   * 本検証に残るのは REQ-17.7 の後半、すなわち処理中インジケーターが
   * 実行中にだけ表示され、終端後は残らないことの確認である。
   */
  test('抽出が終端すると処理中インジケーターが解消される (estimate-request/REQ-17.7)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書登録ボタンをクリック
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-17.7 の前半（実行中はインジケーターを表示する）を取り逃がさずに記録する
    await startOcrProgressIndicatorWatch(page);

    // PDFファイルをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // 抽出は成立して終端する。以前は終端の姿を「抽出結果 **または** エラー表示」の
    // 選言で受理していたため、抽出が常に失敗しても成立していた。成功のみを主張する。
    // 待ち時間の上限は Claude Vision 試行（REQ-24.2）を含むパイプライン全体に対するものである
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(90000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);
    await expect(extractedText).not.toBeEmpty();

    // REQ-17.7: 実行中は処理中インジケーターが表示されていた
    expect(
      await hasOcrProgressIndicatorAppeared(page),
      'PDFテキスト抽出中の処理中インジケーターが一度も表示されなかった'
    ).toBe(true);

    // 終端後に処理中インジケーターが残っていないこと（タイムアウト制御が後始末まで行う）
    await expect(page.locator('[data-testid="ocr-progress-indicator"]')).toBeHidden({
      timeout: getTimeout(10000),
    });
  });

  // ============================================================================
  // テストデータクリーンアップ
  // ============================================================================

  test('テストデータをクリーンアップする', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // 認証トークン取得（localStorageから取得）
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

    // 見積依頼の削除
    if (createdEstimateRequestId) {
      await page.request.delete(
        `${API_BASE_URL}/api/estimate-requests/${createdEstimateRequestId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    }

    // 内訳書の削除
    if (createdItemizedStatementId) {
      await page.request.delete(
        `${API_BASE_URL}/api/itemized-statements/${createdItemizedStatementId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    }

    // 取引先の削除
    if (createdTradingPartnerId) {
      await page.request.delete(`${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    // プロジェクトの削除
    if (createdProjectId) {
      await page.request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });
});
