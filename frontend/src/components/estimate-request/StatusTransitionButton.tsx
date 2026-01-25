/**
 * @fileoverview StatusTransitionButtonコンポーネント
 *
 * 見積依頼のステータス遷移ボタンを提供するコンポーネント。
 * 現在のステータスに応じて適切な遷移ボタンを表示し、
 * ステータス遷移APIの呼び出しとローディング状態を管理します。
 *
 * Task 15.2: StatusTransitionButtonの実装
 *
 * Requirements:
 * - 12.5: 「依頼前」ステータスのとき「依頼済にする」ボタンを表示
 * - 12.6: 「依頼済」ステータスのとき「見積受領済にする」ボタンを表示
 * - 12.7: 「依頼前」へ戻すボタンは表示しない
 * - 12.8: 「見積受領済」ステータスのとき「依頼済に戻す」ボタンを表示
 * - 12.9: ステータス遷移ボタンをクリックするとステータスを変更
 * - 12.10: ステータス変更完了後にトースト通知を表示
 *
 * @module components/estimate-request/StatusTransitionButton
 */

import { useState, useCallback } from 'react';
import type { EstimateRequestStatus } from './StatusBadge';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 遷移ボタン設定
 */
interface TransitionConfig {
  /** ボタンラベル */
  label: string;
  /** 遷移先ステータス */
  targetStatus: EstimateRequestStatus;
  /** ボタンのスタイルクラス */
  className: string;
  /** aria-label */
  ariaLabel: string;
}

/**
 * StatusTransitionButtonコンポーネントのProps
 */
export interface StatusTransitionButtonProps {
  /** 現在のステータス */
  status: EstimateRequestStatus;
  /** ステータス遷移時のコールバック */
  onTransition: (newStatus: EstimateRequestStatus) => Promise<void>;
  /** 成功時のコールバック（トースト通知用） */
  onSuccess: (message: string) => void;
  /** エラー時のコールバック */
  onError?: (message: string) => void;
  /** 外部からのローディング状態 */
  isLoading?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ステータスごとの遷移ボタン設定
 *
 * Requirements:
 * - 12.5: 依頼前 -> 依頼済にする
 * - 12.6: 依頼済 -> 見積受領済にする
 * - 12.7: 依頼前に戻すボタンは表示しない
 * - 12.8: 見積受領済 -> 依頼済に戻す
 */
const TRANSITION_CONFIGS: Record<EstimateRequestStatus, TransitionConfig[]> = {
  BEFORE_REQUEST: [
    {
      label: '依頼済にする',
      targetStatus: 'REQUESTED',
      className: 'bg-blue-600 hover:bg-blue-700 text-white',
      ariaLabel: 'ステータスを依頼済に変更する',
    },
  ],
  REQUESTED: [
    {
      label: '見積受領済にする',
      targetStatus: 'QUOTATION_RECEIVED',
      className: 'bg-green-600 hover:bg-green-700 text-white',
      ariaLabel: 'ステータスを見積受領済に変更する',
    },
    // Requirements 12.7: 依頼前に戻すボタンは表示しない
  ],
  QUOTATION_RECEIVED: [
    {
      label: '依頼済に戻す',
      targetStatus: 'REQUESTED',
      className: 'bg-orange-600 hover:bg-orange-700 text-white',
      ariaLabel: 'ステータスを依頼済に戻す',
    },
  ],
};

/**
 * ステータスラベル
 */
const STATUS_LABELS: Record<EstimateRequestStatus, string> = {
  BEFORE_REQUEST: '依頼前',
  REQUESTED: '依頼済',
  QUOTATION_RECEIVED: '見積受領済',
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ローディングスピナー
 */
function LoadingSpinner() {
  return (
    <svg
      data-testid="loading-spinner"
      className="animate-spin h-4 w-4 mr-2"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * StatusTransitionButtonコンポーネント
 *
 * 現在のステータスに応じて適切なステータス遷移ボタンを表示します。
 * ステータス遷移API呼び出し中はローディング状態を表示し、
 * 完了後はトースト通知を表示します。
 *
 * @example
 * ```tsx
 * <StatusTransitionButton
 *   status="BEFORE_REQUEST"
 *   onTransition={async (newStatus) => {
 *     await updateStatus(estimateRequestId, newStatus);
 *   }}
 *   onSuccess={(message) => toast.success(message)}
 *   onError={(message) => toast.error(message)}
 * />
 * ```
 */
export function StatusTransitionButton({
  status,
  onTransition,
  onSuccess,
  onError,
  isLoading: externalLoading = false,
  disabled = false,
}: StatusTransitionButtonProps): React.ReactNode {
  const [internalLoading, setInternalLoading] = useState(false);

  const isLoading = externalLoading || internalLoading;
  const transitions = TRANSITION_CONFIGS[status];

  /**
   * ステータス遷移を実行
   */
  const handleTransition = useCallback(
    async (targetStatus: EstimateRequestStatus) => {
      if (isLoading || disabled) return;

      setInternalLoading(true);

      try {
        await onTransition(targetStatus);

        // Requirements 12.10: ステータス変更完了後にトースト通知を表示
        const targetLabel = STATUS_LABELS[targetStatus];
        onSuccess(`ステータスを「${targetLabel}」に変更しました`);
      } catch {
        // エラーハンドリング
        if (onError) {
          onError('ステータスの変更に失敗しました');
        }
      } finally {
        setInternalLoading(false);
      }
    },
    [isLoading, disabled, onTransition, onSuccess, onError]
  );

  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((config) => (
        <button
          key={config.targetStatus}
          type="button"
          onClick={() => handleTransition(config.targetStatus)}
          disabled={isLoading || disabled}
          aria-label={config.ariaLabel}
          aria-busy={internalLoading}
          className={`
            inline-flex items-center justify-center
            px-4 py-2 rounded-md
            font-medium text-sm
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${config.className}
          `.trim()}
        >
          {internalLoading && <LoadingSpinner />}
          {config.label}
        </button>
      ))}
    </div>
  );
}

export default StatusTransitionButton;
