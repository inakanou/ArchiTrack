/**
 * @fileoverview npm スクリプトが設定する環境変数に読み手がいることの検査（タスク 115.244）
 *
 * ## なぜ在るか
 *
 * かつて `backend/package.json` の `test:integration` などは `RUN_INTEGRATION_TESTS=true` を
 * 設定していたが、**この環境変数を読む側はリポジトリのどこにも無かった**。設定しても何も
 * 変わらない環境変数は、読み手に「分離されている」と誤信させる。タスク 115.216 がこの再発を
 * 機械化したが、その形には二つの穴が残った。
 *
 *   (1) **走査範囲が backend に限られていた。** ルート `package.json` と
 *       `frontend/package.json` は検査の外だった。
 *   (2) **判定器がコード注釈を読み手と誤判定した。** 読み手ゼロの変数を設定するスクリプトを
 *       足したうえで `// process.env.ARCHITRACK_PROBE_DEAD is intentionally not used here.`
 *       という**注釈だけ**を持つファイルを置くと、9/9 緑で素通りした（2026-08-31 のレビューが
 *       変異で実証）。
 *   (3) **分割代入の読みを認識しなかった。** `const { X } = process.env` は読み手に数えられず、
 *       誤検出（安全側）に倒れていた。
 *
 * 本検査は 115.216 の節を `scripts/` へ切り出し、上の三点を是正したうえで**押下前の関門と CI へ
 * 結線する**。115.216 が「押下前の関門と CI へ結線できない検査は誰も走らせない死んだ検査に
 * なる」として広域化を見送った、その結線をここで果たす。
 *
 * 使用方法:
 *   npx tsx scripts/check-dead-script-env.ts [--verbose] [--json]
 *   npm run check:dead-script-env
 *
 * ## 何を検査するか（有限集合上の全称命題）
 *
 *   `PACKAGE_MANIFESTS` が挙げる 3 つの `package.json` のスクリプトが設定する環境変数の集合を
 *   S とする。S の各要素について、`CORPUS_ROOT` 配下の実行される成果物のどこかに**読む形**が
 *   現れる。
 *
 * S は有限で小さく（2026-09-02 の実測でルート 4 スクリプトの 3 変数のみ。`frontend` と
 * `backend` は 0 件）、一件ずつ実測できる。S が空になれば本検査は何も主張しないため、
 * `decideExit` が空を失敗にする（AI運用7原則 第3原則）。
 *
 * ## 走査根をどう定めたか（適用範囲の判断）
 *
 * **定義元は 3 つの `package.json`、読み手はリポジトリ全体**という非対称な形をとる。
 * 変数を設定したスクリプトが起こすプロセスは、その package の外へ出るためである。実測（同日）:
 * ルートの `test:e2e` が設定する `DATABASE_URL` の読み手は `backend/vitest.global-setup.ts` と
 * `e2e/fixtures/database.ts`、`DISABLE_RATE_LIMIT` の読み手は
 * `backend/src/middleware/rateLimit.middleware.ts` にある。package ごとに走査根を閉じると、
 * この 2 変数は「読み手なし」と誤って告発される。
 *
 * **これは緩い側の選択である。** リポジトリ全体を読み手の母集団にすると、無関係な package が
 * 偶然同名の変数を読んでいる場合に見逃す。名前空間を分けていないこのリポジトリでは、
 * 誤検出（押下を止める）より見逃しを選ぶ判断であり、限界としてここに明記する。
 *
 * ## 検出しない形（限界。いずれも見逃し側へ倒してある）
 *
 *   - **`#` の行途中の注釈は落とさない。** YAML・シェル・`.env` は**行頭が `#` の行だけ**を
 *     落とす（行途中の `#` は文字列の中にも現れ、機械的に区別できない）。
 *     `run: foo # ${DEAD}` のような書き方は読み手として数えてしまう。
 *   - **`process.env` の別名経由の分割代入を認識しない。**
 *     `const env = process.env; const { X } = env;` は読み手に数えない（誤検出＝安全側）。
 *   - **`process.env` をそのまま渡す形を「全変数の読み手」とは数えない。**
 *     `spawn(cmd, { env: process.env })` は特定の名前を読んでいないため、名前ごとの
 *     読み手にはならない（誤検出＝安全側）。
 *   - **文書（`.md`）と定義元（`package.json` / `package-lock.json`）は読み手に数えない。**
 *     数えると、スクリプトを引用した文書が自分自身を正当化してしまう。
 *   - **正規表現リテラルの判定は前置トークンの発見的規則による**（`stripComments` の註を参照）。
 *   - **行継続で複数行に跨る文字列リテラルは文字列と見ない。** `'` / `"` / 正規表現は
 *     **同じ行の中で閉じるとき**にだけリテラルとして扱う（`closesOnSameLine`）。これは
 *     JSX の `don't` のような地の文の引用符が同じ行の `//` 注釈を覆い隠す見逃しを塞ぐための
 *     規則であり、行継続を使った多行文字列の中身は地のコードとして走査される（誤検出側）。
 *   - **`realpath` が解決できない要素は走査から落ちる。** 壊れたシンボリックリンクなどは
 *     `statSync` と同じ `catch` で落ちる（読み手を取りこぼす向き＝誤検出＝安全側）。
 *
 * ## 報告する件数は「相異なる実体」である（タスク 115.296）
 *
 * `collectCorpusFiles` は `realpath` の訪問済み集合を持ち、**同じ実体を二度走査しない**。
 * したがって `corpusFiles` は訪問回数ではなく相異なるファイル数であり、出力の語もそれに
 * 合わせてある。詳しい経緯・是正前の実測・却下した案は同関数の註に置いた。
 */

