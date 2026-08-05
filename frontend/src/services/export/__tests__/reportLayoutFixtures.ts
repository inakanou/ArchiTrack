/**
 * @fileoverview 帳票構成（`estimateReportLayout.buildFiles`）の同値検証で用いる代表フィクスチャ
 *
 * Task 57.5（明細書ページの組み立てから再帰を除去する）で、書き換え前後の `buildFiles` の
 * 出力が**完全に一致する**ことを機械的に示すために用いる。フィクスチャと直列化の実装を
 * テストから切り出しているのは、**同じ入力・同じ直列化**で得た基準出力（`reportLayoutGolden`）
 * を再帰版の実装から生成し、反復版の実装と突き合わせるため。
 *
 * 収録しているのは、明細書ページの並び順・継続ページ・合計行の位置に影響する経路を
 * すべて通す組み合わせ:
 * - 深さ優先・先行順（親のページ群 → その配下）と兄弟の並び（50.6）
 * - 子を持たない項目のページ省略（50.7）と、値を持たない親による部分木ごとの脱落（38.2, 38.4）
 * - 1階層が17行に収まらない場合の継続ページと合計行の位置（50.9, 50.10, 52.5）
 * - 注記行・値引き行を含む階層（41.12, 55.2）
 * - 第1階層が26件を超える場合の階層記号の桁上がり（53.7）
 * - 行タイプ3種のファイル構成と表紙の有無（32.2, 32.3, 50.2, 50.12）
 * - 一本鎖の深いネスト（2.5 / 50.5）
 *
 * `__tests__` 配下に置いているのは本番バンドルへ載せないため
 * （`__tests__/staticImportGraph.ts` の `isTestFile` が同ディレクトリをテスト側と判定する）。
 * ファイル名が `*.test.ts` ではないため vitest の収集対象にはならない。
 *
 * Requirements (estimate-creation): 2.5, 32.2, 32.3, 38.2, 38.4, 41.12, 50.2, 50.5, 50.6,
 * 50.7, 50.9, 50.10, 50.12, 52.5, 53.6, 53.7, 55.2
 */

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../../domain/estimate/estimateEditReducer.types';
import type { ReportFileSpec, ReportRow } from '../estimateReportLayout';

// ============================================================================
// 基本の組み立て
// ============================================================================

