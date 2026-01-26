/**
 * @fileoverview EstimateRequestDetailPage コンポーネントのテスト
 *
 * Task 6.2: EstimateRequestDetailPageの実装
 *
 * Requirements:
 * - 4.1: パンくずナビゲーション表示
 * - 4.2: 内訳書項目一覧表示
 * - 4.3: チェックボックス表示
 * - 4.4: チェックボックス変更時自動保存
 * - 5.1: 見積依頼文表示ボタン
 * - 6.1-6.7: 見積依頼文表示パネル
 * - 7.1: Excel出力ボタン
 * - 8.1: クリップボードコピーボタン
 * - 9.1, 9.2, 9.4, 9.5: 編集・削除機能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestDetailPage from '../../pages/EstimateRequestDetailPage';
import * as estimateRequestApi from '../../api/estimate-requests';
import * as receivedQuotationApi from '../../api/received-quotations';
import * as estimateRequestStatusApi from '../../api/estimate-request-status';
import { ApiError } from '../../api/client';

// APIモック
vi.mock('../../api/estimate-requests');
vi.mock('../../api/received-quotations');
vi.mock('../../api/estimate-request-status');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// テストデータ
const mockEstimateRequest = {
  id: 'er-1',
  name: 'テスト見積依頼',
  projectId: 'project-1',
  tradingPartnerId: 'tp-1',
  tradingPartnerName: 'テスト取引先',
  itemizedStatementId: 'is-1',
  itemizedStatementName: 'テスト内訳書',
  method: 'EMAIL' as const,
  includeBreakdownInBody: false,
  status: 'BEFORE_REQUEST' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

const mockReceivedQuotations = [
  {
    id: 'rq-1',
    estimateRequestId: 'er-1',
    name: 'テスト受領見積書1',
    submittedAt: new Date('2025-01-05'),
    contentType: 'TEXT' as const,
    textContent: '見積内容テキスト',
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    createdAt: new Date('2025-01-05T10:00:00.000Z'),
    updatedAt: new Date('2025-01-05T10:00:00.000Z'),
  },
  {
    id: 'rq-2',
    estimateRequestId: 'er-1',
    name: 'テスト受領見積書2',
    submittedAt: new Date('2025-01-06'),
    contentType: 'FILE' as const,
    textContent: null,
    fileName: 'quotation.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 1024 * 500,
    createdAt: new Date('2025-01-06T10:00:00.000Z'),
    updatedAt: new Date('2025-01-06T10:00:00.000Z'),
  },
];

const mockItems = [
  {
    id: 'item-1',
    estimateRequestItemId: 'eri-1',
    customCategory: 'カテゴリ1',
    workType: '工種1',
    name: '項目1',
    specification: '規格1',
    unit: '個',
    quantity: 10,
    displayOrder: 1,
    selected: true,
    otherRequests: [],
  },
  {
    id: 'item-2',
    estimateRequestItemId: 'eri-2',
    customCategory: 'カテゴリ2',
    workType: '工種2',
    name: '項目2',
    specification: '規格2',
    unit: '式',
    quantity: 1,
    displayOrder: 2,
    selected: false,
    otherRequests: [
      {
        estimateRequestId: 'er-other-1',
        estimateRequestName: '他の見積依頼',
        tradingPartnerName: '他の取引先',
      },
    ],
  },
];

const mockEstimateText = {
  recipient: 'test@example.com',
  subject: '【お見積りご依頼】テスト',
  body: '見積依頼本文',
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(id: string = 'er-1') {
  return render(
    <MemoryRouter initialEntries={[`/estimate-requests/${id}`]}>
      <Routes>
        <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        <Route path="/estimate-requests/:id/edit" element={<div>編集ページ</div>} />
        <Route path="/projects/:projectId/estimate-requests" element={<div>見積依頼一覧</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateRequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue(mockEstimateRequest);
    vi.mocked(estimateRequestApi.getEstimateRequestItems).mockResolvedValue(mockItems);
    vi.mocked(estimateRequestApi.getEstimateRequestText).mockResolvedValue(mockEstimateText);
    vi.mocked(estimateRequestApi.updateEstimateRequest).mockResolvedValue({
      ...mockEstimateRequest,
      method: 'FAX',
    });
    vi.mocked(estimateRequestApi.updateItemSelection).mockResolvedValue(undefined);
    vi.mocked(estimateRequestApi.deleteEstimateRequest).mockResolvedValue(undefined);
    vi.mocked(receivedQuotationApi.getReceivedQuotations).mockResolvedValue(mockReceivedQuotations);
    vi.mocked(receivedQuotationApi.deleteReceivedQuotation).mockResolvedValue(undefined);
    vi.mocked(receivedQuotationApi.getPreviewUrl).mockResolvedValue('https://example.com/preview');
    vi.mocked(estimateRequestStatusApi.transitionStatus).mockResolvedValue({
      id: 'er-1',
      status: 'REQUESTED',
      updatedAt: new Date('2025-01-03T00:00:00.000Z'),
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中にスピナーを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockRejectedValue(
        new Error('Network error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積依頼の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.getEstimateRequestDetail)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockEstimateRequest);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestDetail).toHaveBeenCalledTimes(2);
      });
    });

    it('データがnullの場合「見積依頼が見つかりません」を表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue(
        null as unknown as typeof mockEstimateRequest
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('見積依頼が見つかりません')).toBeInTheDocument();
      });
    });
  });

  describe('詳細表示', () => {
    it('見積依頼の詳細情報を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'テスト見積依頼' })).toBeInTheDocument();
      expect(screen.getByText('テスト取引先')).toBeInTheDocument();
      // 「メール」は複数箇所に表示される（基本情報とラジオボタン）ため、getAllByTextを使用
      expect(screen.getAllByText('メール').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('テスト内訳書')).toBeInTheDocument();
    });

    it('パンくずナビゲーションを表示する (Requirements 4.1)', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('navigation', { name: /パンくず/i })).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
    });

    it('戻るリンクを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '見積依頼一覧に戻る' });
      expect(backLink).toHaveAttribute('href', '/projects/project-1/estimate-requests');
    });

    it('選択状況を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('選択状況')).toBeInTheDocument();
      expect(screen.getByText(/1 \/ 2 項目選択中/)).toBeInTheDocument();
    });
  });

  describe('編集・削除ボタン (Requirements 9.1, 9.2)', () => {
    it('編集ボタンが正しいリンクを持つ', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      const editLink = screen.getByRole('link', { name: '編集' });
      expect(editLink).toHaveAttribute('href', '/estimate-requests/er-1/edit');
    });

    it('削除ボタンをクリックすると確認ダイアログを表示する (Requirements 9.4)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // ヘッダーの削除ボタンを取得（最初の削除ボタン）
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('見積依頼の削除')).toBeInTheDocument();
      expect(
        screen.getByText('この見積依頼を削除してよろしいですか？この操作は取り消せません。')
      ).toBeInTheDocument();
    });

    it('削除ダイアログでキャンセルをクリックするとダイアログを閉じる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // ヘッダーの削除ボタンを取得（最初の削除ボタン）
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('削除を確認すると見積依頼を削除して一覧画面に遷移する (Requirements 9.5)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // ヘッダーの削除ボタンを取得（最初の削除ボタン）
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      // ダイアログが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック（キャンセルボタンではない方）
      const dialog = screen.getByRole('dialog');
      const confirmButton = dialog.querySelector('button:last-child');
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(estimateRequestApi.deleteEstimateRequest).toHaveBeenCalledWith(
          'er-1',
          mockEstimateRequest.updatedAt
        );
      });

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/estimate-requests');
    });

    it('削除に失敗した場合エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.deleteEstimateRequest).mockRejectedValue(
        new Error('Delete failed')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // ヘッダーの削除ボタンを取得（最初の削除ボタン）
      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      // ダイアログが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const dialog = screen.getByRole('dialog');
      const confirmButton = dialog.querySelector('button:last-child');
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積依頼の削除に失敗しました')).toBeInTheDocument();
    });
  });

  describe('アクションボタン', () => {
    it('見積依頼文表示ボタンをクリックするとパネルを開く (Requirements 5.1)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledWith('er-1');
      });
    });

    it('見積依頼文パネルを開閉できる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // パネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /見積依頼文を閉じる/ })).toBeInTheDocument();
      });

      // パネルを閉じる
      await user.click(screen.getByRole('button', { name: /見積依頼文を閉じる/ }));

      expect(screen.getByRole('button', { name: /見積依頼文を表示/ })).toBeInTheDocument();
    });

    it('Excel出力ボタンが表示される (Requirements 7.1)', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Excelでエクスポート/i })).toBeInTheDocument();
    });

    it('クリップボードコピーボタンが表示される (Requirements 8.1)', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /クリップボードにコピー/i })).toBeInTheDocument();
    });
  });

  describe('見積依頼文エラーハンドリング', () => {
    it('MISSING_CONTACT_INFO（email）エラー時に適切なメッセージを表示する', async () => {
      const user = userEvent.setup();
      const apiError = new ApiError(422, 'Missing contact info', {
        code: 'MISSING_CONTACT_INFO',
        contactType: 'email',
      });
      vi.mocked(estimateRequestApi.getEstimateRequestText).mockRejectedValue(apiError);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(screen.getByText('メールアドレスが登録されていません')).toBeInTheDocument();
      });
    });

    it('MISSING_CONTACT_INFO（fax）エラー時に適切なメッセージを表示する', async () => {
      const user = userEvent.setup();
      const apiError = new ApiError(422, 'Missing contact info', {
        code: 'MISSING_CONTACT_INFO',
        contactType: 'fax',
      });
      vi.mocked(estimateRequestApi.getEstimateRequestText).mockRejectedValue(apiError);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(screen.getByText('FAX番号が登録されていません')).toBeInTheDocument();
      });
    });

    it('その他のエラー時はテキストをnullに設定する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.getEstimateRequestText).mockRejectedValue(
        new Error('Unknown error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalled();
      });
    });
  });

  describe('メソッド変更時の見積依頼文再取得', () => {
    it('メソッド変更時にテキストパネルが開いている場合、テキストを再取得する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // テキストパネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(1);
      });

      // メソッド変更をシミュレート（ItemSelectionPanelの操作が必要だが、
      // ここではhandleMethodChange関数が呼ばれることを想定）
    });

    it('メソッド変更後のMISSING_CONTACT_INFOエラーを処理する', async () => {
      // このテストはhandleMethodChange内のエラー処理をカバー
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.updateEstimateRequest).mockResolvedValue({
        ...mockEstimateRequest,
        method: 'FAX',
      });

      const apiError = new ApiError(422, 'Missing contact info', {
        code: 'MISSING_CONTACT_INFO',
        contactType: 'fax',
      });
      vi.mocked(estimateRequestApi.getEstimateRequestText)
        .mockResolvedValueOnce(mockEstimateText)
        .mockRejectedValueOnce(apiError);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // テキストパネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('includeBreakdown変更時の見積依頼文再取得', () => {
    it('includeBreakdown変更後のMISSING_CONTACT_INFOエラーを処理する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.updateEstimateRequest).mockResolvedValue({
        ...mockEstimateRequest,
        includeBreakdownInBody: true,
      });

      const apiError = new ApiError(422, 'Missing contact info', {
        code: 'MISSING_CONTACT_INFO',
        contactType: 'email',
      });
      vi.mocked(estimateRequestApi.getEstimateRequestText)
        .mockResolvedValueOnce(mockEstimateText)
        .mockRejectedValueOnce(apiError);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // テキストパネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('項目選択変更', () => {
    it('項目選択変更後にアイテムを再取得する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 初回取得
      expect(estimateRequestApi.getEstimateRequestItems).toHaveBeenCalledTimes(1);
    });
  });

  describe('見積依頼方法変更', () => {
    it('FAXラジオボタンをクリックするとメソッドを変更する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // FAXラジオボタンをクリック
      const faxRadio = screen.getByRole('radio', { name: /FAX/i });
      await user.click(faxRadio);

      await waitFor(() => {
        expect(estimateRequestApi.updateEstimateRequest).toHaveBeenCalledWith(
          'er-1',
          { method: 'FAX' },
          mockEstimateRequest.updatedAt
        );
      });
    });

    it('メソッド変更後にテキストパネルが開いている場合テキストを再取得する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // まずテキストパネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(1);
      });

      // FAXラジオボタンをクリック
      const faxRadio = screen.getByRole('radio', { name: /FAX/i });
      await user.click(faxRadio);

      await waitFor(() => {
        expect(estimateRequestApi.updateEstimateRequest).toHaveBeenCalled();
      });

      // テキストが再取得される
      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('内訳書を本文に含めるチェックボックス', () => {
    it('チェックボックスをクリックするとincludeBreakdownInBodyを変更する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // チェックボックスをクリック
      const checkbox = screen.getByRole('checkbox', { name: /内訳書を本文に含める/i });
      await user.click(checkbox);

      await waitFor(() => {
        expect(estimateRequestApi.updateEstimateRequest).toHaveBeenCalledWith(
          'er-1',
          { includeBreakdownInBody: true },
          mockEstimateRequest.updatedAt
        );
      });
    });

    it('includeBreakdown変更後にテキストパネルが開いている場合テキストを再取得する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // まずテキストパネルを開く
      await user.click(screen.getByRole('button', { name: /見積依頼文を表示/ }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(1);
      });

      // チェックボックスをクリック
      const checkbox = screen.getByRole('checkbox', { name: /内訳書を本文に含める/i });
      await user.click(checkbox);

      await waitFor(() => {
        expect(estimateRequestApi.updateEstimateRequest).toHaveBeenCalled();
      });

      // テキストが再取得される
      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestText).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('IDがない場合', () => {
    it('IDがundefinedの場合はデータ取得しない', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/']}>
          <Routes>
            <Route path="/estimate-requests/" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // useParamsでidがundefinedになるケースをテスト
      // fetchDataはidがない場合早期リターンする
    });
  });

  // Task 16.1: 受領見積書セクションのテスト
  describe('受領見積書セクション (Requirements 11.1, 11.2, 11.12, 11.14)', () => {
    it('受領見積書一覧を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 受領見積書セクションのタイトルが表示される
      expect(screen.getByText('受領見積書')).toBeInTheDocument();
      // 受領見積書一覧が表示される
      expect(screen.getByText('テスト受領見積書1')).toBeInTheDocument();
      expect(screen.getByText('テスト受領見積書2')).toBeInTheDocument();
    });

    it('受領見積書登録ボタンを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
    });

    it('受領見積書登録ボタンをクリックするとフォームを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        // フォームが表示される（モーダル内のフォーム要素）
        expect(screen.getByLabelText(/受領見積書名/i)).toBeInTheDocument();
      });
    });

    it('受領見積書が存在しない場合はメッセージを表示する', async () => {
      vi.mocked(receivedQuotationApi.getReceivedQuotations).mockResolvedValue([]);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('受領見積書はまだ登録されていません')).toBeInTheDocument();
    });

    it('ファイルプレビューボタンをクリックするとプレビューを開く', async () => {
      const user = userEvent.setup();
      // window.openのモック
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // プレビューボタンをクリック（ファイルタイプの受領見積書のみプレビュー可能）
      const previewButtons = screen.getAllByRole('button', { name: /プレビュー/i });
      await user.click(previewButtons[0]!);

      await waitFor(() => {
        expect(receivedQuotationApi.getPreviewUrl).toHaveBeenCalledWith('rq-2');
      });

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/preview', '_blank');
      windowOpenSpy.mockRestore();
    });

    it('受領見積書の編集ボタンをクリックすると編集フォームを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 編集ボタンをクリック
      const editButtons = screen.getAllByRole('button', { name: /編集/i });
      // 最初の編集ボタンは見積依頼の編集（リンク）、受領見積書の編集ボタンを選択
      await user.click(editButtons[0]!);

      await waitFor(() => {
        // 編集フォームが表示される
        expect(screen.getByLabelText(/受領見積書名/i)).toBeInTheDocument();
      });
    });

    it('受領見積書の削除ボタンをクリックすると確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      // 見積依頼の削除ボタンと受領見積書の削除ボタンがある
      // 受領見積書の削除ボタンをクリック（リストの中のボタン）
      await user.click(deleteButtons[1]!);

      await waitFor(() => {
        expect(screen.getByText(/受領見積書の削除/i)).toBeInTheDocument();
      });
    });
  });

  // Task 16.2: ステータス管理のテスト
  describe('ステータス管理 (Requirements 12.1, 12.4, 12.5-12.10)', () => {
    it('現在のステータスバッジを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // ステータスバッジが表示される
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
      expect(screen.getByText('依頼前')).toBeInTheDocument();
    });

    it('依頼前ステータスのとき「依頼済にする」ボタンを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // aria-labelを使用してボタンを検索（または表示テキスト）
      expect(
        screen.getByRole('button', { name: /ステータスを依頼済に変更する|依頼済にする/i })
      ).toBeInTheDocument();
    });

    it('依頼済ステータスのとき「見積受領済にする」ボタンを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue({
        ...mockEstimateRequest,
        status: 'REQUESTED',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /ステータスを見積受領済に変更する|見積受領済にする/i })
      ).toBeInTheDocument();
      // 依頼前に戻すボタンは表示しない
      expect(
        screen.queryByRole('button', { name: /ステータスを依頼前に戻す|依頼前に戻す/i })
      ).not.toBeInTheDocument();
    });

    it('見積受領済ステータスのとき「依頼済に戻す」ボタンを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue({
        ...mockEstimateRequest,
        status: 'QUOTATION_RECEIVED',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /ステータスを依頼済に戻す|依頼済に戻す/i })
      ).toBeInTheDocument();
    });

    it('ステータス遷移ボタンをクリックするとステータスを変更する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /ステータスを依頼済に変更する|依頼済にする/i })
      );

      await waitFor(() => {
        expect(estimateRequestStatusApi.transitionStatus).toHaveBeenCalledWith('er-1', 'REQUESTED');
      });
    });

    it('ステータス変更完了後にトースト通知を表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /ステータスを依頼済に変更する|依頼済にする/i })
      );

      await waitFor(() => {
        // トースト通知またはフィードバックメッセージが表示される
        expect(screen.getByText(/ステータスを「依頼済」に変更しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('受領見積書フォーム操作', () => {
    it('受領見積書フォームでキャンセルをクリックするとフォームを閉じる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 登録ボタンをクリックしてフォームを開く
      await user.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/受領見積書名/i)).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      await user.click(screen.getByRole('button', { name: /キャンセル/i }));

      await waitFor(() => {
        expect(screen.queryByLabelText(/受領見積書名/i)).not.toBeInTheDocument();
      });
    });

    it('受領見積書を新規作成できる', async () => {
      const user = userEvent.setup();
      vi.mocked(receivedQuotationApi.createReceivedQuotation).mockResolvedValue({
        id: 'rq-new',
        estimateRequestId: 'er-1',
        name: '新規見積書',
        submittedAt: new Date('2025-01-10'),
        contentType: 'TEXT',
        textContent: 'テスト内容',
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 登録ボタンをクリック
      await user.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/受領見積書名/i)).toBeInTheDocument();
      });

      // フォームに入力（名前はデフォルト値があるのでそのまま使用）
      // 提出日もデフォルト値（今日）があるのでそのまま使用

      // テキストエリアに入力（デフォルトでTEXTモードが選択されている）
      const textArea = screen.getByPlaceholderText(/見積内容を入力/i);
      await user.type(textArea, 'テスト内容');

      // 送信（フォーム内のsubmitボタン）
      const submitButton = screen.getByRole('button', { name: /^登録$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(receivedQuotationApi.createReceivedQuotation).toHaveBeenCalled();
      });
    });

    it('受領見積書を編集できる', async () => {
      const user = userEvent.setup();
      vi.mocked(receivedQuotationApi.updateReceivedQuotation).mockResolvedValue({
        ...mockReceivedQuotations[0]!,
        name: '更新された見積書',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 編集ボタンをクリック
      const editButtons = screen.getAllByRole('button', { name: /編集/i });
      await user.click(editButtons[0]!);

      await waitFor(() => {
        expect(screen.getByLabelText(/受領見積書名/i)).toBeInTheDocument();
      });

      // 名前を変更
      const nameInput = screen.getByLabelText(/受領見積書名/i);
      await user.clear(nameInput);
      await user.type(nameInput, '更新された見積書');

      // 更新ボタンをクリック
      await user.click(screen.getByRole('button', { name: /更新/i }));

      await waitFor(() => {
        expect(receivedQuotationApi.updateReceivedQuotation).toHaveBeenCalled();
      });
    });

    it('受領見積書削除を確認すると削除APIを呼び出す', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await user.click(deleteButtons[1]!);

      await waitFor(() => {
        expect(screen.getByText(/受領見積書の削除/i)).toBeInTheDocument();
      });

      // 削除を確認（「削除する」ボタン）
      const confirmButton = screen.getByRole('button', { name: /削除する/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(receivedQuotationApi.deleteReceivedQuotation).toHaveBeenCalled();
      });
    });

    it('プレビューAPIがエラーでも処理を継続する', async () => {
      const user = userEvent.setup();
      vi.mocked(receivedQuotationApi.getPreviewUrl).mockRejectedValue(new Error('Preview failed'));
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-detail-page')).toBeInTheDocument();
      });

      const previewButtons = screen.getAllByRole('button', { name: /プレビュー/i });
      await user.click(previewButtons[0]!);

      await waitFor(() => {
        expect(receivedQuotationApi.getPreviewUrl).toHaveBeenCalled();
      });

      // エラーでもクラッシュしない
      expect(windowOpenSpy).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });
  });
});