import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリルート（起動位置に依らないよう本ファイルからの相対で解決する） */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 変数の**定義元**として走査する `package.json`（リポジトリ相対）。
 *
 * 115.227 の教訓（走査根が `main()` の中にしかなく自己検査から到達できなかった）に倣い、
 * 走査根は module の頂で `export` する。自己検査はこの定数を読んで下限を導く。
 */
export const PACKAGE_MANIFESTS: readonly string[] = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
];

/** 読み手の**走査根**（リポジトリ相対）。定義元と非対称であることは冒頭の註を参照 */
export const CORPUS_ROOT: string = '.';

/** 読み手の走査から外す配下（生成物・依存物・文書だけの配下） */
export const NON_SOURCE_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'storage',
  'storage-dev',
  'data',
  'playwright-report',
  'blob-report',
  'test-results',
  'storybook-static',
  '.logs',
  '.playwright-mcp',
  '.tsbuildinfo',
]);

/** 読み手として数えないファイル名（定義元そのもの） */
export const NON_READER_FILES: ReadonlySet<string> = new Set(['package.json', 'package-lock.json']);

/** 読み手として数えない拡張子（文書・画像・書庫。`.md` は「読み手ではない」の規約） */
export const NON_READER_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.pdf',
  '.zip',
  '.gz',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.chm',
  '.log',
  '.lock',
]);

/** 注釈の除去に JS/TS の規則を当てる拡張子 */
export const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/** 行頭 `#` を注釈として落とす拡張子（YAML・シェル・環境ファイル） */
export const HASH_COMMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.yml',
  '.yaml',
  '.sh',
  '.bash',
  '.env',
  '.example',
  '.conf',
  '.toml',
]);

/** コーパスの一要素（読み手の候補となる 1 ファイル） */
export interface CorpusFile {
  /** リポジトリ相対パス */
  readonly file: string;
  /** 注釈を除去した後の本文 */
  readonly text: string;
}

/** 定義元が設定する環境変数の 1 件 */
export interface Assignment {
  /** 定義元の `package.json`（リポジトリ相対） */
  readonly manifest: string;
  /** スクリプト名 */
  readonly script: string;
  /** 環境変数名 */
  readonly name: string;
}

/** 検出された「死んだ環境変数」1 件 */
export interface Finding {
  readonly name: string;
  /** その名前を設定している定義元とスクリプトの一覧（`manifest#script`） */
  readonly setBy: readonly string[];
}

