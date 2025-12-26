/**
 * @fileoverview 現場調査一覧テーブルコンポーネントのテスト
 *
 * Task 8.1: 現場調査一覧表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: プロジェクト配下の現場調査をページネーション付きで表示
 * - 3.5: 一覧画面でサムネイル画像（代表画像）を表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteSurveyListTable from '../../../components/site-surveys/SiteSurveyListTable';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../../types/site-survey.types';

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
    updatedAt: '2025-01-17T00:00:00Z',
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
    memo: '追加確認',
    thumbnailUrl: 'https://example.com/thumbnail3.jpg',
    imageCount: 3,
    createdAt: '2025-01-22T11:00:00Z',
    // タイムゾーン非依存: UTC 0:00 はどのタイムゾーンでも同日
    updatedAt: '2025-01-27T00:00:00Z',
  },
];

// ============================================================================
// テスト本体
// ============================================================================

describe('SiteSurveyListTable', () => {
  const defaultProps = {
    surveys: mockSiteSurveys,
    sortField: 'surveyDate' as SiteSurveySortableField,
    sortOrder: 'desc' as SiteSurveySortOrder,
    onSort: vi.fn(),
    onRowClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本的なレンダリングテスト
  // ==========================================================================

  describe('基本的なレンダリング', () => {
    it('テーブルが正しくレンダリングされること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // テーブルが存在すること
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      expect(table).toHaveAttribute('aria-label', '現場調査一覧');
    });

    it('テーブルヘッダーが正しく表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // 列ヘッダーが存在すること
      expect(screen.getByText('サムネイル')).toBeInTheDocument();
      expect(screen.getByText('現場調査名')).toBeInTheDocument();
      expect(screen.getByText('調査日')).toBeInTheDocument();
      expect(screen.getByText('画像数')).toBeInTheDocument();
      expect(screen.getByText('更新日')).toBeInTheDocument();
    });

    it('全ての現場調査が行として表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // 各現場調査の行が存在すること
      mockSiteSurveys.forEach((survey) => {
        expect(screen.getByTestId(`survey-row-${survey.id}`)).toBeInTheDocument();
        expect(screen.getByText(survey.name)).toBeInTheDocument();
      });
    });

    it('空の配列が渡された場合、行が表示されないこと', () => {
      render(<SiteSurveyListTable {...defaultProps} surveys={[]} />);

      // テーブルは存在するが行はない
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      const rows = screen.queryAllByRole('row');
      // ヘッダー行のみ
      expect(rows).toHaveLength(1);
    });
  });

  // ==========================================================================
  // サムネイル表示テスト
  // ==========================================================================

  describe('サムネイル表示 (Requirements: 3.5)', () => {
    it('サムネイルURLがある場合、画像が表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // サムネイルがある現場調査
      const survey1Row = screen.getByTestId('survey-row-survey-1');
      const img = within(survey1Row).getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/thumbnail1.jpg');
      expect(img).toHaveAttribute('alt', '現場調査1のサムネイル');
    });

    it('サムネイルURLがない場合、プレースホルダーが表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // サムネイルがない現場調査
      const survey2Row = screen.getByTestId('survey-row-survey-2');
      const placeholder = within(survey2Row).getByTestId('thumbnail-placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // データ表示テスト
  // ==========================================================================

  describe('データ表示', () => {
    it('現場調査名が正しく表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      mockSiteSurveys.forEach((survey) => {
        expect(screen.getByText(survey.name)).toBeInTheDocument();
      });
    });

    it('調査日が正しいフォーマットで表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // 日本語フォーマット（YYYY/MM/DD）で各行に表示されること
      const survey1Row = screen.getByTestId('survey-row-survey-1');
      expect(within(survey1Row).getByText('2025/01/15')).toBeInTheDocument();

      const survey2Row = screen.getByTestId('survey-row-survey-2');
      expect(within(survey2Row).getByText('2025/01/20')).toBeInTheDocument();

      const survey3Row = screen.getByTestId('survey-row-survey-3');
      expect(within(survey3Row).getByText('2025/01/25')).toBeInTheDocument();
    });

    it('画像数が正しく表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // 画像数が表示されること
      const survey1Row = screen.getByTestId('survey-row-survey-1');
      expect(within(survey1Row).getByTestId('image-count')).toHaveTextContent('5');

      const survey2Row = screen.getByTestId('survey-row-survey-2');
      expect(within(survey2Row).getByTestId('image-count')).toHaveTextContent('0');
    });

    it('更新日が正しいフォーマットで表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // 更新日が表示されること（タイムゾーン非依存のテストデータを使用）
      const survey1Row = screen.getByTestId('survey-row-survey-1');
      expect(within(survey1Row).getByText('2025/01/17')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // ソート機能テスト
  // ==========================================================================

  describe('ソート機能', () => {
    it('ソート可能なヘッダーをクリックするとonSortが呼ばれること', async () => {
      const user = userEvent.setup();
      const onSort = vi.fn();
      render(<SiteSurveyListTable {...defaultProps} onSort={onSort} />);

      // 調査日ヘッダーをクリック
      const surveyDateHeader = screen.getByRole('button', { name: '調査日でソート' });
      await user.click(surveyDateHeader);

      expect(onSort).toHaveBeenCalledTimes(1);
      expect(onSort).toHaveBeenCalledWith('surveyDate');
    });

    it('現在のソートフィールドにソートアイコンが表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} sortField="surveyDate" sortOrder="desc" />);

      // 降順アイコンが表示されること
      expect(screen.getByTestId('sort-icon-desc')).toBeInTheDocument();
    });

    it('昇順ソート時にascアイコンが表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} sortField="surveyDate" sortOrder="asc" />);

      // 昇順アイコンが表示されること
      expect(screen.getByTestId('sort-icon-asc')).toBeInTheDocument();
    });

    it('ソート対象外のヘッダーにはソートボタンがないこと', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      // サムネイル列はソート対象外
      expect(screen.queryByRole('button', { name: 'サムネイルでソート' })).not.toBeInTheDocument();
    });

    it('キーボード操作でソートできること', async () => {
      const user = userEvent.setup();
      const onSort = vi.fn();
      render(<SiteSurveyListTable {...defaultProps} onSort={onSort} />);

      const surveyDateHeader = screen.getByRole('button', { name: '調査日でソート' });
      surveyDateHeader.focus();
      await user.keyboard('{Enter}');

      expect(onSort).toHaveBeenCalledWith('surveyDate');
    });
  });

  // ==========================================================================
  // 行クリックテスト
  // ==========================================================================

  describe('行クリック', () => {
    it('行をクリックするとonRowClickが呼ばれること', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      render(<SiteSurveyListTable {...defaultProps} onRowClick={onRowClick} />);

      const row = screen.getByTestId('survey-row-survey-1');
      await user.click(row);

      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });

    it('Enterキーで行を選択できること', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      render(<SiteSurveyListTable {...defaultProps} onRowClick={onRowClick} />);

      const row = screen.getByTestId('survey-row-survey-1');
      row.focus();
      await user.keyboard('{Enter}');

      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });

    it('スペースキーで行を選択できること', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      render(<SiteSurveyListTable {...defaultProps} onRowClick={onRowClick} />);

      const row = screen.getByTestId('survey-row-survey-1');
      row.focus();
      await user.keyboard(' ');

      expect(onRowClick).toHaveBeenCalledWith('survey-1');
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('テーブルにaria-labelが設定されていること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', '現場調査一覧');
    });

    it('ソート状態がaria-sortで表示されること', () => {
      render(<SiteSurveyListTable {...defaultProps} sortField="surveyDate" sortOrder="desc" />);

      // aria-sortがdescending
      const headers = screen.getAllByRole('columnheader');
      const surveyDateHeader = headers.find((header) => header.textContent?.includes('調査日'));
      expect(surveyDateHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('行にtabIndexが設定されていること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      const row = screen.getByTestId('survey-row-survey-1');
      expect(row).toHaveAttribute('tabIndex', '0');
    });

    it('行にrole="row"が設定されていること', () => {
      render(<SiteSurveyListTable {...defaultProps} />);

      const row = screen.getByTestId('survey-row-survey-1');
      expect(row).toHaveAttribute('role', 'row');
    });
  });
});
