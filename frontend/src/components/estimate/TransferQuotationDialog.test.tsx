/**
 * @fileoverview TransferQuotationDialog テスト
 *
 * Task 11.4: 受領見積書転記ダイアログの実装
 *
 * Requirements (estimate-creation):
 * - REQ-4.1: 見積項目行を指定して受領見積書の行を選択した場合、業者金額行に転記する
 * - REQ-4.2: 見積項目行を指定せずに受領見積書の行を選択した場合、新規見積項目行を作成
 * - REQ-4.3: 名称・規格・単位・数量・単価を転記対象とする
 * - REQ-4.4: 複数の受領見積書を順次転記した場合、別の見積項目行として反映する
 * - REQ-4.5: 見積依頼機能で登録された受領見積書のみを転記元として選択可能とする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferQuotationDialog } from './TransferQuotationDialog';
import * as receivedQuotationsApi from '../../api/received-quotations';
import * as estimatesApi from '../../api/estimates';

// モック
vi.mock('../../api/received-quotations');
vi.mock('../../api/estimates');

const mockReceivedQuotations = [
  {
    id: 'rq-001',
    estimateRequestId: 'er-001',
    name: '業者A',
    submittedAt: new Date('2024-01-10'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    totalAmount: 500000,
    netAmount: null,
    lineItems: [
      {
        id: 'rql-001',
        receivedQuotationId: 'rq-001',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '仮設工事',
        specification: 'A規格',
        unit: '式',
        quantity: 1,
        unitPrice: 100000,
        amount: 100000,

        remarks: null,
      },
      {
        id: 'rql-002',
        receivedQuotationId: 'rq-001',
        sortOrder: 1,
        customCategory: null,
        workType: null,
        name: '土工事',
        specification: 'B規格',
        unit: 'm3',
        quantity: 50,
        unitPrice: 8000,
        amount: 400000,

        remarks: null,
      },
    ],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  },
  {
    id: 'rq-002',
    estimateRequestId: 'er-001',
    name: '業者B',
    submittedAt: new Date('2024-01-11'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    totalAmount: 450000,
    netAmount: null,
    lineItems: [
      {
        id: 'rql-003',
        receivedQuotationId: 'rq-002',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '仮設工事',
        specification: null,
        unit: '式',
        quantity: 1,
        unitPrice: 90000,
        amount: 90000,

        remarks: null,
      },
    ],
    createdAt: new Date('2024-01-11'),
    updatedAt: new Date('2024-01-11'),
  },
];

const mockEstimateItems = [
  {
    id: 'item-001',
    estimateId: 'est-001',
    parentId: null,
    displayOrder: 0,
    lines: [
      {
        id: 'line-001',
        estimateItemId: 'item-001',
        lineType: 'ESTIMATE' as const,
        name: '建築工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: null,
        amount: null,
        remarks: null,
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
    children: [],
    isExpanded: true,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
];

describe('TransferQuotationDialog', () => {
  const defaultProps = {
    isOpen: true,
    estimateId: 'est-001',
    projectId: 'proj-001',
    estimateItems: mockEstimateItems,
    onClose: vi.fn(),
    onTransferComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(receivedQuotationsApi.getReceivedQuotationsByProject).mockResolvedValue(
      mockReceivedQuotations
    );
  });

  /**
   * ダイアログが開かれたときに表示される
   */
  it('ダイアログが開かれたときに正しくレンダリングされる', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('受領見積書から転記')).toBeInTheDocument();
    });
  });

  /**
   * isOpen=false の場合、ダイアログが表示されない
   */
  it('isOpen=false の場合、ダイアログが表示されない', () => {
    render(<TransferQuotationDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * REQ-4.5: 受領見積書一覧を表示する
   */
  it('受領見積書一覧を表示する', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      // selectのoption内にテキストが含まれている
      expect(screen.getByText(/業者A/)).toBeInTheDocument();
      expect(screen.getByText(/業者B/)).toBeInTheDocument();
    });
  });

  /**
   * REQ-4.1: 受領見積書を選択すると明細行が表示される
   */
  it('受領見積書を選択すると明細行が表示される', async () => {
    const user = userEvent.setup();

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/業者A/)).toBeInTheDocument();
    });

    // 受領見積書を選択
    const quotationSelect = screen.getByLabelText(/受領見積書を選択/i);
    await user.selectOptions(quotationSelect, 'rq-001');

    await waitFor(() => {
      expect(screen.getByText('仮設工事')).toBeInTheDocument();
      expect(screen.getByText('土工事')).toBeInTheDocument();
    });
  });

  /**
   * REQ-4.3: 転記対象行を選択できる
   */
  it('転記対象の明細行を選択できる', async () => {
    const user = userEvent.setup();

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/業者A/)).toBeInTheDocument();
    });

    // 受領見積書を選択
    const quotationSelect = screen.getByLabelText(/受領見積書を選択/i);
    await user.selectOptions(quotationSelect, 'rq-001');

    await waitFor(() => {
      expect(screen.getByText('仮設工事')).toBeInTheDocument();
    });

    // 受領見積書選択時に全明細行が自動選択される
    const checkbox = screen.getByTestId('line-checkbox-rql-001');
    expect(checkbox).toBeChecked();

    // クリックで選択解除→再選択できることを確認
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  /**
   * REQ-4.1: 転記先見積項目を選択できる
   */
  it('転記先見積項目を選択できる', async () => {
    const user = userEvent.setup();

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/転記先見積項目/i)).toBeInTheDocument();
    });

    const targetSelect = screen.getByLabelText(/転記先見積項目/i);
    await user.selectOptions(targetSelect, 'item-001');

    expect((targetSelect as HTMLSelectElement).value).toBe('item-001');
  });

  /**
   * REQ-4.2: 転記先未選択の場合、新規項目作成を選択できる
   */
  it('「新規項目として作成」オプションを選択できる', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/転記先見積項目/i)).toBeInTheDocument();
    });

    expect(screen.getByText('新規項目として作成')).toBeInTheDocument();
  });

  /**
   * REQ-4.1, REQ-4.3: 転記を実行できる
   */
  it('転記を実行できる', async () => {
    const user = userEvent.setup();
    const mockTransferResult = [
      {
        id: 'item-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'line-002',
            estimateItemId: 'item-001',
            lineType: 'VENDOR' as const,
            name: '仮設工事',
            specification: 'A規格',
            unit: '式',
            quantity: '1',
            unitPrice: '100000',
            amount: '100000',
            remarks: null,
            sourceReceivedQuotationLineItemId: 'rql-001',
            sourceVendorName: '業者A',
            createdAt: '2024-01-15T10:00:00.000Z',
            updatedAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];
    vi.mocked(estimatesApi.transferFromQuotation).mockResolvedValue(mockTransferResult);

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/業者A/)).toBeInTheDocument();
    });

    // 受領見積書を選択
    const quotationSelect = screen.getByLabelText(/受領見積書を選択/i);
    await user.selectOptions(quotationSelect, 'rq-001');

    await waitFor(() => {
      expect(screen.getByText('仮設工事')).toBeInTheDocument();
    });

    // 受領見積書選択時に全明細行が自動選択されるため、不要な行を除外
    const checkbox2 = screen.getByTestId('line-checkbox-rql-002');
    await user.click(checkbox2); // rql-002を選択解除

    // 転記ボタンをクリック
    const transferButton = screen.getByRole('button', { name: /転記/i });
    await user.click(transferButton);

    await waitFor(() => {
      expect(estimatesApi.transferFromQuotation).toHaveBeenCalledWith('est-001', {
        receivedQuotationId: 'rq-001',
        lineItemIds: ['rql-001'],
        targetEstimateItemId: undefined,
      });
    });

    expect(defaultProps.onTransferComplete).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  /**
   * 転記対象が選択されていない場合、転記ボタンが無効
   */
  it('転記対象が選択されていない場合、転記ボタンが無効', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /転記/i })).toBeInTheDocument();
    });

    const transferButton = screen.getByRole('button', { name: /転記/i });
    expect(transferButton).toBeDisabled();
  });

  /**
   * キャンセルボタンでダイアログを閉じる
   */
  it('キャンセルボタンでダイアログを閉じる', async () => {
    const user = userEvent.setup();

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  /**
   * ローディング中はスピナーを表示
   */
  it('受領見積書取得中はローディングを表示する', async () => {
    vi.mocked(receivedQuotationsApi.getReceivedQuotationsByProject).mockImplementation(
      () => new Promise(() => {})
    );

    render(<TransferQuotationDialog {...defaultProps} />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * REQ-4.4: 複数の明細行を選択できる
   */
  it('複数の明細行を選択できる', async () => {
    const user = userEvent.setup();

    render(<TransferQuotationDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/業者A/)).toBeInTheDocument();
    });

    // 受領見積書を選択
    const quotationSelect = screen.getByLabelText(/受領見積書を選択/i);
    await user.selectOptions(quotationSelect, 'rq-001');

    await waitFor(() => {
      expect(screen.getByText('仮設工事')).toBeInTheDocument();
      expect(screen.getByText('土工事')).toBeInTheDocument();
    });

    // 受領見積書選択時に全明細行が自動選択される
    const checkbox1 = screen.getByTestId('line-checkbox-rql-001');
    const checkbox2 = screen.getByTestId('line-checkbox-rql-002');

    expect(checkbox1).toBeChecked();
    expect(checkbox2).toBeChecked();
  });
});
