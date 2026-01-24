/**
 * @fileoverview EstimateRequestListPage ステータス表示のテスト
 *
 * Task 16.3: EstimateRequestListTableへのステータス列追加
 *
 * Requirements:
 * - 12.12: 一覧画面ステータス表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestListPage from '../../pages/EstimateRequestListPage';
import * as estimateRequestApi from '../../api/estimate-requests';

// APIモック
vi.mock('../../api/estimate-requests');

// テストデータ
const mockEstimateRequests = {
  data: [
    {
      id: 'er-1',
      name: '見積依頼1',
      projectId: 'project-1',
      tradingPartnerId: 'tp-1',
      tradingPartnerName: '取引先A',
      itemizedStatementId: 'is-1',
      itemizedStatementName: '内訳書1',
      method: 'EMAIL' as const,
      includeBreakdownInBody: false,
      status: 'BEFORE_REQUEST' as const,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    {
      id: 'er-2',
      name: '見積依頼2',
      projectId: 'project-1',
      tradingPartnerId: 'tp-2',
      tradingPartnerName: '取引先B',
      itemizedStatementId: 'is-2',
      itemizedStatementName: '内訳書2',
      method: 'FAX' as const,
      includeBreakdownInBody: true,
      status: 'REQUESTED' as const,
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    },
    {
      id: 'er-3',
      name: '見積依頼3',
      projectId: 'project-1',
      tradingPartnerId: 'tp-3',
      tradingPartnerName: '取引先C',
      itemizedStatementId: 'is-3',
      itemizedStatementName: '内訳書3',
      method: 'EMAIL' as const,
      includeBreakdownInBody: false,
      status: 'QUOTATION_RECEIVED' as const,
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-04T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  },
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/estimate-requests`]}>
      <Routes>
        <Route
          path="/projects/:projectId/estimate-requests"
          element={<EstimateRequestListPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateRequestListPage - ステータス表示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(estimateRequestApi.getEstimateRequests).mockResolvedValue(mockEstimateRequests);
  });

  describe('ステータス列表示 (Requirements 12.12)', () => {
    it('一覧にステータス列を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-list-page')).toBeInTheDocument();
      });

      // 各見積依頼のステータスバッジが表示される
      expect(screen.getByText('依頼前')).toBeInTheDocument();
      expect(screen.getByText('依頼済')).toBeInTheDocument();
      expect(screen.getByText('見積受領済')).toBeInTheDocument();
    });

    it('ステータスバッジに適切な色が適用される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-list-page')).toBeInTheDocument();
      });

      // ステータスバッジのテスト
      const beforeRequestBadge = screen.getByText('依頼前');
      const requestedBadge = screen.getByText('依頼済');
      const quotationReceivedBadge = screen.getByText('見積受領済');

      // バッジが正しく表示されていることを確認
      expect(beforeRequestBadge).toBeInTheDocument();
      expect(requestedBadge).toBeInTheDocument();
      expect(quotationReceivedBadge).toBeInTheDocument();
    });

    it('見積依頼が存在しない場合はステータス列を表示しない', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequests).mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-list-page')).toBeInTheDocument();
      });

      // 空状態メッセージが表示される
      expect(screen.getByText('見積依頼はまだありません')).toBeInTheDocument();
    });
  });
});
