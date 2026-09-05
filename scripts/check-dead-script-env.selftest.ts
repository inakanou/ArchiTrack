/**
 * @fileoverview 死んだ環境変数の検査 判定器の自己検査（タスク 115.244）
 *
 * `scripts/check-dead-script-env.ts` の判定器が
 *   (1) **緩む向き**——読み手のいない変数、注釈だけが名指しする変数を取り逃がさないこと、
 *   (2) **狭まる向き**——実際に読まれている変数（分割代入・添字・シェル参照を含む）を
 *       告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の中核は**是正前に実在した形**である。`RUN_INTEGRATION_TESTS` はタスク 115.216
 * の是正前に backend のどこからも読まれていなかった実物であり、`ARCHITRACK_PROBE_DEAD` の
 * 注釈だけの言及は 115.216 のレビューが変異で実証した見逃しの実物である（2026-08-31）。
 *
 * ## 対照群の母集団を空にする変異が赤くなること（AI運用7原則 第3原則）
 *
 * 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。
 * 何も主張していない状態であり、前提の崩壊として赤くする。**守り手を守られる側と同じ
 * レジストリへ置かない**ため（115.242 が確立）、前提の確認は配列への登録ではなく
 * `reportPreconditions` の直列の手続きとして書き、`main` の冒頭で対照より先に走らせる。
 * 呼び出しごと外す経路は `checkPreconditionsAreWired` が塞ぎ、その守り手は `function check`
 * 宣言なので `structuralWiringFailures` が `STRUCTURAL` への結線を強制する。相互に施錠される。
 *
 * ## 下限をどこに置くか（115.222 の判断を引き継ぐ）
 *
 *   - `STRUCTURAL`: 本ファイルが宣言する `function check*` を一つ残らず結線していること。
 *     検査を増減させれば下限も自動で追随する。**限界**: 語彙は行頭の `function check` という
 *     宣言の形から取るため、未結線の新しいアロー式検査（`const checkX = () => ...`）を足す
 *     場合だけ素通りする。本ファイルの検査関数は全て `function` 宣言で書くこと。
 *   - `MUST_DETECT` / `MUST_NOT_DETECT`: 下限を導ける語彙が本体側に無いため「空でないこと」に
 *     留める。**限界**: 件数を 1 件へ削る破壊は止まらない。根拠の無い件数を貼らないという
 *     115.222 の判断をそのまま引き継ぐ。
 *   - `WIRING_SAMPLES` / `CI_STRUCTURE_SAMPLES`（結線の判定器の対照）: 同じく件数は貼らないが、
 *     **陽性・陰性のどちらかが消えたら赤くする**下限を置く。片側だけの対照は判定器が
 *     恒真・恒偽に退化しても通ってしまうためである。
 *
 * 使用方法:
 *   npx tsx scripts/check-dead-script-env.selftest.ts
 *   npm run check:dead-script-env:selftest
 *
 * 判定器が壊れたまま本検査が「合格」を出す状態を防ぐため、押下前の関門と CI では
 * 本検査の前に走らせる。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORPUS_ROOT,
  NON_READER_EXTENSIONS,
  NON_READER_FILES,
  NON_SOURCE_DIRECTORIES,
  PACKAGE_MANIFESTS,
  collectCorpusFiles,
  decideExit,
  destructuredEnvNames,
  extractAssignedEnvNames,
  findDeadEnvNames,
  normalizeForReadScan,
  run,
  stripComments,
  type RunResult,
} from './check-dead-script-env.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const ENTRY = path.join(SCRIPTS_DIR, 'check-dead-script-env.ts');
const SELF = path.join(SCRIPTS_DIR, 'check-dead-script-env.selftest.ts');

// ============================================================================
// 対照の実行器
// ============================================================================

/** 合成した「定義元 + コーパス」の対照 1 件 */
interface DetectionSample {
  /** 対照の名前 */
  readonly name: string;
  /** 定義元となる npm スクリプトの文字列 */
  readonly script: string;
  /** 判定の対象となる環境変数名 */
  readonly variable: string;
  /** 合成したコーパス（ファイル名は注釈の除去規則の選択に効く） */
  readonly files: ReadonlyArray<{ readonly file: string; readonly text: string }>;
}

/** 対照を 1 件走らせ、死んだと判定された変数名の一覧を返す */
function judge(sample: DetectionSample): { assigned: string[]; dead: string[] } {
  const assigned = extractAssignedEnvNames(sample.script);
  const corpus = sample.files
    .map((entry) => normalizeForReadScan(entry.file, entry.text))
    .join('\n');
  const destructured = destructuredEnvNames(corpus);
  return { assigned, dead: findDeadEnvNames(assigned, corpus, destructured) };
}

// ============================================================================
// 結線の判定器（純関数。対照で駆動する）
// ============================================================================

/** 本検査の実行コマンド */
const CHECK_COMMAND = 'npm run check:dead-script-env';
/** 自己検査の実行コマンド */
const SELFTEST_COMMAND = 'npm run check:dead-script-env:selftest';
/** CI のジョブ識別子 */
const CI_JOB_ID = 'dead-script-env';

/**
 * `command` が**実行として**現れるか。行を trim した**完全一致**だけを実行と数える。
 *
 * 文字列包含（`text.includes(command)`）では、`echo "詳細確認: npm run check:dead-script-env"`
 * の引用符内の言及、行頭 `#` の注釈、`…:selftest` / `…:verbose` への部分一致がすべて
 * 「結線されている」と誤判定される。本体の `isReadSomewhere` が「綴りが現れるだけでは
 * 読み手と数えない」を実装しているのと同じ規律をここにも当てる（115.244 のレビュー）。
 */
function hasExecutionLine(text: string, command: string): boolean {
  return text.split('\n').some((line) => line.trim() === command);
}

