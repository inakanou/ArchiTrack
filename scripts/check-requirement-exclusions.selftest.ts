/**
 * @fileoverview 除外定義の形式検査そのものの自己検査
 *
 * scripts/check-requirement-exclusions.ts が、壊れた除外定義を実際に弾けることを
 * 「壊し方そのものを注入して」確認する（陽性対照）。合わせて、正しい定義を
 * 誤って弾かないこと（陰性対照）も確認する。
 *
 * 検証器が何も検出できない状態のまま本検査が「合格」を出すと、形式検証は名ばかりになる。
 * それを防ぐため、CI と pre-push では本検査の前にこの自己検査を走らせる。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-exclusions.selftest.ts
 *   npm run check:req-exclusions:selftest
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  CoverageTagIndex,
  CoverageTagSite,
  ViolationCheck,
} from './check-requirement-exclusions.js';
import {
  E2E_SPECS_DIR,
  EXCLUSIONS_PATH,
  checkCoverageTagCoexistence,
  checkCriterionCorrespondence,
  loadRequirementCatalogue,
  run,
  scanCoverageTags,
} from './check-requirement-exclusions.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const SCHEMA_BASENAME = 'requirement-exclusions.schema.json';
const REAL_EXCLUSIONS = path.resolve(ROOT, EXCLUSIONS_PATH);
const REAL_SCHEMA = path.resolve(path.dirname(REAL_EXCLUSIONS), SCHEMA_BASENAME);

type Json = Record<string, unknown>;

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 定義の壊し方（正しい定義の複製を受け取り、その場で書き換える） */
  mutate?: (document: Json) => void;
  /** スキーマの壊し方 */
  mutateSchema?: (schema: Json) => void;
  /** 定義ファイルそのものを置き換える（JSON として壊す・置かない、を試すため） */
  rawDocument?: string | null;
  /** スキーマファイルを置かない */
  omitSchema?: boolean;
  /** 弾かれなければならない（true）／通らなければならない（false） */
  mustReject: boolean;
  /**
   * どの検査が弾かなければならないか（陽性対照でのみ使う）
   *
   * 「弾かれたか」だけを見る対照は、注入した欠陥が**別の**検査に巻き込まれて弾かれると
   * 緑のまま通ってしまう。狙った検査を丸ごと無効化しても検出漏れに気づけないため、
   * 陽性対照は必ず「どの検査が挙げたか」まで指定する（タスク 115.186 の是正）。
   */
  expectCheck?: ViolationCheck;
}

function loadReal(): Json {
  return JSON.parse(fs.readFileSync(REAL_EXCLUSIONS, 'utf-8')) as Json;
}

function loadRealSchema(): Json {
  return JSON.parse(fs.readFileSync(REAL_SCHEMA, 'utf-8')) as Json;
}

function entries(document: Json): Json[] {
  return document.exclusions as Json[];
}

/** 実物に必ず在るはずの除外を取り出す。無ければ前提が崩れているので失敗させる。 */
function entryAt(document: Json, index: number): Json {
  const entry = entries(document)[index];
  if (!entry) throw new Error(`前提: exclusions[${index}] が実物に存在しない`);
  return entry;
}

/** 識別子で除外を取り出す。無ければ前提が崩れているので失敗させる。 */
function entryById(document: Json, id: string): Json {
  const found = entries(document).find((entry) => entry.id === id);
  if (!found) throw new Error(`前提: 除外 ${id} が実物に存在しない`);
  return found;
}

/** 除外が掲げる代替検証を取り出す。無ければ前提が崩れているので失敗させる。 */
function altOf(entry: Json): Json {
  const alternative = entry.alternativeVerification as Json | undefined;
  if (!alternative) throw new Error('前提: 代替検証が実物に存在しない');
  return alternative;
}

function summary(document: Json): Json {
  return document.summary as Json;
}

function byCategory(document: Json): Record<string, number> {
  return summary(document).byCategory as Record<string, number>;
}

function categories(document: Json): Json {
  return document.categories as Json;
}

