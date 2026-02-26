/**
 * @fileoverview SiteSurveySectionCard コンポーネントのテスト
 *
 * Task 55.2: フロントエンドの注釈付き表示の単体テストを実装する
 *
 * Requirements:
 * - 20.3: 一覧画面の代表画像サムネイルに注釈付きサムネイルを表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SiteSurveySectionCard } from '../../../components/projects/SiteSurveySectionCard';
import type { SiteSurveyInfo } from '../../../types/site-survey.types';

// AnnotatedImageThumbnailモック
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({ alt, image }: { alt: string; image: { id: string } }) => (
    <img data-testid="annotated-image-thumbnail" alt={alt} src={`mock-annotated://${image.id}`} />
  ),
}));

// テストデータ
const mockSurveys: SiteSurveyInfo[] = [
  {
    id: 'survey-1',
    projectId: 'project-1',
    name: '現場調査A',
    surveyDate: '2025-01-15',
    memo: null,
    thumbnailUrl: 'https://example.com/thumbnail1.jpg',
    imageCount: 5,
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'survey-2',
    projectId: 'project-1',
    name: '現場調査B',
    surveyDate: '2025-02-20',
    memo: null,
    thumbnailUrl: null,
    imageCount: 0,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-02-01T00:00:00Z',
  },
];

function renderComponent(props: Partial<React.ComponentProps<typeof SiteSurveySectionCard>> = {}) {
  const defaultProps = {
    projectId: 'project-1',
    totalCount: 2,
    latestSurveys: mockSurveys,
    isLoading: false,
    ...props,
  };

  return render(
    <BrowserRouter>
      <SiteSurveySectionCard {...defaultProps} />
    </BrowserRouter>
  );
}

describe('SiteSurveySectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('注釈付きサムネイル表示 (Task 55.2, Requirement 20.3)', () => {
    it('annotatedThumbnailUrlがある場合はサーバーサイド生成済みサムネイルが表示されること', () => {
      const surveysWithAnnotatedThumbnail: SiteSurveyInfo[] = [
        {
          ...mockSurveys[0]!,
          annotatedThumbnailUrl: 'https://r2.example.com/annotated-thumbnails/img-1.jpg',
        },
      ];

      renderComponent({
        latestSurveys: surveysWithAnnotatedThumbnail,
        totalCount: 1,
      });

      const annotatedImg = screen.getByTestId('annotated-thumbnail');
      expect(annotatedImg).toBeInTheDocument();
      expect(annotatedImg).toHaveAttribute(
        'src',
        'https://r2.example.com/annotated-thumbnails/img-1.jpg'
      );
      expect(annotatedImg).toHaveAttribute('alt', '現場調査Aのサムネイル（注釈付き）');
    });

    it('annotatedThumbnailUrlがない場合は通常のサムネイルが表示されること', () => {
      renderComponent({
        latestSurveys: [mockSurveys[0]!],
        totalCount: 1,
      });

      const imgs = screen.getAllByRole('img');
      const thumbnailImg = imgs.find(
        (img) => img.getAttribute('src') === 'https://example.com/thumbnail1.jpg'
      );
      expect(thumbnailImg).toBeDefined();
      expect(screen.queryByTestId('annotated-thumbnail')).not.toBeInTheDocument();
    });

    it('サムネイルURLもannotatedThumbnailUrlもない場合はプレースホルダーが表示されること', () => {
      renderComponent({
        latestSurveys: [mockSurveys[1]!],
        totalCount: 1,
      });

      const placeholder = screen.getByTestId('thumbnail-placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('基本表示', () => {
    it('セクションタイトルが表示されること', () => {
      renderComponent();

      expect(screen.getByText('現場調査')).toBeInTheDocument();
    });

    it('総数が表示されること', () => {
      renderComponent();

      expect(screen.getByText(/全2件/)).toBeInTheDocument();
    });

    it('現場調査名が表示されること', () => {
      renderComponent();

      expect(screen.getByText('現場調査A')).toBeInTheDocument();
      expect(screen.getByText('現場調査B')).toBeInTheDocument();
    });

    it('ローディング時はスケルトンが表示されること', () => {
      renderComponent({ isLoading: true });

      expect(screen.getByTestId('site-survey-section-skeleton')).toBeInTheDocument();
    });

    it('現場調査が0件の場合は空状態が表示されること', () => {
      renderComponent({ totalCount: 0, latestSurveys: [] });

      expect(screen.getByText('現場調査はまだありません')).toBeInTheDocument();
    });
  });
});
