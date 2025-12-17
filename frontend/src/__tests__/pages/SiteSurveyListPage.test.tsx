/**
 * @fileoverview 現場調査一覧ページテスト
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';

// APIモック
vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');

// モックデータ
const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト説明',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'tp-1',
  tradingPartner: { id: 'tp-1', name: '取引先A', nameKana: 'トリヒキサキエー' },
  salesPerson: { id: 'user-1', displayName: '営業担当A' },
  constructionPerson: undefined,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockSiteSurveys = {
  data: [
    {
      id: 'survey-1',
      projectId: 'project-123',
      name: '第1回現場調査',
      surveyDate: '2024-01-15',
      memo: 'テストメモ',
      thumbnailUrl: null,
      imageCount: 0,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
  },
};

// テストヘルパー
const renderWithRouter = (initialEntry: string) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/projects/:projectId/site-surveys" element={<SiteSurveyListPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('SiteSurveyListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSiteSurveys);
    // window.matchMediaのモック
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
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

  describe('ブレッドクラムナビゲーション (Requirements 2.5, 2.6, 2.7)', () => {
    it('パンくずナビゲーションが表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(
          screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
        ).toBeInTheDocument();
      });
    });

    it('ダッシュボードへのリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toBeInTheDocument();
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('プロジェクト一覧へのリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト' });
        expect(projectsLink).toBeInTheDocument();
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('プロジェクト詳細へのリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        const projectLink = screen.getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toBeInTheDocument();
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('現在のページ「現場調査」がリンクなしで表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        // ブレッドクラム内のナビゲーション要素を取得
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });

      // 現在のページはリンクではない（ブレッドクラム内に「現場調査」リンクがないこと）
      expect(screen.queryByRole('link', { name: '現場調査' })).not.toBeInTheDocument();
    });

    it('aria-current="page"が現在のページに設定されていること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        // ブレッドクラム内のナビゲーション要素を取得
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        // ナビゲーション内でaria-current="page"を持つ要素を検索
        const currentItem = nav.querySelector('[aria-current="page"]');
        expect(currentItem).toBeInTheDocument();
        expect(currentItem).toHaveTextContent('現場調査');
      });
    });
  });

  describe('ページコンテンツ', () => {
    it('ページタイトルが表示されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });
    });

    it('プロジェクトAPIが呼び出されること', async () => {
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(projectsApi.getProject).toHaveBeenCalledWith('project-123');
      });
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中はローディング表示されること', async () => {
      vi.mocked(projectsApi.getProject).mockImplementation(() => new Promise(() => {}));

      renderWithRouter('/projects/project-123/site-surveys');

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('プロジェクト取得エラー時にエラーメッセージが表示されること', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(
        new Error('プロジェクトが見つかりません')
      );

      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });
});
