/**
 * @fileoverview 現場調査詳細ページテスト
 *
 * Task 10.3: 現場調査詳細から画像ビューアへの導線を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 2.3: 現場調査一覧の項目クリックで詳細画面に遷移する
 * - 2.4: 詳細画面の画像クリックで画像ビューア/エディタに遷移する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで階層を表示する
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyDetailPage from '../../pages/SiteSurveyDetailPage';
import * as siteSurveysApi from '../../api/site-surveys';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

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
vi.mock('../../hooks/useSiteSurveyPermission');

// デフォルトの権限モック
const mockPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  isLoading: false,
  getPermissionError: vi.fn().mockReturnValue(null),
};

// テストデータ
const mockImages: SurveyImageInfo[] = [
  {
    id: 'img-1',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img1.jpg',
    thumbnailPath: '/uploads/thumbnails/img1.jpg',
    fileName: 'image1.jpg',
    fileSize: 1024000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'img-2',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img2.jpg',
    thumbnailPath: '/uploads/thumbnails/img2.jpg',
    fileName: 'image2.jpg',
    fileSize: 2048000,
    width: 1920,
    height: 1080,
    displayOrder: 2,
    createdAt: '2025-01-02T00:00:00.000Z',
  },
];

const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-123',
  projectId: 'project-456',
  name: 'テスト現場調査',
  surveyDate: '2025-01-15',
  memo: '調査メモです',
  thumbnailUrl: '/uploads/thumbnails/img1.jpg',
  imageCount: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  project: {
    id: 'project-456',
    name: 'テストプロジェクト',
  },
  images: mockImages,
};

// テストユーティリティ
function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyDetailPage />
    </BrowserRouter>
  );
}

describe('SiteSurveyDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(
      mockPermission
    );
  });

  describe('表示', () => {
    it('ローディング中はスピナーを表示する', () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('現場調査詳細を表示する (Requirement 2.3)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      expect(screen.getByText('調査メモです')).toBeInTheDocument();
      // プロジェクト名はリンクとして表示される
      expect(screen.getByRole('link', { name: 'テストプロジェクト' })).toBeInTheDocument();
    });

    it('ブレッドクラムナビゲーションを表示する (Requirement 2.5, 2.6)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ブレッドクラムを確認
      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'テストプロジェクト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '現場調査' })).toBeInTheDocument();
    });

    it('画像グリッドを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('image-grid')).toBeInTheDocument();
      });

      // 画像が表示されていることを確認
      expect(screen.getAllByRole('button', { name: /画像:/ })).toHaveLength(2);
    });

    it('画像がない場合は空状態を表示する', async () => {
      const surveyNoImages: SiteSurveyDetail = {
        ...mockSurveyDetail,
        images: [],
        imageCount: 0,
      };
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyNoImages);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('画像がありません')).toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('APIエラー時にエラーメッセージを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(
        new Error('現場調査の取得に失敗しました')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('現場調査の取得に失敗しました')).toBeInTheDocument();
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
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('画像クリックで画像ビューアに遷移する (Requirement 2.4)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('image-grid')).toBeInTheDocument();
      });

      // 最初の画像をクリック
      const imageButtons = screen.getAllByRole('button', { name: /画像:/ });
      expect(imageButtons[0]).toBeDefined();
      fireEvent.click(imageButtons[0] as HTMLElement);

      // 画像ビューアページに遷移
      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123/images/img-1');
    });

    it('編集ボタンクリックで編集ページに遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123/edit');
    });

    it('ブレッドクラムのプロジェクトリンクをクリックするとプロジェクト詳細に遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const projectLink = screen.getByRole('link', { name: 'テストプロジェクト' });
      expect(projectLink).toHaveAttribute('href', '/projects/project-456');
    });

    it('ブレッドクラムの現場調査リンクをクリックすると現場調査一覧に遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const surveyListLink = screen.getByRole('link', { name: '現場調査' });
      expect(surveyListLink).toHaveAttribute('href', '/projects/project-456/site-surveys');
    });
  });

  describe('削除機能', () => {
    it('削除ボタンをクリックすると確認ダイアログが表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });
    });
  });

  describe('権限によるUI制御 (Requirement 12.2)', () => {
    it('編集権限がある場合、編集ボタンが表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      });
    });

    it('編集権限がない場合、編集ボタンが非表示になる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
    });

    it('削除権限がある場合、削除ボタンが表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canDelete: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
      });
    });

    it('削除権限がない場合、削除ボタンが非表示になる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canDelete: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('編集・削除権限がない場合、両方のボタンが非表示になる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
        canDelete: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('権限がなくても基本情報は表示される (Requirement 12.1)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
        canDelete: false,
      });

      renderComponent();

      await waitFor(() => {
        // 基本情報が表示される
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        expect(screen.getByText('調査メモです')).toBeInTheDocument();
      });
    });
  });
});
