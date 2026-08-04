/**
 * @fileoverview EstimateCoverRenderer の単体テスト（Task 56.4）
 *
 * **座標の検証方針**: 期待値は実装の定数を読み戻さず、
 * `.kiro/specs/estimate-creation/pdf-format-reference.md` §3 に記録された
 * **参照PDFの論理座標（96dpi px）** を本ファイル内に直接書き、
 * 同 §「座標系の読み方」の換算係数 `px × 0.264583` で mm へ変換して突き合わせる。
 * したがって実装が定数を書き換えれば必ず落ちる（55.1 の「実装と同じ式を読み戻す」形は取らない）。
 * フォントサイズも同 §3 / §8 の実寸pt を直接書く。
 *
 * Requirements: 51.1〜51.16, 54.7
 */

import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  drawCoverPage,
  type CoverPdfDocument,
  type EstimateCoverSubject,
} from './EstimateCoverRenderer';
import { COVER_PAGE_TITLE, type ReportPage } from './estimateReportLayout';

import type { jsPDF } from 'jspdf';

// ============================================================================
// 参照座標（pdf-format-reference.md §3）と換算
// ============================================================================

/** px → mm（pdf-format-reference.md「座標系の読み方」） */
const MM_PER_PX = 0.264583;
function mm(px: number): number {
  return px * MM_PER_PX;
}

/** 座標の許容差。実装は mm を小数2桁で保持するため 0.005mm 以内で一致する */
const MM_PRECISION = 2;

// ============================================================================
// 描画呼び出しの記録
// ============================================================================

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
}

interface RectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style: string | undefined;
  readonly fillColor: readonly [number, number, number] | null;
  readonly drawColor: readonly [number, number, number] | null;
  readonly lineWidth: number | null;
}

class RecordingDocument implements CoverPdfDocument {
  readonly texts: TextCall[] = [];
  readonly rects: RectCall[] = [];

  private fontSize = Number.NaN;
  private fillColor: readonly [number, number, number] | null = null;
  private drawColor: readonly [number, number, number] | null = null;
  private lineWidth: number | null = null;

  setFontSize(size: number): void {
    this.fontSize = size;
  }

  setFillColor(red: number, green: number, blue: number): void {
    this.fillColor = [red, green, blue];
  }

  setDrawColor(red: number, green: number, blue: number): void {
    this.drawColor = [red, green, blue];
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
  }

  rect(x: number, y: number, width: number, height: number, style?: string): void {
    this.rects.push({
      x,
      y,
      width,
      height,
      style,
      fillColor: this.fillColor,
      drawColor: this.drawColor,
      lineWidth: this.lineWidth,
    });
  }

  text(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, fontSize: this.fontSize });
  }
}

/**
 * 型レベルの適合性検査
 *
 * 56.6 は本レンダラへ `jsPDF` インスタンスをそのまま渡す。構造的に満たさなくなったら
 * `npm run type-check` が落ちる（実行時の jsPDF 生成は行わない）。
 */
type JsPdfSatisfiesCoverDocument = jsPDF extends CoverPdfDocument ? true : never;
const JS_PDF_SATISFIES_COVER_DOCUMENT: JsPdfSatisfiesCoverDocument = true;

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
 * 参照PDF（pdf-format-reference.md §3）と同じ内容の描画対象
 *
 * 自社住所には**郵便番号を含める**。51.14「郵便番号を独立した行として出力しない」は
 * 否定側の要件であり、郵便番号を供給しないフィクスチャでは無条件に真になるため。
 */
