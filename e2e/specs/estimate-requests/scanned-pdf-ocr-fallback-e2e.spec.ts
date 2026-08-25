/**
 * @fileoverview 画像のみのPDF（スキャンPDF）に対するOCRフォールバック経路のE2E検証
 *
 * ## 何を回復する検証か（site-survey タスク 115.157）
 *
 * `frontend/src/components/estimate-requests/pdf-text-extractor.ts` の `extractPdfHybrid` は、
 * pdfjs-dist が抽出した文字数（空白除く）が閾値 `PDF_TEXT_THRESHOLD`（50）以上なら
 * テキストPDFと判定し、`extractPdfWithOcrFallback`（Canvas 描画スケール 4.0 →
 * `preprocessImageData` → Tesseract OCR）へ**一度も入らない**。
 *
 * 従前の e2e/fixtures はテキスト入りPDFの 2 件だけで、本番の判定ロジックへ通した実測は
 * `test-file.pdf` が抽出文字数 97、`test-text-pdf.pdf` が 264 であった。いずれも閾値 50 を
 * 超えるため `isTextPdf=true` が確定し、フォールバック経路の受入基準
 * （estimate-request/REQ-17.4・REQ-19.1・REQ-19.6）は E2E から検査できなかった。
 * タスク 115.135 はこれらのタグを外し `e2e/requirement-exclusions.json` へ退避させており、
 * 本ファイルはその除外を解消するために置かれている。
 *
 * 入力に用いる `e2e/fixtures/test-scanned-pdf.pdf` は `/Font` を持たずテキスト描画演算子を
 * 一つも含まない画像のみのPDFで、本番と同じ手順で測った抽出文字数は 0（`isTextPdf=false`）である。
 * 生成手順は `e2e/fixtures/generate-image-only-pdf.mjs` に置いてある。
 *
 * ## 経路へ到達したことをどう観測するか
 *
 * 画面の外から見えるのは抽出結果のテキストだけであり、それだけでは
 * 「Canvas をどの倍率で描いたか」「前処理を通したか」を弁別できない。そこで本ファイルは
 * 本番が呼ぶブラウザ API（`CanvasRenderingContext2D.getImageData` /
 * `putImageData` / `HTMLCanvasElement.toBlob`）へ観測を挟み、**本番が渡した画素そのもの**を
 * 測る。測るのは寸法・画素値の分布・連続する黒画素の最長という素の量だけで、
 * 判定は Node 側の `expect` が行う。テストが画面の中で判定を書き起こしてはいない。
 *
 * - REQ-17.4: Tesseract の資材（worker / 言語データ）がネットワークから取得され、
 *   OCR 結果に**画像の中にしか存在しない語**が現れること
 * - REQ-19.1: 本番が `getImageData` を呼んだ Canvas の寸法が、fixture の MediaBox
 *   350x175pt に対して 1400x700 であること（= 描画スケール 4.0。Claude Vision 側の
 *   スケール 2.0 なら 700x350 になるため、この値は両者を弁別する）
 * - REQ-19.6: `getImageData` → `putImageData` → `toBlob` の順で呼ばれ、`putImageData` へ
 *   渡された画素が (a) R=G=B（グレースケール）、(b) 値が 0 か 255 のみ（大津の二値化）、
 *   (c) 幅の 30% 以上の連続黒画素が消えている（水平線除去）、
 *   (d) 高さの 30% 以上の連続黒画素が消えている（垂直線除去）を同時に満たすこと。
 *   fixture には除去対象となる長さの罫線を水平・垂直に 1 本ずつ引いてあり、
 *   前処理前の観測では両方が閾値を超えていることを先に確かめる。
 * - REQ-19.2 / 19.3 / 19.4 / 19.5: 上の (a) / (b) / (c) / (d) がそのまま四段それぞれの
 *   受入基準の規範である（タスク 115.159 でタグを主張のある本ファイルへ移した）。
 *
 * 観測が経路の有無を弁別できることは、同じ観測をテキスト入りPDFへ当てて
 * フォールバック経路の痕跡が一つも現れないことを確かめる形で示す（本ファイル末尾）。
 *
 * ## REQ-17.8 / REQ-19.8（30秒タイムアウト）について
 *
 * 画像のみのPDFを 150 ページに増やすと、`extractPdfWithOcrFallback` の 1 ページあたりの
 * 処理（スケール 4.0 の描画 → 前処理 → OCR）が積み上がって 30 秒では終わらない。
 * これを用いて `OcrDataExtractor.tsx` の `OCR_TIMEOUT_MS`（30秒）が実際に処理を打ち切ることを
 * 本ファイル末尾で検査する。可否の判断とその根拠は当該テストの注記に記す。
 *
 * ## 実行環境の前提
 *
 * 本ファイルの検査はいずれも backend に `ANTHROPIC_API_KEY` が無いこと
 * （`/api/claude-vision` が 503 を返し、Claude Vision の試行が失敗して Tesseract
 * フォールバックへ落ちること）を前提とする。E2E の test 環境（`.env.test`）は
 * このキーを持たない。キーが設定された環境では Claude Vision の抽出が成功して
 * `processClaudeVision` がそこで処理を終えるため、本ファイルの検査は失敗する
 * （前提が崩れたまま黙って通ることはない）。
 *
 * @module e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec
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

// ============================================================================
// fixture の性質（生成スクリプトと本番の判定ロジックへ通した実測に基づく定数）
// ============================================================================

/** 画像のみPDFのページサイズ（pt）。`generate-image-only-pdf.mjs` の PAGE_WIDTH/PAGE_HEIGHT と対。 */
const FIXTURE_PAGE_WIDTH_PT = 350;
const FIXTURE_PAGE_HEIGHT_PT = 175;

