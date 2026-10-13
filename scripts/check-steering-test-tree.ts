/**
 * @fileoverview steering の**テスト区分の列挙**が実体と一致することの検査（過小の側）
 *
 * 既存の二つの検査は、いずれも「**挙げたものが実在するか**」を見る（過大の検出）。
 *
 *   `check:steering-refs`   ファイル名を伴う記載の実在（タスク 115.169 / 115.199）
 *   `check:steering-idents` 拡張子を伴わない識別子の実在（タスク 115.198）
 *
 * **「挙げていないものがある」＝過小の側は、どちらも見ていない。** 挙げられたファイルは
 * 実在するため basename 照合の網には掛からず、`.kiro/steering/tech.md` の `unit/utils/` が
 * 8 ファイルのうち `sentry.test.ts` 一件しか挙げていない状態は無検知のまま残っていた
 * （タスク 115.200 の起票）。本検査はその穴を塞ぐ。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-test-tree.ts [--verbose] [--json]
 *   npm run check:steering-test-tree
 *
 * ## 何を検査するか（有限集合上の全称命題）
 *
 * 「無い」を走査で示せという受入条件は終端しない（115.197）。したがって本検査は
 * **有限で小さく、実測できる集合**だけを対象にする。
 *
 *   宣言された各根について、
 *     steering がその根の直下として挙げるディレクトリ名の集合
 *       == その根の直下でテストファイルを（再帰的に）1件以上含むディレクトリ名の集合
 *
 * 両辺とも有限で、片側に寄った差分（過大・過小）を一件ずつ報告する。
 *
 * ## 記法の規約（115.198 の作法: 形で区別できない曖昧さは規約で解く）
 *
 * 網羅を主張する列挙だけを、HTML コメントの印で囲む。
 *
 *   <!-- steering:test-dirs backend/src/__tests__/unit -->
 *   - `unit/config/` - 設定テスト
 *   - `unit/errors/` - カスタムエラークラスのテスト
 *   <!-- /steering:test-dirs -->
 *
 * **囲まれていない列挙は代表例である。** ディレクトリツリーの図や「代表例:」を前置した
 * 箇条書きは網羅を主張せず、本検査は読まない。網羅か代表例かが**形で判る**ようにするための
 * 規約であり、これがあるので「一件も挙げていない」と「全部挙げたつもりが漏れている」を
 * 取り違えずに済む。
 *
 * 印が消されれば検査は黙る。それを防ぐため `REQUIRED_ROOTS` に「網羅宣言が必ず在るべき根」を
 * 定数で持ち、宣言が無ければ**失敗**する（第3原則: 前提条件で検査を無効化しない）。
 * 同じ根の宣言が二箇所にあることも失敗とする。**網羅の権威は根ごとに一箇所だけ**に置き、
 * 複製が互いに食い違う経路を機構で塞ぐためである。
 *
 * ## 件数を書かない規約と、その実測上の根拠
 *
 * steering には**テストの件数を書かない**。数える手段（`npm --prefix backend run test` 等）を
 * 書く。是正前の実データ（3文書に散った数値 59 個）を一つずつ測り直すと、
 *
 *   - ディレクトリ単位のテスト件数 6 個は**すべて**食い違っていた
 *     （`unit/errors/` 21→234、`unit/middleware/` 91→209、`unit/routes/` 23→755、
 *      `unit/services/` 324→2361（tech.md と structure.md の二箇所）、`unit/utils/` 14→222。
 *      いずれも静的走査値）
 *   - ファイル単位のテスト件数 41 個のうち 20 個が食い違っていた
 *     （`rateLimit.test.ts` 3→66、`token.service.test.ts` 18→45 など）
 *   - ファイル数 12 個も**すべて**食い違っていた
 *     （単体 167→186、統合 31/35→45、frontend 339/405→527、e2e `site-surveys/` 12→31）
 *
 * すなわち**是正前に正しかった数値は 21/59 個だけ**で、しかも正しい 21 個と誤った 38 個は
 * 見た目で区別できない（「同一ファイル内で新旧の精度が混在している」）。加えて `it.each` を
 * 展開せずに数える静的走査は実行時のテスト数と一致せず（実測: `unit/routes/` に 4 件、
 * `unit/schemas/` に 7 件、`unit/utils/` に 4 件の `.each` がある）、正確に数えるには
 * 全件実行が要る。**確かめる手段が長時間実行しかない数値を steering に置かない。**
 *
 * ## 検出しない形（限界。すべて見逃し側へ倒してある）
 *
 *   - **印で囲まれていない列挙は読まない。** ディレクトリツリーの図、「代表例:」を前置した
 *     箇条書き、散文中の言及は対象外である。これは規約であり、網羅を主張したければ
 *     印で囲む。囲まないものが陳腐化しても本検査は黙る。
 *   - **根の直下だけを見る（再帰しない）。** `unit/services/` の下にさらに区分ができても
 *     検知しない。深さを増やすほど churn が増え、規約の維持費が便益を上回るためである。
 *   - **根の直下に置かれた個々のテストファイルは数えない**（例: `unit/app.test.ts`）。
 *     ファイル単位の網羅は 186 件を steering へ書き写すことになり現実的でない。
 *   - **件数の規約は形で見る。** 「テスト」を含む行の丸括弧の中にファイル数が書かれた形
 *     （`現場調査テスト（12ファイル）`）まで見るため、テスト以外の数をその形で書くと
 *     誤検出しうる。是正時点の実データでの誤検出は 0/56 件である。
 *   - 設計文書（`.kiro/specs/<feature>/design.md`）は走査しない。歴史記録であり、
 *     「現在の構成」ではないためである。
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

/** 指摘の種別 */
export type FindingKind =
  /** `REQUIRED_ROOTS` の根に網羅宣言が無い（印を消して検査を黙らせる経路を塞ぐ） */
  | 'missing-declaration'
  /** 同じ根の網羅宣言が二箇所以上ある（権威の複製） */
  | 'duplicate-declaration'
  /** 開始印に対応する終了印が無い */
  | 'unterminated-block'
  /** 開始印なしの終了印 */
  | 'stray-close'
  /** 宣言された根がディレクトリとして実在しない */
  | 'unknown-root'
  /** 網羅宣言の中にディレクトリの項目が一つも無い */
  | 'empty-block'
  /** 項目の形が規約に合わない（根の直下の一段でない） */
  | 'malformed-entry'
  /** 挙げているが、テストを含むディレクトリとして実在しない（過大） */
  | 'over-listed'
  /** 実在するのに挙げていない（過小。本検査の主目的） */
  | 'under-listed'
  /** 網羅宣言の中に件数が書かれている */
  | 'count-in-block'
  /** steering のどこかにテスト件数が書かれている */
  | 'test-count-annotation';

