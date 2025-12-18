/**
 * @fileoverview 現場調査編集ページテスト
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 1.3: 現場調査情報を編集して保存（楽観的排他制御）
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyEditPage from '../../pages/SiteSurveyEditPage';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import type { SiteSurveyDetail } from '../../types/site-survey.types';

// モックナビゲート
const mockNavigate = vi.fn();

// モック設定
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'survey-123' }),
    useNavigate: () => mockNavigate,
  };
});

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
const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-123',
  projectId: 'project-456',
  name: 'テスト現場調査',
  surveyDate: '2025-06-15',
  memo: '調査メモです',
  thumbnailUrl: '/uploads/thumbnails/img1.jpg',
  imageCount: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  project: {
    id: 'project-456',
    name: 'テストプロジェクト',
  },
  images: [],
};

// テストユーティリティ
function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyEditPage />
    </BrowserRouter>
  );
}

describe('SiteSurveyEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('表示', () => {
    it('ローディング中はスピナーを表示する', () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('現場調査データ取得後にフォームを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      // 初期データが入力されていることを確認
      const nameInput = screen.getByLabelText(/調査名/) as HTMLInputElement;
      expect(nameInput.value).toBe('テスト現場調査');

      const dateInput = screen.getByLabelText(/調査日/) as HTMLInputElement;
      expect(dateInput.value).toBe('2025-06-15');
    });

    it('ブレッドクラムナビゲーションを表示する (Requirement 2.5)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト' })).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('APIエラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(new Error('エラーが発生しました'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックすると再取得する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey)
        .mockRejectedValueOnce(new Error('エラー'))
        .mockResolvedValueOnce(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });
    });

    it('404エラー時にResourceNotFoundを表示する', async () => {
      const apiError = new ApiError(404, '現場調査が見つかりません', {});
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/現場調査.*見つかりません/)).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toBeInTheDocument();
    });
  });

  describe('フォーム操作', () => {
    it('フォーム送信成功後に詳細ページに遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(siteSurveysApi.updateSiteSurvey).mockResolvedValue({
        ...mockSurveyDetail,
        name: '更新された調査名',
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      // フォーム入力変更
      const nameInput = screen.getByLabelText(/調査名/);
      fireEvent.change(nameInput, { target: { value: '更新された調査名' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /保存/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(siteSurveysApi.updateSiteSurvey).toHaveBeenCalledWith(
          'survey-123',
          {
            name: '更新された調査名',
            surveyDate: '2025-06-15',
            memo: '調査メモです',
          },
          '2025-01-10T00:00:00.000Z' // expectedUpdatedAt
        );
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('現場調査を更新しました');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123');
    });

    it('更新エラー時にエラーメッセージを表示する (Requirement 1.3)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      const apiError = new ApiError(500, '更新に失敗しました', {});
      vi.mocked(siteSurveysApi.updateSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      // 送信
      const submitButton = screen.getByRole('button', { name: /保存/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('更新に失敗しました');
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('キャンセルボタンをクリックすると詳細ページに戻る', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123');
    });
  });

  describe('楽観的排他制御 (Requirement 1.3)', () => {
    it('409競合エラー時にエラーメッセージを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      const apiError = new ApiError(
        409,
        '他のユーザーが更新しました。再読み込みしてください。',
        {}
      );
      vi.mocked(siteSurveysApi.updateSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
      });

      // 送信
      const submitButton = screen.getByRole('button', { name: /保存/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          '他のユーザーが更新しました。再読み込みしてください。'
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('他のユーザーが更新しました。再読み込みしてください。')
        ).toBeInTheDocument();
      });
    });
  });
});
