/**
 * @fileoverview EstimateRequestCreatePage コンポーネントのテスト
 *
 * Task 6.1: EstimateRequestCreatePageの実装
 *
 * Requirements:
 * - 3.6: 見積依頼を作成し詳細画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestCreatePage from '../../pages/EstimateRequestCreatePage';
import * as estimateRequestApi from '../../api/estimate-requests';
import * as tradingPartnersApi from '../../api/trading-partners';
import * as itemizedStatementsApi from '../../api/itemized-statements';

// APIモック
vi.mock('../../api/estimate-requests');
vi.mock('../../api/trading-partners');
vi.mock('../../api/itemized-statements');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// テストデータ
const mockTradingPartners = [
  {
    id: 'tp-1',
    name: '協力業者A',
    nameKana: 'キョウリョクギョウシャエー',
    branchName: null,
    branchNameKana: null,
    representativeName: null,
    representativeNameKana: null,
    types: ['SUBCONTRACTOR' as const],
    address: '東京都渋谷区',
    phoneNumber: '03-1234-5678',
    faxNumber: '03-1234-5679',
    email: 'partner@example.com',
    billingClosingDay: 99,
    paymentMonthOffset: 1,
    paymentDay: 99,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockItemizedStatements = [
  {
    id: 'is-1',
    name: '内訳書1',
    projectId: 'project-1',
    sourceQuantityTableId: 'qt-1',
    sourceQuantityTableName: '数量表1',
    itemCount: 5,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockCreatedRequest = {
  id: 'er-new',
  name: '新規見積依頼',
  projectId: 'project-1',
  tradingPartnerId: 'tp-1',
  tradingPartnerName: '協力業者A',
  itemizedStatementId: 'is-1',
  itemizedStatementName: '内訳書1',
  method: 'EMAIL' as const,
  includeBreakdownInBody: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/estimate-requests/new`]}>
      <Routes>
        <Route
          path="/projects/:projectId/estimate-requests/new"
          element={<EstimateRequestCreatePage />}
        />
        <Route path="/projects/:projectId/estimate-requests" element={<div>見積依頼一覧</div>} />
        <Route path="/estimate-requests/:id" element={<div>見積依頼詳細</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateRequestCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    // EstimateRequestForm内で使用されるAPIをモック
    vi.mocked(tradingPartnersApi.getTradingPartners).mockResolvedValue({
      data: mockTradingPartners,
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue({
      data: mockItemizedStatements,
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    vi.mocked(estimateRequestApi.createEstimateRequest).mockResolvedValue(mockCreatedRequest);
  });

  describe('ページ構造', () => {
    it('ページを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: '見積依頼 新規作成' })).toBeInTheDocument();
    });

    it('パンくずナビゲーションを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('navigation', { name: /パンくず/i })).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });

    it('戻るリンクを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '一覧に戻る' });
      expect(backLink).toHaveAttribute('href', '/projects/project-1/estimate-requests');
    });

    it('メインコンテンツにrole="main"が設定されている', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });
  });

  describe('キャンセル時の遷移', () => {
    it('キャンセル時に一覧画面に遷移する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      // フォームが読み込まれるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/estimate-requests');
    });
  });

  describe('異なるプロジェクトID', () => {
    it('別のプロジェクトIDで正しいパスを生成する', async () => {
      renderWithRouter('project-999');

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '一覧に戻る' });
      expect(backLink).toHaveAttribute('href', '/projects/project-999/estimate-requests');
    });
  });

  describe('パンくずナビゲーションの構造', () => {
    it('正しいパンくず階層を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      // パンくずの各項目を確認
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト詳細')).toBeInTheDocument();
      expect(screen.getByText('見積依頼一覧')).toBeInTheDocument();
      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });
  });

  describe('フォームコンポーネントの統合', () => {
    it('EstimateRequestFormコンポーネントを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      // フォームの存在を確認（作成ボタンが表示される）
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
      });
    });

    it('フォーム内に名前入力フィールドが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-create-page')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });
    });
  });
});
