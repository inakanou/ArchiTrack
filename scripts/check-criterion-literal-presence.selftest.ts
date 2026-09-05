/**
 * @fileoverview 受入基準の逐語の実在の検査 判定器の自己検査（タスク 115.292）
 *
 * `scripts/check-criterion-literal-presence.ts` の判定器が
 *   (1) **緩む向き**——実装に無い逐語・壊れた台帳・陳腐化した裁定・空回りの根拠を
 *       取り逃がさないこと、
 *   (2) **狭まる向き**——実装に在る逐語・正しく裁定された組・短すぎる括弧の中身を
 *       告発しないこと、
 * の両方を、合成のリポジトリを組んで確かめる。
 *
 * ## 対照群の母集団を空にする変異が赤くなること（AI運用7原則 第3原則）
 *
 * 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。前提の確認は
 * 配列への登録ではなく `reportPreconditions` の直列の手続きとして書き、`main` の冒頭で対照
 * より先に走らせる。呼び出しごと外す経路は `checkPreconditionsAreWired` が塞ぎ、その守り手は
 * `function check` 宣言なので `checkStructuralWiring` が結線を強制する。相互に施錠される。
 *
 * ## 下限をどこに置くか（115.222 / 115.288 の判断を引き継ぐ）
 *
 *   - `STRUCTURAL`: 本ファイルが宣言する `function check*` を一つ残らず結線していること。
 *     **限界**: 語彙は行頭の `function check` という宣言の形から取るため、アロー式で書いた
 *     未結線の検査だけが素通りする。本ファイルの検査関数は全て `function` 宣言で書くこと。
 *   - `MUST_DETECT` / `MUST_NOT_DETECT`: 陽性・陰性のどちらかが空になったら赤くする。
 *     片側だけの対照は判定器が恒真・恒偽へ退化しても通ってしまう。
 *   - `FINDING_KINDS`: 本体が宣言する種別を**一つ残らず**対照が覆っていること。
 *   - `REAL_TARGET`: 実データの走査が空振りしていないこと。走査根や台帳を消して緑にする
 *     経路を塞ぐ。
 *
 * 使用方法:
 *   npx tsx scripts/check-criterion-literal-presence.selftest.ts
 *   npm run check:criterion-literals:selftest
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
  DRIFT_CATEGORY,
  IMPLEMENTATION_ROOTS,
  LEDGER_ENTRY_LIMIT,
  LEDGER_PATH,
  MINIMUM_LITERAL_LENGTH,
  MINIMUM_PROSE_LENGTH,
  UNVERIFIED_CATEGORY,
  decideExit,
  extractQuotedLiterals,
  listImplementationFiles,
  run,
  type FindingKind,
  type RunResult,
} from './check-criterion-literal-presence.js';

const SELFTEST_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SELFTEST_PATH), '..');
const SUBJECT_PATH = path.join(REPOSITORY_ROOT, 'scripts/check-criterion-literal-presence.ts');

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
  'unregistered-literal',
  'stale-ledger-entry',
  'ledger-schema',
  'ledger-drift',
  'ledger-basis',
  'ledger-ratchet',
];

/** 合成のリポジトリの素材 */
interface Scenario {
  /** 受入基準の本文（`1.` から順に並ぶ） */
  criteria: string[];
  /** `backend/src/probe.ts` の中身 */
  backend: string;
  /** `frontend/src/probe.tsx` の中身 */
  frontend: string;
  /** 台帳の中身（そのまま JSON へ書く。壊れた形を注入するため unknown で受ける） */
  ledger: unknown;
  /** ラチェットの上限 */
  entryLimit: number;
}

const PRESENT_LITERAL = '実装に在る綴り';
const ABSENT_LITERAL = '実装に無い綴りアルファ';
const IMPLEMENTATION_SPELLING = '実装の側の実際の綴り';

