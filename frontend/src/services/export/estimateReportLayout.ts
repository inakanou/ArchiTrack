/**
 * @fileoverview estimateReportLayout - 帳票の寸法・列構成・行構成・値の表記規則
 *
 * 見積書帳票（内訳書・明細書・表紙）の紙面寸法と、数量・単価・金額・単位・階層記号の
 * 表記規則を単一の定数群・関数群として提供します。寸法と書式の出典は
 * `.kiro/specs/estimate-creation/pdf-format-reference.md`（実案件PDFの実測）です。
 *
 * **丸めとの責務分担**: 値そのものの丸め規則（Requirement 22）は
 * `domain/estimate/estimateCalculations` が単一の実装として所有します。本モジュールは
 * 「保持している値をどう紙面に書くか」（Requirement 53）だけを担当し、
 * 単価・金額の整数化は `roundMoney` を再利用します。数量については保持精度が小数2桁
 * （22.1 / `roundQuantity`）であるのに対し帳票の表示精度は小数第1位（53.1）と異なるため、
 * 本モジュールで表示精度への丸めのみを行います（丸め方向は 22 系と同じ
 * `ROUND_HALF_UP`＝絶対値で四捨五入し符号を保持する規則を踏襲）。
 *
 * 依存方向: `types` と `calculations` のみに依存し、`hooks` / `components` / `pages` /
 * `api` には依存しません（design.md `#### Dependency Direction`）。
 *
 * Requirements (estimate-creation):
 * - 22.10: 帳票出力における数量・単価・金額の表記を Requirement 53 に従って構成する
 * - 41.12: 値引き行を名称欄に「【値引】」と表示し、金額を負数のまま出力する
 * - 52.2: 表の列を左から「名称」「規格」「単位」「数量」「単価」「金額」「備考」の7列とする
 * - 53.1 / 53.2: 数量は小数第1位まで、小数点位置を列内で揃え、整数は小数部を空白とする
 * - 53.3 / 53.4 / 53.5: 単価・金額は3桁区切り整数の右揃え、未設定とゼロは空欄、負数は先頭に「-」
 * - 53.6: 直前の行と同一の単位は繰り返し記号「〃」に置き換える
 * - 53.7: 階層記号は第1階層のみに付ける
 * - 53.8 / 53.9: 表紙の見積金額と提出日は全角数字で表記する
 *
 * Design: design.md `#### Frontend Export` > `##### estimateReportLayout`
 *
 * @module services/export/estimateReportLayout
 */

import Decimal from 'decimal.js';

import { roundMoney } from '../../domain/estimate/estimateCalculations';

// ============================================================================
// 型定義（design.md `##### estimateReportLayout` の契約）
// ============================================================================

/** 表の列 */
export interface ReportColumn {
  readonly key: 'name' | 'spec' | 'unit' | 'quantity' | 'unitPrice' | 'amount' | 'remarks';
  /** 見出し行に出力する列名（52.7） */
  readonly label: string;
  readonly widthMm: number;
  readonly align: 'left' | 'center' | 'right';
}

/** 用紙・表組みの寸法 */
export interface ReportGrid {
  readonly paper: { readonly widthMm: number; readonly heightMm: number };
  /** 左から7列（52.2） */
  readonly columns: readonly ReportColumn[];
  /** 表の左端（用紙左端からの距離） */
  readonly tableLeftMm: number;
  /** 見出し行の上端（用紙上端からの距離） */
  readonly tableTopMm: number;
  /** 1ページあたりの明細行数（52.5） */
  readonly detailRowsPerPage: number;
  readonly headerRowHeightMm: number;
  readonly rowHeightMm: number;
  readonly totalRowHeightMm: number;
  /** 行の上罫線からテキストのベースラインまでの距離 */
  readonly textBaselineOffsetMm: number;
  /** 内側の罫線の太さ（52.3） */
  readonly borderThinMm: number;
  /** 外枠と見出し行の区切りの太さ（52.4） */
  readonly borderThickMm: number;
}

