/**
 * @fileoverview EstimateExcelExportService の単体テスト（Task 56.7）
 *
 * **検証方針**: 本タスクの見出しの受入基準は
 * 「用紙設定・ページ構成・列構成・値の表記規則を**帳票と同一**にする」という
 * 「同一の◯◯を用いる」型の要件である。片側（表計算側）だけを固定すると要件の中身が
 * 丸ごと無防備になる（56.5 が同型の 52.1 で差し戻された失敗形）。そこで本ファイルは
 * **同一の `ReportFileSpec` を PDF 側（`drawTablePage`）と表計算側（`buildWorkbook`）の
 * 両方へ通し、描かれた文字とセルの値を突き合わせる**形で「同一」を検証する。
 * PDF 側の期待値は実装定数を import せず、`pdf-format-reference.md` の px 実測値を
 * 本ファイルに直書きし、テスト独自の換算で列・行・インデント段数を特定する
 * （56.4 / 56.5 の「実装が使ったのと同じ式で期待値を作らない」先例）。
 *
 * Requirements (estimate-creation):
 * - 10.2: PDF出力と同じ用紙設定・ページ構成・列構成・値の書式規則に従う .xlsx を生成する
 * - 10.9: 出力形式のデフォルトをExcel（.xlsx）とする（本サービスが .xlsx を生成する側）
 * - 32.2: 行タイプごとに独立したファイルを生成する
 * - 32.3: 「見積」「実行」「業者」の順に逐次ダウンロードする
 * - 32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 * - 52.14: Excel では罫線（52.3〜52.6）を描かず、列構成・行構成・表題・ページ番号・
 *   合計行・階層記号・インデントのみを Requirement 52 に従って構成する
 * - 53.1〜53.7: 数量・単価・金額・単位・階層記号の表記規則
 *
 * Design: design.md `#### Frontend Export` > `##### EstimateExcelExportService`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const xlsxControl = vi.hoisted(() => ({
  /** この回数目の `XLSX.write` で例外を投げる（0 起点、`null` で無効） */
  failOnWriteIndex: null as number | null,
  writeCount: 0,
  /**
   * サービスが実際に書き出したワークブック
   *
   * `generate` の戻り値は `Blob` なので、これを捕まえないと
   * **サービス自身のパイプライン**（`recalculateAncestorAmounts` → `buildFiles` →
   * `buildWorkbook`）を観測できない。`buildWorkbook` を直に呼ぶ検証だけだと、
   * サービスが再計算を省いても緑のままになる（56.3 の申し送りが守られない）。
   */
  written: [] as unknown[],
}));

const layoutControl = vi.hoisted(() => ({
  /**
   * `buildFiles` を throw させる（組み立て段階の失敗を模す）
   *
   * `levelSymbol` の `RangeError`（56.1）のように、**書き出しより前の組み立て段階**でも
   * 例外が起こりうる。実データからこの経路を発火させる入力は作れない
   * （`visibleEntries` は常に非負整数を渡す）ため、境界をモックで再現する。
   */
  failBuildFiles: false,
}));

vi.mock('./estimateReportLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./estimateReportLayout')>();
  return {
    ...actual,
    buildFiles: (...args: Parameters<typeof actual.buildFiles>): unknown => {
      if (layoutControl.failBuildFiles) {
        throw new RangeError('levelSymbol: index は0以上の整数である必要があります: -1');
      }
      return actual.buildFiles(...args);
    },
  };
});

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    write: (...args: Parameters<typeof actual.write>): unknown => {
      const index = xlsxControl.writeCount;
      xlsxControl.writeCount += 1;
      if (xlsxControl.failOnWriteIndex === index) {
        throw new Error('xlsx: 書き出しに失敗しました');
      }
      xlsxControl.written.push(args[0]);
      return actual.write(...args);
    },
  };
});

import * as XLSX from 'xlsx';

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';
import { recalculateAncestorAmounts } from '../../domain/estimate/estimateTree';

import { drawTablePage } from './EstimateTableRenderer';
import type { TablePdfDocument } from './EstimateTableRenderer';
import { buildFiles } from './estimateReportLayout';
import type { ReportFileSpec, ReportPage } from './estimateReportLayout';

import {
  buildReportWorkbookFileName,
  buildWorkbook,
  downloadFiles,
  estimateExcelExportService,
  EstimateExcelExportError,
  EXCEL_EXPORT_FAILURE_MESSAGE_PREFIX,
  generate,
  generateAndDownload,
} from './EstimateExcelExportService';
import type { EstimateExcelExportInput } from './EstimateExcelExportService';

// ============================================================================
// 参照PDFの実測値（pdf-format-reference.md §1 / §4 / §6）
//
// **実装の定数は import しない。** 同書の論理座標（96dpi px）を直書きし、
// 換算もテスト側で行う。
// ============================================================================

/** 96dpi px → mm（同書「座標系の読み方」） */
const PX_TO_MM = 0.264583;

/** 列境界 8 本（§4）。左から 名称/規格/単位/数量/単価/金額/備考 の 7 列を作る */
const COLUMN_BOUNDARY_PX = [59.8, 339.7, 547.5, 608.0, 717.6, 827.4, 944.5, 1063.4] as const;

/** 用紙（50.1 / §1）。A4 横 */
const PAPER_WIDTH_MM = 297;

/** 表の上端（見出し行の上端）y=94.6 px（§4） */
const TABLE_TOP_MM = 94.6 * PX_TO_MM;

