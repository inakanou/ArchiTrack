/**
 * @fileoverview 取引先一覧テーブルコンポーネント
 *
 * Task 9.1: 取引先一覧テーブルの実装
 *
 * Requirements (trading-partner-management):
 * - REQ-1.1: 取引先一覧ページにアクセスしたとき、登録済みの取引先をテーブル形式で表示
 * - REQ-1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を一覧に表示
 * - REQ-1.6: ソート列クリックで指定された列（取引先名、フリガナ、登録日等）で昇順または降順にソート
 * - REQ-1.7: 取引先データが存在しない場合、「取引先が登録されていません」というメッセージを表示
 * - REQ-1.8: 取引先一覧のデフォルトソート順をフリガナの昇順とする
 */

import { useCallback, type KeyboardEvent } from 'react';
import type { TradingPartnerInfo, TradingPartnerType } from '../../types/trading-partner.types';
import { TRADING_PARTNER_TYPE_LABELS } from '../../types/trading-partner.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ソート可能なフィールド
 */
export type SortField = 'name' | 'nameKana' | 'createdAt';

/**
 * ソート順序
 */
export type SortOrder = 'asc' | 'desc';

/**
 * TradingPartnerListTable コンポーネントのProps
 */
export interface TradingPartnerListTableProps {
  /** 取引先一覧データ */
  partners: TradingPartnerInfo[];
  /** 現在のソートフィールド */
  sortField: SortField;
  /** 現在のソート順序 */
  sortOrder: SortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SortField) => void;
  /** 行クリックハンドラ */
  onRowClick: (partnerId: string) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * テーブルカラム定義
 */
const COLUMNS: Array<{
  key: SortField | 'branchName' | 'representativeName' | 'types' | 'address' | 'phoneNumber';
  label: string;
  sortable: boolean;
}> = [
  { key: 'name', label: '取引先名', sortable: true },
  { key: 'nameKana', label: 'フリガナ', sortable: true },
  { key: 'branchName', label: '部課/支店/支社', sortable: false },
  { key: 'representativeName', label: '代表者名', sortable: false },
  { key: 'types', label: '種別', sortable: false },
  { key: 'address', label: '住所', sortable: false },
  { key: 'phoneNumber', label: '電話番号', sortable: false },
  { key: 'createdAt', label: '登録日', sortable: true },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付をローカルフォーマットで表示
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 取引先種別の色を取得
 */
function getTypeColor(type: TradingPartnerType): { bg: string; text: string } {
  switch (type) {
    case 'CUSTOMER':
      return { bg: 'bg-blue-100', text: 'text-blue-800' };
    case 'SUBCONTRACTOR':
      return { bg: 'bg-green-100', text: 'text-green-800' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-800' };
  }
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ソートアイコンコンポーネント
 */
function SortIcon({ order }: { order: SortOrder }) {
  if (order === 'asc') {
    return (
      <svg
        data-testid="sort-icon-asc"
        width="16"
        height="16"
        className="ml-1 inline-block"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg
      data-testid="sort-icon-desc"
      width="16"
      height="16"
      className="ml-1 inline-block"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/**
 * 取引先種別バッジコンポーネント
 */
function TypeBadge({ type }: { type: TradingPartnerType }) {
  const { bg, text } = getTypeColor(type);
  const label = TRADING_PARTNER_TYPE_LABELS[type] || type;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

/**
 * テーブルヘッダーセル
 */
function TableHeaderCell({
  column,
  currentSortField,
  currentSortOrder,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  currentSortField: SortField;
  currentSortOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const isCurrentSort = column.sortable && column.key === currentSortField;
  const ariaSort = isCurrentSort
    ? currentSortOrder === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined;

  const handleClick = () => {
    if (column.sortable) {
      onSort(column.key as SortField);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSort(column.key as SortField);
    }
  };

  return (
    <th
      scope="col"
      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50/80"
      aria-sort={ariaSort}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-1 -mx-1 py-0.5 transition-colors"
          aria-label={`${column.label}でソート`}
        >
          {column.label}
          {isCurrentSort && <SortIcon order={currentSortOrder} />}
        </button>
      ) : (
        column.label
      )}
    </th>
  );
}

/**
 * 空データメッセージコンポーネント
 */
function EmptyMessage() {
  return (
    <tr>
      <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            width="48"
            height="48"
            className="text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <span className="text-gray-500 text-sm">取引先が登録されていません</span>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 取引先一覧テーブルコンポーネント
 *
 * テーブル形式で取引先一覧を表示し、ソートと行クリック機能を提供します。
 *
 * @example
 * ```tsx
 * <TradingPartnerListTable
 *   partners={partners}
 *   sortField="nameKana"
 *   sortOrder="asc"
 *   onSort={(field) => handleSort(field)}
 *   onRowClick={(id) => navigate(`/trading-partners/${id}`)}
 * />
 * ```
 */
export default function TradingPartnerListTable({
  partners,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
}: TradingPartnerListTableProps) {
  /**
   * 行クリックハンドラ
   */
  const handleRowClick = useCallback(
    (partnerId: string) => {
      onRowClick(partnerId);
    },
    [onRowClick]
  );

  /**
   * 行のキーボードイベントハンドラ
   */
  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent, partnerId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(partnerId);
      }
    },
    [onRowClick]
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" aria-label="取引先一覧">
        <thead>
          <tr className="border-b border-gray-200">
            {COLUMNS.map((column) => (
              <TableHeaderCell
                key={column.key}
                column={column}
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {partners.length === 0 ? (
            <EmptyMessage />
          ) : (
            partners.map((partner, index) => (
              <tr
                key={partner.id}
                data-testid={`partner-row-${partner.id}`}
                onClick={() => handleRowClick(partner.id)}
                onKeyDown={(e) => handleRowKeyDown(e, partner.id)}
                tabIndex={0}
                className={`
                  cursor-pointer transition-colors
                  ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
                `}
                role="row"
              >
                {/* 取引先名 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {partner.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{partner.name}</span>
                  </div>
                </td>
                {/* フリガナ */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{partner.nameKana}</span>
                </td>
                {/* 部課/支店/支社名 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{partner.branchName || '-'}</span>
                </td>
                {/* 代表者名 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{partner.representativeName || '-'}</span>
                </td>
                {/* 種別 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {partner.types.map((type) => (
                      <TypeBadge key={type} type={type} />
                    ))}
                  </div>
                </td>
                {/* 住所 */}
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 line-clamp-1">{partner.address}</span>
                </td>
                {/* 電話番号 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{partner.phoneNumber || '-'}</span>
                </td>
                {/* 登録日 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <svg
                      width="16"
                      height="16"
                      className="text-gray-400 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {formatDate(partner.createdAt)}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
