/**
 * @fileoverview estimateReportLayout.buildFiles を深い階層で完走させることの単体テスト（Task 57.5）
 *
 * 明細書ページの組み立ては元々 `buildDetailPages` の**自己再帰**で書かれており、
 * 階層の深さがそのまま JavaScript の呼び出しスタックの深さになっていた。
 * 57.2 の実測では深さ 4500 段で `RangeError: Maximum call stack size exceeded` となり、
 * 「階層の深さに上限を設けない」（Requirement 2.5）が帳票出力側で成立していなかった。
 * PDF / 表計算のどちらも `buildFiles` を通るため、深い見積書は帳票を一切出力できない。
 *
 * 本ファイルは次の2点を固定する。
 *
 * 1. **深さ**: 破断点（4500）を大きく超える深さでも `buildFiles` が完走し、
 *    ページ数・並び順・合計行が階層の深さに沿って正しく出ること（2.5, 50.5, 50.6）。
 * 2. **同値**: 再帰から反復への書き換えでページ構成が**一切変わらない**こと。
 *    代表フィクスチャに対する `buildFiles` の戻り値を、ページの種別・通し番号・表題・
 *    親項目名・全行の全欄・合計行まで含めて直列化し、**書き換え前の実装が生成した基準出力**
 *    （`__tests__/reportLayoutGolden.ts`）と1行ずつ突き合わせる。ページ数の一致だけでは
 *    並び順の入れ替わりや合計行の移動を検出できないため、中身と順序を丸ごと比較する。
 *
 * Requirements (estimate-creation):
 * - 2.5: 階層の深さに上限を設けない
 * - 50.5: 第2階層以下にも子項目を持つ場合、深さに関わらず明細書ページを出力する
 * - 50.6: 明細書ページを親項目の並び順に従い、ある項目のページの直後にその配下を続ける
 * - 50.9 / 50.10: 継続ページを同じ表題と見出しで出力し、合計行を最終ページにのみ置く
 * - 32.9 / 50.8: ページ番号を各ファイル内の通し番号とする
 *
 * Design: design.md `#### Frontend Export` > `##### estimateReportLayout`
 */

import { describe, expect, it } from 'vitest';

import { LAYOUT_FIXTURES, chainTree, serializeFiles } from './__tests__/reportLayoutFixtures';
import { REPORT_LAYOUT_GOLDEN } from './__tests__/reportLayoutGolden';
import { buildFiles } from './estimateReportLayout';

/**
 * 検証に用いる階層の深さ
 *
 * 57.2 が計測した破断点は vitest jsdom fork 環境で 4500 段（4000 段は成功）。
 * その 2 倍以上を取り、スタック残量の揺らぎに左右されない値とする。
 * 一本鎖なので生成されるページ数も深さに比例（≒ `DEEP_CHAIN_DEPTH - 1` ページ）し、
 * 実行時間は 1 秒未満に収まる。
 */
const DEEP_CHAIN_DEPTH = 10_000;

describe('buildFiles - 深い階層（2.5）', () => {
  it(`一本鎖 ${DEEP_CHAIN_DEPTH} 段でも呼び出しスタックを尽きさせずに完走する`, () => {
    const tree = chainTree(DEEP_CHAIN_DEPTH);

    const files = buildFiles(tree, ['ESTIMATE']);

    // 表紙1 + 内訳書1 + 明細書（子を持つ階層 = 先頭から最下層の1つ上まで）
    const pages = files[0]!.pages;
    expect(pages).toHaveLength(2 + (DEEP_CHAIN_DEPTH - 1));
    expect(pages[0]!.kind).toBe('cover');
    expect(pages[1]!.kind).toBe('summary');
  });

  it('深い階層でも明細書ページを深さ優先・先行順で並べ、通し番号を連続させる（50.5, 50.6, 32.9）', () => {
    const detailPages = buildFiles(chainTree(DEEP_CHAIN_DEPTH), ['ESTIMATE'])[0]!.pages.filter(
      (page) => page.kind === 'detail'
    );

    // 明細書は上の階層から順に1ページずつ。親項目名（50.11）が階層の順序をそのまま表す
    expect(detailPages[0]!.parentLabel).toBe('Ａ.階層0');
    expect(detailPages[1]!.parentLabel).toBe('階層1');
    expect(detailPages[DEEP_CHAIN_DEPTH - 2]!.parentLabel).toBe(`階層${DEEP_CHAIN_DEPTH - 2}`);
    expect(detailPages.map((page) => page.parentLabel)).toEqual([
      'Ａ.階層0',
      ...Array.from({ length: DEEP_CHAIN_DEPTH - 2 }, (_, index) => `階層${index + 1}`),
    ]);
    // 通し番号は表紙・内訳書に続いて3から連続する（32.9, 50.8）
    expect(detailPages.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: DEEP_CHAIN_DEPTH - 1 }, (_, index) => index + 3)
    );
    // 最下層の項目は子を持たないので明細書ページを持たない（50.7）
    expect(detailPages.map((page) => page.parentLabel)).not.toContain(
      `階層${DEEP_CHAIN_DEPTH - 1}`
    );
  });

  it('深い階層の各明細書ページに見出し行・子項目行・合計行が揃う（52.11, 52.12, 52.10）', () => {
    const detailPages = buildFiles(chainTree(DEEP_CHAIN_DEPTH), ['ESTIMATE'])[0]!.pages.filter(
      (page) => page.kind === 'detail'
    );

    const last = detailPages[detailPages.length - 1]!;
    expect(last.rows.map((row) => [row.name, row.indentLevel])).toEqual([
      [`階層${DEEP_CHAIN_DEPTH - 2}`, 0],
      [`階層${DEEP_CHAIN_DEPTH - 1}`, 1],
    ]);
    expect(last.totalRow!.amount).toBe('1,000');
    // どのページでも合計行が欠けない（1階層1子なので継続ページは生じない / 50.10）
    expect(detailPages.every((page) => page.totalRow !== null)).toBe(true);
  });
});

describe('buildFiles - 書き換え前後のページ構成の同値', () => {
  it('基準出力が空でも些少でもない（比較そのものが空振りでないことの裏取り）', () => {
    expect(LAYOUT_FIXTURES.length).toBeGreaterThanOrEqual(8);
    expect(REPORT_LAYOUT_GOLDEN.length).toBeGreaterThan(250);
    expect(
      REPORT_LAYOUT_GOLDEN.filter((row) => row.includes('kind=detail')).length
    ).toBeGreaterThan(20);
  });

  it('代表フィクスチャの出力が基準出力と完全に一致する（50.6, 50.9, 50.10）', () => {
    const actual: string[] = [];
    for (const fixture of LAYOUT_FIXTURES) {
      actual.push(`=== ${fixture.name} ===`);
      for (const text of serializeFiles(buildFiles(fixture.tree, fixture.lineTypes))) {
        actual.push(text);
      }
    }

    expect(actual).toEqual([...REPORT_LAYOUT_GOLDEN]);
  });
});
