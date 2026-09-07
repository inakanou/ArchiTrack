/**
 * @fileoverview E2E対象外の受入基準の定義（e2e/requirement-exclusions.json）の形式検査
 *
 * 除外定義は被覆率の分母から受入基準を外す。除外の一件は「E2Eでは確かめないが、
 * 代わりにこの方法で確かめる」という約束であり、その約束が欠けたり分類が壊れたりすると、
 * 被覆の主張は静かに空洞化する。にもかかわらず、この定義は長らく
 * `JSON.parse(...) as ExclusionsFile` という無検査のキャストだけで読まれていた。
 * `$schema` は e2e/requirement-exclusions.schema.json を指していたが、その参照先は
 * リポジトリに存在せず、形式検証は一度も行われていなかった（タスク 115.144 で判明）。
 *
 * 本スクリプトはスキーマを実在させ、定義がそのスキーマに適合することを機械的に確かめる。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-exclusions.ts [options]
 *   npm run check:req-exclusions
 *
 * 検査するもの:
 *   1. `$schema` が指す先が実在すること（ダングリング参照の禁止）
 *   2. 定義がスキーマに適合すること（必須項目・型・書式・未知の項目の禁止）
 *   3. スキーマ単体では表せない不変条件
 *      - 受入基準の識別子が重複しないこと（機能名の有無で正規化してから比べる）
 *      - 各除外の `category` が `categories` に定義済みであること
 *      - `categories` に定義しながらどの除外からも使われない分類が無いこと
 *      - `summary.totalExclusions` と `summary.byCategory` が実際の件数と一致すること
 *      - 代替検証を持たない除外（`method: "none"`）が、`verificationPhase` が
 *        `e2e-testing` の分類にしか置かれないこと（タスク 115.314 で追加）
 *   4. 識別子と内容の対応（タスク 115.167 で追加）
 *      - `id` が指す受入基準が要件定義書に実在すること
 *      - 指す受入基準が取り消し線（`~~`）で無効化されていないこと
 *        （タスク 115.187 で扱いを改めた。撤廃済みの受入基準は被覆率の分母に載らないため、
 *        区分を `removed-from-spec` に整えるのではなく、除外そのものを取り下げる）
 *      - `requirement` 欄の要件番号と題が要件定義書と一致すること
 *      - `criterionText` が要件定義書の当該受入基準の本文と一字一句一致すること
 *   5. 除外の宣言と被覆印の同居（タスク 115.186 で追加）
 *      - 「E2Eでは確かめない」と宣言した受入基準を `e2e/specs` の被覆印が名乗らないこと
 *      - 例外は未実装を固定するラチェット（`test.fail()`）との同居だけであること
 *   6. 代替検証が受入基準を覆う範囲（タスク 115.189 で追加）
 *      - 原文が中黒（`・`）で列挙する要素を、掲げた代替検証がすべて名指ししていること
 *      - 部分被覆を「除外」と呼ぶと、覆われていない要素がどの指標にも現れなくなる
 *
 * 未実装かつ方針未決を表す区分を置かないという判断（タスク 115.314）:
 *   `pending-implementation` の定義文は長らく「機能実装済みだがE2Eテストが未作成」と
 *   述べていたが、実データはそうではなかった——同区分の 14 件のうち 11 件は条文の実装が
 *   本番に無い（2026-09-07 に実測。内訳と再現は
 *   `.kiro/specs/site-survey/design.md` のタスク 115.314 の節にある）。ただし 11 件は
 *   例外なく確定した実装決定と対になっており、反例は零件であった。すなわち運用は
 *   「未実装だが実装は決まっている」を表しており、定義文だけが実態から遅れていた。
 *   そこで定義文を実態へ合わせ（区分は増やさず）、「実装が無く実装するかどうかも未決」を
 *   表す区分は**置かない**と決めた。除外は分母から外す宣言であり、確かめる対象が存在
 *   しない条文を外すと「E2E対象外」という偽の宣言になる。未被覆のまま列挙されることが
 *   未実装・未決の正直な表現形式である。この判断を機構にしたのが上の不変条件（3）の
 *   末尾二つで、**「未決」を表せる `verificationPhase` の値は無い**。
 *
 * 同居をなぜ検査するか:
 *   除外の一件は「E2Eでは確かめない」という宣言である。同じ番号を `e2e/specs` の被覆印が
 *   名乗っていれば、宣言と実態のどちらかが必ず誤っている。タスク 115.186 の走査では
 *   86件が同居しており、一件ずつ検証の本文を読んで、E2Eが受入基準を主張していた47件は
 *   除外を取り下げ、番号を名乗るだけで受入基準を主張していなかった33件は被覆印を
 *   取り下げ、残る6件は未実装のラチェットとの同居であるため据え置いた。
 *
 *   この86件は、タスク 115.167 が報告した83件の**上位集合**である（3件増えたのではない）。
 *   差は読み取り規則の差であり、115.167 はインラインの被覆印（パターン1〜3）だけを見ていた。
 *   ヘッダー直下の一覧（パターン5。機能名を冠さない `- REQ-N.M:` の行）からしか
 *   印が付いていない3件が本走査で加わった:
 *     - quantity-table-generation/REQ-7.7（e2e/specs/quantity-tables/autocomplete-optimization.spec.ts:16）
 *     - site-survey/REQ-16.2（e2e/specs/site-surveys/site-survey-performance.spec.ts:6）
 *     - site-survey/REQ-22.3（e2e/specs/site-surveys/site-survey-image-rotation.spec.ts:9）
 *   うち REQ-7.7 と REQ-22.3 は条文を実際に主張する検証が在り、除外の側が誤っていた。
 *
 * 識別子と内容の対応をどう機械化したか:
 *   従前この定義は、`id`（番号）と `title` / `reason`（散文）を並べるだけで、両者が
 *   同じ受入基準を指しているかを確かめる手立てを持たなかった。実際、要件定義書へ受入基準を
 *   一件挿入しただけで番号が一つずれ、除外は別の受入基準を分母から外し続けていた
 *   （site-survey/REQ-1.5・1.6 など。タスク 115.167 の走査で判明）。
 *   散文どうしの照合は自然言語の判断になり機械化できないため、対応の担い手を散文から
 *   **原文の逐語複製**へ移した。各除外は `criterionText` に受入基準の本文をそのまま持ち、
 *   検査はそれが要件定義書の当該行と完全一致することだけを見る。番号がずれれば複製は
 *   合わなくなり、検査が落ちる。
 *
 * この検査が捕まえないもの（限界を両方向で述べる）:
 *   `title` / `reason` の散文が `criterionText` と食い違っていても検出しない。両者の
 *   一致は自然言語の判断であり、語の重なりで測る方式は本リポジトリの実データで
 *   誤検出が多すぎた（受入基準の前後3件と比べる方式で 266 件中 36 件を候補として挙げ、
 *   人手で確かめた真の食い違いは 11 件。残る 25 件は「数量表のPDF出力5」のように
 *   題が内容を持たない項目の取り違えであった）。散文の食い違いは、逐語複製が
 *   同じ項目の中に並ぶことで読み手に見えるようにするにとどめる。
 *
 *   同居の検査は `e2e/specs` の被覆印しか見ない。除外が述べるのは「**E2Eでは**確かめない」
 *   であり、`frontend/src` / `backend/src` の単体検証や本番コードが同じ番号を名乗ることは
 *   宣言と矛盾しない（掲げた代替検証そのものが単体検証である除外は実在する）。
 *   逆に、被覆印を掲げていないE2Eが実質的に受入基準を確かめている場合も見つけられない。
 *   同居の有無は印の有無で決まるためである。またラチェットの判定は
 *   「当該のテストの区間に `test.fail()` があるか」までであり、
 *   そのテストの主張が受入基準を本当に確かめているかは見ない。
 *
 * オプション:
 *   --verbose  違反の詳細（値そのもの）を出力する
 *   --json     JSON 形式で出力する
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   定義ファイルやスキーマが見つからない場合は「合格」ではなく失敗として扱う。
 *   除外が一件も無い場合も失敗とする（スキーマの minItems）。パスの変更や実行位置の
 *   誤りで検査が静かに素通りすることを防ぐ。
 *
 * 依存を増やさない:
 *   JSON Schema の検証器は追加せず、本ファイルが使う語彙だけを解釈する小さな検証器
 *   （validateAgainstSchema）を持つ。スキーマが唯一の正であり、規則をコードへ写し取らない。
 *   解釈できない語彙がスキーマに現れた場合は、黙って無視せず違反として報告する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildInlineTagPatterns,
  extractHeaderScopedCoverage,
} from './check-requirement-coverage.js';
import {
  SPEC_DIR,
  discoverFeatureNames as scanFeatureNames,
  requirementsDocumentPath,
  scanRequirementsDocument,
} from './requirement-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

export const EXCLUSIONS_PATH = 'e2e/requirement-exclusions.json';

/**
 * 代替検証を持たないと自ら申告する `method`
 *
 * 除外は「E2Eでは確かめないが、代わりにこの方法で確かめる」という約束であるから、
 * この値は約束の不在の申告である。置ける場所は下の {@link DEFERRED_E2E_PHASE} に限る。
 */
