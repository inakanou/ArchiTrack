/**
 * @fileoverview 被覆印の計数 判定器の自己検査（タスク 101.1）
 *
 * `scripts/count-coverage-marks.ts` が
 *   (1) **プロジェクト自身の読み手で数えていること**——`extractFileCoverage` /
 *       `extractHeaderScopedCoverage` をそのまま呼び、被覆印の読み取り規則を自前で持たないこと、
 *   (2) **逐語 grep が構造的に読み落とす形を現に拾うこと**——機能名を持つヘッダーの直下の
 *       素の `- REQ-N.M:` を数え、かつ「逐語 grep では当たらない」と印を付けること、
 *   (3) **読み手が読んだものをそのまま出すこと**——範囲記法 `- REQ-22.1-22.3:` が先頭 1 件しか
 *       読まれない挙動を補正して隠さないこと、
 *   (4) **母集団が空のまま「0 件」と報告しないこと**（AI運用7原則 第3原則）、
 *   (5) **CLI の入口 `main` が端から端まで結線されていること**——解釈した引数（`--feature` /
 *       `--root`）が現に計数へ配られ、判定（`decideExit`）が現に終了コードへ渡ること、
 *   (6) **人が読む出力が実測値を印字すること**——要約行の件数と `--verbose` の `!` 印が
 *       計数の返りと一致すること（steering が「出力がその時点の値を印字する」「読めない印には
 *       `!` が付く」と述べている以上、その主張は自己検査が固定しなければならない）、
 *   (7) **プロセスとしての入口が生きていること**——`npx tsx scripts/count-coverage-marks.ts`
 *       として起動したときに出力が出て、母集団が空なら EXIT=1 で終わること、
 * を確かめる。
 *
 * ## 恒真にならないこと（この自己検査が死ぬ経路を塞ぐ）
 *
 *   - `reportPreconditions` が**実データ**で母集団の非空を先に測る。走査対象が 0 件、
 *     印が 0 件、逐語 grep が読めない印が 0 件のいずれでも赤くなる。合成データだけの対照は
 *     実データが空になった瞬間に何も主張しなくなる。
 *   - `checkStructuralWiring` が本ファイルの `function check*` を一つ残らず `main` へ
 *     結線していることを課す（検査を足して呼び忘れる経路を塞ぐ）。
 *   - `checkSourceDelegatesToCoverageReaders` は**構造**を見る。本体が自前の正規表現で
 *     数え直す形へ戻ると赤くなる。
 *   - `checkCountEqualsDirectReaderCall` は**実データのファイル**について、本体の返りが
 *     読み手を直接呼んだ結果と逐語で一致することを課す。読み取り規則を少しでも複製すると
 *     一致が崩れる。
 *   - `checkCliEntryNarrowsByFeature` / `checkCliEntryHonorsRoot` /
 *     `checkCliEntryPropagatesExitCode` は**部品ではなく入口 `main` を呼ぶ**。`main` が
 *     解釈した引数を捨てて既定を使う変異（`--feature` / `--root` の無言の無効化）や、
 *     判定を終了コードから切り離す変異（`return code === 0 ? 0 : 0;`）が現に赤くなる。
 *     部品（`countMarksInContent` / `decideExit` / `parseArgs`）だけを当てる対照では
 *     これらの変異が一つも落ちなかった（タスク 101.1 の是正ラウンド1の実測）。
 *   - `checkCliReportPrintsMeasuredValues` は**人が読む出力そのもの**を読み返す。要約行が
 *     別の欄の値を引く変異（`literalGrepMissedAcceptanceCriteria` → `...Requirements`）や、
 *     `--verbose` の `!` 印を一律で消す変異が現に赤くなる。終了コードだけを見る対照では
 *     これらが一つも落ちなかった（タスク 101.1 の是正ラウンド2の実測）。
 *   - `checkProcessEntryCarriesJudgementToExitCode` は本体を**プロセスとして**起動する。
 *     `export function main` を関数として呼ぶだけでは `process.exit(main())` と
 *     `invokedDirectly` の判定が一度も通らず、入口を殺す変異（`&& false`）や判定を
 *     捨てる変異（`process.exit(0)`）が緑のまま通ってしまう。
 *
 * 使用方法:
 *   npx tsx scripts/count-coverage-marks.selftest.ts
 *   npm run count:coverage-marks:selftest
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CODE_DIRS,
  discoverFeatures,
  extractFileCoverage,
  extractHeaderScopedCoverage,
  listCoverageScanFiles,
} from './check-requirement-coverage.js';
import {
  DEFAULT_SCAN_ROOTS,
  countCoverageMarks,
  countMarksInContent,
  decideExit,
  featureOf,
  main as runCoverageMarkCounter,
  parseArgs,
  type CoverageMarkCountResult,
} from './count-coverage-marks.js';

// 失敗既定。入口 `main();` が呼ばれないまま module が走り終えると EXIT=1 で終わる。
process.exitCode = 1;

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const SUBJECT_PATH = path.join(REPOSITORY_ROOT, 'scripts/count-coverage-marks.ts');

/** 実データの走査根（逐語 grep の盲点が集まる場所。タスク 101.1 の実測はここで取られた） */
const REAL_DATA_ROOT = 'e2e';

