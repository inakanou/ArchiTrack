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
 *
 * ## 開示と関門の穴に対する制御（タスク 115.241）
 *
 * 115.241 が本体へ足した挙動——実体の件数、裸の名前の曖昧性、面の集合による基準の照合、
 * 失格時の更新の拒否、開示と基準の読み書きに対する絞り込みの監視——には、それぞれ
 * 変異で殺せる制御を置いた。実測（2026-09-02。リポジトリルート）:
 *   - `bundleReachEntities` が `reached.length` を返す変異 → 2/38 件が赤
 *   - 曖昧性の閾値を潰す変異（`matches > 1` を `> 1000000` / `> 0` へ）→ 1 件 / 2 件が赤
 *   - 失格時の更新拒否を撤去する変異 → 1/38 件が赤
 *   - `compareReach` の面の比較を件数だけへ戻す変異 → 1/38 件が赤
 *   - 読めない基準を黙って捨てる変異・`entityTotal` の自己整合を外す変異 → 各 1/38 件が赤
 *   - `reportReach` へ設計文書を名指しで読み飛ばす一行を足す変異、および
 *     `reach.documents` を `.filter(` で間引く変異 → いずれも 1/38 件が赤
 *
 * ## 対照レジストリそのものの真空を塞ぐ（タスク 115.242）
 *
 * 対照のレジストリを空にすると走査が空回りして緑で通る真空パスがあった。是正前の実測
 * （2026-09-02。リポジトリルート）: `STRUCTURAL` を空にすると 22/22 緑・EXIT=0、
 * `checkNoFindingsNarrowing` の中の `bodies` を空にすると 39/39 緑・EXIT=0、
 * `main` の `groups` を空にすると 0/0 緑・EXIT=0。115.241 が足した制御も同じ穴を共有していた。
 *
 * 前提の確認は `reportPreconditions` に置き、`main` の冒頭で対照より先に走らせる。
 * **守り手を守られる側と同じレジストリへ置かない**ため、そこは配列への登録ではなく
 * 直列の手続きとして書いてある。呼び出しごと外す経路は `checkPreconditionsAreWired` が
 * 塞ぎ、総数は `reportPreconditions` が実際に走らせた件数から導く（定数で貼らない）。
 * 対照そのものが走ることは `corpusExecutionFailures` が前提の側で見る——`STRUCTURAL` に
 * 居る守り手は、対照の繰り返しを止められると自分ごと黙るためである。
 * 下限の置き方（導ける側は構造から導き、導けない側は限界を書き残す）は 115.222 と
 * 作法を揃えた。塞いだ見逃しと残る限界はその節の註を読むこと。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ABSENCE_MARKERS,
  BARE_NAME_EXTENSIONS,
  bundleReachEntities,
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
  writeReachBaseline,
  type ExemptionReach,
  type FileIndex,
} from './check-design-path-references.js';
// 走査根は共有部品から直に取る。被検査モジュール（check-design-path-references.ts）を
// 経由して取ると、本体が再輸出を続ける限り複製の有無を見分けられない（タスク 115.231。
// タスク 115.221 が scripts/check-requirement-exclusions.selftest.ts で採った作法と同じ）。
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SELFTEST_PATH = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(SELFTEST_PATH);
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
 * 名指しの逃がしを見張る本体の関数の一覧（タスク 115.242 で関数の外へ出した）。
 *
 * 関数の中に置いていた頃は、この配列を空にすると `checkNoFindingsNarrowing` の走査が
 * 空回りして緑で通った（実測 2026-09-02: 39/39 緑・EXIT=0）。外へ出したのは、
 * 空でないことと下限を `reportPreconditions` から測れるようにするためである。
 *
 * 下限は件数ではなく**本体の関数の集合**から導く（`watchedBodyCoverageFailures`）。
 * 本体に関数が増えれば下限も自動で追随し、この一覧を削る変更は赤くなる。
 */
