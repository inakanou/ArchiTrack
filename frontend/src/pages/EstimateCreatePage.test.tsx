/**
 * @fileoverview EstimateCreatePage テスト
 *
 * Task 11.2: EstimateCreatePageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-3.1: 見積書新規作成を選択した場合、内訳書の選択画面を表示する
 * - REQ-3.2: 内訳書を選択した場合、見積金額行の初期値として設定する
 * - REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - REQ-3.4: 見積書をプロジェクトに紐付けて保存する
 * - REQ-3.5: 内訳書が選択された場合、名称・規格・単位・数量を見積金額行に転記する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateCreatePage from './EstimateCreatePage';
import * as estimatesApi from '../api/estimates';
import * as itemizedStatementsApi from '../api/itemized-statements';

// モック
vi.mock('../api/estimates');
vi.mock('../api/itemized-statements');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockItemizedStatements = [
  {
    id: 'is-001',
    name: '内訳書A',
    projectId: 'proj-001',
    sourceQuantityTableId: 'qt-001',
    sourceQuantityTableName: '数量表A',
    itemCount: 5,
    createdAt: '2024-01-10T10:00:00.000Z',
    updatedAt: '2024-01-10T10:00:00.000Z',
  },
  {
    id: 'is-002',
    name: '内訳書B',
    projectId: 'proj-001',
    sourceQuantityTableId: 'qt-002',
    sourceQuantityTableName: '数量表B',
    itemCount: 3,
    createdAt: '2024-01-11T10:00:00.000Z',
    updatedAt: '2024-01-11T10:00:00.000Z',
  },
];

const mockCreatedEstimate = {
  id: 'est-001',
  projectId: 'proj-001',
  name: '新規見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
};

describe('EstimateCreatePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockReset();
    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue({
      data: mockItemizedStatements,
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
  });

  /**
   * ページが正しくレンダリングされる
   */
  it('見積書作成画面が正しくレンダリングされる', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /見積書作成/i })).toBeInTheDocument();
  });

  /**
   * REQ-3.1: 内訳書の選択画面を表示する
   */
  it('内訳書選択セレクトボックスを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/内訳書を選択/i)).toBeInTheDocument();
    });
  });

  /**
   * REQ-3.1: 内訳書一覧をオプションとして表示する
   */
  it('内訳書一覧をオプションとして表示する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/内訳書を選択/i)).toBeInTheDocument();
    });

    // セレクトボックスをクリック
    const select = screen.getByLabelText(/内訳書を選択/i);
    await user.click(select);

    // 内訳書オプションを確認
    expect(screen.getByText('内訳書A')).toBeInTheDocument();
    expect(screen.getByText('内訳書B')).toBeInTheDocument();
    expect(screen.getByText('選択しない')).toBeInTheDocument();
  });

  /**
   * 見積書名入力フィールドを表示する
   */
  it('見積書名入力フィールドを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/見積書名/i)).toBeInTheDocument();
    });
  });

  /**
   * REQ-3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
   * REQ-25.1: デフォルト値「見積書」が設定されている
   */
  it('内訳書を選択せずに見積書を作成できる', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.createEstimate).mockResolvedValue(mockCreatedEstimate);

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/見積書名/i)).toBeInTheDocument();
    });

    // デフォルト値「見積書」をクリアして新規名を入力
    const nameInput = screen.getByLabelText(/見積書名/i);
    await user.clear(nameInput);
    await user.type(nameInput, '新規見積書');

    // 作成ボタンをクリック
    const submitButton = screen.getByRole('button', { name: /作成/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(estimatesApi.createEstimate).toHaveBeenCalledWith('proj-001', {
        name: '新規見積書',
      });
    });

    // 詳細画面に遷移
    expect(mockNavigate).toHaveBeenCalledWith('/estimates/est-001');
  });

  /**
   * REQ-3.2: 内訳書を選択した場合、見積金額行の初期値として設定する
   * REQ-25.1: デフォルト値「見積書」が設定されている
   */
  it('内訳書を選択して見積書を作成できる', async () => {
    const user = userEvent.setup();
    const estimateWithItemizedStatement = {
      ...mockCreatedEstimate,
      sourceItemizedStatementId: 'is-001',
      sourceItemizedStatementName: '内訳書A',
    };
    vi.mocked(estimatesApi.createEstimate).mockResolvedValue(estimateWithItemizedStatement);

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/見積書名/i)).toBeInTheDocument();
    });

    // デフォルト値「見積書」をクリアして新規名を入力
    const nameInput = screen.getByLabelText(/見積書名/i);
    await user.clear(nameInput);
    await user.type(nameInput, '新規見積書');

    // 内訳書を選択
    const select = screen.getByLabelText(/内訳書を選択/i);
    await user.selectOptions(select, 'is-001');

    // 作成ボタンをクリック
    const submitButton = screen.getByRole('button', { name: /作成/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(estimatesApi.createEstimate).toHaveBeenCalledWith('proj-001', {
        name: '新規見積書',
        sourceItemizedStatementId: 'is-001',
      });
    });

    // 詳細画面に遷移
    expect(mockNavigate).toHaveBeenCalledWith('/estimates/est-001');
  });

  /**
   * 見積書名が空の場合、作成できない
   * REQ-25.1: デフォルト値「見積書」が設定されているため、空にするにはクリアが必要
   */
  it('見積書名が空の場合、作成ボタンが無効になる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/見積書名/i)).toBeInTheDocument();
    });

    // デフォルト値「見積書」をクリアして空にする
    const nameInput = screen.getByLabelText(/見積書名/i);
    await user.clear(nameInput);

    const submitButton = screen.getByRole('button', { name: /作成/i });
    expect(submitButton).toBeDisabled();
  });

  /**
   * キャンセルボタンで一覧画面に戻る
   */
  it('キャンセルボタンで一覧画面に戻る', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/estimates');
  });

  /**
   * パンくずナビゲーションを表示する
   */
  it('パンくずナビゲーションを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト詳細')).toBeInTheDocument();
      expect(screen.getByText('見積書一覧')).toBeInTheDocument();
      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });
  });

  /**
   * API エラー時にエラーメッセージを表示する
   */
  it('API エラー時にエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.createEstimate).mockRejectedValue(new Error('作成に失敗しました'));

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
        <Routes>
          <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/見積書名/i)).toBeInTheDocument();
    });

    // 見積書名を入力
    const nameInput = screen.getByLabelText(/見積書名/i);
    await user.type(nameInput, '新規見積書');

    // 作成ボタンをクリック
    const submitButton = screen.getByRole('button', { name: /作成/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/見積書の作成に失敗しました/i)).toBeInTheDocument();
    });
  });
});