/** YAML の 2 空白字下げのジョブ定義（`  <id>:`）の本文を切り出す */
function sliceYamlJobBlock(text: string, jobId: string): string {
  const lines = text.split('\n');
  const start = lines.indexOf(`  ${jobId}:`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** ジョブ本文の `needs: [a, b, c]` の要素を取り出す */
function parseNeedsList(jobBlock: string): string[] {
  const line = jobBlock.split('\n').find((entry) => /^\s*needs:\s*\[/.test(entry));
  if (line === undefined) return [];
  const open = line.indexOf('[');
  const close = line.lastIndexOf(']');
  if (open === -1 || close === -1 || close < open) return [];
  return line
    .slice(open + 1, close)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * 失敗判定の**条件部**の行だけを取り出す。
 *
 * `echo` で始まる行は結果に一切効かない表示であり、条件部に数えない。除外しないと
 * 「条件から外したが echo は残っている」状態を結線ありと誤判定する。
 */
function failureConditionLines(jobBlock: string): string[] {
  return jobBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('echo'))
    .filter((line) => line.includes('!= "success"'));
}

/** 結線の判定の対照 1 件 */
interface WiringSample {
  readonly name: string;
  readonly text: string;
  /** 実行として数えるべきか */
  readonly expected: boolean;
}

/** `hasExecutionLine` の対照（陽性 = 実行、陰性 = 言及にすぎない） */
const WIRING_SAMPLES: readonly WiringSample[] = [
  { name: '実行の行そのもの', text: `${CHECK_COMMAND}\n`, expected: true },
  {
    name: '前後に空白のある実行の行',
    text: `  ${CHECK_COMMAND}  \n`,
    expected: true,
  },
  {
    name: 'echo の引用符内の言及だけ（レビューが実測した素通りの形）',
    text: `  echo "詳細確認: ${CHECK_COMMAND}"\n`,
    expected: false,
  },
  {
    name: '行頭 # の注釈だけ',
    text: `# ${CHECK_COMMAND}\n`,
    expected: false,
  },
  {
    name: ':selftest への部分一致だけ',
    text: `${SELFTEST_COMMAND}\n`,
    expected: false,
  },
  {
    name: ':verbose への部分一致だけ',
    text: `${CHECK_COMMAND}:verbose\n`,
    expected: false,
  },
  {
    name: '行の途中に現れるだけ（&& で連結された言及）',
    text: `true && ${CHECK_COMMAND}\n`,
    expected: false,
  },
];

/** `WIRING_SAMPLES` を回す。GROUPS へ結線して実行する */
function wiringSampleFailures(): string[] {
  const failures: string[] = [];
  for (const sample of WIRING_SAMPLES) {
    const judged = hasExecutionLine(sample.text, CHECK_COMMAND);
    if (judged !== sample.expected) {
      failures.push(
        `${sample.expected ? '陽性' : '陰性'} [${sample.name}]: 実行の判定が ${judged}（期待は ${sample.expected}）`
      );
    }
  }
  return failures;
}

/** YAML の構造の取り出しの対照 1 件 */
interface CiStructureSample {
  readonly name: string;
  readonly yaml: string;
  /** `dead-script-env` が結線されていると判定されるべきか */
  readonly expected: boolean;
}

/** 結線されている最小の ci.yml */
const CI_WIRED = [
  'jobs:',
  `  ${CI_JOB_ID}:`,
  '    steps:',
  '      - name: Check',
  '        run: |',
  `          ${SELFTEST_COMMAND}`,
  `          ${CHECK_COMMAND}`,
  '  ci-success:',
  `    needs: [lint, ${CI_JOB_ID}]`,
  '    steps:',
  '      - run: |',
  `          if [[ "\${{ needs.${CI_JOB_ID}.result }}" != "success" ]]; then`,
  `            echo "   - Dead Script Env: \${{ needs.${CI_JOB_ID}.result }}"`,
  '            exit 1',
  '          fi',
  '',
].join('\n');

/** `sliceYamlJobBlock` / `parseNeedsList` / `failureConditionLines` の対照 */
const CI_STRUCTURE_SAMPLES: readonly CiStructureSample[] = [
  { name: '実行ステップ・needs・条件部が揃っている', yaml: CI_WIRED, expected: true },
  {
    name: '検査のジョブごと消えている',
    yaml: CI_WIRED.replace(`  ${CI_JOB_ID}:\n`, '  other-job:\n'),
    expected: false,
  },
  {
    name: '実行の行だけ消えている（自己検査の行は残る）',
    yaml: CI_WIRED.replace(`          ${CHECK_COMMAND}\n`, ''),
    expected: false,
  },
  {
    name: 'needs から外れている',
    yaml: CI_WIRED.replace(`    needs: [lint, ${CI_JOB_ID}]`, '    needs: [lint]'),
    expected: false,
  },
  {
    name: '条件部から外れ、echo の表示だけ残っている',
    yaml: CI_WIRED.replace(
      `          if [[ "\${{ needs.${CI_JOB_ID}.result }}" != "success" ]]; then`,
      '          if [[ "${{ needs.lint.result }}" != "success" ]]; then'
    ),
    expected: false,
  },
  {
    name: 'echo の行が条件の綴りを持っていても条件部に数えない',
    yaml: CI_WIRED.replace(
      `            echo "   - Dead Script Env: \${{ needs.${CI_JOB_ID}.result }}"`,
      `            echo "\${{ needs.${CI_JOB_ID}.result }} != \"success\""`
    ).replace(
      `          if [[ "\${{ needs.${CI_JOB_ID}.result }}" != "success" ]]; then`,
      '          if [[ "${{ needs.lint.result }}" != "success" ]]; then'
    ),
    expected: false,
  },
];

/** 合成した ci.yml に対して、4 点（ジョブ・実行行・needs・条件部）がすべて成立するか */
function ciWiringHolds(yaml: string): boolean {
  const job = sliceYamlJobBlock(yaml, CI_JOB_ID);
  if (job === '') return false;
  if (!hasExecutionLine(job, CHECK_COMMAND)) return false;
  if (!hasExecutionLine(job, SELFTEST_COMMAND)) return false;
  const gate = sliceYamlJobBlock(yaml, 'ci-success');
  if (gate === '') return false;
  if (!parseNeedsList(gate).includes(CI_JOB_ID)) return false;
  return failureConditionLines(gate).some((line) => line.includes(`needs.${CI_JOB_ID}.result`));
}

/** `CI_STRUCTURE_SAMPLES` を回す。GROUPS へ結線して実行する */
function ciStructureSampleFailures(): string[] {
  const failures: string[] = [];
  for (const sample of CI_STRUCTURE_SAMPLES) {
    const judged = ciWiringHolds(sample.yaml);
    if (judged !== sample.expected) {
      failures.push(
        `${sample.expected ? '陽性' : '陰性'} [${sample.name}]: 結線の判定が ${judged}（期待は ${sample.expected}）`
      );
    }
  }
  return failures;
}

/** 検出されなければならない対照（陽性対照） */
const MUST_DETECT: readonly DetectionSample[] = [
  {
    name: '読み手が一つも無い（115.216 の是正前の実物 RUN_INTEGRATION_TESTS）',
    script: 'RUN_INTEGRATION_TESTS=true vitest run src/__tests__/integration',
    variable: 'RUN_INTEGRATION_TESTS',
    files: [{ file: 'src/index.ts', text: 'export const noop = () => undefined;\n' }],
  },
  {
    name: '行注釈だけが名指しする（115.216 のレビューが変異で実証した見逃し）',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [
      {
        file: 'src/note.ts',
        text: '// process.env.ARCHITRACK_PROBE_DEAD is intentionally not used here.\nexport const x = 1;\n',
      },
    ],
  },
  {
    name: 'ブロック注釈だけが名指しする',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [
      {
        file: 'src/note.ts',
        text: '/**\n * process.env.ARCHITRACK_PROBE_DEAD はここでは読まない\n */\nexport const x = 1;\n',
      },
    ],
  },
  {
    name: '綴りが文字列リテラルに現れるだけ（読む形ではない）',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [{ file: 'src/note.ts', text: "export const key = 'ARCHITRACK_PROBE_DEAD';\n" }],
  },
  {
    name: 'YAML の行頭 `#` 注釈の中のシェル参照だけ',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [
      {
        file: '.github/workflows/probe.yml',
        text: 'jobs:\n  probe:\n    steps:\n      # echo ${ARCHITRACK_PROBE_DEAD}\n      - run: echo done\n',
      },
    ],
  },
  {
    name: 'シェルの行頭 `#` 注釈の中のシェル参照だけ',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [
      { file: 'scripts/probe.sh', text: '#!/bin/bash\n# echo "$ARCHITRACK_PROBE_DEAD"\necho ok\n' },
    ],
  },
  {
    name: '分割代入だが `process.env` からではない',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [{ file: 'src/note.ts', text: 'const { ARCHITRACK_PROBE_DEAD } = someOtherObject;\n' }],
  },
  {
    name: "地の文の引用符（JSX の don't）が同じ行の注釈を覆い隠さない（レビューの実測）",
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [
      {
        file: 'src/note.tsx',
        text: "const el = <p>don't</p>; // process.env.ARCHITRACK_PROBE_DEAD\n",
      },
    ],
  },
  {
    name: '接頭辞が一致するだけの別名を読み手と数えない',
    script: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run',
    variable: 'ARCHITRACK_PROBE_DEAD',
    files: [{ file: 'src/note.ts', text: 'const v = process.env.ARCHITRACK_PROBE_DEADLINE;\n' }],
  },
];

/** 検出されてはならない対照（陰性対照） */
const MUST_NOT_DETECT: readonly DetectionSample[] = [
  {
    name: '素の属性参照',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [{ file: 'src/read.ts', text: 'export const v = process.env.ARCHITRACK_PROBE_LIVE;\n' }],
  },
  {
    name: '添字参照',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      { file: 'src/read.ts', text: "export const v = process.env['ARCHITRACK_PROBE_LIVE'];\n" },
    ],
  },
  {
    name: '分割代入（115.244 の (3)）',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [{ file: 'src/read.ts', text: 'const { ARCHITRACK_PROBE_LIVE } = process.env;\n' }],
  },
  {
    name: '分割代入（別名つき）',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      { file: 'src/read.ts', text: 'const { ARCHITRACK_PROBE_LIVE: live } = process.env;\n' },
    ],
  },
  {
    name: '分割代入（既定値つき・複数・改行）',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: "const {\n  NODE_ENV,\n  ARCHITRACK_PROBE_LIVE = 'default',\n} = process.env;\n",
      },
    ],
  },
  {
    name: '分割代入（型註つき）',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: 'const { ARCHITRACK_PROBE_LIVE }: NodeJS.ProcessEnv = process.env;\n',
      },
    ],
  },
  {
    name: 'シェルの波括弧つき参照',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [{ file: 'scripts/read.sh', text: 'echo "${ARCHITRACK_PROBE_LIVE}"\n' }],
  },
  {
    name: 'シェルの波括弧なし参照',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [{ file: 'scripts/read.sh', text: 'echo "$ARCHITRACK_PROBE_LIVE"\n' }],
  },
  {
    name: 'compose の変数展開',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'docker-compose.yml',
        text: 'services:\n  api:\n    environment:\n      - LIVE=${ARCHITRACK_PROBE_LIVE}\n',
      },
    ],
  },
  {
    name: '文字列リテラルの中の `//` を注釈と誤らない（115.226 / 115.259 の同型）',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: "const url = 'http://example.test'; const v = process.env.ARCHITRACK_PROBE_LIVE;\n",
      },
    ],
  },
  {
    name: 'テンプレートリテラルの中の `//` を注釈と誤らない',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: 'const url = `http://example.test`; const v = process.env.ARCHITRACK_PROBE_LIVE;\n',
      },
    ],
  },
  {
    name: '正規表現リテラルの中の `//` を注釈と誤らない',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: 'const re = /\\/\\//; const v = process.env.ARCHITRACK_PROBE_LIVE;\n',
      },
    ],
  },
  {
    name: 'テンプレートの `${}` の中の注釈を落としても読み手を失わない',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: 'const s = `${/* 註 */ process.env.ARCHITRACK_PROBE_LIVE}`;\n',
      },
    ],
  },
  {
    name: 'アロー関数の直後の正規表現リテラルを取り違えない',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.ts',
        text: 'const f = () => /\\/\\//.test(s);\nconst v = process.env.ARCHITRACK_PROBE_LIVE;\n',
      },
    ],
  },
  {
    name: 'JSX の閉じ札のある行の読みを落とさない',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: 'src/read.tsx',
        text: 'const el = <p>ok</p>;\nconst v = process.env.ARCHITRACK_PROBE_LIVE;\n',
      },
    ],
  },
  {
    name: 'YAML の行途中の `#` より前にある参照',
    script: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run',
    variable: 'ARCHITRACK_PROBE_LIVE',
    files: [
      {
        file: '.github/workflows/read.yml',
        text: 'jobs:\n  read:\n    steps:\n      - run: echo ${ARCHITRACK_PROBE_LIVE} # 参照する\n',
      },
    ],
  },
];

