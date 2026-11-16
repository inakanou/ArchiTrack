/**
 * @fileoverview 見積カードの読み取りと受領見積書への対応づけ（unit-price-ledger タスク2.2、design.md の LedgerCardParser）
 *
 * アップロードされた zip と JSON から見積カード（共通スクリプト daicho の見積カードの形）を読み、
 * 必須の項目を検査し、案件の無い受領見積書と明細行の欄へ対応づける。DB に依らない純粋な処理。
 *
 * - zip は fflate の `unzipSync` で読み、`.json` の項目だけを選ぶ。項目の数・1 項目の展開後の大きさ・
 *   展開後の合計を、展開の前に申告の大きさで確かめ、展開の後に実際の大きさでも確かめる。
 *   上限を超えたら要求の全体を `LedgerImportTooLargeError`（413）で拒む
 * - `.json` でない項目・ディレクトリ・不正な名前（`..`・絶対パス・ドライブ名・`\`・制御文字・`__MACOSX/`）の項目は読まない
 * - 検査は JSON として読めることと必須の項目（id・業者・見積日・行と、各行の名称・数量・単位・金額）に限る（2.2）。
 *   失敗はそのカードだけの理由として返す（2.3）
 * - 任意の項目の不正な値は空にし、読めなかった欄を `unreadableFields` に返す（参考の理由はタスク2.3 が付ける）
 * - 上限を超える文字は上限までで切り詰め、切り詰めた欄を `truncatedFields` に返す（2.9）
 * - カードの内容はログに出さない
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 *
 * @module services/unit-price-ledger/ledger-card-parser
 */

import { unzipSync, type UnzipFileInfo } from 'fflate';
import { LedgerImportTooLargeError } from '../../errors/unitPriceLedgerError.js';
import {
  LINE_ITEM_FIELD_LIMITS,
  RECEIVED_QUOTATION_FIELD_LIMITS,
  createReceivedQuotationSchema,
  receivedQuotationLedgerFieldsShape,
  type LineItemCategory,
  type LineItemConversion,
} from '../../schemas/received-quotation.schema.js';
import { LEDGER_FIELD_LIMITS } from '../../schemas/unit-price-ledger.schema.js';

const MB = 1024 * 1024;

/**
 * 取り込みの上限（design.md の LedgerCardParser）
 */
export const LEDGER_IMPORT_LIMITS = {
  /** zip のファイルの大きさ */
  zipSize: 50 * MB,
  /** zip の中の項目の数（要求の中のすべての zip の計） */
  zipEntryCount: 2000,
  /** zip の中の 1 項目の展開後の大きさ */
  zipEntrySize: 1 * MB,
  /** zip の展開後の合計の大きさ（要求の中のすべての zip の計） */
  zipTotalUncompressedSize: 200 * MB,
  /** 1 要求のファイルの数 */
  fileCount: 2000,
  /** JSON のファイル 1 個の大きさ */
  jsonFileSize: 1 * MB,
} as const;

export type LedgerImportLimits = { readonly [K in keyof typeof LEDGER_IMPORT_LIMITS]: number };

/**
 * アップロードされたファイル（multer の memoryStorage で受けた内容）
 */
export interface LedgerUploadFile {
  originalName: string;
  buffer: Buffer;
  mimeType: string;
}

/**
 * 受領見積書の見積の情報の欄（estimate-request Requirement 46）
 */
export interface LedgerQuotationFields {
  quoteNumber: string | null;
  overallConditions: string | null;
  siteLocation: string | null;
  constructionKind: 'RENOVATION' | 'NEW_CONSTRUCTION' | null;
  useType: string | null;
  constructionPrice: number | null;
  workConditions: string | null;
  distanceKm: number | null;
  adoption: 'ADOPTED' | 'REJECTED' | 'UNKNOWN';
  confirmedAmount: number | null;
}

/**
 * 取り込む明細行（受領見積書の明細行の欄。estimate-request Requirement 11・45）。
 * 参考の印と理由は、タスク2.3 の参考の理由が付ける（ここでは印を付けない）
 */
export interface LedgerLineItemInput {
  sortOrder: number;
  name: string;
  specification: string | null;
  unit: string;
  quantity: number;
  unitPrice: number | null;
  amount: number;
  remarks: string | null;
  category: LineItemCategory;
  condition: string | null;
  conversion: LineItemConversion | null;
  isReference: boolean;
  referenceReason: string | null;
}

