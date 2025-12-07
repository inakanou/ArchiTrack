/**
 * @fileoverview ProjectDetailPage コンポーネントのテスト
 *
 * Task 9.2: ProjectDetailPageの実装
 *
 * Requirements:
 * - 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7: プロジェクト詳細表示
 * - 8.1, 8.2, 8.3, 8.5, 8.6: プロジェクト編集
 * - 9.2, 9.3, 9.4, 9.7: プロジェクト削除
 * - 11.1, 11.2, 11.3, 11.4, 11.5, 11.6: 関連データ参照
 * - 18.4, 18.5: エラーハンドリング
 * - 19.2: パフォーマンス
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../hooks/useToast';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import { ApiError } from '../../api/client';

// APIモック
vi.mock('../../api/projects');

// useAuthフックのモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
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

// テストデータ
const mockProject = {
  id: 'project-1',
  name: 'テストプロジェクト',
  customerName: 'テスト顧客',
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  siteAddress: '東京都渋谷区1-2-3',
  description: 'これはテストプロジェクトの説明です。',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

const mockStatusHistory = [
  {
    id: 'history-1',
    fromStatus: null,
    fromStatusLabel: null,
    toStatus: 'PREPARING' as const,
    toStatusLabel: '準備中',
    transitionType: 'initial' as const,
    transitionTypeLabel: '初期遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: '営業太郎' },
    changedAt: '2025-01-01T00:00:00.000Z',
  },
];

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

// モックユーザーデータ
const mockAssignableUsers = [
  { id: 'user-1', displayName: '営業太郎' },
  { id: 'user-2', displayName: '工事次郎' },
  { id: 'user-3', displayName: 'テストユーザー' },
];

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(projectsApi.getStatusHistory).mockResolvedValue(mockStatusHistory);
    vi.mocked(projectsApi.getAssignableUsers).mockResolvedValue(mockAssignableUsers);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // 7.1-7.7: プロジェクト詳細表示
  // ==========================================================================

  describe('プロジェクト詳細表示', () => {
    it('プロジェクト詳細情報を表示する', async () => {
      renderWithRouter();

      // ページタイトル（h1）を確認
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 基本情報セクション内のデータを確認（重複する可能性のあるテキストはgetAllByText）
      expect(screen.getAllByText('テスト顧客').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('営業太郎').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('工事次郎')).toBeInTheDocument();
      expect(screen.getByText('東京都渋谷区1-2-3')).toBeInTheDocument();
      expect(screen.getByText('これはテストプロジェクトの説明です。')).toBeInTheDocument();
    });

    it('工事担当者がnullの場合「未割当」と表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue({
        ...mockProject,
        constructionPerson: undefined,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      expect(screen.getByText('未割当')).toBeInTheDocument();
    });

    it('作成日時と更新日時を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 日付ラベルを確認
      expect(screen.getByText('作成日時')).toBeInTheDocument();
      expect(screen.getByText('更新日時')).toBeInTheDocument();
      // 日付値が表示されていることを確認（ステータス履歴にも日付があるので複数）
      expect(screen.getAllByText(/2025/).length).toBeGreaterThanOrEqual(2);
    });

    it('ローディングインジケータを表示する', () => {
      // 非同期を遅延させる
      vi.mocked(projectsApi.getProject).mockImplementation(() => new Promise(() => {}));

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 18.4, 18.5: エラーハンドリング
  // ==========================================================================

  describe('エラーハンドリング', () => {
    it('404エラー時にエラーページへ遷移する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(404, 'Not Found'));

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/404', { replace: true });
      });
    });

    it('403エラー時に権限エラーページへ遷移する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(403, 'Forbidden'));

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/403', { replace: true });
      });
    });

    it('その他のエラー時にエラーメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'Server Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Server Error/)).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.getProject)
        .mockRejectedValueOnce(new ApiError(500, 'Server Error'))
        .mockResolvedValueOnce(mockProject);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 8.1-8.6: 編集機能
  // ==========================================================================

  describe('編集機能', () => {
    it('編集ボタンをクリックすると編集フォームを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('キャンセルボタンをクリックすると詳細表示に戻る', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      expect(screen.getByRole('form')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('form')).not.toBeInTheDocument();
      });
    });

    it('編集フォーム送信時に更新APIを呼び出す', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.updateProject).mockResolvedValue({
        ...mockProject,
        name: '更新されたプロジェクト',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // フォームが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // フォームの入力を変更して送信（aria-labelでテキストボックスを取得）
      const nameInput = screen.getByRole('textbox', { name: 'プロジェクト名' });
      await user.clear(nameInput);
      await user.type(nameInput, '更新されたプロジェクト');

      const submitButton = screen.getByRole('button', { name: '保存' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(projectsApi.updateProject).toHaveBeenCalled();
      });
    });

    it('競合エラー（409）発生時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.updateProject).mockRejectedValue(
        new ApiError(409, '他のユーザーによって更新されました')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      const submitButton = screen.getByRole('button', { name: '保存' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/他のユーザーによって更新されました/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 9.2-9.4, 9.7: 削除機能
  // ==========================================================================

  describe('削除機能', () => {
    it('削除ボタンをクリックすると確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/削除しますか/)).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルをクリックするとダイアログを閉じる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // ダイアログ内のキャンセルボタンを取得
      const dialog = screen.getByRole('dialog');
      const cancelButton = within(dialog).getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('確認ダイアログで削除を実行すると一覧画面に遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.deleteProject).mockResolvedValue(undefined);

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      // ダイアログ内の削除ボタンを取得
      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(projectsApi.deleteProject).toHaveBeenCalledWith('project-1');
        // トースト通知に変更されたため、stateは渡されない
        expect(mockNavigate).toHaveBeenCalledWith('/projects');
      });
    });
  });

  // ==========================================================================
  // ステータス遷移UI
  // ==========================================================================

  describe('ステータス遷移UI', () => {
    it('StatusTransitionUIコンポーネントを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      expect(screen.getByText('現在のステータス')).toBeInTheDocument();
      expect(screen.getByText('ステータス遷移')).toBeInTheDocument();
      expect(screen.getByText('ステータス変更履歴')).toBeInTheDocument();
    });

    it('ステータス遷移を実行する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.transitionStatus).mockResolvedValue({
        ...mockProject,
        status: 'SURVEYING',
        statusLabel: '調査中',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 順方向遷移ボタン（調査中）をクリック
      const surveyingButton = screen.getByRole('button', { name: /調査中/ });
      await user.click(surveyingButton);

      await waitFor(() => {
        expect(projectsApi.transitionStatus).toHaveBeenCalledWith('project-1', {
          status: 'SURVEYING',
        });
      });
    });
  });

  // ==========================================================================
  // 「一覧に戻る」リンク
  // ==========================================================================

  describe('ナビゲーション', () => {
    it('「一覧に戻る」リンクを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: /一覧に戻る/ });
      expect(backLink).toHaveAttribute('href', '/projects');
    });
  });

  // ==========================================================================
  // 11.1-11.6: 関連データ（機能フラグ対応）
  // ==========================================================================

  describe('関連データ表示（機能フラグ対応）', () => {
    it('関連データ件数セクションが存在する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 機能フラグで非表示の場合、セクションが表示されないことを確認
      // または将来実装予定のプレースホルダーを確認
      expect(screen.getByRole('heading', { level: 2, name: '関連データ' })).toBeInTheDocument();
    });
  });
});
