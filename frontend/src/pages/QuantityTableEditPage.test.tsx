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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from './QuantityTableEditPage';
import * as quantityTablesApi from '../api/quantity-tables';
import type { QuantityTableDetail } from '../types/quantity-table.types';

// APIモック
vi.mock('../api/quantity-tables');
const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);

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
          expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('テスト数量表');
        });
      });

      it('パンくずナビゲーションが表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
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

        await waitFor(() => {
          expect(screen.getByText('足場')).toBeInTheDocument();
          expect(screen.getByText('ネット')).toBeInTheDocument();
          expect(screen.getByText('掘削')).toBeInTheDocument();
        });
      });

      it('項目の数量と単位が表示される', async () => {
        mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText('100.5')).toBeInTheDocument();
          // m2 is used by multiple items
          expect(screen.getAllByText('m2').length).toBeGreaterThanOrEqual(1);
          expect(screen.getByText('m3')).toBeInTheDocument();
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
});
