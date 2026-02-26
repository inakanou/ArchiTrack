/**
 * @fileoverview 写真コメント表示コンポーネントのテスト
 *
 * Task 34.3: Phase 9 - 写真コメント表示の単体テスト
 *
 * Requirements: 21.1, 21.2, 21.3
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PhotoCommentDisplay from '../../../components/quantity-table/PhotoCommentDisplay';

describe('PhotoCommentDisplay', () => {
  it('コメントが正しく表示されること', () => {
    render(<PhotoCommentDisplay comment="テストコメントです" />);

    expect(screen.getByText('テストコメントです')).toBeInTheDocument();
  });

  it('コメントがnullの場合にコメント表示エリアが空白であること', () => {
    const { container } = render(<PhotoCommentDisplay comment={null} />);

    // data-testid で空白コンテナを確認
    const commentArea = container.querySelector('[data-testid="photo-comment-display"]');
    expect(commentArea).toBeInTheDocument();
    expect(commentArea?.textContent).toBe('');
  });

  it('コメントが空文字の場合にコメント表示エリアが空白であること', () => {
    const { container } = render(<PhotoCommentDisplay comment="" />);

    const commentArea = container.querySelector('[data-testid="photo-comment-display"]');
    expect(commentArea).toBeInTheDocument();
    expect(commentArea?.textContent).toBe('');
  });

  it('長いコメントがワードラップして表示されること', () => {
    const longComment = 'これは非常に長いコメントです。'.repeat(10);
    render(<PhotoCommentDisplay comment={longComment} />);

    expect(screen.getByText(longComment)).toBeInTheDocument();
  });

  it('最大高さ制限が設定されていること', () => {
    const longComment = 'テストコメント\n'.repeat(20);
    const { container } = render(<PhotoCommentDisplay comment={longComment} />);

    const commentArea = container.querySelector('[data-testid="photo-comment-display"]');
    // maxHeight スタイルが設定されていること
    expect(commentArea).toHaveStyle({ maxHeight: '120px' });
    expect(commentArea).toHaveStyle({ overflowY: 'auto' });
  });
});
