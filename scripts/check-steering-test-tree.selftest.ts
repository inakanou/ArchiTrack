/**
 * @fileoverview steering のテスト区分検査 検出規則の自己検査
 *
 * `scripts/check-steering-test-tree.ts` の検出規則が
 *   (1) **緩める向き**——実在する区分を挙げ落としている状態や、陳腐化した件数を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——正しく網羅している列挙、代表例として印を付けていない列挙、
 *       規約そのものを説明するフェンス内の例を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の各例は**是正前に steering に実在していた実物**である（タスク 115.200）。
 * 検出器が壊れていれば本検査（0 件）は自明に通ってしまうため、既知の該当を捕まえられることを
 * 先に固定する（陽性対照）。
 *
 * 見本が実データの形を写しているかは目視に頼らない。`checkSampleFormsCoverRealData` が
 * `.kiro/steering/*.md` の網羅宣言の中の**全行**から実データが実現している項目の形を数え上げ、
 * その一つ一つが見本にも現れることを求める（115.197 の教訓: 受入条件は「実データが実現する
 * 同値類のうち見本を欠くものが零である」という有限集合上の全称命題として書く）。
 *
 * 実体の数え直しは**本体の関数を呼ばずに独立実装で行う**（115.199 の教訓: 報告値の正直さを
 * 見る検査が本体の集計を呼ぶと、その関数の誤りは両側で相殺されて検出できない）。
 * `checkRealDirectoriesAgreeWithIndependentScan` は `find` を起動して別経路で数え、
 * `realTestDirectories` の結果と突き合わせる。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-test-tree.selftest.ts
 *   npm run check:steering-test-tree:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  BLOCK_CLOSE_PATTERN,
  BLOCK_OPEN_PATTERN,
  containsTestFile,
  decideExit,
  EXCLUDED_DIRECTORIES,
  extractDirEntry,
  findBlockCountAnnotation,
  findCountAnnotation,
  isFenceLine,
  isSyncNoteLine,
  parseBlocks,
  realTestDirectories,
  REQUIRED_ROOTS,
  run,
  STEERING_DIR,
  TEST_FILE_PATTERN,
  type CountKind,
  type Finding,
  type FindingKind,
  type RunResult,
} from './check-steering-test-tree.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。前提が満たせないときに合格にしないための存在確認に使う */
const ENTRY_PATH = path.join(SCRIPTS_DIR, 'check-steering-test-tree.ts');

// ============================================================================
// 一時ワークツリーの組み立て（本体の走査を実データから切り離して回すため）
// ============================================================================

interface FixtureSpec {
  /** リポジトリ相対の作成するテストファイル（親ディレクトリは自動生成） */
  files: string[];
  /** steering 文書の中身（`.kiro/steering/structure.md` として書き出す） */
  steering: string;
}

function buildFixture(spec: FixtureSpec): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-test-tree-'));
  for (const relative of spec.files) {
    const absolute = path.join(tempRoot, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'export {};\n');
  }
  const steeringDir = path.join(tempRoot, STEERING_DIR);
  fs.mkdirSync(steeringDir, { recursive: true });
  fs.writeFileSync(path.join(steeringDir, 'structure.md'), spec.steering);
  return tempRoot;
}

