/**
 * @fileoverview steering の**実体の件数**が版の手掛かりを持たないまま凍る状態の検査（タスク 115.275）
 *
 * ## なぜ在るか
 *
 * `.kiro/steering/structure.md` は毎セッション読み込まれる「現在の構成」の記述である。
 * そこにディレクトリのファイル数を数値で書くと、ファイルが一つ増減しただけで無言のうちに
 * 偽になる。既存の三つの検査はいずれもこの形を見ていない。
 *
 *   `check:steering-refs`      ファイル名を伴う記載の実在（タスク 115.169 / 115.199）
 *   `check:steering-idents`    拡張子を伴わない識別子の実在（タスク 115.198）
 *   `check:steering-test-tree` テスト区分の列挙の過不足と、**「テスト」を含む行の**件数
 *
 * 三つ目の件数の規約は `scripts/check-steering-test-tree.ts` の `extractCountAnnotation` が
 * `raw.includes('テスト')` で入口を絞るため、`注釈ツール（11ファイル）` のような
 * ディレクトリ注記は対象外である（同ファイルの冒頭がその旨を明記している）。本検査はその
 * 穴を塞ぐ。
 *
 * ## 実測上の根拠（タスク 115.275、コミット b84137b9、2026-09-05 に実測）
 *
 * 是正前の `.kiro/steering/structure.md` には、実体の件数を名乗りながら実測日を持たない行が
 * **30 行**あった。うち再現コマンドを書ける 21 行を測り直すと、**13 行が食い違っていた**。
 *
 *   - ディレクトリのファイル数を名乗る 17 行のうち **10 行が食い違い**（`quantity-table/`
 *     22→68、`frontend/src/utils/` 22→37、`backend/src/routes/` 34→37 など。
 *     `10+ファイル` の形の下限表記 3 行は下限としては真だが実体から大きく離れている）
 *   - Storybook のストーリー数 132→**157**、`実装済みAPI（34ルートファイル）`→**37**、
 *     `services/` の `59サービス`→**65**（`*.service.ts` を数えた場合）
 *   - `estimate-creation` の `（tasks.md のチェック項目245件すべて完了）` は、
 *     起票時点（コミット `46f1138`、2026-09-02）では 245/245 で一致していたが、
 *     本検査を書いた時点では **246 件中 245 件**であり、未完了の項目が一つ在る
 *
 * 残る 9 行（`全46タスク完了` の形）については、走査規則の空間が開いているため
 * 「どの数え方でも再現できない」を機械で確かめる手段が無い。**当てた規則を挙げて範囲を限る。**
 * `<spec>` は当該スペックのディレクトリ名、いずれもリポジトリルートで 2026-09-05 に実行した。
 *
 *   1. grep -cE '^[[:space:]]*- \[[ x]\]' .kiro/specs/<spec>/tasks.md   深さを問わないチェック項目
 *   2. grep -cE '^- \[[ x]\] [0-9]+\. ' .kiro/specs/<spec>/tasks.md     最上位の番号付き項目
 *   3. 規則 2 の綴りを grep -oE で拾い [0-9]+$ を sort -un | wc -l         相異なる最上位番号
 *   4. grep -cE '^#{2,3} ' .kiro/specs/<spec>/tasks.md                    見出し
 *   5. grep -cE '^[[:space:]]*- \[x\]' .kiro/specs/<spec>/tasks.md       完了印の付いた項目
 *   6. 規則 1 の綴りに続く [0-9]+(\.[0-9]+)* を sort -u | wc -l           深さを問わない相異なる番号
 *
 * この 6 規則の範囲では、コミット b84137b9 の時点で 9 行すべてが書かれた値を再現しない
 * （`contract-management` の 17 に対し 45／16／16／0／45／45）。当該文言が structure.md へ
 * 入った版まで `git log -S` で遡ると 2 行だけ再現できる（`project-management` の 17 は導入版
 * 06844cb4 で規則 3 が 17、`itemized-statement-generation` の 16 は導入版 0efe3215 で規則 3 が
 * 16。2026-09-05 に実測）。残る 7 行は導入時点でも一致しない（`user-authentication` の 46 は
 * 導入版 5e9b3320 で 65／10／10／2／31／65。2026-09-05 に実測）。
 * **上の 6 規則以外の数え方は当てておらず、いずれかが値を再現するなら本注記は偽になる。**
 *
 * すなわち起票から 3 日で新たな食い違いが一件生まれ、9 行のうち 7 行は上の範囲では数え方その
 * ものを再現できなかった。値を書き換えるだけでは同じことが繰り返される。
 *
 * ## 何を検査するか
 *
 * 対象文書の各行について、
 *
 *   「数値 + 実体の単位語」（`11ファイル` / `59サービス` / `46タスク` / `245件` など）を
 *   含む行は、**同じ行に `YYYY-MM-DD` の実測日を持たなければならない**
 *
 * これは `.kiro/specs/site-survey/design.md` の「実測値の書き方（タスク 115.212）」が定める
 * 規約 (a)（実測日を数値と同じ場所に添える）を機械化したものである。規約 (b)（数値を書かず
 * 数える手段に読ませる）を選んだ記述は数値そのものが消えるため、本検査の網に掛からない。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-dir-counts.ts [--verbose] [--json]
 *   npm run check:steering-dir-counts
 *
 * ## 走査範囲（境界。他の steering 文書を対象にしない理由）
 *
 * 対象は `.kiro/steering/structure.md` **一件だけ**である。同じ規則を他の steering 文書へ
 * 当てると、`development-discipline.md` は複数行にまたがる散文の途中行が 10 行掛かり
 * （実測日は段落の別の行に在る）、`product.md` は `141ストーリーファイル` が 1 行、
 * `tech.md` は `最大5件のPRまで同時作成`（実体の件数ではない）が 1 行掛かる
 * （いずれも 2026-09-05、コミット `b84137b9` に実測）。行単位の規則は散文へは早すぎる。
 * **`product.md` の `141ストーリーファイル` は本検査と同型の陳腐化である**（実測 157）が、
 * タスク 115.275 の境界（structure.md）の外であるため是正していない。
 *
 * ## 検出しない形（限界。すべて見逃し側へ倒してある）
 *
 *   - **単位語の一覧に無い数え方は読まない。** `（5バリアント）`（`ErrorBoundary.stories.tsx`
 *     の名前付きエクスポート数。2026-09-05 の実測では 5 で一致）、`12種類のステータス`、
 *     `3行1セット` はいずれも対象外である。単位語を増やすほど散文の誤検出が増える。
 *   - **実測日が在ることしか見ない。** 日付が正しいか、数値が実体と一致するかまでは見ない。
 *     日付を添えた数値の正しさは読み手とレビューが見る。
 *   - **行を単位に見る。** 数値と実測日が別の行に分かれた散文は掛かる（上の走査範囲の理由）。
 *   - **`.kiro/steering/` 以外は読まない。** 設計文書は `check:design-measurement-freshness`
 *     の所管である。
 */