// ============================================================================
// 対照の判定
// ============================================================================

function detectionFailures(): string[] {
  const failures: string[] = [];

  for (const sample of MUST_DETECT) {
    const { assigned, dead } = judge(sample);
    if (!assigned.includes(sample.variable)) {
      failures.push(`陽性 [${sample.name}]: 定義元から ${sample.variable} を取り出せていない`);
      continue;
    }
    if (!dead.includes(sample.variable)) {
      failures.push(`陽性 [${sample.name}]: ${sample.variable} が検出されていない（見逃し）`);
    }
  }

  for (const sample of MUST_NOT_DETECT) {
    const { assigned, dead } = judge(sample);
    if (!assigned.includes(sample.variable)) {
      failures.push(`陰性 [${sample.name}]: 定義元から ${sample.variable} を取り出せていない`);
      continue;
    }
    if (dead.includes(sample.variable)) {
      failures.push(`陰性 [${sample.name}]: ${sample.variable} を誤って検出した（過検出）`);
    }
  }

  return failures;
}

// ============================================================================
// 構造の対照
// ============================================================================

/** 検査 1 件 */
interface Case {
  readonly name: string;
  readonly custom: () => string[];
}

function readSelfSource(): string {
  return readFileSync(SELF, 'utf-8');
}

function readEntrySource(): string {
  return readFileSync(ENTRY, 'utf-8');
}

