/**
 * @fileoverview E2Eテストの「検証無効化」構造の検出スクリプト
 *
 * E2Eテストには、書かれてはいるが実質的に何も検証しない構造が混入しやすい。
 * site-survey タスク 115.19 で整理した五つの型を、TypeScript の構文木を用いて
 * 機械的に洗い出す。加えて、同じ効果を持つ「条件付きスキップ」を補助規則として検出する。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-assertion-guards.ts [options]
 *   npm run check:e2e-guards
 *
 * 検出する型:
 *   T1 conditional-expect   条件分岐で検証本体を包む
 *                           `if (cond) { await expect(...) }` — 条件が偽なら何も検証しない
 *   T2 ignored-timeout      待機の指定を尊重しない判定
 *                           `locator.isVisible({ timeout })` は timeout が無視され即時判定される。
 *                           描画前に false となり、その結果で分岐・早期終了すると検証が飛ぶ
 *   T3 tautology            常に真になる判定
 *                           `expect(typeof x === 'number').toBeTruthy()` のような恒真式
 *   T4 response-field-gate  応答の項目の有無を条件にする
 *                           `if (response.someField) { expect(...) }` — 当該項目が常に空なら一度も実行されない
 *   T5 observed-result-gate 自ら観測した結果を条件にする
 *                           `const has = await x.isVisible(); if (has) { await expect(x).toBeVisible(); }`
 *                           — 出ても出なくても通る。観測結果による早期 return / continue も含む
 *   T6 conditional-skip     前提が満たせない場合に沈黙して飛ばす
 *                           `test.skip(<式>, '理由')` / `test.fixme(<式>, ...)` — 条件次第で検証が丸ごと消える。
 *                           第一引数が文字列（タイトル）や関数（実行条件の宣言）の形は対象外
 *
 * 分類の優先順位: T3 > T4 > T5 > T1（T2 と T6 は別軸のため重複して計上する）
 *
 * 検証を包む形（T1 / T4 / T5 の入口）:
 *   - `if (cond) { await expect(...) }`
 *   - `cond && (await expect(...))` / `cond ?? (await expect(...))`
 *   - `cond ? await expect(...) : undefined`（三項で包む形）
 *   - 観測結果を条件に黙って抜ける形（`if (!observed) { return; }` など）
 *
 * 局所変数の追跡:
 *   検出は「expect や if の直下に書かれた式」だけを見ると容易に迂回できる。
 *   同一ファイル内の値の出どころを表引きし、識別子が判定の主題・条件に現れた場合は
 *   その値を展開したうえで分類する。したがって次の二つは同じ扱いになる。
 *
 *     expect(a === null || a.ok()).toBeTruthy();            // 直接記述
 *     const ok = a === null || a.ok(); expect(ok).toBeTruthy(); // 変数を挟む形（同じく T3）
 *
 *   表に載せるのは次の三つの形である。
 *     (1) 初期化子を伴う宣言（`const ok = await res.json()`）
 *     (2) 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
 *     (3) 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
 *   (3) は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
 *   `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
 *
 *   値が次のいずれかを含む場合、その識別子は「観測」を運ぶものとして扱う。
 *     (a) 即時判定・観測（isVisible / count / textContent / getAttribute / evaluate 等）
 *     (b) await を伴う呼び出し（画面や API から結果を取り出す行為そのもの）
 *     (c) 失敗の握り潰し（`.catch(...)`）
 *   論理和・既定値（`||` / `??`）を含む値は恒真になり得るものとして扱う。
 *   スコープは追わず、同名の宣言は検出側に有利な方（観測を含む方）へ寄せて併合する。
 *
 *   表は「宣言の初期化子」と「代入の右辺」に分けて持つ。上記の分類（T1/T4/T5）では
 *   双方を同じように展開するが、T3 の主題の判断では扱いを変える。
 *     - 宣言の初期化子は、後から代入される名前については参照しない。
 *       `let accessToken = ''` のように宣言時の値が仮置きで、代入後の値を検証する形は
 *       正当な主張であり、宣言時の偽値のリテラルで恒真と数えてはならないためである。
 *     - 代入の右辺は、その形自体が論理和・既定値（右辺が偽値のリテラルでないもの）
 *       または型判定であるものに限って評価する。
 *       `let errorFound = false; errorFound = a || b;` は代入した式そのものが恒真であり、
 *       同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
 *
 * 検出対象外とした構造（意図的に対象外。再検討時はこの記述を更新すること）:
 *   - 論理和による検証のうち、真偽以外の matcher に渡る形（`expect(a || b).toContain(...)` 等）
 *     既定値を与えてから内容を検証する正当な用法と区別できず、誤検出が支配的になるため。
 *     真偽値の matcher（toBeTruthy / toBeFalsy / toBe(true|false)）に渡る形は T3 で検出する。
 *   - 握り潰しの例外処理（`try { ... } catch { }` のように catch 節で何もしない形）
 *     後始末・クリーンアップでの使用が多数を占め、構文だけでは検証の放棄と区別できないため。
 *   - 応答待ちの握り潰し（`await page.waitForResponse(...).catch(() => null)`）
 *     待機自体を落とさない用法は正当でもあるため単独では対象外とする。
 *     ただし、その結果が条件や検証の主題に現れた時点で上記の局所変数の追跡により
 *     T3 / T5 として検出される（無害な待機と、検証を骨抜きにする使い方とを区別する）。
 *   - 比較の形を持つ式（`expect(status === 304).toBeTruthy()` 等）
 *     比較そのものは実質のある検証であり、恒真ではない。
 *     被演算子へ再帰するとリテラル比較まで恒真として数えてしまうため、比較を見つけた
 *     時点で打ち切る（型判定 `typeof x === 'number'` を持つ場合のみ例外）。
 *     `a === null || a.ok() || a.status() === 304` のように「比較を含むが全体としては
 *     恒真」な論理和は、打ち切りの前に論理和として判定されるため従来どおり検出される。
 *   - 既定値として偽値を補うだけの形（`const id = match?.[1] ?? null;` の検証）
 *     左辺が偽なら結果も偽であり、真偽の主張を骨抜きにしないため。
 *   - 真偽のリテラルを代入した値の検証（`let ok = false; ok = true; expect(ok).toBeTruthy()`）
 *     代入の右辺を評価する対象から真偽のリテラルを外した結果、この形は無検出になる。
 *     これは意図した限界であり、無条件に真を代入する恒真の主張は取り逃がす。
 *     `let downloadHappened = false; … downloadHappened = true;` のように、事象の発生や
 *     条件の成立を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 *     本稿の執筆時点の走査では、この形に該当する箇所は e2e 配下に 34 箇所あり、
 *     いずれも条件分岐・例外処理・コールバックの内側でのみ真を代入している
 *     （無条件に真を代入する箇所は 0 件）。真偽のリテラルの代入まで辿ると、
 *     この 34 箇所がそのまま過検出として戻る。
 *
 * 検出規則の確認:
 *   scripts/check-e2e-assertion-guards.selftest.ts に、捕捉すべき書き方と
 *   捕捉してはならない書き方を注入する一覧を置いている。規則を変更したら
 *   `npm run check:e2e-guards:selftest` を実行すること。
 *
 * 正当な用途の除外:
 *   前提の準備・後始末・検証ロジックそのものなど、条件分岐が正当な箇所は
 *   該当行の直前行に以下の注釈を置くことで検出対象から外せる。理由は必須であり、
 *   理由が空の注釈は除外として扱わず（検出はそのまま残る）、検査を失敗させる。
 *
 *     // e2e-guard-allow: <理由>
 *
 *   除外は実行のたびに件数と箇所の一覧を出力し、基準にも件数を記録する。
 *   除外が増えた場合も検査は失敗する（大量除外による見かけ上の解消を防ぐため）。
 *
 * 再発検知:
 *   e2e/assertion-guard-baseline.json に「ファイル別・型別の既知件数」と
 *   「ファイル別の除外件数」を記録する。
 *   件数が増えた場合、または基準に無いファイルで検出された場合は exit 1 とする。
 *   件数が減った場合は警告のみ（基準の更新を促す）。
 *
 * オプション:
 *   --verbose           検出箇所を全件表示する
 *   --json              JSON形式で出力する
 *   --update-baseline   現状を基準として書き出す（是正後に実行する）
 *   --no-baseline       基準と照合せず検出結果のみ出力する
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.join(ROOT, 'e2e');
const BASELINE_PATH = path.join(E2E_DIR, 'assertion-guard-baseline.json');
const ALLOW_MARKER = 'e2e-guard-allow:';

// ============================================================================
// 型定義
// ============================================================================

export type GuardType =
  | 'T1-conditional-expect'
  | 'T2-ignored-timeout'
  | 'T3-tautology'
  | 'T4-response-field-gate'
  | 'T5-observed-result-gate'
  | 'T6-conditional-skip';

interface Finding {
  file: string;
  line: number;
  type: GuardType;
  snippet: string;
}

interface AllowEntry {
  file: string;
  line: number;
  type: GuardType;
  reason: string;
  snippet: string;
}

export interface ScanResult {
  findings: Finding[];
  allowed: AllowEntry[];
  /** 理由の無い除外注釈（除外として扱わない） */
  invalidAllows: AllowEntry[];
}

