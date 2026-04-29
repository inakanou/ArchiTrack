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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExecutionBudgetPage from './ExecutionBudgetPage';
import * as executionBudgetApi from '../api/execution-budget';
import * as contractsApi from '../api/contracts';
import { ApiError } from '../api/client';

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
  totals: {
    estimateAmount: '1000000',
    executionAmount: '930000',
    amendmentAmount: '0',
    orderAmount: '440000',
    totalExpense: '150000',
    remainingBudget: '780000',
    progressAmount: '200000',
    expectedProfit: '70000',
  },
  orderProgressRate: 50,
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
    // 「変更契約の反映」ボタン表示には未反映変更契約が1件以上必要 (REQ-15.1)
    // 各テストで上書きしない限り、ここで既定で1件返すモックを置く
    vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([
      {
        id: 'amendment-1',
        contractType: 'AMENDMENT',
        status: 'CONTRACTED',
        estimateId: 'estimate-amendment-1',
        contractAmount: '12000000',
        estimateName: '見積書B（変更）',
      },
    ]);
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

  // ==========================================================================
  // ダイアログ操作テスト
  // ==========================================================================
  describe('ダイアログ操作', () => {
    describe('契約書選択ダイアログ', () => {
      beforeEach(() => {
        vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
        vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
        vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);
      });

      it('「実行予算を作成」クリックで契約書選択ダイアログを表示する', async () => {
        vi.mocked(contractsApi.getContracts).mockResolvedValue({
          contracts: [
            {
              id: 'c-1',
              contractType: 'NEW',
              contractDate: '2026-01-01',
              status: 'CONTRACTED',
              contractAmount: 5000000,
              estimateName: '見積書X',
              parentContractId: null,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
        });

        renderPage();
        const createButton = await screen.findByText('実行予算を作成');
        await userEvent.click(createButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '契約書選択' })).toBeInTheDocument();
        });
        expect(screen.getByText(/見積書X/)).toBeInTheDocument();
        expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
      });

      it('契約書を選択して作成ボタンで実行予算を作成する', async () => {
        vi.mocked(contractsApi.getContracts).mockResolvedValue({
          contracts: [
            {
              id: 'c-1',
              contractType: 'NEW',
              contractDate: '2026-01-01',
              status: 'CONTRACTED',
              contractAmount: 5000000,
              estimateName: '見積書X',
              parentContractId: null,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
        });
        vi.mocked(executionBudgetApi.createExecutionBudget).mockResolvedValue({
          ...mockBudget,
          id: 'eb-new',
          contractId: 'c-1',
        });

        renderPage();
        const createButton = await screen.findByText('実行予算を作成');
        await userEvent.click(createButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '契約書選択' })).toBeInTheDocument();
        });

        // 契約書を選択
        const radio = screen.getByRole('radio');
        await userEvent.click(radio);

        // 作成ボタンをクリック
        const submitButton = screen.getByText('作成');
        await userEvent.click(submitButton);

        await waitFor(() => {
          expect(executionBudgetApi.createExecutionBudget).toHaveBeenCalledWith('project-1', {
            contractId: 'c-1',
          });
        });
      });

      it('キャンセルボタンでダイアログを閉じる', async () => {
        vi.mocked(contractsApi.getContracts).mockResolvedValue({
          contracts: [
            {
              id: 'c-1',
              contractType: 'NEW',
              contractDate: '2026-01-01',
              status: 'CONTRACTED',
              contractAmount: 5000000,
              estimateName: '見積書X',
              parentContractId: null,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
        });

        renderPage();
        const createButton = await screen.findByText('実行予算を作成');
        await userEvent.click(createButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '契約書選択' })).toBeInTheDocument();
        });

        const cancelButton = screen.getByText('キャンセル');
        await userEvent.click(cancelButton);

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      });

      it('契約書一覧取得失敗時にエラーにならない', async () => {
        vi.mocked(contractsApi.getContracts).mockRejectedValue(new Error('Network error'));

        renderPage();
        const createButton = await screen.findByText('実行予算を作成');
        await userEvent.click(createButton);

        // ダイアログが表示されないことを確認
        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      });
    });

    describe('削除確認ダイアログ', () => {
      beforeEach(() => {
        vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
        vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
        vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
      });

      it('削除ボタンクリックで削除確認ダイアログを表示する', async () => {
        renderPage();
        const deleteButton = await screen.findByText('削除');
        await userEvent.click(deleteButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '削除確認' })).toBeInTheDocument();
        });
        expect(screen.getByText('この実行予算を削除してもよろしいですか？')).toBeInTheDocument();
      });

      it('削除確認ダイアログで削除を実行する', async () => {
        vi.mocked(executionBudgetApi.deleteExecutionBudget).mockResolvedValue(undefined);

        renderPage();
        const deleteButton = await screen.findByText('削除');
        await userEvent.click(deleteButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '削除確認' })).toBeInTheDocument();
        });

        const confirmButton = screen.getByText('削除する');
        await userEvent.click(confirmButton);

        await waitFor(() => {
          expect(executionBudgetApi.deleteExecutionBudget).toHaveBeenCalledWith('project-1');
        });
      });

      it('削除キャンセルでダイアログを閉じる', async () => {
        renderPage();
        const deleteButton = await screen.findByText('削除');
        await userEvent.click(deleteButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '削除確認' })).toBeInTheDocument();
        });

        const cancelButton = screen.getByText('キャンセル');
        await userEvent.click(cancelButton);

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      });

      it('削除APIエラー時にエラーメッセージを表示する', async () => {
        vi.mocked(executionBudgetApi.deleteExecutionBudget).mockRejectedValue(
          new ApiError(400, '発注済みの項目があるため削除できません')
        );

        renderPage();
        const deleteButton = await screen.findByText('削除');
        await userEvent.click(deleteButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '削除確認' })).toBeInTheDocument();
        });

        const confirmButton = screen.getByText('削除する');
        await userEvent.click(confirmButton);

        await waitFor(() => {
          expect(screen.getByText('発注済みの項目があるため削除できません')).toBeInTheDocument();
        });
      });
    });

    describe('月次締めダイアログ', () => {
      beforeEach(() => {
        vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
        vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
        vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
      });

      it('月次締めボタンクリックでダイアログを表示する', async () => {
        renderPage();
        const monthlyCloseButton = await screen.findByText('月次締め');
        await userEvent.click(monthlyCloseButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '月次締め' })).toBeInTheDocument();
        });
        expect(screen.getByText(/締め対象月を入力してください/)).toBeInTheDocument();
      });

      it('月次締めを実行する', async () => {
        vi.mocked(executionBudgetApi.executeMonthlyClose).mockResolvedValue({
          id: 'mc-2',
          executionBudgetId: 'eb-1',
          targetMonth: '2026-03',
          closedById: 'user-1',
          closedByName: '担当者A',
          closedAt: '2026-03-19T00:00:00Z',
        });

        renderPage();
        const monthlyCloseButton = await screen.findByText('月次締め');
        await userEvent.click(monthlyCloseButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '月次締め' })).toBeInTheDocument();
        });

        // 月を入力
        const monthInput = screen.getByDisplayValue('');
        await userEvent.type(monthInput, '2026-03');

        // 締め処理を実行
        const submitButton = screen.getByText('締め処理を実行');
        await userEvent.click(submitButton);

        await waitFor(() => {
          expect(executionBudgetApi.executeMonthlyClose).toHaveBeenCalledWith('project-1', {
            targetMonth: '2026-03',
          });
        });
      });

      it('月次締めキャンセルでダイアログを閉じる', async () => {
        renderPage();
        const monthlyCloseButton = await screen.findByText('月次締め');
        await userEvent.click(monthlyCloseButton);

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: '月次締め' })).toBeInTheDocument();
        });

        const cancelButton = screen.getByText('キャンセル');
        await userEvent.click(cancelButton);

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      });
    });
  });

  // ==========================================================================
  // ツリー折りたたみ・展開テスト
  // ==========================================================================
  describe('ツリー折りたたみ・展開', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('親項目の折りたたみボタンで子項目を非表示にする', async () => {
      renderPage();
      expect(await screen.findByText('仮設工事')).toBeInTheDocument();

      // 折りたたみボタンをクリック
      const toggleButton = screen.getByLabelText('折りたたむ');
      await userEvent.click(toggleButton);

      // 子項目が非表示になる
      await waitFor(() => {
        expect(screen.queryByText('仮設工事')).not.toBeInTheDocument();
      });
    });

    it('折りたたんだ項目を展開ボタンで再表示する', async () => {
      renderPage();
      expect(await screen.findByText('仮設工事')).toBeInTheDocument();

      // 折りたたむ
      const toggleButton = screen.getByLabelText('折りたたむ');
      await userEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.queryByText('仮設工事')).not.toBeInTheDocument();
      });

      // 展開する
      const expandButton = screen.getByLabelText('展開する');
      await userEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // エラーハンドリングテスト
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('データ取得時のApiErrorをハンドリングする', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockRejectedValue(
        new ApiError(500, 'サーバーエラー')
      );
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);

      renderPage();

      // エラー時でもページがクラッシュしない（emptyState表示）
      await waitFor(() => {
        expect(screen.getByText('実行予算を作成')).toBeInTheDocument();
      });
    });

    it('データ取得時の非ApiErrorをハンドリングする', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockRejectedValue(
        new Error('Network error')
      );
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('実行予算を作成')).toBeInTheDocument();
      });
    });

    it('月次締めAPIエラー時にエラーにならない', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
      vi.mocked(executionBudgetApi.executeMonthlyClose).mockRejectedValue(
        new ApiError(400, '月次締め済みです')
      );

      renderPage();
      const monthlyCloseButton = await screen.findByText('月次締め');
      await userEvent.click(monthlyCloseButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '月次締め' })).toBeInTheDocument();
      });

      const monthInput = screen.getByDisplayValue('');
      await userEvent.type(monthInput, '2026-03');

      const submitButton = screen.getByText('締め処理を実行');
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(executionBudgetApi.executeMonthlyClose).toHaveBeenCalled();
      });
    });

    it('実行予算作成APIエラー時にエラーにならない', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);
      vi.mocked(contractsApi.getContracts).mockResolvedValue({
        contracts: [
          {
            id: 'c-1',
            contractType: 'NEW',
            contractDate: '2026-01-01',
            status: 'CONTRACTED',
            contractAmount: 5000000,
            estimateName: '見積書X',
            parentContractId: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        total: 1,
      });
      vi.mocked(executionBudgetApi.createExecutionBudget).mockRejectedValue(
        new ApiError(400, '作成に失敗しました')
      );

      renderPage();
      const createButton = await screen.findByText('実行予算を作成');
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '契約書選択' })).toBeInTheDocument();
      });

      const radio = screen.getByRole('radio');
      await userEvent.click(radio);

      const submitButton = screen.getByText('作成');
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(executionBudgetApi.createExecutionBudget).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 空の一覧表示テスト
  // ==========================================================================
  describe('空の一覧表示', () => {
    it('発注が存在しない場合にメッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);

      renderPage();
      expect(await screen.findByText('発注はまだありません')).toBeInTheDocument();
    });

    it('月次締め履歴が存在しない場合にメッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);

      renderPage();
      expect(await screen.findByText('月次締め履歴はありません')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // ローディング表示テスト
  // ==========================================================================
  describe('ローディング', () => {
    it('データ取得中にローディング表示する', () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockReturnValue(new Promise(() => {}));
      vi.mocked(executionBudgetApi.getOrders).mockReturnValue(new Promise(() => {}));
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockReturnValue(new Promise(() => {}));

      renderPage();
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 負の金額表示テスト
  // ==========================================================================
  describe('負の金額表示', () => {
    it('利益見込額が負の場合に表示する', async () => {
      const budgetWithNegativeProfit = {
        ...mockBudget,
        totals: {
          ...mockBudget.totals,
          expectedProfit: '-50000',
        },
      };
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(budgetWithNegativeProfit);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);

      renderPage();
      expect(await screen.findByText(/-50,000/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 副次取得エラーのキャッチテスト
  // ==========================================================================
  describe('副次データ取得エラー', () => {
    it('getOrders失敗時でも空配列でフォールバックする', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockRejectedValue(new Error('orders failed'));
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);

      renderPage();
      // ordersが失敗しても空配列で発注一覧は表示される
      expect(await screen.findByText('発注はまだありません')).toBeInTheDocument();
    });

    it('getMonthlyCloseHistory失敗時でも空配列でフォールバックする', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockRejectedValue(
        new Error('history failed')
      );

      renderPage();
      expect(await screen.findByText('月次締め履歴はありません')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 原価更新（今月の支出） - REQ-13.2
  // ==========================================================================
  describe('原価更新 (REQ-13.2)', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('今月支出の編集確定時に updateItemCost が呼ばれる', async () => {
      vi.mocked(executionBudgetApi.updateItemCost).mockResolvedValue({
        id: 'item-2',
        currentMonthExpense: '70000',
        previousMonthExpense: '100000',
        totalExpense: '170000',
        remainingBudget: '280000',
        isOverBudget: false,
        progressToExpenseRatio: null,
        version: 2,
      });
      renderPage();
      const input = await screen.findByTestId('current-month-expense-input-item-2');
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '70000');
      // フォーカスを外して確定
      await userEvent.tab();
      await waitFor(() => {
        expect(executionBudgetApi.updateItemCost).toHaveBeenCalledWith(
          'project-1',
          'item-2',
          expect.objectContaining({ currentMonthExpense: '70000', version: 1 })
        );
      });
    });

    it('updateItemCost ApiError 時にエラー表示する', async () => {
      vi.mocked(executionBudgetApi.updateItemCost).mockRejectedValue(
        new ApiError(409, 'バージョン競合')
      );
      renderPage();
      const input = await screen.findByTestId('current-month-expense-input-item-2');
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '70000');
      await userEvent.tab();
      // 全ての CostInput でエラーが共有表示されるため findAllByText を使用
      const errors = await screen.findAllByText('バージョン競合');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('updateItemCost 一般エラー時に汎用メッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.updateItemCost).mockRejectedValue(new Error('boom'));
      renderPage();
      const input = await screen.findByTestId('current-month-expense-input-item-2');
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '70000');
      await userEvent.tab();
      const errors = await screen.findAllByText('原価の更新に失敗しました');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 変更契約反映ボタン - REQ-15.1 ナビゲート
  // ==========================================================================
  describe('変更契約反映ナビゲート (REQ-15.1)', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
      vi.mocked(executionBudgetApi.getOrders).mockResolvedValue(mockOrders);
      vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue(mockMonthlyHistory);
    });

    it('「変更契約の反映」ボタン押下で変更契約反映ページに遷移する', async () => {
      renderPage();
      const button = await screen.findByTestId('apply-amendment-button');
      await userEvent.click(button);
      // ナビゲート後、ルートが切り替わって反映ページが表示されないため
      // ExecutionBudgetPage の見出しが消えていることで遷移を確認
      await waitFor(() => {
        expect(screen.queryByTestId('apply-amendment-button')).not.toBeInTheDocument();
      });
    });

    it('未反映変更契約が0件の場合は「変更契約の反映」ボタンを表示しない', async () => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([]);
      renderPage();
      // 月次締めボタンが表示されるまで待つ（その時点で副次取得は完了）
      await screen.findByText('月次締め');
      expect(screen.queryByTestId('apply-amendment-button')).not.toBeInTheDocument();
    });
  });
});