/**
 * 本番 `pdf-text-extractor.ts` の `CANVAS_RENDER_SCALE`。
 * 本番の値を読み込まず定数として置くのは、本番と同じ値をテストが再掲することで
 * 「本番が 4.0 で描いていること」を外から主張するためである。
 * 本番が 2.0 へ戻れば下の寸法の主張が落ちる。
 */
const EXPECTED_CANVAS_RENDER_SCALE = 4.0;

/**
 * 罫線除去の対象となる長さの比率。画像の幅（水平線）／高さ（垂直線）に対する割合で、
 * 本番 `pdf-text-extractor.ts` の `removeHorizontalLines` / `removeVerticalLines` が既定で採る
 * `minLengthRatio`（0.3）と対。`generate-image-only-pdf.mjs` は
 * この比率を超える長さの罫線を fixture へ引いている。
 */
const RULE_MIN_RATIO = 0.3;

/** OCR が読み取れることを主張する語。fixture の画像の中にしか存在しない。 */
const OCR_EXPECTED_TOKENS = ['外壁塗装工事', '100', '平米', '5000', '500000'];

// ============================================================================
// 画素観測（本番が呼ぶ Canvas API へ挟む）
// ============================================================================

/** 一回の画素観測。判定はしない。素の量だけを持つ。 */
interface PixelObservation {
  /** 観測の順序（同一ページ内で単調増加） */
  order: number;
  /** 画素の幅 */
  width: number;
  /** 画素の高さ */
  height: number;
  /** R=G=B でない画素の数 */
  nonGrayscalePixels: number;
  /** 値が 0 でも 255 でもない画素の数 */
  nonBinaryPixels: number;
  /** 行方向の連続する暗い画素の最長 */
  longestDarkRunHorizontal: number;
  /** 列方向の連続する暗い画素の最長 */
  longestDarkRunVertical: number;
}

/** `toBlob` の呼び出し */
interface BlobObservation {
  order: number;
  width: number;
  height: number;
}

/** ページから回収する観測の全体 */
interface CanvasPipelineObservations {
  getImageData: PixelObservation[];
  putImageData: PixelObservation[];
  toBlob: BlobObservation[];
}

