/**
 * @fileoverview 契約書詳細画面テスト
 *
 * Task 7.1: ContractDetailPageの実装
 *
 * Requirements (contract-management):
 * - REQ-8.1: 契約書詳細画面に新規作成時に入力した全項目と自動表示項目を表示する
 * - REQ-8.2: ステータス遷移ボタン（「契約前」→「契約済」）を提供する
 * - REQ-8.3: ステータスの双方向遷移（「契約前」⇔「契約済」）
 * - REQ-8.4: 基となった見積書へのリンクを表示する
 * - REQ-8.5: 変更契約の場合、基となった他の契約書へのリンクを表示する
 * - REQ-8.6: 編集ボタンを提供する
 * - REQ-8.7: 編集ボタン押下時、契約書編集画面に遷移する
 * - REQ-8.8: パンくずナビゲーションを表示する
 *
 * @module pages/ContractDetailPage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContractDetailPage from './ContractDetailPage';
import * as contractsApi from '../api/contracts';
import type { ContractDetail } from '../api/contracts';

// モック
vi.mock('../api/contracts');

// ============================================================================
// テストデータ
// ============================================================================

/** 新規契約の詳細テストデータ */
const mockNewContractDetail: ContractDetail = {
  id: 'contract-1',
  projectId: 'project-1',
  contractType: 'NEW',
  status: 'BEFORE_CONTRACT',
  parentContractId: null,
  estimateId: 'estimate-1',
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着工時30%、中間30%、完成時40%',
  separateConstruction: '電気工事、給排水工事',
  otherNotes: '特になし',
  supervisorTradingPartnerId: 'tp-1',
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  estimate: { id: 'estimate-1', name: '見積書A' },
  parentContract: null,
  supervisorTradingPartner: { id: 'tp-1', name: '監理建築事務所' },
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
    siteAddress: '東京都渋谷区1-1-1',
    tradingPartner: { id: 'tp-2', name: '株式会社テスト顧客' },
  },
  version: 0,
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

/** 変更契約の詳細テストデータ */
const mockAmendmentContractDetail: ContractDetail = {
  ...mockNewContractDetail,
  id: 'contract-2',
  contractType: 'AMENDMENT',
  parentContractId: 'contract-1',
  parentContract: {
    id: 'contract-1',
    contractType: 'NEW',
    contractDate: '2026-04-01',
  },
};

