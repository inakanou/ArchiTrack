/**
 * @fileoverview EstimateTableRenderer の単体テスト（Task 56.5）
 *
 * **座標の検証方針（56.4 の踏襲）**: 期待値は実装の定数を読み戻さず、
 * `.kiro/specs/estimate-creation/pdf-format-reference.md` §4〜§6 に記録された
 * **参照PDFの論理座標（96dpi px）** を本ファイル内に直接書き、
 * 同 §「座標系の読み方」の換算係数 `px × 0.264583` で mm へ変換して突き合わせる。
 * したがって実装が定数を書き換えれば必ず落ちる。
 *
 * **文字幅**: jsPDF の `getTextWidth` はフォント登録後にしか意味を持たないため、
 * 本テストは記録用 doc に「ASCII は 0.5em / それ以外（CJK・全角形）は 1em」という
 * 決定的な計量を持たせる。参照PDF の記入例（§4 の見出し字間、§5/§6 の数量・単価・金額の x）は
 * いずれもこの計量で再現できることを各テストで確認している。
 *
 * Requirements: 32.4, 52.1〜52.13, 55.5
 */

import { describe, expect, it } from 'vitest';

import { drawTablePage, type TablePdfDocument } from './EstimateTableRenderer';
// `TOTAL_ROW_LABEL` は 56.2 が定めた契約（合計行の論理的な名称）なので、
// 描画側がそれを受け取って字間と字下げを与えることの検証にそのまま用いる。
// 一方、寸法（列幅・行高・線幅）は実装が使う定数を読み戻さず §4〜§6 の実測値で照合する。
import { TOTAL_ROW_LABEL, type ReportPage, type ReportRow } from './estimateReportLayout';

import type { jsPDF } from 'jspdf';

// ============================================================================
// 参照座標（pdf-format-reference.md §4〜§6）と換算
// ============================================================================

/** px → mm（pdf-format-reference.md「座標系の読み方」） */
const MM_PER_PX = 0.264583;
function mm(px: number): number {
  return px * MM_PER_PX;
}

/** pt → mm（1pt = 25.4/72 mm） */
const MM_PER_PT = 25.4 / 72;

/** 縦罫線（列境界）の実測 px（§4「縦罫線（列境界）」） */
const COLUMN_BOUNDARY_PX = [59.8, 339.7, 547.5, 608.0, 717.6, 827.4, 944.5, 1063.4] as const;

/**
 * 横罫線（行境界）の実測 px（§4「横罫線（行境界）」）
 *
 * 同書が列挙する 21 個のうち先頭の `83.0` は「表題領域」の上端であり、
 * 7列の表のセル境界ではない（同書の区分表で高さが `—`、列の割り当ても無い）ため
 * 本テストの表組みの期待値には含めない（実装側の裁定と同じ根拠）。
 */
const ROW_BOUNDARY_PX = [
  94.6, 128.5, 162.4, 196.5, 230.6, 264.5, 298.6, 332.5, 366.6, 400.6, 434.6, 468.6, 502.6, 536.6,
  570.7, 604.6, 638.7, 672.8, 706.7, 739.8,
] as const;

/** 線幅（§4「線幅は 0.8 px（内側罫線）と 1.76 px（外枠・見出し区切り）の2種」） */
const THIN_LINE_PX = 0.8;
const THICK_LINE_PX = 1.76;

/** 各行のテキストのベースラインは上罫線から +21.5 px（§4「テキストのベースライン」） */
const BASELINE_OFFSET_PX = 21.5;

/**
 * 列境界の許容差（mm）
 *
 * §4 の px 実測値と REPORT_GRID（56.1）の mm 値は 0.01mm 以内で一致するため 0.02mm を上限とする。
 */
const COLUMN_TOLERANCE_MM = 0.02;

/**
 * 行境界の許容差（mm）
 *
 * §4 は明細行のピッチを「34.0 px（9.0 mm）」と定めるが、同書が列挙する各行の実測値は
 * その等ピッチ模型から最大 0.3 px（= 0.079 mm）ずれる（測定誤差）。
 * 等ピッチで組む実装と実測値の双方を許容する 0.09 mm を上限とする。
 */
const ROW_TOLERANCE_MM = 0.09;

/** 文字幅を伴う位置（数量・金額など）の許容差（mm）。§5/§6 の x は 1px 単位の丸め値 */
const TEXT_TOLERANCE_MM = 0.2;

/** 1ページの明細行数（52.5 / §4「明細行 × 17」）。実装の定数は読み戻さない */
const DETAIL_ROWS_PER_PAGE = 17;

/** 用紙の幅（§1「A4 横 … 297 × 210 mm」） */
const PAPER_WIDTH_MM = 297;

/**
 * 欄の内側の余白（px）
 *
 * §6「明細行の記入例」の規格 x=346 px と、規格列の左端 339.7 px（§4）の差。
 * 左揃えの欄の左余白と、打ち切り時の右余白に共通で用いられる。
 */
const CELL_PADDING_PX = 6.3;

/** 名称欄の先頭位置（§6 明細書の見出し行の階層記号 x=80 px） */
const NAME_ORIGIN_PX = 80;

/** インデント1段（§6「名称は x=107（見出し行より +27 px インデント）」） */
const INDENT_STEP_PX = 27;

/**
 * 打ち切りの基準となる各欄の内寸（mm）
 *
 * すべて §4 の列境界と §6 の記入例から導出する（実装の余白定数は読み戻さない）。
 * 名称欄はインデント0段の値。
 */
const NAME_INNER_MM = mm(COLUMN_BOUNDARY_PX[1] - CELL_PADDING_PX - NAME_ORIGIN_PX);
const SPEC_INNER_MM = mm(
  COLUMN_BOUNDARY_PX[2] - CELL_PADDING_PX - (COLUMN_BOUNDARY_PX[1] + CELL_PADDING_PX)
);
const REMARKS_INNER_MM = mm(
  COLUMN_BOUNDARY_PX[7] - CELL_PADDING_PX - (COLUMN_BOUNDARY_PX[6] + CELL_PADDING_PX)
);

// ============================================================================
// 描画呼び出しの記録
// ============================================================================

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  /** 本テストの計量による描画幅（mm） */
  readonly widthMm: number;
}