// ============================================================================
// レイアウト定数（pdf-format-reference.md §1 / §4 / §8）
// ============================================================================

/**
 * 用紙・列構成・行構成・線の太さ
 *
 * 数値は参照PDFの論理座標（96dpi px）を mm（px × 0.264583）へ換算した実測値。
 * 参照値: 列境界 59.8 / 339.7 / 547.5 / 608.0 / 717.6 / 827.4 / 944.5 / 1063.4 px、
 * 横罫線 94.6（見出し上端）〜739.8 px（表下端）、線幅 0.8 px と 1.76 px。
 *
 * Requirements: 50.1, 52.2, 52.3, 52.4, 52.5
 */
export const REPORT_GRID: ReportGrid = {
  paper: { widthMm: 297, heightMm: 210 },
  columns: [
    { key: 'name', label: '名称', widthMm: 74.06, align: 'left' },
    { key: 'spec', label: '規格', widthMm: 54.98, align: 'left' },
    { key: 'unit', label: '単位', widthMm: 16.01, align: 'center' },
    { key: 'quantity', label: '数量', widthMm: 29.0, align: 'right' },
    { key: 'unitPrice', label: '単価', widthMm: 29.05, align: 'right' },
    { key: 'amount', label: '金額', widthMm: 30.98, align: 'right' },
    { key: 'remarks', label: '備考', widthMm: 31.46, align: 'left' },
  ],
  tableLeftMm: 15.82,
  tableTopMm: 25.03,
  detailRowsPerPage: 17,
  headerRowHeightMm: 8.97,
  rowHeightMm: 9.0,
  totalRowHeightMm: 8.76,
  textBaselineOffsetMm: 5.69,
  borderThinMm: 0.212,
  borderThickMm: 0.466,
};

/**
 * 用途ごとのフォントサイズ（実寸pt）
 *
 * 出典: pdf-format-reference.md §8。
 */
export const REPORT_FONT_SIZES = {
  /** 表紙の表題「御見積書」 */
  coverTitle: 25,
  /** 表紙の自社社名 */
  coverCompanyName: 22,
  /** 表紙の見積金額 */
  coverAmount: 20,
  /** 内訳書・明細書の表題 */
  tableTitle: 16,
  /** 表紙の宛先・代表者 */
  coverRecipient: 14,
  /** 表紙の消費税注記 */
  coverTaxNote: 13,
  /** 表紙のリード文・工事件名・工事場所・別途工事見出し */
  coverLead: 12,
  /** 表紙の別途工事①〜⑤ */
  coverAdditionalWork: 11,
  /** 表の本文・見出し・ページ番号・自社連絡先 */
  tableBody: 10,
} as const;

/** 値引き行の名称欄の表示（41.12） */
export const DISCOUNT_ROW_LABEL = '【値引】';

/** 単位の繰り返しを示す記号（53.6） */
export const UNIT_REPEAT_MARK = '〃';

// ============================================================================
// 数量の表記（53.1, 53.2）
// ============================================================================

/** 帳票に表示する数量の小数桁数（53.1） */
const QUANTITY_DECIMAL_PLACES = 1;

/**
 * 小数部（`.9` の2文字）が無い行を埋める空白。
 * これにより整数行でも小数点の位置が列内で揃う（53.2）。
 */
const QUANTITY_EMPTY_FRACTION = '  ';

/**
 * 数量欄の右余白。
 *
 * 参照PDFの記入例（`1     ` / `612     ` / `343.1   ` / `53.7   `）は、いずれも
 * 「整数部 ＋ 小数部2文字分 ＋ 空白3文字」で構成されている。数量列の右端 717.6 px に対し
 * `1     `（6文字）が x=674、`612     `（8文字）が x=661 に置かれており、
 * 1文字あたり約7.3 px で右端に揃う。すなわちこの空白は文字幅を占める右余白であり、
 * 描画側は本関数の戻り値を列の右端に右揃えで置く。
 */
const QUANTITY_RIGHT_PADDING = '   ';

