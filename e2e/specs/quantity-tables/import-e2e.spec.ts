/**
 * @fileoverview 数量表インポート機能 E2Eテスト (REQ-27, 28, 29, 30, 31, 32, 33, 34)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-27.1: インポートダイアログ表示
 * - @requirement quantity-table-generation/REQ-27.2: ファイルアップロードエリア表示
 * - @requirement quantity-table-generation/REQ-27.3: Excel/PDF受付
 * - @requirement quantity-table-generation/REQ-27.4: サポート対象外でエラー
 * - @requirement quantity-table-generation/REQ-27.5: Excelパース自動開始
 * - @requirement quantity-table-generation/REQ-27.6: PDF OCR自動開始
 * - @requirement quantity-table-generation/REQ-27.7: 処理中インジケーター
 * - @requirement quantity-table-generation/REQ-27.8: 処理中のファイル選択の非活性と一括取り込みボタンの不表示
 * - @requirement quantity-table-generation/REQ-28.2: Excelファイルの全シートを解析対象とする
 * - @requirement quantity-table-generation/REQ-28.3: 列マッピング
 * - @requirement quantity-table-generation/REQ-28.4: プレビューテーブル
 * - @requirement quantity-table-generation/REQ-28.5: 各列の現在のマッピング先フィールドの表示
 * - @requirement quantity-table-generation/REQ-28.6: 読み取り失敗時のエラー
 * - @requirement quantity-table-generation/REQ-28.7: テキスト選択・コピー可能
 * - @requirement quantity-table-generation/REQ-29.2: PDFの全ページを対象にテキスト抽出
 * - @requirement quantity-table-generation/REQ-29.3: テキストPDFは抽出テキストをそのまま使用しTesseract OCRを実行しない
 * - @requirement quantity-table-generation/REQ-29.4: スキャンPDFは各ページをCanvas経由で画像化しTesseract.js OCRを実行
 * - @requirement quantity-table-generation/REQ-29.5: スキャンPDFフォールバックのCanvas描画スケール4.0
 * - @requirement quantity-table-generation/REQ-29.6: スキャンPDFフォールバックの画像前処理パイプライン
 * - @requirement quantity-table-generation/REQ-29.7: OCR完了時に抽出テキストとプレビューテーブルを表示
 * - @requirement quantity-table-generation/REQ-29.8: 抽出結果のテキストを選択・コピーできる状態で表示
 * - @requirement quantity-table-generation/REQ-29.9: OCR失敗時にエラーメッセージを表示し手動入力を促す
 * - @requirement quantity-table-generation/REQ-29.10: OCR処理のタイムアウトを30秒とする
 * - @requirement quantity-table-generation/REQ-30.1: Claude Vision API利用可能時の優先使用
 * - @requirement quantity-table-generation/REQ-30.4: Claude APIレスポンスの数量項目フィールドへのマッピング
 * - @requirement quantity-table-generation/REQ-30.5: Claude Vision API利用不可時のOCRフォールバック
 * - @requirement quantity-table-generation/REQ-30.6: Claude Vision APIのタイムアウト・エラー時のOCRフォールバック
 * - @requirement quantity-table-generation/REQ-31.1: 「一括取り込み」ボタン
 * - @requirement quantity-table-generation/REQ-31.2: 取り込み先グループ選択UI
 * - @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加
 * - @requirement quantity-table-generation/REQ-31.4: 自動入力
 * - @requirement quantity-table-generation/REQ-31.5: 計算方法「標準」
 * - @requirement quantity-table-generation/REQ-31.6: 完了メッセージ
 * - @requirement quantity-table-generation/REQ-31.7: 確認・修正促し
 * - @requirement quantity-table-generation/REQ-31.8: 一括取り込み後の編集可能
 * - @requirement quantity-table-generation/REQ-31.9: 既存項目末尾追加
 * - @requirement quantity-table-generation/REQ-32.1: マッピング先ドロップダウン
 * - @requirement quantity-table-generation/REQ-32.2: 選択肢提供
 * - @requirement quantity-table-generation/REQ-32.3: マッピング即座更新
 * - @requirement quantity-table-generation/REQ-32.4: 自動推定
 * - @requirement quantity-table-generation/REQ-32.5: ユーザー変更可能
 * - @requirement quantity-table-generation/REQ-32.6: 必須未マッピング警告
 * - @requirement quantity-table-generation/REQ-33.1: リトライボタン表示
 * - @requirement quantity-table-generation/REQ-33.2: リトライ実行
 * - @requirement quantity-table-generation/REQ-33.3: リトライ中インジケーター
 * - @requirement quantity-table-generation/REQ-33.4: 別ファイル許可
 * - @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時のクリア
 * - @requirement quantity-table-generation/REQ-34.1: インラインプレビュー表示
 * - @requirement quantity-table-generation/REQ-34.2: PDFビューアでのインライン表示
 * - @requirement quantity-table-generation/REQ-34.3: Excelインライン表示
 * - @requirement quantity-table-generation/REQ-34.4: PDFのページナビゲーション
 * - @requirement quantity-table-generation/REQ-34.5: ダイアログ内に並べて表示
 *
 * @module e2e/specs/quantity-tables/import-e2e.spec
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import {
  addQuantityItemRows,
  fillItemRequiredFields,
} from '../../helpers/quantity-table-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures');

const TEST_PDF = path.join(FIXTURES_DIR, 'test-text-pdf.pdf');
// 1ページの PDF 資材（REQ-34.4 は総ページ数が1でもページナビゲーションを求める）
const TEST_SINGLE_PAGE_PDF = path.join(FIXTURES_DIR, 'test-file.pdf');
const TEST_TXT = path.join(FIXTURES_DIR, 'test-document.txt');
// クライアントサイド（SheetJS）でパースされる Excel フィクスチャ。
// OCR（ANTHROPIC_API_KEY 依存）を経由せず決定論的に抽出行を得られるため、
// REQ-42.4/42.6 の「取り込みは保存まで永続化しない」挙動を環境非依存で検証できる。
const TEST_XLSX = path.join(FIXTURES_DIR, 'import-items.xlsx');
// REQ-31.4 は対応フィールド10欄（大項目〜備考）への自動入力を求める。上の資材は5列で、
// その見出しと中身は REQ-27.5 / REQ-28.4 の判定が固定しているため変えられない。
// 10欄すべてを見出しに持つ資材を別に置く（見出しは field-mapping.ts の推定規則に一致する）。
const TEST_XLSX_ALL_FIELDS = path.join(FIXTURES_DIR, 'import-items-all-fields.xlsx');
// REQ-28.2 は「Excelファイルの**全シート**を解析対象とする」を求める。上の資材は 2 件とも
// 単一シート（どちらも SheetNames は `["Sheet1"]`）であり、1枚目だけを読む実装と区別できない。
// 見出しを共有し本文が 1 行ずつ異なる 3 枚のシートを持つ資材を別に置く。
// 生成手順は `e2e/fixtures/generate-multi-sheet-xlsx.mjs` にある。
const TEST_XLSX_MULTI_SHEET = path.join(FIXTURES_DIR, 'import-items-multi-sheet.xlsx');
/**
 * TEST_XLSX_MULTI_SHEET の本文（シートの並び順に 1 行ずつ）。
 * 列の並びは 3 枚に共通の見出し（工種・名称・規格・数量・単位）と対。
 */
const MULTI_SHEET_ROWS = [
  ['仮設工', 'E2E1枚目項目', '標準仕様', '11', '式'],
  ['土工', 'E2E2枚目項目', '特記仕様', '22', 'm3'],
  ['電気工', 'E2E3枚目項目', '参考仕様', '33', '箇所'],
] as const;

/** TEST_XLSX_ALL_FIELDS のデータ行（1行）。見出しの欄名 → セルの値 */
const ALL_FIELDS_ROW = {
  大項目: 'E2E大項目',
  中項目: 'E2E中項目',
  小項目: 'E2E小項目',
  任意分類: 'E2E任意分類',
  工種: 'E2E工種',
  名称: 'E2E全欄取込項目',
  規格: 'E2E規格',
  数量: '34.5',
  単位: 'm2',
  備考: 'E2E備考',
} as const;

/**
 * 画像のみのPDF（`e2e/fixtures/test-scanned-pdf.pdf`）の画像の中にしか存在しない語。
 * OCR を通してしか抽出テキストへ現れない（REQ-30.5 のフォールバックの実行の観測に用いる）。
 * 資材の生成手順は `e2e/fixtures/generate-image-only-pdf.mjs` にある。
 */
const SCANNED_PDF_OCR_EXPECTED_TOKENS = ['外壁塗装工事', '100', '平米', '5000', '500000'] as const;

// ----------------------------------------------------------------------------
// スキャンPDFのフォールバック経路の画素観測（REQ-29.4 / 29.5 / 29.6）
//
// 画面の外から見えるのは抽出結果のテキストだけであり、それだけでは「Canvas をどの倍率で
// 描いたか」「前処理を通したか」を弁別できない。そこで本番が呼ぶブラウザ API
// （`CanvasRenderingContext2D.getImageData` / `putImageData` /
// `HTMLCanvasElement.toBlob` / `toDataURL`）へ観測を挟み、**本番が渡した画素そのもの**を測る。
// 測るのは寸法・画素値の分布・連続する黒画素の最長という素の量だけで、合否の判定は
// Node 側の `expect` が行う（`e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts`
// と同じ作法。同ファイルは estimate-request の同型の条文を同じ観測で判定している）。
// ----------------------------------------------------------------------------

/**
 * `e2e/fixtures/test-scanned-pdf.pdf` のページサイズ（pt）。
 * 生成手順は `e2e/fixtures/generate-image-only-pdf.mjs` の `PAGE_WIDTH` / `PAGE_HEIGHT` と対。
 */
const SCANNED_PDF_PAGE_WIDTH_PT = 350;
const SCANNED_PDF_PAGE_HEIGHT_PT = 175;

/**
 * 「**各ページ**を Canvas 経由で画像に変換する」（REQ-29.4）の量化子を n=1 で済ませないための、
 * 2 ページの画像のみPDF。`generate-image-only-pdf.mjs --pages 2` の生成物で、
 * 画像 XObject は 1 個を 2 ページが共有する（ページの中身は同一）。
 */
const SCANNED_PDF_2PAGES_PAGE_COUNT = 2;

/**
 * 本番 `pdf-text-extractor.ts` の `CANVAS_RENDER_SCALE`（REQ-29.5 が命じる 4.0）。
 * 本番の値を読み込まず定数として再掲するのは、「本番が 4.0 で描いていること」を
 * 外から主張するためである。本番が別の倍率へ変われば下の寸法の主張が落ちる。
 */
const EXPECTED_CANVAS_RENDER_SCALE = 4.0;

/**
 * Claude Vision 経路の描画スケール（本番 `CLAUDE_VISION_RENDER_SCALE` = 2.0）。
 * フォールバック経路の 4.0 と弁別するために置く。
 */
const CLAUDE_VISION_RENDER_SCALE = 2.0;

/**
 * 罫線除去の対象となる長さの比率。本番 `removeHorizontalLines` / `removeVerticalLines` の
 * 既定の `minLengthRatio`（0.3）と対。fixture はこの比率を超える罫線を水平・垂直へ 1 本ずつ持つ。
 */
const RULE_MIN_RATIO = 0.3;

/** 一回の画素観測。判定はしない。素の量だけを持つ。 */
interface PixelObservation {
  /** 観測の順序（ページ内で単調増加） */
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

/** Canvas から画像へ変換した呼び出し（`toBlob` / `toDataURL`） */
interface CanvasExportObservation {
  order: number;
  width: number;
  height: number;
}

/** ページから回収する観測の全体 */
interface CanvasPipelineObservations {
  getImageData: PixelObservation[];
  putImageData: PixelObservation[];
  toBlob: CanvasExportObservation[];
  toDataURL: CanvasExportObservation[];
}

/**
 * 本番が呼ぶ Canvas API へ観測を挟む。
 *
 * 観測は本番の呼び出しをそのまま素通しし、通過した画素を測るだけである。
 * 画面の中で合否を決めてはいない（判定はすべて Node 側の `expect`）。
 *
 * @param page Playwright のページ
 */
async function installCanvasPipelineObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = {
      getImageData: [] as unknown[],
      putImageData: [] as unknown[],
      toBlob: [] as unknown[],
      toDataURL: [] as unknown[],
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

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(
      this: HTMLCanvasElement,
      ...args: Parameters<HTMLCanvasElement['toDataURL']>
    ) {
      order += 1;
      store.toDataURL.push({ order, width: this.width, height: this.height });
      return originalToDataURL.apply(this, args);
    };
  });
}

/**
 * ページに溜まった画素観測を回収する。
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

// ----------------------------------------------------------------------------
// 打ち切りまでの時間の観測（REQ-29.10）
// ----------------------------------------------------------------------------

/** 画面側で記録する2点の時刻（いずれも `performance.now()`。判定は含まない）。 */
interface ImportOcrTiming {
  /** ファイルが選ばれた時刻。本番の抽出処理はこの後に始まる。 */
  fileSelectedAtMs: number;
  /** 抽出結果の領域へエラー表示が現れた時刻。 */
  errorShownAtMs: number;
}

/**
 * 打ち切りまでの時間を**画面側の単調時計**で測るための観測を挟む。
 *
 * 記録するのは生の時刻2点だけで、判定はしない。`Date.now()`（壁時計）ではなく
 * `performance.now()` を使う理由は当該テストの注記に記す。
 *
 * @param page Playwright のページ
 */
async function installImportOcrTimingObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const timing = { fileSelectedAtMs: 0, errorShownAtMs: 0 };
    (window as unknown as Record<string, unknown>).__importOcrTiming = timing;

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
      if (document.querySelector('section[aria-label="抽出結果"] [role="alert"]')) {
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
async function collectImportOcrTiming(page: Page): Promise<ImportOcrTiming> {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__importOcrTiming as unknown as ImportOcrTiming
  );
}

// ----------------------------------------------------------------------------
// ネットワーク監視（REQ-42.6: 保存前は数量表サブリソースへの書き込みが一切ない）
// client-side-edit-explicit-save-e2e.spec.ts と同一パターン。
// ----------------------------------------------------------------------------
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 数量表サブリソースへの「永続化書き込み」かを判定する。
 * 唯一許可される書き込みは明示保存（PUT /api/quantity-tables/:id/save）なので除外する。
 */
function isQuantityPersistenceWrite(url: string, method: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  if (/\/api\/quantity-tables\/[^/]+\/save$/.test(url)) return false;
  return (
    /\/api\/quantity-tables(\/|$|\?)/.test(url) ||
    /\/api\/quantity-groups(\/|$|\?)/.test(url) ||
    /\/api\/quantity-items(\/|$|\?)/.test(url)
  );
}

/** 永続化書き込みリクエストを記録するリスナーを設置する。 */
function attachPersistenceMonitor(page: Page): {
  writes: Array<{ method: string; url: string }>;
  detach: () => void;
} {
  const writes: Array<{ method: string; url: string }> = [];
  const listener = (request: Request) => {
    const method = request.method();
    const url = request.url();
    if (isQuantityPersistenceWrite(url, method)) {
      writes.push({ method, url });
    }
  };
  page.on('request', listener);
  return { writes, detach: () => page.off('request', listener) };
}

/**
 * 名称フィールド（AutocompleteInput = role="combobox"）のいずれかが指定値を持つことを待機検証する。
 * React の制御コンポーネントは value 属性へ反映されないため、各 combobox の inputValue を走査する。
 */
async function expectNameValuePresent(page: Page, value: string): Promise<void> {
  const nameInputs = page.getByRole('combobox', { name: /名称/i });
  await expect
    .poll(
      async () => {
        const count = await nameInputs.count();
        for (let i = 0; i < count; i++) {
          if ((await nameInputs.nth(i).inputValue()) === value) return true;
        }
        return false;
      },
      { timeout: getTimeout(10000) }
    )
    .toBe(true);
}

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 数量表編集画面へ遷移する。
 *
 * 事前準備で作成した tableId が利用できる場合は直接遷移し、
 * それ以外は /projects → 詳細 → 一覧 → カード のUIフローでナビゲートする。
 */
async function navigateToQuantityTableEdit(page: Page): Promise<boolean> {
  if (createdQuantityTableId) {
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    return await isVisibleWithin(editArea, getTimeout(10000));
  }

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (!(await isVisibleWithin(projectCard, getTimeout(5000)))) {
    return false;
  }
  await projectCard.click();
  await page.waitForLoadState('networkidle');

  const quantityTableLink = page.getByText('すべて見る').first();
  if (!(await isVisibleWithin(quantityTableLink, getTimeout(5000)))) {
    return false;
  }
  await quantityTableLink.click();
  await page.waitForLoadState('networkidle');

  const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
  if (!(await isVisibleWithin(tableCard, getTimeout(5000)))) {
    return false;
  }
  await tableCard.click();
  await page.waitForLoadState('networkidle');

  return true;
}

/**
 * インポートダイアログを開くヘルパー
 */
async function openImportDialog(page: Page): Promise<boolean> {
  const importButton = page.getByRole('button', { name: 'インポート' }).first();
  if (!(await isVisibleWithin(importButton, getTimeout(5000)))) {
    return false;
  }
  await importButton.click();

  const dialog = page.getByRole('heading', { name: '数量表インポート' });
  return await isVisibleWithin(dialog, getTimeout(5000));
}

/**
 * 事前準備: テスト用プロジェクト・数量表・グループを作成
 *
 * REQ-27/28/31/32/33/34 のテストは数量表編集画面への到達を前提とし、
 * REQ-31 ではグループ選択UIで利用可能なグループの存在を前提とするため、
 * 独立して実行できるよう事前にプロジェクト・数量表・グループを1件作成する。
 *
 * worker 単位で実行する `test.beforeAll` として実装することで、
 * 失敗テストの retry によって worker が再起動された場合でも、
 * 新しい worker で再度プロジェクト・数量表・グループが作成され、
 * モジュール変数 `createdQuantityTableId` が再セットされる。
 */
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクトを作成
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /新規作成/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `IMPORT_E2E_PJ_${Date.now()}`;
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
    const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
    testProjectId = projectMatch?.[1] ?? null;
    expect(testProjectId).toBeTruthy();

    // 数量表を作成
    await page.goto(`/projects/${testProjectId}/quantity-tables`);
    await page.waitForLoadState('networkidle');

    const createButton = page.getByRole('link', { name: /新規作成/i });
    await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
    await createButton.click();

    const nameInput = page.getByRole('textbox', { name: /数量表名/i });
    await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
    await nameInput.clear();
    await nameInput.fill(`IMPORT_E2E_数量表_${Date.now()}`);

    const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
    await createConfirmButton.click();

    await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
      timeout: getTimeout(15000),
    });
    const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
    createdQuantityTableId = tableMatch?.[1] ?? null;
    expect(createdQuantityTableId).toBeTruthy();

    // REQ-31.2 の取り込み先グループ選択UI検証のため、グループを1つ追加して永続化する。
    // これは「取り込み先となるグループが存在する」状態を用意するための前提準備であり、
    // 取り込み自体の永続化挙動とは独立している（取り込みは REQ-42.4 によりドラフトへ
    // 反映され、保存操作時にのみ永続化される）。後続のOCR系テストはこのテーブルへ
    // ナビゲートし直すため、選択対象グループはサーバー側に存在している必要がある。
    const addGroupButton = page
      .getByRole('button', { name: /グループ追加|グループを追加/i })
      .first();
    await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
    await addGroupButton.click();

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-42.5: 取り込み先グループを永続化する（後続テストがナビゲート後に参照するため）。
    await saveQuantityTableDraft(page);
  } finally {
    await context.close();
  }
});

