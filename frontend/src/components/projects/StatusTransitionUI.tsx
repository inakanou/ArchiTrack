/**
 * @fileoverview ステータス遷移UI コンポーネント
 *
 * Task 7.2: StatusTransitionUIコンポーネントの実装
 *
 * プロジェクトステータスの遷移UIを提供するコンポーネント。
 * 現在のステータス表示、遷移可能なステータス一覧、
 * ステータス変更履歴を表示し、遷移種別（順方向、差し戻し、終端）を
 * 視覚的に区別します。
 *
 * Requirements:
 * - 10.8: ステータス変更の実行
 * - 10.12: 各ステータスを視覚的に区別できる色分け
 * - 10.13: ステータス変更履歴をプロジェクト詳細画面で閲覧可能
 * - 10.14: 差し戻し遷移時は差し戻し理由の入力を必須とする
 * - 10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.3: エラーメッセージをaria-live属性でスクリーンリーダーに通知
 */

import { useState, useCallback } from 'react';
import type {
  ProjectStatus,
  AllowedTransition,
  StatusHistoryResponse,
  TransitionType,
} from '../../types/project.types';
import { PROJECT_STATUS_LABELS, TRANSITION_TYPE_LABELS } from '../../types/project.types';
import BackwardReasonDialog from './BackwardReasonDialog';

// ============================================================================
// 型定義
// ============================================================================

/**
 * StatusTransitionUI コンポーネントの Props
 */
export interface StatusTransitionUIProps {
  /** プロジェクトID */
  projectId: string;
  /** 現在のステータス */
  currentStatus: ProjectStatus;
  /** 遷移可能なステータス一覧 */
  allowedTransitions: AllowedTransition[];
  /** ステータス変更履歴 */
  statusHistory: StatusHistoryResponse[];
  /** ステータス遷移実行時のコールバック */
  onTransition: (newStatus: ProjectStatus, reason?: string) => Promise<void>;
  /** ローディング中フラグ */
  isLoading: boolean;
}

/**
 * 差し戻しダイアログの状態
 */
interface BackwardDialogState {
  isOpen: boolean;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus | null;
}

// ============================================================================
// ステータスカラー定義
// ============================================================================

/**
 * ステータスごとのカラーマップ
 * WCAG 2.1 Level AA準拠のコントラスト比を確保
 */
const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  PREPARING: { bg: '#e5e7eb', text: '#374151' }, // グレー
  SURVEYING: { bg: '#dbeafe', text: '#1e40af' }, // ブルー
  ESTIMATING: { bg: '#fef3c7', text: '#92400e' }, // イエロー
  APPROVING: { bg: '#ffedd5', text: '#c2410c' }, // オレンジ
  CONTRACTING: { bg: '#ede9fe', text: '#5b21b6' }, // パープル
  CONSTRUCTING: { bg: '#e0e7ff', text: '#3730a3' }, // インディゴ
  DELIVERING: { bg: '#cffafe', text: '#0e7490' }, // シアン
  BILLING: { bg: '#ccfbf1', text: '#0f766e' }, // ティール
  AWAITING: { bg: '#ecfccb', text: '#4d7c0f' }, // ライム
  COMPLETED: { bg: '#dcfce7', text: '#166534' }, // グリーン
  CANCELLED: { bg: '#fee2e2', text: '#991b1b' }, // レッド
  LOST: { bg: '#ffe4e6', text: '#9f1239' }, // ローズ
};

/**
 * 遷移種別ごとのスタイル
 */
const TRANSITION_TYPE_STYLES: Record<
  TransitionType,
  { iconColor: string; bgColor: string; hoverBg: string }
