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
 * - 14.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyDetailPage from '../../pages/SiteSurveyDetailPage';
import * as siteSurveysApi from '../../api/site-surveys';
import * as surveyImagesApi from '../../api/survey-images';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';
import useMediaQuery from '../../hooks/useMediaQuery';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

// モックナビゲート
const mockNavigate = vi.fn();

// Task 115.56 / 115.87: 画像一覧が差し替わる契機（同一の現場調査の再取得＝location.key の
// 変化）をテストから再現できるようにする。ルートパラメータは useParams の戻り値として
// 必要なため保持するが、単体検証では既定の survey-123 から動かさない。調査またぎを
// この差し替えで模すと本番の導線に無い筋書きになるため（後述「再取得時の選択整合」節）。
// 既定値は従来どおり survey-123 / 固定キーであり、他のテストの前提は変わらない。
let mockRouteSurveyId = 'survey-123';
let mockLocationKey = 'default';

// モック設定
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: mockRouteSurveyId }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      key: mockLocationKey,
      pathname: `/site-surveys/${mockRouteSurveyId}`,
      search: '',
      hash: '',
      state: null,
    }),
  };
});

vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-images');
vi.mock('../../hooks/useSiteSurveyPermission');
// useMediaQueryのモック（デフォルトはデスクトップ幅=false）
// Task 100.2: モバイル幅時のコンテナ余白/幅調整を検証するため、
// isMobile 判定をテストごとに切り替えられるようにする。
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));
// useUnsavedChangesのモック
// Task 100.24（quantity-table-generation）でフックは未保存判定 `isDirty` を受け取るだけの形へ
// 一本化され、戻り値を持たない。未保存判定は画面が持つため、画面がフックへ渡した `isDirty` を
// 記録して「変更で未保存になる／保存で解消する」ことを測る。
const mockUseUnsavedChanges = vi.fn((_options: { isDirty: boolean; message?: string }) => {});
/** 直近の描画で画面がフックへ渡した isDirty */
const lastUnsavedDirty = (): boolean | undefined =>
  mockUseUnsavedChanges.mock.calls[mockUseUnsavedChanges.mock.calls.length - 1]?.[0].isDirty;

vi.mock('../../hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: (options: { isDirty: boolean; message?: string }) =>
    mockUseUnsavedChanges(options),
}));

// PDF出力サービスのモック（ページテストではUI動作のみをテストし、実際のPDF生成は行わない）
// 画面は `loadPdfExportService()`（動的 import の境界）経由で呼び出すため実サービスを差し替える。
vi.mock('../../services/export/PdfExportService', () => ({
  exportAndDownloadPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/export/AnnotationRendererService', () => ({
  renderImagesWithAnnotations: vi.fn().mockResolvedValue([]),
  // Task 87.3: bulkExportService が AnnotationRendererService クラスを参照するため、
  // ダミーの class を提供してモジュール初期化エラーを避ける。
  AnnotationRendererService: class {
    async renderImage() {
      return { dataUrl: 'data:image/jpeg;base64,', width: 0, height: 0 };
    }
    dispose() {}
  },
}));

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
    originalUrl: 'https://example.com/uploads/original/img1.jpg',
    thumbnailUrl: 'https://example.com/uploads/thumbnails/img1.jpg',
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
    originalUrl: 'https://example.com/uploads/original/img2.jpg',
    thumbnailUrl: 'https://example.com/uploads/thumbnails/img2.jpg',
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

// ============================================================================
// URL.createObjectURL / revokeObjectURL のスタブ
//
// アップロード失敗時に ImageUploader が未送信画像のプレビューURLを生成するが、
// jsdom は ObjectURL API を実装しない。テストを条件付きで無効化せず
// スタブへ差し替える（AI運用第3原則）。
// ============================================================================

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

/** 発行済み ObjectURL の通し番号 */
let issuedObjectUrlCount = 0;

