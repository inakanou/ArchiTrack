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
        className="w-4 h-4 ml-1 inline-block"
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
      className="w-4 h-4 ml-1 inline-block"
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
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
      aria-sort={ariaSort}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="inline-flex items-center hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
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
      <table className="min-w-full divide-y divide-gray-200" aria-label="プロジェクト一覧">
        <thead className="bg-gray-50">
          <tr>
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
        <tbody className="bg-white divide-y divide-gray-200">
          {projects.map((project) => (
            <tr
              key={project.id}
              data-testid={`project-row-${project.id}`}
              onClick={() => handleRowClick(project.id)}
              onKeyDown={(e) => handleRowKeyDown(e, project.id)}
              tabIndex={0}
              className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              role="row"
            >
              {/* ID */}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {project.id}
              </td>
              {/* プロジェクト名 */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{project.name}</td>
              {/* 顧客名 */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {project.customerName}
              </td>
              {/* ステータス */}
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge projectId={project.id} status={project.status} />
              </td>
              {/* 作成日 */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(project.createdAt)}
              </td>
              {/* 更新日 */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(project.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
