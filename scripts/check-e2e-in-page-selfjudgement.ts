/**
 * @fileoverview E2Eの「画面の中で判定を自前で書き起こし、その書き起こしに主張する」構造の検出
 *
 * site-survey タスク 115.108 が扱う型である。E2E が `page.evaluate` などで画面へ送り込む
 * スクリプトの中に、本番が行うはずの判定を自分で書き直し、その結果へ主張する形を指す。
 * この形は本番のコードを一度も通らないにもかかわらず、要件番号の札が付いているため
 * 被覆として正規に数えられてしまう。
 *
 * 実例（タスク 115.81 で書き直される前の e2e/specs/site-surveys/site-survey-responsive.spec.ts）:
 *
 *   const detection = await page.evaluate(() => {
 *     const testError22 = { code: 22, name: 'QuotaExceededError' };
 *     return { detectsCode22: testError22.code === 22 };
 *   });
 *   expect(detection.detectsCode22).toBeTruthy();   // 本番の isQuotaExceededError を通らない
 *
 *   const hasSupport = await page.evaluate(() => {
 *     return true; // 実装が存在することを前提
 *   });
 *   expect(hasSupport).toBeTruthy();                // 真をそのまま返す一行
 *
 *   const lruWorks = await page.evaluate(() => {
 *     ['lru_test_1'].forEach((k) => localStorage.setItem(k, 'v'));
 *     return ['lru_test_1'].every((k) => localStorage.getItem(k) !== null);
 *   });
 *   expect(lruWorks).toBeTruthy();                  // 自分で書いた値を自分で読み返している
 *
 * 既存の scripts/check-e2e-assertion-guards.ts は恒真式（T3）と条件包み（T1/T5）を見るが、
 * この形は恒真式でも条件包みでもないため素通りする。両者は補い合う関係にある。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-in-page-selfjudgement.ts [--verbose]
 *   npm run check:e2e-selfjudge
 *
 * 検出規則:
 *   R1 literal-only     画面へ送るスクリプトが引数を取らず、画面の状態へ触れる語を
 *                       一つも含まないまま値を返し、**その返り値が呼び出し側で消費される**。
 *                       返り値はテスト自身が書いたリテラルからしか決まらないため、
 *                       その値への主張はテスト自身への主張である。
 *   R2 self-read-back   同じスクリプトの中で書いた鍵だけを読み返して返し、
 *                       **その返り値が呼び出し側で消費される**。
 *                       本番が書いた値を一度も読まないため、同じく本番を通らない。
 *
 * 「返り値が消費される」ことを条件に含める理由:
 *   本規則の根拠は「その値への主張はテスト自身への主張である」ことにある。したがって
 *   **主張に使われない返り値は本規則の対象ではない**。返り値を束縛しない
 *   `await page.waitForFunction(() => true)` は、直後に別途 production を通る主張が置かれた
 *   死んだ一行にすぎず、偽の緑ではない。この条件を欠くと本検出器は、負債ではない書き方に対して
 *   赤を出し続ける検査になる。消費とみなすのは代入・宣言・return / yield・
 *   他の呼び出しの引数・括弧で包まれた部分式・プロパティ値や三項の枝・
 *   テンプレート文字列への埋め込みである。判定は isCallResultConsumed が
 *   呼び出しの手前を後ろ向きに読んで行い、scanSource から適用する。
 *   返り値に意味の無い addInitScript は、この条件により常に対象外となる。
 *
 * 対象外:
 *   - 要素ハンドルや引数を受け取るスクリプト（`locator.evaluate((el) => el.tagName)` 等）。
 *     画面から渡された値に触れているため、本規則の対象ではない。
 *   - 画面の状態へ触れる語（document / window / globalThis / localStorage / 本番が置く目印 等）を
 *     含むスクリプト。ただし R2 に当たる読み返しは localStorage を含んでいても検出する。
 *   - 返り値を消費しない呼び出し（文の位置に置かれた `await page.waitForFunction(...)` 等）。
 *
 * 検出できない形（既知の限界）:
 *   本規則は「テスト自身が書いた値しか見ていないか」を構造から判定する。したがって
 *   ブラウザの挙動そのものは観測しているが本番の実装には一度も触れない形
 *   （例: `localStorage.setItem(testKey, 'x')` が例外を投げないことをもって
 *   「利用可能」と主張する probe）は捕捉できない。これを機械的に判定するには
 *   「その検証が参照する本番のシンボルが本番の経路から到達するか」を見る必要があり、
 *   タスク 115.109 の所管である。
 *
 * 第3原則（テストを前提条件で自動的に無効化しない）に従い、走査対象が 0 件のとき、
 * および画面へ送るスクリプトを 1 件も抽出できなかったときは合格にせず失敗する。
 *
 * 兄弟の検査（check-e2e-assertion-guards / check-design-refs / check-req-coverage）と同じく、
 * 自己検査を先行させたうえで .husky/scripts/pre-push.sh と .github/workflows/ci.yml から実行する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// 型定義
// ============================================================================

/** 検出規則の識別子 */
export type RuleId = 'R1-literal-only' | 'R2-self-read-back';