/** 契約済のテストデータ */
const mockContractedDetail: ContractDetail = {
  ...mockNewContractDetail,
  status: 'CONTRACTED',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * テスト用レンダリング
 */
function renderContractDetailPage(contractId = 'contract-1', projectId = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/contracts/${contractId}`]}>
      <Routes>
        <Route path="/projects/:projectId/contracts/:contractId" element={<ContractDetailPage />} />
        <Route
          path="/projects/:projectId/contracts/:contractId/edit"
          element={<div data-testid="edit-page">編集画面</div>}
        />
        <Route
          path="/projects/:projectId/estimates"
          element={<div data-testid="estimates-page">見積書一覧</div>}
        />
        <Route
          path="/estimates/:id"
          element={<div data-testid="estimate-detail-page">見積書詳細</div>}
        />
        <Route
          path="/projects/:projectId/contracts"
          element={<div data-testid="contract-list-page">契約書一覧</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('ContractDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // REQ-8.1: 契約書詳細画面に全項目を表示する
  // --------------------------------------------------------------------------
  describe('REQ-8.1: 全項目表示', () => {
    it('契約書の基本情報を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 契約種類
      expect(screen.getByText('新規契約')).toBeInTheDocument();
      // 契約日
      expect(screen.getByText(/2026年4月1日/)).toBeInTheDocument();
      // ステータス
      expect(screen.getByText('契約前')).toBeInTheDocument();
    });

    it('金額情報を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 請負代金額
      expect(screen.getByText(/11,000,000/)).toBeInTheDocument();
      // 工事価格
      expect(screen.getByText(/10,000,000/)).toBeInTheDocument();
      // 消費税額 - getAllTextで確認（11,000,000にも1,000,000が含まれるため）
      const amountElements = screen.getAllByText(/1,000,000/);
      // 少なくとも3つのマッチ（11,000,000、10,000,000に含まれるものと消費税額の1,000,000）
      expect(amountElements.length).toBeGreaterThanOrEqual(1);
    });

    it('工期情報を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 着手日
      expect(screen.getByText(/2026年5月1日/)).toBeInTheDocument();
      // 完成日
      expect(screen.getByText(/2026年12月31日/)).toBeInTheDocument();
      // 引渡日
      expect(screen.getByText(/2027年1月15日/)).toBeInTheDocument();
    });

    it('プロジェクト情報を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 工事名
      expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
      // 工事場所
      expect(screen.getByText('東京都渋谷区1-1-1')).toBeInTheDocument();
      // 発注者
      expect(screen.getByText('株式会社テスト顧客')).toBeInTheDocument();
    });

    it('その他の入力項目を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 支払条件
      expect(screen.getByText('着工時30%、中間30%、完成時40%')).toBeInTheDocument();
      // 別途工事
      expect(screen.getByText('電気工事、給排水工事')).toBeInTheDocument();
      // その他
      expect(screen.getByText('特になし')).toBeInTheDocument();
      // 監理者
      expect(screen.getByText('監理建築事務所')).toBeInTheDocument();
    });

    it('消費税率を表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // 消費税率 10%
      expect(screen.getByText('10%')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.2, REQ-8.3: ステータス遷移ボタン（双方向）
  // --------------------------------------------------------------------------
  describe('REQ-8.2, REQ-8.3: ステータス遷移', () => {
    it('契約前ステータスの場合、「契約済にする」ボタンを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /契約済にする/ })).toBeInTheDocument();
    });

    it('契約済ステータスの場合、「契約前に戻す」ボタンを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockContractedDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /契約前に戻す/ })).toBeInTheDocument();
    });

    it('「契約済にする」ボタン押下でステータスをCONTRACTEDに更新する', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);
      vi.mocked(contractsApi.updateContractStatus).mockResolvedValue({
        ...mockNewContractDetail,
        status: 'CONTRACTED',
      });

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /契約済にする/ });
      await user.click(button);

      expect(contractsApi.updateContractStatus).toHaveBeenCalledWith('contract-1', 'CONTRACTED');
    });

    it('「契約前に戻す」ボタン押下でステータスをBEFORE_CONTRACTに更新する', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockContractedDetail);
      vi.mocked(contractsApi.updateContractStatus).mockResolvedValue({
        ...mockContractedDetail,
        status: 'BEFORE_CONTRACT',
      });

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /契約前に戻す/ });
      await user.click(button);

      expect(contractsApi.updateContractStatus).toHaveBeenCalledWith(
        'contract-1',
        'BEFORE_CONTRACT'
      );
    });

    it('ステータス更新成功後、表示が更新される', async () => {
      const user = userEvent.setup();
      const updatedContract = { ...mockNewContractDetail, status: 'CONTRACTED' as const };
      vi.mocked(contractsApi.getContractDetail)
        .mockResolvedValueOnce(mockNewContractDetail)
        .mockResolvedValueOnce(updatedContract);
      vi.mocked(contractsApi.updateContractStatus).mockResolvedValue(updatedContract);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByText('契約前')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /契約済にする/ });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('契約済')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.4: 見積書へのリンク
  // --------------------------------------------------------------------------
  describe('REQ-8.4: 見積書リンク', () => {
    it('基となった見積書へのリンクを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      const estimateLink = screen.getByRole('link', { name: /見積書A/ });
      expect(estimateLink).toBeInTheDocument();
      expect(estimateLink).toHaveAttribute('href', '/estimates/estimate-1');
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.5: 基契約書へのリンク（変更契約の場合）
  // --------------------------------------------------------------------------
  describe('REQ-8.5: 基契約書リンク', () => {
    it('変更契約の場合、基となった契約書へのリンクを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockAmendmentContractDetail);

      renderContractDetailPage('contract-2');

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      const parentContractLink = screen.getByTestId('parent-contract-link');
      expect(parentContractLink).toBeInTheDocument();
      expect(parentContractLink).toHaveAttribute(
        'href',
        '/projects/project-1/contracts/contract-1'
      );
    });

    it('新規契約の場合、基契約書リンクを表示しない', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('parent-contract-link')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.6, REQ-8.7: 編集ボタンと編集画面遷移
  // --------------------------------------------------------------------------
  describe('REQ-8.6, REQ-8.7: 編集ボタン', () => {
    it('編集ボタンを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('link', { name: /編集/ });
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveAttribute('href', '/projects/project-1/contracts/contract-1/edit');
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.8: パンくずナビゲーション
  // --------------------------------------------------------------------------
  describe('REQ-8.8: パンくずナビゲーション', () => {
    it('パンくずナビゲーションを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      // パンくずナビゲーションの存在確認
      const nav = screen.getByRole('navigation', { name: /パンくず/ });
      expect(nav).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // ローディング・エラー状態
  // --------------------------------------------------------------------------
  describe('ローディング・エラー状態', () => {
    it('読み込み中にローディング表示する', () => {
      vi.mocked(contractsApi.getContractDetail).mockReturnValue(new Promise(() => {}));

      renderContractDetailPage();

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('エラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(contractsApi.getContractDetail).mockRejectedValue(new Error('API Error'));

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/契約書の取得に失敗しました/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
    });

    it('再試行ボタン押下でデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.getContractDetail)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockNewContractDetail);

      renderContractDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /再試行/ });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByTestId('contract-detail-page')).toBeInTheDocument();
      });

      expect(contractsApi.getContractDetail).toHaveBeenCalledTimes(2);
    });
  });
});
