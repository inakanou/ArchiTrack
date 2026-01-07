/**
 * @fileoverview 数量グループカードコンポーネントのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

const mockGroup: QuantityGroupDetail = {
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: 'img-1',
  surveyImage: {
    id: 'img-1',
    thumbnailUrl: '/images/thumb-1.jpg',
    originalUrl: '/images/original-1.jpg',
    fileName: 'photo1.jpg',
  },
  displayOrder: 0,
  itemCount: 2,
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
    {
      id: 'item-2',
      quantityGroupId: 'group-1',
      majorCategory: '土工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '掘削工',
      name: '掘削',
      specification: null,
      unit: 'm3',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 50,
      remarks: null,
      displayOrder: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('QuantityGroupCard', () => {
  const defaultProps = {
    group: mockGroup,
    groupDisplayName: 'テストグループ',
    onAddItem: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSelectImage: vi.fn(),
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('グループ名が表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByText('テストグループ')).toBeInTheDocument();
    });

    it('項目数が表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByText('2項目')).toBeInTheDocument();
    });

    it('展開/折りたたみボタンが表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /グループを折りたたむ|グループを展開/ })
      ).toBeInTheDocument();
    });

    it('項目追加ボタンが表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: '項目を追加' })).toBeInTheDocument();
    });

    it('グループ削除ボタンが表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'グループを削除' })).toBeInTheDocument();
    });
  });

  describe('サムネイル表示', () => {
    it('紐付き画像がある場合はサムネイルが表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      const thumbnail = screen.getByAltText('photo1.jpg');
      expect(thumbnail).toBeInTheDocument();
      expect(thumbnail).toHaveAttribute('src', '/images/thumb-1.jpg');
    });

    it('紐付き画像がない場合はプレースホルダーが表示される', () => {
      const groupWithoutImage = { ...mockGroup, surveyImage: null, surveyImageId: null };
      render(<QuantityGroupCard {...defaultProps} group={groupWithoutImage} />);

      expect(screen.getByTestId('image-placeholder-group-1')).toBeInTheDocument();
    });

    it('サムネイルをクリックするとonSelectImageが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      await user.click(screen.getByAltText('photo1.jpg'));

      expect(defaultProps.onSelectImage).toHaveBeenCalledWith('group-1');
    });

    it('プレースホルダーをクリックするとonSelectImageが呼ばれる', async () => {
      const user = userEvent.setup();
      const groupWithoutImage = { ...mockGroup, surveyImage: null, surveyImageId: null };
      render(<QuantityGroupCard {...defaultProps} group={groupWithoutImage} />);

      await user.click(screen.getByTestId('image-placeholder-group-1'));

      expect(defaultProps.onSelectImage).toHaveBeenCalledWith('group-1');
    });

    it('サムネイルでEnterキーを押すとonSelectImageが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      const thumbnail = screen.getByAltText('photo1.jpg').parentElement;
      thumbnail?.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onSelectImage).toHaveBeenCalledWith('group-1');
    });

    it('サムネイルでSpaceキーを押すとonSelectImageが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      const thumbnail = screen.getByAltText('photo1.jpg').parentElement;
      thumbnail?.focus();
      await user.keyboard(' ');

      expect(defaultProps.onSelectImage).toHaveBeenCalledWith('group-1');
    });
  });

  describe('展開/折りたたみ', () => {
    it('デフォルトでは展開状態', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'グループを折りたたむ' })).toBeInTheDocument();
      expect(screen.getByText('足場')).toBeInTheDocument();
    });

    it('initialExpanded=falseの場合は折りたたみ状態', () => {
      render(<QuantityGroupCard {...defaultProps} initialExpanded={false} />);

      expect(screen.getByRole('button', { name: 'グループを展開' })).toBeInTheDocument();
    });

    it('展開/折りたたみボタンをクリックすると状態が切り替わる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      const toggleButton = screen.getByRole('button', { name: 'グループを折りたたむ' });
      await user.click(toggleButton);

      expect(screen.getByRole('button', { name: 'グループを展開' })).toBeInTheDocument();
    });
  });

  describe('項目一覧', () => {
    it('項目がある場合は項目一覧が表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByText('足場')).toBeInTheDocument();
      expect(screen.getByText('掘削')).toBeInTheDocument();
    });

    it('項目がない場合は空状態メッセージが表示される', () => {
      const emptyGroup = { ...mockGroup, items: [], itemCount: 0 };
      render(<QuantityGroupCard {...defaultProps} group={emptyGroup} />);

      expect(screen.getByText('項目がありません')).toBeInTheDocument();
    });
  });

  describe('項目追加', () => {
    it('項目追加ボタンをクリックするとonAddItemが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '項目を追加' }));

      expect(defaultProps.onAddItem).toHaveBeenCalledWith('group-1');
    });
  });

  describe('グループ削除', () => {
    it('グループ削除ボタンをクリックするとonDeleteGroupが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'グループを削除' }));

      expect(defaultProps.onDeleteGroup).toHaveBeenCalledWith('group-1');
    });
  });

  describe('アクセシビリティ', () => {
    it('articleタグでラップされている', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('展開ボタンにaria-expandedが設定されている', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'グループを折りたたむ' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });

    it('折りたたみ時にaria-expanded=falseになる', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'グループを折りたたむ' }));

      expect(screen.getByRole('button', { name: 'グループを展開' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('項目一覧テーブルにaria-labelが設定されている', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('table', { name: '数量項目一覧' })).toBeInTheDocument();
    });

    it('サムネイルにaria-labelが設定されている', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: '紐付け画像を変更' })).toBeInTheDocument();
    });

    it('プレースホルダーにaria-labelが設定されている', () => {
      const groupWithoutImage = { ...mockGroup, surveyImage: null, surveyImageId: null };
      render(<QuantityGroupCard {...defaultProps} group={groupWithoutImage} />);

      expect(screen.getByRole('button', { name: '写真を選択' })).toBeInTheDocument();
    });
  });
});