/** 検出結果の一件 */
export interface Finding {
  /** リポジトリ相対のファイルパス */
  file: string;
  /** 呼び出しの行番号（1 始まり） */
  line: number;
  /** 呼び出したメソッド名（evaluate / waitForFunction 等） */
  method: string;
  /** 当たった規則 */
  rule: RuleId;
  /** 画面へ送るスクリプトの抜粋 */
  excerpt: string;
}

/** 一ファイルの走査結果 */
export interface FileScanResult {
  /** 画面へ送るスクリプトの抽出件数（走査が空振りしていないことの根拠） */
  inPageScriptCount: number;
  /** 検出結果 */
  findings: Finding[];
}

// ============================================================================
// 定数
// ============================================================================

/** 走査対象の根 */
export const E2E_ROOT = path.resolve(fileURLToPath(new URL('../e2e', import.meta.url)));

/** リポジトリの根 */
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * 画面の中でスクリプトを走らせる呼び出し
 *
 * `$eval` / `$$eval` は第一引数が選択子で、画面へ送るのは第二引数である。
 */
const IN_PAGE_CALLS: ReadonlyArray<{ name: string; callbackArgIndex: number }> = [
  { name: 'evaluate', callbackArgIndex: 0 },
  { name: 'evaluateHandle', callbackArgIndex: 0 },
  { name: 'waitForFunction', callbackArgIndex: 0 },
  { name: 'addInitScript', callbackArgIndex: 0 },
  { name: '$eval', callbackArgIndex: 1 },
  { name: '$$eval', callbackArgIndex: 1 },
];

/**
 * 「画面の状態へ触れている」と認める語
 *
 * ブラウザにしか存在しない大域と、本番が画面へ置く目印（`__` で始まる大域）を含む。
 * これらのいずれかに触れていれば、返り値はテスト自身のリテラルだけでは決まらない。
 */
const PAGE_STATE_TOKENS = [
  'document',
  'window',
  'globalThis',
  'self',
  'navigator',
  'location',
  'history',
  'screen',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'performance',
  'getComputedStyle',
  'matchMedia',
  'requestAnimationFrame',
  'requestIdleCallback',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'crypto',
  'btoa',
  'atob',
  'alert',
  'confirm',
  'prompt',
  'Storage',
  'DataTransfer',
  'DragEvent',
  'ClipboardEvent',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'TouchEvent',
  'Blob',
  'File',
  'FileList',
  'FormData',
  'URL',
  'Image',
  'Element',
  'HTMLElement',
  'Node',
  'NodeList',
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
  'DOMException',
] as const;

const PAGE_STATE_RE = new RegExp(`\\b(${PAGE_STATE_TOKENS.join('|')})\\b`);

/** 本番が画面へ置く目印（`window.__fabricCanvas` など）への参照 */
const PAGE_MARKER_RE = /\b__[A-Za-z][\w$]*\b/;

// ============================================================================
// 走査
// ============================================================================

/** e2e 配下の TypeScript を列挙する */
export function collectE2eFiles(root: string = E2E_ROOT): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  if (fs.existsSync(root)) {
    walk(root);
  }
  return files.sort();
}

/**
 * `(` の位置から釣り合う `)` までの中身を返す
 *
 * 文字列・テンプレート文字列・行コメント・ブロックコメントの中の括弧は数えない。
 */
function extractArgumentList(source: string, openParenIndex: number): string | null {
  let depth = 0;
  let index = openParenIndex;
  while (index < source.length) {
    const char = source[index]!;
    const rest = source.slice(index, index + 2);

    if (rest === '//') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (rest === '/*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0 && char === ')') {
        return source.slice(openParenIndex + 1, index);
      }
    }
    index += 1;
  }
  return null;
}