interface Failure {
  scope: string;
  detail: string;
}

const failures: Failure[] = [];

function fail(scope: string, detail: string): void {
  failures.push({ scope, detail });
}

/** 走査用に、註釈（`/* *\/` と `//`）を落としたソース */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

let realDataResult: CoverageMarkCountResult | null = null;

/**
 * 前提の確認（実データが空でないこと）
 *
 * 対照より先に走らせる。母集団が空のまま合成データだけで緑を出す状態を塞ぐ。
 */
function reportPreconditions(): void {
  const features = discoverFeatures();
  if (features.length === 0) {
    fail('PRECONDITION', '.kiro/specs/ から機能が 1 件も見つかりません');
    return;
  }
  const scanned = listCoverageScanFiles([REAL_DATA_ROOT]);
  if (scanned.length === 0) {
    fail('PRECONDITION', `走査根 ${REAL_DATA_ROOT} の走査対象が 0 件です`);
    return;
  }
  const result = countCoverageMarks({ featureNames: features, roots: [REAL_DATA_ROOT] });
  realDataResult = result;
  if (result.totalAcceptanceCriteriaMarks === 0) {
    fail('PRECONDITION', `走査根 ${REAL_DATA_ROOT} の受入基準レベルの被覆印が 0 件です`);
  }
  if (result.files.length === 0) {
    fail('PRECONDITION', '被覆印を持つファイルが 0 件です');
  }
}

/** 前提の確認が `main` に結線されていること（呼び出しごと外す経路を塞ぐ） */
function checkPreconditionsAreWired(): void {
  const source = stripComments(readFileSync(MODULE_PATH, 'utf8'));
  if (!/\breportPreconditions\(\);/.test(source)) {
    fail('WIRING', '`reportPreconditions()` の呼び出しが本ファイルから失われています');
  }
}