/** 台帳の一件（合成）。壊れた形を注入できるよう緩い型で持つ */
function syntheticEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'probe/REQ-1.2',
    literal: ABSENT_LITERAL,
    criterionText: `The システム shall 「${ABSENT_LITERAL}」を表示する`,
    category: DRIFT_CATEGORY,
    reason:
      'これは合成の裁定である。条文の綴りと実装の綴りが食い違うだけで、規範そのものは満たされている。',
    alternativeBasis: `実装は「${IMPLEMENTATION_SPELLING}」を描く。合成の対照であり、根拠の綴りが走査根に実在することを確かめるために置く。`,
    evidence: ['backend/src/probe.ts'],
    unverified: false,
    ...overrides,
  };
}

/** 健全な素材。ここから一点だけ崩して陽性の対照を作る */
function baseScenario(): Scenario {
  return {
    criteria: [
      `The システム shall 「${PRESENT_LITERAL}」を表示する`,
      `The システム shall 「${ABSENT_LITERAL}」を表示する`,
    ],
    backend: `export const present = '${PRESENT_LITERAL}';\nexport const actual = '${IMPLEMENTATION_SPELLING}';\n`,
    frontend: `export const label = 'probe';\n`,
    ledger: {
      categories: {
        [DRIFT_CATEGORY]: '同じ役目の文字列が実装に在るが言い回しが違う（合成の宣言）',
        [UNVERIFIED_CATEGORY]: '実装に逐語も近似形も無い（合成の宣言）',
        'format-description': '逐語が書式の記述であって画面の文字列ではない（合成の宣言）',
      },
      entries: [syntheticEntry()],
    },
    entryLimit: 1,
  };
}

/** 一時のリポジトリを組み、判定器を走らせる */
function runOnSynthetic(scenario: Scenario): RunResult {
  const root = mkdtempSync(path.join(os.tmpdir(), 'criterion-literal-selftest-'));
  try {
    mkdirSync(path.join(root, '.kiro/specs/probe'), { recursive: true });
    const body = [
      '# 要件定義書（合成）',
      '',
      '### 要件1: 合成の要件',
      '',
      '#### 受入基準',
      '',
      ...scenario.criteria.map((text, index) => `${index + 1}. ${text}`),
      '',
    ].join('\n');
    writeFileSync(path.join(root, '.kiro/specs/probe/requirements.md'), body, 'utf8');
    mkdirSync(path.join(root, 'backend/src'), { recursive: true });
    writeFileSync(path.join(root, 'backend/src/probe.ts'), scenario.backend, 'utf8');
    mkdirSync(path.join(root, 'frontend/src'), { recursive: true });
    writeFileSync(path.join(root, 'frontend/src/probe.tsx'), scenario.frontend, 'utf8');
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    if (scenario.ledger !== undefined) {
      writeFileSync(
        path.join(root, LEDGER_PATH),
        typeof scenario.ledger === 'string'
          ? scenario.ledger
          : JSON.stringify(scenario.ledger, null, 2),
        'utf8'
      );
    }
    return run({ root, entryLimit: scenario.entryLimit });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * 陽性の対照そのものの死を表す期待値
 *
 * `detectorPositive` は指摘（`Finding`）ではなく `decideExit` の門であるため、種別では表せない。
 * **この期待値を持つ対照が無いと、本体で `detectorPositive` を `true` へ直書きしても本検査・
 * 自己検査とも緑のままである**（レビューが変異で実証した）。対照が対照自身を守る。
 */
const DETECTOR_DEATH = 'detector-death';

type ControlExpectation = FindingKind | typeof DETECTOR_DEATH;

/** 検出されなければならない崩し方 */
const MUST_DETECT: readonly {
  label: string;
  kind: ControlExpectation;
  mutate: (s: Scenario) => void;
}[] = [
  {
    label: '実装に無い逐語が台帳に無い',
    kind: 'unregistered-literal',
    mutate: (s) => {
      s.criteria.push('The システム shall 「実装に無い綴りベータ」を表示する');
    },
  },
  {
    label: '実装に在る逐語を台帳が挙げ続けている',
    kind: 'stale-ledger-entry',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries.push(
        syntheticEntry({
          id: 'probe/REQ-1.1',
          literal: PRESENT_LITERAL,
          criterionText: `The システム shall 「${PRESENT_LITERAL}」を表示する`,
        })
      );
      s.entryLimit = 2;
    },
  },
  {
    label: '台帳の項目に未知の欄がある',
    kind: 'ledger-schema',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({ verdict: '灰' });
    },
  },
  {
    label: '所在が実在しない',
    kind: 'ledger-schema',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({ evidence: ['backend/src/does-not-exist.ts'] });
    },
  },
  {
    label: '理由が短すぎる',
    kind: 'ledger-schema',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({ reason: '同上' });
    },
  },
  {
    label: '支えが無い旗と区分が食い違う',
    kind: 'ledger-schema',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({ unverified: true });
    },
  },
  {
    label: '逐語複製が条文と食い違う',
    kind: 'ledger-drift',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({ criterionText: '別の条文の本文である' });
    },
  },
  {
    label: '代替の根拠が実在しない綴りを引いている',
    kind: 'ledger-basis',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({
        alternativeBasis:
          '実装は「走査根のどこにも無い合成の代替の綴り」を描く、と主張するだけの根拠である。',
      });
    },
  },
  {
    label: '台帳の件数が宣言と食い違う',
    kind: 'ledger-ratchet',
    mutate: (s) => {
      s.entryLimit = 5;
    },
  },
  {
    label: '陽性の対照の綴りが走査根へ紛れ込む（判定器の死。detectorPositive の直書きを捕らえる）',
    kind: DETECTOR_DEATH,
    mutate: (s) => {
      const control = extractQuotedLiterals(DETECTOR_POSITIVE_CONTROL)[0]?.value ?? '';
      if (control === '') throw new Error('陽性の対照から逐語を取り出せません');
      s.backend += `export const leaked = '${control}';\n`;
    },
  },
];

