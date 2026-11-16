/**
 * @fileoverview 案件の受領見積書の印の編集の欄の値・検証・送る内容（unit-price-ledger タスク4.5）
 *
 * 台帳の画面で案件の受領見積書に直せるのは、読取の確認・明細行の参考の印と理由・分類キーだけ（5.2）。
 * 送る内容は、開いたときの値から変えた欄だけにする（PATCH /quotations/:id/marks の各欄は任意）。
 *
 * Requirements (unit-price-ledger):
 * - 5.2: 読取の確認・参考の印と理由・分類キーだけを編集する
 * - 5.3: 分類キーは estimate-request Requirement 47 の決まり（50 文字まで。上限は LineItemEditor の欄と同じ）
 * - 5.4: 読取の確認を送り、確認者と日時はサーバーが記録する
 */

import type {
  LedgerLineItemMark,
  LedgerMarksUpdateInput,
  LedgerQuotationDetail,
} from '../../api/unit-price-ledger';
import type { ReadingStatus } from '../../api/received-quotations';
import { LINE_ITEM_SAVE_VALIDATION_MESSAGES } from '../estimate-requests/received-quotation-form-messages';

// ============================================================================
// 型定義
// ============================================================================

/** 明細行ごとの印の欄の値 */
export interface LedgerMarkRowFormData {
  id: string;
  name: string;
  isReference: boolean;
  referenceReason: string;
  classificationKey: string;
}

/** 印の編集の欄の値 */
export interface LedgerMarksFormData {
  readingStatus: ReadingStatus;
  rows: LedgerMarkRowFormData[];
}

/** 行の ID ごとの誤りの文言 */
export type LedgerMarksRowErrors = Record<string, string[]>;

// ============================================================================
// 欄の値
// ============================================================================

/** 詳細から印の編集の欄の値を作る（明細行は並びの順） */
export function createLedgerMarksFormData(detail: LedgerQuotationDetail): LedgerMarksFormData {
  const rows = [...detail.lineItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      id: item.id,
      name: item.name,
      isReference: item.isReference,
      referenceReason: item.referenceReason ?? '',
      classificationKey: item.classificationKey ?? '',
    }));
  return { readingStatus: detail.readingStatus, rows };
}

// ============================================================================
// 検証
// ============================================================================

/** 行ごとの誤り（参考の理由は参考の印を付けた行だけ。estimate-request 46.5） */
export function validateLedgerMarksForm(form: LedgerMarksFormData): LedgerMarksRowErrors {
  const errors: LedgerMarksRowErrors = {};
  for (const row of form.rows) {
    if (!row.isReference && row.referenceReason.trim() !== '') {
      errors[row.id] = [LINE_ITEM_SAVE_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE];
    }
  }
  return errors;
}

// ============================================================================
// 送る内容
// ============================================================================

/** 空の文字は null にする（サーバーも空の文字を null として扱う） */
function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 開いたときの詳細と比べて、変えた欄だけを送る内容にする
 *
 * 読取の確認は変えたときだけ送る。明細行は、印・理由・分類キーのどれかを変えた行だけを、変えた欄とともに送る。
 */
export function toLedgerMarksUpdateInput(
  form: LedgerMarksFormData,
  detail: LedgerQuotationDetail
): LedgerMarksUpdateInput {
  const originals = new Map(detail.lineItems.map((item) => [item.id, item]));
  const lineItems: LedgerLineItemMark[] = [];
  for (const row of form.rows) {
    const original = originals.get(row.id);
    if (!original) continue;
    const mark: LedgerLineItemMark = { id: row.id };
    if (row.isReference !== original.isReference) {
      mark.isReference = row.isReference;
    }
    const referenceReason = toNullableText(row.referenceReason);
    if (referenceReason !== (original.referenceReason ?? null)) {
      mark.referenceReason = referenceReason;
    }
    const classificationKey = toNullableText(row.classificationKey);
    if (classificationKey !== (original.classificationKey ?? null)) {
      mark.classificationKey = classificationKey;
    }
    if (Object.keys(mark).length > 1) lineItems.push(mark);
  }

  const input: LedgerMarksUpdateInput = {
    lineItems,
    expectedUpdatedAt: detail.updatedAt.toISOString(),
  };
  if (form.readingStatus !== detail.readingStatus) {
    input.readingStatus = form.readingStatus;
  }
  return input;
}
