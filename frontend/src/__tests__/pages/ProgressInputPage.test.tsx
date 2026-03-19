/**
 * @fileoverview ProgressInputPageのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 10.1: 出来高入力UI実装
 * Task 10.2: 出来高履歴管理UI実装
 * Task 10.3: 月別出来高集計UI実装
 *
 * Requirements:
 * - REQ-11.1-11.11: 出来高入力機能
 * - REQ-12.3-12.6: 出来高の履歴管理
 * - REQ-16.1-16.5: 月別出来高集計
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProgressInputPage from '../../pages/ProgressInputPage';
import * as progressApi from '../../api/progress';
import * as executionBudgetApi from '../../api/execution-budget';

// APIモック
vi.mock('../../api/progress');
vi.mock('../../api/execution-budget');
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    addToast: vi.fn(),
    removeToast: vi.fn(),
    toasts: [],
  }),
}));

// テスト用レンダリングヘルパー
const renderPage = (projectId = 'project-1') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/execution-budget/progress`]}>
      <Routes>
        <Route
          path="/projects/:projectId/execution-budget/progress"
          element={<ProgressInputPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

// テストデータ: 実行予算（項目付き）
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
          remarks: null,
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

// テストデータ: 出来高履歴
const mockProgressHistory: progressApi.ProgressRecordSummary[] = [
  {
    id: 'pr-1',
    executionBudgetId: 'eb-1',
    constructionDate: '2026-03-15',
    totalAmount: '200000',
    totalRate: '21.5',
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:00:00Z',
  },
  {
    id: 'pr-2',
    executionBudgetId: 'eb-1',
    constructionDate: '2026-03-10',
    totalAmount: '100000',
    totalRate: '10.8',
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
  },
];

// テストデータ: 出来高レコード（項目付き）
const mockProgressRecord: progressApi.ProgressRecordWithItems = {
  id: 'pr-1',
  executionBudgetId: 'eb-1',
  constructionDate: '2026-03-15',
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:00:00Z',
  items: [
    {
      id: 'pri-1',
      progressRecordId: 'pr-1',
      executionBudgetItemId: 'item-2',
      amount: '200000',
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T10:00:00Z',
    },
    {
      id: 'pri-2',
      progressRecordId: 'pr-1',
      executionBudgetItemId: 'item-3',
      amount: '0',
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T10:00:00Z',
    },
  ],
  totalAmount: '200000',
  totalRate: '21.5',
};

// テストデータ: 月別出来高集計
const mockMonthlySummary: progressApi.MonthlyProgressSummary[] = [
  {
    yearMonth: '2026-03',
    monthlyAmount: '200000',
    cumulativeAmount: '200000',
    cumulativeRate: '21.5',
  },
  {
    yearMonth: '2026-02',
    monthlyAmount: '100000',
    cumulativeAmount: '100000',
    cumulativeRate: '10.8',
  },
];

// テストデータ: 月別出来高明細
const mockMonthlyDetail: progressApi.MonthlyProgressDetailItem[] = [
  {
    executionBudgetItemId: 'item-2',
    itemName: '仮設工事',
    executionAmount: '450000',
    progressAmount: '200000',
    progressRate: '44.4',
  },
  {
    executionBudgetItemId: 'item-3',
    itemName: '土工事',
    executionAmount: '480000',
    progressAmount: '0',
    progressRate: '0.0',
  },
];

describe('ProgressInputPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトのモック設定
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
    vi.mocked(progressApi.getProgressHistory).mockResolvedValue(mockProgressHistory);
    vi.mocked(progressApi.getMonthlyProgress).mockResolvedValue(mockMonthlySummary);
  });

  // ==========================================================================
  // Task 10.1: 出来高入力UI実装
  // ==========================================================================

  describe('Task 10.1: 出来高入力UI', () => {
    it('ページタイトルとパンくずリストが表示される', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: '出来高入力' })).toBeInTheDocument();
      });
    });

    it('REQ-11.2: 施工日のカレンダー選択入力が表示される', async () => {
      renderPage();

      await waitFor(() => {
        const dateInput = screen.getByLabelText('施工日');
        expect(dateInput).toBeInTheDocument();
        expect(dateInput).toHaveAttribute('type', 'date');
      });
    });

    it('REQ-11.1: 各見積項目の出来高金額入力欄が表示される', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
        expect(screen.getByText('土工事')).toBeInTheDocument();
      });

      // 出来高金額入力欄の存在を確認（リーフ項目のみ）
      const amountInputs = screen.getAllByRole('spinbutton');
      expect(amountInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('REQ-11.3: 即0%ボタンを押下すると出来高金額が0円に設定される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      // 仮設工事の行にある「0%」ボタンをクリック
      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();
      const zeroButton = within(row!).getByRole('button', { name: '0%' });
      await user.click(zeroButton);

      // 出来高金額が0に設定されることを確認
      const amountInput = within(row!).getByRole('spinbutton');
      expect(amountInput).toHaveValue(0);
    });

    it('REQ-11.4: 即50%ボタンを押下すると出来高金額が実行金額の50%に設定される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();
      const fiftyButton = within(row!).getByRole('button', { name: '50%' });
      await user.click(fiftyButton);

      // 実行金額450000の50% = 225000
      await waitFor(() => {
        const amountInput = within(row!).getByRole('spinbutton');
        expect(amountInput).toHaveValue(225000);
      });
    });

    it('REQ-11.5: 即100%ボタンを押下すると出来高金額が実行金額の100%に設定される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();
      const hundredButton = within(row!).getByRole('button', { name: '100%' });
      await user.click(hundredButton);

      // 実行金額450000の100% = 450000
      await waitFor(() => {
        const amountInput = within(row!).getByRole('spinbutton');
        expect(amountInput).toHaveValue(450000);
      });
    });

    it('REQ-11.6: +5%ボタンを押下すると出来高金額が現在値に実行金額の5%を加算した値に更新される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();

      // まず50%に設定
      const fiftyButton = within(row!).getByRole('button', { name: '50%' });
      await user.click(fiftyButton);

      // +5%ボタンをクリック
      const plusButton = within(row!).getByRole('button', { name: '+5%' });
      await user.click(plusButton);

      // 225000 + 450000*0.05 = 225000 + 22500 = 247500
      await waitFor(() => {
        const amountInput = within(row!).getByRole('spinbutton');
        expect(amountInput).toHaveValue(247500);
      });
    });

    it('REQ-11.7: -5%ボタンを押下すると出来高金額が現在値から実行金額の5%を減算した値に更新される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();

      // まず50%に設定
      const fiftyButton = within(row!).getByRole('button', { name: '50%' });
      await user.click(fiftyButton);

      // -5%ボタンをクリック
      const minusButton = within(row!).getByRole('button', { name: '-5%' });
      await user.click(minusButton);

      // 225000 - 450000*0.05 = 225000 - 22500 = 202500
      await waitFor(() => {
        const amountInput = within(row!).getByRole('spinbutton');
        expect(amountInput).toHaveValue(202500);
      });
    });

    it('REQ-11.8: 出来高金額が0円未満にならないようバリデーションする', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();

      // 0%に設定してから-5%を押す
      const zeroButton = within(row!).getByRole('button', { name: '0%' });
      await user.click(zeroButton);

      const minusButton = within(row!).getByRole('button', { name: '-5%' });
      await user.click(minusButton);

      // 0円未満にならず、0円のままであること
      const amountInput = within(row!).getByRole('spinbutton');
      expect(amountInput).toHaveValue(0);
    });

    it('REQ-11.9: 出来高金額の直接入力ができる', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();
      const amountInput = within(row!).getByRole('spinbutton');

      await user.clear(amountInput);
      await user.type(amountInput, '300000');

      await waitFor(() => {
        expect(amountInput).toHaveValue(300000);
      });
    });

    it('REQ-11.10: 各項目の出来高率（出来高金額 / 実行金額 x 100）が自動計算表示される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();

      // 50%ボタンを押す
      const fiftyButton = within(row!).getByRole('button', { name: '50%' });
      await user.click(fiftyButton);

      // 出来高率が50.0%と表示される
      await waitFor(() => {
        expect(within(row!).getByText('50.0%')).toBeInTheDocument();
      });
    });

    it('REQ-11.11: 全項目の出来高合計金額と出来高合計率が表示される', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      // 仮設工事を50%に設定
      const row1 = screen.getByText('仮設工事').closest('tr');
      expect(row1).not.toBeNull();
      const fiftyButton = within(row1!).getByRole('button', { name: '50%' });
      await user.click(fiftyButton);

      // 合計行を確認
      await waitFor(() => {
        // 合計金額: 225000（仮設工事50%） + 0（土工事）= 225000
        expect(screen.getByTestId('total-amount')).toHaveTextContent('225,000');
        // 合計率: 225000 / 930000 * 100 = 24.2%
        expect(screen.getByTestId('total-rate')).toHaveTextContent('24.2%');
      });
    });

    it('REQ-11.1, 12.1: 保存操作でAPIを呼び出し、施工日と各項目の出来高金額を送信する', async () => {
      const user = userEvent.setup();
      vi.mocked(progressApi.saveProgress).mockResolvedValue(mockProgressRecord);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('仮設工事')).toBeInTheDocument();
      });

      // 施工日を入力
      const dateInput = screen.getByLabelText('施工日');
      fireEvent.change(dateInput, { target: { value: '2026-03-18' } });

      // 仮設工事を100%に設定
      const row = screen.getByText('仮設工事').closest('tr');
      expect(row).not.toBeNull();
      const hundredButton = within(row!).getByRole('button', { name: '100%' });
      await user.click(hundredButton);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(progressApi.saveProgress).toHaveBeenCalledWith('project-1', {
          constructionDate: '2026-03-18',
          items: expect.arrayContaining([
            expect.objectContaining({ itemId: 'item-2', amount: '450000' }),
            expect.objectContaining({ itemId: 'item-3', amount: '0' }),
          ]),
        });
      });
    });
  });

  // ==========================================================================
  // Task 10.2: 出来高履歴管理UI実装
  // ==========================================================================

  describe('Task 10.2: 出来高履歴管理UI', () => {
    it('REQ-12.3: 出来高履歴一覧が施工日の降順で表示される', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('出来高履歴')).toBeInTheDocument();
      });

      // 履歴一覧が施工日の降順で表示される
      const historyRows = screen.getAllByTestId(/^history-row-/);
      expect(historyRows.length).toBe(2);
      // 最初の行が最新の施工日
      expect(within(historyRows[0]!).getByText('2026-03-15')).toBeInTheDocument();
      expect(within(historyRows[1]!).getByText('2026-03-10')).toBeInTheDocument();
    });

    it('REQ-12.4: 過去の出来高レコード選択により編集画面に読み込まれる', async () => {
      const user = userEvent.setup();
      vi.mocked(progressApi.getProgressByDate).mockResolvedValue(mockProgressRecord);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('出来高履歴')).toBeInTheDocument();
      });

      // 最初の履歴行をクリック
      const historyRows = screen.getAllByTestId(/^history-row-/);
      await user.click(historyRows[0]!);

      // APIが呼ばれることを確認
      await waitFor(() => {
        expect(progressApi.getProgressByDate).toHaveBeenCalledWith('project-1', '2026-03-15');
      });

      // 施工日が設定されることを確認
      await waitFor(() => {
        const dateInput = screen.getByLabelText('施工日');
        expect(dateInput).toHaveValue('2026-03-15');
      });

      // 仮設工事の出来高金額が読み込まれることを確認
      await waitFor(() => {
        const row = screen.getByText('仮設工事').closest('tr');
        expect(row).not.toBeNull();
        const amountInput = within(row!).getByRole('spinbutton');
        expect(amountInput).toHaveValue(200000);
      });
    });

    it('REQ-12.5: 出来高レコードの削除確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      vi.mocked(progressApi.deleteProgress).mockResolvedValue();

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('出来高履歴')).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const historyRows = screen.getAllByTestId(/^history-row-/);
      const deleteButton = within(historyRows[0]!).getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText('出来高レコードを削除しますか？')).toBeInTheDocument();
      });
    });

    it('REQ-12.6: 削除確認ダイアログで「削除」を押すと出来高レコードが削除される', async () => {
      const user = userEvent.setup();
      vi.mocked(progressApi.deleteProgress).mockResolvedValue();
      vi.mocked(progressApi.getProgressHistory)
        .mockResolvedValueOnce(mockProgressHistory)
        .mockResolvedValueOnce([mockProgressHistory[1]!]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('出来高履歴')).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const historyRows = screen.getAllByTestId(/^history-row-/);
      const deleteButton = within(historyRows[0]!).getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      // 確認ダイアログで「削除」をクリック
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(progressApi.deleteProgress).toHaveBeenCalledWith('project-1', 'pr-1');
      });
    });
  });

  // ==========================================================================
  // Task 10.3: 月別出来高集計UI実装
  // ==========================================================================

  describe('Task 10.3: 月別出来高集計UI', () => {
    it('REQ-16.1, 16.2: 月別出来高一覧が表示される', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('月別出来高集計')).toBeInTheDocument();
      });

      // 月別一覧のカラムが表示される
      expect(screen.getByText('対象月')).toBeInTheDocument();
      expect(screen.getByText('当月出来高金額')).toBeInTheDocument();
      expect(screen.getByText('累計出来高金額')).toBeInTheDocument();
      expect(screen.getByText('累計出来高率')).toBeInTheDocument();

      // データが表示される
      await waitFor(() => {
        const monthlyRows = screen.getAllByTestId(/^monthly-row-/);
        expect(monthlyRows.length).toBe(2);
        expect(within(monthlyRows[0]!).getByText('2026-03')).toBeInTheDocument();
      });
    });

    it('REQ-16.3: 特定月選択により項目別出来高明細が表示される', async () => {
      const user = userEvent.setup();
      vi.mocked(progressApi.getMonthlyProgressDetail).mockResolvedValue(mockMonthlyDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('月別出来高集計')).toBeInTheDocument();
      });

      // 月をクリック
      const monthlyRows = screen.getAllByTestId(/^monthly-row-/);
      await user.click(monthlyRows[0]!);

      await waitFor(() => {
        expect(progressApi.getMonthlyProgressDetail).toHaveBeenCalledWith('project-1', '2026-03');
      });

      // 明細セクションのヘッダーが表示される
      await waitFor(() => {
        expect(screen.getByText('2026-03 項目別出来高明細')).toBeInTheDocument();
      });
    });

    it('REQ-16.4: Excelエクスポートボタンが表示されクリックでAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });
      vi.mocked(progressApi.exportMonthlyProgress).mockResolvedValue(mockBlob);

      // URL.createObjectURL のモック
      const createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('月別出来高集計')).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/ });
      await user.click(excelButton);

      await waitFor(() => {
        expect(progressApi.exportMonthlyProgress).toHaveBeenCalledWith('project-1', 'xlsx');
      });
    });

    it('REQ-16.5: PDFエクスポートボタンが表示されクリックでAPIが呼ばれる', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      vi.mocked(progressApi.exportMonthlyProgress).mockResolvedValue(mockBlob);

      const createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('月別出来高集計')).toBeInTheDocument();
      });

      const pdfButton = screen.getByRole('button', { name: /PDF/ });
      await user.click(pdfButton);

      await waitFor(() => {
        expect(progressApi.exportMonthlyProgress).toHaveBeenCalledWith('project-1', 'pdf');
      });
    });
  });
});
