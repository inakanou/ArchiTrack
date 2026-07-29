/**
 * @fileoverview プロジェクト詳細ページの内訳書ナビゲーションテスト
 *
 * Task 11: 内訳書機能のルーティング設定
 * Task 18.1: 新規作成ボタンを専用作成画面へのLinkに変更
 *
 * Requirements:
 * - 3.5: 内訳書行をクリックで詳細画面に遷移する
 * - 11.4: ユーザーが新規作成ボタンをクリックすると、システムは内訳書新規作成画面に遷移する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import type { ProjectDetailSummary } from '../../api/projects';

// APIモック
vi.mock('../../api/projects');

// useAuthフックのモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
}));

// テストデータ
const mockProject = {
  id: 'project-1',
  name: 'テストプロジェクト',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  siteAddress: '東京都渋谷区1-2-3',
  description: 'これはテストプロジェクトの説明です。',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
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
    changedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockQuantityTables = [
  {
    id: 'qt-1',
    projectId: 'project-1',
    name: 'テスト数量表',
    groupCount: 2,
    itemCount: 10,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
];

const defaultSections: ProjectDetailSummary['sections'] = {
  siteSurveys: { totalCount: 0, latestSurveys: [] },
  quantityTables: { totalCount: 1, latestTables: mockQuantityTables },
  itemizedStatements: { totalCount: 0, latestStatements: [] },
  estimateRequests: { totalCount: 0, latestRequests: [] },
  estimates: { totalCount: 0, latestEstimates: [] },
  contracts: { totalCount: 0, latestContracts: [] },
  schedules: { totalCount: 0, latestSchedules: [] },
  executionBudget: null,
  constructionPhotos: { totalCount: 0, latestAlbums: [] },
};

/**
 * デフォルトのProjectDetailSummaryモックデータを生成するヘルパー
 */
function createMockSummary(
  overrides?: Partial<{
    project: typeof mockProject;
    statusHistory: typeof mockStatusHistory;
    sections: Partial<ProjectDetailSummary['sections']>;
  }>
): ProjectDetailSummary {
  return {
    project: overrides?.project ?? mockProject,
    statusHistory: overrides?.statusHistory ?? mockStatusHistory,
    sections: {
      ...defaultSections,
      ...overrides?.sections,
    },
  } as ProjectDetailSummary;
}

// 現在のパスを表示するヘルパーコンポーネント
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

describe('ProjectDetailPage - 内訳書ナビゲーション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createMockSummary());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * テストコンポーネントのラッパー
   */
  function renderWithRouter() {
    return render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <ToastProvider>
          <Routes>
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route
              path="/projects/:projectId/itemized-statements/new"
              element={
                <div>
                  <h1>内訳書新規作成</h1>
                  <LocationDisplay />
                </div>
              }
            />
            <Route
              path="/itemized-statements/:id"
              element={
                <div>
                  <h1>内訳書詳細</h1>
                  <LocationDisplay />
                </div>
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  }

  describe('Task 18.1: 新規作成ボタンで専用作成画面への遷移', () => {
    it('内訳書セクションの新規作成リンクが専用作成画面に遷移する', async () => {
      const user = userEvent.setup();

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書セクションが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();
      });

      // 内訳書セクション内の新規作成リンクを確認
      const itemizedStatementSection = screen.getByTestId('itemized-statement-section');
      const createLink = itemizedStatementSection.querySelector(
        'a[href*="itemized-statements/new"]'
      );
      expect(createLink).not.toBeNull();
      expect(createLink).toHaveAttribute('href', '/projects/project-1/itemized-statements/new');

      // リンクをクリック
      await user.click(createLink!);

      // 内訳書新規作成画面に遷移する
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書新規作成' })).toBeInTheDocument();
        expect(screen.getByTestId('location-display')).toHaveTextContent(
          '/projects/project-1/itemized-statements/new'
        );
      });
    });

    it('内訳書があるときのヘッダーの新規作成リンクも専用作成画面に遷移する', async () => {
      const user = userEvent.setup();
      const mockExistingStatements = [
        {
          id: 'is-1',
          projectId: 'project-1',
          name: '既存内訳書',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: 'テスト数量表',
          itemCount: 15,
          createdAt: '2026-01-18T10:00:00.000Z',
          updatedAt: '2026-01-18T10:00:00.000Z',
        },
      ];
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            itemizedStatements: { totalCount: 1, latestStatements: mockExistingStatements },
          },
        })
      );

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書リストが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('既存内訳書')).toBeInTheDocument();
      });

      // ヘッダーの新規作成リンクを確認
      const createLink = screen.getByRole('link', { name: /内訳書を新規作成/ });
      expect(createLink).toHaveAttribute('href', '/projects/project-1/itemized-statements/new');

      // リンクをクリック
      await user.click(createLink);

      // 内訳書新規作成画面に遷移する
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書新規作成' })).toBeInTheDocument();
        expect(screen.getByTestId('location-display')).toHaveTextContent(
          '/projects/project-1/itemized-statements/new'
        );
      });
    });
  });

  describe('Req 3.5: 内訳書行をクリックで詳細画面に遷移', () => {
    it('既存の内訳書リンクをクリックすると詳細画面に遷移する', async () => {
      const user = userEvent.setup();
      const mockExistingStatements = [
        {
          id: 'is-1',
          projectId: 'project-1',
          name: '既存内訳書',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: 'テスト数量表',
          itemCount: 15,
          createdAt: '2026-01-18T10:00:00.000Z',
          updatedAt: '2026-01-18T10:00:00.000Z',
        },
      ];
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            itemizedStatements: { totalCount: 1, latestStatements: mockExistingStatements },
          },
        })
      );

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書リストが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('既存内訳書')).toBeInTheDocument();
      });

      // 内訳書リンクをクリック
      const statementLink = screen.getByRole('link', { name: /既存内訳書の内訳書詳細を見る/ });
      await user.click(statementLink);

      // 内訳書詳細画面に遷移する
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書詳細' })).toBeInTheDocument();
        expect(screen.getByTestId('location-display')).toHaveTextContent(
          '/itemized-statements/is-1'
        );
      });
    });
  });
});
