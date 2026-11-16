/**
 * 単価台帳の誤り（unit-price-ledger タスク1.4）
 *
 * design.md「Error Handling > Error Categories and Responses」に対応する。
 * - 413 `LEDGER_IMPORT_TOO_LARGE`：取り込みの上限の超過
 * - 409 `LEDGER_CONFLICT`：排他の不一致（5.6）
 * - 409 `LEDGER_PROJECT_QUOTATION_READ_ONLY`：案件の受領見積書の全体の修正・削除（5.2・5.5）
 *
 * @module errors/unitPriceLedgerError
 */
import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 取り込みの上限の種類（design.md の LedgerCardParser）
 * - ZIP_SIZE：zip のファイルの大きさ
 * - ENTRY_COUNT：zip の中の項目の数
 * - ENTRY_SIZE：zip の中の 1 項目の展開後の大きさ
 * - TOTAL_UNCOMPRESSED_SIZE：zip の展開後の合計の大きさ
 * - FILE_COUNT：1 要求の JSON のファイルの数
 * - FILE_SIZE：JSON のファイル 1 個の大きさ
 */
export type LedgerImportLimit =
  | 'ZIP_SIZE'
  | 'ENTRY_COUNT'
  | 'ENTRY_SIZE'
  | 'TOTAL_UNCOMPRESSED_SIZE'
  | 'FILE_COUNT'
  | 'FILE_SIZE';

const LEDGER_IMPORT_LIMIT_LABELS: Record<
  LedgerImportLimit,
  { label: string; unit: 'bytes' | 'count' }
> = {
  ZIP_SIZE: { label: 'zip のファイルの大きさ', unit: 'bytes' },
  ENTRY_COUNT: { label: 'zip の中の項目の数', unit: 'count' },
  ENTRY_SIZE: { label: 'zip の中の項目の展開後の大きさ', unit: 'bytes' },
  TOTAL_UNCOMPRESSED_SIZE: { label: 'zip の展開後の合計の大きさ', unit: 'bytes' },
  FILE_COUNT: { label: '取り込むファイルの数', unit: 'count' },
  FILE_SIZE: { label: 'JSON のファイルの大きさ', unit: 'bytes' },
};

const formatLimit = (limit: LedgerImportLimit, max: number): string =>
  LEDGER_IMPORT_LIMIT_LABELS[limit].unit === 'bytes'
    ? `${Math.round(max / 1024 / 1024)}MB`
    : `${max} 個`;

/**
 * 取り込みの上限を超えた要求の誤り
 * 413 Payload Too Large（`code: 'LEDGER_IMPORT_TOO_LARGE'`）
 *
 * 要求の全体を拒む（カードごとの失敗は 200 の結果の failed に入れるため、この誤りは上限の超過だけに使う）
 */
export class LedgerImportTooLargeError extends ApiError {
  readonly limit: LedgerImportLimit;
  readonly max: number;

  constructor(limit: LedgerImportLimit, max: number) {
    super(
      413,
      `${LEDGER_IMPORT_LIMIT_LABELS[limit].label}が上限（${formatLimit(limit, max)}）を超えています`,
      'LEDGER_IMPORT_TOO_LARGE',
      { limit, max },
      PROBLEM_TYPES.BUSINESS_RULE_VIOLATION
    );
    this.name = 'LedgerImportTooLargeError';
    this.limit = limit;
    this.max = max;
  }
}

/**
 * 排他の不一致の文言（requirements.md 5.6 の逐語）
 */
export const LEDGER_CONFLICT_MESSAGE =
  'ほかの利用者が更新しました。最新の内容を読み込み直してください';

/**
 * 台帳の画面での修正・印の更新・削除の楽観的排他制御の不一致の誤り
 * 409 Conflict（`code: 'LEDGER_CONFLICT'`。5.6）
 */
export class LedgerConflictError extends ApiError {
  constructor(conflictDetails?: Record<string, unknown>) {
    super(409, LEDGER_CONFLICT_MESSAGE, 'LEDGER_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'LedgerConflictError';
  }
}

/**
 * 台帳の画面で拒む、案件の受領見積書への操作
 */
export type LedgerReadOnlyOperation = 'update' | 'delete';

const READ_ONLY_MESSAGES: Record<LedgerReadOnlyOperation, string> = {
  update: '案件の受領見積書は台帳の画面で修正できません。受領見積書の画面で修正してください',
  delete: '案件の受領見積書は台帳の画面で削除できません。受領見積書の画面で削除してください',
};

/**
 * 案件の受領見積書の全体の修正・削除を台帳の画面で拒む誤り
 * 409 Conflict（`code: 'LEDGER_PROJECT_QUOTATION_READ_ONLY'`。5.2・5.5）
 *
 * 案件の受領見積書は、台帳の画面では印の更新（読取の確認・参考の印と理由・分類キー）だけを受ける
 */
export class LedgerProjectQuotationReadOnlyError extends ApiError {
  constructor(quotationId: string, operation: LedgerReadOnlyOperation) {
    super(
      409,
      READ_ONLY_MESSAGES[operation],
      'LEDGER_PROJECT_QUOTATION_READ_ONLY',
      { quotationId, operation },
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'LedgerProjectQuotationReadOnlyError';
  }
}
