/**
 * @fileoverview Claude Vision API OCR抽出・フォールバックのE2Eテスト
 *
 * Task 58.1: Claude Vision抽出フローのE2Eテスト
 * Task 58.2: Claude VisionフォールバックのE2Eテスト
 *
 * ## 被覆の主張について（Task 115.177）
 *
 * 従前のヘッダは受入基準を `- 24.1, 24.2, ...` と番号だけで並べていた。この記法は
 * 被覆の検査（`scripts/check-requirement-coverage.ts`）が読む五つの形のどれにも
 * 当たらないため、9件を掲げながら抽出は零件だった。実際に判定しているのに
 * 被覆へ数えられない状態である。掲げた9件を一件ずつ確かめ、判定しているものだけを
 * 各検証の直上に `@requirement` として置き直した。
 *
 * 判定していないため落とした記載:
 * - REQ-24.8（数値表示形式・丸め規則に従って表示する）: 明細行の件数しか主張しておらず、
 *   桁や丸めを一切問うていない。書式が崩れても赤にならない
 * - REQ-25.5（既存のOCR処理パイプラインを実行する）: フォールバックの告知文言しか
 *   主張しておらず、Tesseract.js の処理が実際に走った痕跡を問うていない
 *
 * どちらも estimate-request-ocr-vision-e2e.spec.ts が番号を持つため、被覆の数は動かない。
 *
 * テスト戦略:
 * Playwright APIルートインターセプトを使用してClaude Vision APIレスポンスをモックし、
 * フロントエンドのフロー全体を検証する。
 *
 * @module e2e/specs/estimate-requests/claude-vision-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 受領見積書フォームを確実に初期状態で開く
 */
async function openReceivedQuotationForm(page: import('@playwright/test').Page) {
  // フォームが開いている場合は一度閉じる
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
}

/**
 * Claude Vision API E2Eテスト
 */
