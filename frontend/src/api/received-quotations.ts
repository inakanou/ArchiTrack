/**
 * @fileoverview 受領見積書用APIクライアント
 *
 * Task 17.1: 受領見積書APIクライアントの実装
 * Task 22.1: 受領見積書APIクライアントの明細行対応追加
 *
 * Requirements:
 * - 11.1: 受領見積書登録
 * - 11.2: 受領見積書フォーム
 * - 11.9: 構造化データ入力（明細行管理）
 * - 11.14: ファイルプレビュー
 * - 11.15: 受領見積書編集
 * - 11.16: 受領見積書削除
 * - 11.22: 受領見積書バリデーション（ファイルまたは明細行必須）
 * - 14.2: 明細行データの永続化
 *
 * タスク117.1（estimate-request の design.md の章「Requirements 43-50」の D2・D3・D6）:
 * 台帳の項目・明細行の新しい欄・業者名・`sharedOriginalCount` の型、案件の配下の登録と全件の一覧、
 * 同じ原本の二重登録の 409（`DUPLICATE_ORIGINAL`）を楽観的排他の 409 と分けて返す誤りを足した。
 */

import { apiClient, ApiError } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細行の区分（45.1）。表示は直接工事・諸経費・交通費・産廃・値引き・法定福利費・別途の順
 */
export const LINE_ITEM_CATEGORIES = [
  'DIRECT',
  'OVERHEAD',
  'TRAVEL',
  'WASTE',
  'DISCOUNT',
  'LEGAL_WELFARE',
  'EXCLUDED',
] as const;

/** 明細行の区分（45.1） */
export type LineItemCategory = (typeof LINE_ITEM_CATEGORIES)[number];

/** 明細行の換算（45.8） */
export interface LineItemConversion {
  quantity: number;
  unit: string;
  unitPrice: number;
  basis: string;
}

/**
 * 明細行情報（レスポンス型）
 *
 * Requirements: 11.9, 14.2
 * Task 61.3: netAmountを削除（受領見積書レベルに移動）
 */
export interface LineItemInfo {
  id: string;
  receivedQuotationId: string;
  sortOrder: number;
  customCategory: string | null;
  workType: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
  /** 区分（45.1） */
  category: LineItemCategory;
  /** 条件（45.7） */
  condition: string | null;
  /** 換算（45.8）。4 つの欄が揃うときだけ値を持つ */
  conversion: LineItemConversion | null;
  /** 分類キー（47.1） */
  classificationKey: string | null;
  /** 数量表の行のキー（47.4） */
  quantityRowKey: string | null;
  /** 参考の印と理由（46.4） */
  isReference: boolean;
  referenceReason: string | null;
}

/**
 * 明細行入力（リクエスト型）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを削除（受領見積書レベルに移動）
 */
export interface LineItemInput {
  name: string;
  customCategory?: string;
  workType?: string;
  specification?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  remarks?: string;
  sortOrder: number;
  /** 区分（45.1）。省略時はサーバーが直接工事として保存する（45.3） */
  category?: LineItemCategory;
  condition?: string | null;
  /** 換算（45.8）。4 つの欄はすべてあるか、すべて無い（45.9） */
  conversion?: LineItemConversion | null;
  classificationKey?: string | null;
  quantityRowKey?: string | null;
  isReference?: boolean;
  /** 参考の理由（46.4）。参考の印が無い行には送らない（46.5） */
  referenceReason?: string | null;
}

/** 改修／新営の区分（46.2） */
export type ConstructionKind = 'RENOVATION' | 'NEW_CONSTRUCTION';

/** 採否（46.3） */
export type QuotationAdoption = 'ADOPTED' | 'REJECTED' | 'UNKNOWN';

/** 読取の確認の状態（46.6） */
export type ReadingStatus = 'UNCONFIRMED' | 'CONFIRMED';

