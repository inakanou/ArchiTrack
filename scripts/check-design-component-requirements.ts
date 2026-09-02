/**
 * @fileoverview 設計文書が同一部品へ矛盾する要件を割り当てていないことの検査
 *
 * ## なぜ在るか（タスク 115.247）
 *
 * タスク 115.217 のレビューが `site-survey` の `design.md` に、同じ文書の中で担い手の要件が
 * 二様に書かれている箇所を見つけた。追跡表の行は `AnnotationContextMenu` へ `28.1-28.8` を
 * 割り当てていたが、同じ章の「Component Summary」の同部品の行と詳細節の `Requirements` 欄は
 * いずれも `27.2-27.5, 27.7, 27.10` しか挙げていなかった。**どちらが正かは文書からは決まらず、
 * 読み手は二つの答えを得る。** タスク 115.246 が追跡表の側を正して決着させた。
 *
 * この食い違いは**どの機械の関門にも掛からなかった**。既存の検査はいずれも別の面を見ている。
 *
 *   - `check:trace-coverage`（タスク 115.228）は追跡表の **Requirement 列**が受入基準を
 *     網羅しているかだけを見る。同検査は「Components / Interfaces / Flows 列の中身は見ない」と
 *     自身の限界に明記している。
 *   - `check:design-refs` / `check:design-code-refs` は**参照の形式**を、
 *     `check:design-path-refs` は**パスの実在**を見る。
 *   - `check:req-coverage` は**本番コードの被覆印**を見る。
 *
 * 本検査はその空白を埋める。**追跡表の Components 列と、部品別の自己申告（部品表の
 * `Req Coverage` / `Requirements` 列、および詳細節の `| Requirements |` 欄）とを突き合わせる。**
 *
 * ## 何を全称命題として書くか
 *
 * 有限集合の上の全称命題として書ける:
 *
 *   - **有限集合**: 「章 × 部品 × 要件番号」の三つ組のうち、章の追跡表がその部品へその要件を
 *     割り当てているもの。本リポジトリの実データで 13 機能・追跡表の割り当て 1402 件・
 *     部品別の自己申告 526 件・突き合わせの母集団 219 組である（2026-09-02 にリポジトリルートで実測。
 *     `npx tsx scripts/check-design-component-requirements.ts --survey` で測り直せる）。
 *   - **述語**: 同じ章がその部品について自己申告を持ち、かつ同じ章の自己申告のいずれかが
 *     その要件番号を挙げているとき、**その部品の自己申告がその要件番号を含む**こと。
 *   - **判定**: 有限の照合であり走査は必ず終端する。
 *
 * 述語の前提に「同じ章がその要件番号を部品別に語っている」を置くのは、**章が要件を部品別に
 * 語っていない場合に矛盾を主張できない**ためである。たとえば `site-survey` の
 * `## Requirement 19` の章は部品別の表も詳細節の `Requirements` 欄も持たない。その章の
 * 追跡表が挙げる要件19 について「部品が自認していない」と言うのは、語られていないことを
 * 矛盾と呼ぶことになる。**前提を外して測ると、是正後の現況でも `site-survey` に 3 件が挙がる**
 * （`AnnotationEditor` / `PhotoManagementPanel` / `SiteSurveyDetailPage` へ割り当てられた要件23。
 * `## Requirement 23` の章は部品別の欄を一つも持たない）。いずれもこの型の空振りである
 * （2026-09-02 に、`spokenByChapter` の判定を外した写しへ実データを与えて実測）。
 *
 * ## 章という単位
 *
 * `site-survey` の `design.md` は `## Requirements 24-30: …` のように要件の群ごとの章を
 * 継ぎ足して育っている。追跡表も部品表も章ごとに在る。**突き合わせは同じ章の中で行う**——
 * 章をまたいで束ねると、後の章の部品表が前の章の追跡表の割り当てを否定する形（部品表の
 * 適用範囲が章に閉じているだけ）を矛盾と誤判定する。章の見出しを持たない設計文書は、文書全体を
 * 一つの章として扱う。章の数は `--survey` の `chapters=` が出す——`site-survey` が 13、
 * `project-management` と `quantity-table-generation` が 2、残る 10 機能が 1 である
 * （2026-09-02 にリポジトリルートで実測）。
 *
 * ## 見ないこと（限界）
 *
 *   - **逆向きは見ない**。部品の自己申告が挙げる要件を、同じ章の追跡表のどの行もその部品へ
 *     割り当てていない形（**担い手の欠落**）は本検査の対象外である。これは
 *     `.kiro/specs/site-survey/design.md` の `## 未起票の提案の台帳（タスク 115.213）` の #8 が
 *     所管し、`check-traceability-coverage.ts` も自身の限界として同じ切り分けを宣言している。
 *   - **受入基準の粒度では見ない**。突き合わせは要件の上位番号（`28.3` なら `28`）で行う。
 *     追跡表の行は複数の部品を併記した併合行であり、受入基準の粒度では「行が挙げる受入基準の
 *     どれをどの部品が担うか」は文書の書式からは決まらないためである。**115.246 が決着させた
 *     食い違いは上位番号の粒度で現れる**（`27` しか名乗らない部品へ `28` を割り当てていた）。
 *   - **追跡表が受入基準を網羅しているか**は見ない（`check:trace-coverage` の所管）。
 *   - 部品名は正規化した綴りの完全一致で突き合わせる。綴りが揃わない組は突き合わせの母集団に
 *     入らない。母集団の大きさ（`pairs`）を機能ごとに宣言し、**縮んだら赤くする**。
 *     ただし `pairs` の下限だけでは足りない——**自己申告の二つの由来（部品表 / 詳細節の
 *     `Requirements` 欄）のうち片方だけが空振りしても `pairs` は動かない**。詳細節の欄の走査を
 *     壊すと `site-survey` は自己申告が 98→61 件と減るのに `pairs` は 45 のまま動かなかった
 *     （2026-09-02 実測）。そのため**由来ごとの件数の下限**（`minTableDeclarations` /
 *     `minDetailDeclarations`）も機能ごとに宣言する。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-component-requirements.ts [--verbose] [--json] [--survey]
 *   npm run check:design-component-reqs
 *   npm run check:design-component-reqs:verbose
 *   npm run check:design-component-reqs:survey   宣言を無視して実測値だけを印字する（宣言の更新用）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { discoverFeatureNames } from './requirement-document';
import { SPEC_DIR, DESIGN_DOC_NAME } from './design-document';
import { TRACEABILITY_TABLE_HEADER } from './check-traceability-coverage';

/** 章の見出し。`## Requirement 19:` / `## Requirements 24-30:` / `## Requirements 29.4, 33-34:` */
export const CHAPTER_HEADING = /^## +Requirements? +\d/;

