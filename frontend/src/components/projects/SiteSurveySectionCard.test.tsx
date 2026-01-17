/**
 * @fileoverview SiteSurveySectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 31.2: SiteSurveySectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
 * - 2.2: 現場調査一覧画面への遷移リンク
 * - 2.3: 現場調査詳細画面への遷移リンク
 *
 * 表示要素:
 * - セクションタイトル「現場調査」
 * - 総数表示（例: 全5件）
 * - 直近N件のカード形式表示
 *   - 調査名
 *   - 調査日
 *   - サムネイル画像（あれば）
 * - 「すべて見る」リンク（一覧画面へ遷移）
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteSurveySectionCard } from './SiteSurveySectionCard';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockSurveys = [
  {
    id: 'survey-1',
    name: '第5回現場調査',
    surveyDate: '2024-05-15',
    thumbnailUrl: 'https://example.com/thumb1.jpg',
    imageCount: 10,
    projectId: 'project-123',
    memo: null,
    createdAt: '2024-05-15T00:00:00.000Z',
    updatedAt: '2024-05-15T00:00:00.000Z',
  },
  {
    id: 'survey-2',
    name: '第4回現場調査',
    surveyDate: '2024-04-15',
    thumbnailUrl: null,
    imageCount: 5,
    projectId: 'project-123',
    memo: null,
    createdAt: '2024-04-15T00:00:00.000Z',
    updatedAt: '2024-04-15T00:00:00.000Z',
  },
];

describe('SiteSurveySectionCard', () => {
  const projectId = 'project-123';

  describe('基本表示', () => {
    it('セクションタイトル「現場調査」を表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByText('現場調査')).toBeInTheDocument();
    });

    it('総数を表示する（Requirements: 2.1）', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('直近の現場調査カードを表示する（Requirements: 2.1）', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByText('第5回現場調査')).toBeInTheDocument();
      expect(screen.getByText('第4回現場調査')).toBeInTheDocument();
    });

    it('調査日を表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      // 日付フォーマット: 2024年5月15日
      expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
      expect(screen.getByText(/2024年4月15日/)).toBeInTheDocument();
    });

    it('画像件数を表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByText(/10枚/)).toBeInTheDocument();
      expect(screen.getByText(/5枚/)).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('ヘッダーに「新規作成」ボタンを表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: '現場調査を新規作成' });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/site-surveys/new`);
      expect(link).toHaveTextContent('新規作成');
    });

    it('「すべて見る」リンクが現場調査一覧に遷移する（Requirements: 2.2）', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/site-surveys`);
    });

    it('現場調査カードが詳細画面への遷移リンクを持つ（Requirements: 2.3）', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      // 現場調査詳細へのリンクはプロジェクトIDなしの直接パスに変更（fix(site-survey)コミット）
      // 新規作成ボタンを除外して詳細リンクのみを取得
      const surveyDetailLink = screen.getByRole('link', {
        name: '第5回現場調査の現場調査詳細を見る',
      });
      expect(surveyDetailLink).toHaveAttribute('href', '/site-surveys/survey-1');
    });
  });

  describe('空状態', () => {
    it('現場調査が0件の場合はメッセージを表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={0}
          latestSurveys={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/現場調査はまだありません/)).toBeInTheDocument();
    });

    it('現場調査が0件でも新規作成リンクを表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={0}
          latestSurveys={[]}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /新規作成/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/site-surveys/new`);
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={0}
          latestSurveys={[]}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('site-survey-section-skeleton')).toBeInTheDocument();
    });
  });

  describe('サムネイル画像', () => {
    it('サムネイルURLがある場合は画像を表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(1); // 1つはサムネイルあり、1つはなし
    });

    it('サムネイルURLがない場合はプレースホルダーを表示する', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={1}
          latestSurveys={[mockSurveys[1]!]}
          isLoading={false}
        />
      );

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByTestId('thumbnail-placeholder')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('セクション要素を持つ', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('見出し要素を持つ', () => {
      renderWithRouter(
        <SiteSurveySectionCard
          projectId={projectId}
          totalCount={5}
          latestSurveys={mockSurveys}
          isLoading={false}
        />
      );

      expect(screen.getByRole('heading', { name: '現場調査' })).toBeInTheDocument();
    });
  });
});
