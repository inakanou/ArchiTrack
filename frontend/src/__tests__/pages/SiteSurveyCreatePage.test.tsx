/**
 * @fileoverview 現場調査作成ページテスト
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 1.1: 現場調査作成フォームで必須フィールド（調査名、調査日）を入力可能
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyCreatePage from '../../pages/SiteSurveyCreatePage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import type { ProjectDetail } from '../../types/project.types';

// モックナビゲート
const mockNavigate = vi.fn();

// モック設定
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: 'project-123' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');

// useToastのモック
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

// テストデータ
const mockProject: ProjectDetail = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト用プロジェクト説明',
  status: 'SURVEYING',
  statusLabel: '現地調査',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'partner-1',
  tradingPartner: {
    id: 'partner-1',
    name: 'テスト取引先',
    nameKana: 'テストトリヒキサキ',
  },
  salesPerson: {
    id: 'user-1',
    displayName: 'テスト管理者',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockCreatedSurvey = {
  id: 'survey-new',
  projectId: 'project-123',
  name: '新規現場調査',
  surveyDate: '2025-06-15',
  memo: '',
  thumbnailUrl: null,
  imageCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

// テストユーティリティ
function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyCreatePage />
    </BrowserRouter>
  );
}

describe('SiteSurveyCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('表示', () => {
    it('ローディング中はスピナーを表示する', () => {
      vi.mocked(projectsApi.getProject).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('プロジェクト取得後にフォームを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォームフィールドの存在を確認
      expect(screen.getByLabelText(/調査名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/調査日/)).toBeInTheDocument();
    });

    it('調査名欄にデフォルト値「現場調査」が設定される (Requirement 1.1)', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/調査名/) as HTMLInputElement;
      expect(nameInput.value).toBe('現場調査');
    });

    it('ブレッドクラムナビゲーションを表示する (Requirement 2.5)', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト' })).toBeInTheDocument();
    });

    it('一覧に戻るリンクを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: /一覧に戻る/ });
      expect(backLink).toHaveAttribute('href', '/projects/project-123/site-surveys');
    });
  });

  describe('エラーハンドリング', () => {
    it('プロジェクト取得エラー時にエラーメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(
        new Error('プロジェクトの取得に失敗しました')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/プロジェクトの取得に失敗しました/)).toBeInTheDocument();
    });

    it('ApiErrorの場合、エラーメッセージを表示する', async () => {
      const apiError = new ApiError(400, 'カスタムエラーメッセージ', {});
      vi.mocked(projectsApi.getProject).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('カスタムエラーメッセージ')).toBeInTheDocument();
    });
  });

  describe('フォーム操作', () => {
    it('フォーム送信後に作成されたページに遷移する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(siteSurveysApi.createSiteSurvey).mockResolvedValue(mockCreatedSurvey);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/調査名/);
      const dateInput = screen.getByLabelText(/調査日/);

      fireEvent.change(nameInput, { target: { value: '新規現場調査' } });
      fireEvent.change(dateInput, { target: { value: '2025-06-15' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(siteSurveysApi.createSiteSurvey).toHaveBeenCalledWith('project-123', {
          name: '新規現場調査',
          surveyDate: '2025-06-15',
          memo: null,
        });
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('現場調査を作成しました');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-new');
    });

    it('作成エラー時にエラーメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      const apiError = new ApiError(500, '作成に失敗しました', {});
      vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/調査名/);
      const dateInput = screen.getByLabelText(/調査日/);

      fireEvent.change(nameInput, { target: { value: '新規現場調査' } });
      fireEvent.change(dateInput, { target: { value: '2025-06-15' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('作成に失敗しました');
      });
    });

    it('キャンセルボタンをクリックすると一覧ページに戻る', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123/site-surveys');
    });
  });

  describe('409コンフリクトエラー', () => {
    it('409エラー時にsubmitErrorを設定する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      const apiError = new ApiError(409, '重複エラー', { duplicateField: 'name' });
      vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/調査名/);
      const dateInput = screen.getByLabelText(/調査日/);

      fireEvent.change(nameInput, { target: { value: '重複する調査名' } });
      fireEvent.change(dateInput, { target: { value: '2025-06-15' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('重複エラー')).toBeInTheDocument();
    });
  });

  describe('一般的なエラー', () => {
    it('ApiError以外のエラー時にデフォルトメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(new Error('Network Error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/調査名/);
      const dateInput = screen.getByLabelText(/調査日/);

      fireEvent.change(nameInput, { target: { value: '新規現場調査' } });
      fireEvent.change(dateInput, { target: { value: '2025-06-15' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('作成中にエラーが発生しました');
      });
    });

    it('ApiErrorでメッセージがない場合にデフォルトメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      const apiError = new ApiError(500, '', {});
      vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
      });

      // フォーム入力
      const nameInput = screen.getByLabelText(/調査名/);
      const dateInput = screen.getByLabelText(/調査日/);

      fireEvent.change(nameInput, { target: { value: '新規現場調査' } });
      fireEvent.change(dateInput, { target: { value: '2025-06-15' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('作成中にエラーが発生しました');
      });
    });

    it('プロジェクト取得でApiError以外のエラー時にデフォルトメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('Network Error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('プロジェクトの取得に失敗しました')).toBeInTheDocument();
    });
  });
});
