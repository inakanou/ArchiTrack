/**
 * @fileoverview estimateReportLayout（帳票のレイアウト定数と値の表記規則）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 22.10: 帳票出力における数量・単価・金額の表記を Requirement 53 に従って構成する
 *   （画面表示は Requirement 22、帳票は Requirement 53）
 * - 41.12: 値引き行を名称欄に「【値引】」と表示し、金額を負数のまま出力する
 * - 52.2: 表の列を左から「名称」「規格」「単位」「数量」「単価」「金額」「備考」の7列とする
 * - 53.1: 数量を小数第1位まで表示し、小数点の位置を列内で揃えて出力する
 * - 53.2: 数量が整数の場合、小数部を空白として出力する
 * - 53.3: 単価と金額を3桁区切りのカンマ付き整数で右揃えに出力する
 * - 53.4: 単価または金額が未設定またはゼロの場合、当該欄を空欄として出力する
 * - 53.5: 金額が負数の場合、先頭にマイナス記号を付けて出力する
 * - 53.6: ある行の単位が直前の行の単位と同一の場合、繰り返し記号「〃」を出力する
 * - 53.7: 内訳書と明細書における第1階層の項目に階層記号を付けて出力する
 * - 53.8: 表紙の見積金額を全角数字と全角カンマで出力する
 * - 53.9: 表紙の提出日を全角数字で出力する
 *
 * 期待値は `pdf-format-reference.md`（参照実案件PDFの実測）に由来する固定値である。
 * 寸法は同書 §1 / §4 / §8 の px 実測値を本テスト内で独立に mm 換算して突き合わせる
 * （実装側は mm の literal を持つため、換算式を共有しない）。
 *
 * Design: design.md `#### Frontend Export` > `##### estimateReportLayout`
 */

import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';

import { EstimateCalculator } from '../../utils/estimate-calculation';

import {
  REPORT_GRID,
  REPORT_FONT_SIZES,
  DISCOUNT_ROW_LABEL,
  UNIT_REPEAT_MARK,
  formatQuantity,
  formatMoney,
  formatUnit,
  levelSymbol,
  toFullWidthMoney,
  toFullWidthDate,
} from './estimateReportLayout';

/**
 * 参照PDFの論理座標（96dpi px）→ mm。
 * pdf-format-reference.md「座標系の読み方」の 0.264583 を本テストが独立に持つ。
 */
const MM_PER_PX = 0.264583;
const mm = (px: number): number => px * MM_PER_PX;

