/**
 * @fileoverview 外部AIの応答形式に対する契約検証（estimate-request タスク 91.1）の主張の組み立て
 *
 * 実APIを呼ぶ検証（`claude-vision.contract.ts`）と、その主張が正しく組み立っていることを
 * 既知の応答で確かめる自己検査（`claude-vision-contract-shape.selftest.ts`）の両方が、
 * ここにある関数を使う。主張の実装を一箇所に置き、両者が食い違わないようにする。
 *
 * ## 何を主張するか（構造だけ）
 *
 * 本番の解釈（`ClaudeVisionService.extractLineItems`）が前提とする応答の形を主張する。
 *
 * - 応答が途中で切れずに完了している（`stop_reason` が `end_turn`）
 * - 応答にテキストのブロックがあり、そこから本番の解析関数が JSON 配列を取り出せる（Req 21.5, 26.5, 26.6）
 * - 配列の各要素がオブジェクトである
 * - 名称が文字列である。任意分類・工種・規格・単位・備考が文字列・数値・null（または欠落）のいずれかである
 * - 数量・単価・金額が、null（または欠落）でなければ**本番の数値変換で数値として解釈できる**（Req 26.7, 26.8）。
 *   応答が数値以外（例えば「約10」）を返し、本番の変換が黙って null に落とす形を違反として拾う
 * - 本番の変換後の明細が 9 項目をちょうど持ち、各項目の型が約束どおりである（Req 21.6, 21.7）
 * - 頁数が整数で、送った画像の枚数と一致する
 * - 空の配列や、数値が一つも入っていない配列で自明に成立しない（少なくとも 1 行が数量・単価・金額の三つを持つ）
 *
 * ## 何を主張しないか
 *
 * 抽出結果の内容（数値そのものの正しさ、集計行が除外されたか、行数）は主張しない。
 * モデルの出力は決定的ではなく、内容を主張すると恒常的に不安定になる（タスク 91.1）。
 *
 * ## 違反の文言に応答の内容を載せない
 *
 * 日次の実行ログは公開される（タスク 91.2）。違反の文言には位置・項目名・`typeof` だけを載せ、
 * 応答の本文や値は載せない。この性質は自己検査が固定する。
 *
 * @module __tests__/contract/claude-vision-contract-shape
 */
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClaudeVisionService,
  type ClaudeVisionExtractionResult,
  type ClaudeVisionImageInput,
} from '../../services/claude-vision.service.js';

// ============================================================================
// 認証（WIF）の前提
// ============================================================================

/** WIF の交換に必須の環境変数 */
export const REQUIRED_WIF_VARIABLES = [
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_SERVICE_ACCOUNT_ID',
] as const;

/** 識別トークンの渡し方（どちらか一つが要る） */
export const IDENTITY_TOKEN_VARIABLES = [
  'ANTHROPIC_IDENTITY_TOKEN_FILE',
  'ANTHROPIC_IDENTITY_TOKEN',
] as const;

/**
 * WIF より優先されてしまう環境変数。空文字であっても設定されていれば、SDK は WIF でなく
 * こちらで認証を解決しうる（タスク 91.2）。契約検証は WIF の経路で実APIに届くことを前提とするため、
 * 設定されていれば失敗させる。
 */
export const SHADOWING_CREDENTIAL_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_PROFILE',
] as const;

/** ファイルが存在し中身があるか（既定は実ファイルシステムを見る） */
export type NonEmptyFileProbe = (filePath: string) => boolean;

const defaultNonEmptyFileProbe: NonEmptyFileProbe = (filePath) => {
  try {
    return statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

/**
 * WIF の前提が揃っていない理由を列挙する。揃っていれば空配列を返す。
 *
 * 文言には変数名だけを載せ、値は載せない。
 * 認証の情報が無いときに検証を skip せず失敗させるため、呼び出し側はこの結果が空でなければ例外を投げる。
 */
export function findWifEnvironmentProblems(
  env: NodeJS.ProcessEnv,
  isNonEmptyFile: NonEmptyFileProbe = defaultNonEmptyFileProbe
): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_WIF_VARIABLES) {
    if (!env[name]) {
      problems.push(`${name} が未設定または空である`);
    }
  }

  const tokenFile = env.ANTHROPIC_IDENTITY_TOKEN_FILE;
  const tokenValue = env.ANTHROPIC_IDENTITY_TOKEN;
  if (!tokenFile && !tokenValue) {
    problems.push(`${IDENTITY_TOKEN_VARIABLES.join(' と ')} がどちらも未設定である`);
  } else if (tokenFile && !isNonEmptyFile(tokenFile)) {
    problems.push('ANTHROPIC_IDENTITY_TOKEN_FILE が指すファイルが無いか空である');
  }

  for (const name of SHADOWING_CREDENTIAL_VARIABLES) {
    if (name in env) {
      problems.push(`${name} が設定されている（空文字でも WIF より優先されうるため、外すこと）`);
    }
  }

  return problems;
}

