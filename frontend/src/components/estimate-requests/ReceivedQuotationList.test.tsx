/**
 * @fileoverview ReceivedQuotationList コンポーネントのテスト
 *
 * Task 14.2: ReceivedQuotationListの実装
 * Task 26.2: ReceivedQuotationListの改訂（明細行数・合計金額表示追加）
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.11: 複数の受領見積書を許可
 * - 11.12: 登録済み受領見積書の表示
 * - 11.13: 受領見積書名、提出日、登録日時の表示
 * - 11.14: ファイルプレビューリンク
 * - 11.16: 編集・削除アクションボタン
 * - 11.17: 削除確認ダイアログ
 * - 11.25: 一覧表示に明細行数と合計金額を追加表示
 * - 11.26: 見積依頼詳細画面に登録済み受領見積書の一覧を表示する
 * - 11.27: 受領見積書一覧に受領見積書名、提出日、登録日時を表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivedQuotationList } from './ReceivedQuotationList';
import type { ReceivedQuotationInfo } from '../../api/received-quotations';

describe('ReceivedQuotationList', () => {
  const mockOnAddClick = vi.fn();
  const mockOnEditClick = vi.fn();
  const mockOnDeleteClick = vi.fn();
  const mockOnPreviewClick = vi.fn();
  const estimateRequestId = 'er-123';

  const sampleQuotations: ReceivedQuotationInfo[] = [
    {
      id: 'rq-1',
      estimateRequestId,
      name: '見積書A',
      submittedAt: new Date('2025-01-15'),
      fileName: null,
      fileMimeType: null,
      fileSize: null,
      lineItems: [],
      totalAmount: null,
      netAmount: null,
      createdAt: new Date('2025-01-16T10:00:00'),
      updatedAt: new Date('2025-01-16T10:00:00'),
    },
    {
      id: 'rq-2',
      estimateRequestId,
      name: '見積書B（PDF）',
      submittedAt: new Date('2025-01-17'),
      fileName: 'estimate.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024 * 500, // 500KB
      lineItems: [],
      totalAmount: null,
      netAmount: null,
      createdAt: new Date('2025-01-18T11:30:00'),
      updatedAt: new Date('2025-01-18T11:30:00'),
    },
    {
      id: 'rq-3',
      estimateRequestId,
      name: '見積書C（Excel）',
      submittedAt: new Date('2025-01-19'),
      fileName: 'estimate.xlsx',
      fileMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 1024 * 1024 * 2, // 2MB
      lineItems: [],
      totalAmount: null,
      netAmount: null,
      createdAt: new Date('2025-01-20T09:00:00'),
      updatedAt: new Date('2025-01-20T09:00:00'),
    },
    {
      id: 'rq-4',
      estimateRequestId,
      name: '見積書D（画像）',
      submittedAt: new Date('2025-01-21'),
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
      fileSize: 1024 * 300, // 300KB
      lineItems: [],
      totalAmount: null,
      netAmount: null,
      createdAt: new Date('2025-01-22T14:00:00'),
      updatedAt: new Date('2025-01-22T14:00:00'),
    },
  ];

  // Task 26.2: 明細行データを含む受領見積書サンプル
  const quotationsWithLineItems: ReceivedQuotationInfo[] = [
    {
      id: 'rq-10',
      estimateRequestId,
      name: '見積書（明細行あり）',
      submittedAt: new Date('2025-01-25'),
      fileName: 'estimate.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024 * 500,
      lineItems: [
        {
          id: 'li-1',
          receivedQuotationId: 'rq-10',
          sortOrder: 1,
          customCategory: null,
          workType: null,
          name: '資材A',
          specification: '規格A',
          unit: '個',
          quantity: 10,
          unitPrice: 1000,
          amount: 10000,

          remarks: null,
        },
        {
          id: 'li-2',
          receivedQuotationId: 'rq-10',
          sortOrder: 2,
          customCategory: null,
          workType: null,
          name: '資材B',
          specification: '規格B',
          unit: '本',
          quantity: 5,
          unitPrice: 2000,
          amount: 10000,

          remarks: null,
        },
        {
          id: 'li-3',
          receivedQuotationId: 'rq-10',
          sortOrder: 3,
          customCategory: null,
          workType: null,
          name: '作業費',
          specification: null,
          unit: '式',
          quantity: 1,
          unitPrice: 30000,
          amount: 30000,

          remarks: null,
        },
      ],
      totalAmount: 50000, // 10000 + 10000 + 30000
      netAmount: null,
      createdAt: new Date('2025-01-26T10:00:00'),
      updatedAt: new Date('2025-01-26T10:00:00'),
    },
    {
      id: 'rq-11',
      estimateRequestId,
      name: '見積書（明細行のみ）',
      submittedAt: new Date('2025-01-27'),
      fileName: null,
      fileMimeType: null,
      fileSize: null,
      lineItems: [
        {
          id: 'li-4',
          receivedQuotationId: 'rq-11',
          sortOrder: 1,
          customCategory: null,
          workType: null,
          name: '工事費',
          specification: null,
          unit: '式',
          quantity: 1,
          unitPrice: 150000,
          amount: 150000,

          remarks: '一式',
        },
      ],
      totalAmount: 150000,
      netAmount: null,
      createdAt: new Date('2025-01-28T10:00:00'),
      updatedAt: new Date('2025-01-28T10:00:00'),
    },
    {
      id: 'rq-12',
      estimateRequestId,
      name: '見積書（ファイルのみ）',
      submittedAt: new Date('2025-01-29'),
      fileName: 'estimate-only.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024 * 200,
      lineItems: [],
      totalAmount: null,
      netAmount: null,
      createdAt: new Date('2025-01-30T10:00:00'),
      updatedAt: new Date('2025-01-30T10:00:00'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('受領見積書登録ボタンが表示される (11.1)', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByRole('button', { name: /受領見積書登録/ })).toBeInTheDocument();
    });

    it('受領見積書が0件の場合メッセージが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByText(/受領見積書はまだ登録されていません/)).toBeInTheDocument();
    });

    it('複数の受領見積書が表示される (11.11)', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={sampleQuotations}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByText('見積書A')).toBeInTheDocument();
      expect(screen.getByText('見積書B（PDF）')).toBeInTheDocument();
      expect(screen.getByText('見積書C（Excel）')).toBeInTheDocument();
      expect(screen.getByText('見積書D（画像）')).toBeInTheDocument();
    });

    it('受領見積書名、提出日が表示される (11.13)', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByText('見積書A')).toBeInTheDocument();
      expect(screen.getByText(/2025.*01.*15/)).toBeInTheDocument(); // 提出日
    });
  });

  describe('ファイルタイプアイコン', () => {
    it('テキストタイプのアイコンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByTestId('icon-text')).toBeInTheDocument();
    });

    it('PDFタイプのアイコンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[1]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByTestId('icon-pdf')).toBeInTheDocument();
    });

    it('Excelタイプのアイコンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[2]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByTestId('icon-excel')).toBeInTheDocument();
    });

    it('画像タイプのアイコンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[3]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByTestId('icon-image')).toBeInTheDocument();
    });
  });

  describe('ファイルプレビュー (11.14)', () => {
    it('ファイルタイプの見積書にプレビューリンクが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[1]!]} // PDF
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByRole('button', { name: /プレビュー/ })).toBeInTheDocument();
    });

    it('テキストタイプの見積書にはプレビューリンクが表示されない', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]} // TEXT
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.queryByRole('button', { name: /プレビュー/ })).not.toBeInTheDocument();
    });

    it('プレビューボタンクリックでonPreviewClickが呼ばれる', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[1]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      const previewButton = screen.getByRole('button', { name: /プレビュー/ });
      await userEvent.click(previewButton);

      expect(mockOnPreviewClick).toHaveBeenCalledWith(sampleQuotations[1]!);
    });
  });

  describe('アクションボタン (11.16)', () => {
    it('編集ボタンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByRole('button', { name: /編集/ })).toBeInTheDocument();
    });

    it('削除ボタンが表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
    });

    it('編集ボタンクリックでonEditClickが呼ばれる', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      const editButton = screen.getByRole('button', { name: /編集/ });
      await userEvent.click(editButton);

      expect(mockOnEditClick).toHaveBeenCalledWith(sampleQuotations[0]!);
    });
  });

  describe('削除確認ダイアログ (11.17)', () => {
    it('削除ボタンクリックで確認ダイアログが表示される', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await userEvent.click(deleteButton);

      expect(screen.getByText(/削除しますか/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /削除する/ })).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルするとダイアログが閉じる', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await userEvent.click(deleteButton);

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await userEvent.click(cancelButton);

      // ダイアログが閉じていることを確認
      await waitFor(() => {
        expect(screen.queryByText(/削除しますか/)).not.toBeInTheDocument();
      });
      expect(mockOnDeleteClick).not.toHaveBeenCalled();
    });

    it('確認ダイアログで削除を実行するとonDeleteClickが呼ばれる', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await userEvent.click(deleteButton);

      // 削除するボタンをクリック
      const confirmButton = screen.getByRole('button', { name: /削除する/ });
      await userEvent.click(confirmButton);

      expect(mockOnDeleteClick).toHaveBeenCalledWith(sampleQuotations[0]!);
    });
  });

  describe('登録ボタン', () => {
    it('登録ボタンクリックでonAddClickが呼ばれる', async () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      const addButton = screen.getByRole('button', { name: /受領見積書登録/ });
      await userEvent.click(addButton);

      expect(mockOnAddClick).toHaveBeenCalled();
    });

    it('disabled時は登録ボタンが無効化される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
          disabled={true}
        />
      );

      const addButton = screen.getByRole('button', { name: /受領見積書登録/ });
      expect(addButton).toBeDisabled();
    });
  });

  // ============================================================================
  // Task 26.2: 明細行数と合計金額の表示テスト (11.25, 11.26, 11.27)
  // ============================================================================

  describe('明細行数と合計金額の表示 (Task 26.2)', () => {
    it('明細行がある受領見積書に明細行数が表示される (11.25)', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[quotationsWithLineItems[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 3行の明細行があるので「3行」と表示される
      expect(screen.getByText(/3行/)).toBeInTheDocument();
    });

    it('合計金額がある受領見積書に金額が表示される (11.25)', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[quotationsWithLineItems[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 合計金額50,000円が表示される（カンマ区切り形式）
      expect(screen.getByText(/50,000/)).toBeInTheDocument();
    });

    it('明細行のみの受領見積書に明細行数と合計金額が表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[quotationsWithLineItems[1]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 1行の明細行
      expect(screen.getByText(/1行/)).toBeInTheDocument();
      // 合計金額150,000円
      expect(screen.getByText(/150,000/)).toBeInTheDocument();
    });

    it('ファイルのみの受領見積書には明細行数・合計金額が表示されない', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[quotationsWithLineItems[2]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 「行」というテキストは表示されない（明細行がないため）
      expect(screen.queryByText(/\d+行/)).not.toBeInTheDocument();
    });

    it('ファイル有無のアイコンと明細行情報が併記される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[quotationsWithLineItems[0]!]}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // PDFアイコンが表示される
      expect(screen.getByTestId('icon-pdf')).toBeInTheDocument();
      // 明細行数も表示される
      expect(screen.getByText(/3行/)).toBeInTheDocument();
      // 合計金額も表示される
      expect(screen.getByText(/50,000/)).toBeInTheDocument();
    });

    it('複数の受領見積書でそれぞれの明細行数と合計金額が表示される', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={quotationsWithLineItems}
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      const items = screen.getAllByTestId('received-quotation-item');
      expect(items).toHaveLength(3);

      // getAllByTextで複数のテキストマッチを検証
      // 最初の見積書: 3行, 50,000円
      const threeRowTexts = screen.getAllByText(/3行/);
      expect(threeRowTexts.length).toBeGreaterThanOrEqual(1);
      const fiftyThousandTexts = screen.getAllByText(/50,000/);
      expect(fiftyThousandTexts.length).toBeGreaterThanOrEqual(1);

      // 2番目の見積書: 1行, 150,000円
      const oneRowTexts = screen.getAllByText(/1行/);
      expect(oneRowTexts.length).toBeGreaterThanOrEqual(1);
      const hundredFiftyThousandTexts = screen.getAllByText(/150,000/);
      expect(hundredFiftyThousandTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('明細行が空配列でtotalAmountがnullの場合、明細行情報は表示されない', () => {
      render(
        <ReceivedQuotationList
          estimateRequestId={estimateRequestId}
          quotations={[sampleQuotations[0]!]} // 空の明細行、totalAmount null
          onAddClick={mockOnAddClick}
          onEditClick={mockOnEditClick}
          onDeleteClick={mockOnDeleteClick}
          onPreviewClick={mockOnPreviewClick}
        />
      );

      // 「行」テキストは表示されない
      expect(screen.queryByText(/\d+行/)).not.toBeInTheDocument();
    });
  });
});
