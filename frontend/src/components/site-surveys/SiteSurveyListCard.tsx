/**
 * @fileoverview 現場調査一覧カードコンポーネント（モバイル用）
 *
 * Task 8.1: 現場調査一覧表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: プロジェクト配下の現場調査をページネーション付きで表示
 * - 3.5: 一覧画面でサムネイル画像（代表画像）を表示
 */

import { useCallback, type KeyboardEvent } from 'react';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveyListCard コンポーネントのProps
 */
export interface SiteSurveyListCardProps {
  /** 現場調査一覧データ */
  surveys: SiteSurveyInfo[];
  /** カードクリックハンドラ */
  onCardClick: (surveyId: string) => void;
}

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
 * サムネイル画像コンポーネント
 *
 * Requirements: 3.5
 */
function ThumbnailImage({ survey }: { survey: SiteSurveyInfo }) {
  if (survey.thumbnailUrl) {
    return (
      <img
        src={survey.thumbnailUrl}
        alt={`${survey.name}のサムネイル`}
        className="w-20 h-20 object-cover rounded-lg"
      />
    );
  }

  // プレースホルダー表示
  return (
    <div
      data-testid="thumbnail-placeholder"
      className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center"
    >
      <svg
        width="32"
        height="32"
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
 * 個別カードコンポーネント
 */
function SurveyCard({
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
      data-testid={`survey-card-${survey.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${survey.name}の詳細を表示`}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
    >
      <div className="flex gap-4">
        {/* サムネイル */}
        <div className="flex-shrink-0">
          <ThumbnailImage survey={survey} />
        </div>

        {/* 情報 */}
        <div className="flex-1 min-w-0">
          {/* 現場調査名 */}
          <h3 className="text-base font-medium text-gray-900 truncate">{survey.name}</h3>

          {/* メモ */}
          {survey.memo && <p className="text-sm text-gray-500 mt-0.5 truncate">{survey.memo}</p>}

          {/* 調査日・画像数 */}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            {/* 調査日 */}
            <div className="flex items-center gap-1">
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
              <span>{formatDate(survey.surveyDate)}</span>
            </div>

            {/* 画像数 */}
            <div className="flex items-center gap-1">
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
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span data-testid="image-count">{survey.imageCount}枚</span>
            </div>
          </div>
        </div>

        {/* 矢印アイコン */}
        <div className="flex-shrink-0 self-center">
          <svg
            width="20"
            height="20"
            className="text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
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
 * 現場調査一覧カードコンポーネント（モバイル用）
 *
 * カード形式で現場調査一覧を表示します。
 *
 * @example
 * ```tsx
 * <SiteSurveyListCard
 *   surveys={surveys}
 *   onCardClick={(id) => navigate(`/site-surveys/${id}`)}
 * />
 * ```
 */
export default function SiteSurveyListCard({ surveys, onCardClick }: SiteSurveyListCardProps) {
  return (
    <div data-testid="survey-card-list" className="space-y-3">
      {surveys.map((survey) => (
        <SurveyCard key={survey.id} survey={survey} onClick={onCardClick} />
      ))}
    </div>
  );
}