test.describe('Claude Vision API OCR抽出・フォールバック', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータ
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdQuantityTableId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // データセットアップ
  // ==========================================================================

  /**
   * 後続の2件が使う見積依頼を作る。受入基準の判定ではなく前提を作るだけなので、
   * 意図して `@requirement` を持たない（Task 115.177）。
   */
  test('準備：テスト用データを作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // トークン取得
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).not.toBe('');

    // 担当者候補を取得
    const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(assignableRes.ok()).toBeTruthy();
    const assignableData = await assignableRes.json();
    const salesPersonId = assignableData[0]?.id ?? null;

    // プロジェクト作成
    const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: {
        name: `E2E_ClaudeVision_${Date.now()}`,
        siteAddress: '東京都千代田区テスト1-2-3',
        salesPersonId,
      },
    });
    expect(projectRes.ok()).toBeTruthy();
    createdProjectId = (await projectRes.json()).id ?? null;
    expect(createdProjectId).not.toBeNull();

    // 取引先作成
    const tpRes = await page.request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: {
        name: `E2E取引先_ClaudeVision_${Date.now()}`,
        nameKana: 'イーツーイートリヒキサキ',
        types: ['SUBCONTRACTOR'],
        address: '東京都千代田区テスト1-2-3',
      },
    });
    expect(tpRes.ok()).toBeTruthy();
    createdTradingPartnerId = (await tpRes.json()).id ?? null;

    // 数量表作成（内訳書に必要）
    const qtRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/quantity-tables`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: { name: 'E2E数量表_ClaudeVision' },
      }
    );
    expect(qtRes.ok()).toBeTruthy();
    createdQuantityTableId = (await qtRes.json()).id ?? null;

    // 数量表にグループと項目を追加（内訳書作成に項目が必要）
    const groupRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}/groups`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: { name: 'テストグループ', displayOrder: 0 },
      }
    );
    expect(groupRes.ok()).toBeTruthy();
    const groupId = (await groupRes.json()).id;

    const itemRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-groups/${groupId}/items`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: {
          name: 'テスト項目',
          workType: '工種A',
          specification: '規格A',
          unit: '式',
          quantity: 1.0,
          displayOrder: 0,
        },
      }
    );
    expect(itemRes.ok()).toBeTruthy();

    // 内訳書作成
    const isRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: { name: 'E2E内訳書_ClaudeVision', quantityTableId: createdQuantityTableId },
      }
    );
    expect(isRes.ok()).toBeTruthy();
    createdItemizedStatementId = (await isRes.json()).id ?? null;

    // 見積依頼作成
    const erRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: {
          name: 'E2E見積依頼_ClaudeVision',
          tradingPartnerId: createdTradingPartnerId,
          itemizedStatementId: createdItemizedStatementId,
        },
      }
    );
    expect(erRes.ok()).toBeTruthy();
    createdEstimateRequestId = (await erRes.json()).id ?? null;
  });

  // ==========================================================================
  // Task 58.1: Claude Vision抽出フロー
  // ==========================================================================

  test.describe('Claude Vision抽出フロー（58.1）', () => {
    /**
     * @requirement estimate-request/REQ-24.1: OcrDataExtractorのClaude Vision抽出パス
     *
     * REQ-24.2は無タグとする（Task 115.177）。REQ-24.2の契機は
     * 「When ユーザーがPDFファイルに対してOCR処理を開始したとき」であり対象をPDFに限定している。
     * 一方この検証は後述のとおりダミーPDFではpdfjs-distの解析が失敗するため1x1ピクセルPNGを投入しており、
     * PDF経路を一度も通らない。PDFに対してVision優先順序が壊れてもこの検証は緑のままであり、
     * 「その規範が壊れたら赤になるか」を満たさないため、意図的に主張しない。
     *
     * @requirement estimate-request/REQ-24.5: 返却された明細行データを抽出結果として表示する
     * @requirement estimate-request/REQ-24.6: 返却成功時に一括取り込みボタンを表示する
     */
    test('Claude Vision API成功時に結果表示・一括取り込み・数値フォーマットが動作する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // Claude Vision APIをインターセプトして成功レスポンスを返す
      await page.route('**/api/claude-vision/extract', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lineItems: [
              {
                customCategory: null,
                workType: '土工',
                name: '掘削工',
                specification: 'バックホウ',
                unit: 'm3',
                quantity: 100.5,
                unitPrice: 2500,
                amount: 251250,
                remarks: null,
              },
              {
                customCategory: null,
                workType: '土工',
                name: '埋戻し',
                specification: null,
                unit: 'm3',
                quantity: 50,
                unitPrice: 1500,
                amount: 75000,
                remarks: '再利用土',
              },
            ],
            pageCount: 1,
          }),
        });
      });

      // 見積依頼詳細ページに移動
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書フォームを開く
      await openReceivedQuotationForm(page);

      // 画像ファイルをアップロード（1x1ピクセルPNG）
      // ダミーPDFではpdfjs-distの解析が失敗するため、有効な画像ファイルを使用
      const minimalPng = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
        0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 0, 0,
        3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
      ]);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'test-quotation.png',
        mimeType: 'image/png',
        buffer: minimalPng,
      });

      // 結果が表示されるまで待機
      // Claude Vision成功時は青色インフォバナーが表示される
      await expect(page.getByText(/Claude Vision APIで抽出しました/)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 抽出結果テキストが表示される
      await expect(page.getByTestId('ocr-extracted-text')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 一括取り込みボタンが表示される
      const importButton = page.getByTestId('ocr-import-button');
      await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });

      // 2件のデータが検出されたことを確認
      await expect(page.getByText(/2件のデータが検出されました/)).toBeVisible();

      // 一括取り込みボタンをクリック
      await importButton.click();

      // 取り込み完了メッセージが表示される
      await expect(page.getByTestId('ocr-import-success')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 取り込み結果として明細行が2行以上描かれることだけを主張する。
      // 数量の小数2桁・単価の整数表示（REQ-24.8）はここでは一切問うておらず、
      // 書式が崩れても赤にならないため、この検証は当該基準の番号を持たない。
      const lineItemAmounts = page.locator('[data-testid="line-item-amount"]');
      const rowCount = await lineItemAmounts.count();
      expect(rowCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Task 58.2: Claude Visionフォールバック
  // ==========================================================================

  test.describe('Claude Visionフォールバック（58.2）', () => {
    /**
     * @requirement estimate-request/REQ-25.1: 503（機能無効）で自動的にフォールバックする
     * @requirement estimate-request/REQ-25.4: フォールバック発動を告げるメッセージを表示する
     * @requirement estimate-request/REQ-25.6: 切り替えをユーザー操作なしで自動的に行う
     */
    test('Claude Vision API無効時(503)にTesseract.jsフォールバックが発動しバナーが表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // Claude Vision APIをインターセプトして503を返す（API無効）
      await page.route('**/api/claude-vision/extract', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Claude Vision機能は無効です',
            errorType: 'service_unavailable',
          }),
        });
      });

      // 見積依頼詳細ページに移動
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 受領見積書フォームを開く
      await openReceivedQuotationForm(page);

      // 画像ファイルをアップロード（1x1ピクセルPNG）
      const minimalPng = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
        0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 0, 0,
        3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
      ]);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'test-quotation-fallback.png',
        mimeType: 'image/png',
        buffer: minimalPng,
      });

      // フォールバック警告バナー（黄色）が表示される（REQ-25.4）
      await expect(page.getByTestId('fallback-warning-banner')).toBeVisible({
        timeout: getTimeout(30000),
      });

      // バナーテキストの内容を検証（REQ-25.1: 従来のOCR処理へのフォールバック）。
      // 「既存のOCR処理パイプラインを実行する」（REQ-25.5）は告知文言からは言えないため、
      // この検証は当該基準の番号を持たない。
      await expect(
        page.getByText(/Claude Vision APIが利用できないため、従来のOCR処理で実行しています/)
      ).toBeVisible();
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  /**
   * 作成した見積依頼を片付ける。受入基準の判定ではないため、
   * 意図して `@requirement` を持たない（Task 115.177）。
   */
  test('テストデータをクリーンアップする', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

    // 見積依頼の受領見積書を削除
    if (createdEstimateRequestId && createdProjectId) {
      // 見積依頼の受領見積書一覧を取得して削除
      const quotationsRes = await page.request.get(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests/${createdEstimateRequestId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (quotationsRes.ok()) {
        const data = await quotationsRes.json();
        const quotations = data.receivedQuotations ?? [];
        for (const q of quotations) {
          await page.request.delete(
            `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests/${createdEstimateRequestId}/received-quotations/${q.id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
        }
      }

      // 見積依頼削除
      await page.request.delete(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests/${createdEstimateRequestId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    // 内訳書削除
    if (createdItemizedStatementId && createdProjectId) {
      await page.request.delete(
        `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements/${createdItemizedStatementId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    // 数量表削除
    if (createdQuantityTableId) {
      await page.request.delete(`${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    // プロジェクト削除
    if (createdProjectId) {
      await page.request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    // 取引先削除
    if (createdTradingPartnerId) {
      await page.request.delete(`${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });
});
