/**
 * @fileoverview estimateReportLayout.buildFiles（明細書ページの組み立てと継続ページ）の単体テスト
 *
 * Requirements (estimate-creation):
 * - 32.4: 内訳書ページと明細書ページの表題に対象の行タイプを併記する
 * - 38.4: 項目を省いた結果として明細行が0件になった階層の明細書ページを出力しない
 * - 41.12: 値引き行を名称欄に「【値引】」と表示し、金額を負数のまま出力する
 * - 50.4: 内訳書の次のページ以降を明細書とし、子項目を持つ項目ごとに改ページする
 * - 50.5: 第2階層以下にも子項目を持つ場合、深さに関わらず明細書ページを出力する
 * - 50.6: 明細書ページを親項目の並び順に従い、ある項目のページの直後にその配下を続ける
 * - 50.7: 子項目を持たない項目の明細書ページを出力しない
 * - 50.9: 1つの階層の明細行が1ページに収まらない場合、同じ表題と見出しで継続ページを出力する
 * - 50.10: 継続ページがある場合、合計行を最終ページの最下行にのみ出力する
 * - 50.11: 明細書の各ページの表の外側下部に当該階層の親項目名を出力する
 * - 52.5: 1ページの表を見出し行1行・明細行17行・合計行1行で構成する
 * - 52.6: 明細行が17行に満たない場合、残りを空行とする（＝ページを分割しない）
 * - 52.10: 合計行の名称欄に「【合計】」を、金額欄に当該階層の金額合計を出力する
 * - 52.11: 明細書ページの先頭行に当該階層の親項目の階層記号と名称を出力する
 * - 53.6: 直前の行と同一の単位を「〃」に置き換える（design.md:4209 により継続ページを跨ぐ）
 * - 53.7: 階層記号は第1階層のみに付ける
 *
 * 期待値はすべて literal で書く。実装が用いる `formatQuantity` / `formatMoney` /
 * `formatUnit` / `levelSymbol` をアサーション側で呼ばないことで、
 * 「フォーマッタが no-op でも通るテスト」を避ける。
 *
 * Design: design.md `#### Frontend Export` > `##### estimateReportLayout`
 *         （継続ページの `〃` は design.md :4209 の確定判断）
 */

import { describe, it, expect } from 'vitest';

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';

import { buildFiles, type ReportPage } from './estimateReportLayout';

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

/** 見積金額行だけを持つ通常項目 */
function work(options: {
  key: string;
  name: string;
  unit?: string;
  amount?: string;
  children?: readonly EditableItem[];
}): EditableItem {
  return item({
    key: options.key,
    lines: [
      line('ESTIMATE', {
        name: options.name,
        unit: options.unit ?? '式',
        quantity: '1',
        amount: options.amount ?? '1000',
      }),
    ],
    children: options.children,
  });
}

function pagesOf(tree: readonly EditableItem[], lineType: EstimateLineType): readonly ReportPage[] {
  const [file] = buildFiles(tree, [lineType]);
  return file!.pages;
}

function detailPagesOf(
  tree: readonly EditableItem[],
  lineType: EstimateLineType
): readonly ReportPage[] {
  return pagesOf(tree, lineType).filter((page) => page.kind === 'detail');
}

function summaryRowNames(tree: readonly EditableItem[], lineType: EstimateLineType): string[] {
  return pagesOf(tree, lineType)
    .filter((page) => page.kind === 'summary')
    .flatMap((page) => page.rows.map((row) => row.name));
}

// ============================================================================
// 明細書ページの生成対象（50.4, 50.5, 50.6, 50.7, 38.4）
// ============================================================================

