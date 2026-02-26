/**
 * @fileoverview 写真変更ダイアログコンポーネントのテスト
 *
 * Task 34.2 (partial): Phase 9 - 注釈付き写真表示の単体テスト
 *
 * Requirements: 19.1, 19.2, 19.3
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoChangeDialog from '../../../components/quantity-table/PhotoChangeDialog';
import type { SurveyImageSummary } from '../../../types/quantity-table.types';

const mockImages: SurveyImageSummary[] = [
  {
    id: 'img-1',
    thumbnailUrl: '/thumb-1.jpg',
    originalUrl: '/original-1.jpg',
    fileName: 'photo1.jpg',
    annotatedThumbnailUrl: '/annotated-thumb-1.jpg',
    comment: 'コメント1',
  },
  {
    id: 'img-2',
    thumbnailUrl: '/thumb-2.jpg',
    originalUrl: '/original-2.jpg',
    fileName: 'photo2.jpg',
    annotatedThumbnailUrl: null,
    comment: null,
  },
  {
    id: 'img-3',
    thumbnailUrl: '/thumb-3.jpg',
    originalUrl: '/original-3.jpg',
    fileName: 'photo3.jpg',
    annotatedThumbnailUrl: '/annotated-thumb-3.jpg',
    comment: 'コメント3',
  },
];

describe('PhotoChangeDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    images: mockImages,
    isLoading: false,
    currentImageId: 'img-1',
    onSelect: vi.fn(),
  };

  it('写真変更ダイアログが表示されること', () => {
    render(<PhotoChangeDialog {...defaultProps} />);

    expect(screen.getByText('写真を変更')).toBeInTheDocument();
  });

  it('注釈付き写真一覧が表示されること', () => {
    render(<PhotoChangeDialog {...defaultProps} />);

    // 各写真が表示されること
    const images = screen.getAllByRole('button', { name: /を選択/ });
    expect(images).toHaveLength(3);
  });

  it('注釈付きサムネイルURLが存在する場合はそれを表示すること', () => {
    render(<PhotoChangeDialog {...defaultProps} />);

    // img-1 は annotatedThumbnailUrl が存在するので、それを使用
    const img1 = screen.getByAltText('photo1.jpg');
    expect(img1).toHaveAttribute('src', '/annotated-thumb-1.jpg');
  });

  it('注釈付きサムネイルURLが存在しない場合は通常サムネイルにフォールバックすること', () => {
    render(<PhotoChangeDialog {...defaultProps} />);

    // img-2 は annotatedThumbnailUrl がnullなので通常サムネイルを使用
    const img2 = screen.getByAltText('photo2.jpg');
    expect(img2).toHaveAttribute('src', '/thumb-2.jpg');
  });

  it('現在選択中の写真にハイライトが適用されること', () => {
    const { container } = render(<PhotoChangeDialog {...defaultProps} />);

    // 現在選択中の写真（img-1）にハイライトクラスが適用されていること
    const selectedItem = container.querySelector('[data-selected="true"]');
    expect(selectedItem).toBeInTheDocument();
  });

  it('写真クリックでonSelectコールバックが呼ばれること', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<PhotoChangeDialog {...defaultProps} onSelect={onSelect} />);

    // 2番目の写真をクリック
    const photo2Button = screen.getByRole('button', { name: 'photo2.jpgを選択' });
    await user.click(photo2Button);

    expect(onSelect).toHaveBeenCalledWith(mockImages[1]);
  });

  it('isOpen=falseの場合に表示されないこと', () => {
    render(<PhotoChangeDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('写真を変更')).toBeNull();
  });

  it('閉じるボタンでonCloseが呼ばれること', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<PhotoChangeDialog {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: 'ダイアログを閉じる' });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('読み込み中状態が表示されること', () => {
    render(<PhotoChangeDialog {...defaultProps} isLoading={true} images={[]} />);

    expect(screen.getByText('写真を読み込み中...')).toBeInTheDocument();
  });
});