/** 文字列リテラルの終端の次の位置を返す */
function skipStringLiteral(source: string, start: number): number {
  const quote = source[start]!;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

/** 引数の並びを最上位のコンマで分ける */
function splitTopLevelArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let index = 0;
  while (index < args.length) {
    const char = args[index]!;
    const rest = args.slice(index, index + 2);

    if (rest === '//') {
      const end = args.indexOf('\n', index);
      const stop = end === -1 ? args.length : end;
      current += args.slice(index, stop);
      index = stop;
      continue;
    }
    if (rest === '/*') {
      const end = args.indexOf('*/', index + 2);
      const stop = end === -1 ? args.length : end + 2;
      current += args.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const stop = skipStringLiteral(args, index);
      current += args.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);
  return parts;
}

// ============================================================================
// 返り値が消費されるか（呼び出し側の構造）
// ============================================================================

/** 識別子を構成する文字 */
function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

/**
 * コメントと文字列の中身を空白へ潰した写しを返す
 *
 * 位置は元の原文と一対一で保たれるため、原文で得た添字をそのまま使える。
 * 呼び出しの手前を後ろ向きに読むとき、コメントや文字列の中の記号を
 * 構文上の記号と取り違えないようにするために用いる。
 *
 * 引用符が改行を跨いだ場合（`'` `"` のみ）は文字列ではないと見なして潰さない。
 * 正規表現リテラルの中の引用符（`/['"]/` 等）を文字列の始まりと誤読して、
 * それ以降のファイル全体を潰してしまう事故を一行に閉じ込めるためである。
 */
export function maskCommentsAndStrings(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let index = from; index < to; index += 1) {
      if (source[index] !== '\n') out[index] = ' ';
    }
  };

  let index = 0;
  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    if (pair === '//') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    const char = source[index]!;
    if (char === "'" || char === '"' || char === '`') {
      const stop = skipStringLiteral(source, index);
      const body = source.slice(index + 1, stop);
      if (char !== '`' && body.includes('\n')) {
        index += 1;
        continue;
      }
      blank(index + 1, stop);
      index = stop;
      continue;
    }
    index += 1;
  }
  return out.join('');
}

/** from 以前で最初に現れる空白でない文字の位置を返す（無ければ -1） */
function previousSignificantIndex(masked: string, from: number): number {
  let index = from;
  while (index >= 0 && /\s/.test(masked[index]!)) index -= 1;
  return index;
}

