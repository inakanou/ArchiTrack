/**
 * @fileoverview EstimateCoverRenderer - 見積書帳票の表紙1ページの描画
 *
 * 表紙（`ReportPage.kind === 'cover'`）1ページ分を、描画先の doc へ書き出す純粋な描画関数を
 * 提供します。表紙に載せる宛先・工事情報・自社情報・帳票用入力項目は
 * `estimateReportLayout.buildFiles` が持たない情報なので、**すべて引数で受け取ります**
 * （56.2 の `kind: 'cover'` は「そこに表紙を1ページ置く」という標識のみ）。
 *
 * **座標の出典**: `.kiro/specs/estimate-creation/pdf-format-reference.md` §3（表紙）。
 * 同書の値は参照PDFの論理座標（96dpi px）なので、同書「座標系の読み方」の
 * `mm = px × 0.264583` で換算した実測値を小数2桁で保持します。
 * フォントサイズは実寸pt で、`estimateReportLayout.REPORT_FONT_SIZES`（§8 の写し）を再利用します。
 *
 * **表記規則との責務分担**: 見積金額と提出日の全角表記（53.8 / 53.9）は
 * `estimateReportLayout.toFullWidthMoney` / `toFullWidthDate` を再利用し、本モジュールでは
 * 再実装しません。本モジュールが決めるのは「どの文字列をどこへ置くか」だけです。
 *
 * 依存方向: `domain` の型と `estimateReportLayout` のみに依存し、`hooks` / `components` /
 * `pages` / `api` には依存しません（design.md `#### Dependency Direction`）。
 * フォント登録・用紙の向き・ページ送りは出力サービス（56.6）の責務で、本モジュールは行いません。
 *
 * Requirements (estimate-creation):
 * - 51.1: 表題「御見積書」を網掛けの枠内に出力する
 * - 51.2: 提出日を出力する
 * - 51.3 / 51.4: 宛先に取引先名を、代表者名がある場合はその下に代表者名と敬称「様」を出力する
 * - 51.5: リード文「下記のとおり御見積申し上げます。」を出力する
 * - 51.6: 見積金額を他の項目より大きな文字で出力する
 * - 51.7: 消費税を含まない旨の注記を出力する
 * - 51.8: 見積の有効期限を出力する
 * - 51.9 / 51.10: 工事件名にプロジェクト名を、工事場所に現場住所を出力する
 * - 51.11: 別途工事の記載欄を5行分、番号付きで出力する
 * - 51.12 / 51.13: 自社情報（会社名・代表者・住所・電話番号・FAX番号）を
 *   自社情報登録機能の内容から出力する
 * - 51.14: 自社情報の郵便番号を独立した行として出力しない
 * - 51.15: 取引先・現場住所が未登録でも空欄として出力し、出力を継続する
 * - 51.16: 表紙を見積金額を出力対象とするファイルにのみ適用する
 * - 54.7: 帳票用入力項目が未入力でも空欄として出力し、出力を継続する
 *
 * Design: design.md `#### Frontend Export` > `##### EstimatePdfExportService`
 * （`EstimateCoverRenderer.ts` = 表紙1ページの描画。doc を受け取る純粋な描画関数）
 *
 * @module services/export/EstimateCoverRenderer
 */

import type Decimal from 'decimal.js';

import type { EstimateReportFields } from '../../domain/estimate/estimateEditReducer.types';
import { COVER_PAGE_TITLE, REPORT_FONT_SIZES, REPORT_GRID } from './estimateReportLayout';
import { toFullWidthDate, toFullWidthMoney } from './estimateReportLayout';
import type { ReportPage } from './estimateReportLayout';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 自社情報登録機能から取り込む描画対象（51.12, 51.13）
 *
 * `types/company-info.types.ts` の `CompanyInfo` のうち帳票の表紙に出力する5項目だけを持つ。
 * **郵便番号の項目を持たない**のは 51.14 の帰結であり、`CompanyInfo` 側にも郵便番号の
 * 独立した項目は無い（住所は1つの文字列）。住所文字列の中に郵便番号が含まれる場合も、
 * 住所行の一部としてそのまま出力する（独立した行にはしない）。
 *
 * 自社情報が未登録の場合に備え、各項目は `null` を許容する。design.md の
 * `EstimatePdfExportInput` は `CompanyInfoSnapshot` の内訳を定義していないため
 * 本モジュールで確定させる。
 */
