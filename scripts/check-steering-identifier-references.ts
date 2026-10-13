/**
 * @fileoverview steering が現存物として挙げる**識別子**の実在検査
 *
 * `.kiro/steering/` は毎セッション読み込まれる「**現在の**プロジェクト構成」の記述である。
 * タスク 115.169 は**ファイル名**の失効を機械で捕まえる `check:steering-refs` を置いたが、
 * **ファイル名を伴わない識別子**（部品名・関数名・拡張子なしのモジュール経路）の失効は
 * その網に掛からない。実測（115.169 が手で是正した形）では `.kiro/steering/tech.md` の2箇所が
 * 撤去済みの `ImageViewer` を**現存の共有先として**挙げていた。本検査はその隣の穴を塞ぐ。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-identifier-references.ts [--verbose] [--json]
 *   npm run check:steering-idents
 *
 * ## 何を「主張」と見なすか（形で決める。散文の意味は読まない）
 *
 * 逆引用符で囲まれた語（インラインコード）のうち、**形が指し先を一意に決めるもの**だけを
 * 「この識別子が在る」という主張として扱う。三種類ある。
 *
 *   部品識別子      `` `AnnotationEditor` ``      PascalCase の裸の識別子
 *   関数識別子      `` `getTimeout()` ``          受け手を伴わない呼び出し形
 *   モジュール識別子 `` `hooks/useCanvasViewport` `` 拡張子を伴わないスラッシュ付き経路
 *
 * ## なぜ「散文の語をすべて識別子と見なす」道を採らなかったか（実測）
 *
 * 提出時に測り直した実測値である（2026-08-30 時点。本検査の分類器を通して数えた）。
 * `.kiro/steering/*.md` の本文行にある逆引用符付きの裸の識別子のうち **非 PascalCase のもの**は
 * 異なり 83 件・延べ 108 件あり、そのうち索引に無いものは **異なり 48 件・延べ 65 件**。
 * 内訳を一件ずつ当たると、`zod` / `vitest` / `eslint` / `postgres` などのライブラリ・道具名、
 * `feat` / `fix` / `chore` などのコミット種別、`vh` / `svh` の CSS 単位、
 * `NODE_ENV` / `INITIAL_ADMIN_EMAIL` の環境変数名、`readOnly` / `tempId` / `maxUpscale` の
 * プロパティ名、`any` / `boolean` の型名など、**すべてが誤検出**であった（真の失効は 0 件）。
 * 誤検出率 65/65。115.167 が測った 262件中30件（11.5%）とは桁が違う。したがって
 * **非 PascalCase の裸の識別子は主張として扱わない。** これは見逃し側へ倒した限界である。
 *
 * 一方 PascalCase へ絞ると、実データの候補は異なり 11 件・延べ 16 件で、索引に無いものは
 * **`ImageViewer` の1件のみ**。それも同期記録の行にある「撤去済みの `ImageViewer` ではなく」
 * という**非現存の記述**であり、本文中の主張ではない。本文行に限れば異なり 8 件・延べ 11 件で
 * 失効は 0 件、誤検出率 0/11。形で絞ることが効く領域と効かない領域がはっきり分かれている。
 *
 * ## 検出しない形（限界。すべて見逃し側へ倒してある）
 *
 *   - **非 PascalCase の裸の識別子は見ない**（上記の実測による）。`computeFitScale` のような
 *     真の関数名も、`readOnly` のようなプロパティ名と形で区別できないため対象外である。
 *     関数を主張したいときは `` `computeFitScale()` `` と呼び出し形で書けば対象になる。
 *   - **拡張子を伴う参照は見ない。** それは「ファイル参照」であり 115.169 の所管である。
 *     拡張子の語彙は**リポジトリの実ファイルから作る**（名指しの列挙は置かない）。
 *     115.169 が `.ts` / `.tsx` / `.css` に限っているため、`.json` / `.yml` / `.md` などは
 *     現状どちらの検査も見ない。これは既知の空白であり、本検査は所管を広げない。
 *   - **コードフェンス（``` で囲まれた範囲）は見ない。** 逆引用符はそこではインラインコードを
 *     成さず、ディレクトリツリーの葉（ファイル名＝115.169 の所管）が大半を占める。
 *   - **行全体が斜体の同期記録（`_… Steering Sync: … _`）は見ない。** これは「何を変えたか」の
 *     記録であって現存の主張ではない。115.169 が同じ理由で除外している。
 *     この除外が万能の逃がし口へ育たないよう、自己検査が「実データの行全体斜体は
 *     すべて Steering Sync の記録である」ことを固定し、崩れたら**失敗**させる。
 *   - **glob・ディレクトリ・URL・npm スコープ・プレースホルダ・受け手付き呼び出しは見ない。**
 *   - 設計文書（`.kiro/specs/<feature>/design.md`）は走査しない。そちらは歴史記録であり、
 *     参照先の実在はタスク 115.173 の担当である。
 *
 * ## 実在の判定
 *
 *   部品・関数: 識別子がリポジトリの索引にあること。索引は
 *              **宣言**（`function` / `class` / `const` …）∪ **取り込み**（`import … from`）∪
 *              **ファイル名の幹** の和集合である。取り込みを含めるのは、`PrismaPg` のような
 *              外部ライブラリ由来の型名を誤検出しないためである。
 *   モジュール: `<経路>` そのもの、または `<経路>.ts` / `.tsx` / `.css` に当たる実ファイルが
 *              あること（末尾一致。字下げからの経路組み立てはしない）。
 *
 * ビルド生成物（node_modules / dist / build / coverage / storybook-static /
 * playwright-report / test-results）は索引から外す。生成物に残った旧名を「在る」と
 * 数えてしまうと、撤去の検知が効かなくなるためである。
 *
 * 許容リストによる個別の逃がしは一切置いていない。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

/** 行の類。主張を読むのは `body` の行だけである */
export type LineClass = 'body' | 'fenced' | 'sync-note';

