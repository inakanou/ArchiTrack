/**
 * @fileoverview 表紙の別途工事の番号が「グリフとして実際に描画される」ことの検査（Task 56.14）
 *
 * ## この検査が存在する理由
 *
 * `EstimateCoverRenderer.test.ts` は描画呼び出しを記録するテストダブルに対して
 * `doc.text` へ渡された**文字列**を突き合わせる。文字列は実装が渡したとおりに記録されるので、
 * その文字が埋め込みフォントに**存在しない**（＝ `.notdef` に落ちて紙面に何も出ない）場合でも
 * 検査は緑のままになる。実際、別途工事の番号は `①`〜`⑤`（U+2460〜U+2464）で実装され、
 * 単体テストは緑だったが、埋め込みフォント（Fontsource japanese-400-normal のサブセット）は
 * この5文字を持たないため**表紙には何も描かれていなかった**。
 *
 * そこで本ファイルは文字列ではなく**生成物と実資産**に対して検査する。
 *
 * 1. **フォント資産の cmap**（`fonts/noto-sans-jp-base64.ts` を実際にデコードして解析）に、
 *    表紙が描くすべての文字の符号位置が存在すること。モックではなく出荷する資産そのものを読む。
 * 2. **実際に生成した PDF** （`jspdf` に日本語フォントを登録して `drawCoverPage` を実行し、
 *    `doc.output('arraybuffer')` で得たバイト列）から `pdfjs-dist` でテキストを抽出し、
 *    5行分の番号が**順に**取り出せること。グリフが `.notdef` に落ちていれば抽出結果に現れない。
 *
 * ## 期待値の出どころ
 *
 * 番号付き5行という構造は Requirement 51.11「別途工事の記載欄を5行分、番号付きで出力する」、
 * 座標は `pdf-format-reference.md` §3（`x=200`, `y=586 / 618 / 649 / 680 / 714` px）から取り、
 * **実装モジュールの定数は読み戻さない**。
 *
 * ## `pdfjs-dist` の指定子について
 *
 * 既定のエントリ（`build/pdf.mjs`）は読み込み時に `DOMMatrix` を参照するため Node では読めない。
 * `legacy/build/pdf.mjs` は Node で動作する（56.12 の E2E が確立した手順と同じ）。
 * `pdfjs-dist` は `react-pdf`（frontend の直接依存）がバージョンを固定して連れてくる。
 *
 * Requirements: 51.11（別途工事の記載欄を5行分、番号付きで出力する）
 * Design: pdf-format-reference.md §3「別途工事 ①〜⑤」／§11「要件定義で決める論点」8
 */

import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';

import {
  drawCoverPage,
  type CoverPdfDocument,
  type EstimateCoverSubject,
} from '../EstimateCoverRenderer';
import { COVER_PAGE_TITLE, type ReportPage } from '../estimateReportLayout';
import { NotoSansJPBase64 } from '../fonts/noto-sans-jp-base64';
import { initializePdfFonts } from '../PdfFontService';

// ============================================================================
// 参照座標（pdf-format-reference.md §3）
// ============================================================================

/** px → mm（pdf-format-reference.md「座標系の読み方」） */
const MM_PER_PX = 0.264583;
function mm(px: number): number {
  return px * MM_PER_PX;
}

/** 別途工事の記載欄 x=200 px */
const SEPARATE_WORKS_X_PX = 200;

/** 別途工事の記載欄 y=586 / 618 / 649 / 680 / 714 px（5行 = 51.11） */
const SEPARATE_WORKS_Y_PX = [586, 618, 649, 680, 714] as const;

/** 座標一致の許容差（実装は mm を小数2桁で保持する） */
const MM_TOLERANCE = 0.01;

// ============================================================================
// フィクスチャ
// ============================================================================

const COVER_PAGE: ReportPage = {
  kind: 'cover',
  lineType: 'ESTIMATE',
  pageNumber: 1,
  title: COVER_PAGE_TITLE,
  parentLabel: null,
  rows: [],
  totalRow: null,
};