/** 部品表の表頭。1 列目が `Component` である表 */
export const COMPONENT_TABLE_HEADER = /^\| *(?:\*\*)?Component(?:\*\*)? *\|/;

/** 部品表のうち要件を挙げる列の見出し */
export const COMPONENT_TABLE_REQUIREMENT_COLUMNS = ['Req Coverage', 'Requirements', 'Req'];

/** 詳細節の欄の行。`| Requirements | 24.1, 24.2 |` */
export const DETAIL_REQUIREMENT_ROW = /^\| *(?:\*\*)?Requirements(?:\*\*)? *\|/;

/** 範囲を表す区切り（`check-traceability-coverage.ts` と同一） */
const RANGE_SEPARATORS = '-‐‑‒–—―〜～~';

/** `4.1-4.6` / `32.9-32.10` */
const CRITERION_RANGE = new RegExp(
  `^(\\d+[A-E]?)\\.(\\d+)\\s*[${RANGE_SEPARATORS}]\\s*(?:(\\d+[A-E]?)\\.)?(\\d+)`
);
/** `4.14` / `27A.3` */
const CRITERION_SINGLE = /^(\d+[A-E]?)\.(\d+)/;
/** `1-12` / `24-30` */
const REQUIREMENT_RANGE = new RegExp(`^(\\d+)\\s*[${RANGE_SEPARATORS}]\\s*(\\d+)(?!\\.)`);
/** `21` */
const REQUIREMENT_SINGLE = /^(\d+[A-E]?)(?!\.)/;

/** 範囲の展開を打ち切る幅（`1-12` は展開するが、桁の取り違えを黙って展開しない） */
const MAX_RANGE_WIDTH = 60;

/** 空欄・不在を表す綴り */
const EMPTY_CELL_TOKENS = new Set(['', '-', '—', '–', '−', 'ー', 'なし', 'N/A', 'n/a', 'TBD']);

/** 機能ごとの方針 */
export type FeaturePolicy =
  | {
      readonly mode: 'exact';
      /**
       * 矛盾の集合。`章の見出し | 部品名 | 要件番号` の形で、集合が完全に一致することを求める
       */
      readonly contradictions: readonly string[];
      /** 突き合わせの母集団（章 × 部品の組）の下限。縮んだら赤くする */
      readonly minPairs: number;
      /** 部品表由来の自己申告の件数の下限。縮んだら赤くする */
      readonly minTableDeclarations: number;
      /** 詳細節の `Requirements` 欄由来の自己申告の件数の下限。縮んだら赤くする */
      readonly minDetailDeclarations: number;
      readonly reason: string;
    }
  | {
      readonly mode: 'ratchet';
      readonly maxContradictions: number;
      readonly minPairs: number;
      /** 部品表由来の自己申告の件数の下限。縮んだら赤くする */
      readonly minTableDeclarations: number;
      /** 詳細節の `Requirements` 欄由来の自己申告の件数の下限。縮んだら赤くする */
      readonly minDetailDeclarations: number;
      /**
       * 部品表も詳細節の欄も持たないことを許す
       *
       * 既定（未指定）では自己申告が 0 件の機能は**前提の崩壊**として赤くする——表の書式が
       * 変わって走査が空振りした形と区別できないためである。
       */
      readonly allowNoDeclarations?: boolean;
      readonly reason: string;
    };

