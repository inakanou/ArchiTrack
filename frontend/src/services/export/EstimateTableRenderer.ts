/**
 * @fileoverview EstimateTableRenderer - 内訳書・明細書1ページの表組みの描画
 *
 * 内訳書（`ReportPage.kind === 'summary'`）と明細書（同 `'detail'`）は**同一の表組み**
 * （52.1）で、表題文字列だけが異なる。本モジュールは1ページ分の `ReportPage` を受け取り、
 * 罫線・見出し行・明細行・合計行・フッタを描画先の doc へ書き出す純粋な描画関数を提供する。
 *
 * **座標の出典**: `.kiro/specs/estimate-creation/pdf-format-reference.md` §4（共通の表組み）、
 * §5（内訳書固有）、§6（明細書固有）。同書の値は参照PDFの論理座標（96dpi px）なので、
 * 同書「座標系の読み方」の `mm = px × 0.264583` で換算した実測値を保持する。
 * 用紙・列幅・行高・線幅・ベースライン位置は 56.1 の `REPORT_GRID` を**再利用**し、
 * 本モジュールでは再定義しない。
 *
 * **表記規則との責務分担**: `ReportRow` の各欄は 56.2 / 56.3 が組み立てた**完成した文字列**
 * であり、本モジュールは列位置・字間・52.13 の打ち切りだけを担う。Requirement 53 の
 * 表記規則（数量の小数揃え・カンマ区切り・`〃`・階層記号）は再実装しない。
 *
 * **描画状態**（56.4 からの申し送り）: `drawCoverPage` は jsPDF のグラフィクス状態
 * （fillColor / lineWidth / drawColor）を戻さずに終了する。本モジュールは罫線を引く前に
 * 描画色を黒へ設定し、線幅は 1本ごとに設定してから引く。
 *
 * 依存方向: `estimateReportLayout` の型と定数のみに依存し、`hooks` / `components` / `pages` /
 * `api` には依存しない（design.md `#### Dependency Direction`）。フォント登録・用紙の向き・
 * ページ送りは出力サービス（56.6）の責務で、本モジュールは行わない。
 *
 * Requirements (estimate-creation):
 * - 32.4: 内訳書・明細書の表題に対象の行タイプを併記する（表題は 56.2 / 56.3 が組み立て済み）
 * - 52.1: 内訳書と明細書に同一の表組みを用いる
 * - 52.2 / 52.3: 7列の各列と各行を罫線で区切る
 * - 52.4: 外枠と見出し行の区切りを内側の罫線より太い線で出力する
 * - 52.5: 1ページの表を見出し行1行・明細行17行・合計行1行で構成する
 * - 52.6: 明細行が17行に満たない場合も残りの行を空行として罫線を出力する
 * - 52.7: 見出し行の各列に列名を出力する
 * - 52.8 / 52.9: 表の上部中央に表題を、上部左にページ番号を出力する
 * - 52.10: 合計行の名称欄に「【合計】」を、金額欄に当該階層の合計を出力する
 * - 52.11 / 52.12: 明細書の先頭行に親項目の階層記号と名称を出力し、子項目を右へずらす
 * - 52.13: 列幅に収まらない文字列を列幅の範囲内で打ち切り紙面外へはみ出させない
 * - 55.5: 注記行の名称を名称欄に出力し他の欄を空欄とする
 * - 50.11: 表の外側下部へ当該階層の親項目名を右寄せで出力する
 *
 * Design: design.md `#### Frontend Export` > `##### EstimatePdfExportService`
 * （`EstimateTableRenderer.ts` = 内訳書・明細書1ページの描画。doc を受け取る純粋な描画関数）
 *
 * @module services/export/EstimateTableRenderer
 */

import { REPORT_FONT_SIZES, REPORT_GRID } from './estimateReportLayout';
import type { ReportColumn, ReportPage, ReportRow } from './estimateReportLayout';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 描画先
 *
 * `jsPDF` が構造的に満たす最小の面だけを宣言する。これにより描画位置を記録する
 * テストダブルで座標を検証でき、かつ 56.6 は `jsPDF` をそのまま渡せる。
 * 単位は mm（56.6 が `unit: 'mm'` で doc を生成する）。
 *
 * `getTextWidth` は 52.13 の打ち切りと、右寄せ・中央揃えの起点計算に用いる。
 * jsPDF の `text` の第4引数（`align` などのオプション）は使わず、位置を本モジュールで
 * 確定させてから左端の座標で描画する（テストが座標を直接検証できるようにするため）。
 */
