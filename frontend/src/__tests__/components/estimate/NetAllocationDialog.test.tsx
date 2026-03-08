/**
 * @fileoverview NetAllocationDialog テスト
 *
 * Requirements (estimate-creation):
 * - REQ-18.1-REQ-18.9: NET金額案分ダイアログの各機能
 * - REQ-31.1-REQ-31.2: 受領見積書情報表示
 * - REQ-33.1: 選択済み案分対象行の合計金額表示
 * - REQ-33.2: チェック変更時の合計金額再計算
 * - REQ-33.3: 全チェックOFF時に0円表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetAllocationDialog } from '../../../components/estimate/NetAllocationDialog';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';

// apiClientをモック
vi.mock('../../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// received-quotationsをモック
vi.mock('../../../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn().mockResolvedValue([]),
}));

import { apiClient } from '../../../api/client';
import { getReceivedQuotationsByProject } from '../../../api/received-quotations';

const mockApiPost = vi.mocked(apiClient.post);
const mockGetQuotations = vi.mocked(getReceivedQuotationsByProject);

const createMockItems = (): EstimateItemHierarchyEdit[] => [
  {
    id: 'item-1',
    estimateId: 'est-1',
    parentId: null,
    displayOrder: 0,
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    lines: [
      {
        id: 'line-e-1',
        estimateItemId: 'item-1',
        lineType: 'ESTIMATE',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '100000',
        amount: '100000',
        remarks: null,
      },
      {
        id: 'line-x-1',
        estimateItemId: 'item-1',
        lineType: 'EXECUTION',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '90000',
        amount: '90000',
        remarks: null,
      },
      {
        id: 'line-v-1',
        estimateItemId: 'item-1',
        lineType: 'VENDOR',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '80000',
        amount: '80000',
        remarks: null,
        sourceVendorName: '業者A',
      },
    ],
    children: [],
  },
  {
    id: 'item-2',
    estimateId: 'est-1',
    parentId: null,
    displayOrder: 1,
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    lines: [
      {
        id: 'line-e-2',
        estimateItemId: 'item-2',
        lineType: 'ESTIMATE',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '50000',
        amount: '50000',
        remarks: null,
      },
      {
        id: 'line-x-2',
        estimateItemId: 'item-2',
        lineType: 'EXECUTION',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '45000',
        amount: '45000',
        remarks: null,
      },
      {
        id: 'line-v-2',
        estimateItemId: 'item-2',
        lineType: 'VENDOR',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '40000',
        amount: '40000',
        remarks: null,
        sourceVendorName: '業者A',
      },
    ],
    children: [],
  },
];

describe('NetAllocationDialog', () => {
  const defaultProps = {
    isOpen: true,
    estimateId: 'est-1',
    projectId: 'proj-1',
    items: createMockItems(),
    onClose: vi.fn(),
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=falseの場合は何も表示しない', () => {
    const { container } = render(<NetAllocationDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される (REQ-18.2)', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('業者金額を実行金額に転記（NET金額案分）')).toBeInTheDocument();
  });

  it('対象業者のドロップダウンが表示される (REQ-18.3)', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    const select = screen.getByLabelText('対象業者を選択');
    expect(select).toBeInTheDocument();
    expect(select.tagName.toLowerCase()).toBe('select');
  });

  it('業者名がドロップダウンに表示される', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options.length).toBe(2); // 「選択してください」+ 業者A
    expect(options[1]).toHaveTextContent('業者A');
  });

  it('業者選択後に業者金額行一覧が表示される (REQ-18.4)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    expect(screen.getByText('外壁塗装')).toBeInTheDocument();
    expect(screen.getByText('防水工事')).toBeInTheDocument();
    expect(screen.getByText('80,000円')).toBeInTheDocument();
    expect(screen.getByText('40,000円')).toBeInTheDocument();
  });

  it('チェックボックスで諸経費行を除外できる (REQ-18.5)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();

    // チェックを外す
    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    // 再度チェックする
    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
  });

  it('NET金額入力フィールドが業者選択後に表示される (REQ-18.6)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    // 業者未選択時はNET金額フィールドが表示されない
    expect(screen.queryByLabelText('NET金額')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    expect(screen.getByLabelText('NET金額')).toBeInTheDocument();
  });

  it('NET金額入力で案分プレビューが表示される (REQ-18.7)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), '100000');

    expect(screen.getByText('案分プレビュー')).toBeInTheDocument();
    // 案分率の列ヘッダー
    expect(screen.getByText('案分率')).toBeInTheDocument();
    expect(screen.getByText('案分後金額')).toBeInTheDocument();
  });

  it('不正なNET金額ではプレビューが表示されない', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), 'abc');

    expect(screen.queryByText('案分プレビュー')).not.toBeInTheDocument();
  });

  it('案分実行ボタンが押せる (REQ-18.8)', async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValueOnce({});

    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), '100000');

    const submitButton = screen.getByRole('button', { name: '案分実行' });
    expect(submitButton).not.toBeDisabled();

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/estimates/est-1/calculate-net', {
        vendorName: '業者A',
        targetLineIds: ['line-v-1', 'line-v-2'],
        excludeLineIds: [],
        netAmount: '100000',
      });
    });

    expect(defaultProps.onComplete).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('フォームが無効な場合は案分実行ボタンが無効', () => {
    render(<NetAllocationDialog {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: '案分実行' });
    expect(submitButton).toBeDisabled();
  });

  it('送信中は「案分実行中...」と表示される (REQ-18.9)', async () => {
    const user = userEvent.setup();
    mockApiPost.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), '100000');
    await user.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '案分実行中...' })).toBeDisabled();
    });
  });

  it('キャンセルボタンでonCloseが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('API呼び出しが失敗してもエラーハンドリングされる', async () => {
    const user = userEvent.setup();
    mockApiPost.mockRejectedValueOnce(new Error('API Error'));

    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), '100000');
    await user.click(screen.getByRole('button', { name: '案分実行' }));

    // エラーが発生してもクラッシュしない
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '案分実行' })).not.toBeDisabled();
    });
  });

  it('除外した行はAPI呼び出しに含まれない', async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValueOnce({});

    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    // 最初の行を除外
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);

    await user.type(screen.getByLabelText('NET金額'), '100000');
    await user.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/estimates/est-1/calculate-net', {
        vendorName: '業者A',
        targetLineIds: ['line-v-2'],
        excludeLineIds: ['line-v-1'],
        netAmount: '100000',
      });
    });
  });

  it('業者金額がないVENDOR行は一覧に表示されない', () => {
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-1',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [
          {
            id: 'line-v-1',
            estimateItemId: 'item-1',
            lineType: 'VENDOR',
            name: '金額なし業者',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
            sourceVendorName: '業者B',
          },
        ],
        children: [],
      },
    ];

    render(<NetAllocationDialog {...defaultProps} items={items} />);

    // 業者Bは金額がないので選択肢に表示されない
    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(1); // 「選択してください」のみ
  });

  it('子項目のVENDOR行も収集される', () => {
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-parent',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [],
        children: [
          {
            id: 'item-child',
            estimateId: 'est-1',
            parentId: 'item-parent',
            displayOrder: 0,
            isExpanded: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            lines: [
              {
                id: 'line-v-child',
                estimateItemId: 'item-child',
                lineType: 'VENDOR',
                name: '子項目工事',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '30000',
                amount: '30000',
                remarks: null,
                sourceVendorName: '業者C',
              },
            ],
            children: [],
          },
        ],
      },
    ];

    render(<NetAllocationDialog {...defaultProps} items={items} />);

    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(2); // 「選択してください」+ 業者C
  });

  // ==========================================================================
  // REQ-31: 受領見積書情報表示
  // ==========================================================================
  describe('受領見積書情報表示 (REQ-31)', () => {
    it('受領見積書の合計金額が業者選択後に表示されること (REQ-31.1)', async () => {
      const user = userEvent.setup();

      // 受領見積書のモックデータ
      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 100000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
            {
              id: 'li-2',
              receivedQuotationId: 'rq-1',
              sortOrder: 1,
              customCategory: null,
              workType: null,
              name: '業者A防水',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 40000,
              amount: 40000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      // VENDOR行にsourceReceivedQuotationLineItemIdを設定
      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          if (line.id === 'line-v-2') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-2' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 受領見積書情報セクションが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      expect(screen.getByText('受領見積書合計金額')).toBeInTheDocument();
    });

    it('NET金額が設定されている場合はNET金額が表示されること (REQ-31.2)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 70000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      // NET金額の表示ラベル
      expect(screen.getByText(/NET金額（受領見積書入力値）/)).toBeInTheDocument();
    });

    it('受領見積書情報セクションが縦並びレイアウトで表示されること (REQ-31.2 update)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 70000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      // 受領見積書情報セクションのグリッドが縦並び（1fr）であること
      const infoSection = screen.getByTestId('quotation-info-grid');
      expect(infoSection).toBeInTheDocument();
      expect(infoSection.style.gridTemplateColumns).toBe('1fr');
    });
  });

  // ==========================================================================
  // REQ-36: NET金額の自動設定
  // ==========================================================================
  describe('NET金額の自動設定 (REQ-36)', () => {
    it('業者選択時にNET金額が自動設定されること (REQ-36.1)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('95000');
      });
    });

    it('自動設定されたNET金額を手動変更できること (REQ-36.2)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('95000');
      });

      // 手動で変更
      const netInput = screen.getByLabelText('NET金額');
      await user.clear(netInput);
      await user.type(netInput, '88000');
      expect((netInput as HTMLInputElement).value).toBe('88000');
    });

    it('NET金額がnullの場合は自動設定をスキップすること', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: null,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('');
      });
    });
  });

  // ==========================================================================
  // REQ-33: 案分対象行の合計金額表示
  // ==========================================================================
  /**
   * @requirement estimate-creation/REQ-33.1
   * @requirement estimate-creation/REQ-33.2
   * @requirement estimate-creation/REQ-33.3
   */
  describe('案分対象行の合計金額表示 (REQ-33)', () => {
    /** @requirement estimate-creation/REQ-33.1 */
    it('選択済み案分対象行の合計金額が表示されること (REQ-33.1)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 合計金額行が表示されること（80000 + 40000 = 120000）
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toBeInTheDocument();
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
      });
    });

    /** @requirement estimate-creation/REQ-33.2 */
    it('チェックボックスの切替で合計金額が再計算されること (REQ-33.2)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 初期状態: 全チェックON = 120,000円
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
      });

      // 最初の行のチェックを外す（80000を除外）
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]!);

      // 40,000円のみ
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('40,000円');
      });
    });

    /** @requirement estimate-creation/REQ-33.3 */
    it('全チェックOFF時に0円が表示されること (REQ-33.3)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 全チェックを外す
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]!);
      await user.click(checkboxes[1]!);

      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('0円');
      });
    });
  });
});
