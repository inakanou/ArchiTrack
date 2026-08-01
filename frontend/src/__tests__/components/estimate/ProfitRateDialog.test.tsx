/**
 * @fileoverview ProfitRateDialog テスト
 *
 * Requirements:
 * - REQ-19.1〜19.7: 利益率適用ダイアログの各機能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfitRateDialog } from '../../../components/estimate/ProfitRateDialog';
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
      },
    ],
    children: [],
  },
];

describe('ProfitRateDialog', () => {
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
    const { container } = render(<ProfitRateDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される (REQ-19.2)', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('実行金額を見積金額に転記（利益率適用）')).toBeInTheDocument();
  });

  it('利益率入力フィールドが表示される (REQ-19.3)', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    const input = screen.getByLabelText('利益率 (%)');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '500');
    expect(input).toHaveAttribute('step', '0.01');
  });

  it('上書きオプションが表示される (REQ-19.4)', () => {
    render(<ProfitRateDialog {...defaultProps} />);

    expect(screen.getByText('上書きオプション')).toBeInTheDocument();
    expect(screen.getByLabelText(/すべて上書き/)).toBeInTheDocument();
    expect(screen.getByLabelText(/空の場合のみ上書き/)).toBeInTheDocument();
    expect(screen.getByLabelText(/単価のみ上書き/)).toBeInTheDocument();
  });

  it('上書きオプションのデフォルトは「すべて上書き」', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    const allRadio = screen.getByLabelText(/すべて上書き/) as HTMLInputElement;
    expect(allRadio.checked).toBe(true);
  });

  it('上書きオプションを変更できる', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    const emptyOnlyRadio = screen.getByLabelText(/空の場合のみ上書き/);
    await user.click(emptyOnlyRadio);
    expect((emptyOnlyRadio as HTMLInputElement).checked).toBe(true);

    const unitPriceRadio = screen.getByLabelText(/単価のみ上書き/);
    await user.click(unitPriceRadio);
    expect((unitPriceRadio as HTMLInputElement).checked).toBe(true);
  });

  it('利益率入力でプレビューが表示される (REQ-19.5)', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '10');

    expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    expect(screen.getByText('元の単価')).toBeInTheDocument();
    expect(screen.getByText('新しい単価')).toBeInTheDocument();
    // 90000 * 1.10 = 99000
    expect(screen.getByText('99,000円')).toBeInTheDocument();
  });

  it('不正な利益率ではプレビューが表示されない', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, 'abc');

    expect(screen.queryByText('適用プレビュー')).not.toBeInTheDocument();
  });

  it('適用ボタンで送信される (REQ-19.6)', async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValueOnce({});

    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '15');
    await user.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/estimates/est-1/apply-profit-rate', {
        profitRate: '15',
        overwriteOption: 'all',
      });
    });

    expect(defaultProps.onComplete).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('利益率が空の場合は適用ボタンが無効', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    // デフォルト12.27をクリアする
    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);

    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled();
  });

  it('送信中は「適用中...」と表示される (REQ-19.7)', async () => {
    const user = userEvent.setup();
    mockApiPost.mockImplementation(() => new Promise(() => {}));

    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '適用中...' })).toBeDisabled();
    });
  });

  it('キャンセルボタンでonCloseが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('API呼び出し失敗時にクラッシュしない', async () => {
    const user = userEvent.setup();
    mockApiPost.mockRejectedValueOnce(new Error('API Error'));

    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '適用' })).not.toBeDisabled();
    });
  });

  it('上書きオプションがAPI呼び出しに反映される', async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValueOnce({});

    render(<ProfitRateDialog {...defaultProps} />);

    await user.click(screen.getByLabelText(/単価のみ上書き/));
    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '20');
    await user.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/estimates/est-1/apply-profit-rate', {
        profitRate: '20',
        overwriteOption: 'unit_price_only',
      });
    });
  });

  it('実行金額行の単価がない項目は対象外', () => {
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-1',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [
          {
            id: 'line-x-1',
            estimateItemId: 'item-1',
            lineType: 'EXECUTION',
            name: '単価なし工事',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ],
        children: [],
      },
    ];

    render(<ProfitRateDialog {...defaultProps} items={items} />);

    // プレビューは表示されない（対象行がないため）
    expect(screen.queryByText('適用プレビュー')).not.toBeInTheDocument();
  });

  it('子項目のEXECUTION行も収集される', async () => {
    const user = userEvent.setup();
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-parent',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [],
        children: [
          {
            id: 'item-child',
            estimateId: 'est-1',
            parentId: 'item-parent',
            displayOrder: 0,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            lines: [
              {
                id: 'line-x-child',
                estimateItemId: 'item-child',
                lineType: 'EXECUTION',
                name: '子項目工事',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '50000',
                amount: '50000',
                remarks: null,
              },
            ],
            children: [],
          },
        ],
      },
    ];

    render(<ProfitRateDialog {...defaultProps} items={items} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '10');

    // 子項目の工事名が表示される
    expect(screen.getByText('子項目工事')).toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-37.1, REQ-37.2: 利益率デフォルト値12.27%
  // ==========================================================================
  describe('利益率デフォルト値 (REQ-37.1, REQ-37.2)', () => {
    it('利益率入力フィールドのデフォルト値が12.27であること (REQ-37.1)', () => {
      render(<ProfitRateDialog {...defaultProps} />);
      const input = screen.getByLabelText('利益率 (%)') as HTMLInputElement;
      expect(input.value).toBe('12.27');
    });

    it('デフォルト値12.27でプレビューが表示されること', () => {
      render(<ProfitRateDialog {...defaultProps} />);
      // 90000 * 1.1227 = 101043
      expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    });

    it('デフォルト値を自由に変更できること (REQ-37.2)', async () => {
      const user = userEvent.setup();
      render(<ProfitRateDialog {...defaultProps} />);

      const input = screen.getByLabelText('利益率 (%)') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '25');
      expect(input.value).toBe('25');
    });
  });

  it('送信中はフォーム入力が無効になる', async () => {
    const user = userEvent.setup();
    mockApiPost.mockImplementation(() => new Promise(() => {}));

    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(screen.getByLabelText('利益率 (%)')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });
  });
});
