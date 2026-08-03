/**
 * @fileoverview EstimateExcelExportService - 帳票（表計算形式）の出力サービス
 *
 * `estimateReportLayout.buildFiles` が組み立てた `ReportFileSpec[]` を **PDF 帳票と同一の
 * 用紙設定・ページ構成・列構成・値の表記規則**で `.xlsx` へ書き出し、行タイプごとに
 * 1ファイルとして逐次ダウンロードする（10.2）。
 *
 * **「帳票と同一」を構造で保証する**: 本モジュールは `buildFiles` の戻り値を**そのまま**
 * 消費する。ページの並び（表紙・内訳書・明細書と継続ページ）、7列の列定義、
 * `ReportRow` の各欄の文字列（Requirement 53 の数量・単価・金額・単位・階層記号の表記）は
 * すべて 56.1〜56.3 が確定済みで、本モジュールは**再導出も再実装もしない**。
 * PDF 側（`EstimatePdfExportService` → `EstimateTableRenderer`）と入力が同一である以上、
 * 出力が一致することは偶然ではなく構造上の帰結になる。
 *
 * **罫線は出力しない**（52.14）: `xlsx@0.20.3`（SheetJS Community）の書き込み経路は
 * セル単位の罫線・書式を出力できない（`cellXfs` は既定の1件のみ）。本モジュールは
 * 罫線に相当する文字や行を代替として書き込むこともせず、Excel 標準のグリッド線に委ねる。
 * これに伴い 52.13 の打ち切りも行わない（52.14 は Excel の対象を列構成・行構成・表題・
 * ページ番号・合計行・階層記号・インデントに限っており、打ち切りは含まれない。
 * 表計算のセルは紙面と違い列幅を越えても値が失われないため、打ち切ると情報が欠落する）。
 *
 * **用紙設定の限界（要件と実装可能範囲の差）**: `xlsx@0.20.3` の xlsx 書き出しは
 * `<pageSetup>`（用紙サイズ・向き）を**出力しない**（`xlsx.mjs:16505` は実装されていない
 * TODO コメントで、読み取り経路にも存在しない）。したがって「A4・横向き」を
 * ファイル自身に持たせることはできず、`.xlsx` を開いた利用者が印刷設定で選ぶことになる。
 * 本モジュールが表現できる用紙設定は `<pageMargins>` の左右余白のみで、
 * これは `REPORT_GRID` の表の左端と右端から導く。結果として
 * **`左余白 ＋ 7列の幅 ＋ 右余白 = 297mm`（A4横の幅）** が成り立ち、
 * 紙面上の列の位置は帳票と一致する。52.14 が罫線について認めているのと同種の
 * ライブラリ由来の制約であり、design.md `##### EstimateExcelExportService` の
 * 「セル単位の罫線を書き出せない」と同じ扱いとする。
 *
 * **ページの表現**: 表計算にはページの概念が無いため、ページ相当の区切りはシートではなく
 * **行方向の連続**とし、1ページを「表題行1 ＋ 見出し行1 ＋ 明細行17 ＋ 合計行1」の
 * 固定 20 行ブロックとして書き出す（52.5, design.md `##### EstimateExcelExportService`）。
 * 明細行が 17 行に満たないページも残りを空行として埋めるため、
 * ページ N のブロック先頭行は常に `(N - 1) × 20` になる。
 *
 * **動的読み込みは行わない**: 兄弟の `EstimatePdfExportService` は日本語フォント資産
 * （約2.25MB）を抱えるため `loadEstimatePdfExportService` で初期チャンクから切り離しているが、
 * 本モジュールが抱える重量物は `xlsx` のみで、`xlsx` は既に
 * `utils/export-excel.ts` / `components/quantity-table-import/excel-parser.ts` /
 * `components/estimate-request/ExcelExportButton.tsx` などから**静的に import されている**。
 * 本モジュールだけを動的化してもバンドルからは消えないため、境界モジュールは設けない。
 *
 * **フォント資産への非到達**: 本モジュールは `PdfExportService` を import しない
 * （`PdfReportService` 経由でフォント資産へ到達するため）。
 * ダウンロードは同等の実装を本モジュール内に持つ。
 * なお `services/export/index.ts`（フォント資産を再エクスポートしていた barrel）は
 * Task 56.13 で撤去済みで、各モジュールは実体を直接 import する。
 *
 * 依存方向: `domain` と `services/export` の型・定数にのみ依存し、`hooks` / `components` /
 * `pages` / `api` には依存しない（design.md `#### Dependency Direction`）。
 *
 * Requirements (estimate-creation):
 * - 10.2: PDF出力と同じ用紙設定・ページ構成・列構成・値の書式規則に従う .xlsx を生成する
 * - 10.9: 出力形式のデフォルトをExcel（.xlsx）とする（既定値の設定はダイアログ側の責務）
 * - 32.2: 行タイプごとに独立したファイルを生成する
 * - 32.3: 「見積」「実行」「業者」の順に逐次ダウンロードする
 * - 32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 * - 52.14: 罫線を描かず、列構成・行構成・表題・ページ番号・合計行・階層記号・
 *   インデントのみを Requirement 52 に従って構成する
 * - 53.1〜53.7: 数量・単価・金額・単位・階層記号の表記規則（`buildFiles` が適用済み）
 *
 * **本モジュールが担わない範囲**（tasks.md 56.7 の要件一覧に無いもの）:
 * - 表紙の内容（Requirement 51 / 53.8 / 53.9）。表紙のページは 51.16 に従って
 *   見積金額のファイルにのみ置かれ、表題とページ番号だけを持つ。宛先・工事件名・
 *   全角の見積金額などの描画は帳票（PDF）側 `EstimateCoverRenderer` の担当
 * - 出力形式の既定値（10.9）とダイアログの結線・処理中表示（10.7）は 56.9 の担当
 * - 明細書フッタの親項目名（50.11）。同じ文字列が当該ページの先頭行に既に出るため
 *   表計算では重複させない
 *
 * Design: design.md `#### Frontend Export` > `##### EstimateExcelExportService`
 *
 * @module services/export/EstimateExcelExportService
 */

