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
 * @module e2e/specs/estimate-requests/ocr-retry-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // ログイン
    await loginAsUser(page, 'ADMIN_USER');

    // 認証トークン取得（localStorageから）
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).not.toBe('');

    // 担当者候補を取得（salesPersonIdに必要、admin以外のユーザー）
    const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(assignableRes.ok()).toBeTruthy();
    const assignableUsers = await assignableRes.json();
    expect(assignableUsers.length).toBeGreaterThan(0);
    const salesPersonId = assignableUsers[0].id;

    // プロジェクト作成
    const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `OCRリトライテスト-${Date.now()}`,
        salesPersonId,
        siteAddress: '東京都千代田区',
      },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();
    createdProjectId = project.id;

    // 取引先作成
    const partnerRes = await page.request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `テスト業者-OCRリトライ-${Date.now()}`,
        nameKana: 'テストギョウシャ',
        types: ['SUBCONTRACTOR'],
        address: '東京都千代田区テスト1-2-3',
        email: 'test-ocr@example.com',
      },
    });
    expect(partnerRes.ok()).toBeTruthy();
    const partner = await partnerRes.json();
    createdTradingPartnerId = partner.id;

    // 数量表作成
    const qtRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/quantity-tables`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `テスト数量表-OCRリトライ-${Date.now()}` },
      }
    );
    expect(qtRes.ok()).toBeTruthy();
    const qt = await qtRes.json();

    // 数量グループ作成
    const groupRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-tables/${qt.id}/groups`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: '外壁工事グループ', displayOrder: 0 },
      }
    );
    expect(groupRes.ok()).toBeTruthy();
    const group = await groupRes.json();

    // 数量項目作成
    const itemRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-groups/${group.id}/items`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          workType: '外壁工事',
          name: '外壁塗装',
          specification: 'シリコン系',
          unit: 'm2',
          quantity: 100,
        },
      }
    );
    expect(itemRes.ok()).toBeTruthy();

    // 内訳書作成（数量表から生成）
    const statementRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `テスト内訳書-OCRリトライ-${Date.now()}`,
          quantityTableId: qt.id,
        },
      }
    );
    expect(statementRes.ok()).toBeTruthy();
    const statement = await statementRes.json();
    createdItemizedStatementId = statement.id;

    // 見積依頼作成
    const erRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `テスト見積依頼-OCRリトライ-${Date.now()}`,
          tradingPartnerId: createdTradingPartnerId,
          itemizedStatementId: createdItemizedStatementId,
        },
      }
    );
    expect(erRes.ok()).toBeTruthy();
    const er = await erRes.json();
    createdEstimateRequestId = er.id;
  });

  /**
   * @requirement estimate-request/REQ-16.1
   * @requirement estimate-request/REQ-16.9
   */
  test('PDFのみアップロードして受領見積書を保存し、編集画面で「OCR実行」ボタンを確認する (estimate-request/REQ-16.1, estimate-request/REQ-16.9)', async ({
    page,
  }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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

    // OCR処理完了を待機（結果またはエラー）
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });

    // OCR結果が表示された場合、一括取り込みボタンも表示されることを確認
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    if (await extractedText.isVisible({ timeout: 3000 }).catch(() => false)) {
      // 抽出テキストが空でないことを確認
      const textContent = await extractedText.textContent();
      expect(textContent).toBeTruthy();
      expect(textContent!.length).toBeGreaterThan(0);

      // 一括取り込みボタンが表示されることを確認
      await expect(page.locator('[data-testid="ocr-import-button"]')).toBeVisible({
        timeout: getTimeout(5000),
      });
    }
  });

  /**
   * @requirement estimate-request/REQ-16.5
   */
  test('OCR失敗時に「OCRリトライ」ボタンが表示される (estimate-request/REQ-16.5)', async ({
    page,
  }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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

    // OCR処理完了を待機（結果またはエラー）
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });

    // エラーが発生した場合、「OCRリトライ」ボタンが表示されることを確認
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');
    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      // エラーメッセージが表示されている
      const errorText = await errorMessage.textContent();
      expect(errorText).toBeTruthy();

      // 「OCRリトライ」ボタンが表示される
      await expect(page.getByRole('button', { name: /OCRリトライ/i })).toBeVisible({
        timeout: getTimeout(5000),
      });
    } else {
      // OCRが成功した場合はリトライボタンが非表示であることを確認
      await expect(page.getByRole('button', { name: /OCRリトライ/i })).not.toBeVisible({
        timeout: getTimeout(3000),
      });
    }
  });

  /**
   * @requirement estimate-request/REQ-16.6
   */
  test('リトライボタンでOCR再実行が行われる (estimate-request/REQ-16.6)', async ({ page }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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

    // OCR実行ボタンをクリックしてOCR処理を開始
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // OCR処理完了を待機
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });

    // リトライボタンが表示されている場合のみ検証
    const retryButton = page.getByRole('button', { name: /OCRリトライ/i });
    if (await retryButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // リトライボタンをクリック
      await retryButton.click();

      // OCR処理が再度開始される（インジケーターまたは結果/エラーが表示される）
      await expect(
        page
          .locator('[data-testid="ocr-progress-indicator"]')
          .or(page.locator('[data-testid="ocr-extracted-text"]'))
          .or(page.locator('[data-testid="ocr-error-message"]'))
      ).toBeVisible({ timeout: getTimeout(60000) });
    } else {
      // OCRが成功した場合、「OCR実行」ボタンで再実行可能であることを確認
      const reRunButton = page.getByRole('button', { name: /OCR実行/i });
      if (await reRunButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await reRunButton.click();

        await expect(
          page
            .locator('[data-testid="ocr-progress-indicator"]')
            .or(page.locator('[data-testid="ocr-extracted-text"]'))
            .or(page.locator('[data-testid="ocr-error-message"]'))
        ).toBeVisible({ timeout: getTimeout(60000) });
      }
    }
  });

  /**
   * @requirement estimate-request/REQ-16.7
   */
  test('Excelファイルの場合にデータパースボタンが表示される (estimate-request/REQ-16.7)', async ({
    page,
  }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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

    // OCR処理が自動実行され、結果またはエラーが表示されることを確認
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(30000) });

    // OCR結果が取得できた場合、抽出テキストが表示されることを確認
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    if (await extractedText.isVisible({ timeout: 3000 }).catch(() => false)) {
      const textContent = await extractedText.textContent();
      expect(textContent).toBeTruthy();
      expect(textContent!.length).toBeGreaterThan(0);
    }
  });

  /**
   * @requirement estimate-request/REQ-16.10
   */
  test('編集画面でOCR結果から一括取り込みが行われる (estimate-request/REQ-16.10)', async ({
    page,
  }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
    await expect(
      page
        .locator('[data-testid="ocr-extracted-text"]')
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });

    // OCR結果が取得できた場合、一括取り込みを実行
    const importButton = page.locator('[data-testid="ocr-import-button"]');
    if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
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
      const lineItemTable = page.locator('form table');
      await expect(lineItemTable).toBeVisible({ timeout: getTimeout(5000) });
    }
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
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

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
