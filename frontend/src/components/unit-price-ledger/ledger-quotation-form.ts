/**
 * @fileoverview 案件の無い受領見積書の修正の値・検証・変換（unit-price-ledger タスク4.4）
 *
 * 台帳の詳細（`LedgerQuotationDetail`）から修正の欄の値を作り、保存の入力（`LedgerQuotationUpdateInput`）へ直す。
 * 明細行は `LineItemEditor` の値の形、台帳の情報は `LedgerInfoSection` の値の形を使う。
 *
 * 明細行の変換と検証（区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由）は、受領見積書のフォームと
 * 同じ部品（`components/estimate-requests/received-quotation-line-items.ts` の convertToLineItemFormData・
 * convertToLineItemInput・validateLineItemsForSave）を使う（タスク6.6。以前は同じ処理をここに書き写していた）。
 *
 * Requirements (unit-price-ledger):
 * - 5.1: 業者名・見積日・見積の情報・案件名・原本のパスと、明細行の全体を修正する
 * - 5.3: 分類キーは 50 文字まで（LineItemEditor の欄の上限）。体系の登録の有無は検査しない
 */

import type {
  LedgerQuotationDetail,
  LedgerQuotationUpdateInput,
} from '../../api/unit-price-ledger';
import { sortBySortOrder, type LineItemFormData } from '../estimate-requests/LineItemEditor';
import {
  convertToLineItemFormData,
  convertToLineItemInput,
  getSubmittedLineItems,
  validateLineItemsForSave,
} from '../estimate-requests/received-quotation-line-items';
import {
  createLedgerInfoFormData,
  toLedgerInfoInput,
  validateLedgerInfo,
  type LedgerInfoFormData,
} from '../estimate-requests/ledger-info-form';
import { formatDate } from '../../utils/formatters';

// ============================================================================
// 定数
// ============================================================================

/** 欄の上限（backend の受領見積書の業者名・台帳の案件名・原本のパスの上限） */
export const LEDGER_QUOTATION_MAX_LENGTHS = {
  vendorName: 200,
  ledgerProjectName: 255,
  ledgerSourcePath: 1000,
} as const;

/** 検証の文言（backend の検証の文言と同じ） */
export const LEDGER_QUOTATION_VALIDATION_MESSAGES = {
  VENDOR_NAME_REQUIRED: '業者名を入力してください',
  VENDOR_NAME_TOO_LONG: '業者名は200文字以内で入力してください',
  SUBMITTED_AT_REQUIRED: '見積日を入力してください',
  LINE_ITEMS_REQUIRED: '明細行を1行以上入力してください',
} as const;

// ============================================================================
// 型定義
// ============================================================================

/** 修正の欄の値 */
export interface LedgerQuotationFormData {
  vendorName: string;
  /** 見積日（YYYY-MM-DD） */
  submittedAt: string;
  ledgerProjectName: string;
  ledgerSourcePath: string;
  ledgerInfo: LedgerInfoFormData;
  lineItems: LineItemFormData[];
}

/** 見積全体の欄の誤り */
export type LedgerQuotationFieldErrors = Partial<
  Record<'vendorName' | 'submittedAt' | 'lineItems', string>
>;

/** 検証の結果 */
export interface LedgerQuotationValidation {
  fieldErrors: LedgerQuotationFieldErrors;
  /** 行の ID → 文言の並び */
  lineItemErrors: Record<string, string[]>;
  /** 台帳の情報の欄に誤りがあるか */
  hasLedgerInfoErrors: boolean;
}

// ============================================================================
// 見積全体
// ============================================================================

/** 詳細から修正の欄の値を作る */
export function createLedgerQuotationFormData(
  detail: LedgerQuotationDetail
): LedgerQuotationFormData {
  return {
    vendorName: detail.vendorName,
    submittedAt: formatDate(detail.submittedAt),
    ledgerProjectName: detail.ledgerProjectName ?? '',
    ledgerSourcePath: detail.ledgerSourcePath ?? '',
    ledgerInfo: createLedgerInfoFormData(detail),
    lineItems: convertToLineItemFormData(detail.lineItems),
  };
}

/** 修正の欄の値を、backend の検証と同じ規則で確かめる */
export function validateLedgerQuotationForm(
  data: LedgerQuotationFormData
): LedgerQuotationValidation {
  const messages = LEDGER_QUOTATION_VALIDATION_MESSAGES;
  const fieldErrors: LedgerQuotationFieldErrors = {};
  const vendorName = data.vendorName.trim();
  if (vendorName === '') {
    fieldErrors.vendorName = messages.VENDOR_NAME_REQUIRED;
  } else if (vendorName.length > LEDGER_QUOTATION_MAX_LENGTHS.vendorName) {
    fieldErrors.vendorName = messages.VENDOR_NAME_TOO_LONG;
  }
  if (data.submittedAt === '' || Number.isNaN(new Date(data.submittedAt).getTime())) {
    fieldErrors.submittedAt = messages.SUBMITTED_AT_REQUIRED;
  }
  if (getSubmittedLineItems(data.lineItems).length === 0) {
    fieldErrors.lineItems = messages.LINE_ITEMS_REQUIRED;
  }
  return {
    fieldErrors,
    lineItemErrors: validateLineItemsForSave(data.lineItems),
    hasLedgerInfoErrors: Object.keys(validateLedgerInfo(data.ledgerInfo)).length > 0,
  };
}

/** 検証の結果に誤りがあるか */
export function hasLedgerQuotationErrors(validation: LedgerQuotationValidation): boolean {
  return (
    Object.keys(validation.fieldErrors).length > 0 ||
    Object.keys(validation.lineItemErrors).length > 0 ||
    validation.hasLedgerInfoErrors
  );
}

/**
 * 修正の欄の値を保存の入力にする（検証を通った値を渡すこと）
 *
 * - 見積日を変えていないときは、読み込んだ見積日をそのまま送る（日付の欄の表し方で時刻をずらさないため）
 * - 取引先は送らない（backend が業者名で照合する）
 * - 楽観的排他のため、読み込んだときの更新の日時を送る（5.6）
 */
export function toLedgerQuotationUpdateInput(
  data: LedgerQuotationFormData,
  detail: LedgerQuotationDetail
): LedgerQuotationUpdateInput {
  const submittedAt =
    data.submittedAt === formatDate(detail.submittedAt)
      ? detail.submittedAt.toISOString()
      : new Date(data.submittedAt).toISOString();
  return {
    vendorName: data.vendorName.trim(),
    submittedAt,
    ledgerProjectName: data.ledgerProjectName.trim() === '' ? null : data.ledgerProjectName,
    ledgerSourcePath: data.ledgerSourcePath.trim() === '' ? null : data.ledgerSourcePath,
    ...toLedgerInfoInput(data.ledgerInfo),
    // 並びの順に並べてから、名称の空の行を除き 0 から番号を振る
    lineItems: convertToLineItemInput(sortBySortOrder(data.lineItems)),
    expectedUpdatedAt: detail.updatedAt.toISOString(),
  };
}