export const PROMISELESS_METHOD = 'none';

/** 「後でE2Eが確かめる」と述べる `verificationPhase` の値 */
export const DEFERRED_E2E_PHASE = 'e2e-testing';

// ============================================================================
// 型定義
// ============================================================================

/**
 * どの検査が挙げた違反か
 *
 * 自己検査の陽性対照が「弾かれたか」ではなく「**狙った検査が**弾いたか」まで見るために置く。
 * これが無いと、注入した欠陥が別の検査に巻き込まれて弾かれたとき、対照は緑のまま通り、
 * 狙った検査を丸ごと無効化しても検出漏れに気づけない（タスク 115.186 のレビューが
 * `checkCriterionCorrespondence` の無効化で実証した遮蔽）。
 *
 * 型でなく `as const` の配列で持つのは、自己検査が**実行時に語彙を数え上げる**ためである
 * （タスク 115.222）。陽性対照の下限を「この語彙をすべて名指しすること」に置くと、
 * 対照群を空にする破壊も 1 件へ削る破壊も機構で赤くなり、なおかつ重複した対照を減らす
 * 正当な変更は通る。型は配列から導くため、語彙と型が食い違うことはない。
 */
export const VIOLATION_CHECKS = [
  /** 定義ファイルそのものが読めない */
  'file',
  /** スキーマの解決とスキーマ適合 */
  'schema',
  /** スキーマ単体では表せない不変条件 */
  'invariant',
  /** 識別子と受入基準の内容の対応 */
  'criterion-correspondence',
  /** 除外の宣言と被覆印の同居 */
  'coverage-tag-coexistence',
  /** 代替検証の説明が原文の列挙を覆う範囲 */
  'alternative-coverage',
] as const;

export type ViolationCheck = (typeof VIOLATION_CHECKS)[number];

export interface Violation {
  /** 違反箇所を指す JSON ポインタ風の経路（例: `exclusions[12].category`） */
  pointer: string;
  /** 何が満たされていないか */
  message: string;
  /** 実際の値（--verbose で出力する） */
  actual?: string;
  /** どの検査が挙げたか（`run` が付ける） */
  check?: ViolationCheck;
}

export interface CheckResult {
  /** 検査した定義ファイルのリポジトリ相対パス */
  file: string;
  /** 適用したスキーマのリポジトリ相対パス */
  schemaFile: string;
  /** 検査した除外の件数 */
  exclusionCount: number;
  violations: Violation[];
}

type Json = unknown;
type JsonObject = Record<string, Json>;

/** スキーマが使ってよい語彙。ここに無い語彙は黙殺せず違反として報告する。 */
const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'minLength',
  'minProperties',
  'minimum',
  'pattern',
]);

// ============================================================================
// 小さな JSON Schema 検証器
// ============================================================================

function isPlainObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: Json): string {
  if (value === undefined) return '(未定義)';
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function typeMatches(value: Json, type: string): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function resolveRef(ref: string, root: JsonObject, pointer: string, out: Violation[]): Json {
  if (!ref.startsWith('#/')) {
    out.push({
      pointer,
      message: `解釈できない $ref です（'#/' で始まる参照のみ扱う）`,
      actual: ref,
    });
    return undefined;
  }
  let current: Json = root;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(current) || !(segment in current)) {
      out.push({ pointer, message: `$ref の参照先がスキーマに存在しません`, actual: ref });
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/**
 * 値をスキーマへ照合する。違反は out へ積む（最初の一件で止めない）。
 */
export function validateAgainstSchema(
  value: Json,
  schema: Json,
  root: JsonObject,
  pointer: string,
  out: Violation[]
): void {
  if (!isPlainObject(schema)) {
    out.push({
      pointer,
      message: 'スキーマの節がオブジェクトではありません',
      actual: describe(schema),
    });
    return;
  }

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      out.push({
        pointer,
        message: `この検証器が解釈できないスキーマ語彙 '${keyword}' が使われています。検証器を拡張してください（黙って素通りさせない）`,
      });
    }
  }

  if (typeof schema.$ref === 'string') {
    const resolved = resolveRef(schema.$ref, root, pointer, out);
    if (resolved !== undefined) {
      validateAgainstSchema(value, resolved, root, pointer, out);
    }
    return;
  }

  if (typeof schema.type === 'string' && !typeMatches(value, schema.type)) {
    out.push({ pointer, message: `型が ${schema.type} ではありません`, actual: describe(value) });
    return;
  }

  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    out.push({
      pointer,
      message: `値が ${describe(schema.const)} と一致しません`,
      actual: describe(value),
    });
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((c) => JSON.stringify(c) === JSON.stringify(value))
  ) {
    out.push({ pointer, message: `許可された値のいずれでもありません`, actual: describe(value) });
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      out.push({
        pointer,
        message: `${schema.minLength} 文字以上である必要があります`,
        actual: describe(value),
      });
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      out.push({
        pointer,
        message: `書式 /${schema.pattern}/ に一致しません`,
        actual: describe(value),
      });
    }
  }

  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    out.push({
      pointer,
      message: `${schema.minimum} 以上である必要があります`,
      actual: describe(value),
    });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      out.push({
        pointer,
        message: `要素が ${schema.minItems} 件以上である必要があります`,
        actual: `${value.length}件`,
      });
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        validateAgainstSchema(item, schema.items, root, `${pointer}[${index}]`, out);
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};

    if (
      typeof schema.minProperties === 'number' &&
      Object.keys(value).length < schema.minProperties
    ) {
      out.push({
        pointer,
        message: `項目が ${schema.minProperties} 件以上である必要があります`,
        actual: `${Object.keys(value).length}件`,
      });
    }

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !(key in value)) {
          out.push({ pointer: `${pointer}.${key}`, message: '必須の項目がありません' });
        }
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const childPointer = `${pointer}.${key}`;
      if (key in properties) {
        validateAgainstSchema(child, properties[key], root, childPointer, out);
      } else if (schema.additionalProperties === false) {
        out.push({
          pointer: childPointer,
          message: 'スキーマに無い項目です',
          actual: describe(child),
        });
      } else if (isPlainObject(schema.additionalProperties)) {
        validateAgainstSchema(child, schema.additionalProperties, root, childPointer, out);
      }
    }
  }
}

// ============================================================================
// 要件定義書の取り込み（識別子と内容の対応を照合するため）
// ============================================================================

/** 機能名を冠さない旧来の識別子が属する機能。被覆率側の normalizeExclusionId と同じ規則。 */
export const DEFAULT_FEATURE = 'user-authentication';

/** 一つの機能の要件定義書から読み取った目録 */
export interface RequirementCatalogue {
  /** 要件定義書が実在したか */
  present: boolean;
  /** `REQ-N` → 要件の題 */
  requirementTitles: Map<string, string>;
  /** `REQ-N.M` → 受入基準の本文（行頭の番号を除いた残り）。撤廃済みのものは含まない */
  criteria: Map<string, string>;
  /**
   * `REQ-N.M` → 取り消し線で無効化された受入基準の本文（墓標）
   *
   * `criteria` からは外す。被覆率の分母に載らないものを除外で指せてしまうと、
   * 「E2Eでは確かめないが代わりにこう確かめる」という約束が、そもそも存在しない
   * 条文に対して立てられる。ここに残すのは、除外がそれを指したときに
   * 「番号が無い」ではなく「その番号は撤廃済みである」と言えるようにするためである。
   */
  retiredCriteria: Map<string, string>;
}

/**
 * 旧形式（`REQ-N.M`）の除外 ID を機能名付きへ揃える
 *
 * 被覆率側（scripts/check-requirement-coverage.ts の normalizeExclusionId）と同じ規則。
 * 重複検出をこの正規化の後で行わないと、`REQ-23.3` と `user-authentication/REQ-23.3` の
 * ように接頭辞だけが違う対が二件として素通りする（被覆率側は同一視するため、
 * 分母から外れるのは一件で、集計だけが二重に数えられる）。
 */
export function normalizeExclusionId(id: string): string {
  return id.includes('/') ? id : `${DEFAULT_FEATURE}/${id}`;
}

/**
 * `.kiro/specs/` 配下の機能名を集める
 *
 * **探索の規則そのものは持たない。** scripts/requirement-document.ts の
 * discoverFeatureNames が唯一の担い手であり、ここは根の与え方だけを持つ。
 * 被覆率側の discoverFeatures は実行位置からの相対で走査するため任意の根を与えられないが、
 * 被覆印の走査は自己検査から別の根で呼べる必要がある。よって既定を実行位置に依らない
 * リポジトリ根とし、根の差し替えを引数で許す。判定の規則は被覆率側と同一であり、
 * 複製が二箇所へ戻っていないことは自己検査（機構の固定）が機械で確かめる。
 */
export function discoverFeatureNames(rootDir = ROOT): string[] {
  return scanFeatureNames(rootDir);
}

/**
 * 要件定義書から要件の題と受入基準の本文を読み取る
 *
 * **切り出しの規則そのものは持たない。** scripts/requirement-document.ts の
 * scanRequirementsDocument が唯一の担い手であり、ここは読み取った結果を
 * 目録（Map）の形へ移し替えるだけである。被覆率側（scripts/check-requirement-coverage.ts の
 * extractRequirements）も同じ担い手を使う。両者が別々に規則を持つと、被覆率が分母として
 * 数える単位と除外が指す単位がずれ、この照合自体が別のものを見ることになる。
 * 二箇所への複製が戻っていないことは自己検査（機構の固定）が機械で確かめる。
 */
export function loadRequirementCatalogue(
  featureName: string,
  rootDir = ROOT
): RequirementCatalogue {
  const filePath = requirementsDocumentPath(rootDir, featureName);
  const catalogue: RequirementCatalogue = {
    present: fs.existsSync(filePath),
    requirementTitles: new Map(),
    criteria: new Map(),
    retiredCriteria: new Map(),
  };
  if (!catalogue.present) return catalogue;

  for (const requirement of scanRequirementsDocument(
    fs.readFileSync(filePath, 'utf-8'),
    filePath
  )) {
    catalogue.requirementTitles.set(requirement.id, requirement.title);
    for (const criterion of requirement.criteria) {
      catalogue.criteria.set(`${requirement.id}.${criterion.number}`, criterion.text);
    }
    for (const criterion of requirement.retiredCriteria) {
      catalogue.retiredCriteria.set(`${requirement.id}.${criterion.number}`, criterion.text);
    }
  }

  return catalogue;
}

/**
 * 識別子と内容の対応を確かめる
 *
 * 番号（`id`）と散文（`title` / `reason`）を並べるだけでは、両者が同じ受入基準を
 * 指しているかを機械で確かめられない。そこで各除外に受入基準の本文の逐語複製
 * （`criterionText`）を持たせ、それが要件定義書の当該行と完全に一致することを見る。
 * 番号がずれれば複製が合わなくなるため、ずれは検査で落ちる。
 */