/** 読取の確認をした利用者（46.7。タスク117.4）。表示名は利用者の表示名 */
export interface ReadingConfirmer {
  id: string;
  displayName: string;
}

/**
 * 受領見積書の台帳の項目と業者名の入力（design の同章の Service Interface の `LedgerFieldsInput`）
 *
 * どれも任意。欄を省くと登録では既定、更新では変えない。null は消す（FormData では空の文字で送る）。
 * 採否・読取の確認・見積の区別は null を持たない（112.2 の申し送り: 採否と読取の確認に空の文字を送らない）。
 */
export interface ReceivedQuotationLedgerInput {
  /** 業者名（44.1）。案件の配下では必須（43.8）、見積依頼の配下ではサーバーが無視する（44.3） */
  vendorName?: string;
  /** 選んだ取引先の ID（44.5）。null・省略は業者名で照合する（44.6・44.7） */
  tradingPartnerId?: string | null;
  quoteNumber?: string | null;
  overallConditions?: string | null;
  siteLocation?: string | null;
  constructionKind?: ConstructionKind | null;
  useType?: string | null;
  constructionPrice?: number | null;
  workConditions?: string | null;
  distanceKm?: number | null;
  adoption?: QuotationAdoption;
  confirmedAmount?: number | null;
  readingStatus?: ReadingStatus;
  /** 見積の区別（48.2）。空の文字は区別なし */
  quoteDiscriminator?: string;
}

/**
 * 受領見積書情報（改訂版：contentType廃止、明細行・合計金額追加、netAmount追加）
 *
 * Requirements: 11.9, 14.2
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface ReceivedQuotationInfo {
  id: string;
  /** 見積依頼の ID。見積依頼に紐づかない受領見積書（43.7）は null */
  estimateRequestId: string | null;
  name: string;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  lineItems: LineItemInfo[];
  /** 区分が別途の行を除いた金額の合計（45.5） */
  totalAmount: number | null;
  netAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  /** 業者名と取引先（44.1〜44.7） */
  vendorName: string;
  tradingPartnerId: string | null;
  /** 台帳の項目（46.1〜46.3・46.6・46.7・48.2） */
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
  readingConfirmedById: string | null;
  readingConfirmedAt: Date | null;
  /** 読取の確認をした利用者の ID と表示名（46.7。タスク117.4）。確認者がいない・消えたときは null */
  readingConfirmedBy: ReadingConfirmer | null;
  quoteDiscriminator: string;
  /** 協力業者名（プロジェクト単位取得時のみ。サーバーは業者名の値を入れる。D2） */
  tradingPartnerName?: string | null;
  /**
   * 見積依頼の名前（プロジェクト単位取得時のみ。見積依頼の無いものは null。
   * 案件の受領見積書の一覧の見積依頼名の列。D2 の追記、タスク118.1）
   */
  estimateRequestName?: string | null;
}

/**
 * 登録・更新の結果（D6）。受領見積書の各欄に、同じ原本で見積の区別が違う他の受領見積書の数を足した形（48.4）
 */
export interface ReceivedQuotationSaveResult extends ReceivedQuotationInfo {
  sharedOriginalCount: number;
}

/** 案件の配下の一覧の指定（D2）。`all` で見積依頼に紐づかないものも含めた全件 */
export interface ProjectQuotationsQuery {
  include?: 'all';
}

/**
 * 受領見積書作成入力（改訂版：contentType廃止、lineItems追加、netAmount追加）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface CreateReceivedQuotationInput extends ReceivedQuotationLedgerInput {
  name: string;
  submittedAt: Date;
  file?: File;
  lineItems?: LineItemInput[];
  netAmount?: number | null;
}

/**
 * 受領見積書更新入力（改訂版：contentType廃止、lineItems追加、removeFile追加、netAmount追加）
 *
 * Requirements: 11.9, 11.22
 * Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
 */
