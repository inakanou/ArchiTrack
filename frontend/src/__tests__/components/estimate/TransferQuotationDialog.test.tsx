/**
 * @fileoverview TransferQuotationDialog テスト
 *
 * Task 37.3: 転記ダイアログ改善のテスト
 * Task 50.1: REQ-35関連テスト
 *
 * Requirements:
 * - REQ-30.1: 転記先ドロップダウンの先頭に「新規項目として作成」選択肢を維持
 * - REQ-30.2: 既存項目のドロップダウン表示を「<項目名> の子項目として作成」形式に変更
 * - REQ-30.3: 階層構造の深さに応じたインデント表示で視覚的に区別
 * - REQ-35.1: ドロップダウンに協力業者名を表示
 * - REQ-35.2: ドロップダウンの表示形式を「業者名 - 金額」に変更
 * - REQ-35.3: 転記明細行のチェックボックスをデフォルト全選択
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferQuotationDialog } from '../../../components/estimate/TransferQuotationDialog';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';

// APIモック
vi.mock('../../../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn().mockResolvedValue([]),
}));

import { getReceivedQuotationsByProject } from '../../../api/received-quotations';
const mockGetQuotations = vi.mocked(getReceivedQuotationsByProject);

vi.mock('../../../api/estimates', () => ({
  transferFromQuotation: vi.fn(),
}));

const createMockEstimateItems = (): EstimateItemHierarchyEdit[] => [
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
        id: 'line-1',
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
    ],
    children: [
      {
        id: 'item-1-1',
        estimateId: 'est-1',
        parentId: 'item-1',
        displayOrder: 0,
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [
          {
            id: 'line-1-1',
            estimateItemId: 'item-1-1',
            lineType: 'ESTIMATE',
            name: '下地処理',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '30000',
            amount: '30000',
            remarks: null,
          },
        ],
        children: [],
      },
    ],
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
        id: 'line-2',
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
    ],
    children: [],
  },
];

describe('TransferQuotationDialog', () => {
  const defaultProps = {
    isOpen: true,
    estimateId: 'est-1',
    projectId: 'proj-1',
    estimateItems: createMockEstimateItems(),
    onClose: vi.fn(),
    onTransferComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=falseの場合は何も表示しない', () => {
    const { container } = render(<TransferQuotationDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される', () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * 読み込み完了を待つヘルパー
   */
  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  }

  // ==========================================================================
  // REQ-30.1: 「新規項目として作成」選択肢
  // ==========================================================================
  describe('転記先ドロップダウン (REQ-30.1)', () => {
    it('先頭に「新規項目として作成」選択肢があること', async () => {
      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const targetSelect = screen.getByLabelText('転記先見積項目');
      const options = within(targetSelect).getAllByRole('option');

      expect(options[0]).toHaveTextContent('新規項目として作成');
      expect((options[0] as HTMLOptionElement).value).toBe('');
    });
  });

  // ==========================================================================
  // REQ-30.2: 「<項目名> の子項目として作成」形式
  // ==========================================================================
  describe('既存項目の表示形式 (REQ-30.2)', () => {
    it('既存項目が「<項目名> の子項目として作成」形式で表示されること', async () => {
      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const targetSelect = screen.getByLabelText('転記先見積項目');
      const options = within(targetSelect).getAllByRole('option');

      // item-1: 「外壁塗装 の子項目として作成」
      const item1Option = options.find(
        (opt) =>
          opt.textContent?.includes('外壁塗装') && opt.textContent?.includes('の子項目として作成')
      );
      expect(item1Option).toBeDefined();

      // item-2: 「防水工事 の子項目として作成」
      const item2Option = options.find(
        (opt) =>
          opt.textContent?.includes('防水工事') && opt.textContent?.includes('の子項目として作成')
      );
      expect(item2Option).toBeDefined();
    });

    it('子項目も「の子項目として作成」形式で表示されること', async () => {
      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const targetSelect = screen.getByLabelText('転記先見積項目');
      const options = within(targetSelect).getAllByRole('option');

      // item-1-1: 「下地処理 の子項目として作成」
      const childOption = options.find(
        (opt) =>
          opt.textContent?.includes('下地処理') && opt.textContent?.includes('の子項目として作成')
      );
      expect(childOption).toBeDefined();
    });
  });

  // ==========================================================================
  // REQ-30.3: インデント表示
  // ==========================================================================
  describe('インデント表示 (REQ-30.3)', () => {
    it('ルートレベル項目と子項目で異なるインデントが適用されること', async () => {
      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const targetSelect = screen.getByLabelText('転記先見積項目');
      const options = within(targetSelect).getAllByRole('option');

      // ルート項目（外壁塗装）のテキスト
      const rootOption = options.find((opt) => opt.textContent?.includes('外壁塗装'));
      // 子項目（下地処理）のテキスト - インデントされているはず
      const childOption = options.find((opt) => opt.textContent?.includes('下地処理'));

      expect(rootOption).toBeDefined();
      expect(childOption).toBeDefined();

      // 子項目にはインデント用のスペースが入っている
      // '  '.repeat(level) で level=1 の場合、先頭にスペースが2文字多い
      const rootText = rootOption!.textContent || '';
      const childText = childOption!.textContent || '';

      // 子項目の方がテキスト先頭にスペースが多い
      const rootLeadingSpaces = rootText.length - rootText.trimStart().length;
      const childLeadingSpaces = childText.length - childText.trimStart().length;
      expect(childLeadingSpaces).toBeGreaterThan(rootLeadingSpaces);
    });
  });

  // ==========================================================================
  // 全選択肢の数
  // ==========================================================================
  describe('選択肢の数', () => {
    it('「新規項目として作成」+ 全階層の項目数の選択肢があること', async () => {
      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const targetSelect = screen.getByLabelText('転記先見積項目');
      const options = within(targetSelect).getAllByRole('option');

      // 「新規項目として作成」(1) + 外壁塗装(1) + 下地処理(1) + 防水工事(1) = 4
      expect(options).toHaveLength(4);
    });
  });

  // ==========================================================================
  // REQ-35.1, REQ-35.2: ドロップダウンに「業者名 - 金額」形式で表示
  // ==========================================================================
  describe('受領見積書ドロップダウン表示 (REQ-35.1, REQ-35.2)', () => {
    it('ドロップダウンに「業者名 - 金額」形式で表示されること', async () => {
      mockGetQuotations.mockResolvedValue([
        {
          id: 'q-1',
          estimateRequestId: 'er-1',
          name: '見積書A',
          submittedAt: new Date('2025-01-15'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          lineItems: [
            {
              id: 'li-1',
              name: '工事A',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 100000,
              amount: 100000,
              remarks: null,
              sortOrder: 0,
            },
          ],
          totalAmount: 100000,
          netAmount: 90000,
          createdAt: new Date('2025-01-15'),
          updatedAt: new Date('2025-01-15'),
          tradingPartnerName: '株式会社テスト建設',
        } as never,
      ]);

      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const quotationSelect = screen.getByLabelText('受領見積書を選択');
      const options = within(quotationSelect).getAllByRole('option');

      // 「業者名 - 金額」形式で表示される
      const quotationOption = options.find(
        (opt) =>
          opt.textContent?.includes('株式会社テスト建設') && opt.textContent?.includes('100,000')
      );
      expect(quotationOption).toBeDefined();
    });

    it('tradingPartnerNameがnullの場合はname（見積書名）をフォールバック表示すること', async () => {
      mockGetQuotations.mockResolvedValue([
        {
          id: 'q-2',
          estimateRequestId: 'er-2',
          name: 'フォールバック見積書',
          submittedAt: new Date('2025-01-15'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          lineItems: [],
          totalAmount: 50000,
          netAmount: null,
          createdAt: new Date('2025-01-15'),
          updatedAt: new Date('2025-01-15'),
          tradingPartnerName: null,
        } as never,
      ]);

      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      const quotationSelect = screen.getByLabelText('受領見積書を選択');
      const options = within(quotationSelect).getAllByRole('option');

      const quotationOption = options.find(
        (opt) =>
          opt.textContent?.includes('フォールバック見積書') && opt.textContent?.includes('50,000')
      );
      expect(quotationOption).toBeDefined();
    });
  });

  // ==========================================================================
  // REQ-35.3: 転記明細行のデフォルト全選択
  // ==========================================================================
  describe('転記明細行のデフォルト全選択 (REQ-35.3)', () => {
    it('受領見積書選択時に全明細行がデフォルトでチェック済みになること', async () => {
      const user = userEvent.setup();
      mockGetQuotations.mockResolvedValue([
        {
          id: 'q-1',
          estimateRequestId: 'er-1',
          name: '見積書A',
          submittedAt: new Date('2025-01-15'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          lineItems: [
            {
              id: 'li-1',
              name: '工事A',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 100000,
              amount: 100000,
              remarks: null,
              sortOrder: 0,
            },
            {
              id: 'li-2',
              name: '工事B',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 50000,
              amount: 50000,
              remarks: null,
              sortOrder: 1,
            },
          ],
          totalAmount: 150000,
          netAmount: 120000,
          createdAt: new Date('2025-01-15'),
          updatedAt: new Date('2025-01-15'),
          tradingPartnerName: '株式会社テスト建設',
        } as never,
      ]);

      render(<TransferQuotationDialog {...defaultProps} />);
      await waitForLoaded();

      // 受領見積書を選択
      const quotationSelect = screen.getByLabelText('受領見積書を選択');
      await user.selectOptions(quotationSelect, 'q-1');

      // 全明細行のチェックボックスがチェック済みであること
      await waitFor(() => {
        const checkbox1 = screen.getByTestId('line-checkbox-li-1') as HTMLInputElement;
        const checkbox2 = screen.getByTestId('line-checkbox-li-2') as HTMLInputElement;
        expect(checkbox1.checked).toBe(true);
        expect(checkbox2.checked).toBe(true);
      });
    });
  });
});
