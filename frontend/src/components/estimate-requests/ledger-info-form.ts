/**
 * @fileoverview 受領見積書の台帳の情報の欄の値・検証・変換（LedgerInfoSection の値の形）
 *
 * 数の欄は入力の途中の文字を保つため文字で持ち、`toLedgerInfoInput` で保存の入力へ直す。
 * 検証の規則と文言はサーバーの検証（受領見積書の台帳の項目の検証）と同じにそろえる。
 *
 * 根拠: 46.1, 46.2, 46.3, 46.6, 48.2（estimate-request のタスク117.3）
 *
 * タスク124.1: 読取の確認の経路の表示名と、確認者・日時・経路の要約の文字を足す
 * （46.19, 46.20。design の章「Requirements 45.14〜45.16・46.12〜46.21・48.9〜48.11」の D21）
 */

import { formatDateTime } from '../../utils/formatters';
import type {
  ConstructionKind,
  QuotationAdoption,
  ReadingConfirmationRoute,
  ReadingStatus,
  ReceivedQuotationInfo,
  ReceivedQuotationLedgerInput,
} from '../../api/received-quotations';

/**
 * 採否の文字（46.3）。台帳の情報の欄の選択肢と、単価台帳の画面の表示が使う（unit-price-ledger タスク6.6）
 */
export const ADOPTION_LABELS: Readonly<Record<QuotationAdoption, string>> = {
  ADOPTED: '採用',
  REJECTED: '不採用',
  UNKNOWN: '不明',
};

/** 読取の確認の文字（46.6）。使い手は {@link ADOPTION_LABELS} と同じ */
export const READING_STATUS_LABELS: Readonly<Record<ReadingStatus, string>> = {
  UNCONFIRMED: '未確認',
  CONFIRMED: '確認済み',
};

/** 読取の確認の経路の表示名（46.19）。フォームの台帳の情報の欄と一覧の札が使う */
export const READING_CONFIRMATION_ROUTE_LABELS: Readonly<Record<ReadingConfirmationRoute, string>> =
  {
    SCREEN: '画面',
    LEDGER_IMPORT: '台帳の取り込み',
    ARCHIBENCH: 'ArchiBench',
  };

/** 追補の前に確認済みになった受領見積書（経路が null）の表示の文字（46.20） */
export const READING_ROUTE_NOT_RECORDED_TEXT = '経路の記録なし';

/** 確認の要約の入力 */
export interface ReadingConfirmationSummaryInput {
  /** 確認者の表示名。名前を引けないとき（確認者の利用者が消えた）は null で、「—」と出す */
  confirmedByName: string | null | undefined;
  /** 確認の日時。記録が無いときは「—」と出す */
  confirmedAt: Date | null;
  /**
   * 読取の確認の経路。null は追補の前の確認済み（経路の記録なし）。
   * 渡さない（undefined）と経路に触れない従来の文字にする（単価台帳の画面の表示を変えない）
   */
  route?: ReadingConfirmationRoute | null;
}

/**
 * 確認者・日時・経路の要約の文字を作る（46.19・46.20）。
 * フォームの台帳の情報の欄と一覧の読取の確認の札の両方が使う
 */
export function formatReadingConfirmationSummary({
  confirmedByName,
  confirmedAt,
  route,
}: ReadingConfirmationSummaryInput): string {
  const confirmedAtText = confirmedAt ? formatDateTime(confirmedAt.toISOString()) : '—';
  const base = `確認者: ${confirmedByName || '—'}　確認日時: ${confirmedAtText}`;
  if (route === undefined) return base;
  if (route === null) return `${base}　${READING_ROUTE_NOT_RECORDED_TEXT}`;
  return `${base}　経路: ${READING_CONFIRMATION_ROUTE_LABELS[route]}`;
}

/** 改修／新営の文字（46.2）。使い手は {@link ADOPTION_LABELS} と同じ */
export const CONSTRUCTION_KIND_LABELS: Readonly<Record<ConstructionKind, string>> = {
  RENOVATION: '改修',
  NEW_CONSTRUCTION: '新営',
};

