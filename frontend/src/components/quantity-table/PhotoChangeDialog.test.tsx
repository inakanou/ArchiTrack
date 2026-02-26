/**
 * @fileoverview PhotoChangeDialogの単体テスト
 *
 * Task 31.1: 写真変更ダイアログコンポーネントを実装する
 *
 * Requirements:
 * - 19.1: 写真変更ダイアログの表示
 * - 19.2: 注釈付きサムネイルURLの優先使用
 * - 19.3: 写真選択操作
 * - 19.4: ダイアログの閉じる操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoChangeDialog from './PhotoChangeDialog';
import type { SurveyImageSummary } from '../../types/quantity-table.types';

const createImage = (overrides: Partial<SurveyImageSummary> = {}): SurveyImageSummary => ({
  id: 'img-1',
  thumbnailUrl: '/thumb/1.jpg',
  originalUrl: '/original/1.jpg',
  fileName: 'photo1.jpg',
  ...overrides,
});

describe('PhotoChangeDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    images: [
      createImage({ id: 'img-1', fileName: 'photo1.jpg' }),
      createImage({ id: 'img-2', fileName: 'photo2.jpg', thumbnailUrl: '/thumb/2.jpg' }),
    ],
    isLoading: false,
    currentImageId: 'img-1',
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 表示テスト
  // ==========================================================================
  describe('表示', () => {
    it('isOpen=trueの場合、ダイアログが表示されること', () => {
      render(<PhotoChangeDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('写真を変更')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、何も表示されないこと', () => {
      render(<PhotoChangeDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('写真一覧が表示されること', () => {
      render(<PhotoChangeDialog {...defaultProps} />);

      expect(screen.getByAltText('photo1.jpg')).toBeInTheDocument();
      expect(screen.getByAltText('photo2.jpg')).toBeInTheDocument();
    });

    it('現在選択中の写真がハイライトされること', () => {
      render(<PhotoChangeDialog {...defaultProps} />);

      const selectedItem = screen.getByRole('button', { name: 'photo1.jpgを選択' });
      expect(selectedItem).toHaveAttribute('data-selected', 'true');

      const unselectedItem = screen.getByRole('button', { name: 'photo2.jpgを選択' });
      expect(unselectedItem).toHaveAttribute('data-selected', 'false');
    });

    it('読み込み中の場合、読み込み中メッセージが表示されること', () => {
      render(<PhotoChangeDialog {...defaultProps} isLoading={true} images={[]} />);

      expect(screen.getByText('写真を読み込み中...')).toBeInTheDocument();
    });

    it('写真が0件の場合、空メッセージが表示されること', () => {
      render(<PhotoChangeDialog {...defaultProps} images={[]} />);

      expect(screen.getByText('利用可能な写真がありません')).toBeInTheDocument();
    });

    it('REQ-19.2: 注釈付きサムネイルURLが存在する場合はそちらを使用すること', () => {
      const imageWithAnnotation = createImage({
        id: 'img-anno',
        fileName: 'annotated.jpg',
        thumbnailUrl: '/thumb/original.jpg',
        annotatedThumbnailUrl: '/thumb/annotated.jpg',
      });
      render(<PhotoChangeDialog {...defaultProps} images={[imageWithAnnotation]} />);

      const img = screen.getByAltText('annotated.jpg') as HTMLImageElement;
      expect(img.src).toContain('/thumb/annotated.jpg');
    });

    it('REQ-19.2: 注釈付きサムネイルURLがnullの場合は通常サムネイルを使用すること', () => {
      const imageWithoutAnnotation = createImage({
        id: 'img-normal',
        fileName: 'normal.jpg',
        thumbnailUrl: '/thumb/normal.jpg',
        annotatedThumbnailUrl: null,
      });
      render(<PhotoChangeDialog {...defaultProps} images={[imageWithoutAnnotation]} />);

      const img = screen.getByAltText('normal.jpg') as HTMLImageElement;
      expect(img.src).toContain('/thumb/normal.jpg');
    });
  });

  // ==========================================================================
  // 操作テスト
  // ==========================================================================
  describe('操作', () => {
    it('閉じるボタンをクリックするとonCloseが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'ダイアログを閉じる' }));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('オーバーレイをクリックするとonCloseが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      const overlay = screen.getByRole('dialog');
      await user.click(overlay);

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('ダイアログ内部をクリックしてもonCloseが呼ばれないこと', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      await user.click(screen.getByText('写真を変更'));

      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('写真をクリックするとonSelectが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'photo2.jpgを選択' }));

      expect(defaultProps.onSelect).toHaveBeenCalledWith(defaultProps.images[1]);
    });

    it('Enterキーで写真を選択できること', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      const photoButton = screen.getByRole('button', { name: 'photo1.jpgを選択' });
      photoButton.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onSelect).toHaveBeenCalledWith(defaultProps.images[0]);
    });

    it('スペースキーで写真を選択できること', async () => {
      const user = userEvent.setup();
      render(<PhotoChangeDialog {...defaultProps} />);

      const photoButton = screen.getByRole('button', { name: 'photo2.jpgを選択' });
      photoButton.focus();
      await user.keyboard(' ');

      expect(defaultProps.onSelect).toHaveBeenCalledWith(defaultProps.images[1]);
    });

    it('currentImageIdがnullの場合、すべての写真が未選択状態であること', () => {
      render(<PhotoChangeDialog {...defaultProps} currentImageId={null} />);

      const items = screen.getAllByRole('button', { name: /を選択$/ });
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-selected', 'false');
      });
    });
  });
});