/** 見出し行の高さ（§4 の 94.6 → 128.5 px） */
const HEADER_ROW_HEIGHT_MM = (128.5 - 94.6) * PX_TO_MM;

/** 明細行の行ピッチ 34.0 px（§4） */
const DETAIL_ROW_HEIGHT_MM = 34.0 * PX_TO_MM;

/** 行の上罫線からベースラインまで 21.5 px（§4） */
const BASELINE_OFFSET_MM = 21.5 * PX_TO_MM;

/** 明細書の見出し行の名称 x=80 px（§6） */
const NAME_BASE_X_MM = 80.0 * PX_TO_MM;

/** インデント1段 27 px（§6「名称は x=107（見出し行より +27 px）」） */
const INDENT_STEP_MM = 27.0 * PX_TO_MM;

/** 1ページの明細行数（52.5） */
const DETAIL_ROWS_PER_PAGE = 17;

/** Excel の既定フォント（Calibri 11）の最大数字幅と左右余白（96dpi px / OOXML） */
const MAX_DIGIT_WIDTH_PX = 7;
const CELL_PADDING_PX = 5;

/** 表計算の1ページ分のブロック行数＝表題1 ＋ 見出し1 ＋ 明細17 ＋ 合計1（52.5） */
const PAGE_BLOCK_ROWS = 1 + 1 + DETAIL_ROWS_PER_PAGE + 1;

/** 全角スペース。PDF 側の字間（56.5 の責務）と表計算側のインデントに使われる */
const IDEOGRAPHIC_SPACE = '　';

// ============================================================================
// テスト側で導出する列・行の座標
// ============================================================================

interface TestColumnBox {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly widthPx: number;
}

const TEST_COLUMN_BOXES: readonly TestColumnBox[] = COLUMN_BOUNDARY_PX.slice(0, -1).map(
  (leftPx, index) => {
    const rightPx = COLUMN_BOUNDARY_PX[index + 1]!;
    return { leftMm: leftPx * PX_TO_MM, rightMm: rightPx * PX_TO_MM, widthPx: rightPx - leftPx };
  }
);

const COLUMN_COUNT = TEST_COLUMN_BOXES.length;

/** 見出し行のベースライン */
const HEADER_BASELINE_MM = TABLE_TOP_MM + BASELINE_OFFSET_MM;

/** 明細行 index（0 起点）のベースライン */
function detailBaselineMm(index: number): number {
  return TABLE_TOP_MM + HEADER_ROW_HEIGHT_MM + DETAIL_ROW_HEIGHT_MM * index + BASELINE_OFFSET_MM;
}

/** 合計行のベースライン */
const TOTAL_BASELINE_MM = detailBaselineMm(DETAIL_ROWS_PER_PAGE);

// ============================================================================
// PDF 側の記録用ダブル（56.5 / 56.6 と同じ計量）
// ============================================================================

interface DrawnText {
  readonly text: string;
  readonly xMm: number;
  readonly yMm: number;
}

interface RecordingTableDoc extends TablePdfDocument {
  readonly texts: readonly DrawnText[];
  lineCount(): number;
}

function recordingTableDoc(): RecordingTableDoc {
  const MM_PER_PT = 25.4 / 72;
  const texts: DrawnText[] = [];
  let lines = 0;
  let fontSizePt = 10;

  return {
    texts,
    lineCount: (): number => lines,
    setFontSize: (size: number): void => {
      fontSizePt = size;
    },
    setDrawColor: (): void => undefined,
    setLineWidth: (): void => undefined,
    line: (): void => {
      lines += 1;
    },
    text: (text: string, xMm: number, yMm: number): void => {
      texts.push({ text, xMm, yMm });
    },
    getTextWidth: (text: string): number => {
      let units = 0;
      for (const character of text) {
        units += (character.codePointAt(0) ?? 0) < 128 ? 0.5 : 1;
      }
      return units * fontSizePt * MM_PER_PT;
    },
  };
}

/** 1行分の復元結果 */
interface PdfRow {
  readonly cells: readonly string[];
  /** 名称欄の x から逆算したインデント段数。名称欄が空なら `null` */
  readonly indentLevel: number | null;
}

/** 描画された文字を y（行）と x（列）から表のセルへ復元する */
function pdfPage(page: ReportPage): {
  readonly header: readonly string[];
  readonly detail: readonly PdfRow[];
  readonly total: readonly string[];
  readonly lineCount: number;
} {
  const doc = recordingTableDoc();
  drawTablePage(doc, page);

  const header: string[] = Array.from({ length: COLUMN_COUNT }, () => '');
  const total: string[] = Array.from({ length: COLUMN_COUNT }, () => '');
  const detailCells: string[][] = Array.from({ length: DETAIL_ROWS_PER_PAGE }, () =>
    Array.from({ length: COLUMN_COUNT }, () => '')
  );
  const detailIndent: (number | null)[] = Array.from({ length: DETAIL_ROWS_PER_PAGE }, () => null);

  const columnOf = (xMm: number): number =>
    TEST_COLUMN_BOXES.findIndex((box) => xMm >= box.leftMm - 0.5 && xMm < box.rightMm);

  for (const drawn of doc.texts) {
    const column = columnOf(drawn.xMm);
    if (column === -1) {
      continue;
    }
    if (Math.abs(drawn.yMm - HEADER_BASELINE_MM) < 0.5) {
      header[column] = drawn.text;
      continue;
    }
    if (Math.abs(drawn.yMm - TOTAL_BASELINE_MM) < 0.5) {
      total[column] = drawn.text;
      continue;
    }
    for (let index = 0; index < DETAIL_ROWS_PER_PAGE; index += 1) {
      if (Math.abs(drawn.yMm - detailBaselineMm(index)) < 0.5) {
        detailCells[index]![column] = drawn.text;
        if (column === 0) {
          // `|| 0` は `-0`（丸め誤差ぶんだけ基準より左）を `0` に正規化するだけで、
          // 0 以外の段数には影響しない
          detailIndent[index] = Math.round((drawn.xMm - NAME_BASE_X_MM) / INDENT_STEP_MM) || 0;
        }
        break;
      }
    }
  }

  return {
    header,
    detail: detailCells.map((cells, index) => ({ cells, indentLevel: detailIndent[index]! })),
    total,
    lineCount: doc.lineCount(),
  };
}