interface LineCall {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly lineWidth: number | null;
  readonly drawColor: readonly [number, number, number] | null;
}

/**
 * ASCII と半角カナ（U+FF61〜U+FF9F）は半角（0.5em）、それ以外（CJK・全角形）は全角（1em）
 *
 * 参照PDFの記入例は半角カナ（`ｸｻﾋﾞ緊結式` など）を含むので、日本語フォントの実寸に
 * 合わせて半角として数える。
 */
function isFullWidth(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 0x80) {
    return false;
  }
  return !(codePoint >= 0xff61 && codePoint <= 0xff9f);
}

function measureMm(text: string, fontSizePt: number): number {
  return [...text].reduce(
    (total, character) =>
      total + (isFullWidth(character) ? fontSizePt : fontSizePt / 2) * MM_PER_PT,
    0
  );
}

class RecordingDocument implements TablePdfDocument {
  readonly texts: TextCall[] = [];
  readonly lines: LineCall[] = [];

  private fontSize = Number.NaN;
  private drawColor: readonly [number, number, number] | null = null;
  private lineWidth: number | null = null;

  setFontSize(size: number): void {
    this.fontSize = size;
  }

  setDrawColor(red: number, green: number, blue: number): void {
    this.drawColor = [red, green, blue];
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
  }

  getTextWidth(text: string): number {
    return measureMm(text, this.fontSize);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    this.lines.push({ x1, y1, x2, y2, lineWidth: this.lineWidth, drawColor: this.drawColor });
  }

  text(text: string, x: number, y: number): void {
    this.texts.push({
      text,
      x,
      y,
      fontSize: this.fontSize,
      widthMm: measureMm(text, this.fontSize),
    });
  }
}

/**
 * 型レベルの適合性検査
 *
 * 56.6 は本レンダラへ `jsPDF` インスタンスをそのまま渡す。構造的に満たさなくなったら
 * `npm run type-check` が落ちる（実行時の jsPDF 生成は行わない）。
 */
type JsPdfSatisfiesTableDocument = jsPDF extends TablePdfDocument ? true : never;
const JS_PDF_SATISFIES_TABLE_DOCUMENT: JsPdfSatisfiesTableDocument = true;

// ============================================================================
// フィクスチャ
// ============================================================================

function itemRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    kind: 'item',
    name: '',
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount: '',
    remarks: '',
    indentLevel: 0,
    ...overrides,
  };
}

function totalRow(amount: string): ReportRow {
  return {
    kind: 'total',
    name: TOTAL_ROW_LABEL,
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount,
    remarks: '',
    indentLevel: 0,
  };
}

/**
 * 列幅に収まらない文字列（52.13 の前提）
 *
 * 52.13 は否定側の要件（「紙面外へはみ出させない」）なので、はみ出しうる文字列を
 * 持たないフィクスチャでは無条件に真になる。名称 74.06mm / 規格 54.98mm /
 * 備考 31.46mm の各列幅を確実に超える長さにしてある（下の専用テストで実測を固定）。
 */
const OVERFLOWING_NAME =
  'Ｃ.外壁改修に伴う仮設足場の組立および解体ならびに養生シートの全面張りと撤去の一式工事';
const OVERFLOWING_SPEC = '機械的固定工法 立上部 ﾊﾟﾗﾍﾟｯﾄ下部まで 塩ﾋﾞｼｰﾄ t=1.5mm 熱風融着';
const OVERFLOWING_REMARKS = '別途工事分の仮設材を流用する場合は事前協議のうえ数量を再査定すること';

/**
 * 幅を指定して組み立てる文字列（全角 `fullWidthCount` 文字 ＋ 半角 `halfWidthCount` 文字）
 *
 * 10pt では全角 1em = 3.5278mm、半角 0.5em = 1.7639mm なので、
 * 内寸に対する比率を意図した値へ正確に合わせられる。
 */
function sizedText(filler: string, fullWidthCount: number, halfWidthCount: number): string {
  return filler.repeat(fullWidthCount) + '0'.repeat(halfWidthCount);
}

/**
 * 打ち切りの**境界の直上・直下**に立つ文字列（52.13）
 *
 * 上の `OVERFLOWING_*` は内寸の 2.1〜4.3 倍あるため、閾値を 1.4 倍まで水増ししても
 * 打ち切りが起きて検証を素通りする。そこで内寸の 1.00〜1.03 倍（直上）と
 * 0.94〜0.96 倍（直下）の文字列を別に用意し、閾値そのものを固定する。
 *
 * - 名称: 内寸 67.05mm。直上 = 全角19＋半角1 = 68.79mm（1.026倍）／直下 = 全角18 = 63.50mm（0.947倍）
 * - 規格: 内寸 51.65mm。直上 = 全角15 = 52.92mm（1.025倍）／直下 = 全角13＋半角2 = 49.39mm（0.956倍）
 * - 備考: 内寸 28.13mm。直上 = 全角8 = 28.22mm（1.003倍）／直下 = 全角7＋半角1 = 26.46mm（0.941倍）
 */
const NAME_JUST_OVER = sizedText('名', 19, 1);
const NAME_JUST_UNDER = sizedText('称', 18, 0);
const SPEC_JUST_OVER = sizedText('規', 15, 0);
const SPEC_JUST_UNDER = sizedText('格', 13, 2);
const REMARKS_JUST_OVER = sizedText('備', 8, 0);
const REMARKS_JUST_UNDER = sizedText('考', 7, 1);

/** 内訳書ページ（§5 の実例に対応） */
function summaryPage(overrides: Partial<ReportPage> = {}): ReportPage {
  return {
    kind: 'summary',
    lineType: 'ESTIMATE',
    pageNumber: 2,
    title: '内訳書（見積）',
    parentLabel: null,
    rows: [
      itemRow({ name: 'Ａ.共通仮設工事', unit: '式', quantity: '1     ', amount: '486,304' }),
      itemRow({ kind: 'discount', name: '【値引】', amount: '-48,585' }),
      itemRow({
        name: OVERFLOWING_NAME,
        specification: OVERFLOWING_SPEC,
        remarks: OVERFLOWING_REMARKS,
        unit: '〃',
        quantity: '612     ',
        unitPrice: '592',
        amount: '2,726,170',
      }),
    ],
    // §5 の金額列 x=874〜888px は「右端 934px への右寄せ」に対応する。
    // 下限 874px を再現できるよう、最も広い 9 文字の金額を置く。
    totalRow: totalRow('9,420,000'),
    ...overrides,
  };
}

