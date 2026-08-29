#!/usr/bin/env npx tsx
/**
 * 被覆印が名乗る受入基準と、その区間が実際に述べている内容との対応を走査する
 *
 * 使い方:
 *   npx tsx scripts/scan-coverage-mark-correspondence.ts            # 全件を一致度の昇順で出力
 *   npx tsx scripts/scan-coverage-mark-correspondence.ts --limit 80 # 下位80件だけ出力
 *   npx tsx scripts/scan-coverage-mark-correspondence.ts --tsv      # TSV
 *   npx tsx scripts/scan-coverage-mark-correspondence.ts --by-delta # 「別の条文の方が合う」順
 *
 * これは検査（check）ではなく走査（scan）である。合否を出さない。
 *
 * 何をするか:
 *   `e2e/specs` の全被覆印について、被覆印が属する区間（テスト・群の宣言＋その本文。
 *   区間の割り方は scripts/check-requirement-coverage.ts の splitCoverageBlocks と同一）の
 *   文字列と、名乗っている受入基準の原文との**文字bigram一致度**を出す。順序づけには
 *   「原文のbigramのうち区間に現れる割合（含有率）」を使い、Dice係数は参考値として併記する。
 *   一致度が低いものから順に人手で裁定するための順序づけであり、それ以上のものではない。
 *
 * 裁定結果:
 *   本走査で確定した母集団の全件裁定は scripts/coverage-mark-adjudication.md にある。
 *   是正した被覆印と、部分被覆として引き継いだ被覆印を一件ずつ記録している。
 *
 * 限界（両方向で述べる）:
 *   - 低い一致度は誤りを意味しない。E2Eの本文はセレクタ・待ち合わせ・データ準備が大半を
 *     占めるため、正しく対応していても一致度は低く出る。**下位に集めるための道具であって、
 *     判定の道具ではない。**
 *   - 高い一致度も正しさを意味しない。同一要件内の隣接条文は語彙をほぼ共有するため、
 *     一つずれていても一致度は高いまま出る（実測: 115.188 が是正した site-survey-crud の
 *     1.4→1.5 の誤りは上位帯に出た）。**上位を見なくてよい根拠にはならない。**
 *   - 註釈（`//` `/* *\/`）は一致度の計算から除く。受入基準の原文を写した註釈が
 *     一致度を押し上げ、内容の食い違いを覆い隠すためである。
 *   - 区間の割り方が同じである以上、被覆印の読み取り規則の穴（`(feature/REQ-1.1, REQ-1.2)`
 *     の二つ目以降など）はここにも現れない。走査の母集団は「読み取り規則が読める被覆印」である。
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  E2E_SPECS_ROOT,
  extractAllFeatures,
  discoverFeatures,
  splitCoverageBlocks,
  toPosixPath,
  type AcceptanceCriteria,
  type Feature,
} from './check-requirement-coverage';

/** 註釈行（一致度の計算から除く） */
const COMMENT_LINE_REGEX = /^[ \t]*(?:\/\/|\/\*|\*)/;

