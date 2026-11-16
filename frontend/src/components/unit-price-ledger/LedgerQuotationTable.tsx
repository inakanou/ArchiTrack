/**
 * @fileoverview 単価台帳の一覧の表（unit-price-ledger タスク4.2）
 *
 * 並びはサーバーの返す順（見積日の新しい順）のまま出す。業者名から見積の詳細の画面
 * （`/unit-price-ledger/quotations/:id`）へ移る。0 件の表示は親（UnitPriceLedgerPage）が出す。
 *
 * Requirements (unit-price-ledger):
 * - 4.1: 業者名・見積日・案件名・見積の合計（別途を除く）・採否・読取の確認・参考の行の有無を一覧に出す
 */

import { Link } from 'react-router-dom';
import type { LedgerQuotationSummary } from '../../api/unit-price-ledger';
import { formatDate } from '../../utils/formatters';
import { ADOPTION_LABELS, READING_STATUS_LABELS } from './ledger-labels';

export interface LedgerQuotationTableProps {
  /** 一覧の見積（1 ページ分） */
  quotations: ReadonlyArray<LedgerQuotationSummary>;
}

/** 値の無い欄の表示 */
const EMPTY_CELL = '-';

const COLUMNS = ['業者名', '見積日', '案件名', '合計', '採否', '読取の確認', '参考の行'] as const;

const amountFormatter = new Intl.NumberFormat('ja-JP');

function formatAmount(amount: number | null): string {
  return amount === null ? EMPTY_CELL : `${amountFormatter.format(amount)}円`;
}

export default function LedgerQuotationTable({ quotations }: LedgerQuotationTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <caption className="sr-only">台帳の見積の一覧</caption>
        <thead className="bg-gray-50">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={`px-4 py-3 font-semibold text-gray-700 whitespace-nowrap ${
                  column === '合計' ? 'text-right' : 'text-left'
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {quotations.map((quotation) => (
            <tr key={quotation.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link
                  to={`/unit-price-ledger/quotations/${encodeURIComponent(quotation.id)}`}
                  className="text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                >
                  {quotation.vendorName}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(quotation.submittedAt)}</td>
              <td className="px-4 py-3">{quotation.projectName ?? EMPTY_CELL}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                {formatAmount(quotation.totalAmount)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{ADOPTION_LABELS[quotation.adoption]}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {READING_STATUS_LABELS[quotation.readingStatus]}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {quotation.hasReferenceLines ? 'あり' : 'なし'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
