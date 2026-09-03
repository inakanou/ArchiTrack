/**
 * @fileoverview 設計文書の追跡表（Requirements Traceability）が受入基準を漏らしていないことの検査
 *
 * ## なぜ在るか（タスク 115.228）
 *
 * タスク 115.208 は `site-survey` の要件4 へ受入基準14 を新設したが、`design.md` の総合追跡表の
 * 該当行は `| 4.1-4.6, 4.9 |` のままで **4.14 を含まなかった**。この漏れは**どの機械の関門にも
 * 掛からなかった**——`check:design-refs` は参照の形式だけを、`check:design-code-refs` は本番コード
 * への参照の形式だけを、`check:design-path-refs` はパスの実在だけを見る。追跡表が受入基準を
 * 網羅しているかを見る検査はリポジトリに存在しなかった。
 *
 * 115.228 はこの穴を、**有限集合上の全称命題**として書けるかという問いに変換した。書ける:
 *
 *   - **有限集合**: 各機能の `requirements.md` が挙げる**現役の**受入基準（取り消し線で撤廃された
 *     ものは分母外。判定は `scripts/requirement-document.ts` の `scanRequirementsDocument` が持つ）。
 *     本リポジトリの実データで 13 機能・2889 件である（2026-09-01 に実測）。
 *   - **述語**: その受入基準の番号が、同じ機能の `design.md` の追跡表いずれかの Requirement 列に
 *     （範囲・列挙を展開したうえで）現れること。追跡表の本文行は実データで 860 行である。
 *   - **判定**: 2889 × 860 の有限の照合であり、走査は必ず終端する。「漏れが無いことを走査で示せ」
 *     という終端しない受入条件（タスク 115.197 が禁じた形）ではなく、**全称命題の成否**を返す。
 *
 * 述語は今日**成立していない**。`npm run check:trace-coverage` の要約行が出す実測は
 * 「機能 13 件 / 追跡表の本文行 860 行 / 現役の受入基準 2889 件 / 欠落 617 件 / 死語 54 件 /
 * 読めない表記 25 件」である（2026-09-04 にリポジトリルートで実測。タスク 115.261 が `site-survey`
 * の欠落 24 件と死語 1 件を是正したぶん、115.228 当時の 641 件 / 55 件から減っている）。欠落 617 件の内訳の大きい二つは
 * `user-authentication`（追跡表を一つも持たないため 388 件全件）と `construction-photo`
 * （Requirement 列が受入基準ではなく要件番号だけを挙げるため 145 件全件）である。したがって本検査は
 * **「0 件であること」ではなく「宣言した状態から悪化していないこと」**を求める（ラチェット）。
 *
 * 件数は本コメント自身が動かす値ではないが、宣言を書き換えたら
 * `npx tsx scripts/check-traceability-coverage.ts --survey` で測り直すこと
 * （`.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」）。
 *
 * ## 二方向を見る
 *
 *   - **欠落**: 現役の受入基準が追跡表のどの行にも現れない。115.228 が是正した 4.14 の型。
 *   - **死語**: 追跡表が挙げる番号が現役の受入基準に無い（撤廃済み、または存在しない番号）。
 *     欠落だけを見ると、要件が撤廃されたのに追跡表が古い番号を挙げ続ける形を取り逃がす。
 *   - **読めない表記**: Requirement 列のトークンが `N.M` にも範囲にも解釈できない
 *     （`17.x` のような伏せ字、`4.1a` のような枝つき番号、`1.3.1` のような三段の番号）。
 *     **黙って読み飛ばすと欠落が過小に出る**ため、件数を数えて宣言と突き合わせる。
 *
 * ## 機能ごとの方針を宣言で持つ（AI運用7原則 第3原則）
 *
 * `FEATURE_POLICIES` が全機能の方針を宣言する。**宣言に無い機能があれば失敗する**——
 * 機能が増えたときに黙って検査の外へ落ちることを防ぐ（タスク 115.226 の「新たな無言の失敗経路」）。
 * 逆に**宣言にあって実在しない機能があっても失敗する**（宣言が対象より長生きすることを防ぐ。
 * タスク 115.227 の被検体の同一性の作法）。
 *
 *   - `mode: 'exact'`: 欠落・死語の集合が宣言と**完全に一致**することを求める。新たな漏れも、
 *     解消済みの宣言の置き去りも、どちらも赤くなる。`site-survey` がこの型である。
 *   - `mode: 'ratchet'`: 欠落・死語・読めない表記の件数が宣言した上限を超えないことを求める。
 *     追跡表の内容そのものを書き起こす作業が別タスクを要する機能に用いる。
 *
 * **母集団が空なら失敗する**（第3原則）。機能が 0 件のとき、宣言された機能の追跡表の本文行が
 * 0 行のとき、現役の受入基準が 0 件のときは、いずれも前提の崩壊として赤くする。
 *
 * 使用方法:
 *   npx tsx scripts/check-traceability-coverage.ts [--verbose] [--json] [--survey]
 *   npm run check:trace-coverage
 *   npm run check:trace-coverage:verbose
 *   npm run check:trace-coverage:survey    宣言を無視して実測値だけを印字する（宣言の更新用）
 *
 * ## 見ないこと（限界）
 *
 *   - Components / Interfaces / Flows 列の中身は見ない。**担い手の欠落は本検査の対象外**である
 *     （`site-survey` の要件4.10 の行が `ImageOrderService` / `ImageListService` を欠く件は
 *     `design.md` の `## 未起票の提案の台帳（タスク 115.213）` の #8 が所管する）。
 *   - 受入基準が**正しい行**に載っているかは見ない。番号がどこかの行に現れれば述語は真になる。
 *   - `requirements.md` を持たないディレクトリは機能として数えない
 *     （`scripts/requirement-document.ts` の `discoverFeatureNames` の規則）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  discoverFeatureNames,
  requirementsDocumentPath,
  scanRequirementsDocument,
} from './requirement-document';

/** 追跡表の表頭。Requirement / Summary / Components の三列で始まる行を表頭とみなす */
export const TRACEABILITY_TABLE_HEADER = /^\| *Requirement \| *Summary \| *Components \|/;