describe('buildFiles - 明細書ページの生成対象', () => {
  it('子項目を持つ項目ごとに明細書ページを生成し、子を持たない項目には生成しない（50.4, 50.7）', () => {
    const tree = [
      work({ key: 'a', name: '建築工事', children: [work({ key: 'a1', name: '基礎' })] }),
      work({ key: 'b', name: '諸経費' }),
    ];

    // 「Ｂ.諸経費」は内訳書に載る＝出力対象として生きている項目である
    // （＝明細書ページが作られない理由が「省略」ではなく「子を持たない」ことである）
    expect(summaryRowNames(tree, 'ESTIMATE')).toEqual(['Ａ.建築工事', 'Ｂ.諸経費']);
    expect(detailPagesOf(tree, 'ESTIMATE').map((page) => page.parentLabel)).toEqual([
      'Ａ.建築工事',
    ]);
  });

  it('第2階層以下に子項目を持つ場合も深さに関わらず明細書ページを出力する（50.5）', () => {
    const tree = [
      work({
        key: 'a',
        name: '建築工事',
        children: [
          work({
            key: 'a1',
            name: '基礎工事',
            children: [work({ key: 'a1x', name: '掘削' })],
          }),
        ],
      }),
    ];

    expect(detailPagesOf(tree, 'ESTIMATE').map((page) => page.parentLabel)).toEqual([
      'Ａ.建築工事',
      '基礎工事',
    ]);
  });

  it('ある項目の明細書ページの直後にその配下の明細書ページを続ける（50.6）', () => {
    const tree = [
      work({
        key: 'a',
        name: '建築工事',
        children: [
          work({ key: 'a1', name: '基礎工事', children: [work({ key: 'a1x', name: '掘削' })] }),
          work({ key: 'a2', name: '躯体工事' }),
        ],
      }),
      work({ key: 'b', name: '電気工事', children: [work({ key: 'b1', name: '配線' })] }),
    ];

    // 幅優先（Ａ → Ｂ → 基礎工事）ではなく深さ優先であることを固定する
    expect(detailPagesOf(tree, 'ESTIMATE').map((page) => page.parentLabel)).toEqual([
      'Ａ.建築工事',
      '基礎工事',
      'Ｂ.電気工事',
    ]);
  });

  it('項目を省いた結果0件になった階層の明細書ページを生成しない（38.4）', () => {
    const tree = [
      item({
        key: 'a',
        lines: [
          line('ESTIMATE', { name: '内装工事', unit: '式', quantity: '1', amount: '1000' }),
          line('EXECUTION', { name: '内装工事', unit: '式', quantity: '1', amount: '900' }),
        ],
        // 子は見積金額行しか持たない＝実行金額のファイルでは全件が省かれる
        children: [work({ key: 'a1', name: 'クロス貼り' })],
      }),
    ];

    // 見積金額のファイルでは同じ親から明細書ページが生成される
    // （＝実行金額側の「生成しない」が空振りのアサーションでないことの証拠）
    expect(detailPagesOf(tree, 'ESTIMATE').map((page) => page.parentLabel)).toEqual([
      'Ａ.内装工事',
    ]);
    // 実行金額のファイルでも親項目自体は内訳書に載る（省かれてはいない）
    expect(summaryRowNames(tree, 'EXECUTION')).toEqual(['Ａ.内装工事']);
    expect(detailPagesOf(tree, 'EXECUTION')).toEqual([]);
  });

  it('値引き行は階層記号の番号を消費せず、後続の明細書見出しが繰り上がらない（41.12, 53.7）', () => {
    const tree = [
      work({ key: 'a', name: '本工事', children: [work({ key: 'a1', name: '躯体' })] }),
      item({
        key: 'd',
        itemType: 'DISCOUNT',
        lines: [line('ESTIMATE', { unit: '式', quantity: '1', amount: '-500' })],
      }),
      work({ key: 'b', name: '追加工事', children: [work({ key: 'b1', name: '補修' })] }),
    ];

    const pages = detailPagesOf(tree, 'ESTIMATE');

    expect(pages.map((page) => page.parentLabel)).toEqual(['Ａ.本工事', 'Ｂ.追加工事']);
    expect(pages.map((page) => page.rows[0]!.name)).toEqual(['Ａ.本工事', 'Ｂ.追加工事']);
  });
});

// ============================================================================
// 明細書ページの内容（32.4, 50.11, 52.10, 52.11, 52.12, 53.7）
// ============================================================================

