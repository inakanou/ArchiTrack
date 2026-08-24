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
 *      - 受入基準の識別子が重複しないこと
 *      - 各除外の `category` が `categories` に定義済みであること
 *      - `summary.totalExclusions` と `summary.byCategory` が実際の件数と一致すること
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
// スキーマ単体では表せない不変条件
// ============================================================================

/**
 * 除外定義の整合を確かめる。
 *
 * JSON Schema は「category が categories のキーであること」や「summary の件数が
 * 実際の件数と一致すること」を表せない。ここで明示的に確かめる。
 */
export function checkInvariants(document: Json): Violation[] {
  const violations: Violation[] = [];
  if (!isPlainObject(document)) return violations;

  const exclusions = Array.isArray(document.exclusions) ? document.exclusions : [];
  const categories = isPlainObject(document.categories) ? document.categories : {};

  // 識別子の重複
  const seen = new Map<string, number>();
  exclusions.forEach((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') return;
    const first = seen.get(entry.id);
    if (first !== undefined) {
      violations.push({
        pointer: `exclusions[${index}].id`,
        message: `同じ受入基準が exclusions[${first}] でも除外されています（重複）`,
        actual: entry.id,
      });
    } else {
      seen.set(entry.id, index);
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
