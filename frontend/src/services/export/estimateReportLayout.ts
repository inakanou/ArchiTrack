/**
 * @fileoverview estimateReportLayout - 帳票の寸法・列構成・行構成・値の表記規則と構成の組み立て
 *
 * 見積書帳票（内訳書・明細書・表紙）の紙面寸法と、数量・単価・金額・単位・階層記号の
 * 表記規則を単一の定数群・関数群として提供します。寸法と書式の出典は
 * `.kiro/specs/estimate-creation/pdf-format-reference.md`（実案件PDFの実測）です。
 *
 * 併せて `buildFiles` が、編集中の明細ツリーから**行タイプごとのファイル構成**
 * （表紙の有無・ページ番号・内訳書ページ・明細書ページと継続ページ）を組み立てます。
 * PDF出力（56.6）と表計算出力（56.7）はこの構成を共有し、描画・書き出しだけを担います。
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
 * - 32.2 / 32.5 / 32.9: 行タイプごとに独立したファイルを生成し、未選択の行タイプは
 *   出力せず、ページ番号を各ファイル内の通し番号とする
 * - 38.2 / 38.3: 対象行タイプに値のない項目を省き、後続の項目を繰り上げる
 * - 38.4: 項目を省いた結果として明細行が0件になった階層の明細書ページを出力しない
 * - 41.8 / 41.12: 値引き行を名称欄に「【値引】」と表示し、金額を負数のまま出力・集計する
 * - 50.2 / 50.3 / 50.8 / 50.12: 見積金額のファイルのみ1ページ目を表紙とし、
 *   内訳書に第1階層の一覧を出力し、全ページに通し番号を付ける
 * - 50.4 / 50.5 / 50.6 / 50.7: 子項目を持つ項目ごとに明細書ページを深さ優先で出力し、
 *   子項目を持たない項目のページは出力しない
 * - 50.9 / 50.10: 明細行が1ページに収まらない場合は同じ表題と見出しで継続ページを出力し、
 *   合計行を最終ページにのみ置く
 * - 50.11: 明細書の各ページに当該階層の親項目名を割り当てる
 * - 51.16: 表紙を見積金額を出力対象とするファイルにのみ適用する
 * - 52.5: 1ページの表を見出し行1行・明細行17行・合計行1行で構成する
 * - 52.10: 合計行の名称欄に「【合計】」を出力する
 * - 52.11 / 52.12: 明細書ページの先頭行に親項目の階層記号と名称を置き、子項目を1段下げる
 * - 55.2: 注記行を金額の集計対象から除外する
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
import type {
  EditableItem,
  EditableLine,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';

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

// ============================================================================
// 帳票の構成（design.md `##### estimateReportLayout` の契約）
// ============================================================================

/**
 * 表の1行
 *
 * 各欄は**描画にそのまま渡せる完成した文字列**であり、`formatQuantity` /
 * `formatMoney` / `formatUnit` / `levelSymbol` の適用は本モジュールで済んでいる。
 * 描画側（56.4 / 56.5）は列位置・字間・列幅による打ち切り（52.13）だけを担い、
 * 値の表記規則（Requirement 53）を再実装してはならない。
 */
export interface ReportRow {
  /**
   * 行の種別
   *
   * - `item`: 通常の見積項目
   * - `note`: 注記行（名称欄のみを埋める / 55.1, 55.5）
   * - `discount`: 値引き行（名称欄は `DISCOUNT_ROW_LABEL` / 41.12）
   * - `total`: 合計行（52.10）
   */
  readonly kind: 'item' | 'note' | 'discount' | 'total';
  /** 名称欄。第1階層の項目は「階層記号 ＋ `.` ＋ 名称」（53.7） */
  readonly name: string;
  readonly specification: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly amount: string;
  readonly remarks: string;
  /**
   * 名称欄のインデント段数（52.12）
   *
   * 内訳書の行と明細書の親項目見出し行は 0、明細書の子項目は 1 以上。
   * 1段あたりの実際のずらし幅は描画側（56.5）が決める。
   */
  readonly indentLevel: number;
}

