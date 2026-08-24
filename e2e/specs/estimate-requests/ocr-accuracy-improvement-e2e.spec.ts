/**
 * @fileoverview OCR抽出結果のゴミ行フィルタ・集計行除外の統合確認E2Eテスト
 *
 * Task 48.1: スキャンPDF OCR精度改善（要件19・要件20）の統合確認テスト
 *
 * Requirements coverage (estimate-request):
 * - 20.1: 漢字・ひらがな・カタカナ・英数字を含まない行をゴミ行として除外
 * - 20.2: 文字数が極端に少ない行（2文字以下）をゴミ行として除外
 * - 20.3: 集計行キーワードを含む行を除外
 * - 20.5: ゴミ行フィルタと集計行除外の適用位置
 *
 * Task 115.135 の是正: 本ファイルが用いる `e2e/fixtures` の PDF は 2 件ともテキスト入りで
 * あり、スキャンPDFフォールバック経路（Canvas描画→画像前処理→Tesseract）へ到達しない。
 * したがって要件19の受入基準 19.1 / 19.6 / 19.8 は本ファイルでは検査できない。
 * 被覆済みと数えさせないため当該 3 件の `@requirement` タグを外し、
 * `e2e/requirement-exclusions.json` へ integration-test 区分で登録した。
 * E2E での被覆は後続タスク **115.157**「画像のみのPDFを用意しOCRフォールバック経路の
 * 被覆を実際に回復する」で回復し、同タスクが当該除外を解消する。
 *
 * テストフロー:
 * 1. テスト用前提データ(プロジェクト、取引先、内訳書、見積依頼)をAPI経由で作成
 * 2. テキスト入りPDFアップロード後に抽出結果の表示へ到達することを確認
 * 3. 一括取り込み後の明細行にゴミデータが含まれないことを確認
 * 4. ゴミ行フィルタ・集計行除外が適用されていることを確認
 * 5. テストデータをクリーンアップ
 *
 * Task 115.127 段1: 前提の生成を `seedEstimateRequest`（`estimate-request-preconditions`）へ寄せ、
 * `test.skip(!createdEstimateRequestId, …)` 3 件を `assertPrepared` へ改めた。
 *
 * @module e2e/specs/estimate-requests/ocr-accuracy-improvement-e2e.spec
 */

import { test, expect } from '@playwright/test';
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
 * OCR抽出結果のゴミ行フィルタ・集計行除外の統合確認E2Eテスト
 */