/**
 * 全機能の方針
 *
 * **鍵の集合は `discoverFeatureNames()` の返り値と完全に一致していなければならない。**
 * 一致しない場合（新設された機能、消えた機能）は検査が失敗する。
 *
 * 上限・下限の値は 2026-09-02 に
 * `npx tsx scripts/check-design-component-requirements.ts --survey` で実測した現況である。
 * **上限を緩める向き・下限を下げる向きの書き換えは、突き合わせが後退したことを意味する。**
 *
 * ## 緩和の経路は無防備である（未着手タスク 115.262 の所管）
 *
 * 上の一文は**読み手への申し合わせにすぎず、機構は緩和を止めない**。上限を実測値より大きい値へ
 * 書き換えても、本検査も自己検査も何も言わずに緑を出す。
 *
 * 実測（2026-09-02、リポジトリルート）: `construction-photo` の `maxContradictions` を
 * `0` から `50` へ上げると、`npm run check:design-component-reqs` は EXIT=0 で
 * 「✅ 追跡表と部品別の自己申告は宣言どおりです」を、
 * `npm run check:design-component-reqs:selftest` は EXIT=0 で「✅ 28/28 件の確認に成功しました」を
 * 出した（当時の総数。由来別の下限を足した現在は 30 件）。**どちらも赤くならない。**
 *
 * これは未着手タスク 115.262（`.kiro/specs/site-survey/tasks.md`
 * 「網羅検査のラチェット上限が先回りの緩和で無言になる状態を解消する」）が
 * `check-traceability-coverage.ts` について実測した形と同型であり、**本ファイルはその面を
 * 12 機能ぶん拡げている**。本ファイルも同タスクの対象に含まれる。
 *
 * 現時点の上限は全機能で実測値ちょうど（余裕ゼロ）であり、**いま無言で吸収されている矛盾は
 * 無い**。したがって「先回りの緩和」そのものは行われていない。塞ぐ手立て（宣言値と実測値の
 * 一致を求める、緩和に理由の更新を強いる等）の設計は 115.262 の所管であり、本タスク
 * （115.247）の境界外である。
 */