/** PDF 側だけが入れる字間（全角スペース）を落として値を比較可能にする */
function withoutCharacterSpacing(text: string): string {
  return text.split(IDEOGRAPHIC_SPACE).join('');
}

/** 表計算側の名称欄からインデント（先頭の全角スペース）を切り出す */
function splitIndent(name: string): { readonly level: number; readonly text: string } {
  let level = 0;
  while (name.startsWith(IDEOGRAPHIC_SPACE, level * IDEOGRAPHIC_SPACE.length)) {
    level += 1;
  }
  return { level, text: name.slice(level * IDEOGRAPHIC_SPACE.length) };
}

// ============================================================================
// 表計算側の読み出し
// ============================================================================

function sheetOf(file: ReportFileSpec): XLSX.WorkSheet {
  const workbook = buildWorkbook(file);
  return workbook.Sheets[workbook.SheetNames[0]!]!;
}

/** 行 rowIndex（0 起点）の A〜G 列の値。セルが無い欄は空文字 */
function sheetRow(sheet: XLSX.WorkSheet, rowIndex: number): readonly string[] {
  return TEST_COLUMN_BOXES.map((_box, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })] as
      { v?: unknown } | undefined;
    return cell === undefined ? '' : String(cell.v);
  });
}

/** 値の入っているセル番地の一覧 */
function populatedAddresses(sheet: XLSX.WorkSheet): readonly string[] {
  return Object.keys(sheet)
    .filter((key) => !key.startsWith('!'))
    .sort();
}

/** 生成された .xlsx のバイト列を latin1 文字列として取り出す（既定は無圧縮 ZIP） */
function writtenXml(file: ReportFileSpec): string {
  const buffer = XLSX.write(buildWorkbook(file), {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer;
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
}

/** サービスが実際に書き出した index 番目のワークシート */
function writtenSheet(index: number): XLSX.WorkSheet {
  const workbook = xlsxControl.written[index] as XLSX.WorkBook;
  return workbook.Sheets[workbook.SheetNames[0]!]!;
}

/** ページ番号（1 起点）に対応する表計算のブロック先頭行 */
function blockTopOf(page: ReportPage): number {
  return (page.pageNumber - 1) * PAGE_BLOCK_ROWS;
}

// ============================================================================
// フィクスチャ
// ============================================================================

function line(lineType: EstimateLineType, overrides: Partial<EditableLine> = {}): EditableLine {
  return {
    id: null,
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    remarks: null,
    sourceVendorName: null,
    ...overrides,
  };
}

function item(options: {
  key: string;
  itemType?: EstimateEditItemType;
  lines: readonly EditableLine[];
  children?: readonly EditableItem[];
}): EditableItem {
  return {
    id: options.key,
    tempId: null,
    itemType: options.itemType ?? 'STANDARD',
    lines: options.lines,
    children: options.children ?? [],
  };
}

/**
 * 表記規則を全て跨ぐ明細ツリー
 *
 * - `Ａ`/`Ｂ` の階層記号（53.7）
 * - 同一単位の連続による `〃`（53.6）
 * - 整数の数量（`1`）と小数の数量（`343.05` → 小数第1位へ丸め / 53.1, 53.2）
 * - 3桁区切りの金額（`25,000` / 53.3）
 * - **単価・金額がゼロ**の項目（→ 空欄 / 53.4）**境界**
 * - 値引き行の負数（`-5,000` / 53.5, 41.12）
 * - 注記行（名称のみ / 55.5）
 * - 子項目のインデント（52.12）
 * - **親項目の金額が空**（`recalculateAncestorAmounts` 未適用だと配下ごと消える / 56.3 申し送り）
 */
function referenceTree(): readonly EditableItem[] {
  return [
    item({
      key: 'a',
      // 金額欄は空。子の合計で確定させるのは `recalculateAncestorAmounts` の責務
      lines: [line('ESTIMATE', { name: '仮設工事', unit: '式', quantity: '1' })],
      children: [
        item({
          key: 'a1',
          lines: [
            line('ESTIMATE', {
              name: '足場',
              specification: '枠組足場',
              unit: '㎡',
              quantity: '100',
              unitPrice: '250',
              amount: '25000',
              remarks: '外部',
            }),
          ],
        }),
        item({
          key: 'a2',
          lines: [
            line('ESTIMATE', {
              name: '養生',
              unit: '㎡',
              quantity: '80',
              unitPrice: '200',
              amount: '16000',
            }),
          ],
        }),
        item({
          key: 'a3',
          itemType: 'NOTE',
          lines: [line('ESTIMATE', { name: '数量は設計図による' })],
        }),
        item({
          key: 'a4',
          lines: [
            line('ESTIMATE', {
              name: '端数調整',
              unit: '式',
              quantity: '1',
              unitPrice: '0',
              amount: '0',
            }),
          ],
        }),
        item({
          key: 'a5',
          itemType: 'DISCOUNT',
          lines: [line('ESTIMATE', { name: '値引', unit: '式', quantity: '1', amount: '-5000' })],
        }),
      ],
    }),
    item({
      key: 'b',
      lines: [line('ESTIMATE', { name: '塗装工事', unit: '式', quantity: '1' })],
      children: [
        item({
          key: 'b1',
          lines: [
            line('ESTIMATE', {
              name: '下地処理',
              unit: '㎡',
              quantity: '343.05',
              unitPrice: '30',
              amount: '10292',
            }),
          ],
        }),
      ],
    }),
  ];
}

function filesOf(
  tree: readonly EditableItem[],
  lineTypes: readonly EstimateLineType[]
): readonly ReportFileSpec[] {
  return buildFiles(recalculateAncestorAmounts(tree), lineTypes);
}

function referenceFile(): ReportFileSpec {
  return filesOf(referenceTree(), ['ESTIMATE'])[0]!;
}

function pageOf(file: ReportFileSpec, kind: ReportPage['kind'], parentLabel?: string): ReportPage {
  return file.pages.find(
    (page) => page.kind === kind && (parentLabel === undefined || page.parentLabel === parentLabel)
  )!;
}

function input(overrides: Partial<EstimateExcelExportInput> = {}): EstimateExcelExportInput {
  return {
    tree: referenceTree(),
    lineTypes: ['ESTIMATE'],
    estimate: { name: '本社ビル改修工事 見積' },
    ...overrides,
  };
}

/** 3行タイプすべてに値を持つ最小のツリー */
function threeLineTypeTree(): readonly EditableItem[] {
  return [
    item({
      key: 'x',
      lines: [
        line('ESTIMATE', { name: '工事', unit: '式', quantity: '1', amount: '1000' }),
        line('EXECUTION', { name: '工事', unit: '式', quantity: '1', amount: '800' }),
        line('VENDOR', { name: '工事', unit: '式', quantity: '1', amount: '700' }),
      ],
    }),
  ];
}

// ============================================================================

const clickedFileNames: string[] = [];

beforeEach(() => {
  xlsxControl.failOnWriteIndex = null;
  xlsxControl.writeCount = 0;
  xlsxControl.written.length = 0;
  layoutControl.failBuildFiles = false;
  clickedFileNames.length = 0;

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clickedFileNames.push(this.download);
  });
});

