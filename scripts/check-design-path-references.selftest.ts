/**
 * @fileoverview 設計文書の実在検査 検出規則の自己検査
 *
 * `scripts/check-design-path-references.ts` の検出規則が
 *   (1) **緩める向き**——実在しないパスを指す現存主張を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——実在するパス・プレースホルダ表記・撤去の記録を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の各例は**タスク 115.173 の是正前に設計文書に実在していた実物**である。
 * 検出器が壊れていれば本検査（0 件）は自明に通ってしまうため、既知の該当を捕まえられる
 * ことを先に固定する（陽性対照）。
 *
 * 開示済みの限界も、限界の**形でだけ**働いていることを固定する（checkDocumentedLimits）。
 * 「検出されないから問題が無い」と後任が読み違えないようにするためである。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-path-references.selftest.ts
 *   npm run check:design-path-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ABSENCE_MARKERS,
  BARE_NAME_EXTENSIONS,
  buildFileIndex,
  collectAbsenceDeclarations,
  compareReach,
  EXCLUDED_DIRECTORIES,
  execute,
  extractClaims,
  loadReachBaseline,
  run,
  scanDocument,
  statesAbsence,
  summariseReach,
  type FileIndex,
} from './check-design-path-references.js';
// 走査根は共有部品から直に取る。被検査モジュール（check-design-path-references.ts）を
// 経由して取ると、本体が再輸出を続ける限り複製の有無を見分けられない（タスク 115.231。
// タスク 115.221 が scripts/check-requirement-exclusions.selftest.ts で採った作法と同じ）。
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-path-references.ts';
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

/** 行の注入に用いる、リポジトリ本体の実在ファイル索引 */
const REAL_INDEX: FileIndex = buildFileIndex(ROOT);

/**
 * 注入した一行だけを持つ仮の設計文書を走査する。
 * 撤去の記録は「文書内の別の行」で与えられるため、宣言行を任意で添えられるようにする。
 */