/**
 * 明細書ページ（§6 の実例に対応）
 *
 * 先頭行が親項目の見出し行（52.11）、以降が子項目（52.12 のインデント）。
 * 注記行は**単位・数量・金額を持つ行の間**に挟む（§6:193 が示す配置）。55.5 の
 * 「名称欄のみ」を検証する節が空振りしないよう、前後の行は他の欄を必ず持つ。
 */
function detailPage(overrides: Partial<ReportPage> = {}): ReportPage {
  return {
    kind: 'detail',
    lineType: 'EXECUTION',
    pageNumber: 3,
    title: '明細書（実行）',
    parentLabel: 'Ａ.共通仮設工事',
    rows: [
      itemRow({ name: 'Ａ.共通仮設工事', indentLevel: 0 }),
      itemRow({
        name: '保安要員',
        specification: '仮設足場組立・解体時',
        unit: '人工',
        quantity: '10     ',
        unitPrice: '17,500',
        amount: '175,000',
        indentLevel: 1,
      }),
      itemRow({
        kind: 'note',
        // 名称欄（インデント1段で 59.9mm）に収まる長さ。打ち切りは 52.13 の節で別に検証する
        name: '※電力100V・水道水は無償支給',
        indentLevel: 1,
      }),
      itemRow({
        name: '外部足場',
        specification: 'ｸｻﾋﾞ緊結式',
        unit: '〃',
        quantity: '612     ',
        unitPrice: '592',
        amount: '362,304',
        indentLevel: 1,
      }),
    ],
    totalRow: totalRow('537,304'),
    ...overrides,
  };
}

/**
 * 打ち切りの境界を観測するためのページ（52.13）
 *
 * 1行目に内寸の直上、2行目に内寸の直下の文字列を置く。いずれもインデント0段。
 */
function boundaryPage(overrides: Partial<ReportPage> = {}): ReportPage {
  return {
    kind: 'summary',
    lineType: 'ESTIMATE',
    pageNumber: 2,
    title: '内訳書（見積）',
    parentLabel: null,
    rows: [
      itemRow({
        name: NAME_JUST_OVER,
        specification: SPEC_JUST_OVER,
        remarks: REMARKS_JUST_OVER,
      }),
      itemRow({
        name: NAME_JUST_UNDER,
        specification: SPEC_JUST_UNDER,
        remarks: REMARKS_JUST_UNDER,
      }),
    ],
    totalRow: null,
    ...overrides,
  };
}

function render(page: ReportPage): RecordingDocument {
  const doc = new RecordingDocument();
  drawTablePage(doc, page);
  return doc;
}

/**
 * 52.1「内訳書と明細書に**同一の表組み**を用いる」の検証対象
 *
 * 罫線・空行・見出し行・ページ番号は表題以外に差が無いはずなので、
 * 両方のページ種に対して同じ検証を回す。片方だけで確認すると、
 * 明細書ページで表組みを描かなくなる退行が緑のまま通り抜ける。
 */
const TABLE_PAGES = [
  { label: '内訳書', build: summaryPage, filledRowCount: 3 },
  { label: '明細書', build: detailPage, filledRowCount: 4 },
] as const;

// ============================================================================
// 照合ヘルパ
// ============================================================================

function expectMmValue(
  actualMm: number,
  expectedMm: number,
  toleranceMm: number,
  label: string
): void {
  expect(
    Math.abs(actualMm - expectedMm),
    `${label}: 期待 ${expectedMm.toFixed(3)}mm / 実際 ${actualMm.toFixed(3)}mm`
  ).toBeLessThanOrEqual(toleranceMm);
}

function expectMm(actualMm: number, expectedPx: number, toleranceMm: number, label: string): void {
  expectMmValue(actualMm, mm(expectedPx), toleranceMm, `${label}（${expectedPx}px）`);
}

function verticalLines(doc: RecordingDocument): readonly LineCall[] {
  return doc.lines.filter((call) => Math.abs(call.x1 - call.x2) < 1e-6);
}

function horizontalLines(doc: RecordingDocument): readonly LineCall[] {
  return doc.lines.filter((call) => Math.abs(call.y1 - call.y2) < 1e-6);
}

/** ベースライン y（px）に置かれた描画を左から順に返す */
function textsOnBaseline(doc: RecordingDocument, baselinePx: number): readonly TextCall[] {
  return doc.texts
    .filter((call) => Math.abs(call.y - mm(baselinePx)) <= ROW_TOLERANCE_MM)
    .slice()
    .sort((left, right) => left.x - right.x);
}

/** 明細行 index（0 起点）のベースライン px */
function detailBaselinePx(index: number): number {
  return ROW_BOUNDARY_PX[index + 1]! + BASELINE_OFFSET_PX;
}

/** 合計行のベースライン px（§5「合計行（y=728）」と一致する） */
const TOTAL_BASELINE_PX = ROW_BOUNDARY_PX[18]! + BASELINE_OFFSET_PX;

/** 見出し行のベースライン px（§4「ヘッダ行（y=116…）」） */
const HEADER_BASELINE_PX = 116;

function textOf(doc: RecordingDocument, value: string): TextCall {
  const matched = doc.texts.filter((call) => call.text === value);
  expect(
    matched,
    `描画された文字列 ${JSON.stringify(value)} が1件であること（実際: ${matched.length}件 / 全描画: ${JSON.stringify(doc.texts.map((call) => call.text))}）`
  ).toHaveLength(1);
  return matched[0]!;
}

// ============================================================================
// 型レベル検査の参照
// ============================================================================

describe('jsPDF との適合性', () => {
  it('jsPDF が TablePdfDocument を構造的に満たす', () => {
    expect(JS_PDF_SATISFIES_TABLE_DOCUMENT).toBe(true);
  });
});

// ============================================================================
// 52.3 / 52.4: 罫線
// ============================================================================

