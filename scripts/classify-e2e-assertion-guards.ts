/**
 * @fileoverview 「沈黙する関門の一族」（T1 / T4 / T5）の構文木による分類走査
 *
 * ## なぜ本スクリプトが要るか
 *
 * `.kiro/specs/site-survey/e2e-assertion-guard-reduction-plan.md` 付録 A は、
 * T5 / T1 / T4 の合計を A〜G の七つの群へ排他的に振り分けた内訳を掲げているが、
 * **その振り分けに用いた走査が成果物として残っておらず、記述だけでは再現できない**
 * （同付録の自認。行単位の波括弧の釣り合いで書き直した走査は別の値を返した）。
 * 段4・段6・段7 の出口数値はこの内訳に依存するため、暫定のまま据え置かれていた。
 *
 * 本スクリプトはその走査を資材として置き直すものである。**行単位の文字列処理では
 * なく構文木で判定する**（Task 115.126 が確立した「走査は識別子ではなく構文の形で行う」）。
 *
 * 入力は `scripts/check-e2e-assertion-guards.ts` の検出結果そのもの（`scanFile` の
 * 戻り値に含まれる `findingNodes`）であり、行番号で当て直すことをしない。
 * したがって「分類の合計＝検出件数」が構成上保証される。
 *
 * 使用方法:
 *   npx tsx scripts/classify-e2e-assertion-guards.ts               内訳を出力する
 *   npx tsx scripts/classify-e2e-assertion-guards.ts --list A      当該群の全箇所を出力する
 *   npx tsx scripts/classify-e2e-assertion-guards.ts --list D2,E   複数の群をまとめて出力する
 *   npx tsx scripts/classify-e2e-assertion-guards.ts --list D2 --context 8
 *                                                                 該当コードを前後 8 行つきで出力する
 *   npx tsx scripts/classify-e2e-assertion-guards.ts --json        JSON で出力する
 *   npm run classify:e2e-guards
 *
 * `--list` は件数ではなく**箇所そのもの**を出す。群ごとの是正（段4 の D2、段6 の E、
 * 段7 の F / G / D1）は一件ずつ実物を読んで判断する必要があり、件数だけでは着手できない。
 * `--context` を付けると当該の分岐を含む前後の実コードを併せて印字する。
 *
 * ## 群の定義（振り分けの優先順位は A → B → C → G → D1 → D2 → F → E）
 *
 *   A  述語ヘルパーの実装そのもの／`page.evaluate` の内側。
 *      真偽を返す関数の本体であることを**構造**で判定する（命名では判定しない。
 *      段1 で「ガードが見張る値とテストが使う値が違った」実例があり、名前は当てにならない）。
 *   B  分岐の内側に throw があり、その経路が必ず失敗する。
 *   C  直前の無条件の主張の後、TypeScript の型を絞るためだけの `if`。
 *   G  `if` と `else` の双方で主張する全域分岐。
 *   D1 繰り返しの内側の成功時の脱出で、繰り返しの外に throw がある（再試行）。
 *   D2 観測結果で沈黙して脱出する（失敗させる経路が無い）。
 *   F  分岐の内側に主張と操作の双方がある（復旧・再試行）。
 *   E  観測結果で主張を包むだけ（出ても出なくても通る）。
 *
 * @module scripts/classify-e2e-assertion-guards
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import {
  collectE2eFiles,
  containsAssertion,
  containsFailure,
  guaranteedFailureExclusion,
  isSilentExit,
  predicateImplementationExclusion,
  scanFile,
  type Finding,
  type GuardType,
} from './check-e2e-assertion-guards.js';

const __filename = fileURLToPath(import.meta.url);

/** 分類の対象とする型（沈黙する関門の一族）。T2 / T3 / T6 は別軸のため対象外 */
const GATE_TYPES: GuardType[] = [
  'T1-conditional-expect',
  'T4-response-field-gate',
  'T5-observed-result-gate',
];

export type Group = 'A' | 'B' | 'C' | 'G' | 'D1' | 'D2' | 'F' | 'E';

const GROUPS: Group[] = ['A', 'B', 'C', 'G', 'D1', 'D2', 'F', 'E'];

const GROUP_LABEL: Record<Group, string> = {
  A: '述語ヘルパー／page.evaluate の内側（判定の実装そのもの）',
  B: '分岐の内側で throw している（必ず失敗する）',
  C: '無条件の主張の直後の型絞り込み',
  G: 'if/else の双方で主張する全域分岐',
  D1: '再試行の成功時の脱出（繰り返しの外に throw がある）',
  D2: '観測結果で沈黙して脱出（失敗させる経路が無い）',
  F: '復旧・再試行を含む分岐（主張も操作も含む）',
  E: '観測結果で主張を包むだけ',
};