function removeFixture(tempRoot: string): void {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

/**
 * 仮のワークツリーに対して本体を走らせ、出た指摘の種別を返す。
 * `requiredRoots` を明示して渡すのは、実リポジトリの根の宣言欠落が混ざらないようにするため。
 */
function kindsFor(spec: FixtureSpec, requiredRoots: readonly string[] = []): FindingKind[] {
  const tempRoot = buildFixture(spec);
  try {
    const result = run({ root: tempRoot, requiredRoots });
    return result.findings.map((finding) => finding.kind);
  } finally {
    removeFixture(tempRoot);
  }
}

function findingsFor(spec: FixtureSpec, requiredRoots: readonly string[] = []): Finding[] {
  const tempRoot = buildFixture(spec);
  try {
    return run({ root: tempRoot, requiredRoots }).findings;
  } finally {
    removeFixture(tempRoot);
  }
}

/** 実データが持つ形を写した仮の木。区分は alpha / beta / gamma の三つ */
const THREE_DIRECTORIES: string[] = [
  'pkg/__tests__/alpha/one.test.ts',
  'pkg/__tests__/beta/two.test.ts',
  'pkg/__tests__/gamma/three.spec.ts',
];

function blockDocument(root: string, entries: string[], extra: string[] = []): string {
  return [
    '# 構造',
    '',
    ...extra,
    `<!-- steering:test-dirs ${root} -->`,
    ...entries,
    '<!-- /steering:test-dirs -->',
    '',
  ].join('\n');
}

// ============================================================================
// 陽性対照: 是正前の実物を捕まえること
// ============================================================================

interface Case {
  name: string;
  /** true なら「検出されなければならない」 */
  expected: boolean;
  /** 期待する指摘の種別（expected が true のときのみ見る） */
  kind?: FindingKind;
  /** 仮のワークツリーの内容 */
  spec?: FixtureSpec;
  /** 独自の検証 */
  custom?: () => string[];
}

/**
 * 是正前の実データが持っていた件数の書き方。三つの同値類それぞれの**実物**である。
 * `text` は実データの綴りそのままで、`kind` はその形がどの規則で捕まるかを固定する。
 * 種別まで固定するのは、規則を一つ落としたときに「別の規則がたまたま拾って緑のまま」に
 * ならないようにするためである（115.168: 上限を足すと既存の見本が無言で影になる）。
 */
const REAL_COUNT_SAMPLES: Array<{ line: string; kind: CountKind; origin: string }> = [
  {
    line: '  - `unit/services/` - サービステスト（324テスト）',
    kind: 'test-count',
    origin: '.kiro/steering/tech.md L329（実測 2361）',
  },
  {
    line: '    - `rateLimit.test.ts` - レート制限ミドルウェア（3テスト）',
    kind: 'test-count',
    origin: '.kiro/steering/tech.md L324（実測 66）',
  },
  {
    line: '- 合計: 339テストファイル（包括的なユニットテスト群）',
    kind: 'test-count',
    origin: '.kiro/steering/tech.md L408（実測 527）',
  },
  {
    line: '- Backend: 単体テスト167ファイル + 統合テスト31ファイル',
    kind: 'test-file-count',
    origin: '.kiro/steering/structure.md L1614（実測 186 / 45）',
  },
  {
    line: '│   ├── site-surveys/     # 現場調査テスト（12ファイル）',
    kind: 'parenthesized-file-count',
    origin: '.kiro/steering/structure.md L312（実測 31）',
  },
];

/** 件数として告発してはならない書き方（過検出の対照） */
const NON_COUNT_SAMPLES: Array<{ line: string; why: string }> = [
  {
    line: '│   │       ├── tools/               # 注釈ツール（11ファイル）',
    why: 'テストの数ではない',
  },
  { line: '- `utils/` - ユーティリティ関数（22ファイル）', why: 'テストの数ではない' },
  { line: '- **Branches: 80.00% ✅達成**（2025-11-11）', why: 'カバレッジ率であって件数ではない' },
  { line: '  - `unit/services/` - サービス層のテスト', why: '件数を書いていない正しい形' },
  {
    line: '- **統合テスト**: Backend `src/__tests__/integration/`（API統合、データベース）',
    why: '経路であって件数ではない',
  },
];

function checkRealCountSamplesAreDetected(): string[] {
  const failures: string[] = [];
  for (const sample of REAL_COUNT_SAMPLES) {
    const annotation = findCountAnnotation(sample.line);
    if (annotation === null) {
      failures.push(`検出されない: ${sample.origin} / ${sample.line.trim()}`);
      continue;
    }
    if (annotation.kind !== sample.kind) {
      failures.push(
        `規則の対応が違う: ${sample.origin} は ${sample.kind} で捕まえるべきだが ` +
          `${annotation.kind} が拾った（規則を落としても別の規則が肩代わりして緑になる）`
      );
    }
  }
  const kinds = new Set(REAL_COUNT_SAMPLES.map((sample) => sample.kind));
  const allKinds: CountKind[] = ['test-count', 'test-file-count', 'parenthesized-file-count'];
  for (const kind of allKinds) {
    if (!kinds.has(kind)) failures.push(`陽性対照に ${kind} の実物が無い`);
  }
  return failures;
}

function checkNonCountSamplesAreNotDetected(): string[] {
  const failures: string[] = [];
  for (const sample of NON_COUNT_SAMPLES) {
    const annotation = findCountAnnotation(sample.line);
    if (annotation !== null) {
      failures.push(
        `告発してはならない（${sample.why}）: ${sample.line.trim()} → ${annotation.text}`
      );
    }
  }
  return failures;
}

// ============================================================================
// 項目の形（実データが実現する形を見本が写しているか）
// ============================================================================

/** 見本が写す項目の形。実データの網羅宣言が実現している形はここに現れなければならない */
type EntryForm = 'quoted-single' | 'quoted-rooted' | 'not-an-entry' | 'malformed';

/** 本体とは独立に、行の形を分類する（本体の `extractDirEntry` を呼ばない） */
function classifyEntryFormIndependently(raw: string, rootBasename: string): EntryForm {
  const trimmed = raw.trim();
  const listItem = /^[-*+]\s+`([^`]+)`/.exec(trimmed);
  if (listItem === null) return 'not-an-entry';
  const token = listItem[1] ?? '';
  if (!token.endsWith('/')) return 'not-an-entry';
  const parts = token.slice(0, -1).split('/');
  if (parts.length === 1 && parts[0] !== '') return 'quoted-single';
  if (parts.length === 2 && parts[0] === rootBasename && parts[1] !== '') return 'quoted-rooted';
  return 'malformed';
}

/** 見本の側で実現している形（下の ENTRY_SAMPLES から作る） */
const ENTRY_SAMPLES: Array<{ line: string; rootBasename: string; form: EntryForm }> = [
  { line: '- `alpha/` - 説明', rootBasename: '__tests__', form: 'quoted-single' },
  { line: '- `unit/config/` - 設定テスト', rootBasename: 'unit', form: 'quoted-rooted' },
  { line: '- `a/b/c/` - 深すぎる経路', rootBasename: '__tests__', form: 'malformed' },
  {
    line: '- `client.test.ts` - ファイルは区分ではない',
    rootBasename: '__tests__',
    form: 'not-an-entry',
  },
  { line: '**代表例**（網羅ではない）:', rootBasename: '__tests__', form: 'not-an-entry' },
  { line: '`alpha/` を箇条書きでなく書いた行', rootBasename: '__tests__', form: 'not-an-entry' },
];

function checkEntrySamplesMatchImplementation(): string[] {
  const failures: string[] = [];
  for (const sample of ENTRY_SAMPLES) {
    const entry = extractDirEntry(sample.line, sample.rootBasename);
    const actual: 'not-an-entry' | 'malformed' | 'quoted' =
      entry === null ? 'not-an-entry' : entry.name === null ? 'malformed' : 'quoted';
    const expected: 'not-an-entry' | 'malformed' | 'quoted' =
      sample.form === 'quoted-single' || sample.form === 'quoted-rooted' ? 'quoted' : sample.form;
    if (actual !== expected) {
      failures.push(
        `見本の分類が本体と食い違う: ${sample.line} → 期待 ${expected} / 実際 ${actual}`
      );
    }
    const independent = classifyEntryFormIndependently(sample.line, sample.rootBasename);
    if (independent !== sample.form) {
      failures.push(`見本の宣言した形が独立分類と食い違う: ${sample.line} → ${independent}`);
    }
  }
  return failures;
}

/**
 * 実データの網羅宣言の中の全行を独立分類し、実現している形が見本にも在ることを求める。
 * 「無言の変異が存在しない」ではなく「実データが実現する類のうち見本を欠くものが零である」
 * という有限集合上の全称命題である（115.197）。
 */
function checkSampleFormsCoverRealData(): string[] {
  const failures: string[] = [];
  const sampleForms = new Set(ENTRY_SAMPLES.map((sample) => sample.form));
  const realized = new Map<EntryForm, string>();
  let blockLines = 0;

  for (const relative of listSteeringDocuments()) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf-8');
    for (const block of parseBlocks(relative, source).blocks) {
      const rootBasename = path.basename(block.root);
      for (const { raw } of block.lines) {
        blockLines += 1;
        const form = classifyEntryFormIndependently(raw, rootBasename);
        if (!realized.has(form)) realized.set(form, `${relative}: ${raw.trim()}`);
      }
    }
  }

  if (blockLines === 0) {
    failures.push('実データの網羅宣言の中に一行も無い（走査が空振りしている）');
    return failures;
  }
  for (const [form, example] of realized) {
    if (sampleForms.has(form)) continue;
    failures.push(`実データが実現している形 ${form} の見本が無い（例: ${example}）`);
  }
  return failures;
}

function listSteeringDocuments(): string[] {
  const absolute = path.join(ROOT, STEERING_DIR);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${STEERING_DIR}/${entry.name}`)
    .sort();
}