describe.each(TABLE_PAGES)('罫線（52.3, 52.4, 52.1）— $label', ({ build }) => {
  it('7列を区切る縦罫線8本を参照座標へ表の上端から下端まで引く', () => {
    const doc = render(build());
    const verticals = verticalLines(doc);

    expect(verticals).toHaveLength(COLUMN_BOUNDARY_PX.length);
    COLUMN_BOUNDARY_PX.forEach((boundaryPx, index) => {
      const call = verticals[index]!;
      expectMm(call.x1, boundaryPx, COLUMN_TOLERANCE_MM, `縦罫線[${index}] x1`);
      expectMm(call.x2, boundaryPx, COLUMN_TOLERANCE_MM, `縦罫線[${index}] x2`);
      // 端点だけでなく span 全体（上端・下端）を固定する
      expectMm(call.y1, ROW_BOUNDARY_PX[0]!, ROW_TOLERANCE_MM, `縦罫線[${index}] 上端`);
      expectMm(call.y2, ROW_BOUNDARY_PX[19]!, ROW_TOLERANCE_MM, `縦罫線[${index}] 下端`);
    });
  });

  it('見出し行1行・明細行17行・合計行1行を区切る横罫線20本を参照座標へ表の左端から右端まで引く', () => {
    const doc = render(build());
    const horizontals = horizontalLines(doc);

    expect(horizontals).toHaveLength(ROW_BOUNDARY_PX.length);
    ROW_BOUNDARY_PX.forEach((boundaryPx, index) => {
      const call = horizontals[index]!;
      expectMm(call.y1, boundaryPx, ROW_TOLERANCE_MM, `横罫線[${index}] y1`);
      expectMm(call.y2, boundaryPx, ROW_TOLERANCE_MM, `横罫線[${index}] y2`);
      expectMm(call.x1, COLUMN_BOUNDARY_PX[0]!, COLUMN_TOLERANCE_MM, `横罫線[${index}] 左端`);
      expectMm(call.x2, COLUMN_BOUNDARY_PX[7]!, COLUMN_TOLERANCE_MM, `横罫線[${index}] 右端`);
    });
  });

  it('外枠（左右の縦罫線・上下の横罫線）と見出し行の区切りのみを太線とし、内側は細線とする', () => {
    const doc = render(build());
    const verticals = verticalLines(doc);
    const horizontals = horizontalLines(doc);

    verticals.forEach((call, index) => {
      const isOuter = index === 0 || index === verticals.length - 1;
      expectMm(
        call.lineWidth!,
        isOuter ? THICK_LINE_PX : THIN_LINE_PX,
        COLUMN_TOLERANCE_MM,
        `縦罫線[${index}] 線幅`
      );
    });

    const thickHorizontalIndexes = new Set([0, 1, horizontals.length - 1]);
    horizontals.forEach((call, index) => {
      expectMm(
        call.lineWidth!,
        thickHorizontalIndexes.has(index) ? THICK_LINE_PX : THIN_LINE_PX,
        COLUMN_TOLERANCE_MM,
        `横罫線[${index}] 線幅`
      );
    });

    // 太線・細線がいずれも実在すること（片方だけなら「内側より太い」の比較が成立しない）
    const threshold = (mm(THIN_LINE_PX) + mm(THICK_LINE_PX)) / 2;
    expect(horizontals.filter((call) => call.lineWidth! > threshold)).toHaveLength(3);
    expect(horizontals.filter((call) => call.lineWidth! < threshold)).toHaveLength(17);
    expect(verticals.filter((call) => call.lineWidth! > threshold)).toHaveLength(2);
    expect(verticals.filter((call) => call.lineWidth! < threshold)).toHaveLength(6);
  });

  it('表紙が残した描画状態に依らず罫線を黒・自前の線幅で引く（56.4 からの申し送り）', () => {
    const doc = new RecordingDocument();
    // 56.4 の drawCoverPage はグラフィクス状態（fillColor / lineWidth / drawColor）を戻さない
    doc.setDrawColor(192, 192, 192);
    doc.setLineWidth(9.99);

    drawTablePage(doc, build());

    expect(doc.lines.length).toBeGreaterThan(0);
    doc.lines.forEach((call, index) => {
      expect(call.drawColor, `罫線[${index}] の色`).toEqual([0, 0, 0]);
      expect(call.lineWidth, `罫線[${index}] の線幅`).not.toBe(9.99);
    });
  });
});

// ============================================================================
// 52.5 / 52.6: 固定グリッドと空行
// ============================================================================

describe.each(TABLE_PAGES)(
  '固定グリッドと空行（52.5, 52.6, 52.1）— $label',
  ({ build, filledRowCount }) => {
    it('明細行が17行に満たなくても残りの行の罫線を引く', () => {
      const doc = render(build());

      expect(filledRowCount).toBeLessThan(DETAIL_ROWS_PER_PAGE);
      expect(horizontalLines(doc)).toHaveLength(ROW_BOUNDARY_PX.length);
      expect(verticalLines(doc)).toHaveLength(COLUMN_BOUNDARY_PX.length);
    });

    it('明細行が17行に満たない場合、残りの行には文字を描画しない', () => {
      const doc = render(build());

      for (let index = filledRowCount; index < DETAIL_ROWS_PER_PAGE; index += 1) {
        expect(
          textsOnBaseline(doc, detailBaselinePx(index)).map((call) => call.text),
          `空行 ${index} 行目`
        ).toEqual([]);
      }
    });

    it('合計行を持たない継続ページでは最下段を空行とし、罫線は最終行まで引く', () => {
      const doc = render(build({ totalRow: null }));

      expect(horizontalLines(doc)).toHaveLength(ROW_BOUNDARY_PX.length);
      expect(textsOnBaseline(doc, TOTAL_BASELINE_PX)).toEqual([]);
    });
  }
);

// ============================================================================
// 52.8 / 52.9 / 32.4: 表題とページ番号
// ============================================================================