// ============================================================================
// 列構成が帳票と同一（10.2, 52.2, 52.7, 52.14）
// ============================================================================

describe('列構成が帳票と同一', () => {
  it('見出し行に「名称」「規格」「単位」「数量」「単価」「金額」「備考」を左からこの順で出力する', () => {
    const file = referenceFile();
    const summary = pageOf(file, 'summary');

    expect(sheetRow(sheetOf(file), blockTopOf(summary) + 1)).toEqual([
      '名称',
      '規格',
      '単位',
      '数量',
      '単価',
      '金額',
      '備考',
    ]);
  });

  it('見出し行の列名が帳票（PDF）に描かれる列名と字間を除いて一致する', () => {
    const file = referenceFile();
    const summary = pageOf(file, 'summary');

    const excel = sheetRow(sheetOf(file), blockTopOf(summary) + 1);
    const pdf = pdfPage(summary).header.map(withoutCharacterSpacing);

    expect(pdf.filter((label) => label !== '')).toHaveLength(7);
    expect(excel).toEqual(pdf);
  });

  it('8列目以降にセルを作らない（7列ちょうど）', () => {
    const sheet = sheetOf(referenceFile());
    const range = XLSX.utils.decode_range(String(sheet['!ref']));

    expect(range.e.c).toBe(COLUMN_COUNT - 1);
  });
});

// ============================================================================
// 値の表記規則が帳票と同一（10.2, 53.1〜53.7）
// ============================================================================