/** 一件も告発されてはならない形 */
const MUST_NOT_DETECT: readonly { label: string; mutate: (s: Scenario) => void }[] = [
  {
    label: '健全な素材（崩さない）',
    mutate: () => {
      /* 崩さない */
    },
  },
  {
    label: '括弧の中身が短すぎる条文（逐語として読まない）',
    mutate: (s) => {
      s.criteria.push('The システム shall 「型」を表示する');
    },
  },
  {
    label: '逐語が frontend 側にだけ在る',
    mutate: (s) => {
      s.criteria.push('The システム shall 「画面側にだけ在る綴り」を表示する');
      s.frontend += `export const only = '画面側にだけ在る綴り';\n`;
    },
  },
  {
    label: '書式の記述の裁定は代替の根拠に綴りを引かなくてよい',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({
        category: 'format-description',
        alternativeBasis:
          '書式の記述であるため、実装に対応する一つの文字列は無い。並びは配列で持たれる。',
      });
    },
  },
  {
    label: '支えが無い裁定は旗と区分が揃っていればよい',
    mutate: (s) => {
      const ledger = s.ledger as { entries: Record<string, unknown>[] };
      ledger.entries[0] = syntheticEntry({
        category: UNVERIFIED_CATEGORY,
        unverified: true,
        alternativeBasis: '支えは無い。是正には実装か条文のどちらかを動かす別のタスクが要る。',
      });
    },
  },
];

/** 前提: 対照群が空でないこと。空のまま緑で通る真空パスを塞ぐ */
function reportPreconditions(): void {
  if (MUST_DETECT.length === 0) fail('PRECONDITION', 'MUST_DETECT が空です');
  if (MUST_NOT_DETECT.length === 0) fail('PRECONDITION', 'MUST_NOT_DETECT が空です');
  const quotePairs: readonly unknown[] = [...extractQuotedLiterals('「あいう」『かきく』"xyz"')];
  if (quotePairs.length !== 3) {
    fail('PRECONDITION', `三種の括弧を取り出せません（${quotePairs.length} 件）`);
  }
  const covered = new Set<ControlExpectation>(MUST_DETECT.map((entry) => entry.kind));
  if (!covered.has(DETECTOR_DEATH)) {
    fail('PRECONDITION', '陽性の対照そのものの死を捕らえる対照がありません');
  }
  for (const kind of FINDING_KINDS) {
    if (!covered.has(kind)) {
      fail('PRECONDITION', `検出の種別 ${kind} を覆う陽性の対照がありません`);
    }
  }
}

