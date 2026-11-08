/**
 * 受領見積書の試験・Storybook の固定の値（台帳の項目と明細行の新しい欄の既定）
 *
 * 受領見積書の型に台帳の項目・業者名・明細行の新しい欄を足した（estimate-request のタスク117.1）ため、
 * 既存の固定の値へ広げて型を満たす。値はサーバーの既定（業者名は空・採否は不明・読取は未確認・
 * 区分は直接工事・参考の印なし）に揃える。
 */

import type { LineItemInfo, ReceivedQuotationInfo } from '../api/received-quotations';

/** 受領見積書の台帳の項目・業者名の既定 */
export const RECEIVED_QUOTATION_LEDGER_DEFAULTS: Pick<
  ReceivedQuotationInfo,
  | 'vendorName'
  | 'tradingPartnerId'
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
  | 'readingConfirmedById'
  | 'readingConfirmedAt'
  | 'readingConfirmedBy'
  | 'quoteDiscriminator'
> = {
  vendorName: '',
  tradingPartnerId: null,
  quoteNumber: null,
  overallConditions: null,
  siteLocation: null,
  constructionKind: null,
  useType: null,
  constructionPrice: null,
  workConditions: null,
  distanceKm: null,
  adoption: 'UNKNOWN',
  confirmedAmount: null,
  readingStatus: 'UNCONFIRMED',
  readingConfirmedById: null,
  readingConfirmedAt: null,
  readingConfirmedBy: null,
  quoteDiscriminator: '',
};

/** 明細行の新しい欄の既定 */
export const LINE_ITEM_LEDGER_DEFAULTS: Pick<
  LineItemInfo,
  | 'category'
  | 'condition'
  | 'conversion'
  | 'classificationKey'
  | 'quantityRowKey'
  | 'isReference'
  | 'referenceReason'
> = {
  category: 'DIRECT',
  condition: null,
  conversion: null,
  classificationKey: null,
  quantityRowKey: null,
  isReference: false,
  referenceReason: null,
};
