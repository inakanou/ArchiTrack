/**
 * @fileoverview ReceivedQuotationList コンポーネントのテスト
 *
 * Task 14.2: ReceivedQuotationListの実装
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.11: 複数の受領見積書を許可
 * - 11.12: 登録済み受領見積書の表示
 * - 11.13: 受領見積書名、提出日、登録日時の表示
 * - 11.14: ファイルプレビューリンク
 * - 11.16: 編集・削除アクションボタン
 * - 11.17: 削除確認ダイアログ
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivedQuotationList } from './ReceivedQuotationList';
import type { ReceivedQuotationInfo } from './ReceivedQuotationForm';

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
      contentType: 'TEXT',
      textContent: 'テキスト内容',
      fileName: null,
      fileMimeType: null,
      fileSize: null,
      createdAt: new Date('2025-01-16T10:00:00'),
      updatedAt: new Date('2025-01-16T10:00:00'),
    },
    {
      id: 'rq-2',
      estimateRequestId,
      name: '見積書B（PDF）',
      submittedAt: new Date('2025-01-17'),
      contentType: 'FILE',
      textContent: null,
      fileName: 'estimate.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024 * 500, // 500KB
      createdAt: new Date('2025-01-18T11:30:00'),
      updatedAt: new Date('2025-01-18T11:30:00'),
    },
    {
      id: 'rq-3',
      estimateRequestId,
      name: '見積書C（Excel）',
      submittedAt: new Date('2025-01-19'),
      contentType: 'FILE',
      textContent: null,
      fileName: 'estimate.xlsx',
      fileMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 1024 * 1024 * 2, // 2MB
      createdAt: new Date('2025-01-20T09:00:00'),
      updatedAt: new Date('2025-01-20T09:00:00'),
    },
    {
      id: 'rq-4',
      estimateRequestId,
      name: '見積書D（画像）',
      submittedAt: new Date('2025-01-21'),
      contentType: 'FILE',
      textContent: null,
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
      fileSize: 1024 * 300, // 300KB
      createdAt: new Date('2025-01-22T14:00:00'),
      updatedAt: new Date('2025-01-22T14:00:00'),
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
});