/**
 * `e2e/specs` の被覆印が名乗っており、かつ除外されていない受入基準
 *
 * 同居の陽性対照で「除外の指し先」を移す先として使う。除外に載っていないため、
 * 移しても重複にはならない。
 *
 * タスク 115.188 まで site-survey/REQ-1.1 を使っていたが、同タスクで当該の被覆印を
 * 取り下げた（名乗っていた三区間はいずれも受入基準1.1 の「調査名欄のデフォルト値」を
 * 確かめていなかった）ため差し替えた。
 *
 * 前提（`e2e/specs` が実際にこの番号を名乗っている）は `assertCoveredByE2E` が
 * 走査で確かめる。`pointEntryAt` は要件定義書に在ることしか見ないため、前提が崩れても
 * 変異が「同居を作らない無害な書き換え」に化けて陽性対照が静かに空振りするからである。
 */
const COVERED_PROBE_ID = 'site-survey/REQ-1.3';

/**
 * 被覆印の走査で `criterionId` が実際に名乗られていることを確かめる
 *
 * ラチェット（`test.fail()`）だけの被覆印は同居の違反にならないため、
 * ラチェットでない被覆印が一件以上あることまで見る。
 */
function assertCoveredByE2E(criterionId: string): void {
  const sites = scanCoverageTags().get(criterionId);
  if (sites === undefined || !sites.some((entry) => !entry.ratchet)) {
    throw new Error(`前提: ${criterionId} を名乗るラチェットでない被覆印が e2e/specs に無い`);
  }
}

/**
 * 識別子を一つずらす陽性対照のずらし先
 *
 * 除外にも載っておらず `e2e/specs` の被覆印も名乗っていない受入基準を選ぶ。除外に載って
 * いれば重複の違反が、被覆印が付いていれば同居の違反が同時に立ち、注入した欠陥が
 * どの検査に捕まったのか分からなくなる。実データからこの前提が崩れれば、ずらした先の
 * 検出が別の検査に移るため、この対照が `expectCheck` の不一致として失敗する。
 */
const SHIFT_TARGET_ID = 'site-survey/REQ-29.2';

/**
 * 陽性対照の変異元に使う「実在する除外」
 *
 * タスク 115.188 まで site-survey/REQ-1.6 を使っていたが、同タスクで当該の除外を
 * 取り下げたため差し替えた（実物に無い識別子を変異元にすると `entryById` が送出し、
 * 前提の崩壊として検査が落ちる。黙って読み飛ばす形にはしない）。
 *
 * 条件は「実在する除外であり、`e2e/specs` の被覆印がその番号を名乗っていない」こと。
 * 被覆印が付いていると、指し先をずらす変異で同居の違反が同時に立ち、
 * どの検査が捕まえたのか分からなくなる。
 */
const MUTATION_SOURCE_ID = 'site-survey/REQ-14.4';

/** `MUTATION_SOURCE_ID` の要件番号（requirement 欄の題だけを崩す変異で使う） */
const MUTATION_SOURCE_REQUIREMENT = 'REQ-14';

/**
 * 取り消し線で無効化された受入基準（墓標）の陽性対照での指し先
 *
 * 実データに撤廃済みとして残っている番号を選ぶ。要件定義書からこの表記が消えれば
 * `pointEntryAtRetired` が前提の崩壊として失敗するため、対照が黙って空振りしない。
 */
const RETIRED_PROBE_ID = 'quantity-table-generation/REQ-1.3';

/**
 * 除外の指し先を別の受入基準へ移す（番号と内容の対応は要件定義書から取り直す）
 *
 * id だけを差し替えると requirement / criterionText の照合に引っかかり、
 * 注入したかった欠陥とは別の理由で弾かれてしまう。陽性対照が「何を検出したのか」を
 * 曖昧にしないため、指し先に合わせて三つの欄をそろえる。
 */
