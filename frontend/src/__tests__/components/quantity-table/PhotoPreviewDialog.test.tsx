/**
 * @fileoverview 写真プレビューダイアログコンポーネントのテスト
 *
 * Task 34.2 (partial): Phase 9 - 注釈付き写真表示の単体テスト
 * Task 73.3: 拡大表示で原本画像を用いる
 *
 * Requirements: 20.1, 20.2, 20.3
 * Requirements (quantity-table-generation): 49.7
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoPreviewDialog from '../../../components/quantity-table/PhotoPreviewDialog';
import type { SurveyImageSummary } from '../../../types/quantity-table.types';

// 共有表示部品をモックして Fabric.js と注釈取得APIへの依存を切り離す。
// 実コンポーネントの表示元選択規則をモックでも再現し、呼び出し側が渡す情報の
// 誤りを検出できるようにする（`AnnotatedImageThumbnail`）:
// - `preferThumbnail` 未指定（既定 false）のとき、合成済みサムネイル
//   （`annotatedThumbnailUrl`）は採用されず mediumUrl > originalUrl の順で解決される
// - `loading` の既定は `'lazy'` で、そのとき表示領域到達まで表示元URLを与えない
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({
    image,
    alt,
    style,
    loading,
    preferThumbnail,
  }: {
    image: {
      id: string;
      thumbnailUrl?: string | null;
      annotatedThumbnailUrl?: string | null;
      mediumUrl?: string | null;
      originalUrl?: string | null;
    };
    alt: string;
    style?: React.CSSProperties;
    loading?: 'lazy' | 'eager';
    preferThumbnail?: boolean;
  }) => (
    <img
      src={
        (preferThumbnail
          ? (image.annotatedThumbnailUrl ?? image.thumbnailUrl ?? image.originalUrl)
          : (image.mediumUrl ?? image.originalUrl)) || ''
      }
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
      // 呼び出し側が指定した取得タイミング。未指定のときは共有部品の既定 'lazy'。
      data-loading={loading ?? 'lazy'}
      data-prefer-thumbnail={preferThumbnail ? 'true' : 'false'}
    />
  ),
}));

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
    // REQ-20.2, 20.3: 注釈付き写真を表示する。表示元は原本で、注釈は共有表示部品が
    // クライアント側で合成する（Requirement 49.7 に伴う経路の変更）
    expect(previewImage).toHaveAttribute('data-testid', 'annotated-image-thumbnail');
  });

  it('注釈付きサムネイルURLを持たない写真も表示元が原本へ解決されること', () => {
    render(
      <PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithoutAnnotation} />
    );

    // Requirement 49.7 以降、表示元は合成済みサムネイルへ分岐せず常に原本へ解決する。
    // 本件は合成済みサムネイルを持たない写真でも同じ解決になることの回帰固定である。
    const previewImage = screen.getByAltText('photo2.jpg');
    expect(previewImage).toBeInTheDocument();
    expect(previewImage).toHaveAttribute('src', '/original-2.jpg');
  });

  // ==========================================================================
  // Task 73.3: 拡大表示で原本画像を用いる
  //
  // 合成済みサムネイル（`annotatedThumbnailUrl`）は縮小解像度であり、拡大表示に
  // 用いると解像度が不足する。表示元を原本へ改め、注釈の反映は共有表示部品による
  // クライアント側の合成で維持する（design.md「Build vs Adopt（Adopt）」）。
  //
  // Requirements (quantity-table-generation): 49.7
  // ==========================================================================
  describe('Requirement 49.7: 拡大表示は操作の時点で原本画像を取得する', () => {
    /**
     * 表示元が合成済みサムネイル（縮小解像度）ではなく原本であること。
     *
     * @requirement quantity-table-generation/REQ-49.7
     */
    it('表示元が合成済みサムネイルではなく原本になる (quantity-table-generation/REQ-49.7)', () => {
      render(
        <PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithAnnotation} />
      );

      const previewImage = screen.getByAltText('photo1.jpg');
      expect(previewImage).toHaveAttribute('src', '/original-1.jpg');
      // 縮小解像度の画像で代替しない（design.md の Error Handling も同旨）
      expect(previewImage).not.toHaveAttribute('src', '/annotated-thumb-1.jpg');
      expect(previewImage).not.toHaveAttribute('src', '/thumb-1.jpg');
    });

    /**
     * 利用者の明示操作を契機とするため即時取得を指定し、表示領域到達を待たないこと。
     *
     * 共有表示部品の取得の関門は `src={isInViewport ? … : undefined}` であり、観測の
     * 要否は `enabled: loading === 'lazy'` だけで決まる。`loading` の既定は `'lazy'`
     * のため、即時取得は `loading='eager'` の明示で表す。
     *
     * @requirement quantity-table-generation/REQ-49.7
     */
    it('即時取得が指定され表示領域到達を待たない (quantity-table-generation/REQ-49.7)', () => {
      render(
        <PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithAnnotation} />
      );

      const previewImage = screen.getByAltText('photo1.jpg');
      expect(previewImage).toHaveAttribute('data-loading', 'eager');
    });

    /**
     * 注釈の反映を共有表示部品のクライアント側合成へ委ねること。
     *
     * 縮小表示指定（`preferThumbnail`）を与えると共有部品は合成済みサムネイルを
     * そのまま表示し、クライアント側の合成を行わない。拡大表示ではこれを指定しない。
     *
     * @requirement quantity-table-generation/REQ-49.7
     */
    it('注釈の反映を共有表示部品のクライアント側合成へ委ねる (quantity-table-generation/REQ-49.7)', () => {
      render(
        <PhotoPreviewDialog isOpen={true} onClose={vi.fn()} image={mockImageWithAnnotation} />
      );

      const previewImage = screen.getByTestId('annotated-image-thumbnail');
      expect(previewImage).toHaveAttribute('data-prefer-thumbnail', 'false');
    });
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