describe('値の表記規則が帳票と同一', () => {
  it('全ページの明細行・合計行のセルが帳票（PDF）に描かれる文字列と一致する', () => {
    const file = referenceFile();
    const sheet = sheetOf(file);

    let comparedRows = 0;
    let comparedValues = 0;

    for (const page of file.pages) {
      if (page.kind === 'cover') {
        continue;
      }
      const blockTop = blockTopOf(page);
      const pdf = pdfPage(page);

      for (let index = 0; index < DETAIL_ROWS_PER_PAGE; index += 1) {
        const excel = [...sheetRow(sheet, blockTop + 2 + index)];
        const { level, text } = splitIndent(excel[0]!);
        excel[0] = text;

        expect(excel).toEqual(pdf.detail[index]!.cells);
        if (pdf.detail[index]!.indentLevel !== null) {
          // インデントの表現は PDF が x のずれ、表計算が先頭の全角スペース（52.12）
          expect(level).toBe(pdf.detail[index]!.indentLevel);
          comparedValues += 1;
        }
        comparedRows += 1;
      }

      expect(sheetRow(sheet, blockTop + 2 + DETAIL_ROWS_PER_PAGE)).toEqual(
        pdf.total.map(withoutCharacterSpacing)
      );
      comparedRows += 1;
    }

    // 空振り防止: 全ページ分の行を比較し、うち名称のある行でインデントも比較したこと。
    // 内訳書2行 ＋ 明細書Ａ（見出し1 ＋ 子5） ＋ 明細書Ｂ（見出し1 ＋ 子1）＝ 10
    expect(comparedRows).toBe((file.pages.length - 1) * (DETAIL_ROWS_PER_PAGE + 1));
    expect(comparedValues).toBe(10);
  });

  it('数量・金額・単位・階層記号の表記が Requirement 53 のとおり出力される', () => {
    const file = referenceFile();
    const sheet = sheetOf(file);
    const blockTop = blockTopOf(pageOf(file, 'detail', 'Ａ.仮設工事'));

    // 先頭行＝親項目の階層記号と名称（52.11 / 53.7）
    expect(sheetRow(sheet, blockTop + 2)[0]).toBe('Ａ.仮設工事');
    // 子項目：3桁区切り（53.3）・整数の数量は小数部を空白（53.1, 53.2）
    expect(sheetRow(sheet, blockTop + 3)).toEqual([
      '　足場',
      '枠組足場',
      '㎡',
      '100     ',
      '250',
      '25,000',
      '外部',
    ]);
    // 直前と同一単位は「〃」（53.6）
    expect(sheetRow(sheet, blockTop + 4)[2]).toBe('〃');
    // 注記行は名称欄のみ（55.5）
    expect(sheetRow(sheet, blockTop + 5)).toEqual(['　数量は設計図による', '', '', '', '', '', '']);
    // 単価・金額がゼロの行は空欄（53.4）**境界**
    expect(sheetRow(sheet, blockTop + 6)).toEqual(['　端数調整', '', '式', '1     ', '', '', '']);
    // 値引き行は負数（53.5 / 41.12）
    expect(sheetRow(sheet, blockTop + 7)).toEqual([
      '　【値引】',
      '',
      '〃',
      '1     ',
      '',
      '-5,000',
      '',
    ]);
    // 合計行（52.10）。注記行を除き値引きの負数を含む
    expect(sheetRow(sheet, blockTop + 2 + DETAIL_ROWS_PER_PAGE)).toEqual([
      '【合計】',
      '',
      '',
      '',
      '',
      '36,000',
      '',
    ]);
  });

  it('小数の数量は小数第1位まで出力する（53.1）', () => {
    const file = referenceFile();
    const blockTop = blockTopOf(pageOf(file, 'detail', 'Ｂ.塗装工事'));

    expect(sheetRow(sheetOf(file), blockTop + 3)[3]).toBe('343.1   ');
  });

  it('列幅に収まらない文字列を打ち切らない（52.14 は 52.13 を Excel の対象外とする）', () => {
    const longName = 'あ'.repeat(60);
    const tree = [
      item({
        key: 'long',
        lines: [line('ESTIMATE', { name: longName, unit: '式', quantity: '1', amount: '1000' })],
      }),
    ];
    const file = filesOf(tree, ['ESTIMATE'])[0]!;
    const summary = pageOf(file, 'summary');

    // 前提: 同じページを帳票（PDF）へ描くと 52.13 により打ち切られる
    const drawn = pdfPage(summary).detail[0]!.cells[0]!;
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(longName.length);

    // 表計算は打ち切らない
    expect(sheetRow(sheetOf(file), blockTopOf(summary) + 2)[0]).toBe(`Ａ.${longName}`);
  });
});

// ============================================================================
// ページ構成が帳票と同一（10.2, 32.9, 50.2, 50.8〜50.10, 52.5）
// ============================================================================

