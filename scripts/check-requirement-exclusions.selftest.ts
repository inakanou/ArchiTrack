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
  DEFAULT_FEATURE,
  DEFERRED_E2E_PHASE,
  E2E_SPECS_DIR,
  EXCLUSIONS_PATH,
  PROMISELESS_METHOD,
  VIOLATION_CHECKS,
  checkAlternativeCoverage,
  checkCoverageTagCoexistence,
  checkCriterionCorrespondence,
  discoverFeatureNames,
  extractEnumeratedElements,
  loadRequirementCatalogue,
  namesElement,
  run,
  scanCoverageTags,
} from './check-requirement-exclusions.js';
import { discoverFeatures, extractRequirements } from './check-requirement-coverage.js';
// `SPEC_DIR` は共有モジュールから直に取る。被検査モジュール（check-requirement-exclusions.ts）
// を経由しても値は同じだが、経由させるためだけの再輸出を被検査側に置くことになる。
// 本自己検査がこの定数を使うのは合成の根を組み立てるためであり、同一性の主張には使わない。
// 両モジュールが同じ担い手を取り込んでいることは下の「機構の固定」の対照が別途確かめる。
import { SPEC_DIR } from './requirement-document.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
/** 本ファイル自身の絶対パス（入口の結線を自ソースで確かめる対照が読む。タスク 115.304） */
const OWN_SOURCE_PATH = fileURLToPath(import.meta.url);
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
 * 前提の崩壊として検査が落ちる。黙って読み飛ばす形にはしない）。実測: 本定数を
 * `'site-survey/REQ-99.99'` へ変える変異を当てると、64 件を数え上げる前に
 * `Error: 前提: 除外 site-survey/REQ-99.99 が実物に存在しない` を送出して EXIT=1 で
 * 異常終了する（2026-09-04 に実測。変異は退避した控えからの書き戻しで復元し、復元後は
 * 64/64 で緑に戻ることを確かめた）。
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

/**
 * 原文が中黒で複数の要素を列挙している除外を実物から一件取り出す（代替検証の被覆範囲の対照で使う）
 *
 * 変異は「掲げた代替検証から、原文が並べた要素を一つ落とす」形で入れる。
 * 実データがこの前提（列挙が二つ以上あり、その全てを代替検証が述べている）を
 * 満たさなくなれば送出し、対照は静かに空振りせず落ちる（AI運用7原則 第3原則）。
 *
 * **探針を ID で名指ししてはならない。** かつては
 * `quantity-table-generation/REQ-26.7` を直書きしていたが、同条文の除外が
 * タスク 100.5 で取り下げられた際に `entryById` が「実物に存在しない」で送出し、
 * **陽性対照39件を含む機構全体が最後まで走らなくなった**（2026-09-18 の機能レベル
 * 検証が、基線 `56a6a164` では exit 0 だったことを一時 worktree で実測して検出した）。
 * 除外の取り下げは本検査自身が推奨する営みであり、それが検査を壊す構造は誤りである。
 * `promiselessEntry` と同じく、**性質で見つけ、無ければ送出する**形にすること。
 */
function enumerationProbeEntry(document: Json): Json {
  const found = entries(document).find((entry) => {
    const elements = extractEnumeratedElements((entry.criterionText as string) ?? '');
    if (elements.length < 2) return false;
    const text = alternativeTextOf(entry);
    return elements.every((element) => namesElement(element, text));
  });
  if (!found) {
    throw new Error(
      '前提: 原文が中黒で二つ以上を列挙し、その全てを代替検証が述べている除外が実物に一件も存在しない'
    );
  }
  return found;
}

/**
 * 「機構の限界」の陰性対照が代替検証の説明を置き換える総称
 *
 * 探針の選び方（`noEnumerationProbeEntry`）と対で意味を持つ。この総称へ置き換えても
 * なお緑であることが、固定したい限界そのものである。
 */
const NO_ENUMERATION_GENERIC_DESCRIPTION = 'ロジックを検証';

/**
 * 原文が中黒の列挙を持たない除外を実物から一件取り出す（機構の限界を固定する陰性対照で使う）
 *
 * 固定したい限界は「原文が**中黒で**列挙していなければ `alternative-coverage` は何も
 * 言わない」である。連言や読点で並ぶ要素の部分被覆は機構では決まらない。
 *
 * **探針を ID で名指ししてはならない。** かつては `estimate-request/REQ-14.5` を
 * 直書きしていた。除外の取り下げは本検査自身が推奨する営みであり、当該の除外が
 * 取り下げられた日に `entryById` が「実物に存在しない」で送出して、陽性対照39件を
 * 含む機構全体（70件）が最後まで走らなくなる。対になる `enumerationProbeEntry` が
 * まさにその形で壊れた（タスク 100.5 が `quantity-table-generation/REQ-26.7` の除外を
 * 取り下げた瞬間に発火。2026-09-18 の機能レベル検証が基線 `56a6a164` との差で検出）。
 * `promiselessEntry` / `enumerationProbeEntry` と同じく、**性質で見つけ、無ければ
 * 送出する**形にする。
 *
 * 選ぶ性質は三つで、いずれも**対照を恒真にしないため**に要る（AI運用7原則 第3原則）。
 *
 * 1. 中黒の列挙を持たない（＝限界の前件が立っている）
 * 2. 読点を中黒に読み替えれば二つ以上の要素が読める（＝**取り逃がす当てが実在する**）。
 *    ここを落とすと「そもそも並べるものが何も無い原文」を選びうる。それでは変異が
 *    無害なのは当たり前で、対照は限界ではなく何も確かめていないことになる。
 * 3. 説明を総称へ置き換えると、その要素の少なくとも一つがどの欄にも現れなくなる
 *    （＝**変異が効いている**）。この三つを満たす相手を選ぶ限り、機構が読点まで読むよう
 *    緩められた日には (1) が崩れて本関数が送出し、対照は緑のまま通り過ぎない。
 *    実測: `extractEnumeratedElements` の先頭へ `criterionText` の読点を中黒へ読み替える
 *    一行を挿すと、本関数が上の前提の崩壊を送出して自己検査は EXIT=1 で落ちる
 *    （2026-09-19 に実測。変異は控えからの書き戻しで復元し、70/70 の緑へ戻した）。
 *    逆に、実データが「列挙を持たない除外」を一件も持たなくなる変異
 *    （中黒の無い原文へ二要素を返させる）でも同じ経路で EXIT=1 になる。
 *
 * 加えて、置き換え前の説明が総称と食い違うことも見る。同じ文字列なら「変異を加えた
 * つもりの無変異」になり、実物と区別が付かなくなるからである。
 */
function noEnumerationProbeEntry(document: Json): Json {
  const found = entries(document).find((entry) => {
    const criterionText = (entry.criterionText as string) ?? '';
    if (extractEnumeratedElements(criterionText).length > 0) return false;
    const alternative = entry.alternativeVerification as Json | undefined;
    if (!alternative || typeof alternative.description !== 'string') return false;
    if (alternative.description === NO_ENUMERATION_GENERIC_DESCRIPTION) return false;
    // 読点を中黒に読み替えて「機構が読まない列挙」を取り出す（検査本体の規則を使い回す）。
    const unread = extractEnumeratedElements(criterionText.split('、').join('・'));
    if (unread.length < 2) return false;
    const text = alternativeTextWithDescription(entry, NO_ENUMERATION_GENERIC_DESCRIPTION);
    return unread.some((element) => !namesElement(element, text));
  });
  if (!found) {
    throw new Error(
      '前提: 原文が中黒では列挙せず読点で二つ以上を並べ、説明を総称へ置き換えるとその要素を述べなくなる除外が実物に一件も存在しない'
    );
  }
  return found;
}