/**
 * 別途工事を5件とも埋めた描画対象
 *
 * 記載内容は**表紙の他のどこにも現れない1文字**にする。抽出したテキストから
 * 「この記載内容の直前に番号がある」を位置で突き合わせるため、他の欄と衝突すると
 * 誤った位置を見てしまう（`丁` は工事場所の `1丁目` と衝突した）。
 */
const SEPARATE_WORK_CONTENTS = ['カ', 'キ', 'ク', 'ケ', 'コ'] as const;

function coverSubject(): EstimateCoverSubject {
  return {
    reportFields: {
      submissionDate: '2026-05-01',
      validityPeriod: '提出日より 1 ヶ月間',
      separateWorks: [...SEPARATE_WORK_CONTENTS],
    },
    project: {
      name: 'JAあかし 農業倉庫改修工事',
      // 数字を含めない。番号の有無を「記載内容の直前に数字があるか」で判定するため、
      // 直前に描かれる工事場所が数字を持つと番号が消えても真になりうる
      siteAddress: '明石市大久保町駅前',
    },
    customer: {
      name: 'あかし農業協同組合',
      representativeName: '代表理事組合長 大西 弘訓',
    },
    company: {
      companyName: '三和建設株式会社',
      representative: '代表取締役　　中 農　一 誠',
      address: '〒670-0933 兵庫県姫路市平野町４３番地',
      phone: '079-281-5858',
      fax: '079-281-5978',
    },
    totalAmount: new Decimal('13420000'),
  };
}

// ============================================================================
// 描画呼び出しの記録（座標から「番号の行」を取り出すためだけに使う）
// ============================================================================

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

class RecordingDocument implements CoverPdfDocument {
  readonly texts: TextCall[] = [];
  setFontSize(): void {}
  setFillColor(): void {}
  setDrawColor(): void {}
  setLineWidth(): void {}
  rect(): void {}
  text(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y });
  }
}

/**
 * 別途工事の5行を参照座標（§3）で取り出す
 *
 * 実装の定数ではなく参照PDFの座標で拾うため、行が消えたり位置が変われば取り出しに失敗する。
 */
function separateWorkRows(): readonly string[] {
  const doc = new RecordingDocument();
  drawCoverPage(doc, COVER_PAGE, coverSubject());

  return SEPARATE_WORKS_Y_PX.map((yPx, index) => {
    const matched = doc.texts.filter(
      (call) =>
        Math.abs(call.x - mm(SEPARATE_WORKS_X_PX)) <= MM_TOLERANCE &&
        Math.abs(call.y - mm(yPx)) <= MM_TOLERANCE
    );
    expect(
      matched,
      `別途工事 ${index + 1} 行目（§3 x=${SEPARATE_WORKS_X_PX}, y=${yPx} px）が1件描画されること`
    ).toHaveLength(1);
    return matched[0]!.text;
  });
}

/** 全角数字を半角へ寄せる（番号の表記形に依存せず「1〜5」を読み取るため） */
function toAsciiDigits(text: string): string {
  return text.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30)
  );
}

// ============================================================================
// フォント資産の cmap 解析（出荷する資産そのものを読む）
// ============================================================================

/**
 * 埋め込みフォントの cmap に載っている符号位置の集合
 *
 * TrueType の `cmap` テーブルから Unicode サブテーブル（format 4 / format 12）を読み、
 * グリフ ID が 0（`.notdef`）でない符号位置だけを集める。
 */
function embeddedFontCodePoints(): ReadonlySet<number> {
  const font = Buffer.from(NotoSansJPBase64, 'base64');
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);

  const tableCount = view.getUint16(4);
  let cmapOffset: number | null = null;
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3)
    );
    if (tag === 'cmap') {
      cmapOffset = view.getUint32(record + 8);
    }
  }
  if (cmapOffset === null) {
    throw new Error('埋め込みフォントに cmap テーブルがありません');
  }

  const codePoints = new Set<number>();
  const subtableCount = view.getUint16(cmapOffset + 2);
  let parsed = 0;
  for (let index = 0; index < subtableCount; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = view.getUint16(record);
    const offset = cmapOffset + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    // Unicode（platform 0）または Windows Unicode（platform 3）のみを対象にする
    if (platform !== 0 && platform !== 3) {
      continue;
    }
    if (format === 4) {
      readCmapFormat4(view, offset, codePoints);
      parsed += 1;
    } else if (format === 12) {
      readCmapFormat12(view, offset, codePoints);
      parsed += 1;
    }
  }
  if (parsed === 0) {
    throw new Error('埋め込みフォントに解析可能な Unicode cmap サブテーブルがありません');
  }
  return codePoints;
}