describe('ページ構成が帳票と同一', () => {
  it('表紙・内訳書・明細書を帳票と同じ順序・同じページ数で並べる', () => {
    const file = referenceFile();
    const sheet = sheetOf(file);

    expect(file.pages.map((page) => page.kind)).toEqual(['cover', 'summary', 'detail', 'detail']);

    for (const page of file.pages) {
      expect(sheetRow(sheet, blockTopOf(page))[0]).toBe(`No. Page.${page.pageNumber}`);
    }
  });

  it('1ページを表題1行・見出し1行・明細17行・合計1行の20行ブロックとする（52.5）', () => {
    const file = referenceFile();
    const range = XLSX.utils.decode_range(String(sheetOf(file)['!ref']));

    expect(range.e.r + 1).toBe(file.pages.length * PAGE_BLOCK_ROWS);
  });

  it('表題とページ番号を帳票（PDF）と同じ文字列で出力する（52.8, 52.9, 32.4）', () => {
    const file = referenceFile();
    const summary = pageOf(file, 'summary');

    const doc = recordingTableDoc();
    drawTablePage(doc, summary);
    const drawnTitle = withoutCharacterSpacing(doc.texts[0]!.text);
    const drawnPageNumber = doc.texts[1]!.text;

    expect(drawnTitle).toBe('内訳書（見積）');
    expect(sheetRow(sheetOf(file), blockTopOf(summary)).filter((value) => value !== '')).toEqual([
      drawnPageNumber,
      drawnTitle,
    ]);
  });

  it('表題を表の水平中心を含む列へ置く（52.8）', () => {
    const file = referenceFile();
    const summary = pageOf(file, 'summary');

    const tableCenterMm =
      (TEST_COLUMN_BOXES[0]!.leftMm + TEST_COLUMN_BOXES[COLUMN_COUNT - 1]!.rightMm) / 2;
    const centerColumn = TEST_COLUMN_BOXES.findIndex(
      (box) => tableCenterMm >= box.leftMm && tableCenterMm < box.rightMm
    );

    expect(centerColumn).toBe(2);
    expect(sheetRow(sheetOf(file), blockTopOf(summary))[centerColumn]).toBe('内訳書（見積）');
  });

  it('継続ページの合計行を空にし、最終ページにのみ合計を置く（50.10）', () => {
    const children = Array.from({ length: 20 }, (_value, index) =>
      item({
        key: `c${index}`,
        lines: [
          line('ESTIMATE', {
            name: `工種${index}`,
            unit: '式',
            quantity: '1',
            unitPrice: '1000',
            amount: '1000',
          }),
        ],
      })
    );
    const tree = [
      item({ key: 'p', lines: [line('ESTIMATE', { name: '親', unit: '式' })], children }),
    ];
    const file = filesOf(tree, ['ESTIMATE'])[0]!;
    const sheet = sheetOf(file);
    const detailPages = file.pages.filter((page) => page.kind === 'detail');

    expect(detailPages).toHaveLength(2);
    expect(sheetRow(sheet, blockTopOf(detailPages[0]!) + 2 + DETAIL_ROWS_PER_PAGE)).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    expect(sheetRow(sheet, blockTopOf(detailPages[1]!) + 2 + DETAIL_ROWS_PER_PAGE)[5]).toBe(
      '20,000'
    );
  });

  it('表紙のページは表題とページ番号のみを出力し、見出し行を持たない（51.16, 50.2）', () => {
    const file = referenceFile();
    const sheet = sheetOf(file);
    const blockTop = blockTopOf(pageOf(file, 'cover'));

    expect(sheetRow(sheet, blockTop)).toEqual(['No. Page.1', '', '御見積書', '', '', '', '']);
    for (let offset = 1; offset < PAGE_BLOCK_ROWS; offset += 1) {
      expect(sheetRow(sheet, blockTop + offset)).toEqual(['', '', '', '', '', '', '']);
    }
  });

  it('1ページの上限（17行）を超える明細行を渡されたら黙って切り詰めず失敗する（52.5）', () => {
    const summary = pageOf(referenceFile(), 'summary');
    const overflowing: ReportPage = {
      ...summary,
      rows: Array.from({ length: DETAIL_ROWS_PER_PAGE + 1 }, () => summary.rows[0]!),
    };
    const file: ReportFileSpec = { ...referenceFile(), pages: [overflowing] };

    expect(() => buildWorkbook(file)).toThrow(RangeError);
  });

  it('表紙を持たない行タイプでは1ページ目が内訳書になる（50.12）', () => {
    const file = filesOf(threeLineTypeTree(), ['VENDOR'])[0]!;

    expect(file.hasCoverPage).toBe(false);
    expect(sheetRow(sheetOf(file), 1)).toEqual([
      '名称',
      '規格',
      '単位',
      '数量',
      '単価',
      '金額',
      '備考',
    ]);
  });
});

// ============================================================================
// 用紙設定が帳票と同一（10.2, 50.1）
// ============================================================================

describe('用紙設定が帳票と同一', () => {
  it('左右の余白と7列の幅がA4横（297mm）を再構成する', () => {
    const xml = writtenXml(referenceFile());
    const margins = /<pageMargins([^>]*)\/>/.exec(xml)![1]!;
    const leftIn = Number(/ left="([^"]+)"/.exec(margins)![1]);
    const rightIn = Number(/ right="([^"]+)"/.exec(margins)![1]);
    const tableWidthMm = TEST_COLUMN_BOXES.reduce((sum, box) => sum + box.widthPx * PX_TO_MM, 0);

    expect(leftIn * 25.4).toBeCloseTo(TEST_COLUMN_BOXES[0]!.leftMm, 1);
    expect(leftIn * 25.4 + tableWidthMm + rightIn * 25.4).toBeCloseTo(PAPER_WIDTH_MM, 1);
  });
});

// ============================================================================
// 列幅の換算（56.7「列幅を帳票の列定義から換算して設定する」）
// ============================================================================

describe('列幅を帳票の列定義から換算する', () => {
  it('各列の幅が帳票の列幅を Excel の文字幅へ換算した値になる', () => {
    const xml = writtenXml(referenceFile());
    const cols = /<cols>([\s\S]*?)<\/cols>/.exec(xml)![1]!;
    const widths = [...cols.matchAll(/<col [^>]*width="([^"]+)"[^>]*\/>/g)].map((match) =>
      Number(match[1])
    );

    expect(widths).toHaveLength(COLUMN_COUNT);
    TEST_COLUMN_BOXES.forEach((box, index) => {
      // Excel の列幅（文字数）＝（画素幅 − 左右余白5px）÷ 最大数字幅7px。
      // OOXML の格納値は「文字数 ＋ 余白 ÷ 最大数字幅」
      const characters = (box.widthPx - CELL_PADDING_PX) / MAX_DIGIT_WIDTH_PX;
      expect(widths[index]).toBeCloseTo(characters + CELL_PADDING_PX / MAX_DIGIT_WIDTH_PX, 2);
    });
  });

  it('列幅がすべて明示指定される（customWidth）', () => {
    const cols = /<cols>([\s\S]*?)<\/cols>/.exec(writtenXml(referenceFile()))![1]!;

    expect([...cols.matchAll(/customWidth="1"/g)]).toHaveLength(COLUMN_COUNT);
  });
});