import * as XLSX from 'xlsx';

import type {
  EditableItem,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';
import { recalculateAncestorAmounts } from '../../domain/estimate/estimateTree';

import { buildFiles, REPORT_GRID } from './estimateReportLayout';
import type { ReportFileSpec, ReportPage, ReportRow } from './estimateReportLayout';
import { sanitizeName } from './zip-naming';

// ============================================================================
// 型定義
// ============================================================================

/** 表計算出力の入力 */
export interface EstimateExcelExportInput {
  /**
   * 明細ツリー
   *
   * 親項目の金額が未確定でも構わない。本サービスが `recalculateAncestorAmounts` を
   * 通してから `buildFiles` へ渡す（tasks.md Implementation Notes 56.3 の申し送り）。
   */
  readonly tree: readonly EditableItem[];
  /** 出力対象の行タイプ。順序は問わない（32.3 の順序は `buildFiles` が決める） */
  readonly lineTypes: readonly EstimateLineType[];
  readonly estimate: { readonly name: string };
}

/** 生成済みの1ファイル */
export interface GeneratedReportWorkbook {
  readonly lineType: EstimateLineType;
  readonly fileName: string;
  readonly blob: Blob;
}

/**
 * 表計算出力サービス
 *
 * 生成（`generate`）と配信（`downloadFiles`）を別メソッドに保ち、その合成
 * （`generateAndDownload`）が「全件生成してから配信する」順序を構造として保証する。
 * 途中で失敗した場合はファイルを1つもダウンロードしない。
 */
export interface EstimateExcelExportService {
  /** 行タイプごとに1ファイル。「見積」「実行」「業者」の順で返す（32.2, 32.3） */
  generate(input: EstimateExcelExportInput): readonly GeneratedReportWorkbook[];
  /** 生成済みファイルを受け取った順に逐次ダウンロードする（32.3） */
  downloadFiles(files: readonly GeneratedReportWorkbook[]): void;
  /** 全件を生成し終えてから逐次ダウンロードする（部分成功で配信しない） */
  generateAndDownload(input: EstimateExcelExportInput): readonly GeneratedReportWorkbook[];
}

/**
 * 表計算出力の失敗
 *
 * `message` はそのまま画面に出せる日本語であること。原因の例外は `reason` に保持する
 * （`Error.cause` は tsconfig の `lib: ES2020` に無いため独自に持つ）。
 * 56.1 の `levelSymbol` が投げる `RangeError` のような**組み立て段階の例外も
 * 未捕捉のまま画面へ抜けさせず**、必ず本エラーへ包んで送出する。
 */
export class EstimateExcelExportError extends Error {
  /** 原因となった例外 */
  public readonly reason: unknown;

  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'EstimateExcelExportError';
    this.reason = reason;
  }
}

// ============================================================================
// 定数
// ============================================================================

