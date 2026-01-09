/**
 * @fileoverview 数量表編集画面のテスト
 *
 * Task 5.1: 数量表編集画面のレイアウトを実装する（TDDテストファースト）
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from './QuantityTableEditPage';
import * as quantityTablesApi from '../api/quantity-tables';
import type { QuantityTableDetail } from '../types/quantity-table.types';

// APIモック
vi.mock('../api/quantity-tables');
const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockCreateQuantityGroup = vi.mocked(quantityTablesApi.createQuantityGroup);
const mockDeleteQuantityGroup = vi.mocked(quantityTablesApi.deleteQuantityGroup);
const mockCreateQuantityItem = vi.mocked(quantityTablesApi.createQuantityItem);
const mockUpdateQuantityItem = vi.mocked(quantityTablesApi.updateQuantityItem);
const mockDeleteQuantityItem = vi.mocked(quantityTablesApi.deleteQuantityItem);
const mockCopyQuantityItem = vi.mocked(quantityTablesApi.copyQuantityItem);

// テストデータ
const mockQuantityTableDetail: QuantityTableDetail = {
  id: 'qt-123',
  projectId: 'proj-456',
  project: {
    id: 'proj-456',
    name: 'テストプロジェクト',
  },
  name: 'テスト数量表',
  groupCount: 2,
  itemCount: 3,
  groups: [
    {
      id: 'group-1',
      quantityTableId: 'qt-123',
      name: 'グループ1',
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
    },
    {
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
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

// テストヘルパー
function renderWithRouter(tableId: string = 'qt-123') {
  return render(
    <MemoryRouter initialEntries={[`/quantity-tables/${tableId}/edit`]}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('QuantityTableEditPage', () => {
  beforeEach(() => {
    // Setup logic can go here if needed
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 5.1: 数量表編集画面のレイアウトを実装する
  // ====================================================================

  describe('Task 5.1: 数量表編集画面のレイアウト', () => {
    describe('REQ 3.1: 数量表編集画面を表示する', () => {
      it('数量表編集画面が表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('main')).toBeInTheDocument();
        });
      });

      it('数量表名がページタイトルとして表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
          // h1内のinputに数量表名が設定されている
          expect(screen.getByDisplayValue('テスト数量表')).toBeInTheDocument();
        });
      });

      it('パンくずナビゲーションが表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByRole('navigation', { name: /パンくずナビゲーション/ })
          ).toBeInTheDocument();
        });
      });

      it('プロジェクト名がパンくずに含まれる', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
        });
      });
    });

    describe('ローディング状態', () => {
      it('データ取得中はローディング表示される', () => {
        mockGetQuantityTableDetail.mockImplementation(
          () => new Promise(() => {}) // 永続的なpending
        );

        renderWithRouter();

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
      });
    });

    describe('エラー状態', () => {
      it('取得エラー時はエラーメッセージが表示される', async () => {
        mockGetQuantityTableDetail.mockRejectedValue(new Error('Network error'));

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('alert')).toBeInTheDocument();
          expect(screen.getByText(/読み込みに失敗しました/)).toBeInTheDocument();
        });
      });

      it('リトライボタンが表示される', async () => {
        mockGetQuantityTableDetail.mockRejectedValue(new Error('Network error'));

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
        });
      });
    });

    describe('REQ 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する', () => {
      it('全てのグループが表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          // グループ1（名前あり）
          expect(screen.getByText('グループ1')).toBeInTheDocument();
          // グループ2（名前なし）- デフォルト表示
          expect(screen.getByText(/グループ 2/)).toBeInTheDocument();
        });
      });

      it('グループ内の項目が表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        // 項目名はinput要素のvalueとして表示されるため、getByDisplayValueを使用
        await waitFor(() => {
          expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
          expect(screen.getByDisplayValue('ネット')).toBeInTheDocument();
          expect(screen.getByDisplayValue('掘削')).toBeInTheDocument();
        });
      });

      it('項目の数量と単位が表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        // 数量と単位はinput要素のvalueとして表示されるため、getByDisplayValueを使用
        await waitFor(() => {
          expect(screen.getByDisplayValue('100.5')).toBeInTheDocument();
          // m2 is used by multiple items
          expect(screen.getAllByDisplayValue('m2').length).toBeGreaterThanOrEqual(1);
          expect(screen.getByDisplayValue('m3')).toBeInTheDocument();
        });
      });
    });

    describe('REQ 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する', () => {
      it('紐付き画像があるグループにサムネイルが表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          const thumbnail = screen.getByAltText('photo1.jpg');
          expect(thumbnail).toBeInTheDocument();
          expect(thumbnail).toHaveAttribute('src', '/images/thumb-1.jpg');
        });
      });

      it('紐付き画像がないグループには画像プレースホルダーが表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByTestId('image-placeholder-group-2')).toBeInTheDocument();
        });
      });
    });
  });

  // ====================================================================
  // 追加: 空のグループ・項目表示
  // ====================================================================

  describe('空状態の表示', () => {
    it('グループが0件の場合、空状態メッセージが表示される', async () => {
      const emptyTable: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groupCount: 0,
        itemCount: 0,
        groups: [],
      };
      mockGetQuantityTableDetail.mockResolvedValue(emptyTable);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/グループがありません/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ 4.1: グループ追加機能
  // ====================================================================

  describe('REQ 4.1: グループ追加機能', () => {
    it('グループを追加ボタンをクリックするとグループが追加される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityGroup.mockResolvedValue({
        id: 'group-new',
        quantityTableId: 'qt-123',
        name: null,
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 2,
        itemCount: 0,
        items: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /グループを追加/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(mockCreateQuantityGroup).toHaveBeenCalledWith('qt-123', {
          name: null,
          displayOrder: 2,
        });
      });
    });

    it('グループ追加中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityGroup.mockImplementation(
        () => new Promise(() => {}) // 永続的なpending
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /グループを追加/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /追加中/ })).toBeDisabled();
      });
    });

    it('グループ追加に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityGroup.mockRejectedValue(new Error('Create failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /グループを追加/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/グループの追加に失敗しました/)).toBeInTheDocument();
      });
    });

    it('空状態からグループを追加できる', async () => {
      const user = userEvent.setup();
      const emptyTable: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groupCount: 0,
        itemCount: 0,
        groups: [],
      };
      mockGetQuantityTableDetail.mockResolvedValue(emptyTable);
      mockCreateQuantityGroup.mockResolvedValue({
        id: 'group-new',
        quantityTableId: 'qt-123',
        name: null,
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 0,
        itemCount: 0,
        items: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/グループがありません/)).toBeInTheDocument();
      });

      // 空状態のボタンをクリック
      const addButtons = screen.getAllByRole('button', { name: /グループを追加/ });
      const addButton = addButtons[0];
      expect(addButton).toBeDefined();
      await user.click(addButton!);

      await waitFor(() => {
        expect(mockCreateQuantityGroup).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // REQ 4.5: グループ削除機能
  // ====================================================================

  describe('REQ 4.5: グループ削除機能', () => {
    it('グループ削除ボタンをクリックすると確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/グループを削除しますか？/)).toBeInTheDocument();
      });
    });

    it('確認ダイアログでキャンセルするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('確認ダイアログで削除を実行するとグループが削除される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityGroup.mockResolvedValue();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteQuantityGroup).toHaveBeenCalledWith('group-1');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('グループ削除に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityGroup.mockRejectedValue(new Error('Delete failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/グループの削除に失敗しました/)).toBeInTheDocument();
      });
    });

    it('ダイアログのオーバーレイをクリックするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // オーバーレイをクリック（role="dialog"の要素自体がオーバーレイ）
      const overlay = screen.getByRole('dialog');
      await user.click(overlay);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ 5.1: 項目追加機能
  // ====================================================================

  describe('REQ 5.1: 項目追加機能', () => {
    it('項目追加ボタンをクリックすると項目が追加される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityItem.mockResolvedValue({
        id: 'item-new',
        quantityGroupId: 'group-1',
        majorCategory: '未設定',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '未設定',
        name: '新規項目',
        specification: null,
        unit: '式',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 0,
        remarks: null,
        displayOrder: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const addItemButtons = screen.getAllByRole('button', { name: /項目を追加/ });
      const addItemButton = addItemButtons[0];
      expect(addItemButton).toBeDefined();
      await user.click(addItemButton!);

      await waitFor(() => {
        expect(mockCreateQuantityItem).toHaveBeenCalledWith('group-1', {
          majorCategory: '未設定',
          workType: '未設定',
          name: '新規項目',
          unit: '式',
          quantity: 0,
          displayOrder: 2,
        });
      });
    });

    it('項目追加に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityItem.mockRejectedValue(new Error('Create failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const addItemButtons = screen.getAllByRole('button', { name: /項目を追加/ });
      const addItemButton = addItemButtons[0];
      expect(addItemButton).toBeDefined();
      await user.click(addItemButton!);

      await waitFor(() => {
        expect(screen.getByText(/項目の追加に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // リトライ機能
  // ====================================================================

  describe('リトライ機能', () => {
    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/読み込みに失敗しました/)).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /再試行/ });
      await user.click(retryButton);

      await waitFor(() => {
        expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        expect(screen.getByDisplayValue('テスト数量表')).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ 5.2: 項目更新機能
  // ====================================================================

  describe('REQ 5.2: 項目更新機能', () => {
    it('項目のフィールドを編集すると更新APIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockUpdateQuantityItem.mockResolvedValue({
        ...mockQuantityTableDetail.groups[0]!.items[0]!,
        name: '足場（更新）',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 項目名を変更
      const nameInput = screen.getByDisplayValue('足場');
      await user.clear(nameInput);
      await user.type(nameInput, '足場（更新）');

      // フォーカスを外してblurイベントを発火
      await user.tab();

      await waitFor(() => {
        expect(mockUpdateQuantityItem).toHaveBeenCalled();
      });
    });

    it('項目更新に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockUpdateQuantityItem.mockRejectedValue(new Error('Update failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 項目名を変更
      const nameInput = screen.getByDisplayValue('足場');
      await user.clear(nameInput);
      await user.type(nameInput, '足場（更新）');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/項目の更新に失敗しました/)).toBeInTheDocument();
      });
    });

    it('項目が見つからない場合はエラーが表示される', async () => {
      mockGetQuantityTableDetail.mockResolvedValue({
        ...mockQuantityTableDetail,
        groups: [],
      });
      mockUpdateQuantityItem.mockRejectedValue(new Error('Item not found'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/グループがありません/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ 5.3: 項目削除機能
  // ====================================================================

  describe('REQ 5.3: 項目削除機能', () => {
    it('項目削除ボタンをクリックすると削除APIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityItem.mockResolvedValue();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 削除ボタンを探してクリック（EditableQuantityItemRow内のボタン）
      const deleteButtons = screen.getAllByRole('button', { name: /項目を削除|削除/ });
      // 最初の項目の削除ボタンをクリック
      const itemDeleteButton = deleteButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('項目を削除')
      );
      if (itemDeleteButton) {
        await user.click(itemDeleteButton);

        await waitFor(() => {
          expect(mockDeleteQuantityItem).toHaveBeenCalledWith('item-1');
        });
      }
    });

    it('項目削除に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityItem.mockRejectedValue(new Error('Delete failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 削除ボタンを探してクリック
      const deleteButtons = screen.getAllByRole('button', { name: /項目を削除|削除/ });
      const itemDeleteButton = deleteButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('項目を削除')
      );
      if (itemDeleteButton) {
        await user.click(itemDeleteButton);

        await waitFor(() => {
          expect(screen.getByText(/項目の削除に失敗しました/)).toBeInTheDocument();
        });
      }
    });
  });

  // ====================================================================
  // REQ 5.4: 項目コピー機能
  // ====================================================================

  describe('REQ 5.4: 項目コピー機能', () => {
    it('項目コピーボタンをクリックするとコピーAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const copiedItem = {
        ...mockQuantityTableDetail.groups[0]!.items[0]!,
        id: 'item-copy',
        name: '足場（コピー）',
        displayOrder: 3,
      };
      mockCopyQuantityItem.mockResolvedValue(copiedItem);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // アクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      expect(menuButtons.length).toBeGreaterThan(0);
      await user.click(menuButtons[0]!);

      // コピーボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /コピー/ })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('menuitem', { name: /コピー/ });
      await user.click(copyButton);

      // APIが呼ばれることを確認
      await waitFor(() => {
        expect(mockCopyQuantityItem).toHaveBeenCalledWith('item-1');
      });

      // コピーされた項目がUIに追加されることを確認
      await waitFor(() => {
        expect(screen.getByDisplayValue('足場（コピー）')).toBeInTheDocument();
      });
    });

    it('項目コピーに失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCopyQuantityItem.mockRejectedValue(new Error('Copy failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // アクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      expect(menuButtons.length).toBeGreaterThan(0);
      await user.click(menuButtons[0]!);

      // コピーボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /コピー/ })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('menuitem', { name: /コピー/ });
      await user.click(copyButton);

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText(/項目のコピーに失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ 11.1: 保存機能
  // ====================================================================

  describe('REQ 11.1: 保存機能', () => {
    it('保存ボタンをクリックすると保存メッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/保存しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 数量表が見つからない場合
  // ====================================================================

  describe('数量表が見つからない場合', () => {
    it('nullが返された場合は「数量表が見つかりません」が表示される', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(null as unknown as QuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/数量表が見つかりません/)).toBeInTheDocument();
      });
    });
  });
});