// ============================================================================
// 実体の数え直し（本体と別実装）
// ============================================================================

/**
 * `find` を起動して、根の直下でテストファイルを含むディレクトリを別経路で数える。
 * 本体の `realTestDirectories` を呼ばずに数えることで、本体の走査が誤っていても
 * 両側で相殺されないようにする（115.199 の差し戻しが示した同語反復を避ける）。
 */
function independentTestDirectories(relativeRoot: string): string[] | null {
  const absolute = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absolute)) return null;
  const excluded = [...EXCLUDED_DIRECTORIES].flatMap((name) => ['-name', name, '-o']);
  const result = spawnSync(
    'find',
    [
      absolute,
      '(',
      ...excluded.slice(0, -1),
      ')',
      '-prune',
      '-o',
      '-type',
      'f',
      '(',
      '-name',
      '*.test.ts',
      '-o',
      '-name',
      '*.test.tsx',
      '-o',
      '-name',
      '*.spec.ts',
      '-o',
      '-name',
      '*.spec.tsx',
      '-o',
      '-name',
      '*.test.js',
      '-o',
      '-name',
      '*.test.jsx',
      '-o',
      '-name',
      '*.spec.js',
      '-o',
      '-name',
      '*.spec.jsx',
      ')',
      '-print',
    ],
    { encoding: 'utf-8' }
  );
  if (result.status !== 0) return null;
  const names = new Set<string>();
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue;
    const relative = path.relative(absolute, line);
    const segments = relative.split(path.sep);
    if (segments.length < 2) continue;
    const head = segments[0];
    if (head === undefined) continue;
    names.add(head);
  }
  return [...names].sort();
}

