/**
 * @fileoverview EstimateRequestDetailPage単体テスト
 *
 * Task 6.2: EstimateRequestDetailPageの実装
 *
 * Requirements:
 * - 4.1: 見積依頼詳細画面にパンくずナビゲーションを表示する
 * - 9.1: 見積依頼詳細画面に編集ボタンを表示する
 * - 9.2: 見積依頼詳細画面に削除ボタンを表示する
 * - 9.4: ユーザーが削除ボタンをクリックしたとき、削除確認ダイアログを表示する
 * - 9.5: ユーザーが削除を確認したとき、見積依頼を論理削除し一覧画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestDetailPage from './EstimateRequestDetailPage';

// Mock modules (must be before mock data because of hoisting)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/estimate-requests', () => ({
  getEstimateRequestDetail: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  getEstimateRequestItems: vi.fn().mockResolvedValue([
    {
      id: 'item-1',
      estimateRequestItemId: 'eri-1',
      customCategory: 'カテゴリA',
      workType: '工種1',
      name: '項目1',
      specification: '規格1',
      unit: '個',
      quantity: 10,
      displayOrder: 1,
      selected: true,
      otherRequests: [],
    },
    {
      id: 'item-2',
      estimateRequestItemId: 'eri-2',
      customCategory: 'カテゴリB',
      workType: '工種2',
      name: '項目2',
      specification: '規格2',
      unit: 'm',
      quantity: 20,
      displayOrder: 2,
      selected: false,
      otherRequests: [
        {
          estimateRequestId: 'er-other',
          estimateRequestName: '他の見積',
          tradingPartnerName: '他社',
        },
      ],
    },
  ]),
  getEstimateRequestText: vi.fn().mockResolvedValue({
    recipient: 'test@example.com',
    subject: 'テストプロジェクト 御見積依頼',
    body: '本文テスト',
  }),
  updateEstimateRequest: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  updateItemSelection: vi.fn().mockResolvedValue(undefined),
  deleteEstimateRequest: vi.fn().mockResolvedValue(undefined),
}));

describe('EstimateRequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test: ページ見出しが表示されること
   */
  it('ページ見出し（見積依頼名）が表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'テスト見積依頼' })).toBeInTheDocument();
    });
  });

  /**
   * Test: パンくずナビゲーションが表示されること
   * Requirements: 4.1
   */
  it('パンくずナビゲーションが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // パンくずに「見積依頼一覧」が含まれる
      expect(screen.getByText('見積依頼一覧')).toBeInTheDocument();
    });
  });

  /**
   * Test: 編集ボタンが表示されること
   * Requirements: 9.1
   */
  it('編集ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /編集/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: 削除ボタンが表示されること
   * Requirements: 9.2
   */
  it('削除ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /削除/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: 削除ボタンクリックで確認ダイアログが表示されること
   * Requirements: 9.4
   */
  it('削除ボタンクリックで確認ダイアログが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /削除/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /削除/i }));

    await waitFor(() => {
      expect(screen.getByText(/削除してよろしいですか/i)).toBeInTheDocument();
    });
  });

  /**
   * Test: 項目選択パネルが表示されること
   */
  it('項目選択パネルが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 項目テーブルのヘッダーが表示される
      expect(screen.getByText('選択')).toBeInTheDocument();
      expect(screen.getByText('カテゴリ')).toBeInTheDocument();
    });
  });

  /**
   * Test: 見積依頼文表示ボタンが表示されること
   */
  it('見積依頼文表示ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /見積依頼文を表示/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: Excelエクスポートボタンが表示されること
   */
  it('Excelエクスポートボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Excelでエクスポート/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: ローディング状態が表示されること
   */
  it('ローディング状態が表示されること', () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
  });
});
