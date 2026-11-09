/**
 * @fileoverview ProjectEditPage コンポーネントのテスト
 *
 * Task 19.4: ProjectEditPageの実装とパンくずナビゲーション追加
 * Task 22.7: ProjectEditPageに409エラーハンドリングを追加
 *
 * Requirements:
 * - 21.12: 編集ボタンクリックで編集ページへ遷移
 * - 21.17: パンくず: ダッシュボード > プロジェクト > [プロジェクト名] > 編集
 * - 21.18: パンくずナビゲーションのアクセシビリティ
 * - 21.21: 保存成功時に詳細ページへ遷移
 * - 21.23: /projects/:id/edit のURLで提供
 * - 8.1: 編集ボタンクリックで編集フォームを表示
 * - 8.2: 現在のプロジェクト情報がプリセットされた編集フォームを表示
 * - 8.3: 変更を保存時にプロジェクトレコードを更新
 * - 8.4: バリデーションエラーが発生するとエラーメッセージを表示
 * - 8.5: キャンセルボタンで詳細ページに戻る
 * - 8.6: 楽観的排他制御による競合検出
 * - 8.7: 更新時にプロジェクト名が重複している場合、409エラーを受け取りエラーメッセージを表示
 * - 45.1-45.5: 担当者の変更で自分が閲覧範囲から外れるときの確認と保存の後の遷移
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../components/ToastProvider';
import { useToast } from '../../hooks/useToast';
import ProjectEditPage from '../../pages/ProjectEditPage';
import * as projectsApi from '../../api/projects';
import { ApiError, apiClient } from '../../api/client';
import type { ProjectDetail } from '../../types/project.types';

// モック
vi.mock('../../api/projects');

// AuthContext用のモック
vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../../contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: 'user-1', displayName: 'Test User', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
    })),
  };
});

// 画面が使う useAuth（hooks 側）のモック。テストごとに利用者と権限を替える
const authState = vi.hoisted(() => ({
  user: { id: 'user-1', displayName: 'Test User', email: 'test@example.com', permissions: [] } as {
    id: string;
    displayName: string;
    email: string;
    permissions: string[];
  },
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: authState.user,
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
  })),
}));

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const mockProject: ProjectDetail = {
  id: 'project-1',
  name: 'テストプロジェクト',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: 'Test User' },
  constructionPerson: { id: 'user-2', displayName: 'Construction User' },
  siteAddress: '東京都渋谷区',
  description: 'テストの説明文',
  status: 'PREPARING',
  statusLabel: '準備中',
  createdById: 'user-1',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
};

const mockAssignableUsers = [
  { id: 'user-1', displayName: 'Test User' },
  { id: 'user-2', displayName: 'Construction User' },
  { id: 'user-3', displayName: 'Another User' },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 出ているトーストの文言を表示する（通知の主張用）
 */
function ToastProbe() {
  const { toasts } = useToast();
  return (
    <ul data-testid="toast-probe">
      {toasts.map((t) => (
        <li key={t.id}>{t.message}</li>
      ))}
    </ul>
  );
}

/**
 * ProjectEditPageをレンダリングするヘルパー
 */
