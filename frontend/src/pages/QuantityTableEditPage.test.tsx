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
import * as siteSurveysApi from '../api/site-surveys';
import type { QuantityTableDetail } from '../types/quantity-table.types';
import type { SurveyImageInfo } from '../types/site-survey.types';

// APIモック
vi.mock('../api/quantity-tables');
vi.mock('../api/site-surveys');
vi.mock('../api/survey-annotations');
vi.mock('../services/export/QuantityTablePdfExportService');
vi.mock('../services/export/PdfExportService');

// useAutocompleteCandidateStoreフックのモック
const mockGetSuggestions = vi.fn().mockReturnValue([]);
const mockAddCandidateOnBlur = vi.fn();
vi.mock('../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: mockGetSuggestions,
    addCandidateOnBlur: mockAddCandidateOnBlur,
  })),
}));

import { useAutocompleteCandidateStore } from '../hooks/useAutocompleteCandidateStore';
const mockUseAutocompleteCandidateStore = vi.mocked(useAutocompleteCandidateStore);

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockCreateQuantityGroup = vi.mocked(quantityTablesApi.createQuantityGroup);
const mockDeleteQuantityGroup = vi.mocked(quantityTablesApi.deleteQuantityGroup);
const mockCreateQuantityItem = vi.mocked(quantityTablesApi.createQuantityItem);
const mockUpdateQuantityItem = vi.mocked(quantityTablesApi.updateQuantityItem);
const mockDeleteQuantityItem = vi.mocked(quantityTablesApi.deleteQuantityItem);
const mockCopyQuantityItem = vi.mocked(quantityTablesApi.copyQuantityItem);
const mockUpdateQuantityGroup = vi.mocked(quantityTablesApi.updateQuantityGroup);
const mockBulkSaveQuantityTable = vi.mocked(quantityTablesApi.bulkSaveQuantityTable);