test.describe('REQ-27: 数量表インポート（ファイルアップロード・処理起動）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.1: インポートダイアログ表示
   */
  test('インポートボタンクリックでインポートダイアログが表示される (REQ-27.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const importButton = page.getByRole('button', { name: 'インポート' }).first();
    await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });
    await importButton.click();

    const heading = page.getByRole('heading', { name: '数量表インポート' });
    await expect(heading).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.2: ファイルアップロードエリア表示
   */
  test('インポートダイアログにファイルアップロードエリアが表示される (REQ-27.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // ファイル選択input
    const fileInput = page.getByLabel('ファイルを選択');
    await expect(fileInput).toBeVisible({ timeout: getTimeout(5000) });

    // アップロードエリアの説明文も表示
    await expect(
      page.getByText(/ファイルをドラッグ&ドロップ、またはファイルを選択してください/)
    ).toBeVisible();
  });

  /**
   * @requirement quantity-table-generation/REQ-27.3: Excel/PDF受付
   *
   * fileInput の accept属性が ".xlsx,.xls,.pdf" であること、
   * かつ実際にPDFをアップロードした際にエラーにならず処理が開始される。
   */
  test('ファイルinputがExcelおよびPDFを受け付ける属性を持つ (REQ-27.3)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toContain('.xlsx');
    expect(acceptAttr).toContain('.xls');
    expect(acceptAttr).toContain('.pdf');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.4: サポート対象外でエラー
   *
   * .txt 等のサポート対象外ファイルをアップロードするとエラーメッセージが表示される。
   */
  test('サポート対象外（.txt）アップロード時にエラーメッセージが表示される (REQ-27.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_TXT);

    // エラーメッセージが表示される（role=alert または「対応していないファイル形式」テキスト）
    const errorAlert = page.getByText(/対応していないファイル形式|対応ファイル形式/);
    await expect(errorAlert.first()).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.5: Excelファイルアップロード時にExcelパース自動開始
   *
   * Excel ファイル(.xlsx)をアップロードすると、ユーザーの追加操作なしにパース処理が起動し、
   * Excel の中身を読み取った結果がダイアログの「抽出結果」の領域に現れる。
   *
   * 以前は壊れたバイト列を .xlsx として渡し、「status / aria-live / indicator / processing /
   * preview / alert のいずれかが見える」ことを待っていた。この選言には、ファイル選択を契機に
   * 抽出とは無関係に描かれるインラインプレビュー（REQ-34.1、`data-testid="preview-skeleton"` 等）
   * も含まれ、パースの成否ではなく「何かが出た」ことしか主張していなかった（タスク 97.21）。
   * 付随的な要素の選言に頼らず（REQ-27.6 の検証と同じ方針）、次を決定論的な証跡として主張する。
   *   1. 実在する Excel の資材（import-items.xlsx）を選んだ後、クリック等の操作を一切行わずに、
   *      「抽出結果」の領域にプレビューテーブルが表示され、資材の本文の行
   *      （「仮設工 / E2E取込項目 / 標準仕様 / 12 / 式」）を読み取った内容を含む
   *   2. パースを利用者に開始させる操作（開始・解析・読み取り等のボタン）がダイアログに無い
   * インラインプレビュー（REQ-34.3）にも同じ表が出るため、判定は「抽出結果」の領域に限定する。
   */
  test('Excel(.xlsx)アップロード時にパース処理が自動起動する (REQ-27.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const dialog = page.getByRole('dialog');

    // 2. パースを開始させる操作が用意されていない（自動で始まる前提の画面である）
    await expect(
      dialog.getByRole('button', { name: /開始|解析|パース|読み取|読込|読み込|抽出/ }),
      'REQ-27.5: パースを利用者に開始させるボタンがある'
    ).toHaveCount(0);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // 1. 以降クリック等の操作を一切行わずに、Excel をパースした結果の行が抽出結果に表示される
    const results = dialog.getByRole('region', { name: '抽出結果' });
    const resultTable = results.locator('table');
    await expect(
      resultTable,
      'REQ-27.5: Excelアップロード後、操作なしに抽出結果のプレビューテーブルが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    const resultRow = resultTable.locator('tbody tr').filter({ hasText: 'E2E取込項目' });
    await expect(
      resultRow,
      'REQ-27.5: 自動起動したパースが資材の本文の行を読み取っていない'
    ).toHaveCount(1);
    for (const cell of ['仮設工', '標準仕様', '12', '式']) {
      await expect(
        resultRow,
        `REQ-27.5: 自動起動したパースの結果の行に「${cell}」が含まれない`
      ).toContainText(cell);
    }

    // 選択後も、パースを開始させる操作は現れていない
    await expect(
      dialog.getByRole('button', { name: /開始|解析|パース|読み取|読込|読み込|抽出/ }),
      'REQ-27.5: ファイル選択後にパースを利用者に開始させるボタンが現れた'
    ).toHaveCount(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-27.6: PDFファイルアップロード時にOCR自動開始
   *
   * PDF ファイルをアップロードすると、ユーザーの追加操作なしに OCR 処理が起動し、
   * PDF の内容を読み取った結果がダイアログに現れる。
   *
   * 以前は「status / aria-live / indicator / preview / alert のいずれかが見える」ことを
   * 待っていたが、実際に一致していたのはフォールバック経路のヘッダーが「列N」だった頃に
   * 付随的に出ていた必須フィールド未マッピングの警告（role="alert"）だけであった。
   * タスク 96.1 でヘッダーが10欄の名前付きフィールドになり警告が出なくなると、
   * OCR は自動起動しているのに何も一致せず失敗した。付随的な要素の選言に頼らず、
   * 次の二点を決定論的な証跡として主張する。
   *   1. ファイル選択の後、何も操作しないまま OCR の最初の段（Claude Vision への抽出要求）が発行される
   *   2. 何も操作しないまま、資材 PDF の本文（1ページ目「Concrete Work」・2ページ目「Rebar Work」）を
   *      読み取った抽出テキストがダイアログに表示される
   * Claude Vision は 503 に固定し、ANTHROPIC_API_KEY の有無によらずフォールバックの OCR 経路
   * （pdfjs-dist + Tesseract.js）を通す（REQ-29 の検証と同じ手口）。
   */
  test('PDFアップロード時にOCR処理が自動起動する (REQ-27.6)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    // ファイル選択より前に待機を仕掛け、選択を契機に発行される抽出要求を取りこぼさない
    const extractionRequested = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && /\/api\/claude-vision\/extract$/.test(request.url()),
      { timeout: getTimeout(30000) }
    );

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // 1. 以降クリック等の操作を一切行わずに、OCR の抽出要求が発行される
    await extractionRequested;

    // 2. 操作なしのまま、PDF の本文を読み取った抽出テキストが表示される
    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(
      extractedText,
      'REQ-27.6: PDFアップロード後、操作なしにOCRの抽出テキストが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    await expect(
      extractedText,
      'REQ-27.6: 自動起動したOCRが1ページ目の内容を読み取っていない'
    ).toContainText('Concrete Work');
    await expect(
      extractedText,
      'REQ-27.6: 自動起動したOCRが2ページ目の内容を読み取っていない'
    ).toContainText('Rebar Work');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.7: 処理中インジケーター表示
   *
   * OCR 処理が実行中の間、「抽出結果」の領域に処理中インジケーター（role="progressbar"）と
   * 処理中を示す文言が表示され、処理が終わるとインジケーターが消えて結果に置き換わる。
   *
   * 以前は「progressbar / status / aria-live / … / table / alert のいずれかが見える」ことを
   * 待っていた。抽出が終わると「抽出結果」の領域に表が出るため、progressbar を描かない実装でも
   * 表で確実に合格していた（タスク 97.22）。付随的な要素の選言に頼らず、処理中の状態を確定させて
   * 主張する。抽出は Claude Vision の応答（POST /api/claude-vision/extract）を待つため、
   * その応答を保留している間は処理中であることが確定する（REQ-27.8 の検証と同じ手口）。
   *   1. 抽出要求が保留されている間、progressbar と処理中の文言が表示され、結果の表はまだ無い
   *   2. 応答（目印の行を持つ抽出結果）を返すと progressbar が消え、目印の行を持つ表に置き換わる
   */
  test('ファイルアップロード後に処理中インジケーターが表示される (REQ-27.7)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const resultMarker = `REQ277_RESULT_ROW_${Date.now()}`;
    let releaseExtraction: (() => void) | undefined;
    const extractionHeld = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    });
    await page.route('**/api/claude-vision/extract', async (route) => {
      await extractionHeld;
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lineItems: [
              {
                majorCategory: null,
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '仮設工',
                name: resultMarker,
                specification: null,
                quantity: 1,
                unit: '式',
                remarks: null,
              },
            ],
            pageCount: 1,
          }),
        })
        // 判定の失敗でテストが先に終わった場合、ページが閉じた後の応答は捨てる
        .catch(() => undefined);
    });

    try {
      const dialog = page.getByRole('dialog');
      const results = dialog.getByRole('region', { name: '抽出結果' });
      const indicator = results.getByRole('progressbar');

      // ファイル選択より前に待機を仕掛け、選択を契機に発行される抽出要求を取りこぼさない
      const visionRequest = page.waitForRequest(
        (request) =>
          request.method() === 'POST' && /\/api\/claude-vision\/extract$/.test(request.url()),
        { timeout: getTimeout(45000) }
      );
      await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);
      await visionRequest;

      // 1. 応答を保留している（＝OCR 処理が実行中の）間、インジケーターが表示される
      await expect(
        indicator,
        'REQ-27.7: OCR処理の実行中に処理中インジケーター（progressbar）が表示されない'
      ).toBeVisible({ timeout: getTimeout(15000) });
      await expect(
        results,
        'REQ-27.7: OCR処理の実行中に処理中であることを示す文言が表示されない'
      ).toContainText('解析中');
      await expect(
        results.locator('table'),
        'REQ-27.7: 処理中の判定の時点で結果の表が既に出ている（処理中の状態を捉えていない）'
      ).toHaveCount(0);

      // 2. 応答を返すと、インジケーターが消えて結果に置き換わる
      releaseExtraction?.();
      await expect(
        results.locator('table tbody'),
        'REQ-27.7: 処理完了後に抽出結果の表が表示されない'
      ).toContainText(resultMarker, { timeout: getTimeout(45000) });
      await expect(
        indicator,
        'REQ-27.7: 処理完了後も処理中インジケーターが表示されたままである'
      ).toHaveCount(0);
    } finally {
      releaseExtraction?.();
      await page.unroute('**/api/claude-vision/extract');
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-27.8: 処理中のファイル選択の非活性と一括取り込みボタンの不表示
   *
   * 条文 27.8 は「データパースまたはOCR処理が実行中のとき、ファイルアップロードボタンを
   * 非活性にし、一括取り込みボタンを表示しない」。**後半は「非活性」ではなく「表示しない」で
   * ある**（タスク 99.1 で条文の側を実体へ改訂した。経緯と採らなかった案は requirements.md の
   * Requirement 27 の直下に置いた）。一括取り込みボタンは抽出結果に従属する部品で、
   * 実装では `extractor.status === 'completed' && extractor.result && fieldMapping` の枝の
   * 内側に在る。ボタンの `disabled` が見るのは取り込み実行中を表す別の状態（`isImporting`）で
   * あって処理中ではない。
   *
   * 以前は「disabled 状態を捉えた」「処理結果が表示された」のどちらかが観測されれば良い
   * 競争にしており、結果が先に出た環境では disabled の判定が一つも実行されなかった。
   * 抽出は Claude Vision の応答（POST /api/claude-vision/extract）を待つため、
   * その応答を保留すれば処理中の状態を確定的に観測できる。判定後に解放する。
   *
   * **後半は肯定と否定の組で主張する**（タスク 99.1）。否定（処理中に一括取り込みボタンが
   * 0件）だけでは、この画面にそもそも当該ボタンが出ない場合と区別できず恒真へ退化する。
   * そこで同じ区間の中で、抽出を完了させると**同じ綴りの同じボタンが現れる**ことを併せて
   * 主張する。両者が同時に成立しうるのは、表示の有無が処理中かどうかで切り替わる場合に
   * 限られる。抽出の応答は環境（ANTHROPIC_API_KEY）に依らず決定論的に組み立てるため、
   * 保留の解放時に目印の行を持つ結果を返す（REQ-27.7 の検証と同じ手口）。
   */
  test('処理中はファイル選択が非活性化され一括取り込みボタンが表示されない (REQ-27.8)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const resultMarker = `REQ278_RESULT_ROW_${Date.now()}`;
    let releaseExtraction: (() => void) | undefined;
    const extractionHeld = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    });
    await page.route('**/api/claude-vision/extract', async (route) => {
      await extractionHeld;
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lineItems: [
              {
                majorCategory: null,
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '仮設工',
                name: resultMarker,
                specification: null,
                quantity: 1,
                unit: '式',
                remarks: null,
              },
            ],
            pageCount: 1,
          }),
        })
        // 判定の失敗でテストが先に終わった場合、ページが閉じた後の応答は捨てる
        .catch(() => undefined);
    });

    try {
      const dialog = page.getByRole('dialog');
      const bulkImportButton = dialog.getByRole('button', { name: '一括取り込み' });

      // ファイル選択より前に待機を仕掛け、選択を契機に発行される抽出要求を取りこぼさない
      const visionRequest = page.waitForRequest(
        (request) =>
          request.method() === 'POST' && /\/api\/claude-vision\/extract$/.test(request.url()),
        { timeout: getTimeout(45000) }
      );
      await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);
      await visionRequest;

      // 前半: 処理中はファイルアップロードボタン（ファイル選択）が非活性である。
      // この判定の成立をもって「処理中である」が確定するので、後続の否定は処理中の状態を見る
      const filePicker = page.getByLabel('ファイルを選択');
      await expect(filePicker, 'REQ-27.8: 処理中はファイル選択が非活性化される').toBeDisabled({
        timeout: getTimeout(45000),
      });

      // 後半（否定）: 処理中は一括取り込みボタンが描かれない
      await expect(
        bulkImportButton,
        'REQ-27.8: 処理中に一括取り込みボタンが表示されている'
      ).toHaveCount(0);

      // 後半（肯定）: 同じ綴りの同じボタンが、処理が完了すると現れる。
      // これが無いと上の否定は「この画面には当該ボタンが出ない」だけで成立してしまう
      releaseExtraction?.();
      await expect(
        dialog.getByRole('region', { name: '抽出結果' }).locator('table tbody'),
        'REQ-27.8: 前提 — 抽出が完了して結果の表が表示される'
      ).toContainText(resultMarker, { timeout: getTimeout(45000) });
      await expect(
        bulkImportButton,
        'REQ-27.8: 処理の完了後も一括取り込みボタンが表示されない（否定側が恒真である）'
      ).toBeVisible({ timeout: getTimeout(15000) });
      await expect(
        filePicker,
        'REQ-27.8: 処理の完了後もファイル選択が非活性のままである'
      ).toBeEnabled();
    } finally {
      releaseExtraction?.();
      await page.unroute('**/api/claude-vision/extract');
    }
  });
});