/** 設計文書のファイル名 */
export const DESIGN_DOCUMENT_BASENAME = 'design.md';

/** 範囲を表す区切り（半角ハイフン・各種ダッシュ・全角波ダッシュ・半角チルダ） */
const RANGE_SEPARATORS = '-‐‑‒–—―〜～~';

/** `4.1-4.6` / `32.9-32.10` / `10.3〜10.6` */
const RANGE_TOKEN = new RegExp(
  `^(\\d+[A-E]?)\\.(\\d+)\\s*[${RANGE_SEPARATORS}]\\s*(?:(\\d+[A-E]?)\\.)?(\\d+)$`
);
/** `4.14` / `27A.3` */
const SINGLE_TOKEN = /^(\d+[A-E]?)\.(\d+)$/;

/** 機能ごとの方針 */
export type FeaturePolicy =
  | {
      readonly mode: 'exact';
      /** 追跡表に現れない現役の受入基準。集合が完全に一致することを求める */
      readonly missing: readonly string[];
      /** 追跡表が挙げるが現役でない番号。集合が完全に一致することを求める */
      readonly orphans: readonly string[];
      /** 読めない表記の許容件数（`exact` では 0 を既定とする） */
      readonly maxUnparsed: number;
      /** なぜこの宣言でよいのか */
      readonly reason: string;
    }
  | {
      readonly mode: 'ratchet';
      readonly maxMissing: number;
      readonly maxOrphans: number;
      readonly maxUnparsed: number;
      /**
       * 追跡表を一つも持たないことを許す
       *
       * 既定（未指定）では本文行が 0 行の機能は**前提の崩壊**として赤くする——表頭の書式が
       * 変わって走査が空振りした形と区別できないためである。表そのものが未整備であることが
       * 判っている機能だけ、ここで明示的に許す。
       */
      readonly allowNoTraceabilityTable?: boolean;
      readonly reason: string;
    };

/**
 * 全機能の方針
 *
 * **鍵の集合は `discoverFeatureNames()` の返り値と完全に一致していなければならない。**
 * 一致しない場合（新設された機能、消えた機能）は検査が失敗する。
 *
 * 上限の値は 2026-09-01 に `npx tsx scripts/check-traceability-coverage.ts --survey` で実測した
 * 現況である（`site-survey` の宣言だけは 2026-09-04 のタスク 115.261 が空集合へ縮めた）。
 * **上限を緩める向きの書き換えは、追跡表の網羅が後退したことを意味する。**
 */