/** 走査の結果 */
export interface RunResult {
  readonly assignments: readonly Assignment[];
  readonly scannedManifests: readonly string[];
  readonly missingManifests: readonly string[];
  /**
   * 走査した読み手候補の**相異なる実体**の数（タスク 115.296）。
   *
   * 訪問回数ではない。`collectCorpusFiles` が `realpath` の訪問済み集合を持つため、同じ実体へ
   * 二つの経路（`src -> backend/src` など）が在っても 1 と数える。
   */
  readonly corpusFiles: number;
  /** 訪問済みの実体だったために降りなかった要素の数（リンク経由の再訪の枝刈り数） */
  readonly revisitedEntriesSkipped: number;
  readonly distinctNames: readonly string[];
  readonly findings: readonly Finding[];
}

// ============================================================================
// 定義元: npm スクリプトが設定する環境変数
// ============================================================================

/**
 * npm スクリプトの文字列から、コマンドの先頭位置に置かれた `VAR=value` の変数名を取り出す。
 * 先頭・`;` `&&` `||` `|` の直後・`cross-env` / `env` の直後を「コマンドの先頭位置」とみなす。
 * （タスク 115.216 の実装をそのまま引き継ぐ）
 */
export function extractAssignedEnvNames(script: string): string[] {
  const assignmentRun =
    /(?:^|[;&|]\s*|\bcross-env\s+|\benv\s+)((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+)/g;
  const names: string[] = [];

  let match: RegExpExecArray | null = assignmentRun.exec(script);
  while (match !== null) {
    const assignmentRunText = match[1];
    if (assignmentRunText !== undefined) {
      for (const assignment of assignmentRunText.trim().split(/\s+/)) {
        const name = assignment.split('=')[0];
        if (name !== undefined && name !== '') {
          names.push(name);
        }
      }
    }
    match = assignmentRun.exec(script);
  }

  return names;
}

/** `PACKAGE_MANIFESTS` を読み、設定されている環境変数を定義元つきで集める */
export function collectAssignments(root: string): {
  assignments: Assignment[];
  scanned: string[];
  missing: string[];
} {
  const assignments: Assignment[] = [];
  const scanned: string[] = [];
  const missing: string[] = [];

  for (const manifest of PACKAGE_MANIFESTS) {
    const absolute = path.join(root, manifest);
    let raw: string;
    try {
      raw = readFileSync(absolute, 'utf-8');
    } catch {
      missing.push(manifest);
      continue;
    }
    scanned.push(manifest);
    const scripts: Record<string, string> = JSON.parse(raw).scripts ?? {};
    for (const [script, body] of Object.entries(scripts)) {
      for (const name of extractAssignedEnvNames(body)) {
        assignments.push({ manifest, script, name });
      }
    }
  }

  return { assignments, scanned, missing };
}

// ============================================================================
// 判定器: 注釈の除去
// ============================================================================

/**
 * `index` の位置の区切り文字が**同じ行の中で閉じる**か。
 *
 * JS の `'` / `"` の文字列リテラルと正規表現リテラルは改行を跨げない。したがって同じ行に
 * 閉じが無い `'` は文字列の開始ではなく、地の文の引用符である（JSX の `don't` など）。
 * この判定を持たないと、`const el = <p>don't</p>; // process.env.DEAD` の `'` から行末までが
 * 文字列扱いになり、**同じ行の `//` 注釈が除去されずに読み手として残る**（見逃し側の欠陥。
 * タスク 115.244 のレビューが実測で検出した）。
 *
 * **限界**: 行継続（`\` の直後に改行）で複数行に跨る文字列は「閉じない」と判定するため、
 * その中身を地のコードとして走査する。注釈の除去が過剰に働きうる（＝誤検出側）が、
 * この書き方はリポジトリに現れない。
 */
function closesOnSameLine(source: string, index: number, delimiter: string): boolean {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '\n') return false;
    if (character === '\\') {
      cursor += 1;
      continue;
    }
    if (character === delimiter) return true;
  }
  return false;
}