function readCmapFormat4(view: DataView, offset: number, out: Set<number>): void {
  const segCountX2 = view.getUint16(offset + 6);
  const segCount = segCountX2 / 2;
  const endOffset = offset + 14;
  const startOffset = endOffset + segCountX2 + 2;
  const deltaOffset = startOffset + segCountX2;
  const rangeOffset = deltaOffset + segCountX2;

  for (let segment = 0; segment < segCount; segment += 1) {
    const end = view.getUint16(endOffset + segment * 2);
    const start = view.getUint16(startOffset + segment * 2);
    const delta = view.getInt16(deltaOffset + segment * 2);
    const range = view.getUint16(rangeOffset + segment * 2);
    if (start === 0xffff) {
      continue;
    }
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      let glyph: number;
      if (range === 0) {
        glyph = (codePoint + delta) & 0xffff;
      } else {
        const glyphIndexOffset = rangeOffset + segment * 2 + range + (codePoint - start) * 2;
        if (glyphIndexOffset + 1 >= view.byteLength) {
          continue;
        }
        glyph = view.getUint16(glyphIndexOffset);
        if (glyph !== 0) {
          glyph = (glyph + delta) & 0xffff;
        }
      }
      if (glyph !== 0) {
        out.add(codePoint);
      }
    }
  }
}

function readCmapFormat12(view: DataView, offset: number, out: Set<number>): void {
  const groupCount = view.getUint32(offset + 12);
  for (let index = 0; index < groupCount; index += 1) {
    const group = offset + 16 + index * 12;
    const start = view.getUint32(group);
    const end = view.getUint32(group + 4);
    const startGlyph = view.getUint32(group + 8);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      if (startGlyph + (codePoint - start) !== 0) {
        out.add(codePoint);
      }
    }
  }
}

function missingCodePoints(text: string, coverage: ReadonlySet<number>): readonly string[] {
  return [...text].filter((char) => !coverage.has(char.codePointAt(0)!));
}

function describeCodePoints(chars: readonly string[]): string {
  return chars
    .map((char) => `${char}(U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`)
    .join(' ');
}

// ============================================================================
// 生成した PDF からのテキスト抽出（pdfjs-dist の Node 向けビルド）
// ============================================================================

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
  getDocument(source: {
    data: Uint8Array;
    useWorkerFetch?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }): { readonly promise: Promise<PdfDocument> };
}

const PDFJS_NODE_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractFirstPageText(bytes: Uint8Array): Promise<string> {
  const loaded: unknown = await import(/* @vite-ignore */ PDFJS_NODE_ENTRY);
  const pdfjs = loaded as PdfjsModule;
  const document = await pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  expect(document.numPages, '表紙のみを描いたので1ページであること').toBe(1);
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map((item) => item.str ?? '')
    .join('')
    .replace(/[\s　]/g, '');
}

/** 実際に jsPDF で表紙を1ページ生成する（56.6 と同じ用紙設定） */
function renderCoverPdf(): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  initializePdfFonts(doc);
  drawCoverPage(doc, COVER_PAGE, coverSubject());
  return new Uint8Array(doc.output('arraybuffer'));
}

// ============================================================================
// 検査
// ============================================================================

describe('埋め込みフォントの cmap 解析（検査そのものの妥当性）', () => {
  it('出荷するフォント資産から符号位置の集合を取り出せる', () => {
    const coverage = embeddedFontCodePoints();

    // 「すべて含む」集合になっていない（＝否定側の検査が空振りしない）ことを両側で確かめる
    expect(coverage.size, '日本語サブセットとして妥当な規模であること').toBeGreaterThan(3000);
    expect(coverage.has('別'.codePointAt(0)!), '表紙が使う漢字は載っていること').toBe(true);
    expect(coverage.has(0x1f600), '絵文字は日本語サブセットに載らないこと').toBe(false);
  });
});

