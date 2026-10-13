#!/usr/bin/env npx tsx
/**
 * 除外が掲げる代替検証が、受入基準の原文をどこまで覆っているかを走査する
 *
 * 使い方:
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts             # 全件を一致度の昇順で出力
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts --missing   # 列挙の欠落がある件だけ
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts --tsv       # TSV
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts --comma-rule # 読点の規則の試作（§8の追試用）
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts --exclusions <path>
 *                                                                      # 別の版の除外リストに対して走らせる
 *
 * 過去の版（例: タスク115.189 の着手時 = 86882dd）の母集団を測り直すには:
 *   git show 86882dd:e2e/requirement-exclusions.json > /tmp/head-exclusions.json
 *   npx tsx scripts/scan-exclusion-alternative-coverage.ts --exclusions /tmp/head-exclusions.json
 *
 * これは検査（check）ではなく走査（scan）である。合否を出さない。
 * 合否を出すのは scripts/check-requirement-exclusions.ts の `alternative-coverage` で、
 * そちらが判定するのは「原文が中黒で列挙する要素を代替検証が述べているか」だけである。
 *
 * 何をするか:
 *   除外の全件について、次の二つを並べる。
 *     1. **原文の列挙の被覆**（機械で決まる）: `criterionText` が中黒（`・`）で列挙する
 *        要素のうち、`alternativeVerification` が述べていないもの。
 *     2. **一致度**（順序づけのみ）: 原文の文字bigramのうち代替検証の文面に現れる割合。
 *        散文どうしの対応は機械化できないため、人手裁定の順序づけにだけ使う。
 *
 * 限界（両方向で述べる）:
 *   - 低い一致度は誤りを意味しない。代替検証は手段（負荷試験・監視・単体検証）を述べる
 *     ものであり、原文の語をなぞる必要はない。
 *   - **高い一致度も正しさを意味しない。** タスク 115.189 が是正した
 *     site-survey/REQ-8.5（「色・背景色」の欠落）は一致度 0.2778 で 206 件中 136 位であり、
 *     下位帯だけを見る裁定では取りこぼす。**順序づけだけに頼らず全件を裁定すること。**
 *   - 列挙の欠落は「代替検証がその語を書いていない」ことしか言わない。書いてあっても
 *     その観測が実在するかは見ない（実在の側は check-requirement-coverage.ts の
 *     auditExclusions が `in-repo-unverified` として数える）。
 *   - 中黒（`・`）の列挙しか拾わない。読点（`、`）で並ぶ列挙まで広げる規則は
 *     `--comma-rule` に試作として残してある（判定には使わない。理由は下の注記と
 *     scripts/exclusion-alternative-verification-adjudication.md §8 にある）。
 *
 * 裁定結果:
 *   本走査で確定した母集団の全件裁定は
 *   scripts/exclusion-alternative-verification-adjudication.md にある。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  EXCLUSIONS_PATH,
  extractEnumeratedElements,
  namesElement,
} from './check-requirement-exclusions.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 一致度の計算に使う形へ均す（空白・記号を落とし、英字は小文字へ） */
function normalizeForComparison(text: string): string {
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

/** 原文の文字bigramのうち、代替検証の文面に現れる割合（0〜1） */
function bigramContainment(criterion: string, alternative: string): number {
  const left = bigrams(normalizeForComparison(criterion));
  const right = bigrams(normalizeForComparison(alternative));
  let size = 0;
  for (const count of left.values()) size += count;
  if (size === 0) return 0;
  let shared = 0;
  for (const [key, count] of left) shared += Math.min(count, right.get(key) ?? 0);
  return shared / size;
}

interface Row {
  id: string;
  score: number;
  elements: string[];
  missing: string[];
  description: string;
}

/**
 * 読点（`、`）で並ぶ列挙まで項目の切り出しを広げる試作（`--comma-rule`）
 *
 * タスク 115.189 の §8 が「採らなかった」と述べている規則の実体である。**判定には使わない。**
 * `extractEnumeratedElements` と同じ手続きを、区切り文字だけ中黒から読点へ差し替えて行う
 * （読点は区切りになるので、項目の境界の集合からは外す）。
 *
 * 採らなかった理由は出力そのもので確かめられる。読点は列挙の区切りだけでなく**節の切れ目**
 * にも立つため、切り出した「項目」が名詞の列挙になっていない件が混じる。
 * `--comma-rule` を走らせて挙がる件を一件ずつ読めば、どれが節の切れ目の誤認かが判る。
 */
function extractCommaEnumeratedElements(criterionText: string): string[] {
  const text = criterionText.replace(/[(（][A-Za-z0-9]{1,3}[)）]/g, '');
  const boundary = new Set([
    ...'はがをにへとでもやのかられよりまでてし。，．・ 　()（）「」『』,.:：;；/\\|"\'`＋+=<>《》[]【】',
  ] as string[]);
  const elements: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '、') continue;

    let left = index - 1;
    while (left >= 0 && !boundary.has(text[left] as string)) left -= 1;
    let right = index + 1;
    while (right < text.length && !boundary.has(text[right] as string)) right += 1;

    for (const element of [text.slice(left + 1, index), text.slice(index + 1, right)]) {
      if (element !== '' && !elements.includes(element)) elements.push(element);
    }
  }

  return elements;
}

