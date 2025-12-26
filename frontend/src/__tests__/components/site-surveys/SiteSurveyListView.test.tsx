/**
 * @fileoverview 現場調査一覧ビューコンポーネントのテスト
 *
 * Task 8.1: 現場調査一覧表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: プロジェクト配下の現場調査をページネーション付きで表示
 * - 3.5: 一覧画面でサムネイル画像（代表画像）を表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SiteSurveyListView from '../../../components/site-surveys/SiteSurveyListView';
import type {
  SiteSurveyInfo,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../../types/site-survey.types';

// useMediaQueryをモック
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false), // デフォルトはデスクトップ
}));

import useMediaQuery from '../../../hooks/useMediaQuery';

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
];

// ============================================================================
// テスト本体
// ============================================================================

describe('SiteSurveyListView', () => {
  const defaultProps = {
    surveys: mockSiteSurveys,
    sortField: 'surveyDate' as SiteSurveySortableField,
    sortOrder: 'desc' as SiteSurveySortOrder,
    onSort: vi.fn(),
    onRowClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトはデスクトップ
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  describe('デスクトップ表示', () => {
    it('デスクトップではテーブル形式で表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyListView {...defaultProps} />);

      // テーブルが表示される
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('テーブルに現場調査が表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyListView {...defaultProps} />);

      // 現場調査名が表示される
      expect(screen.getByText('現場調査1')).toBeInTheDocument();
      expect(screen.getByText('現場調査2')).toBeInTheDocument();
    });
  });

  describe('モバイル表示', () => {
    it('モバイルではカード形式で表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      render(<SiteSurveyListView {...defaultProps} />);

      // カードコンテナが表示される
      expect(screen.getByTestId('survey-card-list')).toBeInTheDocument();
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('カードに現場調査が表示されること', () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      render(<SiteSurveyListView {...defaultProps} />);

      // 現場調査名が表示される
      expect(screen.getByText('現場調査1')).toBeInTheDocument();
      expect(screen.getByText('現場調査2')).toBeInTheDocument();
    });
  });

  describe('空の配列', () => {
    it('空のメッセージが表示されること', () => {
      render(<SiteSurveyListView {...defaultProps} surveys={[]} />);

      expect(screen.getByText('現場調査がありません')).toBeInTheDocument();
    });
  });

  describe('propsの受け渡し', () => {
    it('onSortが呼ばれること', async () => {
      const onSort = vi.fn();
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SiteSurveyListView {...defaultProps} onSort={onSort} />);

      // ソートボタンをクリック
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      const sortButton = screen.getByRole('button', { name: '調査日でソート' });
      await user.click(sortButton);

      expect(onSort).toHaveBeenCalledWith('surveyDate');
    });
  });
});
