/**
 * @fileoverview EstimateEditPresenceNotice のテスト
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module components/estimate/EstimateEditPresenceNotice.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstimateEditPresenceNotice } from './EstimateEditPresenceNotice';

const editor = (userId: string, displayName: string) => ({
  userId,
  displayName,
  lastSeenAt: '2026-10-10T03:00:00.000Z',
});

describe('EstimateEditPresenceNotice', () => {
  it('編集中の他の利用者がいなければ何も表示しない', () => {
    const { container } = render(<EstimateEditPresenceNotice otherEditors={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('編集中の他の利用者の表示名を挙げて警告する (REQ-11.7)', () => {
    render(<EstimateEditPresenceNotice otherEditors={[editor('u1', '山田 太郎')]} />);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('山田 太郎さんがこの見積書を編集中です。');
  });

  it('複数の利用者を読点で列挙する', () => {
    render(
      <EstimateEditPresenceNotice
        otherEditors={[editor('u1', '山田 太郎'), editor('u2', '佐藤 花子')]}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '山田 太郎さん、佐藤 花子さんがこの見積書を編集中です。'
    );
  });

  it('長い表示名でも任意の位置で折り返す（375px 幅ではみ出さない）', () => {
    render(<EstimateEditPresenceNotice otherEditors={[editor('u1', 'あ'.repeat(120))]} />);

    expect(screen.getByTestId('estimate-edit-presence-warning').style.overflowWrap).toBe(
      'anywhere'
    );
  });
});