type Baseline = Record<string, Partial<Record<GuardType, number>>>;
type AllowBaseline = Record<string, number>;

const GUARD_TYPES: GuardType[] = [
  'T1-conditional-expect',
  'T2-ignored-timeout',
  'T3-tautology',
  'T4-response-field-gate',
  'T5-observed-result-gate',
  'T6-conditional-skip',
];

/** 即時判定であり timeout 指定が無視される Playwright の述語メソッド */
const IMMEDIATE_PREDICATES = [
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isChecked',
  'isEditable',
];

/** 画面・応答からの観測を示す語（条件式の分類に用いる） */
const OBSERVATION_PATTERN =
  /\b(isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable|count|textContent|innerText|inputValue|getAttribute|boundingBox|locator|getByTestId|getByRole|getByText|waitFor|evaluate)\b/;

/** 応答の項目参照を示す語 */
const RESPONSE_PATTERN = /\b(response|res|body|json|payload|detail|result|data|api)\w*\s*[.?[]/i;

/** await を伴う呼び出し（画面・API から結果を取り出す行為） */
const AWAIT_PATTERN = /\bawait\b/;

/** 失敗の握り潰し */
const SWALLOW_PATTERN = /\.catch\s*\(/;

/** 局所変数の追跡で辿る深さの上限（循環・過剰展開の防止） */
const RESOLVE_DEPTH_LIMIT = 4;

// ============================================================================
// 走査
// ============================================================================

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** 式の最も内側の識別子を取り出す（`expect(x).not.toBe` → `expect`） */
function rootIdentifier(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isCallExpression(current)) {
      current = current.expression;
    } else if (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

function isExpectCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const root = rootIdentifier(node.expression);
  return ts.isIdentifier(root) && root.text === 'expect';
}

/** 検証が実行される呼び出し（expect の matcher 呼び出し） */
function containsAssertion(node: ts.Node): boolean {
  return containsNode(node, (n) => isExpectCall(n));
}

/** 前提が満たせないときに失敗させる構造（throw / expect.fail / test.fail） */
function containsFailure(node: ts.Node): boolean {
  return containsNode(node, (n) => {
    if (ts.isThrowStatement(n)) return true;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      return text === 'expect.fail' || text === 'test.fail';
    }
    return false;
  });
}

function containsNode(node: ts.Node, predicate: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (predicate(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** 分岐の本体が「黙って抜ける」だけか（return / continue / test.skip） */
function isSilentExit(statement: ts.Statement): boolean {
  const statements = ts.isBlock(statement) ? [...statement.statements] : [statement];
  if (statements.length === 0) return false;
  return statements.every((s) => {
    if (ts.isReturnStatement(s)) return true;
    if (ts.isContinueStatement(s)) return true;
    if (ts.isBreakStatement(s)) return true;
    if (ts.isExpressionStatement(s)) {
      const text = s.expression.getText();
      return text.startsWith('test.skip') || text.startsWith('test.fixme');
    }
    return false;
  });
}

/** 比較の演算子（比較そのものは実質のある検証なので恒真とはみなさない） */
const COMPARISON_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

/** 代入の演算子か（`=` および複合代入） */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * 偽値のリテラルか。
 *
 * `x ?? null` や `x || ''` のように既定値として偽値を補う形は、
 * 真偽の主張（toBeTruthy）を骨抜きにしない。左辺が偽なら結果も偽であり、
 * 主張はそのまま左辺に対して働くためである。
 */
function isFalsyLiteral(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (inner.kind === ts.SyntaxKind.NullKeyword) return true;
  if (inner.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isIdentifier(inner) && inner.text === 'undefined') return true;
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return inner.text === '';
  }
  if (ts.isNumericLiteral(inner)) return Number(inner.text) === 0;
  return false;
}

/** 型判定を直接の被演算子に持つか（`typeof x === 'number'` の判別） */
function hasTypeOfOperand(node: ts.BinaryExpression): boolean {
  return (
    ts.isTypeOfExpression(unwrapParentheses(node.left)) ||
    ts.isTypeOfExpression(unwrapParentheses(node.right))
  );
}

/**
 * 恒真になり得る式か。
 *
 * 対象は次の三つに限る。
 * - リテラルそのもの（`expect(true)`）
 * - 型判定（`typeof x === 'number'`。実行時の値ではなく静的な型に依存する）
 * - 論理和・既定値（`expect(A || B)`。どちらの結果でも通るため観測を検証していない）
 *
 * 比較（`a === b`、`a <= b` 等）は実質のある検証なので含めない。被演算子へ再帰すると
 * `x === 304` のようなリテラル比較まで恒真として数えてしまうため、比較の形を見つけた
 * 時点で打ち切る（型判定を被演算子に持つ場合のみ例外とする）。
 * これにより `a === null || a.ok() || a.status() === 304` のように
 * 「比較を含むが全体としては恒真」な論理和は従来どおり検出される。
 *
 * 既定値として偽値を補うだけの形（`match?.[1] ?? null`）も、真偽の主張を
 * 骨抜きにしないため恒真とはみなさない。
 */
function isVacuousBoolean(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return isVacuousBoolean(node.expression);
  if (ts.isTypeOfExpression(node)) return true;
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      if (isFalsyLiteral(node.right)) return isVacuousBoolean(node.left);
      return true;
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(node);
    if (isAssignmentOperator(kind)) return false;
    return isVacuousBoolean(node.left) || isVacuousBoolean(node.right);
  }
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node)
  );
}

