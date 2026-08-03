/**
 * @fileoverview 帳票出力（行タイプごとのファイル生成・表紙・未保存の反映）のE2Eテスト
 *
 * Task 56.12: 段階4（帳票生成のフロントエンド完結）の受入検証。
 *
 * 段階4で、帳票の組み立て（56.1〜56.3）・表紙と表組みの描画（56.4〜56.6）・表計算出力
 * （56.7）・帳票用入力項目（56.8）・ダイアログの結線（56.9）が揃い、バックエンドの
 * 出力エンドポイントは撤去された（56.10）。本 spec はその結果を
 * **実ブラウザがダウンロードしたファイルの中身**で確認する。
 *
 * ## 既存E2Eとの分担（本 spec を新設した理由）
 *
 * - `estimate-export-dialog-e2e.spec.ts` はチェックボックスの既定値（38.1）だけを見る
 * - `estimate-features-e2e.spec.ts` は**ファイル名**（32.2 / 32.5 / 32.6）と
 *   「出力エンドポイントを叩かない」（10.1）までで、ファイルの中身を一切開かない
 * - `estimate-e2e.spec.ts` は拡張子（10.1 / 10.2）のみ
 *
 * つまり既存のどれも **生成されたファイルの内容** を検証していない。
 * 「見積のファイルだけが表紙を持つ」「編集中の値が帳票に載る」はファイルを開かなければ
 * 原理的に確かめられないため、本 spec で新設する。
 *
 * ## 生成ファイルの中身をどう検査するか
 *
 * - **表計算（.xlsx）**: `exceljs` で読み戻し、1ページ＝20行の固定ブロック
 *   （表題1＋見出し1＋明細17＋合計1 / 52.5）として**セル単位で厳密比較**する。
 *   ページ番号・表題・7列の値・空行・合計行がすべて突き合わせ対象になる。
 * - **帳票（PDF）**: `pdfjs-dist` の Node 向けビルドでページごとにテキストを抽出する。
 *   表紙の内容（Requirement 51 / 53.8 / 53.9）は**PDFにしか描かれない**
 *   （表計算の表紙は表題とページ番号だけ＝56.7 のユーザー裁定）ため、
 *   「帳票用入力項目が表紙に反映される」の検証はPDF経路でしか成立しない。
 *
 * どちらもファイル名だけを見る検査ではなく、**ファイルの中に何が入ったか**を見る。
 *
 * ## 「出力しても保存しない」を空振りさせないための作り
 *
 * 「書き込み0件」は観測窓が早く閉じても・リスナーが外れていても真になる。
 * 53.14 → 54.11 → 55.9 が確立した数え方に従い、観測窓は**編集の前に開き、
 * 出力を挟んで最後の保存まで開けたまま**にして、窓の終端で記録された系列が
 * `PUT /:id/save` の**ちょうど1件**であることを確認する。リスナーが死んでいれば
 * 最後の1件も記録されず、この `toEqual` 自身が落ちる。
 *
 * ## 否定側アサーションの前提（56.2 / 56.3 の教訓）
 *
 * 「実行のファイルは表紙を持たない」は、フィクスチャが表紙を作れないなら無条件に真になる。
 * 本 spec は**同一の明細・同一の1回の出力操作**で見積のファイルを併せて取得し、
 * そちらには表紙が**実在する**ことを先に主張してから、実行のファイルに無いことを主張する。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-32.2: チェックされた行タイプごとに独立したファイルを生成する
 * - REQ-32.3: 生成したファイルを「見積」「実行」「業者」の順に逐次ダウンロードする
 * - REQ-50.2: 出力対象の行タイプが見積金額の場合、帳票の1ページ目を表紙とする
 * - REQ-50.12: 実行金額・業者金額の場合、表紙を出力せず1ページ目を内訳書とする
 * - REQ-51.16: 表紙を見積金額を出力対象とするファイルにのみ適用する
 * - REQ-54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - REQ-56.1: 未保存の変更がある状態でも帳票を出力可能とする
 * - REQ-56.2: 未保存の変更がある状態で出力した帳票に編集中の内容を反映する
 * - REQ-56.3: 未保存の変更がある状態で出力しても保存を伴わせず未保存の変更を保持する
 * - REQ-56.4: 未保存の変更がある場合、帳票が未保存の内容を含むことを画面上で示す
 *
 * @module e2e/specs/estimate/estimate-report-export-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';
import ExcelJS from 'exceljs';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  getEstimateItemTree,
  saveEstimateDraft,
  type EstimateItemNode,
  type SaveLineType,
} from '../../helpers/estimate-draft';

// ============================================================================
// PDFテキスト抽出（pdfjs-dist の Node 向けビルド）
// ============================================================================

/**
 * `pdfjs-dist` の Node 向けビルドの最小面
 *
 * 既定のエントリ（`build/pdf.mjs`）は読み込み時に `DOMMatrix` を参照するため Node では
 * 読めない。`legacy/build/pdf.mjs` は Node で動作する。この指定子は型定義（`.d.mts`）が
 * moduleResolution=node の解決対象外なので、動的 import を通して本 spec 側で型を与える。
 */