describe.each(TABLE_PAGES)('表題とページ番号（52.8, 52.9, 52.1）— $label', ({ build }) => {
  it('表題を参照座標に16ptで配置する', () => {
    const doc = render(build());
    const title = doc.texts.find((call) => call.fontSize === 16);

    expect(title, '16pt の表題が描画されること').toBeDefined();
    expectMm(title!.x, 508, COLUMN_TOLERANCE_MM, '表題 x');
    expectMm(title!.y, 80, ROW_TOLERANCE_MM, '表題 y');
  });

  it('ページ番号を表の上部左へ10ptで配置する', () => {
    const doc = render(build({ pageNumber: 4 }));
    const pageNumber = doc.texts.find((call) => call.text.includes('Page.'));

    expect(pageNumber, 'ページ番号が描画されること').toBeDefined();
    expect(pageNumber!.text).toBe('No. Page.4');
    expect(pageNumber!.fontSize).toBe(10);
    expectMm(pageNumber!.x, 78, COLUMN_TOLERANCE_MM, 'ページ番号 x');
    expectMm(pageNumber!.y, 85, ROW_TOLERANCE_MM, 'ページ番号 y');
  });
});

/**
 * 内訳書・明細書の表題に対象の行タイプを併記する（例：内訳書（実行））
 *
 * かつては見積E2E（`estimate-features-e2e.spec.ts`）の
 * 「出力APIがlineTypesクエリパラメータを受け付ける」がこの受入基準のタグを
 * 持っていたが、出力エンドポイントの撤去（Task 56.10）で当該テストごと消えた。
 * 実体を検証しているのは以下の表題アサーションなので、機械認識可能なタグを
 * ここへ移した（併記の組み立て側は
 * `estimateReportLayout.detailPages.test.ts` / `.buildFiles.test.ts` が担う）。
 *
 * @requirement estimate-creation/REQ-32.4
 */
describe('表題の字間と行タイプの併記（32.4）', () => {
  it('内訳書の表題の字間を全角スペースで空け、行タイプを併記する（§4 / 32.4）', () => {
    const doc = render(summaryPage());
    const title = doc.texts.find((call) => call.fontSize === 16)!;

    expect(title.text).toBe('内　　訳　　書（見積）');
  });

  it('明細書の表題の字間を全角スペースで空け、行タイプを併記する（§4 / 32.4）', () => {
    const doc = render(detailPage());
    const title = doc.texts.find((call) => call.fontSize === 16)!;

    expect(title.text).toBe('明　　細　　書（実行）');
  });
});

// ============================================================================
// 52.7: 見出し行
// ============================================================================

/** §4「ヘッダ行」の実例（列名・実測 x px・例に現れる半角スペース数） */
const HEADER_REFERENCE = [
  { label: '名称', xPx: 136, halfSpaces: 15 },
  { label: '規格', xPx: 400, halfSpaces: 9 },
  { label: '単位', xPx: 565, halfSpaces: 0 },
  { label: '数量', xPx: 641, halfSpaces: 2 },
  { label: '単価', xPx: 747, halfSpaces: 3 },
  { label: '金額', xPx: 857, halfSpaces: 4 },
  { label: '備考', xPx: 976, halfSpaces: 4 },
] as const;

function referenceHeaderText(index: number): string {
  const reference = HEADER_REFERENCE[index]!;
  return `${reference.label[0]}${' '.repeat(reference.halfSpaces)}${reference.label[1]}`;
}

/**
 * 期待する列名の文字列（52.7）
 *
 * §4 の実例の半角スペース数を「半角2つ＝全角1つ」で切り捨て換算した個数の
 * U+3000 を字間に置く（15→7 / 9→4 / 0→0 / 2→1 / 3→1 / 4→2 / 4→2）。
 * 幅の許容差だけでは切り上げ（8個）と切り捨て（7個）が等距離で通ってしまうため、
 * 文字列そのものを固定する。
 */
const EXPECTED_HEADER_TEXTS = [
  '名　　　　　　　称',
  '規　　　　格',
  '単位',
  '数　量',
  '単　価',
  '金　　額',
  '備　　考',
] as const;

describe.each(TABLE_PAGES)('見出し行（52.7, 52.1）— $label', ({ build }) => {
  function headerTexts(doc: RecordingDocument): readonly TextCall[] {
    return textsOnBaseline(doc, HEADER_BASELINE_PX);
  }

  it('7列の列名を §4 の字間どおりの文字列で描画する', () => {
    const doc = render(build());
    const headers = headerTexts(doc);

    expect(headers.map((call) => call.text)).toEqual([...EXPECTED_HEADER_TEXTS]);
    // 期待値そのものが「全角スペース×N で挟んだ列名」であることを独立に確認する
    EXPECTED_HEADER_TEXTS.forEach((text, index) => {
      const reference = HEADER_REFERENCE[index]!;
      const separatorCount = [...text].filter((character) => character === '　').length;
      expect(separatorCount, `列名 ${index} の全角スペース数`).toBe(
        Math.floor(reference.halfSpaces / 2)
      );
    });
  });

  it('7列の列名を見出し行のベースラインへ10ptで左から順に配置する', () => {
    const doc = render(build());
    const headers = headerTexts(doc);

    expect(headers).toHaveLength(HEADER_REFERENCE.length);
    headers.forEach((call, index) => {
      expect(call.fontSize).toBe(10);
      const characters = [...call.text].filter((character) => character !== '　');
      expect(characters.join(''), `列名 ${index}`).toBe(HEADER_REFERENCE[index]!.label);
    });
  });

  it('列名の字間を全角スペースで空ける（§4「全角スペースで字間を空けて」）', () => {
    const doc = render(build());
    const headers = headerTexts(doc);

    // 半角スペースは使わない（56.1 / 56.4 が採った「散文が権威」の裁定を踏襲）
    headers.forEach((call, index) => {
      expect(call.text.includes(' '), `列名 ${index} に半角スペース`).toBe(false);
    });
    // 実例が字間を持つ6列は全角スペースを含む（`単位` のみ字間なし）
    expect(headers.filter((call) => call.text.includes('　'))).toHaveLength(6);
  });

  it('列名の描画幅を §4 の実例の幅へ揃える（全角スペース1つ＝半角スペース2つ分）', () => {
    const doc = render(build());
    const headers = headerTexts(doc);

    expect(headers).toHaveLength(HEADER_REFERENCE.length);
    headers.forEach((call, index) => {
      const referenceWidth = measureMm(referenceHeaderText(index), 10);
      // 半角スペース奇数個は全角スペースへ丸める際に最大1つ分（0.5em @10pt）の差が出る
      expectMmValue(
        call.widthMm,
        referenceWidth,
        5 * MM_PER_PT + 1e-9,
        `列名 ${index} の幅（実例 ${JSON.stringify(referenceHeaderText(index))}）`
      );
    });
  });

  it('列名を各列の中央へ配置する（§4「各列中央」）', () => {
    const doc = render(build());
    const headers = headerTexts(doc);

    expect(headers).toHaveLength(HEADER_REFERENCE.length);
    headers.forEach((call, index) => {
      const columnCenterPx = (COLUMN_BOUNDARY_PX[index]! + COLUMN_BOUNDARY_PX[index + 1]!) / 2;
      expectMm(
        call.x + call.widthMm / 2,
        columnCenterPx,
        COLUMN_TOLERANCE_MM,
        `列名 ${index} の中心`
      );

      // 参照PDFの実例も同じ中心に来る（列境界と「各列中央」の独立検証）
      const referenceCenterMm =
        mm(HEADER_REFERENCE[index]!.xPx) + measureMm(referenceHeaderText(index), 10) / 2;
      expectMm(referenceCenterMm, columnCenterPx, 0.7, `実例 ${index} の中心`);
    });
  });
});