export interface Finding {
  kind: FindingKind;
  /** リポジトリ相対の steering 文書パス（宣言の欠落など行に紐づかない場合は空） */
  file: string;
  /** 1 始まりの行番号（行に紐づかない場合は 0） */
  line: number;
  /** 指摘の対象（ディレクトリ名・根・件数の綴りなど） */
  subject: string;
  /** 何が問題かの一行説明 */
  detail: string;
  /** 該当行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** steering 文書の置き場所（リポジトリ相対） */
  steeringDir?: string;
  /** 網羅宣言が必ず在るべき根（既定は `REQUIRED_ROOTS`）。自己検査から差し替える */
  requiredRoots?: readonly string[];
}

export interface RunResult {
  findings: Finding[];
  scannedFiles: string[];
  steeringDir: string;
  /** 見つかった網羅宣言の数。0 件の合格（印の消滅）を読み手が見分けられるようにする */
  blocks: number;
  /** 実体と照合したディレクトリ名の総数。全称命題の台の大きさ */
  claims: number;
  /** 件数の規約を照合した行の総数。ここが 0 なら走査が空振りしている */
  scannedLines: number;
}

// ============================================================================
// 走査対象の決定
// ============================================================================

/** steering 文書の置き場所 */
export const STEERING_DIR = '.kiro/steering';

/**
 * 走査から外すディレクトリ（すべてビルド生成物・取得物）。
 * 生成物の中のテストファイルを「区分が在る」と数えないためである。
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

/** テストファイルと見なす綴り */
export const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mts|cts)$/;

