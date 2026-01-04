/**
 * @fileoverview 現場調査一覧レスポンシブビューコンポーネント
 *
 * Task 8.3: レスポンシブ対応を実装する
 *
 * Requirements:
 * - 13.1: デスクトップ・タブレット・スマートフォン対応
 * - グリッド/リスト表示切り替え
 *
 * このコンポーネントは、画面幅と表示モードに応じて
 * テーブル、グリッド、カード表示を切り替えます。
 *
 * - デスクトップ: テーブル/グリッド/リスト切り替え可能（デフォルト: テーブル）
 * - タブレット: テーブル/グリッド/リスト切り替え可能（デフォルト: グリッド）
 * - モバイル: カード表示のみ（切り替え不可）
 */

import { useState, useCallback, type KeyboardEvent } from 'react';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import SiteSurveyListTable from './SiteSurveyListTable';
import SiteSurveyListCard from './SiteSurveyListCard';
import { AnnotatedImageThumbnail } from './AnnotatedImageThumbnail';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
  SurveyImageInfo,
} from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 表示モード
 */
export type ViewMode = 'table' | 'grid' | 'list';

/**
 * SiteSurveyResponsiveView コンポーネントのProps
 */
export interface SiteSurveyResponsiveViewProps {
  /** 現場調査一覧データ */
  surveys: SiteSurveyInfo[];
  /** 現在のソートフィールド */
  sortField: SiteSurveySortableField;
  /** 現在のソート順序 */
  sortOrder: SiteSurveySortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SiteSurveySortableField) => void;
  /** 行/カード/グリッドアイテムクリックハンドラ */
  onRowClick: (surveyId: string) => void;
  /** 初期表示モード（省略時はデバイスに応じて自動選択） */
  initialViewMode?: ViewMode;
  /** 表示モード変更ハンドラ */
  onViewModeChange?: (mode: ViewMode) => void;
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 表示モード切り替えボタングループ
 */
function ViewModeToggle({
  currentMode,
  onModeChange,
}: {
  currentMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      data-testid="view-mode-toggle"
      role="group"
      aria-label="表示モード"
      className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white"
    >
      <button
        type="button"
        onClick={() => onModeChange('table')}
        aria-pressed={currentMode === 'table'}
        aria-label="テーブル表示"
        className={`
          inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-l-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10 transition-colors
          ${
            currentMode === 'table'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }
        `}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span className="hidden sm:inline">テーブル</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('grid')}
        aria-pressed={currentMode === 'grid'}
        aria-label="グリッド表示"
        className={`
          inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-x border-gray-200
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10 transition-colors
          ${
            currentMode === 'grid'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }
        `}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        <span className="hidden sm:inline">グリッド</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('list')}
        aria-pressed={currentMode === 'list'}
        aria-label="リスト表示"
        className={`
          inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-r-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10 transition-colors
          ${
            currentMode === 'list'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }
        `}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
        <span className="hidden sm:inline">リスト</span>
      </button>
    </div>
  );
}

/**
 * グリッドアイテムサムネイル
 */
function GridItemThumbnail({ survey }: { survey: SiteSurveyInfo }) {
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
          width: '100%',
          height: '100%',
          objectFit: 'cover',
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
        className="w-full h-32 sm:h-36 md:h-40 object-cover"
      />
    );
  }

  // プレースホルダー
  return (
    <div
      data-testid="thumbnail-placeholder"
      className="w-full h-32 sm:h-36 md:h-40 bg-gray-100 flex items-center justify-center"
    >
      <svg
        width="48"
        height="48"
        className="text-gray-300"
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
 * グリッドアイテム
 */
function GridItem({
  survey,
  onClick,
}: {
  survey: SiteSurveyInfo;
  onClick: (surveyId: string) => void;
}) {
  const handleClick = useCallback(() => {
    onClick(survey.id);
  }, [survey.id, onClick]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(survey.id);
      }
    },
    [survey.id, onClick]
  );

  return (
    <div
      data-testid={`survey-grid-item-${survey.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${survey.name}の詳細を表示`}
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
    >
      {/* サムネイル */}
      <GridItemThumbnail survey={survey} />

      {/* 情報 */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 truncate">{survey.name}</h3>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <svg
              width="12"
              height="12"
              className="text-gray-400"
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
            {survey.imageCount}枚
          </span>
          <span className="text-xs text-gray-400">
            {new Date(survey.surveyDate).toLocaleDateString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * グリッド表示コンポーネント
 */
function SiteSurveyGrid({
  surveys,
  onItemClick,
}: {
  surveys: SiteSurveyInfo[];
  onItemClick: (surveyId: string) => void;
}) {
  return (
    <div
      data-testid="survey-grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {surveys.map((survey) => (
        <GridItem key={survey.id} survey={survey} onClick={onItemClick} />
      ))}
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査一覧レスポンシブビューコンポーネント
 *
 * 画面幅と表示モードに応じてテーブル、グリッド、カード表示を切り替えます。
 *
 * @example
 * ```tsx
 * <SiteSurveyResponsiveView
 *   surveys={surveys}
 *   sortField="surveyDate"
 *   sortOrder="desc"
 *   onSort={handleSort}
 *   onRowClick={(id) => navigate(`/site-surveys/${id}`)}
 * />
 * ```
 */
export default function SiteSurveyResponsiveView({
  surveys,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
  initialViewMode,
  onViewModeChange,
}: SiteSurveyResponsiveViewProps) {
  // メディアクエリ
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const isTablet = useMediaQuery(MEDIA_QUERIES.isTablet);

  // デフォルト表示モードを決定
  const getDefaultViewMode = (): ViewMode => {
    if (initialViewMode) return initialViewMode;
    if (isTablet) return 'grid';
    return 'table';
  };

  // 表示モード状態
  const [viewMode, setViewMode] = useState<ViewMode>(getDefaultViewMode);

  // 表示モード変更ハンドラ
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange]
  );

  // 空の場合のメッセージ表示
  if (surveys.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          width="48"
          height="48"
          className="mx-auto text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-gray-500">現場調査がありません</p>
      </div>
    );
  }

  // モバイル: カード表示のみ
  if (isMobile) {
    return <SiteSurveyListCard surveys={surveys} onCardClick={onRowClick} />;
  }

  // デスクトップ/タブレット: 表示モード切り替え可能
  return (
    <div>
      {/* 表示モード切り替え */}
      <div className="flex justify-end mb-4">
        <ViewModeToggle currentMode={viewMode} onModeChange={handleViewModeChange} />
      </div>

      {/* 表示 */}
      {viewMode === 'table' && (
        <SiteSurveyListTable
          surveys={surveys}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          onRowClick={onRowClick}
        />
      )}
      {viewMode === 'grid' && <SiteSurveyGrid surveys={surveys} onItemClick={onRowClick} />}
      {viewMode === 'list' && <SiteSurveyListCard surveys={surveys} onCardClick={onRowClick} />}
    </div>
  );
}