// ============================================================================
// 罫線を出力しない（52.14）
//
// **バイト列に対する「罫線が無い」検査は書かない。** `xlsx@0.20.3` の
// `write_sty_xml`（`xlsx.mjs:11578`）は `<borders count="1"><border><left/>…</border></borders>`
// を**分岐もオプションも無く文字列リテラルとして出力**し、`write_cellXfs` も
// `borderId="0"` の xf を1つ出すだけである。同様に `write_ws_xml_sheetviews` は
// `showGridLines` 属性を一切出力しない。したがって
// `<borders count="1">` / `style="` の不在 / `borderId="[1-9]` の不在 / `showGridLines="0"` の不在は
// **本モジュールの実装に依らず常に真**であり、検査として成立しない
// （実際、全セルへ `s: { border: { top: { style: 'thin' } } }` を付けても書き出しは変わらない）。
//
// 52.14 に対して load-bearing なのは、**本モジュールが実際に制御しているもの**を見る
// 以下の2件である:
//   - セルに書式（`s`）を付けないこと … 上記の `s` 付与変異を殺す
//   - 罫線の代替として罫線めいた文字を書かないこと … 空欄へ `--------` を入れる変異を殺す
// バイト列レベルで実装が制御しているのは `<cols>` と `<pageMargins>` で、
// それぞれ「列幅を帳票の列定義から換算する」「用紙設定が帳票と同一」の節が固定している。
// ============================================================================

/**
 * @requirement estimate-creation/REQ-52.14 出力形式がExcelの場合は罫線の描画を行わず列構成・行構成・表題・ページ番号・合計行・階層記号・インデントのみを本要件に従って構成する
 */
describe('罫線を出力せず標準のグリッド線に委ねる', () => {
  it('帳票（PDF）が同じページに罫線を引くのに対し、表計算はセル書式を一切持たない', () => {
    const file = referenceFile();

    // 前提: 同じページを帳票へ描くと縦8本・横20本の罫線が引かれる（52.3〜52.6）
    expect(pdfPage(pageOf(file, 'summary')).lineCount).toBe(8 + 20);

    const sheet = sheetOf(file);
    const addresses = populatedAddresses(sheet);
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect((sheet[address] as { s?: unknown }).s).toBeUndefined();
    }
  });

  it('罫線の代替として罫線めいた文字をセルへ書き込まない', () => {
    const sheet = sheetOf(referenceFile());

    for (const address of populatedAddresses(sheet)) {
      expect(String((sheet[address] as { v: unknown }).v)).not.toMatch(/[─━│┃┌┐└┘├┤┬┴┼＿|_-]{3,}/);
    }
  });
});

// ============================================================================
// 行タイプごとに1ファイル・逐次ダウンロード（32.2, 32.3, 32.5, 32.6, 10.2）
// ============================================================================

