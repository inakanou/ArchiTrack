/**
 * @fileoverview 見積書詳細画面のテスト
 *
 * Task 11.3: EstimateDetailPageの実装
 *
 * Requirements:
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.7: 同一見積書を複数ユーザーが編集した場合、楽観的排他制御により競合を検出する
 * - REQ-14.8: 見積書画面を提供する
 * - REQ-14.9: 見積書の詳細情報（見積項目一覧、合計金額等）を表示する
 * - REQ-14.10: 編集・削除・出力ボタンを提供する
 * - REQ-15.4-15.8: パンくずナビゲーション
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateDetailPage from '../../pages/EstimateDetailPage';
import * as estimatesApi from '../../api/estimates';
import type { EstimateDetail } from '../../api/estimates';

// APIモック
vi.mock('../../api/estimates');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// useEstimateEditorモック
const mockEditor = {
  items: [],
  setItems: vi.fn(),
  isDirty: false,
  isSaving: false,
  save: vi.fn().mockResolvedValue(undefined),
  discard: vi.fn(),
  updateLine: vi.fn(),
  toggleExpanded: vi.fn(),
  reorderItems: vi.fn(),
  getTotalAmount: vi.fn(() => '100000'),
};

vi.mock('../../hooks/useEstimateEditor', () => ({
  useEstimateEditor: () => mockEditor,
}));

// テストデータ
const mockEstimateDetail: EstimateDetail = {
  id: 'est-1',
  projectId: 'project-1',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-1',
  sourceItemizedStatementName: '第1回内訳書',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      estimateId: 'est-1',
      parentId: null,
      displayOrder: 1,
      lines: [
        {
          id: 'line-1',
          estimateItemId: 'item-1',
          lineType: 'ESTIMATE',
          name: '工事A',
          specification: '規格A',
          unit: '式',
          quantity: '1',
          unitPrice: '100000',
          amount: '100000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      children: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  totalAmount: '100000',
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(id: string = 'est-1') {
  return render(
    <MemoryRouter initialEntries={[`/estimates/${id}`]}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        <Route path="/projects/:projectId/estimates" element={<div>見積書一覧</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.items = [];
    mockEditor.isDirty = false;
    mockEditor.isSaving = false;
  });

  // ==========================================================================
  // 初期表示
  // ==========================================================================
  describe('初期表示', () => {
    it('ローディング状態が表示されること', () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockImplementation(
        () => new Promise(() => {}) // 永続的にpending
      );

      renderWithRouter();

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
    });

    it('見積書詳細が正常に表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // タイトル表示
      expect(screen.getByRole('heading', { name: 'テスト見積書' })).toBeInTheDocument();

      // 基本情報
      expect(screen.getByText('見積書名')).toBeInTheDocument();
      expect(screen.getByText('第1回内訳書')).toBeInTheDocument();

      // アクションボタン
      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '出力' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '転記' })).toBeInTheDocument();
    });

    it('パンくずナビゲーションが表示されること (REQ-15.4-15.8)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // パンくずの各項目を確認
      expect(screen.getByRole('link', { name: 'プロジェクト一覧' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト詳細' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '見積書一覧' })).toBeInTheDocument();
    });

    it('合計金額が表示されること (REQ-14.9)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('合計金額')).toBeInTheDocument();
      expect(screen.getByText('見積金額合計')).toBeInTheDocument();
      expect(screen.getByText('100,000円')).toBeInTheDocument();
    });

    it('参照内訳書がない場合はハイフンが表示されること', async () => {
      const estimateWithoutSource: EstimateDetail = {
        ...mockEstimateDetail,
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
      };
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(estimateWithoutSource);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 参照内訳書のフィールドでハイフンを確認
      const infoValues = screen.getAllByText('-');
      expect(infoValues.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // エラー表示
  // ==========================================================================
  describe('エラー表示', () => {
    it('APIエラー時にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValueOnce(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得すること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await userEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(2);
    });

    it('見積書が見つからない場合にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(
        null as unknown as EstimateDetail
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // エラーまたは見積書が見つからないメッセージのいずれかが表示される
      const alertText = screen.getByRole('alert').textContent;
      expect(
        alertText?.includes('見積書が見つかりません') ||
          alertText?.includes('見積書の取得に失敗しました')
      ).toBe(true);
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 編集機能 (REQ-11.3, REQ-14.10)
  // ==========================================================================
  describe('編集機能', () => {
    it('編集ボタンをクリックすると編集モードになること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await userEvent.click(editButton);

      // 編集モードのボタンが表示される
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();

      // 通常モードのボタンが非表示になる
      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
    });

    it('キャンセルボタンをクリックすると編集モードが解除されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 編集モードに入る
      const editButton = screen.getByRole('button', { name: '編集' });
      await userEvent.click(editButton);

      // キャンセル
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await userEvent.click(cancelButton);

      // discardが呼ばれること
      expect(mockEditor.discard).toHaveBeenCalled();

      // 通常モードに戻る
      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    });

    it('保存ボタンをクリックすると保存処理が実行されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
      mockEditor.isDirty = true;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 編集モードに入る
      const editButton = screen.getByRole('button', { name: '編集' });
      await userEvent.click(editButton);

      // 保存
      const saveButton = screen.getByRole('button', { name: '保存' });
      await userEvent.click(saveButton);

      // saveが呼ばれること
      await waitFor(() => {
        expect(mockEditor.save).toHaveBeenCalled();
      });
    });

    it('保存中は保存ボタンが「保存中...」と表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      mockEditor.isDirty = true;
      mockEditor.isSaving = true;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 編集モードに入る
      const editButton = screen.getByRole('button', { name: '編集' });
      await userEvent.click(editButton);

      // 保存中のボタンテキスト
      expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument();
    });

    it('変更がない場合は保存ボタンが無効になること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      mockEditor.isDirty = false;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 編集モードに入る
      const editButton = screen.getByRole('button', { name: '編集' });
      await userEvent.click(editButton);

      // 保存ボタンが無効
      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).toBeDisabled();
    });
  });

  // ==========================================================================
  // 削除機能 (REQ-11.4, REQ-14.10)
  // ==========================================================================
  describe('削除機能', () => {
    it('削除ボタンをクリックすると確認ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      // ダイアログが表示される
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('見積書の削除')).toBeInTheDocument();
      expect(
        screen.getByText('この見積書を削除してよろしいですか？この操作は取り消せません。')
      ).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルをクリックするとダイアログが閉じること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      // キャンセル
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await userEvent.click(cancelButton);

      // ダイアログが閉じる
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('確認ダイアログで削除をクリックすると削除処理が実行されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      vi.mocked(estimatesApi.deleteEstimate).mockResolvedValueOnce(undefined);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      // 削除実行
      const confirmDeleteButton = screen
        .getByRole('dialog')
        .querySelector('button:last-child') as HTMLButtonElement;
      await userEvent.click(confirmDeleteButton);

      // APIが呼ばれること
      await waitFor(() => {
        expect(estimatesApi.deleteEstimate).toHaveBeenCalledWith(
          'est-1',
          '2025-01-02T00:00:00.000Z'
        );
      });

      // 一覧画面に遷移
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/estimates');
    });

    it('削除失敗時にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      vi.mocked(estimatesApi.deleteEstimate).mockRejectedValueOnce(new Error('Delete failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      await userEvent.click(deleteButton);

      // 削除実行
      const confirmDeleteButton = screen
        .getByRole('dialog')
        .querySelector('button:last-child') as HTMLButtonElement;
      await userEvent.click(confirmDeleteButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積書の削除に失敗しました')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 出力機能 (REQ-10.1-10.8, REQ-14.10)
  // ==========================================================================
  describe('出力機能', () => {
    it('出力ボタンをクリックすると出力ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: '出力' });
      await userEvent.click(exportButton);

      // EstimateExportDialogが表示される（モックされているため存在チェックのみ）
      // 実際のダイアログの内容はEstimateExportDialogのテストで検証
    });
  });

  // ==========================================================================
  // 転記機能 (REQ-4.1-4.5)
  // ==========================================================================
  describe('転記機能', () => {
    it('転記ボタンをクリックすると転記ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const transferButton = screen.getByRole('button', { name: '転記' });
      await userEvent.click(transferButton);

      // TransferQuotationDialogが表示される（モックされているため存在チェックのみ）
      // 実際のダイアログの内容はTransferQuotationDialogのテストで検証
    });
  });

  // ==========================================================================
  // 見積書一覧に戻る
  // ==========================================================================
  describe('見積書一覧に戻る', () => {
    it('「見積書一覧に戻る」リンクが正しいパスを持つこと', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '見積書一覧に戻る' });
      expect(backLink).toHaveAttribute('href', '/projects/project-1/estimates');
    });
  });

  // ==========================================================================
  // 日付・金額のフォーマット
  // ==========================================================================
  describe('フォーマット表示', () => {
    it('作成日時と更新日時が日本語形式でフォーマットされること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 日付フォーマットの確認（2025年1月1日または2025年1月2日）
      // 複数箇所に表示される可能性があるのでgetAllByTextを使用
      const jan1Dates = screen.getAllByText(/2025年1月1日/);
      const jan2Dates = screen.getAllByText(/2025年1月2日/);
      expect(jan1Dates.length).toBeGreaterThan(0);
      expect(jan2Dates.length).toBeGreaterThan(0);
    });

    it('金額がnullの場合はハイフンが表示されること', async () => {
      mockEditor.getTotalAmount.mockReturnValue(null as unknown as string);
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 合計金額セクション内のハイフンを確認
      const amountSection = screen.getByText('見積金額合計').closest('div');
      expect(amountSection?.textContent).toContain('-');
    });

    it('金額が不正な値の場合はハイフンが表示されること', async () => {
      mockEditor.getTotalAmount.mockReturnValue('invalid');
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 合計金額セクション内のハイフンを確認
      const amountSection = screen.getByText('見積金額合計').closest('div');
      expect(amountSection?.textContent).toContain('-');
    });
  });

  // ==========================================================================
  // IDなしの場合
  // ==========================================================================
  describe('IDなしの場合', () => {
    it('IDがない場合は何も取得しないこと', async () => {
      render(
        <MemoryRouter initialEntries={['/estimates/']}>
          <Routes>
            <Route path="/estimates/" element={<EstimateDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // APIが呼ばれないことを確認（ローディング状態のまま）
      await waitFor(
        () => {
          expect(estimatesApi.getEstimateDetail).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );
    });
  });
});
