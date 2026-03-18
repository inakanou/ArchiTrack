/**
 * @fileoverview ExecutionBudgetPageのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 * Task 8.2: 実行予算項目一覧のツリー表示と編集UI実装
 * Task 8.3: 発注一覧セクションと原価入力UI実装
 * Task 8.4: 月次締めUIと変更契約反映UI実装
 *
 * Requirements:
 * - REQ-1.1-1.7: 実行予算の作成
 * - REQ-2.1-2.3: 実行予算の削除
 * - REQ-3.1-3.10: 実行予算項目一覧表示
 * - REQ-4.1-4.5: 実行予算項目の編集
 * - REQ-5.1-5.3: 発注一覧表示
 * - REQ-13.1-13.8: 原価管理
 * - REQ-14.1-14.5: 月次締め
 * - REQ-15.1-15.8: 契約変更反映
 * - REQ-18.2, 18.4, 18.5: 数値表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExecutionBudgetPage from './ExecutionBudgetPage';
import * as executionBudgetApi from '../api/execution-budget';

// APIモック
vi.mock('../api/execution-budget');
vi.mock('../api/contracts');
vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

// テスト用レンダリングヘルパー
const renderPage = (projectId = 'project-1') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/execution-budget`]}>
      <Routes>
        <Route path="/projects/:projectId/execution-budget" element={<ExecutionBudgetPage />} />
      </Routes>
    </MemoryRouter>
  );
};

// テストデータ
const mockBudget: executionBudgetApi.ExecutionBudgetWithItems = {
  id: 'eb-1',
  projectId: 'project-1',
  contractId: 'contract-1',
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  deletedAt: null,
  contract: {
    id: 'contract-1',
    contractDate: '2026-01-15',
    contractAmount: 10000000,
    estimate: { id: 'estimate-1', name: '見積書A' },
  },
  items: [
    {
      id: 'item-1',
      executionBudgetId: 'eb-1',
      estimateItemId: 'ei-1',
      parentId: null,
      displayOrder: 1,
      name: '直接工事費',
      specification: null,
      unit: null,
      quantity: null,
      estimateUnitPrice: null,
      estimateAmount: null,
      executionUnitPrice: null,
      executionAmount: null,
      amendmentAmount: '0',
      previousMonthExpense: '0',
      currentMonthExpense: '0',
      plannedVendorId: null,
      plannedVendorName: null,
      amendmentStatus: null,
      remarks: null,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      orderStatus: null,
      orderAmount: null,
      progressAmount: null,
      progressRate: null,
      children: [
        {
          id: 'item-2',
          executionBudgetId: 'eb-1',
          estimateItemId: 'ei-2',
          parentId: 'item-1',
          displayOrder: 1,
          name: '仮設工事',
          specification: '規格A',
          unit: '式',
          quantity: '1.0000',
          estimateUnitPrice: '500000.00',
          estimateAmount: '500000',
          executionUnitPrice: '450000.00',
          executionAmount: '450000',
          amendmentAmount: '0',
          previousMonthExpense: '100000',
          currentMonthExpense: '50000',
          plannedVendorId: 'vendor-1',
          plannedVendorName: '協力業者A',
          amendmentStatus: null,
          remarks: 'テスト備考',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
          orderStatus: 'ORDERED',
          orderAmount: '440000',
          progressAmount: '200000',
          progressRate: '44.4',
        },
        {
          id: 'item-3',
          executionBudgetId: 'eb-1',
          estimateItemId: 'ei-3',
          parentId: 'item-1',
          displayOrder: 2,
          name: '土工事',
          specification: '規格B',
          unit: 'm3',
          quantity: '10.0000',
          estimateUnitPrice: '50000.00',
          estimateAmount: '500000',
          executionUnitPrice: '48000.00',
          executionAmount: '480000',
          amendmentAmount: '0',
          previousMonthExpense: '0',
          currentMonthExpense: '0',
          plannedVendorId: 'vendor-2',
          plannedVendorName: '協力業者B',
          amendmentStatus: null,
          remarks: null,
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
          orderStatus: null,
          orderAmount: null,
          progressAmount: null,
          progressRate: null,
        },
      ],
    },
  ],
  summary: {
    totalEstimateAmount: '1000000',
    totalExecutionAmount: '930000',
    totalAmendmentAmount: '0',
    totalOrderAmount: '440000',
    totalExpense: '150000',
    totalRemainingBudget: '780000',
    totalProgressAmount: '200000',
    profitForecast: '70000',
    orderProgressRate: '50.0',
  },
};

const mockOrders: executionBudgetApi.OrderSummary[] = [
  {
    id: 'order-1',
    tradingPartnerName: '協力業者A',
    status: 'ORDERED',
    checkedItemCount: 1,
    totalExecutionAmount: '450000',
    confirmedAmount: '440000',
    createdAt: '2026-03-10T00:00:00Z',
  },
];

const mockMonthlyHistory: executionBudgetApi.MonthlyCloseHistory[] = [
  {
    id: 'mc-1',
    executionBudgetId: 'eb-1',
    targetMonth: '2026-02',
    closedById: 'user-1',
    closedByName: '担当者A',
    closedAt: '2026-03-01T00:00:00Z',
  },
];

describe('ExecutionBudgetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 8.1: 作成・表示・削除
  // ==========================================================================
  describe('実行予算が存在しない場合', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);
    });

    it('「実行予算を作成」ボタンを表示する', async () => {
      renderPage();
      expect(await screen.findByText('実行予算を作成')).toBeInTheDocument();
    });

    it('契約書選択ダイアログを表示するボタンがある', async () => {
      renderPage();
      const createButton = await screen.findByText('実行予算を作成');
      expect(createButton).toBeInTheDocument();
    });
  });

  describe('実行予算が存在する場合', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('契約書名と契約金額を表示する', async () => {
      renderPage();
      expect(await screen.findByText('見積書A')).toBeInTheDocument();
      expect(screen.getByText(/10,000,000/)).toBeInTheDocument();
    });

    it('削除ボタンを表示する', async () => {
      renderPage();
      expect(await screen.findByText('削除')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 8.2: ツリー表示と編集
  // ==========================================================================
  describe('実行予算項目一覧', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('親項目を表示する', async () => {
      renderPage();
      expect(await screen.findByText('直接工事費')).toBeInTheDocument();
    });

    it('子項目を表示する', async () => {
      renderPage();
      expect(await screen.findByText('仮設工事')).toBeInTheDocument();
      expect(screen.getByText('土工事')).toBeInTheDocument();
    });

    it('金額を3桁区切りカンマ付きで表示する', async () => {
      renderPage();
      const amounts = await screen.findAllByText('450,000');
      expect(amounts.length).toBeGreaterThanOrEqual(1);
    });

    it('発注済み項目に発注ステータスを表示する', async () => {
      renderPage();
      const badges = await screen.findAllByText('発注済');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('発注済み項目の発注金額を表示する', async () => {
      renderPage();
      const amounts = await screen.findAllByText('440,000');
      expect(amounts.length).toBeGreaterThanOrEqual(1);
    });

    it('発注予定取引先を読み取り専用で表示する', async () => {
      renderPage();
      const vendors = await screen.findAllByText('協力業者A');
      expect(vendors.length).toBeGreaterThanOrEqual(1);
    });

    it('出来高率を小数点以下1桁で表示する', async () => {
      renderPage();
      expect(await screen.findByText('44.4%')).toBeInTheDocument();
    });

    it('合計行を表示する', async () => {
      renderPage();
      expect(await screen.findByText('合計')).toBeInTheDocument();
    });

    it('利益見込額を表示する', async () => {
      renderPage();
      expect(await screen.findByText(/利益見込額/)).toBeInTheDocument();
      expect(screen.getByText(/70,000/)).toBeInTheDocument();
    });

    it('発注進捗率を表示する', async () => {
      renderPage();
      expect(await screen.findByText(/発注進捗率/)).toBeInTheDocument();
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 8.3: 発注一覧セクション
  // ==========================================================================
  describe('発注一覧セクション', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('発注一覧セクションのタイトルを表示する', async () => {
      renderPage();
      expect(await screen.findByText('発注一覧')).toBeInTheDocument();
    });

    it('発注取引先名を表示する', async () => {
      renderPage();
      // 項目一覧にも「協力業者A」があるので、発注一覧セクション内で確認
      const orders = await screen.findAllByText('協力業者A');
      expect(orders.length).toBeGreaterThanOrEqual(1);
    });

    it('発注ステータスを表示する', async () => {
      renderPage();
      const statuses = await screen.findAllByText('発注済');
      expect(statuses.length).toBeGreaterThanOrEqual(1);
    });

    it('確定発注金額を表示する', async () => {
      renderPage();
      const amounts = await screen.findAllByText(/440,000/);
      expect(amounts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Task 8.4: 月次締め・変更契約反映
  // ==========================================================================
  describe('月次締めUI', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('月次締めボタンを表示する', async () => {
      renderPage();
      expect(await screen.findByText('月次締め')).toBeInTheDocument();
    });

    it('月次締め履歴を表示する', async () => {
      renderPage();
      expect(await screen.findByText('2026-02')).toBeInTheDocument();
    });
  });

  describe('変更契約反映UI', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('「変更契約の反映」ボタンを表示する', async () => {
      renderPage();
      expect(await screen.findByText('変更契約の反映')).toBeInTheDocument();
    });
  });
});