function referenceSubject(): EstimateCoverSubject {
  return {
    reportFields: {
      submissionDate: '2026-05-01',
      validityPeriod: '提出日より 1 ヶ月間',
      separateWorks: ['この見積書に記載なき事項'],
    },
    project: {
      name: 'JAあかし 農業倉庫改修工事',
      siteAddress: '明石市大久保町駅前1丁目2-10',
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

function render(
  subject: EstimateCoverSubject = referenceSubject(),
  page: ReportPage = COVER_PAGE
): RecordingDocument {
  const doc = new RecordingDocument();
  drawCoverPage(doc, page, subject);
  return doc;
}

/** 描画された文字列を1件だけ取り出す（0件・2件以上は失敗させる） */
function textOf(doc: RecordingDocument, value: string): TextCall {
  const matched = doc.texts.filter((call) => call.text === value);
  expect(
    matched,
    `描画された文字列 ${JSON.stringify(value)} が1件であること（実際: ${matched.length}件 / 全描画: ${JSON.stringify(doc.texts.map((call) => call.text))}）`
  ).toHaveLength(1);
  return matched[0]!;
}

function expectAt(call: TextCall, xPx: number, yPx: number, fontPt: number): void {
  expect(call.x).toBeCloseTo(mm(xPx), MM_PRECISION);
  expect(call.y).toBeCloseTo(mm(yPx), MM_PRECISION);
  expect(call.fontSize).toBe(fontPt);
}

/**
 * 自社情報ブロック（§3「自社情報（右側ブロック）」）に置かれた行
 *
 * §3 の右側ブロックは x=646〜748 px / y=531〜680 px の範囲にある。
 * 左側（別途工事・工事件名）と、上部の右寄せ要素（ページ番号 y=161 / 日付 y=220 /
 * 金額末尾記号 y=407 / 有効期限 y=452 px）を確実に外すため、両軸で絞り込む。
 */
function companyBlock(doc: RecordingDocument): readonly TextCall[] {
  return doc.texts.filter((call) => call.x >= mm(600) && call.y >= mm(500));
}

// ============================================================================
// 51.1: 表題を網掛けの枠内に配置する
// ============================================================================

describe('表題と網掛けの枠（51.1）', () => {
  it('網掛け矩形を参照座標に塗りつぶし付きで描画する', () => {
    const doc = render();

    // §3 外枠: (69.36, 53.52) – (1064.24, 738.48) px
    // §3 網掛け矩形: (454.8, 128.24) – (667.44, 172.72) px, 塗り RGB(192,192,192)
    const shaded = doc.rects.find((rect) => rect.fillColor?.join(',') === '192,192,192');
    expect(shaded, '網掛け矩形が描画されていること').toBeDefined();
    expect(shaded!.x).toBeCloseTo(mm(454.8), MM_PRECISION);
    expect(shaded!.y).toBeCloseTo(mm(128.24), MM_PRECISION);
    expect(shaded!.width).toBeCloseTo(mm(667.44 - 454.8), MM_PRECISION);
    expect(shaded!.height).toBeCloseTo(mm(172.72 - 128.24), MM_PRECISION);
    // 塗り＋枠線（§3「塗り RGB(192,192,192)、黒枠線あり」）
    expect(shaded!.style).toBe('FD');
    expect(shaded!.drawColor).toEqual([0, 0, 0]);
  });

  it('用紙の外枠を参照座標・参照線幅で描画する', () => {
    const doc = render();

    const frame = doc.rects.find((rect) => rect.style === 'S');
    expect(frame, '外枠が描画されていること').toBeDefined();
    expect(frame!.x).toBeCloseTo(mm(69.36), MM_PRECISION);
    expect(frame!.y).toBeCloseTo(mm(53.52), MM_PRECISION);
    expect(frame!.width).toBeCloseTo(mm(1064.24 - 69.36), MM_PRECISION);
    expect(frame!.height).toBeCloseTo(mm(738.48 - 53.52), MM_PRECISION);
    // §3「線幅 2.72px（= 0.72pt）」
    expect(frame!.lineWidth).toBeCloseTo(mm(2.72), MM_PRECISION);
  });

  it('表題を25ptで参照座標に描画し、網掛け矩形の内側に収める', () => {
    const doc = render();

    // §3 表題: `御 見 積 書`（1文字ずつ全角スペース区切り） x=470, y=163 px / 25pt
    const title = textOf(doc, '御　見　積　書');
    expectAt(title, 470, 163, 25);

    const shaded = doc.rects.find((rect) => rect.fillColor?.join(',') === '192,192,192')!;
    expect(title.x).toBeGreaterThanOrEqual(shaded.x);
    expect(title.x).toBeLessThanOrEqual(shaded.x + shaded.width);
    expect(title.y).toBeGreaterThanOrEqual(shaded.y);
    expect(title.y).toBeLessThanOrEqual(shaded.y + shaded.height);
  });

  it('表題の文字列は estimateReportLayout の表題定数と同じ文字から成る', () => {
    const doc = render();
    const title = textOf(doc, '御　見　積　書');
    expect(title.text.replace(/　/g, '')).toBe(COVER_PAGE_TITLE);
  });
});

// ============================================================================
// 51.2〜51.5: 提出日・宛先・代表者名と敬称・リード文
// ============================================================================

describe('提出日・宛先・リード文（51.2〜51.5）', () => {
  it('提出日を全角数字で参照座標に描画する', () => {
    const doc = render();

    // §3 日付: x=814, y=220 px / 10pt / `２０２６ 年５ 月１ 日`
    const date = textOf(doc, '２０２６ 年５ 月１ 日');
    expectAt(date, 814, 220, 10);
  });

  it('ページ番号を参照座標に描画する', () => {
    const doc = render();

    // §3 ページ番号: x=914, y=161 px / 10pt / `Page.1`
    const pageNumber = textOf(doc, 'Page.1');
    expectAt(pageNumber, 914, 161, 10);
  });

  it('宛先の取引先名を14ptで参照座標に描画する', () => {
    const doc = render();

    // §3 宛先（組織名）: x=116, y=241 px / 14pt
    const recipient = textOf(doc, 'あかし農業協同組合');
    expectAt(recipient, 116, 241, 14);
  });

  it('代表者名と敬称「様」を宛先の下に描画する', () => {
    const doc = render();

    // §3 宛先（役職氏名）: x=117, y=272 px / 14pt、敬称: x=353, y=272 px / 14pt
    const representative = textOf(doc, '代表理事組合長 大西 弘訓');
    expectAt(representative, 117, 272, 14);

    const honorific = textOf(doc, '様');
    expectAt(honorific, 353, 272, 14);

    // 「宛先の下」= 取引先名より下（Y が大きい）
    const recipient = textOf(doc, 'あかし農業協同組合');
    expect(representative.y).toBeGreaterThan(recipient.y);
    expect(honorific.y).toBe(representative.y);
  });

  it('リード文を12ptで参照座標に描画する', () => {
    const doc = render();

    // §3 リード文: x=117, y=326 px / 12pt
    const lead = textOf(doc, '下記のとおり御見積申し上げます。');
    expectAt(lead, 117, 326, 12);
  });
});

// ============================================================================
// 51.6〜51.8: 見積金額・消費税注記・有効期限
// ============================================================================

describe('見積金額・消費税注記・有効期限（51.6〜51.8）', () => {
  it('見積金額を全角数字・全角カンマで20ptで参照座標に描画する', () => {
    const doc = render();

    // §3 見積金額: x=301, y=407 px / 20pt / ` 御見積金額 ￥１３,４２０,０００ `
    // カンマは 53.8 に従い全角（U+FF0C）。56.1 の裁定を踏襲する
    const amount = textOf(doc, ' 御見積金額 ￥１３，４２０，０００ ');
    expectAt(amount, 301, 407, 20);
    expect(amount.text).not.toContain(',');

    // §3 金額末尾記号: x=756, y=407 px / 20pt / `.- `
    const suffix = textOf(doc, '.- ');
    expectAt(suffix, 756, 407, 20);
  });

  it('見積金額が表題・自社社名を除くすべての項目より大きな文字で描画される', () => {
    const doc = render();

    const amount = textOf(doc, ' 御見積金額 ￥１３，４２０，０００ ');
    const others = doc.texts.filter(
      (call) =>
        call.text !== amount.text &&
        call.text !== '.- ' &&
        call.text !== '御　見　積　書' &&
        call.text !== '三和建設株式会社'
    );
    expect(others.length).toBeGreaterThan(0);
    for (const call of others) {
      expect(call.fontSize, `${JSON.stringify(call.text)} は見積金額より小さいこと`).toBeLessThan(
        amount.fontSize
      );
    }
  });

  it('消費税を含まない旨の注記を13ptで参照座標に描画する', () => {
    const doc = render();

    // §3 税注記: x=386, y=452 px / 13pt
    const note = textOf(doc, '上記見積金額に消費税は含んでおりません。');
    expectAt(note, 386, 452, 13);
  });

  it('有効期限を入力値から組み立てて参照座標に描画する', () => {
    const doc = render();

    // §3 有効期限: x=764, y=452 px / 10pt / `（見積有効期限：提出日より 1 ヶ月間）`
    const validity = textOf(doc, '（見積有効期限：提出日より 1 ヶ月間）');
    expectAt(validity, 764, 452, 10);
  });
});

// ============================================================================
// 51.9, 51.10: 工事件名・工事場所
// ============================================================================

describe('工事件名と工事場所（51.9, 51.10）', () => {
  it('工事件名にプロジェクト名を、工事場所に現場住所を描画する', () => {
    const doc = render();

    // §3 工事件名: x=125, y=492 px / 12pt、工事場所: x=125, y=524 px / 12pt
    const name = textOf(doc, '工事件名：JAあかし 農業倉庫改修工事');
    expectAt(name, 125, 492, 12);

    const site = textOf(doc, '工事場所：明石市大久保町駅前1丁目2-10');
    expectAt(site, 125, 524, 12);
  });
});

// ============================================================================
// 51.11: 別途工事の記載欄
// ============================================================================

/**
 * 別途工事の記載欄の番号（51.11）
 *
 * **実装から読み戻さず本ファイルに直接書く**。参照PDF（§3）は丸数字だが、埋め込みフォントが
 * U+2460〜U+2464 を持たず紙面に何も出ないため全角括弧＋全角数字へ改めた（56.14）。
 */
const SEPARATE_WORK_MARKS = ['（１）', '（２）', '（３）', '（４）', '（５）'] as const;

/** 別途工事の記載欄として描かれた行（番号で始まる行）を描画順に取り出す */
function separateWorkRows(doc: RecordingDocument): readonly string[] {
  return doc.texts
    .filter((call) => SEPARATE_WORK_MARKS.some((mark) => call.text.startsWith(mark)))
    .map((call) => call.text);
}

describe('別途工事の記載欄（51.11）', () => {
  it('見出しと5行分の番号付き記載欄を参照座標に描画する', () => {
    const doc = render();

    // §3 別途工事 見出し: x=129, y=560 px / 12pt
    const heading = textOf(doc, '別途工事');
    expectAt(heading, 129, 560, 12);

    // §3 別途工事 の番号欄: x=200, y=586 / 618 / 649 / 680 / 714 px / 11pt
    //
    // 番号の表記は §3 の丸数字（`①`〜`⑤`）ではなく全角括弧＋全角数字を用いる。
    // 埋め込みフォントが U+2460〜U+2464 を持たず紙面に何も出ないため（56.14）。
    // グリフとして実際に出ることは `__tests__/estimateCoverGlyphRendering.test.ts` が
    // フォント資産と生成したPDFに対して検査する。
    const marks = SEPARATE_WORK_MARKS;
    const yPx = [586, 618, 649, 680, 714];
    const rows = doc.texts.filter((call) => marks.some((mark) => call.text.startsWith(mark)));
    expect(rows, '別途工事の記載欄は常に5行').toHaveLength(5);

    for (let index = 0; index < marks.length; index += 1) {
      const row = rows[index]!;
      expect(row.text.startsWith(marks[index]!), `${index + 1}行目の番号は ${marks[index]}`).toBe(
        true
      );
      expectAt(row, 200, yPx[index]!, 11);
    }

    // 1件目は入力値が続き、残り4行は番号のみ
    expect(rows[0]!.text).toBe('（１）この見積書に記載なき事項');
    expect(rows.slice(1).map((row) => row.text)).toEqual(['（２）', '（３）', '（４）', '（５）']);
  });

  it('別途工事が5件ある場合は5件すべてを番号付きで描画する', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: {
        ...subject.reportFields,
        separateWorks: ['甲', '乙', '丙', '丁', '戊'],
      },
    });

    expect(separateWorkRows(doc)).toEqual([
      '（１）甲',
      '（２）乙',
      '（３）丙',
      '（４）丁',
      '（５）戊',
    ]);
  });

  it('別途工事が5件を超えても記載欄は5行を超えない', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: {
        ...subject.reportFields,
        separateWorks: ['甲', '乙', '丙', '丁', '戊', '己', '庚'],
      },
    });

    // 6件目以降は紙面に現れない（欄は5行が上限）
    expect(doc.texts.some((call) => call.text.includes('己'))).toBe(false);
    expect(doc.texts.some((call) => call.text.includes('庚'))).toBe(false);
    // 5行目までは入力どおり
    expect(separateWorkRows(doc)).toEqual([
      '（１）甲',
      '（２）乙',
      '（３）丙',
      '（４）丁',
      '（５）戊',
    ]);
    // 総描画数は基準ケースと同じ24件（6行目が増えていない）
    expect(doc.texts).toHaveLength(24);
  });
});