describe('別途工事の記載欄（51.11）', () => {
  it('5行分の番号が 1〜5 の順に描画される', () => {
    const rows = separateWorkRows();

    expect(rows, '記載欄は5行').toHaveLength(5);

    const marks = rows.map((row, index) => {
      const content = SEPARATE_WORK_CONTENTS[index]!;
      expect(row.endsWith(content), `${index + 1}行目は番号のあとに記載内容が続くこと`).toBe(true);
      return row.slice(0, row.length - content.length);
    });

    marks.forEach((mark, index) => {
      expect(mark, `${index + 1}行目に番号があること`).not.toBe('');
      expect(
        toAsciiDigits(mark),
        `${index + 1}行目の番号は ${index + 1} を表すこと（実際: ${JSON.stringify(mark)}）`
      ).toContain(String(index + 1));
    });

    expect(new Set(marks).size, '5行の番号は互いに異なること').toBe(5);
  });

  it('番号に使う文字が埋め込みフォントに存在する', () => {
    const coverage = embeddedFontCodePoints();
    const rows = separateWorkRows();

    rows.forEach((row, index) => {
      const missing = missingCodePoints(row, coverage);
      expect(
        missing,
        `${index + 1}行目 ${JSON.stringify(row)} の文字が埋め込みフォントに存在すること` +
          `（欠落: ${describeCodePoints(missing)}）`
      ).toEqual([]);
    });
  });

  it('生成したPDFで各行の記載内容の直前に 1〜5 の番号が描かれている', async () => {
    // 期待値を実装から取らない形。51.11 が定めるのは「5行分、番号付き」なので、
    // **記載内容の直前に対応する番号がある**ことだけを生成物に対して主張する。
    const text = toAsciiDigits(await extractFirstPageText(renderCoverPdf()));

    /**
     * 番号の表記（囲みや区切り）を許容するための窓
     *
     * `（1）` / `(1)` / `1.` のいずれも収まる最小幅にする。窓を広げると、番号が消えても
     * 手前の欄の数字を拾って真になりうる。
     */
    const MARK_WINDOW = 4;

    SEPARATE_WORK_CONTENTS.forEach((content, index) => {
      const at = text.indexOf(content);
      expect(
        at,
        `${index + 1}行目の記載内容 ${content} が生成したPDFに描かれていること` +
          `（抽出結果: ${JSON.stringify(text)}）`
      ).toBeGreaterThanOrEqual(0);

      const beforeContent = text.slice(Math.max(0, at - MARK_WINDOW), at);
      expect(
        beforeContent,
        `${index + 1}行目の記載内容の直前に番号 ${index + 1} が描かれていること` +
          `（直前の${MARK_WINDOW}文字: ${JSON.stringify(beforeContent)}）`
      ).toContain(String(index + 1));
    });
  });

  it('生成したPDFから5行分が描画順に取り出せる', async () => {
    const text = await extractFirstPageText(renderCoverPdf());
    const rows = separateWorkRows();

    let searchFrom = -1;
    rows.forEach((row, index) => {
      const found = text.indexOf(row, searchFrom + 1);
      expect(
        found,
        `生成したPDFの1ページ目に ${index + 1} 行目 ${JSON.stringify(row)} が` +
          `直前の行より後ろに描かれていること（抽出結果: ${JSON.stringify(text)}）`
      ).toBeGreaterThan(searchFrom);
      searchFrom = found;
    });
  });
});

describe('表紙が描くすべての文字（51.1〜51.15）', () => {
  it('埋め込みフォントに存在しない文字を1つも描かない', () => {
    const coverage = embeddedFontCodePoints();
    const doc = new RecordingDocument();
    drawCoverPage(doc, COVER_PAGE, coverSubject());

    expect(doc.texts.length, '表紙は複数の文字列を描くこと').toBeGreaterThan(10);

    const missing = doc.texts
      .flatMap((call) => missingCodePoints(call.text, coverage))
      .filter((char, index, all) => all.indexOf(char) === index);

    expect(
      missing,
      `表紙が描く文字はすべて埋め込みフォントに存在すること（欠落: ${describeCodePoints(missing)}）`
    ).toEqual([]);
  });
});
