/**
 * @fileoverview 待機の対象外の規則が働きうる母集団の一覧（タスク 115.322）
 *
 * ## なぜ置くか
 *
 * `scripts/check-e2e-assertion-guards.ts` の `retryExhaustionFailureExclusion` は、
 * 節点が主張を含むなら対象外にしない条件（同関数の条件 (a)）を持つ。この条件を単独で
 * 固定する対照は実データに無く、自己検査の合成の見本
 * （`段7-5 条件式に expect があれば検出する`）だけが持つ。**なぜ実データが対照に
 * なりえないのか**を後任が追試できるようにするための一覧である。
 *
 * タスク 115.318 が `scripts/check-traceability-coverage.ts` の
 * `markCodeFenceLines` の註へ採取コマンドを併記したのと同じ位置づけであり、
 * `.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」が
 * 求める**追試の手順を数値と同じ場所に置く**ための出口にあたる。同書の
 * 「「掃き終えた」を未検証の前提で支えない」が求める**走査範囲をコマンドで宣言する**
 * 形も、本スクリプトが二つの範囲を印字することで満たす。
 *
 * ## 何を数えるか（二つの範囲を並べて印字する）
 *
 * 1. **検出器の走査対象**——`collectE2eFiles()` が返す集合。すなわち
 *    `check-e2e-assertion-guards.ts` の `SCAN_SUBDIRS`（`e2e/specs` / `e2e/helpers` /
 *    `e2e/fixtures`）配下の `.ts` 全件である。範囲は検出器の実装から取るため、
 *    本スクリプトの側に範囲の宣言を持たない。
 * 2. **未走査の残余**——`e2e/` 配下の `.ts` 全件。1 に加えて `e2e/config.ts` /
 *    `e2e/global-setup.ts` / `e2e/reporters/` を含む。検出器は 1 しか見ないが、
 *    全称否定（「条件式に主張を包む形は 0 件」）を 1 の範囲だけで述べると、
 *    範囲外の反例を黙って落とすことになるため、こちらも数える。
 *
 * それぞれの範囲について次を印字する。
 *
 *   - ファイル数
 *   - `else` を持たない `if` の数（`retryExhaustionFailureExclusion` が判定しうる母集団）
 *   - そのうち同関数が現に対象外にしている数と、その所在（`--list` で全件）
 *   - **条件式が主張を含む `if` の数**——条件 (a) が単独で効く唯一の形。判定には検出器の
 *     `containsAssertion` を条件式へ当てる（意味を検出器と揃えるため）。
 *   - 併せて字面の `expect(` を条件式に持つ `if` の数（正規表現による粗い数え方。
 *     意味による数え方と食い違えば、どちらかの前提が崩れている合図になる）
 *
 * ## 使い方
 *
 *     npx tsx scripts/survey-retry-exhaustion-exclusion-population.ts [--list]
 *
 * 起動位置には依らない（走査根は本ファイルからの相対で解決する）。`--list` は対象外に
 * なっている `if` の所在を全件印字する（件数だけの出口では読み直しを追試できない。
 * `.kiro/steering/development-discipline.md` の「一件ずつ読んだ」に関する要求）。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';
import {
  collectE2eFiles,
  containsAssertion,
  retryExhaustionFailureExclusion,
} from './check-e2e-assertion-guards.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const E2E_DIR = path.join(ROOT, 'e2e');

/** 字面で条件式の `expect(` を数えるための粗い網（意味による数え方との突き合わせ用） */
const TEXTUAL_EXPECT = /\bexpect\s*\(/;

interface Tally {
  /** 走査したファイル数 */
  files: number;
  /** `else` を持たない `if` の数 */
  ifWithoutElse: number;
  /** `retryExhaustionFailureExclusion` が対象外にした `if` の所在 */
  excluded: string[];
  /** 条件式が主張を含む `if` の数（`containsAssertion` による） */
  assertionInCondition: number;
  /** 条件式に `expect(` の字面を持つ `if` の数（正規表現による） */
  textualExpectInCondition: number;
}

/** `e2e/` 配下の `.ts` を全件集める（未走査の残余の範囲） */
function collectAllE2eFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectAllE2eFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

function tally(files: readonly string[]): Tally {
  const result: Tally = {
    files: files.length,
    ifWithoutElse: 0,
    excluded: [],
    assertionInCondition: 0,
    textualExpectInCondition: 0,
  };
  for (const absPath of files) {
    const source = ts.createSourceFile(
      absPath,
      fs.readFileSync(absPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (ts.isIfStatement(node) && !node.elseStatement) {
        result.ifWithoutElse += 1;
        if (retryExhaustionFailureExclusion(node)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          result.excluded.push(`${path.relative(ROOT, absPath)}:${line + 1}`);
        }
        if (containsAssertion(node.expression)) result.assertionInCondition += 1;
        if (TEXTUAL_EXPECT.test(node.expression.getText(source))) {
          result.textualExpectInCondition += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  result.excluded.sort();
  return result;
}

function report(label: string, result: Tally, list: boolean): string[] {
  const lines = [
    `${label}`,
    `  ファイル: ${result.files} 件`,
    `  else を持たない if: ${result.ifWithoutElse} 件`,
    `  うち規則で対象外: ${result.excluded.length} 件`,
    `  条件式が主張を含む if（containsAssertion）: ${result.assertionInCondition} 件`,
    `  条件式に expect( の字面を持つ if（正規表現）: ${result.textualExpectInCondition} 件`,
  ];
  if (list) lines.push(...result.excluded.map((site) => `    ${site}`));
  return lines;
}

export function run(args: readonly string[] = []): number {
  const list = args.includes('--list');
  const scanned = tally(collectE2eFiles());
  const wholeTree = tally(collectAllE2eFiles(E2E_DIR));
  const lines = [
    '待機の対象外の規則（retryExhaustionFailureExclusion）が働きうる母集団',
    '',
    ...report('[1] 検出器の走査対象（collectE2eFiles）', scanned, list),
    '',
    ...report('[2] 未走査の残余を含む e2e/ 全体', wholeTree, list),
  ];
  console.log(lines.join('\n'));
  return 0;
}

process.exit(run(process.argv.slice(2)));