interface PdfTextItem {
  readonly str?: string;
}
interface PdfPage {
  getTextContent(): Promise<{ readonly items: readonly PdfTextItem[] }>;
}
interface PdfDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}
interface PdfjsModule {
  getDocument(source: { data: Uint8Array }): { readonly promise: Promise<PdfDocument> };
}

const PDFJS_NODE_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';

async function loadPdfjs(): Promise<PdfjsModule> {
  const loaded: unknown = await import(PDFJS_NODE_ENTRY);
  return loaded as PdfjsModule;
}

/**
 * PDFの各ページのテキストを抽出する
 *
 * 帳票は表題・見出し・欄をそれぞれ独立した描画命令で置くため、抽出結果は細かく分かれる。
 * 連結したうえで**空白（半角・全角）をすべて取り除いた**文字列を突き合わせに用いる。
 * 表題の字間（`御　見　積　書` / `内　　訳　　書`）は U+3000 で挿入されているため、
 * 空白を取り除かないと要件の文言と一致しない。
 */
async function extractPdfPageTexts(filePath: string): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(filePath);
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;

  const texts: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => item.str ?? '').join(''));
  }
  return texts.map((text) => text.replace(/[\s　]/g, ''));
}

// ============================================================================
// 表計算（.xlsx）の読み戻し
// ============================================================================

/** 表の列数（52.2） */
const COLUMN_COUNT = 7;

/** 読み戻した1シート */
interface SheetContent {
  readonly sheetName: string;
  /** 1行 = 7列の文字列（空欄は空文字） */
  readonly rows: readonly (readonly string[])[];
}

async function readWorkbookSheet(filePath: string): Promise<SheetContent> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // 1ファイル1シート（ページの区切りは行方向の連続で表す）
  expect(workbook.worksheets).toHaveLength(1);
  const sheet = workbook.worksheets[0]!;

  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    for (let columnNumber = 1; columnNumber <= COLUMN_COUNT; columnNumber += 1) {
      const value = row.getCell(columnNumber).value;
      cells.push(value === null || value === undefined ? '' : String(value));
    }
    rows.push(cells);
  }
  return { sheetName: sheet.name, rows };
}

// ============================================================================
// 帳票の表記（要件から導いた期待値。実装の定数は import しない）
// ============================================================================

/** 空行（7列すべて空欄 / 52.6） */
const EMPTY_ROW = ['', '', '', '', '', '', ''];

/** 見出し行（52.2, 52.7） */
const HEADER_ROW = ['名称', '規格', '単位', '数量', '単価', '金額', '備考'];

/** 1ページのブロック行数（表題1＋見出し1＋明細17＋合計1 / 52.5） */
const PAGE_BLOCK_ROWS = 20;

/** 表題行（52.8, 52.9, 32.4）。左端にページ番号、表の水平中心を含む列（単位列）に表題 */
function titleRow(pageNumber: number, title: string): string[] {
  return [`No. Page.${pageNumber}`, '', title, '', '', '', ''];
}

/**
 * 数量欄の表記（53.1, 53.2）
 *
 * 小数第1位まで表示し、整数は小数部（`.9` の2文字）を空白で埋めて小数点の位置を揃える。
 * さらに列の右余白として3文字分の空白が付く（参照PDFの記入例 `1     ` と同じ幅）。
 */
function wholeQuantity(value: number): string {
  return `${value}${' '.repeat(2)}${' '.repeat(3)}`;
}

/** 明細行（名称は階層記号・インデントを含めた完成形で渡す） */
function itemRow(options: {
  name: string;
  unit?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
}): string[] {
  return [
    options.name,
    '',
    options.unit ?? '',
    options.quantity ?? '',
    options.unitPrice ?? '',
    options.amount ?? '',
    '',
  ];
}

/** 合計行（52.10） */
function totalRow(amount: string): string[] {
  return ['【合計】', '', '', '', '', amount, ''];
}

/** 1段のインデント（52.12, 52.14: 表計算は全角スペースの前置きで表す） */
const INDENT = '　';

// ============================================================================
// フィクスチャ
// ============================================================================

/** 見積書名。ファイル名は「{見積名}_{行タイプのラベル}.{拡張子}」（32.6） */
const ESTIMATE_NAME = '帳票出力テスト見積書';

/** 明細フィクスチャの名称 */
const ITEM = {
  /** 子を持つ第1階層（明細書ページが作られる / 50.4） */
  parent: '建築工事',
  childA: '基礎工事',
  childB: '躯体工事',
  /** 子を持たない第1階層（明細書ページが作られない / 50.7） */
  standalone: '電気工事',
} as const;