describe('estimateReportLayout - レイアウト定数', () => {
  describe('用紙（50.1 / pdf-format-reference §1）', () => {
    it('A4横（297mm × 210mm）である', () => {
      expect(REPORT_GRID.paper.widthMm).toBe(297);
      expect(REPORT_GRID.paper.heightMm).toBe(210);
    });
  });

  describe('列構成（52.2 / pdf-format-reference §4）', () => {
    it('左から名称・規格・単位・数量・単価・金額・備考の7列である', () => {
      expect(REPORT_GRID.columns.map((column) => column.key)).toEqual([
        'name',
        'spec',
        'unit',
        'quantity',
        'unitPrice',
        'amount',
        'remarks',
      ]);
      expect(REPORT_GRID.columns.map((column) => column.label)).toEqual([
        '名称',
        '規格',
        '単位',
        '数量',
        '単価',
        '金額',
        '備考',
      ]);
    });

    it('数量・単価・金額を右揃え、単位を中央揃え、名称・規格・備考を左揃えとする', () => {
      const alignByKey = Object.fromEntries(
        REPORT_GRID.columns.map((column) => [column.key, column.align])
      );
      expect(alignByKey).toEqual({
        name: 'left',
        spec: 'left',
        unit: 'center',
        quantity: 'right',
        unitPrice: 'right',
        amount: 'right',
        remarks: 'left',
      });
    });

    it('各列の幅が参照PDFの実測値と一致する', () => {
      const referenceWidthPx: Record<string, number> = {
        name: 279.9,
        spec: 207.8,
        unit: 60.5,
        quantity: 109.6,
        unitPrice: 109.8,
        amount: 117.1,
        remarks: 118.9,
      };
      for (const [key, widthPx] of Object.entries(referenceWidthPx)) {
        const column = REPORT_GRID.columns.find((candidate) => candidate.key === key);
        expect(column, `列 ${key} が定義されている`).toBeDefined();
        expect(column?.widthMm).toBeCloseTo(mm(widthPx), 1);
      }
    });

    it('左余白と表幅の合計が用紙内に収まり、右余白が左余白と釣り合う', () => {
      const tableWidthMm = REPORT_GRID.columns.reduce((sum, column) => sum + column.widthMm, 0);
      // 表全体 x 59.8 – 1063.4 px（pdf-format-reference §4）
      expect(REPORT_GRID.tableLeftMm).toBeCloseTo(mm(59.8), 1);
      expect(tableWidthMm).toBeCloseTo(mm(1003.6), 1);
      const rightMarginMm = REPORT_GRID.paper.widthMm - REPORT_GRID.tableLeftMm - tableWidthMm;
      expect(rightMarginMm).toBeGreaterThan(0);
      expect(rightMarginMm).toBeCloseTo(mm(1122.56 - 1063.4), 1);
    });
  });

  describe('行構成（52.5 / pdf-format-reference §4）', () => {
    it('1ページの明細行を17行とする', () => {
      expect(REPORT_GRID.detailRowsPerPage).toBe(17);
    });

    it('見出し行・明細行・合計行の高さが参照PDFの実測値と一致する', () => {
      expect(REPORT_GRID.headerRowHeightMm).toBeCloseTo(mm(33.9), 1);
      expect(REPORT_GRID.rowHeightMm).toBeCloseTo(mm(34.0), 1);
      expect(REPORT_GRID.totalRowHeightMm).toBeCloseTo(mm(33.1), 1);
    });

    it('表の上端から合計行の下端までが参照PDFの表の下端に一致する', () => {
      const bottomMm =
        REPORT_GRID.tableTopMm +
        REPORT_GRID.headerRowHeightMm +
        REPORT_GRID.rowHeightMm * REPORT_GRID.detailRowsPerPage +
        REPORT_GRID.totalRowHeightMm;
      // ヘッダ行上端 94.6px、表下端 739.8px（pdf-format-reference §4 横罫線）
      expect(REPORT_GRID.tableTopMm).toBeCloseTo(mm(94.6), 1);
      expect(bottomMm).toBeCloseTo(mm(739.8), 1);
      expect(bottomMm).toBeLessThan(REPORT_GRID.paper.heightMm);
    });

    it('テキストのベースラインを行の上罫線から一定量下げる', () => {
      expect(REPORT_GRID.textBaselineOffsetMm).toBeCloseTo(mm(21.5), 1);
      expect(REPORT_GRID.textBaselineOffsetMm).toBeLessThan(REPORT_GRID.rowHeightMm);
    });
  });

  describe('線の太さ（52.4 / pdf-format-reference §4）', () => {
    it('外枠・見出し区切りの線が内側の罫線より太い', () => {
      expect(REPORT_GRID.borderThinMm).toBeCloseTo(mm(0.8), 2);
      expect(REPORT_GRID.borderThickMm).toBeCloseTo(mm(1.76), 2);
      expect(REPORT_GRID.borderThickMm).toBeGreaterThan(REPORT_GRID.borderThinMm);
    });
  });

  describe('フォントサイズ（pdf-format-reference §8）', () => {
    it('用途ごとの実寸ptが参照PDFと一致する', () => {
      expect(REPORT_FONT_SIZES).toEqual({
        coverTitle: 25,
        coverCompanyName: 22,
        coverAmount: 20,
        tableTitle: 16,
        coverRecipient: 14,
        coverTaxNote: 13,
        coverLead: 12,
        coverAdditionalWork: 11,
        tableBody: 10,
      });
    });
  });
});

