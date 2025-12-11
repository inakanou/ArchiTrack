/**
 * @fileoverview ProjectEditPage コンポーネントのテスト
 *
 * Task 19.4: ProjectEditPageの実装とパンくずナビゲーション追加
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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import ProjectEditPage from '../../pages/ProjectEditPage';
import * as projectsApi from '../../api/projects';
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
  customerName: 'テスト顧客',
  salesPerson: { id: 'user-1', displayName: 'Test User' },
  constructionPerson: { id: 'user-2', displayName: 'Construction User' },
  siteAddress: '東京都渋谷区',
  description: 'テストの説明文',
  status: 'PREPARING',
  statusLabel: '準備中',
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
 * ProjectEditPageをレンダリングするヘルパー
 */
function renderProjectEditPage(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/edit`]}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
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
    it('「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」のパンくずを表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      });

      expect(screen.getByText('プロジェクト')).toBeInTheDocument();
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

    it('プロジェクトリンクは /projects へ遷移可能', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト' });
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
    it('ページタイトル「プロジェクトの編集」を表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'プロジェクトの編集' })).toBeInTheDocument();
      });
    });

    it('現在のプロジェクト情報がプリセットされた編集フォームを表示する', async () => {
      renderProjectEditPage();

      await waitFor(() => {
        // プロジェクト名入力フィールド
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        expect(nameInput).toHaveValue('テストプロジェクト');
      });

      // 顧客名入力フィールド
      const customerNameInput = screen.getByLabelText(/顧客名/);
      expect(customerNameInput).toHaveValue('テスト顧客');

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

      // 競合エラーをモック
      vi.mocked(projectsApi.updateProject).mockRejectedValue({
        statusCode: 409,
        message: 'このプロジェクトは他のユーザーによって更新されています。',
      });

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
      vi.mocked(projectsApi.getProject).mockRejectedValue({
        statusCode: 404,
        message: 'プロジェクトが見つかりません',
      });

      renderProjectEditPage('non-existent');

      await waitFor(() => {
        expect(screen.getByText(/プロジェクトが見つかりません/)).toBeInTheDocument();
      });

      // 一覧に戻るリンクが表示される
      expect(screen.getByText('プロジェクト一覧に戻る')).toBeInTheDocument();
    });

    it('サーバーエラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラー',
      });

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
        .mockRejectedValueOnce({
          statusCode: 500,
          message: 'サーバーエラー',
        })
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
});