/** 代替検証の全ての文字列（検査が照合する相手と同じ範囲） */
function alternativeTextOf(entry: Json): string {
  return Object.values(altOf(entry))
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

/** 説明の欄だけを差し替えたときの代替検証の全文字列（変異が効くかを変異の前に測る） */
function alternativeTextWithDescription(entry: Json, description: string): string {
  const alternative = { ...(entry.alternativeVerification as Json), description };
  return Object.values(alternative)
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

/**
 * 除外の原文が列挙する要素を取り出す（前提が崩れていれば送出する）
 *
 * `expectEnumerated` が false のときは「列挙を持たない」ことの方を前提として確かめる。
 */
function enumeratedElementsOf(entry: Json, expectEnumerated: boolean): string[] {
  const elements = extractEnumeratedElements(entry.criterionText as string);
  if (expectEnumerated && elements.length < 2) {
    throw new Error(`前提: ${entry.id as string} の原文が中黒で二つ以上を列挙していない`);
  }
  if (!expectEnumerated && elements.length > 0) {
    throw new Error(`前提: ${entry.id as string} の原文が中黒の列挙を持ってしまっている`);
  }
  if (expectEnumerated) {
    const text = alternativeTextOf(entry);
    const unnamed = elements.filter((element) => !namesElement(element, text));
    if (unnamed.length > 0) {
      throw new Error(
        `前提: ${entry.id as string} の代替検証が既に「${unnamed.join('・')}」を述べていない（変異前から違反している）`
      );
    }
  }
  return elements;
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

/**
 * 代替検証を持たない除外（`method: "none"`）を実物から一件取り出す
 *
 * 無ければ前提の崩壊として送出する（黙って空振りさせない。AI運用7原則 第3原則）。
 * この形は実データに現に在り、タスク 115.314 の時点では公開鍵配布の三件である。
 * 全件が取り下げられた日には、下の二つの陽性対照は空振りではなく**失敗**する。
 */
function promiselessEntry(document: Json): Json {
  const found = entries(document).find(
    (entry) => (entry.alternativeVerification as Json | undefined)?.method === PROMISELESS_METHOD
  );
  if (!found) {
    throw new Error(
      `前提: 代替検証を持たない除外（method: ${PROMISELESS_METHOD}）が実物に一件も存在しない`
    );
  }
  return found;
}

/**
 * 「後でE2Eが確かめる」以外の検証フェーズを持つ分類の名前を実物から一つ取り出す
 *
 * 移し先が実物に無ければ前提の崩壊として送出する。
 */
function nonDeferredCategoryName(document: Json, exclude: string): string {
  const table = categories(document) as Record<string, Json>;
  const found = Object.keys(table).find(
    (name) => name !== exclude && (table[name] as Json).verificationPhase !== DEFERRED_E2E_PHASE
  );
  if (!found) {
    throw new Error(
      `前提: 検証フェーズが ${DEFERRED_E2E_PHASE} でない分類が実物に存在しない（移し先が無い）`
    );
  }
  return found;
}

/** 除外の分類を移し、集計もそれに合わせて整える（壊したい一点だけを壊す） */
function moveCategory(document: Json, entry: Json, to: string): void {
  const counts = byCategory(document);
  const from = entry.category as string;
  counts[from] = (counts[from] ?? 0) - 1;
  if (counts[from] === 0) delete counts[from];
  counts[to] = (counts[to] ?? 0) + 1;
  entry.category = to;
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
    // タスク 115.314。除外は「代わりにこの方法で確かめる」という約束であり、
    // その約束を持たない形は「後でE2Eが確かめる」分類にしか置けない。移せると、
    // 除外一覧は未実装かつ方針未決の条文を分母から外す器になる。
    name: '代替検証を持たない除外を、後でE2Eが確かめる分類の外へ移す',
    mutate: (d) => {
      const entry = promiselessEntry(d);
      moveCategory(d, entry, nonDeferredCategoryName(d, entry.category as string));
    },
    mustReject: true,
    expectCheck: 'invariant',
  },
  {
    // 同じ規則を分類の側から壊す。判定は分類名ではなく検証フェーズを読むため、
    // 置き場所の分類が「後でE2Eが確かめる」ことをやめた瞬間に赤くならなければならない。
    name: '代替検証を持たない除外を抱えた分類の検証フェーズを書き換える',
    mutate: (d) => {
      const entry = promiselessEntry(d);
      const table = categories(d) as Record<string, Json>;
      const category = table[entry.category as string];
      if (!category) throw new Error(`前提: 分類 ${entry.category as string} が実物に存在しない`);
      if (category.verificationPhase !== DEFERRED_E2E_PHASE) {
        throw new Error(
          `前提: 分類 ${entry.category as string} の検証フェーズが変異前から ${DEFERRED_E2E_PHASE} ではない`
        );
      }
      category.verificationPhase = 'undecided';
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

  // --------------------------------------------------------------------
  // 代替検証が受入基準を覆う範囲（タスク 115.189 で追加）
  //
  // 除外は受入基準を丸ごと分母から外す。掲げた代替検証が原文の一部しか述べて
  // いなければ、述べられていない要素はどの指標にも現れない。実データにあった
  // 食い違い（site-survey/REQ-8.5 の「色・背景色」の欠落ほか13件）は、
  // まさにこの形で入り込んでいた。
  // --------------------------------------------------------------------
  {
    // 一要素だけを落とす。除外の他の欄には触れないため、立つ違反はこれだけである。
    name: '代替検証が原文の列挙のうち一要素を述べていない（部分被覆）',
    mutate: (d) => {
      const entry = enumerationProbeEntry(d);
      const dropped = enumeratedElementsOf(entry, true)[0] as string;
      const alternative = altOf(entry);
      for (const [key, value] of Object.entries(alternative)) {
        if (typeof value === 'string') alternative[key] = value.split(dropped).join('');
      }
      if (alternativeTextOf(entry).includes(dropped)) {
        throw new Error(`変異が効いていない: 「${dropped}」が代替検証に残っている`);
      }
    },
    mustReject: true,
    expectCheck: 'alternative-coverage',
  },
  {
    name: '代替検証の説明が総称だけで原文の列挙を一つも述べていない',
    mutate: (d) => {
      const entry = enumerationProbeEntry(d);
      enumeratedElementsOf(entry, true);
      const alternative = altOf(entry);
      alternative.description = 'PDF生成ロジックを検証';
      alternative.tool = 'Vitest';
      delete alternative.threshold;
    },
    mustReject: true,
    expectCheck: 'alternative-coverage',
  },
  {
    // 題（title）が原文を写していても、約束の側が述べていなければ覆えていない。
    // 実データの site-survey/REQ-8.5 がまさにこの形だった
    // （題は「フォントサイズ・色・背景色のカスタマイズ」、説明は「フォントサイズ」だけ）。
    name: '題だけが原文の列挙を写し、代替検証は一要素しか述べていない',
    mutate: (d) => {
      const entry = enumerationProbeEntry(d);
      const elements = enumeratedElementsOf(entry, true);
      entry.title = elements.join('・');
      const alternative = altOf(entry);
      alternative.description = `${elements[0] as string}を検証`;
      alternative.tool = 'Vitest';
      delete alternative.threshold;
    },
    mustReject: true,
    expectCheck: 'alternative-coverage',
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
    // タスク 115.314。上の二つの陽性対照と対にする。代替検証を持たない除外の置き場所を
    // 決めるのは `verificationPhase` であって説明文ではない。説明文だけを書き換えても
    // 通ることを固定しておくと、判定を散文の綴りへ寄せる締め上げが入った日に
    // この対照だけが赤くなる。
    name: '後でE2Eが確かめる分類の説明文の書き換え（判定は検証フェーズが担う）',
    mutate: (d) => {
      const entry = promiselessEntry(d);
      const table = categories(d) as Record<string, Json>;
      const category = table[entry.category as string];
      if (!category) throw new Error(`前提: 分類 ${entry.category as string} が実物に存在しない`);
      category.description = '説明文だけを書き換えた分類';
    },
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
    // 直後の対照（裸 → 機能名付き）の鏡。既定機能の受入基準を機能名付きで書いている除外を、
    // 旧来の裸の形へ書き換えても通ること。指し先（正規化後の識別子）は変わらないため
    // criterionText も requirement も据え置きでよい。
    //
    // **この対照が独自に担保するもの**: 実物に無い裸の識別子を**新たに作る**点である。
    // 裸の綴りが「今そう書かれている分だけの特例」ではなく、既定機能のどの受入基準に
    // 対しても認められることを固定する。既存分を凍結するラチェット（新規の裸の識別子を
    // 禁じる締め上げ）を検査へ入れると、実物も他の対照も緑のまま、この対照だけが赤くなる。
    //
    // 前提が崩れた場合（機能名付きの識別子が実物から消えた／書き換え先の裸の識別子が
    // 既に在る）は黙って素通りさせず、例外で赤くする（第3原則）。
    name: '機能名を冠さない旧来の識別子（feature/REQ-N.M → REQ-N.M）',
    mutate: (d) => {
      const prefix = `${DEFAULT_FEATURE}/`;
      const target = entries(d).find((entry) => (entry.id as string).startsWith(prefix));
      if (!target) throw new Error(`前提: '${prefix}' を冠した識別子が実物に存在しない`);
      const bare = (target.id as string).slice(prefix.length);
      if (entries(d).some((entry) => entry.id === bare)) {
        throw new Error(`前提: 裸の識別子 ${bare} が実物に既に在り、書き換えると重複になる`);
      }
      target.id = bare;
    },
    mustReject: false,
  },
  {
    // 上の鏡。旧来の形の識別子を、同じ受入基準を指す機能名付きの形へ書き換えても通ること。
    // 指し先が変わらないため criterionText も requirement も据え置きでよい。
    name: '機能名を冠した識別子（REQ-N.M → feature/REQ-N.M）',
    mutate: (d) => {
      const target = entries(d).find((entry) => !(entry.id as string).includes('/'));
      if (!target) throw new Error('前提: 機能名を冠さない識別子が実物に存在しない');
      target.id = `${DEFAULT_FEATURE}/${target.id as string}`;
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
  {
    // 機構の限界をそのまま固定する。原文が中黒で列挙していなければ、説明が総称でも
    // この検査は何も言わない（連言「〜を表示し、〜を促す」の部分被覆は機構では決まらない）。
    // 探針は `noEnumerationProbeEntry` が性質で選ぶ。ID で名指しすると、当該の除外が
    // 取り下げられた日に機構全体が止まる（タスク 100.15。理由は同関数の註に書いた）。
    // 選ばれる相手は「読点でなら二つ以上が読め、総称へ置き換えるとその要素をどの欄でも
    // 述べなくなる」除外に限る。緩めた覚えのない側（読点まで読む等）を後から緩めると、
    // この陰性対照自身が赤くなる。
    name: '原文に中黒の列挙が無ければ代替検証の総称を弾かない（機構の限界）',
    mutate: (d) => {
      const entry = noEnumerationProbeEntry(d);
      enumeratedElementsOf(entry, false);
      altOf(entry).description = NO_ENUMERATION_GENERIC_DESCRIPTION;
    },
    mustReject: false,
  },
  {
    // 要素を閾値の欄で述べている除外は実在する。説明の欄だけを見ると誤検出になる。
    name: '原文の列挙を閾値の欄で述べていても通す',
    mutate: (d) => {
      const entry = enumerationProbeEntry(d);
      const elements = enumeratedElementsOf(entry, true);
      const alternative = altOf(entry);
      alternative.description = 'PDF生成ロジックを検証';
      alternative.threshold = `columns: ${elements.join('・')}`;
    },
    mustReject: false,
  },
];

// ============================================================================
// 要件定義書の抽出規則が一箇所にしか無いことを見る（機構の固定・タスク 115.190）
// ============================================================================

/** 抽出規則を持つ唯一のモジュール */
const SHARED_SCANNER_BASENAME = 'requirement-document.ts';

/** 抽出規則を「使う」だけであって「持って」はならないスクリプト */
const EXTRACTION_RULE_CONSUMERS = [
  'check-requirement-coverage.ts',
  'check-requirement-exclusions.ts',
] as const;

/**
 * 抽出規則そのものを表す断片
 *
 * これらが消費側のソースに現れたら、規則の複製が戻っている。散文の中の「受入基準」では
 * 当たらないよう、引用符ごと・正規表現リテラルごとの形で持つ。
 */
const EXTRACTION_RULE_FRAGMENTS = [
  String.raw`/^###\s*要件(\d+[A-E]?):\s*(.*)$/`,
  String.raw`/^###\s*Requirement\s+(\d+[A-E]?):\s*(.*)$/`,
  String.raw`/^(\d+)\.\s+(.+)$/`,
  String.raw`/^(\d+)[a-z]\.\s+(.+)$/`,
  "'#### 受入基準'",
  "'##### 受入基準'",
  "'#### Acceptance Criteria'",
  ".startsWith('~~')",
] as const;

// ============================================================================
// 機能名の探索規則が一箇所にしか無いことを見る（機構の固定・タスク 115.221）
// ============================================================================

/**
 * 探索規則を「使う」だけであって「持って」はならないスクリプト
 *
 * 抽出規則の消費側と同一である。両者は同じ二つの指標（被覆率の分母と除外が指す単位）の
 * 母集団を決めており、片方だけが機能を見落とせば、もう片方が分母から外そうとする条文は
 * そもそも存在しないことになる。
 */
const DISCOVERY_RULE_CONSUMERS: readonly string[] = EXTRACTION_RULE_CONSUMERS;

/**
 * 機能名の探索規則そのものを表す断片
 *
 * 「`.kiro/specs` の直下で `requirements.md` を持つディレクトリ」という判定は、この二つの
 * 文字列リテラルなしには書けない。散文の中の `.kiro/specs/` や requirements.md には
 * 当たらないよう、引用符ごとの形で持つ。
 *
 * この機構には既知の天井がある（115.190 の断片方式から引き継いだ限界であり、
 * 本タスクで解いたものではない）。消費側が共有モジュールから取り込んだ `SPEC_DIR` /
 * `REQUIREMENTS_DOCUMENT_BASENAME` を使って探索を書き直すと、ソースに裸の文字列リテラルは
 * 現れないため、この対照は素通りする。さらにその再複製が挙動まで同一であれば、
 * 続く二つの対照（実データの一致・際どい構成の一致）も同じ並びを返すため素通りする。
 * すなわち三つの対照が捕らえるのは「規則が食い違う複製」であって「食い違わない複製」
 * ではない。複製そのものの禁止は、依然としてレビューが担う。
 */
const DISCOVERY_RULE_FRAGMENTS: readonly string[] = ["'.kiro/specs'", "'requirements.md'"];

/**
 * 断片ごとの担い手（タスク 115.269）。
 *
 * スペックの根 `.kiro/specs` は設計文書の走査根と同じ一つの値であるため、共有モジュール
 * scripts/requirement-document.ts ではなく scripts/spec-directory.ts が持つ。挙げられていない
 * 断片の担い手は {@link SHARED_SCANNER_BASENAME} である。**消費側が持ってはならないことは
 * 変わらない**——下の対照は担い手を引くだけで、消費側の照合には同じ断片を使う。
 */
const DISCOVERY_RULE_FRAGMENT_OWNERS: Readonly<Record<string, string>> = {
  "'.kiro/specs'": 'spec-directory.ts',
};

/** 探索の際どい構成を作る合成の根 */
interface DiscoveryProbe {
  name: string;
  /** `<root>/.kiro/specs` を与えられて構成を作る */
  build: (specsDir: string, rootDir: string) => void;
  /** 機能名として返るべき並び */
  expect: string[];
}

function writeFeature(specsDir: string, name: string): void {
  const dir = path.join(specsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'requirements.md'), '### 要件1: 題\n', 'utf-8');
}

/**
 * 際どい構成の一覧
 *
 * いずれもタスク 115.221 で二つの複製へ実際に当てて、同じ並びが返ることを実測した形である。
 */
const DISCOVERY_PROBES: DiscoveryProbe[] = [
  {
    name: 'requirements.md を持たないディレクトリと直下のファイルは機能にしない',
    build: (specsDir) => {
      writeFeature(specsDir, 'zeta');
      writeFeature(specsDir, 'alpha');
      fs.mkdirSync(path.join(specsDir, 'no-doc'), { recursive: true });
      fs.writeFileSync(path.join(specsDir, 'loose.md'), 'x', 'utf-8');
    },
    expect: ['alpha', 'zeta'],
  },
  {
    name: 'ディレクトリへの symlink は機能にしない（孫階層の要件定義書も同様）',
    build: (specsDir, rootDir) => {
      writeFeature(specsDir, 'alpha');
      const outside = path.join(rootDir, 'outside', 'linked');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'requirements.md'), '### 要件1: 題\n', 'utf-8');
      fs.symlinkSync(outside, path.join(specsDir, 'linked'));
      writeFeature(path.join(specsDir, 'parent'), 'child');
    },
    expect: ['alpha'],
  },
  {
    name: '隠しディレクトリでも要件定義書を持てば機能とする',
    build: (specsDir) => {
      writeFeature(specsDir, '.hidden');
      writeFeature(specsDir, 'alpha');
    },
    expect: ['.hidden', 'alpha'],
  },
];

/** 合成の根を作って両者の探索を走らせる */
function withSpecsTree(probe: DiscoveryProbe, body: (rootDir: string) => void): void {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-discover-'));
  try {
    const specsDir = path.join(rootDir, SPEC_DIR);
    fs.mkdirSync(specsDir, { recursive: true });
    probe.build(specsDir, rootDir);
    body(rootDir);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

/**
 * 同じ根を、被覆率側と除外側の双方で探索する
 *
 * 被覆率側は cwd 相対でしか根を受け取れないため、実行位置を移して呼ぶ（必ず戻す）。
 * スペックディレクトリが無い根では被覆率側が exit 1 で**プロセスごと落ちる**ため、
 * 呼ぶ前に実在を確かめて例外にする。不在時の扱い（空配列か停止か）は呼び手の方針であり、
 * 一致を求める対象ではない。
 */
function discoveredPairFor(rootDir: string): [string[], string[]] {
  if (!fs.existsSync(path.resolve(rootDir, SPEC_DIR))) {
    throw new Error(`スペックディレクトリが無い根では比べられない: ${rootDir}`);
  }
  const fromExclusions = discoverFeatureNames(rootDir);
  const before = process.cwd();
  try {
    process.chdir(rootDir);
    return [discoverFeatures(), fromExclusions];
  } finally {
    process.chdir(before);
  }
}

/** 抽出器の出力を、両者で比べられる素の形へ落としたもの */
interface ExtractionShape {
  /** `REQ-N.M` の並び（墓標には `(墓標)` を添える） */
  criteria: string[];
  /** `REQ-N='題'` の並び */
  titles: string[];
  /** 例外になった場合はその文言 */
  thrown?: string;
}

function shapeOf(body: () => Omit<ExtractionShape, 'thrown'>): ExtractionShape {
  try {
    return body();
  } catch (error) {
    return { criteria: [], titles: [], thrown: (error as Error).message };
  }
}

/** 同じ要件定義書を、被覆率側と除外側の双方で読む */
function extractedPairFor(feature: string, rootDir = ROOT): [ExtractionShape, ExtractionShape] {
  const filePath = path.join(rootDir, SPEC_DIR, feature, 'requirements.md');
  const fromCoverage = shapeOf(() => {
    const requirements = extractRequirements(feature, filePath);
    return {
      criteria: requirements.flatMap((requirement) => [
        ...requirement.acceptanceCriteria.map(
          (criterion) => `${requirement.id}.${criterion.number}`
        ),
        ...requirement.retiredAcceptanceCriteria.map(
          (criterion) => `${requirement.id}.${criterion.number}(墓標)`
        ),
      ]),
      titles: requirements.map((requirement) => `${requirement.id}='${requirement.title}'`),
    };
  });
  const fromExclusions = shapeOf(() => {
    const catalogue = loadRequirementCatalogue(feature, rootDir);
    return {
      criteria: [
        ...catalogue.criteria.keys(),
        ...[...catalogue.retiredCriteria.keys()].map((id) => `${id}(墓標)`),
      ],
      titles: [...catalogue.requirementTitles.entries()].map(([id, title]) => `${id}='${title}'`),
    };
  });
  return [fromCoverage, fromExclusions];
}

/** 二つの抽出結果の食い違いを挙げる（順序も含めて比べる） */
function diffExtraction(
  label: string,
  fromCoverage: ExtractionShape,
  fromExclusions: ExtractionShape
): string[] {
  const failures: string[] = [];
  if (fromCoverage.thrown !== fromExclusions.thrown) {
    failures.push(
      `${label}: 例外の有無が食い違う（被覆率側 ${fromCoverage.thrown ?? 'なし'} / 除外側 ${fromExclusions.thrown ?? 'なし'}）`
    );
    return failures;
  }
  const criteriaDiff = [
    ...fromCoverage.criteria.filter((id) => !fromExclusions.criteria.includes(id)),
    ...fromExclusions.criteria.filter((id) => !fromCoverage.criteria.includes(id)),
  ];
  if (criteriaDiff.length > 0 || fromCoverage.criteria.length !== fromExclusions.criteria.length) {
    failures.push(
      `${label}: 受入基準の集合が食い違う（被覆率側 ${fromCoverage.criteria.length} 件 / 除外側 ${fromExclusions.criteria.length} 件${criteriaDiff.length > 0 ? ` / 片側にしか無い: ${criteriaDiff.slice(0, 5).join(', ')}` : ''}）`
    );
  }
  const titleDiff = [
    ...fromCoverage.titles.filter((title) => !fromExclusions.titles.includes(title)),
    ...fromExclusions.titles.filter((title) => !fromCoverage.titles.includes(title)),
  ];
  if (titleDiff.length > 0 || fromCoverage.titles.length !== fromExclusions.titles.length) {
    failures.push(
      `${label}: 要件の題が食い違う（${titleDiff.slice(0, 5).join(' / ') || '件数のみ'}）`
    );
  }
  return failures;
}

/** 合成の要件定義書を一時ディレクトリへ置いて、両抽出器へ同じものを与える */
function withRequirementsDocument(
  document: string,
  body: (rootDir: string, feature: string) => void
): void {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-extract-'));
  try {
    const feature = 'probe';
    const dir = path.join(rootDir, SPEC_DIR, feature);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'requirements.md'), document, 'utf-8');
    body(rootDir, feature);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

/**
 * 際どい書式の資料
 *
 * いずれもタスク 115.190 で実測した「かつて両抽出器が食い違っていた形」である。
 * 実データには現れないため、実物を流すだけでは食い違いを検出できない。
 */
const EXTRACTION_PROBES: ReadonlyArray<{
  name: string;
  document: string;
  expectCriteria: string[];
  mustThrow?: boolean;
}> = [
  {
    // かつて: 被覆率側は parseInt で REQ-1.5、除外側は生の文字で REQ-1.05
    name: '番号のゼロ詰め（05.）は十進で正規化する',
    document: ['### 要件1: 題', '', '#### 受入基準', '', '1. あ', '05. い', ''].join('\n'),
    expectCriteria: ['REQ-1.1', 'REQ-1.5'],
  },
  {
    // かつて: 被覆率側は truthy 判定でヘッダーを読み落とし、続く受入基準を直前の要件へ付け替えた
    name: '題が空の要件ヘッダーも要件として読む',
    document: [
      '### 要件1: 題',
      '',
      '#### 受入基準',
      '',
      '1. あ',
      '',
      '### 要件2:',
      '',
      '#### 受入基準',
      '',
      '1. い',
      '',
    ].join('\n'),
    expectCriteria: ['REQ-1.1', 'REQ-2.1'],
  },
  {
    name: '枝つき番号（1a.）は受入基準として読まない',
    document: ['### 要件1: 題', '', '#### 受入基準', '', '1. あ', '1a. い', ''].join('\n'),
    expectCriteria: ['REQ-1.1'],
  },
  {
    name: '取り消し線の受入基準は墓標として分ける',
    document: ['### 要件1: 題', '', '#### 受入基準', '', '1. ~~あ~~', '2. い', ''].join('\n'),
    expectCriteria: ['REQ-1.2', 'REQ-1.1(墓標)'],
  },
  {
    // かつて: 被覆率側は二件とも分母へ積み（水増し）、除外側は後勝ちで一件に潰した（黙って欠落）
    name: '受入基準の番号が重複する要件定義書は赤くする（第3原則）',
    document: ['### 要件1: 題', '', '#### 受入基準', '', '1. あ', '1. い', ''].join('\n'),
    expectCriteria: [],
    mustThrow: true,
  },
  {
    // かつて: 被覆率側は二件の要件として並べ、除外側は題を上書きした
    name: '要件番号が重複する要件定義書は赤くする（第3原則）',
    document: [
      '### 要件1: 題A',
      '',
      '#### 受入基準',
      '',
      '1. あ',
      '',
      '### 要件1: 題B',
      '',
      '#### 受入基準',
      '',
      '2. い',
      '',
    ].join('\n'),
    expectCriteria: [],
    mustThrow: true,
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

// ----------------------------------------------------------------------------
// 対照の母集団が空でないことを見る道具（タスク 115.222）
//
// 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。
// これは「何も主張していない」状態であり、前提の崩壊として赤くしなければならない
// （AI運用7原則 第3原則）。実測（115.222）: `MUST_REJECT` を空にすると自己検査は
// 63/63 から 26/26 の合格へ落ち、`MUST_ACCEPT` を空にした側だけが 1/56 で赤くなった。
// 片側しか赤くならない非対称は、同じ文言の関門を全ての母集団へ機械的に置くことで解いた。
// ----------------------------------------------------------------------------

/** 空になっている母集団を挙げる（走査の前に呼び、空が一つでもあれば走らせない） */
function emptyPopulationFailures(
  populations: ReadonlyArray<{ name: string; size: number }>
): string[] {
  // 渡す一覧そのものを空にされたら、この関門が何も見ていない。回帰を一段で断つ。
  if (populations.length === 0) {
    return ['母集団の一覧そのものが空（関門が何も見ていない）'];
  }
  return populations
    .filter((population) => population.size === 0)
    .map((population) => `${population.name}が 0 件（対照の母集団が空）`);
}

// ----------------------------------------------------------------------------
// 対照が「実物をそのまま流すだけ」になっていないかを見る道具（タスク 115.191）
//
// 変異を伴わない対照は、先行する『リポジトリの実物』の対照と同じことしか言っておらず、
// 独自の担保を一切持たない。陰性対照でそれが起きると「緩めすぎていないこと」を見る側の
// 対照が静かに減り、検査を緩める変更が無言で通る。前提の assert だけを置いて素材を
// 書き換えない形も同じ空振りである（115.191 以前の「機能名を冠さない旧来の識別子」が
// これであった）。
// ----------------------------------------------------------------------------

/** 対照が入力に手を加えると宣言しているか（宣言の有無だけを見る） */
function declaresMutation(testCase: Case): boolean {
  return (
    testCase.mutate !== undefined ||
    testCase.mutateSchema !== undefined ||
    testCase.rawDocument !== undefined ||
    testCase.omitSchema === true
  );
}

/** 宣言した変異が実物を実際に変えているか（直列化して前後を比べる） */
function ineffectiveMutationsOf(testCase: Case): string[] {
  const failures: string[] = [];
  if (testCase.mutate) {
    const document = loadReal();
    const before = JSON.stringify(document);
    testCase.mutate(document);
    if (JSON.stringify(document) === before) {
      failures.push(`${testCase.name}: mutate が実物を一切変えていない（実物を流すだけの対照）`);
    }
  }
  if (testCase.mutateSchema) {
    const schema = loadRealSchema();
    const before = JSON.stringify(schema);
    testCase.mutateSchema(schema);
    if (JSON.stringify(schema) === before) {
      failures.push(`${testCase.name}: mutateSchema がスキーマを一切変えていない`);
    }
  }
  return failures;
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

  // --------------------------------------------------------------------
  // 代替検証の被覆範囲の判定そのもの（タスク 115.189）
  //
  // 上の陽性対照は `run()` を通すため、列挙の切り出しが壊れて常に空を返しても
  // 「実物が通る」という陰性対照だけは成立してしまう。切り出しと照合の規則を
  // 直接固定し、併せて実データで空振りしていないことを主張する。
  // --------------------------------------------------------------------
  {
    name: '中黒の列挙を項目へ切り出す（助詞・活用語尾で止める）',
    run: () => {
      const failures: string[] = [];
      const expectations: Array<{ text: string; expected: string[] }> = [
        {
          text: 'The Site Survey Service shall テキストのフォントサイズ・色・背景色をカスタマイズ可能にする',
          expected: ['フォントサイズ', '色', '背景色'],
        },
        {
          // 短い括弧書きの注記は項目の切り出しの前に落とす
          text: 'then the 数量表管理システム shall エラーメッセージを表示し、幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力を求める',
          expected: ['幅', '奥行き', '高さ'],
        },
        {
          // 活用語尾（し・て）で止めないと左端が「対して削除」まで伸びる
          text: 'the 数量表管理システム shall 選択された全ての項目に対して削除・コピー・移動操作を実行する',
          expected: ['削除', 'コピー', '移動操作'],
        },
        {
          text: 'The システム shall 受領見積書の削除時に論理削除を行う',
          expected: [],
        },
      ];
      for (const { text, expected } of expectations) {
        const actual = extractEnumeratedElements(text);
        if (actual.join('|') !== expected.join('|')) {
          failures.push(`切り出しがずれた: [${actual.join('|')}]（期待 [${expected.join('|')}]）`);
        }
      }
      return failures;
    },
  },
  {
    name: '末尾の一般名詞を落とした形でも名指しとみなす（移動操作 と 移動）',
    run: () => {
      const failures: string[] = [];
      if (!namesElement('移動操作', '一括削除・コピー・移動が正しく動作することを確認')) {
        failures.push('「移動操作」を「移動」で名指ししていると判定できていない');
      }
      if (namesElement('移動操作', '削除とコピーだけを確認')) {
        failures.push('述べていない要素を名指しと誤判定した');
      }
      return failures;
    },
  },
  {
    name: '照合する相手は代替検証の全欄であり、題と理由は含めない',
    run: () => {
      const failures: string[] = [];
      const criterionText = 'The システム shall フォントサイズ・色・背景色をカスタマイズ可能にする';

      const inThreshold = checkAlternativeCoverage({
        exclusions: [
          {
            id: 'x/REQ-1.1',
            criterionText,
            alternativeVerification: {
              method: 'unit-test',
              tool: 'Vitest',
              description: 'フォントサイズを変更できることを確認',
              threshold: 'style: 色・背景色',
            },
          },
        ],
      });
      if (inThreshold.length !== 0) {
        failures.push(`閾値の欄で述べた要素を欠落と誤断した（${inThreshold.length}件）`);
      }

      const inTitleOnly = checkAlternativeCoverage({
        exclusions: [
          {
            id: 'x/REQ-1.1',
            title: 'フォントサイズ・色・背景色のカスタマイズ',
            reason: '色と背景色は別途確認する',
            criterionText,
            alternativeVerification: {
              method: 'unit-test',
              tool: 'Vitest',
              description: 'フォントサイズを変更できることを確認',
            },
          },
        ],
      });
      if (inTitleOnly.length !== 1) {
        failures.push(
          `題と理由だけが述べている状態を通した（${inTitleOnly.length}件。1件であるべき）`
        );
      }

      const noEnumeration = checkAlternativeCoverage({
        exclusions: [
          {
            id: 'x/REQ-1.2',
            criterionText: 'The システム shall 受領見積書の削除時に論理削除を行う',
            alternativeVerification: { method: 'unit-test', tool: 'Vitest', description: '検証' },
          },
        ],
      });
      if (noEnumeration.length !== 0) {
        failures.push(`列挙が無い原文に対して ${noEnumeration.length} 件を挙げた`);
      }
      return failures;
    },
  },
  {
    // 判定が実データに当たっていること。列挙を持つ除外が一件も読めていなければ、
    // この検査は在るだけで何も見ていない。
    //
    // **母集団の下限を定数で置いてはならない。** かつては `< 10` を失敗としていたが、
    // 除外の取り下げは本検査自身が推奨する営みであり、母集団は正当に減る。
    // タスク 100.5 が `quantity-table-generation/REQ-26.6` と `REQ-26.7`（いずれも
    // 原文が中黒で列挙する）を判定を置いたうえで取り下げた結果、実データは 11 件から
    // 9 件へ減り、**何も壊れていないのに下限が落ちた**（2026-09-18 に一時 worktree で
    // 基線 `56a6a164` の 11 件を実測）。定数を取り下げのたびに下げ直す運用は、
    // ラチェットを名ばかりにするか、正当な取り下げを妨げるかのどちらかにしかならない。
    //
    // 代わりに「走査が空振りしていないこと」だけを、**対照が現に使う探針が実データから
    // 見つかること**で確かめる。走査が壊れれば `enumerationProbeEntry` が送出し、
    // 陽性対照39件も同時に落ちる（AI運用7原則 第3原則）。
    name: '実データに列挙を持つ除外があり判定が空振りしていない',
    run: () => {
      const document = JSON.parse(fs.readFileSync(REAL_EXCLUSIONS, 'utf-8')) as Json;
      const withEnumeration = entries(document).filter(
        (entry) => extractEnumeratedElements(entry.criterionText as string).length >= 2
      );
      if (withEnumeration.length === 0) {
        return [
          '中黒で二つ以上を列挙する原文を持つ除外が一件も読めていない（走査が壊れている疑い）',
        ];
      }
      // 陽性対照が変異を当てる相手が実在すること。無ければここで送出する。
      const probe = enumerationProbeEntry(document);
      const elements = extractEnumeratedElements(probe.criterionText as string);
      if (elements.length < 2) {
        return [
          `探針 ${probe.id as string} の原文から列挙が ${elements.length} 件しか読めていない（走査が壊れている疑い）`,
        ];
      }
      return [];
    },
  },
  // --------------------------------------------------------------------------
  // 要件定義書の抽出規則が一箇所にしか無いこと（タスク 115.190）
  // --------------------------------------------------------------------------
  //
  // 除外が指す単位（loadRequirementCatalogue）と被覆率が数える単位
  // （check-requirement-coverage.ts の extractRequirements）は同一でなければならない。
  // かつて両者は規則を各自に写し取っており、片方だけを変えても
  // check:req-exclusions / :selftest / check:req-coverage:selftest / type-check / lint は
  // すべて通った（タスク 115.190 で実測）。規則は scripts/requirement-document.ts へ
  // 集約したため、以下の三つで「集約が保たれていること」と「両者の出力が一致すること」を固定する。
  {
    name: '抽出規則の複製が二箇所へ戻っていない（共有モジュールが唯一の担い手である）',
    run: () => {
      const failures: string[] = [];
      // 前提が崩れたら黙って素通りさせない（AI運用7原則 第3原則）。
      // 母集団が空なら以下の走査は空回りで緑になる。
      const empty = emptyPopulationFailures([
        { name: '抽出規則の断片', size: EXTRACTION_RULE_FRAGMENTS.length },
        { name: '抽出規則の消費側', size: EXTRACTION_RULE_CONSUMERS.length },
      ]);
      if (empty.length > 0) return empty;
      const shared = fs.readFileSync(path.join(SCRIPTS_DIR, SHARED_SCANNER_BASENAME), 'utf-8');
      // 断片が共有モジュールから消えていれば、以下の「消費側に無い」は自明に成り立ってしまう。
      const missing = EXTRACTION_RULE_FRAGMENTS.filter((fragment) => !shared.includes(fragment));
      if (missing.length > 0) {
        return [
          `共有モジュール ${SHARED_SCANNER_BASENAME} に抽出規則が見当たらない（対照が空振りしている）: ${missing.join(' / ')}`,
        ];
      }
      for (const basename of EXTRACTION_RULE_CONSUMERS) {
        const source = fs.readFileSync(path.join(SCRIPTS_DIR, basename), 'utf-8');
        if (!source.includes(`from './${SHARED_SCANNER_BASENAME.replace(/\.ts$/, '.js')}'`)) {
          failures.push(`${basename} が ${SHARED_SCANNER_BASENAME} を取り込んでいない`);
        }
        const copied = EXTRACTION_RULE_FRAGMENTS.filter((fragment) => source.includes(fragment));
        if (copied.length > 0) {
          failures.push(`${basename} に抽出規則の複製が戻っている: ${copied.join(' / ')}`);
        }
      }
      return failures;
    },
  },
  {
    name: '両抽出器が実データで同じ受入基準・同じ題を返す',
    run: () => {
      const failures: string[] = [];
      const features = discoverFeatureNames(ROOT);
      if (features.length === 0) {
        return ['機能が一件も見つからない（対照が空振りしている）'];
      }
      let compared = 0;
      for (const feature of features) {
        const [fromCoverage, fromExclusions] = extractedPairFor(feature);
        compared += fromCoverage.criteria.length;
        // 双方が同じ例外を投げる場合、食い違いは無いが実データが読めていない。
        // 「一致した」で済ませると、要件定義書の番号の重複が黙って通る（AI運用7原則 第3原則）。
        if (fromCoverage.thrown !== undefined || fromExclusions.thrown !== undefined) {
          failures.push(
            `${feature}: 実データの読み取りが例外になった（${fromCoverage.thrown ?? fromExclusions.thrown}）`
          );
          continue;
        }
        failures.push(...diffExtraction(feature, fromCoverage, fromExclusions));
      }
      if (compared === 0) {
        return ['受入基準が一件も読めていない（対照が空振りしている）'];
      }
      return failures;
    },
  },
  {
    name: '両抽出器が際どい書式でも一致する（ゼロ詰め・空の題・枝つき番号・墓標・重複）',
    run: () => {
      const failures: string[] = [];
      const empty = emptyPopulationFailures([
        { name: '際どい書式の探り群', size: EXTRACTION_PROBES.length },
      ]);
      if (empty.length > 0) return empty;
      for (const probe of EXTRACTION_PROBES) {
        withRequirementsDocument(probe.document, (root, feature) => {
          const [fromCoverage, fromExclusions] = extractedPairFor(feature, root);
          failures.push(...diffExtraction(probe.name, fromCoverage, fromExclusions));
          if (probe.mustThrow) {
            if (!fromCoverage.thrown || !fromExclusions.thrown) {
              failures.push(
                `${probe.name}: 番号の重複を黙って通した（被覆率側 thrown=${fromCoverage.thrown} / 除外側 thrown=${fromExclusions.thrown}）`
              );
            }
            return;
          }
          if (fromCoverage.thrown ?? fromExclusions.thrown) {
            failures.push(
              `${probe.name}: 読めるはずの文書で例外になった（${fromCoverage.thrown ?? fromExclusions.thrown}）`
            );
            return;
          }
          const actual = fromCoverage.criteria.join(', ');
          if (actual !== probe.expectCriteria.join(', ')) {
            failures.push(
              `${probe.name}: 受入基準が期待と違う（期待 [${probe.expectCriteria.join(', ')}] / 実際 [${actual}]）`
            );
          }
        });
      }
      return failures;
    },
  },
  // --------------------------------------------------------------------------
  // 機能名の探索規則が一箇所にしか無いこと（タスク 115.221）
  // --------------------------------------------------------------------------
  //
  // 115.190 は抽出規則（要件と受入基準の単位）を共有モジュールへ寄せたが、機能名の探索は
  // 二箇所の複製のまま残していた。探索は「どの要件定義書を読むか」を決める規則であり、
  // 片方だけが機能を見落とせば、被覆率の分母と除外が指す単位は条文の単位が同じでも
  // ずれる（機能ごと落ちる）。規則は scripts/requirement-document.ts へ集約したため、
  // 以下の三つで「集約が保たれていること」と「両者の出力が一致すること」を固定する。
  {
    name: '機能名の探索規則の複製が二箇所へ戻っていない（共有モジュールが唯一の担い手である）',
    run: () => {
      const failures: string[] = [];
      // 母集団が空なら以下の走査は空回りで緑になる。前提の崩壊は失敗として挙げる
      // （AI運用7原則 第3原則）。
      const empty = emptyPopulationFailures([
        { name: '探索規則の断片', size: DISCOVERY_RULE_FRAGMENTS.length },
        { name: '探索規則の消費側', size: DISCOVERY_RULE_CONSUMERS.length },
      ]);
      if (empty.length > 0) return empty;
      // 断片が担い手から消えていれば、以下の「消費側に無い」は自明に成り立つ。
      // 担い手は断片ごとに引く（スペックの根だけは spec-directory.ts が持つ。タスク 115.269）
      const ownerSources = new Map<string, string>();
      const missing: string[] = [];
      for (const fragment of DISCOVERY_RULE_FRAGMENTS) {
        const ownerName = DISCOVERY_RULE_FRAGMENT_OWNERS[fragment] ?? SHARED_SCANNER_BASENAME;
        let ownerSource = ownerSources.get(ownerName);
        if (ownerSource === undefined) {
          const ownerPath = path.join(SCRIPTS_DIR, ownerName);
          if (!fs.existsSync(ownerPath)) {
            return [`探索規則の担い手 ${ownerName} が無い（対照が空振りしている）`];
          }
          ownerSource = fs.readFileSync(ownerPath, 'utf-8');
          ownerSources.set(ownerName, ownerSource);
        }
        if (!ownerSource.includes(fragment)) {
          missing.push(`${fragment}（担い手 ${ownerName}）`);
        }
      }
      if (missing.length > 0) {
        return [`探索規則が担い手に見当たらない（対照が空振りしている）: ${missing.join(' / ')}`];
      }
      for (const basename of DISCOVERY_RULE_CONSUMERS) {
        const source = fs.readFileSync(path.join(SCRIPTS_DIR, basename), 'utf-8');
        if (!source.includes(`from './${SHARED_SCANNER_BASENAME.replace(/\.ts$/, '.js')}'`)) {
          failures.push(`${basename} が ${SHARED_SCANNER_BASENAME} を取り込んでいない`);
        }
        const copied = DISCOVERY_RULE_FRAGMENTS.filter((fragment) => source.includes(fragment));
        if (copied.length > 0) {
          failures.push(`${basename} に探索規則の複製が戻っている: ${copied.join(' / ')}`);
        }
      }
      return failures;
    },
  },
  {
    name: '両者の機能名探索が実データで同じ機能名を返す',
    run: () => {
      let fromCoverage: string[];
      let fromExclusions: string[];
      try {
        [fromCoverage, fromExclusions] = discoveredPairFor(ROOT);
      } catch (error) {
        return [`実データの探索が例外になった（${(error as Error).message}）`];
      }
      if (fromExclusions.length === 0) {
        return ['機能が一件も見つからない（対照が空振りしている）'];
      }
      if (fromCoverage.join(', ') !== fromExclusions.join(', ')) {
        return [
          `実データで機能名が食い違う（被覆率側 [${fromCoverage.join(', ')}] / 除外側 [${fromExclusions.join(', ')}]）`,
        ];
      }
      return [];
    },
  },
  {
    name: '両者の機能名探索が際どい構成でも一致する（doc 無し・直下のファイル・symlink・孫・隠し）',
    run: () => {
      const failures: string[] = [];
      const empty = emptyPopulationFailures([
        { name: '際どい構成の探り群', size: DISCOVERY_PROBES.length },
      ]);
      if (empty.length > 0) return empty;
      for (const probe of DISCOVERY_PROBES) {
        withSpecsTree(probe, (rootDir) => {
          let fromCoverage: string[];
          let fromExclusions: string[];
          try {
            [fromCoverage, fromExclusions] = discoveredPairFor(rootDir);
          } catch (error) {
            failures.push(`${probe.name}: 探索が例外になった（${(error as Error).message}）`);
            return;
          }
          if (fromCoverage.join(', ') !== fromExclusions.join(', ')) {
            failures.push(
              `${probe.name}: 機能名が食い違う（被覆率側 [${fromCoverage.join(', ')}] / 除外側 [${fromExclusions.join(', ')}]）`
            );
            return;
          }
          // 一致していても規則そのものが変わっていれば分母が動く。期待の並びまで見る。
          if (fromCoverage.join(', ') !== probe.expect.join(', ')) {
            failures.push(
              `${probe.name}: 機能名が期待と違う（期待 [${probe.expect.join(', ')}] / 実際 [${fromCoverage.join(', ')}]）`
            );
          }
        });
      }
      return failures;
    },
  },
  {
    // 対照群そのものが消える破壊を機構で赤くする（タスク 115.222）。
    // 115.191 が置いた次の対照は、`MUST_ACCEPT` を空にすると「変異を宣言しない陰性対照が
    // 0 件ある」で赤くなる一方、`MUST_REJECT` を空にすると走査が空回りして緑で通った
    // （実測: 63/63 合格 → 26/26 合格。2026-09-01）。母集団が空の検査は何も主張して
    // いないため、前提の崩壊として赤くする（AI運用7原則 第3原則）。要約行の「陽性対照 0」は
    // 人が読んだ場合にしか効かない。
    //
    // **下限をどこに置くか。** 実測の現況（陽性 37・陰性 7）を下限に貼ると、同じ検査を狙う
    // 重複した対照を減らす正当な変更まで止まる。一方「空でないこと」だけでは 37 件を 1 件へ
    // 削る破壊が無言で通る。そこで件数でなく**構造**を下限に置く。
    //
    // - 陽性側: 本体が挙げうる検査の語彙（`VIOLATION_CHECKS`）を陽性対照が全て名指しして
    //   いること。空にする破壊も 1 件へ削る破壊も赤くなり、同じ検査を狙う重複を減らす変更は
    //   通る。語彙は本体の型の出所そのものなので、検査を増減させれば下限も自動で追随する。
    // - 陰性側: 語彙に相当するものが無いため構成で置く。無変異の『リポジトリの実物』が
    //   ちょうど 1 件（次の対照が担う）に加え、**変異を伴う陰性対照が 1 件以上**あること。
    //   実物 1 件だけへ削る破壊はここで止まる。**限界**: 7 件から 2 件へ削る破壊は止まらない。
    //   陰性側には下限を導ける語彙が無く、任意の件数を貼るのは根拠が無いためである。
    //
    // **この対照自身が `MECHANISM_CASES` の要素であったため、配列ごと空にすると一緒に消えた**
    // （タスク 115.304 が実測。同タスクが関門を配列の外側——`main()` の中、確認の実行より前——へ
    // 置き直し、件数の下限を数で貼った。上の「下限をどこに置くか」の判断は撤回していない。
    // 二つは重ねて掛かる。詳しくは下の「対照群そのものが在ることの関門」の節を見よ）。
    name: '対照群の母集団が下限を満たす（陽性は検査の語彙を全て名指し／陰性は変異を伴う対照を持つ）',
    run: () => {
      // 語彙が空なら下の「名指ししていない検査」は自明に 0 件になる。関門自身の真空も塞ぐ。
      const empty = emptyPopulationFailures([
        { name: '陽性対照', size: MUST_REJECT.length },
        { name: '陰性対照', size: MUST_ACCEPT.length },
        { name: '本体が挙げうる検査の語彙', size: VIOLATION_CHECKS.length },
      ]);
      if (empty.length > 0) return empty;

      const failures: string[] = [];
      const named = new Set(
        MUST_REJECT.map((testCase) => testCase.expectCheck).filter(
          (check): check is ViolationCheck => check !== undefined
        )
      );
      const unnamed = VIOLATION_CHECKS.filter((check) => !named.has(check));
      if (unnamed.length > 0) {
        failures.push(
          `陽性対照が一件も名指ししていない検査がある（下限割れ）: ${unnamed.join(' / ')}`
        );
      }
      if (!MUST_ACCEPT.some((testCase) => declaresMutation(testCase))) {
        failures.push('変異を伴う陰性対照が 0 件（実物を流すだけの対照しか残っていない）');
      }
      return failures;
    },
  },
  {
    // 「実物をそのまま流すだけ」の対照が紛れ込んでいないことを機械で確かめる
    // （タスク 115.191）。無変異が許されるのは先頭に置く『リポジトリの実物』
    // ちょうど一件だけであり、それ以外は実物へ実際に差分を作らなければならない。
    name: 'すべての対照が実物へ実際に変異を加えている（無変異は実物の対照ちょうど一件）',
    run: () => {
      const failures: string[] = [];

      const withoutMutation = MUST_ACCEPT.filter((testCase) => !declaresMutation(testCase));
      if (withoutMutation.length !== 1) {
        failures.push(
          `変異を宣言しない陰性対照が ${withoutMutation.length} 件ある（『リポジトリの実物』ちょうど1件であるべき）: ${withoutMutation.map((testCase) => testCase.name).join(' / ') || 'なし'}`
        );
      } else if (withoutMutation[0] !== MUST_ACCEPT[0]) {
        failures.push(
          `変異を宣言しない陰性対照が先頭に無い（実際: ${withoutMutation[0]?.name ?? '(不明)'}）`
        );
      }

      const rejectWithoutMutation = MUST_REJECT.filter((testCase) => !declaresMutation(testCase));
      if (rejectWithoutMutation.length > 0) {
        failures.push(
          `変異を宣言しない陽性対照がある（壊し方を注入していない）: ${rejectWithoutMutation.map((testCase) => testCase.name).join(' / ')}`
        );
      }

      for (const testCase of [...MUST_REJECT, ...MUST_ACCEPT]) {
        failures.push(...ineffectiveMutationsOf(testCase));
      }

      return failures;
    },
  },
  {
    // 関門そのものを合成の対照群で確かめる（タスク 115.304）。実データの群は常に下限ちょうど
    // であるため、実データだけを流す対照は空回りする（115.300 の教訓）。合成の値を与える。
    name: '対照群の関門が、空・下限割れ・遊び・極性の消失を挙げる（合成の対照群）',
    run: () => {
      const failures: string[] = [];
      const floors: CensusCounts = { positives: 2, negatives: 1, mechanisms: 1, total: 4 };
      const positive: Case = { name: '合成の陽性対照', mustReject: true };
      const negative: Case = { name: '合成の陰性対照', mustReject: false };
      const mechanism: MechanismCase = { name: '合成の機構の固定', run: () => [] };
      const groupsOf = (
        positives: number,
        negatives: number,
        mechanisms: number
      ): ControlGroup[] => [
        {
          title: '陽性',
          polarised: Array.from({ length: positives }, () => positive),
          mechanisms: [],
        },
        {
          title: '陰性',
          polarised: Array.from({ length: negatives }, () => negative),
          mechanisms: [],
        },
        {
          title: '機構',
          polarised: [],
          mechanisms: Array.from({ length: mechanisms }, () => mechanism),
        },
      ];
      const expect = (
        label: string,
        groups: readonly ControlGroup[],
        want: 'silent' | 'loud',
        fragment?: string
      ): void => {
        const problems = controlPopulationProblems(groups, floors);
        if (want === 'silent') {
          if (problems.length > 0) {
            failures.push(
              `${label}: 何も挙がってはならないのに挙がった（${problems.join(' / ')}）`
            );
          }
          return;
        }
        if (problems.length === 0) {
          failures.push(`${label}: 関門が何も挙げなかった`);
          return;
        }
        if (fragment !== undefined && !problems.some((one) => one.includes(fragment))) {
          failures.push(
            `${label}: 期待した文言「${fragment}」が挙がっていない（実際: ${problems.join(' / ')}）`
          );
        }
      };

      expect('下限ちょうど', groupsOf(2, 1, 1), 'silent');
      expect('群の一覧そのものが空', [], 'loud', '対照群が一つも登録されていません');
      expect('機構の群が空', groupsOf(2, 1, 0), 'loud', '対照群「機構」が空です');
      expect(
        '機構の群が空（極性の側）',
        groupsOf(2, 1, 0),
        'loud',
        '機構の固定が 1 件もありません'
      );
      expect('陽性の群が空', groupsOf(0, 1, 1), 'loud', '陽性対照が 1 件もありません');
      expect('陰性の群が空', groupsOf(2, 0, 1), 'loud', '陰性対照が 1 件もありません');
      expect('陽性が下限割れ', groupsOf(1, 1, 1), 'loud', '陽性対照が 1 件しかありません');
      expect('陽性に遊びが出る', groupsOf(3, 1, 1), 'loud', '遊び 1 件');
      expect(
        '総数だけが痩せる',
        groupsOf(2, 1, 1).slice(0, 2),
        'loud',
        '確認の総数が 3 件しかありません'
      );
      return failures;
    },
  },
  {
    // 開示（印字）側の対照 その1: 整形関数へ合成値を与えて逐語と数値を見る（115.300 の教訓）。
    // 期待は書き下ろす。`MINIMUM_` を展開すると定数の書き換えに期待も追随して恒真になる。
    name: '対照の現況の整形が合成値を逐語のとおり返す（開示の対照）',
    run: () => {
      const line = formatControlCensus(
        { positives: 3, negatives: 5, mechanisms: 7, total: 15 },
        { positives: 2, negatives: 4, mechanisms: 6, total: 12 }
      );
      const expected =
        '📋 対照の現況: 陽性対照 3/2 ・ 陰性対照 5/4 ・ 機構 7/6 ・ 総数 15/12（現況/宣言の下限）';
      if (line !== expected) {
        return [
          `現況行の逐語が食い違う: ${JSON.stringify(line)}（期待 ${JSON.stringify(expected)}）`,
        ];
      }
      return [];
    },
  },
  {
    // 開示（印字）側の対照 その2: 入口の結線を見る（115.300 の教訓の二方向目）。
    // その1 だけでは結線が外れても緑になり、その2 だけでは逐語が静かに書き換わっても緑になる。
    // 自ソースを読むのは、入口を副作用なしに走らせ直せないためである。
    name: '入口が対照の実行より前に関門を呼び、関門が現況行を印字して落とす（結線の対照）',
    run: () => {
      const failures: string[] = [];
      const source = fs.readFileSync(OWN_SOURCE_PATH, 'utf-8');

      const mainAt = source.indexOf('\nfunction main(): void {');
      if (mainAt < 0) return ['入口 main の宣言が見つからない（結線を確かめられない）'];
      const mainBody = source.slice(mainAt);
      const callAt = mainBody.indexOf('\n  guardControlsArePresent(groups);');
      const firstLoopAt = mainBody.indexOf('\n  for (const ');
      if (callAt < 0) {
        failures.push('入口が関門を呼んでいない（深さ 1・文の先頭の呼び出しが無い）');
      }
      if (firstLoopAt < 0) {
        failures.push('入口に対照の走査が見つからない（前提が崩れている）');
      }
      if (callAt >= 0 && firstLoopAt >= 0 && callAt > firstLoopAt) {
        failures.push('関門の呼び出しが対照の走査より後にある（空の対照群でも走ってしまう）');
      }

      // 関門と走査が同じ配列を見ていること（真実が二つに分かれていないこと）。
      // 三つの対照群の配列は、群の宣言でちょうど一度ずつ参照されるのが正しい形である。
      // 二度目の参照が現れたら、走査が群を経由せず module の配列を直に回しているか、
      // 件数を別に数えている疑いがある——是正前の版はまさにその形で真空パスを持っていた。
      for (const name of ['MUST_REJECT', 'MUST_ACCEPT', 'MECHANISM_CASES']) {
        const occurrences = mainBody.split(name).length - 1;
        if (occurrences !== 1) {
          failures.push(
            `入口が ${name} を ${occurrences} 回参照している（群の宣言でちょうど一度であるべき。` +
              '二度以上あると関門の数える対象と走査が回す対象が分かれうる）'
          );
        }
      }

      const guardAt = source.indexOf('\nfunction guardControlsArePresent(');
      if (guardAt < 0) {
        failures.push('関門の宣言が見つからない');
        return failures;
      }
      const guardEnd = source.indexOf('\n}\n', guardAt);
      const guardBody = source.slice(guardAt, guardEnd < 0 ? undefined : guardEnd);
      if (!guardBody.includes('console.log(formatControlCensus(')) {
        failures.push(
          '関門が現況行を印字していない（scripts/list-control-polarity-floors.ts の分類が偽になる）'
        );
      }
      if (!guardBody.includes('process.exit(1);')) {
        failures.push('関門が下限割れで落としていない（印字だけでは関門にならない）');
      }
      return failures;
    },
  },
];

// ============================================================================
// 実行
// ============================================================================

// ============================================================================
// 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.304）
//
// **115.222 は件数の下限を意図して置かなかった。** 同タスクは「実測の現況を下限に貼ると、
// 同じ検査を狙う重複した対照を減らす正当な変更まで止まる」と述べ、代わりに構造
// （`VIOLATION_CHECKS` の全件名指し／変異を伴う陰性対照の存在）を下限に置いた。その判断は
// 陽性対照・陰性対照については機能していた——`MUST_REJECT` を空にすると `❌ 自己検査に
// 失敗しました（1/27 件）` で EXIT=1、`MUST_ACCEPT` を空にすると `❌ 自己検査に失敗しました
// （2/57 件）` で EXIT=1 になる（コミット `2be5b8fc` の作業ツリー、2026-09-06 に実測）。
//
// **しかしその構造の下限は `MECHANISM_CASES` の要素として書かれていた。** 配列ごと空にすると
// 関門も一緒に消える。同じ作業ツリーでの実測: `MECHANISM_CASES` を空にすると
// `✅ 自己検査に合格しました（44/44 件: 陽性対照 37 / 陰性対照 7 / 機構 0）` を出して EXIT=0
// になった（基線は 64/64）。**要約行に `機構 0` と印字しながら通る——件数を印字することは
// 関門ではない。**
//
// そこで 115.252 が 13 本の自己検査へ置いた作法を本ファイルへも当てる。
//   - 関門を対照群の配列の**外側**（`main()` の中、確認の実行より前）に置く。
//     **関門を配列リテラルで持たせない**（要素としても設定としても）。判定の四つの下限も
//     一覧で回さず一件ずつ書き下ろす——一覧にすると、その一覧を空にする同型の穴が開く。
//   - 群ごとの非空・総数の下限・極性の両立を、同じ関門で課す。
//   - 件数の下限は**数**で持つ。数は空にできないため、この変異作用素に構造的に免疫である。
//   - 下限は現況ちょうど（遊びゼロ）で貼る（115.298 の作法）。下回っても上回っても赤くする。
//
// **115.222 の懸念は解いていない。** 遊びゼロの下限は、重複した対照を減らす正当な変更にも
// 定数の書き換えを要求する。それは 115.298 が 13 本すべてへ課した代償と同じであり、本ファイル
// だけ作法を違える根拠は無いと判断した。**塞がないことと書かないことは別である**（115.242）
// ため、この衝突をここに明記する。115.222 が置いた構造の下限は撤去していない——二つは重ねて
// 掛かり、構造の側は「件数を保ったまま同じ検査へ寄せる」痩せ方を止める。
//
// **極性は要素の宣言（`mustReject`）から導き、配列の名前の綴りからは導かない**（115.247 の
// 作法）。`MUST_REJECT` の要素を `mustReject: false` のまま `MUST_ACCEPT` へ移し替えるような
// 書き換えでも、極性の数は宣言に従って動く。
// ============================================================================

/**
 * 陽性対照の件数の下限（タスク 115.304）
 *
 * 現況ちょうど（遊びゼロ）。抽出は
 * `npx tsx scripts/check-requirement-exclusions.selftest.ts | grep -oE '陽性対照 [0-9]+/'`。
 */
const MINIMUM_POSITIVE_CONTROLS = 39;

/**
 * 陰性対照の件数の下限（タスク 115.304）
 *
 * 現況ちょうど（遊びゼロ）。抽出は
 * `npx tsx scripts/check-requirement-exclusions.selftest.ts | grep -oE '陰性対照 [0-9]+/'`。
 */
const MINIMUM_NEGATIVE_CONTROLS = 8;

/**
 * 機構の固定の件数の下限（タスク 115.304）
 *
 * **この下限が本タスクの主目的である。** 115.222 が置いた構造の下限はこの群の要素であり、
 * 群ごと空にすると一緒に消えていた。数で貼れば空にできない。現況ちょうど（遊びゼロ）。
 * 抽出は `npx tsx scripts/check-requirement-exclusions.selftest.ts | grep -oE '機構 [0-9]+/'`。
 */
const MINIMUM_MECHANISM_CASES = 23;

/**
 * 確認の総数の下限（タスク 115.304）
 *
 * 群ごとの下限の和。**総数だけでは片側の消失を捕まえられない**ため群ごとの下限と併せて課す
 * （逆に、群ごとの下限だけでは群の内訳を保ったまま総数を痩せさせる形を捕まえられない）。
 * 現況ちょうど（遊びゼロ）。抽出は
 * `npx tsx scripts/check-requirement-exclusions.selftest.ts | grep -oE '総数 [0-9]+/'`。
 */
const MINIMUM_TOTAL_CASES = 70;

/** 対照の現況（と、宣言した下限）を並べた数の組 */
interface CensusCounts {
  readonly positives: number;
  readonly negatives: number;
  readonly mechanisms: number;
  readonly total: number;
}

/** 宣言した下限（判定と印字が同じ値を見る） */
const DECLARED_FLOORS: CensusCounts = {
  positives: MINIMUM_POSITIVE_CONTROLS,
  negatives: MINIMUM_NEGATIVE_CONTROLS,
  mechanisms: MINIMUM_MECHANISM_CASES,
  total: MINIMUM_TOTAL_CASES,
};

/** 対照群（極性の宣言を持つ群と、持たない機構の群） */
interface ControlGroup {
  readonly title: string;
  /** 極性の宣言（`mustReject`）を持つ対照。機構の群は空 */
  readonly polarised: readonly Case[];
  /** 極性を持たない対照（機構の固定）。極性を持つ群は空 */
  readonly mechanisms: readonly MechanismCase[];
}

/**
 * 群の件数（要素そのものから数える。タスク 115.304 のレビューが実測した真空パスの是正）
 *
 * **群に件数の別勘定を持たせてはならない。** 是正前の版は `size: number` を持ち、関門はその
 * `size` を読む一方で走査は `MECHANISM_CASES` を直に回していた。**真実が二つに分かれていた。**
 * レビュアーの変異——`MECHANISM_CASES` を空にし、群の `size:` を `23` と直書きする一トークンの
 * 編集——で、関門は `📋 対照の現況: 陽性対照 37/37 ・ 陰性対照 7/7 ・ 機構 23/23 ・ 総数 67/67
 * （現況/宣言の下限）` と印字しながら、走査は
 * `✅ 自己検査に合格しました（44/44 件: 陽性対照 37 / 陰性対照 7 / 機構 0）` を出して **EXIT=0**
 * になった（コミット `2be5b8fc` を親とする作業ツリー、2026-09-06 に実測）。**報告件数が縮むのに
 * EXIT=0** であり、115.252 の判定基準に照らして真の真空パスであった。
 *
 * いまは群が要素そのものを持ち、関門が数えるのも `main()` が回すのも同じ配列である。
 * **件数を別に書き込む場所が構造として存在しない。** 加えて、`main()` が三つの対照群の配列を
 * 群の宣言以外の場所で参照していないことを、下の「結線の対照」が自ソースを読んで確かめる。
 */
function sizeOf(group: ControlGroup): number {
  return group.polarised.length + group.mechanisms.length;
}

/**
 * 対照の現況を一行へ整形する（タスク 115.304）
 *
 * **現況と下限の双方を引数で受ける。** 下限を関数の中で定数から読む形にすると、合成値で逐語を
 * 見る対照が定数の書き換えに追随して恒真になる（115.300 の教訓）。
 *
 * `npx tsx scripts/list-control-polarity-floors.ts` がこの行を読む。ラベルの綴り
 * （`陽性対照` / `陰性対照` / `総数`）と `現況/宣言の下限` の並びは、同一覧の取り出しが
 * 依存する逐語である。
 */
function formatControlCensus(actual: CensusCounts, floors: CensusCounts): string {
  return (
    `📋 対照の現況: 陽性対照 ${actual.positives}/${floors.positives} ・ ` +
    `陰性対照 ${actual.negatives}/${floors.negatives} ・ ` +
    `機構 ${actual.mechanisms}/${floors.mechanisms} ・ ` +
    `総数 ${actual.total}/${floors.total}（現況/宣言の下限）`
  );
}

/** 群の一覧から現況を数える（極性は要素の宣言から導く） */
function censusOf(groups: readonly ControlGroup[]): CensusCounts {
  const polarised = groups.flatMap((group) => [...group.polarised]);
  return {
    positives: polarised.filter((one) => one.mustReject).length,
    negatives: polarised.filter((one) => !one.mustReject).length,
    mechanisms: groups.reduce((sum, group) => sum + group.mechanisms.length, 0),
    total: groups.reduce((sum, group) => sum + sizeOf(group), 0),
  };
}

/**
 * 対照群そのものの欠けを挙げる（判定だけを行い、印字も終了もしない）
 *
 * 印字と終了から切り離してあるのは、**合成の対照群を与えて関門自身を確かめる対照**を置く
 * ためである（実データの群は常に下限ちょうどであり、実データだけを流す対照は空回りする。
 * 115.300 の教訓）。
 */
function controlPopulationProblems(
  groups: readonly ControlGroup[],
  floors: CensusCounts
): string[] {
  const problems: string[] = [];

  if (groups.length === 0) {
    problems.push('対照群が一つも登録されていません（この自己検査は何も確かめていません）');
  }
  for (const group of groups) {
    if (sizeOf(group) === 0) {
      problems.push(`対照群「${group.title}」が空です（この群は何も確かめていません）`);
    }
  }

  const census = censusOf(groups);
  if (census.positives === 0) {
    problems.push('陽性対照が 1 件もありません（検出器が何も検出しなくても緑になります）');
  }
  if (census.negatives === 0) {
    problems.push('陰性対照が 1 件もありません（検出器が何にでも反応しても緑になります）');
  }
  if (census.mechanisms === 0) {
    problems.push('機構の固定が 1 件もありません（判定そのものを見る対照が消えています）');
  }

  // 四つの下限は一覧でも補助関数でもなく、一件ずつ書き下ろす。理由は二つある。
  //   (1) 一覧で回す形は、その一覧を空にする同型の穴を新たに開く。
  //   (2) 補助関数へ畳むと、上回る側の報告の綴りの数で対の関門を数える 115.298 の
  //       走査（`grep -hE '（遊び \$\{' scripts/*.selftest.ts`）に対し、宣言 4 件に対して
  //       綴りが 1 件しか現れず、同タスクが機械保証と呼んだ「宣言の数と対の関門の数の一致」が
  //       本ファイルについてだけ崩れる。**他タスクの保証を痩せさせない側へ倒す。**
  if (census.positives < floors.positives) {
    problems.push(
      `陽性対照が ${census.positives} 件しかありません（宣言の下限は ${floors.positives} 件）。` +
        '対照を削ったのなら MINIMUM_POSITIVE_CONTROLS も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298 の作法）
  if (census.positives > floors.positives) {
    problems.push(
      `陽性対照が ${census.positives} 件で、宣言した下限 ${floors.positives} 件を上回ります（遊び ${census.positives - floors.positives} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_POSITIVE_CONTROLS を ${census.positives} 件へ上げてください。`
    );
  }

  if (census.negatives < floors.negatives) {
    problems.push(
      `陰性対照が ${census.negatives} 件しかありません（宣言の下限は ${floors.negatives} 件）。` +
        '対照を削ったのなら MINIMUM_NEGATIVE_CONTROLS も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298 の作法）
  if (census.negatives > floors.negatives) {
    problems.push(
      `陰性対照が ${census.negatives} 件で、宣言した下限 ${floors.negatives} 件を上回ります（遊び ${census.negatives - floors.negatives} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_NEGATIVE_CONTROLS を ${census.negatives} 件へ上げてください。`
    );
  }

  if (census.mechanisms < floors.mechanisms) {
    problems.push(
      `機構の固定が ${census.mechanisms} 件しかありません（宣言の下限は ${floors.mechanisms} 件）。` +
        '対照を削ったのなら MINIMUM_MECHANISM_CASES も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298 の作法）
  if (census.mechanisms > floors.mechanisms) {
    problems.push(
      `機構の固定が ${census.mechanisms} 件で、宣言した下限 ${floors.mechanisms} 件を上回ります（遊び ${census.mechanisms - floors.mechanisms} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_MECHANISM_CASES を ${census.mechanisms} 件へ上げてください。`
    );
  }

  if (census.total < floors.total) {
    problems.push(
      `確認の総数が ${census.total} 件しかありません（宣言の下限は ${floors.total} 件）。` +
        '確認を削ったのなら MINIMUM_TOTAL_CASES も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298 の作法）
  if (census.total > floors.total) {
    problems.push(
      `確認の総数が ${census.total} 件で、宣言した下限 ${floors.total} 件を上回ります（遊び ${census.total - floors.total} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_TOTAL_CASES を ${census.total} 件へ上げてください。`
    );
  }

  return problems;
}

/**
 * 対照群そのものが在ることを、確認の実行より前に確かめる（タスク 115.304）
 *
 * **限界（塞いでいないこと）**: 下限は件数しか見ない。**対照の名前と件数を保ったまま中身を
 * 空洞にする痩せ方は、この関門では捕まらない**（差分にしか現れない）。また `main()` から
 * この呼び出し自体を落とせば関門は走らなくなる——その結線は下の機構の対照が自ソースを読んで
 * 見るが、その対照ごと落とす書き換えは件数の下限が捕まえる（相互に支え合う）。
 */
function guardControlsArePresent(groups: readonly ControlGroup[]): void {
  const census = censusOf(groups);
  // 判定に使うのと同じ値から印字する（判定と一覧が別々の真実を持たないため）
  console.log(formatControlCensus(census, DECLARED_FLOORS));

  const problems = controlPopulationProblems(groups, DECLARED_FLOORS);
  if (problems.length > 0) {
    console.error(
      '❌ 自己検査の対照群そのものが欠けています（この状態で出る「合格」は意味を持ちません）'
    );
    for (const problem of problems) console.error(`   - ${problem}`);
    process.exit(1);
  }
}

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

/** 陽性対照を一件走らせ、失敗の理由を挙げる（空なら合格）。印字も併せて行う */
function positiveFailures(testCase: Case): string[] {
  const { rejected, checks, detail } = evaluate(testCase);
  const fired = [...checks].sort().join(', ');
  if (!rejected) {
    console.log(`  ❌ ${testCase.name} → 弾かれなかった`);
    return [`検出漏れ: ${testCase.name}`];
  }
  // 狙った検査が挙げたことまで確かめる（別の検査に巻き込まれた合格を認めない）
  if (testCase.expectCheck === undefined) {
    console.log(`  ❌ ${testCase.name} → expectCheck 未指定（実際: ${fired}）`);
    return [`陽性対照に expectCheck が無い: ${testCase.name}（実際に挙げた検査: ${fired}）`];
  }
  if (!checks.has(testCase.expectCheck)) {
    console.log(`  ❌ ${testCase.name} → ${testCase.expectCheck} が挙げていない（実際: ${fired}）`);
    return [
      `狙った検査が挙げていない: ${testCase.name}（期待 ${testCase.expectCheck} / 実際 ${fired}）`,
    ];
  }
  console.log(`  ✅ ${testCase.name} [${testCase.expectCheck}] → ${detail}`);
  return [];
}

/** 陰性対照を一件走らせ、失敗の理由を挙げる（空なら合格）。印字も併せて行う */
function negativeFailures(testCase: Case): string[] {
  const { rejected, detail } = evaluate(testCase);
  if (!rejected) {
    console.log(`  ✅ ${testCase.name}`);
    return [];
  }
  console.log(`  ❌ ${testCase.name} → 誤って弾かれた（${detail}）`);
  return [`過検出: ${testCase.name} → ${detail}`];
}

/** 機構の固定を一件走らせ、失敗の理由を挙げる（空なら合格）。印字も併せて行う */
function mechanismFailures(mechanismCase: MechanismCase): string[] {
  const detected = mechanismCase.run();
  if (detected.length === 0) {
    console.log(`  ✅ ${mechanismCase.name}`);
    return [];
  }
  console.log(`  ❌ ${mechanismCase.name} → ${detected.join(' / ')}`);
  return [`機構: ${mechanismCase.name} → ${detected.join(' / ')}`];
}

function main(): void {
  // 対照群は `main()` の中で束ね、確認の実行より前に関門を通す（タスク 115.304）。
  // **群は要素そのものを持ち、件数の別勘定を持たない。** 関門が数えるのも下の走査が回すのも
  // 同じ配列であり、真実が二つに分かれない（レビューが実測した真空パスの是正。`sizeOf` の
  // 注釈に当時の実出力を引いた）。群の一覧を空にしても、いずれかの群を空にしても、
  // 関門が EXIT=1 で落とす。
  const groups: ControlGroup[] = [
    { title: '弾かれなければならない壊し方（陽性対照）', polarised: MUST_REJECT, mechanisms: [] },
    { title: '通らなければならない形（陰性対照）', polarised: MUST_ACCEPT, mechanisms: [] },
    { title: '同居の判定そのもの（機構の固定）', polarised: [], mechanisms: MECHANISM_CASES },
  ];
  guardControlsArePresent(groups);

  const failures: string[] = [];
  let passed = 0;
  // 実際に走らせた確認の数（合否と独立に数える。下の「数えた側と走らせた側の一致」に使う）
  let ran = 0;

  for (const group of groups) {
    console.log(`=== ${group.title} ===`);
    for (const testCase of group.polarised) {
      // 極性は要素の宣言から導く（群の題や配列の位置からは導かない。115.247 の作法）
      const problems = testCase.mustReject
        ? positiveFailures(testCase)
        : negativeFailures(testCase);
      ran += 1;
      if (problems.length === 0) passed += 1;
      failures.push(...problems);
    }
    for (const mechanismCase of group.mechanisms) {
      const problems = mechanismFailures(mechanismCase);
      ran += 1;
      if (problems.length === 0) passed += 1;
      failures.push(...problems);
    }
    console.log('');
  }

  // 要約も関門と同じ `censusOf` から出す（印字と判定が別々の真実を持たないため）
  const census = censusOf(groups);

  // **数えた側と走らせた側が一致しないことを失敗にする（タスク 115.304 のレビューが実測）。**
  // 関門は群を数え、走査は群を回すが、**走査だけを別名の空配列へ差し替える**書き換えは
  // 「群の綴りの回数」を数える結線の対照をすり抜ける。実測（コミット `2be5b8fc` を親とする
  // 作業ツリー、2026-09-06）: module の頂へ `const MECH_VIEW: MechanismCase[] = [];` を置き、
  // 機構の走査を `group.mechanisms` から `MECH_VIEW` へ差し替えると、関門は
  // `📋 対照の現況: … 機構 23/23 ・ 総数 67/67（現況/宣言の下限）` を出し、要約は
  // `✅ 自己検査に合格しました（44/67 件: 陽性対照 37 / 陰性対照 7 / 機構 23）` を出して
  // **EXIT=0** になった。**分子と分母が食い違ったまま合格を名乗っていた。**
  //
  // 数えるのは合否ではなく**走らせた件数**である。合格数で見ると、真に落ちた確認が在るときに
  // この判定まで一緒に鳴り、原因を取り違える報告になる。
  if (ran !== census.total) {
    failures.push(
      `走らせた確認が現況の総数と食い違います（走らせた ${ran} 件 / 現況の総数 ${census.total} 件）。` +
        '関門が数える対象と走査が回す対象が分かれています。'
    );
  }

  if (failures.length > 0) {
    console.error(`❌ 自己検査に失敗しました（${failures.length}/${census.total} 件）`);
    for (const failure of failures) console.error(`   - ${failure}`);
    process.exit(1);
  }

  console.log(
    `✅ 自己検査に合格しました（${passed}/${census.total} 件: 陽性対照 ${census.positives} / 陰性対照 ${census.negatives} / 機構 ${census.mechanisms}）`
  );
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