export interface CompanyInfoSnapshot {
  readonly companyName: string | null;
  readonly representative: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly fax: string | null;
}

/**
 * 表紙に描画する対象（51.2〜51.15, 54.7）
 *
 * design.md の `EstimatePdfExportInput` から表紙に必要な部分だけを取り出した形。
 * `totalAmount` は当該ファイルの内訳書ページの合計行と同じ金額であり、
 * 出力サービス（56.6）が `ReportFileSpec` から取り出して渡す。
 */
export interface EstimateCoverSubject {
  /** 提出日・有効期限・別途工事（54.1〜54.3） */
  readonly reportFields: EstimateReportFields;
  readonly project: { readonly name: string | null; readonly siteAddress: string | null };
  readonly customer: {
    readonly name: string | null;
    readonly representativeName: string | null;
  };
  readonly company: CompanyInfoSnapshot;
  /** 見積金額（51.6） */
  readonly totalAmount: Decimal;
}

/**
 * 描画先
 *
 * `jsPDF` が構造的に満たす最小の面だけを宣言する。これにより
 * 描画位置を記録するテストダブルで座標を検証でき、かつ 56.6 は `jsPDF` を
 * そのまま渡せる（単体テストの適合性検査が型レベルで固定している）。
 * 単位は mm（56.6 が `unit: 'mm'` で doc を生成する）。
 */
export interface CoverPdfDocument {
  setFontSize(size: number): void;
  setFillColor(red: number, green: number, blue: number): void;
  setDrawColor(red: number, green: number, blue: number): void;
  setLineWidth(width: number): void;
  rect(x: number, y: number, width: number, height: number, style?: string): void;
  text(text: string, x: number, y: number): void;
}

// ============================================================================
// レイアウト定数（pdf-format-reference.md §3）
// ============================================================================

/**
 * 表紙の各要素の位置（mm）
 *
 * 出典は pdf-format-reference.md §3。各要素のコメントに参照PDFの論理座標（px）を残す。
 * 換算は同書「座標系の読み方」の `mm = px × 0.264583`。
 * テキストの Y はベースライン（jsPDF の `text` と同じ基準）。
 */
