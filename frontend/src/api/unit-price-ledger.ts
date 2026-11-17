/**
 * @fileoverview 単価台帳の API クライアント（unit-price-ledger タスク4.1）
 *
 * 経路は backend の `/api/unit-price-ledger`（タスク3.1）。
 * - 一覧・詳細・修正・印の更新・削除・取り込み・書き出しは台帳の管理の権限（`unit_price_ledger:manage`）、
 *   似た単価の問い合わせは見積の編集の権限（`estimate:update`）が要る（Requirement 10.1・10.2）
 * - 書き出しは本文が必須で、絞り込まないときも `{}` を送る。出力の記録はサーバーが書いてから作るので、
 *   自動では送り直さない（記録が重なるため）
 * - 取り込みのファイルの欄は `files`
 *
 * 型は backend の応答（ledger-query.service.ts・ledger-import.service.ts・similar-price.service.ts）と
 * 要求の検証（unit-price-ledger.schema.ts）に合わせる。日時の欄は Date にして返す。
 */

import { apiClient } from './client';
import type {
  ConstructionKind,
  LineItemCategory,
  LineItemInfo,
  LineItemInput,
  QuotationAdoption,
  ReadingConfirmer,
  ReadingStatus,
  ReceivedQuotationLedgerInput,
} from './received-quotations';

// ============================================================================
// 定数
// ============================================================================

/** 台帳の管理の権限（backend の UNIT_PRICE_LEDGER_MANAGE_PERMISSION と同じ） */
export const UNIT_PRICE_LEDGER_MANAGE_PERMISSION = 'unit_price_ledger:manage';

/** 台帳の API の経路の根 */
const BASE_PATH = '/api/unit-price-ledger';

// ============================================================================
// 型定義
// ============================================================================

/** 一覧の絞り込み（4.2〜4.4）。書き出しの本文にも使う */
export interface LedgerFilter {
  /** 業者名・案件名・明細行の名称の部分一致 */
  keyword?: string;
  /** 見積日の期間（YYYY-MM-DD） */
  submittedFrom?: string;
  submittedTo?: string;
  /** 案件の有無 */
  hasProject?: boolean;
  adoption?: QuotationAdoption;
  readingStatus?: ReadingStatus;
  constructionKind?: ConstructionKind;
  /** 要確認（参考の印のある行を持つ） */
  needsReview?: boolean;
  /** 分類キーの無い行がある（直接工事・産廃で分類キーが空） */
  missingClassificationKey?: boolean;
  /** 削除済みの案件を除く（論理削除された案件の受領見積書を除く。4.9） */
  excludeDeletedProjects?: boolean;
}

/** 一覧の問い合わせ（絞り込みとページ。1 ページ 50 件） */
export interface LedgerListQuery extends LedgerFilter {
  page?: number;
}

