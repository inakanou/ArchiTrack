/**
 * @fileoverview 部品別の自己申告を由来ごとに分けて突き合わせた母集団の一覧（タスク 115.324）
 *
 * ## なぜ置くか
 *
 * `scripts/check-design-component-requirements.ts` は、部品別の自己申告を
 * **部品表（`origin` が `table`）と詳細節の `Requirements` 欄（`origin` が `detail`）の和**で
 * 判定する。したがって片方の由来だけが要件番号を落としても矛盾は挙がらない。
 * **「部品の一覧の行が単独で自足しているか」は、本検査の出力からは読めない。**
 *
 * その差を後任が自分で測り直せるようにするための出口である。
 * `.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」が求める
 * **追試の手順を数値と同じ場所に置く**形にあたり、
 * `scripts/survey-retry-exhaustion-exclusion-population.ts`（タスク 115.322）と同じ位置づけである。
 *
 * ## 何を数えるか（四つの走査を並べて印字する）
 *
 * 判定の規則は書き写さない。**検出器の抽出関数をそのまま呼ぶ**——
 * {@link buildChapterIndex} / {@link extractTraceabilityAssignments} /
 * {@link extractComponentDeclarations} を取り込み、自己申告の集合だけを差し替えて
 * {@link measureDesignDocument} と同じ手順（章 × 部品の鍵で束ね、前提を当て、和を見る）で
 * 突き合わせる。規則を複製すると、複製の側だけが検出器からずれる（タスク 115.168 の学び）。
 *
 * 1. **由来の和・前提あり**——本検査そのものと同じ判定。
 * 2. **部品表だけ・前提あり**——部品の一覧の行が単独で自足しているか。
 * 3. **詳細節の欄だけ・前提あり**——詳細節の欄が単独で自足しているか。
 * 4. **由来の和・前提なし**——`spokenByChapter`（その章が当該番号を部品別に語っていること）を
 *    外した場合。
 *
 * ## 使い方
 *
 *     npx tsx scripts/survey-design-component-declaration-origins.ts [機能名...]
 *
 * 機能名を省略すると `discoverFeatureNames()` が返す全機能を走査する。
 * 起動位置には依らない（走査根は本ファイルからの相対で解決する）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildChapterIndex,
  extractComponentDeclarations,
  extractTraceabilityAssignments,
  measureDesignDocument,
  type ComponentDeclaration,
} from './check-design-component-requirements.js';
import { SPEC_DIR, DESIGN_DOC_NAME } from './design-document.js';
import { discoverFeatureNames } from './requirement-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 章 × 部品の鍵。区切りは NUL（検出器の `groupKey` と同じ理由で、文字として現れない値を採る） */
function groupKey(chapter: string, component: string): string {
  return `${chapter}\0${component}`;
}

/** 一つの走査の結果 */
export interface OriginScan {
  readonly label: string;
  readonly declarations: number;
  readonly pairs: number;
  readonly contradictions: string[];
}

/**
 * 自己申告の集合と前提の有無を指定して突き合わせる
 *
 * @param content 設計文書の本文
 * @param select 自己申告の絞り込み（由来の分離はここだけで行う）
 * @param usePremise 前提（その章がその要件番号を部品別に語っていること）を課すか
 */
export function scanWithOrigins(
  content: string,
  select: (entry: ComponentDeclaration) => boolean,
  usePremise: boolean,
  label: string
): OriginScan {
  const lines = content.split('\n');
  const { chapterOf } = buildChapterIndex(lines);
  const assignments = extractTraceabilityAssignments(lines, chapterOf).assignments;
  const declarations = extractComponentDeclarations(lines, chapterOf).declarations.filter(select);

  const byKey = new Map<string, ComponentDeclaration[]>();
  const spoken = new Map<string, Set<string>>();
  for (const entry of declarations) {
    const key = groupKey(entry.chapter, entry.component);
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, [entry]);
    else bucket.push(entry);

    let said = spoken.get(entry.chapter);
    if (said === undefined) {
      said = new Set<string>();
      spoken.set(entry.chapter, said);
    }
    for (const requirement of entry.requirements) said.add(requirement);
  }

  const pairs = new Set<string>();
  const found = new Map<string, number[]>();
  for (const assignment of assignments) {
    const key = groupKey(assignment.chapter, assignment.component);
    const bucket = byKey.get(key);
    if (bucket === undefined) continue;
    pairs.add(key);
    if (usePremise && spoken.get(assignment.chapter)?.has(assignment.requirement) !== true)
      continue;
    if (bucket.some((entry) => entry.requirements.has(assignment.requirement))) continue;

    const id = `${assignment.chapter} | ${assignment.component} | ${assignment.requirement}`;
    const existing = found.get(id);
    if (existing === undefined) found.set(id, [assignment.line]);
    else if (!existing.includes(assignment.line)) existing.push(assignment.line);
  }

  return {
    label,
    declarations: declarations.length,
    pairs: pairs.size,
    contradictions: [...found.entries()]
      .sort((left, right) => (left[0] < right[0] ? -1 : 1))
      .map(([id, at]) => `${id}（追跡表 ${at.sort((a, b) => a - b).join(', ')} 行目）`),
  };
}

/** 一機能について四つの走査を印字する */
function reportFeature(feature: string): void {
  const designPath = path.join(ROOT, SPEC_DIR, feature, DESIGN_DOC_NAME);
  if (!fs.existsSync(designPath)) {
    console.log(`${feature}: design.md が見つかりません（${path.relative(ROOT, designPath)}）`);
    return;
  }
  const content = fs.readFileSync(designPath, 'utf8');

  // 本検査そのものの出力を並べて、走査 (1) と一致することを読み手が確かめられるようにする
  const official = measureDesignDocument(feature, content);
  console.log(
    `${feature}: 本検査の判定 contradictions=${official.contradictions.length} ` +
      `pairs=${official.pairs} tableDecls=${official.tableDeclarations} ` +
      `detailDecls=${official.detailDeclarations}`
  );

  const scans: OriginScan[] = [
    scanWithOrigins(content, () => true, true, '(1) 由来の和・前提あり（本検査と同じ判定）'),
    scanWithOrigins(content, (one) => one.origin === 'table', true, '(2) 部品表だけ・前提あり'),
    scanWithOrigins(
      content,
      (one) => one.origin === 'detail',
      true,
      '(3) 詳細節の欄だけ・前提あり'
    ),
    scanWithOrigins(content, () => true, false, '(4) 由来の和・前提なし'),
  ];
  for (const scan of scans) {
    console.log(
      `  ${scan.label}: declarations=${scan.declarations} pairs=${scan.pairs} ` +
        `contradictions=${scan.contradictions.length}`
    );
    for (const one of scan.contradictions) console.log(`    - ${one}`);
  }
}

function main(): void {
  const requested = process.argv.slice(2).filter((one) => !one.startsWith('--'));
  const features = requested.length > 0 ? requested : discoverFeatureNames(ROOT);
  if (features.length === 0) {
    console.error('機能が 1 件も見つかりません（.kiro/specs/ の走査が空振りしています）。');
    process.exit(1);
  }
  for (const feature of features) reportFeature(feature);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
