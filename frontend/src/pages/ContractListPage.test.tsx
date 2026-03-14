/**
 * @fileoverview ContractListPage テスト
 *
 * Task 4.1: 契約書一覧ページコンポーネントを作成する
 *
 * Requirements (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類（新規契約/変更契約）、契約日、ステータス（契約前/契約済）を一覧に表示する
 * - REQ-1.3: 一覧画面に新規作成ボタンを表示する
 * - REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
 * - REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
 * - REQ-1.6: 一覧画面にパンくずナビゲーションを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContractListPage from './ContractListPage';
import * as contractsApi from '../api/contracts';

// モック
vi.mock('../api/contracts');

const mockContracts = [
  {
    id: 'contract-001',
    contractType: 'NEW' as const,
    contractDate: '2024-06-01',
    status: 'BEFORE_CONTRACT' as const,
    contractAmount: 15000000,
    estimateName: 'テスト見積書A',
    parentContractId: null,
    createdAt: '2024-06-01T10:00:00.000Z',
    updatedAt: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 'contract-002',
    contractType: 'AMENDMENT' as const,
    contractDate: '2024-07-15',
    status: 'CONTRACTED' as const,
    contractAmount: 18000000,
    estimateName: 'テスト見積書B',
    parentContractId: 'contract-001',
    createdAt: '2024-07-15T10:00:00.000Z',
    updatedAt: '2024-07-15T10:00:00.000Z',
  },
];

function renderWithRouter(projectId = 'proj-001') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/contracts`]}>
      <Routes>
        <Route path="/projects/:projectId/contracts" element={<ContractListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ContractListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
   */
  it('契約書一覧画面が正しくレンダリングされる', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-list-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: '契約書一覧' })).toBeInTheDocument();
  });

  /**
   * REQ-1.1: 契約書リストの表示
   */
  it('契約書リストを表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-list-table')).toBeInTheDocument();
    });

    // 2行の契約書が表示される
    const rows = screen.getAllByTestId(/^contract-row-/);
    expect(rows).toHaveLength(2);
  });

  /**
   * REQ-1.2: 各契約書について契約種類、契約日、ステータスを一覧に表示する
   */
  it('契約種類、契約日、ステータスがカラムに表示される', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-list-table')).toBeInTheDocument();
    });

    // テーブルヘッダーの確認
    expect(screen.getByText('契約種類')).toBeInTheDocument();
    expect(screen.getByText('契約日')).toBeInTheDocument();
    expect(screen.getByText('ステータス')).toBeInTheDocument();

    // 契約種類の表示
    expect(screen.getByText('新規契約')).toBeInTheDocument();
    expect(screen.getByText('変更契約')).toBeInTheDocument();

    // ステータスの表示
    expect(screen.getByText('契約前')).toBeInTheDocument();
    expect(screen.getByText('契約済')).toBeInTheDocument();
  });

  /**
   * REQ-1.3: 一覧画面に新規作成ボタンを表示する
   */
  it('新規作成ボタンが表示される', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toBeInTheDocument();
    });
  });

  /**
   * REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
   */
  it('新規作成ボタンのリンク先が正しい', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toHaveAttribute('href', '/projects/proj-001/contracts/new');
    });
  });

  /**
   * REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
   */
  it('契約書行クリック時の詳細画面遷移リンクが正しい', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const row = screen.getByTestId('contract-row-contract-001');
      expect(row).toBeInTheDocument();
    });

    // 行内にリンクが存在し、詳細画面へのhrefが設定されている
    const row = screen.getByTestId('contract-row-contract-001');
    const links = row.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/projects/proj-001/contracts/contract-001');
  });

  /**
   * REQ-1.6: 一覧画面にパンくずナビゲーションを表示する
   */
  it('パンくずナビゲーションを「ダッシュボード > プロジェクト一覧 > プロジェクト > 契約書一覧」形式で表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-list-page')).toBeInTheDocument();
    });

    // パンくずナビゲーションが存在すること
    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();

    // パンくずアイテムの確認
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();

    const breadcrumbItems = breadcrumb.querySelectorAll('li');
    const labels = Array.from(breadcrumbItems).map((li) =>
      li.textContent?.replace(/^>\s*/, '').trim()
    );
    expect(labels).toContain('プロジェクト');
    expect(labels).toContain('契約書一覧');
  });

  /**
   * ローディング状態のテスト
   */
  it('ローディング中はスピナーを表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    renderWithRouter();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
   */
  it('エラー時はエラーメッセージと再試行ボタンを表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockRejectedValue(new Error('API Error'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('契約書の取得に失敗しました')).toBeInTheDocument();
    });

    // 再試行ボタン
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  /**
   * 空状態のテスト
   */
  it('契約書が存在しない場合、空状態メッセージを表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: [],
      total: 0,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('契約書はまだありません')).toBeInTheDocument();
    });
  });

  /**
   * 再試行機能のテスト
   */
  it('再試行ボタンクリックでAPIを再呼び出しする', async () => {
    const user = userEvent.setup();
    vi.mocked(contractsApi.getContracts)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        contracts: mockContracts,
        total: 2,
      });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: '再試行' });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByTestId('contract-list-table')).toBeInTheDocument();
    });

    expect(contractsApi.getContracts).toHaveBeenCalledTimes(2);
  });

  /**
   * 件数表示のテスト
   */
  it('全件数を表示する', async () => {
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: mockContracts,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('全2件')).toBeInTheDocument();
    });
  });
});