function checkRealDirectoriesAgreeWithIndependentScan(): string[] {
  const failures: string[] = [];
  for (const relativeRoot of REQUIRED_ROOTS) {
    const byBody = realTestDirectories(path.join(ROOT, relativeRoot));
    const byIndependent = independentTestDirectories(relativeRoot);
    if (byIndependent === null) {
      failures.push(`独立走査が動かない: ${relativeRoot}（確認できないため合格にしない）`);
      continue;
    }
    if (byBody.length === 0) {
      failures.push(`本体の走査が ${relativeRoot} で0件を返した（空振りの疑い）`);
    }
    if (byBody.join(',') !== byIndependent.join(',')) {
      failures.push(
        `${relativeRoot}: 本体「${byBody.join(' ')}」／独立走査「${byIndependent.join(' ')}」`
      );
    }
  }
  return failures;
}

// ============================================================================
// 走査対象と前提条件
// ============================================================================

function checkEntryExists(): string[] {
  return fs.existsSync(ENTRY_PATH) ? [] : [`検査本体が見つからない: ${ENTRY_PATH}`];
}

function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const result = run();
  if (result.scannedFiles.length === 0)
    failures.push('リポジトリ本体の steering を列挙できていない');
  if (result.blocks < REQUIRED_ROOTS.length) {
    failures.push(
      `網羅宣言が ${result.blocks} 件しかない（必須の根は ${REQUIRED_ROOTS.length} 件）`
    );
  }
  if (result.claims === 0) failures.push('実体と照合したディレクトリが0件（走査の空振り）');
  if (result.scannedLines === 0) failures.push('件数の規約を照合した行が0行（走査の空振り）');
  return failures;
}

