/**
 * @fileoverview steering の実行方法の検査 判定器の自己検査（タスク 115.288）
 *
 * `scripts/check-steering-command-annotations.ts` の判定器が
 *   (1) **緩む向き**——実在しないスクリプト・偽の選択範囲の主張・食い違う実行器を
 *       取り逃がさないこと、
 *   (2) **狭まる向き**——正しい記述・過去についての記録・正規表現の断片を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の中核は**実在した綴りである**。
 *
 *   - `npm --prefix frontend run validate:esm` は本タスクの着手時点で
 *     `.kiro/steering/tech.md` に在った実物であり、`frontend/package.json` に
 *     同名のスクリプトは無い（実際に叩くと `npm error Missing script: "validate:esm"` で
 *     終了コード 1。コミット `511000a7`、2026-09-05 にリポジトリルートで実測）。
 *   - `npm --prefix backend run test        # 全テスト実行` は起票の変異 (a) が
 *     書き戻す旧来の偽の註そのものである。
 *   - `npx ts-node e2e/helpers/browser.ts` はタスク 115.287 が是正した実行器の食い違いである。
 *
 * ## 対照群の母集団を空にする変異が赤くなること（AI運用7原則 第3原則）
 *
 * 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。前提の確認は
 * 配列への登録ではなく `reportPreconditions` の直列の手続きとして書き、`main` の冒頭で対照
 * より先に走らせる。呼び出しごと外す経路は `checkPreconditionsAreWired` が塞ぎ、その守り手は
 * `function check` 宣言なので `checkStructuralWiring` が結線を強制する。相互に施錠される。
 *
 * ## 下限をどこに置くか（115.222 / 115.275 の判断を引き継ぐ）
 *
 *   - `STRUCTURAL`: 本ファイルが宣言する `function check*` を一つ残らず結線していること。
 *     **限界**: 語彙は行頭の `function check` という宣言の形から取るため、アロー式で書いた
 *     未結線の検査だけが素通りする。本ファイルの検査関数は全て `function` 宣言で書くこと。
 *   - `MUST_DETECT` / `MUST_NOT_DETECT`: 根拠の無い件数を貼らない代わりに「陽性・陰性の
 *     どちらかが空になったら赤くする」下限を置く。片側だけの対照は判定器が恒真・恒偽へ
 *     退化しても通ってしまうためである。
 *   - `FINDING_KINDS`: 本体が宣言する種別を**一つ残らず**対照が覆っていること。種別を
 *     足して対照を書き忘れる経路を塞ぐ。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-command-annotations.selftest.ts
 *   npm run check:steering-command-annotations:selftest
 *
 * 判定器が壊れたまま本検査が「合格」を出す状態を防ぐため、押下前の関門と CI では
 * 本検査の前に走らせる。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DETECTOR_POSITIVE_CONTROL,
  EXHAUSTIVE_CLAIM_WORDS,
  MEASUREMENT_DATE_PATTERN,
  RESTRICTED_CLAIM_WORDS,
  STEERING_DIRECTORY,
  associateClaim,
  decideExit,
  extractVitestInvocation,
  globToRegExp,
  parseExecutorReferences,
  parseScopeClaims,
  parseScriptReferences,
  run,
  selectFiles,
  type FindingKind,
  type RunResult,
  type SelectionResolver,
} from './check-steering-command-annotations.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SELFTEST_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SELFTEST_PATH), '..');
const SUBJECT_PATH = path.join(REPOSITORY_ROOT, 'scripts/check-steering-command-annotations.ts');

interface Failure {
  scope: string;
  detail: string;
}
const failures: Failure[] = [];
function fail(scope: string, detail: string): void {
  failures.push({ scope, detail });
}

/** 本体が宣言する検出の種別。対照が一つ残らず覆っていることを下で確かめる */
const FINDING_KINDS: readonly FindingKind[] = [
  'missing-script',
  'overclaimed-scope',
  'underclaimed-scope',
  'divergent-executor',
];