describe('buildFiles - 明細書ページの内容', () => {
  const tree = [
    work({
      key: 'a',
      name: '建築工事',
      amount: '3000',
      children: [
        item({
          key: 'a1',
          lines: [
            line('ESTIMATE', {
              name: '保安要員',
              specification: '仮設足場組立・解体時',
              unit: '人工',
              quantity: '10',
              unitPrice: '17500',
              amount: '175000',
              remarks: '昼間',
            }),
          ],
        }),
        item({
          key: 'a2',
          // 注記行は構造上名称しか持たない（55.1）が、単位と金額を抱えた注記行が
          // 「〃」の判定（53.6）と階層の合計（55.2）へ混入しないことを観測可能にする
          itemType: 'NOTE',
          lines: [line('ESTIMATE', { name: '※ﾏｲﾙｰﾌｧｰ MM工法', unit: '人工', amount: '9999' })],
        }),
        item({
          key: 'a3',
          lines: [
            line('ESTIMATE', {
              name: '外部足場',
              unit: '人工',
              quantity: '612',
              unitPrice: '592',
              amount: '362304',
            }),
          ],
        }),
        item({
          key: 'a4',
          itemType: 'DISCOUNT',
          lines: [line('ESTIMATE', { unit: '式', quantity: '1', amount: '-2304' })],
        }),
      ],
    }),
  ];

  it('表題に対象の行タイプを併記する（32.4）', () => {
    expect(detailPagesOf(tree, 'ESTIMATE')[0]!.title).toBe('明細書（見積）');
  });

  it('先頭行に親項目の階層記号と名称を出力し、金額欄などは空欄とする（52.11）', () => {
    const headingRow = detailPagesOf(tree, 'ESTIMATE')[0]!.rows[0]!;

    expect(headingRow.name).toBe('Ａ.建築工事');
    expect(headingRow).toMatchObject({
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: '',
      remarks: '',
      indentLevel: 0,
    });
  });

  it('子項目を親項目より1段下げて出力する（52.12）', () => {
    const rows = detailPagesOf(tree, 'ESTIMATE')[0]!.rows;

    expect(rows.map((row) => row.indentLevel)).toEqual([0, 1, 1, 1, 1]);
  });

  it('子項目の各欄を帳票の表記規則で埋める（53.1〜53.6, 41.12）', () => {
    const rows = detailPagesOf(tree, 'ESTIMATE')[0]!.rows;

    expect(rows[1]).toMatchObject({
      kind: 'item',
      name: '保安要員',
      specification: '仮設足場組立・解体時',
      unit: '人工',
      quantity: '10     ',
      unitPrice: '17,500',
      amount: '175,000',
      remarks: '昼間',
    });
    // 注記行は名称欄のみ（55.5）。単位を抱えていても繰り返し判定に混入しない（53.6）
    expect(rows[2]).toMatchObject({ kind: 'note', name: '※ﾏｲﾙｰﾌｧｰ MM工法', unit: '' });
    // 注記行を挟んだ直後の行は「〃」にならない
    expect(rows[3]!.unit).toBe('人工');
    expect(rows[4]).toMatchObject({ kind: 'discount', name: '【値引】', amount: '-2,304' });
  });

  it('子項目には階層記号を付けない（53.7）', () => {
    const rows = detailPagesOf(tree, 'ESTIMATE')[0]!.rows;

    expect(rows[1]!.name).toBe('保安要員');
    expect(rows[3]!.name).toBe('外部足場');
  });

  it('第2階層以降の親項目の見出し行は階層記号を持たない（53.7, 52.11）', () => {
    const nested = [
      work({
        key: 'a',
        name: '建築工事',
        children: [
          work({ key: 'a1', name: '基礎工事', children: [work({ key: 'x', name: '掘削' })] }),
        ],
      }),
    ];
    const pages = detailPagesOf(nested, 'ESTIMATE');

    expect(pages[1]!.rows[0]!.name).toBe('基礎工事');
    expect(pages[1]!.parentLabel).toBe('基礎工事');
  });

  it('合計行に「【合計】」と当該階層の金額合計を出力する（52.10, 41.8, 55.2）', () => {
    const totalRow = detailPagesOf(tree, 'ESTIMATE')[0]!.totalRow;

    expect(totalRow).not.toBeNull();
    expect(totalRow!.kind).toBe('total');
    expect(totalRow!.name).toBe('【合計】');
    // 175,000 + 362,304 - 2,304
    // 注記行の 9,999 は加算せず（55.2）、親項目自身の金額 3,000 も加算しない
    expect(totalRow!.amount).toBe('535,000');
  });

  it('各ページに親項目名を割り当てる（50.11）', () => {
    expect(detailPagesOf(tree, 'ESTIMATE')[0]!.parentLabel).toBe('Ａ.建築工事');
  });
});

// ============================================================================
// 継続ページ（50.9, 50.10, 52.5, 53.6）
// ============================================================================

/** 単位を指定して子項目を並べた第1階層を作る */
function parentWithChildren(units: readonly string[]): readonly EditableItem[] {
  return [
    work({
      key: 'p',
      name: '建築工事',
      children: units.map((unit, index) =>
        work({ key: `c${index}`, name: `子${index}`, unit, amount: '1000' })
      ),
    }),
  ];
}