test.describe('REQ-28: Excelデータパース', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * タスク 115.188 の是正: quantity-table-generation の受入基準28.2 を名乗る被覆印を取り下げる
   * （ファイル前書きの一覧からも同時に取り下げた）。本区間が主張するのは .xlsx を選んだ
   * ときに Excel の処理経路が起動することだけで、原文28.2（全シートを解析対象とする）は
   * 一度も確かめていない。内容に当たるのは原文28.1（SheetJS で直接読み取る）だが、28.1 は
   * `e2e/requirement-exclusions.json` が「E2Eでは確かめない」と宣言しているため付け替えない。
   * **付け替え先が除外済みであることは取り下げを妨げない。** 取り下げは同居を作らず、
   * 28.2 は未被覆として露出する（本区間が唯一の被覆源であった）。
   * 表題から `(REQ-28.1)` を外し、名乗りと表題の食い違いも解消する。
   *
   * 検証内容: ダイアログ上で .xlsx 拡張子のファイルを選択した際に Excel 処理パスが
   * 起動すること。テキストファイルを .xlsx 拡張子として偽装するとSheetJS処理が走り、
   * エラーになるが、「Excelとして処理を開始する」動作は検証できる。
   */
  test('Excel拡張子(.xlsx)のファイルアップロードでExcel処理パスが起動する', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    // テキストファイルを .xlsx として偽装してアップロード（ZIPマジックバイトを付与し
    // SheetJS の処理パスを確実に通すことで、progressbar かエラーアラートのいずれかを発火させる）
    await fileInput.setInputFiles({
      name: 'fake.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04fake-xlsx-bytes'),
    });

    // 処理開始（progressbar）またはエラー表示のいずれかが表示されることを検証
    // → Excel処理が開始されている証跡
    const progressbar = page.locator('[role="progressbar"]');
    const errorAlert = page.locator('[role="alert"]');
    const eitherVisible = await Promise.race([
      isVisibleWithin(progressbar.first(), getTimeout(10000)),
      isVisibleWithin(errorAlert.first(), getTimeout(10000)),
    ]);

    expect(eitherVisible, 'Excel処理開始の証跡（プログレスまたはエラー）が表示される').toBeTruthy();
  });

  /**
   * @requirement quantity-table-generation/REQ-28.3: 列マッピング機能
   * @requirement quantity-table-generation/REQ-32.1: マッピング先フィールド表示
   *
   * タスク 115.188 の是正（記録）: 従前は受入基準28.5 を名乗っていたが、当時の受入基準28.5 の原文は
   * 「The 数量表管理システム shall 抽出結果のプレビューテーブルに各行のマッピング先フィールドを表示する」
   * であった。本区間の表題・本文が述べる内容に対応するのは受入基準32.1（「The 数量表管理システム shall 抽出結果のプレビューテーブルの各列ヘッダーにマッピング先フィールドのドロップダウンを表示する」
   * ）である。
   *
   * 現況（タスク 97.20、2026-09-15）: 受入基準28.5 は利用者の裁定で「各列の現在のマッピング先
   * フィールドを表示する」へ改められた。その被覆は本区間ではなく、直後の区間（列ごとに選択中の
   * 表示名を主張する検証）が担う。本区間は引き続き 28.3 と 32.1 だけを名乗る。
   *
   * ImportPreviewTable のヘッダーに「のマッピング先」aria-label の select が含まれる
   * （実際にデータが抽出された場合のみ）。
   */
  test('プレビューテーブルにマッピング先フィールドのドロップダウン定義が含まれる (REQ-28.3, REQ-32.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-28.3/32.1 が対象とするのは「抽出された列にマッピング先を用意する」ことであり、
    // 抽出の手段（PDF OCR か Excel パースか）ではない。PDF は Claude Vision
    // （ANTHROPIC_API_KEY 依存）を経由するため、以前は「プレビューが出れば主張し、
    // 出なければエラー表示が出ていることだけを確かめる」分岐になっており、
    // OCR が使えない環境ではマッピング先の判定が一度も実行されなかった。
    // クライアントサイドで決定論的に解析される Excel の資材を用い、無条件に主張する
    // （REQ-32.6・REQ-42.4 の検証と同じ手口）。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // 前提: 抽出結果のプレビューテーブルが表示される（REQ-28.4 の被覆は同じ区間の専用の検証が担う）
    // Excel はインラインプレビュー（REQ-34.3）にも表が出るため、抽出結果の領域の表に限定する
    const previewTable = page.getByRole('region', { name: '抽出結果' }).locator('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // REQ-28.3/32.1: 列ごとにマッピング先のドロップダウンが表示される
    const mappingSelects = page.locator('select[aria-label*="のマッピング先"]');
    await expect(
      mappingSelects.first(),
      'REQ-32.1: マッピング先のドロップダウンが表示されない'
    ).toBeVisible({ timeout: getTimeout(5000) });
    // 資材のヘッダーは「工種・名称・規格・数量・単位」の5列である
    await expect(
      mappingSelects,
      'REQ-28.3: 抽出された全列にマッピング先が用意されない'
    ).toHaveCount(5);
  });

  /**
   * @requirement quantity-table-generation/REQ-28.5: 各列の現在のマッピング先フィールドの表示
   *
   * タスク 97.20 で条文を「各行」から「各列の現在のマッピング先」へ改めた（requirements.md の
   * Requirement 28 の註）。本検証は、抽出結果のプレビューテーブルの列ごとに、**その列の見出しセルの中に**、
   * その列が現在対応付けられているフィールドの**表示名**が出ていることを主張する。
   *
   * 主張しないもの: 表示の手段がドロップダウンであること（32.1）、選択肢の全件（32.2）、
   * 推定の内部値（32.4 は列ごとの選択欄の値を内部値の配列と `toHaveValue` で突き合わせる）。
   *
   * 見出しセル全体の文字列では主張しない。資材の列見出し（工種・名称・規格・数量・単位）は
   * 自動推定の表示名と同じ綴りであり、マッピング先が一切表示されなくても列見出しだけで
   * 一致してしまうためである。選択中の選択肢（`option:checked`）の表示名に限って読む。
   */
  test('プレビューテーブルの各列の見出しにその列の現在のマッピング先フィールドが表示される (REQ-28.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // 列が決定論的に抽出されるよう、クライアントサイドで解析される Excel の資材を用いる
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // Excel はインラインプレビュー（REQ-34.3）にも表が出るため、抽出結果の領域の表に限定する
    const previewTable = page.getByRole('region', { name: '抽出結果' }).locator('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 資材の列見出しと、自動推定で各列が対応付けられるフィールドの表示名（列の並び順）
    const expectedColumns: Array<[string, string]> = [
      ['工種', '工種'],
      ['名称', '名称'],
      ['規格', '規格'],
      ['数量', '数量'],
      ['単位', '単位'],
    ];
    const headerCells = previewTable.locator('thead th');
    await expect(headerCells, '前提: 資材の5列が見出しとして表示される').toHaveCount(
      expectedColumns.length
    );

    for (const [index, [header, targetLabel]] of expectedColumns.entries()) {
      const headerCell = headerCells.nth(index);
      await expect(headerCell, `前提: ${index + 1}列目の見出しが「${header}」である`).toContainText(
        header
      );
      // 「表示する」の主張。DOM に在っても見えなければ利用者は読み取れない。
      // 閉じた選択欄は選択中の選択肢の表示名を自身の枠内に描くが、Playwright は `<option>` 自体を
      // 可視と数えない（変異なしの版でも `option:checked` への toBeVisible は落ちると実測した）。
      // したがって可視性は表示名を描く選択欄に、表示名の中身は選択中の選択肢に問う。
      const targetDisplay = headerCell.locator('select');
      await expect(
        targetDisplay,
        `REQ-28.5: 列「${header}」の見出しにその列の現在のマッピング先が表示されない（不可視）`
      ).toBeVisible();
      const displayedTarget = targetDisplay.locator('option:checked');
      await expect(
        displayedTarget,
        `REQ-28.5: 列「${header}」の見出しにその列の現在のマッピング先「${targetLabel}」が表示されない`
      ).toHaveText(targetLabel);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-28.4: プレビューテーブル表示
   *
   * Excel のデータパースが完了したとき、抽出結果が「抽出結果」の領域にプレビューテーブルとして
   * 表示され、その表がパースした内容（資材 import-items.xlsx の見出し5列と本文の行）を持つことを主張する。
   *
   * タスク 97.23 の是正: 以前は PDF を渡し「最初の table か role="alert" のどちらかが見える」ことだけを
   * 待っていた。条文はデータパース（Excel）を対象とするのに PDF で走り、表を出さずにエラー表示だけを
   * 出す実装でも合格した（Excel の結果に表の代わりに alert を描く変異で合格することを実測した）。
   * 選言を撤去し、Excel で表の存在と中身を無条件に主張する。
   * インラインプレビュー（REQ-34.3）にも同じ表が出るため、判定は「抽出結果」の領域に限定する。
   */
  test('Excelのデータパース完了時に抽出結果がプレビューテーブルとして表示される (REQ-28.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const results = page.getByRole('dialog').getByRole('region', { name: '抽出結果' });
    const previewTable = results.locator('table');
    await expect(
      previewTable,
      'REQ-28.4: データパース完了後、抽出結果のプレビューテーブルが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });

    // 表がパースした内容を持つ（表の存在だけでは中身の欠けた表でも成立するため）
    const headerCells = previewTable.locator('thead th');
    await expect(
      headerCells,
      'REQ-28.4: プレビューテーブルの見出しが資材の5列になっていない'
    ).toHaveCount(5);
    for (const [index, header] of ['工種', '名称', '規格', '数量', '単位'].entries()) {
      // 見出しセル（th）の文字列にはマッピング先の選択欄の選択肢（工種・名称・規格・数量・単位を含む）も
      // 入り、どの列でも一致してしまう。見出しの文字だけを持つ th 直下の div に限って読む。
      await expect(
        headerCells.nth(index).locator(':scope > div'),
        `REQ-28.4: プレビューテーブルの${index + 1}列目の見出しが「${header}」でない`
      ).toHaveText(header);
    }
    const bodyRows = previewTable.locator('tbody tr');
    await expect(
      bodyRows,
      'REQ-28.4: プレビューテーブルに資材の本文の行がちょうど1行表示されない'
    ).toHaveCount(1);
    const cells = bodyRows.first().locator('td');
    for (const [index, value] of ['仮設工', 'E2E取込項目', '標準仕様', '12', '式'].entries()) {
      await expect(
        cells.nth(index),
        `REQ-28.4: プレビューテーブルの本文の行の${index + 1}列目に「${value}」が表示されない`
      ).toHaveText(value);
    }

    // 完了した抽出結果の領域にエラー表示が出ていない（表の代わりにエラーを出す実装を拒む）
    await expect(
      results.getByRole('alert'),
      'REQ-28.4: データパース完了後の抽出結果にエラー表示が出ている'
    ).toHaveCount(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-28.2: Excelファイルの全シートを解析対象とする
   *
   * 見出しを共有し本文が 1 行ずつ異なる 3 枚のシートを持つ資材（import-items-multi-sheet.xlsx、
   * 生成手順は `e2e/fixtures/generate-multi-sheet-xlsx.mjs`）を渡し、抽出結果のプレビューテーブルに
   * **3 枚すべての本文が、シートの並び順に、ちょうど 3 行**現れることを主張する。
   *
   * タスク 100.9 の是正: 本条文の被覆印は
   * `frontend/src/components/quantity-table-import/excel-parser.test.ts` の単体印にしかなく、
   * それは除外台帳（e2e/requirement-exclusions.json）の REQ-28.1 の項が代替検証に挙げているのと
   * 同一のファイルであった（機能名を冠した表記は被覆印として読まれるため、ここでは冠さない）。
   * 兄弟の 28.1（SheetJS で直接読み取る）は「条文が名指すのは出力ではなく手段そのものであり、
   * 画面から弁別できない」として据え置いたが、28.2 が名指すのは**解析の対象範囲**であり、
   * 2 枚目以降のシートの本文が抽出結果に現れるか否かとして画面から弁別できる
   * （`frontend/src/components/quantity-table-import/excel-parser.ts` の `readExcelFile` が
   * `workbook.SheetNames` を回して行を積むため、1 枚でも落とせば行数と中身が食い違う）。
   *
   * シートを 3 枚にしたのは量化子を n=1 / n=2 で済ませないためである（REQ-29.4 の 2 ページ PDF と同じ理由）。
   * 「先頭だけ」「末尾だけ」「先頭 2 枚だけ」のいずれの実装も落ちる。
   *
   * **判定は行の並びをシートの並び順に固定しており、この点で条文より厳格である**（条文は順序を
   * 求めていない）。本番は `workbook.SheetNames`（ブック内の並び）を回すため順序は決定的であり、
   * 決定的な一方を主張することは条文「全シートが対象」の十分な証人になる（タスク 100.6 (iii) の
   * 判定と同型）。また行順の変化はそれ自体が利用者に見える振る舞いの変化である。副作用として、
   * 全シートを読むが順序が違う実装は赤になる（`[...SheetNames].reverse()` で実測。タスク 100.9）。
   * インラインプレビュー（REQ-34.3）にも表が出るため、判定は「抽出結果」の領域に限定する。
   */
  test('Excelの全シートが解析対象となり全シートの本文が抽出結果に現れる (REQ-28.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX_MULTI_SHEET);

    const results = page.getByRole('dialog').getByRole('region', { name: '抽出結果' });
    const previewTable = results.locator('table');
    await expect(
      previewTable,
      'REQ-28.2: 複数シートのExcelのパース完了後、抽出結果のプレビューテーブルが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });

    // 3 枚は同じ見出しを共有するため、抽出結果の列は 5 列に定まる
    const headerCells = previewTable.locator('thead th');
    await expect(
      headerCells,
      'REQ-28.2: プレビューテーブルの見出しが3枚に共通の5列になっていない'
    ).toHaveCount(5);
    for (const [index, header] of ['工種', '名称', '規格', '数量', '単位'].entries()) {
      await expect(
        headerCells.nth(index).locator(':scope > div'),
        `REQ-28.2: プレビューテーブルの${index + 1}列目の見出しが「${header}」でない`
      ).toHaveText(header);
    }

    // 全シートが解析対象である＝3 枚それぞれの本文が現れ、かつ行数は資材どおり 3 行にとどまる
    const bodyRows = previewTable.locator('tbody tr');
    await expect(
      bodyRows,
      'REQ-28.2: 抽出結果の本文が資材の3枚のシート分（3行）になっていない'
    ).toHaveCount(MULTI_SHEET_ROWS.length);
    for (const [rowIndex, expectedRow] of MULTI_SHEET_ROWS.entries()) {
      const cells = bodyRows.nth(rowIndex).locator('td');
      for (const [colIndex, value] of expectedRow.entries()) {
        await expect(
          cells.nth(colIndex),
          `REQ-28.2: ${rowIndex + 1}枚目のシートの本文の${colIndex + 1}列目に「${value}」が表示されない`
        ).toHaveText(value);
      }
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-28.6: 読み取り失敗時のエラー
   *
   * ZIP の署名だけを持ち中身が壊れたバイト列を .xlsx として渡すと、SheetJS の読み取りが失敗する。
   * ダイアログのエラー表示が Excel ファイルの読み取り失敗を告げ、手動入力を促す文言を含むことを
   * 主張する（エラー表示の要素が見えるだけでは、他の警告やリトライボタンだけでも成立するため）。
   */
  test('不正なExcelファイルアップロード時にエラーメッセージと手動入力を促す文言が表示される (REQ-28.6)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04invalid-xlsx-content'),
    });

    const dialog = page.getByRole('dialog');
    const errorAlert = dialog
      .getByRole('alert')
      .filter({ hasText: 'Excelファイルの読み取りに失敗しました' });
    await expect(
      errorAlert,
      'REQ-28.6: エラー表示がExcelファイルの読み取り失敗を告げない'
    ).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(errorAlert, 'REQ-28.6: エラー表示が手動入力を促さない').toContainText(
      '手動入力してください'
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-28.7: テキスト選択可能
   *
   * ImportPreviewTable には userSelect: 'text' が設定されている（テキスト選択可能）。
   */
  test('プレビューテーブルがテキスト選択可能なスタイルを持つ (REQ-28.7)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-28.7 はプレビューテーブルが選択可能であることを対象とする。プレビューが
    // 出なければ判定できないため、抽出が決定論的に成立する Excel の資材を用いる
    // （PDF OCR は ANTHROPIC_API_KEY 依存で、以前はエラー表示だけを見て抜けていた）。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // Excel はインラインプレビュー（REQ-34.3）にも表が出るため、抽出結果の領域の表に限定する
    const previewTable = page.getByRole('region', { name: '抽出結果' }).locator('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 親要素のuser-select検証
    const wrapper = page.locator('div').filter({ has: previewTable }).last();
    const userSelect = await wrapper.evaluate((el: HTMLElement) => getComputedStyle(el).userSelect);
    // user-select が text または 親が auto/text どちらでも選択可能
    expect(['text', 'auto'], 'REQ-28.7: プレビューがテキスト選択不可になっている').toContain(
      userSelect
    );
  });
});

/**
 * Claude Vision API を利用不可（HTTP 503）にし、pdfjs-dist + Tesseract.js の OCR 経路を必ず通す。
 *
 * テスト環境の ANTHROPIC_API_KEY の有無によって経路が変わらないよう、応答を固定する
 * （REQ-30.5: 利用不可ならフォールバックする）。
 */
async function forceClaudeVisionUnavailable(page: Page): Promise<void> {
  await page.route('**/api/claude-vision/extract', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service Unavailable', errorType: 'service_unavailable' }),
    })
  );
}

test.describe('REQ-29: PDF OCR処理の結果表示と失敗時の導線', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-29.7: OCR完了時に抽出テキストとプレビューテーブルを表示
   *
   * 資材 test-text-pdf.pdf は2ページのテキストPDFで、1ページ目に「Concrete Work」、
   * 2ページ目に「Rebar Work」を持つ。抽出テキストの領域が両方を含み、同じダイアログに
   * プレビューテーブル（10欄の名前付きヘッダー。REQ-30.7）が並ぶことを主張する。
   */
  test('OCR処理の完了時に抽出テキストとプレビューテーブルがダイアログ内に表示される (REQ-29.7)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(extractedText, 'REQ-29.7: OCR完了時に抽出テキストが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(
      extractedText,
      'REQ-29.7: 抽出テキストに1ページ目の内容が含まれない'
    ).toContainText('Concrete Work');
    await expect(
      extractedText,
      'REQ-29.7: 抽出テキストに2ページ目の内容が含まれない'
    ).toContainText('Rebar Work');

    const previewTable = dialog.locator('table').first();
    await expect(
      previewTable.locator('thead'),
      'REQ-29.7: OCR完了時にプレビューテーブルが表示されない'
    ).toBeVisible();
    await expect(previewTable.locator('thead')).toContainText('大項目');
    await expect(previewTable.locator('thead')).toContainText('備考');
  });

  /**
   * @requirement quantity-table-generation/REQ-29.8: 抽出結果のテキストを選択・コピーできる状態で表示
   *
   * 条文は「抽出結果のテキストをユーザーが選択・コピーできる状態で表示する」。対象は OCR の
   * **抽出テキスト**であり、Excel のプレビューテーブルを対象とする REQ-28.7 とは別物である
   * （28.7 の判定は同じファイルの別区間にあるが、そちらは PDF の抽出テキストを一度も見ない）。
   *
   * 経路と資材は 29.7 と同じ——Claude Vision を 503 に固定してフォールバックの抽出テキストを得る。
   * 「選択・コピーできる状態」を二つの観測で固定する。
   *   (1) 抽出テキストの要素の算出値 `user-select` が `text` である（選択を禁じていない）
   *   (2) その要素の中身を範囲選択したとき、選択文字列に抽出テキストの本文が現れる
   *       （画面では選択して文字列を読み出すだけで、合否の判定は Node 側の expect が行う）
   */
  test('OCRの抽出テキストが選択・コピーできる状態で表示される (REQ-29.8)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(extractedText, '前提: 抽出テキストが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });

    const extractedTextBody = extractedText.locator('pre[data-testid="import-extracted-text"]');
    await expect(extractedTextBody, '前提: 抽出テキストにPDFの本文が現れない').toContainText(
      'Concrete Work'
    );

    const userSelect = await extractedTextBody.evaluate(
      (el: HTMLElement) => getComputedStyle(el).userSelect
    );
    expect(
      userSelect,
      'REQ-29.8: 抽出テキストが選択できない状態（user-select）で表示されている'
    ).toBe('text');

    // 要素の中身を丸ごと範囲選択し、選択文字列（コピーの対象になる文字列）を読み出す
    const selectedText = await extractedTextBody.evaluate((el: HTMLElement) => {
      const doc = el.ownerDocument;
      const range = doc.createRange();
      range.selectNodeContents(el);
      const selection = doc.defaultView?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? '';
    });
    expect(
      selectedText,
      'REQ-29.8: 抽出テキストを範囲選択してもコピーできる文字列が取り出せない'
    ).toContain('Concrete Work');
  });

  /**
   * @requirement quantity-table-generation/REQ-29.9: OCR失敗時にエラーメッセージを表示し手動入力を促す
   *
   * PDF として読めないバイト列を .pdf として渡すと、Claude Vision 用のページ画像化も
   * pdfjs-dist のテキスト抽出も失敗する。ダイアログのエラー表示が OCR の失敗を告げ、
   * 手動入力を促す文言を含むことを主張する。
   */
  test('OCR処理の失敗時にエラーメッセージと手動入力を促す文言が表示される (REQ-29.9)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf document'),
    });

    const dialog = page.getByRole('dialog');
    const errorAlert = dialog.getByRole('alert').first();
    await expect(errorAlert, 'REQ-29.9: OCR失敗時にエラー表示が出ない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(errorAlert, 'REQ-29.9: エラー表示がOCR処理の失敗を告げない').toContainText(
      'OCR処理に失敗しました'
    );

    await expect(errorAlert, 'REQ-29.9: エラー表示が手動入力を促さない').toContainText(
      '手動入力してください'
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-29.2: PDFの全ページ（1ページ目から最終ページ）を対象にテキスト抽出
   * @requirement quantity-table-generation/REQ-29.3: 十分なテキストが得られたときは抽出テキストをそのまま使用しTesseract OCRを実行しない
   *
   * 条文 29.2 は「PDFの全ページ（1ページ目から最終ページ）を対象にテキスト抽出を行う」。
   * 資材 `test-text-pdf.pdf` はちょうど2ページで、1ページ目にだけ「Concrete Work」、
   * 2ページ目にだけ「Rebar Work」がある。両方が抽出テキストへ現れることは、
   * **1ページ目（最初）と2ページ目（最終）の双方が抽出の対象になった**ことを意味する。
   *
   * 条文 29.3 は「抽出テキストをそのまま使用する（**Tesseract OCRは実行しない**）」で、
   * 後段の否定が主題である。Tesseract の資材（worker と jpn 言語データ）の取得は
   * フォールバック経路の `createWorker('jpn')` でしか起きないため、その0件が
   * 「OCRを実行していない」の観測になる。
   *
   * **否定が空集合への退化で成り立っていないことを、同じ観測器の肯定側で塞ぐ**（99.1 の作法）。
   *   - 要求の購読: Tesseract 資材 0 件と対に、**同じ `page.on('request')` の購読**が
   *     Claude Vision への要求を現に記録していることを主張する
   *   - Canvas の観測器: 前処理の書き戻し（`putImageData`）0 件と対に、**同じ観測器**が
   *     Claude Vision 経路の `toDataURL`（スケール2.0の描画）を現に記録していることを主張する
   *
   * 経路の前件（Claude Vision が使えない）は 29.7 / 29.8 と同じく 503 で作る。
   * Claude Vision が成功すると `extractPdfHybrid` 自体が呼ばれず 29.2 / 29.3 の主題に届かない。
   */
  test('テキストPDFでは全ページの抽出テキストがそのまま使われTesseract OCRは実行されない (REQ-29.2, REQ-29.3)', async ({
    page,
  }) => {
    await installCanvasPipelineObservers(page);
    const requestPaths = watchPdfExtractionRequestPaths(page);

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(extractedText, '前提: 抽出テキストが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    const extractedTextBody = extractedText.locator('pre[data-testid="import-extracted-text"]');

    // REQ-29.2: 1ページ目（最初）と2ページ目（最終）の双方が抽出の対象になっている
    await expect(
      extractedTextBody,
      'REQ-29.2: 抽出テキストに1ページ目（最初のページ）の内容が含まれない'
    ).toContainText('Concrete Work');
    await expect(
      extractedTextBody,
      'REQ-29.2: 抽出テキストに2ページ目（最終ページ）の内容が含まれない'
    ).toContainText('Rebar Work');

    // REQ-29.3 前段: 抽出テキストがそのまま使われている（OCRの読み取り結果に置き換わっていない）
    await expect(
      dialog.locator('section[aria-label="抽出結果"]').getByRole('alert'),
      '前提: 抽出が失敗して終わっている'
    ).toHaveCount(0);

    // 肯定側（同じ購読が現に記録している）
    expect(
      requestPaths.claudeVision.length,
      '前提: Claude Vision APIへの要求が一度も記録されていない（要求の購読が働いていない）'
    ).toBeGreaterThan(0);

    // REQ-29.3 後段: Tesseract OCR は実行されていない
    expect(
      requestPaths.tesseract,
      'REQ-29.3: テキストPDFなのにTesseractの資材が取得されている（OCRが実行されている）'
    ).toEqual([]);

    const observations = await collectCanvasPipelineObservations(page);

    // 肯定側（同じ Canvas の観測器が現に記録している。Claude Vision 経路のスケール2.0の描画）
    expect(
      observations.toDataURL.length,
      '前提: Canvasからの画像化が一度も記録されていない（Canvasの観測器が働いていない）'
    ).toBeGreaterThan(0);

    // 否定側（フォールバックの前処理は一度も走っていない）
    expect(
      observations.putImageData,
      'REQ-29.3: テキストPDFなのに前処理後の画素が書き戻されている（OCRフォールバックへ入っている）'
    ).toEqual([]);
  });

  /**
   * @requirement quantity-table-generation/REQ-29.4: スキャンPDFは各ページをCanvas経由で画像に変換しTesseract.js OCRを実行する
   * @requirement quantity-table-generation/REQ-29.5: スキャンPDFフォールバック時のCanvas描画スケールは4.0
   * @requirement quantity-table-generation/REQ-29.6: グレースケール変換→大津の二値化→水平線除去→垂直線除去の前処理パイプライン
   *
   * 前件（pdfjs-dist のテキスト抽出でテキストがほとんど得られない＝スキャンPDF）は、
   * `/Font` を持たずテキスト描画演算子を一つも含まない画像のみのPDF
   * （`e2e/fixtures/test-scanned-pdf-2pages.pdf`。生成手順は
   * `generate-image-only-pdf.mjs --pages 2`）で作る。テキストPDFを与えたときに
   * 「Tesseract が走らない」ことを主張する上の 29.3 の判定と対になっており、
   * 二つを並べると本ファイルの観測が経路の有無を弁別できることが示される。
   *
   * **資材を2ページにしたのは条文の「各ページ」を n=1 で済ませないためである。**
   * 1ページの `test-scanned-pdf.pdf`（REQ-30.5 の判定が使う）では「各ページ」の量化子が
   * 単数の場合でしか成り立たず、ページを1枚しか処理しない実装でも主張が通ってしまう。
   * 2ページの資材では、画素の読み出し・書き戻し・画像化の回数と、抽出テキストに現れる
   * 画像内の語の出現回数がいずれもページ数と一致することを主張できる。
   *
   * 画面の外から見えるのは抽出テキストだけであり、それだけでは倍率も前処理も弁別できない。
   * 本番が呼ぶ Canvas API へ観測を挟み、**本番が渡した画素そのもの**を測る。
   *
   * - REQ-29.4: fixture のページ数と同じ回数だけ Canvas から画素が読み出され、
   *   その画素が画像へ変換（`toBlob`）され、Tesseract の worker と jpn 言語データが
   *   取得され、**画像の中にしか無い語**が抽出テキストへ現れること
   * - REQ-29.5: 画素を読み出した Canvas の寸法が、fixture の MediaBox 350x175pt に対して
   *   1400x700 であること（＝スケール 4.0）。Claude Vision 経路のスケール 2.0 なら
   *   700x350 になるため、この値は両者を弁別する
   * - REQ-29.6: `getImageData` → `putImageData` → `toBlob` の順に呼ばれ、書き戻された画素が
   *   (a) R=G=B（グレースケール変換）、(b) 値が 0 か 255 のみ（大津の二値化）、
   *   (c) 幅の30%以上の連続黒画素が消えている（水平線除去）、
   *   (d) 高さの30%以上の連続黒画素が消えている（垂直線除去）を同時に満たすこと。
   *   fixture は除去対象の長さの罫線を水平・垂直へ1本ずつ持ち、**前処理前の画素では
   *   両方が閾値を超えている**ことを先に確かめてから、前処理後に下回ることを主張する
   *   （消す対象が無いまま「消えている」が成り立つ空洞を塞ぐ）
   */
  test('スキャンPDFは各ページがCanvas経由で画像化されスケール4.0と前処理パイプラインを経てTesseract OCRが実行される (REQ-29.4, REQ-29.5, REQ-29.6)', async ({
    page,
  }) => {
    await installCanvasPipelineObservers(page);
    const requestPaths = watchPdfExtractionRequestPaths(page);

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    await page
      .getByLabel('ファイルを選択')
      .setInputFiles(path.join(FIXTURES_DIR, 'test-scanned-pdf-2pages.pdf'));

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(extractedText, '前提: フォールバックの抽出テキストが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(
      dialog.locator('section[aria-label="抽出結果"]').getByRole('alert'),
      '前提: フォールバックが失敗して終わっている'
    ).toHaveCount(0);

    // ------------------------------------------------------------------
    // REQ-29.4: 各ページを Canvas 経由で画像に変換し Tesseract.js OCR を実行する
    // ------------------------------------------------------------------
    expect(
      requestPaths.tesseract.filter((p) => p.includes(TESSERACT_WORKER_PATH_MARK)).length,
      'REQ-29.4: Tesseractのworkerスクリプトが取得されていない（OCRが実行されていない）'
    ).toBeGreaterThan(0);
    expect(
      requestPaths.tesseract.filter((p) => p.includes(TESSERACT_LANG_PATH_MARK)).length,
      'REQ-29.4: Tesseractの日本語データが取得されていない（createWorker("jpn")へ到達していない）'
    ).toBeGreaterThan(0);

    const observations = await collectCanvasPipelineObservations(page);

    // ------------------------------------------------------------------
    // REQ-29.5: Canvas 描画スケールが 4.0
    // ------------------------------------------------------------------
    const expectedWidth = SCANNED_PDF_PAGE_WIDTH_PT * EXPECTED_CANVAS_RENDER_SCALE;
    const expectedHeight = SCANNED_PDF_PAGE_HEIGHT_PT * EXPECTED_CANVAS_RENDER_SCALE;
    const scaledObservations = observations.getImageData.filter(
      (o) => o.width === expectedWidth && o.height === expectedHeight
    );
    expect(
      scaledObservations.length,
      `REQ-29.5: スケール ${EXPECTED_CANVAS_RENDER_SCALE} で描画されたCanvas（${expectedWidth}x${expectedHeight}）から画素が読み出されていない。` +
        `観測された寸法: ${JSON.stringify(observations.getImageData.map((o) => `${o.width}x${o.height}`))}`
    ).toBeGreaterThan(0);
    expect(
      observations.getImageData.filter(
        (o) =>
          o.width === SCANNED_PDF_PAGE_WIDTH_PT * CLAUDE_VISION_RENDER_SCALE &&
          o.height === SCANNED_PDF_PAGE_HEIGHT_PT * CLAUDE_VISION_RENDER_SCALE
      ).length,
      `REQ-29.5: Claude Vision経路のスケール ${CLAUDE_VISION_RENDER_SCALE} で描画されたCanvasからOCR用の画素が読み出されている`
    ).toBe(0);

    // REQ-29.4: 「各ページ」。fixture のページ数と同じ回数だけ画像化されている
    expect(
      scaledObservations.length,
      `REQ-29.4: Canvas経由の画素の読み出しの回数がPDFのページ数（${SCANNED_PDF_2PAGES_PAGE_COUNT}）と一致しない`
    ).toBe(SCANNED_PDF_2PAGES_PAGE_COUNT);

    // ------------------------------------------------------------------
    // REQ-29.6: 前処理パイプラインが Canvas 描画と OCR の間に入っている
    // ------------------------------------------------------------------
    const preprocessed = observations.putImageData.filter(
      (o) => o.width === expectedWidth && o.height === expectedHeight
    );
    expect(
      preprocessed.length,
      `REQ-29.6: 前処理後の画素の書き戻しの回数がPDFのページ数（${SCANNED_PDF_2PAGES_PAGE_COUNT}）と一致しない`
    ).toBe(SCANNED_PDF_2PAGES_PAGE_COUNT);

    const horizontalThreshold = Math.floor(expectedWidth * RULE_MIN_RATIO);
    const verticalThreshold = Math.floor(expectedHeight * RULE_MIN_RATIO);

    // ページごとに、読み出し → 書き戻し → 画像化の順序と、書き戻された画素の性質を主張する
    for (let pageIndex = 0; pageIndex < SCANNED_PDF_2PAGES_PAGE_COUNT; pageIndex++) {
      const beforePreprocess = scaledObservations[pageIndex]!;
      const afterPreprocess = preprocessed[pageIndex]!;
      const label = `${pageIndex + 1}ページ目`;

      expect(
        beforePreprocess.order,
        `REQ-29.6: ${label}の画素の読み出しが書き戻しより後に起きている`
      ).toBeLessThan(afterPreprocess.order);

      const blobAfterPreprocess = observations.toBlob.find(
        (o) => o.order > afterPreprocess.order && o.width === expectedWidth
      );
      expect(
        blobAfterPreprocess,
        `REQ-29.4: ${label}の前処理後の画素を画像へ変換していない（Canvas経由の画像化がOCRの前に入っていない）`
      ).toBeDefined();

      // グレースケール変換（前段）と大津の二値化（次段）の結果
      expect(
        afterPreprocess.nonGrayscalePixels,
        `REQ-29.6: ${label}の前処理後にR=G=Bでない画素が残っている（グレースケール変換が働いていない）`
      ).toBe(0);
      expect(
        afterPreprocess.nonBinaryPixels,
        `REQ-29.6: ${label}の前処理後に0でも255でもない画素が残っている（大津の二値化が働いていない）`
      ).toBe(0);

      // 水平線除去と垂直線除去の結果。消す対象が前処理前に在ることを先に確かめる
      expect(
        beforePreprocess.longestDarkRunHorizontal,
        `前提: ${label}の前処理前の画像に水平線除去の対象となる罫線が無い（除去を検査できていない）`
      ).toBeGreaterThanOrEqual(horizontalThreshold);
      expect(
        beforePreprocess.longestDarkRunVertical,
        `前提: ${label}の前処理前の画像に垂直線除去の対象となる罫線が無い（除去を検査できていない）`
      ).toBeGreaterThanOrEqual(verticalThreshold);
      expect(
        afterPreprocess.longestDarkRunHorizontal,
        `REQ-29.6: ${label}の前処理後も幅の30%以上の連続黒画素が残っている（水平線除去が働いていない）`
      ).toBeLessThan(horizontalThreshold);
      expect(
        afterPreprocess.longestDarkRunVertical,
        `REQ-29.6: ${label}の前処理後も高さの30%以上の連続黒画素が残っている（垂直線除去が働いていない）`
      ).toBeLessThan(verticalThreshold);
    }

    // Canvas から画像への変換も、ページ数と同じ回数だけ起きている
    expect(
      observations.toBlob.filter((o) => o.width === expectedWidth).length,
      `REQ-29.4: Canvasから画像への変換の回数がPDFのページ数（${SCANNED_PDF_2PAGES_PAGE_COUNT}）と一致しない`
    ).toBe(SCANNED_PDF_2PAGES_PAGE_COUNT);

    // OCR が画像の中の文字を実際に読み取っている（画像のみのPDFであるため、
    // これらの語は Canvas 経由の画像化と Tesseract OCR を通してしか画面へ現れない）。
    // 2ページは同じ画像を持つため、各語はページ数と同じ回数だけ現れる。
    const extractedTextContent = await extractedText
      .locator('pre[data-testid="import-extracted-text"]')
      .textContent();
    const normalizedText = (extractedTextContent ?? '').replace(/\s/g, '');
    for (const token of SCANNED_PDF_OCR_EXPECTED_TOKENS) {
      expect(
        normalizedText,
        `REQ-29.4: OCRの抽出テキストに画像内の語「${token}」が現れていない`
      ).toContain(token);
    }
    expect(
      normalizedText.split(SCANNED_PDF_OCR_EXPECTED_TOKENS[0]).length - 1,
      `REQ-29.4: OCRの抽出テキストに画像内の語「${SCANNED_PDF_OCR_EXPECTED_TOKENS[0]}」が` +
        `ページ数（${SCANNED_PDF_2PAGES_PAGE_COUNT}）と同じ回数だけ現れていない（一部のページがOCRされていない）`
    ).toBe(SCANNED_PDF_2PAGES_PAGE_COUNT);
  });

  /**
   * @requirement quantity-table-generation/REQ-29.10: OCR処理のタイムアウトを30秒とする
   *
   * ## 除外の根拠が崩れていることを先に述べる
   *
   * 本受入基準は長く「30秒の経過をE2Eで再現するにはブラウザ内の処理を30秒以上止める必要があり、
   * ルートの差し替えでは決定論的に作れない」という理由で除外に在籍していた。**この理由は
   * 二つの事実で崩れている。** (1) タスク96.3 が取り込み経路の `pdf-ocr-extractor.ts` へ
   * 30秒の打ち切り（`OCR_TIMEOUT_MS` と `extractPdfHybridWithTimeout`）を結線した。
   * (2) 上流の `e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts` が、
   * **30秒では終わらない量の仕事を実際に与える**形（150ページの画像のみPDF）で同型の条文
   * （estimate-request/REQ-17.8・19.8）をE2Eで判定する先例を作った。ルートの差し替えではなく
   * 仕事量で作るため、外部の滞留に依存しない。
   *
   * ## 何を主張するか
   *
   * 600ページの画像のみPDF（`e2e/fixtures/test-scanned-pdf-ocr-timeout.pdf`）は、1ページあたり
   * 「スケール4.0の描画 → 前処理 → OCR」を要するため完走に約2分かかる（下に実測を記す）。これを取り込みダイアログへ
   * 与え、**打ち切りが 30 秒で起きること**を、ファイル選択からエラー表示までの経過時間で主張する。
   * 併せて、打ち切りの文言が30秒超過を告げること（本番の `OCR_TIMEOUT_MESSAGE`）と、
   * 抽出結果が出ていないこと（完走していないこと）を主張する。
   *
   * ## 仕事量を150ページから600ページへ増やした理由（タスク100.12。2026-09-18 に実測）
   *
   * **初版が使っていた150ページでは、仕事量が打ち切りの30秒とほぼ同じで、どちらが先に着くかが
   * 実行ごとに入れ替わっていた。** 本ファイルの全件（46件）を走らせて当該判定の画面側の時刻を
   * 記録すると、ある試行では抽出テキストが**ファイル選択の29882ms後**に現れて完走してしまい
   * （エラー表示は最後まで現れない）、直後の再試行では**30643ms**で打ち切りのエラーが現れた。
   * 150ページのOCRの所要は30秒の打ち切りに対して±1秒の差しかなく、**判定は事実上コイン投げで
   * あった**。起票時に観測された `Test timeout of 60000ms exceeded` は、完走してしまった試行で
   * エラー表示を待ち続けた結果の見え方であって、原因ではない（時計の乖離でもない——下の
   * 「時計の選び方」のとおり、経過時間は初版から単調時計で測っている）。
   *
   * そこで**同じ生成器で600ページの資材を新設**した（`e2e/fixtures/generate-image-only-pdf.mjs`。
   * 画像 XObject は全ページで共有されるためファイルは136KBに収まる）。**打ち切りを外したビルド
   * （`OCR_TIMEOUT_MS` を600000へ変えたもの）で完走までを測ると、ファイル選択から117755msであった**
   * （2026-09-18 に実測。150ページの29882msと1ページあたりの所要が一致する）。打ち切りの30秒に対して
   * 約3.9倍であり、環境の揺れで完走が先に着くことはない。
   * 既存の `test-scanned-pdf-multipage.pdf`（150ページ）を作り直さなかったのは、同じ資材を
   * `e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts` と
   * `e2e/specs/estimate-requests/pdf-text-extraction-e2e.spec.ts` が使っており、本タスクの境界の
   * 外だからである（両者も同じ理由で揺れうる。タスク100.12 の報告で申し送る）。
   *
   * ## 本検査だけ実行時間の上限を上げる理由
   *
   * 本検査は**必ず30秒以上かかる**——それが条文の主張そのものだからである。ところが
   * `playwright.config.ts` の既定の上限はローカルで60000msであり、下のエラー表示の待ちに置いた
   * 120000ms は**その中では最後まで使い切れない**。打ち切りが起きない実装のとき、判定は自分の
   * 文言（「30秒では終わらない量のOCR処理が打ち切られていない」）ではなく `Test timeout` という
   * 上限由来の見え方で落ち、**何が壊れたのかを言えない**。そこで `test.setTimeout` で本検査だけ
   * 180000ms とし、待ちの120000msが実際に使い切れるようにする。
   *
   * **これは主張を緩めない。** 上限を上げても、(1) 打ち切りが起きなければエラー表示の待ちが
   * 120000msで尽きて赤になり、(2) 打ち切りが遅れれば下の上限40000msの主張が赤になり、
   * (3) 完走すれば抽出テキストが0件であるという主張が赤になる。**現に、打ち切りを外した変異
   * （本番の `OCR_TIMEOUT_MS` を600000へ変えたビルド）でこの判定が赤になることを実測した**
   * ——落ちたのは上の (1) であり、`Test timeout` ではなく判定自身の文言
   * 「30秒では終わらない量のOCR処理が打ち切られていない」で落ちた（タスク100.12）。
   * 緑になるのは30秒で打ち切られたときだけである。
   *
   * ## 時計の選び方
   *
   * `Date.now()`（壁時計）では測らない。本環境では `setTimeout` を駆動する単調時計と壁時計が
   * 乖離しており、30000ms の `setTimeout` が発火するまでに壁時計は27.4秒ほどしか進まない
   * （上流 spec の注記に実測がある）。壁時計で測ると「30秒より早く終わっている」という誤った像に
   * なるため、画面側の `performance.now()`（`setTimeout` と同じ単調時計）で測る。画面側で記録するのは
   * 時刻2点だけで、判定は Node 側の `expect` が行う。
   *
   * ## 受入幅
   *
   * 下限 29000 は「30秒より早く諦めていない」ことを、上限 40000 は「30秒より長く回していない
   * （＝完走もしていない）」ことを言う。30000 ちょうどに詰めないのは、ファイル選択から打ち切りの
   * タイマーが登録されるまでの前置き（Claude Vision 用のページ画像化と503応答）が必ず加わることと、
   * 打ち切りのコールバックが主スレッドの塞がり具合で遅れうることによる。
   */
  test('取り込みのOCR処理は30秒で打ち切られる (REQ-29.10)', async ({ page }) => {
    // 30秒の打ち切りを観測する検査であるため、既定の上限（ローカル60000ms）では
    // 下のエラー表示の待ち（120000ms）を使い切れない。注記「本検査だけ実行時間の上限を
    // 上げる理由」を参照。
    test.setTimeout(getTimeout(180000));

    await installImportOcrTimingObservers(page);

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    await page
      .getByLabel('ファイルを選択')
      .setInputFiles(path.join(FIXTURES_DIR, 'test-scanned-pdf-ocr-timeout.pdf'));

    const dialog = page.getByRole('dialog');
    const extraction = dialog.locator('section[aria-label="抽出結果"]');
    const errorAlert = extraction.getByRole('alert');
    await expect(
      errorAlert,
      'REQ-29.10: 30秒では終わらない量のOCR処理が打ち切られていない'
    ).toBeVisible({ timeout: getTimeout(120000) });
    await expect(errorAlert, 'REQ-29.10: 打ち切りの表示が30秒の超過を告げていない').toContainText(
      'OCR処理がタイムアウトしました（30秒超過）'
    );

    // 打ち切られた（＝完走していない）こと。器そのものが無いことによる空洞ではないことを、
    // 同じ領域にエラー表示が現に在ること（上の主張）が示している。
    await expect(
      extraction.locator('pre[data-testid="import-extracted-text"]'),
      'REQ-29.10: 打ち切られたはずなのに抽出テキストが表示されている'
    ).toHaveCount(0);

    // 打ち切りが30秒の上限によること。時計は画面側の単調時計を使う（注記を参照）。
    const timing = await collectImportOcrTiming(page);
    expect(timing.fileSelectedAtMs, '前提: ファイル選択の時刻が観測されていない').toBeGreaterThan(
      0
    );
    expect(timing.errorShownAtMs, '前提: エラー表示の時刻が観測されていない').toBeGreaterThan(0);

    const elapsedMs = Math.round(timing.errorShownAtMs - timing.fileSelectedAtMs);
    expect(
      elapsedMs,
      `REQ-29.10: 打ち切りまでが短すぎる（${elapsedMs}ms）。30秒の上限より前に別の要因で終わっている`
    ).toBeGreaterThanOrEqual(29000);
    expect(
      elapsedMs,
      `REQ-29.10: 打ち切りまでが長すぎる（${elapsedMs}ms）。30秒の上限で打ち切られていない`
    ).toBeLessThanOrEqual(40000);
  });
});

