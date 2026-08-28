/**
 * @fileoverview steering の実在検査 検出規則の自己検査
 *
 * `scripts/check-steering-file-references.ts` の検出規則が
 *   (1) **緩める向き**——撤去・改名に追随していない記載を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——現に在るファイルの記載や、実在の主張ではない書き方
 *       （ライブラリ名・命名規則の例示・glob・撤去の記録）を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の各例は**タスク 115.169 の是正前に steering に実在していた実物**である。
 * 検出器が壊れていれば本検査（0 件）は自明に通ってしまうため、既知の該当を捕まえられる
 * ことを先に固定する（陽性対照）。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-file-references.selftest.ts
 *   npm run check:steering-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  CHECKED_EXTENSIONS,
  collectRepositoryFileNames,
  collectSteeringDocuments,
  EXCLUDED_DIRECTORIES,
  extractClaim,
  run,
  scanDocument,
  STEERING_DIR,
} from './check-steering-file-references.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-steering-file-references.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return fs
    .readFileSync(ENTRY_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** 行の注入に用いる、リポジトリ本体の実在ファイル名集合 */
const REAL_FILE_NAMES = collectRepositoryFileNames(ROOT);

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（緩める向きの誤り）
// すべて 115.169 の是正前に .kiro/steering/*.md に実在した実物
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: 'ツリーの葉に撤去済みコンポーネント（structure.md の site-surveys/ 配下, 115.146 で撤去）',
    line: '│   │       ├── ImageViewer.tsx      # 画像ビューア（Fabric.js）',
    expected: true,
  },
  {
    name: 'ツリーの葉に撤去済みコンポーネント（112.1 で撤去）',
    line: '│   │       ├── LazyImage.tsx        # 遅延読み込み画像',
    expected: true,
  },
  {
    name: '先頭逆引用符の箇条書きに撤去済みストーリー（structure.md の Storybook 一覧）',
    line: '- `ImageViewer.stories.tsx` - 画像ビューア',
    expected: true,
  },
  {
    name: '先頭逆引用符の箇条書きに撤去済みストーリー（112.1 で撤去）',
    line: '- `LazyImage.stories.tsx` - 遅延読み込み画像',
    expected: true,
  },
  {
    name: 'ツリーの葉に改名前のテスト名（audit-log-archive.service.test.ts へ改名）',
    line: '│   │       │   ├── archive.service.test.ts # ログアーカイブ（6テスト）',
    expected: true,
  },
  {
    name: 'ツリーの葉に移動・改名前のテスト名（unit/config/env.test.ts へ）',
    line: '│   │           └── env-validator.test.ts # 環境変数バリデーション（14テスト）',
    expected: true,
  },
  {
    name: '字下げされた箇条書きに移動・改名前のテスト名（tech.md のテスト一覧）',
    line: '    - `env-validator.test.ts` - 環境変数バリデーション（14テスト）',
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（狭めすぎる向きの誤り＝働いている記述の誤爆）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '現に在るコンポーネントのツリーの葉',
    line: '│   │       ├── AnnotationEditor.tsx # 注釈エディタ（Fabric.js）',
    expected: false,
  },
  {
    name: '現に在るストーリーの箇条書き',
    line: '- `SiteSurveyForm.stories.tsx` - 現場調査フォーム',
    expected: false,
  },
  {
    name: '注釈にライブラリ名を含むツリーの葉（葉の名前だけを見る）',
    line: '│   │   ├── annotation.service.ts # 注釈管理（Fabric.js JSON保存）',
    expected: false,
  },
  {
    name: '命名規則の例示（逆引用符が先頭に来ない）',
    line: '  - コンポーネント: PascalCase (`UserProfile.tsx`)',
    expected: false,
  },
  {
    name: '命名規則の例示（ユーティリティ）',
    line: '  - ユーティリティ: camelCase (`formatDate.ts`)',
    expected: false,
  },
  {
    name: 'glob を含む箇条書き',
    line: '- `*.stories.tsx` - Storybookストーリーファイル（コンポーネントバリアント定義）',
    expected: false,
  },
  {
    name: 'glob を含むツリーの葉',
    line: '│   │   └── *.spec.ts',
    expected: false,
  },
  {
    name: '依存パッケージの箇条書き（逆引用符の直後が版数）',
    line: '- `decimal.js` ^10.6.0 - 高精度10進数計算（数量計算）',
    expected: false,
  },
  {
    name: '依存パッケージの箇条書き（OCR）',
    line: '- `tesseract.js` ^7.0.0 - OCR文字認識（受領見積書構造化データ抽出、再実行/リトライ機能）',
    expected: false,
  },
  {
    name: 'ディレクトリのツリー項目（末尾スラッシュ）',
    line: '│   │   ├── site-surveys/            # 現場調査コンポーネント',
    expected: false,
  },
  {
    name: '撤去を記録した同期ノートの散文（現存の主張ではない）',
    line: '_最終更新: 2026-08-05（Steering Sync: backend `estimate-draft.service.ts` 追加と `estimate-export.service.ts` 撤去）_',
    expected: false,
  },
  {
    name: '命名規則の特殊ファイル（対象外の拡張子）',
    line: '- `index.js` - ディレクトリのエントリーポイント・エクスポート集約',
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（機構を見る）
// ============================================================================

/** 走査対象が 0 件のとき合格にしないこと（第3原則） */
function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ref-empty-'));
  try {
    // 本体を一時ルート配下の scripts/ へ複製する。本体は自身の位置から ROOT を導くため、
    // これで「steering 文書が一件も無いリポジトリ」を再現できる。
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));

    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(
        `走査対象が 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!(executed.stderr ?? '').includes('一件も見つかりませんでした')) {
      failures.push('走査対象 0 件を「合格」と告げている疑いがある');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 走査から報告までの一連が実際に働くこと。
 * `extractClaim` 単体が正しくても、列挙・読み込み・集計のどこかが壊れていれば
 * 本検査は「0 件」で自明に合格してしまう。仮の steering を作り、
 * 撤去済みの記載を置いたときに findings が立ち、在る記載では立たないことを固定する。
 */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ref-e2e-'));
  try {
    const steeringDir = path.join(tempRoot, STEERING_DIR);
    fs.mkdirSync(steeringDir, { recursive: true });
    // 実在させる側のファイル（basename の照合が「在る」を正しく認めることの対照）
    fs.mkdirSync(path.join(tempRoot, 'frontend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'frontend', 'src', 'Present.tsx'), 'export {};\n');
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      [
        '# 構造',
        '│   ├── Present.tsx        # 在るコンポーネント',
        '│   ├── Removed.tsx        # 撤去済みコンポーネント',
        '- `Removed.stories.tsx` - 撤去済みストーリー',
        '- `*.stories.tsx` - Storybookストーリーファイル',
      ].join('\n')
    );

    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== 1) {
      failures.push(`仮の steering を1件列挙できていない（${result.scannedFiles.length} 件）`);
    }
    const detected = result.findings.map((finding) => `${finding.line}:${finding.reference}`);
    const expected = ['3:Removed.tsx', '4:Removed.stories.tsx'];
    if (detected.join(' / ') !== expected.join(' / ')) {
      failures.push(
        `検出が期待と違う。期待「${expected.join(' / ')}」／` +
          `実際「${detected.join(' / ') || '（無し）'}」`
      );
    }

    // ビルド生成物に旧名が残っていても「在る」と数えないこと
    fs.mkdirSync(path.join(tempRoot, 'frontend', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'frontend', 'dist', 'Removed.tsx'), 'export {};\n');
    const withArtifact = run({ root: tempRoot });
    if (withArtifact.findings.length !== expected.length) {
      failures.push('ビルド生成物に残った旧名を実在として数えてしまう（撤去の検知が効かなくなる）');
    }

    // 撤去済みの記載を落とせば合格すること（常時失敗の裏返しを塞ぐ）
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      ['# 構造', '│   ├── Present.tsx        # 在るコンポーネント'].join('\n')
    );
    const clean = run({ root: tempRoot });
    if (clean.findings.length !== 0) {
      failures.push(
        `是正後の材料で該当が残る: ${clean.findings.map((f) => f.reference).join(' / ')}`
      );
    }

    // 終了コードまで含めた挙動（報告の詐称・件数の間引きを塞ぐ）
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      ['# 構造', '│   ├── Removed.tsx        # 撤去済みコンポーネント'].join('\n')
    );
    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(`該当がある材料で終了コードが 1 にならなかった（status=${executed.status}）`);
    }
    const stderr = executed.stderr ?? '';
    if (!stderr.includes('合計 1 件 / 1 ファイル（走査 1 ファイル）')) {
      const actual = /合計 .*ファイル）/.exec(stderr)?.[0] ?? '（要約行が無い）';
      failures.push(`報告される件数が期待と違う。実際「${actual}」`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * リポジトリ本体の steering 文書を**一件も落とさずに**列挙できること。
 *
 * 「一件でも列挙できていれば良い」では、`collectSteeringDocuments` に名指しの除外を
 * 差し込む間引きを見逃す。本検査の側で `.kiro/steering` を独立に走査し、
 * `.md` の集合が実装の戻りと完全一致することを求める。
 */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];

  const expected = fs
    .readdirSync(path.join(ROOT, STEERING_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${STEERING_DIR}/${entry.name}`)
    .sort();

  const documents = collectSteeringDocuments(ROOT, STEERING_DIR);
  if (documents.length === 0) {
    failures.push('リポジトリ本体の steering 文書が一件も列挙できていない');
  }
  for (const required of [`${STEERING_DIR}/structure.md`, `${STEERING_DIR}/tech.md`]) {
    if (!documents.includes(required)) {
      failures.push(`走査対象に ${required} が含まれていない`);
    }
  }
  for (const document of expected) {
    if (!documents.includes(document)) {
      failures.push(`走査対象から落ちている steering がある: ${document}`);
    }
  }
  for (const document of documents) {
    if (!expected.includes(document)) {
      failures.push(`実在しない走査対象が混ざっている: ${document}`);
    }
  }

  // 走査件数の下限。既定の product/tech/structure を消して件数を減らす形を塞ぐ
  const MINIMUM_STEERING_DOCUMENTS = 3;
  if (documents.length < MINIMUM_STEERING_DOCUMENTS) {
    failures.push(
      `走査対象が ${MINIMUM_STEERING_DOCUMENTS} 件を下回っている（${documents.length} 件）`
    );
  }
  return failures;
}