function scanInjected(lines: readonly string[]): ReturnType<typeof scanDocument> {
  return scanDocument(`${SPEC_DIR}/sample/${DESIGN_DOC_NAME}`, lines.join('\n'), REAL_INDEX);
}

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する行（複数行を与えると同一文書の別行として扱われる） */
  lines?: string[];
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（緩める向きの誤り）
// すべて 115.173 の是正前に .kiro/specs/*/design.md に実在した実物
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: '大小だけが違うルート相対パス（user-authentication。実体は小文字始まり）',
    lines: [
      '既存のApiErrorクラス（`backend/src/errors/ApiError.ts`）を活用し、エラーハンドリングの一貫性を保ちます。',
    ],
    expected: true,
  },
  {
    name: '計画のまま作られなかった検証ファイル（quantity-table-generation。実体は接尾辞違い）',
    lines: [
      '- アクションメニューの表示不具合修正（REQ-46）— `e2e/specs/quantity-tables/quantity-item-action-menu-clipping.spec.ts`',
    ],
    expected: true,
  },
  {
    name: '計画のまま作られなかった API クライアント（quantity-table-generation。表のセル）',
    lines: [
      '| `frontend/src/api/quantity-groups.ts`（新規 or 既存 API クライアントに追記） | `copyQuantityGroup(groupId)` を追加 |',
    ],
    expected: true,
  },
  {
    name: '実装されなかった配置先（user-authentication。二択で書かれた片方）',
    lines: ['**ファイルパス:** `frontend/src/layouts/AuthenticatedLayout.tsx`'],
    expected: true,
  },
  {
    name: '省略形で書かれた検証ファイル（estimate-request。裸のファイル名）',
    lines: ['- Test impact: `service.test.ts` で `create()` の「内訳書なし」ケース 2 件追加'],
    expected: true,
  },
  {
    name: '撤去済み部品への裸のファイル名の言及（撤去の記録が同じ文書に無い場合）',
    lines: ['- Canvas コアは `AnnotationEditor.tsx`、ビューアは `ImageViewer.tsx` に分離'],
    expected: true,
  },
  {
    name: '本番コード以外の拡張子（115.169 の絞りが残した穴を持ち込んでいないこと）',
    lines: ['- 認証基盤は `backend/src/config/auth-config.yml` を読む'],
    expected: true,
  },
  {
    name: '同じ行に実在するパスが並んでいても、実在しない側を取り逃がさない',
    lines: [
      '- 送出は `frontend/src/utils/logger.ts` と `frontend/src/utils/nonexistent-sender.ts` が担う',
    ],
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（狭めすぎる向きの誤り＝過検出）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '実在するルート相対パス',
    lines: ['- 送出の仕組みは `frontend/src/utils/logger.ts` にある'],
    expected: false,
  },
  {
    name: '実在する裸のファイル名',
    lines: ['- 編集画面は `AnnotationEditor.tsx` である'],
    expected: false,
  },
  {
    name: 'プレースホルダ表記（呼称規約7 の `*`）',
    lines: ['- 命名の型は `frontend/src/hooks/use*.ts` の形で書く'],
    expected: false,
  },
  {
    name: 'プレースホルダ表記（説明語の `<>`）',
    lines: ['- 移行先は `frontend/src/pages/<画面名>.tsx` に置く'],
    expected: false,
  },
  {
    name: 'ブレース展開のテンプレート（R2 キー・マイグレーション名）',
    lines: [
      '- 追加する定義は `backend/prisma/migrations/{timestamp}_make_optional/migration.sql` である',
    ],
    expected: false,
  },
  {
    name: 'モジュール指定子（先頭セグメントが最上位エントリでない）',
    lines: ['- 依存は `@aws-sdk/client-s3` を用いる'],
    expected: false,
  },
  {
    name: 'MIME 型・要件タグ・併記記法（先頭セグメントが最上位エントリでない）',
    lines: ['- `image/png` を許可し `site-survey/REQ-5.5` に従い `scaleX/scaleY` を保つ'],
    expected: false,
  },
  {
    name: '属性アクセス（裸のトークンだが拡張子の絞りで落ちる）',
    lines: ['- 取得は `this.prisma` を用い、桁は `decimal.js` で保つ'],
    expected: false,
  },
  {
    name: 'ディレクトリの参照（末尾が `/` の生成物）',
    lines: ['- カバレッジ生成物（`backend/coverage/`）は集計から除く'],
    expected: false,
  },
  {
    name: 'ディレクトリの参照（末尾に拡張子が無い）',
    lines: ['- 対象は `frontend/src/components/site-surveys` 配下である'],
    expected: false,
  },
  {
    name: 'フェンスの中のコード例',
    lines: ['```ts', "import x from '`frontend/src/nonexistent.ts`';", '```'],
    expected: false,
  },
  {
    name: '撤去の記録（同じ行が不在を述べている）',
    lines: [
      '| `frontend/src/components/site-surveys/LazyImage.tsx` | 削除 | 未使用。観測ロジックは移設 |',
    ],
    expected: false,
  },
  {
    name: '撤去の記録（不在を述べる行が文書の別の場所にある）',
    lines: [
      '本表は `frontend/src/components/site-surveys/ImageViewer.tsx` を要件5 の担当として掲げていた。',
      '**`ImageViewer` はタスク 115.146 で撤去した。** `frontend/src/components/site-surveys/ImageViewer.tsx` はもう実在しない。',
    ],
    expected: false,
  },
  {
    name: '撤去の記録（ルート相対の記録で、裸のファイル名の言及も免除される）',
    lines: [
      '- Canvas コアは `AnnotationEditor.tsx`、ビューアは `ImageViewer.tsx` に分離',
      '- `frontend/src/components/site-surveys/ImageViewer.tsx` はタスク 115.146 で撤去済み',
    ],
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（機構を見る）
// ============================================================================

/** 走査対象が 0 件のとき「合格」にしないこと（第3原則） */
function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-empty-'));
  try {
    const result = spawnSync(process.execPath, [TSX_CLI, ENTRY_PATH], {
      cwd: temporary,
      encoding: 'utf-8',
      env: { ...process.env },
    });
    // 走査対象が空でも本体はリポジトリルート基準で動くため、run() を直接叩いて確かめる
    const emptyRun = run({ root: temporary });
    if (emptyRun.scannedFiles.length !== 0) {
      failures.push('空のディレクトリで走査対象が 0 件にならない（前提が崩れている）');
    }
    if (result.status === null) {
      failures.push('本体の起動に失敗した');
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return failures;
}

/** 走査から報告までが実際に働くこと（仮の spec 木を作って端から端まで通す） */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-e2e-'));
  try {
    const featureDir = path.join(temporary, SPEC_DIR, 'sample');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.mkdirSync(path.join(temporary, 'frontend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'frontend', 'src', 'present.ts'), 'export {};\n');
    fs.writeFileSync(
      path.join(featureDir, DESIGN_DOC_NAME),
      [
        '# Sample',
        '- 在るもの: `frontend/src/present.ts`',
        '- 無いもの: `frontend/src/absent.ts`',
        '',
      ].join('\n')
    );
    const result = run({ root: temporary });
    if (result.scannedFiles.length !== 1) {
      failures.push(`仮の設計文書を列挙できない（${result.scannedFiles.length} 件）`);
    }
    const references = result.findings.map((finding) => finding.reference);
    if (!references.includes('frontend/src/absent.ts')) {
      failures.push('実在しないパスを端から端まで通したときに検出できない');
    }
    if (references.includes('frontend/src/present.ts')) {
      failures.push('実在するパスを告発している');
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return failures;
}

/** リポジトリ本体の設計文書を実際に列挙できること（走査が空のまま合格していない） */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const documents = collectDesignDocuments(ROOT);
  if (documents.length === 0) {
    failures.push('リポジトリ本体の設計文書を一件も列挙できない');
  }
  for (const document of documents) {
    if (!document.startsWith(`${SPEC_DIR}/`) || !document.endsWith(`/${DESIGN_DOC_NAME}`)) {
      failures.push(`走査対象の形が違う: ${document}`);
    }
  }
  // 候補トークンが実際に取れていること（0 件のまま自明に合格する形を塞ぐ）
  let candidates = 0;
  for (const document of documents) {
    const lines = fs.readFileSync(path.join(ROOT, document), 'utf-8').split(/\r?\n/);
    for (const lineText of lines) {
      candidates += extractClaims(lineText, REAL_INDEX.topLevelEntries).length;
    }
  }
  if (candidates === 0) {
    failures.push('リポジトリ本体の設計文書から候補トークンが一つも取れていない');
  }
  return failures;
}

/** 実在ファイル索引が本物であること（生成物を含めず、ソース木を落とさない） */
function checkFileIndexIsReal(): string[] {
  const failures: string[] = [];
  if (REAL_INDEX.paths.size === 0) failures.push('実在パス集合が空である');
  if (REAL_INDEX.names.size === 0) failures.push('実在 basename 集合が空である');
  for (const directory of ['frontend', 'backend', 'e2e', 'scripts', '.kiro']) {
    if (EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ソース木 ${directory} が走査から外れている（在るファイルを告発してしまう）`);
    }
    if (!REAL_INDEX.topLevelEntries.has(directory)) {
      failures.push(`最上位エントリ ${directory} を索引できていない`);
    }
  }
  for (const generated of ['node_modules', 'dist', 'coverage']) {
    if (!EXCLUDED_DIRECTORIES.has(generated)) {
      failures.push(`生成物 ${generated} が実在集合に入っている（撤去の検知が効かなくなる）`);
    }
    if (REAL_INDEX.topLevelEntries.has(generated)) {
      failures.push(`生成物 ${generated} を最上位エントリとして索引している`);
    }
  }
  return failures;
}

/**
 * 検出結果を名指しで逃がす経路が無いこと（許容リストの名前ではなく機構を見る）。
 *
 * 「`ImageViewer.tsx` だけは見逃す」といった逃がしは、本体のソースに**ファイル名または
 * パスの文字列リテラル**として現れる。走査・判定・集計の各関数の本体にその形が無いことと、
 * `run` / `scanDocument` が findings を間引かないことを固定する。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  /** ファイル名・パスらしき文字列リテラル（許容リストの実体） */
  const PATH_LITERAL = /['"][A-Za-z0-9_@./-]*[A-Za-z0-9_@-]+\.(?:tsx?|jsx?|css|ya?ml|sql)['"]/;

  const bodies: Array<{ label: string; declaration: string }> = [
    { label: 'extractClaims', declaration: 'export function extractClaims(' },
    { label: 'statesAbsence', declaration: 'export function statesAbsence(' },
    {
      label: 'collectAbsenceDeclarations',
      declaration: 'export function collectAbsenceDeclarations(',
    },
    { label: 'scanDocument', declaration: 'export function scanDocument(' },
    { label: 'buildFileIndex', declaration: 'export function buildFileIndex(' },
    { label: 'run', declaration: 'export function run(' },
    // 面の集計と基準照合も同じ網に入れる（名指しで特定の文書・ファイルを面から外す経路を塞ぐ）
    { label: 'summariseReach', declaration: 'export function summariseReach(' },
    { label: 'compareReach', declaration: 'export function compareReach(' },
    { label: 'execute', declaration: 'export function execute(' },
  ];

  for (const body of bodies) {
    const start = source.indexOf(body.declaration);
    if (start < 0) {
      failures.push(`${body.label} の宣言が見つからない（改名されている疑い）`);
      continue;
    }
    const rest = source.slice(start + body.declaration.length);
    const nextDeclaration = rest.search(/\nexport (?:function|const) |\nfunction /);
    const text = nextDeclaration < 0 ? rest : rest.slice(0, nextDeclaration);
    if (PATH_LITERAL.test(text)) {
      failures.push(
        `${body.label} の本体にファイル名の文字列リテラルがある（名指しの逃がしの疑い）: ` +
          `${PATH_LITERAL.exec(text)?.[0]}`
      );
    }
    if (
      (body.label === 'run' || body.label === 'scanDocument') &&
      /findings\.(?:filter|slice|splice)\(/.test(text)
    ) {
      failures.push(`${body.label} が findings を間引いている`);
    }
    if (
      (body.label === 'summariseReach' || body.label === 'compareReach') &&
      /(?:reached|documents|regressions)\.(?:filter|slice|splice)\(/.test(text)
    ) {
      failures.push(`${body.label} が面の集計を間引いている`);
    }
  }

  // 免除の語が「何にでも当たる」形になっていないこと（空文字は全件免除になる）
  if (ABSENCE_MARKERS.length === 0) {
    failures.push('ABSENCE_MARKERS が空である（免除の判定が働かない）');
  }
  for (const marker of ABSENCE_MARKERS) {
    if (marker.trim().length === 0) {
      failures.push('ABSENCE_MARKERS に空の語がある（全件が免除される）');
    }
  }
  if (statesAbsence('この行には不在の語が無い')) {
    failures.push('不在の語を含まない行が「不在を述べている」と判定される');
  }

  // 拡張子の網が空でないこと（すべてを対象外にして 0 件で合格する形を塞ぐ）
  if (BARE_NAME_EXTENSIONS.length === 0) {
    failures.push('BARE_NAME_EXTENSIONS が空である（裸のファイル名を一切照合しない）');
  }
  for (const extension of ['.ts', '.tsx']) {
    if (!BARE_NAME_EXTENSIONS.includes(extension)) {
      failures.push(`裸のファイル名の照合対象から ${extension} が外れている`);
    }
  }
  return failures;
}

/**
 * 免除の機構が、文書が実際に書いた内容だけで決まること。
 * 宣言を取り除けば同じ参照が検出されることを、同じ入力の対で確かめる。
 */
function checkExemptionIsEarned(): string[] {
  const failures: string[] = [];
  const mention = '- 閲覧は `frontend/src/components/site-surveys/ImageViewer.tsx` が担っていた';
  const declaration =
    '- `frontend/src/components/site-surveys/ImageViewer.tsx` はタスク 115.146 で撤去済み';

  const withoutDeclaration = scanInjected([mention]);
  if (withoutDeclaration.findings.length !== 1) {
    failures.push('宣言が無いときに検出されない（免除が既定になっている疑い）');
  }
  const withDeclaration = scanInjected([mention, declaration]);
  if (withDeclaration.findings.length !== 0) {
    failures.push('宣言があるのに検出される（撤去の記録を告発している）');
  }
  if (withDeclaration.exemptedCount !== 2) {
    failures.push(
      `免除件数が実測と合わない（期待 2 / 実際 ${withDeclaration.exemptedCount}）。` +
        '免除は宣言行自身も含めて数える'
    );
  }

  // 宣言の索引が、文書が書いたトークンだけから作られていること
  const declared = collectAbsenceDeclarations([declaration], REAL_INDEX.topLevelEntries);
  if (!declared.has('frontend/src/components/site-surveys/ImageViewer.tsx')) {
    failures.push('宣言行からルート相対パスを取り出せていない');
  }
  if (!declared.has('ImageViewer.tsx')) {
    failures.push('宣言行の basename を取り出せていない（裸の言及が免除されない）');
  }
  const nothingDeclared = collectAbsenceDeclarations([mention], REAL_INDEX.topLevelEntries);
  if (nothingDeclared.size !== 0) {
    failures.push('不在の語が無い行から宣言を作っている（免除が勝手に広がる）');
  }
  return failures;
}

/**
 * 開示した限界が、その形でだけ働いていること。
 * 「検出されないから問題が無い」と後任が読み違えないよう、限界そのものを固定する。
 */
function checkDocumentedLimits(): string[] {
  const failures: string[] = [];

  // (a) 不在の語が何を指すかまでは見ない（115.173 が実測した誤った免除の形）
  const otherCause = scanInjected([
    '| `backend/src/__tests__/integration/routes/absent.routes.test.ts` | Modified | 必須前提 422 ケースを削除 |',
  ]);
  if (otherCause.findings.length !== 0) {
    failures.push('限界(a)が崩れている: 他事由の「削除」を伴う現存主張が検出されている');
  }
  if (otherCause.exemptedCount !== 1) {
    failures.push('限界(a)の確認が自明に通っている: 当該参照が候補にすら入っていない');
  }

  // (b) 裸のファイル名は basename しか照合しない（ディレクトリの移動は検出しない）
  const moved = scanInjected(['- 別のディレクトリに書かれていても `AnnotationEditor.tsx` は通る']);
  if (moved.findings.length !== 0) {
    failures.push('限界(b)が崩れている: basename が在るのに検出してしまう');
  }

  // (c) ディレクトリの参照は照合しない
  const directory = scanInjected(['- 生成物は `backend/nonexistent-directory/` に置かれる']);
  if (directory.findings.length !== 0) {
    failures.push('限界(c)が崩れている: ディレクトリの参照を照合している');
  }

  // (d) シンボル名の実在は見ない（`I*Service` は契約名であり実装の主張ではない）
  const symbol = scanInjected(['- 抽象契約 `ISurveyService` は実装に実体を持たない']);
  if (symbol.findings.length !== 0) {
    failures.push('限界(d)が崩れている: シンボル名を照合している');
  }

  // (e) design.md 以外は走査しない
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-scope-'));
  try {
    const featureDir = path.join(temporary, SPEC_DIR, 'sample');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'requirements.md'),
      '- 無いもの: `frontend/src/absent.ts`\n'
    );
    const scoped = run({ root: temporary });
    if (scoped.findings.length !== 0) {
      failures.push('限界(e)が崩れている: design.md 以外の文書を走査している');
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  // (f) 上の (a)〜(e) が「常に 0 件」ではないことの対照
  const control = scanInjected(['- 無いもの: `frontend/src/absent-control.ts`']);
  if (control.findings.length !== 1) {
    failures.push('検出そのものが働いていない（限界の確認が自明に通っている）');
  }
  return failures;
}

// ============================================================================
// 免除機構の「面」の実測と監視（タスク 115.215）
// ============================================================================

/** 一時的に標準出力を握る（関門の発火を確かめる間、出力で埋めないため） */
function withCapturedConsole<T>(body: () => T): { value: T; output: string } {
  const chunks: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const sink = (...args: unknown[]): void => {
    chunks.push(args.map((arg) => String(arg)).join(' '));
  };
  console.log = sink;
  console.error = sink;
  try {
    return { value: body(), output: chunks.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

/**
 * 面と免除を併せ持つ使い捨てのリポジトリを作る。
 * `present.ts` は実在しながら不在の語で名指されている（面 1 件）。
 * `gone.ts` は実在せず不在の語で名指されている（免除 2 件）。
 */
function makeReachFixture(): { root: string; document: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-reach-'));
  fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'present.ts'), 'export {};\n');
  const featureDir = path.join(root, SPEC_DIR, 'sample');
  fs.mkdirSync(featureDir, { recursive: true });
  fs.writeFileSync(
    path.join(featureDir, DESIGN_DOC_NAME),
    [
      '# Sample',
      '- 現存の担当は `frontend/src/present.ts` である',
      '- `frontend/src/present.ts` の旧実装は当時こうだった',
      '- 閲覧は `frontend/src/gone.ts` が担っていた',
      '- `frontend/src/gone.ts` は撤去済み',
      '',
    ].join('\n')
  );
  return { root, document: `${SPEC_DIR}/sample/${DESIGN_DOC_NAME}` };
}

/**
 * 面が現に免除へ転じる経路を関門が捕まえること。
 *
 * 面に入っているファイルが撤去されると、面は**減り**、同じ文書内の全言及が免除へ移る。
 * 面だけを見張ると、この向きは「狭まった」という助言に化けて素通りする。
 * リポジトリ本体で当てた変異（`frontend/src/components/site-surveys/AnnotationEditor.tsx` を
 * 消すと免除が 123 件から 162 件へ跳ね、面は 162 件から 160 件へ減る。2026-08-31 実測）と
 * 同じ形を、使い捨ての木の上で固定する。
 */
function checkExemptedBaselineGate(): string[] {
  const failures: string[] = [];
  const fixture = makeReachFixture();
  const baselinePath = path.join(fixture.root, 'reach-baseline.json');
  const options = { root: fixture.root, baselinePath };
  const documentPath = path.join(fixture.root, fixture.document);

  try {
    // 前提: 面 1 件・免除 2 件・実在の失格 0 件
    const scanned = run(options);
    if (scanned.reach.total !== 1) {
      failures.push(`前提が崩れている: 面が 1 件でない（${scanned.reach.total}）`);
    }
    if (scanned.exemptedCount !== 2) {
      failures.push(`前提が崩れている: 免除が 2 件でない（${scanned.exemptedCount}）`);
    }
    if (scanned.reach.exemptedTotal !== scanned.exemptedCount) {
      failures.push(
        `免除の集計が二重に食い違う（${scanned.reach.exemptedTotal} / ${scanned.exemptedCount}）`
      );
    }
    if (scanned.findings.length !== 0) {
      failures.push(`前提が崩れている: 失格が 0 件でない（${scanned.findings.length}）`);
    }

    // 現状を基準として記録する
    const recorded = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (recorded.value !== 0) failures.push(`基準を記録できない（exit ${recorded.value}）`);
    const written = loadReachBaseline(baselinePath);
    if (written.exemptedTotal !== 2 || written.exempted[fixture.document] !== 2) {
      failures.push(`免除の基準が実測と合わない（exemptedTotal ${written.exemptedTotal}）`);
    }

    // 対照: 変異を当てなければ合格する（関門が常時赤ではない）
    const steady = withCapturedConsole(() => execute([], options));
    if (steady.value !== 0) failures.push(`変異を当てていないのに落ちる（exit ${steady.value}）`);

    // 変異: 面に入っているファイルを撤去する。面は減り、免除は跳ねる
    const original = fs.readFileSync(documentPath, 'utf-8');
    fs.rmSync(path.join(fixture.root, 'frontend', 'src', 'present.ts'));
    const afterRemoval = run(options);
    if (afterRemoval.reach.total !== 0) {
      failures.push(`撤去後に面が残っている（${afterRemoval.reach.total}）`);
    }
    if (afterRemoval.exemptedCount !== 4) {
      failures.push(`撤去で免除が跳ねていない（期待 4 / 実際 ${afterRemoval.exemptedCount}）`);
    }
    const removed = withCapturedConsole(() => execute([], options));
    if (removed.value !== 1) {
      failures.push(
        `面が免除へ転じたのに合格した（exit ${removed.value}）。面だけを見張ると素通りする向き`
      );
    }
    if (!removed.output.includes('免除')) {
      failures.push('免除が増えたことを名指しで報告していない');
    }
    fs.writeFileSync(path.join(fixture.root, 'frontend', 'src', 'present.ts'), 'export {};\n');
    fs.writeFileSync(documentPath, original, 'utf-8');

    // 復元したら元の判定へ戻る（変異の効果が残っていない）
    const restored = withCapturedConsole(() => execute([], options));
    if (restored.value !== 0) failures.push(`復元後も落ちる（exit ${restored.value}）`);

    // 免除だけが増える向きも落とす（免除の言及を一つ足す）
    fs.writeFileSync(documentPath, `${original}- 旧 \`frontend/src/gone.ts\` の話\n`, 'utf-8');
    const grownExemption = withCapturedConsole(() => execute([], options));
    if (grownExemption.value !== 1) {
      failures.push(`免除だけが増えたのに合格した（exit ${grownExemption.value}）`);
    }
    fs.writeFileSync(documentPath, original, 'utf-8');

    // 免除の内訳と総数が食い違う基準は照合の前に拒否する
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          documents: { [fixture.document]: 1 },
          reachTotal: 1,
          candidateTotal: 2,
          exempted: { [fixture.document]: 2 },
          exemptedTotal: 99,
        },
        null,
        2
      )}\n`,
      'utf-8'
    );
    const tampered = withCapturedConsole(() => execute([], options));
    if (tampered.value !== 1) {
      failures.push(`免除の内訳と総数が食い違う基準を受け入れた（exit ${tampered.value}）`);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 面が「いま免除されている件数」とは別物として測られていること。
 *
 * 陽性対照（面が立つ形）と陰性対照（立たない形）を対で置く。どちらかが空になると
 * 「常に 0 件」で自明に通るため、両方の件数を固定する。
 */
function checkReachIsMeasured(): string[] {
  const failures: string[] = [];

  // 陽性: 現存するファイルが、同じ文書の不在を述べる行に名指されている
  const reached = scanInjected([
    '- 編集の中核は `frontend/src/components/site-surveys/AnnotationEditor.tsx` である',
    '- `frontend/src/components/site-surveys/AnnotationEditor.tsx` の寸法線は削除した',
  ]);
  if (reached.reach.reached.length !== 1) {
    failures.push(
      `現存かつ不在宣言済みの参照が面に入らない（期待 1 / 実際 ${reached.reach.reached.length}）`
    );
  }
  if (reached.exemptedCount !== 0) {
    failures.push(
      `面は免除件数ではない（実在するので免除は 0 のはず / 実際 ${reached.exemptedCount}）`
    );
  }

  // 陰性: 不在の宣言が無ければ面には入らない（免除も面も 0）
  const notReached = scanInjected([
    '- 編集の中核は `frontend/src/components/site-surveys/AnnotationEditor.tsx` である',
  ]);
  if (notReached.reach.reached.length !== 0) {
    failures.push(
      `宣言が無いのに面に入っている（実際 ${notReached.reach.reached.length}）。面が既定になっている疑い`
    );
  }
  if (notReached.reach.candidates.length !== 1) {
    failures.push(
      `候補（面の母数）が取れていない（期待 1 / 実際 ${notReached.reach.candidates.length}）`
    );
  }

  // 陰性: 実在しないファイルの宣言は「いま免除されている件数」であって面ではない
  const exemptedOnly = scanInjected([
    '- 閲覧は `frontend/src/components/site-surveys/ImageViewer.tsx` が担っていた',
    '- `frontend/src/components/site-surveys/ImageViewer.tsx` はタスク 115.146 で撤去済み',
  ]);
  if (exemptedOnly.reach.reached.length !== 0) {
    failures.push(
      `実在しない参照が面に混入している（実際 ${exemptedOnly.reach.reached.length}）。面と免除件数が同一視されている`
    );
  }
  if (exemptedOnly.exemptedCount !== 2) {
    failures.push(`免除件数の集計が壊れている（期待 2 / 実際 ${exemptedOnly.exemptedCount}）`);
  }

  // 集計が文書ごとの内訳と整合していること
  const summary = summariseReach([reached.reach, notReached.reach]);
  if (summary.total !== 1) failures.push(`面の合計が合わない（期待 1 / 実際 ${summary.total}）`);
  if (summary.candidateTotal !== 2) {
    failures.push(`母数の合計が合わない（期待 2 / 実際 ${summary.candidateTotal}）`);
  }
  return failures;
}

/**
 * リポジトリ本体で面が実際に測られていること。
 * 面が 0 のまま自明に通る状態（測っていない）と、母数が 0 の状態の両方を塞ぐ。
 */
function checkReachOnRealRepository(): string[] {
  const failures: string[] = [];
  const result = run();
  if (result.reach.candidateTotal === 0) {
    failures.push('候補（面の母数）が 0 件である（面を測っていない）');
  }
  if (result.reach.total === 0) {
    failures.push('面が 0 件である（実データには面が在るため、測れていない疑い）');
  }
  if (result.reach.total >= result.reach.candidateTotal) {
    failures.push(
      `面が母数以上になっている（面 ${result.reach.total} / 母数 ${result.reach.candidateTotal}）`
    );
  }
  const perDocumentSum = Object.values(result.reach.perDocument).reduce((sum, n) => sum + n, 0);
  if (perDocumentSum !== result.reach.total) {
    failures.push(`文書別の内訳と合計が食い違う（${perDocumentSum} / ${result.reach.total}）`);
  }
  // 面は免除件数とは別の数である（同一なら片方しか測っていない）
  if (result.reach.total === result.exemptedCount) {
    failures.push(
      `面と免除件数が同一である（${result.reach.total}）。別々に測れているか確認すること`
    );
  }
  return failures;
}

/** 面の基準が実際の関門として働くこと（増加で落ち、手書き換えを拒み、更新に摩擦がある） */
function checkReachBaselineGate(): string[] {
  const failures: string[] = [];
  const fixture = makeReachFixture();
  const baselinePath = path.join(fixture.root, 'reach-baseline.json');
  const options = { root: fixture.root, baselinePath };
  const writeBaselineFile = (payload: unknown): void => {
    fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  };

  try {
    // 前提: この使い捨ての文書は面 1 件・実在の失格 0 件である
    const scanned = run(options);
    if (scanned.reach.total !== 1 || scanned.findings.length !== 0) {
      failures.push(
        `使い捨ての前提が崩れている（面 ${scanned.reach.total} / 失格 ${scanned.findings.length}）`
      );
    }

    // 基準が無い状態は「面 0」として扱う＝増加とみなして落ちる（前提の欠落で素通りしない）
    const missing = withCapturedConsole(() => execute([], options));
    if (missing.value !== 1) failures.push(`基準が無いときに合格している（exit ${missing.value}）`);

    // 増加方向の更新は既定で拒否する
    const refused = withCapturedConsole(() => execute(['--update-baseline'], options));
    if (refused.value !== 1) {
      failures.push(`面が増える方向の基準更新を無言で通した（exit ${refused.value}）`);
    }
    if (fs.existsSync(baselinePath)) {
      failures.push('拒否したのに基準を書き出している');
    }

    // 明示すれば記録できる
    const recorded = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (recorded.value !== 0)
      failures.push(`--allow-increase で更新できない（exit ${recorded.value}）`);
    const written = loadReachBaseline(baselinePath);
    if (written.reachTotal !== 1 || written.documents[fixture.document] !== 1) {
      failures.push(`基準の書き出しが実測と合わない（reachTotal ${written.reachTotal}）`);
    }

    // 基準と一致していれば合格する（関門が常時赤ではないことの対照）
    const matched = withCapturedConsole(() => execute([], options));
    if (matched.value !== 0) failures.push(`基準と一致しているのに落ちる（exit ${matched.value}）`);
    if (!matched.output.includes('免除機構の面: 1 件')) {
      failures.push('合格時に面を開示していない');
    }

    // 面が増えれば落ちる（もう一つ現存ファイルを不在の語で名指す）
    const documentPath = path.join(fixture.root, fixture.document);
    const original = fs.readFileSync(documentPath, 'utf-8');
    fs.writeFileSync(path.join(fixture.root, 'frontend', 'src', 'second.ts'), 'export {};\n');
    fs.writeFileSync(
      documentPath,
      `${original}- \`frontend/src/second.ts\` はかつて別名だった\n`,
      'utf-8'
    );
    const grown = withCapturedConsole(() => execute([], options));
    if (grown.value !== 1) failures.push(`面が広がったのに合格した（exit ${grown.value}）`);
    if (!grown.output.includes(`${fixture.document} [面] 1 → 2`)) {
      failures.push('面の拡大を名指しで報告していない');
    }
    fs.writeFileSync(documentPath, original, 'utf-8');
    fs.rmSync(path.join(fixture.root, 'frontend', 'src', 'second.ts'));

    // 面が狭まった場合は助言のみ（合格させる）
    writeBaselineFile({
      documents: { [fixture.document]: 3 },
      reachTotal: 3,
      candidateTotal: 2,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
    });
    const shrunk = withCapturedConsole(() => execute([], options));
    if (shrunk.value !== 0) failures.push(`面が狭まったときに落ちる（exit ${shrunk.value}）`);
    if (!shrunk.output.includes('狭まっています')) {
      failures.push('面が狭まったことを報告していない');
    }

    // 内訳と総数が食い違う基準（手書き換え）は照合の前に拒否する
    writeBaselineFile({
      documents: { [fixture.document]: 1 },
      reachTotal: 99,
      candidateTotal: 2,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
    });
    const tampered = withCapturedConsole(() => execute([], options));
    if (tampered.value !== 1) {
      failures.push(`内訳と総数が食い違う基準を受け入れた（exit ${tampered.value}）`);
    }

    // compareReach 自体の対照（総数が合っていれば inconsistent にしない）
    const firstDocument = scanned.reach.documents[0];
    if (firstDocument === undefined) {
      failures.push('文書ごとの内訳が取れていない（面を測っていない）');
    } else {
      const consistent = compareReach(
        {
          documents: { [fixture.document]: 1 },
          reachTotal: 1,
          candidateTotal: 2,
          exempted: { [fixture.document]: 2 },
          exemptedTotal: 2,
        },
        summariseReach([firstDocument])
      );
      if (consistent.inconsistent) failures.push('整合した基準を手書き換えと判定している');
      if (consistent.regressions.length !== 0 || consistent.improvements.length !== 0) {
        failures.push('一致しているのに差分を報告している');
      }
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  return failures;
}

/** 本体をサブプロセスとして起動し、終了コードと開示される面の件数を突き合わせる */
function checkReachReportedBySubprocess(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const result = spawnSync(process.execPath, [TSX_CLI, ENTRY_PATH], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    failures.push(`本検査がリポジトリ本体で落ちている（exit ${result.status}）`);
  }
  const expected = run().reach;
  const stdout = result.stdout ?? '';
  if (!stdout.includes(`免除機構の面: ${expected.total} 件`)) {
    failures.push(`開示された面の件数が実測（${expected.total} 件）と一致しない`);
  }
  if (!stdout.includes(`候補 distinct ${expected.candidateTotal} 件`)) {
    failures.push(`開示された母数が実測（${expected.candidateTotal} 件）と一致しない`);
  }
  // 基準と開示が同じ数を指していること（基準だけが古いまま合格する状態を塞ぐ）
  const baseline = loadReachBaseline(path.join(SCRIPTS_DIR, 'design-path-exemption-baseline.json'));
  if (baseline.reachTotal !== expected.total) {
    failures.push(`基準の面（${baseline.reachTotal} 件）が実測（${expected.total} 件）と食い違う`);
  }
  if (baseline.exemptedTotal !== expected.exemptedTotal) {
    failures.push(
      `基準の免除（${baseline.exemptedTotal} 件）が実測（${expected.exemptedTotal} 件）と食い違う`
    );
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
    name: '免除は文書が書いた宣言だけで決まる（宣言を外すと同じ参照が検出される）',
    expected: false,
    custom: checkExemptionIsEarned,
  },
  {
    name: '走査から報告までが実際に働く（仮の設計文書で実在しないパスを捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'リポジトリ本体の設計文書を実際に列挙し、候補トークンが取れている',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '実在ファイル索引が本物である（生成物を含めず、ソース木を落とさない）',
    expected: false,
    custom: checkFileIndexIsReal,
  },
  {
    name: '開示した限界が、その形でだけ働いている',
    expected: false,
    custom: checkDocumentedLimits,
  },
  {
    name: '陽性対照が空でない',
    expected: false,
    custom: checkPositiveControlsArePresent,
  },
  {
    name: '免除の面が、いま免除されている件数とは別に測られている',
    expected: false,
    custom: checkReachIsMeasured,
  },
  {
    name: 'リポジトリ本体で面が実際に測られている（0 件で自明に通っていない）',
    expected: false,
    custom: checkReachOnRealRepository,
  },
  {
    name: '面の基準が関門として働く（増加で落ち、手書き換えを拒み、更新に摩擦がある）',
    expected: false,
    custom: checkReachBaselineGate,
  },
  {
    name: '面が免除へ転じる向き（面に入ったファイルの撤去）も関門が捕まえる',
    expected: false,
    custom: checkExemptedBaselineGate,
  },
  {
    name: '本体を起動して、開示される面の件数と基準が実測と一致する',
    expected: false,
    custom: checkReachReportedBySubprocess,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const { findings } = scanInjected(testCase.lines ?? []);
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
    { title: '捕捉しなければならない書き方（115.173 の是正前の実物）', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 設計文書の実在検査 検出規則 自己検査 (scripts/check-design-path-references.selftest.ts)'
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
