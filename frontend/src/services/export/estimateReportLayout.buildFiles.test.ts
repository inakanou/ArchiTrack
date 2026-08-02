/**
 * @fileoverview estimateReportLayout.buildFiles（ファイル構成と内訳書ページの組み立て）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 32.2: チェックされた行タイプごとに独立したファイルを生成する
 * - 32.5: チェックされていない行タイプのファイルを出力しない
 * - 32.9: ページ番号を各ファイル内の通し番号とする
 * - 38.2: 出力対象の行タイプに値を持たない項目を省き、後続の項目を繰り上げる
 * - 38.3: 出力対象として選択された行タイプにデータが存在する項目のみを出力する
 * - 50.1: 帳票の用紙をA4横（297mm × 210mm）とする
 * - 50.2: 行タイプが見積金額の場合、1ページ目を表紙とする
 * - 50.3: 内訳書のページに第1階層の一覧を出力する
 * - 50.8: 全ページに通し番号を出力する
 * - 50.12: 行タイプが実行金額または業者金額の場合、表紙を出力せず1ページ目を内訳書とする
 * - 51.16: 表紙を見積金額を出力対象とするファイルにのみ適用する
 *
 * 併せて内訳書ページの構成が依存する既存規則を固定する:
 * 41.8（値引き行を負数のまま合計へ加算）、41.12（値引き行の名称欄）、
 * 52.10（合計行の名称欄と金額欄）、53.1〜53.7（数量・金額・単位・階層記号の表記）、
 * 55.2（注記行を合計から除外）。
 *
 * 期待値はすべて literal で書く。実装が用いる `formatQuantity` / `formatMoney` /
 * `formatUnit` / `levelSymbol` をアサーション側で呼ばないことで、
 * 「フォーマッタが no-op でも通るテスト」を避ける。
 *
 * Design: design.md `#### Frontend Export` > `##### estimateReportLayout`
 */

import { describe, it, expect } from 'vitest';

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';

import { buildFiles, hasValueForLineType } from './estimateReportLayout';

// ============================================================================
// フィクスチャ
// ============================================================================

/** 全欄が未設定の明細行。必要な欄だけを上書きして使う */
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
 * 参照PDF（pdf-format-reference.md §5）の内訳書を模した明細ツリー
 *
 * - `r1` 共通仮設工事: 見積・実行の両方に値を持ち、子項目を1件持つ
 * - `r2` 防水工事: 実行金額行は**存在するが全欄未設定**（38.2 の「値を持たない」）
 * - `r3` 注記行: 見積金額行のみ（55.1）
 * - `r4` 塗装工事: 見積・実行の両方に値を持ち、単位が `r2` と異なる
 * - `r5` 値引き行: 見積金額行のみ・負数（41.8, 41.12）
 */
function referenceTree(): readonly EditableItem[] {
  return [
    item({
      key: 'r1',
      lines: [
        line('ESTIMATE', {
          name: '共通仮設工事',
          unit: '式',
          quantity: '1',
          unitPrice: '486304',
          amount: '486304',
          remarks: '一式',
        }),
        line('EXECUTION', {
          name: '共通仮設工事',
          unit: '式',
          quantity: '1',
          unitPrice: '400000',
          amount: '400000',
        }),
      ],
      children: [
        item({
          key: 'r1c1',
          lines: [
            line('ESTIMATE', {
              name: '保安要員',
              specification: '仮設足場組立・解体時',
              unit: '人工',
              quantity: '10',
              unitPrice: '17500',
              amount: '175000',
            }),
          ],
        }),
      ],
    }),
    item({
      key: 'r2',
      lines: [
        line('ESTIMATE', {
          name: '防水工事',
          unit: '式',
          quantity: '1',
          unitPrice: '2726170',
          amount: '2726170',
        }),
        line('EXECUTION'),
      ],
    }),
    item({
      key: 'r3',
      itemType: 'NOTE',
      lines: [line('ESTIMATE', { name: '※ﾄｲﾚ・電力100V・水道水無償での御支給をお願いします。' })],
    }),
    item({
      key: 'r4',
      lines: [
        line('ESTIMATE', {
          name: '塗装工事',
          unit: '㎡',
          quantity: '343.1',
          unitPrice: '8950',
          amount: '3070745',
        }),
        line('EXECUTION', {
          name: '塗装工事',
          unit: '㎡',
          quantity: '343.1',
          unitPrice: '8000',
          amount: '2744800',
        }),
      ],
    }),
    item({
      key: 'r5',
      itemType: 'DISCOUNT',
      lines: [line('ESTIMATE', { amount: '-48585' })],
    }),
  ];
}