/** トークンの類。`*-claim` の三つだけが実在を照合される */
export type TokenClass =
  | 'component-claim'
  | 'function-claim'
  | 'module-claim'
  | 'rejected:whitespace'
  | 'rejected:glob'
  | 'rejected:placeholder'
  | 'rejected:url'
  | 'rejected:npm-scope'
  | 'rejected:directory'
  | 'rejected:method-call'
  | 'rejected:punctuation'
  | 'rejected:file-reference'
  | 'rejected:bare-non-component';

/** 実在を照合する類 */
export const CLAIM_CLASSES: readonly TokenClass[] = [
  'component-claim',
  'function-claim',
  'module-claim',
];

/** steering 文書の一つのインラインコード（＝一つの語） */
export interface CodeSpan {
  /** リポジトリ相対の steering 文書パス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 逆引用符の中身 */
  token: string;
  /** 行の類 */
  lineClass: LineClass;
  /** トークンの類 */
  tokenClass: TokenClass;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

/** 実在しないと判定した主張 */
export type IdentifierFinding = CodeSpan;

/** リポジトリの索引 */
export interface RepositoryIndex {
  /** リポジトリ相対パス（POSIX 区切り）の集合 */
  paths: ReadonlySet<string>;
  /** ファイル名（basename）から、そのファイルのリポジトリ相対パスの一覧 */
  basenames: ReadonlyMap<string, readonly string[]>;
  /** 宣言・取り込み・ファイル名の幹の和集合 */
  symbols: ReadonlySet<string>;
  /** 実ファイルから作った拡張子の語彙（先頭のドットを含む） */
  extensions: ReadonlySet<string>;
}

export interface IndexOptions {
  /**
   * 索引の供給源を意図的に外す（自己検査が「どの供給源も遊んでいない」ことを示すための口）。
   * 本番経路では使わない。
   */
  skipSymbolSources?: readonly string[];
}

export interface RunOptions extends IndexOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** steering 文書の置き場所（リポジトリ相対） */
  steeringDir?: string;
}

