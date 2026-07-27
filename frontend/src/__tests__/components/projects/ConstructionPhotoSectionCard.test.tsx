/**
 * @fileoverview ConstructionPhotoSectionCard コンポーネントのテスト
 *
 * Task 7.2 (construction-photo): プロジェクト詳細への工事写真パネル追加
 *
 * Requirements (construction-photo):
 * - 2.1: プロジェクト詳細画面に工事写真パネルを工程表パネルの直下に表示する
 * - 2.2: 工事写真パネルを操作すると当該プロジェクトの工事写真一覧画面へ遷移する
 * - 2.3: 工事写真パネルに登録件数などのサマリ情報を表示する
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import {
  ConstructionPhotoSectionCard,
  type ConstructionPhotoSectionItem,
} from '../../../components/projects/ConstructionPhotoSectionCard';

const PROJECT_ID = 'project-test-123';

const mockAlbums: ConstructionPhotoSectionItem[] = [
  {
    id: 'album-1',
    name: '基礎工事アルバム',
    photoCount: 12,
    thumbnailUrl: null,
    updatedAt: '2025-06-01T00:00:00.000Z',
  },
  {
    id: 'album-2',
    name: '仕上げ工事アルバム',
    photoCount: 5,
    thumbnailUrl: null,
    updatedAt: '2025-07-15T00:00:00.000Z',
  },
];

function renderComponent(
  props: Partial<React.ComponentProps<typeof ConstructionPhotoSectionCard>> = {}
) {
  const defaultProps = {
    projectId: PROJECT_ID,
    totalCount: 2,
    latestAlbums: mockAlbums,
    isLoading: false,
    ...props,
  };

  return render(
    <BrowserRouter>
      <ConstructionPhotoSectionCard {...defaultProps} />
    </BrowserRouter>
  );
}

describe('ConstructionPhotoSectionCard', () => {
  // 2.3: サマリ情報（タイトル・件数）
  describe('サマリ表示（Requirements 2.3）', () => {
    it('セクションタイトル「工事写真」を表示する', () => {
      renderComponent();
      expect(screen.getByRole('heading', { level: 3, name: '工事写真' })).toBeInTheDocument();
    });

    it('登録件数を「全N件」形式で表示する', () => {
      renderComponent({ totalCount: 7 });
      expect(screen.getByText('全7件')).toBeInTheDocument();
    });

    it('直近アルバムのカードにアルバム名と写真枚数を表示する', () => {
      renderComponent();
      expect(screen.getByText('基礎工事アルバム')).toBeInTheDocument();
      expect(screen.getByText(/12枚/)).toBeInTheDocument();
    });
  });

  // 2.2: 一覧への遷移
  describe('一覧への遷移（Requirements 2.2）', () => {
    it('「すべて見る」リンクが工事写真一覧画面のパスを指す', () => {
      renderComponent();
      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${PROJECT_ID}/construction-photos`);
    });

    it('アルバムカードは工事写真詳細画面のパスを指す', () => {
      renderComponent();
      const card = screen.getByTestId('construction-photo-card-album-1');
      expect(card).toHaveAttribute('href', '/construction-photos/album-1');
    });
  });

  describe('空状態', () => {
    it('総数0件のとき空状態メッセージと新規作成リンクを表示する', () => {
      renderComponent({ totalCount: 0, latestAlbums: [] });
      expect(screen.getByText(/工事写真.*まだありません/)).toBeInTheDocument();
      const createLink = screen.getByRole('link', { name: /新規作成/ });
      expect(createLink).toHaveAttribute(
        'href',
        `/projects/${PROJECT_ID}/construction-photos/new`
      );
    });

    it('総数0件のとき「すべて見る」リンクを表示しない', () => {
      renderComponent({ totalCount: 0, latestAlbums: [] });
      expect(screen.queryByRole('link', { name: /すべて見る/ })).not.toBeInTheDocument();
    });
  });

  describe('ローディング', () => {
    it('ローディング中はスケルトンを表示し件数を表示しない', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByTestId('construction-photo-section-skeleton')).toBeInTheDocument();
      expect(screen.queryByText(/全\d+件/)).not.toBeInTheDocument();
    });
  });
});