/** 生成に失敗したときの利用者向けメッセージの前置き */
export const EXCEL_EXPORT_FAILURE_MESSAGE_PREFIX = '帳票（表計算形式）の出力に失敗しました。';

/** `.xlsx` の MIME タイプ（10.2） */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ファイル名の拡張子（10.2, 10.9） */
const FILE_EXTENSION = '.xlsx';

/** 見積名とラベルの区切り（32.6） */
const FILE_NAME_SEPARATOR = '_';

/**
 * ページ番号の表記（52.9）
 *
 * 帳票（`EstimateTableRenderer`）が表の上部左へ描く `No. Page.N` と同一の文字列。
 * 両者が一致することは `EstimateExcelExportService.test.ts` の
 * 「表題とページ番号を帳票（PDF）と同じ文字列で出力する」が突き合わせて固定している。
 */
const PAGE_NUMBER_LABEL = 'No.';
const PAGE_NUMBER_PREFIX = 'Page.';

/**
 * 名称欄のインデント1段（52.12, 52.14）
 *
 * 帳票は親項目より右へ 27 px ずらして描くが、表計算のセルには水平位置の概念が無く、
 * `xlsx@0.20.3` は字下げ書式（`alignment.indent`）も書き出せない。
 * 52.12 が要求するのは**親項目より右へずらすこと**という相対関係なので、
 * 段数に比例した全角スペースの前置きで表す。
 */
const INDENT_UNIT = '　';

/** 1インチあたりのミリメートル（`!margins` はインチ単位） */
const MM_PER_INCH = 25.4;

/** 1ミリメートルあたりの画素数（96dpi）。`pdf-format-reference.md` の `mm = px × 0.264583` の逆数 */
const PX_PER_MM = 96 / MM_PER_INCH;

/**
 * Excel の列幅の単位（OOXML `col/@width`）
 *
 * 列幅は「既定フォントの最大数字幅（Calibri 11 / 96dpi で 7 px）が何文字入るか」で表され、
 * セル左右の余白 5 px が別に加算される。すなわち
 * `画素幅 = 文字数 × 7 + 5`、格納値 = `文字数 + 5 / 7`。
 * `col.MDW` に 7 を与えることで SheetJS の格納値もこの定義に揃う
 * （既定は 6 で、与えないと全列が約 0.12 文字ぶん広くなる）。
 */
const MAX_DIGIT_WIDTH_PX = 7;
const CELL_PADDING_PX = 5;

/**
 * 1ページ分のブロック行数（52.5）
 *
 * 表題行1 ＋ 見出し行1 ＋ 明細行17 ＋ 合計行1。明細行が17行に満たないページも
 * 残りを空行で埋めるため、ページ番号 N のブロック先頭行は常に `(N - 1) × ブロック行数`。
 */
const TITLE_ROWS = 1;
const HEADER_ROWS = 1;
const TOTAL_ROWS = 1;
const PAGE_BLOCK_ROWS = TITLE_ROWS + HEADER_ROWS + REPORT_GRID.detailRowsPerPage + TOTAL_ROWS;

/** セルへ書き出す値。空欄はセルを作らない */
type CellValue = string | null;

// ============================================================================
// 列（52.2, 52.8）
// ============================================================================

/** 表の幅（mm）＝7列の幅の総和。`REPORT_GRID` の列定義から導出する */
const TABLE_WIDTH_MM = REPORT_GRID.columns.reduce((sum, column) => sum + column.widthMm, 0);

/**
 * 表題を置く列（52.8「表の上部中央」）
 *
 * 帳票は表題を紙面座標の中央へ描くが、表計算では列の単位でしか置けない。
 * **表の水平中心を含む列**を表題の列とすることで、帳票の「中央」と同じ位置になる。
 */
function centerColumnIndex(): number {
  const centerMm = TABLE_WIDTH_MM / 2;
  let leftMm = 0;
  for (const [index, column] of REPORT_GRID.columns.entries()) {
    const rightMm = leftMm + column.widthMm;
    if (centerMm >= leftMm && centerMm < rightMm) {
      return index;
    }
    leftMm = rightMm;
  }
  /* istanbul ignore next -- 列幅の総和が中心を含まないことは起こりえない */
  return 0;
}

const TITLE_COLUMN_INDEX = centerColumnIndex();

/**
 * 帳票の列幅（mm）を Excel の列幅（文字数）へ換算する
 *
 * `mm → 96dpi px → 文字数`。参照PDFの座標系（96dpi px）がそのまま Excel の画素と
 * 同じ単位なので、換算は用紙寸法を経由せずに閉じる。
 */