// ============================================================================
// 51.12〜51.14: 自社情報
// ============================================================================

describe('自社情報（51.12〜51.14）', () => {
  it('会社名・代表者・住所・電話番号・FAX番号を参照座標に描画する', () => {
    const doc = render();

    // §3 自社情報（右側ブロック）
    expectAt(textOf(doc, '三和建設株式会社'), 646, 531, 22);
    expectAt(textOf(doc, '代表取締役　　中 農　一 誠'), 702, 578, 14);
    expectAt(textOf(doc, '〒670-0933 兵庫県姫路市平野町４３番地'), 673, 639, 10);
    expectAt(textOf(doc, 'TEL．079-281-5858'), 748, 662, 10);
    expectAt(textOf(doc, 'FAX．079-281-5978'), 748, 680, 10);
  });

  it('郵便番号を独立した行として描画しない', () => {
    const subject = referenceSubject();
    const doc = render(subject);

    // 前提の確認: フィクスチャは郵便番号を供給しており、住所行の中には現れている
    // （郵便番号を持たないフィクスチャでは以下の否定側アサーションが無条件に真になる）
    expect(subject.company.address).toContain('〒670-0933');
    const addressLine = doc.texts.find((call) => call.text.includes('〒670-0933'));
    expect(addressLine, '郵便番号は住所行の一部として描画される').toBeDefined();
    expect(addressLine!.text).toBe(subject.company.address);

    // 郵便番号だけの行が無いこと
    for (const call of doc.texts) {
      expect(call.text.trim(), '郵便番号のみの行を描画しない').not.toMatch(/^〒[0-9-]+$/);
    }

    // §3 郵便番号の参照座標 x=673, y=616 px に行が置かれていないこと
    // （左側の別途工事③ y=618px と衝突しないよう右側の x に限定する）
    const postalRowY = mm(616);
    for (const call of doc.texts.filter((call) => call.x >= mm(600))) {
      expect(
        Math.abs(call.y - postalRowY),
        `右側の ${JSON.stringify(call.text)} が郵便番号行の位置にある`
      ).toBeGreaterThan(0.5);
    }

    // 51.12 の5項目ちょうど（郵便番号行を足すと6件になる）
    expect(companyBlock(doc).map((call) => call.text)).toEqual([
      '三和建設株式会社',
      '代表取締役　　中 農　一 誠',
      '〒670-0933 兵庫県姫路市平野町４３番地',
      'TEL．079-281-5858',
      'FAX．079-281-5978',
    ]);
  });
});