/**
 * 1ページ分の構成
 *
 * `kind` の `summary` が内訳書、`detail` が明細書に対応する。
 * 表紙（`cover`）は「そこに表紙を1ページ置く」ことだけを表す標識で、
 * 表紙に載せる宛先・工事情報・自社情報は出力サービス（56.6）が別途渡す。
 *
 * **継続ページ**（50.9）は同じ `kind` / `title` / `parentLabel` を持つ独立した `ReportPage`
 * として並ぶ。`rows` は当該ページに載る明細行だけを持ち、明細書の親項目見出し行（52.11）は
 * 階層の**先頭ページにのみ**含まれる。列名の見出し行（52.7）と、明細行が17行に満たない
 * ページの空行（52.6）は `rows` に含めず、描画側（56.4 / 56.5）が固定グリッドとして引く。
 */
export interface ReportPage {
  readonly kind: 'cover' | 'summary' | 'detail';
  readonly lineType: EstimateLineType;
  /** 所属ファイル内の通し番号。1 始まり（32.9, 50.8） */
  readonly pageNumber: number;
  /** 表題。内訳書・明細書は対象の行タイプを併記する（32.4） */
  readonly title: string;
  /** 明細書フッタの親項目名（50.11）。表紙・内訳書は `null` */
  readonly parentLabel: string | null;
  readonly rows: readonly ReportRow[];
  /** 合計行（52.10）。継続ページでは最終ページのみ非 `null`（50.10） */
  readonly totalRow: ReportRow | null;
}

/** 行タイプごとに1ファイル。見積のみ表紙を持つ（32.2, 50.2, 50.12, 51.16） */
export interface ReportFileSpec {
  readonly lineType: EstimateLineType;
  /** ファイル名に含める行タイプのラベル（32.6） */
  readonly fileNameLabel: string;
  /** `ESTIMATE` のみ `true`（50.2, 50.12, 51.16） */
  readonly hasCoverPage: boolean;
  readonly pages: readonly ReportPage[];
}

// ============================================================================
// 構成の定数
// ============================================================================

/**
 * ファイルを並べる順序（32.3）
 *
 * 呼び出し側が渡す `lineTypes` の順序に依らず、常に「見積」「実行」「業者」の順に返す。
 */
const LINE_TYPE_ORDER: readonly EstimateLineType[] = ['ESTIMATE', 'EXECUTION', 'VENDOR'];

/** ファイル名と表題に用いる行タイプのラベル（32.4, 32.6） */
const LINE_TYPE_LABEL: Readonly<Record<EstimateLineType, string>> = {
  ESTIMATE: '見積',
  EXECUTION: '実行',
  VENDOR: '業者',
};

/** 表紙の表題（51.1） */
export const COVER_PAGE_TITLE = '御見積書';

/** 内訳書の表題（52.8） */
const SUMMARY_PAGE_TITLE = '内訳書';

/** 明細書の表題（52.8） */
const DETAIL_PAGE_TITLE = '明細書';

/**
 * 合計行の名称欄の表示（52.10）
 *
 * 参照PDF（pdf-format-reference.md §5 / §6）の実例は `        【合  計】` だが、
 * 先頭の空白と字間は紙面上の配置であり、要件の文言は「【合計】」である。
 * `DISCOUNT_ROW_LABEL`（41.12）と同じ流儀で**論理的な文字列のみ**を持ち、
 * 字間と字下げは描画側（56.5）が担当する。
 *
 * 56.1 の Implementation Note はこのラベルを 56.3 の担当としていたが、
 * 内訳書にも合計行が必要（tasks.md 56.2「第1階層の一覧と合計を配置する」）なため
 * 本タスクで確定させる。**56.3 は再定義せず本定数を再利用すること。**
 */
export const TOTAL_ROW_LABEL = '【合計】';

/** 階層記号と名称の区切り（pdf-format-reference.md §5 / §6） */
const LEVEL_SYMBOL_SEPARATOR = '.';

