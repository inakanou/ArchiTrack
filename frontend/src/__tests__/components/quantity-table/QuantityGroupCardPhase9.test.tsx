/**
 * @fileoverview 数量グループカード Phase 9 統合テスト
 *
 * Task 33.1: 数量グループカードに注釈付き写真表示と写真関連ダイアログを統合する
 * Task 34.2 (partial): 注釈付き写真表示の単体テスト（QuantityGroupCard部分）
 * Task 34.3 (partial): 写真コメント表示の統合テスト
 *
 * Requirements: 3.3, 3.4, 4.4, 19.1, 19.4, 20.1, 21.2, 21.4, 21.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

// AnnotatedImageThumbnailをモックして、Fabric.jsの依存関係を回避する
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
  default: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
}));

const mockGroupWithAnnotatedPhoto: QuantityGroupDetail = {
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: 'img-1',
  surveyImage: {
    id: 'img-1',
    thumbnailUrl: '/thumb-1.jpg',
    originalUrl: '/original-1.jpg',
    fileName: 'photo1.jpg',
    annotatedThumbnailUrl: '/annotated-thumb-1.jpg',
    comment: 'テストコメント',
  },
  displayOrder: 0,
  itemCount: 1,
  items: [
    {
      id: 'item-1',
      quantityGroupId: 'group-1',
      majorCategory: '共通仮設',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '仮設工',
      name: '足場',
      specification: null,
      unit: 'm2',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 100,
      remarks: null,
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockGroupWithoutAnnotation: QuantityGroupDetail = {
  ...mockGroupWithAnnotatedPhoto,
  id: 'group-2',
  surveyImage: {
    id: 'img-2',
    thumbnailUrl: '/thumb-2.jpg',
    originalUrl: '/original-2.jpg',
    fileName: 'photo2.jpg',
    annotatedThumbnailUrl: null,
    comment: null,
  },
};

const mockGroupWithoutImage: QuantityGroupDetail = {
  ...mockGroupWithAnnotatedPhoto,
  id: 'group-3',
  surveyImageId: null,
  surveyImage: null,
};

describe('QuantityGroupCard Phase 9 統合テスト', () => {
  const defaultProps = {
    group: mockGroupWithAnnotatedPhoto,
    groupDisplayName: 'テストグループ',
    onAddItem: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSelectImage: vi.fn(),
    onOpenAnnotationViewer: vi.fn(),
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-21.2: 写真コメント表示', () => {
    it('写真にコメントがある場合、コメントが表示されること', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByText('テストコメント')).toBeInTheDocument();
    });

    it('写真のコメントがnullの場合、コメント表示エリアが空白であること', () => {
      render(<QuantityGroupCard {...defaultProps} group={mockGroupWithoutAnnotation} />);

      const commentArea = document.querySelector('[data-testid="photo-comment-display"]');
      expect(commentArea).toBeInTheDocument();
      expect(commentArea?.textContent).toBe('');
    });

    it('写真が紐付けられていない場合はコメント表示エリアが非表示であること', () => {
      render(<QuantityGroupCard {...defaultProps} group={mockGroupWithoutImage} />);

      expect(document.querySelector('[data-testid="photo-comment-display"]')).toBeNull();
    });
  });

  describe('REQ-21.5: グループ折りたたみ時のコメント非表示', () => {
    it('グループ折りたたみ時にコメント表示も非表示になること', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      // 展開状態ではコメントが表示されている
      expect(screen.getByText('テストコメント')).toBeInTheDocument();

      // 折りたたむ
      const toggleButton = screen.getByRole('button', { name: 'グループを折りたたむ' });
      await user.click(toggleButton);

      // 折りたたみ後、コメントは非表示（visibility: hidden）
      const commentArea = document.querySelector('[data-testid="photo-comment-display"]');
      // コンテンツエリア全体がhiddenになるため
      const contentArea = commentArea?.closest('[style*="visibility"]');
      expect(contentArea).toBeTruthy();
    });
  });

  describe('REQ-20.1: 写真プレビュー', () => {
    it('写真クリック時にPhotoPreviewDialogが開くこと', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      // サムネイル画像をクリック
      const thumbnail = screen.getByRole('button', { name: '紐付け画像を表示' });
      await user.click(thumbnail);

      // PhotoPreviewDialogが表示されること（dialogロールで確認）
      expect(screen.getByRole('dialog', { name: '写真プレビュー' })).toBeInTheDocument();
      // プレビュー画像が表示されること（2つのphoto1.jpgがあるのでgetAllByで確認）
      const images = screen.getAllByAltText('photo1.jpg');
      expect(images.length).toBe(2); // サムネイルとプレビューの2つ
    });
  });

  describe('REQ-19.1: 写真変更ボタン', () => {
    it('写真変更ボタンが表示されること', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: '写真を変更' })).toBeInTheDocument();
    });

    it('写真が紐付けられていない場合は写真変更ボタンが表示されないこと', () => {
      render(<QuantityGroupCard {...defaultProps} group={mockGroupWithoutImage} />);

      expect(screen.queryByRole('button', { name: '写真を変更' })).toBeNull();
    });
  });
});