/**
 * Tesseract.js は worker スクリプトと言語データを配信元から取得する。数量表インポートの
 * PDF 経路でこの取得が起きるのは `extractWithOcrFallback` → `extractPdfHybrid` →
 * `extractPdfWithOcrFallback` の `createWorker('jpn')` だけである（Claude Vision 経路は
 * `renderPdfPagesToBase64` しか呼ばず tesseract.js を読み込まない）。
 *
 * 配信元のホスト名ではなく**パス**で見分ける。配信元が環境で食い違っても観測が全件外れて
 * 素通りしないようにするためである（`e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts`
 * と同じ作法）。
 */
const TESSERACT_WORKER_PATH_MARK = '/tesseract.js@';
const TESSERACT_LANG_PATH_MARK = '/@tesseract.js-data/jpn/';

/** Tesseract の資材の取得パスを記録し始める（進行中も追記される）。 */
function watchTesseractAssetRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    const requestPath = new URL(request.url()).pathname;
    if (
      requestPath.includes(TESSERACT_WORKER_PATH_MARK) ||
      requestPath.includes(TESSERACT_LANG_PATH_MARK)
    ) {
      paths.push(requestPath);
    }
  });
  return paths;
}

/** Claude Vision API の抽出エンドポイントのパス。 */
const CLAUDE_VISION_EXTRACT_PATH_MARK = '/api/claude-vision/extract';