describe('estimateReportLayout - 数量の表記（53.1, 53.2）', () => {
  it('参照PDFの記入例をそのまま再現する', () => {
    // pdf-format-reference §7:「`1     ` / `612     ` / `343.1   ` / `53.7   `」
    expect(formatQuantity(new Decimal(1))).toBe('1     ');
    expect(formatQuantity(new Decimal(612))).toBe('612     ');
    expect(formatQuantity(new Decimal('343.1'))).toBe('343.1   ');
    expect(formatQuantity(new Decimal('53.7'))).toBe('53.7   ');
  });

  it('整数は小数部を空白とし、小数点付きでも小数点なしでもない', () => {
    const rendered = formatQuantity(new Decimal(5));
    expect(rendered).toBe('5     ');
    expect(rendered).not.toBe('5');
    expect(rendered).not.toBe('5.0');
  });

  it('整数と小数で小数点の位置（右端からの文字数）が揃う', () => {
    const fraction = formatQuantity(new Decimal('343.1'));
    const integer = formatQuantity(new Decimal(1));
    const pointPositionFromEnd = fraction.length - fraction.indexOf('.');
    expect(pointPositionFromEnd).toBe(5);
    // 整数行の同じ位置は空白（小数部が空白で埋まっている）
    expect(integer.charAt(integer.length - pointPositionFromEnd)).toBe(' ');
    // 整数部の右端が両者で一致する（右揃えで描画したとき桁位置が揃う）
    expect(integer.length - integer.trimEnd().length).toBe(5);
    expect(fraction.length - fraction.trimEnd().length).toBe(3);
  });

  it('小数第2位を四捨五入して小数第1位に丸める', () => {
    // 2.45 は最近接偶数丸めなら 2.4 になるため、丸め方向を弁別できる
    expect(formatQuantity(new Decimal('2.45'))).toBe('2.5   ');
    expect(formatQuantity(new Decimal('2.44'))).toBe('2.4   ');
    // 丸めた結果が整数になる場合は小数部を空白とする
    expect(formatQuantity(new Decimal('2.96'))).toBe('3     ');
  });

  it('負数は絶対値で四捨五入し符号を保持する', () => {
    // -2.45 は正の無限大方向への丸めなら -2.4 になるため、丸め方向を弁別できる
    expect(formatQuantity(new Decimal('-2.45'))).toBe('-2.5   ');
    expect(formatQuantity(new Decimal(-8))).toBe('-8     ');
  });

  it('1未満の小数を整数部ゼロ付きで出力する', () => {
    expect(formatQuantity(new Decimal('0.5'))).toBe('0.5   ');
  });

  it('ゼロは空欄とせず 0 として出力する（53.4 の空欄規則は単価・金額のみ）', () => {
    expect(formatQuantity(new Decimal(0))).toBe('0     ');
  });

  it('未設定は空欄とする（注記行の数量欄）', () => {
    expect(formatQuantity(null)).toBe('');
  });

  it('画面表示の小数2桁固定（22.1）とは異なる表記である（22.10）', () => {
    expect(EstimateCalculator.formatQuantity('5')).toBe('5.00');
    expect(formatQuantity(new Decimal(5))).toBe('5     ');
  });
});

describe('estimateReportLayout - 単価・金額の表記（53.3, 53.4, 53.5）', () => {
  it('3桁区切りのカンマ付き整数で出力する', () => {
    // pdf-format-reference §5 / §6 の記入例
    expect(formatMoney(new Decimal(486304))).toBe('486,304');
    expect(formatMoney(new Decimal(2726170))).toBe('2,726,170');
    expect(formatMoney(new Decimal(8950))).toBe('8,950');
    expect(formatMoney(new Decimal(592))).toBe('592');
  });

  it('区切りの境界で桁区切りが入る', () => {
    expect(formatMoney(new Decimal(999))).toBe('999');
    expect(formatMoney(new Decimal(1000))).toBe('1,000');
    expect(formatMoney(new Decimal(999999))).toBe('999,999');
    expect(formatMoney(new Decimal(1000000))).toBe('1,000,000');
  });

  it('小数を小数第1位で四捨五入して整数にする', () => {
    expect(formatMoney(new Decimal('1234.5'))).toBe('1,235');
    expect(formatMoney(new Decimal('1234.4'))).toBe('1,234');
  });

  it('負数は先頭にマイナス記号を付ける（53.5）', () => {
    // pdf-format-reference §5 値引行の記入例
    expect(formatMoney(new Decimal(-48585))).toBe('-48,585');
    expect(formatMoney(new Decimal(-1234567))).toBe('-1,234,567');
    expect(formatMoney(new Decimal(-592))).toBe('-592');
  });

  it('負数も絶対値で四捨五入し符号を保持する', () => {
    expect(formatMoney(new Decimal('-1234.5'))).toBe('-1,235');
  });

  it('ゼロは空欄とする（53.4）', () => {
    expect(formatMoney(new Decimal(0))).toBe('');
    expect(formatMoney(new Decimal('0.00'))).toBe('');
  });

  it('丸めた結果がゼロになる値も空欄とする（53.4）', () => {
    expect(formatMoney(new Decimal('0.4'))).toBe('');
    expect(formatMoney(new Decimal('-0.4'))).toBe('');
  });

  it('未設定は空欄とする（53.4）', () => {
    expect(formatMoney(null)).toBe('');
  });

  it('ゼロ・未設定以外は空欄にしない', () => {
    expect(formatMoney(new Decimal(1))).toBe('1');
    expect(formatMoney(new Decimal(-1))).toBe('-1');
    expect(formatMoney(new Decimal('0.5'))).toBe('1');
  });
});

