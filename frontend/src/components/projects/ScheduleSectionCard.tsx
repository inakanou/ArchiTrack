/**
 * @fileoverview 工程表セクションカードコンポーネント
 *
 * Task 61.1: ScheduleSectionCardコンポーネントの作成
 *
 * Requirements (project-management):
 * - REQ-38.1: プロジェクト詳細画面の契約書セクションの下に工程表セクションを表示する
 * - REQ-38.2: 工程表セクションにセクションタイトル「工程表」を表示する
 * - REQ-38.3: 工程表セクションに工程表の総数を表示する（例：全5件）
 * - REQ-38.4: 工程表セクションに直近の工程表をカード形式で表示する
 * - REQ-38.5: 工程表カードに工程表名、更新日時、工程項目数を表示する
 * - REQ-38.6: ユーザーが工程表カードをクリックした場合、工程表詳細画面へ遷移する
 * - REQ-38.7: 工程表セクションに「すべて見る」リンクを提供する
 * - REQ-38.8: 「すべて見る」リンクで工程表一覧画面へ遷移する
 * - REQ-38.9: 工程表セクションに新規作成ボタンを提供する
 * - REQ-38.10: 新規作成ボタンで工程表作成画面へ遷移する
 * - REQ-38.11: 工程表が存在しない場合、「工程表はまだありません」メッセージと新規作成ボタンを表示する
 * - REQ-38.12: 工程表データをロード中の場合、スケルトンローダーを表示する
 * - REQ-38.13: 工程表セクションのUIを既存の契約書セクションと同様のスタイルで提供する
 *
 * 表示要素:
 * - セクションタイトル「工程表」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 工程表名
 *   - 更新日時
 *   - 工程項目数
 * - 「すべて見る」リンク（一覧画面へ遷移）
 * - 新規作成ボタン（作成画面へ遷移）
 */

import { Link } from 'react-router-dom';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 工程表セクション表示用のサマリー情報
 */
export interface ScheduleSectionItem {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
}

/**
 * ScheduleSectionCardコンポーネントのProps
 */
export interface ScheduleSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 工程表の総数 */
  totalCount: number;
  /** 直近N件の工程表 */
  latestSchedules: ScheduleSectionItem[];
  /** ローディング状態 */
  isLoading: boolean;
}

// ============================================================================
// スタイル定義（ContractSectionCardと同様のスタイル）
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
  scheduleList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  scheduleCard: {
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
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    backgroundColor: '#e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    flexShrink: 0,
  } as React.CSSProperties,
  scheduleInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  scheduleName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  scheduleMeta: {
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
  skeletonIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
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
 * 工程表アイコン（ガントチャートをイメージ）
 */
function ScheduleIcon() {
  return (
    <svg
      data-testid="schedule-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="7" y1="4" x2="7" y2="8" />
      <line x1="7" y1="12" x2="13" y2="12" />
      <line x1="9" y1="16" x2="17" y2="16" />
    </svg>
  );
}

/**
 * スケルトンローダー
 */
function ScheduleSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="schedule-section-skeleton">
      {[1, 2].map((index) => (
        <div key={index} style={styles.skeletonCard}>
          <div style={styles.skeletonIcon} />
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
      <p style={styles.emptyText}>工程表はまだありません</p>
      <Link to={`/projects/${projectId}/schedules/new`} style={styles.createLink}>
        新規作成
      </Link>
    </div>
  );
}

/**
 * 工程表カード
 */
function ScheduleCard({ schedule }: { schedule: ScheduleSectionItem }) {
  return (
    <Link
      to={`/schedules/${schedule.id}`}
      style={styles.scheduleCard}
      data-testid={`schedule-card-${schedule.id}`}
    >
      <div style={styles.iconWrapper}>
        <ScheduleIcon />
      </div>
      <div style={styles.scheduleInfo}>
        <h4 style={styles.scheduleName}>{schedule.name}</h4>
        <p style={styles.scheduleMeta}>
          {formatUpdatedAt(schedule.updatedAt)} / {schedule.itemCount}項目
        </p>
      </div>
    </Link>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工程表セクションカード
 *
 * プロジェクト詳細画面で直近の工程表と総数を表示する。
 * ContractSectionCardと同様のスタイル・パターンを踏襲。
 *
 * @example
 * ```tsx
 * <ScheduleSectionCard
 *   projectId="project-123"
 *   totalCount={5}
 *   latestSchedules={schedules}
 *   isLoading={false}
 * />
 * ```
 */
export function ScheduleSectionCard({
  projectId,
  totalCount,
  latestSchedules,
  isLoading,
}: ScheduleSectionCardProps) {
  return (
    <section
      style={styles.section}
      role="region"
      aria-labelledby="schedule-section-title"
      data-testid="schedule-section"
    >
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h3 id="schedule-section-title" style={styles.title}>
            工程表
          </h3>
          {!isLoading && <span style={styles.count}>全{totalCount}件</span>}
        </div>
        {!isLoading && totalCount > 0 && (
          <div style={styles.headerActions}>
            <Link
              to={`/projects/${projectId}/schedules/new`}
              style={styles.addButton}
              aria-label="工程表を新規作成"
            >
              新規作成
            </Link>
            <Link to={`/projects/${projectId}/schedules`} style={styles.viewAllLink}>
              すべて見る
            </Link>
          </div>
        )}
      </div>

      {isLoading ? (
        <ScheduleSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <div style={styles.scheduleList}>
          {latestSchedules.map((schedule) => (
            <ScheduleCard key={schedule.id} schedule={schedule} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ScheduleSectionCard;
