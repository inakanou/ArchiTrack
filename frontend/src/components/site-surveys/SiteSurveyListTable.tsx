/**
 * @fileoverview 現場調査一覧テーブルコンポーネント
 *
 * Task 8.1: 現場調査一覧表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: プロジェクト配下の現場調査をページネーション付きで表示
 * - 3.5: 一覧画面でサムネイル画像（代表画像）を表示
 */

import { useCallback, type KeyboardEvent } from 'react';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
  SurveyImageInfo,
} from '../../types/site-survey.types';
import { AnnotatedImageThumbnail } from './AnnotatedImageThumbnail';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveyListTable コンポーネントのProps
 */
export interface SiteSurveyListTableProps {
  /** 現場調査一覧データ */
  surveys: SiteSurveyInfo[];
  /** 現在のソートフィールド */
  sortField: SiteSurveySortableField;
  /** 現在のソート順序 */
  sortOrder: SiteSurveySortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SiteSurveySortableField) => void;
  /** 行クリックハンドラ */
  onRowClick: (surveyId: string) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * テーブルカラム定義
 *
 * Requirements: 3.1, 3.5
 */
interface ColumnDefinition {
  key: string;
  label: string;
  sortable: boolean;
  sortKey?: SiteSurveySortableField;
}

const COLUMNS: ColumnDefinition[] = [
  { key: 'thumbnail', label: 'サムネイル', sortable: false },
  { key: 'name', label: '現場調査名', sortable: false },
  { key: 'surveyDate', label: '調査日', sortable: true, sortKey: 'surveyDate' },
  { key: 'imageCount', label: '画像数', sortable: false },
  { key: 'updatedAt', label: '更新日', sortable: true, sortKey: 'updatedAt' },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付をローカルフォーマットで表示
 *
 * @param dateString - ISO8601形式の日付文字列
 * @returns YYYY/MM/DD形式の日本語日付文字列
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ソートアイコンコンポーネント
 */
function SortIcon({ order }: { order: SiteSurveySortOrder }) {
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
 * サムネイル画像コンポーネント
 *
 * Requirements: 3.5
 */
function ThumbnailImage({ survey }: { survey: SiteSurveyInfo }) {
  // 注釈表示に必要な情報がある場合
  if (survey.thumbnailImageId && survey.thumbnailOriginalUrl) {
    // AnnotatedImageThumbnail用のSurveyImageInfoオブジェクトを作成
    const imageInfo: SurveyImageInfo = {
      id: survey.thumbnailImageId,
      surveyId: survey.id,
      originalPath: '',
      thumbnailPath: '',
      fileName: '',
      fileSize: 0,
      width: 0,
      height: 0,
      displayOrder: 0,
      createdAt: '',
      originalUrl: survey.thumbnailOriginalUrl,
    };

    return (
      <AnnotatedImageThumbnail
        image={imageInfo}
        alt={`${survey.name}のサムネイル`}
        style={{
          width: '64px',
          height: '64px',
          objectFit: 'cover',
          borderRadius: '8px',
        }}
        loading="lazy"
      />
    );
  }

  // サムネイルURLがある場合は通常の画像を表示
  if (survey.thumbnailUrl) {
    return (
      <img
        src={survey.thumbnailUrl}
        alt={`${survey.name}のサムネイル`}
        className="w-16 h-16 object-cover rounded-lg"
      />
    );
  }

  // プレースホルダー表示
  return (
    <div
      data-testid="thumbnail-placeholder"
      className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center"
    >
      <svg
        width="24"
        height="24"
        className="text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
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
  column: ColumnDefinition;
  currentSortField: SiteSurveySortableField;
  currentSortOrder: SiteSurveySortOrder;
  onSort: (field: SiteSurveySortableField) => void;
}) {
  const isCurrentSort = column.sortKey === currentSortField;
  const ariaSort = isCurrentSort
    ? currentSortOrder === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined;

  const handleClick = () => {
    if (column.sortable && column.sortKey) {
      onSort(column.sortKey);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (column.sortable && column.sortKey && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSort(column.sortKey);
    }
  };

  return (
    <th
      scope="col"
      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50/80"
      aria-sort={ariaSort}
    >
      {column.sortable && column.sortKey ? (
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査一覧テーブルコンポーネント
 *
 * テーブル形式で現場調査一覧を表示し、ソートと行クリック機能を提供します。
 *
 * @example
 * ```tsx
 * <SiteSurveyListTable
 *   surveys={surveys}
 *   sortField="surveyDate"
 *   sortOrder="desc"
 *   onSort={(field) => handleSort(field)}
 *   onRowClick={(id) => navigate(`/site-surveys/${id}`)}
 * />
 * ```
 */
export default function SiteSurveyListTable({
  surveys,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
}: SiteSurveyListTableProps) {
  /**
   * 行クリックハンドラ
   */
  const handleRowClick = useCallback(
    (surveyId: string) => {
      onRowClick(surveyId);
    },
    [onRowClick]
  );

  /**
   * 行のキーボードイベントハンドラ
   */
  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent, surveyId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(surveyId);
      }
    },
    [onRowClick]
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" aria-label="現場調査一覧">
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
          {surveys.map((survey, index) => (
            <tr
              key={survey.id}
              data-testid={`survey-row-${survey.id}`}
              onClick={() => handleRowClick(survey.id)}
              onKeyDown={(e) => handleRowKeyDown(e, survey.id)}
              tabIndex={0}
              className={`
                cursor-pointer transition-colors
                ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
              `}
              role="row"
            >
              {/* サムネイル */}
              <td className="px-6 py-4 whitespace-nowrap">
                <ThumbnailImage survey={survey} />
              </td>
              {/* 現場調査名 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">{survey.name}</span>
                  {survey.memo && (
                    <span className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                      {survey.memo}
                    </span>
                  )}
                </div>
              </td>
              {/* 調査日 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
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
                  {formatDate(survey.surveyDate)}
                </div>
              </td>
              {/* 画像数 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span data-testid="image-count">{survey.imageCount}</span>
                </div>
              </td>
              {/* 更新日 */}
              <td className="px-6 py-4 whitespace-nowrap">
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {formatDate(survey.updatedAt)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
