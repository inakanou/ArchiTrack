/**
 * @fileoverview EstimateCard コンポーネント
 *
 * Task 17.2: EstimateCardコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-14.3: 見積書名、作成日時、合計金額を表示する
 * - REQ-14.4: 見積書カードクリックで詳細画面へ遷移する
 *
 * 見積依頼カード（EstimateRequestSectionCard内のRequestCard）と同様のスタイルを採用し、
 * ドキュメントアイコン（封筒アイコンではない）を使用する。
 *
 * @module components/estimate/EstimateCard
 */

import { Link } from 'react-router-dom';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateCardコンポーネントのProps
 */
export interface EstimateCardProps {
  /** 見積書ID */
  id: string;
  /** 見積書名 */
  name: string;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 合計金額（文字列形式のDecimal、nullの場合は非表示） */
  totalAmount: string | null;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  card: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'box-shadow 0.2s, border-color 0.2s',
  } as React.CSSProperties,
  iconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    flexShrink: 0,
  } as React.CSSProperties,
  info: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  name: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  meta: {
    fontSize: '14px',
    color: '#6b7280',
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

/**
 * 金額をフォーマット
 * @param amount - 金額文字列（Decimal形式）
 */
function formatAmount(amount: string | null): string | null {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;
  return num.toLocaleString('ja-JP') + '円';
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積書アイコン（ドキュメントアイコン）
 *
 * Note: 封筒アイコンではなく、ドキュメントアイコンを使用する（要件に基づく）
 */
function EstimateIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      data-testid="estimate-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書カードコンポーネント
 *
 * 見積書の概要情報をカード形式で表示し、クリックで詳細画面へ遷移する。
 *
 * Requirements:
 * - REQ-14.3: 見積書名、作成日時、合計金額を表示
 * - REQ-14.4: クリックで詳細画面へ遷移
 *
 * @example
 * ```tsx
 * <EstimateCard
 *   id="est-001"
 *   name="建築工事見積書"
 *   createdAt="2024-01-15T10:00:00.000Z"
 *   totalAmount="1500000"
 * />
 * ```
 */
export function EstimateCard({ id, name, createdAt, totalAmount }: EstimateCardProps) {
  const formattedAmount = formatAmount(totalAmount);

  return (
    <Link
      to={`/estimates/${id}`}
      style={styles.card}
      aria-label={`${name}の見積書詳細を見る`}
      data-testid={`estimate-card-${id}`}
    >
      <div style={styles.iconWrapper}>
        <EstimateIcon size={28} />
      </div>
      <div style={styles.info}>
        <h2 style={styles.name}>{name}</h2>
        <p style={styles.meta}>
          {formatDate(createdAt)}
          {formattedAmount && ` / ${formattedAmount}`}
        </p>
      </div>
    </Link>
  );
}

export default EstimateCard;