/**
 * 代入の右辺のうち、恒真の主題として評価してよい形か。
 *
 * 後から代入される名前については、宣言時の仮置きの値を主題にしてはならない
 * （`let accessToken = ''`）。しかし代入の右辺まで一律に打ち切ると、
 * `let errorFound = false; errorFound = a || b;` のように代入した式そのものが
 * 恒真である形を取り逃がす。そこで右辺の形を見て次の二つに限り評価する。
 *
 * - 論理和・既定値（`a || b` / `a ?? b`。右辺が偽値のリテラルである既定値は除く）
 * - 型判定（`typeof x === 'number'` / `typeof x`）
 *
 * 真偽のリテラルの単純な代入（`flag = true`）は評価しない。
 * `let downloadHappened = false; … downloadHappened = true;` のように、
 * 事象の発生を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 */
function isEvaluableAssignment(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (ts.isTypeOfExpression(inner)) return true;
  if (ts.isBinaryExpression(inner)) {
    const kind = inner.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return !isFalsyLiteral(inner.right);
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(inner);
  }
  return false;
}

/** 条件付きスキップか（`test.skip(<式>, ...)` / `test.fixme(<式>, ...)`） */
function isConditionalSkip(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText(sourceFile);
  if (callee !== 'test.skip' && callee !== 'test.fixme') return false;
  const first = node.arguments[0];
  if (!first) return false;
  // タイトル指定（文字列）や実行条件の宣言（関数）は対象外
  if (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first)) return false;
  if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) return false;
  return true;
}