export interface UpdateReceivedQuotationInput extends ReceivedQuotationLedgerInput {
  name?: string;
  submittedAt?: Date;
  file?: File;
  removeFile?: boolean;
  lineItems?: LineItemInput[];
  netAmount?: number | null;
}

// ============================================================================
// エラー
// ============================================================================

/** 同じ原本の二重登録の 409 の `code`（D6） */
export const DUPLICATE_ORIGINAL_CODE = 'DUPLICATE_ORIGINAL';

/** 受領見積書の楽観的排他の 409 の `code` */
export const RECEIVED_QUOTATION_CONFLICT_CODE = 'RECEIVED_QUOTATION_CONFLICT';

/** 二重登録の 409 が示す既存の受領見積書（48.3。受領見積書名・業者名・提出日） */
export interface DuplicateOriginalExisting {
  name: string;
  vendorName: string;
  submittedAt: Date;
}

/**
 * 同じ案件に、原本の指紋と見積の区別がともに同じ受領見積書が既にある（409 `DUPLICATE_ORIGINAL`。48.3）
 *
 * `ApiError`（statusCode 409）を継ぐため、409 を楽観的排他として扱う既存の処理はそのまま動く。
 * 画面は `isDuplicateOriginalError` で楽観的排他の 409 と分ける。`existing` は本文の最上位の
 * `existing` を読み、形が壊れていれば null とする。
 */
export class DuplicateOriginalError extends ApiError {
  readonly code = DUPLICATE_ORIGINAL_CODE;
  readonly existing: DuplicateOriginalExisting | null;

  constructor(message: string, existing: DuplicateOriginalExisting | null, response?: unknown) {
    super(409, message, response);
    this.name = 'DuplicateOriginalError';
    this.existing = existing;
  }
}

/** 同じ原本の二重登録の 409 か */
export function isDuplicateOriginalError(error: unknown): error is DuplicateOriginalError {
  return error instanceof DuplicateOriginalError;
}

/** 受領見積書の楽観的排他の 409（他の人の更新との競合）か。二重登録の 409 は含めない */
export function isReceivedQuotationConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.statusCode === 409 && !isDuplicateOriginalError(error);
}

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 二重登録の本文の `existing` を読む（形が違えば null） */
function parseDuplicateExisting(value: unknown): DuplicateOriginalExisting | null {
  if (!isRecord(value)) return null;
  const { name, vendorName, submittedAt } = value;
  if (typeof name !== 'string' || typeof vendorName !== 'string') return null;
  if (typeof submittedAt !== 'string') return null;
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return null;
  return { name, vendorName, submittedAt: date };
}

/** 応答の受領見積書の日時の欄を Date にする */
function toQuotationDates<T extends ReceivedQuotationInfo>(q: T): T {
  return {
    ...q,
    submittedAt: new Date(q.submittedAt),
    createdAt: new Date(q.createdAt),
    updatedAt: new Date(q.updatedAt),
    // 無い・null はそのまま、日時の文字は Date にする
    readingConfirmedAt:
      q.readingConfirmedAt == null ? q.readingConfirmedAt : new Date(q.readingConfirmedAt),
  };
}

/** FormData の欄の値（null は空の文字。サーバーは空の文字を null として読む） */
function formValue(value: string | number | null): string {
  return value === null ? '' : String(value);
}

/**
 * 台帳の項目と業者名を FormData に足す（送られた欄だけ。undefined は欄を作らない）
 *
 * 採否・読取の確認・見積の区別は型で null を持たず、空の文字を送らない（112.2 の申し送り）
 */