/** 検出されなければならない綴り（いずれも実在した／起票が名指した形） */
const MUST_DETECT: readonly { label: string; line: string; kind: FindingKind }[] = [
  {
    label: 'frontend に無いスクリプトを名指す（着手時点の実物）',
    line: 'npm --prefix frontend run validate:esm',
    kind: 'missing-script',
  },
  {
    label: 'どのパッケージにも無いスクリプト',
    line: 'npm run zzz:nonexistent-script',
    kind: 'missing-script',
  },
  {
    label: '起票の変異 (a) が書き戻す偽の註',
    line: 'npm --prefix backend run test        # 全テスト実行',
    kind: 'overclaimed-scope',
  },
  {
    label: '全件のスクリプトへ「〜だけを回す」と註する',
    line: 'npm --prefix frontend run test  # frontend の一部だけを回す',
    kind: 'underclaimed-scope',
  },
  {
    label: '115.287 が是正した実行器の食い違い',
    line: 'npx ts-node e2e/helpers/browser.ts screenshot',
    kind: 'divergent-executor',
  },
];

/** 検出してはならない綴り（現に steering に在る正しい記述と、正規表現の断片） */
const MUST_NOT_DETECT: readonly { label: string; line: string }[] = [
  {
    label: '実在するスクリプトの正しい註',
    line: 'npm --prefix backend run test:unit   # src/__tests__/unit/ 配下だけを回す',
  },
  {
    label: '全件のスクリプトへ全件と註する',
    line: 'npm --prefix frontend run test        # 全テスト実行',
  },
  {
    label: '正規表現の断片（スクリプト名ではない）',
    line: "grep -oE 'npm run check:[a-z0-9-]+' .husky/scripts/pre-push.sh | sort -u",
  },
  {
    label: '`cd <dir> &&` が作業対象を決める形',
    line: 'cd frontend && npm run dev',
  },
  {
    label: '実測日を持つ過去についての記録（規約 (a)）',
    line: '_2026-09-02（Steering Sync: `npm --prefix backend run test` の註「全テスト実行」が偽であった）_',
  },
];

/** 合成の解決器。backend の `test` は一部、frontend の `test` は全件、として答える */
const syntheticResolver: SelectionResolver = async (scope, command) => {
  if (!/vitest/.test(command)) return undefined;
  if (scope === 'backend') return { selected: ['a', 'b'], exhaustive: ['a', 'b', 'c'] };
  if (scope === 'frontend') return { selected: ['a', 'b'], exhaustive: ['a', 'b'] };
  return undefined;
};