const COVER_LAYOUT = {
  /** 外枠 (69.36, 53.52) – (1064.24, 738.48) px、線幅 2.72 px */
  outerFrame: {
    xMm: 18.35,
    yMm: 14.16,
    widthMm: 263.23,
    heightMm: 181.23,
    lineWidthMm: 0.72,
  },
  /** 表題の網掛け矩形 (454.8, 128.24) – (667.44, 172.72) px */
  titleBox: { xMm: 120.33, yMm: 33.93, widthMm: 56.26, heightMm: 11.77 },
  /** 表題 x=470, y=163 px */
  title: { xMm: 124.35, yMm: 43.13 },
  /** ページ番号 x=914, y=161 px */
  pageNumber: { xMm: 241.83, yMm: 42.6 },
  /** 提出日 x=814, y=220 px */
  submissionDate: { xMm: 215.37, yMm: 58.21 },
  /** 宛先（組織名） x=116, y=241 px */
  recipientName: { xMm: 30.69, yMm: 63.76 },
  /** 宛先（役職氏名） x=117, y=272 px */
  recipientRepresentative: { xMm: 30.96, yMm: 71.97 },
  /** 敬称 x=353, y=272 px */
  honorific: { xMm: 93.4, yMm: 71.97 },
  /** リード文 x=117, y=326 px */
  lead: { xMm: 30.96, yMm: 86.25 },
  /** 見積金額 x=301, y=407 px */
  amount: { xMm: 79.64, yMm: 107.69 },
  /** 金額末尾記号 x=756, y=407 px */
  amountSuffix: { xMm: 200.02, yMm: 107.69 },
  /** 税注記 x=386, y=452 px */
  taxNote: { xMm: 102.13, yMm: 119.59 },
  /** 有効期限 x=764, y=452 px */
  validityPeriod: { xMm: 202.14, yMm: 119.59 },
  /** 工事件名 x=125, y=492 px */
  projectName: { xMm: 33.07, yMm: 130.17 },
  /** 工事場所 x=125, y=524 px */
  siteAddress: { xMm: 33.07, yMm: 138.64 },
  /** 別途工事 見出し x=129, y=560 px */
  separateWorksHeading: { xMm: 34.13, yMm: 148.17 },
  /** 別途工事 ①〜⑤ x=200, y=586 / 618 / 649 / 680 / 714 px */
  separateWorks: {
    xMm: 52.92,
    yMm: [155.05, 163.51, 171.71, 179.92, 188.91] as readonly number[],
  },
  /** 自社 社名 x=646, y=531 px */
  companyName: { xMm: 170.92, yMm: 140.49 },
  /** 自社 代表者 x=702, y=578 px */
  companyRepresentative: { xMm: 185.74, yMm: 152.93 },
  /** 自社 住所 x=673, y=639 px（参照PDFの郵便番号行 y=616 px は 51.14 により出力しない） */
  companyAddress: { xMm: 178.06, yMm: 169.07 },
  /** 自社 TEL x=748, y=662 px */
  companyPhone: { xMm: 197.91, yMm: 175.15 },
  /** 自社 FAX x=748, y=680 px */
  companyFax: { xMm: 197.91, yMm: 179.92 },
} as const;

/** 網掛けの塗り色 RGB(192,192,192)（pdf-format-reference.md §3） */
const SHADING_COLOR = { red: 192, green: 192, blue: 192 } as const;

/** 罫線の色（§3「黒枠線あり」） */
const LINE_COLOR = { red: 0, green: 0, blue: 0 } as const;

/** 塗りつぶし＋枠線 */
const RECT_STYLE_FILL_AND_STROKE = 'FD';

/** 枠線のみ */
const RECT_STYLE_STROKE = 'S';

// ============================================================================
// 固定文言
// ============================================================================

/** 全角スペース。表題の字間に用いる（§3「1文字ずつ全角スペース区切り」） */
const IDEOGRAPHIC_SPACE = '　';

/** リード文（51.5） */
const LEAD_TEXT = '下記のとおり御見積申し上げます。';

/** 見積金額の前置き（§3 の実例 ` 御見積金額 ￥…`） */
const AMOUNT_PREFIX = ' 御見積金額 ￥';

/** 見積金額の後置き（§3 の実例は前後に空白を持つ） */
const AMOUNT_SUFFIX_SPACE = ' ';

/** 金額末尾記号（§3） */
const AMOUNT_TRAILING_MARK = '.- ';

/** 消費税を含まない旨の注記（51.7） */
const TAX_NOTE_TEXT = '上記見積金額に消費税は含んでおりません。';

/** 有効期限の前置き（51.8 / §3） */
const VALIDITY_PREFIX = '（見積有効期限：';

/** 有効期限の後置き */
const VALIDITY_SUFFIX = '）';

/** 敬称（51.4） */
const HONORIFIC_TEXT = '様';

/** 工事件名の見出し（51.9） */
const PROJECT_NAME_LABEL = '工事件名：';

/** 工事場所の見出し（51.10） */
const SITE_ADDRESS_LABEL = '工事場所：';

/** 別途工事の見出し（51.11） */
const SEPARATE_WORKS_HEADING = '別途工事';

/** 別途工事の記載欄の番号（51.11 / §3 の `①`〜`⑤`） */
const SEPARATE_WORK_MARKS = ['①', '②', '③', '④', '⑤'] as const;

/** 電話番号の見出し（§3 の実例 `TEL．…`） */
const PHONE_LABEL = 'TEL．';

