/**
 * @fileoverview 受入基準が鉤括弧で名指す逐語が実装に一度も現れない形の検査（タスク 115.292）
 *
 * ## なぜ在るか
 *
 * 被覆を数える関門は「受入基準の番号を名乗る検証が在るか」までしか見ない。**名乗った検証が
 * 条文と反対のことを確かめていても被覆と数えられる。** タスク 115.240 が他スペックの実測で
 * これを露出させ、タスク 115.292 の起票時に親が変異で実証した——条文の主張を反対
 * （`toBeUndefined()`）へ置換し追認の註を添えても、押下前の関門 17 本すべてが基線と同じ
 * 終了コードであった。主張の**有無**は `check:e2e-guards` が見るが、主張の**中身**が条文と
 * 合っているかは 17 本のいずれも見ていない。
 *
 * 主張の中身と条文の一致は、一般には機械判定できない。**利用者はその一般形を関門化せず、
 * 機械で判定できる一形だけを関門化すると決めた。** 選ばれなかった案とその却下理由、および
 * 機械保証の三層は `.kiro/specs/site-survey/design.md` の
 * 「受入基準が名指す逐語の実在に関門を置くという判断（タスク 115.292）」節に置いた。
 *
 * ## 何を検査するか
 *
 * **現役の受入基準の条文が `「」` `『』` `""` で名指す 3 文字以上の逐語が、`backend/src` と
 * `frontend/src` に一度も現れないもの**を挙げる。赤の解除条件は二択である。
 *
 *   1. **是正**——実装に逐語が入る、または条文の側が実装に合わせて直る
 *   2. **台帳への登録**——`scripts/criterion-literal-adjudication.json` へ一件ずつ
 *      「理由」と「代替の根拠」を書いて裁定する
 *
 * 台帳は除外一覧（`e2e/requirement-exclusions.json`）と同じ形で運用する。すなわち
 * (a) 逐語複製（`criterionText`）を持たせて条文の改訂で自動的に赤くする、
 * (b) 代替の根拠を機械で読める形に課す、(c) 件数をラチェットで固定する。
 *
 * ## ラチェット（{@link LEDGER_ENTRY_LIMIT}）
 *
 * 台帳の件数は宣言と**完全一致**でなければならない。下回っても赤くする——遊びを持つ上限は、
 * その幅ぶんの無言の追加を吸収するからである（`scripts/check-design-measurement-freshness.ts`
 * の `MINIMUM_ENTRIES` が同じ理由で完全一致を課している）。取り下げたら定数を下げること。
 *
 * ## 何を検査しないか（境界。反例を示せば偽になる命題として挙げる）
 *
 *   - **逐語を持たない条文**。本検査の着手時点で、現役の受入基準 2889 件のうち逐語を
 *     名指すのは 472 件（16.3%）だけである。残る 2417 件について本検査は何も言わない。
 *   - **主張の中身と条文の食い違い一般**。起票が実証した「反対のことを確かめている検証」は、
 *     その条文が逐語を持たない限り本検査の網に掛からない。逐語を持つ場合でも、本検査が
 *     見るのは実装に綴りが在るかだけであり、**E2E の主張が条文と合っているかは見ない**。
 *   - **註釈行（本検査の最大の抜け道）**。走査根は行の種別を見ない。したがって**条文の逐語を
 *     JSDoc へ写すだけで赤が緑になる**。実額は `npm run check:criterion-literals:survey` が
 *     印字する——本検査が通した 572 組のうち**本番の非註釈行に一度も無いものが 61 組**あり、
 *     うち**本番の註釈行には在るものが 43 組**（さらにそのうち本番の註釈にしか無いものが
 *     15 組）である（コミット `42cddbae` に本タスクの変更を載せた作業ツリーで 2026-09-05 に
 *     実測）。**走査根からテストコードと生成コードを外してもこの穴は塞がらない**——本番
 *     ファイルの中の註釈は残るためである。註釈行の除外は別の軸の判断であり、本タスクでは
 *     採らない（利用者が母集団の大きさを見て関門化を決めたため、走査の規則を動かすと前提が
 *     変わる）。
 *   - **綴りが在る場所**。走査根は `backend/src` と `frontend/src` の全体であり、
 *     テストコード（`__tests__/`・`*.test.ts`）と生成コード（`backend/src/generated/`）も
 *     含む。**逐語がテストの中にしか無くても本検査は合格を出す**（上の実測で 17 組）。
 *     走査根を狭めれば母集団は増えるが、それは別の判断であり本タスクでは採らない。
 *   - **入れ子の鉤括弧**。`「A「B」C」` からは `A「B` を取り出す。開き括弧から最初の
 *     閉じ括弧までを一つの逐語として読むためである。
 *   - **台帳の散文の妥当性**。`reason` と `alternativeBasis` の内容が正しいかは読み手が判断
 *     する。機械が見るのは長さと、`wording-drift` の根拠が実在する綴りを引いているかまでで
 *     ある。
 *
 * オプション:
 *   --verbose  条文の本文と台帳の裁定を添えて出力する
 *   --json     JSON 形式で出力する
 *   --survey   註釈の抜け道の実額を印字する（合否は出さない。終了コードは常に 0）
 *   --tsv      `--survey` と併せて、機械可読の一覧を印字する
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   要件定義書・実装の走査根・台帳のいずれかが見つからない場合は「合格」ではなく失敗として
 *   扱う。逐語を一つも取り出せない場合、実装ファイルを一件も読めない場合も同様である。
 *
 * 使用方法:
 *   npx tsx scripts/check-criterion-literal-presence.ts [--verbose] [--json]
 *   npx tsx scripts/check-criterion-literal-presence.ts --survey [--tsv]
 *   npm run check:criterion-literals
 *   npm run check:criterion-literals:survey
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverFeatureNames,
  requirementsDocumentPath,
  scanRequirementsDocument,
} from './requirement-document.js';

const MODULE_PATH = fileURLToPath(import.meta.url);

/** リポジトリルート（本ファイルは scripts/ 直下に置かれる） */
export const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');

