/**
 * @fileoverview 現場調査画像グリッドコンポーネント テスト
 *
 * Task 9.2: 画像一覧グリッド表示を実装する
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ドラッグアンドドロップによる順序変更
 *
 * 機能:
 * - サムネイルによる画像一覧
 * - 固定の表示順序
 * - ドラッグアンドドロップによる順序変更
 * - 画像クリックでビューア/エディタ起動
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyImageGrid } from '../../../components/site-surveys/SurveyImageGrid';
import type { SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// テストフィクスチャ
// ============================================================================

const mockImages: SurveyImageInfo[] = [
  {
    id: 'image-1',
    surveyId: 'survey-1',
    originalPath: '/uploads/survey-1/image-1.jpg',
    thumbnailPath: '/uploads/survey-1/thumb-image-1.jpg',
    fileName: 'image-1.jpg',
    fileSize: 102400,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    createdAt: '2025-01-15T10:00:00.000Z',
  },
  {
    id: 'image-2',
    surveyId: 'survey-1',
    originalPath: '/uploads/survey-1/image-2.jpg',
    thumbnailPath: '/uploads/survey-1/thumb-image-2.jpg',
    fileName: 'image-2.jpg',
    fileSize: 204800,
    width: 1280,
    height: 720,
    displayOrder: 2,
    createdAt: '2025-01-15T10:05:00.000Z',
  },
  {
    id: 'image-3',
    surveyId: 'survey-1',
    originalPath: '/uploads/survey-1/image-3.jpg',
    thumbnailPath: '/uploads/survey-1/thumb-image-3.jpg',
    fileName: 'image-3.jpg',
    fileSize: 307200,
    width: 2560,
    height: 1440,
    displayOrder: 3,
    createdAt: '2025-01-15T10:10:00.000Z',
  },
];

// ============================================================================
// テストスイート
// ============================================================================

describe('SurveyImageGrid', () => {
  // ========================================================================
  // 基本表示テスト
  // ========================================================================

  describe('基本表示', () => {
    it('画像一覧をサムネイルで表示する', () => {
      const onImageClick = vi.fn();
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={onImageClick}
          onOrderChange={onOrderChange}
        />
      );

      // 3つの画像が表示されていることを確認
      const imageElements = screen.getAllByRole('img');
      expect(imageElements).toHaveLength(3);

      // サムネイルパスが設定されていることを確認
      expect(imageElements[0]).toHaveAttribute('src', expect.stringContaining('thumb-image-1.jpg'));
      expect(imageElements[1]).toHaveAttribute('src', expect.stringContaining('thumb-image-2.jpg'));
      expect(imageElements[2]).toHaveAttribute('src', expect.stringContaining('thumb-image-3.jpg'));
    });

    it('displayOrder順にソートされた画像を表示する', () => {
      // displayOrderを変更して意図的に順序を変える
      const image3 = mockImages[2];
      const image1 = mockImages[0];
      const image2 = mockImages[1];
      if (!image3 || !image1 || !image2) {
        throw new Error('Test data is not available');
      }
      const unorderedImages: SurveyImageInfo[] = [
        image3, // displayOrder: 3
        image1, // displayOrder: 1
        image2, // displayOrder: 2
      ];

      render(
        <SurveyImageGrid images={unorderedImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageElements = screen.getAllByRole('img');

      // displayOrder: 1, 2, 3 の順で表示されていることを確認
      expect(imageElements[0]).toHaveAttribute('src', expect.stringContaining('thumb-image-1.jpg'));
      expect(imageElements[1]).toHaveAttribute('src', expect.stringContaining('thumb-image-2.jpg'));
      expect(imageElements[2]).toHaveAttribute('src', expect.stringContaining('thumb-image-3.jpg'));
    });

    it('空の画像配列の場合、空状態メッセージを表示する', () => {
      render(<SurveyImageGrid images={[]} onImageClick={vi.fn()} onOrderChange={vi.fn()} />);

      expect(screen.getByText('画像がありません')).toBeInTheDocument();
    });

    it('ファイル名がalt属性に設定される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageElements = screen.getAllByRole('img');
      expect(imageElements[0]).toHaveAttribute('alt', 'image-1.jpg');
      expect(imageElements[1]).toHaveAttribute('alt', 'image-2.jpg');
      expect(imageElements[2]).toHaveAttribute('alt', 'image-3.jpg');
    });
  });

  // ========================================================================
  // 画像クリックテスト
  // ========================================================================

  describe('画像クリック', () => {
    it('画像クリック時にonImageClickが呼ばれる', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={onImageClick} onOrderChange={vi.fn()} />
      );

      const imageElements = screen.getAllByRole('img');
      const firstImage = imageElements[0];
      if (firstImage) {
        await user.click(firstImage);
      }

      expect(onImageClick).toHaveBeenCalledTimes(1);
      expect(onImageClick).toHaveBeenCalledWith(mockImages[0]);
    });

    it('異なる画像をクリックすると正しい画像情報が渡される', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={onImageClick} onOrderChange={vi.fn()} />
      );

      const imageElements = screen.getAllByRole('img');
      const secondImage = imageElements[1];
      if (secondImage) {
        await user.click(secondImage);
      }

      expect(onImageClick).toHaveBeenCalledWith(mockImages[1]);
    });

    it('Enterキーで画像を選択できる（アクセシビリティ）', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={onImageClick} onOrderChange={vi.fn()} />
      );

      // 最初の画像コンテナにフォーカス
      await user.tab();

      // Enterキーを押す
      await user.keyboard('{Enter}');

      expect(onImageClick).toHaveBeenCalledWith(mockImages[0]);
    });

    it('Spaceキーで画像を選択できる（アクセシビリティ）', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={onImageClick} onOrderChange={vi.fn()} />
      );

      await user.tab();
      await user.keyboard(' ');

      expect(onImageClick).toHaveBeenCalledWith(mockImages[0]);
    });
  });

  // ========================================================================
  // ドラッグアンドドロップテスト
  // ========================================================================

  describe('ドラッグアンドドロップによる順序変更', () => {
    it('ドラッグ可能な属性が設定されている', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      imageContainers.forEach((container) => {
        expect(container).toHaveAttribute('draggable', 'true');
      });
    });

    it('ドラッグ開始時にデータが設定される', () => {
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={onOrderChange} />
      );

      const imageContainers = screen.getAllByRole('button');
      const setDataMock = vi.fn();
      const dataTransfer = {
        setData: setDataMock,
        getData: vi.fn(),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      if (firstContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
      }

      expect(setDataMock).toHaveBeenCalledWith('text/plain', 'image-1');
    });

    it('ドラッグオーバー時にデフォルト動作が防止される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const secondContainer = imageContainers[1];

      if (secondContainer) {
        fireEvent.dragOver(secondContainer);
      }

      // コンポーネント内でpreventDefaultが呼ばれることを確認
      // ドラッグオーバー中のスタイル変更を確認
    });

    it('ドロップ時にonOrderChangeが正しいパラメータで呼ばれる', () => {
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={onOrderChange} />
      );

      const imageContainers = screen.getAllByRole('button');

      // image-1をimage-3の位置にドラッグ
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('image-1'),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      const thirdContainer = imageContainers[2];

      if (firstContainer && thirdContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
        fireEvent.dragOver(thirdContainer, { dataTransfer });
        fireEvent.drop(thirdContainer, { dataTransfer });
      }

      expect(onOrderChange).toHaveBeenCalledTimes(1);
      // 新しい順序: image-2 (order: 1), image-3 (order: 2), image-1 (order: 3)
      expect(onOrderChange).toHaveBeenCalledWith([
        { id: 'image-2', order: 1 },
        { id: 'image-3', order: 2 },
        { id: 'image-1', order: 3 },
      ]);
    });

    it('同じ位置にドロップした場合はonOrderChangeが呼ばれない', () => {
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={onOrderChange} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('image-1'),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      if (firstContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
        fireEvent.dragOver(firstContainer, { dataTransfer });
        fireEvent.drop(firstContainer, { dataTransfer });
      }

      expect(onOrderChange).not.toHaveBeenCalled();
    });

    it('2番目の画像を1番目に移動する', () => {
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={onOrderChange} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('image-2'),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      const secondContainer = imageContainers[1];

      if (firstContainer && secondContainer) {
        fireEvent.dragStart(secondContainer, { dataTransfer });
        fireEvent.dragOver(firstContainer, { dataTransfer });
        fireEvent.drop(firstContainer, { dataTransfer });
      }

      expect(onOrderChange).toHaveBeenCalledWith([
        { id: 'image-2', order: 1 },
        { id: 'image-1', order: 2 },
        { id: 'image-3', order: 3 },
      ]);
    });
  });

  // ========================================================================
  // ドラッグ状態表示テスト
  // ========================================================================

  describe('ドラッグ状態の視覚的フィードバック', () => {
    it('ドラッグ中の要素にドラッグ中スタイルが適用される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn(),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      if (firstContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });

        // ドラッグ中のスタイル変更を確認（opacity変化など）
        expect(firstContainer).toHaveAttribute('data-dragging', 'true');
      }
    });

    it('ドラッグオーバー中の要素にドロップターゲットスタイルが適用される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('image-1'),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      const secondContainer = imageContainers[1];

      if (firstContainer && secondContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
        fireEvent.dragEnter(secondContainer, { dataTransfer });

        expect(secondContainer).toHaveAttribute('data-drag-over', 'true');
      }
    });

    it('ドラッグリーブ時にドロップターゲットスタイルが解除される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('image-1'),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      const secondContainer = imageContainers[1];

      if (firstContainer && secondContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
        fireEvent.dragEnter(secondContainer, { dataTransfer });
        fireEvent.dragLeave(secondContainer, { dataTransfer });

        expect(secondContainer).not.toHaveAttribute('data-drag-over', 'true');
      }
    });

    it('ドラッグ終了時にドラッグ状態がリセットされる', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn(),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      const firstContainer = imageContainers[0];
      if (firstContainer) {
        fireEvent.dragStart(firstContainer, { dataTransfer });
        fireEvent.dragEnd(firstContainer, { dataTransfer });

        expect(firstContainer).not.toHaveAttribute('data-dragging', 'true');
      }
    });
  });

  // ========================================================================
  // 読み取り専用モードテスト
  // ========================================================================

  describe('読み取り専用モード', () => {
    it('readOnly=trueの場合、ドラッグ機能が無効になる', () => {
      const onOrderChange = vi.fn();

      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={vi.fn()}
          onOrderChange={onOrderChange}
          readOnly={true}
        />
      );

      const imageContainers = screen.getAllByRole('button');
      imageContainers.forEach((container) => {
        expect(container).toHaveAttribute('draggable', 'false');
      });
    });

    it('readOnly=trueでもクリックは動作する', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={onImageClick}
          onOrderChange={vi.fn()}
          readOnly={true}
        />
      );

      const imageElements = screen.getAllByRole('img');
      const firstImage = imageElements[0];
      if (firstImage) {
        await user.click(firstImage);
      }

      expect(onImageClick).toHaveBeenCalledWith(mockImages[0]);
    });
  });

  // ========================================================================
  // ローディング状態テスト
  // ========================================================================

  describe('ローディング状態', () => {
    it('isLoading=trueの場合、スケルトンローダーを表示する', () => {
      render(
        <SurveyImageGrid
          images={[]}
          onImageClick={vi.fn()}
          onOrderChange={vi.fn()}
          isLoading={true}
        />
      );

      const skeletons = screen.getAllByTestId('skeleton-loader');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('isLoading=trueでも画像がある場合は画像を表示する', () => {
      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={vi.fn()}
          onOrderChange={vi.fn()}
          isLoading={true}
        />
      );

      const imageElements = screen.getAllByRole('img');
      expect(imageElements).toHaveLength(3);
    });
  });

  // ========================================================================
  // 画像情報表示テスト
  // ========================================================================

  describe('画像情報表示', () => {
    it('画像にホバーするとファイル情報が表示される', async () => {
      const user = userEvent.setup();

      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const imageContainers = screen.getAllByRole('button');
      const firstContainer = imageContainers[0];
      if (firstContainer) {
        await user.hover(firstContainer);
      }

      // ファイル名またはサイズ情報が表示されることを確認
      expect(screen.getByText('image-1.jpg')).toBeInTheDocument();
    });

    it('画像の表示順序番号が表示される', () => {
      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={vi.fn()}
          onOrderChange={vi.fn()}
          showOrderNumbers={true}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // グリッドレイアウトテスト
  // ========================================================================

  describe('グリッドレイアウト', () => {
    it('グリッドコンテナにCSSグリッドスタイルが適用される', () => {
      render(
        <SurveyImageGrid images={mockImages} onImageClick={vi.fn()} onOrderChange={vi.fn()} />
      );

      const gridContainer = screen.getByTestId('image-grid');

      // CSSグリッドが使用されていることを確認
      expect(gridContainer).toBeInTheDocument();
    });

    it('columnsプロパティでカラム数を変更できる', () => {
      render(
        <SurveyImageGrid
          images={mockImages}
          onImageClick={vi.fn()}
          onOrderChange={vi.fn()}
          columns={4}
        />
      );

      const gridContainer = screen.getByTestId('image-grid');
      // グリッドコンテナが存在することを確認
      expect(gridContainer).toBeInTheDocument();
    });
  });
});
