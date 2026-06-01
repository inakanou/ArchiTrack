/**
 * @fileoverview 数量グループカードコンポーネントのテスト
 *
 * Task 5.2: 数量グループコンポーネントを実装する（TDDテストファースト）
 *
 * Requirements:
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.5: 数量グループの削除操作を行う
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import QuantityGroupCard from './QuantityGroupCard';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

// AnnotatedImageThumbnail をモックして、注釈データ取得 API 呼び出し（および
// アンマウント後に発火する logger.warn）を抑止する。これがないと
// vitest-worker teardown 中に onUserConsoleLog が pending のまま rpc が閉じられ、
// EnvironmentTeardownError として Unhandled Rejection になり test:coverage が失敗する。
vi.mock('../site-surveys/AnnotatedImageThumbnail', () => ({
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
}));

// テストデータ
const mockGroupWithImage: QuantityGroupDetail = {
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
      middleCategory: '直接仮設',
      minorCategory: null,
      customCategory: null,
      workType: '仮設工',
      name: '足場',
      specification: 'ビケ足場',
      unit: 'm2',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 100.5,
      remarks: null,
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'item-2',
      quantityGroupId: 'group-1',
      majorCategory: '共通仮設',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '安全設備工',
      name: 'ネット',
      specification: null,
      unit: 'm2',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 50,
      remarks: '安全用',
      displayOrder: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockGroupWithoutImage: QuantityGroupDetail = {
  id: 'group-2',
  quantityTableId: 'qt-123',
  name: null,
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 1,
  itemCount: 1,
  items: [
    {
      id: 'item-3',
      quantityGroupId: 'group-2',
      majorCategory: '土工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '掘削工',
      name: '掘削',
      specification: null,
      unit: 'm3',
      calculationMethod: 'AREA_VOLUME',
      calculationParams: { width: 10, depth: 5, height: 2 },
      adjustmentFactor: 1.0,
      roundingUnit: 0.1,
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

// テストヘルパー
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('QuantityGroupCard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 5.2: 数量グループコンポーネントを実装する
  // ====================================================================

  describe('Task 5.2: 数量グループコンポーネント', () => {
    describe('グループヘッダー表示', () => {
      it('グループ名が表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText('テストグループ')).toBeInTheDocument();
      });

      it('グループ内の項目数が表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText(/2項目/)).toBeInTheDocument();
      });

      it('グループ展開/折りたたみボタンが表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(
          screen.getByRole('button', { name: /グループを折りたたむ|グループを展開/ })
        ).toBeInTheDocument();
      });
    });

    describe('計算用フィールドの水平スクロール', () => {
      it('カードが overflow-x: auto で水平スクロール可能（計算用フィールド閲覧のため）', () => {
        // 計算方法（面積・体積/ピッチ）選択時に操作列の右へ展開する計算用フィールドを
        // 閲覧できるよう、カードが水平スクロール可能であること。
        // 従来は overflow: hidden でクリップされ追加フィールドへ到達できなかった。
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        const card = screen.getByTestId('quantity-group-card');
        expect(card).toHaveStyle({ overflowX: 'auto' });
      });

      it('カードの縦方向はクリップされ、角丸クリップとレイアウトを維持する', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        const card = screen.getByTestId('quantity-group-card');
        expect(card).toHaveStyle({ overflowY: 'hidden' });
      });
    });

    describe('REQ 3.3: 該当写真の注釈付きサムネイル表示', () => {
      it('紐付き画像があるグループにサムネイルが表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        // 注釈表示のためoriginalUrlを使用する仕様に変更
        const thumbnail = screen.getByAltText('photo1.jpg');
        expect(thumbnail).toBeInTheDocument();
        expect(thumbnail).toHaveAttribute('src', '/images/original-1.jpg');
      });

      it('紐付き画像がないグループには画像プレースホルダーが表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithoutImage} groupDisplayName="グループ 2" />
        );

        expect(screen.getByTestId('image-placeholder-group-2')).toBeInTheDocument();
      });

      it('サムネイルクリックで写真選択モーダルを開く', async () => {
        const onSelectImage = vi.fn();
        renderWithRouter(
          <QuantityGroupCard
            group={mockGroupWithoutImage}
            groupDisplayName="グループ 2"
            onSelectImage={onSelectImage}
          />
        );

        const placeholder = screen.getByTestId('image-placeholder-group-2');
        await userEvent.click(placeholder);

        expect(onSelectImage).toHaveBeenCalledWith('group-2');
      });
    });

    describe('REQ 3.2: 数量項目の階層表示', () => {
      it('グループ内の全項目が表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText('足場')).toBeInTheDocument();
        expect(screen.getByText('ネット')).toBeInTheDocument();
      });

      it('項目の数量と単位が表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText('100.5')).toBeInTheDocument();
        expect(screen.getByText('50')).toBeInTheDocument();
      });

      it('項目の工種が表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText('仮設工')).toBeInTheDocument();
        expect(screen.getByText('安全設備工')).toBeInTheDocument();
      });
    });

    describe('グループ展開/折りたたみ', () => {
      it('折りたたみボタンをクリックするとアイテムが非表示になる', async () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        // 初期状態では展開されている
        expect(screen.getByText('足場')).toBeVisible();

        // 折りたたみボタンをクリック
        const toggleButton = screen.getByRole('button', { name: /グループを折りたたむ/ });
        await userEvent.click(toggleButton);

        // アイテムが非表示になる
        expect(screen.queryByText('足場')).not.toBeVisible();
      });
    });

    describe('グループアクション', () => {
      it('項目追加ボタンが表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByRole('button', { name: /項目を追加/ })).toBeInTheDocument();
      });

      it('グループ削除ボタンが表示される', () => {
        renderWithRouter(
          <QuantityGroupCard group={mockGroupWithImage} groupDisplayName="テストグループ" />
        );

        expect(screen.getByRole('button', { name: /グループを削除/ })).toBeInTheDocument();
      });

      it('項目追加ボタンクリックでコールバックが呼ばれる', async () => {
        const onAddItem = vi.fn();
        renderWithRouter(
          <QuantityGroupCard
            group={mockGroupWithImage}
            groupDisplayName="テストグループ"
            onAddItem={onAddItem}
          />
        );

        await userEvent.click(screen.getByRole('button', { name: /項目を追加/ }));

        expect(onAddItem).toHaveBeenCalledWith('group-1');
      });

      it('グループ削除ボタンクリックでコールバックが呼ばれる', async () => {
        const onDeleteGroup = vi.fn();
        renderWithRouter(
          <QuantityGroupCard
            group={mockGroupWithImage}
            groupDisplayName="テストグループ"
            onDeleteGroup={onDeleteGroup}
          />
        );

        await userEvent.click(screen.getByRole('button', { name: /グループを削除/ }));

        expect(onDeleteGroup).toHaveBeenCalledWith('group-1');
      });
    });

    describe('空のグループ', () => {
      it('項目が0件の場合、空状態メッセージが表示される', () => {
        const emptyGroup: QuantityGroupDetail = {
          ...mockGroupWithImage,
          itemCount: 0,
          items: [],
        };

        renderWithRouter(
          <QuantityGroupCard group={emptyGroup} groupDisplayName="テストグループ" />
        );

        expect(screen.getByText(/項目がありません/)).toBeInTheDocument();
      });
    });
  });
});
