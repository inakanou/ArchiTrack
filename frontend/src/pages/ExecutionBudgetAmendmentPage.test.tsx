/**
 * @fileoverview ExecutionBudgetAmendmentPage のテスト
 *
 * Requirements:
 * - REQ-15.1: 未反映変更契約一覧の表示
 * - REQ-15.2: 見積書項目差分（追加・変更）の表示
 * - REQ-15.3: 反映実行
 * - REQ-15.6: 変更前後の契約金額比較
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExecutionBudgetAmendmentPage from './ExecutionBudgetAmendmentPage';
import * as executionBudgetApi from '../api/execution-budget';
import { ApiError } from '../api/client';

vi.mock('../api/execution-budget');

// useLocation で現在のパスを観測してナビゲート結果を検証する
let lastLocationPath = '';
function LocationProbe() {
  const location = useLocation();
  lastLocationPath = location.pathname;
  return <div data-testid="location-probe">{location.pathname}</div>;
}

const renderPage = (projectId = 'project-1') => {
  lastLocationPath = '';
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/execution-budget/amendments`]}>
      <Routes>
        <Route
          path="/projects/:projectId/execution-budget/amendments"
          element={<ExecutionBudgetAmendmentPage />}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
};

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
  items: [],
  summary: {
    totalEstimateAmount: '10000000',
    totalExecutionAmount: '10000000',
    totalAmendmentAmount: '0',
    totalOrderAmount: '0',
    totalExpense: '0',
    totalRemainingBudget: '10000000',
    totalProgressAmount: '0',
    profitForecast: '0',
    orderProgressRate: '0.0',
  },
};

const mockAmendments: executionBudgetApi.UnreflectedAmendment[] = [
  {
    id: 'amendment-1',
    contractType: 'AMENDMENT',
    status: 'CONTRACTED',
    estimateId: 'estimate-2',
    contractAmount: '12000000',
    estimateName: '見積書B（変更）',
  },
  {
    id: 'amendment-2',
    contractType: 'AMENDMENT',
    status: 'CONTRACTED',
    estimateId: null,
    contractAmount: '8000000',
    estimateName: null,
  },
];

const mockDiffWithItems: executionBudgetApi.AmendmentDiff = {
  contractAmount: '12000000',
  addedItems: [
    {
      estimateItemId: 'ei-add-1',
      name: '追加項目A',
      specification: '規格X',
      unit: '式',
      quantity: '1.0000',
      executionUnitPrice: '500000.00',
      executionAmount: '500000',
    },
  ],
  modifiedItems: [
    {
      budgetItemId: 'bi-mod-1',
      estimateItemId: 'ei-mod-1',
      name: '変更項目A',
      oldQuantity: '1.0000',
      newQuantity: '2.0000',
      oldExecutionAmount: '300000',
      newExecutionAmount: '600000',
    },
  ],
};

const mockDiffEmpty: executionBudgetApi.AmendmentDiff = {
  contractAmount: '10000000',
  addedItems: [],
  modifiedItems: [],
};

describe('ExecutionBudgetAmendmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastLocationPath = '';
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
    vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue(mockAmendments);
    vi.mocked(executionBudgetApi.getAmendmentDiff).mockResolvedValue(mockDiffWithItems);
    vi.mocked(executionBudgetApi.applyAmendment).mockResolvedValue({
      addedCount: 1,
      modifiedCount: 1,
      deletedCount: 0,
      previousContractAmount: '10000000',
      newContractAmount: '12000000',
    });
  });

  describe('初期表示', () => {
    it('ローディング中にスケルトンを表示する', () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockImplementation(
        () => new Promise(() => {})
      );
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockImplementation(
        () => new Promise(() => {})
      );
      renderPage();
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    });

    it('ページタイトルとパンくずを表示する', async () => {
      renderPage();
      expect(await screen.findByRole('heading', { name: '変更契約の反映' })).toBeInTheDocument();
      expect(screen.getByText('プロジェクト')).toBeInTheDocument();
      expect(screen.getByText('実行予算')).toBeInTheDocument();
    });

    it('実行予算に戻るボタンで戻る', async () => {
      const user = userEvent.setup();
      renderPage();
      const backButton = await screen.findByRole('button', { name: '実行予算に戻る' });
      await user.click(backButton);
      await waitFor(() => {
        expect(lastLocationPath).toBe('/projects/project-1/execution-budget');
      });
    });
  });

  describe('未反映変更契約一覧 (REQ-15.1)', () => {
    it('未反映変更契約が0件の場合は空状態を表示する', async () => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([]);
      renderPage();
      expect(await screen.findByTestId('amendment-empty-state')).toBeInTheDocument();
      expect(screen.getByText('未反映の変更契約はありません')).toBeInTheDocument();
    });

    it('未反映変更契約一覧をテーブル表示する', async () => {
      renderPage();
      const table = await screen.findByTestId('unreflected-amendment-table');
      expect(table).toBeInTheDocument();
      expect(within(table).getByText('見積書B（変更）')).toBeInTheDocument();
      expect(within(table).getByText(/12,000,000/)).toBeInTheDocument();
    });

    it('estimateName が null の場合は「(名称なし)」を表示する', async () => {
      renderPage();
      expect(await screen.findByText('(名称なし)')).toBeInTheDocument();
    });

    it('各行に反映ボタンを表示する', async () => {
      renderPage();
      expect(await screen.findByTestId('open-detail-amendment-1')).toBeInTheDocument();
      expect(screen.getByTestId('open-detail-amendment-2')).toBeInTheDocument();
    });

    it('getUnreflectedAmendments 失敗時は空配列として扱う', async () => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockRejectedValue(
        new Error('network')
      );
      renderPage();
      expect(await screen.findByTestId('amendment-empty-state')).toBeInTheDocument();
    });
  });

  describe('初期データ取得失敗', () => {
    it('ApiError 発生時はメッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockRejectedValue(
        new ApiError(500, '実行予算が見つかりません')
      );
      renderPage();
      expect(await screen.findByText('実行予算が見つかりません')).toBeInTheDocument();
    });

    it('一般エラー発生時は汎用メッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockRejectedValue(new Error('boom'));
      renderPage();
      expect(await screen.findByText('データの取得に失敗しました')).toBeInTheDocument();
    });
  });

  describe('詳細ダイアログ (REQ-15.2, 15.6)', () => {
    it('反映ボタン押下で詳細ダイアログを開く', async () => {
      const user = userEvent.setup();
      renderPage();
      const openButton = await screen.findByTestId('open-detail-amendment-1');
      await user.click(openButton);
      expect(await screen.findByRole('dialog', { name: '変更契約反映の確認' })).toBeInTheDocument();
    });

    it('差分取得中はローディングを表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockImplementation(
        () => new Promise(() => {})
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      expect(await screen.findByText('差分を取得中...')).toBeInTheDocument();
    });

    it('変更前後の契約金額と差分（プラス）を表示する', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const before = await screen.findByTestId('before-contract-amount');
      const after = await screen.findByTestId('after-contract-amount');
      const diff = await screen.findByTestId('contract-amount-diff');
      expect(before).toHaveTextContent('10,000,000円');
      expect(after).toHaveTextContent('12,000,000円');
      expect(diff).toHaveTextContent('+2,000,000円');
    });

    it('差分がマイナスの場合は赤色で - 表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockResolvedValue({
        ...mockDiffWithItems,
        contractAmount: '8000000',
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const diff = await screen.findByTestId('contract-amount-diff');
      expect(diff).toHaveTextContent('-2,000,000円');
    });

    it('差分が0の場合は符号なしで表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockResolvedValue({
        ...mockDiffWithItems,
        contractAmount: '10000000',
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const diff = await screen.findByTestId('contract-amount-diff');
      expect(diff).toHaveTextContent('0円');
    });

    it('追加項目テーブルを表示する', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const table = await screen.findByTestId('added-items-table');
      expect(within(table).getByText('追加項目A')).toBeInTheDocument();
      expect(within(table).getByText('規格X')).toBeInTheDocument();
    });

    it('変更項目テーブルを表示する', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const table = await screen.findByTestId('modified-items-table');
      expect(within(table).getByText('変更項目A')).toBeInTheDocument();
    });

    it('追加・変更が0件の場合は「ありません」と表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockResolvedValue(mockDiffEmpty);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      expect(await screen.findByText('追加される項目はありません')).toBeInTheDocument();
      expect(screen.getByText('変更される項目はありません')).toBeInTheDocument();
    });

    it('差分取得 ApiError 時はダイアログ内エラーを表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockRejectedValue(
        new ApiError(404, '差分が見つかりません')
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      expect(await screen.findByText('差分が見つかりません')).toBeInTheDocument();
    });

    it('差分取得一般エラー時は汎用メッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      expect(await screen.findByText('差分の取得に失敗しました')).toBeInTheDocument();
    });

    it('キャンセルボタンでダイアログを閉じる', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('反映実行 (REQ-15.3)', () => {
    it('反映ボタン押下で applyAmendment が呼ばれ一覧が再取得される', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      await screen.findByTestId('contract-amount-comparison');
      await user.click(screen.getByTestId('apply-amendment-confirm'));

      await waitFor(() => {
        expect(executionBudgetApi.applyAmendment).toHaveBeenCalledWith('project-1', 'amendment-1');
      });
      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      // 一覧が再取得される（初回 + 反映後の2回）
      expect(executionBudgetApi.getExecutionBudget).toHaveBeenCalledTimes(2);
      expect(executionBudgetApi.getUnreflectedAmendments).toHaveBeenCalledTimes(2);
    });

    it('反映 ApiError 時はダイアログ内エラーを表示する', async () => {
      vi.mocked(executionBudgetApi.applyAmendment).mockRejectedValue(
        new ApiError(409, '既に反映済みです')
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      await screen.findByTestId('contract-amount-comparison');
      await user.click(screen.getByTestId('apply-amendment-confirm'));
      expect(await screen.findByText('既に反映済みです')).toBeInTheDocument();
      // ダイアログは閉じない
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('反映一般エラー時は汎用メッセージを表示する', async () => {
      vi.mocked(executionBudgetApi.applyAmendment).mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      await screen.findByTestId('contract-amount-comparison');
      await user.click(screen.getByTestId('apply-amendment-confirm'));
      expect(await screen.findByText('反映に失敗しました')).toBeInTheDocument();
    });

    it('反映実行中はボタンが無効化される', async () => {
      let resolveApply: (() => void) | undefined;
      vi.mocked(executionBudgetApi.applyAmendment).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveApply = () =>
              resolve({
                addedCount: 0,
                modifiedCount: 0,
                deletedCount: 0,
                previousContractAmount: '10000000',
                newContractAmount: '12000000',
              });
          })
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByTestId('open-detail-amendment-1'));
      await screen.findByTestId('contract-amount-comparison');
      await user.click(screen.getByTestId('apply-amendment-confirm'));
      expect(await screen.findByText('反映中...')).toBeInTheDocument();
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      expect(cancelButton).toBeDisabled();
      resolveApply?.();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('金額フォーマット', () => {
    it('null/空文字の契約金額は空文字として扱う', async () => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([
        {
          id: 'amendment-null',
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          estimateId: null,
          contractAmount: null,
          estimateName: '金額未設定契約',
        },
      ]);
      renderPage();
      const row = await screen.findByTestId('amendment-row-amendment-null');
      // 契約金額セルは「円」のみ
      expect(within(row).getByText('円')).toBeInTheDocument();
    });

    it('数値変換不能な金額は空文字として扱う', async () => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([
        {
          id: 'amendment-nan',
          contractType: 'AMENDMENT',
          status: 'CONTRACTED',
          estimateId: null,
          contractAmount: 'invalid',
          estimateName: '不正な金額契約',
        },
      ]);
      renderPage();
      const row = await screen.findByTestId('amendment-row-amendment-nan');
      expect(within(row).getByText('円')).toBeInTheDocument();
    });
  });
});
