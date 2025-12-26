/**
 * @fileoverview 現場調査一覧ページテスト
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';

// APIモック
vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../hooks/useSiteSurveyPermission');

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

// デフォルトの権限モック
const mockPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  isLoading: false,
  getPermissionError: vi.fn().mockReturnValue(null),
};

describe('SiteSurveyListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSiteSurveys);
    vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(
      mockPermission
    );
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

  describe('権限によるUI制御 (Requirement 12.2)', () => {
    it('作成権限がある場合、新規作成ボタンが表示されること', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canCreate: true,
      });

      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /新規作成/i })).toBeInTheDocument();
      });
    });

    it('作成権限がない場合、新規作成ボタンが非表示になること', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canCreate: false,
      });

      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // 新規作成ボタンが表示されないことを確認
      expect(screen.queryByRole('link', { name: /新規作成/i })).not.toBeInTheDocument();
    });

    it('作成権限がない場合、空状態の新規作成ボタンも非表示になること', async () => {
      vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
        ...mockPermission,
        canCreate: false,
      });
      vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });

      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByText('現場調査がありません')).toBeInTheDocument();
      });

      // 空状態の新規作成ボタンも表示されないことを確認
      expect(screen.queryByRole('link', { name: /新規作成/i })).not.toBeInTheDocument();
    });
  });

  describe('検索・フィルター機能 (Requirements 3.2, 3.3, 3.4)', () => {
    it('検索フォーム送信時にフィルターパラメータが更新されること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // 検索入力
      const searchInput = screen.getByRole('searchbox', { name: '検索' });
      await user.type(searchInput, '調査A');

      // 検索ボタンクリック
      const searchButton = screen.getByRole('button', { name: '検索' });
      await user.click(searchButton);

      // APIが再度呼び出されること（フィルターが適用される）
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({
            filter: { search: '調査A' },
          })
        );
      });
    });

    it('日付フィルター変更時にAPIが再取得されること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // API呼び出し回数をリセット
      vi.mocked(siteSurveysApi.getSiteSurveys).mockClear();

      // 日付フィルター入力
      const dateFromInput = screen.getByLabelText('調査日開始');
      await user.type(dateFromInput, '2024-01-01');

      // APIが再取得されること
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({
            filter: { surveyDateFrom: '2024-01-01' },
          })
        );
      });
    });

    it('ソートフィールド変更時にAPIが再取得されること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // API呼び出し回数をリセット
      vi.mocked(siteSurveysApi.getSiteSurveys).mockClear();

      // ソートフィールド変更
      const sortFieldSelect = screen.getByLabelText('ソート項目');
      await user.selectOptions(sortFieldSelect, 'createdAt');

      // APIが再取得されること
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({
            sort: 'createdAt',
          })
        );
      });
    });

    it('ソート順序変更時にAPIが再取得されること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // API呼び出し回数をリセット
      vi.mocked(siteSurveysApi.getSiteSurveys).mockClear();

      // ソート順序変更
      const sortOrderSelect = screen.getByLabelText('ソート順序');
      await user.selectOptions(sortOrderSelect, 'asc');

      // APIが再取得されること
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({
            order: 'asc',
          })
        );
      });
    });

    it('クリアボタンクリック時にフィルターがリセットされること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/site-surveys');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /現場調査/i })).toBeInTheDocument();
      });

      // 検索入力
      const searchInput = screen.getByRole('searchbox', { name: '検索' });
      await user.type(searchInput, '調査A');

      // クリアボタンクリック
      const clearButton = screen.getByRole('button', { name: 'クリア' });
      await user.click(clearButton);

      // 検索入力がクリアされること
      expect(searchInput).toHaveValue('');

      // デフォルトのソート設定でAPIが呼び出されること
      await waitFor(() => {
        expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({
            filter: {},
            sort: 'surveyDate',
            order: 'desc',
          })
        );
      });
    });
  });

  describe('エラー状態からの再試行', () => {
    it('再試行ボタンクリック時にデータが再取得されること', async () => {
      const user = userEvent.setup({ delay: null });

      // 初回はエラー
      vi.mocked(projectsApi.getProject).mockRejectedValueOnce(
        new Error('データ取得に失敗しました')
      );

      renderWithRouter('/projects/project-123/site-surveys');

      // エラー表示を待つ
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // 成功するようにモックを再設定
      vi.mocked(projectsApi.getProject).mockResolvedValueOnce(mockProject);

      // 再試行ボタンクリック
      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);

      // APIが再度呼び出されること
      await waitFor(() => {
        expect(projectsApi.getProject).toHaveBeenCalledTimes(2);
      });
    });
  });
});