/**
 * 網羅宣言が必ず在るべき根。ここに挙げた根の宣言が steering から消えたら**失敗**する。
 * 印を消せば検査が黙る、という抜け道を塞ぐための定数である。
 */
export const REQUIRED_ROOTS: readonly string[] = [
  'backend/src/__tests__',
  'backend/src/__tests__/unit',
  'frontend/src/__tests__',
  'e2e/specs',
];

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

/** ディレクトリが（再帰的に）テストファイルを1件以上含むか */
export function containsTestFile(absoluteDir: string): boolean {
  const stack: string[] = [absoluteDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      } else if (TEST_FILE_PATTERN.test(entry.name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 根の直下にある「テストを含むディレクトリ」の名前。これが網羅宣言の照合相手である。
 * テストを一件も含まないディレクトリ（例: `frontend/src/__tests__/helpers/`）は
 * テストの区分ではないため対象に入れない。
 */
export function realTestDirectories(absoluteRoot: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    if (!containsTestFile(path.join(absoluteRoot, entry.name))) continue;
    names.push(entry.name);
  }
  return names.sort();
}

// ============================================================================
// 記法（印と項目）
// ============================================================================

/** 網羅宣言の開始印。捕獲群はリポジトリ相対の根 */
export const BLOCK_OPEN_PATTERN = /^<!--\s*steering:test-dirs\s+(\S+)\s*-->\s*$/;
/** 網羅宣言の終了印 */
export const BLOCK_CLOSE_PATTERN = /^<!--\s*\/steering:test-dirs\s*-->\s*$/;

/**
 * 行全体が斜体の同期記録（`_… Steering Sync: … _`）。
 * 「何を変えたか」の記録であって現在の構成の主張ではないため、件数の規約から外す。
 * 115.169 / 115.198 が同じ理由で同じ形を外している。
 */
export function isSyncNoteLine(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 1 && trimmed.startsWith('_') && trimmed.endsWith('_');
}

/** 網羅宣言の一項目 */
export interface DirEntry {
  /** 書かれていた綴り（例: `unit/config/`） */
  token: string;
  /** 根の直下の名前（例: `config`）。規約に合わない形なら null */
  name: string | null;
}

/**
 * 網羅宣言の中の一行から、根の直下のディレクトリ名を取り出す。
 *
 * 受け付ける形は箇条書きの一つだけである。
 *   - `<名前>/` - 説明
 *   - `<根の名前>/<名前>/` - 説明
 * 後者を許すのは、`backend/src/__tests__/unit` の項目を `unit/config/` と書いた方が
 * 読み手に伝わるためである。根の名前を一段だけ前置できる。
 *
 * ディレクトリでない項目（`*.spec.ts` など末尾が `/` でないもの）と、
 * 箇条書きでない行（散文・空行）は null を返して読み飛ばす。読み飛ばした結果
 * 実在する区分が挙がっていない状態になれば `under-listed` で落ちるため、
 * 読み飛ばしは検出を緩める向きには働かない。
 */
export function extractDirEntry(raw: string, rootBasename: string): DirEntry | null {
  const listItem = /^\s*[-*+]\s+(.*)$/.exec(raw);
  if (listItem === null) return null;
  const quoted = /^`([^`]+)`/.exec(listItem[1] ?? '');
  if (quoted === null) return null;
  const token = quoted[1] ?? '';
  if (!token.endsWith('/')) return null;
  const segments = token.slice(0, -1).split('/');
  if (segments.some((segment) => segment.length === 0)) return { token, name: null };
  if (segments.length === 1) return { token, name: segments[0] ?? null };
  if (segments.length === 2 && segments[0] === rootBasename) {
    return { token, name: segments[1] ?? null };
  }
  return { token, name: null };
}

/** 件数の書き方の種別 */
export type CountKind = 'test-count' | 'test-file-count' | 'parenthesized-file-count';

export interface CountAnnotation {
  kind: CountKind;
  text: string;
}

/**
 * テストの件数を書いた形を取り出す。三つの同値類があり、いずれも是正前の実データが
 * 実現していた形である（それぞれの実物を自己検査の陽性対照に置いてある）。
 *
 *   test-count               `（21テスト）` `167テストファイル`
 *   test-file-count          `単体テスト167ファイル`
 *   parenthesized-file-count `現場調査テスト（12ファイル）`
 *
 * 三つ目だけは「テスト」を含む行に限る。丸括弧の中のファイル数は、テストの文脈でなければ
 * 正当な記述でありうるためである（例: `注釈ツール（11ファイル）` は本検査の対象外）。
 */
export function findCountAnnotation(raw: string): CountAnnotation | null {
  const testCount = /[0-9０-９]+\s*テスト/.exec(raw);
  if (testCount !== null) return { kind: 'test-count', text: testCount[0] };
  const testFileCount = /テスト\s*[0-9０-９]+\s*ファイル/.exec(raw);
  if (testFileCount !== null) return { kind: 'test-file-count', text: testFileCount[0] };
  if (raw.includes('テスト')) {
    const parenthesized = /[（(][^）)]*?[0-9０-９]+\s*ファイル/.exec(raw);
    if (parenthesized !== null) {
      return { kind: 'parenthesized-file-count', text: parenthesized[0] };
    }
  }
  return null;
}

/**
 * 網羅宣言の中の件数。宣言の中では「テスト」を含まない行でも件数を許さない。
 * 網羅であることを検査が保証している以上、そこに数を書き足す理由が無いためである。
 */
export function findBlockCountAnnotation(raw: string): string | null {
  const match = /[0-9０-９]+\s*(?:テスト|ファイル|件|個)/.exec(raw);
  return match === null ? null : match[0];
}

// ============================================================================
// 走査
// ============================================================================

/** 一つの網羅宣言 */
export interface Block {
  /** リポジトリ相対の steering 文書パス */
  file: string;
  /** 宣言された根（リポジトリ相対） */
  root: string;
  /** 開始印の行番号（1 始まり） */
  openLine: number;
  /** 宣言の中の行（行番号と内容） */
  lines: Array<{ line: number; raw: string }>;
}

export interface ParseResult {
  blocks: Block[];
  findings: Finding[];
}

/** コードフェンス（``` で始まる行）の開閉 */
export function isFenceLine(raw: string): boolean {
  return /^\s*(?:```|~~~)/.test(raw);
}

/**
 * 文書から網羅宣言を取り出す。
 *
 * **コードフェンスの中は読まない。** 規約そのものを説明する例（structure.md の
 * 「テスト区分の列挙の規約」）がフェンスの中に印を書いており、それを本物の宣言として
 * 数えると「同じ根の宣言が二箇所」で必ず失敗する。フェンスの中は記述の例示であって
 * 現在の構成の主張ではないという点で、115.198 が同じ理由でフェンスを外したのと同じ扱いである。
 */
export function parseBlocks(file: string, source: string): ParseResult {
  const blocks: Block[] = [];
  const findings: Finding[] = [];
  const lines = source.split(/\r?\n/);
  let open: Block | null = null;
  let inFence = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (isFenceLine(raw)) {
      inFence = !inFence;
      if (open !== null) open.lines.push({ line: lineNumber, raw });
      return;
    }
    if (inFence) {
      if (open !== null) open.lines.push({ line: lineNumber, raw });
      return;
    }
    const openMatch = BLOCK_OPEN_PATTERN.exec(raw.trim());
    if (openMatch !== null) {
      if (open !== null) {
        findings.push({
          kind: 'unterminated-block',
          file,
          line: open.openLine,
          subject: open.root,
          detail: '終了印の前に次の開始印が現れた',
          snippet: raw.trim(),
        });
        blocks.push(open);
      }
      open = { file, root: openMatch[1] ?? '', openLine: lineNumber, lines: [] };
      return;
    }
    if (BLOCK_CLOSE_PATTERN.test(raw.trim())) {
      if (open === null) {
        findings.push({
          kind: 'stray-close',
          file,
          line: lineNumber,
          subject: '',
          detail: '開始印の無い終了印',
          snippet: raw.trim(),
        });
        return;
      }
      blocks.push(open);
      open = null;
      return;
    }
    if (open !== null) open.lines.push({ line: lineNumber, raw });
  });

  if (open !== null) {
    const unterminated: Block = open;
    findings.push({
      kind: 'unterminated-block',
      file,
      line: unterminated.openLine,
      subject: unterminated.root,
      detail: '終了印が無いまま文書が終わった',
      snippet: `<!-- steering:test-dirs ${unterminated.root} -->`,
    });
    blocks.push(unterminated);
  }

  return { blocks, findings };
}

/** 一つの網羅宣言を実体と照合する */
export function checkBlock(block: Block, root: string): { findings: Finding[]; claims: number } {
  const findings: Finding[] = [];
  const absoluteRoot = path.join(root, block.root);
  const rootBasename = path.basename(block.root);

  let isDirectory = false;
  try {
    isDirectory = fs.statSync(absoluteRoot).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    findings.push({
      kind: 'unknown-root',
      file: block.file,
      line: block.openLine,
      subject: block.root,
      detail: '網羅宣言が指す根がディレクトリとして実在しない',
      snippet: `<!-- steering:test-dirs ${block.root} -->`,
    });
    return { findings, claims: 0 };
  }

  const listed = new Map<string, number>();
  for (const { line, raw } of block.lines) {
    const countInBlock = findBlockCountAnnotation(raw);
    if (countInBlock !== null) {
      findings.push({
        kind: 'count-in-block',
        file: block.file,
        line,
        subject: countInBlock,
        detail: '網羅宣言の中に件数が書かれている',
        snippet: raw.trim(),
      });
    }
    const entry = extractDirEntry(raw, rootBasename);
    if (entry === null) continue;
    if (entry.name === null) {
      findings.push({
        kind: 'malformed-entry',
        file: block.file,
        line,
        subject: entry.token,
        detail: `根 ${block.root} の直下の一段（\`名前/\` または \`${rootBasename}/名前/\`）でない`,
        snippet: raw.trim(),
      });
      continue;
    }
    if (!listed.has(entry.name)) listed.set(entry.name, line);
  }

  if (listed.size === 0) {
    findings.push({
      kind: 'empty-block',
      file: block.file,
      line: block.openLine,
      subject: block.root,
      detail: '網羅宣言の中にディレクトリの項目が一つも無い',
      snippet: `<!-- steering:test-dirs ${block.root} -->`,
    });
    return { findings, claims: 0 };
  }

  const actual = new Set(realTestDirectories(absoluteRoot));
  for (const [name, line] of listed) {
    if (actual.has(name)) continue;
    findings.push({
      kind: 'over-listed',
      file: block.file,
      line,
      subject: `${block.root}/${name}`,
      detail: 'テストファイルを含むディレクトリとして実在しない',
      snippet: `${name}/`,
    });
  }
  for (const name of [...actual].sort()) {
    if (listed.has(name)) continue;
    findings.push({
      kind: 'under-listed',
      file: block.file,
      line: block.openLine,
      subject: `${block.root}/${name}`,
      detail: 'テストファイルを含むディレクトリが網羅宣言に挙がっていない',
      snippet: `<!-- steering:test-dirs ${block.root} -->`,
    });
  }

  return { findings, claims: listed.size };
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const steeringDir = options.steeringDir ?? STEERING_DIR;
  const requiredRoots = options.requiredRoots ?? REQUIRED_ROOTS;
  const documents = collectSteeringDocuments(root, steeringDir);

  const findings: Finding[] = [];
  const blocks: Block[] = [];
  let scannedLines = 0;

  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    const parsed = parseBlocks(relativePath, source);
    findings.push(...parsed.findings);
    blocks.push(...parsed.blocks);

    source.split(/\r?\n/).forEach((raw, index) => {
      scannedLines += 1;
      if (isSyncNoteLine(raw)) return;
      const annotation = findCountAnnotation(raw);
      if (annotation === null) return;
      findings.push({
        kind: 'test-count-annotation',
        file: relativePath,
        line: index + 1,
        subject: annotation.text,
        detail: `テストの件数が書かれている（種別: ${annotation.kind}）`,
        snippet: raw.trim(),
      });
    });
  }

  // 根ごとの宣言の重複と欠落
  const byRoot = new Map<string, Block[]>();
  for (const block of blocks) {
    const list = byRoot.get(block.root) ?? [];
    list.push(block);
    byRoot.set(block.root, list);
  }
  for (const [rootPath, list] of byRoot) {
    if (list.length <= 1) continue;
    for (const duplicate of list.slice(1)) {
      findings.push({
        kind: 'duplicate-declaration',
        file: duplicate.file,
        line: duplicate.openLine,
        subject: rootPath,
        detail: `同じ根の網羅宣言が ${list.length} 箇所ある（権威は一箇所に置くこと）`,
        snippet: `<!-- steering:test-dirs ${rootPath} -->`,
      });
    }
  }
  for (const requiredRoot of requiredRoots) {
    if (byRoot.has(requiredRoot)) continue;
    findings.push({
      kind: 'missing-declaration',
      file: '',
      line: 0,
      subject: requiredRoot,
      detail: 'この根の網羅宣言が steering のどこにも無い',
      snippet: `<!-- steering:test-dirs ${requiredRoot} -->`,
    });
  }

  let claims = 0;
  for (const block of blocks) {
    const checked = checkBlock(block, root);
    findings.push(...checked.findings);
    claims += checked.claims;
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return {
    findings,
    scannedFiles: documents,
    steeringDir,
    blocks: blocks.length,
    claims,
    scannedLines,
  };
}

