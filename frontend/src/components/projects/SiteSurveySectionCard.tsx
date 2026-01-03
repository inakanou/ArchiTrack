/**
 * @fileoverview 現場調査セクションカードコンポーネント
 *
 * Task 31.2: SiteSurveySectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
 * - 2.2: 現場調査一覧画面への遷移リンク
 * - 2.3: 現場調査詳細画面への遷移リンク
 *
 * 表示要素:
 * - セクションタイトル「現場調査」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 調査名
 *   - 調査日
 *   - サムネイル画像（あれば）
 * - 「すべて見る」リンク（一覧画面へ遷移）
 */

import { Link } from 'react-router-dom';
import type { SiteSurveyInfo, SurveyImageInfo } from '../../types/site-survey.types';
import { AnnotatedImageThumbnail } from '../site-surveys/AnnotatedImageThumbnail';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveySectionCardコンポーネントのProps
 */
export interface SiteSurveySectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 現場調査の総数 */
  totalCount: number;
  /** 直近N件の現場調査 */
  latestSurveys: SiteSurveyInfo[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  titleWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  count: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  viewAllLink: {
    fontSize: '14px',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  } as React.CSSProperties,
  surveyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  surveyCard: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  thumbnail: {
    width: '64px',
    height: '48px',
    borderRadius: '4px',
    objectFit: 'cover' as const,
    backgroundColor: '#e5e7eb',
    flexShrink: 0,
  } as React.CSSProperties,
  thumbnailPlaceholder: {
    width: '64px',
    height: '48px',
    borderRadius: '4px',
    backgroundColor: '#e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    flexShrink: 0,
  } as React.CSSProperties,
  surveyInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  surveyName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  surveyMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '24px',
    color: '#6b7280',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '14px',
    marginBottom: '12px',
  } as React.CSSProperties,
  createLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  skeleton: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  skeletonCard: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
  skeletonThumb: {
    width: '64px',
    height: '48px',
    borderRadius: '4px',
    backgroundColor: '#e5e7eb',
  } as React.CSSProperties,
  skeletonContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as React.CSSProperties,
  skeletonLine: {
    height: '14px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付を日本語形式でフォーマット
 * @param dateString - ISO8601形式の日付文字列
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * スケルトンローダー
 */
function SurveySkeleton() {
  return (
    <div style={styles.skeleton} data-testid="site-survey-section-skeleton">
      {[1, 2].map((index) => (
        <div key={index} style={styles.skeletonCard}>
          <div style={styles.skeletonThumb} />
          <div style={styles.skeletonContent}>
            <div style={{ ...styles.skeletonLine, width: '60%' }} />
            <div style={{ ...styles.skeletonLine, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div style={styles.emptyState}>
      <p style={styles.emptyText}>現場調査はまだありません</p>
      <Link to={`/projects/${projectId}/site-surveys/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * サムネイルプレースホルダー
 */
function ThumbnailPlaceholder() {
  return (
    <div style={styles.thumbnailPlaceholder} data-testid="thumbnail-placeholder">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

/**
 * 注釈付きサムネイルのレンダリング
 *
 * thumbnailImageId と thumbnailOriginalUrl がある場合は注釈付きサムネイルを表示
 */
function SurveyThumbnail({ survey }: { survey: SiteSurveyInfo }) {
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
        style={styles.thumbnail}
        loading="lazy"
      />
    );
  }

  // サムネイルURLがある場合は通常の画像を表示
  if (survey.thumbnailUrl) {
    return (
      <img src={survey.thumbnailUrl} alt={`${survey.name}のサムネイル`} style={styles.thumbnail} />
    );
  }

  // サムネイルがない場合はプレースホルダーを表示
  return <ThumbnailPlaceholder />;
}

/**
 * 現場調査カード
 */
function SurveyCard({ survey }: { survey: SiteSurveyInfo }) {
  return (
    <Link
      to={`/projects/${survey.projectId}/site-surveys/${survey.id}`}
      style={styles.surveyCard}
      aria-label={`${survey.name}の現場調査詳細を見る`}
    >
      <SurveyThumbnail survey={survey} />
      <div style={styles.surveyInfo}>
        <h4 style={styles.surveyName}>{survey.name}</h4>
        <p style={styles.surveyMeta}>
          {formatDate(survey.surveyDate)} / {survey.imageCount}枚
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査セクションカード
 *
 * プロジェクト詳細画面で直近の現場調査と総数を表示する。
 *
 * @example
 * ```tsx
 * <SiteSurveySectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestSurveys={surveys}
 *   isLoading={false}
 * />
 * ```
 */
export function SiteSurveySectionCard({
  projectId,
  totalCount,
  latestSurveys,
  isLoading,
}: SiteSurveySectionCardProps) {
  return (
    <section style={styles.section} role="region" aria-labelledby="site-survey-section-title">
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="site-survey-section-title" style={styles.title}>
            現場調査
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <Link to={`/projects/${projectId}/site-surveys`} style={styles.viewAllLink}>
            すべて見る
          </Link>
        )}
      </div>

      {isLoading ? (
        <SurveySkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.surveyList}>
          {latestSurveys.map((survey) => (
            <SurveyCard key={survey.id} survey={survey} />
          ))}
        </div>
      )}
    </section>
  );
}

export default SiteSurveySectionCard;