// ============================================================================
// ファイル構成（32.2, 32.5）
// ============================================================================

describe('buildFiles - ファイル構成', () => {
  it('チェックされた行タイプごとに独立したファイルを1つずつ返す（32.2）', () => {
    const files = buildFiles(referenceTree(), ['ESTIMATE', 'EXECUTION', 'VENDOR']);

    expect(files).toHaveLength(3);
    expect(files.map((file) => file.lineType)).toEqual(['ESTIMATE', 'EXECUTION', 'VENDOR']);
  });

  it('チェックされていない行タイプのファイルを返さない（32.5）', () => {
    const files = buildFiles(referenceTree(), ['VENDOR', 'ESTIMATE']);

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.lineType)).toEqual(['ESTIMATE', 'VENDOR']);
    expect(files.some((file) => file.lineType === 'EXECUTION')).toBe(false);
  });

  it('いずれの行タイプも選択されていない場合はファイルを返さない（32.5）', () => {
    expect(buildFiles(referenceTree(), [])).toEqual([]);
  });

  it('同じ行タイプが重複して渡されてもファイルは1つにする（32.2）', () => {
    const files = buildFiles(referenceTree(), ['EXECUTION', 'EXECUTION']);

    expect(files).toHaveLength(1);
    expect(files[0]!.lineType).toBe('EXECUTION');
  });

  it('ファイル名に含める行タイプのラベルを持つ（32.6）', () => {
    const files = buildFiles(referenceTree(), ['ESTIMATE', 'EXECUTION', 'VENDOR']);

    expect(files.map((file) => file.fileNameLabel)).toEqual(['見積', '実行', '業者']);
  });
});

// ============================================================================
// 表紙の有無（50.2, 50.12, 51.16）
// ============================================================================

describe('buildFiles - 表紙の有無', () => {
  it('見積金額のファイルは表紙を持ち1ページ目が表紙である（50.2, 51.16）', () => {
    const [file] = buildFiles(referenceTree(), ['ESTIMATE']);

    expect(file!.hasCoverPage).toBe(true);
    expect(file!.pages[0]!.kind).toBe('cover');
    expect(file!.pages[0]!.title).toBe('御見積書');
  });

  it('実行金額のファイルは表紙を持たず1ページ目が内訳書である（50.12, 51.16）', () => {
    const [file] = buildFiles(referenceTree(), ['EXECUTION']);

    expect(file!.hasCoverPage).toBe(false);
    expect(file!.pages.some((page) => page.kind === 'cover')).toBe(false);
    expect(file!.pages[0]!.kind).toBe('summary');
  });

  it('業者金額のファイルは表紙を持たず1ページ目が内訳書である（50.12, 51.16）', () => {
    const [file] = buildFiles(referenceTree(), ['VENDOR']);

    expect(file!.hasCoverPage).toBe(false);
    expect(file!.pages.some((page) => page.kind === 'cover')).toBe(false);
    expect(file!.pages[0]!.kind).toBe('summary');
  });

  it('内訳書は行タイプに関わらず全ファイルに含まれる（50.3, 50.12）', () => {
    const files = buildFiles(referenceTree(), ['ESTIMATE', 'EXECUTION', 'VENDOR']);

    for (const file of files) {
      expect(file.pages.filter((page) => page.kind === 'summary')).toHaveLength(1);
    }
  });
});

// ============================================================================
// ページ番号（32.9, 50.8）
// ============================================================================

