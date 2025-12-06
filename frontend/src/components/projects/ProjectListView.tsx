/**
 * @fileoverview プロジェクト一覧ビューコンポーネント
 *
 * Task 8.2: プロジェクト一覧カード表示の実装
 *
 * Requirements:
 * - 15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - 15.3: 768px未満でカード形式に切り替えて表示
 * - 15.4: タッチ操作に最適化されたUI（タップターゲット44x44px以上）
 *
 * このコンポーネントは、画面幅に応じてテーブル表示とカード表示を切り替えます。
 * - 768px以上: ProjectListTable（テーブル表示）
 * - 768px未満: ProjectListCard（カード表示）
 */

import useMediaQuery from '../../hooks/useMediaQuery';
import ProjectListTable from './ProjectListTable';
import ProjectListCard from './ProjectListCard';
import type { ProjectInfo } from '../../types/project.types';
import type { SortField, SortOrder } from './ProjectListTable';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ProjectListView コンポーネントのProps
 */
export interface ProjectListViewProps {
  /** プロジェクト一覧データ */
  projects: ProjectInfo[];
  /** 現在のソートフィールド */
  sortField: SortField;
  /** 現在のソート順序 */
  sortOrder: SortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SortField) => void;
  /** 行/カードクリックハンドラ */
  onRowClick: (projectId: string) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * モバイル判定用のメディアクエリ
 * 768px未満をモバイルとして扱う
 */
const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * プロジェクト一覧ビューコンポーネント
 *
 * 画面幅に応じてテーブル表示とカード表示を自動的に切り替えます。
 *
 * @example
 * ```tsx
 * <ProjectListView
 *   projects={projects}
 *   sortField="updatedAt"
 *   sortOrder="desc"
 *   onSort={handleSort}
 *   onRowClick={(id) => navigate(`/projects/${id}`)}
 * />
 * ```
 */
export default function ProjectListView({
  projects,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
}: ProjectListViewProps) {
  // 768px未満の場合はモバイル表示（カード）
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);

  if (isMobile) {
    // モバイル: カード表示
    return <ProjectListCard projects={projects} onCardClick={onRowClick} />;
  }

  // デスクトップ/タブレット: テーブル表示
  return (
    <ProjectListTable
      projects={projects}
      sortField={sortField}
      sortOrder={sortOrder}
      onSort={onSort}
      onRowClick={onRowClick}
    />
  );
}
