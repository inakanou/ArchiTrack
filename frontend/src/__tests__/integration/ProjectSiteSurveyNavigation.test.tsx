/**
 * @fileoverview プロジェクト詳細と現場調査の連携テスト
 *
 * Task 22.2: プロジェクト詳細画面との連携を実装する
 *
 * Requirements:
 * - 2.1: ユーザーがプロジェクト詳細画面を表示すると「現場調査」タブまたはセクションを表示する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';

// APIモック
vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../api/trading-partners');

// useAuthフックのモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
}));

// モックデータ
const mockProject = {
  id: 'project-test-123',
  name: '連携テストプロジェクト',
  description: 'プロジェクトと現場調査の連携テスト用',
  status: 'SURVEYING' as const,
  statusLabel: '調査中',
  siteAddress: '東京都新宿区1-1-1',
  tradingPartnerId: 'tp-1',
  tradingPartner: { id: 'tp-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
};

const mockStatusHistory = [
  {
    id: 'history-1',
    fromStatus: null,
    fromStatusLabel: null,
    toStatus: 'PREPARING' as const,
    toStatusLabel: '準備中',
    transitionType: 'initial' as const,
    transitionTypeLabel: '初期遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: '営業太郎' },
    changedAt: '2024-01-01T00:00:00.000Z',
  },
];

const mockSiteSurveys = {
  data: [
    {
      id: 'survey-1',
      projectId: 'project-test-123',
      name: '第1回現場調査',
      surveyDate: '2024-01-15',
      memo: 'テストメモ1',
      thumbnailUrl: null,
      imageCount: 3,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: 'survey-2',
      projectId: 'project-test-123',
      name: '第2回現場調査',
      surveyDate: '2024-02-01',
      memo: 'テストメモ2',
      thumbnailUrl: null,
      imageCount: 5,
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 50,
    total: 2,
    totalPages: 1,
  },
};

/**
 * 統合テスト用のレンダラー
 * プロジェクト詳細から現場調査一覧へのナビゲーションをテスト可能
 */
function renderIntegration(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/site-surveys" element={<SiteSurveyListPage />} />
          <Route path="/projects/:projectId/site-surveys/new" element={<div>新規作成ページ</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('プロジェクト詳細と現場調査の連携（Task 22.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(projectsApi.getStatusHistory).mockResolvedValue(mockStatusHistory);
    vi.mocked(projectsApi.getAssignableUsers).mockResolvedValue([]);
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

  // ==========================================================================
  // Requirements 2.1: プロジェクト詳細画面での現場調査セクション
  // ==========================================================================

  describe('プロジェクト詳細画面での現場調査セクション (Requirements 2.1)', () => {
    it('プロジェクト詳細画面に「現場調査」セクションが表示される', async () => {
      renderIntegration('/projects/project-test-123');

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '連携テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 現場調査セクションの見出しが存在
      expect(screen.getByRole('heading', { level: 2, name: '現場調査' })).toBeInTheDocument();
    });

    it('現場調査一覧へのリンクが正しいURLを持つ', async () => {
      renderIntegration('/projects/project-test-123');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const listLink = screen.getByRole('link', { name: /現場調査一覧/ });
      expect(listLink).toHaveAttribute('href', '/projects/project-test-123/site-surveys');
    });

    it('新規作成リンクが正しいURLを持つ', async () => {
      renderIntegration('/projects/project-test-123');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const createLink = screen.getByRole('link', { name: /新規作成/ });
      expect(createLink).toHaveAttribute('href', '/projects/project-test-123/site-surveys/new');
    });

    it('現場調査一覧リンクをクリックして現場調査一覧ページへ遷移できる', async () => {
      const user = userEvent.setup();
      renderIntegration('/projects/project-test-123');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const listLink = screen.getByRole('link', { name: /現場調査一覧/ });
      await user.click(listLink);

      // 現場調査一覧ページへ遷移
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: '現場調査' })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Requirements 2.5, 2.6, 2.7: ブレッドクラムナビゲーション
  // ==========================================================================

  describe('現場調査一覧でのブレッドクラムナビゲーション (Requirements 2.5, 2.6, 2.7)', () => {
    it('現場調査一覧ページにブレッドクラムナビゲーションが表示される', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        expect(
          screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
        ).toBeInTheDocument();
      });
    });

    it('ブレッドクラムにプロジェクト名が表示される (Requirements 2.6)', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(
          within(nav).getByRole('link', { name: '連携テストプロジェクト' })
        ).toBeInTheDocument();
      });
    });

    it('プロジェクト名リンクをクリックするとプロジェクト詳細へ遷移する (Requirements 2.7)', async () => {
      const user = userEvent.setup();
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: '現場調査' })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const projectLink = within(nav).getByRole('link', { name: '連携テストプロジェクト' });
      await user.click(projectLink);

      // プロジェクト詳細ページへ遷移
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '連携テストプロジェクト' })
        ).toBeInTheDocument();
      });
    });

    it('ブレッドクラムにダッシュボードリンクが存在する', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const dashboardLink = within(nav).getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('ブレッドクラムにプロジェクト一覧リンクが存在する', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectsLink = within(nav).getByRole('link', { name: 'プロジェクト' });
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('現在のページ「現場調査」はリンクではない', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        expect(
          screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
        ).toBeInTheDocument();
      });

      // 「現場調査」はリンクではない
      expect(screen.queryByRole('link', { name: '現場調査' })).not.toBeInTheDocument();
    });

    it('現在のページにaria-current="page"が設定されている', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const currentItem = nav.querySelector('[aria-current="page"]');
        expect(currentItem).toBeInTheDocument();
        expect(currentItem).toHaveTextContent('現場調査');
      });
    });
  });

  // ==========================================================================
  // 双方向ナビゲーションの統合テスト
  // ==========================================================================

  describe('双方向ナビゲーション統合テスト', () => {
    it('プロジェクト詳細 → 現場調査一覧 → プロジェクト詳細と遷移できる', async () => {
      const user = userEvent.setup();
      renderIntegration('/projects/project-test-123');

      // Step 1: プロジェクト詳細画面を確認
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '連携テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // Step 2: 現場調査一覧リンクをクリック
      const listLink = screen.getByRole('link', { name: /現場調査一覧/ });
      await user.click(listLink);

      // Step 3: 現場調査一覧ページへ遷移したことを確認
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: '現場調査' })).toBeInTheDocument();
      });

      // Step 4: ブレッドクラムからプロジェクト詳細へ戻る
      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const projectLink = within(nav).getByRole('link', { name: '連携テストプロジェクト' });
      await user.click(projectLink);

      // Step 5: プロジェクト詳細ページへ戻ったことを確認
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '連携テストプロジェクト' })
        ).toBeInTheDocument();
      });
    });

    it('現場調査一覧ページで現場調査データが表示される', async () => {
      renderIntegration('/projects/project-test-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: '現場調査' })).toBeInTheDocument();
      });

      // 現場調査一覧APIが呼び出されている
      expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
        'project-test-123',
        expect.any(Object)
      );
    });
  });
});