/**
 * 案件の無い受領見積書として登録する内容（design.md の LedgerQuotationInput）
 */
export interface LedgerQuotationInput {
  ledgerCardId: string;
  ledgerSourcePath: string | null;
  ledgerProjectName: string | null;
  vendorName: string;
  /** 受領見積書の名前（「<業者>_<見積日>」） */
  name: string;
  /** 見積日（UTC の 0 時） */
  submittedAt: Date;
  ledgerFields: LedgerQuotationFields;
  /** カードの読取の確認（「済」なら confirmed）と読取の日時（2.12・2.13 は取り込みが使う） */
  readingConfirmed: { confirmed: boolean; readAt: Date | null };
  lineItems: LedgerLineItemInput[];
}

/**
 * カードの合計（参考の理由の合計の不一致をタスク2.3 が比べる）。カードに無い・読めない合計は null
 */
export interface LedgerDeclaredTotals {
  taxExcluded: number | null;
  DISCOUNT: number | null;
  OVERHEAD: number | null;
  TRAVEL: number | null;
  WASTE: number | null;
}

/**
 * ファイル（zip の中は項目）ごとの読み取りの結果
 *
 * - `truncatedFields`：上限で切り詰めた欄（2.9。取り込みの結果と参考の理由に使う）
 * - `unreadableFields`：不正な値のため空にした任意の欄（参考の理由に使う）
 * - `referenceReasons`：カードの参考.理由（タスク2.3 が自動の理由を加える）
 */
export type LedgerCardParseOutcome =
  | {
      kind: 'parsed';
      fileName: string;
      cardId: string;
      input: LedgerQuotationInput;
      truncatedFields: string[];
      unreadableFields: string[];
      referenceReasons: string[];
      declaredTotals: LedgerDeclaredTotals;
    }
  | { kind: 'failed'; fileName: string; reason: string };

/** 失敗の理由の文言 */
export const LEDGER_CARD_FAILURE_REASONS = {
  JSON_UNREADABLE: 'JSON として読み込めません',
  NOT_CARD_OBJECT: '見積カードの形（JSON のオブジェクト）ではありません',
  REQUIRED_PREFIX: '必須の項目が欠けているか読めません：',
  ZIP_UNREADABLE: 'zip として読み込めません',
  ZIP_WITHOUT_CARDS: 'zip の中に見積カード（.json）がありません',
  UNSUPPORTED_FILE: '見積カードの zip または JSON のファイルではありません',
  UNSUPPORTED_COMPRESSION: 'zip の項目の圧縮の形式に対応していません',
} as const;

/** 受領見積書の名前の上限（受領見積書の登録の検証の定義から取る） */
const QUOTATION_NAME_MAX = (() => {
  const max = createReceivedQuotationSchema.shape.name.maxLength;
  if (max === null) {
    throw new Error('受領見積書の名前の上限が検証の定義にありません');
  }
  return max;
})();

/** カードの行の区分 → 明細行の区分（2.6。本体は直接工事） */
const CARD_LINE_CATEGORIES: Readonly<Record<string, LineItemCategory>> = {
  本体: 'DIRECT',
  諸経費: 'OVERHEAD',
  交通費: 'TRAVEL',
  産廃: 'WASTE',
  値引き: 'DISCOUNT',
  法定福利費: 'LEGAL_WELFARE',
  別途: 'EXCLUDED',
};

const CARD_CONSTRUCTION_KINDS: Readonly<Record<string, 'RENOVATION' | 'NEW_CONSTRUCTION'>> = {
  改修: 'RENOVATION',
  新営: 'NEW_CONSTRUCTION',
};

const CARD_ADOPTIONS: Readonly<Record<string, 'ADOPTED' | 'REJECTED' | 'UNKNOWN'>> = {
  採用: 'ADOPTED',
  不採用: 'REJECTED',
  不明: 'UNKNOWN',
};

/** 一覧の値をつなぐ文字（作業条件・工種） */
const LIST_SEPARATOR = '、';

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 読めない値（任意の欄の不正な値） */
const INVALID = Symbol('invalid');
type Read<T> = T | null | typeof INVALID;

/**
 * 1 枚のカードの読み取りの記録（切り詰めた欄と読めなかった欄を順に集める）
 */