/**
 * 数量を帳票の表記に変換する
 *
 * 小数第1位まで表示し、整数は小数部を空白で埋めて小数点位置を列内で揃える。
 * 保持精度（小数2桁）から表示精度（小数第1位）への丸めは絶対値で四捨五入し符号を保持する。
 * 未設定（注記行など）は空欄とする。ゼロは 53.4 の空欄規則の対象外（単価・金額のみ）のため
 * `0` として出力する。
 *
 * Requirements: 22.10, 53.1, 53.2
 */
export function formatQuantity(value: Decimal | null): string {
  if (value === null) {
    return '';
  }

  const rounded = value.toDecimalPlaces(QUANTITY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  const text = rounded.toString();
  const pointIndex = text.indexOf('.');
  const integerPart = pointIndex === -1 ? text : text.slice(0, pointIndex);
  const fractionPart = pointIndex === -1 ? QUANTITY_EMPTY_FRACTION : text.slice(pointIndex);

  return `${integerPart}${fractionPart}${QUANTITY_RIGHT_PADDING}`;
}

// ============================================================================
// 単価・金額の表記（53.3, 53.4, 53.5）
// ============================================================================

/** 3桁区切りのカンマを挿入する（入力は符号なしの整数文字列） */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 単価・金額を帳票の表記に変換する
 *
 * 3桁区切りのカンマ付き整数とし、未設定とゼロは空欄、負数は先頭にマイナス記号を付ける。
 * 整数化は `estimateCalculations.roundMoney`（小数第1位で四捨五入・符号保持）を再利用する。
 *
 * Requirements: 22.10, 41.12, 53.3, 53.4, 53.5
 */
export function formatMoney(value: Decimal | null): string {
  if (value === null) {
    return '';
  }

  const rounded = roundMoney(value);
  if (rounded.isZero()) {
    return '';
  }

  const grouped = groupDigits(rounded.abs().toString());
  return rounded.isNegative() ? `-${grouped}` : grouped;
}

// ============================================================================
// 単位の繰り返し記号（53.6）
// ============================================================================

/** 単位の有無を判定する（未設定と空文字を「単位なし」とみなす） */
function hasUnit(unit: string | null): unit is string {
  return unit !== null && unit !== '';
}

/**
 * 単位を帳票の表記に変換する
 *
 * 直前の行と同一の単位は繰り返し記号「〃」に置き換える。比較対象は直前の行が
 * 保持している単位そのもの（「〃」に置換した後の表示ではない）であるため、
 * 同一単位が3行以上続く場合は2行目以降がすべて「〃」になる。
 *
 * **呼び出し規約**: `〃` は紙面のページ境界ではなく**直前の行**に対して適用する
 * （design.md `#### Frontend Export` > `##### estimateReportLayout` の Implementation Notes）。
 * したがって同一階層が複数ページに分かれた**継続ページの先頭行では、直前ページ最終行の
 * 単位を `previous` に渡す**（同一なら `〃` になる）。`previous` に `null` を渡すのは、
 * 新しい表の先頭行――内訳書の先頭行、および別の第1階層に対応する明細書の先頭行――に限る。
 * 直前の行が単位を持たない場合（注記行の直後など）も同一とはみなさず、単位をそのまま出力する。
 *
 * Requirements: 53.6
 */
export function formatUnit(current: string | null, previous: string | null): string {
  if (!hasUnit(current)) {
    return '';
  }
  // 空でない `current` は `null` とも空文字とも一致しないため、この分岐は下の比較と
  // 同じ結果になる（＝この分岐の除去は等価変異）。53.6 の「直前の行が無い / 単位を持たない
  // 場合は繰り返さない」という意図を明示するために残している。
  if (!hasUnit(previous)) {
    return current;
  }
  return current === previous ? UNIT_REPEAT_MARK : current;
}

// ============================================================================
// 階層記号（53.7）
// ============================================================================

/** 全角英大文字「Ａ」のコードポイント */
const FULL_WIDTH_UPPER_A = 0xff21;

/** 英大文字の数 */
const ALPHABET_LENGTH = 26;

/**
 * 階層記号を返す
 *
 * 第1階層（`depth === 0`）のみ、並び順に対応する全角英大文字を返す。
 * 第2階層以降は記号を持たない。
 * 第1階層が26件を超える場合は「ＡＡ」「ＡＢ」…と桁を増やして記号の重複を避ける
 * （参照PDFには 26 件超の実例が無いため本モジュールで規則を確定させる）。
 *
 * `index` / `depth` に非負整数以外を渡した場合は `RangeError` を送出する。
 * 「記号なし」を表す空文字を返してしまうと、呼び出し側の指定ミスが
 * 第2階層以降の正当な戻り値と区別できず、**第1階層の記号欠落として静かに出荷される**ため。
 *
 * Requirements: 53.7
 */
export function levelSymbol(index: number, depth: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`levelSymbol: index は0以上の整数である必要があります: ${index}`);
  }
  if (!Number.isInteger(depth) || depth < 0) {
    throw new RangeError(`levelSymbol: depth は0以上の整数である必要があります: ${depth}`);
  }
  if (depth !== 0) {
    return '';
  }

  let remaining = index + 1;
  let symbol = '';
  while (remaining > 0) {
    const position = (remaining - 1) % ALPHABET_LENGTH;
    symbol = String.fromCodePoint(FULL_WIDTH_UPPER_A + position) + symbol;
    remaining = Math.floor((remaining - 1) / ALPHABET_LENGTH);
  }
  return symbol;
}