describe('estimateReportLayout - 単位の繰り返し記号（53.6）', () => {
  it('直前の行と同一の単位を繰り返し記号に置き換える', () => {
    expect(UNIT_REPEAT_MARK).toBe('〃');
    expect(formatUnit('式', '式')).toBe('〃');
    expect(formatUnit('m', 'm')).toBe('〃');
  });

  it('直前の行と異なる単位はそのまま出力する', () => {
    expect(formatUnit('m', '式')).toBe('m');
    expect(formatUnit('人工', 'm')).toBe('人工');
  });

  it('新しい表の先頭行（直前の行が無い）は単位をそのまま出力する', () => {
    // `previous` に null を渡すのは内訳書の先頭行と、別の第1階層の明細書の先頭行のみ
    expect(formatUnit('式', null)).toBe('式');
    expect(formatUnit('式', '')).toBe('式');
  });

  it('継続ページの先頭行は直前ページ最終行と同一単位なら繰り返し記号になる', () => {
    // design.md `##### estimateReportLayout`:「`〃` は直前の行に対して適用する。
    // 継続ページの先頭行でも直前ページ最終行と同一単位なら `〃` とする」
    const lastRowOfPreviousPage = '式';
    expect(formatUnit('式', lastRowOfPreviousPage)).toBe('〃');
    expect(formatUnit('m', lastRowOfPreviousPage)).toBe('m');
  });

  it('直前の行が単位を持たない場合（注記行の直後）は単位をそのまま出力する', () => {
    expect(formatUnit('式', null)).toBe('式');
    expect(formatUnit('m', '')).toBe('m');
  });

  it('単位を持たない行の単位欄は空欄とする（注記行）', () => {
    expect(formatUnit(null, '式')).toBe('');
    expect(formatUnit('', '式')).toBe('');
  });

  /** 行の並びを直前行との比較で順に整形する（描画側の呼び出し方を再現する） */
  const renderUnitRows = (units: readonly (string | null)[]): string[] => {
    let previous: string | null = null;
    return units.map((unit) => {
      const rendered = formatUnit(unit, previous);
      previous = unit;
      return rendered;
    });
  };

  it('連続する同一単位は2行目以降がすべて繰り返し記号になる', () => {
    // pdf-format-reference §5:「`式`（2行目以降は `〃`）」
    expect(renderUnitRows(['式', '式', '式', 'm', 'm'])).toEqual(['式', '〃', '〃', 'm', '〃']);
  });

  it('注記行を挟むと繰り返し記号にならず単位が再掲される', () => {
    expect(renderUnitRows(['式', null, '式'])).toEqual(['式', '', '式']);
  });
});

