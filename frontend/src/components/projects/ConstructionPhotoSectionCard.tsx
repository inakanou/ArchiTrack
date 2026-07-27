/**
 * @fileoverview 工事写真セクションカードコンポーネント
 *
 * Task 7.2 (construction-photo): プロジェクト詳細への工事写真パネル追加
 *
 * 既存の工程表セクション（ScheduleSectionCard）を雛形とし、同一スタイル・
 * パターンを踏襲する。プロジェクト詳細画面で工程表パネルの直下に配置される。
 *
 * Requirements (construction-photo):
 * - 2.1: プロジェクト詳細画面に工事写真パネルを工程表パネルの直下に表示する
 * - 2.2: 工事写真パネルを操作すると当該プロジェクトの工事写真一覧画面へ遷移する
 * - 2.3: 工事写真パネルに登録件数などのサマリ情報を表示する
 *
 * 表示要素:
 * - セクションタイトル「工事写真」
 * - 総数表示（例: 全5件）
 * - 直近N件のアルバムカード表示（アルバム名・更新日時・写真枚数・代表サムネ）
 * - 「すべて見る」リンク（工事写真一覧画面へ遷移）
 * - 新規作成ボタン（アルバム作成画面へ遷移）
 */

import { Link } from 'react-router-dom';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 工事写真セクション表示用のアルバムサマリー情報
 *
 * `ProjectConstructionPhotoSummary.latestAlbums` の要素の表示に必要な部分集合。
 */
export interface ConstructionPhotoSectionItem {
  id: string;
  name: string;
  /** アルバム配下の写真項目数 */
  photoCount: number;
  /** 代表写真のサムネイル署名付きURL（なければ null/undefined） */
  thumbnailUrl?: string | null;
  updatedAt: string;
}

/**
 * ConstructionPhotoSectionCardコンポーネントのProps
 */
export interface ConstructionPhotoSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 工事写真アルバムの総数 */
  totalCount: number;
  /** 直近N件のアルバム */
  latestAlbums: ConstructionPhotoSectionItem[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義（ScheduleSectionCardと同様のスタイル）
// ============================================================================

const styles = {
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  addButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '6px 12px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  albumList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  albumCard: {
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
  albumInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  albumName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  albumMeta: {
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
 * 更新日時を日本語形式でフォーマットする
 */
function formatUpdatedAt(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * サムネイルプレースホルダー（代表写真なし）
 */
function ThumbnailPlaceholder() {
  return (
    <div style={styles.thumbnailPlaceholder} data-testid="construction-photo-thumbnail-placeholder">
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
 * スケルトンローダー
 */
function ConstructionPhotoSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="construction-photo-section-skeleton">
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
      <p style={styles.emptyText}>工事写真はまだありません</p>
      <Link to={`/projects/${projectId}/construction-photos/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 工事写真アルバムカード
 *
 * クリックで工事写真詳細（アルバム）画面へ遷移する（Requirements 2.4）。
 */
function AlbumCard({ album }: { album: ConstructionPhotoSectionItem }) {
  return (
    <Link
      to={`/construction-photos/${album.id}`}
      style={styles.albumCard}
      data-testid={`construction-photo-card-${album.id}`}
      aria-label={`${album.name}の工事写真を見る`}
    >
      {album.thumbnailUrl ? (
        <img
          src={album.thumbnailUrl}
          alt={`${album.name}のサムネイル`}
          style={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <ThumbnailPlaceholder />
      )}
      <div style={styles.albumInfo}>
        <h4 style={styles.albumName}>{album.name}</h4>
        <p style={styles.albumMeta}>
          {formatUpdatedAt(album.updatedAt)} / {album.photoCount}枚
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真セクションカード
 *
 * プロジェクト詳細画面で工程表パネルの直下に配置し、直近の工事写真アルバムと
 * 総数を表示する。ScheduleSectionCardと同様のスタイル・パターンを踏襲。
 *
 * @example
 * ```tsx
 * <ConstructionPhotoSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestAlbums={albums}
 *   isLoading={false}
 * />
 * ```
 */
export function ConstructionPhotoSectionCard({
  projectId,
  totalCount,
  latestAlbums,
  isLoading,
}: ConstructionPhotoSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="construction-photo-section-title"
      data-testid="construction-photo-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="construction-photo-section-title" style={styles.title}>
            工事写真
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/construction-photos/new`}
              style={styles.addButton}
              aria-label="工事写真アルバムを新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/construction-photos`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <ConstructionPhotoSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.albumList}>
          {latestAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ConstructionPhotoSectionCard;