test.describe('OCR抽出結果の精度改善 (Task 48.1)', () => {
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
      label: 'OCR精度改善E2Eテスト',
      siteAddress: '東京都渋谷区テスト1-1-1',
      partnerEmail: 'test-ocr-accuracy@example.com',
      groupName: '建築工事グループ',
      item: {
        workType: '建築工事',
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

  // ============================================================================
  // テキスト入りPDFの抽出成立の確認
  // （要件19のスキャンPDFフォールバック経路の被覆ではない。理由は直下の注記）
  // ============================================================================

  /**
   * 注意（site-survey タスク 115.135 の実測）: 入力に用いる `e2e/fixtures/test-file.pdf` は
   * `/Font` と 7 個のテキスト描画演算子を持ち `/Image` を持たない**テキスト入り PDF** である。
   * 抽出される文字数は 97 で `frontend/src/components/estimate-requests/pdf-text-extractor.ts`
   * の閾値 50 を超えるため `isTextPdf=true` が確定し、`extractPdfWithOcrFallback` へ
   * **一度も入らない**。したがって REQ-19.1（Canvas 描画スケール 4.0）・REQ-19.6（画像前処理
   * パイプライン）・REQ-19.8（前処理を含む OCR 全体の 30 秒タイムアウト）は本検証では
   * 検査できない。
   *
   * 115.135 の是正: 到達しない受入基準を被覆済みと数えさせないため、当該 3 件の
   * `@requirement` タグを外し `e2e/requirement-exclusions.json` へ integration-test 区分で
   * 登録した。E2E での被覆は後続タスク **115.157**「画像のみのPDFを用意しOCR
   * フォールバック経路の被覆を実際に回復する」で回復し、同タスクが当該除外を解消する。
   *
   * 本検証に残る主張は「テキスト入り PDF から抽出結果の表示へ到達し、
   * エラー表示にならないこと」である。
   */
  test('テキスト入りPDFアップロード後に抽出が完了し結果が表示される', async ({ page }) => {
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

    // 抽出が完了し結果が表示されたことを主張する。
    // 以前は「インジケーター **または** 結果 **または** エラー」および
    // 「結果 **または** エラー」の二段の選言で完了を待っており、いずれも
    // **抽出が失敗しても成立する**判定であった。抽出の成立だけを無条件に主張する。
    // 待ち時間の上限は Claude Vision 試行（REQ-24.2）を含むパイプライン全体に対するもので、
    // pdfjs-dist 側の 30 秒のタイムアウト（REQ-17.8）はそのうちの一部である。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    const errorMessage = page.locator('[data-testid="ocr-error-message"]');

    await expect(extractedText).toBeVisible({ timeout: getTimeout(90000) });
    await expect(errorMessage).toHaveCount(0);

    // 抽出テキストが空でないことを確認する。
    // 抽出が成功したことを上で確定させたので、内容の判定は分岐で包まない。
    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // 20.1, 20.2, 20.3, 20.5: ゴミ行フィルタ・集計行除外の適用確認
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-20.1
   * @requirement estimate-request/REQ-20.2
   * @requirement estimate-request/REQ-20.3
   * @requirement estimate-request/REQ-20.5
   */
  test('一括取り込み後の明細行にゴミデータ（罫線文字・記号のみ行・集計行）が含まれない (REQ-20.1, REQ-20.2, REQ-20.3, REQ-20.5)', async ({
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

    const pdfPath = path.resolve(__dirname, '../../fixtures/test-file.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // OCR処理完了を待機
    // 本ファイル冒頭のテキスト入りPDFの検証と同じく、`test-file.pdf` に対しては
    // 抽出結果が必ず表示される。以前は「抽出できたら」「取り込みボタンが出たら」の
    // 二重の関門で包んでいたため、抽出が失敗した回は REQ-20.x の主張が一つも実行されなかった。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(90000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    // 抽出が成立していれば構造化データも得られるため、一括取り込みボタンは必ず表示される
    const importButton = page.locator('[data-testid="ocr-import-button"]');
    await expect(importButton).toBeVisible({ timeout: getTimeout(10000) });

    // 一括取り込みボタンをクリック
    await importButton.click();

    // 取り込み完了を待機
    await expect(page.locator('[data-testid="ocr-import-success"]')).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 明細行の名称フィールドを全て取得して検証
    // ゴミ行フィルタ（REQ-20.1, 20.2）と集計行除外（REQ-20.3）が適用されていることを確認
    const nameInputs = page.locator('input[data-field="name"]');
    const nameCount = await nameInputs.count();

    // ゴミデータパターン（記号のみ、罫線文字、極端に短い文字列）
    const garbagePatterns = [
      /^[\|\-\s_=+]+$/, // 罫線文字のみ（|, -, _, =, + のみで構成）
      /^[^\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFa-zA-Z0-9]+$/, // 漢字/ひらがな/カタカナ/英数字を含まない
    ];

    // 集計行キーワード
    const summaryKeywords = [
      '合計',
      '小計',
      '直接工事費',
      '諸経費',
      '一般管理費',
      '値引き',
      '消費税',
    ];

    // 空欄の行は取り込み結果ではない（初期化された空行）ため検査対象にならない。
    // 除外を繰り返しの内側で `continue` して行うと、母集団から黙って要素が抜け、
    // 全行が空欄でも 1 件も主張せずに緑で終わる。除外は母集団を作る時点で明示し、
    // 残った件数を無条件に主張する。
    const nameValues: string[] = [];
    for (let i = 0; i < nameCount; i++) {
      nameValues.push(await nameInputs.nth(i).inputValue());
    }
    const importedNames = nameValues.filter((value) => value.trim() !== '');
    expect(
      importedNames.length,
      '一括取り込み後に名称が入った明細行が1件も無い（ゴミ行フィルタ・集計行除外を検査できていない）'
    ).toBeGreaterThan(0);

    for (const nameValue of importedNames) {
      // ゴミ行フィルタの確認（REQ-20.1）: 記号のみの行が含まれていない
      for (const pattern of garbagePatterns) {
        expect(
          pattern.test(nameValue),
          `明細行の名称「${nameValue}」がゴミ行パターン ${pattern} にマッチしました`
        ).toBe(false);
      }

      // 集計行除外の確認（REQ-20.3）: 集計キーワードを含む行が含まれていない
      for (const keyword of summaryKeywords) {
        expect(
          nameValue.includes(keyword),
          `明細行の名称「${nameValue}」に集計キーワード「${keyword}」が含まれています`
        ).toBe(false);
      }
    }
  });

  // ============================================================================
  // 既存PDFテキスト抽出フローとの互換性確認
  // （REQ-19.8 の被覆ではない。理由は直下の注記）
  // ============================================================================

  /**
   * 115.135 の是正: 従前は `@requirement` で REQ-19.8 を付けていたが、
   * REQ-19.8 の受入基準は「画像前処理を含む OCR 処理全体のタイムアウトを既存の 30 秒から
   * 維持する」であり、本検証はタイムアウトを一つも計測していない。加えて入力の
   * `e2e/fixtures/test-text-pdf.pdf` はテキスト入り PDF であり、画像前処理パイプラインを
   * 含む経路へ到達しない。被覆済みと数えさせないためタグを外し
   * `e2e/requirement-exclusions.json` へ登録した。E2E での被覆は後続タスク **115.157** で
   * 回復し、同タスクが当該除外を解消する。
   *
   * 本検証に残る主張は「テキスト入り PDF では従来どおり pdfjs-dist の直接抽出で
   * 抽出結果の表示へ到達し、エラー表示にならないこと」である。
   */
  test('テキストPDFでは従来通りpdfjs-dist直接テキスト抽出が実行される（互換性確認）', async ({
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

    // テキスト入り PDF からは必ずテキストが抽出され、エラー表示にはならない。
    // これは pdfjs-dist の直接抽出という従来の経路が維持されていることの確認である。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(60000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);
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
