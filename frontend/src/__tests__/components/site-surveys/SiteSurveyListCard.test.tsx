/**
 * @fileoverview SiteSurveyListCard コンポーネントのテスト
 *
 * 現場調査一覧カードコンポーネント（モバイル用）のテストを提供します。
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
import SiteSurveyListCard from '../../../components/site-surveys/SiteSurveyListCard';
import type { SiteSurveyInfo } from '../../../types/site-survey.types';

// テスト用モックデータ
const mockSurveys: SiteSurveyInfo[] = [
  {
    id: 'survey-1',
    projectId: 'project-1',
    name: '現場調査A',
    surveyDate: '2025-01-15T00:00:00Z',
    memo: 'テストメモ1',
    thumbnailUrl: 'https://example.com/thumbnail1.jpg',
    imageCount: 5,
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'survey-2',
    projectId: 'project-1',
    name: '現場調査B',
    surveyDate: '2025-02-20T00:00:00Z',
    memo: null,
    thumbnailUrl: null,
    imageCount: 0,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-02-01T00:00:00Z',
  },
  {
    id: 'survey-3',
    projectId: 'project-1',
    name: '現場調査C',
    surveyDate: '2025-03-10T00:00:00Z',
    memo: '長いメモテキストです。これは長いメモのテストです。',
    thumbnailUrl: 'https://example.com/thumbnail3.jpg',
    imageCount: 10,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
  },
];

describe('SiteSurveyListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('一覧表示', () => {
    it('現場調査一覧がカード形式で表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      expect(screen.getByTestId('survey-card-list')).toBeInTheDocument();
      expect(screen.getByTestId('survey-card-survey-1')).toBeInTheDocument();
      expect(screen.getByTestId('survey-card-survey-2')).toBeInTheDocument();
      expect(screen.getByTestId('survey-card-survey-3')).toBeInTheDocument();
    });

    it('現場調査名が表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      expect(screen.getByText('現場調査A')).toBeInTheDocument();
      expect(screen.getByText('現場調査B')).toBeInTheDocument();
      expect(screen.getByText('現場調査C')).toBeInTheDocument();
    });

    it('メモがある場合は表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      expect(screen.getByText('テストメモ1')).toBeInTheDocument();
      expect(
        screen.getByText('長いメモテキストです。これは長いメモのテストです。')
      ).toBeInTheDocument();
    });

    it('画像数が表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const imageCounts = screen.getAllByTestId('image-count');
      expect(imageCounts[0]).toHaveTextContent('5枚');
      expect(imageCounts[1]).toHaveTextContent('0枚');
      expect(imageCounts[2]).toHaveTextContent('10枚');
    });

    it('調査日がYYYY/MM/DD形式で表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      expect(screen.getByText('2025/01/15')).toBeInTheDocument();
      expect(screen.getByText('2025/02/20')).toBeInTheDocument();
      expect(screen.getByText('2025/03/10')).toBeInTheDocument();
    });
  });

  describe('サムネイル表示 (REQ 3.5)', () => {
    it('サムネイルURLがある場合は画像が表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      const img1 = within(card1).getByRole('img');
      expect(img1).toHaveAttribute('src', 'https://example.com/thumbnail1.jpg');
      expect(img1).toHaveAttribute('alt', '現場調査Aのサムネイル');
    });

    it('サムネイルURLがない場合はプレースホルダーが表示される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card2 = screen.getByTestId('survey-card-survey-2');
      const placeholder = within(card2).getByTestId('thumbnail-placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('クリックイベント', () => {
    it('カードをクリックするとonCardClickが呼ばれる', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      await user.click(card1);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith('survey-1');
    });

    it('別のカードをクリックすると正しいIDが渡される', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card2 = screen.getByTestId('survey-card-survey-2');
      await user.click(card2);

      expect(handleClick).toHaveBeenCalledWith('survey-2');

      const card3 = screen.getByTestId('survey-card-survey-3');
      await user.click(card3);

      expect(handleClick).toHaveBeenCalledWith('survey-3');
    });
  });

  describe('キーボードナビゲーション', () => {
    it('Enterキーで選択できる', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      card1.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledWith('survey-1');
    });

    it('スペースキーで選択できる', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      card1.focus();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalledWith('survey-1');
    });

    it('他のキーでは選択されない', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      card1.focus();
      await user.keyboard('{Escape}');

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('アクセシビリティ', () => {
    it('カードにはrole="button"が設定される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const cards = screen.getAllByRole('button');
      expect(cards).toHaveLength(3);
    });

    it('カードにはaria-labelが設定される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      expect(screen.getByLabelText('現場調査Aの詳細を表示')).toBeInTheDocument();
      expect(screen.getByLabelText('現場調査Bの詳細を表示')).toBeInTheDocument();
      expect(screen.getByLabelText('現場調査Cの詳細を表示')).toBeInTheDocument();
    });

    it('カードにはtabIndex=0が設定される', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={mockSurveys} onCardClick={handleClick} />);

      const card1 = screen.getByTestId('survey-card-survey-1');
      expect(card1).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('空のリスト', () => {
    it('空のリストの場合は何も表示されない', () => {
      const handleClick = vi.fn();

      render(<SiteSurveyListCard surveys={[]} onCardClick={handleClick} />);

      const list = screen.getByTestId('survey-card-list');
      expect(list).toBeEmptyDOMElement();
    });
  });

  describe('単一アイテム', () => {
    it('1件のみの場合も正しく表示される', () => {
      const handleClick = vi.fn();
      const singleSurvey: SiteSurveyInfo[] = [mockSurveys[0]!];

      render(<SiteSurveyListCard surveys={singleSurvey} onCardClick={handleClick} />);

      expect(screen.getByTestId('survey-card-survey-1')).toBeInTheDocument();
      expect(screen.queryByTestId('survey-card-survey-2')).not.toBeInTheDocument();
    });
  });
});