describe('buildFiles - ページ番号', () => {
  it('見積金額のファイルは表紙が1ページ目・内訳書が2ページ目になる（50.2, 50.8）', () => {
    const [file] = buildFiles(referenceTree(), ['ESTIMATE']);

    // 3ページ目は `r1`（子項目を1件持つ）の明細書ページ（50.4）
    expect(file!.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(file!.pages.find((page) => page.kind === 'summary')!.pageNumber).toBe(2);
  });

  it('実行金額のファイルは内訳書が1ページ目になる（50.12, 50.8）', () => {
    const [file] = buildFiles(referenceTree(), ['EXECUTION']);

    expect(file!.pages.find((page) => page.kind === 'summary')!.pageNumber).toBe(1);
  });

  it('ページ番号を各ファイル内で1から振り直し、ファイルをまたぐ通し番号にしない（32.9）', () => {
    const files = buildFiles(referenceTree(), ['ESTIMATE', 'EXECUTION', 'VENDOR']);

    // 見積: 表紙・内訳書・`r1` の明細書。実行/業者: `r1` の子は見積金額行しか
    // 持たないため明細書ページが生成されず（38.4）、内訳書1ページのみ
    expect(files[0]!.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(files[1]!.pages.map((page) => page.pageNumber)).toEqual([1]);
    expect(files[2]!.pages.map((page) => page.pageNumber)).toEqual([1]);
  });
});

// ============================================================================
// 内訳書の内容（50.3, 52.10, 53.1〜53.7）
// ============================================================================

describe('buildFiles - 内訳書ページ', () => {
  function summaryOf(lineType: EstimateLineType) {
    const [file] = buildFiles(referenceTree(), [lineType]);
    return file!.pages.find((page) => page.kind === 'summary')!;
  }

  it('表題に対象の行タイプを併記する（32.4）', () => {
    expect(summaryOf('ESTIMATE').title).toBe('内訳書（見積）');
    expect(summaryOf('EXECUTION').title).toBe('内訳書（実行）');
    expect(summaryOf('VENDOR').title).toBe('内訳書（業者）');
  });

  it('第1階層の項目のみを並べ、子項目を含めない（50.3）', () => {
    const rows = summaryOf('ESTIMATE').rows;

    expect(rows.map((row) => row.name)).toEqual([
      'Ａ.共通仮設工事',
      'Ｂ.防水工事',
      '※ﾄｲﾚ・電力100V・水道水無償での御支給をお願いします。',
      'Ｃ.塗装工事',
      '【値引】',
    ]);
    expect(rows.some((row) => row.name.includes('保安要員'))).toBe(false);
  });

  it('第1階層の項目に階層記号を付け、注記行と値引き行には付けない（53.7, 41.12）', () => {
    const rows = summaryOf('ESTIMATE').rows;

    expect(rows[0]!.kind).toBe('item');
    expect(rows[2]!.kind).toBe('note');
    expect(rows[4]!.kind).toBe('discount');
    expect(rows[4]!.name).toBe('【値引】');
  });

  it('各欄を帳票の表記規則で埋める（53.1〜53.6）', () => {
    const rows = summaryOf('ESTIMATE').rows;

    expect(rows[0]).toMatchObject({
      specification: '',
      unit: '式',
      quantity: '1     ',
      unitPrice: '486,304',
      amount: '486,304',
      remarks: '一式',
    });
    // 直前の行と同一の単位は「〃」（53.6）
    expect(rows[1]!.unit).toBe('〃');
    expect(rows[1]!.amount).toBe('2,726,170');
    // 数量は小数第1位・小数点位置を揃える（53.1, 53.2）
    expect(rows[3]!.quantity).toBe('343.1   ');
    expect(rows[3]!.unitPrice).toBe('8,950');
    // 負数は先頭にマイナス記号（53.5）
    expect(rows[4]!.amount).toBe('-48,585');
  });

  it('注記行は名称欄のみを埋め、直後の行の単位を「〃」にしない（55.5, 53.6）', () => {
    const rows = summaryOf('ESTIMATE').rows;

    expect(rows[2]).toMatchObject({
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: '',
      remarks: '',
    });
    expect(rows[3]!.unit).toBe('㎡');
  });

  it('注記行が単位を持っていても直後の行を「〃」にしない（53.6, 55.5）', () => {
    // 注記行は構造上名称しか持たない（55.1）が、単位を抱えた注記行が単位の
    // 繰り返し判定へ混入しないことを固定する。`buildItemRow` の NOTE 分岐と
    // `previousUnit` の NOTE ガードの両方が load-bearing であることの検証。
    // pdf-format-reference.md §6:193 のとおり注記行は単位を持つ行の間に挟まる。
    const tree = [
      item({
        key: 'p1',
        lines: [line('ESTIMATE', { name: '本工事', unit: '式', quantity: '1', amount: '100' })],
      }),
      item({
        key: 'p2',
        itemType: 'NOTE',
        lines: [line('ESTIMATE', { name: '※注記', unit: '式' })],
      }),
      item({
        key: 'p3',
        lines: [line('ESTIMATE', { name: '追加工事', unit: '式', quantity: '1', amount: '200' })],
      }),
    ];
    const rows = buildFiles(tree, ['ESTIMATE'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;

    expect(rows[1]!.unit).toBe('');
    expect(rows[2]!.unit).toBe('式');
  });

  it('値引き行は階層記号の番号を消費せず、後続の第1階層が繰り上がらない（53.7, 41.12）', () => {
    // 値引き行は末尾とは限らない。後続の第1階層が存在する並びで記号を固定する。
    const tree = [
      item({
        key: 'd1',
        lines: [line('ESTIMATE', { name: '本工事', unit: '式', quantity: '1', amount: '1000' })],
      }),
      item({
        key: 'd2',
        itemType: 'DISCOUNT',
        lines: [line('ESTIMATE', { amount: '-100' })],
      }),
      item({
        key: 'd3',
        lines: [line('ESTIMATE', { name: '追加工事', unit: '式', quantity: '1', amount: '500' })],
      }),
    ];
    const rows = buildFiles(tree, ['ESTIMATE'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;

    expect(rows.map((row) => row.name)).toEqual(['Ａ.本工事', '【値引】', 'Ｂ.追加工事']);
  });

  it('合計行に「【合計】」と第1階層の金額合計を出力する（52.10, 41.8, 55.2）', () => {
    const summary = summaryOf('ESTIMATE');

    expect(summary.totalRow).not.toBeNull();
    expect(summary.totalRow!.kind).toBe('total');
    expect(summary.totalRow!.name).toBe('【合計】');
    // 486,304 + 2,726,170 + 3,070,745 - 48,585（注記行は加算しない）
    expect(summary.totalRow!.amount).toBe('6,234,634');
  });

  it('単位の繰り返し判定を対象行タイプの明細行同士で行う（53.6）', () => {
    // 見積金額行と実行金額行で単位が異なる項目を置き、他の行タイプの単位を
    // 繰り返し判定に持ち込んでいないことを固定する。
    const tree = [
      item({
        key: 'v1',
        lines: [
          line('ESTIMATE', { name: '外部足場', unit: '㎡', quantity: '1', amount: '100' }),
          line('EXECUTION', { name: '外部足場', unit: '式', quantity: '1', amount: '90' }),
        ],
      }),
      item({
        key: 'v2',
        lines: [
          line('ESTIMATE', { name: '内部足場', unit: '㎡', quantity: '1', amount: '200' }),
          line('EXECUTION', { name: '内部足場', unit: '㎡', quantity: '1', amount: '180' }),
        ],
      }),
    ];

    const estimateRows = buildFiles(tree, ['ESTIMATE'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;
    const executionRows = buildFiles(tree, ['EXECUTION'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;

    expect(estimateRows.map((row) => row.unit)).toEqual(['㎡', '〃']);
    // 実行金額行の直前の単位は「式」なので、㎡ は繰り返し記号にならない
    expect(executionRows.map((row) => row.unit)).toEqual(['式', '㎡']);
  });

  it('注記行が金額を持っていても合計に加算しない（55.2）', () => {
    // 注記行は構造上名称しか持たない（55.1）が、`estimateCalculations` が同じ理由で
    // 明示ガードを置いているのと同様、混入した金額を合計へ流し込まないことを固定する。
    const tree = [
      item({
        key: 'n1',
        lines: [line('ESTIMATE', { name: '本工事', unit: '式', quantity: '1', amount: '1000' })],
      }),
      item({
        key: 'n2',
        itemType: 'NOTE',
        lines: [line('ESTIMATE', { name: '※支給品あり', amount: '9999' })],
      }),
    ];
    const [file] = buildFiles(tree, ['ESTIMATE']);
    const summary = file!.pages.find((page) => page.kind === 'summary')!;

    expect(summary.totalRow!.amount).toBe('1,000');
    expect(summary.rows[1]!.amount).toBe('');
  });

  it('注記行は階層記号の番号を消費せず、後続の第1階層が繰り上がらない（53.7, 55.1）', () => {
    const rows = summaryOf('ESTIMATE').rows;

    // 注記行（3行目）を挟んでも「塗装工事」は4番目ではなく3番目の記号になる
    expect(rows[3]!.name).toBe('Ｃ.塗装工事');
  });

  it('内訳書ページは親項目名のフッタを持たない（50.11 は明細書のみ）', () => {
    expect(summaryOf('ESTIMATE').parentLabel).toBeNull();
  });

  it('金額がゼロの項目は金額欄を空欄とし、合計にも影響しない（53.4）', () => {
    const tree = [
      item({
        key: 'z1',
        lines: [line('ESTIMATE', { name: '無償対応', unit: '式', quantity: '1', amount: '0' })],
      }),
      item({
        key: 'z2',
        lines: [line('ESTIMATE', { name: '本工事', unit: '式', quantity: '2', amount: '1000' })],
      }),
    ];
    const [file] = buildFiles(tree, ['ESTIMATE']);
    const summary = file!.pages.find((page) => page.kind === 'summary')!;

    expect(summary.rows[0]!.amount).toBe('');
    expect(summary.rows[0]!.name).toBe('Ａ.無償対応');
    expect(summary.rows[1]!.name).toBe('Ｂ.本工事');
    expect(summary.totalRow!.amount).toBe('1,000');
  });
});

// ============================================================================
// 値のない項目の省略と繰り上げ（38.2, 38.3）
// ============================================================================

describe('buildFiles - 値のない項目の省略', () => {
  it('対象行タイプの明細行が全欄未設定の項目を省き、後続の項目を繰り上げる（38.2, 38.3）', () => {
    const [file] = buildFiles(referenceTree(), ['EXECUTION']);
    const summary = file!.pages.find((page) => page.kind === 'summary')!;

    expect(summary.rows.map((row) => row.name)).toEqual(['Ａ.共通仮設工事', 'Ｂ.塗装工事']);
    expect(summary.rows.map((row) => row.amount)).toEqual(['400,000', '2,744,800']);
    expect(summary.totalRow!.amount).toBe('3,144,800');
  });

  it('対象行タイプの明細行を持たない注記行・値引き行を省く（38.3）', () => {
    const [file] = buildFiles(referenceTree(), ['VENDOR']);
    const summary = file!.pages.find((page) => page.kind === 'summary')!;

    expect(summary.rows).toEqual([]);
    expect(summary.totalRow!.amount).toBe('');
  });

  it('省略後の単位の「〃」を省略前の並びではなく残った直前の行と比較する（38.2, 53.6）', () => {
    const tree = [
      item({
        key: 'u1',
        lines: [
          line('ESTIMATE', { name: '仮設工事', unit: '式', quantity: '1', amount: '100' }),
          line('EXECUTION', { name: '仮設工事', unit: '式', quantity: '1', amount: '90' }),
        ],
      }),
      item({
        key: 'u2',
        lines: [line('ESTIMATE', { name: '防水工事', unit: '㎡', quantity: '10', amount: '200' })],
      }),
      item({
        key: 'u3',
        lines: [
          line('ESTIMATE', { name: '塗装工事', unit: '㎡', quantity: '20', amount: '300' }),
          line('EXECUTION', { name: '塗装工事', unit: '㎡', quantity: '20', amount: '280' }),
        ],
      }),
    ];

    const estimateRows = buildFiles(tree, ['ESTIMATE'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;
    const executionRows = buildFiles(tree, ['EXECUTION'])[0]!.pages.find(
      (page) => page.kind === 'summary'
    )!.rows;

    // 見積: 式 → ㎡ → ㎡（3行目は直前と同一なので繰り返し記号）
    expect(estimateRows.map((row) => row.unit)).toEqual(['式', '㎡', '〃']);
    // 実行: 「防水工事」が省かれるため、塗装工事の直前は「式」の行になり繰り返さない
    expect(executionRows.map((row) => row.unit)).toEqual(['式', '㎡']);
  });

  it('省略後の階層記号を穴が空かないよう繰り上げる（38.2, 53.7）', () => {
    // 27件の第1階層のうち先頭1件だけが実行金額行を持たない。
    //
    // 【56.3 で更新済み】本ケースが固定している契約は「省略後の記号が穴なく繰り上がること」
    // であって「内訳書が常に1ページであること」ではない（56.2 の申し送り）。
    // 56.3 で明細17行の制限（52.5）と継続ページ（50.9, 50.10）を内訳書にも適用したため、
    // 27行は2ページに分かれる。記号の連番はページ境界に依らず連続するので、
    // 全内訳書ページの行を連結して記号を検証する。
    // ページ分割そのものの検証は `estimateReportLayout.detailPages.test.ts` が担当する。
    const tree = Array.from({ length: 27 }, (_, index) =>
      item({
        key: `n${index}`,
        lines:
          index === 0
            ? [line('ESTIMATE', { name: `工事${index}`, amount: '100' })]
            : [
                line('ESTIMATE', { name: `工事${index}`, amount: '100' }),
                line('EXECUTION', { name: `工事${index}`, amount: '90' }),
              ],
      })
    );

    const estimateRows = buildFiles(tree, ['ESTIMATE'])[0]!
      .pages.filter((page) => page.kind === 'summary')
      .flatMap((page) => page.rows);
    const executionRows = buildFiles(tree, ['EXECUTION'])[0]!
      .pages.filter((page) => page.kind === 'summary')
      .flatMap((page) => page.rows);

    expect(estimateRows).toHaveLength(27);
    expect(estimateRows[25]!.name).toBe('Ｚ.工事25');
    expect(estimateRows[26]!.name).toBe('ＡＡ.工事26');

    // 1件省かれた結果、最後の項目は27番目ではなく26番目の記号になる
    expect(executionRows).toHaveLength(26);
    expect(executionRows[0]!.name).toBe('Ａ.工事1');
    expect(executionRows[25]!.name).toBe('Ｚ.工事26');
  });
});

// ============================================================================
// hasValueForLineType（38.2, 38.3 の判定規則。56.3 の明細書組み立てでも用いる）
// ============================================================================

describe('hasValueForLineType', () => {
  it('対象行タイプの明細行が存在しない場合は値なしと判定する', () => {
    const target = item({ key: 'x', lines: [line('ESTIMATE', { name: '注記' })] });

    expect(hasValueForLineType(target, 'ESTIMATE')).toBe(true);
    expect(hasValueForLineType(target, 'EXECUTION')).toBe(false);
  });

  it('対象行タイプの明細行が存在しても全欄が未設定または空文字なら値なしと判定する', () => {
    const target = item({
      key: 'x',
      lines: [line('EXECUTION', { name: '', specification: '', unit: '', amount: '' })],
    });

    expect(hasValueForLineType(target, 'EXECUTION')).toBe(false);
  });

  it('名称・規格・単位・数量・単価・金額・備考のいずれか1つでも値があれば値ありと判定する', () => {
    const fields: readonly (keyof EditableLine)[] = [
      'name',
      'specification',
      'unit',
      'quantity',
      'unitPrice',
      'amount',
      'remarks',
    ];

    for (const field of fields) {
      const target = item({ key: 'x', lines: [line('EXECUTION', { [field]: '1' })] });
      expect(hasValueForLineType(target, 'EXECUTION')).toBe(true);
    }
  });

  it('転記元業者名だけを持つ明細行は値なしと判定する', () => {
    const target = item({
      key: 'x',
      lines: [line('VENDOR', { sourceVendorName: '○○建設' })],
    });

    expect(hasValueForLineType(target, 'VENDOR')).toBe(false);
  });
});