class CardReadLog {
  readonly truncated: string[] = [];
  readonly unreadable: string[] = [];

  /** 文字を上限（UTF-16 の長さ）までで切り詰める。サロゲートペアは割らない */
  truncate(value: string, max: number, label: string): string {
    if (value.length <= max) return value;
    let out = '';
    for (const char of value) {
      if (out.length + char.length > max) break;
      out += char;
    }
    this.truncated.push(label);
    return out;
  }

  /** 読めない値は空にして記録する */
  resolve<T>(value: Read<T>, label: string): T | null {
    if (value === INVALID) {
      this.unreadable.push(label);
      return null;
    }
    return value;
  }
}

/** 文字の値（数も文字にする）。無い・空白だけは null、ほかの形は読めない値 */
const readText = (value: unknown): Read<string> => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** 数の値（数の文字も数にする）。無い・空の文字は null、数でないものは読めない値 */
const readNumber = (value: unknown): Read<number> => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : INVALID;
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : INVALID;
};

/** 文字の一覧（文字だけの配列、または 1 つの文字）を「、」でつなぐ */
const readTextList = (value: unknown): Read<string> => {
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const item of value) {
      const text = readText(item);
      if (text === INVALID) return INVALID;
      if (text !== null) items.push(text);
    }
    return items.length > 0 ? items.join(LIST_SEPARATOR) : null;
  }
  return readText(value);
};

/** 受領見積書の台帳の項目の検証の定義で値を確かめる（工事価格・確定金額・距離） */
const readBySchema = (
  value: unknown,
  schema:
    | typeof receivedQuotationLedgerFieldsShape.constructionPrice
    | typeof receivedQuotationLedgerFieldsShape.confirmedAmount
    | typeof receivedQuotationLedgerFieldsShape.distanceKm
): Read<number> => {
  const num = readNumber(value);
  if (num === null || num === INVALID) return num;
  const result = schema.safeParse(num);
  return result.success && typeof result.data === 'number' ? result.data : INVALID;
};

/** YYYY-MM-DD の実在する日付を UTC の 0 時の日付にする */
const parseCardDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
};

/**
 * 読取の日時。時差の無い日時は日本の時刻（+09:00）として読む（台帳は日本の会社の記録のため）
 */