// ============================================================================
// 本番のサービスへ実クライアントを差し込む
// ============================================================================

/**
 * 本番の `ClaudeVisionService` に、外から構築したクライアントを差し込んで返す。
 *
 * 本番のコンストラクタは API キーを引数に取り `new Anthropic({ apiKey })` を構築する
 * （Requirement 22）。契約検証は WIF で認証するため、クライアントは**引数なしで**構築し
 * （タスク 91.1）、キーを渡す経路は通さない。そのため、キーを渡さずに構築したサービス
 * （この時点では無効の状態）へ、非公開の `client` / `enabled` を差し替える。
 *
 * プロンプト・モデル・送信の形・解析関数は本番のものがそのまま使われる。複製すると本番とずれるためである。
 * 非公開の名前が本番で変わった場合は、差し替えが効かず `extractLineItems` が
 * 「サービス無効」で失敗する（黙って緑にはならない）。
 */
export function createServiceWithClient(client: Anthropic): ClaudeVisionService {
  const service = new ClaudeVisionService(undefined);
  Reflect.set(service, 'client', client);
  Reflect.set(service, 'enabled', true);
  return service;
}

/**
 * 本番の非公開の解析関数（応答の本文から JSON 配列を取り出す）をそのまま呼ぶ。
 *
 * 取り出しの規則（コードブロックの剥がし、最初の `[` から最後の `]` まで）を契約検証側に
 * 複製しないために、本番の実装を借りる。本番で名前が変わった場合は、ここが例外を投げて検証が失敗する。
 */
export function extractJsonArrayWithProductionParser(
  service: ClaudeVisionService,
  responseText: string
): unknown[] {
  const extract: unknown = Reflect.get(service, 'extractJsonArray');
  if (typeof extract !== 'function') {
    throw new Error(
      '本番の ClaudeVisionService に extractJsonArray が見当たらない（名前が変わった可能性）'
    );
  }
  const parsed: unknown = extract.call(service, responseText);
  if (!Array.isArray(parsed)) {
    throw new Error('本番の extractJsonArray が配列を返さなかった');
  }
  return parsed;
}

/** 本番の非公開の数値変換（カンマ除去を含む）をそのまま呼ぶ */
function parseNumericWithProductionParser(service: ClaudeVisionService, value: unknown): unknown {
  const parse: unknown = Reflect.get(service, 'parseNumericField');
  if (typeof parse !== 'function') {
    throw new Error(
      '本番の ClaudeVisionService に parseNumericField が見当たらない（名前が変わった可能性）'
    );
  }
  return parse.call(service, value);
}

// ============================================================================
// 固定の入力画像
// ============================================================================

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** 固定の入力画像（2 頁分）。生成は `fixtures/generate-estimate-sheet-fixtures.ts` */
export const FIXTURE_IMAGE_FILES = ['estimate-sheet-page-1.png', 'estimate-sheet-page-2.png'];

export function loadFixtureImages(): ClaudeVisionImageInput[] {
  return FIXTURE_IMAGE_FILES.map((fileName) => ({
    base64Data: readFileSync(path.join(FIXTURE_DIR, fileName)).toString('base64'),
    mediaType: 'image/png',
  }));
}

// ============================================================================
// 応答の構造の主張
// ============================================================================

/** 本番の明細行が持つ項目（Requirement 21.7） */
export const LINE_ITEM_FIELDS = [
  'customCategory',
  'workType',
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'amount',
  'remarks',
] as const;

const NUMERIC_FIELDS = ['quantity', 'unitPrice', 'amount'] as const;
const NULLABLE_TEXT_FIELDS = [
  'customCategory',
  'workType',
  'specification',
  'unit',
  'remarks',
] as const;

/** 値の種別（違反の文言に載せるのはこれだけ。値そのものは載せない） */
function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 実APIの応答の本文（最初のテキストのブロック）を返す。無ければ null */
export function findResponseText(message: Anthropic.Messages.Message): string | null {
  const textBlock = message.content.find(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
  );
  return textBlock ? textBlock.text : null;
}

