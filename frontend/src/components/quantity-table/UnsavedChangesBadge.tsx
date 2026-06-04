/**
 * @fileoverview UnsavedChangesBadge コンポーネント
 *
 * 数量表編集画面で未保存の変更があることを視覚的に示すインジケーター。
 * 保存ボタン付近に配置し、未保存の変更がある間のみ表示する。
 *
 * Task 62.2: 未保存変更インジケーターを実装する
 *
 * Requirements:
 * - 44.1: 未保存の変更が存在する間、未保存状態を示す視覚インジケーターを表示する
 * - 44.2: 未保存の変更が存在しない間、インジケーターを表示しない
 * - 44.3: 編集操作により未保存の変更が発生したとき、表示状態に更新する
 * - 44.4: 保存操作が正常に完了したとき、非表示状態に更新する
 *
 * @module components/quantity-table/UnsavedChangesBadge
 */

import type { CSSProperties } from 'react';

/**
 * UnsavedChangesBadge コンポーネントの Props
 */
export interface UnsavedChangesBadgeProps {
  /** 未保存の変更が存在するか（true の間のみインジケーターを表示） */
  isUnsaved: boolean;
}

/**
 * インジケーターのスタイル（警告色のピル表示）
 */
const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#fef3c7',
  color: '#92400e',
  padding: '4px 10px',
  borderRadius: '9999px',
  border: '1px solid #fcd34d',
  fontSize: '13px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

/**
 * 未保存状態を示すドットのスタイル
 */
const dotStyle: CSSProperties = {
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '9999px',
  backgroundColor: '#f59e0b',
};

/**
 * UnsavedChangesBadge コンポーネント
 *
 * 未保存の変更がある間（`isUnsaved` が true）のみ、未保存状態を示す
 * インジケーターを描画する。`isUnsaved` が false の場合は何も描画しない（REQ-44.2）。
 * アクセシビリティのため `role="status"` と `aria-live="polite"` を付与し、
 * スクリーンリーダーに未保存状態の発生を通知する。
 *
 * @example
 * ```tsx
 * <UnsavedChangesBadge isUnsaved={editState.isDirty} />
 * ```
 */
export function UnsavedChangesBadge({ isUnsaved }: UnsavedChangesBadgeProps): React.ReactNode {
  // REQ-44.2: 未保存の変更がない場合はインジケーターを表示しない
  if (!isUnsaved) {
    return null;
  }

  // REQ-44.1: 未保存の変更がある間、未保存状態を示すインジケーターを表示する
  return (
    <span data-testid="unsaved-changes-badge" role="status" aria-live="polite" style={badgeStyle}>
      <span aria-hidden="true" style={dotStyle} />
      未保存の変更があります
    </span>
  );
}

export default UnsavedChangesBadge;
