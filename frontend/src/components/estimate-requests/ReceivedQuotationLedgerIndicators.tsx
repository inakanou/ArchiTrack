/**
 * @fileoverview 受領見積書の一覧の台帳の表示（参考の印・読取の確認）
 *
 * estimate-request のタスク117.5。見積依頼の詳細の受領見積書の一覧に、参考の印の付いた
 * 明細行を持つことと読取の確認の状態を出す。案件の受領見積書の一覧の画面（タスク118.1）も
 * 同じ部品を使う（要件 46.10）。色だけに頼らず、状態を文字で示す。文字と判定は
 * received-quotation-ledger-indicators.ts に置く。
 */

import type { LineItemInfo, ReadingStatus } from '../../api/received-quotations';
import {
  READING_STATUS_INDICATOR_TEXT,
  REFERENCE_LINE_INDICATOR_TEXT,
  hasReferenceLineItem,
} from './received-quotation-ledger-indicators';

export interface ReceivedQuotationLedgerIndicatorsProps {
  /** 受領見積書の明細行（参考の印だけを読む） */
  lineItems: readonly Pick<LineItemInfo, 'isReference'>[];
  /** 読取の確認の状態 */
  readingStatus: ReadingStatus;
}

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 8px',
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: 1.6,
    borderRadius: '9999px',
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
  },
  // 文字の色は白地・淡い地で 4.5:1 以上
  reference: {
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
  },
  unconfirmed: {
    color: '#374151',
    backgroundColor: '#f9fafb',
    borderColor: '#9ca3af',
  },
  confirmed: {
    color: '#065f46',
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
};

/**
 * 受領見積書の参考の印と読取の確認の状態を文字の札で出す
 */
export function ReceivedQuotationLedgerIndicators({
  lineItems,
  readingStatus,
}: ReceivedQuotationLedgerIndicatorsProps) {
  const hasReference = hasReferenceLineItem(lineItems);
  const readingStyle = readingStatus === 'CONFIRMED' ? styles.confirmed : styles.unconfirmed;

  return (
    <span style={styles.container} data-testid="received-quotation-ledger-indicators">
      {hasReference && (
        <span
          style={{ ...styles.badge, ...styles.reference }}
          title="参考の印が付いた明細行があります"
          data-testid="received-quotation-reference-indicator"
        >
          {REFERENCE_LINE_INDICATOR_TEXT}
        </span>
      )}
      <span
        style={{ ...styles.badge, ...readingStyle }}
        data-testid="received-quotation-reading-status"
      >
        {READING_STATUS_INDICATOR_TEXT[readingStatus]}
      </span>
    </span>
  );
}

export default ReceivedQuotationLedgerIndicators;