function scanFile(absPath: string): ScanResult {
  return scanSource(path.relative(ROOT, absPath), fs.readFileSync(absPath, 'utf8'));
}

/**
 * 走査本体。ファイルの内容そのものを受け取るため、検出規則の確認では
 * 任意の書き方を注入して結果を検証できる（scripts/check-e2e-assertion-guards.selftest.ts）。
 */
export function scanSource(relPath: string, source: string): ScanResult {
  const sourceFile = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true);
  const lines = source.split('\n');
  const findings: Finding[] = [];
  const allowed: AllowEntry[] = [];
  const invalidAllows: AllowEntry[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const snippetOf = (node: ts.Node): string =>
    node.getText(sourceFile).split('\n')[0]!.trim().slice(0, 110);

  // --------------------------------------------------------------------------
  // 局所変数の表（同名は併合する）
  //
  // 初期化子を伴う宣言のほか、次の二つの書き方も同じ表に載せる。
  //   - 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
  //   - 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
  // 後者は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
  // `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
  // --------------------------------------------------------------------------
  //
  // 表は「宣言の初期化子」と「代入の右辺」に分ける。分類（T1/T4/T5）では双方を
  // 同じように展開するが、T3 の主題の判断では扱いが異なるためである（後述）。
  // --------------------------------------------------------------------------
  /** 宣言の初期化子（分割して受ける形を含む） */
  const declTable = new Map<string, ts.Expression[]>();
  /** 代入の右辺（`id = await createProject()` の右辺） */
  const assignTable = new Map<string, ts.Expression[]>();
  /** 後から代入される名前（宣言時の値を主題の判断に用いない） */
  const reassigned = new Set<string>();
  {
    const register = (
      table: Map<string, ts.Expression[]>,
      name: string,
      expression: ts.Expression
    ): void => {
      const list = table.get(name) ?? [];
      list.push(expression);
      table.set(name, list);
    };
    const registerBinding = (name: ts.BindingName, expression: ts.Expression): void => {
      if (ts.isIdentifier(name)) {
        register(declTable, name.text, expression);
        return;
      }
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue;
        registerBinding(element.name, expression);
      }
    };
    const collect = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        registerBinding(n.name, n.initializer);
      }
      if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
        const target = unwrapParentheses(n.left);
        if (ts.isIdentifier(target)) {
          reassigned.add(target.text);
          if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            register(assignTable, target.text, n.right);
          }
        }
      }
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken) &&
        ts.isIdentifier(n.operand)
      ) {
        reassigned.add(n.operand.text);
      }
      ts.forEachChild(n, collect);
    };
    collect(sourceFile);
  }

  /** 式に現れる識別子の初期化子を展開した文字列（分類に用いる） */
  const expandedText = (node: ts.Node): string => {
    const parts = [node.getText(sourceFile)];
    const seen = new Set<string>();
    const walk = (n: ts.Node, depth: number): void => {
      if (depth > RESOLVE_DEPTH_LIMIT) return;
      const visitIdentifiers = (m: ts.Node): void => {
        if (ts.isIdentifier(m) && !seen.has(m.text)) {
          const values = [...(declTable.get(m.text) ?? []), ...(assignTable.get(m.text) ?? [])];
          if (values.length > 0) {
            seen.add(m.text);
            for (const value of values) {
              parts.push(value.getText(sourceFile));
              walk(value, depth + 1);
            }
          }
        }
        ts.forEachChild(m, visitIdentifiers);
      };
      visitIdentifiers(n);
    };
    walk(node, 0);
    return parts.join(' ');
  };

  /**
   * 判定の主題が恒真になり得るか（識別子は値の出どころまで辿る）。
   *
   * 後から代入される名前は、宣言時の値を辿らない。`let accessToken = ''` のように
   * 宣言時の値が仮置きで、代入後の値を検証する形が正当な主張であるため。
   * 一方で代入の右辺は、その形自体が恒真になり得るもの（論理和・既定値・型判定）に
   * 限って評価する。`let ok = false; ok = a || b;` は宣言時の値ではなく代入した式が
   * 恒真なのであり、同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
   */
  const isVacuousSubject = (node: ts.Expression, depth = 0): boolean => {
    if (ts.isParenthesizedExpression(node)) return isVacuousSubject(node.expression, depth);
    if (ts.isAwaitExpression(node)) return isVacuousSubject(node.expression, depth);
    if (isVacuousBoolean(node)) return true;
    if (ts.isIdentifier(node) && depth < RESOLVE_DEPTH_LIMIT) {
      if (reassigned.has(node.text)) {
        for (const assigned of assignTable.get(node.text) ?? []) {
          if (isEvaluableAssignment(assigned) && isVacuousSubject(assigned, depth + 1)) return true;
        }
        return false;
      }
      for (const initializer of declTable.get(node.text) ?? []) {
        if (isVacuousSubject(initializer, depth + 1)) return true;
      }
    }
    return false;
  };

  const isObservation = (text: string): boolean =>
    OBSERVATION_PATTERN.test(text) || AWAIT_PATTERN.test(text) || SWALLOW_PATTERN.test(text);

  /** 条件式の分類（局所変数を挟んだ形も直接記述と同等に扱う） */
  const classifyCondition = (node: ts.Node): GuardType => {
    const text = expandedText(node);
    if (isObservation(text)) return 'T5-observed-result-gate';
    if (RESPONSE_PATTERN.test(text)) return 'T4-response-field-gate';
    return 'T1-conditional-expect';
  };

  /** 条件式が観測または応答参照を運ぶか（黙って抜ける分岐の判定に用いる） */
  const carriesObservation = (node: ts.Node): boolean => {
    const text = expandedText(node);
    return isObservation(text) || RESPONSE_PATTERN.test(text);
  };

  // --------------------------------------------------------------------------
  // 除外注釈（理由必須）
  // --------------------------------------------------------------------------
  /** 直前の非空行の除外注釈。marked=注釈あり、reason=注釈に続く理由 */
  const allowAnnotation = (line: number): { marked: boolean; reason: string } => {
    for (let i = line - 2; i >= 0; i -= 1) {
      const text = lines[i]!.trim();
      if (text === '') continue;
      const index = text.indexOf(ALLOW_MARKER);
      if (index === -1) return { marked: false, reason: '' };
      return { marked: true, reason: text.slice(index + ALLOW_MARKER.length).trim() };
    }
    return { marked: false, reason: '' };
  };

  const push = (node: ts.Node, type: GuardType, snippetNode?: ts.Node): void => {
    const line = lineOf(node);
    const snippet = snippetOf(snippetNode ?? node);
    const { marked, reason } = allowAnnotation(line);
    if (marked && reason !== '') {
      allowed.push({ file: relPath, line, type, reason, snippet });
      return;
    }
    if (marked) {
      // 理由の無い注釈は除外として扱わない（検出は残したうえで検査を失敗させる）
      invalidAllows.push({ file: relPath, line, type, reason: '', snippet });
    }
    findings.push({ file: relPath, line, type, snippet });
  };

  const visit = (node: ts.Node): void => {
    // --- T2: 待機の指定を尊重しない判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (IMMEDIATE_PREDICATES.includes(node.expression.name.text)) {
        const arg = node.arguments[0];
        if (
          arg &&
          ts.isObjectLiteralExpression(arg) &&
          arg.properties.some((p) => p.name?.getText(sourceFile) === 'timeout')
        ) {
          push(node, 'T2-ignored-timeout');
        }
      }
    }

    // --- T6: 条件付きスキップ ---
    if (isConditionalSkip(node, sourceFile)) {
      push(node, 'T6-conditional-skip');
    }

    // --- T3: 常に真になる判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      if (matcher === 'toBeTruthy' || matcher === 'toBeFalsy' || matcher === 'toBe') {
        let receiver: ts.Node = node.expression.expression;
        while (ts.isPropertyAccessExpression(receiver)) receiver = receiver.expression;
        if (
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          const matcherArgIsBoolean =
            matcher !== 'toBe' ||
            (node.arguments.length === 1 &&
              (node.arguments[0]!.kind === ts.SyntaxKind.TrueKeyword ||
                node.arguments[0]!.kind === ts.SyntaxKind.FalseKeyword));
          if (subject && matcherArgIsBoolean && isVacuousSubject(subject)) {
            push(node, 'T3-tautology', receiver);
          }
        }
      }
    }

    // --- T1 / T4 / T5: 分岐による検証の無効化 ---
    if (ts.isIfStatement(node)) {
      const thenAsserts = containsAssertion(node.thenStatement);
      const elseAsserts = node.elseStatement ? containsAssertion(node.elseStatement) : false;
      const elseFails = node.elseStatement ? containsFailure(node.elseStatement) : false;
      const thenFails = containsFailure(node.thenStatement);

      // 前提が満たせないときに失敗させる分岐は正当な用途として扱う
      const isFailFast = thenFails && !thenAsserts;

      if (!isFailFast && (thenAsserts || elseAsserts) && !elseFails) {
        push(node, classifyCondition(node.expression), node.expression);
      } else if (!isFailFast && isSilentExit(node.thenStatement)) {
        // 観測結果を条件に黙って抜ける（検証本体に到達しない）
        if (carriesObservation(node.expression)) {
          push(node, classifyCondition(node.expression), node.expression);
        }
      }
    }

    // --- 論理短絡による検証の無効化 ---
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      containsAssertion(node.right) &&
      !containsAssertion(node.left)
    ) {
      push(node, classifyCondition(node.left), node.left);
    }

    // --- 三項で検証を包む形（if 文と同じく条件次第で検証本体に到達しない） ---
    if (ts.isConditionalExpression(node) && !containsAssertion(node.condition)) {
      const branchAsserts = containsAssertion(node.whenTrue) || containsAssertion(node.whenFalse);
      const branchFails = containsFailure(node.whenTrue) || containsFailure(node.whenFalse);
      if (branchAsserts && !branchFails) {
        push(node, classifyCondition(node.condition), node.condition);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { findings, allowed, invalidAllows };
}

// ============================================================================
// 基準との照合
// ============================================================================

function tally(findings: Finding[]): Baseline {
  const result: Baseline = {};
  for (const finding of findings) {
    const perFile = (result[finding.file] ??= {});
    perFile[finding.type] = (perFile[finding.type] ?? 0) + 1;
  }
  return result;
}

function tallyAllowed(allowed: AllowEntry[]): AllowBaseline {
  const result: AllowBaseline = {};
  for (const entry of allowed) {
    result[entry.file] = (result[entry.file] ?? 0) + 1;
  }
  return result;
}

function loadBaseline(): { files: Baseline; allowedFiles: AllowBaseline } {
  if (!fs.existsSync(BASELINE_PATH)) return { files: {}, allowedFiles: {} };
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as {
    files?: Baseline;
    allowedFiles?: AllowBaseline;
  };
  return { files: parsed.files ?? {}, allowedFiles: parsed.allowedFiles ?? {} };
}

function writeBaseline(
  current: Baseline,
  total: number,
  allowedFiles: AllowBaseline,
  allowedTotal: number
): void {
  const ordered: Baseline = {};
  for (const file of Object.keys(current).sort()) {
    const perType: Partial<Record<GuardType, number>> = {};
    for (const type of GUARD_TYPES) {
      const count = current[file]![type];
      if (count) perType[type] = count;
    }
    ordered[file] = perType;
  }
  const orderedAllowed: AllowBaseline = {};
  for (const file of Object.keys(allowedFiles).sort()) {
    orderedAllowed[file] = allowedFiles[file]!;
  }
  const payload = {
    $comment: [
      'E2Eテストの「検証無効化」構造の既知件数（scripts/check-e2e-assertion-guards.ts）。',
      '件数が増えた場合、または一覧に無いファイルで検出された場合は検査が失敗する。',
      '是正して件数を減らしたら `npm run check:e2e-guards:update` で更新すること。',
      '正当な分岐は該当行の直前に `// e2e-guard-allow: <理由>` を置いて除外できる（理由は必須）。',
      'allowedFiles は除外注釈の件数。除外が増えた場合も検査は失敗する（差分として現れる）。',
    ],
    generatedTotal: total,
    allowedTotal,
    allowedFiles: orderedAllowed,
    files: ordered,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// ============================================================================
// 実行
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const asJson = args.includes('--json');
  const update = args.includes('--update-baseline');
  const skipBaseline = args.includes('--no-baseline');

  const files = collectFiles(E2E_DIR);
  const results = files.map(scanFile);
  const findings = results.flatMap((r) => r.findings);
  const allowed = results.flatMap((r) => r.allowed);
  const invalidAllows = results.flatMap((r) => r.invalidAllows);
  const current = tally(findings);
  const currentAllowed = tallyAllowed(allowed);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          total: findings.length,
          allowedTotal: allowed.length,
          findings,
          allowed,
          invalidAllows,
        },
        null,
        2
      )
    );
    return;
  }

  const byType = new Map<GuardType, number>(GUARD_TYPES.map((t) => [t, 0]));
  for (const finding of findings) {
    byType.set(finding.type, (byType.get(finding.type) ?? 0) + 1);
  }

  console.log('🔍 E2E 検証無効化チェック (scripts/check-e2e-assertion-guards.ts)');
  console.log(`   走査ファイル数: ${files.length}`);
  console.log(`   検出件数: ${findings.length}`);
  for (const type of GUARD_TYPES) {
    console.log(`     ${type}: ${byType.get(type)}`);
  }

  console.log(`   除外件数 (e2e-guard-allow): ${allowed.length}`);
  for (const entry of allowed) {
    console.log(`     ${entry.file}:${entry.line} [${entry.type}] 理由: ${entry.reason}`);
  }

  if (verbose) {
    console.log('');
    for (const finding of findings) {
      console.log(`   ${finding.file}:${finding.line} [${finding.type}] ${finding.snippet}`);
    }
  }

  if (invalidAllows.length > 0) {
    console.log('\n❌ 理由の無い除外注釈があります（除外として扱いません）:');
    for (const entry of invalidAllows) {
      console.log(`   ${entry.file}:${entry.line} [${entry.type}] ${entry.snippet}`);
    }
    console.log(`\n   \`// ${ALLOW_MARKER} <理由>\` の形で理由を書いてください。`);
    process.exit(1);
  }

  if (update) {
    writeBaseline(current, findings.length, currentAllowed, allowed.length);
    console.log(`\n✅ 基準を更新しました: ${path.relative(ROOT, BASELINE_PATH)}`);
    return;
  }

  if (skipBaseline) return;

  const baseline = loadBaseline();
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const file of Object.keys(current).sort()) {
    for (const type of GUARD_TYPES) {
      const actual = current[file]![type] ?? 0;
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      if (actual > allowedCount) {
        regressions.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }
  for (const file of Object.keys(baseline.files).sort()) {
    for (const type of GUARD_TYPES) {
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      const actual = current[file]?.[type] ?? 0;
      if (actual < allowedCount) {
        improvements.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }

  const allowRegressions: string[] = [];
  for (const file of Object.keys(currentAllowed).sort()) {
    const actual = currentAllowed[file] ?? 0;
    const known = baseline.allowedFiles[file] ?? 0;
    if (actual > known) {
      allowRegressions.push(`${file} [e2e-guard-allow] ${known} → ${actual}`);
    }
  }

  if (improvements.length > 0) {
    console.log('\nℹ️  基準より減っています（是正済み）。基準の更新を推奨します:');
    for (const line of improvements) console.log(`   ${line}`);
    console.log('   更新: npm run check:e2e-guards:update');
  }

  if (allowRegressions.length > 0) {
    console.log('\n❌ 除外（e2e-guard-allow）が増えています:');
    for (const line of allowRegressions) console.log(`   ${line}`);
    console.log('\n   除外は正当性をレビューできる形で残す必要があります。');
    console.log('   妥当であれば `npm run check:e2e-guards:update` で基準に反映してください。');
  }

  if (regressions.length > 0) {
    console.log('\n❌ 検証無効化の構造が増えています:');
    for (const line of regressions) console.log(`   ${line}`);
    console.log('\n   検証を無条件にするか、前提が満たせない場合に失敗させてください。');
    console.log('   正当な分岐であれば直前行に `// e2e-guard-allow: <理由>` を付けてください。');
    console.log('   詳細: npm run check:e2e-guards -- --verbose');
  }

  if (regressions.length > 0 || allowRegressions.length > 0) {
    process.exit(1);
  }

  console.log('\n✅ 新規の検証無効化は検出されませんでした');
}

// 直接起動されたときのみ実行する（検出規則の確認からは走査部分だけを読み込む）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