export const FEATURE_POLICIES: Readonly<Record<string, FeaturePolicy>> = {
  'company-info': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '現況で欠落・死語ともに 0 件。ラチェットで 0 を維持する',
  },
  'construction-photo': {
    mode: 'ratchet',
    maxMissing: 145,
    maxOrphans: 0,
    maxUnparsed: 20,
    reason:
      'Requirement 列が受入基準ではなく要件番号（`1` `2` …）だけを挙げるため、受入基準は 1 件も対応が取れない。表記を受入基準の粒度へ改める作業は本機能の別タスクを要する',
  },
  'construction-schedule': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '現況で欠落・死語ともに 0 件。ラチェットで 0 を維持する',
  },
  'contract-management': {
    mode: 'ratchet',
    maxMissing: 6,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '追跡表に行を持たない受入基準が残る。行の起こしは本機能の別タスクを要する',
  },
  'estimate-creation': {
    mode: 'ratchet',
    maxMissing: 7,
    maxOrphans: 24,
    maxUnparsed: 2,
    reason:
      'Requirement 列に `17.x` `31.x` のような伏せ字の表記が残り、指す受入基準を機械で確定できない。死語 24 件は撤廃済み・番号の付け替え済みの要件を追跡表が挙げ続けている形であり、整理は本機能の別タスクを要する',
  },
  'estimate-request': {
    mode: 'ratchet',
    maxMissing: 10,
    maxOrphans: 7,
    maxUnparsed: 0,
    reason:
      '追跡表に行を持たない受入基準と、現役でない番号を挙げる行が残る。是正は本機能の別タスクを要する',
  },
  'execution-budget-management': {
    mode: 'ratchet',
    maxMissing: 2,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '追跡表に行を持たない受入基準が残る。行の起こしは本機能の別タスクを要する',
  },
  'itemized-statement-generation': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 12,
    maxUnparsed: 0,
    reason: '欠落は 0 件。現役でない番号を挙げる行が 12 件残り、整理は本機能の別タスクを要する',
  },
  'project-management': {
    mode: 'ratchet',
    maxMissing: 47,
    maxOrphans: 2,
    maxUnparsed: 2,
    reason:
      '追跡表に行を持たない受入基準が残る。Requirement 列の `4.1a` `4.1b` は枝つき番号であり、要件定義書の側で分母外の表記である',
  },
  'quantity-table-generation': {
    mode: 'ratchet',
    maxMissing: 11,
    maxOrphans: 7,
    maxUnparsed: 0,
    reason:
      '追跡表に行を持たない受入基準と、現役でない番号を挙げる行が残る。是正は本機能の別タスクを要する',
  },
  'site-survey': {
    mode: 'exact',
    // タスク 115.261 が、115.228 の残した 24 件の欠落と 1 件の死語をすべて是正した。
    // 内訳は、要件1 の併合行への `1.7` の吸収（担い手 `SiteSurveyService` / `SurveyRoutes` は
    // 既に同行に在る。4.14 と同型）、要件11.9 の独立行の新設（担い手 `PdfExportService` は
    // 併合行のどの部品とも異なる。4.7・4.8 と同型）、要件17（1 行）と要件19（3 行）の新設、
    // および移管済みの `**2.1**` の行の撤去（移管済みの受入基準は追跡表に行が無いことが正しい。
    // 本書 `### 部品の自己申告と追跡表の突き合わせ（タスク 115.113）` の要件2.2 の前例）である。
    // **集合が空であることを宣言する**——以後に漏れが生じれば新たな欠落・死語として赤くなる。
    missing: [],
    orphans: [],
    maxUnparsed: 0,
    reason:
      'タスク 115.261 が 115.228 の送った 24 件の欠落と 1 件の死語をすべて是正した。現況で欠落・死語ともに 0 件であり、exact の空集合として固定する',
  },
  'trading-partner-management': {
    mode: 'ratchet',
    maxMissing: 1,
    maxOrphans: 2,
    maxUnparsed: 1,
    reason: 'Requirement 列に `1.3.1` という三段の番号が残り、指す受入基準を機械で確定できない',
  },
  'user-authentication': {
    mode: 'ratchet',
    maxMissing: 388,
    maxOrphans: 0,
    maxUnparsed: 0,
    allowNoTraceabilityTable: true,
    reason:
      '`design.md` は在るが Requirements Traceability 表を一つも持たない。表の新設は本機能の別タスクを要する',
  },
};