/**
 * リポジトリの実在ファイル走査が本物であること。
 * この集合が過大（生成物込み）だと撤去を見逃し、過小だと在るファイルを告発する。
 */
function checkRepositoryFileNamesAreReal(): string[] {
  const failures: string[] = [];
  const present = ['AnnotationEditor.tsx', 'imageFitScale.ts', 'package.json', 'tsconfig.json'];
  for (const name of present) {
    if (!REAL_FILE_NAMES.has(name)) {
      failures.push(`実在するファイルが実在集合に無い: ${name}`);
    }
  }
  const absent = ['ImageViewer.tsx', 'LazyImage.tsx', 'ImageViewer.stories.tsx'];
  for (const name of absent) {
    if (REAL_FILE_NAMES.has(name)) {
      failures.push(
        `撤去済みのファイルが実在集合に入っている: ${name}（生成物が走査から外れていない疑い）`
      );
    }
  }
  // 生成物ディレクトリが外れていること（撤去の検知が効かなくなる向きを塞ぐ）
  for (const directory of ['node_modules', 'dist', 'coverage', 'storybook-static']) {
    if (!EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ビルド生成物 ${directory} が走査から外れていない`);
    }
  }
  // 逆に、本体のソース木を丸ごと外していないこと（過検出へ倒れる向き）
  for (const directory of ['frontend', 'backend', 'e2e', 'scripts', '.kiro']) {
    if (EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ソース木 ${directory} が走査から外れている（在るファイルを告発してしまう）`);
    }
  }
  return failures;
}