/**
 * PDF 抽出経路の要求を**一つの購読**で記録する。
 *
 * Tesseract 資材の取得（フォールバック経路でしか起きない）と Claude Vision API への要求を
 * 同じ `page.on('request')` で拾うのは、「Tesseract の取得が0件」という否定の主張が
 * *購読そのものが死んでいる*ことによる空洞でないことを、同じ購読が拾った肯定側
 * （Claude Vision への要求が現に記録されている）で示すためである（99.1 の作法）。
 *
 * 配信元のホスト名ではなく**パス**で見分ける。配信元が環境で食い違っても観測が全件外れて
 * 素通りしないようにするためである。
 *
 * @param page Playwright のページ
 * @returns 記録された経路別のパスの配列（進行中も追記される）
 */
function watchPdfExtractionRequestPaths(page: Page): {
  tesseract: string[];
  claudeVision: string[];
} {
  const tesseract: string[] = [];
  const claudeVision: string[] = [];
  page.on('request', (request) => {
    const requestPath = new URL(request.url()).pathname;
    if (
      requestPath.includes(TESSERACT_WORKER_PATH_MARK) ||
      requestPath.includes(TESSERACT_LANG_PATH_MARK)
    ) {
      tesseract.push(requestPath);
    }
    if (requestPath.includes(CLAUDE_VISION_EXTRACT_PATH_MARK)) {
      claudeVision.push(requestPath);
    }
  });
  return { tesseract, claudeVision };
}

test.describe('REQ-30: Claude Vision APIが利用できないときのOCRフォールバック', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-30.5: Claude Vision API利用不可時のpdfjs-dist + Tesseract.jsフォールバック
   *
   * 条文は「Claude Vision APIが利用できない場合（ANTHROPIC_API_KEY未設定、HTTP 503等）、
   * フォールバックとしてpdfjs-dist + Tesseract.jsによるOCR処理を実行する」。
   *
   * **前件**は Claude Vision API の応答を HTTP 503（条文が名指しする形）に固定して作る。
   * 503 が現に返っていることを応答の観測で確かめてから後件を主張する。
   *
   * **後件**は画像のみのPDF（`e2e/fixtures/test-scanned-pdf.pdf`。`/Font` を持たず
   * テキスト描画演算子を一つも含まない）を入力に用いて、二つの engine が両方走ったことを観測する。
   *   - Tesseract.js: worker スクリプトと日本語データの取得が起きる（上の註のとおり、
   *     この取得は OCR フォールバックの中の `createWorker('jpn')` でしか起きない）
   *   - pdfjs-dist: 画像の中にしか存在しない語が抽出テキストへ現れる。この語が現れるには
   *     pdfjs-dist が各ページを Canvas へ描いた画素を Tesseract が読む経路を通るほかなく、
   *     503 で終わった Claude Vision 経路からは決して現れない（同経路の抽出テキストは
   *     API 応答の JSON である）
   *
   * テキストPDFを使うと `extractPdfHybrid` が Tesseract を実行しない（REQ-29.3）ため、
   * 条文が名指しする2つの engine のうち片方しか観測できない。資材に画像のみのPDFを選ぶのは
   * そのためである。
   */
  test('Claude Vision APIが503のときpdfjs-dist + Tesseract.jsのOCRフォールバックが実行される (REQ-30.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const visionPath = /\/api\/claude-vision\/extract$/;
    const visionResponseStatuses: number[] = [];
    page.on('response', (response) => {
      if (visionPath.test(new URL(response.url()).pathname)) {
        visionResponseStatuses.push(response.status());
      }
    });
    const tesseractAssetPaths = watchTesseractAssetRequests(page);

    await forceClaudeVisionUnavailable(page);

    const scannedPdf = path.join(FIXTURES_DIR, 'test-scanned-pdf.pdf');
    await page.getByLabel('ファイルを選択').setInputFiles(scannedPdf);

    const dialog = page.getByRole('dialog');
    const results = dialog.getByRole('region', { name: '抽出結果' });
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(
      extractedText,
      'REQ-30.5: Claude Visionが利用できないのにフォールバックの抽出結果が出ない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    await expect(
      results.getByRole('alert'),
      'REQ-30.5: フォールバックが失敗して終わっている'
    ).toHaveCount(0);

    // 前件: Claude Vision API が 503（利用できない）で返っている
    expect(
      visionResponseStatuses,
      '前提: Claude Vision APIへの要求が一度も発行されていない'
    ).not.toHaveLength(0);
    expect(
      visionResponseStatuses.filter((status) => status !== 503),
      '前提: Claude Vision APIが503以外で応答した（前件が成立していない）'
    ).toHaveLength(0);

    // 後件(1): Tesseract.js の OCR が走った
    expect(
      tesseractAssetPaths.filter((p) => p.includes(TESSERACT_WORKER_PATH_MARK)).length,
      'REQ-30.5: Tesseractのworkerスクリプトが取得されていない（OCRフォールバックへ入っていない）'
    ).toBeGreaterThan(0);
    expect(
      tesseractAssetPaths.filter((p) => p.includes(TESSERACT_LANG_PATH_MARK)).length,
      'REQ-30.5: Tesseractの日本語データが取得されていない（createWorker("jpn")へ到達していない）'
    ).toBeGreaterThan(0);

    // 後件(2): pdfjs-dist が描いた画素を Tesseract が読み取った結果が抽出テキストに現れる
    const extractedTextContent = await extractedText
      .locator('pre[data-testid="import-extracted-text"]')
      .textContent();
    const normalizedText = (extractedTextContent ?? '').replace(/\s/g, '');
    for (const token of SCANNED_PDF_OCR_EXPECTED_TOKENS) {
      expect(
        normalizedText,
        `REQ-30.5: フォールバックの抽出テキストに画像内の語「${token}」が現れていない`
      ).toContain(token);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-30.1: Claude Vision APIが利用可能な場合は優先的に使用する
   *
   * 条文は「PDFファイルのOCR処理が開始されたとき、Claude Vision APIが利用可能な場合は
   * Claude Vision APIを**優先的に**使用する」。
   *
   * **前件**（利用可能）は、抽出エンドポイントの応答を 200 に固定して作る。テスト環境の
   * backend は `ANTHROPIC_API_KEY` を持たず素では 503 を返すため、利用可能な状態は
   * ルートの差し替えでしか作れない（30.5 が 503 を差し替えて利用不可を作るのと対）。
   * 200 が現に返っていることを応答の観測で確かめてから後件を主張する。
   *
   * **後件**（優先的に使用する）は、入力に**画像のみのPDF**を選ぶことで意味を持たせる。
   * 同じ入力に対してフォールバック経路が走れば、抽出テキストは OCR の読み取り結果
   * （`SCANNED_PDF_OCR_EXPECTED_TOKENS` の語）になり、応答へ入れた目印は決して現れない。
   * したがって「目印が画面へ出ている」ことが、Claude Vision の結果が採られたことの観測になる。
   *
   * **否定の主張が空集合への退化で成り立っていないことを、同じ観測器の肯定側で塞ぐ**（99.1）。
   *   - 要求の購読: Tesseract 資材 0 件と対に、**同じ購読**が Claude Vision への要求を記録している
   *   - Canvas の観測器: スケール4.0の画素の読み出し 0 件と対に、**同じ観測器**が
   *     Claude Vision 経路の `toDataURL` を記録している
   */
  test('Claude Vision APIが利用可能なときはClaude Vision APIが優先して使われる (REQ-30.1)', async ({
    page,
  }) => {
    /** Claude Vision の応答にだけ入れる目印。OCR の読み取り結果には決して現れない綴りにする。 */
    const VISION_ONLY_MARKER = 'ビジョン優先マーカ9F3';

    await installCanvasPipelineObservers(page);
    const requestPaths = watchPdfExtractionRequestPaths(page);

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const visionPath = /\/api\/claude-vision\/extract$/;
    const visionResponseStatuses: number[] = [];
    page.on('response', (response) => {
      if (visionPath.test(new URL(response.url()).pathname)) {
        visionResponseStatuses.push(response.status());
      }
    });

    // 前件: Claude Vision API が利用可能（200 で表データを返す）
    await page.route('**/api/claude-vision/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lineItems: [
            {
              majorCategory: '建築工事',
              middleCategory: '外装',
              minorCategory: '塗装',
              customCategory: '',
              workType: '塗装工',
              name: VISION_ONLY_MARKER,
              specification: 'AEP',
              quantity: 12.5,
              unit: 'm2',
              remarks: '',
            },
          ],
          pageCount: 1,
        }),
      })
    );

    await page
      .getByLabel('ファイルを選択')
      .setInputFiles(path.join(FIXTURES_DIR, 'test-scanned-pdf.pdf'));

    const dialog = page.getByRole('dialog');
    const extraction = dialog.locator('section[aria-label="抽出結果"]');
    const previewTable = extraction.getByRole('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(extraction.getByRole('alert'), '前提: 抽出が失敗して終わっている').toHaveCount(0);

    // 前件の検算: Claude Vision API が 200（利用可能）で応答している
    expect(
      visionResponseStatuses,
      '前提: Claude Vision APIへの要求が一度も発行されていない'
    ).not.toHaveLength(0);
    expect(
      visionResponseStatuses.filter((status) => status !== 200),
      '前提: Claude Vision APIが200以外で応答した（前件が成立していない）'
    ).toHaveLength(0);

    // 後件(1): 画面に出ている抽出結果が Claude Vision の応答そのものである
    await expect(
      previewTable,
      'REQ-30.1: Claude Vision APIの応答がプレビューテーブルに現れていない'
    ).toContainText(VISION_ONLY_MARKER);
    await expect(
      dialog
        .getByRole('region', { name: '抽出テキスト' })
        .locator('pre[data-testid="import-extracted-text"]'),
      'REQ-30.1: Claude Vision APIの応答が抽出テキストに現れていない'
    ).toContainText(VISION_ONLY_MARKER);

    // 後件(2): pdfjs-dist + Tesseract.js のフォールバックへ落ちていない（＝優先されている）
    expect(
      requestPaths.claudeVision.length,
      '前提: Claude Vision APIへの要求が購読に記録されていない'
    ).toBeGreaterThan(0);
    expect(
      requestPaths.tesseract,
      'REQ-30.1: Claude Vision APIが利用可能なのにTesseractの資材が取得されている（フォールバックが走っている）'
    ).toEqual([]);

    const observations = await collectCanvasPipelineObservations(page);
    expect(
      observations.toDataURL.length,
      '前提: Canvasからの画像化が一度も記録されていない（Canvasの観測器が働いていない）'
    ).toBeGreaterThan(0);
    expect(
      observations.getImageData.filter(
        (o) =>
          o.width === SCANNED_PDF_PAGE_WIDTH_PT * EXPECTED_CANVAS_RENDER_SCALE &&
          o.height === SCANNED_PDF_PAGE_HEIGHT_PT * EXPECTED_CANVAS_RENDER_SCALE
      ).length,
      'REQ-30.1: Claude Vision APIが利用可能なのにOCRフォールバックのスケール4.0の描画が行われている'
    ).toBe(0);

    // OCR の読み取り結果が画面を占めていないこと（目印と読み取り結果の取り違えを塞ぐ）
    await expect(
      previewTable,
      'REQ-30.1: プレビューテーブルにOCRの読み取り結果が現れている'
    ).not.toContainText(SCANNED_PDF_OCR_EXPECTED_TOKENS[0]);
  });

  /**
   * @requirement quantity-table-generation/REQ-30.4: Claude APIのレスポンスのJSON表データを数量項目フィールドへ対応づける
   *
   * 条文は「Claude APIのレスポンスからJSON形式の表データを抽出し、数量項目フィールド
   * （大項目・中項目・小項目・任意分類・工種・名称・規格・数量・単位・備考）にマッピングする」。
   * 中黒で並ぶ10欄すべてが対象であり、**どの欄がどこへ入るか**が主題である。
   *
   * 応答の10欄へ**互いに区別できる目印**を入れ、プレビューテーブルの見出しの並びと
   * データ行のセルの並びを**10欄ぶん一括で**突き合わせる。1欄でも入れ替わればこの主張は落ちる
   * （欄ごとに分けて主張すると、二つの欄が入れ替わったときに両方の主張が同時に壊れて
   * 「どちらの欄か」が読めなくなるため、順序の同一性は一括で固定する）。
   *
   * 前件は 30.1 と同じく応答を 200 に固定して作る。入力は画像のみのPDFで、
   * フォールバックの OCR からはこれらの目印が決して現れない。
   */
  test('Claude Vision APIの応答が数量項目フィールドの10欄へ対応づけられる (REQ-30.4)', async ({
    page,
  }) => {
    /** 応答の各欄へ入れる目印。欄ごとに異なる綴りにして入れ替わりを検出できるようにする。 */
    const VISION_FIELD_VALUES = {
      majorCategory: 'V大項目7A',
      middleCategory: 'V中項目7B',
      minorCategory: 'V小項目7C',
      customCategory: 'V任意分類7D',
      workType: 'V工種7E',
      name: 'V名称7F',
      specification: 'V規格7G',
      quantity: 12.5,
      unit: 'V単位7H',
      remarks: 'V備考7I',
    } as const;
    /** 数量項目フィールドの並び（条文の中黒列挙の順）。 */
    const EXPECTED_HEADERS = [
      '大項目',
      '中項目',
      '小項目',
      '任意分類',
      '工種',
      '名称',
      '規格',
      '数量',
      '単位',
      '備考',
    ];
    const EXPECTED_CELLS = [
      VISION_FIELD_VALUES.majorCategory,
      VISION_FIELD_VALUES.middleCategory,
      VISION_FIELD_VALUES.minorCategory,
      VISION_FIELD_VALUES.customCategory,
      VISION_FIELD_VALUES.workType,
      VISION_FIELD_VALUES.name,
      VISION_FIELD_VALUES.specification,
      String(VISION_FIELD_VALUES.quantity),
      VISION_FIELD_VALUES.unit,
      VISION_FIELD_VALUES.remarks,
    ];

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const visionPath = /\/api\/claude-vision\/extract$/;
    const visionResponseStatuses: number[] = [];
    page.on('response', (response) => {
      if (visionPath.test(new URL(response.url()).pathname)) {
        visionResponseStatuses.push(response.status());
      }
    });

    await page.route('**/api/claude-vision/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lineItems: [VISION_FIELD_VALUES], pageCount: 1 }),
      })
    );

    await page
      .getByLabel('ファイルを選択')
      .setInputFiles(path.join(FIXTURES_DIR, 'test-scanned-pdf.pdf'));

    const dialog = page.getByRole('dialog');
    const extraction = dialog.locator('section[aria-label="抽出結果"]');
    const previewTable = extraction.getByRole('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(extraction.getByRole('alert'), '前提: 抽出が失敗して終わっている').toHaveCount(0);
    expect(
      visionResponseStatuses.filter((status) => status !== 200),
      '前提: Claude Vision APIが200以外で応答した（前件が成立していない）'
    ).toHaveLength(0);

    // 見出しの並びが数量項目フィールドの10欄である
    await expect
      .poll(
        () =>
          previewTable
            .locator('thead th > div')
            .allTextContents()
            .then((texts) => texts.map((t) => t.trim())),
        {
          message: 'REQ-30.4: プレビューテーブルの見出しが数量項目フィールドの10欄の並びでない',
          timeout: getTimeout(10000),
        }
      )
      .toEqual(EXPECTED_HEADERS);

    // 応答の各欄が、対応する欄の位置へ入っている
    await expect
      .poll(
        () =>
          previewTable
            .locator('tbody tr')
            .first()
            .locator('td')
            .allTextContents()
            .then((texts) => texts.map((t) => t.trim())),
        {
          message:
            'REQ-30.4: Claude Vision APIの応答が数量項目フィールドの10欄へ対応づけられていない（欄の入れ替わりまたは欠落）',
          timeout: getTimeout(10000),
        }
      )
      .toEqual(EXPECTED_CELLS);
  });

  /**
   * @requirement quantity-table-generation/REQ-30.6: Claude Vision APIのタイムアウト・エラー時のOCRフォールバック
   *
   * 条文は「Claude Vision APIリクエストが**タイムアウトまたはエラー**となった場合、
   * フォールバックとして pdfjs-dist + Tesseract.js による OCR 処理を実行する」。
   * 30.5 の前件（HTTP 503 ＝ API が利用できない）とは別の前件であり、ここでは
   * **要求そのものが時間切れで失敗する**形を `route.abort('timedout')` で作る。
   * 応答は一度も返らないため、30.5 の「503 で応答した」とは観測できる痕跡も異なる。
   *
   * 後件は 30.5 と同じく二つの engine が両方走ったことで観測する。
   *   - Tesseract.js: worker スクリプトと日本語データの取得が起きる
   *   - pdfjs-dist: 画像の中にしか無い語が抽出テキストへ現れる（Canvas へ描いた画素を
   *     Tesseract が読む経路を通るほかなく、失敗した Claude Vision 経路からは現れない）
   */
  test('Claude Vision APIの要求がタイムアウトしたときpdfjs-dist + Tesseract.jsのOCRフォールバックが実行される (REQ-30.6)', async ({
    page,
  }) => {
    const requestPaths = watchPdfExtractionRequestPaths(page);

    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const visionPath = /\/api\/claude-vision\/extract$/;
    const visionFailures: string[] = [];
    const visionResponseStatuses: number[] = [];
    page.on('requestfailed', (request) => {
      if (visionPath.test(new URL(request.url()).pathname)) {
        visionFailures.push(request.failure()?.errorText ?? 'unknown');
      }
    });
    page.on('response', (response) => {
      if (visionPath.test(new URL(response.url()).pathname)) {
        visionResponseStatuses.push(response.status());
      }
    });

    // 前件: Claude Vision API への要求が時間切れで失敗する
    await page.route('**/api/claude-vision/extract', (route) => route.abort('timedout'));

    await page
      .getByLabel('ファイルを選択')
      .setInputFiles(path.join(FIXTURES_DIR, 'test-scanned-pdf.pdf'));

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(
      extractedText,
      'REQ-30.6: Claude Vision APIがタイムアウトしたのにフォールバックの抽出結果が出ない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    await expect(
      dialog.locator('section[aria-label="抽出結果"]').getByRole('alert'),
      'REQ-30.6: フォールバックが失敗して終わっている'
    ).toHaveCount(0);

    // 前件の検算: 要求は発行され、応答は一度も返らずに時間切れで失敗している
    expect(
      requestPaths.claudeVision.length,
      '前提: Claude Vision APIへの要求が一度も発行されていない'
    ).toBeGreaterThan(0);
    expect(
      visionFailures.length,
      '前提: Claude Vision APIへの要求が失敗として記録されていない（前件が成立していない）'
    ).toBeGreaterThan(0);
    expect(
      visionResponseStatuses,
      '前提: Claude Vision APIが応答を返している（時間切れの前件になっていない）'
    ).toEqual([]);

    // 後件(1): Tesseract.js の OCR が走った
    expect(
      requestPaths.tesseract.filter((p) => p.includes(TESSERACT_WORKER_PATH_MARK)).length,
      'REQ-30.6: Tesseractのworkerスクリプトが取得されていない（OCRフォールバックへ入っていない）'
    ).toBeGreaterThan(0);
    expect(
      requestPaths.tesseract.filter((p) => p.includes(TESSERACT_LANG_PATH_MARK)).length,
      'REQ-30.6: Tesseractの日本語データが取得されていない（createWorker("jpn")へ到達していない）'
    ).toBeGreaterThan(0);

    // 後件(2): pdfjs-dist が描いた画素を Tesseract が読み取った結果が抽出テキストに現れる
    const fallbackText = await extractedText
      .locator('pre[data-testid="import-extracted-text"]')
      .textContent();
    const normalizedFallbackText = (fallbackText ?? '').replace(/\s/g, '');
    for (const token of SCANNED_PDF_OCR_EXPECTED_TOKENS) {
      expect(
        normalizedFallbackText,
        `REQ-30.6: フォールバックの抽出テキストに画像内の語「${token}」が現れていない`
      ).toContain(token);
    }
  });
});