/** 整数円の上限（DB の `Decimal(15,0)`。サーバーの検証と同じ） */
const MAX_YEN_AMOUNT = 999_999_999_999_999;
/** 距離の上限（DB の `Decimal(6,1)`。サーバーの検証と同じ） */
const MAX_DISTANCE_KM = 99_999.9;

/** 文字の欄の上限（Data Models の長さ。46.1・46.2・48.2） */
export const LEDGER_INFO_MAX_LENGTHS = {
  quoteNumber: 100,
  overallConditions: 2000,
  siteLocation: 100,
  useType: 100,
  workConditions: 200,
  quoteDiscriminator: 100,
} as const;

/** 検証の文言（サーバーの `RECEIVED_QUOTATION_VALIDATION_MESSAGES` と同じ） */
export const LEDGER_INFO_VALIDATION_MESSAGES = {
  QUOTE_NUMBER_TOO_LONG: '見積番号は100文字以内で入力してください',
  OVERALL_CONDITIONS_TOO_LONG: '見積全体の条件は2000文字以内で入力してください',
  SITE_LOCATION_TOO_LONG: '場所は100文字以内で入力してください',
  USE_TYPE_TOO_LONG: '用途は100文字以内で入力してください',
  WORK_CONDITIONS_TOO_LONG: '作業条件は200文字以内で入力してください',
  CONSTRUCTION_PRICE_INVALID: '工事価格は0以上の整数（円）で入力してください',
  DISTANCE_KM_INVALID: '距離は0以上の数値を小数第1位までで入力してください',
  CONFIRMED_AMOUNT_INVALID: '確定金額は0以上の整数（円）で入力してください',
  QUOTE_DISCRIMINATOR_TOO_LONG: '見積の区別は100文字以内で入力してください',
  QUOTE_DISCRIMINATOR_WHITESPACE: '見積の区別の前後に空白を入れないでください',
} as const;

/** 台帳の情報の欄の値（画面の入力の形。数の欄は入力の途中の文字を保つため文字で持つ） */
export interface LedgerInfoFormData {
  quoteNumber: string;
  overallConditions: string;
  siteLocation: string;
  /** 空の文字は未設定 */
  constructionKind: ConstructionKind | '';
  useType: string;
  constructionPrice: string;
  workConditions: string;
  distanceKm: string;
  adoption: QuotationAdoption;
  confirmedAmount: string;
  readingStatus: ReadingStatus;
  quoteDiscriminator: string;
}

/** 欄ごとの誤りの文言 */
export type LedgerInfoErrors = Partial<Record<keyof LedgerInfoFormData, string>>;

/** 保存の入力のうち台帳の情報の欄が受け持つ部分（業者名と取引先は VendorNameInput が受け持つ） */
export type LedgerInfoInput = Required<
  Omit<ReceivedQuotationLedgerInput, 'vendorName' | 'tradingPartnerId'>
>;

/** 受領見積書から欄の値を作るときに読む欄 */
export type LedgerInfoSource = Pick<
  ReceivedQuotationInfo,
  | 'quoteNumber'
  | 'overallConditions'
  | 'siteLocation'
  | 'constructionKind'
  | 'useType'
  | 'constructionPrice'
  | 'workConditions'
  | 'distanceKm'
  | 'adoption'
  | 'confirmedAmount'
  | 'readingStatus'
  | 'quoteDiscriminator'
>;

const toText = (value: string | null | undefined): string => value ?? '';
const toNumberText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

/**
 * 受領見積書の値（無ければ既定）から欄の値を作る。既定は 改修／新営が未設定・採否が不明・読取が未確認・見積の区別が空
 */
export function createLedgerInfoFormData(source?: LedgerInfoSource | null): LedgerInfoFormData {
  return {
    quoteNumber: toText(source?.quoteNumber),
    overallConditions: toText(source?.overallConditions),
    siteLocation: toText(source?.siteLocation),
    constructionKind: source?.constructionKind ?? '',
    useType: toText(source?.useType),
    constructionPrice: toNumberText(source?.constructionPrice),
    workConditions: toText(source?.workConditions),
    distanceKm: toNumberText(source?.distanceKm),
    adoption: source?.adoption ?? 'UNKNOWN',
    confirmedAmount: toNumberText(source?.confirmedAmount),
    readingStatus: source?.readingStatus ?? 'UNCONFIRMED',
    quoteDiscriminator: source?.quoteDiscriminator ?? '',
  };
}