export function checkCriterionCorrespondence(document: Json, rootDir = ROOT): Violation[] {
  const violations: Violation[] = [];
  if (!isPlainObject(document)) return violations;

  const exclusions = Array.isArray(document.exclusions) ? document.exclusions : [];
  const catalogues = new Map<string, RequirementCatalogue>();

  exclusions.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') return;
    const pointer = `exclusions[${index}]`;
    const normalized = normalizeExclusionId(entry.id);
    const separator = normalized.indexOf('/');
    const featureName = normalized.slice(0, separator);
    const criterionId = normalized.slice(separator + 1);
    const requirementId = criterionId.slice(0, criterionId.lastIndexOf('.'));

    let catalogue = catalogues.get(featureName);
    if (!catalogue) {
      catalogue = loadRequirementCatalogue(featureName, rootDir);
      catalogues.set(featureName, catalogue);
    }

    if (!catalogue.present) {
      violations.push({
        pointer: `${pointer}.id`,
        message: `機能 '${featureName}' の要件定義書（${SPEC_DIR}/${featureName}/requirements.md）が存在しません`,
        actual: entry.id,
      });
      return;
    }

    // requirement 欄（`REQ-N: 題`。機能名を冠する書き方も実在するため許す）
    if (typeof entry.requirement === 'string') {
      const declared = entry.requirement.replace(/^[a-z0-9][a-z0-9-]*\//, '');
      const declaredMatch = /^(REQ-\d+[A-E]?):\s*(.*)$/.exec(declared);
      if (!declaredMatch?.[1] || declaredMatch[2] === undefined) {
        violations.push({
          pointer: `${pointer}.requirement`,
          message: `'REQ-N: 要件の題' の形ではありません`,
          actual: entry.requirement,
        });
      } else if (declaredMatch[1] !== requirementId) {
        violations.push({
          pointer: `${pointer}.requirement`,
          message: `id の要件番号（${requirementId}）と食い違っています`,
          actual: entry.requirement,
        });
      } else {
        const actualTitle = catalogue.requirementTitles.get(requirementId);
        if (actualTitle === undefined) {
          violations.push({
            pointer: `${pointer}.id`,
            message: `要件定義書に ${requirementId} がありません`,
            actual: entry.id,
          });
        } else if (actualTitle !== declaredMatch[2].trim()) {
          violations.push({
            pointer: `${pointer}.requirement`,
            message: `要件の題が要件定義書と一致しません（原文: ${actualTitle}）`,
            actual: entry.requirement,
          });
        }
      }
    }

    // id が指す受入基準の実在と、その本文の逐語複製
    const criterionText = catalogue.criteria.get(criterionId);
    if (criterionText === undefined) {
      // 撤廃済みの番号を指しているのか、そもそも無い番号を指しているのかを言い分ける。
      // 前者は「除外を足す」ではなく「除外を消し、移管先の番号を名乗る」が正しい直し方である。
      const retiredText = catalogue.retiredCriteria.get(criterionId);
      violations.push({
        pointer: `${pointer}.id`,
        message:
          retiredText === undefined
            ? `要件定義書に該当の受入基準がありません（分母から外す先が存在しない）`
            : `取り消し線で無効化された受入基準を指しています。撤廃済みの受入基準は被覆率の分母に載らないため除外の対象になりません（この除外を取り下げ、移管先があるならその番号を名乗ること）`,
        actual: retiredText === undefined ? normalized : `${normalized}: ${retiredText}`,
      });
      return;
    }

    if (typeof entry.criterionText !== 'string') return; // 欠落はスキーマ側が報告する
    if (entry.criterionText !== criterionText) {
      violations.push({
        pointer: `${pointer}.criterionText`,
        message: `要件定義書の ${normalized} の本文と一致しません（原文: ${criterionText}）`,
        actual: entry.criterionText,
      });
    }
  });

  return violations;
}

// ============================================================================
// 除外の宣言と被覆印の同居
// ============================================================================
//
// 除外の一件は「E2Eでは確かめない」という宣言である。ところが `e2e/specs` の被覆印が
// 同じ番号を名乗っている対が長く放置されていた（タスク 115.167 の走査で 83 件、
// 115.186 の再測で 86 件）。宣言と実態のどちらかが必ず誤っているため、そのまま残せない。
//
// **86 は 83 の上位集合である。3件増えたのではなく、読み取り規則が広がった。** 115.167 は
// インラインの被覆印（パターン1〜3）だけを走査しており、ヘッダー直下の一覧（パターン5。
// 機能名を冠さない `- REQ-N.M:` の行）からしか印が付いていない次の3件を数えていなかった:
//   - quantity-table-generation/REQ-7.7（e2e/specs/quantity-tables/autocomplete-optimization.spec.ts:16）
//   - site-survey/REQ-16.2（e2e/specs/site-surveys/site-survey-performance.spec.ts:6）
//   - site-survey/REQ-22.3（e2e/specs/site-surveys/site-survey-image-rotation.spec.ts:9）
// 本検査は両方の規則で印を読むため、この差は再び現れない。
//
// 走査の対象を `e2e/specs` に限るのは範囲の都合ではなく、宣言の内容がそう定めるためである。
// 除外が述べているのは「**E2Eでは**確かめない」であり、単体検証や本番コードが同じ番号を
// 名乗ることは宣言と矛盾しない（掲げた代替検証そのものが単体検証である除外は実在する）。
// 矛盾するのは E2E の被覆印だけである。
//
// 唯一の例外は、未実装を固定するラチェット（`test.fail()`）である。この対では
//   - 除外を消すと、被覆印が静的解析上「被覆済み」を作り、未実装が緑に化ける
//   - 被覆印を消すと、ラチェットが要件と結び付かなくなる
// ため、同居していることが正しい。例外は識別子の一覧ではなく **機構**（当該の被覆印を
// 抱えるテストがラチェットであること）で判定する。番号を並べた許容一覧は置かない。

/** 被覆印が現れた場所 */
export interface CoverageTagSite {
  /** リポジトリ相対のパス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 当該の被覆印を抱えるテストが `test.fail()` のラチェットか */
  ratchet: boolean;
  /**
   * 個々のテストに結び付いたか
   *
   * ファイル冒頭の一覧や `test.describe` の前書きは、特定のテストではなく
   * ひとまとまりの宣言であるため `outside-test` になる。
   */
  scope: 'test' | 'outside-test';
}

/** 受入基準の識別子（機能名付きに正規化済み）→ 被覆印の場所 */
export type CoverageTagIndex = Map<string, CoverageTagSite[]>;

/** 被覆印を探す根。除外の宣言が矛盾しうるのは E2E の被覆印だけである。 */
export const E2E_SPECS_DIR = 'e2e/specs';

/**
 * テストの宣言の始まり（`test('題', ...)` / `it('題', ...)` と、その修飾子つきの形）
 *
 * 題の文字列を要求するのは `test.fail();` や `test.setTimeout(` と区別するためである。
 * 修飾子を列挙で限るのは `test.describe(` と区別するためで、こちらは題を持つが
 * 個々のテストの宣言ではない（下の GROUP_START_REGEX が受け持つ）。
 */