/**
 * 応答そのもの（本番の変換の前）の構造の違反を列挙する。
 *
 * 本番の変換は型を寄せる（`String(...)` や、数値にならない値を null に落とす）ため、
 * 変換後だけを見ると応答の形が崩れても気づけない。そこで変換の前の値を見る。
 */
export function findRawResponseViolations(
  service: ClaudeVisionService,
  message: Anthropic.Messages.Message
): string[] {
  const violations: string[] = [];

  if (message.stop_reason !== 'end_turn') {
    violations.push(`応答が完了していない（stop_reason=${String(message.stop_reason)}）`);
  }

  const text = findResponseText(message);
  if (text === null) {
    violations.push('応答にテキストのブロックが無い');
    return violations;
  }

  let rawItems: unknown[];
  try {
    rawItems = extractJsonArrayWithProductionParser(service, text);
  } catch {
    violations.push('応答の本文から本番の解析関数が JSON 配列を取り出せない');
    return violations;
  }

  rawItems.forEach((rawItem, index) => {
    if (!isPlainObject(rawItem)) {
      violations.push(`raw[${index}] がオブジェクトでない（${kindOf(rawItem)}）`);
      return;
    }

    if (typeof rawItem.name !== 'string' || rawItem.name.trim() === '') {
      violations.push(`raw[${index}].name が空でない文字列でない（${kindOf(rawItem.name)}）`);
    }

    for (const field of NULLABLE_TEXT_FIELDS) {
      const value = rawItem[field];
      const kind = kindOf(value);
      if (!['string', 'number', 'null', 'undefined'].includes(kind)) {
        violations.push(`raw[${index}].${field} が文字列・数値・null のいずれでもない（${kind}）`);
      }
    }

    for (const field of NUMERIC_FIELDS) {
      const value = rawItem[field];
      if (value === null || value === undefined) continue;
      const parsed = parseNumericWithProductionParser(service, value);
      if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
        violations.push(
          `raw[${index}].${field} が本番の数値変換で数値として解釈できない（${kindOf(value)}）`
        );
      }
    }
  });

  return violations;
}

/**
 * 本番の変換後の抽出結果の構造の違反を列挙する。
 *
 * @param rawItemCount 変換前の配列の要素数（変換で行が増減していないことを見る）。分からなければ null
 */
export function findExtractionResultViolations(
  result: ClaudeVisionExtractionResult,
  sentImageCount: number,
  rawItemCount: number | null
): string[] {
  const violations: string[] = [];

  if (!Number.isInteger(result.pageCount)) {
    violations.push(`pageCount が整数でない（${kindOf(result.pageCount)}）`);
  } else if (result.pageCount !== sentImageCount) {
    violations.push('pageCount が送った画像の枚数と一致しない');
  }

  if (!Array.isArray(result.lineItems)) {
    violations.push(`lineItems が配列でない（${kindOf(result.lineItems)}）`);
    return violations;
  }
  if (result.lineItems.length === 0) {
    violations.push('lineItems が空である（構造の主張が自明に成立してしまう）');
  }
  if (rawItemCount !== null && result.lineItems.length !== rawItemCount) {
    violations.push('lineItems の件数が応答の配列の要素数と一致しない');
  }

  result.lineItems.forEach((item, index) => {
    const keys = Object.keys(item).sort();
    const expectedKeys = [...LINE_ITEM_FIELDS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      violations.push(`lineItems[${index}] の項目が ${LINE_ITEM_FIELDS.length} 項目と一致しない`);
    }
    if (typeof item.name !== 'string') {
      violations.push(`lineItems[${index}].name が文字列でない（${kindOf(item.name)}）`);
    }
    for (const field of NULLABLE_TEXT_FIELDS) {
      const kind = kindOf(item[field]);
      if (kind !== 'string' && kind !== 'null') {
        violations.push(`lineItems[${index}].${field} が文字列か null でない（${kind}）`);
      }
    }
    for (const field of NUMERIC_FIELDS) {
      const value = item[field];
      if (value === null) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        violations.push(
          `lineItems[${index}].${field} が有限の数値か null でない（${kindOf(value)}）`
        );
      }
    }
  });

  const hasFullyNumericRow = result.lineItems.some((item) =>
    NUMERIC_FIELDS.every((field) => typeof item[field] === 'number')
  );
  if (result.lineItems.length > 0 && !hasFullyNumericRow) {
    violations.push(
      '数量・単価・金額の三つが揃って数値である行が一つも無い（数値の変換の主張が自明に成立してしまう）'
    );
  }

  return violations;
}
