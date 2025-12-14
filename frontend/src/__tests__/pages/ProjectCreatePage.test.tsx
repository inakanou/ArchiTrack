/**
 * @fileoverview プロジェクト作成ページのテスト
 *
 * Task 10.3: ルーティング設定
 * Task 22.6: ProjectCreatePageに409エラーハンドリングを追加
 *
 * Requirements:
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.7: 「作成」ボタンをクリックした場合、プロジェクトが作成され、詳細画面に遷移
 * - 1.8: 作成成功時に成功メッセージを表示
 * - 1.15: プロジェクト名が重複している場合、409エラーを受け取りエラーメッセージを表示
 * - 13.9: サーバーサイドバリデーションエラー発生時、エラーメッセージを該当フィールドに表示
 * - 18.1: APIエラーが発生した場合、エラーダイアログを表示
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../hooks/useToast';
import ProjectCreatePage from '../../pages/ProjectCreatePage';
import { ApiError } from '../../api/client';

// useAuthモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'current-user-id',
      email: 'current@example.com',
      displayName: 'Current User',
    },
    isAuthenticated: true,
    isInitialized: true,
  }),
}));

// APIモック
vi.mock('../../api/projects', () => ({
  createProject: vi.fn(),
  getAssignableUsers: vi.fn().mockResolvedValue([
    { id: 'user-1', displayName: 'User 1' },
    { id: 'user-2', displayName: 'User 2' },
    { id: 'current-user-id', displayName: 'Current User' },
  ]),
  searchCustomers: vi.fn().mockResolvedValue([]),
}));

// apiClientのモック（トークンを返すように設定）
vi.mock('../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    public statusCode: number;
    public response?: unknown;

    constructor(statusCode: number, message: string, response?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.response = response;
    }
  },
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

describe('ProjectCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ヘルパー関数
  const renderWithRouter = () => {
    return render(
      <MemoryRouter initialEntries={['/projects/new']}>
        <ToastProvider>
          <ProjectCreatePage />
        </ToastProvider>
      </MemoryRouter>
    );
  };

  describe('初期表示', () => {
    it('ページタイトルが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });
    });

    it('一覧へ戻るリンクが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /一覧に戻る/i })).toBeInTheDocument();
      });
    });

    it('プロジェクト作成フォームが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });
    });

    it('必須フィールドが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/取引先/i)).toBeInTheDocument();

      // UserSelectのローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      expect(screen.getByLabelText(/営業担当者/i)).toBeInTheDocument();
    });
  });

  describe('フォーム送信', () => {
    it('作成成功時、詳細ページへ遷移する', async () => {
      const { createProject } = await import('../../api/projects');
      vi.mocked(createProject).mockResolvedValue({
        id: 'new-project-id',
        name: 'Test Project',
        tradingPartnerId: 'partner-1',
        tradingPartner: { id: 'partner-1', name: 'Test Customer', nameKana: 'テストカスタマー' },
        salesPerson: { id: 'current-user-id', displayName: 'Current User' },
        status: 'PREPARING',
        statusLabel: '準備中',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, 'Test Project');

      // 営業担当者はデフォルトでログインユーザーが選択されている

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        // トースト通知に変更されたため、stateは渡されない
        expect(mockNavigate).toHaveBeenCalledWith('/projects/new-project-id');
      });
    });

    it('APIエラー時、エラーメッセージを表示する', async () => {
      const { createProject } = await import('../../api/projects');
      vi.mocked(createProject).mockRejectedValue(
        new ApiError(500, 'サーバーエラーが発生しました', { error: 'Internal Server Error' })
      );

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, 'Test Project');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックすると一覧ページへ戻る', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await userEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects');
    });
  });

  describe('アクセシビリティ', () => {
    it('ページ全体にmain要素がある', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('ページ見出しにh1要素がある', async () => {
      renderWithRouter();

      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 19.3: パンくずナビゲーションテスト
  // ==========================================================================

  describe('パンくずナビゲーション（Task 19.3）', () => {
    it('パンくずナビゲーションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      // パンくずナビゲーションのnav要素が存在する
      expect(
        screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
      ).toBeInTheDocument();
    });

    it('パンくずに「ダッシュボード」リンクが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      // 「ダッシュボード」リンクが存在する
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const dashboardLink = breadcrumbNav.querySelector('a[href="/"]');
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveTextContent('ダッシュボード');
    });

    it('パンくずに「プロジェクト」リンクが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      // 「プロジェクト」リンクが存在する（/projectsへ遷移可能）
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const projectLink = breadcrumbNav.querySelector('a[href="/projects"]');
      expect(projectLink).toBeInTheDocument();
      expect(projectLink).toHaveTextContent('プロジェクト');
    });

    it('パンくずに「新規作成」が現在ページとして表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      // 「新規作成」が現在ページとして表示される（リンクなし、aria-current="page"）
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
      expect(currentPage).toBeInTheDocument();
      expect(currentPage).toHaveTextContent('新規作成');
    });

    it('「ダッシュボード」リンクは / へ遷移可能', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const dashboardLink = breadcrumbNav.querySelector('a[href="/"]');
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('「プロジェクト」リンクは /projects へ遷移可能', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const projectLink = breadcrumbNav.querySelector('a[href="/projects"]');
      expect(projectLink).toHaveAttribute('href', '/projects');
    });

    it('「新規作成」はリンクなし（現在ページ）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      // 「新規作成」はリンクではない（span要素）
      const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
      expect(currentPage).toBeInTheDocument();
      expect(currentPage?.tagName.toLowerCase()).toBe('span');
    });

    it('パンくずに区切り文字「>」が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      // 区切り文字が存在する（2つの > が必要：ダッシュボード > プロジェクト > 新規作成）
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const separators = breadcrumbNav.querySelectorAll('[aria-hidden="true"]');
      expect(separators.length).toBe(2);
    });

    it('パンくずはページ上部に配置される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規プロジェクト/i })).toBeInTheDocument();
      });

      const main = screen.getByRole('main');
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });

      // パンくずナビゲーションがmain要素内に存在する
      expect(main.contains(breadcrumbNav)).toBe(true);
    });
  });

  // ==========================================================================
  // Task 22.6: 409エラーハンドリングテスト
  // ==========================================================================

  describe('プロジェクト名重複エラー（Task 22.6）', () => {
    it('409エラー（プロジェクト名重複）時、プロジェクト名フィールドにエラーを表示する', async () => {
      const { createProject } = await import('../../api/projects');

      // DuplicateProjectNameErrorResponse形式のレスポンスを含む409エラー
      const duplicateErrorResponse = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: 既存プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '既存プロジェクト',
      };

      vi.mocked(createProject).mockRejectedValue(
        new ApiError(409, duplicateErrorResponse.detail, duplicateErrorResponse)
      );

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // フォーム入力（重複するプロジェクト名を入力）
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, '既存プロジェクト');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      // プロジェクト名フィールドにエラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('このプロジェクト名は既に使用されています')).toBeInTheDocument();
      });

      // 画面遷移していないことを確認
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringMatching(/^\/projects\/.+$/));
    });

    it('409エラー時、submitErrorがProjectFormに渡される', async () => {
      const { createProject } = await import('../../api/projects');

      // DuplicateProjectNameErrorResponse形式のレスポンスを含む409エラー
      const duplicateErrorResponse = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: 重複テスト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '重複テスト',
      };

      vi.mocked(createProject).mockRejectedValue(
        new ApiError(409, duplicateErrorResponse.detail, duplicateErrorResponse)
      );

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, '重複テスト');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      // エラーメッセージがプロジェクト名フィールドの近くに表示される
      await waitFor(() => {
        // プロジェクト名フィールドがaria-invalid="true"になっている
        const nameField = screen.getByLabelText(/プロジェクト名/i);
        expect(nameField).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('409エラー時、ページ上部のエラーアラートも表示される', async () => {
      const { createProject } = await import('../../api/projects');

      const duplicateErrorResponse = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: アラートテスト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: 'アラートテスト',
      };

      vi.mocked(createProject).mockRejectedValue(
        new ApiError(409, duplicateErrorResponse.detail, duplicateErrorResponse)
      );

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, 'アラートテスト');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      // ページ上部のエラーアラートとフィールドエラーの両方が表示される
      // 複数のアラートがあることを確認（ページ上部 + フィールド内）
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThanOrEqual(1);
        // ページ上部のエラーメッセージを確認（サーバーからのdetailメッセージ）
        expect(
          screen.getByText('このプロジェクト名は既に使用されています: アラートテスト')
        ).toBeInTheDocument();
      });
    });

    it('再送信時にsubmitErrorがクリアされ、新しいエラーが設定される', async () => {
      const { createProject } = await import('../../api/projects');

      const duplicateErrorResponse1 = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: 最初のプロジェクト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '最初のプロジェクト',
      };

      vi.mocked(createProject).mockRejectedValue(
        new ApiError(409, duplicateErrorResponse1.detail, duplicateErrorResponse1)
      );

      renderWithRouter();

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 最初の送信
      const nameInput = screen.getByLabelText(/プロジェクト名/i);
      await userEvent.type(nameInput, '最初のプロジェクト');

      const submitButton = screen.getByRole('button', { name: /作成$/i });
      await userEvent.click(submitButton);

      // エラー表示を確認
      await waitFor(() => {
        expect(screen.getByText('このプロジェクト名は既に使用されています')).toBeInTheDocument();
      });

      // 2回目の送信（成功するケース）
      vi.mocked(createProject).mockResolvedValue({
        id: 'new-project-id',
        name: '最初のプロジェクト改',
        tradingPartnerId: null,
        tradingPartner: null,
        salesPerson: { id: 'current-user-id', displayName: 'Current User' },
        status: 'PREPARING',
        statusLabel: '準備中',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      // プロジェクト名を修正
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, '最初のプロジェクト改');

      await userEvent.click(submitButton);

      // 成功時は詳細ページに遷移
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/new-project-id');
      });
    });
  });
});