const TEST_START_REGEX = /^[ \t]*(?:test|it)(?:\.(?:skip|only|fixme|fail|slow))*\s*\(\s*['"`]/;

/** ラチェット（Playwright の「落ちるはず」の宣言） */
const RATCHET_REGEX = /\btest\.fail\(\s*\)/;

/** ひとまとまりの宣言（`test.describe('題', ...)` / `describe('題', ...)`） */
const GROUP_START_REGEX = /^[ \t]*(?:test\.)?describe(?:\.[A-Za-z]+)*\s*\(\s*['"`]/;

/** 註釈と空行だけの行（被覆印がどのテストの前書きかを決めるのに使う） */
const COMMENT_OR_BLANK_REGEX = /^[ \t]*(?:\/\/|\/\*|\*|$)/;

function listFilesRecursively(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git', 'coverage', 'generated'].includes(entry.name)) {
        results.push(...listFilesRecursively(full, pattern));
      }
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** ファイル内の宣言（個々のテストと、ひとまとまりの宣言）の位置 */
interface Declaration {
  line: number;
  kind: 'test' | 'group';
}

/** ファイルから宣言の位置を集める（走査のたびに数え直さないよう呼び出し側で持ち回る） */
function collectDeclarations(lines: readonly string[]): Declaration[] {
  const declarations: Declaration[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (TEST_START_REGEX.test(line)) declarations.push({ line: i, kind: 'test' });
    else if (GROUP_START_REGEX.test(line)) declarations.push({ line: i, kind: 'group' });
  }
  return declarations;
}

/**
 * 被覆印が属するテストを決める
 *
 * 被覆印はテスト本体の中（表題の括弧形式）にも、その直前の JSDoc（`@requirement` 形式）にも
 * 現れる。前者は「直前の宣言」に、後者は「直後の宣言」に属する。両者は
 * 「印の行から次の宣言までが註釈と空行だけか」で分かれる。
 *
 * 属する先が `test.describe` やファイル冒頭であれば、個々のテストではなく
 * ひとまとまりの宣言であるため null を返す。
 *
 * 波括弧の対応で本体の終端を求める方法は採らない。文字列・正規表現・註釈の中の括弧を
 * 数え違えるためである。宣言から次の宣言の手前までを一つの区間として扱う。
 *
 * @returns 属するテストの開始行（0 始まり）。個々のテストに属さなければ null
 */
function owningTestStart(
  lines: readonly string[],
  declarations: readonly Declaration[],
  lineIndex: number
): number | null {
  const next = declarations.find((declaration) => declaration.line > lineIndex);
  if (next !== undefined) {
    let onlyComments = true;
    for (let i = lineIndex + 1; i < next.line; i += 1) {
      if (!COMMENT_OR_BLANK_REGEX.test(lines[i] ?? '')) {
        onlyComments = false;
        break;
      }
    }
    // 直後の宣言の前書き（JSDoc）である
    if (onlyComments) return next.kind === 'test' ? next.line : null;
  }

  let previous: Declaration | null = null;
  for (const declaration of declarations) {
    if (declaration.line <= lineIndex) previous = declaration;
    else break;
  }
  return previous?.kind === 'test' ? previous.line : null;
}

/** テストの区間（開始行から次のテスト宣言の手前まで）にラチェットがあるか */
function isRatchetTest(lines: readonly string[], testStart: number): boolean {
  for (let i = testStart; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (RATCHET_REGEX.test(line)) return true;
    if (i > testStart && TEST_START_REGEX.test(line)) return false;
  }
  return false;
}

/**
 * `e2e/specs` を走査して、受入基準ごとの被覆印の場所を集める
 *
 * 被覆印の読み取り規則は被覆率の検査と同一のものを使う（パターン1〜3は
 * `buildInlineTagPatterns`、ヘッダー直下の一覧は `extractHeaderScopedCoverage`）。
 * 規則を写し取ると、片方だけが読み落とす形が生まれ、この検査が静かに空振りする。
 */
export function scanCoverageTags(rootDir = ROOT): CoverageTagIndex {
  const index: CoverageTagIndex = new Map();
  const featureNames = discoverFeatureNames(rootDir);
  if (featureNames.length === 0) return index;

  const specsDir = path.resolve(rootDir, E2E_SPECS_DIR);
  for (const file of listFilesRecursively(specsDir, /\.(ts|tsx)$/)) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const relative = path.relative(rootDir, file).split(path.sep).join('/');

    /** 各行の開始位置。文字位置から行番号を求めるのに使う。 */
    const lineStarts: number[] = [0];
    for (let i = 0; i < content.length; i += 1) {
      if (content[i] === '\n') lineStarts.push(i + 1);
    }
    /** 文字位置 → 行番号（0 始まり） */
    const lineOf = (offset: number): number => {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((lineStarts[mid] as number) <= offset) low = mid;
        else high = mid - 1;
      }
      return low;
    };

    const declarations = collectDeclarations(lines);
    const ratchetCache = new Map<number, boolean>();
    const record = (criterionId: string, offset: number): void => {
      const lineIndex = lineOf(offset);
      const owner = owningTestStart(lines, declarations, lineIndex);
      let ratchet = false;
      if (owner !== null) {
        const cached = ratchetCache.get(owner);
        ratchet = cached ?? isRatchetTest(lines, owner);
        if (cached === undefined) ratchetCache.set(owner, ratchet);
      }
      const sites = index.get(criterionId) ?? [];
      sites.push({
        file: relative,
        line: lineIndex + 1,
        ratchet,
        scope: owner === null ? 'outside-test' : 'test',
      });
      index.set(criterionId, sites);
    };

    for (const pattern of buildInlineTagPatterns(featureNames)) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[2] && match[3]) {
          record(`${match[1]}/REQ-${match[2]}.${match[3]}`, match.index);
        }
      }
    }

    // ヘッダー直下の一覧（パターン5）。位置は一覧の項目そのものを探して求める。
    for (const criterionId of extractHeaderScopedCoverage(content, featureNames)
      .acceptanceCriteria) {
      const localId = criterionId.slice(criterionId.indexOf('/') + 1);
      const itemRegex = new RegExp(`[-*]\\s*${localId.replace('.', '\\.')}(?![0-9])`, 'g');
      const found = itemRegex.exec(content);
      record(criterionId, found ? found.index : 0);
    }
  }

  return index;
}

