/**
 * @fileoverview 他のユーザーが編集中であることの警告表示
 *
 * 見積書詳細画面（常時編集、REQ-27.1）を他の利用者も開いている間、その利用者の
 * 表示名を挙げて編集中であることを警告する。編集中の他の利用者がいなければ何も描画しない。
 *
 * 警告は画面を開いた時点や相手が開いた時点で現れ、相手が離れると消える。
 * 読み上げは `role="status"`（丁寧な通知）とし、入力中の操作を遮らない。
 * 長い表示名でも 375px 幅で横にはみ出さないよう、任意の位置で折り返す。
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module components/estimate/EstimateEditPresenceNotice
 */

import type { CSSProperties } from 'react';
import type { EstimateOtherEditor } from '../../api/estimates';

export interface EstimateEditPresenceNoticeProps {
  /** 編集中の他の利用者 */
  otherEditors: readonly EstimateOtherEditor[];
}

const styles = {
  notice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    backgroundColor: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '16px',
    color: '#92400e',
    fontSize: '14px',
    lineHeight: 1.5,
    minWidth: 0,
    overflowWrap: 'anywhere',
  } satisfies CSSProperties,
  icon: {
    flexShrink: 0,
    fontWeight: 700,
  } satisfies CSSProperties,
  body: {
    minWidth: 0,
    margin: 0,
  } satisfies CSSProperties,
};

/**
 * 編集中の他の利用者の表示名を列挙した警告文を作る
 */
function formatEditPresenceMessage(otherEditors: readonly EstimateOtherEditor[]): string {
  const names = otherEditors.map((editor) => `${editor.displayName}さん`).join('、');
  return `${names}がこの見積書を編集中です。同時に編集した内容を保存すると、後から保存した側は競合として保存できない場合があります。`;
}

/**
 * 他のユーザーが編集中であることの警告（REQ-11.7）
 */
export function EstimateEditPresenceNotice({ otherEditors }: EstimateEditPresenceNoticeProps) {
  if (otherEditors.length === 0) {
    return null;
  }

  return (
    <div role="status" data-testid="estimate-edit-presence-warning" style={styles.notice}>
      <span aria-hidden="true" style={styles.icon}>
        !
      </span>
      <p style={styles.body}>{formatEditPresenceMessage(otherEditors)}</p>
    </div>
  );
}

export default EstimateEditPresenceNotice;