// ============================================================================
// 明細行の列位置（§5 / §6）
// ============================================================================

describe('明細行の列位置', () => {
  /** 10pt の半角スペース1つ分（mm） */
  const HALF_SPACE_MM = 5 * MM_PER_PT;

  it('内訳書の1行目を §5 の実例と同じ位置へ配置する', () => {
    const doc = render(summaryPage());

    // 名称: §5 の実例は `  Ａ.共通仮設工事`（先頭に半角2スペース）を x=67px に置く。
    // 字下げは描画側の責務（56.2 の `name` は空白を持たない）なので、
    // 記号 `Ａ` の左端 = 67px + 半角2つ分 が期待位置になる。
    const name = textOf(doc, 'Ａ.共通仮設工事');
    // §5 由来の 80.33px と §6 由来の 80px は 0.33px（0.09mm）ずれる（同書の測定誤差）
    expectMmValue(name.x, mm(67) + 2 * HALF_SPACE_MM, 0.1, '名称 x');
    expectMm(name.y, detailBaselinePx(0), ROW_TOLERANCE_MM, '名称 y');
    expect(name.fontSize).toBe(10);

    // 単位: §5 x=571 相当（列中央）
    const unit = textOf(doc, '式');
    const unitCenterPx = (COLUMN_BOUNDARY_PX[2]! + COLUMN_BOUNDARY_PX[3]!) / 2;
    expectMm(unit.x + unit.widthMm / 2, unitCenterPx, COLUMN_TOLERANCE_MM, '単位の中心');

    // 数量: §5 x=674（`1     ` は formatQuantity の右余白3字を含む6文字）
    expectMm(textOf(doc, '1     ').x, 674, TEXT_TOLERANCE_MM, '数量 x');

    // 金額: §5 x=874〜888。7桁の `486,304` は右寄せの結果 888 側になる
    expectMm(textOf(doc, '486,304').x, 888, TEXT_TOLERANCE_MM, '金額 x');
  });

  it('明細書の子項目を §6 の記入例と同じ位置へ配置する', () => {
    const doc = render(detailPage());

    expectMm(textOf(doc, '保安要員').x, 107, 0.05, '子項目の名称 x');
    expectMm(textOf(doc, '仮設足場組立・解体時').x, 346, 0.05, '規格 x');
    expectMm(textOf(doc, '612     ').x, 661, TEXT_TOLERANCE_MM, '数量 x');
    expectMm(textOf(doc, '592').x, 797, TEXT_TOLERANCE_MM, '単価 x');
    expectMm(textOf(doc, '362,304').x, 888, TEXT_TOLERANCE_MM, '金額 x');
  });

  it('各明細行を 34.0px ピッチのベースラインへ配置する', () => {
    const doc = render(detailPage());

    ['Ａ.共通仮設工事', '保安要員', '※電力100V・水道水は無償支給', '外部足場'].forEach(
      (value, index) => {
        const call = doc.texts.filter((candidate) => candidate.text === value)[0]!;
        expectMm(call.y, detailBaselinePx(index), ROW_TOLERANCE_MM, `${index}行目 y`);
      }
    );
  });
});

// ============================================================================
// 52.11 / 52.12: 明細書の先頭行と子項目のインデント
// ============================================================================

describe('明細書の先頭行と子項目のインデント（52.11, 52.12）', () => {
  it('先頭行に親項目の階層記号と名称を出力する', () => {
    const doc = render(detailPage());
    const heading = textsOnBaseline(doc, detailBaselinePx(0))[0]!;

    expect(heading.text).toBe('Ａ.共通仮設工事');
    expectMm(heading.x, 80, 0.05, '見出し行の記号 x');

    // §6 は区切り `.` を x=94px、名称を x=100px に記録する。
    // 1つの文字列として描画しても同じ位置に来ることを確認する。
    const symbolWidth = measureMm('Ａ', 10);
    const separatorWidth = measureMm('.', 10);
    expectMm(heading.x + symbolWidth, 94, 0.3, '区切り `.` の x');
    expectMm(heading.x + symbolWidth + separatorWidth, 100, 0.3, '名称の x');
  });

  it('子項目の名称を先頭行より右へずらす（§6「+27 px インデント」）', () => {
    const doc = render(detailPage());
    const heading = textsOnBaseline(doc, detailBaselinePx(0))[0]!;
    const child = textOf(doc, '保安要員');

    expect(child.x).toBeGreaterThan(heading.x);
    expectMmValue(child.x - heading.x, mm(27), 0.05, 'インデント1段の幅');
  });

  it('内訳書の行と明細書の見出し行は同じ字下げになる（いずれもインデント0段）', () => {
    const summary = render(summaryPage());
    const detail = render(detailPage());

    expectMmValue(
      textOf(summary, 'Ａ.共通仮設工事').x,
      textsOnBaseline(detail, detailBaselinePx(0))[0]!.x,
      0.001,
      '名称 x'
    );
  });
});

// ============================================================================
// 50.11: 表の外側下部のフッタ
// ============================================================================

