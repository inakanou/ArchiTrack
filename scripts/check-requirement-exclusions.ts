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
 *      - `summary.totalExclusions` と `summary.byCategory` が実際の件数と一致すること
 *   4. 識別子と内容の対応（タスク 115.167 で追加）
 *      - `id` が指す受入基準が要件定義書に実在すること
 *      - 指す受入基準が取り消し線（`~~`）で無効化されていないこと
 *      - `requirement` 欄の要件番号と題が要件定義書と一致すること
 *      - `criterionText` が要件定義書の当該受入基準の本文と一字一句一致すること
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

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

export const EXCLUSIONS_PATH = 'e2e/requirement-exclusions.json';

// ============================================================================
// 型定義
// ============================================================================

export interface Violation {
  /** 違反箇所を指す JSON ポインタ風の経路（例: `exclusions[12].category`） */
  pointer: string;
  /** 何が満たされていないか */
  message: string;
  /** 実際の値（--verbose で出力する） */
  actual?: string;
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

export const SPECS_DIR = '.kiro/specs';

/** 機能名を冠さない旧来の識別子が属する機能。被覆率側の normalizeExclusionId と同じ規則。 */
export const DEFAULT_FEATURE = 'user-authentication';

/** 一つの機能の要件定義書から読み取った目録 */
export interface RequirementCatalogue {
  /** 要件定義書が実在したか */
  present: boolean;
  /** `REQ-N` → 要件の題 */
  requirementTitles: Map<string, string>;
  /** `REQ-N.M` → 受入基準の本文（行頭の番号を除いた残り） */
  criteria: Map<string, string>;
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
 * 要件定義書から要件の題と受入基準の本文を読み取る
 *
 * 受入基準の切り出し規則は scripts/check-requirement-coverage.ts の extractRequirements と
 * 同一にする。被覆率が分母として数える単位と、除外が指す単位がずれると、この照合自体が
 * 別のものを見ることになる。
 */
export function loadRequirementCatalogue(
  featureName: string,
  rootDir = ROOT
): RequirementCatalogue {
  const filePath = path.join(rootDir, SPECS_DIR, featureName, 'requirements.md');
  const catalogue: RequirementCatalogue = {
    present: fs.existsSync(filePath),
    requirementTitles: new Map(),
    criteria: new Map(),
  };
  if (!catalogue.present) return catalogue;

  const requirementRegexJa = /^###\s*要件(\d+[A-E]?):\s*(.*)$/;
  const requirementRegexEn = /^###\s*Requirement\s+(\d+[A-E]?):\s*(.*)$/;
  const acceptanceCriteriaRegex = /^(\d+)\.\s+(.+)$/;

  let currentId: string | null = null;
  let inAcceptanceCriteria = false;

  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const requirementMatch = requirementRegexJa.exec(line) ?? requirementRegexEn.exec(line);
    if (requirementMatch?.[1] !== undefined && requirementMatch[2] !== undefined) {
      currentId = `REQ-${requirementMatch[1]}`;
      catalogue.requirementTitles.set(currentId, requirementMatch[2].trim());
      inAcceptanceCriteria = false;
      continue;
    }

    if (
      line.includes('#### 受入基準') ||
      line.includes('##### 受入基準') ||
      line.includes('#### Acceptance Criteria')
    ) {
      inAcceptanceCriteria = true;
      continue;
    }

    if (line.startsWith('###') && !line.startsWith('#####') && !line.includes('受入基準')) {
      if (line.startsWith('### 要件') || line.startsWith('### Requirement')) {
        // 次の反復で要件ヘッダーとして処理する
      } else if (line.startsWith('####') && !line.startsWith('#####')) {
        inAcceptanceCriteria = false;
        continue;
      }
    }

    if (currentId !== null && inAcceptanceCriteria) {
      const criterionMatch = acceptanceCriteriaRegex.exec(line);
      if (criterionMatch?.[1] !== undefined && criterionMatch[2] !== undefined) {
        catalogue.criteria.set(`${currentId}.${criterionMatch[1]}`, criterionMatch[2].trim());
      }
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
        message: `機能 '${featureName}' の要件定義書（${SPECS_DIR}/${featureName}/requirements.md）が存在しません`,
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
      violations.push({
        pointer: `${pointer}.id`,
        message: `要件定義書に該当の受入基準がありません（分母から外す先が存在しない）`,
        actual: normalized,
      });
      return;
    }
    // 取り消し線で無効化された受入基準は `removed-from-spec` でのみ指してよい。
    // 撤廃・移動された受入基準を通常の区分で除外すると、「代わりにこの方法で確かめる」
    // という約束が、そもそも存在しない受入基準に対して立てられることになる。
    const removedFromSpec = entry.category === 'removed-from-spec';
    const struckThrough = criterionText.startsWith('~~');
    if (struckThrough && !removedFromSpec) {
      violations.push({
        pointer: `${pointer}.category`,
        message: `取り消し線で無効化された受入基準を指しています。区分は 'removed-from-spec' である必要があります（移動先の受入基準があるならその id を指すこと）`,
        actual: `${normalized}: ${criterionText}`,
      });
    }
    if (!struckThrough && removedFromSpec) {
      violations.push({
        pointer: `${pointer}.category`,
        message: `'removed-from-spec' は要件定義書上で削除表記（~~）となった受入基準に限ります。当該の受入基準は現役です`,
        actual: `${normalized}: ${criterionText}`,
      });
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

export function run(exclusionsPath = EXCLUSIONS_PATH): CheckResult {
  const absoluteExclusions = path.resolve(ROOT, exclusionsPath);

  if (!fs.existsSync(absoluteExclusions)) {
    // 前提条件で検査を無効化しない: 見つからないことは合格ではない
    return {
      file: exclusionsPath,
      schemaFile: '(未解決)',
      exclusionCount: 0,
      violations: [
        { pointer: '(file)', message: '除外定義が見つかりません', actual: exclusionsPath },
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
      violations: [{ pointer: '$schema', message: 'スキーマへの参照がありません' }],
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
        },
      ],
    };
  }

  const violations: Violation[] = [];
  if (isPlainObject(schema)) {
    validateAgainstSchema(document, schema, schema, '(root)', violations);
  } else {
    violations.push({ pointer: '(schema)', message: 'スキーマがオブジェクトではありません' });
  }
  violations.push(...checkInvariants(document));
  violations.push(...checkCriterionCorrespondence(document));

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
