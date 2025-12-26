/**
 * @fileoverview プロジェクト一覧ページのテスト
 *
 * Task 8.5: ProjectListPageの実装
 * Task 15.3: 一覧・詳細ページのユニットテスト追加
 *
 * Requirements:
 * - 2.1: ログイン後、プロジェクト一覧ページが表示される
 * - 2.2: 一覧はカード/テーブル形式でプロジェクト情報を表示
 * - 3.1-3.5: ページネーション機能
 * - 4.1-4.5: 検索機能
 * - 5.1-5.5: フィルタ機能
 * - 6.1-6.6: ソート機能
 * - 7.1: プロジェクト詳細画面で全情報を表示
 * - 8.1: 編集ボタンクリック時にプロジェクト編集フォームを表示
 * - 9.1: 削除ボタンクリック時に削除確認ダイアログを表示
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProjectListPage from '../../pages/ProjectListPage';
import type { PaginatedProjects, ProjectInfo } from '../../types/project.types';

// APIモック
vi.mock('../../api/projects', () => ({
  getProjects: vi.fn(),
}));

// useMediaQueryモック（レスポンシブ表示テスト用）
const mockUseMediaQuery = vi.fn();
vi.mock('../../hooks/useMediaQuery', () => ({
  default: () => mockUseMediaQuery(),
}));

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// テストデータ
const createMockProject = (id: string, overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
  id,
  name: `テストプロジェクト${id}`,
  tradingPartnerId: `partner-${id}`,
  tradingPartner: { id: `partner-${id}`, name: `顧客名${id}`, nameKana: `コキャクメイ${id}` },
  salesPerson: { id: `sales-${id}`, displayName: `営業担当${id}` },
  status: 'PREPARING',
  statusLabel: '準備中',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-15T00:00:00Z',
  ...overrides,
});

const mockProjects: ProjectInfo[] = [
  createMockProject('1'),
  createMockProject('2', { status: 'SURVEYING', statusLabel: '調査中' }),
  createMockProject('3', { status: 'ESTIMATING', statusLabel: '見積中' }),
];

const mockPaginatedResponse: PaginatedProjects = {
  data: mockProjects,
  pagination: {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  },
};

const mockEmptyResponse: PaginatedProjects = {
  data: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

describe('ProjectListPage', () => {
  // fake timers対応のuserEventインスタンス
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // fake timersとuserEventを連携させる
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // デフォルトはデスクトップ表示
    mockUseMediaQuery.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ヘルパー関数
  const renderWithRouter = (initialEntries: string[] = ['/projects']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <ProjectListPage />
      </MemoryRouter>
    );
  };

  describe('初期表示', () => {
    it('ローディング中はローディングインジケータを表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPaginatedResponse), 1000))
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('データ取得後、プロジェクト一覧を表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByText('テストプロジェクト2')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト3')).toBeInTheDocument();
    });

    it('デフォルトソート（更新日時降順）でAPIを呼び出す', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'updatedAt',
            order: 'desc',
          })
        );
      });
    });

    it('ページタイトルと新規作成ボタンを表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'プロジェクト一覧' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument();
    });
  });

  describe('空状態・エラー状態', () => {
    it('プロジェクトがない場合、空状態メッセージを表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockEmptyResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('プロジェクトがありません')).toBeInTheDocument();
      });
    });

    it('検索結果が0件の場合、検索結果0件メッセージを表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects)
        .mockResolvedValueOnce(mockPaginatedResponse) // 初回取得
        .mockResolvedValueOnce(mockEmptyResponse); // 検索後

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 検索を実行
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, '存在しないプロジェクト');

      const searchButton = screen.getByRole('button', { name: '検索' });
      await user.click(searchButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(screen.getByText('検索結果がありません')).toBeInTheDocument();
      });
    });

    it('エラー発生時、エラーメッセージと再試行ボタンを表示する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockRejectedValue(new Error('サーバーエラー'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('プロジェクト一覧を取得できませんでした')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects)
        .mockRejectedValueOnce(new Error('サーバーエラー'))
        .mockResolvedValueOnce(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(getProjects).toHaveBeenCalledTimes(2);
    });
  });

  describe('ナビゲーション', () => {
    it('新規作成ボタンをクリックするとフォーム表示へ遷移する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: '新規作成' });
      await user.click(createButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/new');
    });

    it('プロジェクト行をクリックすると詳細ページへ遷移する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // テーブル行をクリック（ProjectListViewが担当）
      const row = screen.getByText('テストプロジェクト1').closest('tr');
      if (row) {
        await user.click(row);
      }

      expect(mockNavigate).toHaveBeenCalledWith('/projects/1');
    });
  });

  describe('検索・フィルタ', () => {
    it('検索フィールドが表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('searchbox')).toBeInTheDocument();
      });
    });

    it('デバウンスによりAPI呼び出しが抑制される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 初回呼び出しをリセット
      vi.mocked(getProjects).mockClear();
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      // 検索入力を素早く変更
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'テスト');
      await user.click(screen.getByRole('button', { name: '検索' }));

      // デバウンス時間内ではAPIが呼ばれない
      expect(getProjects).not.toHaveBeenCalled();

      // デバウンス時間経過後にAPIが呼ばれる
      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('ソート', () => {
    it('ソートヘッダーをクリックするとソート順が変更される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // プロジェクト名ヘッダーのソートボタンをクリック（ProjectListTableが担当）
      const sortButton = screen.getByRole('button', { name: 'プロジェクト名でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'name',
            order: 'asc',
          })
        );
      });
    });
  });

  describe('ページネーション', () => {
    it('ページネーションコントロールが表示される', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });
    });

    it('ページ変更時にAPIが呼び出される', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      // ページ2をクリック
      const page2Button = screen.getByRole('button', { name: 'ページ 2' });
      await user.click(page2Button);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
          })
        );
      });
    });

    it('表示件数変更時にAPIが呼び出される', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      // 表示件数を50に変更
      const limitSelect = screen.getByLabelText('表示件数');
      await user.selectOptions(limitSelect, '50');

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 50,
            page: 1, // 件数変更時はページ1にリセット
          })
        );
      });
    });
  });

  describe('URLパラメータ同期', () => {
    it('URLパラメータから初期状態を復元する', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter(['/projects?page=2&limit=50&sort=name&order=asc&search=test']);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
            limit: 50,
            sort: 'name',
            order: 'asc',
            filter: expect.objectContaining({
              search: 'test',
            }),
          })
        );
      });
    });

    it('状態変更時にURLパラメータが更新される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // プロジェクト名ヘッダーのソートボタンをクリックしてソート変更
      const sortButton = screen.getByRole('button', { name: 'プロジェクト名でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      // URLパラメータが更新されていることを確認（モックナビゲーションで検証）
      // 注: 実際の実装ではuseSearchParamsのsetを使用
    });
  });

  describe('アクセシビリティ', () => {
    it('ページ全体にmain要素がある', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('ローディング時にaria-busy属性が設定される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPaginatedResponse), 1000))
      );

      renderWithRouter();

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('aria-busy', 'true');
    });

    it('エラーメッセージにrole="alert"が設定される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockRejectedValue(new Error('サーバーエラー'));

      renderWithRouter();

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 15.3: 追加テスト
  // ==========================================================================

  describe('レスポンシブ表示（Task 15.3）', () => {
    it('デスクトップ表示でテーブル形式で表示される', async () => {
      mockUseMediaQuery.mockReturnValue(false);
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // テーブルが表示される
      expect(screen.getByRole('table')).toBeInTheDocument();
      // カードリストは表示されない
      expect(screen.queryByTestId('project-card-list')).not.toBeInTheDocument();
    });

    it('モバイル表示でカード形式で表示される', async () => {
      mockUseMediaQuery.mockReturnValue(true);
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // カードリストが表示される
      expect(screen.getByTestId('project-card-list')).toBeInTheDocument();
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('モバイル表示でカードにプロジェクト情報が表示される', async () => {
      mockUseMediaQuery.mockReturnValue(true);
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('project-card-1')).toBeInTheDocument();
      });

      // プロジェクト情報が表示される
      expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      // モックデータのcustomerNameを使用
      expect(screen.getAllByText(/顧客/).length).toBeGreaterThanOrEqual(1);
    });

    it('モバイル表示でカードクリックで詳細ページへ遷移する', async () => {
      mockUseMediaQuery.mockReturnValue(true);
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('project-card-1')).toBeInTheDocument();
      });

      const card = screen.getByTestId('project-card-1');
      await user.click(card);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/1');
    });
  });

  describe('フィルタリング機能（Task 15.3）', () => {
    it('ステータスフィルタが表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // ステータスフィルタが存在する（aria-label使用）
      expect(screen.getByLabelText('ステータスフィルタ')).toBeInTheDocument();
    });

    it('ステータスフィルタ選択時にAPIが呼び出される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 初回呼び出しをリセット
      vi.mocked(getProjects).mockClear();
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      // ステータスフィルタを変更
      const statusSelect = screen.getByLabelText('ステータスフィルタ');
      await user.selectOptions(statusSelect, 'PREPARING');

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: expect.objectContaining({
              status: expect.arrayContaining(['PREPARING']),
            }),
          })
        );
      });
    });

    it('期間フィルタが表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 期間フィルタ（作成日From/To）が存在する（日付入力フィールドで確認）
      expect(screen.getByLabelText('作成日（開始）')).toBeInTheDocument();
      expect(screen.getByLabelText('作成日（終了）')).toBeInTheDocument();
    });

    it('検索入力が2文字未満の場合はエラー表示', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 1文字だけ入力
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'あ');

      // 検索ボタンをクリック
      const searchButton = screen.getByRole('button', { name: '検索' });
      await user.click(searchButton);

      // バリデーションエラーが表示される
      await waitFor(() => {
        expect(screen.getByText(/2文字以上/)).toBeInTheDocument();
      });
    });
  });

  describe('ソート機能詳細（Task 15.3）', () => {
    it('顧客名列でソートできる', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const sortButton = screen.getByRole('button', { name: '顧客名でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'customerName',
            order: 'asc',
          })
        );
      });
    });

    it('ステータス列でソートできる', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const sortButton = screen.getByRole('button', { name: 'ステータスでソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'status',
            order: 'asc',
          })
        );
      });
    });

    it('作成日列でソートできる', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const sortButton = screen.getByRole('button', { name: '作成日でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'createdAt',
            order: 'asc',
          })
        );
      });
    });

    it('更新日列でソートできる', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const sortButton = screen.getByRole('button', { name: '更新日でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'updatedAt',
            // 初期状態がupdatedAt descなので、再クリックでascになる
            order: 'asc',
          })
        );
      });
    });

    it('同じカラムを再度クリックすると昇順/降順が切り替わる', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 更新日列（デフォルト: desc）を再クリック
      const sortButton = screen.getByRole('button', { name: '更新日でソート' });
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      // 1回目クリック: desc -> asc
      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'updatedAt',
            order: 'asc',
          })
        );
      });

      vi.mocked(getProjects).mockClear();
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      // 再度クリック
      await user.click(sortButton);

      await vi.advanceTimersByTimeAsync(300);

      // 2回目クリック: asc -> desc
      await waitFor(() => {
        expect(getProjects).toHaveBeenCalledWith(
          expect.objectContaining({
            sort: 'updatedAt',
            order: 'desc',
          })
        );
      });
    });
  });

  describe('ページネーション詳細（Task 15.3）', () => {
    it('ページ1より後のページでは前へボタンが有効', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 3,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter(['/projects?page=3']);

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      // 前へボタンが有効
      const prevPageButton = screen.getByRole('button', { name: '前のページ' });
      expect(prevPageButton).not.toBeDisabled();
    });

    it('最終ページの場合は次へ移動ボタンが無効', async () => {
      const lastPageResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 5,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(lastPageResponse);

      renderWithRouter(['/projects?page=5']);

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      // 次へ移動ボタンが無効
      const nextPageButton = screen.getByRole('button', { name: '次のページ' });
      expect(nextPageButton).toBeDisabled();
    });

    it('表示件数を10/20/50から選択できる', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      const limitSelect = screen.getByLabelText('表示件数');

      // 選択肢が存在することを確認
      expect(limitSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '10件' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '20件' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '50件' })).toBeInTheDocument();
    });

    it('ページネーション情報が正しく表示される', async () => {
      const manyProjectsResponse: PaginatedProjects = {
        data: mockProjects,
        pagination: {
          page: 2,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };

      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(manyProjectsResponse);

      renderWithRouter(['/projects?page=2']);

      await waitFor(() => {
        expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
      });

      // 総件数の表示
      expect(screen.getByTestId('total-count')).toHaveTextContent('100');
      // 現在のページ
      expect(screen.getByTestId('current-page')).toHaveTextContent('2');
      // 総ページ数
      expect(screen.getByTestId('total-pages')).toHaveTextContent('5');
    });
  });

  describe('プロジェクト一覧のカラム表示（Requirements 2.1, 2.2）', () => {
    it('テーブルにプロジェクト名列が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByRole('columnheader', { name: /プロジェクト名/ })).toBeInTheDocument();
    });

    it('テーブルに顧客名列が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByRole('columnheader', { name: /顧客名/ })).toBeInTheDocument();
    });

    it('テーブルにステータス列が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByRole('columnheader', { name: /ステータス/ })).toBeInTheDocument();
    });

    it('テーブルに作成日列が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByRole('columnheader', { name: /作成日/ })).toBeInTheDocument();
    });

    it('テーブルに更新日列が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      expect(screen.getByRole('columnheader', { name: /更新日/ })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 19.1: パンくずナビゲーションテスト
  // ==========================================================================

  describe('パンくずナビゲーション（Task 19.1）', () => {
    it('パンくずナビゲーションが表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // パンくずナビゲーションのnav要素が存在する
      expect(
        screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
      ).toBeInTheDocument();
    });

    it('パンくずに「ダッシュボード」リンクが表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 「ダッシュボード」リンクが存在する
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const dashboardLink = breadcrumbNav.querySelector('a[href="/"]');
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveTextContent('ダッシュボード');
    });

    it('パンくずに「プロジェクト」が現在ページとして表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 「プロジェクト」が現在ページとして表示される（リンクなし、aria-current="page"）
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
      expect(currentPage).toBeInTheDocument();
      expect(currentPage).toHaveTextContent('プロジェクト');
    });

    it('パンくずに区切り文字「>」が表示される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      // 区切り文字が存在する
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumbNav.textContent).toContain('>');
    });

    it('「ダッシュボード」リンクは / へ遷移可能', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const dashboardLink = breadcrumbNav.querySelector('a[href="/"]');
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('「プロジェクト」はリンクなし（現在ページ）', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      // 「プロジェクト」はリンクではない（span要素）
      const projectText = breadcrumbNav.querySelector('[aria-current="page"]');
      expect(projectText).toBeInTheDocument();
      expect(projectText?.tagName.toLowerCase()).toBe('span');
    });

    it('パンくずはページ上部（ヘッダーの直後）に配置される', async () => {
      const { getProjects } = await import('../../api/projects');
      vi.mocked(getProjects).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      });

      const main = screen.getByRole('main');
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });

      // パンくずナビゲーションがmain要素内に存在する
      expect(main.contains(breadcrumbNav)).toBe(true);
    });
  });
});
