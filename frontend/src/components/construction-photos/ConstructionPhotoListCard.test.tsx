/**
 * @fileoverview ConstructionPhotoListCard のテスト
 *
 * Task 12.3: アルバム編集・削除導線を結線
 *
 * モバイル用一覧カードの各カードに編集・削除の操作導線を提供する。
 * カード内の編集・削除ボタン操作はカードクリック（詳細遷移）とは独立して動作し、
 * 誤ってバブリングして詳細遷移が発火しないことを検証する。
 *
 * Requirements: 16.6（一覧画面で各アルバムの編集・削除導線を提供する）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConstructionPhotoListCard from './ConstructionPhotoListCard';
import type { ConstructionPhotoAlbumListItem } from './ConstructionPhotoListTable';

const albums: ConstructionPhotoAlbumListItem[] = [
  {
    id: 'album-1',
    projectId: 'project-123',
    name: '基礎工事アルバム',
    memo: 'メモ1',
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-16T00:00:00.000Z',
  },
];

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ConstructionPhotoListCard>> = {}
) {
  const onCardClick = vi.fn();
  const onEditAlbum = vi.fn();
  const onDeleteAlbum = vi.fn();
  render(
    <ConstructionPhotoListCard
      albums={albums}
      onCardClick={onCardClick}
      onEditAlbum={onEditAlbum}
      onDeleteAlbum={onDeleteAlbum}
      {...overrides}
    />
  );
  return { onCardClick, onEditAlbum, onDeleteAlbum };
}

describe('ConstructionPhotoListCard', () => {
  describe('カードの編集・削除導線 (R16.6)', () => {
    it('各カードに編集・削除ボタンが表示される', () => {
      renderCard();

      const card = screen.getByTestId('album-card-album-1');
      expect(within(card).getByRole('button', { name: /編集/ })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /削除/ })).toBeInTheDocument();
    });

    it('編集ボタンをクリックするとonEditAlbumが呼ばれ、onCardClickは呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      const { onEditAlbum, onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      await user.click(within(card).getByRole('button', { name: /編集/ }));

      expect(onEditAlbum).toHaveBeenCalledWith('album-1');
      expect(onCardClick).not.toHaveBeenCalled();
    });

    it('削除ボタンをクリックするとonDeleteAlbumがアルバムID・名前で呼ばれ、onCardClickは呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      const { onDeleteAlbum, onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      await user.click(within(card).getByRole('button', { name: /削除/ }));

      expect(onDeleteAlbum).toHaveBeenCalledWith('album-1', '基礎工事アルバム');
      expect(onCardClick).not.toHaveBeenCalled();
    });

    it('カードクリック（アクション以外）では従来通りonCardClickが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      const { onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      await user.click(card);

      expect(onCardClick).toHaveBeenCalledWith('album-1');
    });
  });

  describe('カードのキーボード操作 (R16.6)', () => {
    it('カードにフォーカスしてEnterキーを押すとonCardClickが呼ばれる', () => {
      const { onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(onCardClick).toHaveBeenCalledWith('album-1');
    });

    it('カードにフォーカスしてSpaceキーを押すとonCardClickが呼ばれる', () => {
      const { onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      fireEvent.keyDown(card, { key: ' ' });

      expect(onCardClick).toHaveBeenCalledWith('album-1');
    });

    it('Enter/Space以外のキーではonCardClickは呼ばれない', () => {
      const { onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      fireEvent.keyDown(card, { key: 'Tab' });

      expect(onCardClick).not.toHaveBeenCalled();
    });

    it('アクション領域でのキー操作はカードへ伝播せずonCardClickは呼ばれない', () => {
      const { onCardClick } = renderCard();

      const card = screen.getByTestId('album-card-album-1');
      const editButton = within(card).getByRole('button', { name: /編集/ });
      const actionArea = editButton.parentElement as HTMLElement;

      fireEvent.keyDown(actionArea, { key: 'Enter' });

      expect(onCardClick).not.toHaveBeenCalled();
    });
  });
});