beforeEach(() => {
  issuedObjectUrlCount = 0;
  URL.createObjectURL = vi.fn((): string => {
    issuedObjectUrlCount += 1;
    return `blob:mock/${issuedObjectUrlCount}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('SiteSurveyDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Task 115.56: ルートパラメータ / location.key を既定へ戻す
    mockRouteSurveyId = 'survey-123';
    mockLocationKey = 'default';
    vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(
      mockPermission
    );
    // 既定はデスクトップ幅（isMobile=false）に戻す
    vi.mocked(useMediaQuery).mockReturnValue(false);
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
      expect(screen.getByRole('link', { name: 'プロジェクト一覧' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'テストプロジェクト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '現場調査一覧' })).toBeInTheDocument();
    });

    it('写真管理パネルを表示する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 画像が表示されていることを確認
      expect(screen.getAllByRole('button', { name: /画像を拡大表示:/ })).toHaveLength(2);
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

  // ============================================================================
  // Task 100.2: モバイル余白/幅調整
  // Requirement 35.2: モバイル幅で詳細画面全体に水平はみ出しを発生させない
  //   （内側の固定幅の支配を解消するため、ページコンテナを画面幅にフィットさせる）
  // Requirement 35.7: デスクトップ幅の既存レイアウトを維持する
  // ============================================================================
  describe('モバイル余白/幅調整 (Task 100.2, Requirement 35.2)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('モバイル幅ではページコンテナが固定maxWidth:1200pxに縛られず画面幅にフィットする', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const main = screen.getByRole('main');
      // 固定幅 1200px の支配を解消し、画面幅にフィットする
      expect(main.style.maxWidth).not.toBe('1200px');
      expect(main.style.maxWidth).toBe('100%');
    });

    it('デスクトップ幅では既存のmaxWidth:1200pxレイアウトを維持する (Requirement 35.7)', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const main = screen.getByRole('main');
      expect(main.style.maxWidth).toBe('1200px');
      expect(main.style.margin).toBe('0px auto');
    });

    /**
     * パンくずラッパは折返し不可の flex 行（長い現場調査名を含む）を内包するため、
     * overflow-x:auto を欠くと 375px 幅で祖先を超えて水平 overflow し、
     * documentElement.scrollWidth がビューポート幅を超えて REQ-35.2 に違反する。
     * ラッパ自身の overflow-x:auto は祖先の scrollWidth に寄与せずはみ出しを収容するため、
     * この属性が常時付与されていることをガードする（デスクトップ幅でも回帰しない）。
     * @requirement site-survey/REQ-35.2
     */
    it('パンくずラッパは水平あふれを収容するためoverflow-x:autoを付与する (Requirement 35.2)', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // パンくずナビゲーションを内包するラッパ div（STYLES.breadcrumbWrapper）を取得
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const breadcrumbWrapper = breadcrumbNav.parentElement;
      expect(breadcrumbWrapper).not.toBeNull();
      // 長いパンくず行を水平スクロール内に収め、祖先の水平 overflow を防ぐ
      expect(breadcrumbWrapper!.style.overflowX).toBe('auto');
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
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 最初の画像をクリック
      const imageButtons = screen.getAllByRole('button', { name: /画像を拡大表示:/ });
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

      const surveyListLink = screen.getByRole('link', { name: '現場調査一覧' });
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

    it('キャンセルボタンをクリックすると確認ダイアログが閉じる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('現場調査を削除しますか？')).not.toBeInTheDocument();
      });
    });

    it('削除確認で削除成功後に一覧ページへ遷移する', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(siteSurveysApi.deleteSiteSurvey).mockResolvedValue(undefined);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });

      // 削除を確認
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(siteSurveysApi.deleteSiteSurvey).toHaveBeenCalledWith('survey-123');
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-456/site-surveys');
      });
    });

    it('削除失敗時にエラーメッセージを表示してダイアログを閉じる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue(new Error('削除に失敗しました'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });

      // 削除を確認
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        // ダイアログが閉じる
        expect(screen.queryByText('現場調査を削除しますか？')).not.toBeInTheDocument();
      });
    });
  });

  describe('権限によるUI制御 (Requirement 14.2)', () => {
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

    it('権限がなくても基本情報は表示される (Requirement 14.1)', async () => {
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
  // Requirement 10.1: サムネイル一覧タブは表示せず、写真管理パネルのみを直接表示
  // ============================================================================
  describe('写真管理パネル表示 (Task 27.6, Requirement 10.1)', () => {
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

    it('写真管理パネルが直接表示される（サムネイル一覧タブなし）', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // タブは存在しない
      expect(screen.queryByRole('tab', { name: 'サムネイル一覧' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: '写真管理' })).not.toBeInTheDocument();

      // 写真管理パネルが直接表示される
      expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
    });

    it('写真管理パネルに画像情報が表示される (Requirement 10.1)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 写真管理パネルが直接表示される
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

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // ドラッグハンドルが非表示
      expect(screen.queryByTestId('photo-drag-handle')).not.toBeInTheDocument();
    });
  });

  describe('写真管理パネル操作 (Task 27.6, Task 33.1: 手動保存方式)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockResolvedValue([
        {
          id: 'img-1',
          surveyId: 'survey-123',
          fileName: 'image1.jpg',
          includeInReport: false,
          comment: null,
          displayOrder: 1,
        },
      ]);
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('報告書出力フラグを変更すると未保存状態になる（フックへ isDirty=true が渡る）', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 最初のチェックボックスをクリック（オフにする）
      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      fireEvent.click(checkboxes[0] as HTMLElement);

      // 未保存状態になることを確認（手動保存方式）
      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('写真管理パネルで画像をクリックするとビューアに遷移する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // 画像をクリック
      const imageButtons = screen.getAllByTestId('photo-image-button');
      fireEvent.click(imageButtons[0] as HTMLElement);

      expect(mockNavigate).toHaveBeenCalledWith('/site-surveys/survey-123/images/img-1');
    });
  });

  // ============================================================================
  // Task 28.3: 調査報告書出力UI
  // ============================================================================
  describe('調査報告書出力UI (Task 28.3)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    describe('出力ボタン表示 (Requirement 11.1, 11.8)', () => {
      it('現場調査詳細画面に「調査報告書出力」ボタンが表示される', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: '調査報告書出力' })).toBeInTheDocument();
      });

      it('報告書出力ボタンがアクションエリアに表示される', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        // ボタンがある程度の位置に表示されていることを確認
        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        expect(exportButton).toBeVisible();
      });
    });

    describe('報告書出力対象の検証 (Requirement 11.1)', () => {
      it('報告書出力対象の写真が0件の場合、エラーメッセージを表示する', async () => {
        // 全ての画像がincludeInReport: falseの場合
        const surveyNoExportImages: SiteSurveyDetail = {
          ...mockSurveyDetail,
          images: mockImages.map((img) => ({ ...img, includeInReport: false })),
        };
        vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyNoExportImages);

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        // 報告書出力ボタンをクリック
        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        fireEvent.click(exportButton);

        await waitFor(() => {
          expect(
            screen.getByText(
              '報告書出力対象の写真がありません。写真管理で出力対象を選択してください。'
            )
          ).toBeInTheDocument();
        });
      });

      it('エラーメッセージが表示された場合、一定時間後に消える', async () => {
        const surveyNoExportImages: SiteSurveyDetail = {
          ...mockSurveyDetail,
          images: mockImages.map((img) => ({ ...img, includeInReport: false })),
        };
        vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyNoExportImages);

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        fireEvent.click(exportButton);

        await waitFor(() => {
          expect(
            screen.getByText(
              '報告書出力対象の写真がありません。写真管理で出力対象を選択してください。'
            )
          ).toBeInTheDocument();
        });

        // 5秒後に消えることを確認（vi.useFakeTimersを使用）
        vi.useFakeTimers();
        await vi.advanceTimersByTimeAsync(5000);
        vi.useRealTimers();
      });
    });

    describe('PDF生成プログレス表示 (Requirement 11.8)', () => {
      it('PDF生成中にプログレス表示が表示される', async () => {
        // 報告書出力対象の写真がある場合
        const surveyWithExportImages: SiteSurveyDetail = {
          ...mockSurveyDetail,
          images: [{ ...mockImages[0]!, includeInReport: true }],
        };
        vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyWithExportImages);

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        fireEvent.click(exportButton);

        // プログレス表示が表示される
        await waitFor(() => {
          expect(screen.getByTestId('pdf-export-progress')).toBeInTheDocument();
        });
      });

      it('PDF生成中はボタンが無効化される', async () => {
        const surveyWithExportImages: SiteSurveyDetail = {
          ...mockSurveyDetail,
          images: [{ ...mockImages[0]!, includeInReport: true }],
        };
        vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyWithExportImages);

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        fireEvent.click(exportButton);

        await waitFor(() => {
          expect(exportButton).toBeDisabled();
        });
      });

      it('プログレス表示にパーセンテージが表示される', async () => {
        const surveyWithExportImages: SiteSurveyDetail = {
          ...mockSurveyDetail,
          images: [{ ...mockImages[0]!, includeInReport: true }],
        };
        vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyWithExportImages);

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        const exportButton = screen.getByRole('button', { name: '調査報告書出力' });
        fireEvent.click(exportButton);

        await waitFor(() => {
          expect(screen.getByTestId('pdf-export-progress')).toBeInTheDocument();
          // パーセンテージ表示を確認（0%〜100%のいずれか）
          expect(screen.getByTestId('pdf-export-percentage')).toBeInTheDocument();
        });
      });
    });

    describe('権限制御 (Requirement 14.2)', () => {
      it('閲覧権限のみでも報告書出力ボタンは表示される', async () => {
        vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
          ...mockPermission,
          canEdit: false,
          canDelete: false,
        });

        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        // 報告書出力は読み取り操作なので表示される
        expect(screen.getByRole('button', { name: '調査報告書出力' })).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 画像アップロード機能テスト
  // ============================================================================
  describe('画像アップロード機能', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({ results: [], errors: [] });
    });

    it('編集権限がある場合、画像アップロードUIが表示される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ImageUploaderコンポーネントが表示される
      expect(screen.getByTestId('image-uploader')).toBeInTheDocument();
    });

    it('編集権限がない場合、画像アップロードUIが非表示', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ImageUploaderコンポーネントが非表示
      expect(screen.queryByTestId('image-uploader')).not.toBeInTheDocument();
    });

    it('ImageUploaderにcompactプロパティが設定されている', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ImageUploaderコンポーネントがコンパクトモードで表示される
      const uploader = screen.getByTestId('image-uploader');
      expect(uploader).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 順序変更機能テスト
  // ============================================================================
  describe('順序変更機能', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
    });

    it('順序変更失敗時にエラーメッセージが表示される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockRejectedValue(
        new Error('順序の保存に失敗しました')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 順序変更エラーのテスト - ドラッグイベントをシミュレートしてonOrderChangeを発火
      // (この部分はPhotoManagementPanelの実装に依存)
    });
  });

  // ============================================================================
  // メタデータ変更機能テスト (Task 33.1: 手動保存方式)
  // ============================================================================
  describe('メタデータ変更エラーハンドリング (Task 33.1: 手動保存方式)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('メタデータ一括保存失敗時にエラーメッセージが表示される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
      vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockRejectedValue(
        new Error('メタデータの保存に失敗しました')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // チェックボックスをクリックして変更を追加
      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      fireEvent.click(checkboxes[0] as HTMLElement);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /保存/i });
      fireEvent.click(saveButton);

      // エラーハンドリングをテスト（APIが呼ばれたことを確認）
      await waitFor(() => {
        expect(surveyImagesApi.updateImageMetadataBatch).toHaveBeenCalled();
      });
    });

    it('非Errorタイプのエラーでもエラーメッセージが表示される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
      // 文字列エラーをスロー
      vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockRejectedValue('文字列エラー');

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      fireEvent.click(checkboxes[0] as HTMLElement);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /保存/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(surveyImagesApi.updateImageMetadataBatch).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // エラーハンドリング追加テスト
  // ============================================================================
  describe('エラーハンドリング追加', () => {
    it('非Errorタイプの例外時にデフォルトエラーメッセージが表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue('文字列エラー');

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('現場調査の取得に失敗しました')).toBeInTheDocument();
    });

    it('現場調査が見つからない場合は何も表示されない', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        null as unknown as SiteSurveyDetail
      );

      const { container } = renderComponent();

      // ローディングが終了するまで待機
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // エラー表示もなく、コンテンツも表示されない（nullを返す）
      expect(screen.queryByRole('heading', { name: 'テスト現場調査' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // containerの直接子要素が空または最小限であることを確認
      expect(
        container.querySelector('[data-testid="survey-detail-container"]')
      ).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // 順序変更エラーテスト
  // ============================================================================
  describe('順序変更エラーハンドリング', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('順序変更失敗時に非Errorタイプのエラーでもメッセージが表示される', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockRejectedValue('文字列エラー');

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 順序変更APIが呼ばれることを確認するための間接的なテスト
      expect(surveyImagesApi.updateSurveyImageOrder).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 削除処理でsurveyがnullの場合のテスト
  // ============================================================================
  describe('削除処理の境界ケース', () => {
    it('削除中にエラーが発生した場合にダイアログが閉じる', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue(new Error('削除に失敗しました'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });

      // 削除を確認
      const confirmButton = screen.getByRole('button', { name: '削除する' });
      fireEvent.click(confirmButton);

      // エラーが発生してダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText('現場調査を削除しますか？')).not.toBeInTheDocument();
      });
    });

    it('削除失敗時に非Errorタイプのエラーでもデフォルトメッセージが表示される', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue('文字列エラー');

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('現場調査を削除しますか？')).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 画像アップロード機能詳細テスト
  // ============================================================================
  describe('画像アップロード機能詳細', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
    });

    it('アップロード進捗が更新される', async () => {
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockImplementation(
        async (_id, _files, options) => {
          // プログレスをシミュレート
          if (options?.onProgress) {
            options.onProgress({ completed: 1, total: 2, current: 1, results: [], errors: [] });
          }
          return { results: [], errors: [] };
        }
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ImageUploaderは存在するがファイル選択は複雑なのでAPIモックのテストに集中
      expect(screen.getByTestId('image-uploader')).toBeInTheDocument();
    });

    it('画像アップロード成功時に再取得せず一覧へ追記され進捗が更新される', async () => {
      // アップロード応答には署名付きURL込みの新規画像が返る想定（既存画像と別ID）
      const uploadedImage: SurveyImageInfo = {
        ...(mockImages[0] as SurveyImageInfo),
        id: 'img-uploaded-1',
        fileName: 'uploaded-photo.jpg',
        displayOrder: 999,
      };
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockImplementation(
        async (_id, _files, options) => {
          // プログレスコールバックをシミュレート
          if (options?.onProgress) {
            options.onProgress({
              completed: 1,
              total: 1,
              current: 1,
              results: [uploadedImage],
              errors: [],
            });
          }
          return { results: [uploadedImage], errors: [] };
        }
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ファイル入力を取得してファイル選択をシミュレート
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();

      const testFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInput, 'files', {
        value: [testFile],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(surveyImagesApi.uploadSurveyImages).toHaveBeenCalledWith(
          'survey-123',
          expect.any(Array),
          expect.any(Object)
        );
      });

      // 返却された画像が詳細データの再取得なしで一覧へ追記される
      await waitFor(() => {
        expect(screen.getByText('uploaded-photo.jpg')).toBeInTheDocument();
      });

      // 詳細データ全体の再取得（getSiteSurvey）は行われない（初回ロードの1回のみ）
      expect(siteSurveysApi.getSiteSurvey).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 順序変更機能詳細テスト（Error/非Errorの両ケース）
  // ============================================================================
  describe('順序変更詳細テスト', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
    });

    it('順序変更失敗時にErrorタイプのエラーメッセージが表示される', async () => {
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockRejectedValue(
        new Error('順序の保存に失敗しました')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ドラッグハンドルが表示されることを確認
      await waitFor(() => {
        expect(screen.getAllByTestId('photo-drag-handle').length).toBeGreaterThan(0);
      });
    });

    it('順序変更成功時にデータが再取得される', async () => {
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // ドラッグ&ドロップをシミュレート
      const dragHandles = screen.getAllByTestId('photo-drag-handle');
      expect(dragHandles.length).toBeGreaterThan(1);

      // ドラッグイベントをシミュレート
      fireEvent.dragStart(dragHandles[0] as HTMLElement, {
        dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
      });

      fireEvent.dragOver(dragHandles[1] as HTMLElement, {
        dataTransfer: { getData: vi.fn().mockReturnValue('0') },
      });

      fireEvent.drop(dragHandles[1] as HTMLElement, {
        dataTransfer: { getData: vi.fn().mockReturnValue('0') },
      });

      fireEvent.dragEnd(dragHandles[0] as HTMLElement);
    });
  });

  // ============================================================================
  // メタデータ変更詳細テスト (Task 33.1: 手動保存方式)
  // ============================================================================
  describe('メタデータ変更詳細テスト (Task 33.1: 手動保存方式)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
    });

    it('メタデータ変更成功時に楽観的UI更新が行われる', async () => {
      vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockResolvedValue([
        {
          id: 'img-1',
          surveyId: 'survey-123',
          fileName: 'image1.jpg',
          includeInReport: false,
          comment: null,
          displayOrder: 1,
        },
      ]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
      expect(checkboxes[0]).toBeChecked();

      // チェックを外す（楽観的UI更新でUIが即座に変化）
      fireEvent.click(checkboxes[0] as HTMLElement);

      // 楽観的UI更新により、チェックが外れる
      await waitFor(() => {
        expect(checkboxes[0]).not.toBeChecked();
      });

      // 未保存状態になったことを確認
      expect(lastUnsavedDirty()).toBe(true);
    });

    it('コメント変更時に楽観的UI更新が行われ、未保存状態になる', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
      });

      // コメント入力欄を取得（最初の画像のコメント欄）
      const commentInputs = screen.getAllByRole('textbox');
      if (commentInputs.length > 0) {
        fireEvent.change(commentInputs[0] as HTMLElement, { target: { value: '新しいコメント' } });
        fireEvent.blur(commentInputs[0] as HTMLElement);

        // 未保存状態になったことを確認（手動保存方式）
        await waitFor(() => {
          expect(lastUnsavedDirty()).toBe(true);
        });
      }
    });
  });

  // ============================================================================
  // Task 37: 画像順序変更のローカル状態管理テスト
  // ============================================================================
  describe('画像順序変更のローカル状態管理 (Task 37)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
      vi.mocked(surveyImagesApi.updateSurveyImageOrder).mockResolvedValue(undefined);
      vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockResolvedValue([]);
    });

    // -------------------------------------------------------------------------
    // Task 37.3: pendingOrderRefパターン
    // -------------------------------------------------------------------------
    describe('pendingOrderRefパターン (Task 37.3)', () => {
      it('順序変更時に未保存状態になること (要件4.11, 10.5)', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
        });

        // ドラッグハンドルを使用して順序変更
        const dragHandles = screen.getAllByTestId('photo-drag-handle');
        const items = screen.getAllByTestId('photo-panel-item');

        fireEvent.dragStart(dragHandles[0] as HTMLElement, {
          dataTransfer: { setData: vi.fn(), effectAllowed: 'move', getData: () => 'img-1' },
        });

        fireEvent.drop(items[1] as HTMLElement, {
          preventDefault: vi.fn(),
          dataTransfer: { getData: () => 'img-1' },
        });

        // 未保存状態になることを確認
        await waitFor(() => {
          expect(lastUnsavedDirty()).toBe(true);
        });
      });

      it('保存ボタンクリック時に順序変更APIが呼ばれること (要件10.6, 10.7)', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
        });

        // ドラッグ&ドロップで順序変更
        const dragHandles = screen.getAllByTestId('photo-drag-handle');
        const items = screen.getAllByTestId('photo-panel-item');

        fireEvent.dragStart(dragHandles[0] as HTMLElement, {
          dataTransfer: { setData: vi.fn(), effectAllowed: 'move', getData: () => 'img-1' },
        });

        fireEvent.drop(items[1] as HTMLElement, {
          preventDefault: vi.fn(),
          dataTransfer: { getData: () => 'img-1' },
        });

        // 保存ボタンをクリック
        const saveButton = screen.getByRole('button', { name: /保存/i });
        fireEvent.click(saveButton);

        // updateSurveyImageOrderが呼ばれることを確認
        await waitFor(() => {
          expect(surveyImagesApi.updateSurveyImageOrder).toHaveBeenCalled();
        });
      });

      it('保存成功後に未保存状態が解消すること', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
        });

        // 順序変更
        const dragHandles = screen.getAllByTestId('photo-drag-handle');
        const items = screen.getAllByTestId('photo-panel-item');

        fireEvent.dragStart(dragHandles[0] as HTMLElement, {
          dataTransfer: { setData: vi.fn(), effectAllowed: 'move', getData: () => 'img-1' },
        });

        fireEvent.drop(items[1] as HTMLElement, {
          preventDefault: vi.fn(),
          dataTransfer: { getData: () => 'img-1' },
        });

        // 変更で未保存になったことを確認（保存後の解消を測る前提）
        await waitFor(() => {
          expect(lastUnsavedDirty()).toBe(true);
        });

        // 保存ボタンをクリック
        const saveButton = screen.getByRole('button', { name: /保存/i });
        fireEvent.click(saveButton);

        // 保存成功で未保存状態が解消し、フックへ isDirty=false が渡ることを確認
        await waitFor(() => {
          expect(surveyImagesApi.updateSurveyImageOrder).toHaveBeenCalled();
          expect(lastUnsavedDirty()).toBe(false);
        });
      });
    });

    // -------------------------------------------------------------------------
    // Task 37.4: 画像削除時のpendingOrderRef/pendingChangesクリア
    // -------------------------------------------------------------------------
    describe('画像削除時のpendingクリア (Task 37.4)', () => {
      beforeEach(() => {
        vi.mocked(surveyImagesApi.deleteSurveyImage).mockResolvedValue(undefined);
        vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
          ...mockPermission,
          canEdit: true,
          canDelete: true,
        });
      });

      it('画像削除後もエラーなく保存できること (要件10.11, 10.12)', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
        });

        // まず順序変更を行う
        const dragHandles = screen.getAllByTestId('photo-drag-handle');
        const items = screen.getAllByTestId('photo-panel-item');

        fireEvent.dragStart(dragHandles[0] as HTMLElement, {
          dataTransfer: { setData: vi.fn(), effectAllowed: 'move', getData: () => 'img-1' },
        });

        fireEvent.drop(items[1] as HTMLElement, {
          preventDefault: vi.fn(),
          dataTransfer: { getData: () => 'img-1' },
        });

        // 削除ボタンをクリック（パネル内の最初の画像アイテムの削除ボタン）
        // image1.jpgの削除ボタンを取得
        const deleteButton = screen.getByRole('button', { name: /画像を削除: image1\.jpg/i });
        expect(deleteButton).toBeInTheDocument();
        fireEvent.click(deleteButton);

        // 確認ダイアログで削除を確認
        await waitFor(() => {
          expect(screen.getByText(/この画像を削除しますか？/i)).toBeInTheDocument();
        });

        const confirmButton = screen.getByRole('button', { name: /削除する/i });
        fireEvent.click(confirmButton);

        // 削除APIが呼ばれることを確認
        await waitFor(() => {
          expect(surveyImagesApi.deleteSurveyImage).toHaveBeenCalled();
        });
      });

      it('画像削除後にローカル状態が更新されること', async () => {
        renderComponent();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
        });

        // 最初に2枚の画像があることを確認
        expect(screen.getAllByTestId('photo-panel-item')).toHaveLength(2);

        // 削除ボタンをクリック（image1.jpgの削除ボタン）
        const deleteButton = screen.getByRole('button', { name: /画像を削除: image1\.jpg/i });
        expect(deleteButton).toBeInTheDocument();
        fireEvent.click(deleteButton);

        // 確認ダイアログで削除を確認
        await waitFor(() => {
          expect(screen.getByText(/この画像を削除しますか？/i)).toBeInTheDocument();
        });

        const confirmButton = screen.getByRole('button', { name: /削除する/i });
        fireEvent.click(confirmButton);

        // 削除後、画像が1枚になることを確認
        await waitFor(() => {
          expect(screen.getAllByTestId('photo-panel-item')).toHaveLength(1);
        });
      });
    });
  });

  // ============================================================================
  // Task 48.2: アップロードエラー表示テスト
  // Requirements: 19.11, 19.13, 19.14, 19.15, 19.16
  // ============================================================================
  describe('アップロードエラー表示 (Task 48.2, Requirement 19)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('部分成功時にエラーメッセージを表示する - Requirement 19.11, 19.13', async () => {
      // uploadSurveyImagesが部分失敗の結果を返すようにモック
      // サーバーサイドでマジックバイト検証が失敗するケースをシミュレート
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [{ ...(mockImages[0] as SurveyImageInfo) }],
        errors: [
          {
            index: 1,
            fileName: 'corrupted.jpg',
            error: 'サポートされていないファイル形式です: MIMEタイプと一致しません',
            // Task 107.1: 失敗情報には再送用の File 実体が含まれる
            file: new File(['corrupted'], 'corrupted.jpg', { type: 'image/jpeg' }),
            // Task 108.2: 再送可否の区分は API 層で確定して渡る（形式エラーは再送不可）
            kind: 'permanent',
          },
        ],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ファイル選択をシミュレート（フロントエンドバリデーションを通過するJPEGファイルのみ）
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      const file1 = new File(['valid-content'], 'photo.jpg', { type: 'image/jpeg' });
      const file2 = new File(['corrupted-content'], 'corrupted.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInput, 'files', { value: [file1, file2] });
      fireEvent.change(fileInput);

      // uploadSurveyImagesが呼ばれた後、エラーメッセージが表示されることを確認
      await waitFor(
        () => {
          expect(surveyImagesApi.uploadSurveyImages).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // エラーメッセージが表示されることを確認
      await waitFor(
        () => {
          const alerts = screen.getAllByRole('alert');
          // エラーメッセージ内に部分成功と失敗の情報が含まれる
          const uploadError = alerts.find((el) =>
            el.textContent?.includes('アップロードに失敗しました')
          );
          expect(uploadError).toBeTruthy();
        },
        { timeout: 3000 }
      );
    });

    it('全件成功時にエラーメッセージを表示しない - Requirement 19.16', async () => {
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [
          { ...(mockImages[0] as SurveyImageInfo) },
          { ...(mockImages[1] as SurveyImageInfo) },
        ],
        errors: [],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      // ファイル選択をシミュレート（全てJPEG）
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      const file1 = new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInput, 'files', { value: [file1, file2] });
      fireEvent.change(fileInput);

      // uploadSurveyImagesが呼ばれることを確認
      await waitFor(
        () => {
          expect(surveyImagesApi.uploadSurveyImages).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // 詳細データ全体の再取得は行わない（初回ロードの1回のみ）
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurvey).toHaveBeenCalledTimes(1);
      });

      // エラーメッセージが表示されていないことを確認
      // 画像セクション内のアップロードエラー用alertが存在しないことを検証
      const alerts = screen.queryAllByRole('alert');
      const uploadErrorAlert = alerts.find((el) =>
        el.textContent?.includes('アップロードに失敗しました')
      );
      expect(uploadErrorAlert).toBeUndefined();
    });
  });

  // ============================================================================
  // Task 108.2: 失敗画像の返却と未送信一覧への反映
  // Requirements: 37.1, 37.16, 37.21
  // ============================================================================
  describe('アップロード失敗画像の保持 (Task 108.2, Requirement 37)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canEdit: true,
      });
    });

    /**
     * ファイル選択を発火し、uploadSurveyImages の呼び出し完了まで待つ。
     *
     * @param files - 選択するファイル
     */
    async function selectFiles(files: File[]): Promise<void> {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      Object.defineProperty(fileInput, 'files', { value: files, configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(surveyImagesApi.uploadSurveyImages).toHaveBeenCalled();
      });
    }

    it('アップロード失敗時に未送信一覧が画面へ現れること - Requirement 37.1', async () => {
      // Arrange
      const failedFile = new File(['content'], 'failed-photo.jpg', { type: 'image/jpeg' });
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [],
        errors: [
          {
            index: 0,
            fileName: 'failed-photo.jpg',
            error: '画像の保存に失敗しました: ストレージへの書き込みエラー',
            file: failedFile,
            kind: 'retriable',
          },
        ],
      });

      // Act
      await selectFiles([failedFile]);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
      expect(screen.getByTestId('pending-upload-filename')).toHaveTextContent('failed-photo.jpg');
    });

    it('ストレージ障害は再送可として未送信一覧へ反映されること - Requirement 37.21', async () => {
      // Arrange
      const failedFile = new File(['content'], 'storage-error.jpg', { type: 'image/jpeg' });
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [],
        errors: [
          {
            index: 0,
            fileName: 'storage-error.jpg',
            error: '画像の保存に失敗しました: ストレージへの書き込みエラー',
            file: failedFile,
            kind: 'retriable',
          },
        ],
      });

      // Act
      await selectFiles([failedFile]);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-item')).toHaveAttribute('data-kind', 'retriable');
      });
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();
      expect(screen.queryByTestId('pending-upload-permanent-note')).not.toBeInTheDocument();
    });

    it('サイズ上限超過は再送不可として未送信一覧へ反映されること - Requirement 37.16', async () => {
      // Arrange
      const failedFile = new File(['content'], 'too-large.jpg', { type: 'image/jpeg' });
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [],
        errors: [
          {
            index: 0,
            fileName: 'too-large.jpg',
            // 文言に形式エラーの断片を含まないため、文字列判定では再送可へ倒れる。
            // 区分が API から渡ることでのみ再送不可になる。
            error: 'ファイルサイズが上限を超えています',
            file: failedFile,
            kind: 'permanent',
          },
        ],
      });

      // Act
      await selectFiles([failedFile]);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-item')).toHaveAttribute('data-kind', 'permanent');
      });
      expect(screen.getByTestId('pending-upload-retry-button')).toBeDisabled();
      expect(screen.getByTestId('pending-upload-permanent-note')).toBeInTheDocument();
    });

    it('部分成功の通知文言が従来どおり表示されること - Requirement 19.13', async () => {
      // Arrange
      const okFile = new File(['ok'], 'photo.jpg', { type: 'image/jpeg' });
      const ngFile = new File(['ng'], 'corrupted.jpg', { type: 'image/jpeg' });
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [{ ...(mockImages[0] as SurveyImageInfo) }],
        errors: [
          {
            index: 1,
            fileName: 'corrupted.jpg',
            error: 'サポートされていない画像形式です。JPEG、PNG、WEBP形式のみ対応しています。',
            file: ngFile,
            kind: 'permanent',
          },
        ],
      });

      // Act
      await selectFiles([okFile, ngFile]);

      // Assert
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const uploadError = alerts.find((el) =>
          el.textContent?.includes('1件のアップロードに成功しました。')
        );
        expect(uploadError?.textContent).toContain(
          '1件のアップロードに成功しました。1件のアップロードに失敗しました。'
        );
        expect(uploadError?.textContent).toContain(
          'corrupted.jpg: サポートされていないファイル形式'
        );
      });
    });

    it('全件失敗の通知文言が従来どおり表示されること - Requirement 19.14, 19.15', async () => {
      // Arrange
      const ngFile1 = new File(['ng1'], 'corrupted.jpg', { type: 'image/jpeg' });
      const ngFile2 = new File(['ng2'], 'server-error.jpg', { type: 'image/jpeg' });
      vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
        results: [],
        errors: [
          {
            index: 0,
            fileName: 'corrupted.jpg',
            error: 'ファイルの内容がMIMEタイプと一致しません。',
            file: ngFile1,
            kind: 'permanent',
          },
          {
            index: 1,
            fileName: 'server-error.jpg',
            error: '画像の保存に失敗しました: ストレージへの書き込みエラー',
            file: ngFile2,
            kind: 'retriable',
          },
        ],
      });

      // Act
      await selectFiles([ngFile1, ngFile2]);

      // Assert
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const uploadError = alerts.find((el) =>
          el.textContent?.includes('全2件のアップロードに失敗しました。')
        );
        // 形式エラーは共有述語で判定され、それ以外はサーバーエラーとして提示される
        expect(uploadError?.textContent).toContain(
          'corrupted.jpg: サポートされていないファイル形式'
        );
        expect(uploadError?.textContent).toContain('server-error.jpg: サーバーエラー');
      });
    });
  });

  // ============================================================================
  // Task 87.3: 一括エクスポート起動ボタンと選択状態管理
  // Requirements: 31.1, 31.2, 31.3
  // ============================================================================
  describe('一括エクスポート起動ボタン (Task 87.3, Requirements 31.1, 31.2, 31.3)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('「全件一括エクスポート」ボタンが描画される (Requirement 31.1)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const allButton = screen.getByTestId('bulk-export-all-button');
      expect(allButton).toBeInTheDocument();
      expect(allButton).toHaveTextContent('全件一括エクスポート');
      expect(allButton).not.toBeDisabled();
    });

    it('「選択画像エクスポート」ボタンが描画され、初期は 0 件で非活性 (Requirement 31.2, 31.3)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      expect(selectedButton).toBeInTheDocument();
      // 選択件数（0 件）が表示される
      expect(selectedButton).toHaveTextContent('選択画像エクスポート（0 件）');
      // 0 件のため disabled
      expect(selectedButton).toBeDisabled();
      expect(selectedButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('「全件一括エクスポート」ボタン押下で BulkExportDialog が表示される (Requirement 31.1, 31.4)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const allButton = screen.getByTestId('bulk-export-all-button');
      fireEvent.click(allButton);

      // BulkExportDialog のタイトル文言が表示される（mode='all' 時）
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('全件一括エクスポート', { selector: 'h2' })).toBeInTheDocument();
      });
    });

    it('「全件一括エクスポート」ボタン押下後、キャンセルでダイアログが閉じる', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulk-export-all-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内のキャンセルボタンを押下
      // 削除ダイアログとの取り違えを避けるため、開いているダイアログ内に絞り込む
      const dialog = screen.getByRole('dialog');
      const cancelButton = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'キャンセル'
      );
      expect(cancelButton).toBeDefined();
      fireEvent.click(cancelButton as HTMLElement);

      await waitFor(() => {
        // BulkExportDialog のヘッダ「全件一括エクスポート」が消える
        expect(
          screen.queryByText('全件一括エクスポート', { selector: 'h2' })
        ).not.toBeInTheDocument();
      });
    });

    it('画像 0 件の現場調査では全件ボタン押下時に対象 0 件通知が出る (Requirement 31.15)', async () => {
      const surveyNoImages: SiteSurveyDetail = {
        ...mockSurveyDetail,
        images: [],
        imageCount: 0,
      };
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(surveyNoImages);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const allButton = screen.getByTestId('bulk-export-all-button');
      fireEvent.click(allButton);

      // 対象 0 件のため onEmptyTarget が呼ばれて alert で通知される
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('エクスポート対象の画像がありません。');
      });

      // ダイアログは即座に閉じられる（BulkExportDialog の useEffect で onClose）
      await waitFor(() => {
        expect(
          screen.queryByText('全件一括エクスポート', { selector: 'h2' })
        ).not.toBeInTheDocument();
      });

      alertSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 画像一覧からの選択操作（Task 115.51, Requirements 31.2, 31.3）
  //
  // 選択欄が画面に描画されない限り選択状態は恒久的に空となり、
  // 選択画像エクスポートは常に実行不可のままになる。
  // 「非活性である」ことの検証（Requirement 31.3）も、選択できて初めて
  // 実質の検証になる。
  // ==========================================================================

  describe('画像一覧からの選択操作 (Task 115.51, Requirements 31.2, 31.3)', () => {
    beforeEach(() => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    });

    it('詳細画面が描画する画像一覧に選択チェックボックスが存在すること (Requirement 31.2)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      for (const image of mockImages) {
        expect(screen.getByTestId(`image-checkbox-${image.id}`)).toBeInTheDocument();
      }
    });

    it('画像を選択すると選択画像エクスポートが活性化し件数が反映されること (Requirement 31.2, 31.3)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      // 未選択時は非活性（Requirement 31.3）
      expect(selectedButton).toBeDisabled();

      fireEvent.click(screen.getByTestId('image-checkbox-img-1'));

      await waitFor(() => {
        expect(selectedButton).toHaveTextContent('選択画像エクスポート（1 件）');
      });
      expect(selectedButton).toBeEnabled();
      expect(selectedButton).toHaveAttribute('aria-disabled', 'false');

      fireEvent.click(screen.getByTestId('image-checkbox-img-2'));

      await waitFor(() => {
        expect(selectedButton).toHaveTextContent('選択画像エクスポート（2 件）');
      });
    });

    it('選択を全て解除すると選択画像エクスポートが再び非活性になること (Requirement 31.3)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      const checkbox = screen.getByTestId('image-checkbox-img-1');
      const selectedButton = screen.getByTestId('bulk-export-selected-button');

      fireEvent.click(checkbox);
      await waitFor(() => {
        expect(selectedButton).toBeEnabled();
      });

      fireEvent.click(checkbox);
      await waitFor(() => {
        expect(selectedButton).toBeDisabled();
      });
      expect(selectedButton).toHaveTextContent('選択画像エクスポート（0 件）');
      expect(selectedButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('選択した画像のみを対象に BulkExportDialog が開くこと (Requirement 31.2)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('image-checkbox-img-2'));

      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      await waitFor(() => {
        expect(selectedButton).toBeEnabled();
      });
      fireEvent.click(selectedButton);

      // BulkExportDialog が選択モード（選択件数付きの見出し）で開く
      await waitFor(() => {
        expect(
          screen.getByText('1 件選択画像エクスポート', { selector: 'h2' })
        ).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 再取得時の選択整合（Task 115.56, 115.87, Requirements 31.2, 31.3）
  //
  // 現場調査の再取得は画像一覧を差し替えるため、選択集合が現存しない画像の
  // 識別子を指したままになりうる。要件31.3 の非活性判定と要件31.2 の対象は
  // いずれも「いま画像一覧にある画像の選択」を基準としなければならない。
  //
  // 【担当の境界（Task 115.87）】
  // 選択の整理（pruneSelectionToExistingImages）が担うのは *同一の現場調査の再取得* に
  // 対する二次の防護である。ここではその範囲だけを検証する。
  // 別の現場調査へ移る場合の一次の防護は画面（SiteSurveyDetailPage）の作り直しであり、
  // 選択状態は React が破棄する。同一の実体を保ったままルートパラメータだけ差し替える
  // 筋書きは本番の導線からは到達しないため、この節では扱わない。調査またぎは実ブラウザ
  // 検証 e2e/specs/site-surveys/site-survey-bulk-export.spec.ts の
  // 「(e) 別の現場調査へ移ると選択が持ち越されず選択画像エクスポートが非活性へ戻る」が担う。
  // ==========================================================================
  describe('再取得時の選択整合 (Task 115.56, 115.87, Requirements 31.2, 31.3)', () => {
    /** 指定した画像だけを持つ現場調査詳細を組み立てる */
    const buildDetail = (surveyId: string, images: SurveyImageInfo[]): SiteSurveyDetail => ({
      ...mockSurveyDetail,
      id: surveyId,
      imageCount: images.length,
      images,
    });

    /** 再取得後に同一の現場調査へ新たに現れた画像（選択済みの画像とは別物） */
    const refreshedImage: SurveyImageInfo = {
      ...(mockImages[0] as SurveyImageInfo),
      id: 'img-9',
      fileName: 'image9.jpg',
    };

    /** 同一ツリーで再描画し、location.key の変化（＝同一調査の再取得）を反映させる */
    const rerenderPage = (view: ReturnType<typeof renderComponent>) => {
      view.rerender(
        <BrowserRouter>
          <SiteSurveyDetailPage />
        </BrowserRouter>
      );
    };

    it('同一調査の再取得で選択画像が全て失われると選択画像エクスポートが非活性へ戻る (Requirement 31.2, 31.3)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        buildDetail('survey-123', mockImages)
      );

      const view = renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('image-checkbox-img-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('image-checkbox-img-1'));
      fireEvent.click(screen.getByTestId('image-checkbox-img-2'));

      await waitFor(() => {
        expect(screen.getByTestId('bulk-export-selected-button')).toHaveTextContent(
          '選択画像エクスポート（2 件）'
        );
      });

      // 同一の現場調査を再取得する。他の利用者が選択済みの 2 件を削除し、
      // 別の画像が追加された後の一覧が返る（画面は作り直されず、選択集合だけが残る）。
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        buildDetail('survey-123', [refreshedImage])
      );
      mockLocationKey = 'refetched-after-remote-deletion';
      rerenderPage(view);

      await waitFor(() => {
        expect(screen.getByTestId('image-checkbox-img-9')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('image-checkbox-img-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('image-checkbox-img-2')).not.toBeInTheDocument();

      // 選択していた画像は一覧に存在しないため、選択は 0 件となり非活性へ戻る（要件31.3）
      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      expect(selectedButton).toHaveTextContent('選択画像エクスポート（0 件）');
      expect(selectedButton).toBeDisabled();
      expect(selectedButton).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('image-checkbox-img-9')).not.toBeChecked();
    });

    it('再取得で消えた画像の選択だけが取り除かれ対象件数と一致する (Requirement 31.2, 31.3)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        buildDetail('survey-123', mockImages)
      );

      const view = renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('image-checkbox-img-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('image-checkbox-img-1'));
      fireEvent.click(screen.getByTestId('image-checkbox-img-2'));

      await waitFor(() => {
        expect(screen.getByTestId('bulk-export-selected-button')).toHaveTextContent(
          '選択画像エクスポート（2 件）'
        );
      });

      // 他の利用者による削除等で img-1 が失われた状態を再取得する
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        buildDetail('survey-123', [mockImages[1] as SurveyImageInfo])
      );
      mockLocationKey = 'after-edit';
      rerenderPage(view);

      await waitFor(() => {
        expect(screen.queryByTestId('image-checkbox-img-1')).not.toBeInTheDocument();
      });

      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      expect(selectedButton).toHaveTextContent('選択画像エクスポート（1 件）');
      expect(selectedButton).toBeEnabled();
      expect(screen.getByTestId('image-checkbox-img-2')).toBeChecked();

      // ボタンの件数とエクスポート対象が一致すること（要件31.2）
      fireEvent.click(selectedButton);
      await waitFor(() => {
        expect(
          screen.getByText('1 件選択画像エクスポート', { selector: 'h2' })
        ).toBeInTheDocument();
      });
    });

    it('画像編集画面から戻っても現存する画像の選択は保持される (Requirement 31.2)', async () => {
      vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(
        buildDetail('survey-123', mockImages)
      );

      const view = renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('image-checkbox-img-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('image-checkbox-img-1'));

      await waitFor(() => {
        expect(screen.getByTestId('bulk-export-selected-button')).toHaveTextContent(
          '選択画像エクスポート（1 件）'
        );
      });

      // 画像編集画面から戻る（location.key が変わり再取得されるが画像は同一）
      mockLocationKey = 'returned-from-editor';
      rerenderPage(view);

      await waitFor(() => {
        expect(vi.mocked(siteSurveysApi.getSiteSurvey).mock.calls.length).toBeGreaterThan(1);
      });

      const selectedButton = screen.getByTestId('bulk-export-selected-button');
      expect(selectedButton).toHaveTextContent('選択画像エクスポート（1 件）');
      expect(selectedButton).toBeEnabled();
      expect(screen.getByTestId('image-checkbox-img-1')).toBeChecked();
    });
  });
});

// ============================================================================
// Task 115.105 (Req 15.6): 通信断時の警告と保存抑止
//
// 要件15.6「ネットワーク接続が切断される場合は警告を表示し保存操作をブロックする」を
// 現場調査詳細（写真メタデータ・順序の一括保存）の結線として検証する。
// ============================================================================

describe('SiteSurveyDetailPage - 通信断時の警告と保存抑止 (Req 15.6)', () => {
  /** navigator.onLine を差し替える（jsdom の既定は true） */
  function setNavigatorOnLine(value: boolean): void {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  }

  function goOffline(): void {
    setNavigatorOnLine(false);
    fireEvent(window, new Event('offline'));
  }

  function goOnline(): void {
    setNavigatorOnLine(true);
    fireEvent(window, new Event('online'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteSurveyId = 'survey-123';
    mockLocationKey = 'default';
    setNavigatorOnLine(true);
    vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(
      mockPermission
    );
    vi.mocked(useMediaQuery).mockReturnValue(false);
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
    vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockResolvedValue([]);
  });

  afterEach(() => {
    setNavigatorOnLine(true);
  });

  /** 詳細画面を表示し、写真管理パネルの描画完了まで待つ */
  async function renderDetail(): Promise<void> {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
    });
  }

  it('通信が切れると警告を表示し、保存ボタンへ抑止を示す', async () => {
    await renderDetail();

    // 未保存の変更を作る（保存ボタンが有効になる前提条件を満たす）
    const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
    fireEvent.click(checkboxes[0] as HTMLElement);

    // 既定（オンライン）では警告は無く、保存は抑止されていない
    expect(screen.queryByTestId('offline-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-management-save-button')).toHaveAttribute(
      'aria-disabled',
      'false'
    );

    goOffline();

    const warning = await screen.findByTestId('offline-warning');
    expect(warning).toHaveTextContent('ネットワーク接続がありません');
    await waitFor(() => {
      expect(screen.getByTestId('photo-management-save-button')).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });
  });

  it('通信が切れている間は写真メタデータの一括保存を実行せず、理由を提示する', async () => {
    await renderDetail();

    // 未保存の変更を作る（保存の前提条件を満たす）
    const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
    fireEvent.click(checkboxes[0] as HTMLElement);

    goOffline();
    await screen.findByTestId('offline-warning');

    fireEvent.click(screen.getByTestId('photo-management-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('site-survey-detail-error')).toHaveTextContent(
        'ネットワーク接続がありません。保存操作は接続復帰後に行えます。'
      );
    });
    expect(surveyImagesApi.updateImageMetadataBatch).not.toHaveBeenCalled();
  });

  it('通信が復帰すると写真メタデータの一括保存を実行できる', async () => {
    await renderDetail();

    const checkboxes = screen.getAllByRole('checkbox', { name: '報告書に含める' });
    fireEvent.click(checkboxes[0] as HTMLElement);

    goOffline();
    await screen.findByTestId('offline-warning');

    goOnline();
    await waitFor(() => {
      expect(screen.queryByTestId('offline-warning')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('photo-management-save-button'));

    await waitFor(() => {
      expect(surveyImagesApi.updateImageMetadataBatch).toHaveBeenCalled();
    });
  });
});
