/**
 * @fileoverview 自己検査の配列リテラルを数え、最上位の対照配列を全数変異させる走査（タスク 115.252）
 *
 * ## なぜ置くか
 *
 * タスク 115.252 の候補5 は「配列リテラルを空にできる箇所が残っていないか」を問うた。
 * この問いは**そのままでは閉じない**。本自己検査群は失敗の指摘を一律 `string[]` で表すため、
 * 「配列リテラルを `[]` にする」変異の中には**主張そのものを削る変異**が含まれ、それは
 * 一般に検出できないからである（主張が無ければ反証も無い）。
 *
 * そこで判定基準を置き換える。**空にすると実行側の報告件数が縮むのに `EXIT=0` になるか**を
 * 問う。これは「真空パス」——何も確かめずに合格する経路——の定義そのものであり、
 * 全称量化の定義域（最上位の対照配列）を空化する変異で機械的に当たる。
 *
 * ## 走査範囲はコマンドで宣言する（115.274 / 115.275 の作法）
 *
 *   対象ファイル: `scripts/*.selftest.ts`（本走査の実行時に glob で解決する。件数は出力の先頭に出る）
 *
 * ## 使用方法
 *
 *   npx tsx scripts/scan-control-array-mutations.ts --census
 *     非空の配列リテラルの総数、うち最上位の対照配列の件数、`return [...]` の件数を数える。
 *
 *   npx tsx scripts/scan-control-array-mutations.ts --mutate-top-level
 *     最上位の対照配列を一件ずつ `[]` へ空化し、当該自己検査を走らせて赤緑を記録する。
 *
 *   npx tsx scripts/scan-control-array-mutations.ts --mutate-returns
 *     `return [...]` を一件ずつ `return []` へ空化し、同様に記録する。
 *
 * ## 定義
 *
 * - **非空の配列リテラル**: TypeScript の AST 上の `ArrayLiteralExpression` で要素数が 1 以上のもの。
 *   深さは問わない。文字列リテラルの中に書かれた見本のコードは AST に現れないため数に入らない。
 * - **最上位の対照配列**: ソースファイル直下の変数宣言文（`export` の有無を問わない）で、
 *   初期化子が非空の配列リテラルであるもの。`as const` / `satisfies` / 型注釈つきの包みは剥がす。
 *   これが全称量化（`for (const one of X)`）の定義域であり、空化すると報告件数が縮む。
 *
 * ## 走査対象が 0 件のとき合格にしない（第3原則）
 *
 * 本走査は**二つの空振り**を別々に塞ぐ。どちらも件数の印字では済ませず `process.exit(1)` する
 * （境界内 13 本の自己検査が検出器へ課している `走査対象が 0 件のとき合格にしない（第3原則）`
 * と同じ規則を、走査する側にも同じ形で課す）。
 *
 * 1. **走査根が空振り**: `scripts/*.selftest.ts` が 0 ファイル。
 * 2. **走査根は在るが変異対象が 0 件**: ファイルは在るのに最上位の対照配列 / `return [...]` が
 *    一件も取れない。
 *
 * 是正前の実測（2026-09-03。`SELFTEST_SUFFIX` を非一致値 `.no-such-suffix.ts` へ差し替える変異）:
 *
 *   --- scan-control-array-mutations.ts --mutate-top-level EXIT=0
 *   走査対象: scripts/*.selftest.ts（0 ファイル）
 *   結果: 0 件中 赤 0 件 / 緑 0 件
 *
 * 是正後の同じ変異の実測（2026-09-03）:
 *
 *   --- scan-control-array-mutations.ts --census EXIT=1
 *   ❌ 走査対象が 0 件です（scripts/*.no-such-suffix.ts が一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *   --- scan-control-array-mutations.ts --mutate-top-level EXIT=1
 *   ❌ 走査対象が 0 件です（scripts/*.no-such-suffix.ts が一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *   --- scan-control-array-mutations.ts --mutate-returns EXIT=1
 *   ❌ 走査対象が 0 件です（scripts/*.no-such-suffix.ts が一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *
 * 二つめの空振り（走査根は在るが変異対象が 0 件）は、`censusOf` の抽出条件を潰す変異で当てる。
 * 是正後の実測（2026-09-03。`inner.elements.length === 0` を `>= 0` へ差し替える変異）:
 *
 *   --- scan-control-array-mutations.ts --mutate-top-level EXIT=1
 *   走査対象: scripts/*.selftest.ts（15 ファイル）
 *   変異対象: 最上位の対照配列 0 件
 *   ❌ 変異対象が 0 件です（走査対象は 15 ファイル在るのに、最上位の対照配列が一件も取れませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *
 * 是正後の実測（2026-09-03。`inner.elements.length > 0` を `< 0` へ差し替える変異）:
 *
 *   --- scan-control-array-mutations.ts --mutate-returns EXIT=1
 *   走査対象: scripts/*.selftest.ts（15 ファイル）
 *   変異対象: return の非空の配列リテラル 0 件
 *   ❌ 変異対象が 0 件です（走査対象は 15 ファイル在るのに、return の非空の配列リテラルが一件も取れませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *
 * ## 変異のあとは必ず戻す
 *
 * 変異は元の本文をメモリに退避してから当て、`finally` で書き戻し、書き戻し後の内容が
 * 元と一致することを sha256 で照合する。一致しなければ非零で終了して人手の復元を促す。
 *
 * **`finally` はシグナルでは走らない。** 約 20 分かかる走査を人が Ctrl-C で止めるのは通常の
 * 使い方であり、対照配列が黙って空になったファイルが作業ツリーへ残るのは、このタスクが消しに
 * 来た欠陥そのものの形である。そこで変異が当たっている間だけ `SIGINT` / `SIGTERM` のハンドラを
 * 張り、受信時に退避した本文を書き戻し、子プロセスを落としてから同じシグナルを自分へ再送出する。
 *
 * **同期実行のままではこれは塞げない。** 実測（2026-09-03）: `execFileSync` を回す同期ループへ
 * `process.on('SIGTERM', ...)` を張って走行中に `kill -TERM` を送ると、ハンドラは最後まで一度も
 * 走らず、既定の終了まで抑止され、シグナルは黙って捨てられた（6 反復のループが最後まで走り
 * `exit=0`）。同じ形を `execFile` の `await` に置き換えると 0.4 秒後にハンドラが走り、再送出で
 * `exit=143` になった。本走査を非同期にしてあるのはこの計測の結果である。
 *
 * 是正前後の実測（2026-09-03。走査を新しいプロセスグループへ置き、Ctrl-C と同じくグループ全体へ
 * `SIGINT` を送る。どちらも同じ変異箇所で止まった）:
 *
 *   --- 是正前（`execFileSync` + `finally` のみ）EXIT=130
 *   （警告も痕跡もなし。`scripts/check-dead-script-env.selftest.ts:244` の `CI_STRUCTURE_SAMPLES` が
 *     `readonly CiStructureSample[] = []` のまま追跡ファイルに残り、
 *     `git diff --shortstat -- 'scripts/*.selftest.ts'` は `13 files changed, 2645 insertions(+), 157 deletions(-)`
 *     になった。**計測時点の**基線は `13 files changed, 2644 insertions(+), 120 deletions(-)`
 *     であった（基線の絶対値はこの後の記録の加筆で動く。見るべきは基線からの差である）。）
 *
 *   --- 是正後（非同期化 + シグナルハンドラ）EXIT=130
 *   ⚠️ SIGINT を受け取りました。scripts/check-dead-script-env.selftest.ts:244 CI_STRUCTURE_SAMPLES を変異前へ書き戻しました。
 *   （15 本すべてが `sha256sum -c` に一致し、`git diff --shortstat` は基線の 2644/120 のままであった。）
 *
 * **残る限界（塞いでいないこと）**: `SIGKILL`（`kill -9`）とプロセスの強制終了・電源断は
 * 捕まえられない。その場合は変異したファイルが作業ツリーに残る。`git diff --shortstat` を見て
 * 件数が想定と違えば、`git diff` で `[]` になった配列を特定して手で戻すこと。
 */