/** 一覧の 1 件 */
export interface LedgerQuotationSummary {
  id: string;
  name: string;
  vendorName: string;
  submittedAt: Date;
  projectId: string | null;
  estimateRequestId: string | null;
  /** 案件があれば案件の名前、無ければ台帳の案件名 */
  projectName: string | null;
  /** 案件が論理削除されている（4.8。案件の無い見積は false） */
  projectDeleted: boolean;
  constructionKind: ConstructionKind | null;
  totalAmount: number | null;
  adoption: QuotationAdoption;
  readingStatus: ReadingStatus;
  hasReferenceLines: boolean;
  ledgerCardId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 一覧のページの情報 */
export interface LedgerPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** 一覧の応答 */
export interface LedgerQuotationList {
  data: LedgerQuotationSummary[];
  pagination: LedgerPagination;
}

/** 見積の詳細 */
export interface LedgerQuotationDetail {
  id: string;
  estimateRequestId: string | null;
  projectId: string | null;
  projectName: string | null;
  /** 案件が論理削除されている（4.8。案件の無い見積は false） */
  projectDeleted: boolean;
  name: string;
  vendorName: string;
  tradingPartnerId: string | null;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  quoteNumber: string | null;
  overallConditions: string | null;
  siteLocation: string | null;
  constructionKind: ConstructionKind | null;
  useType: string | null;
  constructionPrice: number | null;
  workConditions: string | null;
  distanceKm: number | null;
  adoption: QuotationAdoption;
  confirmedAmount: number | null;
  readingStatus: ReadingStatus;
  readingConfirmedAt: Date | null;
  readingConfirmedBy: ReadingConfirmer | null;
  quoteDiscriminator: string;
  ledgerCardId: string | null;
  ledgerSourcePath: string | null;
  ledgerProjectName: string | null;
  lineItems: LineItemInfo[];
  totalAmount: number | null;
  hasReferenceLines: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 案件の無い受領見積書の修正（PUT。5.1）
 *
 * 台帳の情報の欄は受領見積書の台帳の項目と同じ。業者名と見積日（ISO 8601 の日時）は必須。
 */
export interface LedgerQuotationUpdateInput extends Omit<
  ReceivedQuotationLedgerInput,
  'vendorName'
> {
  vendorName: string;
  submittedAt: string;
  ledgerProjectName?: string | null;
  ledgerSourcePath?: string | null;
  lineItems: LineItemInput[];
  /** 楽観的排他の更新の日時（ISO 8601） */
  expectedUpdatedAt: string;
}

/** 明細行ごとの印（参考の印と理由・分類キー） */
export interface LedgerLineItemMark {
  id: string;
  isReference?: boolean;
  referenceReason?: string | null;
  classificationKey?: string | null;
}

/** 印の更新（PATCH。5.2〜5.4） */
export interface LedgerMarksUpdateInput {
  readingStatus?: ReadingStatus;
  lineItems: LedgerLineItemMark[];
  /** 楽観的排他の更新の日時（ISO 8601） */
  expectedUpdatedAt: string;
}

/** 取り込みの結果（2.15） */
export interface LedgerImportResult {
  importedCount: number;
  skipped: Array<{ cardId: string }>;
  failed: Array<{ fileName: string; reason: string }>;
  truncated: Array<{ cardId: string; fields: string[] }>;
  referenceMarkedCount: number;
}

/** 似た単価の問い合わせ（7.1〜7.6） */
export interface SimilarPriceQuery {
  name: string;
  specification?: string;
  unit?: string;
  classificationKey?: string;
  workType?: string;
  constructionKind?: ConstructionKind;
  siteLocation?: string;
}

/**
 * 按分の状態
 * - `ALLOCATED`：按分できた
 * - `BASE_NOT_POSITIVE`：按分の基準が 0 以下（8.6）
 * - `UNIT_PRICE_UNDETERMINED`：単価を決められない（8.8）
 */
export type SimilarPriceAllocationStatus =
  | 'ALLOCATED'
  | 'BASE_NOT_POSITIVE'
  | 'UNIT_PRICE_UNDETERMINED';

/**
 * 整数に丸める前の按分の内訳（8.9）。小数点以下 10 桁までの十進の文字（末尾の 0 を除く）
 */
export interface SimilarPriceUnroundedAllocation {
  unitPrice: string;
  overheadAllocation: string;
  discountAllocation: string;
  appliedUnitPrice: string;
}

/** 按分の内訳（8.1〜8.9）。金額は桁を失わないよう文字で返り、単価を決められない行は null */
export type SimilarPriceAllocation =
  | {
      allocationStatus: Exclude<SimilarPriceAllocationStatus, 'UNIT_PRICE_UNDETERMINED'>;
      unitPrice: string;
      overheadAllocation: string;
      discountAllocation: string;
      appliedUnitPrice: string;
      /** 按分の基準が 0 より大きく、按分できたか（8.6） */
      allocatable: boolean;
      /** 反映する単価が 0 以上で、反映できるか（8.7） */
      applicable: boolean;
      /** 整数に丸める前の 4 つの値（8.9） */
      unrounded: SimilarPriceUnroundedAllocation;
    }
  | {
      allocationStatus: 'UNIT_PRICE_UNDETERMINED';
      unitPrice: null;
      overheadAllocation: null;
      discountAllocation: null;
      appliedUnitPrice: null;
      allocatable: false;
      applicable: false;
      unrounded: null;
    };

/** 似た単価の候補の区分（直接工事・産廃だけ。7.1） */
export type SimilarPriceCategory = Extract<LineItemCategory, 'DIRECT' | 'WASTE'>;

/** 似た単価の候補（9.1〜9.4 の表示制御の後） */
export interface SimilarPriceCandidate {
  lineItemId: string;
  vendorName: string;
  /** 見積日（YYYY-MM-DD） */
  submittedAt: string;
  /** 閲覧範囲の外の案件は「他案件」 */
  projectName: string | null;
  /** 閲覧範囲の外は null */
  projectId: string | null;
  /** 閲覧範囲の外は null */
  receivedQuotationId: string | null;
  /** 案件の無い受領見積書だけ */
  ledgerSourcePath: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  category: SimilarPriceCategory;
  classificationKeyMatched: boolean;
  adoption: QuotationAdoption;
  readingStatus: ReadingStatus;
  isReference: boolean;
  /** 閲覧範囲の外の案件は null（参考の印は isReference で返る） */
  referenceReason: string | null;
  allocation: SimilarPriceAllocation;
}

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/** 応答の日時の欄（JSON では文字）を Date にする */
function toDates<T extends { submittedAt: Date; createdAt: Date; updatedAt: Date }>(value: T): T {
  return {
    ...value,
    submittedAt: new Date(value.submittedAt),
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function toDetail(detail: LedgerQuotationDetail): LedgerQuotationDetail {
  return {
    ...toDates(detail),
    readingConfirmedAt:
      detail.readingConfirmedAt == null ? null : new Date(detail.readingConfirmedAt),
  };
}

/** 一覧の問い合わせを検索の値にする（undefined の欄は付けない） */
function buildListSearch(query: LedgerListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

// ============================================================================
// API の呼び出し
// ============================================================================

/** 台帳の一覧（GET /quotations。4.1〜4.5） */
async function listQuotations(query: LedgerListQuery = {}): Promise<LedgerQuotationList> {
  const response = await apiClient.get<LedgerQuotationList>(
    `${BASE_PATH}/quotations${buildListSearch(query)}`
  );
  return { ...response, data: response.data.map(toDates) };
}

/** 見積の詳細（GET /quotations/:id。4.6） */
async function getQuotation(id: string): Promise<LedgerQuotationDetail> {
  const response = await apiClient.get<LedgerQuotationDetail>(
    `${BASE_PATH}/quotations/${encodeURIComponent(id)}`
  );
  return toDetail(response);
}

/** 案件の無い受領見積書の修正（PUT /quotations/:id。5.1・5.6） */
async function updateQuotation(
  id: string,
  input: LedgerQuotationUpdateInput
): Promise<LedgerQuotationDetail> {
  const response = await apiClient.put<LedgerQuotationDetail>(
    `${BASE_PATH}/quotations/${encodeURIComponent(id)}`,
    input
  );
  return toDetail(response);
}

/** 読取の確認・参考の印と理由・分類キーの更新（PATCH /quotations/:id/marks。5.2〜5.4） */
async function updateMarks(
  id: string,
  input: LedgerMarksUpdateInput
): Promise<LedgerQuotationDetail> {
  const response = await apiClient.patch<LedgerQuotationDetail>(
    `${BASE_PATH}/quotations/${encodeURIComponent(id)}/marks`,
    input
  );
  return toDetail(response);
}

/** 案件の無い受領見積書の削除（DELETE /quotations/:id?updatedAt=。5.5・5.6） */
async function deleteQuotation(id: string, updatedAt: Date): Promise<void> {
  const params = new URLSearchParams({ updatedAt: updatedAt.toISOString() });
  await apiClient.delete<void>(
    `${BASE_PATH}/quotations/${encodeURIComponent(id)}?${params.toString()}`
  );
}

/** 見積カードの取り込み（POST /imports。2.1・2.15） */
async function importCards(files: ReadonlyArray<File>): Promise<LedgerImportResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  return apiClient.sendFormData<LedgerImportResult>(`${BASE_PATH}/imports`, formData);
}

/**
 * 絞り込みの結果の Excel の書き出し（POST /exports。6.1〜6.5）
 *
 * 0 件は 400 `LEDGER_EXPORT_EMPTY`、出力の記録の失敗は 500 `EXPORT_RECORD_FAILED` の ApiError になる
 */
async function exportLedger(filter: LedgerFilter = {}): Promise<Blob> {
  return apiClient.postBlob(`${BASE_PATH}/exports`, filter, { disableRetry: true });
}

/** 似た過去の単価の候補（POST /similar-prices。7.1〜7.11・9.1〜9.4） */
async function searchSimilarPrices(query: SimilarPriceQuery): Promise<SimilarPriceCandidate[]> {
  const response = await apiClient.post<{ candidates: SimilarPriceCandidate[] }>(
    `${BASE_PATH}/similar-prices`,
    query
  );
  return response.candidates;
}

/**
 * 書き出しのファイル名（backend と同じく `単価台帳_YYYYMMDD.xlsx`、日付は日本時間）
 *
 * @param now - 書き出した日時
 */
export function buildLedgerExportFileName(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `単価台帳_${part('year')}${part('month')}${part('day')}.xlsx`;
}

/** 単価台帳の API クライアント */
export const unitPriceLedgerApi = {
  listQuotations,
  getQuotation,
  updateQuotation,
  updateMarks,
  deleteQuotation,
  importCards,
  exportLedger,
  searchSimilarPrices,
} as const;