import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリルート（本ファイルは scripts/ 直下に置かれる） */
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 走査対象。**一件だけ**である理由は冒頭の「走査範囲」を参照。
 * 空にすると前提の崩壊として失敗する（第3原則）。
 */
export const TARGET_DOCUMENTS = ['.kiro/steering/structure.md'] as const;

/**
 * 実体の件数を表す単位語。数値が**直前**に来る形だけを数える。
 * `タスク 115.275` のように数値が後ろへ来る言及は掛からない。
 */
export const ARTIFACT_COUNT_UNITS = [
  'ファイル',
  'ルートファイル',
  'ストーリー',
  'サービス',
  'タスク',
  '区分',
  '件',
] as const;

/** 実測日の形（規約 (a)。`YYYY-MM-DD`） */
export const MEASUREMENT_DATE_PATTERN = /20[0-9]{2}-[0-9]{2}-[0-9]{2}/;

/** 「数値 + 実体の単位語」。`10+ファイル` のような下限表記も数える */
export function buildCountPattern(units: readonly string[]): RegExp {
  const alternation = units.map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`[0-9０-９]+\\s*\\+?\\s*(?:${alternation})`);
}

export interface Finding {
  file: string;
  line: number;
  /** 掛かった綴り（`11ファイル` など） */
  subject: string;
  detail: string;
  snippet: string;
}

export interface RunResult {
  findings: Finding[];
  /** 実在した走査対象 */
  scannedFiles: string[];
  /** 照合した行の総数。0 なら走査が空振りしている */
  scannedLines: number;
  /** 実測日を持つため免除された件数（規約 (a) を満たす記述の数） */
  exempted: number;
  /** 判定器が陽性の対照を検出したか（恒偽への退化を捕らえる） */
  detectorPositive: boolean;
}