/**
 * 本番が呼ぶ Canvas API へ観測を挟む。
 *
 * 観測は本番の呼び出しをそのまま素通しし、通過した画素を測るだけである。
 * 返り値は使わないため、`page.addInitScript` は
 * `scripts/check-e2e-in-page-selfjudgement.ts` の対象外である。
 *
 * @param page Playwright のページ
 */
async function installCanvasPipelineObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = {
      getImageData: [] as unknown[],
      putImageData: [] as unknown[],
      toBlob: [] as unknown[],
    };
    (window as unknown as Record<string, unknown>).__canvasPipelineObservations = store;

    let order = 0;

    /** 画素の素の量を測る。判定はしない。 */
    const measure = (imageData: ImageData) => {
      const { data, width, height } = imageData;
      let nonGrayscalePixels = 0;
      let nonBinaryPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] as number;
        const g = data[i + 1] as number;
        const b = data[i + 2] as number;
        if (r !== g || g !== b) nonGrayscalePixels++;
        if (r !== 0 && r !== 255) nonBinaryPixels++;
      }

      const DARK = 128;
      let longestDarkRunHorizontal = 0;
      for (let y = 0; y < height; y++) {
        let run = 0;
        for (let x = 0; x < width; x++) {
          if ((data[(y * width + x) * 4] as number) < DARK) {
            run++;
            if (run > longestDarkRunHorizontal) longestDarkRunHorizontal = run;
          } else {
            run = 0;
          }
        }
      }

      let longestDarkRunVertical = 0;
      for (let x = 0; x < width; x++) {
        let run = 0;
        for (let y = 0; y < height; y++) {
          if ((data[(y * width + x) * 4] as number) < DARK) {
            run++;
            if (run > longestDarkRunVertical) longestDarkRunVertical = run;
          } else {
            run = 0;
          }
        }
      }

      order += 1;
      return {
        order,
        width,
        height,
        nonGrayscalePixels,
        nonBinaryPixels,
        longestDarkRunHorizontal,
        longestDarkRunVertical,
      };
    };

    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function patchedGetImageData(
      this: CanvasRenderingContext2D,
      ...args: Parameters<CanvasRenderingContext2D['getImageData']>
    ) {
      const result = originalGetImageData.apply(this, args);
      store.getImageData.push(measure(result));
      return result;
    };

    // putImageData は引数 3 個と 7 個の二つの形を持つ多重定義であり、可変長引数の関数を
    // そのまま代入すると片方の形に合わない。観測は第一引数の ImageData しか見ないため、
    // 素通しの部分だけ型を緩めて元の実装へ委ねる。
    const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
    const patchedPutImageData = function patchedPutImageData(
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ): void {
      store.putImageData.push(measure(args[0] as ImageData));
      (originalPutImageData as unknown as (...a: unknown[]) => void).apply(this, args);
    };
    CanvasRenderingContext2D.prototype.putImageData =
      patchedPutImageData as unknown as CanvasRenderingContext2D['putImageData'];

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function patchedToBlob(
      this: HTMLCanvasElement,
      ...args: Parameters<HTMLCanvasElement['toBlob']>
    ) {
      order += 1;
      store.toBlob.push({ order, width: this.width, height: this.height });
      return originalToBlob.apply(this, args);
    };
  });
}

/**
 * ページに溜まった観測を回収する。
 *
 * @param page Playwright のページ
 */
async function collectCanvasPipelineObservations(page: Page): Promise<CanvasPipelineObservations> {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__canvasPipelineObservations as unknown as CanvasPipelineObservations
  );
}

// ============================================================================
// Tesseract 資材の取得の観測
// ============================================================================

