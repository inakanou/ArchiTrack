/**
 * @fileoverview SiteSurveyImageViewerPage - 表示状態の共有（閲覧モード ⇄ 注釈編集モード）
 *
 * Task 115.83: 要件5.6「画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する」を
 * 実際の出荷経路（`SiteSurveyImageViewerPage` が `AnnotationEditor` を閲覧/編集で
 * 使い分ける経路）で成立させる。
 *
 * 従来、本ページはズーム・回転・パンを setter を持たない定数として宣言しており、
 * 表示操作の結果が保持されないため共有が成立していなかった。
 *
 * Requirements:
 * - 5.6: 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
 *
 * @requirement site-survey/REQ-5.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyImageViewerPage from '../../pages/SiteSurveyImageViewerPage';
import * as siteSurveysApi from '../../api/site-surveys';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

// 画像切り替え（imageId 変化）を再現するため、可変のパラメータを参照する
const routeParams = { id: 'survey-123', imageId: 'img-1' };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => routeParams,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../api/site-surveys');

/**
 * AnnotationEditor のモック。
 * - 受け取った初期表示状態（initialZoom / initialRotation / initialPan）を data 属性で観測可能にする
 * - 「表示操作をした」ことを模すボタンから onViewStateChange を発火する
 */
vi.mock('../../components/site-surveys/AnnotationEditor', () => ({
  default: ({
    readOnly,
    initialZoom,
    initialRotation,
    initialPan,
    onViewStateChange,
  }: {
    readOnly?: boolean;
    initialZoom?: number;
    initialRotation?: number;
    initialPan?: { x: number; y: number };
    onViewStateChange?: (state: {
      zoom: number;
      rotation: number;
      pan: { x: number; y: number };
    }) => void;
  }) => (
    <div
      data-testid="annotation-editor"
      data-read-only={readOnly ? 'true' : 'false'}
      data-initial-zoom={initialZoom === undefined ? '' : String(initialZoom)}
      data-initial-rotation={initialRotation === undefined ? '' : String(initialRotation)}
      data-initial-pan-x={initialPan === undefined ? '' : String(initialPan.x)}
      data-initial-pan-y={initialPan === undefined ? '' : String(initialPan.y)}
    >
      <button
        type="button"
        data-testid="emit-view-state"
        onClick={() => onViewStateChange?.({ zoom: 2.5, rotation: 90, pan: { x: -40, y: -30 } })}
      >
        表示状態を通知
      </button>
    </div>
  ),
}));

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

const renderPage = () =>
  render(
    <BrowserRouter>
      <SiteSurveyImageViewerPage />
    </BrowserRouter>
  );

describe('SiteSurveyImageViewerPage - 表示状態の共有 (Req 5.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeParams.imageId = 'img-1';
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  });

  it('初回表示では初期表示状態を渡さない（保存済み回転の復元を上書きしない）', async () => {
    renderPage();

    const editor = await screen.findByTestId('annotation-editor');
    expect(editor).toHaveAttribute('data-read-only', 'true');
    expect(editor).toHaveAttribute('data-initial-zoom', '');
    expect(editor).toHaveAttribute('data-initial-rotation', '');
    expect(editor).toHaveAttribute('data-initial-pan-x', '');
  });

  it('閲覧モードで変化した表示状態を編集モードへ引き継ぐ', async () => {
    renderPage();

    const editor = await screen.findByTestId('annotation-editor');
    expect(editor).toHaveAttribute('data-read-only', 'true');

    // 閲覧モードでズーム・回転・パンが変化したことを通知する
    fireEvent.click(screen.getByTestId('emit-view-state'));

    // 編集モードへ切り替える
    fireEvent.click(screen.getByRole('button', { name: '編集モード' }));

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-read-only', 'false');
    });

    const editModeEditor = screen.getByTestId('annotation-editor');
    expect(editModeEditor).toHaveAttribute('data-initial-zoom', '2.5');
    expect(editModeEditor).toHaveAttribute('data-initial-rotation', '90');
    expect(editModeEditor).toHaveAttribute('data-initial-pan-x', '-40');
    expect(editModeEditor).toHaveAttribute('data-initial-pan-y', '-30');
  });

  it('表示する画像が変わったら共有中の表示状態を破棄する', async () => {
    const { rerender } = renderPage();

    await screen.findByTestId('annotation-editor');
    fireEvent.click(screen.getByTestId('emit-view-state'));

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-initial-zoom', '2.5');
    });

    // 別画像へ切り替える（保存済み回転の復元を前画像の回転で上書きしてはならない）
    routeParams.imageId = 'img-2';
    rerender(
      <BrowserRouter>
        <SiteSurveyImageViewerPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-initial-zoom', '');
    });
    expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-initial-rotation', '');
    expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-initial-pan-x', '');
  });

  it('編集モードで変化した表示状態を閲覧モードへ引き継ぐ', async () => {
    renderPage();

    await screen.findByTestId('annotation-editor');
    fireEvent.click(screen.getByRole('button', { name: '編集モード' }));

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-read-only', 'false');
    });

    fireEvent.click(screen.getByTestId('emit-view-state'));
    fireEvent.click(screen.getByRole('button', { name: '編集終了' }));

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toHaveAttribute('data-read-only', 'true');
    });

    const viewModeEditor = screen.getByTestId('annotation-editor');
    expect(viewModeEditor).toHaveAttribute('data-initial-zoom', '2.5');
    expect(viewModeEditor).toHaveAttribute('data-initial-rotation', '90');
    expect(viewModeEditor).toHaveAttribute('data-initial-pan-x', '-40');
    expect(viewModeEditor).toHaveAttribute('data-initial-pan-y', '-30');
  });
});