import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS_DIRECTORY = path.join(REPOSITORY_ROOT, 'scripts');
const SELFTEST_SUFFIX = '.selftest.ts';

const runChild = promisify(execFile);

/** シグナル受信時に落とすため、実行中の子プロセスを保持する */
let activeChild: ChildProcess | undefined;

interface ArraySite {
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly elements: number;
}

interface FileCensus {
  readonly file: string;
  readonly nonEmptyLiterals: number;
  readonly topLevelControls: readonly ArraySite[];
  readonly returnLiterals: readonly ArraySite[];
}

function listSelftestFiles(): string[] {
  return readdirSync(SCRIPTS_DIRECTORY)
    .filter((one) => one.endsWith(SELFTEST_SUFFIX))
    .sort()
    .map((one) => path.join(SCRIPTS_DIRECTORY, one));
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );
}

/** `[...] as const` / `[...] satisfies T` / `<T>[...]` の包みを剥がす */
function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

function siteOf(
  sourceFile: ts.SourceFile,
  file: string,
  name: string,
  literal: ts.ArrayLiteralExpression
): ArraySite {
  const start = literal.getStart(sourceFile);
  return {
    file,
    name,
    line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
    start,
    end: literal.getEnd(),
    elements: literal.elements.length,
  };
}

function censusOf(file: string): FileCensus {
  const sourceFile = parse(file);
  const relative = path.relative(REPOSITORY_ROOT, file);
  let nonEmptyLiterals = 0;
  const topLevelControls: ArraySite[] = [];
  const returnLiterals: ArraySite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node) && node.elements.length > 0) {
      nonEmptyLiterals += 1;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      const inner = unwrap(node.expression);
      if (ts.isArrayLiteralExpression(inner) && inner.elements.length > 0) {
        returnLiterals.push(siteOf(sourceFile, relative, 'return', inner));
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer === undefined) continue;
      const inner = unwrap(declaration.initializer);
      if (!ts.isArrayLiteralExpression(inner) || inner.elements.length === 0) continue;
      topLevelControls.push(
        siteOf(sourceFile, relative, declaration.name.getText(sourceFile), inner)
      );
    }
  }

  return { file: relative, nonEmptyLiterals, topLevelControls, returnLiterals };
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 自己検査を走らせ、終了コードと最終行を返す */
async function runSelftest(
  file: string
): Promise<{ readonly code: number; readonly lastLine: string }> {
  const pending = runChild('npx', ['tsx', file], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  activeChild = pending.child;
  try {
    const { stdout } = await pending;
    return { code: 0, lastLine: lastNonEmptyLine(stdout) };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string };
    const code = typeof failure.code === 'number' ? failure.code : 1;
    return { code, lastLine: lastNonEmptyLine(failure.stdout ?? '') };
  } finally {
    activeChild = undefined;
  }
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split('\n').filter((one) => one.trim() !== '');
  const last = lines[lines.length - 1];
  return last === undefined ? '(出力なし)' : last.trim();
}