describe('親項目名のフッタ（50.11）', () => {
  it('明細書は表の外側下部へ親項目名を右寄せで出力する', () => {
    const doc = render(detailPage());
    const below = doc.texts.filter((call) => call.y > mm(ROW_BOUNDARY_PX[19]!));

    expect(below).toHaveLength(1);
    const footer = below[0]!;
    expect(footer.text).toBe('Ａ.共通仮設工事');
    expect(footer.fontSize).toBe(10);
    expectMm(footer.y, 757, ROW_TOLERANCE_MM, 'フッタ y');
    // §6 は x=944〜957px（親項目名の長さで変わる）。`Ａ.共通仮設工事` は右端寄りの 957px
    expectMm(footer.x, 957, TEXT_TOLERANCE_MM, 'フッタ x');
    // 右寄せ: 右端が表の右端の内側に収まる
    expect(footer.x + footer.widthMm).toBeLessThanOrEqual(mm(COLUMN_BOUNDARY_PX[7]!));
  });

  it('親項目名が長いほど左から始まる（右寄せの証明）', () => {
    const short = render(detailPage({ parentLabel: 'Ａ.外構' }));
    const long = render(detailPage({ parentLabel: 'Ａ.共通仮設工事および仮囲い' }));

    const shortFooter = short.texts.filter((call) => call.y > mm(ROW_BOUNDARY_PX[19]!))[0]!;
    const longFooter = long.texts.filter((call) => call.y > mm(ROW_BOUNDARY_PX[19]!))[0]!;

    expect(longFooter.x).toBeLessThan(shortFooter.x);
    expectMmValue(
      shortFooter.x + shortFooter.widthMm,
      longFooter.x + longFooter.widthMm,
      0.001,
      'フッタの右端'
    );
  });

  it('内訳書はフッタを出力しない', () => {
    const doc = render(summaryPage());

    expect(doc.texts.filter((call) => call.y > mm(ROW_BOUNDARY_PX[19]!))).toEqual([]);
  });
});

// ============================================================================
// 52.10: 合計行
// ============================================================================

describe('合計行（52.10）', () => {
  it('合計行の名称欄と金額欄を §5 の座標へ出力する', () => {
    const doc = render(summaryPage());
    const totals = textsOnBaseline(doc, TOTAL_BASELINE_PX);

    expect(totals).toHaveLength(2);
    const [label, amount] = totals as readonly [TextCall, TextCall];

    // §5「名称列 x=67 に `        【合  計】`（先頭に半角8スペース）」
    // 字下げは描画側の責務なので `【` の左端は 67px + 半角8つ分
    expectMmValue(label.x, mm(67) + measureMm(' '.repeat(8), 10), 0.05, '合計ラベル x');
    expect(label.fontSize).toBe(10);
    // §5 の実例 `【合  計】`（半角2スペース）＝ 全角スペース1つ相当
    expect(label.text).toBe('【合　計】');

    // §5 の金額列 x=874〜888。9文字の `9,420,000` は最も広く 874 側になる
    expectMm(amount.x, 874, TEXT_TOLERANCE_MM, '合計金額 x');
    expect(amount.text).toBe('9,420,000');
  });

  it('合計行を持たないページでは名称も金額も出力しない', () => {
    const doc = render(summaryPage({ totalRow: null }));

    expect(textsOnBaseline(doc, TOTAL_BASELINE_PX)).toEqual([]);
  });
});

// ============================================================================
// 52.13: 列幅による打ち切り
// ============================================================================