/** 閉じ括弧の位置から、釣り合う開き括弧の位置を返す（見つからなければ -1） */
function matchingOpenIndex(masked: string, closeIndex: number): number {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const char = masked[index]!;
    if (char === ')' || char === ']' || char === '}') {
      depth += 1;
    } else if (char === '(' || char === '[' || char === '{') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * `.evaluate` の `.` の位置から、その呼び出し式全体の先頭の位置を返す
 *
 * 受け手の連なり（`page`・`this.page`・`getPage().frame`・`page?.` 等）を
 * 後ろ向きに辿り、頭にある識別子の先頭を返す。
 */
function expressionStartIndex(masked: string, dotIndex: number): number {
  let index = dotIndex - 1;
  for (;;) {
    index = previousSignificantIndex(masked, index);
    if (index < 0) return 0;
    const char = masked[index]!;

    if (char === ')' || char === ']') {
      const open = matchingOpenIndex(masked, index);
      if (open < 0) return index + 1;
      index = open - 1;
      continue;
    }

    if (isIdentifierChar(char)) {
      let start = index;
      while (start >= 0 && isIdentifierChar(masked[start])) start -= 1;
      const before = previousSignificantIndex(masked, start);
      if (before >= 0 && masked[before] === '.') {
        // `?.` の省略可能連結も一つの連なりとして辿る
        index = masked[before - 1] === '?' ? before - 2 : before - 1;
        continue;
      }
      return start + 1;
    }

    return index + 1;
  }
}

/** 値が使われている位置ではないことを示す、直前の文字 */
const STATEMENT_BOUNDARY_CHARS = new Set([';', '}', ')', ']']);

/** 値がその場から持ち出されることを示す、直前の語 */
const CONSUMING_KEYWORDS = new Set(['return', 'yield', 'typeof', 'new', 'instanceof', 'in', 'of']);

/** 値を素通りさせるだけで、消費とは見なさない直前の語 */
const TRANSPARENT_KEYWORDS = new Set(['await', 'void']);

/**
 * 画面へ送る呼び出しの返り値が呼び出し側で消費されるかを判定する
 *
 * 消費とみなすのは代入・宣言・`return` / `yield`・他の呼び出しの引数・
 * 括弧で包まれた部分式・プロパティ値や三項の枝・テンプレート文字列への埋め込みである。
 * 文の位置に置かれた `await page.waitForFunction(...)` のように返り値を使わない呼び出しは
 * 消費されていないと判定する。
 *
 * @param masked maskCommentsAndStrings を通した原文の写し
 * @param dotIndex 呼び出しの `.` の位置（原文と写しで同じ）
 */
export function isCallResultConsumed(masked: string, dotIndex: number): boolean {
  let start = expressionStartIndex(masked, dotIndex);
  for (;;) {
    const index = previousSignificantIndex(masked, start - 1);
    if (index < 0) return false; // 原文の先頭 = 文の位置
    const char = masked[index]!;

    if (isIdentifierChar(char)) {
      let wordStart = index;
      while (wordStart >= 0 && isIdentifierChar(masked[wordStart])) wordStart -= 1;
      const word = masked.slice(wordStart + 1, index + 1);
      if (TRANSPARENT_KEYWORDS.has(word)) {
        start = wordStart + 1;
        continue;
      }
      // `return` / `yield` は値を持ち出す。`else` / `do` / `try` 等は文の位置である。
      return CONSUMING_KEYWORDS.has(word);
    }

    if (STATEMENT_BOUNDARY_CHARS.has(char)) return false;

    // `${` はテンプレート文字列への埋め込みで値が使われる。素の `{` は文の始まりである。
    if (char === '{') return masked[index - 1] === '$';

    // `=` `,` `(` `[` `:` `?` および各種の演算子 — いずれも値が使われている
    return true;
  }
}

/**
 * 画面へ送るスクリプトの引数の並びを返す（`() => ...` の `()` の中身）
 *
 * 関数式でない場合（文字列・識別子など）は null を返す。
 */
function readCallbackParameters(script: string): string | null {
  const trimmed = script.trim();
  const arrowParen = /^(?:async\s+)?\(([^)]*)\)\s*=>/.exec(trimmed);
  if (arrowParen) return arrowParen[1]!.trim();
  const arrowBare = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(trimmed);
  if (arrowBare) return arrowBare[1]!.trim();
  const fnExpr = /^(?:async\s+)?function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/.exec(trimmed);
  if (fnExpr) return fnExpr[1]!.trim();
  return null;
}

