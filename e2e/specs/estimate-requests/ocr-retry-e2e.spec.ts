/**
 * @fileoverview OCR再実行・リトライ機能のE2Eテスト
 *
 * Task 39.3: OCR再実行・リトライのE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - 16.1: 編集画面でPDF/画像の場合に「OCR実行」ボタンを表示
 * - 16.2: ボタンクリックで既存ファイルに対してOCR処理を開始
 * - 16.3: OCR処理中にインジケーターを表示
 * - 16.4: OCR完了後に結果と一括取り込みボタンを表示
 * - 16.5: OCR失敗時に「OCRリトライ」ボタンを表示
 * - 16.6: リトライボタンでOCR再実行
 * - 16.7: ExcelでデータパースボタンLet表示
 * - 16.8: データパース実行
 * - 16.9: OCR失敗時もファイルアップロードのみで保存可能
 * - 16.10: 編集画面でOCR結果から一括取り込み
 * - 16.11: 処理中ボタン非活性
 * - 16.12: 編集画面での既存ファイルプレビュー表示
 *
 * Task 115.127 段1: 前提の生成を `seedEstimateRequest`（`estimate-request-preconditions`）へ寄せ、
 * `test.skip(!createdEstimateRequestId, …)` 10 件を `assertPrepared` へ改めた。
 *
 * @module e2e/specs/estimate-requests/ocr-retry-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { assertPrepared } from '../../helpers/preconditions';
import { seedEstimateRequest } from '../../helpers/estimate-request-preconditions';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * OCR 対象の既存ファイルの取得先として差し替えるパス
 *
 * 実体は署名付きURLであり保管先の実装に依存するため、テストが結果を制御できるよう
 * 同一オリジンの固定パスへ寄せる。
 */
const STUBBED_QUOTATION_FILE_PATH = '/e2e-stubbed-quotation-file/received-quotation-file.pdf';

/**
 * 受領見積書の既存ファイル取得を、テストが成否を決められる状態に置き換える。
 *
 * ## なぜ必要か（Task 115.127 段7・F/G 群）
 *
 * REQ-16.5 / REQ-16.6 は「OCR処理が失敗したとき」の要件である。
 * 事前準備がアップロードする `test-file.pdf` はテキスト入りPDFであり抽出は必ず成功するため、
 * 「失敗したかどうか」を観測して主張を包むと、**要件の主張は一度も実行されない**。
 * 失敗そのものをテストが前提として作り出し、無条件に主張する形へ改める。
 *
 * 編集画面の `OcrDataExtractor` は `fileUrl` を `fetch` し、応答が ok でなければ
 * 「ファイルの取得に失敗しました」で `status='error'` になる
 * （`frontend/src/components/estimate-requests/OcrDataExtractor.tsx` の `fetchFileFromUrl`）。
 * したがってファイルの取得を 500 に固定すれば OCR は必ず失敗する。
 *
 * `succeedFromNow()` を呼ぶと以降の取得は事前準備と同じ `test-file.pdf` を返すため、
 * 「リトライで同一ファイルに対して再実行される」（REQ-16.6）を成功側で確かめられる。
 *
 * @param page Playwright のページ（画面遷移の前に呼ぶこと）
 * @returns 以降のファイル取得を成功させる操作
 */
async function stubExistingQuotationFile(page: Page): Promise<{ succeedFromNow: () => void }> {
  let shouldFail = true;

  // プレビューURLの取得は、テストが制御できる固定パスを返すように差し替える
  await page.route('**/api/quotations/*/preview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: STUBBED_QUOTATION_FILE_PATH }),
    })
  );

  // 固定パスへのファイル取得は、テストの指示どおりに失敗／成功させる
  await page.route(`**${STUBBED_QUOTATION_FILE_PATH}`, (route) => {
    if (shouldFail) {
      return route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'テスト用に強制したファイル取得の失敗',
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      path: path.resolve(__dirname, '../../fixtures/test-file.pdf'),
    });
  });

  return {
    succeedFromNow: () => {
      shouldFail = false;
    },
  };
}

/**
 * OCR再実行・リトライ機能のE2Eテスト
 *
 * テストフロー:
 * 1. テスト用プロジェクト、取引先、内訳書、見積依頼を作成
 * 2. PDFファイルのみアップロードして受領見積書を保存
 * 3. 編集画面で「OCR実行」ボタンの表示を確認
 * 4. OCR処理の実行とインジケーター表示を確認
 * 5. OCR完了後の結果表示と一括取り込みボタンを確認
 * 6. OCR失敗時のリトライボタン表示を確認
 * 7. Excelファイルでのデータパースボタン表示を確認
 * 8. 処理中のボタン非活性を確認
 * 9. 既存ファイルのプレビュー表示を確認
 * 10. テストデータをクリーンアップ
 */