/**
 * 一箇所を `[]` へ空化して自己検査を走らせ、必ず書き戻す
 *
 * 書き戻したあとに内容の要約が元と一致することを照合する。一致しない場合は復元の失敗であり、
 * その場で throw して以降の変異を止める。
 *
 * `finally` はシグナルでは走らないため、変異が当たっている間だけ `SIGINT` / `SIGTERM` の
 * ハンドラを張る。受信時は退避した本文を書き戻し、実行中の子プロセスを落としてから、
 * ハンドラを外して同じシグナルを自分へ再送出する（既定の終了へ委ねる）。
 * 冒頭の「変異のあとは必ず戻す」の節に、この形にした計測の逐語と残る限界を置いてある。
 */
async function mutateAndRun(
  site: ArraySite
): Promise<{ readonly code: number; readonly lastLine: string }> {
  const absolute = path.join(REPOSITORY_ROOT, site.file);
  const original = readFileSync(absolute, 'utf8');
  const before = digest(original);

  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    writeFileSync(absolute, original, 'utf8');
  };

  const handlers = new Map<NodeJS.Signals, () => void>();
  const detach = (): void => {
    for (const [name, handler] of handlers) process.off(name, handler);
    handlers.clear();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = (): void => {
      restore();
      activeChild?.kill(signal);
      console.error(
        `\n⚠️ ${signal} を受け取りました。${site.file}:${site.line} ${site.name} を変異前へ書き戻しました。`
      );
      detach();
      process.kill(process.pid, signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  try {
    writeFileSync(
      absolute,
      original.slice(0, site.start) + '[]' + original.slice(site.end),
      'utf8'
    );
    return await runSelftest(absolute);
  } finally {
    detach();
    restore();
    const after = digest(readFileSync(absolute, 'utf8'));
    if (after !== before) {
      throw new Error(`復元に失敗しました: ${site.file}（変異前 ${before} / 復元後 ${after}）`);
    }
  }
}

function printCensus(files: readonly string[]): void {
  const rows = files.map(censusOf);
  console.log(`走査対象: scripts/*.selftest.ts（${files.length} ファイル）\n`);
  console.log('ファイル / 非空の配列リテラル / 最上位の対照配列 / return の非空リテラル');
  for (const row of rows) {
    console.log(
      `  ${path.basename(row.file).padEnd(48)} ${String(row.nonEmptyLiterals).padStart(5)} ` +
        `${String(row.topLevelControls.length).padStart(5)} ${String(row.returnLiterals.length).padStart(5)}`
    );
  }
  const literals = rows.reduce((sum, one) => sum + one.nonEmptyLiterals, 0);
  const controls = rows.reduce((sum, one) => sum + one.topLevelControls.length, 0);
  const returns = rows.reduce((sum, one) => sum + one.returnLiterals.length, 0);
  console.log(
    `\n合計: 非空の配列リテラル ${literals} 件 / 最上位の対照配列 ${controls} 件 / return の非空リテラル ${returns} 件`
  );
}

async function printMutation(
  files: readonly string[],
  kind: 'top-level' | 'returns'
): Promise<void> {
  const rows = files.map(censusOf);
  const sites = rows.flatMap((row) =>
    kind === 'top-level' ? row.topLevelControls : row.returnLiterals
  );
  const kindLabel = kind === 'top-level' ? '最上位の対照配列' : 'return の非空の配列リテラル';
  console.log(`走査対象: scripts/*.selftest.ts（${files.length} ファイル）`);
  console.log(`変異対象: ${kindLabel} ${sites.length} 件\n`);

  // 走査根は在るのに変異対象が 0 件、という空振りを塞ぐ（AI運用7原則 第3原則）。
  // 0 件の全数変異は「赤 0 件 / 緑 0 件」という合格に見える出力になるため、印字では済ませない。
  if (sites.length === 0) {
    console.error(
      `❌ 変異対象が 0 件です（走査対象は ${files.length} ファイル在るのに、${kindLabel}が` +
        '一件も取れませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。'
    );
    process.exit(1);
  }

  const green: ArraySite[] = [];
  let index = 0;
  for (const site of sites) {
    index += 1;
    const result = await mutateAndRun(site);
    const verdict = result.code === 0 ? '🟢 緑' : '🔴 赤';
    if (result.code === 0) green.push(site);
    console.log(
      `  [${String(index).padStart(3)}/${sites.length}] ${verdict} ${path.basename(site.file)}:${site.line} ` +
        `${site.name}（要素 ${site.elements}） EXIT=${result.code} | ${result.lastLine}`
    );
  }

  console.log(
    `\n結果: ${sites.length} 件中 赤 ${sites.length - green.length} 件 / 緑 ${green.length} 件`
  );
  for (const one of green) {
    console.log(`  🟢 緑のまま: ${one.file}:${one.line} ${one.name}`);
  }
}

async function main(): Promise<void> {
  const files = listSelftestFiles();

  // 走査根が空振りしたまま合格にしない（AI運用7原則 第3原則）。
  // 件数を先頭に印字するだけでは緩和にすぎず、EXIT=0 で終われば合格として読まれる。
  if (files.length === 0) {
    console.error(
      `❌ 走査対象が 0 件です（${path.relative(REPOSITORY_ROOT, SCRIPTS_DIRECTORY)}/*${SELFTEST_SUFFIX} が` +
        '一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。'
    );
    process.exit(1);
  }

  const argument = process.argv[2] ?? '--census';
  if (argument === '--census') {
    printCensus(files);
    return;
  }
  if (argument === '--mutate-top-level') {
    await printMutation(files, 'top-level');
    return;
  }
  if (argument === '--mutate-returns') {
    await printMutation(files, 'returns');
    return;
  }
  console.error(`未知の引数です: ${argument}（--census / --mutate-top-level / --mutate-returns）`);
  process.exit(1);
}

await main();
