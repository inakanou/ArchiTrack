/**
 * @fileoverview 現場調査画像ビューアページ 表示領域高さの svh 化テスト
 *
 * Task 102.1: 表示領域高さの svh 化
 *
 * Requirements:
 * @requirement site-survey/REQ-36.4
 *
 * 検証観点（jsdom は svh/実レイアウトを評価できないため、機械的に観測可能な範囲を検証する）:
 * - 編集/閲覧領域が svh 二段宣言を提供する CSS クラスを保持し、競合するインライン
 *   height/minHeight を持たないこと（インラインstyleはクラスを上書きするため）
 * - ページコンテナが svh 二段宣言クラスを保持し、インライン minHeight を持たないこと
 * - スタイルシート原本に、同一プロパティに対する 100vh フォールバックと 100svh 宣言が
 *   両方含まれること、およびモバイル幅で minHeight が 500px 固定でないこと
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyImageViewerPage from '../../pages/SiteSurveyImageViewerPage';
import * as siteSurveysApi from '../../api/site-surveys';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'survey-123', imageId: 'img-1' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../api/site-surveys');

// AnnotationEditor はレイアウト検証に不要なためモック化
vi.mock('../../components/site-surveys/AnnotationEditor', () => ({
  default: () => <div data-testid="annotation-editor">MockAnnotationEditor</div>,
}));

const mockImage: SurveyImageInfo = {
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
};

const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-123',
  projectId: 'project-456',
  name: 'テスト現場調査',
  surveyDate: '2025-06-15',
  memo: '調査メモです',
  thumbnailUrl: '/uploads/thumbnails/img1.jpg',
  imageCount: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  project: { id: 'project-456', name: 'テストプロジェクト' },
  images: [mockImage],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyImageViewerPage />
    </BrowserRouter>
  );
}

describe('SiteSurveyImageViewerPage 表示領域高さの svh 化 (REQ-36.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  });

  it('編集/閲覧領域が svh 二段宣言クラスを保持し、競合するインライン height/minHeight を持たない', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    // AnnotationEditor を包む editorContainer が表示領域高さの所有要素
    const editorContainer = screen.getByTestId('annotation-editor').parentElement;
    expect(editorContainer).not.toBeNull();
    expect(editorContainer!.classList.contains('survey-image-viewer__editor')).toBe(true);

    // インラインstyleはCSSクラスを上書きするため、height/minHeight はインラインに残してはならない
    expect(editorContainer!.style.height).toBe('');
    expect(editorContainer!.style.minHeight).toBe('');
  });

  it('ページコンテナが svh 二段宣言クラスを保持し、インライン minHeight を持たない', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const main = screen.getByRole('main');
    expect(main.classList.contains('survey-image-viewer')).toBe(true);
    expect(main.style.minHeight).toBe('');
  });

  it('スタイルシート原本に 100vh フォールバックと 100svh 宣言の両方、モバイル調整が含まれる', () => {
    // npm はスクリプトを frontend パッケージルートで実行するため cwd 基準で解決する
    const cssPath = resolve(process.cwd(), 'src/pages/SiteSurveyImageViewerPage.css');
    const css = readFileSync(cssPath, 'utf8');

    // 二段宣言: vh フォールバックと svh 本命が同一プロパティに対して両方存在すること
    expect(css).toContain('100vh');
    expect(css).toContain('100svh');
    expect(css).toContain('calc(100vh - 200px)');
    expect(css).toContain('calc(100svh - 200px)');

    // モバイル幅は MEDIA_QUERIES.isMobile = (max-width: 767px) と一致させる
    expect(css).toContain('max-width: 767px');

    // モバイルの minHeight は 500px 固定を撤廃していること（実可視高を超えさせない）
    const mobileBlock = css.slice(css.indexOf('max-width: 767px'));
    expect(mobileBlock).not.toContain('min-height: 500px');
  });
});