export const FEATURE_POLICIES: Readonly<Record<string, FeaturePolicy>> = {
  'company-info': {
    mode: 'ratchet',
    maxContradictions: 1,
    minPairs: 5,
    minTableDeclarations: 6,
    minDetailDeclarations: 6,
    reason:
      '本タスク（115.247）の境界は `site-survey` の是正にある。他機能で検出した矛盾は是正せず開示にとどめ、現況を上限として固定する',
  },
  'construction-photo': {
    mode: 'ratchet',
    maxContradictions: 0,
    minPairs: 12,
    minTableDeclarations: 19,
    minDetailDeclarations: 0,
    reason:
      '追跡表の Requirement 列が要件番号だけを挙げる書式だが、突き合わせは上位番号の粒度なので成立する。現況で矛盾 0 件',
  },
  'construction-schedule': {
    mode: 'ratchet',
    maxContradictions: 5,
    minPairs: 12,
    minTableDeclarations: 14,
    minDetailDeclarations: 7,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'contract-management': {
    mode: 'ratchet',
    maxContradictions: 3,
    minPairs: 11,
    minTableDeclarations: 11,
    minDetailDeclarations: 11,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'estimate-creation': {
    mode: 'ratchet',
    maxContradictions: 45,
    minPairs: 34,
    minTableDeclarations: 36,
    minDetailDeclarations: 46,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'estimate-request': {
    mode: 'ratchet',
    maxContradictions: 19,
    minPairs: 22,
    minTableDeclarations: 48,
    minDetailDeclarations: 57,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'execution-budget-management': {
    mode: 'ratchet',
    maxContradictions: 0,
    minPairs: 9,
    minTableDeclarations: 9,
    minDetailDeclarations: 9,
    reason: '現況で矛盾 0 件。ラチェットで 0 を維持する',
  },
  'itemized-statement-generation': {
    mode: 'ratchet',
    maxContradictions: 2,
    minPairs: 9,
    minTableDeclarations: 10,
    minDetailDeclarations: 11,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'project-management': {
    mode: 'ratchet',
    maxContradictions: 0,
    minPairs: 22,
    minTableDeclarations: 21,
    minDetailDeclarations: 20,
    reason: '現況で矛盾 0 件。ラチェットで 0 を維持する',
  },
  'quantity-table-generation': {
    mode: 'ratchet',
    maxContradictions: 13,
    minPairs: 24,
    minTableDeclarations: 31,
    minDetailDeclarations: 25,
    reason: '他機能の矛盾は開示にとどめ、現況を上限として固定する（本タスクの境界外）',
  },
  'site-survey': {
    mode: 'exact',
    contradictions: [],
    minPairs: 45,
    minTableDeclarations: 61,
    minDetailDeclarations: 37,
    reason:
      'タスク 115.247 の境界。115.246 が決着させた `AnnotationContextMenu` と同型の組を 6 部品・7 組で検出し、いずれも追跡表を正として自己申告へ追随させ、矛盾を 0 件にした。以後の新設も、解消済みの宣言の置き去りも、集合の不一致として赤くなる',
  },
  'trading-partner-management': {
    mode: 'ratchet',
    maxContradictions: 0,
    minPairs: 14,
    minTableDeclarations: 16,
    minDetailDeclarations: 15,
    reason: '現況で矛盾 0 件。ラチェットで 0 を維持する',
  },
  'user-authentication': {
    mode: 'ratchet',
    maxContradictions: 0,
    minPairs: 0,
    minTableDeclarations: 0,
    minDetailDeclarations: 0,
    allowNoDeclarations: true,
    reason:
      '`design.md` は在るが追跡表も部品表も一つも持たない（`check:trace-coverage` の宣言と同じ事実）。表の新設は本機能の別タスクを要する',
  },
};

/** 追跡表が与えた割り当て */
export interface TraceabilityAssignment {
  readonly chapter: string;
  readonly component: string;
  readonly requirement: string;
  readonly line: number;
}

/** 部品別の自己申告 */
export interface ComponentDeclaration {
  readonly chapter: string;
  readonly component: string;
  readonly requirements: ReadonlySet<string>;
  readonly line: number;
  readonly origin: 'table' | 'detail';
}

/** 要件番号の取り出しの結果 */
export interface RequirementNumbers {
  readonly numbers: Set<string>;
  /** 要件番号を一つも取り出せなかったトークン */
  readonly unparsed: string[];
  /** 要件番号のあとに散文が続くトークン（番号は採るが、採り漏らしを見えるようにする） */
  readonly partial: string[];
}

/**
 * 表の欄から要件の上位番号を取り出す
 *
 * 強調記号・バッククォート・取り消し線は装飾として落とす。`,` `、` で区切った各トークンを
 * 受入基準・範囲・要件番号として読む。**どちらでもないトークンは黙って捨てず数える**
 * （`check-traceability-coverage.ts` の作法）。
 */
export function extractRequirementNumbers(cell: string): RequirementNumbers {
  const numbers = new Set<string>();
  const unparsed: string[] = [];
  const partial: string[] = [];
  const normalized = cell.replace(/\*\*/g, '').replace(/~~/g, '').replace(/`/g, '');
  for (const rawToken of normalized.split(/[,、]/)) {
    const token = rawToken.trim();
    if (EMPTY_CELL_TOKENS.has(token)) continue;

    let consumed = 0;
    const criterionRange = CRITERION_RANGE.exec(token);
    const criterionSingle = CRITERION_SINGLE.exec(token);
    const requirementRange = REQUIREMENT_RANGE.exec(token);
    const requirementSingle = REQUIREMENT_SINGLE.exec(token);

    if (criterionRange?.[1] !== undefined) {
      numbers.add(criterionRange[1]);
      if (criterionRange[3] !== undefined) numbers.add(criterionRange[3]);
      consumed = criterionRange[0].length;
    } else if (criterionSingle?.[1] !== undefined) {
      numbers.add(criterionSingle[1]);
      consumed = criterionSingle[0].length;
    } else if (requirementRange?.[1] !== undefined && requirementRange[2] !== undefined) {
      const from = Number.parseInt(requirementRange[1], 10);
      const to = Number.parseInt(requirementRange[2], 10);
      if (to < from || to - from > MAX_RANGE_WIDTH) {
        unparsed.push(token);
        continue;
      }
      for (let number = from; number <= to; number++) numbers.add(String(number));
      consumed = requirementRange[0].length;
    } else if (requirementSingle?.[1] !== undefined) {
      numbers.add(requirementSingle[1]);
      consumed = requirementSingle[0].length;
    } else {
      unparsed.push(token);
      continue;
    }

    if (token.slice(consumed).trim() !== '') partial.push(token);
  }
  return { numbers, unparsed, partial };
}

/**
 * 部品名を正規化する
 *
 * 強調記号・バッククォートを落とし、丸括弧（半角・全角）で囲まれた注記を取り除く。
 * 取り消し線で潰された名前（`~~ImageViewer~~`）は撤去済みの記録であり、`null` を返して
 * 母集団から外す。
 */
export function normalizeComponentName(raw: string): string | null {
  const trimmed = raw.trim();
  if (/~~/.test(trimmed)) return null;
  let name = trimmed.replace(/\*\*/g, '').replace(/`/g, '');
  // 丸括弧の注記を落とす（入れ子は想定しない。設計文書の実データに入れ子は無い）
  name = name.replace(/[（(][^）)]*[）)]/g, '');
  name = name.trim();
  if (EMPTY_CELL_TOKENS.has(name)) return null;
  return name;
}

/**
 * Components 列を部品名へ分ける
 *
 * 括弧の内側の読点で切らない——`AnnotationToolbar（要件24.5 の切替UI。…ではなく、本部品が…）`
 * のように注記が読点を含むためである。
 */
export function splitComponentCell(cell: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of cell) {
    if (character === '(' || character === '（') depth += 1;
    else if (character === ')' || character === '）') depth = Math.max(0, depth - 1);
    if ((character === ',' || character === '、' || character === '／') && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  const names: string[] = [];
  for (const part of parts) {
    const name = normalizeComponentName(part);
    if (name !== null) names.push(name);
  }
  return names;
}

/** 章の見出しを行番号から引く索引を作る */
export function buildChapterIndex(lines: readonly string[]): {
  chapterOf: (lineNumber: number) => string;
  chapters: string[];
} {
  const boundaries: { line: number; title: string }[] = [
    { line: 1, title: '（章の見出しより前）' },
  ];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !CHAPTER_HEADING.test(line)) continue;
    boundaries.push({ line: index + 1, title: line.replace(/^#+ */, '').trim() });
  }
  return {
    chapters: boundaries.map((boundary) => boundary.title),
    chapterOf: (lineNumber: number): string => {
      let title = boundaries[0]?.title ?? '';
      for (const boundary of boundaries) {
        if (boundary.line <= lineNumber) title = boundary.title;
      }
      return title;
    },
  };
}

/** 表の本文行を読む（表頭の 2 行下から、`|` で始まらない行の直前まで） */
function tableBodyLines(
  lines: readonly string[],
  headerIndex: number
): { line: string; index: number }[] {
  const body: { line: string; index: number }[] = [];
  for (let cursor = headerIndex + 2; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (line === undefined || !line.startsWith('|')) break;
    body.push({ line, index: cursor });
  }
  return body;
}

/** 追跡表の割り当てを取り出す */
export function extractTraceabilityAssignments(
  lines: readonly string[],
  chapterOf: (lineNumber: number) => string
): {
  assignments: TraceabilityAssignment[];
  unparsed: string[];
  partial: string[];
  tables: number;
} {
  const assignments: TraceabilityAssignment[] = [];
  const unparsed: string[] = [];
  const partial: string[] = [];
  let tables = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !TRACEABILITY_TABLE_HEADER.test(line)) continue;
    tables += 1;
    for (const body of tableBodyLines(lines, index)) {
      const columns = body.line.split('|');
      const extracted = extractRequirementNumbers(columns[1] ?? '');
      unparsed.push(...extracted.unparsed);
      partial.push(...extracted.partial);
      const chapter = chapterOf(body.index + 1);
      for (const component of splitComponentCell(columns[3] ?? '')) {
        for (const requirement of extracted.numbers) {
          assignments.push({ chapter, component, requirement, line: body.index + 1 });
        }
      }
    }
  }
  return { assignments, unparsed, partial, tables };
}

/** 部品別の自己申告を取り出す */
export function extractComponentDeclarations(
  lines: readonly string[],
  chapterOf: (lineNumber: number) => string
): { declarations: ComponentDeclaration[]; unparsed: string[]; partial: string[]; tables: number } {
  const declarations: ComponentDeclaration[] = [];
  const unparsed: string[] = [];
  const partial: string[] = [];
  let tables = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;

    if (COMPONENT_TABLE_HEADER.test(line)) {
      const headings = line.split('|').map((cell) => cell.replace(/\*\*/g, '').trim());
      const requirementColumn = headings.findIndex((heading) =>
        COMPONENT_TABLE_REQUIREMENT_COLUMNS.includes(heading)
      );
      if (requirementColumn < 0) continue;
      tables += 1;
      for (const body of tableBodyLines(lines, index)) {
        const columns = body.line.split('|');
        const component = normalizeComponentName(columns[1] ?? '');
        if (component === null) continue;
        const extracted = extractRequirementNumbers(columns[requirementColumn] ?? '');
        unparsed.push(...extracted.unparsed);
        partial.push(...extracted.partial);
        declarations.push({
          chapter: chapterOf(body.index + 1),
          component,
          requirements: extracted.numbers,
          line: body.index + 1,
          origin: 'table',
        });
      }
      continue;
    }

    if (DETAIL_REQUIREMENT_ROW.test(line)) {
      let heading = '';
      for (let cursor = index - 1; cursor >= 0; cursor--) {
        const candidate = lines[cursor];
        if (candidate === undefined) continue;
        const matched = /^#{3,6} +(.*)$/.exec(candidate);
        if (matched?.[1] !== undefined) {
          heading = matched[1];
          break;
        }
      }
      const component = normalizeComponentName(heading);
      if (component === null) continue;
      const extracted = extractRequirementNumbers(line.split('|')[2] ?? '');
      unparsed.push(...extracted.unparsed);
      partial.push(...extracted.partial);
      declarations.push({
        chapter: chapterOf(index + 1),
        component,
        requirements: extracted.numbers,
        line: index + 1,
        origin: 'detail',
      });
    }
  }
  return { declarations, unparsed, partial, tables };
}

/** 矛盾の一件 */
export interface Contradiction {
  /** `章 | 部品 | 要件番号` */
  readonly id: string;
  readonly chapter: string;
  readonly component: string;
  readonly requirement: string;
  /** 追跡表の側の行番号（昇順） */
  readonly traceabilityLines: number[];
  /** 自己申告の側の行番号（昇順） */
  readonly declarationLines: number[];
}

/** 一機能の実測 */
export interface FeatureMeasurement {
  readonly feature: string;
  readonly hasDesignDocument: boolean;
  readonly chapters: number;
  readonly traceabilityTables: number;
  readonly componentTables: number;
  readonly assignments: number;
  readonly declarations: number;
  /** 部品表（`Component` 表）由来の自己申告の件数 */
  readonly tableDeclarations: number;
  /** 詳細節の `| Requirements |` 欄由来の自己申告の件数 */
  readonly detailDeclarations: number;
  /** 追跡表と自己申告の双方を持つ「章 × 部品」の組。突き合わせの母集団 */
  readonly pairs: number;
  readonly contradictions: Contradiction[];
  readonly unparsed: string[];
  readonly partial: string[];
}

/**
 * 章 × 部品の鍵
 *
 * 区切りに NUL（`\0`）を用いるのは、章の見出しにも部品名にも空白や `|` が現れうるため、
 * 文字として現れない値でなければ鍵が衝突しうるからである。**エスケープ表記で書くこと**——
 * 生のバイトで書くと `file` がこのファイルを `data` と判定し、`grep -rn` が行を出さなくなる
 * （関門スクリプトが検索から不可視になる）。
 */
function groupKey(chapter: string, component: string): string {
  return `${chapter}\0${component}`;
}

/** 設計文書の本文から矛盾を測る */
export function measureDesignDocument(feature: string, content: string): FeatureMeasurement {
  const lines = content.split('\n');
  const { chapterOf, chapters } = buildChapterIndex(lines);
  const traceability = extractTraceabilityAssignments(lines, chapterOf);
  const declaration = extractComponentDeclarations(lines, chapterOf);

  /** 章 × 部品 → 自己申告 */
  const declarationsByKey = new Map<string, ComponentDeclaration[]>();
  for (const entry of declaration.declarations) {
    const key = groupKey(entry.chapter, entry.component);
    const bucket = declarationsByKey.get(key);
    if (bucket === undefined) declarationsByKey.set(key, [entry]);
    else bucket.push(entry);
  }

  /** 章 → その章の自己申告が語る要件番号（前提の集合） */
  const spokenByChapter = new Map<string, Set<string>>();
  for (const entry of declaration.declarations) {
    let spoken = spokenByChapter.get(entry.chapter);
    if (spoken === undefined) {
      spoken = new Set<string>();
      spokenByChapter.set(entry.chapter, spoken);
    }
    for (const requirement of entry.requirements) spoken.add(requirement);
  }

  const pairKeys = new Set<string>();
  const found = new Map<string, Contradiction>();
  for (const assignment of traceability.assignments) {
    const key = groupKey(assignment.chapter, assignment.component);
    const declarations = declarationsByKey.get(key);
    if (declarations === undefined) continue;
    pairKeys.add(key);

    // 前提: 同じ章が、この要件番号を部品別に語っていること
    if (spokenByChapter.get(assignment.chapter)?.has(assignment.requirement) !== true) continue;

    if (declarations.some((entry) => entry.requirements.has(assignment.requirement))) continue;

    const id = `${assignment.chapter} | ${assignment.component} | ${assignment.requirement}`;
    const existing = found.get(id);
    if (existing === undefined) {
      found.set(id, {
        id,
        chapter: assignment.chapter,
        component: assignment.component,
        requirement: assignment.requirement,
        traceabilityLines: [assignment.line],
        declarationLines: declarations.map((entry) => entry.line).sort((a, b) => a - b),
      });
    } else if (!existing.traceabilityLines.includes(assignment.line)) {
      existing.traceabilityLines.push(assignment.line);
      existing.traceabilityLines.sort((a, b) => a - b);
    }
  }

  return {
    feature,
    hasDesignDocument: true,
    chapters: chapters.length,
    traceabilityTables: traceability.tables,
    componentTables: declaration.tables,
    assignments: traceability.assignments.length,
    declarations: declaration.declarations.length,
    tableDeclarations: declaration.declarations.filter((one) => one.origin === 'table').length,
    detailDeclarations: declaration.declarations.filter((one) => one.origin === 'detail').length,
    pairs: pairKeys.size,
    contradictions: [...found.values()].sort((left, right) => (left.id < right.id ? -1 : 1)),
    unparsed: [...traceability.unparsed, ...declaration.unparsed],
    partial: [...traceability.partial, ...declaration.partial],
  };
}

/** 一機能を実測する */
export function measureFeature(rootDir: string, feature: string): FeatureMeasurement {
  const designPath = path.join(rootDir, SPEC_DIR, feature, DESIGN_DOC_NAME);
  if (!fs.existsSync(designPath)) {
    return {
      feature,
      hasDesignDocument: false,
      chapters: 0,
      traceabilityTables: 0,
      componentTables: 0,
      assignments: 0,
      declarations: 0,
      tableDeclarations: 0,
      detailDeclarations: 0,
      pairs: 0,
      contradictions: [],
      unparsed: [],
      partial: [],
    };
  }
  return measureDesignDocument(feature, fs.readFileSync(designPath, 'utf8'));
}

/** 判定の結果 */
export interface Judgement {
  readonly failures: string[];
  readonly measurements: FeatureMeasurement[];
}

function judgeFeature(measurement: FeatureMeasurement, policy: FeaturePolicy): string[] {
  const failures: string[] = [];
  const label = measurement.feature;
  const noDeclarationsAllowed = policy.mode === 'ratchet' && policy.allowNoDeclarations === true;

  // 母集団が空なら前提の崩壊として赤くする（AI運用7原則 第3原則）
  if (measurement.declarations === 0 && !noDeclarationsAllowed) {
    failures.push(
      `${label}: 部品別の自己申告が 0 件です（部品表・詳細節の欄の書式が変わって走査が空振りした疑いがあります）。` +
        '表が未整備であることが判っている機能なら FEATURE_POLICIES で allowNoDeclarations を宣言してください。'
    );
  }
  if (measurement.declarations > 0 && noDeclarationsAllowed) {
    failures.push(
      `${label}: allowNoDeclarations を宣言していますが部品別の自己申告が ${measurement.declarations} 件あります。宣言を外してください。`
    );
  }
  if (measurement.pairs < policy.minPairs) {
    failures.push(
      `${label}: 突き合わせの母集団（章 × 部品）が ${measurement.pairs} 組しかありません` +
        `（宣言の下限は ${policy.minPairs} 組）。部品名の綴りが揃わなくなった疑いがあります。` +
        'この状態で「矛盾は無い」と読んではなりません。'
    );
  }

  // 由来ごとの下限。片方の走査だけが空振りしても `pairs` は動かないため、`pairs` の下限では
  // 捕まえられない（詳細節の欄の走査を壊すと `site-survey` は declarations 98→61 と減るのに
  // pairs は 45 のまま動かない。2026-09-02 に実測）。
  if (measurement.tableDeclarations < policy.minTableDeclarations) {
    failures.push(
      `${label}: 部品表由来の自己申告が ${measurement.tableDeclarations} 件しかありません` +
        `（宣言の下限は ${policy.minTableDeclarations} 件）。部品表の表頭の書式が変わって` +
        '走査が空振りした疑いがあります。'
    );
  }
  if (measurement.detailDeclarations < policy.minDetailDeclarations) {
    failures.push(
      `${label}: 詳細節の Requirements 欄由来の自己申告が ${measurement.detailDeclarations} 件しか` +
        `ありません（宣言の下限は ${policy.minDetailDeclarations} 件）。詳細節の欄の書式が変わって` +
        '走査が空振りした疑いがあります。'
    );
  }

  if (policy.mode === 'exact') {
    const declared = new Set(policy.contradictions);
    const actual = new Set(measurement.contradictions.map((entry) => entry.id));
    const added = measurement.contradictions.filter((entry) => !declared.has(entry.id));
    const stale = policy.contradictions.filter((id) => !actual.has(id));
    if (added.length > 0) {
      failures.push(
        `${label}: 追跡表が割り当てた要件を部品が自認していない組が宣言より増えています:\n` +
          added
            .map(
              (entry) =>
                `       ${entry.id}（追跡表 ${entry.traceabilityLines.join(', ')} 行目 / ` +
                `自己申告 ${entry.declarationLines.join(', ')} 行目）`
            )
            .join('\n')
      );
    }
    if (stale.length > 0) {
      failures.push(
        `${label}: 解消済みの矛盾が宣言に残っています（宣言から削ってください）: ${stale.join(' / ')}`
      );
    }
    return failures;
  }

  if (measurement.contradictions.length > policy.maxContradictions) {
    failures.push(
      `${label}: 追跡表が割り当てた要件を部品が自認していない組が ${measurement.contradictions.length} 件あります` +
        `（宣言の上限は ${policy.maxContradictions} 件）:\n` +
        measurement.contradictions
          .map(
            (entry) =>
              `       ${entry.id}（追跡表 ${entry.traceabilityLines.join(', ')} 行目 / ` +
              `自己申告 ${entry.declarationLines.join(', ')} 行目）`
          )
          .join('\n')
    );
  }
  return failures;
}

/**
 * 全機能を判定する
 *
 * @param rootDir リポジトリ根
 * @param policies 方針の宣言。既定は `FEATURE_POLICIES`
 * @param features 機能名。既定は `discoverFeatureNames(rootDir)`
 */
export function judge(
  rootDir: string,
  policies: Readonly<Record<string, FeaturePolicy>> = FEATURE_POLICIES,
  features: readonly string[] = discoverFeatureNames(rootDir)
): Judgement {
  const failures: string[] = [];
  const measurements: FeatureMeasurement[] = [];

  // 母集団が空なら前提の崩壊として赤くする（AI運用7原則 第3原則）
  if (features.length === 0) {
    failures.push(
      '機能が 1 件も見つかりません（.kiro/specs/ の走査が空振りしています）。' +
        'この状態で「矛盾は無い」と読んではなりません。'
    );
  }
  if (Object.keys(policies).length === 0) {
    failures.push('方針の宣言が空です（FEATURE_POLICIES が失われています）。');
  }

  // 宣言と実在の双方向の一致を求める（片方向だと、機能の新設で黙って検査の外へ落ちる）
  const declared = new Set(Object.keys(policies));
  const discovered = new Set(features);
  for (const feature of features) {
    if (!declared.has(feature)) {
      failures.push(
        `機能 ${feature} が FEATURE_POLICIES に宣言されていません。` +
          '突き合わせの方針（exact / ratchet）を宣言してください。'
      );
    }
  }
  for (const feature of declared) {
    if (!discovered.has(feature)) {
      failures.push(
        `FEATURE_POLICIES が宣言する機能 ${feature} が .kiro/specs/ に実在しません。` +
          '宣言が対象より長生きしています。'
      );
    }
  }

  for (const feature of features) {
    const policy = policies[feature];
    if (policy === undefined) continue; // 上で失敗として計上済み
    const measurement = measureFeature(rootDir, feature);
    measurements.push(measurement);
    if (!measurement.hasDesignDocument) {
      failures.push(`${feature}: design.md が存在しません。`);
      continue;
    }
    failures.push(...judgeFeature(measurement, policy));
  }

  return { failures, measurements };
}

function reportSurvey(measurements: readonly FeatureMeasurement[]): void {
  for (const measurement of measurements) {
    console.log(
      `${measurement.feature}: chapters=${measurement.chapters} ` +
        `traceTables=${measurement.traceabilityTables} componentTables=${measurement.componentTables} ` +
        `assignments=${measurement.assignments} declarations=${measurement.declarations} ` +
        `tableDecls=${measurement.tableDeclarations} detailDecls=${measurement.detailDeclarations} ` +
        `pairs=${measurement.pairs} contradictions=${measurement.contradictions.length} ` +
        `unparsed=${measurement.unparsed.length} partial=${measurement.partial.length}`
    );
    for (const contradiction of measurement.contradictions) {
      console.log(
        `  contradiction: ${contradiction.id}` +
          `（追跡表 ${contradiction.traceabilityLines.join(', ')} 行目 / ` +
          `自己申告 ${contradiction.declarationLines.join(', ')} 行目）`
      );
    }
    if (measurement.unparsed.length > 0) {
      console.log(`  unparsed: ${[...new Set(measurement.unparsed)].join(' / ')}`);
    }
    if (measurement.partial.length > 0) {
      console.log(`  partial: ${[...new Set(measurement.partial)].join(' / ')}`);
    }
  }
}

export function execute(argv: readonly string[], rootDir = process.cwd()): number {
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');
  const survey = argv.includes('--survey');

  if (survey) {
    const features = discoverFeatureNames(rootDir);
    reportSurvey(features.map((feature) => measureFeature(rootDir, feature)));
    return 0;
  }

  const { failures, measurements } = judge(rootDir);

  const totals = measurements.reduce(
    (accumulator, measurement) => ({
      assignments: accumulator.assignments + measurement.assignments,
      declarations: accumulator.declarations + measurement.declarations,
      pairs: accumulator.pairs + measurement.pairs,
      contradictions: accumulator.contradictions + measurement.contradictions.length,
    }),
    { assignments: 0, declarations: 0, pairs: 0, contradictions: 0 }
  );

  if (json) {
    console.log(JSON.stringify({ failures, totals, measurements }, null, 2));
    return failures.length > 0 ? 1 : 0;
  }

  console.log(
    '🔍 追跡表と部品別の自己申告の食い違いを検査しています (scripts/check-design-component-requirements.ts)'
  );
  console.log(
    `   機能 ${measurements.length} 件 / 追跡表の割り当て ${totals.assignments} 件 / ` +
      `部品別の自己申告 ${totals.declarations} 件`
  );
  console.log(
    `   突き合わせの母集団 ${totals.pairs} 組 / 矛盾 ${totals.contradictions} 件` +
      '（いずれも宣言との比較で判定します）'
  );

  if (verbose) {
    console.log('');
    reportSurvey(measurements);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('❌ 設計文書が同一部品へ矛盾する要件を割り当てています:');
    for (const failure of failures) console.error(`   - ${failure}`);
    console.error('');
    console.error('対応方法:');
    console.error('  1. どちらが正かを決める（要件定義書の条文へ当たること）');
    console.error(
      '  2. 追跡表が正なら、部品表の Req Coverage 欄と詳細節の Requirements 欄へ番号を足す'
    );
    console.error('  3. 部品別の自己申告が正なら、追跡表の Components 列から当該部品を外し、');
    console.error('     再び割り当て直さないための注記を添える（タスク 115.246 の先例）');
    console.error('  4. 是正できない事情があるなら、FEATURE_POLICIES へ理由と併せて宣言する');
    console.error('');
    console.error('詳細確認: npm run check:design-component-reqs:verbose');
    return 1;
  }

  console.log('✅ 追跡表と部品別の自己申告は宣言どおりです');
  return 0;
}

function main(): void {
  const exitCode = execute(process.argv.slice(2));
  if (exitCode !== 0) process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