> = {
  initial: {
    iconColor: '#2563eb', // ブルー
    bgColor: '#eff6ff',
    hoverBg: '#dbeafe',
  },
  forward: {
    iconColor: '#16a34a', // グリーン
    bgColor: '#f0fdf4',
    hoverBg: '#dcfce7',
  },
  backward: {
    iconColor: '#ea580c', // オレンジ
    bgColor: '#fff7ed',
    hoverBg: '#ffedd5',
  },
  terminate: {
    iconColor: '#dc2626', // レッド
    bgColor: '#fef2f2',
    hoverBg: '#fee2e2',
  },
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
  } as React.CSSProperties,
  section: {
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#1f2937',
  } as React.CSSProperties,
  currentStatusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  transitionButtonsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  } as React.CSSProperties,
  transitionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  transitionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  historyList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  } as React.CSSProperties,
  historyItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  historyIcon: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
  } as React.CSSProperties,
  historyContent: {
    flex: 1,
  } as React.CSSProperties,
  historyStatusChange: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: '4px',
  } as React.CSSProperties,
  historyReason: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px',
    padding: '8px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
    fontStyle: 'italic',
  } as React.CSSProperties,
  historyMeta: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
  } as React.CSSProperties,
  emptyMessage: {
    fontSize: '14px',
    color: '#6b7280',
    padding: '16px',
    textAlign: 'center' as const,
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  } as React.CSSProperties,
  loadingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as React.CSSProperties,
};

// ============================================================================
// アイコンコンポーネント
// ============================================================================

/**
 * 矢印右アイコン（順方向遷移用）
 */
function ArrowRightIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="transition-icon-forward"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * 矢印左アイコン（差し戻し遷移用）
 */
function ArrowLeftIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="transition-icon-backward"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

/**
 * Xアイコン（終端遷移用）
 */
function XCircleIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="transition-icon-terminate"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/**
 * プラスサークルアイコン（初期遷移用）
 */
function PlusCircleIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="transition-icon-initial"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/**
 * 遷移種別に対応するアイコンを取得
 */
