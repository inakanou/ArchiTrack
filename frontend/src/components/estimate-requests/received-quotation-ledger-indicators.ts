/**
 * 受領見積書の一覧の台帳の表示（参考の印・読取の確認）の文字と判定
 *
 * estimate-request のタスク117.5。部品 ReceivedQuotationLedgerIndicators と、
 * 案件の受領見積書の一覧の画面（タスク118.1）が使う。
 */

import type { LineItemInfo, ReadingStatus } from '../../api/received-quotations';

/** 参考の印の付いた明細行を持つことの表示の文字 */
export const REFERENCE_LINE_INDICATOR_TEXT = '参考の印あり';

/** 読取の確認の状態の表示の文字 */
export const READING_STATUS_INDICATOR_TEXT: Record<ReadingStatus, string> = {
  UNCONFIRMED: '読取: 未確認',
  CONFIRMED: '読取: 確認済み',
};

/**
 * 参考の印の付いた明細行を持つか
 */
export function hasReferenceLineItem(
  lineItems: readonly Pick<LineItemInfo, 'isReference'>[]
): boolean {
  return lineItems.some((lineItem) => lineItem.isReference);
}
