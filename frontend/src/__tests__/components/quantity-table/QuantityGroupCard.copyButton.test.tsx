/**
 * @fileoverview 数量グループカードのコピーボタンテスト
 *
 * Task 53.2: 数量グループカードにコピーボタンを追加する
 *
 * Requirements:
 * - 38.1: 各数量グループパネルの表題部にコピーボタンを表示する
 * - 38.9: コピー処理中はインジケーターを表示し、重複押下を防止する
 * - 38.12: 既存の表題部要素（グループ名、写真サムネイル、折りたたみボタン、削除ボタン等）と
 *         視覚的に干渉しないレイアウトで配置する
 *
 * 配置仕様（tasks.md 53.2）: グループパネル表題部の並替↑↓ボタンと削除ボタンの間
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

const createMockGroup = (overrides?: Partial<QuantityGroupDetail>): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 0,
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('QuantityGroupCard コピーボタン (Task 53.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-38.1: コピーボタンの表示', () => {
    it('isEditable=true かつ onCopyGroup 指定時にコピーボタンが表示される', () => {
      // Arrange
      const onCopyGroup = vi.fn();

      // Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={onCopyGroup}
        />
      );

      // Assert
      expect(screen.getByRole('button', { name: 'グループをコピー' })).toBeInTheDocument();
    });

    it('isEditable=false の場合はコピーボタンが表示されない', () => {
      // Arrange
      const onCopyGroup = vi.fn();

      // Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={false}
          onCopyGroup={onCopyGroup}
        />
      );

      // Assert
      expect(screen.queryByRole('button', { name: 'グループをコピー' })).not.toBeInTheDocument();
    });

    it('onCopyGroup が未指定の場合はコピーボタンが表示されない', () => {
      // Arrange / Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
        />
      );

      // Assert
      expect(screen.queryByRole('button', { name: 'グループをコピー' })).not.toBeInTheDocument();
    });
  });

  describe('REQ-38.12: 並替ボタンと削除ボタンの間に配置される', () => {
    it('表題部に [並替ボタン群, コピーボタン, 削除ボタン] の順で出現する', () => {
      // Arrange
      const onCopyGroup = vi.fn();

      // Act
      const { container } = render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          groupIndex={1}
          groupTotalCount={3}
          onMoveGroupUp={vi.fn()}
          onMoveGroupDown={vi.fn()}
          onCopyGroup={onCopyGroup}
          onDeleteGroup={vi.fn()}
        />
      );

      // Assert: 出現順序を DOM 上で検証する
      const sortButtons = container.querySelector('[data-testid="sort-order-buttons"]');
      const copyButton = screen.getByRole('button', { name: 'グループをコピー' });
      const deleteButton = screen.getByRole('button', { name: 'グループを削除' });
      expect(sortButtons).not.toBeNull();

      // SortOrderButtons → CopyButton の順
      const positionSortVsCopy = sortButtons!.compareDocumentPosition(copyButton);
      expect(positionSortVsCopy & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // CopyButton → DeleteButton の順
      const positionCopyVsDelete = copyButton.compareDocumentPosition(deleteButton);
      expect(positionCopyVsDelete & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('クリック動作', () => {
    it('クリックすると onCopyGroup が group.id を引数に呼び出される', async () => {
      // Arrange
      const user = userEvent.setup();
      const onCopyGroup = vi.fn();
      render(
        <QuantityGroupCard
          group={createMockGroup({ id: 'group-xyz' })}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={onCopyGroup}
        />
      );

      // Act
      await user.click(screen.getByRole('button', { name: 'グループをコピー' }));

      // Assert
      expect(onCopyGroup).toHaveBeenCalledTimes(1);
      expect(onCopyGroup).toHaveBeenCalledWith('group-xyz');
    });
  });

  describe('REQ-38.9: isCopying=true 時の挙動（重複押下防止）', () => {
    it('isCopying=true のときボタンが disabled になる', () => {
      // Arrange / Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={vi.fn()}
          isCopying={true}
        />
      );

      // Assert
      const button = screen.getByRole('button', { name: /グループをコピー/ });
      expect(button).toBeDisabled();
    });

    it('isCopying=true のときスピナーが表示される', () => {
      // Arrange / Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={vi.fn()}
          isCopying={true}
        />
      );

      // Assert: data-testid によりスピナー表示を検証
      expect(screen.getByTestId('copy-group-spinner')).toBeInTheDocument();
    });

    it('isCopying=true のときクリックしても onCopyGroup が呼ばれない', async () => {
      // Arrange
      const user = userEvent.setup();
      const onCopyGroup = vi.fn();
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={onCopyGroup}
          isCopying={true}
        />
      );

      // Act
      const button = screen.getByRole('button', { name: /グループをコピー/ });
      await user.click(button);

      // Assert
      expect(onCopyGroup).not.toHaveBeenCalled();
    });

    it('isCopying=false（デフォルト）のときボタンは disabled ではなくスピナーも非表示', () => {
      // Arrange / Act
      render(
        <QuantityGroupCard
          group={createMockGroup()}
          groupDisplayName="テストグループ"
          isEditable={true}
          onCopyGroup={vi.fn()}
        />
      );

      // Assert
      const button = screen.getByRole('button', { name: 'グループをコピー' });
      expect(button).not.toBeDisabled();
      expect(screen.queryByTestId('copy-group-spinner')).not.toBeInTheDocument();
    });
  });
});