/** 一時リポジトリを作り、走査根つきで `run` を呼ぶ */
function withTemporaryRepository(
  files: Record<string, string>,
  body: (root: string) => string[]
): string[] {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dead-script-env-'));
  try {
    for (const [relative, text] of Object.entries(files)) {
      const absolute = path.join(root, relative);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, text, 'utf-8');
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** 3 つの `package.json` の骨組み（`scripts` は呼び出し側が差し替える） */
function manifestFixtures(rootScripts: Record<string, string>): Record<string, string> {
  const fixtures: Record<string, string> = {};
  for (const manifest of PACKAGE_MANIFESTS) {
    fixtures[manifest] = JSON.stringify(
      { name: manifest, scripts: manifest === 'package.json' ? rootScripts : {} },
      null,
      2
    );
  }
  return fixtures;
}

function checkEntryExists(): string[] {
  return existsSync(ENTRY) ? [] : [`検査本体が実在しない: ${ENTRY}`];
}

function checkManifestsAreDeclared(): string[] {
  const failures: string[] = [];
  if (PACKAGE_MANIFESTS.length !== 3) {
    failures.push(`走査する package.json が ${PACKAGE_MANIFESTS.length} 件（3 件であること）`);
  }
  for (const manifest of PACKAGE_MANIFESTS) {
    if (!existsSync(path.join(ROOT, manifest))) {
      failures.push(`宣言された定義元が実在しない: ${manifest}`);
    }
  }
  const requiredManifests = ['package.json', 'backend/package.json', 'frontend/package.json'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (requiredManifests.length === 0) {
    failures.push('素材 requiredManifests が空です（この確認が空振りしています）');
  }
  for (const expected of requiredManifests) {
    if (!PACKAGE_MANIFESTS.includes(expected)) {
      failures.push(`走査対象に ${expected} が含まれていない（適用範囲の後退）`);
    }
  }
  return failures;
}

function checkScanRootsAreExported(): string[] {
  const failures: string[] = [];
  // 115.227 の教訓: 走査根が `main()` の中にしかないと自己検査から到達できない
  if (typeof CORPUS_ROOT !== 'string' || CORPUS_ROOT === '') {
    failures.push('CORPUS_ROOT が export されていないか空である');
  }
  if (NON_SOURCE_DIRECTORIES.size === 0) {
    failures.push('NON_SOURCE_DIRECTORIES が空である（生成物の除外が効かない）');
  }
  if (!NON_READER_FILES.has('package.json')) {
    failures.push('NON_READER_FILES が定義元 package.json を除外していない');
  }
  if (!NON_READER_EXTENSIONS.has('.md')) {
    failures.push('NON_READER_EXTENSIONS が .md を除外していない（文書が読み手になる）');
  }
  return failures;
}

function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const result = run(ROOT);
  if (result.scannedManifests.length !== PACKAGE_MANIFESTS.length) {
    failures.push(
      `実リポジトリで走査できた定義元が ${result.scannedManifests.length} 件（宣言は ${PACKAGE_MANIFESTS.length} 件）`
    );
  }
  if (result.corpusFiles === 0) {
    failures.push('実リポジトリの読み手候補が 0 ファイル（走査が空振りしている）');
  }
  if (result.assignments.length === 0) {
    failures.push('実リポジトリで環境変数を設定するスクリプトが 0 件（母集団が空）');
  }
  if (!decideExit(result).ok) {
    failures.push(`実リポジトリが合格していない: ${decideExit(result).reason ?? ''}`);
  }
  return failures;
}

function checkDocumentsAndManifestsAreNotReaders(): string[] {
  const failures: string[] = [];
  const files = collectCorpusFiles(ROOT);
  const documents = files.filter((entry) => entry.file.endsWith('.md'));
  if (documents.length > 0) {
    failures.push(`文書がコーパスに入っている: ${documents.length} 件（例 ${documents[0]?.file}）`);
  }
  const manifests = files.filter((entry) => path.basename(entry.file) === 'package.json');
  if (manifests.length > 0) {
    failures.push(`定義元 package.json がコーパスに入っている: ${manifests.length} 件`);
  }
  const vendored = files.filter((entry) => entry.file.split(path.sep).includes('node_modules'));
  if (vendored.length > 0) {
    failures.push(`node_modules がコーパスに入っている: ${vendored.length} 件`);
  }
  return failures;
}

function checkEmptyPopulationIsNotSuccess(): string[] {
  // 母集団（設定される環境変数）が空の合格は、何も主張していない（第3原則）
  return withTemporaryRepository(manifestFixtures({ test: 'vitest run' }), (root) => {
    const result = run(root);
    const failures: string[] = [];
    if (result.assignments.length !== 0) {
      failures.push('一時リポジトリの母集団が空になっていない（対照の前提が崩れている）');
    }
    if (decideExit(result).ok) {
      failures.push('母集団が空でも合格になっている');
    }
    return failures;
  });
}

function checkMissingManifestIsNotSuccess(): string[] {
  const fixtures = manifestFixtures({ 'test:e2e': 'cross-env NODE_ENV=test playwright test' });
  delete fixtures['frontend/package.json'];
  return withTemporaryRepository(fixtures, (root) => {
    const result = run(root);
    const failures: string[] = [];
    if (result.missingManifests.length === 0) {
      failures.push('欠けた定義元を検知していない');
    }
    if (decideExit(result).ok) {
      failures.push('定義元が欠けていても合格になっている');
    }
    return failures;
  });
}

function checkEndToEndDetection(): string[] {
  const failures: string[] = [];

  // 陽性: 注釈だけが名指しする変数を、走査から報告まで通して検出する
  const dead = withTemporaryRepository(
    {
      ...manifestFixtures({ probe: 'cross-env ARCHITRACK_PROBE_DEAD=1 vitest run' }),
      'src/note.ts': '// process.env.ARCHITRACK_PROBE_DEAD is intentionally not used here.\n',
      'docs/note.md': 'process.env.ARCHITRACK_PROBE_DEAD を使う予定\n',
    },
    (root) => {
      const result = run(root);
      const problems: string[] = [];
      if (!result.findings.some((finding) => finding.name === 'ARCHITRACK_PROBE_DEAD')) {
        problems.push('端から端まで通したとき、注釈だけの言及を読み手と誤判定している');
      }
      if (decideExit(result).ok) {
        problems.push('死んだ環境変数があるのに合格になっている');
      }
      return problems;
    }
  );
  failures.push(...dead);

  // 陰性: 分割代入で読んでいれば通す
  const live = withTemporaryRepository(
    {
      ...manifestFixtures({ probe: 'cross-env ARCHITRACK_PROBE_LIVE=1 vitest run' }),
      'src/read.ts': 'const { ARCHITRACK_PROBE_LIVE } = process.env;\n',
    },
    (root) => {
      const result = run(root);
      return result.findings.length === 0
        ? []
        : [
            `分割代入で読んでいる変数を誤検出した: ${result.findings.map((f) => f.name).join(', ')}`,
          ];
    }
  );
  failures.push(...live);

  return failures;
}

function checkFailureDefaultIsPresent(): string[] {
  const failures: string[] = [];
  const source = readEntrySource();
  if (!/^process\.exitCode = 1;$/m.test(source)) {
    failures.push('本体の頂に失敗既定 `process.exitCode = 1;` が無い');
  }
  if (!/process\.exitCode = 0;/.test(source)) {
    failures.push('本体の成功経路に `process.exitCode = 0;` が無い（失敗既定を解除できない）');
  }
  const mainBody = sliceFunctionBody(source, '\nexport function main(');
  if (mainBody === '') {
    failures.push('本体の main を切り出せない');
  } else if (!/process\.exitCode = 0;/.test(mainBody)) {
    failures.push('失敗既定の解除が main の中に無い');
  }
  return failures;
}

function checkEntryIsWired(): string[] {
  const failures: string[] = [];
  const source = readEntrySource();
  if (
    !/if \(invokedPath === fileURLToPath\(import\.meta\.url\)\) \{\s*main\(\);\s*\}/.test(source)
  ) {
    failures.push('本体の入口（起動判定と main() の呼び出し）が見つからない');
  }
  const exitLine = source.indexOf('\nprocess.exitCode = 1;');
  const entryLine = source.indexOf('if (invokedPath === fileURLToPath(import.meta.url))');
  if (exitLine === -1 || entryLine === -1 || exitLine > entryLine) {
    failures.push('失敗既定が入口より後ろにある（入口が消えたとき EXIT=0 で通ってしまう）');
  }
  return failures;
}

function checkSubprocessRunSucceeds(): string[] {
  const failures: string[] = [];
  const executed = spawnSync('npx', ['tsx', ENTRY, '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 180000,
  });
  if (executed.status !== 0) {
    failures.push(`本体をサブプロセスで起動すると EXIT=${executed.status}: ${executed.stderr}`);
    return failures;
  }
  let reported: RunResult;
  try {
    reported = JSON.parse(executed.stdout) as RunResult;
  } catch {
    failures.push('本体の --json 出力を解析できない');
    return failures;
  }
  const measured = run(ROOT);
  if (reported.distinctNames.length !== measured.distinctNames.length) {
    failures.push(
      `サブプロセスの報告（${reported.distinctNames.length} 件）と手元の実測（${measured.distinctNames.length} 件）が食い違う`
    );
  }
  if (reported.corpusFiles === 0) {
    failures.push('サブプロセスの報告で読み手候補が 0 ファイル');
  }
  return failures;
}

function checkWiredIntoGates(): string[] {
  // 115.216 の教訓: 押下前の関門と CI へ結線できない検査は、誰も走らせない死んだ検査になる。
  //
  // **「言及」ではなく「実行」を見る。** 是正前は `text.includes(needle)` で判定していたため、
  // 実行の行を消して `echo "詳細確認: npm run check:dead-script-env"` の**引用符内の言及**だけを
  // 残しても 18/18 緑で通った（115.244 のレビューが実測）。本体の `isReadSomewhere` が
  // 「綴りが現れるだけでは読み手と数えない」を実装しているのに、その兄弟が逆をやっていた。
  // 判定は `hasExecutionLine`（行の trim 後の完全一致）と YAML の構造の取り出しへ移した。
  const failures: string[] = [];

  // 結線を確かめる対象のコマンド。**素材が空なら以下の照合は一度も回らず、pre-push.sh と
  // ci.yml への結線の主張そのものが消える**（第3原則。115.252。是正前の実測 2026-09-03:
  // 二つの `for...of` の直書き配列を空にすると 20/20 緑・EXIT=0）。
  const wiredCommands = [SELFTEST_COMMAND, CHECK_COMMAND];
  if (wiredCommands.length === 0) {
    failures.push('素材 wiredCommands が空です（この確認が空振りしています）');
  }

  const prePush = path.join(ROOT, '.husky/scripts/pre-push.sh');
  if (!existsSync(prePush)) {
    failures.push('結線先が実在しない: .husky/scripts/pre-push.sh');
  } else {
    const text = readFileSync(prePush, 'utf-8');
    for (const command of wiredCommands) {
      if (!hasExecutionLine(text, command)) {
        failures.push(
          `.husky/scripts/pre-push.sh に \`${command}\` の実行行が無い（echo の言及・注釈・部分一致は数えない）`
        );
      }
    }
  }

  const workflow = path.join(ROOT, '.github/workflows/ci.yml');
  if (!existsSync(workflow)) {
    failures.push('結線先が実在しない: .github/workflows/ci.yml');
  } else {
    const yaml = readFileSync(workflow, 'utf-8');

    // (a) jobs に検査のジョブが在ること / (b) その run に実行の行が在ること
    const job = sliceYamlJobBlock(yaml, CI_JOB_ID);
    if (job === '') {
      failures.push(`.github/workflows/ci.yml の jobs に ${CI_JOB_ID} のジョブが無い`);
    } else {
      for (const command of wiredCommands) {
        if (!hasExecutionLine(job, command)) {
          failures.push(
            `.github/workflows/ci.yml の ${CI_JOB_ID} ジョブに \`${command}\` の実行行が無い`
          );
        }
      }
    }

    // (c) ci-success の needs に含まれること / (d) 失敗判定の条件部に現れること
    const gate = sliceYamlJobBlock(yaml, 'ci-success');
    if (gate === '') {
      failures.push('.github/workflows/ci.yml に ci-success のジョブが無い');
    } else {
      if (!parseNeedsList(gate).includes(CI_JOB_ID)) {
        failures.push(`ci-success の needs に ${CI_JOB_ID} が含まれていない`);
      }
      const conditions = failureConditionLines(gate);
      if (conditions.length === 0) {
        failures.push('ci-success の失敗判定の条件部を一行も取り出せない');
      } else if (!conditions.some((line) => line.includes(`needs.${CI_JOB_ID}.result`))) {
        failures.push(
          `ci-success の失敗判定の条件部に needs.${CI_JOB_ID}.result が無い（echo 行は条件部に数えない）`
        );
      }
    }
  }

  const manifest = path.join(ROOT, 'package.json');
  if (!existsSync(manifest)) {
    failures.push('結線先が実在しない: package.json');
  } else {
    const text = readFileSync(manifest, 'utf-8');
    const requiredScriptKeys = ['"check:dead-script-env"', '"check:dead-script-env:selftest"'];
    // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (requiredScriptKeys.length === 0) {
      failures.push('素材 requiredScriptKeys が空です（この確認が空振りしています）');
    }
    for (const key of requiredScriptKeys) {
      if (!text.includes(key)) {
        failures.push(`package.json に ${key} のスクリプト定義が無い`);
      }
    }
  }

  return failures;
}

function checkStripCommentsKeepsCode(): string[] {
  const failures: string[] = [];
  const cases: ReadonlyArray<{ label: string; source: string; keep: string }> = [
    { label: '文字列の中の //', source: "const a = 'x//y'; const b = 1;", keep: 'const b = 1;' },
    { label: '文字列の中の /*', source: "const a = 'x/*y'; const b = 1;", keep: 'const b = 1;' },
    {
      label: 'テンプレートの中の //',
      source: 'const a = `x//y`; const b = 1;',
      keep: 'const b = 1;',
    },
    {
      label: '正規表現の中の //',
      source: 'const a = /\\/\\//; const b = 1;',
      keep: 'const b = 1;',
    },
    {
      label: '除算のあとの //',
      source: 'const a = 1 / 2; // 註\nconst b = 1;',
      keep: 'const b = 1;',
    },
    {
      label: 'アロー関数の直後の正規表現',
      source: 'const f = () => /\\/\\//.test(s); const b = 1;',
      keep: 'const b = 1;',
    },
    {
      label: 'JSX の閉じ札',
      source: 'const el = <p>ok</p>; const b = 1;',
      keep: 'const b = 1;',
    },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (cases.length === 0) {
    failures.push('合成素材 cases が空です（この確認が空振りしています）');
  }
  for (const testCase of cases) {
    if (!stripComments(testCase.source).includes(testCase.keep)) {
      failures.push(`${testCase.label}: 注釈の除去が正当なコードまで落としている`);
    }
  }
  // 注釈は確かに落ちていること（除去そのものが働いていない自明合格を防ぐ）
  if (stripComments('// process.env.X\nconst b = 1;').includes('process.env.X')) {
    failures.push('行注釈が落ちていない');
  }
  if (stripComments('/* process.env.X */\nconst b = 1;').includes('process.env.X')) {
    failures.push('ブロック注釈が落ちていない');
  }
  // 地の文の引用符と JSX の閉じ札がある行でも注釈は落ちること（115.244 のレビューの実測）
  if (stripComments("const el = <p>don't</p>; // process.env.X\n").includes('process.env.X')) {
    failures.push('地の文の引用符・JSX の閉じ札がある行の注釈が落ちていない');
  }
  return failures;
}

function checkPreconditionsAreWired(): string[] {
  // 前提の確認（reportPreconditions）が main から、対照より先に、結果に効く形で呼ばれること
  const failures: string[] = [];
  const source = readSelfSource();
  const mainBody = sliceFunctionBody(source, '\nfunction main(');
  if (mainBody === '') {
    return ['本ファイルの main を切り出せない'];
  }
  const preconditionAt = mainBody.indexOf('reportPreconditions(');
  if (preconditionAt === -1) {
    failures.push('main が reportPreconditions を呼んでいない');
    return failures;
  }
  const groupsAt = mainBody.indexOf('for (const group of GROUPS)');
  if (groupsAt === -1) {
    failures.push('main が GROUPS を回していない');
  } else if (preconditionAt > groupsAt) {
    failures.push('前提の確認が対照より後ろで走っている');
  }
  if (!/const preconditions = reportPreconditions\(\);/.test(mainBody)) {
    failures.push('reportPreconditions の返り値を受け取っていない（結果に効かない）');
  }
  if (!/preconditions\.failed/.test(mainBody) || !/preconditions\.ran/.test(mainBody)) {
    failures.push('前提の実績（failed / ran）が総数と合否に効いていない');
  }
  return failures;
}

function checkStructuralWiring(): string[] {
  // 下限: 本ファイルが宣言する `function check*` を一つ残らず STRUCTURAL へ結線していること
  const failures: string[] = [];
  const source = readSelfSource();
  const declared = [...source.matchAll(/^function (check[A-Za-z0-9_]*)\(/gm)].map(
    (match) => match[1] as string
  );
  if (declared.length === 0) {
    failures.push(
      '本ファイルに check で始まる検査関数の宣言が一つも無い（下限を導く語彙が消えた）'
    );
    return failures;
  }
  const wired = new Set(STRUCTURAL.map((entry) => entry.custom.name));
  for (const name of declared) {
    if (!wired.has(name)) {
      failures.push(`宣言されている ${name} が STRUCTURAL へ結線されていない`);
    }
  }
  for (const name of wired) {
    if (!declared.includes(name)) {
      failures.push(`STRUCTURAL が宣言の無い検査 ${name} を指している`);
    }
  }
  return failures;
}

/** `function 名(` から始まる本体を波括弧の対応で切り出す */
function sliceFunctionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) return '';
  const open = source.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return '';
}

const STRUCTURAL: readonly Case[] = [
  { name: '検査本体が実在する', custom: checkEntryExists },
  { name: '3 つの package.json を走査対象として宣言している', custom: checkManifestsAreDeclared },
  {
    name: '走査根と除外が export されている（自己検査から到達できる）',
    custom: checkScanRootsAreExported,
  },
  { name: 'リポジトリ本体を実際に走査でき、合格している', custom: checkRealRepositoryIsScanned },
  {
    name: '文書・定義元・依存物は読み手に数えない',
    custom: checkDocumentsAndManifestsAreNotReaders,
  },
  { name: '母集団が空なら合格にしない', custom: checkEmptyPopulationIsNotSuccess },
  { name: '定義元が欠けていたら合格にしない', custom: checkMissingManifestIsNotSuccess },
  { name: '走査から報告までが実際に働く（陽性・陰性の両方向）', custom: checkEndToEndDetection },
  { name: '本体が失敗既定を持ち、成功経路だけが解除する', custom: checkFailureDefaultIsPresent },
  { name: '本体の入口が結線されている（失敗既定より後ろにある）', custom: checkEntryIsWired },
  {
    name: '本体をサブプロセスで起動でき、報告が実測と一致する',
    custom: checkSubprocessRunSucceeds,
  },
  { name: '押下前の関門と CI と npm スクリプトへ結線されている', custom: checkWiredIntoGates },
  { name: '注釈の除去が正当なコードを落とさない', custom: checkStripCommentsKeepsCode },
  { name: '前提の確認が入口へ結線されている', custom: checkPreconditionsAreWired },
  { name: '宣言された検査が一つ残らず結線されている', custom: checkStructuralWiring },
];

/** 実行される対照の一覧。ここから外れたレジストリは走らない */
const GROUPS: ReadonlyArray<{ title: string; cases: readonly Case[] }> = [
  {
    title: '判定器の対照（陽性・陰性）',
    cases: [{ name: '陽性対照と陰性対照が期待どおりに判定される', custom: detectionFailures }],
  },
  {
    title: '結線の判定器の対照（実行と言及の区別）',
    cases: [
      {
        name: '実行の行だけを結線と数える（echo・注釈・部分一致は数えない）',
        custom: wiringSampleFailures,
      },
      {
        name: 'CI の結線を構造で見る（ジョブ・実行行・needs・条件部）',
        custom: ciStructureSampleFailures,
      },
    ],
  },
  { title: '走査対象と前提条件', cases: STRUCTURAL },
];

// ============================================================================
// 前提の確認（守り手。レジストリには載せない）
// ============================================================================

/** 対照のレジストリが空でないこと */
function emptyRegistryFailures(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('陽性対照 MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('陰性対照 MUST_NOT_DETECT が空である');
  if (STRUCTURAL.length === 0) failures.push('構造の対照 STRUCTURAL が空である');
  if (WIRING_SAMPLES.length === 0) failures.push('結線の対照 WIRING_SAMPLES が空である');
  if (CI_STRUCTURE_SAMPLES.length === 0) {
    failures.push('CI の結線の対照 CI_STRUCTURE_SAMPLES が空である');
  }
  if (!WIRING_SAMPLES.some((sample) => sample.expected)) {
    failures.push('結線の対照に陽性が一件も無い');
  }
  if (!WIRING_SAMPLES.some((sample) => !sample.expected)) {
    failures.push('結線の対照に陰性が一件も無い');
  }
  if (!CI_STRUCTURE_SAMPLES.some((sample) => sample.expected)) {
    failures.push('CI の結線の対照に陽性が一件も無い');
  }
  if (!CI_STRUCTURE_SAMPLES.some((sample) => !sample.expected)) {
    failures.push('CI の結線の対照に陰性が一件も無い');
  }
  if (GROUPS.length === 0) failures.push('実行される対照の一覧 GROUPS が空である');
  const registered = GROUPS.flatMap((group) => group.cases);
  if (registered.length === 0) failures.push('GROUPS に登録された対照が一件も無い');
  if (!GROUPS.some((group) => group.cases === STRUCTURAL)) {
    failures.push('GROUPS が STRUCTURAL を含んでいない');
  }
  return failures;
}

/** 判定器の対照が GROUPS の経路で実際に走ること */
function detectionRegistryWiringFailures(): string[] {
  const failures: string[] = [];
  const registered = GROUPS.flatMap((group) => group.cases).map((entry) => entry.custom.name);
  const drivers = ['detectionFailures', 'wiringSampleFailures', 'ciStructureSampleFailures'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (drivers.length === 0) {
    failures.push('素材 drivers が空です（この確認が空振りしています）');
  }
  for (const driver of drivers) {
    if (!registered.includes(driver)) {
      failures.push(`対照を回す ${driver} が GROUPS へ結線されていない`);
    }
  }
  return failures;
}

/** 前提を直列に走らせる。`main` の冒頭で対照より先に呼ぶ */
function reportPreconditions(): { ran: number; failed: number } {
  let ran = 0;
  let failed = 0;

  const emitted = emptyRegistryFailures();
  ran += 1;
  failed += report('対照レジストリが空でない', emitted);

  const wired = detectionRegistryWiringFailures();
  ran += 1;
  failed += report('判定器の対照が実行経路へ結線されている', wired);

  return { ran, failed };
}

function report(name: string, failures: readonly string[]): number {
  if (failures.length === 0) {
    console.log(`  ✅ ${name}`);
    return 0;
  }
  console.log(`  ❌ ${name}`);
  for (const failure of failures) console.log(`     - ${failure}`);
  return 1;
}

/**
 * 報告する確認の総数の下限（タスク 115.252）
 *
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-dead-script-env.selftest.ts | tail -1` の出す値をそのまま置く。
 *
 * **数は空にできない。** 本ファイルの対照はすべて配列リテラルで書かれているため、配列を
 * `[]` へ空化する変異作用素に対して、母集団の側に置いた関門はいくらでも同型に増える。数値の
 * 下限だけはこの作用素に構造的に免疫であり、**報告件数が縮む向きの変異を一律に赤くする**。
 * `reportPreconditions()` が課す群ごとの非空・極性の要求と重ねて掛ける。
 *
 * **限界**: 削った分だけ別の群へ確認を足せば総数は動かない。件数を構造から導く語彙は本体側に
 * 無く、根拠の無い余裕を貼らないという 115.222 の判断を引き継いでいる。
 */
const MINIMUM_TOTAL_CASES = 20;

function main(): void {
  console.log(
    '🔍 死んだ環境変数の検査 判定器 自己検査 (scripts/check-dead-script-env.selftest.ts)'
  );

  console.log('');
  console.log('■ 前提（対照そのものが空でないこと）');
  const preconditions = reportPreconditions();

  let ran = preconditions.ran;
  let failed = preconditions.failed;

  for (const group of GROUPS) {
    console.log('');
    console.log(`■ ${group.title}`);
    for (const testCase of group.cases) {
      ran += 1;
      failed += report(testCase.name, testCase.custom());
    }
  }

  console.log('');
  // **実行ループの外・実行後に置く数値下限（タスク 115.252）。**
  // 母集団の側ではなく、**実際に報告した件数** `ran` を数えて課す。群を空にする変異だけで
  // なく、ループが要素を飛ばす向きの変異も同じ一本で赤くなる。
  if (ran < MINIMUM_TOTAL_CASES) {
    console.log(
      `❌ 報告した確認は ${ran} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
    process.exit(1);
  }
  // 対照の現況を一行で印字する（タスク 115.252）。関門の判定に使うのと同じ変数から出す。
  // `npx tsx scripts/list-control-polarity-floors.ts` はこの行を読み、下限を貼り直すときの
  // 元の値にする。一覧の側で数え直さないのは、判定と一覧が別々の真実を持たないためである。
  // 本自己検査群が閉じている範囲と閉じていない範囲（三層の記録）は
  // `scripts/check-counterfactual-evidence.selftest.ts` の
  // 「本自己検査群が閉じている範囲と、閉じていない範囲」の節に正典を置く（タスク 115.252）。
  console.log(`📋 対照の現況: 総数 ${ran}/${MINIMUM_TOTAL_CASES}（現況/宣言の下限）`);

  if (failed > 0) {
    console.log(`❌ ${failed}/${ran} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`✅ ${ran}/${ran} 件の確認に成功しました`);
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

// ============================================================================
// 実行した変異と、その実測（タスク 115.244。基準点はコミット 30344f60、2026-09-02）
// ============================================================================
//
// 反実仮想は書く前に必ず当てて測る（steering の development-discipline）。以下はすべて
// 実行した結果であり、置換の一致件数を 1 件と assert してから走らせている（置換が註にも
// 一致して変異が適用されないまま EXIT=0 を得る事故を避けるため。115.242 の完了検証で
// 実際に起きた。本タスクでも変異 10 で一度これに当たり、assert が止めた）。復元は事前に
// 取った複製からの `cp` で行い、`git hash-object` の一致を確認している。
// 件数はすべて**差し戻し 1 回目の是正を入れた後**（総数 20 件）の再実測である。
//
// **対照レジストリを空にする変異（母集団が空の検査は何も主張していない。第3原則）**
//   1. `MUST_DETECT` を空にする           → EXIT=1 / 1 件失敗（20 件中）。
//      内訳は「対照レジストリが空でない — 陽性対照 MUST_DETECT が空である」。
//   2. `MUST_NOT_DETECT` を空にする       → EXIT=1 / 1 件失敗（20 件中）。
//   3. `STRUCTURAL` を空にする            → EXIT=1 / 1 件失敗（総数は 5 件へ縮む）。
//   4. `GROUPS` を空にする                → EXIT=1 / 2 件失敗（総数は 2 件へ縮む）。
//      内訳は「GROUPS が空」「登録された対照が一件も無い」「GROUPS が STRUCTURAL を含んで
//      いない」と、三つの駆動関数が GROUPS へ結線されていないこと。
//  16. `WIRING_SAMPLES` を空にする        → EXIT=1 / 1 件失敗（20 件中）。
//      内訳は「結線の対照 WIRING_SAMPLES が空である／陽性が一件も無い／陰性が一件も無い」。
//  17. `CI_STRUCTURE_SAMPLES` を空にする  → EXIT=1 / 1 件失敗（20 件中）。同じ形。
//   いずれも**総数の不一致ではなく前提そのものの崩壊**として落ちている。
//
// **失敗既定の変異（115.242 が残した「入口を消すと EXIT=0」の穴を持ち込んでいないこと）**
//   5. 本体 `check-dead-script-env.ts` の入口の `main();` を註へ落とす
//      → 出力 0 行・**EXIT=1**（115.242 の同じ変異は EXIT=0 だった）。
//   6. 本ファイルの末尾の `main();` を註へ落とす → 出力 0 行・**EXIT=1**。
//
// **判定器の欠陥を復元する変異（起票の (1)(2)(3) を一つずつ戻す）**
//   7. `normalizeForReadScan` の `stripComments(text)` を `text` へ戻す（欠陥(2)）
//      → EXIT=1 / 2 件失敗。陽性対照 2 件（行注釈だけ・ブロック注釈だけ）の見逃しと、
//      端から端までの走査で「注釈だけの言及を読み手と誤判定している」。
//   8. `isReadSomewhere` の `if (destructured.has(name)) return true;` を殺す（欠陥(3)）
//      → EXIT=1 / 2 件失敗。陰性対照 4 件（素・別名・既定値つき・型註つき）の過検出と、
//      端から端までの走査での過検出。
//   9. `PACKAGE_MANIFESTS` を `['backend/package.json']` だけへ戻す（欠陥(1)）
//      → EXIT=1 / 5 件失敗。内訳の筆頭は「走査対象に package.json が含まれていない
//      （適用範囲の後退）」で、次に「実リポジトリで環境変数を設定するスクリプトが 0 件
//      （母集団が空）」——**是正前の適用範囲では母集団が空だった**ことの実測である。
//  10. `stripHashCommentLines` の行頭 `#` の判定を恒等写像へ戻す
//      → EXIT=1 / 1 件失敗。陽性対照 2 件（YAML・シェルの行頭注釈）の見逃し。
//
// **結線の守り手を「言及」で満たせないこと（差し戻し 1 回目の finding 1・2 の是正）**
// 是正前の `checkWiredIntoGates` は `text.includes(needle)` だったため、次の 3 変異は
// いずれも 18/18 緑・EXIT=0 で素通りした（レビュアーの実測）。是正後の再実測:
//  11. `.husky/scripts/pre-push.sh` から実行の 2 行（`npm run check:dead-script-env:selftest`
//      と `npm run check:dead-script-env`）を削除し、`echo "詳細確認: …"` の言及 2 行だけを
//      残す → EXIT=1 / 1 件失敗。内訳は「pre-push.sh に `…:selftest` の実行行が無い」
//      「pre-push.sh に `…` の実行行が無い」の 2 件。
//  12. `.github/workflows/ci.yml` の実行の行 `npm run check:dead-script-env`（L458）だけを
//      削除し、`…:selftest` の行（L446）を残す → EXIT=1 / 1 件失敗。内訳は
//      「dead-script-env ジョブに `npm run check:dead-script-env` の実行行が無い」。
//      **部分一致で素通りしていた形が塞がっている。**
//  13. `ci-success` の `needs` から `dead-script-env` を外し、失敗判定の条件 1 行を削除する
//      （`echo "   - Dead Script Env: …"` の表示行は残す） → EXIT=1 / 1 件失敗。内訳は
//      「needs に dead-script-env が含まれていない」「失敗判定の条件部に
//      needs.dead-script-env.result が無い（echo 行は条件部に数えない）」の 2 件。
//      **echo の行が残っていても条件部としては数えない**ことの実測である。
//  14. `hasExecutionLine` を是正前の `text.includes(command)` へ戻す
//      → EXIT=1 / 2 件失敗。陰性 5 件（echo の言及・行頭注釈・`:selftest` への部分一致・
//      `:verbose` への部分一致・行途中の連結）と、CI 側の陰性 1 件（実行の行だけ消えている）。
//  15. `failureConditionLines` から `!line.startsWith('echo')` を外す
//      → EXIT=1 / 1 件失敗。陰性「echo の行が条件の綴りを持っていても条件部に数えない」。
//
// **注釈の除去の見逃しを復元する変異（差し戻し 1 回目の finding 3 の是正）**
//  18. `closesOnSameLine` を常に true にする（＝同一行で閉じる要求を撤去）
//      → EXIT=1 / 2 件失敗。陽性「地の文の引用符（JSX の don't）が同じ行の注釈を覆い隠さない」
//      と「地の文の引用符・JSX の閉じ札がある行の注釈が落ちていない」。
//  19. `regexCanStart` の前置集合へ `<` と `>` を戻す
//      → EXIT=1 / 2 件失敗（同じ 2 件）。JSX の閉じ札 `</p>` の `/` を正規表現の開始と誤ると、
//      同じ行の `//` 注釈の最初の `/` までを飲み込んで注釈が生き残る。
//
// **限界（塞いでいないこと）**: `MUST_DETECT` / `MUST_NOT_DETECT` / `WIRING_SAMPLES` /
// `CI_STRUCTURE_SAMPLES` を 1 件へ削る変異は止まらない。下限を導ける語彙が本体側に無い
// ためで、根拠の無い件数を貼らないという 115.222 の判断を引き継いでいる。ただし
// `WIRING_SAMPLES` と `CI_STRUCTURE_SAMPLES` については**陽性・陰性が片方でも消えたら
// 赤くする**下限を置いた（`emptyRegistryFailures` の `some(...expected)` の 2 本）。

main();
