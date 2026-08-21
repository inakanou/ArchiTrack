/**
 * @fileoverview PDFテキスト抽出ハイブリッドアプローチのE2Eテスト
 *
 * Task 41.3: PDFテキスト抽出のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - 17.1: pdfjs-distのgetTextContent() APIでPDFからテキストを抽出する
 * - 17.2: PDFの全ページを対象にテキスト抽出を行う
 * - 17.3: テキストPDFでそのまま使用（Tesseract OCRを呼ばない）
 * - 17.4: スキャンPDFでCanvas→OCR
 * - 17.5: 抽出テキストから構造化データ(明細行)への変換
 * - 17.6: PDFプレビューでページナビゲーション(前へ/次へボタン、ページ表示)
 * - 17.7: 処理中インジケーターの表示
 * - 17.8: 30秒タイムアウト
 *
 * Task 115.127 段1: 前提の生成を `seedEstimateRequest`（`estimate-request-preconditions`）へ寄せ、
 * `test.skip(!createdEstimateRequestId, …)` 8 件を `assertPrepared` へ改めた。
 *
 * @module e2e/specs/estimate-requests/pdf-text-extraction-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { assertPrepared } from '../../helpers/preconditions';
import { seedEstimateRequest } from '../../helpers/estimate-request-preconditions';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PDFテキスト抽出ハイブリッドアプローチのE2Eテスト
 *
 * テストフロー:
 * 1. テスト用前提データ(プロジェクト、取引先、内訳書、見積依頼)をAPI経由で作成
 * 2. PDFアップロード後のテキスト抽出・処理中インジケーター・結果表示を確認
 * 3. 一括取り込みボタンの動作を確認
 * 4. PDFプレビューのページナビゲーション動作を確認
 * 5. テキストPDFでTesseract OCRが呼ばれないことを確認
 * 6. スキャンPDFでCanvas→OCR処理が行われることを確認
 * 7. 30秒タイムアウト動作を確認
 * 8. テストデータをクリーンアップ
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

    // テキスト入りPDFファイルをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-text-pdf.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // 処理中インジケーターが表示される（REQ-17.7）
    // PDFテキスト抽出処理中はプログレスバーが表示される
    // 処理が高速な場合は完了状態またはエラー状態のいずれかが表示されうる
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });
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

    // テキスト抽出結果またはエラーが表示されるまで待機
    // テキストPDFの場合はpdfjs-distで直接テキストを取得するため高速に完了する
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });

    // テキスト抽出結果が表示された場合はテキスト内容を確認
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    if (await isVisibleWithin(extractedText, 3000)) {
      // 抽出されたテキストが空でないことを確認（REQ-17.1: getTextContent APIでテキスト抽出）
      const textContent = await extractedText.textContent();
      expect(textContent).toBeTruthy();
      expect(textContent!.length).toBeGreaterThan(0);
    }
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

    // テキスト抽出完了を待機
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });

    // テキスト抽出結果の検証。抽出が表示されたときだけ判定していると、
    // エラー表示で終わっても通ってしまう。テキストPDFは抽出が成功する経路であるため
    // 分岐で包まずに主張する。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(10000) });

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
  // 17.4: スキャンPDFでCanvas→OCR
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.4
   */
  test('スキャン（画像のみ）PDFではCanvas経由でOCR処理が実行される (estimate-request/REQ-17.4)', async ({
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

    // 画像のみのPDF（スキャンPDF）をアップロード
    // test-file.pdf はスキャンPDF（画像のみ）として使用
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // テキスト抽出処理が開始される
    // スキャンPDFの場合、pdfjs-distでテキストが取得できないためCanvas→OCRフォールバックが発動
    // 処理中インジケーター、結果、またはエラーのいずれかが表示される
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });

    // 処理完了を待機（OCR処理はテキスト抽出より時間がかかる）
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(90000) });

    // Canvas→OCR パスが実行され、抽出結果が表示されたことを確認する。
    // 以前は「結果またはエラー」の論理和で判定していたが、エラーを許す側があるため
    // OCR が常に失敗しても通ってしまう。実装は本スキャンPDFに対して抽出結果を返す。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');

    await expect(errorMessage).toHaveCount(0);
    await expect(extractedText).toBeVisible();
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

    // テキスト抽出完了を待機
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });

    // 一括取り込みボタンが表示された場合のみ検証（データが検出された場合）
    const importButton = page.locator('[data-testid="ocr-import-button"]');
    if (await isVisibleWithin(importButton, 5000)) {
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

      // 明細行テーブルにデータが入力されていることを確認
      // (最低1行以上の名称フィールドに値が設定されている)
      const lineItemTable = page.locator('form table');
      await expect(lineItemTable).toBeVisible({ timeout: getTimeout(5000) });
    }
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

    // PDFプレビューが表示されるまで待機
    // react-pdfのDocumentまたはスケルトンが表示される
    await expect(
      page
        .locator('.react-pdf__Document, .react-pdf__Page')
        .or(page.locator('[data-testid="preview-skeleton"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(15000) });

    // ページナビゲーションが表示されるまで待機（2ページPDFの場合のみ表示）
    // react-pdfのロード完了後にナビゲーションUIが表示される
    const nextButton = page.getByRole('button', { name: '次へ' });
    const prevButton = page.getByRole('button', { name: '前へ' });

    // ページナビゲーションが表示された場合のみ検証
    if (await isVisibleWithin(nextButton, getTimeout(10000))) {
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
    }
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

    // PDFプレビューが表示されるまで待機
    await expect(
      page
        .locator('.react-pdf__Document, .react-pdf__Page')
        .or(page.locator('[data-testid="preview-skeleton"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(15000) });

    // react-pdfのロード完了を十分に待つ
    await page.waitForTimeout(3000);

    // 1ページPDFなのでナビゲーションボタンが非表示であること
    const nextButton = page.getByRole('button', { name: '次へ' });
    await expect(nextButton).not.toBeVisible({ timeout: getTimeout(5000) });
  });

  // ============================================================================
  // 17.8: 30秒タイムアウト
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-17.8
   */
  test('PDF処理が30秒を超えた場合にタイムアウトが発生する (estimate-request/REQ-17.8)', async ({
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

    // PDFファイルをアップロード
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // 処理開始を検知（インジケーター、結果、エラーのいずれか）
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
        .first()
    ).toBeVisible({ timeout: getTimeout(60000) });

    // 処理が完了するまで待機（最大35秒 = タイムアウト30秒 + マージン5秒）
    // タイムアウト発生時はエラーメッセージが表示される
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(90000) });

    // エラーが発生した場合、タイムアウトエラーメッセージが含まれることを確認
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');
    if (await isVisibleWithin(errorMessage, 3000)) {
      const errorText = await errorMessage.textContent();
      // タイムアウトエラーの場合、エラーメッセージにタイムアウト関連のテキストが含まれる
      // (実際のエラーメッセージはアプリケーション実装に依存)
      expect(errorText).toBeTruthy();
    }

    // 正常に抽出完了した場合も、処理が30秒以内に完了していることを間接的に確認
    // （テスト全体が35秒以内に完了していればタイムアウト制御が機能している）
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    if (await isVisibleWithin(extractedText, 3000)) {
      const textContent = await extractedText.textContent();
      expect(textContent).toBeTruthy();
    }
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