/** 裁定台帳の位置（リポジトリ相対） */
export const LEDGER_PATH = 'scripts/criterion-literal-adjudication.json';

/**
 * 台帳に載ってよい件数（ラチェット）
 *
 * **完全一致で課す。** 上限に遊びを持たせると、取り下げで空いた枠へ無言の追加が入る。
 * 取り下げたときは同時にこの定数を下げること。
 */
export const LEDGER_ENTRY_LIMIT = 25;

/** 逐語を囲む括弧の対 */
export const LITERAL_QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['「', '」'],
  ['『', '』'],
  ['"', '"'],
];

/**
 * 逐語として読む最小の長さ（書記素ではなくコードポイントで数える）
 *
 * 2 文字以下まで広げると「型」「列」のような一般語が大量に入り、実装のどこかに必ず現れる
 * ため判定が空回りする。利用者が母集団を測ったときの条件と同じ 3 文字を採る。
 */
export const MINIMUM_LITERAL_LENGTH = 3;

/** 逐語の実在を探す走査根（リポジトリ相対） */
export const IMPLEMENTATION_ROOTS: readonly string[] = ['backend/src', 'frontend/src'];

/** 走査根の下で読むファイルの拡張子 */
export const IMPLEMENTATION_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.hbs', '.css'];

/**
 * 判定器の陽性の対照
 *
 * 合成の条文である。**逐語の取り出しと実在の探索の両方**を一度に確かめる——この綴りは
 * `scripts/` にしか存在せず、走査根（`backend/src` / `frontend/src`）には無いため、
 * 判定器が生きていれば必ず「実装に無い逐語」として挙がる。
 */
export const DETECTOR_POSITIVE_CONTROL =
  'The システム shall 「この綴りは走査根のどこにも無い合成の逐語である」と表示する';

// ============================================================================
// 逐語の取り出し
// ============================================================================

/** 条文が名指す一つの逐語 */
export interface QuotedLiteral {
  /** 括弧の中身 */
  value: string;
  /** どの括弧の対から取ったか（開き括弧の綴り） */
  quote: string;
}

/**
 * 条文の本文から鉤括弧の逐語を取り出す
 *
 * 開き括弧から**最初の**閉じ括弧までを一つの逐語として読む。入れ子は解さない（限界は
 * ファイル冒頭に挙げた）。`"` は開きと閉じが同じ綴りであるため、出現の順に対にする。
 */
export function extractQuotedLiterals(text: string): QuotedLiteral[] {
  const literals: QuotedLiteral[] = [];
  for (const [open, close] of LITERAL_QUOTE_PAIRS) {
    let from = 0;
    for (;;) {
      const start = text.indexOf(open, from);
      if (start < 0) break;
      const end = text.indexOf(close, start + open.length);
      if (end < 0) break;
      const value = text.slice(start + open.length, end);
      if ([...value].length >= MINIMUM_LITERAL_LENGTH) literals.push({ value, quote: open });
      from = end + close.length;
    }
  }
  return literals;
}

// ============================================================================
// 台帳
// ============================================================================