/** 走査が空振りしていないかの判定。0 件の合格を合格にしない（第3原則） */
export function decideExit(result: RunResult): { ok: boolean; reason?: string } {
  if (result.scannedFiles.length === 0) {
    return { ok: false, reason: '走査対象の steering 文書が一件も見つかりませんでした' };
  }
  if (result.scannedLines === 0) {
    return { ok: false, reason: 'steering 文書は在るのに、件数の規約を照合した行が0行です' };
  }
  if (result.blocks === 0) {
    return { ok: false, reason: '網羅宣言（steering:test-dirs の印）が一つも見つかりませんでした' };
  }
  if (result.claims === 0) {
    return { ok: false, reason: '網羅宣言は在るのに、実体と照合したディレクトリが0件です' };
  }
  if (result.findings.length > 0) {
    return { ok: false, reason: `${result.findings.length} 件の食い違いがあります` };
  }
  return { ok: true };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run();
  if (json) console.log(JSON.stringify(result, null, 2));

  const decision = decideExit(result);
  if (decision.ok) {
    if (!json) {
      console.log(
        `✅ steering のテスト区分の列挙は実体と一致します（網羅宣言 ${result.blocks} 件、` +
          `照合したディレクトリ ${result.claims} 件、件数の規約を照合した行 ${result.scannedLines} 行）`
      );
    }
    return;
  }

  if (!json) {
    if (result.findings.length === 0) {
      console.error(`❌ ${decision.reason}`);
      console.error(`   走査したディレクトリ: ${result.steeringDir}`);
      console.error('   リポジトリルートで実行しているか、印が消えていないか確認してください');
      process.exit(1);
    }

    console.error('❌ steering のテスト区分の列挙が実体と食い違っています');
    console.error('');
    console.error('   steering は毎セッション読み込まれる「現在の構成」の記述です。挙げていない');
    console.error('   区分があると、後任はその区分のテストが存在しないものとして扱います');
    console.error('   （タスク 115.200）。網羅宣言の中身を実測へ揃えてください。');
    console.error('');
    console.error(
      '   件数の指摘は、数値を落として数える手段（`npm --prefix backend run test` 等）'
    );
    console.error('   へ書き換えてください。網羅ではない列挙は印で囲まないでください。');
    console.error('');
    const byFile = new Map<string, Finding[]>();
    for (const finding of result.findings) {
      const key = finding.file === '' ? '(宣言の欠落)' : finding.file;
      const list = byFile.get(key) ?? [];
      list.push(finding);
      byFile.set(key, list);
    }
    for (const [file, list] of byFile) {
      console.error(`   ${file} (${list.length}件)`);
      for (const finding of list) {
        const where = finding.line > 0 ? `L${finding.line}` : '-';
        console.error(`     ${where} [${finding.kind}] ${finding.subject} — ${finding.detail}`);
        if (verbose) console.error(`        ${finding.snippet}`);
      }
    }
    console.error('');
    console.error(
      `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル（網羅宣言 ${result.blocks} 件、` +
        `照合したディレクトリ ${result.claims} 件）`
    );
  }
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