/**
 * Tesseract.js は worker スクリプトと言語データを配信元から取得する。
 * これらの取得は `extractPdfWithOcrFallback` の中の `createWorker('jpn')` でしか起きない
 * （PDF の処理経路で `tesseract.js` を読むのは当該関数だけである）。
 *
 * 配信元のホスト名ではなく**パス**で見分ける。CI とローカルで配信元が食い違っても
 * 観測が全件外れて素通りしないようにするためである。
 */
const TESSERACT_WORKER_PATH_MARK = '/tesseract.js@';
const TESSERACT_LANG_PATH_MARK = '/@tesseract.js-data/jpn/';

/**
 * Tesseract 資材の取得 URL を記録し始める。
 *
 * @param page Playwright のページ
 * @returns 記録された URL の配列（進行中も追記される）
 */
function watchTesseractAssetRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    const requestPath = new URL(request.url()).pathname;
    if (
      requestPath.includes(TESSERACT_WORKER_PATH_MARK) ||
      requestPath.includes(TESSERACT_LANG_PATH_MARK)
    ) {
      urls.push(requestPath);
    }
  });
  return urls;
}

// ============================================================================
// 打ち切りまでの時間の観測
// ============================================================================

/** 画面側で記録する 2 点の時刻（いずれも `performance.now()`。判定は含まない）。 */
interface OcrTiming {
  /** ファイルが選ばれた時刻。本番の抽出処理はこの後に始まる。 */
  fileSelectedAtMs: number;
  /** `ocr-error-message` が DOM へ現れた時刻。 */
  errorShownAtMs: number;
}

/**
 * 打ち切りまでの時間を**画面側の単調時計**で測るための観測を挟む。
 *
 * 記録するのは生の時刻 2 点だけで、判定はしない。`Date.now()`（壁時計）ではなく
 * `performance.now()` を使う理由と、Node 側で測らない理由は当該テストの注記に記す。
 *
 * @param page Playwright のページ
 */
async function installOcrTimingObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const timing = { fileSelectedAtMs: 0, errorShownAtMs: 0 };
    (window as unknown as Record<string, unknown>).__ocrTiming = timing;

    document.addEventListener(
      'change',
      (event) => {
        const target = event.target as HTMLInputElement | null;
        if (target?.type === 'file' && timing.fileSelectedAtMs === 0) {
          timing.fileSelectedAtMs = performance.now();
        }
      },
      true
    );

    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="ocr-error-message"]')) {
        timing.errorShownAtMs = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}

/**
 * 画面側に溜まった時刻を回収する。
 *
 * @param page Playwright のページ
 */
async function collectOcrTiming(page: Page): Promise<OcrTiming> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__ocrTiming as unknown as OcrTiming
  );
}

// ============================================================================
// 画面操作
// ============================================================================

/**
 * 見積依頼詳細から受領見積書の登録フォームを開き、ファイルを選ぶ。
 *
 * @param page Playwright のページ
 * @param estimateRequestId 見積依頼の識別子
 * @param fixtureName `e2e/fixtures` 配下のファイル名
 */
async function uploadQuotationFile(
  page: Page,
  estimateRequestId: string,
  fixtureName: string
): Promise<void> {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });

  const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
  await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
  await registerButton.click();

  await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

  const fixturePath = path.resolve(__dirname, '../../fixtures', fixtureName);
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
}

// ============================================================================
// テスト本体
// ============================================================================