/** 走査が空振りしたときに合格を出さないこと（第3原則） */
function checkEmptyScanIsNotSuccess(): string[] {
  const failures: string[] = [];
  const cases: Array<{ name: string; result: RunResult }> = [
    {
      name: 'steering 文書が0件',
      result: {
        findings: [],
        scannedFiles: [],
        steeringDir: STEERING_DIR,
        blocks: 1,
        claims: 1,
        scannedLines: 1,
      },
    },
    {
      name: '網羅宣言が0件',
      result: {
        findings: [],
        scannedFiles: ['a.md'],
        steeringDir: STEERING_DIR,
        blocks: 0,
        claims: 0,
        scannedLines: 10,
      },
    },
    {
      name: '照合したディレクトリが0件',
      result: {
        findings: [],
        scannedFiles: ['a.md'],
        steeringDir: STEERING_DIR,
        blocks: 1,
        claims: 0,
        scannedLines: 10,
      },
    },
    {
      name: '照合した行が0行',
      result: {
        findings: [],
        scannedFiles: ['a.md'],
        steeringDir: STEERING_DIR,
        blocks: 1,
        claims: 1,
        scannedLines: 0,
      },
    },
  ];
  for (const testCase of cases) {
    if (decideExit(testCase.result).ok) {
      failures.push(`${testCase.name} なのに合格を返した`);
    }
  }
  const healthy: RunResult = {
    findings: [],
    scannedFiles: ['a.md'],
    steeringDir: STEERING_DIR,
    blocks: 1,
    claims: 3,
    scannedLines: 10,
  };
  if (!decideExit(healthy).ok) failures.push('健全な結果を不合格にしている（常時失敗の裏返し）');
  return failures;
}

/** 印を消して検査を黙らせる経路が塞がっていること */
function checkMarkerRemovalIsDetected(): string[] {
  const kinds = kindsFor(
    { files: THREE_DIRECTORIES, steering: '# 構造\n\n- `alpha/` - 印を外した列挙\n' },
    ['pkg/__tests__']
  );
  return kinds.includes('missing-declaration')
    ? []
    : [`印を消しても検出されない（種別: ${kinds.join(', ') || '無し'}）`];
}

/** 走査から報告までが実際に働くこと（仮のワークツリーで過小・過大の双方を捕まえる） */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];

  const underListed = findingsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', ['- `alpha/` - 一つ目', '- `beta/` - 二つ目']),
  });
  const underKinds = underListed.map((finding) => finding.kind);
  if (!underKinds.includes('under-listed')) {
    failures.push(`挙げ落としを検出できない（種別: ${underKinds.join(', ') || '無し'}）`);
  }
  const underSubjects = underListed.filter((f) => f.kind === 'under-listed').map((f) => f.subject);
  if (underSubjects.join(',') !== 'pkg/__tests__/gamma') {
    failures.push(`挙げ落としの対象が違う: ${underSubjects.join(',') || '無し'}`);
  }

  const overListed = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
      '- `delta/` - 撤去済み',
    ]),
  });
  if (!overListed.includes('over-listed')) {
    failures.push(`挙げすぎを検出できない（種別: ${overListed.join(', ') || '無し'}）`);
  }

  const clean = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
    ]),
  });
  if (clean.length !== 0) {
    failures.push(`過不足の無い列挙を告発している（種別: ${clean.join(', ')}）`);
  }

  const withRootPrefix = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', [
      '- `__tests__/alpha/` - 一つ目',
      '- `__tests__/beta/` - 二つ目',
      '- `__tests__/gamma/` - 三つ目',
    ]),
  });
  if (withRootPrefix.length !== 0) {
    failures.push(`根の名前を前置した形を告発している（種別: ${withRootPrefix.join(', ')}）`);
  }

  return failures;
}