/** FAX番号の見出し（§3 の実例 `FAX．…`） */
const FAX_LABEL = 'FAX．';

/** ページ番号の前置き（§3 の実例 `Page.1`） */
const PAGE_NUMBER_PREFIX = 'Page.';

// ============================================================================
// 文字列の組み立て
// ============================================================================

/**
 * 1文字ずつ全角スペースで区切る
 *
 * 表題にのみ適用する。§3 は表題と自社社名の双方を「1文字ずつ全角スペース区切り」と
 * 記録しているが、**適用するのは表題だけ**とした。表題は 51.1 が定める固定の文言で
 * 紙面上の見え方まで本システムが決められるのに対し、社名は 51.13 により
 * 自社情報登録機能に登録された文字列をそのまま出力すべき利用者のデータであり、
 * 字間を挿入すると登録内容と異なる表記になるため。
 *
 * 区切り文字は §3 の散文（「全角スペース区切り」）に従い U+3000 とする。
 * 同書の実例のバイトは半角空白だが、56.1 が全角カンマで採ったのと同じ判断
 * （散文が権威、実例のバイトは転記産物）を踏襲する。
 */
function spaceOutCharacters(text: string): string {
  return [...text].join(IDEOGRAPHIC_SPACE);
}

/** 未登録・未入力を空欄として扱う（51.15, 54.7） */
function orBlank(value: string | null): string {
  return value ?? '';
}

/** `YYYY-MM-DD` の形式 */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 提出日を全角数字の表記へ変換する（51.2, 53.9, 54.7）
 *
 * 未入力および日付として解釈できない文字列は空欄とし、例外を送出しない。
 * `new Date('YYYY-MM-DD')` は UTC 解釈になり地域によって前日へずれるため、
 * 年月日を取り出してローカル日付として組み立てる。存在しない日付
 * （`2026-02-31` など）は `Date` が繰り上げてしまうので、組み立て後に照合して弾く。
 */
function formatSubmissionDate(value: string | null): string {
  if (value === null) {
    return '';
  }
  const matched = ISO_DATE_PATTERN.exec(value);
  if (matched === null) {
    return '';
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '';
  }

  return toFullWidthDate(date);
}

/** 見出し付きの欄。値が無くても見出しは残す（51.15, 54.7 の「該当欄を空欄として出力」） */
function labeled(label: string, value: string | null): string {
  return `${label}${orBlank(value)}`;
}

// ============================================================================
// 描画
// ============================================================================

/** フォントサイズを切り替えてから1行描画する */
function drawText(
  doc: CoverPdfDocument,
  position: { readonly xMm: number; readonly yMm: number },
  fontSize: number,
  text: string
): void {
  doc.setFontSize(fontSize);
  doc.text(text, position.xMm, position.yMm);
}

/** 用紙の外枠（§3 外枠） */
function drawOuterFrame(doc: CoverPdfDocument): void {
  const { xMm, yMm, widthMm, heightMm, lineWidthMm } = COVER_LAYOUT.outerFrame;
  doc.setDrawColor(LINE_COLOR.red, LINE_COLOR.green, LINE_COLOR.blue);
  doc.setLineWidth(lineWidthMm);
  doc.rect(xMm, yMm, widthMm, heightMm, RECT_STYLE_STROKE);
}

/** 表題と網掛けの枠（51.1） */
function drawTitle(doc: CoverPdfDocument): void {
  const box = COVER_LAYOUT.titleBox;
  doc.setFillColor(SHADING_COLOR.red, SHADING_COLOR.green, SHADING_COLOR.blue);
  doc.setDrawColor(LINE_COLOR.red, LINE_COLOR.green, LINE_COLOR.blue);
  doc.setLineWidth(REPORT_GRID.borderThinMm);
  doc.rect(box.xMm, box.yMm, box.widthMm, box.heightMm, RECT_STYLE_FILL_AND_STROKE);

  drawText(
    doc,
    COVER_LAYOUT.title,
    REPORT_FONT_SIZES.coverTitle,
    spaceOutCharacters(COVER_PAGE_TITLE)
  );
}

