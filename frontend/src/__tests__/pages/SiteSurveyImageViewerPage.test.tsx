/**
 * @fileoverview 現場調査画像ビューアページテスト
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 2.4: 詳細画面の画像クリックで画像ビューア/エディタに遷移する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyImageViewerPage from '../../pages/SiteSurveyImageViewerPage';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

// モックナビゲート
const mockNavigate = vi.fn();

// モック設定
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'survey-123', imageId: 'img-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../api/site-surveys');

// AnnotationEditorモック
vi.mock('../../components/site-surveys/AnnotationEditor', () => ({
  default: ({
    imageUrl,
    imageId,
    surveyId,
  }: {
    imageUrl: string;
    imageId: string;
    surveyId: string;
  }) => (
    <div
      data-testid="annotation-editor"
      data-image-url={imageUrl}
      data-image-id={imageId}
      data-survey-id={surveyId}
    >
      MockAnnotationEditor
    </div>
  ),
}));

// テストデータ
const mockImages: SurveyImageInfo[] = [
  {
    id: 'img-1',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img1.jpg',
    originalUrl: 'https://example.com/signed/img1.jpg',
    thumbnailPath: '/uploads/thumbnails/img1.jpg',
    fileName: 'image1.jpg',
    fileSize: 1024000,
    width: 1920,
    height: 1080,
    displayOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'img-2',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img2.jpg',
    originalUrl: 'https://example.com/signed/img2.jpg',
    thumbnailPath: '/uploads/thumbnails/img2.jpg',
    fileName: 'image2.jpg',
    fileSize: 2048000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    createdAt: '2025-01-02T00:00:00.000Z',
  },
];

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
  images: mockImages,
};

// テストユーティリティ
function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyImageViewerPage />
    </BrowserRouter>
  );
}

describe('SiteSurveyImageViewerPage', () => {
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

    it('データ取得後に画像を表示する (Requirement 2.4)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      // AnnotationEditorが正しくレンダリングされることを確認
      const editor = screen.getByTestId('annotation-editor');
      expect(editor).toBeInTheDocument();
      expect(editor).toHaveAttribute('data-image-url', 'https://example.com/signed/img1.jpg');
      expect(editor).toHaveAttribute('data-image-id', 'img-1');
      expect(editor).toHaveAttribute('data-survey-id', 'survey-123');
    });

    it('ブレッドクラムナビゲーションを表示する (Requirement 2.5)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'テストプロジェクト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '現場調査' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'テスト現場調査' })).toBeInTheDocument();
    });

    it('ファイル名がヘッダーに表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      // AnnotationEditorに正しい画像情報が渡されていることを確認
      const editor = screen.getByTestId('annotation-editor');
      expect(editor).toBeInTheDocument();
    });

    it('現場調査に戻るリンクを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: /現場調査に戻る/ });
      expect(backLink).toHaveAttribute('href', '/site-surveys/survey-123');
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
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });
    });

    it('404エラー時にResourceNotFoundを表示する', async () => {
      const apiError = new ApiError(404, '現場調査が見つかりません', {});
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/画像.*見つかりません/)).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: '現場調査に戻る' })).toBeInTheDocument();
    });

    it('画像が見つからない場合にResourceNotFoundを表示する', async () => {
      const surveyWithoutTargetImage: SiteSurveyDetail = {
        ...mockSurveyDetail,
        images: [mockImages[1]!], // img-1 が含まれていない
      };
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyWithoutTargetImage);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/画像.*見つかりません/)).toBeInTheDocument();
      });
    });
  });

  describe('画像表示の詳細', () => {
    it('originalUrlがない場合はプレースホルダーを表示する', async () => {
      const surveyWithoutOriginalUrl: SiteSurveyDetail = {
        ...mockSurveyDetail,
        images: [
          {
            ...mockImages[0]!,
            originalUrl: undefined,
          },
        ],
      };
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyWithoutOriginalUrl);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('画像が読み込めません')).toBeInTheDocument();
      });

      expect(screen.getByText('画像が存在しないか、読み込みに失敗しました。')).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('戻るリンククリックで現場調査詳細ページに遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: /現場調査に戻る/ });
      fireEvent.click(backLink);

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123');
    });
  });

  describe('編集モード', () => {
    it('編集モードボタンをクリックすると編集モードに切り替わる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集モード' });
      expect(editButton).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(editButton);

      expect(screen.getByRole('button', { name: '編集終了' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '編集終了' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('編集終了ボタンをクリックすると閲覧モードに戻る', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'image1.jpg' })).toBeInTheDocument();
      });

      // 編集モードに切り替え
      fireEvent.click(screen.getByRole('button', { name: '編集モード' }));

      // 編集終了をクリック
      fireEvent.click(screen.getByRole('button', { name: '編集終了' }));

      expect(screen.getByRole('button', { name: '編集モード' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '編集モード' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });
  });

  describe('APIエラーの種類', () => {
    it('ApiErrorでメッセージがない場合にデフォルトメッセージを表示する', async () => {
      const apiError = new ApiError(500, '', {});
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });
  });
});