// ============================================================================
// 表紙の全角表記（53.8, 53.9）
// ============================================================================

/** 全角数字「０」のコードポイント */
const FULL_WIDTH_ZERO = 0xff10;

/**
 * 全角カンマ（U+FF0C）
 *
 * 参照PDF（pdf-format-reference.md `:66` / `:205`）の実例
 * `￥１３,４２０,０００` は**バイト列上は半角カンマ U+002C** だが、
 * 同書の散文も requirements.md 53.8 も「全角カンマ」と定めており、
 * 承認階層上 requirements.md が権威（参照PDFは調査インプット）であるため
 * 全角カンマを採る。実例のバイトは転記産物と判断した。
 */
const FULL_WIDTH_COMMA = '，';

/** 全角マイナス記号 */
const FULL_WIDTH_MINUS = '－';

/** 半角の数字・カンマ・マイナス記号を全角へ変換する */
function toFullWidth(text: string): string {
  let converted = '';
  for (const character of text) {
    if (character >= '0' && character <= '9') {
      converted += String.fromCodePoint(
        FULL_WIDTH_ZERO + (character.codePointAt(0)! - '0'.codePointAt(0)!)
      );
    } else if (character === ',') {
      converted += FULL_WIDTH_COMMA;
    } else if (character === '-') {
      converted += FULL_WIDTH_MINUS;
    } else {
      converted += character;
    }
  }
  return converted;
}

/**
 * 表紙の見積金額を全角数字と全角カンマで表記する
 *
 * 3桁区切りの整数とし、負数は全角のマイナス記号を先頭に付ける。
 * 53.4 の「ゼロは空欄」は表の単価欄・金額欄の規則であり表紙には適用しないため、
 * ゼロは「０」として出力する。
 *
 * Requirements: 53.8
 */
export function toFullWidthMoney(value: Decimal): string {
  const rounded = roundMoney(value);
  const grouped = groupDigits(rounded.abs().toString());
  const signed = rounded.isNegative() ? `-${grouped}` : grouped;
  return toFullWidth(signed);
}

/**
 * 表紙の提出日を全角数字で表記する
 *
 * 参照PDFの表記（`２０２６ 年５ 月１ 日`）に合わせ、数値と年月日の間に半角空白を置き、
 * 月日はゼロ埋めしない。
 *
 * Requirements: 53.9
 */
export function toFullWidthDate(date: Date): string {
  const year = toFullWidth(String(date.getFullYear()));
  const month = toFullWidth(String(date.getMonth() + 1));
  const day = toFullWidth(String(date.getDate()));
  return `${year} 年${month} 月${day} 日`;
}