export interface RunResult {
  findings: IdentifierFinding[];
  scannedFiles: string[];
  steeringDir: string;
  /** 走査で読んだインラインコードの総数（0 件合格の自明さを可視化するため） */
  spanCount: number;
  /** 実在を照合した主張の総数 */
  claimCount: number;
}

// ============================================================================
// 走査対象の決定
// ============================================================================

/** steering 文書の置き場所 */
export const STEERING_DIR = '.kiro/steering';

/**
 * リポジトリ走査から外すディレクトリ（すべてビルド生成物・取得物）。
 * 生成物に旧名が残っていても撤去を検知できるようにするためであり、
 * **検出を緩める向きには働かない**。
 */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** モジュール識別子に補って実在を照合する拡張子 */
export const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.css'];

/** 索引が宣言・取り込みを読むソースの拡張子 */
const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx'];

/** `.kiro/steering/*.md` を列挙する */
export function collectSteeringDocuments(
  root: string,
  steeringDir: string = STEERING_DIR
): string[] {
  const absoluteDir = path.join(root, steeringDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const documents: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    documents.push(`${steeringDir}/${entry.name}`);
  }
  return documents.sort();
}

// ============================================================================
// リポジトリの索引
// ============================================================================

/** 宣言（`function foo` / `const foo` …）の名前 */
const DECLARATION = /\b(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/** 取り込み（`import … from …`）の束縛 */
const IMPORT_CLAUSE = /^\s*import\s+([^;]+?)\s+from\s/gm;

/** 束縛の名前として認める形 */
const BINDING_NAME = /^[A-Za-z_$][\w$]*$/;

/** リポジトリを一度歩いて、パス・ファイル名・拡張子を集める */
function walkRepository(root: string): string[] {
  const paths: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else {
        paths.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  }
  return paths;
}

/**
 * リポジトリの索引を作る。
 *
 * 索引の供給源は三つ（宣言・取り込み・ファイル名の幹）で、どれも独自に効いている。
 * 自己検査がそれぞれを外して索引が真に縮むことを確かめる。
 */
export function buildRepositoryIndex(root: string, options: IndexOptions = {}): RepositoryIndex {
  const skip = new Set(options.skipSymbolSources ?? []);
  const relativePaths = walkRepository(root);

  const paths = new Set<string>(relativePaths);
  const basenames = new Map<string, string[]>();
  const extensions = new Set<string>();
  const symbols = new Set<string>();

  for (const relativePath of relativePaths) {
    const base = path.posix.basename(relativePath);
    const list = basenames.get(base) ?? [];
    list.push(relativePath);
    basenames.set(base, list);
    const extension = path.posix.extname(base);
    if (extension.length > 0) extensions.add(extension.toLowerCase());
    if (!skip.has('basename')) {
      symbols.add(base.replace(/\.(?:tsx?|css)$/, ''));
    }
  }

  const readsSource = !skip.has('declaration') || !skip.has('import');
  if (readsSource) {
    for (const relativePath of relativePaths) {
      if (!SOURCE_EXTENSIONS.includes(path.posix.extname(relativePath))) continue;
      let source: string;
      try {
        source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
      } catch {
        continue;
      }
      if (!skip.has('declaration')) {
        DECLARATION.lastIndex = 0;
        let matched: RegExpExecArray | null;
        while ((matched = DECLARATION.exec(source)) !== null) {
          if (matched[1] !== undefined) symbols.add(matched[1]);
        }
      }
      if (!skip.has('import')) {
        IMPORT_CLAUSE.lastIndex = 0;
        let matched: RegExpExecArray | null;
        while ((matched = IMPORT_CLAUSE.exec(source)) !== null) {
          for (const piece of (matched[1] ?? '').split(/[{},\s]+/)) {
            if (BINDING_NAME.test(piece)) symbols.add(piece);
          }
        }
      }
    }
  }

  return { paths, basenames, symbols, extensions };
}

// ============================================================================
// 検出規則
// ============================================================================

/** 行全体が斜体（同期記録） */
const SYNC_NOTE_LINE = /^_[^_].*_$/;

/** コードフェンスの区切り */
const FENCE_DELIMITER = /^\s*```/;

/** 受け手を伴わない呼び出し形 */
const CALL_FORM = /^[A-Za-z_$][\w$]*\(\)$/;

/** 主張として認めるトークンの文字集合 */
const TOKEN_CHARSET = /^[A-Za-z0-9_$./-]+$/;

/** PascalCase（先頭大文字＋小文字を少なくとも一つ含む。ALL_CAPS を除く） */
const COMPONENT_NAME = /^[A-Z][a-z0-9]+[A-Za-z0-9]*$/;

/**
 * 一行の類を返す。`insideFence` はこの行に入る時点でフェンスの中かどうか。
 * フェンスの区切り行そのものも `fenced` として扱う。
 */
export function classifyLine(lineText: string, insideFence: boolean): LineClass {
  if (insideFence) return 'fenced';
  if (FENCE_DELIMITER.test(lineText)) return 'fenced';
  if (SYNC_NOTE_LINE.test(lineText.trim())) return 'sync-note';
  return 'body';
}

/**
 * 一つの語の類を返す。**形だけ**で決め、散文の意味は読まない。
 * `knownExtensions` はリポジトリの実ファイルから作った拡張子の語彙である
 * （名指しの列挙ではないため、ここに逃がしの余地は無い）。
 */
export function classifyToken(token: string, knownExtensions: ReadonlySet<string>): TokenClass {
  if (/\s/.test(token)) return 'rejected:whitespace';
  if (token.includes('*')) return 'rejected:glob';
  if (token.includes('<') || token.includes('>')) return 'rejected:placeholder';
  if (token.includes('://')) return 'rejected:url';
  if (token.startsWith('@')) return 'rejected:npm-scope';
  if (token.endsWith('/')) return 'rejected:directory';
  if (CALL_FORM.test(token)) return 'function-claim';
  if (token.includes('(') || token.includes(')')) return 'rejected:method-call';
  if (!TOKEN_CHARSET.test(token)) return 'rejected:punctuation';
  const extension = path.posix.extname(path.posix.basename(token)).toLowerCase();
  if (extension.length > 0 && knownExtensions.has(extension)) return 'rejected:file-reference';
  if (token.includes('/')) return 'module-claim';
  if (COMPONENT_NAME.test(token)) return 'component-claim';
  return 'rejected:bare-non-component';
}

/** 一つの steering 文書から、逆引用符で囲まれたすべての語を類つきで取り出す */
export function collectCodeSpans(
  relativePath: string,
  source: string,
  knownExtensions: ReadonlySet<string>
): CodeSpan[] {
  const spans: CodeSpan[] = [];
  const lines = source.split(/\r?\n/);
  let insideFence = false;
  lines.forEach((lineText, index) => {
    const lineClass = classifyLine(lineText, insideFence);
    if (FENCE_DELIMITER.test(lineText)) insideFence = !insideFence;
    for (const matched of lineText.matchAll(/`([^`]+)`/g)) {
      const token = matched[1];
      if (token === undefined) continue;
      spans.push({
        file: relativePath,
        line: index + 1,
        token,
        lineClass,
        tokenClass: classifyToken(token, knownExtensions),
        snippet: lineText.trim(),
      });
    }
  });
  return spans;
}