/** 0 以上の整数円の文字か（空は可） */
function isValidYenText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (!/^\d+$/.test(trimmed)) return false;
  return Number(trimmed) <= MAX_YEN_AMOUNT;
}

/** 0 以上・小数第 1 位までの距離の文字か（空は可） */
function isValidDistanceText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (!/^\d+(\.\d)?$/.test(trimmed)) return false;
  return Number(trimmed) <= MAX_DISTANCE_KM;
}

/**
 * 欄の値を検証し、誤りのある欄だけの文言を返す（サーバーの検証と同じ規則・文言）
 */
export function validateLedgerInfo(data: LedgerInfoFormData): LedgerInfoErrors {
  const errors: LedgerInfoErrors = {};
  const max = LEDGER_INFO_MAX_LENGTHS;
  const msg = LEDGER_INFO_VALIDATION_MESSAGES;

  if (data.quoteNumber.length > max.quoteNumber) errors.quoteNumber = msg.QUOTE_NUMBER_TOO_LONG;
  if (data.overallConditions.length > max.overallConditions) {
    errors.overallConditions = msg.OVERALL_CONDITIONS_TOO_LONG;
  }
  if (data.siteLocation.length > max.siteLocation) errors.siteLocation = msg.SITE_LOCATION_TOO_LONG;
  if (data.useType.length > max.useType) errors.useType = msg.USE_TYPE_TOO_LONG;
  if (data.workConditions.length > max.workConditions) {
    errors.workConditions = msg.WORK_CONDITIONS_TOO_LONG;
  }
  if (!isValidYenText(data.constructionPrice)) {
    errors.constructionPrice = msg.CONSTRUCTION_PRICE_INVALID;
  }
  if (!isValidDistanceText(data.distanceKm)) errors.distanceKm = msg.DISTANCE_KM_INVALID;
  if (!isValidYenText(data.confirmedAmount)) errors.confirmedAmount = msg.CONFIRMED_AMOUNT_INVALID;
  if (data.quoteDiscriminator.length > max.quoteDiscriminator) {
    errors.quoteDiscriminator = msg.QUOTE_DISCRIMINATOR_TOO_LONG;
  } else if (data.quoteDiscriminator !== data.quoteDiscriminator.trim()) {
    errors.quoteDiscriminator = msg.QUOTE_DISCRIMINATOR_WHITESPACE;
  }
  return errors;
}

const toNullableText = (text: string): string | null => (text === '' ? null : text);
const toNullableNumber = (text: string): number | null =>
  text.trim() === '' ? null : Number(text.trim());

/**
 * 欄の値を保存の入力へ直す。空の文字の欄と未設定は null（消す）、数の欄は数にする。
 * 採否・読取の確認・見積の区別は null を持たない（空の文字を送らない。112.2 の申し送り）。
 * 検証（`validateLedgerInfo`）を通った値を渡すこと
 */
export function toLedgerInfoInput(data: LedgerInfoFormData): LedgerInfoInput {
  return {
    quoteNumber: toNullableText(data.quoteNumber),
    overallConditions: toNullableText(data.overallConditions),
    siteLocation: toNullableText(data.siteLocation),
    constructionKind: data.constructionKind === '' ? null : data.constructionKind,
    useType: toNullableText(data.useType),
    constructionPrice: toNullableNumber(data.constructionPrice),
    workConditions: toNullableText(data.workConditions),
    distanceKm: toNullableNumber(data.distanceKm),
    adoption: data.adoption,
    confirmedAmount: toNullableNumber(data.confirmedAmount),
    readingStatus: data.readingStatus,
    quoteDiscriminator: data.quoteDiscriminator,
  };
}
