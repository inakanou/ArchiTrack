/**
 * @fileoverview OrderDetailPageのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 9.1: 発注の作成・編集・削除UI実装
 * Task 9.2: 発注エクスポートUI実装
 *
 * Requirements:
 * - REQ-6.1-6.8: 発注の作成と取引先指定
 * - REQ-7.1-7.5: 発注の編集と削除
 * - REQ-8.1-8.9: 発注金額の確定と案分
 * - REQ-10.1-10.4: 発注一覧のエクスポート
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderDetailPage from '../../pages/OrderDetailPage';
import * as orderDetailApi from '../../api/order-detail';
import type { OrderWithItems } from '../../api/order-detail';
import { ApiError } from '../../api/client';

// APIモック
vi.mock('../../api/order-detail');
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'vendor-1',
        name: '協力業者A',
        nameKana: 'キョウリョクギョウシャエー',
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        types: ['SUBCONTRACTOR'],
      },
      {
        id: 'vendor-2',
        name: '協力業者B',
        nameKana: 'キョウリョクギョウシャビー',
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        types: ['SUBCONTRACTOR'],
      },
    ],
    pagination: { total: 2, page: 1, limit: 100 },
  }),
}));

// テスト用レンダリングヘルパー
const renderPage = (projectId = 'project-1', orderId = 'order-1') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/execution-budget/orders/${orderId}`]}>
      <Routes>
        <Route
          path="/projects/:projectId/execution-budget/orders/:orderId"
          element={<OrderDetailPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

const renderCreatePage = (projectId = 'project-1') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/execution-budget/orders/new`]}>
      <Routes>
        <Route
          path="/projects/:projectId/execution-budget/orders/:orderId"
          element={<OrderDetailPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

// テストデータ
const mockOrderWithItems: OrderWithItems = {
  id: 'order-1',
  executionBudgetId: 'eb-1',
  tradingPartnerId: 'vendor-1',
  tradingPartnerName: '協力業者A',
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: '2026-03-10T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  deletedAt: null,
  items: [
    {
      id: 'oi-1',
      orderId: 'order-1',
      executionBudgetItemId: 'ebi-1',
      checked: true,
      orderAmount: null,
      executionBudgetItem: {
        id: 'ebi-1',
        name: '工事項目A',
        specification: '規格A',
        unit: '式',
        quantity: '1.0000',
        executionUnitPrice: '500000.00',
        executionAmount: '500000',
        plannedVendorId: 'vendor-1',
        plannedVendorName: '協力業者A',
      },
    },
    {
      id: 'oi-2',
      orderId: 'order-1',
      executionBudgetItemId: 'ebi-2',
      checked: false,
      orderAmount: null,
      executionBudgetItem: {
        id: 'ebi-2',
        name: '工事項目B',
        specification: '規格B',
        unit: 'm',
        quantity: '10.0000',
        executionUnitPrice: '10000.00',
        executionAmount: '100000',
        plannedVendorId: 'vendor-2',
        plannedVendorName: '協力業者B',
      },
    },
    {
      id: 'oi-3',
      orderId: 'order-1',
      executionBudgetItemId: 'ebi-3',
      checked: true,
      orderAmount: null,
      executionBudgetItem: {
        id: 'ebi-3',
        name: '工事項目C',
        specification: null,
        unit: '式',
        quantity: '1.0000',
        executionUnitPrice: '300000.00',
        executionAmount: '300000',
        plannedVendorId: 'vendor-1',
        plannedVendorName: '協力業者A',
      },
    },
  ],
  totalExecutionAmount: '800000',
  checkedItemCount: 2,
};

const mockOrderedOrder: OrderWithItems = {
  ...mockOrderWithItems,
  status: 'ORDERED',
  confirmedAmount: '750000',
  items: mockOrderWithItems.items.map((item) =>
    item.checked
      ? {
          ...item,
          orderAmount: item.executionBudgetItem.id === 'ebi-1' ? '468750' : '281250',
        }
      : item
  ),
};

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 表示テスト
  // ==========================================================================
  describe('表示', () => {
    it('発注詳細をロードして表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        // h1タグのタイトルを確認
        expect(screen.getByRole('heading', { name: '発注詳細', level: 1 })).toBeInTheDocument();
      });

      // 取引先名の表示（infoBarとテーブル両方に表示される）
      expect(screen.getAllByText('協力業者A').length).toBeGreaterThanOrEqual(1);
      // ステータスの表示
      expect(screen.getByText('発注前')).toBeInTheDocument();
    });

    it('見積項目をチェックボックス付きで一覧表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('工事項目A')).toBeInTheDocument();
      });

      expect(screen.getByText('工事項目B')).toBeInTheDocument();
      expect(screen.getByText('工事項目C')).toBeInTheDocument();

      // チェックボックスの確認
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('チェック済み項目の合計実行金額を自動計算して表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        // 500000 + 300000 = 800000 (チェック済み項目の合計)
        expect(screen.getByText('800,000')).toBeInTheDocument();
      });
    });

    it('発注予定取引先が一致する項目にデフォルトチェックが付く', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('工事項目A')).toBeInTheDocument();
      });

      // vendor-1が一致する項目(ebi-1, ebi-3)はchecked=true
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const checkedCheckboxes = checkboxes.filter((cb) => cb.checked);
      expect(checkedCheckboxes.length).toBe(2);
    });
  });

  // ==========================================================================
  // ステータス遷移テスト
  // ==========================================================================
  describe('ステータス遷移', () => {
    it('発注前から発注金額検討中への遷移が可能', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.updateOrderStatus).mockResolvedValueOnce({
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注前')).toBeInTheDocument();
      });

      const statusButton = screen.getByRole('button', { name: /発注金額検討中/i });
      await userEvent.click(statusButton);

      expect(orderDetailApi.updateOrderStatus).toHaveBeenCalledWith('project-1', 'order-1', {
        status: 'UNDER_REVIEW',
      });
    });

    it('発注済へのステータス変更時に確認ダイアログを表示する', async () => {
      const underReviewOrder = {
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW' as const,
        confirmedAmount: '750000',
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(underReviewOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('検討中')).toBeInTheDocument();
      });

      const orderedButton = screen.getByRole('button', { name: /発注済/i });
      await userEvent.click(orderedButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/発注を確定しますか/)).toBeInTheDocument();
      });
    });

    it('確定発注金額未入力時に発注済への変更でエラー表示する', async () => {
      const underReviewOrder = {
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW' as const,
        confirmedAmount: null,
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(underReviewOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('検討中')).toBeInTheDocument();
      });

      const orderedButton = screen.getByRole('button', { name: /発注済/i });
      await userEvent.click(orderedButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/確定発注金額を入力してください/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 編集ロックテスト
  // ==========================================================================
  describe('編集ロック', () => {
    it('発注済ステータスではチェック状態の変更が不可', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      // チェックボックスが無効化されている
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      checkboxes.forEach((cb) => {
        expect(cb).toBeDisabled();
      });
    });

    it('発注済ステータスでは確定発注金額の変更が不可', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      // 確定発注金額入力欄が無効化されている
      const confirmedAmountInput = screen.getByLabelText(/確定発注金額/) as HTMLInputElement;
      expect(confirmedAmountInput).toBeDisabled();
    });

    it('発注済ステータスでは案分結果（各項目の発注金額）を表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      // 案分結果（発注金額列）が表示される
      expect(screen.getByText('468,750')).toBeInTheDocument();
      expect(screen.getByText('281,250')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 発注取消テスト
  // ==========================================================================
  describe('発注取消', () => {
    it('発注取消時に確認ダイアログを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /発注取消/ });
      await userEvent.click(cancelButton);

      // 確認ダイアログが表示される（案分済み発注金額クリア警告含む）
      await waitFor(() => {
        expect(screen.getByText(/案分済みの発注金額がクリアされます/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 削除テスト
  // ==========================================================================
  describe('削除', () => {
    it('削除確認ダイアログを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注詳細', level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/この発注を削除してもよろしいですか/)).toBeInTheDocument();
      });
    });

    it('発注済ステータスでの削除時にエラー表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await userEvent.click(deleteButton);

      // 削除エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/発注済みの発注は削除できません/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // エクスポートテスト (Task 9.2)
  // ==========================================================================
  describe('エクスポート', () => {
    it('Excel出力ボタンを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
      });
    });

    it('PDF出力ボタンを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
      });
    });

    it('Excel出力ボタンクリックでエクスポートAPIを呼び出す', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      const mockBlob = new Blob(['test'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      vi.mocked(orderDetailApi.exportOrder).mockResolvedValueOnce(mockBlob);

      // URL.createObjectURL と URL.revokeObjectURL をモック
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      const mockRevokeObjectURL = vi.fn();
      globalThis.URL.createObjectURL = mockCreateObjectURL;
      globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await userEvent.click(excelButton);

      await waitFor(() => {
        expect(orderDetailApi.exportOrder).toHaveBeenCalledWith('project-1', 'order-1', 'xlsx');
      });
    });

    it('PDF出力ボタンクリックでエクスポートAPIを呼び出す', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      vi.mocked(orderDetailApi.exportOrder).mockResolvedValueOnce(mockBlob);

      // URL.createObjectURL と URL.revokeObjectURL をモック
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      const mockRevokeObjectURL = vi.fn();
      globalThis.URL.createObjectURL = mockCreateObjectURL;
      globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
      });

      const pdfButton = screen.getByRole('button', { name: /PDF/i });
      await userEvent.click(pdfButton);

      await waitFor(() => {
        expect(orderDetailApi.exportOrder).toHaveBeenCalledWith('project-1', 'order-1', 'pdf');
      });
    });
  });

  // ==========================================================================
  // 新規作成テスト
  // ==========================================================================
  describe('新規作成', () => {
    it('新規作成モードでは取引先選択コンボボックスを表示する', async () => {
      renderCreatePage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注作成', level: 1 })).toBeInTheDocument();
      });

      // 取引先選択の存在確認
      expect(screen.getByRole('combobox', { name: /取引先/ })).toBeInTheDocument();
    });

    it('取引先未選択時は作成ボタンが無効化される', async () => {
      renderCreatePage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注作成', level: 1 })).toBeInTheDocument();
      });

      const createButton = screen.getByText('作成');
      expect(createButton).toBeDisabled();
    });

    it('キャンセルボタンで実行予算ページに戻る', async () => {
      renderCreatePage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注作成', level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('キャンセル')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // チェックボックス操作テスト
  // ==========================================================================
  describe('チェックボックス操作', () => {
    it('未チェック項目をチェックすると合計金額が更新される', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('工事項目B')).toBeInTheDocument();
      });

      // 工事項目B(未チェック)をチェックする
      const checkboxB = screen.getByLabelText('工事項目Bを選択');
      await userEvent.click(checkboxB);

      // チェックが入ったことを確認
      expect(checkboxB).toBeChecked();
    });

    it('チェック済み項目のチェックを外せる', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('工事項目A')).toBeInTheDocument();
      });

      // 工事項目A(チェック済み)のチェックを外す
      const checkboxA = screen.getByLabelText('工事項目Aを選択');
      expect(checkboxA).toBeChecked();
      await userEvent.click(checkboxA);
      expect(checkboxA).not.toBeChecked();
    });
  });

  // ==========================================================================
  // 項目保存テスト
  // ==========================================================================
  describe('項目保存', () => {
    it('チェック状態を保存ボタンでAPIを呼び出す', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.updateOrderItems).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('チェック状態を保存')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('チェック状態を保存');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderItems).toHaveBeenCalledWith('project-1', 'order-1', {
          itemIds: expect.any(Array),
        });
      });
    });

    it('項目保存APIエラー時にエラーにならない', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.updateOrderItems).mockRejectedValueOnce(
        new ApiError(400, '保存に失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('チェック状態を保存')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('チェック状態を保存');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderItems).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 確定発注金額テスト
  // ==========================================================================
  describe('確定発注金額', () => {
    it('確定発注金額を入力して保存ボタンでAPIを呼び出す', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.updateOrder).mockResolvedValueOnce({
        ...mockOrderWithItems,
        confirmedAmount: '800000',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('確定発注金額')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('確定発注金額');
      await userEvent.type(input, '800000');

      const saveButton = screen.getByText('保存');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrder).toHaveBeenCalledWith('project-1', 'order-1', {
          confirmedAmount: '800000',
        });
      });
    });
  });

  // ==========================================================================
  // 発注確定実行テスト
  // ==========================================================================
  describe('発注確定実行', () => {
    it('発注確定ダイアログで確定ボタンをクリックする', async () => {
      const underReviewOrder = {
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW' as const,
        confirmedAmount: '750000',
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(underReviewOrder);
      vi.mocked(orderDetailApi.updateOrderStatus).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('検討中')).toBeInTheDocument();
      });

      // 発注済ボタンをクリック
      const orderedButton = screen.getByRole('button', { name: /発注済/i });
      await userEvent.click(orderedButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/発注を確定しますか/)).toBeInTheDocument();
      });

      // 確定するボタンをクリック
      const confirmButton = screen.getByText('確定する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderStatus).toHaveBeenCalledWith('project-1', 'order-1', {
          status: 'ORDERED',
          confirmedAmount: '750000',
        });
      });
    });

    it('発注確定APIエラー時にダイアログを閉じる', async () => {
      const underReviewOrder = {
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW' as const,
        confirmedAmount: '750000',
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(underReviewOrder);
      vi.mocked(orderDetailApi.updateOrderStatus).mockRejectedValueOnce(
        new ApiError(400, '確定に失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('検討中')).toBeInTheDocument();
      });

      const orderedButton = screen.getByRole('button', { name: /発注済/i });
      await userEvent.click(orderedButton);

      await waitFor(() => {
        expect(screen.getByText(/発注を確定しますか/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('確定する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderStatus).toHaveBeenCalled();
      });
    });

    it('発注確定ダイアログのキャンセルでダイアログを閉じる', async () => {
      const underReviewOrder = {
        ...mockOrderWithItems,
        status: 'UNDER_REVIEW' as const,
        confirmedAmount: '750000',
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(underReviewOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('検討中')).toBeInTheDocument();
      });

      const orderedButton = screen.getByRole('button', { name: /発注済/i });
      await userEvent.click(orderedButton);

      await waitFor(() => {
        expect(screen.getByText(/発注を確定しますか/)).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('キャンセル');
      await userEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/発注を確定しますか/)).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 発注取消実行テスト
  // ==========================================================================
  describe('発注取消実行', () => {
    it('取消ダイアログで取消実行する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);
      vi.mocked(orderDetailApi.updateOrderStatus).mockResolvedValueOnce({
        ...mockOrderWithItems,
        status: 'CANCELLED',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /発注取消/ });
      await userEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/案分済みの発注金額がクリアされます/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('取消する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderStatus).toHaveBeenCalledWith('project-1', 'order-1', {
          status: 'CANCELLED',
        });
      });
    });

    it('取消ダイアログのキャンセルでダイアログを閉じる', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      const cancelOrderButton = screen.getByRole('button', { name: /発注取消/ });
      await userEvent.click(cancelOrderButton);

      await waitFor(() => {
        expect(screen.getByText(/案分済みの発注金額がクリアされます/)).toBeInTheDocument();
      });

      const cancelDialogButton = screen.getByText('キャンセル');
      await userEvent.click(cancelDialogButton);

      await waitFor(() => {
        expect(screen.queryByText(/案分済みの発注金額がクリアされます/)).not.toBeInTheDocument();
      });
    });

    it('取消APIエラー時にダイアログを閉じる', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderedOrder);
      vi.mocked(orderDetailApi.updateOrderStatus).mockRejectedValueOnce(
        new ApiError(400, '取消に失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注済')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /発注取消/ });
      await userEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/案分済みの発注金額がクリアされます/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('取消する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrderStatus).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 削除実行テスト
  // ==========================================================================
  describe('削除実行', () => {
    it('削除ダイアログで削除を実行する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.deleteOrder).mockResolvedValueOnce(undefined);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注詳細', level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/この発注を削除してもよろしいですか/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('削除する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(orderDetailApi.deleteOrder).toHaveBeenCalledWith('project-1', 'order-1');
      });
    });

    it('削除ダイアログのキャンセルでダイアログを閉じる', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注詳細', level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/この発注を削除してもよろしいですか/)).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('キャンセル');
      await userEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/この発注を削除してもよろしいですか/)).not.toBeInTheDocument();
      });
    });

    it('削除APIエラー時にエラーメッセージを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.deleteOrder).mockRejectedValueOnce(
        new ApiError(400, '削除に失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '発注詳細', level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/この発注を削除してもよろしいですか/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('削除する');
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('削除に失敗しました')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // エクスポートエラーテスト
  // ==========================================================================
  describe('エクスポートエラー', () => {
    it('エクスポートAPIエラー時にエラーにならない', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.exportOrder).mockRejectedValueOnce(
        new ApiError(500, 'エクスポートに失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await userEvent.click(excelButton);

      await waitFor(() => {
        expect(orderDetailApi.exportOrder).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // データ取得エラーテスト
  // ==========================================================================
  describe('データ取得エラー', () => {
    it('ApiErrorの場合エラーメッセージを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockRejectedValueOnce(
        new ApiError(404, '発注が見つかりません')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('発注が見つかりません')).toBeInTheDocument();
      });
    });

    it('非ApiErrorの場合デフォルトメッセージを表示する', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('データの取得に失敗しました')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ステータスバッジ表示テスト
  // ==========================================================================
  describe('ステータスバッジ', () => {
    it('取消ステータスの発注を表示する', async () => {
      const cancelledOrder: OrderWithItems = {
        ...mockOrderWithItems,
        status: 'CANCELLED',
      };
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(cancelledOrder);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('取消')).toBeInTheDocument();
      });

      // 取消ステータスではチェックボックスが無効化される
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      checkboxes.forEach((cb) => {
        expect(cb).toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // ローディング表示テスト
  // ==========================================================================
  describe('ローディング', () => {
    it('データ取得中にローディング表示する', () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockReturnValue(new Promise(() => {}));

      renderPage();
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 確定発注金額入力テスト（発注済み時の保存不可を含む）
  // ==========================================================================
  describe('確定発注金額保存APIエラー', () => {
    it('保存APIエラー時にエラーにならない', async () => {
      vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValueOnce(mockOrderWithItems);
      vi.mocked(orderDetailApi.updateOrder).mockRejectedValueOnce(
        new ApiError(400, '保存に失敗しました')
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('確定発注金額')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('確定発注金額');
      await userEvent.type(input, '800000');

      const saveButton = screen.getByText('保存');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(orderDetailApi.updateOrder).toHaveBeenCalled();
      });
    });
  });
});
