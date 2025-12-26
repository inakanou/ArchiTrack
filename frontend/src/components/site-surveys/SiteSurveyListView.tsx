/**
 * @fileoverview 現場調査一覧ビューコンポーネント
 *
 * Task 8.1: 現場調査一覧表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: プロジェクト配下の現場調査をページネーション付きで表示
 * - 3.5: 一覧画面でサムネイル画像（代表画像）を表示
 *
 * このコンポーネントは、画面幅に応じてテーブル表示とカード表示を切り替えます。
 * - 768px以上: SiteSurveyListTable（テーブル表示）
 * - 768px未満: SiteSurveyListCard（カード表示）
 */

import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import SiteSurveyListTable from './SiteSurveyListTable';
import SiteSurveyListCard from './SiteSurveyListCard';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveyListView コンポーネントのProps
 */
export interface SiteSurveyListViewProps {
  /** 現場調査一覧データ */
  surveys: SiteSurveyInfo[];
  /** 現在のソートフィールド */
  sortField: SiteSurveySortableField;
  /** 現在のソート順序 */
  sortOrder: SiteSurveySortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: SiteSurveySortableField) => void;
  /** 行/カードクリックハンドラ */
  onRowClick: (surveyId: string) => void;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査一覧ビューコンポーネント
 *
 * 画面幅に応じてテーブル表示とカード表示を自動的に切り替えます。
 *
 * @example
 * ```tsx
 * <SiteSurveyListView
 *   surveys={surveys}
 *   sortField="surveyDate"
 *   sortOrder="desc"
 *   onSort={handleSort}
 *   onRowClick={(id) => navigate(`/site-surveys/${id}`)}
 * />
 * ```
 */
export default function SiteSurveyListView({
  surveys,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
}: SiteSurveyListViewProps) {
  // 768px未満の場合はモバイル表示（カード）
  // MEDIA_QUERIES.isMobile は '(max-width: 767px)' を使用
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);

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

  if (isMobile) {
    // モバイル: カード表示
    return <SiteSurveyListCard surveys={surveys} onCardClick={onRowClick} />;
  }

  // デスクトップ/タブレット: テーブル表示
  return (
    <SiteSurveyListTable
      surveys={surveys}
      sortField={sortField}
      sortOrder={sortOrder}
      onSort={onSort}
      onRowClick={onRowClick}
    />
  );
}