/** 判定器そのものが恒偽へ退化していないことを確かめる陽性の対照 */
export const DETECTOR_POSITIVE_CONTROL = '│   ├── utils/  # ユーティリティ関数（22ファイル）';

/** 一行の判定。実測日を同じ行に持たない「数値 + 単位語」を返す */
export function findDatelessCount(
  raw: string,
  countPattern: RegExp
): { subject: string } | undefined {
  const match = countPattern.exec(raw);
  if (!match) return undefined;
  if (MEASUREMENT_DATE_PATTERN.test(raw)) return undefined;
  return { subject: match[0] };
}

export interface RunOptions {
  root?: string;
  targets?: readonly string[];
  units?: readonly string[];
}

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? REPOSITORY_ROOT;
  const targets = options.targets ?? TARGET_DOCUMENTS;
  const units = options.units ?? ARTIFACT_COUNT_UNITS;
  const countPattern = units.length === 0 ? undefined : buildCountPattern(units);

  const findings: Finding[] = [];
  const scannedFiles: string[] = [];
  let scannedLines = 0;
  let exempted = 0;

  for (const relative of targets) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) continue;
    scannedFiles.push(relative);
    const lines = readFileSync(absolute, 'utf8').split('\n');
    for (const [index, raw] of lines.entries()) {
      scannedLines += 1;
      if (!countPattern) continue;
      const hit = countPattern.exec(raw);
      if (!hit) continue;
      if (MEASUREMENT_DATE_PATTERN.test(raw)) {
        exempted += 1;
        continue;
      }
      findings.push({
        file: relative,
        line: index + 1,
        subject: hit[0],
        detail: '実体の件数が実測日を伴わずに書かれている（規約 (a)/(b) のどちらでもない）',
        snippet: raw.trim().slice(0, 160),
      });
    }
  }

  const detectorPositive = countPattern
    ? findDatelessCount(DETECTOR_POSITIVE_CONTROL, countPattern) !== undefined
    : false;

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return { findings, scannedFiles, scannedLines, exempted, detectorPositive };
}

/** 走査が空振りしていないかの判定。0 件の合格を合格にしない（第3原則） */
export function decideExit(result: RunResult): { ok: boolean; reason?: string } {
  if (result.scannedFiles.length === 0) {
    return { ok: false, reason: '走査対象の steering 文書が一件も見つかりませんでした' };
  }
  if (result.scannedLines === 0) {
    return { ok: false, reason: 'steering 文書は在るのに、照合した行が0行です' };
  }
  if (!result.detectorPositive) {
    return {
      ok: false,
      reason: '判定器が陽性の対照を検出しませんでした（単位語の一覧か判定が壊れています）',
    };
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
        `✅ steering の実体の件数はすべて版の手掛かりを持ちます` +
          `（走査 ${result.scannedFiles.length} 文書 / ${result.scannedLines} 行、` +
          `実測日を伴う記述 ${result.exempted} 件）`
      );
    }
    return;
  }

  if (!json) {
    if (result.findings.length === 0) {
      console.error(`❌ ${decision.reason}`);
      console.error(`   走査対象: ${TARGET_DOCUMENTS.join(', ')}`);
      console.error('   リポジトリルートで実行しているか確認してください');
      process.exit(1);
    }

    console.error('❌ steering に版の手掛かりを持たない実体の件数があります');
    console.error('');
    console.error('   steering は毎セッション読み込まれる「現在の構成」の記述です。');
    console.error('   ディレクトリのファイル数のような値は、ファイルが一つ増減しただけで');
    console.error('   無言のうちに偽になります（タスク 115.275）。');
    console.error('');
    console.error('   対応は次の二つのどちらかです（タスク 115.212 の規約）。');
    console.error('     (a) 実測日を同じ行へ添える（`2026-09-05 に実測` の形）');
    console.error('     (b) 数値を落とし、数える手段（`git ls-files <dir> | wc -l` 等）を書く');
    console.error('');
    for (const finding of result.findings) {
      console.error(`   ${finding.file}:${finding.line} [${finding.subject}]`);
      if (verbose) console.error(`        ${finding.snippet}`);
    }
    console.error('');
    console.error(
      `   合計 ${result.findings.length} 件（走査 ${result.scannedLines} 行、` +
        `実測日を伴う記述 ${result.exempted} 件）`
    );
  }
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