export interface TablePdfDocument {
  setFontSize(size: number): void;
  setDrawColor(red: number, green: number, blue: number): void;
  setLineWidth(width: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(text: string, x: number, y: number): void;
  getTextWidth(text: string): number;
}

/** 1つの列の左端・右端（mm） */
interface ColumnBox {
  readonly column: ReportColumn;
  readonly leftMm: number;
  readonly rightMm: number;
}

// ============================================================================
// レイアウト定数（pdf-format-reference.md §4 / §5 / §6）
// ============================================================================

/**
 * 表の外側の要素と、セル内の余白（mm）
 *
 * 出典は pdf-format-reference.md §4〜§6。各項目に参照PDFの論理座標（px）を残す。
 * 換算は同書「座標系の読み方」の `mm = px × 0.264583`。
 */
const TABLE_LAYOUT = {
  /** 表題 x=508, y=80 px（§4「表題・ページ番号」） */
  title: { xMm: 134.41, yMm: 21.17 },
  /** ページ番号 x=78, y=85 px（§4） */
  pageNumber: { xMm: 20.64, yMm: 22.49 },
  /**
   * 名称欄の左余白
   *
   * §6 は明細書の見出し行の階層記号を x=80 px に置く。表の左端は 59.8 px なので
   * 余白は 20.2 px = 5.34 mm。§5 の内訳書は同じ位置を「x=67 px ＋ 先頭に半角2スペース」
   * （67 + 2 × 0.5em@10pt = 80.3 px）で作っており、両者は一致する。
   * 56.2 の `ReportRow.name` は先頭の空白を持たないため、字下げは本モジュールが与える。
   */
  namePaddingMm: 5.34,
  /** インデント1段（§6「名称は x=107（見出し行より +27 px インデント）」） */
  indentStepMm: 7.14,
  /** 左揃えの欄の左余白（§6 記入例の規格 x=346 px − 列左端 339.7 px = 6.3 px） */
  leftPaddingMm: 1.67,
  /**
   * 単価・金額欄の右余白
   *
   * §5 の金額 x=874〜888 px と §6 の単価 x=777〜797 px は、いずれも
   * 「列の右端 − 10.4〜10.5 px」に右寄せしたときの値になる（文字幅は 10pt で
   * 半角 0.5em）。両者の中間の 10.47 px = 2.77 mm を採る。
   */
  moneyRightPaddingMm: 2.77,
  /**
   * 数量欄の右余白
   *
   * §5 の数量 x=674 px（`1     `）と §6 の x=661 px（`612     `）から 3.4 px = 0.91 mm。
   * 単価・金額より小さいのは、`formatQuantity` が戻り値の末尾に3字分の右余白を
   * 含めているため（56.1 の「描画側は戻り値を列の右端に右揃えで置く」）。
   */
  quantityRightPaddingMm: 0.91,
  /**
   * 合計行の名称欄の字下げ
   *
   * §5「名称列 x=67 に `        【合  計】`（先頭に半角8スペース）」。
   * 空白は 56.2 の `TOTAL_ROW_LABEL` に含まれないので、
   * 列左端（59.8 px）からの距離 7.2 px ＋ 半角8つ分（8 × 0.5em@10pt = 14.11 mm）= 16.02 mm。
   */
  totalLabelIndentMm: 16.02,
  /** フッタ（親項目名の再掲）のベースライン y=757 px（§6「フッタ」） */
  footerBaselineYMm: 200.29,
  /** フッタの右余白（§6 の x=944〜957 px と右寄せから 6.3 px = 1.67 mm） */
  footerRightPaddingMm: 1.67,
} as const;

/** 罫線の色（§4 の罫線は黒） */
const LINE_COLOR = { red: 0, green: 0, blue: 0 } as const;

// ============================================================================
// 固定文言と字間
// ============================================================================

/** 全角スペース（U+3000） */
const IDEOGRAPHIC_SPACE = '　';

/**
 * 表題の字間（§4「`内  訳  書` / `明  細  書`（全角2スペース区切り）」）
 *
 * 区切り文字は同書の**散文**に従い全角スペースとする。同書の実例のバイトは半角空白だが、
 * 56.1（全角カンマ）と 56.4（表題の字間）がいずれも「散文が権威・実例のバイトは転記産物」と
 * 裁定しており、その先例を踏襲する。
 */
const TITLE_SEPARATOR = IDEOGRAPHIC_SPACE.repeat(2);

/** 行タイプの併記（32.4）の開始文字。表題の字間はこの手前までに適用する */
const LINE_TYPE_SUFFIX_OPEN = '（';

/** ページ番号の見出し（§4「`No.` ＋ `Page.N`」） */
const PAGE_NUMBER_LABEL = 'No.';

/** ページ番号の前置き（§4） */
const PAGE_NUMBER_PREFIX = 'Page.';

/**
 * 見出し行の列名に挿入する全角スペースの数（52.7 / §4「ヘッダ行」）
 *
 * §4 の散文は「全角スペースで字間を空けて列幅いっぱいに配置する」と述べ、実例は
 * `名               称` のように**半角スペース**で字間を作っている。
 * 56.1 / 56.4 の先例に従い**区切り文字は散文の全角スペース**を採り、**個数**は
 * 実例の紙面上の幅を保つよう「半角スペース2つ＝全角スペース1つ」で換算する
 * （切り捨て。名称 15→7 / 規格 9→4 / 単位 0→0 / 数量 2→1 / 単価 3→1 / 金額 4→2 / 備考 4→2）。
 * この換算で実例との幅の差は最大でも半角スペース1つ分に収まる。
 */
const HEADER_LABEL_SPACING: Readonly<Record<ReportColumn['key'], number>> = {
  name: 7,
  spec: 4,
  unit: 0,
  quantity: 1,
  unitPrice: 1,
  amount: 2,
  remarks: 2,
};

// ============================================================================
// グリッドの座標（REPORT_GRID から導出）
// ============================================================================

/** 左から順に各列の左端・右端を求める */
function buildColumnBoxes(): readonly ColumnBox[] {
  const boxes: ColumnBox[] = [];
  let leftMm = REPORT_GRID.tableLeftMm;
  for (const column of REPORT_GRID.columns) {
    boxes.push({ column, leftMm, rightMm: leftMm + column.widthMm });
    leftMm += column.widthMm;
  }
  return boxes;
}

const COLUMN_BOXES = buildColumnBoxes();

/** 表の左端・右端 */
const TABLE_LEFT_MM = REPORT_GRID.tableLeftMm;
const TABLE_RIGHT_MM = COLUMN_BOXES[COLUMN_BOXES.length - 1]!.rightMm;

/**
 * 横罫線の y 座標（mm）
 *
 * `[表の上端, 見出し行の下端, 明細行1〜17の下端…, 合計行の下端]` の 20 本。
 * 52.5 の「見出し行1行・明細行17行・合計行1行」がそのまま行境界の数になる。
 */
function buildRowBoundaries(): readonly number[] {
  const boundaries: number[] = [REPORT_GRID.tableTopMm];
  const headerBottomMm = REPORT_GRID.tableTopMm + REPORT_GRID.headerRowHeightMm;
  boundaries.push(headerBottomMm);
  for (let index = 1; index <= REPORT_GRID.detailRowsPerPage; index += 1) {
    boundaries.push(headerBottomMm + REPORT_GRID.rowHeightMm * index);
  }
  boundaries.push(boundaries[boundaries.length - 1]! + REPORT_GRID.totalRowHeightMm);
  return boundaries;
}

const ROW_BOUNDARIES = buildRowBoundaries();

/** 表の下端 */
const TABLE_BOTTOM_MM = ROW_BOUNDARIES[ROW_BOUNDARIES.length - 1]!;

/** 見出し行の上端の添字 */
const HEADER_ROW_INDEX = 0;

/** 合計行の上端の添字（明細行17行の直後） */
const TOTAL_ROW_BOUNDARY_INDEX = ROW_BOUNDARIES.length - 2;

/** 行の上罫線からベースラインまで（§4「テキストのベースライン」） */
function baselineOf(rowTopMm: number): number {
  return rowTopMm + REPORT_GRID.textBaselineOffsetMm;
}

/** 見出し行のベースライン */
const HEADER_BASELINE_MM = baselineOf(ROW_BOUNDARIES[HEADER_ROW_INDEX]!);

/** 明細行 index（0 起点）のベースライン */
function detailBaselineMm(index: number): number {
  return baselineOf(ROW_BOUNDARIES[index + 1]!);
}

/** 合計行のベースライン */
const TOTAL_BASELINE_MM = baselineOf(ROW_BOUNDARIES[TOTAL_ROW_BOUNDARY_INDEX]!);

// ============================================================================
// 文字列の組み立て
// ============================================================================

/**
 * 表題の字間を空ける（52.8 / 32.4）
 *
 * 行タイプの併記（`（見積）` など。32.4）は 56.2 / 56.3 が `title` に含めている。
 * 字間を空けるのは書類の名称そのもの（`内訳書` / `明細書`）だけで、併記部分は
 * そのまま後ろへ付ける。§4 が字間を記録しているのは名称部分に対してであり、
 * 併記は要件（32.4）が後から加えた注記だからである。
 */
function composeTitle(title: string): string {
  const suffixStart = title.indexOf(LINE_TYPE_SUFFIX_OPEN);
  const base = suffixStart === -1 ? title : title.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : title.slice(suffixStart);
  return `${[...base].join(TITLE_SEPARATOR)}${suffix}`;
}

/**
 * 合計行の名称欄の字間を空ける（52.10）
 *
 * §5 / §6 の実例は `【合  計】`。56.2 の `TOTAL_ROW_LABEL` は論理的な文字列
 * `【合計】` のみを持ち、字間と字下げは描画側の責務としている。
 * 括弧の内側の文字だけを全角スペースで区切る（実例も括弧に接して字間が無い）。
 * 個数は見出し行と同じ「半角2つ＝全角1つ」の換算による1つ。
 */
function spaceOutTotalLabel(label: string): string {
  const characters = [...label];
  if (characters.length < 3) {
    return characters.join(IDEOGRAPHIC_SPACE);
  }
  const first = characters[0]!;
  const last = characters[characters.length - 1]!;
  const inner = characters.slice(1, -1).join(IDEOGRAPHIC_SPACE);
  return `${first}${inner}${last}`;
}

/** 見出し行の列名（52.7） */
function composeHeaderLabel(column: ReportColumn): string {
  const separator = IDEOGRAPHIC_SPACE.repeat(HEADER_LABEL_SPACING[column.key]);
  return [...column.label].join(separator);
}

// ============================================================================
// 描画の基本操作
// ============================================================================

/**
 * 列幅に収まる範囲へ文字列を打ち切る（52.13）
 *
 * 末尾から1文字ずつ落として指定幅に収める。省略記号は付けない
 * （52.13 は「列幅の範囲内で表示を打ち切り」とのみ定めており、追加の記号を規定しない）。
 * サロゲートペアを分割しないよう符号位置単位で扱う。
 *
 * 52.13 が名指しするのは名称・規格・備考だが、**全ての欄に適用**する。
 * 参照PDFの不備（§9 の「備考列に収まらず紙面外へはみ出した」テキスト）を
 * どの列でも再現しないための一律の安全弁であり、収まる文字列は一切変更しない。
 */
function truncateToWidth(doc: TablePdfDocument, text: string, availableMm: number): string {
  if (doc.getTextWidth(text) <= availableMm) {
    return text;
  }
  const characters = [...text];
  while (characters.length > 0 && doc.getTextWidth(characters.join('')) > availableMm) {
    characters.pop();
  }
  return characters.join('');
}

/**
 * 揃えに従って1つの欄を描画する
 *
 * 空文字の欄は描画呼び出しを行わない（55.5 の「他の欄を空欄とする」を、
 * 空文字の描画ではなく**描画しない**ことで表す）。
 */
function drawCell(
  doc: TablePdfDocument,
  options: {
    readonly text: string;
    readonly startMm: number;
    readonly endMm: number;
    readonly align: ReportColumn['align'];
    readonly baselineMm: number;
  }
): void {
  const { text, startMm, endMm, align, baselineMm } = options;

  const availableMm = endMm - startMm;
  // 空欄と、打ち切った結果1文字も残らなかった欄は描画呼び出しを行わない
  const truncated = truncateToWidth(doc, text, availableMm);
  if (truncated === '') {
    return;
  }

  const widthMm = doc.getTextWidth(truncated);
  const xMm =
    align === 'right'
      ? endMm - widthMm
      : align === 'center'
        ? startMm + (availableMm - widthMm) / 2
        : startMm;

  doc.text(truncated, xMm, baselineMm);
}

// ============================================================================
// 罫線（52.3, 52.4, 52.6）
// ============================================================================

/**
 * 表の罫線を引く
 *
 * 縦罫線は列境界8本、横罫線は行境界20本。いずれも**データの件数に依らず固定**なので、
 * 明細行が17行に満たないページでも残りの行が空行として罫線で区切られる（52.6）。
 *
 * 太線にするのは外枠（左右の縦罫線・上下の横罫線）と見出し行の区切り（52.4）。
 * 合計行の上の罫線は 52.4 が挙げる2種のいずれでもないため細線とする。
 */
function drawRules(doc: TablePdfDocument): void {
  doc.setDrawColor(LINE_COLOR.red, LINE_COLOR.green, LINE_COLOR.blue);

  COLUMN_BOXES.forEach((box, index) => {
    const isOuter = index === 0;
    doc.setLineWidth(isOuter ? REPORT_GRID.borderThickMm : REPORT_GRID.borderThinMm);
    doc.line(box.leftMm, REPORT_GRID.tableTopMm, box.leftMm, TABLE_BOTTOM_MM);
    if (index === COLUMN_BOXES.length - 1) {
      doc.setLineWidth(REPORT_GRID.borderThickMm);
      doc.line(box.rightMm, REPORT_GRID.tableTopMm, box.rightMm, TABLE_BOTTOM_MM);
    }
  });

  ROW_BOUNDARIES.forEach((yMm, index) => {
    const isOuter = index === 0 || index === ROW_BOUNDARIES.length - 1;
    const isHeaderSeparator = index === 1;
    doc.setLineWidth(
      isOuter || isHeaderSeparator ? REPORT_GRID.borderThickMm : REPORT_GRID.borderThinMm
    );
    doc.line(TABLE_LEFT_MM, yMm, TABLE_RIGHT_MM, yMm);
  });
}

// ============================================================================
// 表題・ページ番号・見出し行（52.7, 52.8, 52.9, 32.4）
// ============================================================================

function drawTitleAndPageNumber(doc: TablePdfDocument, page: ReportPage): void {
  doc.setFontSize(REPORT_FONT_SIZES.tableTitle);
  doc.text(composeTitle(page.title), TABLE_LAYOUT.title.xMm, TABLE_LAYOUT.title.yMm);

  doc.setFontSize(REPORT_FONT_SIZES.tableBody);
  doc.text(
    `${PAGE_NUMBER_LABEL} ${PAGE_NUMBER_PREFIX}${page.pageNumber}`,
    TABLE_LAYOUT.pageNumber.xMm,
    TABLE_LAYOUT.pageNumber.yMm
  );
}

/** 見出し行の列名を各列の中央へ配置する（52.7 / §4「各列中央」） */
function drawHeaderRow(doc: TablePdfDocument): void {
  doc.setFontSize(REPORT_FONT_SIZES.tableBody);

  for (const box of COLUMN_BOXES) {
    drawCell(doc, {
      text: composeHeaderLabel(box.column),
      startMm: box.leftMm,
      endMm: box.rightMm,
      align: 'center',
      baselineMm: HEADER_BASELINE_MM,
    });
  }
}

// ============================================================================
// 明細行・合計行（52.10〜52.13, 55.5）
// ============================================================================

/** 欄の値を取り出す（`ReportRow` の各欄は 56.2 / 56.3 が組み立てた完成文字列） */
const CELL_VALUE: Readonly<Record<ReportColumn['key'], (row: ReportRow) => string>> = {
  name: (row) => row.name,
  spec: (row) => row.specification,
  unit: (row) => row.unit,
  quantity: (row) => row.quantity,
  unitPrice: (row) => row.unitPrice,
  amount: (row) => row.amount,
  remarks: (row) => row.remarks,
};

/**
 * 名称欄の描画開始位置（52.11, 52.12）
 *
 * 合計行は §5 の字下げ、それ以外は名称欄の左余白にインデント段数分を加える。
 * 明細書の先頭行（親項目の見出し行）は `indentLevel === 0` なので内訳書の行と同じ位置になり、
 * 子項目は1段分（27 px）右へずれる。
 */
function nameStartMm(row: ReportRow, columnLeftMm: number): number {
  if (row.kind === 'total') {
    return columnLeftMm + TABLE_LAYOUT.totalLabelIndentMm;
  }
  return columnLeftMm + TABLE_LAYOUT.namePaddingMm + TABLE_LAYOUT.indentStepMm * row.indentLevel;
}

/** 欄の内側の左端・右端（打ち切りと揃えの基準） */
function innerBoundsMm(
  box: ColumnBox,
  row: ReportRow
): { readonly startMm: number; readonly endMm: number } {
  switch (box.column.key) {
    case 'name':
      return {
        startMm: nameStartMm(row, box.leftMm),
        endMm: box.rightMm - TABLE_LAYOUT.leftPaddingMm,
      };
    case 'quantity':
      return {
        startMm: box.leftMm + TABLE_LAYOUT.leftPaddingMm,
        endMm: box.rightMm - TABLE_LAYOUT.quantityRightPaddingMm,
      };
    case 'unitPrice':
    case 'amount':
      return {
        startMm: box.leftMm + TABLE_LAYOUT.leftPaddingMm,
        endMm: box.rightMm - TABLE_LAYOUT.moneyRightPaddingMm,
      };
    default:
      return {
        startMm: box.leftMm + TABLE_LAYOUT.leftPaddingMm,
        endMm: box.rightMm - TABLE_LAYOUT.leftPaddingMm,
      };
  }
}

/**
 * 1行を描画する
 *
 * 注記行（55.5）は名称以外の欄が空文字なので、`drawCell` が描画呼び出しを行わない。
 * 空欄化そのものは 56.3 が組み立て時に確定させており、本モジュールでは再実装しない。
 */
function drawRow(doc: TablePdfDocument, row: ReportRow, baselineMm: number): void {
  for (const box of COLUMN_BOXES) {
    const raw = CELL_VALUE[box.column.key](row);
    const text = box.column.key === 'name' && row.kind === 'total' ? spaceOutTotalLabel(raw) : raw;
    const { startMm, endMm } = innerBoundsMm(box, row);
    drawCell(doc, { text, startMm, endMm, align: box.column.align, baselineMm });
  }
}

/**
 * 表の外側下部へ親項目名を右寄せで出力する（50.11 / §6「フッタ」）
 *
 * 内訳書は `parentLabel` を持たないので出力しない。
 */
function drawFooter(doc: TablePdfDocument, parentLabel: string): void {
  doc.setFontSize(REPORT_FONT_SIZES.tableBody);
  drawCell(doc, {
    text: parentLabel,
    startMm: TABLE_LEFT_MM,
    endMm: TABLE_RIGHT_MM - TABLE_LAYOUT.footerRightPaddingMm,
    align: 'right',
    baselineMm: TABLE_LAYOUT.footerBaselineYMm,
  });
}

// ============================================================================
// 公開関数
// ============================================================================

/**
 * 内訳書・明細書の1ページを描画する
 *
 * 描画対象は `page` で受け取り、本関数は取得も計算も行わない。罫線は行数に依らず
 * 固定のグリッドとして引くため、明細行が17行に満たないページでも残りは空行として
 * 罫線が引かれる（52.6）。合計行を持たない継続ページ（50.10）は最下段が空行になる。
 *
 * `page` に表紙、または1ページの上限（17行）を超える明細行を渡した場合は `RangeError` を
 * 送出する。前者を黙って描画すると表紙が表組みで上書きされ、後者を黙って描画すると
 * 18行目以降が表の外へこぼれるため（56.1 の `levelSymbol` / 56.4 の `drawCoverPage` と
 * 同じ防御的重複）。
 *
 * Requirements: 32.4, 50.11, 52.1〜52.13, 55.5
 */
export function drawTablePage(doc: TablePdfDocument, page: ReportPage): void {
  if (page.kind !== 'summary' && page.kind !== 'detail') {
    throw new RangeError(
      `drawTablePage: 内訳書・明細書以外は描画できません: kind=${page.kind}（52.1）`
    );
  }
  if (page.rows.length > REPORT_GRID.detailRowsPerPage) {
    throw new RangeError(
      `drawTablePage: 1ページの明細行は ${REPORT_GRID.detailRowsPerPage} 行までです: ${page.rows.length} 行（52.5）`
    );
  }

  drawRules(doc);
  drawTitleAndPageNumber(doc, page);
  drawHeaderRow(doc);

  doc.setFontSize(REPORT_FONT_SIZES.tableBody);
  page.rows.forEach((row, index) => {
    drawRow(doc, row, detailBaselineMm(index));
  });

  if (page.totalRow !== null) {
    doc.setFontSize(REPORT_FONT_SIZES.tableBody);
    drawRow(doc, page.totalRow, TOTAL_BASELINE_MM);
  }

  if (page.parentLabel !== null) {
    drawFooter(doc, page.parentLabel);
  }
}