describe('buildFiles - 継続ページ', () => {
  it('明細行が17行に収まる場合はページを分けない（52.5, 52.6）', () => {
    // 見出し行1行 ＋ 子16件 = 17行
    const pages = detailPagesOf(parentWithChildren(Array(16).fill('式')), 'ESTIMATE');

    expect(pages).toHaveLength(1);
    expect(pages[0]!.rows).toHaveLength(17);
  });

  it('明細行が17行を超える場合に同じ表題と見出しで継続ページを作る（50.9, 52.5）', () => {
    // 見出し行1行 ＋ 子17件 = 18行
    const pages = detailPagesOf(parentWithChildren(Array(17).fill('式')), 'ESTIMATE');

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.rows.length)).toEqual([17, 1]);
    expect(pages.map((page) => page.title)).toEqual(['明細書（見積）', '明細書（見積）']);
    expect(pages.map((page) => page.parentLabel)).toEqual(['Ａ.建築工事', 'Ａ.建築工事']);
    expect(pages.map((page) => page.pageNumber)).toEqual([3, 4]);
  });

  it('継続ページの先頭行を親項目の見出し行で置き換えない（50.9, 52.11）', () => {
    const pages = detailPagesOf(parentWithChildren(Array(20).fill('式')), 'ESTIMATE');

    expect(pages[0]!.rows[0]!.name).toBe('Ａ.建築工事');
    // 2ページ目は明細の続きから始まる（16件目までが1ページ目）
    expect(pages[1]!.rows[0]!.name).toBe('子16');
  });

  it('合計行を最終ページにのみ置く（50.10）', () => {
    const pages = detailPagesOf(parentWithChildren(Array(20).fill('式')), 'ESTIMATE');

    expect(pages).toHaveLength(2);
    expect(pages[0]!.totalRow).toBeNull();
    // 20件 × 1,000（合計行が生成されうるフィクスチャであることの証拠）
    expect(pages[1]!.totalRow!.amount).toBe('20,000');
  });

  it('継続ページの先頭行の単位が直前ページ最終行と同一なら「〃」にする（53.6）', () => {
    // 1ページ目は見出し行 ＋ 子0〜子15、2ページ目は子16〜子19。
    // 単位の連鎖はページ境界で切れない（design.md `##### estimateReportLayout`）。
    const pages = detailPagesOf(parentWithChildren(Array(20).fill('式')), 'ESTIMATE');

    expect(pages[0]!.rows[16]!.unit).toBe('〃');
    expect(pages[1]!.rows[0]!.unit).toBe('〃');
    // 継続ページ2行目以降も連鎖が続く（境界を1行ずらして切る実装を検出する）
    expect(pages[1]!.rows.map((row) => row.unit)).toEqual(['〃', '〃', '〃', '〃']);
  });

  it('継続ページの先頭行の単位が直前ページ最終行と異なる場合はそのまま出力する（53.6）', () => {
    const units = Array.from({ length: 20 }, (_, index) => (index === 16 ? '㎡' : '式'));
    const pages = detailPagesOf(parentWithChildren(units), 'ESTIMATE');

    expect(pages[0]!.rows[16]!.unit).toBe('〃');
    expect(pages[1]!.rows[0]!.unit).toBe('㎡');
    expect(pages[1]!.rows[1]!.unit).toBe('式');
  });

  it('注記行と値引き行を17行の明細行として数える（52.5）', () => {
    // 通常の子15件 ＋ 注記行1件 ＋ 値引き行1件 = 17件。見出し行と合わせて18行になり
    // 継続ページが必要になる。注記行・値引き行を行数に数えなければ16行で収まってしまう。
    const children: EditableItem[] = [];
    for (let index = 0; index < 15; index += 1) {
      children.push(work({ key: `c${index}`, name: `子${String(index).padStart(2, '0')}` }));
      if (index === 1) {
        children.push(
          item({
            key: 'note',
            itemType: 'NOTE',
            lines: [line('ESTIMATE', { name: '※注記', amount: '7777' })],
          })
        );
      }
      if (index === 7) {
        children.push(
          item({
            key: 'discount',
            itemType: 'DISCOUNT',
            lines: [line('ESTIMATE', { unit: '式', quantity: '1', amount: '-500' })],
          })
        );
      }
    }
    const pages = detailPagesOf([work({ key: 'p', name: '建築工事', children })], 'ESTIMATE');

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.rows.length)).toEqual([17, 1]);
    // 1ページ目に注記行・値引き行が含まれている（＝行数に数えられている）
    expect(pages[0]!.rows.map((row) => row.kind)).toContain('note');
    expect(pages[0]!.rows.map((row) => row.kind)).toContain('discount');
    // あふれた1行は最後の通常項目
    expect(pages[1]!.rows[0]!.name).toBe('子14');
    // 15,000 - 500（注記行の 7,777 は加算しない / 55.2）
    expect(pages[1]!.totalRow!.amount).toBe('14,500');
  });

  it('内訳書も17行を超える場合に継続ページへ分け、合計行を最終ページに置く（52.1, 52.5, 50.9, 50.10）', () => {
    const tree = Array.from({ length: 20 }, (_, index) =>
      work({ key: `r${index}`, name: `工事${index}` })
    );
    const summaryPages = pagesOf(tree, 'ESTIMATE').filter((page) => page.kind === 'summary');

    expect(summaryPages).toHaveLength(2);
    expect(summaryPages.map((page) => page.rows.length)).toEqual([17, 3]);
    expect(summaryPages.map((page) => page.title)).toEqual(['内訳書（見積）', '内訳書（見積）']);
    expect(summaryPages[0]!.totalRow).toBeNull();
    expect(summaryPages[1]!.totalRow!.amount).toBe('20,000');
    // 記号は省略後の並びに沿って継続ページでも進み続ける（53.7）
    expect(summaryPages[1]!.rows[0]!.name).toBe('Ｒ.工事17');
  });
});