/** 偶数件でも上側へ寄らない真の中央値（偶数件は中央の二つの平均） */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[half] as number;
  return ((sorted[half - 1] as number) + (sorted[half] as number)) / 2;
}

/** `--exclusions <path>` / `--exclusions=<path>` を読む。無ければ既定の除外リスト。 */
function resolveExclusionsPath(args: readonly string[]): string {
  const inline = args.find((arg) => arg.startsWith('--exclusions='));
  if (inline !== undefined)
    return path.resolve(process.cwd(), inline.slice('--exclusions='.length));
  const index = args.indexOf('--exclusions');
  if (index >= 0) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--exclusions には除外リストのパスを続けること');
    }
    return path.resolve(process.cwd(), value);
  }
  return path.resolve(ROOT, EXCLUSIONS_PATH);
}

function main(): void {
  const args = process.argv.slice(2);
  const tsv = args.includes('--tsv');
  const onlyMissing = args.includes('--missing');
  const commaRule = args.includes('--comma-rule');
  const exclusionsPath = resolveExclusionsPath(args);

  const document = JSON.parse(fs.readFileSync(exclusionsPath, 'utf-8')) as Record<string, unknown>;
  const exclusions = document.exclusions as Array<Record<string, unknown>>;

  const entries = exclusions.map((entry) => {
    const criterionText = String(entry.criterionText ?? '');
    const alternative = (entry.alternativeVerification ?? {}) as Record<string, unknown>;
    const alternativeText = Object.values(alternative)
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
    return { entry, criterionText, alternative, alternativeText };
  });

  const rows: Row[] = entries.map(({ entry, criterionText, alternative, alternativeText }) => {
    const elements = extractEnumeratedElements(criterionText);
    return {
      id: String(entry.id ?? ''),
      score: bigramContainment(criterionText, alternativeText),
      elements,
      missing: elements.filter((element) => !namesElement(element, alternativeText)),
      description: String(alternative.description ?? ''),
    };
  });

  if (commaRule) {
    const flagged = entries
      .map(({ entry, criterionText, alternativeText }) => {
        const elements = extractCommaEnumeratedElements(criterionText);
        return {
          id: String(entry.id ?? ''),
          criterionText,
          elements,
          missing: elements.filter((element) => !namesElement(element, alternativeText)),
        };
      })
      .filter((row) => row.missing.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    const brokenSplit = flagged.filter((row) =>
      row.missing.some((element) => element.includes('、'))
    ).length;
    console.log(
      `読点の規則の試作（判定には使わない）: 除外 ${rows.length}件 中 ${flagged.length}件`
    );
    console.log(
      `  うち切り出した項目に読点が残っている（項目の切り出しに失敗している）件: ${brokenSplit}`
    );
    for (const row of flagged) {
      console.log('');
      console.log(`  ${row.id}`);
      console.log(`    読点で切り出した項目: ${row.elements.join('・')}`);
      console.log(`    述べていないとされた項目: ${row.missing.join('・')}`);
      console.log(`    原文: ${row.criterionText.replace(/\s+/g, ' ')}`);
    }
    return;
  }

  const selected = (onlyMissing ? rows.filter((row) => row.missing.length > 0) : rows).sort(
    (a, b) => a.score - b.score || a.id.localeCompare(b.id)
  );

  if (tsv) {
    console.log('score\tid\telements\tmissing\tdescription');
    for (const row of selected) {
      console.log(
        `${row.score.toFixed(4)}\t${row.id}\t${row.elements.join('・')}\t${row.missing.join('・')}\t${row.description.replace(/\s+/g, ' ')}`
      );
    }
  } else {
    for (const row of selected) {
      const mark = row.missing.length > 0 ? '欠落' : '　　';
      console.log(`${row.score.toFixed(4)} ${mark} ${row.id}`);
      if (row.elements.length > 0) {
        console.log(`         原文の列挙: ${row.elements.join('・')}`);
      }
      if (row.missing.length > 0) {
        console.log(`         述べていない要素: ${row.missing.join('・')}`);
      }
    }
  }

  const withEnumeration = rows.filter((row) => row.elements.length >= 2).length;
  const withMissing = rows.filter((row) => row.missing.length > 0).length;
  const scoreMedian = median(rows.map((row) => row.score));

  console.log('');
  console.log(
    `除外 ${rows.length}件 / 中黒で二つ以上を列挙する原文 ${withEnumeration}件 / 述べていない要素がある ${withMissing}件 / 一致度の中央値 ${scoreMedian.toFixed(4)}`
  );
}

main();