/**
 * 除外の宣言と被覆印の同居を確かめる
 *
 * 同居は原則として違反である。唯一許すのは、その番号を名乗る被覆印がすべて
 * ラチェット（`test.fail()`）のテストに属する場合（ファイル冒頭の一覧は、同じファイルに
 * その番号のラチェットがあることを条件に許す）である。
 *
 * この検査が捕まえないもの（限界を両方向で述べる）:
 *   - `frontend/src` / `backend/src` の被覆印は見ない。除外が述べるのは
 *     「**E2Eでは**確かめない」であり、単体検証や本番コードが同じ番号を名乗ることは
 *     宣言と矛盾しない（掲げた代替検証そのものが単体検証である除外は実在する）。
 *     現に site-survey/REQ-1.6・REQ-8.5・REQ-16.8 は単体検証と本番コードが番号を
 *     名乗るが、本検査はこれを違反としない。
 *   - 逆に、被覆印が付いていない E2E が実質的に受入基準を確かめている場合は見つけられない。
 *     同居の有無は印の有無で決まるためである。
 *   - ラチェットの判定は「テストの区間に `test.fail()` があるか」までであり、
 *     その主張が受入基準を本当に確かめているかは見ない。
 */
export function checkCoverageTagCoexistence(
  document: Json,
  tagIndex: CoverageTagIndex
): Violation[] {
  const violations: Violation[] = [];
  if (!isPlainObject(document)) return violations;

  const exclusions = Array.isArray(document.exclusions) ? document.exclusions : [];
  exclusions.forEach((entry, position) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') return;
    const criterionId = normalizeExclusionId(entry.id);
    const sites = tagIndex.get(criterionId);
    if (!sites || sites.length === 0) return;

    const ratchetFiles = new Set(sites.filter((site) => site.ratchet).map((site) => site.file));
    if (ratchetFiles.size === 0) {
      violations.push({
        pointer: `exclusions[${position}].id`,
        message: `「E2Eでは確かめない」と宣言していますが ${E2E_SPECS_DIR} の被覆印が同じ受入基準を名乗っています（検証が実在するなら除外を取り下げ、名乗るだけなら被覆印を取り下げること）`,
        actual: `${criterionId} <- ${sites.map((site) => `${site.file}:${site.line}`).join(', ')}`,
      });
      return;
    }

    const stray = sites.filter(
      (site) => !site.ratchet && !(site.scope === 'outside-test' && ratchetFiles.has(site.file))
    );
    if (stray.length > 0) {
      violations.push({
        pointer: `exclusions[${position}].id`,
        message: `ラチェット（test.fail()）以外の被覆印が同じ受入基準を名乗っています（ラチェットとの同居だけが許されます）`,
        actual: `${criterionId} <- ${stray.map((site) => `${site.file}:${site.line}`).join(', ')}`,
      });
    }
  });

  return violations;
}

// ============================================================================
// 代替検証の説明が受入基準を覆う範囲
// ============================================================================
//
// 除外の一件は「E2Eでは確かめないが、代わりにこの方法で確かめる」という約束である。
// ところがその約束が、受入基準が求める内容の**一部しか述べていない**対が実在した
// （タスク 115.167 の全件照合が二件を報告し、115.189 の走査で母集団を確定した）。
//
//   site-survey/REQ-8.5 の原文は「テキストのフォントサイズ・色・背景色をカスタマイズ可能にする」
//   だが、掲げた代替検証は「フォントサイズを変更できることを確認」だけだった。
//
// 除外は受入基準を**丸ごと**分母から外す。約束が原文の一部しか述べていなければ、
// 述べられていない部分は「E2Eでも確かめず、代わりの方法でも確かめない」まま、
// どの指標にも現れなくなる。部分被覆を「除外」と呼ぶと、覆われていない部分が消える。
//
// 何を機械で決めるか（決められる範囲に限る）:
//   散文どうしの照合は自然言語の判断であり機械化できない（115.167 が同じ結論に達し、
//   語の重なりで測る方式は実データで誤検出が多すぎた）。そこで判定の対象を、原文が
//   **中黒（`・`）で明示的に列挙する要素**だけに限る。列挙は書式で切り出せるため、
//   「原文が並べた要素を、代替検証が一つも述べていない」ことは機械で決まる。
//   115.167 が報告した二件は、いずれもこの形である（8.5 の
//   「フォントサイズ・色・背景色」、quantity-table-generation/REQ-7.3 の
//   「小項目・任意分類・工種…」に対する「大項目・中項目」の欠落）。
//
// この検査が捕まえないもの（限界を両方向で述べる）:
//   - 中黒の列挙を持たない受入基準は判定しない。「エラーメッセージを表示し、
//     ユーザーに再試行を促す」のような**連言**（動詞句の並び）は、項目の切り出しが
//     自然言語の判断になるため機構では決められない。115.189 は全件の人手裁定で
//     この形を8件見つけて是正したが、**再発は機構では止まらない**
//     （scripts/exclusion-alternative-verification-adjudication.md に記録）。
//   - 代替検証が原文の語を**書いている**ことしか見ない。その観測が実在するか、
//     実際に受入基準を確かめるかは見ない。実在の側は被覆率の検査
//     （scripts/check-requirement-coverage.ts の auditExclusions が
//     `in-repo-unverified` として数える）が受け持つ。
//   - 逆に、列挙の要素を代替検証が述べていても、それが原文と別の意味で使われて
//     いれば見抜けない（語の一致しか見ないため）。
//
// 許容一覧は置かない。例外は「原文に列挙が無い」という**書式で決まる条件**だけである。
//
// 母集団の全件裁定（206件を P/Z/F へ分けた記録と、一件ごとの判断の根拠）は
// scripts/exclusion-alternative-verification-adjudication.md にある。
// 順序づけのための走査は scripts/scan-exclusion-alternative-coverage.ts にある。

/**
 * 列挙の項目の境界とみなす文字
 *
 * 中黒の左右へ文字を伸ばして項目を切り出すとき、名詞の内側に現れない文字で止める。
 * 句読点・括弧・記号に加えて、助詞と活用語尾のひらがなを含める。実データ206件で
 * 測って決めた（この集合が無いと「選択された全ての項目に対して削除・コピー・移動操作」の
 * 左端が「対して削除」まで伸び、実際には述べられている「削除」を欠落と誤断した）。
 *
 * カタカナ・漢字は含めない。「フィルタリング」「奥行き」「読み込み」のように、
 * ひらがなを含む名詞まで削ってしまうためである（`さ` `き` `み` は境界にしない）。
 */
const ENUMERATION_BOUNDARY = new Set([
  ...'はがをにへとでもやのかられよりまでてし、。，．・ 　()（）「」『』,.:：;；/\\|"\'`＋+=<>《》[]【】',
] as string[]);

/** 項目の末尾に付く一般名詞。落とした形でも照合する（「移動操作」と「移動」を同一視する） */
const GENERIC_ELEMENT_SUFFIXES: readonly string[] = [
  '操作',
  '処理',
  '機能',
  '設定',
  'データ',
  '情報',
  '一覧',
  '画面',
  '表示',
];

/** 短い括弧書きの注記（`(W)` `（D）` など）。項目の切り出しの前に落とす。 */
const SHORT_PARENTHETICAL = /[(（][A-Za-z0-9]{1,3}[)）]/g;