const NARROWING_WATCHED_BODIES: ReadonlyArray<{ label: string; declaration: string }> = [
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
  // 基準の読み書き・開示・入口も同じ網に入れる（タスク 115.241）。
  // 115.215 はこの四つを網の外に置いていた。とりわけ `reportReach` は
  // 「文書 X を開示から隠す」絞り込みが最も自然に入る場所である。
  { label: 'bundleReachEntities', declaration: 'export function bundleReachEntities(' },
  { label: 'loadReachBaseline', declaration: 'export function loadReachBaseline(' },
  { label: 'writeReachBaseline', declaration: 'export function writeReachBaseline(' },
  { label: 'reportReach', declaration: 'function reportReach(' },
  { label: 'main', declaration: 'function main(' },
  // 補助の小関数も例外にしない。下限は本体の関数の集合そのものから導くため、
  // 「小さいから見ない」という例外を残すと下限が人手の判断に戻る（タスク 115.242）。
  { label: 'hasExtension', declaration: 'function hasExtension(' },
  { label: 'reachRatio', declaration: 'function reachRatio(' },
];

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
  // `.md` を含めるのは、面の開示を絞る最も自然な形が
  // `document.file === '.kiro/specs/<feature>/design.md'` だからである（タスク 115.241）。
  // 本体は設計文書名を `design-document.ts` の `DESIGN_DOC_NAME` から取り、
  // `.md` の文字列リテラルを一つも持たないため、この拡張で誤検出は出ない。
  const PATH_LITERAL = /['"][A-Za-z0-9_@./-]*[A-Za-z0-9_@-]+\.(?:tsx?|jsx?|css|ya?ml|sql|md)['"]/;

  for (const body of NARROWING_WATCHED_BODIES) {
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
    // 開示と基準の書き出しから文書・参照を落とす形（タスク 115.241）
    if (
      (body.label === 'reportReach' || body.label === 'writeReachBaseline') &&
      /(?:reach\.documents|reached|ambiguousBareNames)\.(?:filter|slice|splice)\(/.test(text)
    ) {
      failures.push(`${body.label} が開示から文書・参照を落としている`);
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
          exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
          exemptedDistinctTotal: 1,
          candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
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
 * 免除が**延べ件数と distinct の集合の両方**で測られていること（タスク 115.293）。
 *
 * 陽性対照と陰性対照を対で置く。どちらかが空になると「常に 0 件」で自明に通るため、
 * 両方の件数を固定する。加えて**延べと distinct が別物である**ことを、
 * 二つが食い違う形（同じ参照を二行で言及する形）で固定する——
 * `exemptedReferences` を「延べと同じ長さの配列」にする変異や、
 * 集合を常に空にする変異はここで赤くなる。
 *
 * リポジトリ本体での実額は延べ 123 件 / distinct 30 件（差 93 件）である
 *（2026-09-05 にリポジトリルートで実測）。差が 0 の木では両者の違いを固定できないため、
 * ここでは差が 1 の木を用いる。
 */
function checkExemptedSetIsMeasured(): string[] {
  const failures: string[] = [];

  // 陽性(1): 同じ参照が二行で言及され、一方が不在を述べる。延べ 2 件・distinct 1 件
  const repeated = scanInjected([
    '- 閲覧は `frontend/src/components/site-surveys/GhostViewer.tsx` が担っていた',
    '- `frontend/src/components/site-surveys/GhostViewer.tsx` は撤去済み',
  ]);
  if (repeated.exemptedCount !== 2) {
    failures.push(`免除の延べが 2 件でない（${repeated.exemptedCount}）`);
  }
  if (repeated.reach.exemptedReferences.length !== 1) {
    failures.push(
      `免除の集合が 1 件でない（${repeated.reach.exemptedReferences.length}）。` +
        '延べをそのまま配列にしていないか'
    );
  }
  if (
    repeated.reach.exemptedReferences[0] !== 'frontend/src/components/site-surveys/GhostViewer.tsx'
  ) {
    failures.push(
      `免除の集合が参照そのものを持っていない（${JSON.stringify(repeated.reach.exemptedReferences)}）`
    );
  }
  if (repeated.reach.exemptedReferences.length === repeated.exemptedCount) {
    failures.push('延べと distinct が同じ値になっている（二つを区別していない）');
  }

  // 陽性(2): 相異なる二つの参照。延べ 2 件・distinct 2 件（集合が常に 1 件でないこと）
  const distinctPair = scanInjected([
    '- `frontend/src/components/site-surveys/GhostViewer.tsx` と' +
      ' `frontend/src/components/site-surveys/LostPanel.tsx` は撤去済み',
  ]);
  if (distinctPair.exemptedCount !== 2 || distinctPair.reach.exemptedReferences.length !== 2) {
    failures.push(
      `相異なる二つの免除が集合に入らない（延べ ${distinctPair.exemptedCount} /` +
        ` distinct ${distinctPair.reach.exemptedReferences.length}）`
    );
  }
  // 型は「distinct・整列済み」と宣言している。整列を外す変異を捕らえる
  const pairSorted = [...distinctPair.reach.exemptedReferences].sort();
  if (distinctPair.reach.exemptedReferences.join('|') !== pairSorted.join('|')) {
    failures.push(
      `免除の集合が整列していない（${JSON.stringify(distinctPair.reach.exemptedReferences)}）`
    );
  }

  // 陰性: 実在する参照は免除にも集合にも入らない
  const present = scanInjected([
    '- 検査の本体は `scripts/check-design-path-references.ts` である',
    '- `scripts/check-design-path-references.ts` の旧版は削除した',
  ]);
  if (present.exemptedCount !== 0 || present.reach.exemptedReferences.length !== 0) {
    failures.push(
      `実在する参照が免除の集合に入っている（延べ ${present.exemptedCount} /` +
        ` distinct ${present.reach.exemptedReferences.length}）`
    );
  }

  // 集計側（summariseReach）が集合を落としていないこと。
  // 併せて、集合が空の文書を辞書へ入れないこと——入れると基準へ空配列の項が並び、
  // 「延べに件数がある文書には集合が要る」判定の読み手を惑わせる
  const summary = summariseReach([repeated.reach, distinctPair.reach]);
  const emptyOnly = summariseReach([present.reach]);
  if (Object.keys(emptyOnly.exemptedReferencesPerDocument).length !== 0) {
    failures.push(
      `集合が空の文書まで集計の辞書へ入っている（${Object.keys(emptyOnly.exemptedReferencesPerDocument).length} 件）`
    );
  }
  if (Object.keys(summary.exemptedReferencesPerDocument).length === 0) {
    failures.push('集合を持つ文書が集計の辞書に一つも入っていない（陰性対照が立たない）');
  }
  if (summary.exemptedDistinctTotal !== 3) {
    failures.push(`集計の distinct 合計が 3 件でない（${summary.exemptedDistinctTotal}）`);
  }
  if (summary.exemptedTotal !== 4) {
    failures.push(`集計の延べ合計が 4 件でない（${summary.exemptedTotal}）`);
  }

  // リポジトリ本体で 0 件に落ちていないこと（使い捨ての木だけで自明に通らせない）
  const real = run();
  if (real.reach.exemptedDistinctTotal === 0) {
    failures.push('リポジトリ本体の免除の集合が 0 件（母集団が空で自明に通っている）');
  }
  if (real.reach.exemptedDistinctTotal > real.reach.exemptedTotal) {
    failures.push(
      `distinct が延べを超えている（${real.reach.exemptedDistinctTotal} > ${real.reach.exemptedTotal}）`
    );
  }
  return failures;
}

/**
 * 免除の側の**入れ替え**（1 件が抜け 1 件が入る）を関門が捕まえること（タスク 115.293）。
 *
 * 115.241 は面の側だけを集合にしたため、免除の側では延べ件数が動かない入れ替えが素通りしていた。
 * リポジトリ本体で実証した変異は次のとおり——`.kiro/specs/site-survey/design.md` で
 * 一度だけ言及されている免除済みの参照を、実在しない別の綴りへ置き換える。延べは 123 件のまま、
 * distinct の集合だけが 1 件入れ替わる。**この変異は 115.241 の版では EXIT=0 の緑であり、
 * 本タスクの版では EXIT=1 になる**（2026-09-05 にリポジトリルートで実測）。
 * ここでは同じ形を使い捨ての木の上で固定し、併せて基準の側から集合を消す経路も塞ぐ。
 */
function checkExemptedSetBaselineGate(): string[] {
  const failures: string[] = [];
  const fixture = makeReachFixture();
  const baselinePath = path.join(fixture.root, 'reach-baseline.json');
  const options = { root: fixture.root, baselinePath };
  const documentPath = path.join(fixture.root, fixture.document);
  // 現況の走査には現れない文書。基準の側だけに置くことで、落ちる理由を一つに絞る
  const GHOST_DOCUMENT = `${SPEC_DIR}/ghost/${DESIGN_DOC_NAME}`;
  const writeBaselineFile = (payload: unknown): void => {
    fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  };

  try {
    // 前提: 免除は延べ 2 件・distinct 1 件（差が 1 件ある木でなければ入れ替えを固定できない）
    const scanned = run(options);
    if (scanned.exemptedCount !== 2 || scanned.reach.exemptedDistinctTotal !== 1) {
      failures.push(
        `前提が崩れている（延べ ${scanned.exemptedCount} /` +
          ` distinct ${scanned.reach.exemptedDistinctTotal}）`
      );
    }

    const recorded = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (recorded.value !== 0) failures.push(`基準を記録できない（exit ${recorded.value}）`);
    const written = loadReachBaseline(baselinePath);
    if ((written.exemptedReferences[fixture.document] ?? []).length !== 1) {
      failures.push('基準が免除の集合を持っていない');
    }
    if (written.exemptedDistinctTotal !== 1) {
      failures.push(`基準の distinct 合計が実測と合わない（${written.exemptedDistinctTotal}）`);
    }
    if (written.candidateHistory.length === 0) {
      failures.push('基準が母数の履歴を持っていない（起点からの薄まりが測れない）');
    }

    // 対照: 変異を当てなければ合格する
    const steady = withCapturedConsole(() => execute([], options));
    if (steady.value !== 0) failures.push(`変異を当てていないのに落ちる（exit ${steady.value}）`);
    // 要約の開示が実測と基準の対を述べていること（定数への置き換えを捕らえる）。
    // この木は延べ 2 件・distinct 1 件・差 1 件であり、三値が同時に定数へ落ちることはない。
    for (const expected of ['延べ 2 件（基準 2 件）', 'distinct 1 件（基準 1 件）', '差 1 件']) {
      if (!steady.output.includes(expected)) {
        failures.push(`免除の開示に「${expected}」が出ていない（定数に置き換わっていないか）`);
      }
    }
    // 文書ごとの内訳（--verbose）も延べと distinct の双方を述べること
    const verbose = withCapturedConsole(() => execute(['--verbose'], options));
    if (!verbose.output.includes('免除 延べ 2 件・distinct 1 件')) {
      failures.push('文書ごとの内訳が免除の延べと distinct の対を述べていない');
    }

    // 変異: 免除の入れ替え。延べ 2 件は動かず、集合だけが 1 件入れ替わる
    const original = fs.readFileSync(documentPath, 'utf-8');
    fs.writeFileSync(
      documentPath,
      original.split('frontend/src/gone.ts').join('frontend/src/vanished.ts'),
      'utf-8'
    );
    const swappedRun = run(options);
    if (swappedRun.exemptedCount !== 2) {
      failures.push(
        `入れ替えで免除の延べが動いてしまい対照にならない（${swappedRun.exemptedCount}）`
      );
    }
    if (swappedRun.findings.length !== 0) {
      failures.push(
        `入れ替えで実在の失格が出てしまい対照にならない（${swappedRun.findings.length}）`
      );
    }
    const swapped = withCapturedConsole(() => execute([], options));
    if (swapped.value !== 1) {
      failures.push(`免除の入れ替え（延べは不変）が素通りした（exit ${swapped.value}）`);
    }
    if (!swapped.output.includes('frontend/src/vanished.ts')) {
      failures.push('入れ替えで免除に入った参照を名指しで報告していない');
    }
    // 入れ替えは両側を見せなければ運用者が「何が抜けたか」を読めない。
    // 件数の字面まで固定すると `improvements` 側の分岐を単独で殺せる（115.293 のレビューが実測。
    // 当該分岐を殺しても是正前は 46/46 緑だった）。
    if (!swapped.output.includes('[免除の集合] -1 件: frontend/src/gone.ts')) {
      failures.push('入れ替えで免除から抜けた参照を名指しで報告していない（片側しか見せていない）');
    }
    fs.writeFileSync(documentPath, original, 'utf-8');
    const restored = withCapturedConsole(() => execute([], options));
    if (restored.value !== 0) failures.push(`復元後も落ちる（exit ${restored.value}）`);

    // 基準から免除の集合だけを消す（延べは残す）と、集合の関門が無言で外れる。拒否すること
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: {},
      exemptedDistinctTotal: 0,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const strippedSets = withCapturedConsole(() => execute([], options));
    if (strippedSets.value !== 1) {
      failures.push(`免除の集合を消した基準を受け入れた（exit ${strippedSets.value}）`);
    }

    // 上の case は集合の差分（基準に無い参照が増えた）でも赤くなるため、
    // 「延べに件数がある文書には集合が要る」という条件そのものは殺していない
    // （115.241 のレビューが `malformedDocuments` で踏んだのと同じ形。当該条件を外す変異を
    // 当てると 46/46 緑だった。2026-09-05 にリポジトリルートで実測）。
    // ここでは**現況に存在しない文書**を使い、落ちる理由を当該条件ただ一つに絞る——
    // 現況では 0 件なので集合の差分も延べの差分も退行を出さない（出るのは助言だけ）。
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2, [GHOST_DOCUMENT]: 5 },
      exemptedTotal: 7,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const setlessTally = withCapturedConsole(() => execute([], options));
    if (setlessTally.value !== 1) {
      failures.push(
        `延べに件数がありながら集合を持たない文書を受け入れた（exit ${setlessTally.value}）`
      );
    }

    // 逆向き（distinct が延べを超える）も同じ文書で単独に固定する
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2, [GHOST_DOCUMENT]: 1 },
      exemptedTotal: 3,
      exemptedReferences: {
        [fixture.document]: ['frontend/src/gone.ts'],
        [GHOST_DOCUMENT]: ['frontend/src/one.ts', 'frontend/src/two.ts'],
      },
      exemptedDistinctTotal: 3,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const distinctExceedsTally = withCapturedConsole(() => execute([], options));
    if (distinctExceedsTally.value !== 1) {
      failures.push(
        `distinct が延べを超える基準を受け入れた（exit ${distinctExceedsTally.value}）`
      );
    }

    // distinct の合計を手で書き換えた基準も拒否する
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 99,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const tamperedDistinct = withCapturedConsole(() => execute([], options));
    if (tamperedDistinct.value !== 1) {
      failures.push(`distinct の合計が食い違う基準を受け入れた（exit ${tamperedDistinct.value}）`);
    }

    // 免除の集合として読めない項目を持つ基準も拒否する
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: 2 },
      exemptedDistinctTotal: 0,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const unreadableSets = withCapturedConsole(() => execute([], options));
    if (unreadableSets.value !== 1) {
      failures.push(`免除の集合として読めない基準を受け入れた（exit ${unreadableSets.value}）`);
    }
    if (!unreadableSets.output.includes('免除の集合として読めない項目')) {
      failures.push('読めない免除の集合を名指しで報告していない');
    }

    // 上の case は「延べに件数があるのに集合が無い」条件でも赤くなるため、
    // 読めない項目そのものを拒む条件は殺していない（当該条件を外す変異で 46/46 緑。
    // 2026-09-05 にリポジトリルートで実測）。読める鍵を正しく残し、
    // 現況に存在しない文書の側だけを読めない値にして、落ちる理由を一つに絞る。
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'], [GHOST_DOCUMENT]: 999 },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const loadedMixedExemption = loadReachBaseline(baselinePath);
    if (loadedMixedExemption.malformedExemptedReferences.length !== 1) {
      failures.push(
        `前提が崩れている: 読めない免除の鍵が 1 件でない（${loadedMixedExemption.malformedExemptedReferences.length}）`
      );
    }
    if ((loadedMixedExemption.exemptedReferences[fixture.document] ?? []).length !== 1) {
      failures.push('前提が崩れている: 読める鍵まで落ちている（落ちる理由が一つに絞れない）');
    }
    const mixedExemption = withCapturedConsole(() => execute([], options));
    if (mixedExemption.value !== 1) {
      failures.push(
        `総数は自己整合するが読めない免除の鍵を持つ基準を受け入れた（exit ${mixedExemption.value}）`
      );
    }
    if (!mixedExemption.output.includes(GHOST_DOCUMENT)) {
      failures.push('読めない免除の鍵を名指しで報告していない');
    }

    // 母数の履歴を空にした基準は拒否する（起点からの薄まりを消す経路）
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [],
    });
    const emptiedHistory = withCapturedConsole(() => execute([], options));
    if (emptiedHistory.value !== 1) {
      failures.push(`母数の履歴が空の基準を受け入れた（exit ${emptiedHistory.value}）`);
    }

    // 履歴の末尾を書き換えた基準も拒否する（末尾は reachTotal / candidateTotal と一致する）
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 777 }],
    });
    const tamperedHistory = withCapturedConsole(() => execute([], options));
    if (tamperedHistory.value !== 1) {
      failures.push(`履歴の末尾が食い違う基準を受け入れた（exit ${tamperedHistory.value}）`);
    }

    // 免除の集合は「distinct・整列済み」と型が宣言している。書き出しの整列に対照を置く
    // （115.293 のレビューが実測: `sort()` を `reverse()` にしても是正前は 46/46 緑だった）。
    // 走査の側は既に整列して返すため、整列されていない入力を直に渡して書き出しだけを見る。
    // **要素は三つ要る。** 二要素では逆順と整列の結果が一致してしまい、整列を逆順へ
    // 差し替える変異を殺せない（本タスクの是正の途中で実測。二要素の対照では 47/47 緑だった）。
    const sortProbePath = path.join(fixture.root, 'sort-probe-baseline.json');
    const expectedOrder = ['frontend/src/alpha.ts', 'frontend/src/mid.ts', 'frontend/src/zeta.ts'];
    const unsortedReach: ExemptionReach = {
      perDocument: {},
      total: 0,
      candidateTotal: 0,
      entityTotal: 0,
      ambiguousBareNames: [],
      exemptedPerDocument: { [fixture.document]: 3, [GHOST_DOCUMENT]: 1 },
      exemptedTotal: 4,
      exemptedReferencesPerDocument: {
        [fixture.document]: [
          'frontend/src/mid.ts',
          'frontend/src/alpha.ts',
          'frontend/src/zeta.ts',
        ],
        [GHOST_DOCUMENT]: ['frontend/src/only.ts'],
      },
      exemptedDistinctTotal: 4,
      documents: [],
    };
    writeReachBaseline(sortProbePath, unsortedReach);
    const sortProbe = loadReachBaseline(sortProbePath).exemptedReferences[fixture.document] ?? [];
    if (sortProbe.join('|') !== expectedOrder.join('|')) {
      failures.push(
        `免除の集合が整列して書き出されていない（${JSON.stringify(sortProbe)}）。` +
          '型は「distinct・整列済み」と宣言している'
      );
    }
    // 文書の鍵も整列して書き出すこと（差分の読みやすさは基準の運用の前提である）。
    // GHOST_DOCUMENT は `.kiro/specs/ghost/` であり、`.kiro/specs/sample/` より前に並ぶ
    const sortProbeText = fs.readFileSync(sortProbePath, 'utf-8');
    const exemptedSection = sortProbeText.slice(sortProbeText.indexOf('"exemptedReferences"'));
    if (exemptedSection.indexOf(GHOST_DOCUMENT) > exemptedSection.indexOf(fixture.document)) {
      failures.push('基準の免除の集合の鍵が整列して書き出されていない');
    }

    // 履歴は**追記のみ**である（書き出しが前回の履歴を捨てていないこと）
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-01-01', reachTotal: 9, candidateTotal: 900 }],
    });
    const appended = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (appended.value !== 0) failures.push(`追記の更新ができない（exit ${appended.value}）`);
    const afterAppend = loadReachBaseline(baselinePath);
    if (afterAppend.candidateHistory.length !== 2) {
      failures.push(
        `履歴が追記されていない（${afterAppend.candidateHistory.length} 件）。前回の履歴を捨てている`
      );
    }
    if (afterAppend.candidateHistory[0]?.candidateTotal !== 900) {
      failures.push('履歴の起点が書き換わっている（追記のみでない）');
    }
    // 値が同じなら重ねて追記しない（更新のたびに膨らませない）
    const reAppended = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (reAppended.value !== 0) failures.push(`二度目の更新ができない（exit ${reAppended.value}）`);
    if (loadReachBaseline(baselinePath).candidateHistory.length !== 2) {
      failures.push('同じ値でも履歴が重ねて追記されている');
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

// ============================================================================
// 実体の件数・裸の名前の曖昧性・更新経路（タスク 115.241）
// ============================================================================

/**
 * 面の件数と**実体のファイル数**が別々に測られていること。
 *
 * 同じ面の件数（2 件）から実体 1 件と 2 件の双方を導く対で置く。
 * 片方だけだと「実体＝面の件数」または「実体＝定数」でも通ってしまう。
 */
function checkEntityCountIsMeasured(): string[] {
  const failures: string[] = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-entity-'));
  try {
    fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(root, 'frontend', 'src', 'shared.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'backend', 'shared.ts'), 'export {};\n');
    const index = buildFileIndex(root);
    const document = `${SPEC_DIR}/sample/${DESIGN_DOC_NAME}`;

    // 同じファイルを二通りの綴りで名指す: 面 2 件・実体 1 件
    const twoSpellings = scanDocument(
      document,
      [
        '- 中核は `frontend/src/shared.ts`、略記は `shared.ts` である',
        '- `frontend/src/shared.ts` の旧実装は当時こうだった',
      ].join('\n'),
      index
    );
    if (twoSpellings.reach.reached.length !== 2) {
      failures.push(`前提が崩れている: 面が 2 件でない（${twoSpellings.reach.reached.length}）`);
    }
    if (twoSpellings.reach.entities !== 1) {
      failures.push(
        `別表記を実体として二重に数えている（期待 1 / 実際 ${twoSpellings.reach.entities}）`
      );
    }

    // 同じ basename の別実体を二つ名指す: 面 2 件・実体 2 件
    const twoEntities = scanDocument(
      document,
      [
        '- 中核は `frontend/src/shared.ts` と `backend/shared.ts` である',
        '- `frontend/src/shared.ts` と `backend/shared.ts` の旧実装は当時こうだった',
      ].join('\n'),
      index
    );
    if (twoEntities.reach.reached.length !== 2) {
      failures.push(`前提が崩れている: 面が 2 件でない（${twoEntities.reach.reached.length}）`);
    }
    if (twoEntities.reach.entities !== 2) {
      failures.push(
        `basename が同じ別実体を一つに畳んでいる（期待 2 / 実際 ${twoEntities.reach.entities}）`
      );
    }

    // 束ねの規則そのものの対照（面が空なら実体も 0）
    if (bundleReachEntities([], index.nameCounts).entities !== 0) {
      failures.push('面が空なのに実体が 0 でない');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 裸の名前だけで面に入る参照の曖昧性が測られ、開示されること。
 *
 * 陽性（同名の実在が 2 件）と陰性（1 件）を対で置く。陰性が無いと
 * 「何でも曖昧と数える」形でも通る。
 */
function checkAmbiguousBareNamesAreMeasured(): string[] {
  const failures: string[] = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-ambiguous-'));
  try {
    fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(root, 'frontend', 'src', 'shared.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'backend', 'shared.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'frontend', 'src', 'unique.ts'), 'export {};\n');
    const index = buildFileIndex(root);
    const document = `${SPEC_DIR}/sample/${DESIGN_DOC_NAME}`;

    if (index.nameCounts.get('shared.ts') !== 2) {
      failures.push(`実在の重複を索引できていない（${index.nameCounts.get('shared.ts')}）`);
    }
    if (index.nameCounts.get('unique.ts') !== 1) {
      failures.push(`一意な basename の件数が違う（${index.nameCounts.get('unique.ts')}）`);
    }

    // 陽性: 裸の名前が二つの実在に一致している
    const ambiguous = scanDocument(
      document,
      ['- 中核は `shared.ts` である', '- `shared.ts` の旧実装は当時こうだった'].join('\n'),
      index
    );
    if (ambiguous.reach.ambiguousBareNames.length !== 1) {
      failures.push(
        `曖昧な裸の名前を数えていない（期待 1 / 実際 ${ambiguous.reach.ambiguousBareNames.length}）`
      );
    } else if (ambiguous.reach.ambiguousBareNames[0]!.matches !== 2) {
      failures.push(
        `一致件数が実測と合わない（期待 2 / 実際 ${ambiguous.reach.ambiguousBareNames[0]!.matches}）`
      );
    }

    // 陰性: 同名の実在が一つだけなら曖昧ではない
    const unambiguous = scanDocument(
      document,
      ['- 中核は `unique.ts` である', '- `unique.ts` の旧実装は当時こうだった'].join('\n'),
      index
    );
    if (unambiguous.reach.reached.length !== 1) {
      failures.push(`前提が崩れている: 面が 1 件でない（${unambiguous.reach.reached.length}）`);
    }
    if (unambiguous.reach.ambiguousBareNames.length !== 0) {
      failures.push(
        `一意な裸の名前を曖昧と数えている（${unambiguous.reach.ambiguousBareNames.length}）`
      );
    }

    // 陰性: ルート相対パスは曖昧性の対象ではない（綴りが実体を一意に決める）
    const qualified = scanDocument(
      document,
      [
        '- 中核は `frontend/src/shared.ts` である',
        '- `frontend/src/shared.ts` の旧実装は当時こうだった',
      ].join('\n'),
      index
    );
    if (qualified.reach.ambiguousBareNames.length !== 0) {
      failures.push(
        `ルート相対パスを曖昧と数えている（${qualified.reach.ambiguousBareNames.length}）`
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 実在検査に失格が出ているツリーで基準を更新しないこと（タスク 115.241）。
 *
 * 115.215 の形は `result.findings.length > 0` でも `--update-baseline` が 0 を返し、
 * 失格の赤を出したうえで「基準を更新しました」と成功を報告して基準を書き出していた。
 */
function checkUpdateRefusesWhileFailing(): string[] {
  const failures: string[] = [];
  const fixture = makeReachFixture();
  const baselinePath = path.join(fixture.root, 'reach-baseline.json');
  const options = { root: fixture.root, baselinePath };
  const documentPath = path.join(fixture.root, fixture.document);
  const original = fs.readFileSync(documentPath, 'utf-8');

  try {
    // 対照: 失格が無ければ更新できる（関門が常時赤ではない）
    const healthy = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (healthy.value !== 0) failures.push(`失格が無いのに更新できない（exit ${healthy.value}）`);
    if (!fs.existsSync(baselinePath)) failures.push('失格が無いのに基準を書き出さない');
    fs.rmSync(baselinePath, { force: true });

    // 変異: 実在しないパスの現存主張を一行足す
    fs.writeFileSync(documentPath, `${original}- 無いもの: \`frontend/src/absent.ts\`\n`, 'utf-8');
    const failing = run(options);
    if (failing.findings.length !== 1) {
      failures.push(`変異が効いていない（失格 ${failing.findings.length} 件）`);
    }
    const refused = withCapturedConsole(() =>
      execute(['--update-baseline', '--allow-increase'], options)
    );
    if (refused.value !== 1) {
      failures.push(`失格があるのに基準の更新が成功を報告した（exit ${refused.value}）`);
    }
    if (fs.existsSync(baselinePath)) {
      failures.push('失格があるのに基準を書き出している');
    }
    if (!refused.output.includes('実在検査に失格がある状態では免除の面の基準を更新しません')) {
      failures.push('更新を拒否した理由を報告していない');
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
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
    const writtenReach = written.documents[fixture.document] ?? [];
    if (written.reachTotal !== 1 || writtenReach.length !== 1) {
      failures.push(`基準の書き出しが実測と合わない（reachTotal ${written.reachTotal}）`);
    }
    // 件数だけでなく集合そのものが書き出されていること（タスク 115.241）
    if (writtenReach[0] !== 'frontend/src/present.ts') {
      failures.push(`基準が面の集合を持っていない（documents ${JSON.stringify(writtenReach)}）`);
    }
    if (written.entityTotal !== 1) {
      failures.push(`基準が実体の数を持っていない（entityTotal ${written.entityTotal}）`);
    }
    if (written.malformedDocuments.length !== 0) {
      failures.push('書き出した基準を自分で読み戻せない（面の集合として読めない）');
    }

    // 基準と一致していれば合格する（関門が常時赤ではないことの対照）
    const matched = withCapturedConsole(() => execute([], options));
    if (matched.value !== 0) failures.push(`基準と一致しているのに落ちる（exit ${matched.value}）`);
    if (!matched.output.includes('免除機構の面: 1 件')) {
      failures.push('合格時に面を開示していない');
    }
    // 実体の件数を開示すること（タスク 115.241 の (1)。--json を自分で集計させない）
    if (!matched.output.includes('実体のファイルは 1 件')) {
      failures.push('合格時に実体のファイル数を開示していない');
    }
    // 母数を関門にしない代わりに、基準記録時の母数と比を並べて開示すること（同 (6)）
    if (!matched.output.includes(`基準記録時の母数は ${written.candidateTotal} 件`)) {
      failures.push('基準記録時の母数を開示していない（比の薄まりに信号が無い）');
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
    if (!grown.output.includes(`${fixture.document} [面] +1 件: frontend/src/second.ts`)) {
      failures.push('面の拡大を名指しで報告していない');
    }
    fs.writeFileSync(documentPath, original, 'utf-8');
    fs.rmSync(path.join(fixture.root, 'frontend', 'src', 'second.ts'));

    // 面の件数が動かない**入れ替え**も落とす（タスク 115.241）。
    // 115.215 の件数だけの基準では、この変異は exit 0 で素通りしていた。
    fs.writeFileSync(path.join(fixture.root, 'frontend', 'src', 'swapped.ts'), 'export {};\n');
    fs.writeFileSync(
      documentPath,
      original.split('frontend/src/present.ts').join('frontend/src/swapped.ts'),
      'utf-8'
    );
    const swappedRun = run(options);
    if (swappedRun.reach.total !== 1) {
      failures.push(`入れ替えで面の件数が動いてしまい対照にならない（${swappedRun.reach.total}）`);
    }
    const swapped = withCapturedConsole(() => execute([], options));
    if (swapped.value !== 1) {
      failures.push(`面の入れ替え（件数は不変）が素通りした（exit ${swapped.value}）`);
    }
    if (!swapped.output.includes('frontend/src/swapped.ts')) {
      failures.push('入れ替えで面に入った参照を名指しで報告していない');
    }
    fs.writeFileSync(documentPath, original, 'utf-8');
    fs.rmSync(path.join(fixture.root, 'frontend', 'src', 'swapped.ts'));

    // 面が狭まった場合は助言のみ（合格させる）
    writeBaselineFile({
      documents: {
        [fixture.document]: [
          'frontend/src/absent-a.ts',
          'frontend/src/absent-b.ts',
          'frontend/src/present.ts',
        ],
      },
      reachTotal: 3,
      candidateTotal: 2,
      entityTotal: 3,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 3, candidateTotal: 2 }],
    });
    const shrunk = withCapturedConsole(() => execute([], options));
    if (shrunk.value !== 0) failures.push(`面が狭まったときに落ちる（exit ${shrunk.value}）`);
    if (!shrunk.output.includes('狭まっています')) {
      failures.push('面が狭まったことを報告していない');
    }

    // 内訳と総数が食い違う基準（手書き換え）は照合の前に拒否する
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 99,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 99, candidateTotal: 2 }],
    });
    const tampered = withCapturedConsole(() => execute([], options));
    if (tampered.value !== 1) {
      failures.push(`内訳と総数が食い違う基準を受け入れた（exit ${tampered.value}）`);
    }

    // 実体の数を手で書き換えた基準も拒否する（タスク 115.241）
    writeBaselineFile({
      documents: { [fixture.document]: ['frontend/src/present.ts'] },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 99,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const tamperedEntities = withCapturedConsole(() => execute([], options));
    if (tamperedEntities.value !== 1) {
      failures.push(`実体の数が食い違う基準を受け入れた（exit ${tamperedEntities.value}）`);
    }

    // 面を件数でしか持たない基準（115.215 の形）は「面 0」と解さず拒否する（タスク 115.241）
    writeBaselineFile({
      documents: { [fixture.document]: 1 },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const legacyShape = withCapturedConsole(() => execute([], options));
    if (legacyShape.value !== 1) {
      failures.push(`面の集合として読めない基準を受け入れた（exit ${legacyShape.value}）`);
    }
    if (!legacyShape.output.includes('面の集合として読めない項目')) {
      failures.push('読めない基準の項目を名指しで報告していない');
    }

    // 総数がすべて自己整合していても、面の集合として読めない鍵が一つ混ざれば拒否すること。
    // 上の 115.215 形式の case は `documents` の全鍵が落ちて reachTotal も食い違うため、
    // `malformedDocuments` の条件を外しても赤いままだった——すなわち当該条件を一度も
    // 殺していなかった（115.241 のレビューが実測。当該条件を外すと 38/38 緑・EXIT=0）。
    // ここでは読める鍵を正しい集合で残し、reachTotal / entityTotal / exempted を
    // 読める側だけで整合させる。落ちる理由が読めない鍵ただ一つになる。
    // 本 case を置いたうえで同じ条件を外す変異を当てると 1/39 件が赤になる
    //（2026-09-02 にリポジトリルートで実測。未変異では当該基準に対し EXIT=1）。
    writeBaselineFile({
      documents: {
        [fixture.document]: ['frontend/src/present.ts'],
        'hand-written-nonsense.md': 999,
      },
      reachTotal: 1,
      candidateTotal: 2,
      entityTotal: 1,
      exempted: { [fixture.document]: 2 },
      exemptedTotal: 2,
      exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
      exemptedDistinctTotal: 1,
      candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
    });
    const loadedMixed = loadReachBaseline(baselinePath);
    if (loadedMixed.malformedDocuments.length !== 1) {
      failures.push(
        `前提が崩れている: 読めない鍵が 1 件でない（${loadedMixed.malformedDocuments.length}）`
      );
    }
    if ((loadedMixed.documents[fixture.document] ?? []).length !== 1) {
      failures.push('前提が崩れている: 読める鍵まで落ちている（落ちる理由が一つに絞れない）');
    }
    const mixedShape = withCapturedConsole(() => execute([], options));
    if (mixedShape.value !== 1) {
      failures.push(
        `総数は自己整合するが読めない鍵を持つ基準を受け入れた（exit ${mixedShape.value}）`
      );
    }
    if (!mixedShape.output.includes('hand-written-nonsense.md')) {
      failures.push('読めない鍵を名指しで報告していない');
    }

    // compareReach 自体の対照（総数が合っていれば inconsistent にしない）
    const firstDocument = scanned.reach.documents[0];
    if (firstDocument === undefined) {
      failures.push('文書ごとの内訳が取れていない（面を測っていない）');
    } else {
      const consistent = compareReach(
        {
          documents: { [fixture.document]: ['frontend/src/present.ts'] },
          reachTotal: 1,
          candidateTotal: 2,
          entityTotal: 1,
          exempted: { [fixture.document]: 2 },
          exemptedTotal: 2,
          exemptedReferences: { [fixture.document]: ['frontend/src/gone.ts'] },
          exemptedDistinctTotal: 1,
          candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
          malformedDocuments: [],
          malformedExemptedReferences: [],
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

/**
 * 開示が「基準の値」と「現況の値」を取り違えていないこと（タスク 115.241 のレビューが要求）。
 *
 * 115.241 は母数（`candidateTotal`）を関門にしない判断の代わりに、基準記録時の母数と比を
 * 並べて出す信号を置いた。ところが対照は基準と現況の母数が一致する使い捨ての木で書かれており、
 * `baseline.candidateTotal` を `reach.candidateTotal` へ差し替える変異——信号が完全に消え、
 * 基準時と現況の差が永久に出なくなる変異——を当てても 38/38 緑だった（レビューが実測）。
 * ここでは**基準の母数を現況と異なる値で書き出し**、出力が基準の側を述べていることを固定する。
 *
 * 併せて「別表記の件数」（面 − 実体）も固定する。同じ理由で、定数 0 へ置き換えても
 * 38/38 緑だった（レビューが実測）。面 2 件・実体 1 件・別表記 1 件の木を用いる。
 *
 * 本対照を置いたうえで同じ二つの変異を当て直すと、母数・比の差し替えは 3 件の失敗で
 * 1/39 件が赤、別表記の定数化は 1 件の失敗で 1/39 件が赤になる
 *（いずれも 2026-09-02 にリポジトリルートで実測）。
 *
 * **タスク 115.293 が母数の履歴を足した。** 115.241 の信号は基準記録時の一点だけを述べるため、
 * 見える薄まりは前回の更新からの差に限られていた。ここでは履歴を**二点**持つ基準を書き出し、
 * 開示が `candidateHistory[0]`（起点）を述べていることを固定する。起点を末尾へ差し替える変異
 * （見える差が再び前回の更新からの分だけになる変異）はこの対照で赤くなる。
 */
function checkReachDisclosureQuotesTheBaseline(): string[] {
  const failures: string[] = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-disclosure-'));
  const document = `${SPEC_DIR}/sample/${DESIGN_DOC_NAME}`;
  const baselinePath = path.join(root, 'reach-baseline.json');
  const options = { root, baselinePath };
  try {
    fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'frontend', 'src', 'present.ts'), 'export {};\n');
    fs.mkdirSync(path.join(root, SPEC_DIR, 'sample'), { recursive: true });
    fs.writeFileSync(
      path.join(root, document),
      [
        '# Sample',
        '- 中核は `frontend/src/present.ts`、略記は `present.ts` である',
        '- `frontend/src/present.ts` の旧実装は当時こうだった',
        '',
      ].join('\n')
    );

    // 前提: 面 2 件（二通りの綴り）・実体 1 件・別表記 1 件・候補 2 件
    const scanned = run(options);
    if (scanned.reach.total !== 2 || scanned.reach.entityTotal !== 1) {
      failures.push(
        `前提が崩れている（面 ${scanned.reach.total} / 実体 ${scanned.reach.entityTotal}）`
      );
    }
    if (scanned.reach.candidateTotal !== 2) {
      failures.push(`前提が崩れている: 候補が 2 件でない（${scanned.reach.candidateTotal}）`);
    }

    // 基準の母数だけを現況（2 件）と異なる値で書き出す。母数は合否に用いないため合格するはず。
    // 履歴は二点持たせる——起点（面 2 / 母数 100）と末尾（面 2 / 母数 999）。
    // 末尾は reachTotal / candidateTotal と一致していなければ照合の前に拒否される（タスク 115.293）。
    const baselineCandidateTotal = 999;
    const originCandidateTotal = 100;
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          documents: { [document]: ['frontend/src/present.ts', 'present.ts'] },
          reachTotal: 2,
          candidateTotal: baselineCandidateTotal,
          entityTotal: 1,
          exempted: {},
          exemptedTotal: 0,
          exemptedReferences: {},
          exemptedDistinctTotal: 0,
          candidateHistory: [
            { recordedAt: '2026-08-01', reachTotal: 2, candidateTotal: originCandidateTotal },
            { recordedAt: '2026-09-05', reachTotal: 2, candidateTotal: baselineCandidateTotal },
          ],
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    const disclosed = withCapturedConsole(() => execute([], options));
    if (disclosed.value !== 0) {
      failures.push(`母数だけが違う基準で落ちた（exit ${disclosed.value}）。母数は合否に用いない`);
    }
    // (6) の信号: 出力は現況ではなく**基準記録時**の母数と比を述べていること
    if (!disclosed.output.includes(`基準記録時の母数は ${baselineCandidateTotal} 件`)) {
      failures.push('開示が基準記録時の母数を述べていない（比の薄まりの信号が消えている）');
    }
    if (disclosed.output.includes(`基準記録時の母数は ${scanned.reach.candidateTotal} 件`)) {
      failures.push('開示が基準記録時と称して現況の母数を述べている');
    }
    // 比も基準の側から導かれていること（2 / 999 = 0.2%。現況は 2 / 2 = 100.0%）
    if (!disclosed.output.includes('（比 0.2%）')) {
      failures.push('基準記録時の比が基準の母数から導かれていない');
    }
    // (1) と対になる別表記の件数（面 2 − 実体 1 = 1）
    if (!disclosed.output.includes('実体のファイルは 1 件で、残る 1 件は')) {
      failures.push('別表記の件数が実測と合わない（定数に置き換わっていないか）');
    }
    // 115.293: 開示は履歴の**起点**（先頭）から述べていること。末尾だけでは
    // 見える薄まりが前回の更新からの差に戻る。
    if (!disclosed.output.includes(`起点（2026-08-01）からの薄まり`)) {
      failures.push('開示が母数の履歴の起点を述べていない（薄まりが前回の更新からの差に戻る）');
    }
    if (
      !disclosed.output.includes(
        `母数は ${originCandidateTotal} 件から ${scanned.reach.candidateTotal} 件へ`
      )
    ) {
      failures.push('起点からの母数の動きが履歴の先頭と現況から導かれていない');
    }
    // 途中の点も落とさずに並べていること（履歴を末尾一点へ畳む変異を捕まえる）
    if (!disclosed.output.includes(`2026-09-05 面 2/母数 ${baselineCandidateTotal}`)) {
      failures.push('母数の推移が履歴の各点を並べていない');
    }
    if (!disclosed.output.includes(`2026-08-01 面 2/母数 ${originCandidateTotal}`)) {
      failures.push('母数の推移が履歴の起点を並べていない');
    }
    // 薄まりの実額そのもの。定数へ置き換えても、起点の母数から導いても赤くなる
    // （115.293 のレビュー後の走査で、いずれも是正前は 48/48 緑だった）。
    const drift = scanned.reach.candidateTotal - originCandidateTotal;
    if (!disclosed.output.includes(`${scanned.reach.candidateTotal} 件へ ${drift} 件動き`)) {
      failures.push('起点からの母数の動きが実測から導かれていない（定数に置き換わっていないか）');
    }
    // 起点の面を**今の母数**に置いた比であること。起点の母数で割ると薄まりが消える
    const dilutedRatio = `${((2 / scanned.reach.candidateTotal) * 100).toFixed(1)}%`;
    const originRatio = `${((2 / originCandidateTotal) * 100).toFixed(1)}%`;
    if (dilutedRatio === originRatio) {
      failures.push('前提が崩れている: 薄まった比と起点の比が同値で、取り違えを固定できない');
    }
    if (!disclosed.output.includes(`比は ${dilutedRatio} である（起点の比は ${originRatio}）`)) {
      failures.push('起点の面を今の母数へ置いた比が出ていない（薄まりの信号が消えている）');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 免除の開示が「基準の値」と「現況の値」を取り違えず、定数でもないこと（タスク 115.293 のレビュー）。
 *
 * 115.241 は面の側について {@link checkReachDisclosureQuotesTheBaseline} を置いた。
 * **115.293 が足した免除の開示には同型の対照が無く、レビューが二つの穴を実測した**——
 * `いま免除している件数: 延べ … / distinct …` の distinct を定数 `0` へ置き換えても、
 * `差 …` を定数 `0` へ置き換えても、自己検査は 46/46 緑・EXIT=0 のままだった。
 * すなわち関門は偽の件数を印字しながら合格を出せた。**判断の根拠そのものである差の件数が
 * 腐っても誰も気付かない。** `scripts/design-measurements.json` の宣言は基準の JSON を読むため、
 * 印字の側の陳腐化は捕らえない。
 *
 * ここでは**五つの値がすべて相異なる**木を用いる——現況は延べ 3 件・distinct 1 件・差 2 件、
 * 基準は延べ 5 件・distinct 4 件である。どれか一つを定数にしても、現況と基準を取り違えても、
 * 差を別の値から導いても赤くなる。免除が基準より狭まる向きなので合否は緑のままであり、
 * **開示だけを見る対照になる**。
 */
function checkExemptedDisclosureQuotesTheBaseline(): string[] {
  const failures: string[] = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-exempt-disclosure-'));
  const document = `${SPEC_DIR}/sample/${DESIGN_DOC_NAME}`;
  const baselinePath = path.join(root, 'reach-baseline.json');
  const options = { root, baselinePath };
  try {
    fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, SPEC_DIR, 'sample'), { recursive: true });
    fs.writeFileSync(
      path.join(root, document),
      [
        '# Sample',
        '- 閲覧は `frontend/src/gone.ts` が担っていた',
        '- `frontend/src/gone.ts` は撤去済み',
        '- 続きも `frontend/src/gone.ts` が受け持っていた',
        '',
      ].join('\n')
    );

    // 前提: 免除は延べ 3 件・distinct 1 件・差 2 件。実在の失格は 0 件
    const scanned = run(options);
    if (scanned.exemptedCount !== 3 || scanned.reach.exemptedDistinctTotal !== 1) {
      failures.push(
        `前提が崩れている（延べ ${scanned.exemptedCount} /` +
          ` distinct ${scanned.reach.exemptedDistinctTotal}）`
      );
    }
    if (scanned.findings.length !== 0) {
      failures.push(`前提が崩れている: 失格が 0 件でない（${scanned.findings.length}）`);
    }

    // 基準は現況より広い（延べ 5 件・distinct 4 件）。狭まる向きなので合否は緑のはず。
    // 現況の集合は基準の部分集合であること——増える側が一件でもあれば赤くなり対照にならない。
    const baselineExemptedTotal = 5;
    const baselineExemptedDistinctTotal = 4;
    const baselineCandidateTotal = 42;
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          documents: {},
          reachTotal: 0,
          candidateTotal: baselineCandidateTotal,
          entityTotal: 0,
          exempted: { [document]: baselineExemptedTotal },
          exemptedTotal: baselineExemptedTotal,
          exemptedReferences: {
            [document]: [
              'frontend/src/alpha.ts',
              'frontend/src/beta.ts',
              'frontend/src/gamma.ts',
              'frontend/src/gone.ts',
            ],
          },
          exemptedDistinctTotal: baselineExemptedDistinctTotal,
          candidateHistory: [
            { recordedAt: '2026-09-05', reachTotal: 0, candidateTotal: baselineCandidateTotal },
          ],
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    const disclosed = withCapturedConsole(() => execute([], options));
    if (disclosed.value !== 0) {
      failures.push(
        `免除が狭まっただけで落ちた（exit ${disclosed.value}）。狭まる向きは助言のみである`
      );
    }
    // 現況の延べ・現況の distinct・基準の延べ・基準の distinct・差の五値をそれぞれ固定する
    if (
      !disclosed.output.includes(
        `延べ ${scanned.exemptedCount} 件（基準 ${baselineExemptedTotal} 件）`
      )
    ) {
      failures.push(
        '免除の延べの開示が実測と基準の対で述べられていない（定数に置き換わっていないか）'
      );
    }
    if (
      !disclosed.output.includes(
        `distinct ${scanned.reach.exemptedDistinctTotal} 件（基準 ${baselineExemptedDistinctTotal} 件）`
      )
    ) {
      failures.push(
        '免除の distinct の開示が実測と基準の対で述べられていない（定数に置き換わっていないか）'
      );
    }
    const gap = scanned.exemptedCount - scanned.reach.exemptedDistinctTotal;
    if (!disclosed.output.includes(`差 ${gap} 件`)) {
      failures.push(
        `延べと distinct の差 ${gap} 件が開示されていない（判断の根拠そのものが腐っても気付けない）`
      );
    }
    // 現況と基準を取り違えていないこと（五値がすべて相異なるので取り違えは字面に出る）
    if (
      disclosed.output.includes(
        `延べ ${baselineExemptedTotal} 件（基準 ${scanned.exemptedCount} 件）`
      )
    ) {
      failures.push('免除の延べの開示が現況と基準を取り違えている');
    }
    if (
      disclosed.output.includes(
        `distinct ${baselineExemptedDistinctTotal} 件（基準 ${scanned.reach.exemptedDistinctTotal} 件）`
      )
    ) {
      failures.push('免除の distinct の開示が現況と基準を取り違えている');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 基準の読み取りが壊れた形を黙って受け入れないこと（タスク 115.293 のレビュー）。
 *
 * `loadReachBaseline` の型ガードは、いずれも**終了コードでは殺せない**——壊れた値を
 * 受け入れた場合も別の条件が赤を出すため、`execute` の返り値だけを見る対照では
 * 変異が素通りする。**ここは読み取りの結果そのものを直に見る。**
 *
 * 併せて「基準が空のときは手書き換えとみなさない」ことも直に固定する。この判定を
 * 常に真へ倒す変異は**関門を厳しくする向き**であり終了コードは動かないが、
 * 出す診断が「面が広がった」から「基準が自己整合しない」へすり替わる。
 */
function checkBaselineParsingRejectsMalformedShapes(): string[] {
  const failures: string[] = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-path-refs-parse-'));
  const write = (name: string, payload: unknown): string => {
    const target = path.join(root, name);
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    return target;
  };
  try {
    // (1) 配列ではあるが要素が文字列でない集合は「読めた」ことにしない。
    // 面の側と免除の側の双方が同じ型ガードを通る。
    const nonStrings = loadReachBaseline(
      write('non-strings.json', {
        documents: { 'a/design.md': [1, 2] },
        exemptedReferences: { 'b/design.md': [999] },
      })
    );
    if (nonStrings.malformedDocuments.length !== 1) {
      failures.push(
        `文字列でない要素を持つ面の集合を受け入れた（malformedDocuments ${nonStrings.malformedDocuments.length} 件）`
      );
    }
    if (nonStrings.malformedExemptedReferences.length !== 1) {
      failures.push(
        `文字列でない要素を持つ免除の集合を受け入れた（malformedExemptedReferences ${nonStrings.malformedExemptedReferences.length} 件）`
      );
    }
    if (Object.keys(nonStrings.exemptedReferences).length !== 0) {
      failures.push('読めない免除の集合が、読めたものとして残っている');
    }

    // (2) 対照: 文字列の配列は読める（(1) が常に malformed で自明に通っていない）
    const readable = loadReachBaseline(
      write('readable.json', {
        documents: { 'a/design.md': ['x.ts'] },
        exemptedReferences: { 'b/design.md': ['y.ts'] },
      })
    );
    if (
      readable.malformedDocuments.length !== 0 ||
      readable.malformedExemptedReferences.length !== 0
    ) {
      failures.push('文字列の配列まで読めないものとして落としている（陰性対照が立たない）');
    }
    if ((readable.exemptedReferences['b/design.md'] ?? []).length !== 1) {
      failures.push('読めるはずの免除の集合が落ちている');
    }

    // (3) 履歴の各欄の型ガード。日付が文字列でない項・件数が数でない項は落とすこと。
    // 落とさなければ、開示の起点が壊れた値のまま印字される。
    const badRecordedAt = loadReachBaseline(
      write('bad-recorded-at.json', {
        candidateHistory: [{ recordedAt: 5, reachTotal: 1, candidateTotal: 2 }],
      })
    );
    if (badRecordedAt.candidateHistory.length !== 0) {
      failures.push('履歴の日付が文字列でない項を受け入れた');
    }
    const badTotals = loadReachBaseline(
      write('bad-totals.json', {
        candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 'いち', candidateTotal: 2 }],
      })
    );
    if (badTotals.candidateHistory.length !== 0) {
      failures.push('履歴の件数が数でない項を受け入れた');
    }
    // 履歴そのものが配列でない形も、例外ではなく「履歴なし」として扱うこと
    const notAnArray = loadReachBaseline(
      write('history-not-an-array.json', { candidateHistory: { recordedAt: '2026-09-05' } })
    );
    if (notAnArray.candidateHistory.length !== 0) {
      failures.push('配列でない履歴を受け入れた');
    }
    // 対照: 整った項は残る（(3) が常に空で自明に通っていない）
    const goodHistory = loadReachBaseline(
      write('good-history.json', {
        candidateHistory: [{ recordedAt: '2026-09-05', reachTotal: 1, candidateTotal: 2 }],
      })
    );
    if (goodHistory.candidateHistory.length !== 1) {
      failures.push('整った履歴の項まで落としている（陰性対照が立たない）');
    }

    // (4) 空の基準は手書き換えとみなさない。面が広がった旨の診断を出させるためである。
    const emptyBaseline = loadReachBaseline(write('empty.json', {}));
    const emptyComparison = compareReach(emptyBaseline, summariseReach([]));
    if (emptyComparison.inconsistent) {
      failures.push('空の基準を手書き換えと判定している（面が広がった旨の診断がすり替わる）');
    }

    // (5) 履歴が無い基準では、その旨を断ること。黙って何も出さないと
    // 「起点からの薄まりが読める」という本検査の主張が静かに空になる。
    fs.mkdirSync(path.join(root, SPEC_DIR, 'sample'), { recursive: true });
    fs.writeFileSync(
      path.join(root, SPEC_DIR, 'sample', DESIGN_DOC_NAME),
      '# Sample\n- 特記なし\n'
    );
    const noHistory = withCapturedConsole(() =>
      execute([], { root, baselinePath: path.join(root, 'empty.json') })
    );
    if (noHistory.value !== 0) {
      failures.push(`空の基準と空の文書で落ちた（exit ${noHistory.value}）`);
    }
    if (!noHistory.output.includes('基準に履歴がない')) {
      failures.push('履歴が無い基準でその旨を断っていない（薄まりが測れないことが読めない）');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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
  if (!stdout.includes(`実体のファイルは ${expected.entityTotal} 件`)) {
    failures.push(`開示された実体の数が実測（${expected.entityTotal} 件）と一致しない`);
  }
  // 面に入る裸の名前の曖昧性は、開示の文言が実測の向きと一致していること（タスク 115.241）
  const ambiguous = expected.ambiguousBareNames;
  if (ambiguous.length === 0) {
    if (!stdout.includes('同名の実在が 1 件だけである')) {
      failures.push('曖昧な裸の名前が 0 件のときの開示が実測と一致しない');
    }
  } else {
    if (!stdout.includes(`裸のファイル名のうち ${ambiguous.length} 件は同名の実在が複数ある`)) {
      failures.push(`開示された曖昧な裸の名前が実測（${ambiguous.length} 件）と一致しない`);
    }
    for (const entry of ambiguous) {
      if (entry.name.includes('/')) {
        failures.push(`ルート相対パスを曖昧な裸の名前として数えている: ${entry.name}`);
      }
      if (entry.matches < 2) {
        failures.push(`一致が 1 件以下のものを曖昧と数えている: ${entry.name}`);
      }
    }
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
  if (baseline.entityTotal !== expected.entityTotal) {
    failures.push(
      `基準の実体（${baseline.entityTotal} 件）が実測（${expected.entityTotal} 件）と食い違う`
    );
  }
  if (baseline.malformedDocuments.length !== 0) {
    failures.push(
      `リポジトリ本体の基準を面の集合として読めない: ${baseline.malformedDocuments.join(', ')}`
    );
  }
  return failures;
}

/**
 * 前提の確認（`reportPreconditions`）が `main` へ実際に結線されていること（タスク 115.242）。
 *
 * ## なぜ「守り手を守る守り手」が要るのか
 *
 * 前提の確認は配列への登録ではなく直列の手続きなので、要素を消すだけの真空にはならない。
 * だが**呼び出しごと消す**、**返り値を捨てて呼ぶだけにする**、**対照より後ろへ移す**という
 * 三つの経路では、前提が結果に一切効かないまま緑で通る。差し戻し 1 回目のレビューが
 * 実測した穴（呼び出しブロックの撤去で EXIT=0・確認行 38 件なのに「42/42」と自称）は
 * これである。ここはその三つを本ファイル自身のソースから読んで塞ぐ。
 *
 * ## なぜこの形を選んだか（選ばなかった形で何が守れないか）
 *
 * - **採った形**: `function check` 宣言にすること。`structuralWiringFailures` が
 *   `STRUCTURAL` への結線を強制し、`STRUCTURAL` は `emptyRegistryFailures` と
 *   `structuralWiringFailures` が空にできない。守り手と守られる側が相互に施錠される。
 * - **`reportPreconditions` を `GROUPS` の一要素として載せる**: 守り手が守られる側と
 *   同じレジストリに載るため、`STRUCTURAL` を空にすると守り手ごと消える。115.242 の
 *   起票文が名指しで禁じた形であり、採らない。
 * - **前提の件数を定数で貼る（是正前の `PRECONDITION_COUNT`）**: 実行と切り離された数なので、
 *   前提が一件も走らなくても総数が動かず、開示が偽になる。差し戻しの原因そのもの。
 * - **サブプロセスで走らせて出力行を数える**: 出力の文言に依存し、文言を変えると静かに
 *   空振りする。かつ本ファイル内で完結しないため、`STRUCTURAL` による施錠が効かない。
 *
 * ## 残る限界
 *
 * この関数ごと（宣言と `STRUCTURAL` の要素をまとめて）消す整理は通る。`STRUCTURAL` の
 * 下限は「宣言されている `check*` を一つ残らず結線していること」であり、宣言が消えれば
 * 下限も一緒に縮むためである。件数の下限を貼らないという 115.222 の判断の裏返しであり、
 * ここでは塞がない。
 */
function checkPreconditionsAreWired(): string[] {
  const failures: string[] = [];
  const source = stripComments(readOwnSource());

  const mainBody = sliceFunctionBody(source, '\nfunction main(');
  const mainSliceFailures = bodySliceFailures('main', mainBody);
  if (mainSliceFailures.length > 0 || mainBody === null) return mainSliceFailures;

  // (a) 呼び出しが在ること／(b) 返り値を受け取っていること
  const call = /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*reportPreconditions\(\)/.exec(mainBody);
  if (call === null) {
    failures.push(
      mainBody.includes('reportPreconditions(')
        ? 'main が reportPreconditions() の返り値を受け取っていない（呼ぶだけでは前提が結果に効かない）'
        : 'main に reportPreconditions() の呼び出しが無い（前提の確認が走らない）'
    );
    return failures;
  }
  const binding = call[1] as string;

  // (c) 対照より前に走ること
  const loopIndex = mainBody.indexOf(CORPUS_LOOP);
  if (loopIndex < 0) {
    failures.push('main に GROUPS を走らせる繰り返しが無い（対照の実行が消えた疑い）');
  } else if (call.index > loopIndex) {
    failures.push('reportPreconditions() の呼び出しが対照の実行より後にある（前提を先に断てない）');
  }

  // (d) 関門の条件が、失敗（`failed > 0`）と前提そのものの真空（`ran === 0`）の両方を見ていること。
  // 是正前は `failed > 0` の存在だけを `[^)]*` の緩い窓で見ていたため、条件へ ` && false` の
  // ような無効化を足す余地が残っていた。条件そのものを逐語で固定する（差し戻し 2 回目）。
  const expectedGate = `${binding}.ran === 0 || ${binding}.failed > 0`;
  const gateCondition = new RegExp(`if\\s*\\(([^)]*${binding}\\.(?:ran|failed)[^)]*)\\)`).exec(
    mainBody
  );
  if (gateCondition === null) {
    failures.push(`main に ${binding} を条件にした関門が無い（前提が崩れても止まらない）`);
  } else {
    const condition = (gateCondition[1] as string).replace(/\s+/g, ' ').trim();
    if (condition !== expectedGate) {
      failures.push(`main の関門の条件が「${expectedGate}」と一致しない（実際:「${condition}」）`);
    }

    // (e) 関門の `if` **ブロックの中**に `process.exit(1)` が在ること。
    // 是正前は条件から 600 文字の窓で `process.exit(1)` を探していたため、関門とは無関係な
    // 後段の `if (failed > 0)` の中の `process.exit(1)`（条件から 533 文字）を拾って
    // 緑で通していた（差し戻し 2 回目の finding 2。実測で確認した）。窓を廃し、
    // `sliceBraceBlock` の波括弧の対応で関門のブロックそのものへ範囲を限る。
    // `process.exitCode = 1` などの別の停止は一致しない（安全側に倒す）。
    const afterCondition = gateCondition.index + gateCondition[0].length;
    const openIndex = mainBody.indexOf(OPEN_BRACE, afterCondition);
    const gateBlock =
      openIndex >= 0 && mainBody.slice(afterCondition, openIndex).trim() === ''
        ? sliceBraceBlock(mainBody, afterCondition)
        : null;
    if (gateBlock === null) {
      failures.push('main の関門が波括弧のブロックになっていない（範囲を限れない）');
    } else if (!gateBlock.includes('process.exit(1)')) {
      failures.push(
        'main の関門のブロックの中に process.exit(1) が無い（前提が崩れても止まらない）'
      );
    } else {
      // ブロックの中に在るだけでは足りない。死んだ分岐へ入れれば
      // 「前提が崩れています」と印字したうえで対照を走らせ EXIT=0 にできる
      // （自分で当てた変異で実測: `if (Date.now() < 0) process.exit(1);` で 35/35 緑・EXIT=0）。
      failures.push(...serialStatementFailures(gateBlock, 'process.exit(1);', '関門の停止'));
    }

    if (loopIndex >= 0 && gateCondition.index > loopIndex) {
      failures.push('前提の関門が対照の実行より後にある（前提が崩れたまま対照が走る）');
    }
  }

  // (f) 総数が実際に走った件数から導かれていること（実行と切り離した定数で総数を偽らせない）
  if (!new RegExp(`const total = [^;]*${binding}\\.ran`).test(mainBody)) {
    failures.push(
      `main の総数が ${binding}.ran から導かれていない（実行と切り離された定数で総数を偽れる）`
    );
  }

  failures.push(...preconditionEntryWiringFailures(source));
  return failures;
}

/**
 * `reportPreconditions` の本体が、前提の入口となる `*Failures` を過不足なく一度ずつ
 * 呼んでいること（タスク 115.242）。
 *
 * 下限は件数ではなく**本ファイルが宣言する `*Failures` の集合**から導く。ほかの
 * `*Failures` の本体から呼ばれているものは補助（`emptyPopulationFailures`）とみなして
 * 入口から除く。これにより前提を一件消す破壊も、重複して一件足す破壊も赤くなり、
 * 新しい前提を関数ごと足す正当な追加は緑のまま通る。
 */
function preconditionEntryWiringFailures(strippedSource: string): string[] {
  const declared = [...strippedSource.matchAll(/^function ([A-Za-z0-9]*Failures)\s*\(/gm)].map(
    (match) => match[1] as string
  );
  if (declared.length === 0) {
    return ['本ファイルに Failures で終わる関数の宣言が一つも無い（下限を導く語彙が消えた）'];
  }
  const body = sliceFunctionBody(strippedSource, '\nfunction reportPreconditions(');
  const sliceFailures = bodySliceFailures('reportPreconditions', body);
  if (sliceFailures.length > 0 || body === null) return sliceFailures;

  // `reportPreconditions` 以外の関数から呼ばれている `*Failures` は補助とみなし、入口から除く
  // （`emptyPopulationFailures` や `preconditionEntryWiringFailures` がこれに当たる）。
  const others = [...strippedSource.matchAll(/^(?:export )?function ([A-Za-z0-9_]+)\s*\(/gm)]
    .map((match) => match[1] as string)
    .filter((name) => name !== 'reportPreconditions');
  const failures: string[] = [];
  const helpers = new Set<string>();
  for (const name of others) {
    const otherBody = sliceFunctionBody(strippedSource, `\nfunction ${name}(`);
    // 切り出しが壊れた本体を黙って読み飛ばすと、補助の判定が甘くなって入口が消える。
    failures.push(...bodySliceFailures(name, otherBody));
    if (otherBody === null) continue;
    for (const candidate of declared) {
      if (candidate !== name && otherBody.includes(`${candidate}(`)) helpers.add(candidate);
    }
  }
  const entries = declared.filter((name) => !helpers.has(name));
  if (entries.length === 0) {
    failures.push('前提の入口となる関数が一つも無い（前提そのものが空になった）');
    return failures;
  }

  for (const name of entries) {
    const referenced = body.split(`${name}(`).length - 1;
    if (referenced !== 1) {
      failures.push(
        `reportPreconditions が ${name} を ${referenced} 回呼んでいる（過不足なく 1 回であること）`
      );
    }
  }
  const reportCalls = (body.match(/\breport\(/g) ?? []).length;
  if (reportCalls !== entries.length) {
    failures.push(
      `reportPreconditions の report( の呼び出しが ${reportCalls} 件で、前提の入口 ${entries.length} 件と一致しない`
    );
  }

  // 実績を返す変数を、`return` の形そのものから取る。以下の数え上げはすべてこの変数に縛る
  // （別の器へ集計する `bogus.failed += report(...)` のような形を素通りさせないため）。
  const returned = /return ([A-Za-z0-9_]+);/.exec(body);
  if (returned === null) {
    failures.push('reportPreconditions が実績の記録を返していない（返り値の形が変わった疑い）');
    return failures;
  }
  const tally = returned[1] as string;

  // finding 1（差し戻し 2 回目）: `report(` の件数だけを数えていたため、
  // `tally.failed +=` を 1 件だけ外す破壊が 43/43 緑で通っていた。**集計を伴う形**を数える。
  const aggregateToken = `${tally}.failed += report(`;
  const aggregated = body.split(aggregateToken).length - 1;
  if (aggregated !== reportCalls) {
    failures.push(
      `reportPreconditions の report( ${reportCalls} 件のうち ${tally}.failed へ集計しているのは ${aggregated} 件である（呼ぶだけでは失敗が伝わらない）`
    );
  }

  const incrementToken = `${tally}.ran += 1;`;
  const increments = body.split(incrementToken).length - 1;
  if (increments !== reportCalls) {
    failures.push(
      `reportPreconditions の ${tally}.ran の加算が ${increments} 件で、report( の呼び出し ${reportCalls} 件と一致しない（総数が実行とずれる）`
    );
  }

  // 実績へ触れる形が上の二つだけであること（減算や再代入で握り潰す余地を残さない）
  const touches = body.split(`${tally}.`).length - 1;
  if (touches !== aggregated + increments) {
    failures.push(
      `reportPreconditions が ${tally} に ${touches} 回触れており、集計 ${aggregated} 件と加算 ${increments} 件の合計と一致しない（余計な書き換えがある）`
    );
  }

  // finding 3（差し戻し 2 回目）: 件数の三者一致を保ったまま 1 件を死んだ分岐へ入れると、
  // 43/43 緑のまま 42 件しか走らなかった。各出現が直列の手続きであることを要求する。
  failures.push(...serialStatementFailures(body, incrementToken, `${tally}.ran の加算`));
  failures.push(...serialStatementFailures(body, aggregateToken, `${tally}.failed への集計`));
  return failures;
}

/** 註を落としたソース（構造だけを見るため。註の中の記述に反応させない） */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// 波括弧そのものを文字リテラルで書くと、この下の走査器が**自分のソースを読むとき**に
// その文字列の中の波括弧まで数えてしまい、本体の切り出しが壊れる（差し戻し 2 回目の是正中に
// 実測で踏んだ: `indexOf('{', ...)` を書いた時点で `checkPreconditionsAreWired` の
// 本体が切り出せなくなった）。一行に開きと閉じを一つずつ置いて釣り合わせ、以後はこの定数を使う。
const [OPEN_BRACE, CLOSE_BRACE] = ['{', '}'];

/** `fromIndex` 以降の最初の開き波括弧から、対応する閉じ波括弧までの中身を返す */
function sliceBraceBlock(source: string, fromIndex: number): string | null {
  const open = source.indexOf(OPEN_BRACE, fromIndex);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === OPEN_BRACE) depth += 1;
    else if (character === CLOSE_BRACE) {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

/**
 * 切り出した本体が健全であること。`null`（対応が取れない）と、次の宣言まで走り抜けた
 * 場合（文字列の中の波括弧を数えた疑い）の両方を失敗として挙げる。
 *
 * 走り抜けを見るのは、本体が長く出ると後続の関数の呼び出しまで抱き込み、
 * `preconditionEntryWiringFailures` の「補助」判定が甘くなって入口が消えるためである。
 */
function bodySliceFailures(name: string, body: string | null): string[] {
  if (body === null) return [`${name} の本体を切り出せない（波括弧の対応が崩れている疑い）`];
  if (body.includes('\nfunction ')) {
    return [`${name} の本体の切り出しが次の宣言まで届いている（文字列の中の波括弧の疑い）`];
  }
  return [];
}

/** 宣言から関数本体（波括弧の中）を切り出す */
function sliceFunctionBody(source: string, declaration: string): string | null {
  const start = source.indexOf(declaration);
  if (start < 0) return null;
  return sliceBraceBlock(source, start + declaration.length);
}

/** `openIndex` の `(` に対応する `)` の位置。見つからなければ -1 */
function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * 与えたトークンの各出現が、本体の**直列の手続き**として在ることを確かめる（タスク 115.242）。
 *
 * 三つを同時に要求する:
 *   (i) 波括弧の深さが 0（`if` / `for` / `try` のブロックや入れ子の関数へ入れていない）
 *   (ii) 文の先頭（直前の `;` `{` `}` からそこまでが空白だけ。波括弧を伴わない
 *        `if (...) tally.failed += report(...)` のような形をここで落とす）
 *   (iii) トークンが `(` で終わるなら、その呼び出しの閉じ括弧の直後が `;`
 *        （`report(...) * 0` のように返り値を加工して握り潰す形を落とす）
 *
 * (i) だけでは波括弧を伴わない分岐を、(ii) だけでは `try {}` の入れ子を素通りさせる。
 * 三者を揃えて初めて「構造の下限を保ったまま実行だけ止める」手口を塞げる
 * （差し戻し 2 回目の finding 3。実測で `if (Date.now() < 0)` を当てて確認した）。
 */
function serialStatementFailures(body: string, token: string, label: string): string[] {
  const failures: string[] = [];
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === OPEN_BRACE) {
      depth += 1;
      continue;
    }
    if (character === CLOSE_BRACE) {
      depth -= 1;
      continue;
    }
    if (!body.startsWith(token, index)) continue;
    if (depth !== 0) {
      failures.push(`${label} が入れ子のブロックの中に在る（直列の手続きでなくなっている）`);
      continue;
    }
    const before = body.slice(0, index);
    const boundary = Math.max(
      before.lastIndexOf(';'),
      before.lastIndexOf(OPEN_BRACE),
      before.lastIndexOf(CLOSE_BRACE)
    );
    if (before.slice(boundary + 1).trim() !== '') {
      failures.push(`${label} が文の先頭に無い（条件や式の中へ入れられている）`);
      continue;
    }
    if (!token.endsWith('(')) continue;
    const close = matchingParen(body, index + token.length - 1);
    const tail = close < 0 ? '' : body.slice(close + 1).trimStart();
    if (!tail.startsWith(';')) {
      failures.push(`${label} の文が呼び出しの直後で終わっていない（返り値が加工されている疑い）`);
    }
  }
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
    name: '免除が延べ件数と distinct の集合の両方で測られている',
    expected: false,
    custom: checkExemptedSetIsMeasured,
  },
  {
    name: '免除の入れ替え（延べは不変）を関門が捕まえ、集合と履歴の手書き換えを拒む',
    expected: false,
    custom: checkExemptedSetBaselineGate,
  },
  {
    name: '実体のファイル数が面の件数とは別に測られている',
    expected: false,
    custom: checkEntityCountIsMeasured,
  },
  {
    name: '裸の名前だけで面に入る参照の曖昧性が測られている',
    expected: false,
    custom: checkAmbiguousBareNamesAreMeasured,
  },
  {
    name: '実在検査に失格があるツリーでは基準の更新を拒否する',
    expected: false,
    custom: checkUpdateRefusesWhileFailing,
  },
  {
    name: '開示が基準記録時の母数・比と別表記の件数を述べている（現況や定数ではない）',
    expected: false,
    custom: checkReachDisclosureQuotesTheBaseline,
  },
  {
    name: '免除の開示が実測と基準の対を述べている（現況の取り違えや定数ではない）',
    expected: false,
    custom: checkExemptedDisclosureQuotesTheBaseline,
  },
  {
    name: '基準の読み取りが壊れた形を黙って受け入れない（集合の要素・履歴の各欄・空の基準）',
    expected: false,
    custom: checkBaselineParsingRejectsMalformedShapes,
  },
  {
    name: '本体を起動して、開示される面の件数と基準が実測と一致する',
    expected: false,
    custom: checkReachReportedBySubprocess,
  },
  {
    name: '前提の確認が入口へ結線されている（呼び出し・返り値・順序・総数の導出）',
    expected: false,
    custom: checkPreconditionsAreWired,
  },
];

/** 実行される対照の一覧。ここから外れたレジストリは走らない（registryWiringFailures が見る） */
const GROUPS: ReadonlyArray<{ title: string; cases: readonly Case[] }> = [
  { title: '捕捉しなければならない書き方（115.173 の是正前の実物）', cases: MUST_DETECT },
  { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
  { title: '走査対象と前提条件', cases: STRUCTURAL },
];

// ============================================================================
// 対照レジストリそのものの前提（タスク 115.242）
// ============================================================================
//
// 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。
// 何も主張していない状態であり、前提の崩壊として赤くしなければならない
// （AI運用7原則 第3原則）。是正前の実測（2026-09-02。リポジトリルート）:
//   - `const STRUCTURAL: Case[] = []` を空にする → 22/22 緑・EXIT=0
//   - `checkNoFindingsNarrowing` の中の `bodies` を空にする → 39/39 緑・EXIT=0
//   - `main` の `groups` を空にする → 0/0 緑・EXIT=0
//
// **守り手を守られる側と同じレジストリへ置かない。** 以前は「陽性対照が空でない」という
// 守り手が `STRUCTURAL` の一要素として登録されていたため、`STRUCTURAL` を空にすると
// 守り手ごと消えた。ここでは前提の確認を配列への登録ではなく `reportPreconditions` の
// 直列の手続きとして書き、`main` の冒頭で対照より先に走らせる。手続きを消すには
// 呼び出しそのものを削るしかなく、要素を消すだけの真空にはならない。
//
// **呼び出しごと外す経路は `checkPreconditionsAreWired` が塞ぐ**（差し戻し 1 回目の是正）。
// 直列の手続きにしても、`main` から呼び出しごと消す・返り値を捨てる・対照より後ろへ移す、
// という三つの経路では前提が結果に効かない。その守り手は `function check` 宣言なので
// `structuralWiringFailures` が `STRUCTURAL` への結線を強制し、`STRUCTURAL` は
// `emptyRegistryFailures` と `structuralWiringFailures` が空にできない。相互に施錠される。
//
// **総数は実行から導く。** 是正前は `const PRECONDITION_COUNT = 4` を足していたため、
// 前提が一件も走らなくても総数が動かず「42/42」と自称できた。いまは
// `reportPreconditions` が実際に走らせた件数（`ran`）を返し、`main` の総数はそこから導く。
//
// **下限をどこに置くか（タスク 115.222 と作法を揃える）。** 件数を貼ると、同じことを
// 見ている重複した対照を減らす正当な変更まで止まる。そこで導ける側は構造から導く:
//   - `STRUCTURAL`: 本ファイルが宣言する `check*` の検査関数を一つ残らず結線していること。
//     空にする破壊も 1 件へ削る破壊も赤くなる。語彙は本ファイルの宣言そのものなので、
//     検査を増減させれば下限も自動で追随する。
//     **限界（実測 2026-09-02）**: 語彙は行頭の `function check` という宣言の形から取る。
//     ただし**結線済みの検査をアロー式（`const checkX = () => ...`）へ書き換える破壊は
//     素通りしない**。`STRUCTURAL` 側の `.name` は残り、宣言側から消えるため
//     `structuralWiringFailures` の「宣言の無い検査を指している」分岐が赤くなる
//     （実測: `checkEmptyScanFails` を書き換えて EXIT=1、その 1 行だけが落ちた）。
//     **素通りするのは、未結線の新しいアロー式検査を足す場合だけである**
//     （実測: `const checkNeverWired = () => [...]` を足して 43/43 緑・EXIT=0）。
//     本ファイルの検査関数は全て `function` 宣言で書くこと。
//   - `NARROWING_WATCHED_BODIES`: 本体が宣言する関数を一つ残らず名指ししていること。
//     本体に関数が増えれば下限も自動で追随する。**限界**: 同じく行頭の関数宣言の形から
//     取るため、本体が関数を `const` の式へ書き換えるとその関数は下限から外れる。
//   - 前提そのものの下限（`reportPreconditions` の中身）: 本ファイルが宣言する
//     `*Failures` のうち、ほかの `*Failures` から呼ばれていないもの（＝前提の入口）を
//     過不足なく一度ずつ呼んでいること。前提を一件消す破壊も、重複して一件足す破壊も
//     赤くなり、前提を関数ごと新設して足す正当な追加は通る。
//   - `MUST_DETECT` / `MUST_NOT_DETECT`: 下限を導ける語彙が本体側に無いため
//     「空でないこと」に留める。**限界**: 22 件から 1 件へ削る破壊は止まらない。
//     根拠の無い件数を貼らないという 115.222 の判断をそのまま引き継ぐ。
//
// **差し戻し 2 回目で塞いだ見逃し（いずれも「破壊されているのに緑」だった。実測 2026-09-02）**:
//   1. `tally.failed +=` を 1 件だけ外す（`report` は呼ぶ）→ 是正前 44/44 相当で緑・EXIT=0。
//      `report(` の件数しか数えていなかった。いまは**集計を伴う形**（`tally.failed += report(`）
//      を数え、素の `report(` の件数と一致することを要求する。
//   2. 前提の関門から `process.exit(1);` を削る → 是正前は緑・EXIT=0。条件から
//      `[\s\S]{0,600}` の窓で `process.exit(1)` を探していたため、関門とは無関係な後段の
//      `if (failed > 0)` の中の一致（条件から 533 文字）を拾っていた。いまは窓を廃し、
//      `sliceBraceBlock` で**関門の `if` ブロックそのもの**へ範囲を限る。
//   3. 前提 1 件を死んだ分岐へ入れる（`ran += 1` は据え置き）→ 是正前は 44/44 緑・EXIT=0 で
//      実際には 1 件少なく走っていた。件数の三者一致を保ったまま実行だけ止められた。いまは
//      `serialStatementFailures` が各出現を**直列の手続き**として要求する。
//
// **上と同じ手口で自分で見つけ、あわせて塞いだもの（実測 2026-09-02）**:
//   - 別の器へ集計する（`bogus.failed += report(...)`）／返り値を加工する（`... * 0`）／
//     あとから `tally.failed = 0` で打ち消す → 実績を返す変数を `return` の形から取り、
//     その変数へ触れる回数まで数えることで塞いだ。
//   - 関門の `process.exit(1)` を死んだ分岐へ入れる → ブロックの中に在るだけでなく、
//     そこで直列の文であることを要求して塞いだ。
//   - **対照の繰り返しごと死んだ分岐で包む／関門の直後に `return` を置く。**
//     これは `STRUCTURAL` に居る `checkPreconditionsAreWired` **自身が黙る**穴だった
//     （守り手が守られる側の実行にぶら下がっていた）。常に走る前提の側へ
//     `corpusExecutionFailures` を置いて塞いだ。
//   - 対照側の集計（`failed += report(testCase.name, runCase(testCase));`）を外す／
//     死んだ分岐へ入れる → `corpusInnerFailures` で内側の繰り返しまで降りて塞いだ。
//
// **是正後も残る限界（いずれも実測 2026-09-02）。**
// **この一覧が網羅的なのは「`main` の中で前提と対照がどう結線されているか」についてだけである。**
// 入口そのものの呼び出しを消す形は含まれない（後述の「一覧の外」を読むこと）。
// その限定のもとで、一覧の中の限界はいずれも「判定する側そのものを書き換える／
// 宣言ごと消す」一つの形に帰着する:
//   - **検査関数を宣言ごと（`STRUCTURAL` の要素と一緒に）消す整理は通る。**
//     `checkPreconditionsAreWired` 自身も例外ではない（実測: 守り手を宣言ごと消して
//     43/43 緑・EXIT=0）。ただし総数は 44 から 43 へ動くので、開示は偽にならない。
//     下限を件数で貼らないという判断の裏返しであり、ここでは塞がない。
//   - **`report` を常に 0 を返す形へ書き換えると、失敗が終了コードへ伝わらない。**
//     実測（`report` の `return 1` を `return 0` にし、あわせて `MUST_DETECT` を空にした）:
//     出力には `❌ 対照のレジストリが一つも空でない` が印字されるが EXIT=0 で
//     「36/36 件の確認に成功しました」と述べる。**出力は動くが終了コードは動かない**粒度の穴。
//   - **`runCase` を常に空を返す形へ書き換えると、対照の判定そのものが死ぬ。**
//     実測（あわせて `MUST_DETECT` の先頭を本当に落ちる形にした）: 44/44 緑・EXIT=0。
//     母集団でも結線でもなく**判定器**の書き換えであり、115.242 の境界の外にある。
//   - **`serialStatementFailures` を常に空を返す形へ書き換えると、直列性の要求が丸ごと消える。**
//     実測: 44/44 緑・EXIT=0。守り手を守る守り手を無限には積まない、という線引きの結果である。
//   - **二箇所を協調させて消す整理は通る。** 実測: `corpusExecutionFailures` の `report(` を
//     撤去し、同時に対照の繰り返しを死んだ分岐で包むと 43/43 緑・EXIT=0。片方だけなら
//     どちらも赤い（前者は入口の件数不一致、後者は直列性）。一手ごとに赤くする、が到達点である。
//
// **一覧の外（本ファイルの守り手が原理的に見ていない形。実測 2026-09-02）**:
//   - **入口の呼び出しを消すと、確認が一件も走らないまま緑になる。** 実測: ファイル末尾の
//     入口の呼び出し（`main` を実行する一行）を削ると**標準出力 0 バイト・標準エラー 0 バイト・
//     EXIT=0**。`MUST_DETECT` を空にしても検出されない。死んだ分岐へ入れる形
//     （`if (Date.now() < 0)` で包む）も同じく EXIT=0 で出力ゼロである。
//     **これは一手であり、判定器の書き換えでも宣言の削除でもない**ため、上の一覧のどの形にも
//     帰着しない。本ファイルの守り手は `main` の**中**の結線だけを見ており、`main` が
//     呼ばれること自体は見ていないからである。
//     これは 115.242 の境界（パス参照検査の自己検査の対照レジストリ）の外であり、本タスクの
//     差分が持ち込んだものでもない（HEAD 時点でも同じ形）。**塞ぐのは後続タスクで扱う。**
//     115.242 の起票文が「作法を揃えること」と名指す先例
//     `scripts/check-requirement-exclusions.selftest.ts` の入口も同じ形であり、
//     本ファイル固有の欠陥ではない。
//
// **開示しておく偽陽性・無害な素通り（差し戻し事由とはならなかったもの。実測 2026-09-02）**:
//   - 関門の条件を逐語で固定しているため、**意味の等価な書き換えでも赤くなる**。実測:
//     `preconditions.failed > 0 || preconditions.ran === 0` への順序入れ替えも
//     `preconditions.ran < 1` への言い換えも EXIT=1。`||` で分割した被演算子の集合一致まで
//     緩めるのが望ましいが、安全側の誤警報なのでここでは逐語のままにしてある。
//   - **前提のラベルと判定関数の対応を入れ替える形、`STRUCTURAL` の 2 要素の `custom` を
//     互いに入れ替える形は素通りする**（実測: どちらも 44/44 緑・EXIT=0）。どちらの判定も
//     走るため母集団は空にならず、出力の名前が入れ替わるだけで合否は変わらないためである。

/** 本ファイル自身のソース（自分が宣言している検査関数を数えるために読む） */
function readOwnSource(): string {
  return fs.readFileSync(SELFTEST_PATH, 'utf-8');
}

// 対照を走らせる三つの形。`main` の中でこれらが直列に在ることを前提で要求する。
const CORPUS_LOOP = 'for (const group of GROUPS)';
const CORPUS_INNER_LOOP = 'for (const testCase of group.cases)';
const CORPUS_REPORT = 'failed += report(testCase.name, runCase(testCase));';

/** 対照の繰り返しの中身が、一件ずつ集計する直列の手続きであること */
function corpusInnerFailures(mainBody: string): string[] {
  const failures: string[] = [];
  const outerBlock = sliceBraceBlock(mainBody, mainBody.indexOf(CORPUS_LOOP) + CORPUS_LOOP.length);
  if (outerBlock === null) {
    return ['対照の繰り返しのブロックを切り出せない（波括弧の対応が崩れている疑い）'];
  }
  failures.push(...serialStatementFailures(outerBlock, CORPUS_INNER_LOOP, '対照の内側の繰り返し'));
  if (!outerBlock.includes(CORPUS_INNER_LOOP)) {
    failures.push('対照の内側の繰り返しが無い（一件ずつ走らせる形が消えた疑い）');
    return failures;
  }
  const innerBlock = sliceBraceBlock(
    outerBlock,
    outerBlock.indexOf(CORPUS_INNER_LOOP) + CORPUS_INNER_LOOP.length
  );
  if (innerBlock === null) {
    return failures.concat('対照の内側の繰り返しのブロックを切り出せない');
  }
  const occurrences = innerBlock.split(CORPUS_REPORT).length - 1;
  if (occurrences !== 1) {
    failures.push(
      `対照の集計が ${occurrences} 件である（` +
        `「${CORPUS_REPORT}」が過不足なく 1 件であること。呼ぶだけでは失敗が終了コードへ伝わらない）`
    );
  }
  failures.push(...serialStatementFailures(innerBlock, CORPUS_REPORT, '対照の集計'));
  return failures;
}

/**
 * `main` が対照へ実際に到達すること（差し戻し 2 回目の自主是正）。
 *
 * **これは前提の側に置く。** 対照の繰り返しを死んだ分岐で包むと `STRUCTURAL` が一件も
 * 走らず、`STRUCTURAL` に居る `checkPreconditionsAreWired` ごと黙る（自分で当てた変異の
 * 実測: `if (Date.now() < 0)` で包むと 43/43 緑・EXIT=0 のまま対照は 0 件しか走らない。
 * 関門の直後に `return` を足すと EXIT=0 で出力が総括の行ごと消える）。守り手が
 * **守られる側の実行にぶら下がっていた**穴であり、常に走る前提の側でしか塞げない。
 */
function corpusExecutionFailures(): string[] {
  const source = stripComments(readOwnSource());
  const mainBody = sliceFunctionBody(source, '\nfunction main(');
  const sliceFailures = bodySliceFailures('main', mainBody);
  if (sliceFailures.length > 0 || mainBody === null) return sliceFailures;

  const failures: string[] = [];
  if (!mainBody.includes(CORPUS_LOOP)) {
    failures.push('main に GROUPS を走らせる繰り返しが無い（対照の実行が消えた疑い）');
  } else {
    failures.push(...serialStatementFailures(mainBody, CORPUS_LOOP, '対照の繰り返し'));
    // 繰り返しが直列に在るだけでは足りない。中で一件ずつ集計する形まで降りて確かめる。
    // 集計（`failed +=`）を落とすと ❌ を印字したまま EXIT=0 になり、死んだ分岐へ入れると
    // ❌ すら出ない（どちらも自分で当てた変異で実測。前提の側で見た finding 1・3 と同じ手口）。
    failures.push(...corpusInnerFailures(mainBody));
  }
  // `main` は最後まで走り切る手続きである。途中で返る形も 0 での終了も持たない。
  for (const escape of ['return', 'process.exit(0)']) {
    if (mainBody.includes(escape)) {
      failures.push(`main の本体に ${escape} がある（対照へ到達する前に抜ける余地がある）`);
    }
  }
  return failures;
}

/**
 * 空になっている母集団を挙げる（対照を走らせる前に呼ぶ）。
 * `scripts/check-requirement-exclusions.selftest.ts` の同名の道具と同じ作法（タスク 115.222）。
 */
function emptyPopulationFailures(
  populations: ReadonlyArray<{ name: string; size: number }>
): string[] {
  // 渡す一覧そのものを空にされたら、この関門が何も見ていない。回帰を一段で断つ。
  if (populations.length === 0) {
    return ['母集団の一覧そのものが空（関門が何も見ていない）'];
  }
  return populations
    .filter((population) => population.size === 0)
    .map((population) => `${population.name}が 0 件（対照の母集団が空）`);
}

/** 対照のレジストリが一つも空でないこと */
function emptyRegistryFailures(): string[] {
  return emptyPopulationFailures([
    { name: 'MUST_DETECT', size: MUST_DETECT.length },
    { name: 'MUST_NOT_DETECT', size: MUST_NOT_DETECT.length },
    { name: 'STRUCTURAL', size: STRUCTURAL.length },
    { name: 'NARROWING_WATCHED_BODIES', size: NARROWING_WATCHED_BODIES.length },
  ]);
}

/** 対照のレジストリが実行される側（GROUPS）へ実際に結線されていること */
function registryWiringFailures(): string[] {
  const registries: ReadonlyArray<{ name: string; cases: readonly Case[] }> = [
    { name: 'MUST_DETECT', cases: MUST_DETECT },
    { name: 'MUST_NOT_DETECT', cases: MUST_NOT_DETECT },
    { name: 'STRUCTURAL', cases: STRUCTURAL },
  ];
  if (registries.length === 0) {
    return ['結線を見る一覧そのものが空（関門が何も見ていない）'];
  }
  const wired = new Set<readonly Case[]>(GROUPS.map((group) => group.cases));
  const unwired = registries.filter((registry) => !wired.has(registry.cases));
  if (unwired.length === 0) return [];
  return [
    `実行されない対照レジストリがある（GROUPS から外れている）: ${unwired
      .map((registry) => registry.name)
      .join(' / ')}`,
  ];
}

/** STRUCTURAL が本ファイルの検査関数を一つ残らず結線していること（構造から導いた下限） */
function structuralWiringFailures(): string[] {
  const failures: string[] = [];
  // 前提の確認そのものは `check` で始めない命名にしてある。だからこの語彙は
  // 「守られる側の検査関数」だけを拾い、守り手を自分の下限に数え込まない。
  const declared = [...readOwnSource().matchAll(/^function (check[A-Za-z0-9]*)\s*\(/gm)].map(
    (match) => match[1] as string
  );
  if (declared.length === 0) {
    return ['本ファイルに check で始まる検査関数の宣言が一つも無い（下限を導く語彙が消えた）'];
  }
  const wired = new Set(
    STRUCTURAL.map((testCase) => testCase.custom?.name).filter(
      (name): name is string => name !== undefined && name.length > 0
    )
  );
  const unwired = declared.filter((name) => !wired.has(name));
  if (unwired.length > 0) {
    failures.push(
      `STRUCTURAL に結線されていない検査関数がある（下限割れ）: ${unwired.join(' / ')}`
    );
  }
  const unknown = [...wired].filter((name) => !declared.includes(name));
  if (unknown.length > 0) {
    failures.push(`STRUCTURAL が本ファイルに宣言の無い検査を指している: ${unknown.join(' / ')}`);
  }
  return failures;
}

/** 絞り込みの監視が本体の関数を一つ残らず名指ししていること（構造から導いた下限） */
function watchedBodyCoverageFailures(): string[] {
  const declared = [
    ...readExecutableSource().matchAll(/^(?:export )?function ([A-Za-z0-9_]+)\s*\(/gm),
  ].map((match) => match[1] as string);
  if (declared.length === 0) {
    return ['本体に関数の宣言が一つも見つからない（下限を導く語彙が消えた）'];
  }
  const watched = new Set(NARROWING_WATCHED_BODIES.map((body) => body.label));
  const unwatched = declared.filter((name) => !watched.has(name));
  if (unwatched.length === 0) return [];
  return [`絞り込みの監視から外れている本体の関数がある（下限割れ）: ${unwatched.join(' / ')}`];
}

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

/** 一件の確認の結果を表示し、失敗なら 1 を返す */
function report(name: string, failures: readonly string[]): number {
  if (failures.length === 0) {
    console.log(`  ✅ ${name}`);
    return 0;
  }
  console.log(`  ❌ ${name}`);
  for (const failure of failures) console.log(`     - ${failure}`);
  return 1;
}

/** 前提の確認の実績。`ran` は実際に走らせた確認の件数（総数はここから導く） */
type PreconditionRun = { ran: number; failed: number };

/**
 * 前提（対照レジストリそのものの健全性）を確かめる。
 *
 * ここは意図して配列への登録ではなく直列の手続きである。守り手を守られる側と同じ
 * レジストリへ置かないための構造上の要請であり、整理して一覧化してはならない（タスク 115.242）。
 *
 * **返すのは失敗数だけではなく、実際に走らせた件数（`ran`）でもある。** 是正前はここを
 * `const PRECONDITION_COUNT = 4` という定数にしていたため、前提が一件も走らなくても
 * 総数が動かず「42/42」と自称できた。総数は実行から導くこと（タスク 115.242 の差し戻し）。
 */
function reportPreconditions(): PreconditionRun {
  console.log('\n[前提: 対照レジストリそのもの]');
  const tally: PreconditionRun = { ran: 0, failed: 0 };
  // 一件ごとに `ran` を加算する。加算を伴わない確認を足すと `checkPreconditionsAreWired` の
  // 「report( の件数＝前提の入口の件数」が合わなくなり赤くなる（タスク 115.242）。
  // 実測: 末尾へ `tally.failed += report('【変異】加算を伴わない確認', []);` の一行だけを足す
  // 変異を当てると、44 件中この 1 件だけが落ち、「reportPreconditions の report( の呼び出しが
  // 6 件で、前提の入口 5 件と一致しない」「tally.ran の加算が 5 件で、report( の呼び出し
  // 6 件と一致しない（総数が実行とずれる）」の二行を告げる（2026-09-04 に実測。変異は退避した
  // 控えからの書き戻しで復元し、復元後は 44/44 で緑に戻ることを確かめた）。
  tally.ran += 1;
  tally.failed += report('対照のレジストリが一つも空でない', emptyRegistryFailures());
  tally.ran += 1;
  tally.failed += report('対照のレジストリが実行に結線されている', registryWiringFailures());
  tally.ran += 1;
  tally.failed += report(
    'STRUCTURAL が本ファイルの検査関数を一つ残らず結線している',
    structuralWiringFailures()
  );
  tally.ran += 1;
  tally.failed += report(
    '絞り込みの監視が本体の関数を一つ残らず名指ししている',
    watchedBodyCoverageFailures()
  );
  tally.ran += 1;
  tally.failed += report('main が対照へ到達する', corpusExecutionFailures());
  return tally;
}

function main(): void {
  console.log(
    '🔍 設計文書の実在検査 検出規則 自己検査 (scripts/check-design-path-references.selftest.ts)'
  );

  // 前提が崩れている状態で対照を走らせても、その結果は何も主張していない。先に断つ。
  // 前提が一件も走らなかった場合（`ran === 0`）も、何も主張していないので同じく断つ。
  const preconditions = reportPreconditions();
  if (preconditions.ran === 0 || preconditions.failed > 0) {
    console.log(
      `\n❌ ${preconditions.failed}/${preconditions.ran} 件の前提が崩れています（対照は走らせません）`
    );
    process.exit(1);
  }

  let failed = 0;
  for (const group of GROUPS) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      failed += report(testCase.name, runCase(testCase));
    }
  }

  const total = preconditions.ran + GROUPS.reduce((sum, group) => sum + group.cases.length, 0);
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
}

main();