/** 全欄が未設定の明細行。必要な欄だけを上書きして使う */
export function line(
  lineType: EstimateLineType,
  overrides: Partial<EditableLine> = {}
): EditableLine {
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

export function item(options: {
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

/** 指定した行タイプすべてに同じ値を持つ通常項目 */
export function work(options: {
  key: string;
  name: string;
  lineTypes?: readonly EstimateLineType[];
  specification?: string;
  unit?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  remarks?: string;
  children?: readonly EditableItem[];
}): EditableItem {
  const lineTypes = options.lineTypes ?? (['ESTIMATE'] as const);

  return item({
    key: options.key,
    lines: lineTypes.map((lineType) =>
      line(lineType, {
        name: options.name,
        specification: options.specification ?? null,
        unit: options.unit ?? '式',
        quantity: options.quantity ?? '1',
        unitPrice: options.unitPrice ?? null,
        amount: options.amount ?? '1000',
        remarks: options.remarks ?? null,
      })
    ),
    children: options.children,
  });
}

// ============================================================================
// フィクスチャ
// ============================================================================

/** 深さ4階層・兄弟複数・継続ページありの木（並び順と継続ページの位置を固定する） */
function branchingTree(): readonly EditableItem[] {
  const grandChildren = Array.from({ length: 12 }, (_, index) =>
    work({ key: `g${index}`, name: `内装${index}`, unit: '㎡', amount: '500' })
  );
  const greatGrandChildren = Array.from({ length: 3 }, (_, index) =>
    work({ key: `h${index}`, name: `塗装${index}`, unit: '㎡', amount: '100' })
  );

  const buildingChildren = Array.from({ length: 20 }, (_, index) => {
    if (index === 4) {
      return work({
        key: 'd4',
        name: '内装工事',
        amount: '6000',
        children: grandChildren.map((child, childIndex) =>
          childIndex === 2
            ? work({
                key: 'g2',
                name: '内装2',
                unit: '㎡',
                amount: '500',
                children: greatGrandChildren,
              })
            : child
        ),
      });
    }
    return work({ key: `d${index}`, name: `建築${index}`, amount: '1000' });
  });

  return [
    work({ key: 'a', name: '建築工事', amount: '25000', children: buildingChildren }),
    work({
      key: 'b',
      name: '電気工事',
      amount: '16000',
      children: Array.from({ length: 8 }, (_, index) =>
        work({ key: `f${index}`, name: `電気${index}`, amount: '2000' })
      ),
    }),
    // 子を持たない第1階層（明細書ページを出力しない / 50.7）
    work({ key: 'c', name: '諸経費', amount: '3000' }),
  ];
}

/** 注記行・値引き行を含み、継続ページの境界を跨ぐ木（41.12, 55.2, 53.6） */
function noteAndDiscountTree(): readonly EditableItem[] {
  const children: EditableItem[] = [];
  for (let index = 0; index < 15; index += 1) {
    children.push(
      work({
        key: `c${index}`,
        name: `子${String(index).padStart(2, '0')}`,
        unit: index % 3 === 0 ? '㎡' : '式',
        amount: '1000',
      })
    );
    if (index === 1) {
      children.push(
        item({
          key: 'note',
          itemType: 'NOTE',
          lines: [line('ESTIMATE', { name: '※別途消費税', amount: '7777' })],
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

  return [
    work({
      key: 'p',
      name: '建築工事',
      amount: '14500',
      children: [
        ...children,
        work({
          key: 'nested',
          name: '入れ子',
          amount: '2000',
          children: [work({ key: 'nested-c', name: '入れ子の子', unit: '㎡', amount: '2000' })],
        }),
      ],
    }),
  ];
}

/**
 * 値を持たない親が部分木ごと脱落する木（38.2, 38.4）
 *
 * `EXECUTION` を出力対象にすると `hidden` は値を持たないため列挙から外れ、
 * その配下（値を持つ孫を含む）へは一切降りない。この「部分木ごとの脱落」は
 * 深さ優先の走査順そのものに依存するため、書き換えで壊れやすい経路。
 */
function partiallyFilledTree(): readonly EditableItem[] {
  return [
    work({
      key: 'root',
      name: '両方持つ工事',
      lineTypes: ['ESTIMATE', 'EXECUTION'],
      amount: '9000',
      children: [
        work({
          key: 'hidden',
          name: '見積のみの親',
          lineTypes: ['ESTIMATE'],
          amount: '4000',
          children: [
            work({
              key: 'hidden-child',
              name: '実行も持つ孫',
              lineTypes: ['ESTIMATE', 'EXECUTION'],
              amount: '4000',
            }),
          ],
        }),
        work({
          key: 'shown',
          name: '両方持つ親',
          lineTypes: ['ESTIMATE', 'EXECUTION'],
          amount: '5000',
          children: [
            work({
              key: 'shown-child',
              name: '両方持つ子',
              lineTypes: ['ESTIMATE', 'EXECUTION'],
              amount: '5000',
            }),
          ],
        }),
      ],
    }),
  ];
}

/** 第1階層が26件を超える木（階層記号の桁上がりと内訳書の継続ページ / 53.7, 50.9） */
function wideTree(): readonly EditableItem[] {
  return Array.from({ length: 30 }, (_, index) =>
    work({
      key: `w${index}`,
      name: `工事${String(index).padStart(2, '0')}`,
      amount: '1000',
      children:
        index % 7 === 0
          ? [work({ key: `w${index}-c`, name: `子${index}`, unit: '㎡', amount: '1000' })]
          : undefined,
    })
  );
}

/** 一本鎖のネスト（深さ優先の降下が途切れないこと / 2.5, 50.5） */
export function chainTree(depth: number): readonly EditableItem[] {
  let node = work({ key: `chain-${depth - 1}`, name: `階層${depth - 1}`, amount: '1000' });
  for (let level = depth - 2; level >= 0; level -= 1) {
    node = work({
      key: `chain-${level}`,
      name: `階層${level}`,
      amount: '1000',
      children: [node],
    });
  }
  return [node];
}

/** 直列化して基準出力と突き合わせるフィクスチャ一覧 */
export const LAYOUT_FIXTURES: readonly {
  readonly name: string;
  readonly tree: readonly EditableItem[];
  readonly lineTypes: readonly EstimateLineType[];
}[] = [
  { name: '空のツリー・見積のみ', tree: [], lineTypes: ['ESTIMATE'] },
  { name: '深さ4階層・兄弟複数・見積', tree: branchingTree(), lineTypes: ['ESTIMATE'] },
  {
    name: '深さ4階層・兄弟複数・3行タイプ',
    tree: branchingTree(),
    lineTypes: ['VENDOR', 'ESTIMATE', 'EXECUTION'],
  },
  { name: '注記行と値引き行・見積', tree: noteAndDiscountTree(), lineTypes: ['ESTIMATE'] },
  { name: '注記行と値引き行・実行', tree: noteAndDiscountTree(), lineTypes: ['EXECUTION'] },
  {
    name: '値を持たない親の部分木脱落・見積と実行',
    tree: partiallyFilledTree(),
    lineTypes: ['ESTIMATE', 'EXECUTION'],
  },
  { name: '第1階層30件・見積', tree: wideTree(), lineTypes: ['ESTIMATE'] },
  { name: '一本鎖の深さ8・見積', tree: chainTree(8), lineTypes: ['ESTIMATE'] },
];

// ============================================================================
// 直列化（ページの中身と順序をすべて含む）
// ============================================================================

function serializeRow(row: ReportRow): string {
  return [
    row.kind,
    row.name,
    row.specification,
    row.unit,
    row.quantity,
    row.unitPrice,
    row.amount,
    row.remarks,
    String(row.indentLevel),
  ].join(' | ');
}

/**
 * `buildFiles` の戻り値を1行1要素の文字列配列へ直列化する
 *
 * ページ数だけでなく **ページの種別・通し番号・表題・親項目名・全行の全欄・合計行**を
 * 出現順のまま含めるため、ページの中身または並び順が1箇所でも変われば必ず差分になる。
 */
export function serializeFiles(files: readonly ReportFileSpec[]): readonly string[] {
  const lines: string[] = [];

  for (const file of files) {
    lines.push(
      `FILE ${file.lineType} label=${file.fileNameLabel} cover=${String(file.hasCoverPage)} pages=${file.pages.length}`
    );
    for (const page of file.pages) {
      lines.push(
        `  PAGE ${page.pageNumber} kind=${page.kind} lineType=${page.lineType} title=${page.title} parent=${String(page.parentLabel)} rows=${page.rows.length}`
      );
      page.rows.forEach((row, index) => {
        lines.push(`    ROW ${index} ${serializeRow(row)}`);
      });
      lines.push(`    TOTAL ${page.totalRow === null ? '(none)' : serializeRow(page.totalRow)}`);
    }
  }

  return lines;
}