// ============================================================================
// 51.15, 54.7: 未登録時も空欄として出力し処理を継続する
// ============================================================================

describe('未登録項目の空欄出力（51.15, 54.7）', () => {
  it('取引先名が未登録でも例外にならず、他の項目は描画される', () => {
    const subject = referenceSubject();
    const doc = render({ ...subject, customer: { ...subject.customer, name: null } });

    // 宛先欄は空欄。他の14pt項目（代表者名）は残る
    expect(doc.texts.some((call) => call.text === 'あかし農業協同組合')).toBe(false);
    expectAt(textOf(doc, ''), 116, 241, 14);
    expect(textOf(doc, '代表理事組合長 大西 弘訓').text).toBe('代表理事組合長 大西 弘訓');
  });

  it('代表者名が未登録の場合は敬称「様」も描画しない', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      customer: { ...subject.customer, representativeName: null },
    });

    expect(doc.texts.some((call) => call.text === '代表理事組合長 大西 弘訓')).toBe(false);
    expect(doc.texts.some((call) => call.text === '様')).toBe(false);
    // 宛先そのものは残る
    expect(textOf(doc, 'あかし農業協同組合').text).toBe('あかし農業協同組合');
  });

  it('現場住所が未登録でも工事場所欄を空欄で描画し、工事件名は残る', () => {
    const subject = referenceSubject();
    const doc = render({ ...subject, project: { ...subject.project, siteAddress: null } });

    expectAt(textOf(doc, '工事場所：'), 125, 524, 12);
    expect(textOf(doc, '工事件名：JAあかし 農業倉庫改修工事').text).toBe(
      '工事件名：JAあかし 農業倉庫改修工事'
    );
  });

  it('提出日が未入力でも空欄で描画し、他の帳票用入力項目は残る', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: { ...subject.reportFields, submissionDate: null },
    });

    expectAt(textOf(doc, ''), 814, 220, 10);
    expect(textOf(doc, '（見積有効期限：提出日より 1 ヶ月間）').text).toBe(
      '（見積有効期限：提出日より 1 ヶ月間）'
    );
  });

  it('提出日が日付として解釈できない場合も空欄で描画する', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: { ...subject.reportFields, submissionDate: '2026-02-31' },
    });

    expectAt(textOf(doc, ''), 814, 220, 10);
  });

  it('有効期限が未入力でも欄を空欄で描画し、提出日は残る', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: { ...subject.reportFields, validityPeriod: null },
    });

    expectAt(textOf(doc, '（見積有効期限：）'), 764, 452, 10);
    expect(textOf(doc, '２０２６ 年５ 月１ 日').text).toBe('２０２６ 年５ 月１ 日');
  });

  it('別途工事が未入力でも5行分の番号を描画する', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      reportFields: { ...subject.reportFields, separateWorks: [] },
    });

    expect(separateWorkRows(doc)).toEqual([...SEPARATE_WORK_MARKS]);
  });

  it('自社情報が未登録でも例外にならず、右側ブロックを空欄で描画する', () => {
    const subject = referenceSubject();
    const doc = render({
      ...subject,
      company: {
        companyName: null,
        representative: null,
        address: null,
        phone: null,
        fax: null,
      },
    });

    expectAt(textOf(doc, 'TEL．'), 748, 662, 10);
    expectAt(textOf(doc, 'FAX．'), 748, 680, 10);
    // 会社名・代表者・住所の3欄が空文字で描画される（欄そのものは残る）
    expect(companyBlock(doc).map((call) => call.text)).toEqual(['', '', '', 'TEL．', 'FAX．']);
    // 表紙の他の項目は影響を受けない
    expect(textOf(doc, 'あかし農業協同組合').text).toBe('あかし農業協同組合');
  });

  it('プロジェクト名が未登録でも工事件名欄を空欄で描画する', () => {
    const subject = referenceSubject();
    const doc = render({ ...subject, project: { ...subject.project, name: null } });

    expectAt(textOf(doc, '工事件名：'), 125, 492, 12);
  });
});