export interface Classified {
  file: string;
  line: number;
  type: GuardType;
  group: Group;
  /** 群の中での細目（A の内訳など。診断のために持つ） */
  detail: string;
  snippet: string;
}

// ============================================================================
// 関門の正規化（if / 論理短絡 / 三項を同じ形で扱う）
// ============================================================================

interface Gate {
  node: ts.Node;
  condition: ts.Node;
  /** 条件が真のときに実行される側 */
  thenBranch: ts.Node;
  /** 条件が偽のときに実行される側（無い場合は undefined） */
  elseBranch: ts.Node | undefined;
  /** `if` 文としての実体（型絞り込み・沈黙脱出の判定に用いる） */
  ifStatement: ts.IfStatement | undefined;
}

function toGate(node: ts.Node): Gate | undefined {
  if (ts.isIfStatement(node)) {
    return {
      node,
      condition: node.expression,
      thenBranch: node.thenStatement,
      elseBranch: node.elseStatement,
      ifStatement: node,
    };
  }
  if (ts.isBinaryExpression(node)) {
    return {
      node,
      condition: node.left,
      thenBranch: node.right,
      elseBranch: undefined,
      ifStatement: undefined,
    };
  }
  if (ts.isConditionalExpression(node)) {
    return {
      node,
      condition: node.condition,
      thenBranch: node.whenTrue,
      elseBranch: node.whenFalse,
      ifStatement: undefined,
    };
  }
  return undefined;
}

// ============================================================================
// C 群: 無条件の主張の直後の型絞り込み
// ============================================================================

/** 条件式が「値の存在を確かめるだけ」の形か（型の絞り込みに用いられる形） */
function narrowedIdentifiers(condition: ts.Node): string[] | undefined {
  const names: string[] = [];
  const walk = (node: ts.Node): boolean => {
    const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
    if (ts.isIdentifier(inner)) {
      names.push(inner.text);
      return true;
    }
    if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression)) {
      // `bbox.width` のような形は絞り込みではないため対象外
      return false;
    }
    if (ts.isBinaryExpression(inner)) {
      const kind = inner.operatorToken.kind;
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return walk(inner.left) && walk(inner.right);
      }
      // `x !== null` / `x != null` / `x !== undefined`
      if (
        kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsToken
      ) {
        const left = inner.left;
        const right = inner.right;
        const isNullish = (n: ts.Expression): boolean =>
          n.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(n) && n.text === 'undefined') ||
          n.kind === ts.SyntaxKind.UndefinedKeyword;
        if (ts.isIdentifier(left) && isNullish(right)) {
          names.push(left.text);
          return true;
        }
        if (ts.isIdentifier(right) && isNullish(left)) {
          names.push(right.text);
          return true;
        }
      }
      return false;
    }
    return false;
  };
  if (!walk(condition)) return undefined;
  return names.length > 0 ? names : undefined;
}

/** 文が `expect(<name>)…` の形の無条件の主張か（存在を主張する matcher に限る） */
const PRESENCE_MATCHERS = new Set([
  'toBeTruthy',
  'toBeDefined',
  'toBeNull',
  'toBeUndefined',
  'toBeGreaterThan',
  'toBeGreaterThanOrEqual',
]);

function assertsPresenceOf(statement: ts.Statement, name: string): boolean {
  if (!ts.isExpressionStatement(statement)) return false;
  let expression: ts.Expression = statement.expression;
  if (ts.isAwaitExpression(expression)) expression = expression.expression;
  if (!ts.isCallExpression(expression)) return false;
  // matcher が存在の主張であること（`not` を挟む形は存在の否定なので除く）
  let receiver: ts.Node = expression.expression;
  if (!ts.isPropertyAccessExpression(receiver)) return false;
  const matcher = receiver.name.text;
  if (!PRESENCE_MATCHERS.has(matcher)) return false;
  const chain: string[] = [];
  while (ts.isPropertyAccessExpression(receiver)) {
    chain.push(receiver.name.text);
    receiver = receiver.expression;
  }
  if (chain.includes('not') && matcher !== 'toBeNull' && matcher !== 'toBeUndefined') return false;
  if (!chain.includes('not') && (matcher === 'toBeNull' || matcher === 'toBeUndefined')) {
    return false;
  }
  if (!ts.isCallExpression(receiver)) return false;
  if (!ts.isIdentifier(receiver.expression) || receiver.expression.text !== 'expect') return false;
  const subject = receiver.arguments[0];
  if (!subject) return false;
  // `expect(x)` / `expect(x.width)` のいずれも x の存在を主張したものとして扱う
  let root: ts.Node = subject;
  while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) {
    root = root.expression;
  }
  return ts.isIdentifier(root) && root.text === name;
}

