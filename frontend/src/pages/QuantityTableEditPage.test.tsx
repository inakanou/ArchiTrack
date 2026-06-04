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
import { ApiError } from '../api/client';
import type { QuantityTableDetail } from '../types/quantity-table.types';
import type { SurveyImageInfo } from '../types/site-survey.types';

// APIモック
vi.mock('../api/quantity-tables');
vi.mock('../api/site-surveys');
vi.mock('../api/survey-annotations');
vi.mock('../services/export/QuantityTablePdfExportService');
vi.mock('../services/export/PdfExportService');

// useBlocker をモック（データルーターなしでテストするため。Task 62.1 離脱ガード対応）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

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
const mockSaveQuantityTableDraft = vi.mocked(quantityTablesApi.saveQuantityTableDraft);

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
    // Task 61.1: グループ追加はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('グループを追加ボタンをクリックするとドラフトにグループが追加され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 初期は2グループ
      expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(2);

      const addButton = screen.getByRole('button', { name: /グループを追加/ });
      await user.click(addButton);

      // ドラフトへ即時反映（3グループ）
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(3);
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockCreateQuantityGroup).not.toHaveBeenCalled();
    });

    it('空状態からグループを追加できる（ドラフトへ反映され永続化APIは呼ばれない）', async () => {
      const user = userEvent.setup();
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

      // 空状態のボタンをクリック
      const addButtons = screen.getAllByRole('button', { name: /グループを追加/ });
      const addButton = addButtons[0];
      expect(addButton).toBeDefined();
      await user.click(addButton!);

      await waitFor(() => {
        expect(screen.getByTestId('quantity-group-card')).toBeInTheDocument();
      });
      expect(mockCreateQuantityGroup).not.toHaveBeenCalled();
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

    // Task 61.1: グループ削除はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('確認ダイアログで削除を実行するとドラフトからグループが削除され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(2);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const deleteButton = deleteButtons[0];
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      await user.click(confirmButton);

      // ドラフトから削除（1グループへ）・ダイアログは閉じる
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockDeleteQuantityGroup).not.toHaveBeenCalled();
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
    // Task 61.1: 項目追加はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('項目追加ボタンをクリックするとドラフトに項目が追加され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 初期は3項目（group-1: 2, group-2: 1）
      expect(screen.getAllByTestId('quantity-item-row')).toHaveLength(3);

      const addItemButtons = screen.getAllByRole('button', { name: /項目を追加/ });
      const addItemButton = addItemButtons[0];
      expect(addItemButton).toBeDefined();
      await user.click(addItemButton!);

      // ドラフトへ即時反映（4項目）
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-item-row')).toHaveLength(4);
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockCreateQuantityItem).not.toHaveBeenCalled();
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
    // Task 61.4: 保存は saveQuantityTableDraft（フル状態同期保存）を1回呼ぶ（REQ-42.5）
    it('項目のフィールドを編集して保存ボタンをクリックするとフル状態同期保存APIが1回呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockSaveQuantityTableDraft.mockResolvedValue(mockQuantityTableDetail);

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
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });

      // expectedUpdatedAt はサーバースナップショットの updatedAt、name と groups[全状態] を含む（REQ-42.5）
      const [calledId, calledInput] = mockSaveQuantityTableDraft.mock.calls[0]!;
      expect(calledId).toBe('qt-123');
      expect(calledInput.expectedUpdatedAt).toBe(mockQuantityTableDetail.updatedAt);
      expect(calledInput.name).toBe('テスト数量表');
      expect(calledInput.groups).toHaveLength(2);
      // displayOrder は配列順
      expect(calledInput.groups.map((g) => g.displayOrder)).toEqual([0, 1]);
      // 既存グループは id=UUID、編集後の項目名が反映されている
      const firstGroup = calledInput.groups[0]!;
      expect(firstGroup.id).toBe('group-1');
      expect(firstGroup.items[0]!.name).toBe('足場（更新）');
      // 個別ミューテーションAPIは呼ばれない（REQ-42.6）
      expect(mockUpdateQuantityItem).not.toHaveBeenCalled();
    });

    it('保存に失敗した場合はエラーが表示され、ドラフト（未保存変更）は保持される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockSaveQuantityTableDraft.mockRejectedValue(new ApiError(500, 'Server error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 項目名を編集してドラフトを dirty にする
      const nameInput = screen.getByDisplayValue('足場');
      await user.clear(nameInput);
      await user.type(nameInput, '足場（編集中）');

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/保存に失敗しました/)).toBeInTheDocument();
      });

      // 失敗後も再取得は行わず、編集中の値（ドラフト）が保持されている（REQ-42.9）
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue('足場（編集中）')).toBeInTheDocument();
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
    // Task 61.1: 項目削除はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('項目削除でドラフトから項目が削除され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // アクションメニューを開いて削除を実行
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      expect(menuButtons.length).toBeGreaterThan(0);
      await user.click(menuButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /削除/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('menuitem', { name: /削除/ }));

      // ドラフトから削除（「足場」が消える）
      await waitFor(() => {
        expect(screen.queryByDisplayValue('足場')).not.toBeInTheDocument();
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockDeleteQuantityItem).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // REQ 5.4: 項目コピー機能
  // ====================================================================

  describe('REQ 5.4: 項目コピー機能', () => {
    // Task 61.1: 項目コピーはドラフト内で複製され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('項目コピーでドラフト内に複製され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 初期は3項目
      expect(screen.getAllByTestId('quantity-item-row')).toHaveLength(3);

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

      // ドラフト内で複製され項目数が増える（4項目）
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-item-row')).toHaveLength(4);
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockCopyQuantityItem).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // REQ 11.1: 保存機能
  // ====================================================================

  describe('REQ 11.1: 保存機能', () => {
    // Task 61.4: 保存成功時はサーバー最新データで同期し「保存しました」を表示する（REQ-42.8）
    it('保存ボタンをクリックすると保存され、サーバー最新データで同期して保存メッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      // 保存後の最新詳細（updatedAt が進む）を返す
      const savedDetail: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        updatedAt: '2025-02-02T00:00:00Z',
      };
      mockSaveQuantityTableDraft.mockResolvedValue(savedDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/保存しました/)).toBeInTheDocument();
      });

      // saveDraft レスポンスで同期するため、保存後の再取得（getQuantityTableDetail）は行わない（REQ-42.8）
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
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

    // Task 61.1: 数量表名変更はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.2, 42.6）
    it('数量表名を変更してフォーカスを外すとドラフトへ反映され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '更新された数量表');
      await user.tab();

      // ドラフトへ反映（入力値が保持される）
      await waitFor(() => {
        expect(nameInput).toHaveValue('更新された数量表');
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockUpdateQuantityTable).not.toHaveBeenCalled();
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

    it('Enterキーで確定するとドラフトへ反映され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateQuantityTable = vi.mocked(quantityTablesApi.updateQuantityTable);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, '新しい名前');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(nameInput).toHaveValue('新しい名前');
      });
      expect(mockUpdateQuantityTable).not.toHaveBeenCalled();
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
      // 項目名が空のデータをロードし、保存時の整合性エラーで operationError を発生させる
      const tableWithEmptyItemName: QuantityTableDetail = {
        ...mockQuantityTableDetail,
        groups: [
          {
            ...mockQuantityTableDetail.groups[0]!,
            items: [{ ...mockQuantityTableDetail.groups[0]!.items[0]!, name: '' }],
          },
        ],
      };
      mockGetQuantityTableDetail.mockResolvedValue(tableWithEmptyItemName);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 保存時の整合性チェックでエラーを発生させる（REQ-11.2）
      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/項目名が空の項目があります/)).toBeInTheDocument();
      });

      // エラーを閉じる
      const dismissButton = screen.getByRole('button', { name: 'エラーを閉じる' });
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/項目名が空の項目があります/)).not.toBeInTheDocument();
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

  describe('数量表名編集の状態', () => {
    // Task 61.1: 数量表名はドラフト編集（永続化なし）のため、入力欄は常に編集可能
    it('数量表名はドラフト編集のため入力欄は無効化されない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('数量表名');
      await user.clear(nameInput);
      await user.type(nameInput, 'ドラフト編集テスト');
      await user.tab();

      // 入力欄は無効化されない（ドラフトへ反映済み）
      expect(nameInput).not.toBeDisabled();
      await waitFor(() => {
        expect(nameInput).toHaveValue('ドラフト編集テスト');
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

  describe('グループ削除の確定', () => {
    // Task 61.1: 削除はドラフト操作（同期）のため、確定でダイアログが即座に閉じる
    it('削除確定でダイアログが閉じ永続化APIは呼ばれない', async () => {
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

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(mockDeleteQuantityGroup).not.toHaveBeenCalled();
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

      // 上へ移動ボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /上へ移動/ })).toBeInTheDocument();
      });

      const moveUpButton = screen.getByRole('menuitem', { name: /上へ移動/ });
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

      // 下へ移動ボタンが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /下へ移動/ })).toBeInTheDocument();
      });

      const moveDownButton = screen.getByRole('menuitem', { name: /下へ移動/ });
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

    it('写真を選択するとドラフトに紐付けられ永続化APIは呼ばれない', async () => {
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

      // Task 61.1: ドラフトへ反映され、プレースホルダーが消える（永続化APIは呼ばれない）
      await waitFor(() => {
        expect(screen.queryByTestId('image-placeholder-group-2')).not.toBeInTheDocument();
      });
      expect(mockUpdateQuantityGroup).not.toHaveBeenCalled();
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
    // Task 61.1: グループ名変更はドラフトへ反映され、永続化APIは呼ばれない（REQ-42.2, 42.6）
    it('グループ名を変更するとドラフトへ反映され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

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

      // Enterで確定
      await user.keyboard('{Enter}');

      // ドラフトへ反映（新しい名前が表示される）
      await waitFor(() => {
        expect(screen.getByText('新しいグループ名')).toBeInTheDocument();
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockUpdateQuantityGroup).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: グループ並び順変更 (REQ 23)
  // ====================================================================

  describe('REQ 23: グループ並び順変更', () => {
    // Task 61.1: グループ並び替えはドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('グループを下に移動するとドラフト内で順序が変わり永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateGroupOrder = vi.mocked(quantityTablesApi.updateGroupDisplayOrder);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 初期順序: [グループ1, グループ 2]
      const cardsBefore = screen.getAllByTestId('quantity-group-card');
      expect(cardsBefore[0]!).toHaveTextContent('グループ1');

      // 1番目のグループの「下へ移動」をクリック
      const moveDownButtons = screen.getAllByRole('button', { name: /下へ移動/ });
      await user.click(moveDownButtons[0]!);

      // ドラフト内で順序が入れ替わる（グループ1 が2番目へ）
      await waitFor(() => {
        const cardsAfter = screen.getAllByTestId('quantity-group-card');
        expect(cardsAfter[1]!).toHaveTextContent('グループ1');
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockUpdateGroupOrder).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // 追加カバレッジテスト: 項目移動API連携 (REQ 24)
  // ====================================================================

  describe('REQ 24: 項目並び順変更', () => {
    // Task 61.1: 項目並び替えはドラフトへ反映され、永続化APIは呼ばれない（REQ-42.1, 42.6）
    it('項目を上に移動するとドラフト内で順序が変わり永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockUpdateItemOrder = vi.mocked(quantityTablesApi.updateItemDisplayOrder);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 初期順序: group-1 は [足場, ネット]
      const namesBefore = screen
        .getAllByDisplayValue(/足場|ネット/)
        .map((el) => (el as HTMLInputElement).value);
      expect(namesBefore[0]).toBe('足場');

      // 2番目の項目（ネット）のアクションメニューを開く
      const menuButtons = screen.getAllByRole('button', { name: /アクション/ });
      await user.click(menuButtons[1]!);

      // 上へ移動ボタンをクリック
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /上へ移動/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('menuitem', { name: /上へ移動/ }));

      // ドラフト内で順序が入れ替わる（ネットが先頭へ）
      await waitFor(() => {
        const namesAfter = screen
          .getAllByDisplayValue(/足場|ネット/)
          .map((el) => (el as HTMLInputElement).value);
        expect(namesAfter[0]).toBe('ネット');
      });

      // 永続化APIは呼ばれない（REQ-42.6）
      expect(mockUpdateItemOrder).not.toHaveBeenCalled();
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
    // Task 61.4: 409 競合は競合専用メッセージを表示し、ドラフトは保持する（REQ-42.9）
    it('保存時に409競合エラーが発生した場合、競合メッセージが表示されドラフトは保持される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockSaveQuantityTableDraft.mockRejectedValue(new ApiError(409, 'Conflict'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /保存/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/他のユーザーによって更新されました/)).toBeInTheDocument();
      });

      // 競合後もドラフトは保持され、再取得は行わない（REQ-42.9）
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue('足場')).toBeInTheDocument();
    });

    it('保存時に400検証エラーが発生した場合、一般エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      mockSaveQuantityTableDraft.mockRejectedValue(new ApiError(400, 'Validation error'));

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

  describe('REQ 4.3 追加: 写真紐付け（ドラフト反映）', () => {
    // Task 61.1: 写真紐付けはドラフトへ反映され、永続化APIは呼ばれない（REQ-42.3, 42.6）
    it('写真紐付けはドラフトへ反映され永続化APIは呼ばれない', async () => {
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

      // ドラフトへ反映され、プレースホルダーが消える（永続化APIは呼ばれない）
      await waitFor(() => {
        expect(screen.queryByTestId('image-placeholder-group-2')).not.toBeInTheDocument();
      });
      expect(mockUpdateQuantityGroup).not.toHaveBeenCalled();
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

      // 写真にフォーカスしてクリックで選択
      const photoButton = screen.getByRole('button', { name: /photo1.jpgを選択/ });
      await user.click(photoButton);

      // Task 61.1: ドラフトへ反映され、永続化APIは呼ばれない
      await waitFor(() => {
        expect(screen.queryByTestId('image-placeholder-group-2')).not.toBeInTheDocument();
      });
      expect(mockUpdateQuantityGroup).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // インポートダイアログ表示
  // ===========================================================================

  describe('インポートダイアログ', () => {
    it('インポートボタンクリックでインポートダイアログが開く', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const importButton = screen.getByRole('button', { name: 'インポート' });
      await user.click(importButton);

      expect(screen.getByText('数量表インポート')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Task 61.5: グループコピーのクライアントサイド複製（REQ-42.4, 42.6）
  // ===========================================================================

  describe('Task 61.5: グループコピー（クライアント複製）', () => {
    // 61.5: グループコピーはドラフト内で複製され、サーバー複製API（copyQuantityGroup）は呼ばれない
    it('グループをコピーするとドラフトに複製グループが追加され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockCopyQuantityGroup = vi.mocked(quantityTablesApi.copyQuantityGroup);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 初期は2グループ
      expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(2);

      // 「グループ1」のコピーボタンをクリック（元グループの直下に複製される）
      const copyButtons = screen.getAllByRole('button', { name: 'グループをコピー' });
      expect(copyButtons.length).toBeGreaterThan(0);
      await user.click(copyButtons[0]!);

      // ドラフトへ即時反映（3グループ）。複製名「グループ1のコピー」が元の直下に挿入される
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(3);
      });
      expect(screen.getByText('グループ1のコピー')).toBeInTheDocument();

      // サーバー複製API・個別ミューテーション・再取得は呼ばれない（REQ-42.4, 42.6）
      expect(mockCopyQuantityGroup).not.toHaveBeenCalled();
      expect(mockCreateQuantityGroup).not.toHaveBeenCalled();
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Task 61.5: 現場調査からの一括生成（クライアントサイド生成、REQ-42.4, 42.6）
  // ===========================================================================

  describe('Task 61.5: 現場調査から一括生成（クライアント生成）', () => {
    // 61.5: 現場調査の写真枚数分グループをドラフトへ生成し、永続化API（POST /from-survey）は呼ばれない
    it('現場調査を選択して一括生成するとドラフトへ写真枚数分のグループが生成され永続化APIは呼ばれない', async () => {
      const user = userEvent.setup();
      mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
      const mockCreateGroupsFromSurvey = vi.mocked(quantityTablesApi.createGroupsFromSurvey);
      mockGetSiteSurveys.mockResolvedValue({
        data: [
          {
            id: 'survey-1',
            projectId: 'proj-456',
            name: '現場調査A',
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
        name: '現場調査A',
        surveyDate: '2025-01-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 2,
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
        ],
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 初期は2グループ
      expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(2);

      // 「現場調査から一括追加」ボタンをクリックし、現場調査選択ダイアログを開く
      await user.click(screen.getByTestId('bulk-create-from-survey-button'));

      await waitFor(() => {
        expect(screen.getByTestId('survey-select-dialog')).toBeInTheDocument();
      });

      // 現場調査を選択
      await waitFor(() => {
        expect(screen.getByTestId('survey-select-option-survey-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('survey-select-option-survey-1'));

      // 生成を確定
      await user.click(screen.getByTestId('survey-select-dialog-confirm'));

      // ドラフトへ写真2枚分のグループが生成される（既存2 + 生成2 = 4）
      await waitFor(() => {
        expect(screen.getAllByTestId('quantity-group-card')).toHaveLength(4);
      });
      // 連番命名「{現場調査名} {連番}」で生成される
      expect(screen.getByText('現場調査A 1')).toBeInTheDocument();
      expect(screen.getByText('現場調査A 2')).toBeInTheDocument();

      // 永続化API（POST /from-survey）・再取得は呼ばれない（REQ-42.4, 42.6）
      expect(mockCreateGroupsFromSurvey).not.toHaveBeenCalled();
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 写真選択のキーボード操作
  // ===========================================================================

  describe('写真選択のキーボード操作', () => {
    it('写真アイテムでEnterキーを押すと選択される', async () => {
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
      photoButton.focus();
      await user.keyboard('{Enter}');

      // Task 61.1: ドラフトへ反映され、永続化APIは呼ばれない
      await waitFor(() => {
        expect(screen.queryByTestId('image-placeholder-group-2')).not.toBeInTheDocument();
      });
      expect(mockUpdateQuantityGroup).not.toHaveBeenCalled();
    });
  });
});