/**
 * 受入基準の原文が中黒で明示的に列挙する要素を切り出す
 *
 * 中黒を見つけ、その左右へ `ENUMERATION_BOUNDARY` に当たるまで文字を伸ばす。
 * 出現順を保ち、重複は落とす。列挙が無ければ空配列を返す（＝この検査は何も言わない）。
 */
export function extractEnumeratedElements(criterionText: string): string[] {
  const text = criterionText.replace(SHORT_PARENTHETICAL, '');
  const elements: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '・') continue;

    let left = index - 1;
    while (left >= 0 && !ENUMERATION_BOUNDARY.has(text[left] as string)) left -= 1;
    let right = index + 1;
    while (right < text.length && !ENUMERATION_BOUNDARY.has(text[right] as string)) right += 1;

    for (const element of [text.slice(left + 1, index), text.slice(index + 1, right)]) {
      if (element !== '' && !elements.includes(element)) elements.push(element);
    }
  }

  return elements;
}

/** 代替検証の文面が当該の要素を名指ししているか（末尾の一般名詞を落とした形も許す） */
export function namesElement(element: string, alternativeText: string): boolean {
  if (alternativeText.includes(element)) return true;
  for (const suffix of GENERIC_ELEMENT_SUFFIXES) {
    if (element.endsWith(suffix) && element.length > suffix.length) {
      return alternativeText.includes(element.slice(0, -suffix.length));
    }
  }
  return false;
}

/**
 * 代替検証が原文の列挙を覆っているかを確かめる
 *
 * 照合する相手は `alternativeVerification` の全ての文字列（method / tool / description /
 * threshold）である。要素を閾値の欄で述べている除外が実在するため、説明の欄だけを
 * 見ると誤検出になる。逆に `title` と `reason` は見ない。この二つは「何を除外したか」の
 * 説明であって「代わりに何を確かめるか」の約束ではなく、含めると 8.5 のように
 * 題が原文を写しているだけで約束が欠けている対を見逃す（実測で確認した）。
 */
export function checkAlternativeCoverage(document: Json): Violation[] {
  const violations: Violation[] = [];
  if (!isPlainObject(document)) return violations;

  const exclusions = Array.isArray(document.exclusions) ? document.exclusions : [];
  exclusions.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.criterionText !== 'string') return;
    const alternative = entry.alternativeVerification;
    if (!isPlainObject(alternative)) return; // 欠落はスキーマ側が報告する

    const elements = extractEnumeratedElements(entry.criterionText);
    if (elements.length === 0) return;

    const alternativeText = Object.values(alternative)
      .filter((value): value is string => typeof value === 'string')
      .join('\n');

    const missing = elements.filter((element) => !namesElement(element, alternativeText));
    if (missing.length === 0) return;

    violations.push({
      pointer: `exclusions[${index}].alternativeVerification`,
      message: `原文が列挙する要素のうち ${missing.map((element) => `「${element}」`).join('')} を代替検証が述べていません（除外は受入基準を丸ごと分母から外すため、述べられていない要素はどの指標にも現れなくなります。説明を実態へ広げるか、覆えないなら除外を取り下げること）`,
      actual: `${typeof entry.id === 'string' ? entry.id : '(id不明)'} 原文の列挙: ${elements.join('・')}`,
    });
  });

  return violations;
}

// ============================================================================
// スキーマ単体では表せない不変条件
// ============================================================================

/**
 * 除外定義の整合を確かめる。
 *
 * JSON Schema は「category が categories のキーであること」や「summary の件数が
 * 実際の件数と一致すること」を表せない。ここで明示的に確かめる。
 *
 * 識別子と内容の対応（要件定義書との照合）は checkCriterionCorrespondence が扱う。
 */
export function checkInvariants(document: Json): Violation[] {
  const violations: Violation[] = [];
  if (!isPlainObject(document)) return violations;

  const exclusions = Array.isArray(document.exclusions) ? document.exclusions : [];
  const categories = isPlainObject(document.categories) ? document.categories : {};

  // 識別子の重複
  //
  // 生の id で比べると、`REQ-23.3` と `user-authentication/REQ-23.3` のように
  // 接頭辞だけが違う対を見逃す。被覆率側は normalizeExclusionId で両者を同一視するため、
  // 分母から外れるのは一件だけで、集計だけが二重に数えられる。同じ正規化を通してから比べる。
  const seen = new Map<string, { index: number; id: string }>();
  exclusions.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') return;
    const normalized = normalizeExclusionId(entry.id);
    const first = seen.get(normalized);
    if (first !== undefined) {
      violations.push({
        pointer: `exclusions[${index}].id`,
        message:
          first.id === entry.id
            ? `同じ受入基準が exclusions[${first.index}] でも除外されています（重複）`
            : `同じ受入基準が exclusions[${first.index}]（${first.id}）でも除外されています（機能名の有無だけが違う重複）`,
        actual: entry.id,
      });
    } else {
      seen.set(normalized, { index, id: entry.id });
    }
  });

  // 未定義の分類
  const actualByCategory = new Map<string, number>();
  exclusions.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.category !== 'string') return;
    actualByCategory.set(entry.category, (actualByCategory.get(entry.category) ?? 0) + 1);
    if (!(entry.category in categories)) {
      violations.push({
        pointer: `exclusions[${index}].category`,
        message: 'categories に定義されていない分類です',
        actual: entry.category,
      });
    }
  });

  // 使われていない分類（定義だけが残ると、除外の語彙が実態を表さなくなる）
  for (const name of Object.keys(categories)) {
    if (!actualByCategory.has(name)) {
      violations.push({
        pointer: `categories.${name}`,
        message: 'どの除外からも使われていない分類です',
      });
    }
  }

  // 代替検証を持たない除外の置き場所（タスク 115.314）
  //
  // 除外の一件は「E2Eでは確かめないが、代わりにこの方法で確かめる」という約束である。
  // `method: "none"` はその約束を持たないと自ら申告する形であり、実データではいずれも
  // 「実装がまだ無い」ことの明示であった。この形を無条件に許すと、除外一覧は
  // **未実装かつ方針未決の条文を分母から外す器**になる。確かめる対象が存在しない条文を
  // 外すと「E2E対象外」という宣言そのものが偽になり、しかも採点は改善する側へ動く。
  //
  // そこで置き場所を、`verificationPhase` が「後でE2Eが確かめる」と述べている分類に限る。
  // 分類名で縛らないのは、語彙が増えても規則が生きるようにするためである。**「未決」を
  // 表せる `verificationPhase` の値は無い**——それがタスク 115.314 の判断であり、
  // この不変条件はその判断を機構にしたものである。
  for (const [index, entry] of exclusions.entries()) {
    if (!isPlainObject(entry)) continue;
    const alternative = isPlainObject(entry.alternativeVerification)
      ? entry.alternativeVerification
      : null;
    if (!alternative || alternative.method !== PROMISELESS_METHOD) continue;
    const categoryName = typeof entry.category === 'string' ? entry.category : '';
    const category = isPlainObject(categories[categoryName]) ? categories[categoryName] : null;
    const phase =
      category && typeof category.verificationPhase === 'string'
        ? category.verificationPhase
        : null;
    if (phase !== DEFERRED_E2E_PHASE) {
      violations.push({
        pointer: `exclusions[${index}].alternativeVerification.method`,
        message: `代替検証を持たない除外（method: ${PROMISELESS_METHOD}）は verificationPhase が ${DEFERRED_E2E_PHASE} の分類にしか置けません（確かめる対象が無い条文を分母から外すと「E2E対象外」が偽の宣言になります）`,
        actual: `${describe(entry.id)} -> category=${categoryName || '(無し)'} verificationPhase=${phase ?? '(無し)'}`,
      });
    }
  }

  // 集計の整合
  const summary = isPlainObject(document.summary) ? document.summary : null;
  if (summary) {
    if (
      typeof summary.totalExclusions === 'number' &&
      summary.totalExclusions !== exclusions.length
    ) {
      violations.push({
        pointer: 'summary.totalExclusions',
        message: `実際の除外件数（${exclusions.length}件）と一致しません`,
        actual: String(summary.totalExclusions),
      });
    }
    const declared = isPlainObject(summary.byCategory) ? summary.byCategory : {};
    for (const [name, count] of actualByCategory) {
      if (declared[name] !== count) {
        violations.push({
          pointer: `summary.byCategory.${name}`,
          message: `実際の件数（${count}件）と一致しません`,
          actual: describe(declared[name]),
        });
      }
    }
    for (const name of Object.keys(declared)) {
      if (!actualByCategory.has(name)) {
        violations.push({
          pointer: `summary.byCategory.${name}`,
          message: '該当する除外が一件もありません',
          actual: describe(declared[name]),
        });
      }
    }
  }

  return violations;
}