// ============================================================================
// 深さ3階層・明細40行の総合検証（50.4〜50.11, 52.5, 32.9）
// ============================================================================

/**
 * 深さ3階層・明細（子項目）40行の見積書
 *
 * - 第1階層: `Ａ.建築工事`（子20件）/ `Ｂ.電気工事`（子8件）
 * - 第2階層: `Ａ` の5件目 `内装工事` のみが子12件を持つ
 * - 明細行の合計 = 20 + 12 + 8 = 40
 */
function deepTree(): readonly EditableItem[] {
  const nestedChildren = Array.from({ length: 12 }, (_, index) =>
    work({ key: `e${index}`, name: `内装${index}`, unit: '㎡', amount: '500' })
  );
  const buildingChildren = Array.from({ length: 20 }, (_, index) =>
    index === 4
      ? work({ key: 'd4', name: '内装工事', amount: '6000', children: nestedChildren })
      : work({ key: `d${index}`, name: `建築${index}`, amount: '1000' })
  );
  const electricChildren = Array.from({ length: 8 }, (_, index) =>
    work({ key: `f${index}`, name: `電気${index}`, amount: '2000' })
  );

  return [
    work({ key: 'a', name: '建築工事', amount: '25000', children: buildingChildren }),
    work({ key: 'b', name: '電気工事', amount: '16000', children: electricChildren }),
  ];
}

describe('buildFiles - 深さ3階層・明細40行', () => {
  it('期待するページ数・種別・通し番号になる（50.4〜50.9, 32.9）', () => {
    const pages = pagesOf(deepTree(), 'ESTIMATE');

    expect(pages).toHaveLength(6);
    expect(pages.map((page) => page.kind)).toEqual([
      'cover',
      'summary',
      'detail',
      'detail',
      'detail',
      'detail',
    ]);
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pages.map((page) => page.parentLabel)).toEqual([
      null,
      null,
      'Ａ.建築工事',
      'Ａ.建築工事',
      '内装工事',
      'Ｂ.電気工事',
    ]);
  });

  it('各ページの明細行数が17行を超えない（52.5）', () => {
    const pages = pagesOf(deepTree(), 'ESTIMATE');

    expect(pages.map((page) => page.rows.length)).toEqual([0, 2, 17, 4, 13, 9]);
  });

  it('合計行を階層ごとの最終ページにのみ置き、当該階層の合計金額を出力する（50.10, 52.10）', () => {
    const pages = pagesOf(deepTree(), 'ESTIMATE');

    expect(pages.map((page) => page.totalRow?.amount ?? null)).toEqual([
      null,
      '41,000', // 内訳書: 25,000 + 16,000
      null, // Ａ の継続ページ1枚目には合計行を置かない
      '25,000', // Ａ: 1,000 × 19 + 6,000
      '6,000', // 内装工事: 500 × 12
      '16,000', // Ｂ: 2,000 × 8
    ]);
  });

  it('階層をまたいでも継続ページの先頭行の単位を直前ページ最終行と比較する（53.6）', () => {
    const pages = pagesOf(deepTree(), 'ESTIMATE');

    // Ａ の子はすべて「式」。1ページ目最終行に続く2ページ目先頭行も「〃」
    expect(pages[2]!.rows[16]!.unit).toBe('〃');
    expect(pages[3]!.rows[0]!.unit).toBe('〃');
    // 別の階層の明細書は新しい表なので先頭の子項目は単位をそのまま出力する
    expect(pages[4]!.rows[1]!.unit).toBe('㎡');
    expect(pages[5]!.rows[1]!.unit).toBe('式');
  });
});