/**
 * 型の絞り込みのためだけの `if` か。
 *
 * 条件に現れる識別子のすべてについて、同じ塊の中で当該の `if` より前に、
 * 分岐に包まれていない無条件の主張が存在することを求める。
 * 主張の後に当該の識別子へ再代入がある場合は、主張が及ばないため対象外とする。
 */
function isTypeNarrowing(gate: Gate): boolean {
  const statement = gate.ifStatement;
  if (!statement) return false;
  // then 節が主張を含まない（沈黙脱出などの）形は型の絞り込みではない
  if (!containsAssertion(statement.thenStatement)) return false;
  if (statement.elseStatement) return false;
  const names = narrowedIdentifiers(statement.expression);
  if (!names) return false;

  const parent = statement.parent;
  if (!parent || !ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(statement);
  if (index < 0) return false;
  const preceding = parent.statements.slice(0, index);

  return names.every((name) => {
    let asserted = false;
    for (const s of preceding) {
      if (assertsPresenceOf(s, name)) asserted = true;
      else if (asserted && reassigns(s, name)) asserted = false;
    }
    return asserted;
  });
}

function reassigns(statement: ts.Statement, name: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(n.left) &&
      n.left.text === name
    ) {
      found = true;
      return;
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(statement);
  return found;
}

// ============================================================================
// D / F / G 群
// ============================================================================

/** 画面・API への操作（検証ではなく状態を変える行為） */
const ACTION_PATTERN =
  /\.(click|dblclick|fill|type|press|check|uncheck|selectOption|setInputFiles|hover|tap|focus|blur|dragTo|goto|reload|goBack|waitForURL|waitForLoadState|setChecked|clear|scrollIntoViewIfNeeded|post|put|patch|delete)\s*\(/;

function containsAction(node: ts.Node): boolean {
  return ACTION_PATTERN.test(node.getText());
}

/** `if` / `else if` の連鎖が全域か（最後に else があり、全経路が主張を含む） */
function isTotalBranch(gate: Gate): boolean {
  const statement = gate.ifStatement;
  if (statement) {
    const branches: ts.Node[] = [];
    let current: ts.IfStatement | undefined = statement;
    for (;;) {
      branches.push(current.thenStatement);
      const next: ts.Statement | undefined = current.elseStatement;
      if (!next) return false; // else が無ければ全域ではない
      if (ts.isIfStatement(next)) {
        current = next;
        continue;
      }
      branches.push(next);
      break;
    }
    return branches.every((b) => containsAssertion(b) || containsAction(b));
  }
  if (ts.isConditionalExpression(gate.node)) {
    return containsAssertion(gate.node.whenTrue) && containsAssertion(gate.node.whenFalse);
  }
  return false;
}

/** 直近の繰り返しの外に throw があるか（再試行の失敗経路） */
function isRetryLoopExit(gate: Gate): boolean {
  const statement = gate.ifStatement;
  if (!statement) return false;
  if (!isSilentExit(statement.thenStatement)) return false;
  let loop: ts.Node | undefined;
  for (let n: ts.Node | undefined = statement.parent; n; n = n.parent) {
    if (
      ts.isForStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n)
    ) {
      loop = n;
      break;
    }
    if (ts.isFunctionLike(n)) return false;
  }
  if (!loop) return false;
  const parent = loop.parent;
  if (!parent || !ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(loop as ts.Statement);
  if (index < 0) return false;
  return parent.statements.slice(index + 1).some((s) => containsFailure(s));
}

// ============================================================================
// 分類本体
// ============================================================================

export function classify(finding: Finding, node: ts.Node): Classified {
  const gate = toGate(node);
  const base = {
    file: finding.file,
    line: finding.line,
    type: finding.type,
    snippet: finding.snippet,
  };
  if (!gate) return { ...base, group: 'E', detail: '関門の形として正規化できない' };

  const predicate = predicateImplementationExclusion(node);
  if (predicate) return { ...base, group: 'A', detail: predicate };

  const guaranteed = guaranteedFailureExclusion(node);
  if (guaranteed) return { ...base, group: 'B', detail: guaranteed };

  if (isTypeNarrowing(gate)) {
    return { ...base, group: 'C', detail: '直前の無条件の主張で存在が確定している' };
  }

  if (isTotalBranch(gate)) {
    return { ...base, group: 'G', detail: 'else まで含めて全経路が主張または操作を含む' };
  }

  if (isRetryLoopExit(gate)) {
    return { ...base, group: 'D1', detail: '繰り返しの外に throw がある' };
  }

  if (gate.ifStatement && isSilentExit(gate.ifStatement.thenStatement)) {
    return { ...base, group: 'D2', detail: '沈黙して脱出する' };
  }

  if (containsAssertion(gate.thenBranch) && containsAction(gate.thenBranch)) {
    return { ...base, group: 'F', detail: '分岐の内側に主張と操作の双方がある' };
  }

  return { ...base, group: 'E', detail: '主張を条件で包むだけ' };
}

export function classifyAll(): { classified: Classified[]; gateTotal: number; total: number } {
  const files = collectE2eFiles();
  const classified: Classified[] = [];
  let total = 0;
  let gateTotal = 0;
  for (const file of files) {
    const result = scanFile(file);
    total += result.findings.length;
    result.findings.forEach((finding, index) => {
      if (!GATE_TYPES.includes(finding.type)) return;
      gateTotal += 1;
      classified.push(classify(finding, result.findingNodes[index]!));
    });
  }
  return { classified, gateTotal, total };
}

/** `--list` で指定された群（カンマ区切り）を解釈する */
function parseListGroups(raw: string | undefined): Group[] {
  if (!raw) return [];
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const unknown = requested.filter((s) => !GROUPS.includes(s as Group));
  if (unknown.length > 0) {
    throw new Error(
      `--list に未知の群が指定された: ${unknown.join(', ')}（指定できるのは ${GROUPS.join(' / ')}）`
    );
  }
  return requested as Group[];
}

/** 該当箇所の前後の実コードを印字する（`--context` 指定時） */
function printSource(item: Classified, context: number, read: (file: string) => string[]): void {
  const lines = read(item.file);
  const from = Math.max(1, item.line - context);
  const to = Math.min(lines.length, item.line + context);
  for (let n = from; n <= to; n++) {
    const marker = n === item.line ? '>' : ' ';
    console.log(`     ${String(n).padStart(6)} ${marker} ${lines[n - 1] ?? ''}`);
  }
  console.log('');
}

function main(): void {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const listIndex = args.indexOf('--list');
  const listGroups = parseListGroups(listIndex >= 0 ? args[listIndex + 1] : undefined);
  const contextIndex = args.indexOf('--context');
  const context = contextIndex >= 0 ? Number.parseInt(args[contextIndex + 1] ?? '6', 10) : 0;
  if (contextIndex >= 0 && !Number.isFinite(context)) {
    throw new Error('--context には行数を指定すること（例: --context 8）');
  }

  const { classified, gateTotal, total } = classifyAll();

  if (asJson) {
    console.log(JSON.stringify({ total, gateTotal, classified }, null, 2));
    return;
  }

  const counts = new Map<Group, number>(GROUPS.map((g) => [g, 0]));
  for (const item of classified) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);

  console.log('🔎 沈黙する関門の一族（T1 / T4 / T5）の構文木による分類');
  console.log(`   検出件数（全型）: ${total}`);
  console.log(`   分類対象（T1 / T4 / T5）: ${gateTotal}`);
  let sum = 0;
  for (const group of GROUPS) {
    const count = counts.get(group) ?? 0;
    sum += count;
    console.log(`     ${group.padEnd(3)} ${String(count).padStart(4)}  ${GROUP_LABEL[group]}`);
  }
  console.log(`   合計 ${sum}（分類対象 ${gateTotal} と${sum === gateTotal ? '一致' : '不一致'}）`);

  const byType = new Map<GuardType, number>();
  for (const item of classified) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
  console.log('   型別:');
  for (const type of GATE_TYPES) {
    console.log(`     ${type.padEnd(24)} ${String(byType.get(type) ?? 0).padStart(4)}`);
  }

  if (listGroups.length > 0) {
    const cache = new Map<string, string[]>();
    const read = (file: string): string[] => {
      const cached = cache.get(file);
      if (cached) return cached;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      cache.set(file, lines);
      return lines;
    };
    for (const group of listGroups) {
      const items = classified.filter((item) => item.group === group);
      console.log('');
      console.log(`   ── ${group}（${items.length} 件）: ${GROUP_LABEL[group]}`);
      for (const item of items) {
        console.log(`   ${item.file}:${item.line} [${item.type}] (${item.detail}) ${item.snippet}`);
        if (context > 0) printSource(item, context, read);
      }
    }
  }

  if (sum !== gateTotal) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
