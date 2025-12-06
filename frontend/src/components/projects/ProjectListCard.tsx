/**
 * @fileoverview プロジェクト一覧カードコンポーネント
 *
 * Task 8.2: プロジェクト一覧カード表示の実装
 *
 * Requirements:
 * - 15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - 15.3: 768px未満でカード形式に切り替えて表示
 * - 15.4: タッチ操作に最適化されたUI（タップターゲット44x44px以上）
 */

import { useCallback, type KeyboardEvent } from 'react';
import type { ProjectInfo } from '../../types/project.types';
import { getStatusColor } from '../../utils/project-status';
import { PROJECT_STATUS_LABELS } from '../../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ProjectListCard コンポーネントのProps
 */
export interface ProjectListCardProps {
  /** プロジェクト一覧データ */
  projects: ProjectInfo[];
  /** カードクリックハンドラ */
  onCardClick: (projectId: string) => void;
}

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
 * ステータスバッジコンポーネント
 */
function StatusBadge({ projectId, status }: { projectId: string; status: ProjectInfo['status'] }) {
  const { bg, text } = getStatusColor(status);
  const label = PROJECT_STATUS_LABELS[status] || status;

  return (
    <span
      data-testid={`project-card-status-badge-${projectId}`}
      data-status={status}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

/**
 * 個別のプロジェクトカード
 */
function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectInfo;
  onClick: (projectId: string) => void;
}) {
  /**
   * クリックハンドラ
   */
  const handleClick = useCallback(() => {
    onClick(project.id);
  }, [onClick, project.id]);

  /**
   * キーボードイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(project.id);
      }
    },
    [onClick, project.id]
  );

  return (
    <div
      data-testid={`project-card-${project.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`プロジェクト: ${project.name}`}
      className="min-h-11 p-4 border rounded-lg bg-white shadow-sm cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
    >
      {/* カードヘッダー: プロジェクト名とステータス */}
      <div
        data-testid={`project-card-header-${project.id}`}
        className="flex items-start justify-between gap-2 mb-2"
      >
        <h3 className="font-medium text-gray-900 text-base leading-tight line-clamp-2">
          {project.name}
        </h3>
        <StatusBadge projectId={project.id} status={project.status} />
      </div>

      {/* 顧客名 */}
      <p className="text-sm text-gray-600 mb-3">{project.customerName}</p>

      {/* 日付情報 */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">作成:</span>
          <span>{formatDate(project.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">更新:</span>
          <span>{formatDate(project.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * プロジェクト一覧カードコンポーネント
 *
 * モバイル向けにカード形式でプロジェクト一覧を表示します。
 * タップ操作に最適化されたUI（タップターゲット44x44px以上）を提供します。
 *
 * @example
 * ```tsx
 * <ProjectListCard
 *   projects={projects}
 *   onCardClick={(id) => navigate(`/projects/${id}`)}
 * />
 * ```
 */
export default function ProjectListCard({ projects, onCardClick }: ProjectListCardProps) {
  return (
    <div
      data-testid="project-card-list"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onClick={onCardClick} />
      ))}
    </div>
  );
}