/** 値を返す形かどうか（`() => 式` または本体に return を持つ形） */
function producesValue(script: string): boolean {
  const trimmed = script.trim();
  if (/=>\s*\{/.test(trimmed) || /^\s*(?:async\s+)?function\b/.test(trimmed)) {
    return /\breturn\b/.test(trimmed);
  }
  return /=>/.test(trimmed);
}

/**
 * 記憶領域の読み書きに渡している鍵の式を集める
 *
 * リテラルだけでなく識別子も対象にする。タスク 115.108 で実際にあった書き方は
 * `const testKeys = ['lru_test_1']` を `forEach` で書き込み、同じ `key` で読み返す形であり、
 * 鍵がリテラルとして現れないためである。式は空白を潰した文字列として突き合わせる。
 */
function collectStorageKeyExpressions(script: string, method: string): Set<string> {
  const keys = new Set<string>();
  const re = new RegExp(`\\.${method}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(script))) {
    const openParen = match.index + match[0].length - 1;
    const args = extractArgumentList(script, openParen);
    if (args === null) continue;
    const first = splitTopLevelArguments(args)[0];
    if (first === undefined) continue;
    const normalized = first.replace(/\s+/g, '').trim();
    if (normalized.length > 0) keys.add(normalized);
  }
  return keys;
}

/**
 * 一つの画面内スクリプトを分類する（当たらなければ null）
 */
export function classifyInPageScript(script: string): RuleId | null {
  const parameters = readCallbackParameters(script);
  const takesArgument = parameters !== null && parameters.length > 0;

  // R2: 自分で書いた鍵だけを読み返す形（localStorage を含むため R1 では捕まらない）
  const readKeys = collectStorageKeyExpressions(script, 'getItem');
  if (readKeys.size > 0) {
    const writtenKeys = collectStorageKeyExpressions(script, 'setItem');
    if (writtenKeys.size > 0 && [...readKeys].every((key) => writtenKeys.has(key))) {
      return 'R2-self-read-back';
    }
  }

  if (takesArgument) return null;
  if (parameters === null) return null; // 関数式でない（文字列・識別子渡し）
  if (!producesValue(script)) return null;
  if (PAGE_STATE_RE.test(script)) return null;
  if (PAGE_MARKER_RE.test(script)) return null;

  return 'R1-literal-only';
}

/** 一ファイルを走査する */
export function scanSource(relativePath: string, source: string): FileScanResult {
  const findings: Finding[] = [];
  const masked = maskCommentsAndStrings(source);
  let inPageScriptCount = 0;

  for (const call of IN_PAGE_CALLS) {
    // `$eval` / `$$eval` の `$` は正規表現の行末指定と衝突するため、すべて逃がす
    const callRe = new RegExp(`\\.${call.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = callRe.exec(source))) {
      const openParen = match.index + match[0].length - 1;
      const args = extractArgumentList(source, openParen);
      if (args === null) continue;
      const parts = splitTopLevelArguments(args);
      const script = parts[call.callbackArgIndex];
      if (script === undefined) continue;
      if (readCallbackParameters(script) === null) continue;

      inPageScriptCount += 1;
      const rule = classifyInPageScript(script);
      if (rule === null) continue;

      // 返り値が呼び出し側で使われない呼び出しは、その値への主張が存在しないため対象外である
      if (!isCallResultConsumed(masked, match.index)) continue;

      findings.push({
        file: relativePath,
        line: source.slice(0, match.index).split('\n').length,
        method: call.name,
        rule,
        excerpt: script.replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
  }

  return { inPageScriptCount, findings };
}

/** 走査全体の結果 */
export interface RunResult {
  scannedFiles: number;
  inPageScriptCount: number;
  findings: Finding[];
}

/** e2e 配下を走査する */
export function run(root: string = E2E_ROOT): RunResult {
  const files = collectE2eFiles(root);
  const findings: Finding[] = [];
  let inPageScriptCount = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const result = scanSource(path.relative(REPO_ROOT, file), source);
    inPageScriptCount += result.inPageScriptCount;
    findings.push(...result.findings);
  }
  return { scannedFiles: files.length, inPageScriptCount, findings };
}

/** 合否の判定 */
export interface Verdict {
  ok: boolean;
  reason: string;
}

/**
 * 走査結果から合否を決める
 *
 * 第3原則により、走査が空振りしたまま合格にしてはならない。走査対象が 0 件のとき、
 * および画面へ送るスクリプトを 1 件も抽出できなかったときは不合格である。
 */
export function verdict(result: RunResult): Verdict {
  if (result.scannedFiles === 0) {
    return {
      ok: false,
      reason: '走査対象が 0 件です。検査が空振りしているため失敗として扱います。',
    };
  }
  if (result.inPageScriptCount === 0) {
    return {
      ok: false,
      reason:
        '画面へ送るスクリプトを 1 件も抽出できませんでした。抽出規則が壊れている可能性があるため失敗として扱います。',
    };
  }
  if (result.findings.length > 0) {
    return { ok: false, reason: `${result.findings.length} 件検出しました` };
  }
  return { ok: true, reason: '画面の中で判定を自前で書き起こす構造は検出されませんでした' };
}

// ============================================================================
// 実行
// ============================================================================

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const result = run();
  const decision = verdict(result);

  console.log('🔍 E2E 画面内自前判定チェック (scripts/check-e2e-in-page-selfjudgement.ts)');
  console.log(`   走査ファイル: ${result.scannedFiles} 件`);
  console.log(`   画面へ送るスクリプト: ${result.inPageScriptCount} 件`);

  if (decision.ok) {
    console.log(`✅ ${decision.reason}`);
    return;
  }

  if (result.findings.length === 0) {
    console.error(`❌ ${decision.reason}`);
    process.exit(1);
  }

  console.error(`\n❌ ${decision.reason}`);
  for (const finding of result.findings) {
    console.error(`  [${finding.rule}] ${finding.file}:${finding.line} (${finding.method})`);
    if (verbose) {
      console.error(`     ${finding.excerpt}`);
    }
  }
  console.error('');
  console.error('対応方法:');
  console.error(
    '  1. 本番の経路を通る観測（画面の描画・本番が置いた値・API の応答）へ主張を向けてください'
  );
  console.error(
    '  2. 要件が未実装であることが露見した場合は、検証を失敗したまま残して起票してください'
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