/** 宛先・代表者名・敬称（51.3, 51.4, 51.15） */
function drawRecipient(doc: CoverPdfDocument, subject: EstimateCoverSubject): void {
  drawText(
    doc,
    COVER_LAYOUT.recipientName,
    REPORT_FONT_SIZES.coverRecipient,
    orBlank(subject.customer.name)
  );

  // 51.4 は代表者名が登録されている場合にのみ代表者名と敬称を出力すると定める。
  // 未登録時に敬称だけが残ると宛名として誤りになるため、両方を出力しない。
  const representativeName = subject.customer.representativeName;
  if (representativeName === null || representativeName === '') {
    return;
  }
  drawText(
    doc,
    COVER_LAYOUT.recipientRepresentative,
    REPORT_FONT_SIZES.coverRecipient,
    representativeName
  );
  drawText(doc, COVER_LAYOUT.honorific, REPORT_FONT_SIZES.coverRecipient, HONORIFIC_TEXT);
}

/**
 * 見積金額・税注記・有効期限（51.6, 51.7, 51.8）
 *
 * **51.6「他の項目より大きな文字」の解釈**: 参照PDF §8 のフォントサイズ表では
 * 表題（25pt）と自社社名（22pt）が見積金額（20pt）より大きい。よって「他の項目」を
 * 紙面上のすべての文字列とは解さず、**見積の内容を成す項目**（宛先14 / 税注記13 /
 * リード文・工事件名・工事場所12 / 別途工事11 / 提出日・有効期限・自社連絡先10）と解した。
 * 表題は書類の名称、社名は差出人の署名であり、いずれも見積の内容ではない。
 * 単体テストはこの解釈を「表題と社名を除く全項目より厳密に大きい」として固定している。
 */
function drawAmount(doc: CoverPdfDocument, subject: EstimateCoverSubject): void {
  const amountText = `${AMOUNT_PREFIX}${toFullWidthMoney(subject.totalAmount)}${AMOUNT_SUFFIX_SPACE}`;
  drawText(doc, COVER_LAYOUT.amount, REPORT_FONT_SIZES.coverAmount, amountText);
  drawText(doc, COVER_LAYOUT.amountSuffix, REPORT_FONT_SIZES.coverAmount, AMOUNT_TRAILING_MARK);

  drawText(doc, COVER_LAYOUT.taxNote, REPORT_FONT_SIZES.coverTaxNote, TAX_NOTE_TEXT);
  drawText(
    doc,
    COVER_LAYOUT.validityPeriod,
    REPORT_FONT_SIZES.tableBody,
    `${VALIDITY_PREFIX}${orBlank(subject.reportFields.validityPeriod)}${VALIDITY_SUFFIX}`
  );
}

/** 工事件名・工事場所（51.9, 51.10, 51.15） */
function drawProject(doc: CoverPdfDocument, subject: EstimateCoverSubject): void {
  drawText(
    doc,
    COVER_LAYOUT.projectName,
    REPORT_FONT_SIZES.coverLead,
    labeled(PROJECT_NAME_LABEL, subject.project.name)
  );
  drawText(
    doc,
    COVER_LAYOUT.siteAddress,
    REPORT_FONT_SIZES.coverLead,
    labeled(SITE_ADDRESS_LABEL, subject.project.siteAddress)
  );
}

/**
 * 別途工事の記載欄（51.11, 54.7）
 *
 * 入力件数に関わらず**常に5行**の番号付き欄を出力する。入力が5件に満たない行は
 * 番号のみとなる（参照PDFの ②〜⑤ と同じ）。5件を超える入力は先頭5件のみを出力する
 * （54.1 が入力上限を5件と定めており、帳票側の欄も5行が上限であるため）。
 */