function appendLedgerFields(formData: FormData, input: ReceivedQuotationLedgerInput): void {
  const fields: ReadonlyArray<
    [keyof ReceivedQuotationLedgerInput, string | number | null | undefined]
  > = [
    ['vendorName', input.vendorName],
    ['tradingPartnerId', input.tradingPartnerId],
    ['quoteNumber', input.quoteNumber],
    ['overallConditions', input.overallConditions],
    ['siteLocation', input.siteLocation],
    ['constructionKind', input.constructionKind],
    ['useType', input.useType],
    ['constructionPrice', input.constructionPrice],
    ['workConditions', input.workConditions],
    ['distanceKm', input.distanceKm],
    ['adoption', input.adoption],
    ['confirmedAmount', input.confirmedAmount],
    ['readingStatus', input.readingStatus],
    ['quoteDiscriminator', input.quoteDiscriminator],
  ];
  for (const [key, value] of fields) {
    if (value !== undefined) {
      formData.append(key, formValue(value));
    }
  }
}

/** 登録の FormData を作る（見積依頼の配下・案件の配下で共通） */
function buildCreateFormData(input: CreateReceivedQuotationInput): FormData {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('submittedAt', input.submittedAt.toISOString());

  // ファイルアップロード
  if (input.file) {
    formData.append('file', input.file);
  }

  // 明細行データをJSON文字列としてFormDataに追加（Requirements: 11.22）
  if (input.lineItems && input.lineItems.length > 0) {
    formData.append('lineItems', JSON.stringify(input.lineItems));
  }

  // NET金額（Task 61.3: 受領見積書レベルで管理）
  if (input.netAmount !== undefined && input.netAmount !== null) {
    formData.append('netAmount', String(input.netAmount));
  }

  appendLedgerFields(formData, input);
  return formData;
}

/**
 * ベースURLを取得
 */
function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

/**
 * multipart/form-data形式のリクエストを送信する
 *
 * apiClientはJSON.stringifyを使用するためFormDataを直接送信できない。
 * この関数は直接fetchを使用してFormDataを送信する。
 *
 * @param path - APIパス
 * @param method - HTTPメソッド
 * @param formData - 送信するFormData
 * @returns レスポンスデータ
 */
async function sendFormData<T>(
  path: string,
  method: 'POST' | 'PUT',
  formData: FormData
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  // アクセストークンを取得
  const accessToken = apiClient.getAccessToken();

  const headers: HeadersInit = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  // Note: Content-Typeは設定しない（ブラウザが自動でmultipart/form-dataとboundaryを設定）

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: formData,
      credentials: 'include',
    });

    // レスポンスボディを取得
    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // エラーレスポンスの処理
    if (!response.ok) {
      // Req 38.x: 401 のときは apiClient 経由で SessionExpiredModal をトリガーする。
      // sendFormData は apiClient を bypass して fetch を直接呼ぶため、
      // ここで明示的に sessionExpiredCallback を発火させないとモーダルが出ない。
      if (response.status === 401) {
        apiClient.triggerSessionExpired();
      }
      // RFC 7807 Problem Details形式のdetailフィールド、または従来のerrorフィールドを優先的に使用
      const errorMessage =
        (data && typeof data === 'object'
          ? 'detail' in data && typeof data.detail === 'string'
            ? data.detail
            : 'error' in data && typeof data.error === 'string'
              ? data.error
              : null
          : null) || response.statusText;
      // 同じ原本の二重登録の 409 は楽観的排他の 409 と分けて返す（D6・48.3）
      if (response.status === 409 && isRecord(data) && data.code === DUPLICATE_ORIGINAL_CODE) {
        throw new DuplicateOriginalError(errorMessage, parseDuplicateExisting(data.existing), data);
      }
      throw new ApiError(response.status, errorMessage, data);
    }

    return data as T;
  } catch (error) {
    // ApiErrorはそのままスロー
    if (error instanceof ApiError) {
      throw error;
    }

    // ネットワークエラー等
    throw new ApiError(0, 'Network error', error);
  }
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * 受領見積書一覧を取得する
 *
 * レスポンスには明細行データと合計金額が含まれる。
 *
 * @param estimateRequestId - 見積依頼ID
 * @returns 受領見積書一覧
 */