/** 一機能の実測 */
export interface FeatureMeasurement {
  readonly feature: string;
  /** `design.md` の有無 */
  readonly hasDesignDocument: boolean;
  /** 追跡表の数 */
  readonly tables: number;
  /** 追跡表の本文行の数 */
  readonly rows: number;
  /** 現役の受入基準の数 */
  readonly criteria: number;
  /** 追跡表に現れない現役の受入基準（昇順） */
  readonly missing: readonly string[];
  /** 追跡表が挙げるが現役でない番号（昇順） */
  readonly orphans: readonly string[];
  /** `N.M` にも範囲にも解釈できなかった Requirement 列のトークン */
  readonly unparsed: readonly string[];
}

/** `REQ-4.14` を (4, 14) の順で並べるための鍵 */
function criterionSortKey(id: string): [string, number] {
  const match = /^REQ-(\d+[A-E]?)\.(\d+)$/.exec(id);
  if (match?.[1] === undefined || match[2] === undefined) return [id, 0];
  return [match[1].padStart(4, '0'), Number.parseInt(match[2], 10)];
}

function sortCriterionIds(ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => {
    const a = criterionSortKey(left);
    const b = criterionSortKey(right);
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] - b[1];
  });
}

/**
 * 設計文書から追跡表の本文行を取り出す
 *
 * 表頭（`TRACEABILITY_TABLE_HEADER`）の**2行下**（区切り行の次）から、`|` で始まらない行の
 * 直前までを本文行とする。この数え方は `design.md` の
 * `### 部品の自己申告と追跡表の突き合わせ（タスク 115.113）` が定めた再現手順と同一である。
 */
export function extractTraceabilityRows(designContent: string): {
  tables: number;
  rows: string[];
} {
  const lines = designContent.split('\n');
  const rows: string[] = [];
  let tables = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !TRACEABILITY_TABLE_HEADER.test(line)) continue;
    tables += 1;
    for (let cursor = index + 2; cursor < lines.length; cursor++) {
      const bodyLine = lines[cursor];
      if (bodyLine === undefined || !bodyLine.startsWith('|')) break;
      rows.push(bodyLine);
    }
  }
  return { tables, rows };
}

/**
 * 追跡表の本文行の Requirement 列を受入基準の番号へ展開する
 *
 * 強調記号（`**`）とバッククォートは意味を持たない装飾として落とす。`,` で区切った各トークンを
 * 単独の番号または範囲として読む。**どちらでもないトークンは黙って捨てず `unparsed` に積む**。
 */