/**
 * 同値類の鍵。実データが実現する類を数え上げ、見本と突き合わせるために使う。
 * 主張でない語・主張を読まない行は、解決の可否を鍵に含めない。
 */
export function equivalenceKey(span: CodeSpan, resolved: boolean | null): string {
  if (span.lineClass !== 'body') return `${span.lineClass}/${span.tokenClass}`;
  if (resolved === null) return `body/${span.tokenClass}`;
  return `body/${span.tokenClass}/${resolved ? 'present' : 'absent'}`;
}

/** 主張の指し先が実在するか */
export function resolveSpan(span: CodeSpan, index: RepositoryIndex): boolean {
  if (span.tokenClass === 'module-claim') {
    const base = path.posix.basename(span.token);
    for (const extension of ['', ...MODULE_EXTENSIONS]) {
      const candidates = index.basenames.get(base + extension) ?? [];
      const suffix = span.token + extension;
      for (const candidate of candidates) {
        if (candidate === suffix || candidate.endsWith(`/${suffix}`)) return true;
      }
    }
    return false;
  }
  return index.symbols.has(span.token.replace(/\(\)$/, ''));
}

/** 一つの steering 文書から、実在しない識別子の主張を検出する */
export function scanDocument(
  relativePath: string,
  source: string,
  index: RepositoryIndex
): IdentifierFinding[] {
  const findings: IdentifierFinding[] = [];
  for (const span of collectCodeSpans(relativePath, source, index.extensions)) {
    if (span.lineClass !== 'body') continue;
    if (!CLAIM_CLASSES.includes(span.tokenClass)) continue;
    if (resolveSpan(span, index)) continue;
    findings.push(span);
  }
  return findings;
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const steeringDir = options.steeringDir ?? STEERING_DIR;
  const documents = collectSteeringDocuments(root, steeringDir);
  const index = buildRepositoryIndex(root, options);

  const findings: IdentifierFinding[] = [];
  let spanCount = 0;
  let claimCount = 0;
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    for (const span of collectCodeSpans(relativePath, source, index.extensions)) {
      spanCount += 1;
      if (span.lineClass !== 'body') continue;
      if (!CLAIM_CLASSES.includes(span.tokenClass)) continue;
      claimCount += 1;
      if (resolveSpan(span, index)) continue;
      findings.push(span);
    }
  }

  return { findings, scannedFiles: documents, steeringDir, spanCount, claimCount };
}

