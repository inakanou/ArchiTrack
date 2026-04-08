/**
 * @fileoverview 写真コメント表示不具合修正テスト
 *
 * Task 49.4: 写真コメント表示不具合修正のテストを実装する
 *
 * Requirements:
 * - 35.1: 写真選択時にコメントがAPIレスポンスから取得・表示される
 * - 35.2: 初回表示時に既存写真のコメントが正しく伝播される
 * - 35.3: 写真変更後にコメント表示が更新される
 * - 35.4: コメントテキストを写真の右側に表示する
 * - 35.5: コメントがnullの場合に空白表示となる
 * - 35.6: 折りたたみ時にコメント非表示
 * - 35.7: 展開時にコメント再表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

// AnnotatedImageThumbnailをモック
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

// ============================================================================
// テストデータ
// ============================================================================

const createMockGroup = (overrides: Partial<QuantityGroupDetail> = {}): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: 'img-1',
  surveyImage: {
    id: 'img-1',
    thumbnailUrl: '/thumb-1.jpg',
    originalUrl: '/original-1.jpg',
    fileName: 'photo1.jpg',
    hasAnnotations: false,
    comment: 'テスト写真コメント',
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
  ...overrides,
});

const defaultProps = {
  groupDisplayName: 'テストグループ',
  onAddItem: vi.fn(),
  onDeleteGroup: vi.fn(),
  onSelectImage: vi.fn(),
  onUpdateItem: vi.fn(),
  onDeleteItem: vi.fn(),
};

describe('写真コメント表示不具合修正テスト (Task 49.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-35.1: 写真選択時にコメントがAPIレスポンスから取得・表示される', () => {
    it('写真にコメントがある場合、コメントテキストが表示されること', () => {
      const group = createMockGroup();
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      expect(screen.getByText('テスト写真コメント')).toBeInTheDocument();
    });
  });

  describe('REQ-35.2: 初回表示時に既存写真のコメントが正しく伝播される', () => {
    it('初回レンダリング時にsurveyImage.commentが写真の右側に表示されること', () => {
      const group = createMockGroup({
        surveyImage: {
          id: 'img-initial',
          thumbnailUrl: '/thumb-initial.jpg',
          originalUrl: '/original-initial.jpg',
          fileName: 'initial-photo.jpg',
          hasAnnotations: false,
          comment: '初回表示コメント',
        },
      });
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay).toBeInTheDocument();
      expect(commentDisplay).toHaveTextContent('初回表示コメント');
    });

    it('surveyImage.commentがnullでもエラーなく空白表示されること', () => {
      const group = createMockGroup({
        surveyImage: {
          id: 'img-null',
          thumbnailUrl: '/thumb-null.jpg',
          originalUrl: '/original-null.jpg',
          fileName: 'null-comment-photo.jpg',
          hasAnnotations: false,
          comment: null,
        },
      });
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay).toBeInTheDocument();
      expect(commentDisplay.textContent).toBe('');
    });
  });

  describe('REQ-35.3: 写真変更後にコメント表示が更新される', () => {
    it('グループのsurveyImageが変更されるとコメントも更新されること', () => {
      const group1 = createMockGroup({
        surveyImage: {
          id: 'img-before',
          thumbnailUrl: '/thumb-before.jpg',
          originalUrl: '/original-before.jpg',
          fileName: 'before-photo.jpg',
          hasAnnotations: false,
          comment: '変更前コメント',
        },
      });

      const { rerender } = render(<QuantityGroupCard {...defaultProps} group={group1} />);

      expect(screen.getByText('変更前コメント')).toBeInTheDocument();

      // 写真変更後の新しいグループデータでre-render
      const group2 = createMockGroup({
        surveyImage: {
          id: 'img-after',
          thumbnailUrl: '/thumb-after.jpg',
          originalUrl: '/original-after.jpg',
          fileName: 'after-photo.jpg',
          hasAnnotations: false,
          comment: '変更後コメント',
        },
      });

      rerender(<QuantityGroupCard {...defaultProps} group={group2} />);

      expect(screen.queryByText('変更前コメント')).not.toBeInTheDocument();
      expect(screen.getByText('変更後コメント')).toBeInTheDocument();
    });

    it('コメントなしの写真に変更した場合はコメント表示エリアが空白になること', () => {
      const groupWithComment = createMockGroup({
        surveyImage: {
          id: 'img-with',
          thumbnailUrl: '/thumb-with.jpg',
          originalUrl: '/original-with.jpg',
          fileName: 'with-comment.jpg',
          hasAnnotations: false,
          comment: 'コメントあり',
        },
      });

      const { rerender } = render(<QuantityGroupCard {...defaultProps} group={groupWithComment} />);

      expect(screen.getByText('コメントあり')).toBeInTheDocument();

      // コメントなしの写真に変更
      const groupWithoutComment = createMockGroup({
        surveyImage: {
          id: 'img-without',
          thumbnailUrl: '/thumb-without.jpg',
          originalUrl: '/original-without.jpg',
          fileName: 'without-comment.jpg',
          hasAnnotations: false,
          comment: null,
        },
      });

      rerender(<QuantityGroupCard {...defaultProps} group={groupWithoutComment} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay.textContent).toBe('');
    });
  });

  describe('REQ-35.4: コメントテキストを写真の右側に視認可能なスタイルで表示する', () => {
    it('写真とコメントがflexレイアウトで横並びに表示されること', () => {
      const group = createMockGroup();
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay).toBeInTheDocument();

      // 写真エリア（photoArea）がflexで横並びになっていることを確認
      const photoArea = commentDisplay.closest('[style*="display: flex"]');
      expect(photoArea).toBeTruthy();
    });
  });

  describe('REQ-35.5: コメントがnullの場合に空白表示となる', () => {
    it('commentがnullの場合、コメント表示エリアが空白であること', () => {
      const group = createMockGroup({
        surveyImage: {
          id: 'img-null-comment',
          thumbnailUrl: '/thumb.jpg',
          originalUrl: '/original.jpg',
          fileName: 'photo.jpg',
          hasAnnotations: false,
          comment: null,
        },
      });
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay).toBeInTheDocument();
      expect(commentDisplay.textContent).toBe('');
    });

    it('commentがundefinedの場合（commentフィールド省略時）、空白表示であること', () => {
      const group = createMockGroup({
        surveyImage: {
          id: 'img-undefined-comment',
          thumbnailUrl: '/thumb.jpg',
          originalUrl: '/original.jpg',
          fileName: 'photo.jpg',
          hasAnnotations: false,
          // comment省略 => undefinedになる
        },
      });
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      const commentDisplay = screen.getByTestId('photo-comment-display');
      expect(commentDisplay).toBeInTheDocument();
      expect(commentDisplay.textContent).toBe('');
    });
  });

  describe('REQ-35.6, 35.7: 折りたたみ・展開時のコメント表示制御', () => {
    it('折りたたみ時にコメントも非表示、展開時に再表示されること', async () => {
      const user = userEvent.setup();
      const group = createMockGroup();
      render(<QuantityGroupCard {...defaultProps} group={group} />);

      // 初期状態: 展開中でコメントが表示されている
      expect(screen.getByText('テスト写真コメント')).toBeInTheDocument();

      // 折りたたむ
      const toggleButton = screen.getByRole('button', {
        name: 'グループを折りたたむ',
      });
      await user.click(toggleButton);

      // 折りたたみ後、コンテンツエリアが非表示
      const commentDisplay = screen.getByTestId('photo-comment-display');
      const contentArea = commentDisplay.closest('[style*="visibility: hidden"]');
      expect(contentArea).toBeTruthy();

      // 再展開
      const expandButton = screen.getByRole('button', {
        name: 'グループを展開',
      });
      await user.click(expandButton);

      // 再展開後、コメントが再び表示される
      expect(screen.getByText('テスト写真コメント')).toBeInTheDocument();
    });
  });
});