function renderProjectEditPage(projectId: string = 'project-1', withToastProbe = false) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/edit`]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
          </Routes>
          {withToastProbe && <ToastProbe />}
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

// ============================================================================
// テストスイート
// ============================================================================

describe('ProjectEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    authState.user = {
      id: 'user-1',
      displayName: 'Test User',
      email: 'test@example.com',
      permissions: [],
    };
    // 担当者の選択欄が候補を取りに行けるよう、トークンがある状態にする
    vi.spyOn(apiClient, 'getAccessToken').mockReturnValue('mock-token');

    // デフォルトのAPIモック
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(projectsApi.getAssignableUsers).mockResolvedValue(mockAssignableUsers);
    vi.mocked(projectsApi.updateProject).mockResolvedValue({
      ...mockProject,
      name: '更新後プロジェクト',
      updatedAt: '2025-01-20T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // ローディング状態テスト
  // ========================================================================

  describe('ローディング状態', () => {
    it('データ取得中にローディングインジケータを表示する', async () => {
      // データ取得を遅延させる
      vi.mocked(projectsApi.getProject).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockProject), 1000);
          })
      );

      renderProjectEditPage();

      // ローディングインジケータが表示される
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // パンくずナビゲーションテスト (REQ-21.17, 21.18)
  // ========================================================================

  describe('パンくずナビゲーション', () => {
    it('「ダッシュボード > プロジェクト一覧 > [プロジェクト名] > 編集」のパンくずを表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      });

      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
      expect(screen.getByText('編集')).toBeInTheDocument();
    });

    it('ダッシュボードリンクは / へ遷移可能', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('プロジェクト一覧リンクは /projects へ遷移可能', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('プロジェクト名リンクは /projects/:id へ遷移可能', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const projectNameLink = screen.getByRole('link', { name: 'テストプロジェクト' });
        expect(projectNameLink).toHaveAttribute('href', '/projects/project-1');
      });
    });

    it('「編集」は現在ページとしてリンクなしで表示', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const editText = screen.getByText('編集');
        expect(editText.tagName.toLowerCase()).toBe('span');
        expect(editText).toHaveAttribute('aria-current', 'page');
      });
    });

    it('パンくずナビゲーションにaria-labelが設定されている', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // フォーム表示テスト (REQ-8.1, 8.2)
  // ========================================================================

  describe('編集フォーム表示', () => {
    it('ページタイトル「プロジェクトを編集」を表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'プロジェクトを編集' })).toBeInTheDocument();
      });
    });

    it('現在のプロジェクト情報がプリセットされた編集フォームを表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        // プロジェクト名入力フィールド
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        expect(nameInput).toHaveValue('テストプロジェクト');
      });

      // 顧客名入力フィールド（選択済みの取引先名を表示）
      // TradingPartnerSelectコンポーネントは「顧客名」ラベルを使用
      // 選択値はテキストではなく、選択されたIDで表示される
      const tradingPartnerField = screen.getByLabelText(/顧客名/);
      expect(tradingPartnerField).toBeInTheDocument();

      // 現場住所入力フィールド
      const siteAddressInput = screen.getByLabelText(/現場住所/);
      expect(siteAddressInput).toHaveValue('東京都渋谷区');

      // 概要入力フィールド
      const descriptionInput = screen.getByLabelText(/概要/);
      expect(descriptionInput).toHaveValue('テストの説明文');
    });

    it('プロジェクトIDを使用してAPIを呼び出す', async () => {
      renderProjectEditPage('project-1');

      await waitFor(() => {
        expect(projectsApi.getProject).toHaveBeenCalledWith('project-1');
      });
    });
  });

  // ========================================================================
  // 保存処理テスト (REQ-8.3, 21.21)
  // ========================================================================

  describe('保存処理', () => {
    it('変更を保存時にプロジェクトレコードを更新する', async () => {
      const user = userEvent.setup();
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // プロジェクト名を変更
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.clear(nameInput);
      await user.type(nameInput, '更新後プロジェクト');

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(projectsApi.updateProject).toHaveBeenCalledWith(
          'project-1',
          expect.objectContaining({
            name: '更新後プロジェクト',
          }),
          '2025-01-15T00:00:00.000Z' // expectedUpdatedAt
        );
      });
    });

    it('保存成功時に詳細ページへ遷移する', async () => {
      const user = userEvent.setup();
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
    });
  });

  // ========================================================================
  // キャンセル処理テスト (REQ-8.5)
  // ========================================================================

  describe('キャンセル処理', () => {
    it('キャンセルボタンクリックで詳細ページに戻る', async () => {
      const user = userEvent.setup();
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
    });
  });

  // ========================================================================
  // 楽観的排他制御テスト (REQ-8.6)
  // ========================================================================

  describe('楽観的排他制御', () => {
    it('競合エラー（409）時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();

      // 競合エラーをモック（ApiErrorインスタンスを使用）
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, 'このプロジェクトは他のユーザーによって更新されています。', {
          type: 'https://architrack.example.com/problems/conflict',
          title: '競合エラー',
          status: 409,
          detail: 'このプロジェクトは他のユーザーによって更新されています。',
          code: 'CONFLICT',
        })
      );

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/このプロジェクトは他のユーザーによって更新されています/)
        ).toBeInTheDocument();
      });
    });

    it('expectedUpdatedAtを含めてAPIを呼び出す', async () => {
      const user = userEvent.setup();
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(projectsApi.updateProject).toHaveBeenCalledWith(
          'project-1',
          expect.any(Object),
          '2025-01-15T00:00:00.000Z'
        );
      });
    });
  });

  // ========================================================================
  // エラー状態テスト
  // ========================================================================

  describe('エラー状態', () => {
    it('プロジェクトが見つからない場合（404）にNotFoundを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(
        new ApiError(404, 'プロジェクトが見つかりません')
      );

      renderProjectEditPage('non-existent');

      await waitFor(() => {
        expect(screen.getByText(/プロジェクトが見つかりません/)).toBeInTheDocument();
      });

      // 一覧に戻るリンクが表示される
      expect(screen.getByText('プロジェクト一覧に戻る')).toBeInTheDocument();
    });

    it('サーバーエラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'サーバーエラー'));

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンクリックでデータを再取得する', async () => {
      const user = userEvent.setup();

      // 最初はエラー、2回目は成功
      vi.mocked(projectsApi.getProject)
        .mockRejectedValueOnce(new ApiError(500, 'サーバーエラー'))
        .mockResolvedValueOnce(mockProject);

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });

      // 再試行ボタンをクリック
      await user.click(screen.getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      expect(projectsApi.getProject).toHaveBeenCalledTimes(2);
    });

    it('サーバーエラー時に「システムエラーが発生しました。しばらくしてからお試しください。」を表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'サーバーエラー'));

      renderProjectEditPage();

      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByText('システムエラーが発生しました。しばらくしてからお試しください。')
      ).toBeInTheDocument();
      expect(within(alert).queryByText('サーバーエラー')).not.toBeInTheDocument();
    });

    it('ネットワークエラー時に「通信エラーが発生しました。再試行してください。」と再試行ボタンを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(0, 'Network error'));

      renderProjectEditPage();

      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByText('通信エラーが発生しました。再試行してください。')
      ).toBeInTheDocument();
      expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('ネットワークエラー後に再試行ボタンを押すと、失敗した取得を同じプロジェクトで再実行する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.getProject)
        .mockRejectedValueOnce(new ApiError(0, 'Network error'))
        .mockResolvedValueOnce(mockProject);

      renderProjectEditPage();

      const alert = await screen.findByRole('alert');
      const failedRequestArgs = vi.mocked(projectsApi.getProject).mock.calls[0];

      await user.click(within(alert).getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });
      expect(projectsApi.getProject).toHaveBeenCalledTimes(2);
      expect(vi.mocked(projectsApi.getProject).mock.calls[1]).toEqual(failedRequestArgs);
    });

    it('ApiError以外のエラー時にデフォルトエラーメッセージを表示する', async () => {
      // 通常のErrorオブジェクトをスロー
      vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('Network Error'));

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      });
    });

    it('保存時にApiError以外のエラーが発生した場合にデフォルトエラーメッセージを表示する', async () => {
      const user = userEvent.setup();

      // 通常のErrorオブジェクトをスロー
      vi.mocked(projectsApi.updateProject).mockRejectedValue(new Error('Network Error'));

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('プロジェクトの更新に失敗しました')).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // バリデーションエラーテスト (REQ-8.4)
  // ========================================================================

  describe('バリデーションエラー', () => {
    it('バリデーションエラー発生時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // プロジェクト名を空にする
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.clear(nameInput);
      await user.tab(); // フォーカスを外す

      await waitFor(() => {
        expect(screen.getByText(/プロジェクト名は必須です/)).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // アクセシビリティテスト
  // ========================================================================

  describe('アクセシビリティ', () => {
    it('main要素にrole="main"が設定されている', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('フォームにrole="form"が設定されている', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // プロジェクト名重複エラーテスト (REQ-8.7)
  // Task 22.7: ProjectEditPageに409エラーハンドリングを追加
  // ========================================================================

  describe('プロジェクト名重複エラー (REQ-8.7)', () => {
    it('プロジェクト名重複エラー（409）時にフィールドにエラーメッセージを表示する', async () => {
      const user = userEvent.setup();

      // プロジェクト名重複エラーをモック（ApiErrorインスタンスを使用）
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, 'このプロジェクト名は既に使用されています: 既存プロジェクト', {
          type: 'https://architrack.example.com/problems/project-name-duplicate',
          title: 'プロジェクト名重複エラー',
          status: 409,
          detail: 'このプロジェクト名は既に使用されています: 既存プロジェクト',
          code: 'PROJECT_NAME_DUPLICATE',
          projectName: '既存プロジェクト',
        })
      );

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // プロジェクト名を変更
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.clear(nameInput);
      await user.type(nameInput, '既存プロジェクト');

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      // プロジェクト名フィールドに重複エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/このプロジェクト名は既に使用されています/)).toBeInTheDocument();
      });

      // エラーはalert roleを持つ
      const errorAlerts = screen.getAllByRole('alert');
      expect(errorAlerts.length).toBeGreaterThan(0);
    });

    it('プロジェクト名重複エラー（409）時にトースト通知でエラーを表示する', async () => {
      const user = userEvent.setup();

      // プロジェクト名重複エラーをモック（ApiErrorインスタンスを使用）
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, 'このプロジェクト名は既に使用されています: 既存プロジェクト', {
          type: 'https://architrack.example.com/problems/project-name-duplicate',
          title: 'プロジェクト名重複エラー',
          status: 409,
          detail: 'このプロジェクト名は既に使用されています: 既存プロジェクト',
          code: 'PROJECT_NAME_DUPLICATE',
          projectName: '既存プロジェクト',
        })
      );

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      // フォーム上部にもエラーメッセージが表示される
      await waitFor(() => {
        const errorAlerts = screen.getAllByRole('alert');
        expect(errorAlerts.length).toBeGreaterThan(0);
      });
    });

    it('プロジェクト名重複エラーと競合エラーを区別して処理する', async () => {
      const user = userEvent.setup();

      // 楽観的排他制御エラー（プロジェクト名重複ではない409エラー）をモック（ApiErrorインスタンスを使用）
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, 'このプロジェクトは他のユーザーによって更新されています。', {
          type: 'https://architrack.example.com/problems/conflict',
          title: '競合エラー',
          status: 409,
          detail: 'このプロジェクトは他のユーザーによって更新されています。',
          code: 'CONFLICT',
        })
      );

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      // 競合エラーメッセージが表示される（プロジェクト名フィールドではなくフォーム全体のエラー）
      await waitFor(() => {
        expect(
          screen.getByText(/このプロジェクトは他のユーザーによって更新されています/)
        ).toBeInTheDocument();
      });
    });

    it('再送信時にsubmitErrorがクリアされる', async () => {
      const user = userEvent.setup();

      // 最初は失敗、2回目は成功（ApiErrorインスタンスを使用）
      vi.mocked(projectsApi.updateProject)
        .mockRejectedValueOnce(
          new ApiError(409, 'このプロジェクト名は既に使用されています: 既存プロジェクト', {
            type: 'https://architrack.example.com/problems/project-name-duplicate',
            title: 'プロジェクト名重複エラー',
            status: 409,
            detail: 'このプロジェクト名は既に使用されています: 既存プロジェクト',
            code: 'PROJECT_NAME_DUPLICATE',
            projectName: '既存プロジェクト',
          })
        )
        .mockResolvedValueOnce({
          ...mockProject,
          name: '新しいプロジェクト名',
          updatedAt: '2025-01-20T00:00:00.000Z',
        });

      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
      });

      // 最初の送信でエラー
      const submitButton = screen.getByRole('button', { name: /保存/ });
      await user.click(submitButton);

      // エラーが表示される
      await waitFor(() => {
        expect(screen.getByText(/このプロジェクト名は既に使用されています/)).toBeInTheDocument();
      });

      // プロジェクト名を変更
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.clear(nameInput);
      await user.type(nameInput, '新しいプロジェクト名');

      // 再送信で成功
      await user.click(submitButton);

      // 詳細ページへ遷移する
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
    });
  });
  // ========================================================================
  // 自分が外れるときの確認と保存の後の遷移 (REQ-45)
  // ========================================================================

  describe('自分が外れるときの確認 (REQ-45)', () => {
    const CONFIRM_MESSAGE =
      'この変更を保存すると、あなたはこのプロジェクトを閲覧できなくなります。保存しますか？';
    const WITHOUT_ACCESS_MESSAGE =
      'プロジェクトを更新しました。担当者から外れたため、このプロジェクトは閲覧できなくなりました';

    // 作成者は別人。営業担当者は自分（user-1）、工事担当者は user-2
    const othersProject: ProjectDetail = { ...mockProject, createdById: 'creator-x' };

    /**
     * 担当者を選び直して「保存」を押す
     */
    async function changeAssigneesAndSave(
      user: ReturnType<typeof userEvent.setup>,
      sales: string,
      construction: string
    ) {
      const salesSelect = (await screen.findByRole('combobox', {
        name: '営業担当者',
      })) as HTMLSelectElement;
      const constructionSelect = screen.getByRole('combobox', {
        name: '工事担当者',
      }) as HTMLSelectElement;
      await waitFor(() => {
        expect(salesSelect.value).toBe('user-1');
      });
      await user.selectOptions(salesSelect, sales);
      await user.selectOptions(constructionSelect, construction);
      await user.click(screen.getByRole('button', { name: '保存' }));
    }

    beforeEach(() => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(othersProject);
    });

    it('作成者でも全閲覧権限の保持者でもなく、変更後の担当者のどちらでもないとき、保存の前に確認を出す（45.1）', async () => {
      const user = userEvent.setup();
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-2');

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(CONFIRM_MESSAGE)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: '保存する' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
      expect(projectsApi.updateProject).not.toHaveBeenCalled();
    });

    it('工事担当者を空にして自分がどちらにも残らないときも確認を出す（45.1）', async () => {
      const user = userEvent.setup();
      authState.user = { ...authState.user, id: 'user-2' };
      renderProjectEditPage('project-1', true);

      const salesSelect = (await screen.findByRole('combobox', {
        name: '営業担当者',
      })) as HTMLSelectElement;
      await waitFor(() => {
        expect(salesSelect.value).toBe('user-1');
      });
      await user.selectOptions(screen.getByRole('combobox', { name: '工事担当者' }), '');
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(projectsApi.updateProject).not.toHaveBeenCalled();
    });

    it('作成者なら確認を出さずに保存し、詳細画面へ移る（45.4）', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.getProject).mockResolvedValue({
        ...othersProject,
        createdById: 'user-1',
      });
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-3');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(projectsApi.updateProject).toHaveBeenCalledTimes(1);
      expect(screen.getByText('プロジェクトを更新しました')).toBeInTheDocument();
    });

    it('全プロジェクトの閲覧権限（project:read_all）を持つなら確認を出さずに詳細画面へ移る（45.4）', async () => {
      const user = userEvent.setup();
      authState.user = { ...authState.user, permissions: ['project:read_all'] };
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-3');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('管理者（*:*）なら確認を出さずに詳細画面へ移る（45.4）', async () => {
      const user = userEvent.setup();
      authState.user = { ...authState.user, permissions: ['*:*'] };
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-3');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('変更後も営業担当者に残るなら確認を出さずに詳細画面へ移る（45.4）', async () => {
      const user = userEvent.setup();
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-1', 'user-3');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('変更後も工事担当者に残るなら確認を出さずに詳細画面へ移る（45.4）', async () => {
      const user = userEvent.setup();
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-1');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('「キャンセル」ではダイアログを閉じ、保存せず、入力を保って編集画面に留まる（45.2）', async () => {
      const user = userEvent.setup();
      renderProjectEditPage('project-1', true);

      const nameInput = await screen.findByLabelText(/プロジェクト名/);
      await waitFor(() => {
        expect(nameInput).toHaveValue('テストプロジェクト');
      });
      await user.clear(nameInput);
      await user.type(nameInput, '変えた名前');
      await changeAssigneesAndSave(user, 'user-3', 'user-2');

      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(projectsApi.updateProject).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/プロジェクト名/)).toHaveValue('変えた名前');
      expect(screen.getByRole('combobox', { name: '営業担当者' })).toHaveValue('user-3');
    });

    it('「保存する」で保存し、成功したら 45.3 の通知を出してプロジェクト一覧へ移る（45.3, 45.5）', async () => {
      const user = userEvent.setup();
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-2');
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects');
      });
      expect(projectsApi.updateProject).toHaveBeenCalledTimes(1);
      expect(projectsApi.updateProject).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ salesPersonId: 'user-3', constructionPersonId: 'user-2' }),
        '2025-01-15T00:00:00.000Z'
      );
      expect(mockNavigate).not.toHaveBeenCalledWith('/projects/project-1');
      const probe = screen.getByTestId('toast-probe');
      expect(within(probe).getByText(WITHOUT_ACCESS_MESSAGE)).toBeInTheDocument();
      expect(within(probe).queryByText('プロジェクトを更新しました')).not.toBeInTheDocument();
    });

    it('「保存する」の後で保存に失敗したら、遷移せずにエラーを出して編集画面に留まる', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, '他のユーザーによって更新されました', {
          type: 'https://architrack.example.com/problems/conflict',
          title: 'Conflict',
          status: 409,
          detail: '他のユーザーによって更新されました',
        })
      );
      renderProjectEditPage('project-1', true);

      await changeAssigneesAndSave(user, 'user-3', 'user-2');
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '保存する' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
      const probe = screen.getByTestId('toast-probe');
      expect(within(probe).getByText('他のユーザーによって更新されました')).toBeInTheDocument();
      expect(within(probe).queryByText(WITHOUT_ACCESS_MESSAGE)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
    });
  });
});