describe('estimateReportLayout - 階層記号（53.7）', () => {
  it('第1階層に全角英大文字を並び順で付ける', () => {
    // pdf-format-reference §5:「`Ａ`〜`Ｈ`」
    expect(levelSymbol(0, 0)).toBe('Ａ');
    expect(levelSymbol(1, 0)).toBe('Ｂ');
    expect(levelSymbol(7, 0)).toBe('Ｈ');
  });

  it('階層記号が半角英字ではない', () => {
    expect(levelSymbol(0, 0)).not.toBe('A');
    expect(levelSymbol(0, 0).codePointAt(0)).toBe(0xff21);
  });

  it('第2階層以降は記号を持たない', () => {
    expect(levelSymbol(0, 1)).toBe('');
    expect(levelSymbol(3, 1)).toBe('');
    expect(levelSymbol(0, 2)).toBe('');
    expect(levelSymbol(3, 5)).toBe('');
  });

  it('第1階層が26件を超えても記号が重複しない', () => {
    expect(levelSymbol(25, 0)).toBe('Ｚ');
    expect(levelSymbol(26, 0)).toBe('ＡＡ');
    expect(levelSymbol(27, 0)).toBe('ＡＢ');
    expect(levelSymbol(51, 0)).toBe('ＡＺ');
    expect(levelSymbol(52, 0)).toBe('ＢＡ');
    const symbols = Array.from({ length: 60 }, (_, index) => levelSymbol(index, 0));
    expect(new Set(symbols).size).toBe(60);
  });

  it('並び順が不正な場合は呼び出し側が検出できるよう例外を送出する', () => {
    // '' を返すと depth !== 0 の正当な「記号なし」と区別できず、
    // 呼び出し側のバグが第1階層の記号欠落として静かに出荷される
    expect(() => levelSymbol(-1, 0)).toThrow(RangeError);
    expect(() => levelSymbol(1.5, 0)).toThrow(RangeError);
    expect(() => levelSymbol(Number.NaN, 0)).toThrow(RangeError);
    // 第2階層以降でも握り潰さない（'' を返して見逃さない）
    expect(() => levelSymbol(-1, 1)).toThrow(RangeError);
    expect(() => levelSymbol(0, -1)).toThrow(RangeError);
    expect(() => levelSymbol(0, 1.5)).toThrow(RangeError);
  });

  it('正当な入力では例外を送出しない', () => {
    expect(() => levelSymbol(0, 0)).not.toThrow();
    expect(() => levelSymbol(0, 3)).not.toThrow();
  });
});

describe('estimateReportLayout - 表紙の全角表記（53.8, 53.9）', () => {
  it('見積金額を全角数字と全角カンマで出力する', () => {
    // pdf-format-reference §3:「￥１３,４２０,０００」の数値部。
    // 同書の実例はバイト列上は半角カンマ U+002C だが、同書の散文も requirements.md 53.8 も
    // 「全角カンマ」と定めており、承認階層上 requirements.md が権威（参照PDFは調査インプット）。
    // よって期待値は全角カンマ U+FF0C とする。
    expect(toFullWidthMoney(new Decimal(13420000))).toBe('１３，４２０，０００');
    expect(toFullWidthMoney(new Decimal(13420000)).codePointAt(2)).toBe(0xff0c);
  });

  it('見積金額に半角数字・半角カンマを含まない', () => {
    const rendered = toFullWidthMoney(new Decimal(13420000));
    expect(rendered).not.toMatch(/[0-9,]/);
    // 全角数字8文字 ＋ 全角カンマ2文字
    expect(rendered).toHaveLength(10);
  });

  it('見積金額を小数第1位で四捨五入した整数で出力する', () => {
    expect(toFullWidthMoney(new Decimal('1234.5'))).toBe('１，２３５');
  });

  it('見積金額がゼロの場合も表紙には金額を出力する（空欄にしない）', () => {
    expect(toFullWidthMoney(new Decimal(0))).toBe('０');
  });

  it('見積金額が負数の場合は全角のマイナス記号を先頭に付ける', () => {
    expect(toFullWidthMoney(new Decimal(-48585))).toBe('－４８，５８５');
  });

  it('提出日を全角数字で出力する', () => {
    // pdf-format-reference §3:「２０２６ 年５ 月１ 日」
    expect(toFullWidthDate(new Date(2026, 4, 1))).toBe('２０２６ 年５ 月１ 日');
  });

  it('月日が2桁の場合もゼロ埋めせず全角数字で出力する', () => {
    expect(toFullWidthDate(new Date(2026, 11, 25))).toBe('２０２６ 年１２ 月２５ 日');
  });

  it('提出日に半角数字を含まない', () => {
    expect(toFullWidthDate(new Date(2026, 4, 1))).not.toMatch(/[0-9]/);
  });
});

describe('estimateReportLayout - 値引き行の表記（41.12）', () => {
  it('名称欄の表示を「【値引】」とする', () => {
    expect(DISCOUNT_ROW_LABEL).toBe('【値引】');
  });

  it('金額を負数のまま出力する', () => {
    expect(formatMoney(new Decimal(-48585))).toBe('-48,585');
  });
});