/** 台帳の一件 */
export interface LedgerEntry {
  /** `<機能>/REQ-<要件>.<受入基準>` */
  id: string;
  /** 実装に現れない逐語（括弧の中身そのもの） */
  literal: string;
  /** 受入基準の本文の逐語複製。条文が改訂されたら赤くするために持つ */
  criterionText: string;
  /** 裁定の区分（台帳の `categories` に宣言されたもの） */
  category: string;
  /** なぜ逐語が実装に無いのか */
  reason: string;
  /** 逐語一致の代わりに何が受入基準を支えているか。支えが無いならそう書く */
  alternativeBasis: string;
  /** 関連する実装の所在（リポジトリ相対。実在しなければならない） */
  evidence: string[];
  /** 受入基準を支えるものが無い（是正が要る）か。`implementation-divergence` と一対一 */
  unverified: boolean;
}

/** 台帳の全体 */
export interface Ledger {
  categories: Record<string, string>;
  entries: LedgerEntry[];
}

/** 支えが無いことを表す区分。この区分だけが `unverified: true` を取る */
export const UNVERIFIED_CATEGORY = 'implementation-divergence';

/** 実装側の実際の綴りを引くことを課す区分 */
export const DRIFT_CATEGORY = 'wording-drift';

/** `reason` / `alternativeBasis` に課す最小の長さ。`-` や「同上」で埋める形を塞ぐ */
export const MINIMUM_PROSE_LENGTH = 20;

/** 台帳の項目が持ってよい欄。ここに無い欄は黙殺せず違反として報告する */
const LEDGER_ENTRY_KEYS = [
  'id',
  'literal',
  'criterionText',
  'category',
  'reason',
  'alternativeBasis',
  'evidence',
  'unverified',
] as const;

// ============================================================================
// 検出の種別
// ============================================================================

/**
 * どの判定が挙げた指摘か
 *
 * 型でなく `as const` の配列で持つのは、自己検査が**実行時に語彙を数え上げる**ためである
 * （タスク 115.222 の作法）。種別を足して対照を書き忘れる経路を塞ぐ。
 */
export const FINDING_KINDS = [
  /** 実装に一度も現れない逐語で、台帳に無い */
  'unregistered-literal',
  /** 台帳の項目が現況の欠落に対応しない（逐語が実装に入った／条文が消えた） */
  'stale-ledger-entry',
  /** 台帳の形式違反（必須欄・未知の欄・未宣言の区分・不在のパス・旗の不整合・重複） */
  'ledger-schema',
  /** 台帳の逐語複製が要件定義書と食い違う */
  'ledger-drift',
  /** 代替の根拠が実在する綴りを引いていない */
  'ledger-basis',
  /** 台帳の件数が宣言と食い違う */
  'ledger-ratchet',
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding {
  kind: FindingKind;
  /** 指摘の対象（受入基準の識別子、または台帳の経路） */
  subject: string;
  /** 何が満たされていないか */
  detail: string;
  /** --verbose で添える補足（条文の本文など） */
  context?: string;
}

/** 実装に現れない逐語の一件 */
export interface MissingLiteral {
  /** `<機能>/REQ-<要件>.<受入基準>` */
  id: string;
  literal: string;
  criterionText: string;
  /** 要件定義書での行番号（1 始まり） */
  line: number;
}

export interface RunResult {
  findings: Finding[];
  /** 走査した機能の数 */
  featureCount: number;
  /** 現役の受入基準の総数 */
  criterionCount: number;
  /** 逐語を名指す受入基準の数 */
  criterionWithLiteralCount: number;
  /** 逐語の延べ数（同一条文内の重複は畳む） */
  literalCount: number;
  /** 実在を探したファイルの数 */
  implementationFileCount: number;
  /** 実装に現れなかった組 */
  missing: MissingLiteral[];
  /** 台帳に登録済みの組の数 */
  ledgerEntryCount: number;
  /** 台帳のうち支えが無いと裁定された件数 */
  unverifiedCount: number;
  /** 判定器が陽性の対照を検出したか */
  detectorPositive: boolean;
}

export interface RunOptions {
  /** 走査の起点。既定はリポジトリルート */
  root?: string;
  /** 台帳の位置（`root` からの相対）。既定は {@link LEDGER_PATH} */
  ledgerPath?: string;
  /** ラチェットの上限。既定は {@link LEDGER_ENTRY_LIMIT} */
  entryLimit?: number;
}

// ============================================================================
// 走査
// ============================================================================

/** 走査根の下のファイルをリポジトリ相対で列挙する（並びは昇順に揃える） */
export function listImplementationFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relative: string): void => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && IMPLEMENTATION_EXTENSIONS.includes(path.extname(entry.name))) {
        files.push(child);
      }
    }
  };
  for (const rootRelative of IMPLEMENTATION_ROOTS) walk(rootRelative);
  return files;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 台帳を読む
 *
 * 読めない場合は例外ではなく違反として返す。**「台帳が無いから合格」にはしない**
 * （AI運用7原則 第3原則）——呼び手は違反を findings へ積み、`decideExit` が赤にする。
 */