const readDateTime = (value: unknown): Read<Date> => {
  const text = readText(value);
  if (text === null || text === INVALID) return text;
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      text
    );
  if (!match) return INVALID;
  const [, datePart, timePart, offset] = match;
  if (!parseCardDate(datePart)) return INVALID;
  const iso = `${datePart}T${timePart ?? '00:00'}${offset ?? '+09:00'}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? INVALID : date;
};

const readLookup = <T>(value: unknown, table: Readonly<Record<string, T>>): Read<T> => {
  const text = readText(value);
  if (text === null || text === INVALID) return text;
  return Object.prototype.hasOwnProperty.call(table, text) ? (table[text] as T) : INVALID;
};

/** 必須の文字（空白だけは欠け） */
const requiredText = (value: unknown): string | null => {
  const text = readText(value);
  return text === INVALID ? null : text;
};

/** 必須の数 */
const requiredNumber = (value: unknown): number | null => {
  const num = readNumber(value);
  return num === INVALID ? null : num;
};

const lineLabel = (index: number, field: string): string => `明細行 ${index + 1} 行目の${field}`;

/** 換算（4 つすべてがそろい、数量が 0 より大きい。estimate-request 45.9） */
const readConversion = (
  value: unknown,
  log: CardReadLog,
  index: number
): Read<LineItemConversion> => {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) return INVALID;
  const quantity = readNumber(value['数量']);
  const unit = readText(value['単位']);
  const unitPrice = readNumber(value['単価']);
  const basis = readText(value['根拠']);
  if (quantity === null && unit === null && unitPrice === null && basis === null) return null;
  if (
    typeof quantity !== 'number' ||
    quantity <= 0 ||
    typeof unit !== 'string' ||
    typeof unitPrice !== 'number' ||
    typeof basis !== 'string'
  ) {
    return INVALID;
  }
  return {
    quantity,
    unit: log.truncate(unit, LINE_ITEM_FIELD_LIMITS.conversionUnit, lineLabel(index, '換算の単位')),
    unitPrice,
    basis: log.truncate(
      basis,
      LINE_ITEM_FIELD_LIMITS.conversionBasis,
      lineLabel(index, '換算の根拠')
    ),
  };
};

/** 備考の末尾に細目を「細目：」の見出しで足す（2.7） */
const composeRemarks = (remarks: string | null, detail: string | null): string | null => {
  const parts = [remarks, detail === null ? null : `細目：${detail}`].filter(
    (part): part is string => part !== null
  );
  return parts.length > 0 ? parts.join('\n') : null;
};

/** 必須の項目を検査する（2.2）。欠けた・読めない項目の名前の一覧を返す */
const findMissingRequired = (card: JsonObject): string[] => {
  const missing: string[] = [];
  if (requiredText(card['id']) === null) missing.push('id');
  if (requiredText(card['業者']) === null) missing.push('業者');
  if (parseCardDate(card['見積日']) === null) missing.push('見積日');
  const lines = card['行'];
  if (!Array.isArray(lines) || lines.length === 0) {
    missing.push('行');
    return missing;
  }
  lines.forEach((line: unknown, index) => {
    const label = `行 ${index + 1}`;
    if (!isObject(line)) {
      missing.push(label);
      return;
    }
    if (requiredText(line['名称']) === null) missing.push(`${label} の名称`);
    if (requiredNumber(line['数量']) === null) missing.push(`${label} の数量`);
    if (requiredText(line['単位']) === null) missing.push(`${label} の単位`);
    if (requiredNumber(line['金額']) === null) missing.push(`${label} の金額`);
  });
  return missing;
};

const readLineItem = (line: JsonObject, index: number, log: CardReadLog): LedgerLineItemInput => {
  const specification = log.resolve(readText(line['規格']), lineLabel(index, '規格'));
  const unitPrice = log.resolve(readNumber(line['単価']), lineLabel(index, '単価'));
  const category = log.resolve(
    readLookup(line['区分'], CARD_LINE_CATEGORIES),
    lineLabel(index, '区分')
  );
  const conditionText = log.resolve(readText(line['条件']), lineLabel(index, '条件'));
  const condition =
    conditionText === null
      ? null
      : log.truncate(conditionText, LINE_ITEM_FIELD_LIMITS.condition, lineLabel(index, '条件'));
  const conversion = log.resolve(
    readConversion(line['換算'], log, index),
    lineLabel(index, '換算')
  );
  const remarks = log.resolve(readText(line['備考']), lineLabel(index, '備考'));
  const detail = log.resolve(readText(line['細目']), lineLabel(index, '細目'));
  return {
    sortOrder: index,
    name: requiredText(line['名称']) as string,
    specification,
    unit: requiredText(line['単位']) as string,
    quantity: requiredNumber(line['数量']) as number,
    unitPrice,
    amount: requiredNumber(line['金額']) as number,
    remarks: composeRemarks(remarks, detail),
    category: category ?? 'DIRECT',
    condition,
    conversion,
    isReference: false,
    referenceReason: null,
  };
};

const truncateNullable = (
  value: string | null,
  max: number,
  label: string,
  log: CardReadLog
): string | null => (value === null ? null : log.truncate(value, max, label));

/** 見積全体の条件の末尾に、見出しを付けて足す項目（2.8） */
const composeOverallConditions = (
  conditions: string | null,
  appended: ReadonlyArray<readonly [string, string | null]>
): string | null => {
  const parts = [
    conditions,
    ...appended.map(([heading, value]) => (value === null ? null : `${heading}：${value}`)),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join('\n') : null;
};

/** カードの参考.理由（文字の一覧）。読めない理由は無視する（参考の理由の扱いはタスク2.3） */
const readCardReferenceReasons = (value: unknown): string[] => {
  if (!isObject(value) || !Array.isArray(value['理由'])) return [];
  return value['理由'].flatMap((reason: unknown) => {
    const text = readText(reason);
    return typeof text === 'string' ? [text] : [];
  });
};

const readDeclaredTotals = (value: unknown, log: CardReadLog): LedgerDeclaredTotals => {
  const totals = isObject(value) ? value : {};
  if (value !== undefined && value !== null && !isObject(value)) {
    log.unreadable.push('合計');
  }
  const read = (key: string, label: string): number | null =>
    log.resolve(readNumber(totals[key]), label);
  return {
    taxExcluded: read('税抜', '合計の税抜'),
    DISCOUNT: read('値引き', '合計の値引き'),
    OVERHEAD: read('諸経費', '合計の諸経費'),
    TRAVEL: read('交通費', '合計の交通費'),
    WASTE: read('産廃', '合計の産廃'),
  };
};

/** 必須の項目のそろったカードを受領見積書の形へ対応づける（2.4〜2.9） */
const mapCard = (
  card: JsonObject,
  fileName: string
): Extract<LedgerCardParseOutcome, { kind: 'parsed' }> => {
  const log = new CardReadLog();
  const project = isObject(card['案件']) ? card['案件'] : {};
  const source = isObject(card['原本']) ? card['原本'] : {};
  const reading = isObject(card['読取']) ? card['読取'] : {};
  const submittedDate = (card['見積日'] as string).trim();

  const ledgerCardId = log.truncate(
    requiredText(card['id']) as string,
    LEDGER_FIELD_LIMITS.ledgerCardId,
    'カードの ID'
  );
  const vendorName = log.truncate(
    requiredText(card['業者']) as string,
    RECEIVED_QUOTATION_FIELD_LIMITS.vendorName,
    '業者名'
  );
  const name = log.truncate(`${vendorName}_${submittedDate}`, QUOTATION_NAME_MAX, '受領見積書名');

  const quoteNumber = log.resolve(readText(card['見積番号']), '見積番号');
  const sourcePath = log.resolve(readText(source['パス']), '原本のパス');
  const projectName = log.resolve(readText(project['名称']), '案件名');
  const siteLocation = log.resolve(readText(project['場所']), '場所');
  const constructionKind = log.resolve(
    readLookup(project['区分'], CARD_CONSTRUCTION_KINDS),
    '改修／新営'
  );
  const useType = log.resolve(readText(project['用途']), '用途');
  const constructionPrice = log.resolve(
    readBySchema(project['工事価格'], receivedQuotationLedgerFieldsShape.constructionPrice),
    '工事価格'
  );
  const workConditions = log.resolve(readTextList(project['作業条件']), '作業条件');
  const distanceKm = log.resolve(
    readBySchema(project['片道km'], receivedQuotationLedgerFieldsShape.distanceKm),
    '片道の距離'
  );
  const adoption = log.resolve(readLookup(card['採否'], CARD_ADOPTIONS), '採否');
  const confirmedAmount = log.resolve(
    readBySchema(card['確定金額'], receivedQuotationLedgerFieldsShape.confirmedAmount),
    '確定金額'
  );
  const conditions = log.resolve(readText(card['条件']), '見積全体の条件');
  const orderer = log.resolve(readText(project['発注者']), '発注者');
  const floorArea = log.resolve(readText(project['延床m2']), '延床');
  const priceBasis = log.resolve(readText(project['工事価格の根拠']), '工事価格の根拠');
  const trades = log.resolve(readTextList(card['工種']), '工種');
  const readingMethod = log.resolve(readText(reading['方法']), '読取の方法');
  const readingMemo = log.resolve(readText(reading['メモ']), '読取のメモ');
  const kind = log.resolve(readText(card['種別']), '種別');
  const readAt = log.resolve(readDateTime(reading['日時']), '読取の日時');

  const overallConditions = composeOverallConditions(conditions, [
    ['発注者', orderer],
    ['延床（㎡）', floorArea],
    ['工事価格の根拠', priceBasis],
    ['工種', trades],
    ['読取の方法', readingMethod],
    ['読取のメモ', readingMemo],
    ['種別', kind],
  ]);

  // 切り詰めは欄の並び（カードの ID・業者名・受領見積書名の後）の順に記録する
  const ledgerFields: LedgerQuotationFields = {
    quoteNumber: truncateNullable(
      quoteNumber,
      RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber,
      '見積番号',
      log
    ),
    overallConditions: null,
    siteLocation: null,
    constructionKind,
    useType: null,
    constructionPrice,
    workConditions: null,
    distanceKm,
    adoption: adoption ?? 'UNKNOWN',
    confirmedAmount,
  };
  const ledgerSourcePath = truncateNullable(
    sourcePath,
    LEDGER_FIELD_LIMITS.ledgerSourcePath,
    '原本のパス',
    log
  );
  const ledgerProjectName = truncateNullable(
    projectName,
    LEDGER_FIELD_LIMITS.ledgerProjectName,
    '案件名',
    log
  );
  ledgerFields.siteLocation = truncateNullable(
    siteLocation,
    RECEIVED_QUOTATION_FIELD_LIMITS.siteLocation,
    '場所',
    log
  );
  ledgerFields.useType = truncateNullable(
    useType,
    RECEIVED_QUOTATION_FIELD_LIMITS.useType,
    '用途',
    log
  );
  ledgerFields.workConditions = truncateNullable(
    workConditions,
    RECEIVED_QUOTATION_FIELD_LIMITS.workConditions,
    '作業条件',
    log
  );
  ledgerFields.overallConditions = truncateNullable(
    overallConditions,
    RECEIVED_QUOTATION_FIELD_LIMITS.overallConditions,
    '見積全体の条件',
    log
  );

  const lineItems = (card['行'] as JsonObject[]).map((line, index) =>
    readLineItem(line, index, log)
  );
  const declaredTotals = readDeclaredTotals(card['合計'], log);

  return {
    kind: 'parsed',
    fileName,
    cardId: ledgerCardId,
    input: {
      ledgerCardId,
      ledgerSourcePath,
      ledgerProjectName,
      vendorName,
      name,
      submittedAt: parseCardDate(submittedDate) as Date,
      ledgerFields,
      readingConfirmed: { confirmed: readText(reading['確認']) === '済', readAt },
      lineItems,
    },
    truncatedFields: log.truncated,
    unreadableFields: log.unreadable,
    referenceReasons: readCardReferenceReasons(card['参考']),
    declaredTotals,
  };
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** 1 枚のカード（JSON の中身）を読む */
const parseCardBytes = (fileName: string, bytes: Uint8Array): LedgerCardParseOutcome => {
  let card: unknown;
  try {
    const text = utf8Decoder.decode(bytes).replace(/^﻿/, '');
    card = JSON.parse(text);
  } catch {
    return { kind: 'failed', fileName, reason: LEDGER_CARD_FAILURE_REASONS.JSON_UNREADABLE };
  }
  if (!isObject(card)) {
    return { kind: 'failed', fileName, reason: LEDGER_CARD_FAILURE_REASONS.NOT_CARD_OBJECT };
  }
  const missing = findMissingRequired(card);
  if (missing.length > 0) {
    return {
      kind: 'failed',
      fileName,
      reason: `${LEDGER_CARD_FAILURE_REASONS.REQUIRED_PREFIX}${missing.join(LIST_SEPARATOR)}`,
    };
  }
  return mapCard(card, fileName);
};

const ZIP_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);
const JSON_MIME_TYPES = new Set(['application/json', 'text/json']);

const hasExtension = (name: string, ext: string): boolean => name.toLowerCase().endsWith(ext);

const isZipFile = (file: LedgerUploadFile): boolean =>
  hasExtension(file.originalName, '.zip') || ZIP_MIME_TYPES.has(file.mimeType);

const isJsonFile = (file: LedgerUploadFile): boolean =>
  hasExtension(file.originalName, '.json') || JSON_MIME_TYPES.has(file.mimeType);

/**
 * UTF-8 の印の無い項目の名前を、fflate が 1 バイト 1 文字で読んだ形から UTF-8 として読み直す。
 * UTF-8 として読めなければ、そのままにする
 */
const redecodeEntryName = (name: string): string => {
  if (/^[\u0000-\u007f]*$/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  try {
    return utf8Decoder.decode(Uint8Array.from(name, (char) => char.charCodeAt(0)));
  } catch {
    return name;
  }
};

/** 読んでよい項目の名前か（`..`・絶対パス・ドライブ名・`\`・制御文字・`__MACOSX/` を拒む） */
const isSafeEntryName = (name: string): boolean => {
  if (name === '' || name.startsWith('/') || name.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  const segments = name.split('/');
  if (segments.some((segment) => segment === '..')) return false;
  return segments[0] !== '__MACOSX';
};

/** 要求の全体で数える zip の項目の数と展開後の合計 */
interface ZipBudget {
  entryCount: number;
  totalSize: number;
}

const readZip = (
  file: LedgerUploadFile,
  limits: LedgerImportLimits,
  budget: ZipBudget
): LedgerCardParseOutcome[] => {
  // 対応していない圧縮の形式の項目も、zip の中の順に結果を返すため同じ一覧に置く
  const selected: Array<{ rawName: string; name: string; unsupported: boolean }> = [];
  const addSize = (size: number): void => {
    if (size > limits.zipEntrySize) {
      throw new LedgerImportTooLargeError('ENTRY_SIZE', limits.zipEntrySize);
    }
    budget.totalSize += size;
    if (budget.totalSize > limits.zipTotalUncompressedSize) {
      throw new LedgerImportTooLargeError(
        'TOTAL_UNCOMPRESSED_SIZE',
        limits.zipTotalUncompressedSize
      );
    }
  };
  // 展開の前に、申告の大きさで項目を選ぶ（展開した後の実際の大きさでも確かめる）
  const filter = (info: UnzipFileInfo): boolean => {
    budget.entryCount += 1;
    if (budget.entryCount > limits.zipEntryCount) {
      throw new LedgerImportTooLargeError('ENTRY_COUNT', limits.zipEntryCount);
    }
    const name = redecodeEntryName(info.name);
    if (name.endsWith('/') || !hasExtension(name, '.json') || !isSafeEntryName(name)) {
      return false;
    }
    if (info.compression !== 0 && info.compression !== 8) {
      selected.push({ rawName: info.name, name, unsupported: true });
      return false;
    }
    addSize(Math.max(info.originalSize, info.compression === 0 ? info.size : 0));
    selected.push({ rawName: info.name, name, unsupported: false });
    return true;
  };

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(file.buffer), { filter });
  } catch (error) {
    if (error instanceof LedgerImportTooLargeError) throw error;
    return [
      {
        kind: 'failed',
        fileName: file.originalName,
        reason: LEDGER_CARD_FAILURE_REASONS.ZIP_UNREADABLE,
      },
    ];
  }

  const outcomes: LedgerCardParseOutcome[] = [];
  const seen = new Set<string>();
  for (const { rawName, name, unsupported } of selected) {
    if (seen.has(rawName)) continue;
    seen.add(rawName);
    if (unsupported) {
      outcomes.push({
        kind: 'failed',
        fileName: name,
        reason: LEDGER_CARD_FAILURE_REASONS.UNSUPPORTED_COMPRESSION,
      });
      continue;
    }
    const data = entries[rawName];
    if (!data) continue;
    if (data.length > limits.zipEntrySize) {
      throw new LedgerImportTooLargeError('ENTRY_SIZE', limits.zipEntrySize);
    }
    outcomes.push(parseCardBytes(name, data));
  }
  if (outcomes.length === 0) {
    outcomes.push({
      kind: 'failed',
      fileName: file.originalName,
      reason: LEDGER_CARD_FAILURE_REASONS.ZIP_WITHOUT_CARDS,
    });
  }
  return outcomes;
};

/**
 * アップロードされたファイルから見積カードを読み、ファイル（zip の中は項目）ごとの結果を入力の順に返す
 *
 * @throws LedgerImportTooLargeError 上限を超えたとき（要求の全体を拒む。ほかの失敗はカードごとの結果に入れる）
 */
export function parseUpload(
  files: ReadonlyArray<LedgerUploadFile>,
  limits: LedgerImportLimits = LEDGER_IMPORT_LIMITS
): LedgerCardParseOutcome[] {
  if (files.length > limits.fileCount) {
    throw new LedgerImportTooLargeError('FILE_COUNT', limits.fileCount);
  }
  // 大きさの上限は、読み始める前にすべてのファイルで確かめる
  for (const file of files) {
    if (isZipFile(file)) {
      if (file.buffer.length > limits.zipSize) {
        throw new LedgerImportTooLargeError('ZIP_SIZE', limits.zipSize);
      }
    } else if (isJsonFile(file) && file.buffer.length > limits.jsonFileSize) {
      throw new LedgerImportTooLargeError('FILE_SIZE', limits.jsonFileSize);
    }
  }

  const budget: ZipBudget = { entryCount: 0, totalSize: 0 };
  return files.flatMap((file): LedgerCardParseOutcome[] => {
    if (isZipFile(file)) return readZip(file, limits, budget);
    if (isJsonFile(file)) return [parseCardBytes(file.originalName, file.buffer)];
    return [
      {
        kind: 'failed',
        fileName: file.originalName,
        reason: LEDGER_CARD_FAILURE_REASONS.UNSUPPORTED_FILE,
      },
    ];
  });
}