export async function getReceivedQuotations(
  estimateRequestId: string
): Promise<ReceivedQuotationInfo[]> {
  const response = await apiClient.get<ReceivedQuotationInfo[]>(
    `/api/estimate-requests/${estimateRequestId}/quotations`
  );
  return response.map(toQuotationDates);
}

/**
 * 受領見積書詳細を取得する
 *
 * レスポンスには明細行データと合計金額が含まれる。
 *
 * @param id - 受領見積書ID
 * @returns 受領見積書詳細
 */
export async function getReceivedQuotation(id: string): Promise<ReceivedQuotationInfo> {
  const response = await apiClient.get<ReceivedQuotationInfo>(`/api/quotations/${id}`);
  return toQuotationDates(response);
}

/**
 * 受領見積書を作成する
 *
 * multipart/form-data形式でファイルアップロードに対応。
 * lineItemsはJSON文字列としてFormDataに含める。
 *
 * @param estimateRequestId - 見積依頼ID
 * @param input - 受領見積書作成入力
 * @returns 作成された受領見積書と、同じ原本で見積の区別が違う他の受領見積書の数（48.4）
 *
 * @throws DuplicateOriginalError 同じ原本・同じ見積の区別の受領見積書が既にある（409 `DUPLICATE_ORIGINAL`。48.3）
 * @throws ApiError 見積依頼が見つからない（404）、バリデーションエラー（400）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）
 */
export async function createReceivedQuotation(
  estimateRequestId: string,
  input: CreateReceivedQuotationInput
): Promise<ReceivedQuotationSaveResult> {
  // 直接fetchを使用してFormDataを送信
  const response = await sendFormData<ReceivedQuotationSaveResult>(
    `/api/estimate-requests/${estimateRequestId}/quotations`,
    'POST',
    buildCreateFormData(input)
  );
  return toQuotationDates(response);
}

/**
 * 見積依頼に紐づかない受領見積書を案件の配下に登録する（43.7。design の D3）
 *
 * `POST /api/projects/:projectId/quotations` へ見積依頼の配下の登録と同じ multipart の形で送る。
 * 業者名（`vendorName`）は案件の配下では必須（43.8。サーバーが 400 で拒む）。
 *
 * @param projectId - 案件（プロジェクト）の ID
 * @param input - 受領見積書作成入力（業者名・取引先の ID・台帳の項目を含む）
 * @returns 作成された受領見積書と、同じ原本で見積の区別が違う他の受領見積書の数（48.4）
 *
 * @throws DuplicateOriginalError 同じ原本・同じ見積の区別の受領見積書が既にある（409 `DUPLICATE_ORIGINAL`。48.3）
 * @throws ApiError 案件が見つからない・範囲外（404）、バリデーションエラー（400）、権限なし（403）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）
 */
export async function createProjectReceivedQuotation(
  projectId: string,
  input: CreateReceivedQuotationInput
): Promise<ReceivedQuotationSaveResult> {
  const response = await sendFormData<ReceivedQuotationSaveResult>(
    `/api/projects/${projectId}/quotations`,
    'POST',
    buildCreateFormData(input)
  );
  return toQuotationDates(response);
}

/**
 * 受領見積書を更新する
 *
 * multipart/form-data形式でファイルアップロードに対応。
 * lineItemsはJSON文字列としてFormDataに含め、全量置換される。
 * 楽観的排他制御を使用。
 *
 * @param id - 受領見積書ID
 * @param input - 受領見積書更新入力
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 * @returns 更新された受領見積書と、同じ原本で見積の区別が違う他の受領見積書の数（48.4）
 *
 * @throws DuplicateOriginalError 同じ原本・同じ見積の区別の受領見積書が既にある（409 `DUPLICATE_ORIGINAL`。48.3）
 * @throws ApiError 受領見積書が見つからない（404）、競合（409 `RECEIVED_QUOTATION_CONFLICT`）、
 *                  ファイルサイズ上限超過（413）、ファイル形式エラー（415）
 */