/**
 * 検出結果を名指しで逃がす経路が無いこと（許容リストの名前ではなく機構を見る）。
 *
 * 「`ImageViewer.tsx` だけは見逃す」といった逃がしは、本体のソースに**ファイル名の
 * 文字列リテラル**として現れる。走査・判定・集計の各関数の本体にその形が無いことと、
 * `run` が findings を間引かないことを固定する。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  /** ファイル名らしき文字列リテラル（許容リストの実体） */
  const FILE_NAME_LITERAL = /['"`][A-Za-z0-9_@.-]+\.(?:tsx?|css|stories\.tsx)['"`]/;

  const bodies: Array<{ label: string; declaration: string }> = [
    { label: 'extractClaim', declaration: 'export function extractClaim(' },
    { label: 'scanDocument', declaration: 'export function scanDocument(' },
    { label: 'collectSteeringDocuments', declaration: 'export function collectSteeringDocuments(' },
    {
      label: 'collectRepositoryFileNames',
      declaration: 'export function collectRepositoryFileNames(',
    },
    { label: 'run', declaration: 'export function run(' },
  ];

  for (const body of bodies) {
    const start = source.indexOf(body.declaration);
    if (start < 0) {
      failures.push(`${body.label} の宣言が見つからない（改名されている疑い）`);
      continue;
    }
    // 次の関数宣言までを本体とみなす
    const rest = source.slice(start + body.declaration.length);
    const nextDeclaration = rest.search(/\nexport (?:function|const) |\nfunction /);
    const text = nextDeclaration < 0 ? rest : rest.slice(0, nextDeclaration);
    if (FILE_NAME_LITERAL.test(text)) {
      failures.push(
        `${body.label} の本体にファイル名の文字列リテラルがある（名指しの逃がしの疑い）: ` +
          `${FILE_NAME_LITERAL.exec(text)?.[0]}`
      );
    }
    if (body.label === 'run' && /\.filter\(|\.slice\(|\.splice\(/.test(text)) {
      failures.push('run が findings を間引いている');
    }
  }

  // 拡張子の網が空でないこと（すべてを対象外にして 0 件で合格する形を塞ぐ）
  if (CHECKED_EXTENSIONS.length === 0) {
    failures.push('CHECKED_EXTENSIONS が空である（何も照合しない）');
  }
  for (const extension of ['.ts', '.tsx']) {
    if (!CHECKED_EXTENSIONS.includes(extension)) {
      failures.push(`照合対象の拡張子から ${extension} が外れている`);
    }
  }
  return failures;
}

/**
 * 検出しないと明記した限界が、実際にその形でだけ働いていること。
 * 「散文は見ない」は見逃しであって合格ではないため、**限界そのものを固定**して
 * 後任が「検出されないから問題が無い」と読み違えないようにする。
 */
function checkDocumentedLimits(): string[] {
  const failures: string[] = [];
  const knownEmpty: ReadonlySet<string> = new Set<string>();

  // (a) basename しか照合しない: ディレクトリが違っても在れば検出しない
  const moved = scanDocument(
    'sample/structure.md',
    '│   ├── AnnotationEditor.tsx # 別のディレクトリに書かれていても検出しない',
    REAL_FILE_NAMES
  );
  if (moved.length !== 0) {
    failures.push('限界(a)が崩れている: basename が在るのに検出してしまう');
  }

  // (b) 散文の言及は主張として扱わない
  const prose = scanDocument(
    'sample/structure.md',
    'backend `estimate-export.service.ts` を撤去した（同期記録）',
    knownEmpty
  );
  if (prose.length !== 0) {
    failures.push('限界(b)が崩れている: 散文の言及を主張として扱っている');
  }

  // (c) 対象外の拡張子は照合しない（実在集合を空にしても検出しない）
  if (extractClaim('│   ├── vite.config.js      # Vite設定') !== null) {
    failures.push('限界(c)が崩れている: 対象外の拡張子を主張として取り出している');
  }

  // (d) 主張の形そのものは働いている（(a)〜(c) が「常に null」ではないことの対照）
  if (extractClaim('│   ├── ImageViewer.tsx      # 画像ビューア') !== 'ImageViewer.tsx') {
    failures.push('主張の抽出そのものが働いていない（限界の確認が自明に通っている）');
  }
  return failures;
}

/** 陽性対照そのものが空でないこと（0 件の自明な合格を塞ぐ） */
function checkPositiveControlsArePresent(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('MUST_NOT_DETECT が空である');
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '検出結果を名指しで逃がす経路が無い（許容リストの名前ではなく機構を見る）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: '走査から報告までが実際に働く（仮の steering で撤去済みの記載を捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'リポジトリ本体の steering を実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '実在ファイル集合が本物である（生成物を含めず、ソース木を落とさない）',
    expected: false,
    custom: checkRepositoryFileNamesAreReal,
  },
  {
    name: '明記した限界が、その形でだけ働いている',
    expected: false,
    custom: checkDocumentedLimits,
  },
  {
    name: '陽性対照が空でない',
    expected: false,
    custom: checkPositiveControlsArePresent,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const findings = scanDocument('sample/structure.md', testCase.line ?? '', REAL_FILE_NAMES);
  const detected = findings.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${findings.map((f) => f.reference).join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '捕捉しなければならない書き方（115.169 の是正前の実物）', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 steering の実在検査 検出規則 自己検査 (scripts/check-steering-file-references.selftest.ts)'
  );
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = runCase(testCase);
      if (failures.length === 0) {
        console.log(`  ✅ ${testCase.name}`);
      } else {
        failed += 1;
        console.log(`  ❌ ${testCase.name}`);
        for (const failure of failures) console.log(`     - ${failure}`);
      }
    }
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
}

main();