export function expandRequirementColumn(rows: readonly string[]): {
  covered: Set<string>;
  unparsed: string[];
} {
  const covered = new Set<string>();
  const unparsed: string[] = [];
  for (const row of rows) {
    const cell = row.split('|')[1];
    if (cell === undefined) continue;
    const normalized = cell.replace(/\*\*/g, '').replace(/`/g, '').trim();
    for (const rawToken of normalized.split(',')) {
      const token = rawToken.trim();
      if (token === '' || token === '-') continue;

      const range = RANGE_TOKEN.exec(token);
      if (range?.[1] !== undefined && range[2] !== undefined && range[4] !== undefined) {
        const requirementId = range[1];
        // 範囲の右端が別の要件を指す表記（`4.5-5.2`）は展開の仕方が一意に決まらない
        if (range[3] !== undefined && range[3] !== requirementId) {
          unparsed.push(token);
          continue;
        }
        const from = Number.parseInt(range[2], 10);
        const to = Number.parseInt(range[4], 10);
        if (to < from) {
          unparsed.push(token);
          continue;
        }
        for (let number = from; number <= to; number++) {
          covered.add(`REQ-${requirementId}.${number}`);
        }
        continue;
      }

      const single = SINGLE_TOKEN.exec(token);
      if (single?.[1] !== undefined && single[2] !== undefined) {
        covered.add(`REQ-${single[1]}.${Number.parseInt(single[2], 10)}`);
        continue;
      }

      unparsed.push(token);
    }
  }
  return { covered, unparsed };
}

/** 一機能を実測する */
export function measureFeature(rootDir: string, feature: string): FeatureMeasurement {
  const designPath = path.join(rootDir, '.kiro/specs', feature, DESIGN_DOCUMENT_BASENAME);
  const hasDesignDocument = fs.existsSync(designPath);
  const { tables, rows } = hasDesignDocument
    ? extractTraceabilityRows(fs.readFileSync(designPath, 'utf8'))
    : { tables: 0, rows: [] as string[] };
  const { covered, unparsed } = expandRequirementColumn(rows);

  const requirementsPath = requirementsDocumentPath(rootDir, feature);
  const requirements = scanRequirementsDocument(
    fs.readFileSync(requirementsPath, 'utf8'),
    requirementsPath
  );

  const active = new Set<string>();
  for (const requirement of requirements) {
    for (const criterion of requirement.criteria) {
      active.add(`${requirement.id}.${criterion.number}`);
    }
  }

  const missing = sortCriterionIds([...active].filter((id) => !covered.has(id)));
  const orphans = sortCriterionIds([...covered].filter((id) => !active.has(id)));

  return {
    feature,
    hasDesignDocument,
    tables,
    rows: rows.length,
    criteria: active.size,
    missing,
    orphans,
    unparsed,
  };
}

/** 判定の結果 */
export interface Judgement {
  readonly failures: string[];
  readonly measurements: FeatureMeasurement[];
}

function judgeFeature(measurement: FeatureMeasurement, policy: FeaturePolicy): string[] {
  const failures: string[] = [];
  const label = measurement.feature;

  // 母集団が空なら前提の崩壊として赤くする（AI運用7原則 第3原則）
  if (measurement.criteria === 0) {
    failures.push(`${label}: 現役の受入基準が 0 件です（要件定義書の読み取りが空振りしています）`);
  }
  const noTablesAllowed = policy.mode === 'ratchet' && policy.allowNoTraceabilityTable === true;
  if (measurement.rows === 0 && !noTablesAllowed) {
    failures.push(
      `${label}: 追跡表の本文行が 0 行です（表頭の書式が変わって走査が空振りした疑いがあります）。` +
        '表が未整備であることが判っている機能なら FEATURE_POLICIES で allowNoTraceabilityTable を宣言してください。'
    );
  }
  if (measurement.rows > 0 && noTablesAllowed) {
    failures.push(
      `${label}: allowNoTraceabilityTable を宣言していますが追跡表の本文行が ${measurement.rows} 行あります。宣言を外してください。`
    );
  }

  if (policy.mode === 'exact') {
    const declaredMissing = new Set(policy.missing);
    const actualMissing = new Set(measurement.missing);
    const newlyMissing = measurement.missing.filter((id) => !declaredMissing.has(id));
    const staleMissing = policy.missing.filter((id) => !actualMissing.has(id));
    if (newlyMissing.length > 0) {
      failures.push(
        `${label}: 追跡表に現れない受入基準が宣言より増えています: ${newlyMissing.join(', ')}`
      );
    }
    if (staleMissing.length > 0) {
      failures.push(
        `${label}: 解消済みの欠落が宣言に残っています（宣言から削ってください）: ${staleMissing.join(', ')}`
      );
    }

    const declaredOrphans = new Set(policy.orphans);
    const actualOrphans = new Set(measurement.orphans);
    const newlyOrphaned = measurement.orphans.filter((id) => !declaredOrphans.has(id));
    const staleOrphans = policy.orphans.filter((id) => !actualOrphans.has(id));
    if (newlyOrphaned.length > 0) {
      failures.push(`${label}: 現役でない番号を追跡表が挙げています: ${newlyOrphaned.join(', ')}`);
    }
    if (staleOrphans.length > 0) {
      failures.push(
        `${label}: 解消済みの死語が宣言に残っています（宣言から削ってください）: ${staleOrphans.join(', ')}`
      );
    }

    if (measurement.unparsed.length > policy.maxUnparsed) {
      failures.push(
        `${label}: Requirement 列に読めない表記が ${measurement.unparsed.length} 件あります` +
          `（宣言は ${policy.maxUnparsed} 件）: ${[...new Set(measurement.unparsed)].join(', ')}`
      );
    }
    return failures;
  }

  if (measurement.missing.length > policy.maxMissing) {
    failures.push(
      `${label}: 追跡表に現れない受入基準が ${measurement.missing.length} 件あります` +
        `（宣言の上限は ${policy.maxMissing} 件）。増えた分: ` +
        `${measurement.missing.slice(policy.maxMissing).join(', ')}`
    );
  }
  if (measurement.orphans.length > policy.maxOrphans) {
    failures.push(
      `${label}: 現役でない番号を追跡表が ${measurement.orphans.length} 件挙げています` +
        `（宣言の上限は ${policy.maxOrphans} 件）: ${measurement.orphans.join(', ')}`
    );
  }
  if (measurement.unparsed.length > policy.maxUnparsed) {
    failures.push(
      `${label}: Requirement 列に読めない表記が ${measurement.unparsed.length} 件あります` +
        `（宣言の上限は ${policy.maxUnparsed} 件）: ${[...new Set(measurement.unparsed)].join(', ')}`
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
        'この状態で「漏れは無い」と読んではなりません。'
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
          '追跡表の網羅の方針（exact / ratchet）を宣言してください。'
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
    failures.push(...judgeFeature(measurement, policy));
  }

  return { failures, measurements };
}

function reportSurvey(measurements: readonly FeatureMeasurement[]): void {
  for (const measurement of measurements) {
    console.log(
      `${measurement.feature}: tables=${measurement.tables} rows=${measurement.rows} ` +
        `criteria=${measurement.criteria} missing=${measurement.missing.length} ` +
        `orphans=${measurement.orphans.length} unparsed=${measurement.unparsed.length}`
    );
    if (measurement.missing.length > 0) console.log(`  missing: ${measurement.missing.join(', ')}`);
    if (measurement.orphans.length > 0) console.log(`  orphans: ${measurement.orphans.join(', ')}`);
    if (measurement.unparsed.length > 0) {
      console.log(`  unparsed: ${[...new Set(measurement.unparsed)].join(', ')}`);
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
      rows: accumulator.rows + measurement.rows,
      criteria: accumulator.criteria + measurement.criteria,
      missing: accumulator.missing + measurement.missing.length,
      orphans: accumulator.orphans + measurement.orphans.length,
      unparsed: accumulator.unparsed + measurement.unparsed.length,
    }),
    { rows: 0, criteria: 0, missing: 0, orphans: 0, unparsed: 0 }
  );

  if (json) {
    console.log(JSON.stringify({ failures, totals, measurements }, null, 2));
    return failures.length > 0 ? 1 : 0;
  }

  console.log('🔍 追跡表の受入基準の網羅を検査しています (scripts/check-traceability-coverage.ts)');
  console.log(
    `   機能 ${measurements.length} 件 / 追跡表の本文行 ${totals.rows} 行 / ` +
      `現役の受入基準 ${totals.criteria} 件`
  );
  console.log(
    `   欠落 ${totals.missing} 件 / 死語 ${totals.orphans} 件 / 読めない表記 ${totals.unparsed} 件` +
      '（いずれも宣言との比較で判定します）'
  );

  if (verbose) {
    console.log('');
    reportSurvey(measurements);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('❌ 追跡表と受入基準の対応が宣言と食い違います:');
    for (const failure of failures) console.error(`   - ${failure}`);
    console.error('');
    console.error('対応方法:');
    console.error('  1. 受入基準を新設したなら、design.md の追跡表の Requirement 列へ番号を加える');
    console.error('     （併合行なら `4.1-4.6, 4.9, 4.14` のように列へ足せば行数は動きません）');
    console.error('  2. 受入基準を撤廃したなら、追跡表の側の番号も落とす');
    console.error('  3. 行を起こせない事情があるなら、FEATURE_POLICIES へ理由と併せて宣言する');
    console.error('');
    console.error('詳細確認: npm run check:trace-coverage:verbose');
    return 1;
  }

  console.log('✅ 追跡表と受入基準の対応は宣言どおりです');
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