function pointEntryAt(entry: Json, criterionId: string): void {
  const separator = criterionId.indexOf('/');
  const featureName = criterionId.slice(0, separator);
  const localId = criterionId.slice(separator + 1);
  const requirementId = localId.slice(0, localId.lastIndexOf('.'));

  const catalogue = loadRequirementCatalogue(featureName, ROOT);
  const title = catalogue.requirementTitles.get(requirementId);
  const criterionText = catalogue.criteria.get(localId);
  if (title === undefined || criterionText === undefined) {
    throw new Error(`前提: ${criterionId} が要件定義書に存在しない`);
  }

  entry.id = criterionId;
  entry.requirement = `${requirementId}: ${title}`;
  entry.criterionText = criterionText;
}

/**
 * 除外の指し先を、取り消し線で無効化された受入基準へ移す
 *
 * `pointEntryAt` と違い、本文は `criteria` ではなく `retiredCriteria` から取る。
 * 撤廃済みの受入基準は分母に載らないため `criteria` には無い。ここで前提が崩れれば
 * （実データから墓標が消えれば）例外で落ち、対照が静かに空振りすることはない。
 */
function pointEntryAtRetired(entry: Json, criterionId: string): void {
  const separator = criterionId.indexOf('/');
  const featureName = criterionId.slice(0, separator);
  const localId = criterionId.slice(separator + 1);
  const requirementId = localId.slice(0, localId.lastIndexOf('.'));

  const catalogue = loadRequirementCatalogue(featureName, ROOT);
  const title = catalogue.requirementTitles.get(requirementId);
  const criterionText = catalogue.retiredCriteria.get(localId);
  if (title === undefined || criterionText === undefined) {
    throw new Error(`前提: ${criterionId} が取り消し線で無効化された受入基準として存在しない`);
  }

  entry.id = criterionId;
  entry.requirement = `${requirementId}: ${title}`;
  entry.criterionText = criterionText;
}

/** 除外を1件取り除き、集計もそれに合わせて整える（壊したい一点だけを壊す） */
function dropOneEntry(document: Json, index: number): void {
  const list = entries(document);
  const removed = entryAt(document, index);
  list.splice(index, 1);
  const category = removed.category as string;
  const counts = byCategory(document);
  counts[category] = (counts[category] ?? 0) - 1;
  if (counts[category] === 0) {
    delete counts[category];
    delete categories(document)[category];
  }
  summary(document).totalExclusions = list.length;
}

// ============================================================================
// 弾かれなければならない壊し方（陽性対照）
// ============================================================================

