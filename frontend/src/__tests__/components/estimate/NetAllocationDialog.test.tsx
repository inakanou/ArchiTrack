/**
 * @fileoverview NetAllocationDialog テスト
 *
 * Requirements:
 * - REQ-18.1〜18.9: NET金額案分ダイアログの各機能
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

import { apiClient } from '../../../api/client';

const mockApiPost = vi.mocked(apiClient.post);

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
});