describe('行タイプごとのファイル生成と逐次ダウンロード', () => {
  it('チェックされた行タイプごとに1ファイルを「見積」「実行」「業者」の順に生成する', () => {
    const files = generate(
      input({ tree: threeLineTypeTree(), lineTypes: ['VENDOR', 'ESTIMATE', 'EXECUTION'] })
    );

    expect(files.map((file) => file.lineType)).toEqual(['ESTIMATE', 'EXECUTION', 'VENDOR']);
    expect(files.map((file) => file.fileName)).toEqual([
      '本社ビル改修工事 見積_見積.xlsx',
      '本社ビル改修工事 見積_実行.xlsx',
      '本社ビル改修工事 見積_業者.xlsx',
    ]);
  });

  it('選択されていない行タイプのファイルを出力しない（32.5）', () => {
    expect(generate(input({ lineTypes: ['ESTIMATE'] }))).toHaveLength(1);
    expect(generate(input({ lineTypes: [] }))).toHaveLength(0);
  });

  it('生成したファイルを受け取った順に逐次ダウンロードする', () => {
    generateAndDownload(input({ tree: threeLineTypeTree(), lineTypes: ['ESTIMATE', 'EXECUTION'] }));

    expect(clickedFileNames).toEqual([
      '本社ビル改修工事 見積_見積.xlsx',
      '本社ビル改修工事 見積_実行.xlsx',
    ]);
  });

  it('2ファイル目の生成で失敗した場合はファイルを1つもダウンロードしない', () => {
    xlsxControl.failOnWriteIndex = 1;

    expect(() =>
      generateAndDownload(
        input({ tree: threeLineTypeTree(), lineTypes: ['ESTIMATE', 'EXECUTION'] })
      )
    ).toThrow(EstimateExcelExportError);
    expect(clickedFileNames).toEqual([]);
  });

  it('失敗時のエラーは日本語のメッセージと原因を保持する', () => {
    xlsxControl.failOnWriteIndex = 0;

    try {
      generate(input());
      expect.unreachable('例外が送出されるはず');
    } catch (error) {
      expect(error).toBeInstanceOf(EstimateExcelExportError);
      expect((error as EstimateExcelExportError).message).toContain(
        '帳票（表計算形式）の出力に失敗しました。'
      );
      expect((error as EstimateExcelExportError).reason).toBeInstanceOf(Error);
    }
  });

  it('組み立て段階の例外も未捕捉のまま抜けさせず日本語のエラーへ包む', () => {
    // `levelSymbol` の `RangeError`（56.1 の申し送り）に代表される、**書き出しより前**の
    // 失敗経路。`buildFiles(recalculateAncestorAmounts(...))` の呼び出しが `try` の外にあると
    // 生の `RangeError` がそのまま画面へ抜け、56.9 が結線する日本語メッセージが出なくなる。
    layoutControl.failBuildFiles = true;

    try {
      generate(input());
      expect.unreachable('例外が送出されるはず');
    } catch (error) {
      expect(error).toBeInstanceOf(EstimateExcelExportError);
      expect((error as EstimateExcelExportError).message).toContain(
        EXCEL_EXPORT_FAILURE_MESSAGE_PREFIX
      );
      expect((error as EstimateExcelExportError).reason).toBeInstanceOf(RangeError);
    }
    // 組み立てで落ちた以上、書き出しは1度も起きていない（原子性）
    expect(xlsxControl.written).toHaveLength(0);
    expect(clickedFileNames).toEqual([]);
  });

  it('ファイル名に見積名と行タイプのラベルと .xlsx 拡張子を含める（32.6, 10.2）', () => {
    expect(buildReportWorkbookFileName('A/B:C 見積', '実行')).toBe('A_B_C 見積_実行.xlsx');
  });

  it('Excel のMIMEタイプで Blob を生成する（10.2, 10.9）', () => {
    const files = generate(input());

    expect(files[0]!.blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(files[0]!.blob.size).toBeGreaterThan(0);
  });

  it('公開インターフェースが generate / downloadFiles / generateAndDownload を備える', () => {
    expect(estimateExcelExportService.generate).toBe(generate);
    expect(estimateExcelExportService.downloadFiles).toBe(downloadFiles);
    expect(estimateExcelExportService.generateAndDownload).toBe(generateAndDownload);
  });
});

// ============================================================================
// 空・ゼロ・未入力の正常系（56.6 の差し戻しへの対応）
// ============================================================================

describe('空・ゼロ・未入力の見積書', () => {
  it('明細が1件も無い見積書でも出力できる（新規作成直後）', () => {
    expect(generate(input({ tree: [] }))).toHaveLength(1);

    const file = filesOf([], ['ESTIMATE'])[0]!;
    const sheet = sheetOf(file);
    const blockTop = blockTopOf(pageOf(file, 'summary'));

    // 合計行の金額欄は空欄（`formatMoney` はゼロに空文字を返す / 53.4）
    expect(sheetRow(sheet, blockTop + 2 + DETAIL_ROWS_PER_PAGE)).toEqual([
      '【合計】',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    for (let index = 0; index < DETAIL_ROWS_PER_PAGE; index += 1) {
      expect(sheetRow(sheet, blockTop + 2 + index)).toEqual(['', '', '', '', '', '', '']);
    }
  });

  it('全額ゼロの見積書でも金額欄を空欄として出力する（53.4）', () => {
    const tree = [
      item({
        key: 'z',
        lines: [
          line('ESTIMATE', {
            name: '無償対応',
            unit: '式',
            quantity: '0',
            unitPrice: '0',
            amount: '0',
          }),
        ],
      }),
    ];
    const file = filesOf(tree, ['ESTIMATE'])[0]!;
    const blockTop = blockTopOf(pageOf(file, 'summary'));

    expect(sheetRow(sheetOf(file), blockTop + 2)).toEqual([
      'Ａ.無償対応',
      '',
      '式',
      '0     ',
      '',
      '',
      '',
    ]);
    expect(generate(input({ tree }))).toHaveLength(1);
  });

  it('親項目の金額が未確定でも配下が帳票から消えない（56.3 の申し送り）', () => {
    // `recalculateAncestorAmounts` を通さないと `EXECUTION` の親が「値を持たない項目」と
    // 判定され、内訳書からも明細書からも配下ごと消える。**サービス自身が書き出した
    // ワークブック**を観測しないとこの経路は検証できない（`buildWorkbook` の直呼びでは
    // テスト側が再計算を肩代わりしてしまう）
    const tree = [
      item({
        key: 'p',
        lines: [line('EXECUTION')],
        children: [
          item({
            key: 'c',
            lines: [
              line('EXECUTION', { name: '足場', unit: '㎡', quantity: '100', amount: '20000' }),
            ],
          }),
        ],
      }),
    ];

    expect(generate(input({ tree, lineTypes: ['EXECUTION'] }))).toHaveLength(1);

    const sheet = writtenSheet(0);
    const range = XLSX.utils.decode_range(String(sheet['!ref']));

    // 内訳書1ページ ＋ 明細書1ページ（表紙は 51.16 により実行金額のファイルには無い）
    expect(range.e.r + 1).toBe(2 * PAGE_BLOCK_ROWS);
    // 親は名称も持たないため名称欄は階層記号のみ。金額は再計算で子の合計に確定する
    expect(sheetRow(sheet, 2)).toEqual(['Ａ.', '', '', '', '', '20,000', '']);
    expect(sheetRow(sheet, PAGE_BLOCK_ROWS + 2)[0]).toBe('Ａ.');
    expect(sheetRow(sheet, PAGE_BLOCK_ROWS + 3)[0]).toBe('　足場');
  });
});