function drawSeparateWorks(doc: CoverPdfDocument, subject: EstimateCoverSubject): void {
  drawText(
    doc,
    COVER_LAYOUT.separateWorksHeading,
    REPORT_FONT_SIZES.coverLead,
    SEPARATE_WORKS_HEADING
  );

  SEPARATE_WORK_MARKS.forEach((mark, index) => {
    const content = subject.reportFields.separateWorks[index] ?? '';
    drawText(
      doc,
      { xMm: COVER_LAYOUT.separateWorks.xMm, yMm: COVER_LAYOUT.separateWorks.yMm[index]! },
      REPORT_FONT_SIZES.coverAdditionalWork,
      `${mark}${content}`
    );
  });
}

/**
 * 自社情報（51.12, 51.13, 51.14）
 *
 * 会社名・代表者・住所・電話番号・FAX番号の**5行のみ**を出力する。
 * 参照PDF §3 は住所の上に郵便番号の行（x=673, y=616 px）を持つが、
 * 51.14 により独立した行としては出力しない。住所文字列に郵便番号が含まれる場合は
 * 住所行の一部としてそのまま出力される。
 */
function drawCompany(doc: CoverPdfDocument, company: CompanyInfoSnapshot): void {
  drawText(
    doc,
    COVER_LAYOUT.companyName,
    REPORT_FONT_SIZES.coverCompanyName,
    orBlank(company.companyName)
  );
  drawText(
    doc,
    COVER_LAYOUT.companyRepresentative,
    REPORT_FONT_SIZES.coverRecipient,
    orBlank(company.representative)
  );
  drawText(doc, COVER_LAYOUT.companyAddress, REPORT_FONT_SIZES.tableBody, orBlank(company.address));
  drawText(
    doc,
    COVER_LAYOUT.companyPhone,
    REPORT_FONT_SIZES.tableBody,
    labeled(PHONE_LABEL, company.phone)
  );
  drawText(
    doc,
    COVER_LAYOUT.companyFax,
    REPORT_FONT_SIZES.tableBody,
    labeled(FAX_LABEL, company.fax)
  );
}

/**
 * 表紙1ページを描画する
 *
 * 描画対象（宛先・工事情報・自社情報・帳票用入力項目・見積金額）はすべて `subject` で
 * 受け取り、本関数は取得も計算も行わない。未登録・未入力の項目は空欄として描画し、
 * 例外を送出せず描画を最後まで続ける（51.15, 54.7）。
 *
 * `page` に表紙以外のページ、または見積金額以外の行タイプのページを渡した場合は
 * `RangeError` を送出する。51.16 は表紙を見積金額のファイルにのみ適用すると定めており、
 * 誤った呼び出しを黙って描画すると**実行金額・業者金額のファイルに表紙が混入した状態で
 * 静かに出荷される**ため（56.1 の `levelSymbol` と同じ流儀）。
 *
 * Requirements: 51.1〜51.16, 54.7
 */
export function drawCoverPage(
  doc: CoverPdfDocument,
  page: ReportPage,
  subject: EstimateCoverSubject
): void {
  if (page.kind !== 'cover') {
    throw new RangeError(
      `drawCoverPage: 表紙ページ以外は描画できません: kind=${page.kind}（51.16）`
    );
  }
  if (page.lineType !== 'ESTIMATE') {
    throw new RangeError(
      `drawCoverPage: 表紙は見積金額のファイルにのみ適用します: lineType=${page.lineType}（51.16）`
    );
  }

  drawOuterFrame(doc);
  drawTitle(doc);

  drawText(
    doc,
    COVER_LAYOUT.pageNumber,
    REPORT_FONT_SIZES.tableBody,
    `${PAGE_NUMBER_PREFIX}${page.pageNumber}`
  );
  drawText(
    doc,
    COVER_LAYOUT.submissionDate,
    REPORT_FONT_SIZES.tableBody,
    formatSubmissionDate(subject.reportFields.submissionDate)
  );

  drawRecipient(doc, subject);
  drawText(doc, COVER_LAYOUT.lead, REPORT_FONT_SIZES.coverLead, LEAD_TEXT);
  drawAmount(doc, subject);
  drawProject(doc, subject);
  drawSeparateWorks(doc, subject);
  drawCompany(doc, subject.company);
}
