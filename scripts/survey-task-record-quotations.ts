/**
 * @fileoverview タスク一覧の記録が引く逐語の母集団と、素朴な関門の誤検出の一覧（タスク 115.290）
 *
 * ## なぜ置くか
 *
 * `.kiro/specs/site-survey/tasks.md` の記録が引く逐語の実在を機械の関門へ載せるかは
 * タスク 115.290 の判断である。同タスクは**載せない**（作法で拘束する）道を採ったが、
 * その根拠はいずれも数であって、後任が取り直せなければ判断の再審ができない。
 * タスク 115.273 の `scripts/list-foreign-design-scan-drift.ts` と
 * タスク 115.288 の `scripts/survey-steering-command-annotation-drift.ts` が
 * 「代償を率で測ってから決める」ために置いたのと同じ位置づけの一覧である。
 *
 * ## 何を数えるか
 *
 * 1. **規模**——タスク一覧の行数、逆引用符で囲まれた区間の数、相異なる綴りの数。
 * 2. **素朴な関門の母集団と誤検出**——相異なる綴りのうち、版管理が挙げるテキストファイル
 *    （タスク一覧自身を除く）のどこにも部分文字列として現れないもの。「逆引用符の中身は
 *    実在すること」を全件へ課したときに挙がる数である。
 * 3. **起票が挙げた宣言方式の母集団**——版を固定した出典参照（`<コミット>:<パス>` の形）を
 *    同じ行に持つ記述。宣言方式はこの形の記述にしか置けない。
 * 4. **宣言を要しない形の母集団と誤検出**——逆引用符の中が「`grep` に単引用の逐語と引数を
 *    伴う」形の記述。取り出しコマンドを記述自身が持つため、宣言を書かずに機械化できる
 *    唯一の形である。その逐語が作業ツリーに実在するかを見る。
 *
 * ## 使い方
 *
 *     npx tsx scripts/survey-task-record-quotations.ts [--list]
 *
 * リポジトリルートで走らせること（`git ls-files` の呼び出しが作業ツリーの位置に依る）。
 * `--list` を付けると 2 と 4 の指摘を全件印字する（件数だけの出口では読み直しを追試できない。
 * `.kiro/steering/development-discipline.md` の「一件ずつ読んだ」に関する要求）。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 走査するタスク一覧（リポジトリルート相対） */
export const SURVEYED_DOCUMENT = '.kiro/specs/site-survey/tasks.md';

/** 逆引用符で囲まれた区間 */
const SPAN_PATTERN = /`([^`\n]+)`/g;

/** 版を固定した出典参照（`<コミット>:<パス>` の形） */
const PINNED_SOURCE_REFERENCE = /[0-9a-f]{7,40}:[.A-Za-z0-9_/-]+\.(?:md|ts|tsx|json|js|sh|yml)/;

/** 逆引用符の中が `grep` に単引用の逐語と引数を伴う形 */
const GREP_QUOTATION = /^(?:git\s+grep|grep)\s+(?:-[A-Za-z]+\s+)*'([^']+)'\s+(.+)$/;

/** 本文を読める大きさの上限（版管理には画像なども載るため） */
const MAX_CORPUS_FILE_BYTES = 8 * 1024 * 1024;

interface GrepQuotation {
  readonly line: number;
  readonly span: string;
  readonly literal: string;
  readonly argument: string;
}

/** 版管理が挙げるテキストファイルを連結した本文（走査対象自身は除く） */
function readCorpus(exclude: string): string {
  const listed = spawnSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (listed.status !== 0) {
    throw new Error(`git ls-files に失敗しました: ${listed.stderr}`);
  }
  const chunks: string[] = [];
  for (const relative of listed.stdout.split('\n').filter((entry) => entry !== '')) {
    if (relative === exclude) continue;
    const absolute = path.join(ROOT, relative);
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile() || stat.size > MAX_CORPUS_FILE_BYTES) continue;
      const buffer = fs.readFileSync(absolute);
      if (buffer.includes(0)) continue;
      chunks.push(buffer.toString('utf8'));
    } catch {
      continue;
    }
  }
  return chunks.join('\n\n');
}

/** 逆引用符の区間を行ごとに取り出す */
export function collectSpans(lines: readonly string[]): { line: number; span: string }[] {
  const spans: { line: number; span: string }[] = [];
  lines.forEach((text, index) => {
    SPAN_PATTERN.lastIndex = 0;
    let matched: RegExpExecArray | null = SPAN_PATTERN.exec(text);
    while (matched !== null) {
      spans.push({ line: index + 1, span: matched[1] ?? '' });
      matched = SPAN_PATTERN.exec(text);
    }
  });
  return spans;
}

/** `grep` に単引用の逐語と引数を伴う区間だけを残す */
export function collectGrepQuotations(
  spans: readonly { line: number; span: string }[]
): GrepQuotation[] {
  const quotations: GrepQuotation[] = [];
  for (const entry of spans) {
    const matched = GREP_QUOTATION.exec(entry.span);
    if (matched === null) continue;
    quotations.push({
      line: entry.line,
      span: entry.span,
      literal: matched[1] ?? '',
      argument: matched[2] ?? '',
    });
  }
  return quotations;
}

function main(): void {
  const listAll = process.argv.includes('--list');
  const absolute = path.join(ROOT, SURVEYED_DOCUMENT);
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split('\n');
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;

  const spans = collectSpans(lines);
  const uniqueSpans = [...new Set(spans.map((entry) => entry.span))];

  const corpus = readCorpus(SURVEYED_DOCUMENT);
  const absentSpans = uniqueSpans.filter((span) => !corpus.includes(span));

  const pinnedLines = lines
    .map((text_, index) => ({ line: index + 1, text: text_ }))
    .filter((entry) => PINNED_SOURCE_REFERENCE.test(entry.text));

  const quotations = collectGrepQuotations(spans);
  const uniqueLiterals = [...new Set(quotations.map((entry) => entry.literal))];
  const pinnedQuotations = quotations.filter((entry) => /\b[0-9a-f]{7,40}\b/.test(entry.argument));
  const absentQuotations = quotations.filter((entry) => !corpus.includes(entry.literal));

  console.log(`走査対象: ${SURVEYED_DOCUMENT}`);
  console.log(`1. 規模`);
  console.log(`   行数: ${lineCount}`);
  console.log(`   逆引用符の区間: ${spans.length}`);
  console.log(`   相異なる綴り: ${uniqueSpans.length}`);
  console.log(`2. 全件へ実在を課したときの指摘: ${absentSpans.length}`);
  const ratio = uniqueSpans.length === 0 ? 0 : (absentSpans.length / uniqueSpans.length) * 100;
  console.log(`   相異なる綴りに対する比: ${ratio.toFixed(1)}%`);
  if (listAll) {
    for (const span of absentSpans) console.log(`   - ${span}`);
  }
  console.log(`3. 版を固定した出典参照を同じ行に持つ記述: ${pinnedLines.length}`);
  for (const entry of pinnedLines) {
    console.log(`   - ${entry.text.trim().slice(0, 160)}`);
  }
  console.log(`4. 取り出しコマンドを自ら持つ記述: ${quotations.length}`);
  console.log(`   相異なる逐語: ${uniqueLiterals.length}`);
  console.log(`   うち版を固定するもの: ${pinnedQuotations.length}`);
  console.log(`   作業ツリーに実在しない逐語: ${absentQuotations.length}`);
  for (const entry of absentQuotations) {
    console.log(`   - ${entry.span}`);
  }
}

main();