export async function updateReceivedQuotation(
  id: string,
  input: UpdateReceivedQuotationInput,
  updatedAt: string
): Promise<ReceivedQuotationSaveResult> {
  const formData = new FormData();
  // バックエンドはexpectedUpdatedAtを期待する
  formData.append('expectedUpdatedAt', updatedAt);

  if (input.name) {
    formData.append('name', input.name);
  }
  if (input.submittedAt) {
    formData.append('submittedAt', input.submittedAt.toISOString());
  }

  // ファイルアップロード
  if (input.file) {
    formData.append('file', input.file);
  }

  // 既存ファイル削除フラグ
  if (input.removeFile) {
    formData.append('removeFile', 'true');
  }

  // 明細行全量置換パラメータ（Requirements: 11.22）
  if (input.lineItems) {
    formData.append('lineItems', JSON.stringify(input.lineItems));
  }

  // NET金額（Task 61.3: 受領見積書レベルで管理）
  if (input.netAmount !== undefined) {
    formData.append('netAmount', input.netAmount === null ? 'null' : String(input.netAmount));
  }

  // 台帳の項目・業者名・取引先の ID（送られた欄だけ）
  appendLedgerFields(formData, input);

  // 直接fetchを使用してFormDataを送信
  const response = await sendFormData<ReceivedQuotationSaveResult>(
    `/api/quotations/${id}`,
    'PUT',
    formData
  );
  return toQuotationDates(response);
}

/**
 * 受領見積書を削除する（論理削除）
 *
 * 楽観的排他制御を使用。ファイルが存在する場合は物理削除も行われる。基準時刻はクエリ（`?updatedAt=`）で
 * 送り、本文を付けない（HTTP は DELETE の本文に意味を定めず、中継で落ちうるため。見積依頼の削除と同じ形）。
 *
 * @param id - 受領見積書ID
 * @param updatedAt - 楽観的排他制御用の更新日時（ISO8601形式）
 *
 * @throws ApiError 受領見積書が見つからない（404）、競合（409）
 */
export async function deleteReceivedQuotation(id: string, updatedAt: string): Promise<void> {
  return apiClient.delete<void>(`/api/quotations/${id}?updatedAt=${encodeURIComponent(updatedAt)}`);
}

/**
 * ファイルプレビューURLを取得する
 *
 * Cloudflare R2（または同等のストレージ）の署名付きURLを取得する。
 *
 * @param id - 受領見積書ID
 * @returns 署名付きプレビューURL
 *
 * @throws ApiError 受領見積書が見つからない（404）、
 *                  ファイルがない受領見積書（422）
 */
export async function getPreviewUrl(id: string): Promise<string> {
  const response = await apiClient.get<{ url: string }>(`/api/quotations/${id}/preview`);
  return response.url;
}

/**
 * プロジェクトに紐付く受領見積書一覧を取得する
 *
 * 見積書作成時の転記機能で使用。
 * 既定（`options` 無し）は見積依頼経由で登録された受領見積書のみを取得する（従来のまま）。
 * `{ include: 'all' }` を渡すと、見積依頼に紐づかない受領見積書も含めた全件を取得する
 * （案件の受領見積書の一覧。estimate-request の design の D2）。
 *
 * Requirements: REQ-4.5
 *
 * @param projectId - プロジェクトID
 * @param options - 一覧の対象の指定
 * @returns 受領見積書一覧
 */
export async function getReceivedQuotationsByProject(
  projectId: string,
  options: ProjectQuotationsQuery = {}
): Promise<ReceivedQuotationInfo[]> {
  const query = options.include === 'all' ? '?include=all' : '';
  const response = await apiClient.get<ReceivedQuotationInfo[]>(
    `/api/projects/${projectId}/quotations${query}`
  );
  return response.map(toQuotationDates);
}