test.describe('スキャンPDFのOCRフォールバック経路 (Task 115.157)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  test('テスト前提データを作成する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    const seed = await seedEstimateRequest(page, {
      label: 'スキャンPDF OCRフォールバックE2Eテスト',
      siteAddress: '東京都渋谷区テスト2-2-2',
      partnerEmail: 'test-scanned-pdf-ocr@example.com',
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

  /**
   * タスク 115.159 の是正: 本検証は従前から前処理の四段（グレースケール・大津の二値化・
   * 水平線除去・垂直線除去）の結果を画素で主張していたにもかかわらず、`@requirement` は
   * パイプライン全体を指す REQ-19.6 しか掲げていなかった。四段それぞれの受入基準
   * （REQ-19.2〜REQ-19.5）のタグは `estimate-request-ocr-vision-e2e.spec.ts` の
   * 「OCR処理UIが利用可能である」という検証に付いていたが、そちらは画面に何かが
   * 見えることしか確かめておらず画素を一切観測していない。**主張のある側へタグを移した**。
   * 下の四つの主張が、それぞれの受入基準の規範に一対一で対応する。
   *
   * @requirement estimate-request/REQ-17.4
   * @requirement estimate-request/REQ-19.1
   * @requirement estimate-request/REQ-19.2
   * @requirement estimate-request/REQ-19.3
   * @requirement estimate-request/REQ-19.4
   * @requirement estimate-request/REQ-19.5
   * @requirement estimate-request/REQ-19.6
   */
  test('画像のみのPDFはスキャンPDFと判定され、Canvas描画スケール4.0と画像前処理パイプラインを経てTesseract OCRが実行される (REQ-17.4, REQ-19.1, REQ-19.2, REQ-19.3, REQ-19.4, REQ-19.5, REQ-19.6)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await installCanvasPipelineObservers(page);
    const tesseractAssetPaths = watchTesseractAssetRequests(page);

    await loginAsUser(page, 'ADMIN_USER');
    await uploadQuotationFile(page, createdEstimateRequestId!, 'test-scanned-pdf.pdf');

    // 抽出の成立だけを主張する（「結果 または エラー」の選言では何も主張していない）。
    // 待ち時間の上限は Claude Vision の試行（REQ-24.2）とその失敗後の
    // Tesseract フォールバック（資材の取得を含む）を合わせた全体に対するものである。
    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(120000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    // ------------------------------------------------------------------
    // REQ-17.4: Canvas 経由で画像へ変換し Tesseract.js OCR を実行している
    // ------------------------------------------------------------------
    const workerAssetPaths = tesseractAssetPaths.filter((p) =>
      p.includes(TESSERACT_WORKER_PATH_MARK)
    );
    const langAssetPaths = tesseractAssetPaths.filter((p) => p.includes(TESSERACT_LANG_PATH_MARK));
    expect(
      workerAssetPaths.length,
      'Tesseract の worker スクリプトが一度も取得されていない（OCRフォールバック経路へ入っていない）'
    ).toBeGreaterThan(0);
    expect(
      langAssetPaths.length,
      'Tesseract の日本語データが一度も取得されていない（createWorker("jpn") へ到達していない）'
    ).toBeGreaterThan(0);

    const observations = await collectCanvasPipelineObservations(page);
    expect(
      observations.toBlob.length,
      'Canvas から画像への変換（toBlob）が一度も起きていない'
    ).toBeGreaterThan(0);

    // OCR が画像の中の文字を実際に読み取っている。
    // 画像のみのPDFであるため、これらの語は OCR を通してしか画面へ現れない。
    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    const normalizedText = textContent!.replace(/\s/g, '');
    for (const token of OCR_EXPECTED_TOKENS) {
      expect(
        normalizedText,
        `OCR結果に画像内の語「${token}」が現れていない（読み取れていない）`
      ).toContain(token);
    }

    // ------------------------------------------------------------------
    // REQ-19.1: Canvas 描画スケールが 4.0
    // ------------------------------------------------------------------
    const expectedWidth = FIXTURE_PAGE_WIDTH_PT * EXPECTED_CANVAS_RENDER_SCALE;
    const expectedHeight = FIXTURE_PAGE_HEIGHT_PT * EXPECTED_CANVAS_RENDER_SCALE;
    const scaledObservations = observations.getImageData.filter(
      (o) => o.width === expectedWidth && o.height === expectedHeight
    );
    expect(
      scaledObservations.length,
      `スケール ${EXPECTED_CANVAS_RENDER_SCALE} で描画された Canvas（${expectedWidth}x${expectedHeight}）から` +
        `画素が読み出されていない。観測された寸法: ` +
        `${JSON.stringify(observations.getImageData.map((o) => `${o.width}x${o.height}`))}`
    ).toBeGreaterThan(0);

    // ------------------------------------------------------------------
    // REQ-19.6: 前処理パイプラインが Canvas 描画と OCR の間に入っている
    // ------------------------------------------------------------------
    const beforePreprocess = scaledObservations[0]!;
    const afterPreprocess = observations.putImageData.find(
      (o) => o.width === expectedWidth && o.height === expectedHeight
    );
    expect(
      afterPreprocess,
      '前処理後の画素が Canvas へ書き戻されていない（putImageData が呼ばれていない）'
    ).toBeDefined();

    const blobAfterPreprocess = observations.toBlob.find(
      (o) => o.order > afterPreprocess!.order && o.width === expectedWidth
    );
    expect(
      blobAfterPreprocess,
      '画素の書き戻しより後に画像への変換が行われていない（前処理が OCR の前に入っていない）'
    ).toBeDefined();
    expect(beforePreprocess.order, '画素の読み出しが書き戻しより後に起きている').toBeLessThan(
      afterPreprocess!.order
    );

    // グレースケール変換（19.2）と大津の二値化（19.3）の結果
    expect(
      afterPreprocess!.nonGrayscalePixels,
      '前処理後に R=G=B でない画素が残っている（グレースケール変換が働いていない）'
    ).toBe(0);
    expect(
      afterPreprocess!.nonBinaryPixels,
      '前処理後に 0 でも 255 でもない画素が残っている（大津の二値化が働いていない）'
    ).toBe(0);

    // 水平線除去（19.4）と垂直線除去（19.5）の結果。
    // fixture には除去対象となる長さの罫線が水平・垂直に 1 本ずつ引いてあるため、
    // 前処理前は閾値を超え、前処理後は下回る。
    const horizontalThreshold = Math.floor(expectedWidth * RULE_MIN_RATIO);
    const verticalThreshold = Math.floor(expectedHeight * RULE_MIN_RATIO);
    expect(
      beforePreprocess.longestDarkRunHorizontal,
      '前処理前の画像に水平線除去の対象となる罫線が無い（除去を検査できていない）'
    ).toBeGreaterThanOrEqual(horizontalThreshold);
    expect(
      beforePreprocess.longestDarkRunVertical,
      '前処理前の画像に垂直線除去の対象となる罫線が無い（除去を検査できていない）'
    ).toBeGreaterThanOrEqual(verticalThreshold);
    expect(
      afterPreprocess!.longestDarkRunHorizontal,
      '前処理後も幅の30%以上の連続黒画素が残っている（水平線除去が働いていない）'
    ).toBeLessThan(horizontalThreshold);
    expect(
      afterPreprocess!.longestDarkRunVertical,
      '前処理後も高さの30%以上の連続黒画素が残っている（垂直線除去が働いていない）'
    ).toBeLessThan(verticalThreshold);
  });

  /**
   * 上の観測が「経路を通ったこと」を弁別できることの確認。
   *
   * 同じ観測をテキスト入りPDF（`test-file.pdf`、本番の判定ロジックへ通した抽出文字数 97）へ
   * 当てると、`isTextPdf=true` が確定してフォールバック経路へ入らないため、
   * Tesseract 資材の取得も前処理の書き戻しも一件も現れない。
   * これが成り立たなければ、上の主張は「常に真」であり何も検査していないことになる。
   *
   * 受入基準の被覆ではないため `@requirement` は付けない。
   */
  test('テキスト入りPDFではフォールバック経路の痕跡が一件も現れない（観測の弁別能力の確認）', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await installCanvasPipelineObservers(page);
    const tesseractAssetPaths = watchTesseractAssetRequests(page);

    await loginAsUser(page, 'ADMIN_USER');
    await uploadQuotationFile(page, createdEstimateRequestId!, 'test-file.pdf');

    const extractedText = page.locator('[data-testid="ocr-extracted-text"]');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(90000) });
    await expect(page.locator('[data-testid="ocr-error-message"]')).toHaveCount(0);

    // 抽出結果はテキストPDFの中身そのものであり、画像のみPDFの語は現れない
    const textContent = await extractedText.textContent();
    expect(textContent).toBeTruthy();
    expect(textContent!.replace(/\s/g, '')).not.toContain('外壁塗装工事');

    expect(
      tesseractAssetPaths,
      'テキスト入りPDFなのに Tesseract の資材が取得されている（判定が働いていない）'
    ).toEqual([]);

    const observations = await collectCanvasPipelineObservations(page);
    expect(
      observations.putImageData,
      'テキスト入りPDFなのに前処理後の画素が書き戻されている（フォールバック経路へ入っている）'
    ).toEqual([]);
  });

  /**
   * @requirement estimate-request/REQ-17.8
   * @requirement estimate-request/REQ-19.8
   *
   * ## 可否の判断（タスク 115.157 が求めた検討）
   *
   * 実現できる。ただし配信元を滞留させる方法（起票時に挙げられていた案）は採らない。
   * `page.route` で `cdn.jsdelivr.net` の取得を滞留させると、本番 `pdf-text-extractor.ts` の
   * `extractPdfWithOcrFallback` は `createWorker('jpn')` で止まる。前処理（`preprocessImageData`）は
   * その後のページ毎の繰り返しの中にあるため一度も走らず、打ち切られたものが REQ-19.8 の言う
   * 「画像前処理を含む OCR 処理」だと主張できない。
   *
   * 代わりに、30 秒では終わらない量の仕事を実際に与える。150 ページの画像のみPDFは
   * 1 ページあたり「スケール 4.0 の描画 → 前処理 → OCR」を要するため、完走には数分かかる。
   * 打ち切りが本タイムアウトによることは、`OCR_TIMEOUT_MS` を変えたビルドで同じ検査を回して
   * 確かめた。10000 へ変えると終端が 11 秒台へ移り（当時は壁時計で測っており 28.6 秒 → 11.3 秒）、
   * 120000 へ変えると 60 秒経っても完走もエラーも現れない（いずれも確認後に本番は 30000 へ
   * 戻してある）。後者は、上限が「打ち切らずに完走した」場合を排除できていることの裏付けでもある。
   *
   * ## 待ち時間をどの時計で測るか
   *
   * `Date.now()`（壁時計）では測らない。本環境では `setTimeout` を駆動する単調時計と壁時計が
   * 乖離しており、30000ms の `setTimeout` が発火するまでに `Date.now()` は
   * 27423 / 27511 / 27514 / 27545 ms しか進まない（4 回計測）。ブラウザ固有の現象ではなく、
   * Playwright を介さない素の Node でも単調 30002ms に対し壁時計 27547ms、
   * 単調 30026ms に対し 27535ms であった（本環境は WSL2、clocksource は
   * hyperv_clocksource_tsc_page）。壁時計で測ると 30 秒の打ち切りが 28.8〜29.3 秒に見え、
   * 「30 秒より早く終わっている」という誤った像を与える。
   * なお Node 側と画面側の `Date.now()` の差は 4〜10ms であり、両者のずれは幅を広げる理由に
   * ならない（旧版の注記はここを誤っていた）。
   *
   * そこで、ファイルが選ばれてからエラーが現れるまでを**画面側の `performance.now()`**
   * （`setTimeout` と同じ単調時計）で測る。画面側で記録するのは時刻 2 点だけで、
   * 判定は下の `expect` が行う。この測り方は壁時計の乖離が無い環境でも同じ値を返す。
   *
   * ## 受入幅
   *
   * 実測は 30832 / 30849 / 30903 ms（3 回）。30000ms の打ち切りに対する超過分
   * 832 / 849 / 903 ms は、ファイル選択から打ち切りタイマーが登録されるまでの前置き
   * （Base64 化と Claude Vision の 503 応答）である。
   * 下限 29000 は「30 秒より早く諦めていない」ことを、上限 34000 は「30 秒より長く回していない
   * （＝完走もしていない）」ことを言う。30000 ちょうどに詰めないのは、前置きの分だけ必ず
   * 30000 を上回ることと、打ち切りのコールバックが主スレッドの塞がり具合で遅れうることによる。
   *
   * 実行時間への影響: 本検査だけで約 35 秒を要する。E2E 全体（約 1.6 時間）に対して
   * 1% 未満であり、当該の受入基準を除外に残し続ける代償の方が大きいと判断した。
   */
  test('30秒を超えるスキャンPDFのOCR処理は打ち切られエラーが表示される (REQ-17.8, REQ-19.8)', async ({
    page,
  }) => {
    assertPrepared(createdEstimateRequestId, '事前準備で作成した見積依頼のID');

    await installCanvasPipelineObservers(page);
    await installOcrTimingObservers(page);
    const tesseractAssetPaths = watchTesseractAssetRequests(page);

    await loginAsUser(page, 'ADMIN_USER');

    await uploadQuotationFile(page, createdEstimateRequestId!, 'test-scanned-pdf-multipage.pdf');

    const errorMessage = page.locator('[data-testid="ocr-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: getTimeout(120000) });

    await expect(errorMessage).toContainText('OCR処理に失敗しました');
    await expect(page.locator('[data-testid="ocr-extracted-text"]')).toHaveCount(0);

    // 打ち切られたのが「画像前処理を含む OCR 処理」であること（REQ-19.8）。
    // 前処理を通った画素が書き戻されていれば、経路は前処理の内側まで進んでいた。
    expect(
      tesseractAssetPaths.filter((p) => p.includes(TESSERACT_LANG_PATH_MARK)).length,
      'Tesseract の日本語データが取得されていない（OCRフォールバック経路へ入る前に終わっている）'
    ).toBeGreaterThan(0);

    const observations = await collectCanvasPipelineObservations(page);
    const preprocessed = observations.putImageData.filter(
      (o) => o.nonGrayscalePixels === 0 && o.nonBinaryPixels === 0
    );
    expect(
      preprocessed.length,
      '前処理を通った画素が一度も書き戻されていない（画像前処理を含む経路が打ち切られたと言えない）'
    ).toBeGreaterThan(0);

    // 打ち切りが 30 秒の上限によること。時計は画面側の単調時計を使う（注記を参照）。
    const timing = await collectOcrTiming(page);
    expect(timing.fileSelectedAtMs, 'ファイル選択の時刻が観測されていない').toBeGreaterThan(0);
    expect(timing.errorShownAtMs, 'エラー表示の時刻が観測されていない').toBeGreaterThan(0);

    const elapsedMs = Math.round(timing.errorShownAtMs - timing.fileSelectedAtMs);
    expect(
      elapsedMs,
      `エラー表示までが短すぎる（${elapsedMs}ms）。30秒の上限より前に別の要因で終わっている`
    ).toBeGreaterThanOrEqual(29000);
    expect(
      elapsedMs,
      `エラー表示までが長すぎる（${elapsedMs}ms）。30秒の上限で打ち切られていない`
    ).toBeLessThanOrEqual(34000);
  });

  test('テストデータをクリーンアップする', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    const headers = { Authorization: `Bearer ${accessToken}` };

    if (createdEstimateRequestId) {
      await page.request.delete(
        `${API_BASE_URL}/api/estimate-requests/${createdEstimateRequestId}`,
        { headers }
      );
    }
    if (createdItemizedStatementId) {
      await page.request.delete(
        `${API_BASE_URL}/api/itemized-statements/${createdItemizedStatementId}`,
        { headers }
      );
    }
    if (createdTradingPartnerId) {
      await page.request.delete(`${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`, {
        headers,
      });
    }
    if (createdProjectId) {
      await page.request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, { headers });
    }
  });
});