/** テストを含まないディレクトリは区分に数えないこと（`__tests__/helpers/` の形） */
function checkHelperDirectoryIsNotACategory(): string[] {
  const failures: string[] = [];
  const files = [...THREE_DIRECTORIES, 'pkg/__tests__/helpers/support.ts'];
  const clean = kindsFor({
    files,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
    ]),
  });
  if (clean.length !== 0) {
    failures.push(`テストを含まないディレクトリを区分として要求している（${clean.join(', ')}）`);
  }
  const listed = kindsFor({
    files,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
      '- `helpers/` - テストを含まない補助',
    ]),
  });
  if (!listed.includes('over-listed')) {
    failures.push('テストを含まないディレクトリを挙げても告発しない');
  }
  return failures;
}

/** ビルド生成物の中のテストを「区分が在る」と数えないこと */
function checkBuildArtifactsAreIgnored(): string[] {
  const kinds = kindsFor({
    files: [...THREE_DIRECTORIES, 'pkg/__tests__/dist/generated.test.ts'],
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
    ]),
  });
  return kinds.length === 0
    ? []
    : [`生成物の中のテストを区分として数えている（${kinds.join(', ')}）`];
}

/** 網羅宣言の重複を失敗にすること（権威の複製を機構で塞ぐ） */
function checkDuplicateDeclaration(): string[] {
  const entries = ['- `alpha/` - 一つ目', '- `beta/` - 二つ目', '- `gamma/` - 三つ目'];
  const kinds = kindsFor({
    files: THREE_DIRECTORIES,
    steering:
      blockDocument('pkg/__tests__', entries) + '\n' + blockDocument('pkg/__tests__', entries),
  });
  return kinds.includes('duplicate-declaration')
    ? []
    : [`同じ根の宣言が二箇所あっても検出しない（${kinds.join(', ') || '無し'}）`];
}

/** 空の宣言・終端しない宣言・実在しない根を失敗にすること */
function checkStructuralFaults(): string[] {
  const failures: string[] = [];
  const empty = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', ['（区分を一つも書かない）']),
  });
  if (!empty.includes('empty-block')) failures.push('空の網羅宣言を検出しない');

  const unterminated = kindsFor({
    files: THREE_DIRECTORIES,
    steering: '# 構造\n\n<!-- steering:test-dirs pkg/__tests__ -->\n- `alpha/` - 一つ目\n',
  });
  if (!unterminated.includes('unterminated-block')) failures.push('終端しない宣言を検出しない');

  const stray = kindsFor({
    files: THREE_DIRECTORIES,
    steering: '# 構造\n\n<!-- /steering:test-dirs -->\n',
  });
  if (!stray.includes('stray-close')) failures.push('開始印の無い終了印を検出しない');

  const unknown = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__absent__', ['- `alpha/` - 一つ目']),
  });
  if (!unknown.includes('unknown-root')) failures.push('実在しない根を検出しない');

  const malformed = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
      '- `a/b/c/` - 深すぎる経路',
    ]),
  });
  if (!malformed.includes('malformed-entry')) failures.push('規約に合わない項目の形を検出しない');

  return failures;
}

