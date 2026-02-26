/**
 * @fileoverview 写真プレビューダイアログコンポーネントのテスト
 *
 * Task 34.2 (partial): Phase 9 - 注釈付き写真表示の単体テスト
 *
 * Requirements: 20.1, 20.2, 20.3
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoPreviewDialog from '../../../components/quantity-table/PhotoPreviewDialog';
import type { SurveyImageSummary } from '../../../types/quantity-table.types';

const mockImageWithAnnotation: SurveyImageSummary = {
  id: 'img-1',
  thumbnailUrl: '/thumb-1.jpg',
  originalUrl: '/original-1.jpg',
  fileName: 'photo1.jpg',
  annotatedThumbnailUrl: '/annotated-thumb-1.jpg',
  comment: 'テストコメント',
};

const mockImageWithoutAnnotation: SurveyImageSummary = {
  id: 'img-2',
  thumbnailUrl: '/thumb-2.jpg',
  originalUrl: '/original-2.jpg',
  fileName: 'photo2.jpg',
  annotatedThumbnailUrl: null,
  comment: null,
};

describe('PhotoPreviewDialog', () => {
  it('注釈付き写真が拡大表示されること', () => {
    render(<PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithAnnotation} />);

    const previewImage = screen.getByAltText('photo1.jpg');
    expect(previewImage).toBeInTheDocument();
    // REQ-20.2, 20.3: 注釈付き写真を表示
    expect(previewImage).toHaveAttribute('src', '/annotated-thumb-1.jpg');
  });

  it('注釈付きサムネイルURLが存在しない場合にオリジナル画像にフォールバックすること', () => {
    render(
      <PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithoutAnnotation} />
    );

    const previewImage = screen.getByAltText('photo2.jpg');
    expect(previewImage).toBeInTheDocument();
    expect(previewImage).toHaveAttribute('src', '/original-2.jpg');
  });

  it('閉じるボタンでダイアログを閉じること', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<PhotoPreviewDialog isOpen={true} onClose={onClose} image={mockImageWithAnnotation} />);

    const closeButton = screen.getByRole('button', { name: 'ダイアログを閉じる' });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('背景クリックでダイアログを閉じること', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { container } = render(
      <PhotoPreviewDialog isOpen={true} onClose={onClose} image={mockImageWithAnnotation} />
    );

    // オーバーレイをクリック
    const overlay = container.querySelector('[data-testid="photo-preview-overlay"]');
    if (overlay) {
      await user.click(overlay);
    }

    expect(onClose).toHaveBeenCalled();
  });

  it('Escキーでダイアログを閉じること', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<PhotoPreviewDialog isOpen={true} onClose={onClose} image={mockImageWithAnnotation} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('isOpen=falseの場合に表示されないこと', () => {
    render(<PhotoPreviewDialog isOpen={false} onClose={vi.fn()} image={mockImageWithAnnotation} />);

    expect(screen.queryByAltText('photo1.jpg')).toBeNull();
  });
});