function getTransitionIcon(type: TransitionType, color: string) {
  switch (type) {
    case 'initial':
      return <PlusCircleIcon color={color} />;
    case 'forward':
      return <ArrowRightIcon color={color} />;
    case 'backward':
      return <ArrowLeftIcon color={color} />;
    case 'terminate':
      return <XCircleIcon color={color} />;
  }
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 日時をフォーマット
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * ステータス遷移UIコンポーネント
 *
 * プロジェクトステータスの遷移操作と履歴表示を提供します。
 * 遷移種別（順方向、差し戻し、終端）を視覚的に区別し、
 * 差し戻し遷移時は理由入力を必須とします。
 *
 * @example
 * ```tsx
 * <StatusTransitionUI
 *   projectId="project-123"
 *   currentStatus="PREPARING"
 *   allowedTransitions={[
 *     { status: 'SURVEYING', type: 'forward', requiresReason: false },
 *   ]}
 *   statusHistory={histories}
 *   onTransition={(status, reason) => handleTransition(status, reason)}
 *   isLoading={false}
 * />
 * ```
 */
function StatusTransitionUI({
  projectId,
  currentStatus,
  allowedTransitions,
  statusHistory,
  onTransition,
  isLoading,
}: StatusTransitionUIProps): React.ReactNode {
  // 差し戻しダイアログの状態
  const [backwardDialog, setBackwardDialog] = useState<BackwardDialogState>({
    isOpen: false,
    fromStatus: null,
    toStatus: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 遷移ボタンクリック時の処理
  const handleTransitionClick = useCallback(
    async (transition: AllowedTransition) => {
      if (isLoading || isSubmitting) return;

      // 差し戻し遷移の場合はダイアログを表示
      if (transition.requiresReason) {
        setBackwardDialog({
          isOpen: true,
          fromStatus: currentStatus,
          toStatus: transition.status,
        });
        return;
      }

      // その他の遷移は直接実行
      setIsSubmitting(true);
      try {
        await onTransition(transition.status, undefined);
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentStatus, isLoading, isSubmitting, onTransition]
  );

  // 差し戻しダイアログで確認された時の処理
  const handleBackwardConfirm = useCallback(
    async (reason: string) => {
      if (!backwardDialog.toStatus) return;

      setIsSubmitting(true);
      try {
        await onTransition(backwardDialog.toStatus, reason);
        setBackwardDialog({ isOpen: false, fromStatus: null, toStatus: null });
      } finally {
        setIsSubmitting(false);
      }
    },
    [backwardDialog.toStatus, onTransition]
  );

  // 差し戻しダイアログをキャンセル
  const handleBackwardCancel = useCallback(() => {
    setBackwardDialog({ isOpen: false, fromStatus: null, toStatus: null });
  }, []);

  // 現在のステータスのカラー
  const currentStatusColor = STATUS_COLORS[currentStatus];
  const currentStatusLabel = PROJECT_STATUS_LABELS[currentStatus];

  return (
    <div style={styles.container}>
      {/* 現在のステータス */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>現在のステータス</h3>
        <div style={styles.currentStatusContainer}>
          <span
            data-testid="current-status-badge"
            role="status"
            aria-label={`現在のステータス: ${currentStatusLabel}`}
            style={{
              ...styles.statusBadge,
              backgroundColor: currentStatusColor.bg,
              color: currentStatusColor.text,
            }}
          >
            {currentStatusLabel}
          </span>
          {isLoading && (
            <div data-testid="status-loading-indicator" style={styles.loadingIndicator}>
              <div style={styles.loadingSpinner} />
              <span>更新中...</span>
            </div>
          )}
        </div>
      </div>

      {/* 遷移可能なステータス */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>ステータス遷移</h3>
        {allowedTransitions.length === 0 ? (
          <div style={styles.emptyMessage}>遷移可能なステータスがありません</div>
        ) : (
          <div style={styles.transitionButtonsContainer}>
            {allowedTransitions.map((transition) => {
              const transitionStyle = TRANSITION_TYPE_STYLES[transition.type];
              const statusLabel = PROJECT_STATUS_LABELS[transition.status];
              const transitionTypeLabel = TRANSITION_TYPE_LABELS[transition.type];
              const isDisabled = isLoading || isSubmitting;

              return (
                <button
                  key={transition.status}
                  type="button"
                  onClick={() => handleTransitionClick(transition)}
                  disabled={isDisabled}
                  data-transition-type={transition.type}
                  aria-label={`${statusLabel}に${transitionTypeLabel}する`}
                  style={{
                    ...styles.transitionButton,
                    backgroundColor: transitionStyle.bgColor,
                    color: transitionStyle.iconColor,
                    borderColor: transitionStyle.iconColor,
                    ...(isDisabled ? styles.transitionButtonDisabled : {}),
                  }}
                >
                  {getTransitionIcon(transition.type, transitionStyle.iconColor)}
                  <span>{statusLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ステータス変更履歴 */}
      <div style={styles.section}>
        <h3 id={`status-history-title-${projectId}`} style={styles.sectionTitle}>
          ステータス変更履歴
        </h3>
        <section
          role="region"
          aria-labelledby={`status-history-title-${projectId}`}
          aria-label="ステータス変更履歴"
        >
          {statusHistory.length === 0 ? (
            <div style={styles.emptyMessage}>履歴がありません</div>
          ) : (
            <ul style={styles.historyList}>
              {statusHistory.map((history) => {
                const transitionStyle = TRANSITION_TYPE_STYLES[history.transitionType];

                return (
                  <li
                    key={history.id}
                    data-testid={`status-history-item-${history.id}`}
                    data-transition-type={history.transitionType}
                    style={{
                      ...styles.historyItem,
                      backgroundColor: transitionStyle.bgColor,
                    }}
                  >
                    <div style={styles.historyIcon}>
                      {getTransitionIcon(history.transitionType, transitionStyle.iconColor)}
                    </div>
                    <div style={styles.historyContent}>
                      <div style={styles.historyStatusChange}>
                        {history.fromStatusLabel ? (
                          <>
                            <span>{history.fromStatusLabel}</span>
                            <span style={{ margin: '0 8px' }}></span>
                            <span>{history.toStatusLabel}</span>
                          </>
                        ) : (
                          <span>{history.toStatusLabel}</span>
                        )}
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '12px',
                            color: transitionStyle.iconColor,
                          }}
                        >
                          ({history.transitionTypeLabel})
                        </span>
                      </div>
                      {history.reason && (
                        <div style={styles.historyReason}>理由: {history.reason}</div>
                      )}
                      <div style={styles.historyMeta}>
                        <span>{history.changedBy.displayName}</span>
                        <span style={{ margin: '0 8px' }}>|</span>
                        <span>{formatDateTime(history.changedAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* 差し戻し理由入力ダイアログ */}
      {backwardDialog.fromStatus && backwardDialog.toStatus && (
        <BackwardReasonDialog
          isOpen={backwardDialog.isOpen}
          onConfirm={handleBackwardConfirm}
          onCancel={handleBackwardCancel}
          fromStatus={backwardDialog.fromStatus}
          toStatus={backwardDialog.toStatus}
          isSubmitting={isSubmitting}
        />
      )}

      {/* CSS Animation for loading spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default StatusTransitionUI;
