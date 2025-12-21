/**
 * @fileoverview 現場調査詳細ページテスト
 *
 * Task 10.3: 現場調査詳細から画像ビューアへの導線を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 * Task 27.6: 現場調査詳細画面への写真一覧管理パネル統合
 *
 * Requirements:
 * - 2.3: 現場調査一覧の項目クリックで詳細画面に遷移する
 * - 2.4: 詳細画面の画像クリックで画像ビューア/エディタに遷移する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで階層を表示する
 * - 10.1: 報告書出力対象写真の選択
 * - 10.5: ドラッグアンドドロップによる写真順序変更
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyDetailPage from '../../pages/SiteSurveyDetailPage';
import * as siteSurveysApi from '../../api/site-surveys';
import * as surveyImagesApi from '../../api/survey-images';
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
vi.mock('../../api/survey-images');
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
    mediumUrl: '/uploads/medium/img1.jpg',
    fileName: 'image1.jpg',
    fileSize: 1024000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    includeInReport: true,
    comment: '施工箇所A',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'img-2',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img2.jpg',
    thumbnailPath: '/uploads/thumbnails/img2.jpg',
    mediumUrl: '/uploads/medium/img2.jpg',
    fileName: 'image2.jpg',
    fileSize: 2048000,
    width: 1920,
    height: 1080,
    displayOrder: 2,
    includeInReport: false,
    comment: null,
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

  // ============================================================================
  // Task 27.6: 写真一覧管理パネル統合テスト
  // ============================================================================
  describe('写真管理タブ切り替え (Task 27.6)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateImageMetadata).mockResolvedValue({
        id: 'img-1',
        surveyId: 'survey-123',
        fileName: 'image1.jpg',
        includeInReport: true,
        comment: 'updated',
        displayOrder: 1,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('サムネイル一覧と写真管理タブが表示される', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // タブが表示されることを確認
      expect(screen.getByRole('tab', { name: 'サムネイル一覧' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '写真管理' })).toBeInTheDocument();
    });

    it('初期状態ではサムネイル一覧タブがアクティブになる', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const thumbnailTab = screen.getByRole('tab', { name: 'サムネイル一覧' });
      expect(thumbnailTab).toHaveAttribute('aria-selected', 'true');
      // サムネイルグリッドが表示されている
      expect(screen.getByTestId('image-grid')).toBeInTheDocument();
    });

    it('写真管理タブをクリックすると写真管理パネルに切り替わる', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 写真管理タブをクリック
      const photoManagementTab = screen.getByRole('tab', { name: '写真管理' });
      fireEvent.click(photoManagementTab);

      await waitFor(() => {
        // 写真管理パネルが表示される
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });
      // サムネイルグリッドは非表示
      expect(screen.queryByTestId('image-grid')).not.toBeInTheDocument();
    });

    it('サムネイル一覧タブに戻るとサムネイルグリッドが表示される', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 写真管理タブをクリック
      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));
      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // サムネイル一覧タブをクリック
      fireEvent.click(screen.getByRole('tab', { name: 'サムネイル一覧' }));
      await waitFor(() => {
        expect(screen.getByTestId('image-grid')).toBeInTheDocument();
      });
      // 写真管理パネルは非表示
      expect(screen.queryByRole('region', { name: '写真管理パネル' })).not.toBeInTheDocument();
    });
  });

  describe('写真管理パネル表示 (Task 27.6)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateImageMetadata).mockResolvedValue({
        id: 'img-1',
        surveyId: 'survey-123',
        fileName: 'image1.jpg',
        includeInReport: true,
        comment: 'updated',
        displayOrder: 1,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('写真管理パネルに画像情報が表示される (Requirement 10.1)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 写真管理タブをクリック
      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 各画像のパネルアイテムが表示される
      const panelItems = screen.getAllByTestId('photo-panel-item');
      expect(panelItems).toHaveLength(2);

      // ファイル名が表示される
      expect(screen.getByText('image1.jpg')).toBeInTheDocument();
      expect(screen.getByText('image2.jpg')).toBeInTheDocument();

      // 報告書出力チェックボックスが表示される
      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      expect(checkboxes).toHaveLength(2);
    });

    it('報告書出力フラグの初期値が正しく表示される', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      // mockImagesの設定に基づき、1番目はtrue、2番目はfalse
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).not.toBeChecked();
    });
  });

  describe('写真管理パネル権限制御 (Task 27.6)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateImageMetadata).mockResolvedValue({
        id: 'img-1',
        surveyId: 'survey-123',
        fileName: 'image1.jpg',
        includeInReport: true,
        comment: 'updated',
        displayOrder: 1,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('編集権限がある場合、チェックボックスが操作可能', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      expect(checkboxes[0]).not.toBeDisabled();
    });

    it('編集権限がない場合、チェックボックスが無効化される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      expect(checkboxes[0]).toBeDisabled();
    });

    it('編集権限がある場合、ドラッグハンドルが表示される (Requirement 10.5)', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // ドラッグハンドルが表示される
      const dragHandles = screen.getAllByTestId('photo-drag-handle');
      expect(dragHandles.length).toBeGreaterThan(0);
    });

    it('編集権限がない場合、ドラッグハンドルが非表示', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // ドラッグハンドルが非表示
      expect(screen.queryByTestId('photo-drag-handle')).not.toBeInTheDocument();
    });
  });

  describe('写真管理パネル操作 (Task 27.6)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateImageMetadata).mockResolvedValue({
        id: 'img-1',
        surveyId: 'survey-123',
        fileName: 'image1.jpg',
        includeInReport: false,
        comment: null,
        displayOrder: 1,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('報告書出力フラグを変更するとAPIが呼ばれる', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 最初のチェックボックスをクリック（オフにする）
      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      fireEvent.click(checkboxes[0] as HTMLElement);

      await waitFor(() => {
        expect(surveyImagesApi.updateImageMetadata).toHaveBeenCalledWith('img-1', {
          includeInReport: false,
        });
      });
    });

    it('写真管理パネルで画像をクリックするとビューアに遷移する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: '写真管理' }));

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 画像をクリック
      const imageButtons = screen.getAllByTestId('photo-image-button');
      fireEvent.click(imageButtons[0] as HTMLElement);

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123/images/img-1');
    });
  });
});