// ============================================================================
// 実行
// ============================================================================

/** 違反にどの検査が挙げたかを刻む（自己検査が狙いどおりの検査を見るために使う） */
function tagViolations(check: ViolationCheck, violations: Violation[]): Violation[] {
  return violations.map((violation) => ({ ...violation, check }));
}

export function run(
  exclusionsPath = EXCLUSIONS_PATH,
  tagIndex: CoverageTagIndex = scanCoverageTags()
): CheckResult {
  const absoluteExclusions = path.resolve(ROOT, exclusionsPath);

  if (!fs.existsSync(absoluteExclusions)) {
    // 前提条件で検査を無効化しない: 見つからないことは合格ではない
    return {
      file: exclusionsPath,
      schemaFile: '(未解決)',
      exclusionCount: 0,
      violations: [
        {
          pointer: '(file)',
          message: '除外定義が見つかりません',
          actual: exclusionsPath,
          check: 'file',
        },
      ],
    };
  }

  let document: Json;
  try {
    document = JSON.parse(fs.readFileSync(absoluteExclusions, 'utf-8'));
  } catch (error) {
    return {
      file: exclusionsPath,
      schemaFile: '(未解決)',
      exclusionCount: 0,
      violations: [
        {
          pointer: '(file)',
          message: 'JSON として読めません',
          actual: error instanceof Error ? error.message : String(error),
          check: 'file',
        },
      ],
    };
  }

  const schemaRef =
    isPlainObject(document) && typeof document.$schema === 'string' ? document.$schema : null;
  if (!schemaRef) {
    return {
      file: exclusionsPath,
      schemaFile: '(未解決)',
      exclusionCount: 0,
      violations: [
        { pointer: '$schema', message: 'スキーマへの参照がありません', check: 'schema' },
      ],
    };
  }

  const absoluteSchema = path.resolve(path.dirname(absoluteExclusions), schemaRef);
  const schemaFile = path.relative(ROOT, absoluteSchema);
  if (!fs.existsSync(absoluteSchema)) {
    return {
      file: exclusionsPath,
      schemaFile,
      exclusionCount: 0,
      violations: [
        {
          pointer: '$schema',
          message: '参照先のスキーマがリポジトリに存在しません（ダングリング参照）',
          actual: schemaRef,
          check: 'schema',
        },
      ],
    };
  }

  let schema: Json;
  try {
    schema = JSON.parse(fs.readFileSync(absoluteSchema, 'utf-8'));
  } catch (error) {
    return {
      file: exclusionsPath,
      schemaFile,
      exclusionCount: 0,
      violations: [
        {
          pointer: '(schema)',
          message: 'スキーマが JSON として読めません',
          actual: error instanceof Error ? error.message : String(error),
          check: 'schema',
        },
      ],
    };
  }

  const violations: Violation[] = [];
  const schemaViolations: Violation[] = [];
  if (isPlainObject(schema)) {
    validateAgainstSchema(document, schema, schema, '(root)', schemaViolations);
  } else {
    schemaViolations.push({ pointer: '(schema)', message: 'スキーマがオブジェクトではありません' });
  }
  violations.push(...tagViolations('schema', schemaViolations));
  violations.push(...tagViolations('invariant', checkInvariants(document)));
  violations.push(
    ...tagViolations('criterion-correspondence', checkCriterionCorrespondence(document))
  );
  violations.push(
    ...tagViolations('coverage-tag-coexistence', checkCoverageTagCoexistence(document, tagIndex))
  );
  violations.push(...tagViolations('alternative-coverage', checkAlternativeCoverage(document)));

  const exclusionCount =
    isPlainObject(document) && Array.isArray(document.exclusions) ? document.exclusions.length : 0;

  return { file: exclusionsPath, schemaFile, exclusionCount, violations };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const json = args.includes('--json');

  const result = run();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.violations.length > 0 ? 1 : 0);
  }

  if (result.violations.length > 0) {
    console.error('❌ 除外定義がスキーマに適合しません');
    console.error('');
    console.error(`   定義: ${result.file}`);
    console.error(`   規約: ${result.schemaFile}`);
    console.error('');
    console.error(
      '   除外は被覆率の分母から受入基準を外します。定義が壊れると被覆の主張が空洞化します。'
    );
    console.error('');
    for (const violation of result.violations) {
      console.error(`   ${violation.pointer}: ${violation.message}`);
      if (verbose && violation.actual !== undefined) {
        console.error(`      実際の値: ${violation.actual}`);
      }
    }
    console.error('');
    console.error(`   合計 ${result.violations.length} 件`);
    if (!verbose) {
      console.error('   詳細確認: npm run check:req-exclusions:verbose');
    }
    process.exit(1);
  }

  console.log(
    `✅ 除外定義はスキーマに適合しています（${result.exclusionCount}件 / 規約: ${result.schemaFile}）`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