/**
 * 「値を持つ」かの判定対象となる明細行の欄（38.2, 38.3）
 *
 * `id` / `lineType` は構造上の識別子、`sourceVendorName` は転記元の記録であり
 * 帳票に出力する欄ではないため、いずれも判定に含めない。
 */
const VALUE_FIELDS: readonly (keyof EditableLine)[] = [
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'amount',
  'remarks',
];

// ============================================================================
// 明細行の取り出しと値の有無（38.2, 38.3）
// ============================================================================

function lineOf(item: EditableItem, lineType: EstimateLineType): EditableLine | null {
  return item.lines.find((line) => line.lineType === lineType) ?? null;
}

function isFilled(value: string | null): value is string {
  return value !== null && value !== '';
}

/**
 * 見積項目が対象の行タイプに値を持つかを判定する
 *
 * 「値を持たない」とは、対象の行タイプの明細行が**存在しない**か、存在しても
 * 帳票に出力する7欄（名称・規格・単位・数量・単価・金額・備考）がすべて
 * 未設定または空文字であることを指す。ゼロは「値がある」（`'0'` は空文字ではない）。
 * 金額欄の空欄化は 53.4 の表記規則であって省略の理由ではないため、
 * 金額ゼロの項目は省かずに金額欄だけを空欄として出力する。
 *
 * この定義により、見積金額行しか持たない注記行（55.1）と値引き行（41.8）は
 * 実行金額・業者金額のファイルから省かれる。
 *
 * 親項目の金額は `estimateTree.recalculateAncestorAmounts` で子の合計に確定して
 * いるため、値を持つ子を抱えた親が本判定で省かれることはない。
 *
 * **呼び出し規約**: 56.3 の明細書ページの組み立ても、内訳書と同じ省略規則を
 * 適用するため本関数を用いること（規則を2箇所に書くと内訳書と明細書で
 * 省略対象がずれ、内訳書の合計と明細書の合計が食い違う）。
 *
 * Requirements: 38.2, 38.3
 */
export function hasValueForLineType(item: EditableItem, lineType: EstimateLineType): boolean {
  const line = lineOf(item, lineType);
  if (line === null) {
    return false;
  }
  return VALUE_FIELDS.some((field) => isFilled(line[field]));
}

// ============================================================================
// 行の組み立て
// ============================================================================

