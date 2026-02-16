/**
 * @fileoverview EstimateDetailPage テスト
 *
 * Task 11.3: EstimateDetailPageの実装
 *
 * Requirements (estimate-creation):
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
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

// モック
vi.mock('../api/estimates');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-001',
  sourceItemizedStatementName: '内訳書A',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [
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
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '100000',
          amount: '100000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'line-002',
          estimateItemId: 'item-001',
          lineType: 'EXECUTION' as const,
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '90000',
          amount: '90000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'line-003',
          estimateItemId: 'item-001',
          lineType: 'VENDOR' as const,
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '85000',
          amount: '85000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
      children: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  totalAmount: '100000',
};

describe('EstimateDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockReset();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
  });

  /**
   * REQ-14.8: 見積書画面を提供する
   */
  it('見積書詳細画面が正しくレンダリングされる', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // h1要素で見積書名が表示される
    expect(screen.getByRole('heading', { level: 1, name: 'テスト見積書' })).toBeInTheDocument();
  });

  /**
   * REQ-11.2: 見積書の詳細を表示する
   */
  it('見積書の基本情報を表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // h1要素で見積書名が表示される
      expect(screen.getByRole('heading', { level: 1, name: 'テスト見積書' })).toBeInTheDocument();
    });

    // 参照内訳書名の表示
    expect(screen.getByText('内訳書A')).toBeInTheDocument();
  });

  /**
   * REQ-14.9: 見積項目一覧を表示する
   */
  it('見積項目一覧を表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 見積項目セクションのタイトルが表示される
      expect(screen.getByRole('heading', { name: '見積項目' })).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.9: 合計金額を表示する
   */
  it('合計金額を表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 合計金額セクションのタイトルが表示される
      expect(screen.getByRole('heading', { name: 'サマリー' })).toBeInTheDocument();
      // 金額が複数箇所に表示されるためgetAllByTextを使用
      expect(screen.getAllByText(/100,000/).length).toBeGreaterThan(0);
    });
  });

  /**
   * REQ-14.10: 編集ボタンを提供する
   */
  it('編集ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /編集/i })).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.10: 削除ボタンを提供する
   */
  it('削除ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * REQ-14.10: 出力ボタンを提供する
   */
  it('出力ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /出力/i })).toBeInTheDocument();
    });
  });

  /**
   * REQ-15.4-15.8: パンくずナビゲーション
   */
  it('パンくずナビゲーションを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト詳細')).toBeInTheDocument();
      expect(screen.getByText('見積書一覧')).toBeInTheDocument();
      // パンくずで見積書名が表示される (複数箇所に表示されるためgetAllByTextを使用)
      expect(screen.getAllByText('テスト見積書').length).toBeGreaterThan(0);
    });
  });

  /**
   * 削除ボタンクリックで確認ダイアログを表示する
   */
  it('削除ボタンクリックで確認ダイアログを表示する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    // ヘッダーの削除ボタン（有効なもの）を取得
    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/削除してよろしいですか/i)).toBeInTheDocument();
    });
  });

  /**
   * 削除確認ダイアログでキャンセルするとダイアログが閉じる
   */
  it('削除確認ダイアログでキャンセルするとダイアログが閉じる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  /**
   * 削除確認ダイアログで削除を実行する
   */
  it('削除確認ダイアログで削除を実行すると一覧画面に遷移する', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.deleteEstimate).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // ダイアログ内の削除ボタンを取得（複数ある場合は最後の要素）
    const dialogDeleteButtons = screen.getAllByRole('button', { name: /^削除$/ });
    const confirmButton = dialogDeleteButtons[dialogDeleteButtons.length - 1]!;
    await user.click(confirmButton);

    await waitFor(() => {
      expect(estimatesApi.deleteEstimate).toHaveBeenCalledWith(
        'est-001',
        mockEstimateDetail.updatedAt
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/estimates');
  });

  /**
   * ローディング状態のテスト
   */
  it('ローディング中はスピナーを表示する', async () => {
    vi.mocked(estimatesApi.getEstimateDetail).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
   */
  it('エラー時はエラーメッセージと再試行ボタンを表示する', async () => {
    vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  /**
   * 編集モード切り替えのテスト
   */
  it('編集ボタンクリックで編集モードに切り替わる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /編集/i })).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /編集/i });
    await user.click(editButton);

    await waitFor(() => {
      // 編集モードで保存・キャンセルボタンが表示される
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });
  });

  /**
   * 出力ボタンクリックで出力ダイアログを表示する
   */
  it('出力ボタンクリックで出力ダイアログを表示する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /出力/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /出力/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/出力形式を選択/i)).toBeInTheDocument();
    });
  });
});