/** 一致度の計算に使う形へ均す（空白・記号を落とし、英字は小文字へ） */
export function normalizeForComparison(text: string): string {
  return text.replace(/[\s`'"(){}\[\]<>:;,.=\-_/\\|+*&%$#@!?~^]/g, '').toLowerCase();
}

function bigrams(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i + 1 < text.length; i += 1) {
    const key = text.slice(i, i + 2);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

/** 文字bigramのDice係数（0〜1） */
export function bigramSimilarity(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  let sizeA = 0;
  for (const count of a.values()) sizeA += count;
  let sizeB = 0;
  for (const count of b.values()) sizeB += count;
  if (sizeA === 0 || sizeB === 0) return 0;
  let shared = 0;
  for (const [key, count] of a) shared += Math.min(count, b.get(key) ?? 0);
  return (2 * shared) / (sizeA + sizeB);
}

/**
 * 受入基準の原文の文字bigramのうち、区間の側に現れる割合（0〜1）
 *
 * Dice係数は区間の長さに引きずられる（E2Eの本文はセレクタと待ち合わせで長く、
 * 正しく対応していても係数が下がる）。順序づけにはこちらを使う。
 */
export function bigramContainment(criterion: string, block: string): number {
  return containmentAgainst(criterion, bigrams(block));
}

function containmentAgainst(criterion: string, blockBigrams: Map<string, number>): number {
  const a = bigrams(criterion);
  let sizeA = 0;
  for (const count of a.values()) sizeA += count;
  if (sizeA === 0) return 0;
  let shared = 0;
  for (const [key, count] of a) shared += Math.min(count, blockBigrams.get(key) ?? 0);
  return shared / sizeA;
}

export interface CoverageMarkRow {
  file: string;
  /** 区間の宣言行（1 始まり。ファイル前書きは 1） */
  line: number;
  /** 名乗っている受入基準 */
  criterionId: string;
  /** 受入基準の原文（分母から外れている場合は null） */
  criterionText: string | null;
  /** 区間の表題（テスト・群の名。前書きは空） */
  title: string;
  /** 原文の文字bigramのうち区間に現れる割合（順序づけに使う。原文が無い場合は 0） */
  score: number;
  /** 参考値としてのDice係数 */
  dice: number;
  /**
   * 同じ機能の中で、この区間に最もよく合う別の受入基準
   *
   * 一致度の絶対値だけでは、隣接する条文へ一つずれた誤りを下位に集められない
   * （実測: site-survey-crud の 1.4→1.5 は含有率 0.5397 で 3697 件中 3260 位）。
   * 「名乗っている条文よりも合う条文が他にある」を第二の順序づけとして持つ。
   */
  bestAlternativeId: string | null;
  bestAlternativeText: string | null;
  bestAlternativeScore: number;
  /** bestAlternativeScore - score。大きいほど「別の条文の方が合う」 */
  delta: number;
}

function criterionIndex(features: readonly Feature[]): Map<string, AcceptanceCriteria> {
  const index = new Map<string, AcceptanceCriteria>();
  for (const feature of features) {
    for (const requirement of [...feature.requirements, ...feature.retiredRequirements]) {
      for (const criterion of [
        ...requirement.acceptanceCriteria,
        ...requirement.retiredAcceptanceCriteria,
      ]) {
        index.set(criterion.id, criterion);
      }
    }
  }
  return index;
}

function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, pattern));
    else if (pattern.test(entry.name)) results.push(full);
  }
  return results.sort();
}

/** 宣言行から表題（最初の文字列リテラル）を取り出す */
export function declarationTitle(line: string): string {
  const match = /['"`]([^'"`]*)['"`]/.exec(line);
  return match?.[1] ?? '';
}

export function scanCoverageMarks(scanRoot: string = E2E_SPECS_ROOT): CoverageMarkRow[] {
  const features = extractAllFeatures(discoverFeatures());
  const featureNames = features.map((feature) => feature.name);
  const index = criterionIndex(features);
  const liveByFeature = new Map<string, AcceptanceCriteria[]>(
    features.map((feature) => [
      feature.name,
      feature.requirements.flatMap((requirement) => requirement.acceptanceCriteria),
    ])
  );
  const rows: CoverageMarkRow[] = [];

  for (const file of findFiles(scanRoot, /\.(ts|tsx)$/)) {
    const content = fs.readFileSync(file, 'utf-8');
    const relative = toPosixPath(path.relative(process.cwd(), file));
    const lines = content.split('\n');
    for (const { block, prose } of splitCoverageBlocks(content, featureNames)) {
      const declarationLine = block.declaration >= 0 ? (lines[block.declaration] ?? '') : '';
      const title = declarationTitle(declarationLine);
      const body = prose
        .split('\n')
        .filter((line) => !COMMENT_LINE_REGEX.test(line))
        .join('\n');
      const normalizedBody = normalizeForComparison(`${title}\n${body}`);
      const bodyBigrams = bigrams(normalizedBody);
      const claimedFeatures = new Set([...block.claimed].map((id) => id.slice(0, id.indexOf('/'))));
      const candidates: Array<{ id: string; score: number }> = [];
      for (const featureName of claimedFeatures) {
        for (const criterion of liveByFeature.get(featureName) ?? []) {
          candidates.push({
            id: criterion.id,
            score: containmentAgainst(normalizeForComparison(criterion.text), bodyBigrams),
          });
        }
      }
      for (const criterionId of [...block.claimed].sort()) {
        const criterion = index.get(criterionId);
        const criterionText = criterion?.text ?? null;
        const normalizedCriterion =
          criterionText === null ? '' : normalizeForComparison(criterionText);
        const score =
          criterionText === null ? 0 : bigramContainment(normalizedCriterion, normalizedBody);
        const dice =
          criterionText === null ? 0 : bigramSimilarity(normalizedCriterion, normalizedBody);
        let bestAlternativeId: string | null = null;
        let bestAlternativeScore = 0;
        for (const candidate of candidates) {
          if (block.claimed.has(candidate.id)) continue;
          if (candidate.score > bestAlternativeScore) {
            bestAlternativeScore = candidate.score;
            bestAlternativeId = candidate.id;
          }
        }
        rows.push({
          file: relative,
          line: Math.max(1, block.declaration + 1),
          criterionId,
          criterionText,
          title,
          score,
          dice,
          bestAlternativeId,
          bestAlternativeText:
            bestAlternativeId === null ? null : (index.get(bestAlternativeId)?.text ?? null),
          bestAlternativeScore,
          delta: bestAlternativeScore - score,
        });
      }
    }
  }

  return rows.sort((a, b) => a.score - b.score || a.file.localeCompare(b.file) || a.line - b.line);
}

function main(): void {
  const args = process.argv.slice(2);
  const tsv = args.includes('--tsv');
  const byDelta = args.includes('--by-delta');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Number.POSITIVE_INFINITY;

  const rows = scanCoverageMarks();
  if (byDelta) rows.sort((a, b) => b.delta - a.delta);
  console.log(`被覆印（読み取り規則が読める全件）: ${rows.length}`);
  console.log(`区間つき出力（一致度の昇順・上限 ${limit === Infinity ? '無し' : limit}）`);
  console.log('');

  let shown = 0;
  for (const row of rows) {
    if (shown >= limit) break;
    shown += 1;
    if (tsv) {
      console.log(
        [
          row.file,
          row.line,
          row.criterionId,
          row.score.toFixed(4),
          row.dice.toFixed(4),
          row.bestAlternativeId ?? '-',
          row.bestAlternativeScore.toFixed(4),
          row.title,
        ].join('\t')
      );
    } else {
      console.log(`#${shown} ${row.score.toFixed(4)} ${row.file}:${row.line}`);
      console.log(`  名乗り: ${row.criterionId}`);
      console.log(`  原文  : ${row.criterionText ?? '(分母外)'}`);
      console.log(`  表題  : ${row.title}`);
      console.log(
        `  対抗  : ${row.bestAlternativeId ?? '(無し)'} (${row.bestAlternativeScore.toFixed(4)}, 差 ${row.delta.toFixed(4)})`
      );
      console.log(`  対抗原文: ${row.bestAlternativeText ?? '-'}`);
    }
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  toPosixPath(process.argv[1]).endsWith('scan-coverage-mark-correspondence.ts');
if (invokedDirectly) main();