/** 直前のトークンから、`/` が正規表現リテラルの開始でありうるかを判定する発見的規則 */
function regexCanStart(tail: string): boolean {
  const trimmed = tail.trimEnd();
  if (trimmed === '') return true;
  // アロー関数の直後は正規表現が来うる（`() => /re/.test(s)`）
  if (trimmed.endsWith('=>')) return true;
  // **`<` と `>` を単体では前置と見ない。** JSX の閉じ札 `</p>` の `/` を正規表現の開始と
  // 誤ると、その先の `//` 注釈の最初の `/` までを正規表現の中身として飲み込み、注釈が
  // 除去されずに残る（`const el = <p>don't</p>; // process.env.DEAD` で実測）。
  // 比較演算子の直後に正規表現リテラルが来る書き方（`a < /re/`）は実在しない。
  if (/[(,=:[!&|?{};+\-*%~^]$/.test(trimmed)) return true;
  return /\b(return|typeof|case|in|of|do|else|yield|await|new|delete|void|throw)$/.test(trimmed);
}

/**
 * JS/TS の注釈（`//` と `/* *\/`）を除去する。改行は保つ。
 *
 * **文字列リテラル・テンプレートリテラル・正規表現リテラルの中の `//` を注釈と誤らない**
 * ことが要点である（タスク 115.226 / 115.259 と同型の脆さ）。`'http://example'` の `//` を
 * 注釈として落とすと、その行の以降にある `process.env.X` が消えて**誤検出**になる。
 *
 * 状態機械で code / 行注釈 / ブロック注釈 / `'` / `"` / テンプレート / 正規表現 を区別する。
 * テンプレートの `${ }` は入れ子を数えて code へ戻す。
 *
 * リテラルの開始は**同じ行の中で閉じること**を条件にする（`closesOnSameLine`）。これが無いと
 * `const el = <p>don't</p>; // process.env.DEAD` の `'` から行末までが文字列扱いになり、
 * 同じ行の `//` 注釈が生き残る（115.244 のレビューが実測した見逃し）。
 *
 * **限界**: 正規表現リテラルの開始判定は `regexCanStart` の発見的規則による。判定を誤って
 * 除算を正規表現と見た場合、その先の閉じ `/` までが文字列扱いになり注釈の除去が効かなくなる
 * （＝見逃し側）。逆に正規表現を除算と見た場合、`/\/\//` のような中身の `//` を注釈と誤り
 * 行末までを落とす（＝誤検出側）。どちらも本検査の自己検査に陰性対照を置いてある。
 */
export function stripComments(source: string): string {
  const out: string[] = [];
  let tail = '';
  const pushCode = (character: string): void => {
    out.push(character);
    if (!/\s/.test(character)) {
      tail = (tail + character).slice(-32);
    } else {
      tail = (tail + ' ').slice(-32);
    }
  };

  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex';
  let mode: Mode = 'code';
  /** テンプレートの `${` に入ったときの波括弧の深さ（戻り先の目印） */
  const templateDepths: number[] = [];
  let braceDepth = 0;
  let index = 0;

  while (index < source.length) {
    const current = source[index] as string;
    const next = source[index + 1] ?? '';

    if (mode === 'code') {
      if (current === '/' && next === '/') {
        mode = 'line';
        index += 2;
        continue;
      }
      if (current === '/' && next === '*') {
        mode = 'block';
        index += 2;
        continue;
      }
      if (current === "'" && closesOnSameLine(source, index, "'")) {
        mode = 'single';
        pushCode(current);
        index += 1;
        continue;
      }
      if (current === '"' && closesOnSameLine(source, index, '"')) {
        mode = 'double';
        pushCode(current);
        index += 1;
        continue;
      }
      if (current === '`') {
        mode = 'template';
        pushCode(current);
        index += 1;
        continue;
      }
      if (current === '/' && regexCanStart(tail) && closesOnSameLine(source, index, '/')) {
        mode = 'regex';
        pushCode(current);
        index += 1;
        continue;
      }
      if (current === '{') {
        braceDepth += 1;
      } else if (current === '}') {
        const resume = templateDepths[templateDepths.length - 1];
        if (resume !== undefined && resume === braceDepth - 1) {
          templateDepths.pop();
          braceDepth -= 1;
          mode = 'template';
          pushCode(current);
          index += 1;
          continue;
        }
        braceDepth -= 1;
      }
      pushCode(current);
      index += 1;
      continue;
    }

    if (mode === 'line') {
      if (current === '\n') {
        mode = 'code';
        out.push(current);
      }
      index += 1;
      continue;
    }

    if (mode === 'block') {
      if (current === '*' && next === '/') {
        mode = 'code';
        out.push(' ');
        index += 2;
        continue;
      }
      if (current === '\n') {
        out.push(current);
      }
      index += 1;
      continue;
    }

    if (mode === 'single' || mode === 'double' || mode === 'regex') {
      if (current === '\\') {
        out.push(current);
        const escaped = source[index + 1];
        if (escaped !== undefined) out.push(escaped);
        index += 2;
        continue;
      }
      out.push(current);
      const closes =
        (mode === 'single' && current === "'") ||
        (mode === 'double' && current === '"') ||
        (mode === 'regex' && current === '/');
      if (closes) {
        // 正規表現を閉じた直後の `/` は除算である。`tail` を識別子で終わらせて誤判定を防ぐ
        tail = (tail + (mode === 'regex' ? 'x' : current)).slice(-32);
        mode = 'code';
      } else if (current === '\n') {
        // 保険。開始時に `closesOnSameLine` で同一行の閉じを確かめているため通常は到達しない
        mode = 'code';
      }
      index += 1;
      continue;
    }

    // mode === 'template'
    if (current === '\\') {
      out.push(current);
      const escaped = source[index + 1];
      if (escaped !== undefined) out.push(escaped);
      index += 2;
      continue;
    }
    if (current === '$' && next === '{') {
      out.push('$', '{');
      templateDepths.push(braceDepth);
      braceDepth += 1;
      mode = 'code';
      tail = (tail + '{').slice(-32);
      index += 2;
      continue;
    }
    out.push(current);
    if (current === '`') {
      mode = 'code';
      tail = (tail + '`').slice(-32);
    }
    index += 1;
  }

  return out.join('');
}

/** 行頭が `#` の行を落とす（YAML・シェル・環境ファイルの注釈。行途中の `#` は落とさない） */
export function stripHashCommentLines(source: string): string {
  return source
    .split('\n')
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');
}

/** 拡張子に応じた注釈の除去を当てる */
export function normalizeForReadScan(file: string, text: string): string {
  const extension = path.extname(file).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(extension)) return stripComments(text);
  if (HASH_COMMENT_EXTENSIONS.has(extension) || extension === '') {
    // 拡張子の無いファイル（`.husky/pre-push` など）はシェルとして扱う
    return stripHashCommentLines(text);
  }
  return text;
}

// ============================================================================
// 判定器: 読み手の認識
// ============================================================================

/**
 * `const { X, Y: alias, Z = 'd' } = process.env` の左辺に現れる**鍵**を集める。
 *
 * タスク 115.244 の (3)。分割代入を読み手に数えないと、正しく読んでいる変数を
 * 「死んでいる」と誤って告発する。
 *
 * **限界**: 入れ子の波括弧を含む形と、計算された鍵（`{ ['X']: y }`）は拾わない。
 * いずれも読み手を取りこぼす向き（＝誤検出＝安全側）である。
 */
export function destructuredEnvNames(source: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\{([^{}]*)\}\s*(?::[^=]*?)?=\s*process\s*\.\s*env\b/g;

  let match: RegExpExecArray | null = pattern.exec(source);
  while (match !== null) {
    const bindings = match[1];
    if (bindings !== undefined) {
      for (const entry of bindings.split(',')) {
        const key = entry.trim().split(/[:=]/)[0]?.trim() ?? '';
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          names.add(key);
        }
      }
    }
    match = pattern.exec(source);
  }

  return names;
}