describe('列幅に収まらない文字列の打ち切り（52.13）', () => {
  it('フィクスチャの名称・規格・備考が列幅を実際に超える（否定側アサーションの前提）', () => {
    const widths = [
      { text: OVERFLOWING_NAME, leftIndex: 0, rightIndex: 1 },
      { text: OVERFLOWING_SPEC, leftIndex: 1, rightIndex: 2 },
      { text: OVERFLOWING_REMARKS, leftIndex: 6, rightIndex: 7 },
    ];

    widths.forEach(({ text, leftIndex, rightIndex }) => {
      const columnWidthMm = mm(COLUMN_BOUNDARY_PX[rightIndex]! - COLUMN_BOUNDARY_PX[leftIndex]!);
      expect(
        measureMm(text, 10),
        `${text.slice(0, 10)}… の幅が列幅 ${columnWidthMm.toFixed(2)}mm を超えること`
      ).toBeGreaterThan(columnWidthMm);
    });
  });

  it('境界フィクスチャが内寸の直上・直下に立っている（打ち切り閾値の観測前提）', () => {
    // 内寸の 2 倍を超える文字列しか無いと、閾値を 1.4 倍まで水増ししても打ち切りが
    // 起きて検証を素通りする。閾値そのものを固定できる比率であることをここで実測する。
    const cases = [
      { text: NAME_JUST_OVER, innerMm: NAME_INNER_MM, over: true },
      { text: NAME_JUST_UNDER, innerMm: NAME_INNER_MM, over: false },
      { text: SPEC_JUST_OVER, innerMm: SPEC_INNER_MM, over: true },
      { text: SPEC_JUST_UNDER, innerMm: SPEC_INNER_MM, over: false },
      { text: REMARKS_JUST_OVER, innerMm: REMARKS_INNER_MM, over: true },
      { text: REMARKS_JUST_UNDER, innerMm: REMARKS_INNER_MM, over: false },
    ] as const;

    cases.forEach(({ text, innerMm, over }) => {
      const ratio = measureMm(text, 10) / innerMm;
      if (over) {
        // 内寸を超えるが、1.05 倍の水増し閾値には届かない
        expect(ratio, `${text.slice(0, 4)}… の比率`).toBeGreaterThan(1);
        expect(ratio, `${text.slice(0, 4)}… の比率`).toBeLessThan(1.05);
      } else {
        // 内寸に収まるが、0.9 倍の切り詰め閾値には収まらない
        expect(ratio, `${text.slice(0, 4)}… の比率`).toBeLessThan(1);
        expect(ratio, `${text.slice(0, 4)}… の比率`).toBeGreaterThan(0.9);
      }
    });
  });

  it('内寸をわずかに超える名称・規格・備考を欄の内側で打ち切る', () => {
    const doc = render(boundaryPage());
    const drawn = textsOnBaseline(doc, detailBaselinePx(0));

    const cases = [
      { original: NAME_JUST_OVER, innerRightPx: COLUMN_BOUNDARY_PX[1]! - CELL_PADDING_PX },
      { original: SPEC_JUST_OVER, innerRightPx: COLUMN_BOUNDARY_PX[2]! - CELL_PADDING_PX },
      { original: REMARKS_JUST_OVER, innerRightPx: COLUMN_BOUNDARY_PX[7]! - CELL_PADDING_PX },
    ] as const;

    cases.forEach(({ original, innerRightPx }) => {
      const call = drawn.find(
        (candidate) => candidate.text.length > 0 && original.startsWith(candidate.text)
      );
      expect(call, `${original.slice(0, 4)}… の描画`).toBeDefined();
      // 打ち切られている（元の文字列より短い前置部分）
      expect(call!.text.length, `${original.slice(0, 4)}… の打ち切り`).toBeLessThan(
        original.length
      );
      // 欄の内側の右端を越えない
      expect(call!.x + call!.widthMm, `${original.slice(0, 4)}… の右端`).toBeLessThanOrEqual(
        mm(innerRightPx)
      );
    });
  });

  it('内寸にわずかに収まる名称・規格・備考は打ち切らない', () => {
    const doc = render(boundaryPage());
    const drawn = textsOnBaseline(doc, detailBaselinePx(1)).map((call) => call.text);

    expect(drawn).toContain(NAME_JUST_UNDER);
    expect(drawn).toContain(SPEC_JUST_UNDER);
    expect(drawn).toContain(REMARKS_JUST_UNDER);
  });

  it('名称・規格・備考を列幅の範囲内で打ち切る', () => {
    const doc = render(summaryPage());
    const drawn = textsOnBaseline(doc, detailBaselinePx(2));

    const cases = [
      { original: OVERFLOWING_NAME, leftIndex: 0, rightIndex: 1 },
      { original: OVERFLOWING_SPEC, leftIndex: 1, rightIndex: 2 },
      { original: OVERFLOWING_REMARKS, leftIndex: 6, rightIndex: 7 },
    ] as const;

    cases.forEach(({ original, leftIndex, rightIndex }) => {
      const call = drawn.find(
        (candidate) => candidate.text.length > 0 && original.startsWith(candidate.text)
      );
      expect(call, `${original.slice(0, 10)}… の描画`).toBeDefined();
      // 打ち切られている（元の文字列より短い前置部分）
      expect(call!.text.length).toBeLessThan(original.length);
      // 列の内側に収まる
      expect(call!.x).toBeGreaterThanOrEqual(mm(COLUMN_BOUNDARY_PX[leftIndex]!));
      expect(call!.x + call!.widthMm).toBeLessThanOrEqual(mm(COLUMN_BOUNDARY_PX[rightIndex]!));
    });
  });

  it('列幅に収まる文字列は打ち切らない', () => {
    const doc = render(summaryPage());

    expect(textOf(doc, 'Ａ.共通仮設工事').text).toBe('Ａ.共通仮設工事');
  });

  it('どの描画も表の左端から右端の範囲に収まり紙面外へはみ出さない', () => {
    const doc = render(summaryPage());
    const bodyTexts = doc.texts.filter((call) => call.y >= mm(ROW_BOUNDARY_PX[0]!));

    expect(bodyTexts.length).toBeGreaterThan(0);
    bodyTexts.forEach((call) => {
      expect(call.x, `${call.text} の左端`).toBeGreaterThanOrEqual(mm(COLUMN_BOUNDARY_PX[0]!));
      expect(call.x + call.widthMm, `${call.text} の右端`).toBeLessThanOrEqual(
        mm(COLUMN_BOUNDARY_PX[7]!)
      );
    });
    doc.texts.forEach((call) => {
      expect(call.x + call.widthMm, `${call.text} が紙面内`).toBeLessThanOrEqual(PAPER_WIDTH_MM);
    });
  });
});

// ============================================================================
// 55.5: 注記行
// ============================================================================

describe('注記行（55.5）', () => {
  it('注記行は名称欄のみを出力する', () => {
    const doc = render(detailPage());
    const drawn = textsOnBaseline(doc, detailBaselinePx(2));

    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.text).toBe('※電力100V・水道水は無償支給');
    expect(drawn[0]!.x).toBeLessThan(mm(COLUMN_BOUNDARY_PX[1]!));
  });

  it('注記行の名称も階層に応じて字下げする（52.12, 55.3）', () => {
    const doc = render(detailPage());
    const note = textsOnBaseline(doc, detailBaselinePx(2))[0]!;
    const sibling = textOf(doc, '保安要員'); // 同じ indentLevel: 1 の通常行
    const heading = textsOnBaseline(doc, detailBaselinePx(0))[0]!; // indentLevel: 0

    // 注記行は任意の階層に置けるので（55.3）、同階層の通常行と同じ字下げになる
    expectMmValue(note.x, sibling.x, 0.001, '注記行の名称 x');
    expectMmValue(note.x - heading.x, mm(INDENT_STEP_PX), 0.05, '注記行のインデント1段');
  });

  it('注記行の前後の行は名称以外の欄も出力する（前提の非空振り確認）', () => {
    const doc = render(detailPage());

    expect(textsOnBaseline(doc, detailBaselinePx(1)).length).toBeGreaterThan(1);
    expect(textsOnBaseline(doc, detailBaselinePx(3)).length).toBeGreaterThan(1);
  });
});

// ============================================================================
// 引数の防御
// ============================================================================

describe('引数の防御', () => {
  it('表紙ページを渡すと RangeError を送出する', () => {
    const cover: ReportPage = {
      kind: 'cover',
      lineType: 'ESTIMATE',
      pageNumber: 1,
      title: '御見積書',
      parentLabel: null,
      rows: [],
      totalRow: null,
    };

    expect(() => drawTablePage(new RecordingDocument(), cover)).toThrow(RangeError);
  });

  it('1ページの明細行が17行を超える構成を渡すと RangeError を送出する', () => {
    const rows = Array.from({ length: 18 }, (_, index) => itemRow({ name: `項目${index}` }));

    expect(() => drawTablePage(new RecordingDocument(), summaryPage({ rows }))).toThrow(RangeError);
  });

  it('明細行がちょうど17行の構成は描画できる', () => {
    const rows = Array.from({ length: 17 }, (_, index) => itemRow({ name: `項目${index}` }));
    const doc = render(summaryPage({ rows }));

    expect(textsOnBaseline(doc, detailBaselinePx(16))).toHaveLength(1);
  });
});