test.describe('REQ-31: 抽出結果から数量項目への一括取り込み', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-31.1: 「一括取り込み」ボタン
   *
   * 条文 31.1 は「抽出結果のプレビューテーブルの下に『一括取り込み』ボタンを表示する」。
   *
   * Task 98.2: 従前の判定は PDF（Claude Vision 経由＝ANTHROPIC_API_KEY 依存）を選び、
   * 「一括取り込みボタンかリトライボタンのどちらかが先に見えれば合格」の競争だった。
   * 抽出が失敗してリトライボタンだけが出た場合にも合格するため、条文が求める
   * 「一括取り込みボタンの表示」を一度も確かめない（壊れた PDF を与えた計測で、競争は
   * リトライ側を掴み、一括取り込みボタンが0件のまま合格することを実測した）。
   * クライアントサイドで決定論的に解析される Excel の資材を用い、抽出結果の領域に
   * プレビューテーブルがちょうど1つ出ること・その下に「一括取り込み」ボタンが在ること・
   * 抽出の失敗（エラー表示とリトライボタン）が無いことを無条件に主張する
   * （97.22 / 98.1 と同じ手口）。
   */
  test('抽出結果のプレビューテーブルの下に「一括取り込み」ボタンが表示される (REQ-31.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const extraction = page.getByRole('dialog').locator('section[aria-label="抽出結果"]');

    // 31.1 が「下に」と述べる対象。位置関係の主張を一意にするため、ちょうど1つであることも固定する
    const previewTable = extraction.getByRole('table');
    await expect(previewTable, 'REQ-31.1: 抽出結果のプレビューテーブルが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(
      previewTable,
      'REQ-31.1: 抽出結果のプレビューテーブルがちょうど1つでない'
    ).toHaveCount(1);

    const importBtn = extraction.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn, 'REQ-31.1: 「一括取り込み」ボタンが表示されない').toBeVisible({
      timeout: getTimeout(10000),
    });

    // 「プレビューテーブルの下に」。レイアウト擬似クラスで位置関係ごと主張する
    // （内側のセレクタを文書ルートから綴り、インラインプレビュー側の表と取り違えないようにする）
    const importBtnBelowPreviewTable = page.locator(
      'section[aria-label="抽出結果"] button[aria-label="一括取り込み"]:below(section[aria-label="抽出結果"] table)'
    );
    await expect(
      importBtnBelowPreviewTable,
      'REQ-31.1: 「一括取り込み」ボタンがプレビューテーブルの下に無い'
    ).toHaveCount(1);

    // 抽出が失敗した経路（エラー表示とリトライ）で合格しないことを併せて固定する
    await expect(
      extraction.getByRole('alert'),
      'REQ-31.1: 抽出結果の領域にエラー表示が出ている'
    ).toHaveCount(0);
    await expect(
      extraction.getByRole('button', { name: 'リトライ' }),
      'REQ-31.1: 抽出が失敗しリトライボタンが表示されている'
    ).toHaveCount(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-31.2: 取り込み先グループ選択UI
   */
  test('「一括取り込み」クリックで取り込み先グループ選択UIが表示される (REQ-31.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-31.2 は「一括取り込みを押すと取り込み先グループ選択UIを表示する」ことを対象と
    // する。以前は「一括取り込みが出れば押して主張し、出なければリトライの表示だけを
    // 確かめる」分岐で、OCR が使えない環境では選択UIの判定が実行されなかった。
    // 抽出が決定論的に成立する Excel の資材を用い、無条件に主張する。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const importBtn = page.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn, '前提: 抽出完了後に一括取り込みボタンが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });

    await importBtn.click();

    // グループ選択UIが表示される
    const groupSelector = page.getByRole('heading', { name: '取り込み先グループを選択' });
    await expect(groupSelector, 'REQ-31.2: 取り込み先グループ選択UIが表示されない').toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加
   * @requirement quantity-table-generation/REQ-31.4: 自動入力
   * @requirement quantity-table-generation/REQ-31.5: 計算方法「標準」
   * @requirement quantity-table-generation/REQ-31.6: 完了メッセージ
   * @requirement quantity-table-generation/REQ-31.7: 確認・修正促し
   * @requirement quantity-table-generation/REQ-31.8: 一括取り込み後の編集可能
   * @requirement quantity-table-generation/REQ-31.9: 既存項目末尾追加
   *
   * 一括取り込み実行後、完了メッセージと確認・修正促進メッセージが表示される。
   * convertToQuantityItems により計算方法は「STANDARD」として設定される（field-mapping.ts）。
   *
   * Task 98.1: 最後の判定が「完了メッセージ**または**失敗メッセージ」の選言だったため、
   * 取り込みが失敗しても合格した（31.4 / 31.5 / 31.7 / 31.8 / 31.9 の E2E の被覆印は
   * この区間にしか無い）。選言を撤去し、条文ごとに観測できる挙動を固定する。
   * 表題は `scripts/coverage-mark-adjudication.md` が逐語で引くため据え置く。
   */
  test('一括取り込み実行後、完了メッセージが表示される (REQ-31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 前提（REQ-31.9）: 取り込み先グループに既存の数量項目を1行用意する。
    // 末尾追加と既存項目の非上書きは、既存項目が在る状態でしか観測できない。
    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard, '前提: 取り込み先の数量グループが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    const itemRows = groupCard.locator('[data-testid="quantity-item-row"]');
    const rowsBefore = await itemRows.count();
    await addQuantityItemRows(groupCard, rowsBefore + 1);
    const existingName = `E2E既存項目_${Date.now()}`;
    await fillItemRequiredFields(itemRows.nth(rowsBefore), { name: existingName });
    // 既存項目を保存して永続化する（REQ-42.5）。既存項目が「保存済みの項目」である状態で
    // 末尾追加と非上書きを観測するため、また取り込んだ行との区別を id の有無へ寄せないため。
    await saveQuantityTableDraft(page);
    await expect(
      itemRows.nth(rowsBefore).getByLabel('名称', { exact: true }),
      '前提: 既存項目が保存後も保持される'
    ).toHaveValue(existingName);

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-31.3〜31.9 が対象とするのは「抽出結果を数量項目へ取り込む」挙動であり、
    // 抽出の手段（PDF OCR か Excel パースか）ではない。PDF は Claude Vision
    // （ANTHROPIC_API_KEY 依存）を経由するため、失敗時に検証を丸ごと飛ばす関門が
    // 置かれていた。クライアントサイドで決定論的に解析される Excel の資材を用いれば、
    // 環境に依らず抽出が成立し、関門を置かずに済む（REQ-42.4 の検証と同じ手口）。
    // REQ-31.4 は10欄への自動入力を求めるため、10欄すべてを持つ資材を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX_ALL_FIELDS);

    const importBtn = page.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn, '前提: 抽出完了後に一括取り込みボタンが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    await importBtn.click();

    // グループ選択 → 最初のグループを選択。
    // 一括取り込みを押せた以上、グループ選択UIは必ず出る。出なければ取り込みが
    // 壊れているということであり、黙って戻ると REQ-31.3〜31.9 の検証が丸ごと消える。
    const dialog = page.getByRole('dialog');
    const groupSelector = page.getByRole('heading', { name: '取り込み先グループを選択' });
    await expect(groupSelector).toBeVisible({ timeout: getTimeout(5000) });

    // 利用可能な最初のグループ選択ボタン（ダイアログ内に限定し、項目数表記 "(N項目)"
    // を含む実グループ選択ボタンのみをマッチさせる）
    // 取り込み先グループは beforeAll で1件作成し保存済みである（サーバー側に存在する）。
    // 以前は「候補が見えなければキャンセルして戻る」形で、前提が崩れると
    // REQ-31.3〜31.9 の検証が丸ごと消えていた。前提を無条件に主張する。
    const groupButton = dialog
      .locator('button')
      .filter({ hasText: /\(\d+項目\)/ })
      .first();
    await expect(
      groupButton,
      '前提: 事前準備で作成した取り込み先グループが選択候補に表示される'
    ).toBeVisible({ timeout: getTimeout(10000) });

    await groupButton.click();

    // REQ-31.6: 取り込まれた項目数（資材のデータ行は1行）を含む完了メッセージが出る。
    const importMessage = dialog.getByText(/数量項目を取り込みました/);
    await expect(
      importMessage,
      'REQ-31.6: 取り込まれた項目数を含む完了メッセージが表示されない'
    ).toHaveText(/1件の数量項目を取り込みました/, { timeout: getTimeout(15000) });

    // REQ-31.7: 取り込み結果の確認・修正を促すメッセージが出る。
    await expect(
      importMessage,
      'REQ-31.7: 取り込み結果の確認・修正を促すメッセージが表示されない'
    ).toHaveText(/取り込み結果を確認・修正してください/);

    // 失敗メッセージは出ていない（同じテスト内で完了メッセージの実在を示している）。
    await expect(dialog.getByText(/取り込みに失敗しました/), '取り込みが失敗している').toHaveCount(
      0
    );

    // ダイアログを閉じて編集画面の行を観測する。
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toHaveCount(0, { timeout: getTimeout(10000) });

    // REQ-31.3 / REQ-31.9: 抽出の1行が数量項目として、既存項目の末尾に追加される
    // （既存項目は上書きされない）。
    await expect(
      itemRows,
      'REQ-31.3/31.9: 既存項目を保ったまま抽出行が追加されていない'
    ).toHaveCount(rowsBefore + 2, { timeout: getTimeout(10000) });
    await expect(
      itemRows.nth(rowsBefore).getByLabel('名称', { exact: true }),
      'REQ-31.9: 既存項目が上書きされている'
    ).toHaveValue(existingName);

    const importedRow = itemRows.nth(rowsBefore + 1);
    await expect(
      importedRow.getByLabel('名称', { exact: true }),
      'REQ-31.9: 取り込んだ項目が既存項目の末尾に無い'
    ).toHaveValue(ALL_FIELDS_ROW.名称);

    // REQ-31.4: 各列データが対応フィールドへ自動入力される（大項目〜備考の10欄）。
    const textFields: Array<[string, string]> = [
      ['大項目', ALL_FIELDS_ROW.大項目],
      ['中項目', ALL_FIELDS_ROW.中項目],
      ['小項目', ALL_FIELDS_ROW.小項目],
      ['任意分類', ALL_FIELDS_ROW.任意分類],
      ['工種', ALL_FIELDS_ROW.工種],
      ['名称', ALL_FIELDS_ROW.名称],
      ['規格', ALL_FIELDS_ROW.規格],
      ['単位', ALL_FIELDS_ROW.単位],
      ['備考', ALL_FIELDS_ROW.備考],
    ];
    for (const [label, value] of textFields) {
      await expect(
        importedRow.getByLabel(label, { exact: true }),
        `REQ-31.4: ${label}へ列データが自動入力されていない`
      ).toHaveValue(value);
    }
    // 数量は数値欄（表示の桁揃えに依らず値で判定する）
    const quantityInput = importedRow.locator('input[id$="-quantity"]');
    await expect
      .poll(async () => Number(await quantityInput.inputValue()), {
        timeout: getTimeout(10000),
        message: 'REQ-31.4: 数量へ列データが自動入力されていない',
      })
      .toBe(Number(ALL_FIELDS_ROW.数量));

    // REQ-31.5: 取り込んだ項目の計算方法は「標準」である。
    const calcMethodSelect = importedRow.getByLabel('計算方法');
    await expect(
      calcMethodSelect,
      'REQ-31.5: 取り込んだ項目の計算方法が「標準」でない'
    ).toHaveValue('STANDARD');
    await expect(
      calcMethodSelect.locator('option:checked'),
      'REQ-31.5: 計算方法の表示が「標準」でない'
    ).toHaveText('標準');

    // REQ-31.8: 取り込み後も各フィールドを自由に編集できる。
    const editedName = `${ALL_FIELDS_ROW.名称}_編集後`;
    const nameInput = importedRow.getByLabel('名称', { exact: true });
    await nameInput.fill(editedName);
    await nameInput.press('Escape');
    await expect(nameInput, 'REQ-31.8: 取り込んだ項目の名称を編集できない').toHaveValue(editedName);

    await quantityInput.fill('78.25');
    await quantityInput.blur();
    await expect
      .poll(async () => Number(await quantityInput.inputValue()), {
        timeout: getTimeout(10000),
        message: 'REQ-31.8: 取り込んだ項目の数量を編集できない',
      })
      .toBe(78.25);

    await calcMethodSelect.selectOption('AREA_VOLUME');
    await expect(calcMethodSelect, 'REQ-31.8: 取り込んだ項目の計算方法を編集できない').toHaveValue(
      'AREA_VOLUME'
    );
  });
});

