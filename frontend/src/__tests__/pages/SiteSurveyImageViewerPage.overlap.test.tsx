/**
 * @fileoverview 現場調査画像ビューアページ ヘッダー/パンくず重なり・水平はみ出し解消テスト
 *
 * Task 102.3: ヘッダー/パンくずと作業領域の重なり・水平はみ出し解消
 *
 * Requirements:
 * @requirement site-survey/REQ-36.6
 * @requirement site-survey/REQ-36.7
 *
 * 検証観点（jsdom はレイアウトを評価しないため、はみ出し/重なりを機械的に防止する
 * 構造的コントラクトを検証する。実 375px ビューポートでの scrollWidth<=innerWidth・
 * 矩形非交差の実測は E2E タスク 103.2 の担当）:
 * - ヘッダー行のタイトル要素/ラッパが min-width:0 と縮小可能な flex 指定を持ち、
 *   長い連続ファイル名でヘッダー行がビューポート幅を超えないこと（REQ-36.6）
 * - モバイル幅ではタイトルが省略記号（単一行）で頭打ちになり、折返しによる縦方向
 *   増大でヘッダーが作業領域へ重畳しないこと（REQ-36.7）
 * - 編集ボタンが flex-shrink:0 で潰れず、タイトルが優先的に縮小されること（REQ-36.6）
 * - `<main>` に overflowX:hidden 等のはみ出し隠蔽（escape hatch）を持ち込まないこと（REQ-36.6）
 * - パンくずコンテナが overflowX:auto を保持し続けること（REQ-36.6 既存 root-cause fix）
 * - モバイル編集領域の予約高さオフセットが sticky なアプリヘッダー高を織り込むこと（REQ-36.7）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// 水平はみ出しを誘発しうる長い連続（スペース無し）ファイル名
const LONG_FILE_NAME =
  'IMG_20250709_verylongunbrokenfilenamewithoutanyspaces_1234567890_abcdefghijklmnop.jpg';

const mockImage: SurveyImageInfo = {
  id: 'img-1',
  surveyId: 'survey-123',
  originalPath: '/uploads/original/img1.jpg',
  originalUrl: 'https://example.com/signed/img1.jpg',
  thumbnailPath: '/uploads/thumbnails/img1.jpg',
  fileName: LONG_FILE_NAME,
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

/**
 * window.matchMedia をモックする。
 * @param matchMobile モバイル幅クエリ `(max-width: 767px)` にマッチさせるか
 */
function mockMatchMedia(matchMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 767px') ? matchMobile : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

function renderComponent() {
  return render(
    <BrowserRouter>
      <SiteSurveyImageViewerPage />
    </BrowserRouter>
  );
}

describe('SiteSurveyImageViewerPage ヘッダー/パンくず重なり・水平はみ出し解消 (REQ-36.6/36.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  });

  afterEach(() => {
    // matchMedia モックを撤去（他テストへ波及させない）
    // @ts-expect-error テスト後始末のため削除
    delete window.matchMedia;
  });

  it('タイトルラッパが min-width:0 と縮小可能な flex を持ち、ヘッダー行の水平はみ出しを防ぐ (REQ-36.6)', async () => {
    mockMatchMedia(false);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const heading = screen.getByRole('heading', { level: 1 });
    const titleWrapper = heading.parentElement;
    expect(titleWrapper).not.toBeNull();

    // ラッパは min-width:0 で縮小可能・flex 伸縮許可（長いタイトルがボタンを押し出さない）
    expect(titleWrapper!.style.minWidth).toBe('0px');
    expect(titleWrapper!.style.flex).not.toBe('');

    // タイトル自身も min-width:0 を持ち、flex コンテキストで縮小できる
    expect(heading.style.minWidth).toBe('0px');
  });

  it('編集ボタンが flex-shrink:0 で潰れない (REQ-36.6)', async () => {
    mockMatchMedia(false);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /編集モード/ });
    expect(button.style.flexShrink).toBe('0');
  });

  it('モバイル幅ではタイトルが省略記号（単一行）で頭打ちになり縦増大しない (REQ-36.7)', async () => {
    mockMatchMedia(true);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const heading = screen.getByRole('heading', { level: 1 });
    // 単一行 + 省略記号で折返しによる縦方向増大（＝ヘッダーの重畳）を防ぐ
    expect(heading.style.overflow).toBe('hidden');
    expect(heading.style.textOverflow).toBe('ellipsis');
    expect(heading.style.whiteSpace).toBe('nowrap');
  });

  it('<main> に overflowX:hidden 等のはみ出し隠蔽 escape hatch を持ち込まない (REQ-36.6)', async () => {
    mockMatchMedia(true);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const main = screen.getByRole('main');
    expect(main.style.overflowX).not.toBe('hidden');
    expect(main.style.overflow).not.toBe('hidden');
  });

  it('パンくずコンテナが overflowX:auto を保持する (REQ-36.6 既存 root-cause fix)', async () => {
    mockMatchMedia(true);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('annotation-editor')).toBeInTheDocument();
    });

    const main = screen.getByRole('main');
    const breadcrumbContainer = main.firstElementChild as HTMLElement;
    expect(breadcrumbContainer).not.toBeNull();
    expect(breadcrumbContainer.style.overflowX).toBe('auto');
  });

  it('モバイル編集領域の予約高さオフセットが sticky ヘッダー高を織り込む (REQ-36.7)', () => {
    // npm はスクリプトを frontend パッケージルートで実行するため cwd 基準で解決する
    const cssPath = resolve(process.cwd(), 'src/pages/SiteSurveyImageViewerPage.css');
    const css = readFileSync(cssPath, 'utf8');

    const mediaIdx = css.indexOf('max-width: 767px');
    expect(mediaIdx).toBeGreaterThan(-1);
    const desktopPart = css.slice(0, mediaIdx);
    const mobilePart = css.slice(mediaIdx);

    const desktopMatch = desktopPart.match(/calc\(100svh - (\d+)px\)/);
    const mobileMatch = mobilePart.match(/calc\(100svh - (\d+)px\)/);
    expect(desktopMatch).not.toBeNull();
    expect(mobileMatch).not.toBeNull();

    const desktopOffset = Number(desktopMatch![1]);
    const mobileOffset = Number(mobileMatch![1]);

    // モバイルは sticky なアプリヘッダー(モバイル 56px)＋余白/パンくず/タイトル行を
    // 織り込むため、デスクトップより大きいオフセットを予約する（縦はみ出し→重畳を防ぐ）
    expect(mobileOffset).toBeGreaterThan(desktopOffset);
    expect(mobileOffset).toBeGreaterThanOrEqual(56);

    // はみ出しを隠蔽する overflow:hidden をコンテナ CSS に持ち込まない
    expect(css).not.toContain('overflow-x: hidden');
    expect(css).not.toContain('overflow: hidden');
  });
});
