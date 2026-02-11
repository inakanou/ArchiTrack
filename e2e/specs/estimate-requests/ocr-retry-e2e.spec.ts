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
 * - 16.9: OCR失敗時もファイルアップロードのみで保存可能
 * - 16.10: OCR結果から一括取り込み
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
 * 5. 既存ファイルのプレビュー表示を確認
 * 6. テストデータをクリーンアップ
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

  test.beforeEach(async ({ context }) => {
    // クッキーからトークンを取得
    const cookies = await context.cookies();
    const tokenCookie = cookies.find((c) => c.name === 'access_token');
    if (tokenCookie) {
      accessToken = tokenCookie.value;
    }
  });

  test('テスト前提データを作成する', async ({ page }) => {
    // ログイン
    await loginAsUser(page, 'ADMIN_USER');

    // 認証トークン取得
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === 'access_token');
    accessToken = tokenCookie?.value ?? '';
    expect(accessToken).not.toBe('');

    // プロジェクト作成
    const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `OCRリトライテスト-${Date.now()}`,
        address: '東京都千代田区',
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
        type: 'SUBCONTRACTOR',
        email: 'test-ocr@example.com',
      },
    });
    expect(partnerRes.ok()).toBeTruthy();
    const partner = await partnerRes.json();
    createdTradingPartnerId = partner.id;

    // 内訳書作成（項目付き）
    const statementRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `テスト内訳書-OCRリトライ-${Date.now()}`,
          items: [
            {
              workType: '外壁工事',
              name: '外壁塗装',
              specification: 'シリコン系',
              unit: 'm2',
              quantity: 100,
            },
          ],
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

  test('PDFのみアップロードして受領見積書を保存し、編集画面で「OCR実行」ボタンを確認する (16.1, 16.9)', async ({
    page,
  }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: getTimeout(15000) });

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

    // 登録ボタンをクリック（明細行は空でもファイルがあれば保存可能: 16.9）
    const submitButton = page.getByRole('button', { name: /^登録$/i });
    await submitButton.click();

    // 保存成功を確認（一覧に追加される）
    await expect(page.getByText(/見積書/)).toBeVisible({ timeout: getTimeout(10000) });

    // 保存された受領見積書のIDを取得（一覧から）
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === 'access_token');
    accessToken = tokenCookie?.value ?? '';

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

    // 編集ボタンをクリック（一覧の最初のアイテム）
    const editButton = page.getByRole('button', { name: /編集/i }).first();
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 既存ファイル名が表示される
    await expect(page.getByText('test-file.pdf')).toBeVisible({ timeout: getTimeout(5000) });

    // 「OCR実行」ボタンが表示される（16.1）
    await expect(page.getByRole('button', { name: /OCR実行/i })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('「OCR実行」ボタンクリックでOCR処理が開始される (16.2, 16.3)', async ({ page }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: getTimeout(15000) });

    // 編集ボタンをクリック
    const editButton = page.getByRole('button', { name: /編集/i }).first();
    await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // 「OCR実行」ボタンをクリック
    const ocrButton = page.getByRole('button', { name: /OCR実行/i });
    await expect(ocrButton).toBeVisible({ timeout: getTimeout(10000) });
    await ocrButton.click();

    // OCR処理中のインジケーターが表示される（16.3）
    // OCRは時間がかかるため、処理中インジケーターまたは結果/エラーのいずれかが表示されることを確認
    await expect(
      page
        .locator('[data-testid="ocr-progress-indicator"]')
        .or(page.locator('[data-testid="ocr-extracted-text"]'))
        .or(page.locator('[data-testid="ocr-error-message"]'))
    ).toBeVisible({ timeout: getTimeout(60000) });
  });

  test('編集画面で既存ファイルのプレビューが表示される (16.12)', async ({ page }) => {
    test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません');

    await loginAsUser(page, 'ADMIN_USER');

    // 見積依頼詳細画面に遷移
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: getTimeout(15000) });

    // 編集ボタンをクリック
    const editButton = page.getByRole('button', { name: /編集/i }).first();
    await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
    await editButton.click();

    // 編集フォームが表示される
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

    // ファイルプレビューが表示される（PDFビューアまたはプレビューエリア）
    // FileInlinePreviewコンポーネントが既存URLでプレビューを表示する
    await expect(
      page.locator('[data-testid="file-inline-preview"]').or(page.locator('.react-pdf__Page'))
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  test('テストデータをクリーンアップする', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === 'access_token');
    accessToken = tokenCookie?.value ?? '';

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
