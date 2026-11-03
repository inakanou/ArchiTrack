/**
 * @fileoverview 現場調査の画面が 404 を受けたときの不在の表示のテスト
 *
 * Task 120.1: 現場調査の画面の読み込みと操作で、404 を見つからない旨の表示にする
 *
 * Requirements (site-survey):
 * - 40.1: 一覧・新規作成・詳細・編集・画像の閲覧と編集の画面の読み込みの 404 で、見つからない旨と
 *   戻り先のリンクを表示し、応答の英語の文言・取得の失敗の文言と再試行の釦を出さない
 * - 40.2: 作成・更新・削除、詳細の画面の画像の情報と並び順の保存・画像の削除・アップロードの 404 で、
 *   見つからない旨の日本語のメッセージを表示する。404 以外の失敗は従来の文言を保つ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import SiteSurveyCreatePage from '../../pages/SiteSurveyCreatePage';
import SiteSurveyDetailPage from '../../pages/SiteSurveyDetailPage';
import SiteSurveyEditPage from '../../pages/SiteSurveyEditPage';
import SiteSurveyImageViewerPage from '../../pages/SiteSurveyImageViewerPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';
import * as surveyImagesApi from '../../api/survey-images';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';
import useMediaQuery from '../../hooks/useMediaQuery';
import { ApiError } from '../../api/client';
import type { ProjectDetail } from '../../types/project.types';
import type {
  PaginatedSiteSurveys,
  SiteSurveyDetail,
  SurveyImageInfo,
} from '../../types/site-survey.types';

vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-images');
vi.mock('../../hooks/useSiteSurveyPermission');
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));
vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

// 画像の閲覧と編集の画面の注釈の編集の部品は本テストの対象外
vi.mock('../../components/site-surveys/AnnotationEditor', () => ({
  default: () => <div data-testid="annotation-editor">MockAnnotationEditor</div>,
}));

// 一括エクスポート経路が読み込む重量サービスを差し替える（本テストの対象外）
vi.mock('../../services/export/PdfExportService', () => ({
  exportAndDownloadPdf: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/export/AnnotationRendererService', () => ({
  renderImagesWithAnnotations: vi.fn().mockResolvedValue([]),
  renderImagesForReport: vi.fn().mockResolvedValue([]),
  AnnotationRendererService: class {
    async renderImage() {
      return { dataUrl: 'data:image/jpeg;base64,', width: 0, height: 0 };
    }
    dispose() {}
  },
}));

// ============================================================================
// テストデータ
// ============================================================================

const SURVEY_GONE = '現場調査が見つかりません。存在しないか、削除されています。';
const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';
const IMAGE_GONE = '画像が見つかりません。存在しないか、削除されています。';
const SURVEY_OR_IMAGE_GONE = '現場調査または画像が見つかりません。存在しないか、削除されています。';

/** 汎用の 404（閲覧範囲外と不在で同じ応答。本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    type: 'https://architrack.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

const mockProject: ProjectDetail = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: null,
  status: 'SURVEYING',
  statusLabel: '現地調査',
  siteAddress: null,
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: 'テスト管理者' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
} as unknown as ProjectDetail;

const mockSurveys: PaginatedSiteSurveys = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

const mockImage: SurveyImageInfo = {
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
};

const mockSurvey: SiteSurveyDetail = {
  id: 'survey-123',
  projectId: 'project-123',
  name: 'テスト現場調査',
  surveyDate: '2025-01-15',
  memo: '調査メモです',
  thumbnailUrl: null,
  imageCount: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  project: { id: 'project-123', name: 'テストプロジェクト' },
  images: [mockImage],
};

const mockPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  isLoading: false,
  getPermissionError: vi.fn().mockReturnValue(null),
};

// ============================================================================
// ヘルパー
// ============================================================================

function renderAt(path: string) {
  // 画像の閲覧と編集の画面は useBlocker を使うため、データルーターで描画する
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/site-surveys', element: <SiteSurveyListPage /> },
      { path: '/projects/:projectId/site-surveys/new', element: <SiteSurveyCreatePage /> },
      { path: '/site-surveys/:id', element: <SiteSurveyDetailPage /> },
      { path: '/site-surveys/:id/edit', element: <SiteSurveyEditPage /> },
      { path: '/site-surveys/:id/images/:imageId', element: <SiteSurveyImageViewerPage /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

/** 見つからない旨の表示（ResourceNotFound）とプロジェクトの一覧へのリンクを主張する */
async function expectNotFoundView(resourceType: string): Promise<void> {
  expect(
    await screen.findByRole('heading', { name: `${resourceType}が見つかりません` })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
  expect(screen.queryByText(/取得に失敗しました/)).not.toBeInTheDocument();
}

/** 詳細の画面の上のエラーの欄の文言を待つ */
async function expectDetailError(text: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('site-survey-detail-error')).toHaveTextContent(text);
  });
  expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
}

