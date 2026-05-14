/**
 * @fileoverview EstimateRequestDetailPage単体テスト
 *
 * Task 6.2: EstimateRequestDetailPageの実装
 * Task 26.3: EstimateRequestDetailPageの受領見積書セクション再統合
 *
 * Requirements:
 * - 4.1: 見積依頼詳細画面にパンくずナビゲーションを表示する
 * - 9.1: 見積依頼詳細画面に編集ボタンを表示する
 * - 9.2: 見積依頼詳細画面に削除ボタンを表示する
 * - 9.4: ユーザーが削除ボタンをクリックしたとき、削除確認ダイアログを表示する
 * - 9.5: ユーザーが削除を確認したとき、見積依頼を論理削除し一覧画面に遷移する
 * - 11.1, 11.2, 11.25, 11.28, 11.29, 11.30: 受領見積書セクション統合
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestDetailPage from './EstimateRequestDetailPage';

// Task 26.3: ReceivedQuotationFormをモックして、FileInlinePreview/pdfjs-distの問題を回避
vi.mock('../components/estimate-requests/ReceivedQuotationForm', () => ({
  ReceivedQuotationForm: ({
    onSubmit,
    onCancel,
    isSubmitting,
  }: {
    mode?: 'create' | 'edit';
    onSubmit: (data: unknown) => void;
    onCancel: () => void;
    isSubmitting: boolean;
  }) => (
    <div data-testid="received-quotation-form">
      <div>受領見積書名</div>
      <div>提出日</div>
      <div>ファイルをドラッグ&ドロップ</div>
      <div>明細行</div>
      <button type="button" onClick={() => onSubmit({})}>
        保存
      </button>
      <button type="button" onClick={onCancel}>
        キャンセル
      </button>
      <button type="button">行を追加</button>
      {isSubmitting && <span>送信中...</span>}
    </div>
  ),
}));

// Mock modules (must be before mock data because of hoisting)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Req 38.6, 38.7: useAuth は SessionExpiredModal 状態の購読にのみ使用するため、
// 単体テストでは AuthProvider を立ち上げず、必要なフィールドだけ返すモックで十分。
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ sessionExpiredDuringOperation: false }),
}));

vi.mock('../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({ name: 'テストプロジェクト' }),
}));

vi.mock('../api/estimate-requests', () => ({
  getEstimateRequestDetail: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    status: 'BEFORE_REQUEST',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  getEstimateRequestItems: vi.fn().mockResolvedValue([
    {
      id: 'item-1',
      estimateRequestItemId: 'eri-1',
      customCategory: 'カテゴリA',
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
      customCategory: 'カテゴリB',
      workType: '工種2',
      name: '項目2',
      specification: '規格2',
      unit: 'm',
      quantity: 20,
      displayOrder: 2,
      selected: false,
      otherRequests: [
        {
          estimateRequestId: 'er-other',
          estimateRequestName: '他の見積',
          tradingPartnerName: '他社',
        },
      ],
    },
  ]),
  getEstimateRequestText: vi.fn().mockResolvedValue({
    recipient: 'test@example.com',
    subject: 'テストプロジェクト 御見積依頼',
    body: '本文テスト',
  }),
  updateEstimateRequest: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    status: 'BEFORE_REQUEST',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  updateItemSelection: vi.fn().mockResolvedValue(undefined),
  deleteEstimateRequest: vi.fn().mockResolvedValue(undefined),
}));

// Task 26.3: 明細行データを含む受領見積書サンプルデータ（モックの外で定義）
vi.mock('../api/received-quotations', () => ({
  getReceivedQuotations: vi.fn().mockResolvedValue([
    {
      id: 'rq-1',
      estimateRequestId: 'er-123',
      name: '見積書A',
      submittedAt: new Date('2025-01-15'),
      fileName: 'estimate.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 1024 * 500,
      lineItems: [
        {
          id: 'li-1',
          receivedQuotationId: 'rq-1',
          sortOrder: 1,
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
          receivedQuotationId: 'rq-1',
          sortOrder: 2,
          name: '作業費',
          specification: null,
          unit: '式',
          quantity: 1,
          unitPrice: 20000,
          amount: 20000,
          remarks: null,
        },
      ],
      totalAmount: 30000,
      createdAt: new Date('2025-01-16T10:00:00'),
      updatedAt: new Date('2025-01-16T10:00:00'),
    },
  ]),
  createReceivedQuotation: vi.fn().mockResolvedValue({}),
  updateReceivedQuotation: vi.fn().mockResolvedValue({}),
  deleteReceivedQuotation: vi.fn().mockResolvedValue(undefined),
  getPreviewUrl: vi.fn().mockResolvedValue('https://example.com/preview'),
}));

// Task 75.1: 現場調査API・サービスのモック
vi.mock('../api/site-surveys', () => ({
  getSiteSurveys: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'survey-1',
        projectId: 'project-123',
        name: '現場調査A',
        surveyDate: '2025-02-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 3,
        createdAt: '2025-02-01T00:00:00.000Z',
        updatedAt: '2025-02-01T00:00:00.000Z',
      },
      {
        id: 'survey-2',
        projectId: 'project-123',
        name: '現場調査B',
        surveyDate: '2025-03-01',
        memo: null,
        thumbnailUrl: null,
        imageCount: 0,
        createdAt: '2025-03-01T00:00:00.000Z',
        updatedAt: '2025-03-01T00:00:00.000Z',
      },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  }),
  getSiteSurvey: vi.fn().mockResolvedValue({
    id: 'survey-1',
    projectId: 'project-123',
    name: '現場調査A',
    surveyDate: '2025-02-01',
    memo: null,
    thumbnailUrl: null,
    imageCount: 3,
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    project: { id: 'project-123', name: 'テストプロジェクト' },
    images: [
      {
        id: 'img-1',
        surveyId: 'survey-1',
        originalPath: 'path/img1.jpg',
        thumbnailPath: 'path/thumb1.jpg',
        originalUrl: 'https://example.com/img1.jpg',
        fileName: 'img1.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 1,
        createdAt: '2025-02-01T00:00:00.000Z',
        includeInReport: true,
        comment: '写真1コメント',
      },
      {
        id: 'img-2',
        surveyId: 'survey-1',
        originalPath: 'path/img2.jpg',
        thumbnailPath: 'path/thumb2.jpg',
        originalUrl: 'https://example.com/img2.jpg',
        fileName: 'img2.jpg',
        fileSize: 2048,
        width: 800,
        height: 600,
        displayOrder: 2,
        createdAt: '2025-02-01T00:00:00.000Z',
        includeInReport: true,
        comment: null,
      },
      {
        id: 'img-3',
        surveyId: 'survey-1',
        originalPath: 'path/img3.jpg',
        thumbnailPath: 'path/thumb3.jpg',
        originalUrl: 'https://example.com/img3.jpg',
        fileName: 'img3.jpg',
        fileSize: 512,
        width: 800,
        height: 600,
        displayOrder: 3,
        createdAt: '2025-02-01T00:00:00.000Z',
        includeInReport: false,
        comment: null,
      },
    ],
  }),
}));

vi.mock('../services/export/AnnotationRendererService', () => ({
  renderImagesForReport: vi.fn().mockResolvedValue([
    {
      imageInfo: {
        id: 'img-1',
        surveyId: 'survey-1',
        originalPath: 'path/img1.jpg',
        thumbnailPath: 'path/thumb1.jpg',
        fileName: 'img1.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 1,
        createdAt: '2025-02-01T00:00:00.000Z',
        includeInReport: true,
        comment: '写真1コメント',
      },
      dataUrl: 'data:image/jpeg;base64,abc123',
    },
  ]),
}));

vi.mock('../services/export/PdfExportService', () => ({
  exportAndDownloadPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/estimate-request-status', () => ({
  transitionStatus: vi.fn().mockResolvedValue({
    id: 'er-123',
    status: 'REQUESTED',
    updatedAt: new Date(),
  }),
  getStatusHistory: vi.fn().mockResolvedValue([]),
}));

describe('EstimateRequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test: ページ見出しが表示されること
   */
  it('ページ見出し（見積依頼名）が表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'テスト見積依頼' })).toBeInTheDocument();
    });
  });

  /**
   * Test: パンくずナビゲーションが表示されること
   * Requirements: 4.1
   */
  it('パンくずナビゲーションが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // パンくずに「見積依頼一覧」が含まれる
      expect(screen.getByText('見積依頼一覧')).toBeInTheDocument();
    });
  });

  /**
   * Test: 編集ボタンが表示されること
   * Requirements: 9.1
   */
  it('編集ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /編集/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: 削除ボタンが表示されること
   * Requirements: 9.2
   */
  it('削除ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // ヘッダーの削除ボタンを取得（最初の削除ボタン）
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons[0]).toBeInTheDocument();
    });
  });

  /**
   * Test: 削除ボタンクリックで確認ダイアログが表示されること
   * Requirements: 9.4
   */
  it('削除ボタンクリックで確認ダイアログが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons[0]).toBeInTheDocument();
    });

    // ヘッダーの削除ボタンを取得（最初の削除ボタン）
    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/削除してよろしいですか/i)).toBeInTheDocument();
    });
  });

  /**
   * Test: 項目選択パネルが表示されること
   */
  it('項目選択パネルが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 項目テーブルのヘッダーが表示される
      expect(screen.getByText('選択')).toBeInTheDocument();
      expect(screen.getByText('任意分類')).toBeInTheDocument();
    });
  });

  /**
   * Test: 見積依頼文表示ボタンが表示されること
   */
  it('見積依頼文表示ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /見積依頼文を表示/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: Excelエクスポートボタンが表示されること
   */
  it('Excelエクスポートボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Excelでエクスポート/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: ローディング状態が表示されること
   */
  it('ローディング状態が表示されること', () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
        <Routes>
          <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
  });

  // ============================================================================
  // Task 26.3: 受領見積書セクション再統合テスト (11.1, 11.2, 11.25, 11.28, 11.29, 11.30)
  // ============================================================================

  describe('受領見積書セクション統合 (Task 26.3)', () => {
    /**
     * Test: 受領見積書セクションが表示されること
     * Requirements: 11.1
     */
    it('受領見積書セクションが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // 受領見積書セクションの見出しが表示される
        expect(screen.getByText('受領見積書')).toBeInTheDocument();
      });
    });

    /**
     * Test: 受領見積書登録ボタンが表示されること
     * Requirements: 11.1
     */
    it('受領見積書登録ボタンが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
      });
    });

    /**
     * Test: 受領見積書一覧に明細行数と合計金額が表示されること
     * Requirements: 11.25
     */
    it('受領見積書一覧に明細行数と合計金額が表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // 明細行数（2行）が表示される
        expect(screen.getByText(/2行/)).toBeInTheDocument();
        // 合計金額（30,000円）が表示される
        expect(screen.getByText(/30,000/)).toBeInTheDocument();
      });
    });

    /**
     * Test: 受領見積書登録ボタンクリックでフォームモーダルが表示されること
     * Requirements: 11.2
     */
    it('受領見積書登録ボタンクリックでフォームモーダルが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
      });

      // 登録ボタンをクリック
      fireEvent.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        // モーダルタイトルが表示される
        expect(screen.getByText('受領見積書の登録')).toBeInTheDocument();
      });
    });

    /**
     * Test: フォームモーダルにファイルアップロードエリアが表示されること
     * Requirements: 11.28, 11.29
     */
    it('フォームモーダルにファイルアップロードエリアが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
      });

      // 登録ボタンをクリック
      fireEvent.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        // ファイルアップロードエリアが表示される（ドロップゾーンのテキスト）
        expect(screen.getByText(/ファイルをドラッグ&ドロップ/i)).toBeInTheDocument();
      });
    });

    /**
     * Test: フォームモーダルに明細行エディタが表示されること
     * Requirements: 11.29
     */
    it('フォームモーダルに明細行エディタが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
      });

      // 登録ボタンをクリック
      fireEvent.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        // 明細行エディタのヘッダーが表示される
        expect(screen.getByText('明細行')).toBeInTheDocument();
        // 行追加ボタンが表示される
        expect(screen.getByRole('button', { name: /行を追加/i })).toBeInTheDocument();
      });
    });

    /**
     * Test: 受領見積書一覧項目をクリックして編集フォームが表示されること
     * Requirements: 11.28
     */
    it('受領見積書の編集ボタンクリックで編集フォームモーダルが表示されること', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // 見積書A（受領見積書）が表示される
        expect(screen.getByText('見積書A')).toBeInTheDocument();
      });

      // 編集ボタンをクリック（受領見積書一覧内の編集ボタン）
      // 複数の編集ボタンがあるので、受領見積書アイテム内の編集ボタンを取得
      const quotationItem = screen.getByTestId('received-quotation-item');
      const allButtonsInItem = quotationItem.querySelectorAll('button');
      // 編集ボタンは2番目のボタン（プレビュー、編集、削除の順）
      const actualEditButton = Array.from(allButtonsInItem).find((btn) =>
        btn.textContent?.includes('編集')
      );
      if (actualEditButton) {
        fireEvent.click(actualEditButton);
      }

      await waitFor(() => {
        // 編集モーダルタイトルが表示される
        expect(screen.getByText('受領見積書の編集')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 67.3: パンくずナビゲーション改善テスト (Requirements: 29.13-29.19)
  // ==========================================================================
  describe('パンくずナビゲーション改善 (Task 67.3)', () => {
    const renderPage = () => {
      return render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    };

    it('パンくず先頭に「ダッシュボード」リンク（/）が表示される（Requirements: 29.13, 29.14）', async () => {
      renderPage();

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toBeInTheDocument();
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンク（/projects）が表示される（Requirements: 29.15）', async () => {
      renderPage();

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toBeInTheDocument();
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずにプロジェクト名がプロジェクト詳細へのリンクとして表示される（Requirements: 29.16）', async () => {
      renderPage();

      await waitFor(() => {
        const projectLink = screen.getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toBeInTheDocument();
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずに「見積依頼一覧」が見積依頼一覧画面へのリンクとして表示される（Requirements: 29.17）', async () => {
      renderPage();

      await waitFor(() => {
        const listLink = screen.getByRole('link', { name: '見積依頼一覧' });
        expect(listLink).toBeInTheDocument();
        expect(listLink).toHaveAttribute('href', '/projects/project-123/estimate-requests');
      });
    });

    it('パンくずの最後に見積依頼名がリンクなしで表示される（Requirements: 29.18）', async () => {
      renderPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toHaveTextContent('テスト見積依頼');
        // 「テスト見積依頼」はリンクではない
        const links = nav.querySelectorAll('a');
        const detailLink = Array.from(links).find((link) => link.textContent === 'テスト見積依頼');
        expect(detailLink).toBeUndefined();
      });
    });

    it('「← 見積依頼一覧に戻る」リンクが存在しない（Requirements: 29.19）', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト見積依頼' })).toBeInTheDocument();
      });

      // 「← 見積依頼一覧に戻る」リンクが存在しないことを確認
      expect(screen.queryByRole('link', { name: /見積依頼一覧に戻る/i })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 73.2: ダイアログ横幅拡大のユニットテスト (Requirements: 32.1, 32.2)
  // ==========================================================================
  describe('ダイアログ横幅拡大 (Task 73.2)', () => {
    it('受領見積書ダイアログのmaxWidthが95vw、widthが1400pxである (Requirements: 32.1, 32.2)', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /受領見積書登録/i })).toBeInTheDocument();
      });

      // 登録ボタンをクリックしてモーダルを開く
      fireEvent.click(screen.getByRole('button', { name: /受領見積書登録/i }));

      await waitFor(() => {
        expect(screen.getByText('受領見積書の登録')).toBeInTheDocument();
      });

      // モーダルタイトル（h3）の親要素がmodalContentスタイルを持つdivであることを確認
      const modalTitle = screen.getByText('受領見積書の登録');
      const modalContent = modalTitle.parentElement!;
      expect(modalContent.style.maxWidth).toBe('95vw');
      expect(modalContent.style.width).toBe('1400px');
    });
  });

  // ==========================================================================
  // Task 75.1: 現場調査報告書出力のユニットテスト (Requirements: 35.1-35.11)
  // ==========================================================================
  describe('現場調査報告書出力 (Task 75.1)', () => {
    it('アクションセクションに「現場調査報告書出力」ボタンが表示される (Requirements: 35.1)', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });
    });

    it('ボタンクリック時に現場調査一覧取得APIが呼び出される (Requirements: 35.2)', async () => {
      const { getSiteSurveys } = await import('../api/site-surveys');
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(getSiteSurveys).toHaveBeenCalledWith('project-123', expect.any(Object));
      });
    });

    it('現場調査一覧取得後にドロップダウンが表示され、調査名と調査日が表示される (Requirements: 35.3)', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        // ドロップダウン（select要素）が表示される
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // 調査名と調査日が表示される
      expect(screen.getByText(/現場調査A/)).toBeInTheDocument();
      expect(screen.getByText(/現場調査B/)).toBeInTheDocument();
    });

    it('現場調査0件時に「現場調査が登録されていません」メッセージが表示される (Requirements: 35.9)', async () => {
      const { getSiteSurveys } = await import('../api/site-surveys');
      (getSiteSurveys as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(screen.getByText(/現場調査が登録されていません/)).toBeInTheDocument();
      });
    });

    it('未選択で出力ボタンクリック時にバリデーションエラーが表示される (Requirements: 35.10)', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // 未選択のまま出力ボタンをクリック
      const generateButton = screen.getByRole('button', { name: '出力' });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText(/現場調査を選択してください/)).toBeInTheDocument();
      });
    });

    it('現場調査選択後の出力ボタンクリック時に詳細取得・画像レンダリング・PDF生成が順次呼び出される (Requirements: 35.5, 35.6)', async () => {
      const { getSiteSurvey } = await import('../api/site-surveys');
      const { renderImagesForReport } =
        await import('../services/export/AnnotationRendererService');
      const { exportAndDownloadPdf } = await import('../services/export/PdfExportService');

      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // 現場調査を選択
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'survey-1' } });

      // 出力ボタンをクリック
      const generateButton = screen.getByRole('button', { name: '出力' });
      fireEvent.click(generateButton);

      // 詳細取得→画像レンダリング→PDF生成の順で呼び出される
      await waitFor(() => {
        expect(getSiteSurvey).toHaveBeenCalledWith('survey-1');
      });
      await waitFor(() => {
        expect(renderImagesForReport).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(exportAndDownloadPdf).toHaveBeenCalled();
      });
    });

    it('PDF生成失敗時にエラーメッセージが表示される (Requirements: 35.11)', async () => {
      const { exportAndDownloadPdf } = await import('../services/export/PdfExportService');
      (exportAndDownloadPdf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('PDF生成に失敗')
      );

      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // 現場調査を選択
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'survey-1' } });

      // 出力ボタンをクリック
      const generateButton = screen.getByRole('button', { name: '出力' });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText(/報告書の出力に失敗しました/)).toBeInTheDocument();
      });
    });

    it('「キャンセル」ボタンクリック時にドロップダウンが閉じる (Requirements: 35.4)', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /現場調査報告書出力/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /現場調査報告書出力/ }));

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // 「閉じる」ボタンを探す
      const closeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent === '閉じる');
      expect(closeButtons.length).toBeGreaterThan(0);
      fireEvent.click(closeButtons[0]!);

      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 84.3: 内訳書未紐付け時の条件レンダリング (Requirements: 39.7, 39.8, 39.10, 39.11, 39.12)
  // ==========================================================================
  describe('内訳書未紐付け時の条件レンダリング (Task 84.3)', () => {
    /**
     * 内訳書未紐付けの見積依頼を mock するヘルパー（itemizedStatementId / Name を null に上書き）
     */
    const mockNoItemizedStatement = async () => {
      const { getEstimateRequestDetail, getEstimateRequestItems } =
        await import('../api/estimate-requests');
      (getEstimateRequestDetail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'er-456',
        projectId: 'project-123',
        tradingPartnerId: 'tp-1',
        tradingPartnerName: '協力業者A',
        itemizedStatementId: null,
        itemizedStatementName: null,
        name: '内訳書なし見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        status: 'BEFORE_REQUEST',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      // 内訳書未紐付けの場合、項目は空配列で返ってくる想定
      (getEstimateRequestItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    };

    const renderPage = () => {
      return render(
        <MemoryRouter initialEntries={['/estimate-requests/er-456']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    };

    it('内訳書未紐付け時に「項目選択」セクションが非表示になる (Requirements: 39.7)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // 「項目選択」セクションの h2 見出しが表示されないこと
      expect(screen.queryByRole('heading', { name: '項目選択' })).not.toBeInTheDocument();
      // ItemSelectionPanel 内のテーブルヘッダー「任意分類」が表示されないこと
      expect(screen.queryByText('任意分類')).not.toBeInTheDocument();
    });

    it('内訳書未紐付け時に Excel 出力ボタンが非表示になる (Requirements: 39.8)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // ExcelExportButton はボタンテキストが "Excelでエクスポート"。aria-label は項目数で変動するため
      // ボタンテキストで非表示を確認する。
      expect(screen.queryByText('Excelでエクスポート')).not.toBeInTheDocument();
    });

    it('内訳書未紐付け時に「参照内訳書」が "-" として表示される (Requirements: 39.7)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // 「参照内訳書」ラベルが表示され、その値として "-" が表示される
      const label = screen.getByText('参照内訳書');
      // ラベル要素の親 (.infoItem) に "-" が含まれる
      const parent = label.parentElement!;
      expect(parent.textContent).toContain('-');
    });

    it('内訳書未紐付け時にも「見積依頼方法」ラジオボタン相当の表示は維持される (Requirements: 39.10)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // 基本情報セクション内に「見積依頼方法」表示が残っていること
      expect(screen.getByText('見積依頼方法')).toBeInTheDocument();
    });

    it('内訳書未紐付け時にも受領見積書セクションが表示される (Requirements: 39.11)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // 受領見積書セクションの見出しが表示される
      expect(screen.getByText('受領見積書')).toBeInTheDocument();
    });

    it('内訳書未紐付け時にもステータス遷移ボタン（既存挙動）は表示される (Requirements: 39.12)', async () => {
      await mockNoItemizedStatement();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書なし見積依頼' })).toBeInTheDocument();
      });

      // ステータスセクションの見出しは表示される（StatusBadge 等を含む）
      expect(screen.getByRole('heading', { name: 'ステータス' })).toBeInTheDocument();
    });

    it('内訳書紐付けあり（既存）の挙動は維持される (Requirements: 39.12)', async () => {
      // mock は上書きしない（既存のデフォルトモック: itemizedStatementId='is-1'）
      render(
        <MemoryRouter initialEntries={['/estimate-requests/er-123']}>
          <Routes>
            <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト見積依頼' })).toBeInTheDocument();
      });

      // 項目選択セクション、Excel ボタン、参照内訳書名（'内訳書1'）が従来通り表示される
      expect(screen.getByRole('heading', { name: '項目選択' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Excelでエクスポート/i })).toBeInTheDocument();
      expect(screen.getByText('内訳書1')).toBeInTheDocument();
    });
  });
});