export function loadLedger(absolutePath: string): { ledger: Ledger | null; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!existsSync(absolutePath)) {
    findings.push({
      kind: 'ledger-schema',
      subject: absolutePath,
      detail: '裁定台帳が見つかりません（台帳の不在を合格として扱いません）',
    });
    return { ledger: null, findings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    findings.push({
      kind: 'ledger-schema',
      subject: absolutePath,
      detail: `裁定台帳を JSON として読めません: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { ledger: null, findings };
  }

  if (!isPlainObject(parsed)) {
    findings.push({
      kind: 'ledger-schema',
      subject: absolutePath,
      detail: '裁定台帳の最上位がオブジェクトではありません',
    });
    return { ledger: null, findings };
  }

  for (const key of Object.keys(parsed)) {
    if (!['$comment', 'categories', 'entries'].includes(key)) {
      findings.push({
        kind: 'ledger-schema',
        subject: `${LEDGER_PATH}.${key}`,
        detail: '裁定台帳に未知の項目があります（$comment / categories / entries のみ）',
      });
    }
  }

  const rawCategories = parsed['categories'];
  const categories: Record<string, string> = {};
  if (!isPlainObject(rawCategories) || Object.keys(rawCategories).length === 0) {
    findings.push({
      kind: 'ledger-schema',
      subject: `${LEDGER_PATH}.categories`,
      detail: '区分の宣言（categories）が無いか空です',
    });
  } else {
    for (const [name, description] of Object.entries(rawCategories)) {
      if (!isNonEmptyString(description)) {
        findings.push({
          kind: 'ledger-schema',
          subject: `${LEDGER_PATH}.categories.${name}`,
          detail: '区分の説明が空です',
        });
        continue;
      }
      categories[name] = description;
    }
  }

  const rawEntries = parsed['entries'];
  if (!Array.isArray(rawEntries)) {
    findings.push({
      kind: 'ledger-schema',
      subject: `${LEDGER_PATH}.entries`,
      detail: '裁定（entries）が配列ではありません',
    });
    return { ledger: null, findings };
  }

  const entries: LedgerEntry[] = [];
  rawEntries.forEach((rawEntry, index) => {
    const pointer = `${LEDGER_PATH}.entries[${index}]`;
    if (!isPlainObject(rawEntry)) {
      findings.push({
        kind: 'ledger-schema',
        subject: pointer,
        detail: '項目がオブジェクトではありません',
      });
      return;
    }
    for (const key of Object.keys(rawEntry)) {
      if (!(LEDGER_ENTRY_KEYS as readonly string[]).includes(key)) {
        findings.push({
          kind: 'ledger-schema',
          subject: `${pointer}.${key}`,
          detail: `未知の欄です（許される欄: ${LEDGER_ENTRY_KEYS.join(' / ')}）`,
        });
      }
    }
    const missingKeys = LEDGER_ENTRY_KEYS.filter((key) => !(key in rawEntry));
    if (missingKeys.length > 0) {
      findings.push({
        kind: 'ledger-schema',
        subject: pointer,
        detail: `必須の欄がありません: ${missingKeys.join(' / ')}`,
      });
      return;
    }
    const { id, literal, criterionText, category, reason, alternativeBasis, evidence, unverified } =
      rawEntry;
    if (
      !isNonEmptyString(id) ||
      !isNonEmptyString(literal) ||
      !isNonEmptyString(criterionText) ||
      !isNonEmptyString(category) ||
      typeof reason !== 'string' ||
      typeof alternativeBasis !== 'string' ||
      !Array.isArray(evidence) ||
      typeof unverified !== 'boolean'
    ) {
      findings.push({
        kind: 'ledger-schema',
        subject: pointer,
        detail:
          '欄の型が違います（id / literal / criterionText / category は非空の文字列、evidence は配列、unverified は真偽値）',
      });
      return;
    }
    if (!evidence.every((item): item is string => isNonEmptyString(item))) {
      findings.push({
        kind: 'ledger-schema',
        subject: `${pointer}.evidence`,
        detail: '所在の一覧に非空の文字列でない要素があります',
      });
      return;
    }
    entries.push({
      id,
      literal,
      criterionText,
      category,
      reason,
      alternativeBasis,
      evidence,
      unverified,
    });
  });

  return { ledger: { categories, entries }, findings };
}

/**
 * 検査本体
 *
 * 判定の流れは三段である。
 *   1. 現役の受入基準から逐語を取り出し、走査根に一度も現れない組を集める
 *   2. 台帳を読み、形式・逐語複製・代替の根拠・件数のラチェットを見る
 *   3. 集めた組と台帳を突き合わせ、未登録の組と、対応しなくなった台帳の項目を挙げる
 */
export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? REPOSITORY_ROOT;
  const ledgerRelative = options.ledgerPath ?? LEDGER_PATH;
  const entryLimit = options.entryLimit ?? LEDGER_ENTRY_LIMIT;
  const findings: Finding[] = [];

  // --- 1. 条文の側 -----------------------------------------------------------
  const features = discoverFeatureNames(root);
  let criterionCount = 0;
  let criterionWithLiteralCount = 0;
  let literalCount = 0;
  const candidates: MissingLiteral[] = [];
  /** `<id>\u0000<literal>` → 条文の情報。台帳の照合に使う */
  const criterionIndex = new Map<string, { criterionText: string; line: number }>();
  /** `<id>` → 条文の本文（逐語複製の照合に使う） */
  const criterionTextById = new Map<string, string>();

  for (const feature of features) {
    const documentPath = requirementsDocumentPath(root, feature);
    const content = readFileSync(documentPath, 'utf8');
    for (const requirement of scanRequirementsDocument(content, documentPath)) {
      for (const criterion of requirement.criteria) {
        criterionCount += 1;
        const id = `${feature}/${requirement.id}.${criterion.number}`;
        criterionTextById.set(id, criterion.text);
        const seen = new Set<string>();
        for (const literal of extractQuotedLiterals(criterion.text)) {
          if (seen.has(literal.value)) continue;
          seen.add(literal.value);
          literalCount += 1;
          criterionIndex.set(`${id}\u0000${literal.value}`, {
            criterionText: criterion.text,
            line: criterion.line,
          });
        }
        if (seen.size > 0) criterionWithLiteralCount += 1;
        for (const value of seen) {
          candidates.push({
            id,
            literal: value,
            criterionText: criterion.text,
            line: criterion.line,
          });
        }
      }
    }
  }

  // --- 2. 実装の側 -----------------------------------------------------------
  const implementationFiles = listImplementationFiles(root);
  const implementationBlob = implementationFiles
    .map((relative) => readFileSync(path.join(root, relative), 'utf8'))
    .join('\u0000');
  const appearsInImplementation = (literal: string): boolean =>
    implementationBlob.includes(literal);

  const missing = candidates.filter((candidate) => !appearsInImplementation(candidate.literal));

  // --- 3. 台帳 ---------------------------------------------------------------
  const { ledger, findings: ledgerFindings } = loadLedger(path.join(root, ledgerRelative));
  findings.push(...ledgerFindings);

  const registered = new Set<string>();
  let unverifiedCount = 0;
  if (ledger) {
    const seenKeys = new Set<string>();
    ledger.entries.forEach((entry, index) => {
      const pointer = `${ledgerRelative}.entries[${index}]（${entry.id}）`;
      const key = `${entry.id}\u0000${entry.literal}`;
      if (seenKeys.has(key)) {
        findings.push({
          kind: 'ledger-schema',
          subject: pointer,
          detail: `同じ受入基準・同じ逐語の裁定が重複しています（${entry.literal}）`,
        });
        return;
      }
      seenKeys.add(key);
      registered.add(key);
      if (entry.unverified) unverifiedCount += 1;

      if (!(entry.category in ledger.categories)) {
        findings.push({
          kind: 'ledger-schema',
          subject: pointer,
          detail: `未宣言の区分です（${entry.category}）。categories へ足してください`,
        });
      }
      if (entry.unverified !== (entry.category === UNVERIFIED_CATEGORY)) {
        findings.push({
          kind: 'ledger-schema',
          subject: pointer,
          detail: `unverified は区分 ${UNVERIFIED_CATEGORY} と一対一です（区分 ${entry.category} に unverified=${entry.unverified}）`,
        });
      }
      for (const prose of [
        { name: 'reason', value: entry.reason },
        { name: 'alternativeBasis', value: entry.alternativeBasis },
      ]) {
        if ([...prose.value.trim()].length < MINIMUM_PROSE_LENGTH) {
          findings.push({
            kind: 'ledger-schema',
            subject: `${pointer}.${prose.name}`,
            detail: `${MINIMUM_PROSE_LENGTH} 文字以上で書いてください（現在 ${[...prose.value.trim()].length} 文字）`,
          });
        }
      }
      if (entry.evidence.length === 0) {
        findings.push({
          kind: 'ledger-schema',
          subject: `${pointer}.evidence`,
          detail: '関連する実装の所在を一件以上挙げてください（是正すべき箇所でもよい）',
        });
      }
      for (const relative of entry.evidence) {
        if (!existsSync(path.join(root, relative))) {
          findings.push({
            kind: 'ledger-schema',
            subject: `${pointer}.evidence`,
            detail: `所在が実在しません: ${relative}`,
          });
        }
      }

      const criterionText = criterionTextById.get(entry.id);
      if (criterionText === undefined) {
        findings.push({
          kind: 'ledger-drift',
          subject: pointer,
          detail:
            '指す受入基準が要件定義書に現役で実在しません（撤廃・改番されたなら裁定を取り下げてください）',
        });
        return;
      }
      if (criterionText !== entry.criterionText) {
        findings.push({
          kind: 'ledger-drift',
          subject: pointer,
          detail: '逐語複製（criterionText）が要件定義書の条文と一致しません',
          context: `要件定義書: ${criterionText}`,
        });
      }
      if (!criterionIndex.has(key)) {
        findings.push({
          kind: 'ledger-drift',
          subject: pointer,
          detail: `逐語 ${entry.literal} は当該の受入基準から取り出せません（条文が改訂された可能性）`,
        });
      }

      if (entry.category === DRIFT_CATEGORY) {
        const quoted = extractQuotedLiterals(entry.alternativeBasis);
        const grounded = quoted.some((item) => appearsInImplementation(item.value));
        if (!grounded) {
          findings.push({
            kind: 'ledger-basis',
            subject: pointer,
            detail: `区分 ${DRIFT_CATEGORY} は、実装側の実際の綴りを鉤括弧で引いてください（引いた ${quoted.length} 件のいずれも走査根に実在しません）`,
          });
        }
      }
    });

    if (ledger.entries.length !== entryLimit) {
      findings.push({
        kind: 'ledger-ratchet',
        subject: ledgerRelative,
        detail:
          `裁定が ${ledger.entries.length} 件で、宣言した件数 ${entryLimit} 件と一致しません` +
          '（増やすなら LEDGER_ENTRY_LIMIT を上げる判断を、減らしたなら下げる更新を、同じ変更の中で行ってください）',
      });
    }

    for (const key of registered) {
      const [id = '', literal = ''] = key.split('\u0000');
      if (missing.some((entry) => entry.id === id && entry.literal === literal)) continue;
      findings.push({
        kind: 'stale-ledger-entry',
        subject: `${ledgerRelative}（${id}）`,
        detail: `逐語 ${literal} は現況では欠落していません（是正されたか条文が変わりました）。裁定を取り下げてください`,
      });
    }
  }

  for (const entry of missing) {
    if (registered.has(`${entry.id}\u0000${entry.literal}`)) continue;
    findings.push({
      kind: 'unregistered-literal',
      subject: entry.id,
      detail: `条文が名指す逐語「${entry.literal}」が ${IMPLEMENTATION_ROOTS.join(' / ')} に一度も現れません`,
      context: entry.criterionText,
    });
  }

  const detectorPositive = (() => {
    const literals = extractQuotedLiterals(DETECTOR_POSITIVE_CONTROL);
    if (literals.length !== 1) return false;
    const value = literals[0]?.value ?? '';
    return implementationBlob.length > 0 && !appearsInImplementation(value);
  })();

  findings.sort((a, b) => a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));

  return {
    findings,
    featureCount: features.length,
    criterionCount,
    criterionWithLiteralCount,
    literalCount,
    implementationFileCount: implementationFiles.length,
    missing,
    ledgerEntryCount: ledger?.entries.length ?? 0,
    unverifiedCount,
    detectorPositive,
  };
}

// ============================================================================
// 走査の出口（合否は出さない。--survey）
// ============================================================================

/**
 * 本検査の走査根に含まれるが、**本番として実行される行ではない**ファイルの見分け
 *
 * 走査根を狭める判断は本検査の境界の外である（利用者が母集団の大きさを見て関門化を決めた
 * ため、走査根を動かすと前提が変わる）。ここで分けるのは**開示のため**であって判定のためでは
 * ない。`--survey` の出力は合否に一切影響しない。
 */
export function isTestFile(relative: string): boolean {
  return (
    relative.includes('/__tests__/') ||
    relative.includes('/__mocks__/') ||
    relative.includes('/test-utils/') ||
    /\.(test|spec|stories)\.[a-z]+$/.test(relative)
  );
}

/** 生成コード（Prisma のクライアントなど） */
export function isGeneratedFile(relative: string): boolean {
  return relative.includes('/generated/');
}

/**
 * 註釈の行か
 *
 * **行頭の綴りだけで判定する素朴な規則である。** 行内に註釈が始まる形（`const x = 1; // 註`）
 * や、複数行の塊の中で行頭が本文から始まる形は本番の行として数える。**そのため本走査の
 * 「註釈にしか無い」は下界である**——実際にはこれより多い可能性がある。開示は安全側に誤る
 * ため、下界であることを明記して使う。
 */
export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

/** 逐語が走査根のどこに現れるか */
export interface LiteralEvidence {
  id: string;
  literal: string;
  /** 本番ファイル（テストでも生成コードでもない）の**非註釈行**に現れるか */
  inProductionCode: boolean;
  /** 本番ファイルの註釈行に現れるか */
  inProductionComment: boolean;
  /** テストファイルに現れるか */
  inTestFile: boolean;
  /** 生成コードに現れるか */
  inGeneratedFile: boolean;
}

export interface SurveyResult {
  /** 走査根に綴りが在り、本検査が通した組 */
  passing: number;
  /** そのうち本番の非註釈行に一度も無い組 */
  absentFromProductionCode: LiteralEvidence[];
  /** 上のうち、本番ファイルの**註釈行には**現れる組（JSDoc へ写すだけで緑になる形） */
  commentBacked: LiteralEvidence[];
  /** 上のうち、現れる場所が本番の註釈行だけの組（テストにも生成コードにも無い） */
  commentOnly: LiteralEvidence[];
  /** 上のうち、現れる場所がテストファイルだけの組 */
  testOnly: LiteralEvidence[];
  /** 上のうち、現れる場所が生成コードだけの組 */
  generatedOnly: LiteralEvidence[];
}

/**
 * 註釈の抜け道の実額を数える（合否は出さない）
 *
 * **本検査は走査根に註釈行を含む。したがって条文の逐語を JSDoc へ写すだけで赤が緑になる。**
 * その抜け道がどれだけ使われているかを後任が測り直せるよう、走査の出口をここへ置く
 * （`scripts/survey-task-record-quotations.ts` や `scripts/scan-coverage-mark-correspondence.ts`
 * と同じ位置づけである）。
 */
export function survey(options: RunOptions = {}): SurveyResult {
  const root = options.root ?? REPOSITORY_ROOT;
  const files = listImplementationFiles(root).map((relative) => ({
    relative,
    lines: readFileSync(path.join(root, relative), 'utf8').split('\n'),
  }));

  const evidences: LiteralEvidence[] = [];
  for (const feature of discoverFeatureNames(root)) {
    const content = readFileSync(requirementsDocumentPath(root, feature), 'utf8');
    for (const requirement of scanRequirementsDocument(
      content,
      requirementsDocumentPath(root, feature)
    )) {
      for (const criterion of requirement.criteria) {
        const seen = new Set<string>();
        for (const literal of extractQuotedLiterals(criterion.text)) {
          if (seen.has(literal.value)) continue;
          seen.add(literal.value);
          const evidence: LiteralEvidence = {
            id: `${feature}/${requirement.id}.${criterion.number}`,
            literal: literal.value,
            inProductionCode: false,
            inProductionComment: false,
            inTestFile: false,
            inGeneratedFile: false,
          };
          for (const file of files) {
            for (const line of file.lines) {
              if (!line.includes(literal.value)) continue;
              if (isTestFile(file.relative)) evidence.inTestFile = true;
              else if (isGeneratedFile(file.relative)) evidence.inGeneratedFile = true;
              else if (isCommentLine(line)) evidence.inProductionComment = true;
              else evidence.inProductionCode = true;
            }
          }
          evidences.push(evidence);
        }
      }
    }
  }

  const passing = evidences.filter(
    (evidence) =>
      evidence.inProductionCode ||
      evidence.inProductionComment ||
      evidence.inTestFile ||
      evidence.inGeneratedFile
  );
  const absentFromProductionCode = passing.filter((evidence) => !evidence.inProductionCode);
  return {
    passing: passing.length,
    absentFromProductionCode,
    commentBacked: absentFromProductionCode.filter((evidence) => evidence.inProductionComment),
    commentOnly: absentFromProductionCode.filter(
      (evidence) =>
        evidence.inProductionComment && !evidence.inTestFile && !evidence.inGeneratedFile
    ),
    testOnly: absentFromProductionCode.filter(
      (evidence) =>
        evidence.inTestFile && !evidence.inProductionComment && !evidence.inGeneratedFile
    ),
    generatedOnly: absentFromProductionCode.filter(
      (evidence) =>
        evidence.inGeneratedFile && !evidence.inProductionComment && !evidence.inTestFile
    ),
  };
}

/** 走査が空振りしていないかの判定。0 件の合格を合格にしない（AI運用7原則 第3原則） */
export function decideExit(result: RunResult): { ok: boolean; reason?: string } {
  if (result.featureCount === 0) {
    return { ok: false, reason: '要件定義書を持つ機能が一件も見つかりませんでした' };
  }
  if (result.criterionCount === 0) {
    return { ok: false, reason: '現役の受入基準が 0 件です（読み取り規則が壊れています）' };
  }
  if (result.literalCount === 0) {
    return { ok: false, reason: '鉤括弧の逐語を一つも取り出せませんでした' };
  }
  if (result.implementationFileCount === 0) {
    return { ok: false, reason: '実装の走査根からファイルを一件も読めませんでした' };
  }
  if (!result.detectorPositive) {
    return { ok: false, reason: '判定器が陽性の対照を検出しませんでした' };
  }
  if (result.findings.length > 0) {
    return { ok: false, reason: `${result.findings.length} 件の指摘があります` };
  }
  return { ok: true };
}

/** `--survey` の出力。合否は出さない（終了コードは常に 0） */
function printSurvey(tsv: boolean): void {
  const result = survey();
  if (tsv) {
    console.log(`passing\t${result.passing}`);
    console.log(`production-noncomment-absent\t${result.absentFromProductionCode.length}`);
    console.log(`comment-backed\t${result.commentBacked.length}`);
    console.log(`comment-only\t${result.commentOnly.length}`);
    console.log(`test-only\t${result.testOnly.length}`);
    console.log(`generated-only\t${result.generatedOnly.length}`);
    for (const evidence of result.absentFromProductionCode) {
      const where = [
        evidence.inProductionComment ? 'comment' : '',
        evidence.inTestFile ? 'test' : '',
        evidence.inGeneratedFile ? 'generated' : '',
      ]
        .filter(Boolean)
        .join('+');
      console.log(`absent\t${evidence.id}\t${evidence.literal}\t${where}`);
    }
    return;
  }
  console.log('🔎 註釈の抜け道の実額（合否は出しません。走査の出口です）');
  console.log('');
  console.log(`   本検査が通した組: ${result.passing} 件`);
  console.log(
    `   うち本番の非註釈行に一度も無い組: ${result.absentFromProductionCode.length} 件` +
      `（本番の註釈行には在る ${result.commentBacked.length} 件——うち本番の註釈だけ` +
      ` ${result.commentOnly.length} 件。テストだけ ${result.testOnly.length} 件 /` +
      ` 生成コードだけ ${result.generatedOnly.length} 件）`
  );
  console.log('');
  console.log('   条文の逐語を JSDoc へ写すだけで本検査は緑になります。');
  console.log('   全件は --survey --tsv で印字します。');
  for (const evidence of result.absentFromProductionCode) {
    console.log(`   - ${evidence.id}: 「${evidence.literal}」`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  if (args.includes('--survey')) {
    printSurvey(args.includes('--tsv'));
    return;
  }

  const result = run();
  if (json) console.log(JSON.stringify(result, null, 2));

  const decision = decideExit(result);
  const summary =
    `走査 ${result.featureCount} 機能 / 現役の受入基準 ${result.criterionCount} 件、` +
    `逐語を名指す条文 ${result.criterionWithLiteralCount} 件 / 逐語 ${result.literalCount} 件、` +
    `実装 ${result.implementationFileCount} ファイル、` +
    `実装に無い組 ${result.missing.length} 件（うち台帳 ${result.ledgerEntryCount} 件、` +
    `支えが無いと裁定 ${result.unverifiedCount} 件）`;

  if (decision.ok) {
    if (!json) {
      console.log(`✅ 受入基準が名指す逐語は、実装に在るか台帳で裁定済みです（${summary}）`);
    }
    return;
  }

  if (!json) {
    if (result.findings.length === 0) {
      console.error(`❌ ${decision.reason}`);
      console.error(`   走査根: ${IMPLEMENTATION_ROOTS.join(' / ')}`);
      console.error('   リポジトリルートで実行しているか確認してください');
      process.exit(1);
    }

    console.error('❌ 受入基準が名指す逐語の実在に指摘があります');
    console.error('');
    console.error('   被覆を数える関門は「番号を名乗る検証が在るか」までしか見ません。');
    console.error('   条文が名指す綴りが実装のどこにも無いなら、その番号を名乗る検証が');
    console.error('   何を確かめていても、条文は一度も実装に届いていません（タスク 115.292）。');
    console.error('');
    for (const finding of result.findings) {
      console.error(`   [${finding.kind}] ${finding.subject}`);
      console.error(`        ${finding.detail}`);
      if (verbose && finding.context) console.error(`        条文: ${finding.context}`);
    }
    console.error('');
    console.error('   対応方法（赤の解除条件は二択です）:');
    console.error('     1. 是正する——実装へ逐語を入れるか、条文を実装の綴りへ揃える');
    console.error(`     2. 台帳へ登録する——${LEDGER_PATH} へ理由と代替の根拠を書く`);
    console.error(
      `        （登録すると件数が動くので ${LEDGER_PATH} と LEDGER_ENTRY_LIMIT を同時に更新すること）`
    );
    console.error('');
    console.error(`   合計 ${result.findings.length} 件（${summary}）`);
  }
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === MODULE_PATH) {
  main();
}