test.describe('REQ-42.4/42.6: 一括取り込みのクライアントサイド反映と明示保存', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-42.4: 一括取り込みはクライアントサイドの編集状態にのみ反映する
   * @requirement quantity-table-generation/REQ-42.6: 保存前は永続化目的のサーバーアクセスを一切発生させない
   * @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加（保存で永続化）
   *
   * クライアントサイド（SheetJS）でパースされる Excel を取り込み、取り込み完了から
   * 保存ボタン押下までの間に数量表サブリソースへの永続化書き込み（POST /quantity-items 等）が
   * 一切飛ばないことをネットワーク監視で検証する。保存後にリロードしても取り込み項目が
   * 残存することで、保存（PUT /:id/save）によってのみ永続化されることを確認する。
   *
   * 注: 本テストは OCR（ANTHROPIC_API_KEY 依存）を使用せず Excel パースのみで成立する。
   */
  test('Excel一括取り込みは保存まで永続化APIを発行せず、保存後はリロードしても残存する (REQ-42.4, REQ-42.6, REQ-31.3)', async ({
    page,
  }) => {
    expect(createdQuantityTableId, '事前準備で数量表が作成済み').toBeTruthy();

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

    // 取り込み先グループが存在することを確認（beforeAll で永続化済み）
    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    // ネットワーク監視を設置（以降、保存まで永続化書き込みが飛んではならない）
    const monitor = attachPersistenceMonitor(page);

    // インポートダイアログを開く
    const importButton = page.getByRole('button', { name: 'インポート' }).first();
    await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });
    await importButton.click();
    await expect(page.getByRole('heading', { name: '数量表インポート' })).toBeVisible({
      timeout: getTimeout(5000),
    });

    // Excel をアップロード（クライアントサイドでパースされる）
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // 抽出完了 → 「一括取り込み」ボタンが表示される
    const dialog = page.getByRole('dialog');
    const importBtn = dialog.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn).toBeVisible({ timeout: getTimeout(20000) });
    await importBtn.click();

    // 取り込み先グループを選択
    await expect(page.getByRole('heading', { name: '取り込み先グループを選択' })).toBeVisible({
      timeout: getTimeout(5000),
    });
    const groupButton = dialog
      .locator('button')
      .filter({ hasText: /\(\d+項目\)/ })
      .first();
    await expect(groupButton).toBeVisible({ timeout: getTimeout(5000) });
    await groupButton.click();

    // 取り込み完了メッセージ（クライアント反映済み）
    await expect(page.getByText(/件の数量項目を取り込みました/).first()).toBeVisible({
      timeout: getTimeout(10000),
    });

    // ダイアログを閉じる
    const closeBtn = dialog.getByRole('button', { name: /閉じる|キャンセル/ }).last();
    if (await isVisibleWithin(closeBtn, getTimeout(2000))) {
      await closeBtn.click();
    }

    // 取り込み項目が編集画面のドラフトに反映されている（名称フィールドの value として表示）
    await expectNameValuePresent(page, 'E2E取込項目');

    // 検証(REQ-42.4/42.6): 取り込みから保存前までに永続化書き込みは1件も飛んでいない
    expect(
      monitor.writes,
      `取り込み後・保存前に永続化書き込みが発生した: ${JSON.stringify(monitor.writes, null, 2)}`
    ).toHaveLength(0);

    // 保存（PUT /:id/save）でのみ永続化される
    await saveQuantityTableDraft(page);
    monitor.detach();

    // リロード後も取り込み項目が残存する（= 保存で永続化された）
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });
    await expectNameValuePresent(page, 'E2E取込項目');
  });
});

test.describe('REQ-32: フィールドマッピング調整', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-32.1: マッピング先ドロップダウン表示
   * @requirement quantity-table-generation/REQ-32.2: 選択肢提供
   */
  test('プレビュー表示時にマッピング先ドロップダウンが各列に表示される (REQ-32.1, REQ-32.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.1/32.2 は抽出済みの列に対する挙動であり、抽出手段を問わない。
    // 以前は PDF OCR が失敗すると「エラーかリトライが出ている」ことだけを確かめて
    // 選択肢の判定を飛ばしていた。決定論的に解析される Excel の資材を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // Excel はインラインプレビュー（REQ-34.3）にも表が出るため、抽出結果の領域の表に限定する
    const previewTable = page.getByRole('region', { name: '抽出結果' }).locator('table');
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // ドロップダウン（select aria-label*="マッピング先"）の確認
    const select = page.locator('select[aria-label*="のマッピング先"]').first();
    await expect(select, 'REQ-32.1: マッピング先ドロップダウンが表示されない').toBeVisible({
      timeout: getTimeout(5000),
    });

    // 選択肢に必須項目が含まれる
    const options = await select.locator('option').allTextContents();
    const expected = [
      '大項目',
      '中項目',
      '小項目',
      '任意分類',
      '工種',
      '名称',
      '規格',
      '数量',
      '単位',
      '備考',
      '取り込まない',
    ];
    for (const exp of expected) {
      expect(options, `REQ-32.2: マッピング先の選択肢に「${exp}」が無い`).toContain(exp);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-32.3: マッピング即座更新
   * @requirement quantity-table-generation/REQ-32.5: ユーザー変更可能
   */
  test('マッピング先を変更すると select 値が即座に更新される (REQ-32.3, REQ-32.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.3/32.5 の検証対象は「マッピング先を変更でき、即座に反映される」ことである。
    // 以前は PDF OCR の結果を Promise.race で観測し、select が出なければ
    // 「リトライ・一括取り込み・アラートのいずれかが出ている」ことだけを確かめていた。
    // これでは変更の判定が一度も実行されない。決定論的に列が抽出される Excel を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const firstSelect = dialog.locator('select[aria-label*="のマッピング先"]').first();
    await expect(firstSelect, '前提: マッピング先の選択欄が表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 資材の先頭列は「工種」であり、自動推定は 'workType' を選ぶ（REQ-32.4）。
    // 変更が反映されることを見るため、別の値へ切り替えてから戻す。
    await firstSelect.selectOption('skip');
    await expect(firstSelect, 'REQ-32.3: マッピング先の変更が即座に反映されない').toHaveValue(
      'skip'
    );

    await firstSelect.selectOption('workType');
    await expect(firstSelect, 'REQ-32.5: マッピング先をユーザーが変更できない').toHaveValue(
      'workType'
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-32.4: 自動推定
   *
   * autoDetectFieldMapping により、キーワードマッチでマッピングが自動推定される。
   * 資材 import-items.xlsx のヘッダーは「工種・名称・規格・数量・単位」であり、
   * field-mapping.ts の MAPPING_RULES により推定結果は一意に定まる。
   */
  test('プレビュー表示時にマッピング先が自動推定される (REQ-32.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // 以前は PDF OCR の結果を観測し、select が出なければ「処理完了の証跡が何か出ている」
    // ことだけを確かめていた。また select が出た場合も「値が空でない」だけを見ており、
    // 未推定を表す 'skip' でも成立した。すなわち自動推定を一度も確かめていない。
    // 決定論的に列が抽出される Excel を用い、列ごとの推定結果を名指しで主張する。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const expectedMapping: Array<[string, string]> = [
      ['工種', 'workType'],
      ['名称', 'name'],
      ['規格', 'specification'],
      ['数量', 'quantity'],
      ['単位', 'unit'],
    ];

    for (const [header, target] of expectedMapping) {
      const select = dialog.locator(`select[aria-label="${header}のマッピング先"]`);
      await expect(select, `前提: 列「${header}」のマッピング先の選択欄が表示される`).toBeVisible({
        timeout: getTimeout(45000),
      });
      await expect(select, `REQ-32.4: 列「${header}」のマッピング先が自動推定されない`).toHaveValue(
        target
      );
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-32.6: 必須未マッピング警告
   */
  test('必須フィールド未マッピング時に警告メッセージが表示される (REQ-32.6)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.6 は「必須フィールドが未マッピングなら警告する」ことを対象とする。
    // その状態を作るには列が抽出されている必要があるため、環境に依存する PDF OCR
    // ではなく、クライアントサイドで決定論的に解析される Excel の資材を用いる。
    // 以前は OCR 失敗時にリトライ表示だけを見て抜けており、警告の判定は実行されなかった。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const warning = page.getByText(/必須フィールドがマッピングされていません/);

    // REQ-32.1: 抽出後は列ごとのマッピング先ドロップダウンが表示される
    const selects = dialog.locator('select[aria-label*="のマッピング先"]');
    const firstSelect = selects.first();
    await expect(firstSelect, 'REQ-32.1: マッピング先の選択欄が表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 全ての select を 'skip' に設定 → 必須フィールドが未マッピング
    const selectCount = await selects.count();
    expect(selectCount, '前提: マッピング対象の列が抽出されている').toBeGreaterThan(0);
    for (let i = 0; i < selectCount; i++) {
      await selects.nth(i).selectOption('skip');
    }

    // REQ-32.6: 必須フィールドが未マッピングであることの警告が表示される
    await expect(warning, 'REQ-32.6: 必須フィールド未マッピングの警告が表示される').toBeVisible({
      timeout: getTimeout(5000),
    });
  });
});

test.describe('REQ-33: OCR再実行・リトライ機能', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-33.1: リトライボタン表示
   *
   * 不正なxlsxアップロードでエラーが発生した時、リトライボタンが表示される。
   */
  test('処理失敗時に「リトライ」ボタンが表示される (REQ-33.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ZIP マジックバイトのみを持つ不正な xlsx。SheetJS が "Unsupported ZIP encryption"
      // 等のエラーを返す（任意のテキストだけだとパーサーが空ワークブックとして処理を完了
      // させてしまう環境があり、REQ-33 の「処理失敗」状態を再現できないため）。
      buffer: Buffer.from('PK\x03\x04dummy-excel-bytes'),
    });

    const retryBtn = page.getByRole('button', { name: 'リトライ' });
    await expect(retryBtn).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-33.2: リトライ実行
   * @requirement quantity-table-generation/REQ-33.3: リトライ中インジケーター
   *
   * 以前は壊れた xlsx でエラーを出し、リトライのクリック後に progressbar か alert が見えることだけを
   * 待っていた。リトライボタンはエラー表示の alert の中にあり、クリック前から alert が見えているため、
   * リトライが何もしなくても確実に合格していた（タスク 97.24）。1回目だけ決定的に失敗させ、
   * ファイルを選び直さずにリトライした後の状態の変化で主張する。
   *   1. 画像のみの PDF を選ぶ。Claude Vision を 503 にしてフォールバックへ進め、Tesseract の資材の
   *      取得を遮断してフォールバックも失敗させる → エラー表示とリトライボタンが出る
   *   2. リトライをクリックすると、同じファイルのページ画像を載せた2回目の抽出要求が発行される
   *      （要求の本文が1回目と一致する）。応答を保留している間は処理中インジケーターが表示され、
   *      エラー表示は消えている（REQ-33.3）
   *   3. 目印の行を持つ応答を返すと、抽出結果の表に目印の行が表示される
   */
  test('「リトライ」クリックで再処理が走り、インジケーターまたはエラーが再表示される (REQ-33.2, REQ-33.3)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const scannedPdf = path.join(FIXTURES_DIR, 'test-scanned-pdf.pdf');
    const visionUrl = /\/api\/claude-vision\/extract$/;
    const tesseractAssets = /tesseract\.js@|tesseract\.js-core|@tesseract\.js-data|tessdata/;
    const resultMarker = `REQ332_RETRY_ROW_${Date.now()}`;

    const visionRequests: Request[] = [];
    const onRequest = (request: Request) => {
      if (request.method() === 'POST' && visionUrl.test(request.url())) {
        visionRequests.push(request);
      }
    };

    let releaseRetry: (() => void) | undefined;
    const retryHeld = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    let visionCalls = 0;
    await page.route('**/api/claude-vision/extract', async (route) => {
      visionCalls += 1;
      if (visionCalls === 1) {
        // 1回目: 利用不可にしてフォールバックへ進める（REQ-30.5）
        await route
          .fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Service Unavailable',
              errorType: 'service_unavailable',
            }),
          })
          .catch(() => undefined);
        return;
      }
      // 2回目以降（リトライ）: テストが解放するまで保留し、目印の行を返す
      await retryHeld;
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lineItems: [
              {
                majorCategory: null,
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '仮設工',
                name: resultMarker,
                specification: null,
                quantity: 1,
                unit: '式',
                remarks: null,
              },
            ],
            pageCount: 1,
          }),
        })
        // 判定の失敗でテストが先に終わった場合、ページが閉じた後の応答は捨てる
        .catch(() => undefined);
    });
    // 1回目のフォールバック（Tesseract OCR）を失敗させる
    await page.route(tesseractAssets, (route) => route.abort());
    page.on('request', onRequest);

    try {
      const dialog = page.getByRole('dialog');
      const results = dialog.getByRole('region', { name: '抽出結果' });
      const errorAlert = results.getByRole('alert');
      const retryBtn = results.getByRole('button', { name: 'リトライ' });
      const indicator = results.getByRole('progressbar');

      // 1. 1回目の抽出は失敗し、リトライボタンが出る
      await page.getByLabel('ファイルを選択').setInputFiles(scannedPdf);
      await expect(retryBtn, '前提: 1回目の抽出が失敗してリトライボタンが表示されない').toBeVisible(
        {
          timeout: getTimeout(60000),
        }
      );
      await expect(errorAlert, '前提: 1回目の抽出がOCR処理の失敗で終わっていない').toContainText(
        'OCR処理'
      );
      expect(visionRequests, '前提: 1回目の抽出要求がちょうど1件発行されていない').toHaveLength(1);
      await expect(results.locator('table'), '前提: 失敗時に結果の表が出ている').toHaveCount(0);

      // 2. ファイルを選び直さずにリトライする → 同じファイルに対する抽出要求が再び発行される
      const retryRequest = page.waitForRequest(
        (request) => request.method() === 'POST' && visionUrl.test(request.url()),
        { timeout: getTimeout(30000) }
      );
      await retryBtn.click();
      await retryRequest;

      expect(
        visionRequests,
        'REQ-33.2: リトライで抽出要求が再発行されない（再処理が走っていない）'
      ).toHaveLength(2);
      const [firstRequest, secondRequest] = visionRequests as [Request, Request];
      const firstBody = firstRequest.postData() ?? '';
      expect(firstBody.length, '前提: 1回目の抽出要求がページ画像を載せていない').toBeGreaterThan(
        1000
      );
      expect(
        secondRequest.postData() === firstBody,
        'REQ-33.2: リトライの抽出要求が1回目と同一ファイルのページ画像を載せていない'
      ).toBe(true);

      // REQ-33.3: リトライ処理の実行中（応答の保留中）はインジケーターが表示され、エラーは消えている
      await expect(
        indicator,
        'REQ-33.3: リトライ処理の実行中に処理中インジケーターが表示されない'
      ).toBeVisible({ timeout: getTimeout(15000) });
      await expect(
        errorAlert,
        'REQ-33.2: リトライ開始後も前回のエラー表示が残っている'
      ).toHaveCount(0);

      // 3. 応答を返すと、再処理の結果が表示される
      releaseRetry?.();
      await expect(
        results.locator('table tbody'),
        'REQ-33.2: リトライによる再処理の結果が表示されない'
      ).toContainText(resultMarker, { timeout: getTimeout(45000) });
      await expect(indicator, 'REQ-33.3: 再処理の完了後もインジケーターが残っている').toHaveCount(
        0
      );
      await expect(errorAlert, 'REQ-33.2: 再処理の成功後にエラー表示が残っている').toHaveCount(0);
      expect(visionRequests, 'REQ-33.2: リトライ1回で抽出要求が2回以上再発行された').toHaveLength(
        2
      );
    } finally {
      releaseRetry?.();
      page.off('request', onRequest);
      await page.unroute(tesseractAssets);
      await page.unroute('**/api/claude-vision/extract');
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-33.4: 別ファイル許可
   *
   * エラー後でもファイル選択input は disabled にならず、新しいファイルを再選択可能。
   */
  test('処理失敗後でもファイルinputが操作可能である (REQ-33.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04garbage-bytes'),
    });

    // エラー表示を待機
    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 別のファイルを選択できる（input が enabled）
    const isDisabled = await fileInput.isDisabled();
    expect(isDisabled, 'エラー後でもファイル入力は無効化されない').toBe(false);
  });

  /**
   * @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時のクリア
   *
   * 新しいファイルをアップロードすると、前回のエラー表示がクリアされる。
   */
  test('別ファイルアップロード時に前回のエラーがクリアされる (REQ-33.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');

    // 1回目：txt（サポート対象外）→ ファイル形式エラー
    await fileInput.setInputFiles(TEST_TXT);
    const formatError = page.getByText(/対応していないファイル形式/);
    await expect(formatError).toBeVisible({ timeout: getTimeout(5000) });

    // 2回目：PDF
    await fileInput.setInputFiles(TEST_PDF);

    // 形式エラーが消える（要素が無くなるか非表示になる）
    await expect(formatError).not.toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時のクリア
   *
   * PDF の抽出中にドロップ領域へ Excel を落とすと、抽出結果は Excel のものになり、
   * 後から届いた PDF の抽出結果で上書きされない。
   *
   * PDF の抽出は Claude Vision の応答を待つため、その応答を保留して処理中の状態を確定させ、
   * Excel の抽出が表示された後に目印の行を持つ応答を返す。目印の行が抽出結果に現れれば、
   * 追い越された処理の結果が新しいファイルの結果を上書きしている。
   */
  test('PDF抽出中に別ファイルをドロップすると、遅れて届いたPDFの結果で上書きされない (REQ-33.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const staleMarker = `STALE_PDF_ROW_${Date.now()}`;
    let releaseExtraction: (() => void) | undefined;
    const extractionHeld = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    });
    await page.route('**/api/claude-vision/extract', async (route) => {
      await extractionHeld;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lineItems: [
            {
              majorCategory: null,
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '仮設工',
              name: staleMarker,
              specification: null,
              quantity: 1,
              unit: '式',
              remarks: null,
            },
          ],
          pageCount: 1,
        }),
      });
    });

    const dialog = page.getByRole('dialog');
    const results = dialog.getByRole('region', { name: '抽出結果' });

    // 1件目: PDF。Claude Vision への送信が出た時点で、抽出は応答待ちの処理中である
    const visionRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && /\/api\/claude-vision\/extract$/.test(request.url()),
      { timeout: getTimeout(45000) }
    );
    await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);
    await visionRequest;
    await expect(
      page.getByLabel('ファイルを選択'),
      'PDFの抽出が処理中になっていない'
    ).toBeDisabled();

    // 2件目: 処理中でも受け付けるドロップ領域へ Excel を落とす
    const xlsxBase64 = fs.readFileSync(TEST_XLSX).toString('base64');
    const dataTransfer = await page.evaluateHandle(
      ({ base64, name }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([bytes], name, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        );
        return transfer;
      },
      { base64: xlsxBase64, name: 'import-items.xlsx' }
    );
    await dialog
      .getByText('ファイルをドラッグ&ドロップ、またはファイルを選択してください')
      .dispatchEvent('drop', { dataTransfer });

    const resultRows = results.locator('table tbody');
    await expect(resultRows, 'REQ-33.5: ドロップしたExcelの抽出結果が表示されない').toContainText(
      'E2E取込項目',
      { timeout: getTimeout(45000) }
    );

    // 保留していた PDF の応答を返し、画面側がその応答を読み終えるまで待つ
    const visionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/claude-vision\/extract$/.test(response.url()),
      { timeout: getTimeout(15000) }
    );
    releaseExtraction?.();
    await (await visionResponse).finished();
    // 追い越された処理の完了は画面に変化を出さない（正しく捨てられれば何も起きない）ため、
    // 確定的に待つ目印が無い。応答の受信から画面側の JS（応答の読み取り・整形・状態更新）が
    // 走り終えるまでの余裕として固定で待つ。前提となる Excel の抽出行の表示は先に確かめている。
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));

    await expect(
      resultRows,
      'REQ-33.5: 追い越されたPDFの抽出結果で新しいファイルの抽出結果が上書きされた'
    ).not.toContainText(staleMarker);
    await expect(
      resultRows,
      'REQ-33.5: 新しいファイル（Excel）の抽出結果が保たれていない'
    ).toContainText('E2E取込項目');
    await expect(
      results.getByRole('alert'),
      'REQ-33.5: 追い越された処理のエラーが表示された'
    ).toHaveCount(0);

    await page.unroute('**/api/claude-vision/extract');
  });
});