/** フェンスの中の規約の説明を、本物の宣言として数えないこと（実データの形） */
function checkFencedExampleIsNotADeclaration(): string[] {
  const failures: string[] = [];
  const fenced = [
    '# 構造',
    '',
    '```',
    '<!-- steering:test-dirs pkg/__tests__ -->',
    '- `alpha/` - 規約の説明であって宣言ではない',
    '<!-- /steering:test-dirs -->',
    '```',
    '',
  ].join('\n');
  const kinds = kindsFor({ files: THREE_DIRECTORIES, steering: fenced }, ['pkg/__tests__']);
  if (!kinds.includes('missing-declaration')) {
    failures.push('フェンスの中の例を本物の宣言として数えている');
  }
  if (kinds.includes('under-listed')) {
    failures.push('フェンスの中の例を実体と照合してしまっている');
  }
  // 実データの structure.md が実際にこの形を持っていることを確かめる（見本の空振り防止）
  const structure = fs.readFileSync(path.join(ROOT, STEERING_DIR, 'structure.md'), 'utf-8');
  let inFence = false;
  let fencedMarkers = 0;
  for (const raw of structure.split(/\r?\n/)) {
    if (isFenceLine(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence && BLOCK_OPEN_PATTERN.test(raw.trim())) fencedMarkers += 1;
  }
  if (fencedMarkers === 0) {
    failures.push(
      '実データの structure.md にフェンス内の印が無い（この対照は実データを写していない）'
    );
  }
  return failures;
}

/** 網羅宣言の中の件数を告発すること */
function checkCountInsideBlock(): string[] {
  const kinds = kindsFor({
    files: THREE_DIRECTORIES,
    steering: blockDocument('pkg/__tests__', [
      '- `alpha/` - 一つ目（12ファイル）',
      '- `beta/` - 二つ目',
      '- `gamma/` - 三つ目',
    ]),
  });
  const failures: string[] = [];
  if (!kinds.includes('count-in-block')) failures.push('網羅宣言の中の件数を検出しない');
  if (findBlockCountAnnotation('- `alpha/` - 一つ目') !== null) {
    failures.push('件数の無い項目を告発している');
  }
  return failures;
}

/** 同期記録（行全体が斜体）は件数の規約から外れていること、かつそれが万能の逃がしにならないこと */
function checkSyncNoteExemption(): string[] {
  const failures: string[] = [];
  const note = '_2026-08-30（Steering Sync: ログアーカイブの15テストを是正）_';
  if (!isSyncNoteLine(note)) failures.push('同期記録の形を認識できない');
  if (isSyncNoteLine('- `alpha/` - 一つ目（12テスト）')) {
    failures.push('通常の箇条書きを同期記録と誤認している');
  }
  // 実データの「行全体が斜体」は、すべて Steering Sync の記録であること
  for (const relative of listSteeringDocuments()) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf-8');
    source.split(/\r?\n/).forEach((raw, index) => {
      if (!isSyncNoteLine(raw)) return;
      if (raw.includes('Steering Sync')) return;
      failures.push(`行全体が斜体なのに同期記録でない: ${relative} L${index + 1}: ${raw.trim()}`);
    });
  }
  return failures;
}

/** テストファイルの綴りの判定が本物であること */
function checkTestFilePattern(): string[] {
  const failures: string[] = [];
  const positives = ['a.test.ts', 'b.test.tsx', 'c.spec.ts', 'd.spec.tsx', 'e.test.js'];
  const negatives = ['a.ts', 'b.tsx', 'testing.ts', 'spec.ts', 'a.test.md', 'preconditions.ts'];
  for (const name of positives) {
    if (!TEST_FILE_PATTERN.test(name)) failures.push(`テストと認めるべき綴りを外している: ${name}`);
  }
  for (const name of negatives) {
    if (TEST_FILE_PATTERN.test(name)) failures.push(`テストでない綴りを数えている: ${name}`);
  }
  const tempRoot = buildFixture({ files: ['pkg/only/readme.md'], steering: '# 構造\n' });
  try {
    if (containsTestFile(path.join(tempRoot, 'pkg', 'only'))) {
      failures.push('テストを含まないディレクトリを含むと判定している');
    }
  } finally {
    removeFixture(tempRoot);
  }
  return failures;
}