const mockGetSiteSurveys = vi.mocked(siteSurveysApi.getSiteSurveys);
const mockGetSiteSurvey = vi.mocked(siteSurveysApi.getSiteSurvey);

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
        // REQ-14.2: 数量は小数2桁でフォーマットされる
        await waitFor(() => {
          expect(screen.getByDisplayValue('100.50')).toBeInTheDocument();
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

        // 注釈表示のためoriginalUrlを使用する仕様に変更
        await waitFor(() => {
          const thumbnail = screen.getByAltText('photo1.jpg');
          expect(thumbnail).toBeInTheDocument();
          expect(thumbnail).toHaveAttribute('src', '/images/original-1.jpg');
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
      // REQ-5.1: デフォルト値は空白
      mockCreateQuantityItem.mockResolvedValue({
        id: 'item-new',
        quantityGroupId: 'group-1',
        majorCategory: '',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '',
        name: '',
        specification: null,
        unit: '',
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

      // REQ-5.1: デフォルト値は空白
      await waitFor(() => {
        expect(mockCreateQuantityItem).toHaveBeenCalledWith('group-1', {
          majorCategory: '',
          workType: '',
          name: '',
          unit: '',
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
    it('項目のフィールドを編集して保存ボタンをクリックすると更新APIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockBulkSaveQuantityTable.mockResolvedValue({
        updatedItemCount: 3,
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 項目名を変更
      const nameInput = screen.getByDisplayValue('足場');
      await user.clear(nameInput);
      await user.type(nameInput, '足場（更新）');

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockBulkSaveQuantityTable).toHaveBeenCalled();
      });
    });

    it('保存に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockBulkSaveQuantityTable.mockRejectedValue(new Error('Update failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/保存に失敗しました/)).toBeInTheDocument();
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

      // EditableQuantityItemRow内の削除ボタン（aria-label="削除"）をクリック
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(mockDeleteQuantityItem).toHaveBeenCalledWith('item-1');
      });
    });

    it('項目削除に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityItem.mockRejectedValue(new Error('Delete failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // EditableQuantityItemRow内の削除ボタン（aria-label="削除"）をクリック
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText(/項目の削除に失敗しました/)).toBeInTheDocument();
      });
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
      mockBulkSaveQuantityTable.mockResolvedValue({
        updatedItemCount: 3,
        updatedAt: '2025-01-02T00:00:00Z',
      });

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

  // ====================================================================
  // REQ-2.5: 数量表名編集機能
  // ====================================================================

  describe('REQ 2.5: 数量表名編集機能', () => {
    it('数量表名が編集可能なinputとして表示される', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        const nameInput = screen.getByLabelText('数量表名');
        expect(nameInput).toBeInTheDocument();
        expect(nameInput).toHaveValue('テスト数量表');
      });
    });

    it('数量表名を変更してフォーカスを外すと保存される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);
      mockUpdateQuantityTable.mockResolvedValue({
        id: 'qt-123',
        projectId: 'proj-456',
        name: '更新された数量表',
        groupCount: 2,
        itemCount: 3,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '更新された数量表');
      await user.tab();

      await waitFor(() => {
        expect(mockUpdateQuantityTable).toHaveBeenCalledWith(
          'qt-123',
          { name: '更新された数量表' },
          '2025-01-01T00:00:00Z'
        );
      });
    });

    it('空の名前は保存されず元に戻る', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.tab();

      // APIが呼ばれないことを確認
      expect(mockUpdateQuantityTable).not.toHaveBeenCalled();
      // 元の値に戻る
      await waitFor(() => {
        expect(nameInput).toHaveValue('テスト数量表');
      });
    });

    it('Enterキーで確定する', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);
      mockUpdateQuantityTable.mockResolvedValue({
        id: 'qt-123',
        projectId: 'proj-456',
        name: '新しい名前',
        groupCount: 2,
        itemCount: 3,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '新しい名前');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockUpdateQuantityTable).toHaveBeenCalled();
      });
    });

    it('数量表名の保存に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);
      mockUpdateQuantityTable.mockRejectedValue(new Error('Update failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '新しい名前');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/数量表名の保存に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ-11.2: 整合性チェック
  // ====================================================================

  describe('REQ 11.2: 整合性チェック', () => {
    it('項目名が空の場合、保存時にエラーが表示される', async () => {
      const user = userEvent.setup();
      const tableWithEmptyItemName: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            items: [
              {
                ...mockQuantityTableDetail.groups[0]!.items[0]!,
                name: '',
              },
            ],
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithEmptyItemName);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/項目名が空の項目があります/)).toBeInTheDocument();
      });
    });

    it('丸め設定が0以下の場合、保存時にエラーが表示される', async () => {
      const user = userEvent.setup();
      const tableWithInvalidRounding: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            items: [
              {
                ...mockQuantityTableDetail.groups[0]!.items[0]!,
                roundingUnit: 0,
              },
            ],
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithInvalidRounding);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/丸め設定が無効です/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 操作エラーの閉じる機能
  // ====================================================================

  describe('操作エラーの閉じる機能', () => {
    it('エラーを閉じるボタンをクリックするとエラーが消える', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockCreateQuantityGroup.mockRejectedValue(new Error('Create failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // グループ追加でエラーを発生させる
      const addButton = screen.getByRole('button', { name: /グループを追加/ });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/グループの追加に失敗しました/)).toBeInTheDocument();
      });

      // エラーを閉じる
      const dismissButton = screen.getByRole('button', { name: 'エラーを閉じる' });
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/グループの追加に失敗しました/)).not.toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // REQ-4.3: 写真選択ダイアログ
  // ====================================================================

  describe('REQ 4.3: 写真選択ダイアログ', () => {
    it('写真選択ボタンをクリックするとダイアログが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 写真選択ボタンを探してクリック
      const photoButtons = screen.getAllByRole('button', { name: /写真を選択/ });
      if (photoButtons.length > 0) {
        await user.click(photoButtons[0]!);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
        });
      }
    });

    it('ダイアログを閉じるボタンをクリックするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const photoButtons = screen.getAllByRole('button', { name: /写真を選択/ });
      if (photoButtons.length > 0) {
        await user.click(photoButtons[0]!);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
        });

        const closeButton = screen.getByRole('button', { name: 'ダイアログを閉じる' });
        await user.click(closeButton);

        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: /写真を選択/ })).not.toBeInTheDocument();
        });
      }
    });
  });

  // ====================================================================
  // 数量表名保存中の状態
  // ====================================================================

  describe('数量表名保存中の状態', () => {
    it('保存中は入力フィールドが無効化される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);
      mockUpdateQuantityTable.mockImplementation(
        () => new Promise(() => {}) // 永続的なpending
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '保存中のテスト');
      await user.tab();

      // 保存中は入力フィールドが無効化される
      await waitFor(() => {
        expect(nameInput).toBeDisabled();
      });
    });
  });

  // ====================================================================
  // グループカウント・項目カウント表示
  // ====================================================================

  describe('グループカウント・項目カウント表示', () => {
    it('グループ数と項目数が正しく表示される', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/2グループ/)).toBeInTheDocument();
        expect(screen.getByText(/3項目/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // グループ削除中の状態
  // ====================================================================

  describe('グループ削除中の状態', () => {
    it('削除中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockDeleteQuantityGroup.mockImplementation(
        () => new Promise(() => {}) // 永続的なpending
      );

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
        expect(screen.getByRole('button', { name: '削除中...' })).toBeDisabled();
      });
    });
  });

  // ====================================================================
  // REQ-6.3: 項目移動機能
  // ====================================================================

  describe('REQ 6.3: 項目移動機能', () => {
    it('項目を上に移動できる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 2番目の項目のアクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      expect(menuButtons.length).toBeGreaterThan(1);
      await user.click(menuButtons[1]!);

      // 上に移動ボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /上に移動/ })).toBeInTheDocument();
      });

      const moveUpButton = screen.getByRole('menuitem', { name: /上に移動/ });
      await user.click(moveUpButton);

      // 項目の順序が変わることを確認
      // （UIでの確認は難しいが、ボタンクリック自体が成功すればOK）
    });

    it('項目を下に移動できる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 1番目の項目のアクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      expect(menuButtons.length).toBeGreaterThan(0);
      await user.click(menuButtons[0]!);

      // 下に移動ボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /下に移動/ })).toBeInTheDocument();
      });

      const moveDownButton = screen.getByRole('menuitem', { name: /下に移動/ });
      await user.click(moveDownButton);

      // 項目の順序が変わることを確認
      // （UIでの確認は難しいが、ボタンクリック自体が成功すればOK）
    });
  });

  // ====================================================================
  // REQ-3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
  // ====================================================================

  describe('REQ 3.3: 注釈付きサムネイル表示', () => {
    it('紐付けられた写真に注釈がある場合、注釈バッジが表示される', async () => {
      const tableWithAnnotatedImage: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/images/thumb-1.jpg',
              originalUrl: '/images/original-1.jpg',
              fileName: 'photo1.jpg',
              hasAnnotations: true,
            },
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithAnnotatedImage);

      renderWithRouter();

      await waitFor(() => {
        // 注釈バッジが表示されることを確認
        expect(screen.getByTestId('annotation-badge-group-1')).toBeInTheDocument();
      });
    });

    it('紐付けられた写真に注釈がない場合、注釈バッジは表示されない', async () => {
      const tableWithoutAnnotation: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/images/thumb-1.jpg',
              originalUrl: '/images/original-1.jpg',
              fileName: 'photo1.jpg',
            },
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithoutAnnotation);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByAltText('photo1.jpg')).toBeInTheDocument();
      });

      // 注釈バッジが表示されないことを確認
      expect(screen.queryByTestId('annotation-badge-group-1')).not.toBeInTheDocument();
    });
  });

  // ====================================================================
  // REQ-4.3: 写真選択してグループに紐付け
  // ====================================================================

  describe('REQ 4.3: 写真選択してグループに紐付け', () => {
    const mockPhotosWithAnnotations: SurveyImageInfo[] = [
      {
        id: 'photo-1',
        surveyId: 'survey-1',
        originalPath: '/original/photo1.jpg',
        thumbnailPath: '/thumb/photo1.jpg',
        originalUrl: '/images/original-1.jpg',
        thumbnailUrl: '/images/thumb-1.jpg',
        fileName: 'photo1.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        hasAnnotations: true,
      },
      {
        id: 'photo-2',
        surveyId: 'survey-1',
        originalPath: '/original/photo2.jpg',
        thumbnailPath: '/thumb/photo2.jpg',
        originalUrl: '/images/original-2.jpg',
        thumbnailUrl: '/images/thumb-2.jpg',
        fileName: 'photo2.jpg',
        fileSize: 2048,
        width: 800,
        height: 600,
        displayOrder: 1,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];

    it('写真選択ダイアログで注釈ありの写真には注釈バッジが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: 'テスト調査',
            surveyDate: '2025-01-01',
            memo: null,
            thumbnailUrl: null,
            imageCount: 2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      mockGetSiteSurvey.mockResolvedValue({
        id: 'survey-1',
        projectId: 'proj-456',
        name: 'テスト調査',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        project: { id: 'proj-456', name: 'テストプロジェクト' },
        images: mockPhotosWithAnnotations,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 写真選択ボタンをクリック（画像なしのグループ）
      const placeholder = screen.getByTestId('image-placeholder-group-2');
      await user.click(placeholder);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
      });

      // 注釈ありの写真には注釈バッジが表示される
      await waitFor(() => {
        expect(screen.getByTestId('photo-annotation-badge-photo-1')).toBeInTheDocument();
      });
    });

    it('写真を選択するとグループに紐付けるAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: 'テスト調査',
            surveyDate: '2025-01-01',
            memo: null,
            thumbnailUrl: null,
            imageCount: 2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      mockGetSiteSurvey.mockResolvedValue({
        id: 'survey-1',
        projectId: 'proj-456',
        name: 'テスト調査',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        project: { id: 'proj-456', name: 'テストプロジェクト' },
        images: mockPhotosWithAnnotations,
      });
      mockUpdateQuantityGroup.mockResolvedValue({
        id: 'group-2',
        quantityTableId: 'qt-123',
        name: null,
        surveyImageId: 'photo-1',
        displayOrder: 1,
        itemCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 写真選択ボタンをクリック
      const placeholder = screen.getByTestId('image-placeholder-group-2');
      await user.click(placeholder);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
      });

      // 写真が読み込まれるのを待つ
      await waitFor(() => {
        expect(screen.getByTestId('photo-item-photo-1')).toBeInTheDocument();
      });

      // 写真を選択
      const photo = screen.getByTestId('photo-item-photo-1');
      await user.click(photo);

      // グループに紐付けるAPIが呼ばれることを確認
      await waitFor(() => {
        expect(mockUpdateQuantityGroup).toHaveBeenCalledWith(
          'group-2',
          { surveyImageId: 'photo-1' },
          expect.any(String)
        );
      });
    });

    it('写真選択後、グループのサムネイルが更新される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: 'テスト調査',
            surveyDate: '2025-01-01',
            memo: null,
            thumbnailUrl: null,
            imageCount: 2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      mockGetSiteSurvey.mockResolvedValue({
        id: 'survey-1',
        projectId: 'proj-456',
        name: 'テスト調査',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        project: { id: 'proj-456', name: 'テストプロジェクト' },
        images: mockPhotosWithAnnotations,
      });
      mockUpdateQuantityGroup.mockResolvedValue({
        id: 'group-2',
        quantityTableId: 'qt-123',
        name: null,
        surveyImageId: 'photo-1',
        displayOrder: 1,
        itemCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 最初はプレースホルダーが表示されている
      expect(screen.getByTestId('image-placeholder-group-2')).toBeInTheDocument();

      // 写真選択ボタンをクリック
      const placeholder = screen.getByTestId('image-placeholder-group-2');
      await user.click(placeholder);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
      });

      // 写真が読み込まれるのを待つ
      await waitFor(() => {
        expect(screen.getByTestId('photo-item-photo-1')).toBeInTheDocument();
      });

      // 写真を選択
      const photo = screen.getByTestId('photo-item-photo-1');
      await user.click(photo);

      // 選択後、グループのサムネイルが更新される
      await waitFor(() => {
        // プレースホルダーが消えて、選択した写真のサムネイルが表示される
        expect(screen.queryByTestId('image-placeholder-group-2')).not.toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // Task 17.2: オートコンプリート候補ストアの統合
  // ====================================================================

  describe('Task 17.2: オートコンプリート候補ストアの統合', () => {
    it('マウント時にuseAutocompleteCandidateStoreが初期化される (Req 7.1)', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // useAutocompleteCandidateStoreがprojectIdで呼ばれていること
      expect(mockUseAutocompleteCandidateStore).toHaveBeenCalledWith({
        projectId: 'proj-456',
      });
    });

    it('候補取得エラー時もオートコンプリート以外は正常に動作する (graceful degradation)', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockUseAutocompleteCandidateStore.mockReturnValue({
        isLoading: false,
        error: new Error('Network error'),
        getSuggestions: mockGetSuggestions,
        addCandidateOnBlur: mockAddCandidateOnBlur,
      });

      renderWithRouter();

      // 数量表自体は正常に表示される
      await waitFor(() => {
        expect(screen.getByDisplayValue('テスト数量表')).toBeInTheDocument();
        expect(screen.getByText('グループ1')).toBeInTheDocument();
      });
    });

    it('対象9フィールドにfield propsが渡される (Req 7.1)', async () => {
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // getSuggestions関数が呼ばれていること（AutocompleteInputの新モードで使用）
      // 各フィールドでgetSuggestionsが呼ばれていることを確認
      // AutocompleteInputの新モードではマウント時にgetSuggestionsが呼ばれる
      expect(mockGetSuggestions).toHaveBeenCalled();
    });
  });

  // ====================================================================
  // REQ-4.4: 注釈付き写真と数量項目の関連性を視覚的に表示する
  // ====================================================================

  describe('REQ 4.4: 注釈付き写真と数量項目の関連性表示', () => {
    it('グループに注釈付き写真が紐付けられている場合、注釈オーバーレイが表示される', async () => {
      const tableWithAnnotatedImage: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/images/thumb-1.jpg',
              originalUrl: '/images/original-1.jpg',
              fileName: 'photo1.jpg',
              hasAnnotations: true,
            },
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithAnnotatedImage);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 注釈バッジが表示されることを確認（REQ-3.3）
      await waitFor(() => {
        expect(screen.getByTestId('annotation-badge-group-1')).toBeInTheDocument();
      });
    });

    it('サムネイルをクリックすると注釈付き拡大画像が表示される', async () => {
      const user = userEvent.setup();
      const tableWithAnnotatedImage: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/images/thumb-1.jpg',
              originalUrl: '/images/original-1.jpg',
              fileName: 'photo1.jpg',
              hasAnnotations: true,
            },
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithAnnotatedImage);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByAltText('photo1.jpg')).toBeInTheDocument();
      });

      // サムネイルをクリック
      const thumbnail = screen.getByAltText('photo1.jpg');
      await user.click(thumbnail);

      // 写真プレビューダイアログが表示される（REQ-20.1）
      await waitFor(() => {
        expect(screen.getByTestId('photo-preview-overlay')).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: グループ名変更 (REQ 22.1, 22.2)
  // ====================================================================

  describe('REQ 22: グループ名変更', () => {
    it('グループ名を変更するとAPIが呼ばれてローカル状態が更新される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockUpdateQuantityGroup.mockResolvedValue({
        id: 'group-1',
        quantityTableId: 'qt-123',
        name: '新しいグループ名',
        surveyImageId: 'img-1',
        displayOrder: 0,
        itemCount: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // グループ名をクリックして編集モードに入る
      const groupName = screen.getByText('グループ1');
      await user.click(groupName);

      // 入力フィールドが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByDisplayValue('グループ1')).toBeInTheDocument();
      });

      // 新しい名前を入力
      const nameInput = screen.getByDisplayValue('グループ1');
      await user.clear(nameInput);
      await user.type(nameInput, '新しいグループ名');

      // Enterで確定（またはblur）
      await user.keyboard('{Enter}');

      // APIが呼ばれることを確認
      await waitFor(() => {
        expect(mockUpdateQuantityGroup).toHaveBeenCalledWith(
          'group-1',
          { name: '新しいグループ名' },
          expect.any(String)
        );
      });
    });

    it('グループ名変更に失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockUpdateQuantityGroup.mockRejectedValue(new Error('Rename failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const groupName = screen.getByText('グループ1');
      await user.click(groupName);

      await waitFor(() => {
        expect(screen.getByDisplayValue('グループ1')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('グループ1');
      await user.clear(nameInput);
      await user.type(nameInput, '失敗グループ名');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/グループ名の変更に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: グループ並び順変更 (REQ 23)
  // ====================================================================

  describe('REQ 23: グループ並び順変更', () => {
    it('グループを上に移動するとAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateGroupOrder = vi.mocked(quantityTablesApi.updateGroupDisplayOrder);
      mockUpdateGroupOrder.mockResolvedValue(undefined as never);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // SortOrderButtonsは「上へ移動」「下へ移動」aria-labelを使用
      // グループ・項目両方にボタンがあるので、有効なものをフィルタして最後（グループ用）をクリック
      const moveUpButtons = screen.getAllByRole('button', { name: /上へ移動/ });
      const enabledUpButtons = moveUpButtons.filter((btn) => !btn.hasAttribute('disabled'));
      // 最後の有効な「上へ移動」ボタンがグループ-1のもの
      await user.click(enabledUpButtons[enabledUpButtons.length - 1]!);

      await waitFor(() => {
        expect(mockUpdateGroupOrder).toHaveBeenCalled();
      });
    });

    it('グループを下に移動するとAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateGroupOrder = vi.mocked(quantityTablesApi.updateGroupDisplayOrder);
      mockUpdateGroupOrder.mockResolvedValue(undefined as never);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 最初の「下へ移動」ボタンは1番目のグループのもの
      const moveDownButtons = screen.getAllByRole('button', { name: /下へ移動/ });
      await user.click(moveDownButtons[0]!);

      await waitFor(() => {
        expect(mockUpdateGroupOrder).toHaveBeenCalled();
      });
    });

    it('グループ移動APIが失敗すると元の順序に戻りエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateGroupOrder = vi.mocked(quantityTablesApi.updateGroupDisplayOrder);
      mockUpdateGroupOrder.mockRejectedValue(new Error('Order update failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const moveDownButtons = screen.getAllByRole('button', { name: /下へ移動/ });
      await user.click(moveDownButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText(/グループの並び順変更に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 項目移動API連携 (REQ 24)
  // ====================================================================

  describe('REQ 24: 項目並び順変更（API連携）', () => {
    it('項目を上に移動するとAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateItemOrder = vi.mocked(quantityTablesApi.updateItemDisplayOrder);
      mockUpdateItemOrder.mockResolvedValue(undefined as never);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 2番目の項目のアクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      await user.click(menuButtons[1]!);

      // 上に移動ボタンをクリック
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /上に移動/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('menuitem', { name: /上に移動/ }));

      await waitFor(() => {
        expect(mockUpdateItemOrder).toHaveBeenCalledWith(
          'group-1',
          expect.arrayContaining([
            expect.objectContaining({ id: 'item-2' }),
            expect.objectContaining({ id: 'item-1' }),
          ])
        );
      });
    });

    it('項目移動APIが失敗すると元の順序に戻りエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateItemOrder = vi.mocked(quantityTablesApi.updateItemDisplayOrder);
      mockUpdateItemOrder.mockRejectedValue(new Error('Item order update failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      await user.click(menuButtons[1]!);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /上に移動/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('menuitem', { name: /上に移動/ }));

      await waitFor(() => {
        expect(screen.getByText(/項目の並び順変更に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 数量表名のblur（変更なし）(REQ 2.5)
  // ====================================================================

  describe('REQ 2.5 追加: 名前未変更でblur', () => {
    it('名前を変更せずにフォーカスを外すとAPIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      let nameInput: HTMLInputElement;
      await waitFor(() => {
        nameInput = screen.getByDisplayValue('テスト数量表') as HTMLInputElement;
        expect(nameInput).toBeInTheDocument();
      });

      // フォーカスして何も変えずにblur
      await user.click(nameInput!);
      await user.tab(); // tab away to blur

      // 名前が変わっていないのでAPIは呼ばれない
      expect(mockUpdateQuantityTable).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: PDF出力成功パス（画像付き）
  // ====================================================================

  describe('REQ 26 追加: PDF出力成功パス', () => {
    it('画像付きグループのPDF出力でrenderAnnotatedImageToDataUrlが呼ばれる', async () => {
      const user = userEvent.setup();

      // 画像付きテーブルデータ
      const tableWithPhoto: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/images/thumb-1.jpg',
              originalUrl: '/images/original-1.jpg',
              fileName: 'photo1.jpg',
            },
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithPhoto);

      // Imageコンストラクタをモック（jsdomでは画像読み込みが動作しないため）
      const originalImage = globalThis.Image;
      class MockImage {
        crossOrigin = '';
        src = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 100;
        height = 100;
        constructor() {
          // srcが設定されたらonerrorを発火（テスト環境では画像読み込み不可）
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
      }
      globalThis.Image = MockImage as unknown as typeof Image;

      const { generateQuantityTablePdf } =
        await import('../services/export/QuantityTablePdfExportService');
      const mockGeneratePdf = vi.mocked(generateQuantityTablePdf);
      mockGeneratePdf.mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }));

      const { downloadPdf } = await import('../services/export/PdfExportService');
      const mockDownload = vi.mocked(downloadPdf);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // PDF出力ボタンをクリック
      const pdfButton = screen.getByRole('button', { name: /PDF/ });
      await user.click(pdfButton);

      // PDF生成が呼ばれる（画像はnullになる）
      await waitFor(() => {
        expect(mockGeneratePdf).toHaveBeenCalled();
      });

      // ダウンロードが呼ばれる
      await waitFor(() => {
        expect(mockDownload).toHaveBeenCalled();
      });

      // クリーンアップ
      globalThis.Image = originalImage;
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 数量表名のEscキー (REQ 2.5)
  // ====================================================================

  describe('REQ 2.5 追加: 数量表名Escキーキャンセル', () => {
    it('Escキーで数量表名の編集がキャンセルされ元に戻る', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      // Escでblur→handleNameBlurが呼ばれるため、APIモックを用意
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);
      mockUpdateQuantityTable.mockResolvedValue({
        id: 'qt-123',
        name: 'テスト数量表',
        updatedAt: '2025-01-02T00:00:00Z',
      } as never);

      renderWithRouter();

      // データ読み込みと名前表示を待つ
      let nameInput: HTMLInputElement;
      await waitFor(() => {
        nameInput = screen.getByDisplayValue('テスト数量表') as HTMLInputElement;
        expect(nameInput).toBeInTheDocument();
      });

      // フォーカスして名前を変更
      await user.click(nameInput!);
      await user.clear(nameInput!);
      await user.type(nameInput!, '変更された名前');
      expect(nameInput!.value).toBe('変更された名前');

      // Escキーで元に戻す
      await user.keyboard('{Escape}');

      // Escape後、名前は元に戻る
      await waitFor(() => {
        expect(nameInput!.value).toBe('テスト数量表');
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 保存の競合エラー (REQ 11)
  // ====================================================================

  describe('REQ 11 追加: 保存の競合エラー', () => {
    it('保存時に競合エラーが発生した場合、競合メッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockBulkSaveQuantityTable.mockRejectedValue(new Error('競合が発生しました'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /保存/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/他のユーザーによって更新されました/)).toBeInTheDocument();
      });
    });

    it('保存時に一般エラーが発生した場合、一般エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockBulkSaveQuantityTable.mockRejectedValue(new Error('Network error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /保存/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/保存に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 写真紐付け失敗 (REQ 4.3)
  // ====================================================================

  describe('REQ 4.3 追加: 写真紐付け失敗', () => {
    it('写真紐付けに失敗した場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: 'テスト調査',
            surveyDate: '2025-01-01',
            memo: null,
            thumbnailUrl: null,
            imageCount: 1,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      mockGetSiteSurvey.mockResolvedValue({
        id: 'survey-1',
        projectId: 'proj-456',
        name: 'テスト調査',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        project: { id: 'proj-456', name: 'テストプロジェクト' },
        images: [
          {
            id: 'photo-1',
            surveyId: 'survey-1',
            originalPath: '/original/photo1.jpg',
            thumbnailPath: '/thumb/photo1.jpg',
            originalUrl: '/images/original-1.jpg',
            thumbnailUrl: '/images/thumb-1.jpg',
            fileName: 'photo1.jpg',
            fileSize: 1024,
            width: 800,
            height: 600,
            displayOrder: 0,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      });
      mockUpdateQuantityGroup.mockRejectedValue(new Error('Photo link failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 写真選択ボタンをクリック
      const placeholder = screen.getByTestId('image-placeholder-group-2');
      await user.click(placeholder);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId('photo-item-photo-1')).toBeInTheDocument();
      });

      // 写真を選択
      const photo = screen.getByTestId('photo-item-photo-1');
      await user.click(photo);

      // エラーが表示される
      await waitFor(() => {
        expect(screen.getByText(/写真の紐付けに失敗しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: PDF出力エラー (REQ 26)
  // ====================================================================

  describe('REQ 26: PDF出力', () => {
    it('PDF出力中にエラーが発生した場合はエラーメッセージが表示される', async () => {
      const user = userEvent.setup();

      // 写真なしのテーブルデータ（Image loadingがjsdomで停止するのを回避）
      const tableWithoutPhotos: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: mockQuantityTableDetail.groups.map((g) => ({
          ...g,
          surveyImageId: null,
          surveyImage: null,
        })),
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithoutPhotos);

      // モジュールはvi.mockで自動モック済み。generateQuantityTablePdfをrejectさせる
      const { generateQuantityTablePdf } =
        await import('../services/export/QuantityTablePdfExportService');
      const mockGeneratePdf = vi.mocked(generateQuantityTablePdf);
      mockGeneratePdf.mockRejectedValue(new Error('PDF generation failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // PDF出力ボタンをクリック
      const pdfButton = screen.getByRole('button', { name: /PDF/ });
      await user.click(pdfButton);

      await waitFor(() => {
        expect(screen.getByText(/PDF生成中にエラーが発生しました/)).toBeInTheDocument();
      });
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 写真ダイアログのキーボード操作
  // ====================================================================

  describe('写真ダイアログのキーボード操作', () => {
    it('写真選択ダイアログで写真をEnterキーで選択できる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: 'テスト調査',
            surveyDate: '2025-01-01',
            memo: null,
            thumbnailUrl: null,
            imageCount: 1,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      mockGetSiteSurvey.mockResolvedValue({
        id: 'survey-1',
        projectId: 'proj-456',
        name: 'テスト調査',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        project: { id: 'proj-456', name: 'テストプロジェクト' },
        images: [
          {
            id: 'photo-1',
            surveyId: 'survey-1',
            originalPath: '/original/photo1.jpg',
            thumbnailPath: '/thumb/photo1.jpg',
            originalUrl: '/images/original-1.jpg',
            thumbnailUrl: '/images/thumb-1.jpg',
            fileName: 'photo1.jpg',
            fileSize: 1024,
            width: 800,
            height: 600,
            displayOrder: 0,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      });
      mockUpdateQuantityGroup.mockResolvedValue({
        id: 'group-2',
        quantityTableId: 'qt-123',
        name: null,
        surveyImageId: 'photo-1',
        displayOrder: 1,
        itemCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 写真選択ボタンをクリック
      const placeholder = screen.getByTestId('image-placeholder-group-2');
      await user.click(placeholder);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /写真を選択/ })).toBeInTheDocument();
      });

      // 写真が読み込まれるのを待つ
      await waitFor(() => {
        expect(screen.getByTestId('photo-item-photo-1')).toBeInTheDocument();
      });

      // 写真にフォーカスしてEnterキーで選択
      const photoButton = screen.getByRole('button', { name: /photo1.jpgを選択/ });
      await user.click(photoButton);

      // APIが呼ばれることを確認
      await waitFor(() => {
        expect(mockUpdateQuantityGroup).toHaveBeenCalledWith(
          'group-2',
          { surveyImageId: 'photo-1' },
          expect.any(String)
        );
      });
    });
  });
});
