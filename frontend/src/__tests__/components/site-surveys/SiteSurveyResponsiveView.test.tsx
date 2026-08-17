/**
 * @fileoverview 現場調査一覧レスポンシブビューコンポーネントのテスト
 *
 * Task 8.3: レスポンシブ対応を実装する
 *
 * Requirements:
 * - 13.1: デスクトップ・タブレット・スマートフォン対応
 * - グリッド/リスト表示切り替え
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteSurveyResponsiveView from '../../../components/site-surveys/SiteSurveyResponsiveView';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../../types/site-survey.types';

// useMediaQueryをモック
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false), // デフォルトはデスクトップ
}));

// 注釈取得APIをモック（Task 115.67: クライアント側合成の発生有無を観測する）
vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
}));

import useMediaQuery from '../../../hooks/useMediaQuery';
import { getAnnotation } from '../../../api/survey-annotations';

// ============================================================================
// テストデータ
// ============================================================================

const mockSiteSurveys: SiteSurveyInfo[] = [
  {
    id: 'survey-1',
    projectId: 'project-1',
    name: '現場調査1',
    surveyDate: '2025-01-15',
    memo: '初回現場確認',
    thumbnailUrl: 'https://example.com/thumbnail1.jpg',
    imageCount: 5,
    createdAt: '2025-01-10T10:00:00Z',
    // タイムゾーン非依存: UTC 0:00 はどのタイムゾーンでも同日
    updatedAt: '2025-01-16T00:00:00Z',
  },
  {
    id: 'survey-2',
    projectId: 'project-1',
    name: '現場調査2',
    surveyDate: '2025-01-20',
    memo: null,
    thumbnailUrl: null,
    imageCount: 0,
    createdAt: '2025-01-18T09:00:00Z',
    // タイムゾーン非依存: UTC 0:00 はどのタイムゾーンでも同日
    updatedAt: '2025-01-22T00:00:00Z',
  },
  {
    id: 'survey-3',
    projectId: 'project-1',
    name: '現場調査3',
    surveyDate: '2025-01-25',
    memo: '最終確認',
    thumbnailUrl: 'https://example.com/thumbnail3.jpg',
    imageCount: 10,
    createdAt: '2025-01-22T09:00:00Z',
    // タイムゾーン非依存: UTC 0:00 はどのタイムゾーンでも同日
    updatedAt: '2025-01-27T00:00:00Z',
  },
];

// ============================================================================
// テスト本体
// ============================================================================

describe('SiteSurveyResponsiveView', () => {
  const defaultProps = {
    surveys: mockSiteSurveys,
    sortField: 'surveyDate' as SiteSurveySortableField,
    sortOrder: 'desc' as SiteSurveySortOrder,
    onSort: vi.fn(),
    onRowClick: vi.fn(),
  };

  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトはデスクトップ
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  // ==========================================================================
  // 表示モード切り替え
  // ==========================================================================

  describe('表示モード切り替え', () => {
    it('デスクトップで表示モード切り替えボタンが表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // 表示モード切り替えUIが表示される
      expect(screen.getByTestId('view-mode-toggle')).toBeInTheDocument();
    });

    it('初期状態ではテーブル表示であること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // テーブルが表示される
      expect(screen.getByRole('table')).toBeInTheDocument();
      // テーブルボタンがアクティブ
      const tableButton = screen.getByRole('button', { name: /テーブル表示/i });
      expect(tableButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('グリッドボタンをクリックするとグリッド表示に切り替わること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      const gridButton = screen.getByRole('button', { name: /グリッド表示/i });
      await user.click(gridButton);

      // グリッドコンテナが表示される
      expect(screen.getByTestId('survey-grid')).toBeInTheDocument();
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      // グリッドボタンがアクティブ
      expect(gridButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('リストボタンをクリックするとリスト（カード）表示に切り替わること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      const listButton = screen.getByRole('button', { name: /リスト表示/i });
      await user.click(listButton);

      // カードリストが表示される
      expect(screen.getByTestId('survey-card-list')).toBeInTheDocument();
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      // リストボタンがアクティブ
      expect(listButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('viewModeプロパティで初期表示モードを指定できること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      // グリッドが表示される
      expect(screen.getByTestId('survey-grid')).toBeInTheDocument();
    });

    it('onViewModeChangeが呼ばれること', async () => {
      const onViewModeChange = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} onViewModeChange={onViewModeChange} />);

      const gridButton = screen.getByRole('button', { name: /グリッド表示/i });
      await user.click(gridButton);

      expect(onViewModeChange).toHaveBeenCalledWith('grid');
    });
  });

  // ==========================================================================
  // グリッド表示
  // ==========================================================================

  describe('グリッド表示', () => {
    it('グリッド表示で現場調査がサムネイルカード形式で表示されること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      const grid = screen.getByTestId('survey-grid');
      expect(grid).toBeInTheDocument();

      // グリッドアイテムが表示される
      mockSiteSurveys.forEach((survey) => {
        expect(screen.getByTestId(`survey-grid-item-${survey.id}`)).toBeInTheDocument();
      });
    });

    it('グリッドでサムネイル画像が表示されること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      // サムネイルがある場合は画像が表示される
      const gridItem1 = screen.getByTestId('survey-grid-item-survey-1');
      const img = within(gridItem1).getByRole('img', { name: /現場調査1のサムネイル/i });
      expect(img).toHaveAttribute('src', 'https://example.com/thumbnail1.jpg');
    });

    // ------------------------------------------------------------------
    // 代表画像の合成済みサムネイル（Task 115.67）
    // Requirements: 20.3, 38.2, 38.7
    // ------------------------------------------------------------------

    describe('代表画像の合成済みサムネイル', () => {
      const ANNOTATED_URL = 'https://example.com/annotated-thumbnail1.jpg';
      const ORIGINAL_URL = 'https://example.com/original1.jpg';

      /** 合成済みサムネイルの表示元URLが供給された現場調査 */
      const surveyWithAnnotated: SiteSurveyInfo = {
        ...mockSiteSurveys[0]!,
        thumbnailImageId: 'image-1',
        thumbnailOriginalUrl: ORIGINAL_URL,
        annotatedThumbnailUrl: ANNOTATED_URL,
      };

      /** 合成済みサムネイルが無く、クライアント側の合成へ落ちる現場調査 */
      const surveyWithoutAnnotated: SiteSurveyInfo = {
        ...mockSiteSurveys[0]!,
        thumbnailImageId: 'image-1',
        thumbnailOriginalUrl: ORIGINAL_URL,
        annotatedThumbnailUrl: null,
      };

      it('合成済みサムネイルの表示元URLがあるときはそれを表示元に用いること', async () => {
        vi.mocked(useMediaQuery).mockReturnValue(false);
        render(
          <SiteSurveyResponsiveView
            {...defaultProps}
            surveys={[surveyWithAnnotated]}
            initialViewMode="grid"
          />
        );

        const gridItem = screen.getByTestId('survey-grid-item-survey-1');
        const img = within(gridItem).getByRole('img', { name: /現場調査1のサムネイル/i });

        // 通常サムネイルでも元画像でもなく、合成済みサムネイルであること
        await waitFor(() => {
          expect(img).toHaveAttribute('src', ANNOTATED_URL);
        });
      });

      it('合成済みサムネイルを用いるとき注釈データを取得しないこと', async () => {
        vi.mocked(useMediaQuery).mockReturnValue(false);
        render(
          <SiteSurveyResponsiveView
            {...defaultProps}
            surveys={[surveyWithAnnotated]}
            initialViewMode="grid"
          />
        );

        // クライアント側合成の経路は効果内で非同期に注釈取得を開始するため、
        // マイクロタスクとタイマーを一巡させてから呼び出しの有無を確かめる
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(getAnnotation).not.toHaveBeenCalled();
      });

      it('合成済みサムネイルが無いときはクライアント側の合成へ落ちること', async () => {
        vi.mocked(useMediaQuery).mockReturnValue(false);
        render(
          <SiteSurveyResponsiveView
            {...defaultProps}
            surveys={[surveyWithoutAnnotated]}
            initialViewMode="grid"
          />
        );

        await waitFor(() => {
          expect(getAnnotation).toHaveBeenCalledWith('image-1');
        });
      });
    });

    it('グリッドでサムネイルがない場合はプレースホルダーが表示されること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      const gridItem2 = screen.getByTestId('survey-grid-item-survey-2');
      expect(within(gridItem2).getByTestId('thumbnail-placeholder')).toBeInTheDocument();
    });

    it('グリッドで現場調査名と画像数が表示されること', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      const gridItem1 = screen.getByTestId('survey-grid-item-survey-1');
      expect(within(gridItem1).getByText('現場調査1')).toBeInTheDocument();
      expect(within(gridItem1).getByText(/5枚/)).toBeInTheDocument();
    });

    it('グリッドアイテムをクリックするとonRowClickが呼ばれること', async () => {
      const onRowClick = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(
        <SiteSurveyResponsiveView
          {...defaultProps}
          initialViewMode="grid"
          onRowClick={onRowClick}
        />
      );

      const gridItem = screen.getByTestId('survey-grid-item-survey-1');
      await user.click(gridItem);

      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });

    it('グリッドアイテムでEnterキーを押すとonRowClickが呼ばれること', async () => {
      const onRowClick = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(
        <SiteSurveyResponsiveView
          {...defaultProps}
          initialViewMode="grid"
          onRowClick={onRowClick}
        />
      );

      const gridItem = screen.getByTestId('survey-grid-item-survey-1');
      gridItem.focus();
      await user.keyboard('{Enter}');

      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });
  });

  // ==========================================================================
  // モバイル対応
  // ==========================================================================

  describe('モバイル対応（768px未満）', () => {
    it('モバイルでは表示モード切り替えが非表示でカード表示のみになること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // 表示モード切り替えは非表示（モバイルではカード一択）
      expect(screen.queryByTestId('view-mode-toggle')).not.toBeInTheDocument();
      // カードリストが表示される
      expect(screen.getByTestId('survey-card-list')).toBeInTheDocument();
    });

    it('モバイルでカード形式で現場調査が表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // 現場調査名が表示される
      expect(screen.getByText('現場調査1')).toBeInTheDocument();
      expect(screen.getByText('現場調査2')).toBeInTheDocument();
      expect(screen.getByText('現場調査3')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // タブレット対応
  // ==========================================================================

  describe('タブレット対応（768px〜1023px）', () => {
    it('タブレットでは表示モード切り替えが表示されること', () => {
      // タブレット: isMobile=false, isTablet=true
      vi.mocked(useMediaQuery).mockImplementation((query: string) => {
        if (query === '(max-width: 767px)') return false;
        if (query === '(min-width: 768px) and (max-width: 1023px)') return true;
        return false;
      });
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // 表示モード切り替えが表示される
      expect(screen.getByTestId('view-mode-toggle')).toBeInTheDocument();
    });

    it('タブレットではデフォルトでグリッド表示になること', () => {
      vi.mocked(useMediaQuery).mockImplementation((query: string) => {
        if (query === '(max-width: 767px)') return false;
        if (query === '(min-width: 768px) and (max-width: 1023px)') return true;
        return false;
      });
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      // グリッドが表示される
      expect(screen.getByTestId('survey-grid')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // レスポンシブグリッドレイアウト
  // ==========================================================================

  describe('レスポンシブグリッドレイアウト', () => {
    it('グリッドコンテナにレスポンシブなグリッドクラスが適用されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      const grid = screen.getByTestId('survey-grid');
      // sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 のようなクラスを持つ
      expect(grid.className).toMatch(/grid-cols-/);
    });
  });

  // ==========================================================================
  // 空の配列
  // ==========================================================================

  describe('空の配列', () => {
    it('空のメッセージが表示されること', () => {
      render(<SiteSurveyResponsiveView {...defaultProps} surveys={[]} />);

      expect(screen.getByText('現場調査がありません')).toBeInTheDocument();
    });

    it('空の場合は表示モード切り替えが非表示になること', () => {
      render(<SiteSurveyResponsiveView {...defaultProps} surveys={[]} />);

      expect(screen.queryByTestId('view-mode-toggle')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // propsの受け渡し
  // ==========================================================================

  describe('propsの受け渡し', () => {
    it('テーブル表示でonSortが呼ばれること', async () => {
      const onSort = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} onSort={onSort} />);

      // ソートボタンをクリック
      const sortButton = screen.getByRole('button', { name: '調査日でソート' });
      await user.click(sortButton);

      expect(onSort).toHaveBeenCalledWith('surveyDate');
    });

    it('カード表示でonRowClickが呼ばれること', async () => {
      const onRowClick = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(true);
      render(<SiteSurveyResponsiveView {...defaultProps} onRowClick={onRowClick} />);

      const card = screen.getByTestId('survey-card-survey-1');
      await user.click(card);

      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('表示モード切り替えボタンにaria-pressedが設定されていること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      const tableButton = screen.getByRole('button', { name: /テーブル表示/i });
      const gridButton = screen.getByRole('button', { name: /グリッド表示/i });
      const listButton = screen.getByRole('button', { name: /リスト表示/i });

      expect(tableButton).toHaveAttribute('aria-pressed', 'true');
      expect(gridButton).toHaveAttribute('aria-pressed', 'false');
      expect(listButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('グリッドアイテムがキーボードでフォーカス可能であること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} initialViewMode="grid" />);

      const gridItem = screen.getByTestId('survey-grid-item-survey-1');
      expect(gridItem).toHaveAttribute('tabIndex', '0');
    });

    it('表示モード切り替えボタングループにrolegroupが設定されていること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyResponsiveView {...defaultProps} />);

      const buttonGroup = screen.getByRole('group', { name: /表示モード/i });
      expect(buttonGroup).toBeInTheDocument();
    });
  });
});