/** `reportPreconditions` の呼び出しごと外す経路を塞ぐ */
function checkPreconditionsAreWired(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const mainBody = source.slice(source.indexOf('function main('));
  if (!mainBody.includes('reportPreconditions()')) {
    fail('STRUCTURAL', 'main が reportPreconditions を呼んでいません');
  }
}

/** 本ファイルが宣言する `function check*` を一つ残らず main が呼んでいること */
function checkStructuralWiring(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const declared = [...source.matchAll(/^(?:async )?function (check[A-Za-z0-9_]*)\(/gm)].map(
    (m) => m[1] ?? ''
  );
  const mainBody = source.slice(source.indexOf('function main('));
  for (const name of declared) {
    if (!mainBody.includes(`${name}()`)) {
      fail('STRUCTURAL', `${name} が main から結線されていません`);
    }
  }
  if (declared.length === 0) fail('STRUCTURAL', '検査関数の宣言を一つも拾えませんでした');
}

/** 逐語の取り出し（三種の括弧・長さの下限・入れ子の既知の挙動） */
function checkLiteralExtraction(): void {
  const kagi = extractQuotedLiterals('「あいうえお」と表示する');
  if (kagi.length !== 1 || kagi[0]?.value !== 'あいうえお') {
    fail('EXTRACT', `鉤括弧の取り出しが壊れています: ${JSON.stringify(kagi)}`);
  }
  const futae = extractQuotedLiterals('『かきくけこ』を表示する');
  if (futae.length !== 1 || futae[0]?.value !== 'かきくけこ') {
    fail('EXTRACT', `二重鉤括弧の取り出しが壊れています: ${JSON.stringify(futae)}`);
  }
  const ascii = extractQuotedLiterals('the label "abcd" is shown');
  if (ascii.length !== 1 || ascii[0]?.value !== 'abcd') {
    fail('EXTRACT', `引用符の取り出しが壊れています: ${JSON.stringify(ascii)}`);
  }
  const short = extractQuotedLiterals('「型」「あい」');
  if (short.length !== 0) {
    fail('EXTRACT', `${MINIMUM_LITERAL_LENGTH} 文字未満を逐語として拾っています`);
  }
  const boundary = extractQuotedLiterals('「あいう」');
  if (boundary.length !== 1) {
    fail('EXTRACT', `下限ちょうど（${MINIMUM_LITERAL_LENGTH} 文字）を落としています`);
  }
  // 入れ子は解さない。既知の挙動として固定する（ファイル冒頭の限界に対応）
  const nested = extractQuotedLiterals('「あい「うえ」お」');
  if (nested[0]?.value !== 'あい「うえ') {
    fail('EXTRACT', `入れ子の既知の挙動が変わりました: ${JSON.stringify(nested)}`);
  }
  const unclosed = extractQuotedLiterals('「閉じない');
  if (unclosed.length !== 0) {
    fail('EXTRACT', '閉じない括弧から逐語を作っています');
  }
}

/** 陽性の対照が一つ残らず検出されること */
function checkMustDetect(): void {
  for (const entry of MUST_DETECT) {
    const scenario = baseScenario();
    entry.mutate(scenario);
    const result = runOnSynthetic(scenario);
    if (entry.kind === DETECTOR_DEATH) {
      if (result.detectorPositive) {
        fail(
          'MUST_DETECT',
          `${entry.label}: 陽性の対照が走査根に在るのに detectorPositive が真のままです（直書きの疑い）`
        );
      }
      if (decideExit(result).ok) {
        fail('MUST_DETECT', `${entry.label}: 判定器が死んでいるのに合格になります`);
      }
      continue;
    }
    if (!result.findings.some((finding) => finding.kind === entry.kind)) {
      fail(
        'MUST_DETECT',
        `${entry.label}: ${entry.kind} を検出しませんでした（検出 ${result.findings
          .map((finding) => finding.kind)
          .join(',')}）`
      );
    }
  }
}

/** 陰性の対照が一件も告発されないこと */
function checkMustNotDetect(): void {
  for (const entry of MUST_NOT_DETECT) {
    const scenario = baseScenario();
    entry.mutate(scenario);
    const result = runOnSynthetic(scenario);
    if (result.findings.length > 0) {
      fail(
        'MUST_NOT_DETECT',
        `${entry.label}: ${result.findings.length} 件が告発されました（${result.findings
          .map((finding) => `${finding.kind}:${finding.subject}`)
          .join(' / ')}）`
      );
    }
  }
}

/** 台帳が読めないときに「合格」にしないこと（第3原則） */
function checkMissingLedgerFails(): void {
  const scenario = baseScenario();
  scenario.ledger = undefined;
  const absent = runOnSynthetic(scenario);
  if (!absent.findings.some((finding) => finding.kind === 'ledger-schema')) {
    fail('LEDGER', '台帳が無くても指摘が出ません（不在を合格として扱っています）');
  }
  if (decideExit(absent).ok) fail('LEDGER', '台帳が無くても合格になります');

  const broken = baseScenario();
  broken.ledger = '{ これは JSON ではない';
  const parsed = runOnSynthetic(broken);
  if (!parsed.findings.some((finding) => finding.kind === 'ledger-schema')) {
    fail('LEDGER', '壊れた JSON を読み飛ばしています');
  }
}

/** 空振りの走査が緑で通らないこと（第3原則） */
function checkVacuousRunsFail(): void {
  const base: RunResult = {
    findings: [],
    featureCount: 1,
    criterionCount: 2,
    criterionWithLiteralCount: 2,
    literalCount: 2,
    implementationFileCount: 2,
    missing: [],
    ledgerEntryCount: 1,
    unverifiedCount: 0,
    detectorPositive: true,
  };
  if (!decideExit(base).ok) fail('VACUOUS', '健全な結果が不合格になりました');
  const degradations: { label: string; result: RunResult }[] = [
    { label: '機能が0件', result: { ...base, featureCount: 0 } },
    { label: '受入基準が0件', result: { ...base, criterionCount: 0 } },
    { label: '逐語が0件', result: { ...base, literalCount: 0 } },
    { label: '実装ファイルが0件', result: { ...base, implementationFileCount: 0 } },
    { label: '陽性の対照が死んでいる', result: { ...base, detectorPositive: false } },
    {
      label: '指摘が1件ある',
      result: {
        ...base,
        findings: [{ kind: 'unregistered-literal', subject: 'x', detail: 'y' }],
      },
    },
  ];
  for (const degradation of degradations) {
    if (decideExit(degradation.result).ok) {
      fail('VACUOUS', `${degradation.label} でも合格になります`);
    }
  }
}

/** 陽性の対照そのものが判定器を通ること */
function checkDetectorPositiveControl(): void {
  const literals = extractQuotedLiterals(DETECTOR_POSITIVE_CONTROL);
  if (literals.length !== 1) {
    fail('CONTROL', `陽性の対照から逐語を 1 件拾えません（${literals.length} 件）`);
    return;
  }
  const files = listImplementationFiles(REPOSITORY_ROOT);
  const value = literals[0]?.value ?? '';
  for (const relative of files) {
    if (readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8').includes(value)) {
      fail('CONTROL', `陽性の対照の綴りが走査根に実在します（${relative}）。対照が死んでいます`);
      return;
    }
  }
}

/** 実データの走査が空振りしていないこと（走査根や台帳を消して緑にする経路を塞ぐ） */
function checkRealTargetIsScanned(): void {
  const result = run();
  if (result.featureCount === 0) fail('REAL_TARGET', '実データの機能を一件も読んでいません');
  if (result.criterionCount === 0) fail('REAL_TARGET', '実データの受入基準が 0 件です');
  if (result.literalCount === 0) fail('REAL_TARGET', '実データから逐語を一つも拾えていません');
  if (result.implementationFileCount === 0) {
    fail('REAL_TARGET', `実データの走査根（${IMPLEMENTATION_ROOTS.join(' / ')}）が空です`);
  }
  if (result.ledgerEntryCount !== LEDGER_ENTRY_LIMIT) {
    fail(
      'REAL_TARGET',
      `台帳の件数 ${result.ledgerEntryCount} が宣言 ${LEDGER_ENTRY_LIMIT} と一致しません`
    );
  }
  if (result.missing.length === 0) {
    fail('REAL_TARGET', '実データで実装に無い逐語が 0 件です（探索が空回りしている疑い）');
  }
}

/** 本体が宣言する種別と、本ファイルの `FINDING_KINDS` が一致すること */
function checkFindingKindsAreExhaustive(): void {
  const source = readFileSync(SUBJECT_PATH, 'utf8');
  const start = source.indexOf('export const FINDING_KINDS');
  if (start < 0) {
    fail('KINDS', '本体から FINDING_KINDS の宣言を見つけられません');
    return;
  }
  const declaration = source.slice(start, source.indexOf('] as const;', start));
  const declared = [...declaration.matchAll(/'([a-z-]+)'/g)].map((m) => m[1] ?? '').sort();
  const mine = [...FINDING_KINDS].sort();
  if (declared.join(',') !== mine.join(',')) {
    fail(
      'KINDS',
      `本体の種別 [${declared.join(', ')}] と自己検査の種別 [${mine.join(', ')}] が一致しません`
    );
  }
}

/** 台帳の散文に課す下限が、実データの台帳で実際に効いていること */
function checkProseFloorIsMeaningful(): void {
  if (MINIMUM_PROSE_LENGTH <= 0) {
    fail('PROSE', '散文の下限が 0 以下です（「-」で埋める形を塞げません）');
  }
  const ledger = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, LEDGER_PATH), 'utf8')) as {
    entries: { id: string; reason: string; alternativeBasis: string }[];
  };
  for (const entry of ledger.entries) {
    for (const prose of [entry.reason, entry.alternativeBasis]) {
      if ([...prose.trim()].length < MINIMUM_PROSE_LENGTH) {
        fail('PROSE', `${entry.id} の散文が下限を下回ります`);
      }
    }
  }
}

function main(): void {
  reportPreconditions();
  checkPreconditionsAreWired();
  checkStructuralWiring();
  checkLiteralExtraction();
  checkVacuousRunsFail();
  checkDetectorPositiveControl();
  checkFindingKindsAreExhaustive();
  checkMissingLedgerFails();
  checkMustDetect();
  checkMustNotDetect();
  checkRealTargetIsScanned();
  checkProseFloorIsMeaningful();

  const total = MUST_DETECT.length + MUST_NOT_DETECT.length;
  if (failures.length === 0) {
    console.log(
      '✅ 受入基準の逐語の実在 判定器の自己検査に合格しました' +
        `（陽性 ${MUST_DETECT.length} 件 / 陰性 ${MUST_NOT_DETECT.length} 件 / 対照 ${total} 件 /` +
        ` 検出の種別 ${FINDING_KINDS.length} 種）`
    );
    return;
  }

  console.error('❌ 受入基準の逐語の実在 判定器の自己検査に失敗しました');
  console.error('');
  for (const failure of failures) {
    console.error(`   [${failure.scope}] ${failure.detail}`);
  }
  console.error('');
  console.error(`   合計 ${failures.length} 件 / 対照 ${total} 件`);
  process.exit(1);
}

main();
