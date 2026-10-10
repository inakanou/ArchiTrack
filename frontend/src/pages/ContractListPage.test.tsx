/**
 * @fileoverview ContractListPage テスト
 *
 * Task 4.1: 契約書一覧ページコンポーネントを作成する
 * Task 15.1: 各画面にusePermissionフックを統合してUI要素を制御する
 * Task 18.4: 契約書の一覧にページ送りを付け、21 件目以降に到達できるようにする
 *
 * Requirements (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
 * - REQ-1.2: 各契約書について契約種類（新規契約/変更契約）、契約日、ステータス（契約前/契約済）を一覧に表示する
 * - REQ-1.3: 一覧画面に新規作成ボタンを表示する
 * - REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
 * - REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
 * - REQ-1.6: 一覧画面にパンくずナビゲーションを表示する
 * - REQ-13.5: UI要素の権限制御
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContractListPage from './ContractListPage';
import * as contractsApi from '../api/contracts';
import type { ContractListItem } from '../api/contracts';

// モック
vi.mock('../api/contracts');

// usePermissionフックのモック
const mockHasPermission = vi.fn().mockReturnValue(true);
const mockHasAllPermissions = vi.fn().mockReturnValue(true);
const mockHasAnyPermission = vi.fn().mockReturnValue(true);
vi.mock('../hooks/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mockHasPermission,
    hasAllPermissions: mockHasAllPermissions,
    hasAnyPermission: mockHasAnyPermission,
    isLoading: false,
  }),
}));

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
    // デフォルトではすべての権限を付与（既存テストとの互換性）
    mockHasPermission.mockReturnValue(true);
    mockHasAllPermissions.mockReturnValue(true);
    mockHasAnyPermission.mockReturnValue(true);
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

  // --------------------------------------------------------------------------
  // REQ-13.5: 権限ベースUI制御
  // --------------------------------------------------------------------------
  describe('REQ-13.5: 権限ベースUI制御', () => {
    /**
     * contract:create権限がある場合、新規作成ボタンを表示する
     */
    it('contract:create権限がある場合、新規作成ボタンを表示する', async () => {
      mockHasPermission.mockImplementation((perm: string) => perm === 'contract:create');
      vi.mocked(contractsApi.getContracts).mockResolvedValue({
        contracts: mockContracts,
        total: 2,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('contract-list-page')).toBeInTheDocument();
      });

      expect(screen.getByLabelText('契約書を新規作成')).toBeInTheDocument();
    });

    /**
     * contract:create権限がない場合、新規作成ボタンを非表示にする
     */
    it('contract:create権限がない場合、新規作成ボタンを非表示にする', async () => {
      mockHasPermission.mockReturnValue(false);
      vi.mocked(contractsApi.getContracts).mockResolvedValue({
        contracts: mockContracts,
        total: 2,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('contract-list-page')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('契約書を新規作成')).not.toBeInTheDocument();
    });

    /**
     * contract:create権限がない場合、空状態でも新規作成ボタンを非表示にする
     */
    it('contract:create権限がない場合、空状態でも新規作成ボタンを非表示にする', async () => {
      mockHasPermission.mockReturnValue(false);
      vi.mocked(contractsApi.getContracts).mockResolvedValue({
        contracts: [],
        total: 0,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });

      // 空状態でもヘッダーの新規作成ボタン、空状態内の新規作成リンクともに非表示
      const createLinks = screen.queryAllByRole('link', { name: /新規作成/i });
      expect(createLinks).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // REQ-1.1: ページ送り（Task 18.4）
  // --------------------------------------------------------------------------
  describe('REQ-1.1: ページ送り（21 件目以降への到達）', () => {
    /** n 件目（1 始まり）の契約書。行と金額で何件目かを読み分けられるようにする */
    function contractAt(n: number): ContractListItem {
      return {
        id: `contract-${String(n).padStart(3, '0')}`,
        contractType: 'NEW',
        contractDate: '2026-04-01',
        status: 'BEFORE_CONTRACT',
        contractAmount: n * 1000,
        estimateName: `見積書${n}`,
        parentContractId: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      };
    }

    /** 全 total 件を、要求の page と limit で切り出して返す API のモック */
    function mockPagedContracts(total: number): void {
      const all = Array.from({ length: total }, (_, i) => contractAt(i + 1));
      vi.mocked(contractsApi.getContracts).mockImplementation(async (_projectId, options) => {
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 20;
        return { contracts: all.slice((page - 1) * limit, page * limit), total };
      });
    }

    /**
     * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
     */
    it('全 25 件・表示件数 20 件のとき、1 ページ目に 20 件とページ送りを表示し、21 件目は出さない', async () => {
      mockPagedContracts(25);

      renderWithRouter();

      const nav = await screen.findByRole('navigation', { name: 'ページネーション' });
      expect(contractsApi.getContracts).toHaveBeenLastCalledWith('proj-001', {
        page: 1,
        limit: 20,
      });
      expect(screen.getAllByTestId(/^contract-row-/)).toHaveLength(20);
      expect(screen.queryByTestId('contract-row-contract-021')).not.toBeInTheDocument();
      expect(within(nav).getByTestId('total-pages')).toHaveTextContent('2');
      expect(within(nav).getByRole('button', { name: 'ページ 2' })).toBeEnabled();
    });

    /**
     * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
     */
    it('次のページへ進むと page=2 で取得し、21 件目から 25 件目を表示する', async () => {
      const user = userEvent.setup();
      mockPagedContracts(25);

      renderWithRouter();

      const nav = await screen.findByRole('navigation', { name: 'ページネーション' });
      await user.click(within(nav).getByRole('button', { name: '次のページ' }));

      expect(await screen.findByTestId('contract-row-contract-021')).toBeInTheDocument();
      expect(contractsApi.getContracts).toHaveBeenLastCalledWith('proj-001', {
        page: 2,
        limit: 20,
      });
      expect(screen.getAllByTestId(/^contract-row-/)).toHaveLength(5);
      expect(screen.getByTestId('contract-row-contract-025')).toBeInTheDocument();
      expect(screen.queryByTestId('contract-row-contract-001')).not.toBeInTheDocument();
      expect(screen.getByText('全25件')).toBeInTheDocument();
      expect(
        within(screen.getByRole('navigation', { name: 'ページネーション' })).getByTestId(
          'current-page'
        )
      ).toHaveTextContent('2');
    });

    /**
     * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
     */
    it('ページ番号の釦をキーボードで押して 2 ページ目へ移れる', async () => {
      const user = userEvent.setup();
      mockPagedContracts(25);

      renderWithRouter();

      const nav = await screen.findByRole('navigation', { name: 'ページネーション' });
      within(nav).getByRole('button', { name: 'ページ 2' }).focus();
      await user.keyboard('{Enter}');

      expect(await screen.findByTestId('contract-row-contract-021')).toBeInTheDocument();
      expect(contractsApi.getContracts).toHaveBeenLastCalledWith('proj-001', {
        page: 2,
        limit: 20,
      });
    });

    /**
     * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
     */
    it('2 ページ目で表示件数を 50 件へ変えると 1 ページ目から 50 件単位で取り直し、全 25 件を表示する', async () => {
      const user = userEvent.setup();
      mockPagedContracts(25);

      renderWithRouter();

      const nav = await screen.findByRole('navigation', { name: 'ページネーション' });
      await user.click(within(nav).getByRole('button', { name: 'ページ 2' }));
      await screen.findByTestId('contract-row-contract-021');

      await user.selectOptions(screen.getByRole('combobox', { name: '表示件数' }), '50');

      await waitFor(() => {
        expect(screen.getAllByTestId(/^contract-row-/)).toHaveLength(25);
      });
      expect(contractsApi.getContracts).toHaveBeenLastCalledWith('proj-001', {
        page: 1,
        limit: 50,
      });
    });

    /**
     * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
     */
    it('契約書が無いときはページ送りを表示しない', async () => {
      mockPagedContracts(0);

      renderWithRouter();

      await screen.findByTestId('empty-state');
      expect(
        screen.queryByRole('navigation', { name: 'ページネーション' })
      ).not.toBeInTheDocument();
    });
  });
});
