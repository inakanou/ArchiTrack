/**
 * @fileoverview StatusBadgeコンポーネント
 *
 * 見積依頼のステータスをバッジ形式で表示するコンポーネント。
 * ステータスごとに色分けされ、サイズバリエーションをサポートします。
 *
 * Task 15.1: StatusBadgeの実装
 *
 * Requirements:
 * - 12.1: ステータス表示エリアを表示する
 * - 12.4: 現在のステータスを視覚的に区別可能な形式で表示する
 * - 12.12: 見積依頼一覧画面に各見積依頼のステータスを表示する
 *
 * @module components/estimate-request/StatusBadge
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * 見積依頼ステータス
 *
 * - BEFORE_REQUEST: 依頼前
 * - REQUESTED: 依頼済
 * - QUOTATION_RECEIVED: 見積受領済
 */
export type EstimateRequestStatus = 'BEFORE_REQUEST' | 'REQUESTED' | 'QUOTATION_RECEIVED';

/**
 * バッジサイズ
 */
export type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * StatusBadgeコンポーネントのProps
 */
export interface StatusBadgeProps {
  /** 見積依頼ステータス */
  status: EstimateRequestStatus;
  /** バッジサイズ（デフォルト: md） */
  size?: BadgeSize;
  /** 追加のクラス名 */
  className?: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ステータスラベルのマッピング
 */
const STATUS_LABELS: Record<EstimateRequestStatus, string> = {
  BEFORE_REQUEST: '依頼前',
  REQUESTED: '依頼済',
  QUOTATION_RECEIVED: '見積受領済',
};

/**
 * ステータスごとのカラークラス
 *
 * Requirements: 12.4
 * - 依頼前: グレー
 * - 依頼済: ブルー
 * - 見積受領済: グリーン
 */
const STATUS_COLORS: Record<EstimateRequestStatus, string> = {
  BEFORE_REQUEST: 'bg-gray-100 text-gray-800',
  REQUESTED: 'bg-blue-100 text-blue-800',
  QUOTATION_RECEIVED: 'bg-green-100 text-green-800',
};

/**
 * サイズごとのクラス
 */
const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-0.5',
  lg: 'text-base px-3 py-1',
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * StatusBadgeコンポーネント
 *
 * 見積依頼のステータスをバッジ形式で表示します。
 * アクセシビリティに配慮し、aria-live属性でスクリーンリーダーに
 * ステータス変更を通知します。
 *
 * @example
 * ```tsx
 * // 基本的な使用
 * <StatusBadge status="BEFORE_REQUEST" />
 *
 * // サイズ指定
 * <StatusBadge status="REQUESTED" size="lg" />
 *
 * // 追加クラス
 * <StatusBadge status="QUOTATION_RECEIVED" className="ml-2" />
 * ```
 */
export function StatusBadge({
  status,
  size = 'md',
  className = '',
}: StatusBadgeProps): React.ReactNode {
  const label = STATUS_LABELS[status];
  const colorClass = STATUS_COLORS[status];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      data-testid="status-badge"
      role="status"
      aria-live="polite"
      aria-label={`ステータス: ${label}`}
      className={`
        inline-flex items-center
        rounded-full font-medium
        ${colorClass}
        ${sizeClass}
        ${className}
      `.trim()}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