/** 印の綴りが厳密であること（緩い一致で誤って宣言と見なさない） */
function checkMarkerSyntax(): string[] {
  const failures: string[] = [];
  const accepted = [
    '<!-- steering:test-dirs e2e/specs -->',
    '<!--  steering:test-dirs  e2e/specs  -->',
  ];
  for (const line of accepted) {
    if (!BLOCK_OPEN_PATTERN.test(line.trim())) failures.push(`開始印として認めない: ${line}`);
  }
  const rejected = [
    '<!-- steering:test-dir e2e/specs -->',
    '<!-- steering:test-dirs -->',
    'steering:test-dirs e2e/specs',
  ];
  for (const line of rejected) {
    if (BLOCK_OPEN_PATTERN.test(line.trim()))
      failures.push(`開始印として認めてはならない: ${line}`);
  }
  if (!BLOCK_CLOSE_PATTERN.test('<!-- /steering:test-dirs -->')) {
    failures.push('終了印を認識できない');
  }
  return failures;
}

// ============================================================================
// 一覧
// ============================================================================

const CASES: Case[] = [
  {
    name: '是正前の実物の件数（三つの同値類）を、それぞれの規則が捕まえる',
    expected: false,
    custom: checkRealCountSamplesAreDetected,
  },
  {
    name: 'テストの数でない件数・カバレッジ率・件数の無い形は告発しない',
    expected: false,
    custom: checkNonCountSamplesAreNotDetected,
  },
  {
    name: '項目の形の見本が、本体の分類と独立分類の両方に一致する',
    expected: false,
    custom: checkEntrySamplesMatchImplementation,
  },
  {
    name: '実データが実現している項目の形を、見本がすべて写している',
    expected: false,
    custom: checkSampleFormsCoverRealData,
  },
  {
    name: '実体の数え直しが独立走査と一致する（本体の集計を呼ばずに数える）',
    expected: false,
    custom: checkRealDirectoriesAgreeWithIndependentScan,
  },
  { name: '検査本体が実在する', expected: false, custom: checkEntryExists },
  {
    name: 'リポジトリ本体の steering を実際に走査できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  { name: '走査が空振りしたら合格にしない', expected: false, custom: checkEmptyScanIsNotSuccess },
  {
    name: '印を消して検査を黙らせる経路が塞がっている',
    expected: false,
    custom: checkMarkerRemovalIsDetected,
  },
  {
    name: '走査から報告までが実際に働く（過小・過大・正常の三方向）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'テストを含まない補助ディレクトリは区分に数えない',
    expected: false,
    custom: checkHelperDirectoryIsNotACategory,
  },
  {
    name: 'ビルド生成物の中のテストを区分として数えない',
    expected: false,
    custom: checkBuildArtifactsAreIgnored,
  },
  {
    name: '同じ根の網羅宣言の重複を失敗にする',
    expected: false,
    custom: checkDuplicateDeclaration,
  },
  {
    name: '空・未終端・実在しない根・不正な項目を失敗にする',
    expected: false,
    custom: checkStructuralFaults,
  },
  {
    name: 'フェンスの中の規約の説明を宣言として数えない',
    expected: false,
    custom: checkFencedExampleIsNotADeclaration,
  },
  { name: '網羅宣言の中の件数を失敗にする', expected: false, custom: checkCountInsideBlock },
  {
    name: '同期記録の除外が、その形でだけ働いている',
    expected: false,
    custom: checkSyncNoteExemption,
  },
  { name: 'テストファイルの綴りの判定が本物である', expected: false, custom: checkTestFilePattern },
  { name: '印の綴りの一致が厳密である', expected: false, custom: checkMarkerSyntax },
];

function main(): void {
  console.log(
    '🔍 steering のテスト区分検査 検出規則 自己検査 (scripts/check-steering-test-tree.selftest.ts)'
  );
  let failed = 0;
  for (const testCase of CASES) {
    const failures = testCase.custom ? testCase.custom() : ['検証の実装が無い'];
    if (failures.length === 0) {
      console.log(`  ✅ ${testCase.name}`);
    } else {
      failed += 1;
      console.log(`  ❌ ${testCase.name}`);
      for (const failure of failures) console.log(`     - ${failure}`);
    }
  }
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${CASES.length} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${CASES.length}/${CASES.length} 件の確認に成功しました`);
}

main();