const MUST_REJECT: Case[] = [
  {
    name: '必須項目の欠落（reason が無い除外）',
    mutate: (d) => {
      delete entryAt(d, 0).reason;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '代替検証そのものの欠落（E2Eで確かめない約束の相手が無い）',
    mutate: (d) => {
      delete entryAt(d, 0).alternativeVerification;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '代替検証の手段が空文字（形だけの代替検証）',
    mutate: (d) => {
      altOf(entryAt(d, 0)).method = '';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '代替検証に未知の項目',
    mutate: (d) => {
      altOf(entryAt(d, 0)).owner = '誰か';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '受入基準の識別子の書式違反（枝番が無い）',
    mutate: (d) => {
      entryAt(d, 0).id = 'REQ-23';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '受入基準の識別子の書式違反（要件番号ではない文字列）',
    mutate: (d) => {
      entryAt(d, 0).id = 'パフォーマンス関連';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '除外に未知の項目',
    mutate: (d) => {
      entryAt(d, 0).note = 'あとで消す';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '型違反（reason が文字列ではない）',
    mutate: (d) => {
      entryAt(d, 0).reason = 42;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '除外が一件も無い（前提条件で検査を無効化しない）',
    mutate: (d) => {
      d.exclusions = [];
      d.categories = { performance: categories(d).performance };
      summary(d).totalExclusions = 0;
      summary(d).byCategory = {};
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '識別子の重複（同じ受入基準を二重に除外）',
    mutate: (d) => {
      const list = entries(d);
      const copy = JSON.parse(JSON.stringify(entryAt(d, 0))) as Json;
      list.push(copy);
      const counts = byCategory(d);
      const category = copy.category as string;
      counts[category] = (counts[category] ?? 0) + 1;
      summary(d).totalExclusions = list.length;
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: 'categories に定義されていない分類',
    mutate: (d) => {
      const counts = byCategory(d);
      const before = entryAt(d, 0).category as string;
      counts[before] = (counts[before] ?? 0) - 1;
      counts['思いつきの分類'] = 1;
      entryAt(d, 0).category = '思いつきの分類';
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: 'どの除外からも使われていない分類の定義',
    mutate: (d) => {
      categories(d)['使われない分類'] = {
        description: '誰も使わない',
        verificationPhase: 'none',
      };
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: '分類の定義に検証フェーズが無い',
    mutate: (d) => {
      delete (categories(d).performance as Json).verificationPhase;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '集計の総数が実際とずれている',
    mutate: (d) => {
      summary(d).totalExclusions = entries(d).length + 6;
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: '分類別の集計が実際とずれている',
    mutate: (d) => {
      const counts = byCategory(d);
      counts.performance = (counts.performance ?? 0) + 4;
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: '該当が一件も無い分類が集計に残っている',
    mutate: (d) => {
      byCategory(d)['亡霊の分類'] = 3;
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    name: '版番号の書式違反',
    mutate: (d) => {
      d.version = 'v1';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '更新日の書式違反',
    mutate: (d) => {
      d.lastUpdated = '2026/08/25';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '最上位に未知の項目',
    mutate: (d) => {
      d.todo = 'あとで整理する';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: 'スキーマ参照が別のファイルを指す',
    mutate: (d) => {
      d.$schema = './requirement-exclusions.v2.schema.json';
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: 'スキーマ参照の欠落',
    mutate: (d) => {
      delete d.$schema;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: 'スキーマ参照の先が実在しない（ダングリング参照）',
    omitSchema: true,
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    name: '定義が JSON として壊れている',
    rawDocument: '{ "exclusions": [ ',
    mustReject: true,
    expectCheck: 'file',
  },
  {
    name: '定義ファイルが存在しない（前提条件で検査を無効化しない）',
    rawDocument: null,
    mustReject: true,
    expectCheck: 'file',
  },
  {
    name: '検証器が解釈できないスキーマ語彙（黙って素通りさせない）',
    mutateSchema: (s) => {
      ((s.$defs as Json).exclusion as Json).oneOf = [];
    },
    mustReject: true,
    expectCheck: 'schema',
  },

  // --------------------------------------------------------------------
  // 識別子と内容の対応（タスク 115.167 で追加）
  //
  // いずれも 115.167 の着手時点（HEAD）の検証器では一件も検出できなかった。
  // 実データにあった食い違いは、まさにこれらの形で入り込んでいた。
  // --------------------------------------------------------------------
  {
    name: '接頭辞だけが違う識別子の重複（REQ-N.M と user-authentication/REQ-N.M）',
    mutate: (d) => {
      const source = entries(d)[0];
      if (!source) throw new Error('前提: 除外が実物に存在しない');
      if ((source.id as string).includes('/')) {
        throw new Error('前提: 先頭の除外が機能名を冠さない識別子ではない');
      }
      const clone = JSON.parse(JSON.stringify(source)) as Json;
      clone.id = `user-authentication/${source.id as string}`;
      entries(d).push(clone);
      summary(d).totalExclusions = entries(d).length;
      const counts = byCategory(d);
      counts[clone.category as string] = (counts[clone.category as string] ?? 0) + 1;
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    // 変異元は `MUTATION_SOURCE_ID`（実在する除外）。番号だけを実在しない値へ書き換えるので、
    // 立つ違反は番号と原文の対応だけである。
    name: '要件定義書に存在しない受入基準を指す識別子',
    mutate: (d) => {
      entryById(d, MUTATION_SOURCE_ID).id = 'site-survey/REQ-14.99';
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    // 指し先を隣の受入基準へ一つずらす。requirement 欄は同じ要件を指したままなので、
    // 崩れるのは criterionText（逐語複製）と番号の対応だけである。
    //
    // ずらす先は **被覆印が付いていない受入基準** を選ぶ（`SHIFT_TARGET_ID`）。
    // 従前は quantity-table-generation/REQ-9.5 → REQ-9.4 をずらしていたが、REQ-9.4 には
    // `e2e/specs/quantity-tables/field-specification.spec.ts` の被覆印があるため、同居の
    // 検査も同時に発火していた。二つの欠陥が同時に入ると、この対照は
    // `checkCriterionCorrespondence` を丸ごと無効化しても同居違反だけで弾かれ、緑のまま
    // 通ってしまう（タスク 115.186 のレビューが実際に変異を走らせて実証した遮蔽）。
    // 単一の欠陥だけを注入する。`expectCheck` による「狙った検査が挙げたか」の判定と
    // 併せて、遮蔽を二重に塞ぐ。
    name: '識別子を一つずらす（番号と内容の対応が崩れる）',
    mutate: (d) => {
      entryById(d, 'site-survey/REQ-29.3').id = SHIFT_TARGET_ID;
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    name: 'requirement 欄の要件番号が識別子と食い違う',
    mutate: (d) => {
      entryById(d, MUTATION_SOURCE_ID).requirement = 'REQ-99: 架空の要件';
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    name: 'requirement 欄の要件の題が要件定義書と食い違う',
    mutate: (d) => {
      entryById(d, MUTATION_SOURCE_ID).requirement =
        `${MUTATION_SOURCE_REQUIREMENT}: まったく別の題`;
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    name: 'criterionText が原文と一文字違う（逐語複製の崩れ）',
    mutate: (d) => {
      const entry = entryById(d, MUTATION_SOURCE_ID);
      entry.criterionText = `${entry.criterionText as string}。`;
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    // 撤廃済み（取り消し線）の受入基準は被覆率の分母に載らないため、除外の対象にならない。
    // 区分を何にしようと、「E2Eでは確かめないが代わりにこう確かめる」という約束の相手が
    // 存在しない。指し先を実在する墓標へ移して、その一点だけを注入する。
    name: '取り消し線で無効化された受入基準を除外で指す',
    mutate: (d) => {
      pointEntryAtRetired(entryById(d, MUTATION_SOURCE_ID), RETIRED_PROBE_ID);
    },
    mustReject: true,
    expectCheck: 'criterion-correspondence',
  },
  {
    name: 'criterionText の欠落（逐語複製を置かずに済ませる）',
    mutate: (d) => {
      delete entryAt(d, 0).criterionText;
    },
    mustReject: true,
    expectCheck: 'schema',
  },
  {
    // 「E2Eでは確かめない」と宣言した受入基準を、`e2e/specs` の被覆印が同じ番号で
    // 名乗っている状態。宣言と実態のどちらかが必ず誤っているため、そのまま残せない。
    // 単一の欠陥だけを注入するため、指し先を移す際に requirement と criterionText も
    // 要件定義書から取り直す（番号と内容の対応の検査に引っかかって、別の理由で
    // 弾かれることを避ける）。
    name: '除外と被覆タグの同居（E2Eで確かめないと宣言した受入基準を e2e/specs が名乗る）',
    mutate: (d) => {
      assertCoveredByE2E(COVERED_PROBE_ID);
      pointEntryAt(entryById(d, MUTATION_SOURCE_ID), COVERED_PROBE_ID);
    },
    mustReject: true,
    expectCheck: 'coverage-tag-coexistence',
  },
];

// ============================================================================
// 通らなければならない形（陰性対照）
// ============================================================================

const MUST_ACCEPT: Case[] = [
  {
    name: 'リポジトリの実物',
    mustReject: false,
  },
  {
    name: '閾値を持たない代替検証（threshold は任意項目）',
    mutate: (d) => {
      delete altOf(entryAt(d, 0)).threshold;
    },
    mustReject: false,
  },
  {
    // 実物が旧来の形の識別子を含んでいることを前提として明示する。含まなくなれば
    // この陰性対照は前提の崩壊として失敗し、「旧来の形も通る」という主張が
    // 何も確かめないまま緑になることを防ぐ。
    name: '機能名を冠さない旧来の識別子（REQ-N.M）',
    mutate: (d) => {
      const bare = entries(d).filter((entry) => !(entry.id as string).includes('/'));
      if (bare.length === 0) throw new Error('前提: 機能名を冠さない識別子が実物に存在しない');
    },
    mustReject: false,
  },
  {
    // 旧来の形の識別子を、同じ受入基準を指す機能名付きの形へ書き換えても通ること。
    // 指し先が変わらないため criterionText も requirement も据え置きでよい。
    name: '機能名を冠した識別子（feature/REQ-N.M）',
    mutate: (d) => {
      const target = entries(d).find((entry) => !(entry.id as string).includes('/'));
      if (!target) throw new Error('前提: 機能名を冠さない識別子が実物に存在しない');
      target.id = `user-authentication/${target.id as string}`;
    },
    mustReject: false,
  },
  {
    name: '除外を1件減らし集計もそろえた定義',
    mutate: (d) => {
      dropOneEntry(d, 0);
    },
    mustReject: false,
  },
];

// ============================================================================
// 同居の判定そのものを見る（機構の固定）
// ============================================================================
//
// 上の陽性対照は `run()` を通すため、走査が何も見つけていない状態でも
// 「実物が通る」という陰性対照だけは成立してしまう。走査が空振りしていないこと、
// および同居の可否がラチェットの有無で決まることを、判定関数そのものへ直接
// 資料を与えて固定する。

/** 同居の判定へ与える最小の定義（id だけを見るため他の欄は要らない） */
function documentWithIds(...ids: string[]): Record<string, unknown> {
  return { exclusions: ids.map((id) => ({ id })) };
}

function site(overrides: Partial<CoverageTagSite> & { file: string }): CoverageTagSite {
  return { line: 1, ratchet: false, scope: 'test', ...overrides };
}

interface MechanismCase {
  name: string;
  run: () => string[];
}

const MECHANISM_CASES: MechanismCase[] = [
  {
    name: '同居が無ければ違反にしない',
    run: () => {
      const violations = checkCoverageTagCoexistence(
        documentWithIds('site-survey/REQ-1.1'),
        new Map()
      );
      return violations.length === 0 ? [] : [`同居が無いのに ${violations.length} 件を挙げた`];
    },
  },
  {
    name: 'ラチェットでない被覆印との同居は違反にする',
    run: () => {
      const index: CoverageTagIndex = new Map([
        ['site-survey/REQ-1.1', [site({ file: 'e2e/specs/a.spec.ts' })]],
      ]);
      const violations = checkCoverageTagCoexistence(documentWithIds('site-survey/REQ-1.1'), index);
      return violations.length === 1 ? [] : [`違反が ${violations.length} 件（1件であるべき）`];
    },
  },
  {
    name: 'ラチェット（test.fail()）だけとの同居は通す',
    run: () => {
      const index: CoverageTagIndex = new Map([
        ['site-survey/REQ-1.1', [site({ file: 'e2e/specs/a.spec.ts', ratchet: true })]],
      ]);
      const violations = checkCoverageTagCoexistence(documentWithIds('site-survey/REQ-1.1'), index);
      return violations.length === 0 ? [] : [`ラチェットとの同居を ${violations.length} 件挙げた`];
    },
  },
  {
    name: 'ラチェットと同じファイルのひとまとまりの宣言は通す',
    run: () => {
      const index: CoverageTagIndex = new Map([
        [
          'site-survey/REQ-1.1',
          [
            site({ file: 'e2e/specs/a.spec.ts', ratchet: true }),
            site({ file: 'e2e/specs/a.spec.ts', scope: 'outside-test' }),
          ],
        ],
      ]);
      const violations = checkCoverageTagCoexistence(documentWithIds('site-survey/REQ-1.1'), index);
      return violations.length === 0 ? [] : [`同一ファイルの宣言を ${violations.length} 件挙げた`];
    },
  },
  {
    name: 'ラチェットが在っても別のテストが名乗れば違反にする（例外は一律ではない）',
    run: () => {
      const index: CoverageTagIndex = new Map([
        [
          'site-survey/REQ-1.1',
          [
            site({ file: 'e2e/specs/a.spec.ts', ratchet: true }),
            site({ file: 'e2e/specs/b.spec.ts' }),
          ],
        ],
      ]);
      const violations = checkCoverageTagCoexistence(documentWithIds('site-survey/REQ-1.1'), index);
      return violations.length === 1 ? [] : [`違反が ${violations.length} 件（1件であるべき）`];
    },
  },
  {
    name: '機能名を冠さない識別子も正規化してから突き合わせる',
    run: () => {
      const index: CoverageTagIndex = new Map([
        ['user-authentication/REQ-1.1', [site({ file: 'e2e/specs/a.spec.ts' })]],
      ]);
      const violations = checkCoverageTagCoexistence(documentWithIds('REQ-1.1'), index);
      return violations.length === 1 ? [] : [`違反が ${violations.length} 件（1件であるべき）`];
    },
  },
  {
    // 「撤廃済みの受入基準を指している」ことを、番号違いと**言い分けて**報告するか。
    // どちらも `criterion-correspondence` として弾かれるため、陽性対照の expectCheck では
    // 区別が付かない。直し方が正反対（除外を足すのではなく取り下げる）である以上、
    // 言い分けそのものを機構として固定する。
    name: '撤廃済みの受入基準を指す除外を、番号違いと言い分けて報告する',
    run: () => {
      const failures: string[] = [];
      const catalogue = loadRequirementCatalogue('quantity-table-generation', ROOT);
      const retiredText = catalogue.retiredCriteria.get('REQ-1.3');
      if (retiredText === undefined) {
        return ['前提: quantity-table-generation/REQ-1.3 が墓標として読めていない'];
      }

      const retired = checkCriterionCorrespondence({
        exclusions: [{ id: 'quantity-table-generation/REQ-1.3', criterionText: retiredText }],
      });
      if (retired.length !== 1 || !(retired[0]?.message ?? '').includes('取り消し線')) {
        failures.push(
          `撤廃済みの指し先を言い分けていない: ${retired.map((v) => v.message).join(' / ') || '違反なし'}`
        );
      }

      const absent = checkCriterionCorrespondence({
        exclusions: [{ id: 'quantity-table-generation/REQ-999.1', criterionText: 'x' }],
      });
      if (absent.length !== 1 || (absent[0]?.message ?? '').includes('取り消し線')) {
        failures.push(
          `存在しない番号を撤廃済みとして報告した: ${absent.map((v) => v.message).join(' / ') || '違反なし'}`
        );
      }
      return failures;
    },
  },
  {
    // 走査が壊れて空を返しても、上の資料による確認はすべて通ってしまう。
    // 実データを実際に走査し、被覆印とラチェットの双方が見つかることを主張する。
    name: '実データの走査が空振りしていない（被覆印とラチェットの双方を見つける）',
    run: () => {
      const failures: string[] = [];
      const index = scanCoverageTags();
      if (index.size === 0) {
        failures.push(`${E2E_SPECS_DIR} から被覆印を一つも読み取れていない（走査が壊れている）`);
        return failures;
      }
      const ratchetIds = [...index.entries()].filter(([, sites]) =>
        sites.some((entry) => entry.ratchet)
      );
      if (ratchetIds.length === 0) {
        failures.push('ラチェット（test.fail()）を抱える被覆印を一件も判別できていない');
      }
      const outsideTest = [...index.values()].some((sites) =>
        sites.some((entry) => entry.scope === 'outside-test')
      );
      if (!outsideTest) {
        failures.push('ひとまとまりの宣言（ファイル冒頭の一覧など）を一件も判別できていない');
      }
      return failures;
    },
  },
];

// ============================================================================
// 実行
// ============================================================================

function evaluate(testCase: Case): {
  rejected: boolean;
  /** 弾いた検査の集合（陽性対照が「狙った検査が挙げたか」を見るのに使う） */
  checks: Set<string>;
  detail: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-exclusions-selftest-'));
  try {
    if (!testCase.omitSchema) {
      const schema = loadRealSchema();
      testCase.mutateSchema?.(schema);
      fs.writeFileSync(path.join(dir, SCHEMA_BASENAME), JSON.stringify(schema, null, 2));
    }

    const documentPath = path.join(dir, 'requirement-exclusions.json');
    if (testCase.rawDocument === null) {
      // ファイルを置かない
    } else if (typeof testCase.rawDocument === 'string') {
      fs.writeFileSync(documentPath, testCase.rawDocument);
    } else {
      const document = loadReal();
      testCase.mutate?.(document);
      fs.writeFileSync(documentPath, JSON.stringify(document, null, 2));
    }

    const result = run(documentPath);
    return {
      rejected: result.violations.length > 0,
      checks: new Set(result.violations.map((v) => v.check ?? '(未分類)')),
      detail: result.violations
        .slice(0, 3)
        .map((v) => `${v.pointer}: ${v.message}`)
        .join(' / '),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const failures: string[] = [];
  let passed = 0;

  console.log('=== 弾かれなければならない壊し方（陽性対照） ===');
  for (const testCase of MUST_REJECT) {
    const { rejected, checks, detail } = evaluate(testCase);
    const fired = [...checks].sort().join(', ');
    if (!rejected) {
      failures.push(`検出漏れ: ${testCase.name}`);
      console.log(`  ❌ ${testCase.name} → 弾かれなかった`);
      continue;
    }
    // 狙った検査が挙げたことまで確かめる（別の検査に巻き込まれた合格を認めない）
    if (testCase.expectCheck === undefined) {
      failures.push(
        `陽性対照に expectCheck が無い: ${testCase.name}（実際に挙げた検査: ${fired}）`
      );
      console.log(`  ❌ ${testCase.name} → expectCheck 未指定（実際: ${fired}）`);
      continue;
    }
    if (!checks.has(testCase.expectCheck)) {
      failures.push(
        `狙った検査が挙げていない: ${testCase.name}（期待 ${testCase.expectCheck} / 実際 ${fired}）`
      );
      console.log(
        `  ❌ ${testCase.name} → ${testCase.expectCheck} が挙げていない（実際: ${fired}）`
      );
      continue;
    }
    passed += 1;
    console.log(`  ✅ ${testCase.name} [${testCase.expectCheck}] → ${detail}`);
  }

  console.log('');
  console.log('=== 通らなければならない形（陰性対照） ===');
  for (const testCase of MUST_ACCEPT) {
    const { rejected, detail } = evaluate(testCase);

    if (!rejected) {
      passed += 1;
      console.log(`  ✅ ${testCase.name}`);
    } else {
      failures.push(`過検出: ${testCase.name} → ${detail}`);
      console.log(`  ❌ ${testCase.name} → 誤って弾かれた（${detail}）`);
    }
  }

  console.log('');
  console.log('=== 同居の判定そのもの（機構の固定） ===');
  for (const mechanismCase of MECHANISM_CASES) {
    const detected = mechanismCase.run();
    if (detected.length === 0) {
      passed += 1;
      console.log(`  ✅ ${mechanismCase.name}`);
    } else {
      failures.push(`機構: ${mechanismCase.name} → ${detected.join(' / ')}`);
      console.log(`  ❌ ${mechanismCase.name} → ${detected.join(' / ')}`);
    }
  }

  const total = MUST_REJECT.length + MUST_ACCEPT.length + MECHANISM_CASES.length;
  console.log('');
  if (failures.length > 0) {
    console.error(`❌ 自己検査に失敗しました（${failures.length}/${total} 件）`);
    for (const failure of failures) console.error(`   - ${failure}`);
    process.exit(1);
  }

  console.log(
    `✅ 自己検査に合格しました（${passed}/${total} 件: 陽性対照 ${MUST_REJECT.length} / 陰性対照 ${MUST_ACCEPT.length} / 機構 ${MECHANISM_CASES.length}）`
  );
}

main();
