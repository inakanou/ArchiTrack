/**
 * @fileoverview プロジェクト一覧カードコンポーネント
 *
 * Task 8.2: プロジェクト一覧カード表示の実装
 * Task 22.3: ProjectListCardコンポーネントの表示項目更新
 *
 * Requirements:
 * - 2.2: プロジェクト一覧に営業担当者・工事担当者を表示
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
      className="group min-h-11 p-4 border border-gray-200 rounded-xl bg-white shadow-sm cursor-pointer hover:shadow-md hover:border-blue-200 hover:bg-gradient-to-b hover:from-blue-50/30 hover:to-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
    >
      {/* カードヘッダー: プロジェクト名とステータス */}
      <div
        data-testid={`project-card-header-${project.id}`}
        className="flex items-start justify-between gap-3 mb-3"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-lg font-semibold">
              {project.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-base leading-tight line-clamp-2 group-hover:text-blue-700 transition-colors">
              {project.name}
            </h3>
            {/* 顧客名 */}
            <div className="flex items-center gap-1.5 mt-1">
              <svg
                width="14"
                height="14"
                className="text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <span className="text-sm text-gray-500 truncate">
                {project.tradingPartner?.name ?? '-'}
              </span>
            </div>
          </div>
        </div>
        <StatusBadge projectId={project.id} status={project.status} />
      </div>

      {/* 担当者情報: 営業担当者・工事担当者 (Task 22.3) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm">
        {/* 営業担当者 */}
        <div data-testid={`sales-person-${project.id}`} className="flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            className="text-blue-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="text-gray-600">{project.salesPerson.displayName}</span>
        </div>
        {/* 工事担当者 */}
        <div
          data-testid={`construction-person-${project.id}`}
          className="flex items-center gap-1.5"
        >
          <svg
            width="14"
            height="14"
            className="text-orange-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-gray-600">{project.constructionPerson?.displayName ?? '-'}</span>
        </div>
      </div>

      {/* 日付情報 */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg
            width="14"
            height="14"
            className="text-gray-400"
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
          <span>{formatDate(project.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg
            width="14"
            height="14"
            className="text-gray-400"
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
          <span>{formatDate(project.updatedAt)}</span>
        </div>
        <div className="flex items-center text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium">詳細</span>
          <svg
            width="16"
            height="16"
            className="ml-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
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