test.describe('REQ-34: インポートダイアログのインラインプレビュー', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-34.1: インラインプレビュー表示
   *
   * ファイルのアップロード直後、OCR の完了を待たずにダイアログ内へファイルそのものの
   * インラインプレビュー（領域「ファイルプレビュー」）が表示される。
   */
  test('ファイルアップロード時にダイアログ内にインラインプレビューが表示される (REQ-34.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const inlinePreview = dialog.getByRole('region', { name: 'ファイルプレビュー' });
    await expect(
      inlinePreview,
      'REQ-34.1: アップロードしたファイルのインラインプレビューがダイアログ内に表示されない'
    ).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-34.2: PDFビューアでのインライン表示
   *
   * 資材 test-text-pdf.pdf（2ページ）をアップロードすると、PDF ビューアが1ページ目を
   * canvas へ実際に描画する（描画面の幅と高さが 0 でない）。
   */
  test('PDFアップロード時にPDFビューアで1ページ目がインライン表示される (REQ-34.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);

    const inlinePreview = page
      .getByRole('dialog')
      .getByRole('region', { name: 'ファイルプレビュー' });
    const firstPageCanvas = inlinePreview.locator('[data-page-number="1"] canvas');
    await expect(firstPageCanvas, 'REQ-34.2: PDFビューアが1ページ目を描画しない').toBeVisible({
      timeout: getTimeout(20000),
    });
    const drawn = await firstPageCanvas.evaluate((canvas: HTMLCanvasElement) => ({
      width: canvas.width,
      height: canvas.height,
    }));
    expect(drawn.width, 'REQ-34.2: PDFページの描画面の幅が 0').toBeGreaterThan(0);
    expect(drawn.height, 'REQ-34.2: PDFページの描画面の高さが 0').toBeGreaterThan(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-34.4: PDFのページナビゲーション
   *
   * PDF のプレビュー中は「ページ 現在 / 総数」と前へ/次へのボタンが出る。次へで2ページ目が
   * 描画され、前へで1ページ目に戻る。先頭では前へ、末尾では次へが押せない。
   */
  test('PDFプレビューで前ページ/次ページのボタンと現在ページ/総ページ数でページを送れる (REQ-34.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);

    const inlinePreview = page
      .getByRole('dialog')
      .getByRole('region', { name: 'ファイルプレビュー' });
    // 親要素まで一致して strict mode 違反にならないよう、行そのものへ錨を張る
    const pageIndicator = inlinePreview.getByText(/^ページ \d+ \/ \d+$/);
    await expect(pageIndicator, 'REQ-34.4: 現在ページ/総ページ数が表示されない').toHaveText(
      'ページ 1 / 2',
      { timeout: getTimeout(20000) }
    );

    const prevButton = inlinePreview.getByRole('button', { name: '前へ' });
    const nextButton = inlinePreview.getByRole('button', { name: '次へ' });
    await expect(prevButton, 'REQ-34.4: 先頭ページで前へが押せる').toBeDisabled();
    await expect(nextButton, 'REQ-34.4: 次へが押せない').toBeEnabled();

    await nextButton.click();
    await expect(pageIndicator, 'REQ-34.4: 次へで2ページ目に進まない').toHaveText('ページ 2 / 2');
    await expect(
      inlinePreview.locator('[data-page-number="2"] canvas'),
      'REQ-34.4: 次へで2ページ目が描画されない'
    ).toBeVisible({ timeout: getTimeout(20000) });
    await expect(nextButton, 'REQ-34.4: 末尾ページで次へが押せる').toBeDisabled();
    await expect(prevButton, 'REQ-34.4: 前へが押せない').toBeEnabled();

    await prevButton.click();
    await expect(pageIndicator, 'REQ-34.4: 前へで1ページ目に戻らない').toHaveText('ページ 1 / 2');
    await expect(
      inlinePreview.locator('[data-page-number="1"] canvas'),
      'REQ-34.4: 前へで1ページ目が描画されない'
    ).toBeVisible({ timeout: getTimeout(20000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-34.4: PDFのページナビゲーション（1ページのPDF）
   *
   * REQ-34.4 は総ページ数による例外を設けない。1ページの資材 test-file.pdf でも
   * 「ページ 1 / 1」と前へ/次へのボタンが出て、どちらも押せない。
   */
  test('1ページのPDFでも現在ページ/総ページ数と前ページ/次ページのボタンが表示される (REQ-34.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await page.getByLabel('ファイルを選択').setInputFiles(TEST_SINGLE_PAGE_PDF);

    const inlinePreview = page
      .getByRole('dialog')
      .getByRole('region', { name: 'ファイルプレビュー' });
    await expect(
      inlinePreview.locator('[data-page-number="1"] canvas'),
      '前提: 1ページのPDFが描画される'
    ).toBeVisible({ timeout: getTimeout(20000) });

    const pageIndicator = inlinePreview.getByText(/^ページ \d+ \/ \d+$/);
    await expect(
      pageIndicator,
      'REQ-34.4: 1ページのPDFで現在ページ/総ページ数が表示されない'
    ).toHaveText('ページ 1 / 1', { timeout: getTimeout(20000) });
    await expect(
      inlinePreview.getByRole('button', { name: '前へ' }),
      'REQ-34.4: 1ページのPDFで前へが無いか押せる'
    ).toBeDisabled();
    await expect(
      inlinePreview.getByRole('button', { name: '次へ' }),
      'REQ-34.4: 1ページのPDFで次へが無いか押せる'
    ).toBeDisabled();
  });

  /**
   * @requirement quantity-table-generation/REQ-34.3: Excelインライン表示（テーブル形式）
   *
   * 決定論的に解析される Excel の資材をアップロードすると、インラインプレビューの領域に
   * 表データがテーブル形式（見出し行とデータ行）で表示される。
   */
  test('Excelアップロード時に表データがテーブル形式でインライン表示される (REQ-34.3)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const inlinePreview = page
      .getByRole('dialog')
      .getByRole('region', { name: 'ファイルプレビュー' });
    const previewTable = inlinePreview.locator('table');
    await expect(previewTable, 'REQ-34.3: Excelがテーブル形式でインライン表示されない').toBeVisible(
      {
        timeout: getTimeout(45000),
      }
    );

    // 資材のヘッダーは「工種・名称・規格・数量・単位」の5列である
    await expect(
      previewTable.locator('thead'),
      'REQ-34.3: インラインプレビューのテーブルに資材の見出し行が無い'
    ).toContainText('名称');
    await expect(
      previewTable.locator('tbody tr').first(),
      'REQ-34.3: インラインプレビューのテーブルにデータ行が無い'
    ).toBeVisible();
  });

  /**
   * @requirement quantity-table-generation/REQ-34.5: ダイアログ内に並べて表示
   *
   * OCR 経路を固定して PDF を取り込み、同一ダイアログ内でインラインプレビュー（PDF の描画）と
   * 抽出結果（抽出テキストとプレビューテーブル）が左右に並ぶことを描画座標で確かめる。
   */
  test('インラインプレビューと抽出結果プレビューテーブルが同一ダイアログ内に並べて表示される (REQ-34.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);
    await page.getByLabel('ファイルを選択').setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const inlinePreview = dialog.getByRole('region', { name: 'ファイルプレビュー' });
    const results = dialog.getByRole('region', { name: '抽出結果' });

    await expect(
      results.getByRole('region', { name: '抽出テキスト' }),
      'REQ-34.5: 抽出結果の抽出テキストが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    const resultTable = results.locator('table');
    await expect(
      resultTable.locator('thead'),
      'REQ-34.5: 抽出結果プレビューテーブルが表示されない'
    ).toContainText('大項目');
    await expect(
      inlinePreview.locator('[data-page-number="1"] canvas'),
      'REQ-34.5: インラインプレビューが表示されない'
    ).toBeVisible({ timeout: getTimeout(20000) });

    const previewBox = await inlinePreview.boundingBox();
    const resultsBox = await results.boundingBox();
    expect(previewBox, 'REQ-34.5: インラインプレビューの描画位置が取れない').not.toBeNull();
    expect(resultsBox, 'REQ-34.5: 抽出結果の描画位置が取れない').not.toBeNull();
    const left = previewBox as NonNullable<typeof previewBox>;
    const right = resultsBox as NonNullable<typeof resultsBox>;
    // 左右に並ぶ: プレビューの右端が抽出結果の左端以下で、縦方向の範囲が重なる
    expect(
      left.x + left.width,
      'REQ-34.5: インラインプレビューが抽出結果の左に並ばない'
    ).toBeLessThanOrEqual(right.x);
    expect(left.y, 'REQ-34.5: インラインプレビューと抽出結果が横に並ばない').toBeLessThan(
      right.y + right.height
    );
    expect(right.y, 'REQ-34.5: インラインプレビューと抽出結果が横に並ばない').toBeLessThan(
      left.y + left.height
    );
  });
});

/**
 * Task 97.9: 取り込みダイアログのプレビューの高さの保存と、閉じたときの状態
 *
 * 利用者の裁定（2026-09-15）で決めた挙動であり、要件の受入基準には無いため番号を名乗らない。
 * - プレビューの高さは受領見積書登録（`architrack:received-quotation:preview-height`）と共有せず、
 *   取り込みダイアログ専用のキーに保存・復元する
 * - ダイアログを閉じるとファイルのプレビューと抽出結果を捨て、開き直すと初期状態になる
 */
const RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY = 'architrack:received-quotation:preview-height';
const IMPORT_PREVIEW_HEIGHT_KEY = 'architrack:quantity-table-import:preview-height';

/** 取り込みダイアログの Excel をアップロードし、ファイルプレビューの表が出るまで待つ */
async function uploadXlsxAndWaitPreview(page: Page) {
  await page.getByLabel('ファイルを選択').setInputFiles(TEST_XLSX);
  const inlinePreview = page
    .getByRole('dialog')
    .getByRole('region', { name: 'ファイルプレビュー' });
  await expect(inlinePreview.locator('table'), '前提: Excelのプレビューが表示される').toBeVisible({
    timeout: getTimeout(45000),
  });
  return inlinePreview;
}

/** リサイズハンドルの、ファイルプレビュー領域の上端からの距離（プレビューの縦幅に連動する） */
async function handleOffsetFromPreviewTop(
  inlinePreview: ReturnType<Page['getByRole']>
): Promise<number> {
  const regionBox = await inlinePreview.boundingBox();
  const handleBox = await inlinePreview.getByTestId('preview-resize-handle').boundingBox();
  expect(regionBox, '前提: ファイルプレビューの描画位置が取れる').not.toBeNull();
  expect(handleBox, '前提: リサイズハンドルの描画位置が取れる').not.toBeNull();
  return (
    (handleBox as NonNullable<typeof handleBox>).y - (regionBox as NonNullable<typeof regionBox>).y
  );
}

test.describe('取り込みダイアログのプレビューの高さの保存と閉じたときの状態 (Task 97.9)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test('プレビューの高さは取り込みダイアログ専用のキーに保存され、受領見積書のキーを変えず、開き直すと復元される', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 受領見積書のキーには別の値を置き、取り込みダイアログのキーは空にする
    await page.evaluate(
      ({ received, importKey }) => {
        localStorage.setItem(received, '250');
        localStorage.removeItem(importKey);
      },
      { received: RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY, importKey: IMPORT_PREVIEW_HEIGHT_KEY }
    );

    expect(await openImportDialog(page)).toBeTruthy();
    const inlinePreview = await uploadXlsxAndWaitPreview(page);

    const handle = inlinePreview.getByTestId('preview-resize-handle');
    await expect(handle).toBeVisible({ timeout: getTimeout(10000) });
    const offsetBefore = await handleOffsetFromPreviewTop(inlinePreview);

    // リサイズハンドルを 80px 下へドラッグする
    const handleBox = await handle.boundingBox();
    expect(handleBox, '前提: リサイズハンドルの描画位置が取れる').not.toBeNull();
    const box = handleBox as NonNullable<typeof handleBox>;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 80, { steps: 10 });
    await page.mouse.up();

    // 取り込みダイアログのキーに保存される
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), IMPORT_PREVIEW_HEIGHT_KEY), {
        message: '取り込みダイアログのキーにプレビューの高さが保存されない',
        timeout: getTimeout(5000),
      })
      .not.toBeNull();
    const savedHeight = Number(
      await page.evaluate((key) => localStorage.getItem(key), IMPORT_PREVIEW_HEIGHT_KEY)
    );
    expect(savedHeight, '保存された高さが数値でない').not.toBeNaN();

    // 受領見積書のキーは変わらない
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY
      ),
      '取り込みダイアログでのリサイズが受領見積書のプレビューの高さを変えた'
    ).toBe('250');

    // 閉じて開き直し、同じファイルを選ぶと、ドラッグした高さで復元される
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await openImportDialog(page)).toBeTruthy();
    const reopenedPreview = await uploadXlsxAndWaitPreview(page);
    await expect(reopenedPreview.getByTestId('preview-resize-handle')).toBeVisible({
      timeout: getTimeout(10000),
    });
    const offsetAfter = await handleOffsetFromPreviewTop(reopenedPreview);
    expect(
      Math.abs(offsetAfter - offsetBefore - 80),
      'ドラッグした高さが開き直した取り込みダイアログで復元されない'
    ).toBeLessThanOrEqual(2);
  });

  test('ダイアログを閉じて開き直すと、ファイルのプレビューと抽出結果が残らない', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    expect(await openImportDialog(page)).toBeTruthy();
    await uploadXlsxAndWaitPreview(page);

    // 前提: 閉じる前は抽出結果のプレビューテーブルが表示されている
    const results = page.getByRole('dialog').getByRole('region', { name: '抽出結果' });
    await expect(
      results.locator('table thead'),
      '前提: 抽出結果のプレビューテーブルが表示される'
    ).toContainText('大項目', { timeout: getTimeout(45000) });

    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(await openImportDialog(page)).toBeTruthy();
    const dialog = page.getByRole('dialog');
    // 不在の主張の前に、開き直したダイアログそのものと抽出結果の領域が在ることを確かめる
    await expect(dialog.getByRole('heading', { name: '数量表インポート' })).toBeVisible();
    await expect(dialog.getByLabel('ファイルを選択')).toBeEnabled();
    const reopenedResults = dialog.getByRole('region', { name: '抽出結果' });
    await expect(reopenedResults).toBeAttached();

    await expect(
      dialog.getByRole('region', { name: 'ファイルプレビュー' }),
      '閉じる前のファイルのプレビューが開き直したダイアログに残る'
    ).toHaveCount(0);
    await expect(
      reopenedResults.locator('table'),
      '閉じる前の抽出結果が開き直したダイアログに残る'
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: '一括取り込み' }),
      '閉じる前の一括取り込みボタンが開き直したダイアログに残る'
    ).toHaveCount(0);
  });
});