export function columnWidthCharacters(widthMm: number): number {
  return (widthMm * PX_PER_MM - CELL_PADDING_PX) / MAX_DIGIT_WIDTH_PX;
}

// ============================================================================
// 行の組み立て
// ============================================================================

/** 空文字の欄はセルを作らない（罫線も空欄の埋め草も置かない / 52.14） */
function cellOf(text: string): CellValue {
  return text === '' ? null : text;
}

/** 空行（7列すべて空欄） */
function blankRow(): CellValue[] {
  return REPORT_GRID.columns.map(() => null);
}

/**
 * 明細行・合計行を7つのセルへ変換する
 *
 * 各欄は 56.2 / 56.3 が Requirement 53 を適用済みの**完成文字列**であり、
 * 本関数は表記規則を一切再実装しない。名称欄にだけインデント（52.12）を前置きする。
 */
function rowCells(row: ReportRow): CellValue[] {
  const name = row.name === '' ? '' : `${INDENT_UNIT.repeat(row.indentLevel)}${row.name}`;
  return [
    cellOf(name),
    cellOf(row.specification),
    cellOf(row.unit),
    cellOf(row.quantity),
    cellOf(row.unitPrice),
    cellOf(row.amount),
    cellOf(row.remarks),
  ];
}

/** 表題行（52.8, 52.9, 32.4）。左端にページ番号、表の水平中心を含む列に表題 */
function titleRowCells(page: ReportPage): CellValue[] {
  const cells = blankRow();
  cells[0] = `${PAGE_NUMBER_LABEL} ${PAGE_NUMBER_PREFIX}${page.pageNumber}`;
  cells[TITLE_COLUMN_INDEX] = page.title;
  return cells;
}

/** 見出し行（52.7）。列名は `REPORT_GRID` の列定義をそのまま用いる */
function headerRowCells(): CellValue[] {
  return REPORT_GRID.columns.map((column) => column.label);
}

/**
 * 1ページを固定 20 行のブロックへ書き出す
 *
 * 表紙（`kind === 'cover'`）は表題とページ番号だけを持ち、表組みを持たない（51.16）。
 * 表紙に載せる宛先・工事情報・自社情報（Requirement 51）は帳票（PDF）側の
 * `EstimateCoverRenderer` の担当で、本タスク（56.7）の要件範囲外。
 *
 * 1ページの上限（17行）を超える明細行を渡された場合は `RangeError` を送出する。
 * 黙って切り詰めると18行目以降が**どのファイルにも現れず静かに欠落**するため
 * （56.1 の `levelSymbol` / 56.5 の `drawTablePage` と同じ防御的重複）。
 */
function pageBlock(page: ReportPage): CellValue[][] {
  if (page.rows.length > REPORT_GRID.detailRowsPerPage) {
    throw new RangeError(
      `EstimateExcelExportService: 1ページの明細行は ${REPORT_GRID.detailRowsPerPage} 行までです: ${page.rows.length} 行（52.5）`
    );
  }

  const block: CellValue[][] = [titleRowCells(page)];

  if (page.kind === 'cover') {
    while (block.length < PAGE_BLOCK_ROWS) {
      block.push(blankRow());
    }
    return block;
  }

  block.push(headerRowCells());
  for (let index = 0; index < REPORT_GRID.detailRowsPerPage; index += 1) {
    const row = page.rows[index];
    block.push(row === undefined ? blankRow() : rowCells(row));
  }
  block.push(page.totalRow === null ? blankRow() : rowCells(page.totalRow));

  return block;
}

// ============================================================================
// ワークブックの組み立て
// ============================================================================

/**
 * 1ファイル分のワークブックを組み立てる
 *
 * ページ相当の区切りはシートではなく行方向の連続とし、1シートに全ページを並べる
 * （design.md `##### EstimateExcelExportService`）。
 *
 * Requirements: 10.2, 52.5, 52.7, 52.8, 52.9, 52.10, 52.12, 52.14, 53.1〜53.7
 */