/**
 * 単価（行タイプごとに別の値）
 *
 * 3つの行タイプで**すべて異なる**値にすることで、ファイルが自分の行タイプの値を
 * 持っていることを合計金額で弁別できる（32.2）。
 */
const UNIT_PRICE = {
  childA: { estimate: 100000, execution: 80000, vendor: 70000 },
  childB: { estimate: 200000, execution: 150000, vendor: 140000 },
  standalone: { estimate: 50000, execution: 40000, vendor: 30000 },
} as const;

const QUANTITY = { childA: 2, childB: 3, standalone: 1 } as const;

/**
 * 未保存の編集で置き換える値
 *
 * 基礎工事の見積単価と電気工事の名称を書き換える。編集後の金額（246,912 / 846,912 /
 * 896,912）は編集前のどの値とも一致しないので、保存済みの値から帳票を組み立てる実装は
 * どの期待値にも一致しない。
 */
const EDITED = {
  childAUnitPrice: 123456,
  childAAmount: 2 * 123456,
  standaloneName: '電気設備工事改',
} as const;

/** 帳票用入力項目（54.1〜54.3）。表紙に載る値（51.2, 51.8, 51.11） */
const REPORT_FIELDS = {
  /** 当日日付ではない固定値。全角表記は `２０２７ 年３ 月５ 日`（53.9） */
  submissionDate: '2027-03-05',
  submissionDateOnCover: '２０２７年３月５日',
  validityPeriod: '提出日より3ヶ月間',
  separateWorkFirst: '外構は別途申し受けます',
  separateWorkSecond: '解体は別途申し受けます',
} as const;

/** 見積項目テーブル内の項目ラッパーを指すセレクタ */
const ROW_SELECTOR =
  '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])';