// ============================================================================
// 51.16: 表紙は見積金額のファイルにのみ適用する
// ============================================================================

describe('表紙の適用範囲（51.16）', () => {
  it('表紙以外のページを渡された場合は描画せず例外を送出する', () => {
    const doc = new RecordingDocument();
    expect(() =>
      drawCoverPage(doc, { ...COVER_PAGE, kind: 'summary' }, referenceSubject())
    ).toThrow(RangeError);
    // 「描画せず」= 部分的に描かれた表紙が残らない
    expect(doc.texts).toHaveLength(0);
    expect(doc.rects).toHaveLength(0);
  });

  it('見積金額以外の行タイプの表紙ページを渡された場合も例外を送出する', () => {
    const doc = new RecordingDocument();
    expect(() =>
      drawCoverPage(doc, { ...COVER_PAGE, lineType: 'EXECUTION' }, referenceSubject())
    ).toThrow(RangeError);
    expect(doc.texts).toHaveLength(0);
    expect(doc.rects).toHaveLength(0);
  });
});

// ============================================================================
// 全体構成
// ============================================================================

describe('表紙1ページの全体構成', () => {
  it('参照PDFの表紙に対応する24件の文字列と2件の矩形のみを描画する', () => {
    const doc = render();

    expect(doc.texts).toHaveLength(24);
    expect(doc.rects).toHaveLength(2);
  });

  it('型レベルで jsPDF が描画インターフェースを満たす', () => {
    expect(JS_PDF_SATISFIES_COVER_DOCUMENT).toBe(true);
  });
});