export function buildWorkbook(file: ReportFileSpec): XLSX.WorkBook {
  const rows = file.pages.flatMap((page) => pageBlock(page));
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // 列幅（帳票の列定義からの換算）。`MDW` は既定フォントの最大数字幅（px）
  sheet['!cols'] = REPORT_GRID.columns.map((column) => ({
    wch: columnWidthCharacters(column.widthMm),
    MDW: MAX_DIGIT_WIDTH_PX,
  }));

  // 用紙の左右余白（50.1）。左＝表の左端、右＝用紙幅から表の右端までの残り。
  // `左余白 ＋ 7列の幅 ＋ 右余白` が A4 横の 297mm を再構成する。
  // 上下は帳票では表題・ページ番号の帯が占めるが、表計算ではその帯もシートの行として
  // 印刷範囲の内側に入るため、余白として持たせず Excel の既定に委ねる。
  sheet['!margins'] = {
    left: REPORT_GRID.tableLeftMm / MM_PER_INCH,
    right: (REPORT_GRID.paper.widthMm - REPORT_GRID.tableLeftMm - TABLE_WIDTH_MM) / MM_PER_INCH,
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, file.fileNameLabel);
  return workbook;
}

// ============================================================================
// ファイル名（32.6）
// ============================================================================

/**
 * ファイル名を組み立てる
 *
 * 「{見積名}_{行タイプのラベル}.xlsx」。ラベルは `ReportFileSpec.fileNameLabel`
 * （「見積」「実行」「業者」）をそのまま用いる。見積名はパス区切りなどを含みうるため
 * 既存の `sanitizeName` で安全化する。
 *
 * Requirements: 10.2, 32.6
 */
export function buildReportWorkbookFileName(estimateName: string, fileNameLabel: string): string {
  return `${sanitizeName(estimateName)}${FILE_NAME_SEPARATOR}${fileNameLabel}${FILE_EXTENSION}`;
}

// ============================================================================
// 公開関数
// ============================================================================

/**
 * 行タイプごとの表計算ファイルを生成する
 *
 * **ダウンロードは行わない**。全ファイルの `Blob` を作り終えてから返すため、
 * 呼び出し側が返り値を配信する限り「途中で失敗したらファイルを1つも配信しない」が成り立つ。
 *
 * Requirements: 10.2, 32.2, 32.3, 32.5, 32.6
 */
export function generate(input: EstimateExcelExportInput): readonly GeneratedReportWorkbook[] {
  try {
    // `buildFiles` は親項目の金額を再計算しない。再計算前のツリーを渡すと、
    // 金額欄が空の親が「値を持たない項目」と判定されて配下ごと帳票から消える
    // （tasks.md Implementation Notes 56.3 の申し送り）。
    const files = buildFiles(recalculateAncestorAmounts(input.tree), input.lineTypes);

    return files.map((file) => {
      const buffer = XLSX.write(buildWorkbook(file), {
        type: 'array',
        bookType: 'xlsx',
      }) as ArrayBuffer;

      return {
        lineType: file.lineType,
        fileName: buildReportWorkbookFileName(input.estimate.name, file.fileNameLabel),
        blob: new Blob([buffer], { type: XLSX_MIME_TYPE }),
      };
    });
  } catch (error) {
    if (error instanceof EstimateExcelExportError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new EstimateExcelExportError(`${EXCEL_EXPORT_FAILURE_MESSAGE_PREFIX}${detail}`, error);
  }
}

/** ダウンロード後に Object URL を解放するまでの猶予（ミリ秒） */
const OBJECT_URL_RELEASE_DELAY_MS = 1000;

/**
 * 生成済みファイルを受け取った順に逐次ダウンロードする
 *
 * zip 化は行わずファイル数分のダウンロードを発生させる（32.3）。
 * `PdfExportService.downloadPdf` と同じ手順だが、同モジュールは
 * `PdfReportService` 経由でフォント資産（約2.25MB）へ静的に到達するため import しない。
 *
 * Requirements: 32.3, 32.6
 */
export function downloadFiles(files: readonly GeneratedReportWorkbook[]): void {
  for (const file of files) {
    const objectUrl = URL.createObjectURL(file.blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file.fileName;
    link.rel = 'noopener';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }, OBJECT_URL_RELEASE_DELAY_MS);
  }
}

/**
 * 表計算ファイルを生成し「見積」「実行」「業者」の順に逐次ダウンロードする
 *
 * `generate` が全ファイルを作り終えてから `downloadFiles` を呼ぶため、
 * 途中で失敗した場合はファイルを1つもダウンロードしない。
 *
 * Requirements: 10.2, 32.2, 32.3, 32.6
 */
export function generateAndDownload(
  input: EstimateExcelExportInput
): readonly GeneratedReportWorkbook[] {
  const files = generate(input);
  downloadFiles(files);
  return files;
}

/** サービスの実体 */
export const estimateExcelExportService: EstimateExcelExportService = {
  generate,
  downloadFiles,
  generateAndDownload,
};
