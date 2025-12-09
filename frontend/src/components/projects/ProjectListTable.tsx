/**
 * @fileoverview プロジェクト一覧テーブルコンポーネント
 *
 * Task 8.1: プロジェクト一覧テーブルコンポーネントの実装
 *
 * Requirements:
 * - 2.2: 各プロジェクトのID、プロジェクト名、顧客名、ステータス、作成日、更新日を一覧に表示（列順序: ID、プロジェクト名、顧客名、ステータス、作成日、更新日）
 * - 2.3: プロジェクト行クリックで詳細画面に遷移
 * - 6.1: テーブルヘッダークリックで昇順ソート
 * - 6.2: 同じヘッダー再度クリックで降順ソート切り替え
 * - 6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
 * - 6.4: ソート対象外のカラムヘッダーにはソートアイコンを表示しない
 * - 6.5: ID、プロジェクト名、顧客名、ステータス、作成日、更新日のカラムでソート可能
 * - 20.6: テーブルヘッダーとデータセルの関連付け（アクセシビリティ）
 */

import { useCallback, type KeyboardEvent } from 'react';
import type { ProjectInfo } from '../../types/project.types';
import { getStatusColor } from '../../utils/project-status';
import { PROJECT_STATUS_LABELS } from '../../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ソート可能なフィールド
 */
export type SortField = 'id' | 'name' | 'customerName' | 'status' | 'createdAt' | 'updatedAt';

/**
 * ソート順序
 */
export type SortOrder = 'asc' | 'desc';

/**
 * ProjectListTable コンポーネントのProps
 */
export interface ProjectListTableProps {
  /** プロジェクト一覧データ */
  projects: ProjectInfo[];
  /** 現在のソートフィールド */
  sortField: SortField;
  /** 現在のソート順序 */
  sortOrder: SortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SortField) => void;
  /** 行クリックハンドラ */
  onRowClick: (projectId: string) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * テーブルカラム定義
 */
const COLUMNS: Array<{
  key: SortField;
  label: string;
  sortable: boolean;
}> = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'プロジェクト名', sortable: true },
  { key: 'customerName', label: '顧客名', sortable: true },
  { key: 'status', label: 'ステータス', sortable: true },
  { key: 'createdAt', label: '作成日', sortable: true },
  { key: 'updatedAt', label: '更新日', sortable: true },
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
 * UUIDを短縮表示（先頭8文字）
 */
function shortenId(id: string): string {
  return id.substring(0, 8);
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
 * ステータスバッジコンポーネント
 */
function StatusBadge({ projectId, status }: { projectId: string; status: ProjectInfo['status'] }) {
  const { bg, text } = getStatusColor(status);
  const label = PROJECT_STATUS_LABELS[status] || status;

  return (
    <span
      data-testid={`project-status-badge-${projectId}`}
      data-status={status}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}
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
  const isCurrentSort = column.key === currentSortField;
  const ariaSort = isCurrentSort
    ? currentSortOrder === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined;

  const handleClick = () => {
    if (column.sortable) {
      onSort(column.key);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSort(column.key);
    }
  };

  return (
    <th
      scope="col"
      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50/80"
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * プロジェクト一覧テーブルコンポーネント
 *
 * テーブル形式でプロジェクト一覧を表示し、ソートと行クリック機能を提供します。
 *
 * @example
 * ```tsx
 * <ProjectListTable
 *   projects={projects}
 *   sortField="updatedAt"
 *   sortOrder="desc"
 *   onSort={(field) => handleSort(field)}
 *   onRowClick={(id) => navigate(`/projects/${id}`)}
 * />
 * ```
 */
export default function ProjectListTable({
  projects,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
}: ProjectListTableProps) {
  /**
   * 行クリックハンドラ
   */
  const handleRowClick = useCallback(
    (projectId: string) => {
      onRowClick(projectId);
    },
    [onRowClick]
  );

  /**
   * 行のキーボードイベントハンドラ
   */
  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent, projectId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(projectId);
      }
    },
    [onRowClick]
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" aria-label="プロジェクト一覧">
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
          {projects.map((project, index) => (
            <tr
              key={project.id}
              data-testid={`project-row-${project.id}`}
              onClick={() => handleRowClick(project.id)}
              onKeyDown={(e) => handleRowKeyDown(e, project.id)}
              tabIndex={0}
              className={`
                cursor-pointer transition-colors
                ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
              `}
              role="row"
            >
              {/* ID */}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-mono font-medium text-gray-600"
                  title={project.id}
                >
                  {shortenId(project.id)}
                </span>
              </td>
              {/* プロジェクト名 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{project.name}</span>
                </div>
              </td>
              {/* 顧客名 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span className="text-sm text-gray-600">{project.customerName}</span>
                </div>
              </td>
              {/* ステータス */}
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge projectId={project.id} status={project.status} />
              </td>
              {/* 作成日 */}
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
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {formatDate(project.createdAt)}
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
                  {formatDate(project.updatedAt)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