/**
 * `name` を**読む**書き方が `corpus` に現れるか。
 *
 * 綴りが現れるだけでは読み手と数えない。注釈・設定・本検査自身が名前に言及するだけで
 * 「読まれている」と誤判定してしまい、まさに死んだ環境変数を見逃す判定器になるためである
 * （タスク 115.216 が自分の判定器に見つけた欠陥）。
 */
export function isReadSomewhere(
  name: string,
  corpus: string,
  destructured: ReadonlySet<string>
): boolean {
  if (destructured.has(name)) return true;

  const readForms = [
    // TypeScript / JavaScript
    new RegExp(`process\\.env\\.${name}\\b`),
    new RegExp(`process\\.env\\[\\s*['"\`]${name}['"\`]\\s*\\]`),
    // シェル・CI・compose の参照
    new RegExp(`\\$\\{?${name}\\b`),
  ];

  return readForms.some((form) => form.test(corpus));
}

/** `names` のうち、`corpus` のどこからも読まれていないもの（＝死んだ環境変数） */
export function findDeadEnvNames(
  names: readonly string[],
  corpus: string,
  destructured: ReadonlySet<string> = new Set()
): string[] {
  return [...new Set(names)].filter((name) => !isReadSomewhere(name, corpus, destructured)).sort();
}