/** 10進数文字列を `Decimal` にする。未設定・空文字・解釈できない値は `null` */
function toDecimalOrNull(value: string | null): Decimal | null {
  if (!isFilled(value)) {
    return null;
  }
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

/** 名称欄の文字列を組み立てる（53.7, 41.12） */
function composeName(item: EditableItem, line: EditableLine, symbol: string): string {
  if (item.itemType === 'DISCOUNT') {
    return DISCOUNT_ROW_LABEL;
  }
  const name = line.name ?? '';
  return symbol === '' ? name : `${symbol}${LEVEL_SYMBOL_SEPARATOR}${name}`;
}

/**
 * 見積項目1件を表の1行へ変換する
 *
 * 注記行は名称欄以外を空欄とする（55.5）。構造上も注記行は名称しか持たないが
 * （55.1）、空欄化を組み立て側で確定させることで、直後の行の単位が
 * 「〃」にならないこと（53.6）が `previousUnit` の受け渡しだけで決まる。
 */
function buildItemRow(options: {
  readonly item: EditableItem;
  readonly line: EditableLine;
  readonly symbol: string;
  readonly indentLevel: number;
  readonly previousUnit: string | null;
}): ReportRow {
  const { item, line, symbol, indentLevel, previousUnit } = options;

  if (item.itemType === 'NOTE') {
    return {
      kind: 'note',
      name: line.name ?? '',
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: '',
      remarks: '',
      indentLevel,
    };
  }

  return {
    kind: item.itemType === 'DISCOUNT' ? 'discount' : 'item',
    name: composeName(item, line, symbol),
    specification: line.specification ?? '',
    unit: formatUnit(line.unit, previousUnit),
    quantity: formatQuantity(toDecimalOrNull(line.quantity)),
    unitPrice: formatMoney(toDecimalOrNull(line.unitPrice)),
    amount: formatMoney(toDecimalOrNull(line.amount)),
    remarks: line.remarks ?? '',
    indentLevel,
  };
}

/** 合計行を組み立てる（52.10） */
function buildTotalRow(total: Decimal): ReportRow {
  return {
    kind: 'total',
    name: TOTAL_ROW_LABEL,
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount: formatMoney(total),
    remarks: '',
    indentLevel: 0,
  };
}

// ============================================================================
// 出力対象の項目の列挙（38.2, 38.3, 53.7）
// ============================================================================

/** 出力対象として残った項目1件と、その階層記号 */
interface VisibleEntry {
  readonly item: EditableItem;
  /** 対象行タイプの明細行（`hasValueForLineType` が true の項目なので必ず存在する） */
  readonly line: EditableLine;
  /** 階層記号。第2階層以降と注記行・値引き行は空文字（53.7） */
  readonly symbol: string;
}

/**
 * 同一の親配下の項目から、対象の行タイプに値を持つものだけを階層記号付きで列挙する
 *
 * 内訳書（第1階層）と明細書（各階層の子項目）で**同じ列挙規則**を用いるための単一実装。
 * 省略の判定は `hasValueForLineType` に委ね、本関数で再実装しない（56.2 の呼び出し規約。
 * 規則を2箇所に書くと内訳書の合計と明細書の合計が食い違う）。
 *
 * `levelSymbol` には**同一親配下の連番**を渡す（56.1 の呼び出し規約）。`symbolIndex` は
 * 省略後の並びに対してのみ進むため、省略があっても記号に穴は空かない。注記行と値引き行は
 * 記号を持たず、記号の番号も消費しない（pdf-format-reference.md §5 の `Ａ`〜`Ｈ` ＋ `【値引】`）。
 *
 * Requirements: 38.2, 38.3, 53.7
 */
function visibleEntries(
  siblings: readonly EditableItem[],
  lineType: EstimateLineType,
  depth: number
): readonly VisibleEntry[] {
  const entries: VisibleEntry[] = [];
  let symbolIndex = 0;

  for (const item of siblings) {
    if (!hasValueForLineType(item, lineType)) {
      continue;
    }
    // `hasValueForLineType` が true を返した時点で当該行タイプの明細行は存在する
    const line = lineOf(item, lineType)!;
    const symbol = item.itemType === 'STANDARD' ? levelSymbol(symbolIndex, depth) : '';
    if (item.itemType === 'STANDARD') {
      symbolIndex += 1;
    }
    entries.push({ item, line, symbol });
  }

  return entries;
}

/**
 * 1つの表に並ぶ明細行と、その階層の合計金額を組み立てる
 *
 * 単位の繰り返し記号は**直前に出力された行**の単位に対して適用するため、省略された項目は
 * 連鎖に参加しない（38.2, 53.6）。注記行は単位を持たない扱いとして連鎖を断ち切る。
 * 合計は注記行を除く（55.2）行の金額の合計とし、値引き行の負数はそのまま加算する（41.8）。
 *
 * ページ分割は本関数の**後段**（`paginate`）で行う。すなわち `previous` の連鎖は
 * ページ境界に影響されず、継続ページの先頭行も直前ページ最終行と比較される
 * （design.md `##### estimateReportLayout` Implementation Notes / 53.6）。
 */
function buildRowSequence(
  entries: readonly VisibleEntry[],
  indentLevel: number
): { readonly rows: readonly ReportRow[]; readonly total: Decimal } {
  const rows: ReportRow[] = [];
  let previousUnit: string | null = null;
  let total = new Decimal(0);

  for (const { item, line, symbol } of entries) {
    rows.push(buildItemRow({ item, line, symbol, indentLevel, previousUnit }));
    previousUnit = item.itemType === 'NOTE' ? null : line.unit;

    if (item.itemType !== 'NOTE') {
      total = total.add(toDecimalOrNull(line.amount) ?? new Decimal(0));
    }
  }

  return { rows, total };
}

// ============================================================================
// ページ分割（50.9, 50.10, 52.5）
// ============================================================================

/** ページ番号を割り当てる前のページ構成 */
type ReportPageDraft = Omit<ReportPage, 'pageNumber'>;

/**
 * 明細行を1ページあたりの行数で区切る
 *
 * 行が1件も無い場合も空のページを1つ返す（内訳書は対象行タイプに値を持つ項目が
 * 1件も無くても表そのものは出力するため）。
 */
function chunkRows(rows: readonly ReportRow[], size: number): readonly (readonly ReportRow[])[] {
  if (rows.length === 0) {
    return [[]];
  }
  const chunks: (readonly ReportRow[])[] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}

/**
 * 1つの表をページへ割り付ける
 *
 * 明細行が1ページの上限（`REPORT_GRID.detailRowsPerPage` = 17行 / 52.5）を超える場合、
 * **同じ表題と見出し行**を持つ継続ページへ繰り越す（50.9）。見出し行（列名の行 / 52.7）は
 * 各ページに引かれる固定のグリッドであり、本モジュールが `rows` に含めることはない。
 *
 * 合計行は最終ページにのみ置く（50.10）。継続元のページでは `totalRow` を `null` とし、
 * 18行グリッドの最下段は罫線だけの空行として描画側（56.4 / 56.5）が引く（52.6）。
 */
function paginate(
  rows: readonly ReportRow[],
  total: Decimal,
  base: Omit<ReportPageDraft, 'rows' | 'totalRow'>
): readonly ReportPageDraft[] {
  const chunks = chunkRows(rows, REPORT_GRID.detailRowsPerPage);

  return chunks.map((chunk, index) => ({
    ...base,
    rows: chunk,
    totalRow: index === chunks.length - 1 ? buildTotalRow(total) : null,
  }));
}

// ============================================================================
// 内訳書ページの組み立て（50.3, 52.10）
// ============================================================================

/**
 * 内訳書ページを組み立てる
 *
 * 第1階層の項目だけを並べ（50.3）、対象の行タイプに値を持たない項目は省いて
 * 後続を繰り上げる（38.2）。子項目は明細書ページ側で扱うため含めない。
 *
 * 内訳書も明細書と**同一の表組み**（52.1）であり、1ページの明細行は17行（52.5）。
 * 第1階層が17件を超える場合は明細書と同じ規則で継続ページへ分ける（50.9, 50.10）。
 */
function buildSummaryPages(
  tree: readonly EditableItem[],
  lineType: EstimateLineType
): readonly ReportPageDraft[] {
  const { rows, total } = buildRowSequence(visibleEntries(tree, lineType, 0), 0);

  return paginate(rows, total, {
    kind: 'summary',
    lineType,
    title: `${SUMMARY_PAGE_TITLE}（${LINE_TYPE_LABEL[lineType]}）`,
    parentLabel: null,
  });
}

// ============================================================================
// 明細書ページの組み立て（50.4〜50.7, 50.9〜50.11, 52.11, 52.12, 38.4）
// ============================================================================

/** 明細書ページの先頭行（親項目の階層記号と名称のみ / 52.11） */
function buildHeadingRow(parent: VisibleEntry): ReportRow {
  return {
    kind: 'item',
    name: composeName(parent.item, parent.line, parent.symbol),
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount: '',
    remarks: '',
    indentLevel: 0,
  };
}

/**
 * 1つの親項目に対応する明細書ページを組み立てる（配下の孫階層は含まない）
 *
 * 子項目を持たない項目のページは生成せず（50.7）、対象の行タイプに値を持つ子が
 * 1件も残らなかった階層のページも生成しない（38.4）。
 *
 * 先頭行に親項目の階層記号と名称を置き（52.11）、子項目は1段下げる（52.12）。
 * 合計行の金額は**当該階層の子項目の合計**であり、親項目自身の金額は加算しない（52.10）。
 * 親項目名は各ページのフッタへ割り当てる（50.11）。
 */
function buildParentDetailPages(
  parent: VisibleEntry,
  lineType: EstimateLineType,
  depth: number
): readonly ReportPageDraft[] {
  const children = visibleEntries(parent.item.children, lineType, depth + 1);
  if (children.length === 0) {
    return [];
  }

  const headingRow = buildHeadingRow(parent);
  const { rows, total } = buildRowSequence(children, 1);

  return paginate([headingRow, ...rows], total, {
    kind: 'detail',
    lineType,
    title: `${DETAIL_PAGE_TITLE}（${LINE_TYPE_LABEL[lineType]}）`,
    parentLabel: headingRow.name,
  });
}

/**
 * 同一の親配下の項目を辿って明細書ページを深さ優先で並べる
 *
 * ある項目の明細書ページの直後に、その配下の階層の明細書ページを続ける（50.6）。
 * 階層の深さに関わらず、子項目を持つ項目ごとにページを出力する（50.5）。
 */
function buildDetailPages(
  siblings: readonly EditableItem[],
  lineType: EstimateLineType,
  depth: number
): readonly ReportPageDraft[] {
  const pages: ReportPageDraft[] = [];

  for (const entry of visibleEntries(siblings, lineType, depth)) {
    pages.push(...buildParentDetailPages(entry, lineType, depth));
    pages.push(...buildDetailPages(entry.item.children, lineType, depth + 1));
  }

  return pages;
}

// ============================================================================
// ファイルの組み立て（32.2, 32.5, 32.9, 50.2, 50.8, 50.12, 51.16）
// ============================================================================

/**
 * 出力対象の行タイプごとに帳票ファイルの構成を組み立てる
 *
 * - 行タイプ1つにつき独立したファイルを1つ生成する（32.2）。選択されていない
 *   行タイプのファイルは生成しない（32.5）。重複指定は1ファイルに畳む
 * - ファイルは指定順に依らず「見積」「実行」「業者」の順で返す（32.3）
 * - 見積金額のファイルのみ1ページ目を表紙とし（50.2, 51.16）、実行金額・
 *   業者金額のファイルは表紙を持たず1ページ目が内訳書になる（50.12）
 * - 内訳書は行タイプに依らず全ファイルに含める（50.3）
 * - 内訳書の次のページ以降を明細書とし、子項目を持つ項目ごとに改ページする（50.4）
 * - ページ番号は**各ファイル内**の1始まりの通し番号とする（32.9, 50.8）。
 *   継続ページ（50.9）も1ページとして番号を消費する
 *
 * Requirements: 32.2, 32.4, 32.5, 32.9, 38.2, 38.3, 38.4, 50.1〜50.12, 51.16, 52.5, 52.10, 52.11
 */
export function buildFiles(
  tree: readonly EditableItem[],
  lineTypes: readonly EstimateLineType[]
): readonly ReportFileSpec[] {
  const selected = LINE_TYPE_ORDER.filter((lineType) => lineTypes.includes(lineType));

  return selected.map((lineType) => {
    const hasCoverPage = lineType === 'ESTIMATE';
    const drafts: ReportPageDraft[] = [];

    if (hasCoverPage) {
      drafts.push({
        kind: 'cover',
        lineType,
        title: COVER_PAGE_TITLE,
        parentLabel: null,
        rows: [],
        totalRow: null,
      });
    }
    drafts.push(...buildSummaryPages(tree, lineType));
    drafts.push(...buildDetailPages(tree, lineType, 0));

    const pages: readonly ReportPage[] = drafts.map((draft, index) => ({
      ...draft,
      pageNumber: index + 1,
    }));

    return { lineType, fileNameLabel: LINE_TYPE_LABEL[lineType], hasCoverPage, pages };
  });
}