/** 本ファイルが宣言する `function check*` を一つ残らず `main` が呼んでいること */
function checkStructuralWiring(): void {
  const source = readFileSync(MODULE_PATH, 'utf8');
  const declared = [...source.matchAll(/^function (check[A-Za-z0-9_]*)\(/gm)].map((m) => m[1]);
  if (declared.length === 0) {
    fail('STRUCTURAL', '`function check*` の宣言が 1 件も見つかりません');
    return;
  }
  const body = stripComments(source);
  for (const name of declared) {
    if (!new RegExp(`^\\s*${name}\\(\\);`, 'm').test(body)) {
      fail('STRUCTURAL', `${name}() が main から呼ばれていません`);
    }
  }
}

/**
 * 本体が読み手へ委譲していること（自前の読み取り規則を持たないこと）
 *
 * **これが完了の定義 1 の構造側の守り手である。** 本体を自前の正規表現で数え直す形へ
 * 戻すと、下の四条件のいずれかが破れて赤くなる（RED 段階で実測済み）。
 */
function checkSourceDelegatesToCoverageReaders(): void {
  const source = readFileSync(SUBJECT_PATH, 'utf8');
  const code = stripComments(source);
  for (const reader of ['extractFileCoverage', 'extractHeaderScopedCoverage']) {
    if (
      !new RegExp(`\\b${reader}\\b[\\s\\S]{0,400}?from '\\./check-requirement-coverage'`).test(code)
    ) {
      fail('DELEGATION', `${reader} を check-requirement-coverage から取り込んでいません`);
    }
    if (!code.includes(`${reader}(`)) {
      fail('DELEGATION', `${reader}( の呼び出しが本体にありません`);
    }
  }
  if (code.includes('RegExp')) {
    fail('DELEGATION', '本体が `RegExp` を構築しています（読み取り規則の複製の疑い）');
  }
  if (/\.(exec|match|matchAll)\(/.test(code)) {
    fail('DELEGATION', '本体が正規表現の走査（exec/match/matchAll）を行っています');
  }
}

/**
 * ヘッダー直下の素の `- REQ-N.M:` を数え、逐語 grep の盲点として印を付けること
 *
 * **これが本タスクの中核の主張である。** 逐語 grep（`<feature>/REQ-N.M` の綴り）は
 * この形に当たらない。
 */
function checkHeaderScopedMarkIsCounted(): void {
  const feature = discoverFeatures()[0];
  if (feature === undefined) {
    fail('HEADER_SCOPED', '機能が 1 件も無いため対照を組めません');
    return;
  }
  const content = [
    '/**',
    ` * Requirements coverage (${feature}):`,
    ' * - REQ-9.1: ヘッダー直下の素の一覧（逐語 grep が読み落とす形）',
    ' */',
    "test('x', () => {});",
    '',
  ].join('\n');
  const counted = countMarksInContent(content, [feature]);
  const id = `${feature}/REQ-9.1`;
  if (!counted.acceptanceCriteria.includes(id)) {
    fail('HEADER_SCOPED', `ヘッダー直下の素の一覧が数えられていません（期待: ${id}）`);
  }
  if (!counted.headerScopedAcceptanceCriteria.includes(id)) {
    fail('HEADER_SCOPED', `${id} がヘッダー由来の内訳に現れません`);
  }
  if (!counted.literalGrepMissedAcceptanceCriteria.includes(id)) {
    fail('HEADER_SCOPED', `${id} が「逐語 grep が読めない印」として挙がっていません`);
  }
  if (content.includes(id)) {
    fail('HEADER_SCOPED', '対照の本文に綴りが含まれています（盲点の対照になっていません）');
  }
}

/** 行内の被覆印は数えられ、かつ「逐語 grep が読めない印」には**挙がらない**こと（陰性の対照） */
function checkInlineMarkIsCountedAndNotFlagged(): void {
  const feature = discoverFeatures()[0];
  if (feature === undefined) {
    fail('INLINE', '機能が 1 件も無いため対照を組めません');
    return;
  }
  const id = `${feature}/REQ-9.1`;
  const counted = countMarksInContent(`// @requirement ${id}\n`, [feature]);
  if (!counted.acceptanceCriteria.includes(id)) {
    fail('INLINE', `行内の被覆印が数えられていません（期待: ${id}）`);
  }
  if (counted.literalGrepMissedAcceptanceCriteria.length !== 0) {
    fail(
      'INLINE',
      `綴りが本文にある印が「逐語 grep が読めない印」に挙がりました: ` +
        counted.literalGrepMissedAcceptanceCriteria.join(', ')
    );
  }
  if (counted.headerScopedAcceptanceCriteria.length !== 0) {
    fail('INLINE', '行内の被覆印がヘッダー由来の内訳に混ざっています');
  }
}

/**
 * 範囲記法を読み手が読んだとおりに出すこと（補正して隠さない）
 *
 * `- REQ-22.1-22.3:` はヘッダーの識別子欄では**先頭 1 件しか読まれない**
 * （タスク 100.6 の実測）。本スクリプトはこれを補正しない。
 */
function checkRangeNotationIsReportedAsRead(): void {
  const feature = discoverFeatures()[0];
  if (feature === undefined) {
    fail('RANGE', '機能が 1 件も無いため対照を組めません');
    return;
  }
  const content = [
    '/**',
    ` * Requirements coverage (${feature}):`,
    ' * - REQ-22.1-22.3: 範囲記法',
    ' */',
    '',
  ].join('\n');
  const counted = countMarksInContent(content, [feature]);
  if (!counted.acceptanceCriteria.includes(`${feature}/REQ-22.1`)) {
    fail('RANGE', `範囲記法の先頭 ${feature}/REQ-22.1 が読まれていません`);
  }
  if (counted.acceptanceCriteria.includes(`${feature}/REQ-22.3`)) {
    fail(
      'RANGE',
      `範囲記法の末尾 ${feature}/REQ-22.3 が数えられています` +
        '（読み手は読まない。補正は関門との食い違いを生む）'
    );
  }
}

/** `--feature` の絞り込みが他機能の印を帰属させないこと */
function checkFeatureNarrowingExcludesOtherFeatures(): void {
  const features = discoverFeatures();
  const first = features[0];
  const second = features[1];
  if (first === undefined || second === undefined) {
    fail('NARROWING', '機能が 2 件未満のため絞り込みの対照を組めません');
    return;
  }
  const content = [
    `// @requirement ${first}/REQ-1.1`,
    `// @requirement ${second}/REQ-2.2`,
    '',
  ].join('\n');
  const narrowed = countMarksInContent(content, [first]);
  if (!narrowed.acceptanceCriteria.includes(`${first}/REQ-1.1`)) {
    fail('NARROWING', `絞り込んだ機能の印が落ちました（期待: ${first}/REQ-1.1）`);
  }
  if (narrowed.acceptanceCriteria.some((id) => featureOf(id) !== first)) {
    fail('NARROWING', `他機能の印が混ざりました: ${narrowed.acceptanceCriteria.join(', ')}`);
  }
}

/** 本体の返りが、読み手を直接呼んだ結果と逐語で一致すること（実データで測る） */
function checkCountEqualsDirectReaderCall(): void {
  const result = realDataResult;
  if (result === null) {
    fail('EQUIVALENCE', '実データの計数が取れていません（前提の確認が先に失敗しています）');
    return;
  }
  const features = result.featureNames;
  const target = result.files[0];
  if (target === undefined) {
    fail('EQUIVALENCE', '被覆印を持つファイルが 0 件です');
    return;
  }
  const content = readFileSync(path.join(REPOSITORY_ROOT, target.file), 'utf8');
  const direct = extractFileCoverage(content, [...features]);
  const expectedCriteria = [...direct.acceptanceCriteria].sort().join('|');
  if (target.acceptanceCriteria.join('|') !== expectedCriteria) {
    fail(
      'EQUIVALENCE',
      `${target.file} の受入基準レベルの印が extractFileCoverage の返りと一致しません`
    );
  }
  const expectedRequirements = [...direct.requirements].sort().join('|');
  if (target.requirements.join('|') !== expectedRequirements) {
    fail(
      'EQUIVALENCE',
      `${target.file} の要件レベルの印が extractFileCoverage の返りと一致しません`
    );
  }
  const header = extractHeaderScopedCoverage(content, features);
  if (
    target.headerScopedAcceptanceCriteria.join('|') !==
    [...header.acceptanceCriteria].sort().join('|')
  ) {
    fail(
      'EQUIVALENCE',
      `${target.file} のヘッダー由来の内訳が extractHeaderScopedCoverage の返りと一致しません`
    );
  }
}

/**
 * 実データに逐語 grep の盲点が現に在ること
 *
 * 盲点が 0 件になれば本スクリプトの存在理由が消えるため、そのときは赤くする。
 * 併せて、挙げた印の綴りが**当該ファイルの本文に本当に無い**ことを一件ずつ突き合わせる。
 */
function checkRealDataCarriesLiteralGrepBlindSpot(): void {
  const result = realDataResult;
  if (result === null) {
    fail('BLIND_SPOT', '実データの計数が取れていません（前提の確認が先に失敗しています）');
    return;
  }
  if (result.totalLiteralGrepMissedAcceptanceCriteria === 0) {
    fail(
      'BLIND_SPOT',
      `走査根 ${REAL_DATA_ROOT} に逐語 grep が読めない印が 1 件もありません` +
        '（本スクリプトが何も主張していない状態です）'
    );
    return;
  }
  for (const file of result.files) {
    if (file.literalGrepMissedAcceptanceCriteria.length === 0) continue;
    const content = readFileSync(path.join(REPOSITORY_ROOT, file.file), 'utf8');
    for (const id of file.literalGrepMissedAcceptanceCriteria) {
      if (content.includes(id)) {
        fail('BLIND_SPOT', `${file.file} の ${id} は綴りが本文に在ります（盲点ではありません）`);
        return;
      }
    }
  }
}

/** 母集団が空のまま「0 件」と報告しないこと（AI運用7原則 第3原則） */
function checkEmptyPopulationIsRejected(): void {
  const healthy = countCoverageMarks({
    featureNames: discoverFeatures(),
    roots: [REAL_DATA_ROOT],
  });
  const known = discoverFeatures();
  if (decideExit(healthy, [], known).code !== 0) {
    fail('EMPTY', '健全な母集団に対して失敗を返しました');
  }
  const noFiles: CoverageMarkCountResult = { ...healthy, scannedFileCount: 0 };
  if (decideExit(noFiles, [], known).code === 0) {
    fail('EMPTY', '走査対象 0 件が失敗になりません');
  }
  const noFeatures: CoverageMarkCountResult = { ...healthy, featureNames: [] };
  if (decideExit(noFeatures, [], known).code === 0) {
    fail('EMPTY', '機能 0 件が失敗になりません');
  }
  if (decideExit(healthy, ['no-such-feature'], known).code === 0) {
    fail('EMPTY', '実在しない機能名の指定が失敗になりません（誤った 0 件が出ます）');
  }
}

/** CLI の入口 `main` の返り値と標準出力・標準エラー出力 */
interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * CLI の入口 `main` を**そのまま**呼ぶ（部品ではなく結線を測るための唯一の入口）
 *
 * 出力を横取りするのは、`main` が「解釈した引数を計数へ配った結果」を外から読むためである。
 * 返り値（終了コード）も同時に持ち帰るので、判定が終了コードへ渡っているかも同じ一回で測れる。
 */
function runCli(argv: readonly string[]): CliRun {
  const originalLog = console.log;
  const originalError = console.error;
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...args: unknown[]): void => {
    out.push(args.map((arg) => String(arg)).join(' '));
  };
  console.error = (...args: unknown[]): void => {
    err.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    const code = runCoverageMarkCounter(argv);
    return { code, stdout: out.join('\n'), stderr: err.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

/** `--json` で走らせた `main` の標準出力を読む（読めなければ null） */
function readCliJson(run: CliRun): (CoverageMarkCountResult & { failures: string[] }) | null {
  try {
    return JSON.parse(run.stdout) as CoverageMarkCountResult & { failures: string[] };
  } catch {
    return null;
  }
}

/** 実データで最も印の多い機能（絞り込みの対照に使う。0 件の機能では絞り込みを測れない） */
function busiestFeature(result: CoverageMarkCountResult): string | undefined {
  return Object.keys(result.acceptanceCriteriaByFeature).sort(
    (a, b) =>
      (result.acceptanceCriteriaByFeature[b] ?? 0) - (result.acceptanceCriteriaByFeature[a] ?? 0) ||
      a.localeCompare(b)
  )[0];
}

/**
 * 入口 `main` を通しても `--feature` の絞り込みが現に効いていること
 *
 * `main` が `options.requestedFeatures` を捨てて `knownFeatures` を使う変異を落とす。
 * 部品（`countMarksInContent`）だけを当てる対照はこの変異を一つも落とさなかった。
 */
function checkCliEntryNarrowsByFeature(): void {
  const all = realDataResult;
  if (all === null) {
    fail('CLI_NARROWING', '実データの計数が取れていません（前提の確認が先に失敗しています）');
    return;
  }
  const withMarks = Object.keys(all.acceptanceCriteriaByFeature);
  if (withMarks.length < 2) {
    fail(
      'CLI_NARROWING',
      `走査根 ${REAL_DATA_ROOT} で印を持つ機能が ${withMarks.length} 件しかなく、` +
        '絞り込みが効いているか否かを区別できません'
    );
    return;
  }
  const target = busiestFeature(all);
  if (target === undefined) {
    fail('CLI_NARROWING', '印を持つ機能が 1 件も無いため絞り込みの対照を組めません');
    return;
  }

  const run = runCli([`--feature=${target}`, `--root=${REAL_DATA_ROOT}`, '--json']);
  if (run.code !== 0) {
    fail('CLI_NARROWING', `健全な指定で main が ${run.code} を返しました: ${run.stderr}`);
    return;
  }
  const actual = readCliJson(run);
  if (actual === null) {
    fail('CLI_NARROWING', 'main の --json 出力を読めません');
    return;
  }

  const expected = countCoverageMarks({ featureNames: [target], roots: [REAL_DATA_ROOT] });
  if (actual.featureNames.join(',') !== target) {
    fail(
      'CLI_NARROWING',
      `--feature=${target} を指定したのに main が帰属させた機能は ` +
        `${actual.featureNames.length} 件です（${actual.featureNames.slice(0, 5).join(' / ')} ...）`
    );
  }
  if (actual.totalAcceptanceCriteriaMarks !== expected.totalAcceptanceCriteriaMarks) {
    fail(
      'CLI_NARROWING',
      `main の計数 ${actual.totalAcceptanceCriteriaMarks} 件が ` +
        `countCoverageMarks({ featureNames: ['${target}'], roots: ['${REAL_DATA_ROOT}'] }) の ` +
        `${expected.totalAcceptanceCriteriaMarks} 件と一致しません`
    );
  }
  if (actual.totalRequirementMarks !== expected.totalRequirementMarks) {
    fail(
      'CLI_NARROWING',
      `main の要件レベルの計数 ${actual.totalRequirementMarks} 件が直接呼びの ` +
        `${expected.totalRequirementMarks} 件と一致しません`
    );
  }
  if (actual.files.length !== expected.files.length) {
    fail(
      'CLI_NARROWING',
      `main が挙げた印を持つファイル ${actual.files.length} 件が直接呼びの ` +
        `${expected.files.length} 件と一致しません`
    );
  }
  if (actual.totalAcceptanceCriteriaMarks === all.totalAcceptanceCriteriaMarks) {
    fail(
      'CLI_NARROWING',
      `--feature=${target} の計数 ${actual.totalAcceptanceCriteriaMarks} 件が全機能の計数と` +
        '同じです（--feature の絞り込みが入口で無効化されています）'
    );
  }
}

/**
 * 入口 `main` を通しても `--root` が現に効いていること
 *
 * `main` が `options.roots` を捨てて `DEFAULT_SCAN_ROOTS` を使う変異を落とす。
 */
function checkCliEntryHonorsRoot(): void {
  const all = realDataResult;
  if (all === null) {
    fail('CLI_ROOT', '実データの計数が取れていません（前提の確認が先に失敗しています）');
    return;
  }

  const scoped = readCliJson(runCli([`--root=${REAL_DATA_ROOT}`, '--json']));
  if (scoped === null) {
    fail('CLI_ROOT', `main --root=${REAL_DATA_ROOT} --json の出力を読めません`);
    return;
  }
  if (scoped.roots.join(',') !== REAL_DATA_ROOT) {
    fail(
      'CLI_ROOT',
      `--root=${REAL_DATA_ROOT} を指定したのに main の走査根は ${scoped.roots.join(' / ')} です`
    );
  }
  if (scoped.scannedFileCount !== all.scannedFileCount) {
    fail(
      'CLI_ROOT',
      `main の走査ファイル数 ${scoped.scannedFileCount} 件が ` +
        `listCoverageScanFiles(['${REAL_DATA_ROOT}']) の ${all.scannedFileCount} 件と一致しません`
    );
  }

  const defaulted = readCliJson(runCli(['--json']));
  if (defaulted === null) {
    fail('CLI_ROOT', 'main --json（既定の走査根）の出力を読めません');
    return;
  }
  if (defaulted.roots.join(',') !== [...DEFAULT_SCAN_ROOTS].join(',')) {
    fail(
      'CLI_ROOT',
      `既定の走査根が ${defaulted.roots.join(' / ')} です（期待: ${DEFAULT_SCAN_ROOTS.join(' / ')}）`
    );
  }
  if (defaulted.scannedFileCount === scoped.scannedFileCount) {
    fail(
      'CLI_ROOT',
      `--root=${REAL_DATA_ROOT} を指定しても走査ファイル数が既定と同じ ` +
        `${defaulted.scannedFileCount} 件です（--root が入口で無効化されています）`
    );
  }
  if (defaulted.scannedFileCount <= scoped.scannedFileCount) {
    fail(
      'CLI_ROOT',
      `既定の走査 ${defaulted.scannedFileCount} 件が ${REAL_DATA_ROOT} だけの ` +
        `${scoped.scannedFileCount} 件を上回りません（既定の母集団が縮んでいます）`
    );
  }
}

/**
 * 入口 `main` の判定が終了コードまで届いていること（AI運用7原則 第3原則の端から端）
 *
 * `decideExit` の返り値を握り潰す変異（`return code === 0 ? 0 : 0;`）を落とす。
 * 部品（`decideExit`）だけを当てる対照はこの変異を落とさなかった。
 */
function checkCliEntryPropagatesExitCode(): void {
  const healthy = runCli([`--root=${REAL_DATA_ROOT}`]);
  if (healthy.code !== 0) {
    fail('CLI_EXIT', `健全な母集団で main が ${healthy.code} を返しました: ${healthy.stderr}`);
  }

  const missingRoot = runCli(['--root=does-not-exist']);
  if (missingRoot.code !== 1) {
    fail(
      'CLI_EXIT',
      `走査対象 0 件の指定（--root=does-not-exist）で main が ${missingRoot.code} を` +
        '返しました（母集団が空のまま 0 件と報告しています）'
    );
  }

  const missingFeature = runCli(['--feature=no-such-feature']);
  if (missingFeature.code !== 1) {
    fail(
      'CLI_EXIT',
      `実在しない機能名の指定（--feature=no-such-feature）で main が ` +
        `${missingFeature.code} を返しました（誤った 0 件が緑で出ます）`
    );
  }

  const unknownFlag = runCli(['--totally-unknown']);
  if (unknownFlag.code !== 1) {
    fail('CLI_EXIT', `未知のオプションで main が ${unknownFlag.code} を返しました`);
  }
}

/** 行に現れる整数を出現順に拾う（書式の文言に依らず**値**だけを見るため） */
function integersIn(line: string): number[] {
  return [...line.matchAll(/\d+/g)].map((hit) => Number(hit[0]));
}

/** 人が読む出力の要約行（先頭の空白 2 つと見出しで引く） */
function summaryLine(stdout: string, label: string): string | undefined {
  return stdout.split('\n').find((line) => line.startsWith(`  ${label}`));
}

/** `--verbose` のファイル別の節を読み返す（ファイル → 印字された識別子と `!` が付いた識別子） */
function readVerboseFileSections(stdout: string): {
  listed: Map<string, string[]>;
  marked: Map<string, string[]>;
  sectionFound: boolean;
} {
  const listed = new Map<string, string[]>();
  const marked = new Map<string, string[]>();
  const lines = stdout.split('\n');
  const start = lines.findIndex((line) => line.startsWith('ファイル別'));
  if (start < 0) return { listed, marked, sectionFound: false };

  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    // 印の行は空白 6 つで始まる。凡例の一行（`!` は…）はこの形を持たないので数え込まれない。
    const mark = /^ {6}([! ]) (\S+)$/.exec(line);
    if (mark !== null && current !== null) {
      listed.get(current)?.push(mark[2] ?? '');
      if (mark[1] === '!') marked.get(current)?.push(mark[2] ?? '');
      continue;
    }
    const head = /^ {2}(\S.*?): \d+ 件（/.exec(line);
    if (head !== null) {
      current = head[1] ?? '';
      listed.set(current, []);
      marked.set(current, []);
    }
  }
  return { listed, marked, sectionFound: true };
}

/**
 * 人が読む出力が**実測値**を印字すること（`formatReport` の束縛）
 *
 * steering（`.kiro/steering/development-discipline.md` の「被覆印は逐語 grep で数えない」節）が
 * 「**上のコマンドの出力がその時点の値を印字する**」「**逐語 grep では当たらない印には出力上で
 * `!` の印が付く（`--verbose`）**」と述べている。その二つの主張をここで固定する。終了コードだけを
 * 見る対照は、要約行が別の欄の値を引く変異（147 を 27 と読ませる）を落とさない。
 */
function checkCliReportPrintsMeasuredValues(): void {
  const expected = countCoverageMarks({ roots: [REAL_DATA_ROOT] });
  const plain = runCli([`--root=${REAL_DATA_ROOT}`]);
  if (plain.code !== 0) {
    fail('CLI_REPORT', `健全な指定で main が ${plain.code} を返しました: ${plain.stderr}`);
    return;
  }

  const criteria = summaryLine(plain.stdout, '受入基準レベルの印');
  if (criteria === undefined) {
    fail('CLI_REPORT', '要約に「受入基準レベルの印」の行がありません');
  } else {
    const printed = integersIn(criteria);
    const want = [
      expected.totalAcceptanceCriteriaMarks,
      expected.totalLiteralGrepMissedAcceptanceCriteria,
    ];
    if (printed.join(',') !== want.join(',')) {
      fail(
        'CLI_REPORT',
        `受入基準レベルの要約行が印字した値 [${printed.join(', ')}] が実測 ` +
          `[${want.join(', ')}]（件数 / うち逐語 grep が読めない印）と一致しません: ${criteria}`
      );
    }
  }

  const requirements = summaryLine(plain.stdout, '要件レベルの印');
  if (requirements === undefined) {
    fail('CLI_REPORT', '要約に「要件レベルの印」の行がありません');
  } else {
    const printed = integersIn(requirements);
    const want = [expected.totalRequirementMarks, expected.totalLiteralGrepMissedRequirements];
    if (printed.join(',') !== want.join(',')) {
      fail(
        'CLI_REPORT',
        `要件レベルの要約行が印字した値 [${printed.join(', ')}] が実測 ` +
          `[${want.join(', ')}]（件数 / うち逐語 grep が読めない印）と一致しません: ${requirements}`
      );
    }
  }

  const verbose = runCli([`--root=${REAL_DATA_ROOT}`, '--verbose']);
  if (verbose.code !== 0) {
    fail('CLI_REPORT', `--verbose で main が ${verbose.code} を返しました: ${verbose.stderr}`);
    return;
  }
  const sections = readVerboseFileSections(verbose.stdout);
  if (!sections.sectionFound) {
    fail('CLI_REPORT', '--verbose の出力にファイル別の節が見つかりません');
    return;
  }
  let printedMarks = 0;
  for (const ids of sections.marked.values()) printedMarks += ids.length;
  if (printedMarks !== expected.totalLiteralGrepMissedAcceptanceCriteria) {
    fail(
      'CLI_REPORT',
      `--verbose が「!」印を付けた行は ${printedMarks} 件で、実測の` +
        `逐語 grep が読めない印 ${expected.totalLiteralGrepMissedAcceptanceCriteria} 件と` +
        '一致しません（凡例の一行は数えていません）'
    );
  }
  if (sections.listed.size !== expected.files.length) {
    fail(
      'CLI_REPORT',
      `--verbose が挙げたファイルは ${sections.listed.size} 件で、実測の ` +
        `${expected.files.length} 件と一致しません`
    );
  }
  for (const file of expected.files) {
    const listed = [...(sections.listed.get(file.file) ?? [])].sort().join('|');
    if (listed !== [...file.acceptanceCriteria].sort().join('|')) {
      fail('CLI_REPORT', `${file.file} が印字した識別子の集合が実測と一致しません`);
      return;
    }
    const marked = [...(sections.marked.get(file.file) ?? [])].sort().join('|');
    const want = [...file.literalGrepMissedAcceptanceCriteria].sort().join('|');
    if (marked !== want) {
      fail(
        'CLI_REPORT',
        `${file.file} で「!」が付いた識別子 [${marked || '(無し)'}] が実測の` +
          `逐語 grep が読めない印 [${want || '(無し)'}] と一致しません`
      );
      return;
    }
  }
}

/**
 * プロセスとしての入口が生きていること（`invokedDirectly` と `process.exit(main())`）
 *
 * `export function main` を関数として呼ぶだけでは、本体末尾の起動判定と `process.exit` を
 * 一度も通らない。`npm run count:coverage-marks` が**出力 0 行・EXIT=0 の no-op** へ
 * 化ける変異（`invokedDirectly && false`）や、プロセスの出口で第3原則の守りが消える変異
 * （`process.exit(0)`）はここでしか落ちない。先例は
 * `scripts/check-dead-script-env.selftest.ts` の `spawnSync('npx', ['tsx', ENTRY, ...])`。
 */
function checkProcessEntryCarriesJudgementToExitCode(): void {
  const healthy = spawnSync('npx', ['tsx', SUBJECT_PATH, `--root=${REAL_DATA_ROOT}`], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf-8',
    timeout: 180000,
  });
  if (healthy.status !== 0) {
    fail(
      'PROCESS_ENTRY',
      `本体をプロセスとして起動すると EXIT=${healthy.status} です: ${healthy.stderr}`
    );
  } else if (healthy.stdout.trim() === '') {
    fail(
      'PROCESS_ENTRY',
      'プロセスとして起動しても標準出力が 1 行も出ません（起動判定が入口を呼んでいません）'
    );
  }

  const emptyPopulation = spawnSync('npx', ['tsx', SUBJECT_PATH, '--root=does-not-exist'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf-8',
    timeout: 180000,
  });
  if (emptyPopulation.status !== 1) {
    fail(
      'PROCESS_ENTRY',
      `走査対象 0 件の指定でプロセスが EXIT=${emptyPopulation.status} で終わりました` +
        '（母集団が空のまま成功として終了しています）'
    );
  }
}

/** 引数の解釈（`=` 区切りと空白区切りの両方、未知のオプションの検出） */
function checkArgumentParsing(): void {
  const parsed = parseArgs([
    '--feature=alpha',
    '--feature',
    'beta',
    '--root=e2e',
    '--root',
    'backend/src',
    '--verbose',
    '--json',
  ]);
  if (parsed.requestedFeatures.join(',') !== 'alpha,beta') {
    fail('ARGS', `--feature の解釈が誤っています: ${parsed.requestedFeatures.join(',')}`);
  }
  if (parsed.roots.join(',') !== 'e2e,backend/src') {
    fail('ARGS', `--root の解釈が誤っています: ${parsed.roots.join(',')}`);
  }
  if (!parsed.verbose || !parsed.json) {
    fail('ARGS', '--verbose / --json が解釈されていません');
  }
  if (parsed.unknownFlags.length !== 0) {
    fail('ARGS', `既知のオプションが未知として挙がりました: ${parsed.unknownFlags.join(' ')}`);
  }
  if (parseArgs(['--totally-unknown']).unknownFlags.join(',') !== '--totally-unknown') {
    fail('ARGS', '未知のオプションが検出されません');
  }
}

/**
 * 既定の走査根が関門と同一の定数から**そのまま**来ていること（別の母集団を作らない）
 *
 * 構造と値の二重で塞ぐ。`= CODE_DIRS.slice(0, 1)` や `= CODE_DIRS.filter(...)` のように
 * 「CODE_DIRS から作るが母集団は縮む」形は、前方一致の綴りでは通ってしまう
 * （タスク 101.1 の是正ラウンド1の実測）。末尾の `;` まで拘束し、併せて要素列が
 * `CODE_DIRS` と逐語一致することを実行時にも課す。
 */
function checkDefaultRootsComeFromGate(): void {
  if (DEFAULT_SCAN_ROOTS.length === 0) {
    fail('ROOTS', '既定の走査根が空です');
  }
  const source = stripComments(readFileSync(SUBJECT_PATH, 'utf8'));
  if (!/DEFAULT_SCAN_ROOTS\s*:\s*readonly string\[\]\s*=\s*CODE_DIRS\s*;/.test(source)) {
    fail('ROOTS', '既定の走査根が CODE_DIRS 以外から作られています');
  }
  if ([...DEFAULT_SCAN_ROOTS].join('|') !== [...CODE_DIRS].join('|')) {
    fail(
      'ROOTS',
      `既定の走査根 ${DEFAULT_SCAN_ROOTS.join(' / ')} が CODE_DIRS ` +
        `${CODE_DIRS.join(' / ')} と一致しません（母集団が関門と分かれています）`
    );
  }
}

function main(): void {
  reportPreconditions();
  checkPreconditionsAreWired();
  checkStructuralWiring();
  checkSourceDelegatesToCoverageReaders();
  checkHeaderScopedMarkIsCounted();
  checkInlineMarkIsCountedAndNotFlagged();
  checkRangeNotationIsReportedAsRead();
  checkFeatureNarrowingExcludesOtherFeatures();
  checkCountEqualsDirectReaderCall();
  checkRealDataCarriesLiteralGrepBlindSpot();
  checkEmptyPopulationIsRejected();
  checkCliEntryNarrowsByFeature();
  checkCliEntryHonorsRoot();
  checkCliEntryPropagatesExitCode();
  checkCliReportPrintsMeasuredValues();
  checkProcessEntryCarriesJudgementToExitCode();
  checkArgumentParsing();
  checkDefaultRootsComeFromGate();

  if (failures.length === 0) {
    const result = realDataResult;
    console.log(
      '✅ 被覆印の計数 判定器の自己検査に合格しました' +
        `（実データ ${REAL_DATA_ROOT}: 走査 ${result?.scannedFileCount ?? 0} ファイル / ` +
        `受入基準レベルの印 ${result?.totalAcceptanceCriteriaMarks ?? 0} 件 / ` +
        `うち逐語 grep が読めない印 ${result?.totalLiteralGrepMissedAcceptanceCriteria ?? 0} 件）`
    );
    process.exitCode = 0;
    return;
  }

  console.error('❌ 被覆印の計数 判定器の自己検査に失敗しました');
  console.error('');
  for (const failure of failures) {
    console.error(`   [${failure.scope}] ${failure.detail}`);
  }
  console.error('');
  console.error(`   合計 ${failures.length} 件`);
  process.exit(1);
}

main();