/** 一時のリポジトリを組み、与えた本文で判定器を走らせる */
async function runOnSyntheticDocument(body: string): Promise<RunResult> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'steering-cmd-selftest-'));
  try {
    mkdirSync(path.join(root, STEERING_DIRECTORY), { recursive: true });
    writeFileSync(path.join(root, STEERING_DIRECTORY, 'probe.md'), body, 'utf8');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { 'check:steering-refs': 'x', dev: 'x' } }),
      'utf8'
    );
    mkdirSync(path.join(root, 'backend'), { recursive: true });
    writeFileSync(
      path.join(root, 'backend/package.json'),
      JSON.stringify({
        scripts: { test: 'vitest run', 'test:unit': 'vitest run src/__tests__/unit' },
      }),
      'utf8'
    );
    mkdirSync(path.join(root, 'frontend'), { recursive: true });
    writeFileSync(
      path.join(root, 'frontend/package.json'),
      JSON.stringify({ scripts: { test: 'vitest run', dev: 'vite' } }),
      'utf8'
    );
    return await run({
      root,
      targets: [`${STEERING_DIRECTORY}/probe.md`],
      resolveSelection: syntheticResolver,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** 前提: 対照群が空でないこと。空のまま緑で通る真空パスを塞ぐ */
function reportPreconditions(): void {
  if (MUST_DETECT.length === 0) fail('PRECONDITION', 'MUST_DETECT が空です');
  if (MUST_NOT_DETECT.length === 0) fail('PRECONDITION', 'MUST_NOT_DETECT が空です');
  // 語彙は `as const` で長さが型に焼き付くため、`readonly string[]` へ広げてから数える。
  // 焼き付いたまま比べると型の側で常に偽になり、対照が空になっても赤くならない。
  const exhaustiveWords: readonly string[] = EXHAUSTIVE_CLAIM_WORDS;
  const restrictedWords: readonly string[] = RESTRICTED_CLAIM_WORDS;
  if (exhaustiveWords.length === 0) fail('PRECONDITION', '全件の語彙が空です');
  if (restrictedWords.length === 0) fail('PRECONDITION', '限定の語彙が空です');
  const covered = new Set(MUST_DETECT.map((entry) => entry.kind));
  for (const kind of FINDING_KINDS) {
    if (!covered.has(kind)) fail('PRECONDITION', `検出の種別 ${kind} を覆う陽性の対照がありません`);
  }
}

/** `reportPreconditions` の呼び出しごと外す経路を塞ぐ */
function checkPreconditionsAreWired(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const mainBody = source.slice(source.indexOf('async function main('));
  if (!mainBody.includes('reportPreconditions()')) {
    fail('STRUCTURAL', 'main が reportPreconditions を呼んでいません');
  }
}

/**
 * 本ファイルが宣言する `function check*` を一つ残らず main が呼んでいること。
 *
 * **`async function` も語彙へ入れる。** 入れずに書いたところ、非同期で書いた四つの検査
 * （`checkMustDetect` / `checkMustNotDetect` / `checkDatedRecordExemption` /
 * `checkRealTargetIsScanned`）が結線の強制の外に落ちていた。網から外れる形を作った時点で
 * 「一つ残らず」の主張が偽になる。
 */
function checkStructuralWiring(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const declared = [...source.matchAll(/^(?:async )?function (check[A-Za-z0-9_]*)\(/gm)].map(
    (m) => m[1] ?? ''
  );
  const mainBody = source.slice(source.indexOf('async function main('));
  for (const name of declared) {
    if (!mainBody.includes(`${name}()`)) {
      fail('STRUCTURAL', `${name} が main から結線されていません`);
    }
  }
  if (declared.length === 0) fail('STRUCTURAL', '検査関数の宣言を一つも拾えませんでした');
  // 非同期の検査が語彙から落ちていないことを、実在する名前で固定する
  if (!declared.includes('checkMustDetect')) {
    fail('STRUCTURAL', '非同期で宣言した検査が結線の語彙から落ちています');
  }
}

/** スクリプト参照の解釈（作業対象の決定と、正規表現の断片の棄却） */
function checkScriptReferenceParsing(): void {
  const prefixed = parseScriptReferences('npm --prefix frontend run validate:esm');
  if (
    prefixed.length !== 1 ||
    prefixed[0]?.scope !== 'frontend' ||
    prefixed[0]?.name !== 'validate:esm'
  ) {
    fail('PARSE', `--prefix の解釈が壊れています: ${JSON.stringify(prefixed)}`);
  }
  const viaCd = parseScriptReferences('cd frontend && npm run dev');
  if (viaCd.length !== 1 || viaCd[0]?.scope !== 'frontend') {
    fail('PARSE', `cd <dir> && の解釈が壊れています: ${JSON.stringify(viaCd)}`);
  }
  const bare = parseScriptReferences('- `npm run build` 内で実行');
  if (bare.length !== 1 || bare[0]?.scope !== null) {
    fail('PARSE', `作業対象を伴わない参照の解釈が壊れています: ${JSON.stringify(bare)}`);
  }
  const fragment = parseScriptReferences("grep -oE 'npm run check:[a-z0-9-]+' x.sh");
  if (fragment.length !== 0) {
    fail('PARSE', `正規表現の断片を参照として拾っています: ${JSON.stringify(fragment)}`);
  }
}

/**
 * 主張の語は**行内で最も近い**参照へ結びつくこと。
 *
 * 是正前の版はこれを行単位で結びつけており、`.kiro/steering/product.md` の
 * 「…backend の既定の実行が `npm --prefix backend run test`、…frontend の全件が
 * `npm --prefix frontend run test` の出力で数える」という実在の行で backend 側が
 * 誤って告発された。逐語の行で結びつきを固定する。
 */
function checkClaimAssociationByDistance(): void {
  const line =
    '件数は backend の既定の実行が `npm --prefix backend run test`、frontend の全件が `npm --prefix frontend run test` の出力で数える';
  const references = parseScriptReferences(line);
  const mentions = parseScopeClaims(line);
  if (references.length !== 2) {
    fail('ASSOCIATE', `参照が 2 件でなく ${references.length} 件です`);
    return;
  }
  const exhaustive = mentions.find((mention) => mention.claim === 'exhaustive');
  if (!exhaustive) {
    fail('ASSOCIATE', '全件の語を拾えませんでした');
    return;
  }
  const associated = associateClaim(references, exhaustive);
  if (associated?.scope !== 'frontend') {
    fail('ASSOCIATE', `全件の語が ${associated?.scope} 側へ結びついています（frontend を期待）`);
  }
}

/** glob → 正規表現の変換（vitest 構成が使う形だけを解する） */
function checkGlobConversion(): void {
  const cases: { glob: string; hit: string[]; miss: string[] }[] = [
    {
      glob: 'src/**/*.{test,spec}.ts',
      hit: ['src/a.test.ts', 'src/x/y/b.spec.ts'],
      miss: ['src/a.ts', 'other/a.test.ts', 'src/a.test.tsx'],
    },
    {
      glob: '**/node_modules/**',
      hit: ['node_modules/x.ts', 'a/b/node_modules/c/d.ts'],
      miss: ['src/a.ts'],
    },
    {
      glob: 'src/__tests__/integration/**/*.{test,spec}.ts',
      hit: ['src/__tests__/integration/a.test.ts', 'src/__tests__/integration/x/b.spec.ts'],
      miss: ['src/__tests__/unit/a.test.ts'],
    },
  ];
  for (const testCase of cases) {
    const pattern = globToRegExp(testCase.glob);
    for (const value of testCase.hit) {
      if (!pattern.test(value)) fail('GLOB', `${testCase.glob} が ${value} に当たりません`);
    }
    for (const value of testCase.miss) {
      if (pattern.test(value)) fail('GLOB', `${testCase.glob} が ${value} に当たってしまいます`);
    }
  }
}

/** 構成と位置引数から選択集合を導けること */
function checkSelection(): void {
  const files = [
    'src/a.test.ts',
    'src/__tests__/unit/b.test.ts',
    'src/__tests__/integration/c.test.ts',
    'src/notatest.ts',
  ];
  const all = selectFiles(files, {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**'],
    filters: [],
  });
  if (all.length !== 3) fail('SELECT', `全件が 3 件でなく ${all.length} 件です: ${all.join(',')}`);
  const defaultRun = selectFiles(files, {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', 'src/__tests__/integration/**/*.{test,spec}.ts'],
    filters: [],
  });
  if (defaultRun.length !== 2) {
    fail('SELECT', `統合検証を除いた選択が 2 件でなく ${defaultRun.length} 件です`);
  }
  const filtered = selectFiles(files, {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**'],
    filters: ['src/__tests__/unit'],
  });
  if (filtered.length !== 1)
    fail('SELECT', `位置引数の絞りが 1 件でなく ${filtered.length} 件です`);
}

/** npm スクリプトの綴りから vitest の起動区間を取り出せること */
function checkVitestInvocationExtraction(): void {
  const plain = extractVitestInvocation('vitest run');
  if (!plain || plain.configFile !== undefined || plain.filters.length !== 0) {
    fail('INVOKE', `素の vitest run の解釈が壊れています: ${JSON.stringify(plain)}`);
  }
  const chained = extractVitestInvocation(
    'rm -rf coverage && mkdir -p coverage/.tmp && vitest run --coverage'
  );
  if (!chained || chained.filters.length !== 0) {
    fail('INVOKE', `&& 連結の解釈が壊れています: ${JSON.stringify(chained)}`);
  }
  const configured = extractVitestInvocation('vitest run --config vitest.integration.config.ts');
  if (configured?.configFile !== 'vitest.integration.config.ts') {
    fail('INVOKE', `--config の解釈が壊れています: ${JSON.stringify(configured)}`);
  }
  const positional = extractVitestInvocation('vitest run src/__tests__/unit');
  if (positional?.filters[0] !== 'src/__tests__/unit') {
    fail('INVOKE', `位置引数の解釈が壊れています: ${JSON.stringify(positional)}`);
  }
  const notVitest = extractVitestInvocation('sh scripts/run-all-tests.sh');
  if (notVitest !== undefined) {
    fail('INVOKE', 'vitest でない綴りから起動区間を取り出しています');
  }
}

/** 陽性の対照が一つ残らず検出されること */
async function checkMustDetect(): Promise<void> {
  for (const entry of MUST_DETECT) {
    const body =
      entry.kind === 'divergent-executor'
        ? `${entry.line}\nnpx tsx e2e/helpers/browser.ts info\n`
        : `${entry.line}\n`;
    const result = await runOnSyntheticDocument(body);
    const hit = result.findings.some((finding) => finding.kind === entry.kind);
    if (!hit) {
      fail(
        'MUST_DETECT',
        `${entry.label}: ${entry.kind} を検出しませんでした（検出 ${result.findings
          .map((f) => f.kind)
          .join(',')}）`
      );
    }
  }
}

/** 陰性の対照が一件も告発されないこと */
async function checkMustNotDetect(): Promise<void> {
  for (const entry of MUST_NOT_DETECT) {
    const result = await runOnSyntheticDocument(`${entry.line}\n`);
    if (result.findings.length > 0) {
      fail(
        'MUST_NOT_DETECT',
        `${entry.label}: ${result.findings.length} 件が告発されました（${result.findings
          .map((f) => `${f.kind}:${f.subject}`)
          .join(' / ')}）`
      );
    }
  }
}

/**
 * 実測日を持つ行が (ii) の照合から外れ、かつ**外れたことが数えられている**こと。
 *
 * 免除を「そもそも入口に入らない」形で書くと、免除の件数が 0 のまま緑になり、規約 (a) の
 * 逃げ道がどれだけ使われているかが見えなくなる（タスク 115.275 の自己検査が同型の取り違えを
 * 塞いでいる）。
 */
async function checkDatedRecordExemption(): Promise<void> {
  const dated = await runOnSyntheticDocument(
    '_2026-09-02（Steering Sync: `npm --prefix backend run test` の註「全テスト実行」が偽であった）_\n'
  );
  if (dated.findings.length !== 0) {
    fail('EXEMPT', `実測日を持つ記録が ${dated.findings.length} 件告発されました`);
  }
  if (dated.exemptedDatedClaims !== 1) {
    fail('EXEMPT', `免除の件数が 1 でなく ${dated.exemptedDatedClaims} です`);
  }
  const undated = await runOnSyntheticDocument(
    '`npm --prefix backend run test` は全テストを回す\n'
  );
  if (!undated.findings.some((finding) => finding.kind === 'overclaimed-scope')) {
    fail('EXEMPT', '実測日を外した同じ主張が検出されません（免除が万能の逃がし口になっています）');
  }
  if (!MEASUREMENT_DATE_PATTERN.test('2026-09-05')) {
    fail('EXEMPT', '実測日の形が `YYYY-MM-DD` に当たりません');
  }
}

/** 実行器の照合が、同じ資材が二度以上現れる場合にだけ働くこと */
function checkExecutorParsing(): void {
  const parsed = parseExecutorReferences('npx tsx e2e/helpers/browser.ts screenshot http://x');
  if (
    parsed.length !== 1 ||
    parsed[0]?.executor !== 'npx tsx' ||
    parsed[0]?.target !== 'e2e/helpers/browser.ts'
  ) {
    fail('EXECUTOR', `起動コマンドの解釈が壊れています: ${JSON.stringify(parsed)}`);
  }
  const none = parseExecutorReferences('`e2e/helpers/browser.ts` により操作が可能');
  if (none.length !== 0) {
    fail(
      'EXECUTOR',
      `実行器を伴わない言及を起動コマンドとして拾っています: ${JSON.stringify(none)}`
    );
  }
}

/** 空振りの走査が緑で通らないこと（第3原則） */
function checkVacuousRunsFail(): void {
  const base: RunResult = {
    findings: [],
    scannedFiles: ['x'],
    scannedLines: 10,
    checkedReferences: 1,
    checkedScopeClaims: 1,
    exemptedDatedClaims: 0,
    checkedExecutorTargets: 1,
    detectorPositive: true,
  };
  if (!decideExit(base).ok) fail('VACUOUS', '健全な結果が不合格になりました');
  const degradations: { label: string; result: RunResult }[] = [
    { label: '走査対象が空', result: { ...base, scannedFiles: [] } },
    { label: '照合した行が0', result: { ...base, scannedLines: 0 } },
    { label: 'スクリプト参照が0', result: { ...base, checkedReferences: 0 } },
    { label: '選択範囲の照合が0', result: { ...base, checkedScopeClaims: 0 } },
    { label: '実行器の照合が0', result: { ...base, checkedExecutorTargets: 0 } },
    { label: '陽性の対照が死んでいる', result: { ...base, detectorPositive: false } },
  ];
  for (const degradation of degradations) {
    if (decideExit(degradation.result).ok) {
      fail('VACUOUS', `${degradation.label} でも合格になります`);
    }
  }
}

/** 陽性の対照そのものが判定器を通ること */
function checkDetectorPositiveControl(): void {
  const references = parseScriptReferences(DETECTOR_POSITIVE_CONTROL);
  const mentions = parseScopeClaims(DETECTOR_POSITIVE_CONTROL);
  if (references.length !== 1) {
    fail('CONTROL', `陽性の対照から参照を 1 件拾えません（${references.length} 件）`);
  }
  if (mentions.length !== 1 || mentions[0]?.claim !== 'exhaustive') {
    fail('CONTROL', `陽性の対照から全件の主張を拾えません: ${JSON.stringify(mentions)}`);
  }
}

/** 本番の走査対象が実在し、実データを読んでいること（対象を消して緑にする経路を塞ぐ） */
async function checkRealTargetIsScanned(): Promise<void> {
  const result = await run();
  if (result.scannedFiles.length === 0) {
    fail('REAL_TARGET', '本番の steering 文書を一件も読んでいません');
  }
  if (!result.scannedFiles.includes(`${STEERING_DIRECTORY}/tech.md`)) {
    fail('REAL_TARGET', `走査対象に tech.md が含まれません: ${result.scannedFiles.join(', ')}`);
  }
  if (result.checkedReferences === 0) {
    fail('REAL_TARGET', '本番の steering からスクリプト参照を一つも拾えていません');
  }
  if (result.checkedScopeClaims === 0) {
    fail('REAL_TARGET', '本番の steering で選択範囲の照合が 0 件です');
  }
}

/** 本体が宣言する種別と、本ファイルの `FINDING_KINDS` が一致すること */
function checkFindingKindsAreExhaustive(): void {
  const source = readFileSync(SUBJECT_PATH, 'utf8');
  const start = source.indexOf('export type FindingKind');
  if (start < 0) {
    fail('KINDS', '本体から FindingKind の宣言を見つけられません');
    return;
  }
  const declaration = source.slice(start, source.indexOf(';', start));
  const declared = [...declaration.matchAll(/'([a-z-]+)'/g)].map((m) => m[1] ?? '').sort();
  const mine = [...FINDING_KINDS].sort();
  if (declared.join(',') !== mine.join(',')) {
    fail(
      'KINDS',
      `本体の種別 [${declared.join(', ')}] と自己検査の種別 [${mine.join(', ')}] が一致しません`
    );
  }
}

async function main(): Promise<void> {
  reportPreconditions();
  checkPreconditionsAreWired();
  checkStructuralWiring();
  checkScriptReferenceParsing();
  checkClaimAssociationByDistance();
  checkGlobConversion();
  checkSelection();
  checkVitestInvocationExtraction();
  checkExecutorParsing();
  checkVacuousRunsFail();
  checkDetectorPositiveControl();
  checkFindingKindsAreExhaustive();
  await checkMustDetect();
  await checkMustNotDetect();
  await checkDatedRecordExemption();
  await checkRealTargetIsScanned();

  const total = MUST_DETECT.length + MUST_NOT_DETECT.length;
  if (failures.length === 0) {
    console.log(
      '✅ steering 実行方法 判定器の自己検査に合格しました' +
        `（陽性 ${MUST_DETECT.length} 件 / 陰性 ${MUST_NOT_DETECT.length} 件 / 対照 ${total} 件 /` +
        ` 検出の種別 ${FINDING_KINDS.length} 種）`
    );
    // 失敗既定（module の頂）をここで解除する
    process.exitCode = 0;
    return;
  }

  console.error('❌ steering 実行方法 判定器の自己検査に失敗しました');
  console.error('');
  for (const failure of failures) {
    console.error(`   [${failure.scope}] ${failure.detail}`);
  }
  console.error('');
  console.error(`   合計 ${failures.length} 件 / 対照 ${total} 件`);
  process.exit(1);
}

void main();