// ============================================================================
// コーパスの収集
// ============================================================================

/**
 * 同じディレクトリの要素を「リンクでないものが先、同じ種別では名前の昇順」に並べる
 * （タスク 115.296）。
 *
 * 訪問済み集合と対にして使う。集合だけでは、同じ実体へ二つの経路が在るとき**どちらが代表に
 * なるかが `readdirSync` の返す順（環境依存）で決まってしまう**。リンクでない側を先に置けば、
 * 実体と同じディレクトリに並んでいる限り代表は実体の側になる。
 */
export function orderRealEntriesFirst(directory: string, entries: readonly string[]): string[] {
  const isLink = new Map<string, boolean>();
  for (const entry of entries) {
    try {
      isLink.set(entry, lstatSync(path.join(directory, entry)).isSymbolicLink());
    } catch {
      isLink.set(entry, false);
    }
  }
  return [...entries].sort((left, right) => {
    const leftLink = isLink.get(left) === true ? 1 : 0;
    const rightLink = isLink.get(right) === true ? 1 : 0;
    if (leftLink !== rightLink) return leftLink - rightLink;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * 走査根の配下から、読み手の候補となるファイルを注釈を除いて集める。
 *
 * **実体（`realpath`）の訪問済み集合を持つ**（タスク 115.296）。走査根 `CORPUS_ROOT` の直下には
 * `backend/` を指すシンボリックリンクが二つ在り（`src -> backend/src` と
 * `prisma -> backend/prisma`）、`statSync` はリンクを追うため、集合が無いと両者の配下は実体と
 * 併せて**二度**走査される。是正前の実測（2026-09-05、コミット `7267c757` のツリー。検査自身の
 * 拡張子・除外の絞り込みで測った）は、リンク追従の訪問回数 2535・相異なる実体 2018・差 517
 * （`src` 経由 480 / `prisma` 経由 37）であり、**報告していた「走査した読み手候補 2535 ファイル」は
 * 相異なるファイル数ではなく訪問回数だった**。
 *
 * **判定そのものは二度読んでも変わらない。** 読み手は和集合であり、同じ実体を二度読んでも
 * 読み手が増えるだけで見逃しにはならない。集合を入れた理由は二つである。
 *
 *   1. **件数の語を実態へ合わせる。** 数を報告するなら、何を数えたのかが語と一致していなければ
 *      ならない。訪問回数はリンクの配置という偶発に依存し、コーパスの性質ではない。
 *   2. **循環で無限降下しない。** 是正前は訪問済み集合が無く、走査根へ戻るリンク（`loop -> .`）を
 *      一本置いただけで走査が発散した——実測では 2 分 43 秒でヒープ 2GB を使い切り
 *      `FATAL ERROR: Ineffective mark-compacts near heap limit` で異常終了した（EXIT=134。
 *      2026-09-05、コミット `7267c757` の作業ツリーにリンクを作って実測し、リンクは撤去した）。
 *      現状の二つのリンクは循環していないが、それは現況であって構造上の保証ではない。
 *
 * 並びを `orderRealEntriesFirst` で固定するのは、同じ実体へ二つの経路が在るとき**どちらの
 * 相対パスを代表に残すかを決めるため**である。集合だけでは、`readdirSync` の返す順（環境依存）で
 * 代表が入れ替わる。リンクでない要素を先に置くので、代表は実体の側になる。
 *
 * **限界**: 訪問済み集合は 1 回の呼び出しの中だけで持つ。`realpath` が解決できないもの
 * （壊れたリンクなど）は `statSync` と同じ `catch` で走査から落ちる（＝読み手を取りこぼす向き
 * ＝誤検出＝安全側）。実体が**リンク経由でしか到達できない**位置に在る場合、代表はリンクの
 * 側になる（同じディレクトリに実体が並んでいないため）。
 */
export function collectCorpusFiles(root: string): {
  files: CorpusFile[];
  revisitedEntriesSkipped: number;
} {
  const files: CorpusFile[] = [];
  /** 訪問済みの実体（`realpath`）。二度降りないことと、循環で止まることの両方をこの集合が担う */
  const visited = new Set<string>();
  let revisitedEntriesSkipped = 0;

  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of orderRealEntriesFirst(directory, entries)) {
      if (NON_SOURCE_DIRECTORIES.has(entry)) continue;
      const absolute = path.join(directory, entry);
      let isDirectory: boolean;
      let real: string;
      try {
        isDirectory = statSync(absolute).isDirectory();
        real = realpathSync(absolute);
      } catch {
        continue;
      }
      if (visited.has(real)) {
        revisitedEntriesSkipped += 1;
        continue;
      }
      visited.add(real);
      if (isDirectory) {
        walk(absolute);
        continue;
      }
      if (NON_READER_FILES.has(entry)) continue;
      if (NON_READER_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
      let raw: string;
      try {
        raw = readFileSync(absolute, 'utf-8');
      } catch {
        continue;
      }
      const relative = path.relative(root, absolute);
      files.push({ file: relative, text: normalizeForReadScan(relative, raw) });
    }
  };

  const scanRoot = path.resolve(root, CORPUS_ROOT);
  try {
    // 走査根そのものを訪問済みにする。走査根へ戻るリンク（`loop -> .`）を最初の一段で止める
    visited.add(realpathSync(scanRoot));
  } catch {
    visited.add(scanRoot);
  }
  walk(scanRoot);
  return { files, revisitedEntriesSkipped };
}

// ============================================================================
// 走査と判定
// ============================================================================

export function run(root: string = REPO_ROOT): RunResult {
  const { assignments, scanned, missing } = collectAssignments(root);
  const { files: corpusFiles, revisitedEntriesSkipped } = collectCorpusFiles(root);
  const corpus = corpusFiles.map((entry) => entry.text).join('\n');
  const destructured = destructuredEnvNames(corpus);

  const distinctNames = [...new Set(assignments.map((entry) => entry.name))].sort();
  const dead = findDeadEnvNames(distinctNames, corpus, destructured);

  const findings: Finding[] = dead.map((name) => ({
    name,
    setBy: assignments
      .filter((entry) => entry.name === name)
      .map((entry) => `${entry.manifest}#${entry.script}`),
  }));

  return {
    assignments,
    scannedManifests: scanned,
    missingManifests: missing,
    corpusFiles: corpusFiles.length,
    revisitedEntriesSkipped,
    distinctNames,
    findings,
  };
}

// ============================================================================
// 開示（印字）。**純関数として切り出す**（タスク 115.296）
// ============================================================================
//
// 件数の印字を定数へ置き換えても自己検査が緑なら、開示の側に穴が在る（タスク 115.293 /
// 115.294 の教訓）。`main` の中の文字列連結のままでは、自己検査は「実行して出た文字列」しか
// 見られず、その文字列が引数に**追随している**ことを示せない。純関数へ切り出せば、自己検査は
// 同じ関数へ違う `RunResult` を与えて出力が変わることを直接確かめられる。

/** 合格時の要約行。件数はすべて `result` から出す（定数を書かないこと） */
export function formatSuccessSummary(result: RunResult): string {
  return (
    `✅ npm スクリプトが設定する環境変数には読み手がいます` +
    `（定義元 ${result.scannedManifests.length} ファイル、設定 ${result.assignments.length} 件、` +
    `相異なる変数 ${result.distinctNames.length} 件、` +
    `走査した読み手候補 ${result.corpusFiles} ファイル（相異なる実体。` +
    `リンク経由の再訪 ${result.revisitedEntriesSkipped} 件は降りていない））`
  );
}

/** 検出時の合計行。同じ語で同じ量を述べる（合格時と食い違わせないこと） */
export function formatFailureSummary(result: RunResult): string {
  return (
    `   合計 ${result.findings.length} 件 / 相異なる変数 ${result.distinctNames.length} 件` +
    `（走査した読み手候補 ${result.corpusFiles} ファイル（相異なる実体。` +
    `リンク経由の再訪 ${result.revisitedEntriesSkipped} 件は降りていない））`
  );
}

/** 走査が空振りしていないかの判定。0 件の合格を合格にしない（AI運用7原則 第3原則） */
export function decideExit(result: RunResult): { ok: boolean; reason?: string } {
  if (result.missingManifests.length > 0) {
    return {
      ok: false,
      reason: `走査対象の package.json が見つかりません: ${result.missingManifests.join(', ')}`,
    };
  }
  if (result.scannedManifests.length !== PACKAGE_MANIFESTS.length) {
    return {
      ok: false,
      reason: `走査した package.json が ${result.scannedManifests.length} 件で、宣言した ${PACKAGE_MANIFESTS.length} 件と一致しません`,
    };
  }
  if (result.corpusFiles === 0) {
    return { ok: false, reason: '読み手の走査対象が一件も見つかりませんでした' };
  }
  if (result.assignments.length === 0) {
    return {
      ok: false,
      reason:
        'どの package.json のスクリプトも環境変数を設定していません（母集団が空。本検査は何も主張していません）',
    };
  }
  if (result.distinctNames.length === 0) {
    return { ok: false, reason: '設定は在るのに環境変数名が一つも取り出せませんでした' };
  }
  if (result.findings.length > 0) {
    return { ok: false, reason: `${result.findings.length} 件の死んだ環境変数があります` };
  }
  return { ok: true };
}

export function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run();
  if (json) console.log(JSON.stringify(result, null, 2));

  const decision = decideExit(result);
  if (decision.ok) {
    if (!json) {
      console.log(formatSuccessSummary(result));
      if (verbose) {
        for (const name of result.distinctNames) {
          const setBy = result.assignments
            .filter((entry) => entry.name === name)
            .map((entry) => `${entry.manifest}#${entry.script}`);
          console.log(`   ${name} ← ${setBy.join(', ')}`);
        }
      }
    }
    // 失敗既定（module の頂）をここで解除する。成功の経路を通ったときだけ EXIT=0 になる
    process.exitCode = 0;
    return;
  }

  if (!json) {
    if (result.findings.length === 0) {
      console.error(`❌ ${decision.reason}`);
      console.error(`   走査根: ${REPO_ROOT}`);
      console.error('   リポジトリルートで実行しているか確認してください');
      process.exit(1);
    }

    console.error('❌ 誰も読まない環境変数を設定している npm スクリプトがあります');
    console.error('');
    console.error('   設定しても何も変わらない環境変数は、読み手に「効いている」と誤信させます');
    console.error('   （タスク 115.216 / 115.244）。読む側を実装するか、設定を撤去してください。');
    console.error('');
    for (const finding of result.findings) {
      console.error(`   ${finding.name}`);
      for (const setter of finding.setBy) {
        console.error(`     設定元: ${setter}`);
      }
    }
    console.error('');
    console.error(formatFailureSummary(result));
    if (verbose) {
      console.error('');
      console.error('   設定の一覧:');
      for (const entry of result.assignments) {
        console.error(`     ${entry.manifest}#${entry.script}: ${entry.name}`);
      }
    }
  }
  process.exit(1);
}

// ============================================================================
// 失敗既定（タスク 115.244。115.242 が残した穴を持ち込まないため）
// ============================================================================
//
// `scripts/check-design-path-references.selftest.ts` は**入口の呼び出しを消すと出力ゼロ・
// EXIT=0 で通る**穴を抱えている（後続 115.295 の所管）。同じ形にしないため、module の頂で
// `process.exitCode = 1` を立て、`main()` が**成功の経路を通ったときだけ** 0 に戻す。
// 入口の `main()` を消しても、`main()` の中の成功分岐を消しても EXIT=1 のままになる。
//
// **副作用の開示**: 本 module を `import` した側も EXIT=1 を引き継ぐ。読み手は自己検査だけで、
// そちらも同じ失敗既定を持ち、自分の成功時に 0 へ戻す。ほかから import しないこと。
process.exitCode = 1;

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