test.describe('帳票出力（ファイル分割・表紙・未保存の反映）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let projectName = '';
  let siteAddress = '';
  let accessToken = '';

  // ==========================================================================
  // 共通ヘルパー
  // ==========================================================================

  /** 明細ツリーをフィクスチャの初期状態へ戻す（帳票用入力項目も未入力へ戻す） */
  const resetItemTree = async (page: Page): Promise<void> => {
    await saveEstimateDraft(page.request, accessToken, createdEstimateId!, [
      buildNewEstimateItemNode({
        name: ITEM.parent,
        children: [
          buildNewEstimateItemNode({
            name: ITEM.childA,
            unit: '式',
            quantity: QUANTITY.childA,
            estimateUnitPrice: UNIT_PRICE.childA.estimate,
            executionUnitPrice: UNIT_PRICE.childA.execution,
            vendorUnitPrice: UNIT_PRICE.childA.vendor,
          }),
          buildNewEstimateItemNode({
            name: ITEM.childB,
            unit: '式',
            quantity: QUANTITY.childB,
            estimateUnitPrice: UNIT_PRICE.childB.estimate,
            executionUnitPrice: UNIT_PRICE.childB.execution,
            vendorUnitPrice: UNIT_PRICE.childB.vendor,
          }),
        ],
      }),
      buildNewEstimateItemNode({
        name: ITEM.standalone,
        unit: '式',
        quantity: QUANTITY.standalone,
        estimateUnitPrice: UNIT_PRICE.standalone.estimate,
        executionUnitPrice: UNIT_PRICE.standalone.execution,
        vendorUnitPrice: UNIT_PRICE.standalone.vendor,
      }),
    ]);
  };

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

  const requireItem = (tree: readonly EstimateItemNode[], name: string): EstimateItemNode => {
    const found = findEstimateItemByName(tree, name);
    expect(found, `明細ツリーに ${name} が見つからない`).toBeTruthy();
    return found!;
  };

  const lineOf = (item: EstimateItemNode, lineType: SaveLineType) => {
    const line = item.lines.find((candidate) => candidate.lineType === lineType);
    expect(line, `${lineType} 行が存在しない`).toBeTruthy();
    return line!;
  };

  const waitForItemTable = async (page: Page): Promise<void> => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
  };

  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await waitForItemTable(page);
  };

  const rowByKey = (page: Page, key: string): Locator =>
    page.locator(`[aria-label="見積項目テーブル"] [data-estimate-row-key="${key}"]`);

  const cellInput = (row: Locator, lineType: SaveLineType, label: string): Locator =>
    row.getByTestId(`line-type-${lineType}`).locator(`input[aria-label="${label}"]`);

  /**
   * ブラウザが送出した書き込みリクエストを収集する
   *
   * 帳票生成に必要な読み取り（表紙のプロジェクト・取引先・自社情報）は GET なので、
   * GET / OPTIONS 以外をすべて書き込み候補として数える。
   */
  const observeWrites = (page: Page): { writes: string[]; stop: () => void } => {
    const writes: string[] = [];
    const record = (request: Request): void => {
      const url = request.url();
      const method = request.method();
      if (!url.startsWith(API_BASE_URL) || url.includes('/api/auth/')) {
        return;
      }
      if (method === 'GET' || method === 'OPTIONS') {
        return;
      }
      writes.push(`${method} ${url}`);
    };
    page.on('request', record);
    return { writes, stop: () => page.off('request', record) };
  };

  /**
   * 保存ボタンを押し、保存ハンドラが完全に解決するまで待つ
   *
   * 観測窓を閉じる契機は「未保存インジケーターの消滅」。`isDirty` は
   * `await onSave(payload)` の解決後にしか下がらないため、ハンドラ内で出た
   * 書き込みは必ず観測済みになる（`networkidle` はナビゲーションが無い局面では
   * 即座に返るため使わない / 53.14 の教訓）。
   */
  const saveAndWaitForSettled = async (page: Page): Promise<void> => {
    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });
    await saveButton.click();

    expect((await savePromise).status()).toBe(200);
    await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0, {
      timeout: getTimeout(10000),
    });
  };

  /**
   * 出力ダイアログを開き、対象行タイプと形式を選んで出力し、全ダウンロードを集める
   *
   * ダウンロードは行タイプの数だけ逐次発生する（32.3）。イベントの発火順が
   * そのまま逐次ダウンロードの順序になるので、集めた配列の順序を検証に用いる。
   */
  const exportAndCollectDownloads = async (
    page: Page,
    options: {
      format: 'pdf' | 'xlsx';
      lineTypes: readonly ('ESTIMATE' | 'EXECUTION' | 'VENDOR')[];
      expectUnsavedNotice: boolean;
    }
  ): Promise<{ fileNames: string[]; filePaths: string[] }> => {
    const downloads: { fileName: string; path: () => Promise<string> }[] = [];
    const onDownload = (download: {
      suggestedFilename(): string;
      path(): Promise<string>;
    }): void => {
      downloads.push({ fileName: download.suggestedFilename(), path: () => download.path() });
    };
    page.on('download', onDownload);

    try {
      await page.getByRole('button', { name: /^出力$/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

      // 未保存の変更が帳票に載ることの告知（56.4）
      const notice = page.getByTestId('estimate-export-unsaved-notice');
      if (options.expectUnsavedNotice) {
        await expect(notice, '未保存の内容が出力される旨が画面に示されない（56.4）').toBeVisible();
      } else {
        await expect(notice, '未保存の変更が無いのに告知が出ている（56.4）').toHaveCount(0);
      }

      for (const lineType of ['ESTIMATE', 'EXECUTION', 'VENDOR'] as const) {
        const checkbox = page.locator(`input[type="checkbox"][value="${lineType}"]`);
        if (options.lineTypes.includes(lineType)) {
          await checkbox.check();
        } else {
          await checkbox.uncheck();
        }
      }

      await page
        .locator(`input[type="radio"][name="export-format"][value="${options.format}"]`)
        .check();

      await dialog.getByRole('button', { name: /^出力$/i }).click();

      // 全ファイルの生成とダウンロードが終わるとダイアログが閉じる
      await expect(dialog).toBeHidden({ timeout: getTimeout(120000) });
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect
        .poll(() => downloads.length, { timeout: getTimeout(30000) })
        .toBe(options.lineTypes.length);
    } finally {
      page.off('download', onDownload);
    }

    const filePaths: string[] = [];
    for (const download of downloads) {
      filePaths.push(await download.path());
    }
    return { fileNames: downloads.map((download) => download.fileName), filePaths };
  };

  const loginAndCaptureToken = async (page: Page): Promise<void> => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();
  };

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // テストデータのセットアップ
  // ==========================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `E2E帳票出力テスト_${Date.now()}`;
      siteAddress = '東京都千代田区テスト5-5-5';
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill(siteAddress);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      expect((await createPromise).status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: 見積書と明細フィクスチャを作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAndCaptureToken(page);

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: ESTIMATE_NAME },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      createdEstimateId = ((await estimateResponse.json()) as { id: string }).id;
      expect(createdEstimateId).toBeTruthy();

      await resetItemTree(page);

      // 3階層（ルート→親→子）が保存され、行タイプごとに別の単価を持つ
      const tree = await fetchTree(page);
      expect(tree).toHaveLength(2);
      const parent = requireItem(tree, ITEM.parent);
      expect(parent.children).toHaveLength(2);
      expect(Number(lineOf(requireItem(tree, ITEM.childA), 'ESTIMATE').unitPrice)).toBe(
        UNIT_PRICE.childA.estimate
      );
      expect(Number(lineOf(requireItem(tree, ITEM.childA), 'EXECUTION').unitPrice)).toBe(
        UNIT_PRICE.childA.execution
      );
    });
  });

  // ==========================================================================
  // 1. 2ファイルの逐次ダウンロードと表紙の有無（32.2, 32.3, 50.2, 50.12, 51.16）
  // ==========================================================================

  test.describe('行タイプごとのファイル生成と表紙', () => {
    /**
     * 見積と実行を選んで出力し、2ファイルが「見積 → 実行」の順にダウンロードされること、
     * および**見積のファイルだけが表紙を持つ**ことをファイルの中身で確認する。
     *
     * 否定側（実行に表紙が無い）が空振りしないことの根拠は、**同じ1回の出力操作で
     * 得た見積のファイルに表紙が実在する**こと。同一フィクスチャ・同一操作なので、
     * 表紙を作る能力がフィクスチャに無いという可能性が排除される。
     *
     * @requirement estimate-creation/REQ-32.3
     * @requirement estimate-creation/REQ-50.2
     * @requirement estimate-creation/REQ-50.12
     * @requirement estimate-creation/REQ-51.16
     */
    test('見積・実行・業者を出力すると3ファイルが順にダウンロードされ、見積のファイルのみ1ページ目が表紙になる (estimate-creation/REQ-32.3, estimate-creation/REQ-50.2, estimate-creation/REQ-50.12, estimate-creation/REQ-51.16)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      await openEstimatePage(page);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0);

      const { fileNames, filePaths } = await exportAndCollectDownloads(page, {
        format: 'xlsx',
        // 3行タイプすべてを選ぶ。50.12 は「実行金額**または**業者金額」なので
        // 片方だけでは要件の半分が無検証のまま残る
        lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'],
        expectUnsavedNotice: false,
      });

      // 32.2 / 32.3: 行タイプごとに1ファイルを「見積 → 実行 → 業者」の順で逐次ダウンロードする
      expect(fileNames).toEqual([
        `${ESTIMATE_NAME}_見積.xlsx`,
        `${ESTIMATE_NAME}_実行.xlsx`,
        `${ESTIMATE_NAME}_業者.xlsx`,
      ]);

      const estimateSheet = await readWorkbookSheet(filePaths[0]!);
      const executionSheet = await readWorkbookSheet(filePaths[1]!);
      const vendorSheet = await readWorkbookSheet(filePaths[2]!);
      expect(estimateSheet.sheetName).toBe('見積');
      expect(executionSheet.sheetName).toBe('実行');
      expect(vendorSheet.sheetName).toBe('業者');

      // --- 見積のファイル: 表紙 → 内訳書 → 明細書 の3ページ（50.2, 50.4, 50.7）---
      expect(
        estimateSheet.rows,
        '見積のファイルのページ数が 表紙＋内訳書＋明細書 の3ページではない'
      ).toHaveLength(3 * PAGE_BLOCK_ROWS);

      // 1ページ目は表紙（51.1 の表題とページ番号のみ。表組みを持たない）
      expect(estimateSheet.rows[0], '見積のファイルの1ページ目が表紙ではない（50.2）').toEqual(
        titleRow(1, '御見積書')
      );
      for (let index = 1; index < PAGE_BLOCK_ROWS; index += 1) {
        expect(estimateSheet.rows[index], `表紙の${index + 1}行目に表組みが描かれている`).toEqual(
          EMPTY_ROW
        );
      }

      // 2ページ目が内訳書（第1階層の一覧 / 50.3）
      expect(estimateSheet.rows[20]).toEqual(titleRow(2, '内訳書（見積）'));
      expect(estimateSheet.rows[21]).toEqual(HEADER_ROW);
      expect(estimateSheet.rows[22]).toEqual(itemRow({ name: 'Ａ.建築工事', amount: '800,000' }));
      expect(estimateSheet.rows[23]).toEqual(
        itemRow({
          name: 'Ｂ.電気工事',
          unit: '式',
          quantity: wholeQuantity(QUANTITY.standalone),
          unitPrice: '50,000',
          amount: '50,000',
        })
      );
      expect(estimateSheet.rows[39]).toEqual(totalRow('850,000'));

      // 3ページ目が明細書（子を持つ項目ごとに改ページ / 50.4）
      expect(estimateSheet.rows[40]).toEqual(titleRow(3, '明細書（見積）'));
      expect(estimateSheet.rows[42]).toEqual(itemRow({ name: 'Ａ.建築工事' }));
      expect(estimateSheet.rows[43]).toEqual(
        itemRow({
          name: `${INDENT}基礎工事`,
          unit: '式',
          quantity: wholeQuantity(QUANTITY.childA),
          unitPrice: '100,000',
          amount: '200,000',
        })
      );
      expect(estimateSheet.rows[44]).toEqual(
        itemRow({
          name: `${INDENT}躯体工事`,
          // 直前の行と同一の単位は繰り返し記号になる（53.6）
          unit: '〃',
          quantity: wholeQuantity(QUANTITY.childB),
          unitPrice: '200,000',
          amount: '600,000',
        })
      );
      expect(estimateSheet.rows[59]).toEqual(totalRow('800,000'));

      // --- 実行のファイル: 表紙を持たず1ページ目が内訳書（50.12, 51.16）---
      expect(
        executionSheet.rows,
        '実行のファイルのページ数が 内訳書＋明細書 の2ページではない'
      ).toHaveLength(2 * PAGE_BLOCK_ROWS);

      expect(
        executionSheet.rows[0],
        '実行のファイルの1ページ目が内訳書になっていない（50.12）'
      ).toEqual(titleRow(1, '内訳書（実行）'));
      expect(executionSheet.rows[1]).toEqual(HEADER_ROW);

      // 表紙の表題がファイルのどこにも現れない（51.16）。
      // 同じ1回の出力で得た見積のファイルには実在するので、この否定は空振りではない。
      expect(
        executionSheet.rows.flat().filter((cell) => cell.includes('御見積書')),
        '実行のファイルに表紙が混入している（51.16）'
      ).toEqual([]);
      expect(
        vendorSheet.rows.flat().filter((cell) => cell.includes('御見積書')),
        '業者のファイルに表紙が混入している（51.16）'
      ).toEqual([]);
      expect(
        estimateSheet.rows.flat().filter((cell) => cell.includes('御見積書')),
        '見積のファイルに表紙が無い（対照。この主張が落ちると上の否定は無意味）'
      ).toEqual(['御見積書']);

      // 実行のファイルは実行金額を持つ（32.2: ファイルごとに当該行タイプの値）
      expect(executionSheet.rows[2]).toEqual(itemRow({ name: 'Ａ.建築工事', amount: '610,000' }));
      expect(executionSheet.rows[3]).toEqual(
        itemRow({
          name: 'Ｂ.電気工事',
          unit: '式',
          quantity: wholeQuantity(QUANTITY.standalone),
          unitPrice: '40,000',
          amount: '40,000',
        })
      );
      expect(executionSheet.rows[19]).toEqual(totalRow('650,000'));

      // ページ番号は各ファイル内の通し番号（32.9, 50.8）。
      // 表紙が無い分だけ内訳書・明細書のページ番号が1つ前へ寄る。
      expect(executionSheet.rows[20]).toEqual(titleRow(2, '明細書（実行）'));
      expect(executionSheet.rows[23]).toEqual(
        itemRow({
          name: `${INDENT}基礎工事`,
          unit: '式',
          quantity: wholeQuantity(QUANTITY.childA),
          unitPrice: '80,000',
          amount: '160,000',
        })
      );
      expect(executionSheet.rows[39]).toEqual(totalRow('610,000'));

      // --- 業者のファイル: 50.12 のもう一方の行タイプ。同じく表紙を持たない ---
      expect(
        vendorSheet.rows,
        '業者のファイルのページ数が 内訳書＋明細書 の2ページではない'
      ).toHaveLength(2 * PAGE_BLOCK_ROWS);
      expect(
        vendorSheet.rows[0],
        '業者のファイルの1ページ目が内訳書になっていない（50.12）'
      ).toEqual(titleRow(1, '内訳書（業者）'));
      expect(vendorSheet.rows[2]).toEqual(itemRow({ name: 'Ａ.建築工事', amount: '560,000' }));
      expect(vendorSheet.rows[3]).toEqual(
        itemRow({
          name: 'Ｂ.電気工事',
          unit: '式',
          quantity: wholeQuantity(QUANTITY.standalone),
          unitPrice: '30,000',
          amount: '30,000',
        })
      );
      expect(vendorSheet.rows[19]).toEqual(totalRow('590,000'));
      expect(vendorSheet.rows[20]).toEqual(titleRow(2, '明細書（業者）'));
      expect(vendorSheet.rows[39]).toEqual(totalRow('560,000'));
    });
  });

  // ==========================================================================
  // 2. 未保存の変更の反映と保持（56.1〜56.4）
  // ==========================================================================

  test.describe('未保存の変更を含む出力', () => {
    /**
     * 未保存の編集を行った状態で出力し、生成ファイルに**編集中の値**が入ること、
     * および出力が保存を一切伴わないことを確認する。
     *
     * 「書き込み0件」の観測窓は編集の前に開き、出力を挟んで最後の保存まで開けたままにする。
     * 窓の終端で系列が `PUT /:id/save` のちょうど1件であることを要求するので、
     * リスナーが死んでいればこの `toEqual` 自身が落ちる（53.14 / 54.11 / 55.9 の数え方）。
     *
     * @requirement estimate-creation/REQ-56.1
     * @requirement estimate-creation/REQ-56.2
     * @requirement estimate-creation/REQ-56.3
     * @requirement estimate-creation/REQ-56.4
     */
    test('未保存の変更を含む状態で出力すると編集中の値が帳票に載り、保存は行われず未保存の変更が残る (estimate-creation/REQ-56.1, estimate-creation/REQ-56.2, estimate-creation/REQ-56.3, estimate-creation/REQ-56.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);

      const tree = await fetchTree(page);
      const childAId = requireItem(tree, ITEM.childA).id;
      const standaloneId = requireItem(tree, ITEM.standalone).id;

      await openEstimatePage(page);
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(4);

      // 画面表示後のリクエストだけを数える
      const { writes, stop } = observeWrites(page);

      // --- 未保存の編集（56.1 の前提）---
      await cellInput(rowByKey(page, childAId), 'ESTIMATE', '単価').fill(
        String(EDITED.childAUnitPrice)
      );
      await cellInput(rowByKey(page, standaloneId), 'ESTIMATE', '名称').fill(EDITED.standaloneName);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // --- 未保存のまま出力する（56.1）。告知が出る（56.4）---
      const { fileNames, filePaths } = await exportAndCollectDownloads(page, {
        format: 'xlsx',
        lineTypes: ['ESTIMATE'],
        expectUnsavedNotice: true,
      });
      expect(fileNames).toEqual([`${ESTIMATE_NAME}_見積.xlsx`]);

      const sheet = await readWorkbookSheet(filePaths[0]!);

      // --- 編集中の値が帳票に載っている（56.2）---
      expect(sheet.rows[22], '編集した単価が親の集計に反映されていない（56.2）').toEqual(
        itemRow({ name: 'Ａ.建築工事', amount: '846,912' })
      );
      expect(sheet.rows[23], '編集した名称が内訳書に反映されていない（56.2）').toEqual(
        itemRow({
          name: `Ｂ.${EDITED.standaloneName}`,
          unit: '式',
          quantity: wholeQuantity(QUANTITY.standalone),
          unitPrice: '50,000',
          amount: '50,000',
        })
      );
      expect(sheet.rows[39]).toEqual(totalRow('896,912'));
      expect(sheet.rows[43], '編集した単価が明細書に反映されていない（56.2）').toEqual(
        itemRow({
          name: `${INDENT}基礎工事`,
          unit: '式',
          quantity: wholeQuantity(QUANTITY.childA),
          unitPrice: '123,456',
          amount: String(EDITED.childAAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        })
      );
      expect(sheet.rows[59]).toEqual(totalRow('846,912'));

      // 保存済みの値は帳票のどこにも現れない（保存済みツリーから組み立てる実装との弁別）。
      // これらの文字列は同じフィクスチャの未編集時（本 spec の1本目）に実際に現れる。
      const allCells = sheet.rows.flat();
      for (const staleValue of ['850,000', '800,000', '100,000', 'Ｂ.電気工事']) {
        expect(
          allCells.filter((cell) => cell === staleValue),
          `保存済みの値 ${staleValue} が帳票に残っている（56.2）`
        ).toEqual([]);
      }

      // --- 出力しても未保存の変更は残る（56.3）---
      await expect(
        page.getByTestId('estimate-unsaved-indicator'),
        '出力後に未保存の変更が失われている（56.3）'
      ).toBeVisible();
      await expect(cellInput(rowByKey(page, childAId), 'ESTIMATE', '単価')).toHaveValue(
        String(EDITED.childAUnitPrice)
      );

      // サーバー側も出力前のまま（出力が保存を伴っていない / 56.3）
      const untouched = await fetchTree(page);
      expect(Number(lineOf(requireItem(untouched, ITEM.childA), 'ESTIMATE').unitPrice)).toBe(
        UNIT_PRICE.childA.estimate
      );
      expect(findEstimateItemByName(untouched, EDITED.standaloneName)).toBeUndefined();

      // --- 窓を閉じる。出力の間の書き込みは0件で、保存の1件だけが記録されている ---
      await saveAndWaitForSettled(page);
      stop();

      expect(writes, '出力が書き込みを発生させている、または観測窓が閉じていた（56.3）').toEqual([
        `PUT ${API_BASE_URL}/api/estimates/${createdEstimateId}/save`,
      ]);

      // 保存で編集内容が確定する（＝編集そのものが実在していたことの裏取り）
      const saved = await fetchTree(page);
      expect(Number(lineOf(requireItem(saved, ITEM.childA), 'ESTIMATE').unitPrice)).toBe(
        EDITED.childAUnitPrice
      );
      expect(findEstimateItemByName(saved, EDITED.standaloneName)).toBeTruthy();
    });
  });

  // ==========================================================================
  // 3. 帳票用入力項目と表紙（54.6, 56.2, 50.2, 50.12, 51.16）
  // ==========================================================================

  test.describe('帳票用入力項目の表紙への反映', () => {
    /**
     * 提出日・有効期限・別途工事を画面から入力し（54.6）、保存せずにPDFを出力して
     * **表紙にその値が載る**ことを、PDFから抽出したテキストで確認する。
     *
     * 表紙の内容は帳票（PDF）にしか描かれない（表計算の表紙は表題とページ番号のみ）ため、
     * この検証はPDF経路でしか成立しない。併せて、実行のファイルが表紙を持たず
     * 1ページ目が内訳書であることもページ数とページ本文で確認する（50.2, 50.12, 51.16）。
     *
     * @requirement estimate-creation/REQ-32.2
     * @requirement estimate-creation/REQ-54.6
     */
    test('帳票用入力項目を入力して出力すると表紙に反映され、実行のファイルには表紙が無い (estimate-creation/REQ-32.2, estimate-creation/REQ-54.6)', async ({
      page,
    }) => {
      test.setTimeout(getTimeout(300000));
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      await openEstimatePage(page);

      // --- 帳票用入力項目を画面から編集する（54.6）---
      const panel = page.getByTestId('estimate-report-fields-panel');
      await expect(panel).toBeVisible();
      await panel.getByTestId('report-submission-date').fill(REPORT_FIELDS.submissionDate);
      await panel.getByTestId('report-validity-period').fill(REPORT_FIELDS.validityPeriod);
      await panel.getByTestId('add-separate-work').click();
      await panel.getByTestId('add-separate-work').click();
      await panel.getByTestId('report-separate-work-0').fill(REPORT_FIELDS.separateWorkFirst);
      await panel.getByTestId('report-separate-work-1').fill(REPORT_FIELDS.separateWorkSecond);
      await expect(panel.getByTestId('separate-works-count')).toHaveText('2 / 5 件');

      // 編集は未保存の変更として扱われる（54.8）
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      const { fileNames, filePaths } = await exportAndCollectDownloads(page, {
        format: 'pdf',
        lineTypes: ['ESTIMATE', 'EXECUTION'],
        expectUnsavedNotice: true,
      });
      expect(fileNames).toEqual([`${ESTIMATE_NAME}_見積.pdf`, `${ESTIMATE_NAME}_実行.pdf`]);

      const estimatePages = await extractPdfPageTexts(filePaths[0]!);
      const executionPages = await extractPdfPageTexts(filePaths[1]!);

      // --- 見積のファイル: 1ページ目が表紙（50.2）---
      expect(estimatePages, '見積のファイルが 表紙＋内訳書＋明細書 の3ページではない').toHaveLength(
        3
      );
      const cover = estimatePages[0]!;
      expect(cover, '1ページ目が表紙ではない（50.2）').toContain('御見積書');
      expect(cover).toContain('下記のとおり御見積申し上げます。');
      // 表紙の見積金額は全角数字・全角カンマ（53.8）で、内訳書の合計と同額
      expect(cover).toContain('御見積金額￥８５０，０００');
      expect(cover).toContain(`工事件名：${projectName}`);
      expect(cover).toContain(`工事場所：${siteAddress}`);

      // 画面で入力した帳票用入力項目が表紙に載る（54.6, 56.2）
      expect(cover, '提出日が表紙に反映されていない（51.2, 53.9, 54.6）').toContain(
        REPORT_FIELDS.submissionDateOnCover
      );
      expect(cover, '有効期限が表紙に反映されていない（51.8, 54.6）').toContain(
        `（見積有効期限：${REPORT_FIELDS.validityPeriod}）`
      );
      expect(cover, '別途工事が表紙に反映されていない（51.11, 54.6）').toContain(
        REPORT_FIELDS.separateWorkFirst
      );
      expect(cover).toContain(REPORT_FIELDS.separateWorkSecond);

      // 表紙は表組みのページではない（内訳書は2ページ目から）
      expect(cover).not.toContain('内訳書');
      expect(estimatePages[1]!).toContain('内訳書（見積）');
      expect(estimatePages[2]!).toContain('明細書（見積）');
      // 見積の内訳書は見積金額の合計を持つ（下の「実行に 850,000 が無い」の対照）
      expect(estimatePages[1]!).toContain('850,000');
      expect(estimatePages[1]!).not.toContain('650,000');

      // --- 実行のファイル: 表紙が無く1ページ目が内訳書（50.12, 51.16）---
      expect(
        executionPages,
        '実行のファイルが 内訳書＋明細書 の2ページではない（表紙が付いている疑い）'
      ).toHaveLength(2);
      expect(
        executionPages[0]!,
        '実行のファイルの1ページ目が内訳書になっていない（50.12）'
      ).toContain('内訳書（実行）');
      // 同じ1回の出力で得た見積の表紙に実在する文言なので、この否定は空振りではない
      for (const coverOnlyText of ['御見積書', '御見積金額', '下記のとおり御見積申し上げます。']) {
        expect(
          executionPages.join(''),
          `実行のファイルに表紙の内容が混入している（51.16）: ${coverOnlyText}`
        ).not.toContain(coverOnlyText);
      }
      // 32.2: 実行のファイルは実行金額の合計を持つ（見積の 850,000 ではない）
      expect(executionPages[0]!).toContain('650,000');
      expect(executionPages[0]!).not.toContain('850,000');
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      if (!accessToken) {
        const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
          data: { email: 'user@example.com', password: 'Password123!' },
        });
        accessToken = ((await loginResponse.json()) as { accessToken: string }).accessToken;
      }

      if (createdEstimateId) {
        await request.delete(`${API_BASE_URL}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdProjectId) {
        await request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      createdProjectId = null;
      createdEstimateId = null;
    });
  });
});