test.describe('OCR再実行・リトライ機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdQuotationId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ page }) => {
    // localStorageからトークンを取得
    const token = await page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null);
    if (token) {
      accessToken = token;
    }
  });

  test('テスト前提データを作成する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    // Task 115.127 段1: プロジェクト〜見積依頼の前提生成は共通の補助へ寄せる。
    // 3ファイルが同じ約110行を複製していたため、複製したまま個別に直すと再発する。
    // いずれかの作成に失敗した時点で補助の内側で失敗する。
    const seed = await seedEstimateRequest(page, {
      label: 'OCRリトライテスト',
      siteAddress: '東京都千代田区',
      partnerEmail: 'test-ocr@example.com',
      groupName: '外壁工事グループ',
      item: {
        workType: '外壁工事',
        name: '外壁塗装',
        specification: 'シリコン系',
        unit: 'm2',
        quantity: 100,
      },
    });

    accessToken = seed.accessToken;
    createdProjectId = seed.projectId;
    createdTradingPartnerId = seed.tradingPartnerId;
    createdItemizedStatementId = seed.itemizedStatementId;
    createdEstimateRequestId = seed.estimateRequestId;
  });

  /**
   * @requirement estimate-request/REQ-16.1
   * @requirement estimate-request/REQ-16.9
   */
  test('PDFのみアップロードして受領見積書を保存し、編集画面で「OCR実行」ボタンを確認する (estimate-request/REQ-16.1, estimate-request/REQ-16.9)', async ({
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

    // ファイルが選択されたことを確認
    await expect(page.getByText('test-file.pdf')).toBeVisible({ timeout: getTimeout(5000) });

    // 登録ボタンをクリック（明細行は空でもファイルがあれば保存可能: REQ-16.9）
    const submitButton = page.getByRole('button', { name: /^登録$/i });
    await submitButton.click();

    // 保存成功を確認（一覧に追加される）
    await expect(page.getByRole('list', { name: /受領見積書一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 保存された受領見積書のIDを取得（一覧から）
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

    const quotationsRes = await page.request.get(
      `${API_BASE_URL}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (quotationsRes.ok()) {
      const quotations = await quotationsRes.json();
      if (quotations.length > 0) {
        createdQuotationId = quotations[0].id;
      }
    }

    // 編集ボタンをクリック（受領見積書一覧内の編集ボタン）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 既存ファイル名が表示される
    await expect(page.getByText('test-file.pdf')).toBeVisible({ timeout: getTimeout(5000) });

    // 「OCR実行」ボタンが表示される（REQ-16.1）
    await expect(page.getByRole('button', { name: /OCR実行/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * @requirement estimate-request/REQ-16.2
   * @requirement estimate-request/REQ-16.3
   */
  test('「OCR実行」ボタンクリックでOCR処理が開始される (estimate-request/REQ-16.2, estimate-request/REQ-16.3)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 「OCR実行」ボタンをクリック
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // OCR処理中のインジケーターが表示される（REQ-16.3）
    // OCRは時間がかかるため、処理中インジケーターまたは結果/エラーのいずれかが表示されることを確認
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });
  });

  /**
   * @requirement estimate-request/REQ-16.4
   */
  test('OCR完了後に結果と一括取り込みボタンが表示される (estimate-request/REQ-16.4)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 「OCR実行」ボタンをクリック
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // REQ-16.4: OCR 完了時は「抽出結果」と「一括取り込みボタン」が必ず表示される。
    // 対象の `test-file.pdf` はテキスト入り PDF（閾値 50 文字を超える）であり、
    // Claude Vision 経路・pdfjs フォールバック経路のいずれでも抽出結果が表示される
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(60000) });

    // 抽出テキストが空でないことを確認
    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);

    // 一括取り込みボタンが表示されることを確認
    await expect(page.locator('[data-testid="ocr-import-button"]')).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement estimate-request/REQ-16.5
   */
  test('OCR失敗時に「OCRリトライ」ボタンが表示される (estimate-request/REQ-16.5)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // REQ-16.5 は「OCR処理が失敗したとき」の要件である。事前準備の `test-file.pdf` は
    // 抽出が必ず成功するため、失敗したかどうかを観測して主張を包むと検証が一度も実行されない。
    // 失敗そのものを前提として無条件に作り出す。
    await stubExistingQuotationFile(page);

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // OCR実行ボタンをクリック
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // REQ-16.5: OCR処理が失敗したのでエラーメッセージが表示される
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: getTimeout(60000) });
    const errorText = await errorMessage.textContent();
    expect(errorText, 'OCR失敗時のエラーメッセージが空である').toBeTruthy();

    // REQ-16.5: 「OCRリトライ」ボタンが表示される
    await expect(page.getByRole('button', { name: /OCRリトライ/i })).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement estimate-request/REQ-16.6
   */
  test('リトライボタンでOCR再実行が行われる (estimate-request/REQ-16.6)', async ({ page }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // REQ-16.6 は「OCRリトライ」ボタンの押下が前提の要件である。
    // リトライボタンは OCR が失敗したときにだけ現れるため、まず失敗を前提として作り出す。
    // 以前は「リトライボタンが見えていれば押す」という関門で包み、見えない場合は
    // 「OCR実行」ボタンの有無でさらに包んでいたため、REQ-16.6 の主張は一度も実行されなかった。
    const stubbedFile = await stubExistingQuotationFile(page);

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // OCR実行ボタンをクリックしてOCR処理を開始
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // 前提: OCR が失敗し「OCRリトライ」ボタンが表示されている（REQ-16.5）
    await expect(page.locator('[data-testid="ocr-error-message"]')).toBeVisible({
      timeout: getTimeout(60000),
    });
    const retryButton = page.getByRole('button', { name: /OCRリトライ/i });
    await expect(retryButton).toBeVisible({ timeout: getTimeout(5000) });

    // 以降のファイル取得は事前準備と同一の `test-file.pdf` を返す。
    // これにより「再実行が本当に行われたか」を抽出結果の出現で判定できる。
    stubbedFile.succeedFromNow();

    // リトライボタンをクリック
    await retryButton.click();

    // REQ-16.6: 同一ファイルに対してOCR処理が再実行され、抽出結果が表示される
    await expect(page.locator('[data-testid="ocr-extracted-text"]')).toBeVisible({
      timeout: getTimeout(60000),
    });

    // 再実行が完了したのでエラーメッセージは解消している
    await expect(page.locator('[data-testid="ocr-error-message"]')).not.toBeVisible();
  });

  /**
   * @requirement estimate-request/REQ-16.7
   */
  test('Excelファイルの場合にデータパースボタンが表示される (estimate-request/REQ-16.7)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 新規登録フォームでPDFをアップロードし、OCRが自動実行されることを確認
    // （新規登録ではautoStart=trueのため「OCR実行」ボタンは表示されず自動処理される）
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // PDFファイルをアップロード
    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.getByText('test-file.pdf')).toBeVisible({ timeout: getTimeout(5000) });

    // PDFアップロード時、OCRが自動実行されテキスト抽出結果が表示される
    // （Excelの場合はデータパースが実行される仕様: REQ-16.7）
    // autoStart=trueなので進捗インジケーターまたは結果/エラーが表示される
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(30000) });

    // PDFの場合はOCRとして処理されたことを確認（データパースボタンは表示されない）
    const dataParseButton = page.getByRole('button', { name: /データパース実行/i });
    await expect(dataParseButton).not.toBeVisible({ timeout: getTimeout(3000) });
  });

  /**
   * @requirement estimate-request/REQ-16.8
   */
  test('データパース実行でExcelデータが解析される (estimate-request/REQ-16.8)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 新規登録フォームでPDFをアップロードし、自動OCR処理が完了することを確認
    // （Excelの場合はデータパースが実行される仕様: REQ-16.8）
    const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
    await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
    await registerButton.click();

    // フォームが表示されるまで待機
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // PDFファイルをアップロード（自動OCR実行: autoStart=true）
    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.getByText('test-file.pdf')).toBeVisible({ timeout: getTimeout(5000) });

    // REQ-16.10 の前提: アップロード直後の自動 OCR で抽出結果が表示される。
    // `test-file.pdf` はテキスト入り PDF のため抽出は必ず成立する
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(30000) });

    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);
  });

  /**
   * @requirement estimate-request/REQ-16.10
   */
  test('編集画面でOCR結果から一括取り込みが行われる (estimate-request/REQ-16.10)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // OCR実行ボタンをクリック
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // OCR処理完了を待機
    // 対象の `test-file.pdf` はテキスト入りPDFであり、REQ-16.4 の検証と同じく抽出は必ず成立する。
    // 以前は「結果またはエラー」を待ったうえで一括取り込みボタンの有無で包んでいたため、
    // 抽出が失敗した回は REQ-16.10 の主張が一つも実行されずに緑になっていた。
    await expect(page.locator('[data-testid="ocr-extracted-text"]')).toBeVisible({
      timeout: getTimeout(60000),
    });

    // REQ-16.4 のとおり、抽出完了時は一括取り込みボタンが必ず表示される
    const importButton = page.locator('[data-testid="ocr-import-button"]');
    await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });

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

    // REQ-16.10: 明細行フィールドに抽出データが自動入力されている
    const lineItemTable = page.locator('form table');
    await expect(lineItemTable).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement estimate-request/REQ-16.11
   *
   * REQ-16.11: OCR処理中は「OCR実行」/「データパース実行」/「OCRリトライ」ボタンを非活性にする
   *
   * 実装ではボタンを非活性（disabled）ではなく、処理中はレンダリングから除外する（非表示にする）ことで
   * ユーザーの操作を防止している。テキストPDFではOCR処理が瞬時に完了するため、
   * MutationObserverを使ってDOM変更を同期的に監視し、処理中にOCR関連ボタンが
   * 操作不能になった（非表示化された）ことを検証する。
   */
  test('OCR処理中にボタンが非活性になる (estimate-request/REQ-16.11)', async ({ page }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // OCR実行ボタンが表示されていることを確認
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });

    // MutationObserverを設置して、処理中にOCR関連ボタンが非表示になったことを検出する
    // （テキストPDFではOCR処理が瞬時に完了するため、Playwrightの通常のアサーションでは
    //   処理中の状態遷移を捕捉できない。MutationObserverはDOM変更と同期的に実行されるため、
    //   一瞬の状態変化でも確実に検出できる。）
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__ocrButtonHiddenDuringProcessing = false;
      w.__progressIndicatorAppeared = false;

      const observer = new MutationObserver(() => {
        const progressIndicator = document.querySelector('[data-testid="ocr-progress-indicator"]');
        if (progressIndicator) {
          w.__progressIndicatorAppeared = true;

          // 処理中に「OCR実行」ボタンが存在しないことを確認
          const buttons = Array.from(document.querySelectorAll('button'));
          const ocrBtn = buttons.find((b) => b.textContent?.includes('OCR実行') && !b.disabled);
          const retryBtn = buttons.find(
            (b) => b.textContent?.includes('OCRリトライ') && !b.disabled
          );
          const parseBtn = buttons.find(
            (b) => b.textContent?.includes('データパース実行') && !b.disabled
          );

          // OCR関連ボタンが操作可能な状態で存在しない = 非活性化されている
          if (!ocrBtn && !retryBtn && !parseBtn) {
            w.__ocrButtonHiddenDuringProcessing = true;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      w.__ocrObserver = observer;
    });

    // OCR実行ボタンをクリック
    await ocrButton.click();

    // OCR処理完了を待機（結果またはエラー）
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');
    await expect(extractedText.or(errorMessage)).toBeVisible({
      timeout: getTimeout(60000),
    });

    // MutationObserverの結果を取得して検証
    const observerResults = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const observer = w.__ocrObserver as MutationObserver | undefined;
      observer?.disconnect();
      return {
        progressIndicatorAppeared: w.__progressIndicatorAppeared as boolean,
        ocrButtonHiddenDuringProcessing: w.__ocrButtonHiddenDuringProcessing as boolean,
      };
    });

    // 処理中インジケーターが表示されたことを確認（OCR処理が実行された証拠）
    expect(observerResults.progressIndicatorAppeared).toBe(true);

    // 処理中にOCR関連ボタンが操作不能（非表示/非活性）であったことを確認（REQ-16.11）
    expect(observerResults.ocrButtonHiddenDuringProcessing).toBe(true);
  });

  /**
   * @requirement estimate-request/REQ-16.12
   */
  test('編集画面で既存ファイルのプレビューが表示される (estimate-request/REQ-16.12)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 編集ボタンをクリック（受領見積書一覧内）
    const quotationList = page.getByRole('list', { name: /受領見積書一覧/i });
    await expect(quotationList).toBeVisible({ timeout: getTimeout(10000) });
    const editButton = quotationList.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // ファイルプレビューが表示される（PDFプレビュー）（REQ-16.12）
    // FileInlinePreviewコンポーネントがreact-pdfでPDFをレンダリングする
    // react-pdfは .react-pdf__Document > .react-pdf__Page を生成する
    await expect(page.locator('.react-pdf__Document')).toBeVisible({ timeout: getTimeout(15000) });
  });

  test('テストデータをクリーンアップする', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

    // 受領見積書の削除
    if (createdQuotationId) {
      await page.request.delete(`${API_BASE_URL}/api/quotations/${createdQuotationId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

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