/** 類ごとの日本語の呼び名（報告のためだけに使う） */
const CLAIM_LABELS: Record<string, string> = {
  'component-claim': '部品識別子',
  'function-claim': '関数識別子',
  'module-claim': 'モジュール識別子',
};

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFiles.length === 0) {
    if (!json) {
      console.error('❌ 走査対象の steering 文書が一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.steeringDir}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ steering が現存物として挙げる識別子に、実在しないものがあります');
      console.error('');
      console.error('   steering は毎セッション読み込まれる「現在の構成」の記述です。撤去・改名に');
      console.error(
        '   追随していない識別子は、後任を存在しない部品へ導きます（タスク 115.198）。'
      );
      console.error('   記載を落とすか、移管先の識別子へ指し直してください。');
      console.error('');
      console.error('   もし報告された語が**現存の主張ではなく例示や仮の名前**なら、');
      console.error(
        '   プレースホルダの形（`<` `>` を含む。例: `feature/<機能名>`）で書いてください。'
      );
      console.error('   本検査は形だけで主張を判別するため、例示は形で示す必要があります。');
      console.error('');
      const byFile = new Map<string, IdentifierFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          const label = CLAIM_LABELS[finding.tokenClass] ?? finding.tokenClass;
          console.error(`     L${finding.line}: ${finding.token}（${label}）`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル（走査 ${result.scannedFiles.length} ファイル）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ steering が挙げる識別子はすべて実在します（走査 ${result.scannedFiles.length} ファイル: ${result.steeringDir}/*.md、` +
        `逆引用符の語 ${result.spanCount} 件のうち実在を照合した主張 ${result.claimCount} 件）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