async function waitForDetailLoaded(): Promise<void> {
  expect(await screen.findByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(mockPermission);
  vi.mocked(useMediaQuery).mockReturnValue(false);
  vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
  vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSurveys);
  vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurvey);
  URL.createObjectURL = vi.fn(() => 'blob:mock/1');
  URL.revokeObjectURL = vi.fn();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  consoleErrorSpy.mockRestore();
});

// ============================================================================
// 読み込みの 404（Requirement 40.1）
// ============================================================================

describe('現場調査の画面の読み込みの 404 (Requirement 40.1)', () => {
  it('一覧の画面はプロジェクトの取得の 404 でプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue(genericNotFound());

    renderAt('/projects/project-123/site-surveys');

    await expectNotFoundView('プロジェクト');
  });

  it('一覧の画面は現場調査の一覧の取得の 404 でも同じプロジェクトの不在の表示にする', async () => {
    vi.mocked(siteSurveysApi.getSiteSurveys).mockRejectedValue(genericNotFound());

    renderAt('/projects/project-123/site-surveys');

    await expectNotFoundView('プロジェクト');
  });

  it('一覧の画面は二つの取得の失敗の順序によらず、どちらかの 404 でプロジェクトの不在の表示にする', async () => {
    // 先に失敗するのは 500 の一覧の取得、後で失敗するのは 404 のプロジェクトの取得
    vi.mocked(siteSurveysApi.getSiteSurveys).mockRejectedValue(
      new ApiError(500, 'Internal Server Error', {})
    );
    vi.mocked(projectsApi.getProject).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(genericNotFound()), 20))
    );

    renderAt('/projects/project-123/site-surveys');

    await expectNotFoundView('プロジェクト');
  });

  it('一覧の画面は先に 404 が返り後で 500 が返っても同じプロジェクトの不在の表示にする', async () => {
    vi.mocked(siteSurveysApi.getSiteSurveys).mockRejectedValue(genericNotFound());
    vi.mocked(projectsApi.getProject).mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new ApiError(500, 'Internal Server Error', {})), 20)
        )
    );

    renderAt('/projects/project-123/site-surveys');

    await expectNotFoundView('プロジェクト');
  });

  it('一覧の画面は 404 以外の失敗では従来どおり失敗の文言と再試行の釦を表示する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'サーバーの不調', {}));

    renderAt('/projects/project-123/site-surveys');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('サーバーの不調');
    expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /が見つかりません/ })).not.toBeInTheDocument();
  });

  it('新規作成の画面はプロジェクトの取得の 404 でプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue(genericNotFound());

    renderAt('/projects/project-123/site-surveys/new');

    await expectNotFoundView('プロジェクト');
    expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
  });

  it('新規作成の画面は 404 以外の失敗では従来どおり失敗の文言を表示する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(400, '不正な要求', {}));

    renderAt('/projects/project-123/site-surveys/new');

    expect(await screen.findByRole('alert')).toHaveTextContent('不正な要求');
    expect(screen.queryByRole('heading', { name: /が見つかりません/ })).not.toBeInTheDocument();
  });

  it('詳細の画面は現場調査の取得の 404 で現場調査が見つからない旨とプロジェクトの一覧へのリンクを表示する', async () => {
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123');

    await expectNotFoundView('現場調査');
  });

  it('詳細の画面は 404 以外の失敗では従来どおり失敗の文言と再試行の釦を表示する', async () => {
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(
      new ApiError(500, 'サーバーの不調', {})
    );

    renderAt('/site-surveys/survey-123');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('サーバーの不調');
    expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  it('編集の画面は現場調査の取得の 404 で既存の見つからない旨の表示を保つ', async () => {
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123/edit');

    await expectNotFoundView('現場調査');
  });

  it('画像の閲覧と編集の画面は現場調査の取得の 404 で既存の見つからない旨の表示を保つ', async () => {
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123/images/img-1');

    expect(
      await screen.findByRole('heading', { name: '画像が見つかりません' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前の画面に戻る' })).toHaveAttribute(
      'href',
      '/site-surveys/survey-123'
    );
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// 操作の 404（Requirement 40.2）
// ============================================================================

describe('現場調査の画面の操作の 404 (Requirement 40.2)', () => {
  it('新規作成の画面の作成の 404 でプロジェクトが見つからない旨を表示とトーストに出す', async () => {
    vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/projects/project-123/site-surveys/new');
    expect(await screen.findByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROJECT_GONE);
    expect(mockToast.error).toHaveBeenCalledWith(PROJECT_GONE);
    expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
  });

  it('新規作成の画面の作成の 404 以外の失敗は従来の文言を保つ', async () => {
    vi.mocked(siteSurveysApi.createSiteSurvey).mockRejectedValue(
      new ApiError(500, '作成に失敗しました', {})
    );

    renderAt('/projects/project-123/site-surveys/new');
    expect(await screen.findByRole('heading', { name: '新規現場調査' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('作成に失敗しました');
    expect(mockToast.error).toHaveBeenCalledWith('作成に失敗しました');
  });

  it('編集の画面の更新の 404 で現場調査が見つからない旨を送信のエラーの欄とトーストに出す', async () => {
    vi.mocked(siteSurveysApi.updateSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123/edit');
    expect(await screen.findByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SURVEY_GONE);
    expect(mockToast.error).toHaveBeenCalledWith(SURVEY_GONE);
    expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
  });

  it('編集の画面の更新の 404 以外の失敗は従来の文言を保つ', async () => {
    vi.mocked(siteSurveysApi.updateSiteSurvey).mockRejectedValue(
      new ApiError(500, '更新に失敗しました', {})
    );

    renderAt('/site-surveys/survey-123/edit');
    expect(await screen.findByRole('heading', { name: '現場調査を編集' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('更新に失敗しました');
    expect(mockToast.error).toHaveBeenCalledWith('更新に失敗しました');
  });

  it('詳細の画面の現場調査の削除の 404 で現場調査が見つからない旨を表示する', async () => {
    vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }));

    await expectDetailError(SURVEY_GONE);
  });

  it('詳細の画面の現場調査の削除の 404 以外の失敗は従来の文言を保つ', async () => {
    vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue(
      new ApiError(500, '削除できませんでした', {})
    );

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }));

    await expectDetailError('削除できませんでした');
  });

  it('詳細の画面の画像の削除の 404 で画像が見つからない旨を表示する', async () => {
    vi.mocked(surveyImagesApi.deleteSurveyImage).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    fireEvent.click(await screen.findByRole('button', { name: /画像を削除: image1\.jpg/ }));
    fireEvent.click(await screen.findByRole('button', { name: /削除する/ }));

    await expectDetailError(IMAGE_GONE);
  });

  it('詳細の画面の画像の情報の保存の 404 で現場調査または画像が見つからない旨を表示する', async () => {
    vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockRejectedValue(genericNotFound());

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    fireEvent.click(screen.getAllByRole('checkbox', { name: '報告書に含める' })[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));

    await expectDetailError(SURVEY_OR_IMAGE_GONE);
  });

  it('詳細の画面の画像の情報の保存の 404 以外の失敗は従来の文言を保つ', async () => {
    vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockRejectedValue(
      new ApiError(500, '保存できませんでした', {})
    );

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    fireEvent.click(screen.getAllByRole('checkbox', { name: '報告書に含める' })[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));

    await expectDetailError('保存できませんでした');
  });

  it('詳細の画面のアップロードの 404 で失敗したファイルの理由を現場調査が見つからない旨にし、全件・一部の失敗の構成を保つ', async () => {
    const goneFile = new File(['a'], 'gone.jpg', { type: 'image/jpeg' });
    const serverFile = new File(['b'], 'server.jpg', { type: 'image/jpeg' });
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
      results: [],
      errors: [
        {
          index: 0,
          fileName: 'gone.jpg',
          error: 'Not found',
          file: goneFile,
          kind: 'retriable',
          cause: genericNotFound(),
        },
        {
          index: 1,
          fileName: 'server.jpg',
          error: 'Internal Server Error',
          file: serverFile,
          kind: 'retriable',
          cause: new ApiError(500, 'Internal Server Error', {}),
        },
      ],
    });

    renderAt('/site-surveys/survey-123');
    await waitForDetailLoaded();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput, 'files', {
      value: [goneFile, serverFile],
      configurable: true,
    });
    fireEvent.change(fileInput);

    const detailError = await screen.findByTestId('site-survey-detail-error');
    await waitFor(() => {
      expect(detailError).toHaveTextContent('全2件のアップロードに失敗しました。');
    });
    expect(detailError).toHaveTextContent(`gone.jpg: ${SURVEY_GONE}`);
    expect(detailError).toHaveTextContent('server.jpg: サーバーエラー');
    expect(detailError).not.toHaveTextContent('gone.jpg: サーバーエラー');
    // 失敗した画像は未送信画像として保持される（Requirement 37）。404 の理由も英語の文言にしない
    await waitFor(() => {
      expect(screen.getByText(SURVEY_GONE)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Not found/)).not.toBeInTheDocument();
  });
});
